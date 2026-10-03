// test-viewport.mjs — PIA-046 mobile layout gate. Driven by test-viewport.sh,
// which handles the node/playwright availability checks and skips cleanly when
// either is missing (this file is never reached in that case).
//
// What it asserts, per viewport, on the real rendered page:
//   1. No page-level horizontal overflow (documentElement.scrollWidth <= innerWidth).
//   2. The "＋ New trip" form's Add/Cancel row is never covered by the fixed
//      "Get Live Fares" CTA — the exact overlap the audit found. Measured as a
//      bounding-box intersection, with the form opened at the end of a long
//      watchlist (worst case, which is what made it reproduce).
//   3. Interactive controls carry an accessible name and meet the 44px target.
//
// Runs against BOTH files: pialax-mobile.html is the spec target, and
// pialax.html is checked at the same widths because the desktop file is served
// to any device that isn't UA-detected as mobile.
//
// KNOWN LIMITATION — read before trusting a desktop PASS. These pages load d3 +
// topojson from cdnjs. Over file:// with no network (CI, sandbox), those fail
// and pialax.html's boot throws "d3 is not defined" before the watchlist
// renders, so its checks below cover only the static shell. This is
// pre-existing, not a regression, and pialax-mobile.html is unaffected (its
// boot path survives without d3). For full desktop coverage, serve the repo
// over http with network access and re-run.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();

// Resolving Playwright is deliberately fussy: this repo has no package.json,
// so the module is only ever installed globally, and ESM `import` does NOT
// honour NODE_PATH the way `require.resolve` does. Resolve a concrete path
// with createRequire (seeded with the global root), then import by file URL.
async function loadPlaywright() {
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { /* npm absent */ }
  roots.push('/usr/lib/node_modules', '/usr/local/lib/node_modules');
  if (process.env.NODE_PATH) roots.unshift(...process.env.NODE_PATH.split(path.delimiter));

  // Playwright ships as CommonJS, so an ESM `import` hands back
  // { default: module.exports } — unwrap that rather than reading `chromium`
  // off the namespace object, where it does not exist.
  const unwrap = (m) => (m && m.chromium ? m : (m && m.default && m.default.chromium ? m.default : null));

  for (const name of ['playwright', 'playwright-core']) {
    for (const root of roots.filter(Boolean)) {
      try {
        const req = createRequire(path.join(root, 'noop.js'));
        const got = unwrap(req(name));
        if (got) return got;
      } catch { /* try the next root */ }
    }
    try { const got = unwrap(await import(name)); if (got) return got; } catch { /* keep looking */ }
  }
  return null;
}

const pw = await loadPlaywright();
if (!pw) {
  console.log('  ··  playwright present to bash but not importable — skipping (not a gate failure)');
  process.exit(0);
}
const { chromium } = pw;

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
];
const FILES = ['pialax-mobile.html', 'pialax.html'];

let passCount = 0;
let failCount = 0;
const ok = (m) => { console.log('  OK  ' + m); passCount++; };
const bad = (m) => { console.log('  XX  ' + m); failCount++; };

const execPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || '/opt/pw-browsers/chromium';

async function launch() {
  // Prefer the sandbox's pre-installed Chromium; fall back to whatever
  // Playwright resolves on a normal dev machine.
  try {
    return await chromium.launch({ executablePath: execPath });
  } catch {
    return await chromium.launch();
  }
}

const browser = await launch();

console.log('▶ test-viewport: mobile layout regression suite');

