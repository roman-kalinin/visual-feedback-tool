'use strict';

const http = require('http');
const readline = require('readline');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Constants ─────────────────────────────────────────────────────────────────
const PORT             = 3333;
const MAX_HISTORY      = 5;   // prior submissions shown in history summary
const MAX_HIST_COMMENTS = 4;  // max comment texts per history entry
const TEXT_TRUNCATE    = 60;  // chars before truncation in text fields
const MAX_CLASSES      = 3;   // max CSS classes shown in element desc
const DEFAULT_TIMEOUT  = 120; // wait_for_annotation default/max seconds

// ── Whisper (voice → text) via faster-whisper ────────────────────────────────
// Transcription runs entirely locally through a small Python helper that uses
// faster-whisper. No compiling, no binaries to build, no model files to manage:
// pip install faster-whisper, and the model auto-downloads + caches on first
// use. faster-whisper decodes the browser's audio itself (PyAV/ffmpeg), so no
// separate conversion step. Configurable via env:
//   VFT_PYTHON        — python interpreter to use (default: python3/python)
//   VFT_WHISPER_MODEL — model size: tiny/base/small/medium/large (default base)
//   VFT_WHISPER_LANG  — ISO language pin (e.g. en, ru, uk). Empty = auto-detect
const MAX_AUDIO_BYTES  = 25 * 1024 * 1024; // 25MB cap on uploaded audio
const TRANSCRIBE_PY    = path.join(__dirname, 'transcribe.py');
const WHISPER_MODEL    = process.env.VFT_WHISPER_MODEL || 'base';
const WHISPER_LANG     = process.env.VFT_WHISPER_LANG  || '';

// Resolve the Python interpreter. Prefer one that can actually import
// faster-whisper — on Windows, `python3` is often the Store shim (no real
// Python), so "it launches" is not enough. Fall back to whichever interpreter
// at least runs, so the health check can still report a useful reason.
function pyCanImport(cand) {
  try {
    const r = spawnSync(cand, ['-c', 'import faster_whisper'], { stdio: 'ignore', timeout: 15000 });
    return !r.error && r.status === 0;
  } catch { return false; }
}
function pyRuns(cand) {
  try {
    const r = spawnSync(cand, ['-c', 'import sys'], { stdio: 'ignore', timeout: 5000 });
    return !r.error && r.status === 0; // real interpreter (the Store shim errors here)
  } catch { return false; }
}
function resolvePython() {
  if (process.env.VFT_PYTHON) return process.env.VFT_PYTHON;
  const cands = ['python', 'python3', 'py'];
  return cands.find(pyCanImport)   // best: has faster-whisper
      || cands.find(pyRuns)        // next: a real interpreter (pkg just missing)
      || 'python';                 // last resort for the error message
}
const PYTHON = resolvePython();

// A single copy-paste prompt the user drops into Claude Code to get set up.
// Keeps junior designers out of the terminal entirely. (Just a pip install now.)
const WHISPER_SETUP_PROMPT =
  'Set up local voice dictation for the visual-feedback-tool. Make sure Python 3 ' +
  'is installed, then install the faster-whisper package (pip install faster-whisper). ' +
  'That is all it needs — the speech model downloads automatically on first use and ' +
  'runs fully locally. Then restart the visual-feedback-tool MCP server and verify by ' +
  'curling http://localhost:3333/transcribe/health and confirming it returns ok:true.';

// ── Shared state ──────────────────────────────────────────────────────────────
const submissions = [];
const waiters = []; // resolve fns waiting for a new submission

