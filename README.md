# SentinelAI

SentinelAI is a distributed incident-management and observability platform that detects production failures, creates incidents, and uses AI/RAG to produce evidence-backed root-cause hypotheses.

## Phase 1: API Gateway + Auth Service

Implemented services:

- `api-gateway` on port `4000`: request IDs, strict CORS, Helmet, Redis-backed IP rate limiting that fails open, and `/api/auth/*` proxying.
- `auth-service` on port `4001`: registration, login, JWT access/refresh tokens, atomic refresh rotation, token-reuse detection, logout, session management, and HTTP-only refresh cookies.
- PostgreSQL 16 and Redis 7 for local development.

The gateway contains no business logic. Refresh tokens are stored only as SHA-256 hashes. Access and refresh tokens use different secrets, issuers/audiences are validated, passwords use bcrypt with 12 rounds, and request bodies are validated with Zod.

## Run with Docker

Requirements: Docker with Docker Compose.

```bash
cp .env.example .env
docker compose up --build
```

For local development, the Compose file supplies usable fallback secrets. Replace them in `.env` before sharing or deploying the project.

Health checks:

```bash
curl http://localhost:4000/health
curl http://localhost:4001/health
```

## Test the auth flow

Register and save the response:

```bash
curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"akash@example.com","password":"StrongPass123!","name":"Akash"}'
```

Login. Copy `accessToken` and `refreshToken` from the response:

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"akash@example.com","password":"StrongPass123!"}'
```

Get the current user:

```bash
ACCESS_TOKEN="paste-access-token"
curl -s http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Rotate the refresh token. The old refresh token becomes unusable immediately:

```bash
REFRESH_TOKEN="paste-refresh-token"
curl -s -X POST http://localhost:4000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

List sessions:

```bash
curl -s http://localhost:4000/api/auth/sessions \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Logout using the newest refresh token:

```bash
NEW_REFRESH_TOKEN="paste-new-refresh-token"
curl -i -X POST http://localhost:4000/api/auth/logout \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$NEW_REFRESH_TOKEN\"}"
```

Reusing the old token after rotation returns `401` and revokes the user's active sessions.

## Local checks

```bash
cd services/auth-service
npm install
npm run prisma:generate
npm test
npm run build

cd ../api-gateway
npm install
npm run build

cd ../..
docker compose config
```

## Project specifications

Detailed Phase 1–14 specifications are stored under [`docs/phases`](docs/phases).
