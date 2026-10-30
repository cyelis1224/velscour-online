// VELSCOUR DEFENSE: boot, the frame loop and the menus' rift backdrop. A separate page from the main game
// (index.html at the repo root); it reads Velscour's art and keeps its own save.
import { D, load, save } from './state.js';
import { loadArtIndex } from './core/assets.js';
import { buildCatalog } from './data/cards.js';
import { loadCardBack } from './cards/cardart.js';
import { registerScreen, show, refreshChrome } from './ui/app.js';
import { battleFrame, battleActive, battleCtl } from './ui/battle.js';
import { packOpen } from './cards/pack3d.js';
import * as hub from './ui/hub.js';
import * as campaign from './ui/campaign.js';
import * as squad from './ui/squad.js';
import * as collection from './ui/collection.js';
import * as summon from './ui/summon.js';
import * as works from './ui/works.js';
import * as modes from './ui/modes.js';
import * as rewards from './ui/rewards.js';
import * as settings from './ui/settings.js';
import { initAudio, applyVolumes } from './core/audio.js';

const cv = document.getElementById('bf'), ctx = cv.getContext('2d', { alpha: false });
function resize() {
  D.W = innerWidth; D.H = innerHeight;
  D.dpr = Math.min(devicePixelRatio || 1, D.touch ? 1.5 : 2);
  cv.width = Math.round(D.W * D.dpr); cv.height = Math.round(D.H * D.dpr);
  battleCtl()?.view.fit();
}

// the menus' backdrop: the Riftgate turning slowly in the dark
const stars = Array.from({ length: 160 }, () => [Math.random(), Math.random(), Math.random()]);
function backdrop(t) {
  const W = D.W, H = D.H;
  ctx.setTransform(D.dpr, 0, 0, D.dpr, 0, 0);
  ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, W, H);
  for (const [x, y, z] of stars) { ctx.fillStyle = `rgba(170,190,255,${0.15 + z * 0.5 * (0.6 + 0.4 * Math.sin(t * 2 + z * 9))})`; ctx.fillRect(x * W, y * H, 1 + z, 1 + z); }
  ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    ctx.rotate(0.45 + Math.sin(t * 0.2) * 0.01);
    ctx.strokeStyle = `rgba(${60 + i * 8},${100 + i * 6},255,${0.12 - i * 0.006})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 40 + i * 22, 90 + i * 30, t * 0.15, t * (0.3 + i * 0.05), t * (0.3 + i * 0.05) + 3.4); ctx.stroke();
  }
  ctx.restore(); ctx.globalCompositeOperation = 'source-over';
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  D.time += dt; D.frame = (D.frame || 0) + 1;
  try {
    if (battleActive()) battleFrame(dt);
    else if (!packOpen()) backdrop(D.time);
  } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
}

async function boot() {
  D.touch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  if (D.touch) document.body.classList.add('touch');
  load();
  resize(); addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200));
  requestAnimationFrame(loop);
  const bar = document.querySelector('.ld-bar i'), set = (f) => { if (bar) bar.style.width = Math.round(f * 100) + '%'; };
  set(0.2);
  await loadArtIndex();
  set(0.6);
  buildCatalog();
  await loadCardBack();
  set(1);
  for (const [k, m] of Object.entries({ hub, campaign, squad, collection, summon, works, modes, rewards, settings, hero: collection.heroScreen })) registerScreen(k, m);
  applyVolumes();
  document.getElementById('loading').classList.add('done');
  setTimeout(() => document.getElementById('loading').remove(), 600);
  show('hub');
  setInterval(() => { if (!battleActive() && !packOpen()) refreshChrome(); }, 30000); // the hourly bounty's dot appears on its own
  addEventListener('beforeunload', () => save(true));
  addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
  window.VDEF = { D, show, ctl: battleCtl };
}
boot().catch((e) => {
  console.error(e);
  const t = document.querySelector('.ld-text');
  if (t) t.textContent = 'The rift would not open: ' + e.message + ' (serve the repo over http, not file://)';
});
export { initAudio };
