import * as THREE from 'three'
import { CAMERA, LIGHTS, LOGO, SHADOW, MOBILE_BREAKPOINT, CLOUDS, COINS } from '../config/scene.js'
import { GLASS_ENV, COIN_ENV } from './studioEnv.js'
import { computeLayout } from './layout.js'
import { loadLogo } from './logo.js'
import { createGround } from './shadow.js'
import { createCloudLayer } from './clouds.js'
import { createVideoLogo } from './videoLogo.js'
import { createCoins } from './coins/index.js'
import { createEnvironment, createStudioEnvironment, createBackdrop } from './environment.js'
import { applyLook } from './looks/index.js'

const CAMERA_DISTANCE = 20

/**
 * Imperative Three.js scene for the hero. Framework-agnostic: React mounts it
 * once and calls dispose() on unmount.
 *
 * Layers inside the single transparent canvas:
 *   1. clouds (pixel-space orthographic pass)
 *   2. logo + ground shadow (fixed off-axis perspective camera)
 * The landscape itself is a CSS background underneath — never touched here.
 *
 * @param {HTMLElement} container element that exactly covers the hero
 * @param {{ onStatus?: (s: 'loading'|'ready'|'logo-error'|'webgl-error') => void,
 *           reducedMotion?: boolean, look?: string, logoMode?: 'video'|'3d' }} options
 */
