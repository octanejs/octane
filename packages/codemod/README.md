# @octanejs/codemod

Migrate a React codebase to Octane. `octane-codemod` rewrites React + TSX/JSX
modules as Octane + TSRX, and can take each module on to Strong mode where the
compiler accepts it.

```bash
npx @octanejs/codemod src            # migrate in place
npx @octanejs/codemod src --dry-run  # report only
npx @octanejs/codemod src --strong   # also make modules Strong where possible
```

Then run `npx @octanejs/cli init` to swap the bundler plugin, `tsconfig`, and
dependencies over to Octane.

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
| `native-text-change` | `onChange` on a text `<input>` / `<textarea>` | `onInput` (native `change` fires on blur) |
| `native-text-change` | `function Input({ ...props }) { return <input {...props} /> }` | `function Input({ onChange, ...props }) @{ <input onInput={onChange} {...props} /> }` |
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

A React package with no Octane binding still runs on React, so React stays a
dependency, and a comment above each import of it says so. When the project
has React and React DOM 19.2 or newer, a component of that package renders in
its own React root through `ReactCompat` if its element gives React nothing
Octane renders: text children and props without elements. The package's hooks
and contexts, and its components that take Octane children or render
callbacks, are reported where they are used. **No Octane port** lists each such
package with the modules that import it, the elements hosted in islands, and
the uses that need a port.

## Options

| Flag | |
| --- | --- |
| `--strong` | Make modules Strong where the compiler accepts it |
| `--force-strong` | Keep `"use strong"` even with Strong errors left |
| `--target tsx` | Keep JSX and `.tsx`; port only the React APIs |
| `--dry-run` | Report without writing |
| `--print` | Print each migrated module (implies `--dry-run`) |
| `--no-verify` | Skip compiling the result |
| `--json` | Machine-readable result |
