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

## Phase 4: Incident Service

`incident-service` runs on port `4004`, owns the separate `sentinel_incident` database, and is exposed through the gateway under `/api/incidents`. Every operation verifies real organization membership; every incident lookup also includes `organizationId`, preventing cross-tenant access even when an incident ID is known.

Mutations that affect incident history write the incident/comment and its append-only timeline event in one PostgreSQL transaction. Status transitions are limited to `TRIGGERED -> ACKNOWLEDGED -> INVESTIGATING -> MITIGATING -> RESOLVED`, with the deliberate shortcut `TRIGGERED -> INVESTIGATING`. Phase 4 hard-deletes incidents for Owner/Admin users as specified; durable audit retention should replace this before production compliance use.

Create an incident for a catalog service:

```bash
curl -s -X POST "http://localhost:4000/api/incidents/organizations/$ORG_ID/incidents" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"serviceId\":\"$SERVICE_ID\",\"title\":\"Payment failures increased\",\"description\":\"Checkout is returning HTTP 500\",\"severity\":\"SEV1\"}"

INCIDENT_ID="paste-incident-id"
```

List and filter incidents:

```bash
curl -s "http://localhost:4000/api/incidents/organizations/$ORG_ID/incidents?status=TRIGGERED&severity=SEV1&page=1&limit=20" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

Acknowledge, investigate, mitigate, and resolve it:

```bash
for STATUS in ACKNOWLEDGED INVESTIGATING MITIGATING RESOLVED; do
  curl -s -X PATCH "http://localhost:4000/api/incidents/organizations/$ORG_ID/incidents/$INCIDENT_ID/status" \
    -H "Authorization: Bearer $OWNER_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"status\":\"$STATUS\"}"
done
```

Assign the incident to an organization member:

```bash
curl -s -X PATCH "http://localhost:4000/api/incidents/organizations/$ORG_ID/incidents/$INCIDENT_ID/assignee" \
  -H "Authorization: Bearer $OWNER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"userId\":\"$ENGINEER_USER_ID\"}"
```

Add a comment, then inspect the comments and immutable timeline:

```bash
curl -s -X POST "http://localhost:4000/api/incidents/organizations/$ORG_ID/incidents/$INCIDENT_ID/comments" \
  -H "Authorization: Bearer $ENGINEER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"body":"Connection pool saturation confirmed."}'

curl -s "http://localhost:4000/api/incidents/organizations/$ORG_ID/incidents/$INCIDENT_ID/comments" \
  -H "Authorization: Bearer $OWNER_TOKEN"

curl -s "http://localhost:4000/api/incidents/organizations/$ORG_ID/incidents/$INCIDENT_ID/timeline" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

Only a comment's author can edit or delete it, including when another caller is an Owner or Admin. Viewers can read incidents, comments, and timelines but all mutation routes return `403`.

## Phase 5: Real-time collaboration

`realtime-service` runs on port `4005` and owns no database. REST remains behind the API Gateway, while Socket.IO connects directly to `http://localhost:4005` using the `/socket.io` path. This is the deliberate WebSocket entry-point exception; the API Gateway remains the only REST entry point.

Socket connections require the same access JWT issued by Auth Service. Before joining `incident:{incidentId}`, Realtime Service verifies both organization membership and that the incident belongs to that organization through synchronous REST calls. Clients cannot request arbitrary Socket.IO rooms.

Incident Service publishes these best-effort messages to the `sentinel:realtime` Redis channel only after its PostgreSQL mutation commits:

- `incident:created`
- `incident:updated`
- `incident:status-changed`
- `incident:severity-changed`
- `incident:assignee-changed`
- `incident:comment-added`
- `incident:comment-updated`
- `incident:comment-deleted`
- `incident:deleted`

Socket.IO's Redis adapter distributes broadcasts across multiple Realtime Service instances. Delivery is ephemeral and at-most-once from the UI's perspective: a disconnected client can miss an event and must re-fetch authoritative REST state. Redis or Realtime Service failure never rolls back or fails a committed incident mutation.

Browser connection example:

