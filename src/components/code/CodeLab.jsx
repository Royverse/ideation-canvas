/**
 * @file CodeLab.jsx
 * @description Code workspace: a conversation on the left, and the code blocks
 * lifted out of the latest reply on the right, ready to copy or download.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-async'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
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
import { useHealth } from '../../hooks/useHealthContext'
import { explainError } from '../../lib/errors'
import { PALETTE } from '../../theme'

/** Models that write the best code, best default first. */
const PREFERRED = ['codestral', 'coder', 'granite', 'llama-3.3', 'llama-3.1']

/** Fence language → file extension, for the download filename. */
const EXTENSIONS = {
  javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
  python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', yaml: 'yml',
  rust: 'rs', go: 'go', cpp: 'cpp', c: 'c', java: 'java', ruby: 'rb',
  bash: 'sh', shell: 'sh', sh: 'sh', sql: 'sql',
}

/** First moves offered on the empty transcript. */
const OPENERS = [
  'Write a fast Fibonacci function in Go',
  'Create a CSS Grid dashboard layout',
  'Design an async task queue in Python',
  'Build a custom React debounce hook',
]

/**
 * Pulls fenced code blocks out of a Markdown reply.
 *
 * The closing fence is optional so a block that is still streaming appears in
 * the workspace as it is written, rather than popping in once complete.
 *
 * @param {string} text - Markdown source.
 * @returns {Array<{id: number, language: string, code: string}>} Blocks in order.
 */
function extractCodeBlocks(text) {
  if (!text) return []
  const blocks = []
  const fence = /```(\w*)\n([\s\S]*?)(?:\n```|$)/g
  let match
  let id = 1
  while ((match = fence.exec(text)) !== null) {
    const code = match[2]
    if (code.trim()) blocks.push({ id: id++, language: match[1] || 'plaintext', code })
  }
  return blocks
}

