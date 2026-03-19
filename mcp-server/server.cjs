'use strict';

const http = require('http');
const readline = require('readline');

// ── Constants ─────────────────────────────────────────────────────────────────
const PORT             = 3333;
const MAX_HISTORY      = 5;   // prior submissions shown in history summary
const MAX_HIST_COMMENTS = 4;  // max comment texts per history entry
const TEXT_TRUNCATE    = 60;  // chars before truncation in text fields
const MAX_CLASSES      = 3;   // max CSS classes shown in element desc
const DEFAULT_TIMEOUT  = 120; // wait_for_annotation default/max seconds

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
        // Wake any long-polling waiters
        while (waiters.length) waiters.shift()(submission);
        const count = submission.annotations.length;
        process.stderr.write(`[vft] Received: ${count} annotation(s) from ${submission.meta.url} (buffer: ${submissions.length})\n`);
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

  res.writeHead(404);
  res.end();
});

httpServer.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`[vft] HTTP server listening on http://127.0.0.1:${PORT}\n`);
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
  const mode = submission.settings?.screenshotMode || 'smart';
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

function buildAnnotationResponse(submission, id) {
  const includeScreenshot = shouldIncludeScreenshot(submission);
  const history = buildHistorySummary(submission);
  let text = buildAnnotationText(submission, includeScreenshot);
  if (history) text += '\n\n' + history;
  const content = [{ type: 'text', text }];
  if (includeScreenshot && submission.screenshot) {
    content.push({ type: 'image', data: submission.screenshot, mimeType: 'image/jpeg' });
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

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
    return;
  }

  if (req.method === 'tools/call' && req.params?.name === 'wait_for_annotation') {
    handleWaitForAnnotation(req).then(response => {
      process.stdout.write(JSON.stringify(response) + '\n');
    });
    return;
  }

  const response = handleRequest(req);
  if (response !== null) {
    process.stdout.write(JSON.stringify(response) + '\n');
  }
});

rl.on('close', () => {
  process.stderr.write('[vft] stdin closed, exiting.\n');
  process.exit(0);
});
