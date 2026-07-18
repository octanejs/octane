---
'octane': patch
---

Keep scoped-style hashes stable across Hydrate splitting and renderer-boundary lowering: the compiler now restamps every scoped `<style>` with its authored-position hash after a source rewrite, so client and server compiles of one module always agree on the emitted scope classes instead of hydration-mismatching every element after a split boundary. A scoped `<style>` authored directly inside split Hydrate children is now a compile error (`OCTANE_HYDRATE_SPLIT_STYLE`) because extraction would tear the owning component's single style scope in half; move the style outside the boundary, into a child component, or opt out with `split={false}`.
