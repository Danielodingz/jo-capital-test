/**
 * Procedural HDR "studio" environment (equirectangular, linear float RGBA),
 * like a product-render HDRI in Blender: a dim surround, a large warm
 * softbox high on the left, a white softbox top-right, a bright vertical strip
 * on the right for crisp edge highlights, and a soft cool fill low on the left.
 *
 * Pure JS (no Three.js) so the same data can drive both the site and the
 * offline material previews. Values above 1.0 are intentional (HDR).
 */
export const STUDIO_ENV = {
  width: 768,
  height: 384,
  surroundTop: [0.05, 0.055, 0.065],
  surroundBottom: [0.012, 0.012, 0.014],
  // [centre longitude (rad, 0 = straight ahead toward the viewer), centre latitude (rad), half-width, half-height, softness, colour*intensity]
  // Lights sit in a ring near the horizon so an UPRIGHT badge that spins on
  // its vertical axis sweeps its faces and edges through them, like a
  // turntable product shot.
  lights: [
    { lon: -1.15, lat: 0.3, w: 0.55, h: 0.4, soft: 0.3, color: [6.0, 4.3, 2.6] }, // warm key softbox, left
    { lon: 1.15, lat: 0.25, w: 0.45, h: 0.35, soft: 0.28, color: [3.2, 3.2, 3.4] }, // white softbox, right
    { lon: 0.0, lat: 0.35, w: 0.38, h: 0.26, soft: 0.45, color: [1.5, 1.3, 1.05] }, // soft frontal key (behind the camera)
    { lon: -2.45, lat: 0.1, w: 0.06, h: 0.8, soft: 0.05, color: [7.0, 5.0, 3.0] }, // warm rim strip, back left
    { lon: 2.4, lat: 0.1, w: 0.06, h: 0.8, soft: 0.05, color: [6.5, 6.5, 7.0] }, // white rim strip, back right
    { lon: 0.0, lat: 1.25, w: 3.2, h: 0.35, soft: 0.6, color: [1.1, 1.1, 1.2] }, // soft overhead
    { lon: 0.2, lat: -0.55, w: 1.8, h: 0.2, soft: 0.45, color: [0.7, 0.5, 0.32] }, // warm floor bounce
  ],
}

/**
 * Daylight "sky studio" for the glass look: a real blue sky (deep overhead,
 * pale at the horizon), green ground below, a hot sun and a few crisp white
 * strips + soft cloud patches so the glass edges catch sharp highlights.
 */
export const GLASS_ENV = {
  width: 768,
  height: 384,
  surroundTop: [0.08, 0.24, 0.85],
  surroundBottom: [0.05, 0.09, 0.03],
  horizon: { lat: 0.04, width: 0.12, color: [0.45, 0.55, 0.7] },
  lights: [
    { lon: -0.85, lat: 0.62, w: 0.045, h: 0.045, soft: 0.6, color: [60, 52, 40] }, // sun
    { lon: -0.85, lat: 0.62, w: 0.22, h: 0.22, soft: 0.9, color: [2.2, 2.0, 1.7] }, // sun glow
    { lon: 1.3, lat: 0.25, w: 0.035, h: 0.7, soft: 0.05, color: [9, 9, 9.5] }, // crisp white strip
    { lon: -1.9, lat: 0.2, w: 0.03, h: 0.6, soft: 0.05, color: [8, 8, 8.5] }, // crisp white strip
    { lon: 0.35, lat: 0.3, w: 0.35, h: 0.1, soft: 0.6, color: [1.6, 1.65, 1.75] }, // cloud bank
    { lon: -0.4, lat: 0.18, w: 0.5, h: 0.08, soft: 0.6, color: [1.3, 1.35, 1.45] }, // cloud bank
    { lon: 2.4, lat: 0.35, w: 0.45, h: 0.12, soft: 0.6, color: [1.4, 1.45, 1.55] }, // cloud bank
  ],
}

/**
 * Studio lighting for the $ coins: the warm product-shot studio plus a large
 * soft panel behind the camera and a brighter warm surround, so a coin facing
 * the viewer (the rolling one) reflects soft warm light instead of darkness,
 * and a coin leaning back reflects the warm overhead light, not blue sky.
 */
export const COIN_ENV = {
  ...STUDIO_ENV,
  surroundTop: [0.36, 0.35, 0.33],
  surroundBottom: [0.12, 0.12, 0.11],
  lights: [
    ...STUDIO_ENV.lights,
    { lon: 0.0, lat: 0.05, w: 1.1, h: 0.55, soft: 0.6, color: [1.75, 1.65, 1.5] }, // big soft panel behind the camera
  ],
}

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** Returns { width, height, data: Float32Array(RGBA) } — row 0 is the TOP (north pole). */
export function paintStudioEnv(cfg = STUDIO_ENV) {
  const { width: W, height: H } = cfg
  const data = new Float32Array(W * H * 4)
  for (let j = 0; j < H; j++) {
    const lat = Math.PI / 2 - ((j + 0.5) / H) * Math.PI
    const vt = smooth(-0.6, 0.9, lat)
    for (let i = 0; i < W; i++) {
      // Three's equirect convention: u = atan(dir.z, dir.x) / 2π + 0.5. Here lon = 0 is
      // the direction toward the viewer (+Z), negative lon = viewer's left (−X).
      const lon = Math.PI * 1.5 - ((i + 0.5) / W) * Math.PI * 2
      let r = cfg.surroundBottom[0] + (cfg.surroundTop[0] - cfg.surroundBottom[0]) * vt
      let g = cfg.surroundBottom[1] + (cfg.surroundTop[1] - cfg.surroundBottom[1]) * vt
      let b = cfg.surroundBottom[2] + (cfg.surroundTop[2] - cfg.surroundBottom[2]) * vt
      if (cfg.horizon) {
        // bright hazy band at the horizon (sky looks palest there)
        const hz = Math.exp(-Math.pow((lat - (cfg.horizon.lat ?? 0.02)) / cfg.horizon.width, 2))
        r += cfg.horizon.color[0] * hz
        g += cfg.horizon.color[1] * hz
        b += cfg.horizon.color[2] * hz
      }
      for (const L of cfg.lights) {
        let dl = lon - L.lon
        dl = Math.atan2(Math.sin(dl), Math.cos(dl)) // wrap
        const dx = Math.abs(dl * Math.cos(lat)) / L.w
        const dy = Math.abs(lat - L.lat) / L.h
        // rounded-rectangle softbox with soft edges
        const d = Math.pow(Math.pow(dx, 4) + Math.pow(dy, 4), 0.25)
        const k = 1 - smooth(1 - L.soft, 1 + L.soft, d)
        if (k > 0) {
          r += L.color[0] * k
          g += L.color[1] * k
          b += L.color[2] * k
        }
      }
      const o = (j * W + i) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 1
    }
  }
  return { width: W, height: H, data }
}
