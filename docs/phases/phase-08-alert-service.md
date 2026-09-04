## PHASE 8 PROMPT — Alert Service

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect backend services to it. Those services stream
logs, metrics, and events into SentinelAI. The system detects failures, creates
incidents, supports real-time collaboration, and later uses AI+RAG to investigate
root causes using telemetry, deployments, runbooks, and past incidents.

The architecture is intentionally split into focused microservices.

Communication model:

- synchronous REST for immediate cross-service validation
- Kafka for durable asynchronous/high-volume event streaming
- Redis Pub/Sub for ephemeral real-time UI updates

Each service owns its own database.

No service may directly query another service's database.

============================================================
WHAT ALREADY EXISTS — PHASES 1–7
============================================================

1. auth-service — port 4001
   - user authentication
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
   - registered backend services
   - API keys
   - service metadata
   - heartbeat/health status

4. incident-service — port 4004
   - incident lifecycle
   - severity
   - assignment
   - comments
   - timeline
   - manual incident creation

5. realtime-service — port 4005
   - Socket.IO
   - Redis Pub/Sub
   - incident-room collaboration

6. ingestion-service — port 4006
   - receives logs/metrics/events
   - authenticates backend services with x-api-key
   - publishes trusted canonical telemetry envelopes to Kafka

7. telemetry-worker — port 4007
   - consumes telemetry from Kafka
   - persists logs/metrics/events
   - idempotent by eventId
   - retries transient failures
   - sends poison/permanent failures to DLQ
   - exposes tenant-safe telemetry query APIs

Kafka topics currently include:

sentinel.telemetry.logs.v1
sentinel.telemetry.metrics.v1
sentinel.telemetry.events.v1

plus their DLQ topics.

Canonical telemetry envelope:

{
  "eventId": "...",
  "schemaVersion": 1,
  "telemetryType": "LOG|METRIC|EVENT",
  "organizationId": "...",
  "serviceId": "...",
  "serviceName": "...",
  "environment": "...",
  "observedAt": "...",
  "ingestedAt": "...",
  "data": {...},
  "metadata": {
    "apiKeyId": "...",
    "ingestionRequestId": "..."
  }
}

============================================================
YOUR TASK — PHASE 8: ALERT SERVICE
============================================================

Build the Alert Service.

This service turns telemetry into operational state.

Its responsibilities:

- store alert rules
- evaluate incoming telemetry against those rules
- maintain alert instances/states
- deduplicate repeated firings
- automatically create incidents when appropriate
- resolve alert instances when the condition clears

This is the phase where SentinelAI starts detecting failures automatically.

Do NOT implement notifications yet.

Notification Service is Phase 9.

Do NOT implement AI/RAG.

============================================================
1. CORE ALERT STATE MACHINE
============================================================

Alert instance states:

NORMAL
PENDING
FIRING
RESOLVED

Meaning:

NORMAL
- rule currently not violated

PENDING
- condition is currently violated
- required duration has not yet elapsed

FIRING
- condition remained violated long enough
- alert is active
- incident may have been created

RESOLVED
- previously FIRING
- condition has recovered

Conceptual transition:

NORMAL
  -> PENDING
  -> FIRING
  -> RESOLVED

Also allow:

PENDING -> NORMAL

when condition clears before the required duration.

After RESOLVED, if condition violates again, a NEW alert instance should be created.

Do not mutate a resolved alert back to FIRING.

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

New service:

services/alert-service/

Port:

4008

Database:

sentinel_alert

============================================================
3. DATABASE MODEL
============================================================

Create enums:

enum AlertRuleType {
  METRIC_THRESHOLD
  LOG_COUNT
}

enum ComparisonOperator {
  GT
  GTE
  LT
  LTE
  EQ
}

enum AlertState {
  NORMAL
  PENDING
  FIRING
  RESOLVED
}

enum AlertSeverity {
  SEV1
  SEV2
  SEV3
  SEV4
}

------------------------------------------------------------
AlertRule
------------------------------------------------------------

Fields:

- id: UUID
- organizationId: string
- serviceId: string
- name: string
- description: optional string
- type: AlertRuleType
- enabled: boolean default true
- severity: AlertSeverity
- createdByUserId: string
- createdAt
- updatedAt

Metric-rule fields:

- metricName: optional string
- operator: optional ComparisonOperator
- threshold: optional Float
- durationSeconds: Int default 0

