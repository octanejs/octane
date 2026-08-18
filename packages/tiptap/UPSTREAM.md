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
- Verification: verified (`packages/tiptap/upstream/` vendored from that npm pin; `pnpm --filter @octanejs/tiptap upstream:verify`)

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

## Type suites

## Additional evidence

Repo-authored differential fixtures cover editor and custom-view lifecycles,
including the NodeViewWrapper `as` consumption and ReactMarkView portal-cleanup
divergences. Package-authored SSR, hydration, browser, and framework-contract
unit tests remain ordinary-shard coverage and are not React-parity evidence.
