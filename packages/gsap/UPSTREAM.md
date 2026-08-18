# Upstream provenance

`@octanejs/gsap` ports the React-facing adapter published as `@gsap/react@2.1.2`.

| Field | Pin |
| --- | --- |
| Package | `@gsap/react` |
| Version and supported range | `2.1.2` exactly |
| Canonical tag | `greensock/react@2.1.2` |
| Tag commit | `b7f44ca767eb93390f965d6f19679e2b77be7966` |
| Framework-neutral peer/oracle | `gsap@3.15.0` (compatible with upstream's `^3.12.5` peer range) |

## Source boundary and licensing

The canonical tag contains one React-facing source module, `src/index.js`, its
declaration file at `types/index.d.ts`, built artifacts, the README, and package
metadata. The tag contains no tests, test configuration, fixtures, snapshots,
or test scripts.

The upstream package declares `SEE LICENSE AT https://gsap.com/standard-license`,
and its source header says it is subject to the GSAP Standard License. It is
therefore inspected at the immutable commit above but is not vendored or
redistributed here. The Octane adapter is independently authored and MIT
licensed; GSAP remains an external peer dependency.

The Octane replacement mirrors the sole upstream source module at `src/index.ts`.
`src/internal.ts` contains only Octane's compiler hook-slot adapter and has no
upstream counterpart.

## Export crosswalk

| Upstream surface | Octane status | Evidence |
| --- | --- | --- |
| `useGSAP(callback?, dependenciesOrConfig?)` | Ported. Callback, positional dependency, and config signatures are supported. | `tests/use-gsap.test.ts`; `tests/differential/parity.test.ts`; `typetests/adapted/types.test-d.ts` |
| Returned `context` | Ported with stable component-lifetime identity. | `tests/use-gsap.test.ts`; `tests/differential/parity.test.ts` |
| Returned `contextSafe` | Ported with stable identity and GSAP context registration. | `tests/use-gsap.test.ts`; `tests/differential/parity.test.ts` |
| Config `scope` | Ported for selector, element, and ref-like values. | `tests/_fixtures/app.tsrx`; `typetests/adapted/types.test-d.ts` |
| Config `dependencies` | Ported, including upstream's distinction between an absent property and explicit `undefined` or `null`. | `tests/use-gsap.test.ts` |
| Config `revertOnUpdate` | Ported. | `tests/use-gsap.test.ts`; `tests/differential/parity.test.ts` |
| `useGSAP.register(core)` | Ported. | `tests/use-gsap.test.ts`; `typetests/adapted/types.test-d.ts` |
| `useGSAP.headless === true` | Ported. | `tests/use-gsap.test.ts`; `typetests/adapted/types.test-d.ts` |

There are no silent or open export gaps at this pin.

## Test and type disposition

- `gsap-differential` — the same lifecycle fixture through Octane and published
  `@gsap/react` 2.1.2 via the shared differential rig (required runtime oracle)
- pristine/adapted type lanes under `typetests/{pristine,adapted}/`

The ordinary `tests/use-gsap.test.ts` and SSR cases remain unpaired
framework-contract tests in the general shards; they are not parity-owned.

The upstream declaration contains a single `useGSAP` overload. Its accepted
callback/config forms are covered one-for-one in the type lanes, with negative
controls for an invalid callback and invalid scope. Static `register` and
`headless` are present in runtime source but omitted from the upstream
declaration; the Octane package intentionally types them because they are part
of the published runtime contract.
