/**
 * @file theme.js
 * @description Palette values for code that cannot read CSS custom properties.
 *
 * The canvas 2D context resolves neither `var(--x)` nor any other CSS-level
 * indirection — assigning `ctx.fillStyle = 'var(--nebula-glow)'` is silently
 * ignored and the previous colour stays in effect. Canvas drawing therefore
 * reads its colours from here.
 *
 * These values mirror the `:root` block in index.css. Change both together.
 */

/** Core palette, matching the CSS custom properties of the same names. */
export const PALETTE = {
  void: '#030309',
  panel: '#07071a',
  elevated: '#0c0c22',

  nebulaDeep: '#5b21b6',
  nebulaCore: '#7c3aed',
  nebulaGlow: '#a78bfa',
  nebulaPale: '#ddd6fe',

  blue: '#60a5fa',
  violet: '#8b5cf6',
  mint: '#34d399',
  pending: '#fbbf24',
  coral: '#f472b6',

  textPrimary: '#e9e6ff',
  textSecondary: '#7c7a9e',
  textDim: '#3d3b5c',
}

/** Bare `r, g, b` channels, for building translucent canvas fills. */
export const CHANNELS = {
  nebulaCore: '124, 58, 237',
  nebulaGlow: '167, 139, 250',
  mint: '52, 211, 153',
}

/**
 * Builds a translucent colour string for canvas use.
 * @param {string} channels - An entry from {@link CHANNELS}.
 * @param {number} alpha - Opacity from 0 to 1.
 * @returns {string} A canvas-safe `rgba(…)` string.
 */
export const alpha = (channels, alpha) => `rgba(${channels}, ${alpha})`

/**
 * Colour per model workspace, shared by the constellation map and the
 * per-workspace accents. Six distinguishable hues that hold up against the
 * near-black background and stay separable for colour-blind viewers.
 */
export const CATEGORY_COLORS = {
  chat: '#34d399',      // aurora teal
  code: '#f472b6',      // pulsar pink
  reasoning: '#a78bfa', // nebula glow
  vision: '#60a5fa',    // star blue
  embedding: '#fbbf24', // solar amber
  other: '#4b4a6a',     // dim slate
}

/**
 * Semantic-similarity scale for the embedding map, strongest first.
 * Ordered, so a lookup can walk it and take the first threshold that matches.
 */
export const SIMILARITY_SCALE = [
  { min: 0.70, color: PALETTE.mint, label: 'Strong match' },
  { min: 0.50, color: PALETTE.nebulaGlow, label: 'Related' },
  { min: 0.30, color: PALETTE.blue, label: 'Loosely related' },
  { min: -Infinity, color: '#4b4a6a', label: 'Unrelated' },
]

/**
 * Maps a cosine-similarity score to its scale colour.
 * @param {number} score - Cosine similarity, roughly -1 to 1.
 * @returns {string} Hex colour from {@link SIMILARITY_SCALE}.
 */
export const similarityColor = (score) =>
  SIMILARITY_SCALE.find((step) => score > step.min).color
