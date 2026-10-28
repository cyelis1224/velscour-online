// The Heresies (docs/ENDGAME.md section 1): the Altar of Heresy, every Heresy's effect on a level, the rank's rewards,
// auto-play under them, and a depth-520 measurement of what they cost.
//   node tools/tests/heresies.js [altar,effects,auto,balance,phone,each]   (default: all but 'each')
// 1. altar: the obelisk stands in town, the hero walks to it and its 'use' opens the panel; before the Endgame the panel
//    is locked and setHeresy refuses; after unlockEndgame() the rows toggle (real clicks), the hero is saved, the page
//    reloaded and the hero loaded again with the same Heresies (and migrate gives an old save { on: [] }). Shots.
// 2. effects, one level built per Heresy: twins (seeded depth, exactly twice the pack monsters), crowned (+2 / +1 affixes
//    and their effects), thirst (usePotion refuses), fifth (5 phases, 4 marks, one more modifier at depth 605, every
//    phase stepped; sig bosses get 'Beyond the End'), legion (hellgates in a plain depth and the Eternal Breach, never in a
//    rift; level, cap of 8, the clock pauses while a boss is awake), iron/cruel (once, never compounding), ambush (a third
//    of the wait), omens (every omenable depth, the portal cards, the Nemesis returns), glass (the sheet, only where in
//    force), hunger (no orbs over 200 kills, no regeneration), gaze (2x aggro range, an awake monster never loses the
//    hero); none in rifts or Velscour Unbound; the HUD subtitle, the Quest Log; heresyWorld's dials at rank 26; the
//    rank-20 Mark; Abyssal Key odds at rank 10 vs 9.
// 3. auto: auto-play under Dry Throat never calls usePotion while its life is low (and does without the Heresy).
// 4. balance: depth 520, every Heresy vs none: monsters per level, champion affixes, dials, time to clear the start (god
//    mode, a geared hero) and the cost of game.update() per frame (none / Twinned Packs / all).
// 5. phone: the panel (locked, open, the doors) and the HUD on an 844x390 touch screen.
// each (opt-in): the depth-521 hero without god mode under each Heresy alone, HX_RUNS levels of HX_SECS s: deaths, lowest life.
// Shots: tools/tests/out/heresies_*.png.
const { openGame, report } = require('./harness');
const parts = (process.argv[2] || 'altar,effects,auto,balance,phone').split(',');
const ALL = ['twins', 'crowned', 'thirst', 'fifth', 'legion', 'iron', 'cruel', 'ambush', 'omens', 'glass', 'hunger', 'gaze'];

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

/** Helpers in the page: build a level with a set of Heresies (Math.random seeded for the build), step the game. */
async function helpers(page) {
  await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    const { BIOME_BY_ID } = await import('/src/data/biomes.js');
    const seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    window.HX = {
      on(ids) { G.char.heresy = { on: ids.slice() }; G.player.recompute(); },
      build(depth, ids, { biome = 'catacombs', seed = null } = {}) {
        this.on(ids); delete G.char.nextOmen;
        const R = Math.random;
        if (seed !== null) Math.random = seeded(seed);
        try { game.buildDungeon(depth, BIOME_BY_ID[biome]); } finally { Math.random = R; }
        return G.world;
      },
      step(s) { for (let t = 0; t < s * 30; t++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); if (G.world.kind === 'town' && G.ui.modalCount) break; } },
      foes(w = G.world) { return w.creatures.filter((m) => m.team === 'enemy' && !m.dead && !m.summon); },
      mapHash(w = G.world) { let h = w.map.w * 31 + w.map.h; for (let i = 0; i < w.map.block.length; i += 7) h = (h * 33 + w.map.block[i]) | 0; return h; },
      /** Auto-play a fresh level of `depth` for `secs` (god mode or not): kills, the first 25 kills' time, update() cost, death. */
      async play(secs, god, ids, depth = 521) {
        const X = this, { Auto } = await import('/src/game/autoplay.js'), w2 = X.build(depth, ids), p2 = w2.player, c = G.char; G.godMode = god; p2.hp = p2.maxHp; p2.mana = p2.maxMana; c.potions = { hp: 10, mp: 10, rejuv: 4, fury: 2 };
        const kills0 = c.kills || 0; Auto.toggle(true);
        let t = 0, t25 = null, um = 0, umax = 0, minHp = 1;
        for (; t < 30 * secs && G.world === w2 && !p2.dead; t++) {
          G.dt = 1 / 30; G.time += G.dt; G.frame++; const a = performance.now(); game.update(1 / 30); const d = performance.now() - a; um += d; umax = Math.max(umax, d);
          if (t25 === null && (c.kills || 0) - kills0 >= 25) t25 = t / 30;
          minHp = Math.min(minHp, p2.hp / p2.maxHp);
          if (t % 120 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        Auto.toggle(false);
        const r = { t25, kills: (c.kills || 0) - kills0, ms: um / Math.max(1, t), max: umax, awake: X.foes(w2).filter((m) => m.awake).length, pit: w2.creatures.filter((m) => m.pitSpawn).length, died: p2.dead ? +(t / 30).toFixed(0) : null, minHp: +minHp.toFixed(2), pots: 10 - c.potions.hp };
        G.godMode = true;
        if (p2.dead) { // the death screen comes up on the wall clock: wait for it, put it away, undo Defiance and the Nemesis
          await new Promise((res) => setTimeout(res, 1900));
          document.querySelectorAll('.screen').forEach((e) => { if (e.querySelector('.death-title')) e.remove(); });
          G.ui.modalCount = 0; p2.dead = false; c.defiance = null; c.nemesis = null; p2.recompute(); p2.hp = p2.maxHp;
        }
        return r;
      },
    };
  });
}

/** A hero geared for depth 521 the way tools/tests/balance.js does it (BAL_GEAR 8): level, stats, skills, gear, gems, mastery. */
async function gear521(page) {
  await page.evaluate(async () => {
    const { G } = window.VELSCOUR, { Auto } = await import('/src/game/autoplay.js'), { rollItem, rollGem } = await import('/src/data/items.js');
    const { depthLevel } = await import('/src/data/depth.js'), { xpToNext } = await import('/src/game/player.js');
    const c = G.char, p = G.player, D = 521, L = depthLevel(D), lvl = L + 1;
    c.level = lvl; c.xp = Math.round(xpToNext(lvl) * 0.3); c.statPoints += (lvl - 1) * 5; c.skillPoints += (lvl - 1) + D - 1;
    for (let d = 1; d < D; d++) c.cleared[d] = true;
    c.deepest = D - 1; c.depth = D; c.gold = Math.round(800 * Math.pow(1.05, L));
    Auto.spendStats(); Auto.spendSkills(); Auto.arrangeBar();
    for (let round = 0; round < 8; round++) {
      c.bag = c.bag.map(() => null);
      for (let i = 0; i < 25 && i < c.bag.length; i++) { const it = rollItem(L - Math.floor(Math.random() * 7), { mf: 60, bonus: Math.random() < 0.12 ? 1.2 : 0.15 }); it.unid = false; c.bag[i] = it; }
      p.recompute(); Auto.optimizeGear();
    }
    c.bag = c.bag.map(() => null);
    for (const it of Object.values(c.equip)) if (it && it.type === 'gear') {
      it.upg = Math.min(6, 2 + Math.floor(L / 40)); it.sockets = Math.max(it.sockets, Math.min(it.maxSockets, 2));
      while (it.gems.length < it.sockets) { const g = rollGem(L); it.gems.push({ gem: g.gem, tier: g.tier }); }
    }
    const M = Math.min(1000, Math.round(20 + D * 1.6));
    c.bar.filter(Boolean).forEach((id, i) => { c.mastery[id] = [Math.max(1, Math.round(M * (i < 2 ? 1 : 0.55))), 0]; });
    Auto.spendSkills(); Auto.arrangeBar(); p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana;
  });
}

