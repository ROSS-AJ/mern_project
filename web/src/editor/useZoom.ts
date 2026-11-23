// Zooming and panning the page, the way design tools do it:
//   - pinch on a trackpad, or Ctrl/Cmd + scroll wheel: zoom around the pointer
//   - Ctrl/Cmd + =/-, or plain +/-: zoom around the middle of the view
//   - Ctrl/Cmd + 0: back to fit width
//   - hold Space and drag, or drag with the middle mouse button: pan
//
// The page stays put under the pointer while zooming: before the size
// changes, we remember which fraction of the page is under the pointer, and
// after layout we scroll so that same spot is back under it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

/** 1 = fit to width. */
const MIN_ZOOM = 0.4;
/** Largest page width in CSS pixels (about 500% of a letter page at 96 dpi). */
const MAX_PAGE_WIDTH = 4200;
/** Letter page at 100% (8.5 in x 96 px/in). */
export const ACTUAL_SIZE_WIDTH = 816;

interface Anchor {
  fx: number;
  fy: number;
  clientX: number;
  clientY: number;
}

export function useZoom(scroller: RefObject<HTMLDivElement | null>, contentSelector: string, fitWidth: number) {
  const [zoom, setZoom] = useState(1);
  const anchor = useRef<Anchor | null>(null);
  const maxZoom = Math.max(1, MAX_PAGE_WIDTH / Math.max(1, fitWidth));
  const pageWidth = Math.round(fitWidth * Math.min(zoom, maxZoom));

  const zoomBy = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const element = scroller.current;
      const content = element?.querySelector(contentSelector);
      if (element && content) {
        const view = element.getBoundingClientRect();
        const box = content.getBoundingClientRect();
        const x = clientX ?? view.left + view.width / 2;
        const y = clientY ?? view.top + view.height / 2;
        anchor.current = { fx: (x - box.left) / box.width, fy: (y - box.top) / box.height, clientX: x, clientY: y };
      }
      setZoom((z) => Math.min(maxZoom, Math.max(MIN_ZOOM, z * factor)));
    },
    [scroller, contentSelector, maxZoom],
  );

  const setZoomTo = useCallback(
    (value: number) => {
      anchor.current = null;
      setZoom(Math.min(maxZoom, Math.max(MIN_ZOOM, value)));
    },
    [maxZoom],
  );

  // Keep the anchored spot under the pointer after the size change.
  useLayoutEffect(() => {
    const a = anchor.current;
    const element = scroller.current;
    const content = element?.querySelector(contentSelector);
    if (!a || !element || !content) return;
    anchor.current = null;
    const box = content.getBoundingClientRect();
    element.scrollLeft += box.left + a.fx * box.width - a.clientX;
    element.scrollTop += box.top + a.fy * box.height - a.clientY;
  }, [pageWidth, scroller, contentSelector]);

  // Pinch (Chrome/Edge/Firefox send it as Ctrl + wheel) and Ctrl/Cmd + wheel.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); // stop the browser zooming the whole app
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomBy(Math.exp(-delta * 0.0045), event.clientX, event.clientY);
    };
    // Safari reports trackpad pinches as gesture events instead.
    let lastScale = 1;
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as Event & { scale: number; clientX: number; clientY: number };
      zoomBy(gesture.scale / lastScale, gesture.clientX, gesture.clientY);
      lastScale = gesture.scale;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('gesturestart', onGestureStart);
    element.addEventListener('gesturechange', onGestureChange);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('gesturestart', onGestureStart);
      element.removeEventListener('gesturechange', onGestureChange);
    };
  }, [scroller, zoomBy]);

  // Keyboard zoom.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.matches('input, textarea, select')) return;
      const mod = event.ctrlKey || event.metaKey;
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        zoomBy(1.25);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        zoomBy(0.8);
      } else if (mod && event.key === '0') {
        event.preventDefault();
        setZoomTo(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomBy, setZoomTo]);

  // ---------- panning ----------
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.code !== 'Space' || (target instanceof Element && target.matches('input, textarea, select, button'))) return;
      event.preventDefault(); // otherwise Space scrolls the page
      setSpaceDown(true);
    };
    const up = (event: KeyboardEvent) => event.code === 'Space' && setSpaceDown(false);
    const blur = () => setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const panHandlers = {
    onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!(spaceDown || event.button === 1)) return;
      const element = scroller.current!;
      event.preventDefault();
      event.stopPropagation(); // don't let the page start a selection or a box
      element.setPointerCapture(event.pointerId);
      pan.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
      setPanning(true);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = pan.current;
      if (!start) return;
      const element = scroller.current!;
      element.scrollLeft = start.left - (event.clientX - start.x);
      element.scrollTop = start.top - (event.clientY - start.y);
    },
    onPointerUp: () => {
      pan.current = null;
      setPanning(false);
    },
  };

  return {
    pageWidth,
    /** Percent of actual size (a letter page at 96 dpi), for display. */
    percent: Math.round((pageWidth / ACTUAL_SIZE_WIDTH) * 100),
    isFit: Math.abs(zoom - 1) < 0.001,
    zoomBy,
    fit: () => setZoomTo(1),
    actualSize: () => setZoomTo(ACTUAL_SIZE_WIDTH / Math.max(1, fitWidth)),
    panHandlers,
    panReady: spaceDown,
    panning,
  };
}
