## PHASE 9 PROMPT — Notification Service

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect backend services to it. Those services stream
logs, metrics, and events into SentinelAI. The platform detects failures,
automatically creates incidents, supports real-time collaboration, and later uses
AI+RAG to investigate root causes using telemetry, deployments, runbooks, and
past incidents.

The architecture is intentionally split into focused microservices.

Communication model:

- synchronous REST for immediate cross-service validation
- Kafka for durable asynchronous/high-volume system events
- Redis Pub/Sub for ephemeral real-time UI updates
- background job queue for notification delivery

Each service owns its own data.

No service may directly query another service's database.

============================================================
WHAT ALREADY EXISTS — PHASES 1–8
============================================================

1. auth-service — port 4001
   - authentication
   - JWT access/refresh/session handling

2. organization-service — port 4002
   - organizations
   - members
   - roles:
       OWNER
       ADMIN
       ENGINEER
       VIEWER
   - owns tenant membership

3. service-catalog-service — port 4003
   - backend service registration
   - API keys
   - service metadata
   - heartbeat/health

4. incident-service — port 4004
   - incident lifecycle
   - severity
   - assignment
   - comments
   - append-only timeline
   - manual + alert-created incidents

5. realtime-service — port 4005
   - Socket.IO
   - Redis Pub/Sub
   - incident real-time collaboration

6. ingestion-service — port 4006
   - receives telemetry
   - authenticates backend services
   - publishes canonical telemetry to Kafka

7. telemetry-worker — port 4007
   - persists telemetry
   - Kafka consumer group
   - idempotency
   - retries
   - DLQ
   - query APIs

8. alert-service — port 4008
   - alert rules
   - alert state machine:
       NORMAL
       PENDING
       FIRING
       RESOLVED
   - metric threshold evaluation
   - log-count evaluation
   - automatic incident creation
   - transactional outbox
   - publishes:

       sentinel.alerts.fired.v1
       sentinel.alerts.resolved.v1

Example alert event:

{
  "eventId": "uuid",
  "schemaVersion": 1,
  "type": "ALERT_FIRED",
  "organizationId": "...",
  "serviceId": "...",
  "alertId": "...",
  "ruleId": "...",
  "ruleName": "High error rate",
  "severity": "SEV1",
  "incidentId": "...",
  "occurredAt": "..."
}

============================================================
YOUR TASK — PHASE 9: NOTIFICATION SERVICE
============================================================

Build Notification Service.

Goal:

When important operational events happen, notify the correct humans without
blocking Alert Service or Incident Service.

Channels for this phase:

1. in-app notifications
2. email notifications

Slack integration is NOT part of this phase.

This service must demonstrate:

- asynchronous event consumption
- durable notification records
- background delivery jobs
- retries
- idempotency
- per-user delivery state
- notification preferences
- tenant isolation

Notification failures must NEVER block alert firing or incident state changes.

============================================================
1. ARCHITECTURE
============================================================

Flow:

Alert Service
    |
    v
Kafka
sentinel.alerts.fired.v1
sentinel.alerts.resolved.v1
    |
    v
Notification Service Kafka Consumer
    |
    +--> determine recipients
    |
    +--> create notification records
    |
    +--> enqueue delivery jobs
             |
             v
           Queue
             |
             v
      Notification Worker
        |            |
        v            v
     in-app         email

For this phase, in-app notifications are persisted and queryable.

Email is sent asynchronously by a job worker.

============================================================
2. TECH STACK
============================================================

Use:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- KafkaJS
- Zod
- jsonwebtoken
- helmet
- cors

For the background queue:

Preferred production architecture:

AWS SQS

But local development must still work.

Implement an abstraction:

NotificationQueue

with two adapters:

- Local/Redis-backed queue for Docker development
- SQS adapter configurable for later AWS use

Preferred local implementation:

BullMQ + Redis

Use:

- bullmq
- ioredis

This gives us retries/delayed jobs locally while preserving the queue abstraction.

Do NOT tightly couple domain logic directly to BullMQ.

New service:

services/notification-service/

Port:

4009

Database:

sentinel_notification

============================================================
3. DATABASE MODEL
============================================================

Create enums:

enum NotificationType {
  ALERT_FIRED
  ALERT_RESOLVED
  INCIDENT_ASSIGNED
  INCIDENT_STATUS_CHANGED
}

