import React, { useState, useEffect } from 'react'

export function StatusBar({ models }) {
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () =>
      setTime(new Date().toLocaleTimeString('en-ZA', { hour12: false }))
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  const providers  = new Set(models.map(m => m.providerName)).size
  const categories = new Set(models.map(m => m.category)).size

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0',
      padding: '8px 20px',
      background: 'rgba(17, 16, 9, 0.5)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      position: 'relative',
      flexShrink: 0,
    }}>
      {/* gradient bottom border */}
      <div style={{
        position: 'absolute',
        bottom: 0, left: 0, right: 0,
        height: '1px',
        background: 'var(--grad-line)',
        opacity: 0.3,
      }} />

      {/* Status indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '18px' }}>
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
            width: '3.5px',
            height: '3.5px',
            borderRadius: '50%',
            backgroundColor: 'var(--amber-c)',
            boxShadow: '0 0 6px var(--amber-c)'
          }} />
        </div>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          fontWeight: 600,
          letterSpacing: '0.12em',
          background: 'var(--grad-main)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          NIM API
        </span>
      </div>

      {[
        { val: models.length || '—', lbl: 'models' },
        { val: providers  || '—', lbl: 'providers' },
        { val: categories || '—', lbl: 'categories' },
      ].map(({ val, lbl }, i) => (
        <React.Fragment key={lbl}>
          {i > 0 && (
            <div style={{ width: '1px', height: '10px', background: 'var(--border-subtle)', margin: '0 12px' }} />
          )}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--amber-c)',
            }}>{val}</span>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8.5px',
              letterSpacing: '0.08em',
              color: 'var(--text-dim)',
            }}>{lbl}</span>
          </div>
        </React.Fragment>
      ))}

      <div style={{ flex: 1 }} />

      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px',
        color: 'var(--text-dim)',
        letterSpacing: '0.06em',
      }}>
        {time || '--:--:--'}
      </div>
    </div>
  )
}
