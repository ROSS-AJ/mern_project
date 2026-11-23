// In-app confirmation dialog. Native confirm() is blocked in some browsers and
// embedded webviews (it silently returns false there), so destructive actions
// ask through this instead.
//
//   if (await confirmDialog({ title: 'Remove project?', message: '…', confirmLabel: 'Remove', danger: true })) { … }
//
// <ConfirmHost /> must be mounted once (App does this).

import { useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  /** null hides the cancel button (a notice with one way forward). */
  cancelLabel?: string | null;
  /** Style the confirm button as destructive. */
  danger?: boolean;
}

interface Request extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

let show: ((request: Request) => void) | null = null;

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) {
      resolve(false);
      return;
    }
    show({ ...options, resolve });
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (next) =>
      setRequest((current) => {
        current?.resolve(false); // a newer question replaces an unanswered one
        return next;
      });
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    confirmButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        answer(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const answer = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(null);
  };

  if (!request) return null;

  return (
    <div className="dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && answer(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <h2 id="confirm-title">{request.title}</h2>
        <p id="confirm-message">{request.message}</p>
        <div className="dialog-actions">
          {request.cancelLabel !== null && (
            <button className="button" onClick={() => answer(false)}>
              {request.cancelLabel ?? 'Cancel'}
            </button>
          )}
          <button ref={confirmButton} className={`button ${request.danger ? 'danger' : 'primary'}`} onClick={() => answer(true)}>
            {request.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
