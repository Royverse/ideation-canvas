/**
 * @file nvidia.js
 * @description Core API module handling all communication with the NVIDIA NIM gateway.
 * Bridges local development proxies and Netlify production redirects to bypass CORS constraints.
 * Implements real-time token streaming using Server-Sent Events (SSE) and async generator protocols.
 */

const BASE_URL = '/api/nvidia'

/**
 * Generates standardized authorization and payload headers.
 * @param {string} apiKey - The user's NVIDIA NIM API token.
 * @returns {Object} HTTP headers map.
 */
const headers = (apiKey) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`
})

/**
 * Increments the local API consumption counter and dispatches a global window event.
 * Used by telemetry dashboards to live-track API request counters.
 */
const trackApiCall = () => {
  const current = parseInt(localStorage.getItem('milkyway_api_calls') || '0', 10)
  localStorage.setItem('milkyway_api_calls', current + 1)
  window.dispatchEvent(new Event('milkyway_api_call'))
}

/**
 * Standardizes API error responses and extracts nested gateway error messages.
 * @param {Response} res - The Fetch API Response object.
 * @param {string} prefix - Descriptive context prefix for the error.
 * @returns {Promise<Error>} Formatted Error object.
 */
const handleResponseError = async (res, prefix) => {
  let detail = 'Unknown API error'
  try {
    const errData = await res.json()
    detail = errData.message || errData.error?.message || JSON.stringify(errData)
  } catch {
    detail = `Status ${res.status}: ${res.statusText}`
  }
  return new Error(`${prefix} (${detail})`)
}

/**
 * Fetches all available models listed inside the integrated NIM registry.
 * Used to construct the galactic constellation map and category dropdown selectors.
 * @param {string} apiKey - User API Key credentials.
 * @returns {Promise<Array>} List of models and their metadata objects.
 */
export async function fetchModels(apiKey) {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers(apiKey) })
  if (!res.ok) throw new Error('Failed to fetch models')
  const data = await res.json()
  return data.data
}

/**
 * Streams chat completion tokens using Server-Sent Events (SSE).
 * Maintains an internal line buffer to parse partial packet transmissions.
 * 
 * @param {string} apiKey - User API credentials.
 * @param {Object} params - Stream parameters.
 * @param {string} params.model - Targeted model ID (e.g. meta/llama-3.1-8b-instruct).
 * @param {Array} params.messages - Conversational history array.
 * @param {number} params.temperature - Sampling temperature (creativity slider).
 * @param {number} params.max_tokens - Response size ceiling.
 * @yields {string} Individual text tokens as they stream from the server.
 */
export async function* streamChat(apiKey, { model, messages, temperature = 0.7, max_tokens = 1024 }) {
  trackApiCall()
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, temperature, max_tokens, stream: true })
  })

  if (!res.ok) throw await handleResponseError(res, 'Chat API error')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      // Process remaining content in buffer before exit
      if (buffer) {
        const line = buffer.trim()
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) yield delta
            } catch {}
          }
        }
      }
      break
    }
    
    // Stitch chunks together and split by lines
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // Hold incomplete line
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {}
    }
  }
}

/**
 * Streams reasoning chunks, separating the model's inner logical steps from its final answer.
 * Detects <think> and </think> delimiters in real-time to organize reasoning logs.
 * 
 * @param {string} apiKey - User API credentials.
 * @param {Object} params - Stream parameters.
 * @param {string} params.model - Target reasoning model ID (e.g. deepseek-ai/deepseek-r1).
 * @param {Array} params.messages - Conversational history array.
 * @param {number} params.max_tokens - Response size ceiling.
 * @yields {Object} Formatted step payload containing { type: 'thinking' | 'answer', content: string }.
 */
export async function* streamReasoning(apiKey, { model, messages, max_tokens = 2048 }) {
  trackApiCall()
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, max_tokens, stream: true })
  })

  if (!res.ok) throw await handleResponseError(res, 'Reasoning API error')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let inThink = false
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      if (buffer) {
        const line = buffer.trim()
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) {
                if (delta.includes('<think>')) {
                  inThink = true
                } else if (delta.includes('</think>')) {
                  inThink = false
                }
                yield { type: inThink ? 'thinking' : 'answer', content: delta }
              }
            } catch {}
          }
        }
      }
      break
    }
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) {
          // Detect opening think block
          if (delta.includes('<think>')) {
            inThink = true
            yield { type: 'thinking', content: delta.replace('<think>', '') }
          } 
          // Detect closing think block
          else if (delta.includes('</think>')) {
            inThink = false
            const parts = delta.split('</think>')
            if (parts[0]) yield { type: 'thinking', content: parts[0] }
            if (parts[1]) yield { type: 'answer', content: parts[1] }
          } 
          // Standard streaming delivery
          else {
            yield { type: inThink ? 'thinking' : 'answer', content: delta }
          }
        }
      } catch {}
    }
  }
}

/**
 * Computes high-dimensional vector representations for text queries and document corpuses.
 * @param {string} apiKey - User API credentials.
 * @param {Object} params - Embedding configuration.
 * @param {string} params.model - Target embedding model ID (e.g. nvidia/embeddings-nv-embed-v1).
 * @param {string|Array} params.input - Sentence strings to be vectorized.
 * @param {string} params.inputType - Input type classification: "query" or "passage".
 * @returns {Promise<Array>} Nested array of floating-point coordinate weights.
 */
export async function embedText(apiKey, { model, input, inputType = "query" }) {
  trackApiCall()
  const res = await fetch(`${BASE_URL}/embeddings`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({
      input: input,
      model: model,
      input_type: inputType,
      truncate: "END"
    })
  })
  if (!res.ok) throw new Error('Embedding API error')
  const data = await res.json()
  return data.data.map(d => d.embedding)
}

/**
 * Dispatches multimodal prompt requests containing base64 images and text prompts.
 * Uses SSE streaming to deliver vision-based text output in real time.
 * 
 * @param {string} apiKey - User API credentials.
 * @param {Object} params - Vision payload parameters.
 * @param {string} params.model - Target vision-language model ID.
 * @param {string} params.imageBase64 - Standard Base64 encoded image string.
 * @param {string} params.mimeType - Standard image MIME classification (image/png, image/jpeg, etc.).
 * @param {string} params.userMessage - Custom prompt message for the image.
 * @param {number} params.max_tokens - Response size ceiling.
 * @yields {string} Individual text tokens describing the visual analysis.
 */
export async function* streamVisionChat(apiKey, { model, imageBase64, mimeType, userMessage, max_tokens = 1024 }) {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: userMessage },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
      ]
    }
  ]
  trackApiCall()
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify({ model, messages, max_tokens, stream: true })
  })

  if (!res.ok) throw await handleResponseError(res, 'Vision API error')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      if (buffer) {
        const line = buffer.trim()
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta?.content
              if (delta) yield delta
            } catch {}
          }
        }
      }
      break
    }
    
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      const data = trimmed.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        const delta = parsed.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {}
    }
  }
}
