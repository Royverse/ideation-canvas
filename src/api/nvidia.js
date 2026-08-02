/**
 * @file nvidia.js
 * @description Client for the NVIDIA NIM inference gateway.
 *
 * Every request goes to `/api/nvidia/*`, which is rewritten to
 * `https://integrate.api.nvidia.com/v1/*` by the Vite dev proxy locally and by a
 * Netlify redirect in production. The gateway is OpenAI-compatible, so the same
 * client works unchanged against a self-hosted NIM container, vLLM, or Ollama —
 * only the rewrite target changes.
 *
 * Streaming responses arrive as Server-Sent Events. All four streaming helpers
 * share one parser (`streamSSE`) so buffering and delta extraction live in a
 * single place.
 */

const BASE_URL = '/api/nvidia'

/** Storage key for the running count of requests made from this browser. */
const API_CALL_COUNTER_KEY = 'milkyway_api_calls'

/** Window event the sidebar listens to so the request counter stays live. */
export const API_CALL_EVENT = 'milkyway_api_call'

/**
 * Builds the authorization and content headers for a gateway request.
 * @param {string} apiKey - NVIDIA NIM API token (`nvapi-…`).
 * @returns {Record<string, string>} Header map.
 */
const headers = (apiKey) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`,
})

/**
 * Increments the local request counter and notifies listeners.
 * Storage failures are non-fatal — the counter is cosmetic, not load-bearing.
 */
const trackApiCall = () => {
  try {
    const current = parseInt(localStorage.getItem(API_CALL_COUNTER_KEY) || '0', 10) || 0
    localStorage.setItem(API_CALL_COUNTER_KEY, String(current + 1))
  } catch {
    // Private browsing or a full quota — skip the counter, keep the request.
  }
  window.dispatchEvent(new Event(API_CALL_EVENT))
}

/**
 * Turns a failed gateway response into an Error carrying the most specific
 * message the gateway gave us.
 * @param {Response} res - Failed fetch response.
 * @param {string} prefix - Human-readable context, e.g. "Chat request failed".
 * @returns {Promise<Error>} Error with `status` attached for caller branching.
 */
const responseError = async (res, prefix) => {
  let detail
  try {
    const body = await res.json()
    detail = body.detail || body.message || body.error?.message || JSON.stringify(body)
  } catch {
    detail = `${res.status} ${res.statusText}`.trim()
  }
  const err = new Error(`${prefix} (${detail})`)
  err.status = res.status
  return err
}

/**
 * True when an error came from an aborted request rather than a real failure.
 * Callers use this to stay silent when the user cancelled on purpose.
 * @param {unknown} err - Caught error.
 * @returns {boolean}
 */
export const isAbortError = (err) =>
  err?.name === 'AbortError' || err?.name === 'TimeoutError'

/**
 * POSTs to the gateway and returns the raw response, throwing on failure.
 * @param {string} path - Path below the gateway root, e.g. `/chat/completions`.
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {Object} body - JSON request payload.
 * @param {string} errorPrefix - Context for a thrown error.
 * @param {AbortSignal} [signal] - Cancels the in-flight request.
 * @returns {Promise<Response>}
 */
async function post(path, apiKey, body, errorPrefix, signal) {
  trackApiCall()
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw await responseError(res, errorPrefix)
  return res
}

/**
 * Reads a Server-Sent Event stream and yields each decoded JSON payload.
 *
 * Chunk boundaries do not align with line boundaries, so a partial trailing
 * line is held back in `buffer` and prepended to the next chunk. Whatever
 * remains when the stream closes is parsed as a final line.
 *
 * @param {Response} res - Streaming response from the gateway.
 * @param {AbortSignal} [signal] - Checked between chunks for prompt cancellation.
 * @yields {Object} One parsed SSE payload per event.
 */
async function* streamSSE(res, signal) {
  if (!res.body) throw new Error('Streaming is not supported by this connection')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  /** Parses one `data: …` line, ignoring keep-alives and malformed frames. */
  const parseLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return null
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') return payload === '[DONE]' ? 'DONE' : null
    try {
      return JSON.parse(payload)
    } catch {
      // A frame split mid-JSON, or a gateway comment. Skip it.
      return null
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        const last = parseLine(buffer)
        if (last && last !== 'DONE') yield last
        return
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const parsed = parseLine(line)
        if (parsed === 'DONE') return
        if (parsed) yield parsed
      }

      if (signal?.aborted) return
    }
  } finally {
    // Release the connection whether we finished, returned early, or threw.
    reader.cancel().catch(() => {})
  }
}

/**
 * Extracts the visible text delta from an SSE chunk.
 * @param {Object} chunk - Parsed SSE payload.
 * @returns {string} Text content, or an empty string.
 */
const textDelta = (chunk) => chunk.choices?.[0]?.delta?.content || ''

/**
 * Extracts the chain-of-thought delta from an SSE chunk.
 *
 * Newer NIM reasoning models (Nemotron, DeepSeek-R1 and friends) return their
 * thinking in a dedicated `reasoning_content` field rather than wrapping it in
 * `<think>` tags inside `content`. Both spellings appear in the wild.
 *
 * @param {Object} chunk - Parsed SSE payload.
 * @returns {string} Reasoning content, or an empty string.
 */
const reasoningDelta = (chunk) => {
  const delta = chunk.choices?.[0]?.delta
  return delta?.reasoning_content || delta?.reasoning || ''
}

/**
 * Lists every model the supplied key can reach on the gateway.
 * Backs the constellation map and every model dropdown.
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {AbortSignal} [signal] - Cancels the in-flight request.
 * @returns {Promise<Array<{id: string}>>} Model records.
 */
export async function fetchModels(apiKey, signal) {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers(apiKey), signal })
  if (!res.ok) throw await responseError(res, 'Could not load the model list')
  const data = await res.json()
  return data.data ?? []
}

/**
 * Streams a chat completion token by token.
 *
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {Object} params
 * @param {string} params.model - Model id, e.g. `meta/llama-3.1-8b-instruct`.
 * @param {Array<{role: string, content: string}>} params.messages - Conversation history.
 * @param {number} [params.temperature=0.7] - Sampling temperature.
 * @param {number} [params.max_tokens=1024] - Response length ceiling.
 * @param {AbortSignal} [params.signal] - Stops generation.
 * @yields {string} Text tokens in arrival order.
 */
export async function* streamChat(apiKey, {
  model,
  messages,
  temperature = 0.7,
  max_tokens = 1024,
  signal,
}) {
  const res = await post(
    '/chat/completions',
    apiKey,
    { model, messages, temperature, max_tokens, stream: true },
    'Chat request failed',
    signal,
  )

  for await (const chunk of streamSSE(res, signal)) {
    const text = textDelta(chunk)
    if (text) yield text
  }
}

/**
 * Streams a reasoning completion, separating chain-of-thought from the answer.
 *
 * Handles both conventions: models that emit `reasoning_content` as a distinct
 * delta field, and models that inline `<think>…</think>` blocks in `content`.
 * A single delta can straddle the closing tag, so it is split and both halves
 * are routed to their respective channels.
 *
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {Object} params
 * @param {string} params.model - Reasoning model id, e.g. `deepseek-ai/deepseek-r1`.
 * @param {Array<{role: string, content: string}>} params.messages - Conversation history.
 * @param {number} [params.max_tokens=2048] - Response length ceiling.
 * @param {AbortSignal} [params.signal] - Stops generation.
 * @yields {{type: 'thinking'|'answer', content: string}} Tagged fragments.
 */
export async function* streamReasoning(apiKey, {
  model,
  messages,
  max_tokens = 2048,
  signal,
}) {
  const res = await post(
    '/chat/completions',
    apiKey,
    { model, messages, max_tokens, stream: true },
    'Reasoning request failed',
    signal,
  )

  let inThinkTag = false

  for await (const chunk of streamSSE(res, signal)) {
    // Preferred path: the model reports its reasoning on a separate field.
    const reasoning = reasoningDelta(chunk)
    if (reasoning) yield { type: 'thinking', content: reasoning }

    const text = textDelta(chunk)
    if (!text) continue

    // Fallback path: reasoning is inlined as <think>…</think> within content.
    if (text.includes('<think>')) {
      inThinkTag = true
      const after = text.slice(text.indexOf('<think>') + '<think>'.length)
      if (after) yield { type: 'thinking', content: after }
      continue
    }

    if (text.includes('</think>')) {
      inThinkTag = false
      const [thought, answer] = text.split('</think>')
      if (thought) yield { type: 'thinking', content: thought }
      if (answer) yield { type: 'answer', content: answer }
      continue
    }

    yield { type: inThinkTag ? 'thinking' : 'answer', content: text }
  }
}

/**
 * Converts text into embedding vectors.
 *
 * `input_type` matters for retrieval quality: index your corpus as `passage`
 * and the search string as `query`, so the two are embedded into a comparable
 * space.
 *
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {Object} params
 * @param {string} params.model - Embedding model id.
 * @param {string|string[]} params.input - Text to vectorize.
 * @param {'query'|'passage'} [params.inputType='query'] - Retrieval role.
 * @param {AbortSignal} [params.signal] - Cancels the in-flight request.
 * @returns {Promise<number[][]>} One vector per input, in input order.
 */
export async function embedText(apiKey, { model, input, inputType = 'query', signal }) {
  const res = await post(
    '/embeddings',
    apiKey,
    { model, input, input_type: inputType, truncate: 'END' },
    'Embedding request failed',
    signal,
  )
  const data = await res.json()
  return (data.data ?? []).map((d) => d.embedding)
}

/**
 * Streams a vision-language completion over an image plus a text prompt.
 *
 * @param {string} apiKey - NVIDIA NIM API token.
 * @param {Object} params
 * @param {string} params.model - Vision model id.
 * @param {string} params.imageBase64 - Base64 image payload, without the data-URL prefix.
 * @param {string} params.mimeType - Image MIME type, e.g. `image/png`.
 * @param {string} params.userMessage - Question to ask about the image.
 * @param {number} [params.max_tokens=1024] - Response length ceiling.
 * @param {AbortSignal} [params.signal] - Stops generation.
 * @yields {string} Text tokens in arrival order.
 */
export async function* streamVisionChat(apiKey, {
  model,
  imageBase64,
  mimeType,
  userMessage,
  max_tokens = 1024,
  signal,
}) {
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: userMessage },
      { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
    ],
  }]

  const res = await post(
    '/chat/completions',
    apiKey,
    { model, messages, max_tokens, stream: true },
    'Vision request failed',
    signal,
  )

  for await (const chunk of streamSSE(res, signal)) {
    const text = textDelta(chunk)
    if (text) yield text
  }
}
