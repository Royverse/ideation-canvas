import React, { useState, useEffect, useRef } from 'react'
import { streamChat } from '../../api/nvidia'
import { useStream } from '../../hooks/useStream'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

function getProvider(modelId) {
  const id = modelId.toLowerCase()
  if (id.includes('nvidia') || id.includes('nemotron')) return { name: 'NVIDIA',    color: '#5ab87a' }
  if (id.includes('meta')   || id.includes('llama'))    return { name: 'META',      color: '#4fa3d4' }
  if (id.includes('mistral') || id.includes('codestral')) return { name: 'MISTRAL', color: '#e0884080' }
  if (id.includes('microsoft') || id.includes('phi'))   return { name: 'MSFT',      color: '#4fa3d4' }
  if (id.includes('google') || id.includes('gemma'))    return { name: 'GOOGLE',    color: '#c8702a' }
  if (id.includes('qwen'))                              return { name: 'QWEN',      color: '#8b6fd4' }
  if (id.includes('deepseek'))                          return { name: 'DEEPSEEK',  color: '#4fa3d4' }
  return { name: 'MODEL', color: 'var(--text-secondary)' }
}

function CodeBlock({ inline, className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '')
  const [copied, setCopied] = React.useState(false)
  const language = match ? match[1] : 'plaintext'
  const codeString = String(children).replace(/\n$/, '')

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!inline && match) {
    return (
      <div style={{ margin: '12px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-base)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', padding: '6px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{language}</span>
          <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: copied ? 'var(--accent-green)' : 'var(--text-dim)', transition: 'color 0.2s' }}>
            {copied ? '✓ COPIED' : '⧉ COPY'}
          </button>
        </div>
        <SyntaxHighlighter
          {...props}
          children={codeString}
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{ background: 'rgba(12,10,8,0.8)', margin: 0, padding: '12px 16px', fontSize: '11.5px' }}
        />
      </div>
    )
  }

  return (
    <code {...props} className={`md-content ${className || ''}`} style={{
      background: 'rgba(200,112,42,0.08)', border: '1px solid rgba(200,112,42,0.15)',
      padding: '1px 5px', borderRadius: '4px', fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11.5px', color: 'var(--amber-c)',
    }}>
      {children}
    </code>
  )
}

function mdComponents() {
  return { code: CodeBlock }
}

