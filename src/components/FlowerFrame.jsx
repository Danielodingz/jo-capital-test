import { useEffect, useMemo, useRef, useState } from 'react'
import FLOWERS from './emailFlowers.json'

/**
 * Real flowers (cut from the approved reference render by
 * scripts/cut_email_flowers.py) that grow out of the email pill when active.
 *
 * The sprite is split into sprigs; each sprig is placed relative to the
 * nearest end of OUR pill and scaled by the pill's height, so the flowers keep
 * their proportions on any pill width. Each one grows out from the point where
 * it touches the pill (circular reveal + slight scale), starting at the
 * rounded ends and spreading along the edges, then sways gently.
 */
const SPRITE_URL = 'images/email-flowers.webp'
const P = FLOWERS.pill
const SRC_H = P.y1 - P.y0
const CAP_MID_RIGHT = Math.PI * (SRC_H / 2) + (P.x1 - P.x0 - SRC_H) // perimeter coord of the right cap's middle

export default function FlowerFrame({ active, max = Infinity }) {
  const ref = useRef(null)
  const [box, setBox] = useState(null)

  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return undefined
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pieces = useMemo(() => {
    if (!box) return []
    const k = box.h / SRC_H // reference px → our px
    const fullW = FLOWERS.source.w * k
    const fullH = FLOWERS.source.h * k
    return FLOWERS.pieces
      .filter((q) => {
        // on a short pill (e.g. a button) keep only sprigs that stay on their own half
        const reach = q.side === 'left' ? (q.x + q.w - P.x0) * k : (P.x1 - q.x) * k
        return reach <= box.w * 0.5 + 6
      })
      // when limited, keep the sprigs closest to the rounded ends (the fullest clusters)
      .map((q) => ({ q, dist: Math.min(q.perim, q.total - q.perim, Math.abs(q.perim - CAP_MID_RIGHT)) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, max)
      .map(({ q }, i) => {
      const left = q.side === 'left' ? (q.x - P.x0) * k : box.w - (P.x1 - q.x) * k
      const top = (q.y - P.y0) * k
      const w = q.w * k
      const h = q.h * k
      const ox = (q.ox - q.x) * k
      const oy = (q.oy - q.y) * k
      const reach = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy)) + 2
      // grow from the rounded ends outward along the edges
      const pm = q.perim
      const dist = Math.min(pm, q.total - pm, Math.abs(pm - CAP_MID_RIGHT))
      const delay = 0.04 + dist / 1250 + ((i * 37) % 7) * 0.012
      return {
        key: i,
        style: {
          left,
          top,
          width: w,
          height: h,
          backgroundImage: `url(${SPRITE_URL})`,
          backgroundSize: `${fullW}px ${fullH}px`,
          backgroundPosition: `${-q.x * k}px ${-q.y * k}px`,
          transformOrigin: `${ox}px ${oy}px`,
          '--ox': `${ox}px`,
          '--oy': `${oy}px`,
          '--reach': `${reach}px`,
          '--d': `${delay.toFixed(2)}s`,
          '--sway': `${(0.8 + ((i * 53) % 10) / 10).toFixed(2)}deg`,
          '--sway-dur': `${(3.8 + ((i * 29) % 13) / 5).toFixed(2)}s`,
        },
      }
    })
  }, [box])

  return (
    <span ref={ref} className="flowers" data-active={active ? 'true' : 'false'} aria-hidden="true">
      {pieces.map((p) => (
        <span key={p.key} className="flowers__sprig" style={p.style} />
      ))}
    </span>
  )
}
