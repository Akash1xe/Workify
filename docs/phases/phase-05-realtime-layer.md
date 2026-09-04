## PHASE 5 PROMPT — Real-Time Layer

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect their backend microservices to it. Those
services stream logs/metrics/events in. SentinelAI detects failures,
automatically creates incidents, lets engineers collaborate on them in real
time, and later uses an AI+RAG agent to investigate and suggest root causes
using evidence from logs, metrics, deployments, runbooks, and past incidents.

This is built as a small set of focused microservices communicating via:
- synchronous REST for immediate answers
- Kafka for high-volume or asynchronous workflows in later phases

Each service owns its own database. No service ever directly queries another
service's tables.

============================================================
WHAT ALREADY EXISTS — PHASES 1–4
============================================================

1. auth-service — port 4001
   - authentication
   - JWT access tokens
   - refresh/session handling

2. organization-service — port 4002
   - organizations
   - members
   - roles:
       OWNER
       ADMIN
       ENGINEER
       VIEWER
   - invitations
   - owns tenant membership

3. service-catalog-service — port 4003
   - registered backend services
   - API keys
   - heartbeat/health status
   - owns service metadata

4. incident-service — port 4004
   - incidents
   - lifecycle:
       TRIGGERED
       ACKNOWLEDGED
       INVESTIGATING
       MITIGATING
       RESOLVED
   - severity
   - assignment
   - comments
   - append-only timeline
   - tenant isolation
   - service ownership validation through service-catalog-service
   - synchronous organization membership checks

5. api-gateway — port 4000
   - only external entry point
   - proxies auth, organization, catalog, incident routes
   - request IDs
   - Redis-backed rate limiting
   - no business logic

6. Redis already exists in docker-compose.

============================================================
YOUR TASK — PHASE 5: REAL-TIME LAYER
============================================================

Add real-time collaboration around incidents.

Goal:

When one engineer changes an incident, every connected engineer currently
viewing that same incident should receive the update immediately without
refreshing.

Examples:

- status changed
- severity changed
- assignee changed
- new comment added
- comment edited/deleted
- title/description changed

Use:

- WebSockets
- Socket.IO
- Redis Pub/Sub adapter for horizontal scalability

Do NOT introduce Kafka for this phase.

Kafka is for system/domain event streaming and telemetry in later phases.

Redis Pub/Sub here is specifically for low-latency real-time UI propagation.

============================================================
1. ARCHITECTURE
============================================================

Do NOT put WebSocket business logic directly inside Incident Service controllers.

Preferred architecture:

Client
  |
  v
API Gateway / WebSocket entry
  |
  v
Realtime Gateway / Socket server
  |
  +---- verifies JWT
  |
  +---- verifies organization membership
  |
  +---- joins incident room
  |
  +---- receives events published after Incident Service mutations

Use Redis Pub/Sub / Socket.IO Redis adapter so multiple realtime instances can
broadcast consistently.

Recommended new service:

services/realtime-service/

Port:

4005

The realtime-service should NOT own business data.

It should:
- authenticate socket clients
- authorize room access
- subscribe clients to incident rooms
- broadcast incident changes

It should NOT:
- modify incidents directly
- write comments
- change status
- query incident database directly

All mutations still happen through Incident Service REST endpoints.

============================================================
2. SOCKET.IO + REDIS
============================================================

Use:

- socket.io
- @socket.io/redis-adapter
- ioredis

Create:
- one Redis connection for publishing
- one duplicated connection for subscription

Example environment variables:

PORT=4005
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=...
ORGANIZATION_SERVICE_URL=http://organization-service:4002
INCIDENT_SERVICE_URL=http://incident-service:4004
NODE_ENV=development

JWT_ACCESS_SECRET must match auth-service.

============================================================
3. SOCKET AUTHENTICATION
============================================================

Authenticate during Socket.IO handshake.

Accept JWT from:

socket.handshake.auth.token

Preferred expected client connection:

io("http://localhost:4005", {
  auth: {
    token: accessToken
  }
})

