// Abyssal Rift balance model (no play, ~5 minutes): does a tier fit the clock (data/rifts.js RIFT_TIME) for a hero of
// its level, and does it not for a hero below it?
//  1. Hero level by depth from full clears: endgame.js's XP integration (a dungeon built every 20 depths to 500, every
//     100 past it, all its monsters' XP summed), read at depth 500 + 10 T ("xp" heroes).
//  2. The rift of each tier, built for real (game.buildRift in six biomes, the same six for every tier): every pack's
//     members (life, quota weight), the quota, and the Guardian's life (spawnGuardian).
//  3. Heroes geared the way endgame.js gears one (the best of rounds x 25 drops of min(hero, monster) item level,
//     upgrades, gems, mastery) at: the full-clear level ("xp"), the tier's monster level ("at"), 6 and 10 levels under
//     it ("-6", "-10"), and a level-273 hero (the full-clear level at depth 500) at tier 40 ("273").
//  4. Clear time, fitted on 24 god-mode auto-play runs of a wizard and a paladin (tools/tests/rifts.js "auto" and the
//     same loop at tiers 1 and 10, heroes at the tier's level and ten over it): every pack until the quota (random order,
//     200 shuffles) costs WALK seconds plus its life over E x auto-play's planned damage against a crowd of its size
//     (buildPower: auto-play deals about E times what it plans); then RUSH seconds to the arena (the median; a few runs
//     took 80-240 s); then the Guardian: G_FIX seconds plus C_G x its life over single-target dps (heroDamage). The fits
//     miss single runs by up to +-90 s: biome, Guardian and gear rolls swing a real run far more than a model.
//     Each row's dps is the regression of log dps on level over that tier's at / -6 / -10 heroes (REPS each), as one
//     hero's gear rolls swing it by +-50%. A normal's hit as % of the hero's life is shown (through armor and reduction).
// Prints a table per class and FAILS when tier 1 for its full-clear hero is not under 60% of the clock, a level-273
// hero fits tier 40 (the clock must bite), or a hero at a tier's level (tiers 5-19) is outside 40-80% of it (the target
// is 50-70%; one model run swings a tier by +-15% with the gear rolls). Heroes 6 and 10 levels under, and the tiers
// past the Endless Torment's wall (tier 20+), are printed as notes.
//   node tools/tests/rift_balance.js [classes] [tiers] [rounds] [reps]   # default paladin 1,5,10,20,30,40,60,80 5 2
//                                     # (~4 min; paladin,wizard 1,5,10,20,30,40,60,80 5 2 for both classes, ~9 min)
const { openGame, report } = require('./harness');
const classes = (process.argv[2] || 'paladin').split(',');
const tiers = (process.argv[3] || '1,5,10,20,30,40,60,80').split(',').map(Number);
const rounds = +(process.argv[4] || 5), REPS = +(process.argv[5] || 2);
const E = 6, WALK = 2.4, RUSH = 30, G_FIX = 17, C_G = 1.15;

