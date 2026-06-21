import React, { useState, useEffect, useRef } from 'react'
import { streamChat } from '../../api/nvidia'
import { useStream } from '../../hooks/useStream'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

function extractCodeBlocks(text) {
  if (!text) return []
  const regex = /```(\w*)\n([\s\S]*?)\n```/g
  const blocks = []
  let match, id = 1
  while ((match = regex.exec(text)) !== null) {
    blocks.push({ id: id++, language: match[1] || 'plaintext', code: match[2] })
  }
  return blocks
}

const EXT_MAP = {
  javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
  python: 'py', py: 'py', html: 'html', css: 'css',
  rust: 'rs', go: 'go', cpp: 'cpp', c: 'c', java: 'java', ruby: 'rb',
}

function getProvider(modelId) {
  const id = modelId.toLowerCase()
  if (id.includes('nvidia') || id.includes('nemotron')) return { name: 'NVIDIA', color: '#5ab87a' }
  if (id.includes('meta')   || id.includes('llama'))   return { name: 'META',   color: '#4fa3d4' }
  if (id.includes('mistral') || id.includes('codestral')) return { name: 'MISTRAL', color: 'var(--amber-b)' }
  if (id.includes('microsoft') || id.includes('phi'))  return { name: 'MSFT',   color: '#4fa3d4' }
  if (id.includes('google') || id.includes('gemma'))   return { name: 'GOOGLE', color: 'var(--amber-c)' }
  if (id.includes('qwen'))                             return { name: 'QWEN',   color: '#8b6fd4' }
  if (id.includes('deepseek'))                         return { name: 'DEEPSEEK', color: '#4fa3d4' }
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
      fontSize: '11px', color: 'var(--amber-c)',
    }}>
      {children}
    </code>
  )
}

function mdComponents() {
  return { code: CodeBlock }
}