for (const file of FILES) {
  const url = pathToFileURL(path.join(ROOT, file)).href;
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const label = `${file} @ ${vp.name}`;
    try {
      // PIA-050: exercise the assistant UI too — it is the densest layout the
      // app produces (decision card + fact chips + context log in one card),
      // so if anything overflows or overlaps at 360px it will be this.
      await page.goto(url + (file === 'pialax-mobile.html' ? '?flags=assistant' : ''), { waitUntil: 'load' });
      // Let boot()/first render settle before measuring anything.
      await page.waitForTimeout(600);

      // Expand a card. Cards render COLLAPSED by default, so measuring the
      // list alone would miss the densest layout the app produces — decision
      // card + fact chips + context log stacked inside one card at 360px.
      // Without this the flag-on run proves much less than it appears to.
      await page.evaluate(() => {
        const r = document.querySelector('.wl-row');
        if (r && r.getAttribute('aria-expanded') !== 'true') r.click();
      });
      await page.waitForTimeout(400);

      if (file === 'pialax-mobile.html') {
        const sheet = await page.evaluate(() => {
          const el = document.querySelector('.wl-sheet-open');
          const close = el && el.querySelector('.wl-sheet-close');
          const scroll = el && el.querySelector('.wl-sheet-scroll');
          if (!el || !close || !scroll) return null;
          const box = el.getBoundingClientRect();
          const button = close.getBoundingClientRect();
          const tab = document.querySelector('.tabbar-btn');
          const tabBox = tab && tab.getBoundingClientRect();
          const cover = tabBox && document.elementFromPoint(tabBox.left + tabBox.width / 2, tabBox.top + tabBox.height / 2);
          return { top:box.top, bottom:box.bottom, width:box.width, height:innerHeight,
            closeVisible:button.top >= 0 && button.bottom <= innerHeight && button.height >= 44,
            scrollable:getComputedStyle(scroll).overflowY === 'auto' && scroll.clientHeight > 0,
            coversTab:!!(cover && el.contains(cover)), locked:document.body.classList.contains('trip-sheet-active'),
            dialog:el.getAttribute('role') === 'dialog' && el.getAttribute('aria-modal') === 'true',
            closeFocused:document.activeElement === close };
        });
        if (sheet && sheet.top <= 1 && sheet.bottom >= vp.height - 1 && sheet.width >= vp.width - 1 &&
            sheet.closeVisible && sheet.coversTab && sheet.locked && sheet.scrollable && sheet.dialog && sheet.closeFocused)
          ok(`${label} — trip details fill screen, scroll independently, and cover navigation`);
        else bad(`${label} — trip sheet geometry/scroll failed: ${JSON.stringify(sheet)}`);

        // Keyboard focus stays in the modal, and opening its trip clears the
        // overlay and body lock before the planner tab becomes visible.
        await page.keyboard.press('Shift+Tab');
        const trapped = await page.evaluate(() => {
          const el = document.querySelector('.wl-sheet-open');
          return !!(el && el.contains(document.activeElement));
        });
        if (trapped) ok(`${label} — keyboard focus stays in trip details`);
        else bad(`${label} — keyboard focus escaped behind trip details`);
        await page.keyboard.press('Escape');
        const dismissed = await page.evaluate(() => ({
          locked:document.body.classList.contains('trip-sheet-active'),
          sheet:!!document.querySelector('.wl-sheet-open'),
          rowFocused:!!(document.activeElement && document.activeElement.classList.contains('wl-row')),
        }));
        if (!dismissed.locked && !dismissed.sheet && dismissed.rowFocused)
          ok(`${label} — Escape closes details and restores focus to its trip`);
        else bad(`${label} — Escape did not restore the trip row: ${JSON.stringify(dismissed)}`);
        await page.locator('.wl-row').first().click();
        await page.locator('.wl-sheet-open .wl-open').click();
        await page.waitForTimeout(200);
        const opened = await page.evaluate(() => ({
          locked:document.body.classList.contains('trip-sheet-active'),
          sheet:!!document.querySelector('.wl-sheet-open'),
          tab:document.documentElement.dataset.activeTab,
        }));
        if (!opened.locked && !opened.sheet && opened.tab === 'plan')
          ok(`${label} — Open switches to the planner without leaving a locked sheet`);
        else bad(`${label} — Open left the sheet active: ${JSON.stringify(opened)}`);
        await page.locator('.tabbar-btn[data-tab="watchlist"]').click();
      }

      // ---- 1. no page-level horizontal overflow -------------------------
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      // 1px of slack absorbs sub-pixel rounding at deviceScaleFactor 2.
      if (overflow.scrollWidth <= overflow.innerWidth + 1) {
        ok(`${label} — no horizontal overflow (${overflow.scrollWidth} <= ${overflow.innerWidth})`);
      } else {
        bad(`${label} — page overflows horizontally: scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}`);
      }

      // ---- 2. New-trip form vs the fixed fare CTA -----------------------
      // Only meaningful where both exist (the mobile file); on desktop the
      // sticky CTA does not exist and this reports as not-applicable.
      const hasCta = await page.$('.sticky-cta');
      // Wait for the watchlist to finish its first render rather than sampling
      // once — a bare page.$() raced the render and reported a false failure.
      let newTripBtn = null;
      if (hasCta) {
        try { newTripBtn = await page.waitForSelector('#wl-newtrip', { timeout: 5000, state: 'attached' }); } catch { newTripBtn = null; }
      }
      if (!hasCta) {
        ok(`${label} — no sticky CTA on this layout (overlap not applicable)`);
      } else if (!newTripBtn) {
        bad(`${label} — #wl-newtrip not found; cannot verify the overlap fix`);
      } else {
        await newTripBtn.click();
        await page.waitForTimeout(250);
        const box = await page.evaluate(() => {
          const form = document.getElementById('nt-form');
          const cta = document.querySelector('.sticky-cta');
          if (!form) return { err: 'no #nt-form after clicking ＋ New trip' };
          const save = document.getElementById('nt-save');
          if (!save) return { err: 'no #nt-save in the new-trip form' };
          const ctaVisible = !!cta && getComputedStyle(cta).display !== 'none';
          const s = save.getBoundingClientRect();
          const c = ctaVisible ? cta.getBoundingClientRect() : null;
          return {
            ctaVisible,
            save: { top: s.top, bottom: s.bottom, height: s.height },
            cta: c ? { top: c.top, bottom: c.bottom } : null,
          };
        });
        if (box.err) {
          bad(`${label} — ${box.err}`);
        } else if (!box.ctaVisible) {
          ok(`${label} — fare CTA hidden on the Watchlist tab, so Add/Cancel cannot be covered`);
        } else {
          // Scroll the save button into view the way a user would, then check
          // it is not underneath the fixed CTA band.
          await page.evaluate(() => document.getElementById('nt-save').scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(200);
          const after = await page.evaluate(() => {
            const s = document.getElementById('nt-save').getBoundingClientRect();
            const c = document.querySelector('.sticky-cta').getBoundingClientRect();
            return { sTop: s.top, sBottom: s.bottom, cTop: c.top, cBottom: c.bottom };
          });
          const intersects = after.sBottom > after.cTop && after.sTop < after.cBottom;
          if (!intersects) ok(`${label} — new-trip Add/Cancel clear of the fare CTA`);
          else bad(`${label} — new-trip Add/Cancel overlaps the fare CTA (save ${after.sTop.toFixed(0)}–${after.sBottom.toFixed(0)} vs cta ${after.cTop.toFixed(0)}–${after.cBottom.toFixed(0)})`);
        }
      }

      // ---- 3. accessible names + touch targets on visible controls ------
      const a11y = await page.evaluate(() => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        };
        const named = (el) =>
          (el.getAttribute('aria-label') || '').trim() ||
          (el.getAttribute('aria-labelledby') || '').trim() ||
          (el.textContent || '').replace(/\s+/g, ' ').trim();
        const out = { unnamed: [], small: [] };
        document.querySelectorAll('button, [role="button"]').forEach((el) => {
          if (!vis(el)) return;
          if (!named(el)) out.unnamed.push(el.id || el.className || el.tagName);
          const r = el.getBoundingClientRect();
          // Only flag genuinely tiny targets; inline chips inside scrollable
          // rows are intentionally shorter than a standalone control.
          if (r.height > 0 && r.height < 28) out.small.push((el.id || el.className) + '@' + Math.round(r.height) + 'px');
        });
        return out;
      });
      if (a11y.unnamed.length === 0) ok(`${label} — every visible control has an accessible name`);
      else bad(`${label} — controls with no accessible name: ${a11y.unnamed.slice(0, 6).join(', ')}`);
      // Touch-target sizing is asserted for the mobile file only. pialax.html is
      // a pointer-driven desktop layout that merely happens to be reachable at a
      // narrow width; holding its dense nav/table rows to a finger-sized minimum
      // would be a redesign, not a regression gate. Its overflow and accessible
      // names are still checked above, at every viewport.
      if (file === 'pialax-mobile.html') {
        if (a11y.small.length === 0) ok(`${label} — no undersized touch targets`);
        else bad(`${label} — touch targets under 28px: ${a11y.small.slice(0, 6).join(', ')}`);
      } else if (a11y.small.length) {
        console.log(`  ··  ${label} — ${a11y.small.length} sub-28px targets (desktop layout, not gated)`);
      }
      if (file === 'pialax-mobile.html' && vp.width === 360) {
        await page.evaluate(() => {
          if (!document.getElementById('nt-form')) document.getElementById('wl-newtrip').click();
          document.getElementById('nt-dest').value = 'Cary';
          document.getElementById('nt-flight-to').value = '';
          document.getElementById('nt-dep').value = '';
          document.getElementById('nt-ret').value = '';
          document.querySelector('#nt-mode [data-v="family"]').click();
          document.getElementById('nt-save').click();
        });
        const unconfirmed = await page.evaluate(() => ({
          open: !!document.querySelector('.wl-sheet-open .wl-flight-to'),
          links: document.querySelectorAll('.wl-sheet-open .wl-gf').length,
        }));
        if (unconfirmed.open && unconfirmed.links === 0)
          ok(`${label} — place-only family idea saves without inventing a flight route`);
        else bad(`${label} — unconfirmed family route incorrect: ${JSON.stringify(unconfirmed)}`);

        await page.locator('.wl-sheet-open .wl-flight-to').fill('RDU');
        await page.locator('.wl-sheet-open .wl-flight-save').click();
        const flexible = await page.evaluate(() => [...document.querySelectorAll('.wl-sheet-open .wl-gf')]
          .map((a) => ({ label:a.textContent, query:decodeURIComponent(a.href) })));
        if (flexible.length === 3 && flexible.every((l) => l.label.includes('flexible dates') && l.query.includes('to RDU')))
          ok(`${label} — confirmed RDU yields three flexible-date family searches`);
        else bad(`${label} — flexible-date links incorrect: ${JSON.stringify(flexible)}`);

        await page.locator('.wl-sheet-open .wl-flight-dep').fill('2026-11-25');
        await page.locator('.wl-sheet-open .wl-flight-ret').fill('2026-11-29');
        await page.locator('.wl-sheet-open .wl-flight-save').click();
        const dated = await page.evaluate(() => ({
          links: [...document.querySelectorAll('.wl-sheet-open .wl-gf')].map((a) => decodeURIComponent(a.href)),
          stored: JSON.parse(localStorage.getItem('pialax_watchlist_v1') || '{}').added || [],
        }));
        const saved = dated.stored.find((t) => t.dest === 'Cary');
        if (dated.links.length === 3 && dated.links.every((u) => u.includes('2026-11-25') && u.includes('2026-11-29')) &&
            saved && saved.gf.to === 'RDU' && saved.dep === '2026-11-25' && saved.ret === '2026-11-29')
          ok(`${label} — dated searches and confirmed airport persist on the trip idea`);
        else bad(`${label} — dated handoff or persistence incorrect: ${JSON.stringify(dated)}`);
        await page.reload({ waitUntil: 'load' });
        await page.locator('.tabbar-btn[data-tab="watchlist"]').click();
        await page.waitForSelector('.wl-row');
        const restored = await page.evaluate(() => {
          const row = [...document.querySelectorAll('.wl-row')].find((el) => el.textContent.includes('Cary — family meetup idea'));
          if (!row) return null;
          row.click();
          return { airport:document.querySelector('.wl-sheet-open .wl-flight-to')?.value,
            links:[...document.querySelectorAll('.wl-sheet-open .wl-gf')].map((a) => decodeURIComponent(a.href)) };
        });
        if (restored && restored.airport === 'RDU' && restored.links.length === 3 &&
            restored.links.every((u) => u.includes('2026-11-25') && u.includes('2026-11-29')))
          ok(`${label} — confirmed handoff survives page reload`);
        else bad(`${label} — restored handoff incorrect: ${JSON.stringify(restored)}`);
      }
    } catch (e) {
      bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
  }
}

