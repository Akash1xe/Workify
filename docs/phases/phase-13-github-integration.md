## PHASE 13 PROMPT — GitHub Integration

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect backend services to it. Those services stream
logs, metrics, and events into SentinelAI. The platform detects failures,
automatically creates incidents, supports real-time collaboration, stores
runbooks/postmortems, and uses an AI investigator to correlate evidence and
suggest probable root causes.

The next missing evidence source is deployments.

A major SentinelAI use case is:

"Something broke at 14:20. What changed shortly before that?"

GitHub Integration should provide real deployment/repository context so the AI can
correlate incidents with recent code changes.

============================================================
WHAT ALREADY EXISTS — PHASES 1–12
============================================================

1. auth-service — port 4001
   - authentication
   - JWT/session security

2. organization-service — port 4002
   - organizations
   - membership
   - roles

3. service-catalog-service — port 4003
   - registered backend services
   - service metadata
   - API keys
   - optional githubRepository field may already exist

4. incident-service — port 4004
   - incident lifecycle
   - timeline
   - comments
   - assignment
   - severity
   - manual + alert-created incidents

5. realtime-service — port 4005
   - Socket.IO
   - Redis Pub/Sub

6. ingestion-service — port 4006
   - telemetry ingestion
   - Kafka producer

7. telemetry-worker — port 4007
   - telemetry persistence
   - query APIs

8. alert-service — port 4008
   - alert rules
   - automatic incident creation

9. notification-service — port 4009
   - in-app/email notifications

10. document-service — port 4010
   - operational documents
   - S3/MinIO

11. rag-ingestion-service — port 4011
   - pgvector
   - document embeddings
   - semantic search

12. ai-investigator-service — port 4012
   - investigation runs
   - tool-calling
   - telemetry tools
   - RAG tools
   - similar incidents
   - placeholder deployment tool

The AI service already has a deployment-data abstraction such as:

get_recent_deployments(
  organizationId,
  serviceId,
  from,
  to
)

For Phase 12, it may currently return:

{
  "available": false,
  "deployments": []
}

Phase 13 must replace that placeholder with real deployment data.

============================================================
YOUR TASK — PHASE 13: GITHUB INTEGRATION
============================================================

Build GitHub integration that lets organizations connect repositories to
registered SentinelAI services.

The service should:

- connect GitHub repositories
- ingest webhook events
- store deployment/commit metadata
- correlate deployments with SentinelAI services
- expose tenant-safe deployment query APIs
- provide real deployment evidence to AI Investigator

This phase should demonstrate:

- third-party integration architecture
- webhook security
- idempotent event handling
- repository-to-service mapping
- deployment persistence
- commit/change metadata
- internal APIs for AI investigation

Do NOT implement GitHub Actions deployment itself.

SentinelAI observes GitHub/deployment events; it does not own users' CI/CD.

============================================================
1. SERVICE DESIGN
============================================================

Create a new service:

services/github-integration-service/

Port:

4013

Database:

sentinel_github

Tech:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Zod
- helmet
- cors
- GitHub API client / Octokit
- Kafka optional for downstream integration events

This service owns:

- GitHub connection metadata
- repository mappings
- webhook delivery records
- deployment records
- commit metadata relevant to investigation

It does NOT own:

- SentinelAI Service records
- users
- organizations
- incidents

============================================================
2. AUTHENTICATION MODEL
============================================================

Human-facing configuration endpoints use:

JWT
+
real organization membership

Use the established requireOrgMembership() pattern.

Permissions:

VIEWER:
- view integrations
- view deployment history

ENGINEER:
- same as viewer
- map repository to service

ADMIN:
- configure GitHub integration
- manage mappings
- disconnect integration

OWNER:
- same as ADMIN

Webhook endpoints do NOT use JWT.

They use GitHub webhook signature verification.

============================================================
3. GITHUB AUTHENTICATION APPROACH
============================================================

Preferred architecture:

GitHub App

Do NOT use a single personal access token as the main production design.

GitHub App gives:

- per-installation permissions
- scoped repository access
- revocation
- webhook support

For local/practice implementation:

support configurable GitHub App credentials:

GITHUB_APP_ID
GITHUB_PRIVATE_KEY
GITHUB_WEBHOOK_SECRET

If full OAuth/install UI is too large for this phase, implement the backend
installation model and document manual/local setup.

