# React Error Boundary provenance

Pinned package: `react-error-boundary@6.1.5`.
Repository: https://github.com/bvaughn/react-error-boundary
Immutable commit: `83b0f856e650b143d3d74d397f0cea5204a37460`.
The registry artifact is verified against its exact SHA-512 integrity in `audit/upstream.lock.json`.

## Source boundary

The licensed React implementation under `lib/` is rewritten into Octane's existing `src/` layout: `components/ErrorBoundary.tsx` maps to `error-boundary.tsrx`, `context/ErrorBoundaryContext.ts` to `context.ts`, `hooks/useErrorBoundary.ts` to `use-error-boundary.ts`, `utils/withErrorBoundary.ts` to `with-error-boundary.tsrx`, and the error-message/context validation utilities to `utils.ts` and `use-error-boundary.ts`. `types.ts` and `index.ts` retain the public shape and exports. The source ledger records every shipped file; `internal.ts` is authored native compiler-slot integration. React's class lifecycle is expressed using Octane hooks and its native error boundary. No React runtime is shipped.

`server.tsrx` is the native server entry. It keeps the client's boundary structure for hydration and rethrows server failures, matching upstream error propagation. Its previous public contract and the native `ComponentType` alias are retained as byte-authenticated baseline evidence under `upstream-artifact/previous-binding`.

## Public exports

All 13 upstream value/type exports are preserved: `ErrorBoundary` (component and imperative reset handle), `ErrorBoundaryContext`, `getErrorMessage`, `useErrorBoundary`, `withErrorBoundary`, `ErrorBoundaryContextType`, `UseErrorBoundaryApi`, `ErrorBoundaryProps`, `ErrorBoundaryPropsWithComponent`, `ErrorBoundaryPropsWithFallback`, `ErrorBoundaryPropsWithRender`, `FallbackProps`, and `OnErrorCallback`. The existing native `ComponentType` alias and `/server` entry remain supported.

## Evidence

The immutable tree includes all three upstream test files and all 25 runtime cases. Both pristine React and generated Octane suites execute every assertion. Two documented fixture adaptations replace a class ref and `forwardRef` with native function components, ref props and `useImperativeHandle`; their observable `getFoo()` assertions stay unchanged. The upstream setup and license remain byte-exact. `audit/crosswalk.json` accounts for every registration.

Upstream has no separate type suite. Strict consumer assertions exercise every published declaration, fallback alternatives, callback shapes, reset refs, and wrapped component props against the pinned npm declarations and Octane source. Additional checks cover the native server entry. Chromium exercises initial rendering, server DOM adoption, null and async errors, stable handles, latest callbacks, reset keys, focus and DOM identity, and unmount cleanup. Existing differential tests compare actual React/Octane output; server tests verify failure propagation and idle hook/context behavior.

## Intentional differences

Octane components are functions and refs are ordinary props. The compatibility handle exposes `resetErrorBoundary`, without React class lifecycle methods. Component stacks remain empty strings because Octane has no public component-stack formatter. Server rendering uses the explicit `/server` entry. Native catching remains delegated to Octane while reset keys, callbacks, context, hooks, fallback choices, and HOC APIs remain in this binding.

## Licensing

Binding-authored work uses the repository MIT license in `LICENSE`. The byte-exact upstream MIT attribution is retained in `LICENSE.upstream` and included in the published package. The immutable source, lock, generated-test patches, and registry evidence are outside the published files allowlist. Shared provenance checks verify all source blobs, artifact hashes, and license copies offline.
