# Tasks: Mechanics Directory & Listing-Based Discovery

**Input**: Design documents from `/specs/003-mechanics-discovery/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/mechanics-api.md](./contracts/mechanics-api.md), [quickstart.md](./quickstart.md)

**Tests**: Included. The project constitution (Principle V) requires focused tests for acceptance scenarios and HTTP/auth/storage/DB-crossing integration tests, and every existing API module follows this with a `__test__/` folder (Jest + Supertest against a real Postgres test DB).

**Organization**: Tasks are grouped by user story (from spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps the task to a user story (US1–US5) for traceability
- All paths are relative to the repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Minimal infrastructure needed before schema/domain work begins

- [x] T001 [P] Add `mechanicsBucketName = "mechanics"` constant in `src/utils/constants.ts`
- [x] T002 Register `createBucket(mechanicsBucketName)` alongside the existing `createBucket(carBucketName)` call in `src/index.ts` (depends on T001)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, migration, role middleware, and router scaffolding that every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Define `mechanicTable` and `mechanicRelations` (`user` one, `city` one, `garageImages` many) in `src/db/schema/mechanic.ts` per [data-model.md](./data-model.md), including the `latitude`/`longitude` CHECK constraints and a unique index on `user_id` and an index on `city_id` (the `garageImages` relation is added by T004 to avoid a forward import)
- [x] T004 [P] Define `mechanicGarageImageTable` and its `mechanic` relation in `src/db/schema/mechanic_garage_image.ts` per [data-model.md](./data-model.md), including an index on `mechanic_id`
- [x] T005 Add a `mechanic: one(mechanicTable)` relation to `userRelations` in `src/db/schema/user.ts` (depends on T003)
- [x] T006 Add a `mechanics: many(mechanicTable)` relation to `cityRelations` in `src/db/schema/city.ts` (depends on T003)
- [x] T007 Register `./mechanic` and `./mechanic_garage_image` in the schema barrel `src/db/schema/index.ts` (depends on T003, T004)
- [x] T008 Generate and review the Drizzle migration for the `mechanics` and `mechanic_garage_images` tables (`npx drizzle-kit generate`) under `drizzle/` (depends on T005, T006, T007)
- [x] T009 [P] Create the `isMechanic` role middleware in `src/middlewares/is_mechanic.ts`, mirroring `src/middlewares/is_seller.ts`
- [x] T010 [P] Add `isMechanic` allow/deny/fail-closed cases to `src/middlewares/__test__/role_authorization.test.ts`
- [x] T011 Create the `mechanicsRouter` skeleton in `src/api/mechanics/routes.ts` and mount it at `/api/mechanics` in `src/routes.ts` (depends on T009)

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 - Mechanic Creates and Maintains a Public Profile (Priority: P1) 🎯 MVP

**Goal**: A user with the mechanic role can create exactly one profile with required location data and update it later.

**Independent Test**: Sign in as a mechanic, `POST` a profile with required fields, retrieve it via `GET /api/mechanics/me`, confirm missing coordinates are rejected and a second create attempt is rejected as a duplicate.

### Tests for User Story 1

- [x] T012 [P] [US1] Integration test for profile creation (success, missing latitude/longitude rejected, duplicate-profile rejected, non-mechanic role denied) in `src/api/mechanics/__test__/create_mechanic.test.ts`
- [x] T013 [P] [US1] Integration test for retrieving and updating the caller's own profile (partial update persists, no-profile-yet returns 404) in `src/api/mechanics/__test__/update_mechanic.test.ts`

### Implementation for User Story 1

- [x] T014 [US1] Add `createMechanicSchema` and `updateMechanicSchema` (name, cityId, address, latitude, longitude, optional description/phone/inspectionPrice/profileImageFilename, with lat/long range validation) to `src/api/mechanics/request_schema.ts`
- [x] T015 [US1] Add `findMechanicByUserId`, `insertMechanic`, and `updateMechanicByUserId` Drizzle queries to `src/api/mechanics/db.ts` (depends on T014)
- [x] T016 [US1] Implement `createMechanicProfile` and `updateMechanicProfile` services — duplicate-profile check, presigned PUT URL for the optional profile image — in `src/api/mechanics/services.ts` (depends on T015)
- [x] T017 [US1] Implement `POST /api/mechanics`, `GET /api/mechanics/me`, and `PATCH /api/mechanics/me` routes (guarded by `isAuthenticated` + `isMechanic`) in `src/api/mechanics/routes.ts` (depends on T016)

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Buyer Discovers Active Mechanics for a Car Listing (Priority: P1)

**Goal**: `GET /api/listings/:id/mechanics` returns active mechanics located in the listing's city, derived automatically, with coordinates and image data.

**Independent Test**: Seed active mechanics in a known city and an approved listing whose car is in that city; request mechanics for the listing without supplying a city and verify the correct, complete result; verify empty results for no-mechanics/inactive/non-approved/no-car cases.

### Tests for User Story 2

- [x] T018 [P] [US2] Integration test for successful discovery (active mechanics returned with latitude/longitude, profile, and garage images; inactive mechanics excluded) in `src/api/listings/__test__/listing_mechanics.test.ts`
- [x] T019 [P] [US2] Integration test for empty-result cases (no mechanics in city, no car/city attached to the listing, listing not in `approved` status) in `src/api/listings/__test__/listing_mechanics_empty.test.ts`

### Implementation for User Story 2

- [x] T020 [US2] Add `findActiveMechanicsByCity` (paginated, joined with city and garage images) to `src/api/mechanics/db.ts` (depends on T015)
- [x] T021 [US2] Add `listingMechanicsQuerySchema` (`page`, `limit` with defaults) to `src/api/mechanics/request_schema.ts` (depends on T014)
- [x] T022 [US2] Implement `getMechanicsForListing` service — resolve the listing's status/car/city, short-circuit to an empty paginated result when not `approved` or no city is resolvable, otherwise return paginated active mechanics with presigned image URLs — in `src/api/mechanics/services.ts` (depends on T020)
- [x] T023 [US2] Implement `GET /:id/mechanics` route in `src/api/listings/routes.ts`, validating query params with `listingMechanicsQuerySchema` and calling `getMechanicsForListing` (depends on T021, T022)

**Checkpoint**: User Stories 1 and 2 both work independently — core discovery MVP complete

---

## Phase 5: User Story 3 - Anyone Views a Specific Mechanic's Full Profile (Priority: P2)

**Goal**: `GET /api/mechanics/:id` returns the full public profile and garage images for an active mechanic to any visitor, while the owner can always see their own profile regardless of status.

**Independent Test**: Request an active mechanic's profile by id as an unauthenticated visitor and verify the full profile and images are returned; request an inactive mechanic's profile as a visitor (expect not found) and as its owner (expect success).

### Tests for User Story 3

- [ ] T024 [P] [US3] Integration test for public profile retrieval (active mechanic returns full profile + garage images; inactive mechanic returns 404 for the public but 200 for its owner) in `src/api/mechanics/__test__/get_mechanic.test.ts`

### Implementation for User Story 3

- [ ] T025 [US3] Add `findMechanicById` (joined with city and garage images) query to `src/api/mechanics/db.ts` (depends on T015)
- [ ] T026 [US3] Implement `getMechanicById` service — active-only visibility for non-owners, full visibility for the owner, presigned image URLs — in `src/api/mechanics/services.ts` (depends on T025)
- [ ] T027 [US3] Implement `GET /api/mechanics/:id` route (public, optional auth via existing `current_user` middleware) in `src/api/mechanics/routes.ts` (depends on T026)

**Checkpoint**: User Stories 1–3 all work independently

---

## Phase 6: User Story 4 - Mechanic Manages Garage/Workshop Photos (Priority: P2)

**Goal**: A mechanic can add and remove garage images on their own profile; images are optional and unbounded in count.

**Independent Test**: As a mechanic, add a garage photo and confirm it appears on the profile; remove it and confirm it no longer appears; attempt the same operations against another mechanic's profile and confirm denial.

### Tests for User Story 4

- [ ] T028 [P] [US4] Integration test for adding/removing garage images (success, zero-image profile returns empty list, cross-mechanic add/remove denied, invalid file type rejected) in `src/api/mechanics/__test__/garage_images.test.ts`

### Implementation for User Story 4

- [ ] T029 [US4] Add `addGarageImagesSchema` (`filenames: string[]`, image-type validated via existing `getFileType`/`allowedFileTypes`) to `src/api/mechanics/request_schema.ts` (depends on T014)
- [ ] T030 [US4] Add `insertGarageImages` and `deleteGarageImageByOwner` (mechanic-scoped) queries to `src/api/mechanics/db.ts` (depends on T015)
- [ ] T031 [US4] Implement `addGarageImages` and `removeGarageImage` services — ownership check, presigned PUT URLs on add, presigned GET URLs on read — in `src/api/mechanics/services.ts` (depends on T030)
- [ ] T032 [US4] Implement `POST /api/mechanics/me/garage-images` and `DELETE /api/mechanics/me/garage-images/:imageId` routes in `src/api/mechanics/routes.ts` (depends on T031, T029)

**Checkpoint**: User Stories 1–4 all work independently

---

## Phase 7: User Story 5 - Mechanic Controls Active/Inactive Availability (Priority: P3)

**Goal**: A mechanic can toggle their own profile's active status, immediately affecting discovery and public retrieval.

**Independent Test**: Toggle a profile from active to inactive and confirm it disappears from discovery and public retrieval; reactivate and confirm it reappears; confirm another mechanic cannot change it.

### Tests for User Story 5

- [ ] T033 [P] [US5] Integration test for activation/deactivation (status change immediately reflected in discovery and public `GET /api/mechanics/:id`; cross-mechanic status change denied) in `src/api/mechanics/__test__/toggle_status.test.ts`

### Implementation for User Story 5

- [ ] T034 [US5] Add `updateStatusSchema` (`isActive: boolean`) to `src/api/mechanics/request_schema.ts` (depends on T014)
- [ ] T035 [US5] Add `updateMechanicStatusByUserId` query to `src/api/mechanics/db.ts` (depends on T015)
- [ ] T036 [US5] Implement `updateMechanicStatus` service in `src/api/mechanics/services.ts` (depends on T035)
- [ ] T037 [US5] Implement `PATCH /api/mechanics/me/status` route in `src/api/mechanics/routes.ts` (depends on T036, T034)

**Checkpoint**: All user stories are independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories

- [ ] T038 [P] Run the full test suite (`npm test`) and fix any regressions across `src/api/mechanics`, `src/api/listings`, and `src/middlewares`
- [ ] T039 [P] Execute the [quickstart.md](./quickstart.md) manual validation steps end-to-end and confirm every Success Criteria mapping passes
- [ ] T040 Review response payloads, status codes, and error mappings against [contracts/mechanics-api.md](./contracts/mechanics-api.md) for consistency

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3–7)**: All depend on Foundational completion
  - US1 (Phase 3) has no dependency on other stories
  - US2 (Phase 4) depends only on Foundational (`mechanics`/`cities` schema) — reuses `db.ts` helpers added in US1 but is independently testable by seeding mechanic rows directly
  - US3 (Phase 5) depends only on Foundational — independently testable the same way
  - US4 (Phase 6) depends only on Foundational + an existing mechanic profile (created via US1 or seeded directly)
  - US5 (Phase 7) depends only on Foundational + an existing mechanic profile
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### Within Each User Story

- Tests are written first and MUST fail before implementation
- Request schema → db queries → services → routes (strict layering per Constitution Principle II)
- Story complete and checkpoint-verified before moving to the next priority

### Parallel Opportunities

- T001, T003, T004, T009 can run in parallel (different files, no cross-dependency)
- T010 can run in parallel with T003/T004/T009 (different file)
- Within each story, the `[P]`-marked test tasks can run in parallel with each other
- US3, US4, and US5 can be implemented in parallel by different developers once Foundational and US1 are done, since each touches a distinct slice of `request_schema.ts`/`db.ts`/`services.ts`/`routes.ts` (coordinate on shared-file edits to avoid merge conflicts)

---

## Parallel Example: Foundational Phase

```bash
# Launch these together once Phase 1 (Setup) is done:
Task: "Define mechanicTable and mechanicRelations in src/db/schema/mechanic.ts"
Task: "Define mechanicGarageImageTable in src/db/schema/mechanic_garage_image.ts"
Task: "Create the isMechanic role middleware in src/middlewares/is_mechanic.ts"
Task: "Add isMechanic cases to src/middlewares/__test__/role_authorization.test.ts"
```

## Parallel Example: User Story 1

```bash
Task: "Integration test for profile creation in src/api/mechanics/__test__/create_mechanic.test.ts"
Task: "Integration test for retrieving/updating own profile in src/api/mechanics/__test__/update_mechanic.test.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 (mechanics can create/maintain profiles)
4. Complete Phase 4: User Story 2 (buyers can discover them from a listing)
5. **STOP and VALIDATE**: run the quickstart steps for both stories together — this is the feature's stated primary goal
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. US1 → test independently (profile CRUD works)
3. US2 → test independently → **MVP reached** (listing → mechanic discovery works end-to-end)
4. US3 → test independently (public detail view)
5. US4 → test independently (garage images)
6. US5 → test independently (activation toggle)
7. Polish → full regression + quickstart validation

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 then US2 (core profile + discovery, tightly related)
   - Developer B: US3 (public detail view, only needs Foundational)
   - Developer C: US4 and US5 (images and status toggle, only need Foundational + an existing profile row for manual testing)
3. Stories integrate independently through the shared `src/api/mechanics/*` files; coordinate merges on `request_schema.ts`, `db.ts`, `services.ts`, and `routes.ts` since each story appends to the same files

---

## Notes

- `[P]` tasks touch different files and have no unmet dependencies
- `[Story]` labels map every user-story-phase task back to spec.md for traceability
- Verify each story's tests fail before implementing, then pass after
- Commit after each task or logical group
- No new frontend, storage mechanism, payments, ratings, or radius/distance search — per spec's explicit exclusions
