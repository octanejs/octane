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

## Types

`.tsrx` files type-check through `tsrx-tsc` and the tsrx TypeScript plugin, so
consumers get real exported types. Typecheck scripts covering a program that
contains `.tsrx` must use `tsrx-tsc --noEmit`, never plain `tsc`, with
`"jsx": "react-jsx"` and `"jsxImportSource": "octane"` in the tsconfig.

Type props and renderable holes properly: `OctaneNode` from `octane` for
renderables (never `React.ReactNode`), native DOM event types, and
`{ current: T | null }` refs. An untyped `props` parameter is a `noImplicitAny`
error, not a style choice.
