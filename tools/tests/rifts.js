// Abyssal Rifts (docs/ENDGAME.md section 2: game/rifts.js, ui/rifts.js, data/rifts.js, game.buildRift/riftExit).
//   node tools/tests/rifts.js [town,run,end,auto,phone]      # all by default (~2 minutes)
// town: the rift gate in Herrington Hollow, sealed until Velscour falls, then lit; the tier dialog.
// run:  a rift built from a seed (G.riftSeed): a 4x4-chunk maze with a BOSS ROOM arena and no boss, no Heresies, its
//       monsters at riftLevel(T); the quota by weight (normal 1, champion 4, unique 8); the HUD bar; kills count; at the
//       quota the Guardian stirs in the arena (a BOSS ROOM boss, no repeat, c.lastRaid untouched) and the boss bar shows it;
//       the clock runs in game.update and stops while a menu is open; the 60/30/10 s warnings; Board.top's order and
//       the SDK's Timestamps.
// end:  the clock runs out (collapse: back in town 2.5 s later, no Defiance, c.rifts.fails), the town portal mid-rift (a
//       fail), death (no Defiance, the death screen names the tier), the win (time, tiers opened by the time, bests,
//       Marks, the Guardian's Abyssal prize and Sigils, the account's best, the exit, the results dialog, auto-play's exit).
// auto: auto-play in god mode from town (G.autoDest 'rift'): walks to the rift gate, enters riftTier(), meets the
//       quota, makes for the Guardian, kills it under the clock, takes the exit on to the next tier or home. Prints the
//       times (quota / to the arena / Guardian), which tools/tests/rift_balance.js is calibrated on.
// phone: the tier dialog, the HUD bar (alone, urgent, under the boss bar) and the results dialog at 844x390 (touch);
//       the HUD bar on a phone held upright (390x844).
// Screenshots: tools/tests/out/rift_*.png. The honour board (Firestore) is tested in tools/tests/cloud.js (scenario 16).
const { openGame, report } = require('./harness');
const parts = (process.argv[2] || 'town,run,end,auto,phone').split(',');
const SEED = 4242;

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const stepper = (page) => (s) => page.evaluate(async (s) => { const { G, game } = window.VELSCOUR; for (let t = 0; t < s * 30; t++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); if (t % 60 === 0) await new Promise((r) => setTimeout(r, 0)); } }, s);
const clean = (page) => page.evaluate(() => { const { G } = window.VELSCOUR; document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll(); });
// a hero of level H in gear of item level IL, the way tools/tests/endgame.js gears one (best of 150 drops, upgrades, gems, mastery)
const hero = (page, cls, H, IL, unlock = true) => page.evaluate(async ({ cls, H, IL, unlock }) => {
  const { G, game } = window.VELSCOUR;
  const { Auto, heroDamage } = await import('/src/game/autoplay.js');
  const { rollItem, rollGem } = await import('/src/data/items.js');
  const { endgame, saveEndgame, resetEndgameCache } = await import('/src/game/endgame.js');
  localStorage.removeItem('velscour_endgame_v1'); resetEndgameCache();
  if (unlock) { endgame().unlocked = Date.now(); saveEndgame(); }
  await game.newChar(cls, 'Rifter');
  document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
  const c = G.char, p = G.player;
  c.level = H; c.statPoints += (H - 1) * 5; c.skillPoints += (H - 1) + 499; c.depth = 501; c.deepest = 500;
  Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
  for (let round = 0; round < 6; round++) {
    c.bag = c.bag.map(() => null);
    for (let i = 0; i < 25 && i < c.bag.length; i++) { const it = rollItem(IL - Math.floor(Math.random() * 7), { mf: 60, bonus: Math.random() < 0.12 ? 1.2 : 0.15 }); it.unid = false; c.bag[i] = it; }
    p.recompute(); Auto.optimizeGear();
  }
  c.bag = c.bag.map(() => null);
  for (const it of Object.values(c.equip)) if (it && it.type === 'gear') {
    it.upg = Math.min(6, 2 + Math.floor(IL / 40));
    it.sockets = Math.max(it.sockets, Math.min(it.maxSockets, 2));
    while (it.gems.length < it.sockets) { const g = rollGem(IL); it.gems.push({ gem: g.gem, tier: g.tier }); }
  }
  c.bar.filter(Boolean).forEach((id, i) => { c.mastery[id] = [Math.max(1, Math.round(1000 * (i < 2 ? 1 : 0.55))), 0]; });
  Auto.spendSkills(); Auto.arrangeBar(); p.recompute(); p.hp = p.maxHp;
  c.potions.hp = 20; c.gold = 1e7;
  return { dps: heroDamage(p).dps, hp: p.maxHp };
}, { cls, H, IL, unlock });
// build a rift by hand (no loading screen): tier T, catacombs, a seed
const build = (page, T, seed = SEED) => page.evaluate(async ({ T, seed }) => {
  const { G, game } = window.VELSCOUR;
  const { BIOME_BY_ID } = await import('/src/data/biomes.js');
  G.riftSeed = seed; game.buildRift(T, BIOME_BY_ID.catacombs); delete G.riftSeed;
  document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
  const w = G.world, R = w.rift;
  return { tier: R.tier, quota: R.quota, total: R.total, limit: R.limit };
}, { T, seed });
const hud = (page) => page.evaluate(async () => { const { HUD } = await import('/src/ui/hud.js'); HUD.update(1 / 30); const b = document.querySelector('#rift-bar'); return { shown: !b.classList.contains('hidden'), urgent: b.classList.contains('urgent'), boss: b.classList.contains('boss'), text: b.textContent, fill: document.querySelector('#rift-fill').style.width, bossBar: !document.querySelector('#boss-bar').classList.contains('hidden'), bossName: document.querySelector('#boss-name').textContent }; });
// kill enemies by hand (weights: game/rifts.js) until pred() or none left
const killUntil = (page, what) => page.evaluate(async (what) => {
  const { G } = window.VELSCOUR, w = G.world, R = w.rift;
  const { kill } = await import('/src/game/combat.js');
  let n = 0;
  for (const m of w.creatures.filter((m) => m.team === 'enemy' && !m.dead && m !== R.guardian)) {
    if (what === 'quota' ? R.guardian : n >= what) break;
    kill(m, w.player); n++;
  }
  return { n, progress: R.progress, guardian: !!R.guardian };
}, what);

