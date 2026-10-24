/**
 * Coin surface textures, generated in the browser (no image files):
 *   data  — R: relief height ($ sign, used as a bump map)
 *           G: roughness (polished raised $ and rim, satin field, patina)
 *           B: metalness
 *   color — warm satin silver with soft patina, slightly darker in the recesses
 * Both are planar over the whole coin (uv 0..1 = the coin's diameter).
 */
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function valueNoise(size, cells, seed) {
  const r = rng(seed)
  const g = new Float32Array((cells + 1) * (cells + 1)).map(r)
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells
      const fy = (y / size) * cells
      const ix = Math.floor(fx)
      const iy = Math.floor(fy)
      let tx = fx - ix
      let ty = fy - iy
      tx = tx * tx * (3 - 2 * tx)
      ty = ty * ty * (3 - 2 * ty)
      const a = g[iy * (cells + 1) + ix]
      const b = g[iy * (cells + 1) + ix + 1]
      const c = g[(iy + 1) * (cells + 1) + ix]
      const d = g[(iy + 1) * (cells + 1) + ix + 1]
      out[y * size + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
    }
  }
  return out
}

function boxBlur(src, size, radius, passes = 3) {
  let a = src
  let b = new Float32Array(src.length)
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      let acc = 0
      for (let x = -radius; x <= radius; x++) acc += a[y * size + Math.min(size - 1, Math.max(0, x))]
      for (let x = 0; x < size; x++) {
        b[y * size + x] = acc / (2 * radius + 1)
        const xo = Math.max(0, x - radius)
        const xi = Math.min(size - 1, x + radius + 1)
        acc += a[y * size + xi] - a[y * size + xo]
      }
    }
    for (let x = 0; x < size; x++) {
      let acc = 0
      for (let y = -radius; y <= radius; y++) acc += b[Math.min(size - 1, Math.max(0, y)) * size + x]
      for (let y = 0; y < size; y++) {
        a[y * size + x] = acc / (2 * radius + 1)
        const yo = Math.max(0, y - radius)
        const yi = Math.min(size - 1, y + radius + 1)
        acc += b[yi * size + x] - b[yo * size + x]
      }
    }
  }
  return a
}

/** @returns {{ data: HTMLCanvasElement, color: HTMLCanvasElement }} */
export function paintCoinTextures({ size = 512, seed = 3, field = 0.82, glyph = '$' } = {}) {
  // ---- $ mask (vector text, centred in the field)
  const mc = document.createElement('canvas')
  mc.width = mc.height = size
  const m = mc.getContext('2d')
  m.fillStyle = '#000'
  m.fillRect(0, 0, size, size)
  m.fillStyle = '#fff'
  m.textAlign = 'center'
  m.textBaseline = 'middle'
  const fs = Math.round(size * field * 0.78)
  m.font = `700 ${fs}px Georgia, "Times New Roman", "DejaVu Serif", serif`
  m.fillText(glyph, size / 2, size / 2 + fs * 0.04)
  const mask = new Float32Array(size * size)
  const md = m.getImageData(0, 0, size, size).data
  for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4] / 255

  // rounded relief: blurred mask, shaped so the top is flat-ish with soft shoulders
  const soft = boxBlur(Float32Array.from(mask), size, Math.max(1, Math.round(size / 170)), 3)
  const relief = soft.map((v) => smooth(0.05, 0.85, v))

  const n1 = valueNoise(size, 3, seed)
  const n2 = valueNoise(size, 23, seed + 1)
  const n3 = valueNoise(size, 90, seed + 2)

  const dc = document.createElement('canvas')
  dc.width = dc.height = size
  const cc = document.createElement('canvas')
  cc.width = cc.height = size
  const dctx = dc.getContext('2d')
  const cctx = cc.getContext('2d')
  const di = dctx.createImageData(size, size)
  const ci = cctx.createImageData(size, size)
  const fr = field / 1 // field radius in coin units (uv 0..1 spans radius 1 → 0.5)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const u = (x + 0.5) / size - 0.5
      const v = (y + 0.5) / size - 0.5
      const r = Math.hypot(u, v) * 2 // 0 centre → 1 coin edge
      const inField = 1 - smooth(fr - 0.02, fr, r)
      const h = relief[i] * inField
      // tiny micro-relief so the field isn't mirror-flat (satin)
      // field stays perfectly flat in the height map (8-bit steps would show as contour lines);
      // the satin unevenness comes from the roughness/colour channels instead
      const height = Math.min(1, Math.max(0, h))

      const patina = smooth(0.25, 0.85, n1[i] * 0.8 + n2[i] * 0.2)
      // roughness: polished raised $ and rim, satin field, patchy patina
      let rough = 0.36 + 0.16 * patina + 0.06 * (n3[i] - 0.5)
      rough = rough * (1 - 0.45 * relief[i]) // raised $ rubbed smooth
      if (r > fr) rough = 0.26 + 0.05 * n2[i] // rim
      const o = i * 4
      di.data[o] = height * 255
      di.data[o + 1] = Math.min(1, Math.max(0.05, rough)) * 255
      di.data[o + 2] = 255
      di.data[o + 3] = 255

      // colour: warm satin silver; patina slightly darker / warmer; recess around the $ darker
      const around = soft[i] * (1 - relief[i]) // shoulders/recess next to the relief
      const dark = 0.045 * patina + 0.14 * around * inField
      const base = [0.9, 0.86, 0.79] // warm champagne silver, like the reference
      const warm = [0.06, 0.035, 0.0]
      for (let c = 0; c < 3; c++) {
        let val = base[c] * (1 - dark) + warm[c] * patina
        if (r > fr) val = base[c] * 1.03
        ci.data[o + c] = Math.min(255, Math.max(0, val * 255))
      }
      ci.data[o + 3] = 255
    }
  }
  dctx.putImageData(di, 0, 0)
  cctx.putImageData(ci, 0, 0)
  return { data: dc, color: cc }
}
