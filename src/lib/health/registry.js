/**
 * @file registry.js
 * @description Holds what is currently known about every model's health, and
 * decides what to re-check and when.
 *
 * Framework-agnostic on purpose: it exposes a `subscribe`/`getSnapshot` pair so
 * React can bind to it with `useSyncExternalStore`, but nothing here depends on
 * React.
 *
 * Three things feed it, in increasing order of authority:
 *   - the entitlement sweep, which is free and covers the whole catalog
 *   - liveness probes, which cost a few tokens and confirm a model is serving
 *   - real user requests, which are free, authoritative, and always running
 */

import { probeEntitlement, probeLiveness, classifyRequestFailure, STATUS, STATUS_META } from './probe'

const STORAGE_PREFIX = 'nim_health_v1_'

/**
 * How long a verdict stays fresh, by status.
 *
 * Entitlement is a property of the account rather than of the moment, so it
 * holds for a day. Liveness decays quickly — a model that answered ten minutes
 * ago tells you little about now.
 */
const TTL_MS = {
  [STATUS.BLOCKED]: 24 * 60 * 60 * 1000,
  [STATUS.UNSUPPORTED]: 24 * 60 * 60 * 1000,
  [STATUS.LIKELY]: 30 * 60 * 1000,
  [STATUS.READY]: 10 * 60 * 1000,
  [STATUS.COLD]: 5 * 60 * 1000,
  [STATUS.DOWN]: 5 * 60 * 1000,
  [STATUS.DEGRADED]: 2 * 60 * 1000,
  [STATUS.UNKNOWN]: 0,
  [STATUS.CHECKING]: 0,
}

/** Backoff after repeated failures, so a broken model is not hammered. */
const BACKOFF_BASE_MS = 30 * 1000
const BACKOFF_CEILING_MS = 15 * 60 * 1000

/**
 * Concurrency for background sweeps. Deliberately modest: the sweep is not
 * urgent, and a burst of parallel requests risks the rate limiter, which would
 * poison the very results being gathered.
 */
const SWEEP_CONCURRENCY = 5

/** Concurrency for probes the user is waiting on. */
const FOREGROUND_CONCURRENCY = 3

/** A verdict for a model nothing is yet known about. */
const emptyRecord = () => ({
  status: STATUS.UNKNOWN,
  latencyMs: null,
  detail: '',
  checkedAt: 0,
  failures: 0,
  nextRetryAt: 0,
  source: null,
})

export class HealthRegistry {
  /**
   * @param {string} apiKey - Scopes both the in-memory state and the cache, so
   *   switching accounts never shows another account's verdicts.
   */
  constructor(apiKey) {
    this.apiKey = apiKey
    this.storageKey = STORAGE_PREFIX + apiKey.slice(0, 12)
    /** @type {Map<string, ReturnType<emptyRecord>>} */
    this.records = new Map()
    this.listeners = new Set()
    this.inFlight = new Map()
    this.sweepState = { running: false, done: 0, total: 0 }
    this.snapshot = null

    this.#restore()
  }

  // ── Persistence ────────────────────────────────────────────────────────

