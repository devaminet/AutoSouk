# Quickstart: Validating the Mechanics Feature

Prerequisites: local stack running per existing project conventions (`docker-compose-test.yml` for the test database/Minio, `.env`/`.env.test` configured as for any other AutoSouk feature). Run from the repository root.

## 1. Start dependencies and apply migrations

```bash
docker compose -f ./docker-compose-test.yml up -d
npm run db:migrate
```

The mechanics migration (generated during implementation, e.g. `drizzle/0019_*.sql`) creates `mechanics` and `mechanic_garage_images` alongside existing tables; `src/test/setup.ts` re-applies migrations and seeds (`roles`, `cities`, etc.) automatically for the Jest run.

## 2. Run the automated test suite for this feature

```bash
npm test -- src/api/mechanics
npm test -- src/api/listings
```

Expected: all mechanic profile, garage-image, activation, authorization, and listing-discovery tests pass, alongside the existing listing test suite (unaffected except for the new discovery route).

## 3. Manual/scripted end-to-end validation (via `curl` or Supertest-style requests)

1. **Register and sign in a mechanic**
   - `POST /api/auth/register` with `userType: "mechanic"`, verify email, `POST /api/auth/login` → obtain `accessToken`.
2. **Create a mechanic profile** (User Story 1)
   - `POST /api/mechanics` with `{ name, cityId, address, latitude, longitude }` → expect `201` and a retrievable profile via `GET /api/mechanics/me`.
   - Retry without `latitude`/`longitude` → expect `400`.
3. **Add and remove a garage image** (User Story 4)
   - `POST /api/mechanics/me/garage-images` with a valid image filename → expect `201` with a presigned upload URL; PUT the file to that URL.
   - `DELETE /api/mechanics/me/garage-images/:imageId` → expect `200`, image no longer listed on the profile.
4. **Create a listing in the same city and discover the mechanic** (User Story 2)
   - Create/approve a listing whose car's `cityId` matches the mechanic's `cityId` (reuse existing listing creation + admin approval flow).
   - `GET /api/listings/:id/mechanics` (no auth) → expect the mechanic in the results, with `latitude`/`longitude` and garage images present.
5. **View the mechanic's public profile directly** (User Story 3)
   - `GET /api/mechanics/:id` without auth → expect the full public profile.
6. **Deactivate the mechanic and re-check** (User Story 5)
   - `PATCH /api/mechanics/me/status` with `{ isActive: false }`.
   - Repeat step 4's discovery call → expect the mechanic excluded (empty result if it was the only one in that city).
   - Repeat step 5's public profile call → expect `404`.
   - `GET /api/mechanics/me` (as the owner) → still returns the profile.
7. **Cross-listing status check** (Clarification 1)
   - Request `GET /api/listings/:id/mechanics` for a listing that is still `draft`/`pending` (not yet approved) → expect an empty result, not the mechanics from that city.
8. **Authorization boundary check**
   - Attempt any mutation (`PATCH`/`DELETE` on profile or images) using a second mechanic's access token → expect `404`/`403` per the contract, never success.

## Success criteria mapping

| Spec Success Criterion                       | Validated by step |
| -------------------------------------------- | ----------------- |
| SC-001 (profile creation speed)              | Step 2            |
| SC-002 (discovery returns correct matches)   | Step 4            |
| SC-003 (empty result, not error)             | Steps 6–7         |
| SC-004 (status change reflected immediately) | Step 6            |
| SC-005 (no cross-mechanic modification)      | Step 8            |
| SC-006 (public browsing without an account)  | Steps 4–5         |
