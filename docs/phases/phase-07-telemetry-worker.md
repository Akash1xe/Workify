## PHASE 7 PROMPT — Telemetry Worker

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect backend services to it. Those services stream
logs, metrics, and events into SentinelAI. The system detects failures, creates
incidents, supports real-time collaboration, and later uses AI+RAG to investigate
root causes from telemetry, deployments, documentation, and past incidents.

The architecture is split into focused microservices.

Communication model:

- synchronous REST for immediate cross-service validation
- Kafka for durable asynchronous/high-volume event streaming
- Redis Pub/Sub for ephemeral real-time UI updates

Each service owns its own database. No service may directly query another
service's tables.

============================================================
WHAT ALREADY EXISTS — PHASES 1–6
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
   - tenant membership authority

3. service-catalog-service — port 4003
   - backend service registration
   - service API keys
   - heartbeat/health
   - trusted service identity

4. incident-service — port 4004
   - incidents
   - lifecycle
   - comments
   - assignment
   - timeline
   - severity

5. realtime-service — port 4005
   - Socket.IO
   - Redis Pub/Sub
   - incident rooms
   - real-time collaboration

6. ingestion-service — port 4006
   - accepts backend telemetry
   - authenticates using x-api-key
   - verifies key through Service Catalog
   - validates logs/metrics/events
   - enriches telemetry with trusted:
       organizationId
       serviceId
       serviceName
       environment
   - publishes to Kafka
   - does NOT persist telemetry itself

Kafka topics already exist:

sentinel.telemetry.logs.v1
sentinel.telemetry.metrics.v1
sentinel.telemetry.events.v1

Canonical Kafka envelope:

{
  "eventId": "uuid",
  "schemaVersion": 1,
  "telemetryType": "LOG|METRIC|EVENT",
  "organizationId": "...",
  "serviceId": "...",
  "serviceName": "...",
  "environment": "PRODUCTION|STAGING|DEVELOPMENT",
  "observedAt": "...",
  "ingestedAt": "...",
  "data": {...},
  "metadata": {
    "apiKeyId": "...",
    "ingestionRequestId": "..."
  }
}

Kafka messages use:

key = serviceId

============================================================
YOUR TASK — PHASE 7: TELEMETRY WORKER
============================================================

Build the worker layer that consumes telemetry from Kafka and persists it.

This phase should demonstrate:

- Kafka consumer groups
- horizontal scaling
- idempotent processing
- retries
- dead-letter handling
- service-owned telemetry persistence
- safe tenant-aware query APIs for future Incident/Alert/AI phases

Do NOT implement alert rules yet.

Alert evaluation will be Phase 8.

Do NOT implement AI/RAG.

============================================================
1. ARCHITECTURE
============================================================

Flow:

Ingestion Service
      |
      v
Kafka
      |
      +--> logs worker
      +--> metrics worker
      +--> events worker
              |
              v
         PostgreSQL

Preferred deployment model:

one telemetry-worker service/process capable of consuming all three topics.

Use separate Kafka consumers or a single consumer subscribed to all three
topics depending on what produces the cleanest implementation.

Use a shared consumer group:

sentinel-telemetry-persistence-v1

Multiple worker replicas with the same group ID must divide partitions between
themselves.

Example:

worker-1
worker-2
worker-3

all use:

groupId = sentinel-telemetry-persistence-v1

Kafka will assign partitions among replicas.

============================================================
2. TECH STACK
============================================================

Use:

- Node.js
- TypeScript
- KafkaJS
- Prisma
- PostgreSQL
- Express only for health/query endpoints
- Zod
- helmet
- cors

New service:

services/telemetry-worker/

Port:

4007

Database:

sentinel_telemetry

============================================================
3. DATABASE OWNERSHIP
============================================================

Telemetry Worker owns telemetry persistence.

Create its own PostgreSQL database:

sentinel_telemetry

No other service should write directly to these tables.

Future services may query telemetry through APIs exposed by this service.

Do NOT let Incident Service, Alert Service, or AI Service query these tables
directly.

============================================================
4. PRISMA DATA MODEL
============================================================

Create:

enum TelemetryEnvironment {
  DEVELOPMENT
  STAGING
  PRODUCTION
}

enum LogLevel {
  TRACE
  DEBUG
  INFO
  WARN
  ERROR
  FATAL
}

enum MetricType {
  GAUGE
  COUNTER
  HISTOGRAM
}

enum EventSeverity {
  INFO
  WARN
  ERROR
}

------------------------------------------------------------
TelemetryLog
------------------------------------------------------------

Fields:

