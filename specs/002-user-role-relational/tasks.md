# Tasks: Relational User Roles

**Input**: Design documents from `specs/002-user-role-relational/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/auth-role-contract.md`, `quickstart.md`

**Tests**: Included because the specification requires migration, seed, relationship, authentication, authorization, invalid-role, and idempotent-seeding coverage.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing project commands and migration numbering before changing the role model.

- [x] T001 Inspect `package.json`, `drizzle.config.ts`, and `drizzle/meta/_journal.json` to confirm the available build, migration, test commands and next sequential migration identifier
- [x] T002 [P] Add the relational-role acceptance scenarios and affected file list to `specs/002-user-role-relational/quickstart.md` if implementation findings require command or evidence updates

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared roles schema, database migration, and seed ordering required by every user story.

**Checkpoint**: The database can represent roles and users can reference a valid role before auth or fixture changes begin.

- [ ] T003 [P] Create `rolesTable`, inferred role types, and the required identity primary key, unique 50-character name, and defaulted creation date in `src/db/schema/roles.ts`
- [ ] T004 Update `usersTable` to replace the inline `role` field with required indexed `roleId` foreign key metadata and add the user-to-role relation in `src/db/schema/user.ts`
- [ ] T005 [P] Add `roleRelations` for the role-to-users relationship and include `rolesTable` and `roleRelations` in the exported Drizzle schema object in `src/db/schema/roles.ts` and `src/db/schema/index.ts`
- [ ] T006 Create the reviewed sequential migration in `drizzle/0018_relational_user_roles.sql` to create and seed roles, validate null/unsupported legacy roles, backfill `users.role_id`, enforce the foreign key and `NOT NULL`, add the role ID index, and remove the legacy role column only after successful validation
- [ ] T007 Add an idempotent default-role seed function inserting `buyer`, `seller`, `mechanic`, and `admin` with conflict protection on the unique name in `src/db/seeds/roles_seed.ts`
- [ ] T008 Update `src/db/seeds/index.ts` so role seeding completes before dependent reference-data seeds while preserving aggregate failure reporting
- [ ] T009 [P] Add database-level tests for role uniqueness, role-to-user/user-to-role relations, role ID foreign-key enforcement, legacy-value migration failure, and successful legacy backfill in `src/db/__test__/roles.test.ts`

---

## Phase 3: User Story 1 - Persist Users Through Shared Roles (US1) (Priority: P1) 🎯 MVP

### Goal

Persist every user with exactly one valid shared role and expose the role relationship without duplicating role definitions.

### Independent Test

Apply the migration to a clean database, run the role seed, create one user for each supported role, and query users with their role names and roles with their users.

### Tests for User Story 1

- [ ] T010 [P] [US1] Add role seed tests proving the four defaults are inserted exactly once and repeated seed runs preserve role IDs in `src/db/seeds/__test__/roles_seed.test.ts`
- [ ] T011 [P] [US1] Add user persistence tests proving valid role IDs create users, missing/non-existent role IDs fail, and relation queries return the expected role name in `src/api/auth/__test__/role_persistence.test.ts`

### Implementation for User Story 1

- [ ] T012 [US1] Add typed role-name-to-role-ID lookup data access for registration and fixture use in `src/api/auth/db.ts`
- [ ] T013 [US1] Update `createUser` in `src/api/auth/db.ts` to resolve the validated `userType` to `roles.id`, insert `users.roleId`, and reject unresolved role names without creating an orphan user
- [ ] T014 [US1] Update role-sensitive registration validation and error translation in `src/api/auth/request_schema.ts` and `src/api/auth/services.ts` without allowing public registration to create an admin user
- [ ] T015 [US1] Update `src/utils/functions.ts` sanitization types and role serialization to read the joined role name while excluding `roleId` from the public user response

**Checkpoint**: User Story 1 is independently testable with four seeded roles, valid role-backed users, relation queries, and invalid-reference failures.

---

## Phase 4: User Story 2 - Preserve Role-Based Authentication and Authorization (US2) (Priority: P1)