  #restore() {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return
      const saved = JSON.parse(raw)
      const now = Date.now()
      for (const [id, record] of Object.entries(saved)) {
        // Drop anything already stale, so a reload never shows an old verdict
        // as though it were current.
        const ttl = TTL_MS[record.status] ?? 0
        if (record.checkedAt && now - record.checkedAt < ttl) {
          this.records.set(id, { ...emptyRecord(), ...record })
        }
      }
    } catch {
      // Corrupt or unreadable cache. Starting empty just means re-probing.
    }
  }

  #persist() {
    try {
      // `checking` is a moment, not a verdict, and must not survive a reload.
      const durable = {}
      for (const [id, record] of this.records) {
        if (record.status !== STATUS.CHECKING) durable[id] = record
      }
      localStorage.setItem(this.storageKey, JSON.stringify(durable))
    } catch {
      // Over quota or blocked. The registry still works for this session.
    }
  }

  // ── Subscription ───────────────────────────────────────────────────────

  /**
   * @param {() => void} listener - Called whenever any verdict changes.
   * @returns {() => void} Unsubscribe.
   */
  subscribe = (listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * @returns {{records: Map, sweep: Object}} Immutable-by-convention snapshot.
   *   Rebuilt only when something changed, so `useSyncExternalStore` does not
   *   see a new object on every render and loop.
   */
  getSnapshot = () => {
    this.snapshot ??= { records: new Map(this.records), sweep: { ...this.sweepState } }
    return this.snapshot
  }

  #emit() {
    this.snapshot = null
    for (const listener of this.listeners) listener()
  }

  // ── Reading ────────────────────────────────────────────────────────────

  /**
   * @param {string} modelId - Model to look up.
   * @returns {Object} Current record, or an empty one.
   */
  get(modelId) {
    return this.records.get(modelId) ?? emptyRecord()
  }

  /**
   * Whether a verdict is old enough to be worth re-checking.
   * @param {string} modelId - Model to test.
   * @returns {boolean} True when the record is missing, expired, or past backoff.
   */
  isStale(modelId) {
    const record = this.records.get(modelId)
    if (!record || record.status === STATUS.UNKNOWN) return true
    if (record.status === STATUS.CHECKING) return false
    const now = Date.now()
    if (record.nextRetryAt && now < record.nextRetryAt) return false
    return now - record.checkedAt >= (TTL_MS[record.status] ?? 0)
  }

  // ── Writing ────────────────────────────────────────────────────────────

  /**
   * Records a verdict and updates the failure counter and backoff window.
   * @param {string} modelId - Model the verdict is about.
   * @param {{status: string, latencyMs: number|null, detail: string}} verdict - New verdict.
   * @param {string} source - What produced it: entitlement, liveness or traffic.
   */
  #record(modelId, verdict, source) {
    const previous = this.records.get(modelId) ?? emptyRecord()
    const failed = !STATUS_META[verdict.status]?.usable || verdict.status === STATUS.DEGRADED
    const failures = failed ? previous.failures + 1 : 0

    this.records.set(modelId, {
      ...verdict,
      checkedAt: Date.now(),
      failures,
      // Exponential backoff, so a persistently broken model is retried less and
      // less often instead of being polled forever.
      nextRetryAt: failures > 1
        ? Date.now() + Math.min(BACKOFF_BASE_MS * 2 ** (failures - 1), BACKOFF_CEILING_MS)
        : 0,
      source,
      // Keep the best latency seen, so a cold start does not permanently label
      // an otherwise fast model as slow.
      latencyMs: verdict.latencyMs ?? (failed ? previous.latencyMs : null),
    })

    this.#persist()
    this.#emit()
  }

  #markChecking(modelId) {
    const previous = this.records.get(modelId) ?? emptyRecord()
    this.records.set(modelId, { ...previous, status: STATUS.CHECKING })
    this.#emit()
  }

  /**
   * Reports the outcome of a real user request.
   *
   * This is the highest-authority signal in the system and the only one that
   * costs nothing: the request was going to happen regardless. It is what makes
   * the registry self-correcting — a model that starts failing is marked within
   * one request, and a model that recovers is cleared the moment it answers.
   *
   * @param {string} modelId - Model that served (or failed) the request.
   * @param {{ok: boolean, latencyMs?: number, error?: Error}} outcome - What happened.
   */
  reportUsage(modelId, outcome) {
    if (!modelId) return

    if (outcome.ok) {
      const latencyMs = outcome.latencyMs ?? null
      this.#record(modelId, {
        status: latencyMs !== null && latencyMs > 6000 ? STATUS.COLD : STATUS.READY,
        latencyMs,
        detail: '',
      }, 'traffic')
      return
    }

    this.#record(modelId, classifyRequestFailure(outcome.error), 'traffic')
  }

  // ── Probing ────────────────────────────────────────────────────────────

  /**
   * Runs one probe, collapsing duplicate concurrent requests for the same model.
   * @param {string} modelId - Model to probe.
   * @param {'entitlement'|'liveness'} kind - Which probe to run.
   * @returns {Promise<Object>} The resulting record.
   */
  async check(modelId, kind = 'entitlement') {
    const key = `${kind}:${modelId}`
    if (this.inFlight.has(key)) return this.inFlight.get(key)

    const run = (async () => {
      this.#markChecking(modelId)
      try {
        const probe = kind === 'liveness' ? probeLiveness : probeEntitlement
        const verdict = await probe(this.apiKey, modelId)
        this.#record(modelId, verdict, kind)
      } catch {
        this.#record(modelId, {
          status: STATUS.UNKNOWN,
          latencyMs: null,
          detail: 'The check could not be completed',
        }, kind)
      } finally {
        this.inFlight.delete(key)
      }
      return this.get(modelId)
    })()

    this.inFlight.set(key, run)
    return run
  }

  /**
   * Checks a set of models, skipping any whose verdict is still fresh.
   * @param {string[]} modelIds - Models to consider.
   * @param {'entitlement'|'liveness'} kind - Which probe to run.
   * @param {number} concurrency - Parallel probes.
   * @returns {Promise<void>}
   */
  async checkMany(modelIds, kind = 'entitlement', concurrency = FOREGROUND_CONCURRENCY) {
    const queue = modelIds.filter((id) => this.isStale(id))
    if (queue.length === 0) return

    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (cursor < queue.length) {
        await this.check(queue[cursor++], kind)
      }
    }))
  }

  /**
   * Sweeps the whole catalog for entitlement.
   *
   * Free in tokens and the single highest-value operation here: on the catalog
   * this was built against it removes just over half the models from every
   * dropdown before the user touches anything. Results land one at a time, so
   * the pickers fill in progressively rather than blocking on the full sweep.
   *
   * @param {string[]} modelIds - Full catalog.
   * @returns {Promise<void>}
   */
  async sweep(modelIds) {
    if (this.sweepState.running) return

    const queue = modelIds.filter((id) => this.isStale(id))
    this.sweepState = { running: true, done: 0, total: queue.length }
    this.#emit()

    let cursor = 0
    const worker = async () => {
      while (cursor < queue.length) {
        await this.check(queue[cursor++], 'entitlement')
        this.sweepState = { ...this.sweepState, done: this.sweepState.done + 1 }
        this.#emit()
      }
    }

    try {
      await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, queue.length) }, worker))
    } finally {
      this.sweepState = { running: false, done: queue.length, total: queue.length }
      this.#emit()
    }
  }

  /** Discards every verdict and re-checks from scratch. */
  reset() {
    this.records.clear()
    try {
      localStorage.removeItem(this.storageKey)
    } catch {
      // Nothing cached to clear.
    }
    this.#emit()
  }
}

/** One registry per key, so switching accounts starts a clean slate. */
const instances = new Map()

/**
 * @param {string} apiKey - NVIDIA NIM API token.
 * @returns {HealthRegistry|null} The registry for this key.
 */
export function getRegistry(apiKey) {
  if (!apiKey) return null
  if (!instances.has(apiKey)) instances.set(apiKey, new HealthRegistry(apiKey))
  return instances.get(apiKey)
}
