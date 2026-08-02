/**
 * @file Sidebar.jsx
 * @description Primary navigation, plus the session's request count.
 */

import { useEffect, useState } from 'react'
import { API_CALL_EVENT } from '../api/nvidia'
import { useHealth } from '../hooks/useHealthContext'

/**
 * The six workspaces, in the order someone new should meet them: see the whole
 * catalog, then talk to it, then the specialised labs.
 */
const VIEWS = [
  { id: 'constellation', label: 'Model map' },
  { id: 'arena', label: 'Chat arena' },
  { id: 'code', label: 'Code lab' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'embeddings', label: 'Embeddings' },
  { id: 'vision', label: 'Vision lab' },
  { id: 'health', label: 'Model status' },
]

/**
 * Reads the request counter the API layer maintains, and keeps it live.
 * @returns {number} Requests made from this browser.
 */
function useApiCallCount() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const read = () => {
      try {
        setCount(parseInt(localStorage.getItem('milkyway_api_calls') || '0', 10) || 0)
      } catch {
        setCount(0)
      }
    }
    read()
    window.addEventListener(API_CALL_EVENT, read)
    return () => window.removeEventListener(API_CALL_EVENT, read)
  }, [])

  return count
}

export function Sidebar({ currentView, setView, mobileOpen, setMobileOpen, onSignOut }) {
  const apiCalls = useApiCallCount()
  const { summary, sweep } = useHealth()

  const go = (id) => {
    setView(id)
    setMobileOpen?.(false)
  }

  return (
    <nav className={`raw-sidebar${mobileOpen ? ' mobile-open' : ''}`} aria-label="Workspaces">
      <div className="sidebar-head">
        <span className="sidebar-mark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--nebula-glow)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          milkyway.ai
        </span>
        <span className="sidebar-sub">NVIDIA NIM</span>
      </div>

      <div style={{ flex: 1 }}>
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`raw-nav-item${currentView === view.id ? ' active' : ''}`}
            aria-current={currentView === view.id ? 'page' : undefined}
            onClick={() => go(view.id)}
          >
            {view.label}
            {/* The count belongs on this item specifically: it is the answer
                the status view exists to give, so showing it here often makes
                opening the view unnecessary. */}
            {view.id === 'health' && summary.total > 0 && (
              <span className="nav-badge">
                {sweep.running ? `${sweep.done}/${sweep.total}` : `${summary.usable}/${summary.total}`}
              </span>
            )}
          </button>
        ))}
      </div>

      <div>
        <a
          href="https://github.com/Royverse/ideation-canvas"
          target="_blank"
          rel="noopener noreferrer"
          className="raw-nav-item sidebar-foot-item"
          onClick={() => setMobileOpen?.(false)}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            GitHub
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.7 }}>
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </span>
        </a>

        <button
          type="button"
          className={`raw-nav-item sidebar-foot-item${currentView === 'story' ? ' active' : ''}`}
          aria-current={currentView === 'story' ? 'page' : undefined}
          onClick={() => go('story')}
        >
          About this app
        </button>

        <div className="sidebar-status">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span className="sidebar-status-label">Requests this session</span>
            <span className="sidebar-status-value">{apiCalls}</span>
          </div>
          {onSignOut && (
            <button type="button" className="btn" onClick={onSignOut} style={{ padding: '5px 10px', fontSize: '9px' }}>
              Change key
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
