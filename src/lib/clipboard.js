/**
 * @file clipboard.js
 * @description Clipboard access that reports failure instead of throwing.
 */

/**
 * Copies text to the clipboard.
 *
 * The Clipboard API rejects without a user gesture, over plain HTTP, and when
 * permission is denied — all cases where the caller should show "copy failed"
 * rather than a success tick.
 *
 * @param {string} text - Content to copy.
 * @returns {Promise<boolean>} True when the copy succeeded.
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
