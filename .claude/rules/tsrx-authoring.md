---
paths:
  - '**/*.tsrx'
---
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

A `<style>` block is static CSS written among the children of an element or a
fragment. The block is scoped to its siblings, not to the `@{ … }` body around
it: it styles the items beside it and everything below them and never the
element that contains it. The compiler adds that children list's
hash to every selector and adds the same hash class to those siblings and their
descendants, so the selectors match only there; the hash class stops at
composite components and function boundaries, so a child component's elements
and `items.map((x) => <li />)` output are outside the scope. `:global(…)` opts a selector out. A block accepts only the `ref` and
`apply` attributes, and its CSS is static: use custom properties
(`style={{ '--tone': tone }}` with `var(--tone)`) for runtime values.

- To style an element, make the block and the element siblings in a fragment:
  `<><style>.card { … }</style><article class="card">…</article></>`. A block
  inside `<article>` styles the article's other children only.
- A `@{ … }` body and every directive body hold setup statements and exactly
  one output node; a block is an output node, so a block beside the output
  node is the multiple-outputs parser error and a lone block as the output is
  `STYLE_STANDALONE_NEEDS_FRAGMENT`. Wrap both in a fragment, in branches too:
  `@if (x) { <><style>…</style><p>…</p></> }`.
- Every children list holding a block is a sibling scope with its own hash
  class; sibling blocks share it and inject as one sheet. An element gets every
  enclosing hash class outer to inner, then the applied theme classes, all
  after the authored classes.
- CSS comes out in source order, outer scope first: outer scopes before the
  scopes nested in them, a scope's blocks together, sibling scopes in source
  order, assigned blocks at their declaration, an applied theme before the
  block that applies it. At equal specificity the rule that comes later wins.
- A block inside an `@if`/`@for` branch styles only what that branch renders,
  but its CSS is always in the module's stylesheet whichever branch renders;
  only the hash class follows the branch. Rules wanted everywhere go outside
  the branch.
- Raw CSS in `<style>` is TSRX template syntax: a standalone block is allowed
  only lexically inside a `@{ … }` body or an `@if`/`@for`/`@switch`/`@try`
  body, at any depth. In a plain `return <…>` function or a module-scope
  element it is `STYLE_STANDALONE_OUTSIDE_TEMPLATE`. Plain TSX keeps the TSX
  rule: `<style>{css}</style>` is an ordinary element, passed through with no
  scope, hash, or injection.

Assigning a block, `const theme = <style>…</style>`, produces a class map instead
of a scoped block: `$class` (the applied themes' classes, then its own hash) plus
one key per class selector whose value is `"<hash> <name>"`. Pass those strings
as props (`<Badge class={theme.dark} />`). The declaration may live anywhere a
declaration can, including module scope, where a standalone block is an error.
Exported or applied blocks, and blocks whose `$class` is read anywhere in the
module, are themes and keep every selector; a local block that is none of these
keeps only its standalone class selectors.

`<style apply={theme} />` adds `theme.$class` to the items beside it and
everything below them, so the theme's element and descendant rules reach them;
the self-closed form adds no hash class of its own, while a
`<style apply={theme}>…</style>` with CSS in it also declares the scope's block. `apply={[a, b]}` composes in order, a theme may
apply another (`const accent = <style apply={base}>…</style>`), and
`export const bundle = <style apply={[a, b]} />` composes without CSS of its own.
A theme must be declared before the block that applies it. A same-module theme
becomes a string literal; an imported theme is read at runtime through
`theme.$class`.

`apply` is the whole-scope form. To opt single elements in, give them
`class={theme.$class}` and leave `apply` out: only the elements carrying the
class match the theme's element and descendant rules, their siblings stay
untouched, and a child component can take the class through a prop
(`<Card parentClass={theme.$class} />`, then `<article class={parentClass}>`),
where it lands before the child's own hash class. `class={[a.$class, b.$class]}`
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
declares `.$class`), `STYLE_STANDALONE_AT_MODULE_SCOPE` (a bare block
statement at module scope), `STYLE_STANDALONE_OUTSIDE_TEMPLATE` (raw CSS in a
block outside every `@{ … }` or directive body),
`STYLE_STANDALONE_NEEDS_FRAGMENT` (a block as the lone output of a body),
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
