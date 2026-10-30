// Herrington Hollow comes alive. A director owns the town's people (and animals) for one visit: residents who walk
// real paths, go in and out of their homes, shop at the vendors, gossip, work, nap and play; cats and dogs in the lanes
// and wild things on the outskirts (townanimals.js); visiting adventurers at a campfire; little set pieces built from
// town scatter; and, on about a third of visits, a special event (TOWN_EVENTS: a wedding, the royal progress, a
// funeral, a fair, a brawl, a sparring match, a monster scare, a birth, the Greeners' name day, a caravan, a wounded
// hero, the lost heir, a witch trial, a knighting, a wizard's show, a dog loose in the market, tax day, the Greeners'
// ghost prank, deer in the square).
//
// Scenes are generator functions that choreograph agents: they `yield` seconds to wait, or a function to wait on
// (with a timeout), and use the helpers below (go, say/line, feel, face). An agent in a scene is `busy`; free agents
// pick a new routine when their timer runs out.
//
// Speech is rationed so bubbles never swamp the screen: nothing is said for the first seconds of a visit, at most two
// ambient bubbles (three during an event) show near the hero at once, and ambient talk keeps a gap between lines.
// A line meant for the hero (heroHears) makes auto-play stand and read it; after its errands auto-play pays its
// respects to any royalty in town (and now and then a townsperson) through heroVisit.
import { G } from '../state.js';
import { dist, rand, randi, pick, chance, RNG, TAU } from '../core/util.js';
import { TW } from '../core/view.js';
import { A } from '../core/assets.js';
import { TOWNSFOLK } from '../data/townsfolk.js';
import { addTownAnimals, animalRoutine, animalGreet, castAnimal, animalBolt } from './townanimals.js';
import { CLASSES } from '../data/classes.js';
import { CHATS, BARKS, SHOPPING, ADVENTURER_CHATS, ADVENTURER_BARKS, EVENT_LINES, AUDIENCES } from '../data/townscripts.js';
import { townFacingFlip, EMOTIONS } from './townsfolkvisuals.js';
import { townObject } from '../world/town.js';
import { spawn } from '../gfx/vfx.js';
import { setupHomunculus } from './homunculus.js';

export const TOWN_EVENT_CHANCE = 0.35;
export const TOWN_EVENTS = Object.keys(EVENT_LINES);
const QUIET = 5.5;            // seconds of silence when the hero arrives
const NEAR = 12;              // tiles: speech this close to the hero counts against the bubble budget
const ADV_NAMES = ['Brannoc', 'Ysra', 'Corvin', 'Talia', 'Mord', 'Elsabet', 'Rurik', 'Senna', 'Hadrik', 'Vey', 'Odo', 'Isolt', 'Kestrel', 'Garm', 'Liesl', 'Thane'];
const CONFETTI = ['#ff5a5a', '#ffd23c', '#5ab4ff', '#7ae07a', '#ff9ad8', '#ffffff'];

const lineTime = (text) => Math.min(4.6, Math.max(2.3, 1.5 + text.length * 0.055));
const HEAR = 6;               // tiles: a line this close that is meant for the hero makes auto-play stop and read it

/** Someone is talking to the hero: auto-play stands still for the bubble (at least a second) so it can be read.
 *  Back-to-back bubbles from the same speaker keep the hero listening. */
export function heroHears(who, dur) {
  const p = G.player;
  if (!p || !who || dist(p.x, p.y, who.x, who.y) > HEAR) return;
  const l = G.heroListen;
  G.heroListen = { who, t: Math.max(1, dur + 0.6, l && l.who === who ? l.t : 0) };
}

