# @octanejs/codemod

## 0.2.0

### Minor Changes

- 5fff265: Run a local migration recipe with `octane-codemod --recipe <file>`. Recipes export a `runCodemod` function and use the CLI's existing options and reports.
- ee25fab: Add a `--svg-paths` option to migrate simple SVG component imports to native SVG elements in projects that expose the original markup through `?raw`.
- 9f446e0: Migrate supported React store hooks from linked TypeScript workspace packages. The codemod generates native hooks that share the original store and preserves manual diagnostics for renderer-dependent uses.
- dd36745: Convert a scoped signal declaration and its readers and writers together with a configured migration recipe.

### Patch Changes

- c96cd6c: Require a known React Intl provider before migrating a formatter’s locale property read, so custom getters can still emit React DOM resource hints during server rendering.
- 6c496e3: Report a bare default SVG import used as a component in a file migrating to `.tsrx`, where SVG loaders can return an asset URL. The diagnostic identifies the JSX site and explains how to preserve component loading.
- 98afa90: Write the full migration report when the command's output is piped to another process.
- ad1c372: Preserve the live value of an unkeyed input when a JSX conditional only changes its literal default value.
- f916824: Keep React store hooks when an imported handle receives unverified factory arguments from an application module linked to a React DOM resource-hint API.
- 597eecc: Convert JSX lists over dense array literals when names that match row bindings are only property names or are declared inside the iterable.
- 8957832: Allow a scalar field destructured from a local object to cross into a React island when another field contains JSX. Continue checking writes to the selected field.
- 6e46fd8: Preserve unused effect dependency identifiers that intentionally trigger cleanup and setup when migrating React components to Strong mode.
- 403a876: Migrate a lazily initialized React state record whose value is consumed only by effects to a lazy ref in Strong mode. The record retains its original identity and effect dependency behavior through updates and cleanup.
- 254327f: Pass a single nested JSX element as an explicit children prop when the selected React component requires element values. Report narrow slots that need caller review.
- 73783bd: Migrate imperative handles with a fresh local method to Strong mode while preserving ref attachment on every render.
- 9be71db: Preserve fixed receiver dependencies when migrating React imperative handles to Strong mode.
- 1391aeb: Update imports in other modules when migrating a component individually so its callers can still find the renamed TSRX file.
- 6c70e90: Keep the binding diagnostic when JSX reaches a React island through Object.assign or an object passed to or returned from a local helper.
- 1987f37: Preserve child descriptors when a component passes its children to a local inspection helper. Preserve mapped JSX children at directly imported, selected components. Keep the original `className` on nested intrinsic descriptors so inspectors can read it.
- 74f3374: Follow a localized message through two selected components when the formatter result reaches a native text attribute.
- 7319277: Migrate React Intl locale destructuring when a private component reads from its proven local IntlProvider.
- 03cab30: Keep the binding diagnostic when JSX reaches a React island through writes to a local object property.
- f73e68e: Preserve authored property dependencies and fresh setup callbacks when migrating React layout effects to Strong mode.
- 036ca9c: Convert a component's render-time update that keeps it mounted after opening to linked state when the codemod can preserve its input reads and its closed render returns null.
- 30c62de: Migrate proven local external-store wrappers for native callers. Keep the original React hook and share its browser snapshot and subscription functions with one generated Octane wrapper.
- a259a31: Recognize top-level const aliases of store handles created by verified shared factories. Migrated hooks keep reading and updating the original handle.
- 2cf99e4: Migrate more React Intl calls whose results reach DOM text attributes through JSX wrappers, including calls with scalar substitutions and fallback labels.
- fd0f5b2: Keep JSX map calls with known custom methods or visibly sparse array literals in compatibility mode so the original callback dispatch is preserved.
- 772ed22: Retain the migration diagnostic when a store handle's defining module changes one of its members.
- dd36745: Ship the codemod CLI and library from strict TypeScript sources, with generated declaration files and named types for programmatic consumers and local recipes.
- 0568690: Report a collision before migrating when a TSRX output already exists or two source files would create the same output. Dry runs report the same conflict.
- b8f0af6: Continue codemod previews past TSRX rename collisions. Report each conflicting source and preview the remaining files so partially migrated projects can see their remaining work. Write mode still stops before editing the project when a collision is found.

  Convert JSX `&&` guards to `@if` when strict TypeScript types prove the condition can only be boolean or nullish.

  Add `--no-project-types` for previews on large projects. The codemod uses module-local types and keeps compiler verification and import resolution.

  Mark migrated files as blocked in the text report when the codemod found an error in their original source.

  Preserve every-render React hook schedules when requesting Strong mode. Convert filtered array lists when the callback parameter names overlap safely.
