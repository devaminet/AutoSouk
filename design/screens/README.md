# Screens

Every screen of the AutoSouk design, rendered as PNG. Desktop screens are 1440 wide and fluid (they reflow down to tablet width); mobile screens are 390 × 844 (exported at 2×). `_source/` holds the design files the PNGs were rendered from: read them for exact copy, spacing and component props, but they use the design tool's own syntax (`x-import`, `sc-for`, `{{holes}}`), so never copy their markup into the app.

The **API** column lists the backend endpoints each screen uses (from `src/routes.ts`).


## Marketplace

| Screen | Kind | File | API |
|---|---|---|---|
| Explore (home) | desktop | [Main.png](02-marketplace/Main.png) · [source](_source/Main.dc.html) | GET /api/listings (approved only), GET /api/makes, GET /api/lookups, GET /api/mechanics/rankings |
| Search results & filters | desktop | [Search.png](02-marketplace/Search.png) · [source](_source/Search.dc.html) | GET /api/listings with filters (make, model, city, price, fuel, gearbox, equipmentIds = must have all), page/limit; GET /api/equipment |
| Listing detail | desktop | [Listing.png](02-marketplace/Listing.png) · [source](_source/Listing.dc.html) | GET /api/listings/:id, GET /api/listings/:id/mechanics, POST/DELETE /api/favorite_listings |
| Favorites | desktop | [Favorites.png](02-marketplace/Favorites.png) · [source](_source/Favorites.dc.html) | GET /api/favorite_listings, DELETE /api/favorite_listings/:listingId |
| Explore · mobile | mobile | [M-Explore.png](02-marketplace/M-Explore.png) · [source](_source/M-Explore.dc.html) | GET /api/listings |
| Filters sheet · mobile | mobile | [M-Filters.png](02-marketplace/M-Filters.png) · [source](_source/M-Filters.dc.html) | GET /api/listings filters, GET /api/lookups |
| Listing detail · mobile | mobile | [M-Listing.png](02-marketplace/M-Listing.png) · [source](_source/M-Listing.dc.html) | GET /api/listings/:id |
| Favorites · mobile | mobile | [M-Favorites.png](02-marketplace/M-Favorites.png) · [source](_source/M-Favorites.dc.html) | GET /api/favorite_listings |
| Favorites empty · mobile | mobile | [M-Favorites-Empty.png](02-marketplace/M-Favorites-Empty.png) · [source](_source/M-Favorites-Empty.dc.html) | GET /api/favorite_listings (empty) |
| Equipment filter · mobile | mobile | [M-Equipment.png](02-marketplace/M-Equipment.png) · [source](_source/M-Equipment.dc.html) | GET /api/equipment (5 categories, 72 items) |

## Auth & account

| Screen | Kind | File | API |
|---|---|---|---|
| Sign up | desktop | [SignUp.png](01-auth-and-account/SignUp.png) · [source](_source/SignUp.dc.html) | POST /api/auth/register (role, locale saved for emails and PDFs) |
| Log in | desktop | [Login.png](01-auth-and-account/Login.png) · [source](_source/Login.dc.html) | POST /api/auth/login |
| Verify email | desktop | [Verify.png](01-auth-and-account/Verify.png) · [source](_source/Verify.dc.html) | POST /api/auth/re-verify (resend) |
| Email verified · link landing page | desktop | [VerifyResult.png](01-auth-and-account/VerifyResult.png) · [source](_source/VerifyResult.dc.html) | Client route /verify-email?status=success|error&code=…&lang=… (GET /api/auth/verify redirects here) |
| Forgot password | desktop | [ForgotPassword.png](01-auth-and-account/ForgotPassword.png) · [source](_source/ForgotPassword.dc.html) | POST /api/auth/forgot-password |
| Set new password | desktop | [NewPassword.png](01-auth-and-account/NewPassword.png) · [source](_source/NewPassword.dc.html) | GET + PUT /api/auth/forgot-password |
| Account settings | desktop | [Account.png](01-auth-and-account/Account.png) · [source](_source/Account.dc.html) | POST /api/auth/profile-image + /confirm, PUT /api/auth/reset-password, POST /api/auth/logout |
| Sign up · mobile | mobile | [M-SignUp.png](01-auth-and-account/M-SignUp.png) · [source](_source/M-SignUp.dc.html) | POST /api/auth/register |
| Log in · mobile | mobile | [M-Login.png](01-auth-and-account/M-Login.png) · [source](_source/M-Login.dc.html) | POST /api/auth/login |
| Verify email · mobile | mobile | [M-Verify.png](01-auth-and-account/M-Verify.png) · [source](_source/M-Verify.dc.html) | POST /api/auth/re-verify |
| Verification link expired · mobile | mobile | [M-VerifyExpired.png](01-auth-and-account/M-VerifyExpired.png) · [source](_source/M-VerifyExpired.dc.html) | /verify-email?status=error → POST /api/auth/re-verify |
| Account · mobile | mobile | [M-Account.png](01-auth-and-account/M-Account.png) · [source](_source/M-Account.dc.html) | auth profile endpoints |

