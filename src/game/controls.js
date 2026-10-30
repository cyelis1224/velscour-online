// Translates raw input into hero actions.
import { G } from '../state.js';
import { input } from '../core/input.js';
import { camera, screenDirToTile } from '../core/view.js';
import { dist, angleTo, escapeHtml } from '../core/util.js';
import { SKILLS, skillRange, needsTarget } from '../data/skills.js';
import { SLOT_KEYS, RMB } from '../data/bar.js';
import { Macros } from './macros.js';

function creatureAt(sx, sy) {
  const w = G.world;
  let best = null, bd = Infinity;
  for (const c of w.creatures) {
    if (c.dead || !c.sbox || c.isPlayer || c.targetable === false) continue;
    const b = c.sbox;
    const pad = 6;
    if (sx >= b[0] - pad && sx <= b[2] + pad && sy >= b[1] - pad && sy <= b[3] + pad) {
      const d = Math.abs((b[0] + b[2]) / 2 - sx) + Math.abs(b[3] - sy) * 0.5 + (c.team === 'enemy' ? 0 : 50);
      if (d < bd) { bd = d; best = c; }
    }
  }
  return best;
}

function interactableAt(tx, ty, sx, sy) {
  const w = G.world;
  for (const n of w.npcs) {
    if (n.sbox) {
      const [x0, y0, x1, y1] = n.sbox;
      const [a, b] = camera.toScreen(x0, y0), [c, d] = camera.toScreen(x1, y1);
      if (sx >= a - 4 && sx <= c + 4 && sy >= b - 4 && sy <= d + 4) return n;
    }
  }
  for (const c of w.chests) if (!c.opened && dist(c.x, c.y, tx, ty) < 0.8) return c;
  for (const p of w.portals) if (dist(p.x, p.y, tx, ty) < 1.2 || (sy < camera.tileToScreen(p.x, p.y)[1] && sy > camera.tileToScreen(p.x, p.y, 80)[1] && Math.abs(sx - camera.tileToScreen(p.x, p.y)[0]) < 30 * camera.zoom)) return p;
  return null;
}

function lootAt(sx, sy) {
  for (const b of G.lootBoxes || []) if (Math.abs(sx - b.x) < b.w / 2 && Math.abs(sy - b.y) < b.h / 2) return b.loot;
  return null;
}

