// CPU cost of the game logic (game.update) per map and mode on a phone: 844x390 touch, the CPU slowed (default 4x),
// auto-play running. The draw is left out of the totals on purpose: headless Chromium has no GPU here, so what canvas
// and WebGL calls cost says little about a phone, but what the script does in update is the same on every device.
// Prints per mode the ms per frame in update (and in render's own script, canvas calls excluded), then the functions
// that cost the most inside update (inclusive and self time).
// Usage: node tools/tests/mode_cpu.js [modes,comma] [secs] [throttle] [depth]
//   modes: town, a biome id (catacombs, castle, sea_of_sand, dark_forest, mountainside, skyship, serpentine_tower,
//   depths_edge, overworld...), breach, rift, raid (a depth 30 BOSS ROOM), velscour (his throne fight), unbound
//   (Velscour Unbound); 'dungeons': every dungeon biome; default: a sample of every kind of map
//   PHONE=portrait: an upright phone (390x844) instead of 844x390
const { openGame, report } = require('./harness');
const DEF = 'town,catacombs,overworld,castle,sea_of_sand,dark_forest,mountainside,skyship,serpentine_tower,depths_edge,breach,rift';
let modes = (process.argv[2] || DEF).split(',').filter(Boolean);
const VP = process.env.PHONE === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 };
const secs = +(process.argv[3] || 6), rate = +(process.argv[4] || 4), depth = +(process.argv[5] || 24);