Optionally also support Authorization header for non-browser testing.

Verify using JWT_ACCESS_SECRET.

Attach:

socket.data.user = {
  id,
  email
}

Reject connection with an authentication error if:
- missing token
- invalid token
- expired token

Never allow anonymous socket connections.

Never log raw JWTs.

============================================================
4. ROOM MODEL
============================================================

Use deterministic rooms.

Organization room:

org:{organizationId}

Incident room:

incident:{incidentId}

Primary use in this phase is incident rooms.

Do NOT allow clients to arbitrarily call socket.join() based only on IDs.

Every room subscription must be authorized first.

============================================================
5. JOIN INCIDENT FLOW
============================================================

Client emits:

incident:join

Payload:

{
  "organizationId": "uuid",
  "incidentId": "uuid"
}

Server must validate BOTH:

1. user is a real member of organization
2. incident actually belongs to that organization

Step 1:

Call organization-service:

GET
${ORGANIZATION_SERVICE_URL}/organizations/${organizationId}

Forward the user's JWT.

Expected:

200 → membership valid
404 → deny
401 → deny
network/unexpected failure → deny with internal dependency error

Step 2:

Call incident-service:

GET
${INCIDENT_SERVICE_URL}/organizations/${organizationId}/incidents/${incidentId}

Forward JWT.

Expected:

200 → incident valid
404 → deny
401/403 → deny

Only then:

socket.join(`incident:${incidentId}`)

Acknowledge:

{
  "ok": true,
  "incidentId": "..."
}

Do not trust client-supplied IDs without these checks.

============================================================
6. LEAVE INCIDENT FLOW
============================================================

Client emits:

incident:leave

Payload:

{
  "incidentId": "uuid"
}

Server:

socket.leave(`incident:${incidentId}`)

Return acknowledgment.

No DB operation required.

============================================================
7. REAL-TIME EVENTS TO SUPPORT
============================================================

Broadcast these events.

incident:created

Payload:

{
  incident: {...}
}

incident:updated

For title/description changes.

Payload:

{
  incidentId,
  organizationId,
  changes,
  updatedAt
}

incident:status-changed

Payload:

{
  incidentId,
  organizationId,
  from,
  to,
  actorUserId,
  updatedAt
}

incident:severity-changed

Payload:

{
  incidentId,
  organizationId,
  from,
  to,
  actorUserId,
  updatedAt
}

incident:assignee-changed

Payload:

{
  incidentId,
  organizationId,
  from,
  to,
  actorUserId,
  updatedAt
}

incident:comment-added

Payload:

{
  incidentId,
  organizationId,
  comment
}

incident:comment-updated

Payload:

{
  incidentId,
  organizationId,
  comment
}

incident:comment-deleted

Payload:

{
  incidentId,
  organizationId,
  commentId
}

incident:deleted

Payload:

{
  incidentId,
  organizationId
}

============================================================
8. HOW INCIDENT SERVICE PUBLISHES EVENTS
============================================================

Incident Service remains the source of truth.

After a mutation successfully commits to PostgreSQL, Incident Service publishes
a lightweight event to Redis.

Do NOT publish before the database transaction commits.

Recommended abstraction:

services/realtimePublisher.ts

or:

infrastructure/realtimePublisher.ts

Example:

publishIncidentEvent({
  type: "incident:status-changed",
  room: `incident:${incidentId}`,
  payload: {...}
})

Redis channel:

sentinel:realtime

Message format:

{
  "room": "incident:INCIDENT_ID",
  "event": "incident:status-changed",
  "payload": {...}
}

The realtime-service subscribes to this channel and forwards the message via:

io.to(room).emit(event, payload)

This keeps Incident Service unaware of socket connections.

============================================================
9. FAILURE SEMANTICS
============================================================

This is extremely important.

Real-time delivery must NOT break the main incident workflow.

If:
- Redis is unavailable
- realtime-service is down
- publishing fails

Then:

the incident mutation must STILL succeed.

Example:

