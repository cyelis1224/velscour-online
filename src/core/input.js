// Keyboard, mouse and touch input.
import { G, saveSettings } from '../state.js';
import { camera } from './view.js';
import { clamp } from './util.js';

const GAME_KEYS = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

export const input = {
  keys: new Set(),
  pressed: new Set(),
  alt: false,
  mouse: { x: 0, y: 0, left: false, right: false, leftPressed: false, rightPressed: false, inside: true },
  joy: { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, vx: 0, vy: 0 },
  worldTouch: null, // { id, x, y, pressed }
  lastPointerType: 'mouse',
  enabled: true,

  down(code) { return this.keys.has(code); },
  consume(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  },
  endFrame() {
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    if (this.worldTouch) this.worldTouch.pressed = false;
  },
  reset() {
    this.keys.clear(); this.pressed.clear();
    this.alt = false;
    this.mouse.left = this.mouse.right = false;
    this.endJoy();
    this.worldTouch = null;
  },
  endJoy() {
    this.joy.active = false; this.joy.id = -1; this.joy.vx = 0; this.joy.vy = 0;
    const base = document.getElementById('joy-base');
    if (base) base.classList.remove('on');
  },
};

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    input.alt = e.altKey;
    if (isTyping(e)) return;
    if ((GAME_KEYS.has(e.code) || (e.altKey && e.code === 'KeyP')) && G.mode === 'game') e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    input.alt = e.altKey;
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => input.reset());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => { if (G.mode === 'game') e.preventDefault(); });

  const base = document.getElementById('joy-base');
  const knob = document.getElementById('joy-knob');
  const JOY_R = 52;

  canvas.addEventListener('pointerdown', (e) => {
    input.lastPointerType = e.pointerType;
    // a spectator's tap (aiming SMITE, catching a critter: game/spectate.js) never moves the hero or stops auto-play
    if (G.tapHook && G.tapHook(e.clientX, e.clientY, e)) { e.preventDefault(); return; }
    if (e.pointerType === 'mouse') {
      input.mouse.x = e.clientX; input.mouse.y = e.clientY;
      if (e.button === 0) { input.mouse.left = true; input.mouse.leftPressed = true; }
      if (e.button === 2) { input.mouse.right = true; input.mouse.rightPressed = true; }
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return;
    }
    // touch / pen
    e.preventDefault();
    const leftZone = e.clientX < G.W * 0.42;
    if (leftZone && !input.joy.active) {
      const j = input.joy;
      j.active = true; j.id = e.pointerId; j.ox = e.clientX; j.oy = e.clientY; j.vx = 0; j.vy = 0;
      base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
      knob.style.transform = 'translate(0px,0px)';
      base.classList.add('on');
    } else if (!input.worldTouch) {
      input.worldTouch = { id: e.pointerId, x: e.clientX, y: e.clientY, pressed: true };
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }, { passive: false });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.inside = true;
      return;
    }
    const j = input.joy;
    if (j.active && e.pointerId === j.id) {
      let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
      const d = Math.hypot(dx, dy);
      if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
      j.vx = dx / JOY_R; j.vy = dy / JOY_R;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else if (input.worldTouch && input.worldTouch.id === e.pointerId) {
      input.worldTouch.x = e.clientX; input.worldTouch.y = e.clientY;
    }
  });

  const up = (e) => {
    if (e.pointerType === 'mouse') {
      if (e.button === 0) input.mouse.left = false;
      if (e.button === 2) input.mouse.right = false;
      return;
    }
    if (input.joy.active && e.pointerId === input.joy.id) input.endJoy();
    if (input.worldTouch && input.worldTouch.id === e.pointerId) input.worldTouch = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') input.mouse.inside = false; });
  let saveTimer = null;
  const debouncedSaveSettings = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; saveSettings(); }, 300);
  };

  const onWheel = (e) => {
    if (G.mode !== 'game') return;
    const target = e.target;
    // Don't zoom if scrolling inside interactive UI panels, dialogs, chat, or form controls
    if (target && target.closest && target.closest('.panel, .dialog-box, .screen, #chat-panel, #chat-box, #chat-history, select, textarea, input')) {
      return;
    }
    // Check if target or any ancestor is a scrollable container
    let el = target;
    while (el && el !== document.body && el !== document.documentElement && el !== canvas) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') return;
      }
      el = el.parentElement;
    }

    e.preventDefault();
    const dy = clamp(e.deltaMode === 1 ? e.deltaY * 33 : (e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY), -300, 300);
    const factor = Math.exp(-dy * 0.001);
    const current = G.settings.zoom || 1;
    const next = clamp(Math.round(current * factor * 100) / 100, 0.7, 1.6);
    if (Math.abs(next - current) > 0.001) {
      G.settings.zoom = next;
      camera.computeZoom();
      debouncedSaveSettings();
    }
  };
  window.addEventListener('wheel', onWheel, { passive: false });
}
