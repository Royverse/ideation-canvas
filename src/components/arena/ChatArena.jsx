/**
 * @file ChatArena.jsx
 * @description Conversational workspace: a settings rail, a transcript, and a
 * composer, with live latency and throughput readings for the active model.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { streamChat } from '../../api/nvidia'
import { useStream } from '../../hooks/useStream'
import { useModelPicker } from '../../hooks/useModelPicker'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { ModelSelect } from '../shared/ModelSelect'
import { useStreamTelemetry } from '../../hooks/useStreamTelemetry'
import { MarkdownMessage } from '../shared/MarkdownMessage'
import { StreamTelemetry } from '../shared/StreamTelemetry'
import { copyText } from '../../lib/clipboard'
import { getProvider } from '../../lib/providers'
import { explainError } from '../../lib/errors'
import { PALETTE } from '../../theme'

/** Model families that make the best default for open-ended chat, best first. */
const PREFERRED = ['llama-3.3', 'llama-3.1', 'nemotron']

/** First moves offered on the empty transcript. */
const OPENERS = [
  'Explain what a NIM container actually packages',
  'Draft release notes from a list of commits',
  'Compare TensorRT-LLM and vLLM for serving',
]

export function ChatArena({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [input, setInput] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(1024)
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful, precise assistant.')
  const [showParams, setShowParams] = useState(true)
  const [copiedIndex, setCopiedIndex] = useState(null)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const containerRef = useRef(null)
  const endRef = useRef(null)

  // The rail's width on desktop, its height on mobile. Stored alongside the
  // layout it was set in, so crossing the breakpoint falls back to that
  // layout's default rather than carrying a width over into a height.
  const [rail, setRail] = useState({ mode: null, size: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const mode = isMobile ? 'mobile' : 'desktop'
  const railSize = rail.mode === mode ? rail.size : (isMobile ? 180 : 240)

  const chatModels = useMemo(() => models.filter((m) => m.category === 'chat'), [models])

  const { modelId, selectModel } = useModelPicker(chatModels, {
    selectedModelId,
    setSelectedModelId,
    prefer: PREFERRED,
  })

  const { messages, isStreaming, error, send, stop, clearMessages } = useStream(streamChat, apiKey)
  const telemetry = useStreamTelemetry(messages, isStreaming)

  // Drag-to-resize the rail. The listeners live on the window so the pointer
  // can leave the thin handle mid-drag without dropping the gesture.
  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const size = isMobile
        ? Math.max(120, Math.min(rect.height - 180, e.clientY - rect.top))
        : Math.max(180, Math.min(Math.min(480, rect.width - 320), e.clientX - rect.left))
      setRail({ mode: isMobile ? 'mobile' : 'desktop', size })
    }
    const handleUp = () => setIsDragging(false)

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [isDragging, isMobile])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = useCallback((prompt) => {
    if (!prompt.trim() || !modelId || isStreaming) return
    send(modelId, prompt.trim(), {
      temperature,
      max_tokens: maxTokens,
      systemPrompt: systemPrompt.trim() || undefined,
    })
  }, [modelId, isStreaming, send, temperature, maxTokens, systemPrompt])

  const handleSend = useCallback(() => {
    const prompt = input
    setInput('')
    submit(prompt)
  }, [input, submit])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleCopyMessage = async (text, index) => {
    if (await copyText(text)) {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    }
  }

  const provider = getProvider(modelId)
  const modelName = modelId ? modelId.split('/').pop().toUpperCase() : 'MODEL'
  const totalWords = messages.reduce(
    (sum, m) => sum + (m.content ? m.content.trim().split(/\s+/).filter(Boolean).length : 0),
    0,
  )

  return (
    <div
      ref={containerRef}
      className="arena-split"
      style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      <div className="dot-grid" />
      <div
        className="ambient-blob"
        style={{
          width: 400, height: 400, top: '-5%', right: '5%',
          background: `radial-gradient(circle, ${PALETTE.nebulaDeep}, transparent)`,
        }}
      />

      {/* ── SETTINGS RAIL ───────────────────────────────────────────────── */}
      {showParams && (
        <div
          className="params-panel-chat"
          style={{
            width: isMobile ? '100%' : `${railSize}px`,
            height: isMobile ? `${railSize}px` : '100%',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            background: 'rgba(7, 7, 26, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 2,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <span className="field-caption">Chat settings</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="field-label" htmlFor="chat-system-prompt">Instructions</label>
              <textarea
                id="chat-system-prompt"
                className="field-input"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={isMobile ? 2 : 4}
                placeholder="Give the model a role or a set of guidelines…"
              />
              <span className="field-hint">Shapes how the model answers, for the whole conversation.</span>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label" htmlFor="chat-temperature" style={{ marginBottom: 0 }}>Creativity</label>
                <span className="field-value">{temperature.toFixed(2)}</span>
              </div>
              <input
                id="chat-temperature"
                type="range" min="0" max="1.5" step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
              />
              <span className="field-hint">Higher values wander further from the obvious answer.</span>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label" htmlFor="chat-max-tokens" style={{ marginBottom: 0 }}>Reply length</label>
                <span className="field-value">{maxTokens} tokens</span>
              </div>
              <input
                id="chat-max-tokens"
                type="range" min="128" max="4096" step="128"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              />
              <span className="field-hint">Generation stops here, even mid-sentence.</span>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
              <div className="field-label" style={{ marginBottom: '12px' }}>Performance</div>
              <div className="glass-card" style={{ padding: '14px', background: 'rgba(3, 3, 9, 0.45)' }}>
                <StreamTelemetry {...telemetry} />
                <div className="tele-chip">
                  <span>Words</span>
                  <span className="tele-val">{totalWords}</span>
                </div>
                <div className="tele-chip">
                  <span>Turns</span>
                  <span className="tele-val">{Math.floor(messages.length / 2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showParams && (
        <div
          className={`${isMobile ? 'resizer-v' : 'resizer-h'}${isDragging ? ' dragging' : ''}`}
          onPointerDown={(e) => { setIsDragging(true); e.preventDefault() }}
          role="separator"
          aria-orientation={isMobile ? 'horizontal' : 'vertical'}
          aria-label="Resize settings panel"
        />
      )}

      {/* ── TRANSCRIPT ──────────────────────────────────────────────────── */}
      <div className="chat-main-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>
        <div className="top-bar">
          <button
            type="button"
            className="btn"
            onClick={() => setShowParams(!showParams)}
            aria-expanded={showParams}
            style={{ padding: '6px 12px', fontSize: '10px' }}
          >
            {showParams ? '◀' : '▶'} Settings
          </button>

          <div className="bar-divider" />

          <ModelSelect label="Model" models={chatModels} value={modelId} onChange={selectModel} />

          {modelId && (
            <span
              className="provider-badge"
              style={{ color: provider.color, background: `${provider.color}14`, borderColor: `${provider.color}22` }}
            >
              {provider.name}
            </span>
          )}

          <div style={{ flex: 1 }} />

          <button
            type="button"
            className="btn btn-danger"
            onClick={clearMessages}
            disabled={messages.length === 0}
            style={{ padding: '6px 14px', fontSize: '10px' }}
          >
            Clear chat
          </button>
        </div>

        <div
          style={{
            flex: 1, overflowY: 'auto', padding: '28px 36px',
            display: 'flex', flexDirection: 'column', gap: '24px',
          }}
        >
          {error && (
            <div className="error-box fade-up" role="alert">
              <span aria-hidden="true" style={{ fontSize: '14px', marginTop: '1px' }}>◈</span>
              <div>
                <span className="error-box-title">The model did not answer</span>
                <span className="error-box-body">{explainError(error)}</span>
              </div>
            </div>
          )}

          {messages.length === 0 && (
            <div className="fade-up empty-state">
              <div className="empty-state-eyebrow">Chat arena</div>
              <p className="empty-state-body">
                Pick a model above and ask it something. The settings rail changes
                how it answers — instructions set its role, creativity sets how far
                it strays from the obvious.
              </p>
              <div className="empty-state-chips">
                {OPENERS.map((opener) => (
                  <button
                    key={opener}
                    type="button"
                    className="btn"
                    onClick={() => submit(opener)}
                    disabled={!modelId || isStreaming}
                    style={{ textAlign: 'left', fontSize: '10.5px', padding: '9px 13px' }}
                  >
                    {opener}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`stream-in ${msg.role === 'user' ? 'msg-user' : 'msg-ai'}`}
              style={{ width: msg.role === 'user' ? undefined : '100%', display: 'flex', flexDirection: 'column' }}
            >
              <div
                className="msg-meta"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                  color: msg.role === 'user' ? PALETTE.blue : PALETTE.nebulaGlow,
                }}
              >
                <span>
                  {msg.role === 'user' ? 'You' : modelName}
                  {msg.isStreaming && (
                    <span
                      className="status-dot status-dot-active"
                      style={{ display: 'inline-block', marginLeft: 8, verticalAlign: 'middle' }}
                    />
                  )}
                </span>
                {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg.content, i)}
                    className="msg-copy"
                    style={{ color: copiedIndex === i ? PALETTE.mint : undefined }}
                    aria-label="Copy this reply"
                  >
                    {copiedIndex === i ? '✓ Copied' : 'Copy'}
                  </button>
                )}
              </div>

              <div className={msg.role === 'user' ? 'msg-bubble-user' : 'msg-bubble-ai'}>
                {msg.role === 'user' ? msg.content : (
                  <>
                    {msg.isStreaming && !msg.content ? (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Thinking…</span>
                    ) : (
                      <MarkdownMessage>{msg.content}</MarkdownMessage>
                    )}
                    {msg.isStreaming && <span className="terminal-cursor" />}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* ── COMPOSER ──────────────────────────────────────────────────── */}
        <div className="input-row">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span className="composer-caret" aria-hidden="true">›</span>
              <textarea
                className="field-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Message"
                placeholder={isMobile ? 'Message…' : 'Message — Enter to send, Shift+Enter for a new line'}
                rows={Math.min(5, (input.match(/\n/g) || []).length + 1)}
                style={{ paddingLeft: '28px', lineHeight: 1.5 }}
              />
            </div>

            {isStreaming ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={stop}
                style={{ height: '44px', padding: '0 22px', flexShrink: 0 }}
              >
                <span className="stop-glyph" aria-hidden="true" /> Stop
              </button>
            ) : (
              <button
                type="button"
                className={`btn ${input.trim() ? 'btn-primary' : ''}`}
                onClick={handleSend}
                disabled={!input.trim() || !modelId}
                style={{ height: '44px', padding: '0 22px', flexShrink: 0 }}
              >
                Send ›
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
