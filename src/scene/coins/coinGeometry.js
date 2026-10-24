/**
 * Procedural coin geometry — pure JS (no Three.js) so the site and the offline
 * look-dev renders use exactly the same mesh.
 *
 * Unit coin: radius 1, faces pointing ±Z (front = +Z), thickness ≈ 0.13.
 * Profile (r, z) is revolved around Z:
 *   flat field (the $ relief comes from a bump texture) → inner slope →
 *   raised flat rim → rounded outer corner → reeded edge wall → mirrored back.
 * UVs are planar (x, y) over the whole coin, mirrored on the back so the $
 * reads correctly from both sides. Outside the field the texture is flat, so
 * the uv mirror at the edge never shows.
 */
export const COIN_SHAPE = {
  thickness: 0.13,
  field: 0.82, // radius of the flat field that carries the $ relief
  rimIn: 0.86, // inner edge of the raised rim
  rimOut: 0.95, // outer edge of the rim top
  fieldDepth: 0.016, // field sits this much below the rim top
  corner: 0.035, // rounding of the outer corner
  reeds: 110, // ridges around the edge
  reedDepth: 0.012,
  segments: 440, // around the circumference (≥ 4 × reeds)
}

export function buildCoinGeometry(shape = COIN_SHAPE) {
  const S = shape
  const h = S.thickness / 2
  const zf = h - S.fieldDepth
  // half profile from the centre of the front face outward, then down the edge
  const prof = [
    { r: 0, z: zf, kind: 'face' },
    { r: S.field * 0.5, z: zf, kind: 'face' },
    { r: S.field, z: zf, kind: 'face' },
    { r: (S.field + S.rimIn) / 2, z: zf + S.fieldDepth * 0.55, kind: 'rim' },
    { r: S.rimIn, z: h, kind: 'rim' },
    { r: S.rimOut, z: h, kind: 'rim' },
  ]
  // rounded outer corner
  const cs = 5
  for (let i = 1; i <= cs; i++) {
    const t = (i / cs) * (Math.PI / 2)
    prof.push({ r: S.rimOut + (1 - S.rimOut) * Math.sin(t), z: h - S.corner * (1 - Math.cos(t)), kind: i === cs ? 'edge' : 'rim' })
  }
  // edge wall (reeded)
  const wallTop = h - S.corner
  const wallSteps = 6
  for (let i = 1; i <= wallSteps; i++) prof.push({ r: 1, z: wallTop - (2 * wallTop * i) / wallSteps, kind: 'edge' })
  // mirror: back corner, back rim, back field
  const back = prof
    .slice(0, prof.length - wallSteps - 1)
    .reverse()
    .map((p) => ({ r: p.r, z: -p.z, kind: p.kind, back: true }))
  const all = prof.map((p) => ({ ...p, back: false })).concat(back)

  const N = S.segments
  const pos = []
  const uv = []
  const part = [] // 0 face, 1 rim, 2 edge
  for (const p of all) {
    for (let k = 0; k <= N; k++) {
      const th = (k / N) * Math.PI * 2
      let r = p.r
      if (p.kind === 'edge' && p.r >= 0.999) {
        const w = 0.5 + 0.5 * Math.cos(th * S.reeds)
        r = 1 - S.reedDepth * (1 - Math.pow(w, 0.6))
      }
      const x = Math.cos(th) * r
      const y = Math.sin(th) * r
      pos.push(x, y, p.z)
      uv.push(p.back ? 0.5 - x * 0.5 : 0.5 + x * 0.5, 0.5 + y * 0.5)
      part.push(p.kind === 'face' ? 0 : p.kind === 'rim' ? 1 : 2)
    }
  }
  const rows = all.length
  const idx = []
  for (let j = 0; j < rows - 1; j++) {
    for (let k = 0; k < N; k++) {
      const a = j * (N + 1) + k
      const b = a + 1
      const c = a + N + 1
      const d = c + 1
      // outward-facing winding for the front half; the mirrored half flips naturally
      idx.push(a, c, b, b, c, d)
    }
  }
  const position = new Float32Array(pos)
  const index = new Uint32Array(idx)
  const normal = smoothNormals(position, index)
  // centre rows (r = 0) collapse to a point: give them the exact face normal
  for (let k = 0; k <= N; k++) {
    normal.set([0, 0, 1], k * 3)
    normal.set([0, 0, -1], ((rows - 1) * (N + 1) + k) * 3)
  }
  return { position, normal, uv: new Float32Array(uv), part: new Float32Array(part), index }
}

function smoothNormals(P, I) {
  const N = new Float32Array(P.length)
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3
    const b = I[t + 1] * 3
    const c = I[t + 2] * 3
    const ux = P[b] - P[a]
    const uy = P[b + 1] - P[a + 1]
    const uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a]
    const vy = P[c + 1] - P[a + 1]
    const vz = P[c + 2] - P[a + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (const k of [a, b, c]) {
      N[k] += nx
      N[k + 1] += ny
      N[k + 2] += nz
    }
  }
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1
    N[i] /= l
    N[i + 1] /= l
    N[i + 2] /= l
  }
  return N
}
