# Architecture — ArvyaX AI-Assisted Journal System

## System Overview

```
Browser (React)
     │  HTTP / SSE
     ▼
 nginx (port 80)
     │  /api proxy
     ▼
Express API (port 5000)
     ├── Rate limiter  (express-rate-limit)
     ├── Helmet        (security headers)
     ├── Journal routes
     │       ├── POST /api/journal           → MongoDB write
     │       ├── GET  /api/journal/:userId   → MongoDB read
     │       ├── POST /api/journal/analyze   → Cache → Groq LLM
     │       ├── POST /api/journal/analyze/stream → Groq SSE stream
     │       └── GET  /api/journal/insights/:userId → MongoDB aggregation
     └── llmService
             ├── In-memory cache (Map, 5-min TTL, 100 entries)
             └── MongoDB TTL cache (AnalysisCache, 24-h TTL)
                         │
                         └── Groq API (llama-3.1-8b-instant)

MongoDB
  ├── journals        (Journal documents)
  └── analysiscaches  (LLM result cache with TTL index)
```

---

## Q&A

### 1. How would you scale this to 100,000 users?

**Horizontal scaling**

- Run multiple backend instances behind a **load balancer** (e.g., AWS ALB or Nginx upstream).  
  Express is stateless (no server-side sessions), so any instance can handle any request.
- Use **MongoDB Atlas** with a replica set. Reads can be distributed to secondary nodes  
  by setting `readPreference: secondaryPreferred` for non-critical queries.

**Database**

- Add indexes: `{ userId: 1, createdAt: -1 }` (already present) for the most common query pattern.  
  `{ textHash: 1 }` (already present) for cache lookups.
- Shard the `journals` collection on `userId` once a single replica set becomes a write bottleneck.
- Use **MongoDB Atlas** auto-scaling storage and compute tiers.

**LLM / async processing**

- Move analysis out of the synchronous HTTP path into a **job queue** (BullMQ + Redis).  
  `POST /analyze` enqueues a job and returns `202 Accepted` with a `jobId`.  
  The client polls `GET /analyze/:jobId` or subscribes via WebSocket/SSE for the result.
- This decouples API latency from LLM latency and allows independent scaling of workers.

**Caching**

- Replace the in-process Map cache with **Redis** (shared across all backend instances).  
  A `SET textHash result EX 86400` per analysis result.
- Cache the insights aggregation result per userId with a short TTL (e.g., 30 s).

**Infrastructure sketch**

```
Internet → CDN (static frontend assets)
        → Load Balancer
              ├── Backend Pod 1 (Node.js)
              ├── Backend Pod 2
              └── Backend Pod N
                      │
            ┌─────────┴──────────┐
          Redis              MongoDB Atlas
         (cache)          (replica set / sharded)
                                 │
                           Groq API (external)
```

---

### 2. How would you reduce LLM cost?

| Strategy | Detail |
|---|---|
| **Cache aggressively** | A SHA-256 hash of the lowercased, trimmed text is the cache key. Identical or near-identical texts only hit the LLM once. |
| **Smaller / faster models** | `llama-3.1-8b-instant` on Groq is free and fast. For bulk replay use a batch-friendly model. |
| **Limit token usage** | The prompt is constrained to `max_tokens: 300`. The structured JSON output is short by design. |
| **Deduplicate queue jobs** | Before enqueuing an analysis job, check the cache. Skip the LLM call if a result already exists. |
| **Tiered analysis** | Offer basic keyword extraction client-side (or with a tiny local model) for free; reserve LLM for premium summaries. |
| **Batch requests** | Group multiple short texts into a single LLM call when processing historical imports or admin re-analysis. |
| **TTL tuning** | 24-hour cache TTL balances freshness with cost. For production, increase to 7 days; emotions don't change for the same text. |

---

### 3. How would you cache repeated analysis?

The current implementation uses a **two-tier cache**:

**Tier 1 — In-memory (Node.js `Map`)**  
- Capacity: 100 entries (LRU eviction — oldest key removed when full).  
- TTL: 5 minutes.  
- Zero network overhead; serves the hottest requests in microseconds.

**Tier 2 — MongoDB TTL collection (`AnalysisCache`)**  
- Keyed on `textHash` (SHA-256 of normalised text).  
- `expires` TTL index auto-deletes documents after 24 hours.  
- `hitCount` is incremented on every cache hit for observability.  
- Survives backend restarts; shared across all processes.

**Tier 3 (recommended for production) — Redis**  
- Replace the in-memory Map with `ioredis`.  
- `SET key value EX 86400 NX` (set if not exists, expire in 24 h).  
- Shared across all horizontally-scaled backend instances.
- Optionally use Redis Cluster for HA.

**Cache flow**

```
Incoming text
     │
     ▼
SHA-256 hash
     │
     ├─ Tier 1 hit? → return immediately (cached: true)
     │
     ├─ Tier 2 hit? → populate Tier 1 → return (cached: true)
     │
     └─ Miss → call Groq LLM → save to Tier 2 & Tier 1 → return
```

---

### 4. How would you protect sensitive journal data?

Journal entries are personal health information. The following layers apply:

**Transport**  
- Enforce **HTTPS / TLS 1.2+** in production (via reverse proxy or Cloud Load Balancer).  
- HTTP Strict Transport Security (HSTS) header via Helmet.

**Authentication & Authorisation**  
- Add **JWT / OAuth 2.0** (e.g., Auth0 or AWS Cognito). Every request carries a signed token.  
- The `userId` claim is taken from the verified token, not the request body, preventing users  
  from reading other users' entries.  
  
  ```js
  // Instead of: const { userId } = req.body
  // Use:        const userId = req.user.sub  (from verified JWT)
  ```

**Encryption at rest**  
- Enable **MongoDB encrypted storage engine** (Queryable Encryption or CSFLE for field-level encryption of `text` and `analysis`).  
- Alternatively, encrypt the `text` field at the application layer (AES-256-GCM) before storing; decrypt in the controller response.

**API hardening**  
- Helmet sets `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy` to prevent XSS/clickjacking.  
- Body size is limited to 10 KB to prevent payload-flooding attacks.  
- Rate limiting prevents brute-force enumeration.  
- Input trimming + Mongoose schema validation prevents injection.

**LLM data minimisation**  
- Never send PII (names, locations) in the LLM prompt — journal text only.  
- Add a redaction step before calling Groq to strip potential PII patterns (email, phone) if this becomes a compliance requirement.

**Audit logging**  
- Log all access to journal data (userId, endpoint, timestamp) to an append-only log sink (CloudWatch, Datadog) for GDPR/HIPAA audit trails.
- Never log the journal text content itself.

**Compliance**  
- Store data in a region that satisfies the user's jurisdiction (GDPR for EU users).  
- Provide a `DELETE /api/journal/:userId` endpoint (right to erasure) and cascade-delete the user's `AnalysisCache` entries.
