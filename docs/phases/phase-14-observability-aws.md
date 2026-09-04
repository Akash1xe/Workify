## PHASE 14 PROMPT — Observability + AWS Deployment

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect backend services to it. Those services stream
logs, metrics, and events into SentinelAI. The platform detects failures,
automatically creates incidents, supports real-time collaboration, stores
runbooks/postmortems, correlates GitHub deployments, and uses an AI/RAG
investigator to propose probable root causes with citations.

The entire application architecture is now built.

This final phase makes SentinelAI observable itself and deployable in AWS.

============================================================
WHAT ALREADY EXISTS — PHASES 1–13
============================================================

1. api-gateway — port 4000

2. auth-service — port 4001
   - authentication
   - JWT/session security

3. organization-service — port 4002
   - organizations
   - members
   - roles
   - tenant isolation

4. service-catalog-service — port 4003
   - backend service registration
   - API keys
   - service health

5. incident-service — port 4004
   - incident lifecycle
   - timeline
   - comments
   - assignment
   - severity

6. realtime-service — port 4005
   - Socket.IO
   - Redis Pub/Sub

7. ingestion-service — port 4006
   - telemetry ingestion
   - Kafka producer

8. telemetry-worker — port 4007
   - Kafka consumer groups
   - telemetry persistence
   - query APIs
   - retries/DLQ

9. alert-service — port 4008
   - alert rules
   - alert evaluation
   - automatic incident creation
   - transactional outbox

10. notification-service — port 4009
   - in-app notifications
   - email delivery
   - queue/retries

11. document-service — port 4010
   - document metadata
   - presigned S3 uploads/downloads

12. rag-ingestion-service — port 4011
   - Python
   - document parsing
   - embeddings
   - pgvector
   - semantic search

13. ai-investigator-service — port 4012
   - Python
   - agent/tool calling
   - evidence/citations
   - root-cause investigation
   - postmortem drafts

14. github-integration-service — port 4013
   - GitHub App
   - webhook ingestion
   - repository-service mapping
   - deployment correlation

Supporting local infrastructure already includes:

- PostgreSQL
- Redis
- Kafka
- MinIO
- Docker Compose

============================================================
YOUR TASK — PHASE 14: OBSERVABILITY + AWS DEPLOYMENT
============================================================

This phase has TWO major goals:

A. Make SentinelAI observable itself.

B. Make the complete system deployable to AWS.

Do not change core product behavior unless required for production readiness.

============================================================
PART A — SENTINELAI OBSERVABILITY
============================================================

============================================================
1. OBSERVABILITY GOALS
============================================================

Add:

- distributed tracing
- service metrics
- structured logs
- correlation IDs
- dashboards
- health/readiness visibility

The key requirement is:

when a request passes through several services, I should be able to trace it.

Example:

Client
-> API Gateway
-> Incident Service
-> Organization Service
-> Service Catalog

should appear as one distributed trace.

Similarly:

Ingestion Service
-> Kafka
-> Telemetry Worker
-> Alert Service
-> Incident Service

should be traceable across async boundaries where practical.

============================================================
2. OPENTELEMETRY
============================================================

Use OpenTelemetry across Node and Python services.

Node services:

- @opentelemetry/sdk-node
- HTTP instrumentation
- Express instrumentation
- appropriate PostgreSQL/Prisma instrumentation where practical
- Redis instrumentation where practical
- Kafka instrumentation/manual spans where necessary

Python services:

- opentelemetry-sdk
- FastAPI instrumentation
- HTTPX/requests instrumentation
- SQLAlchemy instrumentation
- Kafka instrumentation/manual spans

Export using:

OTLP

Environment:

OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_SERVICE_NAME
OTEL_RESOURCE_ATTRIBUTES

Do not hard-code exporter destinations.

============================================================
3. TRACE CONTEXT PROPAGATION
============================================================

Use W3C trace context.

Preserve:

traceparent
tracestate

across synchronous HTTP calls.

Continue preserving:

x-request-id

Request ID and trace ID are different concepts.

