# react-markdown upstream contract

## Immutable pin

| Field | Value |
| --- | --- |
| Package | `react-markdown` |
| Version | `10.1.0` |
| Supported range | exactly `10.1.0` |
| Canonical repository | `remarkjs/react-markdown` |
| Canonical commit | `44d2e4a44b37461ab7778d6870c1a9eb36393ad2` |
| npm tarball SHA-256 | `205f5c607c68e1e42b8d7a036326bdb3a105ae55e6469ecfcaf998004609d5f7` |
| Runtime oracle | `react@19.0.0` / `react-dom@19.0.0` |
| Type oracle | `@types/react@19.2.17` / `@types/react-dom@19.2.3` |
| License | MIT, retained byte-exact under both evidence boundaries |

`upstream/npm/package/` is the unpacked registry artifact. `upstream/source/`
contains the canonical runtime source, test suite, JSX loader, TypeScript
configuration, package metadata, and license from the pinned commit. The npm
artifact does not publish `test.jsx` or `script/load-jsx.js`, so the canonical
repository supplies that test boundary. The runtime source and license present
in both artifacts are byte-identical.

Run `pnpm --dir packages/markdown upstream:verify`. The verifier locks all
16 vendored files, package identity and license, the public API, and all 87
`test.jsx` registrations. Its negative controls must reject source drift,
license drift, a renamed upstream test, a removed inventory row, and a missing
runtime export.

## Runtime and type export crosswalk

| Upstream export | Octane disposition | Evidence |
| --- | --- | --- |
| default `Markdown` | Ported to `src/index.ts` | `tests/conformance/public-types.test.ts`, `tests/conformance/sync.server.test.ts`, `typetests/public-api.test-d.ts` |
| `MarkdownAsync` | Ported to `src/markdown-async.ts`; sync-render divergence recorded as `react-markdown-async-sync-render` | `tests/async/markdown-async.server.test.ts`, `typetests/public-api.test-d.ts` |
| `MarkdownHooks` | Ported to `src/markdown-hooks.tsrx` | `tests/hooks/markdown-hooks.test.ts`, `typetests/public-api.test-d.ts` |
| `defaultUrlTransform` | Ported source-near to `src/url-transform.ts` | `tests/differential/url-transform.test.ts`, `typetests/public-api.test-d.ts` |
| `AllowElement` | Ported React-free to `src/types.ts` | `typetests/public-api.test-d.ts` |
| `Components` | Ported with Octane intrinsic/component mappings to `src/types.ts` | `typetests/public-api.test-d.ts`, `tests/differential/processor.test.ts` |
| `ExtraProps` | Ported React-free to `src/types.ts` | `typetests/public-api.test-d.ts` |
| `HooksOptions` | Ported with `OctaneNode` fallback to `src/types.ts` | `typetests/public-api.test-d.ts`, `tests/hooks/markdown-hooks.test.ts` |
| `Options` | Ported React-free to `src/types.ts` | `typetests/public-api.test-d.ts`, `tests/validation.test.ts` |
| `UrlTransform` | Ported React-free to `src/types.ts` | `typetests/public-api.test-d.ts`, `tests/differential/url-transform.test.ts` |

## Test boundary

## Architecture and adoption evidence

`tests/probes/async-component.*` proves the load-bearing server contract: a
mapped component typed to return `OctaneNode | Promise<OctaneNode>` is invoked
through an element descriptor, awaited by `prerender`, preserves nested
children, and propagates rejection.

`tests/adoption/` freezes canonical examples from the pinned documentation and
an Apache-2.0 public application consumer. Its migration ledger separates
ordinary React-to-Octane edits from changes specific to this package. Those
files are classified as Octane-only framework contracts, not React-parity
evidence.
