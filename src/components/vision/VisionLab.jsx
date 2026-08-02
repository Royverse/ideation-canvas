/**
 * @file VisionLab.jsx
 * @description Vision workspace: upload an image, then either ask a question
 * about the whole frame or sweep a probe across it for region-by-region reads.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { streamVisionChat, isAbortError } from '../../api/nvidia'
import { useModelPicker } from '../../hooks/useModelPicker'
import { usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { ModelSelect } from '../shared/ModelSelect'
import { MarkdownMessage } from '../shared/MarkdownMessage'
import { explainError } from '../../lib/errors'
import { PALETTE, CHANNELS, alpha } from '../../theme'

/** Vision models with the strongest general description quality, best first. */
const PREFERRED = ['nemotron', 'llama-3.2-90b', 'llava']

/** Probe radius on screen, in CSS pixels. */
const PROBE_RADIUS = 65

/** Side of the square crop the probe sends, in CSS pixels. */
const PROBE_CROP = 130

/** How long the pointer must rest before a probe request fires, in ms. */
const PROBE_SETTLE_MS = 600

/** Largest image accepted, in bytes. Base64 inflates payloads by roughly a third. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const QUICK_PROMPTS = [
  'Describe this image in detail',
  'What text appears here?',
  'Identify the objects in the image',
]

export function VisionLab({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [image, setImage] = useState(null) // { src, base64, mimeType, name }
  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState(null)

  const [isProbeMode, setIsProbeMode] = useState(false)
  const [probeVisible, setProbeVisible] = useState(false)
  const [cropPreview, setCropPreview] = useState(null)
  const [probeResult, setProbeResult] = useState('')
  const [isProbing, setIsProbing] = useState(false)
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })

  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const tooltipRef = useRef(null)
  const probePosRef = useRef({ x: 0, y: 0 })
  const settleTimerRef = useRef(null)

  // Separate controllers: a probe firing must not cancel the main answer.
  const askAbortRef = useRef(null)
  const probeAbortRef = useRef(null)

  const reducedMotion = usePrefersReducedMotion()

  const visionModels = useMemo(
    () => models.filter((m) => m.category === 'vision'),
    [models],
  )

  const { modelId, selectModel } = useModelPicker(visionModels, {
    selectedModelId,
    setSelectedModelId,
    prefer: PREFERRED,
  })

  // Abandon anything in flight when the workspace closes.
  useEffect(() => () => {
    askAbortRef.current?.abort()
    probeAbortRef.current?.abort()
    clearTimeout(settleTimerRef.current)
  }, [])

  const measureImage = useCallback(() => {
    const img = imgRef.current
    if (img?.complete) setImageSize({ width: img.clientWidth, height: img.clientHeight })
  }, [])

  useEffect(() => {
    window.addEventListener('resize', measureImage)
    return () => window.removeEventListener('resize', measureImage)
  }, [measureImage])

  // Probe reticle. Colours are literals because a canvas context cannot resolve
  // CSS custom properties — `ctx.fillStyle = 'var(--x)'` is silently ignored.
  useEffect(() => {
    if (!isProbeMode || !probeVisible) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let frame
    let sweep = 0

    const render = () => {
      const { x, y } = probePosRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      sweep += 0.04

      // Dim everything, then punch a clear hole where the probe is looking.
      ctx.fillStyle = alpha('3, 3, 9', 0.55)
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(x, y, PROBE_RADIUS, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.strokeStyle = alpha(CHANNELS.nebulaCore, 0.25)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x - 90, y); ctx.lineTo(x + 90, y)
      ctx.moveTo(x, y - 90); ctx.lineTo(x, y + 90)
      ctx.stroke()

      ctx.strokeStyle = alpha(CHANNELS.nebulaGlow, 0.4)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, PROBE_RADIUS, 0, Math.PI * 2)
      ctx.stroke()

      // A rotating arc marks the probe as live; a static ring reads as frozen.
      ctx.strokeStyle = PALETTE.nebulaGlow
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(x, y, PROBE_RADIUS - 4, sweep, sweep + Math.PI * 0.45)
      ctx.stroke()

      ctx.fillStyle = PALETTE.nebulaGlow
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()

      if (!reducedMotion) frame = requestAnimationFrame(render)
    }
    render()
    return () => cancelAnimationFrame(frame)
  }, [isProbeMode, probeVisible, imageSize, reducedMotion])

  /**
   * Crops the region under the probe and asks the model what it contains.
   * @param {number} x - Probe centre X, in canvas pixels.
   * @param {number} y - Probe centre Y, in canvas pixels.
   */
  const runProbe = useCallback(async (x, y) => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !modelId || !apiKey) return

    probeAbortRef.current?.abort()
    const controller = new AbortController()
    probeAbortRef.current = controller

    // Map the on-screen probe onto the image's native pixel grid.
    const scaleX = img.naturalWidth / canvas.width
    const scaleY = img.naturalHeight / canvas.height
    const cropW = PROBE_CROP * scaleX
    const cropH = PROBE_CROP * scaleY
    const cropX = Math.max(0, Math.min(x * scaleX - cropW / 2, img.naturalWidth - cropW))
    const cropY = Math.max(0, Math.min(y * scaleY - cropH / 2, img.naturalHeight - cropH))

    const scratch = document.createElement('canvas')
    scratch.width = 150
    scratch.height = 150
    scratch.getContext('2d').drawImage(img, cropX, cropY, cropW, cropH, 0, 0, 150, 150)
    const dataUrl = scratch.toDataURL('image/jpeg', 0.85)

    setCropPreview(dataUrl)
    setIsProbing(true)
    setProbeResult('')

    try {
      const stream = streamVisionChat(apiKey, {
        model: modelId,
        imageBase64: dataUrl.split(',')[1],
        mimeType: 'image/jpeg',
        userMessage: 'Describe what is in this image crop in one concise phrase, under 8 words. Be direct.',
        max_tokens: 50,
        signal: controller.signal,
      })
      let text = ''
      for await (const token of stream) {
        text += token
        setProbeResult(text)
      }
    } catch (err) {
      if (!isAbortError(err)) setProbeResult(explainError(err.message))
    } finally {
      if (probeAbortRef.current === controller) probeAbortRef.current = null
      setIsProbing(false)
    }
  }, [apiKey, modelId])

  const handlePointerMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    probePosRef.current = { x, y }
    if (!probeVisible) setProbeVisible(true)

    // Keep the readout inside the frame rather than letting it run off-canvas.
    if (tooltipRef.current) {
      const left = x + 234 > canvas.width ? x - 234 : x + 24
      const top = y + 200 > canvas.height ? y - 200 : y + 24
      tooltipRef.current.style.left = `${left}px`
      tooltipRef.current.style.top = `${top}px`
    }

    // Only ask about a region the pointer has actually settled on — firing per
    // pixel of movement would spend a request on every frame of a sweep.
    clearTimeout(settleTimerRef.current)
    probeAbortRef.current?.abort()
    setProbeResult('')
    setCropPreview(null)
    settleTimerRef.current = setTimeout(() => runProbe(x, y), PROBE_SETTLE_MS)
  }

  const handlePointerLeave = () => {
    setProbeVisible(false)
    clearTimeout(settleTimerRef.current)
    probeAbortRef.current?.abort()
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_IMAGE_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Pick one under ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`)
      return
    }

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = String(ev.target.result)
      setImage({
        src: dataUrl,
        base64: dataUrl.split(',')[1],
        mimeType: dataUrl.split(':')[1].split(';')[0],
        name: file.name,
      })
      setImageSize({ width: 0, height: 0 })
      setResponse('')
      setError(null)
      setIsProbeMode(true)
    }
    reader.onerror = () => setError('That file could not be read. Try another image.')
    reader.readAsDataURL(file)
  }

  const ask = useCallback(async (prompt) => {
    if (!prompt.trim() || !modelId || isStreaming || !image) return

    askAbortRef.current?.abort()
    const controller = new AbortController()
    askAbortRef.current = controller

    setResponse('')
    setError(null)
    setIsStreaming(true)

    try {
      const stream = streamVisionChat(apiKey, {
        model: modelId,
        imageBase64: image.base64,
        mimeType: image.mimeType,
        userMessage: prompt.trim(),
        max_tokens: 1024,
        signal: controller.signal,
      })
      for await (const token of stream) setResponse((prev) => prev + token)
    } catch (err) {
      if (!isAbortError(err)) setError(explainError(err.message))
    } finally {
      if (askAbortRef.current === controller) askAbortRef.current = null
      setIsStreaming(false)
    }
  }, [apiKey, modelId, isStreaming, image])

  const handleSend = () => {
    const prompt = input
    setInput('')
    ask(prompt)
  }

  const clearImage = () => {
    askAbortRef.current?.abort()
    probeAbortRef.current?.abort()
    clearTimeout(settleTimerRef.current)
    setImage(null)
    setResponse('')
    setError(null)
    setProbeResult('')
    setCropPreview(null)
    setProbeVisible(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      <div className="dot-grid" />

      <div className="top-bar" style={{ zIndex: 2 }}>
        <ModelSelect label="Model" models={visionModels} value={modelId} onChange={selectModel} />

        {image && (
          <>
            <div className="bar-divider" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="field-caption" style={{ color: !isProbeMode ? PALETTE.nebulaGlow : undefined }}>Ask</span>
              <button
                type="button"
                role="switch"
                aria-checked={isProbeMode}
                aria-label="Probe mode — describe regions under the pointer"
                onClick={() => {
                  setIsProbeMode(!isProbeMode)
                  setProbeVisible(false)
                  setProbeResult('')
                  setCropPreview(null)
                }}
                className={`toggle${isProbeMode ? ' toggle-on' : ''}`}
              >
                <span className="toggle-knob" />
              </button>
              <span className="field-caption" style={{ color: isProbeMode ? PALETTE.nebulaGlow : undefined }}>Probe</span>
            </div>
          </>
        )}
      </div>

      <div className="vision-split" style={{ flex: 1, display: 'flex', overflow: 'hidden', zIndex: 1 }}>

        {/* Image */}
        <div style={{ flex: 1, borderRight: '1px solid var(--border-subtle)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="section-header">{image ? image.name : 'Image'}</div>

          <div
            className={isProbeMode && image ? 'scanline-overlay' : ''}
            style={{
              flex: 1,
              border: `1.5px ${image ? 'solid' : 'dashed'} var(--border-base)`,
              borderRadius: '16px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              position: 'relative', overflow: 'hidden',
              background: image ? 'transparent' : 'rgba(7, 7, 26, 0.3)',
            }}
          >
            {image ? (
              <div style={{ position: 'relative', display: 'inline-flex', maxWidth: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' }}>
                <img
                  ref={imgRef}
                  src={image.src}
                  onLoad={measureImage}
                  alt={`Uploaded: ${image.name}`}
                  style={{ display: 'block', maxWidth: '100%', maxHeight: '100%', borderRadius: '12px' }}
                />

                {isProbeMode && imageSize.width > 0 && (
                  <canvas
                    ref={canvasRef}
                    width={imageSize.width}
                    height={imageSize.height}
                    onPointerMove={handlePointerMove}
                    onPointerLeave={handlePointerLeave}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'none', zIndex: 5, borderRadius: '12px' }}
                  />
                )}

                {isProbeMode && probeVisible && (
                  <div ref={tooltipRef} className="glass-card probe-readout">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="field-caption">Region</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: 'var(--text-dim)' }}>
                        {PROBE_CROP}px
                      </span>
                    </div>
                    <div className="probe-crop">
                      {cropPreview
                        ? <img src={cropPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: '8.5px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-dim)' }}>Capturing…</span>}
                    </div>
                    <div className="probe-text">
                      {isProbing && !probeResult
                        ? <span style={{ color: PALETTE.nebulaGlow }}>Reading…</span>
                        : probeResult || <span style={{ color: 'var(--text-dim)' }}>Rest the pointer to read a region</span>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--text-dim)', marginBottom: '12px' }}>
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  Choose an image, or drop one here
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  aria-label="Choose an image to analyse"
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                />
              </>
            )}
          </div>

          {image && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="btn"
                  onClick={() => ask(prompt)}
                  disabled={isStreaming || !modelId}
                  style={{ fontSize: '9.5px', padding: '5px 10px' }}
                >
                  {prompt}
                </button>
              ))}
              <button type="button" className="btn btn-danger" onClick={clearImage} style={{ fontSize: '9.5px', padding: '5px 10px', marginLeft: 'auto' }}>
                Remove image
              </button>
            </div>
          )}
        </div>

        {/* Answer */}
        <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          <div className="section-header">Description</div>

          {error && (
            <div className="error-box fade-up" role="alert">
              <span aria-hidden="true" style={{ fontSize: '14px', marginTop: '1px' }}>◈</span>
              <div>
                <span className="error-box-title">Could not read the image</span>
                <span className="error-box-body">{error}</span>
              </div>
            </div>
          )}

          <div style={{ flex: 1 }}>
            {!response && !isStreaming ? (
              <div className="empty-state" style={{ height: '100%', justifyContent: 'center', opacity: 0.5 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: 'var(--text-dim)' }}>
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  {image ? 'Ask a question about the image' : 'Add an image to get started'}
                </div>
              </div>
            ) : (
              <div className="glass-card" style={{ padding: '22px 24px', fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.75 }}>
                {isStreaming && !response
                  ? <span style={{ color: PALETTE.nebulaGlow, fontSize: '12px' }}>Looking…</span>
                  : <MarkdownMessage>{response}</MarkdownMessage>}
                {isStreaming && response && <span className="terminal-cursor" />}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="input-row">
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <input
            className="field-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
            aria-label="Question about the image"
            placeholder={image ? 'Ask about the image…' : 'Add an image first'}
            disabled={!image}
            style={{ flex: 1 }}
          />
          {isStreaming ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => askAbortRef.current?.abort()}
              style={{ height: '40px', padding: '0 20px', flexShrink: 0 }}
            >
              <span className="stop-glyph" aria-hidden="true" /> Stop
            </button>
          ) : (
            <button
              type="button"
              className={`btn ${input.trim() && image ? 'btn-primary' : ''}`}
              onClick={handleSend}
              disabled={!input.trim() || !image || !modelId}
              style={{ height: '40px', padding: '0 20px', flexShrink: 0 }}
            >
              Ask ›
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
