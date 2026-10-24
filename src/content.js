/**
 * Editable page copy. Kept out of the 3D code on purpose.
 * Deliberately minimal: no dates, contact details, financial or performance
 * claims — add only what JO Capital has approved.
 */
export const CONTENT = {
  brand: 'JO Capital',
  headline: 'The future of trading starts here.',
  footer: `© ${new Date().getFullYear()} JO Capital`,
  logoAlt: 'JO Capital logo',
  // ---- navbar panels (edit freely; keep claims to what JO Capital has approved)
  about: 'JO Capital is building something new. We’re taking our time to get it right — join the waitlist to be the first to hear when we launch.',
  contactText: 'For enquiries, reach us at',
  contactFallback: 'We’ll share direct contact details at launch. Join the waitlist and we’ll reach out.',
  // Set to a real address to show it in the Contact panel, e.g. 'hello@jocapital.com'.
  // Left empty, the Contact panel points visitors to the waitlist instead.
  contactEmail: '',
  // ---- shown on phones / small screens (the site is desktop-only for now)
  mobile: {
    title: 'Mobile view isn’t available yet',
    text: 'JO Capital is best experienced on a larger screen. Please visit us on a desktop or laptop — the mobile experience is coming soon.',
  },
  waitlist: {
    intro: 'Be the first to know when JO Capital opens its doors.',
    success: 'You’re on the list. We’ll be in touch.',
    // POST { email } as JSON to this URL (e.g. a Formspree / Mailchimp / your API endpoint).
    // IMPORTANT: until this is set, sign-ups are NOT saved anywhere.
    endpoint: '',
  },
}
