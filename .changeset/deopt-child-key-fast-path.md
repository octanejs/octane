---
'octane': patch
---

De-opt child reconciliation keys skip the JSON serializer at the unwrapped top
level — the shape every `{items.map(...)}` list and every `@octanejs/*` binding's
rendered output produces. That level re-keyed every child on every parent
render, including renders where all children went on to bail, so a 1,000-row
list allocated 1,000 serialized strings per update. Nested wrapper paths keep
the serialized encoding, and the two aliasing properties it provides (an
explicit `key="0"` stays distinct from an implicit index 0; a user key cannot
resemble a wrapper path) are preserved.

On the `benchmarks/memo-wall` value-position wall, a Chromium CPU profile of the
all-bail parent re-render drops the flatten step from 13.4% to 6.0% of samples
and total samples by 13.8%; the timed op moves from 1.48x to 1.39x React.
