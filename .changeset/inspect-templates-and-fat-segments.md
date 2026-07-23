---
'octane': patch
---

New opt-in compiler inspection surface: `compile(source, file, { inspect:
true })` (client mode) returns `result.inspect` with `templates` — per hoisted
template, `(offset range in the template HTML) → (authored source range)`
origin entries for baked tags, static attributes (escaped values included),
and static text, recorded at append time with no re-lexing — and `segments` —
the module map's decoded segments enriched with absolute source offsets
including node-exact source ENDS (which standard source maps cannot express),
resolved via a smallest-node-at-offset index over the parse. Emitted code is
byte-identical with the option on or off, and normal compiles skip all
recording. This is the data contract for source↔output navigation tooling
such as the playground.
