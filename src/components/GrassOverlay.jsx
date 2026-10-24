import { useEffect, useRef, useState } from 'react'
import { GRASS, LANDSCAPE, LOGO, pick } from '../config/scene.js'

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Cuts a strip of crest grass out of the landscape photo and draws it ABOVE
 * the WebGL canvas, exactly registered with the CSS background. Grass pixels
 * stay, sky pixels become transparent — so real blades from the photo overlap
 * the bottom of the logo and it reads as standing IN the grass.
 *
 * The strip is built in source-image pixels around the configured anchor and
 * scaled with the same layout maths as the background, so it lines up at every
 * viewport size. Nothing here animates.
 */
export default function GrassOverlay({ layout }) {
  const canvasRef = useRef(null)
  const [region, setRegion] = useState(null)

  const width = layout?.width ?? 0
  const anchorUV = pick(LOGO.anchor, width || 1200)
  // logo width in SOURCE px (badge ≈ 0.97 as wide as tall); regenerate only when it changes noticeably
  const logoSrcW = layout ? Math.round(((layout.logoHeightPx / layout.scale) * 0.97) / 8) * 8 : 0

  useEffect(() => {
    if (!GRASS.enabled || LANDSCAPE.video || !logoSrcW) return undefined
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled || !canvasRef.current) return
      const ax = anchorUV.u * LANDSCAPE.width
      const ay = anchorUV.v * LANDSCAPE.height
      const half = (logoSrcW * GRASS.widthFactor) / 2
      const x0 = Math.max(0, Math.floor(ax - half))
      const x1 = Math.min(LANDSCAPE.width, Math.ceil(ax + half))
      const y0 = Math.max(0, Math.floor(ay - GRASS.above))
      const y1 = Math.min(LANDSCAPE.height, Math.ceil(ay + GRASS.below))
      const w = x1 - x0
      const h = y1 - y0

      const c = canvasRef.current
      c.width = w
      c.height = h
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h)
      const px = data.data
      const halfLogo = logoSrcW / 2

      // Sky colour just above the crest (top rows of the strip). Used to
      // "un-mix" the soft edge pixels, which in the photo are part grass and
      // part sky — otherwise they show as a pale fringe over the dark logo.
      let sr = 0
      let sg = 0
      let sb = 0
      let sn = 0
      for (let j = 0; j < Math.min(6, h); j++) {
        for (let i = 0; i < w; i++) {
          const k = (j * w + i) * 4
          if (px[k + 1] - px[k + 2] < GRASS.greenMin) {
            sr += px[k]
            sg += px[k + 1]
            sb += px[k + 2]
            sn++
          }
        }
      }
      const sky = sn ? [sr / sn, sg / sn, sb / sn] : [220, 232, 240]

      for (let j = 0; j < h; j++) {
        const y = y0 + j
        // fade out toward the bottom of the strip (below that, the logo doesn't exist anyway)
        const fadeBottom = smooth(y1, y1 - 6, y)
        for (let i = 0; i < w; i++) {
          const k = (j * w + i) * 4
          const r = px[k]
          const g = px[k + 1]
          const b = px[k + 2]
          const grass = smooth(GRASS.greenMin, GRASS.greenFull, g - b)
          const x = x0 + i
          const fadeSides = smooth(x0, x0 + 12, x) * smooth(x1, x1 - 12, x)
          px[k + 3] = 255 * grass * fadeBottom * fadeSides
          if (grass > 0 && grass < 1) {
            // remove the sky's share from partially-covered edge pixels
            const a = Math.max(grass, 0.3)
            px[k] = Math.max(0, (r - (1 - a) * sky[0]) / a)
            px[k + 1] = Math.max(0, (g - (1 - a) * sky[1]) / a)
            px[k + 2] = Math.max(0, (b - (1 - a) * sky[2]) / a)
          }

          // baked contact shade: darkest right at the base, fading out sideways and downward
          if (GRASS.contactShade > 0) {
            const dx = (x - ax) / (halfLogo * 1.05)
            const dy = (y - ay) / 9
            const shade = GRASS.contactShade * Math.exp(-(dx * dx * dx * dx) - dy * dy)
            px[k] *= 1 - shade
            px[k + 1] *= 1 - shade * 0.92
            px[k + 2] *= 1 - shade * 0.85
          }
        }
      }
      ctx.putImageData(data, 0, 0)
      setRegion({ x0, y0, w, h })
    }
    img.src = LANDSCAPE.src
    return () => {
      cancelled = true
    }
  }, [anchorUV.u, anchorUV.v, logoSrcW])

  // a static grass strip would not match moving footage underneath
  if (!GRASS.enabled || LANDSCAPE.video) return null
  const style =
    region && layout
      ? {
          left: layout.offsetX + region.x0 * layout.scale,
          top: layout.offsetY + region.y0 * layout.scale,
          width: region.w * layout.scale,
          height: region.h * layout.scale,
        }
      : { display: 'none' }

  return <canvas ref={canvasRef} className="hero__grass" style={style} aria-hidden="true" />
}
