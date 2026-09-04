I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams. Full product context:
SentinelAI lets companies connect their backend microservices to it. Those
services stream logs/metrics/events in. SentinelAI detects failures,
automatically creates incidents, lets engineers collaborate on them in
real time, and uses an AI+RAG agent to investigate and suggest root causes
using evidence from logs, metrics, deployments, runbooks, and past incidents.
This is built as small, focused microservices communicating via synchronous
REST (for immediate answers) and Kafka events (for high-volume/async work,
in later phases). Each service owns its own database — no service ever
reads another service's tables directly. When one service needs to know
something owned by another service, it makes a real HTTP call to it.
Full tech stack across the whole project (for context):

- Frontend: Next.js + TypeScript (not part of this phase)
- Backend microservices: Node.js + Express + TypeScript
- AI/RAG service only (later phase): Python + FastAPI
- PostgreSQL (one database per service) + Prisma ORM
- Redis, Kafka (later phases)
- Docker + Docker Compose locally, AWS ECS later

\=== WHAT ALREADY EXISTS (Phases 1-2 — already built, working) ===

- auth-service (port 4001): register/login/refresh/logout. Issues JWT
  access tokens (15 min expiry, payload {sub: userId, email}, signed with
  JWT\_ACCESS\_SECRET).
- organization-service (port 4002): multi-tenancy. Organizations, members
  with roles (OWNER/ADMIN/ENGINEER/VIEWER), invitations. Verifies the same
  JWT access tokens auth-service issues (shares JWT\_ACCESS\_SECRET). Has:
  - GET /organizations/ → returns org details AND includes a `yourRole`
    field showing the calling user's role, but returns 404 if the caller
    isn't a member at all. This existing endpoint is what you'll use to
    check membership from the new service (see below).
  - Has its own PostgreSQL database (sentinel\_org), separate from auth-service's.
- api-gateway (port 4000): the only service the frontend talks to. Proxies
  /api/auth/\* → auth-service, /api/organizations/\* → organization-service.
  Adds x-request-id headers, does Redis-backed rate limiting. No business
  logic itself.
- docker-compose.yml running postgres, redis, auth-service,
  organization-service, api-gateway together. Postgres has an init script
  mechanism (files in infrastructure/postgres-init/) that creates additional
  databases on container startup — you'll add to this.

\=== YOUR TASK: PHASE 3 — Service Catalog Service ===
Build the service where companies register their backend services (e.g.
"payment-service", "order-service"), get API keys for them, and where each
registered service's health status lives. This is what later phases
(ingestion, alerts, incidents) will reference.
Tech: Node.js, Express, TypeScript, Prisma, its own PostgreSQL database
(name it sentinel\_catalog).
\--- 1. DATA MODEL (Prisma) ---
enum Environment { DEVELOPMENT, STAGING, PRODUCTION }
enum ServiceStatus { HEALTHY, DEGRADED, DOWN, UNKNOWN }

- Service: id (uuid), organizationId (plain string, no cross-DB FK), name,
  description (optional), environment (default PRODUCTION),
  healthCheckUrl (optional, must be a valid URL if provided),
  githubRepository (optional), team (optional), language (optional),
  framework (optional), ownerUserId (optional, plain string),
  status (default UNKNOWN), lastHeartbeatAt (optional datetime),
  lastDeploymentVersion (optional), createdAt, updatedAt.
  Unique constraint on (organizationId, name) — no duplicate service names
  within one org.
- ApiKey: id (uuid), serviceId (FK, cascade delete), name (human label like
  "production key"), keyPrefix (first \~16 chars of the key, for display),
  keyHash (unique, SHA-256 of the full key — NEVER store the raw key),
  revoked (bool, default false), lastUsedAt (optional), expiresAt
  (optional), createdAt

\--- 2. TWO KINDS OF CALLERS TO THIS SERVICE ---
This service has to authenticate two completely different kinds of clients:
A) HUMAN USERS via the dashboard — authenticated with the same JWT access
tokens as before (Authorization: Bearer \<token>), scoped to an
organization they're a member of. These hit the CRUD endpoints below.
B) REGISTERED BACKEND SERVICES reporting their own health — authenticated
with an API key (x-api-key header), not a JWT. These only hit the
heartbeat endpoint. A service doesn't have a "user identity" — the API
key IS its identity.
Build separate middleware for each. Do not mix these authentication paths.
\--- 3. CROSS-SERVICE MEMBERSHIP CHECK (the important architectural piece) ---
This service does NOT have access to organization-service's database and
must never query it directly. Instead, build a requireOrgMembership
(allowedRoles?: Array<'OWNER'|'ADMIN'|'ENGINEER'|'VIEWER'>) middleware that:

- Reads req.params.organizationId
- Takes the incoming request's Authorization header and forwards it,
  unchanged, in a GET request to `${ORGANIZATION_SERVICE_URL}/organizations/
  ${organizationId}` (use the Node 20 global fetch — no extra HTTP library
  needed)
- If that call returns 404 → this middleware also returns 404 (org doesn't
  exist or caller isn't a member — same response either way, don't leak
  which)