async function townPart(page, shot, step) {
  // sealed before Velscour falls
  await hero(page, 'wizard', 273, 263, false);
  const sealed = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR, w = G.world, g = w.portals.find((q) => q.rift);
    if (!g) return null;
    const [x, y] = w.map.randomNear(g.x + 1.5, g.y + 1.5, 1); G.player.x = x; G.player.y = y;
    return { label: g.label, active: g.active, dlg: !!game.confirmRift(), log: document.querySelector('#log')?.textContent.slice(-200) || '' };
  });
  check(sealed && !sealed.active && /sealed/.test(sealed.label) && !sealed.dlg, `the rift gate stands in town, sealed before Velscour falls (${sealed && sealed.label})`);
  await step(0.5); await page.waitForTimeout(2600); // the town's banner fades
  await shot('rift_gate_sealed');
  const lit = await page.evaluate(async () => {
    const { endgame, saveEndgame } = await import('/src/game/endgame.js');
    endgame().unlocked = Date.now(); saveEndgame();
    const { G, game } = window.VELSCOUR, g = G.world.portals.find((q) => q.rift);
    G.char.rifts.open = 7; G.char.rifts.bestTime[3] = 201.5; G.char.rifts.best = 6;
    return { label: g.label, active: g.active };
  });
  check(lit.active && lit.label === 'Abyssal Rift — Tier 7', `once Velscour falls the gate is lit (${lit.label})`);
  await step(0.5); await page.waitForTimeout(600);
  await shot('rift_gate_lit');
  await page.evaluate(() => window.VELSCOUR.G.world.portals.find((q) => q.rift).use());
  await page.waitForSelector('.rift-dialog #rift-pick');
  const dlg = await page.evaluate(() => { const s = document.querySelector('#rift-pick'); s.value = '7'; s.dispatchEvent(new Event('change')); return { n: s.options.length, first: s.options[0].textContent, t3: [...s.options].find((o) => o.value === '3').textContent, warn: document.querySelector('#rift-warn').textContent }; });
  check(dlg.n === 7 && /Tier 7 — as deadly as Depth 570 \(monster level 290\)/.test(dlg.first) && /best 3:21/.test(dlg.t3), `the tier dialog lists tiers 7..1 with depth, monster level and best times (${dlg.first} | ${dlg.t3})`);
  check(/level 290; you are level 273/.test(dlg.warn), 'it warns when the monsters are more than 4 levels above the hero');
  await shot('rift_dialog');
  await clean(page);
}

