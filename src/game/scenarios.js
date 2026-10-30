// Dungeon scenarios: about half the depths of a dungeon biome host one of the biome's twenty optional set pieces
// (data/biomerooms.js: titles and wording per biome, twenty shared mechanics here). They are never required to leave;
// each pays a hoard. Also announces the themed rooms (dungeon.js) as the hero walks into them.
// Wiring: happenings.setupHappenings -> setupScenario, happeningsTick -> scenarioTick, the Quest Log reads
// world.scenario (title, desc, progress()), auto-play reads world.scenario.objective. Interactables live in
// world.chests (drawn by their draw(), used like chests), people in world.npcs.
import { G } from '../state.js';
import { rand, randi, chance, pick, TAU, dist } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { camera } from '../core/view.js';
import { addEffect, Ring, Column, burst, sparkle, spawn, floatText, addLight, glowSprite } from '../gfx/vfx.js';
import { makeMonster } from './monster.js';
import { ambush } from './mayhem.js';
import { GroundItem, dropChest } from './loot.js';
import { rollItem, rarityAt, goldScale } from '../data/items.js';
import { depthLevel } from '../data/depth.js';
import { biomeScenario, TAGS } from '../data/biomerooms.js';
import { TOWNSFOLK } from '../data/townsfolk.js';
import { UI } from '../ui/ui.js';

export const SCENARIO_CHANCE = 0.55;
const COLOR = '#ffb347';

/** Roll this depth's scenario (or none) once the level is built. `force` = a mechanic index (tests). */
export function setupScenario(world, start, force = G.scenarioForce ?? null) {
  world.scenario = null;
  world.roomSeen = new Set();
  const b = world.biome;
  if (world.kind !== 'dungeon' || world.raid || b.overworld || b.id === 'throne') return;
  if (force === null && !chance(SCENARIO_CHANCE)) return;
  const c = G.char || {};
  let i = force ?? randi(0, 19);
  if (force === null && c.lastScenario === b.id + i) i = (i + randi(1, 19)) % 20;
  c.lastScenario = b.id + i;
  const need = Math.min(40, 16 + Math.floor((world.depth || 1) / 6));
  const info = biomeScenario(b.id, i, need);
  if (!info) return;
  const S = makeScenario(world, start, info, need);
  if (!S) return;
  world.scenario = S;
  setTimeout(() => {
    if (G.world !== world) return;
    UI.log(`<b style="color:${COLOR}">${info.title}</b>: ${info.desc}`, COLOR);
  }, 5200);
}

export function scenarioTick(world, dt) {
  const p = world.player;
  if (!p || p.dead) return;
  // name a themed room the first time the hero walks in
  if (world.rooms && (world.roomT = (world.roomT || 0) - dt) <= 0) {
    world.roomSeen = world.roomSeen || new Set();
    world.roomT = 0.4;
    const r = world.rooms.find((r) => r.title && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h);
    if (r && !world.roomSeen.has(r)) { world.roomSeen.add(r); floatText(p.x, p.y, 96, r.title, '#e8d6a8', 13, { life: 2.4, vz: 6 }); }
  }
  const S = world.scenario;
  if (S && !S.done && !S.failed) S.tick(dt);
}