export const controls = {
  holdLeft: 0,

  /** Use the skill on bar slot i (keyboard / touch buttons). */
  useSlot(i, at) {
    const id = G.char.bar[i];
    if (id && SKILLS[id]) this.castSkill(SKILLS[id], at);
  },
  /** Cast a skill aimed the way the bar's keys aim (the mouse, or on touch the nearest foe); at: a tile to aim at.
   *  True if it went off (game/macros.js moves on to the next skill). */
  castSkill(sk, at) {
    const p = G.player;
    if (!p || p.dead || G.ui.modal || !sk) return false;
    let tx, ty, target = null;
    if (at) { [tx, ty] = at; target = G.hover && G.hover.team === 'enemy' ? G.hover : null; }
    else if (input.lastPointerType === 'mouse' && !G.touch) {
      [tx, ty] = camera.screenToTile(input.mouse.x, input.mouse.y);
      target = G.hover && G.hover.team !== 'player' ? G.hover : null;
    } else {
      // touch: auto-aim at the nearest visible enemy
      const range = Math.min(12, skillRange(sk) + 3);
      target = G.world.nearestHostile('player', p.x, p.y, needsTarget(sk) || sk.kind === 'nova' ? range : 8, true);
      if (target) { tx = target.x; ty = target.y; }
      else { tx = p.x + Math.cos(p.facing) * 4; ty = p.y + Math.sin(p.facing) * 4; }
      if (sk.kind === 'melee' && target && dist(p.x, p.y, target.x, target.y) > 7) target = null;
    }
    if (sk.kind === 'melee' && target && !at) return p.tryUseSkill(sk, target.x, target.y, target);
    return p.tryUseSkill(sk, tx, ty, null);
  },

  update(dt) {
    const p = G.player, w = G.world;
    if (!p || !w) return;
    const ui = G.ui;
    const blocked = ui.modal || (G.paused);
    // ---- hover
    const mouse = input.mouse;
    const useMouse = input.lastPointerType === 'mouse';
    G.hover = useMouse && mouse.inside ? creatureAt(mouse.x, mouse.y) : null;
    if (G.hover && G.hover.team === 'player') G.hover = null;
    if (p.dead || blocked) { p.moveVec = [0, 0]; input.endFrame(); return; }

    // ---- direct movement (WASD / joystick)
    let mx = 0, my = 0;
    if (!ui.anyOpen() || G.touch) {
      if (input.down('KeyW') || input.down('ArrowUp')) my -= 1;
      if (input.down('KeyS') || input.down('ArrowDown')) my += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) mx -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) mx += 1;
    }
    if (input.joy.active) { mx = input.joy.vx; my = input.joy.vy; }
    let mag = Math.hypot(mx, my);
    if (mag > 0.15) {
      let [tx, ty] = screenDirToTile(mx, my);
      const l = Math.hypot(tx, ty);
      const k = Math.min(1, mag) / (l || 1);
      p.moveVec = [tx * k, ty * k];
    } else p.moveVec = [0, 0];

    // ---- aim point for channels / whirlwind
    if (useMouse && mouse.inside) p.aim = camera.screenToTile(mouse.x, mouse.y);
    else if (input.worldTouch) p.aim = camera.screenToTile(input.worldTouch.x, input.worldTouch.y);
    else if (G.touch) {
      const t = w.nearestHostile('player', p.x, p.y, 10, true);
      p.aim = t ? [t.x, t.y] : [p.x + Math.cos(p.facing) * 4, p.y + Math.sin(p.facing) * 4];
    }

    // ---- mouse
    if (useMouse && !G.touch) {
      const [tx, ty] = camera.screenToTile(mouse.x, mouse.y);
      if (mouse.leftPressed) {
        this.holdLeft = 0;
        const loot = lootAt(mouse.x, mouse.y);
        const it = interactableAt(tx, ty, mouse.x, mouse.y);
        const shift = input.down('ShiftLeft') || input.down('ShiftRight');
        if (loot) { p.lootTarget = loot; p.interact = null; p.attackTarget = null; p.setMoveTarget(loot.x, loot.y); this.mode = 'loot'; }
        else if (G.hover && G.hover.team === 'enemy') { this.mode = 'attack'; this.attack(G.hover, tx, ty); }
        else if (it && !shift) { this.mode = 'interact'; p.attackTarget = null; p.interact = it; }
        else if (shift) { this.mode = 'attack'; this.useSlot(0, [tx, ty]); }
        else { this.mode = 'move'; p.attackTarget = null; p.interact = null; p.setMoveTarget(tx, ty); }
      } else if (mouse.left) {
        this.holdLeft += dt;
        if (this.mode === 'move' && this.holdLeft > 0.12) {
          if (G.hover && G.hover.team === 'enemy' && this.holdLeft > 0.4) { this.mode = 'attack'; }
          else if (!p.moveTarget || dist(p.moveTarget[0], p.moveTarget[1], tx, ty) > 0.6) p.setMoveTarget(tx, ty);
        } else if (this.mode === 'attack' && p.castLock <= 0 && !p.attackTarget) {
          if (G.hover && G.hover.team === 'enemy') this.attack(G.hover, tx, ty);
          else if (input.down('ShiftLeft') || input.down('ShiftRight')) this.useSlot(0, [tx, ty]);
          else this.useSlot(0, [tx, ty]);
        }
      }
      if (mouse.rightPressed || (mouse.right && p.castLock <= 0)) {
        const id = G.char.bar[RMB];
        if (id) { p.moveTarget = null; this.useSlotAt(RMB, tx, ty); }
      }
    }

    // ---- macros (their keys, the queue, Keep up), then number keys & potions
    Macros.tick(dt);
    SLOT_KEYS.forEach((k, i) => { if (k && (input.consume(k) || (input.down(k) && p.castLock <= 0))) this.useSlot(i); });
    if (input.consume('KeyZ')) p.usePotion('hp');
    if (input.consume('KeyX')) p.usePotion('mp');
    if (input.consume('KeyC')) p.usePotion('rejuv');
    if (input.consume('KeyV')) p.usePotion('fury');
    if (input.consume('Enter') && G.mode === 'game') {
      if (G.gameChat) {
        G.gameChat.focus();
      } else {
        import('../ui/chat.js').then(({ GameChat }) => {
          GameChat.init();
          GameChat.focus();
        });
      }
    }

    // ---- touch world taps
    const wt = input.worldTouch;
    if (wt) {
      const [tx, ty] = camera.screenToTile(wt.x, wt.y);
      if (wt.pressed) {
        const target = creatureAt(wt.x, wt.y) || w.nearestHostile('player', tx, ty, 1.2);
        const loot = lootAt(wt.x, wt.y);
        const it = interactableAt(tx, ty, wt.x, wt.y);
        if (loot) { p.lootTarget = loot; p.setMoveTarget(loot.x, loot.y); this.tmode = 'move'; }
        else if (target && target.team === 'enemy') { this.tmode = 'attack'; this.attack(target, tx, ty); }
        else if (it) { p.interact = it; this.tmode = 'none'; }
        else { p.attackTarget = null; p.interact = null; p.setMoveTarget(tx, ty); this.tmode = 'move'; }
      } else if (this.tmode === 'move') {
        if (!p.moveTarget || dist(p.moveTarget[0], p.moveTarget[1], tx, ty) > 0.8) p.setMoveTarget(tx, ty);
      } else if (this.tmode === 'attack' && p.castLock <= 0 && !p.attackTarget) {
        const t = w.nearestHostile('player', tx, ty, 2);
        if (t) this.attack(t, t.x, t.y);
      }
    }
    input.endFrame();
  },

  useSlotAt(i, tx, ty) {
    const id = G.char.bar[i];
    const sk = id && SKILLS[id];
    if (!sk) return;
    const target = G.hover && G.hover.team === 'enemy' ? G.hover : null;
    if (sk.kind === 'melee' && target) G.player.tryUseSkill(sk, target.x, target.y, target);
    else G.player.tryUseSkill(sk, tx, ty, null);
  },

  attack(target, tx, ty) {
    const p = G.player;
    const id = G.char.bar[0];
    const sk = id && SKILLS[id];
    p.interact = null; p.moveTarget = null; p.path = null;
    if (!sk) return;
    if (sk.kind === 'melee') p.tryUseSkill(sk, target.x, target.y, target);
    else p.tryUseSkill(sk, target ? target.x : tx, target ? target.y : ty, target);
    p.face(angleTo(p.x, p.y, target.x, target.y));
  },
};
