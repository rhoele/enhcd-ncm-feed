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
 *   data/mobile/artists.json       { updated_at, count, ids:[...] }   ← 云端扫描的艺人清单输入
 */
const fs = require('fs');
const path = require('path');

// 网易云所有发行时间都是 UTC+8 的 00:00，用固定偏移计算日期，保证 CI(UTC) 与本地结果一致
const BJ_OFFSET_MS = 8 * 3600 * 1000;
const VA_PATTERN = /^(various\s*artists|v\.?\s*a\.?|群星|华语群星|va)$/i;

const ARTISTS_FILE = 'artists.json';
const INDEX_FILE = 'index.json';
// 清理过期快照时需要保留下来的非日期文件
const KEEP_FILES = new Set([INDEX_FILE, ARTISTS_FILE]);

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
      .sort((a, b) => Number(b.publishTime) - Number(a.publishTime) || a.id - b.id);
    fs.writeFileSync(
      path.join(dstMobileDir, day + '.json'),
      JSON.stringify({ date: day, generated_at: nowIso, count: items.length, items }, null, 0),
      'utf8'
    );
    indexDates.push({ date: day, count: items.length, generated_at: nowIso });
  }

  const indexPayload = {
    updated_at: nowIso,
    latest_date: indexDates.length ? indexDates[0].date : beijingDayKey(Date.now()),
    days,
    artist_count: artistCount,
    album_count: albumCount,
    dates: indexDates
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

/** 读取已有的单日快照，合并进收集器（用于部分扫描时不抹掉线上已有数据） */
function loadExistingInto(dstMobileDir, collector) {
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
      if (collector.seed(item)) merged += 1;
    }
  }
  return merged;
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
  beijingDayKey,
  recentDayList,
  createCollector,
  writeSnapshot,
  writeArtistIds,
  readArtistIds,
  loadExistingInto
};
