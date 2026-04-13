/**
 * Spicy Lyrics Web — Audio Player
 * HTML5 Audio wrapper with position tracking and custom controls.
 */

export default class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.isPlaying = false;
    this.duration = 0;
    
    // Callbacks
    this.onLoadedMetadata = null;
    this.onEnded = null;
    this.onPlay = null;
    this.onPause = null;

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration * 1000; // ms
      if (this.onLoadedMetadata) this.onLoadedMetadata(this.duration);
    });

    this.audio.addEventListener('ended', () => {
      if (this.repeatMode === 2) {
        // Repeat One
        this.seek(0);
        this.play();
      } else {
        if (this.onEnded) this.onEnded();
      }
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      if (this.onPlay) this.onPlay();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      if (this.onPause) this.onPause();
    });

    this.repeatMode = 0; // 0: None, 1: All, 2: One
    this.shuffleActive = false;
  }

  /**
   * Set the audio source URL.
   * @param {string} url 
   */
  setSource(url) {
    const wasPlaying = this.isPlaying;
    this.audio.src = url;
    this.audio.load();
    if (wasPlaying) this.play();
  }

  /**
   * Get current playback position in milliseconds.
   * @returns {number}
   */
  getPosition() {
    return this.audio.currentTime * 1000;
  }

  /**
   * Seek to position in milliseconds.
   * @param {number} ms
   */
  seek(ms) {
    if (isNaN(ms)) return;
    this.audio.currentTime = ms / 1000;
  }

  play() {
    return this.audio.play().catch(e => console.warn("Playback failed:", e));
  }

  pause() {
    this.audio.pause();
  }

  togglePlay() {
    if (this.audio.paused) {
      this.play();
    } else {
      this.pause();
    }
    return !this.audio.paused;
  }

  setVolume(v) {
    this.audio.volume = Math.max(0, Math.min(1, v));
  }

  getVolume() {
    return this.audio.volume;
  }

  toggleRepeat() {
    this.repeatMode = (this.repeatMode + 1) % 3;
    return this.repeatMode;
  }

  toggleShuffle() {
    this.shuffleActive = !this.shuffleActive;
    return this.shuffleActive;
  }

  /**
   * Format milliseconds to mm:ss string.
   * @param {number} ms
   * @param {boolean} negative
   * @returns {string}
   */
  static formatTime(ms, negative = false) {
    if (isNaN(ms)) return "0:00";
    const totalSeconds = Math.floor(Math.abs(ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return negative ? `-${formatted}` : formatted;
  }
}
