import { EQ_BANDS } from './equalizer-presets.js';

/**
 * Spicy AMLL Player — Audio Player
 * Advanced audio engine using Web Audio API and dual-channel playback
 * for EQ, gapless, and crossfading.
 */
export default class AudioPlayer {
  constructor() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);

    // Primary and Secondary Channels for Crossfading/Gapless
    this.channels = [
      this.createChannel(),
      this.createChannel()
    ];
    this.activeChannelIndex = 0;

    // EQ Setup (linked to Master Gain)
    this.eqNodes = [];
    this.setupEQ();

    this.isPlaying = false;
    this.duration = 0;
    this.crossfadeDuration = 6000; // ms
    this.gaplessMode = 'Multi-Player'; // 'Multi-Player' or 'Web Audio'
    this.audioBuffers = new Map(); // For Web Audio mode

    // Callbacks
    this.onLoadedMetadata = null;
    this.onEnded = null;
    this.onPlay = null;
    this.onPause = null;
    this.onPositionUpdate = null;

    this.repeatMode = 0; // 0: None, 1: All, 2: One
    this.shuffleActive = false;

    // Position tracking interval
    setInterval(() => {
      if (this.isPlaying && this.onPositionUpdate) {
        this.onPositionUpdate(this.getPosition());
      }
    }, 100);
  }

  createChannel() {
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    
    // Connect to Web Audio
    const source = this.audioContext.createMediaElementSource(audio);
    const gain = this.audioContext.createGain();
    
    source.connect(gain);
    // EQ and Master Gain connection happens in setSource/setupEQ
    
    audio.addEventListener('loadedmetadata', () => {
      if (this.channels[this.activeChannelIndex].audio === audio) {
        this.duration = audio.duration * 1000;
        if (this.onLoadedMetadata) this.onLoadedMetadata(this.duration);
      }
    });

    audio.addEventListener('ended', () => {
      this.handleEnded(audio);
    });

    audio.addEventListener('play', () => {
      if (this.channels[this.activeChannelIndex].audio === audio) {
        this.isPlaying = true;
        if (this.onPlay) this.onPlay();
      }
    });

    audio.addEventListener('pause', () => {
      if (this.channels[this.activeChannelIndex].audio === audio) {
        this.isPlaying = false;
        if (this.onPause) this.onPause();
      }
    });

    return { audio, source, gain };
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

    // Connect EQ chain: EQ[0] -> EQ[1] -> ... -> EQ[9] -> masterGain
    for (let i = 0; i < this.eqNodes.length - 1; i++) {
      this.eqNodes[i].connect(this.eqNodes[i + 1]);
    }
    this.eqNodes[this.eqNodes.length - 1].connect(this.masterGain);

    // Initial connection for both channels: Channel Gain -> EQ[0]
    this.channels.forEach(ch => {
      ch.gain.connect(this.eqNodes[0]);
    });
  }

  setEQGain(index, value) {
    if (this.eqNodes[index]) {
      this.eqNodes[index].gain.setTargetAtTime(value, this.audioContext.currentTime, 0.1);
    }
  }

  setSource(url) {
    const ch = this.channels[this.activeChannelIndex];
    const wasPlaying = this.isPlaying;
    
    ch.audio.src = url;
    ch.audio.load();
    ch.gain.gain.value = 1;

    if (wasPlaying) this.play();
  }

  getPosition() {
    return this.channels[this.activeChannelIndex].audio.currentTime * 1000;
  }

  seek(ms) {
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    this.channels[this.activeChannelIndex].audio.currentTime = ms / 1000;
  }

  play() {
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
    return this.channels[this.activeChannelIndex].audio.play().catch(e => console.warn("Playback failed:", e));
  }

  pause() {
    this.channels[this.activeChannelIndex].audio.pause();
  }

  togglePlay() {
    const ch = this.channels[this.activeChannelIndex].audio;
    if (ch.paused) {
      this.play();
    } else {
      this.pause();
    }
    return !ch.paused;
  }

  handleEnded(audio) {
    if (this.repeatMode === 2) {
      this.seek(0);
      this.play();
    } else {
      if (this.onEnded) this.onEnded();
    }
  }

  /**
   * Pre-loads a source into the inactive channel for gapless/crossfade.
   * Handles both Multi-Player and Web Audio modes.
   */
  async preloadNext(url) {
    if (this.gaplessMode === 'Multi-Player') {
      const inactiveIndex = (this.activeChannelIndex + 1) % 2;
      const ch = this.channels[inactiveIndex];
      ch.audio.src = url;
      ch.audio.load();
      ch.gain.gain.value = 0;
    } else {
      // Web Audio mode: Fetch and decode into buffer
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.audioBuffers.set(url, audioBuffer);
      } catch (e) {
        console.error("Failed to preload buffer:", e);
      }
    }
  }

  /**
   * Starts a crossfade to the pre-loaded next track.
   */
  async startCrossfade(nextUrl) {
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    if (this.gaplessMode === 'Multi-Player') {
      const currentCh = this.channels[this.activeChannelIndex];
      const nextIndex = (this.activeChannelIndex + 1) % 2;
      const nextCh = this.channels[nextIndex];

      const duration = this.crossfadeDuration / 1000;
      const now = this.audioContext.currentTime;

      currentCh.gain.gain.setValueAtTime(currentCh.gain.gain.value, now);
      currentCh.gain.gain.linearRampToValueAtTime(0, now + duration);

      nextCh.gain.gain.setValueAtTime(0, now);
      nextCh.gain.gain.linearRampToValueAtTime(1, now + duration);

      this.activeChannelIndex = nextIndex;
      await nextCh.audio.play();

      setTimeout(() => {
        currentCh.audio.pause();
        currentCh.audio.src = "";
      }, this.crossfadeDuration);
    } else {
      // Web Audio Mode Crossfade
      const buffer = this.audioBuffers.get(nextUrl);
      if (buffer) {
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        const gain = this.audioContext.createGain();
        source.connect(gain);
        gain.connect(this.eqNodes[0]);

        const duration = this.crossfadeDuration / 1000;
        const now = this.audioContext.currentTime;

        // Current channel fade out
        const currentCh = this.channels[this.activeChannelIndex];
        currentCh.gain.gain.setValueAtTime(currentCh.gain.gain.value, now);
        currentCh.gain.gain.linearRampToValueAtTime(0, now + duration);

        // New buffer fade in
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + duration);

        source.start(now);
        
        // This is a simplification: for true "Web Audio" mode, 
        // we'd eventually move fully away from HTMLAudioElement.
        // For now, we'll track this source.
      }
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