Do not replace one with the other.

Structured logs should preferably include both.

============================================================
4. KAFKA TRACE PROPAGATION
============================================================

For Kafka messages:

inject OpenTelemetry trace context into Kafka headers.

Consumers extract it and continue trace where appropriate.

Do not put tracing data inside domain payload unless necessary.

Prefer Kafka headers.

Example headers:

traceparent
tracestate

This lets:

Ingestion
-> Kafka
-> Telemetry Worker

appear as connected trace context.

============================================================
5. STRUCTURED LOGGING
============================================================

All services should use JSON structured logging.

Recommended Node:

pino

Python:

structlog
or JSON-configured standard logging

Each log should contain where available:

timestamp
level
service
message
requestId
traceId
spanId
organizationId
userId
incidentId
serviceId
eventId

Do NOT log secrets.

Never log:

passwords
JWTs
API keys
refresh tokens
GitHub installation tokens
AWS credentials
internal service secrets
presigned URLs

============================================================
6. PROMETHEUS METRICS
============================================================

Expose:

GET /metrics

on each service.

Use Prometheus-compatible metrics.

Node:

prom-client

Python:

prometheus-client

At minimum each HTTP service should expose:

http_requests_total

http_request_duration_seconds

http_requests_in_flight

process metrics

============================================================
7. DOMAIN METRICS
============================================================

Add useful per-service metrics.

API Gateway:

gateway_requests_total
gateway_rate_limit_rejections_total
gateway_proxy_errors_total

Auth:

auth_login_total
auth_login_failures_total
auth_refresh_total
auth_refresh_reuse_detected_total

Organization:

organizations_created_total
organization_membership_checks_total
organization_membership_denied_total

Service Catalog:

services_registered_total
service_api_keys_created_total
service_heartbeats_total
service_stale_total

Incident:

incidents_created_total
incidents_resolved_total
incident_status_transitions_total
incident_comments_total

Realtime:

websocket_connections
incident_room_joins_total
realtime_publish_failures_total

Ingestion:

telemetry_records_received_total
telemetry_records_published_total
telemetry_publish_failures_total
telemetry_batch_size

Telemetry Worker:

telemetry_records_persisted_total
telemetry_duplicates_total
telemetry_processing_retries_total
telemetry_dlq_total
kafka_consumer_lag where practical

Alert:

alert_rule_evaluations_total
alerts_fired_total
alerts_resolved_total
incident_creation_failures_total
alert_outbox_pending

Notification:

notifications_created_total
notification_email_sent_total
notification_email_failed_total
notification_queue_depth where practical

Document:

documents_uploaded_total
documents_ready_total
documents_failed_total
document_outbox_pending

RAG ingestion:

documents_indexed_total
document_chunks_created_total
embedding_requests_total
embedding_failures_total
rag_ingestion_duration_seconds

AI Investigator:

investigations_started_total
investigations_completed_total
investigations_failed_total
ai_tool_calls_total
ai_tool_failures_total
investigation_duration_seconds
llm_request_duration_seconds

GitHub Integration:

github_webhooks_total
github_webhook_failures_total
deployments_recorded_total
github_api_requests_total

Use low-cardinality labels.

Do NOT use:

userId
incidentId
requestId

as Prometheus labels.

============================================================
8. PROMETHEUS + GRAFANA LOCAL SETUP
============================================================

Extend Docker Compose with:

Prometheus
Grafana

Prometheus:

scrape all service /metrics endpoints.

Grafana:

preconfigure Prometheus datasource.

Create dashboards.

============================================================
9. REQUIRED GRAFANA DASHBOARDS
============================================================

Create at least:

Dashboard 1 — Platform Overview

- request rate per service
- HTTP error rate
- p95 latency
- service up/down
- CPU/memory if available

Dashboard 2 — Telemetry Pipeline

- ingestion records/sec
- Kafka throughput where available
- persistence rate
- retries
- DLQ count
- consumer lag

Dashboard 3 — Incident / Alert

- alerts fired
- alerts resolved
- incidents created
- incidents resolved
- alert-to-incident failures

