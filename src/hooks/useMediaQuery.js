/**
 * @file useMediaQuery.js
 * @description Subscribes to a CSS media query from JavaScript.
 */

import { useSyncExternalStore } from 'react'

/**
 * Tracks whether a media query currently matches.
 *
 * Built on `useSyncExternalStore` so the first render already has the right
 * answer — a `resize` listener would report desktop for one frame on a phone,
 * which is long enough to render the wrong layout and flash it.
 *
 * @param {string} query - A media query, e.g. `(max-width: 767px)`.
 * @returns {boolean} True while the query matches.
 */
export function useMediaQuery(query) {
  const subscribe = (onChange) => {
    const list = window.matchMedia(query)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false, // Server-side and pre-hydration: assume the desktop layout.
  )
}

/**
 * Whether the viewer has asked the system to reduce motion.
 * @returns {boolean} True when animations should be suppressed.
 */
export function usePrefersReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
