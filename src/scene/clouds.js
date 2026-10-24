import * as THREE from 'three'
import { CLOUDS } from '../config/scene.js'
import { paintCloud } from './cloudTexture.js'

/**
 * Separate cloud layer, rendered into the same transparent canvas BEFORE the
 * logo, with its own pixel-space orthographic camera. The ONLY animated
 * property is horizontal position (plus seamless wrap-around once a cloud is
 * fully outside the viewport). No scaling, fading, morphing or camera motion.
 */
export function createCloudLayer() {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10)
  const clouds = []

  if (CLOUDS.enabled) {
    CLOUDS.items.forEach((item, i) => {
      const canvas = paintCloud({ seed: item.seed, kind: item.kind, width: 512 })
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 2
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: CLOUDS.opacity,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
      mesh.renderOrder = i
      scene.add(mesh)
      clouds.push({ item, mesh, aspect: canvas.width / canvas.height })
    })
  }

  let layout = null

  function resize(nextLayout) {
    layout = nextLayout
    camera.left = 0
    camera.right = layout.width
    camera.top = 0
    camera.bottom = -layout.height
    camera.updateProjectionMatrix()
    for (const c of clouds) {
      const w = c.item.width * layout.scale
      c.mesh.scale.set(w, w / c.aspect, 1)
      c.mesh.position.y = -layout.toScreen(0, c.item.v).y
    }
  }

  /** @param {number} t seconds of accumulated drift time */
  function update(t) {
    if (!layout) return
    const W = layout.width
    for (const c of clouds) {
      const w = c.mesh.scale.x
      const speedPx = CLOUDS.speed * c.item.speed * layout.scale
      const span = W + w
      const raw = c.item.x * W + speedPx * t + w / 2
      c.mesh.position.x = (((raw % span) + span) % span) - w / 2
    }
  }

  /** Current cloud rectangles in CSS px (centre x/y, y down) — for the glass backdrop. */
  function rects() {
    return clouds.map((c) => ({
      texture: c.mesh.material.map,
      x: c.mesh.position.x,
      y: -c.mesh.position.y,
      w: c.mesh.scale.x,
      h: c.mesh.scale.y,
    }))
  }

  function dispose() {
    for (const c of clouds) {
      c.mesh.geometry.dispose()
      c.mesh.material.map.dispose()
      c.mesh.material.dispose()
    }
  }

  return { scene, camera, resize, update, rects, dispose }
}
