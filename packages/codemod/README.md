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

React submit event annotations become Octane's native `NativeEvent<T, globalThis.SubmitEvent>` or its `EventHandler`. Uses of the synthetic event, an untyped target, or an event passed into another function need review. A callback's `currentTarget` still refers to the listener's element.

Every rewrite keeps React's behavior. Where it cannot be proven equal, the code
is left alone: `{count && <X />}` stays a hole, because React renders `0` there
and `@if` would not. A strict TypeScript project can prove that a guard's value
is boolean or nullish, so `{visible && <X />}` can become an `@if` even when
`visible` is optional. `template-text` reads types through the project's
`tsconfig.json` and runs only on TypeScript modules when that config enables
`strictNullChecks`; otherwise a `string` may hold null, which React renders as
nothing.

Some differences are reported rather than rewritten. Each `flushSync` call
keeps its React shape, but Octane's leaves the commit's `useEffect`s queued
where React runs them before returning. React Three Fiber scenes need moving
into `.three.tsrx` modules by hand.

When an exported native host component begins setup with a call to an unselected
local TypeScript hook, the codemod reports a binding error if the original named
export begins by calling a named React import of `useState` or
`useSyncExternalStore`. Give native callers a compiled Octane hook and retain the
original for React callers.

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

A React layout effect with no dependency list runs after every commit. When its
only work is copying a local element's width, height, or form membership into
adjacent state, the compiler can replace both hooks with `useLayoutSnapshot`.
The original state initializer supplies the server and first-render value.
The migrated hook measures after synchronous layout updates settle. For a
measurement that must run at a specific point among layout effects, keep
`useLayoutEffect(measure, null)` in compatibility mode. The explicit `null`
keeps the every-commit schedule.

With `--strong`, each template module starts with `"use strong"` and is
compiled in Strong mode. The codemod applies the compiler's own suggested fixes
(`useLazyRef` for lazily initialized refs) and the rewrites that keep React's
meaning exactly: a dependency list the compiler infers identically is dropped,
and `useState(prop)` becomes `useState(() => prop)`. A module with Strong
errors left falls back to compatibility mode, so the app still builds, and the
errors are listed as the work remaining. A React effect with omitted or literal
`undefined` dependencies keeps its every-commit schedule. In a filtered array
list, the filter and map callbacks may reuse a parameter name.
`--force-strong` keeps the directive even when Strong errors remain.

## What it reports

Class components, `defaultProps`, and anything else without an
automatic rewrite are listed under **Needs attention** with a file and line.
The process exits with status 1 when any error remains.

Named imports and re-exports, dotted namespace access, and direct type queries
for React's `createRef` keep the original allocator. Octane can attach and
clear the ref object it returns.

If a migration target already exists or two sources share a target, write mode
stops before editing the project. `--dry-run` and `--print` report the colliding
sources and preview the rest. Imports of colliding sources keep their existing
paths, so check those dependencies before adopting the preview.

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
| `--no-project-types` | Use module-local types without loading the project type graph |
| `--json` | Machine-readable result |

For a first pass over a large project, `--dry-run --strong --no-project-types`
keeps import path resolution and compiler verification. Rewrites that require
types from other files may be skipped. Use the default project type analysis
when verifying a smaller batch for adoption.

## React Intl

When an application has React Intl 7, React and React DOM 19.2 or later in the 19 series, and either Octane 0.16.7 or later in the 0.16 series or a stable Octane 0.17 release, the codemod can generate one shared `octane-react-intl.tsrx` source file. It places it in the project's existing `src` directory or at the project root, and subsequent migrations reuse it. Preview and print include the helper before a write. If an earlier migration created the original helper and its contents still match, the codemod previews and upgrades it at the same path so existing providers continue to share context. A locally edited helper requires a manual merge. The app keeps its installed React Intl formatter, messages, and cache.

Named `useIntl` imports can move when a component calls a supported scalar formatter. A locale read can also move when a private component displays the value from its own literal `IntlProvider`. An external provider can supply a getter that performs React DOM work during server rendering. A provider's rich-text defaults can make `formatMessage` return React elements even with zero substitution values. For these calls the codemod follows local constants to known text or comparison uses, including ARIA attributes on intrinsic elements, input placeholders, image alt text, and option labels. Escaping formatters and unproven renderable results retain a binding diagnostic.

For a literal message descriptor with optional scalar substitutions, the codemod also follows the result through local components and directly imported named components selected in the same run. For example, a field can read its disabled state and forward a localized placeholder through a props spread to a native input. The codemod checks the uses of the props object on every branch, including when the caller supplies a fallback label. This sibling-property check assumes ordinary data props and defers when either module accesses object prototypes. A wrapper that gives the formatted value or its props bag to a custom renderer still needs review. When both selected functions return their markup directly, the prop can also pass through one named attribute on an imported function before reaching the native attribute.

