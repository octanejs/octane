---
'octane': patch
---

React 19 parity: the implementation-gap tranche from the outstanding-work issue.

- **Nested document metadata**: `<title>`/`<meta>`/`<link>` and Float resources
  now hoist from ANY depth on the server too (React's model; the client always
  did) — a nested hoist serializes into the head channel at its authored
  position, the host body keeps only real children, and hydration adopts
  without mismatches. A hoist inside a conditional arm registers only while
  that arm renders.
- **`prerenderToNodeStream`**: `octane/static` gains the stream variant —
  resolves after the await-everything render completes; `prelude` streams the
  complete document bytes (scoped-style tags, then folded html). No
  `postponed` field: postpone/resume stays a documented non-goal.
- **Teardown errors reach the root callbacks**: effect-cleanup and ref-detach
  throws during unmount report through `onCaughtError` (boundary-claimed) or
  `onUncaughtError` (unclaimed) with routing semantics unchanged.
- **Resource hints share the Float identity model**: `preinit(as:'style')` IS a
  stylesheet resource (honors `precedence`, joins the groups, dedupes against
  the rendered form), `preinit(as:'script')` dedupes against
  `<script async src>`, `preload`/`preloadModule` after the matching init
  no-op, image preloads with `imageSrcSet` key on the srcset+sizes pair, and
  malformed calls warn in development.
- **Universal renderer**: `onCaughtError`/`onUncaughtError` now apply to
  `octane/universal` roots (boundary claims and scheduler-owned work; a direct
  `render()` throw remains the documented result channel, and there is no
  `onRecoverableError` — the universal renderer has no hydration channel).
