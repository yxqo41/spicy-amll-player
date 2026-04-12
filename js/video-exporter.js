/**
 * Spicy Lyrics Web — Video Exporter
 * Orchestrates the MediaRecorder and VideoRenderer to export high-quality videos.
 */

import VideoRenderer from './video-renderer.js';
import { settingsManager } from './settings-manager.js';
import AudioPlayer from './audio-player.js';

export default class VideoExporter {
  constructor(audioPlayer) {
    this.audioPlayer = audioPlayer;
    this.renderer = new VideoRenderer();
    this.recorder = null;
    this.chunks = [];
    this.isRecording = false;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.recordingOverlay = null;
  }

  async startExport(metadata) {
    if (this.isRecording) return;
    
    const orientation = settingsManager.get('videoExportOrientation');
    const resolution = settingsManager.get('videoExportResolution');
    
    // Set dimensions
    const scale = resolution === '1080p' ? 1 : 0.66;
    if (orientation === 'Vertical') {
      this.canvas.width = 1080 * scale;
      this.canvas.height = 1920 * scale;
    } else {
      this.canvas.width = 1920 * scale;
      this.canvas.height = 1080 * scale;
    }

    await this.renderer.init(metadata.albumArtUrl);
    
    // Show Overlay
    this.showOverlay();
    
    // Setup Audio Capture
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaElementSource(this.audioPlayer.audio);
    const dest = audioContext.createMediaStreamDestination();
    source.connect(dest);
    source.connect(audioContext.destination); // For real-time monitoring
    
    // Setup Video Stream
    const videoStream = this.canvas.captureStream(60); 
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    this.recorder = new MediaRecorder(combinedStream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 8000000 // 8 Mbps
    });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.onstop = () => {
      this.finishExport(metadata.title);
    };

    // Prepare for start
    this.audioPlayer.seek(0);
    this.chunks = [];
    this.isRecording = true;
    
    this.recorder.start();
    this.audioPlayer.play();
    
    this.renderLoop(metadata, orientation);
  }

  renderLoop(metadata, orientation) {
    if (!this.isRecording) return;

    const time = this.audioPlayer.getPosition();
    const duration = this.audioPlayer.duration;
    
    this.renderer.drawFrame(this.ctx, time, this.canvas.width, this.canvas.height, metadata, { orientation: orientation.toLowerCase() });
    
    // Update progress in overlay
    if (this.recordingOverlay) {
        const pct = Math.min((time / duration) * 100, 100);
        this.recordingOverlay.querySelector('.progress-fill').style.width = `${pct}%`;
        this.recordingOverlay.querySelector('.progress-text').textContent = `Rendering... ${Math.round(pct)}%`;
    }

    if (time >= duration || this.audioPlayer.audio.ended) {
      this.stopExport();
    } else {
      requestAnimationFrame(() => this.renderLoop(metadata, orientation));
    }
  }

  stopExport() {
    if (!this.isRecording) return;
    this.isRecording = false;
    this.audioPlayer.pause();
    this.recorder.stop();
  }

  finishExport(title) {
    const blob = new Blob(this.chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'lyrics'}_video.webm`;
    a.click();
    
    this.hideOverlay();
    alert('Export completed! Your video has been downloaded.');
  }

  showOverlay() {
    this.recordingOverlay = document.createElement('div');
    this.recordingOverlay.className = 'recording-overlay';
    this.recordingOverlay.innerHTML = `
      <div class="recording-modal">
        <div class="spinner"></div>
        <div class="progress-text">Preparing renderer...</div>
        <div class="progress-bar-container">
          <div class="progress-fill"></div>
        </div>
        <p>Please do not close this tab or interact with the page.</p>
        <button class="cancel-render-btn">Cancel Render</button>
      </div>
    `;
    
    document.body.appendChild(this.recordingOverlay);
    
    this.recordingOverlay.querySelector('.cancel-render-btn').onclick = () => {
        if (confirm('Are you sure you want to cancel the render?')) {
            this.stopExport();
            this.hideOverlay();
        }
    };

    // Add CSS for the overlay dynamically
    if (!document.getElementById('recording-styles')) {
        const style = document.createElement('style');
        style.id = 'recording-styles';
        style.textContent = `
            .recording-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.95);
                backdrop-filter: blur(20px);
                z-index: 100000;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
                font-family: inherit;
            }
            .recording-modal {
                background: rgba(255,255,255,0.05);
                padding: 40px;
                border-radius: 24px;
                text-align: center;
                max-width: 400px;
                width: 90%;
            }
            .progress-bar-container {
                width: 100%;
                height: 8px;
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
                margin: 20px 0;
                overflow: hidden;
            }
            .progress-fill {
                height: 100%;
                background: #30d158;
                width: 0%;
                transition: width 0.1s linear;
            }
            .cancel-render-btn {
                background: rgba(255,50,50,0.15);
                border: 1px solid rgba(255,50,50,0.3);
                color: #ff5a5a;
                padding: 10px 20px;
                border-radius: 8px;
                cursor: pointer;
                margin-top: 20px;
                font-size: 14px;
                font-weight: 600;
            }
            .spinner {
                width: 40px;
                height: 40px;
                border: 4px solid rgba(255,255,255,0.1);
                border-top-color: #30d158;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 20px;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }
  }

  hideOverlay() {
    if (this.recordingOverlay) {
        this.recordingOverlay.remove();
        this.recordingOverlay = null;
    }
  }
}
