const fs = require('fs');
const path = require('path');
const vm = require('vm');

function checkPublic(root) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'seed-settings.js'), 'utf8'), ctx, { timeout: 1000 });
  const seed = ctx.window.NAF_SEED_SETTINGS;
  const allowed = new Set(['publicMode', 'staticMode', 'staticSnapshotBase']);
  if (!seed || seed.publicMode !== true || seed.staticMode !== true
    || seed.staticSnapshotBase !== 'data/mobile'
    || Object.keys(seed).some(key => !allowed.has(key))) {
    throw new Error('Public seed must contain only the public snapshot configuration.');
  }
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (/local-dump|cookie.*\.(txt|json)$|keystore|\.env|VA_.*_Cache\.json/i.test(entry.name)) {
        throw new Error('Private artifact in public output: ' + path.relative(root, file));
      }
      if (!/\.(js|html|json)$/.test(entry.name)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/MUSIC_U=[A-Za-z0-9%+/_=-]{20,}/.test(text)
        || /(?:spotifyClientSecret|spClientSecret|client_secret)[^\n]{0,80}['"][a-f0-9]{32}['"]/i.test(text)) {
        throw new Error('Credential detected in: ' + path.relative(root, file));
      }
    }
  }
  visit(root);
  for (const name of ['index.html', 'index-enhanced.html']) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    if (!text.includes('public-session.js') || !text.includes('data-public="true"') || text.includes('auto-restore.js')) {
      throw new Error('Public session policy is missing in ' + name);
    }
  }
  return true;
}
module.exports = checkPublic;
if (require.main === module) {
  checkPublic(path.resolve(process.argv[2] || path.join(__dirname, '../..')));
  console.log('Public privacy checks passed.');
}
