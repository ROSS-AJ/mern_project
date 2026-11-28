
import { useState, useEffect, useRef, type ReactNode, type FormEvent } from 'react'

import { EDITOR_URL, Redirect, isSignedIn, navigate, safeNext, usePath } from './router'
import logoUrl from './assets/partwise-logo.png'

// Override with VITE_API_URL (e.g. a local server.js while developing)
const API_BASE: string = import.meta.env.VITE_API_URL ?? 'https://lamp.rosslampdemo.com/mern/api'

type IconName =
  | 'arrowLeft'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'download'
  | 'eye'
  | 'file'
  | 'layers'
  | 'more'
  | 'plus'
  | 'search'
  | 'sparkles'
  | 'users'
  | 'zoomIn'
  | 'zoomOut'

const icons: Record<IconName, ReactNode> = {
  arrowLeft: <><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>,
  chevronDown: <path d="m8 10 4 4 4-4"/>,
  chevronLeft: <path d="m15 18-6-6 6-6"/>,
  chevronRight: <path d="m9 18 6-6-6-6"/>,
  download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  file: <><path d="M6 2.75h8l4 4V21H6z"/><path d="M14 2.75v4h4"/></>,
  layers: <><path d="m12 3-9 5 9 5 9-5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  sparkles: <><path d="m12 3 1.1 3.2L16 8l-2.9 1.8L12 13l-1.1-3.2L8 8l2.9-1.8L12 3Z"/><path d="m5.5 13 .7 2.1L8 16l-1.8.9L5.5 19l-.7-2.1L3 16l1.8-.9.7-2.1Z"/><path d="m18.5 14 .5 1.4 1.5.6-1.5.6-.5 1.4-.5-1.4-1.5-.6 1.5-.6.5-1.4Z"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14a5 5 0 0 1 5 5v1"/></>,
  zoomIn: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/><path d="M10.5 7.5v6M7.5 10.5h6"/></>,
  zoomOut: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/><path d="M7.5 10.5h6"/></>,
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>
}

/** The faint drifting notes from the sign-in page (styled by .auth-notes). */
function DriftingNotes({ count }: { count: number }) {
  return (
    <div className="auth-notes" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index}>{['♪', '♫', '♩', '♬', '♪', '♭'][index % 6]}</span>
      ))}
    </div>
  )
}

/**
 * Swaps the sign-in for a fresh one-hour one once it has under half an hour
 * left. Returns whether the token changed.
 */
