// Held gear (assets/sprites/held/, baked by tools/weapons3d_bake.js): every weapon and off-hand base shows in a set of
// 50 three.js designs in a class's style, by rarity (HELD_PER: 10 Common .. 6 Mythic). An item's look picks one of its
// rarity's designs; the set comes from its base, the slot it sits in and the wearer's class.
export const HELD_PER = [10, 10, 9, 8, 7, 6];
export const HELD_START = HELD_PER.map((_, R) => HELD_PER.slice(0, R).reduce((a, b) => a + b, 0));
export const HELD_COUNT = HELD_PER.reduce((a, b) => a + b, 0);

/** Each class's own off-hand base (none for the Barbarian, who swings a second weapon). */
export const CLASS_FOCUS = {
  paladin: 'shield', ranger: 'quiver', wizard: 'tome', necromancer: 'orb', dragoon: 'shield', totem_master: 'idol',
  death_knight: 'skull', arcane_sorcerer: 'orb', carrion_witch: 'lantern', bard: 'drum', slime_lord: 'jar',
  boomerang_knight: 'rang', lancer: 'shield', dragon_knight: 'shield', gunner: 'bomb',
};

/** The set an item of `base` shows in, in `slot`, held by `cls` (null: no held art). */
export function heldSetOf(base, slot, cls) {
  if (slot === 'offhand') {
    if (base === 'shield') return { lancer: 'towershields', dragon_knight: 'dragonshields', dragoon: 'bucklers' }[cls] || 'holyshields';
    if (base === 'orb') return cls === 'arcane_sorcerer' ? 'starorbs' : 'darkorbs';
    const focus = { tome: 'tomes', lantern: 'lanterns', skull: 'frostskulls', idol: 'idols', jar: 'jars', bomb: 'bombs', drum: 'drums', quiver: 'quivers', rang: 'rangs' }[base];
    if (focus) return focus;
    return base === 'axe' ? 'handaxes' : null; // the Barbarian's second weapon: only an axe has a left-hand set
  }
  return {
    sword: cls === 'death_knight' ? 'greatswords' : 'swords', axe: 'greataxes', mace: cls === 'slime_lord' ? 'slimemaces' : 'maces', hammer: 'maces',
    dagger: 'daggers', staff: { totem_master: 'totemstaves', carrion_witch: 'crooks' }[cls] || 'firestaves', wand: cls === 'arcane_sorcerer' ? 'starwands' : 'bonewands',
    bow: 'bows', crossbow: 'crossbows', spear: cls === 'lancer' ? 'lances' : 'spears', scythe: 'scythes', pistol: 'pistols', boomerang: 'boomerangs', lute: 'lutes',
  }[base] || null;
}

/** An item's element for its glow and effects: its strongest elemental affix or legendary power (null: none). */
export function heldElement(item) {
  const L = { thunder: 'light', frostbite: 'cold', inferno: 'fire' }[item.legendary];
  if (L) return L;
  let best = null, bv = 0;
  for (const a of item.affixes || []) {
    const m = /^(fire|cold|light|poison|arcane|holy|shadow|blood|acid)Pct$/.exec(a.s);
    if (m && a.v > bv) { bv = a.v; best = m[1]; }
  }
  return best;
}