// ── HTTP Server ───────────────────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/submit') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const submission = {
          screenshot: payload.screenshot,
          annotations: payload.annotations || [],
          meta: payload.meta || {},
          settings: payload.settings || {},
          receivedAt: new Date().toISOString(),
          read: false
        };
        submissions.push(submission);
        // Wake ONE long-polling waiter (first-come). With multiple Claude Code
        // sessions each may have a pending wait_for_annotation; a submission
        // should be delivered to a single session, not fanned out to all. The
        // waiter marks it read; remaining waiters keep waiting for the next one.
        if (waiters.length) waiters.shift()(submission);
        const count = submission.annotations.length;
        process.stderr.write(`[vft] Received: ${count} annotation(s) from ${submission.meta.url} (buffer: ${submissions.length})\n`);
        submission.annotations.forEach((a, i) => process.stderr.write(`[vft]   [${i}] type=${a.type} changes=${a.changes?.length || 0} comment=${a.comment || '(none)'}\n`));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, annotationCount: count, bufferCount: submissions.length }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    const unread = submissions.filter(s => !s.read).length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bufferCount: submissions.length, unreadCount: unread }));
    return;
  }

  if (req.method === 'GET' && req.url === '/submissions') {
    const list = submissions.map((s, i) => ({
      index: i,
      title: s.meta.title || '(untitled)',
      url: s.meta.url || '',
      receivedAt: s.receivedAt,
      annotationCount: s.annotations.length,
      read: s.read
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, count: submissions.length, submissions: list }));
    return;
  }

  const submissionMatch = req.url.match(/^\/submissions\/(\d+)$/);
  if (submissionMatch) {
    const idx = parseInt(submissionMatch[1], 10);
    if (idx < 0 || idx >= submissions.length) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }
    if (req.method === 'GET') {
      const s = submissions[idx];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        screenshot: s.screenshot,
        annotations: s.annotations,
        meta: s.meta,
        settings: s.settings || {},
        receivedAt: s.receivedAt,
        read: s.read
      }));
      return;
    }
    if (req.method === 'DELETE') {
      submissions.splice(idx, 1);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, bufferCount: submissions.length }));
      return;
    }
    if (req.method === 'PATCH') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const patch = JSON.parse(body);
          if (typeof patch.read === 'boolean') submissions[idx].read = patch.read;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, read: submissions[idx].read }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
        }
      });
      return;
    }
  }

  const previewMatch = req.url.match(/^\/submissions\/(\d+)\/preview$/);
  if (previewMatch && req.method === 'GET') {
    const idx = parseInt(previewMatch[1], 10);
    if (idx < 0 || idx >= submissions.length) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }
    const s = submissions[idx];
    const includeScreenshot = shouldIncludeScreenshot(s);
    const text = buildAnnotationText(s, includeScreenshot);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, text }));
    return;
  }

  if (req.method === 'DELETE' && req.url === '/submissions') {
    submissions.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bufferCount: 0 }));
    return;
  }

  if (req.method === 'GET' && req.url === '/transcribe/health') {
    const status = whisperStatus();
    res.writeHead(status.ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }

  if (req.method === 'POST' && req.url === '/transcribe') {
    handleTranscribe(req, res);
    return;
  }

  // Internal RPC bridge: secondary sessions forward their MCP tool calls here so
  // they read/write the primary's shared annotation buffer. Body is a JSON-RPC
  // request; response is the JSON-RPC result (same shape stdio would emit).
  if (req.method === 'POST' && req.url === '/mcp') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let rpc;
      try { rpc = JSON.parse(body); }
      catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
        return;
      }
      try {
        const response = await dispatchRpc(rpc);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response ?? { jsonrpc: '2.0', id: rpc.id ?? null, result: {} }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32603, message: e.message } }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── Whisper transcription ───────────────────────────────────────────────────────

// Cache the readiness probe: python present? faster-whisper importable?
let _statusCache = null;
function probeWhisper() {
  // One quick synchronous check: can the chosen Python import faster-whisper?
  // (Also implicitly confirms Python exists.) Result cached for the process.
  let pythonOk = false, pkgOk = false;
  try {
    const r = spawnSync(PYTHON, ['-c', 'import faster_whisper'], { stdio: 'ignore', timeout: 15000 });
    pythonOk = !r.error;            // .error (ENOENT) => interpreter missing
    pkgOk = pythonOk && r.status === 0; // non-zero => import failed (not installed)
  } catch { /* leave both false */ }
  return { pythonOk, pkgOk };
}
function whisperStatus() {
  if (_statusCache === null) _statusCache = probeWhisper();
  const { pythonOk, pkgOk } = _statusCache;
  const ok = pythonOk && pkgOk;

  const missing = [];
  if (!pythonOk)      missing.push('Python 3');
  else if (!pkgOk)    missing.push('the faster-whisper package');
  const reason = ok ? undefined
    : `Voice needs ${missing.join(' and ')} installed locally. `
      + `Not set up yet — copy the prompt below into Claude Code and it'll install everything for you.`;

  return {
    ok,
    engine: 'faster-whisper',
    python: PYTHON,
    model: WHISPER_MODEL,
    missing,
    reason,
    // Ready-to-paste Claude Code prompt so the user never touches the terminal.
    setupPrompt: ok ? undefined : WHISPER_SETUP_PROMPT
  };
}

