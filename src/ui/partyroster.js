// Party roster overlay displayed in the top-left HUD when the automap (Tab/M) is open
import { G } from '../state.js';
import { net } from '../net/network.js';
import { CLASSES } from '../data/classes.js';
import { escapeHtml, fmt } from '../core/util.js';

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

export function updateAutomapPartyRoster() {
  const rosterEl = document.getElementById('party-roster');
  if (!rosterEl) return;

  if (!G.showAutomap) {
    if (!rosterEl.classList.contains('hidden')) {
      rosterEl.classList.add('hidden');
    }
    return;
  }

  const players = getPartyPlayers();
  if (!players || players.length === 0) {
    if (!rosterEl.classList.contains('hidden')) {
      rosterEl.classList.add('hidden');
    }
    return;
  }

  if (rosterEl.classList.contains('hidden')) {
    rosterEl.classList.remove('hidden');
  }

  const countStr = `${players.length} / 4`;
  let html = `<div class="pr-header"><span>PARTY</span><span class="pr-count">${countStr}</span></div>`;

  for (const pl of players) {
    const hpPct = Math.max(0, Math.min(1, pl.hp / pl.maxHp));
    const pctClass = hpPct < 0.25 ? 'low' : hpPct < 0.5 ? 'mid' : 'high';
    const locText = pl.isDead
      ? '<span class="pr-tag dead">DEAD</span>'
      : `<span class="pr-tag">${escapeHtml(pl.location || 'Town')}</span>`;
    const nameStr = escapeHtml(pl.isMe ? `${pl.name} (You)` : pl.name);
    const classCol = pl.classColor || '#a8876a';
    const borderCol = pl.isMe ? '#ffd860' : classCol;

    html += `
      <div class="pr-member ${pl.isMe ? 'is-me' : ''}" style="border-left-color: ${borderCol}">
        <div class="pr-meta">
          <span class="pr-name" title="${nameStr}">${nameStr}</span>
          ${locText}
        </div>
        <div class="pr-bar-row">
          <div class="pr-bar">
            <div class="pr-fill ${pctClass}" style="width: ${Math.round(hpPct * 100)}%"></div>
          </div>
          <span class="pr-hp-text">${fmt(Math.max(0, pl.hp))}/${fmt(pl.maxHp)}</span>
        </div>
      </div>`;
  }

  rosterEl.innerHTML = html;
}

/** Legacy stub if called anywhere */
export function drawAutomapPartyRoster() {
  updateAutomapPartyRoster();
}
