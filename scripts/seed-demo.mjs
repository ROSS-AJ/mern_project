// Creates a demo account with a few sample projects, for trying the
// dashboard locally. TEST DATA ONLY: never run it against the live server.
//
//   1. Run server.js locally (PORT=5055, a local MONGODB_URI).
//   2. node scripts/seed-demo.mjs
//   3. Run the main site with VITE_API_URL=http://localhost:5055/api in
//      "Most Recent Partwise Files/.env.development.local", and sign in with
//      the demo login below.
//
// Running it again replaces the demo account's projects.

import { createRequire } from 'node:module';

// The demo login (local test account)
const DEMO_LOGIN = 'demo';
const DEMO_PASSWORD = 'demo-pass-1';
const DEMO_EMAIL = 'demo@example.test';

const API = process.env.API_URL || 'http://localhost:5055/api';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/PartwiseTest';

const require = createRequire(new URL('../package.json', import.meta.url));
const mongoose = require('mongoose');
const { PDFDocument, StandardFonts } = createRequire(new URL('../web/package.json', import.meta.url))('pdf-lib');

if (/rosslampdemo/.test(API)) throw new Error('This creates test data; point it at a local server, not the live one.');

const json = { 'Content-Type': 'application/json' };

await mongoose.connect(MONGODB_URI);
const users = mongoose.connection.collection('users');

// Start the demo account fresh
const old = await users.findOne({ login: DEMO_LOGIN });
if (old) {
  await mongoose.connection.collection('projects').deleteMany({ userId: old._id });
  await users.deleteOne({ _id: old._id });
}
const registered = await fetch(`${API}/register`, {
  method: 'POST',
  headers: json,
  body: JSON.stringify({ firstName: 'Demo', lastName: 'User', login: DEMO_LOGIN, password: DEMO_PASSWORD, email: DEMO_EMAIL }),
});
if (!registered.ok) throw new Error(`Register failed: ${(await registered.json()).error}`);
// Skip the verification email
await users.updateOne({ login: DEMO_LOGIN }, { $set: { emailVerified: true } });
const { token } = await (await fetch(`${API}/login`, { method: 'POST', headers: json, body: JSON.stringify({ login: DEMO_LOGIN, password: DEMO_PASSWORD }) })).json();
const auth = { Authorization: `Bearer ${token}` };

async function samplePdf(title, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    // The built-in PDF fonts can't draw accents (Dvořák), so drop them here
    const plain = title.normalize('NFD').replace(/[̀-ͯ]/g, '');
    page.drawText(`${plain}, page ${i + 1}`, { x: 60, y: 730, size: 16, font });
  }
  return doc.save();
}

async function addProject(title, pages, players) {
  const form = new FormData();
  form.append('file', new Blob([await samplePdf(title, pages)], { type: 'application/pdf' }), `${title}.pdf`);
  const { project } = await (await fetch(`${API}/projects`, { method: 'POST', headers: auth, body: form })).json();
  if (players.length === 0) return project; // never opened in the editor
  const now = Date.now();
  const layout = {
    id: `demo-${project._id}`, title, fileName: `${title}.pdf`, pageCount: pages, createdAt: now, updatedAt: now, step: 'setup',
    parts: players.map((name, i) => ({ id: `p${i}`, name, color: '#000000', staffCount: 1, percussion: false })),
    pages: Array.from({ length: pages }, () => ({ width: 0, height: 0, angle: 0, detected: false, systems: [] })),
    regions: [], dismissedIssues: [],
  };
  await fetch(`${API}/projects/${project._id}`, { method: 'PUT', headers: { ...auth, ...json }, body: JSON.stringify({ layout }) });
  return project;
}

const strings = ['Violin I', 'Violin II', 'Viola', 'Cello', 'Bass'];
await addProject('Bach: Brandenburg Concerto No. 3', 12, []);
await addProject('Holst: First Suite in E-flat', 18, ['Flute', 'Oboe', 'Clarinet I', 'Clarinet II', 'Bassoon', 'Horn I', 'Horn II', 'Trumpet', 'Trombone', 'Tuba', 'Timpani']);
await addProject('Dvořák: Symphony No. 9, Allegro con fuoco', 4, strings);
await addProject('Dvořák: Serenade in E, Op. 22', 24, strings);

console.log(`Demo account ready with 4 projects. Sign in as "${DEMO_LOGIN}" (password in this script).`);
await mongoose.disconnect();