- e07e4a9: Migrate direct JSX uses of consolidated Radix Slot members to flat binding exports and preserve the element descriptor used to project props onto a single intrinsic child.
- af1d737: Migrate supported React Intl providers, scalar formatter reads, and plain messages through a shared project-local adapter. Keep the project's React Intl dependency for formatting and preserve its locale across supported React component boundaries. Inline rich-text callbacks with a single native tag can keep producing React elements inside a retained React component.

  Strong migrations can preserve effects keyed by object identity when a callback reads a property or calls a method on an immutable local receiver.
- 909f59b: Preserve paragraphs when automatically hosting an unported React child. Use the installed inline ReactCompat host where available and report a migration error when it cannot be resolved.
- 7e90829: Preserve React's `createRef` allocator in named imports and re-exports, dotted namespace access, and direct type queries. Its ref objects work with Octane's ref lifecycle.
- aa9472d: Keep inline intrinsic rich-text substitutions in React when migrating a component that uses the React Intl bridge.
- 92321ae: Migrate React DOM's `Root` type alongside its renderer APIs, including named, namespace, and inline type imports.
- b40ef32: Migrate SVG groups clipped by a single local rectangle with `--svg-paths`, preserving the authored clip ID and definition order.
- 87016a4: Allow React islands to receive scalar values destructured from local member expressions and array slots, or supplied by a missing-field default. Preserve the value of a scalar copied before a later field assignment.
- 629e219: Allow native SVG migration for rectangles filled by a local, single-path repeating pattern.

  Preserve scale, translate, and matrix transforms on SVG paths and fixed string tokens passed to `clsx`.
- feef00e: Migrate static SVG paths and rectangles inside scaled or translated groups with `--svg-paths`, preserving their order, strokes, opacity, and CSS custom-property paints.
- 063aaab: Recognize named re-exports of verified store handles, conditional hook arguments, and branded primitive identifiers. Reuse the same generated hook source across consumers of the same linked package.

  Migrate scalar React Intl message substitutions and localized native attributes. Retained React rich-text callbacks can use a literal key and multiline JSX around their argument. Keep authored React boundaries and report values that carry native JSX into a React component.
