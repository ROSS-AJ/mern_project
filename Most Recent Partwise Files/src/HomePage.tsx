import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { EDITOR_URL, isSignedIn } from './router'
import { PageLink } from './LegalPages'
import { ScoreBackdrop, ScoreCredits } from './ScoreBackdrop'
import logoUrl from './assets/partwise-logo.png'

/*
 * The home page (/): the title over the moving score, then the editor's three
 * steps, each with a small looping drawing of what happens in it.
 */

const PARTS = [
  { name: 'Flute', color: '#14385f' },
  { name: 'Clarinet', color: '#315f4e' },
  { name: 'Cello', color: '#db6848' },
]
const INK = '#171917'

/**
 * Steps through a drawing's stages while it is on screen. Each stage lasts
 * durations[stage] ms, then it wraps round to 0. With reduced motion it just
 * shows the finished drawing (`still`).
 */
function useStages(durations: number[], still: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStage(still)
      return
    }
    let current = 0
    let timer: number | undefined
    const tick = () => {
      current = (current + 1) % durations.length
      setStage(current)
      timer = window.setTimeout(tick, durations[current])
    }
    const observer = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer)
      if (entry.isIntersecting) timer = window.setTimeout(tick, durations[current])
    }, { threshold: 0.3 })
    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
    // durations and still are fixed per drawing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { ref, stage }
}

/** Same numbers on every render, so the drawings don't jump. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

/** One staff of music, drawn from (0, 0): five lines, barlines and a few notes. */
function Staff({ width, seed, gap = 3.2, bars = 3 }: { width: number; seed: number; gap?: number; bars?: number }) {
  const rand = seeded(seed)
  const height = gap * 4
  const notes = Array.from({ length: bars * 4 }, (_, i) => {
    const bar = Math.floor(i / 4)
    const x = (width / bars) * bar + (width / bars) * (0.18 + (i % 4) * 0.21)
    const y = Math.round(rand() * 8) * (gap / 2)
    return { x, y }
  })
  return (
    <g>
      {[0, 1, 2, 3, 4].map((line) => (
        <line key={line} x1={0} x2={width} y1={line * gap} y2={line * gap} stroke={INK} strokeWidth={0.5} opacity={0.55} />
      ))}
      {Array.from({ length: bars + 1 }, (_, bar) => (
        <line key={bar} x1={(width / bars) * bar} x2={(width / bars) * bar} y1={0} y2={height} stroke={INK} strokeWidth={0.6} opacity={0.6} />
      ))}
      {notes.map(({ x, y }, i) => (
        <g key={i}>
          <ellipse cx={x} cy={y} rx={gap * 0.62} ry={gap * 0.44} transform={`rotate(-20 ${x} ${y})`} fill={INK} />
          <line x1={x + gap * 0.55} x2={x + gap * 0.55} y1={y} y2={y - gap * 2.6} stroke={INK} strokeWidth={0.5} />
        </g>
      ))}
    </g>
  )
}

/* The full score page the first two drawings start from: two systems of three staffs. */
const PAGE = { x: 120, y: 14, width: 200, height: 212 }
const STAFF_X = PAGE.x + 16
const STAFF_W = 168
const staffY = (system: number, part: number) => PAGE.y + 28 + system * 100 + part * 26

/** Step 1: each staff gets its player's name, one player at a time. */
function LabelDrawing() {
  const { ref, stage } = useStages([900, 700, 700, 2800], 3)
  return (
    <div ref={ref} className="home-figure">
      <svg viewBox="0 0 340 240" role="img" aria-label="A score page whose staffs are labelled Flute, Clarinet and Cello, one after another">
        <rect {...PAGE} rx={3} fill="#fffef9" stroke={INK} strokeWidth={1.5} />
        {[0, 1].map((system) =>
          PARTS.map((part, p) => {
            const on = stage >= p + 1
            const y = staffY(system, p)
            return (
              <g key={`${system}-${p}`}>
                <rect
                  className="home-fade"
                  x={PAGE.x + 6} y={y - 7} width={PAGE.width - 12} height={27} rx={3}
                  fill={part.color} opacity={on ? 0.13 : 0}
                />
                <g transform={`translate(${STAFF_X} ${y})`}>
                  <Staff width={STAFF_W} seed={system * 7 + p + 1} />
                </g>
                <g className="home-slide" style={{ opacity: on ? 1 : 0, transform: `translateX(${on ? 0 : -10}px)` }}>
                  <line x1={102} x2={PAGE.x + 6} y1={y + 6} y2={y + 6} stroke={part.color} strokeWidth={1} strokeDasharray="2 2" />
                  <rect x={18} y={y - 3} width={84} height={19} rx={9.5} fill={part.color} />
                  <text x={60} y={y + 10} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600} fontFamily="DM Sans, sans-serif">{part.name}</text>
                </g>
              </g>
            )
          }),
        )}
      </svg>
    </div>
  )
}

