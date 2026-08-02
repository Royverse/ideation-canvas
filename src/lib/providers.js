/**
 * @file providers.js
 * @description Maps a model id to the organisation that published it.
 */

import { PALETTE } from '../theme'

/**
 * Match rules, most specific first. A model id is checked against each rule's
 * needles in order, so `codestral` reaches Mistral before the generic `code`
 * conventions elsewhere can claim it.
 */
const PROVIDERS = [
  { name: 'NVIDIA', color: PALETTE.mint, match: ['nvidia', 'nemotron'] },
  { name: 'META', color: PALETTE.blue, match: ['meta', 'llama'] },
  { name: 'MISTRAL', color: PALETTE.pending, match: ['mistral', 'codestral'] },
  { name: 'MSFT', color: PALETTE.blue, match: ['microsoft', 'phi'] },
  { name: 'GOOGLE', color: PALETTE.nebulaCore, match: ['google', 'gemma'] },
  { name: 'QWEN', color: PALETTE.violet, match: ['qwen'] },
  { name: 'DEEPSEEK', color: PALETTE.nebulaGlow, match: ['deepseek'] },
  { name: 'IBM', color: PALETTE.blue, match: ['ibm', 'granite'] },
]

const FALLBACK = { name: 'MODEL', color: PALETTE.textSecondary }

/**
 * Identifies the publisher behind a model id.
 * @param {string} modelId - Fully-qualified model id.
 * @returns {{name: string, color: string}} Badge label and colour.
 */
export function getProvider(modelId) {
  if (!modelId) return FALLBACK
  const id = modelId.toLowerCase()
  return PROVIDERS.find((p) => p.match.some((needle) => id.includes(needle))) ?? FALLBACK
}