(async () => {
  const { browser, ctx, page, errors } = await openGame({ ...VP, mobile: true });
  if (modes.includes('dungeons')) {
    const ids = await page.evaluate(async () => (await import('/src/data/biomes.js')).BIOMES.filter((b) => !b.overworld && !b.challenge && b.id !== 'throne').map((b) => b.id));
    modes = modes.flatMap((m) => (m === 'dungeons' ? ids : [m]));
  }
  await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('wizard', 'Cpu');
    document.querySelectorAll('.screen').forEach((s) => s.remove());
    G.ui.modalCount = 0; G.godMode = true;
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  const summary = [];
  for (const mode of modes) {
    const ok = await page.evaluate(async ([mode, depth]) => {
      const { G, game } = window.VELSCOUR;
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      const { Auto } = await import('/src/game/autoplay.js');
      if (Auto.on) Auto.toggle(false);
      G.char.depth = depth;
      const until = (f) => new Promise((res) => { const t0 = performance.now(), k = () => (f() || performance.now() - t0 > 60000 ? res() : setTimeout(k, 100)); setTimeout(k, 200); });
      const loaded = () => document.querySelector('#loading').classList.contains('hidden');
      if (mode === 'town') game.enterTown();
      else if (mode === 'breach') { G.char.breach ||= { best: 0, cleared: {} }; G.char.breach.best = Math.max(G.char.breach.best, 5); game.enterBreach(6); await until(() => G.world.kind !== 'town' && loaded()); }
      else if (mode === 'rift') {
        const { endgame, saveEndgame } = await import('/src/game/endgame.js');
        endgame().unlocked = Date.now(); saveEndgame();
        game.enterRift(1); await until(() => G.world.rift && loaded());
      } else if (mode === 'raid') { game.enterTown(); await until(loaded); G.char.depth = 30; await game.teleportToBiome(BIOME_BY_ID.cathedral); }
      else if (mode === 'velscour') { game.enterTown(); await until(loaded); await game.finalBoss(); }
      else if (mode === 'unbound') {
        const E = await import('/src/game/endgame.js'); E.unlockEndgame();
        game.enterTown(); await until(loaded); Object.assign(G.char, { keys: 3, depth: 510, deepest: 509 }); G.char.unbound ||= { wins: 0, best: 0 };
        await game.enterUnbound();
      } else if (BIOME_BY_ID[mode]) { if (G.world.kind !== 'town') { game.enterTown(); await until(loaded); } G.char.depth = depth; await game.teleportToBiome(BIOME_BY_ID[mode]); }
      else return false;
      document.querySelectorAll('.screen').forEach((s) => s.remove());
      G.ui.modalCount = 0;
      Auto.toggle(true);
      return true;
    }, [mode, depth]).catch((e) => { console.log(mode, 'setup failed', e.message); return false; });
    if (!ok) { console.log(mode, ': unknown or failed'); continue; }
    await page.waitForTimeout(4000);   // auto-play gets going, the first foes wake
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await cdp.send('Profiler.start');
    const r = await page.evaluate((secs) => new Promise((res) => {
      const { G, game } = window.VELSCOUR, u = game.update, rd = game.render, s = { u: 0, r: 0, n: 0, nu: 0, worstU: 0 };
      game.update = function (dt) { const t = performance.now(); u.call(this, dt); const d = performance.now() - t; s.u += d; s.nu++; s.worstU = Math.max(s.worstU, d); };
      game.render = function () { const t = performance.now(); rd.call(this); s.r += performance.now() - t; s.n++; };
      const t0 = performance.now();
      setTimeout(() => { game.update = u; game.render = rd; const w = G.world; res({ fps: s.n / ((performance.now() - t0) / 1000), upd: s.u / Math.max(1, s.nu), worstU: s.worstU, rnd: s.r / Math.max(1, s.n), mobs: w.creatures.length, fx: (w.effects || []).length + (w.projectiles || []).length, map: w.map.w + 'x' + w.map.h, kind: w.kind + (w.biome ? ':' + w.biome.id : '') }); }, secs * 1000);
    }), secs);
    const { profile } = await cdp.send('Profiler.stop');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    // walk each sample's stack: inside game.update? which functions (inclusive, self)? and render's script time
    const byId = {}, parent = {};
    profile.nodes.forEach((n) => { byId[n.id] = n; (n.children || []).forEach((c) => { parent[c] = n.id; }); });
    const name = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; };
    const isUpd = (n) => n.callFrame.functionName === 'update' && n.callFrame.url.endsWith('game/game.js');
    const isRnd = (n) => n.callFrame.functionName === 'render' && n.callFrame.url.endsWith('game/game.js');
    const incl = {}, self = {}, rself = {};
    let updT = 0, rndJs = 0, tot = 0;
    profile.samples.forEach((id, i) => {
      const dt = profile.timeDeltas[i] || 0, leaf = byId[id];
      tot += dt;
      const stack = [];
      for (let k = id; k !== undefined; k = parent[k]) stack.push(byId[k]);
      const ui = stack.findIndex(isUpd), ri = stack.findIndex(isRnd);
      if (ri >= 0 && leaf.callFrame.url) { rndJs += dt; rself[name(leaf)] = (rself[name(leaf)] || 0) + dt; }   // script time in render (canvas/WebGL calls have no url)
      if (ui < 0) return;
      updT += dt;
      self[name(leaf)] = (self[name(leaf)] || 0) + dt;
      const seen = new Set();
      for (let j = 0; j < ui; j++) { const k = name(stack[j]); if (!seen.has(k)) { seen.add(k); incl[k] = (incl[k] || 0) + dt; } }
    });
    const pct = (v) => (100 * v / Math.max(1, updT)).toFixed(1).padStart(5) + '%';
    const frames = r.fps * secs, rjs = rndJs / 1000 / Math.max(1, frames);
    console.log(`\n${mode.padEnd(17)} ${r.kind.padEnd(26)} upd ${r.upd.toFixed(2).padStart(6)} ms (worst ${r.worstU.toFixed(1)})  render script ${rjs.toFixed(2)} ms  fps ${r.fps.toFixed(1)}  mobs ${r.mobs} fx ${r.fx} map ${r.map}`);
    console.log('  inclusive in update:\n' + Object.entries(incl).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `    ${pct(v)} ${k}`).join('\n'));
    console.log('  self in update:\n' + Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `    ${pct(v)} ${k}`).join('\n'));
    console.log('  render script, self:\n' + Object.entries(rself).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `    ${(100 * v / Math.max(1, rndJs)).toFixed(1).padStart(5)}% ${k}`).join('\n'));
    summary.push(`${mode.padEnd(17)} upd ${r.upd.toFixed(2).padStart(6)} ms  worst ${r.worstU.toFixed(1).padStart(6)}  render script ${rjs.toFixed(2).padStart(5)} ms  mobs ${String(r.mobs).padStart(3)}  ${r.map}`);
  }
  console.log(`\nSUMMARY (${rate}x CPU throttle, ms per frame):\n` + summary.join('\n'));
  report(errors, 10);
  await browser.close();
})();
