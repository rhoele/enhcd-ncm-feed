// 网易云关注艺人新作速递 — 前端逻辑
(() => {
  // ===== Seed 默认值注入（部署到 Pages 时，把当前用户的 Cookie/设置/艺人缓存 打包成默认值） =====
  try {
    (function __applySeed() {
      if (!window.NAF_SEED_SETTINGS || typeof window.NAF_SEED_SETTINGS !== 'object') return;
      const seed = window.NAF_SEED_SETTINGS;
      const LS_KEY_FORCE = seed.__lsKey || 'netease-feed-settings-v1';
      const currentRaw = localStorage.getItem(LS_KEY_FORCE);
      let shouldApply = false;
      if (!currentRaw) shouldApply = true;
      if (typeof seed.__seedVersion !== 'undefined' && typeof seed.__seedVersion === 'number') {
        try {
          const curObj = currentRaw ? JSON.parse(currentRaw) : {};
          const curVersion = Number(curObj.__seedVersion || 0) || 0;
          if (seed.__seedVersion > curVersion) shouldApply = true;
        } catch {}
      }
      if (seed.__force === true) shouldApply = true;
      if (!shouldApply) return;
      const merged = Object.assign({}, seed);
      delete merged.__lsKey; delete merged.__force;
      const text = JSON.stringify(merged);
      try { localStorage.setItem(LS_KEY_FORCE, text); } catch {}
      // 同时写入 Cookie 备份，跨同源不同端口时能迁移
      try {
        const DAYS180 = 180 * 86400 * 1000;
        const encoded = encodeURIComponent(text).replace(/'/, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
        document.cookie = `naf_settings_backup=${encoded}; path=/; max-age=15552000; samesite=lax`;
      } catch {}
      // seed 里附了 follow cache 一并写入
      if (seed.__followCache && typeof seed.__followCache === 'object') {
        try { localStorage.setItem('netease-follow-cache-v1', JSON.stringify(seed.__followCache)); } catch {}
      }
      // seed 里附了 artist check cache
      if (seed.__artistCheckCache && typeof seed.__artistCheckCache === 'object') {
        try { localStorage.setItem('netease-artist-check-cache-v2', JSON.stringify(seed.__artistCheckCache)); } catch {}
      }
    })();
  } catch {}

  // Sync cache to napcat bot automatically on load
  try {
    const cache = localStorage.getItem('netease-follow-cache-v1');
    if (cache) {
      const syncUrl = typeof resolveCorsProxyApi === 'function'
        ? resolveCorsProxyApi('/sync-cache')
        : 'http://127.0.0.1:8012/sync-cache';
      fetch(syncUrl, { method: 'POST', body: cache })
        .then(r => r.json())
        .then(data => console.log('[Sync Cache] Bot cache updated:', data))
        .catch(e => console.log('[Sync Cache] Failed to sync to bot:', e));
    }
  } catch(e) {}

  console.log("%c[App] Loaded Version: Fix-429-UI-Feedback", "color:green;font-weight:bold;font-size:14px");
  let __spotifyRateLimitedUntil = 0; // Global circuit breaker for Spotify 429

  // ========== GitHub Pages 配置化：扫描后端 & CORS 代理地址 ==========
  function __isLocalSameOrigin(portPattern) {
    try {
      const host = window.location.hostname || '';
      if (!['127.0.0.1', 'localhost', ''].includes(host)) return false;
      if (!portPattern) return true;
      const p = window.location.port;
      return !p || portPattern.split(',').includes(String(p));
    } catch { return false; }
  }
  function __trimBase(s) {
    const v = String(s || '').trim().replace(/\/+$/, '');
    return v || '';
  }
  function getScanBackendBase() {
    try {
      const s = loadSettings();
      if (s && s.scanBackendBase) return __trimBase(s.scanBackendBase);
    } catch {}
    if (__isLocalSameOrigin('8001,8000,8002,8080')) return __trimBase(window.location.origin);
    return '';
  }
  function getCorsProxyBase() {
    try {
      const s = loadSettings();
      if (s && s.corsProxyBase) return __trimBase(s.corsProxyBase);
    } catch {}
    if (__isLocalSameOrigin('8001,8000,8002,8080')) return 'http://127.0.0.1:8012';
    return '';
  }
  function resolveScanApi(rel) {
    if (/^https?:/i.test(rel)) return rel;
    const base = getScanBackendBase();
    if (!base) return rel;
    const p = rel.startsWith('/') ? rel : '/' + rel;
    return base + p;
  }
  function resolveCorsProxyApi(rel) {
    if (/^https?:/i.test(rel)) return rel;
    const base = getCorsProxyBase();
    if (!base) {
      // 若没配置，保持向后兼容老 localhost:8012 行为
      const url = new URL(rel, 'http://127.0.0.1:8012');
      return url.toString();
    }
    const p = rel.startsWith('/') ? rel : '/' + rel;
    return base + p;
  }
  // ================================================================

  const els = {
    refreshBtn: document.getElementById('refreshBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    refreshSpotifyAuto: document.getElementById('refreshSpotifyAuto'),
    settingsDlg: document.getElementById('settingsDialog'),
    openSettings: document.getElementById('openSettings'),
    saveSettings: document.getElementById('saveSettings'),
    qrLogin: document.getElementById('qrLogin'),
    qrDialog: document.getElementById('qrDialog'),
    qrImg: document.getElementById('qrImg'),
    qrStatus: document.getElementById('qrStatus'),
    scanBackendBase: document.getElementById('scanBackendBase'),
    corsProxyBase: document.getElementById('corsProxyBase'),
    apiBase: document.getElementById('apiBase'),
    cookie: document.getElementById('cookie'),
    manualArtistIds: document.getElementById('manualArtistIds'),
    manualArtistName: document.getElementById('manualArtistName'),
    addArtistByName: document.getElementById('addArtistByName'),
    addArtistStatus: document.getElementById('addArtistStatus'),
    importIdsFile: document.getElementById('importIdsFile'),
    btnImportIds: document.getElementById('btnImportIds'),
    btnExportFollow: document.getElementById('btnExportFollow'),
    btnExportFollowJson: document.getElementById('btnExportFollowJson'),
    importIdsStatus: document.getElementById('importIdsStatus'),
    labelKeyword: document.getElementById('labelKeyword'),
    labelOnlyFollowed: document.getElementById('labelOnlyFollowed'),
    fetchLabelToday: document.getElementById('fetchLabelToday'),
    labelSearchStatus: document.getElementById('labelSearchStatus'),
    daysRange: document.getElementById('daysRange'),
    targetDate: document.getElementById('targetDate'),
    tabNewReleases: document.getElementById('tabNewReleases'),
    tabCompilations: document.getElementById('tabCompilations'),
    tabLabels: document.getElementById('tabLabels'),
    feedPanel: document.getElementById('feedPanel'),
    compilationPanel: document.getElementById('compilationPanel'),
    labelsPanel: document.getElementById('labelsPanel'),
    feed: document.getElementById('feed'),
    compilationFeed: document.getElementById('compilationFeed'),
    labelsFeed: document.getElementById('labelsFeed'),
    spotifyAutoFeed: document.getElementById('spotifyAutoFeed'),
    exportSpotifyAuto: document.getElementById('exportSpotifyAuto'),
    lastRun: document.getElementById('lastRun'),
    headerStatArtists: document.getElementById('headerStatArtists'),
    headerStatHits: document.getElementById('headerStatHits'),
    headerStatAlbums: document.getElementById('headerStatAlbums'),
    headerStatCheckedAlbums: document.getElementById('headerStatCheckedAlbums'),
    headerStatElapsed: document.getElementById('headerStatElapsed'),
    openWeb: document.getElementById('openWeb'),
    // Spotify 扩展
    spotifyClientId: document.getElementById('spotifyClientId'),
    spotifyClientSecret: document.getElementById('spotifyClientSecret'),
    spotifyMarket: document.getElementById('spotifyMarket'),
    spotifyLabelKeyword: document.getElementById('spotifyLabelKeyword'),
    // 兼容两种按钮ID：历史（fetchSpotifyLabel）与新（spotifyLabelSearchBtn）
    spotifyLabelSearchBtn: document.getElementById('spotifyLabelSearchBtn') || document.getElementById('fetchSpotifyLabel'),
    spotifyLabelStatus: document.getElementById('spotifyLabelStatus'),
    btnSpotifyLogin: document.getElementById('btnSpotifyLogin'),
    pinnedPlaylistIds: document.getElementById('pinnedPlaylistIds'),
    playlistPickerDialog: document.getElementById('playlistPickerDialog'),
    playlistPickerTitle: document.getElementById('playlistPickerTitle'),
    playlistPickerMeta: document.getElementById('playlistPickerMeta'),
    playlistPickerTrackSection: document.getElementById('playlistPickerTrackSection'),
    playlistPickerTrackSelectAll: document.getElementById('playlistPickerTrackSelectAll'),
    playlistPickerTrackClear: document.getElementById('playlistPickerTrackClear'),
    playlistPickerTrackSelectedCount: document.getElementById('playlistPickerTrackSelectedCount'),
    playlistPickerTrackList: document.getElementById('playlistPickerTrackList'),
    playlistPickerSearch: document.getElementById('playlistPickerSearch'),
    playlistPickerSelectedCount: document.getElementById('playlistPickerSelectedCount'),
    playlistPickerStatus: document.getElementById('playlistPickerStatus'),
    playlistPickerList: document.getElementById('playlistPickerList'),
    playlistPickerSubmit: document.getElementById('playlistPickerSubmit'),
    commentDialog: document.getElementById('commentDialog'),
    commentDialogTitle: document.getElementById('commentDialogTitle'),
    commentDialogMeta: document.getElementById('commentDialogMeta'),
    commentDialogStatus: document.getElementById('commentDialogStatus'),
    commentList: document.getElementById('commentList'),
    commentInput: document.getElementById('commentInput'),
    commentRefreshBtn: document.getElementById('commentRefreshBtn'),
    commentSubmitBtn: document.getElementById('commentSubmitBtn'),
  };

  // PKCE Helper Functions
  function generateRandomString(length) {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  async function generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // 检查 URL 中的 Spotify Code (Authorization Code Flow) 或 Token (Implicit Flow)
  async function checkSpotifyAuth(){
    // 1. Check for Authorization Code (Query Params)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if(code){
        // Wait for settings to be loaded (if not already)
        // ensure settings are available
        const s = loadSettings ? loadSettings() : {}; 
        
        const codeVerifier = localStorage.getItem('spotify_pkce_verifier');
        if(!codeVerifier){
             // Maybe legacy flow or error? Let other scripts handle it (like index-enhanced.html)
             return;
        }

        // Clear query params to avoid re-execution only if we are handling it
        window.history.replaceState({}, document.title, window.location.pathname);
        
        const clientId = s.spotifyClientId || localStorage.getItem('spotify_client_id_temp');
        if(!clientId){
            alert('Spotify 登录失败：无法获取 Client ID。');
            return;
        }
        
        try {
            const redirectUri = getCanonicalRedirectUri();
            
            const body = new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: clientId,
                code_verifier: codeVerifier
            });
            
            // Direct call to Spotify Token Endpoint (No Client Secret needed for PKCE)
            const res = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: body
            });
            
            if(!res.ok){
                const txt = await res.text();
                throw new Error(`Token Exchange Failed: ${res.status} ${txt}`);
            }
            
            const data = await res.json();
            if(data.access_token){
                localStorage.setItem('spotify_user_token', data.access_token);
                const expiry = Date.now() + (data.expires_in * 1000);
                localStorage.setItem('spotify_user_token_expiry', expiry);
                if(data.refresh_token){
                     localStorage.setItem('spotify_refresh_token', data.refresh_token);
                }
                
                // Clean up
                localStorage.removeItem('spotify_pkce_verifier');
                localStorage.removeItem('spotify_client_id_temp');
                
                alert('Spotify 登录成功！(PKCE Flow)');
                // Refresh UI if settings dialog is open
                if(typeof bindSpotifyLoginUI === 'function') bindSpotifyLoginUI(s);
            }
        } catch(e) {
            alert(`Spotify 登录失败：${e.message}`);
            console.error(e);
        }
        return;
    }

    // 2. Check for Implicit Grant Token (Hash) - Legacy/Backup
    if(window.location.hash && window.location.hash.includes('access_token')){
      const params = new URLSearchParams(window.location.hash.substring(1));
      const token = params.get('access_token');
      const expiresIn = params.get('expires_in');
      if(token){
        localStorage.setItem('spotify_user_token', token);
        localStorage.setItem('spotify_user_token_expiry', Date.now() + (Number(expiresIn) * 1000));
        window.location.hash = '';
        setTimeout(() => alert('Spotify 登录成功！已保存 User Token，现在您可以尝试搜索厂牌了。'), 500);
      }
    }
  }
  checkSpotifyAuth();

  const LS_KEY = 'netease-feed-settings-v1';
  // 为设置提供跨端口（同域）备份：使用 cookie 存一份 JSON
  function backupSettingsCookie(jsonText){
    try{ document.cookie = `naf_settings=${encodeURIComponent(jsonText)}; max-age=31536000; path=/`; }catch{}
  }
  function readSettingsCookie(){
    try{
      const m = document.cookie.match(/(?:^|;\s*)naf_settings=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    }catch{ return null; }
  }
  function normalizeNcmCookie(raw){
    const text = String(raw || '').trim();
    if(!text) return '';
    const ignored = new Set(['path','expires','max-age','domain','secure','httponly','samesite','priority','partitioned']);
    const jar = {};
    text.split(';').forEach(part => {
      const item = String(part || '').trim();
      if(!item || !item.includes('=')) return;
      const idx = item.indexOf('=');
      const key = item.slice(0, idx).trim();
      const val = item.slice(idx + 1).trim();
      if(!key || ignored.has(key.toLowerCase())) return;
      jar[key] = val;
    });
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const PLAYLIST_CACHE_KEY = 'netease-playlist-cache-v1';
  const CACHE_PREFIX = 'netease-feed-cache-v2-';
  const FOLLOW_CACHE_KEY = 'netease-follow-cache-v1';
  const VA_OWNED_ARTIST_CACHE_ENDPOINT = '/api/va-owned-artist-cache';
  const ENHANCED_SCAN_START_ENDPOINT = '/api/new-release-scan/start';
  const ENHANCED_SCAN_STATUS_ENDPOINT = '/api/new-release-scan/status';
  const ENHANCED_SCAN_STOP_ENDPOINT = '/api/new-release-scan/stop';
  const VA_SCAN_START_ENDPOINT = '/api/va-scan/start';
  const VA_SCAN_STATUS_ENDPOINT = '/api/va-scan/status';
  const VA_SCAN_STOP_ENDPOINT = '/api/va-scan/stop';

  // 对扫描后端/缓存相对路径，统一解析为绝对 URL（支持 GitHub Pages 跨源访问本地后端）
  function resolveVaApi(rel) { return resolveScanApi(rel); }
  function resolveEnhancedApi(rel) { return resolveScanApi(rel); }
  const FOLLOW_META_KEY = 'netease-follow-meta-v1';
  const ENHANCED_RUNTIME_STATE_KEY = 'netease-enhanced-runtime-state-v2';
  const ENHANCED_TAB_NEW = 'new';
  const ENHANCED_TAB_COMPILATION = 'compilation';
  const ENHANCED_TAB_LABELS = 'labels';
  const ENHANCED_NEW_SCAN_CONFIG = {
    startEndpoint: ENHANCED_SCAN_START_ENDPOINT,
    statusEndpoint: ENHANCED_SCAN_STATUS_ENDPOINT,
    stopEndpoint: ENHANCED_SCAN_STOP_ENDPOINT,
    conflictPattern: /已有新作扫描任务在运行/,
    idleErrorText: '旧的新作后端扫描任务仍未停止，请稍后重试。',
    startErrorText: '启动新作后端扫描失败',
    statusErrorText: '新作后端扫描状态异常',
    replacedErrorText: '新作后端扫描任务已被替换，请重新开始。',
    runningProgressLabel: '新作后端扫描中',
    doneProgressLabel: '新作后端扫描完成',
    forceTab: ENHANCED_TAB_NEW,
    appendOptions: {
      refreshLabels: true,
      persist: true,
      bindPreview: true,
      batchSize: 16
    },
    phase: 'new',
    resolve: (u) => resolveEnhancedApi(u)
  };
  const ENHANCED_VA_SCAN_CONFIG = {
    startEndpoint: VA_SCAN_START_ENDPOINT,
    statusEndpoint: VA_SCAN_STATUS_ENDPOINT,
    stopEndpoint: VA_SCAN_STOP_ENDPOINT,
    conflictPattern: /已有扫描任务在运行/,
    idleErrorText: '旧的合辑后端扫描任务仍未停止，请稍后重试。',
    startErrorText: '启动合辑后端扫描失败',
    statusErrorText: '合辑后端扫描状态异常',
    replacedErrorText: '合辑后端扫描任务已被替换，请重新开始。',
    runningProgressLabel: '合辑后端扫描中',
    doneProgressLabel: '合辑后端扫描完成',
    forceTab: ENHANCED_TAB_COMPILATION,
    appendOptions: {
      refreshLabels: false,
      persist: false,
      bindPreview: false,
      batchSize: 48
    },
    phase: 'compilation',
    resolve: (u) => resolveVaApi(u)
  };
  // [Cache V2] 强制更新艺人检查缓存，解决旧缓存 lastPublish=0 导致的误判
  const ARTIST_CHECK_CACHE_KEY = 'netease-artist-check-cache-v2';
  // 全局请求节流：任意两次请求至少间隔
  let __lastFetchAt = 0;
  const MIN_FETCH_GAP_MS = 100;
  // 动态节流：在遭遇限流时临时增大请求间隔
  let __dynamicFetchGapMs = MIN_FETCH_GAP_MS;
  let __rateLimitStrikes = 0;
  // 加载超时与并发运行标记
  let __loadingTimer = null;
  let __runToken = 0;
  let __lastRunTime = 0;
  let __enhancedScanRunningToken = 0;
  let __enhancedBackendTaskId = '';
  let __appendBatchSize = 16;
  let __enhancedBackendTaskConfig = null;
  let __enhancedBackendRenderSignature = '';
  let __enhancedRenderedKeys = new Set();
  let __shownCount = 0;
  let __appendQueue = [];
  let __appendScheduled = false;
  let __enhancedCompilationFlushTimer = null;
  let __enhancedCompilationFlushItems = [];
  let __enhancedCompilationFlushBindPreview = false;
  let __enhancedUiState = createEnhancedUiState();
  const settings = loadSettings();
  bindSettingsUI(settings);
  // 保障诊断按钮绑定（有些浏览器在对话未打开前元素未可交互）
  try{ bindDiagnosticsUI(settings); }catch{}

  function createEnhancedUiState(){
    return {
      activeTab: ENHANCED_TAB_NEW,
      scrollTopByTab: {
        [ENHANCED_TAB_NEW]: 0,
        [ENHANCED_TAB_COMPILATION]: 0,
        [ENHANCED_TAB_LABELS]: 0
      },
      newReleases: [],
      compilations: [],
      stats: {
        artistsText: '0',
        hitsText: '0',
        albumsText: '0',
        checkedAlbumsText: '0',
        elapsedText: '00:00'
      },
      updatedAt: 0,
      rangeCacheKey: ''
    };
  }

  function normalizeNameList(value){
    const list = Array.isArray(value)
      ? value
      : (typeof value === 'string' && value.trim() ? value.split(/\s*\/\s*/) : []);
    return Array.from(new Set(list.map(item => String(item || '').trim()).filter(Boolean)));
  }

  function buildEnhancedRangeCacheKey(baseDate, daysRange){
    return CACHE_PREFIX + dayKey(baseDate) + '-r' + String(clampInt(daysRange, 1, 30, 1));
  }

  function formatElapsedMs(ms){
    const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if(hours > 0){
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function getEnhancedFeedByTab(tab){
    if(tab === ENHANCED_TAB_COMPILATION) return els.compilationFeed;
    if(tab === ENHANCED_TAB_LABELS) return els.labelsFeed;
    return els.feed;
  }

  function getEnhancedPanelByTab(tab){
    if(tab === ENHANCED_TAB_COMPILATION) return els.compilationPanel;
    if(tab === ENHANCED_TAB_LABELS) return els.labelsPanel;
    return els.feedPanel;
  }

  function getEnhancedItemsByTab(tab){
    if(tab === ENHANCED_TAB_COMPILATION) return __enhancedUiState.compilations;
    if(tab === ENHANCED_TAB_LABELS) return [];
    return __enhancedUiState.newReleases;
  }

  function setEnhancedItemsByTab(tab, items){
    if(tab === ENHANCED_TAB_COMPILATION){
      __enhancedUiState.compilations = items;
      return;
    }
    if(tab === ENHANCED_TAB_LABELS){
      return;
    }
    __enhancedUiState.newReleases = items;
  }

  function updateEnhancedShownCount(){
    __shownCount = Number(__enhancedUiState.newReleases.length || 0) + Number(__enhancedUiState.compilations.length || 0);
  }

  function getEnhancedEmptyMessage(tab, mode){
    if(tab === ENHANCED_TAB_LABELS){
      if(mode === 'loading') return '扫描中，暂未生成厂牌汇总。';
      if(mode === 'empty') return '当前范围内没有可汇总的厂牌结果。';
      return '厂牌汇总区尚未生成数据。';
    }
    if(tab === ENHANCED_TAB_COMPILATION){
      if(mode === 'loading') return '扫描中，暂未发现合辑结果。';
      if(mode === 'empty') return '在所选范围内未发现合辑结果。';
      return '合辑扫描结果区尚未生成数据。';
    }
    if(mode === 'loading') return '扫描中，暂未发现新作结果。';
    if(mode === 'empty') return '在所选范围内未发现新作。';
    return '尚未加载数据，点击右上角“设置”并保存后刷新。';
  }

  let __enhancedPersistTimer = null;
  let __enhancedCompilationAggregateTaskId = '';
  let __enhancedCompilationAggregateRawCount = 0;
  let __enhancedCompilationAggregateBuckets = new Map();
  let __enhancedCompilationAggregateItems = [];
  let __enhancedCompilationAggregateDirty = false;
  let __enhancedDeferredPanelDirty = new Set();
  function persistEnhancedUiState(){
    try{
      __enhancedUiState.updatedAt = Date.now();
      sessionStorage.setItem(ENHANCED_RUNTIME_STATE_KEY, JSON.stringify(__enhancedUiState));
    }catch{}
  }
  function scheduleEnhancedUiStatePersist(delay = 300){
    if(__enhancedPersistTimer){
      try{ clearTimeout(__enhancedPersistTimer); }catch{}
    }
    __enhancedPersistTimer = setTimeout(() => {
      __enhancedPersistTimer = null;
      persistEnhancedUiState();
    }, Math.max(0, Number(delay) || 0));
  }

  function updateEnhancedHeaderStats(nextStats, persist = true){
    __enhancedUiState.stats = {
      artistsText: String(nextStats?.artistsText ?? '0'),
      hitsText: String(nextStats?.hitsText ?? '0'),
      albumsText: String(nextStats?.albumsText ?? '0'),
      checkedAlbumsText: String(nextStats?.checkedAlbumsText ?? '0'),
      elapsedText: String(nextStats?.elapsedText ?? '00:00')
    };
    if(els.headerStatArtists) els.headerStatArtists.textContent = __enhancedUiState.stats.artistsText;
    if(els.headerStatHits) els.headerStatHits.textContent = __enhancedUiState.stats.hitsText;
    if(els.headerStatAlbums) els.headerStatAlbums.textContent = __enhancedUiState.stats.albumsText;
    if(els.headerStatCheckedAlbums) els.headerStatCheckedAlbums.textContent = __enhancedUiState.stats.checkedAlbumsText;
    if(els.headerStatElapsed) els.headerStatElapsed.textContent = __enhancedUiState.stats.elapsedText;
    if(persist) persistEnhancedUiState();
  }

  function refreshEnhancedHeaderStatsFromState(persist = true){
    const stats = __enhancedUiState.stats || {};
    updateEnhancedHeaderStats(stats, persist);
  }

  function classifyEnhancedItem(item){
    if(item?.resultTab === ENHANCED_TAB_NEW || item?.resultTab === ENHANCED_TAB_COMPILATION){
      return item.resultTab;
    }
    if(item?.isOwnedRelease) return ENHANCED_TAB_NEW;
    const actualArtists = normalizeNameList(item?.actualArtistNames);
    if(actualArtists.some(name => /^various artists$/i.test(name))){
      return ENHANCED_TAB_COMPILATION;
    }
    const sourceArtists = normalizeNameList(item?.sourceArtistNames).filter(name => !/^艺人\s*\d+$/i.test(name));
    if(!sourceArtists.length && actualArtists.length){
      return ENHANCED_TAB_NEW;
    }
    const lowerSource = new Set(sourceArtists.map(name => name.toLowerCase()));
    const lowerActual = new Set(actualArtists.map(name => name.toLowerCase()));
    const hasOverlap = Array.from(lowerSource).some(name => lowerActual.has(name));
    if(sourceArtists.length && actualArtists.length && !hasOverlap){
      return ENHANCED_TAB_COMPILATION;
    }
    return ENHANCED_TAB_NEW;
  }

  function upsertEnhancedStateItem(tab, item){
    const list = Array.isArray(getEnhancedItemsByTab(tab)) ? [...getEnhancedItemsByTab(tab)] : [];
    const key = getEnhancedRenderKey(item);
    const existingIndex = list.findIndex(entry => getEnhancedRenderKey(entry) === key);
    if(existingIndex >= 0){
      list.splice(existingIndex, 1);
    }
    const targetTs = Number(item?.publishTime || 0);
    const insertIndex = list.findIndex(entry => Number(entry?.publishTime || 0) < targetTs);
    if(insertIndex >= 0){
      list.splice(insertIndex, 0, item);
    } else {
      list.push(item);
    }
    setEnhancedItemsByTab(tab, list);
    updateEnhancedShownCount();
  }

  function renderFeedSection(tab, items, emptyMessage, opts = {}){
    const feedEl = getEnhancedFeedByTab(tab);
    if(!feedEl) return;
    const list = Array.isArray(items) ? items : [];
    if(!list.length){
      feedEl.innerHTML = `<div class="empty">${escapeHtml(emptyMessage || getEnhancedEmptyMessage(tab, 'idle'))}</div>`;
      updateEnhancedShownCount();
      return;
    }
    feedEl.innerHTML = list.map(item => buildCardHTML(item)).join('');
    updateEnhancedShownCount();
    if(opts.bindPreview !== false){
      bindPreviewUI(loadSettings());
    }
  }

  function renderEnhancedPanelsFromState(){
    renderFeedSection(ENHANCED_TAB_NEW, __enhancedUiState.newReleases, getEnhancedEmptyMessage(ENHANCED_TAB_NEW, 'idle'));
    renderFeedSection(ENHANCED_TAB_COMPILATION, __enhancedUiState.compilations, getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, 'idle'));
    renderLabelsFeed([...(Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases : []), ...(Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations : [])]);
    __enhancedDeferredPanelDirty.clear();
    refreshEnhancedHeaderStatsFromState(false);
  }

  function renderEnhancedPanelFromState(tab, opts = {}){
    if(tab === ENHANCED_TAB_LABELS){
      renderLabelsFeed([...(Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases : []), ...(Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations : [])]);
      __enhancedDeferredPanelDirty.delete(ENHANCED_TAB_LABELS);
      return;
    }
    renderFeedSection(tab, getEnhancedItemsByTab(tab), getEnhancedEmptyMessage(tab, 'idle'), opts);
    __enhancedDeferredPanelDirty.delete(tab);
  }

  function saveEnhancedTabScroll(tab){
    const currentTab = tab || __enhancedUiState.activeTab || ENHANCED_TAB_NEW;
    __enhancedUiState.scrollTopByTab[currentTab] = Math.max(0, window.scrollY || window.pageYOffset || 0);
  }

  function activateEnhancedTab(tab, options = {}){
    const nextTab = [ENHANCED_TAB_NEW, ENHANCED_TAB_COMPILATION, ENHANCED_TAB_LABELS].includes(tab)
      ? tab
      : ENHANCED_TAB_NEW;
    const preserveCurrentScroll = options.preserveCurrentScroll !== false;
    const restoreScroll = options.restoreScroll !== false;
    const previousTab = __enhancedUiState.activeTab || ENHANCED_TAB_NEW;
    if(preserveCurrentScroll){
      saveEnhancedTabScroll(previousTab);
    }
    __enhancedUiState.activeTab = nextTab;
    if(els.tabNewReleases){
      const active = nextTab === ENHANCED_TAB_NEW;
      els.tabNewReleases.classList.toggle('is-active', active);
      els.tabNewReleases.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if(els.tabCompilations){
      const active = nextTab === ENHANCED_TAB_COMPILATION;
      els.tabCompilations.classList.toggle('is-active', active);
      els.tabCompilations.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if(els.tabLabels){
      const active = nextTab === ENHANCED_TAB_LABELS;
      els.tabLabels.classList.toggle('is-active', active);
      els.tabLabels.setAttribute('aria-selected', active ? 'true' : 'false');
    }
    if(els.feedPanel){
      const active = nextTab === ENHANCED_TAB_NEW;
      els.feedPanel.hidden = !active;
      els.feedPanel.classList.toggle('is-active', active);
    }
    if(els.compilationPanel){
      const active = nextTab === ENHANCED_TAB_COMPILATION;
      els.compilationPanel.hidden = !active;
      els.compilationPanel.classList.toggle('is-active', active);
    }
    if(els.labelsPanel){
      const active = nextTab === ENHANCED_TAB_LABELS;
      els.labelsPanel.hidden = !active;
      els.labelsPanel.classList.toggle('is-active', active);
    }
    if(__enhancedDeferredPanelDirty.has(nextTab)){
      renderEnhancedPanelFromState(nextTab, { bindPreview: nextTab !== ENHANCED_TAB_COMPILATION || !window.__ENHANCED_SCAN_RUNNING__ });
    }
    persistEnhancedUiState();
    if(restoreScroll){
      requestAnimationFrame(() => {
        const top = Math.max(0, Number(__enhancedUiState.scrollTopByTab?.[nextTab] || 0));
        window.scrollTo(0, top);
      });
    }
  }

  function bindEnhancedTabUI(){
    if(els.tabNewReleases && !els.tabNewReleases.__enhancedTabBound){
      els.tabNewReleases.__enhancedTabBound = true;
      els.tabNewReleases.addEventListener('click', () => activateEnhancedTab(ENHANCED_TAB_NEW));
    }
    if(els.tabCompilations && !els.tabCompilations.__enhancedTabBound){
      els.tabCompilations.__enhancedTabBound = true;
      els.tabCompilations.addEventListener('click', () => activateEnhancedTab(ENHANCED_TAB_COMPILATION));
    }
    if(els.tabLabels && !els.tabLabels.__enhancedTabBound){
      els.tabLabels.__enhancedTabBound = true;
      els.tabLabels.addEventListener('click', () => activateEnhancedTab(ENHANCED_TAB_LABELS));
    }
    if(window.__ENHANCED_MODE__ && !window.__enhancedScrollBound){
      window.__enhancedScrollBound = true;
      window.addEventListener('scroll', () => {
        saveEnhancedTabScroll(__enhancedUiState.activeTab || ENHANCED_TAB_NEW);
      }, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if(document.hidden) {
          saveEnhancedTabScroll(__enhancedUiState.activeTab || ENHANCED_TAB_NEW);
          persistEnhancedUiState();
          return;
        }
        restoreEnhancedUiFromStateIfNeeded();
      });
      window.addEventListener('pageshow', () => {
        restoreEnhancedUiFromStateIfNeeded();
      });
      window.addEventListener('beforeunload', () => {
        saveEnhancedTabScroll(__enhancedUiState.activeTab || ENHANCED_TAB_NEW);
        persistEnhancedUiState();
      });
    }
  }

  function restoreEnhancedUiFromStateIfNeeded(force = false){
    const newCount = Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases.length : 0;
    const compilationCount = Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations.length : 0;
    const needsNewRestore = newCount > 0 && !els.feed?.querySelector('article.card');
    const needsCompilationRestore = compilationCount > 0 && !els.compilationFeed?.querySelector('article.card');
    const needsLabelsRestore = (newCount > 0 || compilationCount > 0) && !els.labelsFeed?.querySelector('section.card');
    if(force || needsNewRestore || needsCompilationRestore || needsLabelsRestore){
      renderEnhancedPanelsFromState();
      activateEnhancedTab(__enhancedUiState.activeTab || ENHANCED_TAB_NEW, { preserveCurrentScroll: false, restoreScroll: false });
      return true;
    }
    return false;
  }

  function restoreEnhancedUiState(){
    try{
      const raw = sessionStorage.getItem(ENHANCED_RUNTIME_STATE_KEY);
      if(!raw) return false;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed !== 'object') return false;
      const settings = loadSettings();
      const expectedBaseDate = settings.targetDate ? new Date(settings.targetDate) : new Date();
      expectedBaseDate.setHours(0, 0, 0, 0);
      const expectedRangeKey = buildEnhancedRangeCacheKey(expectedBaseDate, settings.daysRange);
      if(String(parsed?.rangeCacheKey || '') !== expectedRangeKey){
        try{ sessionStorage.removeItem(ENHANCED_RUNTIME_STATE_KEY); }catch{}
        return false;
      }
      __enhancedUiState = createEnhancedUiState();
      __enhancedUiState.activeTab = [ENHANCED_TAB_NEW, ENHANCED_TAB_COMPILATION, ENHANCED_TAB_LABELS].includes(parsed.activeTab)
        ? parsed.activeTab
        : ENHANCED_TAB_NEW;
      __enhancedUiState.scrollTopByTab = {
        [ENHANCED_TAB_NEW]: Math.max(0, Number(parsed?.scrollTopByTab?.[ENHANCED_TAB_NEW] || 0)),
        [ENHANCED_TAB_COMPILATION]: Math.max(0, Number(parsed?.scrollTopByTab?.[ENHANCED_TAB_COMPILATION] || 0)),
        [ENHANCED_TAB_LABELS]: Math.max(0, Number(parsed?.scrollTopByTab?.[ENHANCED_TAB_LABELS] || 0))
      };
      __enhancedUiState.newReleases = normalizeEnhancedBackendResults(parsed?.newReleases);
      __enhancedUiState.compilations = normalizeEnhancedBackendResults(parsed?.compilations);
      __enhancedUiState.stats = {
        artistsText: String(parsed?.stats?.artistsText ?? '0'),
        hitsText: String(parsed?.stats?.hitsText ?? '0'),
        albumsText: String(parsed?.stats?.albumsText ?? '0'),
        checkedAlbumsText: String(parsed?.stats?.checkedAlbumsText ?? '0'),
        elapsedText: String(parsed?.stats?.elapsedText ?? '00:00')
      };
      __enhancedUiState.updatedAt = Number(parsed?.updatedAt || 0);
      __enhancedUiState.rangeCacheKey = String(parsed?.rangeCacheKey || '');
      __enhancedRenderedKeys = new Set([...
        __enhancedUiState.newReleases,
        ...__enhancedUiState.compilations
      ].map(item => getEnhancedRenderKey(item)));
      renderEnhancedPanelsFromState();
      activateEnhancedTab(__enhancedUiState.activeTab, { preserveCurrentScroll: false, restoreScroll: false });
      return true;
    }catch{
      return false;
    }
  }

  // 绑定页面内“补充来源实时抓取”板块的引用
  function ensureLiveDialog(){
    els.liveSecList = document.getElementById('liveSecList');
    els.liveDynList = document.getElementById('liveDynList');
    els.liveSecCount = document.getElementById('liveSecCount');
    els.liveDynCount = document.getElementById('liveDynCount');
  }

  function liveReset(){
    try{
      ensureLiveDialog();
      if(els.liveSecList) els.liveSecList.innerHTML = '';
      if(els.liveDynList) els.liveDynList.innerHTML = '';
      if(els.liveSecCount) els.liveSecCount.textContent = '0';
      if(els.liveDynCount) els.liveDynCount.textContent = '0';
    }catch{}
  }

  function liveAppend(source, item){
    try{
      ensureLiveDialog();
      const liHtml = `
        <li>
          <a href="https://music.163.com/#/album?id=${escapeAttr(item.id)}" target="_blank" rel="noopener">${escapeHtml(item.name)}</a>
          <span class="by"> · ${escapeHtml(item.artistName)} · ${escapeHtml(item.type)} · ${formatDate(item.publishTime)}</span>
        </li>`;
      if(source === 'sec' && els.liveSecList){
        els.liveSecList.insertAdjacentHTML('beforeend', liHtml);
        if(els.liveSecCount){ els.liveSecCount.textContent = String(Number(els.liveSecCount.textContent||'0') + 1); }
      }else if(source === 'dyn' && els.liveDynList){
        els.liveDynList.insertAdjacentHTML('beforeend', liHtml);
        if(els.liveDynCount){ els.liveDynCount.textContent = String(Number(els.liveDynCount.textContent||'0') + 1); }
      }
    }catch{}
  }

  // 提取保存逻辑为独立函数
  function saveCurrentSettings(){
    const next = {
      scanBackendBase: (els.scanBackendBase?.value || '').trim(),
      corsProxyBase: (els.corsProxyBase?.value || '').trim(),
      apiBase: els.apiBase.value.trim(),
      cookie: normalizeNcmCookie(els.cookie.value.trim()),
      manualArtistIds: parseIds(els.manualArtistIds.value),
      daysRange: clampInt(els.daysRange?.value, 1, 30, 1),
      targetDate: (els.targetDate?.value || '').trim(),
      alwaysRefreshFollowed: Boolean(document.getElementById('alwaysRefreshFollowed')?.checked),
      skipRescanNextOnce: Boolean(document.getElementById('skipRescanNextOnce')?.checked),
      dualLineScan: Boolean(document.getElementById('dualLineScan')?.checked),
      ignoreSkip: Boolean(document.getElementById('ignoreSkip')?.checked),
      // Spotify 设置
      spotifyClientId: (document.getElementById('spotifyClientId')?.value || '').trim(),
      spotifyClientSecret: (document.getElementById('spotifyClientSecret')?.value || '').trim(),
      spotifyMarket: (document.getElementById('spotifyMarket')?.value || '').trim(),
      useAggregate: !!document.getElementById('useAggregate')?.checked,
      aggregateCookies: String(document.getElementById('aggregateCookies')?.value||'')
        .split(/\r?\n/)
        .map(s=>s.trim())
        .filter(Boolean),
      playlistSource: (document.getElementById('playlistSource')?.value || '').trim(),
      pinnedPlaylistIds: parseIds(document.getElementById('pinnedPlaylistIds')?.value || ''),
      useCachedPlaylistArtists: !!document.getElementById('useCachedPlaylistArtists')?.checked,
      onlyShowFollowedInFeed: !!document.getElementById('onlyShowFollowedInFeed')?.checked,
      reuseArtistCache: !!document.getElementById('reuseArtistCache')?.checked,
      smartScan: !!document.getElementById('smartScan')?.checked,
      concurrency: clampInt(document.getElementById('concurrency')?.value, 1, 20, 4),
    };
    const text = JSON.stringify(next);
    localStorage.setItem(LS_KEY, text);
    backupSettingsCookie(text);
    if(els.cookie) els.cookie.value = next.cookie || '';
    // 保存 Spotify 访问令牌
    try{
      const el = document.getElementById('spotifyAccessToken');
      if (el) {
          const t = el.value.trim();
          localStorage.setItem('__spotifyToken', t);
      }
    }catch{}
    return next;
  }

  function writeSettingsObject(next){
    const merged = {
      ...loadSettings(),
      ...(next || {})
    };
    merged.cookie = normalizeNcmCookie(merged.cookie || '');
    const text = JSON.stringify(merged);
    localStorage.setItem(LS_KEY, text);
    backupSettingsCookie(text);
    if(els.scanBackendBase && typeof merged.scanBackendBase === 'string') els.scanBackendBase.value = merged.scanBackendBase;
    if(els.corsProxyBase && typeof merged.corsProxyBase === 'string') els.corsProxyBase.value = merged.corsProxyBase;
    if(els.apiBase && typeof merged.apiBase === 'string') els.apiBase.value = merged.apiBase;
    if(els.cookie) els.cookie.value = merged.cookie || '';
    if(els.pinnedPlaylistIds) els.pinnedPlaylistIds.value = (Array.isArray(merged.pinnedPlaylistIds) ? merged.pinnedPlaylistIds : []).join(',');
    return merged;
  }

  // 任务：保存配置
  els.saveSettings?.addEventListener('click', (e) => {
    e.preventDefault();
    saveCurrentSettings();
    els.settingsDlg.close();
    alert('设置已保存');
  });

  function extractPlaylistId(input){
    if(!input) return null;
    const trimmed = String(input).trim();
    if(/^\d+$/.test(trimmed)) return Number(trimmed);
    try{
      const u = new URL(trimmed);
      // 先尝试常规查询参数
      let id = u.searchParams.get('id');
      if(id && /^\d+$/.test(id)) return Number(id);
      // 兼容网易云常见形式：id 位于 hash 片段（如 #/playlist?id=123）
      const h = u.hash || '';
      const m = h.match(/(?:[?&])id=(\d+)/);
      if(m && m[1]) return Number(m[1]);
      return null;
    }catch{ return null; }
  }

  function setPlaylistStatus(text){
    try{
      const el = document.getElementById('playlistImportStatus');
      if(el){ el.textContent = text; }
    }catch{}
  }

  async function fetchPlaylistArtistIds(cfg, sourceInput, token){
    const playlistId = extractPlaylistId(sourceInput);
    if(!cfg.apiBase || !playlistId) return [];
    const headers = undefined; // 浏览器无法设置 Cookie 头；使用 query 参数传递 cookie
    let totalTracks = null;
    let detail = null;
    const startTime = Date.now();
    const HARD_TIMEOUT_MS = 25000; // 全流程硬超时，避免卡死
    try{
      {
        const url = new URL(`/playlist/detail?id=${playlistId}`, cfg.apiBase);
        if(cfg.cookie) url.searchParams.set('cookie', cfg.cookie);
        // 提前拉多一些 tracks，避免默认返回太少导致无法解析
        url.searchParams.set('s', '1000');
        detail = await fetchJSON(url.toString(), headers);
      }
      const pl0 = detail?.playlist || detail?.result?.playlist || null;
      totalTracks = Number(pl0?.trackCount) || null;
      setPlaylistStatus(`已获取歌单详情：曲目数${totalTracks||'未知'}（ID=${playlistId}）`);
    }catch{}
    const limit = 1000; // 大列表分页
    let offset = 0;
    const artistIds = new Set();
    let page = 0;
    let consecutiveFail = 0;
    let fallbackToSongDetail = false;
    for(; page<100 && token===__runToken; page++){
      if(Date.now() - startTime > HARD_TIMEOUT_MS && artistIds.size === 0){
        setPlaylistStatus(`扫描超时，正在切换回退解析模式…`);
        fallbackToSongDetail = true; break;
      }
      const u = new URL('/playlist/track/all', cfg.apiBase);
      u.searchParams.set('id', String(playlistId));
      u.searchParams.set('limit', String(limit));
      u.searchParams.set('offset', String(offset));
      if(cfg.cookie) u.searchParams.set('cookie', cfg.cookie);
      let d;
      try{
        d = await fetchJSON(u.toString(), headers);
      }catch(e){
        consecutiveFail++;
        const errMsg = (e && e.message) ? String(e.message) : '未知错误';
        if(errMsg.includes('未登录') || errMsg.includes('301') || errMsg.includes('需要登录')){
             setPlaylistStatus(`歌单扫描失败：${errMsg}。请检查 Cookie。`);
             fallbackToSongDetail = false; 
             break;
        }
        setPlaylistStatus(`歌单曲目接口不可用或限流，正在重试（${consecutiveFail}）：${errMsg}`);
        updateDiagnostics({ phase: 'playlist-retry', offset, limit, strikes: consecutiveFail, error: errMsg, apiBase: cfg.apiBase });
        if(consecutiveFail >= 3){ fallbackToSongDetail = true; break; }
        await sleep(600);
        continue;
      }
      const songs = Array.isArray(d?.songs) ? d.songs : [];
      if(songs.length === 0){ break; }
      for(const s of songs){
        const ars = Array.isArray(s?.ar) ? s.ar : (Array.isArray(s?.artists) ? s.artists : []);
        for(const a of ars){ const id = Number(a?.id); if(Number.isFinite(id)) artistIds.add(id); }
      }
      offset += limit;
      if(token === __runToken){
        const fetched = offset;
        const expected = totalTracks || fetched;
        setLoadingStatus(`歌单导入艺人…已扫描曲目 ${Math.min(fetched, expected)} / 预计 ${expected}（ID=${playlistId}）`, Math.min(fetched, expected), expected);
        setPlaylistStatus(`扫描进度：${Math.min(fetched, expected)} / ${expected}`);
        bumpLoadingTimeout(token, calcTimeoutByTotal(artistIds.size));
        updateDiagnostics({ phase: 'playlist', offset, limit, length: songs.length, fetchedArtists: artistIds.size, expectedTotal: expected });
      }
      await sleep(120);
      if(Number.isFinite(totalTracks) && offset >= totalTracks) break;
    }
    // 回退方案：使用 /playlist/detail 的 trackIds + /song/detail 批量解析艺人
    if(fallbackToSongDetail && token===__runToken){
      setPlaylistStatus(`已触发回退解析模式（playlist/detail + song/detail）…`);
      try{
        if(!detail){
          const url = new URL(`/playlist/detail?id=${playlistId}`, cfg.apiBase);
          if(cfg.cookie) url.searchParams.set('cookie', cfg.cookie);
          // 回退模式下再试一次拉更多 tracks
          if(Number.isFinite(totalTracks) && totalTracks>0){ url.searchParams.set('s', String(Math.min(totalTracks, 2000))); } else { url.searchParams.set('s', '1000'); }
          detail = await fetchJSON(url.toString(), headers);
        }
      }catch{}
      const pl = detail?.playlist || detail?.result?.playlist || {};
      const trackIdsArr = Array.isArray(pl?.trackIds) ? pl.trackIds.map(x=>Number(x?.id)).filter(Number.isFinite) : [];
      let expected = Number.isFinite(totalTracks) ? totalTracks : (trackIdsArr.length || null);
      if(trackIdsArr.length === 0){
        // 尝试直接读取已包含的 tracks（部分后端返回，受 s 参数影响）
        const tracks = Array.isArray(pl?.tracks) ? pl.tracks : [];
        expected = tracks.length || expected || 0;
        for(const s of tracks){
          const ars = Array.isArray(s?.ar) ? s.ar : (Array.isArray(s?.artists) ? s.artists : []);
          for(const a of ars){ const id = Number(a?.id); if(Number.isFinite(id)) artistIds.add(id); }
        }
        // 若 tracks 仍为空，再尝试 privileges 兜底提取歌曲ID
        if(expected === 0){
          const privs = Array.isArray(pl?.privileges) ? pl.privileges : [];
          const songIdsFromPriv = privs.map(x=>Number(x?.id)).filter(Number.isFinite);
          if(songIdsFromPriv.length){
            expected = Number.isFinite(totalTracks) ? totalTracks : songIdsFromPriv.length;
            const chunkSize = 500;
            for(let i=0; i<songIdsFromPriv.length && token===__runToken; i+=chunkSize){
              const chunk = songIdsFromPriv.slice(i, i+chunkSize);
              const uu = new URL('/song/detail', cfg.apiBase);
              uu.searchParams.set('ids', chunk.join(','));
              if(cfg.cookie) uu.searchParams.set('cookie', cfg.cookie);
              let sd = {};
              try{ sd = await fetchJSON(uu.toString(), headers); }
              catch(e){ await sleep(800); continue; }
              const songs = Array.isArray(sd?.songs) ? sd.songs : [];
              for(const s of songs){
                const ars = Array.isArray(s?.ar) ? s.ar : (Array.isArray(s?.artists) ? s.artists : []);
                for(const a of ars){ const id = Number(a?.id); if(Number.isFinite(id)) artistIds.add(id); }
              }
              const fetched = Math.min(i+chunkSize, songIdsFromPriv.length);
              const exp = expected || songIdsFromPriv.length;
              setLoadingStatus(`歌单导入艺人（privileges 兜底）…已解析曲目 ${fetched} / 预计 ${exp}（ID=${playlistId}）`, fetched, exp);
              setPlaylistStatus(`解析进度（privileges）：${fetched} / ${exp}`);
              updateDiagnostics({ phase: 'playlist-fallback-priv', chunk: chunk.length, fetchedArtists: artistIds.size, fetchedTracks: fetched, expectedTotal: exp });
              await sleep(120);
            }
          }else{
            setPlaylistStatus(`无法解析歌单曲目：后端不返回 trackIds/tracks/privileges。请检查 apiBase（当前：${cfg.apiBase}）和 Cookie 权限。`);
          }
        }else{
          setPlaylistStatus(`已从歌单详情直接解析曲目：${expected} 条`);
        }
      }else{
        const chunkSize = 500;
        let fallbackFails = 0;
        for(let i=0; i<trackIdsArr.length && token===__runToken; i+=chunkSize){
          const chunk = trackIdsArr.slice(i, i+chunkSize);
          const uu = new URL('/song/detail', cfg.apiBase);
          uu.searchParams.set('ids', chunk.join(','));
          if(cfg.cookie) uu.searchParams.set('cookie', cfg.cookie);
          let sd = {};
          try{ sd = await fetchJSON(uu.toString(), headers); }
          catch(e){
            fallbackFails++;
            const errMsg = (e && e.message) ? String(e.message) : '未知错误';
            if(errMsg.includes('未登录') || errMsg.includes('301') || errMsg.includes('需要登录')){
                setPlaylistStatus(`歌单解析失败（回退模式）：${errMsg}`);
                break;
            }
            setPlaylistStatus(`解析曲目失败（回退，第${fallbackFails}次）：${errMsg}`);
            updateDiagnostics({ phase: 'playlist-fallback-retry', chunk: chunk.length, error: errMsg, apiBase: cfg.apiBase });
            if(fallbackFails >= 3){
              setPlaylistStatus(`回退解析连续失败，已终止。请检查 apiBase（${cfg.apiBase}）和 Cookie。`);
              break;
            }
            await sleep(800);
            continue;
          }
          const songs = Array.isArray(sd?.songs) ? sd.songs : [];
          for(const s of songs){
            const ars = Array.isArray(s?.ar) ? s.ar : (Array.isArray(s?.artists) ? s.artists : []);
            for(const a of ars){ const id = Number(a?.id); if(Number.isFinite(id)) artistIds.add(id); }
          }
          const fetched = Math.min(i+chunkSize, trackIdsArr.length);
          const exp = expected || trackIdsArr.length;
          setLoadingStatus(`歌单导入艺人（回退模式）…已解析曲目 ${fetched} / 预计 ${exp}（ID=${playlistId}）`, fetched, exp);
          setPlaylistStatus(`解析进度（回退）：${fetched} / ${exp}`);
          updateDiagnostics({ phase: 'playlist-fallback', chunk: chunk.length, fetchedArtists: artistIds.size, fetchedTracks: fetched, expectedTotal: exp });
          await sleep(120);
        }
      }
    }
    return Array.from(artistIds);
  }

  function readFollowedFromCache(){
    try{
      const raw = localStorage.getItem(FOLLOW_CACHE_KEY);
      if(raw){
        const obj = JSON.parse(raw);
        if(obj && Array.isArray(obj.ids)){
          return obj.ids.map(Number).filter(Number.isFinite);
        }
      }
    }catch{}
    return [];
  }

  async function loadOwnedArtistSourceCache(){
    try{
      const res = await fetch(resolveScanApi(VA_OWNED_ARTIST_CACHE_ENDPOINT), {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(Number).filter(id => Number.isFinite(id) && id > 0)
        : [];
      return {
        ids: Array.from(new Set(ids)),
        count: Number(body?.count || ids.length || 0),
        updatedAt: Number(body?.updatedAt || 0)
      };
    }catch(err){
      console.warn('[OwnedArtistCache] Failed to load local large cache:', err);
      return { ids: [], count: 0, updatedAt: 0 };
    }
  }

  function normalizeEnhancedArtistEntries(items){
    const seen = new Set();
    const list = [];
    for(const item of Array.isArray(items) ? items : []){
      const id = Number(item?.id || item?.artistId || item);
      if(!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      list.push({
        id,
        name: String(item?.name || item?.artistName || '').trim() || `艺人 ${id}`,
        albumSize: Number(item?.albumSize ?? -1)
      });
    }
    return list;
  }

  function readJsonCacheValue(key){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }catch{
      return null;
    }
  }

  async function resolveArtistsForEnhancedBackend(cfg, token){
    const manual = Array.isArray(cfg.manualArtistIds) ? cfg.manualArtistIds : [];
    let followed = [];
    let playlistIds = [];
    let reusedFollowCache = false;
    let reusedOwnedArtistCache = false;
    const followCached = readFollowedFromCache();
    const playlistObj = readJsonCacheValue(PLAYLIST_CACHE_KEY);
    const forceRefreshForSmartScan = cfg.smartScan && !cfg.skipRescanNextOnce;

    if(cfg.skipRescanNextOnce && followCached.length){
      followed = followCached.map(id => ({ id: Number(id), albumSize: -1 }));
      reusedFollowCache = true;
    }

    if(!reusedFollowCache && !cfg.alwaysRefreshFollowed && !forceRefreshForSmartScan && followCached.length){
      followed = followCached.map(id => ({ id: Number(id), albumSize: -1 }));
      reusedFollowCache = true;
    }

    const ownedArtistSource = await loadOwnedArtistSourceCache();
    if(ownedArtistSource.ids.length >= 9000 && ownedArtistSource.ids.length > followed.length){
      followed = ownedArtistSource.ids.map(id => ({ id: Number(id), albumSize: -1 }));
      reusedFollowCache = true;
      reusedOwnedArtistCache = true;
    }

    if(!reusedFollowCache){
      const followOnlyCfg = {
        ...cfg,
        manualArtistIds: [],
        playlistSource: '',
        onlyShowFollowedInFeed: true
      };
      followed = await resolveArtistIds(followOnlyCfg, token);
    }

    if(cfg.playlistSource && !cfg.onlyShowFollowedInFeed){
      const currentPlaylistId = extractPlaylistId(cfg.playlistSource);
      if(cfg.useCachedPlaylistArtists || cfg.reuseArtistCache || cfg.skipRescanNextOnce || currentPlaylistId){
        const sourceMatches = String(playlistObj?.sourceId || '') === String(currentPlaylistId || '');
        const cachedPlaylistIds = Array.isArray(playlistObj?.ids)
          ? (sourceMatches ? playlistObj.ids.map(Number).filter(id => Number.isFinite(id) && id > 0) : [])
          : [];
        if(cachedPlaylistIds.length){
          playlistIds = cachedPlaylistIds;
        }
      }
    }

    if(cfg.onlyShowFollowedInFeed){
      return {
        artists: normalizeEnhancedArtistEntries(followed),
        sourceLabel: reusedOwnedArtistCache ? '本地 9000+ 艺人大缓存' : (reusedFollowCache ? '关注缓存' : '关注艺人')
      };
    }

    const merged = new Map();
    manual.forEach(id => {
      const artistId = Number(id);
      if(Number.isFinite(artistId) && artistId > 0){
        merged.set(artistId, { id: artistId, name: `艺人 ${artistId}`, albumSize: -1 });
      }
    });
    normalizeEnhancedArtistEntries(followed).forEach(item => {
      if(!merged.has(item.id)) merged.set(item.id, item);
    });
    playlistIds.forEach(id => {
      const artistId = Number(id);
      if(Number.isFinite(artistId) && artistId > 0 && !merged.has(artistId)){
        merged.set(artistId, { id: artistId, name: `艺人 ${artistId}`, albumSize: -1 });
      }
    });

    const parts = [];
    if(manual.length) parts.push(`手动 ${manual.length}`);
    if(followed.length) parts.push(`${reusedOwnedArtistCache ? '本地大缓存' : (reusedFollowCache ? '关注缓存' : '关注')} ${followed.length}`);
    if(playlistIds.length) parts.push(`歌单缓存 ${playlistIds.length}`);

    return {
      artists: Array.from(merged.values()),
      sourceLabel: parts.join(' + ') || '增强页来源'
    };
  }

  async function runPlaylistImportTaskImpl(){
    try{
      const s = loadSettings();
      const srcEl = document.getElementById('playlistSource');
      const statusEl = document.getElementById('playlistImportStatus');
      const source = (srcEl?.value || s.playlistSource || '').trim();
      if(!source){ if(statusEl) statusEl.textContent = '请填写歌单 ID 或完整 URL'; alert('请先在设置中填写歌单 ID 或完整 URL'); return; }
      if(!s.apiBase){ if(statusEl) statusEl.textContent = '请填写 API 基地址'; alert('请先在设置中填写 API 基地址'); return; }
      const pid = extractPlaylistId(source);
      if(!pid){ if(statusEl) statusEl.textContent = '歌单链接无效：未找到有效的 ID 参数'; alert('歌单链接无效：请填写纯数字ID或包含 id=... 的完整URL'); return; }
      const token = ++__runToken; // 开启一次性任务，取消可能的进行中刷新
      let ids = [];
      // 运行时读取复选框，优先使用 UI 状态；无元素时回退到设置值
      const cachedEl = document.getElementById('useCachedPlaylistArtists');
      const useCached = cachedEl ? !!cachedEl.checked : !!s.useCachedPlaylistArtists;
      let triedUseCache = false; let foundCache = false;
      // 若选择使用缓存且缓存与当前歌单一致，则跳过扫描
      if(useCached){
        try{
          const raw = localStorage.getItem(PLAYLIST_CACHE_KEY);
          if(raw){
            const obj = JSON.parse(raw);
            if(obj && Array.isArray(obj.ids)){
              const cachedIds = obj.ids.map(Number).filter(Number.isFinite);
              if(cachedIds.length){
                ids = cachedIds;
                triedUseCache = true; foundCache = true;
                const idMatch = (String(obj.sourceId) === String(pid));
                const tip = idMatch
                  ? `一次性导入：使用缓存结果，跳过歌单扫描（ID=${pid}，缓存艺人 ${ids.length}）`
                  : `一次性导入：已选择使用缓存，缓存歌单ID与当前不一致（缓存 ${obj.sourceId}，当前 ${pid}），仍跳过扫描（缓存艺人 ${ids.length}）`;
                setLoadingStatus(tip, 0, ids.length);
                if(statusEl) statusEl.textContent = idMatch
                  ? `使用缓存的歌单艺人列表，已跳过扫描。`
                  : `已选择使用缓存，虽然缓存歌单ID与当前不一致，仍使用缓存并跳过扫描。`;
              }else{
                triedUseCache = true; foundCache = false;
              }
            }else{
              triedUseCache = true; foundCache = false;
            }
          }else{
            triedUseCache = true; foundCache = false;
          }
        }catch{ triedUseCache = true; foundCache = false; }
        // 若未命中缓存，尝试使用手动ID列表作为回退来源
        if((!Array.isArray(ids) || ids.length === 0)){
          const manual = Array.isArray(s.manualArtistIds) ? s.manualArtistIds.map(Number).filter(Number.isFinite) : [];
          if(manual.length){
            ids = Array.from(new Set(manual));
            setLoadingStatus(`一次性导入：使用手动ID列表（${ids.length}），跳过歌单扫描`, 0, ids.length);
            if(statusEl) statusEl.textContent = `使用手动ID列表作为来源，已跳过歌单扫描。`;
          }else if(triedUseCache){
            setLoadingStatus(`未找到缓存且手动列表为空，回退扫描…`, 0, 100);
            if(statusEl) statusEl.textContent = `未找到缓存且手动列表为空，将回退扫描。`;
          }
        }
      }
      if(!Array.isArray(ids) || ids.length === 0){
        setLoadingStatus(`一次性导入任务：开始扫描歌单（ID=${pid}）…`, 0, 100);
        if(statusEl) statusEl.textContent = '任务已启动：正在扫描歌单…';
        ids = await fetchPlaylistArtistIds(s, source, token);
        // 扫描完成后写入缓存（按歌单ID区分）
        try{ localStorage.setItem(PLAYLIST_CACHE_KEY, JSON.stringify({ ids: Array.from(new Set(ids||[])), sourceId: String(pid), ts: Date.now() })); }catch{}
      }
      const totalParsed = Array.isArray(ids) ? ids.length : 0;
      if(totalParsed === 0){
        const msg = `未解析到任何艺人：请检查 apiBase（当前：${s.apiBase}）、Cookie 权限与歌单ID（${pid}）。`;
        setLoadingStatus(`一次性导入失败：${msg}`, 0, 100);
        if(statusEl) statusEl.textContent = msg;
        alert(msg);
        return;
      }
      // 规则调整：
      // 1) 解析歌单全部艺人；
      // 2) 运行关注列表主扫描（刷新到最新，约 4900 上限）；
      // 3) 仅当“该艺人已关注，且不在之前的关注列表快照中”，才新增写入到手动ID列表。
      const prevFollowed = readFollowedFromCache() || [];
      const prevFollowedSet = new Set(prevFollowed);
      // 强制刷新关注列表（忽略缓存）
      // 在关注刷新阶段禁用歌单来源，避免重复触发歌单扫描
      const cfgForScan = { ...s, alwaysRefreshFollowed: true, playlistSource: '' };
      try{ await resolveArtistIds(cfgForScan, token); }catch{}
      const currFollowed = readFollowedFromCache() || [];
      const currFollowedSet = new Set(currFollowed);
      const uniqParsed = Array.from(new Set(ids||[]));
      const matchedFollowed = uniqParsed.filter(id => currFollowedSet.has(id));
      const newBeyondPrev = matchedFollowed.filter(id => !prevFollowedSet.has(id));
      const manualSet = new Set(Array.isArray(s.manualArtistIds) ? s.manualArtistIds : []);
      const alreadyInManual = newBeyondPrev.filter(id => manualSet.has(id)).length;
      const toAdd = newBeyondPrev.filter(id => !manualSet.has(id));
      for(const id of toAdd){ manualSet.add(id); }
      s.manualArtistIds = Array.from(manualSet);
      try{ const txt = JSON.stringify(s); localStorage.setItem(LS_KEY, txt); backupSettingsCookie(txt); }catch{}
      bindSettingsUI(s);
      const prevHitCount = matchedFollowed.length - newBeyondPrev.length;
      const theoreticalNewCount = newBeyondPrev.length;
      const addedCount = toAdd.length;
      const summary = `解析到艺人 ${uniqParsed.length}；已关注匹配 ${matchedFollowed.length}；旧关注快照命中 ${prevHitCount}；理论新增（已关注且不在旧快照） ${theoreticalNewCount}；已在手动列表 ${alreadyInManual}；本次实际写入 ${addedCount}`;
      setLoadingStatus(`一次性导入完成：${summary}`, addedCount, uniqParsed.length);
      if(statusEl) statusEl.textContent = `导入完成：${summary}。`;
      alert(`导入完成：${summary}。`);
    }catch(e){
      console.error(e);
      setLoadingStatus(`一次性导入失败：${e?.message||e}`, 0, 100);
      const statusEl = document.getElementById('playlistImportStatus');
      if(statusEl) statusEl.textContent = `导入失败：${e?.message||e}`;
      alert(`导入失败：${e?.message||e}`);
    }
  }
  window.runPlaylistImportTask = () => { runPlaylistImportTaskImpl(); };

  // 打开设置对话框
  els.openSettings?.addEventListener('click', () => {
    bindSettingsUI(loadSettings());
    try{ bindDiagnosticsUI(loadSettings()); }catch{}
    els.settingsDlg.showModal();
  });

  // 打开网易云网页（手动复制 Cookie 备选）
  els.openWeb?.addEventListener('click', () => {
    window.open('https://music.163.com/', '_blank');
  });

  // 打开/关闭实时窗口（非模态）
  (()=>{
    const btn = document.getElementById('openLive');
    if(btn){
      btn.addEventListener('click', () => {
        const sec = document.getElementById('liveFeed');
        if(sec){ sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    }
  })();

  // 按艺人名搜索并添加到手动列表
  els.addArtistByName?.addEventListener('click', async () => {
    const name = (els.manualArtistName?.value || '').trim();
    const base = (els.apiBase?.value || '').trim();
    const cookie = (els.cookie?.value || '').trim();
    if(!name){ alert('请输入艺人名'); return; }
    if(!base){ alert('请先填写 API 基地址'); return; }
    els.addArtistStatus.textContent = `正在搜索：${name}…`;
    try{
      const id = await searchArtistByName(base, cookie, name);
      if(id === -1){ els.addArtistStatus.textContent = `搜索接口不可用：请检查 API Base 是否支持 /cloudsearch 或 /search`; return; }
      if(!id){ els.addArtistStatus.textContent = `未找到艺人：${name}`; return; }
      const current = parseIds(els.manualArtistIds.value);
      if(!current.includes(id)){ current.push(id); }
      els.manualArtistIds.value = current.join(',');
      els.addArtistStatus.textContent = `已添加：${name}（ID ${id}）`;
    }catch(e){
      els.addArtistStatus.textContent = `搜索失败：${e?.message||e}`;
    }
  });

  // 导入/导出 IDs 辅助
  function setImportStatus(text){ if(els.importIdsStatus) els.importIdsStatus.textContent = text; }
  function parseIdsFromText(text){
    if(!text || typeof text !== 'string') return [];
    const tokens = text.match(/[0-9]+/g) || [];
    return Array.from(new Set(tokens.map(x=>Number(x)).filter(Number.isFinite)));
  }
  function downloadTextFile(filename, text){
    try{
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    }catch(e){ console.warn('下载文件失败', e); }
  }
  // 导入 IDs 文件
  els.btnImportIds?.addEventListener('click', (ev) => {
    ev.preventDefault();
    try{
      const fi = els.importIdsFile;
      if(!fi || !fi.files || !fi.files[0]){ setImportStatus('请选择包含艺人ID的文本文件'); return; }
      const f = fi.files[0];
      const reader = new FileReader();
      reader.onerror = ()=> setImportStatus('读取文件失败');
      reader.onload = ()=>{
        try{
          const text = String(reader.result||'');
          const imported = parseIdsFromText(text);
          const existing = parseIds(els.manualArtistIds?.value||'');
          const merged = Array.from(new Set([ ...existing, ...imported ]));
          if(els.manualArtistIds) els.manualArtistIds.value = merged.join(',');
          // 写入设置
          try{
            const s = loadSettings(); s.manualArtistIds = merged; const txt = JSON.stringify(s); localStorage.setItem(LS_KEY, txt); backupSettingsCookie(txt);
          }catch{}
          setImportStatus(`已导入 ${imported.length} 个ID，合并后 ${merged.length} 个`);
        }catch(e){ setImportStatus(`解析失败：${e?.message||e}`); }
      };
      reader.readAsText(f, 'utf-8');
    }catch(e){ setImportStatus(`导入失败：${e?.message||e}`); }
  });
  // 导出当前关注窗口快照
  els.btnExportFollow?.addEventListener('click', (ev) => {
    ev.preventDefault();
    try{
      const raw = localStorage.getItem(FOLLOW_CACHE_KEY);
      let ids = [];
      if(raw){ try{ const obj = JSON.parse(raw); if(Array.isArray(obj?.ids)) ids = obj.ids.map(Number).filter(Number.isFinite); }catch{} }
      const text = ids.join('\n');
      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0,19);
      const filename = `follow-window-${ts}.txt`;
      downloadTextFile(filename, text);
      setImportStatus(`已导出快照：${ids.length} 个ID`);
    }catch(e){ setImportStatus(`导出失败：${e?.message||e}`); }
  });

  els.btnExportFollowJson?.addEventListener('click', (ev) => {
    ev.preventDefault();
    try{
      const raw = localStorage.getItem(FOLLOW_CACHE_KEY);
      if(!raw){ setImportStatus('无缓存数据'); return; }
      // Validate JSON
      try{ JSON.parse(raw); }catch(e){ setImportStatus('缓存数据损坏'); return; }
      
      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0,19);
      const filename = `netease-follow-cache-${ts}.json`;
      downloadTextFile(filename, raw);
      setImportStatus(`已导出 JSON：${(raw.length/1024).toFixed(1)} KB`);
    }catch(e){ setImportStatus(`导出失败：${e?.message||e}`); }
  });

  // 按厂牌关键词检索当天发行并显示在扩展区
  els.fetchLabelToday?.addEventListener('click', async () => {
    const rawKeyword = (els.labelKeyword?.value || '').trim();
    const base = (els.apiBase?.value || '').trim();
    const cookie = (els.cookie?.value || '').trim();
    if(!rawKeyword){ alert('请输入厂牌关键词'); return; }
    if(!base){ alert('请先填写 API 基地址'); return; }
    const { word: keyword, exact } = parseKeywordMode(rawKeyword);
    els.labelSearchStatus.textContent = `正在检索厂牌：${rawKeyword}${exact?' · 严格匹配':''}（当天）…`;
    try{
      const now = new Date();
      const days = clampInt(els.daysRange?.value, 1, 30, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999).getTime();
      const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startDay.setDate(startDay.getDate() - (days - 1));
      const start = startDay.getTime();
      const cfg = { apiBase: base, cookie };
      const items = await fetchLabelTodayByKeyword(cfg, keyword, start, end);
      const enriched = await enrichAlbums(cfg, items);
      const onlyFollowed = !!els.labelOnlyFollowed?.checked;
      const key = keyword.toLowerCase().trim();
      const filtered = (enriched || []).filter(it => matchLabelKeyword(it, key, exact));
      let final = filtered;
      if(onlyFollowed){
        const set = new Set(parseIds(els.manualArtistIds.value));
        try{
          const raw = localStorage.getItem(FOLLOW_CACHE_KEY);
          const data = raw ? JSON.parse(raw) : null;
          if(Array.isArray(data?.ids)){
            for(const id of data.ids){ set.add(Number(id)); }
          }
        }catch{}
        final = filtered.filter(it => set.has(Number(it.artistId)));
      }
      renderGlobalFeed(final);
      let msg = `检索完成：共 ${final.length} 条（${rawKeyword}${exact?' · 严格匹配':''}${onlyFollowed?' · 仅关注':''}，范围${days}天）`;
      if(final.length === 0) msg += '；若无结果，建议尝试下方的 Spotify 检索功能。';
      els.labelSearchStatus.textContent = msg;
    }catch(e){
      els.labelSearchStatus.textContent = `检索失败：${e?.message||e}`;
    }
  });

  // 扫码登录（通过 NeteaseCloudMusicApi）
  els.qrLogin?.addEventListener('click', async () => {
    const cfg = loadSettings();
    // 直接读取当前输入框的值，未保存也可使用
    const base = (els.apiBase?.value?.trim() || cfg.apiBase || '').trim();
    if(!base){
      alert('请先填写 API 基地址');
      return;
    }
    // 验证 URL 有效性
    let apiBaseUrl;
    try {
      apiBaseUrl = new URL(base);
    } catch {
      alert('API 地址无效，请填写完整的地址，例如：http://localhost:3000');
      return;
    }
    // 若输入框与已保存值不一致，则临时使用输入值并写入设置，避免重复填入
    if(base !== cfg.apiBase){
      cfg.apiBase = base;
      try { const txt = JSON.stringify(cfg); localStorage.setItem(LS_KEY, txt); backupSettingsCookie(txt); } catch {}
      bindSettingsUI(cfg);
    }
    els.qrStatus.textContent = '正在生成二维码…';
    els.qrImg.src = '';
    els.qrDialog.showModal();
    try{
      const ts = Date.now();
      const keyData = await fetchJSON(new URL(`/login/qr/key?timestamp=${ts}`, apiBaseUrl));
      const key = keyData?.data?.unikey;
      if(!key) throw new Error('未获取到二维码 key');
      const createData = await fetchJSON(new URL(`/login/qr/create?key=${encodeURIComponent(key)}&qrimg=1&timestamp=${Date.now()}`, apiBaseUrl));
      const img = createData?.data?.qrimg;
      if(!img) throw new Error('未获取到二维码图片');
      els.qrImg.src = img;
      els.qrStatus.textContent = '请用手机网易云扫码并确认登录';

      // 轮询检查登录状态
      let stopped = false;
      const timer = setInterval(async () => {
        if(stopped) return;
        try{
          const checkUrl = new URL(`/login/qr/check?key=${encodeURIComponent(key)}&timestamp=${Date.now()}`, apiBaseUrl);
          const res = await fetchJSON(checkUrl, undefined, { acceptCodes: [800, 801, 802, 803] });
          const code = res?.code;
          if(code === 801){
            els.qrStatus.textContent = '等待扫码…';
          }else if(code === 802){
            els.qrStatus.textContent = '已扫码，等待确认…';
          }else if(code === 800){
            els.qrStatus.textContent = '二维码已过期，请重新生成';
            stopped = true; clearInterval(timer);
          }else if(code === 803){
            // 登录成功，API 通常返回 cookie 字段
            const cookie = normalizeNcmCookie(res?.cookie);
            if(cookie){
              let s = writeSettingsObject({ apiBase: apiBaseUrl.toString(), cookie });
              try{
                s = await refreshNcmCookie(s);
                const probe = await probeNcmAuth(s);
                els.qrStatus.textContent = probe?.cookie?.hasCsrf
                  ? '登录成功，Cookie 已补全写入设置'
                  : '登录成功，Cookie 已写入设置，但仍缺少 __csrf';
              }catch{
                bindSettingsUI(s);
                els.qrStatus.textContent = '登录成功，Cookie 已写入设置';
              }
            }else{
              els.qrStatus.textContent = '登录成功，但未返回 Cookie；可关闭后尝试刷新或手动粘贴';
            }
            stopped = true; clearInterval(timer);
            setTimeout(()=>{ els.qrDialog.close(); }, 800);
          }
        }catch(e){
          console.error(e);
          els.qrStatus.textContent = '检查登录状态失败：' + (e?.message || e);
        }
      }, 2000);

      // 关闭对话框时停止轮询
      els.qrDialog.addEventListener('close', () => { stopped = true; clearInterval(timer); }, { once: true });
    }catch(err){
      console.error(err);
      els.qrStatus.textContent = '生成或轮询失败：' + (err?.message || err);
    }
  });

  // 手动刷新
  els.refreshBtn?.addEventListener('click', async () => {
    await runDailyCheck();
  });
  els.pauseBtn?.addEventListener('click', () => {
    pauseCurrentEnhancedScan();
  });

  // Spotify 厂牌自动检索刷新
  els.refreshSpotifyAuto?.addEventListener('click', async () => {
    try{ autoFetchSpotifyPresetLabels(); }catch(e){ console.error(e); }
  });

  // Spotify 厂牌自动检索导出
  els.exportSpotifyAuto?.addEventListener('click', () => {
    if(!els.spotifyAutoFeed) return;
    const cards = els.spotifyAutoFeed.querySelectorAll('.card');
    if(!cards.length){ alert('暂无内容可导出'); return; }
    
    let text = `Spotify 厂牌自动检索结果（导出时间：${new Date().toLocaleString()}）\n\n`;
    cards.forEach(card => {
      let title = card.querySelector('.title')?.textContent?.trim() || '';
      // 移除 "Spotify · 分类 · " 前缀，只保留厂牌名和数量
      // 格式通常为: "Spotify · Category · LabelName（Count）"
      // 我们尝试保留最后一个 " · " 之后的内容，或者如果分割后超过2部分，取最后一部分
      const parts = title.split(' · ');
      if(parts.length >= 3){
        title = parts.slice(2).join(' · ');
      }

      text += `=== ${title} ===\n`;
      const items = card.querySelectorAll('ul.label-list li');
      items.forEach(li => {
        const linkEl = li.querySelector('a');
        const name = linkEl?.textContent?.trim() || '';
        // const href = linkEl?.getAttribute('href') || ''; // 用户不需要链接
        const meta = li.querySelector('.by')?.textContent?.trim() || '';
        text += `- ${name}${meta}\n`;
      });
      text += '\n';
    });
    
    // 复制到剪贴板
    navigator.clipboard.writeText(text).then(() => {
      alert(`已导出 ${cards.length} 个厂牌分组至剪贴板`);
    }).catch(err => {
      console.error('Copy failed', err);
      prompt('导出内容（请手动复制）：', text);
    });
  });


  // Spotify 厂牌检索
  els.spotifyLabelSearchBtn?.addEventListener('click', async () => {
    const cfg = loadSettings();
    const rawKeyword = (els.spotifyLabelKeyword?.value || '').trim();
    const { word: keyword, exact } = parseKeywordMode(rawKeyword);
    const days = clampInt(els.daysRange?.value, 1, 30, cfg.daysRange||1);
    
    // Check if we have a valid user token
    const userToken = localStorage.getItem('spotify_user_token');
    const hasUserToken = userToken && (Number(localStorage.getItem('spotify_user_token_expiry')||0) > Date.now());

    // If no user token, we need Client Credentials (ID + Secret)
    if(!hasUserToken && (!cfg.spotifyClientId || !cfg.spotifyClientSecret)){ 
        alert('请先登录 Spotify (推荐) 或填写 Client ID 与 Client Secret'); 
        return; 
    }
    
    if(!rawKeyword){ alert('请输入 Spotify 厂牌关键词'); return; }
    const statusEl = els.spotifyLabelStatus || els.labelSearchStatus;
    if(statusEl) statusEl.textContent = `Spotify 检索中：${rawKeyword}${exact?' · 严格匹配':''}（范围${days}天）…`;
    try{
      // If we have user token, fetchSpotifyToken will use it. 
      // If not, it tries Client Credentials. Passing empty secret is fine if we have user token, 
      // but fetchSpotifyToken might throw if it falls back to CC.
      const token = await fetchSpotifyToken(cfg.spotifyClientId, cfg.spotifyClientSecret || '');
      
      // [Mod] 接收详细的搜索结果对象
      const result = await searchSpotifyAlbumsByLabel(token, keyword, cfg.spotifyMarket || 'US', days, exact);
      const items = result.items || [];
      const debugInfo = result.debug || {};
      
      appendSpotifyLabelSection(items, rawKeyword, days, result.error);
      
      let msg = `Spotify 检索完成：有效 ${items.length} 条`;
      const rCount = (typeof debugInfo.rawCount === 'number') ? debugInfo.rawCount : 0;
      
      if(rCount === 0){
        msg += `（API返回 0 条，请检查厂牌名或市场设置）`;
      } else {
        msg += `（API返回 ${rCount} 条）`;
        if(items.length === 0 || items.length < rCount){
           msg += `\n过滤详情：日期不符 ${debugInfo.droppedDate||0} | 精度不足 ${debugInfo.droppedPrecision||0} | 厂牌不符 ${debugInfo.droppedLabel||0} | 严格匹配过滤 ${debugInfo.droppedStrict||0}`;
           if(debugInfo.dateRange) msg += `\n目标日期：${debugInfo.dateRange}`;
           if(debugInfo.validDates && debugInfo.validDates.length > 0 && debugInfo.validDates.length <= 5) msg += `\n期望日期集合：${debugInfo.validDates.join(', ')}`;
        }
      }
      if(result.error){
          msg += `\n[错误] ${result.error}`;
      }
      if(statusEl) statusEl.textContent = msg;
    }catch(e){
      console.error(e);
      if(statusEl) statusEl.textContent = `Spotify 检索失败：${e?.message||e}`;
    }
  });

  // 启动时执行一次，并注册每日0点自动刷新
  bindEnhancedTabUI();
  const restoredEnhancedState = restoreEnhancedUiState();
  // 先尝试加载目标日期缓存（留空则为今天）
  try{
    if(!restoredEnhancedState){
      const s = loadSettings();
      const baseDate = (s.targetDate ? new Date(s.targetDate) : new Date());
      baseDate.setHours(0,0,0,0);
      const rangedKey = buildEnhancedRangeCacheKey(baseDate, s.daysRange);
      const cached = localStorage.getItem(rangedKey);
      if(cached){
        const items = normalizeEnhancedBackendResults(JSON.parse(cached));
        if(Array.isArray(items) && items.length){
          __enhancedUiState.rangeCacheKey = rangedKey;
          setEnhancedItemsByTab(ENHANCED_TAB_NEW, items.filter(item => classifyEnhancedItem(item) === ENHANCED_TAB_NEW));
          setEnhancedItemsByTab(ENHANCED_TAB_COMPILATION, items.filter(item => classifyEnhancedItem(item) === ENHANCED_TAB_COMPILATION));
          __enhancedRenderedKeys = new Set(items.map(item => getEnhancedRenderKey(item)));
          updateEnhancedHeaderStats({
            artistsText: '0',
            hitsText: String(items.reduce((sum, item) => sum + Number(item?.trackCount || 0), 0)),
            albumsText: String(items.length),
            checkedAlbumsText: '0',
            elapsedText: '00:00'
          }, false);
          renderEnhancedPanelsFromState();
          activateEnhancedTab(__enhancedUiState.activeTab, { preserveCurrentScroll: false, restoreScroll: false });
          persistEnhancedUiState();
        }
      }
    }
  }catch{}
  runDailyCheck();
  startMidnightChecker();

  function loadSettings(){
    try{
      let raw = localStorage.getItem(LS_KEY);
      // 若当前端口的 localStorage 为空，尝试从 cookie 回退并迁移
      if(!raw){
        const fromCookie = readSettingsCookie();
        if(fromCookie){ try{ localStorage.setItem(LS_KEY, fromCookie); raw = fromCookie; }catch{} }
      }
      if(!raw) return { scanBackendBase: '', corsProxyBase: '', apiBase: 'http://127.0.0.1:3000', cookie: '', manualArtistIds: [], daysRange: 1, targetDate: '', alwaysRefreshFollowed: false, skipRescanNextOnce: false, ignoreSkip: false, spotifyClientId: '', spotifyClientSecret: '', spotifyMarket: 'US', useAggregate: false, aggregateCookies: [], playlistSource: '', pinnedPlaylistIds: [], useCachedPlaylistArtists: false, onlyShowFollowedInFeed: false };
      const obj = JSON.parse(raw);
      try{
        const legacyRestoreFlag = localStorage.getItem('restored_from_file_20260114_v1');
        const healedFlag = localStorage.getItem('enhanced_follow_source_recovered_v1');
        if(legacyRestoreFlag && !healedFlag){
          let changed = false;
          if(!obj.useAggregate){ obj.useAggregate = true; changed = true; }
          if(obj.skipRescanNextOnce){ obj.skipRescanNextOnce = false; changed = true; }
          if(obj.ignoreSkip){ obj.ignoreSkip = false; changed = true; }
          if(obj.alwaysRefreshFollowed){ obj.alwaysRefreshFollowed = false; changed = true; }
          if(changed){
            const healed = JSON.stringify(obj);
            localStorage.setItem(LS_KEY, healed);
            try{ backupSettingsCookie(healed); }catch{}
          }
          localStorage.setItem('enhanced_follow_source_recovered_v1', 'done');
          raw = localStorage.getItem(LS_KEY) || raw;
        }
        try{ localStorage.removeItem('follow_source_refresh_once_v1'); }catch{}
      }catch{}
      // 同步写入 cookie 备份，便于端口切换保留设置
      try{ backupSettingsCookie(raw); }catch{}
      // 将旧默认端口 8011 迁移为当前本地 API 端口 3000（并回写设置）
      try{
        if(!obj.apiBase || /127\.0\.0\.1:8011/.test(String(obj.apiBase))){
          obj.apiBase = 'http://127.0.0.1:3000';
          const migrated = JSON.stringify(obj);
          localStorage.setItem(LS_KEY, migrated);
          try{ backupSettingsCookie(migrated); }catch{}
        }
      }catch{}
      if(typeof obj.scanBackendBase !== 'string') obj.scanBackendBase = '';
      if(typeof obj.corsProxyBase !== 'string') obj.corsProxyBase = '';
      obj.manualArtistIds = Array.isArray(obj.manualArtistIds) ? obj.manualArtistIds : [];
      obj.cookie = normalizeNcmCookie(obj.cookie || '');
      obj.daysRange = clampInt(obj.daysRange, 1, 30, 1);
      if(typeof obj.targetDate !== 'string') obj.targetDate = '';
      obj.alwaysRefreshFollowed = Boolean(obj.alwaysRefreshFollowed);
      obj.skipRescanNextOnce = Boolean(obj.skipRescanNextOnce);
      obj.dualLineScan = Boolean(obj.dualLineScan);
      obj.ignoreSkip = Boolean(obj.ignoreSkip);
      obj.useAggregate = Boolean(obj.useAggregate);
      obj.aggregateCookies = Array.isArray(obj.aggregateCookies) ? obj.aggregateCookies : [];
      obj.useCachedPlaylistArtists = Boolean(obj.useCachedPlaylistArtists);
      obj.pinnedPlaylistIds = Array.isArray(obj.pinnedPlaylistIds) ? obj.pinnedPlaylistIds.map(Number).filter(id => Number.isFinite(id) && id > 0) : [];
      obj.onlyShowFollowedInFeed = Boolean(obj.onlyShowFollowedInFeed);
      obj.reuseArtistCache = Boolean(obj.reuseArtistCache);
      obj.smartScan = obj.smartScan !== undefined ? Boolean(obj.smartScan) : true;
      obj.concurrency = clampInt(obj.concurrency, 1, 20, 4);
      // Spotify 设置兜底
      if(!obj.spotifyClientId) obj.spotifyClientId = '668aaab2a5ac4085aae1146e29c19193';
      if(!obj.spotifyClientSecret) obj.spotifyClientSecret = 'ca8df2ff33e34954b9f8782c8257624d';
      obj.spotifyMarket = (typeof obj.spotifyMarket === 'string' && obj.spotifyMarket) ? obj.spotifyMarket : 'US';
      return obj;
    }catch{
      return { scanBackendBase: '', corsProxyBase: '', apiBase: 'http://127.0.0.1:3000', cookie: '', manualArtistIds: [], daysRange: 1, targetDate: '', alwaysRefreshFollowed: false, skipRescanNextOnce: false, ignoreSkip: false, spotifyClientId: '668aaab2a5ac4085aae1146e29c19193', spotifyClientSecret: 'ca8df2ff33e34954b9f8782c8257624d', spotifyMarket: 'US', useAggregate: false, aggregateCookies: [], playlistSource: '', pinnedPlaylistIds: [], useCachedPlaylistArtists: false, onlyShowFollowedInFeed: false, reuseArtistCache: false, smartScan: true, concurrency: 4 };
    }
  }

  function bindSettingsUI(s){
    if(els.scanBackendBase) els.scanBackendBase.value = s.scanBackendBase || '';
    if(els.corsProxyBase) els.corsProxyBase.value = s.corsProxyBase || '';
    els.apiBase.value = s.apiBase || '';
    els.cookie.value = s.cookie || '';
    els.manualArtistIds.value = (s.manualArtistIds||[]).join(',');
    if(els.daysRange) els.daysRange.value = String(s.daysRange||1);
    const td = document.getElementById('targetDate'); if(td){ td.value = s.targetDate || ''; }
    const alwaysEl = document.getElementById('alwaysRefreshFollowed');
    if(alwaysEl){ alwaysEl.checked = Boolean(s.alwaysRefreshFollowed); }
    const skipOnceEl = document.getElementById('skipRescanNextOnce');
    if(skipOnceEl){ skipOnceEl.checked = Boolean(s.skipRescanNextOnce); }
    const dlScan = document.getElementById('dualLineScan');
    if(dlScan){ dlScan.checked = Boolean(s.dualLineScan); }
    if(els.concurrency) els.concurrency.value = s.concurrency || '';
    const ign = document.getElementById('ignoreSkip'); if(ign){ ign.checked = Boolean(s.ignoreSkip); }
    // Spotify 设置
    const sid = document.getElementById('spotifyClientId'); if(sid){ sid.value = s.spotifyClientId || ''; }
    const ssec = document.getElementById('spotifyClientSecret'); if(ssec){ ssec.value = s.spotifyClientSecret || ''; }
    const sm = document.getElementById('spotifyMarket'); if(sm){ sm.value = s.spotifyMarket || 'US'; }
    const ua = document.getElementById('useAggregate'); if(ua){ ua.checked = !!s.useAggregate; }
    const ac = document.getElementById('aggregateCookies'); if(ac){ ac.value = (Array.isArray(s.aggregateCookies)?s.aggregateCookies:[]).join('\n'); }
    const ps = document.getElementById('playlistSource'); if(ps){ ps.value = s.playlistSource || ''; }
    if(els.pinnedPlaylistIds){ els.pinnedPlaylistIds.value = (Array.isArray(s.pinnedPlaylistIds) ? s.pinnedPlaylistIds : []).join(','); }
    const ucp = document.getElementById('useCachedPlaylistArtists'); if(ucp){ ucp.checked = !!s.useCachedPlaylistArtists; }
    const osf = document.getElementById('onlyShowFollowedInFeed'); if(osf){ osf.checked = !!s.onlyShowFollowedInFeed; }
    const rac = document.getElementById('reuseArtistCache'); if(rac){ rac.checked = !!s.reuseArtistCache; }
    const ss = document.getElementById('smartScan'); if(ss){ ss.checked = s.smartScan !== false; } // Default true
    // 绑定诊断按钮
    bindDiagnosticsUI(s);
    // 绑定 Spotify 登录按钮
    bindSpotifyLoginUI(s);
  }

  function getCanonicalRedirectUri(){
      // 允许 GitHub Pages / HTTPS 域名；Spotify App 后台需要把这个 URL 加入 Redirect URIs 白名单
      return window.location.origin + window.location.pathname;
  }

  function bindSpotifyLoginUI(s){
    const btn = document.getElementById('btnSpotifyLogin');
    if(!btn) return;
    
    // Check if logged in
    const userToken = localStorage.getItem('spotify_user_token');
    const expiry = Number(localStorage.getItem('spotify_user_token_expiry') || '0');
    const isLoggedIn = userToken && Date.now() < expiry;
    
    if(isLoggedIn){
        btn.textContent = '已登录 (点击注销)';
        btn.style.backgroundColor = '#2ecc71';
        btn.style.borderColor = '#27ae60';
        btn.style.color = '#fff';
    } else {
        btn.textContent = '登录 Spotify';
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
        btn.style.color = '';
    }

    btn.onclick = async () => {
        if(isLoggedIn){
            if(confirm('确定要注销 Spotify 登录吗？')){
                localStorage.removeItem('spotify_user_token');
                localStorage.removeItem('spotify_user_token_expiry');
                localStorage.removeItem('spotify_refresh_token');
                bindSpotifyLoginUI(s); // Refresh UI
                alert('已注销');
            }
            return;
        }
        
        const clientId = document.getElementById('spotifyClientId').value.trim();
        if(!clientId){ alert('请先在上方填写 Spotify Client ID'); return; }
        
        // Use standard canonical redirect URI
        const redirectUri = getCanonicalRedirectUri();
        
        const scope = 'user-read-private user-read-email';
        
        // Save settings before redirect to ensure they persist
        if(typeof saveCurrentSettings === 'function') saveCurrentSettings();

        // PKCE Flow
        const codeVerifier = generateRandomString(128);
        const codeChallenge = await generateCodeChallenge(codeVerifier);
        
        localStorage.setItem('spotify_pkce_verifier', codeVerifier);
        localStorage.setItem('spotify_client_id_temp', clientId); // Store Client ID temporarily
        
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: clientId,
            scope: scope,
            redirect_uri: redirectUri,
            code_challenge_method: 'S256',
            code_challenge: codeChallenge
        });
        
        window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
    };
  }

  // 统一更新加载状态与进度（兼容增强版与稳定版）
  function setLoadingStatus(text, current, total){
    const percent = (Number.isFinite(total) && total>0)
      ? Math.max(0, Math.min(100, Math.round((current||0)/total*100)))
      : (Number.isFinite(current) ? Math.max(0, Math.min(100, Math.round(current))) : 0);
    const textEl = document.getElementById('progressText') || document.getElementById('loadingText');
    if(textEl){ textEl.textContent = text; }
    // 不再在增强版中用状态驱动进度条；统一由 setLoadingProgress 推进“加载进度”。
    // 这里仅更新提示文本（progressText / loadingText）。
  }

  function updateEnhancedScanControls(running){
    if(!els.pauseBtn) return;
    els.pauseBtn.disabled = !running;
    els.pauseBtn.textContent = running ? '暂停扫描' : '暂停扫描';
  }

  function markEnhancedScanStarted(token){
    __enhancedScanRunningToken = token;
    __enhancedBackendRenderSignature = '';
    __enhancedRenderedKeys = new Set();
    updateEnhancedScanControls(true);
  }

  function markEnhancedScanFinished(token){
    if(token && token !== __enhancedScanRunningToken) return;
    __enhancedScanRunningToken = 0;
    __enhancedBackendTaskId = '';
    __enhancedBackendTaskConfig = null;
    updateEnhancedScanControls(false);
  }

  function pauseCurrentEnhancedScan(){
    if(!__enhancedScanRunningToken) return;
    const activeToken = __enhancedScanRunningToken;
    __runToken++;
    __enhancedScanRunningToken = 0;
    if(__loadingTimer){ try{ clearTimeout(__loadingTimer); }catch{} __loadingTimer = null; }
    updateEnhancedScanControls(false);
    if(__enhancedBackendTaskId && __enhancedBackendTaskConfig){
      stopEnhancedBackendScan(__enhancedBackendTaskConfig).catch(err => console.warn('[Enhanced] Failed to stop backend scan:', err));
    }
    const textEl = document.getElementById('progressText') || document.getElementById('loadingText');
    if(textEl) textEl.textContent = '已暂停当前扫描，可重新点击“立即刷新”继续。';
    console.log(`[Enhanced] Scan paused at token ${activeToken}`);
  }

  async function fetchEnhancedBackendStatus(taskConfig){
    const url = (taskConfig && typeof taskConfig.resolve === 'function')
      ? taskConfig.resolve(taskConfig.statusEndpoint)
      : resolveScanApi(taskConfig.statusEndpoint);
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });
    const body = await res.json().catch(() => ({}));
    if(!res.ok){
      throw new Error(body?.message || body?.msg || `HTTP ${res.status}`);
    }
    return body;
  }

  async function stopEnhancedBackendScan(taskConfig = __enhancedBackendTaskConfig){
    if(!taskConfig?.stopEndpoint){
      return { code: 200, message: '当前没有可停止的后端任务。' };
    }
    const url = (typeof taskConfig.resolve === 'function')
      ? taskConfig.resolve(taskConfig.stopEndpoint)
      : resolveScanApi(taskConfig.stopEndpoint);
    const body = await postJSON(url, {}, undefined, {
      credentials: 'include'
    });
    return body;
  }

  async function ensureEnhancedBackendTaskIdle(taskConfig){
    const snapshot = await fetchEnhancedBackendStatus(taskConfig).catch(() => ({ code: 404 }));
    if(Number(snapshot?.code || 404) !== 200 || !snapshot?.running){
      return;
    }
    console.warn(`[Enhanced] Found existing ${taskConfig.phase} backend task, stopping it before restart.`);
    await stopEnhancedBackendScan(taskConfig);
    for(let attempt = 0; attempt < 20; attempt++){
      await sleep(500);
      const next = await fetchEnhancedBackendStatus(taskConfig).catch(() => ({ code: 404 }));
      if(Number(next?.code || 404) !== 200 || !next?.running){
        return;
      }
    }
    throw new Error(taskConfig.idleErrorText || '旧的后端扫描任务仍未停止，请稍后重试。');
  }

  async function startEnhancedBackendScan(payload, taskConfig){
    for(let attempt = 0; attempt < 2; attempt++){
      const url = (typeof taskConfig.resolve === 'function')
        ? taskConfig.resolve(taskConfig.startEndpoint)
        : resolveScanApi(taskConfig.startEndpoint);
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      });
      const body = await res.json().catch(() => ({}));
      if(Number(body?.code || 200) === 200){
        if(body?.task?.id) __enhancedBackendTaskId = String(body.task.id);
        __enhancedBackendTaskConfig = taskConfig;
        return body.task;
      }
      const msg = String(body?.message || body?.msg || body?.error || taskConfig.startErrorText || '启动后端扫描失败');
      if((Number(body?.code || 0) === 409 || Number(res.status || 0) === 409) && taskConfig.conflictPattern?.test(msg) && attempt === 0){
        await ensureEnhancedBackendTaskIdle(taskConfig);
        continue;
      }
      if(!res.ok){
        throw new Error(`请求失败 ${res.status}: ${msg}`);
      }
      throw new Error(msg);
    }
    throw new Error(taskConfig.startErrorText || '启动后端扫描失败，请稍后重试。');
  }

  function normalizeEnhancedBackendResults(items){
    return (Array.isArray(items) ? items : []).map(item => {
      const tracks = normalizeTrackList(item?.tracks);
      const actualArtistNames = normalizeNameList(item?.actualArtistNames || item?.albumArtists);
      const sourceArtistNames = normalizeNameList(item?.sourceArtistNames || item?.sourceArtistName || item?.artistName);
      const label = String(item?.label || item?.company || '').trim();
      const normalized = {
        id: Number(item?.id || item?.albumId || 0),
        name: String(item?.name || item?.albumName || '未知专辑'),
        picUrl: String(item?.picUrl || item?.albumPicUrl || ''),
        publishTime: Number(item?.publishTime || 0),
        artistName: String(item?.artistName || '').trim() || actualArtistNames.join(' / ') || sourceArtistNames.join(' / ') || `艺人 ${Number(item?.artistId || 0) || ''}`.trim(),
        artistId: Number(item?.artistId || 0),
        link: String(item?.link || item?.albumLink || item?.songLink || ''),
        source: String(item?.source || '后端快速扫描'),
        type: String(item?.type || '扫描新作'),
        tracks,
        trackCount: Number(item?.trackCount || tracks.length || 0),
        resultTab: item?.resultTab === ENHANCED_TAB_COMPILATION ? ENHANCED_TAB_COMPILATION : (item?.resultTab === ENHANCED_TAB_NEW ? ENHANCED_TAB_NEW : undefined),
        label,
        company: label,
        actualArtistNames,
        sourceArtistNames,
        isOwnedRelease: Boolean(item?.isOwnedRelease)
      };
      const tab = classifyEnhancedItem(normalized);
      normalized.resultTab = tab;
      normalized.type = tab === ENHANCED_TAB_COMPILATION ? '扫描合辑' : '扫描新作';
      return normalized;
    }).sort((a, b) => Number(b.publishTime || 0) - Number(a.publishTime || 0));
  }

  function getEnhancedRenderKey(item){
    const tab = item?.resultTab === ENHANCED_TAB_COMPILATION
      ? ENHANCED_TAB_COMPILATION
      : (item?.resultTab === ENHANCED_TAB_NEW ? ENHANCED_TAB_NEW : classifyEnhancedItem(item));
    return `${tab}|${Number(item?.id || 0)}|${String(item?.link || '')}`;
  }

  function resetEnhancedCompilationAggregation(taskId = ''){
    __enhancedCompilationAggregateTaskId = String(taskId || '');
    __enhancedCompilationAggregateRawCount = 0;
    __enhancedCompilationAggregateBuckets = new Map();
    __enhancedCompilationAggregateItems = [];
    __enhancedCompilationAggregateDirty = false;
  }

  function materializeEnhancedCompilationAggregation(){
    if(!__enhancedCompilationAggregateDirty) return __enhancedCompilationAggregateItems;
    __enhancedCompilationAggregateItems = Array.from(__enhancedCompilationAggregateBuckets.values()).map(item => ({
      id: item.id,
      name: item.name,
      picUrl: item.picUrl,
      publishTime: item.publishTime,
      artistId: item.artistId,
      artistName: Array.from(item._artistNames).join(' / ') || Array.from(item._actualArtistNames).join(' / ') || '未知艺人',
      link: item.link,
      source: item.source,
      type: item.type,
      tracks: item.tracks.slice(),
      trackCount: item.tracks.length,
      label: item.label,
      company: item.company,
      actualArtistNames: Array.from(item._actualArtistNames),
      sourceArtistNames: Array.from(item._sourceArtistNames),
      resultTab: ENHANCED_TAB_COMPILATION,
      isOwnedRelease: false
    })).sort((a, b) => Number(b.publishTime || 0) - Number(a.publishTime || 0));
    __enhancedCompilationAggregateDirty = false;
    return __enhancedCompilationAggregateItems;
  }

  function mergeCompilationResultsForEnhanced(items, taskId = ''){
    const nextTaskId = String(taskId || '');
    const source = Array.isArray(items) ? items : [];
    const canReuse = nextTaskId
      && nextTaskId === __enhancedCompilationAggregateTaskId
      && source.length >= __enhancedCompilationAggregateRawCount;
    if(!canReuse){
      resetEnhancedCompilationAggregation(nextTaskId);
    } else if(nextTaskId){
      __enhancedCompilationAggregateTaskId = nextTaskId;
    }
    for(let index = __enhancedCompilationAggregateRawCount; index < source.length; index += 1){
      const item = source[index];
      const key = String(item?.albumId || item?.albumLink || item?.songLink || '');
      if(!key) continue;
      if(!__enhancedCompilationAggregateBuckets.has(key)){
        __enhancedCompilationAggregateBuckets.set(key, {
          id: Number(item?.albumId || 0),
          name: String(item?.albumName || '未知专辑'),
          picUrl: String(item?.albumPicUrl || ''),
          publishTime: Number(item?.publishTime || 0),
          artistId: Number(item?.artistId || 0),
          link: String(item?.albumLink || item?.songLink || ''),
          source: '后端合辑扫描',
          type: '扫描合辑',
          tracks: [],
          label: String(item?.company || '').trim(),
          company: String(item?.company || '').trim(),
          _artistNames: new Set(),
          _actualArtistNames: new Set(),
          _sourceArtistNames: new Set(),
          _trackIds: new Set()
        });
      }
      const bucket = __enhancedCompilationAggregateBuckets.get(key);
      const nextPublishTime = Number(item?.publishTime || 0);
      if(nextPublishTime > Number(bucket.publishTime || 0)) bucket.publishTime = nextPublishTime;
      if(!bucket.picUrl && item?.albumPicUrl) bucket.picUrl = String(item.albumPicUrl);
      if(!bucket.link && (item?.albumLink || item?.songLink)) bucket.link = String(item.albumLink || item.songLink);
      if(!bucket.label && item?.company) bucket.label = String(item.company).trim();
      if(!bucket.company && item?.company) bucket.company = String(item.company).trim();
      const nextArtistName = String(item?.artistName || '').trim();
      if(nextArtistName) bucket._artistNames.add(nextArtistName);
      normalizeNameList(item?.actualArtistNames || item?.albumArtists).forEach(name => bucket._actualArtistNames.add(name));
      normalizeNameList(item?.sourceArtistNames || item?.sourceArtistName || item?.artistName).forEach(name => bucket._sourceArtistNames.add(name));
      const trackId = Number(item?.songId || 0);
      const trackKey = trackId > 0 ? `id:${trackId}` : `link:${String(item?.songLink || '')}`;
      if(trackKey && !bucket._trackIds.has(trackKey)){
        bucket._trackIds.add(trackKey);
        if(trackId > 0 || item?.songLink){
          bucket.tracks.push({
            id: trackId,
            name: String(item?.songName || '未命名单曲'),
            artists: nextArtistName,
            link: String(item?.songLink || '')
          });
        }
      }
      __enhancedCompilationAggregateDirty = true;
    }
    __enhancedCompilationAggregateRawCount = source.length;
    return materializeEnhancedCompilationAggregation();
  }

  function groupCompilationResultsForEnhanced(items){
    resetEnhancedCompilationAggregation('');
    return mergeCompilationResultsForEnhanced(items, '');
  }

  function normalizeEnhancedPhaseResults(items, taskConfig, snapshot){
    if(taskConfig?.phase === 'compilation'){
      return mergeCompilationResultsForEnhanced(items, String(snapshot?.id || ''));
    }
    return normalizeEnhancedBackendResults(items).map(item => ({
      ...item,
      resultTab: ENHANCED_TAB_NEW,
      type: '扫描新作'
    }));
  }

  function flushEnhancedCompilationSection(){
    __enhancedCompilationFlushTimer = null;
    renderFeedSection(
      ENHANCED_TAB_COMPILATION,
      __enhancedCompilationFlushItems,
      getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, __enhancedCompilationFlushItems.length ? 'idle' : 'loading'),
      { bindPreview: __enhancedCompilationFlushBindPreview }
    );
  }

  function scheduleEnhancedCompilationSection(items, opts = {}){
    __enhancedCompilationFlushItems = Array.isArray(items) ? items : [];
    __enhancedCompilationFlushBindPreview = Boolean(opts.bindPreview);
    if(opts.deferHidden && (__enhancedUiState.activeTab || ENHANCED_TAB_NEW) !== ENHANCED_TAB_COMPILATION){
      __enhancedDeferredPanelDirty.add(ENHANCED_TAB_COMPILATION);
      return;
    }
    if(__enhancedCompilationFlushTimer) return;
    __enhancedCompilationFlushTimer = setTimeout(flushEnhancedCompilationSection, 160);
  }

  function applyEnhancedBackendSnapshot(snapshot, sourceTotal, token = __runToken, taskConfig = ENHANCED_NEW_SCAN_CONFIG){
    if(!snapshot || Number(snapshot?.code || 200) !== 200) return [];
    if(snapshot?.id) __enhancedBackendTaskId = String(snapshot.id);
    const done = Math.min(Number(snapshot?.done || 0), Number(sourceTotal || snapshot?.total || 0));
    const total = Math.max(done, Number(sourceTotal || snapshot?.total || 0));
    const hasResultPayload = Array.isArray(snapshot?.results);
    const items = hasResultPayload
      ? normalizeEnhancedPhaseResults(snapshot?.results, taskConfig, snapshot)
      : (taskConfig?.phase === 'compilation'
        ? (Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations : [])
        : (Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases : []));
    const checkedAlbumCount = Number(snapshot?.checkedAlbumCount || (Number(snapshot?.albumCacheHitCount || 0) + Number(snapshot?.albumCacheMissCount || 0)));
    updateEnhancedHeaderStats({
      artistsText: snapshot?.running ? `${done}/${total}` : String(total),
      hitsText: String(taskConfig?.phase === 'compilation' ? Number(snapshot?.hits || 0) : Number(snapshot?.matchedTrackCount || snapshot?.hits || 0)),
      albumsText: String(Number(snapshot?.resultAlbumCount || items.length || 0)),
      checkedAlbumsText: String(checkedAlbumCount),
      elapsedText: formatElapsedMs(snapshot?.elapsedMs || 0)
    }, false);
    if(taskConfig?.phase === 'compilation'){
      setEnhancedItemsByTab(ENHANCED_TAB_COMPILATION, items);
      if(items.length || snapshot?.running){
        scheduleEnhancedCompilationSection(items, {
          bindPreview: !snapshot?.running,
          deferHidden: snapshot?.running
        });
      } else if(!snapshot?.running){
        renderFeedSection(ENHANCED_TAB_COMPILATION, [], getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, 'empty'), { bindPreview: false });
      }
      if(!snapshot?.running){
        __enhancedBackendRenderSignature = `done:${items.length}`;
      }
    } else if(items.length){
      const newItems = [];
      for(const item of items){
        const key = getEnhancedRenderKey(item);
        if(__enhancedRenderedKeys.has(key)) continue;
        __enhancedRenderedKeys.add(key);
        newItems.push(item);
      }
      if(newItems.length){
        renderFeedAppend(newItems, {
          forceTab: taskConfig.forceTab,
          refreshLabels: taskConfig?.appendOptions?.refreshLabels !== false,
          persist: taskConfig?.appendOptions?.persist !== false,
          bindPreview: taskConfig?.appendOptions?.bindPreview !== false,
          batchSize: taskConfig?.appendOptions?.batchSize
        });
      }
      if(!snapshot?.running){
        __enhancedBackendRenderSignature = `done:${items.length}`;
      }
    } else if(!snapshot?.running){
      __enhancedBackendRenderSignature = 'empty';
      renderFeedSection(taskConfig.forceTab, [], getEnhancedEmptyMessage(taskConfig.forceTab, 'empty'));
      renderLabelsFeed([...(Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases : []), ...(Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations : [])]);
    }
    if(total > 0){
      bumpLoadingTimeout(token, calcTimeoutByTotal(total));
    }
    if(total > 0){
      setLoadingProgress(done, total);
      const ownedHit = Number(snapshot?.ownedCacheHitCount || 0);
      const ownedMiss = Number(snapshot?.ownedCacheMissCount || 0);
      const albumHit = Number(snapshot?.albumCacheHitCount || 0);
      const albumMiss = Number(snapshot?.albumCacheMissCount || 0);
      const songHit = Number(snapshot?.songCacheHitCount || 0);
      const songMiss = Number(snapshot?.songCacheMissCount || 0);
      const taskConcurrency = Math.max(1, Number(snapshot?.concurrency || 0) || (taskConfig?.phase === 'compilation' ? 4 : 4));
      const albumText = Number(snapshot?.resultAlbumCount || items.length || 0);
      const text = taskConfig?.phase === 'compilation'
        ? (snapshot?.running
          ? `${taskConfig.runningProgressLabel}：艺人 ${done}/${total} · 并发 ${taskConcurrency} · 专辑 ${albumText} · songs ${songHit}/${songMiss} · owned ${ownedHit}/${ownedMiss} · album ${albumHit}/${albumMiss}`
          : `${taskConfig.doneProgressLabel}：艺人 ${total}/${total} · 并发 ${taskConcurrency} · 专辑 ${albumText} · songs ${songHit}/${songMiss} · owned ${ownedHit}/${ownedMiss} · album ${albumHit}/${albumMiss}`)
        : (snapshot?.running
          ? `${taskConfig.runningProgressLabel}：艺人 ${done}/${total} · 并发 ${taskConcurrency} · 专辑 ${albumText}`
          : `${taskConfig.doneProgressLabel}：艺人 ${total}/${total} · 并发 ${taskConcurrency} · 专辑 ${albumText}`);
      const textEl = document.getElementById('progressText') || document.getElementById('loadingText');
      if(textEl) textEl.textContent = text;
    }
    updateDiagnostics({
      phase: taskConfig?.phase === 'compilation' ? 'enhanced-va-scan' : 'enhanced-new-scan',
      artistDone: done,
      artistTotal: total,
      resultAlbums: Number(snapshot?.resultAlbumCount || items.length || 0),
      matchedTracks: Number(snapshot?.matchedTrackCount || snapshot?.hits || 0),
      songHit: Number(snapshot?.songCacheHitCount || 0),
      songMiss: Number(snapshot?.songCacheMissCount || 0),
      ownedHit: Number(snapshot?.ownedCacheHitCount || 0),
      ownedMiss: Number(snapshot?.ownedCacheMissCount || 0),
      albumHit: Number(snapshot?.albumCacheHitCount || 0),
      albumMiss: Number(snapshot?.albumCacheMissCount || 0),
      checkedAlbums: checkedAlbumCount
    });
    if(taskConfig?.phase !== 'compilation' || !snapshot?.running){
      scheduleEnhancedUiStatePersist(snapshot?.running ? 300 : 0);
    }
    return items;
  }

  async function waitForEnhancedBackendCompletion(taskId, sourceTotal, token, taskConfig){
    while(true){
      if(token !== __runToken){
        try{ await stopEnhancedBackendScan(taskConfig); }catch{}
        throw new Error('__STOP__');
      }
      const snapshot = await fetchEnhancedBackendStatus(taskConfig);
      if(Number(snapshot?.code || 200) !== 200){
        throw new Error(snapshot?.message || taskConfig.statusErrorText || '后端扫描状态异常');
      }
      if(taskId && String(snapshot?.id || '') !== String(taskId)){
        throw new Error(taskConfig.replacedErrorText || '后端扫描任务已被替换，请重新开始。');
      }
      applyEnhancedBackendSnapshot(snapshot, sourceTotal, token, taskConfig);
      if(!snapshot.running){
        return snapshot;
      }
      await sleep(900);
    }
  }

  function bindDiagnosticsUI(cfg){
    const btn = document.getElementById('btnCheckLogin');
    const el = document.getElementById('diagStatus');
    if(!btn || !el) return;
    if(btn.__diagBound) return; // 避免重复绑定
    btn.__diagBound = true;
    btn.addEventListener('click', async () => {
      el.textContent = '检查中…';
      try{
        const baseStr = (document.getElementById('apiBase')?.value?.trim() || cfg.apiBase || '').trim();
        if(!baseStr){ el.textContent = '请先填写 API 基地址（如 http://127.0.0.1:8010）'; return; }
        let baseUrl; try{ baseUrl = new URL(baseStr); }catch{ el.textContent = 'API 地址无效，请填入完整地址'; return; }
        const headers = {};
        const cookieStr = (document.getElementById('cookie')?.value || cfg.cookie || '').trim();
        if(cookieStr){ headers['x-ncm-cookie'] = cookieStr; }
        // 关注列表数量
        let subCount = 0;
        try{
          const subResp = await fetch(new URL('/artist/sublist?limit=1', baseUrl), { headers });
          const sub = await subResp.json();
          if(sub && typeof sub.count === 'number'){ subCount = sub.count; }
          else if(sub && sub.data && Array.isArray(sub.data)){ subCount = sub.data.length; }
        }catch{}
        let extra = '';
        let loggedIn = false;
        try{
          const probe = await probeNcmAuth({ apiBase: baseUrl.toString(), cookie: cookieStr });
          extra = formatAuthProbeSummary(probe);
          loggedIn = isWritableAuthProbe(probe);
        }catch{}
        el.textContent = `登录：${loggedIn ? '有效' : '无效'}，关注歌手数：${subCount}${extra ? `；${extra}` : ''}`;
      }catch(e){
        el.textContent = `诊断失败：${e?.message||e}`;
      }
    });
  }

  // 兜底：提供全局诊断函数，按钮内联调用，避免事件绑定异常
  async function runDiagnosticsImpl(){
    try{
      const el = document.getElementById('diagStatus');
      if(!el){ alert('找不到诊断状态元素'); return; }
      el.textContent = '检查中…';
      const baseStr = (document.getElementById('apiBase')?.value?.trim() || '').trim();
      if(!baseStr){ el.textContent = '请先填写 API 基地址（如 http://127.0.0.1:3000 或 http://127.0.0.1:8012）'; return; }
      let baseUrl; try{ baseUrl = new URL(baseStr); }catch{ el.textContent = 'API 地址无效，请填入完整地址'; return; }
      const headers = {};
      const cookieStr = (document.getElementById('cookie')?.value || '').trim();
      if(cookieStr){ headers['x-ncm-cookie'] = cookieStr; }
      let loggedIn = false; let subCount = 0;
      try{
        const subResp = await fetch(new URL('/artist/sublist?limit=1', baseUrl), { headers });
        const sub = await subResp.json();
        if(sub && typeof sub.count === 'number'){ subCount = sub.count; }
        else if(sub && sub.data && Array.isArray(sub.data)){ subCount = sub.data.length; }
      }catch{}
      let extra = '';
      try{
        const probe = await probeNcmAuth({ apiBase: baseUrl.toString(), cookie: cookieStr });
        extra = formatAuthProbeSummary(probe);
        loggedIn = isWritableAuthProbe(probe);
      }catch{}
      el.textContent = `登录：${loggedIn ? '有效' : '无效'}，关注歌手数：${subCount}${extra ? `；${extra}` : ''}`;
    }catch(e){
      const el = document.getElementById('diagStatus');
      if(el) el.textContent = `诊断失败：${e?.message||e}`;
      else alert(`诊断失败：${e?.message||e}`);
    }
  }
  window.runDiagnostics = () => { runDiagnosticsImpl(); };
  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if(!t) return;
    const btn = (t.id === 'btnCheckLogin') ? t : t.closest && t.closest('#btnCheckLogin');
    if(btn){ ev.preventDefault(); runDiagnosticsImpl(); }
    const fixBtn = (t.id === 'btnQuickFix') ? t : t.closest && t.closest('#btnQuickFix');
    if(fixBtn){
      ev.preventDefault();
      (async () => {
        const baseEl = document.getElementById('apiBase');
        const cookieEl = document.getElementById('cookie');
        let cfg = loadSettings();
        let changed = false;
        const cur = (baseEl?.value || '').trim();
        if(!cur || /127\.0\.0\.1:8011/.test(cur)){
          if(baseEl) baseEl.value = 'http://127.0.0.1:3000';
          cfg.apiBase = 'http://127.0.0.1:3000';
          changed = true;
        }
        if(changed){
          try{ const txt = JSON.stringify(cfg); localStorage.setItem(LS_KEY, txt); backupSettingsCookie(txt); }catch{}
          try{ bindSettingsUI(cfg); }catch{}
        }
        await runDiagnosticsImpl();
        const cookieStr = (cookieEl?.value || '').trim();
        if(!cookieStr){
          const dlg = document.getElementById('settingsDialog');
          if(dlg && typeof dlg.showModal === 'function') dlg.showModal();
        }
      })();
    }
  });

  function parseIds(text){
    return text.split(/[\s,]+/).map(x=>x.trim()).filter(Boolean).map(x=>Number(x)).filter(x=>Number.isFinite(x));
  }

  // 启动午夜自动刷新检查 (每10秒检查一次日期变更)
  function startMidnightChecker(){
    let lastDate = formatDate(Date.now());
    setInterval(() => {
      const nowStr = formatDate(Date.now());
      if(nowStr !== lastDate){
        console.log(`[AutoRefresh] Date changed: ${lastDate} -> ${nowStr}, triggering refresh...`);
        lastDate = nowStr;
        // 日期变更，触发自动刷新
        runDailyCheck();
      }
    }, 10000);
  }

  async function runDailyCheck(){
    const nowTs = Date.now();
    if(nowTs - __lastRunTime < 5000){
        console.warn('Skipping runDailyCheck (debounced)');
        return; 
    }
    __lastRunTime = nowTs;

    const token = ++__runToken;
    markEnhancedScanStarted(token);
    const cfg = loadSettings();
    
    // [Classic Mode] 重构核心扫描逻辑：追求极致的稳定性和准确性
    // 1. 确定时间范围 (使用简单的本地时间计算，涵盖前后缓冲)
    const rangeDays = clampInt(cfg.daysRange, 1, 30, 1);
    const now = new Date();
    // 结束时间：明天的 23:59:59 (宽容度)
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999); 
    // 开始时间：今天 - (range-1) 天的 00:00:00
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfDay.setDate(startOfDay.getDate() - (rangeDays - 1));
    startOfDay.setHours(0,0,0,0);
    
    if(cfg.targetDate){
        // 如果指定了日期，则严格按照该日期
        const t = new Date(cfg.targetDate);
        startOfDay.setTime(t.getTime());
        startOfDay.setHours(0,0,0,0);
        endOfDay.setTime(t.getTime());
        endOfDay.setHours(23,59,59,999);
    }

    const startTs = startOfDay.getTime();
    const endTs = endOfDay.getTime();
    const rangeCacheKey = buildEnhancedRangeCacheKey(startOfDay, rangeDays);

    els.lastRun.textContent = new Date().toLocaleString();
    __enhancedUiState = createEnhancedUiState();
    __enhancedUiState.rangeCacheKey = rangeCacheKey;
    __enhancedRenderedKeys = new Set();
    __appendQueue.length = 0;
    __enhancedCompilationFlushItems = [];
    __enhancedCompilationFlushBindPreview = false;
    resetEnhancedCompilationAggregation('');
    __enhancedDeferredPanelDirty = new Set();
    if(__enhancedCompilationFlushTimer){
      clearTimeout(__enhancedCompilationFlushTimer);
      __enhancedCompilationFlushTimer = null;
    }
    updateEnhancedShownCount();
    updateEnhancedHeaderStats({
      artistsText: '0',
      hitsText: '0',
      albumsText: '0',
      checkedAlbumsText: '0',
      elapsedText: '00:00'
    }, false);
    renderLoading();
    activateEnhancedTab(__enhancedUiState.activeTab, { preserveCurrentScroll: false, restoreScroll: false });
    if(els.labelsFeed) els.labelsFeed.innerHTML = '<div class="empty">扫描中…</div>';
    persistEnhancedUiState();
    
    // 设置初始超时 (30秒)
    bumpLoadingTimeout(token, 30000);

    try{
      // 2. 按测试页同款来源包装获取艺人列表，优先复用本地 9000+ / 关注 / 歌单缓存
      const resolvedArtists = await resolveArtistsForEnhancedBackend(cfg, token);
      const artistObjects = Array.isArray(resolvedArtists?.artists) ? resolvedArtists.artists : [];
      const sourceTotal = artistObjects.length || 0;

      if(sourceTotal === 0){
         if(token === __runToken){
           renderEmpty('未找到关注艺人。请检查 Cookie 或手动添加 ID。');
           renderFeedSection(ENHANCED_TAB_COMPILATION, [], getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, 'idle'));
           renderLabelsFeed([]);
           persistEnhancedUiState();
         }
         return;
      }

      const artists = artistObjects
        .map(item => ({
          id: Number(item?.id || 0),
          name: String(item?.name || item?.artistName || '').trim() || `艺人 ${Number(item?.id || 0)}`
        }))
        .filter(item => Number.isFinite(item.id) && item.id > 0);
      const artistCheckCache = loadArtistCheckCache();
      const smartScanEnabled = cfg.smartScan !== false;

      if(token === __runToken){
        setLoadingProgress(0, sourceTotal);
        bumpLoadingTimeout(token, calcTimeoutByTotal(sourceTotal));
        const textEl = document.getElementById('progressText') || document.getElementById('loadingText');
        if(textEl){
          textEl.textContent = `准备扫描 ${sourceTotal} 位艺人${resolvedArtists?.sourceLabel ? `，来源：${resolvedArtists.sourceLabel}` : ''}`;
        }
        updateDiagnostics({
          phase: 'enhanced-source',
          sourceLabel: resolvedArtists?.sourceLabel || '未知来源',
          artistDone: 0,
          artistTotal: sourceTotal
        });
      }

      const configuredConcurrency = clampInt(cfg.concurrency, 1, 16, 4);
      const newReleaseConcurrency = Math.max(4, configuredConcurrency);
      const compilationConcurrency = Math.max(4, clampInt(cfg.concurrency, 1, 12, 4));
      const compilationSongsLimit = 30;

      const task = await startEnhancedBackendScan({
        cfg: {
          apiBase: cfg.apiBase,
          cookie: cfg.cookie
        },
        artists,
        smartScan: smartScanEnabled,
        artistCheckCache,
        rangeStart: startTs,
        rangeEnd: endTs,
        concurrency: newReleaseConcurrency
      }, ENHANCED_NEW_SCAN_CONFIG);

      applyEnhancedBackendSnapshot(task, sourceTotal, token, ENHANCED_NEW_SCAN_CONFIG);
      const finalSnapshot = await waitForEnhancedBackendCompletion(task?.id, sourceTotal, token, ENHANCED_NEW_SCAN_CONFIG);
      if(token === __runToken){
        applyEnhancedBackendSnapshot(finalSnapshot, sourceTotal, token, ENHANCED_NEW_SCAN_CONFIG);
        const textEl = document.getElementById('progressText') || document.getElementById('loadingText');
        if(textEl){
          textEl.textContent = `新作扫描完成，开始合辑扫描…当前新作 ${Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases.length : 0} 张`;
        }
        activateEnhancedTab(ENHANCED_TAB_COMPILATION, { preserveCurrentScroll: true, restoreScroll: false });
        if(!Array.isArray(__enhancedUiState.compilations) || !__enhancedUiState.compilations.length){
          renderFeedSection(ENHANCED_TAB_COMPILATION, [], getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, 'loading'));
        }
        scheduleEnhancedUiStatePersist(0);
      }

      const compilationTask = await startEnhancedBackendScan({
        cfg: {
          apiBase: cfg.apiBase,
          cookie: cfg.cookie
        },
        artists,
        rangeStart: startTs,
        rangeEnd: endTs,
        songsLimit: compilationSongsLimit,
        concurrency: compilationConcurrency
      }, ENHANCED_VA_SCAN_CONFIG);

      applyEnhancedBackendSnapshot(compilationTask, sourceTotal, token, ENHANCED_VA_SCAN_CONFIG);
      const finalCompilationSnapshot = await waitForEnhancedBackendCompletion(compilationTask?.id, sourceTotal, token, ENHANCED_VA_SCAN_CONFIG);
      if(token === __runToken){
        applyEnhancedBackendSnapshot(finalCompilationSnapshot, sourceTotal, token, ENHANCED_VA_SCAN_CONFIG);
        renderLabelsFeed([...(Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases : []), ...(Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations : [])]);
        scheduleEnhancedUiStatePersist(0);
        bindPreviewUI(loadSettings());
        const finalItems = [
          ...(Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases : []),
          ...(Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations : [])
        ];
        if(finalItems.length > 0){
          try{ localStorage.setItem(rangeCacheKey, JSON.stringify(finalItems)); }catch{}
          renderEnhancedPanelsFromState();
          persistEnhancedUiState();
        } else {
          renderFeedSection(ENHANCED_TAB_NEW, [], `在所选范围内 (${rangeDays}天) 未发现新作。`);
          renderFeedSection(ENHANCED_TAB_COMPILATION, [], getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, 'empty'));
          renderLabelsFeed([]);
          persistEnhancedUiState();
        }
        try{ autoFetchSpotifyPresetLabels(); }catch{}
        if(__loadingTimer){ clearTimeout(__loadingTimer); __loadingTimer = null; }
      }
    } catch(err){
      console.error(err);
      if(token === __runToken && String(err?.message || err) !== '__STOP__'){
        if((Array.isArray(__enhancedUiState.newReleases) && __enhancedUiState.newReleases.length) || (Array.isArray(__enhancedUiState.compilations) && __enhancedUiState.compilations.length)){
          const textEl = document.getElementById('progressText') || document.getElementById('loadingText');
          if(textEl) textEl.textContent = '扫描过程发生错误: ' + err.message;
          renderFeedSection(ENHANCED_TAB_COMPILATION, __enhancedUiState.compilations, getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, 'idle'));
        } else {
          renderEmpty('扫描过程发生错误: ' + err.message);
          renderFeedSection(ENHANCED_TAB_COMPILATION, __enhancedUiState.compilations, getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, 'idle'));
        }
        persistEnhancedUiState();
      }
    } finally {
      markEnhancedScanFinished(token);
    }
  }

  // 批量获取艺人专辑 (通过本地代理并发检查)
  async function fetchBatchArtistAlbums(cfg, chunkIds, startTs, endTs) {
      // 这里的 batch-check-artist 是 cors-proxy (8012) 特有的
      const proxyUrl = resolveCorsProxyApi('/batch-check-artist');
      const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
      
      const response = await fetch(proxyUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ ids: chunkIds, startTs: startTs, endTs: endTs })
      });
      if(!response.ok) {
          throw new Error(`Batch check failed: ${response.status}`);
      }
      const data = await response.json();
      return data.results || [];
  }

  // 简化的单人抓取 (无缓存跳过逻辑，确保准确)
  async function fetchTodayReleasesForArtistSimple(cfg, artistId, startTs, endTs){
      const url = new URL('/artist/album', cfg.apiBase);
      url.searchParams.set('id', String(artistId));
      url.searchParams.set('limit', '50'); // 获取最近 50 条足够了
      const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
      
      // 简单的重试逻辑
      let data = null;
      for(let i=0; i<2; i++){
          try{
              // 禁用全局串行节流，依靠外部 pLimit 控制并发
              data = await fetchJSON(url.toString(), headers, { timeout: 10000, throttle: false });
              break;
          }catch(e){
              if(i===1) return []; // 失败两次放弃
              await sleep(1000);
          }
      }
      
      const albums = data?.hotAlbums || data?.albums || [];
      if(!Array.isArray(albums)) return [];
      
      const results = [];
      for(const a of albums){
          const t = Number(a.publishTime);
          if(t >= startTs && t <= endTs){
              results.push({
                type: a.type || '专辑/单曲',
                name: a.name,
                id: a.id,
                picUrl: a.picUrl,
                publishTime: t,
                artistName: (a?.artist?.name) || (a?.artists?.[0]?.name) || '未知艺人',
                artistId: artistId,
                link: `https://music.163.com/#/album?id=${a.id}`,
                source: '主抓取'
              });
          }
      }
      return results;
  }

  // 辅助：富化并追加到 UI
  async function enrichAndAppend(cfg, rawItems, token){
      if(!rawItems.length) return;
      try{
          // 简单去重 (按 ID)
          const unique = [];
          const seen = new Set();
          // 注意：这里需要一个全局 seen 吗？runDailyCheck 内部没有传递全局 seen
          // 考虑到增量刷新，可能需要。但在单次 runDailyCheck 中，不同艺人一般不会有重复专辑（除非合作）
          // 暂时只在 batch 内去重
          for(const it of rawItems){
              unique.push(it);
          }
          
          const enriched = await enrichAlbums(cfg, unique);
          if(token === __runToken){
              renderFeedAppend(enriched);
          }
      }catch(e){ console.warn('Enrich failed', e); }
  }


  // 预设厂牌列表（按分类）
  const SPOTIFY_LABEL_PRESETS = {
    'Melodic': [
      'Ufality','Stardust','Sizeland','ARWV','Arctic Empire','Paradise Music','Future Bass Records','Ophelia Records','Heaven Sent','SQUAD Nation','Nightblue Music','Spiration','Spiration Music','Recursive Recordings','Jupita','Noiseporn','Outertone','Bass Boost','Melodic Bassment Records','Bass Rebels Records','Starling EDM','MNTN Records','FeelQ Recordings','Legion Records','Frostfyre Records','Scan Records','FreeMusicWave','INVIBES Recordings','Protocol Recordings','Exuvium Records','Jade City Records','Atelier Records','Flight Zone Records','Euphonix Recordings','Simplify Recordings'
    ],
    'Bass': [
      'Neoluminum','Reinelex Records','The Half Heart Project','Unbeyond Anthologies','Tonality','Oblivion Audio','Interval Audio','Full Flex Audio','Flexout Audio','Shuttle Recs','Frozen Fox Records','Mithril Records','Gravitas Recordings','Odyzey Music','HQThree Records','Kannibalen Records','Quality Goods Records','MorFlo Records','MONTA','NIGHTMODE','BREAK ROOM','broke','Sable Valley Records','DirtySnatcha Records','Basscapital Recs','A Records','High Caliber Records','Bad Medic Records','Cyclops Recordings','Sounds Of Mayhem','Subsidia','Bass Darkness','Antithesys Records','PRIMAL RECORDS','Seikatsu Records','Let Them Cook Records','Deadbeats','Bassrush','Bite This!','Beat Intelligence Network','Gud Vibrations','Trippy Bee Records'
    ],
    'DnB': [
      'UKF','Pilot.','High Tea Music','Liquicity','DNBB Records','Hospital Records','Viper Recordings','Paperfunk Recordings','Delta9 Recordings','Automata Music','DnB Allstars Records','Symmetry Recordings','GLITCH.','RIOT RECORDS','Play Me Records','play:music','DnB Doctor.','Shogun Audio','Critical Music','Galacy Records','Souped Up Records','Neksus Sound','Gunsta Records','Delta9 Records','Soulvent Records','MODUS','Wobbles & Waffles'
    ],
    'Others': [
      'Monstercat','NCS','Seeking Blue','Lost In Dreams Records','bitbird','AVA Recordings','Circus Records','Seeking Blue Records','Thrive Music','This Never Happened','Enhanced','Anjunadeep','Anjunabeats','mau5trap','Armada','Meanwhile Recordings','Intensity Recordings','Edm Mania Recordings','Umpire Records','Solvana Records','frequency fifty six','Dim Mak','The MasterBeat Project','The MasterBeat Horizon','Blackout Music NL','Emotions Control Music','Overview Music','IN / ROTATION','Insomniac Records','FSOE','Confession','Black hole Recordings','Interstellar','Future Classic','Hypersia Records',
      'UXN','Port Zero','More Bass More Good','Asahi Crew','Lunar Bass Records','MOTTO MUSIC','Ridmic','4 Jungle Records','Motive Hunter Audio','YANA Music','FRAKTVRED','Elephant Trunk','Salia Sounds','Kingdom Audio',
      'West Cove Recordings','High Resistance','Serenadé Music','Sky Bass Records','LVLD Music','Mugic.us Records','Jadu Dala','DEEPNAS','Eons Away Label',
      'HellCat Media','Light New Fires','Manifest','Futurized Records','IX Recorders','The QR Network','Drama Club Recordings'
    ]
  };

  window.__stopSpotifyAppScan = false;
  // Spotify 预设并发检索（仅当天）并渲染
  async function autoFetchSpotifyPresetLabels(){
    if(!els.spotifyAutoFeed) return; // 非增强页跳过
    window.__stopSpotifyAppScan = false; // Reset stop flag
    const cfg = loadSettings();
    const infoEl = els.spotifyAutoFeed;
    // 先清空并显示提示（反映当前时间范围）
    const daysHint = clampInt(cfg.daysRange, 1, 30, 1);
    infoEl.innerHTML = `<div class="empty">Spotify 厂牌自动检索中…（范围 ${daysHint} 天）</div>`;
    const clientId = cfg.spotifyClientId;
    const clientSecret = cfg.spotifyClientSecret;
    // 支持多市场：使用逗号/空格/中文分隔符分割，例如 "US,JP,HK"
    const parseMarkets = (str) => String(str||'')
      .split(/[\s,、，]+/)
      .map(s=>s.trim().toUpperCase())
      .filter(Boolean);
    const markets = parseMarkets(cfg.spotifyMarket||'US');

    const userToken = localStorage.getItem('spotify_user_token');
    const hasUserToken = userToken && (Number(localStorage.getItem('spotify_user_token_expiry')||0) > Date.now());

    if(!hasUserToken && (!clientId || !clientSecret)){
      infoEl.innerHTML = `<div class="empty">未登录 Spotify 且未配置 Client ID/Secret，无法自动检索。请点击上方“Spotify 登录”按钮获取 Token。</div>`;
      return;
    }

    // 使用页面设置的时间范围，并优先严格匹配；无结果时回退至宽松匹配与无市场限制
    const days = clampInt(cfg.daysRange, 1, 30, 1);
    let token;
    try{
      token = await fetchSpotifyToken(clientId, clientSecret);
    }catch(e){
      infoEl.innerHTML = `<div class="empty">Spotify Token 获取失败：${escapeHtml(e?.message||String(e))}</div>`;
      return;
    }

    // 初始化独立进度条：置于整栏（参照网易云进度的布局），卡片作为同级项直接参与父级 grid
    const usedId = clientId ? (clientId.slice(0,4) + '***' + clientId.slice(-4)) : 'Using User Token';
    infoEl.innerHTML = `
      <div class="empty">
        <div id="spotifyProgress" style="height:6px;background:#eee;border-radius:3px;margin:6px 0;">
          <div id="spotifyProgressFill" style="width:0%;height:100%;background:#4caf50;border-radius:3px;transition:width .2s;"></div>
        </div>
        <div id="spotifyProgressText" class="hint" style="margin:4px 0 0;">准备中 (Client: ${usedId})…</div>
        <button onclick="window.__stopSpotifyAppScan = true; this.innerText='正在停止...'; this.disabled=true;" style="margin-top:10px; padding:4px 12px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">停止扫描</button>
      </div>
    `;
    const spFill = document.getElementById('spotifyProgressFill');
    const spText = document.getElementById('spotifyProgressText');
    const updateProgress = (done, total, hits, totalItems, msg) => {
      const pct = total>0 ? Math.round(100*done/total) : 0;
      if(spFill) spFill.style.width = `${pct}%`;
      let text = `Spotify 厂牌自动检索：${done}/${total}（${pct}%） · 命中 ${hits} 厂牌 · 累计 ${totalItems} 项`;
      if(msg) text += ` · ${msg}`;
      if(spText) spText.textContent = text;
    };

    // 汇总所有需检索的厂牌并去重（忽略大小写），后映射回分类
    const allPairs = [];
    Object.keys(SPOTIFY_LABEL_PRESETS).forEach(cat => {
      SPOTIFY_LABEL_PRESETS[cat].forEach(label => allPairs.push({ cat, label }));
    });
    const norm = s => String(s||'').trim().toLowerCase();
    const uniqueLabels = Array.from(new Map(allPairs.map(p => [norm(p.label), p.label])).values());
    const labelToCats = allPairs.reduce((m, p) => { const k = norm(p.label); if(!m[k]) m[k] = new Set(); m[k].add(p.cat); return m; }, {});
    const totalLabels = uniqueLabels.length;
    let doneCount = 0; let hitLabels = 0; let totalItems = 0; let appendedAny = false;
    updateProgress(0, totalLabels, 0, 0);

    // 并发控制，避免触发限流
    const limit = pLimit(2); // Keep modest parallelism without making Spotify scans crawl
    const labelResultMap = new Map(); // normLabel -> items
    const renderedIds = new Set(); // 全局去重，防止多厂牌命中同一专辑导致重复显示
    
    // Helper for countdown
    const waitWithCountdown = async (ms, prefix) => {
        let remaining = ms;
        while(remaining > 0){
            const sec = Math.ceil(remaining/1000);
            const msg = prefix ? `${prefix} · 429 限流保护，等待 ${sec}s...` : `触发限流保护，等待 ${sec}s...`;
            updateProgress(doneCount, totalLabels, hitLabels, totalItems, msg);
            const step = Math.min(1000, remaining);
            await new Promise(r => setTimeout(r, step));
            remaining -= step;
        }
    };
    
    // 强制精确搜索的厂牌列表（忽略大小写匹配）
    const FORCE_STRICT_LABELS = new Set(['a records', 'broke', 'play:music', 'play me records', 'glitch.', 'future bass records']);
    
    let errorCount = 0;
    let lastErrorMsg = '';

    await Promise.all(uniqueLabels.map(lbl => limit(async () => {
      if (window.__stopSpotifyAppScan) return;
      
      // 检查全局限流
      if(Date.now() < __spotifyRateLimitedUntil){
          const wait = __spotifyRateLimitedUntil - Date.now();
          if(wait > 500) await waitWithCountdown(wait, `[${lbl}]`);
      }
      if (window.__stopSpotifyAppScan) return;
      
      // 固定延迟 2.5s 避免过于频繁 (Increased from 1.5s)
      // await new Promise(r => setTimeout(r, 2500)); // Replace with progress update
      await waitWithCountdown(2500, `[${lbl}] 间隔等待`);
      
      if (window.__stopSpotifyAppScan) return;

      updateProgress(doneCount, totalLabels, hitLabels, totalItems, `正在检索：${lbl}`);

      let items = [];
      let lastErr = null;
      const isForceStrict = FORCE_STRICT_LABELS.has(lbl.toLowerCase());
      
      const onWait = (sec) => {
         updateProgress(doneCount, totalLabels, hitLabels, totalItems, `正在检索：${lbl} · 429 限流保护，等待 ${sec}s...`);
      };

      try{
        if(token) {
            // 1) 严格匹配 + 多市场尝试（逐一）
            for(const m of (markets.length?markets:['US'])){
              const res = await searchSpotifyAlbumsByLabel(token, lbl, m, days, true, onWait);
              if(res.error) lastErr = res.error;
              items = res.items || [];
              if(items.length) break;
            }
            // 2) 无结果则尝试不指定市场的严格匹配 (Only if we have User Token)
            if(!items.length && hasUserToken){
              const res = await searchSpotifyAlbumsByLabel(token, lbl, '', days, true, onWait);
              if(res.error) lastErr = res.error;
              items = res.items || [];
            }
            // 3) 仍无结果则放宽为非严格匹配 + 多市场尝试（仅当非强制精确时）
            if(!items.length && !isForceStrict){
              for(const m of (markets.length?markets:['US'])){
                const res = await searchSpotifyAlbumsByLabel(token, lbl, m, days, false, onWait);
                if(res.error) lastErr = res.error;
                items = res.items || [];
                if(items.length) break;
              }
            }
            // 4) 最后尝试不指定市场的宽松匹配（仅当非强制精确时，且拥有 User Token）
            if(!items.length && !isForceStrict && hasUserToken){
              const res = await searchSpotifyAlbumsByLabel(token, lbl, '', days, false, onWait);
              if(res.error) lastErr = res.error;
              items = res.items || [];
            }
        }
      }catch(e){
        lastErr = e.message || String(e);
      }

      if(!items.length && lastErr){
          errorCount++;
          lastErrorMsg = lastErr;
          // console.warn(`[AutoFetch] Failed for ${lbl}: ${lastErr}`);
          
          if (String(lastErr).includes('403') || String(lastErr).includes('401') || String(lastErr).includes('Premium Subscription Required')) {
              console.warn(`[AutoFetch] Critical error encountered (${lastErr}), stopping scan.`);
              window.__stopSpotifyAppScan = true;
          }
      }

      const key = norm(lbl);
      labelResultMap.set(key, items || []);
      // 增量渲染：每完成一个厂牌即追加卡片，并推进进度
      try{
        if(Array.isArray(items) && items.length){
          // 过滤已渲染的专辑
          const newItems = items.filter(x => !renderedIds.has(x.id));
          if(newItems.length){
            newItems.forEach(x => renderedIds.add(x.id));
            hitLabels++;
            totalItems += newItems.length;
            appendedAny = true;
            const cats = Array.from((labelToCats[key] || new Set()));
            const cardHtml = cats.map(cat => `
              <section class="card">
                <div class="meta">
                  <div class="title">Spotify · ${escapeHtml(cat)} · ${escapeHtml(lbl)}（${newItems.length}）</div>
                  <ul class="label-list">
                    ${newItems.map(x=>`
                      <li>
                        <a href="${escapeAttr(x.link)}" target="_blank" rel="noopener">${escapeHtml(x.name)}</a>
                        <span class="by"> · ${escapeHtml(x.artistName)} · ${formatDate(x.publishTime)}</span>
                      </li>
                    `).join('')}
                  </ul>
                </div>
              </section>
            `).join('');
            infoEl.insertAdjacentHTML('beforeend', cardHtml);
          }
        }
      }catch{}
      doneCount++;
      updateProgress(doneCount, totalLabels, hitLabels, totalItems);
    })));

    // 组装分类结果，仅保留当天有新作的厂牌
    const renderList = [];
    for(const cat of Object.keys(SPOTIFY_LABEL_PRESETS)){
      for(const lbl of SPOTIFY_LABEL_PRESETS[cat]){
        const arr = labelResultMap.get(norm(lbl)) || [];
        if(Array.isArray(arr) && arr.length){
          renderList.push({ cat, label: lbl, items: arr });
        }
      }
    }

    if(!appendedAny){
      let msg = `范围 ${days} 天未检索到所列厂牌新作（Spotify）。`;
      if(errorCount > 0){
          msg += `<br/><br/><span style="color:#ff5555">⚠️ 监测到 ${errorCount} 个厂牌检索失败。最新错误：${escapeHtml(lastErrorMsg)}</span>`;
          if(String(lastErrorMsg).includes('Premium')){
              msg += `<br/>提示：请确保已登录 Premium 账号。`;
          }
      } else {
          msg += `<br/>可能原因：当天无新作、关键词不匹配或请求被限流。`;
          msg += `<br/>建议：减少市场数量（如仅 US,JP,HK）、稍后再试或将时间范围改为 3~7 天。`;
      }
      infoEl.innerHTML = `<div class="empty">${msg}</div>`;
      return;
    }
  }

  async function resolveArtistIds(cfg, token){
    const manual = Array.isArray(cfg.manualArtistIds) ? cfg.manualArtistIds : [];
    
    // 1. 尝试读取关注列表缓存 (有效期 24h)
    let followed = [];
    let isReusingCache = false;
    let reusedOwnedArtistCache = false;

    // [Smart Scan] 如果开启智能扫描，且没有要求“跳过扫描”，则强制刷新关注列表以获取最新专辑数
    const forceRefreshForSmartScan = false;

    // [New] 优先处理 skipRescanNextOnce：强制使用缓存（忽略过期时间）
    if(cfg.skipRescanNextOnce){
        try{
            const raw = localStorage.getItem(FOLLOW_CACHE_KEY);
            if(raw){
                const obj = JSON.parse(raw);
                // 只要有数据就用，不检查过期
                if(obj && Array.isArray(obj.ids) && obj.ids.length > 0){
                    followed = obj.ids;
                     isReusingCache = true;
                     console.log('Skipping scan as requested by skipRescanNextOnce (Persistent)');
                 }
             }
         }catch(e){ console.error('Failed to skip rescan', e); }
     }
    
    if(!isReusingCache && !cfg.alwaysRefreshFollowed && !forceRefreshForSmartScan){
      try{
        const raw = localStorage.getItem(FOLLOW_CACHE_KEY);
        if(raw){
          const obj = JSON.parse(raw);
          // 检查缓存有效性
          if(obj && Array.isArray(obj.ids) && (Date.now() - (obj.ts||0) < 24*3600*1000)){
            followed = obj.ids;
            isReusingCache = true;
          }
        }
      }catch{}
    }

    const ownedArtistSource = await loadOwnedArtistSourceCache();
    if(ownedArtistSource.ids.length >= 9000 && ownedArtistSource.ids.length > followed.length){
      followed = ownedArtistSource.ids.map(id => ({ id, albumSize: -1 }));
      isReusingCache = true;
      reusedOwnedArtistCache = true;
    }

    // 若复用缓存
    if(isReusingCache){
       if(token === __runToken){
         setLoadingStatus(
           reusedOwnedArtistCache
             ? `使用本地 9000+ 艺人大缓存 (${followed.length})`
             : `使用缓存关注列表 (${followed.length})`,
           followed.length,
           followed.length
         );
       }
    }

    // 2. 如果需要刷新 (无缓存或强制刷新)
    if(!isReusingCache && cfg.apiBase){
        // 尝试增大单页 limit 以减少请求次数
        const limit = 200;
        let offset = 0;
        let hasMore = true;
        const all = [];
        const seen = new Set();
        let consecutiveErrors = 0;

        if(token === __runToken) setLoadingStatus('开始获取关注列表...', 0, 100);

        while(hasMore){
            if(token !== __runToken) break;
            
            const u = new URL('/artist/sublist', cfg.apiBase);
            u.searchParams.set('limit', String(limit));
            u.searchParams.set('offset', String(offset));
            u.searchParams.set('timestamp', String(Date.now())); // 避免 API 缓存
            const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
            
            if(token === __runToken) setLoadingStatus(`正在获取关注列表 (已获取 ${all.length}, Offset: ${offset})...`, all.length, all.length+100);

            try{
                // 15秒超时
                let data;
                try {
                    data = await fetchJSON(u.toString(), headers, { timeout: 15000 });
                } catch(err) {
                     // 针对 500 错误的特殊处理：如果是未登录导致的 500，或者是网络问题
                     const emsg = String(err.message || err);
                     // 这里的 500 可能是 ncm-api 包装的 301
                     if(emsg.includes('500') || emsg.includes('301') || emsg.includes('未登录')){
                         // 如果是第一页就失败，或者连续失败多次，且没有数据，可能是未登录
                         if(all.length === 0 || consecutiveErrors >= 3){
                             throw new Error('未登录或 API 异常 (Code 500/301)。请检查 Cookie。');
                         }
                     }
                     throw err;
                }
                
                consecutiveErrors = 0;
                
                // 兼容不同字段
                const list = (data?.data || data?.artists || data?.list || []);
                const listLen = list.length;
                
                if(!Array.isArray(list) || listLen === 0){
                    hasMore = false;
                } else {
                    let newCount = 0;
                    for(const item of list){
                        const id = Number(item?.id || item?.artistId);
                        const albumSize = Number(item?.albumSize);
                        if(Number.isFinite(id) && !seen.has(id)){
                            seen.add(id);
                            // [Smart Scan] Store rich object
                            all.push({ id, albumSize: Number.isFinite(albumSize) ? albumSize : -1 });
                            newCount++;
                        }
                    }
                    
                    // 检查翻页标志
                    if(typeof data.more === 'boolean') hasMore = data.more;
                    else if(typeof data.hasMore === 'boolean') hasMore = data.hasMore;
                    else if(listLen < limit) hasMore = false;
                    
                    // 安全兜底
                    if(newCount === 0 && listLen > 0 && all.length > 20000){
                         hasMore = false; 
                    }
                }
                
                if(hasMore) {
                    // [Fix] 使用实际返回数量累加 offset，防止 limit 被服务端截断导致漏抓
                    offset += (listLen > 0 ? listLen : limit);
                    await sleep(40); 
                }
            }catch(e){
                consecutiveErrors++;
                console.warn(`[Sublist] Error at offset ${offset}:`, e);
                const msg = e.message || String(e);
                if(msg.includes('未登录') || msg.includes('301') || msg.includes('需要登录')){
                    throw new Error(`无法获取关注列表：${msg}。请检查 Cookie 是否过期。`);
                }
                if(token === __runToken) setLoadingStatus(`关注列表获取失败 (${msg.slice(0,20)}...)，重试中 (${consecutiveErrors}/5)...`, all.length, all.length+100);
                if(consecutiveErrors >= 5) break;
                await sleep(2000);
            }
        }
        
        followed = all;
        if(followed.length === 0 && consecutiveErrors >= 5){
             throw new Error(`关注列表获取失败 (连续错误)。请检查网络或 API 地址。`);
        }
        // 更新缓存
        if(followed.length > 0){
           try{ localStorage.setItem(FOLLOW_CACHE_KEY, JSON.stringify({ ids: followed, ts: Date.now() })); }catch{}
        }
    }
    
    // 3. 歌单导入 (如有)
    let playlistIds = [];
    if(cfg.playlistSource && !cfg.onlyShowFollowedInFeed){
        try {
           // 尝试读取歌单缓存
           let plCached = false;
           const currentPlaylistId = extractPlaylistId(cfg.playlistSource);
           if(cfg.useCachedPlaylistArtists || cfg.reuseArtistCache || cfg.skipRescanNextOnce || currentPlaylistId){
               try{
                   const rawPl = localStorage.getItem(PLAYLIST_CACHE_KEY);
                   if(rawPl){
                       const obj = JSON.parse(rawPl);
                       const sourceMatches = String(obj?.sourceId || '') === String(currentPlaylistId || '');
                       if(obj && Array.isArray(obj.ids) && sourceMatches){
                           playlistIds = obj.ids;
                           plCached = true;
                           if(token === __runToken) setLoadingStatus(`复用歌单缓存 (${playlistIds.length})`, 100, 100);
                       }
                   }
               }catch{}
           }
           
           if(!plCached){
               if(token === __runToken) setLoadingStatus('未命中歌单缓存，已跳过自动解析歌单', followed.length, Math.max(followed.length, 1));
               playlistIds = [];
           }
        } catch(e) { console.warn('Playlist import failed', e); }
    }
    
    if(cfg.onlyShowFollowedInFeed) return followed.map(x => (typeof x === 'object') ? x : { id: Number(x), albumSize: -1 });
    
    // 4. 合并 (手动 + 关注 + 歌单)
    const merged = new Map();
    
    // Manual: priority 1 (override others? No, just add. But manual usually implies "I care about this")
    manual.forEach(id => { if(Number.isFinite(Number(id))) merged.set(Number(id), { id: Number(id), albumSize: -1 }); });
    
    // Followed: priority 2
    followed.forEach(item => {
        const obj = (typeof item === 'object') ? item : { id: Number(item), albumSize: -1 };
        if(!merged.has(obj.id)) merged.set(obj.id, obj);
        else {
            // Update metadata if existing is dummy
            if(merged.get(obj.id).albumSize === -1 && obj.albumSize !== -1) merged.set(obj.id, obj);
        }
    });

    // Playlist: priority 3
    playlistIds.forEach(item => {
        // playlistIds might be numbers or objects depending on fetchPlaylistArtistIds return?
        // fetchPlaylistArtistIds returns Set -> Array of numbers usually.
        // Let's check fetchPlaylistArtistIds return. It returns artistIds (Set converted to Array).
        const id = Number(item);
        if(Number.isFinite(id) && !merged.has(id)) merged.set(id, { id, albumSize: -1 });
    });

    return Array.from(merged.values());
  }

  async function fetchTodayReleasesForArtist(cfg, artistId, startTs, endTs, opts = {}){
    // 调用 /artist/album 接口，过滤当天发布
    const url = new URL('/artist/album', cfg.apiBase);
    url.searchParams.set('id', String(artistId));
    // 仅需最近若干条即可判断当天范围内是否有新作（增大 limit 以避免遗漏，特别是大跨度扫描时）
    url.searchParams.set('limit', '100');
    const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
    const fetchOpts = opts?.throttle === false ? { throttle: false } : undefined;
    
    let data;
    // [Modified] 恢复轻量级重试机制 (针对 429 或 网络超时)
    // 限制重试次数为 1 次，既保证稳定性又不至于太慢
    let retries = 0;
    while(true){
        try {
          data = await fetchJSON(url.toString(), headers, fetchOpts);
          break; // 成功
        } catch(e) {
          retries++;
          const msg = e?.message || String(e);
          // 仅在遇到 5xx 或 网络错误时重试，404 就不重试了
          if(retries <= 1 && (msg.includes('50') || msg.includes('network') || msg.includes('fetch') || msg.includes('429') || msg.includes('405'))){
             // 快速重试，等待时间短一点
             await sleep(1500 * retries); // [Fix] 增加重试等待 (500 -> 1500)
             continue;
          }
          console.warn(`[DEBUG-SCAN] 艺人 ${artistId} API 请求失败:`, msg);
          // 标记错误，以便上层不更新缓存
          return { error: true };
        }
    }
    
    // 兼容 hotAlbums 和 albums 字段
    const albums = data?.hotAlbums || data?.albums || [];
    
    // [Modified] 如果 data 结构异常，视为错误，不更新缓存
    if(!Array.isArray(albums)){
        return { error: true };
    }
    
    // 调试日志：采样打印部分艺人的抓取情况（避免刷屏，仅打印有数据的或特定ID）
    if (albums.length > 0) {
       const newest = albums[0];
       const newestTs = Number(newest.publishTime) || 0;
       const artistName = newest.artist?.name || '未知';
       
       // [DEBUG] 针对用户反馈的特定艺人进行强制日志追踪
       const targetNames = ['John Orchard', 'Remy Heart'];
       if(targetNames.some(n => artistName.includes(n))){
          console.warn(`[DEBUG-TARGET] 发现目标艺人 ${artistName} (ID:${artistId})。最新专辑: ${newest.name} (${formatDate(newestTs)})。是否在范围内: ${newestTs >= startTs && newestTs <= endTs ? 'YES' : 'NO'}`);
          console.warn(`[DEBUG-TARGET] 范围参数: Start=${startTs}(${formatDate(startTs)}), End=${endTs}(${formatDate(endTs)}), BeijingRange=${JSON.stringify(cfg.beijingRange)}`);
       }

       // 如果最新专辑在范围内，或者离范围很近（7天内），打印日志
       if ((newestTs >= startTs && newestTs <= endTs) || (newestTs > startTs - 7*86400000)) {
          console.log(`[DEBUG-SCAN] 艺人 ${artistId} (${artistName}) 抓取到 ${albums.length} 张专辑。最新: ${newest.name} (${formatDate(newestTs)})。范围: ${formatDate(startTs)}~${formatDate(endTs)}。匹配: ${newestTs >= startTs && newestTs <= endTs ? 'YES' : 'NO'}`);
       }
    } else {
       // 如果为空，可能是真没专辑，也可能是异常
       // console.log(`[DEBUG-SCAN] 艺人 ${artistId} 返回空专辑列表`);
    }

    // 记录该艺人真实的最新发布时间（无论是否在本次扫描范围内），用于准确更新缓存
    const latestPublishTime = albums.length > 0 ? Math.max(...albums.map(a => Number(a.publishTime)||0)) : 0;
    
    // [Modified] 增加近期活跃但未命中统计
    // 检查是否有“近期”（例如过去30天）发布的作品，但因为范围限制而被过滤掉
    const recentThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let hasRecentMiss = false;
    
    if(latestPublishTime > 0){
        // 判断最新专辑是否在严格范围内
        let isOutside = false;
        if(cfg.beijingRange){
            const bDate = getBeijingDateInt(latestPublishTime);
            if(bDate < cfg.beijingRange.start || bDate > cfg.beijingRange.end) isOutside = true;
        } else {
            // 降级逻辑（startTs 是带缓冲的，所以这里判定可能不准，仅作为兜底）
            // 如果比带缓冲的 startTs 还早，那肯定不在范围内
            if(latestPublishTime < startTs || latestPublishTime > endTs) isOutside = true;
        }

        if(latestPublishTime >= recentThreshold && isOutside){
            hasRecentMiss = true;
        }
    }

    // [Fix] 再次校验日期，确保剔除因时区差异混入的昨天内容
    // [Modified] 优先使用北京时间日期范围进行过滤
    const result = albums.filter(a => {
        const t = Number(a.publishTime);
        if(!Number.isFinite(t)) return false;
        
        if(cfg.beijingRange){
            const bDate = getBeijingDateInt(t);
            // 允许 start 和 end 之间（包含）
            if(bDate >= cfg.beijingRange.start && bDate <= cfg.beijingRange.end) return true;
            
            // 调试日志：如果被过滤掉的是“昨天”或者“明天”的数据，打印出来以便核查
            // 仅当用户只查今天（start==end）时，打印昨天的被过滤信息才有意义
            if(cfg.beijingRange.start === cfg.beijingRange.end){
                 if(bDate === cfg.beijingRange.start - 1){
                     // 仅在 debug 模式或 console 开启时可见，用于诊断“为什么昨天的不显示”
                     // console.log(`[Scan] [Filter-Yesterday] ${a.name} (${bDate})`);
                 }
            }
            return false;
        }

        // 降级：仅使用时间戳（不推荐，受时区影响大）
        // 注意：这里的 startTs/endTs 是传入参数。如果上层传入了带缓冲的，这里需要严格限制吗？
        // 由于上层已经启用了 beijingRange，这里仅为防卫性代码。
        return t >= startTs && t <= endTs;
    })
      .map(a => ({
        type: a.type || '专辑/单曲',
        name: a.name,
        id: a.id,
        picUrl: a.picUrl,
        publishTime: a.publishTime,
        artistName: (a?.artist?.name) || (a?.artists?.[0]?.name) || '未知艺人',
        artistId: artistId,
        link: `https://music.163.com/#/album?id=${a.id}`,
        source: '主抓取',
      }));
    result.latestPublishTime = latestPublishTime;
    result.hasRecentMiss = (result.length === 0 && hasRecentMiss); // 只有当结果为空时才标记为 miss
    
    if (result.length > 0) {
      console.log(`[DEBUG-SCAN] *** 命中 *** 艺人 ${artistId} 发现 ${result.length} 个新作！`);
    }

    return result;
  }

  async function runEnhancedOwnedFastPhase(cfg, artists, artistCheckCache, startTs, endTs, sourceTotal, token){
    const fastConcurrency = clampInt(cfg.concurrency, 1, 12, 8);
    const allowSkip = cfg.smartScan !== false;
    const limit = pLimit(fastConcurrency);
    let doneCount = 0;
    let statTick = 0;
    const jobs = artists.map(artist => limit(async () => {
      if(token !== __runToken) return;
      let items = [];
      try{
        if(shouldFetchArtist(artistCheckCache, artist.id, startTs, allowSkip)){
          items = await fetchTodayReleasesForArtist(cfg, artist.id, startTs, endTs, { throttle: false });
          updateArtistCheckCache(artistCheckCache, artist.id, items);
          if(Array.isArray(items) && items.length && token === __runToken){
            renderFeedAppend(items.map(item => ({
              ...item,
              isOwnedRelease: true,
              actualArtistNames: [String(item.artistName || '').trim()].filter(Boolean),
              sourceArtistNames: [String(item.artistName || '').trim()].filter(Boolean)
            })), { refreshLabels: false, persist: false });
          }
        }
      }catch(e){
        console.warn('[EnhancedOwnedFastPhase] Scan failed for artist', artist?.id, e?.message || e);
      }finally{
        doneCount += 1;
        statTick += 1;
        if(token === __runToken){
          const shouldRefreshStats = Array.isArray(items) && items.length
            ? true
            : (statTick >= 8 || doneCount >= sourceTotal);
          if(shouldRefreshStats){
            statTick = 0;
            setLoadingProgress(doneCount, sourceTotal);
            updateEnhancedHeaderStats({
              artistsText: `${Math.min(doneCount, sourceTotal)}/${sourceTotal}`,
              hitsText: String(__shownCount),
              albumsText: String(Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases.length : 0),
              checkedAlbumsText: String(Math.min(doneCount, sourceTotal)),
              elapsedText: String(__enhancedUiState?.stats?.elapsedText || '00:00')
            }, false);
            const textEl = document.getElementById('progressText') || document.getElementById('loadingText');
            if(textEl){
              textEl.textContent = `新作快扫中：艺人 ${Math.min(doneCount, sourceTotal)}/${sourceTotal} · 卡片 ${__shownCount}`;
            }
            bumpLoadingTimeout(token, calcTimeoutByTotal(sourceTotal));
          }
        }
      }
    }));
    await Promise.all(jobs);
    renderLabelsFeed([...(Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases : []), ...(Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations : [])]);
    scheduleEnhancedUiStatePersist(0);
    saveArtistCheckCache(artistCheckCache);
  }

  // 富化当天专辑：拉取详情、曲目与厂牌
  async function enrichAlbums(cfg, items){
    if(!cfg.apiBase || !items?.length) return items || [];
    // 提高并发以加快详细信息获取
    const limit = pLimit(10);
    const jobs = items.map(it => limit(async () => {
      try{
        const u = new URL('/album', cfg.apiBase);
        u.searchParams.set('id', String(it.id));
        const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
        const d = await fetchJSON(u.toString(), headers, { throttle: false });
        const album = d?.album || {};
        const songs = d?.songs || [];
        const label = album.company || album.companyName || '未知厂牌';
        const trackCount = Array.isArray(songs) ? songs.length : (album.size || 0);
        const tracks = (songs || []).map(s => ({
          id: s.id,
          name: s.name,
          artists: (s.ar || s.artists || []).map(a=>a.name).filter(Boolean).join(' / '),
          link: `https://music.163.com/#/song?id=${s.id}`,
        }));
        const desc = album.description || album.desc || '';
        return { ...it, label, trackCount, tracks, description: desc };
      }catch(e){
        // 失败时保留原始信息，避免整条丢失
        return { ...it, label: '未知厂牌', trackCount: 0, tracks: [], description: '' };
      }
    }));
    return Promise.all(jobs);
  }

  // 策略三：当天全平台新作补充（在关注列表被平台分页限制时使用）
  async function fetchGlobalTodayAlbums(cfg, startTs, endTs){
    if(!cfg.apiBase) return [];
    const items = [];
    const limit = 50;
    let offset = 0;
    for(let page=0; page<40; page++){
      const u = new URL('/top/album', cfg.apiBase);
      u.searchParams.set('offset', String(offset));
      u.searchParams.set('limit', String(limit));
      u.searchParams.set('timestamp', String(Date.now()));
      const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
      let data = {};
      try{ data = await fetchJSON(u.toString(), headers); }catch(e){
        console.warn('全平台新作抓取失败', e?.message||e);
        break;
      }
      const albums = Array.isArray(data?.albums) ? data.albums : (Array.isArray(data?.hotAlbums) ? data.hotAlbums : []);
      const mapped = albums.map(a => ({
        type: a.type || '专辑/单曲',
        name: a.name,
        id: a.id,
        picUrl: a.picUrl,
        publishTime: a.publishTime,
        artistName: (a?.artist?.name) || (a?.artists?.[0]?.name) || '未知艺人',
        artistId: (a?.artist?.id) || (a?.artists?.[0]?.id) || 0,
        link: `https://music.163.com/#/album?id=${a.id}`,
      })).filter(x => x.publishTime >= startTs && x.publishTime <= endTs);
      items.push(...mapped);
      // 若页数据为空或最旧一条已早于范围，终止
      if(!albums.length) break;
      const minTs = Math.min(...albums.map(a => Number(a.publishTime) || 0));
      if(minTs && minTs < startTs) break;
      offset += limit;
      await sleep(150);
    }
    // 去重（按 album id）并按时间倒序
    const seen = new Set();
    const uniq = [];
    for(const it of items){ if(!seen.has(it.id)){ seen.add(it.id); uniq.push(it); } }
    return uniq.sort((a,b)=>b.publishTime - a.publishTime);
  }

  // 补充：从“云音乐小秘书/关注-新歌发布”尝试获取当天新作（仅关注艺人）
  async function fetchFollowTodayBySecretary(cfg, followedSet, startTs, endTs){
    const items = [];
    const diagNoFollow = [];
    let totalNotices = 0, parsedItems = 0, datePassed = 0, followPassed = 0;
    if(!cfg.apiBase) return items;
    // 提示：正在扫描小秘书通知
    try{
      const el = document.getElementById('loadingText');
      if(el && __runToken){ el.textContent = `补充来源扫描中（小秘书）…`; bumpLoadingTimeout(__runToken, calcTimeoutByTotal(followedSet.size||0)); }
    }catch{}
    // 方案A：尝试消息通知接口（可能需要登录 Cookie）
    try{
      const u = new URL('/msg/notices', cfg.apiBase);
      u.searchParams.set('limit', '100');
      u.searchParams.set('offset', '0');
      u.searchParams.set('timestamp', String(Date.now()));
      const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
      const d = await fetchJSON(u.toString(), headers);
      const arr = Array.isArray(d?.msgs) ? d.msgs : (Array.isArray(d?.notices) ? d.notices : []);
      totalNotices = Array.isArray(arr) ? arr.length : 0;
      for(const m of arr || []){
        // 尽力解析结构：优先 album->id，其次 song->album->id，另外兼容 json/data 字段
        const raw = m?.json || m?.data || m?.notice?.json || null;
        let obj = null;
        try{ obj = typeof raw === 'string' ? JSON.parse(raw) : raw; }catch{}
        const album = (obj?.album) || (obj?.resource?.album) || m?.album || m?.resource?.album || m?.song?.album || null;
        const song = (obj?.song) || (obj?.resource?.song) || m?.song || m?.resource?.song || null;
        const albumId = Number(album?.id);
        const publishTime = Number(album?.publishTime) || Number(song?.album?.publishTime) || Number(obj?.publishTime) || Number(m?.publishTime) || 0;
        const artistId = Number((album?.artist?.id) || (song?.artists?.[0]?.id) || (obj?.artistId) || (m?.artistId) || 0);
        if(!albumId || !publishTime || !artistId) continue;
        parsedItems++;
        if(publishTime < startTs || publishTime > endTs) continue; else datePassed++;
        if(!followedSet.has(artistId)){
          // 诊断：记录时间命中但关注不命中的项
          diagNoFollow.push({
            type: (album?.type) || '专辑/单曲',
            name: (album?.name) || (song?.album?.name) || (m?.title) || '新作',
            id: albumId,
            picUrl: (album?.picUrl) || (song?.album?.picUrl) || '',
            publishTime,
            artistName: (album?.artist?.name) || (song?.artists?.[0]?.name) || '未知艺人',
            artistId,
            link: `https://music.163.com/#/album?id=${albumId}`,
            source: '小秘书（未过滤关注）',
          });
          continue;
        } else { followPassed++; }
        const it = {
          type: (album?.type) || '专辑/单曲',
          name: (album?.name) || (song?.album?.name) || (m?.title) || '新作',
          id: albumId,
          picUrl: (album?.picUrl) || (song?.album?.picUrl) || '',
          publishTime,
          artistName: (album?.artist?.name) || (song?.artists?.[0]?.name) || '未知艺人',
          artistId,
          link: `https://music.163.com/#/album?id=${albumId}`,
          source: '小秘书',
        };
        items.push(it);
        try{ liveAppend('sec', it); }catch{}
      }
      if(items.length){
        // 不按专辑去重：仅按时间倒序返回
        const sorted = items.sort((a,b)=>b.publishTime - a.publishTime);
        try{
          const el2 = document.getElementById('loadingText');
          if(el2 && __runToken){ el2.textContent = `补充来源扫描完成（小秘书）…原始 ${totalNotices}，解析 ${parsedItems}，时间命中 ${datePassed}，关注命中 ${followPassed}，最终 ${sorted.length}`; bumpLoadingTimeout(__runToken, calcTimeoutByTotal(followedSet.size||0)); }
        }catch{}
        return sorted;
      }
      // 若时间命中但关注不命中，提供诊断性回退（不过滤关注）
      if(diagNoFollow.length){
        const sortedDiag = diagNoFollow.sort((a,b)=>b.publishTime - a.publishTime);
        try{
          const el3 = document.getElementById('loadingText');
          if(el3 && __runToken){ el3.textContent = `补充来源（小秘书）关注过滤为 0，已使用诊断回退：${sortedDiag.length} 条（未过滤关注）`; bumpLoadingTimeout(__runToken, calcTimeoutByTotal(followedSet.size||0)); }
        }catch{}
        return sortedDiag;
      }
    }catch(e){ /* 忽略，进入方案B */ }
    // 方案B：用新碟榜作为数据源，按关注艺人过滤，仅保留当天范围
    try{
      const global = await fetchGlobalTodayAlbums(cfg, startTs, endTs);
      // 为回退结果标注来源，并不过滤同专辑的重复
      return (global || [])
        .filter(it => followedSet.has(Number(it.artistId)))
        .map(it => ({ ...it, source: '小秘书' }));
    }catch{ return []; }
  }

  // 补充：从“我的关注-音乐新动向”（好友/关注动态流）尝试获取当天新作（仅关注艺人）
  async function fetchFollowTodayByDynamics(cfg, followedSet, startTs, endTs){
    const items = [];
    const diagNoFollow = [];
    let totalEvents = 0, parsedItems = 0, datePassed = 0, followPassed = 0;
    if(!cfg.apiBase) return items;
    // 动态事件接口：可能需要登录 Cookie，事件中常包含 json 字段（字符串），内含 song/album 信息
    try{
      const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
      let more = true;
      let lasttime = -1;
      for(let page=0; page<5 && more; page++){
        const el = document.getElementById('loadingText');
        if(el && __runToken){ el.textContent = `补充来源扫描中（新动向）…第 ${page+1} 页`; bumpLoadingTimeout(__runToken, calcTimeoutByTotal(followedSet.size||0)); }
        const u = new URL('/friend/events', cfg.apiBase);
        u.searchParams.set('limit', '50');
        if(lasttime > 0) u.searchParams.set('lasttime', String(lasttime));
        u.searchParams.set('timestamp', String(Date.now()));
        let d = {};
        try{ d = await fetchJSON(u.toString(), headers); }catch(e){ break; }
        const arr = Array.isArray(d?.event) ? d.event : (Array.isArray(d?.events) ? d.events : []);
        totalEvents += Array.isArray(arr) ? arr.length : 0;
        more = Boolean(d?.more);
        lasttime = Number(d?.lasttime || d?.lastTime || 0);
        for(const ev of arr){
          const raw = ev?.json || ev?.data || '';
          let obj = null;
          try{ obj = typeof raw === 'string' ? JSON.parse(raw) : raw; }catch{}
          const album = obj?.album || obj?.resource?.album || obj?.song?.album || null;
          const song = obj?.song || obj?.resource?.song || null;
          const albumId = Number(album?.id);
          const publishTime = Number(album?.publishTime) || Number(song?.album?.publishTime) || 0;
          const artistId = Number((album?.artist?.id) || (song?.artists?.[0]?.id) || 0);
          if(!albumId || !publishTime || !artistId) continue;
          parsedItems++;
          if(publishTime < startTs || publishTime > endTs) continue; else datePassed++;
          if(!followedSet.has(artistId)){
            diagNoFollow.push({
              type: (album?.type) || '专辑/单曲',
              name: (album?.name) || (song?.album?.name) || '新作',
              id: albumId,
              picUrl: (album?.picUrl) || (song?.album?.picUrl) || '',
              publishTime,
              artistName: (album?.artist?.name) || (song?.artists?.[0]?.name) || '未知艺人',
              artistId,
              link: `https://music.163.com/#/album?id=${albumId}`,
              source: '新动向（未过滤关注）',
            });
            continue;
          } else { followPassed++; }
          const it = {
            type: (album?.type) || '专辑/单曲',
            name: (album?.name) || (song?.album?.name) || '新作',
            id: albumId,
            picUrl: (album?.picUrl) || (song?.album?.picUrl) || '',
            publishTime,
            artistName: (album?.artist?.name) || (song?.artists?.[0]?.name) || '未知艺人',
            artistId,
            link: `https://music.163.com/#/album?id=${albumId}`,
            source: '新动向',
          };
          items.push(it);
          try{ liveAppend('dyn', it); }catch{}
        }
        // 如果这页最早事件的时间已早于当天范围，结束
        const minEventTime = Math.min(...(arr||[]).map(e => Number(e?.eventTime || e?.time || 0)).filter(Boolean));
        if(minEventTime && minEventTime < startTs) break;
        await sleep(80);
      }
      // 若 friend/events 无结果，尝试回退到用户自身事件 /event
      if(items.length === 0){
        let more2 = true; let lasttime2 = -1;
        for(let page=0; page<5 && more2; page++){
          const el = document.getElementById('loadingText');
          if(el && __runToken){ el.textContent = `补充来源扫描中（新动向-自有事件）…第 ${page+1} 页`; bumpLoadingTimeout(__runToken, calcTimeoutByTotal(followedSet.size||0)); }
          const u2 = new URL('/event', cfg.apiBase);
          u2.searchParams.set('pagesize', '50');
          if(lasttime2 > 0) u2.searchParams.set('lasttime', String(lasttime2));
          u2.searchParams.set('timestamp', String(Date.now()));
          let d2 = {};
          try{ d2 = await fetchJSON(u2.toString(), headers); }catch(e){ break; }
          const arr2 = Array.isArray(d2?.event) ? d2.event : (Array.isArray(d2?.events) ? d2.events : []);
          more2 = Boolean(d2?.more);
          lasttime2 = Number(d2?.lasttime || d2?.lastTime || 0);
          for(const ev of arr2){
            const raw = ev?.json || ev?.data || '';
            let obj = null;
            try{ obj = typeof raw === 'string' ? JSON.parse(raw) : raw; }catch{}
            const album = obj?.album || obj?.resource?.album || obj?.song?.album || null;
            const song = obj?.song || obj?.resource?.song || null;
            const albumId = Number(album?.id);
            const publishTime = Number(album?.publishTime) || Number(song?.album?.publishTime) || 0;
            const artistId = Number((album?.artist?.id) || (song?.artists?.[0]?.id) || 0);
            if(!albumId || !publishTime || !artistId) continue;
            if(!followedSet.has(artistId)) continue;
            if(publishTime < startTs || publishTime > endTs) continue;
          const it2 = {
            type: (album?.type) || '专辑/单曲',
            name: (album?.name) || (song?.album?.name) || '新作',
            id: albumId,
            picUrl: (album?.picUrl) || (song?.album?.picUrl) || '',
            publishTime,
            artistName: (album?.artist?.name) || (song?.artists?.[0]?.name) || '未知艺人',
            artistId,
            link: `https://music.163.com/#/album?id=${albumId}`,
            source: '新动向',
          };
          items.push(it2);
          try{ liveAppend('dyn', it2); }catch{}
        }
          const minEventTime2 = Math.min(...(arr2||[]).map(e => Number(e?.eventTime || e?.time || 0)).filter(Boolean));
          if(minEventTime2 && minEventTime2 < startTs) break;
          await sleep(80);
        }
      }
      if(items.length){
        // 不按专辑去重：仅按时间倒序返回，并显示统计
        const sorted = items.sort((a,b)=>b.publishTime - a.publishTime);
        try{
          const elDyn = document.getElementById('loadingText');
          if(elDyn && __runToken){ elDyn.textContent = `补充来源扫描完成（新动向）…原始 ${totalEvents}，解析 ${parsedItems}，时间命中 ${datePassed}，关注命中 ${followPassed}，最终 ${sorted.length}`; bumpLoadingTimeout(__runToken, calcTimeoutByTotal(followedSet.size||0)); }
        }catch{}
        return sorted;
      }
      // 若时间命中但关注不命中，提供诊断性回退（不过滤关注）
      if(diagNoFollow.length){
        const sortedDiag = diagNoFollow.sort((a,b)=>b.publishTime - a.publishTime);
        try{
          const elDiag = document.getElementById('loadingText');
          if(elDiag && __runToken){ elDiag.textContent = `补充来源（新动向）关注过滤为 0，已使用诊断回退：${sortedDiag.length} 条（未过滤关注）`; bumpLoadingTimeout(__runToken, calcTimeoutByTotal(followedSet.size||0)); }
        }catch{}
        return sortedDiag;
      }
    }catch(e){ /* 忽略错误，返回空 */ }
    return [];
  }

  // 更广覆盖：聚合当天“曲库新发布”数据（多区域新碟榜 + 最新专辑）
  async function fetchTodayAlbumsBroad(cfg, startTs, endTs){
    if(!cfg.apiBase) return [];
    const headers = cfg.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
    const items = [];
    const limit = 50;
    const areas = ['ALL','ZH','EA','KR','JP'];
    // 1) 多区域“新上架专辑”抓取（更接近曲库新增，不是榜单）
    for(const area of areas){
      try{
        const u = new URL('/album/new', cfg.apiBase);
        u.searchParams.set('area', area);
        u.searchParams.set('limit', String(100));
        u.searchParams.set('timestamp', String(Date.now()));
        const d = await fetchJSON(u.toString(), headers);
        const albums = Array.isArray(d?.albums) ? d.albums : [];
        const mapped = albums.map(a => ({
          type: a.type || '专辑/单曲',
          name: a.name,
          id: a.id,
          picUrl: a.picUrl,
          publishTime: a.publishTime,
          artistName: (a?.artist?.name) || (a?.artists?.[0]?.name) || '未知艺人',
          artistId: (a?.artist?.id) || (a?.artists?.[0]?.id) || 0,
          link: `https://music.163.com/#/album?id=${a.id}`,
        })).filter(x => x.publishTime >= startTs && x.publishTime <= endTs);
        items.push(...mapped);
        await sleep(120);
      }catch(e){ /* 单区域失败忽略 */ }
    }
    // 2) 多区域新碟榜分页抓取（直到超出当天范围）作为补充
    for(const area of areas){
      let offset = 0;
      for(let page=0; page<30; page++){
        const u = new URL('/top/album', cfg.apiBase);
        u.searchParams.set('limit', String(limit));
        u.searchParams.set('offset', String(offset));
        u.searchParams.set('area', area);
        u.searchParams.set('timestamp', String(Date.now()));
        let data = {};
        try{ data = await fetchJSON(u.toString(), headers); }catch(e){ break; }
        const albums = Array.isArray(data?.albums) ? data.albums : (Array.isArray(data?.hotAlbums) ? data.hotAlbums : []);
        if(!albums.length) break;
        const mapped = albums.map(a => ({
          type: a.type || '专辑/单曲',
          name: a.name,
          id: a.id,
          picUrl: a.picUrl,
          publishTime: a.publishTime,
          artistName: (a?.artist?.name) || (a?.artists?.[0]?.name) || '未知艺人',
          artistId: (a?.artist?.id) || (a?.artists?.[0]?.id) || 0,
          link: `https://music.163.com/#/album?id=${a.id}`,
        })).filter(x => x.publishTime >= startTs && x.publishTime <= endTs);
        items.push(...mapped);
        const minTs = Math.min(...albums.map(a => Number(a.publishTime) || 0));
        if(minTs && minTs < startTs) break;
        offset += limit;
        await sleep(150);
      }
    }
    // 3) 最新专辑列表（更偏全库最新，补足遗漏）
    try{
      const u2 = new URL('/album/newest', cfg.apiBase);
      u2.searchParams.set('timestamp', String(Date.now()));
      const d2 = await fetchJSON(u2.toString(), headers);
      const newer = Array.isArray(d2?.albums) ? d2.albums : [];
      const mapped2 = newer.map(a => ({
        type: a.type || '专辑/单曲',
        name: a.name,
        id: a.id,
        picUrl: a.picUrl,
        publishTime: a.publishTime,
        artistName: (a?.artist?.name) || (a?.artists?.[0]?.name) || '未知艺人',
        artistId: (a?.artist?.id) || (a?.artists?.[0]?.id) || 0,
        link: `https://music.163.com/#/album?id=${a.id}`,
      })).filter(x => x.publishTime >= startTs && x.publishTime <= endTs);
      items.push(...mapped2);
    }catch{}
    // 去重并按时间倒序
    const seen = new Set();
    const uniq = [];
    for(const it of items){ if(!seen.has(it.id)){ seen.add(it.id); uniq.push(it); } }
    return uniq.sort((a,b)=>b.publishTime - a.publishTime);
  }

  // 通过厂牌关键词检索当天发行（聚合多源后再富化过滤）
  async function fetchLabelTodayByKeyword(cfg, keyword, startTs, endTs){
    const key = String(keyword || '').trim().toLowerCase();
    if(!key) return [];
    const today = await fetchTodayAlbumsBroad(cfg, startTs, endTs);
    // Note: We do NOT filter by keyword here because 'today' items lack label info.
    // Filtering is done in the UI handler after 'enrichAlbums' populates label data.
    return today;
  }

  // 厂牌关键词匹配（多字段）：label/company、专辑名、简介、曲目名、曲目艺人
  function matchLabelKeyword(item, key, exact){
    if(!key) return true;
    const label = String(item.label||'').toLowerCase().trim();
    if(exact){
      // 严格模式：仅匹配厂牌字段完全等于
      return label === key;
    }
    const name = String(item.name||'').toLowerCase();
    const desc = String(item.description||'').toLowerCase();
    const inTracks = Array.isArray(item.tracks) && item.tracks.some(t => {
      return String(t?.name||'').toLowerCase().includes(key) || String(t?.artists||'').toLowerCase().includes(key);
    });
    return label.includes(key) || name.includes(key) || desc.includes(key) || inTracks;
  }

  // 解析关键词匹配模式（引号或=前缀触发严格匹配）
  function parseKeywordMode(raw){
    const s = String(raw||'').trim();
    let exact = false; let word = s;
    if((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))){
      exact = true; word = s.slice(1, -1).trim();
    }else if(s.startsWith('=')){
      exact = true; word = s.slice(1).trim();
    }
    return { word, exact };
  }

  // iTunes 备用检索 (JSONP version to bypass CORS)
  function searchItunesAlbumsByLabel(label, days) {
    return new Promise((resolve) => {
      // Clean label for search
      const cleanLabel = label.replace(/['"]/g, '');
      const callbackName = 'itunes_cb_' + Math.random().toString(36).substr(2, 9);
      const term = encodeURIComponent(cleanLabel);
      
      // iTunes API supports 'callback' parameter for JSONP
      // entity=album ensures we get albums. limit=50 is usually enough.
      const url = `https://itunes.apple.com/search?term=${term}&entity=album&limit=50&callback=${window.name || 'window'}.${callbackName}`;
      // Note: We use window[callbackName] so the callback parameter should be just the name if it's on global scope.
      // iTunes callback format: passed_function_name(json_data)
      const scriptUrl = `https://itunes.apple.com/search?term=${term}&entity=album&limit=50&callback=${callbackName}`;

      let timeoutId;
      
      // Define global callback
      window[callbackName] = (data) => {
        cleanup();
        if (!data || !data.results || !data.results.length) {
          resolve([]);
          return;
        }
        
        const now = new Date();
        const start = new Date(now); start.setDate(start.getDate() - days); start.setHours(0,0,0,0);
        const end = new Date(now); end.setDate(end.getDate() + 1); end.setHours(23,59,59,999);
        
        const results = [];
        const labelLower = label.toLowerCase();
        
        for (const item of data.results) {
           if(!item.releaseDate) continue;
           const d = new Date(item.releaseDate);
           // Date Check
           if(d < start || d > end) continue;
           
           // Label Check (Loose)
           const copy = (item.copyright || '').toLowerCase();
           // Check if copyright contains label OR if artist name contains label
           if(!copy.includes(labelLower) && !item.artistName.toLowerCase().includes(labelLower)){
              const labelParts = labelLower.split(' ').filter(x=>x.length>3);
              const matchPart = labelParts.some(p => copy.includes(p));
              if(!matchPart) continue; 
           }

           results.push({
               id: String(item.collectionId),
               name: item.collectionName,
               artistName: item.artistName,
               picUrl: item.artworkUrl100?.replace('100x100', '300x300'),
               publishTime: d.getTime(),
               link: item.collectionViewUrl,
               type: 'Album', 
               label: item.copyright 
           });
        }
        resolve(results);
      };

      // Cleanup function
      function cleanup() {
        if (timeoutId) clearTimeout(timeoutId);
        delete window[callbackName];
        const script = document.getElementById(callbackName);
        if (script) script.remove();
      }

      // Create and inject script
      const script = document.createElement('script');
      script.id = callbackName;
      script.src = scriptUrl;
      script.onerror = () => {
        cleanup();
        resolve([]);
      };
      
      document.body.appendChild(script);

      // Timeout (10s)
      timeoutId = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 10000);
    });
  }

  // 渲染全局动态（扩展）
  function renderGlobalFeed(items){
    const el = document.getElementById('globalFeed');
    if(!el) return;
    if(!items || !items.length){
      el.innerHTML = `<div class="empty">扩展区尚未生成数据（当关注列表被平台限制时用于补充当天全平台新作）。</div>`;
      return;
    }
    el.innerHTML = items.map(item => `
      <article class="card">
        <div class="cover">
          <img src="${escapeAttr(item.picUrl)}" alt="${escapeAttr(item.name)}" />
        </div>
        <div class="meta">
          <div class="title">[扩展] ${escapeHtml(item.name)}</div>
          <div class="artist">${escapeHtml(item.artistName)} · ${escapeHtml(item.type)}</div>
          <div class="date">发布日期：${formatDate(item.publishTime)}</div>
          ${item.label ? `<div class="label">厂牌：${escapeHtml(item.label)}</div>` : ''}
          ${item.description ? `<div class="desc">简介：${escapeHtml(item.description.slice(0,200))}${item.description.length>200?'…':''}</div>` : ''}
          ${item.trackCount>0 ? `
            <details class="tracks">
              <summary>曲目（${item.trackCount}）</summary>
              <ol>
                ${(item.tracks||[]).map(t=>`
                  <li>
                    <a href="${escapeAttr(t.link)}" target="_blank" rel="noopener">${escapeHtml(t.name)}</a>
                    ${t.artists?`<span class="feat"> · ${escapeHtml(t.artists)}</span>`:''}
                  </li>
                `).join('')}
              </ol>
            </details>
          ` : ''}
          <div class="links">
            <a class="pill" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">打开网易云</a>
            ${item.artistId?`<a class="pill" href="https://music.163.com/#/artist?id=${escapeAttr(item.artistId)}" target="_blank" rel="noopener">艺人主页</a>`:''}
          </div>
        </div>
      </article>
    `).join('');
  }

  // Spotify：获取 Token（Client Credentials 或 User Token）
  async function fetchSpotifyToken(clientId, clientSecret){
    // 1. 尝试使用 User Token (localStorage)
    const userToken = localStorage.getItem('spotify_user_token');
    const expiry = Number(localStorage.getItem('spotify_user_token_expiry') || '0');
    // 如果有 User Token 且未过期，直接使用
    if(userToken && Date.now() < expiry){
        console.log('[Spotify] Using User Token from storage');
        return userToken;
    }

    // 2. 尝试使用手动填写的 Token (UI settings)
    const manualToken = document.getElementById('spotifyAccessToken')?.value?.trim();
    if(manualToken && manualToken.length > 20){
         console.log('[Spotify] Using Manual Token from settings');
         return manualToken;
    }

    // 3. 回退到 Client Credentials
    if(!clientId || !clientSecret) throw new Error('缺少 Spotify Client ID/Secret');
    const basic = btoa(`${clientId}:${clientSecret}`);
    const res = await fetch(resolveCorsProxyApi('/spotify-token'), {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    if(!res.ok){ const txt = await res.text(); throw new Error(`Spotify Token 获取失败：${res.status} ${txt}`); }
    const data = await res.json();
    const token = data?.access_token;
    if(!token) throw new Error('未获取到 Spotify Token');
    return token;
  }

  // Spotify：按厂牌检索专辑并按日期过滤
  // [Mod] 返回值改为 { items: [], debug: {} } 以便于排查无结果原因
  // 简单的带超时 Fetch 包装
   const fetchWithTimeout = (url, options = {}, timeout = 30000) => {
     return Promise.race([
       fetch(url, options),
       new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), timeout))
     ]);
   };

  async function searchSpotifyAlbumsByLabel(token, keyword, market, days, exact, onWait){
    const key = String(keyword||'').trim();
    if(!key) return { items: [] };
    const keyLower = key.toLowerCase().trim();
    const limit = 10;
    let offset = 0;
    
    // 调试计数器
    let droppedDate = 0;
    let droppedPrecision = 0;
    let droppedLabel = 0;
    let totalRaw = 0;

    // Helper for progress countdown
    const waitWithCountdown = async (ms) => {
        let remaining = ms;
        while(remaining > 0){
            if(window.__stopSpotifyAppScan) return;
            const sec = Math.ceil(remaining/1000);
            if(onWait) onWait(sec);
            const step = Math.min(1000, remaining);
            await new Promise(r => setTimeout(r, step));
            remaining -= step;
        }
    };
    
    // [Fix] 使用日期字符串匹配，且放宽日期范围（T-1）以适应时区差异
    const validDates = new Set();
    const cfg = loadSettings();
    const base = cfg.targetDate ? new Date(cfg.targetDate) : new Date();
    base.setHours(0,0,0,0);
    const dayCount = clampInt(days, 1, 30, 1);
    
    // 允许误差：保留未来 1 天宽限（应对时区差异），并额外放宽 1 天过去范围以防时区导致的日期落后
    const debugDates = [];
    for(let i=-1; i<=dayCount; i++){
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const s = formatDate(d.getTime()); // yyyy-MM-dd
      validDates.add(s);
      debugDates.push(s);
    }

    // 内部搜索函数
    async function doSearch(useMarket){
       const found = [];
       let rawCount = 0;
       let lastError = null;
       // 限制搜索页数，避免过多
       // console.log(`[Spotify-Label-Debug] Valid Dates: ${Array.from(validDates).join(', ')}`);
       for(let page=0; page<5; page++){
         const url = new URL(resolveCorsProxyApi('/spotify-api/search'));
         
         // [Fix] Detect raw query (e.g. "label:Monstercat year:2026")
         // If user provides a raw query with specific fields, use it directly.
         const isRawQuery = /\b(label|year|tag|upc|isrc|genre|artist|album|track):/i.test(key);
         let qVal;
         
         const year = base.getFullYear();
         // 扩大年份搜索范围
         const prevYear = new Date(base);
         prevYear.setDate(prevYear.getDate() - (dayCount + 1));
         const yearQ = (prevYear.getFullYear() !== year) ? ` year:${prevYear.getFullYear()}-${year}` : (dayCount<=365 ? ` year:${year}` : '');

         if(isRawQuery){
             // If raw query, use it as is. If it doesn't have year, maybe we should append it?
             // But if user uses raw mode, we trust them.
             // However, to be safe for "label:Monstercat", we might want to append year if missing?
             // Let's just append yearQ if 'year:' is NOT in the key.
             if(/year:/i.test(key)){
                 qVal = key;
             } else {
                 qVal = `${key}${yearQ}`;
             }
         } else {
             // Standard mode: wrap in label:""
             const baseQ = `label:"${key}"`;
             qVal = `${baseQ}${yearQ}`;
         }
         
         // console.log(`[Spotify-Label-Debug] Search Query Q: ${qVal}`);
         url.searchParams.set('q', qVal);
         url.searchParams.set('type', 'album');
         // [Fix] Limit 50 -> 10 to avoid "Invalid limit" error and reduce load
         url.searchParams.set('limit', String(limit));
         url.searchParams.set('offset', String(offset));
         if(useMarket) url.searchParams.set('market', useMarket);

          let res;
         let retriedCount = 0;
         while(retriedCount < 5){ // Increased retries
           if(window.__stopSpotifyAppScan) return found; // Check stop flag
           
           // Check global circuit breaker
           if(Date.now() < __spotifyRateLimitedUntil){
               const w = __spotifyRateLimitedUntil - Date.now();
               if(w > 200) await waitWithCountdown(w);
           }
           
           if(window.__stopSpotifyAppScan) return found;

           try{
             res = await fetchWithTimeout(url, { headers: { 'Authorization': `Bearer ${token}` } }, 15000);
           }catch(e){
              // 超时或网络错误，视作重试
           }
           if(res && res.status === 429){
            const ra = Number(res.headers.get('Retry-After')||'5'); // Default to 5s if missing
            console.warn(`[Spotify] Rate limited (429), waiting ${ra}s...`);
            // Set global circuit breaker (Exponential backoff based on retry count)
            // 5s -> 10s -> 20s -> 40s -> 80s
            const backoff = (ra * 1000) + (Math.pow(2, retriedCount) * 5000); 
            const safeWait = backoff + 2000; // Buffer
            __spotifyRateLimitedUntil = Date.now() + safeWait;
            
            await waitWithCountdown(safeWait);
            retriedCount++;
            continue;
          }
          
          if(res && !res.ok) {
             const txt = await res.text();
             console.error(`[Spotify-Label-Debug] Request failed: ${res.status} ${res.statusText}`);
             // Only log body if not 429 (handled above)
             if(res.status !== 429) console.error(`[Spotify-Label-Debug] Body: ${txt}`);

             if(res.status === 403 || res.status === 401) {
                 if(txt.includes('premium') || txt.includes('subscription')) {
                    lastError = 'Spotify Premium Subscription Required for this query.';
                    break;
                 }
                 if(txt.includes('token') || txt.includes('auth')) {
                    console.error('[Spotify-Label-Debug] Token might be expired or invalid.');
                 }
                 lastError = `Spotify API Error: ${res.status} (Possible rate limit or invalid token)`;
                 break;
             }
             // Don't retry client errors (4xx) except 429
             if(res.status >= 400 && res.status < 500) {
                 lastError = `Spotify API Error: ${res.status}`;
                 break;
             }
          }

          if(!res) { retriedCount++; continue; } // 如果 fetch 抛出异常导致 res 为空
          if(!res.ok && lastError) break; // If we found a fatal error
          break;
        }
        
        if(lastError) return { found, rawCount, error: lastError }; // Return error immediately
        if(!res || !res.ok) return { found, rawCount, error: 'Network Error' }; 
         
         const data = await res.json();
        const items = data?.albums?.items || [];
        rawCount += items.length;
        console.log(`[Spotify-Label-Debug] Query: ${url.toString()} | Returned: ${items.length} items`);
        
        if(keyLower.includes('future bass records')){
             console.log(`[DEBUG-FB] Search API returned ${items.length} items. Market: ${useMarket||'Global'}`);
             items.forEach(it => console.log(`  - [${it.id}] ${it.name} (${it.release_date})`));
         }

         // 1. 初筛：日期（宽松）
         const candidateIds = [];
         const skipDateFilter = /\b(year|tag:new):/i.test(key);

         for(const a of items){
             const rel = a?.release_date;
             if(!rel) continue;
             // 只要日期在宽泛集合内即可
             if(skipDateFilter || validDates.has(rel)) candidateIds.push(a.id);
         }

         // 2. 批量获取详细信息以检查 label
         if(candidateIds.length > 0){
             for(let i=0; i<candidateIds.length; i+=20){
                 const chunk = candidateIds.slice(i, i+20);
                 const u2 = new URL(resolveCorsProxyApi('/spotify-api/albums'));
                 u2.searchParams.set('ids', chunk.join(','));
                 if(useMarket) u2.searchParams.set('market', useMarket);
                 
                 try{
                    // Check global circuit breaker
                    if(Date.now() < __spotifyRateLimitedUntil){
                        const w = __spotifyRateLimitedUntil - Date.now();
                        if(w > 200) await waitWithCountdown(w);
                    }

                    let dRes;
                    try{
                        dRes = await fetchWithTimeout(u2, { headers: { 'Authorization': `Bearer ${token}` } }, 15000);
                    }catch(e){}
                    
                    if(dRes && dRes.status === 429){
                         const ra = Number(dRes.headers.get('Retry-After')||'5');
                         // Use exponential backoff here too
                         const backoff = (ra * 1000) + (Math.pow(2, retriedCount) * 5000); 
                         const safeWait = backoff + 2000;
                         __spotifyRateLimitedUntil = Date.now() + safeWait;
                         
                         await waitWithCountdown(safeWait);
                         try{
                            dRes = await fetchWithTimeout(u2, { headers: { 'Authorization': `Bearer ${token}` } }, 15000);
                         }catch(e){}
                    }
                    if(dRes && dRes.ok){
                         const dData = await dRes.json();
                         const albums = dData.albums || [];
                         for(const a of albums){
                             if(!a) continue;
                             
                             // 精确日期检查
                             if(!skipDateFilter && a.release_date_precision !== 'day'){
                                 console.log(`[Spotify-Label-Debug] Dropped "${a.name}" - Precision: ${a.release_date_precision}`);
                                 droppedPrecision++;
                                 continue;
                             }
                             if(!skipDateFilter && !validDates.has(a.release_date)){
                                 console.log(`[Spotify-Label-Debug] Dropped "${a.name}" - Date: ${a.release_date} (Valid: ${Array.from(validDates).join(',')})`);
                                 droppedDate++;
                                 continue;
                             }

                             const label = String(a.label||'').trim();
                            const labelLow = label.toLowerCase();
                            
                            // Debug logging for Future Bass Records
                            if(keyLower.includes('future bass records') || keyLower.includes('fb records')){
                                console.log(`[DEBUG-FB] Checking album: ${a.name}, Label: "${label}", Release: ${a.release_date}, ValidDate: ${validDates.has(a.release_date)}, Exact: ${exact}`);
                            }

                            // 厂牌检查 (Skip if raw query, as we trust Spotify API results for raw queries)
                            // If user typed "label:Monstercat", keyLower includes "label:", so it won't match "Monstercat"
                            const isRawQuery = /\b(label|year|tag|upc|isrc|genre|artist|album|track):/i.test(key);
                            if(!isRawQuery){
                                 if(exact){
                                    // 严格模式 -> 改为双向包含，以适应 "Spiration Music" vs "Spiration"
                                    if(!labelLow.includes(keyLower) && !keyLower.includes(labelLow)){
                                        console.log(`[Spotify-Label-Debug] Dropped "${a.name}" - Label mismatch (Exact): "${label}" vs "${keyLower}"`);
                                        droppedLabel++;
                                        continue;
                                    }
                                 } else {
                                     // 宽松模式：单词边界 -> 改为双向包含
                                     if(!labelLow.includes(keyLower) && !keyLower.includes(labelLow)){
                                        console.log(`[Spotify-Label-Debug] Dropped "${a.name}" - Label mismatch (Loose): "${label}" vs "${keyLower}"`);
                                        droppedLabel++;
                                        continue;
                                     }
                                 }
                            }

                             found.push({
                               id: a.id,
                               name: a.name,
                               picUrl: a.images?.[0]?.url || '',
                               publishTime: new Date(a.release_date).getTime(),
                               artistName: (a.artists?.map(x=>x.name).join(', ')) || '未知艺人',
                               artistId: 0,
                               type: 'Spotify',
                               label: a.label || '',
                               link: a.external_urls?.spotify || `https://open.spotify.com/album/${a.id}`
                             });
                         }
                    }
                 }catch(e){ console.warn('Spotify details fetch warning', e); }
             }
         }

         if(items.length < limit) break;
       offset += limit;
     }
     return { found, rawCount, error: lastError };
  }

  // 1. 尝试带市场参数搜索
    let res = await doSearch(market);
    totalRaw = res.rawCount;
    
    // 2. 如果带市场参数搜不到任何原始数据，且指定了市场，则尝试不带市场参数（全球）
    if(market && res.rawCount === 0 && !res.error){
       console.log('[Spotify] Market search returned 0, retrying global...');
       offset = 0; 
       const res2 = await doSearch(''); 
       res.found.push(...res2.found);
       totalRaw += res2.rawCount;
       if(res2.error) res.error = res2.error;
    }
    
    // 去重
    const unique = [];
    const seen = new Set();
    for(const f of res.found){
        if(!seen.has(f.id)){
            seen.add(f.id);
            unique.push(f);
        }
    }

    console.log(`Spotify 检索完成：有效 ${unique.length} 条（API返回 ${totalRaw} 条） 过滤详情：日期不符 ${droppedDate} | 精度不足 ${droppedPrecision} | 厂牌不符 ${droppedLabel} | 严格匹配过滤 0 目标日期：${cfg.targetDate||'Today'} ~ ${cfg.targetDate||'Today'} 期望日期集合：${debugDates.join(', ')}`);
    
    return { items: unique, debug: { droppedDate, droppedPrecision, droppedLabel, totalRaw }, error: res.error };
  }

  // 将 Spotify 结果追加到厂牌汇总区
  function appendSpotifyLabelSection(items, keyword, days, error){
    if(!els.labelsFeed) return;
    let title = `Spotify 检索：${escapeHtml(keyword)}（${items.length}） · 范围${days}天`;
    let content = '';

    if(error){
        title += ' <span style="color:#ff4444;font-weight:bold">[错误]</span>';
        let hint = '';
        if(String(error).includes('Premium') || String(error).includes('Subscription')){
            hint = '此错误通常仅在使用 Client Credentials (未登录) 模式时出现。<br/><b>解决方案：</b>请点击上方的 <b style="color:#fff">“登录 Spotify”</b> 按钮进行授权（PKCE 模式），使用个人账号 Token 通常可绕过此限制。';
        } else if(String(error).includes('expired') || String(error).includes('token')){
            hint = 'Token 可能已过期。请尝试重新登录或刷新页面。';
        } else {
            hint = '请检查网络连接、代理设置或 API 限制。';
        }
        content = `<div class="error-box" style="padding:10px;background:#550000;color:#ffaaaa;border-radius:8px;margin-top:10px;border:1px solid #770000">
           ⚠️ 检索失败：${escapeHtml(error)}<br/>
           <div style="margin-top:6px;padding-top:6px;border-top:1px dashed #aa4444;color:#ffcccc;font-size:0.9em">${hint}</div>
        </div>`;
    } else {
        content = `
          <ul class="label-list">
            ${items.map(x=>`
              <li>
                <a href="${escapeAttr(x.link)}" target="_blank" rel="noopener">${escapeHtml(x.name)}</a>
                <span class="by"> · ${escapeHtml(x.artistName)} · ${escapeHtml(x.type)}${x.label?` · [${escapeHtml(x.label)}]`:''}</span>
              </li>
            `).join('')}
          </ul>`;
    }

    const html = `
      <section class="card">
        <div class="meta">
          <div class="title">${title}</div>
          ${content}
        </div>
      </section>
    `;
    els.labelsFeed.insertAdjacentHTML('beforeend', html);
  }

  async function fetchJSON(url, headers, opts){
    opts = opts || {};
    const shouldThrottle = opts.throttle !== false;
    const credentials = opts.credentials || 'omit';
    const maxRetries = 4;
    const backoff = [600, 1200, 2400, 4800];
    let lastErr;
    for(let attempt = 0; attempt <= maxRetries; attempt++){
      let timeoutId = null;
      try{
        // 可选全局节流：确保任意两次请求之间有最小间隔
        if(shouldThrottle){
          const gapMs = __dynamicFetchGapMs || MIN_FETCH_GAP_MS;
          const gap = gapMs - (Date.now() - __lastFetchAt);
          if(gap > 0) await sleep(gap);
          __lastFetchAt = Date.now();
        }
        
        const controller = new AbortController();
        const timeoutMs = opts.timeout || 30000; // 默认 30s 超时
        timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        const res = await fetch(url, { credentials, headers, signal: controller.signal });
        if(timeoutId) clearTimeout(timeoutId);
        
        if(!res.ok){
          const text = await res.text();
          const msg = `${text}`;
          // 405/406/429 频率限制：指数退避重试并提升动态节流
          if((res.status === 405 || res.status === 406 || res.status === 429) && attempt < maxRetries){
            __rateLimitStrikes = Math.min(50, __rateLimitStrikes + 1);
            __dynamicFetchGapMs = Math.min(2000, MIN_FETCH_GAP_MS + __rateLimitStrikes * 200);
            const wait = (backoff[attempt] || 1200) + Math.floor(Math.random()*300);
            await sleep(wait);
            continue;
          }
          // 针对后端偶发 502 / TLS 握手失败，进行重试
          const shouldRetry = res.status === 502 || /Client network socket disconnected/i.test(msg) || /ECONNRESET|EAI_AGAIN|fetch failed/i.test(msg);
          if(shouldRetry && attempt < maxRetries){
            await sleep(backoff[attempt] || 800);
            continue;
          }
          if(res.status === 500) console.error(`[fetchJSON] 500 Error Body:`, msg);
          throw new Error(`请求失败 ${res.status}: ${msg.slice(0,180)}`);
        }
        const body = await res.json();
        // NeteaseCloudMusicApi 常用返回格式包含 code 字段
        if(body && typeof body.code !== 'undefined'){
          const code = Number(body.code);
          // 可接受的业务态（例如 QR 轮询的 800/801/802/803）
          const accepts = Array.isArray(opts.acceptCodes) ? opts.acceptCodes.map(Number) : [];
          if(code === 301){
            throw new Error('未登录或 Cookie 已失效，请重新扫码登录网易云，或在设置中重新粘贴有效 Cookie');
          }
          // 业务态限流：遇到“操作频繁”或 405/406/429，进行退避重试并提升动态节流
          const rlMsg = String(body.msg || body.message || body.error || '').trim();
          const isRateLimitedMsg = /操作频繁|频繁|Too Many Requests|rate ?limit/i.test(rlMsg);
          if((code === 405 || code === 406 || code === 429 || isRateLimitedMsg) && !accepts.includes(code)){
            if(attempt < maxRetries){
              __rateLimitStrikes = Math.min(50, __rateLimitStrikes + 1);
              __dynamicFetchGapMs = Math.min(2000, MIN_FETCH_GAP_MS + __rateLimitStrikes * 200);
              await sleep(backoff[attempt] || 1200);
              continue;
            }
            throw new Error(rlMsg || `接口返回 code=${code}`);
          }
          if(code !== 200 && !accepts.includes(code)){
            const msg = body.msg || body.message || body.error || `接口返回 code=${code}`;
            if(attempt < maxRetries){
              await sleep(backoff[attempt] || 800);
              continue;
            }
            throw new Error(msg);
          }
        }
        // 成功响应后，逐步降低动态节流以恢复正常速度
        if(__rateLimitStrikes > 0){
          __rateLimitStrikes = Math.max(0, __rateLimitStrikes - 1);
          __dynamicFetchGapMs = Math.max(MIN_FETCH_GAP_MS, __dynamicFetchGapMs - 50);
        }
        return body;
      }catch(e){
        if(timeoutId) clearTimeout(timeoutId);
        lastErr = e;
        const msg = String(e?.message || e);
        // 将浏览器层面的中止（ERR_ABORTED）与常见瞬时网络错误视为可重试
        const transient = /ERR_ABORTED|aborted|Client network socket disconnected|ECONNRESET|EAI_AGAIN|fetch failed/i.test(msg);
        if(transient && attempt < maxRetries){
          await sleep(backoff[attempt] || 800);
          continue;
        }
        // 文本错误中包含“操作频繁”等提示，也视为限流重试
        if(/操作频繁|Too Many Requests|rate ?limit/i.test(msg) && attempt < maxRetries){
          __rateLimitStrikes = Math.min(50, __rateLimitStrikes + 1);
          __dynamicFetchGapMs = Math.min(2000, MIN_FETCH_GAP_MS + __rateLimitStrikes * 200);
          await sleep(backoff[attempt] || 1200);
          continue;
        }
        throw e;
      }
    }
    // 理论上不会到这里；兜底抛出最后错误
    throw lastErr || new Error('请求失败');
  }

  async function postJSON(url, payload, headers, opts){
    opts = opts || {};
    const credentials = opts.credentials || 'omit';
    let timeoutId = null;
    try{
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), opts.timeout || 30000);
      const mergedHeaders = { 'Content-Type': 'application/json', ...(headers || {}) };
      const res = await fetch(url, {
        method: opts.method || 'POST',
        credentials,
        headers: mergedHeaders,
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      if(timeoutId) clearTimeout(timeoutId);
      const text = await res.text();
      let body = {};
      if(text){
        try{ body = JSON.parse(text); }
        catch{ throw new Error(text.slice(0, 180) || `请求失败 ${res.status}`); }
      }
      if(!res.ok){
        const detailMsg = body?.detail?.msg || body?.detail?.message || body?.detail?.error || '';
        const msg = detailMsg || body?.msg || body?.message || body?.error || text || `HTTP ${res.status}`;
        if(Number(res.status) === 301 || Number(body?.code) === 301){
          throw new Error('未登录或 Cookie 已失效，请重新扫码登录网易云，或在设置中重新粘贴有效 Cookie');
        }
        throw new Error(`请求失败 ${res.status}: ${String(msg).slice(0, 180)}`);
      }
      if(body && typeof body.code !== 'undefined'){
        const code = Number(body.code);
        const accepts = Array.isArray(opts.acceptCodes) ? opts.acceptCodes.map(Number) : [];
        if(code === 301 && !accepts.includes(code)){
          throw new Error('未登录或 Cookie 已失效，请重新扫码登录网易云，或在设置中重新粘贴有效 Cookie');
        }
        if(code !== 200 && !accepts.includes(code)){
          const msg = body.msg || body.message || body.error || `接口返回 code=${code}`;
          throw new Error(msg);
        }
      }
      return body;
    }catch(e){
      if(timeoutId) clearTimeout(timeoutId);
      throw e;
    }
  }

  // 通过名称搜索艺人并返回其ID（优先 /cloudsearch，回退 /search、/search/suggest、/search/multimatch）
  async function searchArtistByName(apiBase, cookie, name){
    const trimmed = String(name || '').trim();
    // 先尝试从 URL 或包含“id=”的文本中解析艺人ID
    {
      let fromUrlId = 0;
      // URL 解析（如 https://music.163.com/#/artist?id=52194598 或 https://music.163.com/artist?id=52194598）
      try{
        const maybeUrl = new URL(trimmed);
        const pId = maybeUrl.searchParams.get('id');
        if(pId && /^\d+$/.test(pId)){
          const n = Number(pId);
          if(Number.isFinite(n) && n>0) return n;
        }
      }catch{}
      // 文本中带有 id 提示的情况（如 “id=52194598”、“艺人ID：52194598”）
      const m = trimmed.match(/(?:artist\s*\?id|artist\s*id|\bid)\s*[=:：]?\s*(\d{4,})/i);
      if(m){
        const n = Number(m[1] || 0);
        if(Number.isFinite(n) && n>0) return n;
      }
    }
    // 如果输入主要是数字（仅夹杂空白或标点），也视为艺人ID
    {
      const digitsOnly = trimmed.replace(/\D+/g, '');
      const nonDigits = trimmed.replace(/[0-9]+/g, '');
      // 非数字只包含空白或常见分隔符，则认为是“数字ID+装饰”的输入
      if(digitsOnly && /^[\s\-_:,，。·、\/()（）]*$/u.test(nonDigits)){
        const n = Number(digitsOnly);
        if(Number.isFinite(n) && n>0) return n;
      }
      // 完全数字的情况（兜底）
      if(/^\d+$/.test(trimmed)){
        const n = Number(trimmed);
        if(Number.isFinite(n) && n>0) return n;
      }
    }
    const endpoints = [
      { path: '/cloudsearch', parse: (d) => Array.isArray(d?.result?.artists) ? d.result.artists : (Array.isArray(d?.artists) ? d.artists : []) },
      { path: '/search', parse: (d) => Array.isArray(d?.result?.artists) ? d.result.artists : (Array.isArray(d?.artists) ? d.artists : []) },
      { path: '/search/suggest', parse: (d) => Array.isArray(d?.result?.artists) ? d.result.artists : (Array.isArray(d?.artists) ? d.artists : []) },
      { path: '/search/multimatch', parse: (d) => Array.isArray(d?.result?.artist?.matches) ? d.result.artist.matches : (Array.isArray(d?.result?.artists) ? d.result.artists : []) },
    ];
    const headers = undefined; // 使用 query 参数传递 cookie
    const qLower = trimmed.toLowerCase();
    let endpointErrors = 0;
    for(const ep of endpoints){
      try{
        const u = new URL(ep.path, apiBase);
        u.searchParams.set('keywords', trimmed);
        u.searchParams.set('type', '100');
        u.searchParams.set('limit', '30');
        u.searchParams.set('timestamp', String(Date.now()));
        if(cookie) u.searchParams.set('cookie', cookie);
        const d = await fetchJSON(u.toString(), headers);
        const artists = ep.parse(d) || [];
        if(Array.isArray(artists) && artists.length > 0){
          // 选择策略：优先精确（忽略大小写），其次别名命中，再次模糊包含
          const normalized = (x) => String(x||'').toLowerCase().trim();
          const exact = artists.find(a => normalized(a?.name) === qLower);
          const aliasHit = artists.find(a => Array.isArray(a?.alias) && a.alias.some(s => normalized(s) === qLower));
          const fuzzy = artists.find(a => normalized(a?.name).includes(qLower));
          const best = exact || aliasHit || fuzzy || artists[0];
          const id = Number(best?.id || 0);
          if(Number.isFinite(id) && id>0) return id;
        }
      }catch(e){
        const msg = String(e?.message || e);
        if(/404|Cannot GET/i.test(msg)){
          endpointErrors++;
          continue;
        }
        // 其它错误也统计，但仍尝试回退
        endpointErrors++;
        continue;
      }
    }
    // 若所有端点均不可用，返回 -1 以便上层提示“后端不支持搜索”
    if(endpointErrors >= endpoints.length) return -1;
    return 0;
  }

  function renderLoading(){
    // 增强模式下，进度条常驻在页面顶部的 #progressBox 中，避免卡片渲染时被清除
    els.feed.innerHTML = `<div class="empty"><span id="loadingText">正在加载…</span> <button id="cancelLoad" class="pill">取消刷新</button></div>`;
    if(els.compilationFeed && !__enhancedUiState.compilations.length){
      els.compilationFeed.innerHTML = `<div class="empty">${escapeHtml(getEnhancedEmptyMessage(ENHANCED_TAB_COMPILATION, 'loading'))}</div>`;
    }
    const btn = document.getElementById('cancelLoad');
    if(btn){
      btn.onclick = () => {
        // 通过令牌递增来取消后续渲染
        __runToken++;
        if(__enhancedBackendTaskId && __enhancedBackendTaskConfig){
          stopEnhancedBackendScan(__enhancedBackendTaskConfig).catch(err => console.warn('[Enhanced] Failed to stop backend scan from cancel button:', err));
        }
        renderEmpty('已取消刷新');
        if(__loadingTimer){ try{ clearTimeout(__loadingTimer); }catch{} __loadingTimer = null; }
      };
    }
  }
  function updateDiagnostics(info){
    if(!window.__ENHANCED_MODE__) return;
    try{
      const box = document.getElementById('diagnostics');
      if(!box) return;
      const lines = [];
      if(info.phase) lines.push(`阶段: ${info.phase}`);
      if(info.sourceLabel) lines.push(`来源: ${info.sourceLabel}`);
      if(typeof info.offset !== 'undefined') lines.push(`offset=${info.offset}, limit=${info.limit}`);
      if(typeof info.length !== 'undefined') lines.push(`返回条数=${info.length}, 新增=${info.gained||0}`);
      if(typeof info.more !== 'undefined') lines.push(`more=${info.more}`);
      if(typeof info.expectedTotal !== 'undefined' && info.expectedTotal !== null) lines.push(`预计总量=${info.expectedTotal}`);
      if(typeof info.fetched !== 'undefined') lines.push(`累计唯一艺人=${info.fetched}`);
      if(typeof info.emptySpins !== 'undefined') lines.push(`空转累计=${info.emptySpins}`);
      if(typeof info.artistDone !== 'undefined' || typeof info.artistTotal !== 'undefined'){
        lines.push(`艺人进度=${Number(info.artistDone || 0)}/${Number(info.artistTotal || 0)}`);
      }
      if(typeof info.resultAlbums !== 'undefined') lines.push(`结果专辑=${Number(info.resultAlbums || 0)}`);
      if(typeof info.matchedTracks !== 'undefined') lines.push(`命中单曲=${Number(info.matchedTracks || 0)}`);
      if(typeof info.songHit !== 'undefined' || typeof info.songMiss !== 'undefined'){
        lines.push(`recent songs cache: hit=${Number(info.songHit || 0)}, miss=${Number(info.songMiss || 0)}`);
      }
      if(typeof info.ownedHit !== 'undefined' || typeof info.ownedMiss !== 'undefined'){
        lines.push(`owned cache: hit=${Number(info.ownedHit || 0)}, miss=${Number(info.ownedMiss || 0)}`);
      }
      if(typeof info.albumHit !== 'undefined' || typeof info.albumMiss !== 'undefined'){
        lines.push(`album cache: hit=${Number(info.albumHit || 0)}, miss=${Number(info.albumMiss || 0)}`);
      }
      if(typeof info.checkedAlbums !== 'undefined') lines.push(`已检查专辑=${Number(info.checkedAlbums || 0)}`);
      const ts = new Date().toLocaleTimeString();
      lines.push(`时间=${ts}`);
      box.style.display = 'block';
      box.textContent = lines.join('\n');
    }catch{}
  }
  function setLoadingProgress(done, total){
    const el = document.getElementById('loadingText');
    if(el){
      const d = Math.min(done, total);
      el.textContent = `正在加载…（艺人 ${d}/${total} · 卡片 ${__shownCount}）`;
    }
    // 更新顶部进度条与文本（稳定版与增强版均生效，如存在该元素）
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    const d = Math.min(done, total);
    const pct = total>0 ? Math.round(100 * d / total) : 0;
    if(fill) fill.style.width = `${pct}%`;
    if(text) text.textContent = `进度：艺人 ${d}/${total} · 卡片 ${__shownCount}（${pct}%）`;
  }
  function calcTimeoutByTotal(total){
    const base = 30000; // 30s 基础
    const perArtist = 20; // 每位艺人附加 20ms（并发会抵消部分）
    const maxCap = 300000; // 上限 300s
    const ms = base + Math.max(0, total)*perArtist;
    return Math.min(maxCap, ms);
  }
  function bumpLoadingTimeout(token, ms){
    // 每当进度推进时，刷新超时倒计时，避免“假超时”提示
    if(__loadingTimer){ try{ clearTimeout(__loadingTimer); }catch{} }
    __loadingTimer = setTimeout(() => {
      if(token === __runToken){
        const hasRenderedItems = Boolean(
          (Array.isArray(__enhancedUiState.newReleases) && __enhancedUiState.newReleases.length) ||
          (Array.isArray(__enhancedUiState.compilations) && __enhancedUiState.compilations.length)
        );
        if(hasRenderedItems){
          const textEl = document.getElementById('progressText') || document.getElementById('loadingText');
          if(textEl){
            textEl.textContent = '扫描仍在进行，但当前阶段耗时较长；已保留现有卡片，请稍候或稍后重试。';
          }
          scheduleEnhancedUiStatePersist(0);
          return;
        }
        renderEmpty('加载超时，可能由于接口限流或关注艺人过多。请稍后重试，或在“设置”中减小时间范围/关注艺人数量。');
      }
    }, Math.max(25000, ms||0));
  }
  function renderEmpty(msg){
    renderFeedSection(ENHANCED_TAB_NEW, [], msg);
  }
  function normalizeTrackList(tracks){
    return (Array.isArray(tracks) ? tracks : []).map((t, index) => ({
      id: Number(t?.id) || 0,
      name: String(t?.name || '').trim(),
      artists: String(t?.artists || '').trim(),
      link: String(t?.link || ''),
      index
    })).filter(t => Number.isFinite(t.id) && t.id > 0);
  }
  function encodeTrackListAttr(tracks){
    try{
      const payload = normalizeTrackList(tracks);
      return escapeAttr(encodeURIComponent(JSON.stringify(payload)));
    }catch{
      return '';
    }
  }
  function parseTrackListAttr(raw){
    try{
      if(!raw) return [];
      const decoded = decodeURIComponent(String(raw));
      return normalizeTrackList(JSON.parse(decoded));
    }catch{
      return [];
    }
  }
  function buildTrackDetailsHTML(item){
    if(!(item.trackCount > 0)) return '';
    const tracks = normalizeTrackList(item.tracks);
    return `
      <details class="tracks">
        <summary>曲目（${item.trackCount}）</summary>
        <ol>
          ${tracks.map((t, index) => `
            <li>
              <div class="track-main">
                <a href="${escapeAttr(t.link)}" target="_blank" rel="noopener">${escapeHtml(t.name)}</a>
                ${t.artists ? `<span class="feat"> · ${escapeHtml(t.artists)}</span>` : ''}
              </div>
              <div class="track-actions">
                <button type="button" class="pill track-mini-btn track-preview-btn" data-track-index="${index}" data-track-id="${escapeAttr(String(t.id))}" data-track-name="${escapeAttr(t.name)}" data-track-artists="${escapeAttr(t.artists)}">试听</button>
                <button type="button" class="pill track-mini-btn track-collect-btn" data-track-id="${escapeAttr(String(t.id))}" data-track-name="${escapeAttr(t.name)}" data-track-artists="${escapeAttr(t.artists)}">收藏</button>
                <button type="button" class="pill track-mini-btn track-comment-btn" data-comment-type="song" data-resource-id="${escapeAttr(String(t.id))}" data-resource-name="${escapeAttr(t.name)}" data-resource-subtitle="${escapeAttr(`${item.artistName} · 单曲`)}">评论</button>
              </div>
            </li>
          `).join('')}
        </ol>
      </details>
    `;
  }
  function buildPreviewControlsHTML(item){
    const tracks = normalizeTrackList(item.tracks);
    const first = tracks[0] || {};
    return `
      <div class="preview-controls">
        <div class="preview-current">当前试听：未播放</div>
        <div class="preview-actions">
          <button class="pill preview-pill preview-prev" title="上一首">上一首</button>
          <button class="pill preview-pill preview-btn" data-preview-track="${escapeAttr(String(first.id || ''))}" data-preview-name="${escapeAttr(String(first.name || ''))}" data-preview-artists="${escapeAttr(String(first.artists || ''))}" data-album-id="${escapeAttr(String(item.id))}">试听 / 暂停</button>
          <button class="pill preview-pill preview-next" title="下一首">下一首</button>
        </div>
        <div class="preview-progress">
          <div class="preview-bar"><div class="preview-fill" style="width:0%"></div></div>
          <span class="preview-time">00:00</span>
        </div>
      </div>
    `;
  }
  function buildCardLinksHTML(item){
    return `
      <div class="links">
        <a class="pill" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">打开网易云</a>
        <a class="pill" href="https://music.163.com/#/artist?id=${escapeAttr(item.artistId)}" target="_blank" rel="noopener">艺人主页</a>
        <button type="button" class="pill action-pill album-collect-btn" data-album-id="${escapeAttr(String(item.id))}" data-album-name="${escapeAttr(item.name)}" data-album-artist="${escapeAttr(item.artistName)}">收藏整专曲目</button>
        <button type="button" class="pill action-pill album-comment-btn" data-comment-type="album" data-resource-id="${escapeAttr(String(item.id))}" data-resource-name="${escapeAttr(item.name)}" data-resource-subtitle="${escapeAttr(`${item.artistName} · ${item.type}`)}">专辑评论</button>
      </div>
    `;
  }
  function buildCardMetaLinesHTML(item){
    const actualArtists = normalizeNameList(item?.actualArtistNames);
    const sourceArtists = normalizeNameList(item?.sourceArtistNames);
    const isCompilation = classifyEnhancedItem(item) === ENHANCED_TAB_COMPILATION;
    return `
      ${isCompilation && actualArtists.length ? `<div class="artist secondary">实际艺术家：${escapeHtml(actualArtists.join(' / '))}</div>` : ''}
      ${isCompilation && sourceArtists.length ? `<div class="artist secondary">扫描来源艺人：${escapeHtml(sourceArtists.join(' / '))}</div>` : ''}
      ${item.label ? `<div class="label-bar">厂牌：${escapeHtml(item.label)}</div>` : ''}
    `;
  }
  function getCardDisplayArtist(item){
    const actualArtists = normalizeNameList(item?.actualArtistNames);
    const sourceArtists = normalizeNameList(item?.sourceArtistNames);
    const isCompilation = classifyEnhancedItem(item) === ENHANCED_TAB_COMPILATION;
    if(isCompilation && actualArtists.length){
      return actualArtists.join(' / ');
    }
    if(actualArtists.length){
      return actualArtists.join(' / ');
    }
    if(sourceArtists.length){
      return sourceArtists.join(' / ');
    }
    return String(item?.artistName || '未知艺人');
  }
  function renderFeed(items){
    const normalized = normalizeEnhancedBackendResults(items);
    setEnhancedItemsByTab(ENHANCED_TAB_NEW, normalized.filter(item => classifyEnhancedItem(item) === ENHANCED_TAB_NEW));
    setEnhancedItemsByTab(ENHANCED_TAB_COMPILATION, normalized.filter(item => classifyEnhancedItem(item) === ENHANCED_TAB_COMPILATION));
    renderEnhancedPanelsFromState();
    persistEnhancedUiState();
  }

  // 逐条追加渲染（按发布时间倒序插入）
  function buildCardHTML(item){
    const displayArtist = getCardDisplayArtist(item);
    return `
      <article class="card" data-publish="${Number(item.publishTime)||0}" data-track-list="${encodeTrackListAttr(item.tracks)}">
        <div class="cover">
          <img src="${escapeAttr(item.picUrl)}" alt="${escapeAttr(item.name)}" />
        </div>
        <div class="meta">
          <div class="title">${escapeHtml(item.name)}</div>
          <div class="artist">${escapeHtml(displayArtist)} · ${escapeHtml(item.type)}</div>
          ${item.source ? `<div class="source">来源：${escapeHtml(item.source)}</div>` : ''}
          ${buildCardMetaLinesHTML(item)}
          ${item.description ? `<div class="desc">简介：${escapeHtml(item.description.slice(0,200))}${item.description.length>200?'…':''}</div>` : ''}
          ${buildTrackDetailsHTML(item)}
          ${buildPreviewControlsHTML(item)}
          <div class="date">发布日期：${formatDate(item.publishTime)}</div>
          ${buildCardLinksHTML(item)}
        </div>
      </article>
    `;
  }
  function clearEmptyFeedPlaceholder(feedEl){
    if(feedEl && feedEl.querySelector('.empty')){ feedEl.innerHTML = ''; }
  }
  function insertCardSorted(entry){
    const tab = entry?.tab === ENHANCED_TAB_COMPILATION ? ENHANCED_TAB_COMPILATION : ENHANCED_TAB_NEW;
    const item = entry?.item;
    const feedEl = getEnhancedFeedByTab(tab);
    if(!feedEl || !item) return;
    clearEmptyFeedPlaceholder(feedEl);
    const ts = Number(item.publishTime)||0;
    const html = buildCardHTML(item);
    const nodes = feedEl.querySelectorAll('article.card[data-publish]');
    let inserted = false;
    for(const n of nodes){
      const nt = Number(n.getAttribute('data-publish'))||0;
      if(ts > nt){
        n.insertAdjacentHTML('beforebegin', html);
        inserted = true; break;
      }
    }
    if(!inserted){ feedEl.insertAdjacentHTML('beforeend', html); }
  }
  // 将增量渲染改为队列 + rAF 小批次处理，减少主线程阻塞
  function scheduleAppend(){
    if(__appendScheduled) return;
    __appendScheduled = true;
    requestAnimationFrame(processAppendBatch);
  }
  function processAppendBatch(){
    __appendScheduled = false;
    const BATCH = Math.max(8, Math.min(96, Number(__appendBatchSize || 16)));
    const count = Math.min(__appendQueue.length, BATCH);
    if(count > 0){
      const items = __appendQueue.splice(0, count);
      const sorted = items.sort((a,b)=>Number(b?.item?.publishTime || 0) - Number(a?.item?.publishTime || 0));
      for(const it of sorted){ insertCardSorted(it); }
    }
    if(__appendQueue.length > 0){
      requestAnimationFrame(processAppendBatch);
    }
  }
  function renderFeedAppend(items, opts = {}){
    if(!Array.isArray(items) || items.length===0) return;
    if(Number.isFinite(Number(opts.batchSize))){
      __appendBatchSize = Math.max(8, Math.min(96, Number(opts.batchSize)));
    }
    const queued = [];
    for(const item of items){
      const tab = opts.forceTab || item?.resultTab || classifyEnhancedItem(item);
      const nextItem = opts.forceTab
        ? { ...item, resultTab: tab, type: tab === ENHANCED_TAB_COMPILATION ? '扫描合辑' : '扫描新作' }
        : item;
      upsertEnhancedStateItem(tab, nextItem);
      queued.push({ tab, item: nextItem });
    }
    updateEnhancedShownCount();
    __appendQueue.push(...queued);
    scheduleAppend();
    if(opts.refreshLabels !== false){
      renderLabelsFeed([...(Array.isArray(__enhancedUiState.newReleases) ? __enhancedUiState.newReleases : []), ...(Array.isArray(__enhancedUiState.compilations) ? __enhancedUiState.compilations : [])]);
    }
    if(opts.persist !== false){
      scheduleEnhancedUiStatePersist();
    }
    if(opts.bindPreview !== false){
      bindPreviewUI(loadSettings());
    }
  }

  // --- 试听播放逻辑 ---
  let __audioEl = null;
  let __audioBound = false;
  let __currentCard = null;
  let __currentTrackId = null;
  let __currentTracks = null; // {id,name}[]
  let __currentIndex = -1;
  let __dialogAudioEl = null;
  let __dialogCurrentTrackId = null;
  let __dialogCurrentTracks = null;
  let __dialogCurrentIndex = -1;
  let __playlistDialogBound = false;
  let __playlistCache = { uid: null, items: [], ts: 0 };
  let __playlistSelection = { mode: 'single', track: null, tracks: [], sourceCard: null, user: null, items: [], selectedIds: new Set(), filteredIds: [], selectedTrackIds: new Set() };
  let __draggingPinnedPlaylistId = 0;
  let __commentDialogBound = false;
  let __commentSelection = null;
  function ensureAudio(){
    if(!__audioEl){
      __audioEl = new Audio();
      __audioEl.preload = 'auto';
      __audioEl.crossOrigin = 'anonymous';
      __audioEl.addEventListener('timeupdate', () => {
        try{
          if(!__currentCard) return;
          const fill = __currentCard.querySelector('.preview-fill');
          const timeEl = __currentCard.querySelector('.preview-time');
          const dur = __audioEl.duration || 0;
          const cur = __audioEl.currentTime || 0;
          const pct = (dur>0) ? Math.max(0, Math.min(100, Math.round(cur/dur*100))) : 0;
          if(fill) fill.style.width = pct + '%';
          if(timeEl) timeEl.textContent = formatTime(cur);
        }catch{}
      });
      __audioEl.addEventListener('ended', async () => {
        try{
          if(__currentCard && Array.isArray(__currentTracks) && __currentIndex >= 0 && __currentIndex < __currentTracks.length - 1){
            await playTrackByIndex(loadSettings(), __currentCard, __currentIndex + 1, { autoAdvance: true, silent: true });
            return;
          }
        }catch{}
        resetPreviewUI();
      });
      __audioEl.addEventListener('pause', () => { /* 保持进度，但按钮文案改回“试听” */
        updateButtonLabel(false);
      });
      __audioEl.addEventListener('play', () => { updateButtonLabel(true); });
    }
    return __audioEl;
  }
  function formatTime(sec){
    const s = Math.floor(sec||0);
    const mm = String(Math.floor(s/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    return `${mm}:${ss}`;
  }
  function ensureDialogAudio(){
    if(!__dialogAudioEl){
      __dialogAudioEl = new Audio();
      __dialogAudioEl.preload = 'auto';
      __dialogAudioEl.crossOrigin = 'anonymous';
      __dialogAudioEl.addEventListener('timeupdate', () => {
        updateDialogPreviewUI();
      });
      __dialogAudioEl.addEventListener('pause', () => {
        updateDialogPreviewUI();
      });
      __dialogAudioEl.addEventListener('play', () => {
        updateDialogPreviewUI();
      });
      __dialogAudioEl.addEventListener('ended', () => {
        resetDialogPreviewUI();
      });
      __dialogAudioEl.addEventListener('loadedmetadata', () => {
        updateDialogPreviewUI();
      });
    }
    return __dialogAudioEl;
  }
  function resetCardPreviewUI(card){
    try{
      if(!card) return;
      const fill = card.querySelector('.preview-fill');
      const timeEl = card.querySelector('.preview-time');
      const currentEl = card.querySelector('.preview-current');
      const btn = card.querySelector('.preview-btn');
      if(fill) fill.style.width = '0%';
      if(timeEl) timeEl.textContent = '00:00';
      if(currentEl) currentEl.textContent = '当前试听：未播放';
      if(btn) btn.textContent = '试听 / 暂停';
      card.querySelectorAll('.track-preview-btn').forEach(trackBtn => {
        trackBtn.classList.remove('is-active');
        trackBtn.textContent = '试听';
      });
    }catch{}
  }
  function resetDialogTrackPreviewRow(row){
    try{
      if(!row) return;
      const btn = row.querySelector('.playlist-track-preview-btn');
      const fill = row.querySelector('.playlist-track-progress-fill');
      const timeEl = row.querySelector('.playlist-track-progress-time');
      if(btn) btn.textContent = '试听';
      if(fill) fill.style.width = '0%';
      if(timeEl) timeEl.textContent = '00:00 / 00:00';
      row.classList.remove('is-previewing', 'is-paused');
    }catch{}
  }
  function resetDialogPreviewUI(){
    try{
      if(__dialogAudioEl){
        try{ __dialogAudioEl.pause(); }catch{}
        __dialogAudioEl.removeAttribute('src');
      }
      __dialogCurrentTrackId = null;
      __dialogCurrentTracks = null;
      __dialogCurrentIndex = -1;
      els.playlistPickerTrackList?.querySelectorAll('.playlist-track-item').forEach(resetDialogTrackPreviewRow);
    }catch{}
  }
  function updateDialogPreviewUI(){
    try{
      const listEl = els.playlistPickerTrackList;
      if(!listEl) return;
      const audio = __dialogAudioEl;
      const currentId = Number(__dialogCurrentTrackId) || 0;
      listEl.querySelectorAll('.playlist-track-item').forEach(row => {
        const tid = Number(row.getAttribute('data-track-id')) || 0;
        const btn = row.querySelector('.playlist-track-preview-btn');
        const fill = row.querySelector('.playlist-track-progress-fill');
        const timeEl = row.querySelector('.playlist-track-progress-time');
        const active = currentId && tid === currentId;
        row.classList.toggle('is-previewing', active && Boolean(audio) && !audio.paused);
        row.classList.toggle('is-paused', active && Boolean(audio) && audio.paused);
        if(!active){
          if(btn) btn.textContent = '试听';
          if(fill) fill.style.width = '0%';
          if(timeEl) timeEl.textContent = '00:00 / 00:00';
          return;
        }
        const dur = audio?.duration || 0;
        const cur = audio?.currentTime || 0;
        const pct = (dur > 0) ? Math.max(0, Math.min(100, Math.round(cur / dur * 100))) : 0;
        if(btn) btn.textContent = audio?.paused ? '继续' : '暂停';
        if(fill) fill.style.width = `${pct}%`;
        if(timeEl) timeEl.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
      });
    }catch{}
  }
  function resetPreviewUI(){
    try{
      if(__currentCard){
        resetCardPreviewUI(__currentCard);
      }
      __currentCard = null; __currentTrackId = null; __currentTracks = null; __currentIndex = -1;
    }catch{}
  }
  function updateButtonLabel(playing){
    try{
      if(!__currentCard) return;
      const btn = __currentCard.querySelector('.preview-btn');
      if(btn) btn.textContent = playing ? '暂停' : '试听 / 暂停';
      const currentEl = __currentCard.querySelector('.preview-current');
      if(currentEl){
        const track = Array.isArray(__currentTracks) ? __currentTracks[__currentIndex] : null;
        currentEl.textContent = track
          ? `当前试听：${__currentIndex + 1}/${__currentTracks.length} · ${track.name}${track.artists ? ` · ${track.artists}` : ''}${playing ? '' : '（已暂停）'}`
          : '当前试听：未播放';
      }
      __currentCard.querySelectorAll('.track-preview-btn').forEach(trackBtn => {
        const tid = Number(trackBtn.getAttribute('data-track-id')) || 0;
        const active = tid && tid === __currentTrackId;
        trackBtn.classList.toggle('is-active', active);
        trackBtn.textContent = active ? (playing ? '暂停' : '继续') : '试听';
      });
    }catch{}
  }
  async function fetchSongPreviewUrl(cfg, songId){
    if(!cfg.apiBase || !songId) return null;
    const tryOnce = async (path, params) => {
      const u = new URL(path, cfg.apiBase);
      u.searchParams.set('id', String(songId));
      if(params && typeof params === 'object'){
        for(const [k, v] of Object.entries(params)){
          if(v !== undefined && v !== null) u.searchParams.set(k, String(v));
        }
      }
      if(cfg.cookie) u.searchParams.set('cookie', cfg.cookie);
      try{
        const d = await fetchJSON(u.toString(), undefined);
        const arr = Array.isArray(d?.data) ? d.data : [];
        const url = arr[0]?.url || null;
        return url || null;
      }catch(e){ return null; }
    };
    const candidates = [
      { path: '/song/url/v1', params: { level: 'standard' } },
      { path: '/song/url',    params: { br: 128000 } },
      { path: '/song/url/v1', params: { level: 'exhigh' } },
      { path: '/song/url',    params: { br: 192000 } },
      { path: '/song/url',    params: { br: 320000 } },
    ];
    for(const c of candidates){
      const url = await tryOnce(c.path, c.params);
      if(url) return url;
    }
    return null;
  }

  // Spotify 预览回退：按曲名与艺人检索，获取 30 秒预览链接
  async function fetchSpotifyPreviewByName(cfg, name, artistsStr){
    try{
      const clientId = (cfg.spotifyClientId||'').trim();
      const clientSecret = (cfg.spotifyClientSecret||'').trim();
      if(!clientId || !clientSecret) return null;
      const token = await fetchSpotifyToken(clientId, clientSecret);
      const q = [String(name||'').trim(), String(artistsStr||'').trim()].filter(Boolean).join(' ');
      const url = new URL(resolveCorsProxyApi('/spotify-api/search'));
      url.searchParams.set('q', q);
      url.searchParams.set('type', 'track');
      url.searchParams.set('limit', '1');
      if(cfg.spotifyMarket) url.searchParams.set('market', cfg.spotifyMarket);
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if(!res.ok){ return null; }
      const data = await res.json();
      const t = data?.tracks?.items?.[0];
      const p = t?.preview_url || null;
      return p || null;
    }catch{ return null; }
  }
  async function ensureTrackId(cfg, albumId, card){
    // 若卡片没有写入首曲目ID，则临时拉取相册详情取第一首
    try{
      const existing = card?.querySelector('.preview-btn')?.getAttribute('data-preview-track');
      if(existing) return Number(existing) || null;
      if(!cfg.apiBase || !albumId) return null;
      const u = new URL('/album', cfg.apiBase);
      u.searchParams.set('id', String(albumId));
      if(cfg.cookie) u.searchParams.set('cookie', cfg.cookie);
      const d = await fetchJSON(u.toString(), undefined);
      const sId = Number(d?.songs?.[0]?.id) || null;
      if(sId && card){
        try{
          const name = String(d?.songs?.[0]?.name || card?.querySelector('.preview-btn')?.getAttribute('data-preview-name') || '');
          const artists = (d?.songs?.[0]?.ar || []).map(a => a?.name).filter(Boolean).join(' / ');
          card.querySelector('.preview-btn')?.setAttribute('data-preview-track', String(sId));
          card.setAttribute('data-track-list', encodeURIComponent(JSON.stringify(normalizeTrackList([{ id: sId, name, artists, link: `https://music.163.com/#/song?id=${sId}` }]))));
        }catch{}
      }
      return sId;
    }catch{ return null; }
  }
  function parseTrackIdsFromCard(card){
    try{
      const fromAttr = parseTrackListAttr(card?.getAttribute('data-track-list'));
      if(fromAttr.length) return fromAttr;
      const anchors = card?.querySelectorAll('details.tracks a') || [];
      const ids = [];
      for(const a of anchors){
        const href = a.getAttribute('href') || '';
        let id = null;
        try{
          const u = new URL(href);
          const qid = u.searchParams.get('id');
          if(qid && /^\d+$/.test(qid)) id = Number(qid);
        }catch{
          const m = href.match(/song\?id=(\d+)/);
          if(m && m[1]) id = Number(m[1]);
        }
        const li = a.closest('li');
        const actionBtn = li?.querySelector('.track-preview-btn');
        if(Number.isFinite(id)) ids.push({
          id,
          name: (a.textContent||'').trim(),
          artists: actionBtn?.getAttribute('data-track-artists') || ''
        });
      }
      // 回退至少包含首曲目
      if(ids.length === 0){
        const tid = Number(card?.querySelector('.preview-btn')?.getAttribute('data-preview-track')) || null;
        if(Number.isFinite(tid)) ids.push({
          id: tid,
          name: card?.querySelector('.preview-btn')?.getAttribute('data-preview-name')||'',
          artists: card?.querySelector('.preview-btn')?.getAttribute('data-preview-artists')||''
        });
      }
      return ids;
    }catch{ return []; }
  }
  async function playTrackByIndex(cfg, card, index, opts){
    opts = opts || {};
    const audio = ensureAudio();
    const albumId = Number(card?.querySelector('.preview-btn')?.getAttribute('data-album-id')) || null;
    let tracks = parseTrackIdsFromCard(card);
    if(tracks.length === 0){
      const tid = await ensureTrackId(cfg, albumId, card);
      if(Number.isFinite(tid)) tracks = [{
        id: tid,
        name: card?.querySelector('.preview-btn')?.getAttribute('data-preview-name')||'',
        artists: card?.querySelector('.preview-btn')?.getAttribute('data-preview-artists')||''
      }];
    }
    if(index < 0 || index >= tracks.length) return;
    const target = tracks[index];
    let url = await fetchSongPreviewUrl(cfg, target.id);
    if(!url){
      url = await fetchSpotifyPreviewByName(cfg, target.name, target.artists || '');
    }
    if(!url){
      if(opts.autoAdvance && index < tracks.length - 1){
        await playTrackByIndex(cfg, card, index + 1, opts);
        return;
      }
      if(!opts.silent) alert('该曲目暂无可用试听链接（含 Spotify 回退）');
      return;
    }
    if(__currentCard && __currentCard !== card){
      resetCardPreviewUI(__currentCard);
    }
    __currentCard = card; __currentTrackId = target.id; __currentTracks = tracks; __currentIndex = index;
    try{ audio.pause(); }catch{}
    audio.src = url;
    audio.currentTime = 0;
    audio.play().catch(()=>{});
  }
  async function playOrPausePreview(cfg, btn){
    const card = btn.closest('article.card');
    const albumId = Number(btn.getAttribute('data-album-id')) || null;
    let trackId = Number(btn.getAttribute('data-preview-track')) || null;
    const audio = ensureAudio();
    // 切换逻辑
    if(__currentCard === card && __currentIndex >= 0){
      if(!audio.paused){ audio.pause(); } else { audio.play().catch(()=>{}); }
      return;
    }
    // 新播放：如无 trackId 则解析一次
    if(!trackId){ trackId = await ensureTrackId(cfg, albumId, card); }
    if(!trackId){ alert('无法获取试听曲目'); return; }
    // 根据卡片曲目列表设置为第 0 首播放
    await playTrackByIndex(cfg, card, 0);
  }
  async function playSpecificTrack(cfg, btn){
    const card = btn.closest('article.card');
    if(!card) return;
    const trackId = Number(btn.getAttribute('data-track-id')) || null;
    const index = Number(btn.getAttribute('data-track-index'));
    const audio = ensureAudio();
    if(trackId && __currentCard === card && __currentTrackId === trackId){
      if(!audio.paused){ audio.pause(); } else { audio.play().catch(()=>{}); }
      return;
    }
    if(Number.isFinite(index) && index >= 0){
      await playTrackByIndex(cfg, card, index);
      return;
    }
    const tracks = parseTrackIdsFromCard(card);
    const found = tracks.findIndex(t => Number(t.id) === trackId);
    if(found >= 0) await playTrackByIndex(cfg, card, found);
  }
  function bindPreviewUI(cfg){
    if(__audioBound) return; __audioBound = true;
    document.addEventListener('click', async (ev) => {
      const t = ev.target;
      if(!t) return;
      const trackPreviewBtn = (t.classList && t.classList.contains('track-preview-btn')) ? t : (t.closest && t.closest('.track-preview-btn'));
      if(trackPreviewBtn){ ev.preventDefault(); try{ await playSpecificTrack(loadSettings(), trackPreviewBtn); }catch{} return; }
      const collectBtn = (t.classList && t.classList.contains('track-collect-btn')) ? t : (t.closest && t.closest('.track-collect-btn'));
      if(collectBtn){ ev.preventDefault(); try{ await openPlaylistPicker(loadSettings(), collectBtn); }catch(e){ alert(`打开歌单列表失败：${e?.message||e}`); } return; }
      const trackCommentBtn = (t.classList && t.classList.contains('track-comment-btn')) ? t : (t.closest && t.closest('.track-comment-btn'));
      if(trackCommentBtn){
        ev.preventDefault();
        try{
          await openCommentDialog(loadSettings(), {
            kind: 'song',
            id: Number(trackCommentBtn.getAttribute('data-resource-id')) || 0,
            name: trackCommentBtn.getAttribute('data-resource-name') || '单曲',
            subtitle: trackCommentBtn.getAttribute('data-resource-subtitle') || ''
          });
        }catch(e){ alert(`打开评论失败：${e?.message||e}`); }
        return;
      }
      const albumCommentBtn = (t.classList && t.classList.contains('album-comment-btn')) ? t : (t.closest && t.closest('.album-comment-btn'));
      if(albumCommentBtn){
        ev.preventDefault();
        try{
          await openCommentDialog(loadSettings(), {
            kind: 'album',
            id: Number(albumCommentBtn.getAttribute('data-resource-id')) || 0,
            name: albumCommentBtn.getAttribute('data-resource-name') || '专辑',
            subtitle: albumCommentBtn.getAttribute('data-resource-subtitle') || ''
          });
        }catch(e){ alert(`打开评论失败：${e?.message||e}`); }
        return;
      }
      const albumCollectBtn = (t.classList && t.classList.contains('album-collect-btn')) ? t : (t.closest && t.closest('.album-collect-btn'));
      if(albumCollectBtn){
        ev.preventDefault();
        try{
          await openAlbumPlaylistPicker(loadSettings(), albumCollectBtn);
        }catch(e){ alert(`打开整专收藏失败：${e?.message||e}`); }
        return;
      }
      const btn = (t.classList && t.classList.contains('preview-btn')) ? t : (t.closest && t.closest('.preview-btn')); 
      if(btn){ ev.preventDefault(); try{ await playOrPausePreview(loadSettings(), btn); }catch{} return; }
      const prevBtn = (t.classList && t.classList.contains('preview-prev')) ? t : (t.closest && t.closest('.preview-prev'));
      if(prevBtn){
        ev.preventDefault();
        try{
          const card = prevBtn.closest('article.card');
          if(!card) return;
          const liveCfg = loadSettings();
          const tracks = parseTrackIdsFromCard(card);
          if(!tracks.length){ await playTrackByIndex(liveCfg, card, 0); return; }
          if(__currentCard !== card){
            await playTrackByIndex(liveCfg, card, Math.max(0, tracks.length - 1));
          }else{
            const prevIdx = (__currentIndex > 0) ? (__currentIndex - 1) : (tracks.length - 1);
            await playTrackByIndex(liveCfg, card, prevIdx);
          }
        }catch{}
        return;
      }
      const nextBtn = (t.classList && t.classList.contains('preview-next')) ? t : (t.closest && t.closest('.preview-next'));
      if(nextBtn){
        ev.preventDefault();
        try{
          const card = nextBtn.closest('article.card');
          if(!card) return;
          const tracks = parseTrackIdsFromCard(card);
          const liveCfg = loadSettings();
          if(!tracks.length){ await playTrackByIndex(liveCfg, card, 0); return; }
          if(__currentCard !== card || __currentIndex < 0){
            await playTrackByIndex(liveCfg, card, 0);
          }else{
            const nextIdx = (__currentIndex + 1) % tracks.length;
            await playTrackByIndex(liveCfg, card, nextIdx);
          }
        }catch{}
        return;
      }
    });
    // 进度条拖动/点击跳转
    let seeking = false;
    let dialogSeeking = false;
    let dialogSeekBarEl = null;
    function seekFromEvent(ev, barEl){
      try{
        if(!__currentCard || !__audioEl) return;
        const card = barEl.closest('article.card');
        if(card !== __currentCard) return; // 仅允许操作当前卡片
        const rect = barEl.getBoundingClientRect();
        const clientX = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX);
        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const dur = __audioEl.duration || 0;
        if(dur > 0){
          __audioEl.currentTime = pct * dur;
        }
      }catch{}
    }
    function beginDialogSeek(ev, barEl){
      dialogSeeking = true;
      dialogSeekBarEl = barEl || null;
      if(dialogSeekBarEl) seekDialogTrackFromEvent(ev, dialogSeekBarEl);
    }
    document.addEventListener('mousedown', (ev) => {
      const target = ev.target;
      const dialogBarEl = (target.classList && target.classList.contains('playlist-track-progress')) ? target : (target.closest && target.closest('.playlist-track-progress'));
      if(dialogBarEl){ beginDialogSeek(ev, dialogBarEl); ev.preventDefault(); return; }
      const barEl = (target.classList && target.classList.contains('preview-bar')) ? target : (target.closest && target.closest('.preview-bar'));
      if(barEl){ seeking = true; seekFromEvent(ev, barEl); ev.preventDefault(); }
    });
    document.addEventListener('mousemove', (ev) => {
      if(dialogSeeking && dialogSeekBarEl){
        seekDialogTrackFromEvent(ev, dialogSeekBarEl);
        return;
      }
      if(!seeking) return; const target = ev.target;
      const barEl = (target.classList && target.classList.contains('preview-bar')) ? target : (target.closest && target.closest('.preview-bar'));
      if(barEl){ seekFromEvent(ev, barEl); }
    });
    document.addEventListener('mouseup', () => {
      seeking = false;
      dialogSeeking = false;
      dialogSeekBarEl = null;
    });
    document.addEventListener('touchstart', (ev) => {
      const target = ev.target;
      const dialogBarEl = (target.classList && target.classList.contains('playlist-track-progress')) ? target : (target.closest && target.closest('.playlist-track-progress'));
      if(dialogBarEl){ beginDialogSeek(ev, dialogBarEl); return; }
      const barEl = (target.classList && target.classList.contains('preview-bar')) ? target : (target.closest && target.closest('.preview-bar'));
      if(barEl){ seeking = true; seekFromEvent(ev, barEl); }
    }, { passive: true });
    document.addEventListener('touchmove', (ev) => {
      if(dialogSeeking && dialogSeekBarEl){
        seekDialogTrackFromEvent(ev, dialogSeekBarEl);
        return;
      }
      if(!seeking) return; const target = ev.target;
      const barEl = (target.classList && target.classList.contains('preview-bar')) ? target : (target.closest && target.closest('.preview-bar'));
      if(barEl){ seekFromEvent(ev, barEl); }
    }, { passive: true });
    document.addEventListener('touchend', () => {
      seeking = false;
      dialogSeeking = false;
      dialogSeekBarEl = null;
    }, { passive: true });
    bindCardDialogs();
  }

  function getApiHeaders(cfg){
    return cfg?.cookie ? { 'x-ncm-cookie': cfg.cookie } : undefined;
  }
  function getApiFetchOpts(cfg, extra){
    extra = extra || {};
    return {
      ...extra,
      credentials: cfg?.cookie ? 'omit' : 'include'
    };
  }
  async function refreshNcmCookie(cfg){
    if(!cfg?.apiBase || !cfg?.cookie) return cfg;
    const headers = getApiHeaders(cfg);
    const url = new URL('/login/refresh', cfg.apiBase);
    const data = await fetchJSON(url.toString(), headers, getApiFetchOpts(cfg, { throttle: false }));
    const nextCookie = normalizeNcmCookie(data?.cookie || data?.data?.cookie || '');
    if(!nextCookie) return cfg;
    return writeSettingsObject({ ...cfg, cookie: nextCookie });
  }
  async function probeNcmAuth(cfg){
    if(!cfg?.apiBase) throw new Error('请先填写 API 基地址');
    const headers = getApiHeaders(cfg);
    const url = new URL('/debug/auth-probe', cfg.apiBase);
    return fetchJSON(url.toString(), headers, getApiFetchOpts(cfg, { throttle: false }));
  }
  async function ensureWritableNcmCookie(cfg){
    if(!cfg?.apiBase || !cfg?.cookie) return cfg;
    try{
      const probe = await probeNcmAuth(cfg);
      if(probe?.cookie?.hasMusicU && !probe?.cookie?.hasCsrf){
        return await refreshNcmCookie(cfg);
      }
    }catch{}
    return cfg;
  }
  function extractAuthProbeUid(probe){
    const p = probe?.probe || {};
    return Number(
      p.loginStatus?.uid ||
      p.userAccount?.uid ||
      0
    ) || 0;
  }
  function isWritableAuthProbe(probe){
    if(!probe || typeof probe !== 'object') return false;
    const p = probe.probe || {};
    return Boolean(
      extractAuthProbeUid(probe) ||
      Number(p.userSubcount?.code || 0) === 200 ||
      Number(p.artistSublist?.code || 0) === 200
    );
  }
  function formatAuthProbeSummary(probe){
    if(!probe || typeof probe !== 'object') return '';
    const cookie = probe.cookie || {};
    const p = probe.probe || {};
    const parts = [];
    parts.push(`Cookie键=${Number(cookie.keyCount||0)}`);
    parts.push(`MUSIC_U=${cookie.hasMusicU ? '有' : '无'}`);
    parts.push(`__csrf=${cookie.hasCsrf ? '有' : '无'}`);
    if(p.loginStatus) parts.push(`login/status=${p.loginStatus.code || p.loginStatus.status || '-'}`);
    if(p.userAccount) parts.push(`user/account=${p.userAccount.code || p.userAccount.status || '-'}`);
    if(p.userSubcount) parts.push(`user/subcount=${p.userSubcount.code || p.userSubcount.status || '-'}`);
    if(p.artistSublist) parts.push(`artist/sublist=${p.artistSublist.code || p.artistSublist.status || '-'}`);
    const uid = extractAuthProbeUid(probe);
    if(uid) parts.push(`uid=${uid}`);
    else if((p.loginStatus || p.userAccount) && !isWritableAuthProbe(probe)) parts.push('uid=无');
    return parts.join('，');
  }
  async function buildAuthFailureMessage(cfg, fallback){
    try{
      const probe = await probeNcmAuth(cfg);
      const summary = formatAuthProbeSummary(probe);
      if(summary){
        const hasCookie = Boolean(probe?.cookie?.hasMusicU && probe?.cookie?.hasCsrf);
        const hasFalsePositive200 = Number(probe?.probe?.loginStatus?.code || 0) === 200
          || Number(probe?.probe?.userAccount?.code || 0) === 200;
        if(hasCookie && hasFalsePositive200 && !isWritableAuthProbe(probe)){
          return `当前保存的 Cookie 已带 MUSIC_U 和 __csrf，但网易云服务端没有返回可用账号 uid，且账号态接口仍返回 301；这说明这份 Cookie 结构完整，但并未被识别成可写登录态。诊断：${summary}`;
        }
        return `${fallback}。诊断：${summary}`;
      }
    }catch{}
    return fallback;
  }
  async function fetchCurrentUserContext(cfg){
    if(!cfg?.apiBase) throw new Error('请先填写 API 基地址');
    cfg = await ensureWritableNcmCookie(cfg);
    const headers = getApiHeaders(cfg);
    try{
      const accountUrl = new URL('/user/account', cfg.apiBase);
      const account = await fetchJSON(accountUrl.toString(), headers, getApiFetchOpts(cfg, { throttle: false }));
      const profile = account?.profile || account?.data?.profile || {};
      const uid = Number(
        profile.userId ||
        account?.account?.id ||
        account?.data?.account?.id ||
        account?.data?.userId ||
        0
      );
      if(uid) return { uid, nickname: profile.nickname || '当前账号' };
    }catch{}
    const statusUrl = new URL('/login/status', cfg.apiBase);
    const status = await fetchJSON(statusUrl.toString(), headers, getApiFetchOpts(cfg, { throttle: false }));
    const profile = status?.data?.profile || status?.profile || {};
    const uid = Number(
      profile.userId ||
      status?.data?.account?.id ||
      status?.account?.id ||
      status?.data?.userId ||
      0
    );
    if(!uid){
      const msg = status?.msg || status?.message || '请先登录网易云账号，再使用歌单收藏或评论功能';
      throw new Error(await buildAuthFailureMessage(cfg, msg));
    }
    return { uid, nickname: profile.nickname || '当前账号' };
  }
  async function fetchUserPlaylists(cfg, force){
    const user = await fetchCurrentUserContext(cfg);
    if(!force && __playlistCache.uid === user.uid && Array.isArray(__playlistCache.items) && __playlistCache.items.length){
      return { user, playlists: __playlistCache.items };
    }
    const headers = getApiHeaders(cfg);
    const url = new URL('/user/playlist', cfg.apiBase);
    url.searchParams.set('uid', String(user.uid));
    url.searchParams.set('limit', '1000');
    const data = await fetchJSON(url.toString(), headers, getApiFetchOpts(cfg, { throttle: false }));
    const playlists = (Array.isArray(data?.playlist) ? data.playlist : []).map(pl => {
      const creatorId = Number(pl?.creator?.userId || 0);
      return {
        id: Number(pl?.id) || 0,
        name: String(pl?.name || '未命名歌单'),
        trackCount: Number(pl?.trackCount) || 0,
        creatorName: String(pl?.creator?.nickname || ''),
        creatorId,
        isOwned: creatorId === user.uid,
        isSubscribed: Boolean(pl?.subscribed) || creatorId !== user.uid,
        specialType: Number(pl?.specialType) || 0
      };
    }).filter(pl => pl.id > 0);
    __playlistCache = { uid: user.uid, items: playlists, ts: Date.now() };
    return { user, playlists };
  }
  function getPinnedPlaylistIds(){
    return Array.from(new Set(
      (Array.isArray(loadSettings().pinnedPlaylistIds) ? loadSettings().pinnedPlaylistIds : [])
        .map(Number)
        .filter(id => Number.isFinite(id) && id > 0)
    ));
  }
  function getPlaylistSelectionSet(){
    if(!(__playlistSelection.selectedIds instanceof Set)){
      __playlistSelection.selectedIds = new Set(
        Array.isArray(__playlistSelection.selectedIds) ? __playlistSelection.selectedIds : []
      );
    }
    return __playlistSelection.selectedIds;
  }
  function getTrackSelectionSet(){
    if(!(__playlistSelection.selectedTrackIds instanceof Set)){
      __playlistSelection.selectedTrackIds = new Set(
        Array.isArray(__playlistSelection.selectedTrackIds) ? __playlistSelection.selectedTrackIds : []
      );
    }
    return __playlistSelection.selectedTrackIds;
  }
  function updatePlaylistPickerTrackControls(){
    const allTracks = Array.isArray(__playlistSelection.tracks) ? __playlistSelection.tracks : [];
    const selectedTrackCount = getTrackSelectionSet().size;
    if(els.playlistPickerTrackSelectedCount){
      els.playlistPickerTrackSelectedCount.textContent = `已选曲目 ${selectedTrackCount} 首${allTracks.length ? ` · 共 ${allTracks.length} 首` : ''}`;
    }
    if(els.playlistPickerTrackSelectAll) els.playlistPickerTrackSelectAll.disabled = allTracks.length === 0;
    if(els.playlistPickerTrackClear) els.playlistPickerTrackClear.disabled = selectedTrackCount === 0;
  }
  function updatePlaylistPickerControls(){
    const selectedCount = getPlaylistSelectionSet().size;
    const visibleCount = Array.isArray(__playlistSelection.filteredIds) ? __playlistSelection.filteredIds.length : 0;
    if(els.playlistPickerSelectedCount){
      els.playlistPickerSelectedCount.textContent = `已选歌单 ${selectedCount} 个${visibleCount ? ` · 当前结果 ${visibleCount} 个` : ''}`;
    }
    if(els.playlistPickerSubmit){
      const selectedTrackCount = __playlistSelection.mode === 'album' ? getTrackSelectionSet().size : (__playlistSelection.track?.id ? 1 : 0);
      els.playlistPickerSubmit.textContent = selectedCount > 0
        ? `收藏 ${selectedTrackCount || 0} 首到所选歌单 (${selectedCount})`
        : '添加到所选歌单';
    }
  }
  function savePinnedPlaylistIds(ids){
    const normalized = Array.from(new Set((Array.isArray(ids) ? ids : []).map(Number).filter(id => Number.isFinite(id) && id > 0)));
    return writeSettingsObject({ pinnedPlaylistIds: normalized });
  }
  function togglePinnedPlaylist(id){
    const pid = Number(id) || 0;
    if(!pid) return;
    const next = getPinnedPlaylistIds();
    const idx = next.indexOf(pid);
    if(idx >= 0) next.splice(idx, 1);
    else next.unshift(pid);
    savePinnedPlaylistIds(next);
    renderPlaylistPickerList(els.playlistPickerSearch?.value || '');
  }
  function reorderPinnedPlaylist(sourceId, targetId){
    const from = Number(sourceId) || 0;
    const to = Number(targetId) || 0;
    if(!from || !to || from === to) return;
    const next = getPinnedPlaylistIds();
    const fromIdx = next.indexOf(from);
    const toIdx = next.indexOf(to);
    if(fromIdx < 0 || toIdx < 0) return;
    next.splice(fromIdx, 1);
    const insertIdx = next.indexOf(to);
    next.splice(insertIdx < 0 ? next.length : insertIdx, 0, from);
    savePinnedPlaylistIds(next);
    renderPlaylistPickerList(els.playlistPickerSearch?.value || '');
  }
  function isPlaylistMutationSuccess(data){
    const code = Number(data?.code || 0);
    const msg = String(data?.message || data?.msg || '');
    if(code === 200) return true;
    if(/成功|已添加|已收藏|已存在|重复|already|exists|added|collected/i.test(msg)) return true;
    if(code === 502 && !/失败|错误|error|invalid|forbidden|unauthorized/i.test(msg)) return true;
    return false;
  }
  async function playDialogTrackByIndex(cfg, index){
    const tracks = Array.isArray(__playlistSelection.tracks) ? __playlistSelection.tracks : [];
    if(index < 0 || index >= tracks.length) return;
    const target = tracks[index];
    if(!target?.id) return;
    const audio = ensureDialogAudio();
    let url = await fetchSongPreviewUrl(cfg, target.id);
    if(!url){
      url = await fetchSpotifyPreviewByName(cfg, target.name, target.artists || '');
    }
    if(!url){
      alert('该曲目暂无可用试听链接（含 Spotify 回退）');
      return;
    }
    __dialogCurrentTracks = tracks;
    __dialogCurrentIndex = index;
    __dialogCurrentTrackId = target.id;
    try{ audio.pause(); }catch{}
    audio.src = url;
    audio.currentTime = 0;
    updateDialogPreviewUI();
    audio.play().catch(()=>{});
  }
  async function toggleDialogTrackPreview(cfg, btn){
    const index = Number(btn?.getAttribute('data-playlist-track-preview'));
    const trackId = Number(btn?.closest('.playlist-track-item')?.getAttribute('data-track-id')) || 0;
    const audio = ensureDialogAudio();
    if(trackId && trackId === __dialogCurrentTrackId){
      if(!audio.paused) audio.pause();
      else audio.play().catch(()=>{});
      return;
    }
    if(Number.isFinite(index) && index >= 0){
      await playDialogTrackByIndex(cfg, index);
    }
  }
  function seekDialogTrackFromEvent(ev, barEl){
    try{
      const row = barEl?.closest('.playlist-track-item');
      const rowId = Number(row?.getAttribute('data-track-id')) || 0;
      const audio = __dialogAudioEl;
      if(!rowId || rowId !== __dialogCurrentTrackId || !audio) return;
      const rect = barEl.getBoundingClientRect();
      const clientX = (ev.touches && ev.touches[0] ? ev.touches[0].clientX : ev.clientX);
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1)));
      const dur = audio.duration || 0;
      if(dur > 0){
        audio.currentTime = pct * dur;
        updateDialogPreviewUI();
      }
    }catch{}
  }
  function renderPlaylistPickerTracks(){
    if(!els.playlistPickerTrackSection || !els.playlistPickerTrackList) return;
    const tracks = Array.isArray(__playlistSelection.tracks) ? __playlistSelection.tracks : [];
    const selectedTrackIds = getTrackSelectionSet();
    const shouldShow = __playlistSelection.mode === 'album';
    els.playlistPickerTrackSection.hidden = !shouldShow;
    if(!shouldShow) return;
    if(!tracks.length){
      els.playlistPickerTrackList.innerHTML = '<div class="empty">当前专辑没有可收藏的曲目。</div>';
      updatePlaylistPickerTrackControls();
      return;
    }
    els.playlistPickerTrackList.innerHTML = tracks.map((track, index) => `
      <div class="playlist-track-item" data-track-id="${escapeAttr(String(track.id))}">
        <div class="playlist-track-top">
          <label class="playlist-track-check">
            <input type="checkbox" value="${escapeAttr(String(track.id))}" ${selectedTrackIds.has(track.id) ? 'checked' : ''} />
            <span>
              <span class="playlist-track-name">${escapeHtml(track.name || `曲目 ${index + 1}`)}</span>
              <span class="playlist-track-desc">${track.artists ? `${escapeHtml(track.artists)} · ` : ''}第 ${index + 1} 首</span>
            </span>
          </label>
          <button type="button" class="btn playlist-track-preview-btn" data-playlist-track-preview="${escapeAttr(String(index))}">试听</button>
        </div>
        <div class="playlist-track-audio">
          <div class="playlist-track-progress" data-playlist-track-progress="${escapeAttr(String(track.id))}">
            <div class="playlist-track-progress-fill" style="width:0%"></div>
          </div>
          <span class="playlist-track-progress-time">00:00 / 00:00</span>
        </div>
      </div>
    `).join('');
    updatePlaylistPickerTrackControls();
    updateDialogPreviewUI();
  }
  function renderPlaylistPickerList(keyword){
    const query = String(keyword || '').trim().toLowerCase();
    const listEl = els.playlistPickerList;
    if(!listEl) return;
    const all = Array.isArray(__playlistSelection.items) ? __playlistSelection.items : [];
    const selectedIds = getPlaylistSelectionSet();
    const pinnedIds = getPinnedPlaylistIds();
    const pinnedSet = new Set(pinnedIds);
    const filtered = query ? all.filter(pl => pl.name.toLowerCase().includes(query)) : all;
    __playlistSelection.filteredIds = filtered.map(pl => pl.id);
    if(!filtered.length){
      listEl.innerHTML = `<div class="empty">没有匹配的歌单。</div>`;
      updatePlaylistPickerControls();
      return;
    }
    const pinnedOrder = new Map(pinnedIds.map((id, index) => [id, index]));
    const sortPinned = (a, b) => (pinnedOrder.get(a.id) ?? 999999) - (pinnedOrder.get(b.id) ?? 999999);
    const groups = [
      { title: '置顶歌单', items: filtered.filter(pl => pinnedSet.has(pl.id)).sort(sortPinned), pinned: true },
      { title: '我的歌单', items: filtered.filter(pl => pl.isOwned && !pinnedSet.has(pl.id)) },
      { title: '共享 / 订阅歌单', items: filtered.filter(pl => !pl.isOwned && !pinnedSet.has(pl.id)) }
    ].filter(group => group.items.length);
    listEl.innerHTML = groups.map(group => `
      <section class="playlist-picker-group">
        <h3>${escapeHtml(group.title)}</h3>
        ${group.items.map(pl => `
          <div class="playlist-picker-item${pinnedSet.has(pl.id) ? ' is-pinned' : ''}" ${group.pinned ? `draggable="true" data-playlist-drag-item="${escapeAttr(String(pl.id))}"` : ''}>
            <label class="playlist-picker-check">
              <input type="checkbox" value="${escapeAttr(String(pl.id))}" ${selectedIds.has(pl.id) ? 'checked' : ''} />
              <span>
                <span class="playlist-picker-name">${escapeHtml(pl.name)}</span>
                <span class="playlist-picker-desc">${pl.specialType === 5 ? '我喜欢的音乐' : (pl.isOwned ? '我创建的歌单' : `创建者：${escapeHtml(pl.creatorName || '其他用户')}`)} · 共 ${pl.trackCount} 首${group.pinned ? ' · 可拖动排序' : ''}</span>
              </span>
            </label>
            <button type="button" class="btn playlist-pin-btn${pinnedSet.has(pl.id) ? ' active' : ''}" data-playlist-pin="${escapeAttr(String(pl.id))}">${pinnedSet.has(pl.id) ? '已置顶' : '置顶'}</button>
          </div>
        `).join('')}
      </section>
    `).join('');
    updatePlaylistPickerControls();
  }
  async function openPlaylistPicker(cfg, btn){
    resetDialogPreviewUI();
    const trackId = Number(btn?.getAttribute('data-track-id')) || 0;
    if(!trackId) throw new Error('缺少歌曲 ID');
    const track = {
      id: trackId,
      name: btn.getAttribute('data-track-name') || '未命名歌曲',
      artists: btn.getAttribute('data-track-artists') || ''
    };
    if(els.playlistPickerTitle) els.playlistPickerTitle.textContent = `收藏到歌单 · ${track.name}`;
    if(els.playlistPickerMeta) els.playlistPickerMeta.textContent = track.artists ? `${track.artists} · 直接选择一个或多个歌单进行收藏` : '直接选择一个或多个歌单进行收藏';
    if(els.playlistPickerStatus) els.playlistPickerStatus.textContent = '正在加载歌单…';
    if(els.playlistPickerSearch) els.playlistPickerSearch.value = '';
    if(els.playlistPickerList) els.playlistPickerList.innerHTML = '<div class="empty">正在加载歌单…</div>';
    if(els.playlistPickerTrackList) els.playlistPickerTrackList.innerHTML = '<div class="empty">当前为单曲收藏。</div>';
    const { user, playlists } = await fetchUserPlaylists(cfg, false);
    __playlistSelection = {
      mode: 'single',
      track,
      tracks: [track],
      sourceCard: btn.closest('article.card'),
      user,
      items: playlists,
      selectedIds: new Set(),
      filteredIds: playlists.map(pl => pl.id),
      selectedTrackIds: new Set([track.id])
    };
    renderPlaylistPickerTracks();
    renderPlaylistPickerList('');
    if(els.playlistPickerStatus) els.playlistPickerStatus.textContent = `当前账号：${user.nickname}；已加载 ${playlists.length} 个歌单`;
    els.playlistPickerDialog?.showModal();
  }
  async function openAlbumPlaylistPicker(cfg, btn){
    resetDialogPreviewUI();
    const card = btn?.closest('article.card');
    if(!card) throw new Error('缺少专辑卡片上下文');
    const tracks = normalizeTrackList(parseTrackIdsFromCard(card));
    if(!tracks.length) throw new Error('当前专辑没有可收藏的曲目');
    const albumName = btn.getAttribute('data-album-name') || '当前专辑';
    const artistName = btn.getAttribute('data-album-artist') || '';
    if(els.playlistPickerTitle) els.playlistPickerTitle.textContent = `收藏整专曲目 · ${albumName}`;
    if(els.playlistPickerMeta) els.playlistPickerMeta.textContent = artistName ? `${artistName} · 先勾选曲目，再勾选一个或多个歌单收藏` : '先勾选曲目，再勾选一个或多个歌单收藏';
    if(els.playlistPickerStatus) els.playlistPickerStatus.textContent = '正在加载歌单…';
    if(els.playlistPickerSearch) els.playlistPickerSearch.value = '';
    if(els.playlistPickerList) els.playlistPickerList.innerHTML = '<div class="empty">正在加载歌单…</div>';
    const { user, playlists } = await fetchUserPlaylists(cfg, false);
    __playlistSelection = {
      mode: 'album',
      track: null,
      tracks,
      sourceCard: card,
      user,
      items: playlists,
      selectedIds: new Set(),
      filteredIds: playlists.map(pl => pl.id),
      selectedTrackIds: new Set()
    };
    renderPlaylistPickerTracks();
    renderPlaylistPickerList('');
    if(els.playlistPickerStatus) els.playlistPickerStatus.textContent = `当前账号：${user.nickname}；专辑曲目 ${tracks.length} 首；已加载 ${playlists.length} 个歌单`;
    els.playlistPickerDialog?.showModal();
  }
  async function submitPlaylistSelection(){
    const cfg = await ensureWritableNcmCookie(loadSettings());
    const trackIds = (__playlistSelection.mode === 'album'
      ? Array.from(getTrackSelectionSet()).map(Number)
      : [Number(__playlistSelection.track?.id || 0)]
    ).filter(id => Number.isFinite(id) && id > 0);
    if(!trackIds.length){
      throw new Error(__playlistSelection.mode === 'album' ? '请至少勾选一首曲目' : '没有待收藏的歌曲');
    }
    const playlistMap = new Map((Array.isArray(__playlistSelection.items) ? __playlistSelection.items : []).map(pl => [pl.id, pl]));
    const checked = Array.from(getPlaylistSelectionSet()).map(Number).filter(id => Number.isFinite(id) && id > 0);
    if(!checked.length) throw new Error('请至少选择一个歌单');
    if(els.playlistPickerSubmit) els.playlistPickerSubmit.disabled = true;
    if(els.playlistPickerStatus) els.playlistPickerStatus.textContent = '正在添加到所选歌单…';
    const headers = getApiHeaders(cfg);
    const results = [];
    for(const pid of checked){
      const url = new URL('/playlist/tracks', cfg.apiBase);
      try{
        const data = await postJSON(
          url.toString(),
          { op: 'add', pid, tracks: trackIds.join(',') },
          headers,
          getApiFetchOpts(cfg, { acceptCodes: [502] })
        );
        const msg = data?.message || data?.msg || '已添加';
        results.push({
          ok: isPlaylistMutationSuccess(data),
          pid,
          name: playlistMap.get(pid)?.name || `歌单 ${pid}`,
          msg: String(msg)
        });
      }catch(e){
        const msg = String(e?.message || e);
        results.push({
          ok: isPlaylistMutationSuccess({ msg }),
          pid,
          name: playlistMap.get(pid)?.name || `歌单 ${pid}`,
          msg
        });
      }
    }
    if(els.playlistPickerSubmit) els.playlistPickerSubmit.disabled = false;
    const successCount = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    if(els.playlistPickerStatus){
      els.playlistPickerStatus.textContent = failed.length
        ? `已成功把 ${trackIds.length} 首曲目写入 ${successCount} 个歌单，失败 ${failed.length} 个：${failed.slice(0, 2).map(x => `${x.name}（${x.msg}）`).join('；')}`
        : `已成功把 ${trackIds.length} 首曲目添加到 ${successCount} 个歌单`;
    }
  }
  function commentTypeToCode(kind){
    return kind === 'album' ? 3 : 0;
  }
  function extractCommentsFromResponse(data){
    if(Array.isArray(data?.data?.comments)) return data.data.comments;
    if(Array.isArray(data?.comments)) return data.comments;
    return [];
  }
  function renderCommentList(items){
    if(!els.commentList) return;
    if(!items.length){
      els.commentList.innerHTML = '<div class="empty">暂时没有评论。</div>';
      return;
    }
    els.commentList.innerHTML = items.map(item => `
      <div class="comment-item">
        <div class="comment-author">${escapeHtml(item?.user?.nickname || '匿名用户')}</div>
        <div class="comment-meta">${escapeHtml(formatDate(item?.time || Date.now()))}</div>
        <div class="comment-content">${escapeHtml(String(item?.content || ''))}</div>
      </div>
    `).join('');
  }
  async function loadComments(cfg, resource){
    const headers = getApiHeaders(cfg);
    const url = new URL('/comment/new', cfg.apiBase);
    url.searchParams.set('id', String(resource.id));
    url.searchParams.set('type', String(commentTypeToCode(resource.kind)));
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('pageSize', '20');
    url.searchParams.set('sortType', '3');
    const data = await fetchJSON(url.toString(), headers, getApiFetchOpts(cfg, { throttle: false }));
    return extractCommentsFromResponse(data);
  }
  async function openCommentDialog(cfg, resource){
    if(!resource?.id) throw new Error('缺少评论资源 ID');
    __commentSelection = resource;
    if(els.commentDialogTitle) els.commentDialogTitle.textContent = `${resource.kind === 'album' ? '专辑评论' : '单曲评论'} · ${resource.name}`;
    if(els.commentDialogMeta) els.commentDialogMeta.textContent = resource.subtitle || '可查看最新评论并直接发表评论。';
    if(els.commentDialogStatus) els.commentDialogStatus.textContent = '正在加载评论…';
    if(els.commentList) els.commentList.innerHTML = '<div class="empty">正在加载评论…</div>';
    if(els.commentInput) els.commentInput.value = '';
    const comments = await loadComments(cfg, resource);
    renderCommentList(comments);
    if(els.commentDialogStatus) els.commentDialogStatus.textContent = `已加载 ${comments.length} 条最新评论`;
    els.commentDialog?.showModal();
  }
  async function refreshCurrentComments(){
    if(!__commentSelection) throw new Error('当前没有选中的评论资源');
    if(els.commentDialogStatus) els.commentDialogStatus.textContent = '正在刷新评论…';
    const comments = await loadComments(loadSettings(), __commentSelection);
    renderCommentList(comments);
    if(els.commentDialogStatus) els.commentDialogStatus.textContent = `已加载 ${comments.length} 条最新评论`;
  }
  async function submitCurrentComment(){
    if(!__commentSelection) throw new Error('当前没有选中的评论资源');
    const content = String(els.commentInput?.value || '').trim();
    if(!content) throw new Error('请输入评论内容');
    const cfg = await ensureWritableNcmCookie(loadSettings());
    const headers = getApiHeaders(cfg);
    const url = new URL('/comment', cfg.apiBase);
    if(els.commentSubmitBtn) els.commentSubmitBtn.disabled = true;
    if(els.commentDialogStatus) els.commentDialogStatus.textContent = '正在发送评论…';
    await postJSON(url.toString(), {
      id: String(__commentSelection.id),
      type: String(commentTypeToCode(__commentSelection.kind)),
      t: '1',
      content
    }, headers, getApiFetchOpts(cfg));
    if(els.commentInput) els.commentInput.value = '';
    if(els.commentSubmitBtn) els.commentSubmitBtn.disabled = false;
    if(els.commentDialogStatus) els.commentDialogStatus.textContent = '评论已发送，正在刷新…';
    await refreshCurrentComments();
  }
  function bindCardDialogs(){
    if(!__playlistDialogBound){
      __playlistDialogBound = true;
      els.playlistPickerSearch?.addEventListener('input', () => {
        renderPlaylistPickerList(els.playlistPickerSearch?.value || '');
      });
      els.playlistPickerTrackSelectAll?.addEventListener('click', () => {
        const selectedTracks = getTrackSelectionSet();
        (Array.isArray(__playlistSelection.tracks) ? __playlistSelection.tracks : []).forEach(track => {
          if(Number.isFinite(track.id) && track.id > 0) selectedTracks.add(track.id);
        });
        renderPlaylistPickerTracks();
        updatePlaylistPickerControls();
      });
      els.playlistPickerTrackClear?.addEventListener('click', () => {
        getTrackSelectionSet().clear();
        renderPlaylistPickerTracks();
        updatePlaylistPickerControls();
      });
      els.playlistPickerTrackList?.addEventListener('change', (ev) => {
        const target = ev.target;
        if(!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
        const tid = Number(target.value) || 0;
        if(!tid) return;
        const selectedTracks = getTrackSelectionSet();
        if(target.checked) selectedTracks.add(tid);
        else selectedTracks.delete(tid);
        updatePlaylistPickerTrackControls();
        updatePlaylistPickerControls();
      });
      els.playlistPickerTrackList?.addEventListener('click', async (ev) => {
        const target = ev.target;
        const previewBtn = target?.closest?.('[data-playlist-track-preview]');
        if(!previewBtn) return;
        ev.preventDefault();
        try{
          await toggleDialogTrackPreview(loadSettings(), previewBtn);
        }catch{}
      });
      els.playlistPickerList?.addEventListener('change', (ev) => {
        const target = ev.target;
        if(!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
        const pid = Number(target.value) || 0;
        if(!pid) return;
        const selected = getPlaylistSelectionSet();
        if(target.checked) selected.add(pid);
        else selected.delete(pid);
        updatePlaylistPickerControls();
      });
      els.playlistPickerList?.addEventListener('click', (ev) => {
        const target = ev.target;
        const pinBtn = target?.closest?.('[data-playlist-pin]');
        if(!pinBtn) return;
        ev.preventDefault();
        ev.stopPropagation();
        togglePinnedPlaylist(pinBtn.getAttribute('data-playlist-pin'));
      });
      els.playlistPickerList?.addEventListener('dragstart', (ev) => {
        const target = ev.target?.closest?.('[data-playlist-drag-item]');
        if(!target) return;
        __draggingPinnedPlaylistId = Number(target.getAttribute('data-playlist-drag-item')) || 0;
        target.classList.add('is-dragging');
        try{
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', String(__draggingPinnedPlaylistId));
        }catch{}
      });
      els.playlistPickerList?.addEventListener('dragend', () => {
        __draggingPinnedPlaylistId = 0;
        els.playlistPickerList?.querySelectorAll('.playlist-picker-item').forEach(el => el.classList.remove('is-dragging', 'drag-over'));
      });
      els.playlistPickerList?.addEventListener('dragover', (ev) => {
        const target = ev.target?.closest?.('[data-playlist-drag-item]');
        if(!target || !__draggingPinnedPlaylistId) return;
        ev.preventDefault();
        els.playlistPickerList?.querySelectorAll('.playlist-picker-item.drag-over').forEach(el => {
          if(el !== target) el.classList.remove('drag-over');
        });
        if(Number(target.getAttribute('data-playlist-drag-item')) !== __draggingPinnedPlaylistId){
          target.classList.add('drag-over');
        }
      });
      els.playlistPickerList?.addEventListener('drop', (ev) => {
        const target = ev.target?.closest?.('[data-playlist-drag-item]');
        if(!target || !__draggingPinnedPlaylistId) return;
        ev.preventDefault();
        const targetId = Number(target.getAttribute('data-playlist-drag-item')) || 0;
        els.playlistPickerList?.querySelectorAll('.playlist-picker-item.drag-over').forEach(el => el.classList.remove('drag-over'));
        reorderPinnedPlaylist(__draggingPinnedPlaylistId, targetId);
      });
      els.playlistPickerSubmit?.addEventListener('click', async () => {
        try{
          await submitPlaylistSelection();
        }catch(e){
          if(els.playlistPickerStatus) els.playlistPickerStatus.textContent = `添加失败：${e?.message||e}`;
        }
      });
      els.playlistPickerDialog?.addEventListener('close', () => {
        resetDialogPreviewUI();
      });
      els.playlistPickerDialog?.addEventListener('cancel', () => {
        resetDialogPreviewUI();
      });
    }
    if(!__commentDialogBound){
      __commentDialogBound = true;
      els.commentRefreshBtn?.addEventListener('click', async () => {
        try{
          await refreshCurrentComments();
        }catch(e){
          if(els.commentDialogStatus) els.commentDialogStatus.textContent = `刷新失败：${e?.message||e}`;
        }
      });
      els.commentSubmitBtn?.addEventListener('click', async () => {
        try{
          await submitCurrentComment();
        }catch(e){
          if(els.commentSubmitBtn) els.commentSubmitBtn.disabled = false;
          if(els.commentDialogStatus){
            const cfg = loadSettings();
            els.commentDialogStatus.textContent = `发送失败：${await buildAuthFailureMessage(cfg, String(e?.message||e))}`;
          }
        }
      });
    }
  }

  // 厂牌汇总渲染
  function renderLabelsFeed(items){
    if(!els.labelsFeed) return;
    if(!items || !items.length){
      els.labelsFeed.innerHTML = `<div class="empty">${escapeHtml(getEnhancedEmptyMessage(ENHANCED_TAB_LABELS, 'idle'))}</div>`;
      return;
    }
    const groups = new Map();
    for(const it of items){
      const key = it.label || '未知厂牌';
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(it);
    }
    const html = Array.from(groups.entries()).sort((a,b)=>b[1].length - a[1].length).map(([label, arr]) => `
      <section class="card">
        <div class="meta">
          <div class="title">${escapeHtml(label)}（${arr.length}）</div>
          <ul class="label-list">
            ${arr.map(x=>`
              <li>
                <a href="${escapeAttr(x.link)}" target="_blank" rel="noopener">${escapeHtml(x.name)}</a>
                <span class="by"> · ${escapeHtml(getCardDisplayArtist(x))} · ${escapeHtml(x.type)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      </section>
    `).join('');
    els.labelsFeed.innerHTML = html;
  }

  function formatDate(ts){
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function dayKey(d){
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  }
  function escapeAttr(s){ return escapeHtml(s); }
  function clampInt(val, min, max, def){
    const n = parseInt(val, 10);
    if(!Number.isFinite(n)) return def;
    return Math.min(max, Math.max(min, n));
  }
  function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

  // 艺人检查缓存：用于跳过近期无新作的艺人，提升大规模账号性能
  function loadArtistCheckCache(){
    try{
      const raw = localStorage.getItem(ARTIST_CHECK_CACHE_KEY);
      if(!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    }catch{ return {}; }
  }
  function saveArtistCheckCache(cache){
    try{ localStorage.setItem(ARTIST_CHECK_CACHE_KEY, JSON.stringify(cache || {})); }catch{}
  }
  function shouldFetchArtist(cache, artistId, startTs, allowSkip=true){
    // [Restored] 恢复智能跳过逻辑，大幅提升扫描速度
    
    // 如果用户强制全扫（比如通过某种设置），可以在这里处理。目前默认启用缓存优化。
    if(!allowSkip) return true;
    
    const key = String(artistId);
    const c = cache[key];
    if(!c) return true;
    const lastPublish = Number(c.lastPublishTime) || 0;
    const lastCheck = Number(c.lastCheckTs) || 0;
    
    // 缓存有效期：18小时
    const freshnessMs = 18 * 60 * 60 * 1000;
    
    // 如果该艺人上次发布时间早于本次搜索范围起始时间（意味着范围内无新作），且检查记录新鲜，则跳过
    if(startTs > 0 && lastCheck > 0 && lastCheck < startTs){
      return true;
    }
    if(lastPublish < startTs && (Date.now() - lastCheck) < freshnessMs){
      return false; 
    }
    return true;
  }
  function updateArtistCheckCache(cache, artistId, items){
    const key = String(artistId);
    
    // [Fix] 只有当结果明确（非 Error）时才更新缓存
    // 避免因网络波动导致该艺人被错误标记为“已检查且无新专”，从而在接下来的 18 小时内被跳过
    if(!items || items.error) return;

    let lastPublish = 0;
    if(items && typeof items.latestPublishTime === 'number'){
      lastPublish = items.latestPublishTime;
    } else if(Array.isArray(items) && items.length){
      lastPublish = Math.max(...items.map(a => Number(a.publishTime) || 0));
    }
    
    // [Fix] 防止因 API 偶发返回空列表导致 lastPublish 被错误置 0，从而导致后续长期跳过该艺人
    // 如果本次获取为 0，但缓存里有较新的值（例如 2000 年以后），则保留缓存值
    const old = cache[key];
    if(lastPublish === 0 && old && old.lastPublishTime > 946684800000){
       lastPublish = old.lastPublishTime;
    }

    cache[key] = { lastPublishTime: lastPublish, lastCheckTs: Date.now() };
  }

  // 辅助：获取北京时间日期整数 (YYYYMMDD)
  function getBeijingDateInt(ts){
    const d = new Date(ts + 480 * 60000); // UTC+8
    return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  }

  // 简易并发控制
  function pLimit(max){
    const queue = [];
    let active = 0;
    const next = () => {
      if(active >= max || queue.length === 0) return;
      active++;
      const { fn, resolve, reject } = queue.shift();
      Promise.resolve().then(fn).then(v=>{ active--; resolve(v); next(); }).catch(e=>{ active--; reject(e); next(); });
    };
    return (fn) => new Promise((resolve,reject)=>{ queue.push({fn,resolve,reject}); next(); });
  }
})();
