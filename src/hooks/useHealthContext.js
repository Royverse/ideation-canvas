/**
 * @file useHealthContext.js
 * @description The health context object and its consumer hook.
 *
 * Split from the provider component so the module exports only hooks and
 * values — a file that mixes components with other exports breaks React Fast
 * Refresh, which would mean losing app state on every edit.
 */

import { createContext, useContext } from 'react'
import { STATUS } from '../lib/health/probe'

/** Inert fallback, so a component rendered outside the provider still works. */
const NO_HEALTH = {
  getHealth: () => ({ status: STATUS.UNKNOWN, latencyMs: null, detail: '', failures: 0, checkedAt: 0 }),
  partition: (list) => ({
    usable: list.map((m) => ({ ...m, health: { status: STATUS.UNKNOWN, latencyMs: null } })),
    unusable: [],
  }),
  verify: () => Promise.resolve(),
  warm: () => {},
  report: () => {},
  summary: { counts: {}, usable: 0, total: 0 },
  sweep: { running: false, done: 0, total: 0 },
  reset: () => {},
}

export const HealthContext = createContext(null)

/**
 * Live model health, shared across every workspace.
 * @returns {typeof NO_HEALTH} Health state and controls.
 */
export function useHealth() {
  return useContext(HealthContext) ?? NO_HEALTH
}
