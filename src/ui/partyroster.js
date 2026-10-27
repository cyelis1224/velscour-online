// Party roster overlay displayed on the left-hand side when the automap (Tab) is open
import { G } from '../state.js';
import { net } from '../net/network.js';
import { CLASSES } from '../data/classes.js';

export function getPartyPlayers() {
  const players = [];
  const p = G.player;
  const myId = net.myId;

  // 1. Local Player
  if (p) {
    const classId = p.classId || G.char?.classId || 'paladin';
    const cls = CLASSES[classId] || CLASSES.paladin;
    players.push({
      id: myId || 'local',
      isMe: true,
      name: G.char?.name || p.name || 'Hero',
      level: G.char?.level || p.level || 1,
      classId,
      className: cls.name,
      classColor: cls.color || '#ffd860',
      hp: Math.max(0, p.hp),
      maxHp: Math.max(1, p.maxHp),
      mana: Math.max(0, p.mana),
      maxMana: Math.max(1, p.maxMana),
      isDead: !!p.dead || p.hp <= 0,
      location: G.world?.kind === 'town' ? 'Town' : `Depth ${G.world?.depth || 1}`,
    });
  }

  // 2. Room Players
  const room = G.room || net.currentRoom;
  const roomPlayerList = room?.players || [];
  const checkedIds = new Set();
  if (myId) checkedIds.add(myId);

  for (const rpInfo of roomPlayerList) {
    if (rpInfo.id === myId || checkedIds.has(rpInfo.id)) continue;
    checkedIds.add(rpInfo.id);
    const rp = G.remotePlayers?.get(rpInfo.id);
    const classId = (rp && rp.classId) || rpInfo.classId || 'paladin';
    const cls = CLASSES[classId] || CLASSES.paladin;
    const hp = rp ? rp.hp : (rpInfo.hp !== undefined ? rpInfo.hp : 100);
    const maxHp = rp ? rp.maxHp : (rpInfo.maxHp !== undefined ? rpInfo.maxHp : 100);
    players.push({
      id: rpInfo.id,
      isMe: false,
      name: rpInfo.name || (rp && rp.name) || 'Party Member',
      level: (rp && rp.level) || rpInfo.level || 1,
      classId,
      className: cls.name,
      classColor: cls.color || '#ffd860',
      hp: Math.max(0, hp),
      maxHp: Math.max(1, maxHp),
      mana: rp ? rp.mana : 50,
      maxMana: rp ? rp.maxMana : 50,
      isDead: rp ? (rp.dead || rp.hp <= 0) : false,
      location: rp ? (
        rp.worldKind === 'town'
          ? 'Town'
          : rp.worldKind === 'dungeon'
            ? `Depth ${rp.depth || 1}`
            : (G.world?.creatures?.includes(rp) ? (G.world?.kind === 'town' ? 'Town' : `Depth ${G.world?.depth || 1}`) : 'Town')
      ) : (rpInfo.location || 'Party'),
    });
  }

  // Any other remote players tracked in G.remotePlayers
  if (G.remotePlayers) {
    for (const [id, rp] of G.remotePlayers.entries()) {
      if (checkedIds.has(id)) continue;
      checkedIds.add(id);
      const classId = rp.classId || 'paladin';
      const cls = CLASSES[classId] || CLASSES.paladin;
      players.push({
        id,
        isMe: false,
        name: rp.name || 'Party Member',
        level: rp.level || 1,
        classId,
        className: cls.name,
        classColor: cls.color || '#ffd860',
        hp: Math.max(0, rp.hp),
        maxHp: Math.max(1, rp.maxHp),
        mana: rp.mana,
        maxMana: rp.maxMana,
        isDead: rp.dead || rp.hp <= 0,
        location: G.world?.kind === 'town' ? 'Town' : 'Depths',
      });
    }
  }

  return players;
}

