/**
 * @file HealthView.jsx
 * @description The live status board: what this key can reach, what is
 * answering right now, and what is not.
 */

import { useMemo, useState } from 'react'
import { useHealth } from '../../hooks/useHealthContext'
import { HealthDot } from './HealthDot'
import { STATUS, STATUS_META } from '../../lib/health/probe'
import { CATEGORY_COLORS } from '../../theme'

const CATEGORY_LABELS = {
  chat: 'Chat',
  code: 'Code',
  reasoning: 'Reasoning',
  vision: 'Vision',
  embedding: 'Embedding',
  specialist: 'Specialist',
  other: 'Other',
}

/**
 * The summary tiles. Ordered as a funnel — everything published, what this key
 * can reach, what has actually answered — because that is the story: the gap
 * between the first two is the problem this system exists to make visible.
 */
const TILES = [
  { key: 'total', label: 'In the catalog', hint: 'Published by NVIDIA' },
  { key: 'reachable', label: 'On your key', hint: 'Passed the entitlement check' },
  { key: 'confirmed', label: 'Answered', hint: 'Responded to a real request' },
  { key: 'blocked', label: 'Not on your plan', hint: 'Returned “not found for account”' },
]

function formatLatency(ms) {
  if (ms == null) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function formatAge(checkedAt) {
  if (!checkedAt) return 'never'
  const seconds = Math.round((Date.now() - checkedAt) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

export function HealthView({ models }) {
  const { getHealth, sweep, verify, reset } = useHealth()
  const [filter, setFilter] = useState('all')
  const [verifying, setVerifying] = useState(null)

  const rows = useMemo(() => models
    .map((model) => ({ ...model, health: getHealth(model.id) }))
    .sort((a, b) => {
      const rank = (STATUS_META[a.health.status]?.rank ?? 9) - (STATUS_META[b.health.status]?.rank ?? 9)
      return rank !== 0 ? rank : a.id.localeCompare(b.id)
    }), [models, getHealth])

  const stats = useMemo(() => {
    const counts = { total: models.length, reachable: 0, confirmed: 0, blocked: 0 }
    for (const row of rows) {
      const s = row.health.status
      if (s === STATUS.BLOCKED || s === STATUS.UNSUPPORTED) counts.blocked++
      if (STATUS_META[s]?.usable) counts.reachable++
      if (s === STATUS.READY || s === STATUS.COLD) counts.confirmed++
    }
    return counts
  }, [rows, models.length])

  const visible = useMemo(() => {
    if (filter === 'all') return rows
    if (filter === 'usable') return rows.filter((r) => STATUS_META[r.health.status]?.usable)
    if (filter === 'blocked') return rows.filter((r) => !STATUS_META[r.health.status]?.usable)
    return rows.filter((r) => r.category === filter)
  }, [rows, filter])

  const handleVerify = async (modelId) => {
    setVerifying(modelId)
    try {
      await verify(modelId)
    } finally {
      setVerifying(null)
    }
  }

  const sweepPercent = sweep.total > 0 ? Math.round((sweep.done / sweep.total) * 100) : 100

  return (
    <div className="health-view">
      <div className="dot-grid" style={{ opacity: 0.06 }} />

      <div className="health-view-inner">
        <header className="health-header">
          <div>
            <h1 className="health-title">Model status</h1>
            <p className="health-lede">
              NVIDIA publishes one catalog for everyone; your key can only call
              part of it. This is which part, checked continuously — so a model
              you can pick is a model that answers.
            </p>
          </div>
          <button type="button" className="btn" onClick={reset} disabled={sweep.running}>
            Re-check everything
          </button>
        </header>

        {sweep.running && (
          <div className="health-sweep" role="status">
            <div className="health-sweep-head">
              <span className="working-badge">
                <span className="status-dot status-dot-active" />
                Checking availability
              </span>
              <span className="health-sweep-count">{sweep.done} of {sweep.total}</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${sweepPercent}%` }} />
            </div>
            <p className="health-sweep-note">
              This costs nothing — it asks the gateway a question it always
              refuses, and reads which refusal comes back. No tokens are used.
            </p>
          </div>
        )}

        <div className="health-tiles">
          {TILES.map((tile) => (
            <div key={tile.key} className="glass-card health-tile">
              <span className="health-tile-value">{stats[tile.key]}</span>
              <span className="health-tile-label">{tile.label}</span>
              <span className="health-tile-hint">{tile.hint}</span>
            </div>
          ))}
        </div>

        <div className="health-filters" role="group" aria-label="Filter models">
          {[
            { id: 'all', label: `All ${models.length}` },
            { id: 'usable', label: `Available ${stats.reachable}` },
            { id: 'blocked', label: `Unavailable ${stats.blocked}` },
            ...Object.keys(CATEGORY_LABELS).map((c) => ({ id: c, label: CATEGORY_LABELS[c] })),
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              className={`chip${filter === option.id ? ' chip-active' : ''}`}
              onClick={() => setFilter(option.id)}
              aria-pressed={filter === option.id}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="health-table" role="table" aria-label="Model status">
          <div className="health-row health-row-head" role="row">
            <span role="columnheader">Model</span>
            <span role="columnheader">Workspace</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Response</span>
            <span role="columnheader">Checked</span>
            <span />
          </div>

          {visible.length === 0 && (
            <div className="health-empty">Nothing matches this filter.</div>
          )}

          {visible.map((row) => {
            const meta = STATUS_META[row.health.status] ?? {}
            return (
              <div key={row.id} className="health-row" role="row">
                <span className="health-cell-model" role="cell" title={row.id}>
                  {row.id.split('/').pop()}
                  <span className="health-cell-owner">{row.providerName}</span>
                </span>

                <span role="cell">
                  <span
                    className="health-cat"
                    style={{
                      color: CATEGORY_COLORS[row.category],
                      background: `${CATEGORY_COLORS[row.category]}18`,
                    }}
                  >
                    {CATEGORY_LABELS[row.category] ?? row.category}
                  </span>
                </span>

                <span role="cell">
                  <HealthDot status={row.health.status} labelled />
                </span>

                <span className="health-cell-latency" role="cell">
                  {formatLatency(row.health.latencyMs)}
                </span>

                <span className="health-cell-age" role="cell">
                  {formatAge(row.health.checkedAt)}
                </span>

                <span role="cell">
                  {meta.usable !== false && (
                    <button
                      type="button"
                      className="btn health-test"
                      onClick={() => handleVerify(row.id)}
                      disabled={verifying === row.id}
                    >
                      {verifying === row.id ? 'Testing…' : 'Test'}
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>

        <footer className="health-footnote">
          <p>
            <strong>How this works.</strong> Availability is checked with a
            request the gateway rejects before it runs anything, so the whole
            catalog can be swept for free — a <code>404</code> means your key
            never had the model, a <code>400</code> means it does. That verdict
            is cached for a day, because it is a property of your account rather
            than of the moment.
          </p>
          <p>
            Whether a model is <em>answering</em> is a different question and
            decays fast, so it is re-checked when you open a picker or choose a
            model, and confirmed for free by every message you send. A model
            that stops answering is marked within one request; one that recovers
            clears the moment it answers again. Slow models are labelled rather
            than hidden — several take ten seconds or more to wake up, and would
            otherwise look broken when they are merely cold.
          </p>
        </footer>
      </div>
    </div>
  )
}
