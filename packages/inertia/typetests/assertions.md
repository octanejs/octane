# Type parity assertions

`@inertiajs/react@3.6.1` ships no dedicated type-test suite for the adapter
surface this foundation ports, so both sides of this lane are port-authored.
The two files assert the same public-surface claims: one against the published
upstream binding compiled with `tsc`, one against `@octanejs/inertia` compiled
with `tsrx-tsc`.

The binding's authored imports are checked separately for React dependencies in
`tests/conformance/exports.test.ts`. Octane's migration types reuse its own
shipped `@types/react` dependency, so these programs resolve that transitive type
basis normally; consumers do not need to add a React runtime dependency.

Permitted differences between the two files, and nothing else:

| # | Transformation | Why |
| --- | --- | --- |
| 1 | import root `@inertiajs/react` → `@octanejs/inertia` | the package under test |
| 2 | server import `@inertiajs/react/server` → `@octanejs/inertia/server` | matching server entry |

Every assertion group below appears in both files under the same heading.

1. Framework-neutral core identities (`http`, `progress`, `router`, `server`) are re-exported.
2. `useForm` exposes typed data and `setData` by key path.
3. `useHttp` returns a typed direct HTTP helper.
4. Hook exports (`usePage`, `usePoll`, `usePrefetch`, `useRemember`) keep their function identities.
5. `usePage` rejects being called with a non-generic value argument.