async function refreshSignIn(): Promise<boolean> {
  const token = localStorage.getItem('authToken')
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    if (typeof payload.exp === 'number' && payload.exp * 1000 - Date.now() > 30 * 60 * 1000) return false
    const response = await fetch(`${API_BASE}/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) return false
    const data = (await response.json()) as { token?: string }
    if (!data.token || localStorage.getItem('authToken') !== token) return false
    localStorage.setItem('authToken', data.token)
    return true
  } catch {
    return false
  }
}

function signOut() {
  localStorage.removeItem('authToken')
  localStorage.removeItem('user')
}

// /login, /register, /forgot-password and /reset-password?token=.
// ?next= is where to go after signing in (default: the dashboard).
type AuthMode = 'signin' | 'register' | 'forgot' | 'reset'
const AUTH_PATHS: Record<AuthMode, string> = { signin: '/login', register: '/register', forgot: '/forgot-password', reset: '/reset-password' }
const AUTH_TEXT: Record<AuthMode, { heading: string; intro: string; submit: string; busy: string }> = {
  signin: { heading: 'Sign in to Partwise', intro: 'Continue working on your scores', submit: 'Sign in', busy: 'Signing in...' },
  register: { heading: 'Create your account', intro: 'Sign up to keep your parts whenever you need them', submit: 'Create account', busy: 'Creating account...' },
  forgot: { heading: 'Reset your password', intro: "Enter your account's email address and we'll send you a link to choose a new password.", submit: 'Send reset link', busy: 'Sending link...' },
  reset: { heading: 'Choose a new password', intro: 'Pick a new password for your Partwise account.', submit: 'Update password', busy: 'Saving...' },
}

function AuthScreen({ mode }: { mode: AuthMode }) {
  const params = new URLSearchParams(window.location.search)
  const next = safeNext(params.get('next'), '/dashboard')
  const nextQuery = params.get('next') ? `?next=${encodeURIComponent(next)}` : ''
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // From the link in the reset email (server.js /api/forgot-password)
  const resetToken = params.get('token') || ''
  // Arriving from the link in the verification email (server.js /api/verify)
  const [authError, setAuthError] = useState(() =>
    params.get('verified') === '0' ? 'That verification link is invalid or has expired. Sign in to get a new one.' : '',
  )
  const [authMessage, setAuthMessage] = useState(() =>
    params.get('verified') === '1' ? 'Your email is verified. You can sign in now.' : '',
  )

  function switchMode(to: AuthMode) {
    setAuthError('')
    setAuthMessage('')
    navigate(`${AUTH_PATHS[to]}${nextQuery}`, { replace: true })
  }

  // /forgot-password emails a reset link; /reset-password saves the new password.
  // Errors are thrown so handleAuth shows them like any other.
  async function handlePasswordReset() {
    if (mode === 'reset') {
      if (!resetToken) throw new Error('This reset link is incomplete. Request a new one below.')
      if (password.length < 8) throw new Error('Use at least 8 characters.')
      if (password !== confirmPassword) throw new Error("The two passwords don't match.")
    }
    const response = await fetch(`${API_BASE}${mode === 'forgot' ? '/forgot-password' : '/reset-password'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'forgot' ? { email } : { token: resetToken, password }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong.')
    }
    if (mode === 'forgot') {
      // The server answers the same whether or not the email has an account
      setAuthMessage('If an account uses that email, a reset link is on its way. It works for 1 hour; check your spam folder too.')
    } else {
      setPassword('')
      setConfirmPassword('')
      navigate('/login', { replace: true })
      setAuthMessage('Your password was updated. Sign in with your new password.')
    }
  }
  const [isLoading, setIsLoading] = useState(false)
  
  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    setIsLoading(true)

    try {
      if (mode === 'forgot' || mode === 'reset') {
        await handlePasswordReset()
        return
      }

      const endpoint = mode === 'register' ? '/register' : '/login'

      const body = mode === 'register'
        ? { firstName, lastName, login, password, email }
        : { login, password }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed.')
      }

      if (mode === 'register') {
        setPassword('')
        navigate(`/login${nextQuery}`, { replace: true })
        setAuthMessage(data.message || 'Account created. Check your email to verify it, then sign in.')
      } else {
        localStorage.setItem('authToken', data.token)
        localStorage.setItem('user', JSON.stringify(data))
        navigate(next, { replace: true })
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Something went wrong.',
      )
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className="auth-page">
      <section className="auth-form-side">
        <div className="auth-notes" aria-hidden="true">
          <span>♪</span>
          <span>♫</span>
          <span>♩</span>
          <span>♬</span>
          <span>♪</span>
          <span>♭</span>
          <span>♫</span>
          <span>♩</span>
          <span>♪</span>
          <span>♬</span>
          <span>♩</span>
          <span>♫</span>
          <span>♪</span>
          <span>♭</span>
          <span>♬</span>
          <span>♪</span>
          <span>♫</span>
          <span>♩</span>
          <span>♪</span>
          <span>♬</span>
          <span>♭</span>
          <span>♫</span>
          <span>♩</span>
          <span>♪</span>
          <span>♬</span>
          <span>♫</span>
          <span>♪</span>
          <span>♩</span>
          <span>♭</span>
          <span>♬</span>
          <span>♪</span>
          <span>♫</span>
          <span>♩</span>
          <span>♪</span>
          <span>♬</span>
          <span>♭</span>
          <span>♫</span>
          <span>♪</span>
          <span>♩</span>
        </div>
        <div className="auth-notes auth-notes-secondary" aria-hidden="true">
          {Array.from({ length: 40 }, (_, index) => (
            <span key={index}>{['♪', '♫', '♩', '♬', '♭'][index % 5]}</span>
          ))}
        </div>
        <div className="auth-brand">
          <img className="brand-mark" src={logoUrl} alt="" />
          <span>Partwise</span>
        </div>

        <div className="auth-card">
          <div className="auth-intro">
            <h1>{AUTH_TEXT[mode].heading}</h1>
            <p>{AUTH_TEXT[mode].intro}</p>
          </div>

          {(mode === 'signin' || mode === 'register') && (
            <div className="auth-tabs" role="tablist" aria-label="Account access">
              <button className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')} role="tab" aria-selected={mode === 'signin'}>Sign in</button>
              <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')} role="tab" aria-selected={mode === 'register'}>Register</button>
            </div>
          )}

          <form className="auth-form" onSubmit={handleAuth}>
            {mode === 'register' && (
              <>
                <label>
                  <span>First name</span>
                  <input type="text" placeholder="Alex" autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required/>
                </label>
                <label>
                  <span>Last name</span>
                  <input type="text" placeholder="Morgan" autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required/>
                </label>
                <label>
                  <span>Username</span>
                  <input type="text" placeholder="alexmorgan" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} required/>
                </label>
                <label>
                  <span>Email address</span>
                  <input type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required/>
                </label>
              </>
            )}
            {mode === 'forgot' && (
              <label>
                <span>Email address</span>
                <input type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus/>
              </label>
            )}
            {mode === 'signin' && (
              <label>
                <span>Username</span>
                <input type="text" placeholder="Enter your username" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} required/>
              </label>
            )}
            {mode !== 'forgot' && (
              <label>
                <span className="password-label">{mode === 'reset' ? 'New password' : 'Password'} {mode === 'signin' && <button type="button" onClick={() => switchMode('forgot')}>Forgot password?</button>}</span>
                <span className="password-field">
                  <input type={showPassword ? 'text' : 'password'} placeholder={mode === 'signin' ? 'Enter your password' : 'At least 8 characters'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'reset' ? 8 : undefined} required autoFocus={mode === 'reset'}/>
                  <button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
                </span>
              </label>
            )}
            {mode === 'reset' && (
              <label>
                <span>Confirm new password</span>
                <input type={showPassword ? 'text' : 'password'} placeholder="Type it again" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required/>
              </label>
            )}
            {mode === 'register' && (
              <label className="terms-row">
                <input type="checkbox" required/>
                <span>I agree to the <button type="button">Terms of Service</button> and <button type="button">Privacy Policy</button>.</span>
              </label>
            )}
            {authError && <p role="alert">{authError}</p>}
            {authMessage && <p role="status">{authMessage}</p>}
            <button className="auth-submit" type="submit" disabled={isLoading}>
              {isLoading ? AUTH_TEXT[mode].busy : AUTH_TEXT[mode].submit}
              <Icon name="chevronRight" size={17}/>
            </button>
          </form>
          {(mode === 'forgot' || mode === 'reset') && (
            <p className="auth-back">
              {mode === 'reset' && <><button type="button" onClick={() => switchMode('forgot')}>Request a new link</button> · </>}
              <button type="button" onClick={() => switchMode('signin')}>Back to sign in</button>
            </p>
          )}

          <div className="auth-divider"><span>or</span></div>
          <a className="editor-link" href={EDITOR_URL}>
            Open the editor <span>no account needed</span>
            <Icon name="chevronRight" size={17}/>
          </a>
        </div>

        <p className="auth-footer">© 2026 Partwise <span>Help</span><span>Privacy</span></p>
      </section>

    </div>
  )
}

