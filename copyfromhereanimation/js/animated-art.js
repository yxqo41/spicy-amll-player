/**
 * Spicy AMLL Player WEB — Animated Artwork
 * Fetches animated (video) album art from Apple Music via iTunes search + Dodson proxy.
 * Based on the animated-art-test implementation.
 */
import { robustFetch } from './network-utils.js';

const DODSON_PROXY = 'https://clients.dodoapps.io/playlist-precis/playlist-artwork.php';

/**
 * Search iTunes for an album and return the Apple Music collection URL.
 * Searches with artist name for accurate results.
 * @param {string} query - Search query (usually "artist album" or "artist title")
 * @returns {Promise<string|null>} Apple Music collection URL or null
 */
async function searchiTunes(query) {
  try {
    const encoded = encodeURIComponent(query);
    const res = await robustFetch(`https://itunes.apple.com/search?term=${encoded}&entity=album&limit=5`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;

    return data.results[0].collectionViewUrl || null;
  } catch (err) {
    console.warn('[AnimatedArt] iTunes search failed:', err);
    return null;
  }
}

/**
 * Fetch animated artwork URL from Apple Music via the Dodson proxy.
 * @param {string} appleMusicUrl - Apple Music album/song URL
 * @returns {Promise<string|null>} Video URL or null
 */
async function fetchAnimatedArtUrl(appleMusicUrl) {
  try {
    const params = new URLSearchParams();
    params.append('url', appleMusicUrl);
    params.append('animation', 'true');

    const res = await fetch(DODSON_PROXY, {
      method: 'POST',
      body: params,
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.animatedUrl1080 || data.animatedUrl || null;
  } catch (err) {
    console.warn('[AnimatedArt] Dodson proxy request failed:', err);
    return null;
  }
}

/**
 * Try to fetch animated cover art for a song.
 * Searches with artist + album, falling back to artist + title if album search fails.
 * @param {string} artist - Artist name
 * @param {string} album - Album name
 * @param {string} [title] - Song title (used as fallback search)
 * @returns {Promise<string|null>} Video URL for animated artwork, or null
 */
export async function getAnimatedArtwork(artist, album, title) {
  if (!artist) return null;

  // Strategy 1: Search with "artist album"
  if (album) {
    console.log(`[AnimatedArt] Searching: "${artist} ${album}"`);
    const url = await searchiTunes(`${artist} ${album}`);
    if (url) {
      console.log(`[AnimatedArt] Found Apple Music URL via album: ${url}`);
      const videoUrl = await fetchAnimatedArtUrl(url);
      if (videoUrl) {
        console.log(`[AnimatedArt] Animated artwork found!`);
        return videoUrl;
      }
    }
  }

  // Strategy 2: Fallback to "artist title" if album search failed or no album
  if (title && title !== album) {
    console.log(`[AnimatedArt] Album search failed, trying: "${artist} ${title}"`);
    const url = await searchiTunes(`${artist} ${title}`);
    if (url) {
      console.log(`[AnimatedArt] Found Apple Music URL via title: ${url}`);
      const videoUrl = await fetchAnimatedArtUrl(url);
      if (videoUrl) {
        console.log(`[AnimatedArt] Animated artwork found via title fallback!`);
        return videoUrl;
      }
    }
  }

  // Strategy 3: Try just artist name as last resort
  console.log(`[AnimatedArt] Trying artist-only search: "${artist}"`);
  const url = await searchiTunes(artist);
  if (url) {
    const videoUrl = await fetchAnimatedArtUrl(url);
    if (videoUrl) {
      console.log(`[AnimatedArt] Animated artwork found via artist-only!`);
      return videoUrl;
    }
  }

  console.log('[AnimatedArt] No animated artwork found after all strategies');
  return null;
}

/**
 * Apply animated artwork to the album art container.
 * @param {HTMLElement} mediaBoxEl - The .MediaImageContainer element
 * @param {string} videoUrl - The animated artwork video URL
 */
export function applyAnimatedArt(mediaBoxEl, videoUrl) {
  if (!mediaBoxEl || !videoUrl) return;

  // Remove any existing video
  const existingVideo = mediaBoxEl.querySelector('.animated-art-video');
  if (existingVideo) existingVideo.remove();

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.classList.add('animated-art-video');
  video.src = videoUrl;
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('disablepictureinpicture', '');

  // Hide the static background image when video loads
  video.addEventListener('loadeddata', () => {
    mediaBoxEl.style.backgroundImage = 'none';
    video.classList.add('loaded');
  });

  video.addEventListener('error', () => {
    console.warn('[AnimatedArt] Video failed to load');
    video.remove();
  });

  mediaBoxEl.appendChild(video);
}
