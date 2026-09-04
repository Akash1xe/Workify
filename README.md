# SentinelAI

SentinelAI is a distributed incident-management and observability platform for backend engineering teams. It ingests application telemetry, detects production failures, creates incidents, supports real-time collaboration, and uses an AI/RAG investigator to propose evidence-backed root causes and remediation steps.

The system is designed as a focused set of microservices. Services communicate through REST when an immediate response is required and through Kafka for high-volume or asynchronous workflows. Each service owns its own database.

## Planned architecture

- API Gateway
- Auth Service
- Organization Service
- Service Catalog Service
- Incident Service
- Real-time Layer
- Ingestion Service
- Telemetry Worker
- Alert Service
- Notification Service
- Document Service and Worker
- AI/RAG Investigator
- GitHub Integration
- Observability and AWS deployment

## Current repository contents

The `docs/phases` directory contains the supplied implementation specifications for Phases 3–14. Application source code will be added phase by phase and verified before each push.

## Implementation status

According to the project brief, Phases 1–3 have already been built. Their source code was not present in the workspace used to initialize this repository, so it has not yet been committed here.

