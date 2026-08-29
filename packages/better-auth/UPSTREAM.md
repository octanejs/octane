# Better Auth upstream provenance

This binding is based on Better Auth's React client at the following immutable release:

| Field | Pinned value |
| --- | --- |
| Repository | `https://github.com/better-auth/better-auth` |
| Tag | `v1.6.29` |
| Commit | `58c49eb97f04ff18aa823318a3856a013353fdc2` |
| Package | `better-auth@1.6.29` |
| React entry | `packages/better-auth/src/client/react/index.ts` |
| React store adapter | `packages/better-auth/src/client/react/react-store.ts` |
| License | MIT, recorded in `upstream/LICENSE.md` |

The files under `upstream/` are byte-exact copies from that commit. `upstream/SHA256SUMS`
is a complete inventory of the vendored evidence, not a checksum of the entire upstream
repository. Verify it with:

```sh
node packages/better-auth/scripts/verify-upstream.mjs
```

The verifier detects added, removed, or changed evidence and checks the pinned package
version, `better-auth/react` export mapping, direct React test imports, and license notice.

## Source and export disposition

| Upstream surface | Octane disposition | Verification status |
| --- | --- | --- |
| `better-auth/react` `createAuthClient` | `@octanejs/better-auth` exports `createAuthClient`. It wraps the upstream vanilla client from `better-auth/client` and projects Nanostore-backed hooks through Octane's slot-aware `useStore`; it is an adaptation, not a line-for-line copy. | **Recorded-unverified** against the full upstream React implementation. Local conformance and type tests cover the intended binding contract. |
| `react-store.ts` `useStore` | Exported as Octane `useStore`, with Octane hook-slot state, subscription cleanup, selected-key filtering, and store replacement behavior. | **Recorded-unverified** against upstream's React lifecycle. Local runtime tests cover the Octane behavior. |
| Generated `useSession` and plugin atom hooks | Preserved by name when the vanilla client's `$store.atoms` exposes the corresponding atom; hook identity is cached by property. | **Recorded-unverified** as a complete plugin matrix. Local tests exercise session and representative plugin atoms. |
| Vanilla actions, `$fetch`, `$store`, `$ERROR_CODES`, and `$Infer` | Reused from `better-auth/client` rather than reimplemented. The wrapper leaves non-hook properties on the vanilla client intact. | Locally checked for representative runtime identity and public types; not a complete upstream action/plugin inventory. |
| React entry type re-exports from `@better-fetch/fetch`, `nanostores`, and React-specific helpers | Not mirrored as a React compatibility facade. The Octane package exports its own `UseStoreOptions` and the public types from `better-auth/client`. | Intentional bounded surface; **recorded-unverified** for consumers relying on React-entry-only helper exports. |
| Server and other framework integrations | Outside this client binding. Consumers continue to use Better Auth's server package and framework integrations directly. | Not applicable. |

## Upstream test disposition

Better Auth does not have a dedicated React test directory at this release. React entry
coverage is embedded in shared client and plugin tests, so the complete containing files
are retained as evidence:

| Vendored upstream test | Why it is relevant | Execution disposition |
| --- | --- | --- |
| `src/client/client.test.ts` | Imports `./react`; exercises the shared `$fetch`/`$store` client contract and checks the React session hook's nullable data type. | Retained byte-exact, but not executed pristine or mechanically adapted. Local conformance/type tests cover a narrower Octane contract. **Recorded-unverified.** |
| `src/client/client-declaration.test.ts` | Emits declarations for a temporary consumer importing `better-auth/react`. | Retained byte-exact, but not run against the Octane entry. Local public API type tests are narrower. **Recorded-unverified.** |
| `src/plugins/additional-fields/additional-fields.test.ts` | Contains the React-client additional-fields inference assertion among broader plugin tests. | Retained byte-exact; only the embedded React case is relevant, and the file is not run as an Octane adaptation. **Recorded-unverified.** |

There is no claim of full React parity, a pristine upstream test lane, or a one-to-one
adapted test inventory. The vendored files make the source and test basis auditable;
Octane-specific tests remain the executable evidence for this binding.
