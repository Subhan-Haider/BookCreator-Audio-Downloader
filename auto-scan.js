// auto-scan.js — Injected into the BookCreator page (MAIN world)
// Automatically clicks the audio button on each page and advances to the next.

(async function autoScan() {
  'use strict';

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function report(data) {
    window.postMessage({ type: 'BOOKCREATOR_SCAN_PROGRESS', ...data }, '*');
  }

  // ── Button finders ──────────────────────────────────────────────────────────

  function findAudioButton() {
    // 1. Aria-label matches
    const ariaTargets = [
      'button[aria-label*="Read" i]',
      'button[aria-label*="Audio" i]',
      'button[aria-label*="Sound" i]',
      'button[aria-label*="Speak" i]',
      'button[aria-label*="Listen" i]',
    ];
    for (const s of ariaTargets) {
      const el = document.querySelector(s);
      if (el && isVisible(el)) return el;
    }

    // 2. Text content — the "Read to me" toolbar button
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      const txt = btn.textContent?.trim().toLowerCase() || '';
      if (txt.includes('read to me') || txt.includes('read aloud') || txt.includes('listen')) {
        if (isVisible(btn)) return btn;
      }
    }

    // 3. SVG speaker icon heuristic — look for buttons that contain a speaker-like SVG
    for (const btn of document.querySelectorAll('button, [role="button"]')) {
      const html = btn.innerHTML || '';
      if ((html.includes('M11') || html.includes('volume') || html.includes('speaker') || html.includes('M15')) &&
          btn.querySelector('svg') && isVisible(btn)) {
        return btn;
      }
    }

    // 4. Class-name heuristic
    const classTargets = [
      '[class*="audio" i] button',
      '[class*="sound" i] button',
      '[class*="speak" i] button',
      '[class*="read" i][class*="btn" i]',
      'button[class*="audio" i]',
      'button[class*="sound" i]',
    ];
    for (const s of classTargets) {
      try {
        const el = document.querySelector(s);
        if (el && isVisible(el)) return el;
      } catch (_) {}
    }

    return null;
  }

  function findNextButton() {
    // 1. Aria-label
    const ariaTargets = [
      'button[aria-label*="Next" i]',
      'button[aria-label*="Forward" i]',
      'button[aria-label*="right" i]',
    ];
    for (const s of ariaTargets) {
      const el = document.querySelector(s);
      if (el && isVisible(el) && !isDisabled(el)) return el;
    }

    // 2. Class heuristic
    const classTargets = [
      'button[class*="next" i]',
      'button[class*="forward" i]',
      '[class*="next-page" i]',
      '[class*="page-next" i]',
      '[class*="arrow-right" i]',
    ];
    for (const s of classTargets) {
      try {
        const el = document.querySelector(s);
        if (el && isVisible(el) && !isDisabled(el)) return el;
      } catch (_) {}
    }

    // 3. Look for rightmost nav button on screen edges (the > arrow)
    const allBtns = [...document.querySelectorAll('button, [role="button"]')];
    const rightEdgeBtns = allBtns.filter(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.right > window.innerWidth * 0.75 &&
             rect.top   > window.innerHeight * 0.2 &&
             rect.bottom < window.innerHeight * 0.8 &&
             isVisible(btn) && !isDisabled(btn);
    });
    if (rightEdgeBtns.length > 0) return rightEdgeBtns[0];

    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
           getComputedStyle(el).visibility !== 'hidden' &&
           getComputedStyle(el).display !== 'none';
  }

  function isDisabled(el) {
    return el.disabled ||
           el.getAttribute('aria-disabled') === 'true' ||
           el.classList.toString().includes('disabled');
  }

  function extractPageText() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          // Skip UI elements
          if (parent.closest('button, nav, header, .toolbar, [role="button"], [class*="ui" i]')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip invisible elements
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }
          
          if (node.nodeValue.trim().length < 2) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const texts = [];
    let node;
    while (node = walker.nextNode()) {
      texts.push(node.nodeValue.trim());
    }
    
    return texts.join('\n').replace(/\n{2,}/g, '\n');
  }

  // ── Main loop ───────────────────────────────────────────────────────────────

  const MAX_PAGES = 80;
  let page = 0;
  let noNextCount = 0;

  report({ status: 'started', page: 0 });
  await sleep(800); // Let page settle

  while (page < MAX_PAGES) {
    page++;
    report({ status: 'scanning', page });

    // Click the audio button if found
    const audioBtn = findAudioButton();
    const pageText = extractPageText();

    if (audioBtn) {
      audioBtn.click();
      report({ status: 'audio_clicked', page, text: pageText });
      await sleep(2800); // Wait for network request to be captured
    } else {
      report({ status: 'no_audio', page, text: pageText });
      await sleep(600);
    }

    // Try to advance to next page
    const nextBtn = findNextButton();
    if (!nextBtn) {
      noNextCount++;
      if (noNextCount >= 2) {
        // No next button found twice — assume we're at the last page
        report({ status: 'done', pages: page });
        return;
      }
      await sleep(800);
      continue;
    }

    noNextCount = 0;
    nextBtn.click();
    report({ status: 'navigating', page });
    await sleep(2000); // Wait for page transition animation
  }

  report({ status: 'done', pages: page });
})();
