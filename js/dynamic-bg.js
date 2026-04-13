/**
 * Spicy AMLL Player WEB — Dynamic Background
 * Extracts colors from images and creates animated backgrounds.
 */

/**
 * Extract dominant colors from an image element or URL.
 * @param {string} imageUrl
 * @returns {Promise<{vibrant: number[], dark: number[], muted: number[]}>}
 */
export async function extractColors(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(img, 0, 0, size, size);

      const imageData = ctx.getImageData(0, 0, size, size).data;
      const colors = [];

      for (let i = 0; i < imageData.length; i += 16) {
        colors.push([imageData[i], imageData[i + 1], imageData[i + 2]]);
      }

      // Sort by saturation * brightness to find vibrant colors
      colors.sort((a, b) => {
        const satA = getColorSaturation(a);
        const satB = getColorSaturation(b);
        return satB - satA;
      });

      resolve({
        vibrant: colors[0] || [80, 80, 80],
        dark: darkenColor(colors[Math.floor(colors.length * 0.6)] || [30, 30, 30], 0.4),
        muted: colors[Math.floor(colors.length * 0.3)] || [60, 60, 60],
      });
    };
    img.onerror = () => {
      resolve({
        vibrant: [80, 80, 80],
        dark: [20, 20, 20],
        muted: [50, 50, 50],
      });
    };
    img.src = imageUrl;
  });
}

function getColorSaturation(rgb) {
  const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

function darkenColor(rgb, amount) {
  return rgb.map(c => Math.floor(c * amount));
}

/**
 * Apply a legacy animated background to the page.
 * @param {HTMLElement} bgContainer - The .spicy-dynamic-bg element
 * @param {{vibrant: number[], dark: number[], muted: number[]}} colors
 */
export function applyLegacyBackground(bgContainer, colors) {
  bgContainer.classList.add('LegacyBackground');
  bgContainer.innerHTML = '';

  const front = document.createElement('div');
  front.classList.add('Front');
  front.style.background = `radial-gradient(circle, rgb(${colors.vibrant.join(',')}) 0%, transparent 70%)`;

  const back = document.createElement('div');
  back.classList.add('Back');
  back.style.background = `radial-gradient(circle, rgb(${colors.dark.join(',')}) 0%, transparent 70%)`;

  const backCenter = document.createElement('div');
  backCenter.classList.add('BackCenter');
  backCenter.style.background = `radial-gradient(circle, rgb(${colors.muted.join(',')}) 0%, transparent 70%)`;

  bgContainer.appendChild(front);
  bgContainer.appendChild(back);
  bgContainer.appendChild(backCenter);
}

/**
 * Apply a simple color gradient background.
 * @param {HTMLElement} bgContainer
 * @param {{vibrant: number[], dark: number[]}} colors
 */
export function applyColorBackground(bgContainer, colors) {
  bgContainer.classList.add('ColorBackground');
  bgContainer.style.setProperty('--MinContrastColor', colors.dark.join(', '));
  bgContainer.style.setProperty('--HighContrastColor', colors.vibrant.map(c => Math.floor(c * 0.3)).join(', '));
}

/**
 * Create a default dark background when no image is available.
 * @param {HTMLElement} bgContainer
 */
export function applyDefaultBackground(bgContainer) {
  bgContainer.classList.add('ColorBackground');
  bgContainer.style.setProperty('--MinContrastColor', '18, 18, 18');
  bgContainer.style.setProperty('--HighContrastColor', '8, 8, 8');
}