function handleTranscribe(req, res) {
  const status = whisperStatus();
  if (!status.ok) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: status.reason }));
    return;
  }

  const chunks = [];
  let size = 0, aborted = false;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_AUDIO_BYTES) {
      aborted = true;
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Audio too large (max 25MB).' }));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (aborted) return;
    const audio = Buffer.concat(chunks);
    if (!audio.length) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Empty audio.' }));
      return;
    }
    transcribeBuffer(audio)
      .then(text => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, text }));
      })
      .catch(err => {
        process.stderr.write(`[vft] transcribe error: ${err.message}\n`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      });
  });
}

// Write the uploaded audio to a temp file and hand it to transcribe.py.
// faster-whisper decodes it directly (PyAV/ffmpeg) — no manual conversion.
function transcribeBuffer(audio) {
  const stamp = process.pid + '-' + submissions.length + '-' + audio.length;
  // Keep the original container extension hint; faster-whisper sniffs the format.
  const audioPath = path.join(os.tmpdir(), `vft-audio-${stamp}.webm`);

  return new Promise((resolve, reject) => {
    fs.writeFile(audioPath, audio, err => {
      if (err) return reject(new Error(`Could not stage audio: ${err.message}`));
      runWhisper(audioPath)
        .then(resolve, reject)
        .finally(() => fs.unlink(audioPath, () => {}));
    });
  });
}

function runWhisper(audioPath) {
  return new Promise((resolve, reject) => {
    const args = [TRANSCRIBE_PY, audioPath, WHISPER_MODEL];
    if (WHISPER_LANG) args.push(WHISPER_LANG);
    const wh = spawn(PYTHON, args, {});
    let out = '', err = '';
    wh.stdout.on('data', d => { out += d; });
    wh.stderr.on('data', d => { err += d; });
    wh.on('error', e => reject(new Error(`transcriber failed to start: ${e.message}`)));
    wh.on('close', code => {
      if (code !== 0) {
        // 3 = missing dependency, 4 = transcription error (see transcribe.py)
        return reject(new Error(err.trim().slice(0, 300) || `transcriber exited ${code}`));
      }
      const text = out.replace(/\s+/g, ' ').trim();
      if (!text) return reject(new Error('No speech detected.'));
      resolve(text);
    });
  });
}

// ── Primary / secondary election ────────────────────────────────────────────
// Each Claude Code session spawns its own copy of this process, but only ONE can
// own port 3333 (the shared HTTP buffer the extension posts to). The first to
// bind is the PRIMARY. Later sessions become SECONDARY: they don't crash, and
// their MCP tool calls proxy over HTTP to the primary so every session shares
// one annotation buffer.
let isPrimary = true;
// Resolves once we know whether we bound the port (primary) or not (secondary).
// The stdin handler awaits this so no tool call is routed before the role is set.
let electionResolve;
const electionReady = new Promise(r => { electionResolve = r; });

httpServer.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    isPrimary = false;
    process.stderr.write(`[vft] Port ${PORT} already in use — running as SECONDARY (proxying MCP calls to the primary).\n`);
    electionResolve();
  } else {
    process.stderr.write(`[vft] HTTP server error: ${err.message}\n`);
    process.exit(1);
  }
});

httpServer.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`[vft] HTTP server listening on http://127.0.0.1:${PORT} (PRIMARY)\n`);
  electionResolve();
});

// ── MCP stdio ─────────────────────────────────────────────────────────────────
const TOOL_DEF = {
  name: 'get_latest_annotation',
  description: [
    'Returns unread visual annotations from the browser extension buffer.',
    'Each submission includes structured annotation data: text comments with element metadata, and optionally freehand drawings.',
    'IMPORTANT: When a screenshot is attached, you MUST examine it carefully before acting — it may contain freehand drawings or arrows that are the primary signal of intent and cannot be conveyed in text alone.',
    'Freehand draws are not described in text; the screenshot is the only record of them. Never skip or ignore the screenshot.',
    'Comment detail level can be minimal (text + tag/id), standard (full element info), or verbose (includes computed CSS styles).',
    'Includes a history summary of prior feedback on the same page URL for iterative context.',
    'Submissions are marked as read after retrieval. Call this when the user says they annotated the page or sent feedback.',
    'After processing, always suggest calling wait_for_annotation to stay ready for the next batch unless the user says to stop.'
  ].join(' '),
  inputSchema: { type: 'object', properties: {}, required: [] }
};

