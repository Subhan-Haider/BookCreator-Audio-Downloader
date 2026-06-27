// content-bridge.js — Runs in ISOLATED world
// Bridges messages from MAIN world scripts to the background service worker

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  // Audio URLs found by the page interceptor
  if (event.data?.type === 'BOOKCREATOR_AUDIO_FOUND') {
    const urls = event.data.urls || [];
    if (urls.length === 0) return;
    chrome.runtime.sendMessage({ action: 'domAudioFound', urls }).catch(() => {});
  }

  // Auto-scan progress from auto-scan.js
  if (event.data?.type === 'BOOKCREATOR_SCAN_PROGRESS') {
    chrome.runtime.sendMessage({
      action: 'scanProgress',
      status:  event.data.status,
      page:    event.data.page,
      pages:   event.data.pages,
    }).catch(() => {});
  }
});
