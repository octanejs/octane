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
| `imports` | `react`, `react-dom`, `react-dom/client` | `octane`, merged into one import |
| `imports` | `React.useState`, `React.FC` | named imports |
| `imports` | React libraries with a binding (`@tanstack/react-query`, ...) | `@octanejs/*` |
| `template-component` | `function C() { …; return <div /> }` | `function C() @{ …; <div /> }` |
| `template-if` | `{a ? <A /> : <B />}`, `{a > 0 && <A />}` | `@if (a) { <A /> } @else { <B /> }` |
| `template-for` | `{xs.map((x, i) => <li key={x.id} />)}` | `@for (const x of xs; index i; key x.id) { <li /> }` |
| `template-try` | `<Suspense fallback={f}>…</Suspense>` | `@try { … } @pending { f }` |
| `template-text` | `{title}` with `title: string`, `{count}` with `count: number` | `{title as string}`, `{String(count)}`: text bindings, not renderable holes |
| `hook-dependencies` | `useEffect(fn)` (runs every render) | `useEffect(fn, null)`: an omitted list is inferred in Octane |
| `forward-ref` | `forwardRef((props, ref) => …)` | `({ ref, ...props }) => …` |
| `context-provider` | `<Ctx.Provider value>` | `<Ctx value>` |
| `context-consumer` | `<Ctx.Consumer>{(v) => …}</Ctx.Consumer>` | `@{ const v = useContext(Ctx); … }` |
| `native-text-change` | `onChange` on a text `<input>` / `<textarea>` | `onInput` (native `change` fires on blur) |
| `event-object` | `e.nativeEvent`, `e.persist()`, `e.target` on a control | `e`, removed, `e.currentTarget` |
| `class-attribute` | `className` on an HTML element | `class` |
| `legacy-root` | `ReactDOM.render(el, c)` | `createRoot(c).render(el)` |
| `strict-mode` | `<StrictMode>…</StrictMode>` | its children (Octane's is a pass-through) |

Every rewrite keeps React's behavior. Where it cannot be proven equal, the code
is left alone: `{count && <X />}` stays a hole, because React renders `0` there
and `@if` would not. `template-text` reads types through the project's
`tsconfig.json` and runs only on TypeScript modules when that config enables
`strictNullChecks`; otherwise a `string` may hold null, which React renders as
nothing.

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

Class components, `createRef`, `defaultProps`, unported React libraries, and
anything else without an automatic rewrite are listed under **Needs attention**
with a file and line. The process exits with status 1 when any error remains.

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
