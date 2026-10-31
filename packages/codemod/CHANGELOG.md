# @octanejs/codemod

## 0.1.3

### Patch Changes

- 42e8c19: Close the gaps a migration of T3 Code exposed. The codemod now adds each binding the migrated code imports to `package.json`, at its catalog version and beside the React package it replaces; TanStack's own adapters, which the catalog does not version, take `latest`. It names each patch the project applies to a replaced React package (pnpm or Bun `patchedDependencies`, or patch-package's `patches/`), which does not reach the binding. `jsx` and `jsxs` from `react/jsx-runtime`, passed to a JSX runtime consumer such as `hast-util-to-jsx-runtime`, become a local `jsx` that calls `createElement` with the key in its props, instead of an error. `event.target` reads as `event.currentTarget` when the handler's type wraps a control's event, such as Base UI's `BaseUIEvent<ChangeEvent<HTMLInputElement>>`, or is a control's `FocusEvent`. Base UI's `Input` and `Field.Control` count as text fields, so their `onChange` becomes `onInput`, and a wrapper that spreads its rest props onto one, directly or through a nested `const { style, ...rest } = props`, passes `onChange` on as `onInput`. The closing "Next" line names a project outside the current directory by its absolute path.
- Updated dependencies [c613495]
- Updated dependencies [d62c24e]
- Updated dependencies [a222919]
- Updated dependencies [0c8ec2f]
- Updated dependencies [134d36c]
- Updated dependencies [0c8ec2f]
- Updated dependencies [82f3946]
- Updated dependencies [b379919]
- Updated dependencies [a222919]
- Updated dependencies [73e718c]
- Updated dependencies [55daac6]
  - octane@0.16.7
  - @octanejs/cli@0.3.3

## 0.1.2

### Patch Changes

- 0bdbad9: Check each migrated binding subpath against what the binding exports. An import such as `@base-ui/react/dialog` that the binding serves no longer reports a "check that it exists" warning, and one it does not serve, such as `zustand/middleware/immer`, is now an error naming the missing export. The CLI's binding catalog records each binding's export subpaths for this check.
- Updated dependencies [0bdbad9]
- Updated dependencies [0bdbad9]
- Updated dependencies [b87a0a0]
  - @octanejs/cli@0.3.2
  - octane@0.16.6

## 0.1.1

### Patch Changes

- Updated dependencies [2b78b6b]
- Updated dependencies [999a5dd]
  - @octanejs/cli@0.3.1
  - octane@0.16.5

## 0.1.0

### Minor Changes

- 722b602: Add `@octanejs/codemod`, the `octane-codemod` command, which migrates a React +
  TSX/JSX codebase to Octane + TSRX.

  It rewrites React imports to `octane` and React libraries to their
  `@octanejs/*` bindings, lowers components to `@{ … }` templates with `@if`,
  `@for`, and `@try` where that keeps React's behavior, unwraps `forwardRef`,
  ports context providers and consumers, legacy roots, and text-input `onChange`,
  spells holes whose types prove them strings or numbers as text bindings, and
  renames every module with JSX to `.tsrx`, updating every import of them. Every
  migrated module is compiled before it is written. With `--strong` it applies the
  compiler's own fixes and keeps each module Strong where the compiler accepts it,
  falling back to compatibility mode with the remaining Strong errors reported.
  What it cannot migrate, such as class components and React libraries without a
  binding, is listed by file and line.

### Patch Changes

- 87271a4: Fixes from migrating the repo's React benchmark apps:

  - `if (c) return <A />;` guards in a component become `@if`/`@else`. Before,
    they rendered through runtime element descriptors.
  - `root.render(<App />)`, `root.render(createElement(App, props))` and
    `hydrateRoot(c, <App />)` mount the component directly, so the generic
    element renderer stays out of the bundle (7–21 kB gzip in the apps).
  - `renderToString` and `renderToStaticMarkup` read `.html`, since Octane returns
    `{ html, css }`.
  - `{x && <A />}` lowers to `@if` when `x` is a `const` holding a comparison.
  - Every HTML page beside the sources is updated, not only `index.html`, and
    imports through a tsconfig `paths` alias (`~/components/Card`) of a renamed
    module are rewritten like relative ones.
  - `react-dom/server.edge` and `react-dom/server.bun` map to `octane/server`, and
    `@tanstack/react-start` maps to the `@octanejs/tanstack-start` framework
    integration.
  - TSRX written for React (`@tsrx/react`), which the codemod cannot read, is
    reported instead of skipped silently.
  - A TanStack root shell's `<html>`, `<head>` and `<body>` become the router's
    `Html`, `Head` and `Body`, which own the hydration root.
  - A context made on either branch of a conditional, and `C.Provider` read as a
    value, are ported like `<C.Provider>`.
  - React names read only in types import as `type`, so bundlers elide them.
  - A `.map()` whose row writes an outer variable stays a `.map()`; `@for` rows
    may be skipped.
  - `//` and `/*` in element text stay text in TSRX.
  - `typeof children === 'function'` also checks `!isChildrenBlock(children)`.
  - `declare module` augmentations follow their package to its binding,
    `@visx/<feature>` imports map to `@octanejs/visx/<feature>`, and a package's
    `/react` entry without a binding is reported.
  - `flushSync` and React Three Fiber imports are reported: Octane's `flushSync`
    leaves the commit's `useEffect`s queued, and three.js scenes belong in
    `.three.tsrx` modules.
  - A Strong fallback no longer leaves a blank line where `"use strong"` was.
