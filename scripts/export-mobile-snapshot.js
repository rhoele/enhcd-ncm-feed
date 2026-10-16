#!/usr/bin/env node
/**
 * export-mobile-snapshot.js
 *
 * 从本地扫描缓存导出「移动端静态快照」，供 GitHub Pages 上的前端只读浏览。
 *
 * 输入（默认取项目根目录）：
 *   data/VA_Owned_Album_Cache.json   —— 每个关注艺人的所属专辑快照（含 publishTime / artists）
 *   data/VA_Album_Date_Cache.json    —— 专辑发行日期与厂牌（可选，用于补充 label/company）
 *   my_artists.json                  —— 额外关注的艺人（name -> artistId），用于生成艺人清单
 *
 * 输出（默认写到 ghpages 目录 data/mobile/，格式见 lib/mobile-snapshot.js）：
 *   data/mobile/index.json
 *   data/mobile/YYYY-MM-DD.json
 *   data/mobile/artists.json         —— 云端 Actions 扫描用的艺人清单
 *
 * 用法：
 *   node scripts/export-mobile-snapshot.js                  # 最近 7 天，写入 ghpages
 *   node scripts/export-mobile-snapshot.js --days 3
 *   node scripts/export-mobile-snapshot.js --out D:\some\dir
 *   node scripts/export-mobile-snapshot.js --src C:\repo
 *   node scripts/export-mobile-snapshot.js --keep-old       # 不清理过期快照
 *   node scripts/export-mobile-snapshot.js --va-api http://127.0.0.1:8001   # 合并本地后端的「合辑参与」结果
 *   node scripts/export-mobile-snapshot.js --no-compilations               # 只导出新作，不含合辑
 *
 * 「合辑参与」结果不落盘（只存在于本地后端内存里），因此这里在导出时顺带从
 * start-static.js 的 /api/va-scan/status 拉一次；拉不到就只导出新作，不影响主流程。
 */
const fs = require('fs');
const path = require('path');
const {
  createCollector,
  writeSnapshot,
  writeArtistIds
} = require('./lib/mobile-snapshot');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_DST_DIR = (function () {
  const try1 = path.join(ROOT, '..', 'netease-artist-feed-ghpages');
  const try2 = 'd:\\netease-artist-feed-ghpages';
  const try3 = path.join(ROOT, 'ghpages-out');
  if (fs.existsSync(try1)) return path.resolve(try1);
  if (fs.existsSync(try2)) return path.resolve(try2);
  return try3;
})();

const args = process.argv.slice(2);
function pickArg(name, fallback) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  return args[i + 1] || fallback;
}

const SRC_DIR = path.resolve(pickArg('--src', ROOT));
const PRUNE = !args.includes('--keep-old');
const DST_DIR = path.resolve(process.env.NAF_GHPAGES_DIR || pickArg('--out', DEFAULT_DST_DIR));
const DST_MOBILE_DIR = path.join(DST_DIR, 'data', 'mobile');
const DAYS = Math.max(1, Math.min(60, parseInt(pickArg('--days', '7'), 10) || 7));
// 本地后端「合辑参与」结果来源（start-static.js 的 /api/va-scan/status）
const VA_API = String(pickArg('--va-api', process.env.NAF_VA_API || 'http://127.0.0.1:8001')).replace(/\/$/, '');
const COMPILATIONS = !args.includes('--no-compilations');

function readJson(p) {
  if (!p || !fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {
    console.warn('[WARN] 解析失败 ' + p + '：' + e.message);
    return null;
  }
}

/** 拉取本地后端的「合辑参与」结果；后端没起或超时则返回空数组 */
async function fetchVaScanResults() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(VA_API + '/api/va-scan/status', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    return Array.isArray(json && json.results) ? json.results : [];
  } catch (e) {
    console.warn('[WARN] 未取到本地合辑结果（' + VA_API + '）：' + e.message);
    return [];
  }
}