Do not hard-code credentials.

============================================================
4. DATA MODEL
============================================================

Create enums where useful.

------------------------------------------------------------
GitHubInstallation
------------------------------------------------------------

Fields:

- id UUID
- organizationId string
- installationId string unique
- accountLogin string
- accountType string
- active bool default true
- installedAt
- suspendedAt optional
- createdAt
- updatedAt

Indexes:

organizationId
installationId

------------------------------------------------------------
RepositoryConnection
------------------------------------------------------------

Fields:

- id UUID
- organizationId string
- installationId relation/reference to local GitHubInstallation
- githubRepositoryId string
- owner string
- name string
- fullName string
- defaultBranch optional string
- private bool
- htmlUrl optional string
- active bool default true
- createdAt
- updatedAt

Unique:

(organizationId, githubRepositoryId)

Indexes:

organizationId
fullName

------------------------------------------------------------
ServiceRepositoryMapping
------------------------------------------------------------

Fields:

- id UUID
- organizationId string
- serviceId string
- repositoryConnectionId FK
- environment optional string
- deploymentBranch optional string
- createdByUserId string
- createdAt
- updatedAt

Unique:

(organizationId, serviceId, repositoryConnectionId)

For this phase, ideally one primary repository per service/environment.

If multiple mappings are supported, document selection semantics clearly.

------------------------------------------------------------
Deployment
------------------------------------------------------------

Fields:

- id UUID
- organizationId string
- serviceId string
- repositoryConnectionId FK
- githubDeploymentId optional string
- githubRunId optional string
- environment optional string
- ref string
- branch optional string
- commitSha string
- commitMessage optional text
- commitAuthorName optional string
- commitAuthorEmail optional string
- commitTimestamp optional DateTime
- deployedAt DateTime
- status string
- source string
- deploymentUrl optional string
- metadata optional Json
- createdAt
- updatedAt

Recommended source values:

GITHUB_DEPLOYMENT
GITHUB_ACTIONS
MANUAL_WEBHOOK

Unique keys:

If githubDeploymentId exists:
unique it appropriately.

If using workflow run:
githubRunId may provide another idempotency key.

Indexes:

organizationId
serviceId
deployedAt
commitSha
repositoryConnectionId
(organizationId, serviceId, deployedAt)

------------------------------------------------------------
WebhookDelivery
------------------------------------------------------------

Fields:

- id UUID
- deliveryId string unique
- eventName string
- installationId optional string
- organizationId optional string
- receivedAt
- processedAt optional
- status:
    RECEIVED
    PROCESSED
    IGNORED
    FAILED
- errorCode optional string
- errorMessage optional string

Do NOT store sensitive raw webhook payload forever unless needed.

If storing payload for debugging, redact and/or apply retention.

Preferred for this phase:

store only metadata + safe summary.

============================================================
5. SERVICE MAPPING
============================================================

A GitHub repository must be explicitly mapped to a SentinelAI registered service.

Do NOT infer ownership only from repository name.

Example:

GitHub repo:
acme/payments

maps to:

SentinelAI serviceId:
payment-service UUID

When mapping:

verify service belongs to organization through Service Catalog REST API.

Call:

GET
${CATALOG_SERVICE_URL}/organizations/${organizationId}/services/${serviceId}

Forward caller JWT.

Do not query Service Catalog DB directly.

============================================================
6. HUMAN CONFIGURATION ENDPOINTS
============================================================

Base:

/organizations/:organizationId/github

------------------------------------------------------------
LIST INSTALLATIONS
------------------------------------------------------------

GET
/organizations/:organizationId/github/installations

Any member.

------------------------------------------------------------
LIST REPOSITORIES
------------------------------------------------------------

GET
/organizations/:organizationId/github/repositories

Any member.

Optional filters:

installationId
active

------------------------------------------------------------
CREATE SERVICE MAPPING
------------------------------------------------------------

POST
/organizations/:organizationId/github/mappings

Roles:

ENGINEER
ADMIN
OWNER

Body:

{
  "serviceId": "...",
  "repositoryConnectionId": "...",
  "environment": "PRODUCTION",
  "deploymentBranch": "main"
}

Verify:

- repository belongs to organization
- service belongs to organization

Return 201.

------------------------------------------------------------
LIST MAPPINGS
------------------------------------------------------------

