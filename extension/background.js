'use strict';

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

});

async function injectOverlay(tabId) {
  const [{ result: alreadyInjected }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__vftOverlayActive === true
  });
  if (alreadyInjected) return;

  await chrome.scripting.insertCSS({ target: { tabId }, files: ['overlay.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

async function captureAndSend(tabId) {

  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__vftToolbar) window.__vftToolbar.style.display = 'none';
      if (window.__vftReviewPanel) window.__vftReviewPanel.style.display = 'none';
    }
  });

  const rawDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

  // Downscale to 50% and convert to JPEG in the page context
  const [{ result: screenshotBase64 }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (dataUrl) => {
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const scale = 0.5;
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          const jpeg = c.toDataURL('image/jpeg', 0.75);
          resolve(jpeg.split(',')[1]);
        };
        img.src = dataUrl;
      });
    },
    args: [rawDataUrl]
  });

  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      if (window.__vftToolbar) window.__vftToolbar.style.display = '';
      if (window.__vftReviewPanel) window.__vftReviewPanel.style.display = '';
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

  const payload = { screenshot: screenshotBase64, annotations, meta };
  const response = await fetch('http://localhost:3333/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`Server responded ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return data.bufferCount;
}
