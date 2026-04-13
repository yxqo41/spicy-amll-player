/**
 * GeniusService.js
 * Handles fetching songwriter credits and legal names from the Genius API.
 */

const CLIENT_ACCESS_TOKEN = 'eliu4SdQ6x81--EzCKflL9jyqRGglgTRUR7WVUo5IDWrgtQpiW0baUOHyewxpqnQ';
const BASE_URL = 'https://api.genius.com';

export const GeniusService = {
  /**
   * Proxied fetch for Genius API
   */
  async fetchApi(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}access_token=${CLIENT_ACCESS_TOKEN}`;
    const proxiedUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    
    const response = await fetch(proxiedUrl, options);
    if (!response.ok) {
      throw new Error(`Genius API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Search for a song and return its ID
   */
  async searchSong(title, artist) {
    const query = `${artist} ${title}`.trim();
    if (!query) return null;

    try {
      const data = await this.fetchApi(`/search?q=${encodeURIComponent(query)}`);
      const hits = data.response.hits;
      if (hits && hits.length > 0) {
        // Find best match (usually the first one)
        return hits[0].result;
      }
    } catch (e) {
      console.error('[GeniusService] Search failed:', e);
    }
    return null;
  },

  /**
   * Fetch song details, including writer_artists
   */
  async getSongDetails(songId) {
    try {
      const data = await this.fetchApi(`/songs/${songId}`);
      return data.response.song;
    } catch (e) {
      console.error('[GeniusService] Detail fetch failed:', e);
    }
    return null;
  },

  /**
   * Try to extract "Real Names" for artists (as seen in ttml-tool-dev)
   */
  async fetchArtistRealName(artistId, stageName) {
    try {
      const data = await this.fetchApi(`/artists/${artistId}?text_format=plain`);
      const artist = data.response.artist;
      const description = artist.description.plain || "";
      const altNames = artist.alternate_names || [];

      // Extraction Logic from ttml-tool-dev
      const bornMatch = description.match(/born\s+([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+){1,4})/);
      const realNameMatch = description.match(/real\s+name\s+(?:is\s+)?([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+){1,4})/i);

      if (bornMatch) return bornMatch[1];
      if (realNameMatch) return realNameMatch[1];

      // Fallback to alternate names filtering
      const forbiddenPrefixes = ["King ", "The ", "Mr. ", "aka ", "alias ", "DJ "];
      const potentialNames = altNames.filter(name => {
        const isNotStageName = !name.toLowerCase().includes(stageName.toLowerCase()) &&
                               !stageName.toLowerCase().includes(name.toLowerCase());
        const hasGoodWordCount = name.split(" ").length >= 2 && name.split(" ").length <= 4;
        const noForbiddenPrefix = !forbiddenPrefixes.some(p => name.startsWith(p));
        const isCapitalized = name.split(" ").every(word => /^[A-Z]/.test(word));
        return isNotStageName && hasGoodWordCount && noForbiddenPrefix && isCapitalized;
      });

      if (potentialNames.length > 0) {
        return potentialNames.sort((a, b) => a.length - b.length)[0];
      }
    } catch (e) {
      console.warn(`[GeniusService] Failed to fetch real name for ${stageName}:`, e);
    }
    return stageName;
  },

  /**
   * Main entry point to get songwriters for a track
   * @param {object} metadata - Current track metadata {title, artist}
   * @param {string[]} existingWriters - Current writers from TTML
   * @returns {Promise<string[]>} Improved list of writers
   */
  async fetchCredits(metadata, existingWriters = []) {
    const result = await this.searchSong(metadata.title, metadata.artist);
    if (!result) return existingWriters;

    const song = await this.getSongDetails(result.id);
    if (!song) return existingWriters;

    const geniusWriters = song.writer_artists || [];
    
    // User Requirement: If Genius has MORE songwriters, ignore TTML's and use Genius's
    if (geniusWriters.length > existingWriters.length) {
      console.log(`[GeniusService] Genius has more writers (${geniusWriters.length}) than TTML (${existingWriters.length}). Overriding.`);
      
      const names = [];
      for (const artist of geniusWriters) {
        // Attempt to fetch real name like ttml-tool-dev
        const realName = await this.fetchArtistRealName(artist.id, artist.name);
        names.push(realName);
      }
      return names;
    }

    return existingWriters;
  }
};
