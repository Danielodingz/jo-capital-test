import { Inter_Tight, Instrument_Serif } from 'next/font/google'
import { preload, prefetchDNS } from 'react-dom'
import '../styles.css'

// Self-hosted by Next.js at build time (no request to Google from visitors' browsers)
const sans = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' })
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--font-serif', display: 'swap' })

export const metadata = {
  title: 'JO Capital — Coming soon',
  description: 'JO Capital — coming soon.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#a9d3f2',
}

export default function RootLayout({ children }) {
  // Preload critical above-the-fold assets so the browser fetches them ASAP,
  // well before React hydrates and the 3D scene code arrives.
  preload('/images/jo-capital-landscape.jpg', { as: 'image', fetchPriority: 'high' })
  preload('/video/jo-logo-poster.png', { as: 'image' })
  preload('/video/jo-logo-packed.mp4', { as: 'video' })
  preload('/video/jo-landscape-loop.mp4', { as: 'video' })
  preload('/images/jo-logo-mark.png', { as: 'image' })
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  )
}
