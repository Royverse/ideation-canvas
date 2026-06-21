import React, { useState, useEffect, useRef } from 'react'
import { embedText } from '../../api/nvidia'

const INITIAL_CORPUS = [
  "The transformer architecture uses self-attention to process sequences in parallel",
  "CUDA cores handle thousands of threads simultaneously for GPU parallelism",
  "Black holes warp spacetime according to general relativity",
  "Large language models are trained using next-token prediction on internet text",
  "The Krebs cycle generates ATP through oxidative phosphorylation",
  "Monte Carlo methods use random sampling to estimate mathematical values",
  "DNA encodes genetic information in sequences of four nucleotide bases",
  "Gradient descent minimizes loss by iteratively adjusting model weights",
  "The stock market reflects aggregate expectations about future corporate earnings",
  "Quantum entanglement creates correlations between particles regardless of distance",
  "NVIDIA GPUs accelerate matrix multiplications essential for deep learning",
  "Attention mechanisms allow models to weight relevance of input tokens dynamically",
  "The immune system uses antibodies to neutralize foreign pathogens",
  "Reinforcement learning trains agents through reward signals from an environment",
  "Neural networks approximate functions by composing layers of nonlinear transforms"
]

function cosineSimilarity(A, B) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < A.length; i++) {
    dotProduct += A[i] * B[i];
    normA += A[i] * A[i];
    normB += B[i] * B[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function EmbeddingSearch({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [corpus, setCorpus] = useState(INITIAL_CORPUS.map((text, id) => ({ id, text, embedding: null })))
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isInitializing, setIsInitializing] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [selectedModel, setSelectedModel] = useState('')
  
  // Visualizer States
  const [hasSearched, setHasSearched] = useState(false)
  const [hoveredNode, setHoveredNode] = useState(null)
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [showAddDoc, setShowAddDoc] = useState(false)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const nodesRef = useRef([])
  const mousePosRef = useRef({ x: 0, y: 0 })

  const embedModels = models.filter(m => m.category === 'embedding')

  useEffect(() => {
    if (selectedModelId && embedModels.find(m => m.id === selectedModelId)) {
      setSelectedModel(selectedModelId)
    } else if (embedModels.length > 0 && !selectedModel) {
      const preferred = embedModels.find(m => m.id.includes('nv-embed-v1'))
      setSelectedModel(preferred ? preferred.id : embedModels[0].id)
    }
  }, [selectedModelId, embedModels, selectedModel])

  const handleModelChange = (e) => {
    const val = e.target.value
    setSelectedModel(val)
    setSelectedModelId(val)
  }

  // Initialize corpus embeddings
  useEffect(() => {
    const initCorpus = async () => {
      if (!apiKey || !selectedModel || corpus.every(c => c.embedding)) return
      setIsInitializing(true)
      try {
        const textsToEmbed = corpus.filter(c => !c.embedding).map(c => c.text)
        if (textsToEmbed.length > 0) {
          const embeddings = await embedText(apiKey, { model: selectedModel, input: textsToEmbed, inputType: 'passage' })
          
          setCorpus(prev => {
            const next = [...prev]
            let embIdx = 0
            for (let i = 0; i < next.length; i++) {
              if (!next[i].embedding) {
                next[i].embedding = embeddings[embIdx++]
              }
            }
            return next
          })
        }
      } catch (err) {
        console.error('Failed to embed corpus:', err)
      } finally {
        setIsInitializing(false)
      }
    }
    
    initCorpus()
  }, [apiKey, selectedModel, corpus])

  // Initialize physical nodes for the canvas once corpus has embeddings
  useEffect(() => {
    const count = corpus.length
    nodesRef.current = corpus.map((doc, idx) => {
      const angle = (idx / count) * Math.PI * 2
      const distance = 130 + Math.sin(idx * 8) * 30
      
      // Retain existing physics coordinates if available to prevent snapping
      const existing = nodesRef.current.find(n => n.id === doc.id)

      return {
        ...doc,
        x: existing ? existing.x : 250 + Math.cos(angle) * distance,
        y: existing ? existing.y : 180 + Math.sin(angle) * distance,
        vx: existing ? existing.vx : 0,
        vy: existing ? existing.vy : 0,
        baseDistance: distance,
        baseAngle: angle,
        score: 0,
        pulsePhase: Math.random() * Math.PI * 2
      }
    })
  }, [corpus])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let animFrame
    let t = 0

    const draw = () => {
      const W = canvas.clientWidth || wrapperRef.current?.offsetWidth || 500
      const H = canvas.clientHeight || wrapperRef.current?.offsetHeight || 400
      const dpr = window.devicePixelRatio || 1

      // Adjust backing store size if it doesn't match layouts * DPR
      if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
        canvas.width = Math.floor(W * dpr)
        canvas.height = Math.floor(H * dpr)
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, W, H)
      t += 0.02

      const cx = W / 2
      const cy = H / 2
      const nodes = nodesRef.current

      // 1. Draw grid reference coordinate axes
      ctx.strokeStyle = 'rgba(245, 169, 61, 0.07)'
      ctx.lineWidth = 1
      ctx.beginPath()
      // Vertical axis
      ctx.moveTo(cx, 0)
      ctx.lineTo(cx, H)
      // Horizontal axis
      ctx.moveTo(0, cy)
      ctx.lineTo(W, cy)
      ctx.stroke()

      // Circular range vectors
      for (let r = 60; r <= 240; r += 60) {
        ctx.strokeStyle = 'rgba(245, 169, 61, 0.05)'
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
        // Label ranges
        ctx.font = '8.5px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(245, 169, 61, 0.4)'
        ctx.fillText(`SIM: ${(1 - r / 300).toFixed(2)}`, cx + r - 25, cy - 4)
      }

      // 2. Draw Query gravity attractor in center if search has run
      if (hasSearched) {
        // Outer glow
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 35)
        grad.addColorStop(0, 'rgba(245, 169, 61, 0.25)')
        grad.addColorStop(1, 'rgba(245, 169, 61, 0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(cx, cy, 35, 0, Math.PI * 2)
        ctx.fill()

        // Core star
        ctx.fillStyle = 'var(--amber-c)'
        ctx.beginPath()
        ctx.arc(cx, cy, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Label query
        ctx.font = 'bold 9px "JetBrains Mono", monospace'
        ctx.fillStyle = 'var(--amber-c)'
        ctx.textAlign = 'center'
        ctx.fillText('Search Query', cx, cy - 14)
      }

      // 3. Update and draw nodes physics (gravitational similarity mapping)
      nodes.forEach(n => {
        const dx = n.x - cx
        const dy = n.y - cy
        const dist = Math.sqrt(dx*dx + dy*dy) || 1

        // Target distance based on cosine similarity
        // Formula: TargetRadius = (1.0 - CosineSimilarityScore) * MaxRadius (240px)
        // High similarity matches pull close to center, low matches float outward
        const simScore = Math.max(0, n.score)
        const targetD = hasSearched ? (1 - simScore) * 240 : n.baseDistance

        // Elastic gravitational force towards target distance
        // Accelerates the document node towards its similarity radius
        const force = (targetD - dist) * 0.08
        n.vx += (dx / dist) * force
        n.vy += (dy / dist) * force

        // Add orbital baseline velocity if not searched to make them float around (astronomy effect)
        if (!hasSearched) {
          const orbitSpeed = 0.15
          n.vx += -Math.sin(n.baseAngle + t * orbitSpeed) * 0.04
          n.vy += Math.cos(n.baseAngle + t * orbitSpeed) * 0.04
        }

        // Apply friction/drag
        n.vx *= 0.88
        n.vy *= 0.88

        // Update positions
        n.x += n.vx
        n.y += n.vy

        // Draw matching connection vector lines with flowing particles
        if (hasSearched && n.score > 0.3) {
          const col = getScoreColor(n.score)
          ctx.strokeStyle = col + '22'
          ctx.lineWidth = 0.5 + (n.score - 0.3) * 2.2
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(n.x, n.y)
          ctx.stroke()

          // Flowing particle indicators
          const dashSpeed = 0.04
          const offset = (t * dashSpeed) % 1.0
          const px = cx + (n.x - cx) * offset
          const py = cy + (n.y - cy) * offset
          ctx.fillStyle = col
          ctx.beginPath()
          ctx.arc(px, py, 1.8, 0, Math.PI * 2)
          ctx.fill()
        }

        const isHovered = hoveredNode && hoveredNode.id === n.id
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + n.pulsePhase)
        const r = isHovered ? 9 : 4.5 + pulse * 1
        
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = isHovered ? '#ffffff' : getScoreColor(n.score)
        ctx.fill()

        if (isHovered) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2)
          ctx.stroke()
        }

        // Draw snippet labels next to nodes
        ctx.font = '8.5px "JetBrains Mono", monospace'
        ctx.fillStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.65)'
        ctx.textAlign = 'left'
        const labelText = n.text.substring(0, 16) + (n.text.length > 16 ? '...' : '')
        ctx.fillText(labelText, n.x + r + 5, n.y + 3)

        // Draw Canvas-space tooltip bubble for hovered nodes
        if (isHovered) {
          ctx.fillStyle = 'rgba(17, 16, 9, 0.96)'
          ctx.strokeStyle = getScoreColor(n.score)
          ctx.lineWidth = 1.2
          
          const tipText = n.text.substring(0, 48) + (n.text.length > 48 ? '...' : '')
          ctx.font = '9px "JetBrains Mono", monospace'
          const textW = ctx.measureText(tipText).width + 12
          const boxH = 18
          const bx = n.x - textW / 2
          const by = n.y - r - 25

          ctx.beginPath()
          if (ctx.roundRect) {
            ctx.roundRect(bx, by, textW, boxH, 4)
          } else {
            ctx.rect(bx, by, textW, boxH)
          }
          ctx.fill()
          ctx.stroke()

          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'center'
          ctx.fillText(tipText, n.x, by + 12)
        }
      })

      // 4. Draw Score Match Legend in Bottom Left of Canvas
      const legX = 24
      const legY = H - 110
      const legW = 140
      const legH = 86

      ctx.fillStyle = 'rgba(26, 23, 16, 0.8)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.lineWidth = 1
      ctx.beginPath()
      if (ctx.roundRect) {
        ctx.roundRect(legX, legY, legW, legH, 6)
      } else {
        ctx.rect(legX, legY, legW, legH)
      }
      ctx.fill()
      ctx.stroke()

      ctx.font = 'bold 8px "JetBrains Mono", monospace'
      ctx.fillStyle = 'var(--text-secondary)'
      ctx.textAlign = 'left'
      ctx.fillText('Semantic Match', legX + 10, legY + 14)

      const colors = [
        { label: '> 70% Strong Match', color: '#00ff87' },
        { label: '50-70% Moderate', color: '#ffb347' },
        { label: '30-50% Weak/Marginal', color: '#4dabf7' },
        { label: '< 30% Unrelated', color: '#ff6b6b' }
      ]

      colors.forEach((col, idx) => {
        const cyItem = legY + 28 + idx * 13
        ctx.fillStyle = col.color
        ctx.beginPath()
        ctx.arc(legX + 14, cyItem - 3, 3, 0, Math.PI * 2)
        ctx.fill()

        ctx.font = '8px "JetBrains Mono", monospace'
        ctx.fillStyle = 'rgba(255,255,255,0.65)'
        ctx.fillText(col.label, legX + 24, cyItem)
      })

      ctx.restore()
      animFrame = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(animFrame)
    }
  }, [hasSearched, hoveredNode])

  const handleSearch = async () => {
    if (!query.trim() || !selectedModel || isInitializing) return
    setIsSearching(true)
    setHasSearched(true)
    try {
      const [queryEmbedding] = await embedText(apiKey, { model: selectedModel, input: [query], inputType: 'query' })
      
      const scored = corpus.map(doc => {
        if (!doc.embedding) return { ...doc, score: 0 }
        return {
          ...doc,
          score: cosineSimilarity(queryEmbedding, doc.embedding)
        }
      })

      // Update the animation ref values directly so physics runs immediately
      nodesRef.current.forEach(node => {
        const match = scored.find(s => s.id === node.id)
        if (match) {
          node.score = match.score
        }
      })

      const sorted = [...scored].sort((a, b) => b.score - a.score)
      setResults(sorted)
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setIsSearching(false)
    }
  }

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Find if hovering close to a node
    let found = null
    for (const n of nodesRef.current) {
      const dx = n.x - x
      const dy = n.y - y
      const d = Math.sqrt(dx*dx + dy*dy)
      if (d < 16) {
        found = n
        break
      }
    }
    setHoveredNode(found)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  const getScoreColor = (score) => {
    if (!hasSearched) return 'rgba(255, 255, 255, 0.45)'
    if (score > 0.70) return '#00ff87' // Close match - Green
    if (score > 0.50) return '#ffb347' // Moderate match - Amber
    if (score > 0.30) return '#4dabf7' // Weak match - Light Blue
    return '#ff6b6b' // Poor match - Muted Red
  }

  const [customText, setCustomText] = useState('')
  const [showExplainer, setShowExplainer] = useState(false)
  const currentStep = !selectedModel ? 1 : (isInitializing || corpus.some(c => !c.embedding)) ? 2 : 3

  const handleAddCorpus = () => {
    if (!customText.trim()) return
    const newId = corpus.length
    setCorpus(prev => [...prev, { id: newId, text: customText.trim(), embedding: null }])
    setCustomText('')
  }

  const handleResultClick = (res) => {
    const match = nodesRef.current.find(n => n.id === res.id)
    if (match) {
      setHoveredNode(match)
      // Bounce node slightly
      match.vx += (Math.random() - 0.5) * 5
      match.vy += (Math.random() - 0.5) * 5
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-void)', position: 'relative' }}>
      
      {/* Background Dots */}
      <div className="dot-grid" style={{ opacity: 0.1 }} />
      <div style={{
        position: 'absolute',
        bottom: '15%',
        left: '10%',
        width: '450px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(245, 169, 61, 0.025) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Top Control Bar */}
      <div style={{
        backgroundColor: 'rgba(12, 10, 8, 0.5)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '14px 24px',
        display: 'flex',
        gap: '16px',
        alignItems: 'center',
        zIndex: 2
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '11px', color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>EMBEDDING MODEL:</span>
          <select 
            value={selectedModel}
            onChange={handleModelChange}
            className="field-input model-select-dropdown"
            style={{
              padding: '6px 32px 6px 12px',
              fontSize: '11px',
              color: 'var(--amber-c)',
            }}
          >
            {embedModels.length === 0 ? (
              <option>Loading models...</option>
            ) : (
              embedModels.map(m => (
                <option key={m.id} value={m.id} style={{ backgroundColor: 'var(--bg-elevated)' }}>{m.id.split('/').pop()}</option>
              ))
            )}
          </select>
        </div>
        
        {isInitializing && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: 'var(--accent-amber)',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(255, 179, 71, 0.08)',
            padding: '4px 10px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 179, 71, 0.15)'
          }}>
            <span className="terminal-cursor" style={{ margin: 0, width: '4px', height: '8px', backgroundColor: 'var(--accent-amber)' }} />
            <span>Analyzing documents...</span>
          </div>
        )}
      </div>

      {/* Sub-header Bar: Onboarding Steps */}
      {!isMobile && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 24px',
          backgroundColor: 'rgba(12, 10, 8, 0.4)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--border-subtle)',
          fontSize: '11px',
          fontFamily: "'JetBrains Mono', monospace",
          zIndex: 2
        }}>
          {/* Step Indicator */}
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: currentStep === 1 ? 1 : 0.5 }}>
              <span style={{ color: currentStep === 1 ? 'var(--amber-c)' : 'var(--text-secondary)', fontWeight: 600 }}>1. Select Model</span>
            </div>
            
            <div style={{ color: 'var(--text-dim)' }}>→</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: currentStep === 2 ? 1 : 0.5 }}>
              <span style={{ color: currentStep === 2 ? 'var(--accent-amber)' : 'var(--text-secondary)', fontWeight: 600 }}>
                2. Analyze Documents ({corpus.filter(c => c.embedding).length}/{corpus.length})
              </span>
            </div>

            <div style={{ color: 'var(--text-dim)' }}>→</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: currentStep === 3 ? 1 : 0.5 }}>
              <span style={{ color: currentStep === 3 ? '#00ff87' : 'var(--text-secondary)', fontWeight: 600 }}>3. Search Similarity</span>
            </div>
          </div>

          {/* Explainer Toggle Button */}
          <button 
            onClick={() => setShowExplainer(!showExplainer)}
            className="btn"
            style={{
              padding: '4px 10px', fontSize: '10px',
              borderColor: showExplainer ? 'rgba(245, 169, 61, 0.35)' : undefined,
              color: showExplainer ? 'var(--amber-c)' : undefined,
              background: showExplainer ? 'rgba(245, 169, 61, 0.08)' : undefined
            }}
          >
            {showExplainer ? 'Hide Explanation' : 'How does this work?'}
          </button>
        </div>
      )}

      {/* Onboarding Explainer Panel */}
      {showExplainer && (
        <div style={{
          backgroundColor: 'rgba(12, 10, 8, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '16px 24px',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ color: 'var(--amber-c)', fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: '0.05em' }}>
            ◈ UNDERSTANDING TEXT EMBEDDINGS
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: '1.6' }}>
            Embeddings turn sentences into coordinate points. Sentences with similar meanings are mapped closer together. 
            When you type a query and search, the map pulls similar ideas toward the center and pushes unrelated ones to the edges.
            Hover over dots to read sentences, add new ones on the right, or search using the query box below.
          </div>
        </div>
      )}

      {/* Main Split Layout */}
      <div className="embeddings-split" style={{ flex: 1, display: 'flex', overflow: 'hidden', zIndex: 1 }}>
        
        {/* Left Side: Vector Space Map Visualizer */}
        <div ref={wrapperRef} className="embeddings-map-panel" style={{ flex: 1.3, position: 'relative', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '24px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            color: 'var(--text-secondary)',
            zIndex: 3,
            letterSpacing: '0.05em'
          }}>
            Semantic Space — similarity mapped by distance
          </div>

          <canvas 
            ref={canvasRef} 
            onMouseMove={handleMouseMove}
            style={{ flex: 1, width: '100%', height: '100%', display: 'block', backgroundColor: 'rgba(12, 10, 8, 0.1)' }}
          />

          {/* Floating Hover Annotation HUD Card */}
          {hoveredNode && (
            <div className="glass-card" style={{
              position: 'absolute',
              bottom: '120px',
              left: '24px',
              right: '24px',
              border: `1.5px solid ${hasSearched ? getScoreColor(hoveredNode.score) : 'var(--border-subtle)'}`,
              padding: '16px 20px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              zIndex: 10
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)', fontWeight: 600 }}>Document Vector #{hoveredNode.id + 1}</span>
                {hasSearched && (
                  <span style={{ fontSize: '10.5px', fontFamily: "'JetBrains Mono', monospace", color: getScoreColor(hoveredNode.score), fontWeight: 700 }}>
                    Semantic Match: {(hoveredNode.score * 100).toFixed(2)}%
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                {hoveredNode.text}
              </div>
            </div>
          )}

          {/* Prompt input bar docked at the bottom of the map */}
          <div style={{
            padding: '16px 24px 8px 24px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'rgba(12, 10, 8, 0.55)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            gap: '12px'
          }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. How do GPU threads compute matrix weights?"
              className="field-input"
              style={{
                flex: 1,
              }}
            />
            <button 
              onClick={handleSearch}
              disabled={!query.trim() || isSearching || isInitializing}
              className={`btn ${query.trim() && !isSearching ? 'btn-primary' : ''}`}
              style={{
                padding: '0 24px'
              }}
            >
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>

          {/* Example chips below input */}
          <div style={{
            padding: '0 24px 16px 24px',
            backgroundColor: 'rgba(12, 10, 8, 0.7)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            <span style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-dim)', alignSelf: 'center' }}>Examples:</span>
            {[
              "CUDA core thread parallelism",
              "Transformer model self-attention layer",
              "ATP generation in the cell",
              "General relativity black holes"
            ].map(ex => (
              <span 
                key={ex}
                onClick={() => setQuery(ex)}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  borderRadius: '12px',
                  padding: '3px 8.5px',
                  fontSize: '9px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontFamily: "'JetBrains Mono', monospace"
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--amber-c)'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
              >
                {ex}
              </span>
            ))}
          </div>

        </div>

        {/* Right Side: List Details Drawer */}
        <div className="embeddings-list-panel" style={{
          flex: 0.9,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(12, 10, 8, 0.45)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          overflowY: 'auto'
        }}>
          
          {/* Custom Corpus Input Section */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'rgba(255,255,255,0.01)' }}>
            {isMobile && !showAddDoc ? (
              <button 
                onClick={() => setShowAddDoc(true)}
                className="btn"
                style={{
                  width: '100%',
                  padding: '8px',
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: 'var(--accent-phosphor)',
                  borderColor: 'rgba(0, 255, 135, 0.2)',
                  background: 'rgba(0, 255, 135, 0.03)'
                }}
              >
                + Add Custom Document
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '9.5px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-phosphor)', letterSpacing: '0.08em', fontWeight: 700 }}>
                    + Add Custom Document
                  </span>
                  {isMobile && (
                    <button 
                      onClick={() => setShowAddDoc(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '10px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text"
                    value={customText}
                    onChange={e => setCustomText(e.target.value)}
                    placeholder="Type custom document text here..."
                    className="field-input"
                    style={{
                      flex: 1,
                      padding: '6px 12px',
                      fontSize: '11px',
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') { handleAddCorpus(); if (isMobile) setShowAddDoc(false); } }}
                  />
                  <button 
                    onClick={() => { handleAddCorpus(); if (isMobile) setShowAddDoc(false); }}
                    disabled={!customText.trim() || isInitializing}
                    className="btn btn-primary"
                    style={{
                      padding: '0 16px',
                      fontSize: '11px',
                      height: '32px',
                      borderColor: 'rgba(0, 255, 135, 0.35)',
                      color: 'var(--accent-phosphor)',
                      backgroundColor: 'rgba(0, 255, 135, 0.08)',
                      boxShadow: 'var(--clay-shadow-btn)'
                    }}
                  >
                    Add
                  </button>
                </div>
              </>
            )}
          </div>

          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)', letterSpacing: '0.15em', fontWeight: 600 }}>Search Results</span>
            <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>{corpus.length} documents loaded</span>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {results.length > 0 ? (
              results.map((res, idx) => (
                <div 
                  key={res.id} 
                  onMouseEnter={() => {
                    const match = nodesRef.current.find(n => n.id === res.id)
                    if (match) setHoveredNode(match)
                  }}
                  onMouseLeave={() => setHoveredNode(null)}
                  onClick={() => handleResultClick(res)}
                  className="glass-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '14px',
                    backgroundColor: hoveredNode?.id === res.id ? 'rgba(245, 169, 61, 0.06)' : 'rgba(255, 255, 255, 0.015)',
                    border: `1px solid ${hoveredNode?.id === res.id ? 'rgba(245, 169, 61, 0.3)' : 'var(--border-subtle)'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)', fontWeight: 600 }}>Document #{res.id + 1}</span>
                    <span style={{ fontSize: '10.5px', fontFamily: "'JetBrains Mono', monospace", color: getScoreColor(res.score), fontWeight: 700 }}>
                      {(res.score * 100).toFixed(1)}% Match
                    </span>
                  </div>

                  <div style={{ height: '3.5px', width: '100%', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.max(0, res.score * 100)}%`,
                      backgroundColor: getScoreColor(res.score),
                      transition: 'width 0.4s ease-out'
                    }} />
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                    {res.text}
                  </div>
                </div>
              ))
            ) : (
              corpus.map(c => (
                <div 
                  key={c.id}
                  onMouseEnter={() => {
                    const match = nodesRef.current.find(n => n.id === c.id)
                    if (match) setHoveredNode(match)
                  }}
                  onMouseLeave={() => setHoveredNode(null)}
                  className="glass-card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '12px 14px',
                    backgroundColor: hoveredNode?.id === c.id ? 'rgba(255,255,255,0.03)' : 'transparent',
                    border: `1px solid ${hoveredNode?.id === c.id ? 'rgba(255, 255, 255, 0.12)' : 'var(--border-subtle)'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                  onClick={() => setQuery(c.text)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-secondary)', fontWeight: 600 }}>Document #{c.id + 1}</span>
                    {!c.embedding && (
                      <span style={{ fontSize: '8px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--accent-amber)' }}>Pending Analysis</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.4 }}>
                    {c.text}
                  </div>
                </div>
              ))
            )}

          </div>

        </div>

      </div>
    </div>
  )
}

