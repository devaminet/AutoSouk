# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AutoSouk: Morocco-focused marketplace for cars and independent mechanic inspections. Backend only in this repo (`src/`): Node, Express, TypeScript, PostgreSQL, Drizzle ORM. A separate React/TypeScript client consumes this API (see AGENTS.md for the full product/role model).

## Commands

```bash
npm run dev              # tsx watch dev server (reads .env via dotenv)
npm run start:build      # tsc compile to dist/
npm run start:copy       # copy non-ts assets (json/html/css/images/ejs) into dist/
npm run start             # build + copy + run compiled dist/index.js
npm run db:migrate        # apply drizzle migrations (drizzle-kit migrate)
npx drizzle-kit generate  # generate a migration after editing src/db/schema/*.ts
npm test                  # starts docker-compose-test.yml postgres, runs jest --runInBand --watchAll
npm run test-dev          # run jest against an already-running test DB (no docker compose)
```

Run a single test file: `npx jest src/api/mechanics/__test__/get_mechanic.test.ts`
Run a single test by name: `npx jest -t "some test name"`

Tests need Postgres reachable at `TEST_DB_CONNECTION_STRING` (see `.env-sample`); `npm test` provisions it via `docker-compose-test.yml` (port 5431). `src/test/setup.ts` drops and recreates the `public` schema, re-runs all drizzle migrations, and reseeds before the suite; `beforeEach` inserts a fixed admin user, `afterEach` truncates domain tables and resets mocks — write tests assuming this per-test-clean state, not global fixtures.

The dev stack (`docker-compose.yml`) also runs MinIO for object storage (car/mechanic images), started separately from Postgres; `src/index.ts` creates the required buckets on boot and runs DB seeds before listening.

## Architecture

**Request flow is a strict pipeline, always in this order:** `routes.ts` (Zod-validate the input, call middleware) -> `services.ts` (business rules, framework-agnostic) -> `db.ts` (Drizzle queries only). Never query the database from a route or put Drizzle calls in a service file — follow the existing `src/api/<feature>/{routes,services,db,request_schema}.ts` layout for new features.

- **Routes** (`src/api/<feature>/routes.ts`): parse `req.body`/`req.params`/`req.query` with a Zod schema from the sibling `request_schema.ts`, `throw new RequestValidationError(...)` on failure, otherwise delegate to a service function and set the response status/JSON. Auth/role checks are middleware in the route chain, not conditionals inside handlers.
- **Services** (`services.ts`): own domain logic — existence checks, ownership checks, presigned URL generation for MinIO-backed images, computing pagination metadata. Throw the typed errors in `src/errors/` (`NotFoundError`, `BadRequestError`, `NotAuthorizedError`, `InternalServerError`, etc.) — never send a raw `res.status(...)` from here.
- **Data access** (`db.ts`): only place Drizzle query/insert/update/delete calls live. Functions are named `find*`/`insert*`/`update*`/`delete*` and return `null` (not throw) when a row isn't found — the calling service decides whether that's a 404.
- **Errors**: every thrown error extends `CustomError` (`src/errors/custom_error.ts`) and implements `serializeError()`; `src/middlewares/error_handler.ts` is the single place that turns errors into HTTP responses (subclass errors -> their status code; anything else -> 500 with a generic message, never leaking internals).
- **Auth**: `current_user` middleware decodes a Bearer JWT if present and attaches `req.currentUser` (optional — doesn't reject unauthenticated requests). `is_authenticated` requires `req.currentUser` to exist. Role middlewares (`is_buyer`, `is_seller`, `is_mechanic`, `is_admin`) gate role-specific routes. Role checks are always server-side; the client's role toggle is never trusted as an authorization boundary.
- **Schema/DB**: all tables live under `src/db/schema/*.ts` and are aggregated into one `schema` object in `src/db/schema/index.ts`, which `src/db/index.ts` passes to `drizzle()` — enabling the relational query API (`db.query.<table>.findFirst/findMany` with `with: {...}`) used throughout `db.ts` files. Add new tables there and re-export from the index, then generate a migration with drizzle-kit (output goes to `drizzle/`).
- **File storage**: `src/file_storage/minio.ts` plus helpers in `src/utils/functions.ts` (`generatePresignedUrl(s)`, `generateGetPresignedUrl(s)`) handle upload/download URL signing against MinIO buckets defined in `src/utils/constants.ts` (`carBucketName`, `mechanicsBucketName`). Services store filenames/links in Postgres and swap them for signed URLs on read.
- **Routing table**: new feature routers get mounted in `src/routes.ts` under `/api/<feature>`; `src/app.ts` wires global middleware order (json body parsing -> cookie-session -> currentUser -> feature router -> 404 catch-all -> error handler) — this order matters, don't reorder it casually.
- **API docs**: OpenAPI spec is generated by `swagger-jsdoc` from `@openapi` JSDoc blocks in `src/api/<feature>/routes.ts`, served at `/api-docs` via `swagger-ui-express` (`src/swagger.ts`, mounted in `src/app.ts`). After adding, changing, or removing any route, add/update its `@openapi` JSDoc block: method, path, tags, `security` (if behind `isAuthenticated`), request body/params/query schema (mirror the sibling `request_schema.ts` Zod shape), and response codes actually used in the handler.

## Project rules

- Strict TypeScript everywhere; no `any` — use `unknown` or a real type. Small, single-responsibility functions.
- Validate every external input (body, params, query, env, third-party responses) with Zod at the boundary where it enters.
- `.agents/rules/` and `AGENTS.md` are the authoritative day-to-day conventions; `.specify/memory/constitution.md` is the longer-form ratified constitution behind them — both agree on the layered architecture and validation rules above.
- Spec-driven feature work lives under `specs/<NNN-feature-name>/`, following `.specify/templates/` (spec, plan, tasks, checklist templates) — check there for in-flight feature specs before starting related work.

## Tech Stack

- Frontend: React with typescript

- Backend / Database: Node, Express, Typescript, Postgres, Drizzle ORM

## Core Roles & User Flows

The app supports three main perspectives, selectable via a header toggle:

- **Buyer (Role: buyer)**

Goal: Browse available cars and ensure they are reliable before purchasing.

Capabilities:

- View all cars with.
- Filter cars.
- Favor cars
- Initiate a "Request Inspection" action on available cars.
- View the detailed results of any completed inspection reports attached to a car.

- **Seller (Role: seller)**

Goal: Post cars for sale and manage their listings.

Capabilities:

- Post a new car (Make, Model, Year, Price, City, Description).
- View their own active listings (filtered by sellerId).
- Delete their own listings.
- View inspection reports completed on their cars.

- **Mechanic (Role: mechanic)**

Goal: Fulfill inspection requests to build trust in the marketplace.

Capabilities:

- View a queue of all cars with a status of pending_inspection.
- "Pick up" a request by starting an inspection report.
- Submit a report containing a summary and detailed findings.
