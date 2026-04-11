/**
 * Spicy Lyrics Web — Animated Artwork
 * Fetches animated (video) album art from Apple Music via iTunes search + Dodson proxy.
 * Based on the animated-art-test implementation.
 */

const DODSON_PROXY = 'https://clients.dodoapps.io/playlist-precis/playlist-artwork.php';

/**
 * Search iTunes for an album and return the Apple Music collection URL.
 * @param {string} artist
 * @param {string} album
 * @returns {Promise<string|null>} Apple Music collection URL or null
 */
async function searchiTunesAlbum(artist, album) {
  try {
    const query = encodeURIComponent(`${artist} ${album}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=album&limit=5`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;

    return data.results[0].collectionViewUrl || null;
  } catch (err) {
    console.warn('iTunes search failed:', err);
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
    console.warn('Dodson proxy request failed:', err);
    return null;
  }
}

/**
 * Try to fetch animated cover art for a song.
 * @param {string} artist - Artist name
 * @param {string} album - Album name
 * @returns {Promise<string|null>} Video URL for animated artwork, or null
 */
export async function getAnimatedArtwork(artist, album) {
  if (!artist || !album) return null;

  console.log(`[AnimatedArt] Searching for animated artwork: ${artist} — ${album}`);

  const appleMusicUrl = await searchiTunesAlbum(artist, album);
  if (!appleMusicUrl) {
    console.log('[AnimatedArt] No Apple Music URL found');
    return null;
  }

  console.log(`[AnimatedArt] Found Apple Music URL: ${appleMusicUrl}`);

  const videoUrl = await fetchAnimatedArtUrl(appleMusicUrl);
  if (!videoUrl) {
    console.log('[AnimatedArt] No animated artwork available for this album');
    return null;
  }

  console.log(`[AnimatedArt] Animated artwork found!`);
  return videoUrl;
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
