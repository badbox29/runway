/**
 * Pattern fills and colour adaptation.
 *
 * Bucket and connection colours are stored once and rendered in whichever mode
 * is active. Rather than keeping a second dark palette in the data, stored hues
 * are lifted toward the light at render time: a mid-saturation magenta that
 * reads correctly on off-white is too heavy on near-black, and the fix is a
 * predictable lightening, not a different colour.
 */
import { isDark } from '../core/theme.js';

/* ------------------------------------------------------------ colour math */

function parse(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;

/** Blend toward white (t > 0) or black (t < 0). */
export function lift(hex, t) {
  const c = parse(hex);
  const target = t >= 0 ? 255 : 0;
  const k = Math.abs(t);
  return toHex({
    r: c.r + (target - c.r) * k,
    g: c.g + (target - c.g) * k,
    b: c.b + (target - c.b) * k,
  });
}

/**
 * A stored colour, rendered for the current mode. Identity in, legibility out.
 */
export function adapt(hex) {
  if (!hex || hex[0] !== '#') return hex;
  return isDark() ? lift(hex, 0.26) : hex;
}

/** Light tint of a colour for selected states — toward the paper, either way. */
export function tint(hex, amount = 0.82) {
  return isDark() ? lift(hex, -(amount - 0.1)) : lift(hex, amount);
}

/* ---------------------------------------------------------------- patterns */

/**
 * Texture overlay. Every bucket carries a colour AND a pattern, because colour
 * alone fails at a glance, fails in print, and fails for anyone with a colour
 * vision deficiency. The overlay is white in both modes but lighter-handed in
 * the dark, where the base hue has already been lifted.
 */
export function fillCSS(color, pattern, scale = 1) {
  const base = adapt(color);
  const s = (n) => `${(n * scale).toFixed(2)}px`;
  const st = isDark() ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.42)';
  switch (pattern) {
    case 'diagonal':
      return `background-color:${base};background-image:repeating-linear-gradient(45deg,${st} 0 ${s(1.6)},transparent ${s(1.6)} ${s(4.4)})`;
    case 'dots':
      return `background-color:${base};background-image:radial-gradient(${st} ${s(1.1)},transparent ${s(1.2)});background-size:${s(5)} ${s(5)}`;
    case 'crosshatch':
      return `background-color:${base};background-image:repeating-linear-gradient(0deg,${st} 0 ${s(1)},transparent ${s(1)} ${s(5)}),repeating-linear-gradient(90deg,${st} 0 ${s(1)},transparent ${s(1)} ${s(5)})`;
    case 'rules':
      return `background-color:${base};background-image:repeating-linear-gradient(0deg,${st} 0 ${s(1.4)},transparent ${s(1.4)} ${s(4.6)})`;
    case 'weave':
      return `background-color:${base};background-image:repeating-linear-gradient(45deg,${st} 0 ${s(1.2)},transparent ${s(1.2)} ${s(5)}),repeating-linear-gradient(-45deg,${st} 0 ${s(1.2)},transparent ${s(1.2)} ${s(5)})`;
    default:
      return `background-color:${base}`;
  }
}
