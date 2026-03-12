const express = require('express');
const router  = express.Router();
const {
  createEntry,
  getEntries,
  analyzeEntry,
  analyzeEntryStream,
  getInsights
} = require('../controllers/journalController');
const { apiLimiter, analyzeLimiter } = require('../middleware/rateLimiter');

// More-specific routes MUST be declared before parameterised ones
// to prevent Express matching "analyze" or "insights" as :userId

router.post('/analyze/stream',     analyzeLimiter, analyzeEntryStream);
router.post('/analyze',            analyzeLimiter, analyzeEntry);
router.get('/insights/:userId',    apiLimiter,     getInsights);

router.post('/',                   apiLimiter,     createEntry);
router.get('/:userId',             apiLimiter,     getEntries);

module.exports = router;
