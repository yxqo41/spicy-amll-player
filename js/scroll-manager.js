/**
 * Spicy AMLL Player WEB — Scroll Manager
 * Auto-scrolls the lyrics container to keep the active line centered.
 * Ported from revancedv2's ScrollToActiveLine.ts with proper bounce prevention.
 */

let userScrollTimeout = null;
let userIsScrolling = false;
let lastActiveElement = null;
let lastScrollTime = 0;
let forceScrollQueued = false;
let lastPosition = 0;

const USER_SCROLL_COOLDOWN = 3000; // Increased to 3s for better free scrolling
const SNAP_BACK_THRESHOLD = 5000;  // 5s before force-snapping back if away

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

/**
 * Initialize scroll manager on a lyrics content element.
 */
export function initScrollManager(lyricsContent) {
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
}

// Spring physics state
const scrollSpring = {
  position: 0,
  velocity: 0,
  target: 0,
  rafId: null,
  lastTime: null,
  tension: 180,
  damping: 22,
  precision: 0.5,
};

/**
 * Smoothly scroll an element into the center of the container using spring physics.
 */
function scrollIntoCenter(container, element, instant = false) {
  if (!container || !element) return;

  const containerHeight = container.clientHeight;
  const elementOffsetTop = element.offsetTop;
  const elementHeight = element.offsetHeight;

  const targetScroll = elementOffsetTop - (containerHeight / 2) + (elementHeight / 2);
  const clampedTarget = Math.max(0, Math.min(targetScroll, container.scrollHeight - containerHeight));

  if (instant) {
    if (scrollSpring.rafId) {
      cancelAnimationFrame(scrollSpring.rafId);
      scrollSpring.rafId = null;
    }
    container._isInternalScroll = true;
    container.scrollTop = clampedTarget;
    scrollSpring.position = clampedTarget;
    scrollSpring.target = clampedTarget;
    scrollSpring.velocity = 0;
    requestAnimationFrame(() => { container._isInternalScroll = false; });
  } else {
    scrollSpring.target = clampedTarget;
    
    if (!scrollSpring.rafId) {
      scrollSpring.lastTime = null;
      scrollSpring.position = container.scrollTop;
      scrollSpring.rafId = requestAnimationFrame((t) => tickSpring(t, container));
    }
  }
}

function tickSpring(timestamp, container) {
  if (!container) {
    scrollSpring.rafId = null;
    return;
  }

  if (!scrollSpring.lastTime) {
    scrollSpring.lastTime = timestamp;
    scrollSpring.rafId = requestAnimationFrame((t) => tickSpring(t, container));
    return;
  }

  const dt = Math.min((timestamp - scrollSpring.lastTime) / 1000, 0.064);
  scrollSpring.lastTime = timestamp;

  const displacement = scrollSpring.position - scrollSpring.target;
  const acceleration = -scrollSpring.tension * displacement - scrollSpring.damping * scrollSpring.velocity;
  
  scrollSpring.velocity += acceleration * dt;
  scrollSpring.position += scrollSpring.velocity * dt;

  container._isInternalScroll = true;
  container.scrollTop = scrollSpring.position;

  const settled =
    Math.abs(scrollSpring.velocity) < scrollSpring.precision &&
    Math.abs(scrollSpring.position - scrollSpring.target) < scrollSpring.precision;

  if (settled) {
    container.scrollTop = scrollSpring.target;
    scrollSpring.position = scrollSpring.target;
    scrollSpring.velocity = 0;
    scrollSpring.rafId = null;
    requestAnimationFrame(() => { container._isInternalScroll = false; });
  } else {
    scrollSpring.rafId = requestAnimationFrame((t) => tickSpring(t, container));
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

  // If user scrolled far away, don't snap back as long as the song is moving
  // unless they've been idle for a long time (SNAP_BACK_THRESHOLD)
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

