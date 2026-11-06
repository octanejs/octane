# @octanejs/codemod

## 0.2.0

### Minor Changes

- 4c78bee: Run a local migration recipe with `octane-codemod --recipe <file>`. Recipes export a `runCodemod` function and use the CLI's existing options and reports.
- 3ea5f6e: Migrate supported React store hooks from linked TypeScript workspace packages. The codemod generates native hooks that share the original store and preserves manual diagnostics for renderer-dependent uses.
- 4ad18ec: Convert a scoped signal declaration and its readers and writers together with a configured migration recipe.

### Patch Changes

- b2c172d: Write the full migration report when the command's output is piped to another process.
- ddea1b6: Pass a single nested JSX element as an explicit children prop when the selected React component requires element values. Report narrow slots that need caller review.
- 4271213: Update imports in other modules when migrating a component individually so its callers can still find the renamed TSRX file.
- bc33c0d: Preserve child descriptors when a component passes its children to a local inspection helper. Preserve mapped JSX children at directly imported, selected components. Keep the original `className` on nested intrinsic descriptors so inspectors can read it.
- 4ad18ec: Ship the codemod CLI and library from strict TypeScript sources, with generated declaration files and named types for programmatic consumers and local recipes.
- 72e8118: Report a collision before migrating when a TSRX output already exists or two source files would create the same output. Dry runs report the same conflict.
- 7098c0a: Continue codemod previews past TSRX rename collisions. Report each conflicting source and preview the remaining files so partially migrated projects can see their remaining work. Write mode still stops before editing the project when a collision is found.

  Convert JSX `&&` guards to `@if` when strict TypeScript types prove the condition can only be boolean or nullish.

  Add `--no-project-types` for previews on large projects. The codemod uses module-local types and keeps compiler verification and import resolution.

  Mark migrated files as blocked in the text report when the codemod found an error in their original source.

  Preserve every-render React hook schedules when requesting Strong mode. Convert filtered array lists when the callback parameter names overlap safely.
- 6e0ad64: Migrate supported React Intl providers, scalar formatter reads, and plain messages through a shared project-local adapter. Keep the project's React Intl dependency for formatting and preserve its locale across supported React component boundaries. Inline rich-text callbacks with a single native tag can keep producing React elements inside a retained React component.

  Strong migrations can preserve effects keyed by object identity when a callback reads a property or calls a method on an immutable local receiver.
- 80e7344: Offer a Strong migration from an every-commit layout effect that copies a scalar DOM measurement into adjacent state to `useLayoutSnapshot`. The codemod preserves the every-commit schedule of React layout effects with omitted dependencies, including when a component stays in compatibility mode.
- 985d06c: Avoid loading the TypeScript dependency graph for component migrations that can be rewritten without project type information.
- 002d67d: Migrate React Intl formatter reads when a local component forwards the result to a DOM text attribute, including through a rest-prop spread.
- 52e12e8: Migrate a direct React subscription to a native writable signal into a tracked signal read in Strong components when the client and server read the same value.
- 3054ea8: Migrate store method calls that use a handle from the original workspace store and pass plain data.
- 7270785: Warn about rendered SVG imports that request React components when migrating to TSRX.
- 6274390: Preserve string `className` and object `style` types when migrating React components that wrap intrinsic elements with `ComponentProps`, `ComponentPropsWithRef`, or `ComponentPropsWithoutRef`.
- Updated dependencies [1246bc0]
- Updated dependencies [a5eb58a]
- Updated dependencies [6112c89]
- Updated dependencies [80e7344]
- Updated dependencies [1c30a9a]
- Updated dependencies [e0928d2]
- Updated dependencies [bfacbe5]
- Updated dependencies [d01d2a5]
  - octane@0.16.8
  - @octanejs/cli@0.3.4

## 0.1.4

### Patch Changes

- 58701b1: `npx @octanejs/codemod` now runs from a clean environment. The codemod verifies each migrated module with the Octane compiler it installs, and that compiler needs `@tsrx/oxc`, which `octane` declares only as an optional peer. The codemod did not install it, so every run on a project without Octane installed failed with `Cannot find package '@tsrx/oxc'`. The codemod now depends on `@tsrx/oxc` at the version `octane` peers on.
- 85a1144: A component from a React package with no Octane port that cannot render in a `ReactCompat` island now fails where it renders with the error the codemod reported, naming the component and the package. The codemod used to leave the element as it was, so Octane failed on the React component deep in its renderer with `Element type is invalid … object with keys {$$typeof, render}`. The element is now wrapped in a local `NoOctanePort` component that throws that error. Swap the wrapper for `ReactCompat` once nothing Octane renders reaches the component.

  String literals that are exactly the path of a module renamed to `.tsrx` are now updated in configs, scripts, and other modules that keep their names, such as Vite's `server.warmup.clientFiles: ['./src/main.tsx']`. A path resolves from its own file or from the project root. Before, Vite logged `Failed to load url /src/main.tsx` on every start.

## 0.1.3

### Patch Changes

- 42e8c19: Close the gaps a migration of T3 Code exposed. The codemod now adds each binding the migrated code imports to `package.json`, at its catalog version and beside the React package it replaces; TanStack's own adapters, which the catalog does not version, take `latest`. It names each patch the project applies to a replaced React package (pnpm or Bun `patchedDependencies`, or patch-package's `patches/`), which does not reach the binding. `jsx` and `jsxs` from `react/jsx-runtime`, passed to a JSX runtime consumer such as `hast-util-to-jsx-runtime`, become a local `jsx` that calls `createElement` with the key in its props, instead of an error. `event.target` reads as `event.currentTarget` when the handler's type wraps a control's event, such as Base UI's `BaseUIEvent<ChangeEvent<HTMLInputElement>>`, or is a control's `FocusEvent`. Base UI's `Input` and `Field.Control` count as text fields, so their `onChange` becomes `onInput`, and a wrapper that spreads its rest props onto one, directly or through a nested `const { style, ...rest } = props`, passes `onChange` on as `onInput`. The closing "Next" line names a project outside the current directory by its absolute path.
- Updated dependencies [99dcc06]
- Updated dependencies [a740e20]
- Updated dependencies [4eadb3d]
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
