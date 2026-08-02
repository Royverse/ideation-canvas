/**
 * @file HealthDot.jsx
 * @description The status indicator used everywhere a model is named.
 */

import { STATUS, STATUS_META } from '../../lib/health/probe'

/**
 * Shape carries the meaning as well as colour, so the states remain
 * distinguishable without relying on hue alone.
 */
const SHAPE = {
  [STATUS.READY]: 'solid',
  [STATUS.LIKELY]: 'ring',
  [STATUS.COLD]: 'ring',
  [STATUS.CHECKING]: 'pulse',
  [STATUS.UNKNOWN]: 'hollow',
  [STATUS.DEGRADED]: 'ring',
  [STATUS.DOWN]: 'cross',
  [STATUS.UNSUPPORTED]: 'cross',
  [STATUS.BLOCKED]: 'cross',
}

/**
 * @param {Object} props
 * @param {string} props.status - A value from `STATUS`.
 * @param {boolean} [props.labelled] - Render the status name beside the dot.
 */
export function HealthDot({ status, labelled = false }) {
  const meta = STATUS_META[status] ?? STATUS_META[STATUS.UNKNOWN]
  const shape = SHAPE[status] ?? 'hollow'

  return (
    <span className="health-indicator">
      <span
        className={`health-dot health-dot-${meta.tone} health-dot-${shape}`}
        role="img"
        aria-label={meta.label}
        title={meta.label}
      />
      {labelled && <span className="health-dot-label">{meta.label}</span>}
    </span>
  )
}
