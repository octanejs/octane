# @octanejs/codemod

Migrate a React codebase to Octane. `octane-codemod` rewrites React + TSX/JSX
modules as Octane + TSRX, and can take each module on to Strong mode where the
compiler accepts it.

```bash
npx @octanejs/codemod src            # migrate in place
npx @octanejs/codemod src --dry-run  # report only
npx @octanejs/codemod src --strong   # also make modules Strong where possible
```

The codemod adds each binding the migrated code imports to `package.json`, at
the version in its catalog. Then run `npx @octanejs/cli init` to swap the
bundler plugin and `tsconfig` over to Octane and install the dependencies.

> **Prototype.** The rewrites below are tested, and every migrated module is
> compiled by the Octane compiler before it is written, but the rule set is
> still growing. Review the diff, and read the **Needs attention** list.

## What it rewrites

| Rule | React | Octane |
| --- | --- | --- |
| `imports` | `react`, `react-dom`, `react-dom/client`, `use-sync-external-store/shim` | `octane`, merged into one import |
| `imports` | `React.useState`, `React.FC`, and `React.ReactNode` with no import (the global namespace React's types declare) | named imports |
| `imports` | `declare module 'react' { namespace JSX { … } }` (custom elements) | `declare module 'octane/jsx-runtime'` |
| `imports` | React libraries with a binding (`@tanstack/react-query`, ...) | `@octanejs/*` |
| `imports` | `@radix-ui/react-<primitive>` (`import * as DialogPrimitive from '@radix-ui/react-dialog'`) | that primitive's namespace of `@octanejs/radix` (`import { Dialog as DialogPrimitive } from '@octanejs/radix'`) |
| `imports` | `@tanstack/react-table`, `@tanstack/react-hotkeys`, `@tanstack/react-pacer` | TanStack's own `@tanstack/octane-*` adapters, with `Octane` for `React` in type names |
| `imports` | `jsx`, `jsxs` from `react/jsx-runtime`, passed to a JSX runtime consumer such as `hast-util-to-jsx-runtime` | a local `jsx` that calls `createElement` with the key in its props |
| `template-component` | `function C() { …; return <div /> }` | `function C() @{ …; <div /> }` |
| `template-if` | `{a ? <A /> : <B />}`, `{a > 0 && <A />}` (also through a `const`) | `@if (a) { <A /> } @else { <B /> }` |
| `template-if` | `if (a) return <A />; …; return <B />` in a component | `@if (a) { <A /> } @else { …; <B /> }` |
| `template-for` | `{xs.map((x, i) => <li key={x.id} />)}` | `@for (const x of xs; index i; key x.id) { <li /> }` |
| `template-try` | `<Suspense fallback={f}>…</Suspense>` | `@try { … } @pending { f }` |
| `template-text` | `{title}` with `title: string`, `{count}` with `count: number` | `{title as string}`, `{String(count)}`: text bindings, not renderable holes |
| `hook-dependencies` | `useEffect(fn)` (runs every render) | `useEffect(fn, null)`: an omitted list is inferred in Octane |
| `forward-ref` | `forwardRef((props, ref) => …)` | `({ ref, ...props }) => …` |
| `descriptor-children` | a component that clones or inspects `children` (`render={children}`, `cloneElement`, `Children.only`) | `descriptorChildren(…)`, so callers pass elements as React does |
| `context-provider` | `<Ctx.Provider value>` | `<Ctx value>` |
| `context-consumer` | `<Ctx.Consumer>{(v) => …}</Ctx.Consumer>` | `@{ const v = useContext(Ctx); … }` |
| `native-text-change` | `onChange` on a text `<input>` / `<textarea>`, or on Base UI's `Input` / `Field.Control`, which render one | `onInput` (native `change` fires on blur) |
| `native-text-change` | `function Input({ ...props }) { return <input {...props} /> }`, also when a nested `const { a, ...rest } = props` reaches the field | `function Input({ onChange, ...props }) @{ <input onInput={onChange} {...props} /> }` |
| `event-object` | `e.nativeEvent`, `e.persist()`, `e.target` on a control, also through a component typed for one | `e`, removed, `e.currentTarget` |
| `class-attribute` | `className` on an HTML element | `class` |
| `legacy-root` | `ReactDOM.render(el, c)` | `createRoot(c).render(el)` |
| `root-render` | `root.render(<App a={1} />)`, `hydrateRoot(c, createElement(App, p))` | `root.render(App, { a: 1 })`, `hydrateRoot(c, App, p)`: no generic element renderer |
| `server-render` | `renderToString(<App />)` | `renderToString(App).html`: Octane returns `{ html, css }` |
| `strict-mode` | `<StrictMode>…</StrictMode>` | its children (Octane's is a pass-through) |
| `react-compat` | `<Toaster position="top-right" />` from a React package with no Octane port | `<ReactCompat><Toaster position="top-right" /></ReactCompat>`, rendered by React |

Every rewrite keeps React's behavior. Where it cannot be proven equal, the code
is left alone: `{count && <X />}` stays a hole, because React renders `0` there
and `@if` would not. `template-text` reads types through the project's
`tsconfig.json` and runs only on TypeScript modules when that config enables
`strictNullChecks`; otherwise a `string` may hold null, which React renders as
nothing.

Some differences are reported rather than rewritten. Each `flushSync` call
keeps its React shape, but Octane's leaves the commit's `useEffect`s queued
where React runs them before returning. React Three Fiber scenes need moving
into `.three.tsrx` modules by hand.

Every module with JSX becomes `.tsrx`, entries and helpers without a component
included, so Strong mode can reach all of them; one that was JavaScript gains
`// @ts-nocheck`, so it stays as unchecked as it was. Every import of a renamed
module, dynamic imports and `index.html` entry scripts included, is updated.
So is each string elsewhere in the project that is exactly a renamed module's
path, from its own file or from the project root, such as Vite's
`server.warmup.clientFiles: ['./src/main.tsx']`: the `module-paths` rule.
Globs and paths without an extension stay as they are.

### Element-only children

A nested component call in a DOM template supplies a render block. When a
selected React function component declares an element-only `children` prop,
`runCodemod` can preserve a single descriptor by rewriting
`<Frame><Badge /></Frame>` as `<Frame children={<Badge />} />`. This works for
a top-level function in the same file or a direct relative import from another
selected input. The `element-child-prop` count records the calls converted.

The `element-children` note flags recognized React or JSX element annotations
for review at other callers. Spreads, comments, meaningful whitespace, multiple
children, and array-only or parameterized element types need review. A named
prop such as `icon={<Badge />}` already supplies a descriptor.

For a slot that simply renders its contents and should also accept arbitrary
nested templates, add `ChildrenBlock` to **only that slot**:

```ts
import type { JSX } from 'octane/strong/jsx-runtime';
import type { ChildrenBlock } from 'octane/tsrx-boundary';

type FrameProps = {
  children?: JSX.Element | ChildrenBlock;
  icon?: JSX.Element;
};
```

This permits nested text and multiple children as well as one element. Render
the block with `{props.children}`. Keep the element type for APIs that inspect
a descriptor or require exactly one child.

The descriptor-children rule also follows arguments passed to directly called
helper functions in the same module. If a helper inspects a parameter with a
React element API, the component passing its children gets the same marker as a
component that inspects them directly. When both files are selected, a direct
relative import of a marked, named export keeps its nested JSX as descriptor
values, including an array produced by `.map()`. Intrinsic descriptors retain
their `className` prop.

Octane's Vite and Rspack integrations resolve descriptor markers across imports.
If a custom build compiles each file in isolation, supply the compiler's
`isDescriptorChildrenImport` option or pass explicit `children={elements}`.
With `--strong`, descriptor inspection still requires compatibility mode.

## Strong mode

With `--strong`, each template module starts with `"use strong"` and is
compiled in Strong mode. The codemod applies the compiler's own suggested fixes
(`useLazyRef` for lazily initialized refs) and the rewrites that keep React's
meaning exactly: a dependency list the compiler infers identically is dropped,
and `useState(prop)` becomes `useState(() => prop)`. A module with Strong
errors left falls back to compatibility mode, so the app still builds, and the
errors are listed as the work remaining. `--force-strong` keeps the directive
anyway.

## What it reports

Class components, `createRef`, `defaultProps`, and anything else without an
automatic rewrite are listed under **Needs attention** with a file and line.
The process exits with status 1 when any error remains.

The codemod warns when JSX renders an SVG imported with `?react` or the named
`ReactComponent` export. If your loader returns React components for bare
`.svg` imports, check those tags too. A loader that emits Octane components
can keep its existing imports.

A React package with no Octane binding still runs on React, so React stays a
dependency, and a comment above each import of it says so. When the project
has React and React DOM 19.2 or newer in the React 19 series, a component of that package renders in
its own React root through `ReactCompat` if its element gives React nothing
Octane renders: text children and props without elements. The package's hooks
and contexts, and its components that take Octane children or render
callbacks, are reported where they are used. Each such component is wrapped
in a local `NoOctanePort`, which throws the reported error where the component
would render, so the page names the package instead of failing deep in
Octane's renderer. Once you have checked that nothing Octane renders reaches
it, such as a spread of props whose `children` no caller passes, swap the
wrapper for `ReactCompat`. **No Octane port** lists each such
package with the modules that import it, the elements hosted in islands, and
the uses that need a port.

A patch the project applies to a React package the codemod replaces, through
`patchedDependencies` (pnpm, Bun) or `patches/` (patch-package), patches the
React package, not its binding. **Dependencies** names each one, to port by
hand.

## Options

| Flag | |
| --- | --- |
| `--recipe <file>` | Run a local ESM recipe, resolved from the current directory |
| `--strong` | Make modules Strong where the compiler accepts it |
| `--force-strong` | Keep `"use strong"` even with Strong errors left |
| `--target tsx` | Keep JSX and `.tsx`; port only the React APIs |
| `--dry-run` | Report without writing |
| `--print` | Print each migrated module (implies `--dry-run`) |
| `--no-verify` | Skip compiling the result |
| `--json` | Machine-readable result |

## Local recipes

Pass a recipe explicitly to use it for a migration:

```sh
octane-codemod src --recipe ./migrate.mjs --print --json
```

Export a named `runCodemod` function with the same arguments and result as the
package API. For example, this recipe uses its own directory as the project root:

```js
import { runCodemod as migrate } from '@octanejs/codemod';

/** @type {typeof import('@octanejs/codemod').runCodemod} */
export const runCodemod = (paths, options) =>
	migrate(paths, { ...options, root: import.meta.dirname });
```

Install `@octanejs/codemod` in the recipe's project to use the import above.
The CLI loads the module only when you pass `--recipe`. It executes the module
even for a preview, so the recipe must honor `write: false` for all changes
when invoked with `--dry-run` or `--print`. The CLI formats the returned report
and exits with status 1 for reported errors, or status 2 if it cannot load the recipe.

### Migrating scoped signals

Use `createScopedSignalRecipe` to convert one exported writable signal and its
direct consumers together. Supply the source API, the named scope, and the
destination imports that bind an Octane signal to the lifetime of that scope.

```js
import { createScopedSignalRecipe } from '@octanejs/codemod';
import { fileURLToPath } from 'node:url';

export const runCodemod = createScopedSignalRecipe({
	sourceRoot: fileURLToPath(new URL('./src', import.meta.url)),
	tsconfig: fileURLToPath(new URL('./tsconfig.json', import.meta.url)),
	sourceModule: '@example/state',
	scope: { module: '@example/owners', name: 'Workspace' },
	factory: { module: '@example/native-state', name: 'defineCell' },
	reader: { module: '@example/react-state', name: 'useCellValue' },
	// Fill from the preview after reviewing this file and its callers.
	reviewedAccess: { 'palette-controls.ts': '<reviewed SHA-256>' },
});
```

```sh
octane-codemod --recipe ./scoped.mjs --print --json src/palette.ts
```

For an exported `color = signal(Workspace, () => 'blue')` in that file, the
recipe emits `color = defineCell("palette.ts:color", () => 'blue')`. The
key is the source-root-relative path and export name. It converts
`owner.set(color, value)` to `color.set(owner, value)` and
`owner.get(color)` to `color.get(owner)` when the owner is a constant
initialized by `useScope(Workspace)`. A one-argument `useSignal(color)`
becomes `useCellValue(color)`. Aliases on named imports are supported.

The factory must provide one cell per live owner and stable key, accept a
zero-argument initializer, and preserve the source API's get, set, and updater
semantics. The reader must obtain the same owner from the active provider
and preserve subscription and server snapshot behavior. Supply adapters
appropriate to the application's ownership, disposal and rendering model.

For example, a client can keep each cell in its owner's native Octane scope.
Here `nativeScopeFor(owner)` is the application's adapter. It returns the
same live Octane `Scope` for that owner and disposes it with the owner.

```js
// @example/native-state
import { nativeScopeFor } from '@example/owners';

export function defineCell(key, initial) {
	const cells = new WeakMap();
	function bind(owner) {
		const scope = nativeScopeFor(owner);
		if (!cells.has(scope)) {
			const first = initial();
			const cell = scope.signal$(key, first);
			cells.set(scope, {
				cell,
				subscribe: (notify) => cell.subscribe(notify),
				get: () => cell.get(),
				getServer: () => first,
			});
		}
		return cells.get(scope);
	}
	return {
		bind,
		get: (owner) => bind(owner).get(),
		set: (owner, update) => bind(owner).cell.set(update),
	};
}
```

A React consumer can subscribe to that same cell. This example assumes that
the server snapshot is the initial value. Applications that hydrate persisted
or server-provided state should supply their corresponding snapshot.

```js
// @example/react-state
import { useSyncExternalStore } from 'react';
import { useScope } from '@example/state';
import { Workspace } from '@example/owners';

export function useCellValue(definition) {
	const { subscribe, get, getServer } = definition.bind(useScope(Workspace));
	return useSyncExternalStore(subscribe, get, getServer);
}
```

For a component that already receives an Octane writable signal, Strong migration can
replace `useSyncExternalStore(notify => cell.subscribe(notify), () => cell.get(), () => cell.get())`
with `cell.get()` in a module that already opts in to native signal tracking. The receiver must
be a `const` initialized by `signal$()`, or have the public `WritableSignal` type
resolved from `octane/signals` in a strict TypeScript project. Import
`'octane/signals'` for its side effects when you want to enable native tracking
for all render reads in a module that previously imported only its types. A distinct server
snapshot or a project-specific reader keeps its original subscription.

Choose a source root containing all consumers. The recipe discovers static
module references under that root using the supplied TypeScript configuration.
It accepts primitive initial values (including global `undefined`) and simple
zero-argument factories returning them. It reports unsupported owners, escaped
signals, re-exports, and selector or namespace reads before writing. Review
external consumers, computed imports, tracked effects and transaction boundaries
when deciding whether the source and destination APIs have matching semantics.
The recipe reports a SHA-256 hash for each file with imperative accesses.
Record it under `reviewedAccess` after checking that the file and its callers
can use the destination API. The hash identifies the reviewed file. Revisit the
review when a caller or its execution context changes. A scoped access nested
inside a source-library call requires manual migration.

Remove `--print` to apply the preview, then run the application's typecheck and
behavioral tests. Writes stage originals and replacements under
`.octane-scoped-signal` in the source root. If the process is interrupted,
`paths.json` maps each staged number to its source path. Inspect the files
and originals before removing the staging directory and retrying.
