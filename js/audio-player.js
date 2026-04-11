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
    this.onTimeUpdate = null;
    this.onLoadedMetadata = null;
    this.onEnded = null;

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration * 1000; // ms
      if (this.onLoadedMetadata) this.onLoadedMetadata(this.duration);
    });

    this.audio.addEventListener('ended', () => {
      if (this.repeatMode === 2) {
        // Repeat One
        this.seek(0);
        this.play();
      } else if (this.repeatMode === 1) {
        // Repeat All (Same as One for single file)
        this.seek(0);
        this.play();
      } else {
        this.isPlaying = false;
        if (this.onEnded) this.onEnded();
      }
    });

    this.repeatMode = 0; // 0: None, 1: All, 2: One
    this.shuffleActive = false;
  }

  /**
   * Load an audio file from a File object.
   * @param {File} file
   */
  loadFile(file) {
    const url = URL.createObjectURL(file);
    this.audio.src = url;
    this.audio.load();
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
    this.audio.currentTime = ms / 1000;
  }

  play() {
    this.audio.play();
    this.isPlaying = true;
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
    return this.isPlaying;
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
    const totalSeconds = Math.floor(Math.abs(ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return negative ? `-${formatted}` : formatted;
  }
}
