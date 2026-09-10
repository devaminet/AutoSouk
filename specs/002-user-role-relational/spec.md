# Feature Specification: Relational User Roles

**Feature Branch**: `002-user-role-relational`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Refactor user role from inline enum to a relational roles table and update related tests."

## Clarifications

### Session 2026-09-10

- Q: How should the migration handle existing users whose current inline role is missing or outside `buyer`, `seller`, `mechanic`, or `admin`? → A: Abort the migration and report the invalid users for manual correction.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Persist Users Through Shared Roles (Priority: P1)

As a platform operator, I want user accounts to reference a shared role record so that role definitions are centralized, consistent, and independently maintainable.

**Why this priority**: The role relationship is the foundational data contract. Authentication and authorization cannot remain reliable until every user has a valid role reference.

**Independent Test**: Apply the schema change and seed data to a clean test database, create users for each supported role, and verify that each user points to the expected role and that the role lists its users.

**Acceptance Scenarios**:

1. **Given** an empty database, **When** the role initialization step runs, **Then** exactly the supported roles `buyer`, `seller`, `mechanic`, and `admin` are available for user assignment.
2. **Given** a user creation request with a valid supported role, **When** the account is persisted, **Then** the user stores the role reference and can be read together with its role name.
3. **Given** a user creation request with a missing or invalid role reference, **When** persistence is attempted, **Then** the request is rejected without creating a user that lacks a valid role.
4. **Given** an existing role with users, **When** the role and user relationship is queried in either direction, **Then** the result identifies the role and all associated users without duplicating role definitions.

---

### User Story 2 - Preserve Role-Based Authentication and Authorization (Priority: P1)

As a buyer, seller, mechanic, or administrator, I want login and protected actions to continue recognizing my role after the data model changes.

**Why this priority**: Role checks protect marketplace operations. A schema refactor must not silently change access rights or break authenticated sessions.

**Independent Test**: Log in one test account for each supported role, inspect the authenticated user representation, and exercise the existing role-protected routes to verify that authorized requests succeed and unauthorized requests remain blocked.

**Acceptance Scenarios**:

1. **Given** a verified account with a seeded role, **When** the account logs in, **Then** the authenticated user and session claims expose the same role name used by existing authorization behavior.
2. **Given** an authenticated user with the required role, **When** the user accesses a protected action, **Then** the action is authorized as before the refactor.
3. **Given** an authenticated user without the required role, **When** the user accesses a protected action, **Then** the action is rejected with the existing authorization behavior.
4. **Given** an account lookup or token refresh, **When** the user is loaded, **Then** role resolution succeeds through the shared role record and does not depend on an obsolete inline role field.

---

### User Story 3 - Keep Test Fixtures and Deployments Reproducible (Priority: P2)

As a developer, I want migrations, seed execution, factories, and tests to use valid role references so that local, CI, and integration environments remain reproducible.

**Why this priority**: Reliable fixtures are required to detect regressions in authentication and authorization and to let the team apply the schema change safely across environments.

**Independent Test**: Run the migration/seed process more than once and execute the full automated test suite from a clean test database; all setup and assertions should complete without manually inserted role rows.

**Acceptance Scenarios**:

1. **Given** a database with no roles, **When** the migration or seed process runs, **Then** the four default roles are inserted before any fixture creates users.
2. **Given** a database already containing one or more default roles, **When** the seed process runs again, **Then** it completes successfully without duplicate role records or destructive changes.
3. **Given** existing user factories, helpers, and test setup, **When** they create users, **Then** they supply a valid role reference and preserve the intended role for each test.
4. **Given** the complete test suite, **When** it is executed against the updated schema, **Then** all affected authentication, authorization, and database assertions pass.

### Edge Cases

