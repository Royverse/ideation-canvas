import React, { useState } from 'react'
import { fetchModels } from '../api/nvidia'

export function ApiKeyModal({ onKeyValid }) {
  const [inputKey, setInputKey] = useState('')
  const [status, setStatus] = useState('idle') // idle, loading, error

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!inputKey.startsWith('nvapi-')) {
      setStatus('error')
      return
    }

    setStatus('loading')
    try {
      // Validate by doing a quick fetch
      await fetchModels(inputKey)
      onKeyValid(inputKey)
    } catch (err) {
      setStatus('error')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: 'rgba(7, 9, 15, 0.65)',
      backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    }}>
      <div className="glass-card" style={{
        padding: '36px',
        width: '440px',
        boxShadow: 'var(--clay-shadow-dark)',
        textAlign: 'left',
      }}>
        <div style={{
          color: 'var(--accent-phosphor)',
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '0.12em',
          fontFamily: "'JetBrains Mono', monospace",
          textAlign: 'center',
          marginBottom: '28px',
          textShadow: '0 0 10px rgba(0, 255, 135, 0.3)'
        }}>
          ◈ NVIDIA NIM SHOWCASE
        </div>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>
            Enter your NVIDIA NIM API Key to get started
          </label>
          <input
            type="password"
            value={inputKey}
            onChange={e => setInputKey(e.target.value)}
            placeholder="nvapi-..."
            className="field-input"
            style={{
              border: `1px solid ${status === 'error' ? 'var(--accent-coral)' : 'rgba(255, 255, 255, 0.08)'}`,
              boxShadow: status === 'error' ? '0 0 10px rgba(212, 96, 96, 0.15), inset 2px 2px 5px rgba(0, 0, 0, 0.4)' : undefined
            }}
          />
          {status === 'error' && (
            <div style={{ color: 'var(--accent-coral)', fontSize: '12px', fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span>We couldn't validate this key. Make sure it starts with 'nvapi-' and you are online.</span>
            </div>
          )}
          
          <button
            type="submit"
            disabled={status === 'loading'}
            style={{
              backgroundColor: 'rgba(0, 255, 135, 0.15)',
              border: '1px solid rgba(0, 255, 135, 0.3)',
              borderRadius: '12px',
              padding: '12px',
              color: '#00ff87',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              cursor: status === 'loading' ? 'wait' : 'pointer',
              marginTop: '10px',
              boxShadow: 'inset -2px -2px 6px rgba(0, 0, 0, 0.3), inset 2px 2px 4px rgba(255, 255, 255, 0.2), 0 4px 10px rgba(0, 255, 135, 0.15)',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseOver={e => {
              if (status !== 'loading') {
                e.currentTarget.style.backgroundColor = 'rgba(0, 255, 135, 0.22)';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'inset -3px -3px 8px rgba(0, 0, 0, 0.4), inset 3px 3px 6px rgba(255, 255, 255, 0.3), 0 6px 14px rgba(0, 255, 135, 0.25)';
              }
            }}
            onMouseOut={e => {
              if (status !== 'loading') {
                e.currentTarget.style.backgroundColor = 'rgba(0, 255, 135, 0.15)';
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'inset -2px -2px 6px rgba(0, 0, 0, 0.3), inset 2px 2px 4px rgba(255, 255, 255, 0.2), 0 4px 10px rgba(0, 255, 135, 0.15)';
              }
            }}
            onMouseDown={e => {
              if (status !== 'loading') {
                e.currentTarget.style.transform = 'translateY(1px)';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 5px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 255, 135, 0.1)';
              }
            }}
            onMouseUp={e => {
              if (status !== 'loading') {
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
          >
            {status === 'loading' ? 'CHECKING KEY...' : 'CONNECT ▶'}
          </button>
        </form>

        <div style={{
          marginTop: '28px',
          fontSize: '11px',
          color: 'var(--text-dim)',
          textAlign: 'center',
          lineHeight: 1.5,
          fontFamily: "'Inter', sans-serif",
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          paddingTop: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px'
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-dim)' }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          <span>Your key is safe: it is stored only inside your own browser and sent directly to NVIDIA.</span>
        </div>
      </div>
    </div>
  )
}
