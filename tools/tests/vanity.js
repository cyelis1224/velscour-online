// Vanity looks: a head/body piece worn as a look shows on the hero (sprite + inventory portrait) but gives no stats,
// "Hide helmet" drops the helmet from the look, looks survive a save round trip, and taking one off returns it.
// node tools/tests/vanity.js [mobile]
const { openGame, report } = require('./harness');
const mobile = process.argv.includes('mobile');
(async () => {
  const { browser, page, errors } = await openGame(mobile ? { width: 844, height: 390, mobile: true } : {});
  const r = await page.evaluate(async () => {
    const { G, game } = window.VELSCOUR;
    await game.newChar('paladin', 'Peacock');
    const { rollItem, shownEquip } = await import('/src/data/items.js');
    const { addToBag } = await import('/src/game/player.js');
    const { wearLook, takeOffLook, toggleInventory, getItem } = await import('/src/ui/inventory.js');
    const { migrate } = await import('/src/game/save.js');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const c = G.char, p = G.player, out = {};
    for (let i = 0; i < 40 && !p.artFrame(); i++) await wait(100);
    const stats = () => JSON.stringify([p.maxHp, p.st.armor, p.st.res, p.st.dmgPct, p.st.critChance]);
    const s0 = stats(), img0 = p.artFrame()?.img;
    const head = rollItem(60, { slot: 'head', rarity: 5 }), body = rollItem(60, { slot: 'body', rarity: 5 });
    head.req = body.req = 60; // no level gate on a look
    addToBag(c, head); addToBag(c, body);
    out.wornHead = wearLook(c.bag.indexOf(head));
    out.wornBody = wearLook(c.bag.indexOf(body));
    out.inBag = c.bag.includes(head) || c.bag.includes(body);
    out.statsSame = stats() === s0;
    out.shown = shownEquip(c).body === body && shownEquip(c).head === head && c.equip.body !== body;
    out.selRef = !!getItem({ where: 'vanity', slot: 'body' });
    await wait(600);
    const img1 = p.artFrame()?.img;
    out.spriteChanged = !!img1 && img1 !== img0;
    c.hideHelm = true;
    out.hiddenHead = shownEquip(c).head === null && c.vanity.head === head;
    const back = migrate(JSON.parse(JSON.stringify(c)));
    out.saved = back.vanity.body?.uid === body.uid && back.vanity.head?.uid === head.uid && back.hideHelm === true;
    const old = migrate(Object.assign(JSON.parse(JSON.stringify(c)), { vanity: undefined, hideHelm: undefined }));
    out.oldSave = old.vanity.head === null && old.vanity.body === null && old.hideHelm === false;
    c.hideHelm = false;
    toggleInventory();
    await wait(400);
    out.slotsInUi = document.querySelectorAll('.vanity-row .vslot').length;
    out.portraitShown = !!document.querySelector('.paperdoll .portrait img')?.src;
    return out;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `tools/tests/out/vanity${mobile ? '_mobile' : ''}.png` });
  const r2 = await page.evaluate(async () => {
    const { G } = window.VELSCOUR;
    const { takeOffLook } = await import('/src/ui/inventory.js');
    const { shownEquip } = await import('/src/data/items.js');
    const c = G.char, body = c.vanity.body;
    const off = takeOffLook('body') && c.bag.includes(body) && !c.vanity.body && shownEquip(c).body === c.equip.body;
    return { takenOff: off };
  });
  Object.assign(r, r2);
  console.log(JSON.stringify(r));
  const bad = Object.entries(r).filter(([k, v]) => (k === 'inBag' ? v : k === 'slotsInUi' ? v !== 2 : !v));
  if (bad.length) { console.log('FAIL', JSON.stringify(bad)); process.exitCode = 1; } else console.log('PASS');
  report(errors); await browser.close();
})();