export function startTownLife(world, t, c, visit) {
  const rng = new RNG(((c.townSeed || 1) * 31 + visit * 0x9e3779b9) >>> 0);
  const map = t.map;
  const k = TW / A.town.meta.tile[0];
  const d = {
    world, t, map, rng, time: 0, agents: [], scenes: [], vendors: world.npcs.filter((n) => n.vendor),
    nextAmbient: QUIET, event: null, eventKind: null, setPieces: [], fanVisits: 0,
  };
  world.townLife = d;
  // scene props are this visit's own (the cached town's props are shared between visits)
  world.props = world.props.slice();

  // ------------------------------------------------------------------ places
  const C = t.center;
  const named = (re) => t.props.filter((p) => p.kind === 'scatter' && p.spr && re.test(p.spr.name || ''));
  const doorOf = (b) => (b.sx ? [b.x0 + 3.6, b.y0 + 1.5] : [b.x0 + 1.5, b.y0 + 3.6]);
  const homes = t.buildings.filter((b) => !b.vendor);
  const near = (x, y, r) => { const p = map.randomNear(x, y, r, () => rng.next()); return p || [x, y]; };
  const free = (x, y) => map.walkable(x, y) && map.circleFree(x, y, 0.3);
  const roads = [];
  for (let y = 2; y < map.h - 2; y += 2) for (let x = 2; x < map.w - 2; x += 2) if (free(x + 0.5, y + 0.5) && dist(x, y, C.x, C.y) < 20) roads.push([x + 0.5, y + 0.5]);
  const spots = {
    well: [C.x, C.y], benches: named(/bench/), tables: named(/market_table/),
    work: named(/workbench|axe_stump|anvil|sawn_stump|grain_handmill|horse_trough|hay_bale|firewood|tool_rack|water_bucket/),
    trees: named(/^t_(orchard|young_apple|ancient|mature|crooked|twin|medium_willow)/),
  };
  d.spots = spots;
  const vendorFront = (v) => { const dx = C.x - v.x, dy = C.y - v.y, l = Math.hypot(dx, dy) || 1; return near(v.x + (dx / l) * 1.3, v.y + (dy / l) * 1.3, 0.6); };
  const randomSpot = () => {
    const r = rng.next();
    if (r < 0.25) return near(C.x + (rng.next() * 8 - 4), C.y + (rng.next() * 8 - 4), 1.5);
    if (r < 0.45 && d.vendors.length) return vendorFront(rng.pick(d.vendors));
    if (r < 0.6 && spots.benches.length) { const b = rng.pick(spots.benches); return near(b.x, b.y, 1.2); }
    if (r < 0.7 && homes.length) { const [x, y] = doorOf(rng.pick(homes)); return near(x, y, 1.5); }
    return rng.pick(roads) || [C.x, C.y + 2];
  };
  d.randomSpot = randomSpot;

  // ------------------------------------------------------------------ props for this visit
  const addProp = (name, x, y, opts = {}) => {
    if (typeof name !== 'string' || opts.kind) { const p = { x, y, ...opts }; world.props.push(p); return p; }
    const spr = townObject(name);
    if (!spr) return null;
    const p = { kind: 'scatter', x, y, spr, k, flip: opts.flip ?? rng.chance(0.5) };
    world.props.push(p);
    return p;
  };
  d.addProp = addProp;
  const clearing = (cx, cy, r, need = 2.2) => {
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(cx + (rng.next() * 2 * r - r)) + 0.5, y = Math.floor(cy + (rng.next() * 2 * r - r)) + 0.5;
      let ok = true;
      for (let yy = -1; yy <= 1 && ok; yy++) for (let xx = -1; xx <= 1 && ok; xx++) if (!free(x + xx * need / 2, y + yy * need / 2)) ok = false;
      if (ok && dist(x, y, t.portal.x, t.portal.y) > 3 && !d.setPieces.some((s) => dist(s.x, s.y, x, y) < 5)) return [x, y];
    }
    return null;
  };
  d.clearing = clearing;

  // ------------------------------------------------------------------ agents
  const makeAgent = (v, x, y, opts = {}) => {
    const a = {
      id: v.id, name: v.name, role: v.role, group: v.group, worker: v.worker, child: v.child, knight: v.knight, royal: v.royal || v.courtier,
      guard: v.guard, merchant: v.merchant, old: v.old, caster: v.caster, healer: v.healer,
      sprite: 'townsfolk', townsfolkSpriteId: v.spriteId, spriteId: v.spriteId, townsfolkId: v.id, frameCount: v.frame.count, pal: null,
      idleH: v.child ? 150 : undefined,
      x, y, reach: 1.6, flip: rng.chance(0.5), animT: rng.next() * 6, walkT: 0, idleSeed: rng.int(0, 9), walking: false, running: false,
      talkText: '', talkT: 0, talkAge: 0, emotion: null, emotionT: 0, emoteClock: 0, icon: null, iconT: 0, iconAge: 0,
      path: null, goal: null, speed: v.child ? 1.3 : 1.05, busy: null, nextT: 0.5 + rng.next() * 5.5, hidden: false, alpha: 1,
      home: homes.length ? rng.pick(homes) : null, barkT: 10 + rng.next() * 15, stuckT: 0,
      use() { d.greet(a, true); },
      update(dt) { d.tickAgent(a, dt); },
      ...opts,
    };
    d.agents.push(a);
    world.npcs.push(a);
    return a;
  };
  d.makeAgent = makeAgent;
  const makeAdventurer = (x, y) => {
    const [id, cls] = pick(Object.entries(CLASSES).filter(([k]) => k !== G.char?.classId));
    const v = { id: 'adv_' + d.agents.length, name: `${pick(ADV_NAMES)} the ${cls.name}`, role: 'adventurer', group: 'adventurer', spriteId: null, frame: { count: 0 } };
    return makeAgent(v, x, y, { adv: id, townsfolkSpriteId: null, spriteId: null, townsfolkId: null, speed: 1.25 });
  };
  d.makeAdventurer = makeAdventurer;

  // vendors can talk back (they keep their own art and shops)
  for (const v of d.vendors) {
    Object.assign(v, { talkText: '', talkT: 0, talkAge: 0, emotion: null, emotionT: 0, emoteClock: 0, icon: null, iconT: 0, iconAge: 0, animT: rand(0, 5), idleSeed: randi(0, 9) });
    v.update = (dt) => { v.animT += dt; v.talkT = Math.max(0, v.talkT - dt); v.talkAge += dt; v.emotionT = Math.max(0, v.emotionT - dt); v.emoteClock += dt; v.iconT = Math.max(0, v.iconT - dt); v.iconAge += dt; };
  }

  // ------------------------------------------------------------------ agent helpers
  d.go = (a, x, y, run = false) => {
    if (!free(x, y)) [x, y] = near(x, y, 1.5);
    a.path = map.findPath(a.x, a.y, x, y, 4000, 0.25) || [[x, y]];
    a.goal = [x, y]; a.running = run; a.stuckT = 0;
    return () => !a.goal;
  };
  d.face = (a, x, y) => { if (x && typeof x === 'object') { y = x.y; x = x.x; } a.flip = townFacingFlip(x - a.x, y - a.y, a.flip); };
  d.feel = (a, emo, dur = 3, icon = true) => {
    a.emotion = emo; a.emotionT = dur; a.emoteClock = 0;
    const ic = icon && EMOTIONS[emo]?.icon;
    if (ic) { a.icon = ic; a.iconT = Math.min(dur, 2.8); a.iconAge = 0; }
  };
  d.say = (a, text, emo, dur = lineTime(text)) => {
    a.talkText = text; a.talkT = dur; a.talkAge = 0;
    if (emo) d.feel(a, emo, dur + 0.6, false);
    a.iconT = 0;
    if (a.toHero) heroHears(a, dur);
    if (a.onSay) a.onSay(text, emo, dur);
    return dur;
  };
  const nearHero = (a) => { const p = G.player; return p && dist(p.x, p.y, a.x, a.y) < NEAR; };
  d.talkingNear = () => [...d.agents, ...d.vendors].filter((q) => q.talkT > 0.15 && !q.hidden && nearHero(q)).length;
  d.canSpeak = (a, priority = 0) => {
    if (d.time < QUIET) return false;
    if (!nearHero(a)) return true;            // off-screen talk is free
    const n = d.talkingNear();
    return priority ? n < 3 : n < 2 && d.time >= d.nextAmbient;
  };
  /** A line in a scene: waits for a speech slot (giving up after `patience` s: the line is acted out silently). */
  d.line = function* (a, text, emo, priority = 0, patience = 6) {
    let waited = 0;
    while (!d.canSpeak(a, priority) && waited < patience) { waited += 0.25; yield 0.25; }
    if (waited >= patience) { if (emo) d.feel(a, emo, 2.5); yield 1.2; return; }
    const dur = d.say(a, text, emo);
    if (!priority && nearHero(a)) d.nextAmbient = d.time + dur + rand(1.5, 4);
    yield dur + 0.35;
  };
  d.hide = (a) => { a.hidden = true; a.x = -99; a.y = -99; a.goal = a.path = null; };
  d.show = (a, x, y) => { a.hidden = false; a.x = x; a.y = y; a.alpha = 0; };
  d.greet = (a, clicked) => {
    if (a.hidden) return;
    if (a.animal) return animalGreet(d, a, clicked);
    const p = G.player;
    if (p) d.face(a, p.x, p.y);
    const list = a.adv ? ADVENTURER_BARKS : chance(0.6) && BARKS[a.group] ? BARKS[a.group] : BARKS.any, [text, emo] = pick(list);
    if (clicked || d.canSpeak(a)) { heroHears(a, d.say(a, text, emo)); if (!clicked) d.nextAmbient = d.time + 6; }
  };

  // ------------------------------------------------------------------ per-agent tick
  d.tickAgent = (a, dt) => {
    a.animT += dt; a.emoteClock += dt; a.talkAge += dt; a.iconAge += dt;
    a.talkT = Math.max(0, a.talkT - dt); a.emotionT = Math.max(0, a.emotionT - dt); a.iconT = Math.max(0, a.iconT - dt);
    a.townPoseT = Math.max(0, (a.townPoseT || 0) - dt); a.townAttackT = Math.max(0, (a.townAttackT || 0) - dt);
    if (a.alpha < 1) a.alpha = Math.min(1, a.alpha + dt * 2.5);
    a.walking = false;
    if (a.hidden) return;
    if (a.goal && a.path) {
      const [px, py] = a.path[0], dx = px - a.x, dy = py - a.y, l = Math.hypot(dx, dy);
      if (l < 0.12) { a.path.shift(); if (!a.path.length) { a.goal = a.path = null; a.running = false; } }
      else {
        const step = Math.min(l, (a.running ? a.runSpeed || a.speed * 2.2 : a.speed) * dt), nx = a.x + (dx / l) * step, ny = a.y + (dy / l) * step;
        if (map.walkable(nx, ny)) { a.flip = townFacingFlip(nx - a.x, ny - a.y, a.flip); a.x = nx; a.y = ny; a.walking = true; a.walkT += dt; a.stuckT = 0; }
        else if ((a.stuckT += dt) > 1.2) { a.goal = a.path = null; a.running = false; }
      }
    }
    if (!a.walking) a.walkT = 0;
    // passing remarks to the hero
    const p = G.player;
    if (p && !a.busy && !a.walking && (a.barkT -= dt) <= 0 && dist(p.x, p.y, a.x, a.y) < 2.6) {
      a.barkT = rand(35, 60);
      if (chance(0.55)) d.greet(a);
    }
    // wild things on the outskirts never let the hero walk up to them
    if (a.wild && p && !a.fleeing && dist(p.x, p.y, a.x, a.y) < (a.species === 'deer' ? 5 : 3)) animalBolt(d, a);
  };

  // ------------------------------------------------------------------ scenes
  d.run = (gen, agents = [], tag = '') => {
    const s = { it: gen, wait: 0, cond: null, condT: 0, agents, tag, done: false };
    for (const a of agents) { a.busy = s; }
    d.scenes.push(s);
    return s;
  };
  const release = (s) => { s.done = true; for (const a of s.agents) if (a.busy === s) { a.busy = null; a.nextT = rand(1, 5); } };
  d.release = release;
  const stepScene = (s, dt) => {
    if (s.wait > 0) { s.wait -= dt; return; }
    if (s.cond) { s.condT += dt; if (!s.cond() && s.condT < 25) return; s.cond = null; }
    for (let guard = 0; guard < 20; guard++) {
      const r = s.it.next();
      if (r.done) { release(s); return; }
      const v = r.value;
      if (typeof v === 'number') { if (v > 0) { s.wait = v; return; } continue; }
      if (typeof v === 'function') { if (v()) continue; s.cond = v; s.condT = 0; return; }
      return;
    }
  };

  // ------------------------------------------------------------------ the update
  d.update = (dt) => {
    d.time += dt;
    // the hero's own bubbles (chats at the forge) and the axe's
    for (const q of [G.player, d.axe]) if (q && q.talkT > 0) { q.talkT = Math.max(0, q.talkT - dt); q.talkAge = (q.talkAge || 0) + dt; }
    for (const s of d.scenes) if (!s.done) stepScene(s, dt);
    if (d.scenes.length > 40) d.scenes = d.scenes.filter((s) => !s.done);
    if (d.event && d.event.done && !d.eventOver) { d.eventOver = true; }
    for (const a of d.agents) {
      if (a.busy && (a.busy.done || a.busy === true && (!d.event || d.event.done))) { a.busy = null; a.eventRole = null; a.nextT = rand(1, 5); }
      if (a.busy) continue;
      if ((a.nextT -= dt) > 0) continue;
      a.nextT = 9999; // set again when its routine ends
      pickRoutine(d, a);
    }
  };

  // ------------------------------------------------------------------ cast for this visit
  const pool = TOWNSFOLK.filter((v) => !v.royal && !v.courtier);
  const ordinary = pool.filter((v) => !v.child && !v.knight && !v.guard);
  const take = (list, n) => { const out = []; const l = list.slice(); for (let i = 0; i < n && l.length; i++) out.push(l.splice(Math.floor(rng.next() * l.length), 1)[0]); return out; };
  const kids = take(pool.filter((v) => v.child), rng.int(1, 3));
  const adults = take(ordinary, rng.int(10, 14));
  const regulars = take(pool.filter((v) => v.regular), 1);
  const guards = take(pool.filter((v) => v.knight || v.guard && !v.regular), rng.int(1, 3));
  // now and then a courtier or the dowager queen takes the air in town
  const gentry = rng.chance(0.2) ? take(TOWNSFOLK.filter((v) => v.courtier || v.role === 'dowager queen'), 1) : [];
  const cast = [...new Map([...adults, ...kids, ...regulars, ...guards, ...gentry].map((v) => [v.id, v])).values()];
  for (const v of cast) {
    const [x, y] = randomSpot();
    const a = makeAgent(v, x, y);
    // a third start indoors and come out over the first half minute, so the square fills in instead of starting busy
    if (a.home && rng.chance(0.33)) { d.hide(a); a.nextT = rand(2, 30); a.indoors = true; }
  }
  d.cast = cast;
  if (G.player) G.player.talkT = 0;
  setupHomunculus(d);

  // ------------------------------------------------------------------ set pieces and the special event
  addTownAnimals(d, rng);
  setPieces(d, rng);
  const force = G.townEventForce;
  const kind = force !== undefined ? force : rng.chance(TOWN_EVENT_CHANCE) ? rng.pick(TOWN_EVENTS) : null;
  if (kind && EVENT_LINES[kind]) startEvent(d, kind, rng);
  return d;
}

// ====================================================================== everyday routines
function pickRoutine(d, a) {
  const { t } = d;
  if (a.hidden) { // come out of the house
    const b = a.home, [x, y] = b ? (b.sx ? [b.x0 + 3.5, b.y0 + 1.5] : [b.x0 + 1.5, b.y0 + 3.5]) : d.randomSpot();
    d.show(a, ...(d.map.walkable(x, y) ? [x, y] : d.map.randomNear(x, y, 1.5)));
    a.indoors = false;
    if (chance(0.3)) d.feel(a, pick(['happy', 'tired', 'think']), 2.5);
    a.nextT = rand(0.5, 2);
    return;
  }
  if (a.adv) return d.run(advRoutine(d, a), [a]);
  if (a.animal) return d.run(animalRoutine(d, a), [a]);
  const partner = d.agents.find((q) => q !== a && !q.busy && !q.hidden && !q.adv && !q.animal && dist(q.x, q.y, a.x, a.y) < 9 && (a.child === q.child));
  const r = Math.random();
  if (a.child) {
    const kids = d.agents.filter((q) => q.child && !q.busy && !q.hidden && q !== a);
    if (kids.length && r < 0.45) return d.run(tag(d, a, kids[0]), [a, kids[0]]);
    if (r < 0.6 && G.player && d.fanVisits < 2 && d.time > 20 && dist(G.player.x, G.player.y, a.x, a.y) < 14) { d.fanVisits++; return d.run(fan(d, a), [a]); }
    if (partner && r < 0.8) return d.run(chat(d, [a, partner], pickChat(a, partner)), [a, partner]);
    return d.run(wander(d, a), [a]);
  }
  if (a.caster && r < 0.3) return d.run(conjure(d, a), [a]);
  if (a.merchant && r < 0.3) return d.run(peddle(d, a), [a]);
  if (a.healer && r < 0.25 && d.spots.trees.length) return d.run(herbs(d, a), [a]);
  if (a.group === 'guard' || a.knight) {
    if (r < 0.6) return d.run(patrol(d, a), [a]);
    if (partner && r < 0.8) return d.run(chat(d, [a, partner], pickChat(a, partner)), [a, partner]);
    return d.run(wander(d, a), [a]);
  }
  if (r < 0.24 && d.vendors.length) return d.run(shop(d, a, pick(d.vendors)), [a]);
  if (r < 0.46 && partner) return d.run(chat(d, [a, partner], pickChat(a, partner)), [a, partner]);
  if (r < 0.58 && a.worker && d.spots.work.length) return d.run(work(d, a), [a]);
  if (r < 0.68 && a.home) return d.run(goHome(d, a), [a]);
  if (r < 0.73 && (a.group === 'old' || chance(0.3))) return d.run(nap(d, a), [a]);
  return d.run(wander(d, a), [a]);
}

