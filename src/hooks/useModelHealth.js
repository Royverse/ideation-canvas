/**
 * @file useModelHealth.js
 * @description Binds the health registry to React and drives the sweep.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { getRegistry } from '../lib/health/registry'
import { STATUS, STATUS_META, isUsable } from '../lib/health/probe'

const EMPTY_SNAPSHOT = { records: new Map(), sweep: { running: false, done: 0, total: 0 } }

/**
 * Live health for the model catalog.
 *
 * On first load this starts a background entitlement sweep. It is free in
 * tokens and rules out every model the account cannot call, which on the
 * catalog this was built against is just over half of them — the difference
 * between a dropdown where any choice might fail and one where the choices are
 * real.
 *
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {Array<{id: string}>} models - Decorated catalog from `useModels`.
 * @returns {Object} Health state and controls.
 */
export function useModelHealth(apiKey, models) {
  const registry = useMemo(() => getRegistry(apiKey), [apiKey])

  const snapshot = useSyncExternalStore(
    registry?.subscribe ?? (() => () => {}),
    registry?.getSnapshot ?? (() => EMPTY_SNAPSHOT),
    () => EMPTY_SNAPSHOT,
  )

  // Sweep once the catalog arrives. Anything already cached and still fresh is
  // skipped, so a reload is nearly instant.
  useEffect(() => {
    if (!registry || models.length === 0) return
    registry.sweep(models.map((m) => m.id))
  }, [registry, models])

  const getHealth = useCallback(
    (modelId) => snapshot.records.get(modelId) ?? {
      status: STATUS.UNKNOWN, latencyMs: null, detail: '', failures: 0,
    },
    [snapshot],
  )

  /**
   * Splits a list into what the user can actually use and what they cannot,
   * best-first. Sorting by health means the top of every dropdown is the model
   * most likely to answer.
   */
  const partition = useCallback((list) => {
    const withHealth = list.map((model) => ({ ...model, health: getHealth(model.id) }))
    const byRank = (a, b) => {
      const rank = (STATUS_META[a.health.status]?.rank ?? 9) - (STATUS_META[b.health.status]?.rank ?? 9)
      if (rank !== 0) return rank
      // Within a status, prefer the model that answered fastest.
      const aLatency = a.health.latencyMs ?? Infinity
      const bLatency = b.health.latencyMs ?? Infinity
      if (aLatency !== bLatency) return aLatency - bLatency
      return a.id.localeCompare(b.id)
    }

    return {
      usable: withHealth.filter((m) => isUsable(m.health.status)).sort(byRank),
      unusable: withHealth.filter((m) => !isUsable(m.health.status)).sort(byRank),
    }
  }, [getHealth])

  /** Confirms one model is serving, right now. Costs a few tokens. */
  const verify = useCallback(
    (modelId) => registry?.check(modelId, 'liveness'),
    [registry],
  )

  /**
   * Confirms a group of models in the background — what opening a dropdown
   * should trigger, so the status shown is current by the time it is read.
   */
  const warm = useCallback((modelIds) => {
    if (!registry) return
    const unconfirmed = modelIds.filter((id) => {
      const record = registry.get(id)
      // Only worth spending tokens on models believed reachable but unproven.
      return record.status === STATUS.LIKELY || registry.isStale(id)
    })
    registry.checkMany(unconfirmed.slice(0, 8), 'liveness')
  }, [registry])

  /** Feeds the outcome of a real request back in. */
  const report = useCallback(
    (modelId, outcome) => registry?.reportUsage(modelId, outcome),
    [registry],
  )

  const summary = useMemo(() => {
    const counts = {}
    for (const model of models) {
      const status = snapshot.records.get(model.id)?.status ?? STATUS.UNKNOWN
      counts[status] = (counts[status] ?? 0) + 1
    }
    const usable = models.filter((m) => isUsable(snapshot.records.get(m.id)?.status ?? STATUS.UNKNOWN)).length
    return { counts, usable, total: models.length }
  }, [models, snapshot])

  return {
    getHealth,
    partition,
    verify,
    warm,
    report,
    summary,
    sweep: snapshot.sweep,
    reset: useCallback(() => registry?.reset(), [registry]),
  }
}
