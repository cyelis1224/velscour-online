// Client networking controller for VELSCOUR Online
import { G } from '../state.js';
import { getClientVersion } from '../ui/updater.js';

class NetworkManager {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.simulated = false;
    this.listeners = new Map();
    this.currentRoom = null;
    this.channelPlayers = [];
    this.rooms = [];
    this.myId = null;
    this.charData = null;
    this.activeRoomName = null;
    this.pingInterval = null;
    this.simTimer = null;
    this.broadcastChannel = null;
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.lastPingTime = 0;
    this.lastPongTime = 0;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('velscour_online_tab_bus');
        this.broadcastChannel.onmessage = (e) => this.handleTabBus(e.data);
      } catch (err) {
        console.warn('BroadcastChannel not available', err);
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.handleForegroundResume();
        }
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => this.handleForegroundResume());
      window.addEventListener('pageshow', () => this.handleForegroundResume());
      window.addEventListener('online', () => this.handleForegroundResume());
    }
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
  }

  off(event, fn) {
    if (!this.listeners.has(event)) return;
    if (fn) {
      this.listeners.get(event).delete(fn);
      if (this.listeners.get(event).size === 0) {
        this.listeners.delete(event);
      }
    } else {
      this.listeners.delete(event);
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      for (const fn of this.listeners.get(event)) {
        try { fn(data); } catch (e) { console.error('Network listener error', e); }
      }
    }
  }

  send(msg) {
    if (this.ws && this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (this.broadcastChannel) {
      // Broadcast across tabs if offline
      this.broadcastChannel.postMessage({ fromId: this.myId, msg });
    }
  }

  connect(charData, isReconnect = false) {
    if (charData) this.charData = charData;
    if (!this.charData) return;
    this.myId = this.myId || ('player_' + Math.random().toString(36).slice(2, 9));
    this.shouldReconnect = true;
    if (!isReconnect) {
      this.reconnectAttempts = 0;
    }

    // Clean up existing connection & timers
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
    this.simulated = false;
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.simWelcomeTimeout) {
      clearTimeout(this.simWelcomeTimeout);
      this.simWelcomeTimeout = null;
    }

    const defaultRemoteHost = 'velscour.dagyr.me:8123';
    let params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { params = new URLSearchParams(); }
    const configuredHost = params.get('server') || localStorage.getItem('velscour_lobby_server') || defaultRemoteHost;

    this.targetHost = configuredHost;

    let url;
    if (configuredHost.startsWith('velscour.dagyr.me')) {
      // Connect to Cloudflare tunnel WebSocket on port 443 which forwards to the port 8123 server
      url = 'wss://velscour.dagyr.me/ws';
    } else {
      const loc = window.location;
      const proto = (loc.protocol === 'https:' && !configuredHost.includes('localhost')) ? 'wss:' : 'ws:';
      url = `${proto}//${configuredHost}/ws`;
    }

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      console.warn('WebSocket connect error, using offline/simulated lobby', e);
      if (!isReconnect) this.startSimulatedMode();
      return;
    }

