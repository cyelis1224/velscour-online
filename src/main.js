// VELSCOUR - entry point.
import { G, loadSettings } from './state.js';
import { initInput, input } from './core/input.js';
import { camera } from './core/view.js';
import { loadAssets } from './core/assets.js';
import { loadEnemyArt, loadPetArt } from './core/enemyart.js';
import { rand, TAU } from './core/util.js';
import { UI, $ } from './ui/ui.js';
import { HUD } from './ui/hud.js';
import { TouchUI } from './ui/touch.js';
import { titleScreen } from './ui/screens.js';
import { Cloud } from './game/cloud.js';
import { Vendor } from './ui/vendor.js';
import { Stash } from './ui/stash.js';
import { Reliquary } from './ui/reliquary.js';
import { Heresies } from './ui/heresies.js';
import { Rifts } from './ui/rifts.js';
import { Marks } from './ui/marks.js';
import { game } from './game/game.js';
import { dropBakes } from './game/render.js';
import { controls } from './game/controls.js';
import { initSpectate } from './game/spectate.js';
import { glowSprite } from './gfx/vfx.js';
import { applyVolumes, preloadSong, TITLE_SONG } from './core/audio.js';

function resize() {
  G.W = window.innerWidth;
  G.H = window.innerHeight;
  const maxDpr = G.touch ? 1.5 : 2;
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  // cap the backing store to keep fill-rate sane on huge / high-dpi screens
  const maxPixels = G.touch ? 1.6e6 : 4.2e6;
  if (G.W * G.H * dpr * dpr > maxPixels) dpr = Math.sqrt(maxPixels / (G.W * G.H));
  // resScale < 1 when the frame rate is too low (adaptRes): fewer pixels to fill, same layout
  // Apply the pixel budget AFTER adaptive scaling; a minimum 0.75 DPR could otherwise
  // undo the cap on large phones/tablets and silently allocate oversized buffers.
  G.dpr = Math.max(0.5, Math.min(dpr * (G.resScale || 1), Math.sqrt(maxPixels / (G.W * G.H))));
  G.canvas.width = Math.round(G.W * G.dpr);
  G.canvas.height = Math.round(G.H * G.dpr);
  camera.computeZoom();
  const portrait = G.touch && G.H > G.W;
  document.body.classList.toggle('portrait', portrait);
  document.body.classList.toggle('compact-mobile-hud', G.touch && (portrait || !G.settings.mobileSkillBar));
}