export function drawAutomapPartyRoster(ctx, W, H) {
  const players = getPartyPlayers();
  if (!players || players.length === 0) return;

  const d = G.dpr || 1;

  // Responsive geometry
  const padX = Math.round(18 * d);
  const cardW = Math.round(Math.min(270 * d, Math.max(215 * d, W * 0.28)));
  const cardH = Math.round(62 * d);
  const gap = Math.round(8 * d);
  const headerH = Math.round(34 * d);

  const totalH = headerH + players.length * (cardH + gap) + Math.round(10 * d);
  const startX = padX;

  // Dynamically place below HUD hero-stats if visible
  const statsEl = document.getElementById('hero-stats');
  const statsVisible = statsEl && !statsEl.classList.contains('hidden') && statsEl.offsetHeight > 0;
  const topOffset = statsVisible ? Math.round((statsEl.getBoundingClientRect().bottom + 10) * d) : Math.round(56 * d);
  const startY = Math.min(topOffset, Math.max(10 * d, H - totalH - 20 * d));
  const pw = cardW + Math.round(18 * d);

  ctx.save();

  // --- Background Panel ---
  ctx.fillStyle = 'rgba(14, 11, 9, 0.90)';
  ctx.strokeStyle = '#8c7042';
  ctx.lineWidth = Math.max(1, 1.5 * d);

  const panelRadius = Math.round(6 * d);
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(startX, startY, pw, totalH, panelRadius);
  } else {
    ctx.rect(startX, startY, pw, totalH);
  }
  ctx.fill();
  ctx.stroke();

  // Corner filigree accents
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = Math.max(1, 1 * d);
  const clen = Math.round(7 * d);
  // Top-left
  ctx.beginPath(); ctx.moveTo(startX + 2 * d, startY + clen); ctx.lineTo(startX + 2 * d, startY + 2 * d); ctx.lineTo(startX + clen, startY + 2 * d); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(startX + pw - clen, startY + 2 * d); ctx.lineTo(startX + pw - 2 * d, startY + 2 * d); ctx.lineTo(startX + pw - 2 * d, startY + clen); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(startX + 2 * d, startY + totalH - clen); ctx.lineTo(startX + 2 * d, startY + totalH - 2 * d); ctx.lineTo(startX + clen, startY + totalH - 2 * d); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(startX + pw - clen, startY + totalH - 2 * d); ctx.lineTo(startX + pw - 2 * d, startY + totalH - 2 * d); ctx.lineTo(startX + pw - 2 * d, startY + totalH - clen); ctx.stroke();

  // --- Header ---
  const room = G.room || net.currentRoom;
  const roomName = room?.name ? room.name.toUpperCase() : 'PARTY MEMBERS';
  ctx.font = `bold ${Math.round(12 * d)}px "Cinzel", Georgia, serif`;
  ctx.fillStyle = '#ffd860';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(roomName, startX + Math.round(12 * d), startY + Math.round(17 * d));

  // Player count indicator
  ctx.font = `${Math.round(11 * d)}px "Alegreya Sans", sans-serif`;
  ctx.fillStyle = '#a89880';
  ctx.textAlign = 'right';
  ctx.fillText(`${players.length} / 4`, startX + pw - Math.round(12 * d), startY + Math.round(17 * d));

  // Header Divider
  ctx.strokeStyle = 'rgba(140, 112, 66, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX + Math.round(8 * d), startY + headerH - Math.round(3 * d));
  ctx.lineTo(startX + pw - Math.round(8 * d), startY + headerH - Math.round(3 * d));
  ctx.stroke();

  // --- Player Cards ---
  let curY = startY + headerH + Math.round(5 * d);
  const innerX = startX + Math.round(9 * d);

  for (const pl of players) {
    // Card background
    ctx.fillStyle = pl.isMe ? 'rgba(32, 24, 18, 0.92)' : 'rgba(22, 17, 14, 0.88)';
    ctx.strokeStyle = pl.isMe ? 'rgba(212, 175, 55, 0.55)' : 'rgba(90, 75, 55, 0.5)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(innerX, curY, cardW, cardH, Math.round(4 * d));
    } else {
      ctx.rect(innerX, curY, cardW, cardH);
    }
    ctx.fill();
    ctx.stroke();

    // Class Color Left Strip
    ctx.fillStyle = pl.classColor || '#ffd860';
    ctx.fillRect(innerX, curY, Math.round(3.5 * d), cardH);

    // Player Name
    ctx.font = `bold ${Math.round(12 * d)}px "Cinzel", Georgia, serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = pl.isMe ? '#ffffff' : '#e0eaf6';
    const nameStr = pl.isMe ? `${pl.name} (You)` : pl.name;
    ctx.fillText(nameStr, innerX + Math.round(9 * d), curY + Math.round(7 * d));

    // Class & Level
    ctx.font = `${Math.round(10.5 * d)}px "Alegreya Sans", sans-serif`;
    ctx.fillStyle = pl.classColor || '#a0b0c0';
    ctx.textAlign = 'left';
    ctx.fillText(`Lv. ${pl.level} ${pl.className}`, innerX + Math.round(9 * d), curY + Math.round(23 * d));

    // Dead / Location tag on right
    if (pl.isDead) {
      ctx.font = `bold ${Math.round(10 * d)}px "Cinzel", serif`;
      ctx.fillStyle = '#ff4030';
      ctx.textAlign = 'right';
      ctx.fillText('DEAD', innerX + cardW - Math.round(8 * d), curY + Math.round(8 * d));
    } else {
      ctx.font = `${Math.round(9.5 * d)}px "Alegreya Sans", sans-serif`;
      ctx.fillStyle = '#8c8070';
      ctx.textAlign = 'right';
      ctx.fillText(pl.location || 'Depths', innerX + cardW - Math.round(8 * d), curY + Math.round(8 * d));
    }

    // Health Bar Container
    const barX = innerX + Math.round(9 * d);
    const barY = curY + Math.round(40 * d);
    const barW = cardW - Math.round(18 * d);
    const barH = Math.round(14 * d);

    ctx.fillStyle = 'rgba(15, 6, 6, 0.95)';
    ctx.strokeStyle = 'rgba(70, 45, 30, 0.85)';
    ctx.lineWidth = 1;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeRect(barX, barY, barW, barH);

    // Health Bar Fill
    const hpPct = Math.max(0, Math.min(1, pl.hp / pl.maxHp));
    if (hpPct > 0) {
      const grad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
      if (hpPct < 0.25) {
        grad.addColorStop(0, '#ff4a30');
        grad.addColorStop(1, '#a81010');
      } else if (hpPct < 0.5) {
        grad.addColorStop(0, '#ffaa20');
        grad.addColorStop(1, '#c07010');
      } else {
        grad.addColorStop(0, '#3ae45a');
        grad.addColorStop(1, '#1b9830');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * hpPct), barH - 2);
    }

    // HP Text Overlay
    ctx.font = `bold ${Math.round(9.5 * d)}px "Alegreya Sans", sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hpText = `${Math.round(pl.hp)} / ${Math.round(pl.maxHp)}`;
    // Shadow
    ctx.fillText(hpText, barX + barW / 2 + 1, barY + barH / 2 + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(hpText, barX + barW / 2, barY + barH / 2);

    curY += cardH + gap;
  }

  ctx.restore();
}
