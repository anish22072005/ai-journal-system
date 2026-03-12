const Groq = require('groq-sdk');
const crypto = require('crypto');
const AnalysisCache = require('../models/AnalysisCache');

// Lazy-initialize so the process doesn't crash on startup if env vars
// are injected after module load (e.g. on Render / cloud platforms)
let _groq = null;
function getGroq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY environment variable is not set');
    }
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// In-memory cache — keeps hot results to avoid MongoDB round-trips
const memCache = new Map();
const MEM_CACHE_MAX = 100;
const MEM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function hashText(text) {
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}

function normalizeResult(raw) {
  return {
    emotion:  (raw.emotion || 'unknown').toLowerCase().trim(),
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 10)
      : [],
    summary:  (raw.summary || '').trim()
  };
}

function evictIfFull() {
  if (memCache.size >= MEM_CACHE_MAX) {
    memCache.delete(memCache.keys().next().value);
  }
}

async function callGroq(text) {
  const systemPrompt =
    'You are an emotional analysis assistant for a nature-based wellness journal. ' +
    'Respond ONLY with a valid JSON object — no markdown fences, no extra text.';

  const userPrompt =
    `Analyze this journal entry and return a JSON object with:\n` +
    `- "emotion": single lowercase word for the primary emotion (e.g. "calm", "anxious", "joyful")\n` +
    `- "keywords": array of 3–5 relevant nature/emotional keywords extracted from the text\n` +
    `- "summary": one concise sentence describing the user's mental/emotional state\n\n` +
    `Journal entry: "${text}"`;

  const completion = await getGroq().chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ],
    model:       GROQ_MODEL,
    temperature: 0.3,
    max_tokens:  300
  });

  const content = completion.choices[0]?.message?.content || '{}';

  // Strip markdown code fences the model might add despite instructions
  const cleaned = content.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('LLM returned a non-JSON response');
    parsed = JSON.parse(match[0]);
  }

  return normalizeResult(parsed);
}

/**
 * Analyze text emotion.
 * Cache hierarchy: in-memory → MongoDB → Groq API
 */
async function analyzeEmotion(text) {
  const textHash = hashText(text);

  // 1. In-memory cache
  const memEntry = memCache.get(textHash);
  if (memEntry && Date.now() - memEntry.ts < MEM_CACHE_TTL_MS) {
    return { ...memEntry.result, cached: true };
  }

  // 2. MongoDB cache
  const dbEntry = await AnalysisCache.findOneAndUpdate(
    { textHash },
    { $inc: { hitCount: 1 } },
    { new: true }
  );
  if (dbEntry) {
    const result = normalizeResult(dbEntry.result);
    evictIfFull();
    memCache.set(textHash, { result, ts: Date.now() });
    return { ...result, cached: true };
  }

  // 3. Call Groq LLM
  const result = await callGroq(text);

  // Persist to MongoDB cache (ignore duplicate-key errors on race conditions)
  await AnalysisCache.create({ textHash, result }).catch(() => {});

  // Persist to in-memory cache
  evictIfFull();
  memCache.set(textHash, { result, ts: Date.now() });

  return result;
}

/**
 * Streaming analysis via Server-Sent Events.
 * Sends delta tokens as SSE events and a final [DONE] event.
 */
async function analyzeEmotionStream(text, res) {
  const systemPrompt =
    'You are an emotional analysis assistant for a nature-based wellness journal. ' +
    'Respond ONLY with a valid JSON object — no markdown fences, no extra text.';

  const userPrompt =
    `Analyze this journal entry and return a JSON object with:\n` +
    `- "emotion": single lowercase word for the primary emotion\n` +
    `- "keywords": array of 3–5 relevant nature/emotional keywords\n` +
    `- "summary": one concise sentence describing the user's mental/emotional state\n\n` +
    `Journal entry: "${text}"`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const stream = await getGroq().chat.completions.create({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ],
    model:       GROQ_MODEL,
    temperature: 0.3,
    max_tokens:  300,
    stream:      true
  });

  let fullContent = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content || '';
    if (delta) {
      fullContent += delta;
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
  }

  res.write(`data: ${JSON.stringify({ done: true, fullContent })}\n\n`);
  res.end();
}

module.exports = { analyzeEmotion, analyzeEmotionStream };
