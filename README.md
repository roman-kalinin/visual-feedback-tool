# Visual Feedback Tool

Annotate any localhost page directly in the browser and send the result to Claude Code — no screenshots, no manual descriptions.

## How it works

```
Chrome Extension  ──POST /submit──►  MCP Server (port 3333)
                                            │
Claude Code  ◄── get_latest_annotation ────┘
```

1. Activate the overlay on a localhost page
2. Draw freehand markup, pin comments, edit elements, or freeze hover states
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
4. Click **Add task** (or press `Ctrl+Enter` / `Cmd+Enter`)
5. Claude receives the annotation — see [Communicating with Claude](#communicating-with-claude) below

### Toolbar

| Button | Shortcut | What it does |
|---|---|---|
| **Edit** | `E` | Select any element to inspect and edit its CSS properties. Opens a draggable side panel with position, size, spacing, colors, typography, and layout controls. |
| **Draw** | `X` | Freehand red markup — arrows, circles, highlights. Visible in screenshot only. |
| **Comment** | `C` | Click to pin a numbered comment on an element. Drag to select an area — captures all elements inside it. Supports pasting reference images. |
| **Clear** | — | Remove all annotations from the canvas. |
| **Freeze** | `F` | Freeze the current page state (hover effects, animations, transitions). Captures a screenshot overlay so you can annotate hover states. Press `Esc` to unfreeze. |
| **Settings** | — | Screenshot quality, comment detail level, screenshot mode. |
| **?** | — | In-tool cheatsheet. |
| **Review** | — | Inspect, preview, or delete buffered submissions. Click the `</>` icon on a card to see the exact payload Claude receives. |
| **Add task** | `Ctrl+Enter` | Capture screenshot + annotations and push to the MCP buffer. |

### Keyboard shortcuts

| Key | Action |
|---|---|
| `E` | Toggle Edit tool |
| `X` | Toggle Draw tool |
| `C` | Toggle Comment tool |
| `F` | Toggle Freeze |
| `Ctrl+Enter` / `Cmd+Enter` | Add task |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `↑↓←→` (in Edit mode) | Navigate element tree |
| `Esc` | Deselect element → deactivate tool → close panel → close overlay |

### Edit mode

Press `E` or click the edit button to enter element editing mode. A hint banner appears: "Select an element to edit properties or comment."

Click any element to open the **inspector panel** — a draggable side panel showing:
- **Position** — X, Y coordinates
- **Size** — Width, Height (editable)
- **Spacing** — Padding and Margin (all four sides)
- **Appearance** — Opacity, Visibility
- **Fill** — Background color picker
- **Text Color** — Color picker
- **Typography** — Font, size, weight, line height, letter spacing, text align
- **Layout** — Flex properties (when applicable)
- **Additional comment** — free text field included in the payload

Changes are tracked and sent as structured edit annotations when you click **Add task**. The panel is draggable — grab the handle at the top to reposition it.

### Freeze mode

Sometimes you need to annotate a hover state, tooltip, or animation frame. Press `F` to freeze:

1. Hover over the element to trigger the desired state
2. Press `F` — the page is frozen as a screenshot overlay
3. Annotate freely (draw, comment, edit) on top of the frozen state
4. Press `Esc` to unfreeze and return to the live page

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
- **Comments** — text, coordinates, the element under the pin (tag, id, classes, text, bounding box), and for area comments: every element inside the dragged region. May include pasted reference images.
- **Element edits** — CSS property changes with selectors, old/new values, element context, and optional comment
- **Screenshot** — JPEG of the annotated page (quality and inclusion controlled by Settings)
- **History** — summary of prior submissions on the same URL for iterative context

Use **Review** → `</>` on any card to inspect the exact text payload Claude receives.

---

## Design System

The tool includes a built-in design system viewer served at `localhost:3333/design-system`.

- Browse components with live previews in a dark-themed viewer
- Extract components from any page using Edit mode → "Save to Library"
- Claude can query the design system via the `get_design_system` MCP tool before building UI
- Update components or tokens via the `update_design_system` MCP tool

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
| Canvas covers page interactions | Press `Esc` to deactivate the current tool, or click the active tool button again |
| Payload preview shows "Server returned 404" | Restart the MCP server to pick up the latest version |
| Freeze shows error toast | Ensure the page tab is focused when pressing F |
| Inspector panel covers content | Drag the panel by its handle bar at the top |
