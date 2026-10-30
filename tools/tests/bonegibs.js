// Bone gibs (src/gfx/bonegibs.js, baked by tools/bones3d_bake.js): the sheet loads with every bone's tumble and rest
// frames, every look paints, bursts deal skulls/rib cages at most once, then shots: a magnified sheet of every bone in
// every look and colour (bonegibs_sheet.png), and monsters of each gore type killed in a dungeon room, the bones in
// flight and lying on the floor at the usual zoom (bonegibs_air.png, bonegibs_floor.png) and close up (_close).
// From repo root: python3 -m http.server 8123; node tools/tests/bonegibs.js
const fs = require('fs');
const path = require('path');
const { openGame, report, OUT_DIR } = require('./harness');

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1280, height: 720 });
  try {
    const res = await page.evaluate(async () => {
      const problems = [];
      const { G, game } = window.VELSCOUR;
      const { A } = await import('/src/core/assets.js');
      const BG = await import('/src/gfx/bonegibs.js');
      const { BIOME_BY_ID } = await import('/src/data/biomes.js');
      if (!BG.bonesReady()) return { problems: ['bone sheet not loaded'] };
      const B = A.boneMeta.bones, kinds = Object.keys(B);
      for (const k of kinds) {
        if (B[k].t.length !== A.boneMeta.turns) problems.push(`${k}: ${B[k].t.length} tumble frames`);
        if (B[k].r.length < 8) problems.push(`${k}: ${B[k].r.length} rest frames`);
      }
      for (const k of ['skull', 'ribcage', 'femur', 'rib']) if (!B[k]) problems.push('no ' + k);
      for (let i = 0; i < 200; i++) {
        const d = BG.boneDeck(14), c = (k) => d.filter((x) => x === k).length;
        if (d.length !== 14 || ['skull', 'ribcage', 'pelvis', 'jaw'].some((k) => c(k) > 1)) { problems.push('bad deck ' + d.join(',')); break; }
        if (BG.boneDeck(5, true).some((k) => B[k].once)) { problems.push('a loose deck dealt a skull or rib cage'); break; }
      }
      // the sheet: every bone, tumbling and lying, in every look and colour; 4x, nearest neighbour
      const Z = 5, CW = 28, looks = [
        ['#e8dcc0', '#8a0b08', 0, 'bone'], ['#e8dcc0', '#8a0b08', 1, 'bone, bloodied'], ['#e8dcc0', '#8a0b08', 2, 'other end'], ['#e8dcc0', '#8a0b08', 3, 'soaked'],
        ['#5c1a14', '#8a0b08', 0, 'flesh'], ['#5c1a14', '#8a0b08', 3, 'flesh, soaked'], ['#2a8010', '#4ab020', 1, 'goo'], ['#c0f0ff', '#80e0ff', 0, 'ecto'],
        ['#8a8078', '#6a6058', 2, 'rock'], ['#ff8020', '#ffcc40', 1, 'spark'], ['#d8ccb0', '#4ab020', 3, 'bone in goo'], ['#e8dcc0', null, 0, 'skeleton'],
      ];
      const sheet = document.createElement('canvas');
      sheet.width = (looks.length * 2 + 1) * CW * Z; sheet.height = (kinds.length * CW + 12) * Z;
      const g = sheet.getContext('2d');
      g.fillStyle = '#2b2622'; g.fillRect(0, 0, sheet.width, sheet.height);
      g.imageSmoothingEnabled = false;
      const label = (t, x, y) => { g.fillStyle = '#d8ccb0'; g.font = '24px monospace'; g.fillText(t, x, y); };
      looks.forEach(([, , , n], j) => label(n, (1 + j * 2) * CW * Z + 8, 34));
      kinds.forEach((k, i) => {
        label(k, 8, (12 + i * CW + CW / 2) * Z);
        looks.forEach(([color, coat, look], j) => for2(j, i, color, coat, look, k));
      });
      function for2(j, i, color, coat, look, k) {
        for (const lying of [0, 1]) {
          const x = (1 + j * 2 + lying) * CW + CW / 2, y = 12 + i * CW + CW * (lying ? 0.7 : 0.5);
          g.setTransform(Z, 0, 0, Z, 0, 0);
          if (lying) { g.fillStyle = '#3a332c'; g.beginPath(); g.ellipse(x, y, 12, 6, 0, 0, Math.PI * 2); g.fill(); }
          BG.drawBoneGib(g, { bone: k, look, color, coat, rot: (i * 0.7 + j) % 6.28, vr: lying ? 0 : 1, z: lying ? 0 : 1, rest: i * 3 + j, size: 1 }, x, y);
          g.setTransform(1, 0, 0, 1, 0, 0);
        }
      }
      // a dungeon: the hero in the middle of its biggest room, the monsters near it cleared
      await game.newChar('paladin', 'Bone QA');
      G.godMode = true;
      game.buildDungeon(3, BIOME_BY_ID.castle_keep);   // plain floors: no bones painted in the walls
      const w = G.world, p = G.player, room = [...w.rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
      p.x = room.x + room.w / 2; p.y = room.y + room.h / 2;
      const { camera } = await import('/src/core/view.js');
      camera.follow(p.x, p.y, 0, true);
      // nothing else walks in while the shots are taken
      const ours = new Set();
      setInterval(() => { for (const m of w.creatures) if (m.team === 'enemy' && !ours.has(m)) m.dead = true; }, 50);
      const { ARCH } = await import('/src/data/enemies.js');
      const { makeMonster } = await import('/src/game/monster.js');
      const { kill } = await import('/src/game/combat.js');
      const { particles } = await import('/src/gfx/vfx.js');
      // one monster of each gore type in a ring round the hero, killed at once by nobody (no xp, no level-up banner)
      const want = ['flesh', 'bone', 'goo', 'ecto', 'rock', 'spark'];
      window.__boneKill = (zoom) => {
        G.settings.zoom = zoom; camera.computeZoom();
        for (const q of particles) if (q.type === 'gib') q.life = -1;
        const ring = [];
        for (const gore of want) {
          const id = Object.keys(ARCH).find((a) => (ARCH[a].gore || 'flesh') === gore);
          if (!id) { problems.push('no monster with gore ' + gore); continue; }
          const a = ring.length / want.length * Math.PI * 2 + 0.3;
          let x = p.x + Math.cos(a) * 2.6, y = p.y + Math.sin(a) * 2.6;
          if (!w.map.isFloor(x, y)) [x, y] = w.map.randomNear(p.x, p.y, 3);
          const m = makeMonster(w, id, w.biome, 5, 'normal', x, y);
          ours.add(m); w.add(m); ring.push(gore + ':' + id); kill(m, null, { overkill: 1 });
        }
        return ring;
      };
      return { problems, kinds, sheet: sheet.toDataURL('image/png'), size: [A.boneImg.width, A.boneImg.height] };
    });
    errors.push(...res.problems);
    if (res.sheet) fs.writeFileSync(path.join(OUT_DIR, 'bonegibs_sheet.png'), Buffer.from(res.sheet.split(',')[1], 'base64'));
    console.log('bones', (res.kinds || []).join(', '), 'sheet', JSON.stringify(res.size));
    await page.waitForTimeout(5000);   // the arrival beam and the depth's title go first
    for (const [zoom, tag] of [[1, ''], [2.4, '_close']]) {
      const ring = await page.evaluate((z) => window.__boneKill(z), zoom);
      if (!tag) console.log('killed', ring.join(' '));
      await page.waitForTimeout(150);
      await shot('bonegibs_air' + tag);
      await page.waitForTimeout(3300);
      await shot('bonegibs_floor' + tag);
    }
    // the bones on the floor: lying poses, and all drawn from the sheet (none fell back to rects)
    const live = await page.evaluate(async () => {
      const { particles } = await import('/src/gfx/vfx.js');
      const gibs = particles.filter((q) => q.type === 'gib' && q.life > 0);
      return { bones: gibs.filter((q) => q.bone).length, rects: gibs.filter((q) => !q.bone && !q.spr).length, lying: gibs.filter((q) => q.bone && q.z <= 0 && q.vr === 0).length,
        kinds: [...new Set(gibs.filter((q) => q.bone).map((q) => q.bone))].join(','), looks: [0, 1, 2, 3].map((l) => gibs.filter((q) => q.bone && q.look === l).length).join('/') };
    });
    console.log('on the floor', JSON.stringify(live));
    if (!live.bones) errors.push('no bone gibs from the kills');
    if (live.rects) errors.push(live.rects + ' gibs fell back to rects');
    if (live.lying < live.bones * 0.8) errors.push(`only ${live.lying} of ${live.bones} bones settled`);
  } catch (e) { errors.push('BONE GIBS: ' + (e.stack || e)); }
  report(errors);
  await browser.close();
})().catch((e) => { console.error(e); process.exitCode = 1; });
