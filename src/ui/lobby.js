// Diablo II Battle.net Style Lobby UI for VELSCOUR Online
import { G } from '../state.js';
import { el, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { UI, $ } from './ui.js';
import { heroCanvas, excitable } from './heroanim.js';
import { savedGearPreview } from '../core/gearart.js';
import { CLASSES } from '../data/classes.js';
import { BIOMES } from '../data/biomes.js';
import { shownEquip } from '../data/items.js';
import { net } from '../net/network.js';

let lobbyEl = null;
let activeLobbyListeners = null;

function detachLobbyListeners() {
  if (activeLobbyListeners) {
    net.off('chat', activeLobbyListeners.onChat);
    net.off('lobby_update', activeLobbyListeners.onLobbyUpdate);
    net.off('room_error', activeLobbyListeners.onRoomError);
    net.off('room_joined', activeLobbyListeners.onRoomJoined);
    net.off('connected', activeLobbyListeners.onConnected);
    net.off('disconnected', activeLobbyListeners.onDisconnected);
    if (activeLobbyListeners.onReconnecting) {
      net.off('reconnecting', activeLobbyListeners.onReconnecting);
    }
    activeLobbyListeners = null;
  }
}

export function openLobby(char, onBack) {
  detachLobbyListeners();
  if (lobbyEl) { lobbyEl.remove(); lobbyEl = null; }
  G.mode = 'lobby';

  // Connect network to server or simulated lobby
  net.connect(char);

  const s = el('div', 'screen', '');
  s.id = 'd2-lobby';
  lobbyEl = s;

  // ---------------------------------------------------------------- Top Header
  const header = el('div', 'd2-header');
  header.innerHTML = `
    <div class="d2-logo-wrap">
      <img class="d2-logo-img" src="assets/ui/logo.webp" alt="VELSCOUR">
    </div>
    <div class="d2-title-center">
      <div class="d2-channel-title" id="d2-channel-display">VELSCOUR SANCTUARY (En-1)</div>
      <div class="d2-channel-sub" id="d2-channel-sub">Connecting...</div>
    </div>
    <div class="d2-header-right">
      <button class="d2-btn-classic d2-btn-quit" id="d2-header-quit">QUIT</button>
    </div>
  `;
  s.appendChild(header);

  // ---------------------------------------------------------------- Main Split Body
  const body = el('div', 'd2-body');

  const chatPanel = el('div', 'd2-panel d2-chat-area');
  const chatHeader = el('div', 'd2-panel-header', '<span>CHANNEL CHAT</span><small id="d2-user-count" style="color:#a8977c">Connecting...</small>');
  const chatTabs = el('div', 'd2-chat-tabs');
  chatTabs.innerHTML = `
    <button type="button" class="d2-chat-tab active" data-tab="all">ALL</button>
    <button type="button" class="d2-chat-tab" data-tab="channel">CHANNEL</button>
    <button type="button" class="d2-chat-tab" data-tab="whisper">WHISPER</button>
    <button type="button" class="d2-chat-tab" data-tab="system">SYSTEM</button>
  `;
  const chatLog = el('div', 'd2-chat-log');
  const chatInputBar = el('div', 'd2-chat-input-bar');
  const chatInput = el('input', 'd2-input');
  chatInput.placeholder = 'Type a message, /w <player> to whisper, or /r to reply...';
  chatInput.maxLength = 180;
  const sendBtn = el('button', 'd2-btn-classic', 'SEND');

  chatInputBar.append(chatInput, sendBtn);

  const chatActions = el('div', 'd2-chat-actions');
  const actWhisper = el('button', 'd2-btn-classic', 'WHISPER');
  const actHelp = el('button', 'd2-btn-classic', 'HELP');
  const actEmote = el('button', 'd2-btn-classic', 'EMOTE');
  const actClear = el('button', 'd2-btn-classic', 'CLEAR');
  chatActions.append(actWhisper, actHelp, actEmote, actClear);

  chatPanel.append(chatHeader, chatTabs, chatLog, chatInputBar, chatActions);

  // Right Panel: Game Browser / Creator
  const roomPanel = el('div', 'd2-panel d2-room-area');
  const roomTabs = el('div', 'd2-room-tabs');
  const tabJoin = el('button', 'd2-tab-btn active', 'JOIN GAME');
  const tabCreate = el('button', 'd2-tab-btn', 'CREATE GAME');
  roomTabs.append(tabJoin, tabCreate);

  const tabContent = el('div', 'd2-tab-content');

  // Tab View 1: Join Game
  const joinView = el('div', 'd2-join-view');
  joinView.style.display = 'flex';
  joinView.style.flexDirection = 'column';
  joinView.style.flex = '1';
  joinView.style.minHeight = '0';

  const joinInputs = el('div', 'd2-join-inputs');
  const groupName = el('div', 'd2-input-group');
  groupName.innerHTML = '<label>GAME NAME</label>';
  const gameNameInput = el('input', 'd2-input');
  gameNameInput.placeholder = 'Game Name';
  groupName.appendChild(gameNameInput);

  const groupPass = el('div', 'd2-input-group');
  groupPass.innerHTML = '<label>PASSWORD</label>';
  const gamePassInput = el('input', 'd2-input');
  gamePassInput.type = 'password';
  gamePassInput.placeholder = 'Optional';
  groupPass.appendChild(gamePassInput);

  joinInputs.append(groupName, groupPass);

  const gamesSplit = el('div', 'd2-games-split');
  const tableWrap = el('div', 'd2-games-table-wrap');
  tableWrap.innerHTML = '<div class="d2-games-header"><span>GAME NAME</span><span>PLAYERS</span></div>';
  const gamesListBody = el('div', 'd2-games-list-body');
  tableWrap.appendChild(gamesListBody);

  const previewPane = el('div', 'd2-game-preview-pane');
  previewPane.innerHTML = `
    <div class="d2-prev-title">GAME DETAILS</div>
    <div class="d2-prev-elapsed" id="d2-prev-elapsed">Select a game from the list</div>
    <div class="d2-prev-player-list" id="d2-prev-players"></div>
  `;

  gamesSplit.append(tableWrap, previewPane);

  const joinActions = el('div', 'd2-room-bottom-actions');
  const cancelJoinBtn = el('button', 'd2-btn-classic', 'REFRESH');
  const doJoinBtn = el('button', 'd2-btn-classic', 'JOIN GAME');
  doJoinBtn.style.padding = '8px 24px';
  doJoinBtn.style.fontSize = '14px';
  doJoinBtn.style.color = '#fff';
  doJoinBtn.style.background = 'linear-gradient(180deg, #58361e, #2a150b)';
  joinActions.append(cancelJoinBtn, doJoinBtn);

  joinView.append(joinInputs, gamesSplit, joinActions);

  // Tab View 2: Create Game
  const createView = el('div', 'd2-create-view');
  createView.style.display = 'none';

  createView.innerHTML = `
    <div class="d2-create-inputs">
      <div class="d2-create-row">
        <div class="d2-input-group">
          <label>GAME NAME</label>
          <input class="d2-input" id="d2-create-name" value="${escapeHtml(char.name)}'s Game" maxlength="24">
        </div>
        <div class="d2-input-group">
          <label>PASSWORD</label>
          <input class="d2-input" id="d2-create-pass" type="password" placeholder="Leave empty for public" maxlength="20">
        </div>
      </div>
      <div class="d2-create-row">
        <div class="d2-input-group">
          <label>DUNGEON PORTAL DEPTH</label>
          <input class="d2-input" id="d2-create-depth" type="number" min="1" max="100" value="${Math.max(1, char.depth || 1)}">
        </div>
        <div class="d2-input-group">
          <label>MAX PLAYERS</label>
          <select class="d2-input" id="d2-create-max">
            <option value="4" selected>4 Players (Party)</option>
            <option value="3">3 Players (Trio)</option>
            <option value="2">2 Players (Duo)</option>
          </select>
        </div>
      </div>
    </div>
  `;

  const createActions = el('div', 'd2-room-bottom-actions');
  createActions.style.marginTop = 'auto';
  createActions.style.paddingTop = '6px';
  createActions.style.flexShrink = '0';
  const cancelCreateBtn = el('button', 'd2-btn-classic', 'CANCEL');
  const doCreateBtn = el('button', 'd2-btn-classic', 'CREATE GAME');
  doCreateBtn.style.padding = '8px 24px';
  doCreateBtn.style.fontSize = '14px';
  doCreateBtn.style.color = '#ffd860';
  doCreateBtn.style.background = 'linear-gradient(180deg, #58361e, #2a150b)';
  createActions.append(cancelCreateBtn, doCreateBtn);
  createView.appendChild(createActions);

  tabContent.append(joinView, createView);
  roomPanel.append(roomTabs, tabContent);

  body.append(chatPanel, roomPanel);
  s.appendChild(body);

  // Tab switching
  tabJoin.onclick = () => {
    sfx('ui');
    tabJoin.classList.add('active');
    tabCreate.classList.remove('active');
    joinView.style.display = 'flex';
    createView.style.display = 'none';
  };
  tabCreate.onclick = () => {
    sfx('ui');
    tabCreate.classList.add('active');
    tabJoin.classList.remove('active');
    joinView.style.display = 'none';
    createView.style.display = 'flex';
  };
  cancelCreateBtn.onclick = () => tabJoin.click();

  const headerQuit = header.querySelector('#d2-header-quit');
  if (headerQuit) {
    headerQuit.onclick = () => {
      sfx('ui');
      detachLobbyListeners();
      net.leaveRoom();
      net.disconnect();
      if (lobbyEl) { lobbyEl.remove(); lobbyEl = null; }
      onBack();
    };
  }

  // ---------------------------------------------------------------- Bottom Pedestal: Channel Players
  const pedestalWrap = el('div', 'd2-pedestal-wrap');
  const isMobile = G.touch || window.innerWidth < 768;
  if (isMobile) pedestalWrap.classList.add('collapsed');

  const pedToggle = el('button', 'd2-pedestal-toggle');
  pedToggle.setAttribute('aria-label', 'Toggle Online Players');
  pedToggle.innerHTML = `<span class="d2-toggle-arrow">${isMobile ? '&#9650;' : '&#9660;'}</span> <span class="d2-toggle-label">PLAYERS</span>`;
  pedToggle.onclick = () => {
    sfx('ui');
    const collapsed = pedestalWrap.classList.toggle('collapsed');
    const arrow = pedToggle.querySelector('.d2-toggle-arrow');
    if (arrow) arrow.innerHTML = collapsed ? '&#9650;' : '&#9660;';
  };
  pedestalWrap.appendChild(pedToggle);

  const pedestalRail = el('div', 'd2-pedestal-rail');
  pedestalWrap.appendChild(pedestalRail);

  s.appendChild(pedestalWrap);

  UI.screensEl.appendChild(s);

  // ---------------------------------------------------------------- Chat Functions
  let activeLobbyChatTab = 'all';
  let lastLobbyWhisperFrom = null;
  const lobbyChatMessages = [];

  function renderChatMsgRow(msg) {
    const row = el('div', 'd2-chat-msg ' + (msg.kind || ''));
    if (msg.color) row.style.color = msg.color;

    if (msg.kind === 'system' || msg.kind === 'gem') {
      row.textContent = msg.text;
    } else if (msg.kind === 'whisper') {
      row.innerHTML = `<span class="d2-sender-clickable" data-name="${escapeHtml(msg.from)}">&lt;${escapeHtml(msg.from)}&gt;</span> <span style="color:#d870ff">whispers:</span> ${escapeHtml(msg.text)}`;
    } else if (msg.kind === 'whisper_sent') {
      row.innerHTML = `<span style="color:#d870ff">You whisper to</span> <span class="d2-sender-clickable" data-name="${escapeHtml(msg.to)}">&lt;${escapeHtml(msg.to)}&gt;</span>: ${escapeHtml(msg.text)}`;
    } else if (msg.kind === 'emote') {
      row.textContent = msg.text;
    } else if (msg.from) {
      row.innerHTML = `<span class="d2-sender-clickable" data-name="${escapeHtml(msg.from)}">&lt;${escapeHtml(msg.from)}&gt;</span> ${escapeHtml(msg.text)}`;
    } else {
      row.textContent = msg.text;
    }

    chatLog.appendChild(row);
  }

  function renderLobbyChat() {
    chatLog.innerHTML = '';
    const filtered = lobbyChatMessages.filter(m => {
      if (activeLobbyChatTab === 'all') return true;
      if (activeLobbyChatTab === 'whisper') return m.kind === 'whisper' || m.kind === 'whisper_sent';
      if (activeLobbyChatTab === 'system') return m.kind === 'system' || m.kind === 'gem';
      if (activeLobbyChatTab === 'channel') return m.kind === 'channel' || m.kind === 'emote' || (!m.kind && m.from);
      return true;
    });
    for (const msg of filtered) {
      renderChatMsgRow(msg);
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function addChatMsg(msg) {
    if (msg.kind === 'whisper') {
      lastLobbyWhisperFrom = msg.from;
    }
    lobbyChatMessages.push(msg);
    if (lobbyChatMessages.length > 300) lobbyChatMessages.shift();

    const isVisible = (activeLobbyChatTab === 'all') ||
      (activeLobbyChatTab === 'whisper' && (msg.kind === 'whisper' || msg.kind === 'whisper_sent')) ||
      (activeLobbyChatTab === 'system' && (msg.kind === 'system' || msg.kind === 'gem')) ||
      (activeLobbyChatTab === 'channel' && (msg.kind === 'channel' || msg.kind === 'emote' || (!msg.kind && msg.from)));

    if (isVisible) {
      renderChatMsgRow(msg);
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  }

  chatTabs.querySelectorAll('.d2-chat-tab').forEach(btn => {
    btn.onclick = () => {
      sfx('ui');
      chatTabs.querySelectorAll('.d2-chat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLobbyChatTab = btn.dataset.tab;
      renderLobbyChat();
    };
  });

  chatLog.addEventListener('click', (e) => {
    const sender = e.target.closest('.d2-sender-clickable');
    if (sender && sender.dataset.name) {
      chatInput.value = `/w ${sender.dataset.name} `;
      chatInput.focus();
    }
  });

  function submitChat() {
    const raw = chatInput.value.trim();
    if (!raw) return;
    sfx('ui');

    let text = raw;
    if (text.startsWith('/r ') || text.startsWith('/reply ') || text === '/r' || text === '/reply') {
      if (!lastLobbyWhisperFrom) {
        addChatMsg({ kind: 'system', text: 'Nobody has whispered you yet to reply to.', color: '#ff6060' });
        chatInput.value = '';
        return;
      }
      const replyBody = text.replace(/^\/(?:r|reply)\s*/, '').trim();
      if (!replyBody) {
        chatInput.value = `/w ${lastLobbyWhisperFrom} `;
        chatInput.focus();
        return;
      }
      text = `/w ${lastLobbyWhisperFrom} ${replyBody}`;
    }

    net.sendChat(text);
    chatInput.value = '';
    chatInput.focus();
  }

  chatInput.onkeydown = (e) => {
    if (e.key === 'Enter') {
      submitChat();
    } else if (e.key === 'Tab') {
      if (!chatInput.value || chatInput.value === '/r' || chatInput.value === '/r ') {
        e.preventDefault();
        if (lastLobbyWhisperFrom) {
          chatInput.value = `/w ${lastLobbyWhisperFrom} `;
        }
      }
    }
  };
  sendBtn.onclick = submitChat;

  actWhisper.onclick = () => {
    if (lastLobbyWhisperFrom) {
      chatInput.value = `/w ${lastLobbyWhisperFrom} `;
    } else {
      chatInput.value = '/w ';
    }
    chatInput.focus();
  };
  actHelp.onclick = () => {
    net.sendChat('/help');
  };
  actEmote.onclick = () => {
    chatInput.value = '/me ';
    chatInput.focus();
  };
  actClear.onclick = () => {
    lobbyChatMessages.length = 0;
    chatLog.innerHTML = '';
  };

  // ---------------------------------------------------------------- Room List Rendering
  let selectedRoomName = null;

  function renderRoomList(roomList) {
    gamesListBody.innerHTML = '';
    if (!roomList || roomList.length === 0) {
      gamesListBody.innerHTML = '<div style="padding:16px;color:#8a7660;text-align:center;font-size:12px">No public games found. Create one!</div>';
      return;
    }

    for (const r of roomList) {
      const row = el('div', 'd2-game-row');
      if (selectedRoomName === r.name) row.classList.add('selected');

      const lockIcon = r.hasPassword ? '<span style="color:#ff8030;font-size:11px">&#128274; </span>' : '';
      const depthBadge = `<span class="d2-room-depth" style="color:#d4a359;font-size:12px;font-weight:normal;margin-left:6px;">[Depth ${r.depth || 1}]</span>`;
      const awayBadge = r.isHostAway ? '<span style="color:#ffd860;font-size:11px;font-style:italic;margin-left:4px;">(Away)</span>' : '';
      row.innerHTML = `<span>${lockIcon}${escapeHtml(r.name)} ${depthBadge}${awayBadge}</span><span>${r.playerCount}/${r.maxPlayers}</span>`;

      row.onclick = () => {
        sfx('ui');
        selectedRoomName = r.name;
        gameNameInput.value = r.name;
        for (const child of gamesListBody.children) child.classList.remove('selected');
        row.classList.add('selected');
        renderRoomPreview(r);
      };

      row.ondblclick = () => {
        doJoinBtn.click();
      };

      gamesListBody.appendChild(row);
    }
  }

  function renderRoomPreview(r) {
    const elapsedEl = $('#d2-prev-elapsed');
    const playersEl = $('#d2-prev-players');
    if (!elapsedEl || !playersEl) return;

    const min = Math.floor((r.elapsed || 0) / 60);
    const sec = (r.elapsed || 0) % 60;
    const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    const depthLabel = `Depth ${r.depth || 1}`;

    elapsedEl.innerHTML = `
      <div><b>Game:</b> ${escapeHtml(r.name)}</div>
      <div><b>Portal Depth:</b> ${escapeHtml(depthLabel)}</div>
      <div><b>Region:</b> Herrington Hollow (Town)</div>
      <div><b>Elapsed Time:</b> ${timeStr}</div>
      <div style="margin-top:6px;border-top:1px solid #3a2212;padding-top:4px;font-weight:700;color:#ffd860">PLAYERS (${r.playerCount}/${r.maxPlayers})</div>
    `;

    playersEl.innerHTML = '';
    for (const p of r.players || []) {
      const pRow = el('div', 'd2-prev-player-item');
      const awayTag = p.disconnected ? ' <span style="color:#ffd860;font-size:10px;font-style:italic">(Reconnecting...)</span>' : '';
      pRow.innerHTML = `&bull; <b>${escapeHtml(p.name)}</b> <span class="d2-prev-player-sub">Level ${p.level} ${CLASSES[p.classId]?.name || p.classId}${awayTag}</span>`;
      playersEl.appendChild(pRow);
    }
  }

  cancelJoinBtn.onclick = () => {
    sfx('ui');
    if (!net.connected) {
      net.connect(char);
    } else {
      net.refreshLobby();
    }
    renderRoomList(net.rooms);
  };

  doJoinBtn.onclick = () => {
    const name = gameNameInput.value.trim();
    const pass = gamePassInput.value.trim();
    if (!name) {
      UI.dialog({ title: 'Game Name Required', html: '<p>Please enter or select a game name to join.</p>', buttons: [{ label: 'OK' }] });
      return;
    }
    sfx('ui');
    net.joinRoom(name, pass);
  };

  doCreateBtn.onclick = () => {
    const name = ($('#d2-create-name')?.value || '').trim();
    const pass = ($('#d2-create-pass')?.value || '').trim();
    const depth = parseInt($('#d2-create-depth')?.value, 10) || Math.max(1, char.depth || 1);
    const maxPlayers = parseInt($('#d2-create-max')?.value, 10) || 4;

    if (!name) {
      UI.dialog({ title: 'Game Name Required', html: '<p>Please enter a name for your game.</p>', buttons: [{ label: 'OK' }] });
      return;
    }

    sfx('ui');
    net.createRoom({
      name,
      password: pass,
      biome: 'town',
      depth,
      maxPlayers,
    });
  };

  // ---------------------------------------------------------------- Bottom Pedestal Rendering
  function renderPedestal(players) {
    pedestalRail.innerHTML = '';
    const userCountEl = $('#d2-user-count');
    if (userCountEl) userCountEl.textContent = `${players.length} in channel`;

    for (const p of players) {
      const isMe = p.name === char.name;
      const pod = el('div', 'd2-player-pod' + (isMe ? ' is-me' : ''));
      pod.title = `${p.name} - Level ${p.level} ${CLASSES[p.classId]?.name || p.classId}\nClick to whisper`;

      const canvasWrap = el('div', 'd2-player-canvas-wrap');
      const anim = heroCanvas(p.classId, 'd2-player-canvas');
      canvasWrap.appendChild(anim.canvas);

      // Load vanity looks over actual gear for hero preview (including weapon and offhand)
      const myLook = isMe ? shownEquip(char) : null;
      const rawBody = (isMe ? myLook?.body : p.gear?.body);
      const rawHead = (isMe ? myLook?.head : p.gear?.head);
      const rawWeapon = (isMe ? myLook?.weapon : p.gear?.weapon);
      const rawOffhand = (isMe ? myLook?.offhand : p.gear?.offhand);

      const toItem = (it, slot) => {
        if (!it) return null;
        if (typeof it === 'string') return { slot, type: 'gear', base: it, rarity: 0, ilvl: 1 };
        return it;
      };

      const body = toItem(rawBody, 'body');
      const head = toItem(rawHead, 'head');
      const weapon = toItem(rawWeapon, 'weapon');
      const offhand = toItem(rawOffhand, 'offhand');

      if (body || head || weapon || offhand) {
        savedGearPreview(p.classId, body, head, weapon, offhand).then(art => {
          if (art && anim.canvas.isConnected) anim.setArt(art);
        }).catch(() => {});
      }

      excitable(pod, anim);

      const plaque = el('div', 'd2-player-name-plaque', escapeHtml(p.name));
      const titleTag = el('div', 'd2-player-title-tag', `Lv ${p.level} ${CLASSES[p.classId]?.name || ''}`);

      pod.append(canvasWrap, plaque, titleTag);

      pod.onclick = () => {
        sfx('ui');
        anim.burst(1.4);
        if (!isMe) {
          chatInput.value = `/w ${p.name} `;
          chatInput.focus();
        }
      };

      pedestalRail.appendChild(pod);
    }
  }

  function updateConnectionBadge() {
    const sub = $('#d2-channel-sub');
    if (!sub) return;
    const hostLabel = (net && net.targetHost) || 'velscour.dagyr.me:8123';
    if (net.connected) {
      sub.innerHTML = `<span style="color:#48e868;font-weight:700">&#9679; ONLINE</span> &middot; Multiplayer Realm &middot; <span style="color:#a8977c">Host: ${hostLabel}</span>`;
    } else if (net.shouldReconnect) {
      const attemptStr = net.reconnectAttempts > 0 ? ` (Attempt ${net.reconnectAttempts})` : '';
      sub.innerHTML = `<span style="color:#ffd860;font-weight:700">&#8635; RECONNECTING${attemptStr}...</span> &middot; Re-establishing link to <span style="color:#ffd860">${hostLabel}</span>`;
    } else {
      sub.innerHTML = `<span style="color:#ffb040;font-weight:700">&#9675; OFFLINE (Simulated)</span> &middot; Connecting to <span style="color:#ffd860">${hostLabel}</span>`;
    }
  }

  // ---------------------------------------------------------------- Network Event Handlers
  const onChat = (msg) => {
    if (lobbyEl) addChatMsg(msg);
  };

  const onLobbyUpdate = (data) => {
    if (!lobbyEl) return;
    renderPedestal(data.players || []);
    renderRoomList(data.rooms || []);
    const disp = $('#d2-channel-display');
    if (disp) disp.textContent = `VELSCOUR SANCTUARY (${data.channel || 'En-1'})`;
    updateConnectionBadge();
  };

  const onRoomError = (msg) => {
    UI.dialog({ title: 'Game Error', html: `<p style="color:#ff8060">${escapeHtml(msg)}</p>`, buttons: [{ label: 'OK' }] });
  };

  const onRoomJoined = (room) => {
    detachLobbyListeners();
    if (lobbyEl) {
      lobbyEl.remove();
      lobbyEl = null;
    }
    sfx('portal');
    // Start game in multiplayer room
    G.game.startMultiplayerGame(char, room);
  };

  const onConnected = () => updateConnectionBadge();
  const onDisconnected = () => updateConnectionBadge();
  const onReconnecting = () => updateConnectionBadge();

  activeLobbyListeners = { onChat, onLobbyUpdate, onRoomError, onRoomJoined, onConnected, onDisconnected, onReconnecting };
  net.on('chat', onChat);
  net.on('lobby_update', onLobbyUpdate);
  net.on('room_error', onRoomError);
  net.on('room_joined', onRoomJoined);
  net.on('connected', onConnected);
  net.on('disconnected', onDisconnected);
  net.on('reconnecting', onReconnecting);

  // Initial render
  updateConnectionBadge();
  renderPedestal(net.channelPlayers);
  renderRoomList(net.rooms);
}
