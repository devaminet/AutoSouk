# Data Model: Relational User Roles

## Role

Shared authorization category used by authenticated users and server-side permission checks.

| Field       | Type / constraint                                  | Notes                                                             |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `id`        | integer, generated always as identity, primary key | Stable surrogate identifier used by users.                        |
| `name`      | varchar(50), not null, unique                      | Supported initial values: `buyer`, `seller`, `mechanic`, `admin`. |
| `createdAt` | date, not null, default current date               | Creation metadata.                                                |

Drizzle owner: `src/db/schema/roles.ts`, exported as `rolesTable`.

## User Changes

Retain all existing user fields except the inline role value. Replace it with:

| Field    | Type / constraint                            | Notes                                    |
| -------- | -------------------------------------------- | ---------------------------------------- |
| `roleId` | integer, not null, foreign key to `roles.id` | Required role assignment for every user. |

Drizzle owner: `src/db/schema/user.ts`, field name `roleId` and database name `role_id`.

## Relationships

- One `Role` has zero or many `User` records.
- Every `User` has exactly one `Role`.
- `userRelations` exposes `role: one(rolesTable, ...)` using `usersTable.roleId` to `rolesTable.id`.
- `roleRelations` exposes `users: many(usersTable)`.
- The `users.role_id` foreign key has an index for role joins and role-to-users queries.

## Invariants

- Role names are unique and non-null.
- User role references are non-null and must target an existing role.
- The supported initial role vocabulary is exactly `buyer`, `seller`, `mechanic`, and `admin`.
- No production user row may retain the removed inline `role` column after the migration.
- Invalid or missing legacy role values block migration and identify affected users; they are never silently defaulted.
- Seed retries do not duplicate role rows or change existing IDs.

## Migration State Transition

1. Create `roles` with its identity primary key, unique name, and creation date.
2. Insert the four supported roles using stable names.
3. Check all existing `users.role` values. If any value is null or outside the supported set, raise an actionable error containing affected user identifiers/emails and stop before changing user assignments.
4. Add nullable `users.role_id` and populate it by joining the old role name to `roles.name`.
5. Verify no user remains without a role ID.
6. Add the foreign key and `NOT NULL` constraint, then create the `users.role_id` index.
7. Drop the legacy `users.role` column.

The migration must run as one reviewed, failure-safe unit where PostgreSQL permits transactional DDL. Operational recovery is database backup/restore plus manual correction of invalid legacy rows before retrying.

## Query Shapes

- Auth user lookup: users joined to roles, returning user fields plus `role: roles.name`.
- Registration: validate role name at the request boundary, resolve `roles.id`, then insert `users.role_id`.
- Role relationship checks: query a role with its users or a user with its role using Drizzle relations or explicit joins.
