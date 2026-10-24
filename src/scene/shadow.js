import * as THREE from 'three'
import { SHADOW } from '../config/scene.js'

/**
 * Grounding for the logo. Lives in a NON-rotating group placed at the ground
 * anchor, so it never spins or drifts with the badge.
 *
 *  1. contact blob — a soft radial gradient on the ground plane right under
 *     the base (ambient occlusion where the badge meets the grass).
 *  2. cast shadow — an invisible plane with THREE.ShadowMaterial that only
 *     draws the key light's soft shadow; it changes naturally with the
 *     badge's silhouette as it turns. Nothing but the shadow is drawn, so no
 *     dark rectangle appears over the transparent canvas.
 */
function createBlobTexture(size = 256) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.35, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.7, 'rgba(0,0,0,0.14)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createGround() {
  const group = new THREE.Group()
  group.name = 'jo-ground'

  const blobTex = createBlobTexture()
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: blobTex,
      color: 0x10180a, // green-black, like shade on grass rather than pure black
      transparent: true,
      opacity: SHADOW.contactOpacity,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.002
  blob.renderOrder = -1
  group.add(blob)

  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({ color: 0x0f1a08, opacity: SHADOW.castOpacity, depthWrite: false }),
  )
  catcher.rotation.x = -Math.PI / 2
  catcher.receiveShadow = true
  catcher.renderOrder = -1
  group.add(catcher)

  /** Size everything to the logo footprint (model units after scaling). */
  function fit(logoWidth) {
    blob.scale.set(logoWidth * SHADOW.contactWidth, logoWidth * SHADOW.contactDepth, 1)
    blob.position.z = logoWidth * SHADOW.contactOffsetZ
    // Only in FRONT of the badge (z ≥ 0): behind the crest there is sky, not ground.
    catcher.scale.set(logoWidth * 5, logoWidth * 3, 1)
    catcher.position.z = logoWidth * 1.4
  }

  function dispose() {
    blobTex.dispose()
    blob.geometry.dispose()
    blob.material.dispose()
    catcher.geometry.dispose()
    catcher.material.dispose()
  }

  return { group, fit, dispose }
}
