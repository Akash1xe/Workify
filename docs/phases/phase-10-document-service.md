## PHASE 10 PROMPT — Document Service

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect backend services to it. Those services stream
logs, metrics, and events into SentinelAI. The system detects failures,
automatically creates incidents, supports real-time collaboration, and later uses
AI+RAG to investigate root causes using telemetry, deployments, runbooks, and
past incidents.

The architecture is intentionally split into focused microservices.

Communication model:

- synchronous REST for immediate cross-service validation
- Kafka for durable asynchronous/high-volume system events
- Redis Pub/Sub for ephemeral real-time UI updates
- background workers for asynchronous processing

Each service owns its own data.

No service may directly query another service's database.

============================================================
WHAT ALREADY EXISTS — PHASES 1–9
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
   - incident collaboration
   - per-user notification rooms

6. ingestion-service — port 4006
   - receives logs/metrics/events
   - authenticates registered backend services
   - publishes telemetry to Kafka

7. telemetry-worker — port 4007
   - consumes and persists telemetry
   - idempotency
   - retries
   - DLQ
   - query APIs

8. alert-service — port 4008
   - alert rules
   - alert state machine
   - automatic incident creation
   - transactional outbox
   - publishes alert lifecycle events

9. notification-service — port 4009
   - in-app notifications
   - email delivery
   - notification preferences
   - Kafka consumer
   - background queue
   - retries and delivery state

============================================================
YOUR TASK — PHASE 10: DOCUMENT SERVICE
============================================================

Build the Document Service.

This service manages the private operational knowledge that the AI/RAG system will
use later.

Examples:

- runbooks
- postmortems
- architecture documents
- troubleshooting guides
- deployment procedures
- service documentation

The service owns:

- document metadata
- tenant-safe access
- upload lifecycle
- object-storage keys
- processing state
- deletion state

Actual parsing, chunking, embeddings, and vector storage are NOT part of this
phase.

That is Phase 11.

============================================================
1. TECH STACK
============================================================

Use:

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Zod
- jsonwebtoken
- helmet
- cors
- AWS SDK v3

New service:

services/document-service/

Port:

4010

Database:

sentinel_document

Object storage:

- AWS S3 in production
- S3-compatible/local storage for development if practical

Preferred local option:

MinIO

Do not proxy file bytes through Document Service for normal uploads.

Use presigned URLs.

============================================================
2. DOCUMENT MODEL
============================================================

Create enums:

enum DocumentType {
  RUNBOOK
  POSTMORTEM
  ARCHITECTURE
  TROUBLESHOOTING
  OTHER
}

enum DocumentStatus {
  UPLOAD_PENDING
  UPLOADED
  PROCESSING
  READY
  FAILED
  DELETED
}

------------------------------------------------------------
Document
------------------------------------------------------------

Fields:

- id: UUID
- organizationId: string
- serviceId: optional string
- title: string
- description: optional string
- type: DocumentType
- status: DocumentStatus default UPLOAD_PENDING
- fileName: string
- contentType: string
- sizeBytes: optional BigInt
- storageBucket: string
- storageKey: string unique
- uploadedByUserId: string
- uploadedAt: optional DateTime
- processingStartedAt: optional DateTime
- processingCompletedAt: optional DateTime
- processingError: optional string
- checksum: optional string
- createdAt
- updatedAt

Indexes:

- organizationId
- serviceId
- type
- status
- createdAt
- (organizationId, serviceId)
- (organizationId, status)

Do NOT store raw file contents in PostgreSQL.

============================================================
3. DOCUMENT OWNERSHIP
============================================================

Document Service owns document metadata.

Object storage owns file bytes.

Phase 11 will own extracted chunks/embeddings separately.

Do not create vector columns here.

Do not parse PDFs here.

Do not generate embeddings here.

============================================================
4. HUMAN AUTHENTICATION
============================================================

All human-facing Document Service APIs require JWT authentication.

Use:

requireAuth

Same JWT_ACCESS_SECRET as auth-service.

Attach:

req.user = {
  id,
  email
}

============================================================
5. TENANT MEMBERSHIP
============================================================

Every organization-scoped route must verify membership through Organization Service.

Use:

