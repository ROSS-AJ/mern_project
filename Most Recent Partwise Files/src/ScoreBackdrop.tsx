import { useEffect, useRef, useState } from 'react'

type Credit = { work: string; composer: string; engraver: string; licence: string; licenceUrl: string; source: string }
type Score = { title: string; composer: string; credit?: Credit }

/**
 * "Score credits" in the sign-in footer: the Creative Commons engravings behind
 * the background need visible credit. Reads the same list as the background
 * (public/score-backdrop/index.json, made by scripts/build-score-backdrop.mjs).
 */
const surname = (s: Score) => s.credit!.composer.split(' ').pop() ?? ''

export function ScoreCredits() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [credited, setCredited] = useState<Score[] | null>(null)
  const [publicDomain, setPublicDomain] = useState(0)

  async function open() {
    dialogRef.current?.showModal()
    if (credited) return
    try {
      const scores = (await (await fetch(`${import.meta.env.BASE_URL}score-backdrop/index.json`)).json()) as Score[]
      setCredited(scores.filter((s) => s.credit).sort((a, b) => surname(a).localeCompare(surname(b)) || a.credit!.work.localeCompare(b.credit!.work)))
      setPublicDomain(scores.filter((s) => !s.credit).length)
    } catch {
      setCredited([])
    }
  }

  return (
    <>
      <button type="button" className="auth-footer-link" onClick={open}>Score credits</button>
      <dialog
        ref={dialogRef}
        className="score-credits"
        aria-labelledby="score-credits-title"
        onClick={(event) => { if (event.target === dialogRef.current) dialogRef.current?.close() }}
      >
        <div className="score-credits-body">
          <h2 id="score-credits-title">Score credits</h2>
          <p>
            The music behind this page is the first page of real scores, engraved by volunteers for
            the <a href="https://www.mutopiaproject.org/" target="_blank" rel="noreferrer">Mutopia Project</a>.
            {publicDomain > 0 && ` ${publicDomain} of them are in the public domain. These are shared under Creative Commons licences:`}
          </p>
          {credited === null ? (
            <p className="score-credits-loading">Loading…</p>
          ) : (
            <ul>
              {credited.map((s) => (
                <li key={s.credit!.work + s.composer}>
                  <strong>{s.credit!.composer}</strong>, <a href={s.credit!.source} target="_blank" rel="noreferrer">{s.credit!.work}</a>
                  <span>
                    Engraved by {s.credit!.engraver} ·{' '}
                    <a href={s.credit!.licenceUrl} target="_blank" rel="noreferrer">{s.credit!.licence}</a>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="score-credits-note">
            Changes: the paper is removed, the page is cropped and shown faintly. These background images are
            shared under the same licences.
          </p>
          <button type="button" className="score-credits-close" onClick={() => dialogRef.current?.close()}>Close</button>
        </div>
      </dialog>
    </>
  )
}

/**
 * A faint real score behind the sign-in pages that now and then breaks into
 * dots and settles into another. Purely decorative: hidden from screen readers,
 * ignores the mouse, and starts only once the page is idle so the form shows
 * first. Strength and the clear area behind the card are set in index.css
 * (.score-backdrop); timing and dot count in scoreBackdropEngine.ts.
 */
export function ScoreBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    const begin = () => {
      import('./scoreBackdropEngine').then(({ startScoreBackdrop }) => {
        if (!cancelled && canvasRef.current) stop = startScoreBackdrop(canvasRef.current, import.meta.env.BASE_URL)
      })
    }
    const idle = window.requestIdleCallback?.(begin, { timeout: 1500 }) ?? window.setTimeout(begin, 300)
    return () => {
      cancelled = true
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle)
      else window.clearTimeout(idle)
      stop?.()
    }
  }, [])

  return <canvas ref={canvasRef} className="score-backdrop" aria-hidden="true" />
}
