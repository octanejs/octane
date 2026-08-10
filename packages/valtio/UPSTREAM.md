# Valtio upstream ledger

## Pin

- Package: `valtio@2.3.2`
- Repository: `https://github.com/pmndrs/valtio.git`
- Release tag: `v2.3.2`
- Tag object: `683eaff28df3f2e2b690867666fd650f3974849c`
- Commit: `15c64d4d7a7a9bd55d750fa6a317b440978a2b25`
- npm tarball SHA-256: `90ba3507f7fefcf8654c36bcedffa1f7b96d5a9ed7cde14a9df52107eb90c825`
- License: MIT
- React oracle: workspace React 19.2.7

The published artifact supplies the runtime and declaration boundary. The canonical tagged repository supplies the source and test audit. The package reuses `valtio/vanilla` and `valtio/vanilla/utils` unchanged; only the React-facing hooks are adapted.

## Export crosswalk

| Upstream entry/export | Octane entry/export | Disposition | Evidence |
| --- | --- | --- | --- |
| `valtio` vanilla exports | `@octanejs/valtio` | Reused from `valtio/vanilla` | `tests/conformance/exports.test.ts` |
| `useSnapshot` | `@octanejs/valtio`, `@octanejs/valtio/react` | Ported to Octane hooks | differential snapshot case and `tests/upstream/use-hooks.test.ts` |
| `valtio/react/utils` `useProxy` | `@octanejs/valtio/react/utils` | Ported to Octane hooks | differential useProxy case and `tests/upstream/use-hooks.test.ts` |
| `valtio/vanilla` | `@octanejs/valtio/vanilla` | Re-exported unchanged | `tests/conformance/exports.test.ts` |
| `valtio/vanilla/utils` | `@octanejs/valtio/vanilla/utils` | Re-exported unchanged | `tests/conformance/exports.test.ts` |
| React DevTools affected-path label | none | Intentional divergence | `tests/conformance/debug-labels.test.ts` |

## Upstream suite disposition

The tag contains 20 runtime test files. Most cover the framework-neutral vanilla implementation and are already owned by the exact `valtio` dependency reused here; React hook cases are broad and coupled to React Testing Library. This retrofit records upstream runtime suites as **absent** for executable parity (no pristine or one-for-one adapted upstream suite is claimed). Evidence is a repo-authored adapted suite that cites the pinned `valtio@2.3.2` React hook source (`tests/upstream/use-hooks.test.ts`) plus two representative same-fixture differential cases against those hooks. Broader Octane-only binding coverage stays in ordinary shards (`tests/conformance/binding.test.ts`). The repository has TypeScript assertions embedded in its `.tsx` runtime tests but no standalone one-for-one public declaration suite, so upstream type evidence is classified as **insufficient** with paired repo-authored pristine and adapted type probes.
