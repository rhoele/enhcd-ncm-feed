const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { NcmReadClient } = require('./lib/ncm-read-client');
const { createCollector, writeSnapshot } = require('./lib/mobile-snapshot');

const album = { code: 200, album: { publishTime: Date.now(), company: 'Test', artists: [{ name: 'Artist' }] } };
test('parallel album consumers and later enrichment share one request', async () => {
  let count = 0;
  const client = new NcmReadClient({ base: 'https://api.example.org', fetchImpl: async () => {
    count++;
    return new Response(JSON.stringify(album));
  } });
  const results = await Promise.all(Array.from({ length: 16 }, () => client.album(1)));
  assert.equal(count, 1);
  assert.equal(results.length, 16);
  await client.album(1);
  assert.equal(count, 1);
  assert.equal(client.stats.coalesced, 15);
});
test('cookie is body-only and bare MUSIC_U values are normalized', async () => {
  const client = new NcmReadClient({ base: 'https://api.example.org', cookie: 'test-only-value',
    fetchImpl: async (url, options) => {
      assert.equal(url.search, '');
      assert.equal(options.method, 'POST');
      assert.equal(new URLSearchParams(options.body).get('cookie'), 'MUSIC_U=test-only-value');
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify(album));
    } });
  await client.album(1);
});
test('rate limit retries respect Retry-After and failures are not cached', async () => {
  let count = 0;
  const waits = [];
  const client = new NcmReadClient({ base: 'https://api.example.org', sleep: async ms => waits.push(ms),
    fetchImpl: async () => ++count === 1
      ? new Response('{"code":429}', { status: 429, headers: { 'Retry-After': '2' } })
      : new Response(JSON.stringify(album))
  });
  await client.album(1);
  assert.equal(count, 2);
  assert.equal(waits[0], 2000);
  const rejected = new NcmReadClient({ base: 'https://api.example.org', fetchImpl: async () => new Response('{"code":401}', { status: 401 }) });
  await assert.rejects(rejected.album(1));
  await assert.rejects(rejected.album(1));
  assert.equal(rejected.stats.requests, 2);
});
test('snapshot contract keeps notification identity stable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'naf-contract-'));
  try {
    const collector = createCollector(7);
    collector.add({ id: 42, name: 'Test', publishTime: Date.now(), artists: ['A'] }, 1, '');
    const result = writeSnapshot({ dstMobileDir: root, collector, days: 7 });
    const json = JSON.parse(fs.readFileSync(path.join(root, result.indexDates[0].date + '.json')));
    assert.equal(json.schema_version, 1);
    assert.equal(json.timezone, 'Asia/Shanghai');
    assert.equal(json.items[0].releaseKey, 'netease:album:42:' + json.items[0].publishTime);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
function memoryStorage() {
  const data = {};
  return new Proxy(data, { get(target, key) {
    if (key === 'getItem') return k => target[k] ?? null;
    if (key === 'setItem') return (k, v) => { target[k] = String(v); };
    if (key === 'removeItem') return k => { delete target[k]; };
    if (key === 'key') return i => Object.keys(target)[i] || null;
    if (key === 'length') return Object.keys(target).length;
    return target[key];
  } });
}
test('public session removes legacy private defaults and blocks unknown destinations', async () => {
  const local = memoryStorage();
  local.setItem('netease-feed-settings-v1', '{"cookie":"test-legacy"}');
  local.setItem('unrelated-app', 'keep');
  const sent = [];
  const context = {
    URL, URLSearchParams, Headers, Request,
    location: { href: 'https://example.github.io/feed/', hostname: 'example.github.io', origin: 'https://example.github.io' },
    localStorage: local, sessionStorage: memoryStorage(),
    document: { currentScript: { dataset: { public: 'true' } }, documentElement: { classList: { add() {}, toggle() {} } }, addEventListener() {} },
    window: { fetch: async (url, options) => { sent.push({ url, options }); return new Response('{}'); } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public-session.js'), 'utf8'), context);
  assert.equal(local.getItem('netease-feed-settings-v1'), null);
  assert.equal(local.getItem('unrelated-app'), 'keep');
  await assert.rejects(context.window.fetch('https://unknown.example/api'));
  await context.window.fetch('data/mobile/index.json');
  context.window.NAF_STORAGE.setItem('netease-feed-settings-v1', JSON.stringify({
    personalMode: true, apiBase: 'https://own.example/ncm', scanBackendBase: 'https://scan.example'
  }));
  await context.window.fetch('https://own.example/ncm/artist/album?id=1&cookie=test');
  assert.equal(new URL(sent[1].url).searchParams.has('cookie'), false);
  assert.equal(sent[1].options.headers.get('x-ncm-cookie'), 'test');
  await assert.rejects(context.window.fetch('https://own.example/not-ncm'));
  assert.equal(sent[1].options.credentials, 'omit');
});
