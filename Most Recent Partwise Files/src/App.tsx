
import { useState, useEffect, useRef, type ReactNode, type FormEvent } from 'react'

const API_BASE = 'https://lamp.rosslampdemo.com/mern/api'

// The score editor (web/ in this repo). Anyone can use it, signed in or not.
// Development: its own dev server. Production: served at /partwise/editor/
// (web: npm run build:site puts it in public/editor). Override with VITE_EDITOR_URL.
const EDITOR_URL: string =
  import.meta.env.VITE_EDITOR_URL ?? (import.meta.env.DEV ? 'http://localhost:5173/' : '/partwise/editor/')

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

const noteSets = [
  [12, 18, 32, 41, 53, 65, 74, 89, 98],
  [8, 24, 35, 47, 60, 70, 85, 94],
  [14, 27, 38, 50, 63, 77, 88, 97],
]

function Staff({ variant = 0 }: { variant?: number }) {
  const notes = noteSets[variant % noteSets.length]
  return (
    <div className="staff">
      <span className="clef">𝄞</span>
      <span className="time-signature">3<br/>4</span>
      {notes.map((left, i) => (
        <span
          key={`${left}-${i}`}
          className={`note ${i % 3 === 0 ? 'stem-down' : ''}`}
          style={{ left: `${left}%`, top: `${14 + ((i * 11 + variant * 7) % 33)}%` }}
        />
      ))}
      {[26, 55, 81].map((left) => <span key={left} className="bar-line" style={{ left: `${left}%` }} />)}
    </div>
  )
}

function ScoreSystem({ index, selected, onSelect }: { index: number; selected: boolean; onSelect: () => void }) {
  return (
    <button className={`score-system ${selected ? 'selected' : ''}`} onClick={onSelect} aria-label={`Select system ${index + 1}`}>
      <span className="system-label">{index + 1}</span>
      <div className="brace">⎧<br/>⎨<br/>⎩</div>
      <div className="staves">
        <Staff variant={index} />
        <Staff variant={index + 1} />
        <Staff variant={index + 2} />
        <Staff variant={index + 3} />
      </div>
      {selected && <span className="selection-tag">Violin I</span>}
    </button>
  )
}

function AuthScreen({ onContinue }: { onContinue: () => void }) {
  const [mode, setMode] = useState<'signin' | 'register'>('signin')
  const [showPassword, setShowPassword] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [login, setLogin] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
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
        setAuthMessage('Account created successfully! You can now sign in.')
        setMode('signin')
        setPassword('')
      } else {
        localStorage.setItem('authToken', data.token)
        localStorage.setItem('user', JSON.stringify(data))
        onContinue()
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
            <button className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setAuthError(''); setAuthMessage('') }} role="tab" aria-selected={mode === 'signin'}>Sign in</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setAuthError(''); setAuthMessage('') }} role="tab" aria-selected={mode === 'register'}>Register</button>
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
  originalName: string
  size: number
  createdAt: string
}