- id: UUID
- eventId: string unique
- organizationId: string
- serviceId: string
- serviceName: string
- environment: TelemetryEnvironment
- observedAt: DateTime
- ingestedAt: DateTime
- persistedAt: DateTime default now
- level: LogLevel
- message: text
- traceId: optional string
- spanId: optional string
- requestId: optional string
- attributes: optional Json
- ingestionRequestId: optional string
- apiKeyId: optional string

Indexes:

- organizationId
- serviceId
- observedAt
- level
- traceId
- requestId
- (organizationId, serviceId, observedAt)

------------------------------------------------------------
TelemetryMetric
------------------------------------------------------------

Fields:

- id: UUID
- eventId: string unique
- organizationId
- serviceId
- serviceName
- environment
- observedAt
- ingestedAt
- persistedAt default now
- name: string
- value: Float
- type: MetricType
- unit: optional string
- attributes: optional Json
- ingestionRequestId: optional string
- apiKeyId: optional string

Indexes:

- organizationId
- serviceId
- observedAt
- name
- (organizationId, serviceId, name, observedAt)

------------------------------------------------------------
TelemetryEvent
------------------------------------------------------------

Fields:

- id: UUID
- eventId: string unique
- organizationId
- serviceId
- serviceName
- environment
- observedAt
- ingestedAt
- persistedAt default now
- name: string
- severity: EventSeverity
- message: optional text
- attributes: optional Json
- ingestionRequestId: optional string
- apiKeyId: optional string

Indexes:

- organizationId
- serviceId
- observedAt
- name
- severity
- (organizationId, serviceId, observedAt)

Important:

eventId from Kafka must be unique.

This is the primary idempotency key.

============================================================
5. IDEMPOTENCY
============================================================

Kafka is at-least-once.

Therefore the same message may be delivered more than once.

The worker MUST NOT create duplicate telemetry rows.

Use:

eventId UNIQUE

When processing a record:

- attempt insert
- if eventId already exists:
    treat as already processed
    log at debug/info
    do NOT throw
    do NOT retry
    do NOT write duplicate row

Do not use message offset as the domain idempotency key.

Offsets are Kafka-specific and can change between environments.

============================================================
6. KAFKA CONSUMER CONFIGURATION
============================================================

Environment:

KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=sentinel-telemetry-worker
KAFKA_GROUP_ID=sentinel-telemetry-persistence-v1

Subscribe to:

sentinel.telemetry.logs.v1
sentinel.telemetry.metrics.v1
sentinel.telemetry.events.v1

Set:

fromBeginning=false

for normal operation.

Do not replay the entire topic every time the worker restarts.

============================================================
7. MESSAGE PARSING / VALIDATION
============================================================

Do NOT blindly trust Kafka payloads just because Ingestion Service created them.

Validate envelope again.

Reason:

Kafka is an integration boundary and future producers may exist.

Use Zod schemas for:

- base envelope
- log envelope
- metric envelope
- event envelope

Validate:

schemaVersion === 1

telemetryType matches topic

organizationId non-empty

serviceId non-empty

eventId valid/non-empty

observedAt parseable datetime

ingestedAt parseable datetime

data schema valid

If malformed:

do NOT crash the whole consumer.

Handle it as a poison message.

============================================================
8. TOPIC-TYPE CONSISTENCY
============================================================

Enforce:

logs topic
→ telemetryType must be LOG

metrics topic
→ METRIC

events topic
→ EVENT

If mismatch:

treat as invalid/poison message.

Do not silently persist under another type.

============================================================
9. PROCESSING FLOW
============================================================

For each Kafka message:

1. parse JSON
2. validate envelope
3. validate topic/type consistency
4. map envelope to Prisma model
5. insert using eventId uniqueness
6. if success:
      acknowledge/allow offset commit
7. if duplicate:
      treat as success
8. if transient DB failure:
      retry
9. if permanently invalid:
      send to DLQ
10. after DLQ succeeds:
      allow original offset to commit

============================================================
10. RETRY STRATEGY
============================================================

Implement bounded retry for transient processing failures.

Example:

MAX_PROCESSING_RETRIES=3

Backoff:

attempt 1
→ 250ms

attempt 2
→ 500ms

attempt 3
→ 1000ms

Use exponential backoff or similar.

Retry examples:

- temporary PostgreSQL connectivity issue
- timeout
- known transient Prisma error

Do NOT retry:

- malformed JSON
- invalid schema
- unsupported schemaVersion
- topic/type mismatch

Those should go directly to DLQ.

============================================================
11. DEAD LETTER TOPICS
============================================================

