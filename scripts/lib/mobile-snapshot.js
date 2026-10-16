#!/usr/bin/env node
/**
 * mobile-snapshot.js —— 移动端静态快照的公共构建 / 写出逻辑。
 *
 * 被两个生产者复用，保证 data/mobile/ 输出结构完全一致（前端只认这一套格式）：
 *   scripts/export-mobile-snapshot.js   本地：从 data/VA_*_Cache.json 导出
 *   scripts/cloud-scan.js               Actions：逐艺人调 /artist/album 抓取
 *
 * 输出格式：
 *   data/mobile/index.json         { updated_at, latest_date, days, artist_count, album_count, dates:[{date,count,generated_at}] }
 *   data/mobile/YYYY-MM-DD.json    { date, generated_at, count, items:[...] }
 *   data/mobile/artists.json       { updated_at, count, ids:[...] }        ← 云端扫描的艺人清单输入
 *   data/mobile/album-dates.json   { updated_at, count, dates:{id:ts} }    ← 「合辑参与」的专辑日期缓存
 *
 * 每个日期文件里的 items 分两类，靠 resultTab 区分：
 *   resultTab='new'          关注的艺人自己的发行（collector.add）
 *   resultTab='compilation'  关注的艺人出现在他人名下专辑里（collector.addCompilation）
 */
const fs = require('fs');
const path = require('path');

// 网易云所有发行时间都是 UTC+8 的 00:00，用固定偏移计算日期，保证 CI(UTC) 与本地结果一致
const BJ_OFFSET_MS = 8 * 3600 * 1000;
const VA_PATTERN = /^(various\s*artists|v\.?\s*a\.?|群星|华语群星|va)$/i;

const ARTISTS_FILE = 'artists.json';
const INDEX_FILE = 'index.json';
// 专辑发行日期缓存（albumId -> publishTime）：用于跳过「合辑参与」里大量早已发行的候选专辑
const ALBUM_DATES_FILE = 'album-dates.json';
// 清理过期快照时需要保留下来的非日期文件
const KEEP_FILES = new Set([INDEX_FILE, ARTISTS_FILE, ALBUM_DATES_FILE]);

function beijingDayKey(ts) {
  return new Date(Number(ts) + BJ_OFFSET_MS).toISOString().slice(0, 10);
}

/** 最近 days 天（含今天）的北京日期，新 → 旧 */
function recentDayList(days) {
  const list = [];
  for (let i = 0; i < days; i += 1) list.push(beijingDayKey(Date.now() - i * 86400000));
  return list;
}

/**
 * 创建一个「按天聚合命中专辑」的收集器。
 * 同一张专辑只收录一次；被多个关注艺人命中时合并 artistIds。
 */
