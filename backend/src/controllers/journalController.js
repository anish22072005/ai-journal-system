const Journal = require('../models/Journal');
const { analyzeEmotion, analyzeEmotionStream } = require('../services/llmService');

// POST /api/journal
async function createEntry(req, res) {
  try {
    const { userId, ambience, text } = req.body;

    if (!userId || !ambience || !text) {
      return res.status(400).json({ error: 'userId, ambience, and text are required' });
    }

    const journal = await Journal.create({
      userId:   userId.trim(),
      ambience,
      text:     text.trim()
    });

    res.status(201).json(journal);
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create entry' });
  }
}

// GET /api/journal/:userId
async function getEntries(req, res) {
  try {
    const { userId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const skip  = Math.max(Number(req.query.skip)  || 0,  0);

    const entries = await Journal.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch entries' });
  }
}

// POST /api/journal/analyze
async function analyzeEntry(req, res) {
  try {
    const { text, entryId } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text (string) is required' });
    }
    if (text.trim().length < 5) {
      return res.status(400).json({ error: 'text must be at least 5 characters' });
    }

    const result = await analyzeEmotion(text.trim());

    // Optionally persist analysis back onto the journal entry
    if (entryId) {
      await Journal.findByIdAndUpdate(entryId, {
        analysis: { ...result, analyzedAt: new Date() }
      }).catch(() => {}); // non-critical — don't fail the API response
    }

    res.json(result);
  } catch (error) {
    console.error('Analysis error:', error.message);
    res.status(500).json({
      error: 'Analysis failed. Verify your GROQ_API_KEY is set correctly.'
    });
  }
}

// POST /api/journal/analyze/stream
async function analyzeEntryStream(req, res) {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text (string) is required' });
    }

    await analyzeEmotionStream(text.trim(), res);
  } catch (error) {
    console.error('Stream error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming analysis failed' });
    } else {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    }
  }
}

// GET /api/journal/insights/:userId
async function getInsights(req, res) {
  try {
    const { userId } = req.params;

    const entries = await Journal.find({ userId }).lean();

    if (entries.length === 0) {
      return res.json({
        totalEntries:      0,
        topEmotion:        null,
        mostUsedAmbience:  null,
        recentKeywords:    []
      });
    }

    // Tally ambiences across all entries
    const ambienceCount = entries.reduce((acc, e) => {
      acc[e.ambience] = (acc[e.ambience] || 0) + 1;
      return acc;
    }, {});
    const mostUsedAmbience = Object.entries(ambienceCount)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Tally emotions from entries that have been analyzed
    const analyzed = entries.filter(e => e.analysis?.emotion);
    const emotionCount = analyzed.reduce((acc, e) => {
      acc[e.analysis.emotion] = (acc[e.analysis.emotion] || 0) + 1;
      return acc;
    }, {});
    const topEmotion = Object.entries(emotionCount)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Recent keywords from the 5 most-recently analyzed entries
    const recentAnalyzed = [...analyzed]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);
    const recentKeywords = [
      ...new Set(recentAnalyzed.flatMap(e => e.analysis.keywords || []))
    ].slice(0, 10);

    res.json({
      totalEntries:     entries.length,
      topEmotion,
      mostUsedAmbience,
      recentKeywords
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
}

module.exports = { createEntry, getEntries, analyzeEntry, analyzeEntryStream, getInsights };
