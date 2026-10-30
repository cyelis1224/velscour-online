// Balance soak: a hero set up the way one would look on arriving at depth D (level, auto-play's own stat and skill
// spending, the best of a few hundred drops of that item level with gems and +upgrades, skill mastery), then
// auto-play plays from there for N game minutes at ~30x speed. Deaths send the hero back to the start of the
// 5-depth block (game.onPlayerDeath), exactly as in play. Prints deaths, depths cleared and the furthest depth.
//   node tools/tests/balance.js paladin 150 20        # class, start depth, game minutes
//   node tools/tests/balance.js wizard,ranger 150,60 15
//   node tools/tests/balance.js paladin 150 10 god     # no damage taken: hero DPS, guardian and raid fight lengths
//   BAL_STANCE=cautious,reckless node tools/tests/balance.js wizard 20 10   # auto-play stances (default balanced)
//   BAL_RAID=1 node tools/tests/balance.js wizard 30 5   # start at a BOSS ROOM depth's gate, the level's monsters gone
//   BAL_BIOME=castle node tools/tests/balance.js paladin 19 6   # start in that biome (an overworld: its scenario)
// Also prints potions drunk, life lost (in whole life bars), share of time kiting and seconds per kill.
// Targets (see docs/HANDOFF.md, balance sweep): a death now and then, never more than 6-10 deaths per 5-depth block.
const { openGame, report } = require('./harness');
const classes = (process.argv[2] || 'paladin').split(',');
const depths = (process.argv[3] || '150').split(',').map(Number);
const minutes = +(process.argv[4] || 15);
const god = process.argv[5] === 'god'; // no damage taken: measures DPS and fight lengths instead of deaths
const rounds = +(process.env.BAL_GEAR || 8); // drop rounds of 25 items the gear is picked from (lower = a weaker-geared hero)
const stances = (process.env.BAL_STANCE || 'balanced').split(',');

