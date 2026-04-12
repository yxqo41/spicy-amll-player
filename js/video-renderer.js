/**
 * Spicy Lyrics Web — Video Renderer
 * Implementation of a canvas-based rendering engine for exporting lyric videos.
 */

import Spring from './spring.js';
import Spline from './spline.js';
import { LyricsObject } from './lyrics-applyer.js';

// --- Replicate spline ranges from animator.js ---
const ScaleSpline = new Spline([0, 0.7, 1], [0.95, 1.025, 1]);
const YOffsetSpline = new Spline([0, 0.9, 1], [1 / 100, -(1 / 60), 0]);
const GlowSpline = new Spline([0, 0.15, 0.6, 1], [0, 1, 1, 0]);
const DotScaleSpline = new Spline([0, 0.7, 1], [0.75, 1.05, 1]);
const DotOpacitySpline = new Spline([0, 0.6, 1], [0.35, 1, 1]);

export default class VideoRenderer {
  constructor() {
    this.albumArt = null;
    this.blurredBg = null;
    this.state = {
      lines: [], // Cached state for springs
    };
  }

  /**
   * Initialize assets for the renderer.
   */
  async init(albumArtUrl) {
    if (!albumArtUrl) return;
    this.albumArt = await this.loadImage(albumArtUrl);
  }

  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Main draw call for a single frame.
   * @param {CanvasRenderingContext2D} ctx 
   * @param {number} time - current position in ms
   * @param {number} width 
   * @param {number} height 
   * @param {object} metadata - {album, artist, title}
   * @param {object} options - {orientation: 'vertical'|'horizontal'}
   */
  drawFrame(ctx, time, width, height, metadata, options = {}) {
    const isVertical = options.orientation === 'vertical';
    
    // 1. Draw Background (Blurred Cover Art)
    this.drawBackground(ctx, width, height);

    // 2. Draw Album Art & Metadata
    if (isVertical) {
      this.drawVerticalLayout(ctx, time, width, height, metadata);
    } else {
      this.drawHorizontalLayout(ctx, time, width, height, metadata);
    }
  }

  drawBackground(ctx, width, height) {
    if (!this.albumArt) {
      ctx.fillStyle = '#121212';
      ctx.fillRect(0, 0, width, height);
      return;
    }

    ctx.save();
    // Fill with dark first
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    
    // Draw blurred art
    ctx.globalAlpha = 0.6;
    ctx.filter = 'blur(60px) saturate(1.8) brightness(0.7)';
    
    // Cover fill
    const scale = Math.max(width / this.albumArt.width, height / this.albumArt.height);
    const x = (width / 2) - (this.albumArt.width / 2) * scale;
    const y = (height / 2) - (this.albumArt.height / 2) * scale;
    ctx.drawImage(this.albumArt, x, y, this.albumArt.width * scale, this.albumArt.height * scale);
    
    ctx.restore();
    
    // Vignette
    const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 1.25);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  drawVerticalLayout(ctx, time, width, height, metadata) {
    const centerX = width / 2;
    const artSize = width * 0.75;
    const artY = height * 0.1;

    // Album Art
    this.drawRoundedImage(ctx, this.albumArt, centerX - artSize / 2, artY, artSize, artSize, 20);

    // Metadata
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px Outfit, sans-serif';
    ctx.fillText(metadata.title || 'Unknown Title', centerX, artY + artSize + 50);
    
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '500 24px Outfit, sans-serif';
    ctx.fillText(metadata.artist || 'Unknown Artist', centerX, artY + artSize + 85);

    // Lyrics Area (Bottom 50%)
    this.drawLyrics(ctx, time, 40, artY + artSize + 150, width - 80, height - (artY + artSize + 150), 'center');
  }

  drawHorizontalLayout(ctx, time, width, height, metadata) {
    const artSize = height * 0.6;
    const margin = 80;
    const artX = margin;
    const artY = height / 2 - artSize / 2;

    // Album Art
    this.drawRoundedImage(ctx, this.albumArt, artX, artY, artSize, artSize, 20);

    // Metadata (below art)
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 28px Outfit, sans-serif';
    ctx.fillText(metadata.title || 'Unknown Title', artX, artY + artSize + 40);
    
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '500 20px Outfit, sans-serif';
    ctx.fillText(metadata.artist || 'Unknown Artist', artX, artY + artSize + 70);

    // Lyrics Area (Right 60%)
    const lyricsX = artX + artSize + 80;
    this.drawLyrics(ctx, time, lyricsX, margin, width - lyricsX - margin, height - 2 * margin, 'left');
  }