Log-rule fields:

- logLevel: optional string
- logSearch: optional string
- countThreshold: optional Int
- windowSeconds: optional Int

Recommended indexes:

- organizationId
- serviceId
- enabled
- type
- (organizationId, serviceId)

Unique:

(organizationId, serviceId, name)

------------------------------------------------------------
AlertInstance
------------------------------------------------------------

Represents one occurrence of a rule entering violation/firing state.

Fields:

- id: UUID
- organizationId: string
- serviceId: string
- ruleId: FK -> AlertRule
- state: AlertState
- startedAt: DateTime
- pendingSince: optional DateTime
- firedAt: optional DateTime
- resolvedAt: optional DateTime
- lastEvaluatedAt: DateTime
- lastObservedValue: optional Float
- incidentId: optional string
- createdAt
- updatedAt

Recommended indexes:

- organizationId
- serviceId
- ruleId
- state
- startedAt
- (ruleId, state)

Important:

At most one ACTIVE instance per rule at a time.

"Active" means:

PENDING
or
FIRING

Prevent duplicate active alerts at the service layer and, where practical,
with database constraints/index strategy.

============================================================
4. ALERT RULE VALIDATION
============================================================

Use Zod discriminated unions.

For METRIC_THRESHOLD:

required:

- metricName
- operator
- threshold
- durationSeconds

Example:

{
  "name": "High error rate",
  "type": "METRIC_THRESHOLD",
  "serviceId": "...",
  "severity": "SEV1",
  "metricName": "http_request_error_rate",
  "operator": "GT",
  "threshold": 0.10,
  "durationSeconds": 120
}

For LOG_COUNT:

required:

- logLevel optional but supported
- logSearch optional
- countThreshold
- windowSeconds

At least one matching criterion should exist:

logLevel
or
logSearch

Example:

{
  "name": "Too many DB errors",
  "type": "LOG_COUNT",
  "serviceId": "...",
  "severity": "SEV2",
  "logLevel": "ERROR",
  "logSearch": "database",
  "countThreshold": 50,
  "windowSeconds": 60
}

Reject incompatible fields.

Example:

METRIC_THRESHOLD with countThreshold
→ 400

============================================================
5. HUMAN AUTHENTICATION
============================================================

Alert rule CRUD uses JWT authentication.

Implement:

requireAuth

same pattern as previous services.

JWT_ACCESS_SECRET must match auth-service.

Attach:

req.user = {
  id,
  email
}

============================================================
6. TENANT MEMBERSHIP
============================================================

Human-facing Alert Service APIs must verify real organization membership.

Use:

requireOrgMembership(allowedRoles?)

Call:

GET
${ORGANIZATION_SERVICE_URL}/organizations/${organizationId}

Forward Authorization header.

Expected:

200
→ parse yourRole

401
→ 401

404
→ 404

unexpected/network error
→ 502

Role model:

VIEWER
- read rules
- read alert instances

ENGINEER
- viewer permissions
- create/update/enable/disable rules

ADMIN
- engineer permissions
- delete rules

OWNER
- same as ADMIN

============================================================
7. SERVICE OWNERSHIP VALIDATION
============================================================

When creating/updating a rule that references serviceId:

verify that the service belongs to the organization.

Use:

GET
${CATALOG_SERVICE_URL}/organizations/${organizationId}/services/${serviceId}

Forward Authorization.

Do not query Service Catalog DB directly.

Return:

404 if service not in organization.

============================================================
8. HUMAN-FACING ENDPOINTS
============================================================

Base:

/organizations/:organizationId/alert-rules

------------------------------------------------------------
CREATE RULE
------------------------------------------------------------

POST
/organizations/:organizationId/alert-rules

Roles:

OWNER
ADMIN
ENGINEER

Validate service ownership.

Return 201.

------------------------------------------------------------
LIST RULES
------------------------------------------------------------

GET
/organizations/:organizationId/alert-rules

Any member.

Filters:

serviceId?
enabled?
type?
severity?
page?
limit?

------------------------------------------------------------
GET RULE
------------------------------------------------------------

GET
/organizations/:organizationId/alert-rules/:ruleId

Any member.

Must scope by:

ruleId
AND
organizationId

------------------------------------------------------------
UPDATE RULE
------------------------------------------------------------

PATCH
/organizations/:organizationId/alert-rules/:ruleId

