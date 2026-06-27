// content.js — Runs in MAIN world (has access to the page's real JS context)
// Intercepts fetch, XHR, and <audio> elements to find audio URLs

(function () {
  'use strict';

  const foundUrls = new Set();

  function report(urls) {
    const newUrls = urls.filter(u => u && u.startsWith('http') && !foundUrls.has(u));
    if (newUrls.length === 0) return;
    newUrls.forEach(u => foundUrls.add(u));
    // Send to bridge (isolated world) via postMessage
    window.postMessage({ type: 'BOOKCREATOR_AUDIO_FOUND', urls: newUrls }, '*');
  }

  // ── Intercept fetch ─────────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await _fetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0]
        : args[0] instanceof Request ? args[0].url : '';
      const ct = res.headers.get('content-type') || '';
      if (isAudio(url, ct)) report([url]);
    } catch (_) {}
    return res;
  };

  // ── Intercept XMLHttpRequest ────────────────────────────────────────────────
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._url = url;
    return _open.apply(this, arguments);
  };
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('readystatechange', function () {
      if (this.readyState === 4) {
        const ct = this.getResponseHeader('content-type') || '';
        if (isAudio(this._url || '', ct)) report([this._url]);
      }
    });
    return _send.apply(this, arguments);
  };

  // ── Scan <audio> elements ──────────────────────────────────────────────────
  function scanDOM() {
    const urls = [];
    document.querySelectorAll('audio').forEach(el => {
      if (el.src && el.src.startsWith('http')) urls.push(el.src);
      el.querySelectorAll('source').forEach(s => {
        if (s.src && s.src.startsWith('http')) urls.push(s.src);
      });
      // currentSrc is the one actually playing
      if (el.currentSrc && el.currentSrc.startsWith('http')) urls.push(el.currentSrc);
    });
    if (urls.length) report(urls);
  }

  // Run DOM scan immediately and on mutations
  scanDOM();
  const observer = new MutationObserver(scanDOM);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function isAudio(url, ct) {
    if (!url) return false;
    if (ct.startsWith('audio/')) return true;
    try {
      return /\.(mp3|wav|ogg|m4a|aac|flac|opus|aiff)(\?|$)/i.test(new URL(url).pathname);
    } catch { return false; }
  }

})();
