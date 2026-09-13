# Feature Specification: Mechanics Directory & Listing-Based Discovery

**Feature Branch**: `003-mechanics-discovery`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Add a \"Mechanics\" feature to the AutoSouk REST API. Introduce a mechanic resource (name, optional profile picture, city, address, latitude/longitude, description, contact, rating if applicable, inspection price if applicable, active/inactive status) with optional garage/workshop images. Provide an endpoint to retrieve active mechanics located in the same city as a specific car listing, for future list/map display. City is derived from the listing automatically. Mechanics manage only their own profile and images; public users can only retrieve active mechanic information. No frontend, no distance/radius search, no booking/inspection workflow, no payments, and no new ratings system in this feature."

## Clarifications

### Session 2026-09-13

- Q: Should mechanic discovery work only for listings that are publicly approved, or for any existing listing regardless of status? → A: Only listings with status `approved` are eligible; requests for any other status return an empty/not-found result.
- Q: Should a mechanic's phone number and street address be visible to any unauthenticated visitor, or only to authenticated users? → A: Phone and address are fully public, visible to any unauthenticated visitor, matching existing public listing behavior.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Mechanic Creates and Maintains a Public Profile (Priority: P1)

As a user with the mechanic role, I want to create and maintain a public profile describing my business and physical location so that buyers can find and learn about my services.

**Why this priority**: This is foundational — no discovery or garage-image functionality has any value until a mechanic profile exists. It must exist before any other story can be tested end-to-end.

**Independent Test**: Sign in as a user with the mechanic role, submit a profile including all required fields (name, city, address, latitude, longitude) plus optional fields, then retrieve the profile and confirm the stored values match, and confirm the required fields are enforced when missing.

**Acceptance Scenarios**:

1. **Given** an authenticated mechanic without an existing profile, **When** they submit a profile with the required name, city, address, and coordinates, **Then** the profile is created and can be retrieved with the submitted information.
2. **Given** an authenticated mechanic submitting a profile without latitude/longitude, **When** the submission is made, **Then** it is rejected with a clear validation error and no profile is created.
3. **Given** a mechanic with an existing profile, **When** they update fields such as description, contact information, or inspection price, **Then** the changes are saved and returned on the next retrieval.
4. **Given** a mechanic who already has a profile, **When** they attempt to create a second profile, **Then** the request is rejected because a mechanic may only have one profile.

---

### User Story 2 - Buyer Discovers Active Mechanics for a Car Listing (Priority: P1)

As a buyer viewing a car listing, I want to retrieve the active mechanics located in the same city as that listing so that I can consider having the car inspected before purchasing.

**Why this priority**: This is the stated primary goal of the feature — connecting a listing view to relevant, nearby mechanics for a future list/map display.

**Independent Test**: With active mechanic profiles seeded in a known city and a listing whose car is located in that city, request mechanics for the listing (supplying only the listing identifier) and verify the returned mechanics all belong to that city, are active, and include location coordinates.

**Acceptance Scenarios**:

1. **Given** a listing located in a city with one or more active mechanics, **When** a user requests mechanics for that listing without specifying any city, **Then** all active mechanics in that listing's city are returned, each including latitude, longitude, and their public profile and garage image information.
2. **Given** a listing located in a city with no active mechanics, **When** mechanics are requested for that listing, **Then** an empty result is returned rather than an error.
3. **Given** a mechanic located in the listing's city whose profile is inactive, **When** mechanics are requested for that listing, **Then** the inactive mechanic is excluded from the results.
4. **Given** a listing whose city cannot be determined (for example, no vehicle has been attached to the listing yet), **When** mechanics are requested for that listing, **Then** an empty result is returned rather than exposing mechanics from unrelated cities.
5. **Given** a listing that is not in the `approved` status (for example draft, pending, withdrawn, rejected, or sold), **When** mechanics are requested for that listing, **Then** an empty/not-found result is returned rather than exposing the listing's city or any mechanics.

---

### User Story 3 - Anyone Views a Specific Mechanic's Full Profile (Priority: P2)

As a buyer researching a mechanic found through discovery, I want to view that mechanic's full public profile and garage photos so that I can decide whether to consider them before requesting an inspection.

**Why this priority**: Enriches the discovery experience with a detail view, but discovery itself (User Story 2) already delivers the primary listed information, so this is a valuable but secondary enhancement.