function pickChat(a, b) {
  const tags = new Set(['any', a.group, b.group]);
  if (a.child && b.child) tags.add('kids');
  if (a.group === 'old' || b.group === 'old') tags.add('old');
  if ((a.group === 'guard' || a.knight) && (b.group === 'guard' || b.knight)) tags.add('guard');
  if (a.worker && b.worker) tags.add('worker');
  if (a.merchant || b.merchant) tags.add('merchant');
  if (a.knight || b.knight) tags.add('knight');
  if (a.royal || b.royal) tags.add('royal');
  if (!a.child && !b.child && chance(0.35)) tags.add('gossip');
  const list = CHATS.filter((c) => c.tags.some((tg) => tags.has(tg)) && (!(a.child && b.child) || c.tags.includes('kids')) && (!c.tags.includes('royal') || a.royal || b.royal) && !c.tags.includes('couple'));
  return pick(list.length ? list : CHATS);
}

function* chat(d, people, script, priority = 0) {
  const [a, b] = people;
  // meet: b walks over to a
  const ang = rand(0, TAU), [mx, my] = [a.x + Math.cos(ang) * 1.1, a.y + Math.sin(ang) * 1.1];
  yield d.go(b, mx, my);
  for (const q of people) for (const o of people) if (o !== q) d.face(q, o.x, o.y);
  yield 0.3;
  for (const [who, text, emo] of script.lines) {
    const sp = people[who] || people[0];
    for (const q of people) if (q !== sp) { d.face(q, sp.x, sp.y); if (chance(0.3)) d.feel(q, 'talk', 1.2, false); }
    yield* d.line(sp, text, emo, priority);
  }
  yield rand(0.6, 1.6);
}

function* wander(d, a) {
  const [x, y] = d.randomSpot();
  yield d.go(a, x, y);
  if (chance(0.35)) d.feel(a, pick(['think', 'happy', 'neutral', 'impatient', 'hungry', 'question']), rand(2.5, 4));
  yield rand(3, 9);
}

function* goHome(d, a) {
  const b = a.home, [x, y] = b.sx ? [b.x0 + 3.4, b.y0 + 1.5] : [b.x0 + 1.5, b.y0 + 3.4];
  yield d.go(a, x, y);
  d.face(a, b.cx, b.cy);
  yield 0.4;
  d.hide(a);
  a.indoors = true;
  yield rand(8, 26);
}

function* shop(d, a, v) {
  const [x, y] = (() => { const dx = d.t.center.x - v.x, dy = d.t.center.y - v.y, l = Math.hypot(dx, dy) || 1; return [v.x + (dx / l) * 1.25, v.y + (dy / l) * 1.25]; })();
  yield d.go(a, x, y);
  d.face(a, v.x, v.y);
  const lines = SHOPPING[v.vendor.id] || SHOPPING.weapons, [l1, l2, l3] = pick(lines);
  yield* d.line(a, l1[0], l1[1]);
  yield* d.line(v, l2[0], l2[1]);
  yield* d.line(a, l3[0], l3[1]);
  yield rand(1, 3);
}

function* work(d, a) {
  const s = pick(d.spots.work);
  yield d.go(a, s.x + rand(-0.9, 0.9), s.y + rand(0.6, 1));
  d.face(a, s.x, s.y);
  const dur = rand(10, 22);
  d.feel(a, 'work', dur, false);
  yield dur * 0.6;
  if (chance(0.5)) d.feel(a, pick(['tired', 'proud', 'work']), 3);
  yield dur * 0.4;
}

function* nap(d, a) {
  const spot = d.spots.benches.length && chance(0.6) ? pick(d.spots.benches) : d.spots.trees.length ? pick(d.spots.trees) : null;
  const [x, y] = spot ? [spot.x + rand(0.6, 1), spot.y + rand(0.6, 1)] : d.randomSpot();
  yield d.go(a, x, y);
  d.feel(a, 'tired', 2);
  yield 2;
  const dur = rand(14, 30);
  d.feel(a, 'sleep', dur);
  for (let s = 0; s < dur; s += 4) { yield 4; if (a.emotion === 'sleep') { a.icon = 'zzz'; a.iconT = 2.5; a.iconAge = 0; } }
  d.feel(a, 'surprised', 1.2);
  yield 1.4;
}

function* patrol(d, a) {
  const C = d.t.center, n = randi(3, 5), r = rand(5, 9), a0 = rand(0, TAU);
  for (let i = 0; i < n; i++) {
    const ang = a0 + (i / n) * TAU, [x, y] = d.map.randomNear(C.x + Math.cos(ang) * r, C.y + Math.sin(ang) * r, 2) || [C.x, C.y];
    yield d.go(a, x, y);
    if (chance(0.35)) d.feel(a, pick(['proud', 'point', 'think']), 2.5);
    yield rand(1.5, 4);
  }
}

function* tag(d, a, b) {
  let [it, runner] = [a, b];
  d.feel(it, 'mischief', 1.5);
  yield* d.line(it, pick(['Tag! You\'re it!', 'Catch me!', 'Can\'t catch me!']), 'laugh', 0, 2);
  for (let round = 0; round < randi(3, 6); round++) {
    const [fx, fy] = d.randomSpot();
    d.go(runner, fx, fy, true);
    yield 0.6;
    d.go(it, runner.x, runner.y, true);
    for (let k = 0; k < 20 && dist(it.x, it.y, runner.x, runner.y) > 0.9; k++) { yield 0.4; d.go(it, runner.x, runner.y, true); }
    d.feel(it, 'laugh', 1.5); d.feel(runner, 'surprised', 1.2);
    yield 0.8;
    [it, runner] = [runner, it];
  }
  d.feel(a, 'tired', 3); d.feel(b, 'laugh', 3);
  yield 3;
}

function* fan(d, a) {
  const p = G.player;
  yield d.go(a, p.x + rand(-1.2, 1.2), p.y + rand(0.8, 1.4), true);
  d.face(a, p.x, p.y);
  d.feel(a, 'celebrate', 2);
  const [text, emo] = pick(BARKS.kids);
  a.toHero = true;
  yield* d.line(a, text, emo, 1);
  a.toHero = false;
  yield 1.5;
}

/** Auto-play's hero walked up to `a` for a word: they turn, say a few bubbles to the hero, then go back to their day.
 *  Returns the scene (done when they have finished talking). */
export function heroVisit(d, a) {
  if (a.busy && a.busy !== d.event && a.busy !== true) d.release(a.busy);
  const list = AUDIENCES[a.role] || (a.royal ? AUDIENCES.royal : AUDIENCES[a.group] || AUDIENCES.any);
  return d.run((function* () {
    const p = G.player;
    a.goal = a.path = null;
    if (p) d.face(a, p.x, p.y);
    if (a.royal) d.feel(a, 'proud', 2);
    yield 0.5;
    a.toHero = true;
    for (const [text, emo] of pick(list)) { if (p) d.face(a, p.x, p.y); yield d.say(a, text, emo) + 0.35; }
    a.toHero = false;
    d.feel(a, a.royal ? 'gesture' : pick(['happy', 'wave', 'bow']), 2);
    yield 1;
  })(), [a], 'audience');
}

function* advRoutine(d, a) {
  const r = Math.random();
  if (a.camp && r < 0.55) {
    const c = a.camp, ang = a.seat ?? rand(0, TAU);
    yield d.go(a, c.x + Math.cos(ang) * 1.3, c.y + Math.sin(ang) * 1.3);
    d.face(a, c.x, c.y);
    const mate = d.agents.find((q) => q !== a && q.adv && q.camp === c && !q.busy && dist(q.x, q.y, c.x, c.y) < 2.5);
    if (mate && chance(0.6)) {
      const s = pick(ADVENTURER_CHATS);
      const scene = a.busy;
      mate.busy = scene; d.face(mate, a.x, a.y);
      for (const [who, text, emo] of s.lines) { const sp = who ? mate : a; yield* d.line(sp, text, emo); }
      if (mate.busy === scene) { mate.busy = null; mate.nextT = rand(2, 6); }
    } else d.feel(a, pick(['tired', 'think', 'proud', 'hungry']), 4);
    yield rand(6, 14);
  } else if (r < 0.85 && d.vendors.length) {
    yield* shop(d, a, pick(d.vendors));
  } else {
    yield* wander(d, a);
  }
}

// ====================================================================== everyday set pieces (scatter + people)
function setPieces(d, rng) {
  const { t } = d, C = t.center;
  const pieces = [];
  // adventurers camping out by the portal road
  if (rng.chance(0.6)) pieces.push(() => {
    const at = d.clearing((t.portal.x + C.x) / 2, (t.portal.y + C.y) / 2, 7) || d.clearing(C.x, C.y, 12);
    if (!at) return;
    const [x, y] = at, camp = { x, y, name: 'camp' };
    d.setPieces.push(camp);
    d.addProp(null, x, y, { kind: 'campfire', light: 4.2 });
    d.addProp(null, x + 1.3, y - 0.5, { kind: 'bedroll', color: '#5a3a2a', rot: 0.4 });
    d.addProp(null, x - 0.6, y + 1.3, { kind: 'bedroll', color: '#3a4a5a', rot: -0.6 });
    d.addProp(rng.chance(0.5) ? 'firewood_stack' : 'closed_barrel', x - 1.5, y - 1.2);
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + 0.4, a = d.makeAdventurer(x + Math.cos(ang) * 1.3, y + Math.sin(ang) * 1.3);
      a.camp = camp; a.seat = ang; d.face(a, x, y); a.nextT = rand(1, 6);
    }
  });
  // a hawker's stall on the square
  if (rng.chance(0.55)) pieces.push(() => {
    const at = d.clearing(C.x, C.y, 6, 1.6);
    if (!at) return;
    const [x, y] = at;
    d.setPieces.push({ x, y, name: 'stall' });
    d.addProp('market_table', x, y);
    d.addProp(rng.pick(['vegetable_basket', 'grain_sacks', 'cloth_crate', 'potion_jars']), x + 0.9, y - 0.3);
    d.addProp(rng.pick(['crate_stack', 'closed_barrel', 'water_bucket']), x - 0.8, y + 0.6);
    const free = TOWNSFOLK.filter((q) => q.merchant && !d.agents.some((a) => a.id === q.id));
    const v = free.length ? rng.pick(free) : TOWNSFOLK.find((q) => q.merchant);
    const m = d.makeAgent(v, x + 0.2, y + 1.1, { name: `${v.name} the ${v.role}`, fixed: true });
    d.run(hawker(d, m, x, y), [m]);
  });
  // a Greener juggling for coppers by the well
  if (rng.chance(0.3)) pieces.push(() => {
    const at = d.clearing(C.x, C.y, 6, 1.2);
    const v = rng.pick(TOWNSFOLK.filter((q) => q.familyId === 'greener' && !d.agents.some((a) => a.id === q.id)));
    if (!at || !v) return;
    d.setPieces.push({ x: at[0], y: at[1], name: 'juggler' });
    const m = d.makeAgent(v, at[0], at[1], { fixed: true });
    d.run(juggler(d, m), [m]);
  });
  // a busker with a hat out
  if (rng.chance(0.4)) pieces.push(() => {
    const at = d.clearing(C.x, C.y, 7, 1.2);
    if (!at) return;
    const [x, y] = at;
    d.setPieces.push({ x, y, name: 'busker' });
    d.addProp('water_bucket', x + 0.7, y + 0.4);
    const v = TOWNSFOLK.find((q) => /friar|bookseller/.test(q.role) && !d.agents.some((a) => a.id === q.id));
    if (!v) return;
    const m = d.makeAgent(v, x, y, { fixed: true });
    d.run(busker(d, m), [m]);
  });
  // a picnic on the grass
  if (rng.chance(0.35)) pieces.push(() => {
    const at = d.clearing(C.x, C.y, 14, 2);
    if (!at) return;
    const [x, y] = at;
    d.setPieces.push({ x, y, name: 'picnic' });
    d.addProp(null, x, y, { kind: 'bedroll', color: '#c8b070', rot: 0.2 });
    d.addProp('vegetable_basket', x + 0.5, y + 0.2);
    const pair = d.agents.filter((a) => !a.busy && !a.fixed && !a.hidden && !a.adv && !a.animal && !a.knight).slice(0, 2);
    if (pair.length === 2) d.run(picnic(d, pair, x, y), pair);
  });
  // laundry and gossip at the well
  if (rng.chance(0.5)) pieces.push(() => {
    const [x, y] = d.map.randomNear(C.x + 1.2, C.y + 1.2, 1.2) || [C.x + 1.2, C.y + 1.2];
    d.addProp('water_bucket', x + 0.4, y + 0.3);
    const pair = d.agents.filter((a) => !a.busy && !a.hidden && !a.child && !a.adv && !a.animal && !a.knight).slice(0, 2);
    if (pair.length === 2) d.run(washing(d, pair, x, y), pair);
  });
  for (const p of pieces) p();
}

