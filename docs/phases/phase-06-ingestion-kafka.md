## PHASE 6 PROMPT — Ingestion Service + Kafka

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect their backend services to it. Those services
stream logs, metrics, and events into SentinelAI. SentinelAI detects failures,
creates incidents, lets engineers collaborate in real time, and later uses an
AI+RAG investigator to correlate telemetry, deployments, documentation, and past
incidents.

The system is intentionally split into focused microservices.

Communication model:

- synchronous REST for immediate service-to-service validation
- Kafka for asynchronous/high-volume event streaming
- Redis Pub/Sub for ephemeral real-time UI updates

Each service owns its own database. No service may directly query another
service's database.

============================================================
WHAT ALREADY EXISTS — PHASES 1–5
============================================================

1. auth-service — port 4001
   - user authentication
   - JWT access/refresh tokens
   - session security

2. organization-service — port 4002
   - organizations
   - membership
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
   - service metadata
   - heartbeat/health status

   Backend service authentication uses:

   x-api-key: <service-api-key>

   API keys are stored hashed and identify the registered service.

4. incident-service — port 4004
   - incidents
   - lifecycle
   - severity
   - assignment
   - comments
   - timeline

5. realtime-service — port 4005
   - Socket.IO
   - Redis Pub/Sub / Redis adapter
   - incident rooms
   - realtime incident collaboration

6. api-gateway — port 4000
   - external REST entry point
   - no domain/business logic

7. PostgreSQL and Redis already exist in Docker Compose.

============================================================
YOUR TASK — PHASE 6: INGESTION SERVICE + KAFKA
============================================================

Build the telemetry ingestion front door.

Applications registered in Service Catalog will send:

- logs
- metrics
- generic application events

to this service.

The Ingestion Service must:

1. authenticate the registered backend service using x-api-key
2. validate telemetry payloads
3. enrich each telemetry record with trusted server-side metadata
4. publish the resulting record to Kafka
5. return quickly

DO NOT persist telemetry to PostgreSQL in this phase.

Persistence will be Phase 7 through dedicated Kafka consumers/workers.

This distinction is important.

Ingestion Service should stay fast and stateless.

============================================================
1. ARCHITECTURE
============================================================

Flow:

Backend application
     |
     | POST telemetry + x-api-key
     v
API Gateway
     |
     v
Ingestion Service
     |
     | validate API key against Service Catalog
     | validate payload
     | enrich record
     v
Kafka
     |
     +--> telemetry.logs.v1
     +--> telemetry.metrics.v1
     +--> telemetry.events.v1

Phase 7 consumers will later read from these topics.

The ingestion request must NOT synchronously wait for database persistence by a
worker.

It only needs successful validation + Kafka acknowledgement.

============================================================
2. TECH STACK
============================================================

Use:

- Node.js
- Express
- TypeScript
- KafkaJS
- Zod
- helmet
- cors

No Prisma database is needed for Ingestion Service in this phase.

Service port:

4006

Suggested directory:

services/ingestion-service/

============================================================
3. BACKEND SERVICE AUTHENTICATION
============================================================

Telemetry comes from registered backend services, NOT human dashboard users.

Do NOT use human JWT authentication for telemetry endpoints.

Require:

x-api-key

The Service Catalog Service owns API keys.

Ingestion Service MUST NOT query Service Catalog's database.

Use a real synchronous REST validation call.

Add or reuse a Service Catalog endpoint designed for internal API-key
authentication.

Preferred internal endpoint:

POST /internal/api-keys/verify

Request:

{
  "apiKey": "snt_live_..."
}

Response on success:

{
  "valid": true,
  "service": {
    "id": "...",
    "organizationId": "...",
    "name": "payment-service",
    "environment": "PRODUCTION"
  },
  "apiKey": {
    "id": "...",
    "name": "production key"
  }
}

Invalid/revoked/expired key:

401

Important security requirement:

The raw API key should exist in memory only as long as needed for verification.

Never log:

- x-api-key
- raw API key
- request headers containing it

