# Artifacts — Webhook Relay

Canonical design and API-exercise artifacts for **both** implementations. Version folders (`python-version/`, `nestjs-version/`) keep only runnable code and their own READMEs; they link here.

| Artifact | Purpose |
| --- | --- |
| [`architecture.md`](architecture.md) | Shared system analysis + architecture for both stacks (no duplicated FR/NFR) |
| [`python-core-implementation-plan.md`](python-core-implementation-plan.md) | Python/Django core-slice build checklist (implementation only) |
| [`postman/webhook_relay_python.postman_collection.json`](postman/webhook_relay_python.postman_collection.json) | Postman collection — Python API |
| [`postman/webhook_relay_nestjs.postman_collection.json`](postman/webhook_relay_nestjs.postman_collection.json) | Postman collection — NestJS API |

Product brief: [`../requirements.md`](../requirements.md).

## How to use Postman

1. Import the collection for the stack you are running.
2. Set collection variables (`api_key` for Python, or run **Get Token** for NestJS).
3. Follow the folder order: subscriptions → events → deliveries.