/** Step 2: the page comes apart and each player's staffs line up in their own column. */
function SplitDrawing() {
  const { ref, stage } = useStages([1300, 1100, 2600], 2)
  const apart = stage >= 1
  const scale = 0.58
  return (
    <div ref={ref} className="home-figure">
      <svg viewBox="0 0 340 240" role="img" aria-label="The score page splits apart and each player's staffs move into their own column">
        <rect className="home-fade" {...PAGE} x={PAGE.x - 50} rx={3} fill="#fffef9" stroke={INK} strokeWidth={1.5} opacity={apart ? 0 : 1} />
        {PARTS.map((part, p) => (
          <text
            key={part.name}
            className="home-fade"
            x={14 + p * 110 + (STAFF_W * scale) / 2} y={84} textAnchor="middle"
            fill={part.color} fontSize={11} fontWeight={700} fontFamily="DM Sans, sans-serif"
            opacity={apart ? 1 : 0}
          >
            {part.name}
          </text>
        ))}
        {[0, 1].map((system) =>
          PARTS.map((part, p) => {
            const from = `translate(${STAFF_X - 50}px, ${staffY(system, p)}px) scale(1)`
            const to = `translate(${14 + p * 110}px, ${110 + system * 40}px) scale(${scale})`
            return (
              <g key={`${system}-${p}`} className="home-move" style={{ transform: apart ? to : from, transitionDelay: apart ? `${(p * 2 + system) * 70}ms` : '0ms' }}>
                <rect x={-10} y={-7} width={STAFF_W + 20} height={27} rx={3} fill={part.color} opacity={0.13} />
                <Staff width={STAFF_W} seed={system * 7 + p + 1} />
              </g>
            )
          }),
        )}
      </svg>
    </div>
  )
}

/** Step 3: every player's music fills fresh pages and becomes its own PDF. */
function ExportDrawing() {
  const { ref, stage } = useStages([900, 1300, 900, 2600], 3)
  const rows = 6
  return (
    <div ref={ref} className="home-figure">
      <svg viewBox="0 0 340 240" role="img" aria-label="Three part pages fill with music and each becomes a PDF file">
        {PARTS.map((part, p) => {
          const x = 22 + p * 104
          const y = 22
          return (
            <g key={part.name}>
              <rect x={x} y={y} width={92} height={120} rx={3} fill="#fffef9" stroke={INK} strokeWidth={1.3} />
              <text x={x + 46} y={y + 13} textAnchor="middle" fill={part.color} fontSize={8} fontWeight={700} fontFamily="DM Sans, sans-serif">{part.name}</text>
              {Array.from({ length: rows }, (_, r) => {
                const on = stage >= 1
                return (
                  <g
                    key={r}
                    className="home-slide"
                    style={{ opacity: on ? 1 : 0, transform: `translateY(${on ? 0 : -6}px)`, transitionDelay: on ? `${r * 110 + p * 60}ms` : '0ms' }}
                  >
                    <g transform={`translate(${x + 8} ${y + 22 + r * 16})`}>
                      <Staff width={76} seed={p * 11 + r + 3} gap={1.9} bars={2} />
                    </g>
                  </g>
                )
              })}
              <g
                className="home-slide"
                style={{ opacity: stage >= 2 ? 1 : 0, transform: `translateY(${stage >= 2 ? 0 : -8}px)`, transitionDelay: stage >= 2 ? `${p * 140}ms` : '0ms' }}
              >
                <rect x={x + 6} y={158} width={80} height={24} rx={6} fill={part.color} />
                <text x={x + 40} y={174} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={600} fontFamily="DM Sans, sans-serif">{part.name}.pdf</text>
                <g transform={`translate(${x + 74} ${170})`} stroke="#fff" strokeWidth={1.3} fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M0 -5v7M-3 -1l3 3 3-3" />
                </g>
              </g>
            </g>
          )
        })}
        <g className="home-fade" opacity={stage >= 3 ? 1 : 0}>
          <text x={170} y={212} textAnchor="middle" fill={INK} fontSize={10} fontFamily="DM Sans, sans-serif" opacity={0.6}>Ready to print or send</text>
        </g>
      </svg>
    </div>
  )
}