export function ChatArena({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [input, setInput]           = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [temperature, setTemperature]   = useState(0.7)
  const [maxTokens, setMaxTokens]       = useState(1024)
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful, precise assistant.')
  const [showParams, setShowParams]     = useState(true)
  const [copiedId, setCopiedId]         = useState(null)

  const containerRef = useRef(null)
  const [paramsWidth, setParamsWidth] = useState(240)
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      // reset size defaults depending on orientation
      setParamsWidth(mobile ? 180 : 240)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handlePointerDown = (e) => {
    setIsDragging(true)
    e.preventDefault()
  }

  useEffect(() => {
    if (!isDragging) return

    const handlePointerMove = (e) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (isMobile) {
        const topHeightPx = e.clientY - rect.top
        const newHeight = Math.max(120, Math.min(rect.height - 180, topHeightPx))
        setParamsWidth(newHeight)
      } else {
        const leftWidthPx = e.clientX - rect.left
        const newWidth = Math.max(180, Math.min(Math.min(480, rect.width - 320), leftWidthPx))
        setParamsWidth(newWidth)
      }
    }

    const handlePointerUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging, isMobile])

  const { messages, isStreaming, error, send, clearMessages } = useStream(streamChat, apiKey)
  const endRef = useRef(null)

  const handleCopyMessage = (text, idx) => {
    navigator.clipboard.writeText(text)
    setCopiedId(idx)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Telemetry
  const [latency, setLatency]   = useState(0)
  const [tps, setTps]           = useState(0)
  const startRef                = useRef(null)
  const firstTokenRef           = useRef(null)

  const chatModels = models.filter(m => m.category === 'chat')

  useEffect(() => {
    if (selectedModelId && chatModels.find(m => m.id === selectedModelId)) {
      setSelectedModel(selectedModelId)
    } else if (chatModels.length > 0 && !selectedModel) {
      setSelectedModel(chatModels[0].id)
    }
  }, [selectedModelId, chatModels, selectedModel])

  const handleModelChange = e => {
    setSelectedModel(e.target.value)
    setSelectedModelId(e.target.value)
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (isStreaming) {
      startRef.current = Date.now()
      firstTokenRef.current = null
      setLatency(0); setTps(0)
    } else if (startRef.current) {
      const t = (Date.now() - startRef.current) / 1000
      const chars = messages[messages.length - 1]?.content?.length || 0
      const approx = Math.max(1, Math.round(chars / 4))
      if (t > 0) setTps(approx / t)
    }
  }, [isStreaming])

  useEffect(() => {
    if (isStreaming && messages.length > 0 && startRef.current) {
      const last = messages[messages.length - 1]
      if (last?.role === 'assistant' && last.content.length > 0 && !firstTokenRef.current) {
        firstTokenRef.current = Date.now()
        setLatency(firstTokenRef.current - startRef.current)
      }
    }
  }, [messages, isStreaming])

  const handleSend = () => {
    if (!input.trim() || !selectedModel || isStreaming) return
    const msg = input; setInput('')
    send(selectedModel, msg, { temperature, max_tokens: maxTokens, systemPrompt: systemPrompt.trim() || undefined })
  }

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const provider = selectedModel ? getProvider(selectedModel) : null
  const totalWords = messages.reduce((a, m) => a + (m.content?.split(/\s+/).length || 0), 0)

  return (
    <div ref={containerRef} className="arena-split" style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {/* Subtle ambient bg */}
      <div className="dot-grid" />
      <div className="ambient-blob" style={{ width: 400, height: 400, top: '-5%', right: '5%', background: 'radial-gradient(circle, var(--amber-a), transparent)' }} />

      {/* ── PARAMS PANEL ────────────────────────────────────────────── */}
      {showParams && (
        <div className="params-panel-chat" style={{
          width: isMobile ? '100%' : `${paramsWidth}px`,
          height: isMobile ? `${paramsWidth}px` : '100%',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          background: 'rgba(17, 16, 9, 0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 2,
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 600, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>
              CHAT SETTINGS
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* System Prompt */}
            <div>
              <label className="field-label">Instructions (System Prompt)</label>
              <textarea
                className="field-input"
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={isMobile ? 2 : 4}
                placeholder="Give the AI a role or guidelines..."
              />
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '4px', lineHeight: 1.3 }}>
                Guides the AI's behavior, personality, and expertise.
              </span>
            </div>

            {/* Temperature */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label" style={{ marginBottom: 0 }}>Creativity (Temperature)</label>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--amber-c)', fontWeight: 600 }}>{temperature.toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="1.5" step="0.05" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '4px', lineHeight: 1.3 }}>
                Higher values make responses more creative but less predictable.
              </span>
            </div>

            {/* Max tokens */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label" style={{ marginBottom: 0 }}>Max Length (Tokens)</label>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--amber-c)', fontWeight: 600 }}>{maxTokens}</span>
              </div>
              <input type="range" min="128" max="4096" step="128" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))} />
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', display: 'block', marginTop: '4px', lineHeight: 1.3 }}>
                Limits the maximum length of the AI's response.
              </span>
            </div>

            {/* Telemetry */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
              <div className="field-label" style={{ marginBottom: '12px' }}>Performance (Telemetry)</div>
              <div className="glass-card" style={{ padding: '14px', background: 'rgba(12, 10, 8, 0.45)' }}>
                <div className="tele-chip">
                  <span>Response Time</span>
                  <span className="tele-val">{latency > 0 ? `${latency}ms` : '—'}</span>
                </div>
                <div className="tele-chip">
                  <span>Speed</span>
                  <span className="tele-val">{tps > 0 ? `${tps.toFixed(1)} tokens/sec` : '—'}</span>
                </div>
                <div className="progress-track" style={{ height: '3px', borderRadius: '4px' }}>
                  <div className="progress-fill" style={{ width: tps > 0 ? `${Math.min(100, (tps / 120) * 100)}%` : '0%', borderRadius: '4px' }} />
                </div>
                <div className="tele-chip" style={{ marginTop: '8px' }}>
                  <span>Word Count</span>
                  <span className="tele-val">{totalWords}</span>
                </div>
                <div className="tele-chip">
                  <span>Chat Turns</span>
                  <span className="tele-val">{Math.floor(messages.length / 2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showParams && (
        isMobile ? (
          <div className={`resizer-v${isDragging ? ' dragging' : ''}`} onPointerDown={handlePointerDown} />
        ) : (
          <div className={`resizer-h${isDragging ? ' dragging' : ''}`} onPointerDown={handlePointerDown} />
        )
      )}

      {/* ── MAIN PANEL ──────────────────────────────────────────────── */}
      <div className="chat-main-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>

        {/* Top bar */}
        <div className="top-bar">
          <button className="btn" onClick={() => setShowParams(!showParams)} style={{ padding: '6px 12px', fontSize: '10px' }}>
            {showParams ? '◀' : '▶'} PARAMS
          </button>

          <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5px', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
            MODEL
          </span>
          <select
            className="field-input model-select-dropdown"
            value={selectedModel}
            onChange={handleModelChange}
            style={{ padding: '6px 32px 6px 10px', fontSize: '11px', color: 'var(--amber-c)' }}
          >
            {chatModels.length === 0
              ? <option>Loading models…</option>
              : chatModels.map(m => <option key={m.id} value={m.id} style={{ background: 'var(--bg-panel)' }}>{m.id.split('/').pop()}</option>)
            }
          </select>

          {provider && (
            <span className="provider-badge" style={{ color: provider.color, background: `${provider.color}14`, borderColor: `${provider.color}22` }}>
              {provider.name}
            </span>
          )}

          <div style={{ flex: 1 }} />

          <button className="btn btn-danger" onClick={clearMessages} style={{ padding: '6px 14px', fontSize: '10px' }}>
            ✕ RESET
          </button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}>
          {error && (
            <div className="error-box fade-up">
              <span style={{ fontSize: '14px', marginTop: '1px' }}>⚠️</span>
              <div>
                <span className="error-box-title">CONNECTION ERROR</span>
                <span className="error-box-body">
                  {error.includes('Not found for account') || error.includes('404')
                    ? 'This model is not available for your account tier. Free trial accounts get access to standard models like Llama, Gemma, and Mistral. Please select a different model above.'
                    : `We couldn't reach the model. Details: ${error}`}
                </span>
              </div>
            </div>
          )}

          {messages.length === 0 && (
            <div className="fade-up" style={{ margin: 'auto', maxWidth: '440px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.2em',
                background: 'var(--grad-main)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                ◈ MILKYWAY.AI ACTIVE ◈
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                A deep-space playground to query, benchmark, and converse with NVIDIA NIM models across the galaxy.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`stream-in ${msg.role === 'user' ? 'msg-user' : 'msg-ai'}`} style={{ width: msg.role === 'user' ? undefined : '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="msg-meta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: msg.role === 'user' ? 'var(--accent-blue)' : 'var(--amber-b)', width: '100%' }}>
                <div>
                  {msg.role === 'user'
                    ? 'YOU ›'
                    : `${selectedModel.split('/').pop().toUpperCase()} ›`}
                  {msg.isStreaming && <span className="status-dot status-dot-active" style={{ display: 'inline-block', marginLeft: 8, verticalAlign: 'middle' }} />}
                </div>
                {msg.role === 'assistant' && !msg.isStreaming && (
                  <button 
                    onClick={() => handleCopyMessage(msg.content, i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: copiedId === i ? 'var(--accent-green)' : 'var(--text-dim)',
                      fontSize: '9px',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'color 0.15s',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: copiedId === i ? 'rgba(90, 184, 122, 0.1)' : 'transparent'
                    }}
                  >
                    {copiedId === i ? '✓ COPIED' : '⧉ COPY'}
                  </button>
                )}
              </div>
              <div className={msg.role === 'user' ? 'msg-bubble-user' : 'msg-bubble-ai'}>
                {msg.role === 'user' ? (
                  msg.content
                ) : (
                  <>
                    <div className="md-content">
                      <Markdown remarkPlugins={[remarkGfm]} components={mdComponents()}>
                        {msg.content || ''}
                      </Markdown>
                    </div>
                    {msg.isStreaming && <span className="terminal-cursor" />}
                  </>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="input-row">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '13px', top: '12px',
                fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
                color: 'var(--text-dim)', pointerEvents: 'none',
              }}>›</span>
              <textarea
                className="field-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={isMobile ? "Type a message..." : "Type your message here... (Enter to send, Shift+Enter for newline)"}
                rows={Math.min(5, (input.match(/\n/g) || []).length + 1)}
                style={{ paddingLeft: '28px', lineHeight: 1.5 }}
              />
            </div>
            <button
              className={`btn ${input.trim() && !isStreaming ? 'btn-primary' : ''}`}
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              style={{ height: '44px', padding: '0 22px', flexShrink: 0 }}
            >
              {isStreaming ? (
                <>
                  <span className="status-dot status-dot-active" />
                  STREAMING
                </>
              ) : 'SEND ›'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