GET
/organizations/:organizationId/github/mappings

Any member.

Filters:

serviceId?
repositoryConnectionId?

------------------------------------------------------------
DELETE MAPPING
------------------------------------------------------------

DELETE
/organizations/:organizationId/github/mappings/:mappingId

Roles:

ADMIN
OWNER

Return 204.

------------------------------------------------------------
LIST DEPLOYMENTS
------------------------------------------------------------

GET
/organizations/:organizationId/github/deployments

Any member.

Filters:

serviceId?
repositoryId?
from?
to?
commitSha?
environment?
page?
limit?

Newest first.

Every query must include organizationId.

============================================================
7. GITHUB APP INSTALLATION INGESTION
============================================================

Webhook endpoint:

POST /webhooks/github

No JWT.

Read headers:

x-github-event
x-github-delivery
x-hub-signature-256

Verify webhook HMAC SHA-256 using:

GITHUB_WEBHOOK_SECRET

IMPORTANT:

Use raw request body for signature verification.

Do NOT verify against JSON re-serialization.

Reject:

missing signature -> 401/400
invalid signature -> 401

Use timing-safe comparison.

============================================================
8. WEBHOOK IDEMPOTENCY
============================================================

GitHub may redeliver webhooks.

Use:

x-github-delivery

as unique deliveryId.

Before processing:

if deliveryId already PROCESSED/IGNORED:

return 200 idempotently.

Do not create duplicate deployments.

============================================================
9. WEBHOOK EVENTS TO SUPPORT
============================================================

At minimum support:

installation

installation_repositories

deployment

deployment_status

workflow_run

push

Do not try to deeply implement every GitHub webhook.

Handle unsupported events safely as:

IGNORED

return 200.

============================================================
10. INSTALLATION EVENT
============================================================

When GitHub App installed:

store/update GitHubInstallation.

When removed:

mark:

active = false

Do not hard-delete historical deployment data.

When suspended:

record suspended state.

============================================================
11. INSTALLATION_REPOSITORIES
============================================================

Sync repositories added/removed from installation.

For added repositories:

upsert RepositoryConnection.

For removed:

mark active=false.

Do not delete historical repository/deployment data.

============================================================
12. DEPLOYMENT EVENT
============================================================

GitHub deployment events can represent a deployment request.

Store enough correlation metadata but do not necessarily mark as successfully
deployed yet.

Use deployment_status to determine final state where available.

Example:

deployment event:
- deployment id
- environment
- ref
- sha
- repository

Create/update Deployment record.

Possible status:

PENDING

============================================================
13. DEPLOYMENT_STATUS EVENT
============================================================

When state becomes:

success

set deployment status:

SUCCESS

and:

deployedAt = event timestamp

Other mappings:

failure -> FAILURE
error -> FAILURE
inactive -> INACTIVE
pending -> PENDING
in_progress -> IN_PROGRESS
queued -> QUEUED

Use consistent internal enum/string values.

============================================================
14. WORKFLOW_RUN EVENT
============================================================

Many teams deploy via GitHub Actions without GitHub Deployment API.

Support:

workflow_run

For completed successful runs, optionally treat them as deployment evidence ONLY
when repository is mapped and configuration says the workflow represents
deployment.

Do NOT assume every workflow is a production deployment.

Add mapping/config field such as:

deploymentWorkflowName optional

or:

deploymentWorkflowId optional

Then:

successful matching workflow
→ create deployment record

This prevents test/build workflows from appearing as deploys.

============================================================
15. PUSH EVENTS
============================================================

Push events are useful context but are NOT automatically deployments.

Store/derive commit metadata if useful.

Do not create Deployment merely because code was pushed.

This distinction is important.

============================================================
16. COMMIT METADATA
============================================================

For deployment evidence, enrich commit information.

Use GitHub API through installation token if webhook payload lacks required fields.

Fetch:

- commit SHA
- commit message
- author
- timestamp
- changed files if needed

Do not fetch huge diff content by default.

Store lightweight metadata.

============================================================
17. CHANGED FILES
============================================================

AI investigation benefits from knowing what changed.

Store or fetch on demand:

- filename
- status added/modified/removed
- additions
- deletions

Do NOT persist full source-code patch contents by default.

Preferred Deployment metadata:

