// background.js — Intercepts BookCreator audio network requests + handles downloads

const capturedAudioMap = {}; // tabId → [ {url, filename, timestamp} ]

// ── Listen for ANY audio by Content-Type (most reliable) ──────────────────────
chrome.webRequest.onResponseStarted.addListener(
  (details) => {
    const ct = (details.responseHeaders || [])
      .find(h => h.name.toLowerCase() === 'content-type')?.value || '';

    const url = details.url;
    const tabId = details.tabId;
    if (tabId < 0) return;

    // Match by Content-Type OR by URL extension
    if (!isAudioContentType(ct) && !isAudioUrl(url)) return;

    if (!capturedAudioMap[tabId]) capturedAudioMap[tabId] = [];
    const already = capturedAudioMap[tabId].some(e => e.url === url);
    if (!already) {
      const filename = guessFilename(url, ct);
      const entry = { url, filename, timestamp: Date.now() };
      capturedAudioMap[tabId].push(entry);
      console.log('[AudioFinder] Captured:', url);
      chrome.runtime.sendMessage({ action: 'newAudioFound', tabId, entry }).catch(() => {});
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ── Also catch before request (catches more types) ────────────────────────────
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    if (!isAudioUrl(url)) return;
    const tabId = details.tabId;
    if (tabId < 0) return;
    if (!capturedAudioMap[tabId]) capturedAudioMap[tabId] = [];
    const already = capturedAudioMap[tabId].some(e => e.url === url);
    if (!already) {
      const filename = guessFilename(url);
      const entry = { url, filename, timestamp: Date.now() };
      capturedAudioMap[tabId].push(entry);
      chrome.runtime.sendMessage({ action: 'newAudioFound', tabId, entry }).catch(() => {});
    }
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] }
);

// ── Clear captured list when tab navigates ────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') delete capturedAudioMap[tabId];
});

// ── Message handler ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Get list for popup
  if (msg.action === 'getAudioList') {
    sendResponse({ list: capturedAudioMap[msg.tabId] || [] });
    return true;
  }

  // Download a data URL (used by combine feature to avoid chrome.downloads in popup)
  if (msg.action === 'downloadDataUrl') {
    chrome.downloads.download(
      { url: msg.dataUrl, filename: sanitizeFilename(msg.filename), saveAs: false },
      (id) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ ok: true, downloadId: id });
        }
      }
    );
    return true;
  }

  // Clear list
  if (msg.action === 'clearList') {
    delete capturedAudioMap[msg.tabId];
    sendResponse({ ok: true });
    return true;
  }

  // DOM audio found via page script → bridge message
  if (msg.action === 'domAudioFound') {
    const tabId = sender.tab?.id;
    if (!tabId || tabId < 0) return;
    (msg.urls || []).forEach(url => {
      if (!capturedAudioMap[tabId]) capturedAudioMap[tabId] = [];
      const already = capturedAudioMap[tabId].some(e => e.url === url);
      if (!already) {
        const entry = { url, filename: guessFilename(url), timestamp: Date.now() };
        capturedAudioMap[tabId].push(entry);
        chrome.runtime.sendMessage({ action: 'newAudioFound', tabId, entry }).catch(() => {});
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  // Relay auto-scan progress from content bridge → popup
  if (msg.action === 'scanProgress') {
    const tabId = sender.tab?.id;
    const count = capturedAudioMap[tabId]?.length || 0;
    chrome.runtime.sendMessage({
      action:  'scanProgress',
      status:  msg.status,
      page:    msg.page,
      pages:   msg.pages,
      captured: count,
    }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  // ── Fetch single audio URL as base64 (for combine feature) ───────────────
  if (msg.action === 'fetchAudioData') {
    fetch(msg.url, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ dataUrl: reader.result, mimeType: blob.type });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }))
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  // ── DOWNLOAD handler ──────────────────────────────────────────────────────
  // The background script fetches the audio as a blob (bypassing popup CORS
  // restrictions) then hands it to chrome.downloads as a data URL.
  if (msg.action === 'downloadAudio') {
    const { url, filename } = msg;

    fetch(url, { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror  = reject;
        reader.readAsDataURL(blob);
      }))
      .then(dataUrl => new Promise((resolve, reject) => {
        chrome.downloads.download(
          { url: dataUrl, filename: sanitizeFilename(filename), saveAs: false },
          (id) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(id);
          }
        );
      }))
      .then(id => sendResponse({ ok: true, downloadId: id }))
      .catch(err => {
        console.error('[AudioFinder] Download failed:', err);
        // Fallback: try chrome.downloads directly with the original URL
        chrome.downloads.download(
          { url, filename: sanitizeFilename(filename), saveAs: false },
          (id) => {
            if (chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
              sendResponse({ ok: true, downloadId: id });
            }
          }
        );
      });

    return true; // keep message channel open for async response
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function isAudioUrl(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm|aiff)(\?|$)/.test(path);
  } catch { return false; }
}

function isAudioContentType(ct) {
  if (!ct) return false;
  return ct.startsWith('audio/') ||
    ct.includes('mpeg') ||
    ct.includes('ogg') ||
    (ct.includes('mp4') && ct.includes('audio'));
}

function guessFilename(url, contentType) {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/');
    let name = decodeURIComponent(parts[parts.length - 1] || 'audio');
    if (!name.match(/\.\w{2,5}$/)) {
      const ext = contentType?.includes('mpeg') ? '.mp3'
        : contentType?.includes('ogg')  ? '.ogg'
        : contentType?.includes('wav')  ? '.wav'
        : contentType?.includes('mp4')  ? '.m4a'
        : '.mp3';
      name += ext;
    }
    return name;
  } catch {
    return 'bookcreator-audio.mp3';
  }
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 200);
}
