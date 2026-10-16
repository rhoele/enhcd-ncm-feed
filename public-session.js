/* Public builds use an isolated, tab-scoped profile. Local development is unchanged. */
(() => {
  'use strict';
  const publicMode = document.currentScript?.dataset.public === 'true'
    || location.hostname.endsWith('.github.io');
  window.NAF_PUBLIC_MODE = publicMode;
  window.NAF_STORAGE = localStorage;
  if (!publicMode) return;
  document.documentElement.classList.add('public-page');
  const prefix = 'naf-private-v2:' + new URL('.', location.href).pathname + ':';
  const storage = {
    get length() { return Object.keys(sessionStorage).filter(k => k.startsWith(prefix)).length; },
    key(i) { return Object.keys(sessionStorage).filter(k => k.startsWith(prefix))[i]?.slice(prefix.length) ?? null; },
    getItem(k) { return sessionStorage.getItem(prefix + k); },
    setItem(k, v) { sessionStorage.setItem(prefix + k, String(v)); },
    removeItem(k) { sessionStorage.removeItem(prefix + k); },
    clear() { Object.keys(sessionStorage).filter(k => k.startsWith(prefix)).forEach(k => sessionStorage.removeItem(k)); }
  };
  window.NAF_STORAGE = storage;
  // Remove previous publisher-injected settings, never the local development origin.
  for (const key of Object.keys(localStorage)) {
    if (/^(netease-|naf[-_]|spotify|__spotify|sp_|settings_migrated|restored_from_file|enhanced_follow)/i.test(key)) {
      localStorage.removeItem(key);
    }
  }
  for (const name of ['naf_settings', 'naf_settings_backup']) {
    for (const path of ['/', new URL('.', location.href).pathname]) {
      document.cookie = name + '=; Max-Age=0; Path=' + path + '; SameSite=Strict';
    }
  }
  storage.setItem('settings_migrated_v1', 'done');
  const key = 'netease-feed-settings-v1';
  const settings = () => {
    try { return JSON.parse(storage.getItem(key) || '{}'); } catch { return {}; }
  };
  window.NAF_PERSONAL_MODE = settings().personalMode === true;
  document.documentElement.classList.toggle('personal-page', window.NAF_PERSONAL_MODE);

  function backendUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('后端必须使用 HTTPS，且地址不能包含账号、参数或片段。');
    }
    if (url.origin === location.origin) throw new Error('GitHub Pages 不是扫描后端，请填写你自己的服务地址。');
    return url.href.replace(/\/+$/, '');
  }
  function matches(url, base) {
    if (!base) return false;
    try {
      const root = new URL(backendUrl(base));
      return url.origin === root.origin
        && (url.pathname === root.pathname || url.pathname.startsWith(root.pathname.replace(/\/$/, '') + '/'));
    } catch { return false; }
  }
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : input, location.href);
    const cfg = settings();
    const method = String(init.method || req?.method || 'GET').toUpperCase();
    const snapshotRoot = new URL('data/mobile/', new URL('.', location.href));
    const snapshot = url.origin === location.origin && url.pathname.startsWith(snapshotRoot.pathname)
      && method === 'GET';
    const ownApi = cfg.personalMode === true && matches(url, cfg.apiBase);
    const ownScan = cfg.personalMode === true && matches(url, cfg.scanBackendBase);
    if (!snapshot && !ownApi && !ownScan) {
      throw new Error('公共页不会连接预置或未知后端。请在“设置”中配置自己的 HTTPS 服务。');
    }
    const headers = new Headers(init.headers || req?.headers);
    const cookie = url.searchParams.get('cookie');
    url.searchParams.delete('cookie');
    if (url.searchParams.has('cookies')) throw new Error('公共页不支持多账号 Cookie 聚合。');
    if (cookie && ownApi) headers.set('x-ncm-cookie', cookie);
    if (ownScan && cfg.backendToken) headers.set('Authorization', 'Bearer ' + cfg.backendToken);
    if (snapshot) {
      headers.delete('x-ncm-cookie');
      headers.delete('Authorization');
    }
    const options = {
      ...init, method, headers, credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', cache: 'no-store'
    };
    if (req && !options.signal) options.signal = req.signal;
    if (req && !options.body && !['GET', 'HEAD'].includes(method)) options.body = await req.text();
    return nativeFetch(url.href, options);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const dlg = document.createElement('dialog');
    dlg.className = 'settings personal-settings';
    dlg.id = 'personalSettingsDialog';
    dlg.innerHTML = `
      <form method="dialog">
        <h2>浏览与个人扫描</h2>
        <p class="hint">公共快照不需要账号。个人配置仅在当前标签页会话中保存，不写入公开种子或 GitHub。关闭标签页通常会清除会话，使用后也可点“清除个人会话”。</p>
        <label>使用方式<select id="personalMode"><option value="snapshot">公共快照（免登录）</option><option value="personal">自己的后端与账号</option></select></label>
        <fieldset id="personalFields">
          <legend>仅填写你信任并独享的服务</legend>
          <p class="hint">需要兼容 start-static.js 的扫描后端和支持 x-ncm-cookie 的网易云 API。两者均须允许当前页面的 CORS 来源；扫描后端请用反向代理认证保护，不要连接共享实例。此网页不保证关闭后持续扫描或准点推送。</p>
          <label>扫描后端（HTTPS）<input id="personalBackend" type="url" autocomplete="off" placeholder="https://scan.example.org" required></label>
          <label>网易云 API（HTTPS）<input id="personalApi" type="url" autocomplete="off" placeholder="https://music-api.example.org" required></label>
          <label>后端 Bearer Token（可选）<input id="personalToken" type="password" autocomplete="new-password"></label>
          <label>自己的 Cookie（可选，登录扫描需要）<input id="personalCookie" type="password" autocomplete="new-password" spellcheck="false"></label>
          <label>自己的歌单链接或 ID（可选）<input id="personalPlaylist" autocomplete="off" placeholder="歌单 ID 或 music.163.com 歌单链接"></label>
          <label>手动艺人 ID（可选）<input id="personalArtists" autocomplete="off" placeholder="多个 ID 用逗号分隔"></label>
          <label><input id="personalConsent" type="checkbox" required>我确认以上服务由我控制，并同意将本次 Cookie 和扫描条件发送给这些服务。</label>
        </fieldset>
        <p id="personalError" role="alert"></p>
        <menu>
          <button type="button" class="btn" id="personalClear">清除个人会话</button>
          <button type="button" class="btn" id="personalCancel">取消</button>
          <button type="submit" class="btn primary">保存并应用</button>
        </menu>
      </form>`;
    document.body.append(dlg);
    const el = id => document.getElementById(id);
    function toggle() {
      const active = el('personalMode').value === 'personal';
      el('personalFields').disabled = !active;
      el('personalFields').hidden = !active;
    }
    function open() {
      const cfg = settings();
      el('personalMode').value = cfg.personalMode ? 'personal' : 'snapshot';
      el('personalBackend').value = cfg.scanBackendBase || '';
      el('personalApi').value = cfg.apiBase || '';
      el('personalToken').value = cfg.backendToken || '';
      el('personalCookie').value = cfg.cookie || '';
      el('personalPlaylist').value = cfg.playlistSource || '';
      el('personalArtists').value = (cfg.manualArtistIds || []).join(',');
      el('personalConsent').checked = false;
      el('personalError').textContent = '';
      toggle();
      dlg.showModal();
    }
    document.addEventListener('click', e => {
      if (e.target.closest('#openSettings')) {
        e.preventDefault(); e.stopImmediatePropagation(); open();
      }
    }, true);
    el('personalMode').addEventListener('change', toggle);
    el('personalCancel').addEventListener('click', () => dlg.close());
    el('personalClear').addEventListener('click', () => { storage.clear(); location.reload(); });
    dlg.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      try {
        const personalMode = el('personalMode').value === 'personal';
        const cfg = personalMode ? {
          personalMode: true,
          scanBackendBase: backendUrl(el('personalBackend').value.trim()),
          apiBase: backendUrl(el('personalApi').value.trim()),
          backendToken: el('personalToken').value.trim(),
          cookie: el('personalCookie').value.trim(),
          playlistSource: el('personalPlaylist').value.trim(),
          manualArtistIds: el('personalArtists').value.split(/[,，\s]+/).filter(Boolean).map(v => {
            if (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) <= 0) throw new Error('艺人 ID 必须为正整数。');
            return Number(v);
          }),
          daysRange: 1, concurrency: 3, smartScan: true, useCachedPlaylistArtists: false
        } : {};
        // A different account/backend must not inherit previous scan results.
        storage.clear();
        storage.setItem(key, JSON.stringify(cfg));
        location.reload();
      } catch (error) { el('personalError').textContent = error.message; }
    });
    const notice = document.querySelector('.notice p');
    if (notice) notice.textContent = window.NAF_PERSONAL_MODE
      ? '个人扫描模式：仅连接你自己的后端。配置保存在当前标签页会话中。'
      : '公共快照 · 无需登录。新作与合辑由定时任务更新；个人扫描请在设置中接入自己的后端。';
    const pause = el('pauseBtn');
    if (pause && !window.NAF_PERSONAL_MODE) pause.hidden = true;
  });
})();
