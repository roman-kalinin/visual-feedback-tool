'use strict';

if (window.__vftOverlayActive) {
  // already injected — do nothing
} else {
  window.__vftOverlayActive = true;
  window.__vftAnnotations = [];

  // ── Constants ────────────────────────────────────────────────────────────────
  const SERVER_URL     = 'http://localhost:3333';
  const FONT           = 'Cabin, system-ui, sans-serif';
  const C_INDIGO       = '#6366f1';
  const C_RED          = '#ef4444';
  const C_GREEN        = '#34d399';
  const C_BLUE         = '#0C8CE9';
  const C_BG           = '#1e1e1e';
  const C_BORDER       = 'rgba(255,255,255,0.14)';
  const C_TEXT         = '#e2e8f0';
  const C_MUTED        = '#8b9eb0';
  const MARKER_R       = 12;
  const STROKE_W       = 2.5;
  const POLL_MS        = 4000;
  const TOAST_MS       = 3000;
  const Z_TOP          = '2147483647';
  const Z_CANVAS       = '2147483646';
  const POPUP_W        = 280;

  // ── Canvas ──────────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id = 'vft-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  Object.assign(canvas.style, {
    position: 'fixed', top: '0', left: '0',
    width: '100vw', height: '100vh',
    zIndex: Z_CANVAS, pointerEvents: 'none', cursor: 'crosshair'
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // ── Toolbar ─────────────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.id = 'vft-toolbar';
  window.__vftToolbar = toolbar;
  toolbar.innerHTML = `
    <div class="vft-status" id="vft-status-cluster" title="">
      <span class="vft-status-dot vft-dot-offline"></span>
      <span class="vft-mcp-label" id="vft-mcp-label">MCP</span>
    </div>
    <button data-tool="edit" title="Edit elements (E)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
    <div class="vft-divider"></div>
    <button data-tool="draw" title="Freehand Draw (X)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
      </svg>
    </button>
    <button data-tool="comment" title="Click or drag to comment (C)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    </button>
    <button data-tool="clear" title="Clear All">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </button>
    <button data-tool="freeze" title="Freeze page states (F)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>
        <polyline points="10 4 12 2 14 4"/><polyline points="10 20 12 22 14 20"/><polyline points="4 10 2 12 4 14"/><polyline points="20 10 22 12 20 14"/>
      </svg>
    </button>
    <div class="vft-divider"></div>
    <button data-tool="settings" title="Settings">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
    <button data-tool="help" title="Help">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </button>
    <div class="vft-divider"></div>
    <div class="vft-review-wrap">
      <button data-tool="review" title="Review buffer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      </button>
      <span class="vft-buf-badge" id="vft-buf-badge"></span>
    </div>
    <button data-tool="send" title="Add current annotations as a task for Claude">
      <span class="vft-state-default"><span class="vft-btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></span> Add task</span>
      <span class="vft-state-success"><span class="vft-btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> Added to buffer</span>
    </button>
    <div class="vft-divider"></div>
    <button data-tool="close" title="Close overlay (Esc)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;
  document.body.appendChild(toolbar);

  // ── Settings ─────────────────────────────────────────────────────────────────
  const DEFAULT_SETTINGS = {
    screenshotQuality: 'medium',   // low | medium | high
    detailLevel: 'standard',       // minimal | standard | verbose
    screenshotMode: 'always'       // always | smart | never
  };

  window.__vftSettings = { ...DEFAULT_SETTINGS };

  try {
    chrome.storage.local.get('vftSettings', result => {
      if (result.vftSettings) Object.assign(window.__vftSettings, result.vftSettings);
    });
  } catch {}

  function saveSettings() {
    try { chrome.storage.local.set({ vftSettings: window.__vftSettings }); } catch {}
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function recalcCommentCounter() {
    commentCounter = window.__vftAnnotations.reduce(
      (m, a) => a.type === 'comment' ? Math.max(m, a.index) : m, 0
    );
  }

  function radioGroup(name, options, current) {
    return options.map(opt => {
      const active = current === opt.value;
      return `<button class="vft-sp-option${active ? ' vft-sp-active' : ''}" data-group="${name}" data-value="${opt.value}" title="${opt.desc || ''}">${opt.label}</button>`;
    }).join('');
  }

  // ── State ────────────────────────────────────────────────────────────────────
  let isFrozen = false;
  let freezeStyleEl = null;
  let freezeBanner = null;
  let activeTool = null;
  let isDrawing = false;
  let currentPath = [];
  let dragStart = null;
  let commentCounter = 0;
  let activePopup = null;
  let undoStack = [];
  let redoStack = [];
  let hoveredComment = null;

  // ── Edit mode state ───────────────────────────────────────────────────────────
  let isEditMode     = false;
  let editSelectedEl = null;
  let editHighlight  = null;
  let editHoverOverlay = null;
  let editChanges    = [];
  let editActiveTool = 'select';
  let editJustResized = false;
  let editUndoStack  = [];
  let editRedoStack  = [];
  let scrubState     = null; // { input, startX, startVal, prop, oldVal }

  function snapshotForUndo() {
    undoStack.push(JSON.stringify(window.__vftAnnotations));
    redoStack = [];
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(window.__vftAnnotations));
    window.__vftAnnotations = JSON.parse(undoStack.pop());
    recalcCommentCounter();
    redrawAll();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(window.__vftAnnotations));
    window.__vftAnnotations = JSON.parse(redoStack.pop());
    recalcCommentCounter();
    redrawAll();
  }

  // ── Cached DOM refs ───────────────────────────────────────────────────────────
  let btnDraw     = toolbar.querySelector('[data-tool="draw"]');
  let btnComment  = toolbar.querySelector('[data-tool="comment"]');
  let statusDot   = toolbar.querySelector('.vft-status-dot');
  let mcpLabel    = toolbar.querySelector('#vft-mcp-label');
  let statusCluster = toolbar.querySelector('#vft-status-cluster');

  function rebindToolbarRefs() {
    btnDraw       = toolbar.querySelector('[data-tool="draw"]');
    btnComment    = toolbar.querySelector('[data-tool="comment"]');
    statusDot     = toolbar.querySelector('.vft-status-dot');
    mcpLabel      = toolbar.querySelector('#vft-mcp-label');
    statusCluster = toolbar.querySelector('#vft-status-cluster');
  }

  function registerStatusClusterClick() {
    statusCluster?.addEventListener('click', () => {
      if (lastMcpError) showToast(lastMcpError, true);
    });
  }

  // ── Toolbar events ───────────────────────────────────────────────────────────
  toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-tool]');
    if (!btn) return;
    const tool = btn.dataset.tool;

    if (tool === 'clear') {
      snapshotForUndo();
      window.__vftAnnotations = [];
      commentCounter = 0;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setActiveTool(null);
      return;
    }
    if (tool === 'freeze')        { toggleFreeze(); return; }
    if (tool === 'review')        { toggleReviewPanel(); return; }
    if (tool === 'settings')      { toggleSettingsPanel(); return; }
    if (tool === 'help')          { toggleHelpPanel(); return; }
    if (tool === 'close')         { handleCloseButton(); return; }


    if (tool === 'send') {
      // Flush edit mode changes before sending
      if (isEditMode) flushEditAnnotation();
      const sendBtn = toolbar.querySelector('[data-tool="send"]');
      chrome.runtime.sendMessage({ type: 'CAPTURE_AND_SEND' }, response => {
        if (chrome.runtime.lastError) {
          showToast('Send failed — check MCP server', true);
          return;
        }
        if (response?.ok) {
          // Animate first — before any other DOM mutations
          animateAddTaskBtn(sendBtn);
          // Auto-clear canvas
          window.__vftAnnotations = [];
          commentCounter = 0;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Clear edit state without exiting edit mode
          editChanges = [];
          editUndoStack = [];
          editRedoStack = [];
          const commentInput = document.querySelector('#vft-ep-comment');
          if (commentInput) commentInput.value = '';
          // Defer badge/panel updates so they don't repaint in the same frame
          setTimeout(() => {
            updateBufferCount(response.bufferCount);
            if (reviewPanel) loadReviewItems();
          }, 50);
        } else {
          showToast(`Send failed: ${response?.error || 'unknown error'}`, true);
        }
      });
      return;
    }

    setActiveTool(activeTool === tool ? null : tool);
  });

  function makeSendSVG(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
  }
  function makeCheckSVG(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  }

  function animateAddTaskBtn(btn) {
    btn.style.pointerEvents = 'none';
    const sendIcon = btn.querySelector('.vft-state-default .vft-btn-icon');
    if (sendIcon) sendIcon.classList.add('vft-btn-icon-fly');

    setTimeout(() => {
      btn.classList.add('vft-btn-success');
    }, 220);

    setTimeout(() => {
      btn.classList.remove('vft-btn-success');
      if (sendIcon) sendIcon.classList.remove('vft-btn-icon-fly');
      btn.style.pointerEvents = '';
    }, 1750);
  }

  function setActiveTool(tool) {
    // Exit edit mode if switching away from it
    if (isEditMode && tool !== 'edit') exitEditMode();
    // Enter/exit edit mode
    if (tool === 'edit') {
      if (isEditMode) { exitEditMode(); tool = null; }
      else enterEditMode();
    }
    activeTool = tool;
    canvas.style.pointerEvents = (tool && tool !== 'edit') ? 'all' : 'none';
    btnDraw?.classList.toggle('vft-active', tool === 'draw');
    btnComment?.classList.toggle('vft-active', tool === 'comment');
    const btnEdit = toolbar.querySelector('[data-tool="edit"]');
    if (btnEdit) btnEdit.classList.toggle('vft-active', tool === 'edit');
  }

  // ── Element inspector ────────────────────────────────────────────────────────
  const STYLE_PROPS = [
    'fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color',
    'backgroundColor','padding','margin','border','borderRadius',
    'display','flexDirection','gap','alignItems','justifyContent',
    'width','height','maxWidth','maxHeight','opacity','boxShadow'
  ];
  const STYLE_DEFAULTS = new Set([
    '0px', '0', 'normal', 'none', '1', 'rgba(0, 0, 0, 0)', 'transparent',
    'visible', 'auto', 'stretch', 'start', 'baseline', 'static',
    '0px 0px', '0px 0px 0px 0px', 'medium none currentcolor', ''
  ]);

  function getComputedStyles(target) {
    try {
      const cs = window.getComputedStyle(target);
      const styles = {};
      for (const prop of STYLE_PROPS) {
        const val = cs.getPropertyValue(prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase()));
        if (val && !STYLE_DEFAULTS.has(val)) styles[prop] = val;
      }
      return Object.keys(styles).length > 0 ? styles : null;
    } catch { return null; }
  }

  function elementToInfo(target) {
    const rect = target.getBoundingClientRect();
    const info = {
      tag: target.tagName.toLowerCase(),
      id: target.id || null,
      classes: typeof target.className === 'string' ? target.className.trim().split(/\s+/).filter(Boolean).slice(0, 6) : [],
      text: (target.textContent || '').trim().slice(0, 80) || null,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      dataAttrs: target.dataset ? Object.fromEntries(Object.entries(target.dataset).slice(0, 4)) : {}
    };
    if (window.__vftSettings?.detailLevel === 'verbose') {
      const styles = getComputedStyles(target);
      if (styles) info.styles = styles;
    }
    return info;
  }

  function resolveElement(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    let target = el;
    for (let i = 0; i < 5; i++) {
      if (!target || target === document.body) break;
      if (target.id || target.dataset && Object.keys(target.dataset).length > 0) break;
      if (target.className && typeof target.className === 'string' && target.className.trim()) break;
      target = target.parentElement;
    }
    return target || el;
  }

  function getElementAt(x, y) {
    canvas.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x, y);
    canvas.style.pointerEvents = activeTool ? 'all' : 'none';
    const resolved = resolveElement(el);
    return resolved ? elementToInfo(resolved) : null;
  }

  function getElementsInArea(ax, ay, aw, ah) {
    canvas.style.pointerEvents = 'none';
    const x1 = Math.min(ax, ax + aw), y1 = Math.min(ay, ay + ah);
    const x2 = Math.max(ax, ax + aw), y2 = Math.max(ay, ay + ah);
    const seen = new Set();
    const results = [];
    const step = 25;
    for (let x = x1 + step / 2; x < x2; x += step) {
      for (let y = y1 + step / 2; y < y2; y += step) {
        const el = document.elementFromPoint(x, y);
        const resolved = resolveElement(el);
        if (!resolved || seen.has(resolved)) continue;
        seen.add(resolved);
        const r = resolved.getBoundingClientRect();
        if (r.right < x1 || r.left > x2 || r.bottom < y1 || r.top > y2) continue;
        results.push(elementToInfo(resolved));
        if (results.length >= 15) break;
      }
      if (results.length >= 15) break;
    }
    canvas.style.pointerEvents = activeTool ? 'all' : 'none';
    return results;
  }

  // ── Canvas mouse events ──────────────────────────────────────────────────────
  canvas.addEventListener('mousedown', e => {
    if (activeTool === 'draw') {
      isDrawing = true;
      currentPath = [{ x: e.clientX, y: e.clientY }];
      ctx.beginPath();
      ctx.moveTo(e.clientX, e.clientY);
      ctx.strokeStyle = C_RED;
      ctx.lineWidth = STROKE_W;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    if (activeTool === 'comment') {
      dragStart = { x: e.clientX, y: e.clientY };
      isDrawing = true;
    }
  });

  canvas.addEventListener('mousemove', e => {
    if (!isDrawing) return;
    if (activeTool === 'draw') {
      currentPath.push({ x: e.clientX, y: e.clientY });
      ctx.lineTo(e.clientX, e.clientY);
      ctx.stroke();
    }
    if (activeTool === 'comment' && dragStart) {
      redrawAll();
      drawRectShape(dragStart.x, dragStart.y, e.clientX - dragStart.x, e.clientY - dragStart.y, true);
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (!isDrawing) return;
    isDrawing = false;

    if (activeTool === 'draw' && currentPath.length > 1) {
      snapshotForUndo();
      window.__vftAnnotations.push({ type: 'draw', points: [...currentPath], color: C_RED, strokeWidth: STROKE_W });
      currentPath = [];
    }

    if (activeTool === 'comment' && dragStart) {
      const w = e.clientX - dragStart.x, h = e.clientY - dragStart.y;
      const isDrag = Math.abs(w) > 8 && Math.abs(h) > 8;

      if (isDrag) {
        const cx = dragStart.x + w / 2, cy = dragStart.y + h / 2;
        const element = getElementAt(cx, cy);
        const elements = getElementsInArea(dragStart.x, dragStart.y, w, h);
        const area = { x: dragStart.x, y: dragStart.y, width: w, height: h };
        dragStart = null;
        redrawAll();
        spawnCommentPopup(e.clientX, e.clientY, area, element, elements);
      } else {
        const editIdx = findCommentAtPoint(dragStart.x, dragStart.y);
        if (editIdx >= 0) {
          dragStart = null;
          spawnCommentPopup(null, null, null, null, null, editIdx);
        } else {
          const element = getElementAt(dragStart.x, dragStart.y);
          const pt = { x: dragStart.x, y: dragStart.y };
          dragStart = null;
          redrawAll();
          spawnCommentPopup(pt.x, pt.y, null, element, null);
        }
      }
    }
  });

  // ── Drawing helpers ──────────────────────────────────────────────────────────
  function drawRectShape(x, y, w, h, isPreview) {
    ctx.strokeStyle = isPreview ? C_INDIGO + '99' : C_INDIGO;
    ctx.lineWidth = 2;
    ctx.setLineDash(isPreview ? [6, 3] : []);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (!isPreview) {
      ctx.fillStyle = 'rgba(99,102,241,0.06)';
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawMarker(x, y, index, alpha) {
    ctx.beginPath();
    ctx.arc(x, y, MARKER_R, 0, Math.PI * 2);
    ctx.fillStyle = alpha ? C_INDIGO + 'aa' : C_INDIGO;
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index), x, y);
  }

  function drawComment(x, y, text, index, area, showBubble = false, images) {
    if (area) {
      drawRectShape(area.x, area.y, area.width, area.height, false);
      const cornerX = area.width >= 0 ? area.x + area.width : area.x;
      const cornerY = area.height >= 0 ? area.y : area.y + area.height;
      ctx.beginPath();
      ctx.strokeStyle = C_INDIGO;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(x, y);
      ctx.lineTo(cornerX, cornerY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawMarker(x, y, index);

    if (showBubble) {
      const padding = 7;
      ctx.font = `12px ${FONT}`;
      const imgSuffix = images && images.length ? ` \uD83D\uDCCE${images.length}` : '';
      const fullText = (text || '(no text)') + imgSuffix;
      const metrics = ctx.measureText(fullText);
      const bx = x + 18, by = y - 15;
      const bw = Math.min(metrics.width + padding * 2, 260), bh = 24;
      ctx.fillStyle = C_INDIGO;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 5);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let displayText = fullText;
      while (ctx.measureText(displayText).width > bw - padding * 2 && displayText.length > 0) {
        displayText = displayText.slice(0, -1);
      }
      ctx.fillText(displayText, bx + padding, by + bh / 2);
    }
  }

  function redrawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const ann of window.__vftAnnotations) {
      if (ann.type === 'draw') {
        ctx.beginPath();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ann.points.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
        ctx.stroke();
      }
      if (ann.type === 'comment') drawComment(ann.x, ann.y, ann.text, ann.index, ann.area || null, ann === hoveredComment, ann.images);
    }
  }

  // ── Comment hover ────────────────────────────────────────────────────────────
  document.addEventListener('mousemove', e => {
    if (isDrawing || activePopup) return;
    let found = null;
    for (const ann of window.__vftAnnotations) {
      if (ann.type !== 'comment') continue;
      if (Math.sqrt((ann.x - e.clientX) ** 2 + (ann.y - e.clientY) ** 2) <= 14) { found = ann; break; }
    }
    if (found !== hoveredComment) {
      hoveredComment = found;
      redrawAll();
    }
  });

  // ── Comment popup (shared for input + edit) ──────────────────────────────────
  function positionPopup(popup, anchorX, anchorY) {
    const popupHeight = 160;
    const margin = 12;
    let left = anchorX + 14;
    let top  = anchorY - 16;
    if (left + POPUP_W > window.innerWidth - margin) left = anchorX - POPUP_W - 14;
    if (top + popupHeight > window.innerHeight - margin) top = anchorY - popupHeight - 14;
    if (top < margin) top = margin;
    if (left < margin) left = margin;
    popup.style.left = `${left}px`;
    popup.style.top  = `${top}px`;
  }

  function createCommentPopup(anchorX, anchorY, element, prefillText, prefillImages) {
    const popup = document.createElement('div');
    popup.className = 'vft-comment-popup';
    positionPopup(popup, anchorX, anchorY);

    // Track pasted images on the popup element itself
    popup._images = prefillImages ? [...prefillImages] : [];

    const elementHint = element
      ? `<div class="vft-comment-hint">
           ${element.id ? `#${esc(element.id)}` : ''}
           ${esc(element.tag)}
           ${element.text ? `&middot; "${esc(element.text.slice(0, 40))}${element.text.length > 40 ? '&hellip;' : ''}"` : ''}
         </div>`
      : '';

    popup.innerHTML = `
      ${elementHint}
      <textarea id="vft-comment-input" class="vft-comment-textarea"
        placeholder="Add comment… (Enter to save, Shift+Enter for newline)"
      ></textarea>
      <div class="vft-comment-images" id="vft-comment-images"></div>
      <div class="vft-comment-paste-hint" id="vft-comment-paste-hint">Paste image with Ctrl+V</div>
      <div class="vft-comment-actions">
        <button id="vft-comment-cancel" class="vft-comment-btn vft-comment-btn-cancel">Cancel</button>
        <button id="vft-comment-save"   class="vft-comment-btn vft-comment-btn-save">Save</button>
      </div>
    `;

    if (prefillText) popup.querySelector('#vft-comment-input').value = prefillText;

    // Render any prefilled images
    if (popup._images.length) renderPopupImages(popup);

    // Intercept paste on the textarea — images go to the strip, not as text
    popup.querySelector('#vft-comment-input').addEventListener('paste', e => {
      if ([...e.clipboardData.items].some(i => i.type.startsWith('image/'))) {
        handleImagePaste(e, popup);
      }
    });

    return popup;
  }

  function handleImagePaste(e, popup) {
    const items = [...e.clipboardData.items].filter(i => i.type.startsWith('image/'));
    if (!items.length) return;
    e.preventDefault();
    items.forEach(item => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target.result;
        // Cap at ~2MB base64 to stay well within structured-clone limits
        if (dataUrl.length > 2_800_000) {
          showToast('Image too large — try a smaller screenshot (max ~2MB)', true);
          return;
        }
        popup._images.push(dataUrl);
        renderPopupImages(popup);
      };
      reader.readAsDataURL(file);
    });
  }

  function renderPopupImages(popup) {
    const strip = popup.querySelector('#vft-comment-images');
    const hint  = popup.querySelector('#vft-comment-paste-hint');
    if (!strip) return;
    strip.innerHTML = '';
    popup._images.forEach((src, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'vft-img-thumb-wrap';
      const img = document.createElement('img');
      img.src = src;
      img.className = 'vft-img-thumb';
      const remove = document.createElement('button');
      remove.className = 'vft-img-thumb-remove';
      remove.title = 'Remove image';
      remove.innerHTML = '×';
      remove.addEventListener('click', e => {
        e.stopPropagation();
        popup._images.splice(idx, 1);
        renderPopupImages(popup);
      });
      wrap.appendChild(img);
      wrap.appendChild(remove);
      strip.appendChild(wrap);
    });
    if (hint) hint.style.display = popup._images.length ? 'none' : '';
  }

  /**
   * Unified comment popup — handles both new comments and edits.
   * Pass editIndex >= 0 to edit an existing annotation; otherwise provide x, y for new.
   */
  function spawnCommentPopup(x, y, area, element, elements, editIndex = -1) {
    const isEdit = editIndex >= 0;
    const ann = isEdit ? window.__vftAnnotations[editIndex] : null;
    if (isEdit && (!ann || ann.type !== 'comment')) return;

    const anchorX = isEdit ? ann.x : x;
    const anchorY = isEdit ? ann.y : y;
    const prefill  = isEdit ? ann.text : '';
    const prefillImages = isEdit ? (ann.images || []) : [];

    if (!isEdit) {
      commentCounter++;
      redrawAll();
      drawMarker(x, y, commentCounter, true);
    }

    const popup = createCommentPopup(anchorX, anchorY, isEdit ? ann.element : element, prefill, prefillImages);
    document.body.appendChild(popup);
    activePopup = popup;

    const textarea = popup.querySelector('#vft-comment-input');
    textarea.focus();
    if (isEdit) textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

    const cancel = () => {
      if (!isEdit) commentCounter--;
      popup.remove();
      activePopup = null;
      redrawAll();
      if (!isEdit) setActiveTool('comment');
    };

    const save = () => {
      const text = textarea.value.trim();
      const images = popup._images || [];
      popup.remove();
      activePopup = null;
      if (isEdit) {
        if (text !== ann.text || images.length !== (ann.images || []).length) {
          snapshotForUndo();
          window.__vftAnnotations[editIndex].text = text;
          window.__vftAnnotations[editIndex].images = images.length ? images : undefined;
        }
      } else {
        if (text || images.length) {
          snapshotForUndo();
          window.__vftAnnotations.push({
            type: 'comment', x, y, text, index: commentCounter,
            area: area || null, element: element || null, elements: elements || null,
            images: images.length ? images : undefined
          });
        } else {
          commentCounter--;
        }
        setActiveTool('comment');
      }
      redrawAll();
    };

    popup.querySelector('#vft-comment-cancel').addEventListener('click', cancel);
    popup.querySelector('#vft-comment-save').addEventListener('click', save);
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
      if (e.key === 'Escape') cancel();
    });
  }

  // ── Comment find ─────────────────────────────────────────────────────────────
  function findCommentAtPoint(px, py) {
    let bestIdx = -1, bestDist = 16;
    for (let i = 0; i < window.__vftAnnotations.length; i++) {
      const ann = window.__vftAnnotations[i];
      if (ann.type !== 'comment') continue;
      const dist = Math.sqrt((ann.x - px) ** 2 + (ann.y - py) ** 2);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    return bestIdx;
  }

  // ── Settings panel ────────────────────────────────────────────────────────────
  let settingsPanel = null;

  // ── Freeze ────────────────────────────────────────────────────────────────────
  function toggleFreeze() {
    isFrozen ? unfreeze() : freeze();
  }

  function freeze() {
    if (isFrozen) return;

    // Hide toolbar + canvas so they don't appear in the snapshot
    toolbar.style.visibility = 'hidden';
    canvas.style.visibility = 'hidden';

    chrome.runtime.sendMessage({ type: 'CAPTURE_FREEZE' }, response => {
      toolbar.style.visibility = '';
      canvas.style.visibility = '';

      if (!response?.ok) {
        showToast(`Freeze failed: ${response?.error || 'unknown error'}`, true);
        return;
      }

      isFrozen = true;

      // Render snapshot as a fixed full-page image sitting above the real page
      // but below our canvas (Z_CANVAS) and toolbar (Z_TOP)
      freezeStyleEl = document.createElement('div');
      freezeStyleEl.id = 'vft-freeze-overlay';
      Object.assign(freezeStyleEl.style, {
        position: 'fixed',
        top: '0', left: '0',
        width: '100vw', height: '100vh',
        backgroundImage: `url(${response.dataUrl})`,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        zIndex: String(parseInt(Z_CANVAS) - 1),
        pointerEvents: 'none'
      });
      document.body.appendChild(freezeStyleEl);

      // Banner
      freezeBanner = document.createElement('div');
      freezeBanner.id = 'vft-freeze-banner';
      freezeBanner.innerHTML = `<span class="vft-freeze-icon">❄</span><span>Page states frozen — press <kbd>Esc</kbd> to unfreeze</span>`;
      document.body.appendChild(freezeBanner);

      const btn = toolbar.querySelector('[data-tool="freeze"]');
      if (btn) btn.classList.add('vft-active', 'vft-freeze-active');
    });
  }

  function unfreeze() {
    if (!isFrozen) return;
    isFrozen = false;

    freezeStyleEl?.remove();
    freezeStyleEl = null;
    freezeBanner?.remove();
    freezeBanner = null;

    const btn = toolbar.querySelector('[data-tool="freeze"]');
    if (btn) btn.classList.remove('vft-active', 'vft-freeze-active');
  }

  function toggleSettingsPanel() {
    if (settingsPanel) { closeSettingsPanel(); return; }

    const btnRect = toolbar.querySelector('[data-tool="settings"]').getBoundingClientRect();
    settingsPanel = document.createElement('div');
    settingsPanel.id = 'vft-settings-panel';
    Object.assign(settingsPanel.style, {
      position: 'fixed',
      bottom: `${window.innerHeight - btnRect.top + 10}px`,
      right: `${window.innerWidth - btnRect.right}px`,
      zIndex: Z_TOP
    });

    const s = window.__vftSettings;
    settingsPanel.innerHTML = `
      <div class="vft-sp-header">
        <span class="vft-sp-title">Settings</span>
      </div>
      <div class="vft-sp-body">
        <div class="vft-sp-row">
          <span class="vft-sp-label">Screenshot Quality</span>
          <div class="vft-sp-options">
            ${radioGroup('screenshotQuality', [
              { value: 'low',    label: 'Low',  desc: '25% scale, 50% JPEG' },
              { value: 'medium', label: 'Med',  desc: '50% scale, 75% JPEG' },
              { value: 'high',   label: 'High', desc: '100% scale, 90% JPEG' }
            ], s.screenshotQuality)}
          </div>
        </div>
        <div class="vft-sp-row">
          <span class="vft-sp-label">Comment Detail</span>
          <div class="vft-sp-options">
            ${radioGroup('detailLevel', [
              { value: 'minimal',  label: 'Minimal',  desc: 'Text + tag/id only' },
              { value: 'standard', label: 'Standard', desc: 'Tag, id, classes, text, rect' },
              { value: 'verbose',  label: 'Verbose',  desc: 'Includes computed CSS styles' }
            ], s.detailLevel)}
          </div>
        </div>
        <div class="vft-sp-row">
          <span class="vft-sp-label">Screenshot Include</span>
          <div class="vft-sp-options">
            ${radioGroup('screenshotMode', [
              { value: 'always', label: 'Always', desc: 'Always attach screenshot' },
              { value: 'smart',  label: 'Smart',  desc: 'Only for visual annotations' },
              { value: 'never',  label: 'Never',  desc: 'Never attach screenshot' }
            ], s.screenshotMode)}
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(settingsPanel);

    settingsPanel.addEventListener('click', e => {
      const opt = e.target.closest('.vft-sp-option');
      if (!opt) return;
      const { group, value } = opt.dataset;
      window.__vftSettings[group] = value;
      saveSettings();
      settingsPanel.querySelectorAll(`[data-group="${group}"]`).forEach(btn => {
        btn.classList.toggle('vft-sp-active', btn.dataset.value === value);
      });
    });

    setTimeout(() => document.addEventListener('click', handleSettingsOutsideClick), 0);
  }

  function handleSettingsOutsideClick(e) {
    if (!settingsPanel) return;
    if (settingsPanel.contains(e.target)) return;
    if (e.target.closest('[data-tool="settings"]')) return;
    closeSettingsPanel();
  }

  function closeSettingsPanel() {
    document.removeEventListener('click', handleSettingsOutsideClick);
    settingsPanel?.remove();
    settingsPanel = null;
  }

  // ── Help panel ────────────────────────────────────────────────────────────────
  let helpPanel = null;

  function toggleHelpPanel() {
    if (helpPanel) { closeHelpPanel(); return; }

    const btnRect = toolbar.querySelector('[data-tool="help"]').getBoundingClientRect();
    helpPanel = document.createElement('div');
    helpPanel.id = 'vft-help-panel';
    Object.assign(helpPanel.style, {
      position: 'fixed',
      bottom: `${window.innerHeight - btnRect.top + 10}px`,
      left: `${btnRect.left}px`,
      zIndex: Z_TOP
    });

    helpPanel.innerHTML = `
      <div class="vft-hp-header">
        <span class="vft-hp-title">How to use</span>
      </div>
      <div class="vft-hp-body">

        <div class="vft-hp-section">Setup</div>
        <div class="vft-hp-steps">
          <div class="vft-hp-step"><span class="vft-hp-n">1</span>Start the MCP server: <code>node mcp-server/server.cjs</code></div>
          <div class="vft-hp-step"><span class="vft-hp-n">2</span>Add it to Claude's MCP config (see README)</div>
          <div class="vft-hp-step"><span class="vft-hp-n">3</span>Open any <code>localhost</code> page in Chrome</div>
          <div class="vft-hp-step"><span class="vft-hp-n">4</span>Click the extension icon to activate the overlay</div>
        </div>

        <div class="vft-hp-section">Annotate</div>
        <div class="vft-hp-tools">
          <div class="vft-hp-tool">
            <span class="vft-hp-key">X</span>
            <div>
              <div class="vft-hp-tool-name">Draw</div>
              <div class="vft-hp-tool-desc">Freehand red markup — use for arrows, circles, highlights. Only visible in screenshot.</div>
            </div>
          </div>
          <div class="vft-hp-tool">
            <span class="vft-hp-key">C</span>
            <div>
              <div class="vft-hp-tool-name">Comment</div>
              <div class="vft-hp-tool-desc"><b>Click</b> to pin a comment on an element. <b>Drag</b> to select an area — captures all elements inside it.</div>
            </div>
          </div>
          <div class="vft-hp-tool">
            <span class="vft-hp-key vft-hp-key-wide">Del</span>
            <div>
              <div class="vft-hp-tool-name">Clear</div>
              <div class="vft-hp-tool-desc">Removes all annotations from the canvas.</div>
            </div>
          </div>
        </div>

        <div class="vft-hp-section">Shortcuts</div>
        <div class="vft-hp-shortcuts">
          <div class="vft-hp-shortcut"><span class="vft-hp-key">E</span> Edit elements</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key">X</span> Draw tool</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key">C</span> Comment tool</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key">F</span> Freeze states</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key vft-hp-key-wide">Ctrl Z</span> Undo</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key vft-hp-key-wide">Ctrl Y</span> Redo</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key vft-hp-key-wide">Ctrl ↵</span> Add task</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key vft-hp-key-wide">Esc ×2</span> Close overlay (×3 if tool active)</div>
        </div>

        <div class="vft-hp-section">Send to Claude</div>
        <div class="vft-hp-steps">
          <div class="vft-hp-step"><span class="vft-hp-n">1</span>Annotate the page</div>
          <div class="vft-hp-step"><span class="vft-hp-n">2</span>Click <b>Add task</b> — adds to the MCP buffer</div>
          <div class="vft-hp-step"><span class="vft-hp-n">3</span>In Claude Code, say <i>"check my annotation"</i> or just wait — Claude picks it up automatically</div>
          <div class="vft-hp-step"><span class="vft-hp-n">4</span>Use <b>Review</b> to inspect, preview, or delete buffered submissions</div>
        </div>

        <div class="vft-hp-tip">
          <b>MCP dot red?</b> The server isn't running. Start it with <code>node mcp-server/server.cjs</code> and click the dot to see the error.
        </div>

      </div>
    `;

    document.body.appendChild(helpPanel);
    setTimeout(() => document.addEventListener('click', handleHelpOutsideClick), 0);
  }

  function handleHelpOutsideClick(e) {
    if (!helpPanel) return;
    if (helpPanel.contains(e.target)) return;
    if (e.target.closest('[data-tool="help"]')) return;
    closeHelpPanel();
  }

  function closeHelpPanel() {
    document.removeEventListener('click', handleHelpOutsideClick);
    helpPanel?.remove();
    helpPanel = null;
  }

  // ── Toast ────────────────────────────────────────────────────────────────────
  function showToast(msg, isError) {
    const t = document.createElement('div');
    t.className = isError ? 'vft-toast vft-toast-error' : 'vft-toast';
    if (isError) {
      const msgSpan = document.createElement('span');
      msgSpan.textContent = msg;
      msgSpan.style.flex = '1';
      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.className = 'vft-toast-copy';
      copyBtn.addEventListener('click', () => navigator.clipboard.writeText(msg));
      t.appendChild(msgSpan);
      t.appendChild(copyBtn);
    } else {
      t.textContent = msg;
    }
    document.body.appendChild(t);
    setTimeout(() => t.remove(), isError ? 6000 : TOAST_MS);
  }

  // ── Resize canvas ─────────────────────────────────────────────────────────────
  let resizeRaf = null;
  window.addEventListener('resize', () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      redrawAll();
      resizeRaf = null;
    });
  });

  // ── Review panel ─────────────────────────────────────────────────────────────
  let reviewPanel = null;
  let stashedAnnotations = null;
  let previewingIndex = -1;
  let lastReviewHash = null;

  function toggleReviewPanel() {
    if (reviewPanel) { closeReviewPanel(); return; }

    const btnRect = toolbar.querySelector('[data-tool="review"]').getBoundingClientRect();
    reviewPanel = document.createElement('div');
    reviewPanel.id = 'vft-review-panel';
    Object.assign(reviewPanel.style, {
      position: 'fixed',
      bottom: `${window.innerHeight - btnRect.top + 10}px`,
      right: `${window.innerWidth - btnRect.right}px`,
      zIndex: Z_TOP
    });

    reviewPanel.innerHTML = `
      <div class="vft-rp-header">
        <span class="vft-rp-title">Review Buffer</span>
        <div class="vft-rp-actions">
          <button class="vft-rp-clear" title="Clear all">Clear All</button>
        </div>
      </div>
      <div class="vft-rp-body">
        <div class="vft-rp-loading">Loading…</div>
      </div>
    `;
    document.body.appendChild(reviewPanel);
    window.__vftReviewPanel = reviewPanel;

    reviewPanel.querySelector('.vft-rp-clear').addEventListener('click', async () => {
      try {
        await fetch(`${SERVER_URL}/submissions`, { method: 'DELETE' });
        exitPreviewMode();
        loadReviewItems();
        updateBufferCount(0);
      } catch {}
    });

    loadReviewItems();
    setTimeout(() => document.addEventListener('click', handleReviewOutsideClick), 0);
  }

  function handleReviewOutsideClick(e) {
    if (!reviewPanel) return;
    if (reviewPanel.contains(e.target)) return;
    if (e.target.closest('[data-tool="review"]')) return;
    closeReviewPanel();
  }

  function closeReviewPanel() {
    document.removeEventListener('click', handleReviewOutsideClick);
    exitPreviewMode();
    reviewPanel?.remove();
    reviewPanel = null;
    window.__vftReviewPanel = null;
    lastReviewHash = null;
  }

  function enterPreviewMode(annotations, index) {
    if (stashedAnnotations === null) stashedAnnotations = JSON.stringify(window.__vftAnnotations);
    previewingIndex = index;
    window.__vftAnnotations = annotations;
    recalcCommentCounter();
    redrawAll();

    let banner = document.getElementById('vft-preview-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'vft-preview-banner';
      banner.className = 'vft-preview-banner';
      const label = document.createElement('span');
      label.textContent = 'Previewing submission';
      label.className = 'vft-preview-label';
      const backBtn = document.createElement('button');
      backBtn.textContent = 'Back to current';
      backBtn.className = 'vft-preview-back';
      backBtn.addEventListener('click', () => exitPreviewMode());
      banner.appendChild(label);
      banner.appendChild(backBtn);
      document.body.appendChild(banner);
    }
  }

  function exitPreviewMode() {
    if (stashedAnnotations !== null) {
      window.__vftAnnotations = JSON.parse(stashedAnnotations);
      recalcCommentCounter();
      stashedAnnotations = null;
      previewingIndex = -1;
      redrawAll();
    }
    document.getElementById('vft-preview-banner')?.remove();
  }

  async function loadReviewItems() {
    if (!reviewPanel) return;
    const body = reviewPanel.querySelector('.vft-rp-body');
    try {
      const res = await fetch(`${SERVER_URL}/submissions`);
      if (!res.ok) { body.innerHTML = `<div class="vft-rp-empty">Server error ${res.status}</div>`; return; }
      const data = await res.json();
      const list = data.submissions || [];
      const hash = JSON.stringify(list.map(s => `${s.index}:${s.read}:${s.annotationCount}`));
      if (hash === lastReviewHash) return;
      lastReviewHash = hash;
      renderReviewItems(list);
    } catch {
      body.innerHTML = '<div class="vft-rp-empty">Cannot reach server</div>';
    }
  }

  function renderReviewItems(list) {
    if (!reviewPanel) return;
    const body = reviewPanel.querySelector('.vft-rp-body');
    const title = reviewPanel.querySelector('.vft-rp-title');
    const unread = list.filter(i => !i.read).length;
    title.textContent = list.length
      ? `Review Buffer (${unread ? unread + ' new / ' : ''}${list.length})`
      : 'Review Buffer';

    if (!list.length) { body.innerHTML = '<div class="vft-rp-empty">Buffer is empty</div>'; return; }

    body.innerHTML = '';
    list.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'vft-rp-card' + (item.read ? ' vft-rp-read' : '');
      if (previewingIndex === i) card.classList.add('vft-rp-previewing');

      const time = item.receivedAt
        ? new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

      const readIcon = item.read
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:${C_GREEN};flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`
        : '';

      card.innerHTML = `
        <div class="vft-rp-card-row">
          ${readIcon}
          <div class="vft-rp-card-info">
            <div class="vft-rp-card-title">${esc(item.title || '(untitled)')}</div>
            <div class="vft-rp-card-meta">${item.annotationCount} annotation${item.annotationCount === 1 ? '' : 's'} · ${time}${item.read ? ' · read' : ''}</div>
          </div>
          <div class="vft-rp-card-btns">
            <button class="vft-rp-card-payload" title="Show payload Claude receives">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
            </button>
            ${item.read ? '<button class="vft-rp-card-restore" title="Mark unread (re-send to Claude)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>' : ''}
            <button class="vft-rp-card-del" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="vft-rp-payload" style="display:none"></div>
      `;

      card.addEventListener('click', async e => {
        if (e.target.closest('.vft-rp-card-del') || e.target.closest('.vft-rp-card-restore') || e.target.closest('.vft-rp-card-payload')) return;
        try {
          const res = await fetch(`${SERVER_URL}/submissions/${i}`);
          if (!res.ok) return;
          const data = await res.json();
          enterPreviewMode(data.annotations || [], i);
          reviewPanel.querySelectorAll('.vft-rp-card').forEach(c => c.classList.remove('vft-rp-previewing'));
          card.classList.add('vft-rp-previewing');
        } catch {}
      });

      card.querySelector('.vft-rp-card-payload').addEventListener('click', async e => {
        e.stopPropagation();
        const drawer = card.querySelector('.vft-rp-payload');
        if (drawer.style.display !== 'none') { drawer.style.display = 'none'; return; }
        drawer.textContent = 'Loading…';
        drawer.style.display = 'block';
        try {
          const res = await fetch(`${SERVER_URL}/submissions/${i}/preview`);
          if (!res.ok) {
            drawer.textContent = `Server returned ${res.status} — restart the MCP server to pick up the /preview endpoint.`;
            return;
          }
          const data = await res.json();
          drawer.textContent = data.text;
        } catch (err) {
          drawer.textContent = `Error: ${err.message}`;
        }
      });

      const restoreBtn = card.querySelector('.vft-rp-card-restore');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', async e => {
          e.stopPropagation();
          try {
            await fetch(`${SERVER_URL}/submissions/${i}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ read: false })
            });
            lastReviewHash = null;
            loadReviewItems();
          } catch {}
        });
      }

      card.querySelector('.vft-rp-card-del').addEventListener('click', async e => {
        e.stopPropagation();
        if (previewingIndex === i) exitPreviewMode();
        try {
          await fetch(`${SERVER_URL}/submissions/${i}`, { method: 'DELETE' });
          lastReviewHash = null;
          loadReviewItems();
          const h = await fetch(`${SERVER_URL}/health`).catch(() => null);
          if (h?.ok) { const d = await h.json(); updateBufferCount(d.bufferCount); }
        } catch {}
      });

      body.appendChild(card);
    });
  }

  // ── Status polling ────────────────────────────────────────────────────────────
  function updateBufferCount(count) {
    const badge = document.getElementById('vft-buf-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = String(count);
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  let lastMcpError = null;

  function updateMcpDot(online, errorMsg) {
    if (!statusDot?.isConnected) return;
    statusDot.classList.toggle('vft-dot-online', online);
    statusDot.classList.toggle('vft-dot-offline', !online);
    if (mcpLabel) mcpLabel.style.color = online ? C_GREEN : C_RED;
    if (!online && errorMsg) lastMcpError = errorMsg;
    if (online) lastMcpError = null;
    if (statusCluster) {
      statusCluster.style.cursor = online ? 'default' : 'pointer';
      statusCluster.title = online ? '' : 'Click to see error';
    }
  }

  registerStatusClusterClick();

  const statusInterval = setInterval(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/health`);
      if (res.ok) {
        const data = await res.json();
        updateMcpDot(true);
        updateBufferCount(data.bufferCount);
        if (reviewPanel) loadReviewItems();
      } else {
        updateMcpDot(false, `MCP server returned HTTP ${res.status}`);
      }
    } catch (err) {
      updateMcpDot(false, `Cannot reach MCP server at localhost:3333 — ${err.message}`);
    }
  }, POLL_MS);

  fetch(`${SERVER_URL}/health`)
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
    .then(data => { updateMcpDot(true); updateBufferCount(data.bufferCount); })
    .catch(err => updateMcpDot(false, `Cannot reach MCP server at localhost:3333 — ${err.message}`));

  // ── Edit mode ─────────────────────────────────────────────────────────────────
  function flushEditAnnotation() {
    const commentInput = document.querySelector('#vft-ep-comment');
    const additionalComment = commentInput ? commentInput.value.trim() : '';
    if (editChanges.length > 0 || additionalComment) {
      const el = editSelectedEl;
      const summary = editChanges.length > 0
        ? `${editChanges.length} element edit${editChanges.length === 1 ? '' : 's'}`
        : 'Comment on element';
      const elementContext = el ? {
        tag: el.tagName.toLowerCase(),
        classes: typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [],
        id: el.id || null,
        text: (el.textContent || '').trim().slice(0, 60) || null,
        outerHTML: el.outerHTML.slice(0, 400)
      } : null;
      window.__vftAnnotations.push({
        type: 'edit',
        changes: editChanges.map(c => ({ ...c })),
        summary,
        elementContext,
        ...(editChanges.length > 0 ? { askPropagate: true } : {}),
        ...(additionalComment ? { comment: additionalComment } : {})
      });
    }
  }

  function selectEditElement(el) {
    editSelectedEl = el;
    positionHighlight(el, false);
    updateBoxModelOverlay(el);
    renderEditSidePanel(el);
    hideEditHintBanner();
  }

  function deselectEditElement() {
    editSelectedEl = null;
    if (editHighlight) editHighlight.style.display = 'none';
    const bm = document.getElementById('vft-box-model-overlay');
    if (bm) bm.style.display = 'none';
    const sp = document.getElementById('vft-edit-sidepanel');
    if (sp) {
      sp.innerHTML = '<div class="vft-ep-drag-handle"></div><div class="vft-ep-empty">Click an element to inspect</div>';
      bindPanelDrag(sp);
    }
    removeTextEditBar();
    showEditHintBanner();
  }

  function handleEditScroll() {
    if (editSelectedEl) {
      positionHighlight(editSelectedEl, false);
      updateBoxModelOverlay(editSelectedEl);
    }
    // Hide hover on scroll — it'll reappear on next mouseover
    if (editHoverOverlay) editHoverOverlay.style.display = 'none';
  }

  function createEditHover() {
    const hv = document.createElement('div');
    hv.id = 'vft-edit-hover';
    return hv;
  }

  function createEditHighlight() {
    const hl = document.createElement('div');
    hl.id = 'vft-edit-highlight';
    ['nw','n','ne','e','se','s','sw','w'].forEach(dir => {
      const h = document.createElement('div');
      h.className = 'vft-eh-handle';
      h.dataset.dir = dir;
      hl.appendChild(h);
    });
    const lbl = document.createElement('div');
    lbl.className = 'vft-eh-label';
    hl.appendChild(lbl);
    return hl;
  }


  function enterEditMode() {
    closeSettingsPanel();
    closeReviewPanel();
    closeHelpPanel();
    isEditMode = true;
    editChanges = [];
    editUndoStack = [];
    editRedoStack = [];
    editActiveTool = 'select';
    editSelectedEl = null;

    canvas.style.pointerEvents = 'none';

    editHoverOverlay = createEditHover();
    document.body.appendChild(editHoverOverlay);

    editHighlight = createEditHighlight();
    document.body.appendChild(editHighlight);
    bindResizeHandles();

    createBoxModelOverlay();

    // Create empty side panel
    const panel = document.createElement('div');
    panel.id = 'vft-edit-sidepanel';
    panel.innerHTML = '<div class="vft-ep-drag-handle"></div><div class="vft-ep-empty">Click an element to inspect</div>';
    document.body.appendChild(panel);
    bindPanelDrag(panel);

    // Hint banner
    showEditHintBanner();

    document.addEventListener('click', handleEditClick, true);
    document.addEventListener('mouseover', handleEditHover, true);
    window.addEventListener('scroll', handleEditScroll, true);
  }

  let editHintBanner = null;
  function showEditHintBanner() {
    if (editHintBanner) return;
    editHintBanner = document.createElement('div');
    editHintBanner.id = 'vft-edit-hint-banner';
    editHintBanner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 9-7 1-4 7z"/></svg><span>Select an element to edit properties or comment</span>`;
    document.body.appendChild(editHintBanner);
  }
  function hideEditHintBanner() {
    editHintBanner?.remove();
    editHintBanner = null;
  }

  function exitEditMode() {
    document.removeEventListener('click', handleEditClick, true);
    document.removeEventListener('mouseover', handleEditHover, true);
    window.removeEventListener('scroll', handleEditScroll, true);

    editHoverOverlay?.remove();
    editHoverOverlay = null;
    editHighlight?.remove();
    editHighlight = null;
    document.getElementById('vft-edit-sidepanel')?._scrubCleanup?.();
    document.getElementById('vft-edit-sidepanel')?.remove();
    document.getElementById('vft-box-model-overlay')?.remove();
    removeTextEditBar();
    hideEditHintBanner();

    flushEditAnnotation();

    editSelectedEl = null;
    panelDragPos = null;
    isEditMode = false;
  }

  function handleEditHover(e) {
    if (e.target.closest('#vft-toolbar, .vft-comment-popup, #vft-edit-sidepanel, .vft-edit-commit-bar, #vft-edit-highlight, #vft-edit-hover')) return;
    if (e.target.classList?.contains('vft-eh-handle')) return;
    // Don't show hover on the already-selected element
    if (editSelectedEl && e.target === editSelectedEl) {
      if (editHoverOverlay) editHoverOverlay.style.display = 'none';
      return;
    }
    positionHover(e.target);
  }

  function handleEditClick(e) {
    if (e.target.closest('#vft-toolbar, .vft-comment-popup, #vft-edit-sidepanel, .vft-edit-commit-bar, #vft-edit-highlight, #vft-edit-hover')) return;
    if (e.target.classList?.contains('vft-eh-handle')) return;
    if (editJustResized) { editJustResized = false; return; }
    e.preventDefault();
    e.stopPropagation();
    selectEditElement(e.target);
    if (editActiveTool === 'text') {
      document.getElementById('vft-edit-text-content')?.focus();
    }
  }

  function positionHover(el) {
    if (!editHoverOverlay || !el) return;
    const r = el.getBoundingClientRect();
    Object.assign(editHoverOverlay.style, {
      top: r.top + 'px', left: r.left + 'px',
      width: r.width + 'px', height: r.height + 'px',
      display: 'block'
    });
  }

  function positionHighlight(el, isHover) {
    if (!editHighlight || !el) return;
    // Hide hover overlay when selecting
    if (!isHover && editHoverOverlay) editHoverOverlay.style.display = 'none';
    const r = el.getBoundingClientRect();
    Object.assign(editHighlight.style, {
      top: r.top + 'px', left: r.left + 'px',
      width: r.width + 'px', height: r.height + 'px',
      display: 'block'
    });
    editHighlight.style.borderColor = C_BLUE;
    editHighlight.style.background  = 'rgba(12,140,233,0.08)';
    editHighlight.querySelectorAll('.vft-eh-handle').forEach(h => h.style.borderColor = C_BLUE);
    const lbl = editHighlight.querySelector('.vft-eh-label');
    if (lbl) {
      lbl.textContent = `${Math.round(r.width)}px × ${Math.round(r.height)}px`;
      lbl.style.background = C_BLUE;
    }
  }

  function buildElementLabel(el) {
    let label = el.tagName.toLowerCase();
    if (el.id) label += '#' + el.id;
    else if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/).slice(0, 2).join('.');
      if (cls) label += '.' + cls;
    }
    return label;
  }

  function classifyElement(el) {
    const cs = window.getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    const TEXT_TAGS = new Set(['p','h1','h2','h3','h4','h5','h6','span','a','li','label','td','th','dt','dd','blockquote','figcaption','caption','button']);
    return {
      isText: TEXT_TAGS.has(tag),
      isFlex: cs.display === 'flex' || cs.display === 'inline-flex',
    };
  }

  function hasSimpleText(el) {
    return el.childNodes.length > 0 &&
      Array.from(el.childNodes).every(n => n.nodeType === Node.TEXT_NODE || n.nodeType === Node.ELEMENT_NODE) &&
      el.children.length === 0;
  }

  function buildHeaderSection(el) {
    const label = buildElementLabel(el);
    return `
      <div class="vft-ep-header">
        <div class="vft-ep-tag" title="${label}">${label}</div>
        <div class="vft-ep-nav-hint">↑↓←→ navigate tree</div>
        <input id="vft-ep-comment" class="vft-ep-comment" type="text" placeholder="Additional comment..." />
      </div>`;
  }

  function buildPositionSection(r) {
    return `
      <div class="vft-ep-section">Position</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field">
          <span class="vft-ep-field-label">X</span>
          <input type="number" value="${Math.round(r.left)}" readonly>
        </div>
        <div class="vft-ep-field">
          <span class="vft-ep-field-label">Y</span>
          <input type="number" value="${Math.round(r.top)}" readonly>
        </div>
      </div>`;
  }

  function buildSizeSection(r) {
    return `
      <div class="vft-ep-section">Size</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field">
          <span class="vft-ep-field-label">W</span>
          <input type="number" data-prop="width" value="${Math.round(r.width)}">
        </div>
        <div class="vft-ep-field">
          <span class="vft-ep-field-label">H</span>
          <input type="number" data-prop="height" value="${Math.round(r.height)}">
        </div>
      </div>`;
  }

  function buildSpacingSection(cs) {
    const pTop = parseFloat(cs.paddingTop)||0, pRight = parseFloat(cs.paddingRight)||0;
    const pBottom = parseFloat(cs.paddingBottom)||0, pLeft = parseFloat(cs.paddingLeft)||0;
    const mTop = parseFloat(cs.marginTop)||0, mRight = parseFloat(cs.marginRight)||0;
    const mBottom = parseFloat(cs.marginBottom)||0, mLeft = parseFloat(cs.marginLeft)||0;
    return `
      <div class="vft-ep-section">Padding</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field"><span class="vft-ep-field-label">T</span><input type="number" data-prop="paddingTop" value="${pTop}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">R</span><input type="number" data-prop="paddingRight" value="${pRight}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">B</span><input type="number" data-prop="paddingBottom" value="${pBottom}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">L</span><input type="number" data-prop="paddingLeft" value="${pLeft}"></div>
      </div>
      <div class="vft-ep-section">Margin</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field"><span class="vft-ep-field-label">T</span><input type="number" data-prop="marginTop" value="${mTop}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">R</span><input type="number" data-prop="marginRight" value="${mRight}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">B</span><input type="number" data-prop="marginBottom" value="${mBottom}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">L</span><input type="number" data-prop="marginLeft" value="${mLeft}"></div>
      </div>`;
  }

  function buildAppearanceSection(cs) {
    const opacity = Math.round((parseFloat(cs.opacity)||1) * 100);
    const isHidden = cs.visibility === 'hidden';
    const eyeSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    return `
      <div class="vft-ep-section">Appearance</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field">
          <span class="vft-ep-field-label" style="font-size:9px">◻</span>
          <input type="number" data-prop="opacity" min="0" max="100" value="${opacity}">
          <span style="color:#5a6e7d;font-size:10px;padding-right:6px">%</span>
        </div>
        <button class="vft-ep-vis-toggle${isHidden ? ' vft-ep-vis-hidden' : ''}" id="vft-ep-visibility" title="Toggle visibility">
          ${eyeSvg}
        </button>
      </div>`;
  }

  function buildFillSection(cs) {
    const bgHex = rgbToHex(cs.backgroundColor);
    return `
      <div class="vft-ep-section">Fill</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field vft-ep-grid-full" style="position:relative">
          <div class="vft-ep-swatch" style="background:${bgHex}" data-swatch-for="backgroundColor"></div>
          <input type="text" data-hex-for="backgroundColor" value="${bgHex}" maxlength="7">
          <input type="color" data-prop="backgroundColor" value="${bgHex}" style="position:absolute;width:0;height:0;opacity:0;pointer-events:none">
        </div>
      </div>`;
  }

  function buildTextColorSection(cs) {
    const fgHex = rgbToHex(cs.color);
    return `
      <div class="vft-ep-section">Text Color</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field vft-ep-grid-full" style="position:relative">
          <div class="vft-ep-swatch" style="background:${fgHex}" data-swatch-for="color"></div>
          <input type="text" data-hex-for="color" value="${fgHex}" maxlength="7">
          <input type="color" data-prop="color" value="${fgHex}" style="position:absolute;width:0;height:0;opacity:0;pointer-events:none">
        </div>
      </div>`;
  }

  function buildTypographySection(cs) {
    const fontSize = parseFloat(cs.fontSize)||14;
    const fontWeight = parseFloat(cs.fontWeight)||400;
    const lineHeight = cs.lineHeight === 'normal' ? '' : parseFloat(cs.lineHeight)||'';
    const letterSpacing = cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing)||0;
    const fontFamily = cs.fontFamily.split(',')[0].replace(/['"]/g,'').trim();
    const textAlign = cs.textAlign || 'left';
    const alignIcons = {
      left:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>`,
      center:  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`,
      right:   `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>`,
      justify: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`
    };
    const alignBtns = ['left','center','right','justify'].map(a =>
      `<button class="vft-ep-align-btn${textAlign === a ? ' vft-ep-align-active' : ''}" data-align="${a}" title="${a}">${alignIcons[a]}</button>`
    ).join('');
    return `
      <div class="vft-ep-section">Typography</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field vft-ep-grid-full">
          <span class="vft-ep-field-label">Font</span>
          <input type="text" id="vft-ep-fontfamily" value="${esc(fontFamily)}">
        </div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">Sz</span><input type="number" data-prop="fontSize" value="${fontSize}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">Wt</span><input type="number" data-prop="fontWeight" step="100" min="100" max="900" value="${fontWeight}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">LH</span><input type="number" data-prop="lineHeight" step="0.1" value="${lineHeight}"></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">LS</span><input type="number" data-prop="letterSpacing" step="0.01" value="${letterSpacing}"></div>
        <div class="vft-ep-align-group vft-ep-grid-full">${alignBtns}</div>
      </div>`;
  }

  function buildLayoutSection(cs) {
    const flexDir = cs.flexDirection || 'row';
    const justifyContent = cs.justifyContent || 'flex-start';
    const alignItems = cs.alignItems || 'stretch';
    const gap = parseFloat(cs.gap)||0;
    const dirOptions = ['row','row-reverse','column','column-reverse'].map(v =>
      `<option value="${v}"${flexDir===v?' selected':''}>${v}</option>`).join('');
    const justifyOptions = ['flex-start','center','flex-end','space-between','space-around','space-evenly'].map(v =>
      `<option value="${v}"${justifyContent===v?' selected':''}>${v}</option>`).join('');
    const alignOptions = ['stretch','flex-start','center','flex-end','baseline'].map(v =>
      `<option value="${v}"${alignItems===v?' selected':''}>${v}</option>`).join('');
    return `
      <div class="vft-ep-section">Layout</div>
      <div class="vft-ep-grid">
        <div class="vft-ep-field vft-ep-grid-full"><span class="vft-ep-field-label">Dir</span><select data-prop="flexDirection">${dirOptions}</select></div>
        <div class="vft-ep-field vft-ep-grid-full"><span class="vft-ep-field-label">Justify</span><select data-prop="justifyContent">${justifyOptions}</select></div>
        <div class="vft-ep-field vft-ep-grid-full"><span class="vft-ep-field-label">Align</span><select data-prop="alignItems">${alignOptions}</select></div>
        <div class="vft-ep-field"><span class="vft-ep-field-label">Gap</span><input type="number" data-prop="gap" value="${gap}"></div>
      </div>`;
  }

  function buildTextContentSection(el) {
    return `
      <div class="vft-ep-section">Text Content</div>
      <div class="vft-ep-grid">
        <textarea id="vft-edit-text-content" class="vft-ep-textarea vft-ep-grid-full">${el.textContent}</textarea>
      </div>`;
  }

  function buildEditSidePanel(el) {
    const cs = window.getComputedStyle(el);
    const r  = el.getBoundingClientRect();
    const f  = classifyElement(el);
    return buildHeaderSection(el)
      + buildPositionSection(r)
      + buildSizeSection(r)
      + buildSpacingSection(cs)
      + buildAppearanceSection(cs)
      + buildFillSection(cs)
      + buildTextColorSection(cs)
      + (f.isText ? buildTypographySection(cs) : '')
      + (f.isFlex ? buildLayoutSection(cs)     : '')
      + (hasSimpleText(el) ? buildTextContentSection(el) : '');
  }

  function bindSidePanelEvents(panel, el) {
    // Number inputs for spacing/size/opacity/typography
    panel.querySelectorAll('input[type="number"][data-prop]').forEach(input => {
      const prop = input.dataset.prop;
      if (input.readOnly) return;
      const oldVal = prop === 'opacity'
        ? (el.style.opacity || window.getComputedStyle(el).opacity)
        : (el.style[prop] || window.getComputedStyle(el)[prop]);

      input.addEventListener('input', () => {
        const v = parseFloat(input.value) || 0;
        if (prop === 'opacity') {
          el.style.opacity = Math.min(100, Math.max(0, v)) / 100;
        } else if (prop === 'lineHeight') {
          el.style.lineHeight = v;
        } else if (prop === 'fontWeight') {
          el.style.fontWeight = v;
        } else {
          el.style[prop] = v + 'px';
        }
        if (prop === 'width' || prop === 'height') positionHighlight(el, false);
        updateBoxModelOverlay(el);
      });
      input.addEventListener('blur', () => {
        const v = parseFloat(input.value) || 0;
        let newVal;
        if (prop === 'opacity') newVal = String(Math.min(100, Math.max(0, v)) / 100);
        else if (prop === 'lineHeight') newVal = String(v);
        else if (prop === 'fontWeight') newVal = String(v);
        else newVal = v + 'px';
        recordChange(el, prop, oldVal, newVal);
      });
    });

    // Color inputs
    panel.querySelectorAll('input[type="color"][data-prop]').forEach(colorInput => {
      const prop = colorInput.dataset.prop;
      const hexDisplay = panel.querySelector(`[data-hex-for="${prop}"]`);
      const swatch = panel.querySelector(`[data-swatch-for="${prop}"]`);
      const oldVal = el.style[prop] || window.getComputedStyle(el)[prop];

      colorInput.addEventListener('input', () => {
        el.style[prop] = colorInput.value;
        if (hexDisplay) hexDisplay.value = colorInput.value;
        if (swatch) swatch.style.background = colorInput.value;
      });
      colorInput.addEventListener('change', () => {
        recordChange(el, prop, oldVal, colorInput.value);
      });
    });

    // Hex text inputs
    panel.querySelectorAll('[data-hex-for]').forEach(hexInput => {
      const prop = hexInput.dataset.hexFor;
      const colorInput = panel.querySelector(`input[type="color"][data-prop="${prop}"]`);
      const swatch = panel.querySelector(`[data-swatch-for="${prop}"]`);
      hexInput.addEventListener('input', () => {
        const v = hexInput.value;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
          el.style[prop] = v;
          if (colorInput) colorInput.value = v;
          if (swatch) swatch.style.background = v;
        }
      });
    });

    // Swatch click → open hidden color picker
    panel.querySelectorAll('.vft-ep-swatch').forEach(swatch => {
      const forProp = swatch.dataset.swatchFor;
      const hidden = panel.querySelector(`input[type="color"][data-prop="${forProp}"]`);
      if (hidden) swatch.addEventListener('click', () => hidden.click());
    });

    // Visibility toggle button
    const visBtn = panel.querySelector('#vft-ep-visibility');
    if (visBtn) {
      const oldVal = el.style.visibility || window.getComputedStyle(el).visibility;
      visBtn.addEventListener('click', () => {
        const isNowHidden = !visBtn.classList.contains('vft-ep-vis-hidden');
        visBtn.classList.toggle('vft-ep-vis-hidden', isNowHidden);
        const newVal = isNowHidden ? 'hidden' : 'visible';
        el.style.visibility = newVal;
        recordChange(el, 'visibility', oldVal, newVal);
      });
    }

    // Font family input
    const ffInput = panel.querySelector('#vft-ep-fontfamily');
    if (ffInput) {
      const oldVal = el.style.fontFamily || window.getComputedStyle(el).fontFamily;
      ffInput.addEventListener('blur', () => {
        const newVal = ffInput.value.trim();
        if (newVal) {
          el.style.fontFamily = newVal;
          recordChange(el, 'fontFamily', oldVal, newVal);
        }
      });
    }

    // Text-align buttons
    panel.querySelectorAll('.vft-ep-align-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const align = btn.dataset.align;
        const oldVal = el.style.textAlign || window.getComputedStyle(el).textAlign;
        el.style.textAlign = align;
        recordChange(el, 'textAlign', oldVal, align);
        panel.querySelectorAll('.vft-ep-align-btn').forEach(b =>
          b.classList.toggle('vft-ep-align-active', b === btn));
      });
    });

    // Select dropdowns (layout)
    panel.querySelectorAll('select[data-prop]').forEach(sel => {
      const prop = sel.dataset.prop;
      const oldVal = el.style[prop] || window.getComputedStyle(el)[prop];
      sel.addEventListener('change', () => {
        el.style[prop] = sel.value;
        recordChange(el, prop, oldVal, sel.value);
      });
    });

    // Textarea (text content)
    const textarea = panel.querySelector('#vft-edit-text-content');
    if (textarea) {
      const oldText = el.textContent;
      textarea.addEventListener('blur', () => {
        const newText = textarea.value;
        if (newText !== el.textContent) {
          el.textContent = newText;
          recordChange(el, 'textContent', oldText, newText);
        }
      });
      textarea.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          textarea.blur();
        }
      });
    }

    bindAltScrub(panel, el);
  }

  // ── Alt+drag scrubbing ────────────────────────────────────────────────────────
  function bindAltScrub(panel, el) {
    const CLAMP_ZERO = new Set(['paddingTop','paddingRight','paddingBottom','paddingLeft','gap','width','height']);
    const CLAMP_OPACITY = 'opacity';

    let altDown = false;

    const onKeyDown = e => {
      if (e.key === 'Alt') {
        altDown = true;
        panel.querySelectorAll('input[type="number"][data-prop]').forEach(inp => {
          if (!inp.readOnly) inp.style.cursor = 'ew-resize';
        });
      }
    };
    const onKeyUp = e => {
      if (e.key === 'Alt') {
        altDown = false;
        if (!scrubState) {
          panel.querySelectorAll('input[type="number"][data-prop]').forEach(inp => {
            inp.style.cursor = '';
          });
        }
      }
    };

    const onMouseDown = e => {
      if (!e.altKey) return;
      const input = e.target.closest('input[type="number"][data-prop]');
      if (!input || input.readOnly) return;
      e.preventDefault();
      const prop = input.dataset.prop;
      const startVal = parseFloat(input.value) || 0;
      scrubState = { input, startX: e.clientX, startVal, prop, oldVal: input.value };
    };

    const onMouseMove = e => {
      if (!scrubState) return;
      const { input, startX, startVal, prop } = scrubState;
      const multiplier = e.shiftKey ? 0.1 : 1;
      const dx = e.clientX - startX;
      let newVal = startVal + dx * multiplier;
      if (prop === CLAMP_OPACITY) newVal = Math.max(0, Math.min(100, newVal));
      else if (CLAMP_ZERO.has(prop)) newVal = Math.max(0, newVal);
      newVal = Math.round(newVal * 100) / 100;
      input.value = newVal;
      if (prop === 'opacity') {
        el.style.opacity = Math.min(100, Math.max(0, newVal)) / 100;
      } else if (prop === 'lineHeight') {
        el.style.lineHeight = newVal;
      } else if (prop === 'fontWeight') {
        el.style.fontWeight = newVal;
      } else {
        el.style[prop] = newVal + 'px';
      }
      if (prop === 'width' || prop === 'height') positionHighlight(el, false);
      updateBoxModelOverlay(el);
    };

    const onMouseUp = () => {
      if (!scrubState) return;
      const { input, prop, oldVal } = scrubState;
      const v = parseFloat(input.value) || 0;
      let newVal;
      if (prop === 'opacity') newVal = String(Math.min(100, Math.max(0, v)) / 100);
      else if (prop === 'lineHeight' || prop === 'fontWeight') newVal = String(v);
      else newVal = v + 'px';
      recordChange(el, prop, oldVal, newVal);
      scrubState = null;
      if (!altDown) {
        panel.querySelectorAll('input[type="number"][data-prop]').forEach(inp => {
          inp.style.cursor = '';
        });
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);
    panel.addEventListener('mousedown',  onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);

    panel._scrubCleanup = () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      panel.removeEventListener('mousedown',  onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
  }

  // ── Resize handles ────────────────────────────────────────────────────────────
  function bindResizeHandles() {
    if (!editHighlight) return;
    let resizing = null;

    const onMouseDown = e => {
      const handle = e.target.closest('.vft-eh-handle');
      if (!handle || !editSelectedEl) return;
      e.preventDefault();
      e.stopPropagation();
      const r = editSelectedEl.getBoundingClientRect();
      resizing = {
        dir: handle.dataset.dir,
        startX: e.clientX, startY: e.clientY,
        startW: r.width,   startH: r.height,
        oldW: r.width,     oldH: r.height
      };
    };

    const onMouseMove = e => {
      if (!resizing || !editSelectedEl) return;
      const { dir, startX, startY, startW, startH } = resizing;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newW = startW, newH = startH;

      if (dir === 'e' || dir === 'se' || dir === 'ne') newW = Math.max(1, startW + dx);
      if (dir === 'w' || dir === 'sw' || dir === 'nw') newW = Math.max(1, startW - dx);
      if (dir === 's' || dir === 'se' || dir === 'sw') newH = Math.max(1, startH + dy);
      if (dir === 'n' || dir === 'ne' || dir === 'nw') newH = Math.max(1, startH - dy);

      editSelectedEl.style.width  = newW + 'px';
      editSelectedEl.style.height = newH + 'px';
      positionHighlight(editSelectedEl, false);
      updateBoxModelOverlay(editSelectedEl);

      // Update panel W/H inputs
      const panel = document.getElementById('vft-edit-sidepanel');
      if (panel) {
        const wInput = panel.querySelector('input[data-prop="width"]');
        const hInput = panel.querySelector('input[data-prop="height"]');
        if (wInput) wInput.value = Math.round(newW);
        if (hInput) hInput.value = Math.round(newH);
      }
    };

    const onMouseUp = () => {
      if (!resizing || !editSelectedEl) { resizing = null; return; }
      const { oldW, oldH } = resizing;
      const cs = window.getComputedStyle(editSelectedEl);
      const newW = parseFloat(editSelectedEl.style.width) || parseFloat(cs.width);
      const newH = parseFloat(editSelectedEl.style.height) || parseFloat(cs.height);
      if (Math.round(newW) !== Math.round(oldW)) recordChange(editSelectedEl, 'width', oldW + 'px', newW + 'px');
      if (Math.round(newH) !== Math.round(oldH)) recordChange(editSelectedEl, 'height', oldH + 'px', newH + 'px');
      resizing = null;
      // Suppress the click event that fires after mouseup so selection doesn't jump
      editJustResized = true;
      requestAnimationFrame(() => { editJustResized = false; });
    };

    editHighlight.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
  }

  // ── Box model overlay ─────────────────────────────────────────────────────────
  function createBoxModelOverlay() {
    const existing = document.getElementById('vft-box-model-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'vft-box-model-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '0', height: '0',
      zIndex: '2147483639', pointerEvents: 'none'
    });
    ['pad-top','pad-right','pad-bottom','pad-left',
     'mar-top','mar-right','mar-bottom','mar-left'].forEach(name => {
      const band = document.createElement('div');
      band.id = 'vft-bm-' + name;
      band.className = 'vft-bm-band';
      overlay.appendChild(band);
    });
    document.body.appendChild(overlay);
  }

  function updateBoxModelOverlay(el) {
    const overlay = document.getElementById('vft-box-model-overlay');
    if (!overlay || !el) return;
    const r  = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const pT = parseFloat(cs.paddingTop)    || 0;
    const pR = parseFloat(cs.paddingRight)  || 0;
    const pB = parseFloat(cs.paddingBottom) || 0;
    const pL = parseFloat(cs.paddingLeft)   || 0;
    const mT = parseFloat(cs.marginTop)     || 0;
    const mR = parseFloat(cs.marginRight)   || 0;
    const mB = parseFloat(cs.marginBottom)  || 0;
    const mL = parseFloat(cs.marginLeft)    || 0;

    const set = (id, top, left, w, h) => {
      const band = document.getElementById(id);
      if (!band) return;
      if (w <= 0 || h <= 0) { band.style.display = 'none'; return; }
      band.style.display = 'block';
      band.style.top    = top  + 'px';
      band.style.left   = left + 'px';
      band.style.width  = w    + 'px';
      band.style.height = h    + 'px';
    };

    set('vft-bm-pad-top',    r.top,           r.left + pL,      r.width - pL - pR, pT);
    set('vft-bm-pad-bottom', r.bottom - pB,   r.left + pL,      r.width - pL - pR, pB);
    set('vft-bm-pad-left',   r.top,           r.left,           pL,                r.height);
    set('vft-bm-pad-right',  r.top,           r.right - pR,     pR,                r.height);
    set('vft-bm-mar-top',    r.top - mT,      r.left - mL,      r.width + mL + mR, mT);
    set('vft-bm-mar-bottom', r.bottom,        r.left - mL,      r.width + mL + mR, mB);
    set('vft-bm-mar-left',   r.top - mT,      r.left - mL,      mL,                r.height + mT + mB);
    set('vft-bm-mar-right',  r.top - mT,      r.right,          mR,                r.height + mT + mB);
  }

  function hideBoxModelOverlay() {
    const overlay = document.getElementById('vft-box-model-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('.vft-bm-band').forEach(b => b.style.display = 'none');
  }

  let panelDragPos = null; // { left, top } persists across re-renders

  function renderEditSidePanel(el) {
    let panel = document.getElementById('vft-edit-sidepanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'vft-edit-sidepanel';
      document.body.appendChild(panel);
    }
    panel.innerHTML = '<div class="vft-ep-drag-handle"></div>' + buildEditSidePanel(el);
    // Restore dragged position
    if (panelDragPos) {
      panel.classList.add('vft-ep-dragged');
      panel.style.left = panelDragPos.left + 'px';
      panel.style.top = panelDragPos.top + 'px';
    }
    bindSidePanelEvents(panel, el);
    bindPanelDrag(panel);
  }

  function bindPanelDrag(panel) {
    const handle = panel.querySelector('.vft-ep-drag-handle');
    if (!handle) return;
    let startX, startY, startLeft, startTop;

    function onMouseDown(e) {
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newLeft = startLeft + dx;
      const newTop = startTop + dy;
      panel.classList.add('vft-ep-dragged');
      panel.style.left = newLeft + 'px';
      panel.style.top = newTop + 'px';
      panelDragPos = { left: newLeft, top: newTop };
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    handle.addEventListener('mousedown', onMouseDown);
  }

  // ── Edit helpers ──────────────────────────────────────────────────────────────
  function buildSelector(el) {
    let sel = el.tagName.toLowerCase();
    if (el.id) sel += '#' + el.id;
    else if (el.className && typeof el.className === 'string') {
      const cls = el.className.trim().split(/\s+/).slice(0, 3).join('.');
      if (cls) sel += '.' + cls;
    }
    return sel;
  }

  function rgbToHex(rgb) {
    const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!m) return '#000000';
    return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }

  function applyPropertyToElement(el, property, value) {
    if (property === 'textContent') {
      el.textContent = value;
    } else {
      el.style[property] = value;
    }
  }

  function recordChange(el, property, oldValue, newValue) {
    if (oldValue === newValue) return;
    editUndoStack.push({ changes: editChanges.map(c => ({ ...c })), snapshot: {} });
    editRedoStack = [];
    editChanges.push({
      selector: buildSelector(el),
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      classes: typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [],
      property, oldValue, newValue
    });
  }

  function editUndo() {
    if (!editUndoStack.length) return;
    const state = editUndoStack.pop();
    const last = editChanges[editChanges.length - 1];
    if (last) {
      const el = document.querySelector(last.selector);
      if (el) {
        applyPropertyToElement(el, last.property, last.oldValue);
        if (el === editSelectedEl) renderEditSidePanel(el);
      }
    }
    editRedoStack.push({ changes: editChanges.map(c => ({ ...c })) });
    editChanges = state.changes;
  }

  function editRedo() {
    if (!editRedoStack.length) return;
    const state = editRedoStack.pop();
    const reapply = state.changes[state.changes.length - 1];
    if (reapply) {
      const el = document.querySelector(reapply.selector);
      if (el) {
        applyPropertyToElement(el, reapply.property, reapply.newValue);
        if (el === editSelectedEl) renderEditSidePanel(el);
      }
    }
    editUndoStack.push({ changes: editChanges.map(c => ({ ...c })) });
    editChanges = state.changes;
  }

  // ── Text editing ──────────────────────────────────────────────────────────────
  function activateTextEdit(el) {
    if (el.isContentEditable) return;
    const oldText = el.textContent;
    el.contentEditable = 'true';
    el.focus();

    // floating hint bar
    const bar = document.createElement('div');
    bar.className = 'vft-edit-commit-bar';
    bar.textContent = 'Enter to commit · Esc to cancel';
    document.body.appendChild(bar);
    positionEditBar(bar);

    const commit = () => {
      el.contentEditable = 'false';
      bar.remove();
      const newText = el.textContent;
      recordChange(el, 'textContent', oldText, newText);
      selectEditElement(el);
    };

    const cancel = () => {
      el.contentEditable = 'false';
      el.textContent = oldText;
      bar.remove();
    };

    el.addEventListener('keydown', function onKey(ev) {
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.removeEventListener('keydown', onKey); el.removeEventListener('blur', onBlur); commit(); }
      if (ev.key === 'Escape') { el.removeEventListener('keydown', onKey); el.removeEventListener('blur', onBlur); cancel(); }
    });
    const onBlur = () => { el.removeEventListener('blur', onBlur); commit(); };
    el.addEventListener('blur', onBlur);
  }

  function positionEditBar(bar) {
    const r = toolbar.getBoundingClientRect();
    bar.style.bottom = (window.innerHeight - r.top + 10) + 'px';
    bar.style.left = r.left + 'px';
  }

  function removeTextEditBar() {
    document.querySelector('.vft-edit-commit-bar')?.remove();
  }


  // ── Close overlay ─────────────────────────────────────────────────────────────
  function closeOverlay() {
    unfreeze();
    if (isEditMode) exitEditMode();
    clearInterval(statusInterval);
    document.removeEventListener('keydown', handleKeydown);
    dismissEscTooltip();
    closeReviewPanel();
    closeSettingsPanel();
    closeHelpPanel();
    canvas.remove();
    toolbar.remove();
    window.__vftOverlayActive = false;
    window.__vftAnnotations = [];
    window.__vftToolbar = null;
  }

  // ── Esc confirmation tooltip ──────────────────────────────────────────────────
  let escPending = false;
  let escTimeout = null;
  let escTooltip = null;

  function showEscTooltip() {
    if (escTooltip) return;
    const btnRect = toolbar.querySelector('[data-tool="close"]').getBoundingClientRect();
    escTooltip = document.createElement('div');
    escTooltip.className = 'vft-esc-tooltip';
    escTooltip.style.left = `${btnRect.left + btnRect.width / 2}px`;
    escTooltip.style.top  = `${btnRect.top - 10}px`;
    escTooltip.textContent = 'Press Esc again to close overlay';
    document.body.appendChild(escTooltip);
  }

  function dismissEscTooltip() {
    escPending = false;
    clearTimeout(escTimeout);
    escTimeout = null;
    escTooltip?.remove();
    escTooltip = null;
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  function handleKeydown(e) {
    if (isEditMode) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); editUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); editRedo(); return; }
      if (e.key === 'Escape') {
        // Deselect element first, then deactivate edit tool on next Esc
        if (editSelectedEl) { deselectEditElement(); return; }
        setActiveTool(null);
        return;
      }
      if (e.key === 'ArrowUp' && editSelectedEl?.parentElement &&
          editSelectedEl.parentElement !== document.body &&
          editSelectedEl.parentElement !== document.documentElement) {
        e.preventDefault(); selectEditElement(editSelectedEl.parentElement); return;
      }
      if (e.key === 'ArrowDown' && editSelectedEl?.firstElementChild) {
        e.preventDefault(); selectEditElement(editSelectedEl.firstElementChild); return;
      }
      if (e.key === 'ArrowLeft' && editSelectedEl?.previousElementSibling) {
        e.preventDefault(); selectEditElement(editSelectedEl.previousElementSibling); return;
      }
      if (e.key === 'ArrowRight' && editSelectedEl?.nextElementSibling) {
        e.preventDefault(); selectEditElement(editSelectedEl.nextElementSibling); return;
      }
      return;
    }
    if (!activePopup && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        if (e.key === 'e' || e.key === 'E') { setActiveTool(activeTool === 'edit'    ? null : 'edit');    return; }
        if (e.key === 'x' || e.key === 'X') { setActiveTool(activeTool === 'draw'    ? null : 'draw');    return; }
        if (e.key === 'c' || e.key === 'C') { setActiveTool(activeTool === 'comment' ? null : 'comment'); return; }
        if (e.key === 'f' || e.key === 'F') { toggleFreeze(); return; }
      }
    }

    if ((e.ctrlKey || e.metaKey) && !activePopup) {
      if (e.key === 'z' && !e.shiftKey)                    { e.preventDefault(); undo(); return; }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y')  { e.preventDefault(); redo(); return; }
      if (e.key === 'Enter')                               { e.preventDefault(); toolbar.querySelector('[data-tool="send"]')?.click(); return; }
    }

    if (e.key === 'Escape') {
      if (activePopup) return;
      if (isFrozen)      { unfreeze(); return; }
      if (settingsPanel) { closeSettingsPanel(); return; }
      if (reviewPanel)   { closeReviewPanel();   return; }
      if (helpPanel)     { closeHelpPanel();     return; }
      if (activeTool)    { setActiveTool(null); return; }
      if (!escPending) {
        escPending = true;
        showEscTooltip();
        escTimeout = setTimeout(dismissEscTooltip, 3000);
      } else {
        dismissEscTooltip();
        closeOverlay();
      }
    }
  }
  document.addEventListener('keydown', handleKeydown);

  // Close button — two-stage when annotations exist
  function handleCloseButton() {
    if (!window.__vftAnnotations.length) { closeOverlay(); return; }
    if (!escPending) {
      escPending = true;
      showEscTooltip();
      escTimeout = setTimeout(dismissEscTooltip, 3000);
    } else {
      dismissEscTooltip();
      closeOverlay();
    }
  }
}
