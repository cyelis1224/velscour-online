// The Bastion Works: permanent upgrades bought with gold between battles (the Commander's, not auto-play's).
export const RESEARCH = {
  atk: { name: 'Forge of Valor', text: '+3% attack for every hero', max: 120, base: 300, grow: 1.15, per: 0.03, icon: '⚔' },
  startValor: { name: 'Muster Drums', text: '+3 starting Valor', max: 10, base: 200, grow: 1.3, per: 3, icon: '🥁' },
  valorRate: { name: 'Rift Siphon', text: '+5% Valor regeneration', max: 20, base: 350, grow: 1.26, per: 0.05, icon: '✦' },
  valorCap: { name: 'War Chest', text: '+5 Valor cap', max: 10, base: 250, grow: 1.3, per: 5, icon: '⛁' },
  heart: { name: 'Heartstone Wardings', text: '+2 Heart', max: 15, base: 300, grow: 1.3, per: 2, icon: '❤' },
  deploy: { name: 'Command Tent', text: '+1 Deploy Limit', max: 2, base: 20000, grow: 8, per: 1, icon: '⚑' },
  gold: { name: 'Tithe of the Hollow', text: '+5% gold from battles', max: 20, base: 400, grow: 1.25, per: 0.05, icon: '◉' },
};
export const researchCost = (k, lvl) => Math.round(RESEARCH[k].base * Math.pow(RESEARCH[k].grow, lvl));
export function researchBonus(save) {
  const r = save.research || {}, v = (k) => (r[k] || 0) * RESEARCH[k].per;
  return { atk: v('atk'), startValor: v('startValor'), valorRate: v('valorRate'), valorCap: v('valorCap'), heart: v('heart'), deploy: v('deploy'), gold: v('gold') };
}
export function buyResearch(save, k) {
  const lvl = save.research[k] || 0, c = researchCost(k, lvl);
  if (lvl >= RESEARCH[k].max || save.gold < c) return false;
  save.gold -= c; save.research[k] = lvl + 1;
  return true;
}
