const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { zipSync, unzipSync, strToU8, strFromU8 } = require('fflate');
require('dotenv').config();

const { User, Project } = require('./models');

// --- Database -------------------------------------------------------------
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/CardsDB';
mongoose
  .connect(url)
  .then(() => console.log('MongoDB connected successfully via Mongoose'))
  .catch((err) => console.error('MongoDB connection error:', err));

// --- Email ----------------------------------------------------------------
// Front end site, the verify link sends people back here
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://lamp.rosslampdemo.com/partwise/';
// Public address of this api, used for the links in emails
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'https://lamp.rosslampdemo.com/mern/api';

// If SMTP_HOST is not set the email just prints in the server log
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    })
  : null;

// Send one email
async function sendMail(to, subject, text) {
  // Not set up yet so print it instead
  if (!transporter) {
    console.log(`[mail not configured] To: ${to}\nSubject: ${subject}\n${text}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to,
    subject,
    text
  });
}

// Only hash of a token gets saved in the database
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Make random token that starts with its expiry time
function makeToken(ttlMs) {
  const raw = `${Date.now() + ttlMs}.${crypto.randomBytes(32).toString('hex')}`;
  return { raw, hash: sha256(raw) };
}

// Check if token ran out of time
function tokenExpired(raw) {
  const expiry = Number(String(raw).split('.')[0]);
  return !Number.isFinite(expiry) || expiry < Date.now();
}

// Save a new verify token and email the link
async function sendVerification(user) {
  // Good for 24 hours
  const { raw, hash } = makeToken(24 * 60 * 60 * 1000);
  await User.updateOne({ _id: user._id }, { $set: { verifyToken: hash } });
  const link = `${PUBLIC_API_URL}/verify?token=${raw}`;
  await sendMail(user.email, 'Verify your Partwise email', `Welcome to Partwise! Verify your email: ${link}`);
}

// --- App ------------------------------------------------------------------
const app = express();

// Allow the React frontend, which runs at a different address, to call this API
app.use(cors());
// Turn JSON request bodies into a JavaScript object at req.body
// (a saved editor layout can be a few hundred KB, so allow more than the 100 KB default)
app.use(express.json({ limit: '10mb' }));

// GET api check
app.get('/api/ping', (req, res) => {
  res.status(200).json({ message: 'Hello World' });
});

// POST api register
// In format firstName, lastName, login, password, email
// Out should be 201 in format message, id, error or 400 or 409
app.post('/api/register', async (req, res) => {
  try {
    // Trying login
    const { firstName, lastName, login, password, email } = req.body;
    // If field missing
    if (!login || !password || !email) {
      return res.status(400).json({ error: 'login, password and email are required' });
    }
    // If user alr registered
    if (await User.findOne({ login })) {
      return res.status(409).json({ error: 'That login is already taken' });
    }
    // If email alr registered
    if (await User.findOne({ email: String(email).trim().toLowerCase() })) {
      return res.status(409).json({ error: 'That email is already registered' });
    }
    // Succesful user reg
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ firstName, lastName, login, email, password: hash });
    // Send the verify email
    let note = '';
    try {
      await sendVerification(user);
      // Email failed but the user is still made
    } catch (mailErr) {
      console.error('Verification email failed:', mailErr.message);
      note = ' We could not send the verification email yet; request it again later.';
    }
    res.status(201).json({
      message: 'User registered successfully. Check your email to verify your account.' + note,
      id: user._id,
      error: ''
    });
    // In case of some error
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'That login or email is already registered' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST api/login logic
// In is format login password
// Out is 200 ok being id, firstName, lastName, login, email, role, token, error or 400 or 401
app.post('/api/login', async (req, res) => {
// Trying login
  try {
    const { login, password } = req.body;
    // Missing criteria
    if (!login || !password) {
      return res.status(400).json({ error: 'login and password are required' });
    }
    const user = await User.findOne({ login });
    // Invalid check
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid login or password' });
    }
    // Email not verified yet so 403
    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before signing in.' });
    }
    // Ok check
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    // Return JSON with this data
    res.status(200).json({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      login: user.login,
      email: user.email,
      role: user.role,
      token,
      error: ''
    });
    // Some Error
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET api verify, this is the link in the verify email
// In is the token in the url
// Out is a redirect to the front end with verified=1 or verified=0
app.get('/api/verify', async (req, res) => {
  const token = String(req.query.token || '');
  let ok = false;
  // Token has to exist and not be expired
  if (token && !tokenExpired(token)) {
    const user = await User.findOne({ verifyToken: sha256(token) });
    if (user) {
      // Mark them verified and clear the token
      await User.updateOne({ _id: user._id }, { $set: { emailVerified: true, verifyToken: null } });
      ok = true;
    }
  }
  const sep = FRONTEND_URL.includes('?') ? '&' : '?';
  res.redirect(`${FRONTEND_URL}${sep}verified=${ok ? 1 : 0}`);
});

// POST api resend-verification
// In format email
// Out is always 200 so nobody can check which emails exist
app.post('/api/resend-verification', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  // Only if they exist and are not verified yet
  const user = email ? await User.findOne({ email, emailVerified: false }) : null;
  if (user) {
    try {
      await sendVerification(user);
    } catch (err) {
      console.error('Verification email failed:', err.message);
    }
  }
  res.status(200).json({ message: 'If that account needs verifying, an email was sent.', error: '' });
});

// POST api forgot-password
// In format email
// Out is always 200 so nobody can check which emails exist
app.post('/api/forgot-password', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const user = email ? await User.findOne({ email }) : null;
  if (user) {
    try {
      // Reset link is good for 1 hour
      const { raw, hash } = makeToken(60 * 60 * 1000);
      await User.updateOne(
        { _id: user._id },
        { $set: { resetToken: hash, resetExpires: new Date(Date.now() + 60 * 60 * 1000) } }
      );
      await sendMail(
        user.email,
        'Reset your Partwise password',
        `Reset your password (valid for 1 hour): ${PUBLIC_API_URL}/reset-password?token=${raw}`
      );
    } catch (err) {
      console.error('Reset email failed:', err.message);
    }
  }
  res.status(200).json({ message: 'If that email exists, a reset link was sent.', error: '' });
});

// Small page with a new password box, front end has no reset page yet
const RESET_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset password</title>
<style>body{font-family:system-ui,sans-serif;max-width:380px;margin:12vh auto;padding:0 16px}
input,button{width:100%;padding:10px;margin-top:10px;font-size:16px;box-sizing:border-box}</style></head>
<body><h2>Reset your password</h2>
<form id="f"><input id="p" type="password" placeholder="New password" required>
<button>Update password</button></form><p id="msg"></p>
<script>
const token = new URLSearchParams(location.search).get('token') || '';
document.getElementById('f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = document.getElementById('msg');
  try {
    const r = await fetch(location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: document.getElementById('p').value })
    });
    const d = await r.json();
    m.textContent = r.ok ? 'Password updated. You can sign in now.' : (d.error || 'Something went wrong.');
  } catch { m.textContent = 'Network error.'; }
});
</script></body></html>`;

// GET api reset-password, shows the page above
app.get('/api/reset-password', (req, res) => {
  res.type('html').send(RESET_PAGE);
});

// POST api reset-password
// In format token, password
// Out is 200 or 400
app.post('/api/reset-password', async (req, res) => {
  const token = String((req.body || {}).token || '');
  const password = String((req.body || {}).password || '');
  // If field missing
  if (!token || !password) {
    return res.status(400).json({ error: 'token and password are required' });
  }
  // Token has to match and not be expired
  const user = tokenExpired(token)
    ? null
    : await User.findOne({ resetToken: sha256(token), resetExpires: { $gt: new Date() } });
  if (!user) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  }
  // Save the new password and clear the token so it only works once
  await User.updateOne(
    { _id: user._id },
    { $set: { password: await bcrypt.hash(password, 10), resetToken: null, resetExpires: null } }
  );
  res.status(200).json({ message: 'Password updated', error: '' });
});


// --- Projects -------------------------------------------------------------
// A project is one score: its PDF (a file on disk) and the editor's layout
// (pageLayout, in MongoDB). Every route needs a signed-in user and only sees
// that user's projects.
//
// A .partwise file is a zip with project.json ({ format: 'partwise',
// version, savedAt, project }) and score.pdf. The editor reads and writes
// the same format (web/src/model/partwiseFile.ts).

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const PARTWISE_VERSION = 1;
const MAX_UPLOAD = 30 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD } });

// Needs "Authorization: Bearer <token>" from /api/login; sets req.userId
function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication required' });
  }
}

// Finds one of the signed-in user's projects, or answers 404
async function findOwnProject(req, res, fields) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  const query = Project.findOne({ _id: req.params.id, userId: req.userId });
  const project = await (fields ? query.select(fields) : query);
  if (!project) res.status(404).json({ error: 'Project not found' });
  return project;
}

const pdfPath = (project) => path.join(UPLOAD_DIR, path.basename(project.pdfLocation || ''));
const isPdf = (buf) => buf.length > 4 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
const isZip = (buf) => buf.length > 2 && buf[0] === 0x50 && buf[1] === 0x4b;
const safeName = (title) => String(title || '').replace(/[\\/:*?"<>|]+/g, '').trim() || 'score';

// What the list and upload return (no layout, it can be big)
function summary(project) {
  return {
    _id: project._id,
    title: project.title,
    originalName: project.originalName,
    size: project.size,
    pageCount: project.pageCount,
    partNames: project.partNames,
    saveFormat: project.saveFormat,
    hasLayout: project.pageLayout != null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

// Title, page count and player names, taken from an editor layout
function layoutFields(layout) {
  return {
    title: String(layout.title || '').trim() || 'Untitled score',
    pageCount: layout.pages.length,
    partNames: layout.parts.map((part) => String(part.name || '')).filter(Boolean)
  };
}

function isLayout(layout) {
  return Boolean(
    layout && typeof layout === 'object' &&
    Array.isArray(layout.pages) && Array.isArray(layout.parts) && Array.isArray(layout.regions)
  );
}

// Reads a .partwise upload; throws a message the user can read
function readPartwise(buffer) {
  let files;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch {
    throw new Error('That file is not a PDF or a Partwise project file');
  }
  if (!files['project.json'] || !files['score.pdf']) throw new Error('That is not a Partwise project file');
  let manifest;
  try {
    manifest = JSON.parse(strFromU8(files['project.json']));
  } catch {
    throw new Error('That project file is damaged');
  }
  if (manifest.format !== 'partwise' || !isLayout(manifest.project)) throw new Error('That is not a Partwise project file');
  if (manifest.version > PARTWISE_VERSION) throw new Error('That project was saved by a newer version of Partwise');
  const pdf = Buffer.from(files['score.pdf']);
  if (!isPdf(pdf)) throw new Error('That project file is damaged');
  const { cloudId, ...layout } = manifest.project;
  return { layout, pdf };
}

// GET api projects, the signed-in user's projects, newest first
// Out is 200 in format projects, error
app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const projects = await Project.find({ userId: req.userId }).sort({ updatedAt: -1 });
    res.status(200).json({ projects: projects.map(summary), error: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST api projects, multipart form with "file": a PDF (new project) or a .partwise file
// Out is 201 in format project, error or 400 or 413
app.post('/api/projects', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (uploadErr) => {
    if (uploadErr) {
      const tooBig = uploadErr.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'The file must be smaller than 30 MB' : uploadErr.message });
    }
    if (!req.file) return res.status(400).json({ error: 'Choose a PDF or .partwise file to upload' });
    try {
      const name = req.file.originalname || 'score.pdf';
      let pdf;
      let layout = null;
      if (isPdf(req.file.buffer)) {
        pdf = req.file.buffer;
      } else if (isZip(req.file.buffer)) {
        try {
          ({ layout, pdf } = readPartwise(req.file.buffer));
        } catch (err) {
          return res.status(400).json({ error: err.message });
        }
      } else {
        return res.status(400).json({ error: 'That file is not a PDF or a Partwise project file' });
      }

      const fields = layout
        ? layoutFields(layout)
        : { title: name.replace(/\.pdf$/i, '').trim() || 'Untitled score', pageCount: 0, partNames: [] };
      const project = new Project({
        userId: req.userId,
        ...fields,
        originalName: layout ? layout.fileName || `${fields.title}.pdf` : name,
        size: pdf.length,
        pageLayout: layout
      });
      project.pdfLocation = `${project._id}.pdf`;
      await fs.promises.writeFile(pdfPath(project), pdf);
      await project.save();
      res.status(201).json({ project: summary(project), error: '' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

// GET api projects/:id, one project with its editor layout
app.get('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const project = await findOwnProject(req, res);
    if (!project) return;
    res.status(200).json({ project: { ...summary(project), pageLayout: project.pageLayout }, error: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET api projects/:id/file, the PDF
app.get('/api/projects/:id/file', requireAuth, async (req, res) => {
  try {
    const project = await findOwnProject(req, res, 'pdfLocation');
    if (!project) return;
    const file = pdfPath(project);
    if (!project.pdfLocation || !fs.existsSync(file)) return res.status(404).json({ error: 'This project has no PDF' });
    res.type('application/pdf').sendFile(file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT api projects/:id, saves the editor layout
// In format layout; the title, page count and player names follow it
app.put('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const layout = (req.body || {}).layout;
    if (!isLayout(layout)) return res.status(400).json({ error: 'layout must be an editor project' });
    const project = await findOwnProject(req, res, '_id');
    if (!project) return;
    const { cloudId, ...clean } = layout;
    const updated = await Project.findOneAndUpdate(
      { _id: project._id },
      { $set: { ...layoutFields(clean), pageLayout: clean } },
      { new: true }
    );
    res.status(200).json({ project: summary(updated), error: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET api projects/:id/export, downloads a .partwise file (layout and PDF)
app.get('/api/projects/:id/export', requireAuth, async (req, res) => {
  try {
    const project = await findOwnProject(req, res);
    if (!project) return;
    const file = pdfPath(project);
    if (!project.pdfLocation || !fs.existsSync(file)) return res.status(404).json({ error: 'This project has no PDF' });
    // Never opened in the editor yet: export an empty layout. The editor
    // reads it like a new score (it finds the pages itself).
    const layout = project.pageLayout || {
      id: String(project._id),
      title: project.title,
      fileName: project.originalName || `${project.title}.pdf`,
      pageCount: 0,
      createdAt: project.createdAt.getTime(),
      updatedAt: project.updatedAt.getTime(),
      step: 'setup',
      parts: [],
      pages: [],
      regions: [],
      dismissedIssues: []
    };
    const manifest = { format: 'partwise', version: PARTWISE_VERSION, savedAt: new Date().toISOString(), project: layout };
    const zip = zipSync({
      'project.json': [strToU8(JSON.stringify(manifest)), { level: 6 }],
      'score.pdf': [new Uint8Array(await fs.promises.readFile(file)), { level: 0 }]
    });
    res.attachment(`${safeName(project.title)}.partwise`).type('application/octet-stream').send(Buffer.from(zip));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE api projects/:id, removes the project and its PDF
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const project = await findOwnProject(req, res, 'pdfLocation');
    if (!project) return;
    await Project.deleteOne({ _id: project._id });
    if (project.pdfLocation) await fs.promises.rm(pdfPath(project), { force: true });
    res.status(200).json({ message: 'Project deleted', error: '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start listening only when run directly not when tes with require()
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;