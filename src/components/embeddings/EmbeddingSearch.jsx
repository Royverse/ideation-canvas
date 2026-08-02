/**
 * @file EmbeddingSearch.jsx
 * @description Semantic search workspace. Documents are embedded into vectors,
 * a query is embedded the same way, and the map arranges each document by how
 * close its meaning is to the query.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { embedText, isAbortError } from '../../api/nvidia'
import { useModelPicker } from '../../hooks/useModelPicker'
import { useMediaQuery, usePrefersReducedMotion } from '../../hooks/useMediaQuery'
import { ModelSelect } from '../shared/ModelSelect'
import { explainError } from '../../lib/errors'
import { PALETTE, CHANNELS, alpha, SIMILARITY_SCALE, similarityColor } from '../../theme'

/** Embedding models tuned for retrieval, best first. */
const PREFERRED = ['nv-embedqa', 'nv-embed-v1', 'embed']

/** Distance from the query at which a document with zero similarity sits, in px. */
const MAX_ORBIT = 240

/** Seed corpus, spread across several domains so matches are visibly selective. */
const SEED_CORPUS = [
  'The transformer architecture uses self-attention to process sequences in parallel',
  'CUDA cores handle thousands of threads simultaneously for GPU parallelism',
  'Black holes warp spacetime according to general relativity',
  'Large language models are trained using next-token prediction on internet text',
  'The Krebs cycle generates ATP through oxidative phosphorylation',
  'Monte Carlo methods use random sampling to estimate mathematical values',
  'DNA encodes genetic information in sequences of four nucleotide bases',
  'Gradient descent minimizes loss by iteratively adjusting model weights',
  'The stock market reflects aggregate expectations about future corporate earnings',
  'Quantum entanglement creates correlations between particles regardless of distance',
  'NVIDIA GPUs accelerate matrix multiplications essential for deep learning',
  'Attention mechanisms allow models to weight relevance of input tokens dynamically',
  'The immune system uses antibodies to neutralize foreign pathogens',
  'Reinforcement learning trains agents through reward signals from an environment',
  'Neural networks approximate functions by composing layers of nonlinear transforms',
]

const EXAMPLE_QUERIES = [
  'CUDA core thread parallelism',
  'Transformer model self-attention layer',
  'ATP generation in the cell',
  'General relativity black holes',
]

/**
 * Cosine similarity between two equal-length vectors.
 * @param {number[]} a - First vector.
 * @param {number[]} b - Second vector.
 * @returns {number} Similarity from -1 to 1; 0 when either vector is degenerate.
 */
