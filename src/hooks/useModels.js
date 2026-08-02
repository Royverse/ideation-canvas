/**
 * @file useModels.js
 * @description Loads the NIM model registry and enriches each entry with the
 * category and context-window metadata the UI groups and sizes models by.
 */

import { useEffect, useState } from 'react'
import { fetchModels, isAbortError } from '../api/nvidia'

/**
 * Sorts a model id into one of the app's six workspaces.
 *
 * Order matters. Embeddings are checked first because several embedding models
 * carry names that would otherwise match the chat family list, and reasoning is
 * checked before vision so a reasoning-capable VLM lands in the workspace that
 * can actually show its chain of thought.
 *
 * @param {string} modelId - Fully-qualified model id, e.g. `meta/llama-3.1-8b-instruct`.
 * @returns {'specialist'|'embedding'|'reasoning'|'vision'|'code'|'chat'|'other'} Category key.
 */
function categoriseModel(modelId) {
  const id = modelId.toLowerCase()

  const matches = (...needles) => needles.some((n) => id.includes(n))

  // Checked first, because these are chat-shaped without being chat. A safety
  // classifier answers "safe"/"unsafe", a reward model returns a score, a
  // parser wants a document rather than a sentence. They pass every
  // availability check and then disappoint, which is exactly the experience
  // this categorisation exists to prevent.
  if (matches(
    'guard', 'safety', 'topic-control', 'content-safety', 'jailbreak',
    'reward', 'parse', 'translate', 'ocr', 'detector', 'moderation',
  )) {
    return 'specialist'
  }

  if (matches('embed', 'retrieval', 'rerank')) return 'embedding'

  if (matches('thinking', 'deepseek-r', 'reasoning', 'qwq', 'math', 'o1', 'o3')) {
    return 'reasoning'
  }

  if (matches(
    'vision', '-vl', 'vl-', 'neva', 'paligemma', 'phi-3-v', 'phi-4-multimodal',
    'pixtral', 'llava', 'internvl', 'fuyu', 'florence', 'nvclip',
  )) {
    return 'vision'
  }

  if (matches('coder', 'codestral', 'starcoder', 'codellama', 'code-', 'code_')) {
    return 'code'
  }

  if (matches(
    'instruct', 'chat', 'llama', 'mistral', 'mixtral', 'gemma', 'qwen',
    'nemotron', 'phi', 'jamba', 'solar', 'arctic', 'falcon', 'command',
    'granite', 'dbrx', 'baichuan', 'moonshot', 'kimi', 'writer', 'upstage',
    '01-ai', 'deepseek', 'yi-',
  )) {
    return 'chat'
  }

  return 'other'
}

/**
 * Estimates a context window from the model id.
 *
 * The `/models` endpoint does not report context length, so this reads the
 * conventions model publishers encode in their names. It drives node sizing on
 * the constellation map and the badge on the inspector card — presentation
 * only, never request parameters.
 *
 * @param {string} modelId - Fully-qualified model id.
 * @returns {string} Human-readable window size, e.g. `128K`.
 */
function estimateContextWindow(modelId) {
  const id = modelId.toLowerCase()

  const explicit = id.match(/(\d+)k\b/)
  if (explicit) return `${explicit[1]}K`

  if (/llama-3\.[123]|llama-4|deepseek-v3|deepseek-r1|phi-4|nemotron/.test(id)) return '128K'
  if (/mistral|mixtral|codestral|qwen2|qwen3/.test(id)) return '32K'
  if (/gemma-2|gemma-3/.test(id)) return '16K'
  return '8K'
}

/**
 * Turns a raw registry entry into the shape the UI consumes.
 * @param {{id: string}} model - Raw model record from the gateway.
 * @returns {Object} Model with `providerName`, `category` and `contextWindow`.
 */
function decorate(model) {
  return {
    ...model,
    providerName: model.id.split('/')[0].toUpperCase(),
    category: categoriseModel(model.id),
    contextWindow: estimateContextWindow(model.id),
  }
}

/**
 * Cache key for a given account. Keeps one catalog per key, not one global.
 * The version suffix is bumped whenever `decorate` changes shape, so a cached
 * catalog is never read back under a newer set of rules.
 */
const cacheKeyFor = (apiKey) => `nim_models_v2_${apiKey.slice(0, 10)}`

/**
 * Reads a previously cached catalog, if there is one.
 * @param {string} apiKey - NVIDIA NIM API token.
 * @returns {Array} Cached models, or an empty list.
 */
function readCache(apiKey) {
  if (!apiKey) return []
  try {
    return JSON.parse(localStorage.getItem(cacheKeyFor(apiKey)) || '[]')
  } catch {
    return [] // Unreadable or stale-format cache — the network will refill it.
  }
}

/**
 * Fetches and decorates the model registry for the active key.
 *
 * A cached catalog is read synchronously on first render so a returning visitor
 * never sees an empty sky, while a fresh request runs behind it. The cache is
 * namespaced per key, so switching accounts cannot show the wrong catalog.
 *
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {boolean} isReady - Whether a key has been resolved yet.
 * @returns {{models: Array, isLoading: boolean, error: string|null}} Registry state.
 */
export function useModels(apiKey, isReady) {
  const [state, setState] = useState(() => ({
    models: readCache(apiKey),
    isLoading: Boolean(apiKey),
    error: null,
  }))

  useEffect(() => {
    if (!isReady || !apiKey) return
    const controller = new AbortController()

    fetchModels(apiKey, controller.signal)
      .then((raw) => {
        const models = raw.map(decorate)
        setState({ models, isLoading: false, error: null })
        try {
          localStorage.setItem(cacheKeyFor(apiKey), JSON.stringify(models))
        } catch {
          // Over quota — the catalog still works for this session.
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return
        // Keep whatever was cached on screen; a stale catalog beats a blank one.
        setState((prev) => ({ ...prev, isLoading: false, error: err.message }))
      })

    return () => controller.abort()
  }, [apiKey, isReady])

  return state
}
