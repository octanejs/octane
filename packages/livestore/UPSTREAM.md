# LiveStore React upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `@livestore/react` |
| Version | `0.4.0` |
| Canonical tag commit | `c80acb39066b9472da426a35c81969df4919ae2d` |
| Supported upstream range | exactly `0.4.0` |
| React oracle | `19.2.3` with `@types/react@19.2.7` |
| License | Apache-2.0 |

The npm package publishes `src/` and built `dist/`, but its repository contains
the authoritative React source, tests, snapshots, configuration, package
metadata, and license. The byte-exact `packages/@livestore/react` directory from
the canonical tag commit is vendored under `upstream/` and locked file-by-file
by `upstream/SHA256SUMS`. It is excluded from the published package by the
explicit `files` allowlist.

The port reuses LiveStore's released framework-neutral packages unchanged. Only
the React-facing binding under the pinned directory is adapted. `src/` mirrors
the upstream module layout; `.tsx` components become `.tsrx`, while hook modules
retain their upstream paths.

Run `pnpm --dir packages/livestore upstream:verify` to verify every vendored
byte and the recorded source/test inventory. The pristine React-parity lane
runs that same verifier before copying or executing the upstream suite.

## Runtime export crosswalk

| Upstream export | Octane disposition | Evidence |
|---|---|---|
| `Dispatch`, `SetStateAction`, `SetStateActionPartial`, `StateSetters` | Re-exported from the unchanged framework toolkit | `typetests/public-api.test-d.ts` |
| `captureStackInfo` | Re-exported from the unchanged framework toolkit | `tests/package-contract.test.ts` |
| `StoreRegistry`, `storeOptions` | Re-exported from the unchanged LiveStore core | `tests/package-contract.test.ts` |
| `StoreRegistryContext` | Ported to Octane context at `src/StoreRegistryContext.tsrx` | `tests/conformance/registry-context.test.ts` |
| `StoreRegistryProvider`, `StoreRegistryProviderProps` | Ported to Octane TSRX at the mirrored module path | `tests/lifecycle.test.ts`, `typetests/public-api.test-d.ts` |
| `useStoreRegistry` | Ported to Octane context with the upstream override behavior | `tests/conformance/registry-context.test.ts` |
| `useStore` | Ported to Octane Suspense, retention, and slot ownership | `tests/lifecycle.test.ts` |
| `ReactApi` | Historical upstream public name retained; members use Octane hooks | `typetests/public-api.test-d.ts` |
| `withReactApi` | Historical upstream public name retained and augments the same Store object | `tests/lifecycle.test.ts` |
| `useQuery`, `useQueryRef` | Ported over LiveStore's unchanged reactive-query core | `tests/query.test.ts` |
| `UseClientDocumentResult`, `useClientDocument` | Ported over the unchanged client-document core | `tests/document-sync.test.ts` |
| `useSyncStatus` | Ported to Octane's external-store subscription boundary | `tests/conformance/sync-status.test.ts`, `tests/ssr/server.test.ts` |
| `LiveList`, `LiveListProps` | Ported to keyed Octane `@for`; exported from root and `./experimental` | `tests/conformance/live-list.test.ts`, `typetests/public-api.test-d.ts` |

`useRcResource`, `useStateRefWithReactiveInput`, and
`__resetUseRcResourceCache` are upstream-private modules. They remain internal
implementation/test support and are not added to the public namespace.

## Test-suite disposition

The pinned React binding contains four runtime test files, one shared fixture,
and two snapshots. The source artifacts are all present under `upstream/`.

| Upstream artifact | Disposition |
|---|---|
| `src/useRcResource.test.tsx` | Adapted by `tests/lifecycle.test.ts`; stable reuse, last-consumer cleanup, key replacement, scope replacement, and rapid replacement are covered. React StrictMode double-invoke is not applicable because Octane has no StrictMode double-invoke. |
| `src/useStore.test.tsx` | Adapted by `tests/lifecycle.test.ts`; shared registry promise identity belongs to unchanged `StoreRegistry`, while Suspense, stable re-render, error propagation, store switching, retention, and `useActionState` transition commit (`does not block useActionState transitions from committing`, upstream L176) are binding contracts. The upstream skipped `unusedCacheTime=0` case remains an upstream core issue, not a parity claim. Registry context override/missing-provider coverage is Octane-only in `tests/conformance/registry-context.test.ts`. |
| `src/useQuery.test.tsx` | Adapted by `tests/query.test.ts`; synchronous reads, commits, query identity changes, signals/query builders, and per-store query derivation are the observable contracts. React-window-specific lifecycle stress is React-only; keyed `LiveList` supplies Octane's equivalent list integration evidence in `tests/conformance/live-list.test.ts` (outside parity ownership). Query-resource last-consumer cleanup is Octane-only in `tests/conformance/query-resource.test.ts`. Internal reactivity-graph snapshots are deliberately not copied because repository testing guidance forbids pinning private graph shape. |
| `src/useClientDocument.test.tsx` | Adapted by `tests/document-sync.test.ts`; ID changes, value/functional/external updates, query chaining (`should work for a useClientDocument query chained with a useTemporary query`, upstream L195), and KV overwrite semantics (`kv client document overwrites value (Schema.Any, no partial merge)`, upstream L238) are binding contracts. Sync-status subscription/hydration is Octane-only in `tests/conformance/sync-status.test.ts`. OpenTelemetry span snapshots exercise unchanged LiveStore instrumentation internals and are not re-snapshotted by the Octane binding. |
| `src/__tests__/fixture.tsx` | Adapted through the released `@livestore/framework-toolkit/testing` TodoMVC fixture used by the Octane tests. |
| `src/__snapshots__/useQuery.test.tsx.snap` | Not ported: it pins framework-neutral private reactivity-graph representation, outside the binding observation boundary. |
| `src/__snapshots__/useClientDocument.test.tsx.snap` | Not ported: it pins framework-neutral OpenTelemetry and stack-frame serialization internals, outside the binding observation boundary. |

## Intentional divergences

- Octane has no StrictMode double-invocation, so the React suite's strict/non-strict
  matrix collapses to one lifecycle lane.
- Upstream's framework toolkit still names the augmentation `ReactApi` and
  `withReactApi`. Those names are preserved for source compatibility even though
  their implementation is Octane-native.
- Public query instrumentation uses the label `octane`. The framework-neutral
  toolkit's internal refresh tag remains `react` because that released core API
  is reused unchanged.
