// Full-screen menus: title, class select, hero save slots, death, victory, settings, help.
import { G, saveSettings } from '../state.js';
import { camera } from '../core/view.js';
import { el, escapeHtml, fmtInt } from '../core/util.js';
import { sfx, applyVolumes, initAudio } from '../core/audio.js';
import { CLASS_IDS, A } from '../core/assets.js';
import { CLASSES, ATTRS } from '../data/classes.js';
import { UI, $ } from './ui.js';
import { listSaves, heroesByClass, deleteClassSaves, classSaves, writeSave, savesReadable, unreadableSaves } from '../game/save.js';
import { backupHeroes, listBackups } from '../game/herobackup.js';
import { heroCanvas, excitable, preloadPortraits } from './heroanim.js';
import { savedGearPreview } from '../core/gearart.js';
import { attachTitleFx } from './titlefx.js';
import { creditsScreen } from './credits.js';
import { RARITY } from '../data/items.js';
import { FILTER_ROWS, lootFilter } from '../game/lootfilter.js';
import { Cloud } from '../game/cloud.js';
import { initTitleUpdater, checkForUpdates, showUpdateDialog, CLIENT_VERSION, getClientVersion, hardReload } from './updater.js';
export { hardReload };

let current = null;

/** On phones, hide the browser chrome and prefer landscape (where supported). */
function goFullscreen() {
  if (!G.touch || document.fullscreenElement) return;
  const de = document.documentElement;
  const req = de.requestFullscreen || de.webkitRequestFullscreen;
  if (!req) return;
  try { const p = req.call(de, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed - fine */ }
}
function show(node) {
  hide();
  current = node;
  UI.screensEl.appendChild(node);
}
export function hide() { if (current) { current.remove(); current = null; } }

export function titleScreen() {
  G.mode = 'title';
  const s = el('div', 'screen');
  s.classList.add('title-screen');
  s.innerHTML = `<img class="title-logo intro" src="assets/ui/logo.webp" alt="VELSCOUR"><div class="title-tag">A world built upon something that should have stayed dead.</div>`;

  // Update button in top right corner - ONLY shown when an update is available from server
  const updateBtn = el('button', 'title-update-btn hidden');
  updateBtn.id = 'title-update-btn';
  updateBtn.dataset.legacyId = 'title-reload-btn';
  updateBtn.title = 'New Client Update Available';
  updateBtn.setAttribute('aria-label', 'New Client Update Available');
  updateBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
    <span class="title-update-label">Update Available</span>
  `;
  s.appendChild(updateBtn);
  initTitleUpdater(updateBtn);

  const menu = el('div', 'title-menu');
  const add = (label, fn, cls = 'btn big') => { const b = el('button', cls, label); b.onclick = () => { if (!s.classList.contains('title-ready')) return; initAudio(); sfx('ui'); goFullscreen(); fn(); }; menu.appendChild(b); return b; };
  // rebuilt when the cloud brings heroes in while the title is up
  const fill = () => {
    menu.textContent = '';
    const last = listSaves()[0];
    const used = Object.keys(heroesByClass()).length;
    if (last) add(`Continue<br><span style="font-size:13px;color:#a8977c">${escapeHtml(last.name)} · Lv ${last.level} ${CLASSES[last.classId].name} · Depth ${last.depth}</span>`, async () => {
      await Cloud.settle();
      const c = listSaves()[0];
      if (c) gameModeScreen(c, false, titleScreen);
    });
    add(`Heroes <span style="font-size:13px;color:#a8977c">· ${used}/${CLASS_IDS.length}</span>`, () => classSelect(last ? last.classId : 'paladin'));
    add('Settings', settingsDialog, 'btn');
    add('Credits', () => creditsScreen(titleScreen), 'btn');
    add('How to Play', helpDialog, 'btn');
  };
  fill();
  s.refresh = fill;
  s.appendChild(menu);
  const foot = el('div', 'title-foot');
  s.appendChild(foot);
  s.cloudFoot = () => { foot.textContent = 'Rough draft · placeholder art · ' + cloudLine(); };
  s.cloudFoot();
  const gate = el('div', 'title-gate', G.touch ? 'Tap to awaken' : 'Click to awaken');
  s.appendChild(gate);
  show(s);
  attachTitleFx(s, s.querySelector('.title-logo'), { tag: s.querySelector('.title-tag'), menu, gate });
  Cloud.flush();
  Cloud.sync();
  if (Cloud.conflicts.size) conflictDialogs();
  if (!unreadableNoted && !savesReadable()) {
    unreadableNoted = true;
    UI.dialog({ title: 'Saved heroes unreadable', html: `<p>The heroes saved in this browser could not be read. VELSCOUR will not write over them: before anything new is saved, the old data is set aside.</p><p class="dim">Settings &gt; Hero backups can download it, so it can be recovered.${Cloud.signedIn ? ' Heroes in your Google cloud save come back on their own once the next save is made.' : ''}</p>`, buttons: [{ label: 'OK' }] });
  }
}
let unreadableNoted = false;
if (typeof addEventListener === 'function') addEventListener('velscour-save-blocked', () => {
  UI.dialog({ title: 'Not saving', html: '<p>The heroes saved in this browser could not be read, and there was no room to set them aside, so the game is not saving over them. Free some browser storage (or use another browser) and reload.</p>', buttons: [{ label: 'OK' }] });
});

// ------------------------------------------------------------ cloud saves (game/cloud.js)
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return !t ? 'never' : m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
function cloudLine() {
  if (!Cloud.signedIn) return 'progress saves in this browser';
  return { loading: 'connecting to Google…', syncing: 'syncing with Google…', ok: 'saves sync with your Google account', conflict: 'a hero needs a choice of copies', offline: 'offline: saving in this browser', error: 'cloud save problem (see Settings)' }[Cloud.status] || 'saves sync with your Google account';
}
const heroLine = (h, cls) => h
  ? `<b>${escapeHtml(h.name)}</b><br>Level ${h.level} · Depth ${h.depth} · ${fmtInt(h.gold || 0)} gold<br><span class="dim">played ${ago(h.lastPlayed)}</span>`
  : `<span class="dim">No ${CLASSES[cls] ? CLASSES[cls].name : 'hero'} (deleted)</span>`;
let asking = false;
/** Both this device and the cloud changed a class's hero since they last synced: the player keeps one of them. */
export function conflictDialogs(onDone) {
  if (asking) return;
  const c = [...Cloud.conflicts.values()].find((x) => !x.later && !(G.mode === 'game' && G.char && G.char.classId === x.cls));
  if (!c) { onDone && onDone(); return; }
  asking = true;
  const name = CLASSES[c.cls] ? CLASSES[c.cls].name : c.cls;
  const html = `<p>Your ${name} changed both here and on another device since they last synced. Which copy do you keep?</p>
    <div class="cloud-pick"><div><h3>This device</h3>${heroLine(c.local, c.cls)}</div><div><h3>Google cloud</h3>${heroLine(c.cloud, c.cls)}</div></div>
    <p class="dim" style="font-size:12px">The other copy is replaced. Later keeps both apart for now (this hero won't sync until you choose).</p>`;
  const next = () => { asking = false; setTimeout(() => conflictDialogs(onDone), 0); };
  UI.dialog({
    title: 'Two copies of a hero', html, closable: false, cls: 'cloud-conflict',
    buttons: [
      { label: 'Later', fn: () => { c.later = true; next(); } },
      { label: 'Keep this device', fn: () => Cloud.resolve(c.cls, 'local').then(next) },
      { label: 'Keep the cloud', cls: 'red', fn: () => Cloud.resolve(c.cls, 'cloud').then(next) },
    ],
  });
}
Cloud.on((what) => {
  if (what === 'change' && current && current.refresh) current.refresh();
  if (what === 'status' && current && current.cloudFoot) current.cloudFoot();
  if (what === 'status' && cloudRow) cloudRow();
  if (what !== 'conflict') return;
  if (G.mode !== 'game') { conflictDialogs(); return; }
  const cls = G.char && G.char.classId;
  if (Cloud.conflicts.has(cls) && Cloud.warnOnce(cls)) UI.log(`This hero was also played on another device. Its cloud save is paused: you will choose which copy to keep on the title screen.`, '#ffb060');
});

const WHY = { cloud: 'replaced by the cloud copy', deleted: 'deleted on another device', cloudcopy: 'cloud copy, replaced by this device', restore: 'replaced by a restored backup' };
/** Settings > Hero backups: every hero cloud sync replaced or deleted, newest first; Restore puts one back. */
export function backupsDialog() {
  const d = UI.dialog({ title: 'Hero Backups', html: '<p class="dim">Loading…</p>', buttons: [{ label: 'Done' }], cls: 'backups-dialog' });
  const body = d.box.querySelector('.dlg-body');
  Promise.all([listBackups().catch(() => null), unreadableSaves()]).then(([list, raws]) => {
    if (!d.box.isConnected) return;
    if (!list && !raws.length) { body.innerHTML = '<p>Backups can\'t be opened in this browser.</p>'; return; }
    list = list || [];
    if (!list.length && !raws.length) { body.innerHTML = '<p>No backups yet. Whenever cloud sync replaces or deletes a hero on this device, the old one is kept here.</p>'; return; }
    body.innerHTML = `<p class="dim" style="font-size:12px">${G.mode === 'game' ? 'Return to the title screen to restore a hero.' : 'Restoring makes that copy the class\'s hero; the one it replaces is backed up too.'}</p><div class="backup-list"></div>`;
    const box = body.querySelector('.backup-list');
    for (const r of raws) {   // unreadable save data set aside by save.js: download it for recovery
      const row = el('div', 'backup-row', `<span><b>Unreadable saved heroes</b> · ${fmtInt(Math.ceil(r.text.length / 1024))} KB<br><span class="dim">set aside before a new save · ${new Date(r.at).toLocaleString()}</span></span>`);
      const btn = el('button', 'btn small', 'Download');
      btn.onclick = () => {
        sfx('ui');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([r.text], { type: 'application/json' }));
        a.download = `velscour-unreadable-saves-${new Date(r.at).toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      };
      row.appendChild(btn);
      box.appendChild(row);
    }
    for (const b of list) {
      const h = b.hero, C = CLASSES[b.cls];
      const row = el('div', 'backup-row', `<span><b>${escapeHtml(h.name)}</b> · ${C ? C.name : escapeHtml(b.cls)} · Lv ${h.level} · Depth ${h.depth} · ${fmtInt(h.gold || 0)} gold<br><span class="dim">${WHY[b.why] || escapeHtml(b.why)} · ${new Date(b.at).toLocaleString()}</span></span>`);
      const btn = el('button', 'btn small', 'Restore');
      btn.disabled = G.mode === 'game';
      btn.onclick = () => {
        sfx('ui');
        UI.confirm('Restore hero?', `Make this copy of ${escapeHtml(h.name)} (Level ${h.level}) your ${C ? C.name : 'hero'}? The current one is kept as a backup.`, async () => {
          try { await backupHeroes(classSaves(b.cls), 'restore'); } catch (e) { UI.dialog({ title: 'Hero Backups', html: '<p>Could not back up the current hero first, so nothing was restored.</p>', buttons: [{ label: 'OK' }] }); return; }
          writeSave(JSON.parse(JSON.stringify(h)));
          d.close();
          if (current && current.refresh) current.refresh();
          UI.dialog({ title: 'Hero Backups', html: `<p>${escapeHtml(h.name)} is restored.</p>`, buttons: [{ label: 'OK' }] });
        }, 'Restore');
      };
      row.appendChild(btn);
      box.appendChild(row);
    }
  }).catch((e) => { console.warn(e); if (d.box.isConnected) body.innerHTML = '<p>Backups can\'t be opened in this browser.</p>'; });
  return d;
}

let cloudRow = null;
/** Settings > Cloud save: sign in with Google, or the account, last sync, Sync now and Sign out. */
export function cloudDialog(onDone) {
  const u = Cloud.user;
  const html = `<p>Signed in with Google as <b>${escapeHtml(u.name || u.email)}</b>${u.name && u.email ? `<br><span class="dim">${escapeHtml(u.email)}</span>` : ''}</p>
    <p>Your heroes are saved in this browser and copied to your Google account, so you can play them on any device where you sign in.</p>
    <p class="dim" data-cloud-status></p>`;
  const d = UI.dialog({
    title: 'Cloud Save', html,
    buttons: [
      { label: 'Sign out', cls: 'red', fn: () => Cloud.signOut().then(() => onDone && onDone()) },
      { label: 'Sync now', keepOpen: true, fn: () => Cloud.sync(true).then(() => { stat(); if (Cloud.conflicts.size && G.mode !== 'game') conflictDialogs(); }) },
      { label: 'Done', fn: () => onDone && onDone() },
    ],
  });
  const stat = () => {
    const p = d.box.querySelector('[data-cloud-status]');
    if (p) p.textContent = (Cloud.error || ({ syncing: 'Syncing…', loading: 'Connecting…', conflict: 'A hero has two copies to choose from.' }[Cloud.status] || '')) + ` Last synced ${ago(Cloud.lastSync)}.`;
  };
  stat();
  Cloud.on((w) => { if (w === 'status' && d.box.isConnected) stat(); });
  return d;
}
const cloudErr = (e) => {
  const c = String(e && e.code || '');
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return '';
  if (c === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site, then try again.';
  if (c === 'auth/unauthorized-domain') return 'Google sign-in is not set up for this web address yet.';
  if (c === 'auth/network-request-failed' || !navigator.onLine) return 'Could not reach Google. Check your connection and try again.';
  return 'Google sign-in failed: ' + escapeHtml(String(e && (e.message || e)));
};

const plaque = (name) => `<div class="plaque"><span>${escapeHtml(name)}</span></div>`;

/** Hero select: one hero per class. A class with a hero plays it; an empty class names and starts a new one.
 * Delete arms delete mode: the next class picked with a hero is deleted (after a confirm), freeing that class. */
export function classSelect(sel = 'paladin', back = titleScreen) {
  const heroes = heroesByClass();
  let delMode = false;
  preloadPortraits(CLASS_IDS);
  const s = el('div', 'screen class-screen');
  s.appendChild(el('h2', 'screen-title', `CHOOSE YOUR HERO <small>${Object.keys(heroes).length} of ${CLASS_IDS.length} heroes</small>`));
  const grid = el('div', 'class-grid');
  const info = el('div', 'class-info');
  const bigBox = el('div', 'class-big');
  const big = heroCanvas(sel, 'hero-cv');
  bigBox.appendChild(big.canvas);
  excitable(bigBox, big);
  const text = el('div', 'class-text');
  info.append(bigBox, text);
  const cards = {};
  const showSavedGear = (id, anim) => {
    const h = heroes[id];
    if (!h || !h.equip) return;
    savedGearPreview(id, h.equip.body, h.equip.head).then(art => {
      if (!art || !s.isConnected || anim.id !== id) return;
      anim.setArt(art);
      anim.canvas.dataset.gearPreview = 'ready';
    });
  };
  const row = el('div', 'row');
  const name = el('input', 'name-input');
  const go = el('button', 'btn big', 'Begin');
  const delBtn = el('button', 'btn red', 'Delete');
  const renderInfo = () => {
    const C = CLASSES[sel], h = heroes[sel];
    big.setId(sel);
    showSavedGear(sel, big);
    const slots = { weapon: 'Weapon', offhand: 'Offhand', body: 'Armor', head: 'Helm', hands: 'Gloves', legs: 'Legs', feet: 'Boots', ring1: 'Ring I', ring2: 'Ring II', ring3: 'Ring III', ring4: 'Ring IV' };
    const gear = h && h.equip ? Object.entries(slots).filter(([slot]) => h.equip[slot])
      .map(([slot, label]) => '<span><b>' + label + ':</b> ' + escapeHtml(h.equip[slot].name || h.equip[slot].base || 'Equipped') + '</span>').join('') : '';
    text.innerHTML = (h ? `<h2>${escapeHtml(h.name)}</h2><p><b style="color:#ffd34a">Level ${h.level} ${C.name}</b> · Depth ${h.depth} · Deepest ${h.deepest || 0} · ${fmtInt(h.gold)} gold</p>` : `<h2>${C.name}</h2>`) +
      `<p>${escapeHtml(C.desc)}</p><p class="dim">Skill trees: <b style="color:#e9dcc4">${C.trees.join(' · ')}</b><br>Primary attribute: <b style="color:#ffd34a">${ATTRS[C.primary].name}</b> · Life ${C.life} · Mana ${C.mana}</p>` +
      (gear ? '<div class="class-gear-summary" aria-label="Saved equipped gear">' + gear + '</div>' : '');
    for (const id in cards) cards[id].classList.toggle('sel', id === sel);
    name.style.display = h ? 'none' : '';
    go.innerHTML = h ? 'Play' : 'Begin';
    s.classList.toggle('del-mode', delMode);
    delBtn.innerHTML = delMode ? 'Cancel' : 'Delete';
  };
  const delHero = (id) => {
    delMode = false;
    renderInfo();
    UI.confirm('Delete hero?', `Permanently delete ${escapeHtml(heroes[id].name)}, the ${CLASSES[id].name}? You can then start a new ${CLASSES[id].name}.`, () => { deleteClassSaves(id); classSelect(id, back); }, 'Delete');
  };
  for (const id of CLASS_IDS) {
    const card = el('div', 'class-card' + (heroes[id] ? ' has-hero' : ''));
    const anim = heroCanvas(id);
    card.appendChild(anim.canvas);
    showSavedGear(id, anim);
    const h = heroes[id];
    if (h) card.insertAdjacentHTML('beforeend', `<div class="card-lv">Lv ${h.level}</div>`);
    card.insertAdjacentHTML('beforeend', plaque(h ? h.name : CLASSES[id].name));
    card.dataset.id = id;
    excitable(card, anim);
    card.onclick = () => {
      if (delMode && heroes[id]) { sfx('ui'); delHero(id); return; }
      if (sel !== id) { sel = id; sfx('ui'); renderInfo(); } anim.burst(1.2); big.burst(1.4);
    };
    card.ondblclick = () => { if (!delMode) start(); };
    grid.appendChild(card);
    cards[id] = card;
  }
  s.appendChild(grid);
  s.appendChild(info);
  row.style.justifyContent = 'center';
  row.style.margin = '6px 0 14px';
  name.placeholder = 'Hero name';
  name.maxLength = 18;
  const backBtn = el('button', 'btn', 'Back');
  backBtn.onclick = () => { sfx('ui'); back(); };
  delBtn.onclick = () => {
    sfx('ui');
    if (!Object.keys(heroes).length) return;
    if (!delMode && heroes[sel]) { delHero(sel); return; }
    delMode = !delMode;
    renderInfo();
  };
  const start = async () => {
    sfx('ui');
    await Cloud.settle();
    const h = heroesByClass()[sel];   // fresh: the cloud may have brought this class's hero in
    if (h) gameModeScreen(h, false, () => classSelect(sel, back));
    else gameModeScreen({ classId: sel, name: name.value.trim() || CLASSES[sel].name }, true, () => classSelect(sel, back));
  };
  go.onclick = start;
  name.onkeydown = (e) => { if (e.key === 'Enter') start(); };
  row.append(backBtn, delBtn, name, go);
  s.appendChild(row);
  renderInfo();
  show(s);
  s.refresh = () => classSelect(sel, back);
}

/** Game mode select screen: choose between Single Player (offline/solo) and Online (Diablo II Battle.net tavern lobby). */
export function gameModeScreen(charInfo, fresh = false, onBack = () => {}) {
  const C = CLASSES[charInfo.classId] || { name: 'Hero' };
  const s = el('div', 'screen gamemode-screen');

  // Hero plaque / summary at the top
  const heroBox = el('div', 'gamemode-hero');
  const anim = heroCanvas(charInfo.classId, 'gamemode-hero-cv');
  heroBox.appendChild(anim.canvas);
  excitable(heroBox, anim);
  if (charInfo.equip) {
    savedGearPreview(charInfo.classId, charInfo.equip.body, charInfo.equip.head).then(art => {
      if (art && s.isConnected) anim.setArt(art);
    });
  }

  const heroInfo = el('div', 'gamemode-hero-info');
  heroInfo.innerHTML = `
    <h2 class="gamemode-hero-name">${escapeHtml(charInfo.name || C.name)}</h2>
    <div class="gamemode-hero-stats">
      <span class="gamemode-class">Level ${charInfo.level || 1} ${escapeHtml(C.name)}</span>
      <span class="gamemode-dot">·</span>
      <span class="gamemode-depth">Depth ${charInfo.depth || 1}</span>
      <span class="gamemode-dot">·</span>
      <span class="gamemode-gold">${fmtInt(charInfo.gold || 0)} Gold</span>
    </div>
  `;
  heroBox.appendChild(heroInfo);
  s.appendChild(heroBox);

  s.appendChild(el('h1', 'gamemode-title', 'CHOOSE GAME MODE'));
  s.appendChild(el('p', 'gamemode-subtitle', 'Select your path into the depths of Velscour'));

  const grid = el('div', 'gamemode-grid');

  // Single Player Card
  const spCard = el('div', 'gamemode-card gamemode-card-sp');
  spCard.setAttribute('tabindex', '0');
  spCard.setAttribute('role', 'button');
  spCard.setAttribute('aria-label', 'Play Single Player');
  spCard.innerHTML = `
    <div class="gamemode-card-glow"></div>
    <div class="gamemode-card-icon-wrap">
      <svg class="gamemode-card-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.5 17.5L3 6V3h3l11.5 11.5"/>
        <path d="m13 19 6-6"/>
        <path d="M16 16l4 4"/>
        <path d="M19 21l2-2"/>
      </svg>
    </div>
    <h3 class="gamemode-card-name">SINGLE PLAYER</h3>
    <div class="gamemode-card-tag">SOLO EXPEDITION</div>
    <p class="gamemode-card-desc">Venture into the abyss in a private world. Disconnected from multiplayer servers, with no lobby chat, whispers, or remote players.</p>
    <button class="btn big gamemode-action-btn">Enter World</button>
  `;
  const launchSP = () => {
    sfx('ui');
    G.game.startSinglePlayer(charInfo, fresh);
  };
  spCard.onclick = launchSP;
  spCard.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchSP(); } };
  grid.appendChild(spCard);

  // Online Multiplayer Card
  const mpCard = el('div', 'gamemode-card gamemode-card-mp');
  mpCard.setAttribute('tabindex', '0');
  mpCard.setAttribute('role', 'button');
  mpCard.setAttribute('aria-label', 'Enter Online Multiplayer');
  mpCard.innerHTML = `
    <div class="gamemode-card-glow"></div>
    <div class="gamemode-card-icon-wrap">
      <svg class="gamemode-card-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
        <path d="M2 12h20"/>
      </svg>
    </div>
    <h3 class="gamemode-card-name">ONLINE MULTIPLAYER</h3>
    <div class="gamemode-card-tag">BATTLE.NET LOBBY</div>
    <p class="gamemode-card-desc">Enter the tavern lobby to socialize, whisper other adventurers, and create or join cooperative party rooms.</p>
    <button class="btn big gamemode-action-btn gamemode-btn-online">Enter Lobby</button>
  `;
  const launchMP = () => {
    sfx('ui');
    G.game.selectAndEnterLobby(charInfo, fresh, () => gameModeScreen(charInfo, fresh, onBack));
  };
  mpCard.onclick = launchMP;
  mpCard.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launchMP(); } };
  grid.appendChild(mpCard);

  s.appendChild(grid);

  const row = el('div', 'gamemode-bottom-row');
  const backBtn = el('button', 'btn', 'Back');
  backBtn.onclick = () => {
    sfx('ui');
    onBack();
  };
  row.appendChild(backBtn);
  s.appendChild(row);

  const escHandler = (e) => {
    if (e.key === 'Escape' && s.isConnected) {
      window.removeEventListener('keydown', escHandler);
      sfx('ui');
      onBack();
    }
  };
  window.addEventListener('keydown', escHandler);

  show(s);
  s.refresh = () => gameModeScreen(charInfo, fresh, onBack);
}


/** o.where / o.note replace the "Depth N" line and the descent note (the Eternal Breach). */
export function deathScreen(depth, killer, onReturn, o = {}) {
  const s = el('div', 'screen');
  s.innerHTML = `<div class="death-title">YOU HAVE DIED</div><p style="font-size:18px">Slain ${o.where || `on Depth ${depth}`}${killer ? ` by <b style="color:#ff8060">${escapeHtml(killer)}</b>` : ''}.</p><p class="dim" style="max-width:520px;text-align:center;padding:0 12px">${o.note || `Your gear, levels and skills endure — but you must fight back down from Depth ${Math.max(1, Math.floor((depth - 1) / 5) * 5 - 4)}.`}</p>`;
  const b = el('button', 'btn big red', 'Return to Town');
  b.onclick = () => { sfx('ui'); hide(); onReturn(); };
  s.appendChild(b);
  show(s);
}

export function victoryScreen(onContinue) {
  const c = G.char;
  const s = el('div', 'screen');
  s.innerHTML = `<img class="title-logo" src="assets/ui/logo.webp" style="max-height:28vh"><div class="death-title" style="color:#ffb030;text-shadow:0 0 30px #f80">VELSCOUR HAS FALLEN</div>
  <p style="font-size:18px;text-align:center;max-width:620px;padding:0 12px">${escapeHtml(c.name)} the ${CLASSES[c.classId].name} has slain the Demon Lord at the bottom of the world.</p>
  <p class="dim">Level ${c.level} · ${fmtInt(c.kills || 0)} kills · ${c.deaths || 0} deaths</p>
  <p class="dim" style="text-align:center;max-width:560px">The abyss stirs still. Endless Torment depths beyond 500 now await the truly mad.</p>`;
  const b = el('button', 'btn big', 'Continue');
  b.onclick = () => { sfx('ui'); hide(); onContinue(); };
  s.appendChild(b);
  show(s);
}

export function settingsDialog() {
  const st = G.settings;
  const html = `<div class="settings-grid">
    <label>Game version</label><div style="display:flex;gap:8px;align-items:center;"><span style="color:#ffd860;font-family:var(--font-head);font-size:12px;font-weight:700;">v${getClientVersion()}</span><button class="btn small" data-check-update>Check for Updates</button></div>
    <label>Cloud save (Google account)</label><button class="btn small" data-cloud></button>
    <label>Hero backups</label><button class="btn small" data-backups>View</button>
    <label>Sound effects</label><input type="range" min="0" max="1" step="0.05" value="${st.sfx}" data-k="sfx">
    <label>Music</label><input type="range" min="0" max="1" step="0.05" value="${st.music}" data-k="music">
    <label>Ambience</label><input type="range" min="0" max="1" step="0.05" value="${st.amb ?? 0.5}" data-k="amb">
    <label>Camera zoom</label><input type="range" min="0.7" max="1.6" step="0.05" value="${st.zoom}" data-k="zoom">
    <label>Gore</label><select data-k="gore"><option value="0">Off</option><option value="1">Bloody</option><option value="2">Extreme</option></select>
    <label title="30 draws half the frames: smoother than a frame rate that keeps dipping, and a phone stays cooler (a hot phone slows itself down after a long session)">Frame rate cap</label><select data-k="fpsCap"><option value="0">None</option><option value="30">30 fps (cooler phone)</option></select>
    <label>Damage numbers</label><input type="checkbox" data-k="dmgNumbers" ${st.dmgNumbers ? 'checked' : ''}>
    <label>Screen shake</label><input type="checkbox" data-k="shake" ${st.shake ? 'checked' : ''}>
    <label title="The hero, monsters and pets keep a coloured outline over spells, walls and darkness (hidden only behind another creature)">See-through outlines</label><input type="checkbox" data-k="outlines" ${st.outlines !== false ? 'checked' : ''}>
    <label title="Off: a bar shows only for a moment over a monster you hit, and never over bosses">Life bars over every enemy (bosses too)</label><input type="checkbox" data-k="lifeBars" ${st.lifeBars !== false ? 'checked' : ''}>
    <label title="A line along the foot of the dungeon's walls, drawn over every spell (not over creatures)">Outline wall bases</label><input type="checkbox" data-k="wallLines" ${st.wallLines ? 'checked' : ''}>
    <label title="Off: a Sky Battle cut scene you have already watched once plays at 20x">Don't skip cutscenes</label><input type="checkbox" data-k="noSkipCine" ${st.noSkipCine ? 'checked' : ''}>
    <label>Hero stats plaque (Battle Ledger)</label><input type="checkbox" data-k="showHeroStats" ${st.showHeroStats !== false ? 'checked' : ''}>
    <label>Target info box</label><input type="checkbox" data-k="showTargetBox" ${st.showTargetBox !== false ? 'checked' : ''}>
    <label>Target portrait sprite</label><input type="checkbox" data-k="showTargetSprite" ${st.showTargetSprite !== false ? 'checked' : ''}>
    <label>Player chat bubbles</label><input type="checkbox" data-k="showChatBubbles" ${st.showChatBubbles !== false ? 'checked' : ''}>
    <label>Chat in side notifications</label><input type="checkbox" data-k="chatInSideLog" ${st.chatInSideLog !== false ? 'checked' : ''}>
    <label>Auto-pickup items</label><input type="checkbox" data-k="autoLoot" ${st.autoLoot ? 'checked' : ''}>
    <label>Loot filter (what auto-pickup and auto-play pick up)</label><button class="btn small" data-loot-filter>${lootFilter().on ? 'On' : 'Off'} · Set up</button>
    <label>Standard skill bar on mobile (landscape)</label><input type="checkbox" data-k="mobileSkillBar" ${st.mobileSkillBar !== false ? 'checked' : ''}>
    <label>Pause while menus open</label><input type="checkbox" data-k="pauseMenus" ${st.pauseMenus !== false ? 'checked' : ''}>
    <label>Show gold labels</label><input type="checkbox" data-k="showGoldLabels" ${st.showGoldLabels ? 'checked' : ''}>
    <label title="An icon per summoning skill next to the buffs, with how many of its minions are out">Minion counts with the buffs</label><input type="checkbox" data-k="minionCounts" ${st.minionCounts !== false ? 'checked' : ''}>
    <label>Hide dropped item names</label><input type="checkbox" data-k="hideItemNames" ${st.hideItemNames ? 'checked' : ''}>
    <label>Lock skill bar (auto-play only fills empty slots)</label><input type="checkbox" data-k="lockSkillBar" ${st.lockSkillBar ? 'checked' : ''}>
    <label>Auto skill point assignment (auto-play)</label><input type="checkbox" data-k="autoSkillPoints" ${st.autoSkillPoints !== false ? 'checked' : ''}>
    <label title="Off: auto-play leaves your attribute points (Strength, Dexterity, Vitality, Energy) for you to spend">Auto attribute point assignment (auto-play)</label><input type="checkbox" data-k="autoStatPoints" ${st.autoStatPoints !== false ? 'checked' : ''}>
    <label title="Off: auto-play never equips, sells, buys, stashes, sockets, upgrades or enchants gear; in town it only buys potions. A full bag doesn't stop it: it keeps playing and leaves new gear on the ground. Locked items (the lock in the item's panel) are never touched either way">Auto-play manages gear (equip, sell, buy, upgrade)</label><input type="checkbox" data-k="autoGear" ${st.autoGear !== false ? 'checked' : ''}>
  </div>`;
  const d = UI.dialog({ title: 'Settings', html, buttons: [{ label: 'Done', fn: () => { camera.computeZoom(); if (UI.hud) UI.hud.applyVisibilitySettings(); saveSettings(); } }] });
  d.box.querySelector('[data-k=gore]').value = String(st.gore);
  d.box.querySelector('[data-k=fpsCap]').value = String(st.fpsCap || 0);
  d.box.querySelector('[data-backups]').onclick = () => { sfx('ui'); backupsDialog(); };
  const ub = d.box.querySelector('[data-check-update]');
  if (ub) {
    ub.onclick = async () => {
      sfx('ui');
      ub.disabled = true;
      ub.textContent = 'Checking…';
      const info = await checkForUpdates({ force: true });
      ub.disabled = false;
      ub.textContent = 'Check for Updates';
      if (info && info.hasUpdate) {
        showUpdateDialog(info);
      } else {
        UI.dialog({
          title: 'Velscour Updater',
          html: `<p style="text-align:center;padding:12px 0;line-height:1.5;">You are running the latest version of Velscour (<strong>v${getClientVersion()}</strong>).</p>`,
          buttons: [{ label: 'OK' }]
        });
      }
    };
  }
  const cb = d.box.querySelector('[data-cloud]');
  cloudRow = () => {
    if (!cb.isConnected) { cloudRow = null; return; }
    const u = Cloud.user;
    cb.textContent = u ? `${u.name || u.email || 'Signed in'} · ${{ syncing: 'syncing…', loading: 'connecting…', offline: 'offline', error: 'problem', conflict: 'choose a copy' }[Cloud.status] || 'synced'}` : 'Sign in with Google';
  };
  cloudRow();
  // the SDK loads as the pointer reaches the button, so the popup can open inside the tap (only sign-ins load it)
  const warm = () => { if (!Cloud.signedIn) Cloud.preload().catch(() => {}); };
  cb.onpointerenter = cb.onpointerdown = cb.onfocus = warm;
  cb.onclick = () => {
    sfx('ui');
    if (Cloud.signedIn) { cloudDialog(() => cloudRow && cloudRow()); return; }
    cb.textContent = 'Signing in…';
    Cloud.signIn().then(() => {
      console.log('[Cloud] Sign in succeeded. Current user:', Cloud.user);
      if (cloudRow) cloudRow();
      if (G.mode !== 'game') conflictDialogs();
    }).catch((e) => {
      console.error('[Cloud] Sign in failed:', e);
      if (cloudRow) cloudRow();
      if (String(e && e.code) === 'auth/popup-blocked' && !cb.dataset.again) { cb.dataset.again = 1; cb.textContent = 'Tap again to sign in'; return; }
      const msg = cloudErr(e);
      if (msg) UI.dialog({ title: 'Cloud Save', html: `<p>${msg}</p>`, buttons: [{ label: 'OK' }] });
    });
  };
  const lf = d.box.querySelector('[data-loot-filter]');
  lf.onclick = () => { sfx('ui'); lootFilterDialog(() => { lf.textContent = `${lootFilter().on ? 'On' : 'Off'} · Set up`; }); };
  d.box.querySelectorAll('[data-k]').forEach((inp) => {
    inp.oninput = inp.onchange = () => {
      const k = inp.dataset.k;
      st[k] = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' ? Number(inp.value) : Number(inp.value);
      if (k === 'mobileSkillBar' && UI.hud) UI.hud.layoutMobile();
      if ((k === 'showHeroStats' || k === 'showTargetBox' || k === 'showTargetSprite') && UI.hud) UI.hud.applyVisibilitySettings();
      applyVolumes();
      saveSettings();
    };
  });
}

/** Settings > Loot filter: the lowest rarity of each item type auto-pickup grabs (game/lootfilter.js). */
export function lootFilterDialog(onDone) {
  const f = lootFilter();
  const hue = ['white', 'green', 'blue', 'purple', 'orange', 'red'];
  const opts = `<option value="-1">None</option>` + RARITY.map((r, i) => `<option value="${i}" style="color:${r.color}">${r.name}${i < RARITY.length - 1 ? ' or better' : ''} (${hue[i]})</option>`).join('');
  const html = `<div class="settings-grid">
    <label><b>Use the loot filter</b></label><input type="checkbox" data-f="on" ${f.on ? 'checked' : ''}>
    ${FILTER_ROWS.map((r) => `<label>${r.name}</label><select data-f="${r.k}">${opts}</select>`).join('')}
    <label>Gems (all of them)</label><input type="checkbox" data-f="gems" ${f.gems ? 'checked' : ''}>
    <label>Auto-play also picks up upgrades it will wear</label><input type="checkbox" data-f="upgrades" ${f.upgrades ? 'checked' : ''}>
    <label>Auto-play keeps what passes (stores it in the chest instead of selling it)</label><input type="checkbox" data-f="keep" ${f.keep ? 'checked' : ''}>
  </div><p class="dim" style="font-size:12px;max-width:520px">With the filter on, auto-play and walk-over pickup take only what passes. Clicking or tapping an item still picks it up, and sealed treasures always pass.</p>`;
  const d = UI.dialog({ title: 'Loot Filter', html, buttons: [{ label: 'Done', fn: () => { saveSettings(); onDone && onDone(); } }] });
  d.box.querySelectorAll('[data-f]').forEach((inp) => {
    if (inp.tagName === 'SELECT') inp.value = String(f[inp.dataset.f]);
    inp.onchange = () => { f[inp.dataset.f] = inp.type === 'checkbox' ? inp.checked : Number(inp.value); saveSettings(); onDone && onDone(); };
  });
  return d;
}

export function helpDialog() {
  const html = `<div class="help-keys">
    <div><b style="color:#ffe2a0">PC</b></div>
    <div><kbd>Left click</kbd> move / attack / pick up / talk</div>
    <div><kbd>Shift</kbd>+click attack in place</div>
    <div><kbd>W A S D</kbd> move directly</div>
    <div><kbd>Right click</kbd> right-click skill</div>
    <div><kbd>&#96;</kbd> <kbd>1</kbd>–<kbd>9</kbd> <kbd>0</kbd> <kbd>-</kbd> <kbd>=</kbd> cast skills at the cursor (13 keys + both mouse buttons)</div>
    <div><kbd>Z</kbd> <kbd>X</kbd> <kbd>C</kbd> <kbd>V</kbd> potions</div>
    <div><kbd>I</kbd> inventory · <kbd>K</kbd> skill tree · <kbd>B</kbd> skill book · <kbd>Q</kbd> quest log</div>
    <div><kbd>Tab</kbd>/<kbd>M</kbd> map · <kbd>Esc</kbd> menu · wheel zoom</div>
    <div><kbd>Alt</kbd>+<kbd>P</kbd> or the <b>Auto</b> button: auto-play (the hero fights, loots, shops and delves on autopilot)</div>
    <div><kbd>G</kbd> MADNESS · <kbd>F</kbd> SMITE, then click where it should strike (both fill as you fight)</div>
    <div><b style="color:#ffe2a0">While the hero plays</b></div>
    <div>Click or tap <b style="color:#ffd040">gilded critters</b> before they get away (follow the red arrows): each is worth a big sum of experience (a Golden Scarab, a pile of gold). Auto-play leaves them to you.</div>
    <div>Now and then an Epic or better drops <b style="color:#ffdf8a">sealed</b>: break the seals from the SEALED button or the inventory. Auto-play waits in town when the bag is full of what it can't sell, until a slot is free.</div>
    <div><b>Loot filter</b> (Settings): pick which weapons, off-hands, armor and rings (by rarity) and whether gems get picked up, by auto-play and by walking over them.</div>
    <div>Pick one of three portals down at each cleared exit (auto-play picks after 8 seconds). Set auto-play's stance, and pull the <b style="color:#ffc040">Greed</b> lever for tougher depths and richer drops; a death loses the Hoard.</div>
    <div><b style="color:#ffe2a0">Mobile</b></div>
    <div>Left thumb: virtual joystick</div>
    <div>Tap the world: move / attack / talk</div>
    <div>Right cluster: skills (hold to repeat, long-press to change; the &#8644; button flips to the second page of skills)</div>
    <div>Tap potions on the bar to drink</div>
    <div>Pinch with two fingers: zoom in and out</div>
    <div><b style="color:#ffe2a0">Goal</b></div>
    <div>Enter the portal in town. Find the exit of each depth — it is sealed until its guardian falls.</div>
    <div>Die and you restart a few depths back (the start of the previous five), keeping everything else.</div>
    <div>Reach Depth 500 and slay Demon Lord Velscour.</div>
    <div><b style="color:#ffe2a0">Growing stronger</b></div>
    <div><b>Rings</b> (four slots): each carries augments that change a skill, a kind of skill or every skill — burning or venomous hits, chain lightning, a storm tether to your orbiting weapons, meteors, extra projectiles and more. The Jeweler sells them; guardians drop them.</div>
    <div><b>Skill mastery</b>: every skill levels from 1 to 1000 as you use it and kill with it, growing stronger and its effects bigger.</div>
    <div><b>Gem Forge</b> (Gem Merchant): fuse three gems into the next grade, or refine one, up to Eternal.</div>
  </div>`;
  UI.dialog({ title: 'How to Play', html, buttons: [{ label: 'Got it' }] });
}

export function pauseMenu() {
  const d = UI.dialog({
    title: 'Paused',
    html: `<p class="dim">${escapeHtml(G.char.name)} · Level ${G.char.level} · Depth ${G.char.depth}</p>`,
    buttons: [
      { label: 'Resume' },
      { label: 'Settings', fn: settingsDialog },
      { label: 'How to Play', fn: helpDialog },
      { label: 'Save & Quit', cls: 'red', fn: () => G.game.quitToTitle() },
    ],
  });
  return d;
}

export { $, A };