  drawRoundedImage(ctx, img, x, y, w, h, radius) {
    if (!img) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.clip();
    
    // Drop shadow (simulated with black rect behind clip)
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    
    // Actual Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 15;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.stroke(); // transparent stroke but shows shadow
    ctx.restore();
  }

  drawLyrics(ctx, time, x, y, width, height, align) {
    const lines = LyricsObject.Types.Syllable.Lines.length > 0 
      ? LyricsObject.Types.Syllable.Lines 
      : (LyricsObject.Types.Line.Lines.length > 0 ? LyricsObject.Types.Line.Lines : LyricsObject.Types.Static.Lines);

    
    if (!lines.length) return;

    // Find active line
    let activeIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (time >= lines[i].StartTime && time <= lines[i].EndTime) {
            activeIdx = i;
            break;
        }
        if (time < lines[i].StartTime) break;
    }

    const fontSize = 36;
    const lineHeight = fontSize * 1.3;
    const startY = y + height / 2; // Center the active line

    // Smooth scroll simulation
    // We target the active line for the center
    let scrollOffset = 0;
    if (activeIdx !== -1) {
        scrollOffset = activeIdx * lineHeight;
    } else {
        // Find nearest next line
        for(let i=0; i<lines.length; i++) {
            if (time < lines[i].StartTime) {
                const prev = i > 0 ? (i - 1) : 0;
                scrollOffset = prev * lineHeight;
                break;
            }
        }
    }

    ctx.save();
    // Clip lyrics area
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    ctx.translate(0, startY - scrollOffset);

    lines.forEach((line, i) => {
        const lineY = i * lineHeight;
        const opacity = activeIdx === i ? 1 : 0.4;
        const isPast = time > line.EndTime;
        
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.textAlign = align;
        ctx.font = `bold ${fontSize}px Outfit, sans-serif`;

        const lineText = this.getLineText(line);
        const textX = align === 'center' ? x + width / 2 : x;

        if (activeIdx === i && line.Syllables?.Lead) {
            this.drawSyllableLine(ctx, line, time, textX, lineY, fontSize, align);
        } else {
            ctx.fillStyle = isPast ? '#fff' : 'rgba(255,255,255,0.7)';
            ctx.fillText(lineText, textX, lineY);
        }
        ctx.restore();
    });

    ctx.restore();
  }

  getLineText(line) {
      if (line.Syllables?.Lead) {
          return line.Syllables.Lead.map(w => w.Text).join('');
      }
      return line.LineText || '';
  }

  drawSyllableLine(ctx, line, time, x, y, fontSize, align) {
      // Replicate the gradient filling word by word
      let currentX = x;
      if (align === 'center') {
          const totalWidth = ctx.measureText(this.getLineText(line)).width;
          currentX = x - totalWidth / 2;
      }

      line.Syllables.Lead.forEach(word => {
          const wordWidth = ctx.measureText(word.Text).width;
          const pct = Math.max(0, Math.min(1, (time - word.StartTime) / (word.EndTime - word.StartTime)));
          
          ctx.save();
          if (time >= word.StartTime) {
              // Draw active/past word with gradient fill
              const grad = ctx.createLinearGradient(currentX, 0, currentX + wordWidth, 0);
              const gradPos = Math.max(0, Math.min(1, pct * 1.5 - 0.25)); // Slightly aggressive transition
              grad.addColorStop(0, '#fff');
              grad.addColorStop(gradPos, '#fff');
              grad.addColorStop(Math.min(1, gradPos + 0.1), 'rgba(255,255,255,0.4)');
              
              ctx.fillStyle = grad;
          } else {
              ctx.fillStyle = 'rgba(255,255,255,0.4)';
          }
          
          ctx.fillText(word.Text, currentX, y);
          ctx.restore();
          
          currentX += wordWidth;
      });
  }
}
