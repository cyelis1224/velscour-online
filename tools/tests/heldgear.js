// Held weapons and off-hands in play (src/gfx/heldart.js, assets/sprites/held/ from tools/weapons3d_bake.js): per class
// a hero in a dungeon holding his class's weapon and off-hand at every rarity, socketed, facing right and left (the gear
// must turn with him), checked to compose; the settings turn the gear and its effects off; the bag shows held-art icons
// and the ground shows dropped weapons. Shots heldgear_<class>.png (rarity rows x facing), heldgear_bag.png,
// heldgear_ground.png, heldgear_off.png.
//   node tools/tests/heldgear.js [classes,... | all]   (default: all)
const path = require('path');
const { openGame, report, OUT_DIR, ALL_CLASSES } = require('./harness');
const ALL = ALL_CLASSES || ['paladin', 'ranger', 'wizard', 'necromancer', 'barbarian', 'dragoon', 'totem_master', 'death_knight', 'arcane_sorcerer',
  'carrion_witch', 'bard', 'slime_lord', 'boomerang_knight', 'lancer', 'dragon_knight', 'gunner'];
const arg = process.argv[2] || 'all';
const CLASSES = arg === 'all' ? ALL : arg.split(',');
const RARITIES = [0, 2, 3, 4, 5];

(async () => {
  const { browser, page, errors } = await openGame({ width: 1400, height: 900 });
  const fail = [];
  const clipOf = () => page.evaluate(async () => {
    const { G } = window.VELSCOUR; const { camera } = await import('/src/core/view.js');
    const [x, y] = camera.tileToScreen(G.player.x, G.player.y, 0);
    return { x: Math.max(0, x - 140), y: Math.max(0, y - 250), width: 280, height: 290 };
  });
  for (const cls of CLASSES) {
    await page.evaluate(async (cls) => {
      const { G, game } = window.VELSCOUR;
      await game.newChar(cls, 'Held');
      document.querySelectorAll('.screen').forEach((s) => s.remove()); G.ui.modalCount = 0;
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      const { camera } = await import('/src/core/view.js');
      G.godMode = true;
      game.buildDungeon(1, BIOME_BY_ID.catacombs);
      await new Promise((r) => setTimeout(r, 300));
      for (const c of G.world.creatures) if (c.team === 'enemy') c.dead = true;
      G.settings.zoom = 2.4; G.settings.heldGear = true; G.settings.heldFx = true; camera.computeZoom();
    }, cls);
    const shots = [];
    for (const R of RARITIES) {
      const info = await page.evaluate(async ([cls, R]) => {
        const { G } = window.VELSCOUR;
        const { rollItem, GEMS } = await import('/src/data/items.js');
        const { CLASSES } = await import('/src/data/classes.js');
        const C = CLASSES[cls], gems = Object.keys(GEMS).filter((g) => !GEMS[g].special);
        const sock = (it) => { it.sockets = Math.max(1, Math.min(R + 1, it.maxSockets || 3)); it.gems = Array.from({ length: it.sockets }, (_, i) => ({ gem: gems[(i * 5 + R) % gems.length], tier: 5 })); return it; };
        G.char.equip.weapon = sock(rollItem(60, { slot: 'weapon', base: C.weapon, rarity: R }));
        G.char.equip.offhand = cls === 'barbarian' ? sock(rollItem(60, { slot: 'weapon', base: 'axe', rarity: R })) : sock(rollItem(60, { slot: 'offhand', base: C.offhand, rarity: R }));
        G.char.equip.body = rollItem(60, { slot: 'body', rarity: R }); G.char.equip.head = rollItem(60, { slot: 'head', rarity: R });
        G.player.recompute();
        const { loadHeld } = await import('/src/gfx/heldart.js');
        await loadHeld(cls, G.char);
        const { camera } = await import('/src/core/view.js');
        camera.follow(G.player.x, G.player.y, 0, true);
        G.player.flip = false;
        await new Promise((r) => setTimeout(r, 150));
        G.player.artFrame();
        const h = G.player.heldArt?.held;
        return { pieces: h ? h.pieces.map((p) => `${p.set}#${p.i} ${p.d.name}`) : null, weapon: G.char.equip.weapon.base, off: G.char.equip.offhand.base };
      }, [cls, R]);
      console.log(cls, 'R' + R, JSON.stringify(info));
      if (!info.pieces || info.pieces.length < 1) fail.push(`${cls} R${R}: nothing held`);
      for (const flip of [false, true]) {
        await page.evaluate((f) => { window.VELSCOUR.G.player.flip = f; }, flip);
        await page.waitForTimeout(500);
        const file = path.join(OUT_DIR, `heldgear_${cls}_r${R}_${flip ? 'L' : 'R'}.png`);
        await page.screenshot({ path: file, clip: await clipOf() });
        shots.push(file);
      }
    }
    // the settings: held gear off draws the plain hero, effects off keeps the gear
    const off = await page.evaluate(() => {
      const { G } = window.VELSCOUR;
      G.settings.heldFx = false; G.player.artFrame(); const fxOff = !!G.player.heldArt.held;
      G.settings.heldGear = false; const a = G.player.artFrame(); const gearOff = a.img === G.player.heldArt.base && !G.player.heldArt.held;
      G.settings.heldGear = true; G.settings.heldFx = true;
      return { fxOff, gearOff };
    });
    if (!off.fxOff || !off.gearOff) fail.push(`${cls}: settings ${JSON.stringify(off)}`);
    if (cls === CLASSES[0]) {
      await page.evaluate(() => { window.VELSCOUR.G.settings.heldGear = false; });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(OUT_DIR, 'heldgear_off.png'), clip: await clipOf() });
      await page.evaluate(() => { window.VELSCOUR.G.settings.heldGear = true; });
    }
    console.log(cls, 'shots', shots.length);
  }

  // icons: a bag of weapons and off-hands of every rarity; and the same lying on the ground
  await page.evaluate(async () => {
    const { G } = window.VELSCOUR;
    const { rollItem } = await import('/src/data/items.js');
    const { CLASSES } = await import('/src/data/classes.js');
    const { GroundItem } = await import('/src/game/loot.js');
    const { loadHeld } = await import('/src/gfx/heldart.js');
    const C = CLASSES[G.char.classId], items = [];
    for (let R = 0; R < 6; R++) for (const [slot, base] of [['weapon', C.weapon], ['offhand', C.offhand || 'shield'], ['weapon', 'sword'], ['weapon', 'bow'], ['offhand', 'shield']]) items.push(rollItem(30 + R * 10, { slot, base, rarity: R }));
    G.char.bag.fill(null); items.forEach((it, i) => { if (i < G.char.bag.length) G.char.bag[i] = it; });
    await loadHeld(G.char.classId, G.char);
    items.slice(0, 12).forEach((it, i) => { const a = i / 12 * Math.PI * 2; G.world.addLoot(Object.assign(new GroundItem(G.player.x + Math.cos(a) * 1.6, G.player.y + Math.sin(a) * 1.6, 'item', { item: it }), { vz: 0, vx: 0, vy: 0 })); });
    G.showLabels = false;
  });
  await page.waitForTimeout(1500);
  const g = await page.evaluate(async () => { const { G } = window.VELSCOUR; const { camera } = await import('/src/core/view.js'); const [x, y] = camera.tileToScreen(G.player.x, G.player.y, 0); return { x: Math.max(0, x - 300), y: Math.max(0, y - 260), width: 600, height: 400 }; });
  await page.screenshot({ path: path.join(OUT_DIR, 'heldgear_ground.png'), clip: g });
  await page.keyboard.press('i');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, 'heldgear_bag.png') });
  await page.keyboard.press('i');

  if (fail.length) { console.log('FAIL\n ' + fail.join('\n ')); process.exitCode = 1; } else console.log('OK');
  report(errors);
  await browser.close();
})();
