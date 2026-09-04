# TSRX basics

Octane compiles standard `.tsx`/`.jsx` out of the box, so a component pasted from
the React docs works, hooks and all. `.tsrx` is the dialect that unlocks the rest
of the compiler: template control flow, keyed collections, and a shorthand that
lets setup sit next to the output. You can mix both in one app and import freely
across the boundary.

This page covers the syntax and the hook behavior that differs from React.
[docs/differences-from-react.md](./differences-from-react.md) is the full
divergence contract, and
[octanejs.dev/docs/tsrx-vs-tsx](https://octanejs.dev/docs/tsrx-vs-tsx) explains
when to reach for each dialect.

## Components

A component is any function you use at a `<Foo/>` site. There is no separate
"component" declaration. A function renders whatever it returns: a JSX root, a
primitive (coerced to text), `null`, or an array.

`@{ … }` is shorthand for returning JSX. `function f() @{ … }` desugars to
`function f() { … return <jsx> }`, so hooks and locals can sit next to the
output. The `@{ … }` scope ends with exactly one output node, a JSX element or a
fragment. Both forms compile identically, and any function can use either.

```jsx
import { useState } from 'octane';

export function Counter() @{
	const [count, setCount] = useState(0);

	<button onClick={() => setCount(count + 1)}>
		{'Count: ' + count}
	</button>
}
```

The same component with an explicit `return` is identical, and a function is free
to return a non-JSX value, which is coerced like any renderable:

```jsx
export function Counter() {
	const [count, setCount] = useState(0);
	return <button onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>;
}

function Label(props) {
	if (props.hidden) return null; // renders nothing
	return props.text; // a string renders as text
}
```

### Nested child scopes

Inside JSX, a nested `@{ … }` block owns a child render scope at that exact
sibling position. Its setup runs when the child renders, may use hooks and
capture parent locals, and keeps its hook state across parent updates. The final
JSX node is optional: a code-only block runs its setup and renders no element.

```jsx
export function AccountRow(props: {
	name: string;
	observe: (name: string) => void;
}) @{
	<li>
		<span>{props.name as string}</span>
		@{
			const [expanded, setExpanded] = useState(false);
			<button onClick={() => setExpanded(!expanded)}>
				{expanded ? 'Hide details' : 'Show details'}
			</button>
		}
		@{
			props.observe(props.name);
		}
	</li>
}
```

An empty child block disappears. A child block containing only a JSX node is
transparent grouping and does not create an extra render scope.

A child block's output fragment is also a style scope: a `<style>` among its
children styles the siblings beside it under its own hash, while the parent's
rules keep reaching the block's elements. See [Styles](#styles).

Dynamic text needs a cast, `{expr as string}`, unless the expression is provably
a string. A bare `{expr}` is a renderable hole, not text.

## State and effects

```jsx
import { useState, useEffect } from 'octane';

export function Timer() @{
	const [seconds, setSeconds] = useState(0);

	useEffect(() => {
		const id = setInterval(() => setSeconds((s) => s + 1), 1000);
		return () => clearInterval(id);
	});

	<p>{'Elapsed: ' + seconds}</p>
}
```

### Dependency arrays are optional

Omit the array from `useEffect`, `useLayoutEffect`, `useInsertionEffect`,
`useMemo`, `useCallback`, or `useImperativeHandle` and the compiler derives it
from the callback's reactive captures. It understands member reads and stable
hook results such as state setters, reducer dispatchers, refs, and state getters.
It also omits `useEffectEvent` results, because Effect Events are non-reactive
captures even though React-compatible wrappers have a fresh identity every
render.

This works for built-in hook calls inside compiler-processed custom hooks,
including custom hooks written in plain `.ts` or `.js`:

```ts
import { useEffect, useMemo } from 'octane';

export function useLoggedValue(value: string, log: (value: string) => void) {
	const formatted = useMemo(() => value.toUpperCase());

	useEffect(() => {
		log(formatted);
	});

	return formatted;
}
```

The memo's inferred dependency is `value`; the effect's are `formatted` and
`log`. Changes propagate through the custom hook without the caller passing an
array.

Explicit arrays keep their React meaning and are never rewritten. Pass `null` for
the uncommon every-render form:

```jsx
useEffect(() => sync(room.id)); // inferred from the closure
useEffect(() => initialize(), []); // explicitly mount/reconnect only
useEffect(() => sync(room.id), [room.id]); // explicit dependencies
useEffect(() => measure(), null); // explicitly after every commit
```

Inferring a missing dependency argument at a **call to a custom wrapper** is a
separate, narrower case. In a fully compiled `.tsrx`/`.tsx` module, a locally
declared wrapper qualifies when it transparently forwards a callback and its
final dependency parameter:

```jsx
function useTrackedEffect(callback, dependencies) {
	useEffect(callback, dependencies);
}

useTrackedEffect(() => sync(room.id)); // inferred from the closure
```

That proof is deliberately local and conservative. The pass for plain `.ts`/`.js`
modules still infers direct built-in hook calls, but it does not infer dependency
arguments at calls to custom wrappers. Imported or method-style wrappers, and
wrappers that transform or inspect their callback or dependency parameter, need
an explicit argument.

In production builds, eligible `useMemo` and `useCallback` declarations compile
to inline caches: a dependency hit allocates nothing, with no factory closure and
no deps array. The semantics are identical, `Object.is` compares included.

### The third tuple member

`useState` and `useReducer` expose an optional third member: a stable getter for
the hook's latest state. It earns its place in async callbacks and other
long-lived closures, where capturing the render's state value would go stale:

```jsx
export function SaveButton() @{
	const [draft, setDraft, getDraft] = useState('');

	const saveLater = async () => {
		await waitForConnection();
		await save(getDraft()); // the latest draft, not the render that started this callback
	};

	<button onClick={saveLater}>{'Save ' + draft}</button>
}
```

The compiler emits a getter-enabled hook only when the third member can be
observed. Ordinary `[state, setState]` and `[state, dispatch]` destructures keep
the two-item runtime path and allocate no getter; escaped or ambiguous tuples
conservatively get the full three-item shape. The getter reads the latest
scheduled hook value, which during a pending render may be newer than the
committed DOM.

## State that follows another value

Use `useLinkedState` when a value can be edited locally but should reset or
adjust when another value changes. A profile editor, for example, should keep
unsaved edits while showing the same user, then start fresh when a different user
is selected:

```jsx
import { useLinkedState } from 'octane';

export function ProfileEditor({ user }) @{
	const [name, setName] = useLinkedState(user.id, () => user.name);

	<input value={name} onInput={(event) => setName(event.currentTarget.value)} />
}
```

`user.id` is the source. When it changes, Octane calculates the new name before
the component reads it: no effect, no state update during render, and no extra
render to correct stale state.

The calculation also receives the previous source and local value. Use them when
a changing input should preserve a still-valid choice instead of starting over:

```jsx
const [selection, setSelection] = useLinkedState(
	items,
	(nextItems, previous) =>
		nextItems.find((item) => item.id === previous?.value?.id) ??
		nextItems[0] ??
		null,
);
```

The first calculation receives `undefined` for `previous`; later source changes
receive `{ source, value }`. Sources and values compare with `Object.is` by
default; pass `{ sourceEqual, valueEqual }` as a third argument when you need
something else. Like `useState`, `useLinkedState` supports an optional third
tuple item, `getValue`.

## Conditional hooks

Unlike React, a hook can sit behind a guard or after an early `return`:

```jsx
import { useState, useEffect } from 'octane';

export function Panel(props) @{
	const [n, setN] = useState(0);

	// An early return before a hook is fine in Octane. Each hook call site has
	// a stable compiler-assigned slot, so render order cannot desync the hooks.
	if (props.hidden) return;

	useEffect(() => {
		console.log('n changed:', n);
	});

	<button onClick={() => setN(n + 1)}>{'count: ' + n}</button>
}
```

The one rule that remains is enforced for you: a hook in a plain JS loop is a
compile error, because every iteration would share one call-site slot. Loop with
the keyed `@for` directive, where each item gets its own hook state, or extract a
child component.

## Control flow

Rendered control flow uses directive-prefixed blocks: `@if`, `@for`, `@switch`,
and `@try`. Plain JavaScript control flow stays in setup code.

Directive arms keep setup and output separate. A bare expression statement such
as `console.log(value);` or `value;` is setup and does not render; to render a
computed value, make the output explicit with a fragment: `<>{value}</>`.

```jsx
export function Feed(props) @{
	<ul>
		@for (const item of props.items; key item.id) {
			<li>{item.title as string}</li>
		} @empty {
			<li>Nothing to show</li>
		}
	</ul>
}
```

```jsx
export function Greeting(props) @{
	@if (props.name) {
		<p>{'Hello, ' + props.name}</p>
	} @else {
		<p>Hello, stranger</p>
	}
}
```

Errors have two forms: the `<ErrorBoundary>` component, or `@try` / `@pending` /
`@catch` in TSRX.

## Text input events

Events are native and delegated, so there is no synthetic `onChange`. Use
`onInput` when text state should update with each edit; native `change` keeps its
browser meaning and fires when the browser commits an edit, usually on blur.

```tsx
<input value={query} onInput={(event) => setQuery(event.currentTarget.value)} />
```

Octane reports `OCTANE_NATIVE_TEXT_ONCHANGE` when a text-entry `<input>` or
`<textarea>` appears to use React's per-edit `onChange` convention. Statically
known JSX is reported by the compiler; unresolved spreads and dynamic input types
are checked in development after their final props are applied. The warning never
rewrites the event: `onChange` remains the native commit event.

Commit-on-blur is a valid design. Mark that intent so tools and development
diagnostics stop recommending a per-edit handler:

```tsx
<input
	defaultValue={savedDraft}
	onChange={(event) => save(event.currentTarget.value)}
	suppressNativeChangeWarning
/>
```

The suppression is a JS-only host hint: it is not serialized, it changes no event
behavior, and it does not belong on component callbacks, selects, checkboxes, or
radios, which are already outside the text-entry warning.

Controlled `value`/`checked` follow React's semantics exactly, minus the synthetic
layer. `defaultValue`/`defaultChecked` are the uncontrolled escape hatch.

## Class composition

`class` (and its alias `className`) accepts more than a string. Octane composes
the value the way the `clsx` and `classnames` libraries do, from strings, numbers,
arrays, objects, and any nesting of those, so you can build a class list inline
without a helper. Falsy parts (`false`, `0`, `null`, `undefined`, `''`) drop out,
and object keys are kept when their value is truthy.

```jsx
export function Button(props) @{
	<button
		class={[
			'btn',
			props.size,                       // 'btn lg'
			{ active: props.active, disabled: props.disabled },
			props.extra,                      // string | array | object | falsy
		]}
	>
		{props.label as string}
	</button>
}
```

Composition is native to the runtime (no dependency) and works everywhere a class
does: dynamic bindings, `{...spread}` props, SVG elements, elements inside a
scoped `<style>` scope (every enclosing scope hash, outer to inner, and then every
applied theme class follow your classes), and server rendering. SSR output and
the client render compose byte-identically, so hydration never mismatches.

> React coerces `className={['a', 'b']}` to the string `"a,b"`. This is a
> deliberate Octane convenience, and a plain string still takes the fast path.

## Inline scripts

An authored `<script>` body is static, raw script text. Braces are literal
source, so blocks and object literals work normally; Octane does not treat
`{...}` inside the body as a TSRX interpolation:

```jsx
export function Bootstrap() @{
	<script>
		window.appConfig = { locale: 'en-GB' };
	</script>
}
```

For a dynamic whole-script value, use the standard raw-content prop and serialize
structured values explicitly:

```jsx
export function Rules(props) @{
	<script
		type="speculationrules"
		dangerouslySetInnerHTML={{ __html: JSON.stringify(props.rules) }}
	/>
}
```

`<script>{JSON.stringify(props.rules) as string}</script>` is static script
source, not an interpolation; the cast does not change the raw-text grammar.
`dangerouslySetInnerHTML` supplies the complete body and cannot be combined with
child content. Client mounts and updates write it through `textContent`. Server
rendering neutralizes case-insensitive opening and closing `script` tokens
without HTML-escaping ordinary JavaScript or JSON characters, which stops the
value from creating sibling markup but does not validate or sanitize executable
JavaScript. Only inject source you trust.

## Styles

A `<style>` block written among the children of an element or a fragment is
scoped CSS. The block is scoped to its siblings, not to the `@{ … }` body around
it: it styles the items beside it and everything below them and never the
element that contains it. The compiler gives that children
list a hash, adds it to every selector in the block, and adds the same class —
the block's **hash class** — to those siblings and their descendants, so the
selectors match only there and rules never leak into a parent, an outer sibling,
or a child component. `:global(…)` reaches outside the scope (below).

```jsx
export function Panel() @{
	<>
		<style>
			div { color: black; }
			p { margin: 0; }
		</style>
		<div>Black</div>
		<p>No margin</p>
	</>
}
```

To style an element, put the block beside it — both siblings in a fragment, as
above. A block written inside the element styles the element's other children:

```jsx
export function Card() @{
	<article class="card">
		<style>
			h2 { margin: 0; } /* the h2, not .card */
		</style>
		<h2>Title</h2>
	</article>
}
```

A `@{ … }` body and every `@if`/`@for`/`@switch`/`@try` branch hold setup
statements and exactly one output node, and a block counts as an output node: a
block beside the output node is the multiple-outputs parser error, and a lone
block as the output styles nothing (`STYLE_STANDALONE_NEEDS_FRAGMENT`). Wrap the
block and the output in a fragment, inside branches too.

### Scopes

Every children list that holds a block is a sibling scope with its own hash: an
element's children, a fragment's children, the fragment a nested `@{ … }` or a
control-flow branch renders, an assigned or returned element's children. An
element gets the hash class of every enclosing scope, outer to inner, so an outer
block's rules still reach the elements of a nested scope while the nested block's
rules stay inside it:

```jsx
export function Panel() @{
	<>
		<style>
			div { color: black; }
		</style>
		<div>Black</div>
		@{
			<>
				<style>
					div { font-weight: bold; }
				</style>
				<div>Black and bold: both scopes reach here</div>
			</>
		}
	</>
}
```

Several blocks among the same children share the list's hash class and compile
to one `injectStyle` call, so a block can sit wherever it reads best next to the
elements it styles.

A block inside an `@if` or `@for` branch styles only the elements that branch
renders. Its CSS is still always part of the module's stylesheet, whether or not
the branch ever renders, because CSS is static; only the hash class follows the
branch. That is why there is no style flash when a branch first renders. Rules
you want everywhere belong outside the branch.

### Raw CSS is TSRX syntax

Raw CSS text in `<style>` is TSRX template syntax. A standalone block is allowed
only lexically inside a `@{ … }` body or an `@if`/`@for`/`@switch`/`@try` body —
at any depth of elements, fragments, holes, callbacks, or templates assigned in
that body. In a plain function that returns JSX, or in an element assigned at
module scope, it is `STYLE_STANDALONE_OUTSIDE_TEMPLATE`. Plain TSX keeps the TSX
rule: `<style>` is an ordinary element whose content is an expression child,
`<style>{css}</style>`, and the compiler passes it through untouched — no scope,
no hash, no injection.

### Assigned blocks and class maps

Assign a block to a variable — at module scope, in a component body, inside a
nested block, anywhere a declaration is legal — and it becomes a **class map**
instead of scoping a template. `$class` is the block's hash, and every class
selector in the block gets an entry pairing the hash with the class name, ready
for `class=`:

```jsx
export const theme = <style>
	div { color: green; }
	.dark { color: purple; }
</style>;
// theme → { $class: 'tsrx-063ca812', dark: 'tsrx-063ca812 dark' }

export function Label() @{
	<span class={theme.dark}>Purple</span>
}
```

The sheet is injected where the declaration is. A block that is exported,
applied (below), or whose `$class` is read anywhere in the module is a **theme**
and keeps every selector; a local block that is none of these keeps only the
class selectors its map exposes, and the rest are removed as unused.
`.$class` is reserved as a selector name in an assigned block
(`STYLE_RESERVED_CLASS_KEY`), and a bare standalone block at module scope is an
error (`STYLE_STANDALONE_AT_MODULE_SCOPE`): assign it.

### `apply`

`<style apply={theme} />` adds `theme.$class` to the items beside it and
everything below them (never to the element that contains it), so the theme's
rules match there. A self-closed block only applies the theme; a block with CSS
in it applies the theme and scopes its own rules too, and the local rules win
over the theme's because they come later in the CSS:

```jsx
import { theme } from './theme.tsrx';

export function Panel() @{
	<>
		<style apply={theme}>
			div { color: black; } /* beats the theme's green */
		</style>
		<div>Black, from the local rule</div>
		<span class={theme.dark}>Purple, from the theme</span>
	</>
}
```

`apply={[a, b]}` composes several themes; their classes land in array order. An
assigned block can apply themes as well — `export const both = <style
apply={[a, b]} />` bundles them and `const mixed = <style apply={base}>…</style>`
extends one — and its `$class` is the applied themes' classes (transitively)
followed by its own hash.

A theme from the same module with a statically known class becomes a string
literal, so the element's static HTML is still built once, up front. An imported
theme is read at runtime through `theme.$class`, so the elements that carry it
are built when they render, with a dynamic class. A target must be declared before the block that applies it
(`STYLE_APPLY_BEFORE_DECLARATION`). `apply` needs an expression value
(`STYLE_APPLY_VALUE`) that resolves to a style block or an import
(`STYLE_APPLY_TARGET`), and appears once per block (`STYLE_APPLY_DUPLICATE`; use
an array). Any other attribute on a scoped block is `STYLE_UNKNOWN_ATTRIBUTE`.

### Opting elements in with `$class`

`apply` puts a theme on every element of its scope. To pick the elements
yourself, put `theme.$class` in their `class` instead and leave `apply` out:
only the elements that carry it match the theme's element and descendant
selectors, and the rest of the scope is untouched. The class is a plain string,
so a child component can take it through a prop and put it on its own elements;
the passed class lands before the child's own hash class:

```jsx
function Card({ parentClass }: { parentClass: string }) @{
	<>
		<style>
			.local { padding: 0; }
		</style>
		<article class={parentClass}>
			<h2 class={parentClass}>Blue, from the parent's theme</h2>
		</article>
	</>
}

export function App() @{
	const theme = <style>
		div, h2 { color: blue; }
		.card { color: red; }
	</style>;
	<>
		<Card parentClass={theme.$class} />
		<div class={theme.$class}>Blue: opted in</div>
		<div class={theme.card}>Red: a class entry carries the hash too</div>
		<p>Untouched</p>
	</>
}
```

Reading `theme.$class` is what makes `theme` a theme here: the `div, h2` rule
survives although nothing exports or applies the block. A block whose only reads
are class entries (`theme.card`) stays a class map and drops its element
selectors. `class={[a.$class, b.$class]}` opts one element into several themes,
the way `apply={[a, b]}` does for a whole scope, and the two forms compose: a
scope can apply a base theme while single elements opt into an accent.

### `:global(…)`

Wrap part of a selector in `:global(…)` and that part gets no hash class;
everything outside the parentheses is still scoped. It may sit at the start or
the end of a selector, not in the middle (`.card :global(.x) .title` is
`CSS_GLOBAL_PLACEMENT`):

```jsx
export function Post(props) @{
	<>
		<style>
			:global(.toast) { position: fixed; }        /* → .toast: page-wide, matches anywhere */
			.post :global(pre) { overflow-x: auto; }     /* → .post.<hash> pre: only below .post */
			:global(.theme-dark) .post { color: white; } /* → .theme-dark .post.<hash>: under a page class */
			.post:global(.is-open) { display: block; }   /* → .post.<hash>.is-open: a class a library toggles */
		</style>
		<article class="post">
			<Markdown source={props.body} />
		</article>
	</>
}
```

`:global { … }` is the block form: the wrapper is dropped (it stays as a
comment in the output) and every rule inside it is unscoped. Nested under a
scoped rule it reaches only below that rule, the same as the prefixed selector
form with the scoped prefix written once:

```jsx
<style>
	:global { .toast { position: fixed; } body { margin: 0; } } /* → .toast { … } body { … } */
	.post { :global { pre { overflow-x: auto; } .footnote { font-size: 0.875rem; } } } /* → .post.<hash> { pre { … } .footnote { … } } */
	.post { :global(pre) { overflow-x: auto; } } /* → the same, selector form */
	.post { pre { margin: 0; } } /* → .post.<hash> { pre.<hash> { … } }: both parts scoped */
</style>
```

Which form to use:

| I want to …                                                     | Use …                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Style my own elements                                           | A block beside them. Nothing global.                                   |
| Let a child component pick up my styles                         | Pass `theme.$class` or a class-map entry (`theme.card`) as a prop.     |
| Style a child I cannot change (a library component, rendered HTML) | `.wrapper :global(.their-class)`, or `.wrapper { :global { … } }` for several classes, with a scoped selector in front. |
| React to page-level state (a theme class on `<html>`)           | `:global(.theme-dark) .card` or `:global([data-theme='dark']) .card`.  |
| Write page-wide rules (`body`, resets, fonts)                   | A `.css` file the page links, not a bare `:global`.                    |

For a child you own, pass the class rather than reaching in: the dependency is
a visible prop, the child chooses which elements take it, renaming a class in
the child cannot silently break the parent, and the hash keeps the rule on the
elements that carry it. With `:global` the child has no say and cannot see who
styles it; when you must, nest one `:global { … }` under the scoped wrapper so
the prefix is written once. A bare `:global(.toast)` is a global stylesheet hidden inside a
component: it matches anywhere on the page with nothing pointing back to the
file. Write one only for page-level elements, and prefer a linked `.css` file.

Specificity: a scoped rule adds its hash class to the first compound only and
`:where(.<hash>)` to the rest (`.card .title` → `.card.<hash>
.title:where(.<hash>)`), so a scoped `.note.<hash>` (0,2,0) beats a bare
`:global(.note)` (0,1,0) from anywhere on the page, a `theme.$class` or
class-map rule beats a bare global for the same reason, and a prefixed
`.card.<hash> .note` (0,3,0) beats the child's own `.note.<hash>`: it overrides
the child, so keep it narrow. At equal specificity the later sheet wins.

### Class order and `style()`

An element's class list is `authored classes, enclosing hash classes (outer to
inner), applied theme classes`, composed as described in
[Class composition](#class-composition). `{style(expr)}` in a class position
resolves to that same chain plus the value: `class={style('row')}` yields
`"<hashes> row"`, and a dynamic value is concatenated at runtime so the chain is
always present.

### Ordering guarantees

Sheets come out in source order, outer scope first. A scope's sheet sits where
its first block is, after the assigned blocks declared before it in the enclosing
statement list and before the scopes and assigned blocks nested inside it;
sibling scopes follow source order. On the client every sheet is a module-level
`injectStyle(hash, css)` statement, so module evaluation — import order — orders
sheets across modules, and the runtime injects each hash once. On the server
`injectStyle` runs inside the component body, per request, so a render collects
CSS only for the components it actually rendered; the buffered renderers return
it as `css` and the streaming renderers send it with the shell. An assigned
block's sheet joins the request when the block is read: on the server the
class-map object injects its CSS (after the CSS of the themes it applies) on
property access, and a component that applies an imported theme touches it
before its own sheets, so a theme from another module still precedes the scope
that applies it. Hydration matches the server's `<style data-octane="hash">`
tags by hash and never re-injects them.

### `<style href precedence>`

`<style href="…" precedence="…">` is a React Float style resource, not a scoped
block: its CSS ships unscoped, one copy per href, is moved into `document.head`
under its precedence group, and stays outside the scope model. `apply` on a
resource, or on a `<style>` inside `<head>`, is an error
(`STYLE_APPLY_UNSUPPORTED_HOST`). Resource semantics are in
[differences-from-react.md](./differences-from-react.md#document-metadata-and-float-resources).

## Strong mode

Strong mode is an optional immutable render-snapshot contract with compiler
checks for state, refs, Effect Events, and detectable impure render calls. It is
also an author assertion that rendering is pure, which production memoization
is allowed to trust without proving every call body.
Start with one module by putting `"use strong"` before its imports:

```tsx
"use strong";

