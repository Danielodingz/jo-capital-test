import * as THREE from 'three'
import { LOOKS, SHELL_MOBILE_FACTOR, WIND } from '../../config/scene.js'
import { buildPoppy, buildBabysBreath, buildPetal, scatterFlowers } from './flowers.js'
import {
  NOISE_GLSL,
  SHELL_VERTEX_DECL,
  SHELL_VERTEX,
  SHELL_FRAGMENT_DECL,
  SHELL_FRAGMENT,
  BRONZE_FRAGMENT,
  BRONZE_ROUGHNESS,
  GRAIN_NORMAL,
  FLOWER_VERTEX_DECL,
  FLOWER_VERTEX,
  FLOWER_COLOR,
  GLASS_DECL,
  GLASS_EXTRA,
} from './glsl.js'

/**
 * Logo surface looks. Each builder receives the loaded badge and returns
 * { dispose, needsBackdrop? }. Builders only touch the badge's own meshes and
 * children, so switching looks never rebuilds the scene.
 *
 *   bronze — dark granular graphite-bronze with worn, brighter edges
 *   chrome — black chrome with warm studio reflections
 *   glass  — clear refractive glass with dispersion (refracts the real photo)
 *
 * bronze / chrome / glass reflect ctx.studioEnv (a studio HDRI, like the
 * reference renders); the shell looks use the scene's landscape lighting.
 *   grass  — turf + flowers, built from stacked surface "shells"
 *   fuzzy  — pink fur, shells
 *   cloud  — billowing cloud surface, shells
 */
export const LOOK_NAMES = Object.keys(LOOKS)

export function applyLook(name, ctx) {
  const key = LOOKS[name] ? name : 'bronze'
  const cfg = LOOKS[key]
  const build = BUILDERS[key]
  return { name: key, ...build(cfg, ctx) }
}

/* ---------------------------------------------------------------- helpers */

function setMaterial(ctx, material) {
  for (const mesh of ctx.meshes) mesh.material = material
}

/* --------------------------------------------------------------- builders */

const BUILDERS = {
  bronze(cfg, ctx) {
    const m = new THREE.MeshPhysicalMaterial({
      name: 'jo-bronze',
      color: cfg.color,
      metalness: cfg.metalness,
      roughness: cfg.roughness,
      envMap: ctx.studioEnv || null,
      envMapIntensity: cfg.envIntensity,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uWear = { value: new THREE.Color(cfg.wearColor) }
      shader.uniforms.uWearAmount = { value: cfg.wear }
      shader.uniforms.uGrainScale = { value: cfg.grainScale }
      shader.uniforms.uGrainBump = { value: cfg.grainBump }
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjN;\nvarying vec3 vObjP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjN = normalize(objectNormal);\nvObjP = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform vec3 uWear;
uniform float uWearAmount;
uniform float uGrainScale;
uniform float uGrainBump;
varying vec3 vObjN;
varying vec3 vObjP;
${NOISE_GLSL}`,
        )
        .replace('#include <color_fragment>', `#include <color_fragment>\n${BRONZE_FRAGMENT}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${BRONZE_ROUGHNESS}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${GRAIN_NORMAL}`)
    }
    m.customProgramCacheKey = () => 'jo-bronze-2'
    setMaterial(ctx, m)
    return { dispose: () => m.dispose() }
  },

  chrome(cfg, ctx) {
    const m = new THREE.MeshPhysicalMaterial({
      name: 'jo-chrome',
      color: cfg.color,
      metalness: cfg.metalness,
      roughness: cfg.roughness,
      clearcoat: cfg.clearcoat,
      clearcoatRoughness: 0.03,
      envMap: ctx.studioEnv || null,
      envMapIntensity: cfg.envIntensity,
    })
    setMaterial(ctx, m)
    return { dispose: () => m.dispose() }
  },

  glass(cfg, ctx) {
    const uniforms = {
      uTime: { value: 0 },
      uRim: { value: cfg.rim },
      uPrism: { value: cfg.prism },
      uGlint: { value: cfg.glint },
      uScratch: { value: cfg.scratch },
    }
    const m = new THREE.MeshPhysicalMaterial({
      name: 'jo-glass',
      color: '#ffffff',
      metalness: 0,
      roughness: cfg.roughness,
      transmission: 1,
      thickness: cfg.thickness,
      ior: cfg.ior,
      dispersion: cfg.dispersion,
      attenuationColor: new THREE.Color(cfg.attenuationColor),
      attenuationDistance: cfg.attenuationDistance,
      specularIntensity: 1,
      envMap: ctx.glassEnv || ctx.studioEnv || null,
      envMapIntensity: cfg.envIntensity,
      // NOT tone-mapped: what's refracted must match the untouched CSS photo behind it
      toneMapped: false,
    })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObjN;\nvarying vec3 vObjP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjN = normalize(objectNormal);\nvObjP = position;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
${GLASS_DECL}
${NOISE_GLSL}
#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
  #define JO_ENV(d) (textureCubeUV(envMap, envMapRotation * (inverseTransformDirection(d, viewMatrix)), 0.02).rgb * envMapIntensity)
#else
  #define JO_ENV(d) vec3(0.6, 0.75, 1.0)
#endif`,
        )
        .replace('#include <opaque_fragment>', `${GLASS_EXTRA}\n#include <opaque_fragment>`)
    }
    m.customProgramCacheKey = () => 'jo-glass-2'
    setMaterial(ctx, m)
    // clear glass shouldn't throw a dark solid shadow — keep only the soft contact shade
    for (const mesh of ctx.meshes) mesh.castShadow = false
    return {
      needsBackdrop: true,
      animated: true,
      update(time) {
        uniforms.uTime.value = time
      },
      dispose() {
        for (const mesh of ctx.meshes) mesh.castShadow = true
        m.dispose()
      },
    }
  },

  grass: shellLook,
  fuzzy: shellLook,
  cloud: shellLook,
}