enum NotificationChannel {
  IN_APP
  EMAIL
}

enum DeliveryStatus {
  PENDING
  PROCESSING
  SENT
  FAILED
  SKIPPED
}

------------------------------------------------------------
Notification
------------------------------------------------------------

Represents one user-visible notification.

Fields:

- id: UUID
- eventId: string
- organizationId: string
- userId: string
- type: NotificationType
- title: string
- body: string
- severity: optional string
- incidentId: optional string
- alertId: optional string
- serviceId: optional string
- readAt: optional DateTime
- createdAt
- updatedAt

Unique constraint:

(eventId, userId)

Reason:

the same Kafka event may be delivered more than once.

Each user should receive at most one Notification record for that event.

Indexes:

- userId
- organizationId
- createdAt
- readAt
- incidentId
- alertId
- (organizationId, userId, createdAt)

------------------------------------------------------------
NotificationDelivery
------------------------------------------------------------

Fields:

- id: UUID
- notificationId: FK -> Notification, cascade delete
- channel: NotificationChannel
- status: DeliveryStatus default PENDING
- attempts: Int default 0
- lastAttemptAt: optional DateTime
- sentAt: optional DateTime
- failedAt: optional DateTime
- errorCode: optional string
- errorMessage: optional string
- externalMessageId: optional string
- createdAt
- updatedAt

Unique:

(notificationId, channel)

------------------------------------------------------------
NotificationPreference
------------------------------------------------------------

Fields:

- id: UUID
- organizationId: string
- userId: string
- alertFiredInApp: bool default true
- alertFiredEmail: bool default true
- alertResolvedInApp: bool default true
- alertResolvedEmail: bool default false
- createdAt
- updatedAt

Unique:

(organizationId, userId)

Use defaults when preference row does not exist.

Do not create preferences eagerly for every member unless needed.

============================================================
4. RECIPIENT SELECTION
============================================================

Notification Service does NOT own organization membership.

It must ask Organization Service who belongs to the organization.

Add/reuse an internal endpoint such as:

GET
/internal/organizations/:organizationId/members

Protect with:

x-internal-service-secret

Response:

{
  "members": [
    {
      "userId": "...",
      "role": "OWNER|ADMIN|ENGINEER|VIEWER"
    }
  ]
}

This endpoint is service-to-service only.

Do not expose it through public Gateway.

For ALERT_FIRED:

notify:

OWNER
ADMIN
ENGINEER

Do NOT notify VIEWER by default.

For ALERT_RESOLVED:

notify users who would have received the firing notification.

For this phase, derive recipients from current org membership.

Later this can become on-call schedules/escalation policies.

============================================================
5. GET USER EMAIL ADDRESSES
============================================================

Organization Service stores userId, not the user profile.

Auth Service owns user email.

Notification Service must NOT query Auth DB directly.

Add/reuse an internal Auth endpoint:

POST
/internal/users/resolve

Protected by:

x-internal-service-secret

Request:

{
  "userIds": ["id1", "id2"]
}

Response:

{
  "users": [
    {
      "id": "id1",
      "email": "engineer@example.com",
      "name": "Engineer"
    }
  ]
}

Only return safe fields needed for notification delivery.

Do not return:

passwordHash
refresh tokens
session data

Batch lookup to avoid one HTTP request per user.

============================================================
6. KAFKA CONSUMPTION
============================================================

Notification Service consumes:

sentinel.alerts.fired.v1
sentinel.alerts.resolved.v1

Consumer group:

sentinel-notification-service-v1

This group must be different from Alert Service's own groups.

Environment:

KAFKA_GROUP_ID=sentinel-notification-service-v1

Validate every Kafka event with Zod.

Do not blindly trust event payloads.

============================================================
7. EVENT IDEMPOTENCY
============================================================

Kafka is at-least-once.

The same alert event can be received more than once.

Use:

(eventId, userId)

unique constraint on Notification.

Processing same event twice must NOT:

- create duplicate notification
- enqueue duplicate email endlessly
- create duplicate delivery rows

If Notification already exists:

load its existing delivery rows and continue safely.

============================================================
8. EVENT PROCESSING — ALERT_FIRED
============================================================

When ALERT_FIRED arrives:

1. validate event

