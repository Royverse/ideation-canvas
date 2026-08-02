/**
 * @file useModelPicker.js
 * @description Resolves which model a workspace should be talking to.
 */

import { useCallback, useMemo, useState } from 'react'

/**
 * Picks the active model for a workspace, derived rather than stored.
 *
 * Three inputs compete: a choice made in this workspace, a model carried in
 * from the constellation map, and a sensible default. Deriving the winner on
 * every render (instead of syncing it into state from an effect) keeps the
 * dropdown correct the moment the registry loads, with no intermediate frame
 * showing the wrong model.
 *
 * @param {Array<{id: string}>} available - Models this workspace can use.
 * @param {Object} options
 * @param {string|null} options.selectedModelId - Model handed over from another view.
 * @param {(id: string) => void} options.setSelectedModelId - Publishes the choice app-wide.
 * @param {string[]} [options.prefer] - Substrings marking preferred defaults, best first.
 * @returns {{modelId: string, selectModel: (id: string) => void}} Active id and setter.
 */
export function useModelPicker(available, { selectedModelId, setSelectedModelId, prefer = [] }) {
  const [localId, setLocalId] = useState(null)

  const modelId = useMemo(() => {
    if (available.length === 0) return ''

    const has = (id) => Boolean(id) && available.some((m) => m.id === id)

    // An explicit choice in this workspace outranks everything else.
    if (has(localId)) return localId

    // Then a model the user clicked on the constellation map.
    if (has(selectedModelId)) return selectedModelId

    // Otherwise fall back to the best available default.
    for (const hint of prefer) {
      const match = available.find((m) => m.id.toLowerCase().includes(hint.toLowerCase()))
      if (match) return match.id
    }

    return available[0].id
  }, [available, localId, selectedModelId, prefer])

  const selectModel = useCallback((id) => {
    setLocalId(id)
    setSelectedModelId?.(id)
  }, [setSelectedModelId])

  return { modelId, selectModel }
}
