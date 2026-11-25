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
| `src/ui/` | The screens. `shared/` is used by both designs (page view, picker, zoom, filmstrip, dialogs, editor context). `edition/` and `classic/` each have their own screens and stylesheet. `index.ts` lists the designs. |

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

## On the Partwise website

The editor is open to everyone; no account is needed. Addresses
(usepartwise.com):

| Address | Page |
|---|---|
| `/` | No home page yet: goes to `/dashboard` if signed in, else `/login` |
| `/login`, `/register` | Sign in / create an account (`?next=` says where to go afterwards) |
| `/dashboard` | The signed-in user's projects (others are sent to `/login`) |
| `/editor/` | This editor (`?project=<id>` opens a saved project) |
| `/api/` | The API (`server.js`) |

The main site (`Most Recent Partwise Files/`) has the pages; `src/router.tsx`
there maps addresses to pages. The editor's links go to `/login?next=/editor/`
and `/dashboard`.

- **Development:** run `server.js` (port 5000, or set `API_TARGET`) and both
  dev servers, then use http://localhost:8443/. The site's dev server passes
  `/editor/` on to this one (port 5173) and `/api/` on to the API, so
  everything shares one address and sign-in, like in production.
- **Production:** run `npm run build:site` here, then `npm run build` in the
  main site; copy its `dist/` to the web server. Apache setup:
  `deploy/apache/usepartwise.com.conf` (repo root).
- **The old host** (lamp.rosslampdemo.com/partwise/, API at `/mern/api`):
  build with `npm run build:site:lamp` here and `npm run build:lamp` there;
  Apache lines in `deploy/apache/lamp-partwise.conf`.
- **Server settings:** on usepartwise.com set `FRONTEND_URL=https://usepartwise.com/`
  and `PUBLIC_API_URL=https://usepartwise.com/api` in the server's `.env`
  (they make the links in emails).

## Saving projects

- **This browser:** the open project autosaves here (guests too).
- **Project file (`.partwise`):** the download button in the editor (and
  "Download" on the dashboard) saves one file with the layout *and* the PDF,
  so it always reopens with the right score. Open it from the editor's home
  screen or upload it on the dashboard. It's a zip: `project.json`
  (`{ format: 'partwise', version, savedAt, project }`, where `project` is the
  `ProjectDoc` from `model/types.ts`) and `score.pdf`. Code:
  `model/partwiseFile.ts`, and the same format in `server.js`.
- **Your projects (signed in):** "Save to my projects" adds the open project
  to the account; projects opened from the dashboard
  (`/editor/?project=<id>`) save back automatically. The layout goes
  in MongoDB (`Project.pageLayout`), the PDF in `UPLOAD_DIR` on the server.
  Code: `model/cloud.ts`.

API (all need `Authorization: Bearer <token>` from `/api/login`):

| Route | Does |
|---|---|
| `GET /api/projects` | The user's projects, newest first (no layouts) |
| `POST /api/projects` | Upload a PDF or `.partwise` file (form field `file`, up to 30 MB) |
| `GET /api/projects/:id` | One project with its layout (`pageLayout`) |
| `GET /api/projects/:id/file` | The PDF |
| `PUT /api/projects/:id` | Save the layout: `{ "layout": ProjectDoc }` |
| `GET /api/projects/:id/export` | Download as a `.partwise` file |
| `DELETE /api/projects/:id` | Delete the project and its PDF |

To try it locally, run `server.js` and the dev servers as above.
`node scripts/seed-demo.mjs` (repo root) makes a demo account with sample
projects; its login is in that script.

## Two designs

Both designs run on the same engine, model and PDF code, and open the same
saved project, so you can switch in the middle of working.

- **Edition** (default): one workspace with the Ensemble, the score and a
  parts drawer. `src/ui/edition/`
- **Classic**: the original three steps (Parts, Assign, Export).
  `src/ui/classic/`

Switch with the UI toggle in the bottom-left corner (shown in development),
or open the app with `?ui=edition` or `?ui=classic`. The choice is
remembered. Only the active design's stylesheet is loaded.

## Adding missed staffs

Both designs use the same logic (`engine/staffs.ts`):

- The add-staff tool (S) previews the staff before you click: it snaps into
  the system's staff pattern, matches its neighbors' size and spacing, and
  shows which player it will belong to (the next one missing in score order).
  The tool stays on, so several staffs can be added in a row.
- "Add N missing staffs" (details panel, and the review strip in Edition)
  rebuilds a short system in one go by copying a complete system nearby,
  including the players. A misdetected single line becomes a full staff.

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