PATCH status
→ DB transaction succeeds
→ publish to Redis fails
→ API still returns 200
→ log the realtime publishing failure

Reason:

real-time collaboration is an enhancement, not a dependency for correctness.

Do not roll back committed incident state just because websocket delivery failed.

This is intentionally different from:
state mutation + timeline event

Those remain transactional.

============================================================
10. DELIVERY SEMANTICS
============================================================

For Phase 5, delivery can be:

best-effort
at-most-once from UI perspective

Do not build durable event replay yet.

Clients that miss a WebSocket event should be able to refresh/re-fetch REST state.

REST remains the source of truth.

Document this clearly.

============================================================
11. EVENT ORDERING
============================================================

Within a single incident, events should generally be emitted after the
corresponding committed mutation.

Include:

updatedAt

and where useful:

timelineEventId

so clients can reason about freshness.

Do not attempt a complex global ordering system.

============================================================
12. API GATEWAY / SOCKET EXPOSURE
============================================================

Decide on one clean option and implement it.

Preferred for this phase:

Expose realtime-service directly at:

http://localhost:4005

with Socket.IO path:

/socket.io

Frontend REST still goes through API Gateway.

Frontend websocket can connect directly to realtime-service locally.

Document this architectural exception clearly:

API Gateway is the REST entry point.

Realtime-service is a dedicated WebSocket entry point.

If you instead proxy WebSockets through API Gateway, implement it carefully and
show the exact proxy config.

Do not mix both approaches.

============================================================
13. CORS
============================================================

Configure Socket.IO CORS using env allowlist.

Example:

CORS_ORIGINS=http://localhost:3000

Parse comma-separated origins.

Do not use wildcard "*" together with credentials.

============================================================
14. SECURITY
============================================================

Must enforce:

- valid JWT for socket connection
- membership verification before joining an incident room
- incident-to-organization ownership verification
- no arbitrary room joining
- no cross-tenant broadcasts
- no raw token logging

A user who belongs to Organization A must never receive events for an incident
belonging to Organization B.

Treat this as a critical security boundary.

============================================================
15. CLIENT EVENT CONTRACT
============================================================

Create shared TypeScript interfaces for socket event contracts if the repository
already has a shared package.

If not, create them inside realtime-service and duplicate minimally in README.

Suggested types:

interface IncidentJoinPayload {
  organizationId: string;
  incidentId: string;
}

interface IncidentStatusChangedPayload {
  incidentId: string;
  organizationId: string;
  from: IncidentStatus;
  to: IncidentStatus;
  actorUserId: string | null;
  updatedAt: string;
}

Do not introduce a whole monorepo shared-package refactor unless one already
exists.

============================================================
16. INCIDENT SERVICE CHANGES
============================================================

Modify Incident Service minimally.

After each successful mutation, publish the corresponding realtime event.

Cover:

- incident created
- title/description update
- status change
- severity change
- assignee change
- comment created
- comment edited
- comment deleted
- incident deleted

Important:

For DB transactions:

1. commit mutation + timeline changes
2. return committed result from transaction
3. then publish realtime event
4. catch/log publish failure
5. return API success

Do not place Redis publish inside the Prisma transaction.

============================================================
17. REDIS CONNECTION RESILIENCE
============================================================

Realtime Service:

If Redis temporarily disconnects:
- log error
- keep process alive
- let ioredis reconnect

Incident Service publisher:

If Redis unavailable:
- do not crash process
- do not fail REST mutation
- log failure

Do not implement an infinite blocking startup dependency on Redis.

============================================================
18. HEALTH ENDPOINT
============================================================

realtime-service:

GET /health

Return:

{
  "status": "ok",
  "service": "realtime-service"
}

Optionally include Redis state:

{
  "redis": "connected"
}

but health endpoint should not leak secrets/config.

============================================================
19. OBSERVABILITY / LOGGING
============================================================

Log:

- socket connected
- socket disconnected
- userId
- socketId
- incident joined
- incident left
- authorization denial
- Redis publish failure
- Redis subscription failure

