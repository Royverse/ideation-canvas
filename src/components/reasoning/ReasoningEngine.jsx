/**
 * @file ReasoningEngine.jsx
 * @description Reasoning workspace: the model's chain of thought on the left,
 * its final answer on the right, both filling in as they stream.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { streamReasoning } from '../../api/nvidia'
import { useStream } from '../../hooks/useStream'
import { useModelPicker } from '../../hooks/useModelPicker'
import { useMediaQuery, usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { ModelSelect } from '../shared/ModelSelect'
import { MarkdownMessage } from '../shared/MarkdownMessage'
import { useHealth } from '../../hooks/useHealthContext'
import { explainError } from '../../lib/errors'
import { PALETTE, CHANNELS, alpha } from '../../theme'

/** Reasoning models with the clearest chains of thought, best first. */
const PREFERRED = ['deepseek-r1', 'nemotron', 'qwq']

/** Prompts that reward a visible chain of thought. */
const OPENERS = [
  { label: 'What is the last digit of 7^7^7^7?', hint: 'modular arithmetic' },
  { label: 'Prove there are infinitely many primes', hint: 'classical proof' },
  { label: 'Explain rigorously why 0.999… = 1', hint: 'real analysis' },
  { label: "How many r's are in 'strawberry'?", hint: 'careful counting' },
]

/**
 * An ambient waveform that reacts to whether the model is thinking.
 *
 * Colours come from the JS palette, not CSS variables: a canvas context cannot
 * resolve `var(--x)` and silently keeps whatever colour was set before.
 *
 * @param {Object} props
 * @param {boolean} props.active - Whether a generation is running.
 */
function ThinkingWave({ active }) {
  const canvasRef = useRef(null)
  const reducedMotion = usePrefersReducedMotion()

  // The render loop reads `active` through a ref so a state change adjusts the
  // wave in place, rather than tearing down and restarting the animation.
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let frame
    let phase = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const render = () => {
      const isActive = activeRef.current
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      ctx.clearRect(0, 0, width, height)

      phase += isActive ? 0.1 : 0.015
      const amplitude = isActive ? 12 : 2
      const frequency = isActive ? 0.035 : 0.012

      const layers = [
        { color: alpha(CHANNELS.nebulaCore, isActive ? 0.55 : 0.15), width: 2, offset: 0 },
        { color: alpha(CHANNELS.nebulaGlow, isActive ? 0.30 : 0.07), width: 1, offset: 1.6 },
        { color: alpha(CHANNELS.nebulaCore, isActive ? 0.20 : 0.04), width: 1, offset: 3.2 },
      ]

      for (const layer of layers) {
        ctx.strokeStyle = layer.color
        ctx.lineWidth = layer.width
        ctx.beginPath()
        for (let x = 0; x < width; x++) {
          // Damping pins both ends of the wave to the canvas edges, so it reads
          // as a contained signal rather than a clipped one.
          const damp = Math.sin((x / width) * Math.PI)
          const y = height / 2 + Math.sin(x * frequency + phase + layer.offset) * amplitude * damp
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      }

      // A single static frame still communicates "there is a signal here".
      if (!reducedMotion) frame = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [reducedMotion])

  return <canvas ref={canvasRef} aria-hidden="true" style={{ width: '100%', height: '32px', display: 'block' }} />
}

/**
 * Splits a chain of thought into readable steps on blank-line boundaries.
 * @param {string} reasoning - Raw reasoning text.
 * @returns {string[]} Non-empty paragraphs.
 */
function toSteps(reasoning) {
  if (!reasoning) return []
  return reasoning.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)
}

