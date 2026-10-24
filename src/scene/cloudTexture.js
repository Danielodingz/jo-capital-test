/**
 * Procedural cloud painter (no external assets, no Three.js dependency).
 *
 * Builds a soft cumulus/stratus density field from overlapping gaussian puffs,
 * erodes the edges with fractal value noise, then lights it from above so the
 * tops read bright white and the undersides take a cool sky-tinted grey.
 * Generated once at start-up; the shape never changes afterwards (clouds only
 * translate).
 */

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeNoise(seed) {
  const rnd = mulberry32(seed * 9973 + 1)
  const N = 256
  const perm = new Uint8Array(N * 2)
  const vals = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    perm[i] = i
    vals[i] = rnd()
  }
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[perm[i], perm[j]] = [perm[j], perm[i]]
  }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i]
  const v = (x, y) => vals[perm[(perm[x & 255] + y) & 511]]
  const fade = (t) => t * t * (3 - 2 * t)
  const value = (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = fade(x - xi)
    const yf = fade(y - yi)
    const a = v(xi, yi)
    const b = v(xi + 1, yi)
    const c = v(xi, yi + 1)
    const d = v(xi + 1, yi + 1)
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
  }
  return (x, y, octaves = 5) => {
    let sum = 0
    let amp = 0.5
    let f = 1
    let norm = 0
    for (let o = 0; o < octaves; o++) {
      sum += amp * value(x * f, y * f)
      norm += amp
      amp *= 0.5
      f *= 2.03
    }
    return sum / norm
  }
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * @param {object} o
 * @param {number} o.seed
 * @param {'cumulus'|'stratus'} o.kind
 * @param {number} [o.width] texture width in px (height is width / aspect)
 * @returns {HTMLCanvasElement}
 */
export function paintCloud({ seed = 1, kind = 'cumulus', width = 512 } = {}) {
  const aspect = kind === 'stratus' ? 3.2 : 2.1
  const W = width
  const H = Math.round(width / aspect)
  const rnd = mulberry32(seed)
  const fbm = makeNoise(seed)

  // Puffs in a unit space where y ∈ [0, 1] (top → bottom), x ∈ [0, aspect].
  const puffs = []
  const base = kind === 'stratus' ? 0.66 : 0.74
  const count = kind === 'stratus' ? 9 : 8
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const x = aspect * (0.14 + 0.72 * t + (rnd() - 0.5) * 0.08)
    // domed silhouette: tallest in the middle
    const dome = Math.sin(Math.PI * t)
    const r =
      kind === 'stratus'
        ? 0.09 + 0.05 * dome + rnd() * 0.04
        : 0.09 + 0.1 * dome + rnd() * 0.05
    const y = base - r * (kind === 'stratus' ? 0.55 : 0.75) - dome * (kind === 'stratus' ? 0.02 : 0.08)
    puffs.push({ x, y, r })
  }
  // a few small top-side puffs for cauliflower detail
  if (kind === 'cumulus') {
    for (let i = 0; i < 4; i++) {
      const p = puffs[2 + Math.floor(rnd() * (count - 4))]
      puffs.push({ x: p.x + (rnd() - 0.5) * 0.3, y: p.y - p.r * 0.6, r: p.r * (0.45 + rnd() * 0.2) })
    }
  }

  const density = (x0, y0) => {
    // gentle domain warp → irregular, billowy outline instead of perfect circles
    const x = x0 + (fbm(x0 * 2.1 + 17, y0 * 2.1, 3) - 0.5) * 0.22
    const y = y0 + (fbm(x0 * 2.1, y0 * 2.1 + 31, 3) - 0.5) * 0.16
    let d = 0
    for (const p of puffs) {
      const dx = x - p.x
      const dy = (y - p.y) * (kind === 'stratus' ? 1.5 : 1.05)
      d += Math.exp(-(dx * dx + dy * dy) / (2 * p.r * p.r * 0.55))
    }
    // flatten the base like real fair-weather clouds
    d *= smooth(base + 0.07, base - 0.05, y)
    // erode edges with noise (static — computed once)
    const n = fbm(x * 4.5 + seed, y * 4.5, 5)
    // fade to nothing well before the texture border (no clipped edges)
    const edge =
      smooth(0, 0.16 * aspect, x0) * smooth(aspect, aspect * 0.84, x0) * smooth(0, 0.14, y0) * smooth(1, 0.9, y0)
    return (d * 0.85 + (n - 0.5) * 1.1 - 0.22) * edge
  }

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(W, H)
  const data = img.data
  const sx = aspect / W
  const sy = 1 / H

  // Sun from upper-left: sample density toward the light for self-shadowing.
  const lx = -0.035
  const ly = -0.07

  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const x = i * sx
      const y = j * sy
      const d = density(x, y)
      const alpha = 0.94 * smooth(0.0, 0.62, d)
      const k = (j * W + i) * 4
      if (alpha <= 0.002) {
        data[k + 3] = 0
        continue
      }
      const toward = density(x + lx, y + ly)
      const toward2 = density(x + lx * 2.2, y + ly * 2.2)
      const occl = smooth(0.0, 1.1, toward * 0.6 + toward2 * 0.4)
      const underside = smooth(base - 0.32, base + 0.02, y)
      let light = 1 - 0.36 * occl - 0.24 * underside
      // bright silver lining on thin, sunward edges
      light += 0.08 * (1 - smooth(0.05, 0.4, d)) * (1 - occl)
      // internal billows: soft noise shading inside the dense body
      light -= 0.3 * (fbm(x * 7 + 5, y * 7, 4) - 0.5) * smooth(0.15, 0.9, d)
      light = Math.min(1, Math.max(0.55, light))
      // lit = warm white, shade = cool blue-grey that blends into the sky
      const r = 186 + (255 - 186) * light
      const g = 202 + (253 - 202) * light
      const b = 222 + (250 - 222) * light
      data[k] = r
      data[k + 1] = g
      data[k + 2] = b
      data[k + 3] = alpha * 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}
