// popup.js — BookCreator Audio Downloader
// Downloads go through background.js to bypass CORS/auth issues

// ── DOM refs ──────────────────────────────────────────────────────────────────
const audioListEl   = document.getElementById('audioList');
const emptyStateEl  = document.getElementById('emptyState');
const countLabel    = document.getElementById('countLabel');
const warningBox    = document.getElementById('warningBox');
const clearBtn      = document.getElementById('clearBtn');
const rescanBtn     = document.getElementById('rescanBtn');
const combineBar    = document.getElementById('combineBar');
const combineBtn    = document.getElementById('combineBtn');
const combineLabel  = document.getElementById('combineLabel');
const progressWrap  = document.getElementById('progressWrap');
const progressBar   = document.getElementById('progressBar');
const progressText  = document.getElementById('progressText');
// Auto-scan
const autoScanBtn   = document.getElementById('autoScanBtn');
const stopScanBtn   = document.getElementById('stopScanBtn');
const scanProgress  = document.getElementById('scanProgress');
const scanDot       = document.getElementById('scanDot');
const scanStatusTxt = document.getElementById('scanStatusText');
const scanChip      = document.getElementById('scanChip');
const scanProgBar   = document.getElementById('scanProgBar');
const scanPageList  = document.getElementById('scanPageList');

let audioEntries  = [];
let pageTexts     = {};   // page# → extracted text string
let isScanning    = false;
let currentTab    = null;
let pageDots      = {};   // page# → dot element
let totalPages    = 0;    // updated as we scan

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  const isOnBookCreator = tab?.url?.includes('bookcreator.com');

  if (!isOnBookCreator) {
    warningBox.style.display = 'block';
    autoScanBtn.disabled = true;
  }

  await loadAudioList(tab.id);

  rescanBtn.addEventListener('click', () => triggerDomScan(tab));
  clearBtn.addEventListener('click',  () => clearList(tab.id));
  autoScanBtn.addEventListener('click', () => startAutoScan(tab));
  stopScanBtn.addEventListener('click',  stopAutoScan);
})();

// ── Listen for messages from background ───────────────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {

  if (msg.action === 'newAudioFound') {
    const exists = audioEntries.some(e => e.url === msg.entry.url);
    if (!exists) {
      audioEntries.push(msg.entry);
      renderList();
    }
    // Update chip count during scan
    if (isScanning) {
      scanChip.textContent = `${audioEntries.length} clip${audioEntries.length !== 1 ? 's' : ''}`;
    }
  }

  if (msg.action === 'scanProgress') {
    handleScanProgress(msg);
  }
});

// ── AUTO SCAN ─────────────────────────────────────────────────────────────────
async function startAutoScan(tab) {
  if (isScanning) return;
  isScanning = true;

  // Reset UI
  pageDots   = {};
  pageTexts  = {};
  totalPages = 0;
  scanPageList.innerHTML = '';
  scanChip.textContent   = `${audioEntries.length} clips`;
  scanStatusTxt.textContent = 'Injecting scanner…';
  scanProgBar.style.width   = '0%';
  scanDot.className = 'scan-dot-lg';

  scanProgress.style.display = 'flex';
  autoScanBtn.disabled = true;
  stopScanBtn.style.display = 'flex';

  // Inject bridge first (ISOLATED), then auto-scan (MAIN)
  if (chrome.scripting) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content-bridge.js'],
        world: 'ISOLATED'
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['auto-scan.js'],
        world: 'MAIN'
      });
    } catch (err) {
      showScanError('Could not inject scanner: ' + err.message);
      return;
    }
  } else {
    showScanError('chrome.scripting not available — reload the extension.');
    return;
  }
}

