# ArvyaX AI-Assisted Journal System

A nature-based wellness journal that uses Groq LLM to analyze emotions from journal entries and surfaces mental health insights over time.

---

## Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Backend     | Node.js 20 + Express 4            |
| Database    | MongoDB 7 + Mongoose              |
| LLM         | Groq API (`llama-3.1-8b-instant`) |
| Frontend    | React 18 + Vite 5                 |
| Container   | Docker + Docker Compose           |

---

## Features

- **Journal API** — create and retrieve entries tagged with nature ambience (forest / ocean / mountain)
- **LLM Emotion Analysis** — Groq-powered analysis returning `emotion`, `keywords`, and `summary`
- **Streaming Analysis** — Server-Sent Events endpoint for real-time token streaming
- **Analysis Caching** — two-tier cache (in-memory + MongoDB TTL) to reduce LLM calls
- **Insights Dashboard** — top emotion, most-used ambience, recent keywords
- **Rate Limiting** — 100 req/15 min general; 10 req/min on analysis endpoints
- **Security** — Helmet headers, CORS, body-size limiting, input validation

---

## Project Structure

```
.
├── backend/
│   ├── src/
│   │   ├── app.js                      # Express entry point
│   │   ├── config/db.js                # MongoDB connection
│   │   ├── controllers/
│   │   │   └── journalController.js    # Route handlers
│   │   ├── middleware/
│   │   │   └── rateLimiter.js          # express-rate-limit configs
│   │   ├── models/
│   │   │   ├── Journal.js              # Journal entry schema
│   │   │   └── AnalysisCache.js        # LLM result cache schema
│   │   ├── routes/
│   │   │   └── journal.js              # Route definitions
│   │   └── services/
│   │       └── llmService.js           # Groq LLM integration + caching
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     # Root component + tab navigation
│   │   ├── App.css                     # All styles
│   │   ├── main.jsx                    # React entry point
│   │   └── components/
│   │       ├── JournalForm.jsx         # Create entry form
│   │       ├── JournalList.jsx         # Entry list + analyze buttons
│   │       └── InsightsPanel.jsx       # Insights display
│   ├── index.html
│   ├── vite.config.js
│   ├── nginx.conf                      # Production nginx config
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── README.md
└── ARCHITECTURE.md
```

---

## API Reference

### POST `/api/journal`
Create a journal entry.

**Request**
```json
{
  "userId":   "123",
  "ambience": "forest",
  "text":     "I felt calm today after listening to the rain."
}
```

**Response** `201`
```json
{
  "_id":       "...",
  "userId":    "123",
  "ambience":  "forest",
  "text":      "I felt calm today after listening to the rain.",
  "analysis":  null,
  "createdAt": "2026-03-12T10:00:00.000Z",
  "updatedAt": "2026-03-12T10:00:00.000Z"
}
```

---

### GET `/api/journal/:userId`
Retrieve all entries for a user (newest first).

**Response** `200` — array of journal objects.

Query params: `?limit=50&skip=0`

---

### POST `/api/journal/analyze`
Analyze text with Groq LLM. Optionally saves the result back to the entry.

**Request**
```json
{
  "text":    "I felt calm today after listening to the rain.",
  "entryId": "optional-mongo-id"
}
```

**Response** `200`
```json
{
  "emotion":  "calm",
  "keywords": ["rain", "nature", "peace"],
  "summary":  "User experienced relaxation during the forest session.",
  "cached":   false
}
```

---

### POST `/api/journal/analyze/stream`
Same as `/analyze` but streams the response as Server-Sent Events.

Each SSE event: `data: {"delta": "<token>"}`  
Final event: `data: {"done": true, "fullContent": "<full JSON string>"}`

---

### GET `/api/journal/insights/:userId`
Return aggregated insights for a user.

**Response** `200`
```json
{
  "totalEntries":     8,
  "topEmotion":       "calm",
  "mostUsedAmbience": "forest",
  "recentKeywords":   ["focus", "nature", "rain"]
}
```

---

### GET `/health`
Health check.

---

## Setup & Running

### Prerequisites
- **Node.js 20+**
- **MongoDB** (local install or [MongoDB Atlas](https://www.mongodb.com/atlas))
- **Groq API key** — free at [console.groq.com](https://console.groq.com)

---

### Option A — Run Locally (without Docker)

#### 1. Clone & configure environment

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env and set GROQ_API_KEY=gsk_...
```

```bash
# Frontend (optional — only needed if you want a custom API URL)
cd frontend
cp .env.example .env
# VITE_API_URL is empty by default; Vite proxies /api → localhost:5000
```

#### 2. Install dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

#### 3. Start MongoDB

```bash
# If installed locally:
mongod --dbpath ./data
# Or use MongoDB Atlas and set MONGODB_URI in backend/.env
```

#### 4. Start backend

```bash
cd backend
npm run dev
# Server starts on http://localhost:5000
```

#### 5. Start frontend

```bash
cd frontend
npm run dev
# App opens at http://localhost:3000
```

---

### Option B — Docker Compose (recommended)

#### 1. Create a root `.env` file

```bash
cp backend/.env.example .env
# Set GROQ_API_KEY in the root .env
```

#### 2. Build and start

```bash
docker compose up --build
```

| Service   | URL                    |
|-----------|------------------------|
| Frontend  | http://localhost:3000  |
| Backend   | http://localhost:5000  |
| MongoDB   | localhost:27017        |

#### 3. Stop

```bash
docker compose down
# To also remove the MongoDB volume:
docker compose down -v
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable       | Default                                  | Description                        |
|----------------|------------------------------------------|------------------------------------|
| `PORT`         | `5000`                                   | Express server port                |
| `MONGODB_URI`  | `mongodb://localhost:27017/journal_db`   | MongoDB connection string          |
| `GROQ_API_KEY` | —                                        | **Required.** Groq API key         |
| `GROQ_MODEL`   | `llama-3.1-8b-instant`                   | Groq model ID                      |
| `NODE_ENV`     | `development`                            | Environment flag                   |
| `FRONTEND_URL` | `*`                                      | CORS allowed origin                |

### Frontend (`frontend/.env`)

| Variable       | Default | Description                          |
|----------------|---------|--------------------------------------|
| `VITE_API_URL` | `""`    | Backend base URL (empty = use proxy) |

---

## Data Models

### Journal

```
userId      String   — user identifier
ambience    String   — forest | ocean | mountain
text        String   — journal entry body (max 5000 chars)
analysis    Object   — { emotion, keywords[], summary, analyzedAt } (null until analyzed)
createdAt   Date
updatedAt   Date
```

### AnalysisCache

```
textHash    String   — SHA-256 hash of normalized entry text (unique index)
result      Object   — { emotion, keywords[], summary }
hitCount    Number   — number of cache hits
createdAt   Date     — TTL index; auto-deleted after 24 h
```

---

## Running Tests (manual)

```bash
# Health check
curl http://localhost:5000/health

# Create entry
curl -X POST http://localhost:5000/api/journal \
  -H "Content-Type: application/json" \
  -d '{"userId":"123","ambience":"forest","text":"I felt calm after listening to the rain."}'

# Analyze
curl -X POST http://localhost:5000/api/journal/analyze \
  -H "Content-Type: application/json" \
  -d '{"text":"I felt calm after listening to the rain."}'

# Get entries
curl http://localhost:5000/api/journal/123

# Get insights
curl http://localhost:5000/api/journal/insights/123
```
