# Authentication Role Contract

## Scope

This contract describes the externally observable role behavior preserved while user-role persistence changes from an inline value to a relational reference.

## Registration Input

`POST /api/auth/register` continues accepting the existing validated `userType` field:

- Allowed values: `buyer`, `seller`, `mechanic`
- `admin` remains a seeded/internal role and is not granted through public registration.
- Missing, unsupported, or non-resolvable role input returns the existing validation/error shape and does not create a user.

The service resolves the accepted name to `roles.id` before inserting the user.

## Authenticated User Response

Login and refresh responses continue returning a sanitized user object with:

- `id`
- `firstName`
- `lastName`
- `email`
- `cityId`
- `imageUrl`
- `isVerified`
- `phone`
- `role` as the related role name

`password`, `salt`, creation/update metadata, and `roleId` are not added to this public response by this feature.

## JWT Claims

Access and refresh tokens continue carrying:

- `id: number`
- `email: string`
- `issuedAt: number`
- `role: string`

The role claim is resolved from the related role record. Existing authorization middleware continues comparing the role name to `buyer`, `seller`, or `admin` as appropriate.

## Failure Behavior

- A missing role relation during authenticated user loading fails closed and must not authorize a request.
- A non-existent role ID during persistence is rejected by service validation and the database foreign key.
- Legacy migration values outside the supported set abort migration and identify affected users; no fallback role is assigned.
- Existing HTTP status and error response conventions remain unchanged unless a focused test requires the established validation error to be extended.

## Implementation Alignment

- Public registration and authenticated responses follow this contract. The `admin` role is available through seeded/internal fixtures only.
- The migration seeds the default role rows and validates/backfills legacy users transactionally. The application seed runner repeats the role seed conflict-safely after migrations, so deployment and test setup remain idempotent.
