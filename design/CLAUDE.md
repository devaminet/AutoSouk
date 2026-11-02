# Design rules for Claude Code

This folder is the AutoSouk design spec. Follow it for all frontend UI work.

Before building or changing UI:
1. Read `design/README.md` and `design/brand.md`.
2. For a component, open its PNG in `design/components/` and read its notes in `design/components/README.md`. Read `design/components/reference/bundle.js` and `bundle.css` for exact sizes, states and props.
3. For a screen, find it in `design/screens/README.md`. Open its PNG and read its `_source/*.dc.html` for copy and layout. Use the API endpoints listed there.

Rules:
- Take every colour, font size, space, radius and shadow from the design tokens (`design/tokens.css` / `tokens.json`, or the app's theme built from them). Never hard-code a hex value or a pixel size that has a token. If a token is missing, add it to the theme and say so.
- Reuse existing components. Build a new one only when none fits, and match the brand rules when you do.
- The `.dc.html` files and `reference/bundle.js` are specs, not app code. Rebuild them in the app's framework. Never import or copy the `x-import`, `sc-for` or `{{…}}` markup.
- Support fr (default), en and ar. Use logical CSS properties only. Flip directional icons in RTL. Isolate numbers with `<bdi dir="ltr">`. Never hard-code UI strings: put them in the translation files for all three languages.
- Use icons from `design/assets/icons/` only.
- After building a screen, render it and compare it with its PNG, in Arabic and at 390px wide as well. Fix any differences before calling it done.
- If the design and the API disagree (a field or status the API doesn't have), follow the API, then flag the mismatch.