const WAIT_TOOL_DEF = {
  name: 'wait_for_annotation',
  description: [
    'Blocks until the user sends a new annotation from the browser extension, then returns it immediately.',
    'Use this when you want to automatically pick up the next submission without the user having to tell you.',
    'Times out after 120 seconds if nothing arrives. On timeout, ask the user to send their annotation.',
    'IMPORTANT: When a screenshot is attached, examine it carefully — freehand drawings are only visible there.',
    'After processing the returned annotations, always call wait_for_annotation again to stay ready for the next batch unless the user explicitly says to stop.'
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      timeout_seconds: { type: 'number', description: 'How long to wait in seconds (default: 120, max: 120)' }
    },
    required: []
  }
};

function hasVisualAnnotations(annotations) {
  return annotations.some(a => a.type === 'draw');
}

function shouldIncludeScreenshot(submission) {
  const mode = submission.settings?.screenshotMode || 'always';
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return hasVisualAnnotations(submission.annotations);
}

function formatElementDesc(el, detail) {
  if (detail === 'minimal') {
    return [el.tag, el.id ? `#${el.id}` : null].filter(Boolean).join(' ');
  }
  return [
    el.tag,
    el.id ? `#${el.id}` : null,
    el.classes && el.classes.length ? `.${el.classes.slice(0, MAX_CLASSES).join('.')}` : null,
    el.text ? `text:"${el.text.slice(0, TEXT_TRUNCATE)}"` : null
  ].filter(Boolean).join(' ');
}

function buildAnnotationText(submission, includeScreenshot) {
  const { annotations, meta, receivedAt, settings } = submission;
  const detail = settings?.detailLevel || 'standard';
  const drawCount = annotations.filter(a => a.type === 'draw').length;

  const annLines = annotations.map((ann, i) => {
    if (ann.type === 'draw') return null;
    if (ann.type === 'edit') {
      const lines = [`[${i + 1}] Element edits (${ann.changes.length}):`];
      ann.changes.forEach(c => lines.push(`       ${c.selector}: ${c.property} ${c.oldValue} → ${c.newValue}`));
      if (ann.elementContext) {
        const ctx = ann.elementContext;
        lines.push(`       Element: <${ctx.tag}>${ctx.text ? ` "${ctx.text}"` : ''}${ctx.classes && ctx.classes.length ? ` [${ctx.classes.slice(0, 3).join(' ')}]` : ''}`);
      }
      if (ann.comment) {
        lines.push(`       Comment: "${ann.comment}"`);
      }
      if (ann.askPropagate) {
        lines.push(`       PROPAGATION: After applying these changes, ask the user: "Do you want to propagate this change to all similar ${ann.elementContext?.tag || 'elements'} on the page?" If yes, find and update all elements that share the same pattern/role.`);
      }
      return lines.join('\n');
    }
    if (ann.type === 'comment') {
      const lines = [];
      lines.push(`[${i + 1}] Comment #${ann.index} — "${ann.text}"`);
      if (detail !== 'minimal') {
        if (ann.area) {
          lines.push(`       Area: x:${Math.round(ann.area.x)} y:${Math.round(ann.area.y)} w:${Math.round(ann.area.width)} h:${Math.round(ann.area.height)}`);
        } else {
          lines.push(`       Point: (${Math.round(ann.x)}, ${Math.round(ann.y)})`);
        }
      }
      if (ann.element) {
        const el = ann.element;
        lines.push(`       Element: ${formatElementDesc(el, detail)}`);
        if (detail !== 'minimal' && el.rect) {
          lines.push(`       Element bounds: x:${el.rect.x} y:${el.rect.y} w:${el.rect.w} h:${el.rect.h}`);
        }
        if (detail === 'verbose' && el.styles) {
          const styleEntries = Object.entries(el.styles);
          if (styleEntries.length > 0) {
            lines.push(`       Computed styles:`);
            styleEntries.forEach(([prop, val]) => lines.push(`         ${prop}: ${val}`));
          }
        }
      }
      if (detail !== 'minimal' && ann.elements && ann.elements.length) {
        lines.push(`       Elements in area (${ann.elements.length}):`);
        ann.elements.forEach(el => {
          lines.push(`         - ${formatElementDesc(el, detail)}`);
          if (detail === 'verbose' && el.styles) {
            Object.entries(el.styles).forEach(([prop, val]) => lines.push(`             ${prop}: ${val}`));
          }
        });
      }
      if (ann.images && ann.images.length) {
        lines.push(`       Reference images: ${ann.images.length} attached (see image block${ann.images.length > 1 ? 's' : ''} below)`);
      }
      return lines.join('\n');
    }
    return `[${i + 1}] Unknown type: ${ann.type}`;
  });

  const drawNote = drawCount > 0
    ? `NOTE: This submission contains ${drawCount} freehand drawing(s) only visible in the screenshot — examine it carefully.`
    : null;

  const footer = includeScreenshot
    ? 'The annotated screenshot is attached below.'
    : 'No screenshot attached (comments-only — element metadata above is sufficient).';

  return [
    `Page: ${meta.title || '(untitled)'} — ${meta.url}`,
    `Viewport: ${meta.viewportWidth} × ${meta.viewportHeight}`,
    meta.activeView ? `Active view: ${meta.activeView}` : null,
    `Received: ${receivedAt}`,
    '',
    `Annotations (${annotations.length}):`,
    ...(annLines.some(l => l !== null) ? annLines : ['  (none)']),
    '',
    drawNote,
    footer
  ].filter(line => line !== null).join('\n');
}

