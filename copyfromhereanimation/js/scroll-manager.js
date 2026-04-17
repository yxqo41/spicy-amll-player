/**
 * Spicy AMLL Player WEB — Scroll Manager
 * Auto-scrolls the lyrics container to keep the active line centered.
 * Ported from revancedv2's ScrollToActiveLine.ts with proper bounce prevention.
 */

import Spring from './spring.js';

let userScrollTimeout = null;
let userIsScrolling = false;
let lastActiveElement = null;
let lastScrollTime = 0;
let forceScrollQueued = false;

const USER_SCROLL_COOLDOWN = 3000;
const SNAP_BACK_THRESHOLD = 5000;

// Scroll Spring configuration (Direct Lyrics style)
const scrollSpring = new Spring(0, 1.25, 0.85);

// Reset state on window focus/resize to prevent stale scroll positions
window.addEventListener('focus', resetScrollManager);
window.addEventListener('resize', resetScrollManager);

// Visibility change handler — prevents bounce when tabbing out/in
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    forceScrollQueued = true;
    userIsScrolling = false;
    clearTimeout(userScrollTimeout);
  }
});

let _lyricsContainer = null;

/**
 * Initialize scroll manager on a lyrics content element.
 */
export function initScrollManager(lyricsContent) {
  _lyricsContainer = lyricsContent;
  
  const markUserScroll = () => {
    userIsScrolling = true;
    lyricsContent.classList.add('HideLineBlur');
    clearTimeout(userScrollTimeout);
    userScrollTimeout = setTimeout(() => {
      userIsScrolling = false;
      lyricsContent.classList.remove('HideLineBlur');
    }, USER_SCROLL_COOLDOWN);
  };

  // Detect various user interactions
  lyricsContent.addEventListener('wheel', markUserScroll, { passive: true });
  lyricsContent.addEventListener('touchmove', markUserScroll, { passive: true });
  lyricsContent.addEventListener('mousedown', markUserScroll, { passive: true });

  // Generic scroll detection (catches scrollbar drags)
  lyricsContent._isInternalScroll = false;

  lyricsContent.addEventListener('scroll', () => {
    if (!lyricsContent._isInternalScroll) {
      markUserScroll();
    }
  }, { passive: true });

  // Initialize spring with current scroll position
  scrollSpring.position = lyricsContent.scrollTop;
  scrollSpring.goal = lyricsContent.scrollTop;
  scrollSpring.velocity = 0;
}

/**
 * Smoothly scroll an element into the center of the container.
 */
function scrollIntoCenter(container, element, instant = false) {
  if (!container || !element) return;

  const containerHeight = container.clientHeight;
  const elementOffsetTop = element.offsetTop;
  const elementHeight = element.offsetHeight;

  const targetScroll = elementOffsetTop - (containerHeight / 2) + (elementHeight / 2);
  const clampedTarget = Math.max(0, Math.min(targetScroll, container.scrollHeight - containerHeight));

  if (instant) {
    container._isInternalScroll = true;
    container.scrollTop = clampedTarget;
    scrollSpring.SetGoal(clampedTarget, true);
    requestAnimationFrame(() => { container._isInternalScroll = false; });
  } else {
    scrollSpring.SetGoal(clampedTarget);
  }
}

let lastFrameTime = performance.now();

/**
 * Tick the scroll spring. Should be called every frame.
 */
export function tickScroll() {
  if (!_lyricsContainer || userIsScrolling) return;

  const now = performance.now();
  const deltaTime = (now - lastFrameTime) / 1000;
  lastFrameTime = now;

  const oldPos = scrollSpring.position;
  const newPos = scrollSpring.Step(deltaTime);

  if (Math.abs(oldPos - newPos) > 0.1) {
    _lyricsContainer._isInternalScroll = true;
    _lyricsContainer.scrollTop = newPos;
    requestAnimationFrame(() => { _lyricsContainer._isInternalScroll = false; });
  }
}


/**
 * Check if an element is in viewport.
 */
function isElementInViewport(container, element) {
  const elementTop = element.offsetTop;
  const elementBottom = elementTop + element.clientHeight;
  const viewportTop = container.scrollTop;
  const viewportBottom = viewportTop + container.clientHeight;
  return elementBottom > viewportTop && elementTop < viewportBottom;
}

/**
 * Scroll to the currently active line.
 */
export function scrollToActiveLine(lyricsContent) {
  if (forceScrollQueued) {
    forceScrollQueued = false;
    userIsScrolling = false;
    const activeLine = lyricsContent.querySelector('.line.Active:not(.bg-line)');
    if (activeLine) {
      lastActiveElement = activeLine;
      scrollIntoCenter(lyricsContent, activeLine, true);
    }
    return;
  }

  if (userIsScrolling) return;

  const activeLine = lyricsContent.querySelector('.line.Active:not(.bg-line)');
  if (!activeLine) return;

  const now = performance.now();
  const timeSinceLastScroll = now - lastScrollTime;
  const isInView = isElementInViewport(lyricsContent, activeLine);

  if (!isInView && timeSinceLastScroll < SNAP_BACK_THRESHOLD && lastActiveElement) {
    return;
  }

  if (activeLine === lastActiveElement && isInView) return;

  lastActiveElement = activeLine;
  lastScrollTime = now;

  const prevSibling = activeLine.previousElementSibling;
  const isAfterDotLine = prevSibling?.classList.contains('musical-line');

  if (isAfterDotLine) {
    setTimeout(() => {
      if (!userIsScrolling) scrollIntoCenter(lyricsContent, activeLine, false);
    }, 240);
  } else {
    scrollIntoCenter(lyricsContent, activeLine, false);
  }
}

/**
 * Queue a force scroll for the next frame (e.g., after seeking).
 */
export function queueForceScroll() {
  forceScrollQueued = true;
}

/**
 * Reset scroll manager state.
 */
export function resetScrollManager() {
  userIsScrolling = false;
  lastActiveElement = null;
  lastScrollTime = 0;
  forceScrollQueued = false;
  clearTimeout(userScrollTimeout);
}

/**
 * Check if the user is currently scrolling.
 * @returns {boolean}
 */
export function isUserScrolling() {
  return userIsScrolling;
}



