import { useId, useState } from 'react'
import { CONTENT } from '../content.js'
import FlowerFrame from './FlowerFrame.jsx'

/**
 * Hero email capture: a glass pill with an email field and a glass
 * "Request access +" button. Posts to the same endpoint as the navbar's
 * waitlist form (CONTENT.waitlist.endpoint).
 */
export default function EmailCapture() {
  const id = useId()
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | done | error
  const [focused, setFocused] = useState(false)
  // flowers bloom while the field is in use (focused or filled) and stay after sign-up
  const blooming = focused || email.length > 0 || state === 'done'
  const { endpoint, success } = CONTENT.waitlist

  async function submit(e) {
    e.preventDefault()
    if (!e.currentTarget.checkValidity()) {
      e.currentTarget.reportValidity()
      return
    }
    setState('sending')
    try {
      if (endpoint) {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email, source: 'hero' }),
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

  if (state === 'done') {
    return (
      <p className="capture capture--done" role="status">
        <FlowerFrame active />
        {success}
      </p>
    )
  }

  return (
    <form
      className="capture"
      onSubmit={submit}
      noValidate
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false)
      }}
    >
      <FlowerFrame active={blooming} />
      <label className="visually-hidden" htmlFor={id}>
        Email address
      </label>
      <input
        id={id}
        className="capture__input"
        type="email"
        required
        autoComplete="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (state === 'error') setState('idle')
        }}
      />
      <button type="submit" className="capture__btn" disabled={state === 'sending'}>
        <span>{state === 'sending' ? 'Sending…' : 'Request access'}</span>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="capture__plus">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {state === 'error' && (
        <span className="capture__error" role="alert">
          Something went wrong — please try again.
        </span>
      )}
    </form>
  )
}
