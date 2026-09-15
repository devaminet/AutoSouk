# API Contract: Mechanics

Conventions follow the existing AutoSouk API: JSON bodies, Zod-validated inputs, `Authorization: Bearer <accessToken>` for authenticated routes, errors handled by the global error handler with the existing error classes (`RequestValidationError` → 400, `BadRequestError` → 400, `NotAuthorizedError` → 401, `NotAllowedError` → 403, `NotFoundError` → 404, `InternalServerError` → 500).

## Mechanic profile & image management — `src/api/mechanics`, mounted at `/api/mechanics`

### `POST /api/mechanics`

- **Auth**: `isAuthenticated`, `isMechanic`
- **Body**: `{ name, cityId, address, latitude, longitude, description?, phone?, inspectionPrice?, profileImageFilename? }`
- **201**: `{ mechanic: <self profile response> }` (includes a presigned PUT URL for `profileImageFilename` if provided, matching the car-media upload pattern)
- **400**: validation failure (missing/invalid fields, out-of-range coordinates) → `RequestValidationError`
- **400**: mechanic already has a profile → `BadRequestError`
- **401**: not authenticated → `NotAuthorizedError`
- **403**: authenticated but not the `mechanic` role → `NotAllowedError`

### `GET /api/mechanics/me`

- **Auth**: `isAuthenticated`, `isMechanic`
- **200**: `{ mechanic: <self profile response> }` regardless of `isActive`
- **404**: no profile yet created → `NotFoundError`

### `PATCH /api/mechanics/me`

- **Auth**: `isAuthenticated`, `isMechanic`
- **Body**: any subset of `{ name, cityId, address, latitude, longitude, description, phone, inspectionPrice, profileImageFilename }`
- **200**: `{ mechanic: <self profile response> }`
- **400**: validation failure → `RequestValidationError`
- **404**: no profile yet created → `NotFoundError`

### `PATCH /api/mechanics/me/status`

- **Auth**: `isAuthenticated`, `isMechanic`
- **Body**: `{ isActive: boolean }`
- **200**: `{ mechanic: <self profile response> }`
- **400**: validation failure → `RequestValidationError`
- **404**: no profile yet created → `NotFoundError`

### `POST /api/mechanics/me/garage-images`

- **Auth**: `isAuthenticated`, `isMechanic`
- **Body**: `{ filenames: string[] }` (allowed image extensions only)
- **201**: `{ garageImages: [{ id, filename, signedUrl }] }` (presigned PUT URLs, same pattern as `attachCarToListing`)
- **400**: validation failure (bad file type) → `RequestValidationError`
- **404**: no profile yet created → `NotFoundError`

### `DELETE /api/mechanics/me/garage-images/:imageId`

- **Auth**: `isAuthenticated`, `isMechanic`
- **200**: `{ deleted: true, imageId }`
- **404**: image not found, or not owned by the requesting mechanic → `NotFoundError`

### `GET /api/mechanics/:id`

- **Auth**: none required (public); `current_user` middleware still attaches `req.currentUser` if a token is present
- **200**: `{ mechanic: <public profile response> }` — full response for the owning mechanic even if inactive; active-only for everyone else
- **404**: mechanic does not exist, or is inactive and requester is not the owner → `NotFoundError`

## Listing-based discovery — added to `src/api/listings/routes.ts`

### `GET /api/listings/:id/mechanics`

- **Auth**: none required (public)
- **Query**: `page?` (default 1), `limit?` (default 10, capped)
- **200**: `{ mechanics: [<public profile response>, ...], meta: { total, page, limit, totalPages } }`
  - Returns an empty `mechanics` array (with zeroed `meta`) when: the listing does not exist, the listing's `status` is not `approved`, the listing has no attached car/city, or the resolved city has no active mechanics.
- **400**: invalid `id`, `page`, or `limit` → `RequestValidationError`

## Shared response shape: profile object

```jsonc
{
  "id": 1,
  "name": "Atlas Auto Care",
  "city": { "id": 3, "name": "Casablanca" },
  "address": "12 Rue Example",
  "latitude": 33.5731,
  "longitude": -7.5898,
  "description": "Certified multi-brand inspection garage.",
  "phone": "+212600000000",
  "inspectionPrice": 300,
  "profileImageUrl": "https://minio.example/mechanics/....jpg?X-Amz-...",
  "isActive": true,
  "garageImages": [
    { "id": 10, "link": "https://minio.example/mechanics/....jpg?X-Amz-..." },
  ],
}
```
