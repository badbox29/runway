/**
 * Bucket identities.
 *
 * Every bucket carries a colour AND a texture. Colour alone fails at a glance,
 * fails in print, and fails for anyone with a colour vision deficiency —
 * texture survives all three. Patterns are generated in util/patterns.js.
 */
export const PALETTE = [
  { color: '#C0326B', pattern: 'diagonal' },
  { color: '#1F7A8C', pattern: 'dots' },
  { color: '#4A3E9C', pattern: 'crosshatch' },
  { color: '#A8641F', pattern: 'rules' },
  { color: '#2E7148', pattern: 'weave' },
  { color: '#8A2E7A', pattern: 'rules' },
  { color: '#0F6E6E', pattern: 'diagonal' },
  { color: '#7A5C12', pattern: 'dots' },
];

export const PATTERNS = ['solid', 'diagonal', 'dots', 'crosshatch', 'rules', 'weave'];

/**
 * Card metrics. Geometry is computed, never measured from the DOM — that keeps
 * edge routing correct during a drag without forcing layout every frame.
 * These must match the corresponding custom properties in css/tokens.css.
 */
export const METRICS = {
  strip: 7,
  head: 27,
  row: 26,
  foot: 22,
  width: 222,
};
