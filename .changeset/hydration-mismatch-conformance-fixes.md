---
"octane": patch
---

Fix five hydration mismatch recovery bugs surfaced by porting React's hydration diff matrix
(`ReactDOMHydrationDiff-test.js` + `ReactDOMServerIntegrationReconnecting-test.js`) as
conformance tests:

- **`clone()` corrupted the enclosing range on a client-only branch.** When the server left a
  slot empty (e.g. a client-only `@if` branch) the cursor sits on the block's close marker;
  the structural-rebuild path removed it, breaking the parent range (the whole subtree could
  vanish). It now builds fresh and consumes nothing in that case.
- **`ifBlock`/`switchBlock` read a stale cursor for an empty server branch.** The
  "borrow markers" path (hit when the server branch had no inner markers, i.e. was empty)
  never positioned the hydration cursor, so a non-empty *client* branch mis-adopted. It now
  parks the cursor on the slot content.
- **`ifBlock`/`switchBlock` left server content behind for an empty client branch.** When the
  client branch renders nothing but the server rendered content, the stale server range is now
  discarded so siblings stay aligned.
- **`setStyle` did not detect inline-style hydration mismatches.** It now warns (dev) on a
  server/client style divergence and honors `suppressHydrationWarning`, matching the
  text/attribute paths.
- **`setClassName` did not detect `class` hydration mismatches.** Same treatment: dev warning
  + `suppressHydrationWarning` support (previously `class` mismatches were silently patched).

All recovery runs in dev + production; warnings remain dev-only and gated, so production output
is unchanged.
