# Research: Mechanics Directory & Listing-Based Discovery

All unknowns from the Technical Context are resolved using existing AutoSouk conventions; no external technology research was required since this feature extends an established stack. Each decision below reflects the reasonable default already inferred in the spec's Assumptions, made concrete for implementation.

## 1. Mechanic profile ↔ user relationship

- **Decision**: A `mechanics` table stores one row per mechanic profile, with a required, unique `user_id` foreign key to `users` (one-to-one).
- **Rationale**: The `mechanic` role already exists on `users` (see `roles` table and `AuthenticatedRole`). Mirroring how `cars`/`listings` hang off `user_id` keeps the pattern consistent and lets profile creation reuse `req.currentUser.id` from `is_authenticated`/`current_user` middleware, with no new identity concept.
- **Alternatives considered**: A standalone mechanic identity unlinked from `users` — rejected, contradicts the existing role-based architecture and would duplicate authentication.

## 2. Role enforcement

- **Decision**: Add `src/middlewares/is_mechanic.ts`, mirroring `is_seller.ts`/`is_buyer.ts` exactly (checks `req.currentUser.role === "mechanic"`, throws `NotAuthorizedError`/`NotAllowedError`).
- **Rationale**: Keeps authorization server-side and consistent with the constitution's "role checks are never a client boundary" rule; zero new abstraction.
- **Alternatives considered**: Inline role checks in route handlers — rejected, duplicates logic already centralized in middleware for other roles.

## 3. Garage images & profile picture storage

- **Decision**: Reuse the existing Minio client and presigned-URL helper functions (`generatePresignedUrl`, `generateGetPresignedUrl(s)`) unchanged. Add a dedicated `mechanicsBucketName` bucket constant (created at startup via the existing `createBucket` helper, alongside `carBucketName`), rather than a new storage mechanism. DB rows store only the object key/filename, exactly like `car_media.link` and `users.image_url`.
- **Rationale**: The prompt requires reusing the existing file/image architecture without introducing a separate mechanism. A distinct bucket keeps mechanic assets organized independently of car media while using the identical client, upload flow (client uploads directly via presigned PUT), and read flow (backend mints presigned GET URLs before responding) already proven in `listings`/`favorite_listings`.
- **Alternatives considered**: Reusing the existing `cars` bucket for mechanic images too (also seen today for `users.imageUrl`) — viable and slightly simpler, but a dedicated bucket avoids co-mingling unrelated domains' objects and does not add any new storage technology, so it was preferred without meaningfully increasing complexity.

## 4. Garage images data shape

- **Decision**: A `mechanic_garage_images` table with `id`, required `mechanic_id` FK (cascade delete), `link` (object key), and `created_at`. No `is_primary`/`type` columns (unlike `car_media`) since garage images are a simple unordered gallery of photos only, per spec (no video, no primary-image requirement mentioned).
- **Rationale**: Matches the minimal attribute set actually required by the spec (zero-or-more photos); avoids speculative fields.
- **Alternatives considered**: Reusing `car_media` table with a new `mechanic_id` column — rejected, mixes two unrelated domains (car listings vs. mechanic garages) in one table and would require nullable FKs on both sides.

## 5. Listing → mechanic city derivation & discovery route placement

- **Decision**: `GET /api/listings/:id/mechanics` is added to the existing `listingRouter` (mirroring the existing `POST /:id/car` sub-resource pattern), implemented by loading the listing's status and its car's `city_id` (already a FK on `cars`), then delegating to a mechanics-domain service/query filtered by `city_id` and `is_active = true`.
- **Rationale**: The spec explicitly frames discovery as a listing sub-resource; `cars.city_id` already exists and is populated exactly for this purpose. Only listings with `status = 'approved'` (per Clarification 1) resolve to a city — anything else (missing car, non-approved status) short-circuits to an empty result before querying mechanics.
- **Alternatives considered**: A top-level `GET /api/mechanics?listingId=` query-param endpoint — rejected as less RESTful than the sub-resource form requested in the spec, and would let clients treat the listing id as an optional filter rather than the entry point.

## 6. Pagination on discovery/list responses

- **Decision**: `GET /api/listings/:id/mechanics` accepts optional `page`/`limit` query params (defaults matching `getListingsQuerySchema`, e.g. `page=1`, `limit=10`, capped max), returning a `meta` block identical in shape to the existing `getListings` response.
- **Rationale**: Constitution Principle III requires pagination "where collections can grow." The number of mechanics in a city is unbounded over time, and existing collection endpoints (`GET /listings`, `GET /favorite_listings`) already establish this pagination shape — reusing it keeps API responses consistent.
- **Alternatives considered**: Returning the full unpaginated array — rejected as inconsistent with the constitution and existing collection-endpoint conventions, even though the spec itself didn't mandate pagination explicitly.

## 7. Latitude/longitude validation

- **Decision**: Zod schema enforces `latitude` within `[-90, 90]` and `longitude` within `[-180, 180]` as required numbers; the Drizzle migration adds matching `CHECK` constraints at the database level.
- **Rationale**: Constitution Principle III (boundary validation) and Principle IV (schema-encoded invariants) both call for enforcing this at both layers, consistent with how other bounded numeric fields are validated in the codebase (e.g., enums for transmission/status).
- **Alternatives considered**: Validation only in Zod, no DB constraint — rejected, does not protect data integrity against future non-API writes (seeds, scripts).

## 8. Default profile active status & lifecycle

- **Decision**: A newly created mechanic profile defaults `is_active = true` (immediately eligible for discovery once all required fields are present); no admin approval gate is introduced.
- **Rationale**: The spec's explicit operations list treats "activating/deactivating" as a mechanic self-service action (like `listings.status`'s draft/approved flow is for sellers+admin, mechanics have no analogous moderation step described). This matches the Assumptions section's decision not to introduce new admin-specific mechanic management in this feature.
- **Alternatives considered**: Defaulting to `is_active = false` requiring an explicit activation call — rejected as an unnecessary extra step not requested by the spec; would fail Independent Test criteria in User Story 1, which expects a created profile to be immediately retrievable and usable.

## 9. Public vs. self visibility of inactive profiles

- **Decision**: A single `getMechanicById` service branches on whether the requester is the owning authenticated mechanic (any status returned) or anyone else (only returned if `is_active = true`, else `NotFoundError`).
- **Rationale**: Matches FR-009's requirement that owners always see their own profile while public discovery/detail excludes inactive ones; avoids two divergent code paths by parameterizing the same query.
- **Alternatives considered**: Separate public/private endpoints — rejected as unnecessary duplication; a single endpoint with conditional visibility mirrors how `getListingDetails` already works for a single resource.
