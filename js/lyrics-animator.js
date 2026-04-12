/**
 * Spicy Lyrics Web — Lyrics Animator
 * Spring-physics animation engine for word-by-word gradient and scale animation.
 * Port of LyricsAnimator.ts
 */

import Spring from './spring.js';
import Spline from './spline.js';
import { LyricsObject } from './lyrics-applyer.js';
import { isUserScrolling } from './scroll-manager.js';
import { settingsManager } from './settings-manager.js';

// ── Spline Ranges ──
const ScaleRange = [
  { Time: 0, Value: 0.95 },
  { Time: 0.7, Value: 1.025 },
  { Time: 1, Value: 1 },
];
const YOffsetRange = [
  { Time: 0, Value: 1 / 100 },
  { Time: 0.9, Value: -(1 / 60) },
  { Time: 1, Value: 0 },
];
const GlowRange = [
  { Time: 0, Value: 0 },
  { Time: 0.15, Value: 1 },
  { Time: 0.6, Value: 1 },
  { Time: 1, Value: 0 },
];
const DotScaleRange = [
  { Time: 0, Value: 0.75 },
  { Time: 0.7, Value: 1.05 },
  { Time: 1, Value: 1 },
];
const DotOpacityRange = [
  { Time: 0, Value: 0.35 },
  { Time: 0.6, Value: 1 },
  { Time: 1, Value: 1 },
];

function getSpline(range) {
  return new Spline(range.map(r => r.Time), range.map(r => r.Value));
}

const ScaleSpline = getSpline(ScaleRange);
const YOffsetSpline = getSpline(YOffsetRange);
const GlowSpline = getSpline(GlowRange);
const DotScaleSpline = getSpline(DotScaleRange);
const DotOpacitySpline = getSpline(DotOpacityRange);

// ── Spring Config ──
const YOffsetDamping = 0.4, YOffsetFrequency = 1.25;
const ScaleDamping = 0.6, ScaleFrequency = 0.7;
const GlowDamping = 0.5, GlowFrequency = 1;
const BlurMultiplier = 2.5;

// ── Style Cache ──
const _styleCache = new WeakMap();

function setStyleIfChanged(el, prop, value) {
  let map = _styleCache.get(el);
  if (!map) { map = new Map(); _styleCache.set(el, map); }
  const prev = map.get(prop);
  if (prev === value) return;
  el.style.setProperty(prop, value);
  map.set(prop, value);
}

function getElementState(currentTime, startTime, endTime) {
  if (currentTime < startTime) return "NotSung";
  if (currentTime > endTime) return "Active";
  return "Active";
}

function getProgressPercentage(currentTime, startTime, endTime) {
  if (currentTime <= startTime) return 0;
  if (currentTime >= endTime) return 1;
  return (currentTime - startTime) / (endTime - startTime);
}