Self-closing `FormattedMessage` elements can render text directly, including ICU substitutions such as `values={{ count }}` when the named values are scalar and evaluating them keeps JSX in its original renderer. Custom text wrappers and provider-defined rich content use the installed React component. Supported React display islands receive the nearest real Intl context. A React-hosted Octane component reads the original provider. A standalone Octane root uses the generated `IntlProvider` or `RawIntlProvider`. The codemod moves providers with a closed subtree of native elements and scalar children. Providers surrounding other components need a review of which renderer owns their descendants. React islands retain the [ReactCompat rendering limits](../../docs/react-compat.md).

Inside an authored `ReactCompat` boundary, a single original React component can be selected by a ternary that supplies different props on either branch. A namespaced bridge becomes a named import so the compiler can transport that child. Lists, optional children, and JSX-valued props require a React component to own their rendering.

Inside a retained React component, a rich-text callback such as `chunks => <strong>{chunks}</strong>` can keep producing a genuine React element. When the codemod creates a React island for `FormattedMessage`, an inline substitution such as `values={{ lineBreak: <br /> }}` also stays in React if the other props and substitutions cannot observe a change in evaluation timing. The codemod recognizes a single intrinsic tag with literal attributes and an optional literal key. Callbacks can use their parameter as the sole child. Spreads, refs, and event handlers retain a migration diagnostic.

## Store hooks in linked workspace packages

The codemod can migrate a named hook from a local `workspace:` dependency when it can read the TypeScript implementation, trace a React context read, and verify that the hook uses the same store code as a renderer-independent public entry. The public entry and hook names can vary. The supported runtime versions match the React Intl adapter above. A top-level `const` can expose a second name for a handle already created by a verified shared factory. Consumers keep the original handle identity.

Preview shows the native hook sources the codemod would add alongside the shared `octane-store-context.tsrx` and `octane-store-hooks.ts` helpers. The generated hooks call the original store, subscription, and snapshot functions. They retain React’s dependency lists and hook order. The application compiles these sources with its installed toolchain. When the workspace hook implementation changes, rerun the migration from its original React inputs in a clean checkout and review the new companions. A differing file at a generated path blocks the write.

Hosted components inherit the original React provider. To render a converted component in a standalone Octane root, pass its **original React context** and the active store value to the generated provider.

```tsx
<NativeStoreProvider context={ReadingContext} value={activeStore}>
  <ReadingPanel />
</NativeStoreProvider>
```

The codemod checks how each component uses the hook. Conditions, scalar output, and dependency comparisons can qualify. This includes branded primitive IDs, conditional choices of verified inputs, and named re-exports of the original store handle from local TypeScript modules. A named method on the returned store can take an imported handle created by that store’s verified factory, followed by literals or constants initialized with literals. A named import initialized by a call to a local function declaration keeps the binding diagnostic when passed to a hook or store method. Even a primitive key can dispatch to renderer-owned callbacks in the active store.

A verified hook result can also go to a named function exported directly from an unchanged local TypeScript module whose local runtime dependencies also remain unchanged. The call must run inside a React effect, its cleanup, or an inline click handler on an intrinsic element in the component’s rendered output. For example, `useEffect(() => { syncSettings(store, 'startup'); }, [store])` keeps the same function and store. The other arguments must be literal data or local constants initialized with literals, and the call must discard the result. Calls during render and callbacks passed to custom components need review.

When the file uses the project’s React 19.2+ automatic JSX runtime, a service read with a verified handle can receive a self-closing component from an installed React package with literal props, for example `store.read(notices).show(<Message id="saved" />)`. The generated code creates the original React element, so the service can render it later under its React provider.

Dynamic JSX payloads, opaque store values rendered as children, and components passed to unknown renderers still require manual migration.

<a id="path-only-svg-components"></a>

## Static SVG components

When a file becomes `.tsrx`, its bundler may resolve a bare default SVG import to an asset URL. The codemod reports an error at each JSX tag that still uses that import, including tags selected through local aliases, fallback expressions or default values on parameters and destructured bindings, and tags inside `ReactCompat`. The check follows a binding’s declared default even when a caller always supplies the property. Configure the SVG loader for `.tsrx`, or move the import and rendering into a React-owned `.tsx` component hosted by `ReactCompat`. Using an SVG URL as an image source is unaffected.

Use `--svg-paths` (or `svgPaths: true` in the JavaScript API) when your bundler's bare default SVG import renders the authored SVG geometry, applies caller props to its root, and the same asset with `?raw` imports its XML as a string. For aliased requests, the bundler and TypeScript paths must resolve to the same local file. Check both your development and production loaders before enabling this option. Custom SVG templates, optimizers that rewrite the rendered geometry, and URL-producing loaders can have different behavior.

