# Implementation Plan: Mechanics Directory & Listing-Based Discovery

**Branch**: `003-mechanics-discovery` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-mechanics-discovery/spec.md`

## Summary

Add a mechanic resource (profile + optional garage images) to the existing AutoSouk REST API. Mechanics (users with the existing `mechanic` role) create and maintain exactly one profile with a physical location (city, address, latitude/longitude), optional description/contact/price, and zero-or-more garage images. Buyers viewing an approved listing can retrieve the active mechanics located in the listing's city — derived automatically from the listing's car — including coordinates and image data for a future list/map UI. Public retrieval is limited to active mechanics; mechanics may only modify their own profile and images. The implementation reuses the existing layered `routes → services → db` structure, Zod validation, role middleware, Drizzle/Postgres schema conventions, and the existing Minio presigned-URL upload flow — no new frontend, storage system, payments, ratings, or radius/distance search.

## Technical Context

**Language/Version**: TypeScript (ES2016 target, CommonJS) on Node.js, matching existing `tsconfig.json`

**Primary Dependencies**: Express 5, Drizzle ORM (`drizzle-orm`, `drizzle-kit`), Zod, `minio` client, `jsonwebtoken`, `pg`

**Storage**: PostgreSQL via Drizzle ORM (existing `cities`, `users`, `roles`, `listings`, `cars`, `car_media` tables); object storage via the existing self-hosted Minio instance

**Testing**: Jest + `ts-jest` + Supertest against a real Postgres test database (`docker-compose-test.yml`), migrated and seeded per `src/test/setup.ts`

**Target Platform**: Linux server (Dockerized Node.js REST API)

**Project Type**: Single backend REST API project (no frontend in this repo's scope for this feature)

**Performance Goals**: No new performance targets beyond existing API conventions; discovery query is a single indexed city-match lookup, not a full scan

**Constraints**: No radius/distance search, no payments, no booking/inspection workflow, no new ratings system, no separate file-storage mechanism, mechanics must only modify their own data

**Scale/Scope**: One new core resource (mechanic profile) + one dependent resource (garage images), one cross-domain discovery endpoint, on top of the existing 6 API modules

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Strict TypeScript and Focused Design**: New code lives in a dedicated `src/api/mechanics` module (routes/services/db/schema separated by responsibility); no `any`; reuses existing `AuthenticatedRole`/error/validation types. **PASS**.
- **II. Layered Request and Service Architecture**: Mechanics routes handle HTTP/validation only, services hold business rules (ownership checks, city derivation, active-status filtering), `db.ts` owns Drizzle queries — mirroring `listings`/`favorite_listings`. Errors propagate to the existing global error handler. **PASS**.
- **III. Secure, Validated API Contracts**: All inputs (profile body, garage image metadata, path params) validated with Zod; every route declares its auth/role requirement; discovery and public profile responses are paginated/bounded and exclude inactive mechanics; no secrets or raw DB errors leave the API. **PASS**.
- **IV. Type-Safe and Safe-to-Evolve Data**: New `mechanics` and `mechanic_garage_images` tables use integer identity PKs, required FKs (`user_id` unique, `city_id`), NOT NULL on required business fields, CHECK constraints on latitude/longitude ranges, and indexes on `city_id`/`mechanic_id`/`user_id`. Delivered as a reviewed Drizzle migration. **PASS**.
- **V. Observable, Tested, and Reproducible Delivery**: Each user story gets focused Jest/Supertest tests covering authorization, validation, active/inactive filtering, and empty-result edge cases, following the existing `__test__` per-module convention. **PASS**.

No violations identified; Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-mechanics-discovery/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md         # Phase 1 output (/speckit.plan command)
├── quickstart.md         # Phase 1 output (/speckit.plan command)
├── contracts/            # Phase 1 output (/speckit.plan command)
│   └── mechanics-api.md
└── tasks.md              # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── db/
│   └── schema/
│       ├── mechanic.ts               # NEW: mechanics table + relations
│       ├── mechanic_garage_image.ts   # NEW: mechanic_garage_images table + relations
│       ├── user.ts                   # UPDATED: add mechanic relation
│       ├── city.ts                   # UPDATED: add mechanics relation
│       └── index.ts                  # UPDATED: register new schema modules
├── middlewares/
│   └── is_mechanic.ts                # NEW: mirrors is_seller.ts / is_buyer.ts
├── api/
│   ├── mechanics/                    # NEW module
│   │   ├── request_schema.ts
│   │   ├── db.ts
│   │   ├── services.ts
│   │   ├── routes.ts
│   │   └── __test__/
│   └── listings/
│       ├── routes.ts                 # UPDATED: add GET /:id/mechanics
│       ├── services.ts               # UPDATED: call mechanics discovery service
│       └── __test__/                 # UPDATED: discovery route tests
├── utils/
│   └── constants.ts                  # UPDATED: add mechanicsBucketName
├── index.ts                          # UPDATED: createBucket(mechanicsBucketName)
└── routes.ts                         # UPDATED: mount mechanicsRouter at /api/mechanics

drizzle/
└── 0019_*.sql                        # NEW: generated migration for mechanics tables
```

**Structure Decision**: This is a single existing Express/TypeScript REST API (no frontend in-repo). The feature adds one new self-contained module (`src/api/mechanics`) following the exact `request_schema.ts` / `db.ts` / `services.ts` / `routes.ts` / `__test__/` layout already used by `favorite_listings` and `listings`, plus two new Drizzle schema files and one new role middleware. The listing-to-mechanics discovery endpoint is exposed as a sub-route of the existing `listingRouter` (`GET /api/listings/:id/mechanics`), calling into the new mechanics service, matching the existing `POST /:id/car` sub-resource pattern.

## Complexity Tracking

_No Constitution Check violations — table intentionally left empty._