- If it returns 401 → return 401 (bad/expired token)
- If it returns anything else non-2xx, or the fetch itself throws (network
  error) → return 502 with a clear "could not verify organization
  membership" message — don't silently allow the request through
- If it returns 200, parse the JSON body's `yourRole` field. If
  allowedRoles was provided and yourRole isn't in it → 403. Otherwise
  attach the role to the request and call next().

This is a real synchronous service-to-service REST call, not a mock.
ORGANIZATION\_SERVICE\_URL needs to be an env var, defaulting to
[http://localhost:4002](http://localhost:4002) for local dev and pointed at the Docker service name
in docker-compose.
\--- 4. API KEY GENERATION AND VERIFICATION ---

- Generate keys as `snt_live_<48 hex chars from crypto.randomBytes(24)>`
- Store only the SHA-256 hash of the full key. Also store a keyPrefix
  (first \~16-24 chars of the raw key) purely for human-readable display in
  lists — never enough characters to reconstruct anything useful.
- The full raw key is returned in the API response exactly ONCE, at
  creation time. It is never retrievable again afterward — the list
  endpoint only ever returns id/name/keyPrefix/revoked/lastUsedAt/
  expiresAt/createdAt, never the hash or the raw key.
- requireApiKey middleware: reads x-api-key header, hashes it, looks up an
  ApiKey by hash, rejects with 401 if not found / revoked / expired. On
  success, updates lastUsedAt and attaches the associated serviceId to the
  request.

\--- 5. HEALTH STATUS / STALENESS LOGIC ---
A service's stored `status` field only updates when it sends a heartbeat.
But a service that's gone completely silent shouldn't keep showing its last
reported status forever. Implement this as a computed value at read time
(no background job needed for this phase):

- Define STALE\_HEARTBEAT\_MS = 90000 (90 seconds)
- Whenever returning a Service object in any response, compute: if
  lastHeartbeatAt is null OR older than STALE\_HEARTBEAT\_MS, override the
  displayed status to UNKNOWN (regardless of the stored value) and include
  an `isStale: true` field. Otherwise show the stored status and
  `isStale: false`.
- Apply this consistently everywhere a Service is serialized in a response.

\--- 6. ENDPOINTS ---
Public (API-key authenticated, not org-scoped by URL — the service is
identified by its key):

- POST /v1/heartbeat — requires x-api-key. Body: {status: HEALTHY|DEGRADED|
  DOWN, version?: string}. Updates the service's status, lastHeartbeatAt
  (=now), and lastDeploymentVersion (if version provided). Returns the
  updated service (with computed staleness).

Human-facing (JWT + requireOrgMembership), base path
/organizations//services:

- POST / — requireOrgMembership(['OWNER','ADMIN','ENGINEER']) — body:
  {name, description?, environment?, healthCheckUrl?, githubRepository?,
  team?, language?, framework?}. Sets ownerUserId to the caller. 409 if
  name already taken in this org.
- GET / — requireOrgMembership() (any member) — list all services for the org
- GET / — requireOrgMembership() — single service, 404 if it
  doesn't belong to this org (check organizationId matches even after
  lookup by id — don't let someone guess another org's service id)
- PATCH / — requireOrgMembership(['OWNER','ADMIN','ENGINEER'])
- DELETE / — requireOrgMembership(['OWNER','ADMIN'])
- POST //api-keys — requireOrgMembership(['OWNER','ADMIN',
  'ENGINEER']) — body: {name, expiresInDays?}. Returns the raw key ONCE.
- GET //api-keys — requireOrgMembership(['OWNER','ADMIN',
  'ENGINEER']) — list keys, never showing hash or raw key
- DELETE //api-keys/ — requireOrgMembership(['OWNER',
  'ADMIN']) — revoke (soft — set revoked=true, don't delete)

\--- 7. GATEWAY WIRING ---
Update api-gateway to proxy /api/catalog/\* to this service, stripping the
/api/catalog prefix (so /api/catalog/organizations//services hits this
service's /organizations//services). Add CATALOG\_SERVICE\_URL env var.
Show exactly what's new/changed in api-gateway — don't rebuild it.
\--- 8. DOCKER SETUP ---

- Add service-catalog-service to docker-compose.yml (port 4003), depends on
  postgres healthy, runs `prisma db push` on startup
- Add another postgres-init script creating the sentinel\_catalog database
  (same pattern as the sentinel\_org script from Phase 2 — a numbered .sh
  file in infrastructure/postgres-init/)
- New Dockerfile and .env.example (document that JWT\_ACCESS\_SECRET must
  match auth-service's, and ORGANIZATION\_SERVICE\_URL must point at
  organization-service)

\--- 9. DELIVERABLE ---
Give me:

1. Full folder structure for the new service
2. Every file's complete code
3. Updated/new files needed in api-gateway and docker-compose.yml, clearly
   marked NEW vs MODIFY
4. README section with curl commands demonstrating: register a service,
   create an API key, send a heartbeat using that key, fetch the service
   and see its status, wait \~90+ seconds and fetch again to see it flip to
   UNKNOWN/isStale, revoke the key, and confirm a heartbeat with the
   revoked key now gets 401

Ask me clarifying questions ONLY if something above is genuinely ambiguous —
otherwise make the reasonable engineering call and note the assumption.