For example, `<Mark className="icon" aria-hidden data-testid="status-icon" />` can remain a direct SVG child of a button. The codemod checks the asset and each use of the import. The generated component forwards quoted string values for lowercase `data-*` attributes outside Octane's reserved renderer markers. It also accepts classes such as `className={cx("icon", open && "expanded")}` when `cx` imports the default or named `clsx` export from the installed package. A truth test can use a local const initialized earlier in the same function or a parameter that the function never reassigns. A class token can also come from a fixed string parameter or a local const initialized with a string literal. Passing objects to `clsx` or calling an arbitrary class builder keeps the import for review. A direct conditional such as `className={open ? "expanded" : "collapsed"}` can also select between string literals using a fixed, initialized binding. Supported geometry includes ordered, self-closing paths and rectangles, optionally nested in groups. Paths and groups support scale, translate and six-number matrix transforms. The helper preserves supported dimensions, fills, strokes, opacity (including leading-dot decimals), and single CSS custom-property paints such as `var(--icon-fill)`. A root-level group can reference a rectangular clip with `clip-path="url(#id)"`. The SVG must contain one root-level `<defs>` with one matching `<clipPath id="…">` and one rectangle. The native component preserves the authored ID across instances. Enable this option only when your SVG loaders preserve that ID and its references. A root rectangle can use one local repeating pattern containing a single path. The pattern must declare `patternUnits="userSpaceOnUse"` and positive integer tile dimensions. The helper preserves the authored ID and document order. Each asset may use a rectangular clip or a single-path pattern. Gradients, masks and other element references require review. Each supported import points to a small native component beside the asset. That component reads the live SVG through `?raw`, so changes to supported geometry appear on the next build. Editing the asset to use unsupported markup produces an explicit error.

A directly returned SVG can use a fixed color such as `style={{ color: 'var(--icon-color)' }}`, including through intrinsic parents. This requires one JSX use of the import and a lowercase custom property with no fallback. The generated component keeps the fixed color on its SVG root.

The SVG class can also come from a CSS Module. For example, after `import styles from './badge.module.css'`, both `className={styles.mark}` and `className={cx(styles.mark, styles.accent)}` keep the stylesheet's scoped and composed class names. A `clsx` call that reads the stylesheet must use only string literals and direct class reads. This requires the original and migrated modules to load the same CSS class map, with stable, side-effect-free string exports throughout the application. The codemod checks plain relative default imports and their uses in the current source file. Passing the imported map to another function or assigning to a property keeps the SVG diagnostic.

Quoted `fill` and `focusable` props can override the corresponding SVG root attributes. For example, `<Mark fill="currentColor" focusable="false" />` uses the caller's paint and focusability. Omitting either prop preserves the value from the asset. The override must pass the same validation as the corresponding attribute in the SVG file.

A component can also store an SVG with literal attributes directly in a local before rendering it. For example, `let icon = null; if (active) icon = <Mark />; return <span>{icon}</span>;` has a single render outlet. The local must be declared directly in the component body with `let` or `const`, and that body must end in a single return. Each additional write must be a standalone assignment, and the only runtime read must lead to a proven render destination in the same function. A captured local, a second read, or a recognized hook call in that function keeps the SVG diagnostic.

The codemod follows an icon through local components and directly imported components selected in the same migration. For example, with `function Button({ children }) { return <button>{children}</button>; }`, it can follow `<Button><Mark /></Button>` to the native button. The same check applies to a named prop such as `icon`. A receiver can also test an explicitly named prop for presence and render it, for example `icon ? <span>{icon}</span> : null` or `<span>{preferred ?? icon}</span>`. Each use must reach native output or only test presence in the receiving function. At least one use must render the value. Presence checks on JSX children and on slots forwarded through another receiver need review because an empty JSX child can be a truthy render function. The caller’s surrounding JSX must also reach an exported native component. A type query such as `ComponentProps<typeof Button>` can still refer to the component after migration. A query on the imported SVG itself keeps its original component type and import. The check defers recognizable hook calls and props compiled as text. When an icon reaches an unverified renderer, you can prepare its native module separately with `octane-codemod --svg-paths src/icons/mark.svg`. This writes the native component beside the asset and leaves callers available for review. Confirm the receiving component renders Octane elements before switching its import to `./mark.svg.octane`.

The generated SVG uses the native SVG namespace. In a client mount, Octane places an explicit `xmlns` attribute in the XMLNS namespace; React sets that attribute without a namespace. Applications that inspect the namespace of the attribute itself should keep their existing rendering path.

An inline style can set a single `transform` declaration. The value can be a string literal or a template with numeric literals selected by a fixed, initialized binding, such as `style={{ transform: \`rotate(\${open ? 0 : -90}deg)\` }}`. Octane preserves the declaration across updates and can add a trailing semicolon to the server-rendered style attribute.

Shared component values, React island uses, refs, spread props, and SVGs with unsupported elements keep their original imports.

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

When an effect with dependencies such as `[controller]` reads `controller.value` or calls `controller.start()`, Strong migration can preserve the original object-identity dependency. For an unused dependency such as `revision` in `[controller, revision]`, the codemod can emit `void revision` inside the effect so a revision change still triggers cleanup and setup. It attempts these rewrites for immutable bindings and verifies the resulting dependencies with the project compiler. An imperative handle can use the same rewrite with a list of fixed bindings, keeping property reads inside its factory.

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