{
  "changedFiles": [
    {
      "path": "src/db/pool.ts",
      "status": "modified",
      "additions": 12,
      "deletions": 4
    }
  ]
}

Cap:

MAX_CHANGED_FILES=100

If more:

include count/truncated flag.

============================================================
18. INSTALLATION TOKEN HANDLING
============================================================

GitHub App installation access tokens are short-lived.

Do not persist them permanently in DB.

Generate/cache temporarily.

Preferred:

in-memory or Redis cache keyed by installationId with TTL shorter than token
expiry.

Never log installation tokens.

============================================================
19. GITHUB API CLIENT ABSTRACTION
============================================================

Create:

GitHubProvider

or:

GitHubClientFactory

Responsibilities:

- create app authentication
- create installation client
- list repositories
- fetch commit
- fetch changed files
- resolve repository metadata

Do not scatter Octokit initialization throughout controllers/webhook handlers.

============================================================
20. INTERNAL DEPLOYMENT API
============================================================

AI Investigator needs deployment evidence.

Add:

GET
/internal/deployments

Protected with:

x-internal-service-secret

Query:

organizationId
serviceId
from
to
limit

Default:

limit=20

Max:

100

Return:

{
  "available": true,
  "deployments": [
    {
      "id": "...",
      "serviceId": "...",
      "repository": "acme/payments",
      "environment": "PRODUCTION",
      "branch": "main",
      "commitSha": "...",
      "commitMessage": "...",
      "commitAuthorName": "...",
      "deployedAt": "...",
      "status": "SUCCESS",
      "changedFiles": [...]
    }
  ]
}

Tenant filter MUST be in DB query.

============================================================
21. AI INVESTIGATOR INTEGRATION
============================================================

Modify ai-investigator-service deployment tool.

Replace placeholder implementation with real HTTP client call:

GET
${GITHUB_INTEGRATION_SERVICE_URL}/internal/deployments

Parameters:

organizationId
serviceId
from
to

Header:

x-internal-service-secret

Tool output should preserve source IDs so deployments can become citations.

Example evidence:

DEPLOYMENT-1

Claim:

"Deployment commit a1b2c3 modified src/db/pool.ts 13 minutes before incident."

Do not let AI service directly call GitHub API.

GitHub Integration Service owns that responsibility.

============================================================
22. DEPLOYMENT / INCIDENT CORRELATION
============================================================

Do not automatically claim causation.

Expose useful timing metadata.

AI can compute:

incident.createdAt - deployment.deployedAt

Example:

deployment:
14:07

incident:
14:20

delta:
13 minutes

This is evidence of temporal correlation, not proof.

============================================================
23. OPTIONAL KAFKA DEPLOYMENT EVENT
============================================================

Publish:

sentinel.deployments.recorded.v1

when a successful deployment is persisted.

Example:

{
  "eventId": "...",
  "schemaVersion": 1,
  "type": "DEPLOYMENT_RECORDED",
  "organizationId": "...",
  "serviceId": "...",
  "deploymentId": "...",
  "repository": "acme/payments",
  "commitSha": "...",
  "environment": "PRODUCTION",
  "deployedAt": "..."
}

Use transactional outbox if implementing Kafka publishing.

This can later support proactive analysis.

Optional for Phase 13 but preferred if consistent with existing architecture.

============================================================
24. TRANSACTIONAL OUTBOX
============================================================

If deployment lifecycle events are published:

create GitHubOutboxEvent:

- id
- eventId unique
- type
- payload JSON
- createdAt
- publishedAt optional
- attempts

Persist:

Deployment success update
+
outbox event

in same DB transaction.

Do not lose events after DB commit.

============================================================
25. REPOSITORY SYNCHRONIZATION
============================================================

Webhooks are primary.

Also provide reconciliation.

Example background sync:

every 10 minutes

for active installations:

- list repositories accessible to GitHub App
- upsert repo metadata
- mark removed repos inactive

Why:

webhooks can occasionally be missed or local environment can restart.

Make interval configurable.

============================================================
26. WEBHOOK PROCESSING FAILURE
============================================================

Do not return 200 if a valid supported webhook failed before durable handling,
unless persisted for retry.

Preferred:

process synchronously enough to persist WebhookDelivery + essential data.

If transient GitHub API enrichment fails:

store delivery FAILED
allow GitHub webhook retry with non-2xx response

OR

persist a durable retry job before returning 2xx.