export function CodeLab({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [input, setInput] = useState('')
  const [temperature, setTemperature] = useState(0.3)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [systemPrompt, setSystemPrompt] = useState(
    'You are an expert software engineering assistant. Write clean, well-documented, high-performance code. Focus on correctness and edge cases.',
  )
  const [activeBlockId, setActiveBlockId] = useState(1)
  const [fileName, setFileName] = useState('')
  const [copied, setCopied] = useState(false)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const [showParams, setShowParams] = useState(!isMobile)
  const [isDragging, setIsDragging] = useState(false)

  // Remembered alongside the layout it was set in, so crossing the breakpoint
  // returns to that layout's default split instead of an inherited one.
  const [split, setSplit] = useState({ mode: null, percent: 0 })
  const mode = isMobile ? 'mobile' : 'desktop'
  const splitPercent = split.mode === mode ? split.percent : (isMobile ? 40 : 45)

  const containerRef = useRef(null)
  const endRef = useRef(null)

  // Code models are scarce on some account tiers, so general chat models are
  // offered too — most of them write serviceable code.
  const { partition } = useHealth()

  const codeModels = useMemo(
    () => models.filter((m) => m.category === 'code' || m.category === 'chat'),
    [models],
  )

  // Only offer models believed to work. Because the list is derived from
  // live health, a model that starts failing drops out of it and the
  // selection moves to the next healthy one without the user acting.
  const { usable } = useMemo(() => partition(codeModels), [partition, codeModels])

  const { modelId, selectModel } = useModelPicker(usable, {
    selectedModelId,
    setSelectedModelId,
    prefer: PREFERRED,
  })

  const { messages, isStreaming, error, send, stop, clearMessages } = useStream(streamChat, apiKey)
  const telemetry = useStreamTelemetry(messages, isStreaming)

  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const raw = isMobile
        ? ((e.clientY - rect.top) / rect.height) * 100
        : ((e.clientX - rect.left) / rect.width) * 100
      const [min, max] = isMobile ? [20, 80] : [25, 75]
      setSplit({
        mode: isMobile ? 'mobile' : 'desktop',
        percent: Math.max(min, Math.min(max, raw)),
      })
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

  const lastReply = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant'),
    [messages],
  )
  const codeBlocks = useMemo(
    () => extractCodeBlocks(lastReply?.content),
    [lastReply?.content],
  )
  const activeBlock = codeBlocks.find((b) => b.id === activeBlockId) ?? codeBlocks[0]

  // Suggest a filename from the block's language, but leave a name the user
  // typed alone — renaming under them would lose their edit.
  const suggestedName = activeBlock
    ? `solution.${EXTENSIONS[activeBlock.language.toLowerCase()] ?? 'txt'}`
    : ''
  const effectiveName = fileName || suggestedName

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

  const handleCopy = async () => {
    if (activeBlock && await copyText(activeBlock.code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    if (!activeBlock) return
    const url = URL.createObjectURL(new Blob([activeBlock.code], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = effectiveName || 'solution.txt'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url) // Otherwise every download leaks its blob.
  }

  const provider = getProvider(modelId)
  const modelName = modelId ? modelId.split('/').pop().toUpperCase() : 'MODEL'

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}>
      <div className="dot-grid" />
      <div
        className="ambient-blob"
        style={{
          width: 350, height: 350, top: '0%', right: '8%',
          background: `radial-gradient(circle, ${PALETTE.violet}, transparent)`,
        }}
      />

      {/* ── SETTINGS RAIL ───────────────────────────────────────────────── */}
      {showParams && (
        <div
          style={{
            width: '236px', display: 'flex', flexDirection: 'column', flexShrink: 0,
            background: 'rgba(7, 7, 26, 0.9)', backdropFilter: 'blur(16px)',
            position: 'relative', zIndex: 2,
          }}
        >
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '1px', background: 'var(--grad-line-v)', opacity: 0.25 }} />

          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="field-caption">Generation settings</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label className="field-label" htmlFor="code-system-prompt">Instructions</label>
              <textarea
                id="code-system-prompt"
                className="field-input"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                style={{ resize: 'vertical', minHeight: '80px' }}
                placeholder="Set the standards the generated code should meet…"
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label" htmlFor="code-temperature" style={{ marginBottom: 0 }}>Creativity</label>
                <span className="field-value">{temperature.toFixed(2)}</span>
              </div>
              <input
                id="code-temperature"
                type="range" min="0" max="1.2" step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
              />
              <span className="field-hint">Keep this low. Code rewards predictability.</span>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label className="field-label" htmlFor="code-max-tokens" style={{ marginBottom: 0 }}>Reply length</label>
                <span className="field-value">{maxTokens} tokens</span>
              </div>
              <input
                id="code-max-tokens"
                type="range" min="512" max="4096" step="256"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
              <div className="field-label" style={{ marginBottom: '12px' }}>Performance</div>
              <div className="glass-card" style={{ padding: '14px', background: 'rgba(3, 3, 9, 0.45)' }}>
                <StreamTelemetry {...telemetry} />
                <div className="tele-chip">
                  <span>Code blocks</span>
                  <span className="tele-val">{codeBlocks.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 1 }}>
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

          <ModelSelect label="Model" models={codeModels} value={modelId} onChange={selectModel} />

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
            Clear
          </button>
        </div>

        <div ref={containerRef} className="codelab-split" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Conversation */}
          <div
            className="code-conversation-panel"
            style={{
              width: isMobile ? '100%' : `${splitPercent}%`,
              height: isMobile ? `${splitPercent}%` : '100%',
              flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {error && (
                <div className="error-box fade-up" role="alert">
                  <span aria-hidden="true" style={{ fontSize: '14px', marginTop: '1px' }}>◈</span>
                  <div>
                    <span className="error-box-title">Generation failed</span>
                    <span className="error-box-body">{explainError(error)}</span>
                  </div>
                </div>
              )}

              {messages.length === 0 && (
                <div className="fade-up empty-state">
                  <div className="empty-state-eyebrow">Code lab</div>
                  <p className="empty-state-body">
                    Describe what you need. Every code block in the reply is lifted
                    into the workspace on the {isMobile ? 'bottom' : 'right'}, where
                    you can read, copy, or download it.
                  </p>
                  <div className="empty-state-chips">
                    {OPENERS.map((opener) => (
                      <button
                        key={opener}
                        type="button"
                        className="btn"
                        onClick={() => submit(opener)}
                        disabled={!modelId || isStreaming}
                        style={{ textAlign: 'left', padding: '8px 12px', fontSize: '10.5px' }}
                      >
                        {opener}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`stream-in ${msg.role === 'user' ? 'msg-user' : 'msg-ai'}`} style={{ maxWidth: '100%' }}>
                  <div className="msg-meta" style={{ color: msg.role === 'user' ? PALETTE.blue : PALETTE.violet }}>
                    {msg.role === 'user' ? 'You' : modelName}
                  </div>
                  <div className={`code-turn ${msg.role === 'user' ? 'code-turn-user' : 'code-turn-ai'}`}>
                    {msg.role === 'user' ? msg.content : (
                      <>
                        {msg.isStreaming && !msg.content ? (
                          <span style={{ color: 'var(--text-secondary)' }}>Writing…</span>
                        ) : (
                          <MarkdownMessage>{msg.content}</MarkdownMessage>
                        )}
                        {msg.isStreaming && <span className="terminal-cursor" style={{ background: PALETTE.violet }} />}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <div className="input-row">
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <span className="composer-caret" style={{ left: '11px', top: '11px' }} aria-hidden="true">›</span>
                  <textarea
                    className="field-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    aria-label="Describe the code you need"
                    placeholder={isMobile ? 'What should it do?' : 'What should it do? — Enter to send'}
                    rows={Math.min(4, (input.match(/\n/g) || []).length + 1)}
                    style={{ paddingLeft: '26px' }}
                  />
                </div>
                {isStreaming ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={stop}
                    style={{ height: '40px', padding: '0 16px', flexShrink: 0, fontSize: '10.5px' }}
                  >
                    <span className="stop-glyph" aria-hidden="true" /> Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`btn ${input.trim() ? 'btn-primary' : ''}`}
                    onClick={handleSend}
                    disabled={!input.trim() || !modelId}
                    style={{ height: '40px', padding: '0 16px', flexShrink: 0, fontSize: '10.5px' }}
                  >
                    Generate
                  </button>
                )}
              </div>
            </div>
          </div>

          <div
            className={`${isMobile ? 'resizer-v' : 'resizer-h'}${isDragging ? ' dragging' : ''}`}
            onPointerDown={(e) => { setIsDragging(true); e.preventDefault() }}
            role="separator"
            aria-orientation={isMobile ? 'horizontal' : 'vertical'}
            aria-label="Resize code workspace"
          />

          {/* Workspace */}
          <div
            className="code-workspace-panel"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(3, 3, 9, 0.4)' }}
          >
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {!activeBlock ? (
                <div className="empty-state" style={{ height: '100%', justifyContent: 'center', opacity: 0.5 }}>
                  <div className="empty-state-eyebrow">Workspace</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', maxWidth: '240px', lineHeight: 1.6 }}>
                    Code from the reply lands here, ready to copy or download.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                  {codeBlocks.length > 1 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }} role="tablist" aria-label="Code blocks">
                      {codeBlocks.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          role="tab"
                          aria-selected={activeBlock.id === b.id}
                          className={`btn${activeBlock.id === b.id ? ' btn-primary' : ''}`}
                          onClick={() => { setActiveBlockId(b.id); setFileName('') }}
                          style={{ padding: '4px 10px', fontSize: '9px' }}
                        >
                          #{b.id} {b.language}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="file-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span aria-hidden="true" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>◆</span>
                      <input
                        className="file-name-input"
                        value={effectiveName}
                        onChange={(e) => setFileName(e.target.value)}
                        aria-label="Filename for download"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      <button
                        type="button"
                        className="btn"
                        onClick={handleCopy}
                        style={{ padding: '3px 10px', fontSize: '9px', color: copied ? PALETTE.mint : undefined }}
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                      <button type="button" className="btn" onClick={handleDownload} style={{ padding: '3px 10px', fontSize: '9px' }}>
                        Download
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      flex: 1, border: '1px solid var(--border-base)', borderTop: 'none',
                      borderRadius: '0 0 10px 10px', overflow: 'auto', background: 'rgba(3, 3, 9, 0.9)',
                    }}
                  >
                    <SyntaxHighlighter
                      language={activeBlock.language}
                      style={vscDarkPlus}
                      showLineNumbers
                      customStyle={{ margin: 0, padding: '14px 16px', background: 'transparent', fontSize: '12px', minHeight: '100%' }}
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
