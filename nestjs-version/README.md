# Webhook Relay — NestJS

NestJS implementation of the TJM Labs webhook relay take-home. Callers register subscriptions (destination URL + event types + secret), submit events, and inspect per-subscription delivery status. A background worker delivers signed HTTP POSTs with retries and exponential backoff.

**Stack:** NestJS · TypeORM · SQLite (better-sqlite3) · JWT · pnpm

---

## Quick start

### Prerequisites

- Node.js 18+ (for native `fetch` and `AbortSignal.timeout`)
- pnpm

### 0. Run testing

```bash
cd nestjs-version
pnpm test:e2e
```

This will run API tests, to make sure everything implemented as API layer is fine, you should get all green

### 1. Install dependencies

```bash
cd nestjs-version
pnpm install
```

### 2. Configure environment

Create a `.env` file in `nestjs-version/`:

```env
PORT=3000

JWT_SECRET=change-me-in-production
JWT_EXPIRES_IN=1d

# 32-byte key as 64 hex characters (AES-256-GCM for subscriber secrets)
ENCRYPTION_KEY=<64-char-hex>
```

Generate an encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Run the server

```bash
pnpm run start:dev
```

The API listens on `http://localhost:3000`. TypeORM auto-creates/syncs the SQLite schema on startup (`database.sqlite` in the project root).

The delivery worker runs **inside the same process** via `@nestjs/schedule` (polls every 5 seconds). No separate worker terminal is required.

### 3b. Run the webhook simulator (optional)

A tiny Express server at the repo root logs incoming webhook POSTs so you can verify delivery:

```bash
# Terminal 2 — from repo root
cd simulator
pnpm install
pnpm start
```

Listens on `http://127.0.0.1:3030`. Use `http://127.0.0.1:3030/webhook` as `destinationUrl` when creating a subscription.

### 4. Try the flow

**Get a JWT** (hardcoded dev credentials: `admin` / `admin`):

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/get-token \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

Save the `access_token` from the response.

**Create a subscription:**

```bash
curl -s -X POST http://localhost:3000/api/v1/subscrptions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "http://127.0.0.1:9001/webhook",
    "destinationSecret": "my-receiver-secret",
    "eventTypes": ["order.created"]
  }'
```

**Send an event:**

```bash
curl -s -X POST http://localhost:3000/api/v1/events \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "order.created",
    "payload": { "order_id": "ord_123", "total": 42.5 },
    "idempotencyKey": "evt-001"
  }'
```

**Inspect deliveries** (use the subscription `id` from the create response):

```bash
curl -s "http://localhost:3000/api/v1/subscrptions/1/deliveries?page=1&limit=10" \
  -H "Authorization: Bearer <token>"
```

---

## API

All endpoints except auth require `Authorization: Bearer <access_token>`.

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/auth/get-token` | Exchange username/password for JWT |
| `GET` | `/api/v1/subscrptions` | List subscriptions (paginated) |
| `POST` | `/api/v1/subscrptions` | Create subscription → `201` |
| `PUT` | `/api/v1/subscrptions` | Upsert subscription by destination URL |
| `GET` | `/api/v1/subscrptions/:id` | Get one subscription (no secret) |
| `GET` | `/api/v1/subscrptions/:id/deliveries` | Delivery history for a subscription |
| `POST` | `/api/v1/events` | Ingest event and enqueue deliveries |

> Route path is intentionally spelled `subscrptions` (matches current controller).

### Create subscription

```json
{
  "destinationUrl": "https://example.com/webhook",
  "destinationSecret": "receiver-credential",
  "eventTypes": ["order.created", "order.updated"]
}
```

The `destinationSecret` is encrypted at rest (AES-256-GCM) and never returned in API responses.

### Send event

```json
{
  "eventType": "order.created",
  "payload": { "order_id": "ord_123" },
  "idempotencyKey": "optional-client-key"
}
```

- If `idempotencyKey` is omitted, a UUID is generated.
- Replaying the same key with the same payload/type returns the existing event (no duplicate deliveries).
- Replaying with a different payload or type → `409 Conflict`.

### Outbound webhook (worker → destination)

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Webhook-Signature` | `sha256=<hmac_sha256_hex>` |
| `X-Event-Id` | event id |
| `X-Event-Type` | event type |

Body:

```json
{ "id": "<event-id>", "eventType": "order.created", "payload": { ... } }
```

HMAC is computed over the exact JSON body bytes using the decrypted `destinationSecret`.

### Delivery policy

