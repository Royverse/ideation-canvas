import React, { useState, useEffect } from 'react'

const VIEWS = [
  { id: 'constellation', num: '00', label: 'CONSTELLATION' },
  { id: 'arena',         num: '01', label: 'CHAT ARENA' },
  { id: 'code',          num: '02', label: 'CODE LAB' },
  { id: 'reasoning',     num: '03', label: 'REASONING' },
  { id: 'embeddings',    num: '04', label: 'EMBEDDINGS' },
  { id: 'vision',        num: '05', label: 'VISION LAB' },
]

export function Sidebar({ currentView, setView, mobileOpen, setMobileOpen }) {
  const [apiCalls, setApiCalls] = useState(0)

  useEffect(() => {
    const updateCount = () => {
      setApiCalls(parseInt(localStorage.getItem('milkyway_api_calls') || '0', 10))
    }
    updateCount()
    window.addEventListener('milkyway_api_call', updateCount)
    return () => window.removeEventListener('milkyway_api_call', updateCount)
  }, [])
  return (
    <div className={`raw-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
      {/* Editorial Header */}
      <div style={{ padding: '28px 24px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '13px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amber-c)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          milkyway.ai
        </div>
        <div style={{
          marginTop: '6px',
          fontSize: '8.5px',
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: '0.08em',
          color: 'var(--amber-c)',
          textTransform: 'uppercase',
          fontWeight: 600,
          opacity: 0.8
        }}>
          NIM GALAXY
        </div>
      </div>

      {/* Nav Menu */}
      <nav style={{ flex: 1, padding: '0' }}>
        {VIEWS.map(v => (
          <div
            key={v.id}
            className={`raw-nav-item${currentView === v.id ? ' active' : ''}`}
            onClick={() => { setView(v.id); if (setMobileOpen) setMobileOpen(false); }}
          >
            <span className="raw-nav-num">{v.num}</span>
            <span className="raw-nav-sep">//</span>
            <span>{v.label}</span>
          </div>
        ))}
      </nav>

      {/* Footer Controls */}
      <div>
        <a 
          href="https://github.com/Royverse/milkyway.ai" 
          target="_blank" 
          rel="noopener noreferrer"
          className="raw-nav-item" 
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: 'none', display: 'flex', alignItems: 'center', textDecoration: 'none' }}
          onClick={() => { if (setMobileOpen) setMobileOpen(false); }}
        >
          <span className="raw-nav-num">06</span>
          <span className="raw-nav-sep">//</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            GITHUB
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
              <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/>
              <path d="M9 18c-4.51 2-5-2-7-2"/>
            </svg>
          </span>
        </a>

        <div 
          onClick={() => { setView('story'); if (setMobileOpen) setMobileOpen(false); }} 
          className={`raw-nav-item${currentView === 'story' ? ' active' : ''}`} 
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: 'none' }}
        >
          <span className="raw-nav-num">07</span>
          <span className="raw-nav-sep">//</span>
          <span>OUR STORY</span>
        </div>
        
        <div style={{
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(0,0,0,0.15)',
          borderTop: '1px solid rgba(255,255,255,0.05)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '8px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-dim)', letterSpacing: '0.08em' }}>SESSION API CALLS</span>
            <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)', fontWeight: 600 }}>{apiCalls} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>/ ∞</span></span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(124, 58, 237, 0.08)',
            border: '1px solid rgba(124, 58, 237, 0.15)',
            padding: '4px 10px',
            borderRadius: '12px'
          }}>
            <div style={{
              position: 'relative',
              width: '12px',
              height: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              {/* Outer Orbit */}
              <div style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                border: '1px solid var(--amber-c)',
                borderTopColor: 'transparent',
                borderBottomColor: 'transparent',
                animation: 'spin-slow 3s linear infinite',
                opacity: 0.8
              }} />
              {/* Inner Orbit */}
              <div style={{
                position: 'absolute',
                width: '65%',
                height: '65%',
                borderRadius: '50%',
                border: '1px dashed var(--amber-b)',
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                animation: 'spin-slow 1.8s linear infinite reverse',
                opacity: 0.6
              }} />
              {/* Core Dot */}
              <div style={{
                width: '3px',
                height: '3px',
                borderRadius: '50%',
                backgroundColor: 'var(--amber-c)',
                boxShadow: '0 0 6px var(--amber-c)'
              }} />
            </div>
            <span
              style={{
                fontSize: '8px',
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--amber-c)',
                fontWeight: 700,
                letterSpacing: '0.06em'
              }}
            >
              NIM ACTIVE
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
