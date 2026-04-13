/**
 * Spicy AMLL Player WEB — Router & Queue Manager
 * Manages state transfer and queue persistence.
 * Uses IndexedDB for audio files and session storage for queue metadata.
 */

// ── IndexedDB Configuration ──
const DB_NAME = 'SpicyLyricsDB';
const DB_VERSION = 3; // Incremented for sortOrder index

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Upgrade logic for stores
      if (!db.objectStoreNames.contains('tracks')) {
        const trackStore = db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
        trackStore.createIndex('sortOrder', 'sortOrder', { unique: false });
      } else {
        // Add index if it doesn't exist
        const tx = e.target.transaction;
        const store = tx.objectStore('tracks');
        if (!store.indexNames.contains('sortOrder')) {
          store.createIndex('sortOrder', 'sortOrder', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains('buffers')) {
        db.createObjectStore('buffers');
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Save a new track to the queue.
 */
export async function addTrackToQueue(buffer, metadata) {
  const db = await openDB();
  const queue = await getQueue();
  const nextOrder = queue.length;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['tracks', 'buffers'], 'readwrite');
    const trackStore = tx.objectStore('tracks');
    const bufferStore = tx.objectStore('buffers');

    const addRequest = trackStore.add({
      name: metadata.name,
      artist: metadata.artist || 'Unknown Artist',
      artUrl: metadata.artUrl || null,
      type: metadata.type,
      ttml: metadata.ttml || null,
      sortOrder: nextOrder,
      addedAt: Date.now()
    });

    addRequest.onsuccess = (e) => {
      const id = e.target.result;
      bufferStore.put(buffer, id);
    };

    tx.oncomplete = () => resolve(addRequest.result);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get all tracks sorted by sortOrder.
 */
export async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readonly');
    const store = tx.objectStore('tracks');
    const index = store.index('sortOrder');
    const request = index.getAll(); // Retrieves sorted by index
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update the order of tracks in the database.
 * @param {Array<number>} sortedIds - Array of track IDs in the new order.
 */
export async function updateQueueOrder(sortedIds) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readwrite');
    const store = tx.objectStore('tracks');

    sortedIds.forEach((id, index) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const data = getReq.result;
        if (data) {
          data.sortOrder = index;
          store.put(data);
        }
      };
    });

    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Get specific track data (metadata + buffer)
 */
export async function getTrackData(id) {
  const db = await openDB();
  const track = await new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readonly');
    const request = tx.objectStore('tracks').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!track) return null;

  const buffer = await new Promise((resolve, reject) => {
    const tx = db.transaction('buffers', 'readonly');
    const request = tx.objectStore('buffers').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return { ...track, buffer };
}

/**
 * Clear the entire queue and all binary data.
 */
export async function clearQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['tracks', 'buffers'], 'readwrite');
    tx.objectStore('tracks').clear();
    tx.objectStore('buffers').clear();
    tx.oncomplete = () => {
      sessionStorage.removeItem('spicy_current_index');
      resolve();
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ── Legacy Compatibility / Current State Helpers ──

export function getCurrentIndex() {
  return parseInt(sessionStorage.getItem('spicy_current_index') || '0');
}

export function setCurrentIndex(index) {
  sessionStorage.setItem('spicy_current_index', index.toString());
}

export async function hasPlayerData() {
  const queue = await getQueue();
  return queue.length > 0;
}

export async function getAudioBlobUrl() {
  const queue = await getQueue();
  const index = getCurrentIndex();
  if (!queue[index]) return null;

  const data = await getTrackData(queue[index].id);
  if (!data || !data.buffer) return null;

  const blob = new Blob([data.buffer], { type: data.type });
  return URL.createObjectURL(blob);
}

export async function getTTMLContent() {
  const queue = await getQueue();
  const index = getCurrentIndex();
  return queue[index]?.ttml || null;
}

export async function getAudioName() {
  const queue = await getQueue();
  const index = getCurrentIndex();
  return queue[index]?.name || null;
}

export function isAutoFetchMode() {
  // Logic: if current track ttml is '__AUTO_FETCH__', return true
  // For now, we'll keep it simple: if ttml is missing or markers, it's auto-fetch.
  return false; // Will refine in player logic
}

export async function goToUpload() {
  await clearQueue();
  window.location.href = 'index.html';
}