import { useLinkedState } from 'octane';

export function ProfileEditor({ user }) {
	const [name, setName] = useLinkedState(user.id, () => user.name);

	return <input value={name} onInput={(event) => setName(event.currentTarget.value)} />;
}
```

When the project is ready, turn it on for all application-owned modules:

```ts
// octane.config.ts
export default {
	compiler: {
		strong: true,
	},
};
```

The Vite and Rsbuild app integrations read this from `octane.config.ts`. Vite,
Rspack, and Rsbuild also accept `strong: true` directly in their Octane plugin
options; use the plugin option for a standalone Rspack setup. An explicit plugin
setting wins over `octane.config.ts`. Dependencies keep their existing behavior
unless one of their own modules opts in with `"use strong"`.

These patterns become compile errors:

- Calling a `useState`, `useReducer`, or `useLinkedState` updater during render.
- Calling one of those updaters synchronously while an effect is being set up.
- Assigning to a `useRef` object's `current` during render.
- Calling a statically known `useEffectEvent` result during render
  (`OCTANE_STRONG_RENDER_EFFECT_EVENT_CALL`).
- Including a statically known Effect Event in an explicit hook dependency list
  (`OCTANE_STRONG_EFFECT_EVENT_DEPENDENCY`).
- Mutating a provable state snapshot during render, including supported aliases
  and array mutations on state initialized with an array literal
  (`OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION`).
- Mutating a binding declared outside a retained keyed `@for` row from that row
  (`OCTANE_STRONG_RETAINED_ROW_MUTATION`). Fresh scratch data built in ordinary
  setup or owned entirely by one row remains valid.
- Calling unshadowed `Date.now()`, `Math.random()`, `performance.now()`, `Date()`,
  or `new Date()` without arguments during render
  (`OCTANE_STRONG_RENDER_IMPURE_CALL`).

The checks follow provable synchronous calls through local helpers,
`useCallback` and `useEffectEvent` results, and functions returned by analyzable
`useMemo` factories. These hooks remain supported; creating a callback is not
itself an error. Effect Events are non-reactive and should be omitted from hook
dependencies. Other explicit dependency arrays keep their existing meaning and
are never rewritten.

The analysis is deliberately bounded. Factories with unknown return values or
complex control flow remain opaque. Dependency checks follow literal arrays,
including statically selected or spread literals; they do not assume an aliased
or externally produced array is unchanged.

Update state in event handlers instead. When state should reset or adjust after
an input changes, use `useLinkedState`. Effects that connect to external systems,
genuinely deferred callbacks, effect cleanup, and refs used for DOM elements,
timers, or event callbacks remain valid. Obtain changing timestamps or random
values in events or effects and put them in state. A lazy state initializer such
as `useState(() => new Date())` may also capture the initial value.

For every user-authored operation evaluated to produce render output, Strong
asserts all of the following:

- The same witnessed props, state, context, receiver, arguments, and captured
  values produce the same result.
- Calls, computed methods, call-produced callees, constructors, tagged
  templates, and synchronously invoked callbacks have no application-visible
  render side effects.
- Results do not depend on changing `ref.current` contents, state getters,
  mutable module or global state, external live stores, clocks, randomness, or
  hook state hidden behind a stable value.
- Code does not rely on how often a render expression is evaluated. Development,
  production, HMR, profiling, server rendering, hydration, retries, and aborted
  work can evaluate it different numbers of times.

Production client builds may condition every eligible call shape on those
witnessed inputs. A `use*`-shaped ordinary function is treated like any other
projection; Strong does not require React's hook naming convention to establish
purity. Actual hooks still belong in component or custom-hook setup and retain
their compiler-owned behavior. Built-in hook provenance, including optional
calls, and lexically resolved same-module custom-hook declarations keep context,
state, suspension, and effect lifecycle handling even through aliases or cyclic
call graphs. Projection guards witness both a method/callable and its receiver,
plus explicit arguments; derived receivers are witnessed through the operation
and inputs that produce them rather than their transient result identity. Guard
equality at component and ordinary-list projection boundaries is `Object.is`,
including its `NaN` and signed-zero behavior; a certified keyed-selection
operand retains authored strict equality.

The diagnostics above are bounded; they do not prove arbitrary imported code or
method bodies pure, and an unknown call does not make memoization fall back. A
Strong caller is asserting that its use of an imported API is snapshot-safe. Keep
live-accessor consumers in compatibility mode, or pass actual snapshots to a
Strong component. See
[Automatic memoization and calls in templates](./differences-from-react.md#automatic-memoization-and-calls-in-templates)
for the exact boundary and why changing event captures still invalidates keyed
rows.

`"use strong"` only affects its own module. Put it at the top of the file, before
imports or other code; comments and other directives may come first. In files
that also use an Octane JSX ownership pragma, keep the pragma first:

```tsx
/** @jsxImportSource octane */
"use strong";

import { useState } from 'octane';
```