function createCollector(days) {
  const self = {
    wanted: new Set(recentDayList(days)),
    byDay: new Map(), // day -> Map(albumId -> item)
    hitCount: 0,

    /** 直接放入一条已构建好的条目（用于合并已有快照） */
    seed(item) {
      const albumId = Number(item && item.id) || 0;
      const ts = Number(item && item.publishTime) || 0;
      if (!albumId || !ts) return false;
      const day = beijingDayKey(ts);
      if (!self.wanted.has(day)) return false;
      if (!self.byDay.has(day)) self.byDay.set(day, new Map());
      const bucket = self.byDay.get(day);
      if (bucket.has(albumId)) return false;
      bucket.set(albumId, item);
      self.hitCount += 1;
      return true;
    },

    /** @returns {boolean} 本次是否新收录 */
    add(album, artistId, company) {
      const albumId = Number(album && album.id) || 0;
      const ts = Number(album && album.publishTime) || 0;
      if (!albumId || !ts) return false;
      const day = beijingDayKey(ts);
      if (!self.wanted.has(day)) return false;

      const names = Array.isArray(album.artists)
        ? album.artists.map(n => String(n || '').trim()).filter(Boolean)
        : [];
      const isVA = names.some(n => VA_PATTERN.test(n));
      const aid = Number(artistId) || 0;
      const label = String(company || '').trim();

      if (!self.byDay.has(day)) self.byDay.set(day, new Map());
      const bucket = self.byDay.get(day);
      const existing = bucket.get(albumId);
      if (existing) {
        if (aid && !existing.artistIds.includes(aid)) existing.artistIds.push(aid);
        return false;
      }

      self.hitCount += 1;
      bucket.set(albumId, {
        id: albumId,
        name: String(album.name || '未知专辑'),
        picUrl: String(album.picUrl || ''),
        publishTime: ts,
        artistName: names.join(' / '),
        artistId: aid,
        artistIds: [aid],
        link: 'https://music.163.com/#/album?id=' + albumId,
        source: '云端快照',
        type: isVA ? '扫描合辑' : '扫描新作',
        tracks: [],
        trackCount: 0,
        resultTab: isVA ? 'compilation' : 'new',
        label,
        company: label,
        actualArtistNames: names,
        sourceArtistNames: [],
        isOwnedRelease: !isVA
      });
      return true;
    },

    /**
     * 收录一条「合辑参与」：关注的艺人出现在他人名下（或 Various Artists）的专辑里。
     * 与 add() 的区别是产出 resultTab='compilation'，前端会渲染到「扫描合辑」标签页。
     * 同一张专辑会被多个关注艺人命中，这里合并艺人名与曲目。
     *
     * @param {object} entry
     *   id            专辑 id（必填）
     *   name/picUrl   专辑名与封面
     *   publishTime   发行时间（必填，需落在窗口内）
     *   artistId/artistName  命中的关注艺人（artistName 用于「扫描来源艺人」）
     *   albumArtists  专辑实际艺人名数组（用于「实际艺术家」）
     *   company       厂牌
     *   track         { id, name, artists, link } 命中的单曲
     * @returns {boolean} 本次是否新收录该专辑
     */
    addCompilation(entry) {
      const albumId = Number(entry && entry.id) || 0;
      const ts = Number(entry && entry.publishTime) || 0;
      if (!albumId || !ts) return false;
      const day = beijingDayKey(ts);
      if (!self.wanted.has(day)) return false;

      const aid = Number(entry.artistId) || 0;
      const sourceName = String(entry.artistName || '').trim();
      const albumArtists = Array.isArray(entry.albumArtists)
        ? entry.albumArtists.map(n => String(n || '').trim()).filter(Boolean)
        : [];
      const label = String(entry.company || '').trim();

      if (!self.byDay.has(day)) self.byDay.set(day, new Map());
      const bucket = self.byDay.get(day);
      let item = bucket.get(albumId);
      let created = false;
      if (!item) {
        self.hitCount += 1;
        created = true;
        item = {
          id: albumId,
          name: String(entry.name || '未知专辑'),
          picUrl: String(entry.picUrl || ''),
          publishTime: ts,
          artistName: sourceName,
          artistId: aid,
          artistIds: aid ? [aid] : [],
          link: String(entry.link || ('https://music.163.com/#/album?id=' + albumId)),
          source: '云端快照',
          type: '扫描合辑',
          tracks: [],
          trackCount: 0,
          resultTab: 'compilation',
          label,
          company: label,
          actualArtistNames: albumArtists,
          sourceArtistNames: [],
          isOwnedRelease: false
        };
        bucket.set(albumId, item);
      }

      if (aid && !item.artistIds.includes(aid)) item.artistIds.push(aid);
      if (!item.actualArtistNames.length && albumArtists.length) item.actualArtistNames = albumArtists;
      if (!item.label && label) {
        item.label = label;
        item.company = label;
      }
      if (sourceName) {
        const names = new Set(String(item.artistName || '').split(' / ').map(n => n.trim()).filter(Boolean));
        names.add(sourceName);
        item.artistName = Array.from(names).join(' / ');
        if (!item.sourceArtistNames.includes(sourceName)) item.sourceArtistNames.push(sourceName);
      }
      const track = entry.track;
      const trackId = Number(track && track.id) || 0;
      if (trackId > 0 && !item.tracks.some(t => Number(t.id) === trackId)) {
        item.tracks.push({
          id: trackId,
          name: String(track.name || '未命名单曲'),
          artists: String(track.artists || ''),
          link: String(track.link || '')
        });
      }
      item.trackCount = item.tracks.length;
      return created;
    }
  };
  return self;
}

