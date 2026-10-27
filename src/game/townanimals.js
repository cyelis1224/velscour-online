// Herrington Hollow's animals. Now and then a cat or two and a dog or two wander the lanes (cats nap, groom, beg a
// stroke and hiss at dogs; dogs trot about, sniff, greet people and the hero, and chase cats). On the outskirts
// rabbits graze and hop, rats scurry by the barrels and a stag or a doe crops the grass at the treeline; all of them
// bolt when the hero comes close. They are town-life agents (src/game/townlife.js) with `animal` set, drawn from the
// People and Animals pack like everyone else.
import { G } from '../state.js';
import { dist, rand, randi, pick, chance, TAU } from '../core/util.js';
import { ANIMALS } from '../data/townsfolk.js';

export const ANIMAL_CHANCE = { cat: 0.6, dog: 0.55, rabbit: 0.45, rat: 0.35, deer: 0.3 };
const SOUNDS = { dog: ['Woof!', 'Arf!', 'Ruff ruff!', 'Wuff.'], cat: ['Mrrow.', 'Mew?', 'Prrrr...', 'Mrrp!'] };
const heroDist = (a) => (G.player ? dist(G.player.x, G.player.y, a.x, a.y) : 99);

/** Put this visit's animals in town. `force` (tests): { species: count }. */
export function addTownAnimals(d, rng, force = G.townAnimalsForce) {
  const { map, t } = d, C = t.center, P = t.portal;
  // the outskirts: open ground between the last houses and the treeline, away from the portal road
  const R0 = 15, R1 = Math.min(map.w, map.h) / 2 - 1.5;
  const edge = [];
  for (let y = 2; y < map.h - 2; y++) for (let x = 2; x < map.w - 2; x++) {
    const r = dist(x, y, C.x, C.y);
    if (r > R0 && r < R1 && dist(x, y, P.x, P.y) > 5 && map.walkable(x + 0.5, y + 0.5) && map.circleFree(x + 0.5, y + 0.5, 0.3)) edge.push([x + 0.5, y + 0.5]);
  }
  d.edge = edge;
  d.edgeSpot = (near, r = 6) => {
    if (!edge.length) return d.randomSpot();
    if (!near) return rng.pick(edge);
    const close = edge.filter(([x, y]) => dist(x, y, near[0], near[1]) < r);
    return close.length ? rng.pick(close) : rng.pick(edge);
  };
  const species = (s) => ANIMALS.filter((v) => v.species === s);
  const counts = force || {
    cat: rng.chance(ANIMAL_CHANCE.cat) ? rng.int(1, 2) : 0, dog: rng.chance(ANIMAL_CHANCE.dog) ? rng.int(1, 2) : 0,
    rabbit: rng.chance(ANIMAL_CHANCE.rabbit) ? rng.int(1, 3) : 0, rat: rng.chance(ANIMAL_CHANCE.rat) ? rng.int(1, 2) : 0,
    deer: rng.chance(ANIMAL_CHANCE.deer) ? rng.int(1, 2) : 0,
  };
  for (const [s, n] of Object.entries(counts)) {
    const kinds = species(s);
    if (!kinds.length) continue;
    // deer come as a doe and a stag; cats and dogs are different animals; rabbits and rats repeat
    const start = rng.int(0, kinds.length - 1);
    let herd = null;
    for (let i = 0; i < n; i++) {
      const v = kinds[(start + i) % kinds.length];
      const at = v.where === 'edge' ? d.edgeSpot(herd, 4) : d.randomSpot();
      herd = herd || at;
      makeAnimal(d, v, at[0] + (rng.next() * 0.8 - 0.4), at[1] + (rng.next() * 0.8 - 0.4));
    }
  }
}

export function makeAnimal(d, v, x, y, opts = {}) {
  if (!d.map.walkable(x, y)) [x, y] = d.map.randomNear(x, y, 1.5, d.rng ? () => d.rng.next() : undefined) || [x, y];
  return d.makeAgent(v, x, y, { animal: true, species: v.species, wild: v.where === 'edge', speed: v.speed, runSpeed: v.run, idleH: v.h,
    name: v.name.startsWith('a ') ? v.name[2].toUpperCase() + v.name.slice(3) : v.name, reach: 1.3, ...opts });
}