(async () => {
  const { browser, page, errors, shot } = await openGame();
  const rows = [];
  for (const cls of classes) for (const D of depths) for (const stance of stances) {
    await page.evaluate(async ({ cls, D, god, rounds, stance, raidGate, biomeId }) => {
      const { G, game } = window.VELSCOUR;
      const { Auto } = await import('/src/game/autoplay.js');
      const { depthLevel } = await import('/src/data/depth.js');
      const { rollItem, rollGem, RING_SLOTS } = await import('/src/data/items.js');
      const { xpToNext } = await import('/src/game/player.js');
      if (Auto.on) Auto.toggle(false);
      await game.newChar(cls, 'Balance');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      const c = G.char, p = G.player, L = depthLevel(D);
      const lvl = Math.min(3000, L + 1);
      c.level = lvl; c.xp = Math.round(xpToNext(lvl) * 0.3);
      c.statPoints += (lvl - 1) * 5; c.skillPoints += (lvl - 1) + Math.max(0, D - 1);
      for (let d = 1; d < D; d++) c.cleared[d] = true;
      c.deepest = D - 1; c.depth = D; c.nextBiome = biomeId || null;
      c.gold = Math.round(800 * Math.pow(1.05, L));
      c.potions = { hp: 10, mp: 6, rejuv: 3, fury: 2 };
      Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
      // gear: the best of ~200 drops between ilvl L-6 and L (what the last stretch of depths dropped)
      for (let round = 0; round < rounds; round++) {
        c.bag = c.bag.map(() => null);
        for (let i = 0; i < 25 && i < c.bag.length; i++) {
          const it = rollItem(L - Math.floor(Math.random() * 7), { mf: 60, bonus: Math.random() < 0.12 ? 1.2 : 0.15 });
          it.unid = false;
          c.bag[i] = it;
        }
        p.recompute(); Auto.optimizeGear();
      }
      c.bag = c.bag.map(() => null);
      for (const it of Object.values(c.equip)) if (it && it.type === 'gear') {
        it.upg = Math.min(6, 2 + Math.floor(L / 40));
        it.sockets = Math.max(it.sockets, Math.min(it.maxSockets, 2));
        while (it.gems.length < it.sockets) { const g = rollGem(L); it.gems.push({ gem: g.gem, tier: g.tier }); }
      }
      // mastery: what the kills so far gave the skills that made them (main skills highest)
      const M = Math.min(1000, Math.round(20 + D * 1.6));
      c.bar.filter(Boolean).forEach((id, i) => { c.mastery[id] = [Math.max(1, Math.round(M * (i < 2 ? 1 : 0.55))), 0]; });
      Auto.spendSkills(); Auto.arrangeBar(); p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
      c.deaths = 0; c.kills = 0; c.stance = stance;
      G.godMode = god; G.raidLog = [];
      G.autoOpenSeals = true; // nobody is watching: auto-play breaks sealed treasures itself instead of waiting in town
      window.__bal = { blocks: {}, startDepth: D, maxDepth: D, deathsAt: [], pots: 0, lost: 0, kiteT: 0, t: 0 };
      Auto.toggle(true);
      game.enterDungeon();
      if (raidGate) {
        await new Promise((r) => setTimeout(r, 800));
        const w = G.world, R = w.raid;
        if (R) { for (const m of w.creatures) if (m.team === 'enemy' && m !== w.boss) m.dead = true; G.player.x = R.arena.gate.x - 3; G.player.y = R.arena.gate.y0 + 1.5; }
      }
    }, { cls, D, god, rounds, stance, raidGate: !!process.env.BAL_RAID, biomeId: process.env.BAL_BIOME });
    await page.waitForTimeout(1500);
    let last = null;
    for (let min = 1; min <= minutes; min++) {
      last = await page.evaluate(async () => {
        const { G, game } = window.VELSCOUR;
        const { Auto } = await import('/src/game/autoplay.js');
        const { Meter } = await import('/src/game/dpsmeter.js');
        const B = window.__bal, t0 = performance.now();
        let sim = 0, deaths = G.char.deaths;
        const potSum = () => Object.values(G.char.potions).reduce((a, n) => a + n, 0);
        while (sim < 60) {
          for (let i = 0; i < 15; i++) {
            if (G.mode !== 'game' || !G.world) break;
            G.dt = 1 / 30; G.time += G.dt; G.frame++;
            const pp = G.player, hp0 = pp.hp, pots0 = potSum();
            game.update(1 / 30);
            sim += 1 / 30; B.t += 1 / 30;
            if (G.player === pp && pp.hp < hp0) B.lost += (hp0 - pp.hp) / pp.maxHp;
            if (potSum() < pots0) B.pots += pots0 - potSum();
            if (Auto.status === 'Kiting') B.kiteT += 1 / 30;
            if (G.char.deaths > deaths) { deaths = G.char.deaths; B.deathsAt.push(G.world.depth); const k = Math.floor((G.world.depth - 1) / 5); B.blocks[k] = (B.blocks[k] || 0) + 1; }
            if (G.world && G.world.kind === 'dungeon') B.maxDepth = Math.max(B.maxDepth, G.world.depth);
          }
          await new Promise((r) => setTimeout(r, 0));
          if (performance.now() - t0 > 90000) break;
        }
        const c = G.char, p = G.player, w = G.world;
        const raids = (G.raidLog || []).splice(0).map((r) => `${r.boss}@D${r.depth} ${r.secs}s`).join('; ');
        return { dps: Math.round(Meter.avg()), raids, where: w ? (w.kind === 'town' ? 'town' : `D${w.depth}`) : '-', depth: c.depth, deepest: c.deepest, lvl: c.level, kills: c.kills, deaths: c.deaths,
          hp: `${Math.round(p.hp)}/${p.maxHp}`, armor: p.st.armor, pots: Object.values(c.potions).join('/'), status: Auto.status, maxDepth: B.maxDepth, deathsAt: B.deathsAt.join(','), drunk: B.pots, lost: B.lost, kite: B.kiteT / Math.max(1, B.t), spk: B.t / Math.max(1, c.kills),
          boss: w && w.boss ? `${w.boss.name} ${Math.round(w.boss.hp)}/${Math.round(w.boss.maxHp)}` : '' };
      });
      console.log(`[${cls} D${D} ${stance} ${min}m] ${last.where} lvl=${last.lvl} kills=${last.kills} deaths=${last.deaths} deepest=${last.deepest} hp=${last.hp} arm=${last.armor} pots=${last.pots} dps=${last.dps} ${last.boss} | ${last.status}`);
      if (last.raids) console.log(`   RAID KILLED: ${last.raids}`);
    }
    await shot(`balance_${cls}_${D}_${stance}`);
    rows.push({ cls, D, stance, minutes, deaths: last.deaths, cleared: Math.max(0, last.deepest - (D - 1)), maxDepth: last.maxDepth, lvl: last.lvl, deathsAt: last.deathsAt, kills: last.kills, drunk: last.drunk, lost: last.lost, kite: last.kite, spk: last.spk });
  }
  console.log('\nSUMMARY  class          start stance    min  deaths cleared furthest  lvl  kills s/kill potions lives-lost kiting  deaths at');
  for (const r of rows) console.log(`  ${r.cls.padEnd(14)} ${String(r.D).padStart(4)} ${r.stance.padEnd(9)} ${String(r.minutes).padStart(4)} ${String(r.deaths).padStart(7)} ${String(r.cleared).padStart(7)} ${String(r.maxDepth).padStart(8)} ${String(r.lvl).padStart(4)} ${String(r.kills).padStart(6)} ${r.spk.toFixed(1).padStart(6)} ${String(r.drunk).padStart(7)} ${r.lost.toFixed(1).padStart(10)} ${(r.kite * 100).toFixed(0).padStart(5)}%  ${r.deathsAt}`);
  report(errors, 20);
  await browser.close();
})();
