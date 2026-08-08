# LiveStore binding

`@octanejs/livestore` ports the renderer layer of `@livestore/react@0.4.0`
from LiveStore tag commit `c80acb39066b9472da426a35c81969df4919ae2d`.
It reuses the published `@livestore/livestore`, `@livestore/framework-toolkit`,
`@livestore/common`, `@livestore/utils`, and `@opentelemetry/api` packages
unchanged on their coherent 0.4.0 / Effect 3 release closure.

The stable surface covers registry context, Suspense store loading, Store
augmentation, reactive queries, client documents, and sync status. The
experimental surface ports `LiveList` to Octane keyed templates. Public names
`ReactApi` and `withReactApi` are retained for source compatibility, though
their implementation uses Octane and the published package has no React
dependency.

Conformance tests cover resource reference counts, store/query identity
switches, deep-equality query bailouts, document setters and external commits,
sync-status lifecycle, SSR effect boundaries, and keyed list identity. The
central playground provides a browser integration using an official in-memory
adapter.

The framework toolkit’s public query error label is set to `octane`. The pinned
toolkit still records an internal refresh-reason renderer tag as `react`; that
diagnostic-only upstream detail is documented rather than forked.

The immutable upstream pin, byte-exact source/test inventory, public export
crosswalk, and disposition of every upstream test artifact live in
`packages/livestore/UPSTREAM.md`.
