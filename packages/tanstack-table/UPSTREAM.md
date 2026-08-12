# Upstream

- Repository: https://github.com/TanStack/table
- Release tag: `v9.0.0-beta.58`
- Commit: `9fa764702b25d675f97deedd714e8b9133994927`
- Package: `@tanstack/react-table@9.0.0-beta.58`
- Source root: `packages/react-table/src`
- Test root: none in the tagged React adapter package (`packages/react-table`)
- License: MIT
- npm tarball SHA-256: `924a64009738996f1a2f32ef950aed338a6aafb0dbf85af548c7c98388deb559`

The tagged React adapter package and its npm tarball omit tests (only
`test:types` compiles package source). The tagged repository still exposes
executable React-adapter and framework-neutral suites outside that package
directory; those are the outstanding upstream boundary for this pin and keep
provenance at `recorded-unverified` until they are inventoried, dispositioned,
and run or explicitly scoped out.

## Outstanding upstream runtime suites (pinned commit)

| Suite | Location | Notes |
| --- | --- | --- |
| React example Playwright smokes | `examples/react/*/tests/e2e/smoke.spec.ts` (58 specs) | Root and per-example `test:e2e` scripts; render `@tanstack/react-table` via example apps |
| Framework-neutral table-core | `packages/table-core/tests` (54 `*.test.ts` files) | Unit/implementation/performance baseline shared across adapters |

`audit/react-parity.json` therefore records `upstreamSuites.runtime: present`
(suites exist in the tagged workspaces) and `upstreamSuites.types: insufficient`
(adapter typecheck only compiles source). Current parity evidence is
repo-authored differential scenarios plus paired pristine/adapted public type
contracts with executable per-group inventories. Ordinary framework-contract
checks for the legacy subpath omission and plain-function component cells stay
outside the parity group until they carry same-scenario React observations.