async function runPart(page, shot, step) {
  await hero(page, 'wizard', 273, 263);
  // Heresies on: a rift ignores them
  await page.evaluate(() => { const c = window.VELSCOUR.G.char; c.heresy.on = ['twins', 'iron', 'cruel']; c.lastRaid = 'grimscale'; });
  const b = await build(page, 1);
  const s = await page.evaluate(async () => {
    const { G } = window.VELSCOUR, w = G.world, R = w.rift;
    const { riftWeight, riftLevel, RIFT_QUOTA } = await import('/src/data/rifts.js');
    const { generateDungeon } = await import('/src/world/dungeon.js');
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    const en = w.creatures.filter((m) => m.team === 'enemy');
    const std = generateDungeon(510, BIOME_BY_ID.catacombs, w.tileset, 4242);
    const lv = {}; for (const m of en) lv[m.rank] = m.level;
    return { Q: RIFT_QUOTA, w: w.map.w, h: w.map.h, stdW: std.map.w, stdH: std.map.h, arena: !!R.gen.raid, boss: w.boss, raidSpawned: en.some((m) => m.isRaid || m.rank === 'boss'), heresy: w.heresy ?? null, n: en.length, weight: en.reduce((a, m) => a + riftWeight(m), 0), ranks: en.reduce((o, m) => ((o[m.rank] = (o[m.rank] || 0) + 1), o), {}), lv, L: riftLevel(1), depth: w.depth, iron: en.some((m) => m._heresy), exit: w.portals.find((q) => q.type === 'exit').active };
  });
  console.log(JSON.stringify(s));
  check(s.arena && !s.boss && !s.raidSpawned && s.w < s.stdW, `a 4x4-chunk maze (${s.w}x${s.h}, a standard depth-510 level ${s.stdW}x${s.stdH}) with a BOSS ROOM arena and no boss yet`);
  check(s.heresy === null && !s.iron, 'world.heresy is null: no Heresy reaches a rift');
  check(s.depth === 510 && s.lv.normal === s.L && s.lv.champion === s.L + 1 && s.L === 263, `tier 1 is depth 510, its normals monster level ${s.lv.normal} (riftLevel ${s.L}), champions +1`);
  check(b.total === s.weight && b.quota === Math.ceil(s.weight * s.Q), `the quota is ${s.Q * 100}% of the weight (normal 1, champion 4, unique 8): ${b.quota} of ${b.total} (${JSON.stringify(s.ranks)})`);
  const t7 = await build(page, 7, 77);
  const l7 = await page.evaluate(() => window.VELSCOUR.G.world.creatures.find((m) => m.rank === 'normal').level);
  check(l7 === 290, `tier 7's normals are monster level ${l7} (depthLevel(570) = 290)`);
  await build(page, 1);
  let h = await hud(page);
  check(h.shown && /ABYSSAL RIFT\s*Tier 1\s*7:00\s*0%/.test(h.text.replace(/\s+/g, ' ')), `the HUD bar: "${h.text}"`);
  // kills count by weight
  const k = await page.evaluate(async () => {
    const { G } = window.VELSCOUR, w = G.world, R = w.rift;
    const { kill } = await import('/src/game/combat.js');
    const out = [];
    for (const r of ['normal', 'champion', 'unique']) { const m = w.creatures.find((x) => x.team === 'enemy' && !x.dead && x.rank === r); const a = R.progress; kill(m, w.player); out.push(R.progress - a); }
    return out;
  });
  check(k.join() === '1,4,8', `a normal, a champion and a unique add ${k.join(', ')} to the quota`);
  // the clock runs in game.update, and stops while a menu is open
  const t0 = await page.evaluate(() => window.VELSCOUR.G.world.rift.t);
  await step(2);
  const t1 = await page.evaluate(() => { const { G } = window.VELSCOUR; G.ui.dialog({ title: 'Paused', html: 'menu' }); return G.world.rift.t; });
  await step(2);
  const t2 = await page.evaluate(() => { const { G } = window.VELSCOUR; const r = G.world.rift.t; document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll(); return r; });
  check(t1 - t0 > 1.95 && t1 - t0 < 2.6 && t2 === t1, `the clock runs with the game (+${(t1 - t0).toFixed(2)} s in 2 s) and holds while a menu is open (+${(t2 - t1).toFixed(2)})`);
  // to the quota: the Guardian stirs
  const before = await page.evaluate(() => window.VELSCOUR.G.char.lastRaid);
  const q = await killUntil(page, 'quota');
  const g = await page.evaluate(() => { const { G } = window.VELSCOUR, w = G.world, R = w.rift, m = R.guardian, A = R.gen.raid; return m && { inArena: m.x > A.x && m.x < A.x + A.w && m.y > A.y && m.y < A.y + A.h, boss: w.boss === m, raid: w.raid === m.raid, isRaid: m.isRaid, name: m.name, tpl: m.raid.tpl.id, last: G.char.lastRiftBoss, lastRaid: G.char.lastRaid, level: m.level, centre: document.querySelector('#center-msg')?.textContent || '' }; });
  check(q.guardian && g && g.inArena && g.boss && g.raid && g.isRaid && g.level === 266, `at the quota (${q.progress}) the Guardian stirs in the arena: ${g && g.name} (${g && g.tpl}), world.boss and world.raid, level ${g && g.level}`);
  check(g && g.last === g.tpl && g.lastRaid === before, `c.lastRiftBoss = ${g && g.last}; the BOSS ROOM no-repeat (c.lastRaid ${g && g.lastRaid}) is untouched`);
  h = await hud(page);
  check(h.fill === '100%' && /the Guardian/.test(h.text) && !h.bossBar, `the bar at 100% names the Guardian (${h.text}); the boss bar waits until it wakes`);
  await page.evaluate(() => { const { G } = window.VELSCOUR, m = G.world.rift.guardian; const [x, y] = G.world.map.randomNear(m.x - 6, m.y, 1.5); G.player.x = x; G.player.y = y; });
  await page.waitForTimeout(700);
  await shot('rift_guardian');
  await step(1.5);
  h = await hud(page);
  check(h.bossBar && h.boss && h.bossName === g.name, `in the arena it wakes: the boss bar shows ${h.bossName}, the rift bar moves below it`);
  await page.waitForTimeout(300);
  await shot('rift_hud_full');
  // a second Guardian is never the same as the last
  const tpls = await page.evaluate(async () => { const { G, game } = window.VELSCOUR; const { BIOME_BY_ID } = await import('/src/data/biomes.js'); const { spawnGuardian } = await import('/src/game/rifts.js'); const out = []; for (let i = 0; i < 6; i++) { G.riftSeed = 900 + i; game.buildRift(1, BIOME_BY_ID.catacombs); out.push(spawnGuardian(G.world).raid.tpl.id); } delete G.riftSeed; return out; });
  check(tpls.every((t, i) => !i || t !== tpls[i - 1]), `six Guardians in a row, none twice running (${tpls.join(', ')})`);
  // the warnings at 60 / 30 / 10 s
  await build(page, 1);
  const warn = [];
  for (const at of [60, 30, 10]) {
    await page.evaluate((at) => { const R = window.VELSCOUR.G.world.rift; R.t = R.limit - at - 0.2; }, at);
    await step(0.3);
    warn.push(await page.evaluate((at) => window.VELSCOUR.G.world.rift.warned[at] && document.querySelector('#center-msg')?.textContent, at));
  }
  h = await hud(page);
  check(warn.every(Boolean) && h.urgent, `warnings at 1:00, 0:30, 0:10 (${warn.join(' | ')}); the bar turns urgent (${h.text})`);
  await page.evaluate(() => { const R = window.VELSCOUR.G.world.rift; R.t = R.limit - 42; });
  await killUntil(page, 40); await hud(page);
  await page.waitForTimeout(300);
  await shot('rift_hud_urgent');
  // the board's reader: entries as the real SDK returns them (`at` a Timestamp) are sorted tier, time, then the first post
  const top = await page.evaluate(async () => {
    const { Cloud } = await import('/src/game/cloud.js');
    const { Board, atMs } = await import('/src/game/leaderboard.js');
    const ts = (ms) => ({ toMillis: () => ms, seconds: ms / 1000 });
    Cloud.useBackend({ init: async () => {}, board: async () => [{ uid: 'a', name: 'Late', tier: 9, time: 200, at: ts(5000) }, { uid: 'b', name: 'Early', tier: 9, time: 200, at: ts(1000) }, { uid: 'c', name: 'Deep', tier: 12, time: 400, at: ts(9000) }, { uid: 'd', name: 'Broken', tier: 'x', time: 1 }, { uid: 'e', name: 'Fast', tier: 9, time: 150, at: 7000 }] });
    const rows = await Board.top('wizard');
    Cloud.useBackend(null);
    return { names: rows.map((r) => r.name).join(), at: rows.map((r) => r.at).join(), ms: [atMs(ts(42)), atMs(42), atMs(undefined)].join() };
  });
  check(top.names === 'Deep,Fast,Early,Late' && top.at === '9000,7000,1000,5000' && top.ms === '42,42,0', `Board.top sorts tier, time, first post, drops malformed rows and turns Timestamps into numbers (${top.names}; ${top.at})`);
}

