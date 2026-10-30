// Auto-play loops: the places a hero on auto-play used to get stuck going round in circles, built on purpose, with
// how long it takes to break free. Usage: node tools/tests/autoloops.js [loot,channel,marker,immune,edge,rift]
// loot:    six things on the ground he can't pick up: he gives the pile up within ~10 s (was 8 s each, on and on)
// channel: a dash whose effect is swept away mid-charge (a level section changing round him): he can move again
// marker:  a scenario's goal marker (the escort's far altar) is not walked to and "used" for 20 s
// immune:  a lone foe that takes no damage: after ~12 s he leaves it and goes on (he used to fight it forever)
// edge:    burning ground between him and his foe: he waits at its edge, then goes through (no Dodging! flip-flop)
// rift:    a gifted Lancer with a full bag and auto-pickup on wins an Abyssal Rift and leaves within ~20 s
const { openGame, report } = require('./harness');
const parts = (process.argv[2] || 'loot,channel,marker,immune,edge,rift').split(',');

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

// a Lancer in an empty level 3 catacomb, god mode, auto-play on; the level's monsters gone
const setup = (page) => page.evaluate(async () => {
  const { G, game } = window.VELSCOUR;
  const { BIOME_BY_ID } = await import('/src/data/biomes.js');
  const { Auto } = await import('/src/game/autoplay.js');
  if (!G.char || G.char.classId !== 'lancer') await game.newChar('lancer', 'Loopy');
  document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
  G.char.level = 12; G.player.recompute();
  game.buildDungeon(3, BIOME_BY_ID.catacombs);
  const w = G.world;
  w.creatures = w.creatures.filter((c) => c.isPlayer || c.team !== 'enemy'); w.boss = null; w.loot.length = 0;
  w.chests.forEach((ch) => { ch.opened = true; });
  G.godMode = true; G.settings.autoLoot = false;
  Auto.toggle(true);
  return [G.player.x, G.player.y];
});
// step the game n seconds; f(t) each frame, stop when it returns true
const run = (page, secs, body) => page.evaluate(async ({ secs, body }) => {
  const { G, game } = window.VELSCOUR;
  const { Auto } = await import('/src/game/autoplay.js');
  const f = new Function('G', 'Auto', 't', 'S', body), S = {};
  for (let i = 0; i < secs * 30; i++) {
    G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30);
    if (i % 60 === 0) await new Promise((r) => setTimeout(r, 0));
    if (f(G, Auto, i / 30, S)) break;
  }
  return S;
}, { secs, body });

async function loot(page) {
  await setup(page);
  // six gems by his feet (always wanted with room in the bag) that refuse to come off the ground
  await page.evaluate(async () => {
    const { G } = window.VELSCOUR, p = G.player, w = G.world;
    const { GroundItem } = await import('/src/game/loot.js');
    const { rollGem } = await import('/src/data/items.js');
    for (let i = 0, n = 0; n < 6 && i < 200; i++) { // each on a spot a short walk away (not behind a wall on a random level)
      const [x, y] = w.map.randomNear(p.x, p.y, 3), path = w.map.findPath(p.x, p.y, x, y, 400);
      if (!path || path.length > 6) continue;
      const g = w.addLoot(new GroundItem(x, y, 'item', { item: rollGem(20) })); g.z = 0; g.vz = 0; g.t = 1; g.stuck = true; n++;
    }
    const pick = p.pickup.bind(p); p.pickup = (g) => (g.stuck ? false : pick(g));
  });
  const S = await run(page, 60, `
    const busy = /Picking up|Collecting/.test(Auto.status);
    if (busy) { S.busy = (S.busy || 0) + 1 / 30; S.last = t; }
    return S.last !== undefined && t - S.last > 3;`);
  check(S.busy !== undefined && S.busy < 13, `a pile he can't pick up is given up in ${S.busy !== undefined ? S.busy.toFixed(1) + ' s' : 'no time (he never went for it)'} of trying (was 8 s an item: 48 s)`);
}

