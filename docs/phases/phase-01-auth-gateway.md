# Phase 1 — API Gateway + Auth Service

## Scope

Build the foundational API Gateway and Auth Service using Node.js, Express, TypeScript, Prisma, PostgreSQL, Redis, and Docker Compose.

## Auth Service

- Port `4001`, routes under `/auth`.
- Register, login, refresh, logout, current-user, session listing/revocation, and logout-all endpoints.
- Access JWT: 15-minute lifetime with `sub`, `email`, and `sid` claims.
- Refresh JWT: 7-day lifetime with `sub`, `sid`, and `jti` claims.
- Store only SHA-256 refresh-token hashes.
- Rotate refresh tokens atomically and revoke all sessions when reuse is detected.
- Hash passwords with bcrypt using at least 10 rounds.
- Zod validation, layered routes/controllers/services/repositories, centralized errors, strict CORS, Helmet, and HTTP-only cookies.

## API Gateway

- Port `4000`; the only public application entry point.
- Proxy `/api/auth/*` to Auth Service while preserving request IDs.
- Redis-backed per-IP rate limiting at 100 requests per minute.
- Fail open and log when Redis is unavailable.
- Contain cross-cutting concerns only—no authentication business logic.

## Local infrastructure

- PostgreSQL 16 with an Auth Service-owned database.
- Redis 7.
- Health checks and dependency ordering in Docker Compose.
- `docker compose up --build` starts the complete phase.