function serializeGearItem(item, slot) {
  if (!item) return null;
  return {
    type: 'gear',
    slot: slot || item.slot,
    base: item.base || null,
    rarity: item.rarity ?? 0,
    ilvl: item.ilvl ?? 1,
    look: Array.isArray(item.look) ? [...item.look] : null,
  };
}

    this.ws.onopen = () => {
      this.connected = true;
      this.simulated = false;
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      const activeRoom = this.activeRoomName || (this.currentRoom ? this.currentRoom.name : null) || (G.room ? G.room.name : null);
      this.send({
        type: 'enter_lobby',
        name: this.charData.name,
        classId: this.charData.classId,
        level: this.charData.level,
        title: this.charData.level >= 50 ? 'Matriarch' : this.charData.level >= 20 ? 'Slayer' : 'Hero',
        reconnectId: this.myId,
        reconnectRoom: activeRoom || null,
        clientVersion: getClientVersion(),
        gear: {
          head: serializeGearItem(this.charData.equip?.head, 'head'),
          body: serializeGearItem(this.charData.equip?.body, 'body'),
          weapon: serializeGearItem(this.charData.equip?.weapon, 'weapon'),
        },
      });
      this.emit('connected', { url, isReconnect });
    };

    this.ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      if (data.type === 'pong') {
        this.lastPongTime = Date.now();
        return;
      }
      this.handleServerMessage(data);
    };

    this.ws.onclose = () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      if (wasConnected) {
        this.emit('disconnected', {});
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      } else if (!this.simulated && !isReconnect) {
        // If initial connection failed on first launch
        this.startSimulatedMode();
      }
    };

    this.ws.onerror = (err) => {
      console.warn('WebSocket error', err);
    };
  }

  startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();
        this.send({ type: 'ping' });
      }
    }, 12000);
  }

  scheduleReconnect() {
    if (!this.shouldReconnect || !this.charData) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.4, this.reconnectAttempts), 6000);
    this.reconnectAttempts++;
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect && (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN)) {
        this.connect(this.charData, true);
      }
    }, delay);
  }

  handleForegroundResume() {
    if (!this.shouldReconnect && G.mode !== 'lobby' && !G.room) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const isOpen = this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    if (!isOpen) {
      this.reconnectAttempts = 0;
      const char = this.charData || G.char;
      if (char) {
        this.connect(char, true);
      }
    } else {
      this.send({ type: 'ping' });
      if (G.mode === 'lobby') {
        this.send({ type: 'refresh_lobby' });
      }
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.connected && (this.currentRoom || this.activeRoomName) && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'leave_room' })); } catch (e) {}
    }
    this.activeRoomName = null;
    this.currentRoom = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.simWelcomeTimeout) {
      clearTimeout(this.simWelcomeTimeout);
      this.simWelcomeTimeout = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
    this.connected = false;
    this.simulated = false;
    this.currentRoom = null;
    this.channelPlayers = [];
    this.rooms = [];
    this.emit('disconnected', {});
  }


  handleServerMessage(msg) {
    switch (msg.type) {
      case 'lobby_welcome':
        this.myId = msg.id;
        this.channelPlayers = msg.players || [];
        this.rooms = msg.rooms || [];
        if (msg.serverVersion) {
          import('../ui/updater.js').then(({ checkForUpdates, compareVersions, getClientVersion, showUpdateDialog }) => {
            const currentVer = getClientVersion();
            if (compareVersions(msg.serverVersion, currentVer) > 0) {
              checkForUpdates({ force: true }).then((info) => {
                if (info && (info.hasUpdate || compareVersions(info.serverVersion, currentVer) > 0)) {
                  this.disconnect();
                  showUpdateDialog(info);
                }
              }).catch(() => {});
            }
          }).catch(() => {});
        }
        this.emit('lobby_welcome', msg);
        this.emit('lobby_update', { players: this.channelPlayers, rooms: this.rooms, channel: msg.channel });
        break;

      case 'version_outdated':
        import('../ui/updater.js').then(({ checkForUpdates, showUpdateDialog }) => {
          checkForUpdates({ force: true }).then((info) => {
            this.disconnect();
            showUpdateDialog(info);
          }).catch(() => {
            this.disconnect();
          });
        }).catch(() => {
          this.disconnect();
        });
        break;

      case 'lobby_update':
        this.channelPlayers = msg.players || [];
        this.rooms = msg.rooms || [];
        this.emit('lobby_update', msg);
        break;

      case 'chat':
        this.emit('chat', msg);
        break;

      case 'room_reconnected':
        this.currentRoom = msg.room;
        this.activeRoomName = msg.room.name;
        this.emit('room_reconnected', msg.room);
        if (G.mode === 'lobby') {
          this.emit('room_joined', msg.room);
        }
        break;

      case 'room_joined':
        this.currentRoom = msg.room;
        this.activeRoomName = msg.room.name;
        this.emit('room_joined', msg.room);
        break;

      case 'room_error':
        this.emit('room_error', msg.message);
        break;

      case 'player_joined_room':
        if (this.currentRoom) {
          this.currentRoom.players = this.currentRoom.players.filter(p => p.id !== msg.player.id);
          this.currentRoom.players.push(msg.player);
        }
        this.emit('player_joined_room', msg.player);
        break;

      case 'player_left_room':
        if (this.currentRoom) {
          this.currentRoom.players = this.currentRoom.players.filter(p => p.id !== msg.playerId);
        }
        this.emit('player_left_room', msg);
        break;

      case 'host_migrated':
        if (this.currentRoom) {
          this.currentRoom.hostId = msg.hostId;
          this.currentRoom.hostName = msg.hostName;
        }
        this.emit('host_migrated', msg);
        break;

      // In-Game Events
      case 'game_player_state':
        this.emit('game_player_state', msg);
        break;

      case 'game_skill_cast':
        this.emit('game_skill_cast', msg);
        break;

      case 'game_monster_hit':
        this.emit('game_monster_hit', msg);
        break;

      case 'game_monsters_state':
        this.emit('game_monsters_state', msg);
        break;

      case 'dungeon_killed_sync':
        this.emit('dungeon_killed_sync', msg);
        break;

      case 'game_monster_spawn':
        this.emit('game_monster_spawn', msg);
        break;

      case 'game_ambush_spawn':
        this.emit('game_ambush_spawn', msg);
        break;

      case 'game_loot_spawn':
        this.emit('game_loot_spawn', msg);
        break;

      case 'game_loot_pickup':
        this.emit('game_loot_pickup', msg);
        break;

      case 'game_ground_loot_sync':
        this.emit('game_ground_loot_sync', msg);
        break;

      case 'game_loot_pickup_reject':
        this.emit('game_loot_pickup_reject', msg);
        break;

      case 'game_party_chat':
        this.emit('game_party_chat', msg);
        break;

      case 'room_depth_sync':
        if (this.currentRoom) {
          if (typeof msg.depth === 'number') this.currentRoom.depth = msg.depth;
          if (msg.biome) this.currentRoom.biome = msg.biome;
          if (msg.seed) this.currentRoom.dungeonSeed = msg.seed;
          if (msg.mixId !== undefined) this.currentRoom.mixId = msg.mixId;
          if (Array.isArray(msg.heresies)) this.currentRoom.heresies = msg.heresies;
        }
        this.emit('room_depth_sync', msg);
        break;

      case 'game_dungeon_transition':
        if (this.currentRoom && typeof msg.depth === 'number') {
          this.currentRoom.depth = msg.depth;
        }
        this.emit('game_dungeon_transition', msg);
        break;

      case 'game_town_transition':
        if (this.currentRoom && typeof msg.depth === 'number') {
          this.currentRoom.depth = msg.depth;
        }
        this.emit('game_town_transition', msg);
        break;
    }
  }

  handleTabBus(data) {
    if (!data || data.fromId === this.myId) return;
    const msg = data.msg;
    if (this.simulated) {
      if (msg.type === 'enter_lobby') {
        this.channelPlayers.push({
          id: data.fromId,
          name: msg.name,
          classId: msg.classId,
          level: msg.level,
          title: msg.title,
          gear: msg.gear,
        });
        this.emit('lobby_update', { players: this.channelPlayers, rooms: this.rooms, channel: 'Velscour En-1' });
      } else if (msg.type === 'chat') {
        this.emit('chat', msg);
      }
    }
  }

  // ---------------------------------------------------------------- Simulated / Fallback Mode
  // If the server isn't running or client is offline, we populate the Diablo II lobby with
  // classic authentic players, games, and banter so the lobby is lively and immersive!
  startSimulatedMode() {
    if (this.simulated) return;
    this.simulated = true;
    this.connected = false;

    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = null;
    }
    if (this.simWelcomeTimeout) {
      clearTimeout(this.simWelcomeTimeout);
      this.simWelcomeTimeout = null;
    }

    const defaultBots = [
      { id: 'b_1', name: 'jeffwands', classId: 'barbarian', level: 48, title: 'Slayer' },
      { id: 'b_2', name: 'Lashondra', classId: 'paladin', level: 82, title: 'Matriarch' },
      { id: 'b_3', name: 'MsButtcheeks', classId: 'carrion_witch', level: 31, title: 'Slayer' },
      { id: 'b_4', name: 'THECheckCheck', classId: 'barbarian', level: 65, title: 'Champion' },
      { id: 'b_5', name: 'Pladinson', classId: 'paladin', level: 54, title: 'Slayer' },
      { id: 'b_6', name: 'Xplicittt', classId: 'ranger', level: 50, title: 'Matriarch' },
      { id: 'b_7', name: 'IFeelFat', classId: 'wizard', level: 57, title: 'Matriarch' },
      { id: 'b_8', name: 'Duke Teapot', classId: 'death_knight', level: 71, title: 'Duke' },
    ];

    const myPlayer = {
      id: this.myId,
      name: this.charData?.name || 'Hero',
      classId: this.charData?.classId || 'paladin',
      level: this.charData?.level || 1,
      title: (this.charData?.level || 1) >= 50 ? 'Matriarch' : 'Hero',
    };

    this.channelPlayers = [myPlayer, ...defaultBots];
    this.rooms = [
      {
        name: 'Tal Set4ur Ber',
        hasPassword: true,
        maxPlayers: 4,
        playerCount: 3,
        hostName: 'Xplicittt',
        depth: 30,
        biome: 'catacombs',
        elapsed: 404,
        players: [
          { name: 'Xplicittt', classId: 'ranger', level: 50, title: 'Matriarch' },
          { name: 'IFeelFat', classId: 'wizard', level: 57, title: 'Matriarch' },
          { name: 'CowKing_99', classId: 'necromancer', level: 62, title: 'Champion' },
        ],
      },
      {
        name: 'Trist 3',
        hasPassword: false,
        maxPlayers: 4,
        playerCount: 3,
        hostName: 'Rawr Kill Npc',
        depth: 3,
        biome: 'wilds',
        elapsed: 145,
        players: [
          { name: 'Rawr Kill Npc', classId: 'barbarian', level: 14, title: 'Hero' },
          { name: 'OhmRun', classId: 'paladin', level: 12, title: 'Hero' },
          { name: 'FireWaller', classId: 'wizard', level: 15, title: 'Hero' },
        ],
      },
      {
        name: 'Drop Park City',
        hasPassword: false,
        maxPlayers: 4,
        playerCount: 1,
        hostName: 'DropBot',
        depth: 0,
        biome: 'town',
        elapsed: 1200,
        players: [{ name: 'DropBot', classId: 'arcane_sorcerer', level: 90, title: 'Matriarch' }],
      },
      {
        name: 'Xxbaal-24',
        hasPassword: false,
        maxPlayers: 4,
        playerCount: 2,
        hostName: 'BaalRunner',
        depth: 55,
        biome: 'throne',
        elapsed: 230,
        players: [
          { name: 'BaalRunner', classId: 'paladin', level: 85, title: 'Patriarch' },
          { name: 'LeechPlz', classId: 'bard', level: 22, title: 'Hero' },
        ],
      },
    ];

    this.simWelcomeTimeout = setTimeout(() => {
      this.simWelcomeTimeout = null;
      this.emit('chat', { type: 'chat', text: 'You have joined channel: Velscour En-1', color: '#3a8aff', kind: 'system' });
      this.emit('chat', { type: 'chat', text: 'There are currently 28,528 users playing 30,596 games of VELSCOUR.', color: '#5a9aff', kind: 'system' });
      this.emit('chat', { type: 'chat', text: '# Email Service # whispers: Welcome back to Sanctuary.', color: '#48e868', kind: 'system' });
      this.emit('chat', { type: 'chat', text: 'is diablo 2 dead?', from: 'Pladinson', classId: 'paladin', color: '#e9dcc4' });
      this.emit('lobby_update', { players: this.channelPlayers, rooms: this.rooms, channel: 'Velscour En-1' });
    }, 200);

    // Periodically post bot banter in chat
    const banter = [
      { from: 'jeffwands', text: 'anyone got a spare soj?' },
      { from: 'MsButtcheeks', text: 'tp up safe on 2' },
      { from: 'Duke Teapot', text: 'ng after this run' },
      { from: 'THECheckCheck', text: 'spin to win baby' },
      { from: 'Lashondra', text: 'giving free rush normal' },
    ];
    let banterIdx = 0;
    this.simTimer = setInterval(() => {
      if (this.currentRoom || !this.simulated) return;
      const b = banter[banterIdx % banter.length];
      banterIdx++;
      this.emit('chat', { type: 'chat', from: b.from, text: b.text, color: '#e9dcc4' });
    }, 18000);
  }

  // ---------------------------------------------------------------- Actions
  sendChat(text) {
    if (this.connected) {
      this.send({ type: 'chat', text });
    } else {
      // Local echo in simulated mode
      this.emit('chat', {
        type: 'chat',
        from: this.charData?.name || 'Hero',
        text: text,
        color: '#e9dcc4',
      });
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({
          fromId: this.myId,
          msg: { type: 'chat', from: this.charData?.name || 'Hero', text, color: '#e9dcc4' },
        });
      }
    }
  }

  clickGem() {
    if (this.connected) {
      this.send({ type: 'gem_click' });
    } else {
      this.gemClicks = (this.gemClicks || 0) + 1;
      const text = this.gemClicks % 2 === 1 ? 'Gem Activated' : 'Gem Deactivated';
      this.emit('chat', { type: 'chat', kind: 'gem', text, color: '#c040ff' });
    }
  }

  refreshLobby() {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'refresh_lobby' });
    } else if (this.charData) {
      this.connect(this.charData, true);
    }
  }

  createRoom(opts) {
    this.activeRoomName = opts.name || `${this.charData?.name}'s Game`;
    if (this.connected) {
      this.send({
        type: 'create_room',
        name: opts.name,
        password: opts.password,
        maxPlayers: opts.maxPlayers || 4,
        depth: Math.max(1, parseInt(opts.depth, 10) || 1),
        biome: opts.biome || 'town',
        seed: Math.floor(Math.random() * 1e9) + 1,
      });
    } else {
      // Simulated local room creation
      const seed = Math.floor(Math.random() * 1e9) + 1;
      const depth = Math.max(1, parseInt(opts.depth, 10) || 1);
      const room = {
        name: opts.name || `${this.charData?.name}'s Game`,
        seed,
        depth,
        biome: opts.biome || 'town',
        hostId: this.myId,
        players: [{
          id: this.myId,
          name: this.charData?.name || 'Hero',
          classId: this.charData?.classId || 'paladin',
          level: this.charData?.level || 1,
          title: 'Hero',
        }],
      };
      this.currentRoom = room;
      this.emit('room_joined', room);
    }
  }

  joinRoom(name, password = '') {
    this.activeRoomName = name;
    if (this.connected) {
      this.send({ type: 'join_room', name, password });
    } else {
      const room = this.rooms.find(r => r.name.toLowerCase() === name.toLowerCase());
      if (!room) {
        this.emit('room_error', `Game "${name}" does not exist.`);
        return;
      }
      if (room.hasPassword && room.password && room.password !== password) {
        this.emit('room_error', 'Incorrect password.');
        return;
      }
      const myPlayer = {
        id: this.myId,
        name: this.charData?.name || 'Hero',
        classId: this.charData?.classId || 'paladin',
        level: this.charData?.level || 1,
        title: 'Hero',
      };
      const joinedRoom = {
        name: room.name,
        seed: Math.floor(Math.random() * 1e9) + 1,
        depth: room.depth || 0,
        biome: room.biome || 'town',
        hostId: room.hostName,
        players: [...room.players, myPlayer],
      };
      this.currentRoom = joinedRoom;
      this.emit('room_joined', joinedRoom);
    }
  }

  leaveRoom() {
    this.activeRoomName = null;
    this.currentRoom = null;
    if (this.connected) {
      this.send({ type: 'leave_room' });
    }
  }

  sendPlayerState(state) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_player_state',
      ...state,
    });
  }

  sendSkillCast(skillId, x, y, targetId = null, level = 1) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_skill_cast',
      skillId,
      x,
      y,
      targetId,
      level,
    });
  }

  sendMonsterHit(monsterIdx, dmg, isCrit = false, elem = null, x = null, y = null, netId = null, killed = false, worldKind = null, depth = 0) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_monster_hit',
      monsterIdx,
      dmg,
      isCrit,
      elem,
      x,
      y,
      netId,
      killed,
      worldKind,
      depth,
    });
  }

  sendMonstersState(monsters, depth = 0, killed = []) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_monsters_state',
      monsters,
      depth,
      killed,
    });
  }

  requestDungeonState(depth = 1) {
    if (!this.currentRoom) return;
    this.send({
      type: 'request_dungeon_state',
      depth,
    });
  }

  sendMonsterSpawn(data) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_monster_spawn',
      ...data,
    });
  }

  sendAmbushSpawn(data) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_ambush_spawn',
      ...data,
    });
  }

  sendLootSpawn(lootData) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_loot_spawn',
      ...lootData,
    });
  }

  sendLootPickup(lootId) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_loot_pickup',
      lootId,
    });
  }

  sendLootRequest(worldKind, depth = 0) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_loot_request',
      worldKind,
      depth,
    });
  }

  sendPartyChat(text) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_chat',
      text,
    });
  }

  sendRoomDepthUpdate(depth, biome, seed, mixId = null, heresies = null) {
    if (!this.currentRoom) return;
    this.send({
      type: 'room_depth_update',
      depth,
      biome,
      seed,
      mixId,
      heresies: Array.isArray(heresies) ? heresies : undefined,
    });
  }

  sendDungeonTransition(depth, biome, seed, mixId = null, heresies = null) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_dungeon_transition',
      depth,
      biome,
      seed,
      mixId,
      heresies: Array.isArray(heresies) ? heresies : undefined,
    });
  }

  sendTownTransition(depth = null) {
    if (!this.currentRoom) return;
    this.send({
      type: 'game_town_transition',
      depth,
    });
  }
}

export const net = new NetworkManager();