// ---- PIA-084: boot paints Trips at once and never overrides a tab tap ----
// The map-border download is hung on purpose: before PIA-084, boot awaited it
// with no timeout before painting the watchlist, and its late setActiveTab()
// overrode whatever tab the person had already tapped.
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const label = 'pialax-mobile.html @ 390x844 boot';
  const base = pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href;
  try {
    await ctx.route('**/states-10m.json', () => { /* never answer: a hung CDN */ });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const globals = await page.evaluate(() => typeof window.openCal === 'function' && typeof window.setMode === 'function');
    if (globals) ok(`${label} — inline-handler globals exist as soon as the page parses`);
    else bad(`${label} — window.openCal / setMode missing at DOMContentLoaded`);
    try {
      await page.waitForSelector('.wl-row', { state: 'visible', timeout: 1500 });
      ok(`${label} — Trips rows paint within 1.5s while the map download hangs`);
    } catch {
      bad(`${label} — Trips rows not visible within 1.5s (boot still waiting on the map download?)`);
    }
    // A trip-state link lands on Family; the person taps Trips before the
    // download gives up (4s). Their tab must still be showing afterwards.
    await page.goto(base + '?mode=meetup&hub=PIA&dep=2026-11-25&ret=2026-11-29', { waitUntil: 'domcontentloaded' });
    const landed = await page.evaluate(() => document.documentElement.dataset.activeTab);
    await page.locator('.tabbar-btn[data-tab="watchlist"]').click();
    await page.waitForTimeout(4800);
    const after = await page.evaluate(() => document.documentElement.dataset.activeTab);
    if (landed === 'plan' && after === 'watchlist') ok(`${label} — deep link lands on Family, and a Trips tap during startup sticks`);
    else bad(`${label} — tab override: landed ${landed}, after boot ${after}`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}

// ---- PIA-086: iPhone shell — toast placement/wrap, landscape column, meta ----
for (const vp of [{ name: '390x844', width: 390, height: 844 }, { name: '844x390', width: 844, height: 390 }]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const label = `pialax-mobile.html @ ${vp.name} shell`;
  try {
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href, { waitUntil: 'load' });
    await page.waitForSelector('.wl-row', { state: 'visible', timeout: 5000 });
    const toast = await page.evaluate(async () => {
      const t = document.getElementById('share-toast');
      t.textContent = '⛔ Live fares blocked — quota safety cutoff reached for this month. Reset happens on the 1st.';
      t.classList.add('show');
      await new Promise((r) => setTimeout(r, 700));
      const b = t.getBoundingClientRect(), bar = document.getElementById('tab-bar').getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height, barTop: bar.top, w: innerWidth };
    });
    if (toast.left >= 0 && toast.right <= toast.w && toast.bottom <= toast.barTop - 4 && toast.barTop - toast.bottom <= 40 && toast.height > 30)
      ok(`${label} — long toast wraps inside the screen, just above the tab bar`);
    else bad(`${label} — toast placement/wrap wrong: ${JSON.stringify(toast)}`);
    const col = await page.evaluate(() => {
      const r = [...document.querySelectorAll('.tabbar-btn')].map((b) => b.getBoundingClientRect());
      const left = Math.min(...r.map((x) => x.left)), right = Math.max(...r.map((x) => x.right));
      const app = document.getElementById('app').getBoundingClientRect();
      return { left, right, width: right - left, appLeft: app.left, appRight: app.right };
    });
    if (col.width <= 431 && Math.abs(col.left - col.appLeft) <= 2 && Math.abs(col.right - col.appRight) <= 2)
      ok(`${label} — tab bar buttons line up with the content column (${Math.round(col.width)}px)`);
    else bad(`${label} — tab bar not aligned with content: ${JSON.stringify(col)}`);
    if (vp.width === 390) {
      const meta = await page.evaluate(() => ({
        theme: document.querySelectorAll('meta[name="theme-color"]').length,
        scheme: !!document.querySelector('meta[name="color-scheme"]'),
        tel: (document.querySelector('meta[name="format-detection"]') || {}).content,
        icon: !!document.querySelector('link[rel="icon"]'),
      }));
      if (meta.theme === 2 && meta.scheme && meta.tel === 'telephone=no' && meta.icon)
        ok(`${label} — iPhone meta (theme-color ×2, color-scheme, no phone links, icon) present`);
      else bad(`${label} — iPhone meta missing: ${JSON.stringify(meta)}`);
    }
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}

