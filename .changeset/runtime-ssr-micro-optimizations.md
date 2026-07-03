---
"octane": patch
---

Runtime + SSR micro-optimizations (no behavior change):

- `escapeHtml`/`escapeAttr` first run a single `.test()` scan and return the
  original string when nothing needs escaping (~5× on clean text, the common
  case); escape-bearing strings keep the native chained replaces.
- `styleName` hyphenation (camelCase → kebab) is memoized, and `normalizeClass`/
  `styleName` now live once in `css.ts` with both the client runtime and the SSR
  serializer importing them (completing the intended shared-module split; they
  previously carried divergent private copies).
- `shallowEqualProps` (every memo bail) uses a zero-allocation for-in compare for
  plain-prototype props instead of two `Object.keys` arrays, with the exact
  slow path kept for non-plain objects. React `shallowEqual` semantics preserved.
- Hydration structural-mismatch diagnostics (`describeHydrationNode` etc.) are
  now constructed only when a dev source-loc exists, so production recovery pays
  only the mismatch check itself.
- Keyed-list teardown walks the intrusive item chain (`head → nextSibling`)
  instead of allocating Map iterators.
- `createElement` (client and SSR) no longer strips `key` via `delete` — the
  delete dropped every spread-created props object into V8 dictionary mode,
  slowing all later enumeration over those props (memo compares on
  value-position rows measured ~2× slower because of it). The key is now
  excluded during a manual own-key copy.
