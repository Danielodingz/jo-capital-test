/**
 * Procedural flowers for the grass look — pure JS (no Three.js), so the same
 * geometry and scattering drive the site and the offline look-dev renders.
 *
 * Every flower is built in a local frame where the stem base is the origin and
 * +Y points out of the badge surface:
 *   - stem vertices have aStem = 1 and a unit-length Y (scaled per instance by iStem)
 *   - head vertices have aStem = 0 and sit at y ≈ 0 (lifted by iStem per instance)
 *   - aTint = 1 marks petals that take the per-instance colour variation
 */

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

const hex = (h) => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((c) => Math.pow(c, 2.2)) // linear
}

class Builder {
  constructor() {
    this.p = []
    this.n = []
    this.c = []
    this.s = []
    this.t = []
    this.i = []
  }
  vert(p, n, c, stem, tint) {
    this.p.push(...p)
    this.n.push(...n)
    this.c.push(...c)
    this.s.push(stem)
    this.t.push(tint)
    return this.p.length / 3 - 1
  }
  /** grid surface from fn(u, v) → {p, c}; normals from finite differences */
  surface(fn, nu, nv, stem, tint) {
    const base = this.p.length / 3
    for (let j = 0; j <= nv; j++) {
      for (let k = 0; k <= nu; k++) {
        const u = k / nu
        const v = j / nv
        const a = fn(u, v)
        const du = fn(Math.min(1, u + 1e-3), v).p.map((x, q) => x - fn(Math.max(0, u - 1e-3), v).p[q])
        const dv = fn(u, Math.min(1, v + 1e-3)).p.map((x, q) => x - fn(u, Math.max(0, v - 1e-3)).p[q])
        let nx = du[1] * dv[2] - du[2] * dv[1]
        let ny = du[2] * dv[0] - du[0] * dv[2]
        let nz = du[0] * dv[1] - du[1] * dv[0]
        const l = Math.hypot(nx, ny, nz) || 1
        this.vert(a.p, [nx / l, ny / l, nz / l], a.c, stem, tint)
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let k = 0; k < nu; k++) {
        const a = base + j * (nu + 1) + k
        const b = a + 1
        const c = a + nu + 1
        const d = c + 1
        this.i.push(a, c, b, b, c, d)
      }
    }
  }
  stem(radius, color, segs = 5) {
    this.surface(
      (u, v) => {
        const ang = u * Math.PI * 2
        return { p: [Math.cos(ang) * radius, v, Math.sin(ang) * radius], c: color }
      },
      segs,
      1,
      1,
      0,
    )
  }
  sphere(center, r, color, stem, tint, seg = 5) {
    // analytic normals (finite differences break down at the poles)
    const base = this.p.length / 3
    const rows = Math.max(3, seg - 1)
    for (let j = 0; j <= rows; j++) {
      const ph = (j / rows) * Math.PI
      for (let k = 0; k <= seg; k++) {
        const th = (k / seg) * Math.PI * 2
        const n = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]
        this.vert([center[0] + n[0] * r, center[1] + n[1] * r, center[2] + n[2] * r], n, color, stem, tint)
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < seg; k++) {
        const a = base + j * (seg + 1) + k
        const b = a + 1
        const c = a + seg + 1
        const d = c + 1
        this.i.push(a, b, c, b, d, c)
      }
    }
  }
  build() {
    return {
      position: new Float32Array(this.p),
      normal: new Float32Array(this.n),
      color: new Float32Array(this.c),
      aStem: new Float32Array(this.s),
      aTint: new Float32Array(this.t),
      index: new Uint32Array(this.i),
    }
  }
}

