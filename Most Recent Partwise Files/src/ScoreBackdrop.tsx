import { useEffect, useRef } from 'react'

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