**Independent Test**: With an active mechanic profile that has garage images, request that mechanic's profile by its identifier as an unauthenticated visitor and verify the full profile and all garage images are returned; repeat for an inactive mechanic and verify it is not accessible publicly.

**Acceptance Scenarios**:

1. **Given** an active mechanic profile with garage images, **When** any user requests that mechanic's profile by its identifier, **Then** the full public profile and all associated garage images are returned.
2. **Given** an inactive mechanic profile, **When** a member of the public requests that profile, **Then** the request does not return the profile.
3. **Given** an inactive mechanic profile, **When** the owning mechanic requests their own profile, **Then** it is returned normally regardless of active status.

---

### User Story 4 - Mechanic Manages Garage/Workshop Photos (Priority: P2)

As a mechanic, I want to add and remove photos of my garage or workshop so that prospective customers can see where inspections would take place.

**Why this priority**: Garage images enrich the profile and discovery results but are explicitly optional, so the feature remains valuable without them.

**Independent Test**: As a mechanic with an existing profile, add a garage photo and confirm it appears in the profile's image list; remove it and confirm it no longer appears; attempt the same operations against another mechanic's profile and confirm they are denied.

**Acceptance Scenarios**:

1. **Given** a mechanic with an existing profile, **When** they add a garage photo, **Then** it is stored and appears in their profile's list of garage images.
2. **Given** a mechanic with multiple garage photos, **When** they remove one, **Then** it no longer appears in their profile's garage image list.
3. **Given** a mechanic profile with zero garage photos, **When** the profile or discovery results are retrieved, **Then** the garage image list is returned as empty without error.
4. **Given** a mechanic, **When** they attempt to add or remove a garage photo on another mechanic's profile, **Then** the request is denied.

---

### User Story 5 - Mechanic Controls Active/Inactive Availability (Priority: P3)

As a mechanic, I want to mark my own profile active or inactive so that I control whether I appear to buyers, for example while on leave.

**Why this priority**: Refines visibility control but the feature is already usable if every created profile defaults to a sensible visibility state; this adds explicit control.

**Independent Test**: As a mechanic, toggle a profile from active to inactive and confirm it disappears from a listing's discovery results and from public detail retrieval, then reactivate it and confirm it reappears.

**Acceptance Scenarios**:

1. **Given** an active mechanic profile, **When** the owning mechanic sets it to inactive, **Then** it is immediately excluded from public discovery and public detail retrieval.
2. **Given** an inactive mechanic profile, **When** the owning mechanic sets it back to active, **Then** it reappears in relevant discovery and public detail retrieval.
3. **Given** a mechanic, **When** they attempt to change another mechanic's active/inactive status, **Then** the request is denied.

### Edge Cases

- A listing's vehicle has no city set, or no vehicle has been attached to the listing at all: mechanic discovery for that listing returns an empty result rather than an error or unrelated mechanics.
- A listing exists but is not in the `approved` status (draft, pending, withdrawn, rejected, or sold): mechanic discovery treats it the same as a non-existent listing, returning an empty/not-found result without revealing the listing's city or status.
- A user without the mechanic role attempts to create a mechanic profile: the request is denied.
- A mechanic attempts to create a second profile after already having one: the request is rejected as a duplicate.
- A mechanic attempts to add a garage photo before completing their profile: the request is denied since no profile exists to attach the photo to.
- Two mechanics share the same city and similar names: both are returned distinctly in discovery results, distinguished by their own identifiers and locations.
- A mechanic's profile picture is omitted: the profile is still created and returned normally with no picture indicated.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST allow an authenticated user holding the mechanic role to create exactly one mechanic profile containing a name, city, address, latitude, and longitude, plus optional profile picture, description/bio, contact phone, and inspection price.
- **FR-002**: The system MUST require latitude and longitude for every mechanic profile, since a mechanic's physical location is mandatory.
- **FR-003**: The system MUST validate that submitted latitude and longitude values fall within valid geographic ranges.
- **FR-004**: The system MUST treat the mechanic's profile picture as optional; a profile MUST be creatable and fully usable without one.
- **FR-005**: The system MUST allow a mechanic to update their own profile's information at any time.
- **FR-006**: The system MUST prevent a mechanic from creating, viewing edit access to, updating, or deleting another mechanic's profile or images.
- **FR-007**: The system MUST allow a mechanic to attach zero or more garage/workshop images to their own profile, and to remove any of their own previously added garage images.
- **FR-008**: The system MUST allow a mechanic to set their own profile's status to active or inactive.
- **FR-009**: The system MUST exclude inactive mechanic profiles from all public-facing mechanic discovery and public profile retrieval, while still allowing the owning mechanic to view and manage their own profile regardless of its active status.
- **FR-010**: The system MUST provide a way to retrieve the active mechanics located in the same city as a specified car listing, without requiring the requester to supply the city.
- **FR-011**: The system MUST determine a listing's city automatically from the listing's associated vehicle data rather than accepting it as client input.
- **FR-012**: The system MUST return an empty result, rather than an error, when a listing's city has no active mechanics or when the listing's city cannot be determined.
- **FR-017**: The system MUST restrict mechanic discovery to listings whose status is `approved`; requests for a listing in any other status (draft, pending, withdrawn, rejected, or sold), or for a non-existent listing, MUST return an empty/not-found result without revealing the listing's city or status.
- **FR-013**: The system MUST include each returned mechanic's latitude and longitude in discovery results so they can be displayed on a map.
- **FR-014**: The system MUST include each mechanic's public profile information and associated garage images in both discovery results and individual profile retrieval.
- **FR-015**: The system MUST allow any visitor, including those who are not authenticated, to retrieve a single active mechanic's public profile and the results of listing-based mechanic discovery, including the mechanic's phone and address, consistent with the platform's existing public exposure of seller contact information on listings.
- **FR-016**: The system MUST store and manage mechanic profile pictures and garage images using the platform's existing image/file storage mechanism rather than a separate storage system.

