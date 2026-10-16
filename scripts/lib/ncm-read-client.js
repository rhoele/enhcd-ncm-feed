// Read-only NeteaseCloudMusicApi adapter. Cookie-bearing requests use a POST body.
// APK-observed upstream routes are already mapped by the installed API library:
// /api/artist/albums/:id, /api/v1/album/:id, /api/v3/song/detail.
class NcmReadClient {
  constructor({ base, cookie = '', timeout = 15000, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
    this.base = String(base).replace(/\/$/, '');
    this.cookie = cookie && !cookie.includes('=') ? 'MUSIC_U=' + cookie : cookie;
    this.timeout = timeout;
    this.fetch = fetchImpl;
    this.sleep = sleep;
    this.albumPending = new Map();
    this.albumCache = new Map();
    this.stats = { requests: 0, albumCacheHits: 0, coalesced: 0, retries: 0 };
  }

  async read(route, params = {}) {
    if (!['/artist/album', '/artist/songs', '/album', '/song/detail'].includes(route)) {
      throw new Error('Unsupported read-only route');
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const url = new URL(this.base + route);
      const data = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
      const options = { redirect: 'error', signal: AbortSignal.timeout(this.timeout) };
      if (this.cookie) {
        data.set('cookie', this.cookie);
        options.method = 'POST';
        options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        options.body = data.toString();
      } else {
        url.search = data.toString();
      }
      let wait = 500 * (2 ** attempt);
      try {
        this.stats.requests++;
        const res = await this.fetch(url, options);
        const body = await res.json();
        const code = Number(body?.code || res.status);
        if (res.ok && code === 200) return body;
        const retryable = [405, 406, 429, 502, 503, 504].includes(res.status)
          || [405, 406, 429, 502, 503, 504].includes(code);
        const error = new Error('NCM ' + route + ' HTTP ' + res.status + ' code=' + code);
        error.permanent = !retryable;
        const retryAfter = res.headers.get('retry-after');
        const retryMs = /^\d+$/.test(retryAfter || '')
          ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now();
        if (Number.isFinite(retryMs)) wait = Math.max(wait, Math.min(30000, retryMs));
        throw error;
      } catch (error) {
        if (error.permanent || attempt === 2) {
          // Do not include response bodies or URLs that might echo account data.
          throw new Error('NCM ' + route + ' request failed (' + (error.permanent ? 'rejected' : 'unavailable') + ')');
        }
      }
      this.stats.retries++;
      await this.sleep(wait);
    }
  }

  async album(id) {
    id = Number(id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid album ID');
    if (this.albumCache.has(id)) {
      this.stats.albumCacheHits++;
      return this.albumCache.get(id);
    }
    if (this.albumPending.has(id)) {
      this.stats.coalesced++;
      return this.albumPending.get(id);
    }
    const pending = this.read('/album', { id }).then(json => {
      const album = json.album;
      if (!album || !Number.isFinite(Number(album.publishTime)) || Number(album.publishTime) <= 0) throw new Error('Invalid album metadata');
      const meta = {
        publishTime: Number(album.publishTime),
        company: String(album.company || '').trim(),
        artists: (Array.isArray(album.artists) ? album.artists : []).map(a => String(a?.name || '').trim()).filter(Boolean)
      };
      if (this.albumCache.size >= 4096) this.albumCache.delete(this.albumCache.keys().next().value);
      this.albumCache.set(id, meta);
      return meta;
    }).finally(() => this.albumPending.delete(id));
    this.albumPending.set(id, pending);
    return pending;
  }
}
module.exports = { NcmReadClient };
