/**
 * @file Constellation.jsx
 * @description The landing map. Every model the account can reach is a star,
 * clustered into nebulae by what it does. Pan, zoom, and fly into one to open
 * the workspace that model belongs to.
 *
 * This is the app's signature view, so it carries the motion budget: parallax
 * starfield, drifting clusters, energy travelling between related models. Every
 * other screen stays deliberately still.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion, useMediaQuery } from '../../hooks/useMediaQuery'
import { CATEGORY_COLORS } from '../../theme'

/** Cluster centres as a fraction of the canvas, plus the workspace each opens. */
const CLUSTERS = {
  chat: { name: 'Chat', x: 0.28, y: 0.38, view: 'arena', workspace: 'Chat arena' },
  reasoning: { name: 'Reasoning', x: 0.55, y: 0.22, view: 'reasoning', workspace: 'Reasoning' },
  code: { name: 'Code', x: 0.75, y: 0.28, view: 'code', workspace: 'Code lab' },
  vision: { name: 'Vision', x: 0.22, y: 0.70, view: 'vision', workspace: 'Vision lab' },
  embedding: { name: 'Embedding', x: 0.72, y: 0.65, view: 'embeddings', workspace: 'Embedding search' },
  specialist: { name: 'Specialist', x: 0.44, y: 0.80, view: 'health', workspace: 'Model status' },
  other: { name: 'Other', x: 0.50, y: 0.55, view: 'arena', workspace: 'Chat arena' },
}

const ZOOM_MIN = 0.35
const ZOOM_MAX = 4.5
const ZOOM_STEP = 1.15

/** How long the fly-in runs before the workspace opens, in ms. */
const WARP_MS = 700
const FADE_MS = 450

/**
 * Deterministic pseudo-random in [0, 1), so the map lays out identically on
 * every load — a star that moves between refreshes is not a landmark.
 * @param {number} i - Seed index.
 * @returns {number} Stable value in [0, 1).
 */
function seeded(i) {
  const x = Math.sin(i * 127.1) * 43758.5453
  return x - Math.floor(x)
}

/**
 * A one-line description of what a model is for, shown on the inspector card.
 * @param {{id: string, category: string}} model - Decorated model record.
 * @returns {string} Plain-language capability summary.
 */
function describeModel(model) {
  const id = model.id.toLowerCase()
  if (id.includes('405b') || id.includes('671b')) return 'Frontier-scale model for hard reasoning and synthetic data.'
  if (model.category === 'reasoning') return 'Works through a problem step by step before answering.'
  if (model.category === 'vision') return 'Reads images: description, OCR, and visual question answering.'
  if (model.category === 'embedding') return 'Turns text into vectors for semantic search and retrieval.'
  if (model.category === 'code') return 'Tuned for writing and explaining code.'
  if (id.includes('nemotron')) return "NVIDIA's own tuning of a general-purpose assistant."
  return 'General-purpose conversation and instruction following.'
}