============================================================
4. MODIFY SERVICE CATALOG MINIMALLY
============================================================

If Service Catalog currently only validates API keys inside its own heartbeat
middleware, extract that logic into reusable service/repository code.

Add:

POST /internal/api-keys/verify

This endpoint is NOT intended for browsers.

For this practice architecture, secure it with an internal shared secret.

Header:

x-internal-service-secret: <INTERNAL_SERVICE_SECRET>

Service Catalog validates the shared secret before accepting the call.

Environment:

INTERNAL_SERVICE_SECRET=<strong-local-dev-secret>

Ingestion Service must send the same secret.

If secret missing/wrong:

401

Do NOT expose keyHash in the response.

Do NOT return the raw key.

The endpoint should:

1. hash submitted API key
2. find corresponding ApiKey
3. verify:
   - exists
   - not revoked
   - not expired
4. load associated Service
5. update lastUsedAt
6. return safe service identity

This is a Phase 6 integration change, not a Service Catalog redesign.

============================================================
5. TRUST BOUNDARY
============================================================

Never trust the sending application to specify:

- organizationId
- serviceId
- service name

Those values MUST come from API-key verification.

This means if a malicious client sends:

{
  "organizationId": "another-org",
  "serviceId": "another-service"
}

ignore/reject those fields.

Preferred behavior:

do not even allow those fields in the telemetry body schema.

Server enriches telemetry with:

organizationId
serviceId
serviceName
environment

from verified API-key identity.

============================================================
6. TELEMETRY ENDPOINTS
============================================================

Base path:

/v1

Create:

POST /v1/logs
POST /v1/metrics
POST /v1/events

All require:

x-api-key

============================================================
7. LOG INGESTION SCHEMA
============================================================

POST /v1/logs

Support both:

single record

and

batch records

Preferred body:

{
  "records": [...]
}

Maximum:

1000 records/request

Each log record:

{
  "timestamp": "2026-09-04T10:30:00.000Z",
  "level": "TRACE|DEBUG|INFO|WARN|ERROR|FATAL",
  "message": "Database connection failed",
  "traceId": "optional string",
  "spanId": "optional string",
  "requestId": "optional string",
  "attributes": {
    "dbHost": "postgres",
    "retry": 3
  }
}

Rules:

timestamp:
- ISO 8601
- optional
- server uses ingestion time if omitted

message:
- required
- non-empty
- reasonable max, e.g. 32 KB

attributes:
- optional JSON object
- enforce a reasonable serialized size

Do not accept arbitrary giant payloads.

============================================================
8. METRIC INGESTION SCHEMA
============================================================

POST /v1/metrics

Body:

{
  "records": [...]
}

Maximum:

1000/request

Each metric:

{
  "timestamp": "optional ISO datetime",
  "name": "http_request_error_rate",
  "value": 0.12,
  "type": "GAUGE|COUNTER|HISTOGRAM",
  "unit": "optional string",
  "attributes": {
    "route": "/checkout",
    "method": "POST"
  }
}

name:
- required
- non-empty

value:
- finite number

attributes:
- optional object

For this phase:

HISTOGRAM may still carry a single numeric value.

Do not build histogram buckets yet.

============================================================
9. GENERIC EVENT INGESTION SCHEMA
============================================================

POST /v1/events

Body:

{
  "records": [...]
}

Each event:

{
  "timestamp": "optional ISO datetime",
  "name": "deployment.completed",
  "severity": "INFO|WARN|ERROR",
  "message": "optional human-readable message",
  "attributes": {
    "version": "v4.7",
    "commit": "abc123"
  }
}

Maximum:

1000/request

This event type is generic application telemetry.

Do NOT confuse it with Kafka infrastructure event names.

============================================================
10. CANONICAL KAFKA ENVELOPE
============================================================

Every telemetry record published to Kafka must use a common envelope.

Define a versioned interface.

Example:

