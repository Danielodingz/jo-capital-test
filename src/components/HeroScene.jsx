import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { LANDSCAPE, LOGO, VIDEO_LOGO } from '../config/scene.js'
import { computeLayout } from '../scene/layout.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { CONTENT } from '../content.js'
import GrassOverlay from './GrassOverlay.jsx'

/**
 * Hero stage = static photo (CSS) + transparent WebGL canvas (clouds + logo).
 * Both fill exactly this element, and both use computeLayout() for the crop,
 * so the 3D anchor always lands on the same spot of the photo.
 */
export default function HeroScene({ look, logoMode }) {
  const stageRef = useRef(null)
  const sceneRef = useRef(null)
  const reduced = usePrefersReducedMotion()
  const reducedRef = useRef(reduced)
  const lookRef = useRef(look)
  const [layout, setLayout] = useState(null)
  const [status, setStatus] = useState(logoMode === 'video' ? 'ready' : 'loading')
  const bgVideoRef = useRef(null)

  // background video: muted (also as a property — React doesn't always set it), paused for reduced motion
  useEffect(() => {
    const v = bgVideoRef.current
    if (!v) return undefined
    v.muted = true
    v.defaultMuted = true
    if (reduced) {
      v.pause()
      return undefined
    }
    const play = () => v.play().catch(() => {}) // autoplay blocked → poster frame stays
    play()
    window.addEventListener('pointerdown', play, { once: true, passive: true })
    return () => window.removeEventListener('pointerdown', play)
  }, [reduced])

  // Crop / anchor for the CSS background, loading hint and fallback image.
  useLayoutEffect(() => {
    const el = stageRef.current
    const update = () => {
      if (!el.clientWidth || !el.clientHeight) return
      const next = computeLayout(el.clientWidth, el.clientHeight)
      // lets the headline centre itself over the logo (see .hero__copy)
      el.parentElement?.style.setProperty('--anchor-x', `${next.anchor.x}px`)
      // top edge of the visible logo (video logo: logo spans ~11%–83% of the video frame)
      const vh = (next.logoHeightPx * VIDEO_LOGO.scale) / VIDEO_LOGO.logoFrac
      const logoTop = logoMode === 'video' ? next.anchor.y - VIDEO_LOGO.groundRow * vh + 0.11 * vh : next.anchor.y - next.logoHeightPx
      el.parentElement?.style.setProperty('--logo-top', `${logoTop}px`)
      el.parentElement?.style.setProperty('--logo-h', `${next.logoHeightPx}px`)
      setLayout(next)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Mount the Three.js scene once. The module is loaded lazily so the page
  // (photo + text) paints before the 3D code arrives.
  useEffect(() => {
    let cancelled = false
    import('../scene/createHeroScene.js')
      .then(({ createHeroScene }) => {
        if (cancelled) return
        sceneRef.current = createHeroScene(stageRef.current, {
          onStatus: setStatus,
          reducedMotion: reducedRef.current,
          look: lookRef.current,
          logoMode,
        })
      })
      .catch((err) => {
        console.error('[hero] 3D module failed to load', err)
        if (!cancelled) setStatus('webgl-error')
      })
    return () => {
      cancelled = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted once; logo mode is fixed per page load
  }, [])

  useEffect(() => {
    lookRef.current = look
    sceneRef.current?.setLook(look)
  }, [look])

  useEffect(() => {
    reducedRef.current = reduced
    sceneRef.current?.setReducedMotion(reduced)
  }, [reduced])

  const showFallback = status === 'logo-error' || status === 'webgl-error'
  const anchor = layout?.anchor
  const logoH = layout?.logoHeightPx ?? 0

  return (
    <div
      ref={stageRef}
      className="hero__stage"
      style={{
        backgroundImage: `url(${LANDSCAPE.src})`,
        backgroundPosition: layout?.cssBackgroundPosition ?? '50% 50%',
      }}
    >
      {LANDSCAPE.video && (
        // calm looping hillside video; the still frame (CSS background) shows until it plays
        <video
          ref={bgVideoRef}
          className="hero__bgvideo"
          src={LANDSCAPE.video}
          poster={LANDSCAPE.src}
          muted
          loop
          playsInline
          autoPlay={!reduced}
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
          disablePictureInPicture
          style={{ objectPosition: layout?.cssBackgroundPosition ?? '50% 50%' }}
        />
      )}

      {status === 'loading' && anchor && logoMode !== 'video' && (
        <div
          className="hero__loading"
          role="status"
          style={{ left: anchor.x, top: anchor.y - logoH * 0.5 }}
        >
          <span className="hero__loading-bar" />
          <span className="visually-hidden">Loading the JO Capital logo</span>
        </div>
      )}

      {showFallback && anchor && logoMode === 'video' && (
        // first frame of the logo video (already transparent, with its own shadow)
        <img
          className="hero__fallback-video"
          src={VIDEO_LOGO.poster}
          alt={CONTENT.logoAlt}
          style={{
            left: anchor.x,
            top: anchor.y - VIDEO_LOGO.groundRow * ((logoH * VIDEO_LOGO.scale) / VIDEO_LOGO.logoFrac),
            height: (logoH * VIDEO_LOGO.scale) / VIDEO_LOGO.logoFrac,
          }}
        />
      )}

      {showFallback && anchor && logoMode !== 'video' && (
        <div className="hero__fallback" style={{ left: anchor.x, top: anchor.y, height: logoH }}>
          <img src={LOGO.fallbackImage} alt={CONTENT.logoAlt} />
          <span className="hero__fallback-shadow" aria-hidden="true" />
        </div>
      )}

      {/* real crest grass from the photo, layered in front of the logo's base */}
      <GrassOverlay layout={layout} />
    </div>
  )
}
