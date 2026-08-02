/**
 * @file errors.js
 * @description Turns gateway errors into guidance a reader can act on.
 */

/**
 * Rules are checked in order, so the specific entitlement case is matched
 * before the generic status-code cases that would also catch it.
 */
const EXPLANATIONS = [
  {
    test: /no trial key configured/i,
    message: 'This deployment has no trial key set up. Connect your own NVIDIA key to continue.',
  },
  {
    // Checked before the generic rate-limit rule below, because the fix is
    // different: the trial is shared, so waiting may not be enough.
    test: /shared trial key/i,
    message: 'The shared trial key is busy right now. Wait a moment and try again, or connect your own NVIDIA key for full speed.',
  },
  {
    test: /not found for account|404/i,
    message: 'Your account does not have access to this model. Pick a different one from the model list — Llama, Gemma and Mistral are available on the free tier.',
  },
  {
    test: /401|403|unauthoriz|invalid.*key/i,
    message: 'The API key was rejected. Check that it is still valid at build.nvidia.com, then re-enter it.',
  },
  {
    test: /429|rate limit|too many requests/i,
    message: 'You have hit the request rate limit. Wait a few seconds, then send it again.',
  },
  {
    test: /413|too large|payload/i,
    message: 'The request was too large for this model. Try a smaller image or a shorter conversation.',
  },
  {
    test: /5\d\d|timeout|unavailable/i,
    message: 'The inference service did not respond. It may be under load — try again, or switch to another model.',
  },
  {
    test: /failed to fetch|network/i,
    message: 'The request never reached the gateway. Check your connection and try again.',
  },
]

/**
 * Explains an error in terms of what the reader should do next.
 * Unrecognised errors are returned unchanged rather than replaced with a vague
 * apology — the raw gateway message is more useful than nothing.
 *
 * @param {string} message - Error text from the API layer.
 * @returns {string} Actionable guidance, or the original message.
 */
export function explainError(message) {
  if (!message) return 'Something went wrong, with no detail from the gateway.'
  return EXPLANATIONS.find((rule) => rule.test.test(message))?.message ?? message
}
