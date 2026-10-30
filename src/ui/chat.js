// ==========================================================================
// VELSCOUR MODERN GAME CHAT SYSTEM
// Tabs, filters, scrollable history, cross-room/lobby whispers, and auto-reply.
// ==========================================================================
import { G } from '../state.js';
import { el, escapeHtml } from '../core/util.js';
import { sfx } from '../core/audio.js';
import { net } from '../net/network.js';
import { UI } from './ui.js';
import { HUD } from './hud.js';
import { TouchUI } from './touch.js';

export const GameChat = {
  container: null,
  bodyEl: null,
  messagesEl: null,
  inputEl: null,
  headerEl: null,
  dragHandleEl: null,
  resizeHandleEl: null,
  filterBtnEl: null,
  filterMenuEl: null,
  filterDotEl: null,
  scrollBottomBtn: null,
  channelBtn: null,
  channelLabel: null,
  mobileBtn: null,

  messages: [],
  maxMessages: 300,
  activeTab: 'all', // 'all', 'party', 'whisper', 'system', 'lobby'
  unread: { all: 0, party: 0, whisper: 0, system: 0, lobby: 0 },
  activeChannel: 'party', // 'party', 'whisper', 'lobby'
  allFilters: { party: true, whisper: true, system: true, lobby: true },
  whisperTarget: null,
  lastWhisperFrom: null,
  sentHistory: [],
  historyIndex: -1,
  isOpen: false,
  isMinimized: false,
  isFilterMenuOpen: false,
  idleTimeout: null,
  isInitialized: false,

  init() {
    if (this.isInitialized && this.container?.isConnected) return;
    this.isInitialized = true;

    // Load saved All tab channel filters
    try {
      const saved = JSON.parse(localStorage.getItem('velscour_chat_all_filters') || 'null');
      if (saved && typeof saved === 'object') {
        Object.assign(this.allFilters, saved);
      }
    } catch (e) {}

    // Attach to HUD or app
    const hud = document.getElementById('hud') || document.getElementById('app');
    if (!hud) return;

    // Remove any existing container
    const existing = document.getElementById('game-chat');
    if (existing) existing.remove();

    const root = el('div', 'game-chat');
    root.id = 'game-chat';

    // Header & Tabs
    const header = el('div', 'gc-header');
    header.innerHTML = `
      <div class="gc-tabs">
        <button type="button" class="gc-tab active" data-tab="all">All</button>
        <button type="button" class="gc-tab" data-tab="party">Party<span class="gc-badge hidden" id="gc-badge-party">0</span></button>
        <button type="button" class="gc-tab" data-tab="whisper">Whisper<span class="gc-badge hidden" id="gc-badge-whisper">0</span></button>
        <button type="button" class="gc-tab" data-tab="system">System</button>
        <button type="button" class="gc-tab" data-tab="lobby">Lobby<span class="gc-badge hidden" id="gc-badge-lobby">0</span></button>
      </div>
      <div class="gc-drag-handle" title="Drag to move chat"></div>
      <div class="gc-tools">
        <button type="button" class="gc-tool-btn gc-filter-btn" id="gc-btn-filter" title="Filter All tab channels">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span>Filters</span>
          <span class="gc-filter-dot hidden" id="gc-filter-dot"></span>
        </button>
        <button type="button" class="gc-tool-btn" id="gc-btn-clear" title="Clear history">&#128465;</button>
        <button type="button" class="gc-tool-btn" id="gc-btn-toggle" title="Minimize/Expand">&#9660;</button>
      </div>
    `;

    // Messages body
    const body = el('div', 'gc-body');
    body.id = 'gc-body';
    const messages = el('div', 'gc-messages');
    messages.id = 'gc-messages';
    const scrollBottom = el('button', 'gc-scroll-bottom hidden', '&#11015; New messages below');
    scrollBottom.id = 'gc-scroll-bottom';

    body.appendChild(messages);
    body.appendChild(scrollBottom);

    // Footer input
    const footer = el('div', 'gc-footer');
    footer.id = 'gc-footer';
    footer.innerHTML = `
      <button type="button" class="gc-channel-btn" id="gc-channel-btn" title="Click to cycle channel">
        <span id="gc-channel-label">Party</span> &#9662;
      </button>
      <input type="text" id="party-chat-input" class="gc-input" placeholder="Press Enter to chat (/w, /p, /l, /r)..." maxlength="200" autocomplete="off" spellcheck="false">
      <button type="button" class="gc-send-btn" id="gc-send-btn">Send</button>
    `;

    // Visual resize grip at bottom-right corner
    const resizeHandle = el('div', 'gc-resize-handle');
    resizeHandle.id = 'gc-resize-handle';
    resizeHandle.title = 'Drag to resize chat';
    resizeHandle.innerHTML = `
      <svg viewBox="0 0 12 12">
        <line x1="9" y1="12" x2="12" y2="9" />
        <line x1="5" y1="12" x2="12" y2="5" />
        <line x1="1" y1="12" x2="12" y2="1" />
      </svg>
    `;

    // Filter Popover Menu for All Tab
    const filterMenu = el('div', 'gc-filter-menu hidden');
    filterMenu.id = 'gc-filter-menu';
    filterMenu.innerHTML = `
      <div class="gc-filter-header">
        <span>ALL TAB CHANNELS</span>
        <button type="button" class="gc-filter-close" id="gc-filter-close" title="Close filters">&times;</button>
      </div>
      <div class="gc-filter-list">
        <label class="gc-filter-item">
          <input type="checkbox" data-channel="party" id="gc-flt-party" ${this.allFilters.party ? 'checked' : ''}>
          <span class="gc-filter-tag tag-party">Party</span>
          <span class="gc-filter-desc">Party & bubbles</span>
        </label>
        <label class="gc-filter-item">
          <input type="checkbox" data-channel="whisper" id="gc-flt-whisper" ${this.allFilters.whisper ? 'checked' : ''}>
          <span class="gc-filter-tag tag-whisper">Whisper</span>
          <span class="gc-filter-desc">Private whispers</span>
        </label>
        <label class="gc-filter-item">
          <input type="checkbox" data-channel="system" id="gc-flt-system" ${this.allFilters.system ? 'checked' : ''}>
          <span class="gc-filter-tag tag-system">System</span>
          <span class="gc-filter-desc">Notices & combat</span>
        </label>
        <label class="gc-filter-item">
          <input type="checkbox" data-channel="lobby" id="gc-flt-lobby" ${this.allFilters.lobby ? 'checked' : ''}>
          <span class="gc-filter-tag tag-lobby">Lobby</span>
          <span class="gc-filter-desc">Global lobby</span>
        </label>
      </div>
      <div class="gc-filter-actions">
        <button type="button" class="gc-filter-act-btn" id="gc-filter-all">Select All</button>
        <button type="button" class="gc-filter-act-btn" id="gc-filter-reset">Reset</button>
      </div>
    `;

    root.appendChild(header);
    root.appendChild(body);
    root.appendChild(footer);
    root.appendChild(resizeHandle);
    root.appendChild(filterMenu);

    hud.appendChild(root);

    this.container = root;
    this.headerEl = header;
    this.bodyEl = body;
    this.messagesEl = messages;
    this.inputEl = root.querySelector('#party-chat-input');
    this.scrollBottomBtn = scrollBottom;
    this.channelBtn = root.querySelector('#gc-channel-btn');
    this.channelLabel = root.querySelector('#gc-channel-label');
    this.resizeHandleEl = resizeHandle;
    this.filterBtnEl = root.querySelector('#gc-btn-filter');
    this.filterMenuEl = filterMenu;
    this.filterDotEl = root.querySelector('#gc-filter-dot');

    this.restoreLayout();
    this.updateFilterDot();
    this.setupListeners();
    this.setupNetwork();

    G.gameChat = this;
  },

  setupListeners() {
    // Tab switching
    const tabBtns = this.container.querySelectorAll('.gc-tab');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx('ui');
        this.setTab(btn.dataset.tab);
      });
    });

    // Clear button
    const clearBtn = this.container.querySelector('#gc-btn-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx('ui');
        this.clearHistory();
      });
    }

    // Filter button & popover menu
    if (this.filterBtnEl && this.filterMenuEl) {
      this.filterBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx('ui');
        this.toggleFilterMenu();
      });

      const closeBtn = this.filterMenuEl.querySelector('#gc-filter-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleFilterMenu(false);
        });
      }

      // Checkbox toggles
      const checkboxes = this.filterMenuEl.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          sfx('ui');
          const channel = cb.dataset.channel;
          this.allFilters[channel] = cb.checked;
          this.saveFilters();
          this.updateFilterDot();
          if (this.activeTab === 'all') {
            this.setTab('all');
          }
        });
      });

      // Actions: Select all & Reset
      const allBtn = this.filterMenuEl.querySelector('#gc-filter-all');
      if (allBtn) {
        allBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sfx('ui');
          for (const k in this.allFilters) this.allFilters[k] = true;
          checkboxes.forEach(cb => cb.checked = true);
          this.saveFilters();
          this.updateFilterDot();
          if (this.activeTab === 'all') this.setTab('all');
        });
      }

      const resetBtn = this.filterMenuEl.querySelector('#gc-filter-reset');
      if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          sfx('ui');
          for (const k in this.allFilters) this.allFilters[k] = true;
          checkboxes.forEach(cb => cb.checked = true);
          this.saveFilters();
          this.updateFilterDot();
          if (this.activeTab === 'all') this.setTab('all');
        });
      }

      // Close menu when clicking outside
      document.addEventListener('pointerdown', (e) => {
        if (!this.filterMenuEl || this.filterMenuEl.classList.contains('hidden')) return;
        if (!this.filterMenuEl.contains(e.target) && !this.filterBtnEl.contains(e.target)) {
          this.toggleFilterMenu(false);
        }
      });
    }

    // Toggle / minimize button
    const toggleBtn = this.container.querySelector('#gc-btn-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx('ui');
        this.toggleMinimize();
      });
    }

    // Scroll to bottom button
    if (this.scrollBottomBtn) {
      this.scrollBottomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.scrollToBottom();
      });
    }

    // Detect user scrolling up
    this.bodyEl.addEventListener('scroll', () => {
      const isNearBottom = this.bodyEl.scrollHeight - this.bodyEl.scrollTop - this.bodyEl.clientHeight < 35;
      if (isNearBottom) {
        this.scrollBottomBtn.classList.add('hidden');
      }
    });

    // Channel cycle button
    if (this.channelBtn) {
      this.channelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx('ui');
        this.cycleChannel();
      });
    }

    // Send button
    const sendBtn = this.container.querySelector('#gc-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.submit();
      });
    }

    // Input Keydown handlers
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (this.isFilterMenuOpen) {
          this.toggleFilterMenu(false);
        } else {
          this.blur();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.navigateHistory(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.navigateHistory(1);
      } else if (e.key === 'Tab') {
        // Tab autocompletes /r with last whisper target
        const val = this.inputEl.value;
        if (!val || val === '/r' || val === '/r ') {
          e.preventDefault();
          if (this.lastWhisperFrom) {
            this.inputEl.value = `/w ${this.lastWhisperFrom} `;
            this.updateChannelUI('whisper', this.lastWhisperFrom);
          }
        }
      }
    });

    this.inputEl.addEventListener('focus', () => {
      this.isOpen = true;
      this.container.classList.add('active');
      if (this.isMinimized) this.toggleMinimize(false);
    });

    this.inputEl.addEventListener('blur', () => {
      this.isOpen = false;
      this.container.classList.remove('active');
    });

    // Hover effect persistence
    this.container.addEventListener('mouseenter', () => {
      this.container.classList.add('active');
    });
    this.container.addEventListener('mouseleave', () => {
      if (!this.isOpen) this.container.classList.remove('active');
    });

    // Clicking player name in chat to whisper
    this.messagesEl.addEventListener('click', (e) => {
      const senderEl = e.target.closest('.gc-sender');
      if (senderEl && senderEl.dataset.name) {
        e.stopPropagation();
        const target = senderEl.dataset.name;
        this.focus(`/w ${target} `);
      }
    });

    // In mobile portrait mode, default to minimized state
    if (document.body.classList.contains('portrait') || (window.innerHeight > window.innerWidth && G.touch)) {
      this.isMinimized = true;
      this.container.classList.add('minimized');
      const toggleBtn = this.container.querySelector('#gc-btn-toggle');
      if (toggleBtn) toggleBtn.innerHTML = '&#9650;';
    }

    this.setupDragAndResize();
    this.updatePortraitChatHeight();
  },

  setupDragAndResize() {
    if (!this.container || !this.headerEl || !this.resizeHandleEl) return;

    // Prevent text drag-selection on UI header, footer, tabs, buttons, dropdowns
    this.headerEl.addEventListener('selectstart', (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    });

    const footer = this.container.querySelector('#gc-footer');
    if (footer) {
      footer.addEventListener('selectstart', (e) => {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
        }
      });
    }

    // 1. Moving / Dragging: Drag on blank space in header
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onHeaderPointerDown = (e) => {
      // Don't drag if mobile portrait
      if (document.body.classList.contains('portrait') || (window.innerHeight > window.innerWidth && G.touch)) return;
      // Don't drag if clicked on button, tab, badge, input, etc.
      if (e.target.closest('button, input, select, textarea, a, .gc-badge')) return;
      if (e.button !== undefined && e.button !== 0) return; // primary click only

      e.preventDefault();
      isDragging = true;
      this.container.classList.add('is-dragging');

      const rect = this.container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      // Switch container to top/left coordinates
      this.container.style.left = `${initialLeft}px`;
      this.container.style.top = `${initialTop}px`;
      this.container.style.bottom = 'auto';
      this.container.style.right = 'auto';

      window.addEventListener('pointermove', onHeaderPointerMove, { passive: false });
      window.addEventListener('pointerup', onHeaderPointerUp);
      window.addEventListener('pointercancel', onHeaderPointerUp);
    };

    const onHeaderPointerMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      const rect = this.container.getBoundingClientRect();
      const maxLeft = Math.max(0, window.innerWidth - rect.width);
      const maxTop = Math.max(0, window.innerHeight - rect.height);

      const newLeft = Math.max(0, Math.min(maxLeft, initialLeft + dx));
      const newTop = Math.max(0, Math.min(maxTop, initialTop + dy));

      this.container.style.left = `${newLeft}px`;
      this.container.style.top = `${newTop}px`;
    };

    const onHeaderPointerUp = () => {
      if (isDragging) {
        isDragging = false;
        this.container.classList.remove('is-dragging');
        this.saveLayout();
        window.removeEventListener('pointermove', onHeaderPointerMove);
        window.removeEventListener('pointerup', onHeaderPointerUp);
        window.removeEventListener('pointercancel', onHeaderPointerUp);
      }
    };

    this.headerEl.addEventListener('pointerdown', onHeaderPointerDown);

    // 2. Resizing: Grab bottom right corner
    let isResizing = false;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let initialWidth = 0;
    let initialHeight = 0;

    const onResizePointerDown = (e) => {
      if (document.body.classList.contains('portrait') || (window.innerHeight > window.innerWidth && G.touch)) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      isResizing = true;
      this.container.classList.add('is-resizing');

      const rect = this.container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      initialWidth = rect.width;
      initialHeight = rect.height;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;

      this.container.style.left = `${initialLeft}px`;
      this.container.style.top = `${initialTop}px`;
      this.container.style.bottom = 'auto';
      this.container.style.right = 'auto';

      window.addEventListener('pointermove', onResizePointerMove, { passive: false });
      window.addEventListener('pointerup', onResizePointerUp);
      window.addEventListener('pointercancel', onResizePointerUp);
    };

    const onResizePointerMove = (e) => {
      if (!isResizing) return;
      e.preventDefault();

      const dx = e.clientX - resizeStartX;
      const dy = e.clientY - resizeStartY;

      const minW = 280;
      const maxW = Math.max(minW, window.innerWidth - initialLeft - 8);
      const minH = 120;
      const maxH = Math.max(minH, window.innerHeight - initialTop - 8);

      const newWidth = Math.max(minW, Math.min(maxW, initialWidth + dx));
      const newHeight = Math.max(minH, Math.min(maxH, initialHeight + dy));

      this.container.style.width = `${newWidth}px`;
      this.container.style.height = `${newHeight}px`;
    };

    const onResizePointerUp = () => {
      if (isResizing) {
        isResizing = false;
        this.container.classList.remove('is-resizing');
        this.saveLayout();
        window.removeEventListener('pointermove', onResizePointerMove);
        window.removeEventListener('pointerup', onResizePointerUp);
        window.removeEventListener('pointercancel', onResizePointerUp);
      }
    };

    this.resizeHandleEl.addEventListener('pointerdown', onResizePointerDown);

    // Keep within bounds on window resize
    window.addEventListener('resize', () => {
      this.updatePortraitChatHeight();
      this.clampToViewport();
    });
  },

  updatePortraitChatHeight() {
    const isPortrait = document.body.classList.contains('portrait') || (window.innerHeight > window.innerWidth && G.touch);
    if (!this.container) return;
    if (isPortrait) {
      const h = this.isMinimized ? 34 : Math.min(210, Math.round(window.innerHeight * 0.35));
      document.documentElement.style.setProperty('--portrait-chat-h', `${h}px`);
      const relayout = () => {
        if (typeof HUD !== 'undefined') HUD.layoutMobile();
        if (typeof TouchUI !== 'undefined') TouchUI.layout();
      };
      relayout();
      setTimeout(relayout, 50);
      setTimeout(relayout, 150);
      setTimeout(relayout, 250);
    } else {
      document.documentElement.style.removeProperty('--portrait-chat-h');
    }
  },

  clampToViewport() {
    if (!this.container || !this.container.style.top) return;
    const rect = this.container.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const curLeft = parseFloat(this.container.style.left) || rect.left;
    const curTop = parseFloat(this.container.style.top) || rect.top;
    this.container.style.left = `${Math.max(0, Math.min(maxLeft, curLeft))}px`;
    this.container.style.top = `${Math.max(0, Math.min(maxTop, curTop))}px`;
  },

  saveLayout() {
    if (!this.container) return;
    if (document.body.classList.contains('portrait') || (window.innerHeight > window.innerWidth && G.touch)) return;
    const rect = this.container.getBoundingClientRect();
    const layout = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hasCustomPos: true,
    };
    try {
      localStorage.setItem('velscour_chat_layout', JSON.stringify(layout));
    } catch (e) {}
  },

  restoreLayout() {
    if (!this.container) return;
    if (document.body.classList.contains('portrait') || (window.innerHeight > window.innerWidth && G.touch)) return;
    try {
      const raw = localStorage.getItem('velscour_chat_layout');
      if (!raw) return;
      const layout = JSON.parse(raw);
      if (layout.width) {
        const w = Math.max(280, Math.min(window.innerWidth - 16, layout.width));
        this.container.style.width = `${w}px`;
      }
      if (layout.height) {
        const h = Math.max(120, Math.min(window.innerHeight - 30, layout.height));
        this.container.style.height = `${h}px`;
      }
      if (layout.hasCustomPos && layout.left != null && layout.top != null) {
        const rect = this.container.getBoundingClientRect();
        const left = Math.max(0, Math.min(window.innerWidth - rect.width, layout.left));
        const top = Math.max(0, Math.min(window.innerHeight - rect.height, layout.top));
        this.container.style.left = `${left}px`;
        this.container.style.top = `${top}px`;
        this.container.style.bottom = 'auto';
        this.container.style.right = 'auto';
      }
    } catch (e) {}
  },

  setupNetwork() {
    // Incoming whispers and channel messages from server
    net.on('chat', (data) => {
      if (!data) return;
      if (data.kind === 'whisper') {
        this.lastWhisperFrom = data.from;
        this.addMessage({
          tab: 'whisper',
          channel: 'whisper',
          from: data.from,
          text: data.text,
          time: data.time,
        });
        if (UI.logWhisper) UI.logWhisper(data.from, data.text);
      } else if (data.kind === 'whisper_sent') {
        this.addMessage({
          tab: 'whisper',
          channel: 'whisper',
          to: data.to,
          text: data.text,
          isSelf: true,
          time: data.time,
        });
      } else if (data.kind === 'channel') {
        this.addMessage({
          tab: 'lobby',
          channel: 'lobby',
          from: data.from,
          text: data.text,
          time: data.time,
        });
      } else if (data.kind === 'system') {
        this.addMessage({
          tab: 'system',
          channel: 'system',
          text: data.text,
          color: data.color || '#ffd34a',
          time: data.time,
        });
      } else if (data.kind === 'emote') {
        this.addMessage({
          tab: 'lobby',
          channel: 'lobby',
          text: data.text,
          color: '#ffc040',
          time: data.time,
        });
      }
    });

    // Incoming party chat from room members
    net.on('game_party_chat', (data) => {
      if (!data) return;
      if ((data.fromId && data.fromId === net.myId) || (data.from && data.from === G.char?.name)) {
        return; // Prevent duplicate self echo
      }
      const rp = G.remotePlayers?.get(data.fromId) || Array.from(G.remotePlayers?.values() || []).find(p => p.name === data.from);
      if (rp) rp.showChat(data.text);
      this.addMessage({
        tab: 'party',
        channel: 'party',
        from: data.from,
        text: data.text,
        time: data.time,
      });
      if (UI.logParty) UI.logParty(data.from || 'Ally', data.text);
    });
  },

  formatTime(ts) {
    const d = ts ? new Date(ts) : new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  },

  addMessage(msg) {
    if (!this.container) this.init();

    const id = Date.now() + Math.random().toString(36).slice(2, 6);
    const entry = {
      id,
      tab: msg.tab || 'system',
      channel: msg.channel || msg.tab || 'system',
      from: msg.from || null,
      to: msg.to || null,
      text: msg.text || '',
      html: msg.html || null,
      color: msg.color || null,
      isSelf: !!msg.isSelf,
      time: msg.time || Date.now(),
    };

    this.messages.push(entry);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    // Determine if visible in current tab
    const isVisible = (this.activeTab === 'all' ? this.isChannelAllowedInAll(entry.tab) : this.activeTab === entry.tab);
    if (isVisible) {
      this.renderMessageRow(entry);
      this.handleAutoScroll();
    } else {
      // Unread count badge
      const tabKey = entry.tab;
      if (tabKey && this.unread[tabKey] !== undefined) {
        this.unread[tabKey]++;
        this.updateBadge(tabKey);
      }
    }
  },

  renderMessageRow(entry) {
    if (!this.messagesEl) return;

    const row = el('div', `gc-msg gc-${entry.tab}`);
    if (entry.color) row.style.color = entry.color;

    const timeStr = this.formatTime(entry.time);
    let html = `<span class="gc-time">[${timeStr}]</span> `;

    if (entry.tab === 'party') {
      html += `<span class="gc-tag tag-party">Party</span> `;
      const senderClass = entry.isSelf ? 'sender-self' : 'sender-party';
      html += `<span class="gc-sender ${senderClass}" data-name="${escapeHtml(entry.from || '')}">&lt;${escapeHtml(entry.from || 'Hero')}&gt;:</span> `;
      html += `<span class="gc-text">${escapeHtml(entry.text)}</span>`;
    } else if (entry.tab === 'whisper') {
      if (entry.isSelf) {
        html += `<span class="gc-tag tag-whisper-to">To</span> `;
        html += `<span class="gc-sender sender-self" data-name="${escapeHtml(entry.to || '')}">&lt;${escapeHtml(entry.to || '')}&gt;:</span> `;
      } else {
        html += `<span class="gc-tag tag-whisper">From</span> `;
        html += `<span class="gc-sender sender-whisper" data-name="${escapeHtml(entry.from || '')}">&lt;${escapeHtml(entry.from || '')}&gt;:</span> `;
      }
      html += `<span class="gc-text" style="color:#f2aeff">${escapeHtml(entry.text)}</span>`;
    } else if (entry.tab === 'lobby') {
      html += `<span class="gc-tag tag-lobby">Lobby</span> `;
      if (entry.from) {
        html += `<span class="gc-sender sender-lobby" data-name="${escapeHtml(entry.from)}">&lt;${escapeHtml(entry.from)}&gt;:</span> `;
      }
      html += `<span class="gc-text">${escapeHtml(entry.text)}</span>`;
    } else {
      // System or custom log
      html += `<span class="gc-tag tag-system">System</span> `;
      if (entry.html) {
        html += `<span class="gc-text">${entry.html}</span>`;
      } else {
        html += `<span class="gc-text">${escapeHtml(entry.text)}</span>`;
      }
    }

    row.innerHTML = html;
    this.messagesEl.appendChild(row);

    // Limit visible DOM rows to 150 for peak performance
    while (this.messagesEl.children.length > 150) {
      this.messagesEl.firstChild.remove();
    }
  },

  handleAutoScroll() {
    if (!this.bodyEl) return;
    const isNearBottom = this.bodyEl.scrollHeight - this.bodyEl.scrollTop - this.bodyEl.clientHeight < 45;
    if (isNearBottom) {
      this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
      if (this.scrollBottomBtn) this.scrollBottomBtn.classList.add('hidden');
    } else {
      if (this.scrollBottomBtn) this.scrollBottomBtn.classList.remove('hidden');
    }
  },

  scrollToBottom() {
    if (!this.bodyEl) return;
    this.bodyEl.scrollTo({ top: this.bodyEl.scrollHeight, behavior: 'smooth' });
    if (this.scrollBottomBtn) this.scrollBottomBtn.classList.add('hidden');
  },

  setTab(tab) {
    this.activeTab = tab;
    // Update tab button styles
    const tabs = this.container.querySelectorAll('.gc-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

    // Clear unread
    this.unread[tab] = 0;
    this.updateBadge(tab);

    // Re-render matching messages
    if (this.messagesEl) {
      this.messagesEl.innerHTML = '';
      const filtered = this.messages.filter(m => (tab === 'all' ? this.isChannelAllowedInAll(m.tab) : m.tab === tab));
      for (const m of filtered) {
        this.renderMessageRow(m);
      }
      this.scrollToBottom();
    }
  },

  toggleFilterMenu(force = null) {
    this.isFilterMenuOpen = force != null ? force : !this.isFilterMenuOpen;
    if (this.filterMenuEl) {
      this.filterMenuEl.classList.toggle('hidden', !this.isFilterMenuOpen);
    }
    if (this.filterBtnEl) {
      this.filterBtnEl.classList.toggle('active', this.isFilterMenuOpen);
    }
    if (this.container) {
      this.container.classList.toggle('active', this.isFilterMenuOpen || this.isOpen);
    }
  },

  saveFilters() {
    try {
      localStorage.setItem('velscour_chat_all_filters', JSON.stringify(this.allFilters));
    } catch (e) {}
  },

  updateFilterDot() {
    const isFiltered = Object.values(this.allFilters).some(v => v === false);
    if (this.filterDotEl) this.filterDotEl.classList.toggle('hidden', !isFiltered);
    if (this.filterBtnEl) this.filterBtnEl.classList.toggle('has-filter', isFiltered);
  },

  isChannelAllowedInAll(channel) {
    if (channel === 'whisper_sent') channel = 'whisper';
    return this.allFilters[channel] !== false;
  },

  updateBadge(tab) {
    const badge = this.container?.querySelector(`#gc-badge-${tab}`);
    if (!badge) return;
    const count = this.unread[tab] || 0;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
      badge.classList.add('pulse');
    } else {
      badge.classList.add('hidden');
      badge.classList.remove('pulse');
    }
  },

  clearHistory() {
    this.messages = [];
    if (this.messagesEl) this.messagesEl.innerHTML = '';
    for (const k in this.unread) this.unread[k] = 0;
    this.container.querySelectorAll('.gc-badge').forEach(b => b.classList.add('hidden'));
    if (this.scrollBottomBtn) this.scrollBottomBtn.classList.add('hidden');
  },

  toggleMinimize(force = null) {
    this.isMinimized = force != null ? force : !this.isMinimized;
    this.container.classList.toggle('minimized', this.isMinimized);
    const toggleBtn = this.container.querySelector('#gc-btn-toggle');
    if (toggleBtn) toggleBtn.innerHTML = this.isMinimized ? '&#9650;' : '&#9660;';
    this.updatePortraitChatHeight();
  },

  cycleChannel() {
    const channels = ['party', 'lobby'];
    if (this.lastWhisperFrom) channels.push('whisper');
    let idx = channels.indexOf(this.activeChannel);
    idx = (idx + 1) % channels.length;
    this.activeChannel = channels[idx];
    this.updateChannelUI(this.activeChannel, this.lastWhisperFrom);
  },

  updateChannelUI(ch, target = null) {
    this.activeChannel = ch;
    if (this.channelLabel) {
      if (ch === 'whisper' && target) {
        this.channelLabel.textContent = `W: ${target}`;
        this.channelBtn.className = 'gc-channel-btn ch-whisper';
      } else if (ch === 'lobby') {
        this.channelLabel.textContent = 'Lobby';
        this.channelBtn.className = 'gc-channel-btn ch-lobby';
      } else {
        this.channelLabel.textContent = 'Party';
        this.channelBtn.className = 'gc-channel-btn';
      }
    }
  },

  focus(prefix = '') {
    if (!this.container) this.init();
    if (this.isMinimized) this.toggleMinimize(false);
    this.container.classList.add('active');
    this.isOpen = true;
    if (this.inputEl) {
      if (prefix) this.inputEl.value = prefix;
      this.inputEl.focus();
    }
  },

  blur() {
    if (this.inputEl) {
      this.inputEl.blur();
      this.inputEl.value = '';
    }
    this.isOpen = false;
    this.container?.classList.remove('active');
  },

  navigateHistory(dir) {
    if (!this.sentHistory.length) return;
    if (this.historyIndex === -1 && dir === -1) {
      this.historyIndex = this.sentHistory.length - 1;
    } else {
      this.historyIndex += dir;
    }
    this.historyIndex = Math.max(-1, Math.min(this.sentHistory.length - 1, this.historyIndex));
    if (this.historyIndex >= 0) {
      this.inputEl.value = this.sentHistory[this.historyIndex];
    } else {
      this.inputEl.value = '';
    }
  },

  submit() {
    const raw = this.inputEl?.value?.trim();
    if (!raw) {
      this.blur();
      return;
    }

    sfx('ui');
    this.sentHistory.push(raw);
    if (this.sentHistory.length > 40) this.sentHistory.shift();
    this.historyIndex = -1;

    let text = raw;

    // Command handling
    if (text.startsWith('/w ') || text.startsWith('/whisper ')) {
      const parts = text.split(' ');
      const target = parts[1];
      const wMsg = parts.slice(2).join(' ');
      if (target && wMsg) {
        this.whisperTarget = target;
        net.sendChat(text);
      } else {
        this.addMessage({ tab: 'system', text: 'Usage: /w <playername> <message>', color: '#ff6060' });
      }
    } else if (text.startsWith('/r ') || text.startsWith('/reply ') || text === '/r' || text === '/reply') {
      if (!this.lastWhisperFrom) {
        this.addMessage({ tab: 'system', text: 'Nobody has whispered you yet to reply to.', color: '#ff6060' });
      } else {
        const replyMsg = text.replace(/^\/(?:r|reply)\s*/, '').trim();
        if (replyMsg) {
          net.sendChat(`/w ${this.lastWhisperFrom} ${replyMsg}`);
        } else {
          this.focus(`/w ${this.lastWhisperFrom} `);
          return;
        }
      }
    } else if (text.startsWith('/p ') || text.startsWith('/party ')) {
      const pMsg = text.replace(/^\/(?:p|party)\s+/, '').trim();
      if (pMsg) {
        this.sendPartyMessage(pMsg);
      }
    } else if (text.startsWith('/l ') || text.startsWith('/all ') || text.startsWith('/global ')) {
      const lMsg = text.replace(/^\/(?:l|all|global)\s+/, '').trim();
      if (lMsg) {
        net.sendChat(text);
      }
    } else if (text === '/clear') {
      this.clearHistory();
    } else if (text === '/players' || text === '/who') {
      net.sendChat('/players');
    } else if (text === '/help') {
      this.addMessage({
        tab: 'system',
        text: 'Commands: /w <name> <msg> (Whisper), /r <msg> (Reply), /p <msg> (Party), /l <msg> (Lobby), /players (Who is online), /clear',
        color: '#ffd34a',
      });
    } else {
      // Contextual send according to active channel
      if (this.activeChannel === 'whisper' && this.whisperTarget) {
        net.sendChat(`/w ${this.whisperTarget} ${text}`);
      } else if (this.activeChannel === 'lobby') {
        net.sendChat(text);
      } else {
        this.sendPartyMessage(text);
      }
    }

    this.inputEl.value = '';
    this.blur();
  },

  sendPartyMessage(msg) {
    if (G.room && net.connected) {
      net.sendPartyChat(msg);
    }
    if (G.player) {
      G.player.chatBubble = msg;
      G.player.chatTimer = 4.5;
      G.player.chatAge = 0;
    }
    const myName = G.char?.name || 'Hero';
    // Optimistic local add
    this.addMessage({
      tab: 'party',
      channel: 'party',
      from: myName,
      text: msg,
      isSelf: true,
    });
    if (UI.logParty) UI.logParty(myName, msg);
  },

  addSystemLog(html, color) {
    this.addMessage({
      tab: 'system',
      channel: 'system',
      html,
      color: color || '#ffd34a',
    });
  },

  show() {
    if (!this.container) this.init();
    this.container.classList.remove('hidden');
  },

  hide() {
    if (this.container) this.container.classList.add('hidden');
  }
};

if (typeof window !== 'undefined') {
  window.GameChat = GameChat;
}