requireOrgMembership(allowedRoles?)

Call:

GET
${ORGANIZATION_SERVICE_URL}/organizations/${organizationId}

Forward Authorization header.

Expected:

200 -> parse yourRole
401 -> 401
404 -> 404
unexpected/network -> 502

Permissions:

VIEWER:
- list
- view metadata
- request download URL

ENGINEER:
- VIEWER permissions
- upload documents
- delete documents they uploaded

ADMIN:
- ENGINEER permissions
- delete any document in org

OWNER:
- same as ADMIN

============================================================
6. SERVICE OWNERSHIP VALIDATION
============================================================

A document may optionally be associated with a registered backend service.

Example:

payment-service runbook

If:

serviceId != null

verify through Service Catalog:

GET
${CATALOG_SERVICE_URL}/organizations/${organizationId}/services/${serviceId}

Forward JWT.

Do not query Service Catalog DB directly.

404 if service does not belong to organization.

============================================================
7. ALLOWED FILE TYPES
============================================================

Support initially:

- PDF
- Markdown
- plain text
- DOCX

Allowed MIME types:

application/pdf
text/markdown
text/plain
application/vnd.openxmlformats-officedocument.wordprocessingml.document

Also validate extension where useful.

Do not rely only on extension.

Do not execute uploaded documents.

Document parsing happens in a worker later.

============================================================
8. FILE SIZE LIMIT
============================================================

Configurable:

MAX_DOCUMENT_SIZE_MB

Default:

25 MB

When generating upload intent, require the expected file size.

Reject if above configured maximum.

Do not allow effectively unlimited uploads.

============================================================
9. STORAGE KEY DESIGN
============================================================

Never use raw user filename as the entire storage key.

Generate deterministic tenant-safe structure.

Example:

organizations/{organizationId}/documents/{documentId}/{sanitizedFileName}

or:

organizations/{organizationId}/documents/{documentId}/original

Preferred:

store original filename in DB

use opaque storage key:

organizations/{organizationId}/documents/{documentId}/original

This avoids filename path traversal issues.

Never trust:

../
absolute paths
client-supplied storage keys

============================================================
10. CREATE UPLOAD INTENT
============================================================

Endpoint:

POST
/organizations/:organizationId/documents/upload-intent

Roles:

OWNER
ADMIN
ENGINEER

Body:

{
  "title": "Payment Service Runbook",
  "description": "optional",
  "type": "RUNBOOK",
  "serviceId": "optional uuid",
  "fileName": "payment-runbook.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 1048576
}

Behavior:

1. validate org membership

2. validate service ownership if serviceId provided

3. validate file type

4. validate file size

5. create Document row:

status = UPLOAD_PENDING

6. generate storageKey

7. generate presigned PUT URL

8. return:

{
  "document": {...},
  "upload": {
    "url": "...",
    "method": "PUT",
    "expiresAt": "...",
    "requiredHeaders": {
      "Content-Type": "application/pdf"
    }
  }
}

Presigned URL lifetime:

e.g. 15 minutes

configurable.

============================================================
11. IMPORTANT UPLOAD TRUST RULE
============================================================

Generating a presigned URL does NOT mean upload succeeded.

Do not set:

status = UPLOADED

when upload intent is created.

Status remains:

UPLOAD_PENDING

until upload is explicitly confirmed/verified.

============================================================
12. CONFIRM UPLOAD
============================================================

Endpoint:

POST
/organizations/:organizationId/documents/:documentId/complete-upload

Roles:

OWNER
ADMIN
ENGINEER

Behavior:

1. verify document belongs to organization

2. verify caller may operate on document

3. document must currently be UPLOAD_PENDING

4. perform S3 HEAD Object on storageKey

5. verify object exists

6. verify:

content length <= configured max

7. verify expected content type where reliable

8. optionally compare expected size vs actual size

9. update:

status = UPLOADED
uploadedAt = now
sizeBytes = actual object size

10. publish a document-processing event for Phase 11

Important:

Do not trust client saying "upload completed".

Verify storage object exists.

============================================================
13. DOCUMENT PROCESSING EVENT
============================================================

After upload confirmation, publish Kafka event:

sentinel.documents.uploaded.v1

Payload:

