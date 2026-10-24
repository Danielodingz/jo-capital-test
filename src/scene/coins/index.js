import * as THREE from 'three'
import { COINS } from '../../config/scene.js'
import { buildCoinGeometry } from './coinGeometry.js'
import { paintCoinTextures } from './coinTextures.js'
import { NOISE_GLSL, COIN_GRASS_DECL, COIN_GRASS } from '../looks/glsl.js'

/**
 * Satin-silver $ coins in the scene:
 *   - one lying on the grass, propped up a little so the $ shows
 *   - two more lying further back on the far grass, at different angles
 *   - one rolling slowly across the slope, through the grass
 * Placed in the same off-axis camera as the logo, using the same image
 * coordinates as the background (layout.toScreen), so they stay on the same
 * patch of grass at every screen size. Lit by the scene's sun + reflections of
 * the landscape itself.
 */
export function createCoins({ scene, camera, envMap = null }) {
  const geo = toGeometry(buildCoinGeometry())
  const tex = paintCoinTextures({ size: 512 })
  const dataTex = new THREE.CanvasTexture(tex.data)
  dataTex.colorSpace = THREE.NoColorSpace
  dataTex.anisotropy = 4
  const colorTex = new THREE.CanvasTexture(tex.color)
  colorTex.colorSpace = THREE.SRGBColorSpace
  colorTex.anisotropy = 4

  const blobTex = createBlobTexture()
  const group = new THREE.Group()
  group.name = 'jo-coins'
  scene.add(group)

  const coins = [COINS.lying, ...(COINS.back || []), COINS.rolling].map((cfg, i) => {
    const uniforms = { uGroundY: { value: 0 }, uGrassH: { value: 0.1 }, uGrassFreq: { value: 1 } }
    const mat = new THREE.MeshPhysicalMaterial({
      name: `jo-coin-${i}`,
      map: colorTex,
      color: new THREE.Color(COINS.tint),
      metalness: 1,
      metalnessMap: dataTex,
      roughness: 1,
      roughnessMap: dataTex,
      bumpMap: dataTex,
      bumpScale: COINS.reliefStrength,
      envMap, // warm studio lighting (like the reference) instead of the deep-blue sky
      envMapIntensity: COINS.envIntensity,
      clearcoat: 0.15,
      clearcoatRoughness: 0.35,
    })
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vJoWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvJoWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${COIN_GRASS_DECL}\n${NOISE_GLSL}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${COIN_GRASS}`)
    }
    mat.customProgramCacheKey = () => 'jo-coin'

    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = false
    const pivot = new THREE.Group() // ground point; the coin hangs off it
    pivot.add(mesh)
    group.add(pivot)

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTex, color: 0x0e1a06, transparent: true, opacity: cfg.shadowOpacity, depthWrite: false, toneMapped: false }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.renderOrder = -1
    group.add(shadow)

    return { cfg, mesh, pivot, shadow, uniforms, mat, ground: new THREE.Vector3(), R: 1 }
  })

  const ndc = new THREE.Vector3()
  const dir = new THREE.Vector3()
  /** pixel (CSS px) → world point on the plane z = zPlane */
  function screenToWorld(px, py, width, height, zPlane, out) {
    ndc.set((px / width) * 2 - 1, -(py / height) * 2 + 1, 0.5).unproject(camera)
    dir.copy(ndc).sub(camera.position).normalize()
    const t = (zPlane - camera.position.z) / dir.z
    return out.copy(camera.position).addScaledVector(dir, t)
  }

  let layout = null
  let lastT = 0
  let lastReduced = false
  const tmp = new THREE.Vector3()
  const tmp2 = new THREE.Vector3()

  function place(c, u, v) {
    const p = layout.toScreen(u, v)
    screenToWorld(p.x, p.y, layout.width, layout.height, c.cfg.depth * c.unit, c.ground)
  }

  return {
    group,
    /** @param {object} l layout from computeLayout(); @param {number} unitPerPx world units per CSS px on z = 0 */
    layout(l, unitPerPx) {
      layout = l
      camera.updateMatrixWorld()
      for (const c of coins) {
        // size: fraction of displayed image height → world units at z = 0
        c.unit = unitPerPx * l.dispH // world units per "1.0 of image height"
        c.R = (c.cfg.diameter * c.unit) / 2
        c.mesh.scale.setScalar(c.R)
        c.uniforms.uGrassH.value = c.R * c.cfg.grassDepth
        c.uniforms.uGrassFreq.value = 1 / c.R
        c.shadow.scale.set(c.R * c.cfg.shadowSize[0], c.R * c.cfg.shadowSize[1], 1)
      }
      update(lastT, lastReduced)
    },
    update,
    setVisible(v) {
      group.visible = v
    },
    setEnvMap(t) {
      for (const c of coins) {
        c.mat.envMap = t
        c.mat.needsUpdate = true
      }
    },
    dispose() {
      scene.remove(group)
      for (const c of coins) {
        c.mat.dispose()
        c.shadow.geometry.dispose()
        c.shadow.material.dispose()
      }
      geo.dispose()
      dataTex.dispose()
      colorTex.dispose()
      blobTex.dispose()
    },
  }

  /** @param {number} t seconds; @param {boolean} reduced hold the rolling coin still */
  function update(t, reduced = false) {
      lastT = t
      lastReduced = reduced
      if (!layout) return
      for (const c of coins) {
        const cfg = c.cfg
        let u = cfg.u
        let roll = 0
        let wobble = 0
        if (cfg.rolling) {
          // slow roll across the slope, then a pause off-screen, then again
          const span = cfg.uTo - cfg.uFrom
          const cycle = cfg.duration + cfg.pause
          const k = (t % cycle) / cfg.duration
          // ease in/out a little at both ends so it never jerks; reduced motion parks it in view
          const s = reduced ? cfg.restAt : Math.min(1, Math.max(0, k))
          u = cfg.uFrom + span * s
          place(c, u, cfg.v)
          // distance travelled in world units → rolling angle
          screenToWorld(layout.toScreen(cfg.uFrom, cfg.v).x, layout.toScreen(cfg.uFrom, cfg.v).y, layout.width, layout.height, cfg.depth * c.unit, tmp2)
          roll = -(c.ground.x - tmp2.x) / c.R
          wobble = reduced ? 0 : Math.sin(t * 1.7) * cfg.wobble
          c.pivot.position.copy(c.ground)
          c.pivot.rotation.set(0, cfg.yaw, 0)
          c.mesh.position.set(0, c.R, 0)
          c.mesh.rotation.set(cfg.lean + wobble, 0, roll)
        } else {
          place(c, u, cfg.v)
          c.pivot.position.copy(c.ground)
          c.pivot.rotation.set(0, cfg.yaw, 0)
          // lying on its back, propped up toward the camera by `tilt`, sunk slightly
          c.mesh.rotation.set(-Math.PI / 2 + cfg.tilt, 0, cfg.spin)
          c.mesh.position.set(0, c.R * Math.sin(cfg.tilt) * 0.85 + c.R * 0.06, 0)
        }
        c.uniforms.uGroundY.value = c.ground.y
        c.shadow.position.copy(c.ground).add(tmp.set(cfg.shadowOffset[0] * c.R, 0.002, cfg.shadowOffset[1] * c.R))
      }
  }
}

function toGeometry(g) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2))
  geo.setIndex(new THREE.BufferAttribute(g.index, 1))
  geo.computeBoundingSphere()
  return geo
}

function createBlobTexture(size = 128) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.45, 'rgba(0,0,0,0.5)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
