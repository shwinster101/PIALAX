'use strict';
// PIA-145: mandatory real-browser acceptance gate. Runs existing tap-count/word jobs, Calendar,
// v2 viewport assertions and verified-map jobs through one non-skipping preflight entry point.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { execFileSync, spawn } = require('child_process');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
async function main() {
  const roots = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
  try { roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()); } catch (_) { /* try runtime and standard roots */ }
  roots.push(path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules'), path.resolve(path.dirname(process.execPath), '..', 'node_modules'), '/usr/local/lib/node_modules', '/usr/lib/node_modules');
  let pw;
  for (const name of ['playwright', 'playwright-core']) {
    try { const file = require.resolve(name, { paths: [ROOT, ...roots] }); pw = require(file); roots.push(path.dirname(path.dirname(file))); break; } catch (_) { /* try next */ }
  }
  if (!pw || !pw.chromium) throw new Error('PIA-145 requires Playwright and Chromium. Install them or set NODE_PATH and PLAYWRIGHT_CHROMIUM_EXECUTABLE. This gate cannot skip.');
  const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || ['/usr/bin/chromium', '/opt/pw-browsers/chromium', pw.chromium.executablePath()].find(f => fs.existsSync(f));
  const probe = await pw.chromium.launch(executable ? { executablePath: executable } : {}); await probe.close();
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/app.html') { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(ROOT, 'app.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const out = process.env.PIALAX_TEST_REPORT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-job-flows-'));
  fs.mkdirSync(out, { recursive: true });
  const env = Object.assign({}, process.env, { NODE_PATH: [...new Set(roots)].join(path.delimiter), PIALAX_TEST_APP_URL: 'http://127.0.0.1:' + server.address().port + '/app.html', PIALAX_VIEWPORT_SCOPE: 'v2' });
  if (executable) env.PLAYWRIGHT_CHROMIUM_EXECUTABLE = executable;
  const report = { suites: [], passed: false };
  try {
    // Existing word jobs preserve the documented 13/19/3 tap targets and cover booking, prices, cheapest
    // week, Family, failures and concurrent writes. The other suites cover the new Calendar and real map.
    for (const script of ['test-calendar-browser.js', 'test-words.js', 'test-viewport.mjs', 'test-map-browser.js']) {
      process.stdout.write('\n▶ PIA-145 ' + script + '\n');
      const started = Date.now(), log = [];
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script), ROOT], { env, stdio: ['ignore', 'pipe', 'pipe'] });
        const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(script + ' exceeded its 20-minute budget')); }, 20 * 60 * 1000);
        child.stdout.on('data', b => { log.push(b.toString()); process.stdout.write(b); });
        child.stderr.on('data', b => { log.push(b.toString()); process.stderr.write(b); });
        child.on('error', e => { clearTimeout(timeout); reject(e); });
        child.on('close', (code, signal) => { clearTimeout(timeout); resolve({ code, signal }); });
      });
      const text = log.join(''); fs.writeFileSync(path.join(out, script + '.log'), text);
      const passed = result.code === 0 && !/SKIPPED|skipping.*(?:browser|playwright)|0 checks passing/i.test(text) && /all \d+ .*checks passing/.test(text);
      report.suites.push({ script, passed, code: result.code, signal: result.signal, durationMs: Date.now() - started });
      if (!passed) throw new Error(script + ' failed or skipped: required browser coverage was not completed');
    }
    report.passed = true;
    process.stdout.write('\nall ' + report.suites.length + ' job-flow suites passing\n');
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write('Job-flow evidence: ' + out + '\n'); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
