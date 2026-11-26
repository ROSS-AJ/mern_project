import { useEffect, useState } from 'react';
import type { SaveState } from '../../App.tsx';
import { DASHBOARD_URL, SIGN_IN_AGAIN_URL } from '../../site.ts';
import { useEditor } from './context.ts';

/** "just now", "5 min ago", "at 3:14 PM": short enough for the top bar. */
function ago(time: number, now: number): string {
  const seconds = Math.max(0, (now - time) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  return `at ${new Date(time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/** Re-renders now and then, so "just now" turns into "2 min ago". */
function useNow(every: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

/**
 * Where the project is saved, and when, for the top bar. Once it's in the
 * user's projects it links to the dashboard; when the sign-in has run out it
 * links to signing in again, which comes straight back here.
 */
export function SaveStatus({
  saveState,
  className = 'save-state',
  showDetection = false,
}: {
  saveState: SaveState;
  className?: string;
  /** Also say how far reading the score has got. */
  showDetection?: boolean;
}) {
  const { cloud, cloudSavedAt, signedIn, detection } = useEditor();
  const now = useNow(15_000);
  const detecting = showDetection && detection.running ? ` · Detecting ${detection.done}/${detection.total}` : '';

  switch (cloud) {
    case 'saving':
      return <span className={`${className} saving`} role="status">Saving to your projects…{detecting}</span>;
    case 'saved':
      return (
        <a
          className={`${className} saved`}
          role="status"
          href={DASHBOARD_URL}
          title={
            cloudSavedAt
              ? `Saved to your projects at ${new Date(cloudSavedAt).toLocaleTimeString()}. Open your dashboard`
              : 'Open your dashboard'
          }
        >
          Saved to your projects{cloudSavedAt ? ` · ${ago(cloudSavedAt, now)}` : ''}
          {detecting}
        </a>
      );
    case 'error':
      return (
        <span className={`${className} error`} role="status" title="Your changes are safe in this browser and will be saved to your projects once the server answers.">
          Can't reach the server · retrying{detecting}
        </span>
      );
    case 'signed-out':
      return (
        <a
          className={`${className} error`}
          role="status"
          href={SIGN_IN_AGAIN_URL}
          title="Your changes are safe in this browser. Sign in again and they'll be saved to your projects."
        >
          Signed out · sign in to save{detecting}
        </a>
      );
    default: {
      const label =
        saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : signedIn ? 'Only in this browser' : 'Saved in this browser';
      return (
        <span
          className={`${className} ${saveState === 'error' ? 'error' : signedIn ? 'local' : saveState}`}
          role="status"
          title={signedIn ? 'Save it to your projects to open it from your dashboard, on any computer.' : undefined}
        >
          {label}
          {detecting}
        </span>
      );
    }
  }
}