Choose a coherent strategy and document it.

For this phase, returning 5xx on transient processing failure is acceptable so
GitHub retries.

============================================================
27. WEBHOOK SECURITY
============================================================

Must enforce:

1. signature verification uses raw body

2. timing-safe comparison

3. unique delivery ID handling

4. no trust in organizationId from webhook payload

GitHub webhook does not know SentinelAI organizationId directly.

Resolve tenancy through:

installationId
→ GitHubInstallation
→ organizationId

Do not allow payload to override it.

============================================================
28. REPOSITORY TENANT SAFETY
============================================================

Every repository/deployment record stores organizationId.

Every human query includes organizationId.

Every internal AI query includes organizationId.

No cross-org lookup by repository ID without tenant filter.

============================================================
29. CONNECTING INSTALLATION TO ORGANIZATION
============================================================

Need a safe initial install flow.

Preferred model:

1. authenticated ADMIN/OWNER starts GitHub connection

2. backend creates temporary installation state token

3. user installs GitHub App

4. callback/webhook provides installationId

5. correlate installation with pending SentinelAI org state

For project scope, if implementing full callback flow is too large:

provide an explicit endpoint:

POST
/organizations/:organizationId/github/installations/link

ADMIN/OWNER

Body:

{
  "installationId": "12345"
}

Backend verifies installation through GitHub App API before storing.

Do NOT just trust arbitrary installationId.

Clearly document this as the simplified practice flow.

============================================================
30. LINK INSTALLATION ENDPOINT
============================================================

POST
/organizations/:organizationId/github/installations/link

OWNER/ADMIN

Body:

{
  "installationId": "..."
}

Flow:

1. validate org membership

2. call GitHub API as App

3. verify installation exists and accessible

4. fetch account metadata

5. upsert GitHubInstallation

6. fetch repositories

7. upsert RepositoryConnection

Return installation + repository summary.

============================================================
31. DISCONNECT INSTALLATION
============================================================

DELETE
/organizations/:organizationId/github/installations/:installationId

OWNER/ADMIN

Preferred:

mark local integration inactive.

Do not attempt to uninstall GitHub App from GitHub unless explicitly supported.

Historical deployments remain.

============================================================
32. HEALTH / READINESS
============================================================

GET /health

{
  "status": "ok",
  "service": "github-integration-service"
}

GET /ready

Check:

- PostgreSQL
- required GitHub App config
- Kafka if used

Do not call GitHub API on every readiness request.

============================================================
33. API GATEWAY
============================================================

Add:

GITHUB_INTEGRATION_SERVICE_URL

Proxy:

