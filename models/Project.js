const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    storedName: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      default: 'application/pdf'
    },
    size: {
      type: Number,
      required: true
    }
  },
  {
    collection: 'projects',
    timestamps: true
  }
);

module.exports = mongoose.model('Project', projectSchema);
