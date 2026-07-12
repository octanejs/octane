---
'octane': patch
---

View Transitions phase 5 (final): Fizz-parity SSR annotations. Server renders
now stamp resolved `vt-*` attributes on each `<ViewTransition>` boundary's
first element — `vt-update` always (per-type maps resolve to their `default`;
SSR has no transition types), `vt-name` + `vt-share` for explicitly named
boundaries and for boundaries wrapping a Suspense boundary (auto names derive
from the stable frame path, so every streaming pass mints the same name and
the fallback/content captures pair across the swap), and `vt-enter`/`vt-exit`
on boundaries at the top of a Suspense content/fallback arm (both can apply).
Streamed segment chunks carry the wrapping boundary's name onto the revealed
content. Hydration adopts the annotations untouched. All 4
ReactDOMFizzViewTransition tests are ported and passing — the View
Transitions plan is complete (see docs/view-transitions.md for the user-facing
guide).
