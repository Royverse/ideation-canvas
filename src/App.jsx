import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { ApiKeyModal } from './components/ApiKeyModal'
import { Constellation } from './components/constellation/Constellation'
import { ChatArena } from './components/arena/ChatArena'
import { CodeLab } from './components/code/CodeLab'
import { ReasoningEngine } from './components/reasoning/ReasoningEngine'
import { EmbeddingSearch } from './components/embeddings/EmbeddingSearch'
import { VisionLab } from './components/vision/VisionLab'
import { HealthView } from './components/health/HealthView'
import { HealthProvider } from './components/health/HealthContext'

import { useApiKey } from './hooks/useApiKey'
import { useModels } from './hooks/useModels'
import { explainError } from './lib/errors'

/** Workspaces, keyed by the id the sidebar and constellation navigate with. */
const VIEWS = {
  constellation: Constellation,
  arena: ChatArena,
  code: CodeLab,
  reasoning: ReasoningEngine,
  embeddings: EmbeddingSearch,
  vision: VisionLab,
  health: HealthView,
}

function StoryView() {
  return (
    <div className="story-container">
      <style>{`
        @keyframes flow-right {
          to { stroke-dashoffset: -20; }
        }
        .flow-line {
          stroke-dasharray: 6;
          animation: flow-right 1.2s linear infinite;
        }
        .story-text {
          font-size: 13.5px;
          line-height: 1.6;
          color: var(--text-secondary);
        }
        .story-text p {
          margin-bottom: 14px;
        }
        .story-text p:last-child {
          margin-bottom: 0;
        }
        .story-title {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          color: var(--nebula-glow);
          letter-spacing: 0.1em;
          font-weight: 600;
          text-transform: uppercase;
        }
        .host-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 16px;
        }
      `}</style>

      {/* Header */}
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', fontWeight: 600, letterSpacing: '0.16em', color: 'var(--text-dim)', marginBottom: '20px' }}>
          ✦ OUR STORY
        </div>
        <div className="grad-rule" />
      </div>

      {/* Title section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 500, color: '#ffffff', letterSpacing: '-0.02em' }}>
          milkyway.ai
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '680px' }}>
          An immersive, deep-space developer galaxy designed to showcase what is possible when high-performance, containerized AI models are mapped as unified constellations.
        </p>
      </div>

      {/* The Story & Inspiration */}
      <div className="glass-card" style={{ padding: '24px 28px' }}>
        <div className="story-title" style={{ marginBottom: '14px' }}>
          The Cosmic Vision
        </div>
        <div className="story-text">
          <p>
            The journey of <strong>milkyway.ai</strong> began with a simple question: <em>How can we visualize the expanding universe of state-of-the-art AI models as a single cohesive constellation?</em>
          </p>
          <p>
            When NVIDIA introduced Inference Microservices (NIMs), they did not just build high-performance containers—they mapped the stellar pathways of a unified API model gateway. NIMs package industry-standard models—like Llama, DeepSeek, and Nemotron—into self-contained engines using TensorRT and Triton. By standardizing on OpenAI-compatible schemas, they allow us to navigate between models with the ease of shifting coordinates in the night sky.
          </p>
          <p>
            We built this workspace as an immersive deep-space dashboard where text generation, reasoning, embeddings, and vision processing can be explored side-by-side in real time. It is a portal to query, benchmark, and prototype across the model galaxy.
          </p>
        </div>
      </div>

      {/* System Architecture Diagram */}
      <div className="glass-card" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="story-title">
          Unified API Architecture
        </div>
        <p className="story-text" style={{ margin: 0 }}>
          This app communicates via a unified API gateway. The exact same client code connects either to NVIDIA's cloud NIM registry or to your own self-hosted local/VPS model endpoints.
        </p>
        
        {/* SVG Diagram */}
        <div style={{ 
          background: 'rgba(0, 0, 0, 0.25)', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: '12px', 
          padding: '24px 16px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflowX: 'auto',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box'
        }}>
          <svg width="680" height="150" viewBox="0 0 680 150" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Request path: the browser calls /api/nvidia, a proxy rewrites it, and it reaches either NVIDIA's hosted NIM or a self-hosted endpoint." style={{ minWidth: '600px' }}>
            {/* Client Browser Node */}
            <rect x="10" y="35" width="140" height="80" rx="8" fill="rgba(12, 12, 34, 0.8)" stroke="var(--border-active)" strokeWidth="1.5" />
            <text x="80" y="70" fill="#ffffff" fontSize="11" fontFamily="'JetBrains Mono', monospace" fontWeight="600" textAnchor="middle">USER BROWSER</text>
            <text x="80" y="90" fill="var(--text-secondary)" fontSize="9" fontFamily="'Inter', sans-serif" textAnchor="middle">React & Tailwind UI</text>

            {/* Flow Line 1 (Browser to Netlify Proxy) */}
            <path d="M 150 75 L 250 75" stroke="var(--nebula-glow)" strokeWidth="1.5" className="flow-line" />
            <text x="200" y="62" fill="var(--nebula-glow)" fontSize="8.5" fontFamily="'JetBrains Mono', monospace" textAnchor="middle">/api/nvidia/*</text>

            {/* Netlify CORS Proxy Node */}
            <rect x="250" y="35" width="140" height="80" rx="8" fill="rgba(12, 12, 34, 0.8)" stroke="var(--border-base)" strokeWidth="1.5" />
            <text x="320" y="70" fill="#ffffff" fontSize="11" fontFamily="'JetBrains Mono', monospace" fontWeight="600" textAnchor="middle">NETLIFY PROXY</text>
            <text x="320" y="90" fill="var(--text-secondary)" fontSize="9" fontFamily="'Inter', sans-serif" textAnchor="middle">CORS Bypass / Rewrite</text>

            {/* Flow Line 2 (Netlify Proxy to NIM Gateways) */}
            <path d="M 390 75 L 490 75" stroke="var(--nebula-glow)" strokeWidth="1.5" className="flow-line" />
            
            {/* Split Target Gateways */}
            <path d="M 490 75 L 530 45" stroke="var(--nebula-glow)" strokeWidth="1" strokeDasharray="3" />
            <path d="M 490 75 L 530 105" stroke="var(--nebula-glow)" strokeWidth="1" strokeDasharray="3" />

            {/* NVIDIA NIM Cloud Gateways */}
            <rect x="530" y="10" width="140" height="50" rx="6" fill="rgba(12, 12, 34, 0.8)" stroke="rgba(167, 139, 250, 0.2)" strokeWidth="1.2" />
            <text x="600" y="34" fill="#ffffff" fontSize="9.5" fontFamily="'JetBrains Mono', monospace" fontWeight="600" textAnchor="middle">NVIDIA NIM CLOUD</text>
            <text x="600" y="47" fill="var(--text-secondary)" fontSize="8" fontFamily="'Inter', sans-serif" textAnchor="middle">Cloud Inference Registry</text>

            {/* Self-Hosted / local Gateways */}
            <rect x="530" y="85" width="140" height="50" rx="6" fill="rgba(12, 12, 34, 0.8)" stroke="rgba(96, 165, 250, 0.3)" strokeWidth="1.2" />
            <text x="600" y="109" fill="var(--accent-blue)" fontSize="9.5" fontFamily="'JetBrains Mono', monospace" fontWeight="600" textAnchor="middle">LOCAL / VPS NIM</text>
            <text x="600" y="122" fill="var(--text-secondary)" fontSize="8" fontFamily="'Inter', sans-serif" textAnchor="middle">Self-Hosted Server</text>
          </svg>
        </div>
      </div>

      {/* Harnessing Architecture & VPS Hosting */}
      <div className="host-grid">
        {/* NVIDIA's Architecture */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="story-title">
            Harnessing the Architecture
          </div>
          <div className="story-text" style={{ fontSize: '13px' }}>
            <p>
              Under the hood, NVIDIA NIMs coordinate optimal GPU utilization using:
            </p>
            <ul style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' }}>
              <li><strong>TensorRT-LLM:</strong> Highly optimized compiler for CUDA-driven model compilation, maximizing token generation speeds.</li>
              <li><strong>Triton Inference Server:</strong> Handles multi-model orchestration, dynamic batching, and concurrent request streaming.</li>
            </ul>
            <p>
              This architecture ensures that even complex reasoning models run efficiently, yielding sub-millisecond time-to-first-token.
            </p>
          </div>
        </div>

        {/* Local & VPS Hosting */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="story-title">
            Deploying Locally & on VPS
          </div>
          <div className="story-text" style={{ fontSize: '13px' }}>
            <p>
              Ready to take the next step? You can host these exact models on your own local workstation or Virtual Private Server (VPS) with ease:
            </p>
            <ul style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' }}>
              <li><strong>Docker Deployments:</strong> Pull official NIM containers directly onto GPU cloud providers like RunPod, Lambda Labs, or DigitalOcean.</li>
              <li><strong>vLLM & Ollama:</strong> For personal setups, use lightweight, open-source model runners that mimic the exact same OpenAI-compatible API endpoints.</li>
            </ul>
            <p>
              Simply point your client applications to your VPS base URL to experience private, unlimited, and unmetered intelligence.
            </p>
          </div>
        </div>
      </div>

      {/* External Resources */}
      <div className="glass-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div className="story-title">
          Developer Resources
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          {[
            { label: 'NVIDIA NIM Documentation', url: 'https://docs.nvidia.com/nim/' },
            { label: 'Build API Playground',  url: 'https://build.nvidia.com' },
            { label: 'Model Catalog Explore',   url: 'https://build.nvidia.com/explore/discover' },
          ].map(r => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
              style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: '10.5px',
                color: 'var(--nebula-glow)', textDecoration: 'none', padding: '8px 16px',
                borderRadius: '8px', border: '1px solid var(--border-base)',
                background: 'rgba(124, 58, 237, 0.04)', transition: 'all 0.15s',
              }}
              onMouseOver={e => {
                e.currentTarget.style.color = 'var(--nebula-pale)';
                e.currentTarget.style.borderColor = 'var(--border-active)';
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.08)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.color = 'var(--nebula-glow)';
                e.currentTarget.style.borderColor = 'var(--border-base)';
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.04)';
              }}
            >
              {r.label} <span style={{ color: 'var(--text-dim)' }}>↗</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  const { apiKey, isReady, isFromEnv, saveKey, clearKey } = useApiKey()
  const { models, isLoading, error } = useModels(apiKey, isReady)
  const [currentView, setView] = useState('constellation')
  const [selectedModelId, setSelectedModelId] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  if (!isReady) return <ApiKeyModal onKeyValid={saveKey} />

  const Workspace = VIEWS[currentView]

  return (
    <HealthProvider apiKey={apiKey} models={models}>
      <a href="#workspace" className="skip-link">Skip to workspace</a>

      <header className="mobile-header">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          aria-expanded={mobileOpen}
          className="mobile-menu-btn"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
          </svg>
        </button>
        <span className="mobile-header-mark">milkyway.ai</span>
      </header>

      <div
        className={`mobile-overlay${mobileOpen ? ' visible' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      <Sidebar
        currentView={currentView}
        setView={setView}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        onSignOut={isFromEnv ? null : clearKey}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <StatusBar models={models} />

        {isLoading && (
          <div className="app-loading" role="status">
            <div className="app-loading-spinner" />
            <span className="app-loading-label">Loading the model catalog…</span>
          </div>
        )}

        {error && !isLoading && (
          <div className="error-box" style={{ margin: '16px', flexShrink: 0 }} role="alert">
            <span aria-hidden="true" style={{ fontSize: '14px', marginTop: '1px' }}>◈</span>
            <div>
              <span className="error-box-title">Could not load the model catalog</span>
              <span className="error-box-body">{explainError(error)}</span>
            </div>
          </div>
        )}

        <main id="workspace" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {currentView === 'story' ? <StoryView /> : Workspace && (
            <Workspace
              apiKey={apiKey}
              models={models}
              setView={setView}
              selectedModelId={selectedModelId}
              setSelectedModelId={setSelectedModelId}
            />
          )}
        </main>
      </div>
    </HealthProvider>
  )
}

export default App