Roles:

OWNER
ADMIN
ENGINEER

Allow updating:

- name
- description
- severity
- threshold config
- duration/window
- enabled

If serviceId is changeable, re-verify ownership.

Alternatively make serviceId immutable after creation.

Preferred for this phase:

serviceId immutable.

Do not let rule type change after creation.

That keeps evaluation semantics stable.

------------------------------------------------------------
ENABLE / DISABLE RULE
------------------------------------------------------------

PATCH
/organizations/:organizationId/alert-rules/:ruleId/enabled

Roles:

OWNER
ADMIN
ENGINEER

Body:

{
  "enabled": true
}

If disabling an active PENDING rule:

it may return to NORMAL.

If disabling a FIRING rule:

do NOT silently mark it resolved just because the rule was administratively
disabled.

Preferred behavior:

leave existing FIRING instance unchanged and stop future evaluation for that rule.

Document this.

------------------------------------------------------------
DELETE RULE
------------------------------------------------------------

DELETE
/organizations/:organizationId/alert-rules/:ruleId

Roles:

OWNER
ADMIN

Return 204.

Preferred behavior:

reject deletion with 409 if there is currently an active FIRING alert instance.

Require user to disable the rule first and resolve operational state normally.

Do not cascade-delete incident references.

------------------------------------------------------------
LIST ALERT INSTANCES
------------------------------------------------------------

GET
/organizations/:organizationId/alerts

Any member.

Filters:

serviceId?
ruleId?
state?
severity?
from?
to?
page?
limit?

Newest first.

------------------------------------------------------------
GET ALERT INSTANCE
------------------------------------------------------------

GET
/organizations/:organizationId/alerts/:alertId

Any member.

Scope by organizationId.

============================================================
9. KAFKA CONSUMPTION
============================================================

Alert Service must consume telemetry directly from Kafka.

Do NOT poll telemetry-worker database.

Why:

alerting should react to the telemetry stream with low latency.

Subscribe to:

sentinel.telemetry.metrics.v1
sentinel.telemetry.logs.v1

For this phase generic events do not need alert evaluation.

Consumer group:

sentinel-alert-evaluator-v1

Environment:

KAFKA_GROUP_ID=sentinel-alert-evaluator-v1

Important:

Alert Service uses a DIFFERENT consumer group from telemetry persistence.

Therefore:

Telemetry Worker gets every telemetry message once for persistence.

Alert Service also gets every telemetry message once for evaluation.

That is correct Kafka fan-out behavior across consumer groups.

============================================================
10. METRIC RULE EVALUATION
============================================================

When metric message arrives:

1. validate envelope

2. find ENABLED METRIC_THRESHOLD rules matching:

organizationId
serviceId
metricName

3. compare value against threshold

Supported comparisons:

GT
GTE
LT
LTE
EQ

4. update alert state.

Example:

Rule:

error_rate > 0.10 for 120 seconds

At 10:00:

value = 0.15

No active instance exists.

Create:

PENDING

pendingSince = 10:00

At 10:01:

value = 0.13

Still violation.

Remain PENDING.

At 10:02:

value = 0.18

Duration >= 120 seconds.

Transition:

PENDING -> FIRING

Set:

firedAt

Then create incident.

============================================================
11. IMPORTANT DURATION SEMANTICS
============================================================

Do NOT interpret "for 2 minutes" as:

"wait exactly 2 minutes in a setTimeout".

Do NOT create long-lived in-memory timers.

State must survive process restarts.

Use timestamps persisted in AlertInstance.

Every matching metric sample reevaluates:

now - pendingSince >= durationSeconds

This makes the system restart-safe.

============================================================
12. CONDITION CLEARS WHILE PENDING
============================================================

Example:

threshold:

> 0.10 for 120 sec

10:00:
0.15
→ PENDING

10:01:
0.05

Condition cleared before firing.

Transition:

PENDING -> NORMAL

Preferred implementation:

mark current pending instance RESOLVED or close it cleanly?

Use the following model:

PENDING -> RESOLVED

with resolvedAt set.

The conceptual external state can be considered recovered.

Do not leave abandoned pending rows.

A future violation creates a NEW AlertInstance.

============================================================
13. CONDITION CLEARS AFTER FIRING
============================================================

Example:

FIRING alert receives a metric that no longer violates rule.

Transition:

FIRING -> RESOLVED

