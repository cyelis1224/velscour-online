// Endgame model (no game simulation, ~1 minute): can a hero who keeps playing beat Velscour at depth 500?
//  1. XP: builds a dungeon every 20 depths, sums the XP of everything in it (guardians and BOSS ROOM bosses too)
//     and integrates the hero's level from depth 1 (full clears, and a rusher who kills 40% of each depth).
//  2. Power: at each depth a hero of that level is geared the way balance.js gears one (the best of 200 drops of
//     the depth's item level, +upgrades, gems, skill mastery) and measured with auto-play's own sheet numbers
//     (heroDamage dps, life, armor, resistances, block, damage reduction). Gear needs its item level to wear, so a
//     hero below the depth's monster level wears gear of its own level.
//  3. Against that depth's monsters (src/game/monster.js monsterBase, the raid.js and Velscour multipliers):
//     seconds to kill a normal / guardian / BOSS ROOM boss / Velscour, and how much of the hero's life one hit
//     of each takes (physical through armor, elemental through resistance).
//  Depths 700-1200 are the Endless Torment past Velscour (the VELS columns there are hypothetical).
//   node tools/tests/endgame.js [classes] [rounds] [rush]   # rounds of 25 drops the gear is picked from (default 8);
//                                                            # rush: the hero who kills 40% of each depth
//   node tools/tests/endgame.js paladin,wizard 8 marks=0,300,1000   # Infernal Marks (or MARKS=0,300,1000): depths
//     700 / 1000 / 1200 only, each geared hero measured at every Marks count (spent balanced, "1000L": all on
//     Vitality); the wall should hold: a normal's hit >= 12% of life, the BOSS ROOM within ~25% of no Marks at 1200
// Each depth averages 3 geared heroes (one hero's resistances swing from 0 to 75%).
const { openGame, report } = require('./harness');
const classes = (process.argv[2] || 'paladin').split(',');
const rounds = +(process.argv[3] || 8);
const rushing = process.argv.slice(4).includes('rush');
const mkArg = process.argv.slice(4).find((a) => /^marks=/.test(a)) || (process.env.MARKS ? 'marks=' + process.env.MARKS : '');
const MARKS = mkArg ? mkArg.slice(6).split(',').map((v) => [parseInt(v, 10) || 0, /L$/i.test(v)]) : [null];

