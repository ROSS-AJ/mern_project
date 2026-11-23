# Partwise web app

Splits a PDF score into one PDF per player: detect staffs and systems, tell
it who plays what, export.

```
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests (Node runs the TypeScript directly)
npm run typecheck
npm run build
```

The detection test page (overlays only, no editor) still runs with
`node test/serve.mjs` on http://localhost:5174.

## Where things live

| Folder | What it does |
|---|---|
| `src/engine/` | Plain logic, no React. `detect.ts` finds lines, staffs and systems. `assign.ts` matches staffs to parts and repeats confirmed layouts. `crop.ts` works out each part's bands and attaches shared text. `issues.ts` finds things to flag. `suggest.ts` suggests shared-text regions. |
| `src/model/` | `types.ts` is the saved project format. `reducer.ts` holds every edit as a named action, with undo/redo. `storage.ts` keeps only the current project (and its PDF) in the browser so it can be continued; starting a new score replaces it. Signed-in users will get a project browser; put the API calls in this file. `parts.ts` has presets and instrument defaults. |
| `src/pdf/` | pdf.js rendering, running detection per page, and pdf-lib export (vector crops, not screenshots). |
| `src/editor/` | The screens: `PartSetup`, `AssignView` (with `PageView`, `PartPicker`, `Inspector`, `PageRail`) and `ExportView`. |

To add a new kind of edit, add an action to `EditAction` in
`src/model/reducer.ts` and a case in `applyEdit`. Undo and re-running
auto-assignment happen automatically.

## How assignment works

- A system whose staff count matches the part list is assigned in order.
- Confirming or fixing a system teaches it: later systems with the same staff
  pattern reuse that layout.
- Anything else gets a best guess (resting parts skipped, grand staffs kept
  together, 1-line staffs sent to percussion parts) and is marked "Check".

Coordinates are stored as fractions of the page, so nothing depends on render
resolution.

## Zoom and pan

Pinch on a trackpad or Ctrl/Cmd + scroll zooms around the pointer; `+`/`-`
zoom around the middle; Ctrl/Cmd + 0 fits the width. Hold Space and drag (or
drag with the middle mouse button) to pan. The page re-renders at a matching
resolution (up to 400 dpi) once zooming pauses. See `editor/useZoom.ts`.

## Text regions

Regions are shapes made of rectangles (`engine/geometry.ts` does the math).
Boxes drawn with the same tool that touch each other merge into one shape,
and Alt-drag cuts a piece out. Export clips the page to the whole shape at
once, so overlapping boxes are never drawn twice.

- **Shared text (T):** copied for every chosen part. A part whose own staff
  area already contains it keeps it there instead of getting a second copy.
- **Part text (P):** belongs to one part. It joins that part's crop and is cut
  out of every other part's crop, for text that hangs into a neighbor's area.
