/**
 * @file probe.js
 * @description Checks whether a model can actually be called, and classifies
 * why not when it cannot.
 *
 * The `/v1/models` endpoint returns the full public catalog — id, object,
 * created, owned_by and nothing else. It says nothing about whether *your* key
 * may call a given model, so roughly half the listed models answer a real
 * request with "Not found for account". Showing that raw list in a dropdown is
 * what makes picking a model feel like a coin flip.
 *
 * Two probes, deliberately different in cost:
 *
 * 1. `probeEntitlement` — sends a request the gateway is guaranteed to reject
 *    on validation. The gateway resolves the model *before* it validates the
 *    body, so the status code separates "your account cannot call this"
 *    (404) from "your account can, the body was just wrong" (400). No inference
 *    runs, so this costs zero tokens. Measured across a 102-model catalog it
 *    ruled out 54 models in about 20 seconds.
 *
 * 2. `probeLiveness` — a real one-token call. Confirms the model is actually
 *    serving and measures how long it takes to answer.
 *
 * Both are needed. Entitlement alone over-promises: in validation, only 10 of
 * 14 models that passed the entitlement probe answered a real request.
 */

import { gatewayBase, gatewayHeaders } from '../gateway'

/**
 * Health states, ordered from most to least usable. `rank` drives sorting in
 * the pickers, so the model most likely to answer is the one nearest the top.
 */
export const STATUS = {
  READY: 'ready',             // A real call succeeded. Latency is known.
  LIKELY: 'likely',           // Entitled; not yet confirmed by a real call.
  COLD: 'cold',               // Answers, but slowly — usually a cold start.
  DEGRADED: 'degraded',       // Failing intermittently.
  CHECKING: 'checking',       // Probe in flight.
  UNKNOWN: 'unknown',         // Never checked.
  UNSUPPORTED: 'unsupported', // Reachable, but not callable this way.
  DOWN: 'down',               // Failing consistently on the model's side.
  BLOCKED: 'blocked',         // Not available on this account.
}

/** Sort weight and presentation metadata for each state. */
export const STATUS_META = {
  [STATUS.READY]: { rank: 0, label: 'Ready', tone: 'good', usable: true },
  [STATUS.LIKELY]: { rank: 1, label: 'Available', tone: 'good', usable: true },
  [STATUS.COLD]: { rank: 2, label: 'Slow to start', tone: 'warn', usable: true },
  [STATUS.CHECKING]: { rank: 3, label: 'Checking', tone: 'muted', usable: true },
  [STATUS.UNKNOWN]: { rank: 4, label: 'Not checked', tone: 'muted', usable: true },
  [STATUS.DEGRADED]: { rank: 5, label: 'Unreliable', tone: 'warn', usable: true },
  [STATUS.DOWN]: { rank: 6, label: 'Not responding', tone: 'bad', usable: false },
  [STATUS.UNSUPPORTED]: { rank: 7, label: 'Not usable here', tone: 'bad', usable: false },
  [STATUS.BLOCKED]: { rank: 8, label: 'Not on your plan', tone: 'bad', usable: false },
}

/** True when a model in this state is worth offering to the user. */
export const isUsable = (status) => STATUS_META[status]?.usable ?? true

/**
 * A model can be slower to answer than any sane probe will wait. Timing out is
 * therefore evidence of a cold start, not of failure — in validation, a third
 * of timed-out models answered fine when given a longer budget, including the
 * app's own default chat model.
 */
const ENTITLEMENT_TIMEOUT_MS = 8000
const LIVENESS_TIMEOUT_MS = 25000

/** Above this, a model works but is worth warning about. */
export const SLOW_MS = 6000

/** Embedding and reranking models answer on a different endpoint. */
const isEmbeddingModel = (id) => /embed|rerank|retriev/i.test(id)

/**
 * Sends a request and returns its status without throwing.
 * @param {string} path - Gateway path.
 * @param {Object} body - JSON payload.
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {number} timeoutMs - Budget before giving up.
 * @param {AbortSignal} [signal] - Cancels the probe.
 * @returns {Promise<{status: number|'timeout'|'offline', ms: number, detail: string}>}
 */
async function attempt(path, body, apiKey, timeoutMs, signal) {
  const started = performance.now()
  const timeout = AbortSignal.timeout(timeoutMs)
  // Either the caller cancelling or the budget expiring should end the request.
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout

  try {
    const res = await fetch(`${gatewayBase(apiKey)}${path}`, {
      method: 'POST',
      headers: gatewayHeaders(apiKey),
      body: JSON.stringify(body),
      signal: combined,
    })
    const ms = Math.round(performance.now() - started)

    let detail = ''
    try {
      const parsed = await res.json()
      detail = parsed.detail || parsed.message || parsed.error?.message || ''
    } catch {
      // Non-JSON error page. The status code is enough to classify it.
    }
    return { status: res.status, ms, detail: String(detail) }
  } catch (err) {
    const ms = Math.round(performance.now() - started)
    if (signal?.aborted) throw err // A real cancellation, not a verdict.
    const timedOut = err.name === 'TimeoutError' || timeout.aborted
    return { status: timedOut ? 'timeout' : 'offline', ms, detail: '' }
  }
}

