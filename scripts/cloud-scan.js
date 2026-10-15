#!/usr/bin/env node
/**
 * [部署副本] 源文件：c:\netease-artist-feed\scripts\cloud-scan.js
 * 改动请同步回源文件，避免与本地项目里的 lib/mobile-snapshot.js 格式漂移。
 *
 * cloud-scan.js
 *
 * 云端（GitHub Actions）逐艺人扫描，产出与本地 export-mobile-snapshot.js 完全同构的
 * data/mobile/ 静态快照，供移动端只读浏览。
 *
 * 扫描逻辑复刻本地 start-static.js 的 fetchArtistOwnedAlbumSnapshotBackend：
 *   对每个艺人调 GET {api}/artist/album?id=<id>&limit=100，取 hotAlbums，按发行日期归档。
 *
 * 注意：网易云 /album/new 只是「精选子集」（实测仅覆盖本地新作的 1.4%），因此这里
 *       不使用该接口，而是逐艺人全量扫描。
 *
 * 用法：
 *   node scripts/cloud-scan.js                                  # 扫全部艺人，写到 --out
 *   node scripts/cloud-scan.js --out . --api http://127.0.0.1:3100
 *   node scripts/cloud-scan.js --max-artists 200 --concurrency 8   # 小批量试跑
 *   node scripts/cloud-scan.js --cookie "$NETEASE_MUSIC_U"
 */
const fs = require('fs');
const path = require('path');
const {
  createCollector,
  writeSnapshot,
  readArtistIds,
  ARTISTS_FILE
} = require('./lib/mobile-snapshot');

const args = process.argv.slice(2);
function pickArg(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  return (v === undefined || v === '' || v.startsWith('--')) ? fallback : v;
}

const API = (pickArg('--api', process.env.NAF_CLOUD_API || 'http://127.0.0.1:3100')).replace(/\/$/, '');
const DST_DIR = path.resolve(pickArg('--out', process.env.NAF_GHPAGES_DIR || '.'));
const DST_MOBILE_DIR = path.join(DST_DIR, 'data', 'mobile');
const DAYS = Math.max(1, Math.min(60, parseInt(pickArg('--days', '7'), 10) || 7));
const CONCURRENCY = Math.max(1, Math.min(32, parseInt(pickArg('--concurrency', '6'), 10) || 6));
const ALBUM_LIMIT = Math.max(1, Math.min(200, parseInt(pickArg('--limit', '100'), 10) || 100));
const MAX_ARTISTS = Math.max(0, parseInt(pickArg('--max-artists', '0'), 10) || 0);
const TIMEOUT_MS = Math.max(3000, parseInt(pickArg('--timeout', '15000'), 10) || 15000);
const COOKIE = pickArg('--cookie', process.env.NAF_NCM_COOKIE || '');
const PRUNE = !args.includes('--keep-old');
const ENRICH = !args.includes('--no-enrich');
const ARTISTS_FILE_PATH = path.resolve(pickArg('--artists', path.join(DST_MOBILE_DIR, ARTISTS_FILE)));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchArtistAlbums(artistId) {
  const url = new URL(API + '/artist/album');
  url.searchParams.set('id', String(artistId));
  url.searchParams.set('limit', String(ALBUM_LIMIT));
  if (COOKIE) url.searchParams.set('cookie', COOKIE);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (Number(json.code) !== 200) throw new Error('code=' + json.code);
    const list = Array.isArray(json.hotAlbums) ? json.hotAlbums
      : (Array.isArray(json.albums) ? json.albums : []);
    return list.map(item => ({
      id: Number(item && item.id) || 0,
      name: String((item && item.name) || ''),
      picUrl: String((item && item.picUrl) || ''),
      publishTime: Number(item && item.publishTime) || 0,
      // /artist/album 返回的是艺人对象数组，这里只保留名字以对齐本地缓存结构
      artists: (Array.isArray(item && item.artists) ? item.artists : [])
        .map(a => String((a && a.name) || '').trim())
        .filter(Boolean)
    })).filter(a => a.id > 0);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(artistId, attempts) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fetchArtistAlbums(artistId);
    } catch (e) {
      lastErr = e;
      if (i < attempts) await sleep(400 * i);
    }
  }
  throw lastErr || new Error('unknown');
}

/** 补齐厂牌信息（对齐本地 VA_Album_Date_Cache 里的 company 字段） */
async function fetchAlbumCompany(albumId) {
  const url = new URL(API + '/album');
  url.searchParams.set('id', String(albumId));
  if (COOKIE) url.searchParams.set('cookie', COOKIE);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return '';
    const json = await res.json();
    return String(json?.album?.company || '').trim();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function enrichCompanies(collector) {
  const items = [];
  for (const bucket of collector.byDay.values()) {
    for (const item of bucket.values()) items.push(item);
  }
  if (!items.length) return 0;
  let cursor = 0;
  let filled = 0;
  async function worker() {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      const company = await fetchAlbumCompany(items[i].id);
      if (company) {
        items[i].company = company;
        items[i].label = company;
        filled += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return filled;
}

(async () => {
  const ids = readArtistIds(ARTISTS_FILE_PATH);
  if (!ids || !ids.length) {
    console.error('[ERROR] 未找到艺人清单：' + ARTISTS_FILE_PATH);
    console.error('        先在本地跑 node scripts/export-mobile-snapshot.js 生成 data/mobile/artists.json');
    process.exit(1);
  }
  const targets = MAX_ARTISTS > 0 ? ids.slice(0, MAX_ARTISTS) : ids;

  console.log('云端扫描开始');
  console.log('  API        : ' + API);
  console.log('  输出目录   : ' + DST_MOBILE_DIR);
  console.log('  艺人清单   : ' + ARTISTS_FILE_PATH + '（共 ' + ids.length + '，本轮扫 ' + targets.length + '）');
  console.log('  并发/天数  : ' + CONCURRENCY + ' / ' + DAYS + ' 天');
  console.log('  Cookie     : ' + (COOKIE ? '已提供' : '无（匿名）'));

  const collector = createCollector(DAYS);
  let done = 0;
  let okCount = 0;
  let failCount = 0;
  let albumSeen = 0;
  const failedIds = [];
  const t0 = Date.now();

  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= targets.length) return;
      const artistId = targets[i];
      try {
        const albums = await fetchWithRetry(artistId, 2);
        okCount += 1;
        albumSeen += albums.length;
        for (const album of albums) collector.add(album, artistId, '');
      } catch (e) {
        failCount += 1;
        if (failedIds.length < 30) failedIds.push(artistId);
      }
      done += 1;
      if (done % 200 === 0 || done === targets.length) {
        const secs = (Date.now() - t0) / 1000;
        const rate = done / (secs || 1);
        const eta = rate > 0 ? Math.round((targets.length - done) / rate) : 0;
        console.log('  进度 ' + done + '/' + targets.length
          + '（成功 ' + okCount + '，失败 ' + failCount + '，命中 ' + collector.hitCount + '）'
          + ' 用时 ' + secs.toFixed(0) + 's，预计剩余 ' + eta + 's');
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  const elapsedScan = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n逐艺人扫描完成，用时 ' + elapsedScan + 's'
    + '（成功 ' + okCount + ' / 失败 ' + failCount + '，抓取专辑 ' + albumSeen + ' 张）');

  let companyFilled = 0;
  if (ENRICH && collector.hitCount > 0) {
    console.log('  补齐厂牌信息（' + collector.hitCount + ' 张专辑）…');
    companyFilled = await enrichCompanies(collector);
    console.log('  厂牌补齐：' + companyFilled + ' / ' + collector.hitCount);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const { indexDates, indexPayload, pruned } = writeSnapshot({
    dstMobileDir: DST_MOBILE_DIR,
    collector,
    days: DAYS,
    artistCount: targets.length,
    albumCount: albumSeen,
    prune: PRUNE
  });

  console.log('\n云端扫描完成，用时 ' + elapsed + 's');
  console.log('  成功 ' + okCount + ' / 失败 ' + failCount + '，抓取专辑 ' + albumSeen + ' 张');
  console.log('  命中近 ' + DAYS + ' 天新作 ' + collector.hitCount + ' 张');
  for (const d of indexDates) console.log('    ' + d.date + ' → ' + d.count + ' 条');
  if (pruned) console.log('  已清理过期快照：' + pruned + ' 个文件');
  console.log('  索引：' + path.join(DST_MOBILE_DIR, 'index.json')
    + '（latest_date=' + indexPayload.latest_date + '）');
  if (failedIds.length) console.log('  失败样例：' + failedIds.slice(0, 10).join(','));

  // 全部失败说明是环境问题（API 未起 / 被墙），让 workflow 失败以便告警
  if (okCount === 0) {
    console.error('[ERROR] 全部请求失败，请检查 API 是否可用：' + API);
    process.exit(2);
  }
  if (failCount > okCount) {
    console.error('[ERROR] 失败数超过成功数，疑似被限流');
    process.exit(3);
  }
})();