(async () => {
  const { browser, page, errors } = await openGame();
  let fails = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
  // 1. XP per depth (endgame.js)
  let xp = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    await game.newChar('paladin', 'XP');
    document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
    const out = [];
    for (let d = 1; d <= 1300; d += d === 1 ? 19 : d < 500 ? 20 : 100) {
      G.char.depth = d;
      game.buildDungeon(d, d === 500 ? BIOME_BY_ID.throne : BIOME_BY_ID.catacombs);
      const ms = G.world.creatures.filter((m) => m.team === 'enemy');
      out.push([d, ms.reduce((a, m) => a + (m.xp || 0), 0)]);
    }
    const { xpToNext, MAX_LEVEL } = await import('/src/game/player.js');
    const R = await import('/src/data/rifts.js');
    return { out, cap: MAX_LEVEL, cost: Array.from({ length: MAX_LEVEL + 1 }, (_, L) => xpToNext(Math.max(1, L))), consts: { time: R.RIFT_TIME, quota: R.RIFT_QUOTA, dens: R.RIFT_DENSITY } };
  });
  const { cost, cap, consts } = xp; xp = xp.out.filter(([d]) => d !== 500);
  const xpAt = (d) => { for (let i = 1; i < xp.length; i++) if (xp[i][0] >= d) { const [d0, a] = xp[i - 1], [d1, b] = xp[i]; return a * Math.pow(b / a, (d - d0) / (d1 - d0)); } return xp[xp.length - 1][1]; };
  const full = [1]; { let L = 1, cur = 0; for (let d = 1; d <= 1300; d++) { cur += xpAt(d); while (L < cap && cur >= cost[L]) { cur -= cost[L]; L++; } full[d + 1] = L; } }
  console.log(`RIFT_TIME ${consts.time} s · RIFT_QUOTA ${consts.quota} · RIFT_DENSITY ${consts.dens} · model E ${E} WALK ${WALK} s RUSH ${RUSH} s G_FIX ${G_FIX} s C_G ${C_G} · full-clear hero level at depth 500: ${full[500]}, at 510: ${full[510]}, at 900: ${full[900]}`);
  // 2. the rifts
  const rifts = {};
  for (const T of tiers) {
    rifts[T] = await page.evaluate(async (T) => {
      const { G, game } = window.VELSCOUR;
      const { riftWeight } = await import('/src/data/rifts.js');
      const { spawnGuardian } = await import('/src/game/rifts.js');
      const out = [];
      const { BIOMES } = await import('/src/data/biomes.js');
      const pool = BIOMES.filter((b) => !b.overworld && !b.beta && !b.challenge && !b.tower && !b.cave && b.id !== 'throne'); // game.enterRift's
      for (const [i, seed] of [11, 22, 33, 44, 55, 66].entries()) {
        G.riftSeed = seed;
        game.buildRift(T, pool[(i * 7) % pool.length]); // the same six biomes for every tier
        const w = G.world, R = w.rift, en = w.creatures.filter((m) => m.team === 'enemy');
        const packs = []; let k = 0;
        for (const s of R.gen.spawns) {
          if (s.rank === 'raid' || s.rank === 'boss') continue;
          const ms = en.slice(k, k + s.n); k += s.n;
          packs.push({ n: ms.length, hp: ms.reduce((a, m) => a + m.maxHp, 0), w: ms.reduce((a, m) => a + riftWeight(m), 0) });
        }
        const g = spawnGuardian(w);
        const nm = en.filter((m) => m.rank === 'normal');
        out.push({ packs, quota: R.quota, total: R.total, n: en.length, level: nm[0].level, gHp: g.maxHp, normal: nm.reduce((a, m) => a + m.maxHp, 0) / nm.length, biome: w.biome.id });
      }
      delete G.riftSeed;
      return out;
    }, T);
    const r = rifts[T][0];
    const avg = (f) => Math.round(rifts[T].reduce((a, x) => a + f(x), 0) / rifts[T].length);
    if (T === tiers[0]) console.log(`rifts: ${rifts[T].map((x) => x.biome).join(', ')}`);
    console.log(`tier ${T}: monster level ${r.level}, ${avg((x) => x.n)} monsters (${rifts[T].map((x) => x.n).join('/')}), weight ${avg((x) => x.total)}, quota ${avg((x) => x.quota)}, ${avg((x) => x.packs.length)} packs, the Guardian ${avg((x) => x.gHp / x.normal)} normals of life`);
  }
  // 3-4. heroes
  const gear = (cls, H, L, D) => page.evaluate(async ({ cls, H, L, D, rounds }) => {
    const { G, game } = window.VELSCOUR;
    const { Auto, heroDamage, buildPower } = await import('/src/game/autoplay.js');
    const { rollItem, rollGem } = await import('/src/data/items.js');
    await game.newChar(cls, 'Rift');
    document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
    const c = G.char, p = G.player, IL = Math.min(L, H);
    c.level = H; c.statPoints += (H - 1) * 5; c.skillPoints += (H - 1) + 499; c.depth = 501; c.deepest = 500;
    Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
    for (let round = 0; round < rounds; round++) {
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
    const M = Math.min(1000, Math.round(20 + D * 1.6));
    c.bar.filter(Boolean).forEach((id, i) => { c.mastery[id] = [Math.max(1, Math.round(M * (i < 2 ? 1 : 0.55))), 0]; });
    Auto.spendSkills(); Auto.arrangeBar(); p.recompute();
    const bar = new Set(c.bar.filter(Boolean)), roles = new Set(['main', 'alt', 'cd', 'summon']);
    const crowd = [0]; for (let n = 1; n <= 8; n++) crowd[n] = buildPower(p, Math.min(n, 6), bar).parts.reduce((a, x) => a + (roles.has(x.role) ? x.v : 0), 0);
    const { monsterBase } = await import('/src/game/monster.js');
    const { armorDiv } = await import('/src/data/depth.js');
    const armK = p.st.armor / (p.st.armor + armorDiv(L)), hit = monsterBase(L).dmg * (1 - armK) * (1 - Math.min(60, p.st.reduce || 0) / 100) / p.maxHp * 100;
    return { dps: heroDamage(p).dps, crowd: crowd.map((v) => v / crowd[1]), hp: p.maxHp, hit };
  }, { cls, H, L, D, rounds });
  const clear = (T, h) => {
    const out = { quota: 0, guard: 0, total: 0, normal: 0 }, k = rifts[T].length;
    for (const r of rifts[T]) {
      let q = 0;
      for (let s = 0; s < 200; s++) {
        const order = r.packs.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
        let t = 0, got = 0;
        for (const pk of order) { if (got >= r.quota) break; t += WALK + pk.hp / (E * h.dps * h.crowd[Math.min(8, pk.n)]); got += pk.w; }
        q += t / 200;
      }
      const g = G_FIX + (r.gHp / h.dps) * C_G;
      out.quota += q / k; out.guard += g / k; out.total += (q + RUSH + g) / k; out.normal += r.normal / (E * h.dps) / k;
    }
    return out;
  };
  const res = {}, slopes = {};
  for (const cls of classes) {
    console.log(`\n${cls}: seconds (quota / Guardian / total, % of the ${consts.time} s clock) for heroes at the full-clear level (xp), the tier's level (at), 6 and 10 under`);
    console.log(' tier mlvl |  hero  lvl      dps (raw dps)  norm hit% |  quota  guard  total    % ');
    for (const T of tiers) {
      const D = 500 + 10 * T, L = rifts[T][0].level;
      const heroes = [['xp', Math.min(cap, full[D])], ['at', Math.min(cap, L)], ['-6', L - 6], ['-10', L - 10]];
      if (T === 40) heroes.push(['273', 273]);
      const got = {};
      for (const [k, H] of heroes) { got[k] = []; for (let i = 0; i < REPS; i++) got[k].push(await gear(cls, H, L, D)); }
      // log dps against level over the at / -6 / -10 heroes (gear of their own level): a line through their noise
      const pts = ['at', '-6', '-10'].flatMap((k) => got[k].map((x) => [heroes.find((h) => h[0] === k)[1] - L, Math.log(x.dps)]));
      const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / Math.max(1e-9, pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0));
      (slopes[cls] ||= []).push([T, slope]);
      for (const [k, H] of heroes) {
        const hs = got[k], gm = (f) => Math.exp(hs.reduce((a, x) => a + Math.log(Math.max(1e-9, f(x))), 0) / hs.length);
        const dps = ['at', '-6', '-10'].includes(k) ? Math.exp(my + slope * (H - L - mx)) : gm((x) => x.dps);
        const h = { dps, raw: gm((x) => x.dps), crowd: hs[0].crowd.map((_, i) => gm((x) => x.crowd[i] || 1)), hit: hs.reduce((a, x) => a + x.hit, 0) / hs.length };
        const o = clear(T, h), pct = (o.total / consts.time) * 100;
        (res[cls] ||= {})[T + k] = { H, pct, dps: h.dps };
        console.log(`${String(T).padStart(5)} ${String(L).padStart(4)} | ${k.padStart(5)} ${String(H).padStart(4)} ${h.dps.toExponential(1).padStart(8)} ${h.raw.toExponential(1).padStart(8)} ${o.normal.toFixed(1).padStart(5)} ${h.hit.toFixed(0).padStart(4)} | ${o.quota.toFixed(0).padStart(6)} ${o.guard.toFixed(0).padStart(6)} ${o.total.toFixed(0).padStart(6)} ${pct.toFixed(0).padStart(4)}%`);
      }
    }
  }
  console.log('');
  for (const cls of classes) {
    const r = res[cls];
    check(r['1xp'].pct < 60, `${cls}: tier 1 for the full-clear hero (level ${r['1xp'].H}) at ${r['1xp'].pct.toFixed(0)}% of the clock (< 60%)`);
    if (r['40273']) check(r['40273'].pct > 100, `${cls}: a level-273 hero does not fit tier 40 (${r['40273'].pct.toFixed(0)}% of the clock)`);
    console.log(`${cls}: dps per level (the fit) at each tier: ${slopes[cls].map(([T, b]) => `T${T} x${Math.exp(b).toFixed(3)}`).join(', ')} (monster life x1.068)`);
    // the target band for a hero at the tier's level, before the Endless Torment's wall (an at-level hero's damage falls
    // behind monster life from monster level ~350, tier 20: those tiers want gear past the hero's level, and say so)
    for (const T of tiers) {
      const a = r[T + 'at'], m6 = r[T + '-6'], m10 = r[T + '-10'], wall = T >= 20;
      const line = `${cls}: tier ${T} at its level (${a.H}) ${a.pct.toFixed(0)}% of the clock, 6 under ${m6.pct.toFixed(0)}%, 10 under ${m10.pct.toFixed(0)}% (${m10.pct > 100 ? 'the clock bites' : 'the clock does not bite'})`;
      if (wall || T < 5) console.log(`note ${line}${wall ? ': past the wall' : ''}`);
      else check(a.pct >= 40 && a.pct <= 80, `${line}; ${a.pct >= 50 && a.pct <= 70 ? 'on' : 'off'} the 50-70% target at level`);
    }
  }
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  if (fails) process.exitCode = 1;
  report(errors);
  await browser.close();
})();
