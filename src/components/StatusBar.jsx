/**
 * @file StatusBar.jsx
 * @description A thin bar summarising what the connected account can reach.
 */

import { Fragment, useMemo } from 'react'

export function StatusBar({ models, isTrial }) {
  const stats = useMemo(() => {
    const providers = new Set(models.map((m) => m.providerName))
    const categories = new Set(models.map((m) => m.category))
    return [
      { value: models.length, label: models.length === 1 ? 'model' : 'models' },
      { value: providers.size, label: providers.size === 1 ? 'provider' : 'providers' },
      { value: categories.size, label: categories.size === 1 ? 'category' : 'categories' },
    ]
  }, [models])

  return (
    <div className="status-bar">
      <div className="status-bar-rule" aria-hidden="true" />

      <span className="status-bar-mark">
        <span className="status-dot status-dot-active" aria-hidden="true" />
        NIM connected
      </span>

      {/* Worth saying plainly: on the trial, answers are capped and the quota
          is shared, so a slow or refused request has a different cause here. */}
      {isTrial && <span className="trial-pill">Shared trial key</span>}

      {stats.map((stat, i) => (
        <Fragment key={stat.label}>
          {i > 0 && <div className="bar-divider" style={{ height: '10px', margin: '0 12px' }} />}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span className="status-bar-value">{stat.value || '—'}</span>
            <span className="status-bar-label">{stat.label}</span>
          </div>
        </Fragment>
      ))}
    </div>
  )
}
