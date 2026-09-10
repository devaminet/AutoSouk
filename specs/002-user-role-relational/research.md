# Research: Relational User Roles

## Decision 1: Use a relational lookup table for roles

**Decision**: Store the supported role records in `roles` and reference them from `users.role_id` with a required foreign key.

**Rationale**: The feature requires one-to-many Drizzle relations, shared role identity, unique names, and future-safe role evolution. A lookup table also lets authorization data be queried and validated independently of the user row. The existing API can continue exposing role names after a join.

**Alternatives considered**:

- Keep the inline `varchar` enum: rejected because it duplicates authorization vocabulary inside the user table and cannot satisfy the requested role relation.
- Use a PostgreSQL enum: rejected because it does not provide role rows or one-to-many relational navigation and is less flexible for future role administration.

## Decision 2: Resolve role names at the authentication data-access boundary

**Decision**: Update user lookup queries used by login, refresh, current-user loading, and sanitization to join `roles` and return the related role name under the existing public `role` contract. Persist registration input by resolving the validated role name to its role ID before inserting the user.

**Rationale**: Existing services, middleware, JWT claims, and tests consume `user.role` or a role-name claim. Keeping that contract stable limits the refactor to persistence and lookup boundaries and preserves authorization outcomes.

**Alternatives considered**:

- Expose `roleId` throughout services and middleware: rejected because it would change authorization semantics and require every role check to repeat role-name lookup.
- Load the user and role in separate queries for every auth operation: rejected because a single joined lookup avoids unnecessary round trips and prevents partially resolved user state.

## Decision 3: Seed roles as an idempotent prerequisite

**Decision**: Add a role seed function that inserts `buyer`, `seller`, `mechanic`, and `admin` with `onConflictDoNothing` targeting the unique name. Run it before the existing reference-data seeds, and retain the existing aggregate failure behavior.

**Rationale**: User fixtures and registration require role rows. The current seed runner executes independent seed functions concurrently, so roles must be awaited first to make the dependency explicit. Unique names plus conflict-safe insertion make repeated runs safe.

**Alternatives considered**:

- Insert roles in every user factory: rejected because it spreads reference-data ownership into tests and production paths.
- Depend only on a migration-time seed: rejected because the existing seed runner is used by the test setup and local data initialization.

## Decision 4: Use a reviewed transactional migration for existing users

**Decision**: Add the next sequential SQL migration after `0017`. Create and populate `roles`, inspect existing users for null or unsupported legacy values, abort with an actionable database error if any are found, add/backfill `role_id` for valid rows, enforce the foreign key and `NOT NULL`, add the FK index, then remove the old `role` column. Review generated SQL manually before applying it.

**Rationale**: The existing database contains users and the requested role ID is required. Validation must happen before destructive column removal or a required constraint. PostgreSQL DDL and data changes can be tested transactionally, and Drizzle migrations provide reproducible deployment history.

**Alternatives considered**:

- Auto-map invalid values to `buyer`: rejected because it silently changes authorization.
- Auto-map invalid values to `admin`: rejected because it grants excessive privilege.
- Drop and recreate the users table: rejected because it risks losing accounts and dependent records.

## Decision 5: Index the foreign key

**Decision**: Create an index on `users.role_id` in the migration and schema design.

**Rationale**: PostgreSQL does not automatically index foreign-key columns. Role joins and role-to-users lookups are real access paths, and the index avoids avoidable scans and parent-update locking costs.

**Alternatives considered**:

- Rely on the primary key index of `roles.id`: rejected because it does not index the referencing users rows.
- Defer indexing until a performance incident: rejected because the access path is known and the cost is small.

## Decision 6: Test at schema, data-access, HTTP, and migration boundaries

**Decision**: Extend the existing Jest setup and auth/favorite/listing integration tests, and add focused database assertions for relation shape, idempotent role seeding, invalid role handling, and migration behavior.

**Rationale**: This refactor crosses persistence and authentication contracts. Existing Supertest coverage verifies public behavior, while direct database assertions verify the new relationship and seed guarantees.

**Alternatives considered**:

- Only run TypeScript compilation: rejected because compile-time checks cannot detect incorrect joins, seed order, or authorization regressions.
- Rewrite all tests around role IDs: rejected because public behavior should continue asserting role names; only persistence fixtures should use IDs.
