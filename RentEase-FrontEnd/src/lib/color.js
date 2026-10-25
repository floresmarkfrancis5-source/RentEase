// Small color helpers so any admin-chosen color stays readable.

export function hexToRgb(hex) {
  let h = String(hex || '').replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function channel(v) {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(l1, l2) {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (a + 0.05) / (b + 0.05)
}

/** Dark or white text, whichever has more contrast on this background. */
export function readableOn(...hexes) {
  const rgbs = hexes.map(hexToRgb)
  const avg = rgbs[0].map((_, i) => rgbs.reduce((s, c) => s + c[i], 0) / rgbs.length)
  const l = luminance(avg)
  return contrast(l, 0) >= contrast(l, 1) ? '#0b1220' : '#ffffff'
}

export const rgbTriplet = (hex) => hexToRgb(hex).join(' ')
