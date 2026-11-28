// The sign-in pages' background: the title page of a real score, very faint,
// that now and then breaks into dots and settles into the next score.
// Loaded lazily by ScoreBackdrop.tsx; the images come from
// public/score-backdrop (made by scripts/build-score-backdrop.mjs).
//
// It stays out of the way: one still image most of the time (nothing is drawn
// between changes), no change while someone is typing or the tab is hidden,
// and no motion at all for reduced-motion or data-saver users.

/** Tuning. Strength (opacity) and the clear area behind the card live in CSS. */
export const BACKDROP = {
  holdMs: 6_000,       // how long each score stays
  typingRetryMs: 4_000, // while a field has focus, check again after this
  dots: 15_000,
  flightS: 2.2,        // each dot's journey
  waveS: 0.8,          // spread of start times across the page (the shockwave)
  burstPx: 160,        // furthest a dot strays mid-flight, at 1440×900
  tiltDeg: -1.5,
};

type Score = { file: string; title: string; composer: string; width: number; height: number };
type Shown = { img: HTMLImageElement; pts: Float32Array };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (v: number) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const easeInOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

function shuffle<T>(items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return img.decode().then(() => img);
}

/** Starts the backdrop on `canvas`. Returns a function that stops it. */
export function startScoreBackdrop(canvas: HTMLCanvasElement, base: string): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const still =
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);

  let stopped = false;
  let W = 0, H = 0, DPR = 1;
  let scores: Score[] = [];
  let order: Score[] = [];
  let current: Shown | null = null;
  let next: Promise<Shown> | null = null;
  let timer = 0;
  let frame = 0;

  const url = (file: string) => `${base}score-backdrop/${file}`;

  /** Where the page sits: large, top-aligned, slightly tilted, cropped by the edges. */
  function place(g: CanvasRenderingContext2D, img: HTMLImageElement) {
    const narrow = W < 700;
    const w = narrow ? W * 1.35 : Math.max(W * 0.8, 760);
    const h = (w * img.naturalHeight) / img.naturalWidth;
    g.translate(W / 2, H * 0.06 + h / 2);
    g.rotate((BACKDROP.tiltDeg * Math.PI) / 180);
    g.drawImage(img, -w / 2, -h / 2, w, h);
  }

  function size() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, canvas.clientWidth);
    H = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  }

  /** Up to BACKDROP.dots points sitting on the ink, in CSS pixels. */
  function inkPoints(img: HTMLImageElement): Float32Array {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    place(g, img);
    const data = g.getImageData(0, 0, W, H).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 100) count++;
    const keep = Math.min(1, BACKDROP.dots / Math.max(1, count));
    const out = new Float32Array(Math.ceil(count * keep * 1.1 + 16) * 2);
    let n = 0;
    for (let y = 0, i = 3; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        if (data[i] > 100 && Math.random() < keep && n < out.length - 1) {
          out[n++] = x + Math.random();
          out[n++] = y + Math.random();
        }
      }
    }
    return out.subarray(0, n);
  }

  function drawStill(img: HTMLImageElement, alpha = 1) {
    ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx!.globalAlpha = alpha;
    place(ctx!, img);
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.globalAlpha = 1;
  }

  /** Shuffled rounds: each score once per round, never the same one twice in a row. */
  let lastPicked = '';
  function nextScore(): Score {
    if (!order.length) order = shuffle(scores.filter((s) => s.file !== lastPicked));
    const pick = order.pop() ?? scores[0];
    lastPicked = pick.file;
    return pick;
  }

  async function prepare(score: Score): Promise<Shown> {
    const img = await loadImage(url(score.file));
    return { img, pts: still ? new Float32Array() : inkPoints(img) };
  }

  /** Dots leave `from` (or fly in from a scatter when there is none) and land on `to`. */
  function morph(from: Shown | null, to: Shown) {
    const B = to.pts;
    const b = B.length / 2;
    const A = from?.pts;
    const a = A ? A.length / 2 : b;
    const N = Math.max(1, Math.min(BACKDROP.dots, Math.max(a, b)));
    const scale = Math.sqrt((W * H) / (1440 * 900));
    const fx = W * (0.25 + Math.random() * 0.5), fy = H * (0.25 + Math.random() * 0.5);
    const maxDist = Math.hypot(Math.max(fx, W - fx), Math.max(fy, H - fy));
    const sx = new Float32Array(N), sy = new Float32Array(N), tx = new Float32Array(N), ty = new Float32Array(N);
    const ang = new Float32Array(N), rad = new Float32Array(N), spin = new Float32Array(N), delay = new Float32Array(N);
    let maxDelay = 0;
    for (let i = 0; i < N; i++) {
      const pb = Math.floor(Math.random() * b);
      tx[i] = B[pb * 2]; ty[i] = B[pb * 2 + 1];
      if (A) {
        const pa = Math.floor(Math.random() * a);
        sx[i] = A[pa * 2]; sy[i] = A[pa * 2 + 1];
      } else {
        // First score: gather in from a loose scatter around where it lands.
        const t = Math.random() * Math.PI * 2, r = (40 + Math.random() * 180) * scale;
        sx[i] = tx[i] + Math.cos(t) * r; sy[i] = ty[i] + Math.sin(t) * r;
      }
      const r = Math.random();
      delay[i] = (Math.hypot(sx[i] - fx, sy[i] - fy) / maxDist) * BACKDROP.waveS + Math.random() * 0.15;
      ang[i] = Math.atan2(sy[i] - fy, sx[i] - fx) + (Math.random() - 0.5) * 1.1;
      rad[i] = (BACKDROP.burstPx * 0.2 + r * r * BACKDROP.burstPx) * scale * (A ? 1 : 0.35);
      spin[i] = (Math.random() - 0.5) * 2;
      if (delay[i] > maxDelay) maxDelay = delay[i];
    }
    const total = maxDelay + BACKDROP.flightS + 0.2;
    const start = performance.now();

    const step = (now: number) => {
      if (stopped) return;
      const t = (now - start) / 1000;
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
      // The old page dissolves into dots; the new one firms up at the end.
      if (from) drawStill(from.img, 1 - smooth(t / 0.35));
      const inImg = smooth((t - (total - 0.6)) / 0.6);
      if (inImg > 0) drawStill(to.img, inImg);
      const dotsAlpha = smooth(t / 0.2) * (1 - smooth((t - (total - 0.3)) / 0.3));
      if (dotsAlpha > 0) {
        const path = new Path2D();
        for (let i = 0; i < N; i++) {
          const u = clamp01((t - delay[i]) / BACKDROP.flightS);
          const e = easeInOut(u), s = Math.sin(Math.PI * u), r = ang[i] + spin[i] * u;
          const x = sx[i] + (tx[i] - sx[i]) * e + Math.cos(r) * rad[i] * s;
          const y = sy[i] + (ty[i] - sy[i]) * e + Math.sin(r) * rad[i] * s;
          const d = 1.3 + s;
          path.rect(x - d / 2, y - d / 2, d, d);
        }
        ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx!.globalAlpha = dotsAlpha;
        ctx!.fillStyle = '#171917';
        ctx!.fill(path);
        ctx!.globalAlpha = 1;
      }
      if (t < total) {
        frame = requestAnimationFrame(step);
      } else {
        // Settled: one still image until the next change, nothing redrawn per frame.
        ctx!.setTransform(1, 0, 0, 1, 0, 0);
        ctx!.clearRect(0, 0, canvas.width, canvas.height);
        drawStill(to.img);
        current = to;
        queue();
        schedule(BACKDROP.holdMs);
      }
    };
    frame = requestAnimationFrame(step);
  }

  function queue() {
    if (scores.length > 1) next = prepare(nextScore());
  }

  const typing = () => {
    const el = document.activeElement;
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
  };

  function schedule(ms: number) {
    clearTimeout(timer);
    timer = window.setTimeout(change, ms);
  }

  async function change() {
    if (stopped || still || !next) return;
    // Never move while someone is filling in the form or not looking.
    if (typing() || document.hidden) { schedule(BACKDROP.typingRetryMs); return; }
    const to = await next.catch(() => null);
    if (stopped) return;
    if (!to) { queue(); schedule(BACKDROP.holdMs); return; }
    morph(current, to);
  }

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (stopped || !current) return;
      cancelAnimationFrame(frame);
      size();
      current = { img: current.img, pts: still ? current.pts : inkPoints(current.img) };
      drawStill(current.img);
      queue();
      schedule(BACKDROP.holdMs);
    }, 250);
  };
  window.addEventListener('resize', onResize);

  (async () => {
    try {
      const res = await fetch(url('index.json'));
      scores = (await res.json()) as Score[];
      if (!scores.length || stopped) return;
      size();
      const first = await prepare(nextScore());
      if (stopped) return;
      if (still) {
        drawStill(first.img);
        current = first;
        return;
      }
      morph(null, first);
    } catch {
      // A background is optional: if the scores can't load, the page stays plain.
    }
  })();

  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(resizeTimer);
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', onResize);
  };
}
