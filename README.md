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

## Phase 2: Organization Service

`organization-service` runs on port `4002` and owns the separate `sentinel_org` database. It provides organizations, membership roles, invitations, owner protections, and the security-critical tenant-isolation middleware.

Register two users through the gateway and copy their access tokens:

```bash
curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@example.com","password":"StrongPass123!","name":"Owner"}'

curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"engineer@example.com","password":"StrongPass123!","name":"Engineer"}'

OWNER_TOKEN="paste-owner-access-token"
ENGINEER_TOKEN="paste-engineer-access-token"
```

Create an organization and copy its `id`:

```bash
curl -s -X POST http://localhost:4000/api/organizations \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Acme Engineering"}'

ORG_ID="paste-organization-id"
```

Invite the second user and copy the returned invitation `token`:

```bash
curl -s -X POST "http://localhost:4000/api/organizations/$ORG_ID/invitations" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"engineer@example.com","role":"ENGINEER"}'

INVITATION_TOKEN="paste-invitation-token"
```

Before accepting, this request intentionally returns `404` because the second user is not a member:

```bash
curl -i "http://localhost:4000/api/organizations/$ORG_ID" \
  -H "Authorization: Bearer $ENGINEER_TOKEN"
```

Accept the invitation, list members, and copy the invited user's `userId`:

```bash
curl -s -X POST "http://localhost:4000/api/organizations/invitations/$INVITATION_TOKEN/accept" \
  -H "Authorization: Bearer $ENGINEER_TOKEN"

curl -s "http://localhost:4000/api/organizations/$ORG_ID/members" \
  -H "Authorization: Bearer $OWNER_TOKEN"

ENGINEER_USER_ID="paste-engineer-user-id"
```

Change the invited member's role:

```bash
curl -s -X PATCH "http://localhost:4000/api/organizations/$ORG_ID/members/$ENGINEER_USER_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role":"ADMIN"}'
```

## Phase 3: Service Catalog

`service-catalog-service` runs on port `4003`, owns the separate `sentinel_catalog` database, and verifies organization access through a real synchronous request to Organization Service. API keys are stored only as SHA-256 hashes and the full key is returned once.

Using an organization ID and an Owner, Admin, or Engineer access token from the earlier flows, register a backend service:

```bash
curl -s -X POST "http://localhost:4000/api/catalog/organizations/$ORG_ID/services" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"payment-service","description":"Processes payments","environment":"PRODUCTION","healthCheckUrl":"https://payments.example.com/health","language":"TypeScript","framework":"Express"}'

SERVICE_ID="paste-service-id"
```

Create an API key and save the returned `key` immediately—it cannot be retrieved again:

```bash
curl -s -X POST "http://localhost:4000/api/catalog/organizations/$ORG_ID/services/$SERVICE_ID/api-keys" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"production key","expiresInDays":30}'

API_KEY="paste-one-time-api-key"
KEY_ID="paste-api-key-id"
```

Send a heartbeat and fetch the current service status:

```bash
curl -s -X POST http://localhost:4000/api/catalog/v1/heartbeat \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"HEALTHY","version":"v1.0.0"}'

curl -s "http://localhost:4000/api/catalog/organizations/$ORG_ID/services/$SERVICE_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

After more than 90 seconds without a heartbeat, the stored status is displayed as `UNKNOWN` with `isStale: true`:

```bash
sleep 95
curl -s "http://localhost:4000/api/catalog/organizations/$ORG_ID/services/$SERVICE_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

Revoke the API key and confirm it can no longer report health:

```bash
curl -i -X DELETE "http://localhost:4000/api/catalog/organizations/$ORG_ID/services/$SERVICE_ID/api-keys/$KEY_ID" \
  -H "Authorization: Bearer $OWNER_TOKEN"

curl -i -X POST http://localhost:4000/api/catalog/v1/heartbeat \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"HEALTHY"}'
```

The final request returns `401`.

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

cd ../organization-service
npm install
npm run prisma:generate
npm test
npm run build

cd ../service-catalog-service
npm install
npm run prisma:generate
npm test
npm run build

cd ../..
docker compose config
```

## Project specifications

Detailed Phase 1–14 specifications are stored under [`docs/phases`](docs/phases).
