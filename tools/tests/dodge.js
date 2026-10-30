// Auto-play against line attacks in corridors. A player saw the bot die over and over to a wyrm in a corridor: it
// quakes or charges straight down it, there's no room to step aside, and the bot stood there trading blows. Each
// fight puts the hero in a corridor with a foe 5 tiles down it and lets auto-play fight it out (god mode, so it
// keeps going), counting how many quakes and charges land on the hero:
//   wyrm     a Champion Ember Wyrm (demon: quakes down a line)
//   knight   a Champion knight (charger)
//   guardian an Ember Wyrm guardian whose patterns are charge + slam (a huge body charging)
// PASS when under a third of the line blows land (before the fix: 30 of 31). Shots dodge_<n>.png of the first fights.
//   node tools/tests/dodge.js [fights=12] [secs=25]        DODGE_CLASS=wizard for another class
const { openGame, report } = require('./harness');
const FIGHTS = +(process.argv[2] || 12);
const SECS = +(process.argv[3] || 25);
const CLS = process.env.DODGE_CLASS || 'paladin';

(async () => {
  const { browser, page, errors, shot } = await openGame({ width: 1280, height: 720 });
  await page.evaluate(async (cls) => {
    const { G, game } = window.VELSCOUR;
    await game.newChar(cls, 'Dodger');
    document.querySelectorAll('.screen').forEach((s) => s.remove());
    G.ui.modalCount = 0;
    const { Auto } = await import('/src/game/autoplay.js');
    Auto.toggle(true);
  }, CLS);
  const tot = {};
  let fights = 0;
  for (let li = 0; fights < FIGHTS && li < 20; li++) {
    const r = await page.evaluate(async ([li, want, secs]) => {
      const { G, game } = window.VELSCOUR;
      const { BIOMES } = await import('/src/data/biomes.js');
      const { makeMonster } = await import('/src/game/monster.js');
      const { Fissure } = await import('/src/game/hazards.js');
      const { Auto } = await import('/src/game/autoplay.js');
      const list = BIOMES.filter((b) => !['throne', 'town', 'sea_of_sand', 'castle', 'forsaken_wilds', 'dark_forest', 'skyship'].includes(b.id) && !b.outdoor);
      const biome = list[(li * 5) % list.length];
      const depth = 12 + li * 3;
      G.char.level = depth + 4; G.player.recompute();
      game.buildDungeon(depth, biome);
      const p = G.player, w = G.world, m = w.map, wk = (x, y) => m.walkableTile(x, y);
      G.godMode = true;
      // straight corridor runs at most 3 tiles across for 9 tiles, the hero on the middle line
      const span = (x, y, ox, oy) => { let a = 0, b = 0; while (a < 5 && wk(x - ox * (a + 1), y - oy * (a + 1))) a++; while (b < 5 && wk(x + ox * (b + 1), y + oy * (b + 1))) b++; return [a, b]; };
      const spots = [];
      for (let y = 2; y < m.h - 11; y++) for (let x = 2; x < m.w - 11; x++) {
        let okH = true, okV = true;
        for (let k = 0; k < 9; k++) {
          const h = span(x + k, y, 0, 1), v = span(x, y + k, 1, 0);
          if (!wk(x + k, y) || h[0] + h[1] > 2 || h[0] !== h[1]) okH = false;
          if (!wk(x, y + k) || v[0] + v[1] > 2 || v[0] !== v[1]) okV = false;
        }
        if (okH) spots.push([x, y, 1, 0]); else if (okV) spots.push([x, y, 0, 1]);
      }
      const fis = [];
      const add0 = w.addHazard.bind(w);
      w.addHazard = (h) => { if (h instanceof Fissure) fis.push(h); return add0(h); };
      const out = [];
      const kinds = ['wyrm', 'knight', 'guardian'];
      for (let s = 0; s < Math.min(want, 3) && spots.length; s++) {
        const [sx, sy, dx, dy] = spots.splice(Math.floor(spots.length * (s + 0.5) / 3.5), 1)[0];
        const kind = kinds[(li + s) % 3];
        for (const c of w.creatures) if (!c.isPlayer && c.team === 'enemy') c.dead = true;
        w.update(0.1);
        p.x = sx + dx * 1 + 0.5; p.y = sy + dy * 1 + 0.5; p.hp = p.maxHp;
        const mon = makeMonster(w, kind === 'knight' ? 'knight' : 'demon', w.biome, G.char.level, kind === 'guardian' ? 'boss' : 'champion', p.x + dx * 5, p.y + dy * 5);
        if (kind !== 'knight') mon.name = (kind === 'guardian' ? '' : 'Champion ') + 'Ember Wyrm';
        if (kind === 'guardian') { mon.patterns = ['charge', 'charge', 'slam']; mon.patternQ = []; }
        mon.maxHp = mon.hp = mon.maxHp * 4; // long enough to see a few blows
        mon.awake = true; mon.aggro = p;
        w.add(mon);
        const charges = [];
        const sa = mon.startAction.bind(mon);
        mon.startAction = (k, dur, o) => { const r = sa(k, dur, o); if (k === 'charge') charges.push(mon.action); return r; };
        let quakes = 0;
        const bm = mon.beginMove.bind(mon);
        mon.beginMove = (k, t, d) => { const r = bm(k, t, d); if (k === 'quake' && r !== false) quakes++; return r; };
        Auto.dodge = null; Auto.navT = 0; Auto.path = null; Auto.open = null;
        fis.length = 0;
        const st = {};
        for (let i = 0; i < secs * 30 && !mon.dead; i++) {
          G.dt = 1 / 30; G.time += G.dt; game.update(1 / 30);
          if (i % 15 === 0) st[Auto.status.replace(/ .*/, '')] = (st[Auto.status.replace(/ .*/, '')] || 0) + 1;
          if (G.mode !== 'game' || G.world !== w) break;
        }
        const qHit = fis.filter((f) => f.src === mon && f.hitSet.has(p.id)).length;
        const cHit = charges.filter((a) => a.hit).length;
        out.push({ kind, quakes, qHit, charges: charges.length, cHit, killed: mon.dead, st });
        mon.dead = true; w.update(0.1);
      }
      return { biome: biome.id, depth, out };
    }, [li, FIGHTS - fights, SECS]);
    for (const o of r.out) {
      fights++;
      const t = tot[o.kind] || (tot[o.kind] = { n: 0, cast: 0, hit: 0 });
      t.n++; t.cast += o.quakes + o.charges; t.hit += o.qHit + o.cHit;
      console.log(`${r.biome} D${r.depth} ${o.kind}: quakes ${o.qHit}/${o.quakes} charges ${o.cHit}/${o.charges}${o.killed ? ' (killed)' : ''}  ${JSON.stringify(o.st)}`);
    }
    if (li < 2) await shot('dodge_' + li);
  }
  let cast = 0, hit = 0;
  for (const [k, t] of Object.entries(tot)) { cast += t.cast; hit += t.hit; console.log(`${k}: ${t.hit}/${t.cast} line blows landed over ${t.n} fights`); }
  const pct = cast ? Math.round((hit / cast) * 100) : 0;
  console.log(`\nall: ${hit}/${cast} (${pct}%) landed`);
  if (pct > 33) { console.log('FAIL: the bot stands in line blows in corridors'); process.exitCode = 1; }
  report(errors, 20);
  await browser.close();
})();
