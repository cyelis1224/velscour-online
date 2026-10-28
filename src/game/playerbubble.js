import { G } from '../state.js';
import { clamp } from '../core/util.js';
import { camera } from '../core/view.js';

function isPlayerOnSameMap(p) {
  if (!p || !G.world) return false;
  if (p === G.player) return true;
  if (p.world === G.world && G.world.creatures && G.world.creatures.includes(p)) {
    return true;
  }
  const st = p._lastState;
  const remoteKind = st?.worldKind || p.worldKind || 'town';
  const myKind = G.world.kind || 'town';
  if (remoteKind !== myKind) return false;
  if (myKind === 'dungeon') {
    const remoteDepth = st?.depth ?? p.depth ?? 1;
    if (remoteDepth !== G.world.depth) return false;
  }
  return true;
}

function roundedPath(ctx, x0, y0, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.lineTo(x0 + w - r, y0);
  ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  ctx.lineTo(x0 + w, y0 + h - r);
  ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  ctx.lineTo(x0 + r, y0 + h);
  ctx.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  ctx.lineTo(x0, y0 + r);
  ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
  ctx.closePath();
}

function wrapSpeechText(ctx, text, maxLineWidth, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? current + ' ' + word : word;
    if (current && ctx.measureText(next).width > maxLineWidth) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    const lastIdx = maxLines - 1;
    while (lines[lastIdx].length && ctx.measureText(lines[lastIdx] + '…').width > maxLineWidth) {
      lines[lastIdx] = lines[lastIdx].slice(0, -1);
    }
    lines[lastIdx] += '…';
  }
  return lines;
}

function drawPointerArrow(ctx, edgeX, edgeY, tipX, tipY, nx, ny) {
  const px = -ny;
  const py = nx;
  const baseW = 8;

  // Dark shadow/outline
  ctx.fillStyle = '#19100d';
  ctx.beginPath();
  ctx.moveTo(edgeX - px * (baseW + 2), edgeY - py * (baseW + 2));
  ctx.lineTo(edgeX + px * (baseW + 2), edgeY + py * (baseW + 2));
  ctx.lineTo(tipX + nx * 2, tipY + ny * 2);
  ctx.closePath();
  ctx.fill();

  // Outer rim (#bb9360)
  ctx.fillStyle = '#bb9360';
  ctx.beginPath();
  ctx.moveTo(edgeX - px * (baseW + 0.5), edgeY - py * (baseW + 0.5));
  ctx.lineTo(edgeX + px * (baseW + 0.5), edgeY + py * (baseW + 0.5));
  ctx.lineTo(tipX + nx, tipY + ny);
  ctx.closePath();
  ctx.fill();

  // Paper fill (#f0dfbc)
  ctx.fillStyle = '#f0dfbc';
  ctx.beginPath();
  ctx.moveTo(edgeX - px * (baseW - 1.5), edgeY - py * (baseW - 1.5));
  ctx.lineTo(edgeX + px * (baseW - 1.5), edgeY + py * (baseW - 1.5));
  ctx.lineTo(tipX, tipY);
  ctx.closePath();
  ctx.fill();

  // Inner accent line (#7b573b)
  ctx.strokeStyle = '#7b573b';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(edgeX, edgeY);
  ctx.lineTo(tipX - nx * 2, tipY - ny * 2);
  ctx.stroke();
}

