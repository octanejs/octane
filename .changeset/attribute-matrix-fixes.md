---
'octane': patch
---

Attribute-write fixes surfaced by the Tier-3 React DOM attribute-matrix port:

- **Enumerated attributes stringify their boolean form**: `spellCheck={false}` / `contentEditable={false}` / `draggable={false}` now write `"false"` instead of removing the attribute — an absent enumerated attribute means "inherit / UA default", a genuinely different platform state (e.g. `contentEditable={false}` used to silently flip back to inherited editability).
- **Empty `src`/`href` are stripped** (React parity, dev + prod): an empty-string URL resolves to the current page, so browsers would re-fetch the whole document as an image/script/stylesheet. `<a href="">`/`<area href="">` keep it (a legitimate self-link).
- **Function and symbol attribute values are removed** instead of stringified — a function's source text can never leak into the DOM.
- **`className={null}` removes the `class` attribute** (React parity); an empty string still writes `class=""` — the raw-value distinction is checked before clsx composition erases it.
- **SSR style values are trimmed** (`{left: '16 '}` → `left:16`), matching what the client CSSOM produces on parse — removes a server/client byte divergence.

Documented intentional divergences (native pass-through, no known-attribute table): `unknown={true}` writes boolean presence (`""`) rather than being stripped; `inert=""` stays present (platform: presence = true; React coerces to false); truthy strings on boolean attributes stay verbatim (`disabled="disabled"` — functionally identical state); throwing-valueOf objects render their `toString()` instead of throwing. React-19 custom-element semantics (lowercase `on*` listeners, property-vs-attribute heuristics) remain an open, pinned gap.
