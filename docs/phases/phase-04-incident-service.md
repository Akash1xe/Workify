## PHASE 4 PROMPT — Incident Service

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect their backend microservices to it. Those
services stream logs/metrics/events in. SentinelAI detects failures,
automatically creates incidents, lets engineers collaborate on them in real
time, and later uses an AI+RAG agent to investigate and suggest root causes
using evidence from logs, metrics, deployments, runbooks, and past incidents.

This is built as a deliberately small set of focused microservices that
communicate in two ways:

- synchronous REST when one service needs an immediate answer from another
- Kafka events for asynchronous/high-volume communication in later phases

Each service owns its own database. No service may directly read another
service's tables.

Full stack:
- Frontend: Next.js + TypeScript (not part of this phase)
- Backend services: Node.js + Express + TypeScript
- AI/RAG service later: Python + FastAPI
- PostgreSQL + Prisma, one logical DB per service
- Redis
- Kafka in later phases
- Docker + Docker Compose locally
- AWS ECS/RDS/S3 later

============================================================
WHAT ALREADY EXISTS — PHASES 1–3
============================================================

1. auth-service — port 4001
   - register/login/refresh/logout/session handling
   - issues JWT access tokens
   - JWT contains at minimum:
       sub: userId
       email
   - JWT_ACCESS_SECRET is shared with services that need to verify user tokens
   - access tokens are short-lived

2. organization-service — port 4002
   - organizations
   - members
   - roles:
       OWNER
       ADMIN
       ENGINEER
       VIEWER
   - invitations
   - owns tenant membership data
   - endpoint:
       GET /organizations/:id

     For an authenticated user:
     - returns 200 with organization details and `yourRole` if the user belongs
       to the organization
     - returns 404 if organization does not exist OR user is not a member
     - returns 401 for invalid/expired authentication

   IMPORTANT:
   Other services MUST use this endpoint to verify membership.
   They must NEVER query organization-service's database directly.

3. service-catalog-service — port 4003
   - organizations register backend services such as:
       payment-service
       order-service
       auth-service
   - owns Service records
   - each Service belongs to an organization using organizationId
   - backend services can have API keys
   - supports service heartbeat / health information

   Service records contain at minimum:
   - id
   - organizationId
   - name
   - environment
   - ownerUserId
   - status
   - lastHeartbeatAt
   - lastDeploymentVersion
   - createdAt
   - updatedAt