2. fetch organization members

3. filter roles:
   OWNER
   ADMIN
   ENGINEER

4. for each recipient:

   determine notification preferences

5. create Notification if not already present

Example title:

"SEV1 alert: High error rate"

Example body:

"High error rate is firing for payment-service."

6. create IN_APP delivery row if enabled

7. create EMAIL delivery row if enabled

8. enqueue EMAIL delivery job

In-app notification does not require external delivery.

Preferred semantics:

IN_APP delivery may be marked SENT immediately after Notification row is committed,
because persistence itself makes it available to the UI.

============================================================
9. EVENT PROCESSING — ALERT_RESOLVED
============================================================

Create notification:

Title:

"Alert resolved: High error rate"

Body:

"High error rate has recovered for payment-service."

Use preferences:

alertResolvedInApp
alertResolvedEmail

Default email resolution notifications are false.

============================================================
10. DATABASE TRANSACTION
============================================================

For each recipient:

create:

Notification
+
NotificationDelivery rows

inside one Prisma transaction.

Queue enqueue happens AFTER transaction commits.

Why:

database is source of truth for notification intent.

If queue enqueue fails, persisted PENDING delivery can be reconciled later.

============================================================
11. QUEUE FAILURE / RECONCILIATION
============================================================

If email delivery row exists as:

PENDING

but enqueue fails:

do NOT delete notification.

Do NOT fail the upstream Kafka event after DB commit just because queue is briefly
down.

Add reconciliation worker:

every 30 seconds

find EMAIL deliveries:

status = PENDING

that are not currently processing

and enqueue them.

This makes queue submission eventually consistent.

Do not keep retry intent only in memory.

============================================================
12. QUEUE JOB CONTRACT
============================================================

Job name:

send-email-notification

Payload:

{
  "deliveryId": "uuid"
}

Do NOT put full email body / recipient address into queue job if avoidable.

Worker loads delivery + Notification + user information by deliveryId.

Reason:

smaller queue payload and central source of truth.

============================================================
13. EMAIL WORKER
============================================================

Create background worker within notification-service or separate process entrypoint.

Preferred structure:

src/workers/email.worker.ts

The worker:

1. receives deliveryId
2. loads NotificationDelivery
3. if status already SENT:
      return success
4. mark PROCESSING
5. resolve user email through Auth internal API
6. render email
7. send email
8. mark SENT
9. store sentAt/externalMessageId

On failure:

increment attempts
store safe error
throw so queue retry policy applies

============================================================
14. EMAIL PROVIDER ABSTRACTION
============================================================

Do NOT hard-code vendor calls inside worker.

Create:

EmailProvider

interface:

send({
  to,
  subject,
  text,
  html
})

Implement:

ConsoleEmailProvider

for local development.

Console provider must NOT print sensitive secrets.

It may log:

"[EMAIL] to=engineer@example.com subject=SEV1 alert..."

Optionally provide:

SES provider scaffold

because AWS SES is a natural production choice.

But Console provider must make local development work without external credentials.

Environment:

EMAIL_PROVIDER=console

Future:

EMAIL_PROVIDER=ses

============================================================
15. RETRY POLICY
============================================================

Queue email jobs with retry configuration.

Example:

attempts = 5

exponential backoff:

1s
2s
4s
8s
16s

After final failure:

mark delivery FAILED.

Store:

failedAt
errorCode
safe errorMessage

Do not retry forever.

============================================================
16. PERMANENT VS TRANSIENT EMAIL FAILURE
============================================================

Where possible distinguish:

Permanent:
- invalid destination email
- malformed message

Transient:
- provider timeout
- temporary provider error
- network issue

For local project implementation, queue retries may be used for generic send failures,
but structure error types so this distinction can be added cleanly.

============================================================
17. IN-APP NOTIFICATION APIs
============================================================

Human-facing base path:

/organizations/:organizationId/notifications

All require:

JWT
+
real organization membership

Use same requireOrgMembership() pattern as previous services.

------------------------------------------------------------
LIST NOTIFICATIONS
------------------------------------------------------------

GET
/organizations/:organizationId/notifications

Return only notifications for:

organizationId
AND
req.user.id

Never let a user list another user's notifications.

Filters:

unreadOnly?
type?
page?
limit?

Default:

page=1
limit=20