export function Constellation({ models, setView, selectedModelId, setSelectedModelId }) {
  const wrapperRef = useRef(null)
  const canvasRef = useRef(null)

  const starsRef = useRef([])
  const nodesRef = useRef([])
  const particlesRef = useRef([])
  const sizeRef = useRef({ width: 0, height: 0 })

  const cameraRef = useRef({ x: 0, y: 0, zoom: 0.8, targetX: 0, targetY: 0, targetZoom: 0.95 })
  const dragRef = useRef({ active: false, pointerX: 0, pointerY: 0, cameraX: 0, cameraY: 0, moved: false })
  const hoveredRef = useRef(null)
  const warpingRef = useRef(false)
  const timersRef = useRef([])
  // What was already selected when the gesture started. On touch there is no
  // hover, so the first tap inspects and only a second tap opens.
  const hoverAtPressRef = useRef(null)

  const [hovered, setHovered] = useState(null)
  const [zoom, setZoom] = useState(0.95)
  const [isPanning, setIsPanning] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const reducedMotion = usePrefersReducedMotion()
  const [showHelp, setShowHelp] = useState(!isMobile)

  /** Converts a pointer event into world coordinates on the map. */
  const toWorld = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return null
    const camera = cameraRef.current
    return {
      screenX: clientX - rect.left,
      screenY: clientY - rect.top,
      worldX: camera.x + (clientX - rect.left - rect.width / 2) / camera.zoom,
      worldY: camera.y + (clientY - rect.top - rect.height / 2) / camera.zoom,
      rect,
    }
  }, [])

  // ── Render loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!models || models.length === 0) return
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const ctx = canvas.getContext('2d')

    /**
     * Resizes the backing store to match the element and the device pixel
     * ratio. Without this the map stretches the moment the window changes size.
     */
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const width = wrapper.offsetWidth
      const height = wrapper.offsetHeight
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const previous = sizeRef.current
      sizeRef.current = { width, height }

      // Keep every node at the same relative spot across a resize.
      if (previous.width > 0 && previous.height > 0) {
        const scaleX = width / previous.width
        const scaleY = height / previous.height
        for (const node of nodesRef.current) {
          node.x *= scaleX
          node.y *= scaleY
        }
        const camera = cameraRef.current
        camera.x *= scaleX; camera.targetX *= scaleX
        camera.y *= scaleY; camera.targetY *= scaleY
      } else {
        cameraRef.current.x = width / 2
        cameraRef.current.y = height / 2
        cameraRef.current.targetX = width / 2
        cameraRef.current.targetY = height / 2
      }
    }
    resize()

    const observer = new ResizeObserver(resize)
    observer.observe(wrapper)

    const { width: W0, height: H0 } = sizeRef.current

    if (starsRef.current.length === 0) {
      starsRef.current = Array.from({ length: 220 }, () => ({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() * 1.6 + 0.4,
        alpha: 0.15 + Math.random() * 0.6,
        depth: Math.random() * 0.75 + 0.15, // Parallax layer: nearer stars move more.
      }))
    }

    // Rebuild whenever the model list changes identity, so a refreshed registry
    // is reflected rather than showing a stale sky.
    nodesRef.current = models.map((model, index) => {
      const key = CLUSTERS[model.category] ? model.category : 'other'
      const cluster = CLUSTERS[key]
      const angle = seeded(index) * Math.PI * 2
      const spread = 35 + seeded(index + 100) * 80
      const existing = nodesRef.current.find((n) => n.model.id === model.id)

      const radius = model.contextWindow === '128K' ? 9
        : model.contextWindow === '32K' ? 7
        : model.contextWindow === '16K' ? 6 : 5.5

      return {
        model,
        clusterKey: key,
        cluster,
        color: CATEGORY_COLORS[key],
        x: existing?.x ?? cluster.x * W0 + Math.cos(angle) * spread,
        y: existing?.y ?? cluster.y * H0 + Math.sin(angle) * spread,
        vx: existing?.vx ?? (seeded(index + 200) - 0.5) * 0.18,
        vy: existing?.vy ?? (seeded(index + 300) - 0.5) * 0.18,
        radius,
        phase: seeded(index + 500) * Math.PI * 2,
        trail: [],
      }
    })

    let frame
    let t = 0

    const draw = () => {
      const { width: W, height: H } = sizeRef.current
      const camera = cameraRef.current
      const nodes = nodesRef.current
      const hoveredNode = hoveredRef.current

      ctx.clearRect(0, 0, W, H)
      if (!reducedMotion) t += 0.01

      // Ease the camera toward its target so pans and zooms feel weighted.
      const ease = reducedMotion ? 1 : 0.08
      camera.x += (camera.targetX - camera.x) * ease
      camera.y += (camera.targetY - camera.y) * ease
      camera.zoom += (camera.targetZoom - camera.zoom) * ease

      // Starfield, drawn in screen space and offset by depth for parallax.
      for (const star of starsRef.current) {
        let sx = (star.x * W - camera.x * star.depth) % W
        let sy = (star.y * H - camera.y * star.depth) % H
        if (sx < 0) sx += W
        if (sy < 0) sy += H
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`
        ctx.fillRect(sx, sy, star.size, star.size)
      }

      ctx.save()
      ctx.translate(W / 2, H / 2)
      ctx.scale(camera.zoom, camera.zoom)
      ctx.translate(-camera.x, -camera.y)

      // Nebulae: a soft wash sized by how many models live in each cluster.
      for (const [key, cluster] of Object.entries(CLUSTERS)) {
        const count = nodes.filter((n) => n.clusterKey === key).length
        if (count === 0) continue
        const cx = cluster.x * W
        const cy = cluster.y * H
        const radius = 90 + count * 9
        const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
        wash.addColorStop(0, `${CATEGORY_COLORS[key]}18`)
        wash.addColorStop(0.5, `${CATEGORY_COLORS[key]}04`)
        wash.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = wash
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Links between models in the same cluster, with a pulse travelling along
      // them — the only thing on screen suggesting these are live endpoints.
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i]
          const b = nodes[j]
          if (a.clusterKey !== b.clusterKey) continue
          const distance = Math.hypot(a.x - b.x, a.y - b.y)
          if (distance >= 145) continue

          const strength = 1 - distance / 145
          const low = Math.floor(0.12 * strength * 255).toString(16).padStart(2, '0')
          const peak = Math.floor(0.85 * strength * 255).toString(16).padStart(2, '0')

          const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
          const position = ((t * 0.4 + a.phase) % 1 + 1) % 1
          gradient.addColorStop(0, a.color + low)
          gradient.addColorStop(Math.max(0, position - 0.12), a.color + low)
          gradient.addColorStop(position, a.color + peak)
          gradient.addColorStop(Math.min(1, position + 0.12), a.color + low)
          gradient.addColorStop(1, a.color + low)

          ctx.strokeStyle = gradient
          ctx.lineWidth = 0.75 / camera.zoom
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      for (const node of nodes) {
        const cx = node.cluster.x * W
        const cy = node.cluster.y * H

        if (!reducedMotion) {
          node.x += node.vx
          node.y += node.vy

          // Gentle attraction keeps a cluster together without freezing it.
          const dx = cx - node.x
          const dy = cy - node.y
          const distance = Math.hypot(dx, dy) || 1
          if (distance > 70) {
            node.vx += (dx / distance) * 0.035
            node.vy += (dy / distance) * 0.035
          }
          node.vx *= 0.97
          node.vy *= 0.97

          if (node.x < 10) node.vx += 0.15
          if (node.x > W - 10) node.vx -= 0.15
          if (node.y < 10) node.vy += 0.15
          if (node.y > H - 10) node.vy -= 0.15

          node.trail.push({ x: node.x, y: node.y })
          if (node.trail.length > 9) node.trail.shift()
        }

        const isHovered = hoveredNode?.model.id === node.model.id
        const isSelected = selectedModelId === node.model.id
        const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.5 + node.phase)
        const radius = isHovered ? node.radius * 1.55 : node.radius * (0.9 + 0.12 * pulse)
        const opacity = isHovered ? 1 : 0.45 + 0.45 * pulse

        node.trail.forEach((point, index) => {
          const trailAlpha = (index / node.trail.length) * 0.13 * opacity
          ctx.beginPath()
          ctx.arc(point.x, point.y, radius * (0.3 + 0.7 * (index / node.trail.length)), 0, Math.PI * 2)
          ctx.fillStyle = node.color + Math.floor(trailAlpha * 255).toString(16).padStart(2, '0')
          ctx.fill()
        })

        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = node.color + Math.floor(opacity * 255).toString(16).padStart(2, '0')
        ctx.fill()

        if (isHovered || isSelected) {
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2)
          ctx.strokeStyle = node.color + (isHovered ? '95' : '55')
          ctx.lineWidth = 1.25 / camera.zoom
          ctx.stroke()
        }

        // Labelling every star at once is illegible; label only what is under
        // the pointer, or what the user already picked.
        if (isHovered || isSelected) {
          ctx.font = '500 8.5px "JetBrains Mono", monospace'
          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'left'
          ctx.fillText(node.model.id.split('/').pop(), node.x + radius + 7, node.y + 3)
        }
      }

      // Iterate backwards so removing a spent particle cannot skip the next one.
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i]
        p.x += p.vx
        p.y += p.vy
        p.alpha -= p.decay
        if (p.alpha <= 0) {
          particlesRef.current.splice(i, 1)
          continue
        }
        ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0')
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }

      for (const [key, cluster] of Object.entries(CLUSTERS)) {
        if (!nodes.some((n) => n.clusterKey === key)) continue
        ctx.font = '600 9.5px "JetBrains Mono", monospace'
        ctx.fillStyle = CATEGORY_COLORS[key] + '55'
        ctx.textAlign = 'center'
        ctx.fillText(cluster.name.toUpperCase(), cluster.x * W, cluster.y * H - 54)
      }

      ctx.restore()

      // Minimap, in screen space so it stays put while the map moves under it.
      const mmW = 150
      const mmH = 100
      const mmX = W - mmW - 24
      const mmY = H - mmH - 24

      ctx.fillStyle = 'rgba(3, 3, 9, 0.75)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(mmX, mmY, mmW, mmH)
      ctx.fill()
      ctx.stroke()

      for (const node of nodes) {
        const mx = mmX + (node.x / W) * mmW
        const my = mmY + (node.y / H) * mmH
        if (mx < mmX || mx > mmX + mmW || my < mmY || my > mmY + mmH) continue
        ctx.fillStyle = node.color + 'cc'
        ctx.beginPath()
        ctx.arc(mx, my, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }

      const viewW = W / camera.zoom
      const viewH = H / camera.zoom
      const boxX = Math.max(mmX, mmX + ((camera.x - viewW / 2) / W) * mmW)
      const boxY = Math.max(mmY, mmY + ((camera.y - viewH / 2) / H) * mmH)
      ctx.strokeStyle = '#a78bfa'
      ctx.lineWidth = 1.2
      ctx.strokeRect(
        boxX,
        boxY,
        Math.min(mmW - (boxX - mmX), (viewW / W) * mmW),
        Math.min(mmH - (boxY - mmY), (viewH / H) * mmH),
      )

      frame = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [models, reducedMotion, selectedModelId])

  // Zoom needs a native listener: React registers `wheel` passively, so
  // `preventDefault` inside onWheel is ignored and the page scrolls instead.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e) => {
      e.preventDefault()
      if (warpingRef.current) return
      const point = toWorld(e.clientX, e.clientY)
      if (!point) return

      const camera = cameraRef.current
      const next = Math.max(ZOOM_MIN, Math.min(
        ZOOM_MAX,
        e.deltaY < 0 ? camera.targetZoom * ZOOM_STEP : camera.targetZoom / ZOOM_STEP,
      ))

      // Keep whatever is under the cursor pinned there as the scale changes.
      camera.targetZoom = next
      camera.targetX = point.worldX - (point.screenX - point.rect.width / 2) / next
      camera.targetY = point.worldY - (point.screenY - point.rect.height / 2) / next
      setZoom(next)
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [toWorld])

  // ── Pointer interaction (mouse, pen and touch share one path) ────────────
  const handlePointerDown = (e) => {
    if (warpingRef.current) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    hoverAtPressRef.current = hoveredRef.current
    dragRef.current = {
      active: true,
      pointerX: e.clientX,
      pointerY: e.clientY,
      cameraX: cameraRef.current.x,
      cameraY: cameraRef.current.y,
      moved: false,
    }
    setIsPanning(true)
  }

  const handlePointerMove = (e) => {
    const point = toWorld(e.clientX, e.clientY)
    if (!point) return
    const drag = dragRef.current
    const camera = cameraRef.current

    if (drag.active) {
      const dx = e.clientX - drag.pointerX
      const dy = e.clientY - drag.pointerY
      // A few pixels of travel is a click, not a pan — otherwise a slightly
      // shaky tap would never open anything.
      if (Math.hypot(dx, dy) > 4) drag.moved = true
      camera.targetX = drag.cameraX - dx / camera.zoom
      camera.targetY = drag.cameraY - dy / camera.zoom
      return
    }

    // Topmost node wins, so overlapping stars pick the one drawn last.
    let found = null
    const nodes = nodesRef.current
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]
      const hitRadius = Math.max(node.radius + 6, 12)
      if ((node.x - point.worldX) ** 2 + (node.y - point.worldY) ** 2 <= hitRadius ** 2) {
        found = node
        break
      }
    }

    if (found?.model.id !== hoveredRef.current?.model.id) {
      hoveredRef.current = found
      setHovered(found)
      if (found && !reducedMotion) {
        for (let k = 0; k < 15; k++) {
          particlesRef.current.push({
            x: found.x,
            y: found.y,
            vx: (Math.random() - 0.5) * 2.5,
            vy: (Math.random() - 0.5) * 2.5,
            size: Math.random() * 2 + 1,
            color: found.color,
            alpha: 1,
            decay: 0.02 + Math.random() * 0.03,
          })
        }
      }
    }
  }

  const handlePointerUp = (e) => {
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    dragRef.current.active = false
    setIsPanning(false)
  }

  const handlePointerLeave = () => {
    dragRef.current.active = false
    setIsPanning(false)
    hoveredRef.current = null
    setHovered(null)
  }

  /** Flies the camera into a model, then opens its workspace. */
  const openModel = useCallback((node) => {
    if (!node || warpingRef.current) return
    warpingRef.current = true

    const finish = () => {
      setView(node.cluster.view)
      setSelectedModelId(node.model.id)
    }

    if (reducedMotion) {
      finish()
      return
    }

    cameraRef.current.targetX = node.x
    cameraRef.current.targetY = node.y
    cameraRef.current.targetZoom = 3.5
    setZoom(3.5)

    const warp = setTimeout(() => {
      setFadeOut(true)
      const fade = setTimeout(finish, FADE_MS)
      timersRef.current.push(fade)
    }, WARP_MS)
    timersRef.current.push(warp)
  }, [reducedMotion, setView, setSelectedModelId])

  // Cancel pending transitions if the view unmounts mid-warp.
  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const handleClick = () => {
    // A pan that ended over a star should not also open it.
    if (dragRef.current.moved) return
    const node = hoveredRef.current
    if (!node) return
    // Touch has no hover state, so the first tap only inspects.
    if (isMobile && hoverAtPressRef.current?.model.id !== node.model.id) return
    openModel(node)
  }

  const applyZoom = (next) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next))
    cameraRef.current.targetZoom = clamped
    setZoom(clamped)
  }

  const resetCamera = () => {
    const { width, height } = sizeRef.current
    cameraRef.current.targetX = width / 2
    cameraRef.current.targetY = height / 2
    applyZoom(0.95)
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg-void)' }}>
      <div className="dot-grid" style={{ opacity: 0.05 }} />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, background: 'var(--bg-void)',
          opacity: fadeOut ? 1 : 0, pointerEvents: 'none',
          transition: `opacity ${FADE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`, zIndex: 999,
        }}
      />

      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onClick={handleClick}
        aria-label={`Map of ${models.length} models. Use the model list in each workspace as an alternative.`}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          touchAction: 'none', // Own the gesture; otherwise the browser scrolls.
          cursor: isPanning ? 'grabbing' : hovered ? 'pointer' : 'grab',
        }}
      />

      {hovered && (
        <div
          className={`glass-card constellation-card${isMobile ? ' constellation-card-mobile' : ''}`}
          style={{ borderColor: `${hovered.color}60`, opacity: fadeOut ? 0 : 1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span
              className="constellation-cat"
              style={{ color: hovered.color, background: `${hovered.color}20`, borderColor: `${hovered.color}40` }}
            >
              {hovered.cluster.name}
            </span>
            <span className="constellation-ctx">{hovered.model.contextWindow} context</span>
          </div>

          <div className="constellation-title">{hovered.model.id.split('/').pop()}</div>
          <div className="constellation-provider">by {hovered.model.providerName}</div>
          <p className="constellation-desc">{describeModel(hovered.model)}</p>
          <div className="constellation-cta" style={{ color: hovered.color }}>
            {isMobile ? 'Tap' : 'Click'} to open {hovered.cluster.workspace} →
          </div>
        </div>
      )}

      {/* Map controls */}
      <div className="glass-card constellation-hud">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="field-caption" style={{ color: 'var(--nebula-glow)' }}>Map</span>
          <span className="constellation-zoom">{zoom.toFixed(2)}×</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn hud-btn" onClick={() => applyZoom(zoom * 1.3)} aria-label="Zoom in">+</button>
          <button type="button" className="btn hud-btn" onClick={() => applyZoom(zoom / 1.3)} aria-label="Zoom out">−</button>
          <button type="button" className="btn" onClick={resetCamera} style={{ height: '32px', padding: '0 12px', fontSize: '9.5px' }}>Reset</button>
          <button
            type="button"
            className={`btn hud-btn${showHelp ? ' btn-primary' : ''}`}
            onClick={() => setShowHelp(!showHelp)}
            aria-expanded={showHelp}
            aria-label="Toggle map help"
          >
            ?
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="glass-card constellation-help">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span className="field-caption" style={{ color: 'var(--nebula-glow)' }}>Getting around</span>
            <button type="button" className="msg-copy" onClick={() => setShowHelp(false)}>Close</button>
          </div>
          <dl className="constellation-keys">
            <dt>{isMobile ? 'Drag' : 'Drag'}</dt><dd>Move the map</dd>
            <dt>{isMobile ? 'Pinch' : 'Scroll'}</dt><dd>Zoom in and out</dd>
            <dt>{isMobile ? 'Tap' : 'Hover'}</dt><dd>Inspect a model</dd>
            <dt>{isMobile ? 'Tap again' : 'Click'}</dt><dd>Open its workspace</dd>
          </dl>
        </div>
      )}
    </div>
  )
}
