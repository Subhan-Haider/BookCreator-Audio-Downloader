# 📥 BookCreator Audio Downloader — Chrome Extension

Automatically detects the **already-encoded audio files** served by BookCreator and lets you download them directly — **no recording needed**.

---

## 🛠 Installation

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (toggle, top-right)
3. Click **"Load unpacked"**
4. Select: `C:\Users\shah_\Videos\Audio download`
5. Pin the extension icon to your toolbar

---

## 🎵 How to Download the Audio

1. Open the BookCreator book in Chrome
2. Click the 🔊 **"Read to me"** button — audio starts playing
3. Click the **extension icon** in the toolbar
4. The audio file(s) appear as cards with:
   - A **mini audio player** to preview
   - A green **Download** button
   - A **Copy URL** button (to paste into a download manager)
5. Click **Download** — file saves to your Downloads folder

> If an audio file doesn't show up, click **↺ Refresh** in the popup.

---

## 🔊 Output

You get the **original audio file** as served by BookCreator — typically:
- MP3, M4A, WAV, or OGG depending on what BookCreator uploaded
- Full quality — no re-encoding or quality loss

---

## 📁 Files

```
Audio download/
├── manifest.json    ← Extension config
├── background.js   ← Network request interceptor (webRequest API)
├── content.js      ← DOM scanner for <audio> elements
├── popup.html       ← Extension UI
├── popup.js         ← UI logic
├── popup.css        ← Styling
└── icons/           ← Extension icons
```
