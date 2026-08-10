# Frozen SWR adoption corpus

U1 freezes `consumer.tsrx` as the ordinary migration target. U6 executes that
same consumer after changing only package names and normal React-to-Octane
component syntax.

| Existing import | Octane binding import |
| --- | --- |
| `swr` | `@octanejs/swr` |
| `swr/infinite` | `@octanejs/swr/infinite` |
| `swr/immutable` | `@octanejs/swr/immutable` |
| `swr/subscription` | `@octanejs/swr/subscription` |
| `swr/mutation` | `@octanejs/swr/mutation` |

Keys, fetchers, configuration, returned state, cache mutation, preload,
pagination, remote mutation, and subscription call shapes remain unchanged.
No SWR-specific adapter component or application rewrite is required.

React-only devtools identity is the integration exception. Use tooling aware of
`window.__SWR_DEVTOOLS_OCTANE__`; the binding does not impersonate React through
`window.__SWR_DEVTOOLS_REACT__`.
