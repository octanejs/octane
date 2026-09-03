# Authoring `.tsrx`

## Components

A component is any function used at a `<F/>` site, not a special declaration.
It renders whatever it returns: a JSX root, a primitive coerced to text, `null`,
or an array. A function may early-return a non-JSX value.

`@{ … }` is shorthand for returning JSX: `function f() @{ … }` desugars to
`function f() { … return <jsx> }`, so setup (hooks, locals) sits next to the
output. The `@{ … }` scope ends with **exactly one** output node: a JSX element
or a fragment `<>…</>`.

Both forms compile identically and any function may use either:

```tsx
export function X() @{ <div /> }
function getX() { return <div />; }
```

Inside JSX, a nested `@{ … }` block owns a child render scope at its authored
sibling position. Its setup may use hooks and capture parent locals; the scope
and hook state survive parent updates. Its final JSX output is optional, so a
code-only block is valid and renders no element. An empty child block disappears,
while a render-only child block is transparent grouping.

```tsx
<section>
	@{
		const [count, setCount] = useState(0);
		<button onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>
	}
	@{
		observe();
	}
</section>
```

## Text holes

Dynamic text uses a cast: `{expr as string}`.

The cast is optional when the expression is provably a string: a string or
template literal, a `+`-concatenation involving a string (`{'Count: ' + count}`),
an unshadowed built-in `String(value)` call, or a local `const`/param the compiler
tracks back to a string. Use `String(value)` when conversion is intended;
asserting a number `as string` can produce a TypeScript error. Custom Node build
pipelines can also supply project-aware string proofs through
`octane/compiler/typescript`; see `docs/compiler-text-inference.md`. Without
such a proof, retain the explicit string assertion for text intent.

A bare `{expr}` that is not provably a string is a renderable hole: a component,
an element descriptor, or a coerced primitive.

## Events

Events are native, delegated DOM events (`onClick`, `onInput`, `onSubmit`), not a
synthetic layer, so behavior matches the platform.

There is no synthetic `onChange`. `onInput` is the per-keystroke handler for text
controls; native `change` fires on blur or commit. The compiler reports
`OCTANE_NATIVE_TEXT_ONCHANGE` on statically known text-entry hosts that look like
they use React's per-edit convention, and a development runtime fallback checks
final ambiguous uncontrolled props.

Deliberate native commit behavior keeps `onChange` alongside the JS-only,
non-serialized `suppressNativeChangeWarning` host hint. Do not suppress or rename
component and library callbacks, selects, or checkbox/radio change handlers.

## Control flow

Template control flow uses directive blocks. Plain JS control flow stays in
setup.

```tsx
@if (c) { } @else { }
@for (const x of xs; key x.id) { } @empty { }
@switch (v) { @case a: { } @default: { } }
@try { } @pending { } @catch (e) { }
```

A slot-keyed hook inside a plain JS `for`/`while` is a compile error: every
iteration would share the one call-site slot and its state/memo/effect entries
would collide. Use the keyed `@for` directive or extract a child component, so
each item renders in its own scope. `use()` and `useContext` are exempt: they
are call-order and context-identity keyed.

## Refs

Refs are passed as props, React-19 style: `ref={cb}`, `ref={obj}`, or multi-ref
`ref={[a, b]}`. There is no `forwardRef`.

## Styles

A `<style>` block is static CSS scoped to the nearest lexical template scope: the
component render, a nested `@{ … }` body, each control-flow branch body
(`@if`/`@else if`/`@else`, `@for`/`@empty`, `@case`/`@default`,
`@try`/`@pending`/`@catch`), or an element/fragment used as a value (assigned or
returned). The compiler rewrites every selector with a scope hash and stamps that
hash on every element the scope reaches; stamping stops at function boundaries,
so `items.map((x) => <li />)` output is outside the scope. `:global(…)` opts a
selector out. A block accepts only the `ref` and `apply` attributes, and its
CSS is static: use custom properties (`style={{ '--tone': tone }}` with
`var(--tone)`) for runtime values.

- Several blocks in one scope share one hash and inject as one sheet. A nested
  scope gets its own hash; its elements carry every enclosing hash outer to
  inner, then the applied theme classes, all after the authored classes.
