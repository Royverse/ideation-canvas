// Use local proxy in development and Netlify proxy in production to bypass CORS
const BASE_URL = '/api/nvidia'

const headers = (apiKey) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiKey}`
})

const trackApiCall = () => {
  const current = parseInt(localStorage.getItem('milkyway_api_calls') || '0', 10)
  localStorage.setItem('milkyway_api_calls', current + 1)
  window.dispatchEvent(new Event('milkyway_api_call'))
}

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

export async function fetchModels(apiKey) {
  const res = await fetch(`${BASE_URL}/models`, { headers: headers(apiKey) })
  if (!res.ok) throw new Error('Failed to fetch models')
  const data = await res.json()
  return data.data
}

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
          if (delta.includes('<think>')) {
            inThink = true
            yield { type: 'thinking', content: delta.replace('<think>', '') }
          } else if (delta.includes('</think>')) {
            inThink = false
            const parts = delta.split('</think>')
            if (parts[0]) yield { type: 'thinking', content: parts[0] }
            if (parts[1]) yield { type: 'answer', content: parts[1] }
          } else {
            yield { type: inThink ? 'thinking' : 'answer', content: delta }
          }
        }
      } catch {}
    }
  }
}

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
