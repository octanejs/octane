---
"octane-ts": patch
---

Add `<Suspense>` and `<ErrorBoundary>` components — JSX forms of the `@try`/`@pending` and `@try`/`@catch` directives, for authors writing JSX rather than the template control-flow (e.g. porting React / TanStack Query code).

- `<Suspense fallback={…}>…</Suspense>` shows `fallback` while a descendant suspends (via `use(thenable)`), then the children once resolved.
- `<ErrorBoundary fallback={…}>…</ErrorBoundary>` swaps to `fallback` when a descendant throws; `fallback` may be a renderable or a `(error, reset) => renderable` render prop.

Both are thin built-ins over the same `tryBlock` primitive the directives compile to, so behavior is identical.

Also: inline JSX in a component prop value (e.g. `<Suspense fallback={<Spinner/>}>`) now lowers to `createElement(...)` instead of emitting raw, unprintable JSX.
