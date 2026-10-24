import { useEffect, useState } from 'react'
import HeroScene from './components/HeroScene.jsx'
import LookSwitcher from './components/LookSwitcher.jsx'
import Navbar from './components/Navbar.jsx'
import EmailCapture from './components/EmailCapture.jsx'
import { CONTENT } from './content.js'
import MobileNotice from './components/MobileNotice.jsx'
import { LOOK, LOOKS, LOGO_MODE } from './config/scene.js'

function initialLook() {
  if (LOOK.allowUrlParam && typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('look')
    if (fromUrl && LOOKS[fromUrl]) return fromUrl
  }
  // review builds can preselect a look without touching config
  if (typeof window !== 'undefined' && LOOKS[window.__JO_LOOK__]) return window.__JO_LOOK__
  return LOOK.default
}

function initialLogoMode() {
  if (typeof window !== 'undefined') {
    const fromUrl = new URLSearchParams(window.location.search).get('logo')
    if (fromUrl === 'video' || fromUrl === '3d') return fromUrl
  }
  return LOGO_MODE
}

function switcherEnabled() {
  if (LOOK.showSwitcher) return true
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).has('looks') || window.__JO_LOOK_SWITCHER__ === true
}

// Desktop only for now: narrower screens get a "not available on mobile yet" notice
// (the 3D scene and videos are not even loaded there).
const DESKTOP_QUERY = '(min-width: 1024px)'

function useIsDesktop() {
  const [ok, setOk] = useState(() => typeof window === 'undefined' || window.matchMedia(DESKTOP_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const on = () => setOk(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return ok
}

export default function App() {
  const isDesktop = useIsDesktop()
  if (!isDesktop) return <MobileNotice />
  return <Site />
}

function Site() {
  const [look, setLook] = useState(initialLook)
  const [logoMode] = useState(initialLogoMode)
  const [showSwitcher] = useState(() => logoMode === '3d' && switcherEnabled())

  return (
    <main className="hero">
      <HeroScene look={look} logoMode={logoMode} />

      <Navbar />

      <section className="hero__copy">
        <EmailCapture />
        <h1 className="headline">{CONTENT.headline}</h1>
      </section>

      {showSwitcher && <LookSwitcher value={look} onChange={setLook} />}

      <footer className="hero__footer">
        <span>{CONTENT.footer}</span>
      </footer>
    </main>
  )
}