{
  "eventId": "uuid",
  "schemaVersion": 1,
  "telemetryType": "LOG",
  "organizationId": "...",
  "serviceId": "...",
  "serviceName": "payment-service",
  "environment": "PRODUCTION",
  "observedAt": "timestamp from client or server",
  "ingestedAt": "server timestamp",
  "data": {...},
  "metadata": {
    "apiKeyId": "...",
    "ingestionRequestId": "..."
  }
}

For metrics:

telemetryType = METRIC

For generic events:

telemetryType = EVENT

The server-generated values are authoritative.

============================================================
11. KAFKA TOPICS
============================================================

Use versioned topics:

sentinel.telemetry.logs.v1

sentinel.telemetry.metrics.v1

sentinel.telemetry.events.v1

Do not use one giant topic for every telemetry type.

Create constants rather than repeating strings throughout code.

============================================================
12. KAFKA PARTITION KEY
============================================================

Publish with:

key = serviceId

Reason:

records from the same backend service should generally preserve ordering within
a Kafka partition.

Document:

Kafka only guarantees ordering within a partition.

Do not claim global ordering.

============================================================
13. KAFKA PRODUCER
============================================================

Create a reusable Kafka producer abstraction.

Suggested:

infrastructure/kafka.ts

or:

services/kafkaProducer.ts

Use KafkaJS.

Environment variables:

KAFKA_BROKERS=kafka:9092
KAFKA_CLIENT_ID=sentinel-ingestion-service

Parse broker list as comma-separated.

Connect producer at startup.

Handle shutdown gracefully:

SIGINT
SIGTERM

Disconnect producer.

============================================================
14. ACKNOWLEDGEMENT SEMANTICS
============================================================

Kafka publish must be acknowledged before returning success.

Do not return 202 before attempting to publish.

Recommended response after successful publish:

202 Accepted

{
  "accepted": 25,
  "requestId": "..."
}

Why 202:

the ingestion service accepted the telemetry into the async pipeline, but it has
not yet necessarily been persisted by Phase 7 consumers.

============================================================
15. PARTIAL BATCH FAILURE
============================================================

For Phase 6, keep semantics simple:

Validate the ENTIRE request before publishing anything.

If one record is structurally invalid:

return 400

and publish zero records.

Do not build per-record partial success yet.

This prevents confusing batch semantics.

============================================================
16. KAFKA FAILURE BEHAVIOR
============================================================

Unlike Phase 5 WebSocket publishing, Kafka here IS part of the ingestion
correctness path.

If Kafka publish fails:

do NOT claim telemetry was accepted.

Return:

503 Service Unavailable

Example error:

{
  "code": "TELEMETRY_PIPELINE_UNAVAILABLE",
  "message": "Telemetry could not be accepted at this time"
}

Do not expose Kafka internals/broker addresses.

Reason:

There is no database fallback in Ingestion Service.

If Kafka did not accept the record, the telemetry is not durably in the
SentinelAI pipeline.

============================================================
17. REQUEST SIZE LIMITS
============================================================

Add request body size limit.

Example:

1mb or 2mb

Choose a reasonable value and document it.

The service must reject giant ingestion requests rather than exhausting memory.

Return 413 for payload too large.

============================================================
18. RATE LIMITING / PROTECTION
============================================================

The API Gateway already has general IP rate limiting.

Telemetry requires service-aware protection as well.

For this phase implement a simple in-memory or Redis-backed limit keyed by:

serviceId

Preferred:

Redis-backed if existing shared Redis infrastructure is easy to reuse.

Example:

100 ingestion requests / second / registered service

If Redis is used and Redis becomes unavailable:

fail open and log the issue.

Do not block telemetry solely because the optional limiter backend failed.

Do not over-engineer distributed quotas yet.

============================================================
19. REQUEST IDs
============================================================

Preserve:

x-request-id

from API Gateway.

If called directly and missing:

generate UUID.

The Kafka envelope metadata must include:

ingestionRequestId

This lets future workers correlate Kafka records back to the ingestion request.

============================================================
20. API GATEWAY WIRING
============================================================

Update api-gateway.

