// 40 more relics from the Scars of Acts II-III. Same row shape as cards.js RELICS:
// [id, name, rarity, gem art (assets/sprites/replacements atlas), mods, text]. Mods are only the ones the battle reads.
export const RELICS2 = [
  // Common
  ['tallow_charm', 'Tallow Charm', 0, 'gem_topaz', { skillPower: 0.07 }, 'Skills hit 7% harder.'],
  ['fen_glass', 'Fen Glass', 0, 'gem_moonstone', { vsAir: 0.15 }, '+15% damage to flyers.'],
  ['rusted_signet', 'Rusted Signet', 0, 'ring_0', { atkP: 0.04, range: 0.06 }, '+4% attack, +0.06 range.'],
  ['salt_crystal', 'Salt Crystal', 0, 'gem_diamond', { crit: 0.04 }, '4% chance to strike for double.'],
  ['ember_chip', 'Ember Chip', 0, 'gem_sunstone', { burn: 0.06 }, 'Projectiles burn their target for 6% of the hit a second for 3s.'],
  ['frost_bead', 'Frost Bead', 0, 'gem_sapphire', { slow: 0.1 }, 'Attacks slow foes 10% (not thrusts, breath, leaps or lightning).'],
  ['gravedigger_coin', 'Gravedigger\'s Coin', 0, 'gem_onyx', { vsBoss: 0.12 }, '+12% damage to bosses and lieutenants.'],
  ['wick_ring', 'Candle-Wick Ring', 0, 'ring_1', { skillCharge: 0.04, rateP: 0.02 }, 'Skills charge 4% faster; +2% attack speed.'],
  // Uncommon
  ['quartz_lens', 'Quartz Lens', 1, 'gem_seeker', { range: 0.25 }, '+0.25 range.'],
  ['coral_charm', 'Coral Charm', 1, 'gem_opal', { atkP: 0.08, skillCharge: 0.05 }, '+8% attack, skills charge 5% faster.'],
  ['hoarfrost_shard', 'Hoarfrost Shard', 1, 'gem_amethyst', { slow: 0.15, atkP: 0.04 }, 'Attacks slow foes 15% (not thrusts, breath, leaps or lightning); +4% attack.'],
  ['gallows_knot', 'Gallows Knot', 1, 'ring_0', { vsBoss: 0.18 }, '+18% damage to bosses and lieutenants.'],
  ['spark_flint', 'Spark Flint', 1, 'gem_ruby', { rateP: 0.1 }, '+10% attack speed.'],
  ['bog_lantern', 'Bog Lantern', 1, 'item_orb', { crit: 0.05, atkP: 0.04 }, '5% chance to strike for double; +4% attack.'],
  ['mirefen_eye', 'Mirefen Eye', 1, 'gem_emerald', { poisonP: 0.2, atkP: 0.05 }, '+20% poison, +5% attack.'],
  ['glasswind_shard', 'Glasswind Shard', 1, 'gem_prism', { vsAir: 0.18, range: 0.1 }, '+18% damage to flyers, +0.1 range.'],
  // Rare
  ['abbey_clapper', 'Abbey Bell Clapper', 2, 'gem_titan', { stunP: 0.4, skillPower: 0.08 }, 'Dawnbreak, Dragon Dive and Obliterate stun 40% longer; skills hit 8% harder.'],
  ['foundry_cog', 'Foundry Cog', 2, 'gem_orbit', { rateP: 0.12, crit: 0.03 }, '+12% attack speed, 3% double strikes.'],
  ['scarab_eye', 'Scarab Eye', 2, 'gem_sunstone', { vsAir: 0.3, range: 0.15 }, '+30% damage to flyers, +0.15 range.'],
  ['hangmans_ring', 'Hangman\'s Ring', 2, 'ring_2', { vsBoss: 0.25, atkP: 0.05 }, '+25% damage to bosses and lieutenants, +5% attack.'],
  ['wax_seal', 'Wax Saint\'s Seal', 2, 'gem_opal', { skillPower: 0.16, skillCharge: 0.05 }, 'Skills hit 16% harder and charge 5% faster.'],
  ['marrow_prism', 'Marrow Prism', 2, 'gem_splitter', { pierce: 1, splash: 0.1 }, 'Spears and bone spears pierce 1 more foe; +0.1 splash.'],
  ['caldera_coal', 'Caldera Coal', 2, 'gem_bloodstone', { burn: 0.1, burnP: 0.3 }, 'Projectiles burn their target for 10% of the hit a second for 3s; breath and Wyrmfire burn 30% more.'],
  ['tally_stone', 'Tally Stone', 2, 'gem_jade', { killStack: 0.008 }, '+0.8% attack per kill this battle (up to 40%).'],
  // Epic
  ['citadel_heartstone', 'Citadel Heartstone', 3, 'gem_titan', { atkP: 0.22, vsAir: 0.2 }, '+22% attack, +20% damage to flyers.'],
  ['coral_pearl', 'Pearl of the Coral Throne', 3, 'gem_moonstone', { skillPower: 0.2, skillLong: 2 }, 'Skills hit 20% harder; Thunder Totem and Eclipse Rang last 2s longer.'],
  ['mantis_lens', 'Mantis Lens', 3, 'gem_seeker', { crit: 0.1, range: 0.25 }, '10% double strikes, +0.25 range.'],
  ['hydra_fang', 'Hydra Fang', 3, 'gem_chainlink', { multishot: 1, atkP: -0.2 }, 'Missiles and rangs strike a second foe; -20% attack.'],
  ['veil_lantern', 'Veil Lantern', 3, 'item_orb', { skillCharge: 0.2, rateP: 0.08 }, 'Skills charge 20% faster; +8% attack speed.'],
  ['scarab_crown', 'Scarab Emperor\'s Eye', 3, 'gem_amethyst', { vsBoss: 0.35, atkP: 0.08 }, '+35% damage to bosses and lieutenants, +8% attack.'],
  ['pyre_ring', 'Pyre-Saint\'s Ring', 3, 'ring_1', { atkP: 0.15, burn: 0.15 }, '+15% attack; projectiles burn their target for 15% of the hit a second for 3s.'],
  // Legendary
  ['breach_candle', 'Breach Candle', 4, 'gem_topaz', { skillCharge: 0.25, skillPower: 0.2 }, 'Skills charge 25% faster and hit 20% harder.'],
  ['leviathan_pearl', 'Leviathan Pearl', 4, 'gem_opal', { atkP: 0.25, vsBoss: 0.3 }, '+25% attack, +30% damage to bosses and lieutenants.'],
  ['moon_antler', 'Moon Eater\'s Antler', 4, 'gem_moonstone', { crit: 0.15, rateP: 0.12 }, '15% double strikes, +12% attack speed.'],
  ['foundry_mainspring', 'Foundry Mainspring', 4, 'gem_orbit', { rateP: 0.25, range: 0.2 }, '+25% attack speed, +0.2 range.'],
  ['stormglass', 'Stormglass Talisman', 4, 'gem_prism', { vsAir: 0.6, atkP: 0.15 }, '+60% damage to flyers, +15% attack.'],
  // Mythic
  ['throne_shard', 'Shard of the Screaming Throne', 5, 'gem_novacore', { atkP: 0.4, killStack: 0.01 }, '+40% attack; +1% attack per kill this battle (up to 40%). It still screams.'],
  ['wound_heart', 'Heart of the Wound', 5, 'gem_twinsoul', { multishot: 1, atkP: 0.2 }, 'Missiles and rangs strike a second foe; +20% attack.'],
  ['first_dawn_ashes', 'Ashes of the First Dawn', 5, 'gem_diamond', { atkP: 0.3, skillCharge: 0.2, skillPower: 0.2 }, '+30% attack; skills charge 20% faster and hit 20% harder.'],
  ['commanders_seal', 'The Commander\'s Seal', 5, 'gem_classgem', { atkP: 0.25, rateP: 0.2, range: 0.3 }, '+25% attack, +20% attack speed, +0.3 range.'],
];
