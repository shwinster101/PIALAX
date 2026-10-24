'use strict';
// Fixed test-only allowlist, matching GitHub Pages project and origin-root hosting.
const fs = require('fs'), path = require('path');
const FILES = ['index.html', 'pialax.html', 'pialax-mobile.html', 'app.html'];
function entryHandler(root) {
  const routes = new Map();
  for (const prefix of ['/', '/PIALAX/']) {
    routes.set(prefix, 'index.html');
    for (const file of FILES) routes.set(prefix + file, file);
  }
  return (req, res) => {
    const file = routes.get(new URL(req.url, 'http://localhost').pathname);
    if (!file || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(root, file)));
  };
}
module.exports = { entryHandler };
