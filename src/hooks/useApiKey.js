/**
 * @file useApiKey.js
 * @description Resolves the NVIDIA NIM API key from the build environment or
 * from browser storage, and exposes save/clear controls.
 */

import { useCallback, useState } from 'react'

const STORAGE_KEY = 'nim_api_key'

/**
 * Reads the key once, synchronously, so the app never flashes the key modal to
 * someone who already has a key. Environment wins over stored keys: a key baked
 * in at build time is a deliberate deployment choice.
 *
 * @returns {{key: string, fromEnv: boolean}} Resolved key state.
 */
function readInitialKey() {
  const envKey = import.meta.env.VITE_NVIDIA_API_KEY
  if (envKey) return { key: envKey, fromEnv: true }

  try {
    return { key: localStorage.getItem(STORAGE_KEY) || '', fromEnv: false }
  } catch {
    // Storage blocked (private mode, embedded frame) — fall back to the modal.
    return { key: '', fromEnv: false }
  }
}

/**
 * Manages the active API key for the session.
 *
 * @returns {{
 *   apiKey: string,
 *   isReady: boolean,
 *   isFromEnv: boolean,
 *   saveKey: (key: string) => void,
 *   clearKey: () => void
 * }} Key state and controls. `isReady` gates the rest of the app.
 */
export function useApiKey() {
  const [{ key, fromEnv }, setKeyState] = useState(readInitialKey)

  const saveKey = useCallback((newKey) => {
    try {
      localStorage.setItem(STORAGE_KEY, newKey)
    } catch {
      // Key still works for this session, it just will not survive a reload.
    }
    setKeyState({ key: newKey, fromEnv: false })
  }, [])

  const clearKey = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing stored to remove.
    }
    setKeyState({ key: '', fromEnv: false })
  }, [])

  return {
    apiKey: key,
    isReady: Boolean(key),
    isFromEnv: fromEnv,
    saveKey,
    clearKey,
  }
}
