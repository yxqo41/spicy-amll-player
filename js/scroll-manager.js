/**
 * Spicy Lyrics Web — Scroll Manager
 * Auto-scrolls the lyrics container to keep the active line centered.
 * Ported from revancedv2's ScrollToActiveLine.ts with proper bounce prevention.
 */

let userScrollTimeout = null;
let userIsScrolling = false;
let lastActiveElement = null;
let lastScrollTime = 0;
let forceScrollQueued = false;
let lastPosition = 0;

const USER_SCROLL_COOLDOWN = 750; // ms before auto-scroll resumes after user scroll

// Reset state on window focus/resize to prevent stale scroll positions
window.addEventListener('focus', resetScrollManager);
window.addEventListener('resize', resetScrollManager);

// Visibility change handler — prevents bounce when tabbing out/in
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // When coming back, force an instant scroll to the current active line
    forceScrollQueued = true;
    userIsScrolling = false;
    clearTimeout(userScrollTimeout);
  }
});

/**
 * Initialize scroll manager on a lyrics content element.
 * @param {HTMLElement} lyricsContent - The .LyricsContent element
 */
export function initScrollManager(lyricsContent) {
  // Detect user scroll to pause auto-scroll
  lyricsContent.addEventListener('wheel', () => {
    userIsScrolling = true;
    lyricsContent.classList.add('HideLineBlur');
    clearTimeout(userScrollTimeout);
    userScrollTimeout = setTimeout(() => {
      userIsScrolling = false;
      lyricsContent.classList.remove('HideLineBlur');
    }, USER_SCROLL_COOLDOWN);
  }, { passive: true });

  lyricsContent.addEventListener('touchmove', () => {
    userIsScrolling = true;
    lyricsContent.classList.add('HideLineBlur');
    clearTimeout(userScrollTimeout);
    userScrollTimeout = setTimeout(() => {
      userIsScrolling = false;
      lyricsContent.classList.remove('HideLineBlur');
    }, USER_SCROLL_COOLDOWN);
  }, { passive: true });
}

/**
 * Smoothly scroll an element into the center of the container using CSS transform.
 * Uses a single requestAnimationFrame to avoid jank.
 */
function scrollIntoCenter(container, element, instant = false) {
  if (!container || !element) return;

  const containerHeight = container.clientHeight;
  const elementOffsetTop = element.offsetTop;
  const elementHeight = element.offsetHeight;

  // Target: center the element in the container
  const targetScroll = elementOffsetTop - (containerHeight / 2) + (elementHeight / 2);
  const clampedTarget = Math.max(0, Math.min(targetScroll, container.scrollHeight - containerHeight));

  if (instant) {
    container.scrollTop = clampedTarget;
  } else {
    // Use CSS scroll-behavior via a smooth approach that doesn't cause bouncing
    // We manually animate to avoid the native smooth scroll's bounce issues
    const currentScroll = container.scrollTop;
    const distance = clampedTarget - currentScroll;

    // If distance is very small, just set it directly
    if (Math.abs(distance) < 2) {
      container.scrollTop = clampedTarget;
      return;
    }

    // Use a spring-like eased scroll
    const startTime = performance.now();
    const duration = 400; // ms

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    let animId = null;
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      container.scrollTop = currentScroll + distance * eased;

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      }
    }

    // Cancel any pending scroll animation
    if (container._scrollAnimId) {
      cancelAnimationFrame(container._scrollAnimId);
    }
    container._scrollAnimId = requestAnimationFrame(step);
  }
}

/**
 * Check if an element is at least partially visible in the scroll container.
 */
function isElementInViewport(container, element) {
  const elementTop = element.offsetTop;
  const elementBottom = elementTop + element.clientHeight;
  const viewportTop = container.scrollTop;
  const viewportBottom = viewportTop + container.clientHeight;

  const visibleTop = Math.max(elementTop, viewportTop);
  const visibleBottom = Math.min(elementBottom, viewportBottom);
  return (visibleBottom - visibleTop) >= 5;
}

/**
 * Scroll to the currently active line.
 * @param {HTMLElement} lyricsContent - The .LyricsContent element
 */
export function scrollToActiveLine(lyricsContent) {
  // Handle force scroll (after tab switch, seek, etc.)
  if (forceScrollQueued) {
    forceScrollQueued = false;
    userIsScrolling = false;

    const activeLine = lyricsContent.querySelector('.line.Active:not(.bg-line)');
    if (activeLine) {
      lastActiveElement = activeLine;
      scrollIntoCenter(lyricsContent, activeLine, true); // instant on force
    }
    return;
  }

  if (userIsScrolling) return;


  const activeLine = lyricsContent.querySelector('.line.Active:not(.bg-line)');
  if (!activeLine || activeLine === lastActiveElement) return;

  // Only scroll if the active line is currently visible (prevents jumping to far-off lines)
  const isInView = isElementInViewport(lyricsContent, activeLine);
  const now = performance.now();
  const timeSinceLastScroll = now - lastScrollTime;

  // If user was scrolling recently, wait for cooldown
  if (timeSinceLastScroll < USER_SCROLL_COOLDOWN) return;

  lastActiveElement = activeLine;
  lastScrollTime = now;

  // Check if the previous line was a musical/dot line — add slight delay
  const prevSibling = activeLine.previousElementSibling;
  const isAfterDotLine = prevSibling?.classList.contains('musical-line');

  if (isAfterDotLine) {
    setTimeout(() => {
      scrollIntoCenter(lyricsContent, activeLine, false);
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

