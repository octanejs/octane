# Upstream provenance

`@octanejs/colorful` is an Octane adaptation of
[`react-colorful@5.8.1`](https://github.com/omgovich/react-colorful/tree/v5.8.1).

- npm version: `5.8.1`
- npm integrity: `sha512-oz68bhsnFWnpDf1ZR8daiQbYpXUnM2h2J6hl9Zg2rTpM/DU6vCqe1E+CpqmqLnJucMZetHZeifSAfJ+geN9lcA==`
- npm shasum: `a6ef2a3946e6903883b142720dda80c72f24267f`
- repository tag: `v5.8.1`
- repository commit: `8506e8c4b777e0056ce3567dc3a06ced143034bc`
- license: MIT
- React oracle: `react@19.2.7` / `react-dom@19.2.7` with `@types/react@19.2.17` / `@types/react-dom@19.2.3` via the dedicated `react-colorful-react-oracle` pnpm catalog (exact pins; not `catalog:default`)
- Pristine upstream `check-types` types: `@types/react@17.0.83` / `@types/react-dom@17.0.26` via npm aliases (`@types/react-colorful-pristine`, `@types/react-dom-colorful-pristine`)

## Source boundary

The byte-exact tag sources and tests live under `upstream/` and verify offline
against the upstream git blob shas recorded in `audit/upstream.lock.json`; the
published declaration and package authorities, plus the SRI-verified 105,271-byte
release archive used by the strict public-type verifier, live under `upstream-artifact/`,
hash-pinned by `audit/upstream-inventory.json`. The pinned license is
republished at the package root as `LICENSE.upstream`. Jest 30 rejects the
pinned snapshot's legacy `goo.gl` header, so the lock's adapted rewrite
regenerates a header-corrected copy under `tests/upstream/tag/` (gitignored)
that the pristine Jest lane reads through
`tests/upstream-jest.snapshot-resolver.cjs`; the snapshot body is unchanged.
Neither vendored directory is included in the published package.

Framework-neutral color utilities are source-correspondent. React components,
hooks, JSX, synthetic event wrappers, and DOM prop types are adapted to Octane
components, hooks, `.tsrx`, native events, and Octane intrinsic prop types.
The public component callback named `onChange` remains unchanged; only the
internal text-input host wiring uses Octane's native `onInput`. Structured
ledger: `react-colorful-native-event-attributes` in `audit/react-parity.json`.

The utility suite is generated from the pinned test with only an import-root
rewrite and a Vitest import. Its 28 cases run unchanged; the component, CSP and
Shadow DOM tests use the existing Octane harness. The registration crosswalk
retains all 92 preflight identities: 68 registered cases plus 24 inline conversion
assertion helpers, each mapped to its enclosing generated test.

## Test-suite disposition

| Upstream artifact | Disposition | Evidence |
| --- | --- | --- |
| `tag/tests/components.test.js` (38 cases) | **ported** one-for-one titles → `tests/upstream/components.test.ts` | adapted-octane lane |
| `tag/tests/utils.test.js` (28 cases) | **ported** one-for-one titles → `tests/upstream/generated/utils.test.js` | adapted-octane lane |
| `tag/tests/csp.test.js` (1 case) | **ported** → `tests/upstream/csp.test.ts` | adapted-octane lane |
| `tag/tests/shadowDom.test.js` (1 case) | **ported** → `tests/upstream/shadowDom.test.ts` | adapted-octane lane |
| `tag/tests/__snapshots__/*` | **pristine-only** (Jest snapshots); adapted asserts structure | pristine-upstream lane |
| Upstream `check-types` (`tsc --noEmit` on `src`) | **pristine** via `typetests/tsconfig.pristine.json` | pristine-types lane |
| Upstream `tag/src` ↔ Octane `src` program membership | **fail-closed fileDispositions** in `audit/type-parity.json` (`.tsx`/hook `.ts` → `.tsrx`; CSS-module decl + isomorphic layout effect are pristine-only with adapted evidence) | program inventories + `react-parity:validate` |
| Public type probes | **one-for-one** React (`audit/type-probes/public-api.test.ts`) ↔ Octane (`typetests/public-api.test.ts`) under `audit/type-parity.json`, including paired `HostInputEvent` proofs (`FormEvent` vs `InputEvent`) for `react-colorful-native-event-attributes` | type inventories + `pnpm test:type-parity` |
| Octane source + adapted probe | **adapted types** via `typetests/tsconfig.adapted.json` | adapted-types lane |

### Port-authored classifications

Every authored runtime and type test is classified exactly once in
`audit/test-classifications.json` (fail-closed discovery over `tests/`,
`audit/type-probes/`, and `typetests/`). The table below is a summary only.

| File | Classification |
| --- | --- |
| `tests/upstream/**` | adapted-upstream-suite |
| `audit/type-probes/public-api.test.ts` | paired-repo-authored-react-type-oracle |
| `typetests/public-api.test.ts` | adapted-upstream-suite |
| `tests/runtime/exports.test.ts` | octane-only-framework-contract |
| `tests/runtime/owner-document.test.ts` | octane-only-framework-contract |
| `tests/runtime/lifecycle.test.ts` | octane-only-framework-contract |
| `tests/types/public.test-d.ts` | paired-repo-authored-type-probes |
| `tests/types/pristine.test-d.ts` | paired-repo-authored-react-type-oracle |
| `tests/hydration/**` | octane-only-framework-contract |
| `tests/ssr/**` | octane-only-framework-contract |
| `tests/browser/**` | octane-only-framework-contract |
| `tests/differential/**` | react-octane-differential |
