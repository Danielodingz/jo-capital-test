import { LANDSCAPE, BACKGROUND_POSITION, LOGO, CAMERA, pick } from '../config/scene.js'

/**
 * The single source of truth for how the landscape is cropped.
 * Mirrors CSS `background-size: cover; background-position: X% Y%`:
 *   scale  = max(W / iw, H / ih)
 *   offset = (viewport − displayed) × position
 */
export function computeLayout(width, height) {
  const pos = pick(BACKGROUND_POSITION, width)
  const scale = Math.max(width / LANDSCAPE.width, height / LANDSCAPE.height)
  const dispW = LANDSCAPE.width * scale
  const dispH = LANDSCAPE.height * scale
  const offsetX = (width - dispW) * pos.x
  const offsetY = (height - dispH) * pos.y

  /** normalised image (u, v) → viewport pixels */
  const toScreen = (u, v) => ({ x: offsetX + u * dispW, y: offsetY + v * dispH })

  const anchorUV = pick(LOGO.anchor, width)
  const anchor = toScreen(anchorUV.u, anchorUV.v)

  const logoHeightPx = Math.min(
    pick(LOGO.heightOfImage, width) * dispH,
    LOGO.maxHeightOfViewport * height,
    // the badge is ~0.97 as wide as it is tall
    (LOGO.maxWidthOfViewport * width) / 0.97,
  )

  const eyeLevelY = toScreen(0, CAMERA.eyeLevelV).y

  return {
    width,
    height,
    scale,
    dispW,
    dispH,
    offsetX,
    offsetY,
    toScreen,
    anchor,
    logoHeightPx,
    eyeLevelY,
    cssBackgroundPosition: `${pos.x * 100}% ${pos.y * 100}%`,
  }
}