export function createHeroScene(container, { onStatus = () => {}, reducedMotion = false, look = 'bronze', logoMode = 'video' } = {}) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
  } catch (err) {
    console.warn('[hero] WebGL unavailable', err)
    onStatus('webgl-error')
    return { dispose() {}, setReducedMotion() {}, setLook() {} }
  }

  renderer.setClearColor(0x000000, 0) // fully transparent — the photo shows through
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = LIGHTS.exposure
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // PCF honours shadow.radius (soft edges)
  renderer.autoClear = false
  // Safety net: if a custom look shader fails to compile on some GPU/browser,
  // drop the custom code from the badge's materials (plain PBR still renders)
  // instead of letting the logo disappear.
  let shaderFallbackDone = false
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    console.error('[hero] shader compile error', gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs), gl.getProgramInfoLog(program))
    if (shaderFallbackDone || !rig) return
    shaderFallbackDone = true
    rig.pivot.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of mats) {
        m.onBeforeCompile = () => {}
        m.customProgramCacheKey = () => `${m.name}-safe`
        m.needsUpdate = true
      }
      if (o.isInstancedMesh && o.name.endsWith('shells')) o.visible = false
    })
  }

  const canvas = renderer.domElement
  canvas.className = 'hero__canvas'
  canvas.setAttribute('aria-hidden', 'true')
  container.appendChild(canvas)

  // ---- scene, camera, lights ------------------------------------------------
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 200)
  camera.position.set(0, 0, CAMERA_DISTANCE) // fixed forever; only the projection adapts on resize

  // reflections come from the landscape photo itself (studio env until it loads)
  const env = createEnvironment(renderer)
  scene.environment = env.texture
  // studio HDRI reflected by the metal / glass looks (like the reference renders)
  let studio = null
  let glassEnv = null
  let coinEnv = null
  try {
    coinEnv = createStudioEnvironment(renderer, COIN_ENV) // warm studio light for the $ coins
    studio = createStudioEnvironment(renderer)
    glassEnv = createStudioEnvironment(renderer, GLASS_ENV) // daylight sky studio for the glass
  } catch (err) {
    console.warn('[hero] studio environment unavailable, using landscape reflections', err)
  }
  const backdrop = createBackdrop() // only used by the glass look (refraction source)
  scene.add(backdrop.mesh)
  env.ready.then(() => {
    if (disposed) return
    scene.environment = env.texture
    backdrop.setImage(env.photo)
    dirty = true
  })

  const hemi = new THREE.HemisphereLight(LIGHTS.hemi.sky, LIGHTS.hemi.ground, LIGHTS.hemi.intensity)
  scene.add(hemi)

  const anchorObj = new THREE.Object3D() // world position of the ground-contact point
  scene.add(anchorObj)

  const key = new THREE.DirectionalLight(LIGHTS.key.color, LIGHTS.key.intensity)
  key.castShadow = true
  key.shadow.mapSize.set(SHADOW.mapSize, SHADOW.mapSize)
  key.shadow.radius = SHADOW.castSoftness
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  key.target = anchorObj
  scene.add(key)

  const fill = new THREE.DirectionalLight(LIGHTS.fill.color, LIGHTS.fill.intensity)
  fill.target = anchorObj
  scene.add(fill)

  const ground = createGround()
  scene.add(ground.group)

  const clouds = createCloudLayer()
  const videoScene = new THREE.Scene() // pixel-space layer for the video logo (shares the cloud camera)
  let videoLogo = null
  const coins = COINS.enabled ? createCoins({ scene, camera, envMap: coinEnv?.texture ?? studio?.texture ?? null }) : null

  // ---- state ----------------------------------------------------------------
  let rig = null
  let currentLook = null
  let lookName = look
  let layout = null
  let reduced = reducedMotion
  let spin = 0
  let cloudTime = 0
  let dirty = true
  let disposed = false
  const clock = new THREE.Clock()
  const abort = new AbortController()

  // ---- layout ---------------------------------------------------------------
  function applyLayout() {
    const width = container.clientWidth
    const height = container.clientHeight
    if (!width || !height) return
    layout = computeLayout(width, height)

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(width, height, false)

    // Off-axis projection: optical centre sits at the configured eye level.
    // Focal length (px) is derived from the vertical FOV over the hero height.
    const focalPx = height / 2 / Math.tan(THREE.MathUtils.degToRad(CAMERA.fov) / 2)
    const eyeY = layout.eyeLevelY
    const fullH = 2 * Math.max(eyeY, height - eyeY)
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(fullH / 2 / focalPx))
    camera.aspect = width / fullH
    camera.setViewOffset(width, fullH, 0, fullH / 2 - eyeY, width, height)
    camera.updateProjectionMatrix()

    // world units per pixel on the z = 0 plane
    const k = CAMERA_DISTANCE / focalPx
    const ax = (layout.anchor.x - width / 2) * k
    const ay = (eyeY - layout.anchor.y) * k
    anchorObj.position.set(ax, ay, 0)
    ground.group.position.set(ax, ay, 0)

    if (rig) {
      const s = (layout.logoHeightPx * k) / rig.height
      rig.pivot.scale.setScalar(s)
      rig.pivot.position.set(ax, ay, 0)
      const logoW = rig.width * s
      ground.fit(logoW)

      // lights sized to the logo so the shadow frustum stays tight (crisp + soft)
      const r = logoW * 4
      const kp = new THREE.Vector3(...LIGHTS.key.position).normalize().multiplyScalar(r)
      key.position.copy(anchorObj.position).add(kp)
      const sc = key.shadow.camera
      sc.left = sc.bottom = -logoW * 1.6
      sc.right = sc.top = logoW * 1.6
      sc.near = r * 0.3
      sc.far = r * 2
      sc.updateProjectionMatrix()
      const fp = new THREE.Vector3(...LIGHTS.fill.position).normalize().multiplyScalar(r)
      fill.position.copy(anchorObj.position).add(fp)
    }

    if (!rig) {
      // video-logo mode: still aim the sun / fill at the hill (they light the coins)
      const r = layout.logoHeightPx * k * 4
      key.position.copy(anchorObj.position).add(new THREE.Vector3(...LIGHTS.key.position).normalize().multiplyScalar(r))
      fill.position.copy(anchorObj.position).add(new THREE.Vector3(...LIGHTS.fill.position).normalize().multiplyScalar(r))
    }
    if (coins) coins.layout(layout, k)
    if (videoLogo) videoLogo.layout(layout.anchor, layout.logoHeightPx)
    clouds.resize(layout)
    backdrop.setLayout(layout)
    dirty = true
  }

  function setLook(name) {
    lookName = name
    if (!rig) return
    currentLook?.dispose()
    currentLook = applyLook(name, {
      meshes: rig.meshes,
      studioEnv: studio?.texture,
      glassEnv: glassEnv?.texture,
      scene,
      isMobile: container.clientWidth < MOBILE_BREAKPOINT,
    })
    backdrop.mesh.visible = !!currentLook.needsBackdrop
    dirty = true
  }

  const ro = new ResizeObserver(applyLayout)
  ro.observe(container)
  applyLayout()

  // ---- logo -----------------------------------------------------------------
  onStatus('loading')

  function startVideo() {
    ground.group.visible = false // the video carries its own soft floor shadow
    videoLogo = createVideoLogo({
      onReady: () => {
        if (disposed) return
        onStatus('ready')
        dirty = true
        // Now that the logo poster is visible, upgrade the background video
        // from metadata-only to full buffering so it starts playing sooner.
        const bgVideo = container.querySelector('.hero__bgvideo')
        if (bgVideo) {
          bgVideo.preload = 'auto'
          bgVideo.load()
        }
      },
      onError: (err) => {
        if (disposed || !videoLogo) return
        console.warn('[hero] logo video unavailable, falling back to the 3D badge', err)
        videoScene.remove(videoLogo.mesh)
        videoLogo.dispose()
        videoLogo = null
        ground.group.visible = true
        start3D()
      },
    })
    videoLogo.setPlaying(!reduced)
    videoScene.add(videoLogo.mesh)
    applyLayout()
  }

  function start3D() {
  loadLogo({ signal: abort.signal })
    .then((loaded) => {
      if (disposed) {
        loaded.dispose()
        return
      }
      rig = loaded
      scene.add(rig.pivot)
      setLook(lookName)
      applyLayout()
      onStatus('ready')
    })
    .catch((err) => {
      if (err?.name === 'AbortError' || disposed) return
      console.error('[hero] logo failed to load', err)
      onStatus('logo-error')
    })
  }

  if (logoMode === 'video') startVideo()
  else start3D()

  // ---- loop -----------------------------------------------------------------
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1) // delta time; clamp after tab switches
    if (!reduced) {
      spin = (spin + dt * LOGO.spinSpeed) % (Math.PI * 2)
      cloudTime += dt
      dirty = true
    }
    if (videoLogo && !reduced) dirty = true // new video frame every tick
    if (!dirty) return
    if (rig) rig.pivot.rotation.y = LOGO.yStart + spin
    clouds.update(cloudTime)
    coins?.update(cloudTime, reduced)
    if (backdrop.mesh.visible) backdrop.setClouds(clouds.rects(), CLOUDS.opacity) // glass sees the moving clouds
    if (currentLook?.update) {
      // looks with wind (grass) need the badge's current pose; time is frozen under reduced motion
      scene.updateMatrixWorld()
      currentLook.update(cloudTime)
    }

    renderer.clear()
    renderer.render(clouds.scene, clouds.camera)
    if (videoLogo) renderer.render(videoScene, clouds.camera)
    renderer.clearDepth()
    renderer.render(scene, camera)
    dirty = false
  }
  renderer.setAnimationLoop(frame)

  function onContextLost(e) {
    e.preventDefault()
    renderer.setAnimationLoop(null)
    onStatus('webgl-error')
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  return {
    setLook,
    setReducedMotion(value) {
      reduced = value
      videoLogo?.setPlaying(!value)
      dirty = true
    },
    dispose() {
      disposed = true
      abort.abort()
      renderer.setAnimationLoop(null)
      ro.disconnect()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      currentLook?.dispose()
      videoLogo?.dispose()
      coins?.dispose()
      rig?.dispose()
      ground.dispose()
      clouds.dispose()
      backdrop.dispose()
      env.dispose()
      studio?.dispose()
      glassEnv?.dispose()
      coinEnv?.dispose()
      key.shadow.map?.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