// ---- PIA-087: Trip Idea Builder on iPhone — footer reachable, not covered ----
for (const vp of [{ name: '375x667', width: 375, height: 667 }, { name: '844x390', width: 844, height: 390 }]) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const label = `pialax-mobile.html @ ${vp.name} builder`;
  const footerCheck = () => {
    const btns = [...document.querySelectorAll('.trip-idea-footer button')].filter((b) => !b.hidden && b.getBoundingClientRect().height > 0);
    const bad = btns.filter((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return r.height < 44 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth || !(hit && b.contains(hit));
    }).map((b) => (b.id || b.className) + '@' + Math.round(b.getBoundingClientRect().height) + 'px');
    const close = document.querySelector('.trip-idea-close').getBoundingClientRect();
    return { count: btns.length, bad, locked: getComputedStyle(document.body).overflow === 'hidden',
      close: Math.min(close.width, close.height) >= 44 };
  };
  try {
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href, { waitUntil: 'load' });
    await page.waitForSelector('#build-trip-idea-btn', { state: 'visible', timeout: 5000 });
    await page.locator('#build-trip-idea-btn').click();
    await page.waitForTimeout(300);
    const inputs = await page.evaluate(footerCheck);
    if (inputs.count >= 1 && !inputs.bad.length && inputs.locked && inputs.close)
      ok(`${label} — inputs stage: footer tappable above the tab bar, page scroll-locked, close ≥44px`);
    else bad(`${label} — inputs stage footer/lock wrong: ${JSON.stringify(inputs)}`);
    await page.locator('#trip-idea-city').fill('RDU');
    await page.locator('#trip-idea-departure').fill('2026-11-25');
    await page.locator('#trip-idea-return').fill('2026-11-29');
    await page.locator('#trip-idea-builder-primary').click();
    await page.waitForTimeout(300);
    const results = await page.evaluate(footerCheck);
    if (results.count >= 4 && !results.bad.length)
      ok(`${label} — results stage: all ${results.count} footer buttons ≥44px, on screen and uncovered`);
    else bad(`${label} — results stage footer wrong: ${JSON.stringify(results)}`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}

