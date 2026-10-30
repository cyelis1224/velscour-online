// Background play: the game (and auto-play) keeps running while its window is hidden (minimised, behind other
// windows, a locked PC). Playwright pins its pages visible and turns background throttling off, so this drives a plain
// Chromium over the DevTools protocol instead, its window placed off-screen: Chromium counts the page as hidden (no
// animation frames, timers throttled to once a second). The five-minute grace before intensive throttling (chained
// timers woken once a minute) is cut to 10 s, so the worst case shows at once. Needs a desktop (xvfb-run on Linux).
//   node tools/tests/background.js [class] [seconds]     # default paladin, 120 s hidden
// Passes when the game clock keeps up with real time, auto-play kills things and makes a portal trip while hidden, and
// once the page shows again (focus emulation) the game draws again at the 30 fps cap it ran with.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { BASE_URL } = require('./harness');

const cls = process.argv[2] || 'paladin';
const secs = +(process.argv[3] || 120);
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const exe = fs.existsSync(CHROMIUM_PATH) ? CHROMIUM_PATH : chromium.executablePath();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdp(url, onEvent) {
  const ws = new WebSocket(url), wait = {};
  let id = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && wait[m.id]) { wait[m.id](m); delete wait[m.id]; } else if (m.method && onEvent) onEvent(m);
  };
  return {
    ready: new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; }),
    send: (method, params = {}) => new Promise((ok, no) => {
      const i = ++id;
      wait[i] = (m) => (m.error ? no(new Error(`${method}: ${m.error.message}`)) : ok(m.result));
      ws.send(JSON.stringify({ id: i, method, params }));
    }),
    close: () => ws.close(),
  };
}

