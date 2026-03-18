# Visual Feedback Tool

Annotate any localhost page directly in the browser and send the result to Claude Code — no screenshots, no manual descriptions.

## How it works

```
Chrome Extension  ──POST /submit──►  MCP Server (port 3333)
                                            │
Claude Code  ◄── get_latest_annotation ────┘
```

1. You activate the overlay on a localhost page
2. Draw, highlight, and pin comments on top of the live UI
3. Click **Send →** — the annotated screenshot goes to the local server
4. Ask Claude: *"check my latest annotation and fix the issues"*

---

## Setup (one-time)

### 1. Register the MCP server with Claude Code

Run this once in your terminal:

```bash
claude mcp add visual-feedback-tool node "C:/Users/joket/Desktop/Design/Dragonpass Client Portal/visual-feedback-tool/mcp-server/server.cjs"
```

Verify it registered:
```bash
claude mcp list
```

### 2. Install the Chrome extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `visual-feedback-tool/extension/` folder
5. The extension icon appears in your toolbar

### 3. Start the MCP server

The server starts automatically when Claude Code launches (it's a registered MCP server). But you can also run it manually to test:

```bash
node "visual-feedback-tool/mcp-server/server.cjs"
```

---

## Using the tool

1. Open your app at `localhost:5173` (or any localhost port)
2. Click the **Visual Feedback Tool** extension icon
3. Click **Activate Overlay** — a toolbar appears at the bottom of the page
4. Annotate:
   - **✏️ Draw** — freehand red markup
   - **▭ Rect** — amber rectangle highlight
   - **📌 Pin** — click anywhere, type a comment, press Enter
   - **🗑 Clear** — remove all annotations
5. Click **Send →**
6. In Claude Code, say: *"use get_latest_annotation to see what I sent"* or just *"check my annotation"*

---

## Annotation types Claude receives

| Type | What Claude sees |
|---|---|
| Freehand | Path point count + start coordinates |
| Rectangle | x, y, width, height |
| Pin | Exact coordinates + your text comment |

Plus the full annotated screenshot as an image.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Popup shows "MCP server offline" | Run `node mcp-server/server.js` in a terminal |
| "Send failed" toast | Server not running — see above |
| Overlay won't inject | Page must be on `http://localhost` or `http://127.0.0.1` |
| `get_latest_annotation` says "No annotation submitted yet" | Server was restarted — click Send again |
| Canvas covers page interactions | Click the active tool button again to deactivate it |
