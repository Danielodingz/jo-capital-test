import { LOOKS } from '../config/scene.js'

/** Review tool: compare the logo looks. Hidden unless LOOK.showSwitcher or `?looks` is set. */
export default function LookSwitcher({ value, onChange }) {
  return (
    <nav className="looks" aria-label="Logo look">
      {Object.entries(LOOKS).map(([key, cfg]) => (
        <button
          key={key}
          type="button"
          className="looks__btn"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {cfg.label}
        </button>
      ))}
    </nav>
  )
}
