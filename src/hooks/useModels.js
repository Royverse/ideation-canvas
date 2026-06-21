import { useState, useEffect } from 'react'
import { fetchModels } from '../api/nvidia'

function categoriseModel(modelId) {
  const id = modelId.toLowerCase()
  // 1. Embedding Models (must not match 'nemo' generally to avoid 'nemotron' chat models)
  if (id.includes('embed') || id.includes('retrieval') || id.includes('nomic-embed')) return 'embedding'
  
  // 2. Reasoning / Thinking Models
  if (id.includes('thinking') || id.includes('deepseek-r') || id.includes('o1') || id.includes('o3') || id.includes('qwq') || id.includes('reasoning') || id.includes('math')) return 'reasoning'
  
  // 3. Vision Models
  if (id.includes('vision') || id.includes('vl') || id.includes('neva') || id.includes('paligemma') || id.includes('phi-3-v') || id.includes('phi-4-multimodal') || id.includes('pixtral') || id.includes('llava') || id.includes('internvl') || id.includes('fuyu')) return 'vision'
  
  // 4. Code Generation Models
  if (id.includes('coder') || id.includes('codestral') || id.includes('starcoder') || id.includes('codellama') || id.includes('code-') || id.includes('code_')) return 'code'
  
  // 5. Chat / General Instruct Models (including Nemotron, Llama, Mistral, Mixtral, Gemma, Phi, Qwen, Yi, Jamba, Solar, Arctic, Falcon, Command, Granite, DBRX, Baichuan, Moonshot, Kimi, Writer, Upstage, 01-ai, Deepseek)
  if (
    id.includes('instruct') || 
    id.includes('chat') || 
    id.includes('llama') || 
    id.includes('mistral') || 
    id.includes('mixtral') || 
    id.includes('gemma') || 
    id.includes('qwen') || 
    id.includes('nemotron') || 
    id.includes('phi') || 
    id.includes('yi') || 
    id.includes('jamba') || 
    id.includes('solar') || 
    id.includes('arctic') || 
    id.includes('falcon') || 
    id.includes('command') || 
    id.includes('granite') || 
    id.includes('dbrx') || 
    id.includes('baichuan') ||
    id.includes('moonshot') ||
    id.includes('kimi') ||
    id.includes('writer') ||
    id.includes('upstage') ||
    id.includes('01-ai') ||
    id.includes('deepseek')
  ) {
    return 'chat'
  }
  
  return 'other'
}

export function useModels(apiKey, isReady) {
  const [models, setModels] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isReady || !apiKey) return

    const loadModels = async () => {
      const keyHash = apiKey.substring(0, 10)
      const cacheKey = `nim_models_cache_${keyHash}`
      
      // Try cache first
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        setModels(JSON.parse(cached))
      }

      setIsLoading(true)
      try {
        const rawModels = await fetchModels(apiKey)
        const processed = rawModels.map(m => {
          const cat = categoriseModel(m.id)
          const id = m.id.toLowerCase()
          
          let ctx = '8K'
          if (id.includes('128k') || id.includes('llama-3.1') || id.includes('llama-3.2') || id.includes('llama-3.3') || id.includes('deepseek-v3') || id.includes('deepseek-r1') || id.includes('phi-4')) ctx = '128K'
          else if (id.includes('64k')) ctx = '64K'
          else if (id.includes('32k') || id.includes('mistral') || id.includes('mixtral') || id.includes('codestral')) ctx = '32K'
          else if (id.includes('16k') || id.includes('gemma-2')) ctx = '16K'
          else if (id.includes('8k') || id.includes('gemma')) ctx = '8K'
          else if (id.includes('4k')) ctx = '4K'

          return {
            ...m,
            providerName: m.id.split('/')[0].toUpperCase(),
            category: cat,
            contextWindow: ctx
          }
        })
        setModels(processed)
        localStorage.setItem(cacheKey, JSON.stringify(processed))
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }

    loadModels()
  }, [apiKey, isReady])

  return { models, isLoading, error }
}