function buildHistorySummary(currentSubmission) {
  const currentUrl = currentSubmission.meta?.url;
  if (!currentUrl) return null;
  const priorSubmissions = submissions.filter(s =>
    s !== currentSubmission && s.read && s.meta?.url === currentUrl
  );
  if (priorSubmissions.length === 0) return null;
  const recent = priorSubmissions.slice(-MAX_HISTORY);
  const lines = ['--- Previous feedback on this page ---'];
  recent.forEach(s => {
    const commentTexts = s.annotations
      .filter(a => a.type === 'comment' && a.text)
      .map(a => `"${a.text.slice(0, TEXT_TRUNCATE)}"`)
      .slice(0, MAX_HIST_COMMENTS);
    lines.push(`Submission from ${s.receivedAt || 'unknown'}: ${s.annotations.length} annotation(s)`);
    if (commentTexts.length > 0) lines.push(`  Comments: ${commentTexts.join(', ')}`);
  });
  return lines.join('\n');
}

const TRAIL = '\n---\nWhen you are done clarifying and acting on the above, call wait_for_annotation again to stay ready for the next batch (unless the user says to stop).';

function collectReferenceImages(submission) {
  const images = [];
  for (const ann of submission.annotations) {
    if (ann.type === 'comment' && ann.images && ann.images.length) {
      ann.images.forEach((dataUrl, i) => {
        const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        images.push({ type: 'image', data: base64, mimeType, _label: `Comment #${ann.index} ref ${i + 1}` });
      });
    }
  }
  return images;
}

function buildAnnotationResponse(submission, id) {
  const includeScreenshot = shouldIncludeScreenshot(submission);
  const history = buildHistorySummary(submission);
  let text = buildAnnotationText(submission, includeScreenshot);
  if (history) text += '\n\n' + history;
  const content = [{ type: 'text', text }];
  if (includeScreenshot && submission.screenshot) {
    content.push({ type: 'image', data: submission.screenshot, mimeType: 'image/jpeg' });
  }
  // Append reference images from comments
  const refImages = collectReferenceImages(submission);
  if (refImages.length) {
    content.push({ type: 'text', text: `Reference images (${refImages.length}):` });
    refImages.forEach(img => {
      content.push({ type: 'text', text: img._label });
      content.push({ type: 'image', data: img.data, mimeType: img.mimeType });
    });
  }
  content.push({ type: 'text', text: TRAIL });
  return { jsonrpc: '2.0', id, result: { content } };
}