Set:

resolvedAt

If alert created an Incident:

DO NOT automatically mark Incident RESOLVED in this phase.

Reason:

telemetry recovery does not necessarily mean engineers have fully resolved the
incident.

Only alert state resolves automatically.

Document this explicitly.

============================================================
14. DURATION = 0
============================================================

If:

durationSeconds = 0

condition violation should go directly to:

FIRING

No PENDING delay required.

Create incident immediately.

============================================================
15. LOG COUNT RULE EVALUATION
============================================================

LOG_COUNT rules require a sliding time window.

Example:

ERROR logs containing "database"

count > 50

within 60 seconds.

Do NOT use an unbounded in-memory array.

Preferred Phase 8 approach:

Use Redis sorted sets for rolling counters.

Key design:

alert:log-window:{ruleId}

When a matching log arrives:

ZADD timestamp eventId

Then remove entries older than:

now - windowSeconds

using:

ZREMRANGEBYSCORE

Then:

ZCARD

If count >= countThreshold:

condition violated.

If below:

condition clear.

Set key expiry to a little longer than windowSeconds.

This allows horizontal Alert Service replicas to share evaluation state.

============================================================
16. LOG MATCHING
============================================================

For a LOG_COUNT rule:

A log matches when all configured filters match.

Examples:

If only:

logLevel = ERROR

then all ERROR logs match.

If:

logLevel = ERROR
logSearch = database

then require BOTH.

Search can use case-insensitive substring against log.message for this phase.

Do not add Elasticsearch.

============================================================
17. LOG ALERT FIRING
============================================================

For LOG_COUNT:

No additional `durationSeconds` is necessary.

The window itself defines the time condition.

If countThreshold reached in current window:

FIRING.

If condition later falls below threshold:

RESOLVED.

Use the same active AlertInstance semantics.

============================================================
18. CONCURRENCY / DUPLICATE FIRING
============================================================

This is critical.

Multiple Kafka partitions or multiple Alert Service replicas may evaluate the same
rule close together.

Do not allow two incidents to be created for the same active firing.

Use a concurrency-safe mechanism.

Preferred:

PostgreSQL transaction + advisory strategy / unique active constraint where
possible.

Alternative:

Redis distributed lock:

lock:alert-rule:{ruleId}

with short TTL.

Within lock:

1. reload active alert state
2. decide transition
3. persist transition
4. determine whether incident creation is needed

Keep lock scope short.

Document the approach.

============================================================
19. INCIDENT CREATION
============================================================

When alert transitions to FIRING:

Alert Service must create an incident through Incident Service.

Do NOT write Incident DB directly.

Use an internal service-to-service endpoint.

Add minimal Incident Service integration endpoint:

POST
/internal/incidents

Protect with:

x-internal-service-secret

Request:

{
  "organizationId": "...",
  "serviceId": "...",
  "title": "High error rate",
  "description": "...",
  "severity": "SEV1",
  "source": "ALERT",
  "sourceAlertId": "alert-instance-id"
}

Incident Service should:

- verify internal secret
- optionally verify service ownership defensively
- create incident
- source = ALERT
- sourceAlertId = alert instance id
- createdByUserId = null
- create INCIDENT_CREATED timeline event
- return incident

Do not expose this internal endpoint publicly through Gateway.

============================================================
20. INCIDENT CREATION IDEMPOTENCY
============================================================

Critical requirement:

If Alert Service retries incident creation after timeout, Incident Service must
not create duplicate incidents.

Use:

sourceAlertId

as idempotency key.

Recommended Incident Service DB constraint:

unique sourceAlertId where non-null

If an incident already exists for that alert:

return the existing incident instead of creating another.

Then Alert Service stores:

incidentId

on AlertInstance.

============================================================
21. INCIDENT CREATION FAILURE
============================================================

What if alert successfully transitions to FIRING, but Incident Service is
temporarily unavailable?

Do NOT lose the firing state.

Alert remains FIRING.

Incident creation should be retried.

Implement one of:

A. bounded synchronous retries plus persisted `incidentId == null` reconciliation

Preferred:

persist FIRING first.

Then attempt incident creation.

If it fails:

- log
- leave incidentId null
- future evaluation or a reconciliation loop retries creation

Add a small background reconciliation loop:

every 30 seconds

find:

FIRING alerts
WHERE incidentId IS NULL

retry incident creation.

