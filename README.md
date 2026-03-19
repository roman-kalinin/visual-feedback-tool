# Visual Feedback Tool

Annotate any localhost page directly in the browser and send the result to Claude Code — no screenshots, no manual descriptions.

## How it works

```
Chrome Extension  ──POST /submit──►  MCP Server (port 3333)
                                            │
Claude Code  ◄── get_latest_annotation ────┘
```

1. Activate the overlay on a localhost page
2. Draw freehand markup and pin comments on top of the live UI
3. Click **Add task** — the screenshot + annotations go to the local MCP buffer
4. Claude picks it up — either manually on request, or automatically in a live loop

---

## Setup (one-time)

### 1. Register the MCP server with Claude Code

Run this once in your terminal (update the path to match your machine):

```bash
claude mcp add visual-feedback-tool node "/absolute/path/to/visual-feedback-tool/mcp-server/server.cjs"
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

The server starts automatically when Claude Code launches (it's a registered MCP server). You can also run it manually:

```bash
node mcp-server/server.cjs
```

---

## Using the tool

1. Open your app at `http://localhost:xxxx`
2. Click the **Visual Feedback Tool** extension icon — a toolbar appears at the bottom of the page
3. Annotate the page (see tools below)
4. Click **Add task**
5. Claude receives the annotation — see [Communicating with Claude](#communicating-with-claude) below

### Toolbar

| Button | Shortcut | What it does |
|---|---|---|
| **Draw** | `X` | Freehand red markup — arrows, circles, highlights. Visible in screenshot only. |
| **Comment** | `C` | Click to pin a numbered comment on an element. Drag to select an area — captures all elements inside it. |
| **Clear** | — | Remove all annotations from the canvas. |
| **Settings** | — | Screenshot quality, comment detail level, screenshot mode. |
| **?** | — | In-tool cheatsheet. |
| **Review** | — | Inspect, preview, or delete buffered submissions. Click the `</>` icon on a card to see the exact payload Claude receives. |
| **Add task** | — | Capture screenshot + annotations and push to the MCP buffer. |

### Keyboard shortcuts

| Key | Action |
|---|---|
| `X` | Toggle Draw tool |
| `C` | Toggle Comment tool |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Esc` | Close open panel · press twice to close overlay |

---

## Communicating with Claude

There are two ways Claude can receive your annotations.

### 1. Manual — ask on demand

After clicking **Add task**, tell Claude:

> *"check my annotation"* or *"fix the issues I marked"*

Claude calls `get_latest_annotation`, reads all unread submissions from the buffer, and acts on them.

### 2. Automatic — live loop

Tell Claude once to stay in a live loop:

> *"wait for my annotations and fix them as I send them"*

Claude calls `wait_for_annotation`, which **blocks and waits** up to 120 seconds. The moment you click **Add task**, Claude wakes up, processes the submission, makes the code changes, then automatically calls `wait_for_annotation` again — ready for your next round without you having to say anything.

To stop the loop, just tell Claude: *"stop waiting"*.

---

## What Claude receives

For each submission:

- **Page** — URL, title, viewport size
- **Freehand draws** — visible only in the screenshot (noted in the text payload)
- **Comments** — text, coordinates, the element under the pin (tag, id, classes, text, bounding box), and for area comments: every element inside the dragged region
- **Screenshot** — JPEG of the annotated page (quality and inclusion controlled by Settings)
- **History** — summary of prior submissions on the same URL for iterative context

Use **Review** → `</>` on any card to inspect the exact text payload Claude receives.

---

## Settings

| Setting | Options | Default |
|---|---|---|
| **Screenshot Quality** | Low (25%) · Med (50%) · High (100%) | Med |
| **Comment Detail** | Minimal (tag+id) · Standard (full element info) · Verbose (+computed CSS) | Standard |
| **Screenshot Include** | Always · Smart (only when draws present) · Never | Smart |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| MCP dot is red | Server isn't running — `node mcp-server/server.cjs`. Click the dot to see the full error. |
| "Send failed" toast | Server not running — see above |
| Overlay won't inject | Page must be on `http://localhost` or `http://127.0.0.1` |
| `get_latest_annotation` says "No annotations yet" | Server was restarted (buffer cleared) — click Add task again |
| Canvas covers page interactions | Click the active tool button again to deactivate it |
| Payload preview shows "Server returned 404" | Restart the MCP server to pick up the latest version |