// ========== 1. 读缓存 ==========
const ownedRaw = readJson(path.join(SRC_DIR, 'data', 'VA_Owned_Album_Cache.json'));
if (!ownedRaw) {
  console.error('[ERROR] 未找到 data/VA_Owned_Album_Cache.json（源目录：' + SRC_DIR + '）');
  process.exit(1);
}
const ownedItems = ownedRaw.items && typeof ownedRaw.items === 'object' ? ownedRaw.items : ownedRaw;
const dateRaw = readJson(path.join(SRC_DIR, 'data', 'VA_Album_Date_Cache.json'));
const dateItems = dateRaw && dateRaw.items ? dateRaw.items : (dateRaw || {});
const myArtists = readJson(path.join(SRC_DIR, 'my_artists.json')) || {};

// ========== 2. 按日期聚合 ==========
const collector = createCollector(DAYS);
const allArtistIds = new Set();
let scannedAlbums = 0;

for (const artistId of Object.keys(ownedItems)) {
  const numericId = Number(artistId);
  if (numericId > 0) allArtistIds.add(numericId);

  const entry = ownedItems[artistId];
  const albums = entry && Array.isArray(entry.albums) ? entry.albums : [];
  scannedAlbums += albums.length;

  for (const album of albums) {
    const meta = dateItems[String(Number(album && album.id) || 0)] || {};
    collector.add(album, artistId, meta.company);
  }
}

// my_artists.json 是 name -> artistId，作为补充来源一并纳入清单
for (const name of Object.keys(myArtists)) {
  const id = Number(myArtists[name]);
  if (id > 0) allArtistIds.add(id);
}

(async () => {
  // ========== 2.5 合辑参与（本地后端结果，可选） ==========
  let compTotal = 0;
  let compAdded = 0;
  if (COMPILATIONS) {
    const vaResults = await fetchVaScanResults();
    compTotal = vaResults.length;
    for (const r of vaResults) {
      const albumId = Number(r && r.albumId) || 0;
      const ts = Number(r && r.publishTime) || 0;
      if (!albumId || !ts) continue;
      const meta = dateItems[String(albumId)] || {};
      if (collector.addCompilation({
        id: albumId,
        name: String(r.albumName || '未知专辑'),
        picUrl: String(r.albumPicUrl || ''),
        publishTime: ts,
        artistId: Number(r.artistId) || 0,
        artistName: String(r.artistName || '').trim(),
        albumArtists: Array.isArray(meta.albumArtists) ? meta.albumArtists : [],
        company: String(meta.company || '').trim(),
        track: {
          id: Number(r.songId) || 0,
          name: String(r.songName || '未命名单曲'),
          artists: '',
          link: String(r.songLink || '')
        }
      })) compAdded += 1;
    }
  }

  // ========== 3. 写文件 ==========
  const artistIds = Array.from(allArtistIds);
  writeArtistIds(DST_MOBILE_DIR, artistIds);
  const { indexDates, indexPayload, pruned } = writeSnapshot({
    dstMobileDir: DST_MOBILE_DIR,
    collector,
    days: DAYS,
    artistCount: artistIds.length,
    albumCount: scannedAlbums,
    prune: PRUNE
  });

  const compilationCount = Array.from(collector.byDay.values())
    .reduce((n, b) => n + Array.from(b.values()).filter(i => i.resultTab === 'compilation').length, 0);

  console.log('移动端快照已生成：' + DST_MOBILE_DIR);
  console.log('  扫描艺人：' + artistIds.length + ' 个，所属专辑：' + scannedAlbums + ' 张');
  console.log('  日期窗口：最近 ' + DAYS + ' 天');
  for (const d of indexDates) console.log('    ' + d.date + ' → ' + d.count + ' 条');
  if (COMPILATIONS) {
    console.log('  合辑参与：后端返回 ' + compTotal + ' 条，窗口内收录 ' + compAdded + ' 条（快照内合辑合计 ' + compilationCount + ' 条）');
  } else {
    console.log('  合辑参与：已跳过（--no-compilations）');
  }
  if (pruned) console.log('  已清理过期快照：' + pruned + ' 个文件');
  console.log('  艺人清单：' + path.join(DST_MOBILE_DIR, 'artists.json') + '（' + artistIds.length + ' 个）');
  console.log('  索引文件：' + path.join(DST_MOBILE_DIR, 'index.json'));
})();
