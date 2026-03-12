const mongoose = require('mongoose');

const analysisCacheSchema = new mongoose.Schema({
  textHash: {
    type:     String,
    required: true,
    unique:   true,
    index:    true
  },
  result: {
    emotion:  { type: String, required: true },
    keywords: [{ type: String }],
    summary:  { type: String, required: true }
  },
  hitCount: {
    type:    Number,
    default: 1
  },
  createdAt: {
    type:    Date,
    default: Date.now,
    expires: 86400  // TTL index — auto-delete after 24 hours
  }
});

module.exports = mongoose.model('AnalysisCache', analysisCacheSchema);