### Key Entities _(include if feature involves data)_

- **Mechanic Profile**: The public business profile for a user holding the mechanic role. Attributes include name, optional profile picture, city, address, latitude, longitude, description/bio, contact phone, optional inspection price, and active/inactive status. Belongs to exactly one user account.
- **Garage Image**: A photograph of a mechanic's garage/workshop. Belongs to exactly one mechanic profile; a profile may have zero or many.
- **City**: The existing shared location reference already used by listings and user accounts; mechanic profiles reference the same list so discovery can match a listing's city exactly.
- **Car Listing** _(existing)_: The marketplace listing a buyer is viewing; its associated vehicle's city determines which mechanics are relevant.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A mechanic can complete their profile, including all required location details, in under 3 minutes.
- **SC-002**: 100% of requests for mechanics on a listing whose city has at least one active mechanic return the complete, correct set of matching mechanics with map coordinates.
- **SC-003**: 100% of requests for mechanics on a listing whose city has no active mechanics, or whose city cannot be determined, return a clear empty result instead of an error.
- **SC-004**: A mechanic's change to their active/inactive status is reflected in public discovery and profile retrieval on the very next request.
- **SC-005**: 0% of profile or garage-image modification attempts succeed when made by anyone other than the owning mechanic.
- **SC-006**: Public visitors can browse mechanic profiles, garage photos, and listing-based discovery results without creating an account.

## Assumptions

- The mechanic role already exists in the platform's role system (buyer, seller, mechanic, admin); this feature adds a dedicated profile for users holding that role rather than introducing a new role.
- Each mechanic user account has at most one mechanic profile (a one-to-one relationship).
- Mechanic city selection reuses the platform's existing shared city reference list already used for user accounts and car listings, enabling exact-match discovery without duplicating location data.
- Discovery matches mechanics to a listing by exact city match only. Radius/distance-based search, "nearest mechanic" queries, and distance sorting are out of scope for this version, but the stored address/latitude/longitude data is structured so those capabilities can be added later without a data model change.
- No inspection-request/booking workflow, payment processing, or ratings/reviews system exists in the platform today, and none of these are introduced by this feature. An optional inspection price is captured for informational display only, not for processing payments or bookings.
- Since no ratings/reviews system exists yet, mechanic rating display or computation is out of scope for this feature and will be introduced alongside a future reviews capability.
- There is no limit on the number of garage images a mechanic may add, consistent with how other image galleries are handled elsewhere in the platform.
- Mechanic discovery and individual mechanic profile retrieval are available to unauthenticated/public visitors, consistent with how car listings are already publicly browsable.
- This feature does not introduce new administrator-specific mechanic management capabilities; if broader administrative oversight of mechanics is needed later, it will follow the existing admin authorization pattern already used elsewhere in the platform (for example, listing approval).
