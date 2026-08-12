---
'octane': patch
---

React 19 parity tranche: Float resources, root error callbacks, module resource hints, and partial-prerender/formState dispositions.

`<link rel="stylesheet" href precedence>` and `<script async src>` rendered at
a component's body root are now React Float resources: hoisted into
`document.head`, deduped by href/src across the page, stylesheet groups ordered
by precedence (first-encounter group order, appended within a group), retained
after unmount, emitted into buffered and streamed SSR head output, and
hydration-deduped via the first client call's DOM seed. Suspend-until-loaded
commits and `<style href precedence>` style resources remain documented
non-goals — `<style>` in a component belongs to Octane's scoped-CSS system.

`preloadModule` and `preinitModule` join the resource-hint set on both the
client and server entries. `createRoot`/`hydrateRoot` accept React 19's
`onCaughtError`, `onUncaughtError`, and `onRecoverableError` options
(error-only signature — no `errorInfo`/`componentStack`; defaults are unchanged
when the options are absent). `unstable_Activity` is aliased to `Activity` for
React experimental-channel ports.

React 19.2 partial pre-rendering (`resume`/`resumeAndPrerender` and the
postpone/prelude protocol), `cache()`/`cacheSignal()`, and `hydrateRoot`'s
`formState` option are recorded as documented non-goals in the parity ledger,
and `docs/differences-from-react.md` now documents the previously unlisted
divergences: `Context.Consumer`, `<title>` child handling, per-compile-site
metadata dedupe, hidden-`<Activity>` scheduling, dropped stream options,
`prerender`'s return shape, the `useId` format, and the `version` string.
