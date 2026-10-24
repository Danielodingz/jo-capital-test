'use client'

import dynamic from 'next/dynamic'

/**
 * The whole hero (WebGL scene, background video, navbar, email field) runs in
 * the browser only: it measures the window, reads media queries and draws to a
 * canvas, so it is not rendered on the server. Until it loads, the page shows
 * the sky colour with the landscape still already visible (preloaded).
 */
const App = dynamic(() => import('../App.jsx'), {
  ssr: false,
  loading: () => (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundImage: 'url(/images/jo-capital-landscape.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: '50% 50%',
        backgroundColor: 'var(--sky-fallback, #a9d3f2)',
      }}
    />
  ),
})

export default function ClientApp() {
  return <App />
}
