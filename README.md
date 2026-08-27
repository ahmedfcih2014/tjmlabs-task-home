# Webhook Relay — TJM Labs Take-Home

A small webhook relay service: callers register destinations and event types, submit events, and inspect delivery outcomes. The service reliably delivers signed HTTP POSTs to every matching subscription.

The product brief lives in [`requirements.md`](requirements.md).

This repository contains **two independent implementations** of the same problem. They share the same goals but differ in stack, API shape, and design choices.

---

## Python version (reference / AI-generated)

**Path:** [`python-version/`](python-version/)

The Python implementation follows the original brief (Django + django-ninja + SQLite + pytest + uv). It was **generated with AI** using Backend Architect, System Analyst, and Software Architect agent skills, then reviewed by a human to confirm APIs and the delivery worker behave as designed.

> The human review focused on the **artifacts** and end-to-end behavior verification — not a full line-by-line audit of every generated source file.

**Documentation:** [`python-version/README.md`](python-version/README.md)

Includes quick start, API reference, Postman collection, tests, architecture notes, and production hardening notes.

---

## NestJS version (TypeScript)

**Path:** [`nestjs-version/`](nestjs-version/)

A NestJS + TypeORM + SQLite reimplementation of the webhook relay. Built as a modular TypeScript service with JWT auth, encrypted subscriber credentials, a DB-backed delivery outbox, and an in-process cron worker.

**Documentation:** [`nestjs-version/README.md`](nestjs-version/README.md)

Includes setup, environment configuration, API walkthrough, architecture overview, and design trade-offs.

---

## Which one to run?

| | Python | NestJS |
| --- | --- | --- |
| Stack | Django, django-ninja, uv | NestJS, TypeORM, pnpm |
| Auth | API key (`Bearer whr_...`) | JWT (`Bearer <token>`) |
| Worker | Separate management command | In-process cron (same process as API) |
| Docs | Postman collection included | Manual / curl examples in README |

Pick the folder that matches the stack you want to evaluate, then follow that version's README.
