import * as THREE from 'three'
import { VIDEO_LOGO } from '../config/scene.js'

/**
 * The supplied logo animation (stone → chrome → grass → fur), background
 * removed by scripts/key_logo_video.py and stored as a "packed alpha" MP4:
 * colour in the top half, matte in the bottom half. That plays in every
 * browser (incl. iPhone Safari), and this layer recombines the halves on the
 * GPU into a transparent logo standing on the hill.
 *
 * Also applies a light colour grade (exposure / contrast / saturation /
 * warmth / sky haze) so the studio-lit footage sits in the sunlit landscape.
 * The video is always muted (the file has no audio track either).
 */
export function createVideoLogo({ onReady, onError }) {
  const video = document.createElement('video')
  video.src = VIDEO_LOGO.src
  video.muted = true
  video.defaultMuted = true
  video.setAttribute('muted', '')
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.loop = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  // Kick off buffering immediately (browser may have already started via preload hint)
  video.load()

  const texture = new THREE.VideoTexture(video)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  // poster (first frame, already transparent) shown until the video is playing
  let posterReady = false
  const poster = new THREE.TextureLoader().load(VIDEO_LOGO.poster, () => {
    posterReady = true
    // Fire ready as soon as the poster is loaded — no need to wait for video
    // playback. The poster is preloaded from the HTML, so this is near-instant.
    markReady()
  })
  poster.colorSpace = THREE.SRGBColorSpace

  const g = VIDEO_LOGO.grade
  const uniforms = {
    uVideo: { value: texture },
    uPoster: { value: poster },
    uUsePoster: { value: 1 },
    uExposure: { value: g.exposure },
    uContrast: { value: g.contrast },
    uSaturation: { value: g.saturation },
    uWarmth: { value: g.warmth },
    uHaze: { value: g.haze },
    uHazeColor: { value: new THREE.Color(g.hazeColor) },
    uShadow: { value: VIDEO_LOGO.shadowOpacity },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uVideo;
      uniform sampler2D uPoster;
      uniform float uUsePoster;
      uniform float uExposure, uContrast, uSaturation, uWarmth, uHaze, uShadow;
      uniform vec3 uHazeColor;
      varying vec2 vUv;
      void main() {
        vec3 col;
        float a;
        if (uUsePoster > 0.5) {
          vec4 p = texture2D(uPoster, vUv);
          col = p.rgb;
          a = p.a;
        } else {
          // top half = colour, bottom half = matte (texture v runs bottom → top)
          col = texture2D(uVideo, vec2(vUv.x, 0.5 + vUv.y * 0.5)).rgb;
          a = texture2D(uVideo, vec2(vUv.x, vUv.y * 0.5)).r;
        }
        // shadow pixels are black in the colour plate: let them be tuned separately
        float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        float isShadow = 1.0 - smoothstep(0.015, 0.06, luma);
        a *= mix(1.0, uShadow, isShadow);

        // grade toward the sunlit landscape
        col *= uExposure;
        col = (col - 0.5) * uContrast + 0.5;
        col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, uSaturation);
        col *= vec3(1.0 + uWarmth, 1.0 + uWarmth * 0.35, 1.0 - uWarmth * 0.6);
        col = mix(col, uHazeColor, uHaze * (1.0 - isShadow));
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), a);
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.frustumCulled = false

  let ready = false
  let wantPlaying = true
  const markReady = () => {
    if (ready) return
    ready = true
    onReady?.()
  }
  const onPlaying = () => {
    // Seamlessly switch from poster to live video once playback starts
    uniforms.uUsePoster.value = 0
    // Also fire ready in case the poster hasn't loaded yet (unlikely but safe)
    markReady()
  }
  const onFail = () => onError?.(video.error || new Error('video failed'))
  video.addEventListener('playing', onPlaying)
  video.addEventListener('error', onFail)

  const tryPlay = () => {
    if (!wantPlaying) return
    const p = video.play()
    if (p && p.catch) p.catch(() => {}) // autoplay blocked (e.g. low-power mode): poster stays
  }
  tryPlay()
  // some browsers only allow playback after first interaction even when muted
  const kick = () => tryPlay()
  window.addEventListener('pointerdown', kick, { once: true, passive: true })
  const onVisibility = () => (document.hidden ? video.pause() : tryPlay())
  document.addEventListener('visibilitychange', onVisibility)

  return {
    mesh,
    /** place in pixel space: anchor = ground point (CSS px), logoHeightPx = visible logo height */
    layout(anchor, logoHeightPx) {
      const h = (logoHeightPx * VIDEO_LOGO.scale) / VIDEO_LOGO.logoFrac
      const w = h * VIDEO_LOGO.aspect
      mesh.scale.set(w, h, 1)
      // the video's ground (its shadow line) sits on the anchor
      const topY = anchor.y - VIDEO_LOGO.groundRow * h
      mesh.position.set(anchor.x + VIDEO_LOGO.offsetX * h, -(topY + h / 2), 0)
    },
    setPlaying(on) {
      wantPlaying = on
      if (on) tryPlay()
      else {
        video.pause()
        // reduced motion: hold the first (stone) frame
        uniforms.uUsePoster.value = 1
      }
    },
    get video() {
      return video
    },
    dispose() {
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('error', onFail)
      window.removeEventListener('pointerdown', kick)
      document.removeEventListener('visibilitychange', onVisibility)
      video.pause()
      video.removeAttribute('src')
      video.load()
      texture.dispose()
      poster.dispose()
      material.dispose()
      mesh.geometry.dispose()
    },
  }
}