function DashboardScreen({ onLogout }: { onLogout: () => void }) {
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

    if (file.type !== 'application/pdf') {
      setError('Please select a PDF file.')
      event.target.value = ''
      return
    }

    if (file.size > 25 * 1024 * 1024) {
      setError('The PDF must be smaller than 25 MB.')
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

  async function handleOpenProject(project: Project) {
    const projectId = project._id || project.id

    if (!projectId || !token) return

    // Open a tab immediately so the browser doesn't block it.
    const newTab = window.open('', '_blank')

    if (!newTab) {
      setError('Please allow pop-ups to view your PDF.')
      return
    }

    try {
      const response = await fetch(
        `${API_BASE}/projects/${projectId}/file`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      if (!response.ok) {
        throw new Error('Could not open this PDF.')
      }

      const blob = await response.blob()
      const pdfUrl = URL.createObjectURL(blob)

      newTab.location.href = pdfUrl

      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000)
    } catch (err) {
      newTab.close()
      setError(err instanceof Error ? err.message : 'Could not open PDF.')
    }
  }

  async function handleDeleteProject(project: Project) {
    const projectId = project._id || project.id

    if (!projectId || !token) return

    if (!window.confirm(`Delete "${project.originalName}"?`)) return

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
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
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
          <button className="dashboard-logout" onClick={onLogout}>
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
          <p>Upload a PDF to get started with Partwise.</p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          hidden
          onChange={handleFileUpload}
        />

        <button
          className="dashboard-upload-button"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? 'Uploading...' : 'Upload PDF'}
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

                <div>
                  <h3>{project.originalName}</h3>
                  <p>
                    {formatFileSize(project.size)} ·{' '}
                    {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>

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

function PartwiseApp() {
  const [view, setView] = useState<'auth' | 'dashboard' | 'editor'>('auth')
  const [selectedSystem, setSelectedSystem] = useState(1)
  const [selectedPlayers, setSelectedPlayers] = useState(['Violin I'])
  const [scope, setScope] = useState<'player' | 'everyone'>('player')
  const [page, setPage] = useState(12)
  const [zoom, setZoom] = useState(82)
  const [exported, setExported] = useState(false)

  function togglePlayer(name: string) {
    setSelectedPlayers((current) =>
      current.includes(name) ? current.filter((player) => player !== name) : [...current, name],
    )
  }

  if (view === 'auth') {
    return <AuthScreen onContinue={() => setView('dashboard')} />
  }

  if (view === 'dashboard') {
    return <DashboardScreen onLogout={() => setView('auth')} />
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Icon name="music" size={18}/></div>
          <span>Partwise</span>
        </div>
        <div className="document-heading">
          <button className="icon-button quiet" aria-label="Back to projects"><Icon name="arrowLeft" /></button>
          <div>
            <h1>Nocturne in E-flat</h1>
            <p>Saved just now</p>
          </div>
        </div>
        <div className="top-actions">
          <button className="button secondary"><Icon name="eye"/> Preview parts</button>
          <button className="button primary" onClick={() => setExported(true)}><Icon name="download"/> Export PDF</button>
          <button className="avatar" aria-label="Account menu" onClick={() => setView('auth')}>AM</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="project-sidebar">
          <button className="new-project"><Icon name="plus"/> New score</button>
          <div className="sidebar-section">
            <div className="section-title"><span>YOUR SCORES</span><button aria-label="More score options"><Icon name="more"/></button></div>
            <div className="project-search"><Icon name="search" size={16}/><input aria-label="Search scores" placeholder="Search scores"/></div>
            <nav className="project-list">
              {projects.map((project) => (
                <button key={project.title} className={`project-item ${project.active ? 'active' : ''}`}>
                  <span className="project-icon"><Icon name="file" size={16}/></span>
                  <span><strong>{project.title}</strong><small>{project.meta}</small></span>
                  {project.active && <Icon name="more" size={16}/>}
                </button>
              ))}
            </nav>
          </div>
          <div className="sidebar-footer">
            <div className="usage">
              <div><span>Monthly pages</span><strong>18 / 50</strong></div>
              <div className="usage-track"><span/></div>
            </div>
            <button className="upgrade"><Icon name="sparkles" size={17}/><span><strong>Unlock more pages</strong><small>Upgrade your plan</small></span></button>
          </div>
        </aside>

        <section className="editor">
          <div className="editor-toolbar">
            <div className="step-status"><span className="step-check">1</span><span>Detect score</span><span className="step-line"/><span className="step-current">2</span><strong>Assign parts</strong><span className="step-line muted"/><span className="step-number">3</span><span>Review & export</span></div>
            <div className="toolbar-controls">
              <button className="tool-button" onClick={() => setZoom(Math.max(50, zoom - 10))} aria-label="Zoom out"><Icon name="zoomOut" size={17}/></button>
              <span className="zoom-value">{zoom}%</span>
              <button className="tool-button" onClick={() => setZoom(Math.min(120, zoom + 10))} aria-label="Zoom in"><Icon name="zoomIn" size={17}/></button>
              <span className="toolbar-divider"/>
              <button className="tool-button label"><Icon name="layers" size={17}/> Overlays <Icon name="chevronDown" size={14}/></button>
            </div>
          </div>

          <div className="canvas">
            <div className="paper-wrap" style={{ transform: `scale(${zoom / 82})` }}>
              <article className="score-paper">
                <div className="score-heading">
                  <p>FRÉDÉRIC CHOPIN</p>
                  <h2>Nocturne in E-flat Major</h2>
                  <span>Op. 9, No. 2</span>
                </div>
                <div className="tempo">Andante <em>dolce</em></div>
                {[0, 1, 2, 3].map((index) => (
                  <ScoreSystem key={index} index={index} selected={selectedSystem === index} onSelect={() => setSelectedSystem(index)} />
                ))}
                <span className="page-number">12</span>
              </article>
            </div>
            <div className="page-controls">
              <button onClick={() => setPage(Math.max(1, page - 1))} aria-label="Previous page"><Icon name="chevronLeft" size={17}/></button>
              <span>Page <strong>{page}</strong> of 24</span>
              <button onClick={() => setPage(Math.min(24, page + 1))} aria-label="Next page"><Icon name="chevronRight" size={17}/></button>
            </div>
          </div>
        </section>

        <aside className="inspector">
          <div className="inspector-header">
            <div className="inspector-icon"><Icon name="music"/></div>
            <div><span>SELECTED REGION</span><h2>System {selectedSystem + 1}</h2></div>
          </div>
          <div className="confidence"><span>Detection confidence</span><strong>98% <i>High</i></strong></div>

          <section className="inspector-section">
            <label>Who should receive this music?</label>
            <div className="segment-control">
              <button className={scope === 'player' ? 'active' : ''} onClick={() => setScope('player')}><Icon name="users" size={15}/> Players</button>
              <button className={scope === 'everyone' ? 'active' : ''} onClick={() => setScope('everyone')}><Icon name="layers" size={15}/> Everyone</button>
            </div>
            {scope === 'player' ? (
              <div className="player-list">
                {players.map((player) => {
                  const checked = selectedPlayers.includes(player.name)
                  return (
                    <button key={player.name} onClick={() => togglePlayer(player.name)} className="player-row">
                      <span className={`checkbox ${checked ? 'checked' : ''}`}>{checked && '✓'}</span>
                      <span className="color-dot" style={{ background: player.color }}/>
                      <strong>{player.name}</strong>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="everyone-note"><Icon name="layers"/><p><strong>Shared with every part</strong><span>Tempo, dynamics, and other common markings will appear for all players.</span></p></div>
            )}
          </section>

          <section className="inspector-section border">
            <div className="field-heading"><label>Region type</label><button>Change</button></div>
            <div className="type-card"><span className="type-icon">𝄞</span><span><strong>Music staff</strong><small>4 connected staves</small></span></div>
          </section>

          <section className="inspector-section border tip">
            <Icon name="sparkles" size={18}/>
            <p><strong>Quick assignment</strong><span>Hold Shift and click multiple systems to assign them together.</span></p>
          </section>

          <div className="inspector-footer">
            <button className="button apply"><span>Apply assignment</span><Icon name="chevronRight" size={17}/></button>
            <p>{selectedPlayers.length || 4} {scope === 'everyone' ? 'players' : selectedPlayers.length === 1 ? 'player' : 'players'} selected</p>
          </div>
        </aside>
      </div>

      {exported && (
        <div className="toast" role="status">
          <span className="toast-icon"><Icon name="file" size={18}/></span>
          <div><strong>Parts are ready to export</strong><p>4 player parts will be combined into one PDF.</p></div>
          <button onClick={() => setExported(false)} aria-label="Dismiss">×</button>
        </div>
      )}
    </main>
  )
}

export default function App() {
  return <PartwiseApp />
}
