# Implement Webhook Relay — Python Core Slice

Build checklist for [`../python-version/`](../python-version/). Design authority: [`architecture.md`](architecture.md) (§1 shared + §4 Python). Do not duplicate FR/NFR here.

## Scope

**In**
- Create + get subscription (signing secret returned once on create)
- Send event → match → enqueue deliveries → `202`
- List deliveries for a subscription
- API-key auth (`Bearer`)
- Worker: claim → sign → POST → retry (1s/5s/25s) → `dead`
- HMAC-SHA256 + timestamp outbound headers
- Fernet encryption for signing + optional destination secrets
- Essential pytest + README (decisions / harden later / left out)

**Out (document as deliberate omissions)**
- Rotate-secret, PATCH, soft-delete, cursor pagination polish
- Account multi-tenancy UI / public signup
- Aggressive SSRF (private-IP/DNS rebinding); allow `http://127.0.0.1` in DEBUG for local tests
- Delivery detail-by-id, healthz polish, metrics hooks, Celery/Redis

## Locked defaults

| Concern | Choice |
| --- | --- |
| Auth | Single `ApiKey` model (hashed); bootstrap via `create_api_key` |
| IDs | Prefixed UUID4 (`sub_`, `evt_`, `dlv_`, `whr_`, `whsec_`) |
| Queue | `Delivery` rows + `manage.py run_delivery_worker` |
| Retries | max 4 attempts; backoff 1s / 5s / 25s; retryable = timeout/network/408/429/5xx |
| HTTP client | stdlib `urllib.request`, 5s timeout, no redirects |
| Crypto | `cryptography` Fernet via `WEBHOOK_RELAY_FERNET_KEY` |
| Event types | JSON list on subscription; exact-match; lowercase normalize |
| Idempotency | Optional `idempotency_key` on ingest (unique when set) |
| Destination URL | Absolute URL; DEBUG allows localhost HTTP; prod prefers `https` |

## Target layout

```text
python-version/
  pyproject.toml, uv.lock, manage.py, README.md, .env.example
  config/          # settings, urls, api (NinjaAPI), wsgi
  apps/
    accounts/      # ApiKey model, Bearer auth, create_api_key command
    webhooks/      # models, schemas, api routers, services, delivery/, crypto.py
    common/        # ids, errors
  tests/           # unit + api + delivery
```

Shared artifacts live at repo root [`../artifacts/`](./) (architecture + Postman).

## API surface (core)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/subscriptions` | `destination_url`, `event_types`, optional `destination_secret` → `201` + `signing_secret` once |
| GET | `/api/v1/subscriptions/{id}` | no secrets |
| POST | `/api/v1/events` | `event_type`, `payload`, optional `idempotency_key` → `202` |
| GET | `/api/v1/subscriptions/{id}/deliveries` | status, attempts, last_error, timestamps |

Auth: `Authorization: Bearer <api_key>`.

Outbound headers: `X-Webhook-Id`, `X-Webhook-Timestamp`, `X-Webhook-Signature` (`v1=<hex>`), `X-Webhook-Event-Type`, `X-Webhook-Event-Id`; optional `Authorization: Bearer <destination_secret>`.

Canonical HMAC string: `{timestamp}.{raw_body_bytes}`.

## Implementation order

1. **Scaffold** — Django + uv; pin `django`, `django-ninja`, `cryptography`, `pytest`, `pytest-django`; SQLite WAL; env keys.
2. **Common + crypto + ids** — prefixed UUID helpers, Fernet, error envelope.
3. **Accounts** — `ApiKey`, Bearer auth, `create_api_key`.
4. **Models + migrations** — Subscription, Event, Delivery, DeliveryAttemptLog.
5. **Services + API** — create/get subscription; ingest + matching + enqueue; list deliveries.
6. **Delivery pipeline** — signing, retry, http_client, light URL validation, worker command.
7. **Tests** — unit (HMAC, Fernet, retry, matching); API (401, secret-once, fan-out, idempotency); delivery (mocked urllib).
8. **README** — run API + worker, create API key, decisions, harden-before-prod, omissions.

## Done when

- `uv sync` + migrate + create API key works
- Core four endpoints behave as above
- Worker delivers with signature and retries flaky destinations
- `pytest` green for essential coverage
- README present and honest about scope
- Postman collection under [`postman/webhook_relay_python.postman_collection.json`](postman/webhook_relay_python.postman_collection.json) exercises the happy path