- 3430ec0: Fixes from migrating Memos and T3 Code:

  - A text field that spreads a component's rest props (a shadcn-style `Input` or
    `Textarea`) takes `onChange` out of the rest and passes it as `onInput`, so
    controlled fields keep updating per keystroke. Before, the spread passed it
    through as Octane's native `change`, which fires on blur. A spread the codemod
    cannot prove safe is reported.
  - `React.ReactNode`, `React.FC` and the other names of React's global namespace,
    written without an import, map to Octane's types.
  - `forwardRef` type arguments are rewritten like any other type, so
    `React.ComponentPropsWithoutRef<"div">` no longer survives the migration.
  - `e.target` becomes `e.currentTarget` in a handler a component passes on to a
    form control, as the project's types say (`<Input onChange={(e) => …}>`), in
    handlers annotated with a union of controls, and in `onFocus`/`onBlur`.
  - Declaration files are migrated: `declare module 'react' { namespace JSX }`
    custom-element typing moves to `octane/jsx-runtime`, and other augmentations
    of React's types are reported.
  - A package is reported as needing a binding only when the entry imported needs
    React: a package whose export map hides `package.json` is read from disk, and
    one with a `./react` entry needs a binding only there.
  - A component that reads its `children` as an element (`render={children}`,
    `cloneElement`, `Children.only`, `isValidElement`) is marked
    `descriptorChildren`, so its callers pass elements as React does, and its
    call sites in the module keep conditional children as expressions.
  - Added imports use the module's own quote style.
  - `@octanejs/cli` exports `readInstalled`, which reads an installed package's
    manifest without going through its export map.
- 64fea6c: Map Radix primitive packages and TanStack's React adapters to their Octane ports instead of reporting them as unported. `import * as DialogPrimitive from '@radix-ui/react-dialog'` becomes `import { Dialog as DialogPrimitive } from '@octanejs/radix'`, named imports read from that namespace, and `@radix-ui/react-slot` imports `Slot` from the binding's root. `@tanstack/react-table`, `@tanstack/react-hotkeys`, and `@tanstack/react-pacer` become TanStack's `@tanstack/octane-*` adapters, with `Octane` for `React` in type names. Names the port lacks, such as Radix's props types or TanStack Table v8's `useReactTable`, stay on the React package with an error saying what to do.
- e919601: A React package with no Octane binding now stays on React instead of failing
  every module that imports it. A component of that package whose element gives
  React only text and data renders in a `ReactCompat` island when the project has
  React and React DOM 19.2 or newer in the React 19 series, and a comment above each import says the
  package has no port. Its hooks, contexts, and components that take Octane
  children or render callbacks are reported where they are used, and the CLI
  lists every such package under **No Octane port**, with the modules that import
  it, the elements hosted in islands, and the uses that need a port. In
  `--json` output, `missing` lists those packages as objects rather than names.

  `useSyncExternalStore` imported from `use-sync-external-store` or its `/shim`
  entry, React's version for React 17 and earlier, now comes from Octane.
- 868ee70: A ternary between an element and a value now migrates the value arm as `<>{value}</>`. It was emitted as a bare `{value}` arm, which is a JavaScript block rather than a hole, so that branch rendered nothing and is now a compile error.
- b4e303d: Ship TypeScript declarations for the CLI, React codemod and MCP server, including their public subpath exports.
- Updated dependencies [868ee70]
- Updated dependencies [f47dfed]
- Updated dependencies [74de956]
- Updated dependencies [722b602]
- Updated dependencies [3430ec0]
- Updated dependencies [23a25c2]
- Updated dependencies [20d705f]
- Updated dependencies [87a4465]
- Updated dependencies [d6f5536]
- Updated dependencies [3163cd8]
- Updated dependencies [70e0de0]
- Updated dependencies [4fc96cf]
- Updated dependencies [e8b0597]
- Updated dependencies [2c51977]
- Updated dependencies [58ddff8]
- Updated dependencies [618b187]
- Updated dependencies [bab7bb6]
- Updated dependencies [baf3c45]
- Updated dependencies [3f3bf1a]
- Updated dependencies [b4e303d]
- Updated dependencies [f0c0d36]
- Updated dependencies [86cf9cb]
- Updated dependencies [86cf9cb]
- Updated dependencies [fc94c15]
- Updated dependencies [2c88007]
  - octane@0.16.4
  - @octanejs/cli@0.3.0