## Mechanics & reviews

| Screen | Kind | File | API |
|---|---|---|---|
| Mechanics & rankings | desktop | [Mechanics.png](04-mechanics-and-reviews/Mechanics.png) · [source](_source/Mechanics.dc.html) | GET /api/mechanics/rankings |
| Mechanic profile & reviews | desktop | [MechanicProfile.png](04-mechanics-and-reviews/MechanicProfile.png) · [source](_source/MechanicProfile.dc.html) | GET /api/mechanics/:id, GET /api/mechanics/:id/reviews |
| Write / edit review | desktop | [ReviewModal.png](04-mechanics-and-reviews/ReviewModal.png) · [source](_source/ReviewModal.dc.html) | POST / PATCH / DELETE /api/mechanics/:id/reviews(/me) |
| Workshop profile (mechanic) | desktop | [Workshop.png](04-mechanics-and-reviews/Workshop.png) · [source](_source/Workshop.dc.html) | GET + PATCH /api/mechanics/me, PATCH /api/mechanics/me/status, POST/DELETE /api/mechanics/me/garage-images |
| Mechanic profile · mobile | mobile | [M-MechanicProfile.png](04-mechanics-and-reviews/M-MechanicProfile.png) · [source](_source/M-MechanicProfile.dc.html) | GET /api/mechanics/:id |
| Rankings · mobile | mobile | [M-Rankings.png](04-mechanics-and-reviews/M-Rankings.png) · [source](_source/M-Rankings.dc.html) | GET /api/mechanics/rankings |
| Workshop setup · mobile | mobile | [M-WorkshopSetup.png](04-mechanics-and-reviews/M-WorkshopSetup.png) · [source](_source/M-WorkshopSetup.dc.html) | POST /api/mechanics |

## Inspections