export function drawPlayerChatBubbles(ctx, world) {
  if (G.settings?.showChatBubbles === false) return;
  if (!world || !G.player) return;

  const speakers = [];
  if (G.player.chatBubble && G.player.chatTimer > 0) {
    speakers.push(G.player);
  }

  if (G.remotePlayers) {
    for (const rp of G.remotePlayers.values()) {
      if (rp.chatBubble && rp.chatTimer > 0 && isPlayerOnSameMap(rp)) {
        speakers.push(rp);
      }
    }
  }

  if (speakers.length === 0) return;

  ctx.save();
  // Scale to device pixel ratio so coordinates match CSS pixels (G.W, G.H)
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);

  const cw = G.W;
  const ch = G.H;
  const pad = 16;
  const bottomPad = 75; // Stay above orbs, hotkeys, potions
  const occupied = [];

  for (const p of speakers) {
    const age = p.chatAge || 0;
    const k = Math.min(1, age / 0.18);
    const fade = Math.min(1, (p.chatTimer || 0) / 0.35);
    const alpha = Math.min(k, fade);
    if (alpha <= 0.01) continue;

    const isSelf = (p === G.player);
    const speakerName = isSelf ? (G.char?.name || 'You') : (p.name || 'Hero');

    // Determine player head in screen space (CSS px)
    let headSx, headSy;
    if (p.sbox) {
      headSx = (p.sbox[0] + p.sbox[2]) / 2;
      headSy = p.sbox[1];
    } else {
      const [sx, sy] = camera.tileToScreen(p.x, p.y, (p.z || 0) + (p.fly ? 16 : 0));
      const h = p.viewH || 54;
      headSx = sx;
      headSy = sy - h * camera.zoom;
    }

    // Text wrapping and sizing
    ctx.font = '600 12px "Alegreya Sans", "Segoe UI", sans-serif';
    const lines = wrapSpeechText(ctx, p.chatBubble, 180, 3);
    if (!lines.length) continue;

    ctx.font = 'bold 10px Cinzel, Georgia, serif';
    const nameW = ctx.measureText(speakerName).width;

    ctx.font = '600 12px "Alegreya Sans", "Segoe UI", sans-serif';
    const textW = Math.max(50, ...lines.map(l => ctx.measureText(l).width));
    const contentW = Math.max(textW, nameW);
    const width = Math.min(210, Math.round(contentW + 24));
    const headerH = 14;
    const height = Math.round(headerH + lines.length * 15 + 13);
    const radius = 8;

    // Check if on-screen
    const isOnScreen = (
      headSx >= pad &&
      headSx <= cw - pad &&
      headSy >= pad + height + 16 &&
      headSy <= ch - bottomPad
    );

    let bx, by;
    let arrow = null;
    let tail = null;

    if (isOnScreen) {
      // Anchored overhead
      const idealBx = Math.round(headSx - width / 2);
      const idealBy = Math.round(headSy - height - 12 + (1 - k) * 6);
      bx = clamp(idealBx, pad, cw - pad - width);
      by = clamp(idealBy, pad, ch - bottomPad - height);

      // Overlap avoidance
      const intersects = (tx, ty) => occupied.some(([l, t, r, b]) =>
        tx < r + 4 && tx + width > l - 4 && ty < b + 4 && ty + height > t - 4
      );
      if (intersects(bx, by)) {
        const offsets = [[0, -height - 8], [32, -6], [-32, -6], [0, height + 8]];
        for (const [ox, oy] of offsets) {
          if (!intersects(bx + ox, by + oy) && by + oy >= pad && by + oy <= ch - bottomPad - height) {
            bx += ox; by += oy; break;
          }
        }
      }

      // Overhead downward tail
      const baseX = clamp(headSx, bx + 16, bx + width - 16);
      const bottom = by + height;
      const tipY = Math.max(bottom + 4, headSy - 2);
      tail = { baseX, bottom, tipY, headSx };
    } else {
      // Off-screen: anchor bubble to the screen edge in the direction of the player
      const cx = cw / 2;
      const cy = ch / 2;
      const minCx = pad + width / 2;
      const maxCx = cw - pad - width / 2;
      const minCy = pad + height / 2;
      const maxCy = ch - bottomPad - height / 2;

      const dx = headSx - cx;
      const dy = headSy - cy;
      const targetX = dx > 0 ? maxCx : minCx;
      const targetY = dy > 0 ? maxCy : minCy;
      const tX = Math.abs(dx) > 0.001 ? (targetX - cx) / dx : Infinity;
      const tY = Math.abs(dy) > 0.001 ? (targetY - cy) / dy : Infinity;
      const t = Math.min(tX > 0 ? tX : Infinity, tY > 0 ? tY : Infinity);

      let bcx = clamp(cx + dx * t, minCx, maxCx);
      let bcy = clamp(cy + dy * t, minCy, maxCy);
      bx = Math.round(bcx - width / 2);
      by = Math.round(bcy - height / 2);

      // Overlap avoidance for edge bubbles
      const intersects = (tx, ty) => occupied.some(([l, t, r, b]) =>
        tx < r + 4 && tx + width > l - 4 && ty < b + 4 && ty + height > t - 4
      );
      if (intersects(bx, by)) {
        const offsets = [[0, -height - 8], [0, height + 8], [-width - 8, 0], [width + 8, 0]];
        for (const [ox, oy] of offsets) {
          const nx = clamp(bx + ox, pad, cw - pad - width);
          const ny = clamp(by + oy, pad, ch - bottomPad - height);
          if (!intersects(nx, ny)) {
            bx = nx; by = ny;
            bcx = bx + width / 2; bcy = by + height / 2;
            break;
          }
        }
      }

      // Directional pointer arrow extending toward the off-screen player
      const ang = Math.atan2(headSy - bcy, headSx - bcx);
      const hw = width / 2;
      const hh = height / 2;
      const cosA = Math.cos(ang);
      const sinA = Math.sin(ang);
      const edgeK = Math.min(
        Math.abs(cosA) > 0.0001 ? hw / Math.abs(cosA) : Infinity,
        Math.abs(sinA) > 0.0001 ? hh / Math.abs(sinA) : Infinity
      );
      const edgeX = bcx + cosA * edgeK;
      const edgeY = bcy + sinA * edgeK;
      const tipX = edgeX + cosA * 13;
      const tipY = edgeY + sinA * 13;
      arrow = { edgeX, edgeY, tipX, tipY, nx: cosA, ny: sinA };
    }

    occupied.push([bx, by, bx + width, by + height]);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Soft parchment shadow
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#19100d';
    roundedPath(ctx, bx - 3, by - 3, width + 6, height + 6, radius + 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Parchment outer rim
    ctx.fillStyle = '#bb9360';
    roundedPath(ctx, bx - 1, by - 1, width + 2, height + 2, radius + 1);
    ctx.fill();

    // Parchment paper surface
    ctx.fillStyle = '#f0dfbc';
    roundedPath(ctx, bx + 1, by + 1, width - 2, height - 2, radius);
    ctx.fill();

    // Inner subtle border
    ctx.strokeStyle = '#7b573b';
    ctx.lineWidth = 0.9;
    roundedPath(ctx, bx + 3, by + 3, width - 6, height - 6, radius - 1);
    ctx.stroke();

    // Draw pointer arrow (off-screen) or overhead downward tail (on-screen)
    if (arrow) {
      drawPointerArrow(ctx, arrow.edgeX, arrow.edgeY, arrow.tipX, arrow.tipY, arrow.nx, arrow.ny);
    } else if (tail) {
      // Outer dark outline
      ctx.fillStyle = '#19100d';
      ctx.beginPath();
      ctx.moveTo(tail.baseX - 9, tail.bottom - 2);
      ctx.lineTo(tail.baseX + 9, tail.bottom - 2);
      ctx.lineTo(tail.headSx, tail.tipY + 1.5);
      ctx.closePath();
      ctx.fill();

      // Rim
      ctx.fillStyle = '#bb9360';
      ctx.beginPath();
      ctx.moveTo(tail.baseX - 7.5, tail.bottom - 2);
      ctx.lineTo(tail.baseX + 7.5, tail.bottom - 2);
      ctx.lineTo(tail.headSx, tail.tipY + 0.5);
      ctx.closePath();
      ctx.fill();

      // Paper
      ctx.fillStyle = '#f0dfbc';
      ctx.beginPath();
      ctx.moveTo(tail.baseX - 5.5, tail.bottom - 4);
      ctx.lineTo(tail.baseX + 5.5, tail.bottom - 4);
      ctx.lineTo(tail.headSx, tail.tipY - 1);
      ctx.closePath();
      ctx.fill();
    }

    // Speaker Name Header
    ctx.font = 'bold 10px Cinzel, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isSelf ? '#8a5525' : '#456ab3';
    ctx.fillText(speakerName, bx + width / 2, by + 11);

    // Separator line
    ctx.strokeStyle = 'rgba(123, 87, 59, 0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(bx + 14, by + 18);
    ctx.lineTo(bx + width - 14, by + 18);
    ctx.stroke();

    // Message text lines
    ctx.font = '600 12px "Alegreya Sans", "Segoe UI", sans-serif';
    ctx.fillStyle = '#2c1e13';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bx + width / 2, by + 28 + i * 15);
    }

    ctx.restore();
  }

  ctx.restore();
}
