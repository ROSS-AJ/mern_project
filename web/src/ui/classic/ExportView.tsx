import { useEffect, useMemo, useRef, useState } from 'react';
import { partShapes } from '../../engine/crop.ts';
import type { Id } from '../../model/types.ts';
import { allSystems } from '../../model/types.ts';
import { buildPartsPdf, downloadBytes, safeFileName } from '../../pdf/exportParts.ts';
import { closePdf, loadPdf, renderPage } from '../../pdf/render.ts';
import type { PdfDocument } from '../../pdf/render.ts';
import { useEditor } from '../shared/context.ts';
import { Icon } from '../shared/Icon.tsx';

function PreviewPages({ pdf }: { pdf: PdfDocument }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const element = host.current;
    if (!element) return;
    element.replaceChildren();
    (async () => {
      for (let i = 0; i < pdf.numPages; i++) {
        const result = await renderPage(pdf, i, 80 * (window.devicePixelRatio || 1), { signal: controller.signal });
        if (!result || controller.signal.aborted) return;
        const frame = document.createElement('div');
        frame.className = 'preview-page';
        frame.append(result.canvas);
        element.append(frame);
      }
    })().catch(() => undefined);
    return () => controller.abort();
  }, [pdf]);
  return <div className="preview-pages" ref={host} />;
}

export function ExportView() {
  const { doc, pdf, pdfBytes, setStep } = useEditor();
  const [focus, setFocus] = useState<Id | null>(doc.parts[0]?.id ?? null);
  const [chosen, setChosen] = useState<Set<Id>>(() => new Set(doc.parts.map((p) => p.id)));
  const [preview, setPreview] = useState<PdfDocument | null>(null);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const systemsPerPart = useMemo(() => new Map(doc.parts.map((part) => [part.id, partShapes(doc, part.id).length])), [doc]);
  const review = allSystems(doc).filter(({ system }) => system.status === 'review').length;
  const pendingSuggestions = doc.regions.filter((r) => r.suggested).length;
  const undetected = doc.pages.filter((p) => !p.detected).length;
  const focusPart = doc.parts.find((p) => p.id === focus);

  // Preview = the real export for the focused part.
  useEffect(() => {
    if (!focus) return;
    let cancelled = false;
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const bytes = await buildPartsPdf(doc, pdfBytes, pdf, [focus]);
        const loaded = await loadPdf(bytes);
        if (cancelled) {
          closePdf(loaded);
          return;
        }
        setPreview((old) => {
          closePdf(old);
          return loaded;
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [doc, pdf, pdfBytes, focus]);

  const download = async (partIds: Id[], fileName: string) => {
    setBuilding(true);
    setError(null);
    try {
      const bytes = await buildPartsPdf(doc, pdfBytes, pdf, partIds);
      downloadBytes(bytes, fileName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuilding(false);
    }
  };

  const downloadEach = async () => {
    for (const part of doc.parts.filter((p) => chosen.has(p.id))) {
      await download([part.id], `${safeFileName(doc.title)} - ${safeFileName(part.name)}.pdf`);
    }
  };

  const chosenIds = doc.parts.filter((p) => chosen.has(p.id)).map((p) => p.id);

  return (
    <main className="export">
      <aside className="card export-parts">
        <h2>Parts</h2>
        <ul className="export-list">
          {doc.parts.map((part) => {
            const count = systemsPerPart.get(part.id) ?? 0;
            return (
              <li key={part.id} className={focus === part.id ? 'focused' : ''}>
                <input
                  type="checkbox"
                  aria-label={`Include ${part.name}`}
                  checked={chosen.has(part.id)}
                  onChange={() =>
                    setChosen((set) => {
                      const next = new Set(set);
                      if (next.has(part.id)) next.delete(part.id);
                      else next.add(part.id);
                      return next;
                    })
                  }
                />
                <button className="export-part" onClick={() => setFocus(part.id)}>
                  <span className="dot" style={{ background: part.color }} />
                  <span className="grow">{part.name || 'Untitled'}</span>
                  <small className={count === 0 ? 'warn-text' : 'muted'}>{count === 0 ? 'no music' : `${count} systems`}</small>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="stack">
          {undetected > 0 && <p className="callout"><Icon name="alert" /><span>{undetected} page(s) are still being detected.</span></p>}
          {review > 0 && (
            <button className="callout warn action" onClick={() => setStep('assign')}>
              <Icon name="alert" />
              <span>{review} system{review === 1 ? '' : 's'} still need a check. Parts may be wrong there.</span>
              <Icon name="chevronRight" />
            </button>
          )}
          {pendingSuggestions > 0 && (
            <button className="callout action" onClick={() => setStep('assign')}>
              <Icon name="sparkles" />
              <span>{pendingSuggestions} suggested shared-text region{pendingSuggestions === 1 ? ' isn’t' : 's aren’t'} accepted yet, so they're left out.</span>
              <Icon name="chevronRight" />
            </button>
          )}
        </div>

        <div className="stack">
          <button
            className="button primary full"
            disabled={building || chosenIds.length === 0}
            onClick={() => download(chosenIds, `${safeFileName(doc.title)} - parts.pdf`)}
          >
            <Icon name="download" /> Download {chosenIds.length === doc.parts.length ? 'all parts' : `${chosenIds.length} parts`} (one PDF)
          </button>
          <button className="button full" disabled={building || chosenIds.length === 0} onClick={downloadEach}>
            <Icon name="download" /> Download each as its own PDF
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </aside>

      <section className="preview">
        <div className="preview-header">
          <h2>{focusPart ? focusPart.name || 'Untitled' : 'Preview'}</h2>
          {focusPart && (
            <button
              className="button"
              disabled={building}
              onClick={() => download([focusPart.id], `${safeFileName(doc.title)} - ${safeFileName(focusPart.name)}.pdf`)}
            >
              <Icon name="download" /> Download this part
            </button>
          )}
        </div>
        {preview ? <PreviewPages pdf={preview} /> : <p className="muted">Building preview…</p>}
      </section>
    </main>
  );
}