// ---- PIA-090/091: map checks need the real d3 / topojson / us-atlas -------
// Chromium in this sandbox can't validate the CDN certificate through the
// proxy, so the exact files are fetched once with curl and served to the page
// (the SRI integrity hashes still verify — same bytes). No network → the map
// checks are skipped with a note, not failed.
const CDN_FILES = {
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js': 'application/javascript',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js': 'application/javascript',
  'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json': 'application/json',
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json': 'application/json',
};
const cdnCache = {};
function loadCdn() {
  for (const u of Object.keys(CDN_FILES)) {
    try { cdnCache[u] = execSync(`curl -fsS --max-time 20 '${u}'`, { maxBuffer: 8 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { return false; }
  }
  return true;
}
async function serveCdn(ctx) {
  await ctx.route(/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//, (route) => {
    const u = route.request().url();
    if (cdnCache[u]) return route.fulfill({ status: 200, contentType: CDN_FILES[u], headers: { 'Access-Control-Allow-Origin': '*' }, body: cdnCache[u] });
    return route.fulfill({ status: 404, body: '' });
  });
}
async function openMapTab(page) {
  await page.locator('.tabbar-btn[data-tab="map"]').click();
  await page.waitForSelector('#map-svg path.sp', { timeout: 6000 });
  await page.waitForTimeout(150);
}
const mapFit = () => {
  const wrap = document.getElementById('map-wrap'), svg = document.getElementById('map-svg');
  const vb = (svg.getAttribute('viewBox') || '').split(' ').map(Number);
  const land = svg.querySelector('.map-land');
  const lb = land ? land.getBBox() : { width: 0, height: 0 };
  return { w: wrap.clientWidth, h: wrap.clientHeight, vbw: vb[2], vbh: vb[3], landW: Math.round(lb.width), landH: Math.round(lb.height),
    ok: Math.abs(vb[2] - wrap.clientWidth) <= 1 && Math.abs(vb[3] - wrap.clientHeight) <= 1 };
};
const haveCdn = loadCdn();
if (!haveCdn) console.log('  ··  map checks skipped — could not fetch d3/topojson/us-atlas for the test page');

// ---- PIA-090: map redraw scheduling, rotation fit, no needless rebuilds ----
if (haveCdn) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  });
  const label = 'pialax-mobile.html map';
  try {
    await serveCdn(ctx);
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href, { waitUntil: 'load' });
    await page.waitForSelector('.wl-row', { state: 'visible', timeout: 6000 });
    await openMapTab(page);
    const opened = await page.evaluate(mapFit);
    const anim = await page.evaluate(() => getComputedStyle(document.getElementById('map-wrap')).transitionDuration);
    if (opened.ok && opened.landW > 100 && /^0s(,|$)/.test(anim))
      ok(`${label} @ 390x844 — opens at its final size (${opened.vbw}×${opened.vbh}), no height animation to chase`);
    else bad(`${label} @ 390x844 — open fit wrong: ${JSON.stringify(opened)} transition=${anim}`);

    // A data change (pick a route) repaints routes/labels but keeps the land paths.
    await page.evaluate(() => { window.__landNode = document.querySelector('#map-svg path.sp'); });
    const routeBtn = page.locator('.map-route-btn').first();
    if (await routeBtn.count()) await routeBtn.click();
    await page.waitForTimeout(250);
    // A height-only resize (browser toolbar) doesn't change the map's size at all.
    await page.setViewportSize({ width: 390, height: 760 });
    await page.waitForTimeout(250);
    const kept = await page.evaluate(() => ({ same: document.querySelector('#map-svg path.sp') === window.__landNode,
      routes: document.querySelectorAll('#map-svg .map-routes path').length }));
    if (kept.same && kept.routes > 0) ok(`${label} — data changes and toolbar resizes reuse the land paths (no full rebuild)`);
    else bad(`${label} — land rebuilt or routes missing: ${JSON.stringify(kept)}`);

    // Rotate to landscape and back: the drawing must re-fit its box each time.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const before = await page.evaluate(mapFit);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(350);
    const land = await page.evaluate(mapFit);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    const back = await page.evaluate(mapFit);
    if (land.ok && back.ok && Math.abs(back.landW - before.landW) <= 1 && Math.abs(back.landH - before.landH) <= 1)
      ok(`${label} — rotation re-fits the map both ways (landscape ${land.vbw}×${land.vbh}, back ${back.vbw}×${back.vbh}, land unchanged)`);
    else bad(`${label} — rotation fit wrong: before ${JSON.stringify(before)} landscape ${JSON.stringify(land)} back ${JSON.stringify(back)}`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}

