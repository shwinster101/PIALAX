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
  const server = http.createServer(require('./entry-server.js').entryHandler(ROOT));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const out = process.env.PIALAX_TEST_REPORT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-job-flows-'));
  fs.mkdirSync(out, { recursive: true });
  const env = Object.assign({}, process.env, { NODE_PATH: [...new Set(roots)].join(path.delimiter), PIALAX_TEST_APP_URL: 'http://127.0.0.1:' + server.address().port + '/app.html', PIALAX_VIEWPORT_SCOPE: 'v2' });
  if (executable) env.PLAYWRIGHT_CHROMIUM_EXECUTABLE = executable;
  const report = { suites: [], passed: false };
  // Existing word jobs preserve the documented 13/19/3 tap targets and cover booking, prices, cheapest
  // week, Family, failures and concurrent writes. The other suites cover the new Calendar and real map.
  const ORDER = ['test-cutover-browser.js', 'test-migration-browser.js', 'test-calendar-browser.js', 'test-words.js', 'test-viewport.mjs', 'test-map-browser.js'];
  // PIA-165: three groups run at once (one after another this gate took 26 minutes; the suites mostly wait on timers): the
  // words suite (itself in lanes), viewport then map, and cutover, migration then Calendar. Every suite still runs to its end with
  // its own log and pass rule; the output is printed in ORDER as soon as a suite and every one before it are done.
  const GROUPS = [['test-words.js'], ['test-viewport.mjs', 'test-map-browser.js'], ['test-cutover-browser.js', 'test-migration-browser.js', 'test-calendar-browser.js']];
  const runSuite = (script) => new Promise((resolve) => {
    const started = Date.now(), log = [];
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script), ROOT], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    // (PIA-156: 30 minutes, was 20: test-words alone measured 16m33s at #155 and 16m41s to 17m00s with PIA-156; a timeout still fails)
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 30 * 60 * 1000);
    child.stdout.on('data', b => log.push(b.toString()));
    child.stderr.on('data', b => log.push(b.toString()));
    child.on('error', e => { log.push(String(e && e.stack || e)); });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      const text = log.join('') + (timedOut ? '\n' + script + ' exceeded its 30-minute budget\n' : '');
      fs.writeFileSync(path.join(out, script + '.log'), text);
      const passed = !timedOut && code === 0 && !/SKIPPED|skipping.*(?:browser|playwright)|0 checks passing/i.test(text) && /all \d+ .*checks passing/.test(text);
      resolve({ script, passed, code, signal, durationMs: Date.now() - started, text });
    });
  });
  const t0 = Date.now(), results = {};
  let printed = 0;
  const flush = () => {
    while (printed < ORDER.length && results[ORDER[printed]]) {
      const r = results[ORDER[printed++]];
      process.stdout.write('\n▶ PIA-145 ' + r.script + '\n' + r.text);
    }
  };
  try {
    if (GROUPS.flat().sort().join() !== ORDER.slice().sort().join()) throw new Error('PIA-165 the job-flow groups must hold each required suite exactly once');
    await Promise.all(GROUPS.map(async (group) => {
      for (const script of group) { results[script] = await runSuite(script); flush(); }
    }));
    ORDER.forEach(s => { const r = results[s]; report.suites.push({ script: s, passed: r.passed, code: r.code, signal: r.signal, durationMs: r.durationMs }); });
    report.wallMs = Date.now() - t0;
    const failed = report.suites.filter(s => !s.passed).map(s => s.script);
    if (failed.length) throw new Error(failed.join(', ') + ' failed or skipped: required browser coverage was not completed');
    report.passed = true;
    process.stdout.write('\nall ' + report.suites.length + ' job-flow suites passing (' + Math.round(report.wallMs / 1000) + 's, three groups at once)\n');
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write('Job-flow evidence: ' + out + '\n'); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