/**
 * Shell texturing: the badge is drawn once as an opaque base, then N times as
 * slightly inflated copies (one InstancedMesh, instance = layer). Each layer
 * keeps only the fragments where a strand / puff reaches that height, which
 * gives real silhouette and depth — not a painted texture.
 * The grass look adds instanced 3D flowers and drifting petals (flowers.js).
 */
function shellLook(cfg, ctx) {
  const shells = Math.max(6, Math.round(cfg.shells * (ctx.isMobile ? SHELL_MOBILE_FACTOR : 1)))
  const discFlowers = cfg.flowers && cfg.flowers.density ? cfg.flowers : null // legacy flat flowers
  const shared = {
    uTime: { value: 0 },
    uWindObj: { value: new THREE.Vector3(1, 0, 0) },
  }
  const uniforms = {
    ...shared,
    uShells: { value: shells },
    uLength: { value: cfg.length },
    uSway: { value: cfg.sway ?? 0 },
    uRoot: { value: new THREE.Color(cfg.root) },
    uTip: { value: new THREE.Color(cfg.tip) },
    uTip2: { value: new THREE.Color(cfg.tip2) },
    uAO: { value: cfg.ao },
    uDensity: { value: cfg.density },
    uMinHeight: { value: cfg.minHeight ?? 0.5 },
    uThickness: { value: cfg.thickness ?? 0.35 },
    uTaper: { value: cfg.taper ?? 1 },
    uLean: { value: cfg.lean ?? 0 },
    uFlowerDensity: { value: discFlowers?.density ?? 10 },
    uFlowerAmount: { value: discFlowers?.amount ?? 0 },
    uFlowerSlice: { value: 1.2 / shells },
    uFlowerA: { value: new THREE.Color(discFlowers?.colorA ?? '#ffffff') },
    uFlowerB: { value: new THREE.Color(discFlowers?.colorB ?? '#ffffff') },
  }

  const material = new THREE.MeshStandardMaterial({
    name: `jo-shell-${cfg.kind}`,
    color: '#ffffff',
    roughness: cfg.roughness,
    metalness: 0,
    envMapIntensity: 0.6,
    // soft-edged strands are alpha-blended; layers draw inner → outer (instance order)
    transparent: true,
    depthWrite: true,
  })
  material.defines = { JO_KIND: cfg.kind, JO_FLOWERS: discFlowers ? 1 : 0 }
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SHELL_VERTEX_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SHELL_VERTEX}`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SHELL_FRAGMENT_DECL}\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${SHELL_FRAGMENT}`)
  }
  material.customProgramCacheKey = () => `jo-shell-${cfg.kind}-${discFlowers ? 1 : 0}-w`

  setMaterial(ctx, material)
  for (const mesh of ctx.meshes) mesh.renderOrder = 0 // solid base first …

  const disposers = []
  for (const mesh of ctx.meshes) {
    const inst = new THREE.InstancedMesh(mesh.geometry, material, shells)
    inst.renderOrder = 1 // … then the soft layers on top
    inst.name = `${mesh.name} shells`
    inst.frustumCulled = false
    inst.castShadow = false // only the solid base casts the shadow
    inst.receiveShadow = false
    mesh.add(inst) // inherits the badge's transform, spin and tilt
    disposers.push(() => {
      inst.removeFromParent()
      inst.dispose()
    })
  }

  // ---- 3D flowers (grass look) ------------------------------------------------
  const fl = cfg.flowers && cfg.flowers.poppies ? cfg.flowers : null
  let petals = null
  if (fl) {
    const surface = mergedSurface(ctx.meshes)
    const factor = ctx.isMobile ? 0.6 : 1
    const kinds = [
      { geo: buildPoppy(), opts: fl.poppies, seed: 11 },
      { geo: buildBabysBreath(5), opts: fl.babysBreath, seed: 23 },
    ]
    const flowerMat = createFlowerMaterial(shared, fl.sway)
    for (const k of kinds) {
      const data = scatterFlowers(surface, {
        count: Math.round(k.opts.count * factor),
        size: k.opts.size,
        colors: k.opts.colors,
        clusterScale: fl.clusterScale,
        clusterBias: fl.clusterBias,
        tallChance: fl.tallChance,
        lean: fl.lean,
        grassLength: cfg.length,
        seed: k.seed,
      })
      const geo = toBufferGeometry(k.geo)
      geo.setAttribute('iStem', new THREE.InstancedBufferAttribute(data.stem.slice(0, data.count), 1))
      geo.setAttribute('iPhase', new THREE.InstancedBufferAttribute(data.phase.slice(0, data.count), 1))
      geo.setAttribute('iTint', new THREE.InstancedBufferAttribute(data.tint.slice(0, data.count * 3), 3))
      const im = new THREE.InstancedMesh(geo, flowerMat, data.count)
      im.instanceMatrix.array.set(data.matrices.subarray(0, data.count * 16))
      im.instanceMatrix.needsUpdate = true
      im.frustumCulled = false
      im.castShadow = false
      ctx.meshes[0].add(im)
      disposers.push(() => {
        im.removeFromParent()
        im.dispose()
        geo.dispose()
      })
    }
    disposers.push(() => flowerMat.dispose())
    if (fl.drifting > 0 && ctx.scene) {
      petals = createDriftingPetals(fl, ctx, surface)
      disposers.push(() => petals.dispose())
    }
  }

  const windWorld = new THREE.Vector3(...WIND.direction).normalize()
  const inv = new THREE.Matrix4()
  return {
    animated: (cfg.sway ?? 0) > 0 || !!fl,
    update(time) {
      shared.uTime.value = time * WIND.speed
      // wind direction expressed in the badge's own (spinning) frame
      inv.copy(ctx.meshes[0].matrixWorld).invert()
      shared.uWindObj.value.copy(windWorld).transformDirection(inv)
      petals?.update(time)
    },
    dispose() {
      for (const d of disposers) d()
      material.dispose()
    },
  }
}