Do not use in-memory-only retry state.

============================================================
22. ALERT STATE TRANSITION CONSISTENCY
============================================================

Alert state changes should be transactional.

For example:

PENDING -> FIRING

must atomically set:

state
firedAt
lastEvaluatedAt
lastObservedValue

Incident creation itself is cross-service and therefore cannot be in the same DB
transaction.

Accept this distributed consistency boundary.

Document:

Alert FIRING is source of truth.

Incident creation is eventually consistent.

============================================================
23. ALERT DOMAIN EVENTS
============================================================

Prepare events for Phase 9 Notification Service.

Publish alert lifecycle events to Kafka.

Create topics:

sentinel.alerts.fired.v1
sentinel.alerts.resolved.v1

Payload example:

{
  "eventId": "uuid",
  "schemaVersion": 1,
  "type": "ALERT_FIRED",
  "organizationId": "...",
  "serviceId": "...",
  "alertId": "...",
  "ruleId": "...",
  "ruleName": "...",
  "severity": "SEV1",
  "incidentId": "... or null",
  "occurredAt": "..."
}

Resolved:

{
  "type": "ALERT_RESOLVED",
  ...
}

============================================================
24. WHEN TO PUBLISH ALERT_FIRED
============================================================

Publish only on state transition into FIRING.

Do not publish on every violating metric.

This prevents notification storms.

Similarly:

ALERT_RESOLVED

only once when leaving FIRING.

============================================================
25. ALERT EVENT DELIVERY SAFETY
============================================================

Unlike telemetry ingestion, avoid losing alert lifecycle events after DB commit.

Preferred pattern:

Transactional Outbox.

Create:

AlertOutboxEvent

Fields:

- id
- eventId unique
- type
- payload Json
- createdAt
- publishedAt optional
- attempts default 0

When alert changes to FIRING/RESOLVED:

inside SAME DB transaction:

1. change alert state
2. create outbox row

Background publisher:

- reads unpublished rows
- publishes to Kafka
- marks publishedAt

This is the preferred implementation.

Do NOT use:

DB commit
then blindly `producer.send()`

as the only mechanism, because process crash between those steps loses the event.

============================================================
26. OUTBOX PUBLISHER
============================================================

Implement background outbox worker inside Alert Service.

Example interval:

1 second

or continuous loop.

Process batches.

On Kafka success:

mark publishedAt.

On failure:

increment attempts
leave unpublished
retry later.

Use eventId so downstream consumers can be idempotent.

============================================================
27. ALERT EVALUATION IDEMPOTENCY
============================================================

Telemetry Kafka is at-least-once.

Same telemetry event may be evaluated twice.

Metric evaluation should not cause duplicate transition effects.

Track last relevant event processing where needed.

Recommended:

AlertProcessedTelemetry

Fields:

- eventId unique
- processedAt

Or use equivalent idempotency tracking.

Before evaluation:

if eventId processed
→ skip safely.

After successful handling:
→ record eventId.

Do this transactionally enough to prevent duplicate side effects.

For high-scale production this may be optimized later.

For this project, correctness is more important.

============================================================
28. KAFKA CONSUMER FAILURE SEMANTICS
============================================================

A telemetry message is successfully handled when:

- validation succeeds
- matching rule evaluation completes
- alert state transitions are committed
- processed-event idempotency marker is committed

If transient DB failure:

retry / do not commit prematurely.

If malformed telemetry envelope:

send to an Alert Service-specific DLQ.

Create:

sentinel.alert-evaluator.dlq.v1

Payload includes:

sourceTopic
partition
offset
error
original envelope/raw value

Do not reuse Telemetry Worker DLQ because this is a separate consumer concern.

============================================================
29. REDIS
============================================================

Use Redis for:

- LOG_COUNT rolling windows
- optional distributed rule locks

Environment:

REDIS_URL=redis://redis:6379

Important:

Unlike Phase 5 realtime best-effort semantics, if Redis is required to correctly
evaluate a LOG_COUNT rule and Redis is unavailable:

do NOT pretend the rule was evaluated successfully.

Preferred:

log evaluation dependency failure
do not transition state
allow Kafka record to retry / fail appropriately

Metric threshold rules should not depend on Redis unless locking strategy uses it.

============================================================
30. HUMAN ALERT API RESPONSE SAFETY
============================================================

Every query must include organizationId.

Bad:

findUnique({ where: { id: alertId } })

Good:

findFirst({
  where: {
    id: alertId,
    organizationId
  }
})

Never expose alerts/rules from another tenant.

============================================================
31. API GATEWAY
============================================================

Add:

ALERT_SERVICE_URL

Proxy public human routes:

/api/alerts/*

to:

alert-service:4008

Strip:

/api/alerts

Example:

External:

POST
/api/alerts/organizations/ORG_ID/alert-rules

Internal:

POST
/organizations/ORG_ID/alert-rules

Do NOT expose:

/internal/*

through public Gateway.

============================================================
32. HEALTH / READINESS
============================================================

Add:

GET /health

{
  "status": "ok",
  "service": "alert-service"
}

Add:

GET /ready

Check:

- PostgreSQL
- Kafka
- Redis

Return 503 if required dependency unavailable.

============================================================
33. GRACEFUL SHUTDOWN
============================================================

Handle:

SIGINT
SIGTERM

Shutdown:

1. stop HTTP server
2. stop Kafka consumer
3. stop outbox loop
4. disconnect producer
5. disconnect Redis
6. disconnect Prisma

============================================================
34. LOGGING
============================================================

Log:

- telemetry eventId
- ruleId
- alertId
- state transitions
- rule evaluation result
- incident creation attempts
- outbox publish attempts
- Redis errors
- Kafka errors

Do not log:

- JWT
- internal secret
- API keys
- entire sensitive telemetry payload by default

============================================================
35. TESTING REQUIREMENTS
============================================================

Add meaningful automated tests.

At minimum:

1. unauthenticated human rule request → 401

2. non-member → 404

3. VIEWER cannot create rule → 403

4. ENGINEER can create rule

5. rule cannot reference service from another organization

6. metric below threshold → no active firing

7. first violating metric → PENDING

8. continued violation for required duration → FIRING

9. condition clears during PENDING → closes pending instance

10. durationSeconds=0 → direct FIRING

11. FIRING metric alert creates incident

12. repeated violating metrics do NOT create duplicate incident

13. Incident Service timeout + retry does not duplicate incident

14. FIRING alert with no incidentId gets reconciled later

15. recovery after FIRING → RESOLVED

16. alert recovery does NOT automatically resolve incident

17. ALERT_FIRED emitted exactly once per firing transition

18. ALERT_RESOLVED emitted exactly once

19. outbox row created transactionally with transition

20. Kafka outbox failure keeps event unpublished for retry

21. duplicate telemetry eventId does not repeat evaluation side effects

22. LOG_COUNT under threshold → no firing

23. LOG_COUNT reaches threshold → FIRING

24. expired Redis window entries stop counting

25. Redis unavailable during LOG_COUNT evaluation does not falsely mark success

26. concurrent evaluations create only one active alert instance

27. tenant A cannot query tenant B alert instance

28. malformed telemetry goes to alert-evaluator DLQ

============================================================
36. DOCKER SETUP
============================================================

Add:

alert-service

Port:

4008

Database:

sentinel_alert

Create PostgreSQL init script:

infrastructure/postgres-init/<next-number>-create-alert-db.sh

Environment:

PORT=4008

DATABASE_URL=postgresql://...

JWT_ACCESS_SECRET=...

ORGANIZATION_SERVICE_URL=http://organization-service:4002

CATALOG_SERVICE_URL=http://service-catalog-service:4003

INCIDENT_SERVICE_URL=http://incident-service:4004

INTERNAL_SERVICE_SECRET=...

KAFKA_BROKERS=kafka:9092

KAFKA_CLIENT_ID=sentinel-alert-service

KAFKA_GROUP_ID=sentinel-alert-evaluator-v1

REDIS_URL=redis://redis:6379

OUTBOX_POLL_INTERVAL_MS=1000

INCIDENT_RECONCILE_INTERVAL_MS=30000

NODE_ENV=development

Depends on:

postgres
redis
kafka

But implement actual runtime retry/reconnect behavior.

============================================================
37. UPDATE KAFKA TOPICS
============================================================

Add:

sentinel.alerts.fired.v1

sentinel.alerts.resolved.v1

sentinel.alert-evaluator.dlq.v1

Recommended local config:

3 partitions alert lifecycle topics
1–3 partitions DLQ
replication factor 1 locally

============================================================
38. INCIDENT SERVICE MINIMAL MODIFICATION
============================================================

Add:

POST /internal/incidents

Protected by:

x-internal-service-secret

Add sourceAlertId idempotency support.

If Incident model already has:

sourceAlertId

make it unique where appropriate.

If request arrives twice for same sourceAlertId:

return existing incident.

Do not create duplicate timeline entries or incidents.

Clearly mark all Incident Service changes as:

MODIFY EXISTING FILE

Do not rebuild Incident Service.

============================================================
39. MANUAL END-TO-END DEMO — METRIC ALERT
============================================================

README must demonstrate:

1. create organization

2. register payment-service

3. create service API key

4. create alert rule:

error rate > 10% for 30 seconds

5. send metric:

0.15

6. query alert instances

Expected:

PENDING

7. continue sending violating values long enough

8. query alert

Expected:

FIRING

9. confirm Incident Service automatically contains a new incident

10. verify:

source = ALERT
sourceAlertId = alert ID

11. continue sending violating metrics

Confirm:

no duplicate incident

12. send recovery metric:

0.02

13. query alert

Expected:

RESOLVED

14. verify incident still exists and is NOT automatically marked RESOLVED

============================================================
40. MANUAL END-TO-END DEMO — LOG COUNT
============================================================

Create:

ERROR logs >= 5 within 30 seconds

Send:

4 matching logs

Expected:

not FIRING

Send 5th matching log inside window.

Expected:

FIRING

Wait until enough logs expire from window / send additional evaluation input.

Expected:

condition can resolve after count drops below threshold.

Document exact test procedure.

============================================================
41. ARCHITECTURAL RULES
============================================================

Do NOT violate these:

1. Alert Service owns alert rules and alert instances.

2. Alert Service consumes telemetry directly from Kafka.

3. Telemetry Worker still independently persists telemetry.

4. Different consumer groups mean both services receive the stream.

5. Alert Service never queries Telemetry Worker DB.

6. Incident creation happens through Incident Service REST.

7. One active alert instance per rule.

8. One incident maximum per firing alert instance.

9. sourceAlertId provides incident idempotency.

10. Duration state must survive restart.

11. No long-lived in-memory alert timers.

12. LOG_COUNT uses bounded shared window state.

13. Tenant membership is verified through Organization Service.

14. Service ownership is verified through Service Catalog.

15. Alert lifecycle Kafka events use transactional outbox.

16. Notification logic is NOT implemented here.

17. Alert recovery does not automatically resolve engineer incidents.

18. No AI/RAG.

19. API Gateway contains no business logic.

============================================================
42. PREPARE FOR PHASE 9
============================================================

Phase 9 is Notification Service.

It will consume:

sentinel.alerts.fired.v1

and possibly:

sentinel.incidents.* lifecycle events later.

Therefore Alert Service lifecycle event payloads must be:

- stable
- versioned
- tenant-scoped
- idempotent via eventId

Notification Service should not need to query Alert Service database merely to know
basic alert context.

Include enough context in the event:

organizationId
serviceId
alertId
ruleId
ruleName
severity
incidentId
occurredAt

============================================================
43. DELIVERABLE
============================================================

Give me:

1. full alert-service folder structure

2. every new file with complete code

3. Prisma schema

4. alert rule Zod schemas

5. repositories

6. evaluation service

7. metric comparator logic

8. LOG_COUNT Redis-window implementation

9. active-alert concurrency protection

10. Kafka telemetry consumer

11. processed-event idempotency

12. Alert Service DLQ handling

13. transactional outbox implementation

14. Kafka alert-event publisher

15. incident-service client

16. incident reconciliation worker

17. organization membership middleware

18. service ownership validation client

19. human REST endpoints

20. health/readiness endpoints

21. tests

22. Dockerfile

23. .env.example

24. PostgreSQL init script

25. Kafka topic-init changes

26. exact docker-compose modifications

27. exact API Gateway modifications

28. exact Incident Service modifications

29. README metric-alert demo

30. README log-count demo

31. concurrency/idempotency explanation

Clearly mark all output as:

NEW FILE

or

MODIFY EXISTING FILE

Do not rewrite unrelated Phase 1–7 services.

If the existing repository differs slightly from these assumptions, adapt minimally
and preserve the established architecture.

Ask clarifying questions only if something is genuinely impossible to infer.
Otherwise make a reasonable engineering assumption, state it, and continue.

```