/** A click or a passing hero: dogs wag and bark, cats purr or stalk off, wild things bolt. */
export function animalGreet(d, a, clicked) {
  if (a.wild) { if (clicked || heroDist(a) < 3) bolt(d, a); return; }
  d.face(a, G.player?.x ?? a.x, G.player?.y ?? a.y);
  if (a.species === 'dog') { d.feel(a, chance(0.5) ? 'excited' : 'happy', 3); if (clicked || chance(0.5)) d.say(a, pick(SOUNDS.dog), null, 1.6); }
  else { d.feel(a, chance(0.7) ? 'love' : 'suspicious', 3); if (clicked) d.say(a, pick(SOUNDS.cat), null, 1.6); }
}

/** Run from the hero (or `from`): a startle, then a bound to somewhere far. */
function bolt(d, a, from = G.player) {
  if (!from || a.boltT > d.time) return;
  a.boltT = d.time + 4;
  const ang = Math.atan2(a.y - from.y, a.x - from.x) + rand(-0.5, 0.5), far = a.species === 'deer' ? 11 : 7;
  const goal = a.wild ? d.edgeSpot([a.x + Math.cos(ang) * far, a.y + Math.sin(ang) * far], 6) : d.map.randomNear(a.x + Math.cos(ang) * far, a.y + Math.sin(ang) * far, 2) || d.randomSpot();
  d.feel(a, 'scared', 0.7);
  a.fleeing = true;
  setTimeout0(d, 0.45, () => { d.go(a, goal[0], goal[1], true); a.fleeing = true; });
}
// a delayed call on the director's clock (scenes are generators; this is a one-liner)
function setTimeout0(d, s, fn) { d.run((function* () { yield s; fn(); })(), []); }

/** The routine of a free animal (townlife.js pickRoutine hands animals here). */
export function* animalRoutine(d, a) {
  if (a.wild) return yield* wildRoutine(d, a);
  const r = Math.random();
  const people = d.agents.filter((q) => !q.animal && !q.adv && !q.hidden && !q.busy && dist(q.x, q.y, a.x, a.y) < 10);
  if (a.species === 'cat') {
    const dog = d.agents.find((q) => q.species === 'dog' && !q.hidden && dist(q.x, q.y, a.x, a.y) < 3.5);
    if (dog) { d.face(a, dog); d.feel(a, 'angry', 1.6); yield 1.6; const [x, y] = d.randomSpot(); yield d.go(a, x, y, true); d.feel(a, 'suspicious', 3); yield 3; return; }
    if (r < 0.3) { const spot = d.spots.benches.length && chance(0.5) ? pick(d.spots.benches) : null; if (spot) yield d.go(a, spot.x + rand(0.5, 0.9), spot.y + rand(0.5, 0.9)); const dur = rand(14, 30); d.feel(a, 'sleep', dur); yield dur; return; }
    if (r < 0.55 && people.length) { yield* nuzzle(d, a, pick(people), 'Aww, puss!'); return; }
    if (r < 0.7) { d.feel(a, 'happy', rand(3, 5)); yield 4; return; } // a wash
  } else {
    // dogs
    const cat = d.agents.find((q) => q.species === 'cat' && !q.hidden && !q.busy && dist(q.x, q.y, a.x, a.y) < 9);
    if (cat && r < 0.25) { yield* chaseCat(d, a, cat); return; }
    if (r < 0.45 && G.player && heroDist(a) < 12) {
      yield d.go(a, G.player.x + rand(-1, 1), G.player.y + rand(0.6, 1.2), true);
      d.face(a, G.player.x, G.player.y); d.feel(a, 'excited', 3);
      if (d.canSpeak(a)) d.say(a, pick(SOUNDS.dog), null, 1.6);
      yield 3; return;
    }
    if (r < 0.65 && people.length) { yield* nuzzle(d, a, pick(people), pick(['Good dog!', 'Who\'s a good dog?', 'Sit! ...Close enough.'])); return; }
    if (r < 0.75) { const dur = rand(10, 20); d.feel(a, 'sleep', dur); yield dur; return; }
  }
  // a little stroll, a sniff
  const [x, y] = chance(0.5) ? d.map.randomNear(a.x + rand(-5, 5), a.y + rand(-5, 5), 2) || d.randomSpot() : d.randomSpot();
  yield d.go(a, x, y);
  d.feel(a, a.species === 'dog' ? 'point' : 'curious', 2);
  yield rand(2, 6);
}

