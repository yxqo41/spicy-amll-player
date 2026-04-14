import { EQ_BANDS } from './equalizer-presets.js';

/**
 * Spicy AMLL Player — Audio Player
 * Simplified audio engine using Web Audio API for EQ and professional effects.
 */
export default class AudioPlayer {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);

    // Single Channel
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.source = this.audioContext.createMediaElementSource(this.audio);
    
    // EQ Setup
    this.eqNodes = [];
    this.setupEQ();

    this.isPlaying = false;
    this.duration = 0;

    // Callbacks
    this.onLoadedMetadata = null;
    this.onEnded = null;
    this.onPlay = null;
    this.onPause = null;
    this.onPositionUpdate = null;

    this.audio.addEventListener('loadedmetadata', () => {
      this.duration = this.audio.duration * 1000;
      if (this.onLoadedMetadata) this.onLoadedMetadata(this.duration);
    });

    this.audio.addEventListener('ended', () => {
      this.handleEnded();
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

    // Position tracking interval
    setInterval(() => {
      if (this.isPlaying && this.onPositionUpdate) {
        this.onPositionUpdate(this.getPosition());
      }
    }, 100);
  }

  setupEQ() {
    this.eqNodes = EQ_BANDS.map(freq => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = freq;
      filter.Q.value = 1;
      filter.gain.value = 0;
      return filter;
    });

    // Connect: source -> EQ[0] -> ... -> EQ[9] -> masterGain
    this.source.connect(this.eqNodes[0]);
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1]);
    }
    this.eqNodes[this.eqNodes.length - 1].connect(this.masterGain);
  }

  setEQGain(index, value) {
    if (this.eqNodes[index]) {
      this.eqNodes[index].gain.setTargetAtTime(value, this.audioContext.currentTime, 0.1);
    }
  }

  setSource(url) {
    const wasPlaying = this.isPlaying;
    this.audio.src = url;
    this.audio.load();
    if (wasPlaying) this.play();
  }

  getPosition() {
    return this.audio.currentTime * 1000;
  }

  seek(ms) {
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    this.audio.currentTime = ms / 1000;
  }

  play() {
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
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

  handleEnded() {
    if (this.repeatMode === 2) {
      this.seek(0);
      this.play();
    } else {
      if (this.onEnded) this.onEnded();
    }
  }

  setVolume(v) {
    this.masterGain.gain.setTargetAtTime(v, this.audioContext.currentTime, 0.1);
  }

  getVolume() {
    return this.masterGain.gain.value;
  }

  static formatTime(ms, negative = false) {
    if (isNaN(ms)) return "0:00";
    const totalSeconds = Math.floor(Math.abs(ms) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    return negative ? `-${formatted}` : formatted;
  }
}
