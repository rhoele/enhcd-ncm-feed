#!/usr/bin/env node
/**
 * cloud-scan.js
 *
 * 云端（GitHub Actions）逐艺人扫描，产出与本地 export-mobile-snapshot.js 完全同构的
 * data/mobile/ 静态快照，供移动端只读浏览。
 *
 * 扫描逻辑复刻本地 start-static.js 的 fetchArtistOwnedAlbumSnapshotBackend：
 *   对每个艺人调 GET {api}/artist/album?id=<id>&limit=100，取 hotAlbums，按发行日期归档。
 *
 * 「合辑参与」另走一条通道（复刻 start-static.js 的 scanArtistCompilationBackend）：
 *   GET /artist/songs?id=<id>&order=time 取近期单曲，其中不属于本人 hotAlbums 的候选专辑
 *   再逐个 GET /album?id 拿发行时间；落在窗口内的记为该艺人参与的合辑。
 *   实测每位艺人约产生 5 个候选专辑，全量一次要 6.9 万请求（约 3 小时），远超单 job 上限，
 *   因此按 --compilation-shards 轮转分片：每次只扫 1/N 的艺人，并把已确认的专辑发行日期
 *   写进 data/mobile/album-dates.json，跨次累积（旧专辑第二次就直接跳过，不再请求 /album）。
 *
 * 注意：网易云 /album/new 只是「精选子集」（实测仅覆盖本地新作的 1.4%），因此这里
 *       不使用该接口，而是逐艺人全量扫描。
 *
 * 用法：
 *   node scripts/cloud-scan.js                                  # 扫全部艺人，写到 --out
 *   node scripts/cloud-scan.js --out . --api http://127.0.0.1:3100
 *   node scripts/cloud-scan.js --max-artists 200 --concurrency 8   # 小批量试跑
 *   node scripts/cloud-scan.js --cookie "$NETEASE_MUSIC_U"
 *   node scripts/cloud-scan.js --no-compilations                   # 只扫新作，跳过合辑
 *   node scripts/cloud-scan.js --compilation-shards 8              # 合辑分 8 片轮转
 *   node scripts/cloud-scan.js --push-every 180                    # 扫描中每 3 分钟增量推一次
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { NcmReadClient } = require('./lib/ncm-read-client');
const {
  createCollector,
  writeSnapshot,
  writeProgress,
  readArtistIds,
  loadExistingInto,
  readAlbumDates,
  writeAlbumDates,
  beijingDayKey,
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
const apiClient = new NcmReadClient({ base: API, cookie: COOKIE, timeout: TIMEOUT_MS });
// 「合辑参与」通道：默认开启，按分片轮转以控制在单 job 时间内
const COMPILATIONS = !args.includes('--no-compilations');
const COMPILATION_SHARDS = Math.max(1, Math.min(60, parseInt(pickArg('--compilation-shards', '8'), 10) || 8));
const SONGS_LIMIT = Math.max(1, Math.min(200, parseInt(pickArg('--songs-limit', '30'), 10) || 30));
// 合辑阶段的硬预算：超时即停，剩下的艺人交给下一次轮转
const COMPILATION_BUDGET_MS = Math.max(60, parseInt(pickArg('--compilation-budget-sec', '1800'), 10) || 1800) * 1000;
// 部分扫描（--max-artists > 0，试跑用）不能代表全量结果：
//   1) 必须合并已有快照，否则会把线上完整数据冲成一小撮
//   2) 必须关闭清理，否则没扫到的日期文件会被删掉
const PARTIAL = MAX_ARTISTS > 0;
const MERGE = PARTIAL || args.includes('--merge');
const PRUNE = !PARTIAL && !args.includes('--keep-old');
const ENRICH = !args.includes('--no-enrich');
const ARTISTS_FILE_PATH = path.resolve(pickArg('--artists', path.join(DST_MOBILE_DIR, ARTISTS_FILE)));
// 扫描过程中的增量发布间隔（秒）。0 = 关闭（本地跑不需要，只有 Actions 要边扫边让页面看到结果）。
// 整轮只保留一个提交（后续用 --amend 覆盖），所以不会把仓库历史刷爆。
const PUSH_EVERY_MS = Math.max(0, Math.round((parseFloat(pickArg('--push-every', '0')) || 0) * 1000));
// 增量落盘（写快照 + progress.json）的最小间隔，避免每 200 位艺人就把 8 个日期文件重写一遍
const FLUSH_EVERY_MS = 30000;
const SCAN_STARTED_AT = new Date().toISOString();

function readPrevIndex() {
  try { return JSON.parse(fs.readFileSync(path.join(DST_MOBILE_DIR, 'index.json'), 'utf8')); } catch { return null; }
}

// ===== 扫描过程中的增量发布 =====
// 只读页面看不到 Actions 的日志，只能在扫描过程中把 data/mobile 增量推到远端，
// 页面才能「进度条往前走 + 当天卡片逐个出现」。本地跑时 --push-every 默认为 0，不做任何 git 操作。
// 为了让仓库历史只多出一个提交，第 2 次起改用 git commit --amend 覆盖同一个提交，
// 并用 --force-with-lease 推送：万一期间有人（本机）也推过，租约失效会安全地拒绝推送，
// 不会覆盖别人；此时交给 workflow 末尾的正常 pull --rebase + push 兜底。
let pushInFlight = false;
let pushCommitReady = false;
let lastPushAt = 0;

function publishProgress(message, force) {
  if (!PUSH_EVERY_MS || pushInFlight) return;
  if (!force && lastPushAt && Date.now() - lastPushAt < PUSH_EVERY_MS) return;
  pushInFlight = true;
  lastPushAt = Date.now();
  const git = (...a) => execFileSync('git', ['-C', DST_DIR, ...a], { stdio: 'pipe', encoding: 'utf8' });
  try {
    let branch = 'gh-pages';
    try { branch = (git('rev-parse', '--abbrev-ref', 'HEAD') || '').trim() || branch; } catch {}
    git('add', '--', 'data/mobile');
    let staged = true;
    try { git('diff', '--cached', '--quiet'); staged = false; } catch { staged = true; }
    if (staged) {
      if (pushCommitReady) git('commit', '--amend', '--no-verify', '-m', message);
      else git('commit', '--no-verify', '-m', message);
      pushCommitReady = true;
    }
    if (!staged && !pushCommitReady) return;
    // 推送最多重试 3 轮：网络抖动直接重试，租约失效则先同步远端再把自己的提交 rebase 上去。
    // 单轮失败不再让这次增量白丢——数据已在本地，下一轮 flush 会连它一起推。
    let pushed = false;
    for (let attempt = 1; attempt <= 3 && !pushed; attempt++) {
      try {
        git('push', '--force-with-lease', 'origin', 'HEAD:' + branch);
        pushed = true;
      } catch (e) {
        if (attempt === 3) throw e;
        try { git('fetch', 'origin', branch); git('rebase', 'origin/' + branch); } catch {}
      }
    }
    console.log('  [增量发布] ' + message);
  } catch (e) {
    console.warn('[WARN] 增量发布失败（不影响扫描）：' + String(e.message || e).split('\n')[0]);
  } finally {
    pushInFlight = false;
  }
}

// 进度条总进度：阶段一（逐艺人新作）0~70%、阶段二（合辑）70~95%、补厂牌 95~100%
function phasePercent(phase, doneCount, totalCount) {
  const ratio = totalCount > 0 ? Math.max(0, Math.min(1, doneCount / totalCount)) : 0;
  if (phase === 'new') return Math.round(ratio * 70);
  if (phase === 'compilation') return 70 + Math.round(ratio * 25);
  if (phase === 'enrich') return 95;
  return 100;
}

async function fetchArtistAlbums(artistId) {
    const json = await apiClient.read('/artist/album', { id: artistId, limit: ALBUM_LIMIT });
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
}

/** 取艺人最近单曲（order=time），用于「合辑参与」的候选专辑 */
async function fetchArtistSongs(artistId) {
  const json = await apiClient.read('/artist/songs', { id: artistId, order: 'time', limit: SONGS_LIMIT });
  return Array.isArray(json.songs) ? json.songs : [];
}

