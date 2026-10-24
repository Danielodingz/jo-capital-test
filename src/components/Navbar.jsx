import { useEffect, useId, useRef, useState } from 'react'
import { CONTENT } from '../content.js'
import { supportsBackdropSvgFilter, paintDisplacementMap } from './glassRefraction.js'
import FlowerFrame from './FlowerFrame.jsx'

/**
 * Floating frosted-glass navbar: logo · About · Contact · Join the Waitlist.
 * Every control does something real:
 *   - About / Contact open small glass panels (copy lives in content.js)
 *   - Join the Waitlist opens an email form (posts to CONTENT.waitlist.endpoint)
 * On phones the two links fold into a menu button.
 */
export default function Navbar() {
  const [panel, setPanel] = useState(null) // 'about' | 'contact' | 'waitlist' | null
  const [menuOpen, setMenuOpen] = useState(false)
  const [ctaHover, setCtaHover] = useState(false) // flowers grow out of the CTA on hover
  const lastTrigger = useRef(null)
  const pillRef = useRef(null)
  const filterId = 'jo-glass-refract'
  const [glassMap, setGlassMap] = useState(null) // { url, w, h } — Chromium only

  // Figma-style "Glass": refract the backdrop in a band just inside the edge
  useEffect(() => {
    const el = pillRef.current
    if (!el || !supportsBackdropSvgFilter()) return undefined
    let raf = 0
    const build = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width < 10 || height < 10) return
      setGlassMap({ url: paintDisplacementMap(width, height), w: Math.round(width), h: Math.round(height) })
    }
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(build)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])
  const linksRef = useRef(null)

  // soft glare that follows the pointer across the glass
  const onPillMove = (e) => {
    const el = pillRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
    el.style.setProperty('--glare', '1')
  }
  const onPillLeave = () => pillRef.current?.style.setProperty('--glare', '0')

  // glass bubble that glides to whichever link is hovered / focused
  const moveBubble = (e) => {
    const ul = linksRef.current
    if (!ul) return
    const b = e.currentTarget.getBoundingClientRect()
    const u = ul.getBoundingClientRect()
    ul.style.setProperty('--hx', `${b.left - u.left}px`)
    ul.style.setProperty('--hw', `${b.width}px`)
    ul.dataset.hover = 'true'
  }
  const hideBubble = () => {
    if (linksRef.current) linksRef.current.dataset.hover = 'false'
  }

  const open = (name) => (e) => {
    lastTrigger.current = e.currentTarget
    setMenuOpen(false)
    setPanel(name)
  }
  const close = () => {
    setPanel(null)
    lastTrigger.current?.focus?.()
  }

  return (
    <>
      <header className="nav">
        {glassMap && (
          <svg className="nav__filters" width="0" height="0" aria-hidden="true" focusable="false">
            <filter id={filterId} x="0" y="0" width={glassMap.w} height={glassMap.h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feImage href={glassMap.url} x="0" y="0" width={glassMap.w} height={glassMap.h} result="map" preserveAspectRatio="none" />
              {/* slight dispersion: red and blue bend a little differently, like real glass */}
              <feDisplacementMap in="SourceGraphic" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G" result="dR" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="22" xChannelSelector="R" yChannelSelector="G" result="dG" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale="18" xChannelSelector="R" yChannelSelector="G" result="dB" />
              <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
              <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
              <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
              <feBlend in="r" in2="g" mode="screen" result="rg" />
              <feBlend in="rg" in2="b" mode="screen" result="rgb" />
              <feGaussianBlur in="rgb" stdDeviation="0.4" />
            </filter>
          </svg>
        )}
        <nav
          className="nav__pill"
          data-refract={glassMap ? 'true' : undefined}
          style={glassMap ? { '--refract': `url(#${filterId})` } : undefined}
          aria-label="Main"
          ref={pillRef}
          onPointerMove={onPillMove}
          onPointerLeave={onPillLeave}
        >
          <a className="nav__brand" href="/" aria-label={`${CONTENT.brand} home`}>
            <span className="nav__mark" aria-hidden="true">
              <img src="images/jo-logo-mark.png" alt="" width="24" height="24" />
            </span>
            <span className="nav__name">{CONTENT.brand}</span>
          </a>

          <span className="nav__divider" aria-hidden="true" />

          <ul className="nav__links" ref={linksRef} onPointerLeave={hideBubble} onBlur={hideBubble}>
            <span className="nav__hover" aria-hidden="true" />
            <li>
              <button type="button" className="nav__link" onClick={open('about')} onPointerEnter={moveBubble} onFocus={moveBubble}>
                About
              </button>
            </li>
            <li>
              <button type="button" className="nav__link" onClick={open('contact')} onPointerEnter={moveBubble} onFocus={moveBubble}>
                Contact
              </button>
            </li>
          </ul>

          <span
            className="nav__cta-wrap"
            onPointerEnter={() => setCtaHover(true)}
            onPointerLeave={() => setCtaHover(false)}
          >
            <FlowerFrame active={ctaHover} max={7} />
            <button
              type="button"
              className="nav__cta"
              onClick={open('waitlist')}
              onFocus={(e) => e.currentTarget.matches(':focus-visible') && setCtaHover(true)}
              onBlur={() => setCtaHover(false)}
            >
              <span className="nav__cta-shine" aria-hidden="true" />
              <span className="nav__cta-label">Join the Waitlist</span>
            </button>
          </span>

          <button
            type="button"
            className="nav__menu"
            aria-expanded={menuOpen}
            aria-controls="nav-sheet"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
        </nav>

        <div id="nav-sheet" className="nav__sheet" data-open={menuOpen || undefined} hidden={!menuOpen}>
          <button type="button" onClick={open('about')}>
            About
          </button>
          <button type="button" onClick={open('contact')}>
            Contact
          </button>
        </div>
      </header>

      {panel && (
        <Panel onClose={close} title={panel === 'about' ? 'About' : panel === 'contact' ? 'Contact' : 'Join the waitlist'}>
          {panel === 'about' && <p className="panel__text">{CONTENT.about}</p>}
          {panel === 'contact' && <ContactBody onWaitlist={() => setPanel('waitlist')} />}
          {panel === 'waitlist' && <WaitlistForm />}
        </Panel>
      )}
    </>
  )
}