### Goal

Preserve role names in login, refresh, JWT claims, current-user state, and protected-route decisions after persistence changes.

### Independent Test

Log in verified buyer, seller, mechanic, and admin fixtures, assert the returned role name and JWT claim, then verify existing role middleware allows only the intended role and fails closed when role resolution is absent.

### Tests for User Story 2

- [ ] T016 [P] [US2] Update login and refresh integration assertions for joined role names and stable sanitized responses in `src/api/auth/__test__/login.test.ts` and `src/api/auth/__test__/refresh_token.test.ts`
- [ ] T017 [P] [US2] Add authorization integration coverage for buyer, seller, and admin allow/deny decisions and unresolved-role fail-closed behavior in `src/middlewares/__test__/role_authorization.test.ts`
- [ ] T018 [P] [US2] Add auth data-access coverage for user-by-email and user-by-ID role joins in `src/api/auth/__test__/auth_db.test.ts`

### Implementation for User Story 2

- [ ] T019 [US2] Update `findUserByEmail` and `findUserById` in `src/api/auth/db.ts` to join `rolesTable` and return the related role name under the existing `role` contract
- [ ] T020 [US2] Update login and refresh token generation in `src/api/auth/services.ts` to use the resolved role name and fail safely when the role relation cannot be resolved
- [ ] T021 [US2] Update JWT payload typing and current-user assignment in `src/middlewares/current_user.ts` and `src/types/express/index.d.ts` while preserving existing role-name middleware inputs
- [ ] T022 [US2] Verify and update role middleware behavior in `src/middlewares/is_admin.ts`, `src/middlewares/is_buyer.ts`, and `src/middlewares/is_seller.ts` so authorization remains server-side and unchanged

**Checkpoint**: User Story 2 is independently testable through login, refresh, current-user loading, JWT claims, and protected-route authorization.

---

## Phase 5: User Story 3 - Keep Test Fixtures and Deployments Reproducible (US3) (Priority: P2)

### Goal

Ensure migrations, seeds, factories, setup data, and the complete suite work repeatedly from a clean test database.

### Independent Test

Recreate the test database, migrate and seed it at least three times, then run focused and full Jest suites without manually inserting role rows.

### Tests for User Story 3

- [ ] T023 [P] [US3] Add migration/seed repeatability and invalid-legacy-role recovery checks to `src/db/__test__/migration_roles.test.ts`
- [ ] T024 [P] [US3] Update fixture assertions across auth, listing, and favorite integration tests to verify role names remain stable after setup refactoring in `src/api/auth/__test__/register.test.ts`, `src/api/listings/__test__/create_listing.test.ts`, and `src/api/favorite_listings/__test__/favorite_listings.test.ts`

### Implementation for User Story 3

- [ ] T025 [US3] Update `src/test/setup.ts` to rely on migrated/seeded role rows and insert the admin fixture with a valid `roleId` instead of the removed inline role field
- [ ] T026 [US3] Update registration and authenticated-user factories in `src/test/helpers.ts` to preserve role-name inputs while resolving valid role IDs through the application path
- [ ] T027 [US3] Audit and replace all remaining production and test references to `usersTable.role` or direct user inserts using `role` across `src/`, preserving public `role` response and JWT names
- [ ] T028 [US3] Update any affected listing, favorite, city, and related Drizzle relation imports/tests so schema compilation and role joins have no stale user-role field references in `src/db/schema/`, `src/api/`, and `src/test/`

**Checkpoint**: User Story 3 is independently testable through repeatable migration/seed setup and the complete existing integration suite.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete change, document recovery behavior, and remove migration/refactor drift.