- A role seed operation is retried after a partial or successful prior run; it must be idempotent and preserve existing role identifiers and user associations.
- A user references a role identifier that does not exist; the database and service boundary must prevent creation or return the established validation error.
- A user is loaded after its role name is changed through an administrative data operation; role-dependent responses and authorization must use the current related role value rather than a stale copied enum.
- Existing user records are migrated while the users table is non-empty; the migration must assign valid roles for all supported existing accounts before the new required relationship is enforced, and must abort with an actionable error identifying invalid or missing legacy roles before changing those users.
- Authentication, token refresh, and current-user middleware encounter a user whose role relationship cannot be resolved; the request must fail safely rather than grant access.
- Role names outside the four supported values are attempted; the system must reject them or otherwise prevent unsupported authorization states.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST provide a roles data entity with a generated integer identifier, a required unique name no longer than 50 characters, and a required creation date.
- **FR-002**: The roles data entity MUST contain the supported initial role names `buyer`, `seller`, `mechanic`, and `admin`.
- **FR-003**: Each user MUST store a required reference to exactly one role record; users MUST NOT retain the former inline role field.
- **FR-004**: The user-to-role relationship MUST be navigable from a user to its role and from a role to its users.
- **FR-005**: The schema migration MUST preserve all existing users by assigning each migrated user a valid role before enforcing the required role reference; if any existing user has a missing or unsupported legacy role, the migration MUST abort and identify those users for manual correction rather than assigning a default role.
- **FR-006**: User creation and update flows MUST resolve and persist role references without allowing an unsupported role or a non-existent role identifier.
- **FR-007**: Authentication, token refresh, current-user loading, response serialization, and authorization checks MUST continue to expose and evaluate role names with the existing buyer, seller, mechanic, and admin behavior.
- **FR-008**: Role-protected routes MUST continue to allow only the intended role and MUST preserve existing denial behavior for all other roles.
- **FR-009**: The role initialization process MUST be safe to run repeatedly without creating duplicate role records or changing existing role identifiers and associations.
- **FR-010**: Test helpers, factories, setup data, service fixtures, and assertions MUST create users through valid role references and must cover all supported roles where role behavior is under test.
- **FR-011**: The automated test suite MUST verify the roles relationship, migration/seed behavior, authentication role resolution, authorization decisions, invalid-role failures, and idempotent seeding.
- **FR-012**: The completed change MUST include a reviewed migration or equivalent schema transition and document any recovery consideration for failure during migration of existing users.

### Key Entities _(include if feature involves data)_

- **Role**: A shared authorization category identified by a unique name and associated with zero or more users.
- **User**: An authenticated marketplace account associated with exactly one role through a required relationship.
- **Authentication Session/Claims**: The authenticated representation that carries the resolved role name for existing authorization and response behavior.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A clean environment can initialize the four supported roles and create one valid user for each role with zero manual database edits.
- **SC-002**: Repeating the role initialization process at least three times leaves exactly one record for each supported role and preserves all existing user associations.
- **SC-003**: 100% of existing authentication and authorization tests that passed before the refactor continue to pass after migration, with additional coverage for invalid and missing role references.
- **SC-004**: From a clean test database, the complete automated test suite completes without fixture setup errors caused by missing or inline role values.
- **SC-005**: Every protected role-specific workflow returns the same allow or deny outcome for equivalent users before and after the refactor.
- **SC-006**: Code review can identify one authoritative role definition and one user-to-role relationship, with no production reference to the removed inline user role field.

## Assumptions

- The four role names listed in the request are the complete supported role set for this feature; adding a role-management interface is out of scope.
- Existing accounts with supported inline role values can be mapped directly to seeded roles during migration; accounts with missing or unsupported values require manual correction before the migration can complete.
- Existing API response and token contracts continue to expose a role name, while persistence changes from an inline value to a relationship.
- Existing authentication, authorization, listing, favorite, vehicle, and inspection workflows remain behaviorally unchanged except for their role lookup path.
- The migration and seed process runs before application tests and before any fixture creates users.
- Database backup or restore procedures remain the operational recovery mechanism if a production migration fails; this feature must still make the migration ordering and data-preservation step explicit.
