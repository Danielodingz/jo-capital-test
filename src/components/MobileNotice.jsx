import { CONTENT } from '../content.js'

/** Shown instead of the site on screens narrower than desktop. */
export default function MobileNotice() {
  return (
    <main className="mnotice">
      <div className="mnotice__bg" aria-hidden="true" style={{ backgroundImage: "url(images/jo-capital-landscape.jpg)" }} />
      <div className="mnotice__card" role="status">
        <div className="mnotice__brand">
          <img src="images/jo-logo-mark.png" alt="" width="34" height="34" />
          <span>{CONTENT.brand}</span>
        </div>
        <svg className="mnotice__icon" viewBox="0 0 48 48" width="44" height="44" aria-hidden="true">
          <rect x="5" y="9" width="38" height="25" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M18 40h12M24 34v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h1 className="mnotice__title">{CONTENT.mobile.title}</h1>
        <p className="mnotice__text">{CONTENT.mobile.text}</p>
      </div>
      <footer className="mnotice__footer">{CONTENT.footer}</footer>
    </main>
  )
}
