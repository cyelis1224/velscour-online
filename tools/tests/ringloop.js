// Auto-play never swaps rings back and forth (a player's report: a Death Knight "re-equipping all the rings like crazy"
// for hours, a Common Raise Ghoul ring and a newer Uncommon +1 melee skills ring taking turns in the same slot).
//   node tools/tests/ringloop.js [trials]
// 1. The reported pair: an old Common ring that scores better and a much newer Uncommon one that scores worse: one
//    settles in, then no more swaps. 2. Random worn rings + a bag of random rings (and a few armor pieces), per trial:
//    optimizeGear called 30 times like manageHero does every tick; after the first few calls nothing is equipped.
// The cause was fitScore's age bonus: zeroed for a piece of lower rarity both ways, so the swap back cost nothing.
const { openGame, report } = require('./harness');
const TRIALS = +process.argv[2] || 60;

(async () => {
  const { browser, page, errors } = await openGame({ width: 1280, height: 720 });
  let fails = 0;
  const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
  await page.evaluate(async () => { await window.VELSCOUR.game.newChar('death_knight', 'Ringbot'); });
  await page.waitForTimeout(800);
  const r = await page.evaluate(async (TRIALS) => {
    const { G } = window.VELSCOUR;
    const items = await import('/src/data/items.js');
    const { addToBag } = await import('/src/game/player.js');
    const { Auto } = await import('/src/game/autoplay.js');
    const { CLASS_SKILLS } = await import('/src/data/skills.js');
    const c = G.char, p = G.player;
    G.settings.autoGear = true;
    Auto.toggle(true);
    const log = G.ui.log; let equips = 0;
    G.ui.log = function (msg, ...a) { if (/Auto-play equipped/.test(msg)) equips++; return log.call(this, msg, ...a); };
    const ghoul = CLASS_SKILLS.death_knight.find((sk) => sk.name === 'Raise Ghoul');
    const setup = (lvl) => {
      c.level = lvl; c.depth = Math.max(1, Math.round(lvl / 1.2)); c.gold = 1e7;
      for (const sk of CLASS_SKILLS.death_knight) if (sk.reqLevel <= lvl) c.skills[sk.id] = Math.max(c.skills[sk.id] || 0, 3);
      c.bar[0] = c.bar[0] || CLASS_SKILLS.death_knight[0].id;
      if (!c.bar.includes(ghoul.id)) c.bar[c.bar.indexOf(null) >= 0 ? c.bar.indexOf(null) : 5] = ghoul.id;
      c.bag = c.bag.map(() => null);
      for (const s of ['weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet']) { const it = items.rollItem(lvl, { slot: s, rarity: 2 }); it.req = 1; c.equip[s] = it; }
      for (const s of items.RING_SLOTS) { const it = items.rollItem(Math.max(1, lvl - 10 - Math.random() * lvl * 0.6), { slot: 'ring' }); it.req = 1; c.equip[s] = it; }
      p.recompute();
    };
    const settle = () => { const per = []; for (let k = 0; k < 30; k++) { equips = 0; Auto.optimizeGear(); p.recompute(); per.push(equips); } return per; };
    const out = {};
    // 1. the reported pair
    setup(60);
    const old = items.rollItem(8, { slot: 'ring', rarity: 0 }); old.req = 1;
    old.aug = [{ id: old.aug[0].id, sk: ghoul.id, pow: 1.6 }];
    const neu = items.rollItem(60, { slot: 'ring', rarity: 1 }); neu.req = 1; neu.aug = [{ id: neu.aug[0].id, kind: 'melee', pow: 0.3 }];
    addToBag(c, old); addToBag(c, neu);
    out.pair = settle();
    // 2. random bags
    out.loops = []; out.total = 0;
    for (let t = 0; t < TRIALS; t++) {
      setup(10 + Math.floor(Math.random() * 300));
      for (let i = 0; i < 4 + Math.floor(Math.random() * 10); i++) {
        const it = items.rollItem(Math.max(1, c.level - Math.random() * c.level * 0.9), { slot: Math.random() < 0.75 ? 'ring' : undefined }); it.req = 1; it.unid = false; addToBag(c, it);
      }
      const per = settle(); out.total += per.reduce((a, b) => a + b, 0);
      const late = per.slice(5).reduce((a, b) => a + b, 0);
      if (late) {
        const snap = () => Object.values(c.equip).concat(c.bag).filter((it) => it && it.type === 'gear').map((it) => `${it.slot}:r${it.rarity}:i${it.ilvl}`).join(' ');
        const a = snap(); Auto.optimizeGear(); out.loops.push({ lvl: c.level, late, per: per.join(''), before: a, after: snap() });
      }
    }
    G.ui.log = log;
    Auto.toggle(false);
    return out;
  }, TRIALS);
  console.log('reported pair, equips per call:', r.pair.join(' '));
  check(r.pair.slice(3).every((n) => !n), 'the old Common ring and the new Uncommon one settle (no swapping back)');
  console.log(`random bags: ${r.total} equips over ${TRIALS} trials; still swapping after 5 calls in ${r.loops.length}`);
  for (const l of r.loops.slice(0, 8)) console.log('  ', l);
  check(!r.loops.length, 'random rings settle within 5 calls in every trial');
  report(errors); if (fails) process.exitCode = 1;
  await browser.close();
})();
