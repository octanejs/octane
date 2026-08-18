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
| React runtime | `react@19.2.3` | differential tests |
| ReactDOM runtime | `react-dom@19.2.3` | differential tests |
| React types | `@types/react@19.2.7` | type lanes |
| ReactDOM types | `@types/react-dom@19.2.3` | type lanes |

These versions are the exact `catalog:react-pdf-react-oracle` pins in `pnpm-workspace.yaml`.

The pinned tag source, all 13 source test authorities, package metadata,
README, TypeScript programs, and license are vendored under `upstream/tag`.
The complete published npm artifact is vendored under `upstream/npm`.
Monorepo-root test fixtures (`test-utils.ts`, `__mocks__/`) are vendored under
`upstream/support` and linked into the package root for relative imports.