- [ ] T029 [P] Update `specs/002-user-role-relational/quickstart.md` with final migration command output, seed repeatability evidence, and the confirmed focused/full test commands
- [ ] T030 [P] Audit `specs/002-user-role-relational/data-model.md` and `specs/002-user-role-relational/contracts/auth-role-contract.md` against the final schema and API behavior, documenting any justified deviation
- [ ] T031 Run `npm run start:build` and resolve only feature-related TypeScript errors in `src/db/`, `src/api/auth/`, `src/middlewares/`, `src/db/seeds/`, and `src/test/`
- [ ] T032 Run the focused auth and role tests with `npx jest src/api/auth/__test__ src/db/__test__ src/middlewares/__test__ --runInBand --no-cache` and fix feature-related failures in `src/api/auth/`, `src/db/`, and `src/middlewares/`
- [ ] T033 Run the complete test suite with `npm test -- --runInBand --watchAll=false --no-cache`, then verify migration and seed behavior against the acceptance criteria in `specs/002-user-role-relational/quickstart.md`
- [ ] T034 Review `drizzle/0018_relational_user_roles.sql` and the final diff for transactional migration safety, invalid legacy-role reporting, no secret/error leakage, and absence of stale production inline-role references

---

## Dependencies

### Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; confirms commands and migration numbering.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories because schema, migration, and role seed ordering are shared prerequisites.
- **User Story 1 (Phase 3)**: Depends on Foundational; establishes valid role-backed persistence and is the MVP.
- **User Story 2 (Phase 4)**: Depends on Foundational and the role lookup contract from US1 tasks T012-T015; preserves authentication and authorization behavior.
- **User Story 3 (Phase 5)**: Depends on Foundational and the persistence/auth contracts from US1 and US2; updates shared fixtures and verifies reproducibility.
- **Polish (Phase 6)**: Depends on all desired user-story tasks and their checkpoints in `specs/002-user-role-relational/tasks.md`.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only; no dependency on later stories.
- **US2 (P1)**: Depends on Phase 2 plus the role-name lookup behavior established by T012-T015.
- **US3 (P2)**: Depends on Phase 2 plus the finalized persistence and auth contracts from US1 and US2.

### Within Each User Story

- Write focused tests before implementation where practical.
- Complete schema/data-access prerequisites before service or middleware changes.
- Preserve the existing public role-name contract while changing only persistence internals.
- Run the story checkpoint before starting the next dependent story.

## Parallel Execution Examples

### Foundational Phase

```text
T003 roles schema and T005 schema export/role relation can proceed in parallel.
T007 role seed implementation can proceed in parallel with T003-T006, but T008 must wait for T007.
T009 database relationship/migration tests can be drafted in parallel with schema work and run after T006.
```

### User Story 1

```text
T010 seed tests and T011 persistence tests can be written in parallel.
After the foundational schema exists, T012 role lookup and T015 sanitization can proceed in parallel; T013 depends on T012 and T014 depends on the registration contract.
```

### User Story 2

```text
T016 login/refresh tests, T017 middleware tests, and T018 auth data-access tests can be written in parallel.
T019 auth joins and T021 JWT/current-user typing can proceed in parallel; T020 depends on T019 and T022 depends on the resolved role-name contract.
```

### User Story 3

```text
T023 migration repeatability tests and T024 integration fixture assertions can be written in parallel.
T025 test setup and T026 helper updates can proceed in parallel after the role seed exists; T027 and T028 are audit tasks that follow the resulting compile errors.
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 setup and Phase 2 foundational schema, migration, and seed tasks.
2. Complete Phase 3 User Story 1 persistence and relation tasks.
3. Run the US1 database, seed, and persistence tests.
4. Stop only when four roles, valid role-backed users, relation queries, and invalid-reference failures are verified.

### Incremental Delivery

1. Phase 1 + Phase 2 establish the normalized data foundation.
2. Phase 3 preserves valid user persistence as the MVP.
3. Phase 4 preserves login, JWT, refresh, and protected-route behavior.
4. Phase 5 makes migrations, seeds, fixtures, and the full suite reproducible.
5. Phase 6 performs final typecheck, focused tests, full tests, and migration review.

## Notes

- Every task follows the required checklist format: checkbox, sequential task ID, optional `[P]`, required story label for story phases, and an exact repository path.
- No new role-management endpoint is in scope.
- `admin` remains available through seeded/internal fixtures but is excluded from public registration, matching the existing request schema.