function* hawker(d, m, x, y) {
  const calls = [...(WARES[m.role] || []), ...CALLS, ['Lucky charms! Unlucky ones half price!', 'mischief']];
  for (;;) {
    d.face(m, d.t.center.x, d.t.center.y);
    yield rand(6, 12);
    const [text, emo] = pick(calls);
    yield* d.line(m, text, emo, 0, 3);
    if (chance(0.3)) d.feel(m, 'greedy', 3);
  }
}

// stock cries per trade (the hawker's stall and the merchants' strolls)
const WARES = {
  'spice merchant': [['Pepper! Saffron! Dragon-root!', 'haggle'], ['Spice to wake the dead! Not literally.', 'mischief'], ['Smell this. Go on.', 'happy']],
  'fur trader': [['Warm furs for the deep cold!', 'haggle'], ['Wolf, bear, and something with six legs!', 'proud'], ['Feel that. Softer than a ghost.', 'excited']],
  'glass seller': [['Glass from the coast! Mind the edges!', 'haggle'], ['Look through it! The world, but greener!', 'excited'], ['You break it, you\'ve bought it.', 'suspicious']],
  bookseller: [['Books! Tales of the deep!', 'haggle'], ['A bestiary, slightly chewed!', 'mischief'], ['Read before you bleed!', 'proud']],
  potter: [['Pots! Jugs! Urns for the dearly departed!', 'haggle'], ['Fired twice, cracked never!', 'proud'], ['A pot for every portal!', 'happy']],
  'cloth merchant': [['Cloth from the south!', 'haggle'], ['Dyed in seven colours, three of them safe!', 'mischief'], ['Wool! Linen! Something shiny!', 'excited']],
  fishmonger: [['Fresh fish! Fresher than yesterday!', 'haggle'], ['Eels! Still wriggling!', 'excited'], ['Smells like the sea. Mostly.', 'happy']],
};
const CALLS = [['Fresh turnips! Hardly cursed!', 'haggle'], ['Two for a copper!', 'greedy'], ['Come and look, no charge for looking!', 'wave']];

function* peddle(d, a) {
  // a merchant strolls the square crying their wares
  for (let i = 0; i < 2; i++) {
    const [x, y] = d.randomSpot();
    yield d.go(a, x, y);
    const [text, emo] = pick(WARES[a.role] || CALLS);
    yield* d.line(a, text, emo, 0, 2);
    yield rand(2, 5);
  }
}

function* herbs(d, a) {
  // the hedge witch (or the midwife) picks herbs under a tree
  const tr = pick(d.spots.trees);
  yield d.go(a, tr.x + rand(-1, 1), tr.y + rand(0.8, 1.3));
  d.face(a, tr.x, tr.y);
  d.feel(a, 'curious', 4);
  yield 4;
  d.feel(a, 'work', 6, false);
  yield 6;
  if (chance(0.5)) yield* d.line(a, pick(['Nettle, dock and a pinch of luck.', 'Good for warts. And curses.', 'Mustn\'t pick the ones that pick back.']), 'think', 0, 2);
  yield 2;
}

function* conjure(d, a) {
  // the purple wizard practises: sparks, a flourish, mixed results
  const [x, y] = d.randomSpot();
  yield d.go(a, x, y);
  d.feel(a, 'fight', 2.4, false);
  for (let i = 0; i < 6; i++) { yield 0.4; spawn({ type: 'dot', x: a.x + rand(-0.4, 0.4), y: a.y + rand(-0.4, 0.4), z: rand(30, 60), vz: rand(10, 30), life: 1.2, size: 2, color: pick(['#c890ff', '#ffd23c', '#80e0ff']) }); }
  const ok = chance(0.6);
  d.feel(a, ok ? 'proud' : 'confused', 3);
  if (chance(0.6)) yield* d.line(a, ok ? pick(['Hah! Still got it.', 'Behold! ...Nobody beheld.', 'A minor miracle.']) : pick(['That was meant to be a dove.', 'Where did my eyebrows go?', 'Ahem. A practice spell.']), ok ? 'proud' : 'confused', 0, 2);
  yield 3;
}

function* juggler(d, m) {
  for (;;) {
    d.feel(m, 'excited', 9);
    for (let i = 0; i < 9; i++) { yield 1; spawn({ type: 'dot', x: m.x + Math.sin(i) * 0.3, y: m.y, z: rand(60, 75), vz: 22, g: 60, life: 0.9, size: 2.2, color: pick(['#ff5a5a', '#ffd23c', '#5ab4ff']) }); }
    const fans = d.agents.filter((q) => !q.busy && !q.hidden && !q.animal && !q.adv && q !== m && dist(q.x, q.y, m.x, m.y) < 6).slice(0, 2);
    for (const f of fans) d.run(listen(d, f, m), [f]);
    if (chance(0.5)) yield* d.line(m, pick(['Three apples, one goblin!', 'Coppers for the juggler!', 'Watch this! Watch! ...Oops.', 'Hey, hero! Catch!']), pick(['cheer', 'mischief', 'excited']), 0, 3);
    d.feel(m, 'proud', 3);
    yield 3;
  }
}

function* busker(d, m) {
  for (;;) {
    d.feel(m, 'music', 14);
    for (let i = 0; i < 7; i++) {
      yield 2;
      spawn({ type: 'dot', x: m.x + rand(-0.2, 0.2), y: m.y, z: 60, vx: rand(-0.3, 0.3), vz: 18, life: 1.6, size: 2, color: pick(['#ffd23c', '#fff2a0', '#c8a0ff']) });
    }
    const fans = d.agents.filter((q) => !q.busy && !q.hidden && !q.animal && q !== m && dist(q.x, q.y, m.x, m.y) < 6).slice(0, 2);
    for (const f of fans) d.run(listen(d, f, m), [f]);
    if (chance(0.5)) yield* d.line(m, pick(m.role === 'friar' ? ['A hymn for the brave!', 'Alms for the chapel!', 'This one\'s about a holy goat.', 'Sing along, sinners!'] : ['A tale for a copper!', 'Gather round: the Lich of Depth Nine!', 'This one\'s about a goat.', 'And then... the dragon SNEEZED!']), 'music', 0, 3);
    yield 3;
  }
}

function* listen(d, f, m) {
  const ang = rand(0, TAU);
  yield d.go(f, m.x + Math.cos(ang) * 1.6, m.y + Math.sin(ang) * 1.6);
  d.face(f, m.x, m.y);
  d.feel(f, pick(['dance', 'happy', 'music', 'laugh']), rand(6, 10));
  yield rand(6, 10);
  if (chance(0.5)) { d.feel(f, 'greedy', 1.5); yield 1.5; }
}

function* picnic(d, pair, x, y) {
  const [a, b] = pair;
  yield d.go(a, x - 0.6, y + 0.5);
  yield d.go(b, x + 0.6, y + 0.6);
  d.face(a, b.x, b.y); d.face(b, a.x, a.y);
  const s = pick(CHATS.filter((c) => c.tags.includes('couple')));
  for (const [who, text, emo] of s.lines) yield* d.line(pair[who], text, emo);
  d.feel(a, 'love', 6); d.feel(b, 'happy', 6);
  yield rand(10, 18);
  d.feel(a, 'hungry', 3);
  yield 4;
}

function* washing(d, pair, x, y) {
  const [a, b] = pair;
  yield d.go(a, x, y);
  yield d.go(b, x + 0.9, y + 0.5);
  d.face(a, b.x, b.y); d.face(b, a.x, a.y);
  d.feel(a, 'work', 6, false);
  yield 4;
  yield* chat(d, pair, pick(CHATS.filter((c) => c.tags.includes('gossip'))));
  d.feel(b, 'work', 8, false);
  yield 8;
}

// ====================================================================== special events
function startEvent(d, kind, rng) {
  d.eventKind = kind;
  const info = EVENT_LINES[kind];
  d.event = d.run(EVENTS[kind](d, info, rng), [], 'event:' + kind);
  d.event.t0 = d.time;
}

/** Add (or borrow from the visit) a named cast member for an event. */
function castMember(d, test, x, y) {
  let a = d.agents.find((q) => !q.adv && !q.animal && !q.fixed && TOWNSFOLK.find((v) => v.id === q.id && test(v)) && !q.eventRole);
  if (!a) {
    const v = TOWNSFOLK.find((q) => test(q) && !d.agents.some((a2) => a2.id === q.id));
    if (!v) return null;
    a = d.makeAgent(v, x, y);
  } else if (a.hidden) d.show(a, x, y);
  if (a.busy) d.release(a.busy);
  const far = dist(a.x, a.y, x, y);
  if (far > 3) d.go(a, x, y, far > 10);   // a borrowed resident heads over to their place
  a.busy = d.event || true;
  a.eventRole = 'cast';
  return a;
}
function crowd(d, n, exclude = []) {
  const out = d.agents.filter((a) => !a.adv && !a.animal && !a.fixed && !a.eventRole && !exclude.includes(a)).slice(0, n);
  for (const a of out) { if (a.busy && a.busy !== d.event) d.release(a.busy); if (a.hidden) d.show(a, ...d.randomSpot()); a.busy = d.event || true; a.eventRole = 'crowd'; }
  return out;
}
const own = (d, list) => { for (const a of list) if (a) { a.busy = d.event; a.eventRole = a.eventRole || 'cast'; } return list.filter(Boolean); };
const ring = (cx, cy, r, i, n, a0 = 0) => [cx + Math.cos(a0 + (i / n) * TAU) * r, cy + Math.sin(a0 + (i / n) * TAU) * r];
const confetti = (x, y, n = 18) => { for (let i = 0; i < n; i++) spawn({ type: 'dot', x: x + rand(-1.5, 1.5), y: y + rand(-1.5, 1.5), z: rand(40, 80), vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.6), vz: rand(10, 50), g: 60, life: rand(1.6, 2.6), size: rand(1.4, 2.4), color: pick(CONFETTI) }); };