function createWordSprings() {
  return {
    Scale: new Spring(ScaleSpline.at(0), ScaleFrequency, ScaleDamping),
    YOffset: new Spring(YOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
    Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
  };
}

function createDotSprings() {
  return {
    Scale: new Spring(DotScaleSpline.at(0), ScaleFrequency, ScaleDamping),
    Opacity: new Spring(DotOpacitySpline.at(0), GlowFrequency, GlowDamping),
  };
}

let blurringLastLine = null;
let lastFrameTime = performance.now();

function applyBlur(arr, activeIndex) {
  if (!arr[activeIndex]) return;
  const max = BlurMultiplier * 5 + BlurMultiplier * 0.465;

  for (let i = 0; i < arr.length; i++) {
    const el = arr[i].HTMLElement;
    const distance = Math.abs(i - activeIndex);
    const blurAmount = distance === 0 ? 0 : Math.min(BlurMultiplier * distance, max);
    const value = distance === 0 ? "0px" : `${blurAmount}px`;
    setStyleIfChanged(el, "--BlurAmount", value);
  }
}

/**
 * Main animation function — called every frame.
 * @param {number} position - Current audio position in milliseconds
 * @param {string} lyricsType - "Syllable", "Line", or "Static"
 * @param {boolean} skip - If true, only update time delta and return
 */
export function animateLyrics(position, lyricsType, skip = false) {
  const now = performance.now();
  const deltaTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  if (skip || !lyricsType || lyricsType === "None" || lyricsType === "Static") return;

  if (lyricsType === "Syllable") {
    animateSyllable(position, deltaTime);
  } else if (lyricsType === "Line") {
    animateLine(position, deltaTime);
  }
}

function animateSyllable(position, deltaTime) {
  const arr = LyricsObject.Types.Syllable.Lines;
  if (!arr.length) return;

  // Pass 1: Update status classes for ALL lines (Always Visible logic)
  // This is fast because we use a status cache to avoid redundant DOM touches.
  let activeIdx = -1;
  for (let i = 0; i < arr.length; i++) {
    const line = arr[i];
    const isAct = position >= line.StartTime && position <= line.EndTime;
    const isSung = position > line.EndTime;
    const isNot = position < line.StartTime;
    const status = isAct ? "Active" : (isSung ? "Sung" : "NotSung");

    if (line._lastAppliedStatus !== status) {
      line.HTMLElement.classList.remove("Active", "Sung", "NotSung");
      line.HTMLElement.classList.add(status);
      line._lastAppliedStatus = status;
    }
    if (isAct) activeIdx = i;
  }

  // Pass 2: Heavy Animations (Windowed Optimization)
  // Only process physics and complex CSS updates for lines near the current position.
  const searchIdx = activeIdx !== -1 ? activeIdx : (blurringLastLine || 0);
  const startIdx = Math.max(0, searchIdx - 5);
  const endIdx = Math.min(arr.length, searchIdx + 10);

  for (let index = startIdx; index < endIdx; index++) {


    const line = arr[index];
    const lineActive = position >= line.StartTime && position <= line.EndTime;
    const lineSung = position > line.EndTime;
    const lineNotSung = position < line.StartTime;

    if (lineActive) {
      if (blurringLastLine !== index) {
        applyBlur(arr, index);
        blurringLastLine = index;
      }

      if (!line.Syllables?.Lead) continue;


      for (let wi = 0; wi < line.Syllables.Lead.length; wi++) {
        const word = line.Syllables.Lead[wi];
        const wordActive = position >= word.StartTime && position <= word.EndTime;
        const wordSung = position > word.EndTime;
        const isDot = word.Dot;

        if (isDot) {
          if (!word.AnimatorStore) {
            word.AnimatorStore = createDotSprings();
          }

          const pct = getProgressPercentage(position, word.StartTime, word.EndTime);
          let targetScale, targetOpacity;

          if (wordActive) {
            targetScale = DotScaleSpline.at(pct);
            targetOpacity = DotOpacitySpline.at(pct);
          } else if (wordSung) {
            targetScale = DotScaleSpline.at(1);
            targetOpacity = DotOpacitySpline.at(1);
          } else {
            targetScale = DotScaleSpline.at(0);
            targetOpacity = DotOpacitySpline.at(0);
          }

          word.AnimatorStore.Scale.SetGoal(targetScale);
          word.AnimatorStore.Opacity.SetGoal(targetOpacity);
          const curScale = word.AnimatorStore.Scale.Step(deltaTime);
          const curOpacity = word.AnimatorStore.Opacity.Step(deltaTime);
          setStyleIfChanged(word.HTMLElement, "scale", `${curScale}`);
          setStyleIfChanged(word.HTMLElement, "opacity", `${curOpacity}`);
          continue;
        }

        const isSimpleMode = settingsManager.get("simpleLyricsMode");

        if (isSimpleMode) {
          if (wordActive || wordSung) {
            word.HTMLElement.classList.add("active");
          } else {
            word.HTMLElement.classList.remove("active");
          }
          continue;
        }

        // Regular word animation
        if (!word.AnimatorStore) {
          word.AnimatorStore = createWordSprings();
          word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
          word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(0), true);
          word.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
          // GPU Promotion
          word.HTMLElement.style.willChange = "transform, opacity, scale";
          word.HTMLElement.style.backfaceVisibility = "hidden";
        }

        const pct = getProgressPercentage(position, word.StartTime, word.EndTime);
        let targetScale, targetYOffset, targetGlow, targetGradientPos;

        const isScrolling = isUserScrolling();

        if (wordActive) {
          targetScale = ScaleSpline.at(pct);
          targetYOffset = isScrolling ? 0 : YOffsetSpline.at(pct);
          targetGlow = GlowSpline.at(pct);
          targetGradientPos = -20 + 120 * pct;
        } else if (wordSung) {
          targetScale = ScaleSpline.at(1);
          targetYOffset = isScrolling ? 0 : YOffsetSpline.at(1);
          targetGlow = GlowSpline.at(1);
          targetGradientPos = 100;
        } else {
          targetScale = ScaleSpline.at(0);
          targetYOffset = isScrolling ? 0 : YOffsetSpline.at(0);
          targetGlow = GlowSpline.at(0);
          targetGradientPos = -20;
        }

        word.AnimatorStore.Scale.SetGoal(targetScale);
        word.AnimatorStore.YOffset.SetGoal(targetYOffset);
        word.AnimatorStore.Glow.SetGoal(targetGlow);

        const curScale = word.AnimatorStore.Scale.Step(deltaTime);
        const curYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
        const curGlow = word.AnimatorStore.Glow.Step(deltaTime);

        // Batch writes with precision thresholds
        setStyleIfChanged(word.HTMLElement, "scale", `${curScale.toFixed(4)}`);
        setStyleIfChanged(word.HTMLElement, "transform",
          `translate3d(0, calc(var(--DefaultLyricsSize) * ${curYOffset.toFixed(4)}), 0)`);
        word.HTMLElement.style.setProperty("--gradient-position", `${targetGradientPos.toFixed(2)}%`);
        setStyleIfChanged(word.HTMLElement, "--text-shadow-blur-radius",
          `${(4 + 2 * curGlow).toFixed(2)}px`);
        setStyleIfChanged(word.HTMLElement, "--text-shadow-opacity",
          `${(curGlow * 185).toFixed(2)}%`);
      }
      // Class updates are already handled in Pass 1

    }
  }
}

