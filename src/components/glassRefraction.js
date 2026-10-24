/**
 * Edge refraction for the liquid-glass navbar (matches Figma's "Glass"
 * effect: clear centre, light bending in a band just inside the edge).
 *
 * Builds a displacement map for a pill of the element's exact size: neutral
 * (no shift) in the middle, pushing pixels along the edge normal within
 * `band` px of the border. It's fed to an SVG <feDisplacementMap>, which the
 * element uses through `backdrop-filter: url(#…)`.
 *
 * Only Chromium renders SVG filters inside backdrop-filter. Elsewhere this
 * returns false and the CSS fallback (soft inner edge light) is used.
 */
export function supportsBackdropSvgFilter() {
  if (typeof navigator === 'undefined') return false
  const brands = navigator.userAgentData?.brands?.map((b) => b.brand) || []
  return brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b))
}

export function paintDisplacementMap(width, height, { band = 14, curve = 2.2 } = {}) {
  const dpr = 1 // the map is smooth; 1× is plenty and cheap
  const W = Math.max(2, Math.round(width * dpr))
  const H = Math.max(2, Math.round(height * dpr))
  const r = H / 2 // pill: fully rounded ends
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(W, H)
  const d = img.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5
      const py = y + 0.5
      // nearest point on the pill's centre line → distance & normal to the edge
      const cx = Math.min(Math.max(px, r), W - r)
      const cy = H / 2
      let nx = px - cx
      let ny = py - cy
      const len = Math.hypot(nx, ny) || 1
      const dist = r - len // distance inside the edge
      nx /= len
      ny /= len
      let m = 0
      if (dist >= 0 && dist < band) m = Math.pow(1 - dist / band, curve)
      const i = (y * W + x) * 4
      // pull the backdrop inward at the rim (lens-like magnification)
      d[i] = 128 - nx * m * 127
      d[i + 1] = 128 - ny * m * 127
      d[i + 2] = 128
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL()
}
