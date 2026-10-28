// Infernal Marks (docs/ENDGAME.md section 4: game/marks.js, ui/marks.js, the shared record in game/endgame.js):
//  1. XP past the cap: a level-599 hero's spare XP at level 600 becomes Marks; a level-600 paladin kills a whole
//     depth-1200 level (god mode) through combat.kill -> Player.gainXp: Marks rise one per markXp(), nothing is lost
//     (every XP point lands in pts or marks.xp), a float text and a log line; a Mark is saved at once, XP alone at most
//     every 5 s and on autosave, and marks.xp survives a page reload; the HUD XP bar and the sheet's XP line show the
//     progress to the next Mark at the cap.
//  2. Spending: free count, +n, more than free, reset, autoSpend spreads, the bonuses on the hero (100 Vitality =
//     +15.1% maxHp exactly, 500 = +29.1%, +5.0 crit inside the 75 clamp, +25.2 MF, +30.3 s on riftTime()), a damaged
//     record clamped, mergeEndgame's base rules (the cloud side is in cloud.js).
//  3. Shared: a second hero of another class has the same bonuses; deleting heroes keeps the Marks; the panel (its
//     buttons by click), the sheet's row and button, the Quest Log line, the skull's "marks"; desktop + phone shots.
//   node tools/tests/marks.js
const { openGame, report } = require('./harness');

