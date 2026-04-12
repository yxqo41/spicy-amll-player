/**
 * Spicy Lyrics Web — Upload Page Logic
 * Handles file selection, drag-and-drop, validation, and navigation.
 * Uses IndexedDB to persist audio across page navigation.
 * TTML is now OPTIONAL — lyrics will be auto-fetched if not provided.
 */

document.addEventListener('DOMContentLoaded', () => {
  const ttmlZone = document.getElementById('ttml-zone');
  const audioZone = document.getElementById('audio-zone');
  const ttmlInput = document.getElementById('ttml-input');
  const audioInput = document.getElementById('audio-input');
  const startBtn = document.getElementById('start-button');
  const errorEl = document.getElementById('upload-error');

  let ttmlFile = null;
  let audioFile = null;

  // ── Zone Click ──
  ttmlZone.addEventListener('click', () => ttmlInput.click());
  audioZone.addEventListener('click', () => audioInput.click());

  // ── File Input Change ──
  ttmlInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleTTMLFile(file);
  });

  audioInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleAudioFile(file);
  });

  // ── Drag & Drop ──
  [ttmlZone, audioZone].forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('dragover');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (!file) return;

      if (zone === ttmlZone) handleTTMLFile(file);
      else handleAudioFile(file);
    });
  });

  // ── File Handlers ──
  function handleTTMLFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'ttml' && ext !== 'xml') {
      showError('Please select a valid TTML file (.ttml or .xml)');
      return;
    }
    ttmlFile = file;
    clearError();
    updateZoneState(ttmlZone, file.name);
    checkReady();
  }

  function handleAudioFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) {
      showError('Please select a valid audio file (MP3, FLAC, WAV, OGG, M4A, AAC)');
      return;
    }
    audioFile = file;
    clearError();
    updateZoneState(audioZone, file.name);
    checkReady();
  }

  function updateZoneState(zone, filename) {
    zone.classList.add('has-file');
    const filenameEl = zone.querySelector('.zone-filename');
    const hintEl = zone.querySelector('.zone-hint');
    const h3El = zone.querySelector('h3');

    if (filenameEl) {
      filenameEl.textContent = filename;
      filenameEl.style.display = 'block';
    }
    if (hintEl) hintEl.style.display = 'none';
    if (h3El) h3El.style.color = 'var(--apple-pink)'; // Feedback color
  }


  function checkReady() {
    // Only audio is required now — TTML is optional
    if (audioFile) {
      startBtn.classList.add('enabled');
      startBtn.removeAttribute('disabled');
    }
  }

  function showError(msg) {
    errorEl.textContent = msg;
  }

  function clearError() {
    errorEl.textContent = '';
  }

  // ── IndexedDB Helper ──
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('SpicyLyricsDB', 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files');
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function storeFileInDB(key, arrayBuffer) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      store.put(arrayBuffer, key);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Start Button ──
  startBtn.addEventListener('click', async () => {
    if (!audioFile) return;
    startBtn.textContent = 'Loading...';
    startBtn.classList.remove('enabled');

    try {
      // Read TTML as text (if provided)
      if (ttmlFile) {
        const ttmlText = await readFileAsText(ttmlFile);
        sessionStorage.setItem('spicy_ttml', ttmlText);
      } else {
        // Set a marker for auto-fetch mode
        sessionStorage.setItem('spicy_ttml', '__AUTO_FETCH__');
      }

      sessionStorage.setItem('spicy_audio_name', audioFile.name);
      sessionStorage.setItem('spicy_audio_type', audioFile.type || 'audio/mpeg');

      // Store audio binary in IndexedDB (survives navigation, handles large files)
      const audioBuffer = await readFileAsArrayBuffer(audioFile);
      await storeFileInDB('spicy_audio', audioBuffer);

      // Navigate to player
      window.location.href = 'player.html';
    } catch (err) {
      console.error('Error storing files:', err);
      showError('Failed to process files: ' + err.message);
      startBtn.textContent = 'Start Playback';
      startBtn.classList.add('enabled');
    }
  });

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e.target.error);
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e.target.error);
      reader.readAsArrayBuffer(file);
    });
  }
});