async function endPart(page, shot, step) {
  await hero(page, 'wizard', 273, 263);
  const snap = () => page.evaluate(() => { const c = window.VELSCOUR.G.char; return { kind: window.VELSCOUR.G.world.kind, fails: c.rifts.fails, deaths: c.rifts.deaths, runs: c.rifts.runs, def: JSON.stringify(c.defiance || null), depth: c.depth, deaths0: c.deaths }; });
  // 1. the clock runs out
  await build(page, 1);
  let a = await snap();
  // stepped without yielding, so the page's own loop can't add time between the steps
  const run = `(s) => { const { G, game } = window.VELSCOUR; for (let i = 0; i < Math.round(s * 30); i++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); } }`;
  const col = await page.evaluate((run) => {
    const { G } = window.VELSCOUR, w = G.world, R = w.rift; run = eval(run);
    R.t = R.limit - 0.5; G.godMode = false;
    run(0.6);
    return { failed: R.failed, invuln: G.player.invuln > 2, back: R.backT, msg: document.querySelector('#center-msg')?.textContent || '' };
  }, run);
  await page.waitForTimeout(300);
  await shot('rift_collapse');
  Object.assign(col, await page.evaluate((run) => { const { G } = window.VELSCOUR, R = G.world.rift; run = eval(run); const left = R ? R.backT : 0; run(Math.max(0, left - 0.3)); const mid = G.world.kind; run(0.6); return { left, mid, end: G.world.kind }; }, run));
  let z = await snap();
  check(col.failed && col.invuln && /THE RIFT COLLAPSES/.test(col.msg) && col.back > 2.3 && col.mid === 'dungeon' && col.end === 'town', `the clock runs out: "THE RIFT COLLAPSES", nothing can hurt the hero, and 2.5 s of game time later he is back in town (${col.back.toFixed(2)} s to go after the collapse; ${col.mid} until then, ${col.end} after)`);
  check(z.fails === a.fails + 1 && z.def === a.def && z.depth === a.depth && z.deaths0 === a.deaths0, `a collapse is a fail (${a.fails} -> ${z.fails}), no Defiance, the descent untouched (Depth ${z.depth})`);
  // 2. the town portal mid-rift
  await build(page, 1);
  a = await snap();
  await page.evaluate(() => window.VELSCOUR.game.useTownPortal());
  await page.click('.dialog-box button:has-text("Return")');
  await page.waitForTimeout(300);
  z = await snap();
  check(z.kind === 'town' && z.fails === a.fails + 1, `the town portal mid-rift is a fail (${a.fails} -> ${z.fails})`);
  // 3. death
  await build(page, 1);
  a = await snap();
  await page.evaluate(async () => { const { G } = window.VELSCOUR; G.godMode = false; const { hit } = await import('/src/game/combat.js'); const m = G.world.creatures.find((c) => c.team === 'enemy'); G.player.phoenixCd = 99; G.player.hp = 1; hit(m, G.player, 1e18, 'fire', { force: true, crit: false }); if (!G.player.dead) G.player.die(m); });
  await page.waitForTimeout(2600);
  const ds = await page.evaluate(() => document.querySelector('.screen')?.textContent || '');
  z = await snap();
  check(/Abyssal Rift Tier 1/.test(ds) && z.deaths === a.deaths + 1 && z.def === a.def && z.depth === a.depth, `death: the screen names the tier ("${ds.slice(0, 60)}…"), c.rifts.deaths ${a.deaths} -> ${z.deaths}, no Defiance`);
  await page.click('text=Return to Town');
  await page.waitForTimeout(800);
  z = await snap();
  check(z.kind === 'town' && z.fails === a.fails, `back in town; a death is not also counted a collapse (fails ${z.fails})`);
  await clean(page);
  // 4. the win: a fast first clear (jump 3), the Guardian's hoard, the bests, Marks, the exit and the results dialog
  await page.evaluate(() => { window.VELSCOUR.G.godMode = true; });
  await build(page, 1);
  const pre = await page.evaluate(async () => { const { endgame } = await import('/src/game/endgame.js'); return { marks: endgame().marks.pts, best: endgame().bests.wizard || null }; });
  await killUntil(page, 'quota');
  await page.evaluate(async () => {
    const { G } = window.VELSCOUR, w = G.world, R = w.rift, m = R.guardian;
    const { kill } = await import('/src/game/combat.js');
    const [x, y] = w.map.randomNear(m.x - 3, m.y, 1); G.player.x = x; G.player.y = y;
    w.loot.length = 0; R.t = R.limit * 0.42; kill(m, G.player);
  });
  await page.waitForTimeout(500);
  await shot('rift_win');
  const win = await page.evaluate(async () => {
    const { G } = window.VELSCOUR, w = G.world, R = w.rift, c = G.char;
    const { endgame } = await import('/src/game/endgame.js');
    const items = w.loot.filter((g) => g.kind === 'item').map((g) => g.item);
    return { done: R.done, res: R.result, rifts: c.rifts, marks: endgame().marks.pts, best: endgame().bests.wizard, abyssal: items.filter((it) => it.rarity === 6).map((it) => it.ilvl), sigils: items.filter((it) => it.type === 'gem' && it.gem === 'sig').length, gold: w.loot.filter((g) => g.kind === 'gold').length, exit: w.portals.find((q) => q.type === 'exit').active, msg: document.querySelector('#center-msg')?.textContent || '' };
  });
  console.log(JSON.stringify({ res: win.res, open: win.rifts.open, best: win.rifts.best, cleared: win.rifts.cleared, bestTime: win.rifts.bestTime }));
  check(win.done && win.res.jump === 3 && win.rifts.open === 4 && win.rifts.best === 1 && win.rifts.cleared[1] === 1 && Math.abs(win.rifts.bestTime[1] - win.res.time) < 0.1, `a win in 42% of the clock opens three tiers (open ${win.rifts.open}), best tier ${win.rifts.best}, cleared ${JSON.stringify(win.rifts.cleared)}, best time ${win.rifts.bestTime[1]}`);
  check(win.marks === pre.marks + 1 && win.res.marks === 1, `+${win.marks - pre.marks} Infernal Mark (riftMarks(1))`);
  check(win.abyssal.length >= 1 && win.abyssal.includes(265) && win.res.first && win.sigils >= 2 && win.gold >= 4, `the Guardian's hoard: an Abyssal item at item level 265 (first clear), ${win.sigils} Sigils, ${win.gold} gold piles`);
  check(win.best && win.best.tier === 1 && win.res.best && win.exit && /THE RIFT IS CLOSED/.test(win.msg), `the account's best for the class (Tier ${win.best && win.best.tier} in ${win.best && win.best.time} s), the exit opens, "${win.msg.slice(0, 40)}"`);
  // the exit: the results dialog
  await page.evaluate(() => { const { G } = window.VELSCOUR, ex = G.world.portals.find((q) => q.type === 'exit'); G.world.loot.length = 0; ex.use(); });
  await page.waitForSelector('.rift-results');
  const rd = await page.evaluate(() => ({ text: document.querySelector('.rift-results').textContent, btns: [...document.querySelectorAll('.rift-results button')].map((b) => b.textContent) }));
  check(/2:56/.test(rd.text) && /Tier 4/.test(rd.text) && /Abyssal/.test(rd.text) && rd.btns.join() === 'Return to Town,On to Tier 4', `the results dialog: ${rd.text.replace(/\s+/g, ' ').slice(0, 120)}… [${rd.btns.join(' | ')}]`);
  await shot('rift_results');
  await page.click('.rift-results button:has-text("On to Tier 4")');
  await page.waitForFunction(() => { const w = window.VELSCOUR.G.world; return w.rift && w.rift.tier === 4 && document.querySelector('#loading').classList.contains('hidden'); }, null, { timeout: 60000 });
  check(true, '"On to Tier 4" enters tier 4');
  // a slow second clear of tier 1: one tier, no new best, the Abyssal only by chance
  await clean(page);
  await page.evaluate(() => { window.VELSCOUR.G.char.rifts.open = 4; });
  await build(page, 1, 99);
  await killUntil(page, 'quota');
  const slow = await page.evaluate(async () => {
    const { G } = window.VELSCOUR, w = G.world, R = w.rift; const { kill } = await import('/src/game/combat.js');
    R.t = R.limit * 0.9; kill(R.guardian, G.player);
    return { jump: R.result.jump, first: R.result.first, best: R.result.best, cleared: G.char.rifts.cleared[1], bestTime: G.char.rifts.bestTime[1], open: G.char.rifts.open };
  });
  check(slow.jump === 1 && !slow.first && !slow.best && slow.cleared === 2 && slow.bestTime < 200 && slow.open === 4, `a slow second clear (90%): +${slow.jump} tier, not first, no new best, best time kept (${slow.bestTime})`);
  // auto-play's exit: on when ready, else home
  const ex = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR, c = G.char;
    const { Auto } = await import('/src/game/autoplay.js');
    c.level = 300; c.rifts.open = 9; // riftLevel(2) 267 .. riftLevel(9) 299: tier 2 is next and ready
    game.riftExit(G.world, { auto: true });
    await new Promise((r) => { const t = setInterval(() => { if (G.world.rift && G.world.rift.tier === 2 && document.querySelector('#loading').classList.contains('hidden')) { clearInterval(t); r(); } }, 50); });
    const a = G.world.rift.tier;
    G.world.rift.done = true; G.world.rift.result = { next: 3 }; c.level = 240; // tier 3 (272) is too deadly for a level 240 hero
    game.riftExit(G.world, { auto: true });
    return { a, b: G.world.kind, ready: Auto.riftReady(3) };
  });
  check(ex.a === 2 && ex.b === 'town' && !ex.ready, `auto-play's exit: on to tier ${ex.a} when ready; home when the next tier is too deadly (${ex.b})`);
  // a hero that took Velscour's gift (game/deathgift.js): its fast clear keeps its own best but never the account's, and
  // never posts; the tier dialog and the results say so
  await clean(page);
  await build(page, 1, 98);
  await killUntil(page, 'quota');
  const gift = await page.evaluate(async () => {
    const { G } = window.VELSCOUR, w = G.world, R = w.rift; const { kill } = await import('/src/game/combat.js');
    const { endgame } = await import('/src/game/endgame.js'); const { Rifts } = await import('/src/ui/rifts.js');
    const b0 = JSON.stringify(endgame().bests.wizard); G.char.cheated = true;
    R.t = 20; kill(R.guardian, G.player);
    const d = Rifts.results(R, { next: R.result.next, onTown: () => {}, onNext: () => {} }), res = d.box.textContent; d.close();
    const o = Rifts.open(1), dlg = o.box.textContent; o.close();
    delete G.char.cheated;
    return { board: R.result.board, best: R.result.best, same: JSON.stringify(endgame().bests.wizard) === b0, own: G.char.rifts.bestTime[1], res: /Velscour's gift/.test(res), dlg: /Velscour's gift/.test(dlg) };
  });
  check(gift.board === 'barred' && !gift.best && gift.same && gift.own === 20 && gift.res && gift.dlg, `Velscour's gift: a 0:20 clear is the hero's own best (${gift.own}) but not the account's, never posted ("${gift.board}"), and the results and tier dialog say so ${JSON.stringify(gift)}`);
}