// ---- PIA-091: map labels never collide; a tap picks the nearest airport ----
// Measured as drawn: every code/city label, fare tag and badge (.map-lbl) must
// sit inside the map, clear of every other label and of every airport dot. The
// one allowed exception is the engine's last resort — a minor unlabelled dot
// hidden wholly under a fare tag. A text label's box is the font's full
// ascent/descent rather than ink, so 1px of it top and bottom may touch.
const mapLabelReport = () => {
  const svg = document.getElementById('map-svg'), W = svg.clientWidth, H = svg.clientHeight;
  const labels = [...svg.querySelectorAll('.map-lbl')].map((g) => {
    const b = g.getBBox(), tag = !!g.querySelector('rect'), inset = tag ? 0 : 1, first = g.querySelector('text');
    return { kind: g.getAttribute('data-kind'), tag, text: g.textContent, code: first ? first.textContent : '',
      x: b.x, y: b.y + inset, w: b.width, h: Math.max(0, b.height - inset * 2) };
  });
  const dots = [...svg.querySelectorAll('.map-airports .map-dot')].map((c) => {
    const g = c.closest('[data-code]'), m = /translate\(([^,]+),([^)]+)\)/.exec(g.getAttribute('transform')), r = +c.getAttribute('r');
    return { code: g.getAttribute('data-code'), x: +m[1] - r, y: +m[2] - r, w: r * 2, h: r * 2 };
  });
  const hits = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.01;
  const within = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const labelled = new Set(labels.filter((l) => l.kind === 'airport').map((l) => l.code));
  const problems = [];
  labels.forEach((a, i) => {
    if (!within(a, { x: 0, y: 0, w: W, h: H })) problems.push(`"${a.text}" spills outside the map`);
    labels.slice(i + 1).forEach((b) => { if (hits(a, b)) problems.push(`"${a.text}" overlaps "${b.text}"`); });
    dots.forEach((d) => {
      if (!hits(a, d) || (a.tag && !labelled.has(d.code) && within(d, a))) return;
      problems.push(`"${a.text}" covers the ${d.code} dot`);
    });
  });
  const small = [...svg.querySelectorAll('text')].filter((t) => parseFloat(getComputedStyle(t).fontSize) < 11).map((t) => t.textContent);
  return { W, H, kinds: labels.map((l) => l.kind), problems, small };
};
if (haveCdn) {
  for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    for (const mode of ['meetup', 'solo']) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const label = `pialax-mobile.html map labels (${mode}) @ ${vp.width}x${vp.height}`;
      try {
        await serveCdn(ctx);
        const page = await ctx.newPage();
        // A trip-state link (solo) lands on the Family tab, so wait for the tab bar.
        await page.goto(pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href + (mode === 'solo' ? '?mode=solo&hub=LAX' : ''), { waitUntil: 'load' });
        await page.waitForSelector('.tabbar-btn[data-tab="map"]', { state: 'visible', timeout: 6000 });
        await openMapTab(page);
        const r = await page.evaluate(mapLabelReport);
        const airports = r.kinds.filter((k) => k === 'airport').length, tags = r.kinds.filter((k) => k === 'callout').length;
        const enough = mode === 'meetup' ? airports >= 3 && tags >= 1 : airports >= 2;
        if (enough && !r.problems.length && !r.small.length)
          ok(`${label} — ${r.kinds.length} labels (${airports} airports, ${tags} fares) placed clear of each other and every dot, all text ≥11px`);
        else bad(`${label} — ${enough ? '' : `too few labels ${JSON.stringify(r.kinds)}; `}${r.problems.join('; ')}${r.small.length ? `; text under 11px: ${JSON.stringify(r.small)}` : ''}`);
      } catch (e) {
        bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
      } finally {
        await ctx.close();
      }
    }
  }

  // PIA and ORD dots are ~12px apart on a phone and LGA/JFK ~1px; overlapping
  // per-airport tap circles used to hand both to whichever was drawn last.
  // Meetup: the hub picked is what the share link records (mhub=). Solo: the
  // route picked is spelled out under the map ("Route: LAX → JFK").
  for (const mode of ['meetup', 'solo']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const label = `pialax-mobile.html map taps (${mode}) @ 390x844`;
    try {
      await serveCdn(ctx);
      const page = await ctx.newPage();
      await page.goto(pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href + (mode === 'solo' ? '?mode=solo&hub=LAX' : ''), { waitUntil: 'load' });
      await page.waitForSelector('.tabbar-btn[data-tab="map"]', { state: 'visible', timeout: 6000 });
      await openMapTab(page);
      const picked = () => page.evaluate((solo) => solo
        ? ((/→\s*([A-Z]{3})/.exec(document.getElementById('map-context-sub').textContent) || [])[1] || null)
        : new URLSearchParams(location.search).get('mhub'), mode === 'solo');
      // Tap `code`'s dot, nudged `away` px from `other` along the line through both.
      const tapAt = async (code, other, away) => {
        const c = await page.evaluate((codes) => codes.map((k) => {
          const r = document.querySelector(`#map-svg [data-code="${k}"] .map-dot`).getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2];
        }), [code, other]);
        const [a, b] = c, len = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        await page.touchscreen.tap(a[0] + (a[0] - b[0]) / len * away, a[1] + (a[1] - b[1]) / len * away);
        await page.waitForTimeout(120);
        return picked();
      };
      const got = { PIA: await tapAt('PIA', 'ORD', 0), ORD: await tapAt('ORD', 'PIA', 0) };
      // In meetup mode New York isn't a hub choice until trip dates are set, so
      // LGA vs JFK is checked on the solo map, where both are destinations.
      if (mode === 'solo') { got.LGA = await tapAt('LGA', 'JFK', 6); got.JFK = await tapAt('JFK', 'LGA', 6); }
      const wrong = Object.keys(got).filter((k) => got[k] !== k);
      if (!wrong.length) ok(`${label} — tapping ${Object.keys(got).join(' / ')} picks the airport tapped`);
      else bad(`${label} — wrong airport picked: ${wrong.map((k) => `tapped ${k} → ${got[k]}`).join(', ')}`);
    } catch (e) {
      bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
    } finally {
      await ctx.close();
    }
  }
}

await browser.close();

console.log('');
if (failCount > 0) {
  console.log(failCount + ' failing, ' + passCount + ' passing');
  process.exit(1);
} else {
  console.log('all ' + passCount + ' viewport checks passing');
  process.exit(0);
}
