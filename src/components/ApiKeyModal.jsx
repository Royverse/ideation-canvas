/**
 * @file ApiKeyModal.jsx
 * @description The first screen: collects and verifies an NVIDIA NIM API key.
 */

import { useState } from 'react'
import { fetchModels } from '../api/nvidia'
import { explainError } from '../lib/errors'

const KEY_PREFIX = 'nvapi-'

export function ApiKeyModal({ onKeyValid }) {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState('idle') // idle | checking | error
  const [message, setMessage] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = key.trim()

    // Check the shape first — a local check is instant and says exactly what
    // is wrong, where a round trip would just come back "unauthorized".
    if (!trimmed.startsWith(KEY_PREFIX)) {
      setStatus('error')
      setMessage(`NVIDIA keys start with "${KEY_PREFIX}". Copy the whole key from build.nvidia.com.`)
      return
    }

    setStatus('checking')
    setMessage('')
    try {
      // A models call is the cheapest request that proves the key works.
      await fetchModels(trimmed)
      onKeyValid(trimmed)
    } catch (err) {
      setStatus('error')
      setMessage(explainError(err.message))
    }
  }

  return (
    <div className="key-gate">
      <form className="glass-card key-card" onSubmit={handleSubmit}>
        <div className="key-card-mark">milkyway.ai</div>
        <h1 className="key-card-title">Connect to the NIM galaxy</h1>
        <p className="key-card-lede">
          Every model in this app runs on NVIDIA NIM. Paste an API key to see
          which ones your account can reach.
        </p>

        <div>
          <label className="field-label" htmlFor="api-key">API key</label>
          <input
            id="api-key"
            type="password"
            className="field-input"
            value={key}
            onChange={(e) => { setKey(e.target.value); if (status === 'error') setStatus('idle') }}
            placeholder={`${KEY_PREFIX}…`}
            autoComplete="off"
            autoFocus
            aria-invalid={status === 'error'}
            aria-describedby={status === 'error' ? 'api-key-error' : undefined}
            style={status === 'error' ? { borderColor: 'var(--accent-coral)' } : undefined}
          />
        </div>

        {status === 'error' && (
          <div id="api-key-error" className="key-card-error" role="alert">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: '1px' }}>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{message}</span>
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={status === 'checking' || !key.trim()}
          style={{ padding: '13px', fontSize: '11.5px' }}
        >
          {status === 'checking' ? 'Checking the key…' : 'Connect'}
        </button>

        <div className="key-card-footnote">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>
            The key stays in this browser and is sent only to NVIDIA.
            {' '}
            <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer">
              Get a key
            </a>
          </span>
        </div>
      </form>
    </div>
  )
}
