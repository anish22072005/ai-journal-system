const rateLimit = require('express-rate-limit');

// General API limiter — 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            100,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});

// Tighter limiter for LLM endpoints — 10 requests per minute per IP
const analyzeLimiter = rateLimit({
  windowMs:       60 * 1000,
  max:            10,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: 'Too many analysis requests, please slow down.' }
});

module.exports = { apiLimiter, analyzeLimiter };
