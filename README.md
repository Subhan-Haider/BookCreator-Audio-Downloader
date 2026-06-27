# 📥 BookCreator Audio Downloader — Chrome Extension

Automatically detects the **already-encoded audio files** served by BookCreator, scans through all pages of a book, and combines the audio clips into a single continuous file.

---

## ✨ Features

- 🤖 **Auto-Scan All Pages**: Click a single button, and the extension will automatically navigate through the book, trigger the "Read to me" audio on each page, and collect the clips.
- 🔗 **Combine & Download**: Merges all captured clips into a single, continuous 16-bit WAV file automatically.
- 🔔 **Notifications**: Get notified when auto-scanning completes or when a combined download finishes, so you don't have to wait around.
- 🎨 **Modern UI**: Clean, responsive popup with progress bars, page trackers, mini-players, and a sleek light theme.
- 🔓 **Bypass Auth/CORS**: Handles Firebase authenticated blobs seamlessly via background service workers.

---

## 🛠 Installation

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (toggle, top-right)
3. Click **"Load unpacked"**
4. Select the directory: `C:\Users\shah_\Videos\Audio download`
5. Pin the extension icon to your toolbar.

---

## 🎵 How to Download a Full Book

1. Open the BookCreator book in Chrome and go to **Page 1**.
2. Click the **extension icon** in your toolbar.
3. Click the **Start Auto-Download** button.
   - The extension will automatically click the audio button, capture it, and move to the next page.
   - You can watch the live progress and page tracker inside the popup.
4. When scanning is finished, a notification will appear.
5. Click **Combine & Download** to merge all pages into a single `bookcreator-combined-...wav` file.

> **Manual Mode:** You can also manually navigate pages and click "Read to me". The extension will capture the audio in the background and you can download them individually if you prefer.

---

## 📁 Files

```
Audio download/
├── manifest.json       ← Extension config & permissions
├── background.js       ← Network interceptor, blob downloader & notification handler
├── auto-scan.js        ← Page automation script (clicks next/audio)
├── content-bridge.js   ← Passes messages from MAIN world to ISOLATED world
├── content.js          ← DOM scanner for elements
├── popup.html          ← Extension UI (HTML)
├── popup.js            ← UI logic, progress tracking, and WAV encoder
├── popup.css           ← Light theme styling
└── icons/              ← Extension icons
```
