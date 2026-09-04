# Phase 2 — Organization Service

## Scope

Add the multi-tenant Organization Service using Node.js, Express, TypeScript, Prisma, and its own PostgreSQL database.

## Core requirements

- Organizations, members, invitations, and roles: `OWNER`, `ADMIN`, `ENGINEER`, `VIEWER`.
- Verify Auth Service access JWTs using the shared access-token secret; do not implement a second login system.
- Every organization-scoped route must verify real membership.
- Return `404`, not `403`, when a caller is not a member so organization existence is not disclosed.
- Enforce role authorization for organization updates, deletion, member management, and invitations.
- Prevent unsafe owner removal and direct owner-role replacement.
- Accept invitations only for the authenticated user's matching email.
- Keep the Organization Service database separate; user IDs are plain cross-service references, not foreign keys.
- Proxy `/api/organizations/*` through the API Gateway.

The full implementation will be added after Phase 1 is verified.