- A block may be a child of the output element or fragment, or sit beside the
  single output node in a `@{ … }` body or a directive body.
- CSS emits in lexical order: outer scopes before the scopes nested in them, a
  scope's blocks contiguous, sibling scopes in source order, assigned blocks at
  their declaration, an applied theme before its applier. At equal specificity
  the rule emitted last wins.
- Control-flow caveat: a branch body's CSS is always emitted whichever branch
  renders; only the class stamping follows the branch.
- Selectors that match nothing in reach are dropped as `/* (unused) … */`.

Assigning a block, `const theme = <style>…</style>`, produces a class map instead
of a scoped block: `$class` (the applied themes' classes, then its own hash) plus
one key per class selector whose value is `"<hash> <name>"`. Pass those strings
as props (`<Badge class={theme.dark} />`). The declaration may live anywhere a
declaration can, including module scope, where a standalone block is an error.
Exported or applied blocks, and blocks whose `$class` is read anywhere in the
module, are themes and keep every selector; a local block that is none of these
keeps only its standalone class selectors.

`<style apply={theme} />` stamps `theme.$class` on every element of the scope it
sits in, so the theme's element and descendant rules reach them; the self-closed
form adds no hash of its own, while `<style apply={theme}>…</style>` also
declares the scope's block. `apply={[a, b]}` composes in order, a theme may
apply another (`const accent = <style apply={base}>…</style>`), and
`export const bundle = <style apply={[a, b]} />` composes without CSS of its own.
A theme must be declared before the block that applies it. Same-module targets
inline as string literals; imported themes are runtime `theme.$class` reads.

`apply` is the whole-scope form. To opt single elements in, give them
`class={theme.$class}` and leave `apply` out: only the elements carrying the
class match the theme's element and descendant rules, their siblings stay
untouched, and a child component can take the class through a prop
(`<Card parentClass={theme.$class} />`, then `<article class={parentClass}>`),
where it lands before the child's own scope hash. `class={[a.$class, b.$class]}`
is the per-element counterpart of `apply={[a, b]}`; the two forms compose.

```tsx
export function Panel() @{
	<>
		<style apply={theme}>
			div { color: black; } /* scope A; beats the theme's rule */
		</style>
		<span class={theme.dark}>Purple</span>
		<div>Black</div>
		@{
			<>
				<style>
					div { font-weight: bold; } /* scope B, nested in A */
				</style>
				<div>Black and bold</div>
			</>
		}
	</>
}
```

`<style href precedence>` is a Float resource (plain CSS shipped by href
identity, never scoped) and stays outside this model.

Style diagnostics come from `@tsrx/core` and surface through the compile
result's `diagnostics` like `OCTANE_NATIVE_TEXT_ONCHANGE` does:
`STYLE_APPLY_VALUE` (`apply` without an expression value), `STYLE_APPLY_TARGET`
(an entry that is not an identifier, member, or array of those, or is not a
style block), `STYLE_APPLY_BEFORE_DECLARATION`, `STYLE_APPLY_DUPLICATE` (two
`apply` attributes on one block), `STYLE_APPLY_UNSUPPORTED_HOST` (`apply` on a
`<head>` or `href` style), `STYLE_RESERVED_CLASS_KEY` (an assigned block
declares `.$class`), `STYLE_STANDALONE_AT_MODULE_SCOPE`,
`STYLE_UNKNOWN_ATTRIBUTE`, and `CSS_GLOBAL_PLACEMENT` (`:global` where the
scoping rules do not allow it).

## Types

`.tsrx` files type-check through `tsrx-tsc` and the tsrx TypeScript plugin, so
consumers get real exported types. Typecheck scripts covering a program that
contains `.tsrx` must use `tsrx-tsc --noEmit`, never plain `tsc`, with
`"jsx": "react-jsx"` and `"jsxImportSource": "octane"` in the tsconfig.

Type props and renderable holes properly: `OctaneNode` from `octane` for
renderables (never `React.ReactNode`), native DOM event types, and
`{ current: T | null }` refs. An untyped `props` parameter is a `noImplicitAny`
error, not a style choice.