Dashboard 4 — AI/RAG

- RAG indexing throughput
- embedding failures
- investigation count
- investigation duration
- LLM failures
- tool call failures

Dashboard 5 — Notifications

- notifications generated
- email success/failure
- queue backlog

Store dashboard JSON/provisioning in repository.

============================================================
10. ALERTING FOR SENTINELAI ITSELF
============================================================

Add example Prometheus alert rules.

Examples:

High API 5xx rate

Service unavailable

Telemetry worker DLQ increasing

Kafka consumer lag too high

Alert outbox backlog

Notification queue backlog

AI investigation failure rate high

Do not create an enormous production alert catalog.

Provide a reasonable starter set.

============================================================
11. LOCAL TRACE BACKEND
============================================================

Add a trace backend for local development.

Preferred:

Grafana Tempo

or Jaeger.

If using Grafana stack:

Tempo is preferred.

Flow:

services
-> OpenTelemetry Collector
-> Tempo

Grafana queries Tempo.

============================================================
12. OPENTELEMETRY COLLECTOR
============================================================

Add OpenTelemetry Collector.

Services send OTLP to Collector.

Collector routes:

traces -> Tempo

optionally metrics -> Prometheus-compatible route

Keep architecture simple.

============================================================
13. CORRELATION DEMO
============================================================

README must demonstrate tracing one real workflow.

Example:

create incident through API Gateway.

Show:

api-gateway span
-> incident-service span
-> organization-service span
-> service-catalog-service span

Then demonstrate telemetry async path:

ingestion-service
-> Kafka producer span
-> telemetry-worker consumer span

Explain where async trace continuity works and where only event/request correlation
is possible.

============================================================
PART B — PRODUCTION CONTAINER HARDENING
============================================================

============================================================
14. DOCKERFILES
============================================================

Replace dev-oriented Dockerfiles with production-ready multi-stage Dockerfiles.

Node:

stage 1:
install dependencies

stage 2:
build TypeScript

stage 3:
production runtime

Use:

node:20-alpine or another appropriate pinned runtime.

Do not ship dev dependencies unless necessary.

Run as non-root user.

Python:

multi-stage where practical.

Install only runtime dependencies.

Run as non-root.

============================================================
15. CONTAINER SECURITY
============================================================

Apply:

- non-root runtime
- read-only filesystem where practical
- no secrets baked into image
- minimal base image
- explicit healthcheck where useful
- pinned major/minor base versions

Do not expose unnecessary ports.

============================================================
16. CONFIGURATION
============================================================

Every service must read configuration from environment.

No production hostname should be hard-coded.

Centralize environment validation.

Fail fast if required production secrets are missing.

============================================================
PART C — AWS TARGET ARCHITECTURE
============================================================

============================================================
17. AWS DESIGN
============================================================

Deploy to AWS using:

- ECS Fargate for application services
- ECR for Docker images
- Application Load Balancer
- RDS PostgreSQL
- ElastiCache Redis
- S3
- Secrets Manager
- CloudWatch
- VPC

For Kafka choose one and document trade-off:

A. Amazon MSK

or

B. MSK Serverless if appropriate

Preferred for architecture demonstration:

MSK Serverless if cost/complexity assumptions fit,
otherwise provisioned MSK.

Do not run a self-managed Kafka container in ECS production.

============================================================
18. DATABASE STRATEGY
============================================================

The logical architecture says one database per service.

For this project, use one RDS PostgreSQL cluster/instance with multiple logical
databases:

sentinel_auth
sentinel_org
sentinel_catalog
sentinel_incident
sentinel_telemetry
sentinel_alert
sentinel_notification
sentinel_document
sentinel_rag
sentinel_ai
sentinel_github

This preserves data ownership without requiring 11 RDS instances.

Clearly document:

logical isolation != physical isolation.

Services must still use only their own database credentials/database.

Preferred stronger setup:

one DB user per service.

============================================================
19. PGVECTOR ON RDS
============================================================