{
  "eventId": "uuid",
  "schemaVersion": 1,
  "type": "DOCUMENT_UPLOADED",
  "organizationId": "...",
  "serviceId": "... or null",
  "documentId": "...",
  "documentType": "RUNBOOK",
  "storageBucket": "...",
  "storageKey": "...",
  "fileName": "...",
  "contentType": "...",
  "sizeBytes": 1048576,
  "occurredAt": "..."
}

Phase 11 will consume this.

============================================================
14. USE TRANSACTIONAL OUTBOX
============================================================

Do not directly:

update document to UPLOADED
then producer.send()

as the only mechanism.

Use a transactional outbox.

Create:

DocumentOutboxEvent

Fields:

- id: UUID
- eventId: string unique
- type: string
- payload: Json
- createdAt
- publishedAt optional
- attempts default 0

Inside same transaction:

1. update Document status to UPLOADED
2. create DocumentOutboxEvent

Background publisher sends event to Kafka.

On success:

publishedAt = now

On failure:

increment attempts
retry later

This prevents losing the processing event after DB commit.

============================================================
15. PROCESSING STATUS INTERNAL API
============================================================

Phase 11 worker needs to update processing state.

Do not let worker access Document Service DB directly.

Add internal endpoints protected with:

x-internal-service-secret

------------------------------------------------------------
MARK PROCESSING
------------------------------------------------------------

POST
/internal/documents/:documentId/processing

Body:

{
  "organizationId": "..."
}

Behavior:

UPLOADED -> PROCESSING

Set:

processingStartedAt = now
processingError = null

Idempotent if already PROCESSING.

------------------------------------------------------------
MARK READY
------------------------------------------------------------

POST
/internal/documents/:documentId/ready

Body:

{
  "organizationId": "..."
}

Behavior:

PROCESSING -> READY

Set:

processingCompletedAt = now
processingError = null

------------------------------------------------------------
MARK FAILED
------------------------------------------------------------

POST
/internal/documents/:documentId/failed

Body:

{
  "organizationId": "...",
  "errorCode": "...",
  "message": "safe message"
}

Behavior:

PROCESSING/UPLOADED -> FAILED

Set:

processingCompletedAt = now
processingError = safe message

Do not store stack traces or secrets.

============================================================
16. INTERNAL DOCUMENT METADATA API
============================================================

Phase 11 may need authoritative metadata.

Add:

GET
/internal/documents/:documentId

Protected by internal secret.

Optional required query/header:

organizationId

Return safe metadata including:

id
organizationId
serviceId
type
status
storageBucket
storageKey
fileName
contentType
sizeBytes

Do not expose unrelated user details.

============================================================
17. LIST DOCUMENTS
============================================================

GET
/organizations/:organizationId/documents

Any member.

Filters:

serviceId?
type?
status?
search?
page?
limit?

Defaults:

page=1
limit=20

Max:

100

Search:

case-insensitive title contains

Sort:

newest first

Every query MUST include organizationId.

============================================================
18. GET DOCUMENT
============================================================

GET
/organizations/:organizationId/documents/:documentId

Any member.

Query by:

id
AND
organizationId

Return metadata.

Do not return raw storage credentials.

============================================================
19. DOWNLOAD URL
============================================================

POST
/organizations/:organizationId/documents/:documentId/download-url

Any member.

Allowed statuses:

UPLOADED
PROCESSING
READY
FAILED

Not allowed:

DELETED

Generate presigned GET URL.

Short lifetime:

e.g. 10 minutes

Return:

{
  "url": "...",
  "expiresAt": "..."
}

Do not expose permanent public object URLs.

Bucket should remain private.

============================================================
20. UPDATE DOCUMENT METADATA
============================================================

PATCH
/organizations/:organizationId/documents/:documentId

Roles:

OWNER
ADMIN
ENGINEER

Allow:

title
description
type
serviceId

If serviceId changes:

verify service belongs to organization.

Do NOT allow changing:

storageKey
storageBucket
uploadedByUserId
processing state
sizeBytes

============================================================
21. DELETE DOCUMENT
============================================================

DELETE
/organizations/:organizationId/documents/:documentId

Permissions:

OWNER/ADMIN:
- any document