(async () => {
  // ================================================================ 1. the altar
  if (parts.includes('altar')) {
    const { browser, page, errors, shot } = await openGame({ width: 1280, height: 720 });
    await page.evaluate(async () => { await window.VELSCOUR.game.newChar('wizard', 'Heretic'); });
    await page.waitForTimeout(1500);
    await helpers(page);
    const t = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, H = await import('/src/game/heresies.js'), E = await import('/src/game/endgame.js');
      game.enterTown();
      const w = G.world, a = w.npcs.find((n) => n.altar), p = G.player, rift = w.portals.find((q) => q.rift);
      const path = a && w.map.findPath(p.x, p.y, a.x, a.y, 20000);
      return { altar: !!a, name: a && a.name, reach: !!(path && path.length), d: a && +Math.hypot(a.x - p.x, a.y - p.y).toFixed(1), unlocked: E.endgameUnlocked(), refused: H.setHeresy('twins', true) === false && H.heresiesOf().length === 0, rift: rift && rift.label };
    });
    console.log(JSON.stringify(t));
    check(t.altar && t.name === 'Altar of Heresy', 'the Altar of Heresy stands in town (world.npcs)');
    check(t.reach, `a path leads from the hero's arrival to the altar (${t.d} tiles)`);
    check(!t.unlocked && t.refused, 'before the Endgame setHeresy refuses');
    check(/sealed/.test(t.rift || ''), `the rift gate is sealed too ("${t.rift}")`);
    // the hero walks to the altar and 'use' opens the panel
    const walk = await page.evaluate(() => {
      const { G } = window.VELSCOUR, Heresies = G.ui.heresies;
      const p = G.player, a = G.world.npcs.find((n) => n.altar);
      p.interact = a; let n = 0;
      for (; n < 30 * 40 && !Heresies.active; n++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; window.VELSCOUR.game.update(1 / 30); }
      const body = document.querySelector('.heresy-panel');
      return { open: Heresies.active, secs: +(n / 30).toFixed(1), d: +Math.hypot(a.x - p.x, a.y - p.y).toFixed(2), locked: !!(body && body.querySelector('.hx-locked')), rows: body ? body.querySelectorAll('.hx-row').length : 0, disabled: body ? [...body.querySelectorAll('.hx-row input')].every((i) => i.disabled) : false, riftBtn: body && body.querySelector('.hx-rift').disabled, unboundBtn: body && body.querySelector('.hx-unbound').disabled };
    });
    console.log(JSON.stringify(walk));
    check(walk.open && walk.d <= 1.8, `the hero walks to the altar and it opens the panel (${walk.secs} s)`);
    check(walk.locked && walk.rows === 12 && walk.disabled, 'locked: "Velscour still sits his throne", twelve rows greyed and disabled');
    check(walk.riftBtn && walk.unboundBtn, 'locked: the Rift and Unbound doors are disabled');
    await page.click('.hx-row[data-id="twins"]', { force: true }).catch(() => {});
    check(await page.evaluate(() => window.VELSCOUR.G.char.heresy.on.length === 0), 'a click on a locked row changes nothing');
    await shot('heresies_panel_locked');
    await page.evaluate(() => window.VELSCOUR.G.ui.closePanel('heresies'));
    await page.evaluate(() => window.HX.step(0.3));
    await shot('heresies_altar_locked');
    // the Endgame opens: real clicks toggle
    await page.evaluate(async () => { const E = await import('/src/game/endgame.js'); E.unlockEndgame(); window.VELSCOUR.G.ui.heresies.open(); });
    for (const id of ['twins', 'iron', 'glass', 'twins', 'twins', 'omens']) await page.click(`.hx-row[data-id="${id}"]`);
    const on = await page.evaluate(async () => { const H = await import('/src/game/heresies.js'), c = window.VELSCOUR.G.char; return { on: c.heresy.on, rank: H.heresyRankOf(c), shown: document.querySelector('.hx-rank b').textContent, checked: [...document.querySelectorAll('.hx-row.on')].map((r) => r.dataset.id), chips: document.querySelector('.hx-chips').textContent }; });
    console.log(JSON.stringify(on));
    check(on.on.slice().sort().join() === 'glass,iron,omens,twins' && on.rank === 8 && on.shown === '8', `clicks toggle: ${on.on.join(',')} = rank ${on.rank}`);
    check(on.checked.slice().sort().join() === 'glass,iron,omens,twins', 'the rows show what is on');
    check(/x1\.16/.test(on.chips) && /\+32%/.test(on.chips), `the rewards follow the rank (${on.chips})`);
    await shot('heresies_panel_desktop');
    const scrolled = await page.evaluate(() => { const b = document.querySelector('.heresy-panel .panel-body'); b.scrollTop = 1e4; return { h: b.scrollHeight, c: b.clientHeight }; });
    await shot('heresies_panel_desktop_doors');
    console.log('panel body', JSON.stringify(scrolled));
    await page.evaluate(() => window.VELSCOUR.G.ui.closePanel('heresies'));
    await page.evaluate(() => window.HX.step(1));
    await shot('heresies_altar_lit');
    // saved and loaded again (a page reload)
    const id = await page.evaluate(async () => { const { writeSave } = await import('/src/game/save.js'); const c = window.VELSCOUR.G.char; writeSave(c); return c.id; });
    await page.reload();
    await page.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'), null, { timeout: 30000 });
    const back = await page.evaluate(async (id) => {
      const { G, game } = window.VELSCOUR, S = await import('/src/game/save.js'), E = await import('/src/game/endgame.js');
      const c = S.listSaves().find((s) => s.id === id);
      await game.loadChar(c);
      const old = JSON.parse(JSON.stringify(G.char)); delete old.heresy;
      return { on: G.char.heresy.on, unlocked: E.endgameUnlocked(), legacy: S.migrate(old).heresy };
    }, id);
    console.log(JSON.stringify(back));
    check(back.on.slice().sort().join() === 'glass,iron,omens,twins', 'the Heresies survive writeSave, a reload and loadChar');
    check(back.unlocked, 'the Endgame stays open (the shared record, localStorage)');
    check(Array.isArray(back.legacy.on) && back.legacy.on.length === 0, 'migrate gives an old save { on: [] }');
    // the doors: rift gate -> the rift dialog, Marks -> the Marks panel, Unbound disabled without keys / enabled with 3
    await page.waitForTimeout(800);
    await helpers(page);
    const doors = await page.evaluate(async () => {
      const { G } = window.VELSCOUR; const o = {};
      G.ui.heresies.open(); o.unboundOff = document.querySelector('.hx-unbound').disabled;
      document.querySelector('.hx-rift').click(); o.rift = !!document.querySelector('.rift-dialog'); o.panelClosed = !G.ui.heresies.active;
      document.querySelectorAll('.rift-dialog').forEach((d) => { d.closest('.screen').remove(); G.ui.modalCount = Math.max(0, G.ui.modalCount - 1); });
      G.ui.heresies.open(); document.querySelector('.hx-marks').click(); o.marks = !!document.querySelector('.marks-panel') && G.ui.marks.active;
      G.ui.closeAll(); G.char.keys = 3; G.ui.heresies.open(); o.unboundOn = !document.querySelector('.hx-unbound').disabled; o.keys = document.querySelector('.hx-unbound span').textContent;
      G.char.keys = 0; G.ui.closeAll();
      return o;
    });
    console.log(JSON.stringify(doors));
    check(doors.rift && doors.panelClosed, 'the Rift door opens the rift dialog (game.confirmRift)');
    check(doors.marks, 'the Marks door opens the Infernal Marks panel');
    check(doors.unboundOff && doors.unboundOn && doors.keys === '3/3 Abyssal Keys', 'Velscour Unbound: disabled without keys, open with three');
    // a dungeon built while the panel changes: the note says the level keeps its set
    const note = await page.evaluate(() => { const { G } = window.VELSCOUR; window.HX.build(31, ['twins']); G.char.heresy.on = ['twins', 'iron']; G.ui.heresies.open(); const t = document.querySelector('.hx-note').textContent; G.ui.closeAll(); return t; });
    check(/built at Heresy 3/.test(note), `inside a level the panel says changes wait for the next one ("${note.slice(-70)}")`);
    report(errors);
    await browser.close();
  }

  // ================================================================ 2. every Heresy
  if (parts.includes('effects')) {
    const { browser, page, errors, shot } = await openGame({ width: 1280, height: 720 });
    await page.evaluate(async () => { const { G, game } = window.VELSCOUR; await game.newChar('paladin', 'Heretic'); const E = await import('/src/game/endgame.js'); E.unlockEndgame(); G.godMode = true; G.char.level = 280; G.player.recompute(); }); // (no level-up banners over the shots)
    await page.waitForTimeout(1200);
    await helpers(page);
    // --- twins: the same seeded level with and without
    const tw = await page.evaluate(() => {
      const X = window.HX, out = {};
      X.build(523, [], { seed: 77 }); // warm the caches, so both seeded builds draw the same numbers
      for (const [k, ids] of [['none', []], ['twins', ['twins']]]) {
        const w = X.build(523, ids, { seed: 1234 }), f = X.foes(w);
        out[k] = { hash: X.mapHash(w), packs: f.filter((m) => m.rank !== 'boss' && !m.isRaid).length, boss: f.filter((m) => m.rank === 'boss').length };
      }
      return out;
    });
    console.log('twins', JSON.stringify(tw));
    check(tw.none.hash === tw.twins.hash, 'twins: both seeded builds made the same map');
    check(tw.twins.packs === 2 * tw.none.packs && tw.twins.boss === tw.none.boss, `twins: exactly twice the pack monsters (${tw.none.packs} -> ${tw.twins.packs}), the guardian alone`);
    // --- crowned
    const cr = await page.evaluate(async () => {
      const X = window.HX, H = await import('/src/game/heresies.js'), { makeMonster } = await import('/src/game/monster.js'), { ELITE_AFFIXES } = await import('/src/data/enemies.js');
      const count = (ids) => { const w = X.build(521, ids); H.heresyTick(w, 1); const f = X.foes(w); return { champ: f.filter((m) => m.rank === 'champion').map((m) => m.affixes.length), uniq: f.filter((m) => m.rank === 'unique').map((m) => m.affixes.length), minions: f.filter((m) => /Minion$/.test(m.name)).map((m) => m.affixes.length) }; };
      const none = count([]), on = count(['crowned']);
      // the effects: a champion missing only Extra Strong and Extra Fast gets exactly those two
      const w = X.build(521, ['crowned']); const p = w.player;
      const m = makeMonster(w, 'skeleton', w.biome, 267, 'champion', p.x + 6, p.y);
      m.affixes = Object.keys(ELITE_AFFIXES).filter((k) => !['strong', 'fast', 'multishot'].includes(k));
      const b = { dmg: m.dmg, speed: m.speed, atkCd: m.atkCd, hp: m.maxHp, n: m.affixes.length }; w.add(m);
      H.heresyTick(w, 1); H.heresyTick(w, 1);
      const u = makeMonster(w, 'skeleton', w.biome, 267, 'unique', p.x + 6, p.y + 2);
      u.affixes = Object.keys(ELITE_AFFIXES).filter((k) => !['tough', 'multishot'].includes(k)); const ub = { hp: u.maxHp, fire: u.res.fire || 0 }; w.add(u); H.heresyTick(w, 1);
      return { none, on, fx: { added: m.affixes.slice(b.n), dmg: +(m.dmg / b.dmg).toFixed(3), speed: +(m.speed / b.speed).toFixed(3), atkCd: +(m.atkCd / b.atkCd).toFixed(3), hp: +(m.maxHp / b.hp).toFixed(3) }, ufx: { added: u.affixes.slice(-1), hp: +(u.maxHp / ub.hp).toFixed(3), fire: +((u.res.fire || 0) - ub.fire).toFixed(2) } };
    });
    console.log('crowned', JSON.stringify(cr));
    const avg = (a) => (a.length ? +(a.reduce((s, v) => s + v, 0) / a.length).toFixed(2) : 0);
    check(cr.on.champ.length > 0 && cr.on.champ.every((n) => n === 4) && cr.none.champ.every((n) => n === 2), `crowned: champions carry 4 affixes (${avg(cr.none.champ)} without, ${cr.on.champ.length} champions)`);
    check(cr.on.uniq.length > 0 && cr.on.uniq.every((n) => n === 4) && cr.none.uniq.every((n) => n === 3), `crowned: uniques carry 4 (3 without, ${cr.on.uniq.length} uniques); their minions none (${cr.on.minions.every((n) => n === 0)})`);
    check(cr.fx.added.sort().join() === 'fast,strong' && cr.fx.dmg === 1.5 && cr.fx.speed === 1.4 && cr.fx.atkCd === 0.75, `crowned: the added affixes work (Extra Strong x${cr.fx.dmg} damage, Extra Fast x${cr.fx.speed} speed), once`);
    check(cr.ufx.added[0] === 'tough' && cr.ufx.hp === 1.5 && cr.ufx.fire === 0.15, `crowned: a unique's Stone Skin: x${cr.ufx.hp} life, +${cr.ufx.fire} fire resistance`);
    // --- iron + cruel: once, never compounding
    const ic = await page.evaluate(async () => {
      const X = window.HX, H = await import('/src/game/heresies.js'), { makeMonster } = await import('/src/game/monster.js');
      const w = X.build(521, ['iron', 'cruel']), p = w.player;
      const m = makeMonster(w, 'skeleton', w.biome, 267, 'normal', p.x + 8, p.y); const hp = m.maxHp, dmg = m.dmg; w.add(m);
      H.heresyTick(w, 1); const a = { hp: m.maxHp / hp, dmg: m.dmg / dmg };
      H.heresyTick(w, 1); H.heresyMonster(m, H.worldHeresies(w)); X.step(1);
      const all = X.foes(w).filter((f) => f.rank !== 'boss').every((f) => f._heresy);
      return { a, b: { hp: m.maxHp / hp, dmg: m.dmg / dmg }, all };
    });
    console.log('iron/cruel', JSON.stringify(ic));
    check(Math.abs(ic.a.hp - 1.5) < 1e-9 && Math.abs(ic.a.dmg - 1.3) < 1e-9, 'Iron Hide x1.5 life, Cruel Hand x1.3 damage');
    check(Math.abs(ic.b.hp - 1.5) < 1e-9 && Math.abs(ic.b.dmg - 1.3) < 1e-9, 'twice more (heresyTick, heresyMonster): still x1.5 / x1.3, never compounding');
    check(ic.all, 'every monster on the level is marked as it appears');
    // --- thirst
    const th = await page.evaluate(() => {
      const { G } = window.VELSCOUR, X = window.HX, p = G.player, c = G.char;
      X.build(12, ['thirst']); c.potions = { hp: 5, mp: 5, rejuv: 2, fury: 1 }; p.potionCd = 0; p.hp = p.maxHp * 0.3;
      for (const k of ['hp', 'mp', 'rejuv', 'fury']) p.usePotion(k);
      const a = { ...c.potions, regen: p.potionRegen.length };
      X.build(12, []); p.potionCd = 0; p.usePotion('hp');
      return { a, b: c.potions.hp };
    });
    check(th.a.hp === 5 && th.a.mp === 5 && th.a.rejuv === 2 && th.a.fury === 1 && th.a.regen === 0, 'Dry Throat: usePotion refuses every kind (none spent)');
    check(th.b === 4, 'without it the same hero drinks');
    // --- the Fifth Phase: a BOSS ROOM at depth 605
    const ff = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, X = window.HX, { makeRaidBoss, RAID_BOSSES } = await import('/src/game/raid.js'), { hit, kill } = await import('/src/game/combat.js');
      const { keyChance } = await import('/src/game/unbound.js');
      const out = { mods: [], mods0: [] };
      const w = X.build(605, ['fifth']), R = w.raid, b = w.boss, p = w.player;
      out.phases = R.phases.length; out.marks = R.marks; out.last = R.phases[R.phases.length - 1].name;
      // the modifiers: 60 raid bosses for this arena with the Heresy and 60 without (rolled 3 at depth 605, + the innate one)
      for (const [k, ids] of [['mods', ['fifth']], ['mods0', []]]) { w.heresy.ids = ids; for (let i = 0; i < 60; i++) { const m = makeRaidBoss(w, R.arena, 605, 308); out[k].push(m.raid.mods.filter((x) => x !== m.raid.tpl.innate).length); } }
      w.heresy.ids = ['fifth'];
      // every sig boss (4 template phases): 'Beyond the End'
      const sigs = RAID_BOSSES.filter((t) => t.sigs);
      const w2 = X.build(605, ['fifth']);
      out.sigs = sigs.map((tpl) => { const m = makeRaidBoss(w2, w2.raid.arena, 605, 308, { tpl }); return m.raid.phases.length === 5 && m.raid.phases[4].name === 'Beyond the End' && m.raid.marks.length === 4; });
      out.sigN = sigs.length;
      const shallow = X.build(20, ['fifth']).raid; out.shallow = { phases: shallow.phases.length, marks: shallow.marks, last: shallow.phases[3].name, tplLast: shallow.tpl.phases[3].name };
      // step it through every phase like tools/tests/raid.js
      const W = X.build(605, ['fifth', 'twins', 'thirst', 'cruel', 'ambush']), RR = W.raid, B = W.boss, P = W.player;
      out.keyRank10 = keyChance(W, B); out.keyRank9 = keyChance(X.build(605, ['twins', 'thirst', 'cruel']), G.world.boss);
      G.world = W; // (the last build replaced it; go back to the stepped one)
      P.update = function () { this.hp = this.maxHp; this.mana = this.maxMana; };
      const step = (n) => { for (let i = 0; i < n; i++) W.update(1 / 30); };
      for (const c of W.creatures) if (c.team === 'enemy' && c !== B) c.dead = true;
      const g = RR.arena.gate; P.x = g.x - 3; P.y = g.y0 + 1.5; step(10); P.x = g.x + 3; P.y = g.y0 + 1.5; step(10);
      out.log = [];
      for (let k = 0; k < RR.marks.length; k++) {
        B.hp = B.maxHp * RR.marks[k] - 1; step(5);
        const wards = RR.wards.filter((c) => !c.dead).length;
        for (const c of RR.wards) if (!c.dead) hit(P, c, c.maxHp * 2, 'fire', { crit: false });
        step(10); out.log.push(`${RR.marks[k]}:${wards}w->${RR.label().split(' · ').slice(0, 2).join(' · ')}`);
      }
      out.final = RR.label();
      kill(B, P, {}); step(10); out.dead = B.dead;
      return out;
    });
    console.log('fifth', JSON.stringify(ff));
    check(ff.phases === 5 && ff.marks.join() === '0.78,0.58,0.38,0.18' && ff.last === 'Beyond the End', `the Fifth Phase: 5 phases, marks ${ff.marks.join('/')}, the last "${ff.last}"`);
    check(Math.min(...ff.mods) >= 3 && avg(ff.mods) - avg(ff.mods0) >= 0.85, `one more modifier (rolled, past the innate one: ${avg(ff.mods0)} -> ${avg(ff.mods)} on average over 60 bosses)`);
    check(ff.sigs.every(Boolean), `all ${ff.sigN} signature bosses (4 template phases) get "Beyond the End"`);
    check(ff.shallow.phases === 4 && ff.shallow.last === ff.shallow.tplLast && ff.shallow.marks.join() === '0.78,0.48,0.18', `a shallow BOSS ROOM (3 phases) takes its template's 4th (${ff.shallow.last}; ${ff.shallow.marks.join('/')})`);
    check(ff.log.length === 4 && /Phase 5\/5 · Beyond the End/.test(ff.final) && ff.dead, `stepped through every phase: ${ff.log.join(' | ')}`);
    check(Math.abs(ff.keyRank10 - 0.07) < 1e-9 && ff.keyRank9 === 0, `Abyssal Key odds at depth 605: ${ff.keyRank10} at rank 10, ${ff.keyRank9} at rank 9`);
    // --- the Legion: a plain depth, the Breach, never a rift
    await page.evaluate(async () => { const { G, game } = window.VELSCOUR, { BIOME_BY_ID } = await import('/src/data/biomes.js'); await game.loadLevelArt(BIOME_BY_ID.catacombs); });
    const lg = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, X = window.HX, { depthLevel } = await import('/src/data/depth.js'), { loadArtFor } = await import('/src/core/enemyart.js');
      const out = {};
      const w = X.build(521, ['legion']); out.t0 = +w.legionT.toFixed(1);
      for (const m of X.foes(w)) if (Math.hypot(m.x - w.player.x, m.y - w.player.y) < 16) m.dead = true; // a clear view of the gate
      await loadArtFor(w.creatures.map((m) => m.art).filter(Boolean), true).catch(() => {});
      return out;
    });
    await page.waitForTimeout(3300); // (the level's banner fades on the wall clock)
    Object.assign(lg, await page.evaluate(() => { const w = window.VELSCOUR.G.world; w.legionT = 0.05; window.HX.step(0.4); return { gate: w.hazards.length > 0, next: +w.legionT.toFixed(1) }; }));
    await shot('heresies_legion_gate');
    const lg2 = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, X = window.HX, { depthLevel } = await import('/src/data/depth.js'), w = G.world, out = {};
      X.step(1.2);
      const pit = () => w.creatures.filter((c) => c.pitSpawn && !c.dead);
      const { loadArtFor } = await import('/src/core/enemyart.js'); await loadArtFor(pit().map((c) => c.art).filter(Boolean), true).catch(() => {});
      out.n = pit().length; out.levels = [...new Set(pit().map((c) => c.level))]; out.want = depthLevel(521) - 2;
      out.names = [...new Set(pit().map((c) => c.name))];
      const d = pit().map((c) => Math.hypot(c.x - w.player.x, c.y - w.player.y)); out.near = Math.max(...d);
      return out;
    });
    await page.waitForTimeout(600); await page.evaluate(() => window.HX.step(0.6));
    await shot('heresies_legion_demons');
    const lg3 = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, X = window.HX, w = G.world, out = {};
      const pit = () => w.creatures.filter((c) => c.pitSpawn && !c.dead).length;
      for (let i = 0; i < 6; i++) { w.legionT = 0.02; X.step(1.4); out.max = Math.max(out.max || 0, pit()); }
      out.cap = pit();
      // the clock stands still while the guardian is awake
      // (on a fresh seeded level: on this one the guardian can be dead by now)
      const wb = X.build(521, ['legion'], { seed: 77 }), b = wb.boss; b.awake = true; wb.legionT = 3; X.step(4); out.paused = +wb.legionT.toFixed(2); out.bossDead = b.dead; b.awake = false; X.step(2); out.ran = +wb.legionT.toFixed(2);
      // the Eternal Breach
      game.buildBreach(3); const B = G.world; out.breach = !!B.breach && B.heresy && B.heresy.ids.includes('legion');
      for (const m of X.foes(B)) if (Math.hypot(m.x - B.player.x, m.y - B.player.y) < 12) m.dead = true;
      B.legionT = 0.02; X.step(2); out.breachPit = B.creatures.filter((c) => c.pitSpawn && !c.dead).length;
      out.breachSub = document.getElementById('area-sub').textContent;
      // an Abyssal Rift: no Heresy at all
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      game.buildRift(1, BIOME_BY_ID.catacombs); const R = G.world; out.rift = { heresy: R.heresy || null, legionT: R.legionT, rank: R.heresy ? R.heresy.rank : 0 };
      X.step(5); out.riftPit = R.creatures.filter((c) => c.pitSpawn).length;
      // Velscour Unbound: none either
      G.unboundNext = true; game.buildDungeon(500, BIOME_BY_ID.throne); const U = G.world; out.unbound = { unbound: U.unbound, heresy: U.heresy || null };
      game.enterTown();
      return out;
    });
    console.log('legion', JSON.stringify({ ...lg, ...lg2, ...lg3 }));
    check(lg.t0 >= 25 && lg.t0 <= 40 && lg.gate, `the Legion: the first hellgate in ${lg.t0} s; it opens beside the hero`);
    check(lg2.n >= 2 && lg2.n <= 4 && lg2.levels.length === 1 && lg2.levels[0] === lg2.want && lg2.near < 9, `2-4 demons climb out (${lg2.n}: ${lg2.names.join(', ')}) at level ${lg2.levels.join()} = depthLevel - 2, near the hero`);
    check(lg.next >= 39.5 && lg.next <= 55, `the next in 40-55 s (${lg.next} s left 0.35 s after it opened)`);
    check(lg3.max <= 8, `never more than 8 alive (${lg3.max} after six forced gates)`);
    check(lg3.paused === 3 && Math.abs(lg3.ran - 1) < 0.05, `the clock stands still while the guardian is awake (${lg3.paused}), runs again after (${lg3.ran})`);
    check(lg3.breach && lg3.breachPit >= 2, `the Eternal Breach too (${lg3.breachPit} demons on floor 3)`);
    check(/Heresy 3/.test(lg3.breachSub), `the Breach's subtitle shows the rank ("${lg3.breachSub}")`);
    check(!lg3.rift.heresy && lg3.rift.legionT === undefined && lg3.riftPit === 0, 'never in an Abyssal Rift (world.heresy null, no clock, no demons)');
    check(lg3.unbound.unbound && !lg3.unbound.heresy, 'never in Velscour Unbound');
    // --- ambush weather
    const am = await page.evaluate(async () => {
      const X = window.HX, { ambushTick } = await import('/src/game/mayhem.js'), out = {};
      for (const [k, ids] of [['none', []], ['on', ['ambush']]]) {
        const w = X.build(31, ids); for (const m of X.foes(w)) m.dead = true;
        ambushTick(w, 0.01); const first = w.ambushT;
        const after = []; for (let i = 0; i < 20; i++) { w.ambushT = 0.001; ambushTick(w, 0.01); after.push(w.ambushT); for (const m of X.foes(w)) m.dead = true; }
        out[k] = { mul: w.heresyAmbush || 1, first: +first.toFixed(1), lo: +Math.min(...after).toFixed(1), hi: +Math.max(...after).toFixed(1) };
      }
      return out;
    });
    console.log('ambush', JSON.stringify(am));
    check(am.on.mul === 3 && am.on.first <= 40 / 3 + 0.01 && am.on.hi <= am.none.lo, `Ambush Weather: the wait a third (first ${am.on.first} s vs ${am.none.first}; then ${am.on.lo}-${am.on.hi} s vs ${am.none.lo}-${am.none.hi})`);
    // --- Black Omens: every omenable depth, the portal cards, the Nemesis
    const om = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, X = window.HX, out = { on: [], none: [] };
      for (const d of [31, 32, 33, 34, 36, 37, 38, 39]) { out.on.push(X.build(d, ['omens']).happen.omen || null); out.none.push(X.build(d, []).happen.omen || null); }
      const arch = X.build(31, []).roster[0];
      G.char.nemesis = { arch, art: null, swap: null, name: 'Gorrak', title: 'the Gloating', depth: 300, kills: 1 };
      out.nemOn = !!X.build(31, ['omens']).happen.nemesis; G.char.nemesis = { arch, art: null, swap: null, name: 'Gorrak', title: 'the Gloating', depth: 300, kills: 1 };
      out.nemOff = !!X.build(31, []).happen.nemesis; G.char.nemesis = null;
      out.cards = [];
      for (let i = 0; i < 30 && out.cards.flat().filter((cd) => cd.tag === 'Dungeon').length < 6; i++) {
        X.build(31, ['omens']); game.portalChoice(G.world);
        out.cards.push([...document.querySelectorAll('.portal-choice .pc-card')].map((e) => { const tag = e.querySelector('.pc-tag').textContent, om = [...e.querySelectorAll('.pc-omen')].find((o) => o.querySelector('b').textContent !== 'Commission'); return { tag, omen: om ? (om.classList.contains('dim') ? 'none' : om.querySelector('b').textContent) : null }; }));
        document.querySelectorAll('.portal-choice').forEach((d) => { d.closest('.screen').remove(); G.ui.modalCount = Math.max(0, G.ui.modalCount - 1); });
        game.pick = null;
      }
      return out;
    });
    console.log('omens', JSON.stringify(om));
    check(om.on.every(Boolean), `Black Omens: every omenable depth has an omen (${om.on.join(', ')}); without: ${om.none.filter(Boolean).length}/8`);
    const dun = om.cards.flat().filter((cd) => cd.tag === 'Dungeon');
    check(dun.length >= 6 && dun.every((cd) => cd.omen && cd.omen !== 'none'), `every dungeon card at the portal shows an omen (${dun.map((cd) => cd.omen).join(', ')}; overworld cards carry none)`);
    check(om.nemOn && !om.nemOff, 'a Nemesis from depth 300 returns at depth 31 under Black Omens (and not without)');
    // --- Glass Cannon: on the sheet only where it is in force
    const gl = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, X = window.HX, p = G.player, { BIOME_BY_ID } = await import('/src/data/biomes.js');
      const sheet = () => { G.char.blessing = null; p.recompute(); return { hp: p.maxHp, dmg: p.st.dmgPct }; }; // (a town blessing would move the numbers)
      X.on([]); game.enterTown(); const base = sheet();
      X.on(['glass']); const town = sheet();
      game.buildRift(1, BIOME_BY_ID.catacombs); const rift = sheet();
      game.enterTown(); const back = sheet();
      X.build(30, ['glass']); const dun = sheet();
      const w2 = X.build(31, []); X.on(['glass']); const other = sheet(); // the level was built without it
      return { base, town, rift, back, dun, other };
    });
    console.log('glass', JSON.stringify(gl));
    check(Math.abs(gl.town.hp / gl.base.hp - 0.75) < 0.01 && gl.town.dmg - gl.base.dmg === 15, `Glass Cannon in town: life x${(gl.town.hp / gl.base.hp).toFixed(3)}, damage +${gl.town.dmg - gl.base.dmg}%`);
    check(gl.rift.hp === gl.base.hp && gl.rift.dmg === gl.base.dmg, 'off in an Abyssal Rift (game.setWorld recomputes)');
    check(gl.back.hp === gl.town.hp && gl.dun.hp === gl.town.hp && gl.dun.dmg === gl.town.dmg, 'on again back in town and in a level built with it');
    check(gl.other.hp === gl.base.hp, 'not in a level built without it (the level\'s set rules)');
    // --- Hunger of the Abyss: no orbs over 200 kills, no regeneration
    const hu = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, X = window.HX, { makeMonster } = await import('/src/game/monster.js'), { kill } = await import('/src/game/combat.js'), { GroundItem } = await import('/src/game/loot.js');
      const run = (ids) => {
        const w = X.build(21, ids), p = w.player, arch = w.roster[0];
        for (let i = 0; i < 200; i++) { const m = makeMonster(w, arch, w.biome, 21, 'normal', p.x + 3, p.y); w.add(m); kill(m, p, {}); }
        const orbs = w.loot.filter((g) => g.kind === 'orb_hp' || g.kind === 'orb_mp').length;
        w.addLoot(new GroundItem(p.x, p.y, 'orb_hp', {})); // the Feeding Frenzy omen's way in
        return { orbs, frenzy: w.loot.filter((g) => g.kind === 'orb_hp' || g.kind === 'orb_mp').length - orbs, regen: +p.st.lifeRegen.toFixed(2), items: w.loot.filter((g) => g.kind === 'item').length };
      };
      return { on: run(['hunger']), none: run([]) };
    });
    console.log('hunger', JSON.stringify(hu));
    check(hu.on.orbs === 0 && hu.on.frenzy === 0 && hu.none.orbs > 10, `Hunger of the Abyss: no orbs from 200 kills (${hu.none.orbs} without), none from other sources`);
    check(hu.on.regen === 0 && hu.none.regen > 0, `no life regeneration (${hu.on.regen} vs ${hu.none.regen}/s)`);
    // --- Velscour's Gaze
    const gz = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, X = window.HX, H = await import('/src/game/heresies.js'), { makeMonster } = await import('/src/game/monster.js'), out = {};
      for (const [k, ids] of [['none', []], ['on', ['gaze']]]) {
        const w = X.build(21, ids, { seed: 2100 }), p = w.player, map = w.map;
        for (const m of X.foes(w)) if (m.rank !== 'boss') m.dead = true;
        const len = (x, y) => { const q = map.findPath(x, y, p.x, p.y, 40000); let L = 0; if (q) for (let i = 1; i < q.length; i++) L += Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); return +L.toFixed(1); };
        // a spot 40+ tiles from the hero and 50+ tiles of path, walkable and joined to him
        let spot = null;
        for (let i = 0; i < 4000 && !spot; i++) { const x = 1 + Math.random() * (map.w - 2), y = 1 + Math.random() * (map.h - 2); if (map.walkable(x, y) && Math.hypot(x - p.x, y - p.y) > 40 && len(x, y) > 50) spot = [x, y]; }
        const m = makeMonster(w, 'skeleton', w.biome, 21, 'normal', spot[0], spot[1]); w.add(m); H.heresyTick(w, 1);
        const walk = () => len(m.x, m.y);
        out[k] = { range: m.aggroRange, gaze: !!m.gaze, d0: walk() };
        m.awake = true; out[k].target = m.pickTarget() === p;
        p.update = function () { this.hp = this.maxHp; };
        for (let i = 0; i < 30 * 8; i++) w.update(1 / 30);
        out[k].d1 = walk(); out[k].speed = +m.speed.toFixed(2); out[k].eu = +Math.hypot(m.x - p.x, m.y - p.y).toFixed(1); out[k].tgt = m.target ? m.target.name || m.target.constructor.name : null; out[k].home = +Math.hypot(m.x - m.home[0], m.y - m.home[1]).toFixed(1);
        const boss = w.boss; out[k].bossRange = boss ? boss.aggroRange : null;
      }
      return out;
    });
    console.log('gaze', JSON.stringify(gz));
    check(gz.on.gaze && Math.abs(gz.on.range / gz.none.range - 2) < 1e-9, `Velscour's Gaze: aggro range ${gz.none.range} -> ${gz.on.range} tiles`);
    check(gz.on.target && !gz.none.target, `an awake monster ${gz.on.d0} tiles of path away keeps the hero (without it, it forgets him)`);
    check(gz.on.d1 < gz.on.d0 - 15 && gz.none.home < 4 && !gz.none.tgt, `it comes for him: ${gz.on.d0} -> ${gz.on.d1} tiles of path in 8 s (without: it idles ${gz.none.home} tiles from its spot)`);
    // --- the rank: HUD subtitle, Quest Log, dials at 26, the rank-20 Mark
    const rk = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, X = window.HX, H = await import('/src/game/heresies.js'), M = await import('/src/game/marks.js'), { toggleQuest } = await import('/src/ui/quest.js');
      const ALL = H.HERESIES.map((h) => h.id), out = {}, { OMENS } = await import('/src/game/happenings.js'); // (before the build: an await after it lets a frame mark the monsters)
      const w = X.build(521, ALL);
      out.rank = w.heresy.rank; out.sub = document.getElementById('area-sub').textContent;
      const O = (w.happen && OMENS[w.happen.omen]) || {}; // Black Omens: the level's omen multiplies loot and gold too
      out.omen = w.happen && w.happen.omen;
      out.dials = { loot: +(w.lootMul / (O.loot || 1)).toFixed(3), gold: +(w.goldMul / (O.gold || 1)).toFixed(3), mf: w.mfAdd, sigil: +w.sigilMul.toFixed(3), relic: +w.relicMul.toFixed(3) };
      const m = X.foes(w).find((f) => f.rank === 'normal'); const xp0 = m.xp; H.heresyTick(w, 1); out.xp = +(m.xp / xp0).toFixed(3);
      toggleQuest(); out.quest = [...document.querySelectorAll('.panel')].map((p) => p.textContent).join(' ').match(/Heresy rank \d+ \([^)]*\)/)?.[0] || '';
      return out;
    });
    await page.evaluate(() => { window.HX.step(0.2); const h = [...document.querySelectorAll('.q-sec h3')].find((e) => e.textContent === 'The Endgame'); if (h) h.scrollIntoView(); });
    await shot('heresies_quest_log');
    await page.evaluate(() => window.VELSCOUR.G.ui.closeAll());
    await page.evaluate(() => window.HX.step(3.5));
    await shot('heresies_hud_rank26');
    const mk = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, X = window.HX, M = await import('/src/game/marks.js');
      const out = {};
      X.build(522, ['twins', 'crowned', 'thirst', 'legion', 'iron', 'cruel', 'fifth', 'ambush', 'omens']); out.r20 = G.world.heresy.rank;
      const a = M.marksTotal(); game.brokeThrough(522); game.brokeThrough(522); out.r20marks = M.marksTotal() - a;
      X.build(522, ['twins', 'crowned', 'thirst', 'legion', 'iron', 'cruel', 'ambush', 'glass']); out.r19 = G.world.heresy.rank;
      const b = M.marksTotal(); game.brokeThrough(522); out.r19marks = M.marksTotal() - b;
      return out;
    });
    console.log('rank', JSON.stringify({ ...rk, ...mk }));
    check(rk.rank === 26 && /Heresy 26/.test(rk.sub), `all twelve: rank 26, the HUD subtitle says so ("${rk.sub}")`);
    check(rk.dials.loot === 1.52 && rk.dials.gold === 2.04 && rk.dials.mf === 104 && rk.dials.sigil === 2.3 && rk.dials.relic === 2.04, `heresyWorld at 26: ${JSON.stringify(rk.dials)}`);
    check(rk.xp === 1.52, `XP per monster x${rk.xp}`);
    check(/Heresy rank 26/.test(rk.quest), `the Quest Log shows them ("${rk.quest.slice(0, 80)}...")`);
    check(mk.r20 === 20 && mk.r20marks === 1, `rank 20: +1 Infernal Mark for the depth cleared (once: ${mk.r20marks})`);
    check(mk.r19 === 19 && mk.r19marks === 0, 'rank 19: none');
    report(errors);
    await browser.close();
  }

  // ================================================================ 3. auto-play under Dry Throat
  if (parts.includes('auto')) {
    const { browser, page, errors } = await openGame({ width: 1280, height: 720 });
    await page.evaluate(async () => { const { G, game } = window.VELSCOUR; await game.newChar('wizard', 'Thirsty'); const E = await import('/src/game/endgame.js'); E.unlockEndgame(); });
    await page.waitForTimeout(1200);
    await helpers(page);
    const au = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, X = window.HX, { Auto } = await import('/src/game/autoplay.js'), p = G.player, c = G.char, out = {};
      for (const [k, ids, secs] of [['thirst', ['thirst', 'twins', 'iron'], 120], ['none', [], 30]]) {
        X.build(4, ids); c.potions = { hp: 10, mp: 10, rejuv: 3, fury: 2 }; G.godMode = true;
        let calls = 0; const use = p.usePotion; p.usePotion = function (kind) { calls++; return use.call(this, kind); };
        Auto.toggle(true);
        let kills0 = c.kills || 0;
        for (let t = 0; t < secs * 30; t++) { if (t % 30 === 0) { p.hp = p.maxHp * 0.2; p.mana = p.maxMana * 0.1; } G.dt = 1 / 30; G.time += G.dt; G.frame++; game.update(1 / 30); if (t % 300 === 0) await new Promise((r) => setTimeout(r, 0)); }
        Auto.toggle(false); delete p.usePotion;
        out[k] = { calls, potions: { ...c.potions }, depth: G.world.depth, kills: (c.kills || 0) - kills0, status: Auto.status };
      }
      return out;
    });
    console.log('auto', JSON.stringify(au));
    check(au.thirst.calls === 0 && au.thirst.potions.hp >= 10 && au.thirst.potions.mp >= 10, `auto-play under Dry Throat never tries a potion (2 min at 20% life: ${au.thirst.calls} calls, belt ${JSON.stringify(au.thirst.potions)})`);
    check(au.none.calls > 0, `without it, the same low life makes it drink (${au.none.calls} calls in 30 s)`);
    report(errors);
    await browser.close();
  }

  // ================================================================ 4. depth 520: what every Heresy costs
  if (parts.includes('balance')) {
    const { browser, page, errors } = await openGame({ width: 1280, height: 720 });
    await page.evaluate(async () => { const { G, game } = window.VELSCOUR; await game.newChar('paladin', 'Measure'); const E = await import('/src/game/endgame.js'); E.unlockEndgame(); });
    await page.waitForTimeout(1200);
    await helpers(page);
    await gear521(page);
    const ALLIDS = JSON.stringify(ALL);
    const bal = await page.evaluate(async (ALL) => {
      const { G, game } = window.VELSCOUR, X = window.HX, H = await import('/src/game/heresies.js'), { Auto } = await import('/src/game/autoplay.js'), { OMENS } = await import('/src/game/happenings.js');
      const out = {};
      for (const [k, ids] of [['none', []], ['twins', ['twins']], ['all', ALL]]) {
        const lv = [];
        for (let i = 0; i < 2; i++) {
          const b0 = performance.now(), w = X.build(520 + i, ids, { seed: 500 + i }), bms = performance.now() - b0; H.heresyTick(w, 1); const f = X.foes(w); // seeded: every set builds the same two levels
          // update() per frame, the hero standing at the start (god mode, 300 frames)
          G.godMode = true; let ms = 0;
          for (let t = 0; t < 300; t++) { G.dt = 1 / 30; G.time += G.dt; G.frame++; const a = performance.now(); game.update(1 / 30); ms += performance.now() - a; if (t % 60 === 0) await new Promise((r) => setTimeout(r, 0)); }
          lv.push({ bms, ms: ms / 300, awake: X.foes(w).filter((m) => m.awake).length, n: f.length, champ: f.filter((m) => m.rank === 'champion').map((m) => m.affixes.length), uniq: f.filter((m) => m.rank === 'unique').map((m) => m.affixes.length) });
        }
        const flat = (k2) => lv.flatMap((l) => l[k2]);
        const w = G.world;
        out[k] = { monsters: lv.map((l) => l.n), buildMs: lv.map((l) => Math.round(l.bms)), champs: flat('champ').length, champAff: +(flat('champ').reduce((s, v) => s + v, 0) / Math.max(1, flat('champ').length)).toFixed(2), uniqAff: +(flat('uniq').reduce((s, v) => s + v, 0) / Math.max(1, flat('uniq').length)).toFixed(2), dials: { loot: +((w.lootMul || 1) / ((w.happen && OMENS[w.happen.omen] || {}).loot || 1)).toFixed(2), gold: +((w.goldMul || 1) / ((w.happen && OMENS[w.happen.omen] || {}).gold || 1)).toFixed(2), mf: w.mfAdd || 0, sigil: +(w.sigilMul || 1).toFixed(2), relic: +(w.relicMul || 1).toFixed(2) } };
        out[k].updMs = +(lv.reduce((a, l) => a + l.ms, 0) / lv.length).toFixed(2); out[k].awake = lv.map((l) => l.awake);
        // auto-play from the start, god mode, three levels of 90 s: seconds to the first 25 kills (a room's worth), kills,
        // update() cost; then one level without god mode: does a hero geared for the depth live through 90 s?
        const runs = [];
        for (let i = 0; i < 3; i++) runs.push(await X.play(90, true, ids));
        const live = await X.play(90, false, ids);
        const mean = (f) => +(runs.reduce((a, r) => a + f(r), 0) / runs.length).toFixed(2);
        Object.assign(out[k], { t25: runs.map((r) => (r.t25 === null ? null : +r.t25.toFixed(1))), t25avg: mean((r) => (r.t25 === null ? 90 : r.t25)), kills90: runs.map((r) => r.kills), autoUpdMs: mean((r) => r.ms), autoUpdMax: +Math.max(...runs.map((r) => r.max)).toFixed(1), awake90: runs.map((r) => r.awake), pit: runs.map((r) => r.pit), live });
      }
      return out;
    }, ALL);
    for (const [k, v] of Object.entries(bal)) console.log(k.padEnd(6), JSON.stringify(v));
    check(bal.twins.monsters.every((n, i) => n > bal.none.monsters[i] * 1.7), `Twinned Packs: ${bal.none.monsters.join('/')} -> ${bal.twins.monsters.join('/')} monsters at depths 520/521`);
    check(bal.all.champAff >= bal.none.champAff + 2 - 1e-9, `champions: ${bal.none.champAff} -> ${bal.all.champAff} affixes; uniques ${bal.none.uniqAff} -> ${bal.all.uniqAff}`);
    check(bal.all.dials.loot === 1.52 && bal.all.dials.mf === 104, `dials at rank 26: ${JSON.stringify(bal.all.dials)}`);
    check(bal.none.t25avg < 90 && bal.all.t25avg < 90, `auto-play (god mode) from the start, 25 kills in ${bal.none.t25avg} s without (${bal.none.t25.join('/')}), ${bal.twins.t25avg} s with Twinned Packs (${bal.twins.t25.join('/')}), ${bal.all.t25avg} s under all twelve (${bal.all.t25.join('/')}); kills in 90 s ${bal.none.kills90.join('/')} | ${bal.twins.kills90.join('/')} | ${bal.all.kills90.join('/')}`);
    console.log(`update() per frame under auto-play: none ${bal.none.autoUpdMs} ms (max ${bal.none.autoUpdMax}), twins ${bal.twins.autoUpdMs} (max ${bal.twins.autoUpdMax}), all ${bal.all.autoUpdMs} (max ${bal.all.autoUpdMax}); awake after 90 s ${bal.none.awake90.join('/')} | ${bal.twins.awake90.join('/')} | ${bal.all.awake90.join('/')}`);
    for (const k of ['none', 'twins', 'all']) console.log(`no god mode, 90 s at depth 521 (${k}): ${bal[k].live.died !== null ? `DIED at ${bal[k].live.died} s` : 'lived'}, lowest life ${Math.round(bal[k].live.minHp * 100)}%, ${bal[k].live.kills} kills, ${bal[k].live.pots} life potions`);
    const ar = bal.twins.autoUpdMs / bal.none.autoUpdMs;
    if (ar > 2) console.log(`NOTE under auto-play Twinned Packs cost x${ar.toFixed(2)} per update (> 2x)`);
    check(ar < 3, `under auto-play Twinned Packs cost x${ar.toFixed(2)} per update (< 3x); all twelve x${(bal.all.autoUpdMs / bal.none.autoUpdMs).toFixed(2)}`);
    const ratio = bal.twins.updMs / bal.none.updMs;
    console.log(`update() per frame, standing at the start (2 levels x 300 frames): none ${bal.none.updMs} ms, twins ${bal.twins.updMs} ms (x${ratio.toFixed(2)}), all ${bal.all.updMs} ms (x${(bal.all.updMs / bal.none.updMs).toFixed(2)}); build ${bal.none.buildMs.join('/')} vs ${bal.twins.buildMs.join('/')} vs ${bal.all.buildMs.join('/')} ms`);
    if (ratio > 2) console.log(`NOTE Twinned Packs cost x${ratio.toFixed(2)} per update standing still (> 2x): see the cap proposed in docs/ENDGAME.md`);
    check(ratio < 3, `Twinned Packs cost x${ratio.toFixed(2)} per update standing still (< 3x; the brief's worry is 2x)`);
    report(errors);
    await browser.close();
  }

  // ================================================================ 4b. each Heresy alone (opt-in: 'each')
  if (parts.includes('each')) {
    const { browser, page, errors } = await openGame({ width: 1280, height: 720 });
    await page.evaluate(async () => { const { G, game } = window.VELSCOUR; await game.newChar(window.EACH_CLASS || 'paladin', 'Measure'); const E = await import('/src/game/endgame.js'); E.unlockEndgame(); });
    await page.waitForTimeout(1200);
    await helpers(page);
    await gear521(page);
    const SECS = +(process.env.HX_SECS || 60), RUNS = +(process.env.HX_RUNS || 2);
    for (const id of ['none', ...ALL, 'all']) {
      const ids = id === 'none' ? [] : id === 'all' ? ALL : [id];
      const r = await page.evaluate(async ({ ids, SECS, RUNS }) => { const out = []; for (let i = 0; i < RUNS; i++) out.push(await window.HX.play(SECS, false, ids)); return out; }, { ids, SECS, RUNS });
      console.log(`${id.padEnd(7)} ${r.map((x) => (x.died !== null ? `DIED ${x.died}s` : `lived ${Math.round(x.minHp * 100)}%`)).join(', ').padEnd(26)} kills ${r.map((x) => x.kills).join('/')}  life potions ${r.map((x) => x.pots).join('/')}`);
    }
    report(errors);
    await browser.close();
  }

  // ================================================================ 5. phone
  if (parts.includes('phone')) {
    const { browser, page, errors, shot } = await openGame({ width: 844, height: 390, mobile: true });
    await page.evaluate(async () => { await window.VELSCOUR.game.newChar('ranger', 'Pocket'); });
    await page.waitForTimeout(1500);
    await helpers(page);
    await page.evaluate(() => { const { G } = window.VELSCOUR; const a = G.world.npcs.find((n) => n.altar); G.player.x = a.x + 1; G.player.y = a.y + 1; window.HX.step(0.5); a.use(); });
    await page.waitForTimeout(300);
    await shot('heresies_phone_locked');
    await page.evaluate(async () => { const E = await import('/src/game/endgame.js'); E.unlockEndgame(); window.VELSCOUR.G.ui.heresies.open(); });
    for (const id of ['twins', 'legion', 'gaze']) await page.tap(`.hx-row[data-id="${id}"]`);
    const ph = await page.evaluate(() => {
      const { G } = window.VELSCOUR, b = document.querySelector('.heresy-panel'), body = b.querySelector('.panel-body'), r = b.getBoundingClientRect(), row = b.querySelector('.hx-row').getBoundingClientRect(), sw = b.querySelector('.hx-sw').getBoundingClientRect();
      const cols = new Set([...b.querySelectorAll('.hx-row')].map((e) => Math.round(e.getBoundingClientRect().left))).size;
      return { on: G.char.heresy.on, w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, cols, rowH: Math.round(row.height), sw: [Math.round(sw.width), Math.round(sw.height)], scroll: body.scrollHeight > body.clientHeight, overflowX: body.scrollWidth > body.clientWidth + 1 };
    });
    console.log('phone', JSON.stringify(ph));
    check(ph.on.join() === 'twins,legion,gaze', 'taps toggle on a touch screen');
    check(ph.cols === 1 && ph.rowH >= 44 && ph.sw[0] >= 44, `one column, rows ${ph.rowH} px, toggles ${ph.sw.join('x')} px`);
    check(ph.w <= ph.vw && ph.h <= ph.vh && ph.scroll && !ph.overflowX, `the panel fits the screen (${ph.w}x${ph.h} of ${ph.vw}x${ph.vh}) and scrolls`);
    await page.evaluate(() => { document.querySelector('.heresy-panel .panel-body').scrollTop = 0; });
    await page.waitForTimeout(200);
    await shot('heresies_phone_panel');
    await page.evaluate(() => { const b = document.querySelector('.heresy-panel .panel-body'); b.scrollTop = 1e4; });
    await page.waitForTimeout(200);
    await shot('heresies_phone_doors');
    const doorH = await page.evaluate(() => Math.round(document.querySelector('.hx-door').getBoundingClientRect().height));
    check(doorH >= 44, `the doors are big enough to tap (${doorH} px)`);
    await page.evaluate(async () => { const { G } = window.VELSCOUR; G.ui.closeAll(); G.godMode = true; window.HX.build(521, ['twins', 'legion', 'gaze']); window.HX.step(0.5); });
    await page.waitForTimeout(300);
    const sub = await page.evaluate(() => document.getElementById('area-sub').textContent);
    check(/Heresy 8/.test(sub), `the phone HUD subtitle: "${sub}"`);
    await shot('heresies_phone_hud');
    report(errors);
    await browser.close();
  }
  console.log(fails ? `${fails} FAILED` : 'ALL OK');
  if (fails) process.exitCode = 1;
})();