export function CodeLab({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [input, setInput]               = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [temperature, setTemperature]   = useState(0.3)
  const [maxTokens, setMaxTokens]       = useState(2048)
  const [systemPrompt, setSystemPrompt] = useState('You are an expert software engineering assistant. Write clean, well-documented, high-performance code. Focus on correctness and edge cases.')
  const [showParams, setShowParams]     = useState(true)
  const [activeTab, setActiveTab]       = useState('code')   // code | chat
  const [activeBlockId, setActiveBlockId] = useState(1)
  const [fileName, setFileName]         = useState('solution.js')
  const [copied, setCopied]             = useState(false)

  const containerRef = useRef(null)
  const [splitSize, setSplitSize] = useState(45) // percentage
  const [isDragging, setIsDragging] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      setSplitSize(mobile ? 40 : 45) // reset default size based on mobile
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
        const percent = (topHeightPx / rect.height) * 100
        setSplitSize(Math.max(20, Math.min(80, percent)))
      } else {
        const leftWidthPx = e.clientX - rect.left
        const percent = (leftWidthPx / rect.width) * 100
        setSplitSize(Math.max(25, Math.min(75, percent)))
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

  // Telemetry
  const [latency, setLatency]   = useState(0)
  const [tps, setTps]           = useState(0)
  const startRef                = useRef(null)
  const firstTokenRef           = useRef(null)

  const codeModels = models.filter(m => m.category === 'code' || m.category === 'chat')

  useEffect(() => {
    if (selectedModelId && codeModels.find(m => m.id === selectedModelId)) {
      setSelectedModel(selectedModelId)
    } else if (codeModels.length > 0 && !selectedModel) {
      const pref = codeModels.find(m =>
        m.id.includes('codestral') || m.id.includes('granite') ||
        m.id.includes('llama-3.3') || m.id.includes('llama-3.1')
      )
      setSelectedModel(pref ? pref.id : codeModels[0].id)
    }
  }, [selectedModelId, codeModels, selectedModel])

  const handleModelChange = e => {
    setSelectedModel(e.target.value); setSelectedModelId(e.target.value)
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (isStreaming) {
      startRef.current = Date.now(); firstTokenRef.current = null; setLatency(0); setTps(0)
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
        firstTokenRef.current = Date.now(); setLatency(firstTokenRef.current - startRef.current)
      }
    }
  }, [messages, isStreaming])

  const handleSend = (preset = null) => {
    const msg = preset || input
    if (!msg.trim() || !selectedModel || isStreaming) return
    if (!preset) setInput('')
    send(selectedModel, msg, { temperature, max_tokens: maxTokens, systemPrompt: systemPrompt.trim() || undefined })
  }

  const handleKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }

  const lastAI = [...messages].reverse().find(m => m.role === 'assistant')
  const codeBlocks = lastAI ? extractCodeBlocks(lastAI.content) : []
  const activeBlock = codeBlocks.find(b => b.id === activeBlockId) || codeBlocks[0]

  useEffect(() => {
    if (activeBlock) {
      const ext = EXT_MAP[activeBlock.language.toLowerCase()] || 'txt'
      setFileName(`solution.${ext}`)
    }
  }, [activeBlock?.language])

  const handleCopy = () => {
    if (!activeBlock) return
    navigator.clipboard.writeText(activeBlock.code); setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!activeBlock) return
    const blob = new Blob([activeBlock.code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = fileName
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const provider = selectedModel ? getProvider(selectedModel) : null

  const TABS = [
    { id: 'code', label: 'CODE WORKSPACE' },
    { id: 'chat', label: 'CONVERSATION' },
  ]

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div className="dot-grid" />
      <div className="ambient-blob" style={{ width: 350, height: 350, top: '0%', right: '8%', background: 'radial-gradient(circle, #8b6fd4, transparent)' }} />

      {/* ── PARAMS PANEL ─────────────────────────────────────────── */}
      {showParams && (
        <div style={{
          width: '236px', display: 'flex', flexDirection: 'column', flexShrink: 0,
          background: 'rgba(17,16,9,0.9)', backdropFilter: 'blur(16px)', position: 'relative', zIndex: 2,
        }}>
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '1px', background: 'var(--grad-line-v)', opacity: 0.25 }} />

          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 600, letterSpacing: '0.14em', color: 'var(--text-dim)' }}>
              ⌥ DEVELOPER DECK
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="field-label">Compiler Directives</label>
              <textarea className="field-input" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={6} style={{ resize: 'vertical', minHeight: '80px' }} placeholder="Instruct the code generator…" />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label" style={{ marginBottom: 0 }}>Temperature</label>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--amber-c)', fontWeight: 600 }}>{temperature.toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="1.2" step="0.05" value={temperature} onChange={e => setTemperature(parseFloat(e.target.value))} />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label" style={{ marginBottom: 0 }}>Max Tokens</label>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: 'var(--amber-c)', fontWeight: 600 }}>{maxTokens}</span>
              </div>
              <input type="range" min="512" max="4096" step="256" value={maxTokens} onChange={e => setMaxTokens(parseInt(e.target.value))} />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
              <div className="field-label" style={{ marginBottom: '12px' }}>Performance</div>
              <div style={{ background: 'rgba(12,10,8,0.5)', border: '1px solid var(--border-base)', borderRadius: '8px', padding: '12px 14px' }}>
                <div className="tele-chip"><span>Latency</span><span className="tele-val">{latency > 0 ? `${latency}ms` : '—'}</span></div>
                <div className="tele-chip"><span>Speed</span><span className="tele-val">{tps > 0 ? `${tps.toFixed(1)} T/s` : '—'}</span></div>
                <div className="progress-track"><div className="progress-fill" style={{ width: tps > 0 ? `${Math.min(100, (tps / 120) * 100)}%` : '0%' }} /></div>
                <div className="tele-chip" style={{ marginTop: '8px' }}><span>Code Blocks</span><span className="tele-val">{codeBlocks.length}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN PANEL ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>

        {/* Top bar */}
        <div className="top-bar">
          <button className="btn" onClick={() => setShowParams(!showParams)} style={{ padding: '6px 12px', fontSize: '10px' }}>
            {showParams ? '◀' : '▶'} DECK
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>CODER</span>
          <select
            className="field-input"
            value={selectedModel}
            onChange={handleModelChange}
            style={{ minWidth: '260px', padding: '6px 32px 6px 10px', fontSize: '11px', color: 'var(--amber-c)' }}
          >
            {codeModels.length === 0
              ? <option>Loading models…</option>
              : codeModels.map(m => <option key={m.id} value={m.id} style={{ background: 'var(--bg-panel)' }}>{m.id.split('/').pop()}</option>)
            }
          </select>
          {provider && (
            <span className="provider-badge" style={{ color: provider.color, background: `${provider.color}14`, borderColor: `${provider.color}22` }}>
              {provider.name}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-danger" onClick={clearMessages} style={{ padding: '6px 14px', fontSize: '10px' }}>✕ CLEAR</button>
        </div>

        {/* Split body */}
        <div ref={containerRef} className="codelab-split" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left: Conversation */}
          <div className="code-conversation-panel" style={{
            width: isMobile ? '100%' : `${splitSize}%`,
            height: isMobile ? `${splitSize}%` : '100%',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {error && (
                <div className="error-box fade-up">
                  <span style={{ fontSize: '14px', marginTop: '1px' }}>◈</span>
                  <div>
                    <span className="error-box-title">ENGINE REJECTED PROMPT</span>
                    <span className="error-box-body">
                      {error.includes('Not found for account') || error.includes('404')
                        ? 'Entitlement Error: This model is not accessible under your current NVIDIA account tier. Select a different model above.'
                        : error}
                    </span>
                  </div>
                </div>
              )}

              {messages.length === 0 && (
                <div className="fade-up" style={{ margin: 'auto', textAlign: 'center', maxWidth: '320px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', fontWeight: 600,
                    letterSpacing: '0.18em', background: 'var(--grad-main)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  }}>
                    ⌥ MILKYWAY.AI COMPILE ACTIVE ⌥
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                    A cosmic developer space to generate, compile, and run code. Choose a stellar template or type a request.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      'Write a fast Fibonacci function in Go',
                      'Create a CSS Grid dashboard layout',
                      'Design an async task queue in Python',
                      'Build a custom React debounce hook',
                    ].map((t, i) => (
                      <button
                        key={i}
                        className="btn"
                        onClick={() => handleSend(t)}
                        style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10.5px' }}
                      >
                        › {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`stream-in ${msg.role === 'user' ? 'msg-user' : 'msg-ai'}`} style={{ maxWidth: '100%' }}>
                  <div className="msg-meta" style={{ color: msg.role === 'user' ? 'var(--accent-blue)' : '#8b6fd4' }}>
                    {msg.role === 'user' ? 'INPUT ›' : `${selectedModel.split('/').pop().toUpperCase()} ›`}
                  </div>
                  <div style={{
                    background: msg.role === 'user' ? 'rgba(79,163,212,0.04)' : 'rgba(139,111,212,0.025)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(79,163,212,0.12)' : 'rgba(139,111,212,0.12)'}`,
                    borderLeft: `2px solid ${msg.role === 'user' ? 'var(--accent-blue)' : '#8b6fd4'}`,
                    borderRadius: '0 8px 8px 8px', padding: '11px 16px',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', lineHeight: 1.6, color: 'var(--text-primary)',
                  }}>
                    {msg.role === 'user' ? msg.content : (
                      <>
                        <div className="md-content"><Markdown remarkPlugins={[remarkGfm]} components={mdComponents()}>{msg.content || ''}</Markdown></div>
                        {msg.isStreaming && <span className="terminal-cursor" style={{ background: '#8b6fd4' }} />}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            {/* Input */}
            <div className="input-row">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '11px', top: '11px', fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: 'var(--text-dim)', pointerEvents: 'none' }}>›</span>
                  <textarea
                    className="field-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Code request… (Enter to send)"
                    rows={Math.min(4, (input.match(/\n/g) || []).length + 1)}
                    style={{ paddingLeft: '26px' }}
                  />
                </div>
                <button
                  className={`btn ${input.trim() && !isStreaming ? 'btn-primary' : ''}`}
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isStreaming}
                  style={{ height: '40px', padding: '0 16px', flexShrink: 0, fontSize: '10.5px' }}
                >
                  {isStreaming ? '…' : 'COMPILE'}
                </button>
              </div>
            </div>
          </div>

          {isMobile ? (
            <div className={`resizer-v${isDragging ? ' dragging' : ''}`} onPointerDown={handlePointerDown} />
          ) : (
            <div className={`resizer-h${isDragging ? ' dragging' : ''}`} onPointerDown={handlePointerDown} />
          )}

          {/* Right: Code Workspace */}
          <div className="code-workspace-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(12,10,8,0.4)' }}>
            {/* Tab bar */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'rgba(17,16,9,0.6)',
            }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '11px 18px', fontSize: '9.5px',
                    fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: '0.1em',
                    color: activeTab === tab.id ? 'var(--amber-c)' : 'var(--text-dim)',
                    borderBottom: `2px solid ${activeTab === tab.id ? 'var(--amber-b)' : 'transparent'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {!activeBlock ? (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', opacity: 0.45 }}>
                  <span style={{ fontSize: '28px' }}>⌥</span>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-dim)' }}>
                    MILKYWAY.AI WORKSPACE EMPTY
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center', maxWidth: '240px', lineHeight: 1.6 }}>
                    Generated code will be compiled here automatically to accelerate your exploration.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                  {/* Block selector */}
                  {codeBlocks.length > 1 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {codeBlocks.map(b => (
                        <button
                          key={b.id}
                          className={`btn${activeBlockId === b.id ? ' btn-primary' : ''}`}
                          onClick={() => setActiveBlockId(b.id)}
                          style={{ padding: '4px 10px', fontSize: '9px' }}
                        >
                          #{b.id} {b.language}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* File header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--bg-panel)', border: '1px solid var(--border-base)',
                    borderBottom: 'none', padding: '9px 14px',
                    borderRadius: '8px 8px 0 0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>📄</span>
                      <input
                        value={fileName}
                        onChange={e => setFileName(e.target.value)}
                        style={{
                          background: 'none', border: 'none', borderBottom: '1px solid transparent',
                          color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace",
                          fontSize: '11px', outline: 'none', width: '130px', padding: '1px 0',
                          transition: 'border-color 0.15s',
                        }}
                        onFocus={e => e.target.style.borderBottomColor = 'var(--amber-b)'}
                        onBlur={e => e.target.style.borderBottomColor = 'transparent'}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn" onClick={handleCopy} style={{ padding: '3px 10px', fontSize: '9px', color: copied ? 'var(--accent-green)' : undefined }}>
                        {copied ? '✓ COPIED' : 'COPY'}
                      </button>
                      <button className="btn" onClick={handleDownload} style={{ padding: '3px 10px', fontSize: '9px' }}>
                        EXPORT
                      </button>
                    </div>
                  </div>

                  {/* Code */}
                  <div style={{
                    flex: 1, border: '1px solid var(--border-base)',
                    borderRadius: '0 0 8px 8px', overflow: 'auto',
                    background: 'rgba(12,10,8,0.9)',
                  }}>
                    <SyntaxHighlighter
                      language={activeBlock.language}
                      style={vscDarkPlus}
                      showLineNumbers
                      customStyle={{
                        margin: 0, padding: '14px 16px', background: 'transparent',
                        fontSize: '12px', minHeight: '100%',
                      }}
                    >
                      {activeBlock.code}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
