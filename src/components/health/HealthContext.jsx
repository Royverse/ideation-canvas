/**
 * @file HealthContext.jsx
 * @description Shares one health registry across every workspace.
 *
 * Health is genuinely global — the same catalog, the same account, and one
 * sweep that all six workspaces read from. Threading it through props would
 * mean passing the same object into every component that renders a model
 * picker, and would make it easy to accidentally start six sweeps.
 *
 * The context object and `useHealth` live in hooks/useHealthContext.js so this
 * file exports only a component, which is what React Fast Refresh needs.
 */

import { useModelHealth } from '../../hooks/useModelHealth'
import { HealthContext } from '../../hooks/useHealthContext'

export function HealthProvider({ apiKey, models, children }) {
  const health = useModelHealth(apiKey, models)
  return <HealthContext.Provider value={health}>{children}</HealthContext.Provider>
}
