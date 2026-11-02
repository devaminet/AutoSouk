# AutoSouk design

The design spec for the AutoSouk frontend: brand rules, design tokens, components and every screen. It was exported from the AutoSouk design system and screen canvas on 2 November 2026.

Once the frontend's component library exists, **the code is the source of truth**. This folder is the spec the first build follows. After that, update it only when a new feature is designed.

## What's here

| Path | What it is | Use it for |
|---|---|---|
| `brand.md` | Brand book: voice, languages and RTL, colour, type, space, shape, imagery, icons | The rules. Read it before any UI work. |
| `tokens.json` | All design tokens with usage notes (colour, type, spacing, radius, shadow, fonts) | The source for the app's theme. |
| `tokens.css` | The same tokens as CSS variables, `@font-face` rules and text-style classes (`.h1`, `.body-m`, `.label-s`, `.price-l`, `.overline`…) | Import it directly, or port it to the app's styling system. |
| `fonts/` | Bricolage Grotesque (display), Geist (UI), Geist Mono (data), IBM Plex Sans Arabic (Arabic), woff2 | Self-host these. |
| `assets/icons/` | 59 line icons, 24px grid, 2px stroke | The only icon set. Don't mix in another library. |
| `assets/logos/` | Logo mark, for light and dark backgrounds | Header, footer, favicon. |
| `assets/patterns/` | Zellige pattern tile | Only inside `night` bands (hero, auth panel, report verdict). |
| `components/` | One PNG and usage notes per component, plus `reference/` (the design's React implementation, its CSS and prop types) | Building the component library. |
| `screens/` | Every screen as PNG, grouped by area, with the API endpoints each one uses. `_source/` holds the design files. | Building pages. |

## Rules that matter most

- **Use tokens, never raw values.** Every colour, font size, radius, space and shadow comes from `tokens.css` / `tokens.json`. If something is missing, add a token rather than hard-coding a value.
- **Three languages: French (the API default), English and Arabic.** Arabic is right to left. Use logical CSS properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`), never left/right. Flip directional icons (arrows, chevrons, back, log out) in RTL. Wrap prices, mileage and counts in `<bdi dir="ltr">` so numbers read correctly. Arabic text uses IBM Plex Sans Arabic with no letter-spacing (see `brand.md › Languages and right to left`).
- **Prices** are written `265 000 MAD`, with a narrow no-break space as the thousands separator (`درهم` in Arabic).
- **Badges always carry a word.** Never use colour alone for a status.
- **Use one primary (Majorelle) button per view**, for the action the view exists for.
- **Server text is already translated.** Show the API's error `message`, attach it to the field named by `field`, and send the language as `?lang=` or `Accept-Language`.

## How to build from it

1. Port `tokens.css` into the app's theme (CSS variables, Tailwind theme or equivalent) and load the fonts.
2. Build the components in `components/` in the app's framework. Match each PNG, and read `components/reference/bundle.js` and `bundle.css` for exact sizes, states and props. Don't ship the reference bundle itself.
3. Build each screen from those components. Match its PNG, take the copy and layout details from its `_source/` file, and use the endpoints listed in `screens/README.md`.
4. Check every screen in English, French and Arabic, and at mobile width.

## Known gaps

- **Withdrawn and Sold:** the design shows these statuses in My listings, but the API has no endpoint that sets them yet. Hide them until it does.
- **Admin:** the screen only shows numbers the API can provide (pending count, longest wait). It has no approved or rejected totals.
- **Arabic copy** in the screens needs a native speaker's review before launch.
- **Placeholder imagery:** `CarPhoto` and `MapView` are placeholders. Replace them with real listing media (MinIO URLs) and a real map.