function Step({ number, title, children, drawing }: { number: number; title: string; children: ReactNode; drawing: ReactNode }) {
  return (
    <section className="home-step">
      <div className="home-step-text">
        <span className="home-step-number">{number}</span>
        <h2>{title}</h2>
        {children}
      </div>
      {drawing}
    </section>
  )
}

const Chevron = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
)

/**
 * The bottom edge of the header's paper, torn by hand: one 240 px tile that
 * repeats across the page (it starts and ends at the same height, so the
 * repeats join up). Used as a CSS mask, so only its shape matters.
 */
const TORN_EDGE = (() => {
  const rand = seeded(7)
  const points: string[] = []
  for (let x = 0; x < 240; x += 3 + rand() * 7) points.push(`${x.toFixed(1)} ${(4 + rand() * 7).toFixed(1)}`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 12" preserveAspectRatio="none"><path d="M0 0H240V7L${points.reverse().join('L')}L0 7Z"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
})()

/** True once the page has scrolled past the top, so the header gets its paper. */
function useScrolled(threshold = 24) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}

export function HomePage() {
  const signedIn = isSignedIn()
  const scrolled = useScrolled()
  return (
    <div className="home">
      <header className={`home-header ${scrolled ? 'is-scrolled' : ''}`} style={{ '--pw-torn-edge': TORN_EDGE } as CSSProperties}>
        <span className="home-header-paper" aria-hidden="true"><span /></span>
        <PageLink to="/">
          <span className="home-brand">
            <img className="brand-mark" src={logoUrl} alt="" />
            <span>Partwise</span>
          </span>
        </PageLink>
        <nav aria-label="Main">
          <a className="home-nav-extra" href="#how">How it works</a>
          <a className="home-nav-extra" href="#about">About us</a>
          {signedIn ? <PageLink to="/dashboard">Dashboard</PageLink> : <PageLink to="/login">Log in</PageLink>}
          <a className="home-header-cta" href={EDITOR_URL}>Open editor</a>
        </nav>
      </header>

      <section className="home-hero">
        <ScoreBackdrop />
        <h1>Partwise</h1>
        <p className="home-steps-line">Label <span aria-hidden="true">·</span> Split <span aria-hidden="true">·</span> Export</p>
        <a className="home-cta" href={EDITOR_URL}>Open editor <Chevron /></a>
        <p className="home-cta-note">Works in your browser, no account needed</p>
      </section>

      <div id="how" className="home-steps">
        <Step number={1} title="Label" drawing={<LabelDrawing />}>
          <p>
            Upload your score as a PDF and list who’s playing, top to bottom, the way they appear in the score.
            Partwise reads every page and labels each staff with its player.
          </p>
          <p>Check its work as you go and fix any staff it got wrong.</p>
        </Step>
        <Step number={2} title="Split" drawing={<SplitDrawing />}>
          <p>
            Each page is cut along its staffs, and every player’s lines are pulled out of the full score and put in
            order.
          </p>
          <p>Nothing is redrawn, so the music looks exactly like your original.</p>
        </Step>
        <Step number={3} title="Export" drawing={<ExportDrawing />}>
          <p>
            Each part is laid out on fresh pages and saved as its own PDF, ready to print or send to your players.
          </p>
          <p>Sign in to save the score and come back to it later.</p>
        </Step>
      </div>

      <section id="about" className="home-about">
        <h2>About us</h2>
        <p>
          Partwise is a student class project. We built it because making parts from a full score by hand, cropping
          and pasting every line for every player, takes hours. Partwise does it in minutes, right in your browser.
        </p>
        <a className="home-cta" href={EDITOR_URL}>Open editor <Chevron /></a>
      </section>

      <footer className="home-footer">
        <span>© 2026 Partwise</span>
        <PageLink to="/terms">Terms</PageLink>
        <PageLink to="/privacy">Privacy</PageLink>
        <ScoreCredits />
      </footer>
    </div>
  )
}