async function channel(page) {
  await setup(page);
  const S = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR, p = G.player, w = G.world;
    const { Auto } = await import('/src/game/autoplay.js');
    const { SKILLS } = await import('/src/data/skills.js');
    Auto.toggle(false);
    G.char.skills['lancer.0.2'] = 1; p.recompute(); p.mana = p.maxMana;
    const ok = p.tryUseSkill(SKILLS['lancer.0.2'], p.x + 4, p.y);
    const had = !!p.channel;
    w.hazards.length = 0; // the section changes round him mid-charge (game/caverns.js toShaft, dunes.js, tower.js)
    const x0 = p.x;
    for (let i = 0; i < 20; i++) { p.moveVec = [1, 0]; G.dt = 1 / 30; w.update(1 / 30); } // (game.update's controls would zero moveVec)
    return { ok, had, channel: !!p.channel, moved: Math.abs(p.x - x0) };
  });
  check(S.ok && S.had, 'Lance Charge started a dash channel');
  check(!S.channel && S.moved > 0.5, `with its effect swept away he is free again (channel ${S.channel}, moved ${S.moved.toFixed(2)} tiles)`);
}

async function marker(page) {
  await setup(page);
  await page.evaluate(() => {
    const { G } = window.VELSCOUR, p = G.player, w = G.world, [x, y] = w.map.randomNear(p.x, p.y, 5);
    w.chests.push({ x, y, opened: false, reach: 1.5, far: 40, label: 'The far altar', inert: true, scen: {}, use() {} });
  });
  const S = await run(page, 8, `if (/far altar/.test(Auto.status)) S.n = (S.n || 0) + 1;`);
  check(!S.n, `the escort's goal marker is left alone (${((S.n || 0) / 30).toFixed(1)} s spent "using" it)`);
}

async function immune(page) {
  await setup(page);
  await page.evaluate(async () => {
    const { G } = window.VELSCOUR, p = G.player, w = G.world;
    const { makeMonster } = await import('/src/game/monster.js');
    const [x, y] = w.map.randomNear(p.x + 4, p.y, 1.5);
    const m = makeMonster(w, 'skeleton', w.biome, 3, 'normal', x, y, 0);
    m.invuln = 1e9; m.awake = true; m.speed = 0; m.static = true; m.dmg = 0; m.name = 'Unkillable';
    w.add(m); window.__m = m;
  });
  const S = await run(page, 40, `
    const f = /Fighting Unkillable/.test(Auto.status);
    if (f) S.fought = t; else if (S.fought !== undefined && S.left === undefined) S.left = t;
    return S.left !== undefined && t - S.left > 5;`);
  check(S.left !== undefined && S.left < 16, `a foe that takes no damage is left after ${S.left !== undefined ? S.left.toFixed(1) + ' s' : 'never (40 s)'}`);
}