function* gather(d, people, cx, cy, r, a0 = 0) {
  people.forEach((p, i) => d.go(p, ...ring(cx, cy, r + rand(-0.3, 0.4), i, people.length, a0)));
  const until = d.time + 8;
  yield () => d.time > until || people.every((p) => !p.goal);
  for (const p of people) d.face(p, cx, cy);
}
function* crowdReacts(d, people, lines, times = 3) {
  for (let i = 0; i < times; i++) {
    const p = pick(people);
    if (!p) return;
    const [text, emo] = pick(lines);
    yield* d.line(p, text, emo, 1, 2);
    for (const q of people) if (chance(0.5)) d.feel(q, emo, 3);
  }
}
function* endEvent(d, people, mood = 'happy') {
  for (const p of people) { if (chance(0.5)) d.feel(p, mood, 3); }
  yield 3;
  for (const p of people) { p.eventRole = null; if (p.busy === d.event || p.busy === true) { p.busy = null; p.nextT = rand(1, 8); } }
}
const announce = (d, info) => { G.ui?.log?.(`<b>${info.title}</b> in Herrington Hollow.`, '#ffd890'); };
const bunting = (d, x, y, x2, y2) => d.addProp(null, x, y, { kind: 'bunting', x2, y2 });

// lines may name the cast: {bride}, {dead}, {k1}... become that agent's first name (or full name for titled folk)
const short = (a) => (!a ? 'friend' : a.royal || a.knight || /^(Old|Brother|Mother|Watchman|Duke|Duchess|King|Queen|Prince|Princess)\b/.test(a.name) ? a.name.replace(/ (of|the) .*/, '') : a.name.split(' ')[0]);
const fx = (text, who = {}) => text.replace(/\{(\w+)\}/g, (_, k) => short(who[k]));
const say = function* (d, who, list, cast, priority = 1) { for (const [k, text, emo] of list) { const sp = cast[k]; if (sp) yield* d.line(sp, fx(text, cast), emo, priority); } };
const doorAt = (b) => (b.sx ? [b.x0 + 3.5, b.y0 + 1.5] : [b.x0 + 1.5, b.y0 + 3.5]);
const sparks = (x, y, n = 10, colors = ['#c890ff', '#ffd23c', '#80e0ff', '#ffffff']) => { for (let i = 0; i < n; i++) spawn({ type: 'dot', x: x + rand(-0.5, 0.5), y: y + rand(-0.5, 0.5), z: rand(40, 70), vx: rand(-0.8, 0.8), vy: rand(-0.8, 0.8), vz: rand(20, 50), g: 50, life: rand(0.8, 1.6), size: rand(1.4, 2.4), color: pick(colors) }); };
const adults = (d, n, excl = []) => own(d, d.agents.filter((a) => !a.fixed && !a.child && !a.adv && !a.animal && !a.knight && !a.royal && !a.guard && !a.eventRole && !excl.includes(a)).slice(0, n));

