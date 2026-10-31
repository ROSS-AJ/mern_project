const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      default: '',
      trim: true
    },
    lastName: {
      type: String,
      default: '',
      trim: true
    },
    login: {
      type: String,
      required: [true, 'Login username is required'],
      unique: true,
      trim: true
    },
    password: {
      type: String,
      required: [true, 'Password is required']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    role: {
      type: String,
      default: 'user',
      trim: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    verifyToken: {
      type: String,
      default: null,
      select: false
    },
    resetToken: {
      type: String,
      default: null,
      select: false
    },
    resetExpires: {
      type: Date,
      default: null
    }
  },
  {
    collection: 'users',
    versionKey: false,
    timestamps: true
  }
);

module.exports = mongoose.model('User', userSchema);
