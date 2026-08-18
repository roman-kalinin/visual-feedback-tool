'use strict';

/**
 * Self-contained Excalidraw-style sketch editor for the Visual Feedback Tool.
 *
 * Exposes a single global:
 *   window.__vftOpenSketch(onSave, bgDataUrl)
 *     - onSave(pngDataUrl | null): called with a PNG data URL when the user
 *       saves, or null when they cancel / close without saving.
 *     - bgDataUrl (optional): a page screenshot to trace over as a faint
 *       background. The exported PNG never includes it — only the sketch.
 *
 * Zero dependencies, CSP-safe (no external scripts/styles), dark-themed to
 * match the rest of the overlay.
 *
 * Object model — every drawing is a flat list of shapes:
 *   { type:'draw',  points:[{x,y}...], color, width }
 *   { type:'line',  x1,y1,x2,y2,        color, width }
 *   { type:'arrow', x1,y1,x2,y2,        color, width }
 *   { type:'rect',  x,y,w,h,            color, width }
 *   { type:'ellipse', x,y,w,h,          color, width }
 *   { type:'text',  x,y,text,           color, size }
 */
if (!window.__vftOpenSketch) {
  const NS = {};
  window.__vftSketchNS = NS;

  const FONT   = 'Cabin, system-ui, sans-serif';
  const Z      = '2147483647';
  const COLORS = ['#111827', '#6b7280', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#0C8CE9', '#6366f1'];
  const WIDTHS = { thin: 2, medium: 4, bold: 7 };
  const TOOLS  = [
    { id: 'select', label: 'Select', key: 'V', icon: cursorIcon() },
    { id: 'draw',   label: 'Pen',    key: 'P', icon: penIcon() },
    { id: 'line',   label: 'Line',   key: 'L', icon: lineIcon() },
    { id: 'arrow',  label: 'Arrow',  key: 'A', icon: arrowIcon() },
    { id: 'rect',   label: 'Rectangle', key: 'R', icon: rectIcon() },
    { id: 'ellipse',label: 'Ellipse',   key: 'O', icon: ellipseIcon() },
    { id: 'text',   label: 'Text',   key: 'T', icon: textIcon() },
    { id: 'eraser', label: 'Eraser', key: 'E', icon: eraserIcon() }
  ];
  // Wireframe component library — searchable in the Components palette. Each
  // drags out a box. `desc` + `keywords` power search; `key` is a shortcut.
  const WIRE = [
    { id: 'image',    label: 'Image', key: 'I', icon: imageIcon(),   desc: 'Placeholder box with crossed diagonals', keywords: 'picture photo media placeholder thumbnail' },
    { id: 'button',   label: 'Button', key: 'B', icon: buttonIcon(), desc: 'Rounded button with a label', keywords: 'cta action submit click' },
    { id: 'input',    label: 'Input field', key: 'F', icon: inputIcon(), desc: 'Text input with a placeholder line', keywords: 'textbox form field entry' },
    { id: 'dropdown', label: 'Dropdown', key: 'D', icon: dropdownIcon(), desc: 'Select field with a chevron', keywords: 'select menu combobox picker' },
    { id: 'search',   label: 'Search bar', key: 'S', icon: searchIcon(), desc: 'Field with a magnifier icon', keywords: 'find filter query lookup' },
    { id: 'checkbox', label: 'Checkbox', key: 'K', icon: checkboxIcon(), desc: 'Square with a checkmark', keywords: 'check tick form toggle select' },
    { id: 'radio',    label: 'Radio button', key: 'U', icon: radioIcon(), desc: 'Circle with a selected dot', keywords: 'option choice form select' },
    { id: 'toggle',   label: 'Toggle', key: 'G', icon: toggleIcon(), desc: 'On/off switch with a knob', keywords: 'switch on off flag setting' },
    { id: 'tabs',     label: 'Tabs', key: 'J', icon: tabsIcon(), desc: 'Row of tabs with an active one', keywords: 'segment navigation nav pills' },
    { id: 'card',     label: 'Card', key: 'Q', icon: cardIcon(), desc: 'Image area with text lines below', keywords: 'tile panel container product' },
    { id: 'avatar',   label: 'Avatar', key: 'C', icon: avatarIcon(), desc: 'Circle with a person glyph', keywords: 'profile user photo account' },
    { id: 'heading',  label: 'Text lines', key: 'H', icon: linesIcon(), desc: 'Heading plus body text lines', keywords: 'paragraph copy label heading title' },
    { id: 'divider',  label: 'Divider', key: 'M', icon: dividerIcon(), desc: 'Horizontal separator line', keywords: 'rule separator line hr' }
  ];
  const WIRE_BY_ID = Object.fromEntries(WIRE.map(w => [w.id, w]));
  // Shapes that accept a background fill color.
  const FILLABLE = new Set(['rect', 'ellipse', 'image', 'button', 'input', 'dropdown', 'search', 'card']);

  window.__vftOpenSketch = function (onSave, bgDataUrl) {
    // Guard against double-open
    if (NS.root) return;

    // ── State ──────────────────────────────────────────────────────────────
    let shapes      = [];
    let undoStack   = [];
    let redoStack   = [];
    let tool        = 'draw';
    let strokeColor = '#ef4444';  // outline color for new shapes
    let fillColor   = 'none';     // fill color for new closed shapes ('none' = unfilled)
    let width       = WIDTHS.medium;
    let selection   = [];         // indices into shapes (multi-select)
    let drag        = null;       // in-progress interaction
    let bgImg       = null;
    let hiddenIdx   = -1;         // shape hidden while its text is being edited
    let editingText = false;      // true while the inline text editor is focused
    let textEditFinish = null;    // commit fn for an open inline text editor
    let spaceHeld   = false;      // Space bar → temporary pan mode

    // Camera: a world point (camera.x, camera.y) sits at the stage's top-left;
    // scale = screen pixels per world unit.
    const camera = { x: 0, y: 0, scale: 1 };
    function worldToScreen(wx, wy) {
      return { x: (wx - camera.x) * camera.scale, y: (wy - camera.y) * camera.scale };
    }
    function screenToWorld(sx, sy) {
      return { x: sx / camera.scale + camera.x, y: sy / camera.scale + camera.y };
    }
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // Recently-used component ids (persisted across opens within the session,
    // and to chrome.storage.local when available). Seeded with common ones so
    // the bar is never empty on first use.
    const DEFAULT_RECENTS = ['button', 'input', 'image', 'checkbox', 'card', 'dropdown'];
    let recents = NS.recents ? [...NS.recents] : [...DEFAULT_RECENTS];
    function saveRecents() {
      NS.recents = [...recents];
      try {
        if (chrome?.storage?.local) chrome.storage.local.set({ vftSketchRecents: recents });
      } catch (_) { /* storage unavailable — in-memory only */ }
    }
    try {
      if (chrome?.storage?.local && !NS.recents) {
        chrome.storage.local.get('vftSketchRecents', r => {
          if (r && Array.isArray(r.vftSketchRecents) && r.vftSketchRecents.length) {
            recents = r.vftSketchRecents.slice(0, 12);
            NS.recents = [...recents];
            if (NS.root) renderRecents();
          }
        });
      }
    } catch (_) {}

    // ── Selection helpers ──────────────────────────────────────────────────
    function clearSelection() { selection = []; }
    function selectOnly(i) { selection = [i]; }

    // ── DOM ────────────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'vft-sketch-root';
    root.style.zIndex = Z;
    NS.root = root;

    root.innerHTML = `
      <div class="vft-sk-toolbar">
        <div class="vft-sk-group vft-sk-tools"></div>
        <div class="vft-sk-sep"></div>
        <button class="vft-sk-btn vft-sk-components" data-act="components" title="Component library">
          ${gridIcon()} All components <span class="vft-sk-caret">&#9662;</span>
        </button>
        <div class="vft-sk-group vft-sk-recents"></div>
        <div class="vft-sk-sep"></div>
        <div class="vft-sk-group vft-sk-colorslots">
          <button class="vft-sk-slot" data-slot="stroke" title="Stroke color">
            <span class="vft-sk-slot-label">Stroke</span>
            <span class="vft-sk-slot-chip" id="vft-sk-stroke-chip"></span>
          </button>
          <button class="vft-sk-slot" data-slot="fill" title="Fill color">
            <span class="vft-sk-slot-label">Fill</span>
            <span class="vft-sk-slot-chip" id="vft-sk-fill-chip"></span>
          </button>
        </div>
        <div class="vft-sk-sep"></div>
        <div class="vft-sk-group vft-sk-widths"></div>
        <div class="vft-sk-sep"></div>
        <div class="vft-sk-group">
          <button class="vft-sk-btn" data-act="undo" title="Undo (Ctrl+Z)">${undoIcon()}</button>
          <button class="vft-sk-btn" data-act="redo" title="Redo (Ctrl+Y)">${redoIcon()}</button>
          <button class="vft-sk-btn" data-act="delete" title="Delete selected (Del)">${trashIcon()}</button>
          <button class="vft-sk-btn" data-act="clear" title="Clear all">Clear</button>
        </div>
        <div class="vft-sk-spacer"></div>
        ${bgDataUrl ? `<label class="vft-sk-bgtoggle"><input type="checkbox" id="vft-sk-bg" checked> Trace page</label>` : ''}
        <button class="vft-sk-btn vft-sk-cancel" data-act="cancel">Cancel</button>
        <button class="vft-sk-btn vft-sk-save" data-act="save">Attach sketch</button>
      </div>
      <div class="vft-sk-stage">
        <canvas class="vft-sk-canvas"></canvas>
        <div class="vft-sk-hint">Space/middle-drag to pan &middot; scroll to zoom &middot; Alt-drag to duplicate</div>
      </div>
    `;
    document.body.appendChild(root);

    // Populate tool buttons
    const toolsEl = root.querySelector('.vft-sk-tools');
    TOOLS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'vft-sk-btn vft-sk-tool';
      b.dataset.tool = t.id;
      b.title = `${t.label} (${t.key})`;
      b.innerHTML = t.icon;
      b.addEventListener('click', () => setTool(t.id));
      toolsEl.appendChild(b);
    });

    // Recently-used components (auto-pinned) + Components library launcher
    const recentsEl = root.querySelector('.vft-sk-recents');
    function renderRecents() {
      recentsEl.innerHTML = '';
      recents.slice(0, 6).forEach(id => {
        const t = WIRE_BY_ID[id];
        if (!t) return;
        const b = document.createElement('button');
        b.className = 'vft-sk-btn vft-sk-tool';
        b.dataset.tool = t.id;
        b.title = `${t.label} (${t.key})`;
        b.innerHTML = t.icon;
        b.addEventListener('click', () => pickComponent(t.id));
        recentsEl.appendChild(b);
      });
      // Reflect active state if the current tool is a component
      root.querySelectorAll('.vft-sk-recents .vft-sk-tool').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === tool));
    }
    function pickComponent(id) {
      // Move to front of recents, persist, then activate the tool.
      recents = [id, ...recents.filter(x => x !== id)].slice(0, 12);
      saveRecents();
      renderRecents();
      setTool(id);
    }
    root.querySelector('.vft-sk-components').addEventListener('click', () => openComponentPalette());
    renderRecents();

    // Colour slots (stroke + fill), each opening a palette popover
    root.querySelector('.vft-sk-colorslots').addEventListener('click', e => {
      const slotBtn = e.target.closest('[data-slot]');
      if (slotBtn) openColorPopover(slotBtn.dataset.slot, slotBtn);
    });

    // Populate widths
    const widthsEl = root.querySelector('.vft-sk-widths');
    Object.entries(WIDTHS).forEach(([name, w]) => {
      const b = document.createElement('button');
      b.className = 'vft-sk-wbtn';
      b.dataset.width = String(w);
      b.title = `${name} line`;
      b.innerHTML = `<span class="vft-sk-wline" style="height:${w}px"></span>`;
      b.addEventListener('click', () => setWidth(w));
      widthsEl.appendChild(b);
    });

    const canvas = root.querySelector('.vft-sk-canvas');
    const c2d = canvas.getContext('2d');
    const stage = root.querySelector('.vft-sk-stage');
    const bgCheckbox = root.querySelector('#vft-sk-bg');

    // ── Sizing ─────────────────────────────────────────────────────────────
    let W = 0, H = 0, DPR = window.devicePixelRatio || 1;
    function sizeCanvas() {
      const r = stage.getBoundingClientRect();
      W = Math.round(r.width);
      H = Math.round(r.height);
      canvas.width  = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      redraw();
    }
    const ro = new ResizeObserver(sizeCanvas);
    ro.observe(stage);

    // Load trace background (world-anchored at the origin).
    if (bgDataUrl) {
      const im = new Image();
      im.onload = () => { bgImg = im; redraw(); };
      im.src = bgDataUrl;
    }

    // ── Toolbar actions ────────────────────────────────────────────────────
    root.querySelector('.vft-sk-toolbar').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'undo')   undo();
      if (act === 'redo')   redo();
      if (act === 'delete') deleteSelected();
      if (act === 'clear')  { if (shapes.length) { pushUndo(); shapes = []; clearSelection(); redraw(); } }
      if (act === 'cancel') close(null);
      if (act === 'save')   commit();
    });

    if (bgCheckbox) bgCheckbox.addEventListener('change', redraw);

    // ── Tool / style setters ───────────────────────────────────────────────
    function setTool(t) {
      tool = t;
      if (t !== 'select') clearSelection();
      root.querySelectorAll('.vft-sk-tool').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === t));
      canvas.style.cursor = toolCursor();
      redraw();
    }
    // `renderRecents` is a hoisted inner function; guard for very-early calls.
    // Component shortcut keys go through pickComponent so recents update.
    function activateTool(id) {
      if (WIRE_BY_ID[id]) pickComponent(id); else setTool(id);
    }
    function toolCursor() {
      if (spaceHeld) return 'grab';
      return tool === 'select' ? 'default' : (tool === 'text' ? 'text' : 'crosshair');
    }
    function applyToSelection(fn, filter) {
      const targets = selection.filter(i => shapes[i] && (!filter || filter(shapes[i])));
      if (!targets.length) return;
      pushUndo();
      targets.forEach(i => fn(shapes[i]));
      redraw();
    }
    function setStroke(c) {
      strokeColor = c;
      updateSlotChips();
      applyToSelection(s => { s.strokeColor = c; }, s => s.type !== 'eraser');
    }
    function setFill(c) {   // c is a color string or 'none'
      fillColor = c;
      updateSlotChips();
      applyToSelection(s => { s.fillColor = c; }, s => FILLABLE.has(s.type));
    }
    function setWidth(w) {
      width = w;
      root.querySelectorAll('.vft-sk-wbtn').forEach(b =>
        b.classList.toggle('active', Number(b.dataset.width) === w));
      applyToSelection(s => {
        if (s.type === 'text') s.size = 12 + w * 3; else s.width = w;
      });
    }
    // Paint the two toolbar colour-slot chips to reflect current stroke/fill.
    function updateSlotChips() {
      paintChip(root.querySelector('#vft-sk-stroke-chip'), strokeColor);
      paintChip(root.querySelector('#vft-sk-fill-chip'), fillColor);
    }
    function paintChip(el, color) {
      if (!el) return;
      if (color === 'none') { el.style.background = 'transparent'; el.classList.add('vft-sk-chip-none'); }
      else { el.style.background = color; el.classList.remove('vft-sk-chip-none'); }
    }
    // Palette popover for a colour slot ('stroke' | 'fill').
    let colorPopover = null;
    function closeColorPopover() {
      if (colorPopover) { colorPopover.remove(); colorPopover = null; }
      document.removeEventListener('pointerdown', onPopoverOutside, true);
    }
    function onPopoverOutside(e) {
      if (colorPopover && !colorPopover.contains(e.target) &&
          !e.target.closest('.vft-sk-slot')) closeColorPopover();
    }
    function openColorPopover(slot, anchorBtn) {
      closeColorPopover();
      const pop = document.createElement('div');
      pop.className = 'vft-sk-colorpop';
      const current = slot === 'stroke' ? strokeColor : fillColor;
      const apply = c => (slot === 'stroke' ? setStroke(c) : setFill(c));

      const grid = document.createElement('div');
      grid.className = 'vft-sk-colorgrid';
      // "None" is available for both slots (no fill, or no outline).
      const none = document.createElement('button');
      none.className = 'vft-sk-swatch vft-sk-swatch-none' + (current === 'none' ? ' active' : '');
      none.title = slot === 'fill' ? 'No fill' : 'No stroke';
      none.addEventListener('click', () => { apply('none'); closeColorPopover(); });
      grid.appendChild(none);
      COLORS.forEach(c => {
        const b = document.createElement('button');
        b.className = 'vft-sk-swatch' + (current === c ? ' active' : '');
        b.style.background = c;
        b.title = c;
        b.addEventListener('click', () => { apply(c); closeColorPopover(); });
        grid.appendChild(b);
      });
      pop.appendChild(grid);

      // Custom color: native picker + live hex, applied as you drag.
      const customRow = document.createElement('label');
      customRow.className = 'vft-sk-colorcustom';
      const seed = /^#[0-9a-fA-F]{6}$/.test(current) ? current : '#000000';
      customRow.innerHTML = `
        <span class="vft-sk-colorcustom-swatch" style="background:${seed}"></span>
        <span class="vft-sk-colorcustom-label">Custom…</span>
        <span class="vft-sk-colorcustom-hex">${seed}</span>
        <input type="color" class="vft-sk-colorcustom-input" value="${seed}" />
      `;
      const input = customRow.querySelector('input');
      const sw = customRow.querySelector('.vft-sk-colorcustom-swatch');
      const hex = customRow.querySelector('.vft-sk-colorcustom-hex');
      let dragSnap = false;   // snapshot once per continuous pick, not per event
      input.addEventListener('input', () => {
        const c = input.value;
        sw.style.background = c;
        hex.textContent = c;
        if (slot === 'stroke') strokeColor = c; else fillColor = c;
        updateSlotChips();
        // Live-apply to the selection without flooding undo history.
        const targets = selection.filter(i => shapes[i] &&
          (slot === 'stroke' ? shapes[i].type !== 'eraser' : FILLABLE.has(shapes[i].type)));
        if (targets.length) {
          if (!dragSnap) { pushUndo(); dragSnap = true; }
          targets.forEach(i => { if (slot === 'stroke') shapes[i].strokeColor = c; else shapes[i].fillColor = c; });
          redraw();
        }
      });
      input.addEventListener('change', () => { dragSnap = false; });
      // keep the popover open while using the native picker
      input.addEventListener('pointerdown', e => e.stopPropagation());
      pop.appendChild(customRow);

      root.appendChild(pop);
      const r = anchorBtn.getBoundingClientRect();
      const rootR = root.getBoundingClientRect();
      // Keep the popover inside the viewport.
      const popW = pop.offsetWidth || 188;
      let left = r.left - rootR.left;
      left = Math.min(left, rootR.width - popW - 8);
      pop.style.left = Math.max(8, left) + 'px';
      pop.style.top  = (r.bottom - rootR.top + 6) + 'px';
      colorPopover = pop;
      setTimeout(() => document.addEventListener('pointerdown', onPopoverOutside, true), 0);
    }

    // ── Component library palette (searchable) ─────────────────────────────
    let paletteEl = null;
    function closeComponentPalette() {
      if (paletteEl) { paletteEl.remove(); paletteEl = null; }
      document.removeEventListener('pointerdown', onPaletteOutside, true);
    }
    function onPaletteOutside(e) {
      if (paletteEl && !paletteEl.contains(e.target) && !e.target.closest('.vft-sk-components'))
        closeComponentPalette();
    }
    function openComponentPalette() {
      if (paletteEl) { closeComponentPalette(); return; }
      const pop = document.createElement('div');
      pop.className = 'vft-sk-palette';
      pop.innerHTML = `
        <input type="text" class="vft-sk-palette-search" placeholder="Search components…" />
        <div class="vft-sk-palette-grid"></div>
      `;
      root.appendChild(pop);
      const anchor = root.querySelector('.vft-sk-components').getBoundingClientRect();
      const rootR = root.getBoundingClientRect();
      const popW = pop.offsetWidth || 320;
      let left = anchor.left - rootR.left;
      left = Math.max(8, Math.min(left, rootR.width - popW - 8));
      pop.style.left = left + 'px';
      pop.style.top  = (anchor.bottom - rootR.top + 6) + 'px';
      const grid = pop.querySelector('.vft-sk-palette-grid');
      const search = pop.querySelector('.vft-sk-palette-search');
      const render = (q) => {
        const term = (q || '').trim().toLowerCase();
        grid.innerHTML = '';
        WIRE.filter(t => !term ||
          (t.label + ' ' + t.desc + ' ' + t.keywords).toLowerCase().includes(term)
        ).forEach(t => {
          const item = document.createElement('button');
          item.className = 'vft-sk-palette-item';
          item.innerHTML = `
            <span class="vft-sk-palette-icon">${t.icon}</span>
            <span class="vft-sk-palette-text">
              <span class="vft-sk-palette-title">${t.label}<span class="vft-sk-palette-key">${t.key}</span></span>
              <span class="vft-sk-palette-desc">${t.desc}</span>
            </span>`;
          item.addEventListener('click', () => { pickComponent(t.id); closeComponentPalette(); });
          grid.appendChild(item);
        });
        if (!grid.children.length) grid.innerHTML = '<div class="vft-sk-palette-empty">No matches</div>';
      };
      render('');
      // Search input keystrokes must not trigger canvas shortcuts.
      search.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); closeComponentPalette(); }
      });
      search.addEventListener('input', () => render(search.value));
      paletteEl = pop;
      setTimeout(() => { search.focus(); document.addEventListener('pointerdown', onPaletteOutside, true); }, 0);
    }

    setTool('draw'); setWidth(width); updateSlotChips();

    // ── Undo / redo ────────────────────────────────────────────────────────
    function snap() { return clone(shapes); }
    function restore(st) { shapes = clone(st); }
    // Call pushUndo() with the pre-change state BEFORE mutating.
    function pushUndo() { redoStack = []; undoStack.push(snap()); }
    function undo() {
      if (!undoStack.length) return;
      redoStack.push(snap());
      restore(undoStack.pop());
      clearSelection(); redraw();
    }
    function redo() {
      if (!redoStack.length) return;
      undoStack.push(snap());
      restore(redoStack.pop());
      clearSelection(); redraw();
    }
    function deleteSelected() {
      if (!selection.length) return;
      pushUndo();
      // Remove highest indices first to keep lower ones valid.
      [...selection].sort((a, b) => b - a).forEach(i => shapes.splice(i, 1));
      clearSelection(); redraw();
    }

    // ── Pointer interaction ────────────────────────────────────────────────
    function ptScreen(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    // World-space pointer — every tool/hit-test consumes these transparently.
    function pt(e) {
      const s = ptScreen(e);
      return screenToWorld(s.x, s.y);
    }

    canvas.addEventListener('pointerdown', e => {
      // Pan: middle mouse, or Space held with left button — overrides tools.
      if (e.button === 1 || (e.button === 0 && spaceHeld)) {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        drag = { mode: 'pan', startScreen: ptScreen(e), camX: camera.x, camY: camera.y };
        canvas.style.cursor = 'grabbing';
        return;
      }
      if (e.button !== 0) return;
      const p = pt(e);
      canvas.setPointerCapture(e.pointerId);

      if (tool === 'select') {
        const scr = ptScreen(e);
        // 1. Resize handle on the current selection (screen-space test)
        const handle = handleAt(scr.x, scr.y);
        if (handle) {
          startResize(handle, p);
          return;
        }
        // 2. Shape hit
        const hit = hitTest(p.x, p.y);
        if (hit >= 0) {
          if (e.shiftKey) {
            const at = selection.indexOf(hit);
            if (at >= 0) selection.splice(at, 1); else selection.push(hit);
            if (selection.length) syncStyleUI(shapes[selection[selection.length - 1]]);
            else updateSlotChips();   // toolbar reflects defaults again
            drag = null; redraw();
            return;
          }
          // Clicking an already-selected text shape enters edit mode (first
          // click selects it, a second click starts typing — like Figma).
          if (shapes[hit].type === 'text' &&
              selection.length === 1 && selection[0] === hit && !e.altKey) {
            try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
            openTextEditor(shapes[hit].x, shapes[hit].y, hit);
            return;
          }
          if (selection.indexOf(hit) < 0) selectOnly(hit);
          syncStyleUI(shapes[hit]);
          startShapeMove(p, e.altKey);
          redraw();
          return;
        }
        // 3. Empty space → marquee-select shapes.
        if (!e.shiftKey) clearSelection();
        drag = { mode: 'marquee', start: p, cur: p, base: [...selection] };
        redraw();
        return;
      }

      if (tool === 'eraser') {
        const hit = hitTest(p.x, p.y);
        if (hit >= 0) { pushUndo(); shapes.splice(hit, 1); redraw(); }
        drag = { mode: 'erase' };
        return;
      }

      if (tool === 'text') {
        openTextEditor(p.x, p.y, null);
        return;
      }

      if (tool === 'draw') {
        drag = { mode: 'draw', shape: { type: 'draw', points: [p], strokeColor, width } };
        return;
      }

      // Drag-out shapes: line / arrow / rect / ellipse + all wireframe boxes
      drag = { mode: 'shape', start: p, shape: makeShape(tool, p, p) };
    });

    const HANDLE_CURSOR = {
      nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
      n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize'
    };
    canvas.addEventListener('pointermove', e => {
      // Hover feedback (no active drag): show resize/move cursors in select mode.
      if (!drag && tool === 'select' && !spaceHeld) {
        const scr = ptScreen(e);
        const h = handleAt(scr.x, scr.y);
        if (h) canvas.style.cursor = HANDLE_CURSOR[h];
        else {
          const w = pt(e);
          canvas.style.cursor = hitTest(w.x, w.y) >= 0 ? 'move' : 'default';
        }
      }
      if (!drag) return;
      if (drag.mode === 'pan') {
        const s = ptScreen(e);
        camera.x = drag.camX - (s.x - drag.startScreen.x) / camera.scale;
        camera.y = drag.camY - (s.y - drag.startScreen.y) / camera.scale;
        redraw();
        return;
      }
      const p = pt(e);

      if (drag.mode === 'draw') {
        drag.shape.points.push(p);
        redraw(drag.shape);
      } else if (drag.mode === 'shape') {
        drag.shape = makeShape(tool, drag.start, p);
        redraw(drag.shape);
      } else if (drag.mode === 'move') {
        const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        selection.forEach((idx, k) => applyMove(shapes[idx], drag.orig[k], dx, dy));
        redraw();
      } else if (drag.mode === 'marquee') {
        drag.cur = p;
        const box = normRect(drag.start, drag.cur);
        const hits = [];
        shapes.forEach((s, i) => { if (rectsIntersect(bbox(s), box)) hits.push(i); });
        selection = drag.base.length
          ? Array.from(new Set([...drag.base, ...hits]))
          : hits;
        redraw();
      } else if (drag.mode.startsWith('resize')) {
        doResize(drag, p);
        redraw();
      } else if (drag.mode === 'erase') {
        const hit = hitTest(p.x, p.y);
        if (hit >= 0) { pushUndo(); shapes.splice(hit, 1); redraw(); }
      }
    });

    canvas.addEventListener('pointerup', () => {
      if (!drag) return;
      if (drag.mode === 'pan') {
        drag = null;
        canvas.style.cursor = spaceHeld ? 'grab' : toolCursor();
        return;
      }
      if (drag.mode === 'draw') {
        // Pen stays active for repeated freehand strokes (like Figma's pencil).
        if (drag.shape.points.length > 1) { pushUndo(); shapes.push(drag.shape); clearSelection(); }
      } else if (drag.mode === 'shape') {
        if (shapeHasSize(drag.shape)) {
          pushUndo();
          shapes.push(drag.shape);
          // Figma-style: drop back to Select and select the new shape.
          const newIdx = shapes.length - 1;
          setTool('select');
          selectOnly(newIdx);
          syncStyleUI(shapes[newIdx]);
        } else {
          clearSelection();
        }
      } else if (drag.mode === 'move' && drag.altCopy) {
        // Undo was already pushed when the copies were created; nothing to do
        // if the copy wasn't dragged (still a valid duplicate in place).
      } else if ((drag.mode === 'move' || drag.mode.startsWith('resize')) && drag.moved) {
        // Commit as one undo step: the pre-drag snapshot.
        undoStack.push(drag.pre); redoStack = [];
      }
      drag = null;
      redraw();
    });

    // ── Resize (single shape or group) ─────────────────────────────────────
    // The fixed world anchor point for a given handle over box B.
    function anchorFor(handle, B) {
      const L = B.x, R = B.x + B.w, T = B.y, Bt = B.y + B.h;
      switch (handle) {
        case 'nw': return { x: R,  y: Bt };
        case 'ne': return { x: L,  y: Bt };
        case 'se': return { x: L,  y: T  };
        case 'sw': return { x: R,  y: T  };
        case 'n':  return { x: L,  y: Bt };   // vertical only; x scale forced to 1
        case 's':  return { x: L,  y: T  };
        case 'e':  return { x: L,  y: T  };   // horizontal only; y scale forced to 1
        case 'w':  return { x: R,  y: T  };
      }
    }
    const affectsX = h => h === 'e' || h === 'w' || h === 'ne' || h === 'nw' || h === 'se' || h === 'sw';
    const affectsY = h => h === 'n' || h === 's' || h === 'ne' || h === 'nw' || h === 'se' || h === 'sw';

    function startResize(handle, worldP) {
      const B = currentSelectionWorldBox();
      if (!B) return;
      drag = {
        mode: selection.length > 1 ? 'resizeGroup' : 'resizeShape',
        handle, box: B, anchor: anchorFor(handle, B), pre: snap(), moved: false,
        origShapes: selection.map(i => clone(shapes[i]))
      };
    }

    function doResize(d, worldP) {
      d.moved = true;
      const B = d.box, a = d.anchor;
      // The moving handle's original world point = the box extent opposite the anchor.
      const movingX = d.handle.includes('w') ? B.x : (d.handle.includes('e') ? B.x + B.w : null);
      const movingY = d.handle.includes('n') ? B.y : (d.handle.includes('s') ? B.y + B.h : null);
      let sx = 1, sy = 1;
      if (affectsX(d.handle) && movingX !== null && movingX - a.x !== 0)
        sx = (worldP.x - a.x) / (movingX - a.x);
      if (affectsY(d.handle) && movingY !== null && movingY - a.y !== 0)
        sy = (worldP.y - a.y) / (movingY - a.y);
      if (!isFinite(sx)) sx = 1;
      if (!isFinite(sy)) sy = 1;

      selection.forEach((idx, k) => {
        shapes[idx] = clone(d.origShapes[k]);
        applyScaleToShape(shapes[idx], a, sx, sy);
      });
    }

    function scalePointAboutAnchor(px, py, a, sx, sy) {
      return { x: a.x + (px - a.x) * sx, y: a.y + (py - a.y) * sy };
    }
    function applyScaleToShape(s, a, sx, sy) {
      if (s.type === 'line' || s.type === 'arrow') {
        const p1 = scalePointAboutAnchor(s.x1, s.y1, a, sx, sy);
        const p2 = scalePointAboutAnchor(s.x2, s.y2, a, sx, sy);
        s.x1 = p1.x; s.y1 = p1.y; s.x2 = p2.x; s.y2 = p2.y;
      } else if (s.type === 'draw') {
        s.points = s.points.map(p => scalePointAboutAnchor(p.x, p.y, a, sx, sy));
      } else if (s.type === 'text') {
        const p = scalePointAboutAnchor(s.x, s.y, a, sx, sy);
        s.x = p.x; s.y = p.y;
        // Scale font by the active axis (corner drags use the smaller factor).
        const both = sx !== 1 && sy !== 1;
        const f = both ? Math.min(Math.abs(sx), Math.abs(sy)) : Math.abs(sx !== 1 ? sx : sy);
        s.size = Math.max(6, s.size * f);
      } else {
        // rect-like (x,y,w,h)
        const c1 = scalePointAboutAnchor(s.x, s.y, a, sx, sy);
        const c2 = scalePointAboutAnchor(s.x + s.w, s.y + s.h, a, sx, sy);
        s.x = Math.min(c1.x, c2.x); s.w = Math.abs(c2.x - c1.x);
        s.y = Math.min(c1.y, c2.y); s.h = Math.abs(c2.y - c1.y);
      }
    }

    // Begin moving the current selection; Alt clones it first (Figma-style copy).
    function startShapeMove(p, altCopy) {
      if (altCopy) {
        pushUndo();
        const copies = selection.map(i => clone(shapes[i]));
        const base = shapes.length;
        copies.forEach(c => shapes.push(c));
        selection = copies.map((_, k) => base + k);
        drag = {
          mode: 'move', start: p, moved: false, pre: null, altCopy: true,
          orig: selection.map(i => clone(shapes[i]))
        };
      } else {
        drag = {
          mode: 'move', start: p, pre: snap(), moved: false,
          orig: selection.map(i => clone(shapes[i]))
        };
      }
    }

    // ── Rect utils ─────────────────────────────────────────────────────────
    function normRect(a, b) {
      return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    }
    function rectsIntersect(r1, r2) {
      return !(r2.x > r1.x + r1.w || r2.x + r2.w < r1.x || r2.y > r1.y + r1.h || r2.y + r2.h < r1.y);
    }

    // Cursor-anchored wheel zoom.
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const m = ptScreen(e);
      const wBefore = screenToWorld(m.x, m.y);
      const factor = Math.exp(-e.deltaY * 0.0015);
      camera.scale = clamp(camera.scale * factor, 0.05, 20);
      // Keep the world point under the cursor fixed on screen.
      camera.x = wBefore.x - m.x / camera.scale;
      camera.y = wBefore.y - m.y / camera.scale;
      redraw();
    }, { passive: false });

    canvas.addEventListener('dblclick', e => {
      const p = pt(e);
      const hit = hitTest(p.x, p.y);
      // Double-clicking existing text edits it (in any tool). On empty space,
      // only create new text when the text tool is active — a select-mode
      // double-click should not silently drop a text box.
      if (hit >= 0 && shapes[hit].type === 'text') {
        openTextEditor(shapes[hit].x, shapes[hit].y, hit);
      } else if (tool === 'text') {
        openTextEditor(p.x, p.y, null);
      }
    });

    // ── Text editor (inline) ───────────────────────────────────────────────
    function openTextEditor(x, y, editIdx) {
      const existing = editIdx != null ? shapes[editIdx] : null;
      const size = existing ? existing.size : 12 + width * 3;
      hiddenIdx = editIdx != null ? editIdx : -1;   // hide edited shape while typing
      redraw();
      const ta = document.createElement('textarea');
      ta.className = 'vft-sk-textedit';
      ta.value = existing ? existing.text : '';
      // Position in screen space (x,y are world coords); scale font with zoom.
      const scr = worldToScreen(x, y);
      const screenSize = size * camera.scale;
      Object.assign(ta.style, {
        left: scr.x + 'px', top: (scr.y - screenSize) + 'px',
        color: existing ? inkOf(existing) : strokeColor,
        fontSize: screenSize + 'px'
      });
      stage.appendChild(ta);
      editingText = true;
      textEditFinish = null;
      ta.focus();
      const autosize = () => {
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
      };
      autosize();
      const finish = commitText => {
        if (ta._done) return;
        ta._done = true;
        textEditFinish = null;
        editingText = false;
        const val = ta.value.replace(/\s+$/, '');
        ta.remove();
        hiddenIdx = -1;
        if (!commitText) { redraw(); return; }
        pushUndo();
        if (existing) {
          if (val) { existing.text = val; }
          else shapes.splice(editIdx, 1);
        } else if (val) {
          shapes.push({ type: 'text', x, y, text: val, strokeColor, size });
        }
        clearSelection();
        redraw();
      };
      textEditFinish = finish;
      ta.addEventListener('keydown', ev => {
        ev.stopPropagation();   // keep keys away from host page + our shortcuts
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); finish(true); }
        else if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
        else setTimeout(autosize, 0);
      });
      ta.addEventListener('input', autosize);
      ta.addEventListener('blur', () => finish(true));
    }

    // ── Shape helpers ──────────────────────────────────────────────────────
    function makeShape(type, a, b) {
      if (type === 'line' || type === 'arrow')
        return { type, x1: a.x, y1: a.y, x2: b.x, y2: b.y, strokeColor, width };
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      return { type, x, y, w, h, strokeColor, fillColor, width };
    }
    function shapeHasSize(s) {
      if (s.type === 'line' || s.type === 'arrow')
        return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 3;
      return s.w > 3 || s.h > 3;
    }
    function applyMove(s, orig, dx, dy) {
      if (orig.type === 'line' || orig.type === 'arrow') {
        s.x1 = orig.x1 + dx; s.y1 = orig.y1 + dy;
        s.x2 = orig.x2 + dx; s.y2 = orig.y2 + dy;
      } else if (orig.type === 'draw') {
        s.points = orig.points.map(pp => ({ x: pp.x + dx, y: pp.y + dy }));
      } else {
        s.x = orig.x + dx; s.y = orig.y + dy;
      }
    }

    function bbox(s) {
      if (s.type === 'draw') {
        const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      if (s.type === 'line' || s.type === 'arrow')
        return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
      if (s.type === 'text') {
        c2d.font = `${s.size}px ${FONT}`;
        const lines = s.text.split('\n');
        const tw = Math.max(...lines.map(l => c2d.measureText(l).width));
        return { x: s.x, y: s.y - s.size, w: tw, h: s.size * 1.2 * lines.length };
      }
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    }

    function hitTest(x, y) {
      const pad = 8;
      for (let i = shapes.length - 1; i >= 0; i--) {
        const b = bbox(shapes[i]);
        if (x >= b.x - pad && x <= b.x + b.w + pad &&
            y >= b.y - pad && y <= b.y + b.h + pad) return i;
      }
      return -1;
    }

    // Reflect the selected shape's stroke/fill/width in the toolbar (UI only).
    function syncStyleUI(s) {
      strokeColor = s.strokeColor || s.color || '#111827';
      fillColor = s.fillColor || (s.filled ? (s.color || strokeColor) : 'none');
      updateSlotChips();
      const w = s.type === 'text' ? Math.round((s.size - 12) / 3) : s.width;
      root.querySelectorAll('.vft-sk-wbtn').forEach(b =>
        b.classList.toggle('active', Number(b.dataset.width) === w));
    }

    // ── Rendering ──────────────────────────────────────────────────────────
    function drawShape(g, s) {
      // Back-compat: legacy shapes stored a single `color`.
      const rawInk = s.strokeColor || s.color || '#111827';
      const noStroke = rawInk === 'none';
      // Transparent stroke when "no stroke" is chosen — outlines & glyphs vanish.
      const ink = noStroke ? 'rgba(0,0,0,0)' : rawInk;
      const fill = s.fillColor || (s.filled ? (s.color || ink) : 'none');
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = ink;
      g.fillStyle = ink;
      g.lineWidth = s.width || 2;
      if (s.type === 'draw') {
        g.beginPath();
        s.points.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
        g.stroke();
      } else if (s.type === 'line') {
        g.beginPath(); g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke();
      } else if (s.type === 'arrow') {
        drawArrow(g, s);
      } else if (s.type === 'rect') {
        g.beginPath(); g.roundRect(s.x, s.y, s.w, s.h, 4);
        if (fill !== 'none') { g.fillStyle = fill; g.fill(); }
        g.stroke();
      } else if (s.type === 'ellipse') {
        g.beginPath();
        g.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
        if (fill !== 'none') { g.fillStyle = fill; g.fill(); }
        g.stroke();
      } else if (s.type === 'text') {
        g.save();
        g.font = `${s.size}px ${FONT}`;
        g.textAlign = 'start';
        g.textBaseline = 'alphabetic';
        g.fillStyle = ink;
        s.text.split('\n').forEach((line, i) =>
          g.fillText(line, s.x, s.y + i * s.size * 1.2));
        g.restore();
      } else if (s.type === 'image') {
        fillBoxBg(g, s, fill); drawImagePlaceholder(g, s);
      } else if (s.type === 'button') {
        fillBoxBg(g, s, fill, Math.min(8, s.h / 2)); drawButtonBox(g, s);
      } else if (s.type === 'input') {
        fillBoxBg(g, s, fill, 3); drawInputBox(g, s);
      } else if (s.type === 'avatar') {
        drawAvatarBox(g, s);
      } else if (s.type === 'heading') {
        drawTextLines(g, s);
      } else if (s.type === 'dropdown') {
        fillBoxBg(g, s, fill, 3); drawDropdown(g, s);
      } else if (s.type === 'search') {
        fillBoxBg(g, s, fill, Math.min(s.h / 2, 8)); drawSearch(g, s);
      } else if (s.type === 'checkbox') {
        drawCheckbox(g, s);
      } else if (s.type === 'radio') {
        drawRadio(g, s);
      } else if (s.type === 'toggle') {
        drawToggle(g, s);
      } else if (s.type === 'tabs') {
        drawTabs(g, s);
      } else if (s.type === 'card') {
        fillBoxBg(g, s, fill, 6); drawCard(g, s);
      } else if (s.type === 'divider') {
        drawDivider(g, s);
      }
    }
    // Paint a wireframe box's background fill (before its outline/glyphs draw).
    function fillBoxBg(g, s, fill, r) {
      if (!fill || fill === 'none') return;
      g.save();
      g.fillStyle = fill;
      g.beginPath(); g.roundRect(s.x, s.y, s.w, s.h, r || 0); g.fill();
      g.restore();
    }

    // ── Wireframe renderers ────────────────────────────────────────────────
    function drawImagePlaceholder(g, s) {
      const { x, y, w, h } = s;
      g.beginPath(); g.rect(x, y, w, h); g.stroke();
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x + w, y + h);
      g.moveTo(x + w, y); g.lineTo(x, y + h);
      g.stroke();
    }
    function drawButtonBox(g, s) {
      const { x, y, w, h } = s;
      const r = Math.min(8, h / 2);
      g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke();
      const fs = Math.max(10, Math.min(15, h * 0.4));
      g.save();
      g.font = `${fs}px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = inkOf(s);
      g.fillText(s.label || 'Button', x + w / 2, y + h / 2 + fs * 0.06);
      g.restore();
    }
    function drawInputBox(g, s) {
      const { x, y, w, h } = s;
      g.beginPath(); g.roundRect(x, y, w, h, 3); g.stroke();
      // placeholder caret + label line
      const pad = Math.min(10, w * 0.08);
      const ly = y + h / 2;
      g.save();
      g.lineWidth = Math.max(1, (s.width || 2) * 0.7);
      g.globalAlpha = 0.6;
      g.beginPath();
      g.moveTo(x + pad, ly);
      g.lineTo(x + Math.min(w * 0.45, w - pad), ly);
      g.stroke();
      g.restore();
    }
    function drawAvatarBox(g, s) {
      const { x, y, w, h } = s;
      const d = Math.min(w, h);
      const cx = x + w / 2, cy = y + h / 2, r = d / 2;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      // simple person glyph
      g.save();
      g.lineWidth = Math.max(1, (s.width || 2) * 0.9);
      g.beginPath(); g.arc(cx, cy - r * 0.22, r * 0.32, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      g.arc(cx, cy + r * 0.62, r * 0.55, Math.PI * 1.15, Math.PI * 1.85, true);
      g.stroke();
      g.restore();
    }
    function drawTextLines(g, s) {
      const { x, y, w, h } = s;
      const rows = Math.max(1, Math.round(h / 14));
      const gap = h / rows;
      g.save();
      for (let i = 0; i < rows; i++) {
        const ly = y + gap * (i + 0.5);
        const lw = i === 0 ? w * 0.65 : (i === rows - 1 ? w * 0.4 : w);
        g.lineWidth = i === 0 ? (s.width || 2) * 1.4 : (s.width || 2);
        g.globalAlpha = i === 0 ? 1 : 0.7;
        g.beginPath(); g.moveTo(x, ly); g.lineTo(x + lw, ly); g.stroke();
      }
      g.restore();
    }
    function drawDropdown(g, s) {
      const { x, y, w, h } = s;
      g.beginPath(); g.roundRect(x, y, w, h, 3); g.stroke();
      // label line
      const pad = Math.min(10, w * 0.08);
      g.save();
      g.lineWidth = Math.max(1, (s.width || 2) * 0.7); g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(x + pad, y + h / 2); g.lineTo(x + w * 0.4, y + h / 2); g.stroke();
      g.restore();
      // down chevron on the right
      const cx = x + w - Math.min(16, h * 0.7), cy = y + h / 2, a = Math.min(4, h * 0.15);
      g.beginPath();
      g.moveTo(cx - a, cy - a * 0.6); g.lineTo(cx, cy + a * 0.6); g.lineTo(cx + a, cy - a * 0.6);
      g.stroke();
    }
    function drawSearch(g, s) {
      const { x, y, w, h } = s;
      g.beginPath(); g.roundRect(x, y, w, h, Math.min(h / 2, 8)); g.stroke();
      // magnifier at left
      const r = Math.min(h * 0.24, 8);
      const cx = x + Math.max(12, h * 0.5), cy = y + h / 2;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      g.moveTo(cx + r * 0.7, cy + r * 0.7);
      g.lineTo(cx + r * 1.5, cy + r * 1.5);
      g.stroke();
      // placeholder line
      g.save();
      g.lineWidth = Math.max(1, (s.width || 2) * 0.7); g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(cx + r + 8, cy); g.lineTo(x + w * 0.6, cy); g.stroke();
      g.restore();
    }
    function drawCheckbox(g, s) {
      const { x, y, w, h } = s;
      const d = Math.min(w, h);
      g.beginPath(); g.roundRect(x, y, d, d, Math.min(3, d * 0.15)); g.stroke();
      // checkmark
      g.beginPath();
      g.moveTo(x + d * 0.22, y + d * 0.52);
      g.lineTo(x + d * 0.42, y + d * 0.72);
      g.lineTo(x + d * 0.78, y + d * 0.28);
      g.stroke();
      // optional label line to the right if box is wide
      if (w > d * 1.4) labelLine(g, s, x + d + 8, y + d / 2, x + w);
    }
    function drawRadio(g, s) {
      const { x, y, w, h } = s;
      const d = Math.min(w, h), r = d / 2;
      const cx = x + r, cy = y + r;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      g.fillStyle = inkOf(s); g.fill();
      if (w > d * 1.4) labelLine(g, s, x + d + 8, cy, x + w);
    }
    function drawToggle(g, s) {
      const { x, y, w, h } = s;
      const r = h / 2;
      g.beginPath(); g.roundRect(x, y, w, h, r); g.stroke();
      // knob to the right (on)
      const kx = x + w - r, ky = y + r;
      g.beginPath(); g.arc(kx, ky, r * 0.72, 0, Math.PI * 2);
      g.fillStyle = inkOf(s); g.fill();
    }
    function drawTabs(g, s) {
      const { x, y, w, h } = s;
      // baseline
      g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.stroke();
      const n = Math.max(2, Math.min(5, Math.round(w / 80)));
      const tw = w / n;
      // active tab = first, drawn as open-bottom rounded box
      g.beginPath();
      g.moveTo(x, y + h);
      g.lineTo(x, y + 4);
      g.arcTo(x, y, x + 4, y, 4);
      g.lineTo(x + tw - 4, y);
      g.arcTo(x + tw, y, x + tw, y + 4, 4);
      g.lineTo(x + tw, y + h);
      g.stroke();
      // labels for other tabs
      g.save();
      g.lineWidth = Math.max(1, (s.width || 2) * 0.7); g.globalAlpha = 0.55;
      for (let i = 0; i < n; i++) {
        const cx = x + tw * i + tw / 2, ly = y + h / 2;
        g.beginPath(); g.moveTo(cx - tw * 0.22, ly); g.lineTo(cx + tw * 0.22, ly); g.stroke();
      }
      g.restore();
    }
    function drawCard(g, s) {
      const { x, y, w, h } = s;
      g.beginPath(); g.roundRect(x, y, w, h, 6); g.stroke();
      // image area (top ~55%) with crossed diagonals
      const ih = h * 0.55;
      g.beginPath(); g.moveTo(x, y + ih); g.lineTo(x + w, y + ih); g.stroke();
      g.save(); g.globalAlpha = 0.5;
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x + w, y + ih);
      g.moveTo(x + w, y); g.lineTo(x, y + ih);
      g.stroke();
      g.restore();
      // text lines below
      const pad = Math.min(12, w * 0.08);
      const rows = [0.62, 1.0, 0.45];
      g.save();
      rows.forEach((frac, i) => {
        const ly = y + ih + (h - ih) * ((i + 1) / (rows.length + 1));
        g.lineWidth = i === 0 ? (s.width || 2) * 1.3 : (s.width || 2);
        g.globalAlpha = i === 0 ? 1 : 0.65;
        g.beginPath(); g.moveTo(x + pad, ly); g.lineTo(x + pad + (w - pad * 2) * frac, ly); g.stroke();
      });
      g.restore();
    }
    function drawDivider(g, s) {
      const { x, y, w, h } = s;
      const ly = y + h / 2;
      g.beginPath(); g.moveTo(x, ly); g.lineTo(x + w, ly); g.stroke();
    }
    function labelLine(g, s, x1, y1, x2) {
      g.save();
      g.lineWidth = Math.max(1, (s.width || 2) * 0.8); g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(Math.min(x2, x1 + (x2 - x1) * 0.8), y1); g.stroke();
      g.restore();
    }

    function drawArrow(g, s) {
      const { x1, y1, x2, y2 } = s;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const head = 8 + (s.width || 2) * 1.6;
      g.beginPath();
      g.moveTo(x2, y2);
      g.lineTo(x2 - head * Math.cos(ang - Math.PI / 7), y2 - head * Math.sin(ang - Math.PI / 7));
      g.moveTo(x2, y2);
      g.lineTo(x2 - head * Math.cos(ang + Math.PI / 7), y2 - head * Math.sin(ang + Math.PI / 7));
      g.stroke();
    }

    // Combined DPR × camera-scale world transform. World point (wx,wy) →
    // device pixel ((wx-cam.x)*scale*DPR, (wy-cam.y)*scale*DPR).
    function setWorldTransform() {
      const s = camera.scale;
      c2d.setTransform(DPR * s, 0, 0, DPR * s, -camera.x * s * DPR, -camera.y * s * DPR);
    }
    function setScreenTransform() {
      c2d.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function redraw(preview) {
      setScreenTransform();
      c2d.clearRect(0, 0, W, H);

      setWorldTransform();

      // Trace background — anchored in world space at the origin.
      if (bgImg && (!bgCheckbox || bgCheckbox.checked)) {
        c2d.globalAlpha = 0.28;
        c2d.drawImage(bgImg, 0, 0, bgImg.width, bgImg.height);
        c2d.globalAlpha = 1;
      }

      shapes.forEach((s, i) => { if (i !== hiddenIdx) drawShape(c2d, s); });
      if (preview) drawShape(c2d, preview);

      // ── Screen-space overlays (fixed pixel size regardless of zoom) ──
      setScreenTransform();
      drawSelectionOverlay();
      drawMarquee();
    }

    // ── Selection overlay + resize handles (screen space) ──────────────────
    const HANDLE_IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    function handleScreenRects() {
      // Returns {id -> {x,y}} centre points in screen space for current target.
      const b = currentSelectionScreenBox();
      if (!b) return null;
      const { x, y, w, h } = b;
      return {
        nw: { x, y }, n: { x: x + w / 2, y }, ne: { x: x + w, y },
        e: { x: x + w, y: y + h / 2 }, se: { x: x + w, y: y + h },
        s: { x: x + w / 2, y: y + h }, sw: { x, y: y + h }, w: { x, y: y + h / 2 }
      };
    }
    // The world-space bounds of the current selection.
    function currentSelectionWorldBox() {
      return selection.length ? selectionBBox() : null;
    }
    function currentSelectionScreenBox() {
      const b = currentSelectionWorldBox();
      if (!b) return null;
      const tl = worldToScreen(b.x, b.y);
      const br = worldToScreen(b.x + b.w, b.y + b.h);
      return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
    }
    function selectionBBox() {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      selection.filter(i => shapes[i]).forEach(i => {
        const b = bbox(shapes[i]);
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
      });
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    function handleAt(sx, sy) {
      const hs = handleScreenRects();
      if (!hs) return null;
      for (const id of HANDLE_IDS) {
        const c = hs[id];
        if (Math.abs(sx - c.x) <= 7 && Math.abs(sy - c.y) <= 7) return id;
      }
      return null;
    }

    function drawSelectionOverlay() {
      const b = currentSelectionScreenBox();
      if (!b) return;
      c2d.save();
      c2d.strokeStyle = '#6366f1';
      c2d.lineWidth = 1;
      // dashed box for multi-select, solid for single
      if (selection.length > 1) c2d.setLineDash([4, 3]);
      c2d.strokeRect(b.x, b.y, b.w, b.h);
      c2d.setLineDash([]);
      // handles
      const hs = handleScreenRects();
      c2d.fillStyle = '#fff';
      HANDLE_IDS.forEach(id => {
        const c = hs[id];
        c2d.fillRect(c.x - 4, c.y - 4, 8, 8);
        c2d.strokeRect(c.x - 4, c.y - 4, 8, 8);
      });
      c2d.restore();
    }
    function drawMarquee() {
      if (!drag || drag.mode !== 'marquee') return;
      const a = worldToScreen(drag.start.x, drag.start.y);
      const b = worldToScreen(drag.cur.x, drag.cur.y);
      c2d.save();
      c2d.strokeStyle = '#6366f1';
      c2d.fillStyle = 'rgba(99,102,241,0.12)';
      c2d.lineWidth = 1;
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      c2d.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      c2d.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      c2d.restore();
    }
    // ── Export ─────────────────────────────────────────────────────────────
    // Renders every shape onto a white canvas cropped to its content bounds
    // (in world coords), returning a single PNG data URL.
    function commit() {
      if (textEditFinish) textEditFinish(true);   // flush any open text editor
      if (!shapes.length) { close(null); return; }
      const EXPORT_SCALE = 2, PAD = 24;
      // World-space content bounds.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      shapes.forEach(s => {
        const b = bbox(s);
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
      });
      minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
      const cw = Math.max(1, maxX - minX), ch = Math.max(1, maxY - minY);
      const out = document.createElement('canvas');
      out.width  = Math.round(cw * EXPORT_SCALE);
      out.height = Math.round(ch * EXPORT_SCALE);
      const g = out.getContext('2d');
      g.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, cw, ch);
      g.translate(-minX, -minY);            // world → image-local
      shapes.forEach(s => drawShape(g, s));
      close(out.toDataURL('image/png'));
    }

    // ── Keyboard ───────────────────────────────────────────────────────────
    // True when focus/target is any editable field inside the sketch UI (the
    // inline text editor or the component-search box). Those own their keys.
    function isEditableTarget(el) {
      if (!el || !el.tagName) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' ||
        (el.classList && el.classList.contains('vft-sk-textedit'));
    }
    function onKey(e) {
      // While an editable field is active, keystrokes belong to it alone. Stop
      // them here (capture phase) so neither our shortcuts nor the host page's
      // overlay shortcuts (e/x/c/f tool toggles) ever see them.
      if (editingText || isEditableTarget(e.target) || isEditableTarget(document.activeElement)) {
        e.stopPropagation();   // field's own listener handles Enter/Escape
        return;
      }

      // The sketch owns the keyboard while open — never let the host page's
      // document-level shortcuts fire underneath us.
      e.stopPropagation();

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!spaceHeld && !drag) { spaceHeld = true; canvas.style.cursor = 'grab'; }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); commit(); return; }
      if (e.ctrlKey || e.metaKey) return;   // leave other combos alone
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selection.length) { e.preventDefault(); deleteSelected(); } return; }
      const t = [...TOOLS, ...WIRE].find(t => t.key.toLowerCase() === e.key.toLowerCase());
      if (t) { e.preventDefault(); activateTool(t.id); }
    }
    function onKeyUp(e) {
      if (e.code === 'Space' || e.key === ' ') {
        spaceHeld = false;
        if (!drag) canvas.style.cursor = toolCursor();
      }
    }
    // Capture phase so the host page's overlay shortcuts don't also fire
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('keyup', onKeyUp, true);

    // ── Teardown ───────────────────────────────────────────────────────────
    function close(result) {
      closeColorPopover();
      closeComponentPalette();
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('keyup', onKeyUp, true);
      ro.disconnect();
      root.remove();
      NS.root = null;
      try { onSave && onSave(result); } catch (err) { console.error(err); }
    }

    // Initial layout.
    sizeCanvas();
  };

  // ── Small utils ──────────────────────────────────────────────────────────
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function inkOf(s) {
    const c = s.strokeColor || s.color || '#111827';
    return c === 'none' ? 'rgba(0,0,0,0)' : c;
  }

  // ── Inline SVG icons (currentColor) ────────────────────────────────────────
  function svg(inner) { return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`; }
  function cursorIcon()  { return svg('<path d="M4 3l7 17 2.5-6.5L20 11z"/>'); }
  function penIcon()     { return svg('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18z"/><path d="M2 2l7.586 7.586"/>'); }
  function lineIcon()    { return svg('<line x1="5" y1="19" x2="19" y2="5"/>'); }
  function arrowIcon()   { return svg('<line x1="5" y1="19" x2="19" y2="5"/><polyline points="12 5 19 5 19 12"/>'); }
  function rectIcon()    { return svg('<rect x="4" y="6" width="16" height="12" rx="2"/>'); }
  function ellipseIcon() { return svg('<ellipse cx="12" cy="12" rx="9" ry="6"/>'); }
  function textIcon()    { return svg('<polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/>'); }
  function eraserIcon()  { return svg('<path d="M20 20H7L3 16a2 2 0 010-3l8-8 8 8-6 7"/><line x1="11" y1="5" x2="18" y2="12"/>'); }
  function gridIcon()    { return svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'); }
  function undoIcon()    { return svg('<polyline points="9 14 4 9 9 4"/><path d="M4 9h11a5 5 0 015 5v0a5 5 0 01-5 5H9"/>'); }
  function redoIcon()    { return svg('<polyline points="15 14 20 9 15 4"/><path d="M20 9H9a5 5 0 00-5 5v0a5 5 0 005 5h6"/>'); }
  function trashIcon()   { return svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/>'); }
  // Wireframe tool icons
  function imageIcon()   { return svg('<rect x="3" y="5" width="18" height="14" rx="1"/><line x1="3" y1="5" x2="21" y2="19"/><line x1="21" y1="5" x2="3" y2="19"/>'); }
  function buttonIcon()  { return svg('<rect x="3" y="8" width="18" height="8" rx="4"/><line x1="8" y1="12" x2="16" y2="12"/>'); }
  function inputIcon()   { return svg('<rect x="3" y="8" width="18" height="8" rx="1"/><line x1="6" y1="12" x2="11" y2="12"/>'); }
  function avatarIcon()  { return svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18a5.5 5.5 0 0111 0"/>'); }
  function linesIcon()   { return svg('<line x1="4" y1="7" x2="16" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="13" y2="17"/>'); }
  function outlineIcon() { return svg('<rect x="4" y="5" width="16" height="14" rx="2"/>'); }
  function fillIcon()    { return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="5" width="16" height="14" rx="2"/></svg>`; }
  // New wireframe stencil icons
  function checkboxIcon(){ return svg('<rect x="4" y="4" width="16" height="16" rx="2"/><polyline points="8 12 11 15 16 8"/>'); }
  function radioIcon()   { return svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'); }
  function toggleIcon()  { return svg('<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="16" cy="12" r="3" fill="currentColor"/>'); }
  function dropdownIcon(){ return svg('<rect x="3" y="7" width="18" height="10" rx="2"/><polyline points="15 10 17 12.5 19 10"/>'); }
  function searchIcon()  { return svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="8" cy="12" r="2.5"/><line x1="10" y1="14" x2="12" y2="16"/>'); }
  function tabsIcon()    { return svg('<line x1="3" y1="17" x2="21" y2="17"/><path d="M4 17v-4a1 1 0 011-1h4a1 1 0 011 1v4"/>'); }
  function cardIcon()    { return svg('<rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="11" x2="20" y2="11"/><line x1="7" y1="15" x2="15" y2="15"/>'); }
  function dividerIcon() { return svg('<line x1="3" y1="12" x2="21" y2="12"/>'); }
}