function stopAutoScan() {
  isScanning = false;
  scanDot.className = 'scan-dot-lg stopped';
  scanStatusTxt.textContent = 'Stopped.';
  stopScanBtn.style.display = 'none';
  autoScanBtn.disabled = false;
  autoScanBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 3l14 9-14 9V3z" fill="currentColor"/>
    </svg>
    Start Auto-Download`;
}

function handleScanProgress(msg) {
  if (!isScanning && msg.status !== 'done') return;

  const { status, page, pages, captured, text } = msg;
  if (captured != null) {
    scanChip.textContent = `${captured} clip${captured !== 1 ? 's' : ''}`;
  }
  
  if (text && page) {
    pageTexts[page] = text;
  }

  switch (status) {
    case 'started':
      scanStatusTxt.textContent = 'Scanning page 1…';
      break;

    case 'scanning':
    case 'audio_clicked':
    case 'navigating':
    case 'no_audio': {
      // Update or create dot for this page
      if (!pageDots[page]) {
        const dot = document.createElement('div');
        dot.className = 'page-dot scanning';
        dot.title = `Page ${page}`;
        dot.textContent = page;
        scanPageList.appendChild(dot);
        pageDots[page] = dot;
        totalPages = Math.max(totalPages, page);
      }
      if (status === 'navigating' || status === 'audio_clicked') {
        if (pageDots[page]) {
          pageDots[page].className = status === 'no_audio' ? 'page-dot no-audio' : 'page-dot done';
        }
      }
      if (status === 'no_audio' && pageDots[page]) {
        pageDots[page].className = 'page-dot no-audio';
      }

      scanStatusTxt.textContent =
        status === 'navigating'   ? `Moving to page ${page + 1}…` :
        status === 'audio_clicked'? `Got audio on page ${page}` :
        status === 'no_audio'     ? `Page ${page}: no audio button found` :
                                    `Scanning page ${page}…`;

      // Progress bar grows with pages (capped at 95% until done)
      if (totalPages > 1) {
        scanProgBar.style.width = Math.min(95, Math.round((page / (totalPages + 2)) * 100)) + '%';
      }
      break;
    }

    case 'done': {
      isScanning = false;
      const finalPages = pages || totalPages;

      // Mark all remaining dots as done
      Object.values(pageDots).forEach(d => {
        if (d.classList.contains('scanning')) d.className = 'page-dot done';
      });

      scanProgBar.style.width = '100%';
      scanDot.className = 'scan-dot-lg done';
      scanStatusTxt.textContent = `✓ Done — ${finalPages} page${finalPages !== 1 ? 's' : ''} scanned`;
      stopScanBtn.style.display = 'none';
      autoScanBtn.disabled = false;
      autoScanBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M5 3l14 9-14 9V3z" fill="currentColor"/>
        </svg>
        Scan Again`;

      // Reload audio list
      if (currentTab) loadAudioList(currentTab.id);
      
      // Show text download button if we captured any text
      const hasText = Object.values(pageTexts).some(t => t.trim().length > 0);
      if (hasText) {
        document.getElementById('dlTextBtn').style.display = 'flex';
      }
      break;
    }
  }
}

function showScanError(msg) {
  isScanning = false;
  scanDot.className = 'scan-dot-lg stopped';
  scanStatusTxt.textContent = '⚠️ ' + msg;
  stopScanBtn.style.display = 'none';
  autoScanBtn.disabled = false;
}

// ── Load list from background ─────────────────────────────────────────────────
async function loadAudioList(tabId) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getAudioList', tabId }, res => {
      audioEntries = res?.list || [];
      renderList();
      resolve();
    });
  });
}

// ── Render list ───────────────────────────────────────────────────────────────
function renderList() {
  audioListEl.innerHTML = '';

  if (audioEntries.length === 0) {
    emptyStateEl.style.display = 'flex';
    countLabel.textContent = '0 clips found';
    countLabel.classList.remove('has-files');
    combineBar.style.display = 'none';
    return;
  }

  emptyStateEl.style.display = 'none';
  countLabel.textContent = `${audioEntries.length} clip${audioEntries.length > 1 ? 's' : ''} found`;
  countLabel.classList.add('has-files');

  if (audioEntries.length >= 2) {
    combineBar.style.display = 'flex';
    combineLabel.textContent = `Combine ${audioEntries.length} clips into one file`;
  } else {
    combineBar.style.display = 'none';
  }

  audioEntries.forEach((entry, i) => {
    audioListEl.appendChild(buildCard(entry, i));
  });
}