function handleRequest(req) {
  const { id, method, params } = req;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'visual-feedback-tool', version: '1.0.0' }
      }
    };
  }

  if (method === 'notifications/initialized') return null;

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: [TOOL_DEF, WAIT_TOOL_DEF] } };
  }

  if (method === 'tools/call' && params?.name === 'get_latest_annotation') {
    const unread = submissions.filter(s => !s.read);
    if (unread.length === 0) {
      return {
        jsonrpc: '2.0', id,
        result: {
          content: [{
            type: 'text',
            text: submissions.length > 0
              ? `All ${submissions.length} submission(s) have already been read. Ask the user to send new annotations or restore old ones from the review panel.`
              : 'No annotations yet. Ask the user to activate the Visual Feedback Tool extension on a localhost page, annotate it, and click "Send →".'
          }]
        }
      };
    }
    const content = [];
    unread.forEach((submission, i) => {
      const includeScreenshot = shouldIncludeScreenshot(submission);
      const history = buildHistorySummary(submission);
      let text = `--- Submission ${i + 1} of ${unread.length} ---\n${buildAnnotationText(submission, includeScreenshot)}`;
      if (history) text += '\n\n' + history;
      content.push({ type: 'text', text });
      if (includeScreenshot && submission.screenshot) {
        content.push({ type: 'image', data: submission.screenshot, mimeType: 'image/jpeg' });
      }
      // Append reference images from comments
      const refImages = collectReferenceImages(submission);
      if (refImages.length) {
        content.push({ type: 'text', text: `Reference images (${refImages.length}):` });
        refImages.forEach(img => {
          content.push({ type: 'text', text: img._label });
          content.push({ type: 'image', data: img.data, mimeType: img.mimeType });
        });
      }
      submission.read = true;
    });
    content.push({ type: 'text', text: TRAIL });
    return { jsonrpc: '2.0', id, result: { content } };
  }

  if (method === 'tools/call') {
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${params?.name}` } };
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

async function handleWaitForAnnotation(req) {
  const { id, params } = req;
  const timeoutSec = Math.min((params?.arguments?.timeout_seconds || DEFAULT_TIMEOUT), DEFAULT_TIMEOUT);

  const existing = submissions.find(s => !s.read);
  if (existing) {
    existing.read = true;
    return buildAnnotationResponse(existing, id);
  }

  return new Promise(resolve => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      const idx = waiters.indexOf(onSubmission);
      if (idx !== -1) waiters.splice(idx, 1);
      resolve({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Timed out waiting for annotation. Ask the user to annotate the page and click Send →.' }] } });
    }, timeoutSec * 1000);

    function onSubmission(submission) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      submission.read = true;
      resolve(buildAnnotationResponse(submission, id));
    }

    waiters.push(onSubmission);
  });
}

// Route one JSON-RPC request through the right handler (used by both the local
// stdio path on the primary and the /mcp HTTP bridge).
function dispatchRpc(req) {
  if (req.method === 'tools/call' && req.params?.name === 'wait_for_annotation') {
    return handleWaitForAnnotation(req); // returns a Promise
  }
  return handleRequest(req); // sync (may return null for notifications)
}

// Secondary sessions forward tool calls to the primary's /mcp endpoint so all
// sessions share one buffer. Session-local methods (initialize, tools/list,
// notifications) are still answered locally — they don't touch shared state.
function isSessionLocal(req) {
  const m = req.method;
  return m === 'initialize' || m === 'notifications/initialized' || m === 'tools/list';
}

function proxyToPrimary(req) {
  // wait_for_annotation can block up to DEFAULT_TIMEOUT; give the socket headroom.
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(req));
    const httpReq = http.request({
      host: '127.0.0.1', port: PORT, path: '/mcp', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
      timeout: (DEFAULT_TIMEOUT + 15) * 1000
    }, resp => {
      let data = '';
      resp.on('data', c => { data += c; });
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Bad response from primary server')); }
      });
    });
    httpReq.on('error', reject);
    httpReq.on('timeout', () => httpReq.destroy(new Error('Primary server timed out')));
    httpReq.end(payload);
  });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', async line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    return;
  }

  // Wait until we know our role (primary vs secondary) before routing anything
  // that touches shared state. Responses are matched by JSON-RPC id, so any
  // reordering from awaiting here is safe for the client.
  await electionReady;

  const emit = response => {
    if (response !== null && response !== undefined) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  };

  // Secondary: proxy shared-state calls to the primary; answer local ones here.
  if (!isPrimary && !isSessionLocal(req)) {
    proxyToPrimary(req)
      .then(emit)
      .catch(err => emit({
        jsonrpc: '2.0', id: req.id ?? null,
        error: { code: -32603, message: `Cannot reach primary server on ${PORT}: ${err.message}` }
      }));
    return;
  }

  // Primary (or a session-local method): handle in-process.
  Promise.resolve(dispatchRpc(req)).then(emit).catch(err => emit({
    jsonrpc: '2.0', id: req.id ?? null, error: { code: -32603, message: err.message }
  }));
});

rl.on('close', () => {
  process.stderr.write('[vft] stdin closed, exiting.\n');
  process.exit(0);
});