Create:

sentinel.telemetry.logs.dlq.v1
sentinel.telemetry.metrics.dlq.v1
sentinel.telemetry.events.dlq.v1

When a message cannot be processed after retries, publish a DLQ envelope.

Example:

{
  "failedAt": "...",
  "sourceTopic": "sentinel.telemetry.logs.v1",
  "sourcePartition": 1,
  "sourceOffset": "12345",
  "errorCode": "TELEMETRY_PERSISTENCE_FAILED",
  "errorMessage": "safe non-secret message",
  "attempts": 3,
  "originalMessage": {...}
}

For malformed raw JSON:

originalMessage may be stored as:

{
  "rawValueBase64": "..."
}

Be careful not to log the full payload automatically.

DLQ is for debugging/reprocessing.

============================================================
12. DLQ FAILURE
============================================================

If persistence fails permanently AND DLQ publishing also fails:

do NOT silently commit the original message.

The worker should surface the failure and allow Kafka to retry later.

Do not lose telemetry just because the DLQ pipeline is unavailable.

============================================================
13. OFFSET / COMMIT SEMANTICS
============================================================

Use safe Kafka consumption semantics.

Do not commit an offset before processing completes.

A message is considered successfully handled when:

A. it was persisted successfully

OR

B. it was already persisted because eventId existed

OR

C. it was intentionally moved to DLQ successfully

Only then should its offset be considered processed.

Avoid complicated custom offset handling unless necessary.

Use KafkaJS patterns correctly.

============================================================
14. HORIZONTAL SCALING
============================================================

Design and document this clearly.

If topic has:

3 partitions

and there are:

1 worker
→ worker gets all 3 partitions

2 workers
→ partitions distributed approximately 2 + 1

3 workers
→ each may get one partition

5 workers
→ only 3 actively consume; 2 idle

This is expected Kafka consumer-group behavior.

Do not assign a unique group ID per worker instance.

All replicas must use the same group ID.

============================================================
15. PRESERVE PER-SERVICE ORDERING
============================================================

Ingestion Service publishes with:

key = serviceId

Therefore telemetry for the same backend service should go to the same Kafka
partition.

Do not break this architecture by republishing randomly during normal processing.

Kafka guarantees order within a partition, not globally.

Document this.

============================================================
16. QUERY API
============================================================

Add read-only telemetry APIs for future phases.

These APIs will be used by:

- Alert Service
- Incident investigation
- AI/RAG agent

Human-facing query routes must use JWT + organization membership verification.

Base path:

/organizations/:organizationId/telemetry

Use the same cross-service organization membership pattern as previous services.

Call:

GET
${ORGANIZATION_SERVICE_URL}/organizations/${organizationId}

with original Authorization header.

Do not trust organizationId without this check.

============================================================
17. LOG QUERY ENDPOINT
============================================================

GET
/organizations/:organizationId/telemetry/logs

Support:

serviceId required

from optional datetime

to optional datetime

level optional

traceId optional

requestId optional

search optional text query

page
limit

Defaults:

page=1
limit=100

Max:

limit=500

Sort:

observedAt descending

Every query must include:

organizationId
serviceId

Do NOT expose another organization's telemetry even if serviceId is guessed.

For simple search in this phase:

case-insensitive `contains` against message is acceptable.

Do not add Elasticsearch yet.

============================================================
18. METRIC QUERY ENDPOINT
============================================================

GET
/organizations/:organizationId/telemetry/metrics

Support:

serviceId required

name optional

from optional

to optional

page
limit

Sort observedAt descending.

Return raw metric points.

Example:

{
  "items": [
    {
      "name": "http_request_error_rate",
      "value": 0.12,
      "observedAt": "..."
    }
  ],
  "pagination": {...}
}

Do not build aggregation engine yet.

Alert Service can consume raw or filtered points in Phase 8.

============================================================
19. EVENT QUERY ENDPOINT
============================================================

GET
/organizations/:organizationId/telemetry/events

Support:

serviceId required

name optional

severity optional

from optional

to optional

page
limit

Sort newest first.

============================================================
20. INTERNAL QUERY API FOR OTHER SERVICES
============================================================

Future services should not need human JWTs for every internal telemetry lookup.

Add internal endpoints protected by:

x-internal-service-secret

using:

INTERNAL_SERVICE_SECRET

Example:

GET
/internal/telemetry/logs

Query:

organizationId
serviceId
from
to
level
limit

GET
/internal/telemetry/metrics

GET
/internal/telemetry/events

These are intended for:

- Alert Service
- AI Service later