function toBufferGeometry(g) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(g.color, 3))
  geo.setAttribute('aStem', new THREE.BufferAttribute(g.aStem, 1))
  geo.setAttribute('aTint', new THREE.BufferAttribute(g.aTint, 1))
  geo.setIndex(new THREE.BufferAttribute(g.index, 1))
  return geo
}

/** Badge triangles (model-local space) as plain arrays, for scattering. */
function mergedSurface(meshes) {
  const P = []
  const N = []
  const I = []
  for (const m of meshes) {
    const g = m.geometry
    const base = P.length / 3
    const pa = g.attributes.position
    const na = g.attributes.normal
    for (let i = 0; i < pa.count; i++) {
      P.push(pa.getX(i), pa.getY(i), pa.getZ(i))
      N.push(na.getX(i), na.getY(i), na.getZ(i))
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) I.push(base + g.index.getX(i))
    else for (let i = 0; i < pa.count; i++) I.push(base + i)
  }
  return { position: new Float32Array(P), normal: new Float32Array(N), index: new Uint32Array(I) }
}

function createFlowerMaterial(shared, sway) {
  const m = new THREE.MeshStandardMaterial({
    name: 'jo-flowers',
    vertexColors: true,
    roughness: 0.62,
    metalness: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 0.7,
  })
  const uniforms = { ...shared, uFlowerSway: { value: sway } }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FLOWER_VERTEX_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FLOWER_VERTEX}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n${FLOWER_COLOR}`)
  }
  m.customProgramCacheKey = () => 'jo-flowers'
  return m
}

/**
 * A handful of loose petals that lift off the badge and drift away with the
 * wind, tumbling and shrinking out — then respawn from a new spot on the
 * badge. They live in world space (they don't spin with the badge): each
 * petal's start point is taken from the badge's pose at the moment it spawns.
 */
function createDriftingPetals(fl, ctx, surface) {
  const g = buildPetal()
  const geo = toBufferGeometry(g)
  const count = Math.max(0, Math.round(fl.drifting * (ctx.isMobile ? 0.6 : 1)))
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide, vertexColors: true })
  const im = new THREE.InstancedMesh(geo, mat, count)
  im.frustumCulled = false
  const colors = fl.poppies.colors.map((c) => new THREE.Color(c))
  for (let i = 0; i < count; i++) im.setColorAt(i, colors[i % colors.length])
  ctx.scene.add(im)

  const wind = new THREE.Vector3(...WIND.direction).normalize()
  const P = surface.position
  const N = surface.normal
  const vcount = P.length / 3
  const seeds = Array.from({ length: count }, (_, i) => ({
    life: 5 + ((i * 37) % 10) * 0.35,
    offset: (i / Math.max(count, 1)) * 9,
    spin: new THREE.Vector3(((i * 13) % 7) - 3, ((i * 29) % 5) - 2.5, ((i * 17) % 9) - 4).normalize(),
    cycle: -1,
    base: new THREE.Vector3(),
    scale: 1,
  }))
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const tmp = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const badge = ctx.meshes[0]

  return {
    update(time) {
      for (let i = 0; i < count; i++) {
        const s = seeds[i]
        const t = time + s.offset
        const cycle = Math.floor(t / s.life)
        if (cycle !== s.cycle) {
          // respawn at a (pseudo-random) point on the badge, lifted out of the grass, in the CURRENT pose
          s.cycle = cycle
          const v = ((i * 7919 + cycle * 104729) % vcount) * 3
          nrm.set(N[v], N[v + 1], N[v + 2])
          tmp.set(P[v], P[v + 1], P[v + 2]).addScaledVector(nrm, 0.12)
          s.base.copy(tmp).applyMatrix4(badge.matrixWorld)
          s.scale = badge.matrixWorld.getMaxScaleOnAxis()
        }
        const age = (t - cycle * s.life) / s.life // 0 → 1
        const k = s.scale
        pos.copy(s.base)
        pos.addScaledVector(wind, age * 1.8 * k)
        pos.y += (Math.sin(age * 6.0 + i) * 0.08 + age * 0.3) * k // lift and flutter
        pos.z += Math.cos(age * 4.0 + i * 1.7) * 0.07 * k
        q.setFromAxisAngle(s.spin, time * (1.5 + (i % 3)) + i)
        const fade = Math.sin(Math.PI * Math.min(1, age * 1.15)) // grow in, shrink out
        scl.setScalar(fl.poppies.size * 0.55 * k * Math.max(fade, 0.0001))
        m4.compose(pos, q, scl)
        im.setMatrixAt(i, m4)
      }
      im.instanceMatrix.needsUpdate = true
    },
    dispose() {
      im.removeFromParent()
      im.dispose()
      geo.dispose()
      mat.dispose()
    },
  }
}