/api/github/*

to:

github-integration-service:4013

Strip:

/api/github

Example:

External:

GET
/api/github/organizations/ORG_ID/github/deployments

Internal:

GET
/organizations/ORG_ID/github/deployments

Webhook route may be exposed separately.

Option A:

Gateway proxies:

/webhooks/github

Option B:

GitHub reaches integration service directly.

Preferred local simplicity:

Expose:

http://localhost:4013/webhooks/github

For production behind load balancer/API Gateway, route accordingly.

Document clearly.

Do not require human JWT on webhook endpoint.

============================================================
34. GITHUB WEBHOOK LOCAL TESTING
============================================================

Document using a tunnel such as:

ngrok

or equivalent.

Example concept:

GitHub App webhook URL
→ public tunnel
→ localhost:4013/webhooks/github

Do not hard-code tunnel URL.

Also provide a local signed webhook test script so development does not require
GitHub for every test.

============================================================
35. WEBHOOK TEST SCRIPT
============================================================

Create script that:

1. loads JSON fixture

2. computes:

sha256 HMAC

using GITHUB_WEBHOOK_SECRET

3. sends:

x-github-event
x-github-delivery
x-hub-signature-256

4. POSTs to /webhooks/github

Provide fixtures for:

installation
deployment
deployment_status
workflow_run

============================================================
36. LOGGING
============================================================

Log:

- webhook delivery ID
- GitHub event
- installationId
- repository ID
- organizationId
- serviceId
- deployment ID
- commit SHA
- mapping resolution
- GitHub API enrichment failures

Do NOT log:

- GitHub private key
- installation access token
- webhook secret
- Authorization header
- JWT
- internal service secret

============================================================
37. RETENTION
============================================================

Keep deployment history.

WebhookDelivery debugging records may be retained for a shorter period.

Add configurable:

WEBHOOK_DELIVERY_RETENTION_DAYS=30

Optional cleanup job:

delete old successfully processed WebhookDelivery rows after retention.

Do not delete Deployment records with this cleanup.

============================================================
38. TESTING REQUIREMENTS
============================================================

At minimum test:

1. webhook without signature rejected

2. invalid signature rejected

3. valid signature accepted

4. duplicate deliveryId is idempotent

5. unsupported event safely ignored

6. installation event upserts installation

7. installation_repositories adds repository

8. removed repository becomes inactive

9. service mapping verifies service belongs to org

10. Org A cannot map Org B repository

11. deployment event creates/updates deployment

12. deployment_status success marks deployment SUCCESS

13. push alone does not create deployment

14. workflow_run only creates deployment when configured as deployment workflow

15. duplicate deployment webhook does not duplicate Deployment

16. commit enrichment stores safe metadata

17. changed files capped at MAX_CHANGED_FILES

18. installation token never persisted

19. internal deployments endpoint requires secret

20. internal deployment query is tenant-scoped

21. human deployment query requires membership

22. non-member -> 404

23. VIEWER cannot modify mappings

24. ENGINEER can create mapping

25. ADMIN can disconnect integration

26. AI deployment client gets real deployment results

27. AI receives unavailable=false/true semantics correctly

28. deployment citation source ID is stable

============================================================
39. DOCKER SETUP
============================================================

Add:

github-integration-service

Port:

4013

Database:

sentinel_github

Create:

infrastructure/postgres-init/<next-number>-create-github-db.sh

Environment:

PORT=4013

DATABASE_URL=postgresql://...

JWT_ACCESS_SECRET=...

ORGANIZATION_SERVICE_URL=http://organization-service:4002

CATALOG_SERVICE_URL=http://service-catalog-service:4003

INTERNAL_SERVICE_SECRET=...

GITHUB_APP_ID=...

GITHUB_PRIVATE_KEY=...

GITHUB_WEBHOOK_SECRET=...

GITHUB_REPOSITORY_SYNC_INTERVAL_SECONDS=600

MAX_CHANGED_FILES=100

WEBHOOK_DELIVERY_RETENTION_DAYS=30

KAFKA_BROKERS=kafka:9092

KAFKA_CLIENT_ID=sentinel-github-integration

NODE_ENV=development

If private key is multiline:

support safe env/file loading.

Do not commit real private key to repository.

============================================================
40. PROJECT STRUCTURE
============================================================

Suggested:

services/
  github-integration-service/
    src/
      app.ts
      server.ts

      config/
        env.ts

      routes/
        github.routes.ts
        webhook.routes.ts
        internal.routes.ts
        health.routes.ts

      controllers/
        installation.controller.ts
        repository.controller.ts
        mapping.controller.ts
        deployment.controller.ts

      services/
        installation.service.ts
        repositorySync.service.ts
        mapping.service.ts
        deployment.service.ts
        webhook.service.ts
        commitEnrichment.service.ts

      repositories/
        installation.repository.ts
        repository.repository.ts
        mapping.repository.ts
        deployment.repository.ts
        webhookDelivery.repository.ts

      providers/
        github/
          githubApp.provider.ts
          installationClient.factory.ts

      clients/
        organization.client.ts
        serviceCatalog.client.ts

      middleware/
        requireAuth.ts
        requireOrgMembership.ts
        verifyGithubWebhook.ts
        requireInternalSecret.ts
        validate.ts
        errorHandler.ts
        requestId.ts

      schemas/
        installations.schema.ts
        mappings.schema.ts
        deployments.schema.ts
        webhook.schema.ts

      kafka/
        producer.ts
        outboxPublisher.ts
        topics.ts

      workers/
        repositorySync.worker.ts
        webhookRetention.worker.ts

      utils/
        AppError.ts
        logger.ts
        crypto.ts

      types/
        express.d.ts
        github.ts

    prisma/
      schema.prisma

    tests/
      fixtures/

    scripts/
      send-signed-webhook.ts

    Dockerfile
    package.json
    tsconfig.json
    .env.example

============================================================
41. MANUAL END-TO-END DEMO
============================================================

README must demonstrate:

1. create organization

2. register payment-service

3. configure GitHub App credentials

4. link GitHub installation to organization

5. list repositories

6. map:

acme/payments
→ payment-service

7. send/receive a successful deployment event

8. list deployments:

GET
/api/github/organizations/ORG_ID/github/deployments?serviceId=SERVICE_ID

9. verify:

repository
commitSha
branch
author
deployedAt
changedFiles

10. create an incident 10–20 minutes after deployment

11. run AI investigation

12. verify get_recent_deployments returns actual deployment

13. final AI evidence can include:

DEPLOYMENT-1

14. verify model describes temporal correlation without automatically claiming
causation

============================================================
42. TENANT-ISOLATION DEMO
============================================================

Create:

Org A
Org B

Link separate repositories.

Attempt:

Org B user requests Org A deployment ID/data.

Expected:

404/no results.

Internal request with:

organizationId=Org B
serviceId=Org A service

must return zero/not found.

Never leak repository/deployment metadata across tenants.

============================================================
43. IDEMPOTENCY DEMO
============================================================

Replay exact webhook fixture with same:

x-github-delivery

twice.

Expected:

one durable processing result.

No duplicate deployment.

Then replay equivalent deployment with a NEW delivery ID but same GitHub deployment ID.

Expected:

still no duplicate Deployment.

This demonstrates both:

delivery idempotency
domain idempotency

============================================================
44. ARCHITECTURAL RULES
============================================================

Do NOT violate these:

1. GitHub Integration Service owns integration/deployment metadata.

2. Service Catalog owns SentinelAI services.

3. Repository mappings reference serviceId as plain cross-service ID.

4. Service ownership is verified through REST.

5. Webhooks use HMAC verification, not JWT.

6. Webhook tenant identity comes from installation mapping, never payload-supplied
organizationId.

7. Installation tokens are short-lived and never persisted.

8. Push != deployment.

9. Workflow run != deployment unless explicitly configured.

10. Deployment timing is correlation evidence, not proof of causation.

11. AI Investigator queries GitHub Integration Service, not GitHub directly.

12. Every deployment query is tenant-scoped.

13. Historical deployments survive integration disconnect.

14. Unsupported webhooks are safely ignored.

15. Duplicate webhook deliveries are idempotent.

16. Do not store full source code/patches by default.

17. API Gateway contains no GitHub business logic.

============================================================
45. PREPARE FOR PHASE 14
============================================================

Phase 14 is Observability + AWS Deployment.

It will add:

- OpenTelemetry tracing
- Prometheus metrics
- Grafana dashboards
- structured logs
- service health dashboards
- production Docker images
- Terraform
- ECS
- RDS
- ElastiCache/Redis
- MSK or equivalent Kafka strategy
- S3
- secrets management
- networking
- production deployment

Therefore GitHub Integration Service must expose useful operational metrics and
structured logs like every other service.

Do not implement full Phase 14 infrastructure here.

============================================================
46. DELIVERABLE
============================================================

Give me:

1. full github-integration-service folder structure

2. every new file with complete code

3. Prisma schema

4. GitHub App provider

5. installation-token handling

6. human configuration APIs

7. repository sync

8. service-repository mapping

9. webhook raw-body signature verification

10. webhook delivery idempotency

11. installation event handling

12. repository event handling

13. deployment handling

14. deployment_status handling

15. workflow_run deployment handling

16. push handling without false deployment creation

17. commit enrichment

18. changed-file metadata

19. internal deployment query API

20. tenant isolation

21. optional deployment outbox/Kafka event

22. background repository reconciliation

23. webhook retention cleanup

24. tests

25. signed webhook test script + fixtures

26. Dockerfile

27. .env.example

28. PostgreSQL init script

29. exact Docker Compose modifications

30. exact API Gateway modifications

31. exact AI Investigator deployment-tool modifications

32. any minimal Service Catalog integration change if required

33. README GitHub setup instructions

34. README end-to-end deployment correlation demo

35. tenant-isolation demo

36. idempotency demo

Clearly mark every change as:

NEW FILE

or

MODIFY EXISTING FILE

Do not rewrite unrelated Phase 1–12 services.

If the current repository differs slightly from these assumptions, adapt minimally
while preserving the established architecture.

Ask clarifying questions only if something is genuinely impossible to infer.
Otherwise make a reasonable engineering assumption, state it, and continue.

```