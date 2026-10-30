// VELSCOUR DEFENSE frame cost on a phone: an iPhone-sized touch screen (844x390 landscape or 390x844 portrait, DPR 3),
// the CPU slowed (default 4x), a stage fought on auto at 2x speed. Prints fps, ms per frame in the sim (battle steps),
// the view's update and draw, the worst frame, and the top self-time functions of a CPU profile.
// Serve the repo root first (python -m http.server 8317), then:
//   NODE_PATH=<global node_modules> node defense/tests/perf.js [stages,comma] [portrait|landscape] [throttle] [secs]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8317';
const stages = (process.argv[2] || '5,62,148,230,296').split(',').map(Number);
const orient = process.argv[3] || 'landscape', rate = +(process.argv[4] || 4), secs = +(process.argv[5] || 6);
const VP = orient === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };
const CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });

(async () => {
  const args = (process.env.CHROMIUM_ARGS || '').split(' ').filter(Boolean);
  const browser = await chromium.launch(fs.existsSync(CHROMIUM) ? { executablePath: CHROMIUM, args } : { args });
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.removeItem('velscour_defense_v1'); } catch { /* */ } });
  await page.goto(BASE + '/defense/index.html');
  await page.waitForFunction(() => window.VDEF && !document.getElementById('loading'), null, { timeout: 30000 });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  const hot = {};
  for (const n of stages) {
    // a Commander at the stage with a full squad of well-levelled heroes, auto-battle on at 2x; the dialogs skipped
    await page.evaluate(async (n) => {
      const { D } = window.VDEF, g = await import('/defense/src/meta/gacha.js');
      Object.assign(D.save, { frontier: n, gold: 9e9, shards: 1e6, essence: 1e5 });
      D.save.settings.autoBattle = true; D.save.settings.speed = 2; D.save.settings.skipDialogs = true;
      for (let i = 0; i < 6; i++) g.openPack(D.save, g.PACK_BY_ID.heroes, true);
      const b = await import('/defense/src/ui/battle.js');
      b.playStage(n, { auto: true });
    }, n);
    await page.waitForFunction(() => { const c = window.VDEF.ctl(); return !!c && !c.paused; }, null, { timeout: 30000 });
    await page.waitForTimeout(8000);   // the first waves on the field
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await cdp.send('Profiler.start');
    const r = await page.evaluate((secs) => new Promise(async (res) => {
      const c = window.VDEF.ctl(), v = c.view, b = c.b, s = { sim: 0, upd: 0, draw: 0, n: 0, worst: 0 }, step = b.step, upd = v.update, dr = v.draw;
      b.step = function (...a) { const t = performance.now(); const r = step.apply(this, a); s.sim += performance.now() - t; return r; };
      v.update = function (...a) { const t = performance.now(); upd.apply(this, a); s.upd += performance.now() - t; };
      v.draw = function (...a) { const t = performance.now(); dr.apply(this, a); const d = performance.now() - t; s.draw += d; s.worst = Math.max(s.worst, d); s.n++; };
      const t0 = performance.now();
      setTimeout(() => { delete b.step; delete v.update; delete v.draw; res({ fps: s.n / ((performance.now() - t0) / 1000), sim: s.sim / s.n, upd: s.upd / s.n, draw: s.draw / s.n, worst: s.worst, mobs: b.monsters.length, units: b.units.length, cols: v.dress.cols.length, theme: v.themeId }); }, secs * 1000);
    }), secs);
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const self = {}, byId = {};
    profile.nodes.forEach((x) => { byId[x.id] = x; });
    profile.samples.forEach((id, i) => { const f = byId[id].callFrame, k = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; self[k] = (self[k] || 0) + (profile.timeDeltas[i] || 0); });
    const tot = Object.values(self).reduce((a, b) => a + b, 0);
    const top = Object.entries(self).filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 8);
    top.forEach(([k, v]) => { hot[k] = (hot[k] || 0) + v / tot; });
    console.log(`stage ${String(n).padEnd(4)} ${r.theme.padEnd(10)} ${r.fps.toFixed(1).padStart(5)} fps  sim ${r.sim.toFixed(2).padStart(5)}  upd ${r.upd.toFixed(2).padStart(5)}  draw ${r.draw.toFixed(2).padStart(6)}  worst ${r.worst.toFixed(1).padStart(5)}  foes ${r.mobs} heroes ${r.units} cols ${r.cols}`);
    console.log('   ' + top.map(([k, v]) => `${(100 * v / tot).toFixed(1)}% ${k}`).join('\n   '));
    await page.screenshot({ path: path.join(__dirname, 'out', `perf_${orient}_${n}.png`) });
    await page.evaluate(async () => { const b = await import('/defense/src/ui/battle.js'); b.leaveBattle(); window.VDEF.show('hub'); });
  }
  console.log('\nHOT ACROSS STAGES:\n' + Object.entries(hot).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `  ${(100 * v / stages.length).toFixed(1)}% ${k}`).join('\n'));
  console.log(errors.length ? errors.slice(0, 20).join('\n') : 'NO ERRORS');
  if (errors.length) process.exitCode = 1;
  await browser.close();
})();
