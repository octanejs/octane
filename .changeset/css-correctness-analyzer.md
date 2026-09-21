---
'octane': patch
---

Add compile-path CSS-correctness diagnostics for scoped `<style>` blocks.
A new Octane-owned `analyzeStyleCorrectness` pass emits collected diagnostics
on both `compile()` and `compileToVolarMappings`:

- `octane-css-unknown-property` (error): declarations checked against the
  mdn-data property registry; custom properties and vendor prefixes exempt
- `octane-css-shorthand-longhand-clash`: direction-aware cascade pairs across
  same-block declarations, co-matching rules, scope chains, and statically
  resolved same-module apply sheets. Provable co-matches are errors;
  speculative pairs are warnings
- `octane-css-unused-selector` (warning): pruneCss match metadata
  distinguishes stale scoped-block pruning from designed class-map pruning

Add `/* octane-ignore [codes] */` before a rule or declaration to suppress a
diagnostic on the collected channel. Diagnostics are off via
`styleCorrectness: false`; production codegen is byte-equal with the pass on
or off.
