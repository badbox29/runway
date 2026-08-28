/**
 * Pattern fills, generated as CSS background shorthand so a bucket's texture
 * can be applied to a header strip, a legend swatch, or a calendar bar with
 * the same call and only a scale difference.
 */
export function fillCSS(color, pattern, scale = 1) {
  const s = (n) => `${(n * scale).toFixed(2)}px`;
  const st = 'rgba(255,255,255,0.42)';
  switch (pattern) {
    case 'diagonal':
      return `background-color:${color};background-image:repeating-linear-gradient(45deg,${st} 0 ${s(1.6)},transparent ${s(1.6)} ${s(4.4)})`;
    case 'dots':
      return `background-color:${color};background-image:radial-gradient(${st} ${s(1.1)},transparent ${s(1.2)});background-size:${s(5)} ${s(5)}`;
    case 'crosshatch':
      return `background-color:${color};background-image:repeating-linear-gradient(0deg,${st} 0 ${s(1)},transparent ${s(1)} ${s(5)}),repeating-linear-gradient(90deg,${st} 0 ${s(1)},transparent ${s(1)} ${s(5)})`;
    case 'rules':
      return `background-color:${color};background-image:repeating-linear-gradient(0deg,${st} 0 ${s(1.4)},transparent ${s(1.4)} ${s(4.6)})`;
    case 'weave':
      return `background-color:${color};background-image:repeating-linear-gradient(45deg,${st} 0 ${s(1.2)},transparent ${s(1.2)} ${s(5)}),repeating-linear-gradient(-45deg,${st} 0 ${s(1.2)},transparent ${s(1.2)} ${s(5)})`;
    default:
      return `background-color:${color}`;
  }
}

/** Light tint of a hex, for selected states that must not shout. */
export function tint(hex, amount = 0.82) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const up = (c) => Math.round(c + (255 - c) * amount);
  return `rgb(${up(r)},${up(g)},${up(b)})`;
}
