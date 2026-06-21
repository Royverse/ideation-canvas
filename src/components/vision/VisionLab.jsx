import React, { useState, useEffect, useRef } from 'react'
import { streamVisionChat } from '../../api/nvidia'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function VisionLab({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [selectedModel, setSelectedModel] = useState('')
  const [imageSrc, setImageSrc]     = useState(null)
  const [imageBase64, setImageBase64] = useState(null)
  const [mimeType, setMimeType]     = useState(null)
  const [input, setInput]           = useState('')
  const [response, setResponse]     = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError]           = useState(null)

  // Scanner mode
  const [isScannerMode, setIsScannerMode]   = useState(false)
  const [scannerPos, setScannerPos]         = useState({ x: 0, y: 0, visible: false })
  const [cropPreview, setCropPreview]       = useState(null)
  const [scanResult, setScanResult]         = useState('')
  const [isScanning, setIsScanning]         = useState(false)
  const [imgSize, setImgSize]               = useState({ width: 0, height: 0 })

  const imgRef          = useRef(null)
  const canvasRef       = useRef(null)
  const tooltipRef      = useRef(null)
  const scannerPosRef   = useRef({ x: 0, y: 0 })
  const scanTimeoutRef  = useRef(null)

  const visionModels = models.filter(m => m.category === 'vision')

  useEffect(() => {
    if (selectedModelId && visionModels.find(m => m.id === selectedModelId)) {
      setSelectedModel(selectedModelId)
    } else if (visionModels.length > 0 && !selectedModel) {
      const nemotron = visionModels.find(m => m.id.toLowerCase().includes('nemotron'))
      setSelectedModel(nemotron ? nemotron.id : visionModels[0].id)
    }
  }, [selectedModelId, visionModels, selectedModel])

  const handleModelChange = e => { setSelectedModel(e.target.value); setSelectedModelId(e.target.value) }

  const handleImageLoad = () => {
    if (imgRef.current) {
      setImgSize({ width: imgRef.current.clientWidth, height: imgRef.current.clientHeight })
    }
  }

  useEffect(() => {
    const handleResize = () => {
      if (imgRef.current?.complete) setImgSize({ width: imgRef.current.clientWidth, height: imgRef.current.clientHeight })
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [imageSrc])

  // Scanner canvas animation
  useEffect(() => {
    if (!isScannerMode || !scannerPos.visible || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let frame, angle = 0

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const { x, y } = scannerPosRef.current
      angle += 0.04

      ctx.fillStyle = 'rgba(12,10,8,0.4)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath(); ctx.arc(x, y, 65, 0, Math.PI * 2); ctx.fill()
      ctx.restore()

      // crosshairs
      ctx.strokeStyle = 'rgba(200,112,42,0.2)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x - 90, y); ctx.lineTo(x + 90, y); ctx.moveTo(x, y - 90); ctx.lineTo(x, y + 90); ctx.stroke()

      // rings
      ctx.strokeStyle = 'rgba(200,112,42,0.35)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(x, y, 65, 0, Math.PI * 2); ctx.stroke()

      ctx.strokeStyle = 'var(--amber-c)'; ctx.lineWidth = 2.5
      ctx.beginPath(); ctx.arc(x, y, 61, angle, angle + Math.PI * 0.45); ctx.stroke()

      ctx.fillStyle = 'var(--amber-c)'
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill()

      frame = requestAnimationFrame(render)
    }
    render()
    return () => cancelAnimationFrame(frame)
  }, [isScannerMode, scannerPos.visible, imgSize])

  const handleMouseMove = e => {
    const canvas = canvasRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left, y = e.clientY - rect.top
    scannerPosRef.current = { x, y }
    if (!scannerPos.visible) setScannerPos({ x, y, visible: true })
    if (tooltipRef.current) {
      let l = x + 24, t = y + 24
      if (l + 220 > canvas.width) l = x - 234
      if (t + 200 > canvas.height) t = y - 200
      tooltipRef.current.style.left = `${l}px`; tooltipRef.current.style.top = `${t}px`
    }
    clearTimeout(scanTimeoutRef.current)
    setScanResult(''); setCropPreview(null)
    scanTimeoutRef.current = setTimeout(() => triggerScan(x, y), 600)
  }

  const handleMouseLeave = () => { setScannerPos(p => ({ ...p, visible: false })); clearTimeout(scanTimeoutRef.current) }

  const triggerScan = async (x, y) => {
    const img = imgRef.current, canvas = canvasRef.current
    if (!img || !canvas || !selectedModel || !apiKey) return
    const sx = img.naturalWidth / canvas.width, sy = img.naturalHeight / canvas.height
    const cw = 130 * sx, ch = 130 * sy
    let cx = x * sx - cw / 2, cy = y * sy - ch / 2
    cx = Math.max(0, Math.min(cx, img.naturalWidth - cw))
    cy = Math.max(0, Math.min(cy, img.naturalHeight - ch))
    const tmp = document.createElement('canvas'); tmp.width = 150; tmp.height = 150
    tmp.getContext('2d').drawImage(img, cx, cy, cw, ch, 0, 0, 150, 150)
    const dataUrl = tmp.toDataURL('image/jpeg', 0.85)
    setCropPreview(dataUrl); setIsScanning(true); setScanResult('')
    try {
      const gen = streamVisionChat(apiKey, {
        model: selectedModel, imageBase64: dataUrl.split(',')[1], mimeType: 'image/jpeg',
        userMessage: 'Describe what is in this image crop in one concise phrase (under 8 words). Be direct.', max_tokens: 50,
      })
      let t = ''; for await (const c of gen) { t += c; setScanResult(t) }
    } catch (e) { setScanResult(`Error: ${e.message}`) }
    finally { setIsScanning(false) }
  }

  const handleFileChange = e => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const d = ev.target.result; setImageSrc(d)
      const mime = d.split(':')[1].split(';')[0]; const b64 = d.split(',')[1]
      setMimeType(mime); setImageBase64(b64); setImgSize({ width: 0, height: 0 })
      setResponse(''); setError(null); setIsScannerMode(true)
    }
    reader.readAsDataURL(file)
  }

  const handleSend = async (preset = null) => {
    const msg = preset || input
    if (!msg.trim() || !selectedModel || isStreaming || !imageBase64) return
    if (!preset) setInput('')
    setResponse(''); setError(null); setIsStreaming(true)
    try {
      const gen = streamVisionChat(apiKey, { model: selectedModel, imageBase64, mimeType, userMessage: msg, max_tokens: 1024 })
      for await (const chunk of gen) setResponse(p => p + chunk)
    } catch (err) {
      const m = err.message
      setError(m.includes('Not found for account') || m.includes('404')
        ? 'This model is not available for your account tier. Please select a different model above.'
        : `We couldn't process the image. Details: ${m}`)
    } finally { setIsStreaming(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="dot-grid" />

      {/* Top bar */}
      <div className="top-bar" style={{ zIndex: 2 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9.5px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>VISION MODEL</span>
        <select
          className="field-input"
          value={selectedModel}
          onChange={handleModelChange}
          style={{ minWidth: '240px', padding: '6px 32px 6px 10px', fontSize: '11px', color: 'var(--amber-c)' }}
        >
          {visionModels.length === 0
            ? <option>Loading models…</option>
            : visionModels.map(m => <option key={m.id} value={m.id} style={{ background: 'var(--bg-panel)' }}>{m.id.split('/').pop()}</option>)
          }
        </select>

        {imageSrc && (
          <>
            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: !isScannerMode ? 'var(--amber-c)' : 'var(--text-dim)' }}>QUERY</span>
              {/* Toggle */}
              <button
                onClick={() => { setIsScannerMode(!isScannerMode); setScannerPos({ x: 0, y: 0, visible: false }); setScanResult(''); setCropPreview(null) }}
                style={{
                  width: '32px', height: '18px', borderRadius: '9px', cursor: 'pointer', outline: 'none',
                  background: isScannerMode ? 'rgba(200,112,42,0.15)' : 'var(--bg-elevated)',
                  border: `1px solid ${isScannerMode ? 'var(--amber-b)' : 'var(--border-base)'}`,
                  position: 'relative', transition: 'all 0.2s',
                }}
              >
                <div style={{
                  width: '12px', height: '12px', borderRadius: '50%',
                  background: isScannerMode ? 'var(--amber-c)' : 'var(--text-dim)',
                  position: 'absolute', top: '2px', left: isScannerMode ? '16px' : '2px',
                  transition: 'all 0.2s', boxShadow: isScannerMode ? '0 0 6px rgba(245,169,61,0.5)' : 'none',
                }} />
              </button>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: isScannerMode ? 'var(--amber-c)' : 'var(--text-dim)' }}>PROBE</span>
            </div>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', zIndex: 1 }}>

        {/* Left: Image panel */}
        <div style={{ flex: 1, borderRight: '1px solid var(--border-subtle)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="section-header" style={{ marginBottom: '4px' }}>
            UPLOAD IMAGE
          </div>

          {/* Drop zone */}
          <div
            className={isScannerMode ? 'scanline-overlay' : ''}
            style={{
              flex: 1, border: `1.5px ${imageSrc ? 'solid' : 'dashed'} var(--border-base)`,
              borderRadius: '16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
              background: imageSrc ? 'transparent' : 'rgba(17,16,9,0.3)',
              boxShadow: 'inset 2px 2px 5px rgba(0, 0, 0, 0.4)'
            }}
          >
            {imageSrc ? (
              <div style={{ position: 'relative', display: 'inline-flex', maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' }}>
                <img
                  ref={imgRef} src={imageSrc} onLoad={handleImageLoad} alt="Preview"
                  style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', borderRadius: '12px' }}
                />
                {isScannerMode && imgSize.width > 0 && (
                  <canvas
                    ref={canvasRef}
                    width={imgSize.width} height={imgSize.height}
                    onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
                    style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', cursor: 'none', zIndex: 5, borderRadius: '12px' }}
                  />
                )}
                {isScannerMode && scannerPos.visible && (
                  <div
                    ref={tooltipRef}
                    className="glass-card"
                    style={{
                      position: 'absolute', width: '220px',
                      padding: '12px', pointerEvents: 'none', zIndex: 10,
                      display: 'flex', flexDirection: 'column', gap: '7px',
                      left: `${scannerPos.x + 24}px`, top: `${scannerPos.y + 24}px`,
                      boxShadow: 'var(--clay-shadow-dark)',
                      background: 'rgba(26, 23, 16, 0.8)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8.5px', color: 'var(--amber-c)', fontWeight: 700, letterSpacing: '0.08em' }}>INTERACTIVE SCANNER</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--text-dim)' }}>130px</span>
                    </div>
                    <div style={{ width: '100%', height: '75px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-base)', background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {cropPreview ? <img src={cropPreview} alt="Crop" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: '8.5px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-dim)' }}>Capturing...</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif", lineHeight: 1.4, padding: '6px 10px', background: 'rgba(12,10,8,0.5)', border: '1px solid var(--border-subtle)', borderRadius: '8px', minHeight: '30px', boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.3)' }}>
                      {isScanning && !scanResult
                        ? <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: 'var(--amber-b)' }}>Analyzing...</span>
                        : scanResult || <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '11px', color: 'var(--text-dim)' }}>Move mouse over image to scan</span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-dim)', marginBottom: '12px' }}>
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>
                  <circle cx="12" cy="13" r="3"/>
                </svg>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>Click or drag an image here</div>
                <input type="file" accept="image/*" onChange={handleFileChange}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
              </>
            )}
          </div>

          {/* Quick prompts */}
          {imageSrc && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {['Describe this image in detail', 'What text appears here?', 'Identify objects in the image'].map(p => (
                <button key={p} className="btn" onClick={() => handleSend(p)}
                  style={{ fontSize: '9.5px', padding: '5px 10px' }}>
                  {p}
                </button>
              ))}
              <button className="btn btn-danger" onClick={() => { setImageSrc(null); setImageBase64(null); setResponse(''); setError(null) }}
                style={{ fontSize: '9.5px', padding: '5px 10px', marginLeft: 'auto' }}>
                ✕ Clear Image
              </button>
            </div>
          )}
        </div>

        {/* Right: Response */}
        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div className="section-header" style={{ marginBottom: '4px' }}>
            AI DESCRIPTION
          </div>

          {error && (
            <div className="error-box fade-up">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-coral)' }}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div>
                <span className="error-box-title">CONNECTION ERROR</span>
                <span className="error-box-body">{error}</span>
              </div>
            </div>
          )}

          <div style={{ flex: 1 }}>
            {!response && !isStreaming ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-dim)', marginBottom: '12px' }}>
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <div style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', fontWeight: 500, color: 'var(--text-dim)' }}>Upload an image and ask a question</div>
              </div>
            ) : (
              <div className="glass-card" style={{ padding: '22px 24px', fontFamily: "'Inter', sans-serif", fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.75, boxShadow: 'var(--clay-shadow-dark)', background: 'rgba(26, 23, 16, 0.45)' }}>
                {isStreaming && !response && (
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: '12px', color: 'var(--amber-b)' }}>Analyzing...</span>
                )}
                <div className="md-content">
                  <Markdown remarkPlugins={[remarkGfm]}>{response}</Markdown>
                </div>
                {isStreaming && <span className="terminal-cursor" />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="input-row">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <input
            className="field-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
            placeholder={imageBase64 ? 'Ask a question about the image...' : 'Please upload an image first'}
            disabled={!imageBase64}
            style={{ flex: 1 }}
          />
          <button
            className={`btn ${input.trim() && !isStreaming && imageBase64 ? 'btn-primary' : ''}`}
            onClick={() => handleSend()}
            disabled={!input.trim() || isStreaming || !imageBase64}
            style={{ height: '40px', padding: '0 20px', flexShrink: 0 }}
          >
            {isStreaming ? <><span className="status-dot status-dot-active" /> Analyzing</> : 'Analyze ›'}
          </button>
        </div>
      </div>
    </div>
  )
}
