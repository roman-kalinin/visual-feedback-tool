'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  document.getElementById('url').textContent = tab.url || '(no URL)';

  // Check MCP server health and buffer count
  checkServerHealth();
  checkBufferCount();

  document.getElementById('reviewBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:3333/review' });
  });

  // Check if overlay already active
  const alreadyActive = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__vftOverlayActive === true
  }).then(([{ result }]) => result).catch(() => false);

  if (alreadyActive) {
    document.getElementById('activateBtn').textContent = 'Overlay Active';
    document.getElementById('activateBtn').disabled = true;
    document.getElementById('status').style.display = 'block';
  }

  document.getElementById('activateBtn').addEventListener('click', async () => {
    const btn = document.getElementById('activateBtn');
    btn.textContent = 'Activating…';
    btn.disabled = true;

    const response = await chrome.runtime.sendMessage({ type: 'INJECT_OVERLAY', tabId: tab.id });
    if (response?.ok) {
      document.getElementById('status').style.display = 'block';
      btn.textContent = 'Overlay Active';
    } else {
      btn.disabled = false;
      btn.textContent = 'Activate Overlay';
      const errEl = document.getElementById('error');
      errEl.textContent = response?.error || 'Injection failed';
      errEl.style.display = 'block';
    }
  });
});

async function checkBufferCount() {
  try {
    const res = await fetch('http://localhost:3333/submissions', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('bufferCount').textContent =
        data.count === 0 ? 'Buffer empty' : `${data.count} item${data.count === 1 ? '' : 's'} in buffer`;
    }
  } catch { /* server offline — health dot shows it */ }
}

async function checkServerHealth() {
  const dot = document.getElementById('serverDot');
  const label = document.getElementById('serverLabel');
  try {
    const res = await fetch('http://localhost:3333/health', { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      dot.className = 'dot online';
      label.textContent = 'MCP server running';
    } else {
      throw new Error('bad status');
    }
  } catch {
    dot.className = 'dot offline';
    label.textContent = 'MCP server offline';
  }
}
