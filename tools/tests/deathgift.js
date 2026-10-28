// "DEATH IS THE ONLY WAY OUT, MY KIND SIR." typed to Velscour (src/game/deathgift.js): sent from a dungeon, the hero
// is level 350 with Mythic +10 gear in every slot, maxed skills and mastery, and back in town with Depth 500 next.
// The hero is marked (c.cheated) and barred from the Honour Board. A near miss (wrong case) must do nothing. Usage: node tools/tests/deathgift.js [classes]
const { openGame, report } = require('./harness');

const send = async (page, text) => {
  await page.evaluate(() => window.VELSCOUR.game.openVelscourContact());
  await page.fill('#velscour-message', text);
  await page.$eval('.velscour-contact-dialog .btn.red', (b) => b.click()); // the title screen may still sit behind the game
  await page.waitForTimeout(1500);
};

(async () => {
  const classes = (process.argv[2] || 'barbarian,wizard').split(',');
  const { browser, page, errors, shot } = await openGame();
  let fail = 0;
  for (const cls of classes) {
    await page.evaluate(async (cls) => { await window.VELSCOUR.game.newChar(cls, 'Gift'); }, cls);
    await page.waitForTimeout(1000);
    await page.evaluate(async () => { const { G, game } = window.VELSCOUR; G.char.nextBiome = 'catacombs'; game.enterDungeon(); });
    await page.waitForTimeout(2500);
    await send(page, 'death is the only way out, my kind sir.');
    const miss = await page.evaluate(() => window.VELSCOUR.G.char.level), missMark = await page.evaluate(() => !!window.VELSCOUR.G.char.cheated);
    await page.$eval('.velscour-contact-dialog .btn', (b) => b.click()); // Close: a miss keeps the dialog open
    if (miss !== 1 || missMark) { console.log(`FAIL ${cls}: lowercase phrase levelled the hero to ${miss} (marked: ${missMark})`); fail++; }
    await send(page, 'DEATH IS THE ONLY WAY OUT, MY KIND SIR.');
    const r = await page.evaluate(async () => {
      const { G } = window.VELSCOUR, c = G.char;
      const { SLOTS } = await import('/src/data/items.js');
      const { CLASS_SKILLS } = await import('/src/data/skills.js');
      const gear = SLOTS.map((s) => c.equip[s] && [s, c.equip[s].rarity, c.equip[s].upg, c.equip[s].gems.length, c.equip[s].affixes.length]);
      const sk = CLASS_SKILLS[c.classId].every((s) => c.skills[s.id] === 20 && c.mastery[s.id][0] === 1000);
      const { Board } = await import('/src/game/leaderboard.js'); // the gift is a cheat: never listed on the Honour Board
      return { level: c.level, depth: c.depth, kind: G.world.kind, gear, sk, hp: G.player.maxHp, dmg: G.player.st.weapon, bag: c.bag.filter(Boolean).length, potions: c.potions, gold: c.gold, cheated: c.cheated, board: await Board.submit(c, 5, 100) };
    });
    console.log(cls, JSON.stringify(r));
    const ok = r.level === 350 && r.depth === 500 && r.kind === 'town' && r.sk && r.gear.every((g) => g && g[1] === 5 && g[2] === 10) && r.cheated === true && r.board && r.board.barred;
    if (!ok) { console.log(`FAIL ${cls}`); fail++; }
    await page.evaluate(async () => { const { toggleInventory } = await import('/src/ui/inventory.js'); toggleInventory(); });
    await page.waitForTimeout(600);
    await shot(`deathgift_${cls}`);
    await page.evaluate(async () => { const { toggleInventory } = await import('/src/ui/inventory.js'); toggleInventory(); });
  }
  if (fail) process.exitCode = 1;
  await report(errors);
  await browser.close();
})();
