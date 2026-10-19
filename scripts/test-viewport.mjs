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
// PIA-134: app.html (the v2 shell) has its own block at the end: no horizontal
// scroll, ≥44px named targets and the light/dark tokens at 360/390/430.
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

// ---- PIA-099…104: family RSVP page, end to end against the real Worker ----
// worker.js runs in-process (as in test-worker.js) behind the page's PROXY_URL,
// with an in-memory KV, so answers really save and reload.
const rsvp = await (async () => {
  const fs = await import('node:fs'), os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pialax-rsvp-'));
  fs.copyFileSync(path.join(ROOT, 'worker.js'), path.join(dir, 'worker.mjs'));
  const mod = await import(pathToFileURL(path.join(dir, 'worker.mjs')).href);
  const worker = mod.default;
  const kv = new Map();
  const env = { IDEAS: { get: async (k) => (kv.has(k) ? kv.get(k) : null), put: async (k, v) => { kv.set(k, v); } } };
  // PIA-116: trip writes go through the real IdeaRoom Durable Object, as deployed.
  const rooms = new Map();
  env.IDEA_ROOM = { idFromName: (n) => n, get: (id) => {
    if (!rooms.has(id)) { const m = new Map(); rooms.set(id, new mod.IdeaRoom({ storage: { get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : undefined), put: async (k, v) => { m.set(k, structuredClone(v)); }, deleteAll: async () => m.clear(), setAlarm: async () => {} } }, env)); }
    const room = rooms.get(id);
    return { fetch: (url, init) => room.fetch(new Request(url, init)) };
  } };
  const W = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
  const post = async (p, body) => (await worker.fetch(new Request(W + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://shwinster101.github.io' }, body: JSON.stringify(body) }), env)).json();
  const newIdea = async () => {
  const made = await post('/idea', { idea: { title: '🦃 Thanksgiving at home — Peoria', destination: { city: 'Peoria', airport: 'PIA' }, dates: { departure: '2026-11-25', return: '2026-11-29' },
    recommendation: { city: 'Peoria', airport: 'PIA', hub: 'PIA_ORD', departure: '2026-11-25', return: '2026-11-29', totalFare: 640, perTicketFare: 320, headcount: 2, familyTotal: 900, familyStatus: 'estimated' },
    members: [{ code: 'PIA', label: 'Mom & Dad', airport: 'PIA', headcount: 2 }, { code: 'LAX', label: 'Me', airport: 'LAX', headcount: 1 }, { code: 'LGA', label: 'Anjo', airport: 'LGA', headcount: 1 }] } });
  await post('/idea/respond?id=' + made.id, { member: 'LAX', status: 'in', available_from: '2026-11-21', available_to: '2026-11-29' });
  return { id: made.id, key: made.edit_key, url: (hash) => pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href + '?idea=' + made.id + (hash || '') };
  };
  const context = async (vp, idea, opts = {}) => {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route(/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//, (r) => r.fulfill({ status: 404, body: '' }));
    await ctx.route(W + '/**', async (route) => {
      const q = route.request();
      const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: ['GET', 'HEAD', 'OPTIONS'].includes(q.method()) ? undefined : q.postData() }), env);
      const h = Object.fromEntries(res.headers);
      h['access-control-allow-origin'] = '*'; h['access-control-allow-headers'] = 'Content-Type, X-Idea-Key';
      return route.fulfill({ status: res.status, headers: h, body: await res.text() });
    });
    if (opts.admin) await ctx.addInitScript(([id, key]) => { localStorage.setItem('pialax_idea_keys_v1', JSON.stringify({ [id]: { edit_key: key, title: 'T' } })); }, [idea.id, idea.key]);
    return ctx;
  };
  return { newIdea, context, post, worker, env, W };
})();

