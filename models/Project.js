const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    // The owner. References a document in the users collection.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    // Path or URL to the PDF. The file itself is stored elsewhere
    // (disk, object storage), not in MongoDB, handled in browser.
    pdfLocation: {
      type: String,
      default: null,
      trim: true
    },
    // Shape not decided yet, so this accepts any value (object or string).
    // Tighten it once the frontend settles on a format.
    pageLayout: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    pageCount: {
      type: Number,
      default: 0,
      min: 0
    },
    partNames: {
      type: [String],
      default: []
    },
    saveFormat: {
      type: String,
      enum: ['partwise'],
      default: 'partwise',
      trim: true,
      lowercase: true 
    }
  },
  {
    collection: 'projects',
    versionKey: false,
    timestamps: true
  }
);

module.exports = mongoose.model('Project', projectSchema);