Max:

100

Newest first.

Response:

{
  "items": [...],
  "pagination": {...},
  "unreadCount": 7
}

------------------------------------------------------------
GET UNREAD COUNT
------------------------------------------------------------

GET
/organizations/:organizationId/notifications/unread-count

Return:

{
  "count": 7
}

Scope to current user.

------------------------------------------------------------
MARK ONE READ
------------------------------------------------------------

PATCH
/organizations/:organizationId/notifications/:notificationId/read

Only notification owner may access it.

Set:

readAt = now

Return updated notification.

Idempotent:

calling twice should remain successful.

------------------------------------------------------------
MARK ALL READ
------------------------------------------------------------

POST
/organizations/:organizationId/notifications/read-all

Mark all unread notifications for:

organizationId
+
current user

Return:

{
  "updated": 7
}

============================================================
18. NOTIFICATION PREFERENCES API
============================================================

Base:

/organizations/:organizationId/notification-preferences

Any org member may manage THEIR OWN preferences.

GET
/organizations/:organizationId/notification-preferences

Return current preferences, using defaults when no row exists.

PATCH
/organizations/:organizationId/notification-preferences

Body may include:

{
  "alertFiredInApp": true,
  "alertFiredEmail": false,
  "alertResolvedInApp": true,
  "alertResolvedEmail": false
}

Upsert preference for:

organizationId
+
req.user.id

A user cannot modify another user's preferences.

============================================================
19. REAL-TIME IN-APP NOTIFICATIONS
============================================================

Phase 5 already has realtime-service.

When a new in-app Notification is created, publish best-effort Redis realtime event:

notification:created

Target room:

user:{userId}

Payload:

{
  "notification": {...}
}

This requires a minimal Realtime Service extension:

authenticated socket automatically joins:

user:{authenticatedUserId}

This room requires no client-supplied userId.

The server derives it from JWT.

Do NOT allow clients to request arbitrary user rooms.

============================================================
20. REAL-TIME FAILURE SEMANTICS
============================================================

Realtime delivery is best-effort.

If Redis publish fails:

Notification remains safely persisted.

HTTP/Kafka processing should not roll back.

The UI can fetch notifications through REST.

============================================================
21. KAFKA CONSUMER COMMIT SEMANTICS
============================================================

An alert event can be considered handled after:

- event validates
- recipient resolution succeeds
- durable notification intent is persisted

Email does NOT need to be sent before Kafka offset is committed.

That is the entire reason for the job queue.

Do NOT block Kafka consumer waiting for email provider.

============================================================
22. ORGANIZATION SERVICE FAILURE
============================================================

If recipient membership lookup fails:

do NOT silently treat the event as having no recipients.

This is a dependency failure.

Do not commit the Kafka message as successful.

Allow retry.

Otherwise an alert could permanently lose all notifications.

============================================================
23. AUTH USER RESOLUTION FAILURE
============================================================

Important distinction:

User email lookup is only necessary for EMAIL delivery.

The in-app Notification can still exist.

Preferred design:

Kafka event processing does NOT resolve email addresses.

It creates durable notification + email delivery intent.

Email worker resolves current email later.

This keeps event consumer fast and reduces cross-service dependencies.

============================================================
24. NOTIFICATION CONSUMER DLQ
============================================================

Create:

sentinel.notifications.consumer.dlq.v1

Use for permanent invalid Kafka events such as:

- malformed JSON
- unsupported schemaVersion
- invalid alert-event schema

Do NOT DLQ temporary Organization Service/network failures immediately.

Retry those according to Kafka processing semantics first.

DLQ payload:

{
  "failedAt": "...",
  "sourceTopic": "...",
  "partition": 0,
  "offset": "...",
  "errorCode": "...",
  "errorMessage": "...",
  "originalMessage": ...
}

============================================================
25. INTERNAL EVENT VALIDATION
============================================================

Create Zod schemas for:

ALERT_FIRED
ALERT_RESOLVED

Require:

eventId
schemaVersion = 1
organizationId
serviceId
alertId
ruleId
ruleName
severity
occurredAt

incidentId may be nullable/optional depending on timing.

Do not accept arbitrary event shape.

============================================================
26. API GATEWAY
============================================================

Add:

NOTIFICATION_SERVICE_URL

Proxy:

/api/notifications/*

to:

notification-service:4009

Strip:

/api/notifications

Example:

External:

GET
/api/notifications/organizations/ORG_ID/notifications

Internal:

GET
/organizations/ORG_ID/notifications

Do NOT expose:

/internal/*

through Gateway.

============================================================
27. HEALTH / READINESS
============================================================

Add:

GET /health

{
  "status": "ok",
  "service": "notification-service"
}

Add:

GET /ready

Check:

- PostgreSQL
- Kafka
- Redis / local queue backend

Return 503 if required dependencies are unavailable.

Email provider itself does not necessarily need to make health fail if using an
external provider; document your choice.

============================================================
28. GRACEFUL SHUTDOWN
============================================================

Handle:

SIGINT
SIGTERM

Shutdown:

1. stop HTTP server
2. stop Kafka consumer
3. stop reconciliation loop
4. close queue
5. stop email worker
6. disconnect Redis
7. disconnect Kafka producer/DLQ producer
8. disconnect Prisma

============================================================
29. LOGGING
============================================================

Log:

- Kafka eventId
- organizationId
- userId
- notificationId
- deliveryId
- notification type
- queue job ID
- email send success/failure
- retry attempt
- reconciliation enqueue

Do NOT log:

- JWT
- internal service secret
- full Authorization headers
- passwords
- API keys

Avoid logging entire notification bodies if they may later contain sensitive
incident context.

============================================================
30. TESTING REQUIREMENTS
============================================================

Add meaningful automated tests.

At minimum:

1. ALERT_FIRED creates notifications for OWNER/ADMIN/ENGINEER

2. VIEWER is not notified by default

3. duplicate Kafka event does not create duplicate Notification rows

4. notification preferences disable email correctly

5. notification preferences disable in-app correctly

6. notification + delivery rows created transactionally

7. queue failure does not delete notification intent

8. PENDING email delivery is reconciled later

9. email job success marks SENT

10. repeated job for already SENT delivery is idempotent

11. email failure retries

12. final email failure marks FAILED

13. ALERT_RESOLVED uses resolved preferences

14. unauthenticated notification query → 401

15. non-member → 404

16. user A cannot read user B notifications

17. mark read is scoped to current user

18. mark all read only affects current user/current org

19. unread count is correct

20. preference GET returns defaults when row absent

21. preference PATCH upserts

22. malformed Kafka event → notification DLQ

23. Organization Service temporary failure does not lose event

24. real-time notification event targets only user:{userId}

25. client cannot join arbitrary other user's room

============================================================
31. DOCKER SETUP
============================================================

Add:

notification-service

Port:

4009

Database:

sentinel_notification

Create PostgreSQL init script:

infrastructure/postgres-init/<next-number>-create-notification-db.sh

Environment:

PORT=4009

DATABASE_URL=postgresql://...

JWT_ACCESS_SECRET=...

ORGANIZATION_SERVICE_URL=http://organization-service:4002

AUTH_SERVICE_URL=http://auth-service:4001

INTERNAL_SERVICE_SECRET=...

KAFKA_BROKERS=kafka:9092

KAFKA_CLIENT_ID=sentinel-notification-service

KAFKA_GROUP_ID=sentinel-notification-service-v1

REDIS_URL=redis://redis:6379

EMAIL_PROVIDER=console

NOTIFICATION_RECONCILE_INTERVAL_MS=30000

NODE_ENV=development

Queue names:

sentinel-notification-email

============================================================
32. UPDATE KAFKA TOPICS
============================================================

Add:

sentinel.notifications.consumer.dlq.v1

Replication factor:

1 locally

Document production replication separately.

============================================================
33. MINIMAL AUTH SERVICE MODIFICATION
============================================================

Add internal endpoint:

POST /internal/users/resolve

Protected by:

x-internal-service-secret

Request:

{
  "userIds": [...]
}

Return only:

id
email
name

Batch efficiently.

Clearly mark all changes as:

MODIFY EXISTING FILE

Do not rebuild Auth Service.

============================================================
34. MINIMAL ORGANIZATION SERVICE MODIFICATION
============================================================

Add:

GET /internal/organizations/:organizationId/members

Protected by:

x-internal-service-secret

Return safe member data:

userId
role

Do not expose invitation tokens or unrelated data.

Clearly mark changes as:

MODIFY EXISTING FILE

============================================================
35. MINIMAL REALTIME SERVICE MODIFICATION
============================================================

On authenticated socket connection:

socket.join(`user:${socket.data.user.id}`)

Do this server-side automatically.

No client event needed.

Add support for:

notification:created

Redis broadcast messages.

Do not allow:

socket.emit("user:join", { userId: ... })

There should be no arbitrary user-room join API.

============================================================
36. MANUAL END-TO-END DEMO
============================================================

README must demonstrate:

1. create organization

2. create at least:
   OWNER
   ENGINEER
   VIEWER

3. create backend service

4. create firing alert rule

5. connect OWNER and ENGINEER websocket clients

6. send telemetry causing alert to FIRING

7. Alert Service publishes ALERT_FIRED

8. Notification Service consumes event

9. query OWNER notifications

Expected:

new alert notification

10. query ENGINEER notifications

Expected:

new notification

11. query VIEWER

Expected:

no alert notification by default

12. observe ConsoleEmailProvider output for users with email enabled

13. verify websocket:

notification:created

received by correct user

14. mark notification read

15. verify unread count decreases

16. disable OWNER alert email preference

17. trigger a new alert instance

18. verify in-app notification exists but email delivery is skipped/not created,
depending on implementation choice

============================================================
37. QUEUE RESILIENCE DEMO
============================================================

README should include:

1. stop local queue/Redis or simulate enqueue failure

2. produce ALERT_FIRED

3. verify Notification record is still persisted

4. verify EMAIL delivery remains PENDING

5. restore queue

6. reconciliation loop enqueues delivery

7. email worker sends it

This demonstrates that notification delivery failure is isolated from alert
detection.

============================================================
38. ARCHITECTURAL RULES
============================================================

Do NOT violate these:

1. Alert Service must not send email directly.

2. Incident Service must not send email directly.

3. Notification Service owns notification/delivery state.

4. Kafka event consumption creates durable notification intent.

5. Queue worker performs external delivery.

6. Email failure never blocks alert firing.

7. In-app notification persistence is authoritative.

8. Realtime UI delivery is best-effort only.

9. Auth Service owns user email.

10. Organization Service owns memberships.

11. Notification Service never reads their databases.

12. Kafka consumption is idempotent.

13. Queue jobs are idempotent.

14. Tenant isolation applies to every human notification API.

15. Users only see their own notifications.

16. Do NOT implement Slack yet.

17. Do NOT implement AI/RAG.

18. Do NOT implement Document Service here.

19. API Gateway contains no business logic.

============================================================
39. PREPARE FOR PHASE 10
============================================================

Phase 10 is Document Service.

It will introduce:

- runbooks
- postmortems
- architecture documents
- document metadata
- presigned uploads
- S3-compatible storage
- processing lifecycle

Notification Service should remain completely decoupled from document handling.

Do not add document concepts here.

============================================================
40. DELIVERABLE
============================================================

Give me:

1. full notification-service folder structure

2. every new file with complete code

3. Prisma schema

4. Kafka alert-event schemas

5. Kafka consumer

6. recipient-selection service

7. notification persistence logic

8. preference logic

9. queue abstraction

10. BullMQ local adapter

11. optional SQS adapter interface/scaffold

12. email worker

13. EmailProvider abstraction

14. ConsoleEmailProvider

15. reconciliation worker

16. realtime notification publisher

17. JWT + tenant middleware

18. notification REST APIs

19. preference REST APIs

20. health/readiness endpoints

21. DLQ handling

22. tests

23. Dockerfile

24. .env.example

25. PostgreSQL init script

26. Kafka topic-init changes

27. exact docker-compose modifications

28. exact API Gateway modifications

29. exact Auth Service internal endpoint modifications

30. exact Organization Service internal endpoint modifications

31. exact Realtime Service user-room modifications

32. README end-to-end demo

33. queue resilience demo

Clearly mark all output as:

NEW FILE

or

MODIFY EXISTING FILE

Do not rewrite unrelated Phase 1–8 services.

If the existing repository differs slightly from these assumptions, adapt
minimally while preserving the established architecture.

Ask clarifying questions only if something is genuinely impossible to infer.
Otherwise make a reasonable engineering assumption, state it, and continue.

```