type Project = {
  _id?: string
  id?: string
  title?: string
  originalName: string
  size: number
  pageCount?: number
  partNames?: string[]
  createdAt: string
  updatedAt?: string
}

/** Used until the server says otherwise; matches server.js's default. */
const DEFAULT_MAX_PROJECT_BYTES = 25 * 1024 * 1024

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/**
 * The file to upload, made as small as it goes without changing how the score
 * looks (see web/src/pdf/shrink.ts). A .partwise file is rewritten with its
 * PDF shrunk and deflated.
 */
async function shrinkForUpload(file: File): Promise<Blob> {
  try {
    const [{ shrinkPdf }, { readPartwiseFile, writePartwiseFile }] = await Promise.all([
      import('@editor/pdf/shrink.ts'),
      import('@editor/model/partwiseFile.ts'),
    ])
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (/\.partwise$/i.test(file.name)) {
      const saved = readPartwiseFile(bytes)
      const packed = writePartwiseFile(saved.doc, await shrinkPdf(saved.pdf), { squeezePdf: true })
      return packed.length < file.size ? new Blob([packed as BlobPart], { type: 'application/zip' }) : file
    }
    const smaller = await shrinkPdf(bytes)
    return smaller.length < file.size ? new Blob([smaller as BlobPart], { type: 'application/pdf' }) : file
  } catch {
    // Not readable here: let the server decide
    return file
  }
}

