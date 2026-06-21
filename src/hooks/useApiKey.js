import { useState, useEffect } from 'react'

export function useApiKey() {
  const [apiKey, setApiKey] = useState('')
  const [isReady, setIsReady] = useState(false)
  const [isFromEnv, setIsFromEnv] = useState(false)

  useEffect(() => {
    // Try env first
    const envKey = import.meta.env.VITE_NVIDIA_API_KEY
    if (envKey) {
      setApiKey(envKey)
      setIsReady(true)
      setIsFromEnv(true)
      return
    }

    // Try localStorage
    const stored = localStorage.getItem('nim_api_key')
    if (stored) {
      setApiKey(stored)
      setIsReady(true)
      setIsFromEnv(false)
    }
  }, [])

  const saveKey = (key) => {
    localStorage.setItem('nim_api_key', key)
    setApiKey(key)
    setIsReady(true)
    setIsFromEnv(false)
  }

  const clearKey = () => {
    localStorage.removeItem('nim_api_key')
    setApiKey('')
    setIsReady(false)
    setIsFromEnv(false)
  }

  return { apiKey, isReady, saveKey, clearKey, isFromEnv }
}