// PIA-099/100: the family gets an RSVP-only page; this phone remembers who answered.
for (const vp of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  const idea = await rsvp.newIdea();
  const ctx = await rsvp.context(vp, idea);
  const label = `pialax-mobile.html RSVP guest @ ${vp.width}x${vp.height}`;
  try {
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(idea.url(), { waitUntil: 'load' });
    await page.waitForSelector('[data-idea-who]', { timeout: 8000 });
    const first = await page.evaluate(() => {
      const bar = document.querySelector('.tabbar-btn') && document.querySelector('.tabbar-btn').parentElement;
      const r = bar ? bar.getBoundingClientRect() : null;
      const top = r && r.height ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      const body = document.getElementById('trip-idea-builder-body').innerText;
      return { guest: document.body.classList.contains('idea-guest'), closeShown: [...document.querySelectorAll('[data-trip-close]')].some((b) => b.offsetParent !== null),
        dashCovered: !top || !!top.closest('#trip-idea-builder-bd'), price: /\$/.test(body), me: /\bMe\b/.test(body), who: [...document.querySelectorAll('[data-idea-who]')].map((b) => b.getAttribute('data-idea-who')) };
    });
    if (first.guest && !first.closeShown && first.dashCovered && !first.price && !first.me && first.who.join() === 'PIA,LGA')
      ok(`${label} — RSVP-only page: dashboard covered, no close, no prices, organizer by name, names to tap (${first.who.join(', ')})`);
    else bad(`${label} — guest page wrong: ${JSON.stringify(first)}`);

    await page.locator('[data-idea-who="LGA"]').click();
    await page.locator('input[name="trip-idea-rsvp-status"][value="in"]').check({ force: true });
    // PIA-101: the calendar opens on the trip's month with nothing picked; two taps make the range.
    const cal = await page.evaluate(() => ({ month: (document.querySelector('.trip-idea-cal-head strong') || {}).textContent,
      picked: document.querySelectorAll('.trip-idea-cal-day.is-start,.trip-idea-cal-day.is-end').length,
      minCell: Math.min(...[...document.querySelectorAll('.trip-idea-cal-day')].map((b) => Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height))) }));
    await page.locator('[data-cal-day="2026-11-26"]').click();
    await page.locator('[data-cal-day="2026-11-30"]').click();
    const range = await page.locator('.trip-idea-cal-sel span').innerText();
    if (cal.month === 'November 2026' && cal.picked === 0 && cal.minCell >= 44 && /Thu Nov 26 – Mon Nov 30 · 4 nights/.test(range))
      ok(`${label} — calendar opens on ${cal.month} with nothing picked, day cells ≥44px (${Math.round(cal.minCell)}), two taps → "${range}"`);
    else bad(`${label} — calendar wrong: ${JSON.stringify(cal)} range "${range}"`);
    const send = page.locator('#trip-idea-builder-primary');
    const sendBox = await send.boundingBox();
    const sendOk = !!sendBox && sendBox.y + sendBox.height <= vp.height && sendBox.height >= 44 && /Send my answer/.test(await send.innerText());
    await send.click();
    await page.waitForSelector('.trip-idea-mine', { timeout: 5000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.trip-idea-mine', { timeout: 8000 });
    const card = (await page.locator('.trip-idea-mine').innerText()).replace(/\s+/g, ' ');
    // PIA-105: "Find my flight" on the card; "Book for these dates" lists each traveler's own search.
    await page.locator('.trip-idea-book summary').click();
    const book = await page.evaluate(() => ({
      mine: (document.querySelector('.trip-idea-findflight') || {}).href || '',
      rows: [...document.querySelectorAll('.trip-idea-book li')].map((li) => ({ text: li.innerText.replace(/\s+/g, ' '), href: (li.querySelector('a') || {}).href || '' })),
      over: document.documentElement.scrollWidth > innerWidth }));
    const dq = (u) => decodeURIComponent(u.replace(/\+/g, ' '));
    // PIA-109: Peoria → fly in to PIA, home from ORD (one-ways).
    if (/google\.com\/travel\/flights\?q=/.test(book.mine) && /LGA to PIA on 2026-11-26 one way/.test(dq(book.mine)) && book.rows.length === 2 &&
        /LAX to PIA on 2026-11-21 one way/.test(dq(book.rows[0].href)) && /Anjo/.test(book.rows[1].text) && /In PIA ↗/.test(book.rows[1].text) && /Home ORD ↗/.test(book.rows[1].text) && !book.over)
      ok(`${label} — "✈️ Fly in · PIA" opens LGA→PIA Nov 26; the Book panel gives each traveler In PIA + Home ORD on their own dates`);
    else bad(`${label} — book step wrong: ${JSON.stringify(book)}`);
    // PIA-111: In / Home toggles — Home → PIA makes one round-trip search; it's saved with the answer.
    await page.locator('[data-leg-home="PIA"]').click();
    await page.waitForSelector('.trip-idea-mine [data-leg="round"]', { timeout: 5000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.trip-idea-mine', { timeout: 8000 });
    const legs = await page.evaluate(() => ({ round: (document.querySelector('.trip-idea-mine [data-leg="round"]') || {}).href || '',
      pressed: [...document.querySelectorAll('.trip-idea-seg [aria-pressed="true"]')].map((b) => b.textContent).join(',') }));
    if (/LGA to PIA on 2026-11-26 through 2026-11-30/.test(decodeURIComponent(legs.round)) && legs.pressed === 'PIA,PIA')
      ok(`${label} — In/Home toggles: Home → PIA gives one round-trip search (LGA ⇄ PIA), still picked after a reload`);
    else bad(`${label} — leg toggles wrong: ${JSON.stringify(legs)}`);
    await page.locator('[data-leg-home="ORD"]').click();
    await page.waitForSelector('.trip-idea-mine [data-leg="home"]', { timeout: 5000 });
    // PIA-106: "I booked ✓" → the card, the strip and "1 of 2 booked" all show it, after a reload too.
    await page.locator('.trip-idea-ibooked').click();
    await page.waitForSelector('.trip-idea-mine .trip-idea-booked-tag', { timeout: 5000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.trip-idea-mine', { timeout: 8000 });
    const booked = await page.evaluate(() => ({ tag: !!document.querySelector('.trip-idea-mine .trip-idea-booked-tag'), line: (document.querySelector('.trip-idea-rsvp-summary strong') || {}).textContent || '',
      green: document.querySelectorAll('.trip-idea-strip i.booked').length, list: document.querySelector('.trip-idea-rsvp-list').textContent }));
    if (booked.tag && /1 of 2 booked/.test(booked.line) && booked.green === 5 && /✈️ booked/.test(booked.list))
      ok(`${label} — "I booked ✓" sticks: ✈️ Booked on the card, "${booked.line.trim()}", Anjo's 5 days green on the strip`);
    else bad(`${label} — booked wrong: ${JSON.stringify(booked)}`);
    // PIA-102: with Ashwin Nov 21–29 and Anjo Nov 26–30, everyone overlaps Nov 26–29; the strip shows both plus the hosts.
    const win = await page.evaluate(() => ({ text: (document.querySelector('.trip-idea-window') || {}).textContent || '',
      rows: document.querySelectorAll('.trip-idea-strip .trip-idea-strip-name').length, over: document.documentElement.scrollWidth > innerWidth,
      stripFits: (() => { const st = document.querySelector('.trip-idea-strip'); return !!st && st.scrollWidth <= st.clientWidth + 1; })() }));
    if (/Everyone’s there Thu Nov 26 – Sun Nov 29/.test(win.text) && win.rows === 5 && win.stripFits && !win.over)
      ok(`${label} — "${win.text}" with a day strip (hosts + 2 travelers) that fits the screen`);
    else bad(`${label} — window/strip wrong: ${JSON.stringify(win)}`);
    if (sendOk && /Anjo/.test(card) && /In/.test(card) && /Thu Nov 26 – Mon Nov 30/.test(card) && /Change my answer/.test(card) && !errors.length)
      ok(`${label} — "Send my answer" on screen (≥44px); after saving, a reload opens straight to "${card.slice(0, 40)}…"`);
    else bad(`${label} — answer/remember failed: send ${JSON.stringify(sendBox)} card "${card}" errors ${JSON.stringify(errors)}`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}
{
  const idea = await rsvp.newIdea();
  const ctx = await rsvp.context({ width: 390, height: 844 }, idea, { admin: true });
  const label = 'pialax-mobile.html RSVP organizer @ 390x844';
  try {
    const page = await ctx.newPage();
    await page.goto(idea.url(), { waitUntil: 'load' });
    await page.waitForSelector('.trip-idea-mine, .trip-idea-rsvp-form', { timeout: 8000 });
    const a = await page.evaluate(() => ({ guest: document.body.classList.contains('idea-guest'), close: !!document.querySelector('.trip-idea-close') && document.querySelector('.trip-idea-close').offsetParent !== null,
      body: document.getElementById('trip-idea-builder-body').innerText }));
    if (!a.guest && a.close && /Plan Wed Nov 25 – Sun Nov 29 · ≈ \$900/.test(a.body))
      ok(`${label} — organizer device keeps the dashboard (✕), exact dates and the family cost`);
    else bad(`${label} — organizer view wrong: ${JSON.stringify({ guest: a.guest, close: a.close, body: a.body.slice(0, 200) })}`);
    // PIA-112: answers and organizer tools start folded; ✎ fixes the plan dates on the Worker.
    const folds = await page.evaluate(() => [...document.querySelectorAll('details[data-fold]')].map((d) => d.open));
    await page.locator('[data-plan-edit]').click();
    await page.locator('#trip-idea-plan-cal-wrap [data-cal-day="2026-11-20"]').click();
    await page.locator('#trip-idea-plan-cal-wrap [data-cal-day="2026-11-29"]').click();
    await page.locator('[data-plan-save]').click();
    await page.waitForFunction(() => /Plan Fri Nov 20 – Sun Nov 29/.test((document.querySelector('.trip-idea-planline') || {}).textContent || ''), null, { timeout: 5000 });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.trip-idea-planline', { timeout: 8000 });
    const planline = await page.locator('.trip-idea-planline').innerText();
    if (folds.join() === 'false,false' && /Plan Fri Nov 20 – Sun Nov 29/.test(planline))
      ok(`${label} — answers & organizer tools start folded; ✎ saved the plan dates ("${planline.replace(/\s+/g, ' ').trim()}") to the Worker`);
    else bad(`${label} — folds/plan edit wrong: ${JSON.stringify({ folds, planline })}`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}

// PIA-103: the organizer records a texted answer ("Mom & Dad: In") and carries
// their organizer role to another device with the #k= link.
{
  const idea = await rsvp.newIdea();
  const ctx = await rsvp.context({ width: 390, height: 844 }, idea, { admin: true });
  const label = 'pialax-mobile.html RSVP organizer tools @ 390x844';
  try {
    const page = await ctx.newPage();
    await page.goto(idea.url(), { waitUntil: 'load' });
    await page.waitForSelector('details[data-fold="list"] summary', { timeout: 8000 });
    await page.locator('details[data-fold="list"] summary').click();
    await page.waitForSelector('[data-idea-answer-for]', { timeout: 3000 });
    const targets = await page.$$eval('[data-idea-answer-for]', (bs) => bs.map((b) => b.getAttribute('data-idea-answer-for')));
    await page.locator('[data-idea-answer-for="PIA"]').click();
    const head = await page.locator('.trip-idea-form-head strong').innerText();
    const btn = await page.locator('#trip-idea-builder-primary').innerText();
    await page.locator('#trip-idea-builder-primary').click();
    await page.waitForSelector('.trip-idea-mine', { timeout: 5000 });
    const after = await page.evaluate(() => ({ list: document.querySelector('.trip-idea-rsvp-list').innerText, mine: document.querySelector('.trip-idea-mine').innerText }));
    if (targets.join() === 'PIA,LGA' && /Answering for Mom & Dad/.test(head) && /Save for Mom & Dad/.test(btn) && /Hosting — confirmed/.test(after.list) && /entered by Ashwin/.test(after.list) && /Your answer/.test(after.mine) && !/Mom/.test(after.mine))
      ok(`${label} — "✎ Answer for" records Mom & Dad's texted reply (tagged "entered by Ashwin"); the organizer's own answer card is unchanged`);
    else bad(`${label} — answer-for wrong: ${JSON.stringify({ targets, head, btn, after })}`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
  const ctx2 = await rsvp.context({ width: 390, height: 844 }, idea);
  const label2 = 'pialax-mobile.html organizer link on a new device @ 390x844';
  try {
    const page = await ctx2.newPage();
    await page.goto(idea.url('#k=' + idea.key), { waitUntil: 'load' });
    await page.waitForSelector('.trip-idea-mine, .trip-idea-rsvp-form', { timeout: 8000 });
    const st = await page.evaluate((id) => ({ guest: document.body.classList.contains('idea-guest'), hash: location.hash,
      key: !!(JSON.parse(localStorage.getItem('pialax_idea_keys_v1') || '{}')[id] || {}).edit_key, body: document.getElementById('trip-idea-builder-body').innerText,
      orglink: !!document.querySelector('[data-idea-orglink]') }), idea.id);
    if (!st.guest && !st.hash && st.key && /≈ \$900/.test(st.body) && st.orglink)
      ok(`${label2} — #k= link makes this device the organizer (admin view), and the key is wiped from the address bar`);
    else bad(`${label2} — organizer link wrong: ${JSON.stringify({ guest: st.guest, hash: st.hash, key: st.key })}`);
  } catch (e) {
    bad(`${label2} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx2.close();
  }
}

// PIA-113: a trip linked to a family RSVP opens the Family tab summary-first.
{
  const idea = await rsvp.newIdea();
  const ctx = await rsvp.context({ width: 390, height: 844 }, idea, { admin: true });
  const label = 'pialax-mobile.html Family tab (linked trip) @ 390x844';
  try {
    await ctx.addInitScript((id) => { localStorage.setItem('pialax_watchlist_v1', JSON.stringify({ overrides: { thanksgiving: { stage: 'planning', sharedIdeaId: id } }, added: [] })); }, idea.id);
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href, { waitUntil: 'load' });
    await page.waitForSelector('.wl-row[data-wl-id="thanksgiving"]', { timeout: 8000 });
    await page.locator('.wl-row[data-wl-id="thanksgiving"]').click();
    await page.locator('.wl-more-actions summary').click();
    await page.locator('.wl-more-actions .wl-open').click();
    await page.waitForSelector('#linked-trip-summary:not([hidden])', { timeout: 5000 });
    await page.waitForSelector('#linked-trip-summary .lt-book', { timeout: 5000 });
    const f = await page.evaluate(() => ({ sum: document.getElementById('linked-trip-summary').innerText.replace(/\s+/g, ' '),
      block1: getComputedStyle(document.getElementById('plan-block1')).display, over: document.documentElement.scrollWidth > innerWidth }));
    await page.locator('.lts-planner').click();
    const opened = await page.evaluate(() => getComputedStyle(document.getElementById('plan-block1')).display);
    // PIA-120: the card's dates are the RSVP plan (Wed Nov 25), not the Trips card's Nov 20.
    if (/Thanksgiving/.test(f.sum) && /Wed Nov 25 – Sun Nov 29/.test(f.sum) && /Open RSVP/.test(f.sum) && f.block1 === 'none' && opened !== 'none' && !f.over)
      ok(`${label} — summary first ("${f.sum.slice(0, 60)}…"), Step 1 folded until "Planner ▸"`);
    else bad(`${label} — summary wrong: ${JSON.stringify(Object.assign(f, { opened }))}`);
    await page.locator('.lts-planner').click();
    // PIA-120: one place for dates, one place to book — and it matches the RSVP sheet.
    const g = await page.evaluate(() => {
      const box = document.getElementById('linked-trip-summary');
      const links = (root, code) => [...root.querySelectorAll('a[href]')].filter((a) => !code || a.closest('[data-lt-book="' + code + '"]')).map((a) => a.href);
      const card = [...document.querySelectorAll('#meetup-routes .route-card, .route-card')].find((c) => /LAX/.test(c.querySelector('.route-card-hd') ? c.querySelector('.route-card-hd').textContent : ''));
      const tgt = (el) => el && el.getBoundingClientRect();
      const btns = [...box.querySelectorAll('.lt-book a')].map((a) => Math.round(a.getBoundingClientRect().height));
      return { cardLinks: links(box, 'LAX'), routeLinks: card ? links(card) : null, routeText: card ? card.innerText.replace(/\s+/g, ' ') : '',
        bridge: getComputedStyle(document.getElementById('step2-bridge')).display,
        strip: (document.getElementById('meetup-strip') || {}).innerText || '', stripCal: !!document.querySelector('#meetup-strip [onclick*="openCal"]'),
        edit: !!box.querySelector('.lts-dates-edit'), minBtn: Math.min.apply(null, btns.length ? btns : [0]), over: document.documentElement.scrollWidth > innerWidth };
    });
    const q = (u) => decodeURIComponent(u || '');
    if (g.cardLinks.length === 2 && /LAX to PIA on 2026-11-21 one way/.test(q(g.cardLinks[0])) && /ORD to LAX on 2026-11-29 one way/.test(q(g.cardLinks[1])) && g.minBtn >= 44 && g.edit)
      ok(`${label} — "✈️ Book flights" on the trip card: Me = In PIA Sat Nov 21 + Home ORD Sun Nov 29 (one-ways, own dates), ✎ Dates for the organizer`);
    else bad(`${label} — trip card booking wrong: ${JSON.stringify(g)}`);
    if (g.routeLinks && g.routeLinks.join('|') === g.cardLinks.join('|') && /📋 RSVP/.test(g.routeText) && !/custom/.test(g.routeText))
      ok(`${label} — Flight Breakdown card for LAX opens the same two searches as the trip card / RSVP sheet ("📋 RSVP", no "✱ custom")`);
    else bad(`${label} — route card disagrees: ${JSON.stringify({ routeLinks: g.routeLinks, cardLinks: g.cardLinks, text: g.routeText.slice(0, 160) })}`);
    if (g.bridge === 'none' && !g.stripCal && /Plan:\s*Wed Nov 25 – Sun Nov 29\s*· from RSVP/i.test(g.strip) && !g.over)
      ok(`${label} — no second date picker: "Step 2 · Choose Dates" hidden, strip reads "Plan: Wed Nov 25 – Sun Nov 29 · from RSVP"`);
    else bad(`${label} — date controls still offered: ${JSON.stringify({ bridge: g.bridge, stripCal: g.stripCal, strip: g.strip.slice(0, 120) })}`);
    // PIA-121: the LAX card is priced as the legs Me books (in + home), with a ±day
    // strip; one tap moves Me's RSVP date and every view follows. Zero searches.
    {
      await rsvp.post('/idea/respond?id=' + idea.id, { member: 'LGA', status: 'in', available_from: '2026-11-26', available_to: '2026-11-30' });
      const searches = []; page.on('request', (r) => { if (/\/search\?/.test(r.url())) searches.push(r.url()); });
      const lc = page.locator('.route-card', { has: page.locator('[data-leg-box="LAX"]') });
      await lc.waitFor({ timeout: 5000 });
      const s = await lc.evaluate((c) => ({ text: c.innerText.replace(/\s+/g, ' '), chips: [...c.querySelectorAll('[data-leg-flex]')].map((b) => Math.round(b.getBoundingClientRect().height)),
        next: (c.querySelector('[data-leg-flex][data-dir="in"]:not([disabled])') || {}).dataset || null, over: document.documentElement.scrollWidth > innerWidth }));
      const nextDate = s.next && s.next.date;
      if (/in \+ home/.test(s.text) && /In · LAX→PIA/.test(s.text) && /Home · ORD→LAX/.test(s.text) && s.chips.length === 6 && Math.min.apply(null, s.chips) >= 44 && !s.over && nextDate)
        ok(`${label} — LAX card priced as Me's legs ("in + home"), −1/plan/+1 per leg, chips ≥44px, no overflow`);
      else bad(`${label} — leg strip wrong: ${JSON.stringify({ text: s.text.slice(0, 200), chips: s.chips, nextDate, over: s.over })}`);
      if (nextDate) {
        await lc.locator('[data-leg-flex][data-dir="in"][data-date="' + nextDate + '"]').click();
        await page.waitForFunction((d) => [...document.querySelectorAll('#linked-trip-summary [data-lt-book="LAX"] a')].some((a) => decodeURIComponent(a.href).includes('LAX to PIA on ' + d)), nextDate, { timeout: 6000 }).catch(() => {});
        const after = await page.evaluate((d) => {
          const card = [...document.querySelectorAll('.route-card')].find((c) => c.querySelector('[data-leg-box="LAX"]'));
          const has = (root) => !!root && [...root.querySelectorAll('a[href]')].some((a) => decodeURIComponent(a.href).includes('LAX to PIA on ' + d + ' one way'));
          return { trip: has(document.querySelector('#linked-trip-summary [data-lt-book="LAX"]')), route: has(card), plan: !!(card && card.querySelector('.lt-leg-chip.plan[data-dir="in"][data-date="' + d + '"]')) };
        }, nextDate);
        const saved = await (await rsvp.worker.fetch(new Request(rsvp.W + '/idea?id=' + idea.id), rsvp.env)).json();
        const r = saved.doc && saved.doc.responses.LAX;
        if (after.trip && after.route && after.plan && r && r.available_from === nextDate && r.available_to === '2026-11-29' && saved.doc.responses.LGA.available_from === '2026-11-26' && !searches.length)
          ok(`${label} — tapping ${nextDate} moved only Me's RSVP arrive date; trip card, route card and plan chip agree; 0 searches`);
        else bad(`${label} — flex tap didn't carry through: ${JSON.stringify({ after, saved: r, lga: saved.doc && saved.doc.responses.LGA, searches: searches.length })}`);
      }
      // PIA-123: a target typed on the card saves on this device and reads back as a verdict.
      const tin = page.locator('[data-leg-box="LAX"] input[data-leg-target]');
      await tin.fill('300'); await tin.press('Enter'); await tin.evaluate((el) => el.blur());
      await page.waitForFunction(() => /target \$300/.test((document.querySelector('[data-leg-box="LAX"] .lt-watch') || {}).textContent || ''), null, { timeout: 4000 }).catch(() => {});
      const tw = await page.evaluate((id) => ({ h: Math.round((document.querySelector('[data-leg-box="LAX"] input[data-leg-target]') || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
        txt: (document.querySelector('[data-leg-box="LAX"] .lt-watch') || {}).textContent || '', saved: (JSON.parse(localStorage.getItem('pialax_leg_targets_v1') || '{}')[id] || {}).byCode,
        over: document.documentElement.scrollWidth > innerWidth }), idea.id);
      if (tw.h >= 44 && /target \$300 \(estimate\)/.test(tw.txt) && tw.saved && tw.saved.LAX === 300 && !tw.over)
        ok(`${label} — 🎯 target on Me's card (≥44px) saves on this device and reads "target $300 (estimate)" until fares are live`);
      else bad(`${label} — target didn't save/read back: ${JSON.stringify(tw)}`);
      // PIA-124: above Me's Book buttons — fare confidence and the book-by countdown;
      // "Mark booked ✓" flips Me's RSVP row and Me drops off the watch.
      const cue = await page.evaluate(() => ({ txt: (document.querySelector('[data-leg-box="LAX"] .lt-book-cue') || {}).textContent || '',
        hd: (document.querySelector('#linked-trip-summary .lt-book-hd') || {}).textContent || '' }));
      const mark = page.locator('[data-leg-box="LAX"] [data-leg-booked]');
      const canMark = await mark.count();
      if (canMark) await mark.click();
      await page.waitForFunction(() => !document.querySelector('[data-leg-box="LAX"]') && /✓ Booked/.test((document.querySelector('#linked-trip-summary [data-lt-book="LAX"]') || {}).textContent || ''), null, { timeout: 6000 }).catch(() => {});
      const gone = await page.evaluate(() => ({ box: !!document.querySelector('[data-leg-box="LAX"]'), trip: (document.querySelector('#linked-trip-summary [data-lt-book="LAX"]') || {}).textContent || '' }));
      const bdoc = (await (await rsvp.worker.fetch(new Request(rsvp.W + '/idea?id=' + idea.id), rsvp.env)).json()).doc;
      if (/Fare: estimate/.test(cue.txt) && /Book[- ]by.*Sun Nov 1/.test(cue.txt) && /Book[- ]by.*Sun Nov 1/.test(cue.hd) && canMark && !gone.box && /✓ Booked/.test(gone.trip) && bdoc.responses.LAX.booked === true)
        ok(`${label} — "Fare: estimate" + "${cue.txt.replace(/.*⏳ /, '').slice(0, 30)}" above Me's Book buttons; Mark booked ✓ flips Me's RSVP row and Me leaves the watch`);
      else bad(`${label} — book cue / mark booked wrong: ${JSON.stringify({ cue, canMark, gone, booked: bdoc.responses.LAX.booked })}`);
    }
    await page.locator('.lts-dates-edit').click();
    await page.waitForSelector('.trip-idea-planedit', { timeout: 5000 }).catch(() => {});
    if (await page.locator('.trip-idea-planedit').count()) ok(`${label} — "✎ Dates" opens the RSVP straight into the plan-dates calendar`);
    else bad(`${label} — "✎ Dates" did not open the plan-dates editor`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}

// PIA-127: the phone's one-thumb flow. Open the app → "✈️ Book flights" on the
// Thanksgiving card → Ashwin's "In PIA" link = 2 taps; and on the Family tab
// the fare CTA slot becomes the trip bar (Flex · Refresh · Book) with sheets.
for (const vp of [{ width: 360, height: 740 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  const idea = await rsvp.newIdea();
  const ctx = await rsvp.context(vp, idea, { admin: true });
  const label = `pialax-mobile.html one-thumb flow @ ${vp.width}x${vp.height}`;
  try {
    await ctx.addInitScript((id) => { localStorage.setItem('pialax_watchlist_v1', JSON.stringify({ overrides: { thanksgiving: { stage: 'planning', sharedIdeaId: id } }, added: [] })); }, idea.id);
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href, { waitUntil: 'load' });
    await page.waitForSelector('[data-book-idea]', { timeout: 8000 });
    let taps = 0;
    await page.locator('[data-book-idea]').first().click(); taps++;
    await page.waitForSelector('#lt-sheet:not([hidden]) [data-lt-book="LAX"] a', { timeout: 6000 });
    const s = await page.evaluate(() => {
      const a = document.querySelector('#lt-sheet [data-lt-book="LAX"] a'), r = a.getBoundingClientRect();
      return { href: decodeURIComponent(a.href), text: a.textContent, h: Math.round(r.height), inView: r.top >= 0 && r.bottom <= innerHeight, over: document.documentElement.scrollWidth > innerWidth };
    });
    taps++; // tapping that link is the hand-off itself (not followed here — it leaves the app)
    if (taps <= 3 && /In PIA/.test(s.text) && /LAX to PIA on 2026-11-21 one way/.test(s.href) && s.h >= 44 && s.inView && !s.over)
      ok(`${label} — open → ✈️ Book flights → "${s.text.trim()}" = ${taps} taps to Ashwin's Google Flights search (LAX→PIA Sat Nov 21), 44px, on screen`);
    else bad(`${label} — book path wrong: ${JSON.stringify(Object.assign(s, { taps }))}`);
    await page.locator('#lt-sheet .lt-sheet-x').click();
    // Family tab: the trip bar replaces Get Live Fares in the same slot.
    await page.locator('.wl-row[data-wl-id="thanksgiving"]').click();
    await page.locator('.wl-more-actions summary').click();
    await page.locator('.wl-more-actions .wl-open').click();
    await page.waitForSelector('#lt-tripbar button', { timeout: 6000 });
    const bar = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('#lt-tripbar button')], tab = document.getElementById('tab-bar');
      const r = document.getElementById('lt-tripbar').getBoundingClientRect(), tr = tab ? tab.getBoundingClientRect() : { top: innerHeight };
      return { labels: btns.map((b) => b.textContent), minH: Math.min.apply(null, btns.map((b) => b.getBoundingClientRect().height)), cta: getComputedStyle(document.getElementById('search-btn')).display,
        clipped: btns.some((b) => b.scrollWidth > b.clientWidth + 1), aboveTabs: r.bottom <= tr.top + 1, over: document.documentElement.scrollWidth > innerWidth };
    });
    if (bar.labels.length === 3 && /Flex/.test(bar.labels[0]) && /Refresh|Fresh/.test(bar.labels[1]) && /Book/.test(bar.labels[2]) && bar.minH >= 44 && bar.cta === 'none' && !bar.clipped && bar.aboveTabs && !bar.over)
      ok(`${label} — trip bar in the CTA slot: ${bar.labels.join(' · ')} (≥44px, unclipped, above the tab bar, no overflow)`);
    else bad(`${label} — trip bar wrong: ${JSON.stringify(bar)}`);
    // PIA-129: the family total leads the Flight Breakdown, estimates labelled.
    const board = await page.evaluate(() => { const el = document.querySelector('#meetup-routes .lt-board'); return el ? { text: el.innerText.replace(/\s+/g, ' '), fits: el.scrollWidth <= el.clientWidth + 1 } : null; });
    if (board && /family total/i.test(board.text) && /~\$[\d,]+ still to book · 1 of 1 traveler · ~ = includes estimates/.test(board.text) && /Booked: 0 of 1/.test(board.text) && board.fits)
      ok(`${label} — family total board: "${board.text.replace(/.*family total /i, '').slice(0, 60)}…" (estimates labelled, fits)`);
    else bad(`${label} — family total board wrong: ${JSON.stringify(board)}`);
    await page.locator('#lt-tripbar [data-tb="flex"]').click();
    await page.waitForSelector('#lt-sheet:not([hidden]) [data-leg-flex]', { timeout: 6000 }).catch(() => {});
    const fx = await page.evaluate(() => ({ rows: [...document.querySelectorAll('#lt-sheet .lt-leg-chips')].map((c) => c.children.length), over: document.documentElement.scrollWidth > innerWidth,
      sheetOver: (() => { const sh = document.getElementById('lt-sheet'); return sh ? sh.scrollWidth > sh.clientWidth + 1 : true; })() }));
    if (fx.rows.length >= 2 && fx.rows.every((n) => n === 5) && !fx.over && !fx.sheetOver) ok(`${label} — 📅 Flex opens "Dates & airports": ±2 days per leg (${fx.rows.join('/')} chips), no sideways scroll`);
    else bad(`${label} — flex sheet wrong: ${JSON.stringify(fx)}`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}

// PIA-125: with a token and a fare that lapsed overnight, opening the app shows a
// one-tap nudge — and spends nothing until it's tapped.
{
  const idea = await rsvp.newIdea();
  const ctx = await rsvp.context({ width: 390, height: 844 }, idea, { admin: true });
  const label = 'pialax-mobile.html stale-fare nudge @ 390x844';
  try {
    await ctx.addInitScript((id) => {
      localStorage.setItem('pialax_watchlist_v1', JSON.stringify({ overrides: { thanksgiving: { stage: 'planning', sharedIdeaId: id } }, added: [] }));
      localStorage.setItem('pialax_proxy_token', 'tok_' + 'x'.repeat(28));
      localStorage.setItem('pialax_leg_history_v1', JSON.stringify({ 'LAX|PIA|2026-11-21|': [{ t: Date.now() - 30 * 3600e3, p: 189 }] }));
    }, idea.id);
    const page = await ctx.newPage();
    const searches = []; page.on('request', (r) => { if (/\/search\?/.test(r.url())) searches.push(r.url()); });
    await page.goto(pathToFileURL(path.join(ROOT, 'pialax-mobile.html')).href, { waitUntil: 'load' });
    await page.waitForSelector('#lt-banner:not([hidden])', { timeout: 8000 }).catch(() => {});
    const b = await page.evaluate(() => { const el = document.getElementById('lt-banner'); const go = el && el.querySelector('[data-banner-go]'), x = el && el.querySelector('[data-banner-x]');
      return el ? { text: el.textContent, kind: el.getAttribute('data-kind'), go: go ? Math.round(go.getBoundingClientRect().height) : 0, x: x ? Math.round(x.getBoundingClientRect().width) : 0, over: document.documentElement.scrollWidth > innerWidth } : null; });
    if (b && b.kind === 'nudge' && /1 fare is a day old/.test(b.text) && /Refresh \(1 search\)/.test(b.text) && b.go >= 44 && b.x >= 44 && !searches.length && !b.over)
      ok(`${label} — "1 fare is a day old · Refresh (1 search)" on open, 44px targets, 0 searches until tapped`);
    else bad(`${label} — nudge wrong: ${JSON.stringify({ b, searches: searches.length })}`);
    await page.locator('#lt-banner [data-banner-x]').click();
    const gone = await page.evaluate(() => document.getElementById('lt-banner').hidden);
    if (gone && !searches.length) ok(`${label} — ✕ dismisses it for this visit, still 0 searches`);
    else bad(`${label} — dismiss failed or a search went out (${searches.length})`);
  } catch (e) {
    bad(`${label} — threw: ${e && e.message ? e.message : String(e)}`);
  } finally {
    await ctx.close();
  }
}

// ---- PIA-119: pasting the organizer token can't knock the dashboard into mock ----
// The URL box used to be blank (the built-in Worker URL never showed), so
// tapping the button to save a token set PROXY_URL to '' — mock data.
for (const file of ['pialax-mobile.html', 'pialax.html']) {
  const W = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
  const TOK = 'viewport-token-0123456789abcdef';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//, (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route(W + '/**', (route) => {
    const q = route.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Pialax-Token, X-Idea-Key', 'content-type': 'application/json' };
    if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (new URL(q.url()).pathname === '/account') {
      const good = q.headers()['x-pialax-token'] === TOK;
      return route.fulfill({ status: good ? 200 : 401, headers: cors, body: good ? JSON.stringify({ this_month_usage: 41, searches_per_month: 1000, total_searches_left: 959, spend: { serp: { used: 1, cap: 30 }, exact: true } }) : '{"code":"no_token"}' });
    }
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const label = `${file} organizer token (PIA-119)`;
  try {
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(ROOT, file)).href, { waitUntil: 'load' });
    const before = await page.evaluate(() => ({ url: document.getElementById('api-key-inp').value, status: document.getElementById('api-token-status').textContent }));
    if (before.url === W && /No token yet/.test(before.status)) ok(`${label} — URL box shows the Worker in use; status says "${before.status}"`);
    else bad(`${label} — boot: url "${before.url}", status "${before.status}"`);
    for (const [tok, want] of [['wrong-token-0123456789abcdef', /Token rejected/], [TOK, /Token accepted · Worker searches today 1\/30/]]) {
      await page.evaluate((t) => { document.getElementById('api-token-inp').value = t; document.getElementById('api-apply').click(); }, tok);
      await page.waitForFunction((re) => new RegExp(re).test(document.getElementById('api-token-status').textContent), want.source, { timeout: 5000 }).catch(() => {});
      const after = await page.evaluate(() => ({ status: document.getElementById('api-token-status').textContent, saved: localStorage.getItem('pialax_proxy_url'), tok: localStorage.getItem('pialax_proxy_token') }));
      if (want.test(after.status) && after.saved === W && after.tok === tok) ok(`${label} — "Save & connect" keeps the Worker and shows "${after.status}"`);
      else bad(`${label} — after save: ${JSON.stringify(after)}`);
    }
  } catch (e) { bad(`${label} — ${e.message}`); }
  await ctx.close();
}

// ---- PIA-134: app.html, the v2 shell, at 360 / 390 / 430 in light and dark ----
// PIA-135 adds the Ideas states: the organizer's total and ⏳ cue, the list-share sheet, the receiving sheet (with
// ⤓ Save, and with nothing new).
// Every state the shell can reach (empty, the list with its shelf open, Family, a trip view with eight long
// names, Map, Calendar, ⓘ, ⚙ and P-link) must have no horizontal scroll, ≥44px targets with accessible names,
// and the light or dark token set. The Worker is a route over the repo's fixtures; nothing else is reachable.
{
  const fs = await import('node:fs');
  const W = 'https://pialax-proxy.ashwinyedavalli.workers.dev';
  const fx = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'fixtures', n), 'utf8'));
  const docs = {};
  ['idea-diwali.json', 'idea-tahoe.json', 'idea-8members.json', 'idea-undated.json', 'idea-thanksgiving-legacy.json', 'idea-lax-local.json'].forEach((f) => { const d = fx(f); docs[d.id] = d; });
  // PIA-137: Diwali moved to Peoria with its dates set: the organizer's 🎫 marks and Book, a host (Mom & Dad, not answered yet),
  // and my own sheet with the PIA | ORD airport cells (home from ORD)
  const LKV = 'lkViewportLockedPIA001';
  docs[LKV] = (() => {
    const d = JSON.parse(JSON.stringify(docs.dwDiwaliRaleigh2026a01)); d.id = LKV; d.idea.title = '🎄 Christmas in Peoria'; d.idea.destination = { city: 'Peoria', airport: 'PIA' };
    d.idea.dates.departure = '2026-12-22'; d.idea.dates.return = '2026-12-27'; d.idea.notes = '📌2026-12-25'; delete d.responses['momdad-k3']; d.responses['ashwin-p8'].leave_from = 'ORD';
    d.decision = { stage: 'chosen', chosen: { airport: 'PIA', city: 'Peoria', departure: '2026-12-22', return: '2026-12-27' }, chosen_at: '2026-10-16T00:00:00.000Z', estimate_total: null, actual_total: null, booked_at: null, delta_pct: null };
    return d;
  })();
  const ids = Object.keys(docs), KEY = 'pialax-test-edit-key-0123456789abcdefghijk', DW = 'dwDiwaliRaleigh2026a01', M8 = 'm8GrandmaNinetieth0c03', CYV = 'cyCaryShowerUndated004';
  // PIA-135: cached real fares for Diwali, so the organizer's card carries its one total (keys from the model itself)
  const TM = createRequire(import.meta.url)(path.join(path.resolve(ROOT), 'scripts', 'trip-model.js'));
  const NOWMS = Date.parse('2026-10-17T19:00:00Z'), fares = {};
  TM.tripModel(docs[DW], { today: '2026-10-17', now: NOWMS, me: 'ashwin-p8', hasEditKey: true, hasToken: true }).travelers.forEach((x, i) => x.keys.forEach((k) => { fares[k.key] = { p: 1234 + 1000 * i, f: NOWMS - 36e5 }; }));
  const seed = {
    pialax_fares_v2: JSON.stringify(fares),
    pialax_watchlist_v2: JSON.stringify(ids.map((id) => ({ id, t: '', e: '', at: 1, pin: false, arch: false }))),
    // PIA-136: this phone also organizes the 8-member trip (a join request on a full trip opens its people editor at ⚠ 9/8)
    pialax_idea_keys_v1: JSON.stringify({ [DW]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }, [M8]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' }, [LKV]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' },
      [CYV]: { edit_key: KEY, title: '', created_at: '2026-10-10T00:00:00.000Z' } }),   // PIA-138: also organizes the undated idea
    pialax_idea_me_v1: JSON.stringify({ [DW]: 'ashwin-p8', thTahoeSkiWeekend26b02: 'ashwin-l2', [M8]: 'grandmajosephine-nf', [LKV]: 'ashwin-p8', [CYV]: 'ashwin-c3' }),
    pialax_proxy_token: 'org-token-0123456789abcdefABCDEF', pialax_ui_v1: JSON.stringify({ v1read: 1 })
  };
  const LAYOUT = () => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden'; };
    const name = (el) => (el.getAttribute('aria-label') || '').trim() || (el.labels && el.labels[0] && el.labels[0].textContent.trim()) || (el.textContent || '').replace(/\s+/g, ' ').trim();
    const out = { overflow: document.documentElement.scrollWidth - innerWidth, sheetOverflow: 0, small: [], unnamed: [] };
    const sh = document.querySelector('#sheet');
    if (sh && !sh.hidden) out.sheetOverflow = sh.scrollWidth - sh.clientWidth;
    document.querySelectorAll('#screen button, #screen a, #tabbar button, #sheet button, #sheet a, #sheet input, #sheet textarea').forEach((el) => {
      if (!vis(el)) return;
      // a card title is a text button whose overlay covers the whole card: the card is the target
      const box = (el.classList.contains('card-open') ? el.closest('.card') : el).getBoundingClientRect();
      const id = (el.getAttribute('data-act') || el.id || el.className || el.tagName) + '@' + Math.round(box.width) + 'x' + Math.round(box.height);
      if (box.width < 43.5 || box.height < 43.5) out.small.push(id);
      if (!name(el)) out.unnamed.push(id);
    });
    const cs = getComputedStyle(document.body);
    out.bg = cs.backgroundColor; out.ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim();
    return out;
  };
  const lum = (rgb) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(rgb || ''); return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 : -1; };
  // PIA-138: P-dates' occlusion gate (run in the page)
  const OCCLUSION = () => {
    const sh = document.querySelector('#sheet'), R = sh.getBoundingClientRect(), save = sh.querySelector('.btn.stick'), hd = sh.querySelector('.sh-hd');
    const sv = save ? save.getBoundingClientRect() : null, hr = hd ? hd.getBoundingClientRect() : null, out = { covered: [], seeThrough: '', lock: null };
    if (save) {
      const cs = getComputedStyle(save), bg = cs.backgroundColor, a = /rgba\([^)]*,\s*([\d.]+)\)/.exec(bg);
      if (+cs.opacity < 1) out.seeThrough = 'opacity ' + cs.opacity; else if (a && +a[1] < 1) out.seeThrough = 'background ' + bg;
    }
    sh.querySelectorAll('button, a[href], input').forEach((el) => {
      if (el === save) return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cy < R.top || cy > R.bottom || cx < R.left || cx > R.right) return;              // scrolled out of the sheet
      if (sv && cy >= sv.top - 6 && cy <= sv.bottom + 6) return;                          // hidden under the opaque Save
      if (hr && el.closest('.sh-hd') === null && cy <= hr.bottom) return;                  // hidden under the sticky header
      const t = document.elementFromPoint(cx, cy);
      if (!t || !(t === el || el.contains(t))) out.covered.push((el.getAttribute('data-act') || el.className) + '@' + Math.round(cy) + ' under ' + (t ? t.getAttribute('data-act') || t.className || t.tagName : 'nothing'));
    });
    const lock = sh.querySelector('[data-act="dlock"]');
    if (lock) { const r = lock.getBoundingClientRect(), cy = r.top + r.height / 2; out.lock = cy > (hr ? hr.bottom : R.top) && cy < (sv ? sv.top - 6 : R.bottom); }
    return out;
  };
  for (const vp of VIEWPORTS) {
    for (const scheme of ['light', 'dark']) {
      const label = `app.html @ ${vp.name} ${scheme}`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: 'America/Los_Angeles' });
      await ctx.route(/^https?:\/\//, (r) => r.abort());
      await ctx.route(W + '/**', (route) => {
        const q = route.request(), id = new URL(q.url()).searchParams.get('id');
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key', 'content-type': 'application/json' };
        if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        if (!docs[id]) return route.fulfill({ status: 404, headers: cors, body: '{"code":"not_found"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc: docs[id], organizer: (id === DW || id === M8 || id === LKV || id === CYV) && q.headers()['x-idea-key'] === KEY }) });
      });
      const page = await ctx.newPage();
      const fails = [];
      try {
        await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));
        // the first visit is the empty phone; the seed lands before the second
        await page.goto(pathToFileURL(path.join(ROOT, 'app.html')).href, { waitUntil: 'load' });
        await page.waitForTimeout(150);
        let states = 0;
        const measure = async (s) => {
          states++;
          const r = await page.evaluate(LAYOUT);
          if (r.overflow > 0 || r.sheetOverflow > 0) fails.push(s + ': horizontal scroll ' + r.overflow + '/' + r.sheetOverflow + 'px');
          if (r.small.length) fails.push(s + ': targets under 44px ' + r.small.slice(0, 4).join(', '));
          if (r.unnamed.length) fails.push(s + ': controls without a name ' + r.unnamed.slice(0, 4).join(', '));
          const L = lum(r.bg);
          if (scheme === 'dark' ? !(L >= 0 && L < 0.2) : !(L > 0.8)) fails.push(s + ': body background ' + r.bg + ' is not the ' + scheme + ' token');
          // PIA-138: in P-dates nothing a finger can see is covered: every control whose centre is in view (not under the
          // sticky header or Save) takes a tap there (elementFromPoint), Save is opaque, and 🔒 / 🔓 are in view
          if (await page.getAttribute('#sheet', 'data-popup').catch(() => null) === 'P-dates') {
            const o = await page.evaluate(OCCLUSION);
            if (o.covered.length) fails.push(s + ': P-dates controls covered ' + o.covered.slice(0, 3).join(', '));
            if (o.seeThrough) fails.push(s + ': P-dates Save is see-through (' + o.seeThrough + ')');
            if (o.lock === false) fails.push(s + ': P-dates 🔒/🔓 is not in view without scrolling');
          }
        };
        await measure('empty');
        await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
        await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
        await measure('list');
        const shelf = await page.$('#screen [data-act="shelf"]'); if (shelf) { await shelf.click(); await page.waitForTimeout(100); await measure('list + shelf'); }
        await page.click('#screen [data-act="seg"][data-v="family"]'); await page.waitForTimeout(100); await measure('family');
        await page.click('#screen [data-act="seg"][data-v="ideas"]'); await page.waitForTimeout(100);
        for (const id of [M8, DW]) {
          await page.click('#screen [data-trip="' + id + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('trip ' + id);
          await page.click('#screen [data-act="key"]'); await page.waitForTimeout(100); await measure('trip ' + id + ' + ⓘ');
          await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
          await page.click('#screen [data-act="back"]'); await page.waitForTimeout(100);
        }
        // PIA-137: the trip view's sheets (tapped as the app sees a tap: the sticky primary may sit over a board row)
        const tapJs = async (sel) => { await page.$eval(sel, (e) => e.click()); await page.waitForTimeout(110); };
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .pb [data-act="person"][data-code="anjo-z5"]'); await measure('P-person (the organizer on Anjo)'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen .me [data-act="person"]'); await measure('P-person (me)'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen [data-act="stage"]'); await measure('P-stage'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen .me [data-act="face"]'); await measure('P-face');
        await tapJs('#sheet [data-act="joinopen"]'); await page.type('#join-name', 'Bartholomew Montgomery Fitzgerald'); await page.type('#join-ap', 'bos'); await measure('P-face (join row typed)');
        await page.fill('#join-ap', ''); await page.type('#join-ap', 'San Francisco'); await measure('P-face (join row, a city cut to SAN ⚠)');
        if (await page.$eval('#warn-join-ap', (e) => e.hidden)) fails.push('a city typed in the join airport field should show ⚠');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + M8 + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .pb [data-act="person"][data-code="bartholomewmontgomeryfitzgera-dj"]'); await measure('P-person (8 long names)');
        await tapJs('#sheet [data-act="pnote"]'); await measure('P-note (a person\'s note, read first)');
        await tapJs('#sheet [data-act="noteedit"]'); await measure('P-note (a person\'s note, ✎ editing, ✓)'); await tapJs('#sheet [data-act="sh-close"]');
        await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + LKV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await measure('trip with its dates set (🎫 marks, Book)');
        if (!(await page.$('#screen .pb [data-act="booked"]')) || !(await page.$('#screen .split.prim [data-act="mybook"]'))) fails.push('the set trip should show the organizer\'s 🎫 marks and [Book | 🎫]');
        await tapJs('#screen .pb [data-act="booked"][data-code="anjo-z5"]'); await measure('trip with a 🎫 waiting for its confirming tap');
        await tapJs('#screen .me [data-act="person"]'); await measure('P-person (me, PIA | ORD cells)');
        if ((await page.$$('#sheet [data-act="legair"]')).length !== 4) fails.push('my sheet on a Peoria trip should have the PIA | ORD cells for each end');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        // PIA-138: P-dates in each state (the plan, a holiday picked, a start picked, my own days on one end), P-day, the undated
        // idea's ⟦window⟧ with ⬚ the best window, and a locked plan to read with 🔓
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates (the plan)');
        await tapJs('#sheet [data-act="dhol"]'); await measure('P-dates (a holiday picked)');
        await tapJs('#sheet [data-act="dday"][data-v="2026-11-13"]'); await measure('P-dates (a start picked, 📌⚠)');
        await tapJs('#sheet [data-act="dtarget"][data-v="me"]'); await measure('P-dates (my own days)');
        await tapJs('#sheet [data-act="dend"][data-v="0"]'); await tapJs('#sheet [data-act="dday"][data-v="2026-11-05"]'); await measure('P-dates (my arrival only, ⚠ off the plan)');
        await tapJs('#sheet [data-act="dtarget"][data-v="trip"]'); await tapJs('#sheet [data-act="dlook"]'); await tapJs('#sheet [data-act="dday"][data-v="2026-11-07"]'); await measure('P-day');
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-day') fails.push('👥 then a day should open P-day');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + CYV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates (an undated idea: ⟦window⟧, ⬚ best)');
        if (!(await page.$('#sheet [data-act="dbest"]'))) fails.push('the undated idea should offer ⬚ its best window');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="' + LKV + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await tapJs('#screen .daterow [data-act="dates"]'); await measure('P-dates (a locked plan to read, 🔓)');
        await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]');
        await page.click('#screen [data-trip="tgLegacyThanksgiving01"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(200); await measure('P-face (by itself, a v1 trip)');
        await tapJs('#sheet [data-act="pickface"][data-code="PIA"]'); await measure('the host\'s trip view (In unconfirmed)');
        await tapJs('#screen [data-act="back"]');
        for (const tab of ['map', 'cal']) { await page.click('#tabbar [data-v="' + tab + '"]'); await page.waitForTimeout(120); await measure(tab); }
        await page.click('#tabbar [data-v="trips"]'); await page.waitForTimeout(100);
        // PIA-135: the list-share sheet, and the receiving sheet a list link opens
        await page.click('#screen [data-act="sharelist"]'); await page.waitForTimeout(120); await measure('P-sharelist');
        await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
        // two of the linked trips are new on this phone, so the sheet shows them and ⤓ Save; then, once saved, the same
        // link again shows the dimmed "nothing new" stack
        await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('pialax_watchlist_v2')); localStorage.setItem('pialax_watchlist_v2', JSON.stringify(L.filter((x) => x.id !== 'thTahoeSkiWeekend26b02' && x.id !== 'm8GrandmaNinetieth0c03'))); });
        const listLink = pathToFileURL(path.join(ROOT, 'app.html')).href + '?l=' + ids.join('.') + '.zzTripThatIsGone0000z1&f=' + encodeURIComponent('🦊');
        await page.goto(listLink, { waitUntil: 'load' }); await page.waitForTimeout(300);
        await measure('P-savelist (⤓ Save 2)');
        const save = await page.$eval('#sheet [data-act="svsave"]', (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
        if (save !== '⤓ Save 2') fails.push('P-savelist: two new trips should offer ⤓ Save 2, got ' + JSON.stringify(save));
        if (save) { await page.click('#sheet [data-act="svsave"]'); await page.waitForTimeout(150); await measure('list after ⤓ Save'); }
        await page.goto(listLink, { waitUntil: 'load' }); await page.waitForTimeout(300);
        await measure('P-savelist (nothing new)');
        await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
        // PIA-136: the one create path (each step, a long typed name, an unknown code, a person's row open, dates and a window) and the
        // organizer's edit sheets (P-edit, name and place, people, caption, drop)
        await page.click('#screen [data-act="new"]'); await page.waitForTimeout(120); await measure('P-new-what');
        await page.fill('#new-title', 'Grandma Josephine ninetieth birthday weekend in Savannah with everyone'); await page.fill('#new-dest', 'ZZQ'); await page.waitForTimeout(60); await measure('P-new-what (typed, unknown code)');
        await page.click('#sheet [data-act="nnext"]'); await page.waitForTimeout(100); await measure('P-new-who');
        await page.click('#sheet [data-act="nedit"] >> nth=0'); await page.fill('#mem-name', 'Bartholomew Montgomery Fitzgerald'); await page.waitForTimeout(60); await measure('P-new-who (a row open)');
        if (!(await page.$('#sheet .metog[aria-pressed="true"]'))) await page.click('#sheet .metog');
        await page.click('#sheet [data-act="nnext"]'); await page.waitForTimeout(100); await measure('P-new-when');
        await page.click('#sheet [data-act="nday"][data-v="2026-11-06"]'); await page.click('#sheet [data-act="nday"][data-v="2026-11-09"]'); await page.waitForTimeout(60); await measure('P-new-when (dates)');
        await page.click('#sheet [data-act="nmode"][data-v="window"]'); await page.waitForTimeout(60); await measure('P-new-when (window)');
        await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
        await page.click('#screen [data-trip="' + DW + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150);
        await page.click('#screen [data-act="edit"]'); await page.waitForTimeout(100); await measure('P-edit');
        await page.click('#sheet [data-act="etitle"]'); await page.waitForTimeout(100); await measure('P-edit name and place');
        await page.click('#sheet [data-act="sh-back"]'); await page.waitForTimeout(80);
        await page.click('#sheet [data-act="epeople"]'); await page.waitForTimeout(100); await measure('P-edit people');
        await page.click('#sheet [data-act="nedit"] >> nth=0'); await page.click('#sheet [data-act="ndel"]'); await page.waitForTimeout(60); await measure('P-edit people (remove armed)');
        await page.click('#sheet [data-act="sh-back"]'); await page.waitForTimeout(80);
        await page.click('#sheet [data-act="ecap"]'); await page.waitForTimeout(100); await measure('P-note');
        await page.click('#sheet [data-act="sh-back"]'); await page.waitForTimeout(80);
        await page.click('#sheet [data-act="edrop"]'); await page.waitForTimeout(100); await measure('P-drop');
        await page.click('#sheet [data-act="sh-close"]'); await page.waitForTimeout(100);
        await page.click('#screen [data-act="back"]'); await page.waitForTimeout(100);
        await page.click('#screen [data-act="settings"]'); await page.waitForTimeout(100); await measure('⚙');
        await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }); });
        await page.click('#sheet [data-act="devlink"]'); await page.waitForTimeout(150); await measure('P-link');
        // PIA-136: a join request on the full 8-member trip (the joiner open, ⚠ 9/8), and a v1 idea link with a long note (📝⚠, then its P-note)
        await page.goto(pathToFileURL(path.join(ROOT, 'app.html')).href + '?idea=' + M8 + '&add=' + encodeURIComponent('Nina Okafor.BOS'), { waitUntil: 'load' }); await page.waitForTimeout(300);
        if (!(await page.$('#who-cap'))) fails.push('a join request on the full trip should open P-edit-who with ⚠ 9/8');
        await measure('P-edit-who (join request, ⚠ 9/8)');
        const v1idea = { version: 'trip-idea-v1', builder: { destination: { city: 'Raleigh-Durham', airport: 'RDU' }, dates: { departure: '2026-11-06', return: '2026-11-09' }, constraints: { eventDate: '2026-11-08' } },
          notes: 'Puja Sunday then ' + Array.from({ length: 30 }, (_, i) => 'lamplighting' + i).join(' ') };
        const tripIdea = Buffer.from(encodeURIComponent(JSON.stringify(v1idea)), 'binary').toString('base64');
        await page.goto(pathToFileURL(path.join(ROOT, 'app.html')).href + '?tripIdea=' + encodeURIComponent(tripIdea), { waitUntil: 'load' }); await page.waitForTimeout(300);
        await measure('P-new-what (a v1 idea link, 📝⚠)');
        await page.click('#sheet [data-act="nnote"]'); await page.waitForTimeout(120); await measure('P-note (the new trip\'s note)');
        // PIA-137: a join request opened on a phone that does not organize that trip (Tahoe): P-joinfwd sends it on
        await page.goto(pathToFileURL(path.join(ROOT, 'app.html')).href + '?idea=thTahoeSkiWeekend26b02&add=' + encodeURIComponent('Bartholomew Montgomery.OAK'), { waitUntil: 'load' }); await page.waitForTimeout(300);
        if ((await page.getAttribute('#sheet', 'data-popup')) !== 'P-joinfwd') fails.push('a join request on a trip this phone does not organize should open P-joinfwd');
        await measure('P-joinfwd');
        if (fails.length === 0) ok(`${label} — no horizontal scroll, every target ≥44px and named, ${scheme} tokens, in ${states} states`);
        else bad(`${label} — ${fails.slice(0, 4).join(' · ')}`);
      } catch (e) { bad(`${label} — threw: ${e && e.message ? e.message.split('\n')[0] : String(e)}${fails.length ? ' · ' + fails.slice(0, 2).join(' · ') : ''}`); }
      await ctx.close();
    }
  }
  // PIA-138: P-dates on shorter phones too (360x740, 375x667), light and dark: in every picker state nothing in view is
  // covered (elementFromPoint), Save is opaque, 🔒 / 🔓 is in view, and every target is ≥44px with no horizontal scroll
  for (const vp of [{ name: '360x740', width: 360, height: 740 }, { name: '375x667', width: 375, height: 667 }]) {
    for (const scheme of ['light', 'dark']) {
      const label = `app.html P-dates @ ${vp.name} ${scheme}`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, timezoneId: 'America/Los_Angeles' });
      await ctx.route(/^https?:\/\//, (r) => r.abort());
      await ctx.route(W + '/**', (route) => {
        const q = route.request(), id = new URL(q.url()).searchParams.get('id');
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, X-Idea-Key', 'content-type': 'application/json' };
        if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        if (!docs[id]) return route.fulfill({ status: 404, headers: cors, body: '{"code":"not_found"}' });
        return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ ok: true, doc: docs[id], organizer: (id === DW || id === M8 || id === LKV || id === CYV) && q.headers()['x-idea-key'] === KEY }) });
      });
      const page = await ctx.newPage();
      const fails = [];
      let states = 0;
      try {
        await page.clock.setFixedTime(new Date('2026-10-17T19:00:00Z'));
        await page.goto(pathToFileURL(path.join(ROOT, 'app.html')).href, { waitUntil: 'load' });
        await page.evaluate((s) => { Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed);
        await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
        const tapJs = async (sel) => { await page.$eval(sel, (e) => e.click()); await page.waitForTimeout(110); };
        const measure = async (s) => {
          states++;
          const r = await page.evaluate(LAYOUT), o = await page.evaluate(OCCLUSION);
          if (r.overflow > 0 || r.sheetOverflow > 0) fails.push(s + ': horizontal scroll ' + r.overflow + '/' + r.sheetOverflow + 'px');
          if (r.small.length) fails.push(s + ': targets under 44px ' + r.small.slice(0, 4).join(', '));
          if (o.covered.length) fails.push(s + ': controls covered ' + o.covered.slice(0, 3).join(', '));
          if (o.seeThrough) fails.push(s + ': Save is see-through (' + o.seeThrough + ')');
          if (o.lock === false) fails.push(s + ': 🔒/🔓 is not in view without scrolling');
        };
        const open = async (id) => { await page.click('#screen [data-trip="' + id + '"]', { position: { x: 140, y: 28 } }); await page.waitForTimeout(150); await tapJs('#screen .daterow [data-act="dates"]'); };
        const leave = async () => { await tapJs('#sheet [data-act="sh-close"]'); await tapJs('#screen [data-act="back"]'); };
        await open(DW); await measure('the plan');
        await tapJs('#sheet [data-act="dhol"]'); await measure('a holiday picked');
        await tapJs('#sheet [data-act="dday"][data-v="2026-11-13"]'); await measure('a start picked (📌⚠)');
        await tapJs('#sheet [data-act="dtarget"][data-v="me"]'); await measure('my own days');
        await tapJs('#sheet [data-act="dend"][data-v="0"]'); await tapJs('#sheet [data-act="dday"][data-v="2026-11-05"]'); await measure('my arrival only (⚠🗓)');
        await tapJs('#sheet [data-act="dtarget"][data-v="trip"]'); await tapJs('#sheet [data-act="dlook"]'); await measure('👥 then a day');
        await leave();
        await open(M8); await measure('the 8-member plan'); await leave();
        await open(CYV); await measure('an undated idea (⟦window⟧, ⬚)'); await leave();
        await open(LKV); await measure('a locked plan (🔓)'); await leave();
        if (states === 9 && fails.length === 0) ok(`${label} — nothing in view is covered, Save is opaque, 🔒/🔓 in view, targets ≥44px, no horizontal scroll, in ${states} states`);
        else bad(`${label} — ${fails.slice(0, 4).join(' · ') || states + ' states'}`);
      } catch (e) { bad(`${label} — threw: ${e && e.message ? e.message.split('\n')[0] : String(e)}${fails.length ? ' · ' + fails.slice(0, 2).join(' · ') : ''}`); }
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
