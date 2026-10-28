// Velscour without god mode: a hero geared for depth 500 (like velscour.js part 3) is set down in his arena and
// auto-play fights; a death is one attempt. Prints, per class, wins, the phase each loss got to and fight lengths.
// Target: a well-geared hero beats him more often than not, in 5-10 minutes, and a loss usually reaches phase 3+.
//   node tools/tests/velscour_real.js [classes] [attempts]      # default paladin,wizard,ranger 3
//   node tools/tests/velscour_real.js [classes] [attempts] unbound [depth=600]   # Velscour Unbound (docs/ENDGAME.md), the
//       hero geared for that depth (keys drop past 600) the way the plain fight's hero is for 500 (level mlvl+1, gear mlvl+4)
const { openGame, report } = require('./harness');
const classes = (process.argv[2] || 'paladin,wizard,ranger').split(',');
const attempts = +(process.argv[3] || 3);
const unbound = process.argv.includes('unbound');
const depth = +((process.argv.find((a) => a.startsWith('depth=')) || `depth=${unbound ? 600 : 500}`).slice(6));

(async () => {
  const { browser, page, errors } = await openGame();
  const rows = [];
  for (const cls of classes) for (let a = 0; a < attempts; a++) {
    const r = await page.evaluate(async ({ cls, unbound, depth }) => {
      const { G, game } = window.VELSCOUR;
      const { Auto, charScore } = await import('/src/game/autoplay.js');
      const { rollItem, rollGem, SLOTS } = await import('/src/data/items.js');
      const { depthLevel } = await import('/src/data/depth.js');
      const ML = depthLevel(depth);
      if (Auto.on) Auto.toggle(false);
      // the last attempt's death or victory screen comes up a moment after it (setTimeout): let it, then clear it, or it
      // lands in this fight (auto-play clicks it and walks the new hero out of the arena)
      await new Promise((r) => setTimeout(r, 3600));
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0;
      await game.newChar(cls, 'Realbot');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      const c = G.char, p = G.player;
      c.level = ML + 1; c.statPoints = ML * 5; c.skillPoints = ML + depth + 20; c.depth = depth; c.deepest = depth - 1;
      Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
      for (const s of SLOTS) {
        let best = null, bs = -Infinity;
        for (let i = 0; i < 60; i++) {
          const it = rollItem(ML + 4, { slot: s.startsWith('ring') ? 'ring' : s, mf: 300, bonus: 1.5 }); it.req = 1; it.upg = 8;
          it.sockets = it.maxSockets; it.gems = Array.from({ length: it.sockets }, () => { const g = rollGem(300); return { gem: g.gem, tier: 7 }; });
          c.equip[s] = it; p.recompute(); const sc = charScore(p); if (sc > bs) { bs = sc; best = it; }
        }
        c.equip[s] = best;
      }
      p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
      c.potions = { hp: 15, mp: 15, rejuv: 6, fury: 3 };
      G.godMode = false;
      game.enterTown(); await new Promise((r) => setTimeout(r, 600));
      if (unbound) { const { unlockEndgame } = await import('/src/game/endgame.js'); unlockEndgame(); c.keys = 3; await game.enterUnbound(); }
      else await game.finalBoss();
      const w = G.world, V = w.velscour;
      Auto.toggle(true);
      let maxPhase = 0;
      for (let t = 0; t < 30 * 60 * (unbound ? 21 : 16) && !w.boss.dead && !G.player.dead && G.world === w; t++) {
        G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30);
        maxPhase = Math.max(maxPhase, V.phase === 6 ? 5.5 : V.phase);
        if (t % 120 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      Auto.toggle(false);
      return { win: w.boss.dead, mins: +(V.t / 60).toFixed(2), phase: maxPhase, left: +(w.boss.hp / w.boss.maxHp).toFixed(2), pots: c.potions.hp + c.potions.rejuv, court: (V.court || []).map((b) => b.raid.tpl.id + (b.dead ? '†' : '')).join(',') };
    }, { cls, unbound, depth });
    console.log(cls, JSON.stringify(r));
    rows.push({ cls, ...r });
  }
  for (const cls of classes) {
    const R = rows.filter((r) => r.cls === cls);
    console.log(`${cls.padEnd(10)} wins ${R.filter((r) => r.win).length}/${R.length} · minutes ${R.map((r) => r.mins).join(', ')} · phases reached ${R.map((r) => r.phase).join(', ')}`);
  }
  report(errors);
  await browser.close();
})();
