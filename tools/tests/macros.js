// Macros (src/game/macros.js, src/ui/macros.js, src/data/macros.js): several skills on one key.
//  1. Save shape: a new hero has five macros on R E Y U O; migrateMacros mends junk (bad keys, a key twice, non-ids,
//     long lists); a save round trip keeps them.
//  2. In a dungeon (god mode, a level-40 paladin with four buffs): pressing R casts the four in the macro's order, one
//     after another; one on cooldown is skipped; in town nothing is queued; while the panel is open nothing casts.
//  3. Keep up: nothing with no foe near; a foe near casts all four; nothing again while they last; a buff that wears
//     off is cast again alone; not while auto-play is on.
//  4. The panel: opened from the skill tree's Macros button; add a skill, set a key (taken from the macro that had it),
//     rename; desktop shot.
//  5. Touch (844x390 and 390x844): a purple button per macro with skills, inside the screen and over no other button;
//     a tap casts the macro; the panel fits; shots.
//   node tools/tests/macros.js
const { openGame, report } = require('./harness');

const BUFFS = ['paladin.1.1', 'paladin.1.3', 'paladin.1.5', 'paladin.1.8'];
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

async function setup(page, opts = {}) {
  await page.evaluate(async ({ BUFFS, town }) => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('paladin', 'Pianist');
    document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0; G.ui.closeAll();
    const c = G.char;
    c.level = 40;
    for (const id of BUFFS) c.skills[id] = 10;
    c.skills['paladin.0.0'] = 5;
    c.bar = Array(15).fill(null); c.bar[0] = 'paladin.0.0'; BUFFS.forEach((id, i) => { c.bar[5 + i] = id; });
    G.godMode = true;
    if (!town) { const { BIOME_BY_ID } = await import('/src/data/biomes.js'); game.buildDungeon(12, BIOME_BY_ID.catacombs); }
    const p = G.player;
    p.recompute(); p.hp = p.maxHp; p.mana = p.maxMana = 1e7;
    // the log of what went off
    window.__casts = [];
    const orig = p.tryUseSkill.bind(p);
    p.tryUseSkill = (sk, ...a) => { const r = orig(sk, ...a); if (r !== false && sk) window.__casts.push(sk.id); return r; };
    G.ui.refresh();
  }, { BUFFS, town: !!opts.town });
}
// every enemy gone (or one placed next to the hero, pinned and harmless)
const foes = (page, near) => page.evaluate(async (near) => {
  const { G } = window.VELSCOUR, w = G.world, p = G.player;
  for (const m of w.creatures) if (m.team === 'enemy') { m.dead = true; m.hp = 0; }
  w.creatures = w.creatures.filter((m) => m.team !== 'enemy');
  if (near) {
    const { makeMonster } = await import('/src/game/monster.js');
    const [x, y] = w.map.randomNear(p.x + 3, p.y, 1.5);
    const m = makeMonster(w, 'skeleton', w.biome, 12, 'normal', x, y); m.maxHp = m.hp = 1e12; m.speed = 0; m.dmg = 0; m.awake = true;
    w.add(m);
  }
}, near);
const fresh = (page) => page.evaluate(() => { const { G } = window.VELSCOUR, p = G.player; p.buffs = p.buffs.filter((b) => !b.id || !b.id.startsWith('paladin.')); p.cooldowns = {}; p.castLock = 0; p.mana = p.maxMana; window.__casts = []; });
const casts = (page) => page.evaluate(() => window.__casts.slice());

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1280, height: 720 });
  // ------------------------------------------------ 1. save shape
  await setup(page);
  const shape = await page.evaluate(async () => {
    const { G } = window.VELSCOUR;
    const { migrateMacros, MACRO_KEYS } = await import('/src/data/macros.js');
    const S = await import('/src/game/save.js');
    const fresh = G.char.macros.map((m) => m.key);
    const junk = migrateMacros([{ name: '  Buffs  ', skills: ['a', 3, null, 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], key: 'KeyR', keep: 1 }, { key: 'KeyR' }, { key: 'KeyQ' }, 'x', { key: null }, { key: 'KeyE' }]);
    const old = S.migrate({ ...JSON.parse(JSON.stringify(G.char)), macros: undefined });
    return { fresh, keys: MACRO_KEYS.slice(0, 5), junk, old: old.macros.length };
  });
  check(JSON.stringify(shape.fresh) === JSON.stringify(shape.keys), `a new hero has five macros on ${shape.fresh.map((k) => k.slice(3)).join(' ')}`);
  const j = shape.junk;
  check(j.length === 5 && j[0].name === 'Buffs' && j[0].skills.join() === 'a,b,c,d,e,f,g,h' && j[0].keep === true && j[0].key === 'KeyR',
    `migrateMacros: the name trimmed, ids only, eight at most, keep a boolean (${j[0].skills.join()})`);
  check(j[1].key === null && j[2].key === 'KeyY' && j[3].key === 'KeyU' && j[4].key === null, `a key twice is dropped, an unknown one falls back to the slot's own, null stays null (${j.map((m) => m.key).join(' ')})`);
  check(shape.old === 5, 'a save from before macros gets five');

  // ------------------------------------------------ 2. a press casts the list in order
  await page.evaluate((BUFFS) => { const c = window.VELSCOUR.G.char; c.macros[0].skills = BUFFS.slice(); c.macros[0].key = 'KeyR'; }, BUFFS);
  await foes(page, false); await fresh(page);
  await page.keyboard.press('r'); await page.waitForTimeout(3000);
  let got = await casts(page);
  const on = await page.evaluate((BUFFS) => BUFFS.filter((id) => window.VELSCOUR.G.player.buffs.some((b) => b.id === id)).length, BUFFS);
  check(got.join() === BUFFS.join() && on === 4, `R casts the four buffs in order (${got.length} casts, ${on} buffs on)`);
  await fresh(page);
  await page.evaluate((id) => { window.VELSCOUR.G.player.cooldowns[id] = 60; }, BUFFS[1]);
  await page.keyboard.press('r'); await page.waitForTimeout(3000);
  got = await casts(page);
  check(got.join() === [BUFFS[0], BUFFS[2], BUFFS[3]].join(), `one on cooldown is skipped, the rest go (${got.length})`);
  await fresh(page);
  await page.evaluate(() => window.VELSCOUR.G.ui.macros.open());
  await page.keyboard.press('r'); await page.waitForTimeout(800);
  got = await casts(page);
  check(!got.length, 'with the panel open a press casts nothing');
  await page.evaluate(() => window.VELSCOUR.G.ui.closeAll());

  // ------------------------------------------------ 3. Keep up
  await page.evaluate(() => { window.VELSCOUR.G.char.macros[0].keep = true; });
  await fresh(page);
  await page.waitForTimeout(1500);
  check(!(await casts(page)).length, 'Keep up with no foe in sight casts nothing');
  await foes(page, true); await page.waitForTimeout(2500);
  got = await casts(page);
  check(got.join() === BUFFS.join(), `a foe near: Keep up casts all four (${got.length})`);
  await page.evaluate(() => { window.__casts = []; });
  await page.waitForTimeout(2000);
  check(!(await casts(page)).length, 'while they last nothing is cast again');
  await page.evaluate((id) => { const p = window.VELSCOUR.G.player; p.buffs = p.buffs.filter((b) => b.id !== id); p.cooldowns[id] = 0; window.__casts = []; }, BUFFS[2]);
  await page.waitForTimeout(1500);
  got = await casts(page);
  check(got.join() === BUFFS[2], `a buff that wore off is cast again alone (${got.join()})`);
  const auto = await page.evaluate(async () => {
    const { G } = window.VELSCOUR, p = G.player;
    const { Macros } = await import('/src/game/macros.js');
    const { Auto } = await import('/src/game/autoplay.js');
    Auto.on = true; Macros.reset(); p.buffs = [];
    const { controls } = await import('/src/game/controls.js');
    for (let i = 0; i < 20; i++) Macros.tick(0.05);
    const q = Macros.queue.length;
    Auto.on = false; Macros.reset();
    return q;
  });
  check(auto === 0, 'Keep up stays off while auto-play is on');
  await page.evaluate(() => { window.VELSCOUR.G.char.macros[0].keep = false; });

  // round trip
  const kept = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    const S = await import('/src/game/save.js');
    G.char.macros[2].name = 'Opener'; G.char.macros[2].skills = ['paladin.1.1']; G.char.macros[2].keep = true;
    game.autosave();
    const h = S.heroesByClass().paladin, m = S.migrate(JSON.parse(JSON.stringify(h))).macros;
    return { m0: m[0].skills.length, n2: m[2].name, k2: m[2].keep };
  });
  check(kept.m0 === 4 && kept.n2 === 'Opener' && kept.k2, 'a save round trip keeps every macro');

  // town
  await setup(page, { town: true });
  await page.evaluate((BUFFS) => { window.VELSCOUR.G.char.macros[0].skills = BUFFS.slice(); }, BUFFS);
  await page.keyboard.press('r'); await page.waitForTimeout(500);
  const town = await page.evaluate(async () => (await import('/src/game/macros.js')).Macros.queue.length + window.__casts.length);
  check(town === 0, 'in town a press queues and casts nothing');

  // ------------------------------------------------ 4. the panel
  await setup(page);
  await page.evaluate(async () => { (await import('/src/ui/skills.js')).toggleTree(); });
  await page.waitForTimeout(300);
  await page.click('[data-panel="tree"] button:has-text("Macros"), .panel button:has-text("Macros")');
  await page.waitForSelector('.macros-panel .mc-row');
  check(await page.$$eval('.macros-panel .mc-row', (r) => r.length) === 5, "the skill tree's Macros button opens the panel: five rows");
  await page.selectOption('.mc-row[data-macro="0"] .mc-add', BUFFS[0]);
  await page.selectOption('.mc-row[data-macro="0"] .mc-add', BUFFS[1]);
  await page.selectOption('.mc-row[data-macro="1"] .mc-add', BUFFS[2]);
  await page.selectOption('.mc-row[data-macro="1"] .mc-key', 'KeyR');
  await page.fill('.mc-row[data-macro="0"] .mc-name', 'Buffs');
  await page.press('.mc-row[data-macro="0"] .mc-name', 'Enter');
  await page.click('.macros-panel .panel-body', { position: { x: 5, y: 5 } });
  const ui = await page.evaluate(() => window.VELSCOUR.G.char.macros.slice(0, 2).map((m) => ({ n: m.name, s: m.skills, k: m.key })));
  check(ui[0].s.join() === BUFFS.slice(0, 2).join() && ui[1].s[0] === BUFFS[2], `added by the panel: ${ui[0].s.length} + ${ui[1].s.length}`);
  check(ui[1].k === 'KeyR' && ui[0].k === null, `R moved to macro 2, macro 1 has none (${ui[0].k} / ${ui[1].k})`);
  check(ui[0].n === 'Buffs', `renamed: ${ui[0].n}`);
  await page.click('.mc-row[data-macro="1"] .mc-chip');
  check((await page.evaluate(() => window.VELSCOUR.G.char.macros[1].skills.length)) === 0, 'a click on a skill takes it out');
  await page.selectOption('.mc-row[data-macro="1"] .mc-add', BUFFS[3]);
  await shot('macros_panel');
  await page.evaluate(() => window.VELSCOUR.G.ui.closeAll());
  await browser.close();

  // ------------------------------------------------ 5. touch
  for (const [W, H] of [[844, 390], [390, 844]]) {
    const g = await openGame({ width: W, height: H, mobile: true });
    await setup(g.page);
    await g.page.evaluate((BUFFS) => { const { G } = window.VELSCOUR; G.char.macros[0].skills = BUFFS.slice(); G.char.macros[1].skills = [BUFFS[0]]; G.char.macros[3].skills = [BUFFS[1]]; G.touchUI.layout(); }, BUFFS);
    await g.page.waitForTimeout(500);
    const t = await g.page.evaluate(() => {
      const r = (e) => e.getBoundingClientRect();
      const mac = [...document.querySelectorAll('.tbtn.macro:not(.hidden)')], other = [...document.querySelectorAll('.tbtn:not(.macro):not(.hidden), #madness-btn, #smite-btn, #hud-bar')].filter((e) => r(e).width);
      const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      return { n: mac.length, inside: mac.every((e) => { const b = r(e); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight; }),
        overlap: mac.filter((e) => other.some((o) => hit(r(e), r(o)))).map((e) => e.dataset.macro), labels: mac.map((e) => e.textContent).join(' ') };
    });
    check(t.n === 3 && t.inside, `${W}x${H}: a button for each of the 3 macros with skills (${t.labels}), inside the screen`);
    check(!t.overlap.length, `${W}x${H}: over no other button${t.overlap.length ? ` (macros ${t.overlap.join()})` : ''}`);
    await foes(g.page, false); await fresh(g.page);
    await g.page.tap('.tbtn.macro[data-macro="0"]'); await g.page.waitForTimeout(3000);
    const gt = await casts(g.page);
    check(gt.join() === BUFFS.join(), `${W}x${H}: a tap casts the macro (${gt.length})`);
    await g.shot(`macros_touch_${W}x${H}`);
    await g.page.evaluate(() => window.VELSCOUR.G.ui.macros.open());
    await g.page.waitForTimeout(300);
    const pn = await g.page.evaluate(() => { const b = document.querySelector('.macros-panel').getBoundingClientRect(), add = document.querySelector('.mc-row[data-macro="2"] .mc-add').getBoundingClientRect(); return { fits: b.left >= 0 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= innerHeight + 1, addW: Math.round(add.width), addH: Math.round(add.height) }; });
    check(pn.fits && pn.addH >= 24, `${W}x${H}: the panel fits the screen (its body scrolls), controls ${pn.addW}x${pn.addH}`);
    await g.shot(`macros_panel_${W}x${H}`);
    report(g.errors); await g.browser.close();
  }
  console.log('shots in tools/tests/out/: macros_panel, macros_touch_844x390, macros_touch_390x844, macros_panel_844x390, macros_panel_390x844');
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
  report(errors);
  process.exitCode = fails ? 1 : 0;
})();