Add:

INGESTION_SERVICE_URL

Proxy:

/api/ingest/*

to ingestion-service.

Strip:

/api/ingest

Examples:

External:

POST
/api/ingest/v1/logs

Internal:

POST
/v1/logs

Preserve:

x-api-key
x-request-id

Never log x-api-key at gateway.

============================================================
21. KAFKA LOCAL DEVELOPMENT
============================================================

Add Kafka to Docker Compose.

Use a modern local Kafka setup.

Preferred:

Kafka running in KRaft mode

Avoid ZooKeeper unless the current project already uses it.

Use a stable Docker image and configure:

- broker listener for Docker-network services
- optional host listener if helpful for local debugging

The required internal broker address should work as:

kafka:9092

Add healthcheck if reasonably reliable.

Services depending on Kafka should wait until Kafka is ready or implement robust
startup retries.

Do not rely purely on Docker `depends_on` for application-level readiness.

============================================================
22. KAFKA TOPIC CREATION
============================================================

For local development, ensure topics exist automatically.

Either:

A. configure broker auto-topic creation for dev

OR preferably

B. add a kafka-init container/script that creates:

sentinel.telemetry.logs.v1
sentinel.telemetry.metrics.v1
sentinel.telemetry.events.v1

Use multiple partitions.

Reasonable dev value:

3 partitions/topic

Replication factor:

1 locally

Document that production will use higher replication.

============================================================
23. HEALTH / READINESS
============================================================

Add:

GET /health

Example:

{
  "status": "ok",
  "service": "ingestion-service"
}

Also add:

GET /ready

Readiness should reflect whether Kafka producer is usable.

Example healthy:

{
  "status": "ready",
  "kafka": "connected"
}

If Kafka is unavailable:

return 503

The process may still stay alive while reconnecting.

============================================================
24. ERROR HANDLING
============================================================

Use:

AppError
centralized error middleware

Expected errors:

400 INVALID_REQUEST
401 INVALID_API_KEY
413 PAYLOAD_TOO_LARGE
429 RATE_LIMITED
502 SERVICE_CATALOG_UNAVAILABLE
503 TELEMETRY_PIPELINE_UNAVAILABLE

Do not expose stack traces in production.

============================================================
25. LOGGING
============================================================

Log useful metadata:

- requestId
- serviceId
- organizationId
- telemetry type
- record count
- Kafka publish result/failure

Never log:

- x-api-key
- raw API key
- Authorization tokens
- complete telemetry payload by default

Logs themselves may contain sensitive application data.

Avoid echoing them into Ingestion Service logs unnecessarily.

============================================================
26. SECURITY
============================================================

Must enforce:

1. backend services authenticate via API key

2. user JWT must NOT authenticate telemetry endpoints

3. organizationId/serviceId come from trusted API-key verification

4. raw API key is never stored in Ingestion Service

5. Service Catalog DB is never directly accessed

6. internal API-key verification endpoint requires internal service secret

7. payloads have size and schema limits

8. no sensitive headers are logged

============================================================
27. TESTING REQUIREMENTS
============================================================

Add meaningful tests.

At minimum:

1. missing x-api-key → 401

2. invalid API key → 401

3. revoked API key → 401

4. Service Catalog unavailable → 502

5. valid log accepted → Kafka producer called

6. valid metric accepted → correct metric topic

7. valid event accepted → correct event topic

8. serviceId used as Kafka partition key

9. organizationId in client body cannot override trusted org identity

10. batch > maximum rejected

11. one invalid record causes full batch rejection with zero Kafka publishes

12. giant body → 413

13. Kafka failure → 503

14. successful request → 202

15. generated envelope has:
    eventId
    schemaVersion
    organizationId
    serviceId
    observedAt
    ingestedAt
    requestId

16. no API key appears in resulting Kafka envelope

17. rate limiter rejects over-limit service with 429

18. Redis limiter failure, if used, fails open

Production Service Catalog integration must use real HTTP.

Mocks are fine in tests.

============================================================
28. MANUAL END-TO-END TEST
============================================================

README should demonstrate:

1. login as organization owner

2. create organization

3. register service:
   payment-service

4. create API key for payment-service

5. send heartbeat and confirm key works

6. send log:

POST
http://localhost:4000/api/ingest/v1/logs

Headers:

x-api-key: <raw-key>
Content-Type: application/json

Body:

{
  "records": [
    {
      "level": "ERROR",
      "message": "Database connection failed",
      "attributes": {
        "host": "postgres"
      }
    }
  ]
}

Expected:

202

7. send metrics batch

8. send generic event batch

9. inspect Kafka topic using a console consumer and verify messages appear

10. confirm message contains trusted:

organizationId
serviceId
serviceName

11. revoke API key

12. repeat ingestion

Expected:

401

13. stop Kafka

14. send valid telemetry

Expected:

503

15. restart Kafka and confirm ingestion works again

============================================================
29. PROJECT STRUCTURE
============================================================

Suggested:

services/
  ingestion-service/
    src/
      app.ts
      server.ts

      config/
        env.ts

      routes/
        ingestion.routes.ts
        health.routes.ts

      controllers/
        ingestion.controller.ts

      services/
        ingestion.service.ts
        apiKeyVerification.service.ts
        rateLimit.service.ts

      clients/
        serviceCatalog.client.ts

      middleware/
        requestId.ts
        requireServiceApiKey.ts
        validate.ts
        errorHandler.ts
        serviceRateLimit.ts

      schemas/
        log.schema.ts
        metric.schema.ts
        event.schema.ts

      kafka/
        client.ts
        producer.ts
        topics.ts

      types/
        telemetry.ts
        express.d.ts

      utils/
        AppError.ts
        logger.ts

    tests/

    Dockerfile
    package.json
    tsconfig.json
    .env.example

============================================================
30. ARCHITECTURAL RULES
============================================================

Do NOT violate these:

1. Ingestion Service owns no telemetry persistence database in Phase 6.

2. Ingestion authenticates backend services, not humans.

3. Service identity comes from API key verification.

4. Never trust org/service identity from payload.

5. Service Catalog owns API keys.

6. Cross-service validation uses REST, never DB access.

7. Kafka is the durable async boundary for telemetry.

8. Kafka failure means ingestion failure.

9. Redis rate-limit failure may fail open.

10. No alert evaluation in this phase.

11. No telemetry DB persistence in this phase.

12. No incident creation in this phase.

13. No AI/RAG.

14. No WebSocket logic inside Ingestion Service.

15. Keep API Gateway free of business logic.

============================================================
31. PREPARE FOR PHASE 7
============================================================

Phase 7 will introduce Telemetry Workers.

Those workers will consume:

sentinel.telemetry.logs.v1
sentinel.telemetry.metrics.v1
sentinel.telemetry.events.v1

and persist records.

Therefore Kafka envelope design MUST be stable enough for independent consumers.

Use:

schemaVersion: 1

Do not casually publish undocumented arbitrary structures.

============================================================
32. DELIVERABLE
============================================================

Give me:

1. full ingestion-service folder structure

2. complete code for every new file

3. Zod telemetry schemas

4. API-key authentication middleware

5. Service Catalog verification client

6. Kafka producer implementation

7. canonical Kafka envelope types

8. topic constants

9. service-level rate limiter

10. health/readiness routes

11. tests

12. Dockerfile

13. .env.example

14. exact Service Catalog modifications

15. exact API Gateway modifications

16. exact Docker Compose Kafka modifications

17. Kafka topic-init configuration/script

18. README with end-to-end curl examples

19. Kafka console-consumer command for verifying received records

Clearly label everything:

NEW FILE

or

MODIFY EXISTING FILE

Do not rewrite unrelated existing services.

If the current repository structure differs slightly, adapt minimally while
preserving all architecture and security constraints above.

Ask questions only if something is genuinely impossible to infer. Otherwise
make a reasonable engineering assumption, state it, and continue.

```