(async () => {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'velscour-bg-'));
  const proc = spawn(exe, ['--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check',
    '--window-position=-32000,-32000', '--window-size=1280,720', '--enable-features=IntensiveWakeUpThrottling:grace_period_seconds/10',
    'about:blank'], { stdio: 'ignore' });
  const errors = [];
  let pg, br;
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      try { port = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (e) { await sleep(100); }
    }
    if (!port) throw new Error('Chromium did not open its DevTools port');
    const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    const tgt = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    pg = cdp(tgt.webSocketDebuggerUrl, (m) => {
      if (m.method === 'Runtime.exceptionThrown') errors.push('[pageerror] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n').slice(0, 3).join(' | '));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('[console] ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
    });
    br = cdp(ver.webSocketDebuggerUrl);
    await pg.ready; await br.ready;
    await pg.send('Runtime.enable');
    await pg.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.VELSCOUR_TEST_MENU = true;' });
    const ev = async (fn, arg) => {
      const r = await pg.send('Runtime.evaluate', { expression: `(${fn})(${JSON.stringify(arg)})`, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await pg.send('Page.navigate', { url: BASE_URL + '/index.html' });
    for (let i = 0; ; i++) {
      if (await ev(() => !!(window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'))).catch(() => false)) break;
      if (i > 120) throw new Error('the game did not finish loading');
      await sleep(500);
    }
    if (await ev(() => document.visibilityState) !== 'hidden') {
      const { windowId } = await br.send('Browser.getWindowForTarget', { targetId: tgt.id });
      await br.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await sleep(1000);
    }
    if (await ev(() => document.visibilityState) !== 'hidden') throw new Error('could not hide the window (off-screen or minimised)');
    await ev(async (cls) => {
      const { G, game } = window.VELSCOUR;
      await game.newChar(cls, 'Sleepwalker');
      G.settings.fpsCap = 30;   // the cap skips frames by the game clock, which the hidden-page ticker also moves
      const { Auto } = await import('/src/game/autoplay.js');
      Auto.toggle(true);
      // a chained page timer, to show how hard this page is throttled: wakes are counted, not steps
      window.bgProbe = { wakes: 0, frames: 0, dungeons: 0, draws: 0 };
      const render = game.render;
      game.render = function (...a) { window.bgProbe.draws++; return render.apply(this, a); };
      (function chain() { window.bgProbe.wakes++; setTimeout(chain, 50); })();
      (function frame() { window.bgProbe.frames++; requestAnimationFrame(frame); })();
      const build = game.buildDungeon;
      game.buildDungeon = function (...a) { window.bgProbe.dungeons++; return build.apply(this, a); };
    }, cls);
    const sample = () => ev(() => {
      const { G } = window.VELSCOUR, c = G.char, w = G.world, b = window.bgProbe;
      return { vis: document.visibilityState, now: performance.now(), gt: G.time, where: w ? (w.kind === 'town' ? 'town' : `D${w.depth}`) : '-',
        depth: c.depth, lvl: c.level, kills: c.kills || 0, deaths: c.deaths || 0, gold: c.gold, wakes: b.wakes, frames: b.frames, dungeons: b.dungeons, draws: b.draws,
        status: (document.getElementById('auto-status')?.textContent || '').replace('AUTO · ', '') };
    });
    const s0 = await sample();
    let prev = s0, last = s0, visible = 0;
    const step = 15;
    for (let t = step; t <= secs; t += step) {
      await sleep(step * 1000);
      const s = await sample();
      const rate = (s.gt - prev.gt) / ((s.now - prev.now) / 1000);
      if (s.vis !== 'hidden') visible++;
      console.log(`[${t}s ${s.vis}] game clock x${rate.toFixed(2)} | page timer wakes ${s.wakes - prev.wakes}, frames ${s.frames - prev.frames} | ${s.where} depth=${s.depth} lvl=${s.lvl} kills=${s.kills} deaths=${s.deaths} gold=${s.gold} | ${s.status}`);
      prev = last = s;
    }
    const rate = (last.gt - s0.gt) / ((last.now - s0.now) / 1000);
    console.log(`hidden ${Math.round((last.now - s0.now) / 1000)} s: game clock ran ${(last.gt - s0.gt).toFixed(1)} s (x${rate.toFixed(2)}), kills ${s0.kills} -> ${last.kills}, level ${s0.lvl} -> ${last.lvl}, levels built ${last.dungeons}`);
    if (visible) errors.push(`FAIL: the page was visible in ${visible} samples, so this run proves nothing about hidden play`);
    if (rate < 0.9) errors.push(`FAIL: the game clock ran at x${rate.toFixed(2)} of real time while hidden`);
    if (last.kills <= s0.kills) errors.push('FAIL: auto-play killed nothing while hidden');
    if (!last.dungeons) errors.push('FAIL: auto-play never got through the portal while hidden');
    // back to the window: focus emulation makes the page visible, so frames (and the cap) take over from the ticker
    await pg.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await sleep(1000);
    const b0 = await sample();
    await sleep(5000);
    const b1 = await sample(), secsBack = (b1.now - b0.now) / 1000;
    const drawRate = (b1.draws - b0.draws) / secsBack, backRate = (b1.gt - b0.gt) / secsBack;
    console.log(`[back ${b1.vis}] game clock x${backRate.toFixed(2)} | draws ${drawRate.toFixed(1)}/s (cap 30) | ${b1.where} kills=${b1.kills} | ${b1.status}`);
    if (b1.vis !== 'visible') console.log('(could not show the page again, so the return to the window was not checked)');
    else {
      if (drawRate < 20 || drawRate > 32) errors.push(`FAIL: back on a visible page the game drew ${drawRate.toFixed(1)} frames a second at a 30 fps cap`);
      if (backRate < 0.9 || backRate > 1.1) errors.push(`FAIL: back on a visible page the game clock ran at x${backRate.toFixed(2)}`);
    }
  } catch (e) {
    errors.push(String(e.stack || e));
  } finally {
    if (errors.length) { console.log(errors.slice(0, 30).join('\n')); process.exitCode = 1; } else console.log('NO ERRORS');
    await br?.send('Browser.close').catch(() => {});
    pg?.close(); br?.close();
    await Promise.race([new Promise((r) => proc.once('exit', r)), sleep(3000)]);
    try { proc.kill(); } catch (e) { /* gone */ }
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) { /* Chromium may still hold a lock */ }
  }
})();