Ensure selected RDS PostgreSQL version supports pgvector.

Enable vector extension in sentinel_rag.

Do not assume local pgvector Docker image behavior applies identically to RDS.

Provide migration/init strategy.

============================================================
20. REDIS
============================================================

Use ElastiCache Redis for:

- rate limiting
- realtime Pub/Sub / Socket.IO adapter
- BullMQ/local-equivalent queue only if retaining Redis-backed queues in AWS
- short-lived locks/cache

If Notification Service production target should use SQS rather than BullMQ:

switch queue adapter to SQS in AWS.

Preferred:

local:
BullMQ + Redis

AWS:
SQS

This validates the abstraction built in Phase 9.

============================================================
21. SQS
============================================================

Create SQS queue:

sentinel-notification-email

Add DLQ:

sentinel-notification-email-dlq

Configure:

redrive policy

visibility timeout

retention

Notification Service should use:

QUEUE_PROVIDER=sqs

in AWS.

Email worker consumes SQS.

============================================================
22. EMAIL
============================================================

Use Amazon SES for production email.

Local:

ConsoleEmailProvider

AWS:

SES provider

Do not hard-code sender.

Environment/config:

SES_FROM_EMAIL

Document SES sandbox considerations.

============================================================
23. S3
============================================================

Create private bucket for documents.

Requirements:

- public access blocked
- server-side encryption
- lifecycle policy if appropriate
- versioning optional but useful

Use IAM roles rather than access keys in ECS.

Document Service and RAG ingestion receive scoped bucket permissions.

============================================================
24. GITHUB PRIVATE KEY
============================================================

Store GitHub App private key in Secrets Manager.

Do not place it directly in Terraform state as plaintext if avoidable.

Prefer secret reference/injection.

============================================================
25. SECRETS MANAGER
============================================================

Store sensitive values such as:

JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
INTERNAL_SERVICE_SECRET
GitHub private key
GitHub webhook secret
LLM API key
DB credentials
other provider credentials

ECS task definitions should reference secrets.

Do not put actual secret values in:

terraform.tfvars committed to repository

Dockerfiles

source code

============================================================
26. IAM
============================================================

Use task roles.

Examples:

Document Service:
- S3 PutObject/GetObject/DeleteObject as needed

RAG ingestion:
- S3 GetObject
- LLM/Secrets access where needed

Notification:
- SQS receive/send
- SES send

GitHub Integration:
- Secrets Manager access

Do not give every ECS task AdministratorAccess.

Apply least privilege.

============================================================
27. VPC
============================================================

Create:

VPC

at least 2 AZs

public subnets:
- ALB

private subnets:
- ECS tasks
- RDS
- Redis
- MSK

Use security groups.

Do not expose RDS/Redis/MSK publicly.

============================================================
28. NAT COST NOTE
============================================================

Private ECS tasks may need internet access for:

GitHub API
LLM provider
SES APIs depending endpoint strategy
package/service integrations

Use NAT Gateway for production architecture.

But document cost.

For a practice/non-production deployment, provide a lower-cost alternative where
reasonable.

Do not pretend NAT Gateway is free.

============================================================
29. LOAD BALANCER
============================================================

Use Application Load Balancer.

Public routes:

