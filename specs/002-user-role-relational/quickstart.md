# Quickstart: Relational User Roles

## Prerequisites

- Node.js and npm installed.
- Dependencies installed with `npm install`.
- PostgreSQL available through the repository's Docker Compose configuration.
- `DATABASE_URL` configured for local migration commands and `TEST_DB_CONNECTION_STRING` configured for Jest setup.

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