// ------------------------------------------------------------------------------------------------ the mechanics
function makeScenario(world, start, info, need) {
  const { mech, words: W } = info, map = world.map, depth = world.depth || 1, lvl = depthLevel(depth), biome = world.biome;
  const ts = world.tileset, scat = ts ? ts.scatter : [];
  const roster = world.roster && world.roster.length ? world.roster : biome.roster;
  const S = { ...info, done: false, failed: false, active: false, got: 0, goal: 1, foes: [], objective: null, t: 0 };
  const sprite = (tag) => { const l = scat.filter((e) => tag === 'light' ? /brazier|candel|torch|lantern|censer/.test(e.name) : TAGS[tag].test(e.name)); return l.length ? pick(l) : null; };
  const foesAlive = () => S.foes.some((m) => !m.dead);
  // places: room spots the hero can reach, away from the start and from each other
  const spots = (n, far = 8) => {
    const out = [], rooms = (world.rooms || []).filter((r) => r.w).sort(() => Math.random() - 0.5);
    for (const r of rooms.concat(rooms)) {
      if (out.length >= n) break;
      let [x, y] = [r.mx + rand(-1.5, 1.5), r.my + rand(-1.5, 1.5)];
      if (!map.walkable(x, y)) [x, y] = map.randomNear(r.mx, r.my, 2);
      if (!map.walkable(x, y) || dist(x, y, start[0], start[1]) < far || out.some((s) => dist(s[0], s[1], x, y) < 5)) continue;
      if (!map.findPath(start[0], start[1], x, y, 12000)) continue;
      out.push([x, y]);
    }
    return out;
  };
  const foe = (arch, [x, y], rank = 'normal', n = 1, opts = {}) => {
    const made = [];
    for (let i = 0; i < n; i++) {
      const [mx, my] = i ? map.randomNear(x, y, 1.8) : [x, y];
      if (!map.walkable(mx, my)) continue;
      const m = makeMonster(world, arch || pick(roster), biome, lvl + (rank === 'normal' ? 0 : 1), rank, mx, my, 0);
      if (opts.name && i === 0) m.name = opts.name;
      if (opts.hp && i === 0) { m.maxHp *= opts.hp; m.hp = m.maxHp; }
      if (opts.awake) m.awake = true;
      world.add(m); S.foes.push(m); made.push(m);
    }
    return made;
  };
  const wave = (at, n) => { const n0 = world.creatures.length; ambush(world, undefined, n); S.foes.push(...world.creatures.slice(n0).filter((m) => m.team === 'enemy')); };
  // an interactable: a biome prop (or a glowing sigil) that does something when used
  const marker = (x, y, label, spr, use, o = {}) => {
    const k = ts ? ts.k : 0.4, glow = o.color || COLOR;
    const mk = { x, y, opened: false, reach: o.reach || 1.5, far: 40, label, dot: glow, hidden: !!o.hidden, ...o,
      draw(ctx, sx, sy) {
        if (this.hidden) return;
        const s = this.spr;
        if (s) ctx.drawImage(s.img, s.sx, s.sy, s.w, s.h, sx + s.ox * k, sy + s.oy * k, s.w * k, s.h * k);
        else { ctx.strokeStyle = glow; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, 16, 8, 0, 0, TAU); ctx.stroke(); }
        if (!this.opened) {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + Math.sin(G.time * 3 + x) * 0.15;
          ctx.drawImage(glowSprite(glow), sx - 24, sy - 46, 48, 50);
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
          if (this.light) addLight(this.x, this.y, 2.6, 0.8, 30, glow);
        }
      },
      use() { if (this.opened || this.hidden || S.done || S.failed) return; use(this); } };
    mk.spr = spr;
    world.chests.push(mk);
    return mk;
  };
  const reward = (x, y, legendary = false) => {
    if (S.done) return;
    S.done = true; S.objective = null;
    for (const ch of world.chests) if (ch.scen === S) ch.opened = true;
    dropChest(world, { x, y, rare: true }, depth); dropChest(world, { x, y, rare: true }, depth);
    const p = G.player;
    // an Epic, Legendary 30% of the time (always for a legendary scenario), Mythic 3%; gated by item level (rarityAt)
    world.addLoot(new GroundItem(x, y + 0.3, 'item', { item: rollItem(lvl + 2, { rarity: rarityAt(lvl + 2, chance(0.03) ? 5 : legendary || chance(0.3) ? 4 : 3), mf: p ? p.st.magicFind : 0 }) }));
    addEffect(new Column(x, y, COLOR, 0.9, 30, 360)); sparkle(x, y, 24, '#ffd060', 24, 0.6);
    sfx('gate'); UI.centerMsg(S.title.toUpperCase(), 'Scenario complete: a hoard is yours', 2.8);
    UI.log(`<b style="color:${COLOR}">${S.title}</b> complete.`, COLOR);
  };
  const fail = (why) => { S.failed = true; S.objective = null; sfx('error'); UI.centerMsg('SCENARIO FAILED', why, 2.4); };
  const begin = (sub) => { S.active = true; UI.centerMsg(S.title.toUpperCase(), sub || S.desc, 2.8); sfx('boss', 0.5); camera.shake(4); };
  const own = (mk) => { mk.scen = S; return mk; };
  const progress = (f) => { S.progress = f; };
  const at = spots(6);
  if (at.length < 3) return null;
  S.start = at[0];

  switch (mech) {
    case 'relic': { // lift it, outlast three waves
      own(marker(...at[0], W.relic, sprite('treasure') || sprite('tomb'), (mk) => { mk.opened = true; begin(); S.waves = 3; S.waveT = 0.5; }, { color: '#ff4070' }));
      S.tick = (dt) => {
        if (S.waves > 0 && S.waves < 3 && !foesAlive()) S.waveT = Math.min(S.waveT, 0.6); // a wave cut down: the next comes at once
        if (S.waves > 0 && (S.waveT -= dt) <= 0) { wave(at[0], randi(4, 7)); S.waves--; S.waveT = 8; }
        if (S.active && !S.waves && !foesAlive()) reward(...at[0]);
      };
      progress(() => S.active ? `${3 - S.waves}/3 waves called` : 'Find the relic');
      break;
    }
    case 'captives': case 'escort': {
      const n = mech === 'escort' ? 1 : 3, folk = TOWNSFOLK.filter((v) => !v.royal && !v.courtier);
      S.goal = n;
      const people = at.slice(0, n).map(([x, y], i) => {
        const f = pick(folk);
        const npc = { name: mech === 'escort' ? W.soul.replace(/^an? |^the /, '').replace(/^./, (c) => c.toUpperCase()) : 'Prisoner', x, y,
          townsfolkSpriteId: f.spriteId, pal: f.palette, frameCount: f.frame.count, child: f.child, animT: rand(3), walkT: 0, idleSeed: randi(0, 2),
          emotion: mech === 'escort' ? 'scared' : 'pray', emotionT: 4, alpha: mech === 'escort' ? 0.75 : 1, hp: 100,
          update(dt) { this.animT += dt; if (!this.walking) this.walkT = 0; this.walking = false; } };
        world.npcs.push(npc);
        if (mech === 'captives') foe(null, map.randomNear(x, y, 2.5), i === n - 1 ? 'champion' : 'normal', 3);
        own(marker(x, y, mech === 'escort' ? 'Lead ' + W.soul : 'Free the prisoner', sprite('chain'), (mk) => {
          mk.opened = true;
          if (mech === 'escort') { npc.follow = true; begin('Lead it to the far altar'); S.waveT = 6; return; }
          S.got++; npc.emotion = 'cheer'; npc.emotionT = 3; sfx('levelup', 0.4); floatText(x, y, 70, 'Freed!', '#a0ff90', 14);
          setTimeout(() => { const i = world.npcs.indexOf(npc); if (i >= 0) world.npcs.splice(i, 1); }, 2500);
          if (S.got >= n) reward(x, y);
        }, { color: '#a0ff90' }));
        return npc;
      });
      if (mech === 'escort') {
        const soul = people[0], goal = at[at.length - 1];
        own(marker(...goal, 'The far altar', sprite('altar'), () => {}, { color: '#a0e0ff', inert: true })); // only where to lead it: nothing to use
        S.tick = (dt) => {
          if (!soul.follow) return;
          const p = G.player, d = dist(soul.x, soul.y, p.x, p.y);
          if (d > 1.6) {
            if (d > 7) { const [x, y] = map.randomNear(p.x, p.y, 1.5); soul.x = x; soul.y = y; }
            else { const a = Math.atan2(p.y - soul.y, p.x - soul.x), nx = soul.x + Math.cos(a) * 3.6 * dt, ny = soul.y + Math.sin(a) * 3.6 * dt; if (map.walkable(nx, ny)) { soul.x = nx; soul.y = ny; soul.walking = true; soul.flip = Math.cos(a) < 0; } }
          }
          const near = world.creatures.filter((m) => m.team === 'enemy' && !m.dead && dist(m.x, m.y, soul.x, soul.y) < 1.4).length;
          if (near) { soul.hp -= near * 6 * dt; if (chance(dt * 3)) floatText(soul.x, soul.y, 60, Math.ceil(soul.hp) + '', '#ff8080', 11); }
          if ((S.waveT -= dt) <= 0) { S.waveT = rand(10, 16); wave(null, randi(3, 5)); }
          if (soul.hp <= 0) { const i = world.npcs.indexOf(soul); if (i >= 0) world.npcs.splice(i, 1); fail('The one you led has fallen'); }
          else if (dist(soul.x, soul.y, goal[0], goal[1]) < 2) { soul.follow = false; soul.emotion = 'cheer'; soul.emotionT = 3; reward(...goal); }
          S.objective = { x: goal[0], y: goal[1], reach: 1.2 };
        };
        progress(() => soul.follow ? `Lead it on: ${Math.max(0, Math.ceil(soul.hp))}% left` : 'Find ' + W.soul);
      } else { S.tick = () => {}; progress(() => `${S.got}/${n} freed`); }
      break;
    }
    case 'ritual': case 'nests': case 'idols': case 'rifts': { // destroy n things, each defended or spawning
      const n = Math.min(mech === 'nests' ? 4 : 3, at.length);
      S.goal = n;
      const tag = { ritual: 'altar', nests: 'growth', idols: 'statue', rifts: null }[mech];
      const swarm = roster.filter((a) => ['spider', 'bat', 'worm', 'slime', 'beetle', 'imp'].includes(a));
      for (const [x, y] of at.slice(0, n)) {
        if (mech === 'ritual') foe(roster.includes('cultist') ? 'cultist' : null, map.randomNear(x, y, 2), 'normal', 3);
        const mk = own(marker(x, y, { ritual: 'Break the circle', nests: 'Burn the nest', idols: 'Smash the idol', rifts: 'Seal the rift' }[mech], tag && (sprite(tag) || sprite('bones')), (mk) => {
          if (mech === 'ritual' && world.creatures.some((m) => m.team === 'enemy' && !m.dead && dist(m.x, m.y, x, y) < 3)) { floatText(x, y, 70, 'Its keepers still stand', '#ff8060', 12); return; }
          mk.opened = true; S.got++; S.active = true;
          burst(x, y, 20, mech === 'rifts' ? 'arcane' : 'fire', 24, 4, { up: 2 }); sfx('gate', 0.5);
          if (mech === 'nests') foe(swarm.length ? pick(swarm) : null, [x, y], 'normal', randi(3, 5), { awake: true });
          if (mech === 'idols' || mech === 'ritual') foe(null, map.randomNear(x, y, 3), 'normal', 2, { awake: true });
          if (S.got >= n) reward(x, y);
        }, { color: mech === 'rifts' ? '#b070ff' : '#ff7040' }));
        mk.rift = mech === 'rifts'; mk.t = rand(4, 8);
      }
      S.tick = (dt) => {
        const p = G.player;
        for (const mk of world.chests) {
          if (mk.scen !== S || mk.opened) continue;
          if (mk.rift) { // an open rift spits a foe now and then while the hero is near
            if (chance(dt * 6)) spawn({ type: 'glow', x: mk.x + rand(-0.5, 0.5), y: mk.y + rand(-0.5, 0.5), z: rand(5, 40), vz: 30, life: 0.7, size: 3, size1: 0, color: '#b070ff', add: true });
            if (dist(mk.x, mk.y, p.x, p.y) < 14 && (mk.t -= dt) <= 0) { mk.t = rand(7, 11); foe(null, map.randomNear(mk.x, mk.y, 1.2), 'normal', 1, { awake: true }); }
          }
        }
        // standing idols empower every foe
        if (mech === 'idols' && S.got < n) for (const m of world.creatures) if (m.team === 'enemy' && !m._idol && !m.dead) { m._idol = true; m.dmg *= 1.25; m.aura = m.aura || '#ff5030'; }
      };
      progress(() => `${S.got}/${n} ${mech === 'nests' ? 'burned' : mech === 'rifts' ? 'sealed' : mech === 'idols' ? 'smashed' : 'broken'}`);
      break;
    }
    case 'champion': case 'hunt': case 'bounty': case 'herald': { // named foes to bring down
      const n = mech === 'champion' || mech === 'herald' ? 1 : 3;
      S.goal = n;
      const names = mech === 'bounty' ? ['the Butcher', 'the Collector', 'Old Ironjaw', 'the Hollow', 'the Widowmaker', 'Grimtooth'].sort(() => Math.random() - 0.5) : [];
      const make = (i) => {
        const [x, y] = at[(i + 1) % at.length];
        const rank = mech === 'hunt' ? 'champion' : 'unique';
        const lead = mech === 'champion' ? W.champion.replace(/^The /, '') : mech === 'herald' ? W.lord.replace(/^the /, '').replace(/^./, (c) => c.toUpperCase()) : null;
        const ms = foe(pick(roster.filter((a) => !['bat', 'spider', 'beetle'].includes(a)).concat(roster)), [x, y], rank, mech === 'hunt' ? 4 : mech === 'bounty' ? 3 : 1,
          { name: lead || undefined, hp: mech === 'herald' ? 5 : mech === 'champion' ? 3 : 1, awake: mech === 'herald' });
        if (mech === 'bounty' && ms[0]) ms[0].name += ' ' + names[i];
        if (ms[0]) { ms[0].marked = S; ms[0].scale = (ms[0].scale || 1) * (mech === 'herald' ? 1.35 : 1.15); }
        return ms[0];
      };
      if (mech === 'herald') {
        own(marker(...at[0], 'Wake ' + W.lord, sprite('altar'), (mk) => { mk.opened = true; at[1] = map.randomNear(at[0][0], at[0][1], 3); S.targets = [make(0)]; begin(); addEffect(new Ring(at[0][0], at[0][1], 0.2, 5, 0.8, '#ff3030', 8)); }, { color: '#ff3030' }));
      } else S.targets = Array.from({ length: n }, (_, i) => make(i)).filter(Boolean);
      S.tick = () => {
        if (!S.targets) return;
        S.got = S.targets.filter((m) => m.dead).length;
        if (S.got >= S.targets.length) { const m = S.targets[S.targets.length - 1]; reward(m.x, m.y, mech === 'herald'); }
      };
      progress(() => S.targets ? `${S.got}/${S.targets.length} slain` : 'Find the altar');
      break;
    }
    case 'hold': case 'ward': case 'slaughter': { // timed stands
      const time = mech === 'hold' ? 20 : 45;
      own(marker(...at[0], mech === 'ward' ? 'The ' + W.ward : mech === 'hold' ? 'The ' + W.holdplace : 'Turn the hourglass', sprite(mech === 'ward' ? 'statue' : 'altar'), (mk) => {
        mk.opened = true; begin(); S.left = time; S.waveT = 0.5; S.wardHp = 100; S.k0 = world.happen ? world.happen.kills || 0 : 0; S.waves = 4;
      }, { color: '#80d0ff' }));
      S.tick = (dt) => {
        if (!S.active) return;
        const p = G.player, [x, y] = at[0];
        if (mech === 'hold') {
          S.objective = { x, y, reach: 1.2 };
          if (dist(p.x, p.y, x, y) < 2.6) S.left -= dt;
          if ((S.waveT -= dt) <= 0) { S.waveT = 4.5; wave(null, randi(2, 4)); }
          if (chance(dt * 10)) spawn({ type: 'glow', x: x + rand(-2.5, 2.5), y: y + rand(-2.5, 2.5), z: 2, vz: 25, life: 0.8, size: 2.5, size1: 0, color: '#80d0ff', add: true });
          if (S.left <= 0) reward(x, y);
        } else if (mech === 'ward') {
          S.objective = { x, y, reach: 3 };
          if (S.waves > 0 && !S.foes.some((m) => !m.dead && dist(m.x, m.y, x, y) < 16) && (S.waveT -= dt) <= 0) { S.waves--; S.waveT = 0.8; S.foes.push(...foe(null, map.randomNear(x, y, 6), S.waves ? 'normal' : 'champion', 4 + (3 - S.waves), { awake: true })); }
          const near = world.creatures.filter((m) => m.team === 'enemy' && !m.dead && dist(m.x, m.y, x, y) < 2).length;
          S.wardHp -= near * 2.5 * dt;
          if (S.wardHp <= 0) fail('The ' + W.ward + ' has fallen');
          else if (!S.waves && !foesAlive()) reward(x, y);
        } else {
          S.left -= dt; S.got = (world.happen ? world.happen.kills || 0 : 0) - S.k0;
          if (!foesAlive()) S.waveT = Math.min(S.waveT, 0.5); // the hourglass runs: nobody stands about between waves
          if ((S.waveT -= dt) <= 0) { S.waveT = 6; wave(null, randi(4, 6)); }
          if (S.got >= need) reward(p.x, p.y); else if (S.left <= 0) fail('The hourglass ran dry');
        }
      };
      progress(() => !S.active ? 'Not yet begun' : mech === 'hold' ? `${Math.max(0, Math.ceil(S.left))}s left on the stone` : mech === 'ward' ? `Ward ${Math.max(0, Math.ceil(S.wardHp))}%, ${S.waves} waves to come` : `${S.got}/${need} slain, ${Math.max(0, Math.ceil(S.left))}s`);
      break;
    }
    case 'shards': case 'trail': case 'vault': case 'darkness': { // find and use a set of things
      const n = mech === 'shards' ? 5 : 4, places = spots(n + 1, 5).concat(at).slice(0, n + 1);
      S.goal = n;
      if (mech === 'darkness') { S.dark0 = world.darkK || 0; world.darkK = 0.97; }
      const tag = { shards: 'crystal', trail: 'bones', vault: 'chain', darkness: 'light' }[mech];
      const mks = places.slice(0, n).map(([x, y], i) => own(marker(x, y, { shards: 'A shard of the ' + W.shard, trail: 'A clue', vault: 'One of the ' + W.levers, darkness: 'Relight the brazier' }[mech],
        sprite(tag) || sprite('treasure'), (mk) => {
          mk.opened = true; S.got++; sfx(mech === 'darkness' ? 'fire' : 'gold', 0.6); sparkle(x, y, 12, COLOR, 14, 0.4);
          if (mech === 'darkness') { mk.lit = true; world.darkK = S.dark0 + (0.97 - S.dark0) * (1 - S.got / n); }
          if (mech === 'shards' && chance(0.6)) foe(null, map.randomNear(x, y, 3), 'normal', 2, { awake: true });
          if (mech === 'trail' && mks[i + 1]) { mks[i + 1].hidden = false; floatText(x, y, 70, 'The trail leads on...', COLOR, 12); }
          if (S.got >= n) {
            if (mech === 'shards') { altar.hidden = false; floatText(x, y, 70, 'Lay them on the altar', COLOR, 13); }
            else if (mech === 'vault') { const [vx, vy] = places[n]; foe(null, [vx, vy], 'champion', 2, { awake: true }); S.vaultOpen = true; UI.centerMsg('THE VAULT OPENS', 'Its keepers wake', 2.2); }
            else reward(x, y);
          }
        }, { color: mech === 'darkness' ? '#ffb040' : COLOR, hidden: mech === 'trail' && i > 0 })));
      for (const mk of mks) if (mech === 'darkness') { const d = mk.draw; mk.draw = function (ctx, sx, sy) { d.call(this, ctx, sx, sy); if (this.lit) addLight(this.x, this.y, 4, 1, 30, '#ffb060'); }; }
      const altar = mech === 'shards' ? own(marker(...places[n], 'The altar', sprite('altar'), () => { if (S.got >= n) reward(...places[n]); }, { hidden: true })) : null;
      S.tick = () => {
        if (mech === 'vault' && S.vaultOpen && !foesAlive()) reward(...places[n], true);
        if (S.done && mech === 'darkness') world.darkK = S.dark0;
      };
      progress(() => mech === 'vault' && S.vaultOpen ? 'Defeat the vault\'s keepers' : `${S.got}/${n} ${mech === 'darkness' ? 'relit' : mech === 'vault' ? 'thrown' : 'found'}`);
      break;
    }
    case 'courier': { // a fleeing thief with a hoard
      const [x, y] = at[1];
      const m = foe(pick(roster), [x, y], 'unique', 1, { name: W.courier.replace(/^An? /, ''), hp: 4 })[0];
      if (!m) return null;
      m.dmg *= 0.5; m.speed = Math.min(3.6, (m.speed || 2.5) * 1.3);
      S.targets = [m]; S.left = 45;
      S.tick = (dt) => {
        const p = G.player;
        if (m.dead) { reward(m.x, m.y); return; }
        if (!S.active && dist(m.x, m.y, p.x, p.y) < 10) { begin('Catch it before it escapes!'); m.awake = true; }
        if (!S.active) return;
        m.status.fear = { t: 1 };
        if (chance(dt * 1.5)) world.addLoot(new GroundItem(m.x, m.y, 'gold', { amount: Math.round((5 + lvl * 1.5) * goldScale(lvl)) }));
        if ((S.left -= dt) <= 0) { addEffect(new Ring(m.x, m.y, 2, 0.1, 0.5, COLOR, 4)); m.dead = true; fail('It escaped'); }
      };
      progress(() => S.active ? `${Math.max(0, Math.ceil(S.left))}s before it escapes` : 'Somewhere on this depth');
      break;
    }
    case 'mimics': { // a room of chests; two of them bite
      const [x, y] = at[0], bad = new Set([0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, 2));
      // five chests round the spot (any on a blocked tile moves to the nearest free one)
      const places = [0, 1, 2, 3, 4].map((i) => { const a = i / 5 * TAU, cx = x + Math.cos(a) * 1.6, cy = y + Math.sin(a) * 1.6; return map.walkable(cx, cy) ? [cx, cy] : map.randomNear(x, y, 2.5); }).filter(([cx, cy]) => map.walkable(cx, cy));
      const n = places.length;
      S.goal = n;
      for (let i = 0; i < n; i++) {
        const [cx, cy] = places[i];
        world.chests.push({ x: cx, y: cy, opened: false, reach: 1.3, rare: i === 0, scen: S, use() {
          if (this.opened) return;
          this.opened = true; S.got++; S.active = true;
          if (bad.has(i)) { camera.shake(5); sfx('roar', 0.7); foe(pick(roster), [cx, cy], 'champion', 1, { name: 'Mimic', awake: true }); floatText(cx, cy, 70, 'A mimic!', '#ff5050', 14); }
          else { sfx('chest'); dropChest(world, this, depth); }
          if (S.got >= n) S.finale = true;
        } });
      }
      S.tick = () => { if (S.finale && !foesAlive()) reward(x, y); };
      progress(() => `${S.got}/${n} chests opened`);
      break;
    }
    default: return null;
  }
  return S;
}