/**
 * 取专辑发行时间 / 厂牌 / 实际艺人（/artist/songs 的 song 对象不带 publishTime，只能再查一次）
 * @returns {Promise<null|{publishTime:number,company:string,artists:string[]}>}
 */
async function fetchAlbumMeta(albumId) {
  try {
    return await apiClient.album(albumId);
  } catch {
    return null;
  }
}

/** 补齐厂牌信息（对齐本地 VA_Album_Date_Cache 里的 company 字段） */
async function fetchAlbumCompany(albumId) {
  return (await fetchAlbumMeta(albumId))?.company || '';
}

async function enrichCompanies(collector) {
  const items = [];
  for (const bucket of collector.byDay.values()) {
    for (const item of bucket.values()) {
      // 合辑条目在扫描时已从 /album 拿到厂牌，无需重复请求
      if (!item.label) items.push(item);
    }
  }
  if (!items.length) return { filled: 0, total: 0 };
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
  return { filled, total: items.length };
}

(async () => {
  const ids = readArtistIds(ARTISTS_FILE_PATH);
  if (!ids || !ids.length) {
    console.error('[ERROR] 未找到艺人清单：' + ARTISTS_FILE_PATH);
    console.error('        先在本地跑 node scripts/export-mobile-snapshot.js 生成 data/mobile/artists.json');
    process.exit(1);
  }
  const targets = MAX_ARTISTS > 0 ? ids.slice(0, MAX_ARTISTS) : ids;
  const prevIndex = readPrevIndex();
  // 分片游标存在 index.json 里，每次运行前进一步，保证 8 片被 9 次日程依次覆盖
  const compilationShard = COMPILATIONS
    ? ((Number(prevIndex?.compilation_shard ?? -1) + 1) % COMPILATION_SHARDS)
    : -1;

  console.log('云端扫描开始');
  console.log('  API        : ' + API);
  console.log('  输出目录   : ' + DST_MOBILE_DIR);
  console.log('  艺人清单   : ' + ARTISTS_FILE_PATH + '（共 ' + ids.length + '，本轮扫 ' + targets.length + '）');
  console.log('  并发/天数  : ' + CONCURRENCY + ' / ' + DAYS + ' 天');
  console.log('  Cookie     : ' + (COOKIE ? '已提供' : '无（匿名）'));
  if (COMPILATIONS) {
    console.log('  合辑分片   : 第 ' + (compilationShard + 1) + '/' + COMPILATION_SHARDS
      + ' 片（每艺人最多取 ' + SONGS_LIMIT + ' 首单曲，预算 ' + Math.round(COMPILATION_BUDGET_MS / 60000) + ' 分钟）');
  } else {
    console.log('  合辑分片   : 已关闭（--no-compilations）');
  }

  const collector = createCollector(DAYS);

  // 已有快照先读进来
  //   - 部分扫描（试跑）：全部合并，避免把线上完整数据冲成一小撮
  //   - 全量扫描：只合并「合辑」条目，因为合辑是分片轮转产出的，不合并就会把其他片的结果抹掉
  let merged = 0;
  if (MERGE) {
    merged = loadExistingInto(DST_MOBILE_DIR, collector);
    console.log('  已合并现有快照条目：' + merged + ' 条');
  } else if (COMPILATIONS) {
    merged = loadExistingInto(DST_MOBILE_DIR, collector, item => item && item.resultTab === 'compilation');
    console.log('  已合并现有合辑条目：' + merged + ' 条（新作由本轮全量重扫）');
  }

  let done = 0;
  let okCount = 0;
  let failCount = 0;
  let albumSeen = 0;
  const failedIds = [];
  const t0 = Date.now();
  // 记录每位艺人本轮 /artist/album 拿到的专辑 id，供合辑阶段判断「是否本人名下」
  const albumIdsByArtist = new Map();

  // 增量落盘 + 增量发布：页面靠它实现「进度条前进」与「当天卡片逐个出现」。
  // prune 必须为 false —— 只有最后那次 writeSnapshot 才允许清理过期日期文件，
  // 否则扫描中途会反复删除还没来得及重写的旧日期快照。
  let lastFlushAt = 0;
  function flushProgress(phase, doneCount, totalCount, message, force) {
    const now = Date.now();
    if (!force && now - lastFlushAt < FLUSH_EVERY_MS) return;
    lastFlushAt = now;
    const artistCount = Math.max(targets.length, Number(prevIndex?.artist_count) || 0);
    const albumCount = Math.max(albumSeen, Number(prevIndex?.album_count) || 0);
    try {
      writeSnapshot({
        dstMobileDir: DST_MOBILE_DIR,
        collector,
        days: DAYS,
        artistCount,
        albumCount,
        prune: false,
        extra: COMPILATIONS ? {
          compilation_shard: compilationShard,
          compilation_shards: COMPILATION_SHARDS
        } : {}
      });
      writeProgress(DST_MOBILE_DIR, {
        scanning: phase !== 'done',
        phase,
        done: doneCount,
        total: totalCount,
        percent: phasePercent(phase, doneCount, totalCount),
        hits: collector.hitCount,
        ok: okCount,
        fail: failCount,
        started_at: SCAN_STARTED_AT
      });
    } catch (e) {
      console.warn('[WARN] 增量落盘失败（不影响扫描）：' + String(e.message || e).split('\n')[0]);
      return;
    }
    publishProgress(message, force);
  }

  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= targets.length) return;
      const artistId = targets[i];
      try {
        const albums = await fetchArtistAlbums(artistId);
        okCount += 1;
        albumSeen += albums.length;
        albumIdsByArtist.set(artistId, new Set(albums.map(a => a.id)));
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
        flushProgress('new', done, targets.length,
          'chore(snapshot): 云端扫描中 ' + done + '/' + targets.length);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  const elapsedScan = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n逐艺人扫描完成，用时 ' + elapsedScan + 's'
    + '（成功 ' + okCount + ' / 失败 ' + failCount + '，抓取专辑 ' + albumSeen + ' 张）');
  // 阶段一结束立刻把进度推到 70%，避免合辑阶段开始前进度条长时间停在原地
  flushProgress('new', targets.length, targets.length,
    'chore(snapshot): 云端扫描中 阶段一完成', true);

  /**
   * 扫描单个艺人的「合辑参与」，复刻本地 start-static.js 的 scanArtistCompilationBackend：
   *   /artist/songs(order=time) 取近期单曲 → 归并其所属专辑 → 排除本人 hotAlbums 里的专辑
   *   → 用专辑日期缓存判断发行时间（未命中、或已命中窗口内时才请求 /album）→ 写入 collector。
   * 「已知发行时间且不在窗口内」的专辑直接跳过，这正是分片轮转能持续提速的关键。
   * @returns {Promise<number>} 本次新增的合辑条数
   */
  async function scanArtistCompilations(artistId) {
    // 阶段一没成功拿到该艺人的所属专辑时无法判定归属，直接跳过（避免把本人专辑误判成合辑）
    const owned = albumIdsByArtist.get(artistId);
    if (!owned) return 0;
    const songs = await fetchArtistSongs(artistId);
    if (!songs.length) return 0;

    const seen = new Set();
    let added = 0;
    for (const song of songs) {
      const albumId = Number(song && song.al && song.al.id) || 0;
      if (!albumId || owned.has(albumId) || seen.has(albumId)) continue;
      seen.add(albumId);

      const cachedTs = albumDateCache.get(albumId) || 0;
      if (cachedTs && !collector.wanted.has(beijingDayKey(cachedTs))) continue;

      const meta = await fetchAlbumMeta(albumId);
      if (!meta || !meta.publishTime) continue;
      albumDateCache.set(albumId, meta.publishTime);
      if (!collector.wanted.has(beijingDayKey(meta.publishTime))) continue;

      for (const matchedSong of songs.filter(s => Number(s?.al?.id) === albumId)) {
        const ar = Array.isArray(matchedSong.ar) ? matchedSong.ar
          : (Array.isArray(matchedSong.artists) ? matchedSong.artists : []);
        const matched = ar.find(a => Number(a && a.id) === artistId);
        const songId = Number(matchedSong.id) || 0;

        if (collector.addCompilation({
          id: albumId,
          name: String((song.al && song.al.name) || '未知专辑'),
          picUrl: String((song.al && song.al.picUrl) || ''),
          publishTime: meta.publishTime,
          artistId,
          artistName: matched ? String(matched.name || '').trim() : '',
          albumArtists: meta.artists,
          company: meta.company,
          track: {
            id: songId,
            name: String(matchedSong.name || '未命名单曲'),
            artists: ar.map(a => String((a && a.name) || '').trim()).filter(Boolean).join(' / '),
            link: songId ? ('https://music.163.com/#/song?id=' + songId) : ''
          }
        })) added += 1;
      }
    }
    return added;
  }

  // ===== 阶段二：合辑参与（分片轮转） =====
  let compilationHits = 0;
  let compilationArtists = 0;
  let albumDateCache = readAlbumDates(DST_MOBILE_DIR);
  const albumDateCacheLoaded = albumDateCache.size;
  if (COMPILATIONS) {
    const shardTargets = targets.filter((_, i) => i % COMPILATION_SHARDS === compilationShard);
    console.log('\n合辑阶段：第 ' + (compilationShard + 1) + '/' + COMPILATION_SHARDS
      + ' 片，共 ' + shardTargets.length + ' 位艺人（已载入专辑日期缓存 ' + albumDateCacheLoaded + ' 条）');

    let compDone = 0;
    let compCursor = 0;
    const compStartedAt = Date.now();

    async function compilationWorker() {
      for (;;) {
        if (Date.now() - compStartedAt > COMPILATION_BUDGET_MS) return;
        const i = compCursor;
        compCursor += 1;
        if (i >= shardTargets.length) return;
        const artistId = shardTargets[i];
        try {
          // 注意：不能写成 compilationHits += await ...（复合赋值会在 await 之前读取左值，
          // 并发 worker 会互相覆盖计数），必须先 await 拿到结果再累加
          const hits = await scanArtistCompilations(artistId);
          compilationHits += hits;
          compilationArtists += 1;
        } catch (e) {
          // 合辑是尽力而为的增量通道，单个艺人失败不影响整体
        }
        compDone += 1;
        if (compDone % 200 === 0) {
          const secs = ((Date.now() - compStartedAt) / 1000).toFixed(0);
          console.log('  合辑进度 ' + compDone + '/' + shardTargets.length
            + '（新增合辑 ' + compilationHits + ' 条）用时 ' + secs + 's');
          flushProgress('compilation', compDone, shardTargets.length,
            'chore(snapshot): 云端扫描中 合辑 ' + compDone + '/' + shardTargets.length);
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, shardTargets.length) }, compilationWorker));
    const compSecs = ((Date.now() - compStartedAt) / 1000).toFixed(1);
    const overBudget = Date.now() - compStartedAt > COMPILATION_BUDGET_MS;
    console.log('  合辑阶段完成：扫描 ' + compilationArtists + '/' + shardTargets.length + ' 位艺人，'
      + '新增/更新合辑 ' + compilationHits + ' 条，用时 ' + compSecs + 's'
      + (overBudget ? '（已达预算上限，剩余艺人交给下次运行）' : ''));
  }

  let companyFilled = 0;
  let companyTotal = 0;
  if (ENRICH && collector.hitCount > 0) {
    const pending = Array.from(collector.byDay.values()).reduce((n, b) => n + b.size, 0);
    console.log('\n  补齐厂牌信息（共 ' + pending + ' 张专辑，其中已有厂牌的会跳过）…');
    flushProgress('enrich', 0, 0, 'chore(snapshot): 云端扫描中 补齐厂牌', true);
    const enrichResult = await enrichCompanies(collector);
    companyFilled = enrichResult.filled;
    companyTotal = enrichResult.total;
    console.log('  厂牌补齐：' + companyFilled + ' / ' + companyTotal);
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  // 部分扫描时沿用旧的统计数（否则页头会出现「已扫描 300 个艺人」这种误导数字）
  const { indexDates, indexPayload, pruned } = writeSnapshot({
    dstMobileDir: DST_MOBILE_DIR,
    collector,
    days: DAYS,
    artistCount: Math.max(targets.length, Number(prevIndex?.artist_count) || 0),
    albumCount: Math.max(albumSeen, Number(prevIndex?.album_count) || 0),
    prune: PRUNE,
    extra: COMPILATIONS ? {
      compilation_shard: compilationShard,
      compilation_shards: COMPILATION_SHARDS
    } : {}
  });
  if (albumDateCache.size) {
    writeAlbumDates(DST_MOBILE_DIR, albumDateCache);
  }
  // 收尾：把进度标记为已结束（前端据此收起进度条），并把最终结果增量发布出去
  writeProgress(DST_MOBILE_DIR, {
    scanning: false,
    phase: 'done',
    done: targets.length,
    total: targets.length,
    percent: 100,
    hits: collector.hitCount,
    ok: okCount,
    fail: failCount,
    started_at: SCAN_STARTED_AT
  });
  publishProgress('chore(snapshot): 云端扫描 ' + new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString().slice(0, 16).replace('T', ' '), true);

  const compilationCount = Array.from(collector.byDay.values())
    .reduce((n, b) => n + Array.from(b.values()).filter(i => i.resultTab === 'compilation').length, 0);

  console.log('\n云端扫描完成，用时 ' + elapsed + 's');
  if (MERGE) console.log('  合并已有条目 ' + merged + ' 条' + (PARTIAL ? '（部分扫描模式，不清理旧快照）' : ''));
  console.log('  成功 ' + okCount + ' / 失败 ' + failCount + '，抓取专辑 ' + albumSeen + ' 张');
  console.log('  快照条目：共 ' + collector.hitCount + ' 条（其中合辑 ' + compilationCount + ' 条）');
  console.log('  专辑日期缓存：' + albumDateCache.size + ' 条（本次由 ' + albumDateCacheLoaded + ' 增长而来）');
  console.log('  API requests/cache/coalesced/retries: ' + JSON.stringify(apiClient.stats));
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