async function autoPart(page, shot, step) {
  const g = await hero(page, 'wizard', 273, 263);
  console.log(`auto-play: wizard level 273 in item level 263 gear (dps ${g.dps.toExponential(2)}, life ${Math.round(g.hp)}), god mode, tier 1 (monster level 263)`);
  await page.evaluate(async () => {
    const { G } = window.VELSCOUR; const { Auto } = await import('/src/game/autoplay.js');
    G.godMode = true; G.autoDest = 'rift'; G.char.rifts.open = 1; Auto.toggle(true);
  });
  const res = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    const { Auto } = await import('/src/game/autoplay.js');
    const ev = { status: new Set() };
    let R = null, w0 = null;
    for (let f = 0; f < 30 * 1500; f++) {
      G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30);
      if (f % (document.querySelector('#loading').classList.contains('hidden') ? 90 : 5) === 0) await new Promise((r) => setTimeout(r, 0));
      const w = G.world;
      if (w.kind === 'town' && Auto.status) ev.status.add(Auto.status.replace(/ —.*/, ''));
      if (!R && w.rift && w.rift.t > 0) { R = w.rift; w0 = w; ev.tier = R.tier; ev.want = Auto.riftTier(); ev.limit = R.limit; ev.quota = R.quota; ev.total = R.total; ev.n = w.creatures.filter((m) => m.team === 'enemy').length; ev.normal = w.creatures.find((m) => m.rank === 'normal').maxHp; }
      if (!R) continue;
      if (R.guardian && ev.gT === undefined) ev.gT = R.t;
      if (R.guardian && R.guardian.awake && ev.wakeT === undefined) ev.wakeT = R.t;
      if (ev.endT !== undefined && f % 150 === 0) (ev.post ||= []).push(`${G.world.kind}${G.world.rift ? ' T' + G.world.rift.tier : ''} ${Auto.status} ${document.querySelector('#loading').classList.contains('hidden') ? '' : 'loading'}`);
      if ((R.done || R.failed) && ev.endT === undefined) { ev.endT = R.t; ev.done = R.done; ev.gName = R.guardian && R.guardian.name; ev.gHp = R.guardian && R.guardian.maxHp / ev.normal; ev.res = R.result; }
      if (ev.endT !== undefined && G.world !== w0 && document.querySelector('#loading').classList.contains('hidden') && (G.world.kind === 'town' || G.world.rift)) { ev.after = G.world.kind === 'town' ? 'town' : 'tier ' + G.world.rift.tier; break; }
    }
    ev.status = [...ev.status];
    return ev;
  });
  console.log(JSON.stringify(res));
  check(res.status.some((s) => /To the Abyssal Rift/.test(s)), `in town auto-play walks to the rift gate ("${res.status.filter((s) => /Rift/.test(s)).join(' | ')}")`);
  check(res.tier === res.want && res.tier === 1, `it enters riftTier() = Tier ${res.tier}`);
  check(res.done && res.endT < res.limit, `it clears the quota and kills the Guardian (${res.gName}, ${res.gHp && res.gHp.toFixed(1)} normals of life) under the clock: quota at ${res.gT && res.gT.toFixed(0)} s, in the arena at ${res.wakeT && res.wakeT.toFixed(0)} s, the Guardian dead at ${res.endT && res.endT.toFixed(0)} s of ${res.limit} (${Math.round((res.endT / res.limit) * 100)}%)`);
  // the next tier when it is ready for it (riftReady(4) needs level 274: a jump to 4 settles for 3), else home to trade
  const exp = res.res && 'tier ' + Math.min(3, res.res.next);
  check(res.after === exp || res.after === 'town', `it takes the exit: ${res.after} (+${res.res && res.res.jump} tiers${res.after === 'town' ? '; home to trade' : ''})${res.after ? '' : ': ' + (res.post || []).slice(0, 12).join(' | ')}`);
  await page.waitForTimeout(500);
  await shot('rift_auto');
}