ENGINEER:
- only document where uploadedByUserId = req.user.id

VIEWER:
- forbidden

Preferred deletion semantics:

soft delete metadata first.

Set:

status = DELETED

Do not hard-delete row immediately.

Then attempt object deletion asynchronously.

Reason:

future RAG cleanup also needs to know the document was deleted.

============================================================
22. DOCUMENT DELETION EVENT
============================================================

Publish:

sentinel.documents.deleted.v1

Payload:

{
  "eventId": "...",
  "schemaVersion": 1,
  "type": "DOCUMENT_DELETED",
  "organizationId": "...",
  "serviceId": "...",
  "documentId": "...",
  "storageBucket": "...",
  "storageKey": "...",
  "occurredAt": "..."
}

Use transactional outbox.

Phase 11 will use this later to remove chunks/embeddings.

============================================================
23. OBJECT DELETION
============================================================

Do not block DELETE API indefinitely on S3.

Preferred:

1. transaction:
   set document DELETED
   create outbox event

2. best-effort object delete after commit or through cleanup worker

If S3 deletion fails:

metadata remains DELETED

retry object cleanup later

Do not restore the document to active state solely because object deletion failed.

============================================================
24. STALE UPLOAD INTENTS
============================================================

A client may request upload URL and never upload anything.

Add cleanup logic.

Example:

UPLOAD_PENDING older than:

24 hours

can be marked:

FAILED

with:

processingError = "upload was not completed"

or a dedicated expiration field if preferred.

Better option:

add:

uploadExpiresAt

to Document.

At upload intent creation:

uploadExpiresAt = now + 15 minutes

complete-upload rejects expired upload intent unless object verification policy
explicitly allows a grace period.

Use a reconciliation cleanup task for stale UPLOAD_PENDING records.

============================================================
25. S3 STORAGE ABSTRACTION
============================================================

Do not scatter AWS SDK calls through controllers.

Create:

StorageProvider

interface with methods such as:

createUploadUrl(...)
createDownloadUrl(...)
headObject(...)
deleteObject(...)

Implement:

S3StorageProvider

This should work with:

AWS S3

and configurable S3-compatible endpoint for MinIO.

Environment:

S3_REGION
S3_BUCKET
S3_ENDPOINT optional
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE
UPLOAD_URL_EXPIRES_SECONDS
DOWNLOAD_URL_EXPIRES_SECONDS

Production IAM role support should be possible later.

Do not require hard-coded access keys in production code.

============================================================
26. LOCAL MINIO
============================================================

Preferred local development setup:

Add MinIO to Docker Compose.

Expose:

9000 API
9001 console

Add bucket initialization.

Bucket:

sentinel-documents

Keep bucket private.

Create a minio-init container/script that ensures bucket exists.

Do not make bucket public.

============================================================
27. API GATEWAY
============================================================

Add:

DOCUMENT_SERVICE_URL

Proxy:

/api/documents/*

to:

document-service:4010

Strip:

/api/documents

Example:

External:

POST
/api/documents/organizations/ORG_ID/documents/upload-intent

Internal:

POST
/organizations/ORG_ID/documents/upload-intent

Do NOT expose:

/internal/*

through Gateway.

============================================================
28. KAFKA CONFIGURATION
============================================================

Document Service publishes:

sentinel.documents.uploaded.v1
sentinel.documents.deleted.v1

Use:

KAFKA_CLIENT_ID=sentinel-document-service

The outbox publisher is a producer only.

Document Service does not need to consume these topics in this phase.

============================================================
29. HEALTH / READINESS
============================================================

GET /health

{
  "status": "ok",
  "service": "document-service"
}

GET /ready

Check:

- PostgreSQL
- object storage connectivity if feasible
- Kafka producer/outbox publishing readiness where practical

Return 503 if critical dependencies unavailable.

Be careful not to make health checks perform expensive object operations.

============================================================
30. REQUEST ID
============================================================

Preserve:

x-request-id

Generate one if missing.

Log:

requestId
organizationId
documentId

Never log:

JWT
internal secret
presigned URL query parameters
AWS secret access key

Presigned URLs contain credentials/signatures and should be treated as sensitive.

============================================================
31. SECURITY
============================================================

Must enforce:

1. every human route requires real org membership

2. every document lookup includes organizationId

3. serviceId references are validated through Service Catalog

4. object keys are server-generated

5. bucket is private

6. uploads use short-lived presigned PUT URLs

7. downloads use short-lived presigned GET URLs

8. actual object existence is verified before marking UPLOADED

9. file type and size are validated

10. internal endpoints require internal service secret

11. presigned URLs are never logged

12. no raw file bytes stored in PostgreSQL

13. no cross-service database access

============================================================
32. PROCESSING STATE RULES
============================================================

Valid normal flow:

UPLOAD_PENDING
-> UPLOADED
-> PROCESSING
-> READY

Failure:

UPLOAD_PENDING -> FAILED
UPLOADED -> FAILED
PROCESSING -> FAILED

Deletion:

UPLOAD_PENDING -> DELETED
UPLOADED -> DELETED
PROCESSING -> DELETED
READY -> DELETED
FAILED -> DELETED

DELETED is terminal.

Do not allow:

DELETED -> READY

Use business-layer transition validation.

============================================================
33. CONCURRENT COMPLETE-UPLOAD
============================================================

Two clients may call complete-upload simultaneously.

Do not emit duplicate DOCUMENT_UPLOADED events.

Use transaction and state check.

Only transition:

UPLOAD_PENDING -> UPLOADED

once.

If already UPLOADED/PROCESSING/READY:

return idempotent success with current document.

Do not create another outbox event.

============================================================
34. OUTBOX EVENT IDEMPOTENCY
============================================================

Each upload/delete transition produces one eventId.

Do not generate a new uploaded event every time endpoint is retried.

Persist outbox event atomically with the transition.

============================================================
35. TESTING REQUIREMENTS
============================================================

Add meaningful tests.

At minimum:

1. unauthenticated upload intent -> 401

2. non-member -> 404

3. VIEWER cannot upload -> 403

4. ENGINEER can create upload intent

5. serviceId from another organization rejected

6. unsupported file type rejected

7. oversized document rejected

8. storageKey cannot be supplied by client

9. upload intent leaves status UPLOAD_PENDING

10. complete-upload verifies object exists

11. missing object -> appropriate error and no UPLOADED transition

12. successful completion -> UPLOADED

13. DOCUMENT_UPLOADED outbox row created transactionally

14. repeated complete-upload does not duplicate outbox event

15. document list tenant isolation

16. document lookup tenant isolation

17. download URL only generated for allowed document

18. ENGINEER cannot delete another user's document

19. ADMIN can delete any org document

20. delete -> DELETED

21. DOCUMENT_DELETED outbox event created

22. DELETED cannot transition back to READY

23. internal processing endpoint without secret -> 401

24. UPLOADED -> PROCESSING works

25. PROCESSING -> READY works

26. failure path stores safe message

27. stale upload reconciliation works

28. outbox publisher retries Kafka failure

29. presigned URL never appears in logs

============================================================
36. DOCKER SETUP
============================================================

Add:

document-service

Port:

4010

Database:

sentinel_document

Create PostgreSQL init script:

infrastructure/postgres-init/<next-number>-create-document-db.sh

Add MinIO:

minio
ports:
  9000
  9001

Add minio-init.

Environment example:

PORT=4010

DATABASE_URL=postgresql://...

JWT_ACCESS_SECRET=...

ORGANIZATION_SERVICE_URL=http://organization-service:4002

CATALOG_SERVICE_URL=http://service-catalog-service:4003

INTERNAL_SERVICE_SECRET=...

KAFKA_BROKERS=kafka:9092

KAFKA_CLIENT_ID=sentinel-document-service

S3_REGION=us-east-1

S3_BUCKET=sentinel-documents

S3_ENDPOINT=http://minio:9000

S3_ACCESS_KEY_ID=minioadmin

S3_SECRET_ACCESS_KEY=minioadmin

S3_FORCE_PATH_STYLE=true

MAX_DOCUMENT_SIZE_MB=25

UPLOAD_URL_EXPIRES_SECONDS=900

DOWNLOAD_URL_EXPIRES_SECONDS=600

OUTBOX_POLL_INTERVAL_MS=1000

NODE_ENV=development

Do not use weak production credentials.

These are local-development examples only.

============================================================
37. UPDATE KAFKA TOPICS
============================================================

Add:

sentinel.documents.uploaded.v1
sentinel.documents.deleted.v1

Use versioned topic names.

Local:

3 partitions where appropriate
replication factor 1

============================================================
38. MANUAL END-TO-END DEMO
============================================================

README must demonstrate:

1. login as Engineer/Owner

2. create organization

3. optionally register payment-service

4. request upload intent:

POST
/api/documents/organizations/ORG_ID/documents/upload-intent

5. receive presigned PUT URL

6. upload actual PDF with curl:

curl -X PUT "<PRESIGNED_URL>" \
  -H "Content-Type: application/pdf" \
  --upload-file ./payment-runbook.pdf

7. call:

complete-upload

8. fetch document

Expected:

status = UPLOADED

9. inspect Kafka topic:

sentinel.documents.uploaded.v1

Verify DOCUMENT_UPLOADED event exists

10. request download URL

11. download document using presigned GET URL

12. delete document

13. verify metadata:

status = DELETED

14. inspect:

sentinel.documents.deleted.v1

============================================================
39. SECURITY DEMO
============================================================

README should demonstrate:

1. User A in Org A uploads document

2. User B from Org B obtains/guesses documentId

3. User B requests:

GET /organizations/ORG_B/documents/DOCUMENT_A_ID

Expected:

404

4. VIEWER tries upload intent

Expected:

403

5. Attempt unsupported .exe upload

Expected:

400

============================================================
40. ARCHITECTURAL RULES
============================================================

Do NOT violate these:

1. Document Service owns document metadata.

2. S3/MinIO owns file bytes.

3. PostgreSQL does not store documents as blobs.

4. Browser/client uploads directly to object storage using presigned URL.

5. Document Service verifies upload before marking UPLOADED.

6. Phase 10 does not parse/chunk/embed documents.

7. Phase 11 consumes DOCUMENT_UPLOADED asynchronously.

8. Object keys are generated server-side.

9. Bucket is private.

10. Tenant membership is verified on every human route.

11. Service references are verified through Service Catalog.

12. Internal workers never access Document DB directly.

13. Upload/delete processing events use transactional outbox.

14. Deletion is soft in metadata.

15. No AI/RAG querying yet.

16. API Gateway contains no business logic.

============================================================
41. PREPARE FOR PHASE 11
============================================================

Phase 11 is Document Worker + RAG ingestion.

It will consume:

sentinel.documents.uploaded.v1

Then:

1. download the object
2. parse document
3. normalize text
4. chunk text
5. generate embeddings
6. store chunks + vectors
7. mark Document READY

If parsing/embedding fails:

mark Document FAILED

It will also consume:

sentinel.documents.deleted.v1

to remove indexed chunks/vectors.

Therefore the uploaded/deleted event contracts must be stable and versioned.

============================================================
42. DELIVERABLE
============================================================

Give me:

1. full document-service folder structure

2. every new file with complete code

3. Prisma schema

4. document lifecycle business logic

5. upload-intent endpoint

6. complete-upload endpoint

7. list/get/update/delete endpoints

8. download URL endpoint

9. JWT + tenant middleware

10. Service Catalog validation client

11. StorageProvider abstraction

12. S3StorageProvider implementation

13. MinIO-compatible configuration

14. transactional outbox

15. Kafka outbox publisher

16. internal processing-state APIs

17. stale-upload reconciliation

18. health/readiness endpoints

19. tests

20. Dockerfile

21. .env.example

22. PostgreSQL init script

23. MinIO docker-compose setup

24. MinIO bucket-init setup

25. Kafka topic-init changes

26. exact docker-compose modifications

27. exact API Gateway modifications

28. README upload/download/delete demo

29. tenant-isolation/security demo

Clearly mark every change as:

NEW FILE

or

MODIFY EXISTING FILE

Do not rewrite unrelated Phase 1–9 services.

If the repository differs slightly from the assumptions above, adapt minimally
while preserving the established architecture.

Ask clarifying questions only if something is genuinely impossible to infer.
Otherwise make a reasonable engineering assumption, state it, and continue.

```