/**
 * Turns a probe response into a health verdict.
 * @param {{status: number|string, ms: number, detail: string}} result - Probe response.
 * @param {boolean} wasRealCall - Whether inference was actually requested.
 * @returns {{status: string, latencyMs: number|null, detail: string}} Verdict.
 */
function classify(result, wasRealCall) {
  const { status, ms, detail } = result

  // The account cannot call this model. This is a property of the account, not
  // of the model's current state, so it is stable enough to cache for a day.
  if (status === 404) {
    return { status: STATUS.BLOCKED, latencyMs: null, detail: 'Not available on this account' }
  }

  if (status === 401 || status === 403) {
    return { status: STATUS.BLOCKED, latencyMs: null, detail: 'The API key was rejected' }
  }

  // Reachable, but this workspace cannot drive it — a document-parsing model
  // asked for plain text, say. The model is fine; the request shape is wrong.
  if (status === 400 && /does not support|plain string|not supported/i.test(detail)) {
    return { status: STATUS.UNSUPPORTED, latencyMs: ms, detail: detail.slice(0, 120) }
  }

  if (status === 200) {
    if (wasRealCall) {
      return {
        status: ms > SLOW_MS ? STATUS.COLD : STATUS.READY,
        latencyMs: ms,
        detail: '',
      }
    }
    // The entitlement probe was accepted rather than rejected. Still proves the
    // account can reach the model.
    return { status: STATUS.LIKELY, latencyMs: ms, detail: '' }
  }

  // The body was validated, which means the model resolved: the account has it.
  if (status === 400 || status === 422) {
    return { status: STATUS.LIKELY, latencyMs: ms, detail: '' }
  }

  if (status === 429) {
    return { status: STATUS.DEGRADED, latencyMs: null, detail: 'Rate limited — try again shortly' }
  }

  // Slow, not absent. Treated as a cold start and re-checked with a longer
  // budget rather than being written off.
  if (status === 'timeout') {
    return { status: STATUS.COLD, latencyMs: null, detail: 'Did not answer in time — may be starting up' }
  }

  if (status === 'offline') {
    return { status: STATUS.UNKNOWN, latencyMs: null, detail: 'Could not reach the gateway' }
  }

  if (typeof status === 'number' && status >= 500) {
    return { status: STATUS.DOWN, latencyMs: null, detail: `The model returned an error (${status})` }
  }

  return { status: STATUS.UNKNOWN, latencyMs: null, detail: '' }
}

/**
 * Zero-token check for whether this account may call a model.
 *
 * Sends an empty `messages` array, which every model rejects on validation. The
 * point is which rejection comes back: 400 means the model resolved and the
 * body was checked, 404 means the account never had it.
 *
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {string} modelId - Model to check.
 * @param {AbortSignal} [signal] - Cancels the probe.
 * @returns {Promise<{status: string, latencyMs: number|null, detail: string}>} Verdict.
 */
export async function probeEntitlement(apiKey, modelId, signal) {
  const result = isEmbeddingModel(modelId)
    ? await attempt('/embeddings', { model: modelId, input: [], input_type: 'query' }, apiKey, ENTITLEMENT_TIMEOUT_MS, signal)
    : await attempt('/chat/completions', { model: modelId, messages: [], max_tokens: 1 }, apiKey, ENTITLEMENT_TIMEOUT_MS, signal)

  return classify(result, false)
}

/**
 * Confirms a model is actually serving, and measures how fast.
 *
 * Costs a handful of tokens — the smallest real request the gateway accepts.
 * Run this only for models the user is about to use, not across the catalog.
 *
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {string} modelId - Model to check.
 * @param {AbortSignal} [signal] - Cancels the probe.
 * @returns {Promise<{status: string, latencyMs: number|null, detail: string}>} Verdict.
 */
export async function probeLiveness(apiKey, modelId, signal) {
  const result = isEmbeddingModel(modelId)
    ? await attempt('/embeddings', { model: modelId, input: ['ping'], input_type: 'query' }, apiKey, LIVENESS_TIMEOUT_MS, signal)
    : await attempt(
        '/chat/completions',
        { model: modelId, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, temperature: 0 },
        apiKey,
        LIVENESS_TIMEOUT_MS,
        signal,
      )

  return classify(result, true)
}

/**
 * Classifies a failure from a real user request, so ordinary traffic doubles as
 * a health signal. This is the cheapest probe there is: it has already happened.
 *
 * @param {Error} error - Error thrown by the API layer. Carries `status` when known.
 * @returns {{status: string, latencyMs: null, detail: string}} Verdict.
 */
export function classifyRequestFailure(error) {
  const status = error?.status
  const message = error?.message ?? ''

  if (status) return classify({ status, ms: 0, detail: message }, true)

  // No status attached: fall back to matching the gateway's own wording.
  if (/not found for account/i.test(message)) {
    return { status: STATUS.BLOCKED, latencyMs: null, detail: 'Not available on this account' }
  }
  if (/rate limit|429/i.test(message)) {
    return { status: STATUS.DEGRADED, latencyMs: null, detail: 'Rate limited' }
  }
  return { status: STATUS.DEGRADED, latencyMs: null, detail: message.slice(0, 120) }
}
