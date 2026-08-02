/**
 * @file gateway.js
 * @description Decides which gateway a request goes to, and how it is
 * authorised.
 *
 * There are two, and the active API key is what picks between them:
 *
 *   - A real `nvapi-…` key goes to `/api/nvidia/*`, a plain rewrite of the NIM
 *     gateway. The key travels in the Authorization header, from the visitor's
 *     own browser, exactly as it always has.
 *
 *   - The trial sentinel goes to `/api/trial/*`, a Netlify function that
 *     attaches the deployment's own key server-side. No credential leaves the
 *     browser, because the browser never had one.
 *
 * The sentinel is a placeholder, not a secret: it is a value the app recognises
 * and swaps for a route. Keeping the decision in one place means every caller —
 * the API client, the health probes, the per-key caches — agrees on which
 * gateway is in play without any of them having to care.
 */

/** Stands in for a key while the trial gateway supplies the real one. */
export const TRIAL_KEY = 'trial:milkyway'

/**
 * @param {string} apiKey - Active key, or the trial sentinel.
 * @returns {boolean} True when the request should use the shared trial key.
 */
export const isTrialKey = (apiKey) => apiKey === TRIAL_KEY

/**
 * @param {string} apiKey - Active key, or the trial sentinel.
 * @returns {string} Root path every request is built on.
 */
export const gatewayBase = (apiKey) => (isTrialKey(apiKey) ? '/api/trial' : '/api/nvidia')

/**
 * Builds the headers for a gateway request.
 *
 * Trial requests deliberately carry no Authorization header — the function
 * ignores one anyway, and sending an empty bearer token would only invite the
 * gateway to reject it.
 *
 * @param {string} apiKey - Active key, or the trial sentinel.
 * @returns {Record<string, string>} Header map.
 */
export const gatewayHeaders = (apiKey) =>
  isTrialKey(apiKey)
    ? { 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }
