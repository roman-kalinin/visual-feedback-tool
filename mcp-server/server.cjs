'use strict';

const http = require('http');
const readline = require('readline');

// ── Shared state ──────────────────────────────────────────────────────────────
const submissions = [];

// ── HTTP Server ───────────────────────────────────────────────────────────────
const PORT = 3333;

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
          receivedAt: new Date().toISOString(),
          read: false
        };
        submissions.push(submission);
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
    'Each submission includes structured annotation data: rectangle highlights and text comments with element metadata.',
    'A screenshot is only included when freehand drawings or rectangles are present (visual context needed).',
    'Comments-only submissions skip the screenshot to save tokens — the element data is sufficient.',
    'Submissions are marked as read after retrieval. Call this when the user says they annotated the page or sent feedback.'
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  }
};

function hasVisualAnnotations(annotations) {
  return annotations.some(a => a.type === 'draw' || a.type === 'rect');
}

function buildAnnotationText(submission, includeScreenshot) {
  const { annotations, meta, receivedAt } = submission;

  const annLines = annotations.map((ann, i) => {
    if (ann.type === 'draw') {
      return null;
    }
    if (ann.type === 'rect') {
      return `[${i + 1}] Rectangle highlight — x:${Math.round(ann.x)} y:${Math.round(ann.y)} w:${Math.round(ann.width)} h:${Math.round(ann.height)}`;
    }
    if (ann.type === 'comment') {
      const lines = [];
      lines.push(`[${i + 1}] Comment #${ann.index} — "${ann.text}"`);
      if (ann.area) {
        lines.push(`       Area: x:${Math.round(ann.area.x)} y:${Math.round(ann.area.y)} w:${Math.round(ann.area.width)} h:${Math.round(ann.area.height)}`);
      } else {
        lines.push(`       Point: (${Math.round(ann.x)}, ${Math.round(ann.y)})`);
      }
      if (ann.element) {
        const el = ann.element;
        const elDesc = [
          el.tag,
          el.id ? `#${el.id}` : null,
          el.classes.length ? `.${el.classes.slice(0, 3).join('.')}` : null,
          el.text ? `text:"${el.text.slice(0, 60)}"` : null
        ].filter(Boolean).join(' ');
        lines.push(`       Element: ${elDesc}`);
        if (el.rect) lines.push(`       Element bounds: x:${el.rect.x} y:${el.rect.y} w:${el.rect.w} h:${el.rect.h}`);
      }
      if (ann.elements && ann.elements.length) {
        lines.push(`       Elements in area (${ann.elements.length}):`);
        ann.elements.forEach(el => {
          const elDesc = [
            el.tag,
            el.id ? `#${el.id}` : null,
            el.classes.length ? `.${el.classes.slice(0, 3).join('.')}` : null,
            el.text ? `text:"${el.text.slice(0, 50)}"` : null
          ].filter(Boolean).join(' ');
          lines.push(`         - ${elDesc}`);
        });
      }
      return lines.join('\n');
    }
    return `[${i + 1}] Unknown type: ${ann.type}`;
  });

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
    footer
  ].filter(line => line !== null).join('\n');
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
    return { jsonrpc: '2.0', id, result: { tools: [TOOL_DEF] } };
  }

  if (method === 'tools/call') {
    if (params?.name !== 'get_latest_annotation') {
      return {
        jsonrpc: '2.0', id,
        error: { code: -32601, message: `Unknown tool: ${params?.name}` }
      };
    }

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
      const includeScreenshot = hasVisualAnnotations(submission.annotations);

      content.push({
        type: 'text',
        text: `--- Submission ${i + 1} of ${unread.length} ---\n${buildAnnotationText(submission, includeScreenshot)}`
      });

      if (includeScreenshot) {
        content.push({
          type: 'image',
          data: submission.screenshot,
          mimeType: 'image/jpeg'
        });
      }

      // Mark as read
      submission.read = true;
    });

    return { jsonrpc: '2.0', id, result: { content } };
  }

  return {
    jsonrpc: '2.0', id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id: null,
      error: { code: -32700, message: 'Parse error' }
    }) + '\n');
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