/** 写出单日文件 + index.json，并清理超出窗口的旧快照 */
function writeSnapshot(opts) {
  const dstMobileDir = opts.dstMobileDir;
  const collector = opts.collector;
  const days = opts.days;
  const artistCount = Number(opts.artistCount) || 0;
  const albumCount = Number(opts.albumCount) || 0;
  const prune = opts.prune !== false;

  fs.mkdirSync(dstMobileDir, { recursive: true });
  const nowIso = new Date().toISOString();
  const indexDates = [];

  for (const day of Array.from(collector.byDay.keys()).sort().reverse()) {
    const items = Array.from(collector.byDay.get(day).values())
      .map(item => ({
        ...item,
        // Stable across cache refreshes and tab reclassification for notification deduplication.
        releaseKey: 'netease:album:' + Number(item.id) + ':' + Number(item.publishTime)
      }))
      .sort((a, b) => Number(b.publishTime) - Number(a.publishTime) || a.id - b.id);
    fs.writeFileSync(
      path.join(dstMobileDir, day + '.json'),
      JSON.stringify({ schema_version: 1, timezone: 'Asia/Shanghai', date: day, generated_at: nowIso, count: items.length, items }, null, 0),
      'utf8'
    );
    indexDates.push({ date: day, count: items.length, generated_at: nowIso });
  }

  const indexPayload = {
    schema_version: 1,
    timezone: 'Asia/Shanghai',
    updated_at: nowIso,
    latest_date: indexDates.length ? indexDates[0].date : beijingDayKey(Date.now()),
    days,
    artist_count: artistCount,
    album_count: albumCount,
    dates: indexDates,
    ...(opts.extra && typeof opts.extra === 'object' ? opts.extra : {})
  };
  fs.writeFileSync(path.join(dstMobileDir, INDEX_FILE), JSON.stringify(indexPayload, null, 2), 'utf8');

  let pruned = 0;
  if (prune) {
    const keep = new Set(indexDates.map(d => d.date + '.json'));
    KEEP_FILES.forEach(f => keep.add(f));
    for (const file of fs.readdirSync(dstMobileDir)) {
      if (!file.endsWith('.json') || keep.has(file)) continue;
      try { fs.unlinkSync(path.join(dstMobileDir, file)); pruned += 1; } catch {}
    }
  }

  return { indexDates, indexPayload, pruned };
}

/** 写出云端扫描用的艺人清单 */
function writeArtistIds(dstMobileDir, ids) {
  fs.mkdirSync(dstMobileDir, { recursive: true });
  const payload = {
    updated_at: new Date().toISOString(),
    count: ids.length,
    ids: ids.slice().sort((a, b) => a - b)
  };
  fs.writeFileSync(path.join(dstMobileDir, ARTISTS_FILE), JSON.stringify(payload, null, 0), 'utf8');
  return payload;
}

/**
 * 读取已有的单日快照，合并进收集器（用于部分扫描时不抹掉线上已有数据）
 * @param {function} [filter] 可选过滤：只有返回 true 的条目才会被合并
 */
function loadExistingInto(dstMobileDir, collector, filter) {
  let merged = 0;
  if (!fs.existsSync(dstMobileDir)) return merged;
  for (const day of collector.wanted) {
    const file = path.join(dstMobileDir, day + '.json');
    if (!fs.existsSync(file)) continue;
    let payload = null;
    try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    const items = Array.isArray(payload) ? payload : (payload && payload.items);
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof filter === 'function' && !filter(item)) continue;
      if (collector.seed(item)) merged += 1;
    }
  }
  return merged;
}

/** 读取专辑发行日期缓存（albumId -> publishTime） */
function readAlbumDates(dstMobileDir) {
  const cache = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dstMobileDir, ALBUM_DATES_FILE), 'utf8'));
    const dates = raw && typeof raw.dates === 'object' && raw.dates ? raw.dates : {};
    for (const key of Object.keys(dates)) {
      const id = Number(key);
      const ts = Number(dates[key]);
      if (id > 0 && ts > 0) cache.set(id, ts);
    }
  } catch {}
  return cache;
}

/** 写出专辑发行日期缓存；返回条目数 */
function writeAlbumDates(dstMobileDir, cache) {
  const dates = {};
  const ids = Array.from(cache.keys()).sort((a, b) => a - b);
  for (const id of ids) dates[id] = cache.get(id);
  fs.mkdirSync(dstMobileDir, { recursive: true });
  fs.writeFileSync(
    path.join(dstMobileDir, ALBUM_DATES_FILE),
    JSON.stringify({ updated_at: new Date().toISOString(), count: ids.length, dates }, null, 0),
    'utf8'
  );
  return ids.length;
}

/** 读取艺人清单，兼容 {ids:[]} 与裸数组两种写法 */
function readArtistIds(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw && raw.ids;
    if (!Array.isArray(list)) return null;
    return Array.from(new Set(list.map(Number).filter(n => Number.isFinite(n) && n > 0)));
  } catch (e) {
    console.warn('[WARN] 解析艺人清单失败 ' + file + '：' + e.message);
    return null;
  }
}

module.exports = {
  BJ_OFFSET_MS,
  VA_PATTERN,
  ARTISTS_FILE,
  INDEX_FILE,
  ALBUM_DATES_FILE,
  beijingDayKey,
  recentDayList,
  createCollector,
  writeSnapshot,
  writeArtistIds,
  readArtistIds,
  loadExistingInto,
  readAlbumDates,
  writeAlbumDates
};