4. api-gateway — port 4000
   - only external entry point for the frontend
   - no business logic
   - currently proxies:
       /api/auth/*
       /api/organizations/*
       /api/catalog/*
   - adds x-request-id
   - Redis-backed rate limiting

5. Docker Compose already runs:
   - PostgreSQL
   - Redis
   - auth-service
   - organization-service
   - service-catalog-service
   - api-gateway

PostgreSQL already uses init scripts under:

infrastructure/postgres-init/

to create separate logical databases for individual services.

============================================================
YOUR TASK — PHASE 4: INCIDENT SERVICE
============================================================

Build the Incident Service.

This is the core domain service of SentinelAI.

An Incident represents a production problem affecting one or more registered
backend services.

For this phase, incidents may be created manually by engineers.

In Phase 8, Alert Service will automatically create incidents when alert rules
fire.

The Incident Service must own:

- incident lifecycle
- severity
- assignment
- comments
- append-only timeline/history
- tenant-safe incident access

Do NOT implement WebSockets yet.

Real-time propagation will be Phase 5.

Do NOT implement Kafka yet unless creating a very small internal event abstraction
makes sense.

Kafka/event publishing will be introduced in later phases.

============================================================
1. TECH STACK
============================================================

Use:

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Zod
- jsonwebtoken
- helmet
- cors

Create a new database:

sentinel_incident

Do NOT reuse auth, organization, or catalog databases.

Service port:

4004

Suggested service directory:

services/incident-service/

Use the same layered architecture as previous services:

routes
→ controllers
→ services
→ repositories
→ Prisma

Controllers must not contain Prisma queries.

============================================================
2. INCIDENT DOMAIN MODEL
============================================================

Create these Prisma enums:

enum IncidentStatus {
  TRIGGERED
  ACKNOWLEDGED
  INVESTIGATING
  MITIGATING
  RESOLVED
}

enum IncidentSeverity {
  SEV1
  SEV2
  SEV3
  SEV4
}

enum IncidentSource {
  MANUAL
  ALERT
}

enum TimelineEventType {
  INCIDENT_CREATED
  STATUS_CHANGED
  SEVERITY_CHANGED
  ASSIGNEE_CHANGED
  COMMENT_ADDED
  TITLE_CHANGED
  DESCRIPTION_CHANGED
}

Create these models.

------------------------------------------------------------
Incident
------------------------------------------------------------

Fields:

- id: UUID
- organizationId: string
- serviceId: string
- title: string
- description: optional string
- status: IncidentStatus, default TRIGGERED
- severity: IncidentSeverity
- source: IncidentSource, default MANUAL
- sourceAlertId: optional string
- createdByUserId: optional string
- assignedToUserId: optional string
- acknowledgedAt: optional DateTime
- investigatingAt: optional DateTime
- mitigatingAt: optional DateTime
- resolvedAt: optional DateTime
- createdAt
- updatedAt

Important:

organizationId and serviceId are plain IDs referring to records owned by other
services.

DO NOT create cross-database foreign keys.

Recommended indexes:

- organizationId
- serviceId
- status
- severity
- createdAt
- (organizationId, status)
- (organizationId, serviceId)

------------------------------------------------------------
IncidentTimelineEvent
------------------------------------------------------------

The timeline MUST be append-only.

Fields:

- id: UUID
- incidentId: FK → Incident, cascade delete
- type: TimelineEventType
- actorUserId: optional string
- message: string
- metadata: optional Json
- createdAt

No endpoint may update or delete timeline entries.

Timeline entries exist so an engineer can later answer:

"What happened during this incident, in what order, and who did it?"

Examples:

INCIDENT_CREATED
metadata:
{
  "severity": "SEV2",
  "serviceId": "..."
}

STATUS_CHANGED
metadata:
{
  "from": "TRIGGERED",
  "to": "ACKNOWLEDGED"
}

ASSIGNEE_CHANGED
metadata:
{
  "from": null,
  "to": "user-id"
}

COMMENT_ADDED
metadata:
{
  "commentId": "..."
}

------------------------------------------------------------
IncidentComment
------------------------------------------------------------

Fields:

- id: UUID
- incidentId: FK → Incident, cascade delete
- authorUserId: string
- body: text
- createdAt
- updatedAt

For this phase comments may be edited and deleted by their own author.

However:

even if the comment gets edited/deleted later, the COMMENT_ADDED timeline entry
must remain.

The incident timeline is historical/audit data.

============================================================
3. AUTHENTICATION
============================================================

Human-facing Incident Service routes use JWT authentication.

Implement requireAuth middleware.

It must:

- read Authorization: Bearer <token>
- verify JWT_ACCESS_SECRET
- read:
    sub → user ID
    email
- attach:

req.user = {
  id,
  email
}

Return 401 when:

- token missing
- malformed
- expired
- invalid

JWT_ACCESS_SECRET must match auth-service.

Document this in .env.example.

============================================================
4. TENANT ISOLATION
============================================================

This is SECURITY CRITICAL.

Incident Service MUST NOT trust organizationId merely because it appears in the
URL or body.

Create:

requireOrgMembership(
  allowedRoles?: Array<'OWNER' | 'ADMIN' | 'ENGINEER' | 'VIEWER'>
)

The middleware must:

1. read organizationId from req.params.organizationId

2. forward the incoming Authorization header unchanged to:

GET
${ORGANIZATION_SERVICE_URL}/organizations/${organizationId}

3. handle responses:

organization-service 200
→ parse `yourRole`

organization-service 401
→ return 401

organization-service 404
→ return 404

network failure
→ return 502

organization-service any unexpected non-2xx
→ return 502

4. if allowedRoles is supplied and user's role is not included
→ return 403

5. attach:

req.membership = {
  organizationId,
  userId,
  role
}

Never silently fail open.

Never duplicate membership data inside Incident Service.

ORGANIZATION_SERVICE_URL must be configurable.

Local default:

http://localhost:4002

Docker:

http://organization-service:4002

============================================================
5. VERIFY THE SERVICE BELONGS TO THE ORGANIZATION
============================================================

When creating an incident, the client provides:

serviceId

Incident Service must verify that the service exists AND belongs to the requested
organization.

Do NOT trust serviceId directly.

Do NOT access service-catalog-service's database.

Use synchronous REST.

Call:

GET
${CATALOG_SERVICE_URL}/organizations/${organizationId}/services/${serviceId}

Forward the incoming Authorization header.

Expected behavior:

200
→ valid service belonging to organization

404
→ return 404 from Incident Service

401
→ return 401

403
→ return 403

network failure / unexpected response
→ return 502 with:

"could not verify service"

CATALOG_SERVICE_URL:

local:
http://localhost:4003

Docker:
http://service-catalog-service:4003

Create this verification in a reusable client/service module such as:

clients/catalog.client.ts

Do NOT place fetch logic inside controllers.

============================================================
6. INCIDENT LIFECYCLE RULES
============================================================

Incident statuses:

TRIGGERED
→ ACKNOWLEDGED
→ INVESTIGATING
→ MITIGATING
→ RESOLVED

For Phase 4, enforce this normal forward flow.

Allowed transitions:

TRIGGERED → ACKNOWLEDGED
ACKNOWLEDGED → INVESTIGATING
INVESTIGATING → MITIGATING
MITIGATING → RESOLVED

Additionally allow:

TRIGGERED → INVESTIGATING

because an engineer may immediately begin investigating.

Do NOT allow:

RESOLVED → anything

Do NOT allow backwards transitions in this phase.

Examples that should return 400:

TRIGGERED → RESOLVED
ACKNOWLEDGED → TRIGGERED
INVESTIGATING → ACKNOWLEDGED
RESOLVED → INVESTIGATING

Put lifecycle rules inside the service/domain layer, NOT the controller.

When a transition occurs, set milestone timestamps:

ACKNOWLEDGED
→ acknowledgedAt = now if null

INVESTIGATING
→ investigatingAt = now if null

MITIGATING
→ mitigatingAt = now if null

RESOLVED
→ resolvedAt = now

Each transition MUST also append STATUS_CHANGED to the timeline in the same
database transaction.

============================================================
7. AUTHORIZATION RULES
============================================================

Use these role rules.

------------------------------------------------------------
VIEWER
------------------------------------------------------------

Can:

- list incidents
- view an incident
- view timeline
- view comments

Cannot:

- create
- update
- change status
- assign
- comment
- delete

------------------------------------------------------------
ENGINEER
------------------------------------------------------------

Can:

- VIEWER actions
- create incidents
- update title/description
- change incident status
- assign incidents
- add comments
- edit/delete own comments

Cannot:

- delete incidents

------------------------------------------------------------
ADMIN
------------------------------------------------------------

Can:

- ENGINEER actions
- change severity
- delete incidents

------------------------------------------------------------
OWNER
------------------------------------------------------------

Same permissions as ADMIN.

============================================================
8. ENDPOINTS
============================================================

Human-facing base path:

/organizations/:organizationId/incidents

All routes:

requireAuth
+
requireOrgMembership(...)

------------------------------------------------------------
CREATE INCIDENT
------------------------------------------------------------

POST /organizations/:organizationId/incidents

Roles:

OWNER
ADMIN
ENGINEER

Body:

{
  "serviceId": "uuid",
  "title": "Payment API returning 500s",
  "description": "optional",
  "severity": "SEV1|SEV2|SEV3|SEV4"
}

Behavior:

1. verify service belongs to organization using service-catalog REST call
2. create incident with:
   source = MANUAL
   status = TRIGGERED
   createdByUserId = req.user.id
3. create INCIDENT_CREATED timeline event
4. incident creation + timeline event MUST happen in one Prisma transaction

Return:

201

------------------------------------------------------------
LIST INCIDENTS
------------------------------------------------------------

GET /organizations/:organizationId/incidents

Any organization member.

Support query parameters:

status?
severity?
serviceId?
assignedToUserId?
page?
limit?

Defaults:

page = 1
limit = 20

Maximum limit = 100

Sort newest first.

Return:

{
  "items": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3
  }
}

Every database query MUST include organizationId.

Do not retrieve globally and filter afterward.

------------------------------------------------------------
GET INCIDENT
------------------------------------------------------------

GET /organizations/:organizationId/incidents/:incidentId

Any organization member.

Return incident.

Important:

lookup must guarantee BOTH:

incidentId matches
AND
organizationId matches

Never fetch by ID alone and return it before checking tenant ownership.

404 if not found in this organization.

------------------------------------------------------------
UPDATE INCIDENT
------------------------------------------------------------

PATCH /organizations/:organizationId/incidents/:incidentId

ENGINEER
ADMIN
OWNER

Body may contain:

{
  "title": "...",
  "description": "..."
}

Do not allow status/severity/assignment through this generic endpoint.

Use dedicated endpoints for those.

If title changes:

append TITLE_CHANGED timeline entry.

If description changes:

append DESCRIPTION_CHANGED timeline entry.

Update + timeline entry must be atomic.

------------------------------------------------------------
CHANGE STATUS
------------------------------------------------------------

PATCH /organizations/:organizationId/incidents/:incidentId/status

ENGINEER
ADMIN
OWNER

Body:

{
  "status": "ACKNOWLEDGED|INVESTIGATING|MITIGATING|RESOLVED"
}

Validate transition according to lifecycle rules.

Create STATUS_CHANGED timeline event.

Use transaction.

------------------------------------------------------------
CHANGE SEVERITY
------------------------------------------------------------

PATCH /organizations/:organizationId/incidents/:incidentId/severity

OWNER
ADMIN

Body:

{
  "severity": "SEV1|SEV2|SEV3|SEV4"
}

Create SEVERITY_CHANGED timeline event containing previous/new values.

Use transaction.

------------------------------------------------------------
ASSIGN INCIDENT
------------------------------------------------------------

PATCH /organizations/:organizationId/incidents/:incidentId/assignee

ENGINEER
ADMIN
OWNER

Body:

{
  "userId": "some-user-id-or-null"
}

null means unassign.

IMPORTANT:

If userId is not null, verify that the target user is actually a member of the
same organization.

Do not just store arbitrary user IDs.

Because the existing Organization Service's GET /organizations/:id endpoint only
verifies the CURRENT caller, you need a proper internal/member lookup.

Add or use an Organization Service endpoint appropriate for this purpose.

Preferred approach:

GET
/organizations/:organizationId/members/:userId

This endpoint must:

- require authenticated organization membership
- return 404 when target user is not a member
- return member data when valid

If this endpoint does not already exist, implement the smallest necessary
addition to organization-service and clearly mark it as a Phase 4 integration
change.

Incident Service should call it using the original Authorization header.

If target user isn't a member:
→ reject with 400 or 404 consistently; prefer 400 with:

"assignee must be a member of the organization"

Create ASSIGNEE_CHANGED timeline event.

Use transaction.

------------------------------------------------------------
GET TIMELINE
------------------------------------------------------------

GET /organizations/:organizationId/incidents/:incidentId/timeline

Any member.

Return timeline events oldest → newest.

Support:

page
limit

Timeline cannot be modified through API.

------------------------------------------------------------
ADD COMMENT
------------------------------------------------------------

POST /organizations/:organizationId/incidents/:incidentId/comments

ENGINEER
ADMIN
OWNER

Body:

{
  "body": "Investigating database connection pool saturation."
}

Create:

IncidentComment

AND

COMMENT_ADDED timeline event

inside the same transaction.

Return 201.

------------------------------------------------------------
LIST COMMENTS
------------------------------------------------------------

GET /organizations/:organizationId/incidents/:incidentId/comments

Any member.

Return oldest → newest.

Support pagination.

------------------------------------------------------------
EDIT COMMENT
------------------------------------------------------------

PATCH /organizations/:organizationId/incidents/:incidentId/comments/:commentId

ENGINEER
ADMIN
OWNER

Body:

{
  "body": "Updated comment"
}

Only the comment's author may edit it.

Even ADMIN/OWNER should NOT edit another person's comment in this phase.

403 otherwise.

Do not alter the historical COMMENT_ADDED timeline event.

------------------------------------------------------------
DELETE COMMENT
------------------------------------------------------------

DELETE /organizations/:organizationId/incidents/:incidentId/comments/:commentId

ENGINEER
ADMIN
OWNER

Only author may delete.

204 response.

Timeline entry remains.

------------------------------------------------------------
DELETE INCIDENT
------------------------------------------------------------

DELETE /organizations/:organizationId/incidents/:incidentId

OWNER
ADMIN

Return 204.

Database cascade may delete:

comments
timeline events

This is acceptable for this phase.

However document in README that production audit-retention policies may later
replace hard deletion with archival/soft deletion.

============================================================
9. TRANSACTIONS / CONSISTENCY
============================================================

Anything that changes incident state and writes timeline history must happen in
the SAME Prisma transaction.

Examples:

create incident
+
INCIDENT_CREATED

status change
+
STATUS_CHANGED

severity change
+
SEVERITY_CHANGED

assignment change
+
ASSIGNEE_CHANGED

comment creation
+
COMMENT_ADDED

title update
+
TITLE_CHANGED

description update
+
DESCRIPTION_CHANGED

If timeline creation fails, the state mutation must roll back.

The timeline must accurately represent committed state.

============================================================
10. VALIDATION
============================================================

Use Zod.

Validate:

- UUID path parameters where appropriate
- create incident body
- title min 1, reasonable max such as 200
- description max reasonable size
- valid enum values
- comment body non-empty
- pagination
- page >= 1
- limit 1–100

Unknown or malformed request bodies should return 400.

Use the project's centralized AppError/error middleware pattern.

============================================================
11. API RESPONSE SAFETY
============================================================

Never expose:

- database internals
- stack traces in production
- another organization's records

Every incident/comment/timeline query must be scoped through the parent incident's
organization.

Examples:

Bad:

findUnique({
  where: { id: incidentId }
})

then returning it immediately.

Good:

findFirst({
  where: {
    id: incidentId,
    organizationId
  }
})

Similarly, when retrieving a comment, ensure its incident belongs to the current
organization.

============================================================
12. PREPARE FOR REAL-TIME WITHOUT IMPLEMENTING IT YET
============================================================

Phase 5 will add Redis Pub/Sub + WebSockets.

Do NOT implement WebSockets now.

But structure business logic so mutations have clear points where an event could
later be emitted.

For example:

incidentService.changeStatus(...)

rather than embedding mutation logic directly in controllers.

Optionally define domain event payload TypeScript interfaces such as:

IncidentStatusChangedEvent
IncidentAssignedEvent
IncidentCommentAddedEvent

but do NOT wire Redis yet.

Keep Phase 4 focused.

============================================================
13. API GATEWAY WIRING
============================================================

Update api-gateway.

Add:

INCIDENT_SERVICE_URL

Proxy:

/api/incidents/*

to incident-service.

Use this routing behavior:

External:

/api/incidents/organizations/:organizationId/incidents

Internal:

/organizations/:organizationId/incidents

Therefore strip:

/api/incidents

before forwarding.

Example:

POST

http://localhost:4000/api/incidents/organizations/ORG_ID/incidents

must reach:

http://incident-service:4004/organizations/ORG_ID/incidents

Preserve:

Authorization
x-request-id

Do not rebuild the gateway.

Show only exact modifications/new code required.

============================================================
14. DOCKER SETUP
============================================================

Add:

incident-service

Port:

4004

Database:

sentinel_incident

Create a PostgreSQL init script such as:

infrastructure/postgres-init/03-create-incident-db.sh

or the next appropriate numbered script matching the project's existing naming.

It should create:

sentinel_incident

Add Incident Service to docker-compose.

Environment variables should include:

PORT=4004

DATABASE_URL=postgresql://...

JWT_ACCESS_SECRET=...

ORGANIZATION_SERVICE_URL=http://organization-service:4002

CATALOG_SERVICE_URL=http://service-catalog-service:4003

NODE_ENV=development

Ensure incident-service waits for PostgreSQL health.

Run:

prisma db push

during container startup for this development scaffold, consistent with earlier
phases.

Create:

services/incident-service/Dockerfile

and:

services/incident-service/.env.example

============================================================
15. HEALTH ENDPOINT
============================================================

Add:

GET /health

Response:

{
  "status": "ok",
  "service": "incident-service"
}

No authentication required.

============================================================
16. LOGGING / REQUEST IDs
============================================================

Preserve x-request-id from Gateway.

If the service is called directly and x-request-id is absent, generate one.

Include requestId in error logs where useful.

Never log:

- Authorization token
- passwords
- API keys
- sensitive request headers

============================================================
17. TESTING REQUIREMENTS
============================================================

Add meaningful automated tests.

At minimum cover:

1. unauthenticated request → 401

2. non-member accessing org → 404

3. VIEWER cannot create incident → 403

4. ENGINEER can create incident

5. incident creation also creates INCIDENT_CREATED timeline event

6. cannot create incident using a service from another organization

7. valid lifecycle:
   TRIGGERED → ACKNOWLEDGED
   ACKNOWLEDGED → INVESTIGATING

8. invalid lifecycle:
   TRIGGERED → RESOLVED
   returns 400

9. status mutation creates timeline event

10. OWNER/ADMIN can change severity

11. ENGINEER cannot change severity

12. assignment rejects target user who isn't an organization member

13. comment creation generates COMMENT_ADDED timeline event

14. user cannot edit another user's comment

15. tenant isolation:
   organization A cannot access organization B's incident even when incident ID
   is known

16. pagination/filtering works

Use mocks for cross-service calls in unit/integration tests where appropriate,
but production implementation MUST use real HTTP REST calls.

============================================================
18. README / MANUAL END-TO-END TEST
============================================================

Add exact curl commands demonstrating this sequence.

Assume:

API Gateway:
http://localhost:4000

Flow:

1. register/login an OWNER

2. create an organization

3. register a backend service using Service Catalog

4. create a manual incident for that service

5. fetch the incident

6. verify initial status:

TRIGGERED

7. fetch timeline and verify:

INCIDENT_CREATED

8. acknowledge incident

9. fetch timeline and verify:

STATUS_CHANGED
TRIGGERED → ACKNOWLEDGED

10. move:

ACKNOWLEDGED → INVESTIGATING

11. assign the incident to an organization member

12. add a comment

13. fetch timeline and see all events in chronological order

14. change severity as ADMIN/OWNER

15. resolve through the valid lifecycle:

INVESTIGATING
→ MITIGATING
→ RESOLVED

16. attempt:

RESOLVED → INVESTIGATING

and confirm 400

17. authenticate as a non-member user and try fetching the incident

Confirm 404, not 403.

18. authenticate as a VIEWER and try creating an incident

Confirm 403.

============================================================
19. IMPORTANT ARCHITECTURAL RULES
============================================================

Do not violate these:

1. Incident Service owns incident data.

2. Organization Service owns organization membership.

3. Service Catalog owns registered service data.

4. Incident Service may reference organizationId/serviceId/userId as plain IDs,
   but may not create cross-service database foreign keys.

5. Cross-service validation happens through REST.

6. Tenant membership must be verified for every org-scoped route.

7. Every Incident query must include organizationId.

8. Incident lifecycle rules belong in business/domain logic.

9. State mutation + timeline event must be transactional.

10. Timeline is append-only.

11. VIEWER is read-only.

12. Do not implement WebSockets yet.

13. Do not implement Alert Service yet.

14. Do not implement AI/RAG yet.

15. Do not put business logic into API Gateway.

============================================================
20. DELIVERABLE
============================================================

Give me:

1. Full folder structure for incident-service

2. Every new Incident Service file with COMPLETE code, not snippets

3. Prisma schema

4. Zod schemas

5. repositories

6. services/business logic

7. controllers

8. middleware

9. cross-service clients

10. routes

11. centralized error handling

12. tests

13. Dockerfile

14. .env.example

15. PostgreSQL init script

16. exact docker-compose modifications

17. exact api-gateway modifications

18. any minimal organization-service modification needed for the
    GET /organizations/:organizationId/members/:userId integration endpoint

19. README/manual testing instructions

Clearly mark every output as:

NEW FILE

or

MODIFY EXISTING FILE

Do not silently rewrite existing Phase 1–3 architecture.

If an existing implementation differs slightly from the assumptions above,
adapt minimally rather than rebuilding unrelated services.

Ask clarifying questions ONLY when something is genuinely impossible to infer.

Otherwise make a reasonable engineering decision, explicitly state the
assumption, and continue building.

```