AutoSouk is Morocco's marketplace for used cars where every listing can be checked by an independent, reviewed mechanic in the car's city. The interface should feel **calm, warm and factual**: sand paper, Majorelle blue for the one thing to do next, saffron for delight, and data set in mono so it reads like a document you can trust.

## Voice and content

- The product speaks French (the API default), English and Arabic. This system's source copy is English: keep strings short and free of idioms so they translate cleanly, and leave room for French, which runs about 20–30% longer. Sentence case everywhere ("Request inspection", "Saved cars"), never Title Case or ALL CAPS — except `overline` eyebrows, which are uppercase by style.
- Speak to the user as "you"; AutoSouk speaks as "we" ("We sent a verification link…").
- Lead with facts, not adjectives: "2021 · 68 000 km · Diesel · Manual", "Mileage consistent · CT valid". Separate facts with a middle dot ` · `.
- Money is always `<number> MAD` (Arabic: `درهم`), with a narrow no-break space (U+202F) as thousands separator ("265 000 MAD"): it keeps the number together and in the right order in Arabic. Set the number in `price-l`/`price-m`, the currency in `mono-s` `muted`.
- Moroccan terms stay as Moroccans say them: matricule, carte grise, contrôle technique (CT), vignette, dédouanée. Explain once with a helper line, don't translate them away.
- Status words come from the API's `enums` catalog (`listing_status`, `inspection_status`, `inspection_verdict`, `inspection_item_status`, `role`…), in every language: Draft, Pending review, Approved, Rejected, Withdrawn, Sold for listings; Pending, Accepted, In progress, Completed, Rejected, Cancelled for inspections.
- No emoji in UI. The only exception is the greeting on mobile Explore ("Salam Amine 👋").

## Languages and right to left

