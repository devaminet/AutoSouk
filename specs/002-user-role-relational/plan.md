# Implementation Plan: Relational User Roles

**Branch**: `002-user-role-relational` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-user-role-relational/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command; its definition describes the execution workflow.

## Summary

Replace the inline users role value with a normalized `roles` reference table while preserving the existing role-name behavior exposed by authentication, JWT claims, current-user middleware, and authorization middleware. Add a reviewed migration that seeds the four supported roles, validates all legacy values before enforcing the foreign key, and aborts with actionable invalid-user information rather than auto-mapping unsafe data. Update the seed runner, auth data-access joins, fixtures, and role-sensitive tests, then validate migration idempotence and the complete test suite.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.8, Node.js, strict compiler settings

**Primary Dependencies**: Express 5, Drizzle ORM 0.45, Drizzle Kit 0.31, PostgreSQL driver `pg`, Zod, Jest/ts-jest

**Storage**: PostgreSQL; Drizzle schema under `src/db/schema`, SQL migrations under `drizzle`

**Testing**: Jest with `src/test/setup.ts`, Supertest HTTP integration tests, Drizzle migration against the Docker Compose test database

**Target Platform**: Linux Node.js server and PostgreSQL Docker test environment

**Project Type**: Express web service with PostgreSQL persistence

**Performance Goals**: Preserve existing authentication and protected-route behavior without an avoidable extra query per request; role lookup should be part of the existing user query or a bounded service lookup.

**Constraints**: Required non-null foreign key; unique role names; idempotent seed; migration must validate legacy values before changing users and must not silently grant a fallback role; public role-name response and JWT contracts remain compatible.

**Scale/Scope**: One shared role table and all current user/auth/test references; no role-management API or new role types in this feature.

## Pre-Phase 0 Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Strict TypeScript and Focused Design**: PASS. Reuse inferred Drizzle types and small role lookup/seed functions; no new untyped boundary is planned.
- **II. Layered Request and Service Architecture**: PASS. Data-access modules own joins and role resolution; auth services retain token and response orchestration; middleware retains authorization enforcement.
- **III. Secure, Validated API Contracts**: PASS. Registration continues to validate the public role input with Zod; unknown/non-existent role references are rejected before user creation; JWT claims continue to carry only the role name needed by current authorization.
- **IV. Type-Safe and Safe-to-Evolve Data**: PASS. Add primary key, unique role name, non-null FK, FK index, reviewed migration, transactional legacy validation, and a recovery note.
- **V. Observable, Tested, and Reproducible Delivery**: PASS. Add focused relationship/seed/migration tests and preserve auth/authorization integration coverage; validate with typecheck, migration, and Jest.

No constitution violations or complexity exceptions are required before research.

## Project Structure

### Documentation (this feature)

```text
specs/002-user-role-relational/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/
│   └── auth-role-contract.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/
├── api/auth/
│   ├── db.ts
│   ├── services.ts
│   ├── request_schema.ts
│   └── __test__/
├── db/
│   ├── schema/
│   │   ├── roles.ts
│   │   ├── user.ts
│   │   └── index.ts
│   └── seeds/
│       ├── roles_seed.ts
│       └── index.ts
├── middlewares/
│   ├── current_user.ts
│   ├── is_admin.ts
│   ├── is_buyer.ts
│   └── is_seller.ts
├── test/
│   ├── helpers.ts
│   └── setup.ts
└── utils/functions.ts

drizzle/
└── 0018_create_roles_table.sql
```

**Structure Decision**: Keep the existing single Express/TypeScript service structure. Add the role schema beside the existing user schema, include it in the shared Drizzle schema object, put idempotent role data seeding beside the existing reference-data seeds, and keep migration SQL in the sequential `drizzle/` directory. No new application layer or role-management endpoint is needed.

## Phase 0: Research Summary

Research decisions are recorded in `specs/002-user-role-relational/research.md` ([research.md](./research.md)):

1. Use a lookup table, not a new PostgreSQL enum, because roles are authorization data and the feature requires relational navigation and future-safe role evolution.
2. Preserve public role names while resolving them through a join in the auth data-access boundary.
3. Seed roles before other seeds and make the seed operation conflict-safe by unique name.
4. Use a reviewed, transactional migration for legacy users; validate unsupported or missing values and abort before enforcing `NOT NULL` and the foreign key.
5. Add an index on `users.role_id` because PostgreSQL does not create FK indexes automatically and auth/role joins use that column.

## Phase 1: Design Summary

- `specs/002-user-role-relational/data-model.md` ([data-model.md](./data-model.md)) defines the `roles` and `users.role_id` schema, relationships, invariants, indexes, and migration state transition.
- `specs/002-user-role-relational/contracts/auth-role-contract.md` ([contracts/auth-role-contract.md](./contracts/auth-role-contract.md)) preserves registration input and authenticated response/JWT role-name behavior while documenting the persistence change.
- `specs/002-user-role-relational/quickstart.md` ([quickstart.md](./quickstart.md)) provides migration, seed, typecheck, and test validation scenarios.

## Implementation Order

1. Add the role schema, relations, schema export, and migration/seed design.
2. Generate and manually review the next Drizzle migration, including legacy-role validation, role backfill, FK/index creation, and removal of the inline role column.
3. Add idempotent role seeding and make the seed runner await roles before dependent reference data.
4. Update auth data access and services to resolve role names through the relation while preserving API/JWT contracts.
5. Update current-user typing, authorization middleware dependencies, serialization, test helpers, setup fixtures, and affected tests.
6. Run focused tests, migration/seed checks, typecheck, and the full Jest suite; resolve only regressions caused by this feature.

## Post-Phase 1 Constitution Check

- **I. Strict TypeScript and Focused Design**: PASS. The design uses inferred table types and keeps role resolution in data access rather than duplicating role logic.
- **II. Layered Request and Service Architecture**: PASS. Joins and role ID resolution remain in `src/api/auth/db.ts`; services and middleware retain their existing responsibilities.
- **III. Secure, Validated API Contracts**: PASS. Unsupported registration roles remain rejected by Zod, missing joins fail closed, and no database error is exposed directly.
- **IV. Type-Safe and Safe-to-Evolve Data**: PASS. The design includes required constraints, FK indexing, reviewed migration ordering, transactional validation, and recovery guidance.
- **V. Observable, Tested, and Reproducible Delivery**: PASS. The quickstart and task sequence cover clean migration, repeated seeding, role authorization, fixtures, typecheck, and full tests.

No violations or complexity exceptions were introduced by the design.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No entries. Constitution gates pass without exceptions.
