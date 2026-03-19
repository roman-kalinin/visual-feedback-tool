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
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      Add task
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
    screenshotMode: 'smart'        // always | smart | never
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
  let activeTool = null;
  let isDrawing = false;
  let currentPath = [];
  let dragStart = null;
  let commentCounter = 0;
  let activePopup = null;
  let undoStack = [];
  let redoStack = [];
  let hoveredComment = null;

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
  const btnDraw     = toolbar.querySelector('[data-tool="draw"]');
  const btnComment  = toolbar.querySelector('[data-tool="comment"]');
  const statusDot   = toolbar.querySelector('.vft-status-dot');
  const mcpLabel    = toolbar.querySelector('#vft-mcp-label');
  const statusCluster = toolbar.querySelector('#vft-status-cluster');

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
    if (tool === 'review')   { toggleReviewPanel(); return; }
    if (tool === 'settings') { toggleSettingsPanel(); return; }
    if (tool === 'help')     { toggleHelpPanel(); return; }
    if (tool === 'close')    { handleCloseButton(); return; }

    if (tool === 'send') {
      chrome.runtime.sendMessage({ type: 'CAPTURE_AND_SEND' }, response => {
        if (chrome.runtime.lastError) {
          showToast('Send failed — check MCP server', true);
          return;
        }
        if (response?.ok) {
          showToast(`Added to buffer (${response.bufferCount} item${response.bufferCount === 1 ? '' : 's'})`);
          updateBufferCount(response.bufferCount);
          if (reviewPanel) loadReviewItems();
        } else {
          showToast(`Send failed: ${response?.error || 'unknown error'}`, true);
        }
      });
      return;
    }

    setActiveTool(activeTool === tool ? null : tool);
  });

  function setActiveTool(tool) {
    activeTool = tool;
    canvas.style.pointerEvents = tool ? 'all' : 'none';
    btnDraw.classList.toggle('vft-active', tool === 'draw');
    btnComment.classList.toggle('vft-active', tool === 'comment');
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

  function drawComment(x, y, text, index, area, showBubble = false) {
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
      const metrics = ctx.measureText(text);
      const bx = x + 18, by = y - 15;
      const bw = Math.min(metrics.width + padding * 2, 260), bh = 24;
      ctx.fillStyle = C_INDIGO;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 5);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      let displayText = text;
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
      if (ann.type === 'comment') drawComment(ann.x, ann.y, ann.text, ann.index, ann.area || null, ann === hoveredComment);
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

  function createCommentPopup(anchorX, anchorY, element, prefillText) {
    const popup = document.createElement('div');
    popup.className = 'vft-comment-popup';
    positionPopup(popup, anchorX, anchorY);

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
      <div class="vft-comment-actions">
        <button id="vft-comment-cancel" class="vft-comment-btn vft-comment-btn-cancel">Cancel</button>
        <button id="vft-comment-save"   class="vft-comment-btn vft-comment-btn-save">Save</button>
      </div>
    `;

    if (prefillText) popup.querySelector('#vft-comment-input').value = prefillText;
    return popup;
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

    if (!isEdit) {
      commentCounter++;
      redrawAll();
      drawMarker(x, y, commentCounter, true);
    }

    const popup = createCommentPopup(anchorX, anchorY, isEdit ? ann.element : element, prefill);
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
      popup.remove();
      activePopup = null;
      if (isEdit) {
        if (text && text !== ann.text) {
          snapshotForUndo();
          window.__vftAnnotations[editIndex].text = text;
        }
      } else {
        if (text) {
          snapshotForUndo();
          window.__vftAnnotations.push({
            type: 'comment', x, y, text, index: commentCounter,
            area: area || null, element: element || null, elements: elements || null
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
          <div class="vft-hp-shortcut"><span class="vft-hp-key">X</span> Draw tool</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key">C</span> Comment tool</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key vft-hp-key-wide">Ctrl Z</span> Undo</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key vft-hp-key-wide">Ctrl Y</span> Redo</div>
          <div class="vft-hp-shortcut"><span class="vft-hp-key vft-hp-key-wide">Esc ×2</span> Close overlay</div>
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
    if (!statusDot) return;
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

  statusCluster?.addEventListener('click', () => {
    if (lastMcpError) showToast(lastMcpError, true);
  });

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

  // ── Close overlay ─────────────────────────────────────────────────────────────
  function closeOverlay() {
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
    if (!activePopup && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        if (e.key === 'x' || e.key === 'X') { setActiveTool(activeTool === 'draw'    ? null : 'draw');    return; }
        if (e.key === 'c' || e.key === 'C') { setActiveTool(activeTool === 'comment' ? null : 'comment'); return; }
      }
    }

    if ((e.ctrlKey || e.metaKey) && !activePopup) {
      if (e.key === 'z' && !e.shiftKey)                    { e.preventDefault(); undo(); return; }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y')  { e.preventDefault(); redo(); return; }
    }

    if (e.key === 'Escape') {
      if (activePopup) return;
      if (settingsPanel) { closeSettingsPanel(); return; }
      if (reviewPanel)   { closeReviewPanel();   return; }
      if (helpPanel)     { closeHelpPanel();     return; }
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
