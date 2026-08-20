# Upstream

- Repository: https://github.com/ueberdosis/tiptap
- Release tag: `v3.28.0`
- Commit: `c5f4b576eb2d521364bba524616e0702027987d3`
- Package: `@tiptap/react@3.28.0`
- Source root: `packages/react/src`
- Test root: `packages/react/src/**/*.spec.ts`
- License: MIT
- npm tarball SHA-256: `92d1d53c119f0e0e6049effd0bba0e94d83508e3a7c7fd8d406e19fe16c49ca5`
- React oracle: exact `react@19.2.7` / `react-dom@19.2.7` with `@types/react@19.2.17` / `@types/react-dom@19.2.3` (not `catalog:default` ranges)
- Verification: verified (`packages/tiptap/upstream/` pinned by `audit/upstream.lock.json` against the canonical tag commit's git blob shas; `pnpm react-port:materialize run --check --package-dir packages/tiptap`; the upstream MIT license is retained byte-exact as `LICENSE.upstream`, hash-matched to the lock)

## Upstream runtime suite

The pin ships four Vitest specs (seven cases). They are preserved byte-exact under
`packages/tiptap/upstream/src/**/*.spec.ts` and executed by the
`tiptap-pristine` project. One-for-one Octane adaptations live in
`packages/tiptap/tests/upstream/` (`tiptap-upstream`).

| Upstream file | Disposition | Adapted evidence |
| --- | --- | --- |
| `src/use-client.spec.ts` | pristine + adapted | `tests/upstream/use-client.test.ts` |
| `src/EditorContent.spec.ts` | pristine + adapted | `tests/upstream/EditorContent.test.ts` |
| `src/menus/BubbleMenu.spec.ts` | pristine + adapted | `tests/upstream/BubbleMenu.test.ts` |
| `src/menus/FloatingMenu.spec.ts` | pristine + adapted | `tests/upstream/FloatingMenu.test.ts` |

`scripts/react-parity/tiptap-runtime-lib.mjs` crosswalks pristine and adapted
runtime inventories by `fullName`, checks UPSTREAM citations, and rejects
renamed/omitted identities plus missing fixtures. It also reads both sources
for a one-for-one assertion/interaction crosswalk under the permitted
transformation ledger in `audit/runtime-parity.json` (see
`tests/upstream/assertions.md`), including negative controls for deleted or
changed expects and `// Per …:<line>` citation drift. Wired through
`pnpm react-parity:validate` / `pnpm react-parity:check`.

## Type suites

Upstream has no dedicated compile-time suite (`upstreamSuites.types:
insufficient`). Repo-authored one-for-one probes live under
`typetests/pristine/types.test-d.ts` and `typetests/adapted/types.test-d.ts`,
with permitted transforms listed in `typetests/assertions.md`. Root
`typetests/public-api.test-d.ts` and `typetests/menus-api.test-d.ts` are
Octane-only declaration contracts outside the React-parity type lane. Every
type probe is classified exactly once in
`packages/tiptap/audit/test-classifications.json`.

## Additional evidence

Repo-authored differential fixtures cover editor and custom-view lifecycles,
including the NodeViewWrapper `as` consumption and ReactMarkView portal-cleanup
divergences. Package-authored SSR, hydration, browser, and framework-contract
unit tests remain ordinary-shard coverage and are not React-parity evidence.