// ── Build audio card ──────────────────────────────────────────────────────────
function buildCard(entry, index) {
  const ext = guessExt(entry.filename);
  const displayName = entry.filename.length > 36
    ? entry.filename.substring(0, 34) + '…'
    : entry.filename;

  const card = document.createElement('div');
  card.className = 'audio-card';
  card.id = `card-${index}`;

  card.innerHTML = `
    <div class="card-top">
      <div class="audio-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M9 18V6l12-2v12" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <circle cx="6" cy="18" r="3" fill="white"/>
          <circle cx="18" cy="16" r="3" fill="white"/>
        </svg>
      </div>
      <div class="card-info">
        <div class="card-filename" title="${entry.filename}">${displayName}</div>
        <div class="card-url" title="${entry.url}">${shortenUrl(entry.url)}</div>
      </div>
      <span class="card-ext-badge">${ext}</span>
    </div>
    <audio class="mini-player" controls preload="none" src="${entry.url}"></audio>
    <div class="card-actions">
      <a class="btn-dl" href="${entry.url}" download="${entry.filename}" id="dl-${index}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13m0 0l-4-4m4 4l4-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M3 18v1a2 2 0 002 2h14a2 2 0 002-2v-1" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        Download
      </a>
      <button class="btn-copy" id="copy-${index}">Copy URL</button>
    </div>
  `;

  card.querySelector(`#copy-${index}`).addEventListener('click', function () {
    navigator.clipboard.writeText(entry.url).then(() => {
      this.textContent = '✓ Copied!';
      this.classList.add('copied');
      setTimeout(() => { this.textContent = 'Copy URL'; this.classList.remove('copied'); }, 2000);
    });
  });

  card.querySelector(`#dl-${index}`).addEventListener('click', function (e) {
    e.preventDefault();
    const btn = this;
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" stroke-dasharray="40" stroke-dashoffset="15"
        style="animation:spin 0.8s linear infinite;transform-origin:center"/>
    </svg> Downloading…`;
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
    if (!document.getElementById('spin-style')) {
      const s = document.createElement('style');
      s.id = 'spin-style';
      s.textContent = '@keyframes spin{to{stroke-dashoffset:55}}';
      document.head.appendChild(s);
    }
    chrome.runtime.sendMessage(
      { action: 'downloadAudio', url: entry.url, filename: entry.filename },
      (res) => {
        if (res?.ok) {
          btn.innerHTML = '✓ Saved!';
          btn.style.background = 'linear-gradient(135deg,#047857,#059669)';
          setTimeout(() => {
            btn.innerHTML = orig;
            btn.style.opacity = '';
            btn.style.pointerEvents = '';
            btn.style.background = '';
          }, 3000);
        } else {
          btn.innerHTML = orig;
          btn.style.opacity = '';
          btn.style.pointerEvents = '';
          showError(`Download failed: ${res?.error || 'unknown'}`);
          window.open(entry.url, '_blank');
        }
      }
    );
  });

  return card;
}

// ── DOM re-scan ───────────────────────────────────────────────────────────────
async function triggerDomScan(tab) {
  rescanBtn.textContent = '↺ Scanning…';
  rescanBtn.disabled = true;
  if (chrome.scripting) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'],        world: 'MAIN' });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content-bridge.js'], world: 'ISOLATED' });
    } catch (err) { console.warn('Inject failed:', err.message); }
  }
  setTimeout(async () => {
    await loadAudioList(tab.id);
    rescanBtn.textContent = '↺ Refresh';
    rescanBtn.disabled = false;
  }, 800);
}

// ── Clear list ────────────────────────────────────────────────────────────────
function clearList(tabId) {
  chrome.runtime.sendMessage({ action: 'clearList', tabId }, () => {
    audioEntries = [];
    pageTexts = {};
    document.getElementById('dlTextBtn').style.display = 'none';
    renderList();
    scanChip.textContent = '0 clips';
  });
}

// ── DOWNLOAD TEXT ─────────────────────────────────────────────────────────────
document.getElementById('dlTextBtn').addEventListener('click', () => {
  const pages = Object.keys(pageTexts).map(Number).sort((a, b) => a - b);
  if (pages.length === 0) return;
  
  let combinedText = `BookCreator Export - ${formatDate()}\n\n`;
  for (const p of pages) {
    if (pageTexts[p] && pageTexts[p].trim()) {
      combinedText += `--- Page ${p} ---\n${pageTexts[p]}\n\n`;
    }
  }
  
  const blob = new Blob([combinedText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: `bookcreator-text-${formatDate()}.txt`,
    saveAs: false
  }, () => {
    URL.revokeObjectURL(url);
  });
});

// ── COMBINE ALL CLIPS ─────────────────────────────────────────────────────────
combineBtn.addEventListener('click', combineAllClips);

async function combineAllClips() {
  if (audioEntries.length < 2) return;
  combineBtn.disabled = true;
  combineBtn.textContent = 'Working…';
  progressWrap.style.display = 'block';
  setProgress(0, 'Fetching clips…');

  const audioCtx = new AudioContext();
  const buffers  = [];
  const total    = audioEntries.length;

  try {
    for (let i = 0; i < total; i++) {
      setProgress(Math.round((i / total) * 60), `Fetching ${i + 1} of ${total}…`);
      const res = await new Promise(resolve =>
        chrome.runtime.sendMessage({ action: 'fetchAudioData', url: audioEntries[i].url }, resolve)
      );
      if (!res?.ok) throw new Error(`Clip ${i + 1} fetch failed: ${res?.error}`);
      const buf = await audioCtx.decodeAudioData(dataUrlToArrayBuffer(res.dataUrl));
      buffers.push(buf);
    }

    setProgress(65, 'Joining clips…');
    const combined = concatenateAudioBuffers(buffers, audioCtx);

    setProgress(80, 'Encoding WAV…');
    const wavBlob = new Blob([audioBufferToWav(combined)], { type: 'audio/wav' });

    setProgress(90, 'Downloading…');
    const dataUrl  = await blobToDataUrl(wavBlob);
    const filename = `bookcreator-combined-${formatDate()}.wav`;

    await new Promise((resolve, reject) =>
      chrome.runtime.sendMessage({ action: 'downloadDataUrl', dataUrl, filename }, res => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (res?.ok) resolve();
        else reject(new Error(res?.error || 'download failed'));
      })
    );

    setProgress(100, '✓ Done!');
    combineBtn.textContent = '✓ Saved!';
    combineBtn.style.background = 'linear-gradient(135deg,#047857,#059669)';
    
    // Trigger notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Combine Complete',
      message: `Successfully combined ${total} audio clips into ${filename}.`
    });

    setTimeout(() => {
      progressWrap.style.display = 'none';
      combineBtn.disabled = false;
      combineBtn.textContent = 'Combine & Download';
      combineBtn.style.background = '';
    }, 3000);

  } catch (err) {
    console.error('[Combine]', err);
    progressWrap.style.display = 'none';
    combineBtn.disabled = false;
    combineBtn.textContent = 'Combine & Download';
    showError('Combine failed: ' + err.message);
  } finally {
    audioCtx.close();
  }
}

function setProgress(pct, label) {
  progressBar.style.width = pct + '%';
  progressText.textContent = label || pct + '%';
}

// ── Audio helpers ─────────────────────────────────────────────────────────────
function concatenateAudioBuffers(buffers, audioCtx) {
  const numChannels = Math.max(...buffers.map(b => b.numberOfChannels));
  const sampleRate  = buffers[0].sampleRate;
  const totalLen    = buffers.reduce((sum, b) => sum + b.length, 0);
  const out = audioCtx.createBuffer(numChannels, totalLen, sampleRate);
  let offset = 0;
  for (const buf of buffers) {
    for (let ch = 0; ch < numChannels; ch++) {
      const src = ch < buf.numberOfChannels ? buf.getChannelData(ch) : new Float32Array(buf.length);
      out.getChannelData(ch).set(src, offset);
    }
    offset += buf.length;
  }
  return out;
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate  = buffer.sampleRate;
  const numSamples  = buffer.length;
  const blockAlign  = numChannels * 2;
  const dataLen     = numSamples * blockAlign;
  const ab   = new ArrayBuffer(44 + dataLen);
  const view = new DataView(ab);
  writeStr(view, 0,  'RIFF'); view.setUint32(4, 36 + dataLen, true);
  writeStr(view, 8,  'WAVE');
  writeStr(view, 12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeStr(view, 36, 'data'); view.setUint32(40, dataLen, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  return ab;
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function dataUrlToArrayBuffer(dataUrl) {
  const binary = atob(dataUrl.split(',')[1]);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror   = reject;
    reader.readAsDataURL(blob);
  });
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
function guessExt(filename) {
  const m = filename.match(/\.(\w+)$/);
  return m ? m[1].toUpperCase() : 'AUDIO';
}

function shortenUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + '/…/' + u.pathname.split('/').slice(-2).join('/');
  } catch { return url.substring(0, 50) + '…'; }
}

function showError(msg) {
  warningBox.textContent = `⚠️ ${msg}`;
  warningBox.style.display = 'block';
  setTimeout(() => { warningBox.style.display = 'none'; }, 5000);
}

function formatDate() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