| Screen | Kind | File | API |
|---|---|---|---|
| Request inspection · modal | desktop | [RequestInspection.png](05-inspections/RequestInspection.png) · [source](_source/RequestInspection.dc.html) | POST /api/inspections, GET /api/listings/:id/mechanics |
| My inspections (buyer) | desktop | [MyInspections.png](05-inspections/MyInspections.png) · [source](_source/MyInspections.dc.html) | GET /api/inspections |
| Inspection queue (mechanic) | desktop | [InspectionQueue.png](05-inspections/InspectionQueue.png) · [source](_source/InspectionQueue.dc.html) | GET /api/inspections, PATCH /api/inspections/:id (accept / status) |
| Inspection report · form | desktop | [ReportForm.png](05-inspections/ReportForm.png) · [source](_source/ReportForm.dc.html) | POST /api/inspections/:id/report |
| Inspection report · view | desktop | [ReportView.png](05-inspections/ReportView.png) · [source](_source/ReportView.dc.html) | GET /api/inspections/:id (report + PDF in the user's locale) |
| Report · mobile | mobile | [M-Report.png](05-inspections/M-Report.png) · [source](_source/M-Report.dc.html) | GET /api/inspections/:id |
| Queue · mobile | mobile | [M-Queue.png](05-inspections/M-Queue.png) · [source](_source/M-Queue.dc.html) | GET /api/inspections |
| My inspections · mobile | mobile | [M-MyInspections.png](05-inspections/M-MyInspections.png) · [source](_source/M-MyInspections.dc.html) | GET /api/inspections |

## Admin

| Screen | Kind | File | API |
|---|---|---|---|
| Listing moderation (admin) | desktop | [Admin.png](06-admin/Admin.png) · [source](_source/Admin.dc.html) | GET /api/listings/pending, PATCH /api/listings/:id/approve, PATCH /api/listings/:id/reject {reason 1–1000} |

## Sell & listings

| Screen | Kind | File | API |
|---|---|---|---|
| Create listing · car details | desktop | [Sell-CarDetails.png](03-sell-and-listings/Sell-CarDetails.png) · [source](_source/Sell-CarDetails.dc.html) | POST /api/listings, POST /api/listings/:id/car (equipmentIds ≤ 100), GET /api/makes, /api/models/:make_id, /api/lookups, /api/equipment |
| Create listing · photos | desktop | [Sell-Photos.png](03-sell-and-listings/Sell-Photos.png) · [source](_source/Sell-Photos.dc.html) | POST /api/listings/:id/media (presigned), POST /api/listings/:id/media/confirm, PATCH …/media/:mediaId/primary |
| My listings (seller) | desktop | [MyListings.png](03-sell-and-listings/MyListings.png) · [source](_source/MyListings.dc.html) | GET /api/listings/mine?status=…, DELETE /api/listings/:id |
| Edit listing · drawer | desktop | [EditListing.png](03-sell-and-listings/EditListing.png) · [source](_source/EditListing.dc.html) | PATCH /api/listings/:id (sends back to pending), DELETE /api/listings/:id |
| Photos & videos (manage) | desktop | [ManageMedia.png](03-sell-and-listings/ManageMedia.png) · [source](_source/ManageMedia.dc.html) | POST/DELETE /api/listings/:id/media, PATCH …/primary, POST …/media/confirm |
| Equipment · mobile | mobile | [M-Sell-Equipment.png](03-sell-and-listings/M-Sell-Equipment.png) · [source](_source/M-Sell-Equipment.dc.html) | GET /api/equipment |
| Add photos · mobile | mobile | [M-Sell-Photos.png](03-sell-and-listings/M-Sell-Photos.png) · [source](_source/M-Sell-Photos.dc.html) | POST /api/listings/:id/media |
| Listing submitted · mobile | mobile | [M-Submitted.png](03-sell-and-listings/M-Submitted.png) · [source](_source/M-Submitted.dc.html) | POST /api/listings/:id/media/confirm → pending |
| My listings · mobile | mobile | [M-MyListings.png](03-sell-and-listings/M-MyListings.png) · [source](_source/M-MyListings.dc.html) | GET /api/listings/mine |
| Photos at the 3-photo minimum · mobile | mobile | [M-ManageMedia.png](03-sell-and-listings/M-ManageMedia.png) · [source](_source/M-ManageMedia.dc.html) | DELETE /api/listings/:id/media (refused below 3 images) |

## Languages

| Screen | Kind | File | API |
|---|---|---|---|
| Explore (home) · العربية, right to left | desktop | [AR-Main.png](07-languages/AR-Main.png) · [source](_source/AR-Main.dc.html) | ?lang=ar / Accept-Language: ar |
| Explore · Français, language menu open | desktop | [FR-Main.png](07-languages/FR-Main.png) · [source](_source/FR-Main.dc.html) | ?lang=fr |
| Listing · العربية · mobile | mobile | [AR-M-Listing.png](07-languages/AR-M-Listing.png) · [source](_source/AR-M-Listing.dc.html) | lang=ar |
| Report · العربية · mobile | mobile | [AR-M-Report.png](07-languages/AR-M-Report.png) · [source](_source/AR-M-Report.dc.html) | lang=ar |
| Sign up errors · Français · mobile | mobile | [FR-M-SignUp.png](07-languages/FR-M-SignUp.png) · [source](_source/FR-M-SignUp.dc.html) | error {code, message, field} in French |
| Language picker · mobile | mobile | [M-Language.png](07-languages/M-Language.png) · [source](_source/M-Language.dc.html) | client setting; sent as ?lang= or Accept-Language |