/** Cup-shaped poppy / ranunculus-like head (unit size ≈ 1 across) on a thin stem. */
export function buildPoppy() {
  const B = new Builder()
  const stemCol = hex('#3f6d1e')
  B.stem(0.045, stemCol)
  const petals = 6
  const pink = [1, 1, 1] // tinted per instance (aTint = 1); vertex colour adds the light edge / dark base
  for (let k = 0; k < petals; k++) {
    const a0 = (k / petals) * Math.PI * 2 + (k % 2) * 0.2
    const ring = k % 2 // inner / outer ring
    const R = ring ? 0.42 : 0.5
    const lift = ring ? 0.05 : 0
    B.surface(
      (u, v) => {
        // u: base → tip, v: across the petal
        const w = Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.05)), 0.6) * 0.34 * (ring ? 0.9 : 1)
        const across = (v - 0.5) * 2 * w
        const r = R * u
        const y = lift + 0.42 * Math.pow(u, 1.6) - 0.06 * Math.pow(u, 6) // cup that flares at the rim
        const curl = -0.08 * (v - 0.5) * (v - 0.5) * u // petals cup inward across their width
        const ca = Math.cos(a0)
        const sa = Math.sin(a0)
        const x = r * ca - across * sa + curl * ca
        const z = r * sa + across * ca + curl * sa
        const shade = 0.55 + 0.45 * u // darker at the base, light rim
        const edge = Math.pow(Math.abs(v - 0.5) * 2, 4) * 0.15
        return { p: [x, y, z], c: [pink[0] * shade + edge, pink[1] * shade + edge, pink[2] * shade + edge] }
      },
      4,
      4,
      0,
      1,
    )
  }
  // dark centre with a ring of pollen
  B.sphere([0, 0.06, 0], 0.11, hex('#2a1328'), 0, 0, 6)
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    B.sphere([Math.cos(a) * 0.12, 0.1, Math.sin(a) * 0.12], 0.03, hex('#f2d75a'), 0, 0, 3)
  }
  return B.build()
}

/** Baby's-breath: a little branching spray of tiny round florets. */
export function buildBabysBreath(seed = 3) {
  const r = rng(seed)
  const B = new Builder()
  B.stem(0.035, hex('#4c7a2a'), 4)
  const florets = 16
  for (let k = 0; k < florets; k++) {
    const a = r() * Math.PI * 2
    const rad = 0.15 + Math.sqrt(r()) * 0.7
    const y = 0.05 + (1 - rad) * 0.4 + r() * 0.15
    // tiny twig from the stem top to the floret
    const fx = Math.cos(a) * rad
    const fz = Math.sin(a) * rad
    B.surface(
      (u, v) => {
        const ang = u * Math.PI * 2
        const tw = 0.008
        return { p: [fx * v + Math.cos(ang) * tw, y * v, fz * v + Math.sin(ang) * tw], c: [0.3, 0.5, 0.18] }
      },
      3,
      1,
      0,
      0,
    )
    B.sphere([fx, y, fz], 0.1 + r() * 0.06, [1, 1, 1], 0, 1, 5)
  }
  return B.build()
}

/** A single loose petal for the drifting-petal particles. */
export function buildPetal() {
  const B = new Builder()
  B.surface(
    (u, v) => {
      const w = Math.pow(Math.sin(Math.PI * u), 0.7) * 0.32
      const x = (v - 0.5) * 2 * w
      const y = 0.1 * Math.sin(Math.PI * u) - 0.12 * (v - 0.5) * (v - 0.5)
      return { p: [x, y, u - 0.5], c: [1, 1, 1] }
    },
    4,
    3,
    0,
    1,
  )
  return B.build()
}

/* ------------------------------------------------------------------ scatter */

