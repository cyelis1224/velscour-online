// A card in the DOM: its face (rendered lazily when it scrolls into view), a foil sheen and a tilt that follows the pointer.
import { el } from '../core/util.js';
import { renderCard, ensureCardArt } from '../cards/cardart.js';

let io = null;
const pending = new WeakMap();
function observer() {
  if (io) return io;
  io = new IntersectionObserver((ents) => { for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); pending.get(e.target)?.(); } }, { rootMargin: '200px' });
  return io;
}
/** opts: { entry, stats, scale, owned, onClick, count, isNew, dot, selected } */
export function cardView(card, opts = {}) {
  const v = el('div', 'cardv' + (opts.entry?.foil || card.rarity >= 4 ? ' foil' : '') + (opts.owned === false ? ' unowned' : '') + (opts.dot ? ' dot' : ''));
  const inner = el('div', 'inner');
  v.appendChild(inner);
  inner.innerHTML = '<div class="shine"></div><div class="glare"></div>';
  const paint = async () => {
    await ensureCardArt(card).catch(() => {});
    const c = renderCard(card, opts.entry, opts.scale || 0.34, opts.stats);
    const img = el('canvas'); img.width = c.width; img.height = c.height; img.getContext('2d').drawImage(c, 0, 0);
    inner.prepend(img);
  };
  pending.set(v, paint); observer().observe(v);
  if (opts.count > 1) v.insertAdjacentHTML('beforeend', `<span class="count">×${opts.count}</span>`);
  if (opts.isNew) v.insertAdjacentHTML('beforeend', '<span class="newtag">NEW</span>');
  if (opts.selected) v.insertAdjacentHTML('beforeend', '<span class="sel"></span>');
  tilt(v, inner);
  if (opts.onClick) v.onclick = opts.onClick;
  return v;
}
export function tilt(v, inner, max = 14) {
  v.addEventListener('pointermove', (e) => {
    const r = v.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    inner.style.transform = `rotateY(${(x - 0.5) * max * 2}deg) rotateX(${(0.5 - y) * max * 2}deg) scale(1.04)`;
    v.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); v.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  });
  v.addEventListener('pointerleave', () => { inner.style.transform = ''; });
}