const EVENTS = {
  *wedding(d, info) {
    const C = d.t.center;
    bunting(d, C.x - 3, C.y - 2.5, C.x + 2.5, C.y - 3);
    bunting(d, C.x - 2.5, C.y + 3, C.x + 3, C.y + 2.5);
    for (let i = 0; i < 4; i++) d.addProp(null, ...ring(C.x, C.y, 1.6, i, 4, 0.4), { kind: 'candle', light: 1.6 });
    const priest = castMember(d, (v) => v.role === 'priest', C.x + 0.2, C.y + 1.4) || castMember(d, (v) => v.role === 'friar', C.x + 0.2, C.y + 1.4);
    const pair = adults(d, 2, [priest]);
    if (pair.length < 2 || !priest) return;
    const [groom, bride] = pair;
    groom.eventRole = 'groom'; bride.eventRole = 'bride';
    const folk = crowd(d, 9, [priest, groom, bride]);
    const dog = d.agents.find((a) => a.species === 'dog' && !a.eventRole);
    for (const a of [priest, groom, bride, ...folk]) if (a.hidden) d.show(a, ...d.randomSpot());
    yield () => d.time > QUIET + 1;
    announce(d, info);
    d.go(priest, C.x + 0.3, C.y + 1.5);
    d.go(groom, C.x - 0.7, C.y + 2.6); d.go(bride, C.x + 1.2, C.y + 2.6);
    yield* gather(d, folk, C.x + 0.3, C.y + 2.6, 3.4, 0.2);
    yield () => !priest.goal && !groom.goal && !bride.goal;
    d.face(groom, bride); d.face(bride, groom); d.face(priest, groom);
    const cast = { priest, groom, bride };
    yield* d.line(priest, fx(info.intro, cast), 'gesture', 1);
    yield* say(d, null, info.vows, cast);
    confetti(C.x + 0.3, C.y + 2.6, 30);
    for (const p of [groom, bride, ...folk]) d.feel(p, chance(0.6) ? 'cheer' : 'celebrate', 6);
    if (dog) { dog.busy = d.event; dog.eventRole = 'crowd'; d.go(dog, C.x + 0.3 + rand(-1, 1), C.y + 3.4, true); d.feel(dog, 'excited', 8); }
    yield* crowdReacts(d, folk, info.crowd, 3);
    d.feel(groom, 'dance', 14); d.feel(bride, 'dance', 14);
    for (const p of folk) if (chance(0.5)) d.feel(p, 'dance', 12);
    for (let i = 0; i < 4; i++) { yield 3; confetti(C.x + 0.3, C.y + 2.6, 8); }
    yield* crowdReacts(d, folk, info.crowd, 2);
    yield* endEvent(d, [priest, groom, bride, ...folk, dog].filter(Boolean), 'love');
    d.run((function* () { const [x, y] = d.randomSpot(); d.go(groom, x, y); yield 0.6; d.go(bride, x + 0.6, y + 0.4); yield () => !bride.goal; d.feel(groom, 'love', 6); d.feel(bride, 'love', 6); yield 8; })(), [groom, bride]);
  },

  *royal(d, info) {
    const C = d.t.center, P = d.t.portal;
    const ang = Math.atan2(P.y - C.y, P.x - C.x), sx = C.x + Math.cos(ang) * 9, sy = C.y + Math.sin(ang) * 9;
    const roles = { herald: 'duke', king: 'king', queen: 'queen', prince: 'prince', princess: 'princess', dowager: 'dowager queen', lady: 'duchess', heir: 'royal heir' };
    const r = {};
    for (const [key, role] of Object.entries(roles)) { r[key] = castMember(d, (v) => v.role === role, sx, sy); if (r[key]) r[key].eventRole = key; }
    const knights = own(d, [castMember(d, (v) => v.knight, sx, sy), castMember(d, (v) => v.knight, sx, sy), castMember(d, (v) => v.knight, sx, sy)]);
    const train = [knights[0], r.herald, r.king, r.queen, r.heir, r.prince, r.princess, r.dowager, r.lady, knights[1], knights[2]].filter(Boolean);
    const at = train.map((a, i) => d.map.randomNear(sx + Math.cos(ang) * i * 0.9, sy + Math.sin(ang) * i * 0.9, 0.8) || [sx, sy]);
    for (const a of train) d.hide(a);
    const folk = crowd(d, 10, train);
    yield* gather(d, folk, C.x, C.y, 4.2);
    for (const p of folk) d.feel(p, 'impatient', 4);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    const herald = r.herald || train[0];
    train.forEach((a, i) => d.show(a, ...at[i]));
    for (let i = 0; i < train.length; i++) { const a = train[i], [x, y] = ring(C.x, C.y, 1.8, i, train.length, ang - 1.2); d.go(a, x, y); if (a.royal) d.feel(a, 'proud', 8); }
    yield* d.line(herald, info.intro, 'alarm', 1);
    for (const p of folk) d.feel(p, chance(0.5) ? 'cheer' : 'bow', 5);
    yield () => train.every((a) => !a.goal);
    for (const a of train) d.face(a, C.x, C.y + 4);
    for (const [who, text, emo] of info.beats) {
      const sp = r[who] || r.king;
      if (sp) yield* d.line(sp, text, emo, 1);
      if (who === 'king' && emo === 'cheer') for (const p of folk) d.feel(p, 'cheer', 4);
      if (who === 'heir' && r.heir) { d.feel(r.heir, 'excited', 4); if (G.player) d.go(r.heir, G.player.x + 0.8, G.player.y + 0.6, true); }
    }
    yield* crowdReacts(d, folk, info.crowd, 3);
    yield* endEvent(d, folk, 'happy');
    for (const a of train) { a.eventRole = null; a.busy = null; a.nextT = rand(2, 10); }
  },

  *funeral(d, info) {
    const C = d.t.center, bx = C.x + 1.5, by = C.y + 2.2;
    for (let i = 0; i < 6; i++) d.addProp(null, ...ring(bx, by, 1.1, i, 6), { kind: 'candle', light: 1.4 });
    const dead = castMember(d, (v) => ['tailor', 'ferryman', 'retired veteran', 'candlemaker'].includes(v.role), bx, by);
    if (dead) { dead.x = bx; dead.y = by; dead.eventRole = 'dead'; d.feel(dead, 'dead', 9999, false); dead.name = dead.name + ' (at rest)'; }
    const priest = castMember(d, (v) => v.role === 'priest', C.x, C.y);
    const friar = castMember(d, (v) => v.role === 'friar', C.x, C.y);
    const mourner = adults(d, 1, [dead, priest, friar])[0];
    const folk = crowd(d, 8, [dead, priest, friar, mourner]);
    yield* gather(d, folk, bx, by, 2.8);
    for (const p of folk) d.feel(p, chance(0.5) ? 'grief' : 'pray', 12);
    if (priest) d.go(priest, bx - 1.4, by - 0.6);
    if (friar) d.go(friar, bx - 1.2, by + 1);
    if (mourner) d.go(mourner, bx + 1.2, by + 0.8);
    yield () => d.time > QUIET + 2;
    announce(d, info);
    const cast = { priest: priest || friar, friar: friar || priest, mourner, dead };
    if (cast.priest) yield* d.line(cast.priest, fx(info.intro, cast), 'pray', 1);
    yield* say(d, null, info.beats, cast);
    yield* crowdReacts(d, folk, info.crowd, 2);
    for (const p of [...folk, mourner].filter(Boolean)) d.feel(p, 'cry', 6);
    yield 8;
    yield* endEvent(d, [...folk, priest, friar, mourner].filter(Boolean), 'sad');
  },

  *fair(d, info) {
    const C = d.t.center;
    bunting(d, C.x - 4, C.y - 1, C.x - 1, C.y - 4);
    bunting(d, C.x + 1, C.y + 4, C.x + 4, C.y + 1);
    const stalls = [];
    for (let i = 0; i < 4; i++) {
      const at = d.clearing(C.x, C.y, 7, 1.5);
      if (!at) continue;
      d.setPieces.push({ x: at[0], y: at[1] });
      d.addProp('market_table', at[0], at[1]);
      d.addProp(pick(['vegetable_basket', 'grain_sacks', 'cloth_crate', 'potion_jars', 'hay_bale']), at[0] + 0.8, at[1] - 0.4);
      d.addProp(pick(['crate_stack', 'closed_barrel', 'water_barrel']), at[0] - 0.7, at[1] + 0.5);
      stalls.push(at);
    }
    const crier = castMember(d, (v) => v.role === 'porter', C.x, C.y + 1);
    const musician = castMember(d, (v) => v.role === 'friar', C.x + 1, C.y + 2);
    const juggler = castMember(d, (v) => v.familyId === 'greener', C.x - 1, C.y + 2);
    const sellers = stalls.map(([x, y]) => castMember(d, (v) => v.merchant || v.role === 'baker', x, y + 1)).filter(Boolean);
    sellers.forEach((s, i) => { s.x = stalls[i][0] + 0.2; s.y = stalls[i][1] + 1; });
    const folk = crowd(d, 9, [crier, musician, juggler, ...sellers]);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    if (crier) yield* d.line(crier, info.intro, 'celebrate', 1);
    if (musician) d.feel(musician, 'music', 60);
    if (juggler) d.feel(juggler, 'excited', 60);
    for (const p of folk) d.run(fairgoer(d, p, stalls, musician || juggler), [p]);
    for (let i = 0; i < 8; i++) {
      yield rand(5, 9);
      const s = pick(sellers);
      if (s) { const [text, emo] = pick(WARES[s.role] || info.calls); yield* d.line(s, text, emo, 1, 3); }
      if (juggler && chance(0.4)) { sparks(juggler.x, juggler.y, 4, ['#ff5a5a', '#ffd23c', '#5ab4ff']); if (chance(0.5)) yield* d.line(juggler, pick(info.juggler), 'cheer', 1, 2); }
      if (musician && chance(0.5)) spawn({ type: 'dot', x: musician.x, y: musician.y, z: 60, vz: 18, life: 1.6, size: 2, color: '#ffd23c' });
    }
    yield* endEvent(d, [crier, musician, juggler, ...sellers].filter(Boolean));
  },

  *brawl(d, info) {
    const C = d.t.center, x = C.x + 2, y = C.y + 2.5;
    const a = castMember(d, (v) => v.role === 'fur trader', x - 3, y) || adults(d, 1)[0];
    const b = castMember(d, (v) => v.role === 'cloth merchant', x + 3, y) || adults(d, 1, [a])[0];
    if (!a || !b) return;
    const guard = castMember(d, (v) => v.guard && !v.regular, C.x - 6, C.y - 4) || castMember(d, (v) => v.knight, C.x - 6, C.y - 4);
    const folk = crowd(d, 7, [a, b, guard]);
    d.go(a, x - 0.6, y); d.go(b, x + 0.6, y);
    yield* gather(d, folk, x, y, 2.8);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    d.face(a, b); d.face(b, a);
    const cast = { a, b, guard };
    for (const [who, text, emo] of info.beats) {
      const sp = cast[who];
      if (who === 'guard' && guard) { yield d.go(guard, x, y + 0.9, true); d.face(guard, a); }
      if (sp) yield* d.line(sp, fx(text, cast), emo, 1);
      if (who === 'a' && emo === 'angry') {
        d.feel(a, 'fight', 5); d.feel(b, 'fight', 5);
        for (const p of folk) d.feel(p, chance(0.5) ? 'cheer' : 'scared', 5);
        yield* crowdReacts(d, folk, info.crowd, 2);
      }
    }
    d.feel(a, 'embarrassed', 3); d.feel(b, 'relieved', 3);
    yield* endEvent(d, [...folk, a, b, guard].filter(Boolean), 'laugh');
  },

  *tourney(d, info) {
    const C = d.t.center, x = C.x + 0.5, y = C.y + 3;
    const k1 = castMember(d, (v) => v.knight, x - 4, y), k2 = castMember(d, (v) => v.knight, x + 4, y);
    if (!k1 || !k2) return;
    const judge = castMember(d, (v) => v.role === 'duke', x, y - 3) || castMember(d, (v) => v.role === 'retired veteran', x, y - 3);
    const folk = crowd(d, 10, [k1, k2, judge]);
    d.go(k1, x - 0.8, y); d.go(k2, x + 0.8, y);
    if (judge) d.go(judge, x, y - 1.6);
    yield* gather(d, folk, x, y, 3);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    d.face(k1, k2); d.face(k2, k1); if (judge) d.face(judge, x, y);
    const cast = { k1, k2, judge };
    if (judge) yield* d.line(judge, fx(info.intro, cast), 'proud', 1);
    for (const [who, text, emo] of info.beats) {
      const sp = cast[who] || k1;
      yield* d.line(sp, fx(text, cast), emo, 1);
      if (emo === 'proud' || emo === 'angry') {
        d.feel(k1, 'spar', 5); d.feel(k2, 'spar', 5);
        k1.townAttackT = 0; k2.townAttackT = 0;
        for (const p of folk) d.feel(p, chance(0.6) ? 'cheer' : 'surprised', 4);
        yield* crowdReacts(d, folk, info.crowd.map(([t, e]) => [fx(t, cast), e]), 1);
        yield 3;
      }
    }
    confetti(x, y, 12);
    yield* endEvent(d, [...folk, k1, k2, judge].filter(Boolean), 'cheer');
  },

  *alarm(d, info) {
    const C = d.t.center, P = d.t.portal, ang = Math.atan2(C.y - P.y, C.x - P.x), ex = C.x + Math.cos(ang) * 12, ey = C.y + Math.sin(ang) * 12;
    const watch = castMember(d, (v) => v.guard, ex, ey);
    const knight = castMember(d, (v) => v.knight, C.x - 2, C.y);
    const folk = crowd(d, 12, [watch, knight]);
    yield () => d.time > QUIET + 2;
    announce(d, info);
    if (watch) { const [x, y] = d.map.randomNear(ex, ey, 2) || [ex, ey]; watch.x = x; watch.y = y; d.go(watch, C.x + 1, C.y + 1, true); d.feel(watch, 'alarm', 6); }
    yield 1.2;
    if (watch) yield* d.line(watch, info.intro, 'alarm', 1);
    for (const p of folk) {
      d.feel(p, chance(0.5) ? 'panic' : 'scared', 6);
      d.run((function* () { if (p.home) { yield* goHome(d, p); yield rand(10, 20); } else { const [x, y] = d.randomSpot(); yield d.go(p, x, y, true); yield 8; } })(), [p]);
    }
    for (const a of d.agents) if (a.animal && !a.wild && !a.busy) { d.feel(a, a.species === 'dog' ? 'angry' : 'scared', 5); if (a.species === 'dog' && d.canSpeak(a, 1)) d.say(a, 'WOOF! WOOF!', null, 1.6); }
    yield* crowdReacts(d, folk, info.crowd, 1);
    if (knight) { yield d.go(knight, ex - Math.cos(ang) * 2, ey - Math.sin(ang) * 2, true); d.face(knight, ex, ey); d.feel(knight, 'fight', 6); }
    // the beast: a startled stag crashing out of the trees
    const deer = castAnimal(d, 'deer', ex, ey, 'deer_buck_01');
    if (deer) { deer.busy = d.event; deer.eventRole = 'cast'; d.show(deer, ...(d.map.randomNear(ex, ey, 1.5) || [ex, ey])); d.feel(deer, 'scared', 3); yield 1.5; }
    const cast = { watch, knight };
    for (const [who, text, emo] of info.beats.slice(1)) { const sp = cast[who]; if (sp) yield* d.line(sp, text, emo, 1); yield 1.2; }
    if (deer) { const [x, y] = d.edgeSpot(); d.go(deer, x, y, true); d.feel(deer, 'scared', 3); }
    if (knight) d.feel(knight, 'embarrassed', 4);
    yield 4;
    if (watch) d.feel(watch, 'relieved', 4);
    yield* endEvent(d, [watch, knight, deer].filter(Boolean), 'proud');
  },

  *birth(d, info) {
    const C = d.t.center;
    const midwife = castMember(d, (v) => v.role === 'midwife', C.x, C.y);
    const parent = adults(d, 1, [midwife])[0];
    if (!midwife || !parent) return;
    const house = midwife.home || parent.home;
    if (house) { d.hide(midwife); d.hide(parent); }
    const folk = crowd(d, 8, [midwife, parent]);
    yield () => d.time > QUIET + 2;
    const [hx, hy] = house ? doorAt(house) : [C.x, C.y + 2];
    d.show(midwife, hx, hy);
    announce(d, info);
    d.feel(midwife, 'celebrate', 4);
    yield* d.line(midwife, info.intro, 'celebrate', 1);
    yield* gather(d, folk, hx + 0.5, hy + 0.5, 3);
    d.show(parent, hx, hy);
    yield* say(d, null, info.beats, { midwife, parent });
    confetti(hx, hy, 16);
    for (const p of folk) d.feel(p, pick(['celebrate', 'happy', 'cheer', 'love']), 6);
    yield* crowdReacts(d, folk, info.crowd, 3);
    yield* endEvent(d, [...folk, midwife, parent], 'happy');
  },

  // the Greener triplets' name day: three goblins, one cake
  *party(d, info) {
    const C = d.t.center, x = C.x - 1.5, y = C.y + 2.5;
    bunting(d, x - 2, y - 1.5, x + 2, y - 2);
    d.addProp(null, x, y + 0.3, { kind: 'bedroll', color: '#d8c890', rot: 0 });
    d.addProp('vegetable_basket', x + 0.4, y + 0.3);
    const kids = [0, 1, 2].map(() => castMember(d, (v) => v.familyId === 'greener', ...d.randomSpot())).filter(Boolean);
    if (!kids.length) return;
    own(d, kids);
    const host = castMember(d, (v) => v.role === 'hedge witch', x + 0.8, y + 1.2) || adults(d, 1)[0];
    const folk = crowd(d, 5, [...kids, host]);
    yield* gather(d, [...kids, ...folk], x, y, 2.2);
    if (host) d.go(host, x + 0.8, y + 1.2);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    yield* d.line(kids[0], info.intro, 'celebrate', 1);
    const cast = { child: kids[0], child2: kids[1] || kids[0], child3: kids[2] || kids[0], host };
    yield* say(d, null, info.beats, cast);
    confetti(x, y, 20);
    for (const k of kids) d.feel(k, 'dance', 10);
    yield* crowdReacts(d, folk, info.crowd, 2);
    yield 6;
    if (kids.length > 1) d.run(tag(d, kids[0], kids[1]), [kids[0], kids[1]]);
    yield* endEvent(d, [...folk, host, ...kids.slice(2)].filter(Boolean), 'happy');
  },

  *caravan(d, info) {
    const C = d.t.center, P = d.t.portal;
    const at = d.clearing((C.x * 2 + P.x) / 3, (C.y * 2 + P.y) / 3, 5, 2) || d.clearing(C.x, C.y, 8, 2);
    if (!at) return;
    const [x, y] = at;
    d.setPieces.push({ x, y });
    d.addProp('handcart', x, y);
    d.addProp('cloth_crate', x + 1, y - 0.3);
    d.addProp('crate_stack', x - 0.9, y + 0.5);
    d.addProp('grain_sacks', x + 0.4, y + 1);
    d.addProp(null, x + 1.4, y + 1.3, { kind: 'bunting', x2: x - 1.4, y2: y + 1.6 });
    const traders = own(d, [0, 1, 2].map((i) => castMember(d, (v) => v.merchant, x + i * 0.8 - 0.8, y + 1.2)).filter(Boolean));
    const trader = traders[0];
    const buyer = adults(d, 1, traders)[0];
    const folk = crowd(d, 7, [...traders, buyer]);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    if (!trader) return;
    traders.forEach((t, i) => d.go(t, x + i * 0.9 - 0.6, y + 1.4));
    yield* d.line(trader, info.intro, 'excited', 1);
    yield* gather(d, [...folk, buyer].filter(Boolean), x + 0.3, y + 1.4, 2.6);
    for (const t of traders.slice(1)) { const [text, emo] = pick(WARES[t.role] || info.calls); yield* d.line(t, text, emo, 1); }
    yield* say(d, null, info.beats, { trader, buyer });
    for (const p of folk) d.feel(p, pick(['surprised', 'greedy', 'happy', 'curious']), 5);
    yield* crowdReacts(d, folk, info.crowd, 3);
    yield* endEvent(d, [...folk, buyer].filter(Boolean), 'greedy');
    for (const t of traders) d.run(hawker(d, t, x, y), [t]);
  },

  *wounded(d, info) {
    const P = d.t.portal, C = d.t.center;
    const [x, y] = d.map.randomNear(P.x + (C.x - P.x) * 0.15, P.y + (C.y - P.y) * 0.15, 1.5) || [P.x + 1.5, P.y];
    const hurt = d.makeAdventurer(x, y);
    hurt.busy = d.event; hurt.eventRole = 'hurt'; hurt.lying = true;
    d.feel(hurt, 'hurt', 9999, true);
    const healer = castMember(d, (v) => v.role === 'hedge witch', C.x, C.y) || castMember(d, (v) => v.healer, C.x, C.y);
    const folk = crowd(d, 7, [hurt, healer]);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    const shout = folk[0] || healer;
    if (shout) yield* d.line(shout, info.intro, 'alarm', 1);
    if (healer) { yield d.go(healer, x + 0.9, y + 0.5, true); d.face(healer, hurt); }
    yield* gather(d, folk, x, y, 2.6);
    yield* say(d, null, info.beats, { hurt, healer });
    if (healer) sparks(x, y, 14, ['#80ff90', '#c8ffb0', '#ffffff']);
    yield* crowdReacts(d, folk, info.crowd, 2);
    hurt.lying = false;
    d.feel(hurt, 'relieved', 6);
    for (const p of folk) d.feel(p, 'happy', 3);
    yield 3;
    hurt.busy = null; hurt.eventRole = null; hurt.nextT = 4;
    yield* endEvent(d, [...folk, healer].filter(Boolean), 'happy');
  },

  // the royal heir slipped the nursemaids; the Queen and a knight turn the Hollow upside down
  *lost_child(d, info) {
    const C = d.t.center;
    const parent = castMember(d, (v) => v.role === 'queen', C.x, C.y) || adults(d, 1)[0];
    const watch = castMember(d, (v) => v.knight, C.x, C.y) || castMember(d, (v) => v.guard, C.x, C.y);
    const [hx, hy] = d.clearing(C.x, C.y, 14, 1) || d.randomSpot();
    const child = castMember(d, (v) => v.role === 'royal heir', hx, hy);
    if (!parent || !child) return;
    child.x = hx; child.y = hy; child.goal = child.path = null;
    const cat = castAnimal(d, 'cat', hx + 0.8, hy + 0.3);
    if (cat) { cat.busy = d.event; cat.eventRole = 'cast'; cat.x = hx + 0.8; cat.y = hy + 0.3; cat.goal = null; d.feel(cat, 'love', 60); d.face(child, cat); }
    d.feel(child, 'love', 60);
    const folk = crowd(d, 6, [parent, watch, child]);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    const cast = { parent, watch, child };
    yield* d.line(parent, fx(info.intro, cast), 'panic', 1);
    for (const p of folk) { d.feel(p, 'question', 5); d.run((function* () { for (let i = 0; i < 2; i++) { const [x, y] = d.randomSpot(); yield d.go(p, x, y); d.feel(p, 'look', 2); yield 2; } })(), [p]); }
    if (watch) yield* d.line(watch, fx(info.beats[1][1], cast), 'point', 1);
    yield d.go(parent, hx + 1, hy + 0.5, true);
    yield* d.line(parent, fx(info.beats[0][1], cast), 'worried', 1);
    d.face(child, parent);
    yield* d.line(child, fx(info.beats[2][1], cast), 'excited', 1);
    d.face(parent, child);
    yield* d.line(parent, fx(info.beats[3][1], cast), 'relieved', 1);
    d.feel(parent, 'love', 4); d.feel(child, 'love', 4);
    yield 4;
    yield* d.line(parent, fx(info.beats[4][1], cast), 'angry', 1);
    d.feel(child, 'sad', 4);
    yield* endEvent(d, [parent, watch, child, cat].filter(Boolean), 'happy');
  },

  // ---------------------------------------------------------------- new with the People and Animals pack
  // the village accuses Nan Bramble the hedge witch of souring the milk; the culprits turn out to be green and giggling
  *witch_trial(d, info) {
    const C = d.t.center, x = C.x + 1, y = C.y + 2;
    const witch = castMember(d, (v) => v.role === 'hedge witch', x, y);
    const acc = castMember(d, (v) => v.role === 'baker', x - 2, y) || adults(d, 1, [witch])[0];
    const acc2 = castMember(d, (v) => v.role === 'shepherd', x - 2, y + 1) || adults(d, 1, [witch, acc])[0];
    const priest = castMember(d, (v) => v.role === 'priest', x + 2, y - 1) || castMember(d, (v) => v.role === 'friar', x + 2, y - 1);
    const imp = castMember(d, (v) => v.spriteId === '00_greener_spooky_goofy_a', x + 6, y + 4) || castMember(d, (v) => v.familyId === 'greener', x + 6, y + 4);
    if (!witch || !acc) return;
    const folk = crowd(d, 8, [witch, acc, acc2, priest, imp]);
    if (imp) d.hide(imp);
    d.go(witch, x, y); d.go(acc, x - 1.3, y + 0.3); if (acc2) d.go(acc2, x - 1.2, y + 1.3);
    yield* gather(d, folk, x, y, 3);
    yield () => d.time > QUIET + 1 && !witch.goal;
    announce(d, info);
    d.face(acc, witch); d.face(witch, acc);
    const cast = { witch, acc, acc2: acc2 || acc, priest, imp };
    for (const [who, text, emo] of info.beats) {
      if (who === 'imp') {
        if (!imp) continue;
        const [ix, iy] = d.map.randomNear(x + 3, y + 3, 1.5) || [x + 3, y + 3];
        d.show(imp, ix, iy); d.face(imp, witch);
        for (const p of [witch, acc, acc2, priest, ...folk]) if (p) d.face(p, imp);
      }
      if (who === 'priest' && priest) { yield d.go(priest, x + 1.1, y - 0.6); d.face(priest, acc); }
      const sp = cast[who];
      if (sp) yield* d.line(sp, fx(text, cast), emo, 1);
      if (emo === 'angry' && who.startsWith('acc')) for (const p of folk) d.feel(p, chance(0.6) ? 'suspicious' : 'angry', 4);
    }
    for (const p of folk) d.feel(p, pick(['laugh', 'relieved', 'embarrassed']), 4);
    yield* crowdReacts(d, folk, info.crowd, 2);
    if (imp) { d.feel(imp, 'embarrassed', 4); yield 2; const [rx, ry] = d.randomSpot(); d.go(imp, rx, ry, true); }
    yield* endEvent(d, [witch, acc, acc2, priest, imp, ...folk].filter(Boolean), 'happy');
  },

  // the King knights a road guard at the well
  *knighting(d, info) {
    const C = d.t.center, x = C.x, y = C.y + 2.4;
    const king = castMember(d, (v) => v.role === 'king', x, y - 1);
    const squire = castMember(d, (v) => v.guard && !v.regular, x, y + 1);
    if (!king || !squire) return;
    const herald = castMember(d, (v) => v.role === 'duke', x - 1.4, y - 1);
    const knights = own(d, [castMember(d, (v) => v.knight, x - 2, y), castMember(d, (v) => v.knight, x + 2, y)]);
    const folk = crowd(d, 9, [king, squire, herald, ...knights]);
    d.go(king, x, y - 0.9); d.go(squire, x, y + 0.4);
    if (herald) d.go(herald, x - 1.3, y - 1.1);
    knights.forEach((k, i) => d.go(k, x + (i ? 1.5 : -1.5), y - 0.2));
    yield* gather(d, folk, x, y, 3.2);
    yield () => d.time > QUIET + 1 && !king.goal && !squire.goal;
    announce(d, info);
    d.face(king, squire); d.face(squire, king);
    const cast = { king, squire, herald: herald || king, k1: knights[0], k2: knights[1] || knights[0] };
    for (const [who, text, emo] of info.beats) {
      const sp = cast[who];
      if (who === 'squire' && emo === 'bow') d.feel(squire, 'bow', 6);
      if (sp) yield* d.line(sp, fx(text, cast), emo, 1);
      if (who === 'king' && emo === 'proud') { sparks(squire.x, squire.y, 16, ['#ffd23c', '#fff2a0', '#ffffff']); for (const k of knights) d.feel(k, 'cheer', 4); }
    }
    confetti(x, y, 24);
    for (const p of folk) d.feel(p, chance(0.6) ? 'cheer' : 'celebrate', 5);
    yield* crowdReacts(d, folk, info.crowd.map(([t, e]) => [fx(t, cast), e]), 3);
    d.feel(squire, 'proud', 8);
    yield* endEvent(d, [king, squire, herald, ...knights, ...folk].filter(Boolean), 'happy');
  },

  // Zebulon the Purple puts on a show: sparks, a rabbit from the hat, one trick too many
  *wizard_show(d, info) {
    const C = d.t.center, x = C.x - 1.5, y = C.y + 2;
    const wiz = castMember(d, (v) => v.role === 'wandering wizard', x, y);
    if (!wiz) return;
    const kids = own(d, d.agents.filter((a) => a.child && !a.eventRole).slice(0, 2));
    const folk = crowd(d, 9, [wiz, ...kids]);
    d.go(wiz, x, y);
    yield* gather(d, [...kids, ...folk], x, y, 2.6);
    yield () => d.time > QUIET + 1 && !wiz.goal;
    announce(d, info);
    yield* d.line(wiz, info.intro, 'proud', 1);
    for (const [who, text, emo, act] of info.beats) {
      if (act === 'sparks') { d.feel(wiz, 'fight', 2.5, false); for (let i = 0; i < 3; i++) { sparks(wiz.x, wiz.y, 10); yield 0.5; } for (const p of folk) d.feel(p, chance(0.5) ? 'surprised' : 'cheer', 4); }
      if (act === 'rabbit') {
        const rb = castAnimal(d, 'rabbit', wiz.x + 0.6, wiz.y + 0.4);
        if (rb) { rb.busy = d.event; rb.eventRole = 'cast'; rb.x = wiz.x + 0.6; rb.y = wiz.y + 0.4; d.feel(rb, 'excited', 3); sparks(rb.x, rb.y, 12, ['#ffffff', '#ffd23c']); d.run((function* () { yield 3; const [ex, ey] = d.edgeSpot(); d.go(rb, ex, ey, true); rb.eventRole = null; yield () => !rb.goal; })(), [rb]); }
        for (const k of [...kids, ...folk]) d.feel(k, k.child ? 'excited' : 'surprised', 4);
      }
      if (act === 'flop') { spawn({ type: 'smoke', x: wiz.x, y: wiz.y, z: 30, life: 1.6, size: 18, color: '#7a6a8a' }); sparks(wiz.x, wiz.y, 8, ['#555555', '#888888']); d.feel(wiz, 'embarrassed', 4); for (const p of folk) d.feel(p, chance(0.5) ? 'laugh' : 'confused', 4); }
      const sp = who === 'wiz' ? wiz : who === 'kid' ? kids[0] || pick(folk) : pick(folk);
      if (sp) yield* d.line(sp, text, emo, 1);
    }
    yield* crowdReacts(d, folk, info.crowd, 2);
    yield* endEvent(d, [wiz, ...kids, ...folk], 'cheer');
  },

  // a dog makes off with the baker's sausages; half the square gives chase
  *dog_chase(d, info) {
    const C = d.t.center;
    const dog = castAnimal(d, 'dog', C.x + 3, C.y + 1, 'dog_02_hound') || castAnimal(d, 'dog', C.x + 3, C.y + 1);
    const baker = castMember(d, (v) => v.role === 'baker', C.x + 2, C.y + 2) || adults(d, 1)[0];
    if (!dog || !baker) return;
    own(d, [dog]);
    const kid = own(d, d.agents.filter((a) => a.child && !a.eventRole).slice(0, 1))[0];
    const cat = d.agents.find((a) => a.species === 'cat' && !a.eventRole);
    const folk = crowd(d, 6, [baker, kid, dog]);
    yield () => d.time > QUIET + 1;
    announce(d, info);
    d.go(dog, baker.x + 0.7, baker.y + 0.4);
    yield () => !dog.goal;
    d.face(dog, baker); d.feel(dog, 'excited', 2);
    yield 1.2;
    yield* d.line(baker, info.intro, 'angry', 1);
    for (let lap = 0; lap < 4; lap++) {
      const [x, y] = d.randomSpot();
      d.go(dog, x, y, true); d.feel(dog, 'happy', 4);
      yield 0.5;
      const to = dog.goal || [x, y]; // (the dog may be there already, or found no way)
      d.go(baker, to[0], to[1], true); d.feel(baker, 'angry', 4);
      if (kid) { d.go(kid, x + 1, y + 0.5, true); d.feel(kid, 'cheer', 4); }
      if (lap === 1 && cat && !cat.busy) { cat.busy = d.event; cat.eventRole = 'cast'; d.face(cat, dog); d.feel(cat, 'angry', 2); d.run((function* () { yield 1.5; const [cx, cy] = d.randomSpot(); d.go(cat, cx, cy, true); d.feel(cat, 'scared', 3); yield () => !cat.goal; cat.eventRole = null; cat.busy = null; })(), []); }
      for (const p of folk) if (chance(0.5)) d.feel(p, pick(['laugh', 'surprised', 'cheer']), 3);
      const [text, emo] = info.beats[lap % info.beats.length];
      yield* d.line(lap % 2 ? (kid || baker) : baker, text, emo, 1, 2);
      yield () => !dog.goal;
    }
    d.feel(dog, 'love', 5); d.face(baker, dog);
    yield* d.line(baker, info.outro, 'relieved', 1);
    d.feel(baker, 'love', 4);
    yield* crowdReacts(d, folk, info.crowd, 2);
    yield* endEvent(d, [baker, kid, dog, ...folk].filter(Boolean), 'laugh');
  },

  // Duke Halric reads a new tax; the Dowager Queen has words
  *tax_day(d, info) {
    const C = d.t.center, x = C.x - 0.5, y = C.y + 2.2;
    const duke = castMember(d, (v) => v.role === 'duke', x, y);
    const dowager = castMember(d, (v) => v.role === 'dowager queen', x + 6, y + 5);
    if (!duke) return;
    const guard = castMember(d, (v) => v.knight, x - 1.2, y - 0.6);
    const folk = crowd(d, 10, [duke, dowager, guard]);
    if (dowager) d.hide(dowager);
    d.go(duke, x, y); if (guard) d.go(guard, x - 1.2, y - 0.5);
    yield* gather(d, folk, x, y, 3.2);
    yield () => d.time > QUIET + 1 && !duke.goal;
    announce(d, info);
    yield* d.line(duke, info.intro, 'proud', 1);
    const cast = { duke, dowager, guard };
    for (const [who, text, emo] of info.beats) {
      if (who === 'dowager' && dowager && dowager.hidden) { d.show(dowager, ...(d.map.randomNear(x + 3, y + 3, 1) || [x + 3, y + 3])); d.go(dowager, x + 1.1, y + 0.4); yield () => !dowager.goal; d.face(dowager, duke); d.face(duke, dowager); }
      const sp = cast[who];
      if (who === 'crowd') { const p = pick(folk); if (p) yield* d.line(p, text, emo, 1); for (const q of folk) d.feel(q, emo, 3); continue; }
      if (sp) yield* d.line(sp, text, emo, 1);
    }
    for (const p of folk) d.feel(p, 'cheer', 4);
    yield* crowdReacts(d, folk, info.crowd, 2);
    d.feel(duke, 'embarrassed', 5);
    yield* endEvent(d, [duke, dowager, guard, ...folk].filter(Boolean), 'happy');
  },

  // the Greener triplets jump out of the shadows in their spookiest faces
  *ghost_prank(d, info) {
    const C = d.t.center;
    const imps = own(d, ['00_greener_spooky_goofy_a', '00_greener_spooky_goofy_b', '00_greener_20_frames'].map((id) => castMember(d, (v) => v.spriteId === id, C.x, C.y)).filter(Boolean));
    if (!imps.length) return;
    const knight = castMember(d, (v) => v.knight || v.guard, C.x - 4, C.y);
    const folk = crowd(d, 9, [...imps, knight]);
    yield* gather(d, folk, C.x, C.y + 1, 3.2);
    for (const p of folk) d.feel(p, pick(['talk', 'happy', 'neutral']), 4);
    // hide behind the houses round the square
    for (const a of imps) d.hide(a);
    yield () => d.time > QUIET + 2;
    announce(d, info);
    if (folk[0]) yield* d.line(folk[0], info.intro, 'curious', 1);
    for (let i = 0; i < imps.length; i++) {
      const a = imps[i], victim = folk[i * 2] || pick(folk);
      if (!victim) break;
      const [x, y] = d.map.randomNear(victim.x + 1.2, victim.y + 0.8, 0.8) || [victim.x + 1, victim.y];
      d.show(a, x, y); d.face(a, victim); d.feel(a, 'spooky', 3);
      yield* d.line(a, info.boos[i % info.boos.length], 'spooky', 1, 2);
      d.feel(victim, 'panic', 4); d.face(victim, a);
      const [fx2, fy2] = d.randomSpot(); d.go(victim, fx2, fy2, true);
      for (const p of folk) if (p !== victim && dist(p.x, p.y, a.x, a.y) < 4) d.feel(p, chance(0.5) ? 'scared' : 'surprised', 3);
      yield 1.5;
    }
    for (const a of imps) d.feel(a, 'laugh', 4);
    yield* crowdReacts(d, folk, info.crowd, 2);
    if (knight) {
      yield d.go(knight, imps[0].x + 1, imps[0].y + 0.6, true);
      d.face(knight, imps[0]);
      yield* say(d, null, info.beats, { knight, imp: imps[0], imp2: imps[1] || imps[0] });
    }
    for (const a of imps) d.feel(a, 'embarrassed', 5);
    yield 3;
    yield* endEvent(d, [...imps, knight, ...folk].filter(Boolean), 'laugh');
  },

  // a doe and a stag wander in from the trees; everyone holds their breath until a dog barks
  *deer_visit(d, info) {
    const C = d.t.center;
    const [ex, ey] = d.edgeSpot([C.x + 14, C.y + 6], 9);
    const doe = castAnimal(d, 'deer', ex, ey, 'deer_doe_01'), buck = castAnimal(d, 'deer', ex + 1, ey + 0.5, 'deer_buck_01');
    const deer = own(d, [doe, buck].filter(Boolean));
    if (!deer.length) return;
    const kids = own(d, d.agents.filter((a) => a.child && !a.eventRole).slice(0, 2));
    const folk = crowd(d, 7, [...kids]);
    const [gx, gy] = d.map.randomNear(C.x + 3, C.y + 3, 1.5) || [C.x + 3, C.y + 3];
    yield () => d.time > QUIET + 1;
    announce(d, info);
    deer.forEach((a, i) => { a.wild = false; d.go(a, gx + i * 0.9, gy + i * 0.4); d.feel(a, 'curious', 6); });
    yield () => deer.every((a) => !a.goal) || d.time > d.event.t0 + 30;
    const p0 = folk[0] || kids[0];
    if (p0) yield* d.line(p0, info.intro, 'surprised', 1);
    for (const p of [...kids, ...folk]) { d.face(p, deer[0]); d.feel(p, p.child ? 'excited' : chance(0.5) ? 'love' : 'curious', 8); }
    for (const [who, text, emo] of info.beats) { const sp = who === 'kid' ? kids[0] || p0 : pick(folk) || p0; if (sp) yield* d.line(sp, text, emo, 1); yield 1.5; }
    // ...a bark, and they're gone
    const dog = d.agents.find((a) => a.species === 'dog' && !a.eventRole);
    if (dog) { if (dog.busy) d.release(dog.busy); dog.busy = d.event; d.face(dog, deer[0]); d.feel(dog, 'angry', 2); d.say(dog, 'WOOF!', null, 1.4); yield 1; }
    for (const a of deer) { a.wild = true; d.feel(a, 'scared', 0.8); }
    yield 0.6;
    for (const a of deer) { const [x, y] = d.edgeSpot([a.x + rand(-6, 6) + 8, a.y + 8], 12); d.go(a, x, y, true); }
    for (const p of [...kids, ...folk]) d.feel(p, pick(['sad', 'surprised', 'relieved']), 3);
    yield* crowdReacts(d, folk, info.crowd, 1);
    yield* endEvent(d, [...kids, ...folk, ...deer, dog].filter(Boolean), 'happy');
  },
};

function* fairgoer(d, p, stalls, musician) {
  for (let i = 0; i < 4; i++) {
    if (musician && chance(0.4)) {
      const ang = rand(0, TAU);
      yield d.go(p, musician.x + Math.cos(ang) * 1.8, musician.y + Math.sin(ang) * 1.8);
      d.face(p, musician.x, musician.y);
      d.feel(p, pick(['dance', 'music', 'laugh']), 8);
      yield 8;
    } else if (stalls.length) {
      const [x, y] = pick(stalls);
      yield d.go(p, x + rand(-0.6, 0.6), y + rand(1.2, 1.7));
      d.face(p, x, y);
      d.feel(p, pick(['greedy', 'hungry', 'happy', 'haggle', 'surprised']), 4);
      yield 4;
    }
  }
  p.eventRole = null;
}
