/**
 * Spicy AMLL Player — Media Session & Wake Lock Integration
 * Manages navigator.mediaSession (for native OS media controls)
 * and navigator.wakeLock (to keep the screen on during playback).
 */

export class MediaSessionManager {
  constructor(player, nextTrackFn, prevTrackFn) {
    this.player = player;
    this.wakeLock = null;
    this.animationFrameId = null;
    this.videoElement = null;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    
    // Throttle frame extraction to save CPU (e.g. 10fps is enough for thumbnail)
    this.lastFrameTime = 0;
    this.frameThrottleMs = 100; 

    // Setup action handlers for system play/pause/prev/next buttons
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => {
        this.player.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        this.player.pause();
      });
      if (prevTrackFn) {
        navigator.mediaSession.setActionHandler('previoustrack', prevTrackFn);
      }
      if (nextTrackFn) {
        navigator.mediaSession.setActionHandler('nexttrack', nextTrackFn);
      }
    }

    // Attach to player events for WakeLock and playbackState
    this.player.onPlay = this._wrapCallback(this.player.onPlay, async () => {
      this.updatePlaybackState('playing');
      await this.requestWakeLock();
    });

    this.player.onPause = this._wrapCallback(this.player.onPause, () => {
      this.updatePlaybackState('paused');
      this.releaseWakeLock();
    });

    this.player.onEnded = this._wrapCallback(this.player.onEnded, () => {
      this.updatePlaybackState('paused');
      this.releaseWakeLock();
    });

    // Re-request wake lock if visibility changes (browser requirement)
    document.addEventListener('visibilitychange', async () => {
      if (this.wakeLock !== null && document.visibilityState === 'visible' && this.player.isPlaying) {
        await this.requestWakeLock();
      }
    });
  }

  // Helper to wrap existing player event callbacks so we don't overwrite them
  _wrapCallback(originalCallback, newCallback) {
    return (...args) => {
      newCallback();
      if (originalCallback) originalCallback(...args);
    };
  }

  /**
   * Update the system MediaMetadata (Title, Artist, Album, Image)
   */
  updateMetadata(title, artist, album, artUrl) {
    if (!('mediaSession' in navigator)) return;

    this.stopAnimatedArtworkSync(); // Stop any active video sync when metadata changes completely

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || 'Unknown Title',
      artist: artist || 'Unknown Artist',
      album: album || 'Unknown Album',
      artwork: artUrl ? [
        { src: artUrl, sizes: '512x512', type: 'image/jpeg' }
      ] : []
    });
    
    // Cache the base info so we can update artwork later without losing text
    this.currentMeta = { title, artist, album };
  }

  updatePlaybackState(state) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state; // 'playing' or 'paused'
    }
  }

  /**
   * Keep the screen awake during playback
   */
  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
      console.log('[MediaSessionManager] Wake Lock request failed:', err.name, err.message);
    }
  }

  releaseWakeLock() {
    if (this.wakeLock !== null) {
      this.wakeLock.release().then(() => {
        this.wakeLock = null;
      });
    }
  }

  /**
   * Experimental: Sync a <video> element's frames to the Media Session artwork.
   * This effectively makes the OS media notification show a playing video.
   */
  startAnimatedArtworkSync(videoEl) {
    if (!('mediaSession' in navigator) || !videoEl) return;
    
    this.stopAnimatedArtworkSync();
    this.videoElement = videoEl;
    
    // Scale down rendering resolution to save memory/CPU for data URLs
    this.canvas.width = 256;
    this.canvas.height = 256;

    const renderLoop = (timestamp) => {
      if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) {
        // Only draw when video is actually playing, else just wait
        this.animationFrameId = requestAnimationFrame(renderLoop);
        return;
      }

      if (timestamp - this.lastFrameTime >= this.frameThrottleMs) {
        // Draw video frame to offscreen canvas
        this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
        
        try {
          // Convert canvas back to image and update Media Session
          const dataUrl = this.canvas.toDataURL('image/jpeg', 0.5); // Lower quality for perf
          
          if (navigator.mediaSession.metadata && this.currentMeta) {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: this.currentMeta.title || 'Unknown Title',
              artist: this.currentMeta.artist || 'Unknown Artist',
              album: this.currentMeta.album || 'Unknown Album',
              artwork: [
                { src: dataUrl, sizes: '256x256', type: 'image/jpeg' }
              ]
            });
          }
          this.lastFrameTime = timestamp;
          this.animationFrameId = requestAnimationFrame(renderLoop);
        } catch (err) {
          console.warn('[MediaSessionManager] Tainted canvas, cannot export video frames for artwork:', err);
          this.stopAnimatedArtworkSync(); // Abort the loop cleanly
          return;
        }
      } else {
        this.animationFrameId = requestAnimationFrame(renderLoop);
      }
    };

    this.animationFrameId = requestAnimationFrame(renderLoop);
  }

  stopAnimatedArtworkSync() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.videoElement = null;
  }
}
