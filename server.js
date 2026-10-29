const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { User } = require('./models');

// --- Database -------------------------------------------------------------
const url = process.env.MONGODB_URI || 'mongodb://localhost:27017/CardsDB';
mongoose
  .connect(url)
  .then(() => console.log('MongoDB connected successfully via Mongoose'))
  .catch((err) => console.error('MongoDB connection error:', err));

// --- App ------------------------------------------------------------------
const app = express();

// Allow the React frontend, which runs at a different address, to call this API
app.use(cors());
// Turn JSON request bodies into a JavaScript object at req.body
app.use(express.json());

// GET /api/ping - Health check
app.get('/api/ping', (req, res) => {
  res.status(200).json({ message: 'Hello World' });
});

// POST /api/register
// In:  { firstName, lastName, login, password, email }
// Out: 201 { message, id, error } | 400 | 409
app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, login, password, email } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'login and password are required' });
    }
    if (await User.findOne({ login })) {
      return res.status(409).json({ error: 'That login is already taken' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ firstName, lastName, login, email, password: hash });
    res.status(201).json({ message: 'User registered successfully', id: user._id, error: '' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'That login is already taken' });
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


// Start listening only when run directly (node server.js), not when a test
// file loads the app with require()
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;