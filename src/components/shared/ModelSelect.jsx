/**
 * @file ModelSelect.jsx
 * @description The model dropdown shared by every workspace.
 */

import { PALETTE } from '../../theme'

/**
 * Labelled dropdown for choosing the model a workspace talks to.
 *
 * Shows the short model name (the part after the provider slash) because the
 * provider is already conveyed by the badge beside it, and full ids overflow
 * the bar on narrow screens.
 *
 * @param {Object} props
 * @param {string} props.label - Short caption shown before the control.
 * @param {Array<{id: string}>} props.models - Models to offer.
 * @param {string} props.value - Currently selected model id.
 * @param {(id: string) => void} props.onChange - Called with the new model id.
 * @param {boolean} [props.disabled] - Locks the control, e.g. while streaming.
 */
export function ModelSelect({ label, models, value, onChange, disabled = false }) {
  const isEmpty = models.length === 0

  return (
    <>
      <span
        className="field-caption"
        id={`model-select-label-${label.replace(/\s+/g, '-').toLowerCase()}`}
      >
        {label}
      </span>
      <select
        className="field-input model-select-dropdown"
        value={value}
        disabled={disabled || isEmpty}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`${label} — choose a model`}
        style={{ padding: '6px 32px 6px 10px', fontSize: '11px', color: PALETTE.nebulaGlow }}
      >
        {isEmpty ? (
          <option>Loading models…</option>
        ) : (
          models.map((m) => (
            <option key={m.id} value={m.id} style={{ background: PALETTE.panel }}>
              {m.id.split('/').pop()}
            </option>
          ))
        )}
      </select>
    </>
  )
}
