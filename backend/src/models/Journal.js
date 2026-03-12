const mongoose = require('mongoose');

const analysisSchema = new mongoose.Schema(
  {
    emotion:     { type: String },
    keywords:    [{ type: String }],
    summary:     { type: String },
    analyzedAt:  { type: Date, default: Date.now }
  },
  { _id: false }
);

const journalSchema = new mongoose.Schema(
  {
    userId: {
      type:      String,
      required:  [true, 'userId is required'],
      trim:      true,
      maxlength: 100,
      index:     true
    },
    ambience: {
      type:     String,
      required: [true, 'ambience is required'],
      enum: {
        values:   ['forest', 'ocean', 'mountain'],
        message:  'ambience must be forest, ocean, or mountain'
      }
    },
    text: {
      type:      String,
      required:  [true, 'text is required'],
      trim:      true,
      maxlength: [5000, 'Journal entry cannot exceed 5000 characters']
    },
    analysis: {
      type:    analysisSchema,
      default: null
    }
  },
  { timestamps: true }
);

// Compound index for efficient per-user queries sorted by date
journalSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Journal', journalSchema);
