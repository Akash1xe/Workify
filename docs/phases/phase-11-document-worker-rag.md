## PHASE 11 PROMPT — Document Worker + RAG Ingestion

```text
I am building "SentinelAI" — a distributed incident-management and observability
platform for backend engineering teams.

SentinelAI lets companies connect backend services to it. Those services stream
logs, metrics, and events into SentinelAI. The platform detects failures,
automatically creates incidents, supports real-time collaboration, and later uses
an AI+RAG investigator to correlate telemetry, deployments, runbooks,
architecture docs, postmortems, and similar past incidents.

The architecture is intentionally split into focused microservices.

Communication model:

- synchronous REST for immediate cross-service validation
- Kafka for durable asynchronous/high-volume events
- Redis Pub/Sub for ephemeral real-time UI updates
- background workers for asynchronous processing

Each service owns its own data.

No service may directly query another service's database.

============================================================
WHAT ALREADY EXISTS — PHASES 1–10
============================================================

1. auth-service — port 4001
   - authentication
   - JWT/session security

2. organization-service — port 4002
   - organizations
   - members
   - roles
   - tenant membership authority

3. service-catalog-service — port 4003
   - registered backend services
   - service API keys
   - service metadata/health

4. incident-service — port 4004
   - incidents
   - lifecycle
   - comments
   - assignment
   - timeline
   - manual + alert-created incidents

5. realtime-service — port 4005
   - Socket.IO
   - Redis Pub/Sub
   - realtime incident collaboration
   - per-user notification rooms

6. ingestion-service — port 4006
   - accepts logs/metrics/events
   - authenticates backend services
   - publishes canonical telemetry to Kafka

7. telemetry-worker — port 4007
   - consumes telemetry
   - persists telemetry
   - retries
   - DLQ
   - idempotency
   - query APIs

8. alert-service — port 4008
   - alert rules
   - alert evaluation
   - automatic incident creation
   - transactional outbox

9. notification-service — port 4009
   - in-app notifications
   - email
   - queue-based delivery
   - preferences

10. document-service — port 4010
   - document metadata
   - presigned upload/download URLs
   - private S3/MinIO object storage
   - document lifecycle:
       UPLOAD_PENDING
       UPLOADED
       PROCESSING
       READY
       FAILED
       DELETED
   - publishes:

       sentinel.documents.uploaded.v1
       sentinel.documents.deleted.v1

Example uploaded event:

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
  "fileName": "payment-runbook.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 1048576,
  "occurredAt": "..."
}

Document Service also exposes internal endpoints protected by:

x-internal-service-secret

including:

POST /internal/documents/:documentId/processing

POST /internal/documents/:documentId/ready

POST /internal/documents/:documentId/failed

GET /internal/documents/:documentId

============================================================
YOUR TASK — PHASE 11: DOCUMENT WORKER + RAG INGESTION
============================================================

Build the asynchronous document-processing and embedding pipeline.

This phase turns uploaded operational documents into searchable knowledge.

Flow:

DOCUMENT_UPLOADED Kafka event
        |
        v
Document Worker
        |
        +--> mark document PROCESSING
        |
        +--> download original object from S3/MinIO
        |
        +--> parse file
        |
        +--> normalize extracted text
        |
        +--> chunk text
        |
        +--> generate embeddings
        |
        +--> store chunks + pgvector embeddings
        |
        +--> mark document READY

On failure:

mark document FAILED.

Also consume:

DOCUMENT_DELETED

and remove all chunks/vectors for that document.

============================================================
1. TECH STACK
============================================================

This is the first Python service in SentinelAI.

Use:

- Python 3.12
- FastAPI only for health/internal debugging endpoints
- SQLAlchemy 2.x
- asyncpg or psycopg
- PostgreSQL
- pgvector
- Kafka client suitable for Python
- Pydantic v2
- boto3
- document parsing libraries
- embedding provider abstraction

Recommended Kafka client:

confluent-kafka-python

or aiokafka

Choose one and document the reason.

Preferred project directory:

services/rag-ingestion-service/

Port:

4011

Database:

sentinel_rag

This service owns:

- document chunks
- embeddings
- RAG ingestion state/idempotency

It does NOT own original Document metadata.

============================================================
2. POSTGRES + PGVECTOR
============================================================

Create database:

sentinel_rag

Enable extension:

vector

PostgreSQL init should include:

CREATE EXTENSION IF NOT EXISTS vector;

Do not use a separate vector database in this phase.

Use:

PostgreSQL + pgvector

Reason:

simpler architecture and relational metadata + vectors stay together.

============================================================
3. DATA MODEL
============================================================

Use SQLAlchemy models.

------------------------------------------------------------
DocumentIndexState
------------------------------------------------------------

Tracks indexing idempotency.

Fields:

- id UUID
- document_id string unique
- organization_id string
- service_id optional string
- source_event_id string
- status enum:
    PROCESSING
    READY
    FAILED
    DELETED
- checksum optional string
- chunk_count int default 0
- embedding_model string optional
- started_at
- completed_at optional
- error_code optional
- error_message optional
- created_at
- updated_at

------------------------------------------------------------
DocumentChunk
------------------------------------------------------------

Fields:

- id UUID
- document_id string
- organization_id string
- service_id optional string
- document_type string
- chunk_index int
- content text
- token_count optional int
- char_count int
- metadata JSONB
- embedding vector
- created_at

Unique:

(document_id, chunk_index)

Indexes:

- document_id
- organization_id
- service_id
- document_type
- (organization_id, document_id)

Vector dimension must match chosen embedding model.

Do not hard-code dimension in many places.

Centralize it in config.

============================================================
4. TENANT ISOLATION IN VECTOR DATA
============================================================

Every chunk MUST contain:

organization_id

This is mandatory.

Later semantic searches must ALWAYS filter by organization_id before returning
results.

service_id should also be stored where document is service-specific.

Never rely only on vector similarity without tenant filter.

This is security-critical.

============================================================
5. EMBEDDING PROVIDER ABSTRACTION
============================================================

Do NOT call an embedding vendor directly throughout business logic.

Create interface:

EmbeddingProvider

with something like:

embed_texts(texts: list[str]) -> list[list[float]]

Expose:

model_name
dimension

Provide at least:

1. Local/mock deterministic embedding provider for tests/local smoke testing

2. Real provider adapter

Reasonable real provider choices:
- OpenAI embeddings
- another configurable embedding API
- local sentence-transformers if desired

For this project, structure the service so provider is selected via env.

Example:

EMBEDDING_PROVIDER=openai

or:

EMBEDDING_PROVIDER=local

Do not hard-code API keys.

============================================================
6. PARSER ABSTRACTION
============================================================

Create:

DocumentParser

Support Phase 10 file types:

- PDF
- Markdown
- plain text
- DOCX

Recommended libraries:

PDF:
- pypdf

DOCX:
- python-docx

Markdown/text:
- standard text reading

Do NOT use OCR by default.

If PDF has no extractable text:

fail with a clear error such as:

DOCUMENT_TEXT_EXTRACTION_EMPTY

OCR can be a future enhancement.

============================================================
7. DOWNLOAD ORIGINAL FILE
============================================================

Use boto3 / S3-compatible configuration.

Document event contains:

storageBucket
storageKey

Download using service credentials.

Do not request a presigned download URL from Document Service unless architecture
requires it.

Worker is trusted backend infrastructure and may use S3 credentials/IAM role.

Support MinIO locally.

Environment:

S3_REGION
S3_ENDPOINT optional
S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY
S3_FORCE_PATH_STYLE

Production should support IAM roles.

============================================================
8. TEMP FILE SAFETY
============================================================

If parser requires a local file:

use secure temporary directory/file.

Do not derive local filesystem path directly from client filename.

Delete temp file after processing.

Do not keep uploaded documents indefinitely on worker filesystem.

============================================================
9. TEXT NORMALIZATION
============================================================

After parsing:

normalize text conservatively.

Suggested:

- normalize line endings
- remove null bytes
- collapse excessive blank lines
- trim surrounding whitespace
- preserve headings where possible
- preserve code blocks where possible
- preserve lists reasonably

Do NOT aggressively rewrite technical content.

The RAG layer should retain original operational meaning.

============================================================
10. CHUNKING
============================================================

Implement deterministic chunking.

Preferred:

token-aware chunking

Target:

~500 tokens per chunk

Overlap:

~75 tokens

Configurable:

CHUNK_SIZE_TOKENS=500

CHUNK_OVERLAP_TOKENS=75

Do not chunk simply every N characters if a tokenizer is available.

Preserve useful metadata:

- chunkIndex
- approximate page number if available
- heading/section if available
- source fileName
- documentType
- serviceId
- documentId

If exact page metadata cannot be reliably extracted for all formats, use nullable
metadata.

============================================================
11. WHY OVERLAP EXISTS
============================================================

Document this:

Chunk overlap prevents important context at chunk boundaries from being split so
hard that retrieval loses meaning.

Do not use extreme overlap that duplicates most of the document.

============================================================
12. EMBEDDING BATCHES
============================================================

Do not send one embedding request per chunk when provider supports batching.

Use configurable batch size.

Example:

EMBEDDING_BATCH_SIZE=64

Flow:

chunks
-> batches
-> embeddings
-> database insert

Validate:

number of returned embeddings == number of chunks sent

Validate dimension.

============================================================
13. PROCESSING FLOW
============================================================

For DOCUMENT_UPLOADED:

1. validate Kafka event

2. idempotency check using documentId/eventId

3. fetch authoritative Document metadata using:

GET
${DOCUMENT_SERVICE_URL}/internal/documents/${documentId}

with:

x-internal-service-secret

and organizationId if required

4. ensure document isn't DELETED

5. call Document Service:

POST /internal/documents/:documentId/processing

6. create/update DocumentIndexState = PROCESSING

7. download object

8. optionally calculate SHA-256 checksum

9. parse text

10. reject empty extracted text

11. normalize text

12. chunk text

13. generate embeddings

14. persist chunks/embeddings transactionally

15. mark DocumentIndexState READY

16. call Document Service:

POST /internal/documents/:documentId/ready

17. commit Kafka handling

============================================================
14. DATABASE TRANSACTION FOR INDEX REPLACEMENT
============================================================

Chunk persistence should be atomic at document level.

Preferred:

within one DB transaction:

1. delete old chunks for document if reindexing is allowed

2. insert all new chunks

3. update DocumentIndexState READY

If transaction fails:

do not leave half-indexed document.

For very large documents, batch inserts may still happen inside a controlled
transaction.

Given Phase 10 file limit ~25 MB, choose a practical implementation.

============================================================
15. DOCUMENT SERVICE STATUS FAILURE
============================================================

There is a distributed boundary between RAG DB and Document Service.

Example:

chunks successfully stored
but Document Service /ready call fails.

Do NOT delete good embeddings solely because the HTTP call failed.

Persist READY locally.

Retry Document Service status synchronization.

Implement a reconciliation loop:

find local DocumentIndexState READY

and verify/sync Document Service status when needed.

Likewise for FAILED state updates.

============================================================
16. IDEMPOTENCY
============================================================

Kafka is at-least-once.

DOCUMENT_UPLOADED may arrive more than once.

Do not duplicate chunks.

Use:

document_id unique in DocumentIndexState

and:

(document_id, chunk_index) unique

If document already READY for same source_event_id/checksum:

treat duplicate as success.

If same document receives a legitimate new upload/version event later:

support reindexing deliberately.

Since Phase 10 currently models one object per document, assume repeated identical
event is duplicate.

Do not create duplicate rows.

============================================================
17. CHECKSUM
============================================================

Compute SHA-256 of downloaded object.

Store in:

DocumentIndexState.checksum

This gives future reindex logic a way to detect whether object bytes actually
changed.

Do not expose checksum as a security secret; it is integrity metadata.

============================================================
18. FAILURE HANDLING
============================================================

On permanent processing failure:

- mark local index state FAILED
- call Document Service /failed
- store only safe error code/message

Examples:

UNSUPPORTED_DOCUMENT_TYPE
DOCUMENT_DOWNLOAD_FAILED
DOCUMENT_TEXT_EXTRACTION_FAILED
DOCUMENT_TEXT_EXTRACTION_EMPTY
DOCUMENT_TOO_LARGE
EMBEDDING_PROVIDER_ERROR
EMBEDDING_DIMENSION_MISMATCH
VECTOR_PERSISTENCE_FAILED

Do not store raw stack traces in shared DB fields.

Log stack trace internally where appropriate.

============================================================
19. RETRIES
============================================================

Classify transient vs permanent failures.

Transient examples:

- S3 network timeout
- embedding provider 5xx
- temporary database outage
- Document Service temporary outage

Permanent examples:

- malformed document
- unsupported type
- empty text
- invalid Kafka schema

Use bounded retries with backoff for transient processing.

Avoid infinite hot loops.

============================================================
20. DOCUMENT INGESTION DLQ
============================================================

Create:

sentinel.documents.ingestion.dlq.v1

After max processing retries for a permanently/unrecoverably failed event:

publish DLQ message.

Payload:

{
  "failedAt": "...",
  "sourceTopic": "sentinel.documents.uploaded.v1",
  "partition": 0,
  "offset": "...",
  "documentId": "...",
  "organizationId": "...",
  "errorCode": "...",
  "errorMessage": "...",
  "attempts": 3
}

Avoid embedding raw document bytes in DLQ.

============================================================
21. DOCUMENT DELETION FLOW
============================================================

Consume:

sentinel.documents.deleted.v1

When received:

1. validate event

2. delete all DocumentChunk rows where:
   document_id = event.documentId
   AND organization_id = event.organizationId

3. mark DocumentIndexState DELETED

4. retain minimal index-state metadata for audit/idempotency

Do not keep embeddings after document deletion.

Deletion processing should be idempotent.

Repeated DOCUMENT_DELETED event:

success with zero additional side effects.

============================================================
22. DELETE VS IN-FLIGHT INGESTION RACE
============================================================

Critical scenario:

DOCUMENT_UPLOADED processing is running

then DOCUMENT_DELETED arrives.

Do not allow deleted document to end in READY with vectors remaining.

Use one of:

- per-document distributed lock
- DB advisory lock
- serialized processing keyed by documentId

Preferred:

PostgreSQL advisory lock or Redis lock keyed:

document-index:{documentId}

Inside critical flow, re-check authoritative Document status before final READY.

If Document Service says DELETED:

delete chunks
mark local state DELETED
do not call ready

============================================================
23. KAFKA CONSUMERS
============================================================

Consume:

sentinel.documents.uploaded.v1
sentinel.documents.deleted.v1

Consumer group:

sentinel-rag-ingestion-v1

Use same group ID across replicas.

Partitioning:

If Document Service controls event key, prefer:

key = documentId

for upload/delete events.

This helps preserve per-document ordering within a partition.

If current producer does not set key=documentId:

modify Document Service minimally to do so.

Clearly mark modification.

============================================================
24. HORIZONTAL SCALING
============================================================

Multiple RAG ingestion replicas should share:

groupId = sentinel-rag-ingestion-v1

Kafka distributes partitions.

Do not assign unique consumer group per worker.

Per-document idempotency/locking still required because retries/races can happen.

============================================================
25. VECTOR SEARCH INTERNAL API
============================================================

Phase 12 AI/RAG Service will need semantic retrieval.

Expose an INTERNAL search API now.

Do not expose directly through public API Gateway.

Endpoint:

POST /internal/search

Protected by:

x-internal-service-secret

Body:

{
  "organizationId": "...",
  "query": "database connection pool exhaustion",
  "serviceId": "optional",
  "documentTypes": ["RUNBOOK", "POSTMORTEM"],
  "limit": 8
}

Flow:

1. validate internal secret

2. embed query using same embedding provider/model

3. perform pgvector similarity search

4. MUST filter:

organization_id = organizationId

before returning results

5. optionally filter serviceId/document type

Return:

{
  "results": [
    {
      "chunkId": "...",
      "documentId": "...",
      "serviceId": "...",
      "documentType": "RUNBOOK",
      "content": "...",
      "score": 0.87,
      "metadata": {
        "chunkIndex": 4,
        "page": 3,
        "heading": "Database recovery"
      }
    }
  ]
}

============================================================
26. VECTOR SIMILARITY
============================================================

Choose and document one distance metric.

Preferred:

cosine similarity

or cosine distance converted to score.

Be mathematically consistent.

Do not label raw distance as similarity without transformation.

Example:

score = 1 - cosine_distance

depending on pgvector/operator semantics.

============================================================
27. SEARCH TENANT SAFETY
============================================================

This is CRITICAL.

Never do:

ORDER BY embedding distance
LIMIT 10

and filter organization afterward.

Tenant filter must be in SQL query.

Conceptually:

WHERE organization_id = :organizationId

before top-K result selection.

Otherwise another tenant's vectors could influence candidate selection.

============================================================
28. SEARCH LIMITS
============================================================

Validate:

limit default 8

max 25

query:
- non-empty
- reasonable max length

Do not allow unbounded retrieval.

============================================================
29. VECTOR INDEX
============================================================

Add an appropriate pgvector index once enough data exists.

For this project, either:

HNSW

or:

IVFFlat

Preferred:

HNSW

if supported by current pgvector version.

Document that small local datasets may still use sequential scans.

Create index compatible with chosen vector metric.

============================================================
30. INTERNAL DEBUG ENDPOINTS
============================================================

Optional but useful:

GET /internal/documents/:documentId/index-state

Protected by internal secret.

Return:

documentId
status
chunkCount
embeddingModel
checksum
errorCode
created/updated timestamps

Do NOT return embeddings themselves.

============================================================
31. HEALTH / READINESS
============================================================

GET /health

{
  "status": "ok",
  "service": "rag-ingestion-service"
}

GET /ready

Check:

- PostgreSQL
- Kafka
- embedding provider configuration
- S3 configuration/connectivity if practical

Return 503 when required dependency unavailable.

Do not perform expensive embedding call every readiness check.

============================================================
32. FASTAPI ROLE
============================================================

This service is primarily a worker.

FastAPI exists for:

- health/readiness
- internal vector search
- internal debugging/status

Do not turn it into the full AI investigator yet.

Phase 12 will own investigation orchestration.

============================================================
33. LOGGING
============================================================

Log:

- eventId
- documentId
- organizationId
- serviceId
- parser selected
- extracted text length
- chunk count
- embedding batch count
- processing duration
- failure code
- deletion processing

Do NOT log:

- full document text
- embeddings
- internal secret
- AWS secret key
- presigned URLs
- entire document contents

Operational documents may contain sensitive company data.

============================================================
34. CONFIGURATION
============================================================

Example environment variables:

PORT=4011

DATABASE_URL=postgresql+psycopg://...

DOCUMENT_SERVICE_URL=http://document-service:4010

INTERNAL_SERVICE_SECRET=...

KAFKA_BROKERS=kafka:9092

KAFKA_GROUP_ID=sentinel-rag-ingestion-v1

KAFKA_CLIENT_ID=sentinel-rag-ingestion-service

S3_REGION=us-east-1

S3_BUCKET=sentinel-documents

S3_ENDPOINT=http://minio:9000

S3_ACCESS_KEY_ID=minioadmin

S3_SECRET_ACCESS_KEY=minioadmin

S3_FORCE_PATH_STYLE=true

EMBEDDING_PROVIDER=local

EMBEDDING_MODEL=...

EMBEDDING_DIMENSION=...

EMBEDDING_BATCH_SIZE=64

CHUNK_SIZE_TOKENS=500

CHUNK_OVERLAP_TOKENS=75

MAX_PROCESSING_RETRIES=3

DOCUMENT_STATUS_RECONCILE_INTERVAL_SECONDS=30

NODE_ENV / APP_ENV=development

Use naming appropriate for Python config.

============================================================
35. DOCKER SETUP
============================================================

Add:

rag-ingestion-service

Port:

4011

Database:

sentinel_rag

Create PostgreSQL init script:

infrastructure/postgres-init/<next-number>-create-rag-db.sh

Must:

CREATE DATABASE sentinel_rag

and ensure pgvector extension can be enabled.

Important:

The current postgres:16-alpine image may not include pgvector.

Modify local PostgreSQL setup appropriately.

Preferred:

use a PostgreSQL image that already contains pgvector, such as a supported
pgvector PostgreSQL 16 image.

Do not manually compile pgvector on every container startup unless necessary.

Preserve all existing databases.

============================================================
36. PYTHON PROJECT STRUCTURE
============================================================

Suggested:

services/
  rag-ingestion-service/
    app/
      main.py

      api/
        health.py
        internal_search.py
        index_state.py

      config/
        settings.py

      db/
        base.py
        session.py
        models.py
        migrations/

      kafka/
        consumer.py
        producer.py
        schemas.py
        topics.py

      services/
        ingestion_service.py
        deletion_service.py
        chunking_service.py
        embedding_service.py
        search_service.py
        reconciliation_service.py

      parsers/
        base.py
        pdf_parser.py
        markdown_parser.py
        text_parser.py
        docx_parser.py
        factory.py

      providers/
        embeddings/
          base.py
          local_provider.py
          openai_provider.py
        storage/
          s3_provider.py

      clients/
        document_service_client.py

      repositories/
        document_chunk_repository.py
        index_state_repository.py

      schemas/
        events.py
        search.py

      utils/
        errors.py
        logging.py
        hashing.py
        locks.py

    tests/

    Dockerfile
    pyproject.toml
    .env.example

Use Alembic migrations if practical.

Unlike the earlier Prisma dev scaffolds, Python/SQLAlchemy service should have a
clean migration setup.

============================================================
37. LOCAL EMBEDDING PROVIDER
============================================================

Local development must not require paid API calls.

Provide a deterministic local/testing provider.

Two acceptable approaches:

A. sentence-transformers local model

or

B. deterministic mock/hash-based embeddings strictly for integration tests

Preferred:

support both:

EMBEDDING_PROVIDER=local-model

and:

EMBEDDING_PROVIDER=mock

Mock embeddings are only for tests.

For realistic local RAG behavior, use a small sentence-transformers model if
practical.

Document memory/download implications.

============================================================
38. OPENAI PROVIDER OPTIONAL REAL ADAPTER
============================================================

If implementing OpenAI embeddings:

use environment:

OPENAI_API_KEY

Do not hard-code key/model.

Do not require OpenAI to run tests.

Keep provider replaceable.

============================================================
39. MIGRATIONS
============================================================

Create tables and pgvector extension/migrations.

Do not rely solely on auto-create tables for production-style vector schema.

Provide exact migration instructions.

For Docker local dev, automated migration at startup is acceptable if made safe.

============================================================
40. TESTING REQUIREMENTS
============================================================

Add meaningful automated tests.

At minimum:

1. valid DOCUMENT_UPLOADED event starts processing

2. document marked PROCESSING through Document Service

3. PDF parser extracts text

4. Markdown parser works

5. text parser works

6. DOCX parser works

7. empty extracted document -> failure

8. deterministic chunking produces stable chunk indexes

9. overlap exists between adjacent chunks

10. embedding batches preserve input/output alignment

11. wrong embedding dimension rejected

12. chunks store organization_id

13. chunks store document_id

14. duplicate upload event does not duplicate chunks

15. repeated event with same eventId is idempotent

16. storage download transient failure retries

17. permanent parser failure moves to DLQ

18. successful indexing marks local state READY

19. successful indexing calls Document Service /ready

20. Document Service /ready temporary failure gets reconciled later

21. deletion removes all chunks

22. repeated deletion is idempotent

23. upload/delete race cannot leave vectors for DELETED document

24. internal search without secret -> 401

25. semantic search always filters organization

26. Org A search never returns Org B chunks

27. serviceId filter works

28. documentTypes filter works

29. search limit max enforced

30. no embeddings returned by debug endpoint

============================================================
41. MANUAL END-TO-END DEMO
============================================================

README must demonstrate:

1. start full stack

2. upload a runbook through Document Service

3. complete upload

4. inspect:

sentinel.documents.uploaded.v1

5. RAG ingestion worker consumes event

6. fetch Document metadata

Expected progression:

UPLOADED
-> PROCESSING
-> READY

7. inspect RAG DB chunk count

8. call:

POST /internal/search

with internal secret

Body:

{
  "organizationId": "...",
  "query": "how do we recover the payment database?",
  "limit": 5
}

9. verify relevant runbook chunks returned

10. upload a second document from another organization

11. repeat Org A search

Confirm:

Org B chunks never appear

12. delete original runbook

13. worker consumes DOCUMENT_DELETED

14. repeat search

Confirm:

deleted document chunks no longer appear

============================================================
42. RAG QUALITY DEMO
============================================================

Include a small sample runbook with sections such as:

- Symptoms
- Cause
- Recovery Steps
- Verification

Show how a query such as:

"payment API is returning DB connection errors"

retrieves the relevant Recovery/Cause chunk rather than arbitrary unrelated chunks.

This demonstrates why embeddings are being added.

============================================================
43. ARCHITECTURAL RULES
============================================================

Do NOT violate these:

1. Document Service owns document metadata.

2. RAG Ingestion Service owns chunks/embeddings.

3. Original file bytes remain in S3/MinIO.

4. RAG service never reads Document Service DB directly.

5. Document status updates happen through internal REST.

6. Kafka provides asynchronous document processing.

7. Processing must be idempotent.

8. Deleted documents must not remain searchable.

9. Every vector row stores organizationId.

10. Semantic queries MUST filter organizationId in SQL.

11. Do not expose embeddings to callers.

12. Do not log document contents.

13. Do not implement the AI investigator yet.

14. Do not query telemetry/incident systems yet.

15. Keep embedding provider replaceable.

16. Keep parser implementation replaceable.

17. API Gateway does not expose internal vector search.

============================================================
44. PREPARE FOR PHASE 12
============================================================

Phase 12 is the AI/RAG Investigator.

It will combine:

- Incident data
- recent logs
- recent metrics
- deployments
- RAG document search
- similar past incidents

and produce:

- probable root cause
- evidence
- citations
- confidence
- recommended next steps
- postmortem draft

Therefore this service's /internal/search response should return enough citation
metadata for the AI layer to reference exact sources.

Each result should include at least:

documentId
chunkId
chunkIndex
documentType
serviceId
content
score
metadata

Do not return only raw text with no source identity.

============================================================
45. DELIVERABLE
============================================================

Give me:

1. full Python service folder structure

2. every new file with complete code

3. SQLAlchemy models

4. pgvector setup

5. migrations

6. Kafka consumer

7. document event schemas

8. S3/MinIO downloader

9. parser abstraction

10. PDF parser

11. Markdown parser

12. text parser

13. DOCX parser

14. normalization logic

15. tokenizer-aware chunking

16. embedding provider abstraction

17. local/mock provider

18. real provider adapter

19. vector persistence

20. ingestion idempotency

21. deletion processing

22. upload/delete concurrency protection

23. retry + DLQ handling

24. Document Service client

25. status reconciliation worker

26. internal semantic search API

27. vector similarity implementation

28. tenant filtering

29. health/readiness endpoints

30. automated tests

31. Dockerfile

32. pyproject.toml

33. .env.example

34. PostgreSQL/pgvector Docker modifications

35. PostgreSQL init script

36. Kafka topic-init changes

37. any minimal Document Service change needed to publish documentId as Kafka key

38. exact docker-compose modifications

39. README end-to-end indexing/search/delete demo

40. tenant-isolation demo

41. RAG-quality demonstration

Clearly mark all output as:

NEW FILE

or

MODIFY EXISTING FILE

Do not rewrite unrelated Phase 1–10 services.

If the current repository differs slightly from these assumptions, adapt minimally
while preserving the established architecture.

Ask clarifying questions only if something is genuinely impossible to infer.
Otherwise make a reasonable engineering assumption, state it, and continue.

```