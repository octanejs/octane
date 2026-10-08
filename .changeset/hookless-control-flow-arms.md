---
'octane': patch
---

Render `@if` and `@switch` arms that call no hooks without a component Block of their own.

The compiler now marks an arm hookless when it calls no hook, `use` or context read, has no `@try`, and makes no call through a bare identifier while it renders (event handlers and refs don't count). On a client mount, such an arm renders in a lightweight scope inside its component's render. It skips the Block allocation and the per-Block render bookkeeping. An arm that holds hooks, hydrates, reads signals, or mounts into an already committed component still gets a Block, and a committed hookless arm swaps out through the same staged, rollback-safe path as any other arm.

Paired measurements against the previous code in Chromium:

- recursive-context: cold first mount about 3–7% faster; a partial unmount and remount about 10% faster.
- spa-navigation: navigations that mount a 1,024-leaf route about 17% faster.

DOM output, effect and ref order, keyed moves, Suspense, transitions, Activity and hydration are unchanged.
