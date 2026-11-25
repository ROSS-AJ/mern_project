
import { useState, useEffect, useRef, type ReactNode, type FormEvent } from 'react'

import { EDITOR_URL, Redirect, isSignedIn, navigate, safeNext, usePath } from './router'

// The API, on the same address as the site ('/api'). Override with VITE_API_URL,
// e.g. '/mern/api' on the old host. In development the dev server passes /api
// on to a local server.js (vite.config.ts).
const API_BASE: string = import.meta.env.VITE_API_URL ?? '/api'

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
  | 'music'
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
  music: <><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></>,
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

const projects = [
  { title: 'Nocturne in E-flat', meta: 'Chopin · 4 players', active: true },
  { title: 'String Quartet No. 12', meta: 'Dvořák · 4 players' },
  { title: 'Piano Trio in B-flat', meta: 'Schubert · 3 players' },
]

const players = [
  { name: 'Violin I', color: '#e26745', checked: true },
  { name: 'Violin II', color: '#478bc1', checked: false },
  { name: 'Viola', color: '#9a73b5', checked: false },
  { name: 'Cello', color: '#4a9b72', checked: false },
]

function signOut() {
  localStorage.removeItem('authToken')
  localStorage.removeItem('user')
}

// /login and /register. ?next= is where to go after signing in (default: the dashboard).
function AuthScreen({ mode }: { mode: 'signin' | 'register' }) {
  const params = new URLSearchParams(window.location.search)
  const next = safeNext(params.get('next'), '/dashboard')
  const nextQuery = params.get('next') ? `?next=${encodeURIComponent(next)}` : ''
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Arriving from the link in the verification email (server.js /api/verify)
  const [authError, setAuthError] = useState(() =>
    params.get('verified') === '0' ? 'That verification link is invalid or has expired. Sign in to get a new one.' : '',
  )
  const [authMessage, setAuthMessage] = useState(() =>
    params.get('verified') === '1' ? 'Your email is verified. You can sign in now.' : '',
  )

  function switchMode(to: 'signin' | 'register') {
    setAuthError('')
    setAuthMessage('')
    navigate(`${to === 'signin' ? '/login' : '/register'}${nextQuery}`, { replace: true })
  }
  const [isLoading, setIsLoading] = useState(false)
  
  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')
    setAuthMessage('')
    setIsLoading(true)

    try {
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
          <div className="brand-mark"><Icon name="music" size={18}/></div>
          <span>Partwise</span>
        </div>

        <div className="auth-card">
          <div className="auth-intro">
            <h1>{mode === 'signin' ? 'Sign in to Partwise' : 'Create your account'}</h1>
            <p>{mode === 'signin' ? 'Continue working on your scores' : 'Sign up to keep your parts whenever you need them'}</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button className={mode === 'signin' ? 'active' : ''} onClick={() => switchMode('signin')} role="tab" aria-selected={mode === 'signin'}>Sign in</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')} role="tab" aria-selected={mode === 'register'}>Register</button>
          </div>

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
            {mode === 'signin' && (
              <label>
                <span>Username</span>
                <input type="text" placeholder="Enter your username" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} required/>
              </label>
            )}
            <label>
              <span className="password-label">Password {mode === 'signin' && <button type="button">Forgot password?</button>}</span>
              <span className="password-field">
                <input type={showPassword ? 'text' : 'password'} placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required/>
                <button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
              </span>
            </label>
            {mode === 'register' && (
              <label className="terms-row">
                <input type="checkbox" required/>
                <span>I agree to the <button type="button">Terms of Service</button> and <button type="button">Privacy Policy</button>.</span>
              </label>
            )}
            {authError && <p role="alert">{authError}</p>}
            {authMessage && <p role="status">{authMessage}</p>}
            <button className="auth-submit" type="submit" disabled={isLoading}>
              {isLoading ? (mode === 'signin' ? 'Signing in...' : 'Creating account...') : (mode === 'signin' ? 'Sign in' : 'Create account')}
              <Icon name="chevronRight" size={17}/>
            </button>
          </form>

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

function projectTitle(project: Project) {
  return project.title || project.originalName.replace(/\.pdf$/i, '') || 'Untitled score'
}

function projectDetails(project: Project, formatFileSize: (bytes: number) => string) {
  const details: string[] = []
  const players = project.partNames?.length ?? 0
  if (players > 0) details.push(`${players} player${players === 1 ? '' : 's'}`)
  if (project.pageCount) details.push(`${project.pageCount} page${project.pageCount === 1 ? '' : 's'}`)
  details.push(formatFileSize(project.size))
  details.push(`edited ${new Date(project.updatedAt ?? project.createdAt).toLocaleDateString()}`)
  return details.join(' · ')
}

function DashboardScreen() {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const token = localStorage.getItem('authToken')

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
  }, [token])

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')

    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const isProjectFile = /\.partwise$/i.test(file.name)

    if (!isPdf && !isProjectFile) {
      setError('Please select a PDF or a .partwise project file.')
      event.target.value = ''
      return
    }

    if (file.size > 30 * 1024 * 1024) {
      setError('The file must be smaller than 30 MB.')
      event.target.value = ''
      return
    }

    if (!token) {
      setError('Please sign in before uploading a project.')
      return
    }

    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'PDF upload failed.')
      }

      setProjects((current) => [data.project, ...current])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF upload failed.')
    } finally {
      setIsUploading(false)
      event.target.value = ''
    }
  }

  // Opens the project in the score editor, which loads it from the API
  // with the same sign-in and saves changes back to it.
  function handleOpenProject(project: Project) {
    const projectId = project._id || project.id
    if (!projectId) return
    window.location.href = `${EDITOR_URL}?project=${encodeURIComponent(projectId)}`
  }

  // Shows the score PDF in a new tab
  async function handleViewPdf(project: Project) {
    const projectId = project._id || project.id
    if (!projectId || !token) return

    // Open the tab right away so the browser doesn't block it as a pop-up
    const newTab = window.open('', '_blank')
    if (!newTab) {
      setError('Please allow pop-ups to view the PDF.')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/file`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Could not open this PDF.')
      }

      const pdfUrl = URL.createObjectURL(await response.blob())
      newTab.location.href = pdfUrl
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000)
    } catch (err) {
      newTab.close()
      setError(err instanceof Error ? err.message : 'Could not open this PDF.')
    }
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

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${projectTitle(project).replace(/[\\/:*?"<>|]+/g, '').trim() || 'score'}.partwise`
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
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
          <span className="dashboard-brand-mark">♫</span>
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
                <div className="dashboard-empty-icon">♫</div>

                <div className="dashboard-project-text">
                  <h3>{projectTitle(project)}</h3>
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
                    title="Open the score PDF in a new tab"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleViewPdf(project)
                    }}
                  >
                    View PDF
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
            <div className="dashboard-empty-icon">♫</div>
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
    case '/dashboard':
      return isSignedIn() ? <DashboardScreen /> : <Redirect to="/login?next=/dashboard" />
    default:
      // No home page yet: / (and anything unknown) goes to the dashboard or sign-in
      return <Redirect to={isSignedIn() ? '/dashboard' : '/login'} />
  }
}
