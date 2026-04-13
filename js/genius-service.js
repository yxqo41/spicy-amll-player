/**
 * Spicy AMLL Player — Genius Service
 * Handles fetching songwriter credits and legal names from the Genius API.
 */

import { robustFetch } from './network-utils.js';

const CLIENT_ACCESS_TOKEN = 'PGbgAX_HAb8PrMmpSR5HqyYrTNZQIkqGPm_XUtdX2gjSWUizVxyp5SpDt5pziyit';
const BASE_URL = 'https://api.genius.com';

export const GeniusService = {
  /**
   * Direct fetch for Genius API using access_token query parameter.
   * api.genius.com natively supports CORS, so we don't need a proxy.
   */
  async fetchApi(endpoint, options = {}) {
    // Append the access token as a query parameter (handling existing query params)
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${BASE_URL}${endpoint}${separator}access_token=${CLIENT_ACCESS_TOKEN}`;

    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json();
    } catch (e) {
      console.error(`[GeniusService] Request failed for ${endpoint}:`, e.message);
      throw e;
    }
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
   * Try to extract "Real Names" for artists
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
   */
  async fetchCredits(metadata, existingWriters = []) {
    try {
      const result = await this.searchSong(metadata.title, metadata.artist);
      if (!result) return existingWriters;

      const song = await this.getSongDetails(result.id);
      if (!song) return existingWriters;

      const geniusWriters = song.writer_artists || [];
      if (geniusWriters.length > existingWriters.length) {
        const names = [];
        for (const artist of geniusWriters) {
          const realName = await this.fetchArtistRealName(artist.id, artist.name);
          names.push(realName);
        }
        return names;
      }
    } catch (e) {
      console.error('[GeniusService] fetchCredits failed:', e);
    }
    return existingWriters;
  }
};
