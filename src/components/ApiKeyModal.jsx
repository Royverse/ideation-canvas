/**
 * @file ApiKeyModal.jsx
 * @description The first screen. Two ways in: the shared trial key, which needs
 * nothing from the visitor, or their own NVIDIA key.
 *
 * The trial leads because it is the only path that costs a first-time visitor
 * nothing — the source link sits beside the key field for the same reason,
 * since "what is this?" and "can I see the code?" are the two questions this
 * screen actually has to answer.
 */

import { useState } from 'react'
import { fetchModels } from '../api/nvidia'
import { TRIAL_KEY } from '../lib/gateway'
import { explainError } from '../lib/errors'

const KEY_PREFIX = 'nvapi-'

const REPO_URL = 'https://github.com/Royverse/ideation-canvas'

export function ApiKeyModal({ onKeyValid }) {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState('idle') // idle | checking | trial | error
  const [message, setMessage] = useState('')

  const busy = status === 'checking' || status === 'trial'

  /**
   * Proves a key works before handing it to the app.
   * A models call is the cheapest request that settles the question.
   * @param {string} candidate - Key to verify, or the trial sentinel.
   */
  const connect = async (candidate) => {
    setMessage('')
    try {
      await fetchModels(candidate)
      onKeyValid(candidate)
    } catch (err) {
      setStatus('error')
      // 503 is the one failure the visitor cannot act on by fixing their input:
      // the deployment simply has no trial key set.
      setMessage(
        err.status === 503
          ? 'The live trial is not switched on for this deployment. Connect your own NVIDIA key below to continue.'
          : explainError(err.message),
      )
    }
  }

  const handleTrial = () => {
    setStatus('trial')
    connect(TRIAL_KEY)
  }

  const handleSubmit = (e) => {
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
    connect(trimmed)
  }

  return (
    <div className="key-gate">
      <form className="glass-card key-card" onSubmit={handleSubmit}>
        <div className="key-card-mark">milkyway.ai</div>
        <h1 className="key-card-title">Connect to the NIM galaxy</h1>
        <p className="key-card-lede">
          Every model in this app runs on NVIDIA NIM. Take it for a spin on our
          key, or connect your own to see the whole catalog your account reaches.
        </p>

        <div className="key-trial">
          <button
            type="button"
            className="btn btn-primary key-trial-btn"
            onClick={handleTrial}
            disabled={busy}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            {status === 'trial' ? 'Opening the trial…' : 'Try it now — no key needed'}
          </button>
          <p className="key-trial-note">
            Runs on our NVIDIA key. Shared with everyone else trying it, so it is
            rate limited and answers are capped — bring your own key for the full run.
          </p>
        </div>

        <div className="key-card-divider">
          <span>or connect your own key</span>
        </div>

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
            aria-invalid={status === 'error'}
            aria-describedby={status === 'error' ? 'api-key-error' : undefined}
            style={status === 'error' ? { borderColor: 'var(--accent-coral)' } : undefined}
          />
        </div>

        <div className="key-card-links">
          <a className="key-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
            View the source
          </a>
          <a className="key-link" href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 7h3a5 5 0 0 1 0 10h-3M9 17H6A5 5 0 0 1 6 7h3M8 12h8" />
            </svg>
            Get a free key
          </a>
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
          className="btn"
          disabled={busy || !key.trim()}
          style={{ padding: '13px', fontSize: '11.5px' }}
        >
          {status === 'checking' ? 'Checking the key…' : 'Connect my key'}
        </button>

        <div className="key-card-footnote">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span>
            Your key stays in this browser and is sent only to NVIDIA. The trial
            key stays on the server and never reaches the page.
          </span>
        </div>
      </form>
    </div>
  )
}
