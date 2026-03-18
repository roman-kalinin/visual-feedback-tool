'use strict';

if (window.__vftOverlayActive) {
  // already injected — do nothing
} else {
  window.__vftOverlayActive = true;
  window.__vftAnnotations = [];

  // ── Canvas ──────────────────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id = 'vft-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  Object.assign(canvas.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2147483646',
    pointerEvents: 'none',
    cursor: 'crosshair'
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // ── Toolbar ─────────────────────────────────────────────────────────────────
  const toolbar = document.createElement('div');
  toolbar.id = 'vft-toolbar';
  window.__vftToolbar = toolbar;
  toolbar.innerHTML = `
    <button data-tool="draw" title="Freehand Draw">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
      </svg>
    </button>
    <button data-tool="rect" title="Rectangle Highlight">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      </svg>
    </button>
    <button data-tool="comment" title="Click or drag to comment">
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
    <div class="vft-status">
      <span class="vft-status-dot vft-dot-offline"></span>
      <span class="vft-buf-count"></span>
    </div>
    <button data-tool="review" title="Review buffer">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    </button>
    <div class="vft-divider"></div>
    <button data-tool="send" title="Send to Claude">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
      Send
    </button>
    <div class="vft-divider"></div>
    <button data-tool="close" title="Close overlay (Esc)">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;
  document.body.appendChild(toolbar);

  // ── State ────────────────────────────────────────────────────────────────────
  let activeTool = null;
  let isDrawing = false;
  let currentPath = [];
  let dragStart = null;
  let commentCounter = 0;
  let activePopup = null;
  let undoStack = [];   // snapshots of window.__vftAnnotations before each committed action
  let redoStack = [];

  function snapshotForUndo() {
    undoStack.push(JSON.stringify(window.__vftAnnotations));
    redoStack = [];
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(window.__vftAnnotations));
    window.__vftAnnotations = JSON.parse(undoStack.pop());
    // Recount commentCounter to match highest index in annotations
    commentCounter = window.__vftAnnotations.reduce((m, a) => a.type === 'comment' ? Math.max(m, a.index) : m, 0);
    redrawAll();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(window.__vftAnnotations));
    window.__vftAnnotations = JSON.parse(redoStack.pop());
    commentCounter = window.__vftAnnotations.reduce((m, a) => a.type === 'comment' ? Math.max(m, a.index) : m, 0);
    redrawAll();
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

    if (tool === 'review') {
      toggleReviewPanel();
      return;
    }

    if (tool === 'close') {
      _origCloseHandler('close');
      return;
    }

    if (tool === 'send') {
      chrome.runtime.sendMessage({ type: 'CAPTURE_AND_SEND', tabId: null }, response => {
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

  const TOOLS = ['draw', 'rect', 'comment', 'clear'];

  function setActiveTool(tool) {
    activeTool = tool;
    canvas.style.pointerEvents = tool ? 'all' : 'none';
    TOOLS.forEach(t => {
      const btn = toolbar.querySelector(`[data-tool="${t}"]`);
      if (btn) btn.classList.toggle('vft-active', t === tool);
    });
  }

  // ── Element inspector ────────────────────────────────────────────────────────
  function elementToInfo(target) {
    const rect = target.getBoundingClientRect();
    return {
      tag: target.tagName.toLowerCase(),
      id: target.id || null,
      classes: typeof target.className === 'string' ? target.className.trim().split(/\s+/).filter(Boolean).slice(0, 6) : [],
      text: (target.textContent || '').trim().slice(0, 80) || null,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      dataAttrs: target.dataset ? Object.fromEntries(Object.entries(target.dataset).slice(0, 4)) : {}
    };
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
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
    if (activeTool === 'rect') {
      dragStart = { x: e.clientX, y: e.clientY };
      isDrawing = true;
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
    if ((activeTool === 'rect' || activeTool === 'comment') && dragStart) {
      redrawAll();
      const w = e.clientX - dragStart.x, h = e.clientY - dragStart.y;
      drawRectShape(dragStart.x, dragStart.y, w, h, true, activeTool === 'comment');
    }
  });

  canvas.addEventListener('mouseup', e => {
    if (!isDrawing) return;
    isDrawing = false;

    if (activeTool === 'draw' && currentPath.length > 1) {
      snapshotForUndo();
      window.__vftAnnotations.push({ type: 'draw', points: [...currentPath], color: '#ef4444', strokeWidth: 2.5 });
      currentPath = [];
    }

    if (activeTool === 'rect' && dragStart) {
      const w = e.clientX - dragStart.x, h = e.clientY - dragStart.y;
      if (Math.abs(w) > 4 && Math.abs(h) > 4) {
        snapshotForUndo();
        window.__vftAnnotations.push({ type: 'rect', x: dragStart.x, y: dragStart.y, width: w, height: h });
      }
      dragStart = null;
      redrawAll();
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
        spawnCommentInput(e.clientX, e.clientY, area, element, elements);
      } else {
        // Point comment: inspect element at click
        const element = getElementAt(dragStart.x, dragStart.y);
        const pt = { x: dragStart.x, y: dragStart.y };
        dragStart = null;
        redrawAll();
        spawnCommentInput(pt.x, pt.y, null, element, null);
      }
    }
  });

  // ── Drawing helpers ──────────────────────────────────────────────────────────
  function drawRectShape(x, y, w, h, isPreview, isComment) {
    const color = isComment ? '#6366f1' : '#f59e0b';
    ctx.strokeStyle = isPreview ? color + '99' : color;
    ctx.lineWidth = 2;
    ctx.setLineDash(isPreview ? [6, 3] : []);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (!isPreview) {
      ctx.fillStyle = isComment ? 'rgba(99,102,241,0.06)' : 'rgba(245,158,11,0.08)';
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawComment(x, y, text, index, area) {
    // If area comment, draw the area rect first
    if (area) {
      drawRectShape(area.x, area.y, area.width, area.height, false, true);
      // Draw line from marker to area corner
      const cornerX = area.width >= 0 ? area.x + area.width : area.x;
      const cornerY = area.height >= 0 ? area.y : area.y + area.height;
      ctx.beginPath();
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.moveTo(x, y);
      ctx.lineTo(cornerX, cornerY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Numbered marker circle
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Cabin, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index), x, y);

    // Label bubble
    const padding = 7;
    ctx.font = '12px Cabin, system-ui, sans-serif';
    const metrics = ctx.measureText(text);
    const bx = x + 18, by = y - 15;
    const bw = Math.min(metrics.width + padding * 2, 260), bh = 24;
    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 5);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    // Truncate text to fit bubble
    let displayText = text;
    while (ctx.measureText(displayText).width > bw - padding * 2 && displayText.length > 0) {
      displayText = displayText.slice(0, -1);
    }
    ctx.fillText(displayText, bx + padding, by + bh / 2);
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
      if (ann.type === 'rect') drawRectShape(ann.x, ann.y, ann.width, ann.height, false, false);
      if (ann.type === 'comment') drawComment(ann.x, ann.y, ann.text, ann.index, ann.area || null);
    }
  }

  // ── Comment input (Figma-style popup) ────────────────────────────────────────
  function spawnCommentInput(x, y, area, element, elements) {
    // Draw a preview marker while typing
    commentCounter++;
    const index = commentCounter;

    const popup = document.createElement('div');
    Object.assign(popup.style, {
      position: 'fixed',
      left: `${Math.min(x + 14, window.innerWidth - 310)}px`,
      top: `${Math.max(y - 16, 8)}px`,
      zIndex: '2147483647',
      background: '#ffffff',
      border: '2px solid #6366f1',
      borderRadius: '10px',
      padding: '10px 10px 8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      width: '280px',
      fontFamily: 'Cabin, system-ui, sans-serif'
    });

    // Show detected element info if available
    const elementHint = element
      ? `<div style="font-size:10px;color:#9ca3af;margin-bottom:6px;line-height:1.4">
           ${element.id ? `#${element.id}` : ''}
           ${element.tag}
           ${element.text ? `· "${element.text.slice(0, 40)}${element.text.length > 40 ? '…' : ''}"` : ''}
         </div>`
      : '';

    popup.innerHTML = `
      ${elementHint}
      <textarea
        id="vft-comment-input"
        placeholder="Add comment… (Enter to save, Shift+Enter for newline)"
        style="
          width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:6px;
          padding:6px 8px;font-size:12px;font-family:Cabin,system-ui,sans-serif;
          resize:none;outline:none;height:60px;color:#0a2333;background:#f9fafb;
          display:block;
        "
      ></textarea>
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:6px">
        <button id="vft-comment-cancel" style="
          border:1px solid #e5e7eb;background:#fff;border-radius:6px;
          padding:4px 10px;font-size:12px;font-family:Cabin,system-ui,sans-serif;
          color:#6a7282;cursor:pointer;
        ">Cancel</button>
        <button id="vft-comment-save" style="
          border:none;background:#6366f1;border-radius:6px;
          padding:4px 10px;font-size:12px;font-family:Cabin,system-ui,sans-serif;
          color:#fff;cursor:pointer;font-weight:600;
        ">Save</button>
      </div>
    `;
    document.body.appendChild(popup);
    activePopup = popup;

    const textarea = popup.querySelector('#vft-comment-input');
    textarea.focus();

    // Draw preview circle while typing
    redrawAll();
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#6366f1aa';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px Cabin, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index), x, y);

    const cancel = () => {
      commentCounter--; // roll back unused counter
      if (popup.parentNode) document.body.removeChild(popup);
      activePopup = null;
      redrawAll();
      setActiveTool('comment');
    };

    const save = () => {
      const text = textarea.value.trim();
      if (popup.parentNode) document.body.removeChild(popup);
      activePopup = null;
      if (text) {
        snapshotForUndo();
        window.__vftAnnotations.push({
          type: 'comment',
          x, y,
          text,
          index,
          area: area || null,
          element: element || null,
          elements: elements || null
        });
      } else {
        commentCounter--;
      }
      redrawAll();
      setActiveTool('comment');
    };

    popup.querySelector('#vft-comment-cancel').addEventListener('click', cancel);
    popup.querySelector('#vft-comment-save').addEventListener('click', save);
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); }
      if (e.key === 'Escape') cancel();
    });
  }

  // ── Toast ────────────────────────────────────────────────────────────────────
  function showToast(msg, isError) {
    const t = document.createElement('div');
    Object.assign(t.style, {
      position: 'fixed',
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: isError ? '#dc2626' : '#0a2333',
      color: '#fff',
      padding: '8px 16px',
      borderRadius: '8px',
      zIndex: '2147483647',
      fontSize: '13px',
      fontFamily: 'Cabin, system-ui, sans-serif',
      pointerEvents: isError ? 'auto' : 'none',
      maxWidth: isError ? '420px' : undefined,
      display: isError ? 'flex' : undefined,
      alignItems: isError ? 'center' : undefined,
      gap: isError ? '10px' : undefined
    });
    if (isError) {
      const msgSpan = document.createElement('span');
      msgSpan.textContent = msg;
      msgSpan.style.flex = '1';
      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      Object.assign(copyBtn.style, {
        border: '1px solid rgba(255,255,255,0.5)',
        background: 'transparent',
        color: '#fff',
        borderRadius: '4px',
        padding: '2px 8px',
        fontSize: '11px',
        fontFamily: 'Cabin, system-ui, sans-serif',
        cursor: 'pointer',
        flexShrink: '0'
      });
      copyBtn.addEventListener('click', () => navigator.clipboard.writeText(msg));
      t.appendChild(msgSpan);
      t.appendChild(copyBtn);
    } else {
      t.textContent = msg;
    }
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) document.body.removeChild(t); }, isError ? 6000 : 3000);
  }

  // ── Resize canvas on window resize ──────────────────────────────────────────
  window.addEventListener('resize', () => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.putImageData(imageData, 0, 0);
  });

  // ── Review panel (inline popover) ───────────────────────────────────────────
  let reviewPanel = null;
  let stashedAnnotations = null;
  let previewingIndex = -1;

  function toggleReviewPanel() {
    if (reviewPanel) { closeReviewPanel(); return; }

    const reviewBtn = toolbar.querySelector('[data-tool="review"]');
    const btnRect = reviewBtn.getBoundingClientRect();

    reviewPanel = document.createElement('div');
    reviewPanel.id = 'vft-review-panel';
    Object.assign(reviewPanel.style, {
      position: 'fixed',
      bottom: `${window.innerHeight - btnRect.top + 10}px`,
      right: `${window.innerWidth - btnRect.right}px`,
      zIndex: '2147483647',
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
        await fetch('http://localhost:3333/submissions', { method: 'DELETE' });
        exitPreviewMode();
        loadReviewItems();
        updateBufferCount(0);
      } catch {}
    });

    loadReviewItems();

    setTimeout(() => {
      document.addEventListener('click', handleReviewOutsideClick);
    }, 0);
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
    if (reviewPanel && reviewPanel.parentNode) reviewPanel.parentNode.removeChild(reviewPanel);
    reviewPanel = null;
    window.__vftReviewPanel = null;
  }

  function enterPreviewMode(annotations, index) {
    if (stashedAnnotations === null) {
      stashedAnnotations = JSON.stringify(window.__vftAnnotations);
    }
    previewingIndex = index;
    window.__vftAnnotations = annotations;
    commentCounter = annotations.reduce((m, a) => a.type === 'comment' ? Math.max(m, a.index) : m, 0);
    redrawAll();
    // Show back banner
    let banner = document.getElementById('vft-preview-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'vft-preview-banner';
      Object.assign(banner.style, {
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1e1e1e',
        border: '1px solid rgba(255,255,255,0.14)',
        color: '#e2e8f0',
        fontSize: '12px',
        fontFamily: 'Cabin, system-ui, sans-serif',
        padding: '6px 14px',
        borderRadius: '8px',
        zIndex: '2147483647',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      });
      const label = document.createElement('span');
      label.textContent = 'Previewing submission';
      label.style.color = '#8b9eb0';
      const backBtn = document.createElement('button');
      backBtn.textContent = 'Back to current';
      Object.assign(backBtn.style, {
        border: 'none',
        background: '#0C8CE9',
        color: '#fff',
        fontSize: '11px',
        fontWeight: '600',
        fontFamily: 'Cabin, system-ui, sans-serif',
        padding: '3px 10px',
        borderRadius: '5px',
        cursor: 'pointer'
      });
      backBtn.addEventListener('click', () => exitPreviewMode());
      banner.appendChild(label);
      banner.appendChild(backBtn);
      document.body.appendChild(banner);
    }
  }

  function exitPreviewMode() {
    if (stashedAnnotations !== null) {
      window.__vftAnnotations = JSON.parse(stashedAnnotations);
      commentCounter = window.__vftAnnotations.reduce((m, a) => a.type === 'comment' ? Math.max(m, a.index) : m, 0);
      stashedAnnotations = null;
      previewingIndex = -1;
      redrawAll();
    }
    const banner = document.getElementById('vft-preview-banner');
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
  }

  async function loadReviewItems() {
    if (!reviewPanel) return;
    const body = reviewPanel.querySelector('.vft-rp-body');
    try {
      const res = await fetch('http://localhost:3333/submissions');
      if (!res.ok) { body.innerHTML = '<div class="vft-rp-empty">Server error ' + res.status + '</div>'; return; }
      const data = await res.json();
      renderReviewItems(data.submissions || []);
    } catch (err) {
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

    if (!list.length) {
      body.innerHTML = '<div class="vft-rp-empty">Buffer is empty</div>';
      return;
    }

    body.innerHTML = '';
    list.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'vft-rp-card' + (item.read ? ' vft-rp-read' : '');
      if (previewingIndex === i) card.classList.add('vft-rp-previewing');

      const time = item.receivedAt ? new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const readIcon = item.read
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#34d399;flex-shrink:0"><polyline points="20 6 9 17 4 12"/></svg>`
        : '';

      card.innerHTML = `
        <div class="vft-rp-card-row">
          ${readIcon}
          <div class="vft-rp-card-info">
            <div class="vft-rp-card-title">${esc(item.title || '(untitled)')}</div>
            <div class="vft-rp-card-meta">${item.annotationCount} annotation${item.annotationCount === 1 ? '' : 's'} · ${time}${item.read ? ' · read' : ''}</div>
          </div>
          <div class="vft-rp-card-btns">
            ${item.read ? '<button class="vft-rp-card-restore" title="Mark unread (re-send to Claude)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg></button>' : ''}
            <button class="vft-rp-card-del" title="Delete">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
              </svg>
            </button>
          </div>
        </div>
      `;

      // Click card → preview annotations on canvas
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.vft-rp-card-del') || e.target.closest('.vft-rp-card-restore')) return;
        try {
          const res = await fetch('http://localhost:3333/submissions/' + i);
          if (!res.ok) return;
          const data = await res.json();
          enterPreviewMode(data.annotations || [], i);
          // Highlight active card
          reviewPanel.querySelectorAll('.vft-rp-card').forEach(c => c.classList.remove('vft-rp-previewing'));
          card.classList.add('vft-rp-previewing');
        } catch {}
      });

      // Restore button
      const restoreBtn = card.querySelector('.vft-rp-card-restore');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await fetch('http://localhost:3333/submissions/' + i, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ read: false })
            });
            loadReviewItems();
          } catch {}
        });
      }

      card.querySelector('.vft-rp-card-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (previewingIndex === i) exitPreviewMode();
        try {
          await fetch('http://localhost:3333/submissions/' + i, { method: 'DELETE' });
          loadReviewItems();
          try {
            const h = await fetch('http://localhost:3333/health');
            if (h.ok) { const d = await h.json(); updateBufferCount(d.bufferCount); }
          } catch {}
        } catch {}
      });

      body.appendChild(card);
    });
  }

  // ── Status polling ───────────────────────────────────────────────────────────
  function updateBufferCount(count) {
    const el = toolbar.querySelector('.vft-buf-count');
    if (el) el.textContent = count > 0 ? String(count) : '';
  }

  function updateMcpDot(online) {
    const dot = toolbar.querySelector('.vft-status-dot');
    if (!dot) return;
    dot.classList.toggle('vft-dot-online', online);
    dot.classList.toggle('vft-dot-offline', !online);
  }

  const statusInterval = setInterval(async () => {
    try {
      const res = await fetch('http://localhost:3333/health');
      if (res.ok) {
        const data = await res.json();
        updateMcpDot(true);
        updateBufferCount(data.bufferCount);
        if (reviewPanel) loadReviewItems();
      } else {
        updateMcpDot(false);
      }
    } catch {
      updateMcpDot(false);
    }
  }, 4000);

  // Initial status check
  fetch('http://localhost:3333/health')
    .then(r => r.ok ? r.json() : null)
    .then(data => { if (data) { updateMcpDot(true); updateBufferCount(data.bufferCount); } })
    .catch(() => {});

  // ── Close overlay ────────────────────────────────────────────────────────────
  function closeOverlay() {
    clearInterval(statusInterval);
    document.removeEventListener('keydown', handleKeys);
    dismissEscTooltip();
    closeReviewPanel();
    canvas.remove();
    toolbar.remove();
    window.__vftOverlayActive = false;
    window.__vftAnnotations = [];
    window.__vftToolbar = null;
  }

  // ── Esc confirmation tooltip ─────────────────────────────────────────────────
  let escPending = false;
  let escTimeout = null;
  let escTooltip = null;

  function showEscTooltip() {
    if (escTooltip) return;
    const closeBtn = toolbar.querySelector('[data-tool="close"]');
    const btnRect = closeBtn.getBoundingClientRect();
    escTooltip = document.createElement('div');
    Object.assign(escTooltip.style, {
      position: 'fixed',
      left: `${btnRect.left + btnRect.width / 2}px`,
      top: `${btnRect.top - 10}px`,
      transform: 'translate(-50%, -100%)',
      background: '#1e1e1e',
      border: '1px solid rgba(255,255,255,0.14)',
      color: '#e2e8f0',
      fontSize: '11px',
      fontFamily: 'Cabin, system-ui, sans-serif',
      padding: '5px 10px',
      borderRadius: '6px',
      whiteSpace: 'nowrap',
      zIndex: '2147483647',
      pointerEvents: 'none',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    });
    escTooltip.textContent = 'Press Esc again to close overlay';
    document.body.appendChild(escTooltip);
  }

  function dismissEscTooltip() {
    escPending = false;
    clearTimeout(escTimeout);
    escTimeout = null;
    if (escTooltip && escTooltip.parentNode) escTooltip.parentNode.removeChild(escTooltip);
    escTooltip = null;
  }

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  function handleKeys(e) {
    // Undo / Redo
    if ((e.ctrlKey || e.metaKey) && !activePopup) {
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo(); return; }
    }

    // Escape — close review panel first, then two-stage overlay close
    if (e.key === 'Escape') {
      if (activePopup) return;
      if (reviewPanel) { closeReviewPanel(); return; }
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
  document.addEventListener('keydown', handleKeys);

  // Close button also uses two-stage when annotations exist
  const _origCloseHandler = tool => {
    if (tool !== 'close') return false;
    if (!window.__vftAnnotations.length) { closeOverlay(); return true; }
    if (!escPending) {
      escPending = true;
      showEscTooltip();
      escTimeout = setTimeout(dismissEscTooltip, 3000);
    } else {
      dismissEscTooltip();
      closeOverlay();
    }
    return true;
  };
}