(async () => {
  let fails = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
  const shots = [];
  const errs = [];
  const { browser, page, errors, shot } = await openGame({ width: 1280, height: 720 });
  const snap = async (s, name) => { await s(name); shots.push(name); };
  try {
    await page.evaluate(async () => { await window.VELSCOUR.game.newChar('paladin', 'Markbearer'); });
    await page.waitForTimeout(400);

    // ---------------------------------------------- 1. XP past the cap
    const spare = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, c = G.char, p = G.player;
      const { endgame } = await import('/src/game/endgame.js');
      const { markXp } = await import('/src/game/marks.js');
      const { xpToNext, MAX_LEVEL } = await import('/src/game/player.js');
      c.level = MAX_LEVEL - 1; c.xp = 0; p.recompute();
      const n = xpToNext(MAX_LEVEL - 1) + markXp() * 2.5, g = Math.round(n * (1 + p.st.xpPct / 100)), left = g - xpToNext(MAX_LEVEL - 1);
      p.gainXp(n, true);
      const m = endgame().marks;
      return { level: c.level, cxp: c.xp, pts: m.pts, xp: m.xp, want: Math.floor(left / markXp()), wantXp: left % markXp(), cost: markXp() };
    });
    check(spare.level === 600 && spare.cxp === 0 && spare.pts === spare.want && Math.abs(spare.xp - spare.wantXp) < 1,
      `level 599 -> 600: the last level's spare XP counts (${spare.pts} Marks + ${Math.round(spare.xp)} XP; one Mark = ${spare.cost.toLocaleString()} XP)`);

    const run = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR, c = G.char, p = G.player;
      const { endgame } = await import('/src/game/endgame.js');
      const { markXp } = await import('/src/game/marks.js');
      const { kill } = await import('/src/game/combat.js');
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      const { depthLevel } = await import('/src/data/depth.js');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      G.godMode = true;
      c.depth = 1200; c.deepest = 1199;
      game.buildDungeon(1200, BIOME_BY_ID.catacombs);
      const w = G.world, cost = markXp(), m = endgame().marks;
      const pen = Math.max(0.1, 1 - (c.level - depthLevel(1200) - 5) * 0.1), mul = 1 + p.st.xpPct / 100;
      const total = () => m.pts * cost + m.xp;
      m.xp = Math.max(m.xp, cost - 4e6);   // the next Mark a few million XP away: the kills earn it
      const t0 = total(), pts0 = m.pts, raw = localStorage.getItem('velscour_endgame_v1');
      let want = 0, rawXp = 0, n = 0, rose = [];
      // the rate: a full clear's XP in Marks at depths where the level-600 hero out-levels the monsters, and where he doesn't
      const rates = [];
      for (const d of [1000, 1200, 1240, 1260, 1400]) {
        game.buildDungeon(d, BIOME_BY_ID.catacombs);
        const pd = Math.max(0.1, Math.min(1, 1 - (c.level - depthLevel(d) - 5) * 0.1));
        const sum = G.world.creatures.filter((x) => x.team === 'enemy').reduce((a, x) => a + (x.xp || 0), 0);
        rates.push(`D${d} (mlvl ${depthLevel(d)}, x${pd.toFixed(1)}): ${(sum * pd * mul / cost).toFixed(2)}`);
      }
      game.buildDungeon(1200, BIOME_BY_ID.catacombs);
      const w2 = G.world;
      for (const e of w2.creatures.filter((x) => x.team === 'enemy' && !x.dead)) {
        const before = m.pts;
        want += Math.round((e.xp || 0) * pen * mul); rawXp += e.xp || 0; n++;
        p.x = e.x; p.y = e.y;
        kill(e, p);
        if (m.pts > before) rose.push(m.pts);
      }
      const saved = JSON.parse(localStorage.getItem('velscour_endgame_v1') || '{}');
      const log = document.querySelector('#log').textContent;
      return { n, rawXp, want, got: total() - t0, pts0, pts: m.pts, xp: m.xp, cost, pen, mul, rose: rose.length, savedPts: saved.marks && saved.marks.pts, rawChanged: raw !== localStorage.getItem('velscour_endgame_v1'),
        log: /\+\d+ Infernal Marks? from the abyss/.test(log), mlvl: depthLevel(1200), at: rates };
    });
    console.log(`  depth 1200 (monster level ${run.mlvl}): ${run.n} kills, ${Math.round(run.rawXp).toLocaleString()} XP before the out-levelling penalty (x${run.pen}, XP find x${run.mul.toFixed(2)}) -> ${Math.round(run.got).toLocaleString()} XP = ${(run.got / run.cost).toFixed(2)} Marks per full-cleared depth`);
    console.log(`  Marks per full-cleared depth for a level-600 hero: ${run.at.join(', ')}`);
    check(run.got >= run.want - 1 && run.want > 0, `every kill's XP lands in the Marks (${Math.round(run.got).toLocaleString()} XP; the kills' own ${run.want.toLocaleString()}, the rest from what their deaths set loose)`);
    check(run.pts > run.pts0, `Marks rise from kills at depth 1200: ${run.pts0} -> ${run.pts}`);
    check(run.savedPts === run.pts, 'a Mark is saved at once (localStorage holds the new total)');
    check(run.log, 'the log names the Mark ("+1 Infernal Mark from the abyss")');
    await page.evaluate(async () => { const { gainMarkXp, markXp } = await import('/src/game/marks.js'); const { G } = window.VELSCOUR; G.ui.hud.lu && G.ui.hud.lu.timers.forEach(clearTimeout); document.querySelector('#levelup').classList.add('hidden'); gainMarkXp(markXp()); });
    await page.waitForTimeout(700);
    await snap(shot, 'marks_earned');

    // the save cadence: XP alone is saved at most every 5 s, every Mark at once, and by autosave
    const cad = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const { endgame } = await import('/src/game/endgame.js');
      const { gainMarkXp, markXp } = await import('/src/game/marks.js');
      const disk = () => JSON.parse(localStorage.getItem('velscour_endgame_v1')).marks.xp;
      const m = endgame().marks;
      if (m.xp > markXp() * 0.9) m.xp = 0;
      gainMarkXp(1);                     // within 5 s of the last save: kept in memory
      const a = [m.xp, disk()];
      game.autosave();                   // the game's autosave writes it
      return { held: a[0] !== a[1], afterAutosave: disk() === m.xp };
    });
    check(cad.held && cad.afterAutosave, 'XP alone waits for the 5 s window or the autosave (then it is on disk)');
    await page.waitForTimeout(5100);
    const late = await page.evaluate(async () => {
      const { endgame } = await import('/src/game/endgame.js');
      const { gainMarkXp } = await import('/src/game/marks.js');
      gainMarkXp(7);
      return JSON.parse(localStorage.getItem('velscour_endgame_v1')).marks.xp === endgame().marks.xp;
    });
    check(late, 'XP gained 5 s after the last save is written at once');

    // HUD XP bar + the sheet at the cap
    await page.evaluate(async () => {
      const { G } = window.VELSCOUR;
      const { endgame } = await import('/src/game/endgame.js');
      const { gainMarkXp, markXp } = await import('/src/game/marks.js');
      const m = endgame().marks; m.xp = 0; gainMarkXp(Math.round(markXp() * 0.42));
      G.world.creatures.filter((x) => x.team === 'enemy').forEach((x) => { x.dead = true; });
    });
    await page.waitForTimeout(400);
    const xb = await page.evaluate(() => { const r = document.querySelector('#xp-track').getBoundingClientRect(); document.querySelector('#xp-text').style.opacity = 1; return [r.left + r.width * 0.3, r.top + r.height / 2]; });   // the text shows on hover
    await page.mouse.move(xb[0], xb[1]);
    await page.waitForTimeout(300);
    const hud = await page.evaluate(() => ({ text: document.querySelector('#xp-text').textContent, w: parseFloat(document.querySelector('#xp-fill').style.width), mk: document.querySelector('#xp-fill').classList.contains('mk-xp') }));
    check(/to the next Infernal Mark/.test(hud.text) && Math.abs(hud.w - 42) < 0.6 && hud.mk, `HUD XP bar at the cap: "${hud.text}" (${hud.w}%, Mark colours)`);
    await snap(shot, 'marks_hud_cap');
    await page.evaluate(() => { document.querySelector('#xp-text').style.opacity = ''; });
    const sheet = await page.evaluate(async () => {
      const { UI } = await import('/src/ui/ui.js');
      const { renderInventory } = await import('/src/ui/inventory.js');
      const { unlockEndgame } = await import('/src/game/endgame.js');
      unlockEndgame();
      UI.openPanel('inventory', 'Inventory', renderInventory);
      const t = document.querySelector('[data-panel="inventory"]').textContent;
      return { xpLine: /Next Infernal Mark [\d,]+ \/ [\d,]+ XP/.test(t), row: /Infernal Marks\d+ \(\d+ free\)/.test(t), btn: [...document.querySelectorAll('[data-panel="inventory"] button')].some((b) => b.textContent === 'Infernal Marks') };
    });
    check(sheet.xpLine, 'the sheet\'s XP line shows the next Mark at the cap');
    check(sheet.row && sheet.btn, 'the sheet has the Infernal Marks row and button');
    await snap(shot, 'marks_sheet');

    // reload: marks.xp and pts survive (beforeunload -> game.autosave)
    const before = await page.evaluate(async () => {
      const { endgame } = await import('/src/game/endgame.js');
      const { gainMarkXp } = await import('/src/game/marks.js');
      gainMarkXp(3);                     // unsaved: within the 5 s window
      const m = endgame().marks;
      return { pts: m.pts, xp: m.xp, disk: JSON.parse(localStorage.getItem('velscour_endgame_v1')).marks.xp };
    });
    await page.reload();
    await page.waitForFunction(() => window.VELSCOUR && document.querySelector('#loading').classList.contains('hidden'), null, { timeout: 30000 });
    const after = await page.evaluate(async () => { const { endgame } = await import('/src/game/endgame.js'); const m = endgame().marks; return { pts: m.pts, xp: m.xp }; });
    check(before.disk !== before.xp && after.pts === before.pts && after.xp === before.xp, `a reload keeps the Marks and the XP towards the next (${after.pts} Marks, ${after.xp} XP; ${before.xp - before.disk} XP were not on disk before it)`);

    // ---------------------------------------------- 2. spending and the bonuses
    await page.evaluate(async () => { await window.VELSCOUR.game.newChar('paladin', 'Markbearer II'); });
    await page.waitForTimeout(300);
    const sp = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, c = G.char, p = G.player;
      const E = await import('/src/game/endgame.js');
      const M = await import('/src/game/marks.js');
      const { riftTime } = await import('/src/game/rifts.js');
      const { MAX_LEVEL } = await import('/src/game/player.js');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      c.level = MAX_LEVEL; for (const k in c.equip) c.equip[k] = null; p.recompute();   // no gear: the life pool is the Marks' alone
      const r = E.endgame(); r.marks.pts = 0; M.resetMarks();
      const o = {};
      const base = { hp: p.maxHp, crit: p.st.critChance, mf: p.st.magicFind, rift: riftTime() };
      o.base = base;
      o.grant = M.grantMarks(1000, 'for the test');
      o.free0 = M.marksFree();
      o.spent100 = M.spendMark('life', 100) + M.spendMark('crit', 100) + M.spendMark('mf', 100) + M.spendMark('rift', 100);
      o.at100 = { life: p.maxHp / base.hp, crit: p.st.critChance - base.crit, mf: p.st.magicFind - base.mf, rift: riftTime() - base.rift, b: M.markBonuses() };
      o.free1 = M.marksFree();
      o.over = M.spendMark('life', 9999);   // only what is free
      o.free2 = M.marksFree();
      M.resetMarks(); o.afterReset = { free: M.marksFree(), hp: p.maxHp, total: M.marksTotal() };
      M.spendMark('life', 500); o.at500 = p.maxHp / base.hp; o.b500 = M.bonusAt('life', 500);
      M.resetMarks();
      p.buffs.push({ id: 'test-crit', stats: { crit: 400 }, t: 99, dur: 99 }); p.recompute();
      const hi = p.st.critChance; M.spendMark('crit', 1000); o.clamp = [hi, p.st.critChance];
      p.buffs = p.buffs.filter((b) => b.id !== 'test-crit'); M.resetMarks();
      E.endgame().marks.pts = 403; o.auto = M.autoSpend(); o.spread = { ...E.endgame().marks.spent };
      o.text = M.marksText();
      // a damaged record: spent beyond the points, junk values
      localStorage.setItem('velscour_endgame_v1', JSON.stringify({ v: 1, unlocked: 'x', marks: { pts: 5, xp: -3, spent: { life: 99, crit: 'x', mf: -4, rift: 2 } }, bests: { wizard: { tier: 'q' } }, keysFound: -2 }));
      E.resetEndgameCache();
      const d = E.endgame();
      o.damaged = { pts: d.marks.pts, xp: d.marks.xp, spent: d.marks.spent, sum: M.marksSpent(), bests: Object.keys(d.bests).length, keys: d.keysFound, unlocked: d.unlocked };
      // the merge rules (no browser needed, but the same module)
      const R = (pts, spent = {}, x = {}) => ({ v: 1, unlocked: 0, marks: { pts, xp: 0, spent: { life: 0, crit: 0, mf: 0, rift: 0, ...spent } }, bests: {}, keysFound: 0, unboundWins: 0, ...x });
      const mm = (a, b, base) => { const r = E.mergeEndgame(a, b, base); return [r.marks.pts, r.marks.spent.life, r.marks.spent.crit, r.marks.spent.mf, r.keysFound]; };
      o.merge = {
        twoDevices: mm(R(16, { life: 4 }), R(13, { life: 4, crit: 2 }), R(10, { life: 4 })),
        firstSignIn: mm(R(16, { life: 4 }), R(13, { crit: 2 }), null),
        damagedCloud: mm(R(19, { life: 4, crit: 2 }), { marks: { pts: 'x', spent: { life: 99 } } }, R(19, { life: 4, crit: 2 })),
        lostLocal: mm(R(0), R(19, { life: 4 }), R(19, { life: 4 })),
        doubleSpend: mm(R(10, { life: 10 }), R(10, { crit: 10 }), R(10)),
        resetAndSpend: mm(R(10), R(10, { life: 4, crit: 2 }), R(10, { life: 4 })),
        keys: mm(R(0, {}, { keysFound: 5 }), R(0, {}, { keysFound: 4 }), R(0, {}, { keysFound: 3 })),
        same: mm(R(7, { mf: 3 }), R(7, { mf: 3 }), R(7, { mf: 3 })),
      };
      M.resetMarks();
      return o;
    });
    const b = sp.at100;
    console.log(`  100 points each: life x${b.life.toFixed(4)} (bonus ${b.b.life}%), crit +${b.crit.toFixed(2)}, MF +${b.mf.toFixed(2)}, rift +${b.rift.toFixed(2)} s; 500 Vitality: x${sp.at500.toFixed(4)} (${sp.b500}%)`);
    check(sp.grant === 1000 && sp.free0 === 1000 && sp.spent100 === 400 && sp.free1 === 600, 'grantMarks(1000): 1000 free; 100 into each category leaves 600');
    check(Math.abs(b.life - 1.1514) < 3 / sp.base.hp && b.b.life.toFixed(1) === '15.1', `100 Vitality: +${((b.life - 1) * 100).toFixed(2)}% on maxHp (${sp.base.hp} -> ${Math.round(sp.base.hp * b.life)})`);
    check(Math.abs(sp.at500 - 1.2911) < 3 / sp.base.hp && sp.b500.toFixed(1) === '29.1', `500 Vitality: +${((sp.at500 - 1) * 100).toFixed(2)}% life`);
    check(Math.abs(b.crit - 5.05) < 0.011, `100 Precision: +${b.crit.toFixed(2)} crit chance`);
    check(Math.abs(b.mf - 25.23) < 0.011, `100 Fortune: +${b.mf.toFixed(2)} magic find`);
    check(Math.abs(b.rift - 30.28) < 0.011, `100 Haste: +${b.rift.toFixed(2)} s on the rift clock`);
    check(sp.over === 600 && sp.free2 === 0, `spending more than is free spends only the free (${sp.over})`);
    check(sp.afterReset.free === 1000 && sp.afterReset.total === 1000 && sp.afterReset.hp === sp.base.hp, 'Reset gives every point back and the bonuses go');
    check(sp.clamp[0] === 75 && sp.clamp[1] === 75, `crit from Marks stays inside the 75% clamp (${sp.clamp.join(' -> ')})`);
    const sv = Object.values(sp.spread);
    check(sp.auto === 403 && Math.max(...sv) - Math.min(...sv) <= 1, `Spend all spreads 403 Marks: ${JSON.stringify(sp.spread)}`);
    console.log(`  sheet text: ${sp.text}`);
    const dm = sp.damaged;
    check(dm.pts === 5 && dm.sum <= 5 && dm.xp === 0 && dm.spent.crit === 0 && dm.spent.mf === 0 && dm.bests === 0 && dm.keys === 0 && dm.unlocked === 0, `a damaged record is clamped: ${JSON.stringify(dm.spent)} of ${dm.pts}`);
    const mg = sp.merge, eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    check(eq(mg.twoDevices, [19, 4, 2, 0, 0]), `merge: 10 synced, +6 here, +3 and 2 crit there -> ${mg.twoDevices}`);
    check(eq(mg.firstSignIn, [16, 4, 0, 0, 0]), `merge, first sign-in (no base): the larger side -> ${mg.firstSignIn}`);
    check(eq(mg.damagedCloud, [19, 4, 2, 0, 0]), `merge: a damaged cloud copy lowers nothing -> ${mg.damagedCloud}`);
    check(eq(mg.lostLocal, [19, 4, 0, 0, 0]), `merge: a lost local copy lowers nothing -> ${mg.lostLocal}`);
    check(eq(mg.doubleSpend, [10, 10, 0, 0, 0]), `merge: the same free Marks spent on both sides -> this device's (${mg.doubleSpend})`);
    check(eq(mg.resetAndSpend, [10, 0, 2, 0, 0]), `merge: a reset here and a spend there both hold -> ${mg.resetAndSpend}`);
    check(mg.keys[4] === 6 && eq(mg.same, [7, 0, 0, 3, 0]), `merge: keys found add up (3 synced, +2, +1 = ${mg.keys[4]}); unchanged stays unchanged`);

    // ---------------------------------------------- 3. shared across heroes, the panel
    const sh = await page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const E = await import('/src/game/endgame.js');
      const M = await import('/src/game/marks.js');
      const S = await import('/src/game/save.js');
      const { MAX_LEVEL } = await import('/src/game/player.js');
      E.resetEndgameCache(); localStorage.removeItem('velscour_endgame_v1'); E.resetEndgameCache();
      E.unlockEndgame(); M.grantMarks(240, 'test'); M.spendMark('life', 60); M.spendMark('crit', 20); M.spendMark('mf', 30);
      G.char.level = MAX_LEVEL; G.player.recompute(); game.autosave();
      const pal = { life: G.player.marks.life, crit: G.player.marks.crit, id: G.char.id };
      await game.newChar('wizard', 'Second');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      const wiz = { life: G.player.marks.life, crit: G.player.marks.crit, mf: G.player.marks.mf, cls: G.char.classId };
      game.autosave();
      S.deleteClassSaves('paladin');
      E.resetEndgameCache();
      const kept = { pts: M.marksTotal(), free: M.marksFree(), life: M.marksIn('life') };
      return { pal, wiz, kept, heroes: Object.keys(S.heroesByClass()) };
    });
    check(sh.wiz.cls === 'wizard' && sh.wiz.life === sh.pal.life && sh.wiz.crit === sh.pal.crit && sh.wiz.life > 0, `a wizard made after the paladin has the same Marks: +${sh.wiz.life}% life, +${sh.wiz.crit}% crit, +${sh.wiz.mf}% MF`);
    check(!sh.heroes.includes('paladin') && sh.kept.pts === 240 && sh.kept.free === 130 && sh.kept.life === 60, `deleting the paladin keeps every Mark (${sh.kept.pts}, ${sh.kept.free} free)`);

    // the panel, by its buttons
    await page.evaluate(() => { window.VELSCOUR.G.ui.marks.open(); });
    await page.waitForSelector('.marks-panel .mk-row');
    await snap(shot, 'marks_panel');
    const clicks = async (sel) => page.click(sel);
    await clicks('.mk-row[data-cat="rift"] .mk-btns button:has-text("+1")');
    await clicks('.mk-row[data-cat="rift"] .mk-btns button:has-text("+5")');
    await clicks('.mk-row[data-cat="mf"] .mk-btns button:has-text("+25")');
    let pv = await page.evaluate(async () => { const M = await import('/src/game/marks.js'); return { rift: M.marksIn('rift'), mf: M.marksIn('mf'), free: M.marksFree(), row: document.querySelector('.mk-row[data-cat="rift"] .mk-pts').textContent }; });
    check(pv.rift === 6 && pv.mf === 55 && pv.free === 99 && pv.row === '6', `panel: +1, +5 on Haste and +25 on Fortune (${pv.rift} / ${pv.mf}, ${pv.free} free, the row says ${pv.row})`);
    await clicks('.mk-foot button:has-text("Spend all")');
    pv = await page.evaluate(async () => { const M = await import('/src/game/marks.js'); return { free: M.marksFree(), dis: document.querySelector('.mk-row .mk-btns button').disabled }; });
    check(pv.free === 0 && pv.dis, 'panel: Spend all leaves none free and the + buttons go dim');
    await snap(shot, 'marks_panel_spent');
    await clicks('.mk-foot button:has-text("Reset")');
    pv = await page.evaluate(async () => { const M = await import('/src/game/marks.js'); return M.marksFree(); });
    check(pv === 240, 'panel: Reset gives all 240 back');
    await page.evaluate(async () => { const M = await import('/src/game/marks.js'); M.spendMark('life', 90); M.spendMark('crit', 50); M.spendMark('mf', 40); M.spendMark('rift', 20); });
    // the Quest Log line and the skull's "marks"
    const q = await page.evaluate(async () => {
      const { toggleQuest } = await import('/src/ui/quest.js');
      const { UI } = await import('/src/ui/ui.js');
      UI.closeAll(); toggleQuest();
      const qb = document.querySelector('[data-panel="quest"] .panel-body'); qb.scrollTop = qb.scrollHeight;   // the Endgame section in the shot
      return document.querySelector('.quest-log').textContent.match(/Infernal Marks: [^\n]*?free\)/)?.[0] || '';
    });
    check(/Infernal Marks: 240 \(40 free\)/.test(q), `the Quest Log: "${q}"`);
    await snap(shot, 'marks_quest');
    await page.evaluate(async () => { const { UI } = await import('/src/ui/ui.js'); UI.closeAll(); document.getElementById('velscour-skull').click(); });
    await page.waitForTimeout(400);
    await page.fill('#velscour-message', 'marks');
    await page.evaluate(() => [...document.querySelectorAll('.velscour-contact-dialog button')].find((b) => b.textContent === 'Send').click());
    await page.waitForTimeout(300);
    check(await page.evaluate(() => !!document.querySelector('.marks-panel')), 'the skull\'s message box: "marks" opens the panel');
  } catch (e) { errs.push('[test] ' + (e.stack || e)); } finally { errs.push(...errors); await browser.close(); }

  // ---------------------------------------------- the phone layout
  const P = await openGame({ width: 844, height: 390, mobile: true });
  try {
    await P.page.evaluate(async () => {
      const { G, game } = window.VELSCOUR;
      const E = await import('/src/game/endgame.js');
      const M = await import('/src/game/marks.js');
      const { MAX_LEVEL } = await import('/src/game/player.js');
      await game.newChar('ranger', 'Phone');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
      E.unlockEndgame(); M.grantMarks(312, 'test'); M.spendMark('life', 120); M.spendMark('crit', 41); M.spendMark('mf', 77);
      G.char.level = MAX_LEVEL; G.player.recompute(); M.gainMarkXp(Math.round(M.markXp() * 0.63));
    });
    await P.page.waitForTimeout(500);
    await snap(P.shot, 'marks_phone_hud');
    await P.page.evaluate(() => { window.VELSCOUR.G.ui.marks.open(); });
    await P.page.waitForSelector('.marks-panel .mk-row');
    await P.page.waitForTimeout(200);
    const lay = await P.page.evaluate(() => {
      const r = document.querySelector('.marks-panel').getBoundingClientRect(), b = document.querySelector('.marks-panel .panel-body');
      const btn = document.querySelector('.mk-row .mk-btns button').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.mk-row')].map((x) => x.getBoundingClientRect());
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, W: innerWidth, H: innerHeight, sx: document.documentElement.scrollWidth, scroll: b.scrollHeight - b.clientHeight, btnH: btn.height, cols: new Set(rows.map((x) => Math.round(x.left))).size };
    });
    console.log(`  phone panel: ${Math.round(lay.r - lay.l)}x${Math.round(lay.b - lay.t)} in ${lay.W}x${lay.H}, ${lay.cols} columns, body scrolls ${lay.scroll}px, buttons ${lay.btnH}px tall`);
    check(lay.l >= 0 && lay.r <= lay.W && lay.t >= 0 && lay.b <= lay.H && lay.sx <= lay.W, 'phone: the panel fits the 844x390 screen');
    check(lay.cols === 2 && lay.scroll <= 0 && lay.btnH >= 28, 'phone: two columns, nothing to scroll, buttons big enough to tap');
    await snap(P.shot, 'marks_phone_panel');
    await P.page.tap('.mk-row[data-cat="rift"] .mk-btns button:has-text("+5")');
    const t = await P.page.evaluate(async () => (await import('/src/game/marks.js')).marksIn('rift'));
    check(t === 5, 'phone: a tap on +5 spends five');
  } catch (e) { errs.push('[phone] ' + (e.stack || e)); } finally { errs.push(...P.errors.map((e) => 'phone ' + e)); await P.browser.close(); }

  console.log(`shots in tools/tests/out/: ${shots.join(', ')}`);
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  if (fails) process.exitCode = 1;
  report(errs);
})();
