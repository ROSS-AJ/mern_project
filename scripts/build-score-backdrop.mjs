// Turns the title page of each sheet-music PDF into a small ink-only WebP for
// the sign-in pages' background (Most Recent Partwise Files/src/ScoreBackdrop.tsx).
//
//   node scripts/build-score-backdrop.mjs <folder of PDFs>
//
// For each PDF it takes the first page that has music on it (skipping a text-only
// cover), removes the white paper so only the ink is left, trims the page's
// footer, and writes the site's public/score-backdrop/<name>.webp plus index.json.
// File names are read as "Title_-_Composer.pdf".
//
// Only scores whose footer says they are in the public domain are used, so the
// images can ship without attribution. Others are listed and skipped.
//
// Uses the editor's pdfjs-dist and the @napi-rs/canvas it installs alongside.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const requireFromWeb = createRequire(path.join(root, 'web', 'package.json'));
const { createCanvas } = requireFromWeb('@napi-rs/canvas');
const pdfjs = await import(pathToFileURL(requireFromWeb.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);

if (!process.argv[2]) {
  console.error('Usage: node scripts/build-score-backdrop.mjs <folder of PDFs>');
  process.exit(1);
}
const source = path.resolve(process.argv[2]);
const outDir = path.join(root, 'Most Recent Partwise Files', 'public', 'score-backdrop');
const WIDTH = 1300;          // px; shown at ~8% opacity, so this is plenty sharp
const FOOTER = 0.07;         // fraction of the page height trimmed off the bottom
const INK = [23, 25, 23];    // --pw-frame

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-');
const index = [];
const skipped = [];

for (const file of fs.readdirSync(source).filter((f) => f.toLowerCase().endsWith('.pdf')).sort()) {
  const data = new Uint8Array(fs.readFileSync(path.join(source, file)));
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const text = (await Promise.all(
    Array.from({ length: Math.min(doc.numPages, 2) }, async (_, i) =>
      (await (await doc.getPage(i + 1)).getTextContent()).items.map((it) => it.str).join(' ')),
  )).join(' ');
  if (!/public domain/i.test(text)) {
    skipped.push(`${file} (${(text.match(/Creative Commons[^.]*/i) ?? ['licence not found'])[0].trim()})`);
    continue;
  }

  let chosen = null;
  for (let n = 1; n <= Math.min(doc.numPages, 4) && !chosen; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: WIDTH / base.width });
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    const d = image.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const a = Math.round(Math.max(0, Math.min(1, (215 - lum) / 150)) * 255);
      if (a > 100) ink++;
      d[i] = INK[0]; d[i + 1] = INK[1]; d[i + 2] = INK[2]; d[i + 3] = a;
    }
    if (ink / (canvas.width * canvas.height) < 0.015 && n < Math.min(doc.numPages, 4)) continue; // a text-only cover
    const height = Math.round(canvas.height * (1 - FOOTER));
    const out = createCanvas(canvas.width, height);
    out.getContext('2d').putImageData(image, 0, 0);
    chosen = { out, n };
  }

  const [title, composer = ''] = file.replace(/\.pdf$/i, '').split('_-_').map((s) => s.replace(/_/g, ' '));
  const name = `${slug(title)}--${slug(composer)}.webp`;
  const webp = await chosen.out.encode('webp', 82);
  fs.writeFileSync(path.join(outDir, name), webp);
  index.push({ file: name, title, composer, page: chosen.n, width: chosen.out.width, height: chosen.out.height });
  console.log(`${name}  page ${chosen.n}  ${Math.round(webp.length / 1024)} KB`);
}

fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`\n${index.length} scores written to ${path.relative(root, outDir)}`);
if (skipped.length) console.log(`Skipped (not public domain):\n  ${skipped.join('\n  ')}`);
