import { addTrackToQueue, clearQueue, setCurrentIndex } from './router.js';
import { parseAudioMetadata } from './metadata-parser.js';

document.addEventListener('DOMContentLoaded', () => {
  const ttmlZone = document.getElementById('ttml-zone');
  const audioZone = document.getElementById('audio-zone');
  const ttmlInput = document.getElementById('ttml-input');
  const audioInput = document.getElementById('audio-input');
  const startBtn = document.getElementById('start-button');
  const errorEl = document.getElementById('upload-error');
  
  const queuePreview = document.getElementById('queue-preview');
  const queueList = document.getElementById('queue-list');
  const queueCount = document.getElementById('queue-count');
  const clearQueueBtn = document.getElementById('clear-queue-btn');

  let stagedAudio = []; // Array of { file, ttmlFile: null }
  let stagedTTML = [];  // Array of File

  // ── Zone Click ──
  ttmlZone.addEventListener('click', (e) => {
    if (e.target === ttmlInput) return;
    console.log('TTML Zone clicked');
    ttmlInput.click();
  });

  audioZone.addEventListener('click', (e) => {
    if (e.target === audioInput) return;
    console.log('Audio Zone clicked');
    audioInput.click();
  });

  // ── File Input Change ──
  ttmlInput.addEventListener('change', (e) => {
    handleTTMLFiles(Array.from(e.target.files));
  });

  audioInput.addEventListener('change', (e) => {
    handleAudioFiles(Array.from(e.target.files));
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
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      if (zone === ttmlZone) handleTTMLFiles(files);
      else handleAudioFiles(files);
    });
  });

  // ── File Handlers ──
  function handleTTMLFiles(files) {
    console.log('Processing TTML files:', files.map(f => f.name));
    const validFiles = files.filter(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      return ext === 'ttml' || ext === 'xml';
    });
    
    if (validFiles.length < files.length) {
      showError('Skipped some non-TTML files.');
    }

    stagedTTML = [...stagedTTML, ...validFiles];
    matchAndRender();
  }

  function handleAudioFiles(files) {
    console.log('Processing audio files:', files.map(f => f.name));
    const audioExts = ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'];
    const playlistExts = ['m3u', 'json'];

    const validAudio = [];
    files.forEach(f => {
      const ext = f.name.split('.').pop().toLowerCase();
      if (audioExts.includes(ext)) {
        validAudio.push({ file: f, ttmlFile: null });
      } else if (playlistExts.includes(ext)) {
        handlePlaylistImport(f);
      }
    });

    if (validAudio.length === 0 && files.length > 0) {
      showError('No valid audio files found.');
    }

    stagedAudio = [...stagedAudio, ...validAudio];
    matchAndRender();
  }

  /**
   * Automatically match audio files with TTML files by name.
   */
  function matchAndRender() {
    clearError();
    
    stagedAudio.forEach(item => {
      const baseName = item.file.name.replace(/\.[^/.]+$/, "");
      
      // Look for a matching TTML if not already matched
      if (!item.ttmlFile) {
        const match = stagedTTML.find(tf => tf.name.replace(/\.[^/.]+$/, "") === baseName);
        if (match) item.ttmlFile = match;
      }
    });

    renderQueue();
    checkReady();
  }

  function renderQueue() {
    queueList.innerHTML = '';
    
    if (stagedAudio.length > 0) {
      queuePreview.classList.add('active');
      queueCount.textContent = `${stagedAudio.length} track${stagedAudio.length > 1 ? 's' : ''}`;
    } else {
      queuePreview.classList.remove('active');
    }

    stagedAudio.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'queue-item';
      el.draggable = true;
      el.dataset.index = index;

      // TTML Options
      let ttmlOptions = '<option value="">⏳ Auto-fetch lyrics</option>';
      stagedTTML.forEach((tf, tfIdx) => {
        const isSelected = item.ttmlFile === tf;
        ttmlOptions += `<option value="${tfIdx}" ${isSelected ? 'selected' : ''}>${tf.name}</option>`;
      });

      el.innerHTML = `
        <div class="drag-handle">≡</div>
        <div class="queue-item-info">
          <span class="queue-item-name">${item.file.name}</span>
          <span class="queue-item-meta">${item.artist || 'Unknown Artist'}</span>
        </div>
        <div class="queue-pair-controls">
          <select class="ttml-select" data-index="${index}">
            ${ttmlOptions}
          </select>
          <button class="remove-item" data-index="${index}">✕</button>
        </div>
      `;
      queueList.appendChild(el);

      // Drag Events
      el.addEventListener('dragstart', (e) => {
        el.classList.add('dragging');
        e.dataTransfer.setData('text/plain', index);
      });

      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });

    // Drop Logic for Reordering
    queueList.addEventListener('dragover', (e) => {
      e.preventDefault();
      const draggingEl = queueList.querySelector('.dragging');
      const afterElement = getDragAfterElement(queueList, e.clientY);
      if (afterElement == null) {
        queueList.appendChild(draggingEl);
      } else {
        queueList.insertBefore(draggingEl, afterElement);
      }
    });

    queueList.addEventListener('drop', (e) => {
      e.preventDefault();
      const newOrder = Array.from(queueList.querySelectorAll('.queue-item')).map(item => parseInt(item.dataset.index));
      const reorderedAudio = newOrder.map(idx => stagedAudio[idx]);
      stagedAudio = reorderedAudio;
      // Re-render to update indices if needed, but avoid flickering
      setTimeout(() => renderQueue(), 50); 
    });

    // Manual TTML Selection
    queueList.querySelectorAll('.ttml-select').forEach(sel => {
      sel.onchange = (e) => {
        const audioIdx = parseInt(e.target.dataset.index);
        const ttmlIdx = e.target.value;
        if (ttmlIdx === "") {
          stagedAudio[audioIdx].ttmlFile = null;
        } else {
          stagedAudio[audioIdx].ttmlFile = stagedTTML[parseInt(ttmlIdx)];
        }
      };
    });

    // Remove item logic
    queueList.querySelectorAll('.remove-item').forEach(btn => {
      btn.onclick = (e) => {
        const idx = parseInt(e.target.closest('button').dataset.index);
        stagedAudio.splice(idx, 1);
        matchAndRender();
      };
    });
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.queue-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  async function handlePlaylistImport(file) {
    const text = await readFileAsText(file);
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (ext === 'json') {
      try {
        const data = JSON.parse(text);
        if (data.tracks) {
          showError('JSON Playlist imported. Please ensure matching audio files are uploaded.');
          // Logic for JSON reordering can go here
        }
      } catch (e) {
        showError('Invalid JSON playlist.');
      }
    } else if (ext === 'm3u') {
      showError('M3U playlist detected. Ordering will follow the file list.');
      // Logic for M3U parsing can go here
    }
  }

  function checkReady() {
    if (stagedAudio.length > 0) {
      startBtn.classList.add('enabled');
      startBtn.removeAttribute('disabled');
    } else {
      startBtn.classList.remove('enabled');
      startBtn.setAttribute('disabled', 'true');
    }
  }

  clearQueueBtn.onclick = () => {
    stagedAudio = [];
    stagedTTML = [];
    matchAndRender();
  };

  // ── Start Playback ──
  startBtn.addEventListener('click', async () => {
    if (stagedAudio.length === 0) return;
    
    startBtn.textContent = 'Preparing Queue...';
    startBtn.classList.remove('enabled');
    startBtn.disabled = true;

    try {
      await clearQueue(); // Start fresh

      for (const item of stagedAudio) {
        const audioBuffer = await readFileAsArrayBuffer(item.file);
        const metadata = await parseAudioMetadata(audioBuffer, item.file.name);
        
        let ttmlContent = null;
        if (item.ttmlFile) {
          ttmlContent = await readFileAsText(item.ttmlFile);
        } else {
          ttmlContent = '__AUTO_FETCH__';
        }

        await addTrackToQueue(audioBuffer, {
          name: metadata.title || item.file.name,
          artist: metadata.artist || 'Unknown Artist',
          artUrl: metadata.artUrl || null,
          type: item.file.type || 'audio/mpeg',
          ttml: ttmlContent
        });
      }

      setCurrentIndex(0);
      window.location.href = 'player.html';
    } catch (err) {
      console.error('Queue processing failed:', err);
      showError('Failed to prepare queue: ' + err.message);
      startBtn.textContent = 'Start Playback';
      startBtn.classList.add('enabled');
      startBtn.disabled = false;
    }
  });

  // ── Helpers ──
  function showError(msg) {
    errorEl.textContent = msg;
    setTimeout(() => clearError(), 5000);
  }

  function clearError() {
    errorEl.textContent = '';
  }

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