function ContactBody({ onWaitlist }) {
  const email = CONTENT.contactEmail
  if (email) {
    return (
      <p className="panel__text">
        {CONTENT.contactText}{' '}
        <a className="panel__link" href={`mailto:${email}`}>
          {email}
        </a>
      </p>
    )
  }
  return (
    <>
      <p className="panel__text">{CONTENT.contactFallback}</p>
      <button type="button" className="panel__btn" onClick={onWaitlist}>
        Join the waitlist
      </button>
    </>
  )
}

function WaitlistForm() {
  const id = useId()
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | done | error
  const { endpoint, intro, success } = CONTENT.waitlist

  async function submit(e) {
    e.preventDefault()
    if (!e.currentTarget.checkValidity()) return
    setState('sending')
    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email }),
        })
        if (!res.ok) throw new Error(String(res.status))
      } else {
        console.warn('[waitlist] CONTENT.waitlist.endpoint is not set — the email was not sent anywhere.')
      }
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') return <p className="panel__text panel__text--done">{success}</p>

  return (
    <form className="waitlist" onSubmit={submit} noValidate={false}>
      <p className="panel__text">{intro}</p>
      <label className="visually-hidden" htmlFor={id}>
        Email address
      </label>
      <div className="waitlist__row">
        <input
          id={id}
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
        <button type="submit" className="panel__btn" disabled={state === 'sending'}>
          {state === 'sending' ? 'Joining…' : 'Join'}
        </button>
      </div>
      {state === 'error' && (
        <p className="waitlist__error" role="alert">
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  )
}

function Panel({ title, onClose, children }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const first = ref.current?.querySelector('input, button:not(.panel__close), a')
    ;(first || ref.current)?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="panel__scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
        <div className="panel__head">
          <h2 id={titleId} className="panel__title">
            {title}
          </h2>
          <button type="button" className="panel__close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
