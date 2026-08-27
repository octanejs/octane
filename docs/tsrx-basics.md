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
does: dynamic bindings, `{...spread}` props, SVG elements, scoped-`<style>`
components (the scope hash is appended after your classes), and server rendering.
SSR output and the client render compose byte-identically, so hydration never
mismatches.

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
