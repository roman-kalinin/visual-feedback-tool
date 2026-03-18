# Claude Instructions

Be concise. Spare tokens where possible — short responses, no unnecessary explanation.

---

## Project: visual-feedback-tool

Chrome extension + MCP server for iterative design feedback. User annotates a localhost page, sends to Claude via MCP, Claude makes code changes, repeat.

## Key files

- `extension/content.js` — overlay, toolbar, canvas, all annotation logic
- `extension/overlay.css` — all toolbar/panel styles
- `extension/background.js` — screenshot capture, posts to server
- `mcp-server/server.cjs` — HTTP + MCP stdio server on port 3333

## Conventions

- Dark mode: `#1e1e1e` bg, `rgba(255,255,255,0.14)` borders, `#8b9eb0` muted, `#0C8CE9` blue, `#6366f1` indigo (comments)
- Settings persist via `chrome.storage.local` (`window.__vftSettings`)
- No remote servers, no auth, localhost only

## Current toolbar order (left to right)

`MCP | draw · comment · clear | settings | review(+badge) · Send | ×`

- MCP cluster: dot + "MCP" label, colored green/red, clickable when offline to show error
- Review button has red badge with unread count
- Draw = X shortcut, Comment = C shortcut
- Ctrl+Z/Y = undo/redo

## Annotation types

- `draw` — freehand, red, only visible in screenshot (not in text payload)
- `comment` — numbered circle marker, hover to reveal text bubble; supports point or area drag

## MCP server notes

- `/submit` POST — receives annotations + screenshot + settings
- `/health` GET — returns bufferCount
- `/submissions` GET/DELETE — list/clear buffer
- Screenshot mode: always / smart (default, only if draws present) / never
- Detail level: minimal / standard / verbose (computed styles)
- Tool description instructs Claude to always examine the screenshot when attached
