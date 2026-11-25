// A tiny router: each page has its own address (/login, /dashboard, ...),
// so links, reloads and the back button work.
//
// Paths here are written from the site's root ('/dashboard'); href() adds
// the base the site is served under (BASE_URL in vite.config.ts). The editor
// is a separate app at /editor/, so links to it are full page loads.

import { useEffect, useState } from 'react'

const BASE = import.meta.env.BASE_URL

/** Full address for a site path, with the base the site is served under. */
export function href(path: string): string {
  return BASE + path.replace(/^\//, '')
}

/** Where the score editor lives. Override with VITE_EDITOR_URL. */
export const EDITOR_URL: string = import.meta.env.VITE_EDITOR_URL ?? href('/editor/')

/** The current page, without the base or a trailing slash: '/', '/login', '/dashboard'. */
export function currentPath(): string {
  const path = window.location.pathname
  const rest = path.startsWith(BASE) ? path.slice(BASE.length) : path.replace(/^\//, '')
  return '/' + rest.replace(/\/+$/, '')
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  if (path.startsWith('/editor')) {
    // The editor is its own app
    window.location.assign(href(path))
    return
  }
  window.history[options.replace ? 'replaceState' : 'pushState'](null, '', href(path))
  window.dispatchEvent(new PopStateEvent('popstate'))
  window.scrollTo(0, 0)
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener('popstate', onChange)
    // A page's <Redirect> runs before this listener exists (child effects run
    // first), so catch up with any address change that already happened.
    onChange()
    return () => window.removeEventListener('popstate', onChange)
  }, [])
  return path
}

/** Only same-site paths, so ?next= can't send people to another website. */
export function safeNext(value: string | null, fallback: string): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

export function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, { replace: true }), [to])
  return null
}

/**
 * Signed in, with a sign-in that hasn't run out. The token is a JWT; its
 * expiry is read here only to skip a sign-in that's over (the server checks
 * the token for real). An expired one is removed.
 */
export function isSignedIn(): boolean {
  try {
    const token = localStorage.getItem('authToken')
    if (!token) return false
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem('authToken')
      localStorage.removeItem('user')
      return false
    }
    return true
  } catch {
    return false
  }
}
