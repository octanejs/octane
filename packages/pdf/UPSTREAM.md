# Upstream provenance

- Package: `react-pdf@10.4.1`
- Repository: `https://github.com/wojtekmaj/react-pdf`
- Tag: `v10.4.1`
- Commit: `5338e7a24c7ad17d1028146cf8a025a75e0abe79`
- License: MIT
- PDF.js dependency: `pdfjs-dist@5.4.296` (Apache-2.0)

## Immutable React oracles

| Oracle | Pinned version | Evidence lanes |
| --- | --- | --- |
| React runtime | `react@19.2.3` | `pristine-runtime`, `differential` |
| ReactDOM runtime | `react-dom@19.2.3` | `pristine-runtime`, `differential` |
| React types | `@types/react@19.2.7` | type lanes |
| ReactDOM types | `@types/react-dom@19.2.3` | type lanes |

These versions are the exact `catalog:react-pdf-react-oracle` pins in `pnpm-workspace.yaml`.

The pinned tag source, all 13 source test authorities, package metadata,
README, TypeScript programs, and license are vendored under
`upstream/packages/react-pdf`, and the monorepo-root test fixtures
(`test-utils.ts`, `__mocks__/`) at the `upstream/` root, mirroring the pinned
repository layout; every file verifies offline against the upstream git blob
shas recorded in `audit/upstream.lock.json`, and the fixtures are symlinked into
the package root for relative imports. The published npm artifact source is
vendored under `upstream-artifact/`. The pinned license is republished at the
package root as `LICENSE.upstream`. The upstream specs import `__mocks__/*.js`
and `test-utils.js` specifiers that upstream's Vite maps onto the TypeScript
authorities; the pristine runner emits those thin re-export shims into its
scratch tree instead of vendoring repo-authored files inside the pristine
boundary.

`audit/upstream-inventory.json` records SHA-256 hashes for both authorities.
`audit/case-map.json` accounts for every upstream runtime identity with either a
one-for-one adapted counterpart or an explicit `pending-adaptation` disposition.
`audit/pristine-runtime.json` records the executed pristine Vitest identities.