```ts
import { io } from "socket.io-client";

const socket = io("http://localhost:4005", {
  path: "/socket.io",
  auth: { token: accessToken }
});

socket.emit("incident:join", { organizationId: ORG_ID, incidentId: INCIDENT_ID }, console.log);
socket.on("incident:status-changed", console.log);
```

Run the included two-client smoke test after both users are members of the same organization. Choose a valid next lifecycle state for `NEXT_STATUS`:

```bash
cd services/realtime-service
ORG_ID="$ORG_ID" \
INCIDENT_ID="$INCIDENT_ID" \
ENGINEER_A_TOKEN="$OWNER_TOKEN" \
ENGINEER_B_TOKEN="$ENGINEER_TOKEN" \
NEXT_STATUS="ACKNOWLEDGED" \
npm run test:realtime
```

The script connects both users, authorizes both room joins, performs the REST status mutation, and exits successfully only when both clients receive `incident:status-changed`.

Isolation check: connect a user who is not a member of `$ORG_ID` and emit `incident:join` with that organization and incident. The acknowledgment returns `{ok:false}` and that socket receives no room events. Resilience check: stop `realtime-service` or Redis, mutate an incident through REST, and confirm the REST request still succeeds; after restart, re-fetch the incident to obtain current state.

## Phase 6: Telemetry ingestion and Kafka

`ingestion-service` runs on port `4006` and is a stateless front door for logs, metrics, and generic application events. It owns no database. Backend services authenticate with `x-api-key`; human JWTs do not authenticate ingestion routes.

The raw key is sent over an internal REST call to Service Catalog's protected `/internal/api-keys/verify` endpoint. Organization and service identity always come from that verified key, never from the telemetry body. The service validates the complete batch before publishing anything, enriches each record with a versioned envelope, and publishes with `serviceId` as the partition key.

Kafka topics are created with three local-development partitions and replication factor one:

- `sentinel.telemetry.logs.v1`
- `sentinel.telemetry.metrics.v1`
- `sentinel.telemetry.events.v1`

Kafka guarantees ordering only within a partition. A `202` response means Kafka acknowledged the records, not that a Phase 7 worker has persisted them. If Kafka cannot acknowledge the publish, ingestion returns `503`. Redis-backed per-service rate limiting fails open if Redis is unavailable.

Send a log using the API key created in Phase 3:

```bash
curl -i -X POST http://localhost:4000/api/ingest/v1/logs \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"level":"ERROR","message":"Database connection failed","attributes":{"host":"postgres"}}]}'
```

Send a metrics batch and a generic application event:

```bash
curl -i -X POST http://localhost:4000/api/ingest/v1/metrics \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"name":"http_request_error_rate","value":0.12,"type":"GAUGE","unit":"ratio","attributes":{"route":"/checkout"}}]}'

curl -i -X POST http://localhost:4000/api/ingest/v1/events \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"records":[{"name":"deployment.completed","severity":"INFO","message":"v4.7 deployed","attributes":{"version":"v4.7","commit":"abc123"}}]}'
```

Inspect each topic from another terminal:

```bash
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server kafka:9092 \
  --topic sentinel.telemetry.logs.v1 \
  --from-beginning
```

The envelope contains trusted `organizationId`, `serviceId`, `serviceName`, `schemaVersion: 1`, timestamps, and the ingestion request ID. It never contains the raw API key.

After revoking the key with the Phase 3 command, another ingestion request returns `401`. To verify Kafka failure semantics, stop Kafka and retry:

```bash
docker compose stop kafka
# Repeat a valid ingestion request; expected response is 503.
docker compose start kafka
```

Readiness reports Kafka connectivity:

```bash
curl -i http://localhost:4006/ready
```

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

cd ../incident-service
npm install
npm run prisma:generate
npm test
npm run build

cd ../realtime-service
npm install
npm test
npm run build

cd ../ingestion-service
npm install
npm test
npm run build

cd ../..
docker compose config
```

## Project specifications

Detailed Phase 1–14 specifications are stored under [`docs/phases`](docs/phases).
