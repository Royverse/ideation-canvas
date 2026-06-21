import React, { useState, useEffect, useRef } from 'react'
import { streamReasoning } from '../../api/nvidia'
import { useStream } from '../../hooks/useStream'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

// Animated waveform canvas
function ThinkingWave({ active }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let frame, phase = 0

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width; canvas.height = r.height
    }
    resize()
    window.addEventListener('resize', resize)

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const speed = active ? 0.1 : 0.015
      const amp   = active ? 12 : 2
      const freq  = active ? 0.035 : 0.012
      phase += speed

      const waves = [
        { color: `rgba(200,112,42,${active ? 0.55 : 0.15})`, w: 2, off: 0 },
        { color: `rgba(245,169,61,${active ? 0.3 : 0.07})`,  w: 1, off: 1.6 },
        { color: `rgba(200,112,42,${active ? 0.2 : 0.04})`,  w: 1, off: 3.2 },
      ]

      for (const wave of waves) {
        ctx.strokeStyle = wave.color
        ctx.lineWidth   = wave.w
        ctx.beginPath()
        for (let x = 0; x < canvas.width; x++) {
          // Dampening function keeping wave edges bound to the left/right canvas boundaries
          // Formula: Dampening = sin((x / Width) * PI)
          const damp = Math.sin((x / canvas.width) * Math.PI)
          // Wave equation: y = baseline + sin(x * frequency + phase + offset) * amplitude * dampening
          const y = canvas.height / 2 + Math.sin(x * freq + phase + wave.off) * amp * damp
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      frame = requestAnimationFrame(render)
    }
    render()
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize) }
  }, [active])

  return <canvas ref={canvasRef} style={{ width: '100%', height: '32px', display: 'block' }} />
}

const LOG_PREFIXES = [
  'Initializing thought chain...',
  'Analyzing query structure...',
  'Evaluating logical options...',
  'Resolving complex steps...',
  'Drafting step solution...',
  'Formulating final answer...',
]

