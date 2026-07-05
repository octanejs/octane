---
'octane': patch
---

SSR serialization + hydration React-parity fixes (Tier-4 conformance):

- Adjacent dynamic text holes serialize with a `<!-- -->` separator so the parser can't merge them; the hydration walk adopts each hole's node (previously the second hole's content was lost, and adjacent empty holes crashed hydration). Empty static text literals no longer desync template child paths.
- Multi-root fragment bodies hydrate through a virtual wrapper: root fragments with component members adopt cleanly (previously the cursor desynced and content was detached/re-appended), and the mount drain is a hydration no-op (`drainFrag`).
- Nested-array children flatten one item per leaf in the de-opt list (React fragment semantics) — previously a nested array member rendered as nothing on the client and desynced hydration; component-bearing items now borrow their adopted item range.
- `ssrAttr` mirrors React's value-type filters where the functional outcome flips: boolean-prop falsy drop (`hidden={0}`, `inert=""`), positive-numeric drop (`size={0}`), empty `src`/`href` strip (except `<a>`/`<area>`), function/symbol drop, `data-*` boolean stringify (client `setAttribute` too), boolean drop on string props (`href={true}`), unknown lowercase `on*` drop, `htmlFor` kept verbatim on custom elements, and `suppressContentEditableWarning` never serializes.
- `<pre>`/`<textarea>`/`<listing>` protect a leading newline (the parser eats it) by emitting an extra `\n`.
- A plain-object child throws ("Objects are not valid as a child") instead of serializing `[object Object]`.
- Parser CR/CRLF→LF normalization no longer reports a spurious hydration text mismatch.