Validate the internal secret.

Do not expose them through public API Gateway unless explicitly needed later.

============================================================
21. SERVICE OWNERSHIP VALIDATION
============================================================

For human query APIs:

Membership verification proves the user belongs to the organization.

But also prevent arbitrary cross-org service IDs.

Two acceptable approaches:

A. every telemetry row query uses BOTH:
   organizationId
   serviceId

This is mandatory.

Optionally also:

B. verify service exists through Service Catalog.

For Phase 7, database scoping by organizationId + serviceId is sufficient for
read safety because persisted telemetry already came from trusted API-key identity.

Do not add unnecessary synchronous Service Catalog call on every query unless
needed.

============================================================
22. API GATEWAY WIRING
============================================================

Human telemetry query APIs should be available through Gateway.

Add:

TELEMETRY_SERVICE_URL

Proxy:

/api/telemetry/*

to telemetry-worker port 4007.

Strip:

/api/telemetry

Example:

External:

GET
/api/telemetry/organizations/ORG_ID/telemetry/logs?serviceId=SERVICE_ID

Internal:

GET
/organizations/ORG_ID/telemetry/logs?serviceId=SERVICE_ID

Do NOT proxy:

/internal/*

through the public Gateway.

============================================================
23. HEALTH / READINESS
============================================================

Add:

GET /health

Response:

{
  "status": "ok",
  "service": "telemetry-worker"
}

Add:

GET /ready

Check:

- PostgreSQL connectivity
- Kafka consumer connected/readiness if practical

Healthy:

200

{
  "status": "ready",
  "database": "connected",
  "kafka": "connected"
}

If dependency unavailable:

503

Do not kill the process purely because a temporary dependency outage occurs.

============================================================
24. GRACEFUL SHUTDOWN
============================================================

Handle:

SIGINT
SIGTERM

Shutdown order:

1. stop accepting new HTTP requests
2. disconnect Kafka consumer
3. disconnect DLQ producer
4. disconnect Prisma
5. exit

Avoid abrupt termination while processing messages.

============================================================
25. LOGGING
============================================================

Log:

- topic
- partition
- offset
- eventId
- serviceId
- organizationId
- processing success
- duplicate detection
- retries
- DLQ routing
- DB failure

Do NOT log:

- entire log bodies by default
- API keys
- JWTs
- authorization headers
- internal service secret

Telemetry itself may contain sensitive application data.

============================================================
26. ERROR CLASSIFICATION
============================================================

Create clear internal error categories.

Examples:

InvalidTelemetryError
UnsupportedSchemaVersionError
TopicTypeMismatchError
TransientPersistenceError
PermanentPersistenceError

Use classification to decide:

retry vs DLQ.

Do not retry every thrown exception blindly.

============================================================
27. DATABASE CONSTRAINT HANDLING
============================================================

Handle Prisma unique violation on eventId specially.

Example:

P2002

If unique field is eventId:

treat as duplicate success.

Do not send duplicates to DLQ.

Other unexpected database errors should follow retry classification.

============================================================
28. TESTING REQUIREMENTS
============================================================

Add meaningful automated tests.

At minimum:

1. valid log Kafka message creates TelemetryLog

2. valid metric creates TelemetryMetric

3. valid event creates TelemetryEvent

4. duplicate eventId creates only one row

5. malformed JSON goes to correct DLQ

6. invalid schema goes to DLQ

7. unsupported schemaVersion goes to DLQ

8. logs topic with METRIC payload goes to DLQ

9. transient DB error retries

10. success after retry is persisted once

11. failure after max retries publishes DLQ

12. DLQ publish failure does not mark message handled

13. organization A query cannot return organization B telemetry

14. unauthenticated human query → 401

15. non-member → 404

16. log filters work

17. metric filters work

18. event filters work

19. internal endpoint without secret → 401

20. valid internal endpoint returns scoped telemetry

21. pagination max limit enforced

============================================================
29. DOCKER SETUP
============================================================

Add telemetry-worker.

Port:

4007

Database:

sentinel_telemetry

Add PostgreSQL init script:

infrastructure/postgres-init/<next-number>-create-telemetry-db.sh

Create:

sentinel_telemetry

Environment:

PORT=4007

DATABASE_URL=postgresql://...

KAFKA_BROKERS=kafka:9092

KAFKA_CLIENT_ID=sentinel-telemetry-worker

KAFKA_GROUP_ID=sentinel-telemetry-persistence-v1

ORGANIZATION_SERVICE_URL=http://organization-service:4002

JWT_ACCESS_SECRET=...

INTERNAL_SERVICE_SECRET=...

MAX_PROCESSING_RETRIES=3

NODE_ENV=development

Depends on:

postgres
kafka

But still implement application-level retry/reconnect.

============================================================
30. UPDATE KAFKA TOPIC INIT
============================================================

Update local Kafka topic initialization to also create:

sentinel.telemetry.logs.dlq.v1
sentinel.telemetry.metrics.dlq.v1
sentinel.telemetry.events.dlq.v1

Recommended locally:

3 partitions for primary topics

1 or 3 partitions for DLQ topics

replication factor 1

Document production differences.

============================================================
31. README — END TO END
============================================================

Document this complete flow:

1. start stack

docker compose up --build

2. create organization

3. register payment-service

4. create service API key

5. POST logs to Ingestion Service through API Gateway

6. receive:

202 Accepted

7. Worker consumes Kafka record

8. Worker persists log

9. query:

GET
/api/telemetry/organizations/ORG_ID/telemetry/logs?serviceId=SERVICE_ID

10. see persisted log

11. send metric

12. query metric endpoint

13. send generic event

14. query event endpoint

============================================================
32. HORIZONTAL SCALING DEMO
============================================================

README should include a local scaling demonstration.

Example:

docker compose up --scale telemetry-worker=3

or equivalent depending on compose setup.

Show how to inspect worker logs and observe Kafka partition assignments.

Explain:

same group ID
+
multiple replicas
=
partitions distributed among workers

Do not claim every replica receives every message.

============================================================
33. IDEMPOTENCY DEMO
============================================================

Provide a test/script that sends or manually republishes the SAME Kafka envelope
twice using the SAME eventId.

Expected:

Kafka may deliver twice

database contains one row

worker logs second as duplicate/already processed

This is important for demonstrating at-least-once processing correctly.

============================================================
34. DLQ DEMO
============================================================

Provide a Kafka console producer or small script that publishes malformed data
to:

sentinel.telemetry.logs.v1

Example:

{
  "schemaVersion": 999,
  ...
}

Expected:

Worker rejects it

Message appears in:

sentinel.telemetry.logs.dlq.v1

Document how to consume the DLQ topic locally.

============================================================
35. ARCHITECTURAL RULES
============================================================

Do NOT violate these:

1. Ingestion Service only accepts and publishes telemetry.

2. Telemetry Worker owns telemetry persistence.

3. Kafka provides at-least-once delivery.

4. eventId provides idempotency.

5. Consumer group ID is shared by replicas.

6. Service identity already came from trusted API-key verification.

7. Every telemetry query is tenant-scoped.

8. Human queries require real org membership.

9. Internal service queries require internal authentication.

10. Other services never query telemetry DB directly.

11. Poison messages go to DLQ.

12. Transient failures are retried.

13. Duplicate events are success, not failure.

14. Do NOT implement alert logic yet.

15. Do NOT create incidents from telemetry yet.

16. Do NOT implement AI/RAG.

17. Do NOT add Elasticsearch yet.

18. API Gateway contains no telemetry business logic.

============================================================
36. PREPARE FOR PHASE 8
============================================================

Phase 8 is the Alert Service.

It will need to evaluate rules such as:

error rate > 10% for 2 minutes

CPU > 90% for 5 minutes

ERROR logs > 50 in 1 minute

Alert Service must eventually consume telemetry and manage alert state.

Therefore keep telemetry events stable and versioned.

Do not tightly couple persistence logic to future alert behavior.

============================================================
37. DELIVERABLE
============================================================

Give me:

1. full telemetry-worker folder structure

2. every new file with complete code

3. Prisma schema

4. Kafka consumer configuration

5. telemetry envelope Zod validation

6. topic/type validation

7. persistence repositories

8. idempotency handling

9. retry implementation

10. DLQ producer

11. error classification

12. human telemetry query APIs

13. internal telemetry query APIs

14. organization membership client/middleware

15. health/readiness endpoints

16. tests

17. Dockerfile

18. .env.example

19. PostgreSQL init script

20. Kafka topic-init changes

21. exact docker-compose modifications

22. exact API Gateway modifications

23. README end-to-end testing

24. horizontal scaling demonstration

25. idempotency demonstration

26. DLQ demonstration

Clearly mark everything as:

NEW FILE

or

MODIFY EXISTING FILE

Do not rewrite unrelated Phase 1–6 services.

If the repository differs slightly from assumptions above, adapt minimally and
preserve the established architecture.

Ask clarifying questions only if something is genuinely impossible to infer.
Otherwise make a reasonable engineering assumption, state it, and continue.

```