- 42cdd3d: Preserve the original React element when a verified store service receives a self-closing external React component with literal props.
- 07d6df0: Migrate React submit event and handler annotations to the existing Octane native event types. Report submit handlers that rely on synthetic event behavior or whose event escapes the handler.
- e9df1f8: Migrate supported path SVGs whose class names are assembled by the installed `clsx` package from literal tokens and simple conditions.
- bf6c401: Keep the SVG issuer diagnostic when a `clsx` condition can change before the native SVG renders.
- f43f499: Allow `--svg-paths` to migrate SVGs whose classes come directly from a CSS Module or from CSS Module tokens passed to the installed `clsx` package.
- 25a5b82: Preserve a fixed CSS custom-property color on a directly rendered SVG component with `--svg-paths`.
- f8745ae: Preserve supported inline CSS transforms when migrating static SVG imports with `--svg-paths`.
- 157ae95: Let `--svg-paths` migrate a static SVG stored in a component-local variable when its only read reaches a proven native render destination.
- 990cd16: With `--svg-paths`, migrate SVGs passed to a named prop when the receiving component checks its presence and renders it into native output, including as a nullish fallback.
- 7e00bdf: Migrate static SVGs with leading-dot opacity values and icons whose class is selected by a fixed local condition.
- 0d64904: Migrate path-only SVGs when their owning or receiving component is referenced in a TypeScript type query. A type-only export cannot establish a renderable owner.
- 30df38d: Follow rendered props through selected components when migrating path-only SVGs. Keep the original import when a component can inspect the element or pass it to another renderer.
- 44271b1: Preserve supported literal `fill` and `focusable` overrides on native SVG components migrated with `--svg-paths`.
- fcaa9a7: Report native component setup calls to unchanged local TypeScript hooks that directly invoke React's useState or useSyncExternalStore.
- ae26518: Migrate verified workspace store hooks when an effect or native click passes the store to an unchanged local TypeScript function.
- 03f27cd: Keep renderer ownership diagnostics when a Unicode-escaped `eval` can access a scoped store binding.
- c180c81: Keep keyed React lists as `.map()` when moving the key into an `@for` header could change the order of row setup and key evaluation.
- ea6faf3: Preserve literal string data attributes on native SVG components migrated with `--svg-paths`.
- b244f8c: Offer a Strong migration from an every-commit layout effect that copies a scalar DOM measurement into adjacent state to `useLayoutSnapshot`. The codemod preserves the every-commit schedule of React layout effects with omitted dependencies, including when a component stays in compatibility mode.
- e528743: Avoid loading the TypeScript dependency graph for component migrations that can be rewritten without project type information.
- bd48216: Migrate `@floating-ui/react-dom` imports to the standalone Octane positioning entry and add the root binding package as a dependency.
- 1498cf1: Migrate React Intl formatter reads when a local component forwards the result to a DOM text attribute, including through a rest-prop spread.
- 2abc648: Migrate mount effects that call local helpers over stable refs while preserving when those helpers read and clear their refs.
- 3e8d6b9: Migrate a direct React subscription to a native writable signal into a tracked signal read in Strong components when the client and server read the same value.
- e6dc5ea: Migrate `ReactEventHandler<T>` to Octane's native event handler type, with a typed `currentTarget`. The codemod reports React-only event uses for review.
- ee5e8be: Migrate store method calls that use a handle from the original workspace store and pass plain data.
- 00270a3: Warn about rendered SVG imports that request React components when migrating to TSRX.
- b336568: Migrate expression-bodied effects to Strong mode when their explicit dependencies can be preserved, including effects that return a cleanup function.
- 09cc966: Preserve authored ReactCompatInline boundaries and keep their children under the React renderer.
- 6cdbc95: Keep keyed map callbacks when a row guard can skip the key or run before it.
- 4c2092c: Preserve render-time property reads that trigger React effects when migrating eligible dependency lists to Strong mode.
- 842e279: Allow safe store hook migrations when a component is referenced by a TypeScript type query. Runtime component references still require renderer ownership proof.
- b19050a: Preserve string `className` and object `style` types when migrating React components that wrap intrinsic elements with `ComponentProps`, `ComponentPropsWithRef`, or `ComponentPropsWithoutRef`.
- 1125a21: Keep the workspace-store binding diagnostic for inputs traced to local factory wrappers, including primitive keys that can dispatch to renderer-owned callbacks.
- de65805: Defer workspace store helper calls when a local runtime dependency can change during migration.
- 429b910: Generate the React Intl and linked-store adapters on stable Octane 0.17 releases.
- b464246: Keep renderer-boundary diagnostics when a scalar-looking React island prop receives JSX through a local reassignment, destructuring assignment, or for-of loop.
- Updated dependencies [bf398e2]
- Updated dependencies [cd974fa]
- Updated dependencies [61e724f]
- Updated dependencies [3c4f5ad]
- Updated dependencies [ac86023]
- Updated dependencies [3dc24cf]
- Updated dependencies [5add880]
- Updated dependencies [75bcd35]
- Updated dependencies [5af6e70]
- Updated dependencies [f925209]
- Updated dependencies [6512e48]
- Updated dependencies [4258cf5]
- Updated dependencies [343be9a]
- Updated dependencies [792af47]
- Updated dependencies [a2fa609]
- Updated dependencies [1325880]
- Updated dependencies [0fda24c]
- Updated dependencies [5a5aa6c]
- Updated dependencies [3975992]
- Updated dependencies [7db3f95]
- Updated dependencies [1868a5b]
- Updated dependencies [e821117]
- Updated dependencies [6fa5f7f]
- Updated dependencies [435bdac]
- Updated dependencies [67298b5]
- Updated dependencies [4b64604]
- Updated dependencies [b244f8c]
- Updated dependencies [c9bcc4f]
- Updated dependencies [909a2ed]
- Updated dependencies [613a05a]
- Updated dependencies [acadce2]
- Updated dependencies [2c9d3e3]
- Updated dependencies [04b73de]
- Updated dependencies [898c502]
- Updated dependencies [0d65190]
- Updated dependencies [3778ae7]
- Updated dependencies [64d779e]
- Updated dependencies [ecd6844]
- Updated dependencies [5450451]
- Updated dependencies [d5d6be8]
- Updated dependencies [26b65e9]
- Updated dependencies [21f3bbf]
- Updated dependencies [b42faf3]
- Updated dependencies [3378352]
- Updated dependencies [ad6cb45]
- Updated dependencies [2060f37]
- Updated dependencies [895fc94]
  - octane@0.17.0
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
