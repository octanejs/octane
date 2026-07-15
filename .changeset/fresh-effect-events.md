---
"octane": patch
---

Match React's `useEffectEvent` semantics with fresh per-render wrappers and
commit-time, abort-safe callback publication. Block untrusted `javascript:` URL
attributes consistently across client rendering, hydration, SSR, streaming, and
resource hints.