function projectTitle(project: Project) {
  return project.title || project.originalName.replace(/\.pdf$/i, '') || 'Untitled score'
}

function projectDetails(project: Project, formatFileSize: (bytes: number) => string) {
  const details: string[] = []
  const players = project.partNames?.length ?? 0
  if (players > 0) details.push(`${players} player${players === 1 ? '' : 's'}`)
  if (project.pageCount) details.push(`${project.pageCount} page${project.pageCount === 1 ? '' : 's'}`)
  details.push(formatFileSize(project.size))
  details.push(`saved ${new Date(project.updatedAt ?? project.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`)
  return details.join(' · ')
}

function DashboardScreen() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // The project being renamed, and the name being typed
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const renameCancelled = useRef(false)
  // The project whose parts are being exported, and how far it's got
  const [exporting, setExporting] = useState<{ id: string; done: number; total: number } | null>(null)
  // A file too big for the user's projects, offered to the editor instead
  const [tooBig, setTooBig] = useState<{ file: File; size: number } | null>(null)
  const [maxBytes, setMaxBytes] = useState(DEFAULT_MAX_PROJECT_BYTES)

  const token = localStorage.getItem('authToken')

  // The server says how big a project can be
  useEffect(() => {
    fetch(`${API_BASE}/limits`)
      .then((response) => response.json())
      .then((data: { maxProjectBytes?: unknown }) => {
        if (typeof data.maxProjectBytes === 'number') setMaxBytes(data.maxProjectBytes)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    async function loadProjects() {
      if (!token) {
        setError('Please sign in to view your projects.')
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch(`${API_BASE}/projects`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        // The sign-in lasts an hour; after that, sign in again and come back
        if (response.status === 401) {
          signOut()
          navigate('/login?next=/dashboard', { replace: true })
          return
        }

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Could not load projects.')
        }

        setProjects(data.projects)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load projects.')
      } finally {
        setIsLoading(false)
      }
    }

    loadProjects()
    // Loads once; refreshing the sign-in below changes the token but not the projects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the sign-in fresh while the dashboard is open, so it doesn't run out
  // under someone who's using it. Re-render afterwards to use the new token.
  const [, setSignInVersion] = useState(0)
  useEffect(() => {
    const refresh = () => void refreshSignIn().then((changed) => changed && setSignInVersion((n) => n + 1))
    refresh()
    const timer = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setTooBig(null)

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const isProjectFile = /\.partwise$/i.test(file.name)

    if (!isPdf && !isProjectFile) {
      setError('Please select a PDF or a .partwise project file.')
      return
    }

    if (!token) {
      setError('Please sign in before uploading a project.')
      return
    }

    setIsUploading(true)

    try {
      // Shrink the score first, without changing how it looks
      const upload = await shrinkForUpload(file)
      if (upload.size > maxBytes) {
        setTooBig({ file, size: upload.size })
        return
      }

      const formData = new FormData()
      formData.append('file', upload, file.name)

      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const data = await response.json()

      if (response.status === 413) {
        setTooBig({ file, size: upload.size })
        return
      }
      if (!response.ok) {
        throw new Error(data.error || 'PDF upload failed.')
      }

      setProjects((current) => [data.project, ...current])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  // Too big for the dashboard: it can still be worked on in the editor,
  // kept in this browser only
  async function handleOpenInBrowserOnly() {
    if (!tooBig) return
    try {
      const { keepInBrowser } = await import('@editor/model/handoff.ts')
      await keepInBrowser(tooBig.file)
      window.location.href = `${EDITOR_URL}?continue&from=dashboard`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this file in the editor.')
    }
  }

  async function handleRename(project: Project, title: string) {
    const projectId = project._id || project.id
    setRenaming(null)
    const name = title.trim()
    if (!projectId || !token || !name || name === projectTitle(project)) return

    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: name }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Could not rename this project.')
      }
      setProjects((current) =>
        current.map((item) => ((item._id || item.id) === projectId ? { ...item, ...data.project } : item)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename this project.')
    }
  }

  // Makes the part PDFs here in the browser, the same way the editor's
  // Export step does, from the project's layout and score
  async function handleExportParts(project: Project) {
    const projectId = project._id || project.id
    if (!projectId || !token || exporting) return

    setError('')
    setExporting({ id: projectId, done: 0, total: project.partNames?.length ?? 0 })
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [projectResponse, fileResponse, { exportPartsZip }] = await Promise.all([
        fetch(`${API_BASE}/projects/${projectId}`, { headers }),
        fetch(`${API_BASE}/projects/${projectId}/file`, { headers }),
        import('@editor/pdf/exportProject.ts'),
      ])
      if (!projectResponse.ok || !fileResponse.ok) {
        throw new Error('Could not load this project.')
      }
      const { project: full } = await projectResponse.json()
      if (!full.pageLayout) {
        throw new Error('This project has no parts yet. Open it in the editor to set them up.')
      }
      const pdf = new Uint8Array(await fileResponse.arrayBuffer())
      const { bytes, fileName } = await exportPartsZip(full.pageLayout, pdf, (done, total) =>
        setExporting({ id: projectId, done, total }),
      )
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/zip' }), fileName)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not export the parts.')
    } finally {
      setExporting(null)
    }
  }

  // Opens the project in the score editor, which loads it from the API
  // with the same sign-in and saves changes back to it.
  function handleOpenProject(project: Project) {
    const projectId = project._id || project.id
    if (!projectId) return
    window.location.href = `${EDITOR_URL}?project=${encodeURIComponent(projectId)}`
  }

  // Downloads a .partwise file: the PDF plus everything done in the editor,
  // one file that opens again in the editor or uploads here.
  async function handleDownloadProject(project: Project) {
    const projectId = project._id || project.id
    if (!projectId || !token) return

    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/export`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Could not download this project.')
      }

      downloadBlob(await response.blob(), `${projectTitle(project).replace(/[\\/:*?"<>|]+/g, '').trim() || 'score'}.partwise`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not download this project.')
    }
  }

  async function handleDeleteProject(project: Project) {
    const projectId = project._id || project.id

    if (!projectId || !token) return

    if (!window.confirm(`Delete "${projectTitle(project)}"? This can't be undone.`)) return

    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Could not delete project.')
      }

      setProjects((current) =>
        current.filter(
          (item) => (item._id || item.id) !== projectId
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete project.')
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img className="brand-mark" src={logoUrl} alt="" />
          <span>Partwise</span>
        </div>

        <div className="dashboard-actions">
          <a className="dashboard-editor-link" href={EDITOR_URL}>
            Open editor
          </a>
          <button
            className="dashboard-logout"
            onClick={() => {
              signOut()
              navigate('/login')
            }}
          >
            Log out
          </button>
        </div>
      </header>

      <section className="dashboard-welcome">
        <DriftingNotes count={20} />
        <p className="dashboard-eyebrow">YOUR MUSIC WORKSPACE</p>
        <h1>Welcome back.</h1>
        <p>Your sheet music workspace is ready.</p>
      </section>

      <section className="dashboard-upload">
        <div>
          <h2>Upload Sheet Music</h2>
          <p>Upload a PDF score, or a .partwise project file you saved from the editor.</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf,.partwise"
          hidden
          onChange={handleFileUpload}
        />

        <button
          className="dashboard-upload-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
      </section>

      {error && <p role="alert">{error}</p>}

      {tooBig && (
        <div className="dashboard-notice" role="alert">
          <p>
            <strong>{tooBig.file.name}</strong> is {formatFileSize(tooBig.size)}, and projects can hold up to{' '}
            {formatFileSize(maxBytes)}, even after shrinking it as far as it goes without lowering its quality. You can
            still work on it in the editor: it's kept in this browser, not on your dashboard.
          </p>
          <div className="dashboard-notice-actions">
            <button type="button" className="dashboard-edit-button" onClick={handleOpenInBrowserOnly}>
              Open in the editor
            </button>
            <button type="button" className="dashboard-download-button" onClick={() => setTooBig(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <section className="dashboard-projects">
        <h2>My Projects</h2>

        {isLoading ? (
          <p>Loading your projects...</p>
        ) : projects.length > 0 ? (
          <div className="dashboard-project-list">
            {projects.map((project) => (
              <div
                className="dashboard-project-item"
                key={project._id || project.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenProject(project)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleOpenProject(project)
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <div className="dashboard-project-icon"><Icon name="file" size={17} /></div>

                <div className="dashboard-project-text">
                  {renaming && renaming.id === (project._id || project.id) ? (
                    <input
                      className="dashboard-rename-input"
                      aria-label="Project name"
                      value={renaming.title}
                      autoFocus
                      maxLength={200}
                      onFocus={(event) => event.target.select()}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setRenaming({ id: renaming.id, title: event.target.value })}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        // Leaving the field saves; Escape leaves it without saving
                        if (event.key === 'Enter') event.currentTarget.blur()
                        if (event.key === 'Escape') {
                          renameCancelled.current = true
                          event.currentTarget.blur()
                        }
                      }}
                      onBlur={() => {
                        if (renameCancelled.current) {
                          renameCancelled.current = false
                          setRenaming(null)
                        } else {
                          handleRename(project, renaming.title)
                        }
                      }}
                    />
                  ) : (
                    <h3>{projectTitle(project)}</h3>
                  )}
                  <p>{projectDetails(project, formatFileSize)}</p>
                </div>

                <div className="dashboard-project-actions">
                  <button
                    type="button"
                    className="dashboard-edit-button"
                    title="Open in the score editor"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleOpenProject(project)
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="dashboard-download-button"
                    disabled={!project.partNames?.length || exporting !== null}
                    title={
                      project.partNames?.length
                        ? 'Download a PDF for each player (in a zip), made here in your browser'
                        : 'Open it in the editor and set up the players first'
                    }
                    onClick={(event) => {
                      event.stopPropagation()
                      handleExportParts(project)
                    }}
                  >
                    {exporting && exporting.id === (project._id || project.id)
                      ? `Exporting ${Math.min(exporting.done + 1, exporting.total)}/${exporting.total}…`
                      : 'Export parts'}
                  </button>
                  <button
                    type="button"
                    className="dashboard-download-button"
                    title="Rename this project"
                    onClick={(event) => {
                      event.stopPropagation()
                      setRenaming({ id: project._id || project.id || '', title: projectTitle(project) })
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="dashboard-download-button"
                    title="Download a .partwise file with the score and your work in the editor"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDownloadProject(project)
                    }}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="dashboard-delete-button"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDeleteProject(project)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-empty-state">
            <div className="dashboard-project-icon"><Icon name="file" size={17} /></div>
            <h3>No projects yet</h3>
            <p>
              Your uploaded sheet music projects will appear here.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}

export default function App() {
  const path = usePath()

  switch (path) {
    case '/login':
    case '/register': {
      // Already signed in: skip the form
      if (isSignedIn()) {
        return <Redirect to={safeNext(new URLSearchParams(window.location.search).get('next'), '/dashboard')} />
      }
      return <AuthScreen mode={path === '/login' ? 'signin' : 'register'} />
    }
    // Reachable signed in or not (e.g. opening the email link in a signed-in browser)
    case '/forgot-password':
      return <AuthScreen mode="forgot" />
    case '/reset-password':
      return <AuthScreen mode="reset" />
    case '/dashboard':
      return isSignedIn() ? <DashboardScreen /> : <Redirect to="/login?next=/dashboard" />
    default:
      // No home page yet: / (and anything unknown) goes to the dashboard or sign-in
      return <Redirect to={isSignedIn() ? '/dashboard' : '/login'} />
  }
}