Do NOT log:
- JWT
- Authorization header
- API keys

Include request/socket correlation data where possible.

============================================================
20. TESTING REQUIREMENTS
============================================================

Add meaningful tests.

At minimum:

1. socket without token rejected

2. invalid token rejected

3. valid token connects

4. member can join incident room

5. non-member cannot join incident room

6. incident from another organization cannot be joined

7. successful incident status REST mutation publishes:
   incident:status-changed

8. realtime-service receives Redis message and emits to correct room

9. client in correct incident room receives event

10. client in different incident room does NOT receive event

11. client from another organization does NOT receive event

12. Redis publish failure does NOT cause incident mutation to fail

13. comment added emits incident:comment-added

14. deleted comment emits incident:comment-deleted

15. disconnect cleans up automatically through Socket.IO

Mocks are acceptable for:
- organization-service
- incident-service membership/ownership REST calls
- Redis in unit tests

But production code must use real integrations.

============================================================
21. DOCKER SETUP
============================================================

Add realtime-service to docker-compose.

Port:

4005:4005

Depends on:
- redis

Do not make it depend directly on PostgreSQL because it owns no database.

Environment:

PORT=4005
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=...
ORGANIZATION_SERVICE_URL=http://organization-service:4002
INCIDENT_SERVICE_URL=http://incident-service:4004
CORS_ORIGINS=http://localhost:3000
NODE_ENV=development

Incident Service should also receive:

REDIS_URL=redis://redis:6379

for publishing realtime messages.

Create:

services/realtime-service/Dockerfile

services/realtime-service/.env.example

============================================================
22. README END-TO-END TEST
============================================================

Add a simple real-time test flow.

Use either:
- a small Node Socket.IO test script
or
- a minimal HTML/JS client
or
- socket.io-client script

Preferred:

scripts/test-realtime.ts

Flow:

1. login as Engineer A
2. login as Engineer B
3. both are members of same organization
4. connect both sockets
5. both emit incident:join for same incident
6. Engineer A changes incident status through REST
7. verify both clients receive:
   incident:status-changed

Then test isolation:

8. User C from another organization connects
9. User C tries joining same incident
10. join rejected
11. User C receives no incident event

Then test resilience:

12. stop realtime-service or simulate Redis publish failure
13. change incident status through REST
14. REST mutation still succeeds
15. restart realtime layer
16. client can re-fetch latest incident state through REST

============================================================
23. ARCHITECTURAL RULES
============================================================

Do not violate these:

1. Incident Service remains source of truth.

2. Realtime Service owns no incident data.

3. Realtime Service cannot directly modify incidents.

4. Redis Pub/Sub is for ephemeral real-time delivery.

5. Kafka is NOT used in this phase.

6. REST remains authoritative.

7. WebSocket delivery failure must not break incident mutations.

8. Socket room joins require real tenant verification.

9. Incident ownership must be verified before room join.

10. Do not query another service's DB.

11. Do not put domain logic in realtime-service.

12. Do not put socket logic inside controllers.

13. Do not add AI/RAG.

14. Do not add alerting yet.

15. Keep changes to Phase 1–4 services minimal.

============================================================
24. DELIVERABLE
============================================================

Give me:

1. Full realtime-service folder structure

2. Every realtime-service file with complete code

3. Socket.IO server setup

4. JWT socket authentication

5. organization membership verification client

6. incident ownership verification client

7. Redis adapter setup

8. Redis subscription/broadcast implementation

9. event contracts/types

10. health endpoint

11. error/logging setup

12. automated tests

13. Dockerfile

14. .env.example

15. exact docker-compose modifications

16. exact Incident Service modifications for Redis publishing

17. any new Redis publisher abstraction added to Incident Service

18. README/manual test steps

19. a small socket.io-client test script demonstrating two users receiving the
    same incident update

Clearly mark all output as:

NEW FILE

or

MODIFY EXISTING FILE

Do not rebuild unrelated services.

If an existing implementation differs slightly from these assumptions, adapt
minimally and preserve the existing architecture.

```