export function ReasoningEngine({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [input, setInput] = useState('')

  // Ticks up while the model works, then holds its last value — which is the
  // total time the run took, so no separate "final duration" state is needed.
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(0)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const endRef = useRef(null)

  const { partition } = useHealth()

  const reasoningModels = useMemo(
    () => models.filter((m) => m.category === 'reasoning'),
    [models],
  )

  // Only offer models believed to work. Because the list is derived from
  // live health, a model that starts failing drops out of it and the
  // selection moves to the next healthy one without the user acting.
  const { usable } = useMemo(() => partition(reasoningModels), [partition, reasoningModels])

  const { modelId, selectModel } = useModelPicker(usable, {
    selectedModelId,
    setSelectedModelId,
    prefer: PREFERRED,
  })

  const { messages, isStreaming, error, send, stop } = useStream(streamReasoning, apiKey)

  useEffect(() => {
    if (!isStreaming) return
    startRef.current = performance.now()
    const timer = setInterval(() => {
      setElapsed((performance.now() - startRef.current) / 1000)
    }, 100)
    return () => clearInterval(timer)
  }, [isStreaming])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = useCallback((prompt) => {
    if (!prompt.trim() || !modelId || isStreaming) return
    send(modelId, prompt.trim(), { max_tokens: 2048 })
  }, [modelId, isStreaming, send])

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

  const latest = messages[messages.length - 1]
  const latestIsReply = latest?.role === 'assistant'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div className="dot-grid" />
      <div
        className="ambient-blob"
        style={{
          width: 500, height: 500, top: '-10%', left: '20%',
          background: `radial-gradient(circle, ${alpha(CHANNELS.nebulaCore, 0.06)}, transparent)`,
        }}
      />

      <div className="top-bar" style={{ zIndex: 2 }}>
        <ModelSelect label="Model" models={reasoningModels} value={modelId} onChange={selectModel} />
        <div style={{ flex: 1 }} />
        {isStreaming && (
          <span className="working-badge">
            <span className="status-dot status-dot-active" />
            Thinking · {elapsed.toFixed(1)}s
          </span>
        )}
      </div>

      {messages.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px', padding: '40px', zIndex: 1 }}>
          <div className="empty-state" style={{ margin: 0 }}>
            <div className="empty-state-eyebrow">Reasoning</div>
            <p className="empty-state-body">
              Reasoning models work through a problem before answering. Ask one
              something with steps and you will see the working on the left, the
              conclusion on the right.
            </p>
          </div>
          <div className="reasoning-openers">
            {OPENERS.map((opener) => (
              <button
                key={opener.label}
                type="button"
                className="glass-card reasoning-opener"
                onClick={() => submit(opener.label)}
                disabled={!modelId || isStreaming}
              >
                <span className="reasoning-opener-label">{opener.label}</span>
                <span className="reasoning-opener-hint">{opener.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>
          <div style={{ background: 'rgba(7, 7, 26, 0.7)', backdropFilter: 'blur(8px)', padding: '2px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <ThinkingWave active={isStreaming} />
          </div>

          {error && (
            <div className="error-box" style={{ margin: '16px 20px 0' }} role="alert">
              <span aria-hidden="true" style={{ fontSize: '14px' }}>◈</span>
              <div>
                <span className="error-box-title">Reasoning failed</span>
                <span className="error-box-body">{explainError(error)}</span>
              </div>
            </div>
          )}

          <div className="reasoning-split" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Chain of thought */}
            <div
              className="reasoning-chain-panel"
              style={{ flex: 1, borderRight: '1px solid var(--border-subtle)', padding: '24px', overflowY: 'auto' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                <span className="field-caption">Working</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--text-dim)' }}>
                  {elapsed.toFixed(1)}s
                </span>
              </div>

              {messages.map((msg, i) => msg.role === 'user' ? (
                <div key={i} className="glass-card reasoning-question">
                  <div className="field-caption" style={{ marginBottom: '5px' }}>You asked</div>
                  {msg.content}
                </div>
              ) : (
                <Fragment key={i}>
                  {toSteps(msg.reasoning).map((step, index) => (
                    <div key={index} className="glass-card reasoning-step">
                      <div className="reasoning-step-index">Step {index + 1}</div>
                      <div className="reasoning-step-body">{step}</div>
                    </div>
                  ))}
                  {msg.isStreaming && !msg.reasoning && (
                    <div className="reasoning-waiting">
                      <span className="terminal-cursor" style={{ width: '5px', height: '11px', background: PALETTE.nebulaCore }} />
                      Reading the question…
                    </div>
                  )}
                  {!msg.isStreaming && !msg.reasoning && (
                    <div className="reasoning-waiting">
                      This model answered directly, without exposing its working.
                    </div>
                  )}
                </Fragment>
              ))}
              <div ref={endRef} />
            </div>

            {/* Answer */}
            <div
              className="reasoning-answer-panel"
              style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              <span className="field-caption">Answer</span>

              {latestIsReply && (
                <>
                  {!latest.isStreaming && latest.reasoning && (
                    <span className="reasoning-summary">
                      Thought for {elapsed.toFixed(1)}s
                      {' · '}
                      {toSteps(latest.reasoning).length === 1
                        ? '1 step'
                        : `${toSteps(latest.reasoning).length} steps`}
                    </span>
                  )}

                  <div className="glass-card" style={{ padding: '22px 24px', fontSize: '14px', lineHeight: 1.8, color: 'var(--text-primary)' }}>
                    {latest.isStreaming && !latest.content ? (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                        Waiting for the conclusion…
                      </span>
                    ) : (
                      <MarkdownMessage>{latest.content}</MarkdownMessage>
                    )}
                    {latest.isStreaming && latest.content && <span className="terminal-cursor" />}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="input-row" style={{ zIndex: 2 }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span className="composer-caret" aria-hidden="true">››</span>
            <textarea
              className="field-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Question"
              placeholder={isMobile ? 'Ask a question…' : 'Ask something with steps — Enter to send'}
              rows={Math.min(5, (input.match(/\n/g) || []).length + 1)}
              style={{ paddingLeft: '34px' }}
            />
          </div>
          {isStreaming ? (
            <button type="button" className="btn btn-danger" onClick={stop} style={{ height: '44px', padding: '0 22px', flexShrink: 0 }}>
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
              Think ›
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
