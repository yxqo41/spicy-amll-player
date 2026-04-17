/**
 * Spicy AMLL Player WEB — Lyrics Animator
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

const DotAnimations = {
  YOffsetDamping: 0.4,
  YOffsetFrequency: 1.25,
  ScaleDamping: 0.6,
  ScaleFrequency: 0.7,
  GlowDamping: 0.5,
  GlowFrequency: 1,
  OpacityDamping: 0.5,
  OpacityFrequency: 1,

  ScaleRange: [
    { Time: 0, Value: 0.75 },
    { Time: 0.7, Value: 1.05 },
    { Time: 1, Value: 1 },
  ],
  YOffsetRange: [
    { Time: 0, Value: 0 },
    { Time: 0.9, Value: -0.12 },
    { Time: 1, Value: 0 },
  ],
  GlowRange: [
    { Time: 0, Value: 0 },
    { Time: 0.6, Value: 1 },
    { Time: 1, Value: 1 },
  ],
  OpacityRange: [
    { Time: 0, Value: 0.35 },
    { Time: 0.6, Value: 1 },
    { Time: 1, Value: 1 },
  ],
};

function getSpline(range) {
  return new Spline(range.map(r => r.Time), range.map(r => r.Value));
}

const ScaleSpline = getSpline(ScaleRange);
const YOffsetSpline = getSpline(YOffsetRange);
const GlowSpline = getSpline(GlowRange);

const DotScaleSpline = getSpline(DotAnimations.ScaleRange);
const DotYOffsetSpline = getSpline(DotAnimations.YOffsetRange);
const DotGlowSpline = getSpline(DotAnimations.GlowRange);
const DotOpacitySpline = getSpline(DotAnimations.OpacityRange);

const YOffsetDamping = 0.4, YOffsetFrequency = 1.25;
const ScaleDamping = 0.6, ScaleFrequency = 0.7;
const GlowDamping = 0.5, GlowFrequency = 1;
const BlurMultiplier = 2.5;
const LetterGlowMultiplier_Opacity = 230;

const SimpleLyricsMode_LetterEffectsStrengthConfig = {
  LongerThan: 1500,
  Longer: {
    Glow: 0.4,
    YOffset: 0.45,
    Scale: 1.103,
  },
  Shorter: {
    Glow: 0.285,
    YOffset: 0.1,
    Scale: 1.09,
  },
};

function easeSinOut(x) {
  return Math.sin((x * Math.PI) / 2);
}

// ── Style Cache ──
let _styleCache = new WeakMap();
const _styleQueue = new Map();

function setStyleIfChanged(el, prop, value, epsilon = 0) {
  let map = _styleCache.get(el);
  if (!map) { map = new Map(); _styleCache.set(el, map); }
  const prev = map.get(prop);
  if (prev !== undefined) {
    const parseNum = (v) => {
      const n = parseFloat(v);
      return Number.isNaN(n) ? null : n;
    };
    const a = parseNum(prev);
    const b = parseNum(value);
    if (a !== null && b !== null) {
      if (Math.abs(a - b) <= epsilon) return;
    } else {
      if (prev === value) return;
    }
  }
  queueStyle(el, prop, value);
  map.set(prop, value);
}

function queueStyle(el, prop, value) {
  let props = _styleQueue.get(el);
  if (!props) {
    props = new Map();
    _styleQueue.set(el, props);
  }
  props.set(prop, value);
}

function flushStyleBatch() {
  if (_styleQueue.size === 0) return;
  for (const [el, props] of _styleQueue) {
    for (const [prop, value] of props) {
      el.style.setProperty(prop, value);
    }
  }
  _styleQueue.clear();
}

function promoteToGPU(el) {
  el.style.willChange = "transform, opacity, text-shadow, scale";
  el.style.backfaceVisibility = "hidden";
}

function getElementState(currentTime, startTime, endTime) {
  if (currentTime < startTime) return "NotSung";
  if (currentTime > endTime) return "Sung";
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
    Scale: new Spring(DotScaleSpline.at(0), DotAnimations.ScaleFrequency, DotAnimations.ScaleDamping),
    YOffset: new Spring(DotYOffsetSpline.at(0), DotAnimations.YOffsetFrequency, DotAnimations.YOffsetDamping),
    Glow: new Spring(DotGlowSpline.at(0), DotAnimations.GlowFrequency, DotAnimations.GlowDamping),
    Opacity: new Spring(DotOpacitySpline.at(0), DotAnimations.OpacityFrequency, DotAnimations.OpacityDamping),
  };
}

function createLetterSprings() {
  return {
    Scale: new Spring(ScaleSpline.at(0), ScaleFrequency, ScaleDamping),
    YOffset: new Spring(YOffsetSpline.at(0), YOffsetFrequency, YOffsetDamping),
    Glow: new Spring(GlowSpline.at(0), GlowFrequency, GlowDamping),
  };
}

// ── Additional Line Animation Constants ──
const LineYFrequency = 1.0, LineYDamping = 0.8;
const LineOpFrequency = 1.2, LineOpDamping = 0.9;
const LineBlurFrequency = 1.0, LineBlurDamping = 0.7;

function createLineSprings() {
  return {
    Y: new Spring(0, LineYFrequency, LineYDamping),
    Opacity: new Spring(1, LineOpFrequency, LineOpDamping),
    Blur: new Spring(0, LineBlurFrequency, LineBlurDamping),
  };
}

function updateStaggeredTargets(arr, activeIndex) {
  if (activeIndex < 0) return;

  for (let i = 0; i < arr.length; i++) {
    const line = arr[i];
    if (!line.AnimatorStoreLine) {
      line.AnimatorStoreLine = createLineSprings();
      // Initialize with plausible values if it's the first time
      const initDist = i - activeIndex;
      line.AnimatorStoreLine.Y.position = initDist * 20;
      line.AnimatorStoreLine.Opacity.position = initDist === 0 ? 1 : 0.3;
      line.AnimatorStoreLine.Blur.position = initDist === 0 ? 0 : 4;
    }

    const dist = i - activeIndex;
    const step = dist + 1;
    const delay = Math.max(0, step) * 60; // Slightly faster than source for responsiveness

    const applyTargets = () => {
      if (!line.AnimatorStoreLine) return;

      // Adaptive Y offset: instead of fixed 80px, we use a relative small offset
      // for the "settling" feel, while the ScrollManager handles the big movement.
      line.AnimatorStoreLine.Y.SetGoal(dist === 0 ? 0 : (dist > 0 ? 10 : -10));
      line.AnimatorStoreLine.Opacity.SetGoal(dist === 0 ? 1 : 0.35);

      const blurVal = dist === 0 ? 0 : Math.min(Math.abs(dist) * 2, 8);
      line.AnimatorStoreLine.Blur.SetGoal(blurVal);
    };

    if (Math.abs(dist) > 8 || delay === 0) applyTargets();
    else setTimeout(applyTargets, delay);
  }
}

let blurringLastLine = null;
let lastFrameTime = performance.now();

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

  // Pass 1: Update status classes for ALL lines
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

  // Trigger staggered targets if active index changed
  if (activeIdx !== -1 && activeIdx !== blurringLastLine) {
    updateStaggeredTargets(arr, activeIdx);
    blurringLastLine = activeIdx;
  }

  // Pass 2: Heavy Animations (Windowed Optimization)
  const searchIdx = activeIdx !== -1 ? activeIdx : (blurringLastLine || 0);
  const startIdx = Math.max(0, searchIdx - 10); // Wider window for staggered motion
  const endIdx = Math.min(arr.length, searchIdx + 15);

  for (let index = startIdx; index < endIdx; index++) {
    const line = arr[index];

    // Apply Line-level staggered animations
    if (line.AnimatorStoreLine) {
      const curY = line.AnimatorStoreLine.Y.Step(deltaTime);
      const curOp = line.AnimatorStoreLine.Opacity.Step(deltaTime);
      const curBlur = line.AnimatorStoreLine.Blur.Step(deltaTime);

      setStyleIfChanged(line.HTMLElement, "transform", `translate3d(0, ${curY.toFixed(2)}px, 0)`);
      setStyleIfChanged(line.HTMLElement, "opacity", curOp.toFixed(3));
      setStyleIfChanged(line.HTMLElement, "filter", curBlur > 0.1 ? `blur(${curBlur.toFixed(2)}px)` : 'none');
    }

    const lineActive = position >= line.StartTime && position <= line.EndTime;
    const lineSung = position > line.EndTime;


    if (!line.Syllables?.Lead) continue;

    for (let wi = 0; wi < line.Syllables.Lead.length; wi++) {
      const word = line.Syllables.Lead[wi];
      const wordActive = position >= word.StartTime && position <= word.EndTime;
      const wordSung = position > word.EndTime;
      const isDot = word.Dot;

      if (isDot) {
        // very spicy dot
        if (!word.AnimatorStore) {
          word.AnimatorStore = createDotSprings();
          word.AnimatorStore.Scale.SetGoal(DotScaleSpline.at(0), true);
          word.AnimatorStore.YOffset.SetGoal(DotYOffsetSpline.at(0), true);
          word.AnimatorStore.Glow.SetGoal(DotGlowSpline.at(0), true);
          word.AnimatorStore.Opacity.SetGoal(DotOpacitySpline.at(0), true);
          promoteToGPU(word.HTMLElement);
        }

        const pct = getProgressPercentage(position, word.StartTime, word.EndTime);
        let targetScale, targetYOffset, targetGlow, targetOpacity;

        if (wordActive) {
          targetScale = DotScaleSpline.at(pct);
          targetYOffset = DotYOffsetSpline.at(pct);
          targetGlow = DotGlowSpline.at(pct);
          targetOpacity = DotOpacitySpline.at(pct);
        } else if (wordSung) {
          targetScale = DotScaleSpline.at(1);
          targetYOffset = DotYOffsetSpline.at(1);
          targetGlow = DotGlowSpline.at(1);
          targetOpacity = DotOpacitySpline.at(1);
        } else {
          targetScale = DotScaleSpline.at(0);
          targetYOffset = DotYOffsetSpline.at(0);
          targetGlow = DotGlowSpline.at(0);
          targetOpacity = DotOpacitySpline.at(0);
        }

        word.AnimatorStore.Scale.SetGoal(targetScale);
        word.AnimatorStore.YOffset.SetGoal(targetYOffset);
        word.AnimatorStore.Glow.SetGoal(targetGlow);
        word.AnimatorStore.Opacity.SetGoal(targetOpacity);

        const curScale = word.AnimatorStore.Scale.Step(deltaTime);
        const curYOffset = word.AnimatorStore.YOffset.Step(deltaTime);
        const curGlow = word.AnimatorStore.Glow.Step(deltaTime);
        const curOpacity = word.AnimatorStore.Opacity.Step(deltaTime);

        setStyleIfChanged(
          word.HTMLElement,
          "transform",
          `translate3d(0, calc(var(--DefaultLyricsSize) * ${curYOffset ?? 0}), 0)`,
          0.001
        );
        setStyleIfChanged(word.HTMLElement, "scale", `${curScale}`, 0.001);
        setStyleIfChanged(word.HTMLElement, "opacity", `${curOpacity}`, 0.001);
        setStyleIfChanged(
          word.HTMLElement,
          "--text-shadow-blur-radius",
          `${4 + 6 * curGlow}px`,
          0.5
        );
        setStyleIfChanged(
          word.HTMLElement,
          "--text-shadow-opacity",
          `${curGlow * 90}%`,
          1
        );
        continue;
      }

      const isSimpleMode = settingsManager.get("simpleLyricsMode");

      if (isSimpleMode) {
        if (wordActive) {
          word.HTMLElement.classList.add("active");
          word.HTMLElement.classList.remove("past");
        } else if (wordSung) {
          word.HTMLElement.classList.remove("active");
          word.HTMLElement.classList.add("past");
        } else {
          word.HTMLElement.classList.remove("active", "past");
        }

        if (word.LetterGroup && word.Letters) {
          word.Letters.forEach((letter, k) => {
            const letterState = getElementState(position, letter.StartTime, letter.EndTime);
            if (letterState === "Active") {
              letter.HTMLElement.classList.add("active");
              letter.HTMLElement.classList.remove("past");
            } else if (letterState === "Sung") {
              letter.HTMLElement.classList.remove("active");
              letter.HTMLElement.classList.add("past");
            } else {
              letter.HTMLElement.classList.remove("active", "past");
            }
          });
        }
        continue;
      }

      const isScrolling = isUserScrolling();

      if (!word.AnimatorStore) {
        word.AnimatorStore = createWordSprings();
        word.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
        word.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(0), true);
        word.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
        promoteToGPU(word.HTMLElement);
      }

      const pct = getProgressPercentage(position, word.StartTime, word.EndTime);
      let targetScale, targetYOffset, targetGlow, targetGradientPos;

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

      setStyleIfChanged(word.HTMLElement, "scale", `${curScale.toFixed(4)}`);
      setStyleIfChanged(word.HTMLElement, "transform",
        `translate3d(0, calc(var(--DefaultLyricsSize) * ${curYOffset.toFixed(4)}), 0)`);

      if (!word.LetterGroup) {
        word.HTMLElement.style.setProperty("--gradient-position", `${targetGradientPos.toFixed(2)}%`);
        setStyleIfChanged(word.HTMLElement, "--text-shadow-blur-radius",
          `${(4 + 2 * curGlow).toFixed(2)}px`);
        setStyleIfChanged(word.HTMLElement, "--text-shadow-opacity",
          `${(curGlow * LetterGlowMultiplier_Opacity).toFixed(2)}%`);
      }

      if (word.LetterGroup && word.Letters) {
        let activeLetterIndex = -1;
        let activeLetterPercentage = 0;

        for (let i = 0; i < word.Letters.length; i++) {
          if (getElementState(position, word.Letters[i].StartTime, word.Letters[i].EndTime) === "Active") {
            activeLetterIndex = i;
            activeLetterPercentage = getProgressPercentage(position, word.Letters[i].StartTime, word.Letters[i].EndTime);
            break;
          }
        }

        const strength = (word.EndTime - word.StartTime) > SimpleLyricsMode_LetterEffectsStrengthConfig.LongerThan
          ? SimpleLyricsMode_LetterEffectsStrengthConfig.Longer
          : SimpleLyricsMode_LetterEffectsStrengthConfig.Shorter;

        word.Letters.forEach((letter, k) => {
          if (!letter.AnimatorStore) {
            letter.AnimatorStore = createLetterSprings();
            letter.AnimatorStore.Scale.SetGoal(ScaleSpline.at(0), true);
            letter.AnimatorStore.YOffset.SetGoal(YOffsetSpline.at(0), true);
            letter.AnimatorStore.Glow.SetGoal(GlowSpline.at(0), true);
            promoteToGPU(letter.HTMLElement);
          }

          const lstate = getElementState(position, letter.StartTime, letter.EndTime);

          let falloffY = 0;
          let falloffGlow = 0;
          if (activeLetterIndex !== -1) {
            const distance = Math.abs(k - activeLetterIndex);
            falloffY = Math.max(0, 1 / (1 + distance * 0.9));
            falloffGlow = Math.max(0, 1 / (1 + distance * 0.5));
          }

          const basePct = activeLetterIndex !== -1 ? activeLetterPercentage : (lstate === "Sung" ? 1 : 0);
          const baseScale = ScaleSpline.at(basePct) * (isSimpleMode ? strength.Scale : 1);
          const baseYOffset = YOffsetSpline.at(basePct) * (isSimpleMode ? strength.YOffset : 1);
          const baseGlow = GlowSpline.at(basePct) * (isSimpleMode ? strength.Glow : 1);

          const restingScale = ScaleSpline.at(0);
          const restingYOffset = YOffsetSpline.at(0);
          const restingGlow = GlowSpline.at(0);

          let ts = restingScale + (baseScale - restingScale) * falloffY;
          let ty = restingYOffset + (baseYOffset - restingYOffset) * falloffY;
          let tg = restingGlow + (baseGlow - restingGlow) * falloffGlow;

          if (isScrolling) ty = 0;

          let tgp = -20;
          if (lstate === "Sung") {
            tgp = 100;
          } else if (lstate === "Active") {
            tgp = -20 + 120 * easeSinOut(activeLetterPercentage);
          }

          letter.AnimatorStore.Scale.SetGoal(ts);
          letter.AnimatorStore.YOffset.SetGoal(ty);
          letter.AnimatorStore.Glow.SetGoal(tg);

          const cs = letter.AnimatorStore.Scale.Step(deltaTime);
          const cy = letter.AnimatorStore.YOffset.Step(deltaTime);
          const cg = letter.AnimatorStore.Glow.Step(deltaTime);

          setStyleIfChanged(letter.HTMLElement, "scale", `${cs.toFixed(4)}`);
          setStyleIfChanged(letter.HTMLElement, "transform",
            `translate3d(0, calc(var(--DefaultLyricsSize) * ${(cy * 2.5).toFixed(4)}), 0)`);

          setStyleIfChanged(letter.HTMLElement, "scale", `${cs.toFixed(4)}`);
          setStyleIfChanged(letter.HTMLElement, "transform",
            `translate3d(0, calc(var(--DefaultLyricsSize) * ${(cy * 2.5).toFixed(4)}), 0)`);

          letter.HTMLElement.style.setProperty("--gradient-position", `${tgp.toFixed(2)}%`);

          setStyleIfChanged(letter.HTMLElement, "--text-shadow-blur-radius",
            `${(4 + 20 * cg).toFixed(2)}px`);
          setStyleIfChanged(letter.HTMLElement, "--text-shadow-opacity",
            `${(cg * LetterGlowMultiplier_Opacity).toFixed(2)}%`);

          setStyleIfChanged(letter.HTMLElement, "--text-shadow-blur-radius",
            `${(4 + 20 * cg).toFixed(2)}px`);
          setStyleIfChanged(letter.HTMLElement, "--text-shadow-opacity",
            `${(cg * LetterGlowMultiplier_Opacity).toFixed(2)}%`);
        });
      }
    }
  }
}
flushStyleBatch();


function animateLine(position, deltaTime) {
  const arr = LyricsObject.Types.Line.Lines;
  if (!arr.length) return;

  const isSimpleMode = settingsManager.get("simpleLyricsMode");
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
      // Keep word .active in sync whenever status changes — avoids stale class
      // outside the windowed animation range
      if (isSimpleMode) {
        const wordEl = line.HTMLElement.querySelector('.word');
        if (wordEl) {
          if (isAct) wordEl.classList.add("active");
          else wordEl.classList.remove("active");
        }
      }
    }
    if (isAct) activeIdx = i;
  }

  // Trigger staggered targets if active index changed
  if (activeIdx !== -1 && activeIdx !== blurringLastLine) {
    updateStaggeredTargets(arr, activeIdx);
    blurringLastLine = activeIdx;
  }

  const searchIdx = activeIdx !== -1 ? activeIdx : (blurringLastLine || 0);
  const startIdx = Math.max(0, searchIdx - 10);
  const endIdx = Math.min(arr.length, searchIdx + 15);

  for (let index = startIdx; index < endIdx; index++) {
    const line = arr[index];

    // Apply Line-level staggered animations
    if (line.AnimatorStoreLine) {
      const curY = line.AnimatorStoreLine.Y.Step(deltaTime);
      const curOp = line.AnimatorStoreLine.Opacity.Step(deltaTime);
      const curBlur = line.AnimatorStoreLine.Blur.Step(deltaTime);

      setStyleIfChanged(line.HTMLElement, "transform", `translate3d(0, ${curY.toFixed(2)}px, 0)`);
      setStyleIfChanged(line.HTMLElement, "opacity", curOp.toFixed(3));
      setStyleIfChanged(line.HTMLElement, "filter", curBlur > 0.1 ? `blur(${curBlur.toFixed(2)}px)` : 'none');
    }

    const lineActive = position >= line.StartTime && position <= line.EndTime;
    const lineSung = position > line.EndTime;

    if (lineActive) {
      line.HTMLElement.classList.add("Active");
      line.HTMLElement.classList.remove("NotSung", "Sung");

      const pct = getProgressPercentage(position, line.StartTime, line.EndTime);

      const gradientPos = -20 + 120 * pct;

      const wordEl = line.HTMLElement.querySelector('.word');

      if (wordEl && !isSimpleMode) {
        wordEl.style.setProperty("--gradient-position", `${gradientPos}%`);
      }

      // fuck da old dot animation
      if (line.DotLine && line.Syllables?.Lead) {
        for (let i = 0; i < line.Syllables.Lead.length; i++) {
          const dot = line.Syllables.Lead[i];

          if (!dot.AnimatorStore) {
            dot.AnimatorStore = createDotSprings();
            dot.AnimatorStore.Scale.SetGoal(DotScaleSpline.at(0), true);
            dot.AnimatorStore.YOffset.SetGoal(DotYOffsetSpline.at(0), true);
            dot.AnimatorStore.Glow.SetGoal(DotGlowSpline.at(0), true);
            dot.AnimatorStore.Opacity.SetGoal(DotOpacitySpline.at(0), true);
            promoteToGPU(dot.HTMLElement);
          }

          const dotState = getElementState(position, dot.StartTime, dot.EndTime);
          const dotPercentage = getProgressPercentage(position, dot.StartTime, dot.EndTime);

          let targetScale, targetYOffset, targetGlow, targetOpacity;

          if (dotState === "Active") {
            targetScale = DotScaleSpline.at(dotPercentage);
            targetYOffset = DotYOffsetSpline.at(dotPercentage);
            targetGlow = DotGlowSpline.at(dotPercentage);
            targetOpacity = DotOpacitySpline.at(dotPercentage);
          } else if (dotState === "NotSung") {
            targetScale = DotScaleSpline.at(0);
            targetYOffset = DotYOffsetSpline.at(0);
            targetGlow = DotGlowSpline.at(0);
            targetOpacity = DotOpacitySpline.at(0);
          } else {
            // Sung
            targetScale = DotScaleSpline.at(1);
            targetYOffset = DotYOffsetSpline.at(1);
            targetGlow = DotGlowSpline.at(1);
            targetOpacity = DotOpacitySpline.at(1);
          }

          dot.AnimatorStore.Scale.SetGoal(targetScale);
          dot.AnimatorStore.YOffset.SetGoal(targetYOffset);
          dot.AnimatorStore.Glow.SetGoal(targetGlow);
          dot.AnimatorStore.Opacity.SetGoal(targetOpacity);

          const currentScale = dot.AnimatorStore.Scale.Step(deltaTime);
          const currentYOffset = dot.AnimatorStore.YOffset.Step(deltaTime);
          const currentGlow = dot.AnimatorStore.Glow.Step(deltaTime);
          const currentOpacity = dot.AnimatorStore.Opacity.Step(deltaTime);

          setStyleIfChanged(
            dot.HTMLElement,
            "transform",
            `translate3d(0, calc(var(--DefaultLyricsSize) * ${currentYOffset ?? 0}), 0)`,
            0.001
          );
          setStyleIfChanged(dot.HTMLElement, "scale", `${currentScale}`, 0.001);
          setStyleIfChanged(dot.HTMLElement, "opacity", `${currentOpacity}`, 0.001);
          setStyleIfChanged(
            dot.HTMLElement,
            "--text-shadow-blur-radius",
            `${4 + 6 * currentGlow}px`,
            0.5
          );
          setStyleIfChanged(
            dot.HTMLElement,
            "--text-shadow-opacity",
            `${currentGlow * 90}%`,
            1
          );
        }
      }
    }
  }
  flushStyleBatch();
}

/**
 * Reset animator state (call when loading new lyrics).
 */
export function resetAnimator() {
  blurringLastLine = null;
  lastFrameTime = performance.now();
  _styleCache = new WeakMap();
}