/api/auth/*
/api/organizations/*
/api/catalog/*
/api/incidents/*
/api/ingest/*
/api/telemetry/*
/api/alerts/*
/api/notifications/*
/api/documents/*
/api/ai/*
/api/github/*

can continue hitting API Gateway service.

Preferred production design:

ALB
-> api-gateway ECS service

Do not expose every internal microservice publicly.

============================================================
30. REALTIME ROUTING
============================================================

Realtime Service must support WebSocket connections.

Configure ALB route such as:

/socket.io/*

-> realtime-service target group

or dedicated hostname:

ws.sentinel.example.com

Preferred:

dedicated listener rule/target group.

Ensure:

sticky sessions are NOT relied upon for correctness because Socket.IO Redis adapter
handles multi-instance broadcast.

If transport requirements need stickiness for long-polling fallback, configure and
document appropriately.

============================================================
31. GITHUB WEBHOOK ROUTING
============================================================

Expose:

/webhooks/github

to github-integration-service.

This endpoint is public but protected by GitHub HMAC signature.

Do not route it through human JWT middleware.

============================================================
32. INTERNAL SERVICE DISCOVERY
============================================================

Services need stable internal addresses.

Use:

AWS Cloud Map
or ECS Service Connect.

Preferred:

ECS Service Connect

so internal services can address:

organization-service
incident-service
telemetry-worker
etc.

Do not use public ALB for every internal service-to-service call.

============================================================
33. ECS SERVICE SET
============================================================

Create ECS services/tasks for:

api-gateway

auth-service

organization-service

service-catalog-service

incident-service

realtime-service

ingestion-service

telemetry-worker

alert-service

notification-service

document-service

rag-ingestion-service

ai-investigator-service

github-integration-service

Some worker-heavy services may not need public load balancer targets.

Examples:

telemetry-worker

only needs internal health/query API.

============================================================
34. ECS AUTOSCALING
============================================================

Configure reasonable autoscaling targets.

API services:

CPU
memory
request count where practical

Ingestion Service:

CPU/request count

Telemetry Worker:

Kafka lag is ideal but harder.

At minimum CPU initially; document lag-based scaling as preferred production
enhancement.

Realtime:

connection count may matter.

AI:

CPU/memory/queue depth.

Do not create meaningless autoscaling for every service.

============================================================
35. MINIMUM INSTANCE COUNTS
============================================================

For practice/dev AWS deployment:

allow desired_count=1.

For production architecture:

critical stateless services should support 2+ replicas across AZs.

Document difference.

============================================================
36. STATELESSNESS
============================================================

Application containers must remain stateless.

Do not store durable:

documents
sessions
queue state
incident state
embeddings

inside ECS container filesystem.

Use:

RDS
Redis
S3
Kafka/MSK
SQS

============================================================
37. TERRAFORM
============================================================

Use Terraform.

Suggested:

infrastructure/
  terraform/
    environments/
      dev/
      prod/

    modules/
      vpc/
      ecr/
      ecs-cluster/
      ecs-service/
      alb/
      rds/
      redis/
      kafka/
      s3/
      sqs/
      iam/
      secrets/
      observability/

Avoid one 3000-line main.tf.

Use reusable modules.

============================================================
38. TERRAFORM STATE
============================================================

Configure remote state.

Recommended:

S3 backend
+
DynamoDB locking if using classic locking setup

or current supported Terraform/AWS state locking mechanism.

Do not commit local state files.

Add:

*.tfstate
*.tfstate.*
.terraform/

to .gitignore.

============================================================
39. TERRAFORM VARIABLES
============================================================

Expose variables such as:

aws_region
environment
vpc_cidr
desired_count
db_instance_class
redis_node_type
domain_name
certificate_arn
enable_nat_gateway
enable_msk
llm_provider

Do not embed production IDs directly.

============================================================
40. TERRAFORM OUTPUTS
============================================================

Output useful values:

ALB DNS
S3 bucket
RDS endpoint
Redis endpoint
MSK bootstrap brokers
ECS cluster name

Do not output secret values.

============================================================
41. DATABASE MIGRATIONS IN AWS
============================================================

Do NOT run `prisma db push` as normal production behavior.

Move to migrations.

Node services:

Prisma migrations

Python:

Alembic

Provide migration workflow.

Preferred:

one-off ECS task or CI/CD migration job.

Do not let every service replica race migrations at startup.

============================================================
42. CI/CD
============================================================

Add GitHub Actions pipeline.

Suggested flow:

on PR:

- lint
- unit tests
- build
- security/basic dependency scan

on main:

- run tests
- build Docker images
- push to ECR
- apply or plan Terraform depending environment
- run migrations
- deploy ECS task definitions/services

Do not put AWS access keys directly in GitHub secrets if OIDC can be used.

Preferred:

GitHub Actions OIDC
-> AWS IAM role

============================================================
43. IMAGE TAGGING
============================================================

Tag images with:

commit SHA

Optionally also:

latest

Do not deploy production solely by mutable latest tag.

ECS task definition should reference immutable commit tag/digest.

============================================================
44. DEPLOYMENT SAFETY
============================================================

Use ECS rolling deployment.

Configure:

deploymentMinimumHealthyPercent
deploymentMaximumPercent

Enable deployment circuit breaker where appropriate.

Do not implement complex blue/green unless desired.

============================================================
45. HTTPS
============================================================

Use ACM certificate.

ALB:

HTTP 80
-> redirect HTTPS

HTTPS 443
-> API Gateway/realtime/webhook rules

Do not terminate TLS inside every service container.

============================================================
46. CORS
============================================================

Production CORS origins should come from environment.

Do not use:

*

with credentials.

Set actual frontend domain.

============================================================
47. RATE LIMITING
============================================================

Redis-based gateway rate limiting should use ElastiCache in AWS.

Fail-open behavior remains for generic limiter if that is current architecture.

Telemetry-specific service limit behavior remains as designed.

============================================================
48. BACKUPS
============================================================

RDS:

- automated backups
- retention configurable
- deletion protection in prod
- multi-AZ optional/dev vs recommended/prod

S3:

- lifecycle/versioning if chosen

Do not claim backups exist unless Terraform enables them.

============================================================
49. RDS HIGH AVAILABILITY
============================================================

Dev:

single-AZ acceptable

Prod:

Multi-AZ recommended

Use environment variable/Terraform variable to control.

============================================================
50. REDIS HIGH AVAILABILITY
============================================================

Dev:

minimal ElastiCache setup

Prod:

replication group with failover recommended

Document behavior implications for:

Pub/Sub
rate limiting
locks

============================================================
51. KAFKA PRODUCTION SEMANTICS
============================================================

Use multiple partitions and replication.

Do not use:

replication factor 1

in production.

Document:

local:
RF=1

AWS/MSK:
multi-AZ replicated brokers/serverless-managed architecture

============================================================
52. DLQ VISIBILITY
============================================================

Document where all DLQs are monitored:

telemetry DLQ
alert evaluator DLQ
notification consumer DLQ
document ingestion DLQ
SQS email DLQ

Expose DLQ counts in metrics/dashboards where practical.

============================================================
53. CLOUDWATCH
============================================================

Send ECS stdout/stderr logs to CloudWatch Logs.

Use structured JSON logs.

Set retention.

Do not retain everything forever by default.

Configurable:

30 days dev
90+ days prod, depending requirements

============================================================
54. PRODUCTION OBSERVABILITY CHOICE
============================================================

For AWS deployment, choose a coherent strategy.

Option A:

Self-host Prometheus/Grafana/Tempo in ECS

Option B:

Amazon Managed Prometheus
Amazon Managed Grafana
AWS X-Ray / ADOT

Preferred AWS-native production direction:

ADOT/OpenTelemetry
+
Amazon Managed Prometheus
+
Amazon Managed Grafana

Tracing:

AWS X-Ray or managed-compatible trace backend

But local environment can remain:

Prometheus
Grafana
Tempo
OTel Collector

Clearly separate local vs AWS observability.

============================================================
55. COST-AWARE DEV ENVIRONMENT
============================================================

This project is for engineering practice, so provide a lower-cost AWS dev profile.

Examples:

- ECS desired_count=1
- small RDS instance
- single-AZ
- minimal Redis
- short log retention
- optional MSK disabled if too expensive

IMPORTANT:

MSK/NAT/RDS/ElastiCache can be expensive.

Provide a `dev` Terraform environment where costly resources can be optional.

If Kafka cost is too high for practice:

document an alternative managed broker strategy separately,
but do not silently change production architecture.

============================================================
56. DO NOT CLAIM AWS IS FREE
============================================================

README must contain an explicit cost warning.

Especially:

- NAT Gateway
- MSK
- RDS
- ElastiCache
- Managed Grafana
- ALB

can generate charges even at low traffic.

Provide:

terraform destroy

instructions for practice environments.

============================================================
57. LOCAL DEVELOPMENT MUST KEEP WORKING
============================================================

Do not destroy Docker Compose development.

Final project should support:

Local:

docker compose up --build

with:

Postgres
Redis
Kafka
MinIO
Prometheus
Grafana
Tempo
OTel Collector
all services

AWS:

Terraform + ECS/RDS/etc.

These are separate deployment profiles.

============================================================
58. ENVIRONMENT FILES
============================================================

Each service retains:

.env.example

Add root-level deployment docs showing how local and AWS config differ.

Never commit real:

.env

AWS credentials

private keys

LLM keys

============================================================
59. OBSERVABILITY MIDDLEWARE CONSISTENCY
============================================================

Avoid manually duplicating 14 versions of metrics/tracing boilerplate if a shared
package already exists.

If monorepo has common packages, create:

packages/observability-node

and optionally:

shared Python observability module

But do NOT perform a huge monorepo refactor merely for abstraction.

Adapt to current repository.

============================================================
60. SLO STARTER DEFINITIONS
============================================================

Document example SLOs.

API availability:

99.9%

Telemetry ingestion availability:

99.9%

Telemetry ingestion latency:

p95 < 500 ms excluding client network

Incident API:

p95 < 300 ms

Do not claim these are already achieved.

They are target SLOs.

============================================================
61. RUNBOOK FOR SENTINELAI ITSELF
============================================================

Create an operations runbook.

Include:

- API Gateway 5xx spike
- Kafka consumer lag increasing
- RDS connection exhaustion
- Redis unavailable
- document indexing backlog
- AI provider outage
- GitHub webhook failures

This is both useful operational documentation and a nice demonstration that
SentinelAI can eventually ingest its own runbook.

============================================================
62. END-TO-END PRODUCTION SMOKE TEST
============================================================

Provide script:

scripts/smoke-test.sh

or TypeScript/Python equivalent.

Test:

1. health endpoints

2. register/login

3. create organization

4. register service

5. send heartbeat

6. ingest telemetry

7. verify telemetry persistence

8. create alert rule

9. trigger alert

10. verify incident auto-created

11. verify notification created

12. upload/index runbook if practical

13. start AI investigation

14. verify completed investigation

Do not require manual browser interaction for core smoke test.

============================================================
63. LOAD TEST
============================================================

Add a lightweight load-test setup.

Preferred:

k6

Test:

- API Gateway
- telemetry ingestion

Example telemetry scenario:

100 virtual clients
sending batched metrics/logs

Measure:

request rate
p95 latency
error rate

Do not attempt unrealistic claims.

============================================================
64. FAILURE TESTS
============================================================

Document chaos/failure scenarios.

At minimum:

Redis down:
- REST core still works where designed
- realtime unavailable
- rate limiting may fail open

Kafka down:
- telemetry ingestion returns 503
- existing incident APIs still work

AI service down:
- incident workflow still works

Notification queue down:
- notifications persist and reconcile later

RAG service down:
- investigation continues with data gap where possible

This demonstrates deliberate resilience boundaries.

============================================================
65. SECURITY CHECKLIST
============================================================

Document:

- tenant checks
- least-privilege IAM
- private DB/Redis/Kafka
- Secrets Manager
- TLS
- webhook HMAC
- JWT secret handling
- S3 private bucket
- no cross-service DB reads
- non-root containers
- no secrets in logs
- no presigned URL logging

============================================================
66. TERRAFORM DELIVERABLES
============================================================

Provide:

- root modules
- dev environment
- prod environment example
- variables
- outputs
- IAM policies
- security groups
- ECS tasks/services
- ALB listener rules
- RDS
- Redis
- Kafka/MSK
- S3
- SQS
- ECR
- CloudWatch
- Secrets Manager references
- service discovery

Do not include fake placeholder code that cannot validate.

Use syntactically valid Terraform.

============================================================
67. CI/CD DELIVERABLES
============================================================

Provide GitHub Actions workflows for:

PR validation

Docker build/test

ECR push

Terraform plan

deployment

Use:

OIDC authentication to AWS

where practical.

============================================================
68. DOCUMENTATION
============================================================

Create:

README deployment section

docs/architecture.md

docs/aws-architecture.md

docs/observability.md

docs/runbooks/sentinelai-operations.md

Include diagrams using Mermaid where useful.

============================================================
69. AWS ARCHITECTURE DIAGRAM
============================================================

Provide Mermaid diagram showing:

Internet
-> ALB
-> API Gateway / Realtime / GitHub webhook
-> ECS services
-> RDS
-> ElastiCache
-> MSK
-> SQS
-> S3
-> Secrets Manager
-> observability stack

Show internal Service Connect communication.

============================================================
70. FINAL ARCHITECTURAL RULES
============================================================

Do NOT violate these:

1. API Gateway remains external REST entry point.

2. Internal services are not all publicly exposed.

3. Each service still owns its own logical database.

4. No cross-service database reads.

5. Tenant isolation remains mandatory.

6. Kafka remains async telemetry/system-event backbone.

7. Redis remains ephemeral/coordination infrastructure.

8. SQS is preferred for AWS notification delivery.

9. S3 owns document bytes.

10. RAG vectors remain in Postgres+pgvector.

11. AI remains advisory and non-critical.

12. GitHub data is correlation evidence, not automatic causation.

13. Secrets never go into source control.

14. Containers run non-root.

15. Production migrations are explicit.

16. Local Docker Compose remains supported.

17. Observability instrumentation must not contain business logic.

18. Prometheus labels must remain low-cardinality.

19. Production infrastructure must be destroyable/reproducible via Terraform.

20. Cost implications must be documented honestly.

============================================================
71. FINAL DELIVERABLE
============================================================

Give me:

1. complete observability design

2. OpenTelemetry setup for Node services

3. OpenTelemetry setup for Python services

4. W3C trace propagation

5. Kafka trace propagation

6. structured logging setup

7. Prometheus instrumentation

8. domain metrics per service

9. Prometheus config

10. Grafana provisioning

11. dashboard definitions

12. Tempo/Jaeger setup

13. OTel Collector config

14. example Prometheus alert rules

15. production multi-stage Dockerfiles

16. container-hardening changes

17. AWS architecture design

18. Terraform folder structure

19. Terraform modules with usable code

20. VPC

21. security groups

22. ALB/listener rules

23. ECS cluster

24. ECS services/tasks

25. Service Connect/internal discovery

26. ECR

27. RDS/Postgres design

28. pgvector production setup

29. ElastiCache

30. MSK/MSK Serverless configuration

31. S3 document bucket

32. SQS + DLQ

33. SES integration configuration

34. Secrets Manager setup

35. IAM roles/policies

36. CloudWatch logging

37. dev Terraform environment

38. prod Terraform example

39. remote Terraform state configuration

40. database migration strategy

41. GitHub Actions CI/CD

42. AWS OIDC setup

43. immutable image tagging

44. deployment strategy

45. HTTPS/ACM configuration

46. autoscaling configuration

47. backups/retention configuration

48. local Docker Compose observability changes

49. end-to-end smoke-test script

50. k6 load-test setup

51. failure/resilience test guide

52. security checklist

53. operations runbook

54. architecture documentation

55. AWS Mermaid diagram

56. exact deployment commands

57. exact teardown commands

58. explicit AWS cost warning

Clearly mark every repository change as:

NEW FILE

or

MODIFY EXISTING FILE

Do not rewrite core domain services unnecessarily.

If the repository structure differs from these assumptions, adapt minimally and
preserve the existing architecture.

Do not claim deployment is production-ready unless:

- Terraform validates
- Docker builds succeed
- migrations work
- health checks work
- smoke tests pass

If something cannot be fully verified without real AWS credentials, clearly state
what was validated locally and what requires live AWS verification.

Do not ask unnecessary clarifying questions.

Make reasonable engineering assumptions, document them, and continue.

```