function* nuzzle(d, a, q, line) {
  q.busy = a.busy;
  yield d.go(a, q.x + rand(-0.6, 0.6), q.y + rand(0.4, 0.7));
  d.face(a, q); d.face(q, a);
  d.feel(a, a.species === 'dog' ? 'excited' : 'love', 4);
  d.feel(q, 'love', 4);
  if (chance(0.5)) yield* d.line(q, line, 'love', 0, 1.5); else yield 3;
  if (q.busy === a.busy) { q.busy = null; q.nextT = rand(1, 4); }
  yield 1;
}

function* chaseCat(d, a, cat) {
  if (cat.busy) d.release(cat.busy);
  cat.busy = a.busy;
  d.face(cat, a); d.feel(cat, 'angry', 1.2); d.feel(a, 'excited', 1.2);
  if (d.canSpeak(a)) d.say(a, 'WOOF!', null, 1.2);
  yield 1.2;
  for (let i = 0; i < randi(2, 4); i++) {
    const [x, y] = d.randomSpot();
    d.go(cat, x, y, true); d.feel(cat, 'scared', 3);
    yield 0.5;
    d.go(a, cat.x, cat.y, true); d.feel(a, 'excited', 3);
    for (let k = 0; k < 8 && cat.goal; k++) { yield 0.4; d.go(a, cat.x, cat.y, true); }
  }
  // the cat wins: up on a bench or out of reach, glaring
  d.feel(cat, 'suspicious', 4); d.feel(a, 'confused', 3);
  if (cat.busy === a.busy) { cat.busy = null; cat.nextT = rand(3, 6); }
  yield 3;
}

function* wildRoutine(d, a) {
  // graze or sniff a while, a few steps between, always ready to bolt
  const spells = randi(2, 4);
  for (let s = 0; s < spells; s++) {
    const graze = rand(3, 8);
    for (let t = 0; t < graze; t += 0.3) {
      if (heroDist(a) < (a.species === 'deer' ? 6 : 4)) { bolt(d, a); yield () => !a.goal; a.fleeing = false; d.feel(a, a.species === 'deer' ? 'suspicious' : 'scared', 2); yield 2; return; }
      // a rat by people makes them jump
      if (a.species === 'rat' && (a.squeakT = (a.squeakT || 0) - 0.3) <= 0) {
        const q = d.agents.find((p) => !p.animal && !p.adv && !p.hidden && !p.busy && dist(p.x, p.y, a.x, a.y) < 2.2);
        if (q) { a.squeakT = 25; d.face(q, a); d.run((function* () { yield* d.line(q, pick(['Rat!', 'Eek! A rat!', 'Shoo! Shoo!', 'Get out of it!']), 'scared', 0, 1); })(), [q]); bolt(d, a, q); yield () => !a.goal; return; }
      }
      yield 0.3;
    }
    if (chance(0.4)) d.feel(a, a.species === 'rabbit' ? 'happy' : 'curious', 2);
    const [x, y] = d.edgeSpot([a.x, a.y], a.species === 'deer' ? 5 : 3.5);
    yield d.go(a, x, y);
  }
  yield rand(1, 3);
}

/** For events: an animal of a species already in town, or a new one at (x, y). */
export function castAnimal(d, species, x, y, pickOne = null) {
  const have = d.agents.find((a) => a.species === species && !a.eventRole && (!pickOne || a.id === pickOne));
  if (have) { if (have.busy && have.busy !== d.event) d.release(have.busy); return have; }
  const v = pickOne ? ANIMALS.find((q) => q.id === pickOne) : pick(ANIMALS.filter((q) => q.species === species));
  return v ? makeAnimal(d, v, x, y) : null;
}
export { bolt as animalBolt };