function noise2(x, y, seed) {
  const h = (i, j) => {
    let n = (i * 374761393 + j * 668265263 + seed * 1442695041) | 0
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = h(xi, yi)
  const b = h(xi + 1, yi)
  const c = h(xi, yi + 1)
  const d = h(xi + 1, yi + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

/**
 * Scatters `count` flowers over a triangle mesh (area-weighted), in clusters
 * (patches of flowers, like the reference), and returns per-instance data:
 * matrices (Float32Array, 16 per instance, column-major), stem lengths, tints, phases.
 */
export function scatterFlowers(mesh, opts) {
  const { position: P, normal: N, index: I } = mesh
  const r = rng(opts.seed ?? 1)
  const tris = I.length / 3
  const areas = new Float64Array(tris)
  let total = 0
  for (let t = 0; t < tris; t++) {
    const a = I[t * 3] * 3
    const b = I[t * 3 + 1] * 3
    const c = I[t * 3 + 2] * 3
    const ux = P[b] - P[a]
    const uy = P[b + 1] - P[a + 1]
    const uz = P[b + 2] - P[a + 2]
    const vx = P[c] - P[a]
    const vy = P[c + 1] - P[a + 1]
    const vz = P[c + 2] - P[a + 2]
    const ar = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    total += ar
    areas[t] = total
  }
  const pick = () => {
    const x = r() * total
    let lo = 0
    let hi = tris - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (areas[mid] < x) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  const out = { matrices: new Float32Array(opts.count * 16), stem: new Float32Array(opts.count), tint: new Float32Array(opts.count * 3), phase: new Float32Array(opts.count) }
  const palette = opts.colors.map(hex)
  let n = 0
  let guard = 0
  while (n < opts.count && guard++ < opts.count * 60) {
    const t = pick()
    let u = r()
    let v = r()
    if (u + v > 1) {
      u = 1 - u
      v = 1 - v
    }
    const w = 1 - u - v
    const ia = I[t * 3] * 3
    const ib = I[t * 3 + 1] * 3
    const ic = I[t * 3 + 2] * 3
    const px = P[ia] * w + P[ib] * u + P[ic] * v
    const py = P[ia + 1] * w + P[ib + 1] * u + P[ic + 1] * v
    const pz = P[ia + 2] * w + P[ib + 2] * u + P[ic + 2] * v
    // clustered: accept with probability from low-frequency noise
    const cl = noise2(px * opts.clusterScale + pz * 0.7, py * opts.clusterScale - pz * 0.5, opts.seed ?? 1)
    if (r() > Math.pow(Math.max(0, (cl - opts.clusterBias) / (1 - opts.clusterBias)), 1.5)) continue

    let nx = N[ia] * w + N[ib] * u + N[ic] * v
    let ny = N[ia + 1] * w + N[ib + 1] * u + N[ic + 1] * v
    let nz = N[ia + 2] * w + N[ib + 2] * u + N[ic + 2] * v
    // random lean away from the normal
    nx += (r() - 0.5) * opts.lean
    ny += (r() - 0.5) * opts.lean
    nz += (r() - 0.5) * opts.lean
    const nl = Math.hypot(nx, ny, nz)
    nx /= nl
    ny /= nl
    nz /= nl
    // orthonormal frame: Y = normal, X/Z = random spin around it
    let tx = Math.abs(ny) < 0.9 ? 0 : 1
    let ty = Math.abs(ny) < 0.9 ? 1 : 0
    let tz = 0
    // X = normalize(cross(helper, Y))
    let xx = ty * nz - tz * ny
    let xy = tz * nx - tx * nz
    let xz = tx * ny - ty * nx
    let xl = Math.hypot(xx, xy, xz)
    xx /= xl
    xy /= xl
    xz /= xl
    // Z = X × Y keeps the frame right-handed (no mirroring)
    let zx = xy * nz - xz * ny
    let zy = xz * nx - xx * nz
    let zz = xx * ny - xy * nx
    const spin = r() * Math.PI * 2
    const cs = Math.cos(spin)
    const sn = Math.sin(spin)
    const Xx = xx * cs + zx * sn
    const Xy = xy * cs + zy * sn
    const Xz = xz * cs + zz * sn
    const Zx = zx * cs - xx * sn
    const Zy = zy * cs - xy * sn
    const Zz = zz * cs - xz * sn
    const s = opts.size * (0.75 + r() * 0.5)
    const o = n * 16
    out.matrices.set([Xx * s, Xy * s, Xz * s, 0, nx * s, ny * s, nz * s, 0, Zx * s, Zy * s, Zz * s, 0, px, py, pz, 1], o)
    // stem length in LOCAL units (local unit = s): most heads just above the grass, a few poking well out
    const tall = r() < opts.tallChance ? 1.4 + r() * 0.8 : 0.8 + r() * 0.45
    out.stem[n] = (opts.grassLength * tall) / s
    const col = palette[Math.floor(r() * palette.length)]
    const jitter = 0.9 + r() * 0.2
    out.tint.set([col[0] * jitter, col[1] * jitter, col[2] * jitter], n * 3)
    out.phase[n] = r() * Math.PI * 2
    n++
  }
  out.count = n
  return out
}