function cosineSimilarity(a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function EmbeddingSearch({ apiKey, models, selectedModelId, setSelectedModelId }) {
  const [corpus, setCorpus] = useState(
    () => SEED_CORPUS.map((text, id) => ({ id, text, embedding: null })),
  )
  const [query, setQuery] = useState('')
  // Results are tagged with the model that produced them. Vectors from one
  // model are not comparable with a query vector from another, so results are
  // shown only while the model that made them is still selected.
  const [search, setSearch] = useState({ modelId: null, results: [] })
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [customText, setCustomText] = useState('')
  const [showExplainer, setShowExplainer] = useState(false)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const reducedMotion = usePrefersReducedMotion()

  const canvasRef = useRef(null)
  const nodesRef = useRef([])
  const scoresRef = useRef(new Map())
  const hoveredIdRef = useRef(null)
  const hasSearchedRef = useRef(false)
  const abortRef = useRef(null)

  const embedModels = useMemo(
    () => models.filter((m) => m.category === 'embedding'),
    [models],
  )

  const { modelId, selectModel } = useModelPicker(embedModels, {
    selectedModelId,
    setSelectedModelId,
    prefer: PREFERRED,
  })

  // A document counts as indexed only if its vector came from the model that
  // is currently selected. Switching models therefore invalidates the whole
  // index by derivation, with no state to reset.
  const pending = useMemo(
    () => corpus.filter((doc) => !doc.embedding || doc.embeddedWith !== modelId),
    [corpus, modelId],
  )
  const indexed = corpus.length - pending.length
  const isIndexing = Boolean(modelId) && pending.length > 0 && !error
  const results = search.modelId === modelId ? search.results : []
  const hasSearched = results.length > 0

  useEffect(() => () => abortRef.current?.abort(), [])

  // Embed everything that does not yet have a vector from this model.
  useEffect(() => {
    if (!apiKey || !modelId || pending.length === 0) return

    const controller = new AbortController()
    abortRef.current = controller
    const ids = pending.map((doc) => doc.id)

    embedText(apiKey, {
      model: modelId,
      input: pending.map((doc) => doc.text),
      inputType: 'passage',
      signal: controller.signal,
    })
      .then((vectors) => {
        // Match vectors back to documents by id — the corpus can grow while a
        // request is in flight, so position is not a reliable pairing.
        const byId = new Map(ids.map((id, i) => [id, vectors[i]]))
        setCorpus((prev) => prev.map((doc) => (
          byId.has(doc.id)
            ? { ...doc, embedding: byId.get(doc.id), embeddedWith: modelId }
            : doc
        )))
      })
      .catch((err) => {
        if (!isAbortError(err)) setError(explainError(err.message))
      })

    return () => controller.abort()
  }, [apiKey, modelId, pending])

  // Give every document a position, keeping any it already had so adding a new
  // document does not teleport the rest of the map.
  useEffect(() => {
    const count = corpus.length
    nodesRef.current = corpus.map((doc, index) => {
      const existing = nodesRef.current.find((n) => n.id === doc.id)
      const angle = (index / count) * Math.PI * 2
      const orbit = 130 + Math.sin(index * 8) * 30
      return {
        id: doc.id,
        text: doc.text,
        x: existing?.x ?? 250 + Math.cos(angle) * orbit,
        y: existing?.y ?? 180 + Math.sin(angle) * orbit,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        baseOrbit: orbit,
        baseAngle: angle,
        pulsePhase: existing?.pulsePhase ?? Math.random() * Math.PI * 2,
      }
    })
  }, [corpus])

  // Mirror hover and search state into refs so the render loop reads the
  // current value without the effect restarting on every hover.
  useEffect(() => { hoveredIdRef.current = hoveredId }, [hoveredId])
  useEffect(() => { hasSearchedRef.current = hasSearched }, [hasSearched])

  /**
   * The semantic map.
   *
   * Documents are pulled toward or pushed away from the query at the centre
   * until their distance encodes their similarity: an exact match lands on the
   * query, an unrelated document drifts to the rim. Before a search runs they
   * simply orbit, which reads as "indexed but unranked".
   *
   * All colours are literals — a canvas context cannot resolve `var(--x)`.
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let frame
    let t = 0

    const draw = () => {
      const width = canvas.clientWidth || 500
      const height = canvas.clientHeight || 400
      const dpr = window.devicePixelRatio || 1

      if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
        canvas.width = Math.floor(width * dpr)
        canvas.height = Math.floor(height * dpr)
      }

      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)
      t += 0.02

      const cx = width / 2
      const cy = height / 2
      const searched = hasSearchedRef.current
      const hovered = hoveredIdRef.current

      // Distance rings, labelled with the similarity each ring represents.
      ctx.strokeStyle = alpha(CHANNELS.nebulaGlow, 0.07)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, 0); ctx.lineTo(cx, height)
      ctx.moveTo(0, cy); ctx.lineTo(width, cy)
      ctx.stroke()

      for (let r = 60; r <= MAX_ORBIT; r += 60) {
        ctx.strokeStyle = alpha(CHANNELS.nebulaGlow, 0.05)
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.stroke()
        ctx.font = '8.5px "JetBrains Mono", monospace'
        ctx.fillStyle = alpha(CHANNELS.nebulaGlow, 0.4)
        ctx.textAlign = 'left'
        ctx.fillText(`${(1 - r / MAX_ORBIT).toFixed(2)}`, cx + r - 20, cy - 4)
      }

      // The query sits at the centre; everything is positioned relative to it.
      if (searched) {
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 35)
        glow.addColorStop(0, alpha(CHANNELS.nebulaGlow, 0.25))
        glow.addColorStop(1, alpha(CHANNELS.nebulaGlow, 0))
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(cx, cy, 35, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = PALETTE.nebulaGlow
        ctx.beginPath()
        ctx.arc(cx, cy, 6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()

        ctx.font = 'bold 9px "JetBrains Mono", monospace'
        ctx.fillStyle = PALETTE.nebulaGlow
        ctx.textAlign = 'center'
        ctx.fillText('Your query', cx, cy - 14)
      }

      for (const node of nodesRef.current) {
        const dx = node.x - cx
        const dy = node.y - cy
        const distance = Math.hypot(dx, dy) || 1

        // Target distance is the inverse of similarity: closer means more alike.
        const score = Math.max(0, scoresRef.current.get(node.id) ?? 0)
        const target = searched ? (1 - score) * MAX_ORBIT : node.baseOrbit

        if (!reducedMotion) {
          const force = (target - distance) * 0.08
          node.vx += (dx / distance) * force
          node.vy += (dy / distance) * force

          if (!searched) {
            node.vx += -Math.sin(node.baseAngle + t * 0.15) * 0.04
            node.vy += Math.cos(node.baseAngle + t * 0.15) * 0.04
          }

          node.vx *= 0.88
          node.vy *= 0.88
          node.x += node.vx
          node.y += node.vy
        } else {
          // Place directly, with no motion, when animation is unwelcome.
          node.x = cx + (dx / distance) * target
          node.y = cy + (dy / distance) * target
        }

        const isHovered = hovered === node.id
        const color = searched ? similarityColor(score) : alpha('255, 255, 255', 0.45)

        // Only connect documents that actually matched.
        if (searched && score > 0.3) {
          ctx.strokeStyle = color + '33'
          ctx.lineWidth = 0.5 + (score - 0.3) * 2.2
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(node.x, node.y)
          ctx.stroke()
        }

        const pulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2 + node.pulsePhase)
        const radius = isHovered ? 9 : 4.5 + pulse

        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = isHovered ? '#ffffff' : color
        ctx.fill()

        if (isHovered) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2)
          ctx.stroke()
        }

        ctx.font = '8.5px "JetBrains Mono", monospace'
        ctx.fillStyle = isHovered ? '#ffffff' : alpha('255, 255, 255', 0.65)
        ctx.textAlign = 'left'
        const label = node.text.length > 16 ? `${node.text.slice(0, 16)}…` : node.text
        ctx.fillText(label, node.x + radius + 5, node.y + 3)
      }

      ctx.restore()
      frame = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(frame)
  }, [reducedMotion])

  const runSearch = useCallback(async () => {
    if (!query.trim() || !modelId || isIndexing) return
    setIsSearching(true)

    try {
      const [queryVector] = await embedText(apiKey, {
        model: modelId,
        input: [query.trim()],
        inputType: 'query',
      })

      const scored = corpus.map((doc) => ({
        ...doc,
        score: doc.embedding ? cosineSimilarity(queryVector, doc.embedding) : 0,
      }))

      // Scores live in their own map rather than on the node objects: the
      // nodes carry physics state owned by the render loop, and keeping the
      // two apart means a search never has to reach into that loop's data.
      scoresRef.current = new Map(scored.map((d) => [d.id, d.score]))
      hasSearchedRef.current = true

      setSearch({ modelId, results: [...scored].sort((a, b) => b.score - a.score) })
      setError(null)
    } catch (err) {
      if (!isAbortError(err)) setError(explainError(err.message))
    } finally {
      setIsSearching(false)
    }
  }, [apiKey, modelId, query, corpus, isIndexing])

  const handlePointerMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hit = nodesRef.current.find((n) => Math.hypot(n.x - x, n.y - y) < 16)
    setHoveredId(hit?.id ?? null)
  }

  const addDocument = () => {
    const text = customText.trim()
    if (!text) return
    setCorpus((prev) => [...prev, { id: Math.max(-1, ...prev.map((d) => d.id)) + 1, text, embedding: null }])
    setCustomText('')
  }

  const hoveredDoc = hoveredId === null ? null : corpus.find((d) => d.id === hoveredId)
  const hoveredScore = results.find((r) => r.id === hoveredId)?.score ?? 0
  const listItems = results.length > 0 ? results : corpus

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-void)', position: 'relative' }}>
      <div className="dot-grid" style={{ opacity: 0.1 }} />

      <div className="top-bar" style={{ zIndex: 2 }}>
        <ModelSelect label="Model" models={embedModels} value={modelId} onChange={selectModel} />
        <div style={{ flex: 1 }} />
        {isIndexing && (
          <span className="working-badge working-badge-pending">
            <span className="status-dot status-dot-pending" />
            Indexing {indexed}/{corpus.length}
          </span>
        )}
        {!isMobile && (
          <button
            type="button"
            className={`btn${showExplainer ? ' btn-primary' : ''}`}
            onClick={() => setShowExplainer(!showExplainer)}
            aria-expanded={showExplainer}
            style={{ padding: '4px 10px', fontSize: '10px' }}
          >
            How this works
          </button>
        )}
      </div>

      {showExplainer && (
        <div className="explainer-panel">
          <div className="explainer-title">Embeddings, briefly</div>
          <p>
            An embedding model turns a sentence into a long list of numbers — a
            point in space. Sentences that mean similar things land near each
            other, even when they share no words.
          </p>
          <p>
            Searching embeds your query the same way and measures the angle
            between it and every document. On the map, that becomes distance:
            close to the centre means close in meaning.
          </p>
        </div>
      )}

      {error && (
        <div className="error-box" style={{ margin: '12px 20px 0' }} role="alert">
          <span aria-hidden="true" style={{ fontSize: '14px' }}>◈</span>
          <div>
            <span className="error-box-title">Embedding failed</span>
            <span className="error-box-body">{error}</span>
          </div>
        </div>
      )}

      <div className="embeddings-split" style={{ flex: 1, display: 'flex', overflow: 'hidden', zIndex: 1 }}>

        {/* Map */}
        <div className="embeddings-map-panel" style={{ flex: 1.3, position: 'relative', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
          <div className="map-caption">Semantic space — distance is dissimilarity</div>

          <canvas
            ref={canvasRef}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoveredId(null)}
            aria-label={`Semantic map of ${corpus.length} documents`}
            style={{ flex: 1, width: '100%', height: '100%', display: 'block' }}
          />

          <div className="map-legend" aria-hidden="true">
            <div className="map-legend-title">Match strength</div>
            {SIMILARITY_SCALE.map((step) => (
              <div key={step.label} className="map-legend-row">
                <span className="map-legend-dot" style={{ background: step.color }} />
                {step.label}
              </div>
            ))}
          </div>

          {hoveredDoc && (
            <div
              className="glass-card map-hovercard"
              style={{ borderColor: hasSearched ? similarityColor(hoveredScore) : 'var(--border-subtle)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="field-caption">Document {hoveredDoc.id + 1}</span>
                {hasSearched && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10.5px', fontWeight: 700, color: similarityColor(hoveredScore) }}>
                    {(hoveredScore * 100).toFixed(1)}% match
                  </span>
                )}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                {hoveredDoc.text}
              </div>
            </div>
          )}

          <div className="map-search-bar">
            <input
              className="field-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
              aria-label="Search the corpus by meaning"
              placeholder="Describe what you are looking for…"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className={`btn ${query.trim() && !isSearching ? 'btn-primary' : ''}`}
              onClick={runSearch}
              disabled={!query.trim() || isSearching || isIndexing || !modelId}
              style={{ padding: '0 24px' }}
            >
              {isSearching ? 'Searching…' : 'Search'}
            </button>
          </div>

          <div className="map-examples">
            <span className="field-caption">Try</span>
            {EXAMPLE_QUERIES.map((example) => (
              <button key={example} type="button" className="chip" onClick={() => setQuery(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* Documents */}
        <div className="embeddings-list-panel" style={{ flex: 0.9, display: 'flex', flexDirection: 'column', background: 'rgba(3, 3, 9, 0.45)', overflowY: 'auto' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
            <label className="field-label" htmlFor="corpus-add">Add a document</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="corpus-add"
                type="text"
                className="field-input"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addDocument() }}
                placeholder="A sentence to add to the corpus…"
                style={{ flex: 1, padding: '6px 12px', fontSize: '11px' }}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={addDocument}
                disabled={!customText.trim()}
                style={{ padding: '0 16px', fontSize: '11px', height: '32px' }}
              >
                Add
              </button>
            </div>
          </div>

          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="field-caption">{results.length > 0 ? 'Ranked results' : 'Corpus'}</span>
            <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontFamily: "'JetBrains Mono', monospace" }}>
              {indexed}/{corpus.length} indexed
            </span>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {listItems.map((doc) => {
              const scored = results.length > 0
              return (
                <div
                  key={doc.id}
                  className="glass-card doc-card"
                  onMouseEnter={() => setHoveredId(doc.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setQuery(doc.text)}
                  style={{
                    background: hoveredId === doc.id ? alpha(CHANNELS.nebulaCore, 0.08) : 'rgba(255, 255, 255, 0.015)',
                    borderColor: hoveredId === doc.id ? 'var(--border-active)' : 'var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="field-caption">Document {doc.id + 1}</span>
                    {scored ? (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10.5px', fontWeight: 700, color: similarityColor(doc.score) }}>
                        {(doc.score * 100).toFixed(1)}%
                      </span>
                    ) : !doc.embedding && (
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '8px', color: PALETTE.pending }}>
                        Indexing
                      </span>
                    )}
                  </div>

                  {scored && (
                    <div className="doc-score-track">
                      <div
                        className="doc-score-fill"
                        style={{ width: `${Math.max(0, doc.score * 100)}%`, background: similarityColor(doc.score) }}
                      />
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                    {doc.text}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
