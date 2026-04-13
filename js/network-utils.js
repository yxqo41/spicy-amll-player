/**
 * Spicy AMLL Player — Network Utilities
 * Provides a robust fetch implementation with proxy rotation and error handling.
 */

const PROXIES = [
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

/**
 * Attempts to fetch a URL through a rotation of CORS proxies.
 * @param {string} url - The target URL.
 * @param {object} options - Fetch options (headers, method, etc.)
 * @returns {Promise<Response>} The successful response.
 */
export async function robustFetch(url, options = {}) {
  let lastError = null;

  for (let i = 0; i < PROXIES.length; i++) {
    try {
      const proxiedUrl = PROXIES[i](url);
      const response = await fetch(proxiedUrl, options);
      
      if (response.ok) {
        return response;
      }
      
      const statusText = response.statusText || 'Unknown Error';
      lastError = new Error(`Proxy ${i + 1} (${new URL(proxiedUrl).hostname}) failed: ${response.status} ${statusText}`);
      console.warn(`[NetworkUtils] ${lastError.message}`);
      
      // If it's a 403 or 429, try next proxy immediately
      if (response.status === 403 || response.status === 429) continue;
      
    } catch (e) {
      lastError = e;
      console.warn(`[NetworkUtils] Proxy ${i + 1} request error:`, e.message);
    }
    
    // Subtle delay between retries
    if (i < PROXIES.length - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after trying all proxies.`);
}

/**
 * Robust fetch that automatically handles JSON parsing and errors.
 */
export async function fetchJson(url, options = {}) {
  const response = await robustFetch(url, options);
  return response.json();
}
