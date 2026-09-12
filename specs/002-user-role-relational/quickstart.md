# Quickstart: Relational User Roles

## Prerequisites

- Node.js and npm installed.
- Dependencies installed with `npm install`.
- PostgreSQL available through the repository's Docker Compose configuration.
- `DATABASE_URL` configured for local migration commands and `TEST_DB_CONNECTION_STRING` configured for Jest setup.

## Affected Implementation Files

- Schema and relations: `src/db/schema/roles.ts`, `src/db/schema/user.ts`, `src/db/schema/index.ts`
- Migration: `drizzle/0018_create_roles_table.sql`
- Seeds: `src/db/seeds/roles_seed.ts`, `src/db/seeds/index.ts`
- Authentication and role resolution: `src/api/auth/db.ts`, `src/api/auth/services.ts`, `src/api/auth/request_schema.ts`
- Role serialization and request typing: `src/utils/functions.ts`, `src/middlewares/current_user.ts`, `src/types/express/index.d.ts`
- Authorization middleware: `src/middlewares/is_admin.ts`, `src/middlewares/is_buyer.ts`, `src/middlewares/is_seller.ts`
- Fixtures and regression tests: `src/test/setup.ts`, `src/test/helpers.ts`, `src/api/auth/__test__/`, `src/db/__test__/`, `src/middlewares/__test__/`, `src/api/listings/__test__/`, `src/api/favorite_listings/__test__/`

## 1. Generate and review the migration

From the repository root:

```bash
npx drizzle-kit generate
```

Review the next migration in `drizzle/` and verify it:

- creates and seeds `roles`;
- identifies null/unsupported legacy `users.role` values before backfill;
- backfills every valid user to `users.role_id`;
- enforces the foreign key and `NOT NULL` constraint;
- creates an index on `users.role_id`;
- removes the old inline role column only after validation.

## 2. Apply the schema and seed data

```bash
npm run db:migrate
```

Run the application seed path in the same environment. Run it again and verify that the four role names still occur exactly once and existing users retain their role associations.

## 3. Validate TypeScript

```bash
npm run start:build
```

Expected result: compilation succeeds with no references to `usersTable.role` or a missing `roleId` fixture field.

## 4. Run focused authentication tests

```bash
npx jest src/api/auth/__test__ --runInBand --no-cache
```

Expected result: registration, verification, login, refresh, and role-name response assertions pass.

## 5. Run the full test suite

```bash
npm test -- --runInBand --watchAll=false --no-cache
```

Expected result: the Docker-backed test database migrates, seeds roles before fixtures, and all authentication, authorization, listing, favorite, and database tests pass.

## 6. Manual migration failure check

On a disposable database only, create a legacy user with a null or unsupported inline role before applying the relational migration. Confirm the migration aborts with an actionable user identifier and leaves the migration retryable. Correct the legacy data, rerun the migration, and verify the user receives the matching seeded role.

## Acceptance evidence

- Four unique seeded roles exist after three seed runs.
- One user per supported role can be created and queried with its related role name.
- Login and refresh preserve the public `role` name and JWT claim.
- Buyer/seller/admin middleware decisions remain unchanged.
- Invalid role input and unresolved role relations fail without authorization or orphan users.

## Recorded validation

The following results were recorded on 2026-09-12:

- `npm run start:build`: passed.
- `npx jest src/db/__test__/migration_roles.test.ts --runInBand --no-cache`: passed; migration and seed repeatability/recovery checks passed.
- `npx jest src/api/auth/__test__ src/db/__test__ src/middlewares/__test__ --runInBand --no-cache`: passed; 75 tests passed across 11 suites.
- `npm test -- --runInBand --watchAll=false --no-cache`: exit code 1; 88 of 90 tests passed across 14 suites after excluding compiled `dist` tests from Jest discovery. Remaining failures were the existing favorite-list response-shape assertion and listing car-attachment request returning HTTP 500.

The focused migration/seed and role checks pass. The full-suite command remains the canonical integration check and must be rerun after the unrelated listing and favorite-list failures are resolved.
