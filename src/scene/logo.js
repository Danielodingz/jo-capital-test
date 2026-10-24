import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { LOGO } from '../config/scene.js'

/**
 * Loads the badge GLB and returns a rig:
 *
 *   pivot  ← positioned on the ground anchor; ONLY its rotation.y animates
 *    └ tilt   ← constant three-quarter lean (x/z), lifted so its lowest point is y = 0
 *       └ model ← badge meshes, centred on the origin
 *
 * Because the spin happens around the pivot's vertical axis and the lowest
 * point of the tilted model sits exactly at the pivot's y = 0, the badge
 * rotates in place on its base: no orbiting, sliding or bobbing.
 *
 * Materials are NOT decided here — see looks/index.js (applyLook).
 */
export async function loadLogo({ signal } = {}) {
  const gltf = await new GLTFLoader().loadAsync(LOGO.modelUrl)
  if (signal?.aborted) {
    gltf.scene.traverse((o) => o.geometry?.dispose())
    throw new DOMException('aborted', 'AbortError')
  }

  const placeholder = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.6, metalness: 0.4 })
  const model = new THREE.Group()
  model.name = 'jo-logo-model'

  // Front = +Z, up = +Y. Inspect the real bounds rather than trusting the origin.
  const rawBox = new THREE.Box3().setFromObject(gltf.scene)
  const zMid = (rawBox.min.z + rawBox.max.z) / 2

  const sources = []
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((o) => {
    if (o.isMesh) sources.push(o)
  })

  const meshes = []
  for (const src of sources) {
    let geo = src.geometry.clone()
    geo.applyMatrix4(src.matrixWorld)

    // Legacy flat GLB only: optional extra depth by pushing the front half forward.
    if (LOGO.thicknessExtra) {
      const pos = geo.attributes.position
      for (let i = 0; i < pos.count; i++) {
        if (pos.getZ(i) > zMid) pos.setZ(i, pos.getZ(i) + LOGO.thicknessExtra)
      }
      pos.needsUpdate = true
      geo.deleteAttribute('normal')
    }
    // Rebuild normals only if the file has none (the legacy GLB). The badge
    // GLB ships smooth normals from scripts/build_badge.py.
    if (!geo.attributes.normal) {
      geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(LOGO.creaseAngle))
    }
    geo.computeBoundingSphere()

    const mesh = new THREE.Mesh(geo, placeholder)
    mesh.name = src.name || 'badge'
    mesh.castShadow = true
    mesh.receiveShadow = true
    model.add(mesh)
    meshes.push(mesh)
  }
  gltf.scene.traverse((o) => {
    o.geometry?.dispose()
    if (o.material) o.material.dispose()
  })

  // Centre the geometry on the origin (x, y, z).
  const box = new THREE.Box3().setFromObject(model)
  const centre = box.getCenter(new THREE.Vector3())
  model.position.sub(centre)
  const size = box.getSize(new THREE.Vector3())

  const tilt = new THREE.Group()
  tilt.name = 'jo-logo-tilt'
  tilt.rotation.set(LOGO.tilt.x, 0, LOGO.tilt.z)
  tilt.add(model)

  // Lift so the lowest point of the tilted badge touches y = 0.
  tilt.updateMatrixWorld(true)
  const tiltedBox = new THREE.Box3().setFromObject(tilt)
  tilt.position.y = -tiltedBox.min.y + LOGO.baseOffset * (tiltedBox.max.y - tiltedBox.min.y)

  const pivot = new THREE.Group()
  pivot.name = 'jo-logo-pivot'
  pivot.rotation.y = LOGO.yStart
  pivot.add(tilt)

  return {
    pivot,
    model,
    meshes,
    /** height / width of the upright badge in model units */
    height: tiltedBox.max.y - tiltedBox.min.y,
    width: size.x,
    depth: size.z,
    dispose() {
      for (const m of meshes) m.geometry.dispose()
      placeholder.dispose()
    },
  }
}