async function phonePart() {
  const { browser, page, errors, shot } = await openGame({ width: 844, height: 390, mobile: true });
  const step = stepper(page);
  try {
    await hero(page, 'wizard', 273, 263);
    await page.evaluate(() => { const c = window.VELSCOUR.G.char; c.rifts.open = 12; c.rifts.bestTime[11] = 250; });
    await page.evaluate(() => window.VELSCOUR.game.confirmRift());
    await page.waitForSelector('.rift-dialog #rift-pick');
    const fit = await page.evaluate(() => { const b = document.querySelector('.rift-dialog').getBoundingClientRect(); return b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; });
    check(fit, 'phone: the tier dialog fits the screen');
    await shot('rift_dialog_phone');
    await clean(page);
    await build(page, 1);
    await killUntil(page, 60);
    let h = await hud(page);
    await page.waitForTimeout(400);
    const bar = await page.evaluate(() => { const b = document.querySelector('#rift-bar').getBoundingClientRect(); return { w: b.width, l: b.left, r: b.right }; });
    check(h.shown && bar.l >= 0 && bar.r <= 844, `phone: the HUD bar fits (${Math.round(bar.l)}..${Math.round(bar.r)} of 844): ${h.text}`);
    await shot('rift_hud_phone');
    await page.evaluate(() => { const R = window.VELSCOUR.G.world.rift; R.t = R.limit - 50; });
    await step(0.2); h = await hud(page);
    check(h.urgent, 'phone: under a minute the bar is urgent');
    await page.waitForTimeout(300);
    await shot('rift_hud_urgent_phone');
    await killUntil(page, 'quota');
    await page.evaluate(() => { const { G } = window.VELSCOUR, m = G.world.rift.guardian; const [x, y] = G.world.map.randomNear(m.x - 6, m.y, 1.5); G.player.x = x; G.player.y = y; });
    await step(1.5); h = await hud(page);
    check(h.bossBar && h.boss, 'phone: with the Guardian awake the rift bar sits under the boss bar');
    await page.waitForTimeout(300);
    await shot('rift_hud_boss_phone');
    await page.evaluate(async () => { const { G } = window.VELSCOUR, R = G.world.rift; const { kill } = await import('/src/game/combat.js'); R.t = R.limit * 0.6; kill(R.guardian, G.player); G.world.portals.find((q) => q.type === 'exit').use(); });
    await page.waitForSelector('.rift-results');
    const rfit = await page.evaluate(() => { const b = document.querySelector('.rift-results').getBoundingClientRect(); return b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; });
    check(rfit, 'phone: the results dialog fits the screen');
    await shot('rift_results_phone');
  } finally {
    report(errors);
    await browser.close();
  }
  // a phone held upright: the bar under the HUD's top row
  const P = await openGame({ width: 390, height: 844, mobile: true });
  try {
    await hero(P.page, 'wizard', 273, 263);
    await build(P.page, 1);
    await killUntil(P.page, 30);
    const h = await hud(P.page);
    const bar = await P.page.evaluate(() => { const b = document.querySelector('#rift-bar').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top }; });
    check(h.shown && bar.l >= 0 && bar.r <= 390, `portrait phone: the HUD bar fits (${Math.round(bar.l)}..${Math.round(bar.r)} of 390, top ${Math.round(bar.t)})`);
    await P.page.waitForTimeout(400);
    await P.shot('rift_hud_portrait');
  } finally {
    report(P.errors);
    await P.browser.close();
  }
}

(async () => {
  const t0 = Date.now();
  if (parts.some((p) => p !== 'phone')) {
    const { browser, page, errors, shot } = await openGame();
    const step = stepper(page);
    try {
      if (parts.includes('town')) await townPart(page, shot, step);
      if (parts.includes('run')) await runPart(page, shot, step);
      if (parts.includes('end')) await endPart(page, shot, step);
      if (parts.includes('auto')) await autoPart(page, shot, step);
    } catch (e) { check(false, 'threw: ' + e.message.split('\n').slice(0, 4).join(' | ')); }
    report(errors);
    await browser.close();
  }
  if (parts.includes('phone')) await phonePart();
  console.log(`${fails ? fails + ' FAILED' : 'ALL PASSED'} (${Math.round((Date.now() - t0) / 1000)} s)`);
  if (fails) process.exitCode = 1;
})();