async function edge(page) {
  await setup(page);
  const ok = await page.evaluate(async () => {
    const { G } = window.VELSCOUR, p = G.player, w = G.world, map = w.map, c = G.char;
    const { makeMonster } = await import('/src/game/monster.js');
    const { Area } = await import('/src/game/hazards.js');
    const { Auto } = await import('/src/game/autoplay.js');
    // only the plain thrust: a charge would carry him straight over the fire
    for (const k of Object.keys(c.skills)) if (k !== 'lancer.0.0') c.skills[k] = 0;
    Auto.arrangeBar(); p.recompute();
    // a straight run of open floor 9 tiles long
    let at = null;
    for (let i = 0; i < 6000 && !at; i++) {
      const x = Math.floor(Math.random() * map.w) + 0.5, y = Math.floor(Math.random() * map.h) + 0.5;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { let k = 0; while (k <= 9 && map.circleFree(x + dx * k, y + dy * k, 0.6)) k++; if (k > 9) { at = [x, y, dx, dy]; break; } }
    }
    if (!at) return false;
    const [x, y, dx, dy] = at;
    p.x = x; p.y = y;
    const m = makeMonster(w, 'skeleton', w.biome, 3, 'normal', x + dx * 8, y + dy * 8, 0);
    m.speed = 0; m.static = true; m.dmg = 0; m.awake = true; m.maxHp = m.hp = 1e9; m.name = 'Dummy';
    w.add(m); window.__m = m;
    // burning ground across the way, lasting 7 s
    w.addHazard(new Area({ world: w, src: m, x: x + dx * 4, y: y + dy * 4, r: 1.6, dur: 7, tick: 0.5, dmg: [1, 1], el: 'fire', fx: 'fire' }));
    return true;
  });
  check(ok, 'a straight 9-tile run of floor for the burning ground test');
  const S = await run(page, 10, `
    const st = Auto.status.startsWith('Dodging') ? 'd' : 'o';
    if (S.st && st !== S.st && st === 'd') S.flips = (S.flips || 0) + 1;
    S.st = st;
    if (window.__m.hp < window.__m.maxHp && S.hit === undefined) S.hit = t;
    if (Math.round(t * 30) % 15 === 0) (S.log ||= []).push(t.toFixed(1) + ' ' + Auto.status + ' p' + G.player.x.toFixed(1) + ',' + G.player.y.toFixed(1) + ' m' + window.__m.x.toFixed(1) + ',' + window.__m.y.toFixed(1) + ' edge' + (Auto.edgeT || 0).toFixed(2) + ' brave' + (Auto.braveT || 0).toFixed(2));`);
  if (process.env.DEBUG) console.log((S.log || []).join('\n'));
  check((S.flips || 0) <= 4, `at the burning ground's edge: ${S.flips || 0} dodges (the flip-flop made dozens)`);
  check(S.hit !== undefined && S.hit < 7, `he reaches his foe across it ${S.hit !== undefined ? 'after ' + S.hit.toFixed(1) + ' s' : 'never (10 s)'}`);
}

async function rift(page) {
  const S = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    const { Auto } = await import('/src/game/autoplay.js');
    const { endgame, saveEndgame, resetEndgameCache } = await import('/src/game/endgame.js');
    const { grantDeathGift } = await import('/src/game/deathgift.js');
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    const { rollItem } = await import('/src/data/items.js');
    const clean = () => { document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll(); };
    localStorage.removeItem('velscour_endgame_v1'); resetEndgameCache(); endgame().unlocked = Date.now(); saveEndgame();
    await game.newChar('lancer', 'Rifter'); clean();
    grantDeathGift(); clean();
    const c = G.char;
    for (let i = 0; i < c.bag.length; i++) if (!c.bag[i]) { const it = rollItem(40, {}); it.unid = false; c.bag[i] = it; }
    G.settings.autoLoot = true; G.godMode = true; G.autoDest = 'rift'; c.rifts.open = 1;
    game.buildRift(1, BIOME_BY_ID.obsidian); clean();
    Auto.toggle(true);
    const w0 = G.world, R = w0.rift, S = { busy: 0, run: 0 };
    for (let f = 0; f < 30 * 400; f++) {
      G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30);
      if (f % 90 === 0) await new Promise((r) => setTimeout(r, 0));
      if (R.done && S.won === undefined) S.won = f / 30;
      if (S.won !== undefined && G.world === w0) { if (/Picking up|Collecting/.test(Auto.status)) S.run += 1 / 30; else { S.busy = Math.max(S.busy, S.run); S.run = 0; } }
      if (G.world !== w0) { S.left = f / 30; break; }
    }
    S.busy = Math.max(S.busy, S.run); S.done = R.done;
    return S;
  });
  check(S.done, `the gifted Lancer wins the rift (${S.won !== undefined ? S.won.toFixed(0) + ' s' : 'not in 400 s'})`);
  check(S.left !== undefined && S.left - S.won < 25, `and is out of it ${S.left !== undefined ? (S.left - S.won).toFixed(1) + ' s after the win' : 'never'}; the longest looting stretch ${S.busy.toFixed(1)} s`);
}

(async () => {
  const { browser, page, errors, shot } = await openGame();
  try {
    for (const [k, f] of Object.entries({ loot, channel, marker, immune, edge, rift })) {
      if (!parts.includes(k)) continue;
      console.log(`-- ${k}`);
      await f(page);
    }
    await shot('autoloops');
  } finally {
    report(errors);
    await browser.close();
    if (fails) { console.log(`${fails} FAILED`); process.exitCode = 1; }
  }
})();
