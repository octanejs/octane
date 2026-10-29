# Upstream

- Package: `react-hot-toast@2.6.1`
- Repository: https://github.com/timolins/react-hot-toast
- Release tag: `v2.6.1`, which resolves to commit
  `e725d38e0faec05f7b8fb10644b616ef978d2f4d`.
- npm tarball: `https://registry.npmjs.org/react-hot-toast/-/react-hot-toast-2.6.1.tgz`,
  integrity `sha512-gjFsf05dxcku0FkyMtFH+XmYFdA2odXfBVknEr/IZ+XpUjwsgvtY2616sOpUynK+l9ykQDRNpaJ1hYfuximUiA==`,
  SHA-256 `336bae521480e2f77425cf7c993ffbb58ca0b61407df9f99c63ca954b8099360`, kept as
  `upstream-artifact/react-hot-toast-2.6.1.tgz`.
- License: MIT. The exact upstream text ships as `LICENSE.upstream`.

## Pinning the commit

npm publishes no `gitHead` and no provenance attestation for this release, so the
repository preflight cannot derive the commit from the registry. The pin comes from the
`v2.6.1` tag instead and is proven by content: the tag commit's `package.json` declares
`react-hot-toast@2.6.1`, and every file in the tarball's `src/`, plus `LICENSE`, is
byte-identical to the commit's. `audit/upstream.lock.json` was written in pin mode
(`pnpm react-port:materialize lock --pin react-hot-toast@2.6.1 --repo
timolins/react-hot-toast --commit e725d38e…`).

## Source boundary

The lock pins `LICENSE`, `package.json`, `jest.config.js`, `tsconfig.json`, `src/` and
`test/`. `upstream/` holds those files byte for byte as unpublished evidence, verified
offline with `pnpm react-port:materialize run --check --package-dir packages/hot-toast`.
`tests/upstream/` is regenerated from them using the lock's mechanical rewrites (React
imports to `octane`, `@testing-library/react` to `@octanejs/testing-library`, `../src`
to the port, and Jest `done` callbacks to plain functions), plus the one divergence patch
in `audit/upstream-patches/`.

`src/` mirrors upstream's layout. The core (`types`, `utils`, `store`, `toast`,
`use-toaster`) is ported nearly unchanged with Octane hooks. The components are
re-authored in `.tsrx`. goober is reused unchanged as a dependency for `css` and
`keyframes`. Its `styled()` builds React elements through a global pragma, so
`src/components/styled.tsrx` authors those elements instead. `src/goober.js` re-exports
goober's runtime with its own declaration file, because goober 2.1.19's `goober.d.ts`
fails TypeScript's library check in ESM projects (cristianbote/goober#606).

The published build collapses every whitespace run in the source's template literals
(`esbuild-minify-templates`), and goober names classes by hashing that text. The port's
templates carry the collapsed text, so its class names and stylesheet match the
published package. This was checked against every template literal in the tarball's
`dist/index.mjs`.

## Export crosswalk

| Upstream export | Disposition |
| --- | --- |
| `toast` (default and named) with `success`, `error`, `loading`, `custom`, `promise`, `dismiss`, `dismissAll`, `remove`, `removeAll` | ported (`src/core/toast.ts`) |
| `Toaster` | ported (`src/components/toaster.tsrx`) |
| `ToastBar` | ported (`src/components/toast-bar.tsrx`) |
| `ToastIcon` | ported (`src/components/toast-icon.tsrx`) |
| `CheckmarkIcon`, `ErrorIcon`, `LoaderIcon` | ported (`src/components/{checkmark,error,loader}.ts`) |
| `useToaster` | ported (`src/core/use-toaster.ts`) |
| `useToasterStore` | ported (`useStore` in `src/core/store.ts`) |
| `resolveValue` | ported (`src/core/types.ts`) |
| types `DefaultToastOptions`, `IconTheme`, `Renderable`, `Toast`, `ToasterProps`, `ToastOptions`, `ToastPosition`, `ToastType`, `ValueFunction`, `ValueOrFunction` | ported with Octane renderable and style types |
| `./headless` entry: `toast`, `resolveValue`, `useToaster`, `useToasterStore` and the types | ported (`src/headless/index.ts`) |

## Divergences

Each is declared in `audit/react-parity.json` and pinned by a test.

- `native-mouseenter`: the Toaster's pause handlers are native `mouseenter`/`mouseleave`
  listeners on its container. React synthesizes both from `mouseover`/`mouseout`, so its
  `fireEvent.mouseEnter(toast)` reaches the container. The adapted `pause toast` case fires
  on the container instead.
- `goober-pragma`: upstream calls goober's `setup(React.createElement)` at load. The port
  never calls `setup()`.
- `shared-headless-store`: upstream bundles the root and `/headless` entries separately, each
  with its own store. The port publishes its source, so both entries share one store.
- Types: renderables, styles and refs use Octane's `ElementDescriptor`, `OctaneNode`,
  `CSSProperties` and ref-as-prop types. The icon components are typed as Octane components
  over `div` props rather than goober's `StyledVNode`.

## Behavioral oracle

- `hot-toast-pristine-upstream`: all 14 upstream Jest registrations run byte for byte against
  the pinned React source (`jest.pristine.config.cjs`; Babel strips the TypeScript that
  upstream's ts-jest does).
- `hot-toast-adapted-full`: the same 14 registrations run against the port.
- `hot-toast-differential`: one fixture runs through the port and through the published
  `react-hot-toast@2.6.1` on React, comparing HTML after every step. It covers every toast
  type, updates, the promise lifecycle, dismissal, removal, both render props, the icons and
  headless `useToaster`.

Octane-only conformance, hydration and SSR tests live in `tests/conformance` and
`tests/ssr`. The SSR test compares the server HTML with React's `renderToString` of the
published package. Upstream ships no type tests.
