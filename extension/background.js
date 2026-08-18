'use strict';

const SERVER_URL = 'http://localhost:3333';

chrome.action.onClicked.addListener(tab => {
  injectOverlay(tab.id).catch(console.error);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_AND_SEND') {
    captureAndSend(sender.tab?.id)
      .then(bufferCount => sendResponse({ ok: true, bufferCount }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
  if (message.type === 'CAPTURE_FREEZE') {
    const tabId = sender.tab?.id;
    chrome.tabs.get(tabId).then(tab => {
      return chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    })
      .then(dataUrl => sendResponse({ ok: true, dataUrl }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

async function injectOverlay(tabId) {
  const [{ result: alreadyInjected }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__vftOverlayActive === true
  });
  if (alreadyInjected) return;

  await chrome.scripting.insertCSS({ target: { tabId }, files: ['overlay.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['sketch.js'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

const QUALITY_PRESETS = {
  low:    { scale: 0.25, jpeg: 0.50 },
  medium: { scale: 0.50, jpeg: 0.75 },
  high:   { scale: 1.00, jpeg: 0.90 }
};

async function captureAndSend(tabId) {

  // Read settings from the page
  const [{ result: settings }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__vftSettings || { screenshotQuality: 'medium', detailLevel: 'standard', screenshotMode: 'always' }
  });

  const preset = QUALITY_PRESETS[settings.screenshotQuality] || QUALITY_PRESETS.medium;

  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__vftToolbar) window.__vftToolbar.style.visibility = 'hidden';
      if (window.__vftReviewPanel) window.__vftReviewPanel.style.visibility = 'hidden';
    }
  });

  const rawDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  // Downscale and convert to JPEG using settings-driven quality
  const [{ result: screenshotBase64 }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dataUrl, scale, jpegQuality) => {
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const jpeg = c.toDataURL('image/jpeg', jpegQuality);
          resolve(jpeg.split(',')[1]);
        };
        img.src = dataUrl;
      });
    },
    args: [rawDataUrl, preset.scale, preset.jpeg]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__vftToolbar) window.__vftToolbar.style.visibility = '';
      if (window.__vftReviewPanel) window.__vftReviewPanel.style.visibility = '';
    }
  });

  const [{ result: annotations }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__vftAnnotations || []
  });

  const [{ result: meta }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      url: window.location.href,
      title: document.title,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      timestamp: new Date().toISOString(),
      activeView: document.querySelector('[data-active-view]')?.dataset?.activeView
        || window.__activeView
        || null
    })
  });

  const payload = {
    screenshot: screenshotBase64,
    annotations,
    meta,
    settings: {
      detailLevel: settings.detailLevel,
      screenshotMode: settings.screenshotMode,
      screenshotQuality: settings.screenshotQuality
    }
  };
  const response = await fetch(`${SERVER_URL}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`Server responded ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.bufferCount;
}