| Setting | Value |
| --- | --- |
| Max attempts | 5 |
| Backoff | `2^attemptCount` seconds, capped at 5 minutes |
| HTTP timeout | 5 seconds |
| Terminal states | `success` (2xx), `dead` (exhausted retries) |
| Retryable | non-2xx, network errors, timeouts |

Delivery statuses: `pending` → `in_progress` → `success` | `failed` (scheduled retry) | `dead`.

---

## Implementation overview

```text
POST /events
  └─ EventsService: persist event + idempotency check
       └─ DeliveryService.enqueueForEvent: match subscriptions by eventType
            └─ insert DeliveryAttempt rows (pending)

Cron worker (every 5s)
  └─ DeliveryWorker: claim due attempts (batch of 5)
       └─ DeliveryService.processAttempt
            ├─ decrypt destinationSecret
            ├─ WebhookClient: signed POST via fetch
            └─ update status / schedule retry / mark dead
```

### Modules

| Module | Responsibility |
| --- | --- |
| `auth` | JWT issuance (`admin`/`admin` stub), `AuthGuard` |
| `subscriptions` | CRUD-ish subscription management, AES encryption of secrets |
| `events` | Event ingest with SHA-256 payload hashing and idempotency |
| `deliveries` | Outbox (`DeliveryAttempt`), webhook client, cron worker |
| `shared/filters` | Uniform error response shape |

### Data model

- **Subscription** — destination URL, encrypted secret, related event types
- **SubscriptionEventType** — event type names linked to a subscription
- **Event** — event type, JSON payload (stored as text), idempotency key, payload hash
- **DeliveryAttempt** — one row per (event, subscription) pair; tracks status, attempts, HTTP result, timing

Fan-out uses a unique index on `(eventId, subscriptionId)` so duplicate enqueue is safe on retries.

### Security

- **Inbound:** JWT bearer on all protected routes; global validation pipe (whitelist + forbid unknown fields).
- **Secrets at rest:** `destinationSecret` encrypted with AES-256-GCM (`ENCRYPTION_KEY` env var).
- **Outbound authenticity:** HMAC-SHA256 signature header on every webhook POST.
- **Secrets in transit:** decrypted only at delivery time, never exposed via API.

---

## Key decisions

- **DB outbox + in-process cron worker** — no Redis/Bull; durable fan-out on SQLite with minimal dependencies. Trade-off: not ideal for multi-instance horizontal scaling without external locking.
- **Async delivery** — `POST /events` returns after persist + enqueue; outbound HTTP never blocks the request path.
- **HMAC over raw JSON body** — simple receiver verification; no timestamp header (simpler than the Python version's `{timestamp}.{body}` scheme).
- **JWT stub auth** — hardcoded `admin`/`admin` for the take-home; production would use real user/API-key storage.
- **TypeORM synchronize** — fast local dev; production would use migrations and Postgres.
- **At-least-once delivery** — receivers should dedupe on event id.

## What I'd harden before production

- Postgres with `SELECT FOR UPDATE SKIP LOCKED` for multi-worker claiming
- Real API key / user management instead of hardcoded credentials
- Explicit DB migrations (disable `synchronize`)
- SSRF controls on destination URLs (private IP deny, no redirects)
- Rate limiting per caller and per destination
- KMS-backed encryption key rotation
- Timestamp + replay window on webhook signatures
- Metrics, structured logging, health/readiness endpoints
- HTTPS-only destinations, circuit breakers, auto-disable failing subscriptions

## Deliberately left out

- Separate worker process / message queue (Redis, Bull, Kafka)
- DELETE subscription, PATCH by id (only PUT upsert by URL)
- Delivery detail-by-id endpoint
- Comprehensive e2e / integration test suite
- Postman collection
- Fixing the `subscrptions` route typo (kept for API stability)

---

## Scripts

```bash
pnpm run start:dev    # watch mode
pnpm run build        # compile
pnpm run start:prod   # run compiled dist/
pnpm run lint         # ESLint
pnpm run test         # unit tests (minimal coverage today)
pnpm run test:e2e     # e2e scaffold
```

---

## Project layout

```text
nestjs-version/
  src/
    config/              TypeORM / SQLite config
    modules/
      auth/              JWT token + guard
      subscriptions/     subscription CRUD, encryption
      events/              event ingest + idempotency
      deliveries/        outbox, webhook client, cron worker
    shared/filters/      global exception filter
  test/                  e2e scaffold
  database.sqlite        local SQLite file (created at runtime)
```

Simulator (repo root): [`../simulator/`](../simulator/)

---

## Related

- Product brief: [`../requirements.md`](../requirements.md)
- Python reference implementation: [`../python-version/README.md`](../python-version/README.md)
- Repo overview: [`../README.md`](../README.md)
