/**
 * Spicy Lyrics Web — Router
 * Manages state transfer between upload and player pages.
 * Uses IndexedDB for audio file persistence.
 */

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

/**
 * Get audio ArrayBuffer from IndexedDB.
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function getAudioBuffer() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const store = tx.objectStore('files');
      const request = store.get('spicy_audio');
      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return null;
  }
}

/**
 * Create a blob URL from the stored audio buffer.
 * @returns {Promise<string|null>}
 */
export async function getAudioBlobUrl() {
  const buffer = await getAudioBuffer();
  if (!buffer) return null;
  const mimeType = sessionStorage.getItem('spicy_audio_type') || 'audio/mpeg';
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Check if the player page has the required data.
 * @returns {boolean}
 */
export function hasPlayerData() {
  return !!sessionStorage.getItem('spicy_ttml');
}

/**
 * Check if we're in auto-fetch mode (no TTML provided).
 * @returns {boolean}
 */
export function isAutoFetchMode() {
  return sessionStorage.getItem('spicy_ttml') === '__AUTO_FETCH__';
}

/**
 * Get the stored TTML content.
 * @returns {string|null}
 */
export function getTTMLContent() {
  const content = sessionStorage.getItem('spicy_ttml');
  if (!content || content === '__AUTO_FETCH__') return null;
  return content;
}

/**
 * Get the stored audio file name.
 * @returns {string|null}
 */
export function getAudioName() {
  return sessionStorage.getItem('spicy_audio_name');
}

/**
 * Clear all stored player data.
 */
export async function clearPlayerData() {
  sessionStorage.removeItem('spicy_ttml');
  sessionStorage.removeItem('spicy_audio_name');
  sessionStorage.removeItem('spicy_audio_type');
  try {
    const db = await openDB();
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete('spicy_audio');
  } catch { /* ignore */ }
}

/**
 * Navigate back to the upload page.
 */
export async function goToUpload() {
  await clearPlayerData();
  window.location.href = 'index.html';
}
