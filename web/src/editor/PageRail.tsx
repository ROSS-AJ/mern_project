import { useEffect, useRef, useState } from 'react';
import { renderPage } from '../pdf/render.ts';
import { useEditor } from './context.ts';

function Thumb({ index }: { index: number }) {
  const { pdf } = useEditor();
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setVisible(true), { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    renderPage(pdf, index, 24 * (window.devicePixelRatio || 1), { signal: controller.signal }).then(
      (result) => result && host.current?.replaceChildren(result.canvas),
      () => undefined,
    );
    return () => controller.abort();
  }, [visible, pdf, index]);

  return <div className="thumb-image" ref={host} />;
}

export function PageRail({ current, onSelect }: { current: number; onSelect: (index: number) => void }) {
  const { doc } = useEditor();
  return (
    <nav className="rail" aria-label="Pages">
      {doc.pages.map((page, index) => {
        const review = page.systems.some((system) => system.status === 'review');
        const status = !page.detected ? 'pending' : review ? 'review' : 'ok';
        return (
          <button
            key={index}
            className={`thumb ${index === current ? 'current' : ''}`}
            onClick={() => onSelect(index)}
            aria-label={`Page ${index + 1}${review ? ', needs a check' : ''}`}
            aria-current={index === current ? 'page' : undefined}
          >
            <Thumb index={index} />
            <span className="thumb-label">
              <span className={`status-dot ${status}`} />
              {index + 1}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
