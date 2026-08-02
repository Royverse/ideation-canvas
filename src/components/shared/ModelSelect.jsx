/**
 * @file ModelSelect.jsx
 * @description The model picker, showing live health for every option.
 *
 * The catalog endpoint lists every model NVIDIA publishes, not the ones your
 * key can call — on the account this was built against, just over half of them
 * answer a real request with "Not found for account". This control exists so
 * that difference is visible before you spend a message finding out.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useHealth } from '../../hooks/useHealthContext'
import { STATUS, STATUS_META } from '../../lib/health/probe'
import { HealthDot } from '../health/HealthDot'

/** Menu height cap, matching the max-height on `.model-menu-list` plus chrome. */
const MENU_MAX_HEIGHT = 360

/**
 * Formats a latency for display next to a model.
 * @param {number|null} ms - Measured response time.
 * @returns {string} Short human-readable duration, or an empty string.
 */
function formatLatency(ms) {
  if (ms == null) return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/**
 * Model picker with a live status indicator per option.
 *
 * A native `<select>` cannot render a coloured dot per option, so this is a
 * custom listbox. The trade is deliberate: the status *is* the point of the
 * control, and it has to be visible at the moment of choosing.
 *
 * @param {Object} props
 * @param {string} props.label - Short caption shown before the control.
 * @param {Array<{id: string}>} props.models - Models to offer.
 * @param {string} props.value - Currently selected model id.
 * @param {(id: string) => void} props.onChange - Called with the new model id.
 * @param {boolean} [props.disabled] - Locks the control, e.g. while streaming.
 */
export function ModelSelect({ label, models, value, onChange, disabled = false }) {
  const { partition, getHealth, warm, verify } = useHealth()
  const [open, setOpen] = useState(false)
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const { usable, unusable } = useMemo(() => partition(models), [partition, models])
  const selectedHealth = getHealth(value)

  /**
   * The menu is portalled to the body because every workspace nests its top bar
   * inside a panel with `overflow: hidden`, which would otherwise clip the list
   * — and because the top bar's own `backdrop-filter` makes it a stacking
   * context that a nested translucent panel renders badly inside.
   *
   * Being out of flow means the position has to be measured, and re-measured
   * whenever the page moves under it.
   */
  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const spaceBelow = window.innerHeight - rect.bottom
    // Open upward when there is not enough room below but more room above.
    const flip = spaceBelow < MENU_MAX_HEIGHT && rect.top > spaceBelow
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 348)),
      top: flip ? undefined : rect.bottom + 6,
      bottom: flip ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: Math.min(MENU_MAX_HEIGHT, (flip ? rect.top : spaceBelow) - 16),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    // `true` catches scrolling in any ancestor, not just the window.
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  // Opening the list is the moment the status matters, so that is when the
  // top candidates are confirmed with a real call.
  const handleOpen = useCallback(() => {
    if (disabled || models.length === 0) return
    setOpen((wasOpen) => {
      if (!wasOpen) warm(usable.slice(0, 6).map((m) => m.id))
      return !wasOpen
    })
  }, [disabled, models.length, usable, warm])

  // Close on an outside click or Escape, the two things a listbox must do.
  // The menu is portalled, so "outside" means outside *both* it and the
  // trigger — otherwise clicking the trigger to close would immediately reopen.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e) => {
      const insideMenu = menuRef.current?.contains(e.target)
      const insideTrigger = triggerRef.current?.contains(e.target)
      if (!insideMenu && !insideTrigger) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (id) => {
    onChange(id)
    setOpen(false)
    // Confirm the choice in the background, so a stale verdict is corrected
    // before the user sends anything.
    verify(id)
  }

  const shortName = value ? value.split('/').pop() : 'Select a model'
  const isEmpty = models.length === 0

  const renderOption = (model) => {
    const meta = STATUS_META[model.health.status] ?? {}
    const selected = model.id === value
    return (
      <li key={model.id} role="option" aria-selected={selected}>
        <button
          type="button"
          className={`model-option${selected ? ' selected' : ''}${meta.usable === false ? ' unusable' : ''}`}
          onClick={() => choose(model.id)}
          disabled={meta.usable === false}
          title={model.health.detail || meta.label}
        >
          <HealthDot status={model.health.status} />
          <span className="model-option-name">{model.id.split('/').pop()}</span>
          <span className="model-option-meta">
            {model.health.latencyMs != null && model.health.status !== STATUS.BLOCKED
              ? formatLatency(model.health.latencyMs)
              : meta.label}
          </span>
        </button>
      </li>
    )
  }

  return (
    <>
      <span className="field-caption">{label}</span>

      <div className="model-select">
        <button
          ref={triggerRef}
          type="button"
          className="model-select-trigger"
          onClick={handleOpen}
          disabled={disabled || isEmpty}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`${label}: ${shortName}`}
        >
          <HealthDot status={isEmpty ? STATUS.CHECKING : selectedHealth.status} />
          <span className="model-select-name">{isEmpty ? 'Loading models…' : shortName}</span>
          <span className="model-select-caret" aria-hidden="true">▾</span>
        </button>
      </div>

      {open && position && createPortal(
        <div
          className="model-menu"
          ref={menuRef}
          style={{
            left: position.left,
            top: position.top,
            bottom: position.bottom,
            maxHeight: position.maxHeight,
          }}
        >
          <div className="model-menu-head">
            <span>{usable.length} available</span>
            {unusable.length > 0 && (
              <button
                type="button"
                className="model-menu-toggle"
                onClick={() => setShowUnavailable(!showUnavailable)}
              >
                {showUnavailable ? 'Hide' : 'Show'} {unusable.length} unavailable
              </button>
            )}
          </div>

          <ul
            className="model-menu-list"
            role="listbox"
            aria-label={label}
            style={{ maxHeight: position.maxHeight - 34 }}
          >
            {usable.length === 0 && (
              <li className="model-menu-empty">
                No model in this group is available on your key.
              </li>
            )}

            {usable.map(renderOption)}

            {showUnavailable && unusable.length > 0 && (
              <>
                <li className="model-menu-divider" role="presentation">
                  Not available to this key
                </li>
                {unusable.map(renderOption)}
              </>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
