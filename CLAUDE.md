# Claude Instructions

Be concise. Spare tokens where possible — short responses, no unnecessary explanation.

## Git rules

- **Never `git push` unless the user explicitly asks.** Commit locally only.

---

## Project: visual-feedback-tool

Chrome extension + MCP server for iterative design feedback. User annotates a localhost page, sends to Claude via MCP, Claude makes code changes, repeat.

## Key files

- `extension/content.js` — overlay, toolbar, canvas, all annotation logic
- `extension/sketch.js` — self-contained sketch/wireframe editor (opened from comment popup)
- `extension/overlay.css` — all toolbar/panel styles (incl. `.vft-sk-*` sketch editor styles)
- `extension/background.js` — screenshot capture, posts to server
- `mcp-server/server.cjs` — HTTP + MCP stdio server on port 3333
- `mcp-server/transcribe.py` — local speech-to-text via faster-whisper (called by `/transcribe`)
- `design-system/manifest.json` — component registry
- `design-system/tokens.css` — CSS custom properties (colors, spacing, radii, fonts)
- `design-system/shell.html` — component library viewer page
- `design-system/shell.css` — viewer styles
- `design-system/components/` — individual component HTML files

## Conventions

- Dark mode: `#1e1e1e` bg, `rgba(255,255,255,0.14)` borders, `#8b9eb0` muted, `#0C8CE9` blue, `#6366f1` indigo (comments)
- Settings persist via `chrome.storage.local` (`window.__vftSettings`)
- No remote servers, no auth, localhost only

## Current toolbar order (left to right)

`MCP | edit · draw · comment · clear | freeze | settings · help | review(+badge) · Send | ×`

- MCP cluster: dot + "MCP" label, colored green/red, clickable when offline to show error
- Review button has red badge with unread count
- Edit = E, Draw = X, Comment = C, Freeze = F shortcuts
- Edit is a regular toggle tool (no toolbar swap) — opens side panel on element click
- Ctrl+Z/Y = undo/redo, Ctrl+Enter = Add task
- Esc chain: deselect element → deactivate tool → tooltip → close overlay

## Annotation types

- `draw` — freehand, red, only visible in screenshot (not in text payload)
- `comment` — numbered circle marker, hover to reveal text bubble; supports point or area drag; `images[]` holds pasted refs + sketches (PNG data URLs); popup has Voice (mic) + Sketch buttons
- `extract-component` — "Save to Library" from edit mode; captures outerHTML + key styles

## Sketch editor (`extension/sketch.js`)

- Exposes `window.__vftOpenSketch(onSave, bgDataUrl)`; injected before `content.js` in `background.js`
- `onSave` receives a PNG data URL (or `null`); a legacy array of URLs is also accepted by the caller. Result is pushed into the comment popup's `_images[]`
- Self-contained, zero deps, CSP-safe. Shapes are a flat array in **world coords**; a `camera {x,y,scale}` + `screenToWorld`/`worldToScreen` power the infinite canvas. `pt()` and `redraw()` are the only two coordinate seams
- Shapes carry `strokeColor` + `fillColor` (either can be `'none'`); wireframe stencils are pure `drawShape(g, s)` renderers
- Tools: select/draw/line/arrow/rect/ellipse/text/eraser + wireframe components (image/button/input/dropdown/search/checkbox/radio/toggle/tabs/card/avatar/heading/divider)
- Interactions: pan (Space/middle-drag), wheel zoom, 8-handle resize (single/group), marquee + shift multi-select, Alt-drag duplicate
- Recents persist via `chrome.storage.local` (`vftSketchRecents`); seeded with `DEFAULT_RECENTS`
- Export: renders all shapes to a white canvas cropped to content bbox, `EXPORT_SCALE=2`, single PNG

## MCP server notes

- `/submit` POST — receives annotations + screenshot + settings
- `/health` GET — returns bufferCount
- `/transcribe` POST — voice dictation: raw audio body → temp file → `mcp-server/transcribe.py` (faster-whisper) → `{ text }`. faster-whisper decodes webm/opus itself (PyAV) and auto-downloads+caches the model — no ffmpeg step, no model files, no compiling. Env: `VFT_PYTHON`, `VFT_WHISPER_MODEL` (size, default base), `VFT_WHISPER_LANG` (ISO pin)
- Python resolver (`resolvePython`) prefers an interpreter that can actually `import faster_whisper` — on Windows `python3` is often the Store shim, so "it launches" isn't enough; `python` is tried first
- `/transcribe/health` GET — `{ ok, engine, python, model, missing[], reason, setupPrompt }`. Not ready → `setupPrompt` is a ready-to-paste Claude Code prompt (`WHISPER_SETUP_PROMPT`, now just `pip install faster-whisper`); extension checks this before recording
- Voice recording: content.js `wireMic(popup)` uses MediaRecorder (getUserMedia works in content script on localhost secure origin), POSTs the blob; transcript inserted at textarea caret. Not-set-up → sticky guidance toast with "Copy prompt for Claude". Icon-only button; state via classes (pulse/dim) + tooltip. All local, no remote service
- `showToast(msg, isError, opts)` — `opts.copyText` makes Copy yield a different string (the Claude prompt); `opts.copyLabel`, `opts.sticky` (× to close)
- `/submissions` GET/DELETE — list/clear buffer
- Screenshot mode: always / smart (default, only if draws present) / never
- Detail level: minimal / standard / verbose (computed styles)
- Tool description instructs Claude to always examine the screenshot when attached

## Multi-session (shared singleton)

Each Claude Code session spawns its own server process, but only one can own port 3333.
- **Primary** = first to bind 3333; owns the shared `submissions` buffer + HTTP. Handles MCP tool calls in-process.
- **Secondary** = later sessions; `EADDRINUSE` handler flips `isPrimary=false` (no crash). Their stdio `tools/call`s proxy over HTTP to the primary's internal `POST /mcp` endpoint, so all sessions share ONE buffer. Session-local methods (initialize/tools/list/notifications) still answered locally.
- `electionReady` promise gates the stdin handler until the primary/secondary role is known (avoids a startup race).
- `/submit` wakes only ONE `wait_for_annotation` waiter (first-come), so a submission goes to a single session, not fanned out.
- Responses matched by JSON-RPC `id`, so async reordering is safe.

## Design System

- Served at `localhost:3333/design-system` — dark-themed component library viewer
- `GET /design-system` — shell page with sidebar nav + component renderer
- `GET /design-system/manifest` — returns manifest.json
- `GET /design-system/component/:file` — returns raw component HTML
- `GET /design-system/tokens.css` / `shell.css` — static assets
- MCP tool `get_design_system` — returns manifest + tokens; call BEFORE building any UI
- MCP tool `update_design_system` — add/update components or tokens
- Components use `.ds-specimen` wrappers with `data-variant`/`data-state` attrs
- Forced state classes: `.ds-force-hover`, `.ds-force-active`, `.ds-force-focus`, `.ds-force-disabled`
- Extension edit mode has "Save to Library" button to extract elements as components
