import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { LANDSCAPE, CAMERA } from '../config/scene.js'
import { paintStudioEnv } from './studioEnv.js'

/**
 * Studio HDRI (see studioEnv.js) prefiltered for PBR — the "Blender studio"
 * lighting that the metal and glass looks reflect, matching the reference
 * renders. Returned texture is used as material.envMap by those looks.
 */
export function createStudioEnvironment(renderer, cfg) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const { width, height, data } = paintStudioEnv(cfg)
  // paintStudioEnv writes the top row first; DataTextures start at the bottom row
  // Half-float: linear filtering is guaranteed on every WebGL2 device (full float isn't).
  const half = new Uint16Array(data.length)
  const row = width * 4
  for (let j = 0; j < height; j++) {
    const src = j * row
    const dst = (height - 1 - j) * row
    for (let i = 0; i < row; i++) half[dst + i] = THREE.DataUtils.toHalfFloat(data[src + i])
  }
  const tex = new THREE.DataTexture(half, width, height, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.LinearSRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  const target = pmrem.fromEquirectangular(tex)
  tex.dispose()
  pmrem.dispose()
  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  }
}

/**
 * Reflection environment built from the landscape photo itself, so metallic
 * and glass looks reflect the same blue sky and green hills they sit in.
 * The photo isn't a panorama, so it is laid onto an equirectangular canvas
 * with its horizon on the equator (sky above, grass below). A neutral studio
 * environment is used until the photo has loaded.
 */
export function createEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const roomTarget = pmrem.fromScene(room, 0.04)
  room.dispose?.()

  let photoTarget = null
  const state = { texture: roomTarget.texture, photo: null }

  const ready = new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      // 1024×512 is plenty for PMREM reflections — halving the old 2048×1024
      // saves significant PMREM generation time on slower GPUs.
      const W = 1024
      const H = 512
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const ctx = c.getContext('2d')
      const scaledH = (LANDSCAPE.height / LANDSCAPE.width) * W
      // put the photo's eye-level row on the equator
      const offsetY = H / 2 - CAMERA.eyeLevelV * scaledH
      // sky colour above the photo's top edge
      ctx.fillStyle = '#8fc4ef'
      ctx.fillRect(0, 0, W, H)
      ctx.drawImage(img, 0, offsetY, W, scaledH)
      // fill anything below the photo with its bottom row (dark grass)
      if (offsetY + scaledH < H) {
        ctx.drawImage(c, 0, offsetY + scaledH - 2, W, 2, 0, offsetY + scaledH, W, H - offsetY - scaledH)
      }
      const tex = new THREE.CanvasTexture(c)
      tex.mapping = THREE.EquirectangularReflectionMapping
      tex.colorSpace = THREE.SRGBColorSpace
      photoTarget = pmrem.fromEquirectangular(tex)
      state.texture = photoTarget.texture
      state.photo = img
      tex.dispose()
      resolve(state.texture)
    }
    img.onerror = () => resolve(state.texture)
    img.src = LANDSCAPE.src
  })

  return {
    get texture() {
      return state.texture
    },
    get photo() {
      return state.photo
    },
    ready,
    dispose() {
      roomTarget.dispose()
      photoTarget?.dispose()
      pmrem.dispose()
    },
  }
}

/**
 * Invisible full-screen copy of the landscape AND the drifting clouds, aligned
 * with the CSS crop. It is drawn ONLY into Three.js's transmission buffer (the
 * colour mask is off for the normal on-screen pass), so the glass look can
 * refract the real photo and the moving clouds behind it, while the visible
 * background stays the untouched CSS image.
 */
const MAX_CLOUDS = 6
export function createBackdrop() {
  const tex = new THREE.Texture()
  tex.colorSpace = THREE.SRGBColorSpace
  const uniforms = {
    map: { value: tex },
    uViewport: { value: new THREE.Vector2(1, 1) },
    uOffset: { value: new THREE.Vector2(0, 0) },
    uDisp: { value: new THREE.Vector2(1, 1) },
    uCloudCount: { value: 0 },
    uCloudOpacity: { value: 1 },
    uCloudRect: { value: Array.from({ length: MAX_CLOUDS }, () => new THREE.Vector4(-9999, -9999, 1, 1)) },
  }
  let cloudDecl = ''
  let cloudCode = ''
  for (let i = 0; i < MAX_CLOUDS; i++) {
    uniforms[`uCloud${i}`] = { value: null }
    cloudDecl += `uniform sampler2D uCloud${i};\n`
    cloudCode += `
        if (uCloudCount > ${i}) {
          vec4 r = uCloudRect[${i}];
          vec2 cuv = (css - (r.xy - r.zw * 0.5)) / r.zw;
          if (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) {
            vec4 c = texture2D(uCloud${i}, vec2(cuv.x, 1.0 - cuv.y));
            col.rgb = mix(col.rgb, c.rgb, c.a * uCloudOpacity);
          }
        }`
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vNdc;
      void main() {
        vNdc = position.xy;
        gl_Position = vec4(position.xy, 0.9999, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec2 uViewport;
      uniform vec2 uOffset;
      uniform vec2 uDisp;
      uniform int uCloudCount;
      uniform float uCloudOpacity;
      uniform vec4 uCloudRect[${MAX_CLOUDS}];
      ${cloudDecl}
      varying vec2 vNdc;
      void main() {
        vec2 css = (vNdc * 0.5 + 0.5) * uViewport;
        css.y = uViewport.y - css.y;            // CSS pixels, y down
        vec2 uv = (css - uOffset) / uDisp;      // 0..1 across the displayed photo
        vec4 col = texture2D(map, vec2(uv.x, 1.0 - uv.y));
        ${cloudCode}
        gl_FragColor = col;
      }`,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  mesh.visible = false
  // colour writes only when rendering into an offscreen target (the transmission pass)
  mesh.onBeforeRender = (renderer) => {
    material.colorWrite = renderer.getRenderTarget() !== null
  }

  return {
    mesh,
    setImage(img) {
      if (!img) return
      tex.image = img
      tex.needsUpdate = true
    },
    setLayout(layout) {
      uniforms.uViewport.value.set(layout.width, layout.height)
      uniforms.uOffset.value.set(layout.offsetX, layout.offsetY)
      uniforms.uDisp.value.set(layout.dispW, layout.dispH)
    },
    /** @param {{texture, x, y, w, h}[]} list cloud centres/sizes in CSS px; @param {number} opacity */
    setClouds(list, opacity) {
      const n = Math.min(list.length, MAX_CLOUDS)
      uniforms.uCloudCount.value = n
      uniforms.uCloudOpacity.value = opacity
      for (let i = 0; i < n; i++) {
        uniforms[`uCloud${i}`].value = list[i].texture
        uniforms.uCloudRect.value[i].set(list[i].x, list[i].y, list[i].w, list[i].h)
      }
    },
    dispose() {
      tex.dispose()
      material.dispose()
      mesh.geometry.dispose()
    },
  }
}
