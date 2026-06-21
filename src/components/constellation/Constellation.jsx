import React, { useEffect, useRef, useState } from 'react'

const CATS_CONFIG = {
  'chat': { name: 'CHAT', x: 0.28, y: 0.38, color: '#5ab87a' },
  'embedding': { name: 'EMBEDDING', x: 0.72, y: 0.65, color: '#f5a93d' },
  'reasoning': { name: 'REASONING', x: 0.55, y: 0.22, color: '#8b6fd4' },
  'vision': { name: 'VISION', x: 0.22, y: 0.70, color: '#4fa3d4' },
  'code': { name: 'CODE', x: 0.75, y: 0.28, color: '#d46060' },
  'other': { name: 'OTHER', x: 0.50, y: 0.55, color: '#4a4236' }
}

export function Constellation({ models, setView, selectedModelId, setSelectedModelId }) {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const starsRef = useRef([])
  const particlesRef = useRef([])
  const mouseScreenPosRef = useRef({ x: 0, y: 0 })
  const mouseWorldPosRef = useRef({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const cameraStartRef = useRef({ x: 0, y: 0 })
  const isTransitioningRef = useRef(false)
  const [fadeOut, setFadeOut] = useState(false)
  const [hoveredNode, setHoveredNode] = useState(null)
  const hoveredNodeRef = useRef(null)
  const [showHelp, setShowHelp] = useState(window.innerWidth >= 768)
  
  // Camera state in a ref for frame-by-frame updates without React lagging
  const cameraRef = useRef({
    x: 0,
    y: 0,
    zoom: 0.8,
    targetX: 0,
    targetY: 0,
    targetZoom: 0.95
  })
  
  const nodesRef = useRef([])

  useEffect(() => {
    if (!models || models.length === 0) return

    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    const dpr = window.devicePixelRatio || 1
    const W = wrapper.offsetWidth
    const H = wrapper.offsetHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const seed = (i) => (Math.sin(i * 127.1) * 43758.5453) % 1

    // Initialize camera targets to center of screen
    if (cameraRef.current.x === 0) {
      cameraRef.current.x = W / 2
      cameraRef.current.y = H / 2
      cameraRef.current.targetX = W / 2
      cameraRef.current.targetY = H / 2
    }

    // Initialize starfield with depth for 3D parallax
    if (starsRef.current.length === 0) {
      const stars = []
      for (let i = 0; i < 220; i++) {
        stars.push({
          x: Math.random(),
          y: Math.random(),
          size: Math.random() * 1.6 + 0.4,
          alpha: 0.15 + Math.random() * 0.6,
          depth: Math.random() * 0.75 + 0.15 // parallax speed layer
        })
      }
      starsRef.current = stars
    }

    // Build nodes from models if not already built
    if (nodesRef.current.length === 0) {
      const newNodes = models.map((m, idx) => {
        const catKey = m.category || 'other'
        const cat = CATS_CONFIG[catKey]
        const angle = seed(idx) * Math.PI * 2
        const r = 35 + seed(idx + 100) * 80
        
        let radius = 5
        if (m.contextWindow === '128K') radius = 9
        else if (m.contextWindow === '32K') radius = 7
        else if (m.contextWindow === '8K') radius = 5.5

        return {
          model: m,
          x: cat.x * W + Math.cos(angle) * r,
          y: cat.y * H + Math.sin(angle) * r,
          vx: (seed(idx + 200) - 0.5) * 0.18,
          vy: (seed(idx + 300) - 0.5) * 0.18,
          radius: radius,
          color: cat.color,
          catConfig: cat,
          phase: seed(idx + 500) * Math.PI * 2,
          trail: []
        }
      })
      nodesRef.current = newNodes
    }

    let t = 0
    let animFrame

    function draw() {
      ctx.clearRect(0, 0, W, H)
      t += 0.01

      // 1. Camera Lerp transition
      const camera = cameraRef.current
      const lerpFactor = 0.08
      camera.x += (camera.targetX - camera.x) * lerpFactor
      camera.y += (camera.targetY - camera.y) * lerpFactor
      camera.zoom += (camera.targetZoom - camera.zoom) * lerpFactor

      // 2. Draw parallax starfield (in screen space)
      for (const star of starsRef.current) {
        let sx = (star.x * W - camera.x * star.depth) % W
        let sy = (star.y * H - camera.y * star.depth) % H
        if (sx < 0) sx += W
        if (sy < 0) sy += H
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`
        ctx.fillRect(sx, sy, star.size, star.size)
      }

      // Save normal context for transform space
      ctx.save()
      
      // Perform Camera Transformations
      ctx.translate(W / 2, H / 2)
      ctx.scale(camera.zoom, camera.zoom)
      ctx.translate(-camera.x, -camera.y)

      const nodes = nodesRef.current

      // 3. Draw Nebulas
      for (const catKey of Object.keys(CATS_CONFIG)) {
        const cat = CATS_CONFIG[catKey]
        const cx = cat.x * W
        const cy = cat.y * H
        const modelCount = nodes.filter(n => n.model.category === catKey).length
        if (modelCount === 0) continue

        const nebulaRadius = 90 + modelCount * 9
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, nebulaRadius)
        grad.addColorStop(0, cat.color + '18') // ~9% opacity
        grad.addColorStop(0.5, cat.color + '04') // ~1.5% opacity
        grad.addColorStop(1, 'rgba(0,0,0,0)')

        ctx.beginPath()
        ctx.arc(cx, cy, nebulaRadius, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
      }

      // 4. Draw Inter-cluster Centroid Backbones
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.018)'
      ctx.lineWidth = 1 / camera.zoom
      const cats = Object.keys(CATS_CONFIG)
      for (let i = 0; i < cats.length; i++) {
        for (let j = i + 1; j < cats.length; j++) {
          const c1 = CATS_CONFIG[cats[i]]
          const c2 = CATS_CONFIG[cats[j]]
          ctx.beginPath()
          ctx.moveTo(c1.x * W, c1.y * H)
          ctx.lineTo(c2.x * W, c2.y * H)
          ctx.stroke()
        }
      }

      // 5. Draw Intra-cluster Node Connections with Travelling Energy Shimmer
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j]
          if (n1.catConfig.name === n2.catConfig.name) {
            const dx = n1.x - n2.x
            const dy = n1.y - n2.y
            const dist = Math.sqrt(dx*dx + dy*dy)
            if (dist < 145) {
              const maxDistOpacity = 1 - (dist / 145)
              
              // Travelling energy pulse gradient
              const rawPulse = (t * 0.4 + n1.phase) % 1.0
              const pulsePos = rawPulse < 0 ? rawPulse + 1.0 : rawPulse
              const grad = ctx.createLinearGradient(n1.x, n1.y, n2.x, n2.y)
              const baseColor = n1.color
              
              const lowAlpha = Math.floor(0.12 * maxDistOpacity * 255).toString(16).padStart(2, '0')
              const peakAlpha = Math.floor(0.85 * maxDistOpacity * 255).toString(16).padStart(2, '0')
              
              const p1 = Math.max(0, pulsePos - 0.12)
              const p2 = pulsePos
              const p3 = Math.min(1, pulsePos + 0.12)
              
              grad.addColorStop(0, baseColor + lowAlpha)
              grad.addColorStop(p1, baseColor + lowAlpha)
              grad.addColorStop(p2, baseColor + peakAlpha)
              grad.addColorStop(p3, baseColor + lowAlpha)
              grad.addColorStop(1, baseColor + lowAlpha)

              ctx.strokeStyle = grad
              ctx.lineWidth = 0.75 / camera.zoom
              ctx.beginPath()
              ctx.moveTo(n1.x, n1.y)
              ctx.lineTo(n2.x, n2.y)
              ctx.stroke()
            }
          }
        }
      }

      // 6. Update and Draw Nodes
      for (const n of nodes) {
        n.x += n.vx
        n.y += n.vy
        const cat = n.catConfig
        const cx = cat.x * W
        const cy = cat.y * H
        const dx = cx - n.x
        const dy = cy - n.y
        const d = Math.sqrt(dx*dx + dy*dy) || 1
        
        // Cluster Attraction physics
        if (d > 70) { 
          n.vx += (dx/d) * 0.035; 
          n.vy += (dy/d) * 0.035; 
        }
        
        // Friction/drag
        n.vx *= 0.97
        n.vy *= 0.97
        
        // Bounds checking
        if (n.x < 10) n.vx += 0.15; if (n.x > W-10) n.vx -= 0.15;
        if (n.y < 10) n.vy += 0.15; if (n.y > H-10) n.vy -= 0.15;

        // Cometary tail trail
        n.trail.push({ x: n.x, y: n.y })
        if (n.trail.length > 9) n.trail.shift()

        const pulse = 0.5 + 0.5 * Math.sin(t * 1.5 + n.phase)
        const isHovered = hoveredNodeRef.current && hoveredNodeRef.current.model.id === n.model.id
        const r = isHovered ? n.radius * 1.55 : n.radius * (0.9 + 0.12 * pulse)
        const alpha = isHovered ? 1.0 : 0.45 + 0.45 * pulse

        // Draw trail
        n.trail.forEach((pos, idx) => {
          const trailAlpha = (idx / n.trail.length) * 0.13 * alpha
          const trailRadius = r * (0.3 + 0.7 * (idx / n.trail.length))
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, trailRadius, 0, Math.PI * 2)
          ctx.fillStyle = n.color + Math.floor(trailAlpha * 255).toString(16).padStart(2, '0')
          ctx.fill()
        })

        // Draw core node dot
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = n.color + Math.floor(alpha * 255).toString(16).padStart(2, '0')
        ctx.fill()
        
        // Draw hover target aura rings
        if (isHovered) {
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2)
          ctx.strokeStyle = n.color + '75'
          ctx.lineWidth = 1.25 / camera.zoom
          ctx.stroke()
        }

        // 7. Immersive details fade-in: only draw label for the currently hovered node
        if (isHovered) {
          ctx.font = '500 8.5px "JetBrains Mono", monospace'
          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'left'
          ctx.fillText(n.model.id.split('/').pop(), n.x + r + 7, n.y + 3)
        }
      }

      // Draw active particles (hover sparkles)
      particlesRef.current.forEach((p, idx) => {
        p.x += p.vx
        p.y += p.vy
        p.alpha -= p.decay
        if (p.alpha <= 0) {
          particlesRef.current.splice(idx, 1)
        } else {
          ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0')
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fill()
        }
      })

      // Draw category headers in world coordinates
      const drawnLabels = new Set()
      for (const n of nodes) {
        if (!drawnLabels.has(n.catConfig.name)) {
          drawnLabels.add(n.catConfig.name)
          const cat = n.catConfig
          ctx.font = '600 9.5px "JetBrains Mono", monospace'
          ctx.fillStyle = cat.color + '45'
          ctx.textAlign = 'center'
          ctx.fillText(cat.name, cat.x * W, cat.y * H - 54)
        }
      }

      ctx.restore() // Restore matrix back to screen space for overlays

      // 8. Draw HUD Viewport Minimap in Screen Space
      const mmW = 150
      const mmH = 100
      const mmX = W - mmW - 24
      const mmY = H - mmH - 24

      ctx.fillStyle = 'rgba(10, 14, 23, 0.75)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(mmX, mmY, mmW, mmH)
      ctx.fill()
      ctx.stroke()

      // Draw miniature representation of nodes
      for (const n of nodes) {
        const mx = mmX + (n.x / W) * mmW
        const my = mmY + (n.y / H) * mmH
        if (mx >= mmX && mx <= mmX + mmW && my >= mmY && my <= mmY + mmH) {
          ctx.fillStyle = n.color + 'cc'
          ctx.beginPath()
          ctx.arc(mx, my, 1.8, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Draw Viewport outline boundary
      const vpW = W / camera.zoom
      const vpH = H / camera.zoom
      const vpX = camera.x - vpW / 2
      const vpY = camera.y - vpH / 2

      const mmVpX = mmX + (vpX / W) * mmW
      const mmVpY = mmY + (vpY / H) * mmH
      const mmVpW = (vpW / W) * mmW
      const mmVpH = (vpH / H) * mmH

      ctx.strokeStyle = '#f5a93d'
      ctx.lineWidth = 1.2
      ctx.strokeRect(
        Math.max(mmX, mmVpX), 
        Math.max(mmY, mmVpY), 
        Math.min(mmW - (Math.max(mmX, mmVpX) - mmX), mmVpW), 
        Math.min(mmH - (Math.max(mmY, mmVpY) - mmY), mmVpH)
      )

      animFrame = requestAnimationFrame(draw)
    }

    draw()

    return () => cancelAnimationFrame(animFrame)
  }, [models])

  // Canvas Mouse interaction handlers
  const handleMouseDown = (e) => {
    if (isTransitioningRef.current) return
    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    cameraStartRef.current = { x: cameraRef.current.x, y: cameraRef.current.y }
  }

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Convert mouse screen coordinates to world position
    const camera = cameraRef.current
    const worldX = camera.x + (screenX - rect.width / 2) / camera.zoom
    const worldY = camera.y + (screenY - rect.height / 2) / camera.zoom

    mouseScreenPosRef.current = { x: screenX, y: screenY }
    mouseWorldPosRef.current = { x: worldX, y: worldY }

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      // Pan camera inverse of mouse vector adjusted for current zoom
      camera.targetX = cameraStartRef.current.x - dx / camera.zoom
      camera.targetY = cameraStartRef.current.y - dy / camera.zoom
    } else {
      // Find hovered node
      let found = null
      const nodes = nodesRef.current
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        const dx = n.x - worldX
        const dy = n.y - worldY
        const hitRadius = Math.max(n.radius + 6, 12)
        if (dx*dx + dy*dy <= hitRadius * hitRadius) {
          found = n
          break
        }
      }

      if (found?.model.id !== hoveredNodeRef.current?.model.id) {
        hoveredNodeRef.current = found
        setHoveredNode(found)
        if (found) {
          // Emit burst sparkles
          for (let k = 0; k < 15; k++) {
            particlesRef.current.push({
              x: found.x,
              y: found.y,
              vx: (Math.random() - 0.5) * 2.5,
              vy: (Math.random() - 0.5) * 2.5,
              size: Math.random() * 2 + 1,
              color: found.color,
              alpha: 1.0,
              decay: 0.02 + Math.random() * 0.03
            })
          }
        }
      }
    }
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
  }

  const handleWheel = (e) => {
    e.preventDefault()
    if (isTransitioningRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const screenX = e.clientX - rect.left
    const screenY = e.clientY - rect.top

    // Keep world coordinate under pointer locked to same screen coordinate
    const worldX = cameraRef.current.x + (screenX - rect.width / 2) / cameraRef.current.zoom
    const worldY = cameraRef.current.y + (screenY - rect.height / 2) / cameraRef.current.zoom

    const zoomStep = 1.15
    let newTargetZoom = cameraRef.current.targetZoom
    if (e.deltaY < 0) {
      newTargetZoom *= zoomStep
    } else {
      newTargetZoom /= zoomStep
    }
    // Clamp zoom scale
    newTargetZoom = Math.max(0.35, Math.min(4.5, newTargetZoom))

    cameraRef.current.targetZoom = newTargetZoom
    cameraRef.current.targetX = worldX - (screenX - rect.width / 2) / newTargetZoom
    cameraRef.current.targetY = worldY - (screenY - rect.height / 2) / newTargetZoom
  }

  // Click handler to initiate smooth fly-in warp transition
  const handleMouseClick = () => {
    const hovered = hoveredNodeRef.current
    if (hovered && !isTransitioningRef.current) {
      isTransitioningRef.current = true
      cameraRef.current.targetX = hovered.x
      cameraRef.current.targetY = hovered.y
      cameraRef.current.targetZoom = 3.5 // Fly close!

      setTimeout(() => {
        setFadeOut(true)
        setTimeout(() => {
          // Open target view based on category
          if (hovered.catConfig.name === 'REASONING') setView('reasoning')
          else if (hovered.catConfig.name === 'EMBEDDING') setView('embeddings')
          else if (hovered.catConfig.name === 'VISION') setView('vision')
          else if (hovered.catConfig.name === 'CODE') setView('code')
          else setView('arena')
          
          setSelectedModelId(hovered.model.id)
        }, 450)
      }, 700)
    }
  }

  const zoomTo = (level) => {
    cameraRef.current.targetZoom = level
  }

  const resetCamera = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    cameraRef.current.targetX = rect.width / 2
    cameraRef.current.targetY = rect.height / 2
    cameraRef.current.targetZoom = 0.95
  }

  // Calculate coordinates of hover card in screen space
  let cardStyle = {}
  if (hoveredNode && canvasRef.current) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const isMobile = window.innerWidth < 768

    if (isMobile) {
      cardStyle = {
        position: 'absolute',
        left: '12px',
        right: '12px',
        bottom: '12px',
        backgroundColor: 'rgba(26, 23, 16, 0.9)',
        backdropFilter: 'blur(16px)',
        border: `1.5px solid ${hoveredNode.color}60`,
        boxShadow: 'var(--clay-shadow-dark)',
        borderRadius: '18px',
        padding: '16px',
        pointerEvents: 'none',
        zIndex: 100,
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.25s',
      }
    } else {
      const screenX = rect.width / 2 + (hoveredNode.x - cameraRef.current.x) * cameraRef.current.zoom
      const screenY = rect.height / 2 + (hoveredNode.y - cameraRef.current.y) * cameraRef.current.zoom
      
      // Avoid tooltip going off screen right or bottom
      const isRightHalf = screenX > rect.width / 2
      const isBottomHalf = screenY > rect.height / 2

      cardStyle = {
        position: 'absolute',
        left: isRightHalf ? `${screenX - 360}px` : `${screenX + 20}px`,
        top: isBottomHalf ? `${screenY - 200}px` : `${screenY + 20}px`,
        width: '340px',
        backgroundColor: 'rgba(26, 23, 16, 0.75)',
        backdropFilter: 'blur(16px)',
        border: `1.5px solid ${hoveredNode.color}60`,
        boxShadow: 'var(--clay-shadow-dark)',
        borderRadius: '18px',
        padding: '20px',
        pointerEvents: 'none',
        zIndex: 100,
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.25s, transform 0.2s',
        transform: 'scale(1)'
      }
    }
  }

  const getModelCapability = (m) => {
    const id = m.id.toLowerCase()
    if (id.includes('llama-3.1-405b') || id.includes('405b')) return 'Frontier-class reasoning, math & synthetic data generation.'
    if (id.includes('deepseek') || id.includes('reasoning')) return 'Multi-step reasoning chain with deep logical search.'
    if (id.includes('vision') || id.includes('vl')) return 'High-resolution visual recognition and OCR processing.'
    if (id.includes('embed')) return 'Dense mathematical text semantic vector indexing.'
    if (id.includes('nemotron')) return 'NVIDIA fine-tuned general purpose conversational agent.'
    return 'Optimized cloud deployment for low-latency specialized tasks.'
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-void)' }}>
      <div className="dot-grid" style={{ opacity: 0.05 }} />

      {/* Screen crossfade transition overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'var(--bg-void)',
        opacity: fadeOut ? 1 : 0,
        pointerEvents: 'none',
        transition: 'opacity 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)',
        zIndex: 999
      }} />

      <canvas 
        ref={canvasRef} 
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleMouseClick}
        style={{ 
          position: 'absolute', 
          inset: 0, 
          width: '100%', 
          height: '100%', 
          cursor: isDraggingRef.current ? 'grabbing' : hoveredNode ? 'pointer' : 'grab' 
        }}
      />
      
      {/* Floating Rich Glass Inspection Tooltip */}
      {hoveredNode && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ 
              backgroundColor: `${hoveredNode.catConfig.color}20`, 
              color: hoveredNode.catConfig.color,
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              fontFamily: "'JetBrains Mono', monospace",
              border: `1px solid ${hoveredNode.catConfig.color}40`
            }}>
              {hoveredNode.catConfig.name}
            </span>
            <span style={{ 
              backgroundColor: 'rgba(255,255,255,0.04)', 
              color: 'var(--text-secondary)',
              padding: '3px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontFamily: "'JetBrains Mono', monospace"
            }}>
              {hoveredNode.model.contextWindow}
            </span>
          </div>

          <div style={{ 
            color: 'var(--text-primary)', 
            fontSize: '15px', 
            fontWeight: 600, 
            marginBottom: '6px', 
            fontFamily: "'JetBrains Mono', monospace",
            wordBreak: 'break-all',
            lineHeight: 1.3
          }}>
            {hoveredNode.model.id.split('/').pop()}
          </div>
          
          <div style={{ 
            color: 'var(--text-secondary)', 
            fontSize: '11px', 
            marginBottom: '12px', 
            fontFamily: "'Inter', sans-serif" 
          }}>
            by {hoveredNode.model.providerName}
          </div>

          <div style={{ 
            color: 'rgba(255,255,255,0.65)', 
            fontSize: '12.5px', 
            lineHeight: 1.4,
            marginBottom: '20px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: '12px'
          }}>
            {getModelCapability(hoveredNode.model)}
          </div>

          <div style={{
            color: hoveredNode.color,
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            fontFamily: "'JetBrains Mono', monospace",
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            Click to open {
              hoveredNode.catConfig.name === 'REASONING' ? 'REASONING ENGINE' :
              hoveredNode.catConfig.name === 'EMBEDDING' ? 'EMBEDDING SEARCH' :
              hoveredNode.catConfig.name === 'VISION' ? 'VISION LAB' :
              hoveredNode.catConfig.name === 'CODE' ? 'CODE LAB' : 'CHAT ARENA'
            } → <span className="terminal-cursor" style={{ margin: 0, width: '4px', height: '8px', backgroundColor: hoveredNode.color }} />
          </div>
        </div>
      )}

      {/* Floating HUD Camera Panel */}
      <div className="glass-card" style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 5,
        transition: 'none',
        transform: 'none'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--amber-c)', fontWeight: 700 }}>
            Map Controls
          </span>
          <span style={{
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-secondary)',
            backgroundColor: 'rgba(255,255,255,0.05)',
            padding: '2px 5px',
            borderRadius: '4px'
          }}>
            {(cameraRef.current.targetZoom).toFixed(2)}x
          </span>
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => zoomTo(Math.min(4.5, cameraRef.current.targetZoom * 1.3))}
            className="btn"
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '8px',
              fontSize: '14px',
              lineHeight: 1
            }}
          >
            +
          </button>
          <button 
            onClick={() => zoomTo(Math.max(0.35, cameraRef.current.targetZoom / 1.3))}
            className="btn"
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '8px',
              fontSize: '14px',
              lineHeight: 1
            }}
          >
            -
          </button>
          <button 
            onClick={resetCamera}
            className="btn"
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: '8px',
              fontSize: '9.5px'
            }}
          >
            RESET
          </button>
          <button 
            onClick={() => setShowHelp(!showHelp)}
            className={`btn ${showHelp ? 'btn-primary' : ''}`}
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 700
            }}
          >
            ?
          </button>
        </div>
      </div>

      {/* Floating Immersive HUD Instructions Guide */}
      {showHelp && (
        <div className="glass-card" style={{
          position: 'absolute',
          bottom: '24px',
          left: '20px',
          padding: '16px 20px',
          width: '320px',
          zIndex: 5,
          transition: 'none',
          transform: 'none'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--amber-c)', fontWeight: 700, letterSpacing: '0.05em' }}>
              milkyway.ai Guide
            </span>
            <span 
              onClick={() => setShowHelp(false)}
              style={{ fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", transition: 'color 0.2s' }}
              onMouseOver={e => e.target.style.color = 'var(--text-primary)'}
              onMouseOut={e => e.target.style.color = 'var(--text-secondary)'}
            >
              [CLOSE]
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>DRAG</span>
              <span>Pan the map</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>SCROLL</span>
              <span>Zoom in & out</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>HOVER</span>
              <span>Inspect capabilities</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", fontSize: '11px' }}>CLICK</span>
              <span>Select & prototype</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