- Three languages, same as the API: **Français** (default for new visitors), **English** and **العربية**. Write each language name in its own language and script, never a flag.
- The language switch (`LanguageSwitch`) sits in the desktop nav and in mobile Account; guests see it too. Switching changes the interface at once and sends the language with every API call (`Accept-Language` or `?lang=`), so errors, success messages and labels come back in that language.
- What the client translates: its own UI text (buttons, titles, helper copy) and every value the API returns as a slug — cities, fuel, gearbox, condition, origin, equipment, statuses, verdicts, roles — through the `enums` catalog. What it never translates: text people typed (titles, descriptions, reviews, inspection notes) and car makes and models.
- API errors arrive translated, with a stable `code` and the input's `field`: show the message under that field in `danger`, and branch on `code`, never on the message.
- The account's language is saved at sign-up and drives the emails and the inspection-report PDF. The API has no way to change it later, so wherever someone picks a language, say which language their emails and reports will use.
- Arabic pages set `dir="rtl" lang="ar"` on the root. Components follow: rows mirror, photo overlays use logical insets, and `arrow-*`, `chevron-left/right` and `logout` icons flip. Logos, play buttons, clocks and charts never flip.
- Arabic uses Western digits (as in Moroccan listings and the API's PDFs). Keep numbers, plates, VINs and prices isolated as left-to-right runs (`<bdi dir="ltr">`, or U+202F inside numbers) so "265 000" never turns into "000 265".
- No letter-spacing and no uppercase in Arabic: the components remove both under `lang="ar"`.

## Colour

- `paper` is the page; `surface` is anything that sits on it (cards, inputs, sheets). `surface-2` is for sunken areas (kanban columns, drop zones, modal footers).
- Text: `ink` for titles and values, `ink-2` for paragraphs, `muted` for meta on `surface`. `subtle` is for placeholders and for text on `night` only.
- `brand` (Majorelle blue) marks **the** action and the current state: primary buttons, active nav dot, selected cards (`brand-soft` fill + 2px `brand` border), focus rings, links. One primary button per view.
- `saffron` is delight, never state: rating stars, the logo's wheels and star badge, the highlighted word in a hero ("trust."), the seller CTA band. Text on saffron is always `ink`.
- `night` bands (with `ZelligePattern`) carry the brand moments: auth brand panel, home hero, report verdict header, footer, admin sidebar.
- Status pairs, always with a word or icon too: `success`/`success-soft` (inspected, pass, approved, accepting), `warning`/`warning-soft` (pending, attention), `danger`/`danger-soft` (rejected, fail, destructive), `info`/`info-soft` (in progress, withdrawn).
- Contrast notes (source values kept): `muted` on `paper` is 4.1:1 and `warning` on `warning-soft` 3.5:1 — keep both to 12–14px medium meta/badges; never body copy.

## Typography

- Three families: **Bricolage Grotesque** (display: `display-xl` … `h3`, `price-l`, `price-m`), **Geist** (interface: `h4`, `h5`, `body-*`, `label-*`), **Geist Mono** (`overline`, `mono-m`, `mono-s`).
- Desktop page titles use `display-m`; heroes `display-l`/`display-xl`. Mobile page titles use `h1`.
- Put an `overline` eyebrow in `brand` or `muted` above every page title ("SELLER DASHBOARD" / "My listings").
- Identifiers are always mono: VIN, matricule, carte grise number, coordinates, inspection numbers, counts in tabs.
- Never set paragraphs in Bricolage; never set headlines in Geist Mono.
- Arabic is set in **IBM Plex Sans Arabic** (the face the API's Arabic PDFs use), which sits second in every family so Arabic text picks it up automatically while Latin names and numbers stay in Geist and Bricolage.

## Space and layout

- Desktop frames are 1440 wide with `space-80` side padding (content 1280), `space-48` gaps between columns and `space-96` between major sections. Nav is 76px tall.
- Grids: listing cards 302 wide × 4 columns with `space-24` gaps; 3 columns (300) beside the 300px filter sidebar; tablet (834) reflows to 2 columns; mobile cards are full width (350) with `space-20` gutters.
- Detail pages use a main column plus a 360–400px sticky sidebar for the price card / request card.
- Mobile frames are 390 × 844: status bar 47, header 60, bottom tab bar 86 (with the raised `brand` Sell button), and a sticky bottom action bar for the screen's primary action.

## Shape and elevation

- Controls are pills (`radius-full`): buttons, chips, badges, toggles, segmented controls, search bars.
- Cards and maps use `radius-xl`; inputs and icon boxes `radius-md`; upload tiles and notices `radius-lg`; hero bands `radius-2xl`.
- Borders before shadows: cards on `paper` get an inset 1px `line`. Use `elevation-1` for listing cards and active segments, `elevation-2` only for things that float (price card, auth card, dropdowns, map pins, modals) and `elevation-brand` only under primary buttons and the Sell button.

## Imagery

- Real listing photos are user uploads; until they load, use `CarPhoto` placeholders in one of seven tones (sand, majorelle, clay, olive, night, sky, saffron) and vary tones across a grid.
- Car media rules (from the API): at least 3 photos, at most 20 files including videos, and the cover is always a photo. Show `MediaLimits` above every media grid; new uploads go live (and send the listing back to review) only when confirmed, while deleting media or changing the cover keeps the listing's status. Never offer a delete that would leave fewer than 3 photos: lock it and ask for a replacement first.
- Photo overlays: a white pill for "Inspected · score" top-left, a white round heart top-right, a dark pill photo counter bottom-left.
- Maps use the `MapView` style: warm land, white streets, one saffron artery, `brand` active pin.
- The zellige star pattern only appears on `night`.

## Iconography

- One set: 24px line icons, 2px round stroke (Lucide-style paths), files under Assets → Icons, rendered by the `Icon` component. Colour icons with tokens; filled icons only for the favourite heart (`danger`) and rating stars (`saffron`).
- Icon meanings are fixed: `shield` = inspection/verified, `wrench` = mechanic/garage, `car` = listing/buyer, `grid` = seller, `file` = report, `map-pin` = city, `gauge` = mileage, `hash` = identity numbers.

## Components and screens

- Build screens from the components here: `NavDesktop` / `MobileHeader` + `StatusBar` + `TabBar` for chrome; `ListingCard`, `MechanicCard`, `ReviewItem`, `MapView` for marketplace content; `ScoreRing`, `ChecklistRow`, `InspectionTimeline` for inspections; `Input`, `Chip`, `Segmented`, `Stepper`, `UploadTile`, `MediaLimits`, `EquipmentPill` for forms; `EquipmentGroup` for car equipment (pick, filter, show); `Badge`, `StatCard`, `Tabs`, `Pagination` for dashboards; `LanguageSwitch` for the language. Text components take `lang` (`en`, `fr`, `ar`).
- The header `RoleSwitch` changes perspective (Buyer, Seller, Mechanic); it never grants permissions — every role check is server-side.
- Inspection reports always show, in this order: score ring + verdict word, identity facts (matricule, VIN, carte grise, mileage consistency, first registration, CT, vignette), summary, sections (exterior, interior, mechanical, electrical, under vehicle, road test), estimated repairs, photos, signed PDF.
- Forms validate at the boundary: show the API's validation message under the field in `danger` (`Input` state `error`).
- Focus: a 2px `brand` ring (inputs add a 4px `brand-soft` halo); never remove focus outlines.
