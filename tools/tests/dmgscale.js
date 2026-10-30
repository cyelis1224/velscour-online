// The damage scale (dmgScale / shownDmg in src/data/depth.js): a hero geared for each depth fights with auto-play (god
// mode), and the damage numbers it sees are read back: hits and crits as shown, as a share of a same-level hero's life
// (what a PvP hit would take), the stats plaque and the weapon tooltip. Display only, so nothing is asserted about
// kill speed; the check is that shown hits stay on the scale of hero life at every depth (no billions).
//   node tools/tests/dmgscale.js [depths] [classes]      e.g. 5,60,150,300,500 paladin,wizard
const { openGame, report } = require('./harness');
const depths = (process.argv[2] || '5,60,150,300,500').split(',').map(Number);
const classes = (process.argv[3] || 'paladin,wizard').split(',');

(async () => {
  const { browser, page, errors, shot } = await openGame();
  const rows = [];
  for (const cls of classes) for (const D of depths) {
    const r = await page.evaluate(async ({ cls, D }) => {
      const { G, game } = window.VELSCOUR;
      const { Auto } = await import('/src/game/autoplay.js');
      const { depthLevel, dmgScale, shownDmg } = await import('/src/data/depth.js');
      const { rollItem, rollGem } = await import('/src/data/items.js');
      const { texts } = await import('/src/gfx/vfx.js');
      const { itemTooltip } = await import('/src/ui/itemui.js');
      const { monsterBase } = await import('/src/game/monster.js');
      const { Meter } = await import('/src/game/dpsmeter.js');
      if (Auto.on) Auto.toggle(false);
      await game.newChar(cls, 'Scale');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      const c = G.char, p = G.player, L = depthLevel(D), lvl = Math.min(300, L + 1);
      c.level = lvl; c.statPoints += (lvl - 1) * 5; c.skillPoints += (lvl - 1) + Math.max(0, D - 1);
      for (let d = 1; d < D; d++) c.cleared[d] = true;
      c.deepest = D - 1; c.depth = D; c.nextBiome = null;
      Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
      for (let round = 0; round < 4; round++) {
        c.bag = c.bag.map(() => null);
        for (let i = 0; i < 25 && i < c.bag.length; i++) { const it = rollItem(L - Math.floor(Math.random() * 7), { mf: 60 }); it.unid = false; c.bag[i] = it; }
        p.recompute(); Auto.optimizeGear();
      }
      c.bag = c.bag.map(() => null);
      for (const it of Object.values(c.equip)) if (it && it.type === 'gear') {
        it.upg = Math.min(6, 2 + Math.floor(L / 40));
        it.sockets = Math.max(it.sockets, Math.min(it.maxSockets, 2));
        while (it.gems.length < it.sockets) { const g = rollGem(L); it.gems.push({ gem: g.gem, tier: g.tier }); }
      }
      const M = Math.min(1000, Math.round(20 + D * 1.6));
      c.bar.filter(Boolean).forEach((id, i) => { c.mastery[id] = [Math.max(1, Math.round(M * (i < 2 ? 1 : 0.55))), 0]; });
      Auto.spendSkills(); Auto.arrangeBar(); p.recompute(); p.hp = p.maxHp;
      G.godMode = true; Meter.reset();
      Auto.toggle(true);
      game.enterDungeon();
      const hits = [], crits = [], seen = new Set();
      for (let sim = 0; sim < 40; sim += 1 / 30) {
        if (G.mode !== 'game' || !G.world) break;
        G.dt = 1 / 30; G.time += G.dt; G.frame++;
        game.update(1 / 30);
        for (const t of texts) if (t.dmg && !seen.has(t)) { seen.add(t); if (t.style === 'hit') hits.push(t.text); else if (t.style === 'crit') crits.push(t.text); }
        if ((G.frame & 63) === 0) await new Promise((r) => setTimeout(r, 0));
      }
      await new Promise((r) => setTimeout(r, 400)); // the real loop refreshes the plaque
      Auto.toggle(false); G.godMode = false;
      const num = (s) => { const m = /^(-?[\d.]+)([kMBT]?)$/.exec(s); return m ? +m[1] * ({ '': 1, k: 1e3, M: 1e6, B: 1e9, T: 1e12 })[m[2]] : NaN; };
      const med = (a) => { const v = a.map(num).filter((x) => x > 0).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : 0; };
      const weapon = c.equip.weapon;
      const tip = weapon ? (/Damage: <b>([^<]+)<\/b>/.exec(itemTooltip(weapon)) || [])[1] : '-';
      const B = monsterBase(L);
      return { cls, D, L, life: p.maxHp, scale: dmgScale(L), monLife: shownDmg(B.hp, L), monHit: B.dmg, hit: med(hits), crit: med(crits), n: hits.length + crits.length,
        maxShown: Math.max(0, ...hits.concat(crits).map(num).filter((x) => x > 0)),
        atk: document.querySelector('#hs-atk').textContent, dps: document.querySelector('#hs-dps').textContent, avg: document.querySelector('#hs-avg').textContent, tip };
    }, { cls, D });
    rows.push(r);
    await shot(`dmgscale_${cls}_${D}`);
    console.log(`${r.cls} D${r.D} (mlvl ${r.L}) life ${r.life} | scale ${r.scale.toPrecision(3)} normal monster life ${r.monLife.toFixed(1)} | ${r.n} numbers: hit ${r.hit} (${(100 * r.hit / r.life).toFixed(1)}% of life) crit ${r.crit} max ${r.maxShown} | plaque atk ${r.atk} dps ${r.dps} avg ${r.avg} | weapon ${r.tip}`);
  }
  // thorns (combat.js) land on the shown scale x Fortitude: a normal attacker dies in ~40 blows at every depth; weapon
  // figures read ~100 for a Common of the depth (shownWeapon), never the 0.0x they were
  const th = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    const { makeMonster } = await import('/src/game/monster.js');
    const { rollItem } = await import('/src/data/items.js');
    const { depthLevel, shownWeapon } = await import('/src/data/depth.js');
    const { hit } = await import('/src/game/combat.js');
    const out = [];
    for (const D of [5, 60, 500, 1500]) {
      await game.newChar('paladin', 'Thorny');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      const c = G.char, L = depthLevel(D), p = G.player;
      c.level = Math.min(3000, L + 2); c.depth = D;
      const sh = rollItem(L, { slot: 'offhand', rarity: 4, generic: true }); sh.unid = false;
      sh.affixes = sh.affixes.filter((a) => a.s !== 'thorns'); const v = Math.max(1, Math.round(2 + L * 0.25)); sh.affixes.push({ s: 'thorns', v });
      c.equip.offhand = sh;
      game.buildDungeon(D, BIOME_BY_ID.catacombs);
      G.godMode = true; p.recompute();
      const m = makeMonster(G.world, 'skeleton', G.world.biome, L, 'normal', p.x + 1, p.y); G.world.add(m);
      const hp0 = m.hp; let n = 0, got = 0; // blocked blows strike nothing back: average the ones that land
      for (let i = 0; i < 30; i++) { const h = m.hp; hit(m, p, 1, 'phys', {}); if (h > m.hp) { n++; got += h - m.hp; } m.hp = hp0; }
      const w = rollItem(L, { slot: 'weapon', rarity: 0, generic: true }), [a, b] = (await import('/src/data/items.js')).itemDmg(w);
      out.push({ D, v, thorns: Math.round(p.st.thorns), blows: +(hp0 / Math.max(1e-9, got / Math.max(1, n))).toFixed(1), weapon: Math.round(shownWeapon((a + b) / 2, depthLevel(D))) });
    }
    G.godMode = false;
    return out;
  });
  console.log('thorns / weapon: ' + th.map((t) => `D${t.D} affix ${t.v} -> ${t.thorns} thorns, a normal dies in ${t.blows} blows; Common weapon reads ${t.weapon}`).join(' | '));
  if (th.some((t) => !(t.blows > 5 && t.blows < 400) || t.weapon < 50 || t.weapon > 200)) { console.log('FAIL: thorns or weapon figures off the scale'); process.exitCode = 1; }
  const bad = rows.filter((r) => !r.n || r.maxShown > r.life * 50);
  if (bad.length) { console.log('FAIL: shown damage off the scale of hero life:', bad.map((r) => `${r.cls} D${r.D}`).join(', ')); process.exitCode = 1; }
  report(errors, 20);
  await browser.close();
})();