export function ReasoningEngine({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [input, setInput]               = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const { messages, isStreaming, error, send } = useStream(streamReasoning, apiKey)
  const [elapsed, setElapsed]           = useState(0)
  const timerRef                        = useRef(null)
  const endRef                          = useRef(null)
  const [isMobile, setIsMobile]         = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const reasoningModels = models.filter(m => m.category === 'reasoning')

  useEffect(() => {
    if (selectedModelId && reasoningModels.find(m => m.id === selectedModelId)) {
      setSelectedModel(selectedModelId)
    } else if (reasoningModels.length > 0 && !selectedModel) {
      setSelectedModel(reasoningModels[0].id)
    }
  }, [selectedModelId, reasoningModels, selectedModel])

  const handleModelChange = e => { setSelectedModel(e.target.value); setSelectedModelId(e.target.value) }

  useEffect(() => {
    if (isStreaming) {
      setElapsed(0)
      const start = Date.now()
      timerRef.current = setInterval(() => setElapsed((Date.now() - start) / 1000), 100)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isStreaming])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = (preset = null) => {
    const msg = preset || input
    if (!msg.trim() || !selectedModel || isStreaming) return
    if (!preset) setInput('')
    send(selectedModel, msg, { max_tokens: 2048 })
  }

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const activeMsg = messages[messages.length - 1]
  const isAI = activeMsg?.role === 'assistant'

  const renderReasoning = (text) => {
    if (!text) return null
    return text.split('\n\n').filter(Boolean).map((p, idx) => (
      <div key={idx} className="glass-card" style={{
        padding: '14px 18px',
        marginBottom: '12px',
        background: 'rgba(200, 112, 42, 0.05)',
        border: '1px solid rgba(200, 112, 42, 0.15)',
        borderRadius: '16px',
        boxShadow: 'var(--clay-shadow-light)',
        transition: 'all 0.2s',
      }}>
        <div style={{
          fontSize: '9.5px', fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--amber-c)', letterSpacing: '0.08em', marginBottom: '8px',
          fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--amber-c)', display: 'inline-block' }} />
          [+{(idx * 1.85).toFixed(2)}s] {LOG_PREFIXES[idx] || 'INFERENTIAL EXPANSION'}
        </div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: "'Inter', sans-serif" }}>
          {p}
        </div>
      </div>
    ))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <div className="dot-grid" />
      <div className="ambient-blob" style={{ width: 500, height: 500, top: '-10%', left: '20%', background: 'radial-gradient(circle, rgba(200,112,42,0.06), transparent)' }} />

      {/* Top bar */}
      <div className="top-bar" style={{ zIndex: 2 }}>
        <span className="cognitive-label" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>COGNITIVE MODEL</span>
        <select
          className="field-input model-select-dropdown"
          value={selectedModel}
          onChange={handleModelChange}
          style={{ padding: '6px 32px 6px 10px', fontSize: '11px', color: 'var(--amber-c)' }}
        >
          {reasoningModels.length === 0
            ? <option>Loading models…</option>
            : reasoningModels.map(m => <option key={m.id} value={m.id} style={{ background: 'var(--bg-panel)' }}>{m.id.split('/').pop()}</option>)
          }
        </select>
        <div style={{ flex: 1 }} />
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 600,
          letterSpacing: '0.1em', color: 'var(--amber-b)',
          background: 'rgba(200,112,42,0.07)', border: '1px solid rgba(200,112,42,0.18)',
          padding: '4px 10px', borderRadius: '12px',
        }}>
          ⊕ REASONING ONLINE
        </div>
      </div>

      {/* Empty state */}
      {messages.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '28px', padding: '40px', zIndex: 1 }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 600,
              letterSpacing: '0.2em', background: 'var(--grad-main)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>
              ⊕ SYNAPTIC CORE SYSTEM ⊕
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7, maxWidth: '400px' }}>
              Submit a logic, proof, or mathematics query to see the multi-step chain of thought unfold.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%', maxWidth: '640px' }}>
            {[
              { label: "What is the last digit of 7^7^7^7?",       icon: '🔢' },
              { label: "Prove there are infinitely many primes",    icon: '📐' },
              { label: "Explain rigorously why 0.999… = 1",         icon: '♾️' },
              { label: "How many r's in 'strawberry'?",             icon: '🍓' },
            ].map(p => (
              <button
                key={p.label}
                className="glass-card btn"
                onClick={() => handleSend(p.label)}
                style={{ padding: '16px 18px', textAlign: 'left', display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px', lineHeight: 1.4, height: 'auto' }}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(200,112,42,0.3)'; e.currentTarget.style.background = 'rgba(200,112,42,0.03)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-base)'; e.currentTarget.style.background = '' }}
              >
                <span style={{ fontSize: '18px' }}>{p.icon}</span>
                <span style={{ color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>
          {/* Wave indicator */}
          <div style={{ background: 'rgba(17,16,9,0.7)', backdropFilter: 'blur(8px)', padding: '2px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <ThinkingWave active={isStreaming} />
          </div>

          {error && (
            <div className="error-box" style={{ margin: '16px 20px 0' }}>
              <span style={{ fontSize: '14px' }}>⚠️</span>
              <div>
                <span className="error-box-title">REASONING ERROR</span>
                <span className="error-box-body">
                  {error.includes('Not found for account') || error.includes('404')
                    ? 'This reasoning model is not available for your account tier. Please select a different model above.'
                    : `We couldn't get a reasoning response. Details: ${error}`}
                </span>
              </div>
            </div>
          )}

          {/* Split: chain of thought | final answer */}
          <div className="reasoning-split" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: Chain of thought */}
            <div className="reasoning-chain-panel" style={{
              flex: 1, borderRight: '1px solid var(--border-subtle)',
              padding: '24px', overflowY: 'auto',
              background: 'rgba(200, 112, 42, 0.01)',
            }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: '18px',
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 600,
                  letterSpacing: '0.15em', color: 'var(--amber-b)', display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  {isStreaming ? (
                    <svg style={{ animation: 'spin-slow 2s linear infinite' }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M12 2v20M17 5H7M19 12H5M17 19H7" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--amber-c)', display: 'inline-block', boxShadow: '0 0 6px rgba(245, 169, 61, 0.6)' }} />
                  )}
                  THINKING PROCESS
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'var(--text-dim)' }}>
                  {elapsed.toFixed(1)}s
                </span>
              </div>

              {messages.map((msg, i) => msg.role === 'user' ? (
                <div key={i} className="glass-card" style={{
                  padding: '14px 18px',
                  marginBottom: '14px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  fontFamily: "'Inter', sans-serif", fontSize: '13px', color: 'var(--text-primary)',
                  boxShadow: 'var(--clay-shadow-light)'
                }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8.5px', color: 'var(--text-dim)', marginBottom: '5px', letterSpacing: '0.15em', fontWeight: 700 }}>YOU ›</div>
                  {msg.content}
                </div>
              ) : (
                <React.Fragment key={i}>
                  {renderReasoning(msg.reasoning)}
                  {msg.isStreaming && !msg.reasoning && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', padding: '8px 12px' }}>
                      <span className="terminal-cursor" style={{ width: '5px', height: '11px', background: 'var(--amber-b)' }} />
                      AI is thinking...
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Right: Final answer */}
            <div className="reasoning-answer-panel" style={{ flex: 1, padding: '24px', overflowY: 'auto', background: 'rgba(12, 10, 8, 0.1)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 600, letterSpacing: '0.15em', color: 'var(--text-dim)' }}>
                ANSWER
              </div>

              {isAI && (
                <>
                  {!activeMsg.isStreaming && activeMsg.reasoning && (
                    <div style={{
                      display: 'inline-flex', alignSelf: 'flex-start',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 700,
                      color: 'var(--amber-c)', background: 'rgba(200, 112, 42, 0.08)',
                      border: '1px solid rgba(200, 112, 42, 0.2)', padding: '5px 12px', borderRadius: '12px',
                      boxShadow: 'var(--clay-shadow-btn)'
                    }}>
                      Reasoned for {elapsed.toFixed(1)}s ({activeMsg.reasoning.split(/\s+/).length} words)
                    </div>
                  )}

                  <div className="glass-card" style={{
                    padding: '22px 24px',
                    fontFamily: "'Inter', sans-serif", fontSize: '14px', lineHeight: 1.8, color: 'var(--text-primary)',
                    boxShadow: 'var(--clay-shadow-dark)',
                    background: 'rgba(26, 23, 16, 0.4)'
                  }}>
                    <div className="md-content">
                      <Markdown remarkPlugins={[remarkGfm]} components={{
                        code({ node, inline, className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '')
                          return !inline && match ? (
                            <SyntaxHighlighter {...props} children={String(children).replace(/\n$/, '')} style={vscDarkPlus} language={match[1]} PreTag="div"
                              customStyle={{ background: 'rgba(12,10,8,0.8)', borderRadius: '6px', fontSize: '12px', margin: '12px 0', border: '1px solid var(--border-base)', padding: '12px 16px' }}
                            />
                          ) : (
                            <code style={{ background: 'rgba(200,112,42,0.08)', border: '1px solid rgba(200,112,42,0.15)', padding: '1px 5px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--amber-c)' }}>
                              {children}
                            </code>
                          )
                        }
                      }}>
                        {activeMsg.content || ''}
                      </Markdown>
                    </div>
                    {activeMsg.isStreaming && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                        <span className="terminal-cursor" style={{ background: 'var(--amber-c)' }} />
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5px', color: 'var(--amber-b)', letterSpacing: '0.08em' }}>Streaming answer...</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="input-row" style={{ zIndex: 2 }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: '13px', top: '12px', fontFamily: "'JetBrains Mono', monospace", fontSize: '13px', color: 'var(--text-dim)', pointerEvents: 'none' }}>››</span>
            <textarea
              className="field-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={isMobile ? "Ask a question..." : "Ask a logical or mathematical question... (Enter to send)"}
              rows={Math.min(5, (input.match(/\n/g) || []).length + 1)}
              style={{ paddingLeft: '34px' }}
            />
          </div>
          <button
            className={`btn ${input.trim() && !isStreaming ? 'btn-primary' : ''}`}
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming}
            style={{ height: '44px', padding: '0 22px', flexShrink: 0 }}
          >
            {isStreaming ? (
              <><span className="status-dot status-dot-active" /> THINKING</>
            ) : 'THINK ›'}
          </button>
        </div>
      </div>
    </div>
  )
}