function animateLine(position, deltaTime) {


  const arr = LyricsObject.Types.Line.Lines;
  if (!arr.length) return;

  // Pass 1: Global Status Classes
  let activeIdx = -1;
  for (let i = 0; i < arr.length; i++) {
    const line = arr[i];
    const isAct = position >= line.StartTime && position <= line.EndTime;
    const isSung = position > line.EndTime;
    const status = isAct ? "Active" : (isSung ? "Sung" : "NotSung");

    if (line._lastAppliedStatus !== status) {
      line.HTMLElement.classList.remove("Active", "Sung", "NotSung");
      line.HTMLElement.classList.add(status);
      line._lastAppliedStatus = status;
    }
    if (isAct) activeIdx = i;
  }

  // Pass 2: Animations (Windowed)
  const searchIdx = activeIdx !== -1 ? activeIdx : (blurringLastLine || 0);
  const startIdx = Math.max(0, searchIdx - 5);
  const endIdx = Math.min(arr.length, searchIdx + 10);

  for (let index = startIdx; index < endIdx; index++) {


    const line = arr[index];
    const lineActive = position >= line.StartTime && position <= line.EndTime;
    const lineSung = position > line.EndTime;
    const lineNotSung = position < line.StartTime;

    if (lineActive) {
      if (blurringLastLine !== index) {
        applyBlur(arr, index);
        blurringLastLine = index;
      }

      line.HTMLElement.classList.add("Active");
      line.HTMLElement.classList.remove("NotSung", "Sung");

      const pct = getProgressPercentage(position, line.StartTime, line.EndTime);
      const gradientPos = -20 + 120 * pct;

      // Animate gradient on the first word child
      const wordEl = line.HTMLElement.querySelector('.word');
      const isSimpleMode = settingsManager.get("simpleLyricsMode");

      if (wordEl) {
        if (isSimpleMode) {
          wordEl.classList.add("active");
        } else {
          wordEl.style.setProperty("--gradient-position", `${gradientPos}%`);
        }
      }

      // Dot animation for line mode
      if (line.DotLine && line.Syllables?.Lead) {
        for (const dot of line.Syllables.Lead) {
          if (!dot.AnimatorStore) dot.AnimatorStore = createDotSprings();

          const dpct = getProgressPercentage(position, dot.StartTime, dot.EndTime);
          const dotActive = position >= dot.StartTime && position <= dot.EndTime;
          const dotSung = position > dot.EndTime;

          let ts, to;
          if (dotActive) { ts = DotScaleSpline.at(dpct); to = DotOpacitySpline.at(dpct); }
          else if (dotSung) { ts = DotScaleSpline.at(1); to = DotOpacitySpline.at(1); }
          else { ts = DotScaleSpline.at(0); to = DotOpacitySpline.at(0); }

          dot.AnimatorStore.Scale.SetGoal(ts);
          dot.AnimatorStore.Opacity.SetGoal(to);
          setStyleIfChanged(dot.HTMLElement, "scale", `${dot.AnimatorStore.Scale.Step(deltaTime)}`);
          setStyleIfChanged(dot.HTMLElement, "opacity", `${dot.AnimatorStore.Opacity.Step(deltaTime)}`);
        }
      }
      // Class updates already handled
    }
  }
}


/**
 * Reset animator state (call when loading new lyrics).
 */
export function resetAnimator() {
  blurringLastLine = null;
  lastFrameTime = performance.now();
  _styleCache.clear = undefined; // WeakMaps auto-clean
}