(async () => {
  const { browser, page, errors } = await openGame();
  // 1. XP per depth
  let xp = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    await game.newChar('paladin', 'XP');
    document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
    const out = [];
    for (let d = 1; d <= 1300; d += d === 1 ? 19 : d < 500 ? 20 : 100) { // past 500: the Endless Torment
      G.char.depth = d;
      game.buildDungeon(d, d === 500 ? BIOME_BY_ID.throne : BIOME_BY_ID.catacombs);
      const ms = G.world.creatures.filter((m) => m.team === 'enemy');
      out.push([d, ms.reduce((a, m) => a + (m.xp || 0), 0), ms.length]);
    }
    const { xpToNext, MAX_LEVEL } = await import('/src/game/player.js');
    return { out, cap: MAX_LEVEL, cost: Array.from({ length: MAX_LEVEL + 1 }, (_, L) => xpToNext(Math.max(1, L))) };
  });
  const cost = xp.cost, cap = xp.cap; xp = xp.out;
  const xpToNext = (L) => cost[L];
  const dungeonXp = xp.filter(([d]) => d !== 500); // the throne is a short gauntlet: count depth 500 as a dungeon
  const xpAt = (d) => { for (let i = 1; i < dungeonXp.length; i++) if (dungeonXp[i][0] >= d) { const [d0, a] = dungeonXp[i - 1], [d1, b] = dungeonXp[i]; return a * Math.pow(b / a, (d - d0) / (d1 - d0)); } return dungeonXp[dungeonXp.length - 1][1]; };
  const levelAfter = (share) => { // hero level on reaching each depth when `share` of every depth's XP is earned
    const H = [1]; let L = 1, cur = 0;
    for (let d = 1; d <= 1300; d++) { cur += xpAt(d) * share; while (L < cap && cur >= xpToNext(L)) { cur -= xpToNext(L); L++; } H[d + 1] = L; }
    return H;
  };
  const full = levelAfter(1), rush = levelAfter(0.4);
  console.log('XP per depth (dungeon, all monsters): ' + xp.map(([d, x, n]) => `D${d} ${Math.round(x).toLocaleString()} (${n})`).join(', '));
  // 2-3. Power at sample depths
  const depths = mkArg ? [700, 1000, 1200] : [10, 40, 80, 120, 160, 200, 250, 300, 350, 400, 450, 495, 500, 700, 1000, 1200];
  for (const cls of classes) {
  console.log(`\n${cls}: hero level by full clears / 40% clears, then the ${rushing ? '40%' : 'full'}-clear hero (best of ${rounds * 25} drops, 3 heroes)`);
  console.log(`${mkArg ? ' marks life% crit% |' : ''} depth mlvl | lvl F/R |      dps    life arm% res% blk red | ttk: norm  guard  ROOM  VELS | % life per hit: norm champ guard ROOM VELS (phys/elem)`);
  for (const D of depths) {
    const H = (rushing ? rush : full)[D];
    const rs = await page.evaluate(async ({ cls, D, H, rounds, MARKS }) => {
      const runsBy = MARKS.map(() => []);
      for (let rep = 0; rep < 3; rep++) {
      const { G, game } = window.VELSCOUR;
      const { Auto, heroDamage } = await import('/src/game/autoplay.js');
      const { depthLevel, armorDiv } = await import('/src/data/depth.js');
      const { rollItem, rollGem } = await import('/src/data/items.js');
      const { monsterBase, VELSCOUR_HP } = await import('/src/game/monster.js');
      const { raidHpMul, raidHitMul } = await import('/src/game/raid.js');
      await game.newChar(cls, 'Endgame');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      const c = G.char, p = G.player, L = depthLevel(D);
      c.level = H; c.statPoints += (H - 1) * 5; c.skillPoints += (H - 1) + Math.max(0, D - 1);
      c.depth = D; c.deepest = D - 1;
      Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
      for (let round = 0; round < rounds; round++) {
        c.bag = c.bag.map(() => null);
        for (let i = 0; i < 25 && i < c.bag.length; i++) { const it = rollItem(Math.min(L, H) - Math.floor(Math.random() * 7), { mf: 60, bonus: Math.random() < 0.12 ? 1.2 : 0.15 }); it.unid = false; c.bag[i] = it; }
        p.recompute(); Auto.optimizeGear();
      }
      c.bag = c.bag.map(() => null);
      for (const it of Object.values(c.equip)) if (it && it.type === 'gear') {
        it.upg = Math.min(6, 2 + Math.floor(Math.min(L, H) / 40));
        it.sockets = Math.max(it.sockets, Math.min(it.maxSockets, 2));
        while (it.gems.length < it.sockets) { const g = rollGem(L); it.gems.push({ gem: g.gem, tier: g.tier }); }
      }
      const M = Math.min(1000, Math.round(20 + D * 1.6));
      c.bar.filter(Boolean).forEach((id, i) => { c.mastery[id] = [Math.max(1, Math.round(M * (i < 2 ? 1 : 0.55))), 0]; });
      Auto.spendSkills(); Auto.arrangeBar(); p.recompute();
      // the same geared hero at every Marks count (game/marks.js: the shared record, spent balanced or all on Vitality)
      const EG = await import('/src/game/endgame.js'), MK = await import('/src/game/marks.js');
      for (let mi = 0; mi < MARKS.length; mi++) {
      const runs = runsBy[mi];
      if (MARKS[mi]) { const [n, life] = MARKS[mi]; EG.endgame().marks.pts = n; MK.resetMarks(); if (life) MK.spendMark('life', n); else MK.autoSpend(); p.recompute(); }
      const st = p.st, dps = heroDamage(p).dps, hp = p.maxHp;
      // monsters of the depth (normals at L, champions L+1, guardian L+2, BOSS ROOM L+3, Velscour L+2)
      const B = (l) => monsterBase(l);
      const raidHp = (d, l) => B(l).hp * 26 * raidHpMul(d) * 1.3;
      const kinds = {
        norm: { hp: B(L).hp, dmg: B(L).dmg, l: L },
        champ: { hp: B(L + 1).hp * 3, dmg: B(L + 1).dmg * 1.4, l: L + 1 },
        guard: { hp: B(L + 2).hp * (10 + Math.min(D, 120) / 10), dmg: B(L + 2).dmg * 1.9, l: L + 2 },
        room: { hp: raidHp(D, L + 3), dmg: B(L + 3).dmg * raidHitMul(D), l: L + 3 },
        vels: { hp: B(L + 2).hp * VELSCOUR_HP, dmg: B(L + 2).dmg * 2.8, l: L + 2 },
      };
      const elemRes = Math.min(75, (st.res.fire + st.res.cold + st.res.light + st.res.poison) / 4);
      const red = 1 - Math.min(60, st.reduce || 0) / 100;
      const out = { dps, hp, arm: 0, res: elemRes, blk: Math.min(60, st.block), red: st.reduce || 0, ttk: {}, hit: {}, mk: p.marks || { life: 0, crit: 0 } };
      for (const [k, m] of Object.entries(kinds)) {
        const armK = st.armor / (st.armor + armorDiv(m.l));
        if (k === 'norm') out.arm = armK * 100;
        out.ttk[k] = m.hp / Math.max(1, dps);
        out.hit[k] = [m.dmg * (1 - armK) * red / hp * 100, m.dmg * (1 - elemRes / 100) * red / hp * 100];
      }
      runs.push(out);
      }
      }
      // average: dps geometrically, everything else plainly
      return runsBy.map((runs) => {
      const mean = (f) => runs.reduce((a, o) => a + f(o), 0) / runs.length;
      const out = { dps: Math.exp(mean((o) => Math.log(Math.max(1, o.dps)))), ttk: {}, hit: {}, mk: runs[0].mk };
      for (const k of ['hp', 'arm', 'res', 'blk', 'red']) out[k] = mean((o) => o[k]);
      for (const k of Object.keys(runs[0].ttk)) { out.ttk[k] = Math.exp(mean((o) => Math.log(o.ttk[k]))); out.hit[k] = [0, 1].map((i) => mean((o) => o.hit[k][i])); }
      return out;
      });
    }, { cls, D, H, rounds, MARKS });
    const f = (x, w = 6, d = 1) => (x >= 1e4 ? x.toExponential(1) : x.toFixed(d)).padStart(w);
    rs.forEach((r, mi) => {
      const mk = MARKS[mi] ? `${String(MARKS[mi][0] + (MARKS[mi][1] ? 'L' : '')).padStart(6)} ${f(r.mk.life, 5)} ${f(r.mk.crit, 5)} |` : '';
      const vs = MARKS[mi] && mi ? ` | ROOM x${(r.ttk.room / rs[0].ttk.room).toFixed(2)}, life x${(r.hp / rs[0].hp).toFixed(3)} vs ${MARKS[0][0]} Marks` : '';
      console.log(`${mk}${String(D).padStart(6)} ${String(depthLevelNode(D)).padStart(4)} | ${String(full[D]).padStart(3)}/${String(rush[D]).padStart(3)} | ${f(r.dps, 8, 0)} ${f(r.hp, 7, 0)} ${f(r.arm, 4, 0)} ${f(r.res, 4, 0)} ${f(r.blk, 3, 0)} ${f(r.red, 3, 0)} | ${f(r.ttk.norm, 9)} ${f(r.ttk.guard)} ${f(r.ttk.room)} ${f(r.ttk.vels)} | ${Object.values(r.hit).map(([a, b]) => `${a.toFixed(0)}/${b.toFixed(0)}`).join('  ')}${vs}`);
    });
  }
  }
  report(errors);
  await browser.close();
})();
function depthLevelNode(d) { return d <= 60 ? d : Math.round(60 + (d - 60) * 0.45); }