// ---------------------------------------------------------- title backdrop
const embers = [];
function renderTitle(dt) {
  const ctx = G.ctx, W = G.canvas.width, H = G.canvas.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#060203'); g.addColorStop(0.7, '#1a0503'); g.addColorStop(1, '#3a0a04');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  while (embers.length < 140) embers.push({ x: rand(W), y: H + rand(0, H), vy: rand(20, 80), vx: rand(-15, 15), s: rand(1, 3.5), ph: rand(TAU) });
  ctx.globalCompositeOperation = 'lighter';
  for (const e of embers) {
    e.y -= e.vy * dt * G.dpr; e.x += (e.vx + Math.sin(G.time + e.ph) * 12) * dt * G.dpr;
    if (e.y < -20) { e.y = H + 10; e.x = rand(W); }
    const a = Math.min(1, e.y / H + 0.2);
    ctx.globalAlpha = a;
    const s = e.s * 5 * G.dpr;
    ctx.drawImage(glowSprite(e.s > 2.5 ? '#ffb040' : '#ff4010'), e.x - s, e.y - s, s * 2, s * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

// Adaptive resolution: when a device misses its frame budget, trade backing-store
// pixels for frame rate in 2 s windows, and earn them back after 10 s of headroom.
// Every change re-bakes the floor chunks at the new size, so a phone hovering near the limits used to see-saw
// (down, 10 s later up, down again): each step back up that has to be undone soon after doubles the wait (to 2 min).
const ar = { t: 0, n: 0, good: 0, need: 5, upAt: -1e9 };
function adaptRes(raw) {
  if (G.mode !== 'game' || document.hidden) { ar.t = ar.n = 0; return; }
  // Do not discard very slow frames: that prevented adaptation precisely when
  // biome generation/painting made the phone stall for >250 ms.
  ar.t += Math.min(raw, 0.25); ar.n++;
  if (ar.t < 2) return;
  const fps = ar.n / ar.t, s = G.resScale || 1, now = performance.now();
  ar.t = ar.n = 0;
  const minScale = G.touch ? 0.7 : 0.75, cap = G.settings.fpsCap || 0;
  // under a frame cap the budget is the cap's, not 60
  const slowFps = cap ? cap * 0.8 : G.touch ? 45 : 50, fastFps = cap ? cap * 0.95 : 57;
  if (fps < slowFps && s > minScale) {
    if (now - ar.upAt < 20000) ar.need = Math.min(60, ar.need * 2);
    G.resScale = Math.max(minScale, s * 0.85); ar.good = 0; resize();
  } else if (fps > fastFps && s < 1) { if (++ar.good >= ar.need) { G.resScale = Math.min(1, s / 0.85); ar.good = 0; ar.upAt = now; resize(); } }
  else ar.good = 0;
}

let last = performance.now(), lastFrame = 0;   // last: how far the game clock has run; lastFrame: the last animation frame
function loop(now) {
  requestAnimationFrame(loop);
  lastFrame = now;   // frames the cap skips count too, or tick() would keep moving `last` and the cap would skip them all
  // Settings › frame rate cap: a phone drawing 30 frames a second instead of 60 does half the work and heats up less
  // (a hot phone slows itself down after a long session); 2 ms slack so a 60 Hz display shows every other frame
  const cap = G.mode === 'game' ? G.settings.fpsCap || 0 : 0;
  if (cap && now - last < 1000 / cap - 2) return;
  const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw);
  last = now;
  adaptRes(raw);
  G.time += dt;
  G.dt = dt;
  G.frame++;
  // the update and the draw each get their own try: an update that throws every frame (a broken fight) used to skip
  // every draw too, and the screen went black
  if (G.mode === 'game' && G.world) {
    try {
      game.update(dt);
      if (G.room && raw > 0.08) {
        // Catch up simulation in online play so player stays in real-time sync with peers
        const catchupSteps = Math.min(6, Math.floor((raw - 0.05) / 0.05));
        for (let i = 0; i < catchupSteps; i++) {
          if (!G.world || !G.room) break;
          game.update(0.05);
        }
      }
    } catch (err) { reportError(err); }
  }
  try {
    if (G.mode === 'game' && G.world) game.render();
    else renderTitle(dt);
  } catch (err) {
    reportError(err);
    // a draw that threw left its save()s (clips, alpha, transforms) on the stack: unwind them, or every later frame
    // draws through them (restore() past the bottom of the stack does nothing)
    if (G.ctx) for (let i = 0; i < 64; i++) G.ctx.restore();
  }
  input.endFrame();
}

// A hidden page (minimised, covered by other windows, a locked PC) gets no animation frames, and its timers are
// throttled to once a second, then once a minute. A worker's timer is not, so its ticks keep the game (and auto-play)
// running in real time while nothing is drawn. They also step in when frames stop on a page that still counts as visible.
let lastTick = 0;
function tick() {
  const now = performance.now(), gap = now - lastTick;
  lastTick = now;
  // a short gap means the ticks arrive on time: frames stopped, not one long frame holding up this thread
  if (!document.hidden && !(now - lastFrame > 500 && gap < 100)) return;
  let left = Math.min(now - last, gap, 1000) / 1000;
  last = now;
  try {
    while (left > 1e-4 && G.mode === 'game' && G.world) {
      const dt = Math.min(1 / 30, left);
      left -= dt;
      G.time += dt; G.dt = dt; G.frame++;
      game.update(dt);
      input.endFrame();
    }
  } catch (err) {
    reportError(err);
  }
}
function startTicker() {
  try {
    const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 1000 / 30);'], { type: 'text/javascript' })));
    w.onmessage = tick;
  } catch (e) {
    setInterval(tick, 1000 / 30);   // no workers: throttled while hidden, but each tick still catches up a second
  }
}

let errShown = 0;
function reportError(err) {
  console.error(err);
  if (errShown++ > 3) return;
  UI.log && UI.logEl && UI.log(`<span style="color:#ff6060">Error: ${String(err && err.message || err).slice(0, 140)}</span>`);
}

async function boot() {
  loadSettings();
  G.canvas = $('#game');
  G.ctx = G.canvas.getContext('2d', { alpha: false });
  G.touch = window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
  if (G.touch) { document.body.classList.add('touch'); G.settings.autoLoot = true; }
  G.input = input;
  G.controls = controls;
  G.game = game;
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  initInput(G.canvas);
  initSpectate(); // taps that catch critters / aim SMITE without moving the hero (game/spectate.js)
  UI.init();
  UI.vendor = Vendor;
  UI.stash = Stash;
  UI.reliquary = Reliquary;
  UI.heresies = Heresies; UI.rifts = Rifts; UI.marks = Marks; // the Endgame's panels (docs/ENDGAME.md)
  window.addEventListener('error', (e) => reportError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
  let bgHeartbeat = null;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (G.char) game.autosave();
      if (G.mode === 'game' && G.room && !bgHeartbeat) {
        let bgLast = performance.now();
        bgHeartbeat = setInterval(() => {
          if (!G.room || G.mode !== 'game' || !G.world) {
            clearInterval(bgHeartbeat);
            bgHeartbeat = null;
            return;
          }
          const bNow = performance.now();
          const bDt = Math.min(0.1, (bNow - bgLast) / 1000);
          bgLast = bNow;
          try { game.update(bDt); } catch (e) {}
        }, 100);
      }
    } else {
      if (bgHeartbeat) {
        clearInterval(bgHeartbeat);
        bgHeartbeat = null;
      }
      last = performance.now();
      dropBakes();
      if (G.room && G.world && typeof net !== 'undefined' && net.connected && G.world.kind === 'dungeon') {
        net.requestDungeonState(G.world.depth);
      }
    }
  });
  G.canvas.addEventListener('contextrestored', dropBakes); // a GPU reset wiped the baked floors (game/render.js)
  requestAnimationFrame(loop);
  startTicker();
  try {
    // the title song downloads in full alongside the art, so on mobile its intro never waits on the network
    let pa = 0, ps = 0;
    const show = () => { const p = pa * 0.8 + ps * 0.2; $('#loading-text').textContent = `Summoning the depths… ${Math.round(p * 100)}%`; $('#loading-fill').style.width = `${(p * 100).toFixed(1)}%`; };
    await Promise.all([loadAssets((p) => { pa = p; show(); }), preloadSong(TITLE_SONG, (p) => { ps = p; show(); }).then(() => { ps = 1; show(); })]);
  } catch (e) {
    $('#loading-text').innerHTML = `Could not load game assets.<br><small>${e.message}</small><br><small>If you opened index.html directly from disk, serve the folder over http instead (see README).</small>`;
    return;
  }
  HUD.init();
  if (G.touch) TouchUI.init();
  applyVolumes();
  $('#loading').classList.add('hidden');
  titleScreen();
  Cloud.start(); // a device signed in to Google picks its session back up and syncs (game/cloud.js)
  // prefetch monster art while the player is on the title screen; then redraw skill icons that show summon art
  const redrawIcons = () => {
    for (const s of [...HUD.slots, ...(TouchUI.btns || [])]) s.last.icon = s.last.id = undefined;
    if (G.char) HUD.refreshStatic();
  };
  loadEnemyArt().then(redrawIcons).then(loadPetArt).then(redrawIcons).catch((e) => console.warn(e));
  // debug helpers for testing in the console
  window.UI = UI;
  window.VELSCOUR = { G, game, UI };
}

boot();
