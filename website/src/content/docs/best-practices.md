# Best practices

How to write modern Octane applications in TSRX: where state should live, when an effect is the right tool, how Strong mode, Signals, and Data fit together, and what to check before you ship.

This guide is for people and coding agents writing Octane applications. Each rule says what to do, why, when it applies, and what to use instead. Major pitfalls show an **Avoid** example followed by a **Prefer** example. Every example is a TSRX module that the repository compiles in a test, and each Avoid example in a Strong module reports the diagnostic its comment names.

Octane looks like React, and most React instincts transfer. The ones that don't are deliberate: see [Differences from React](https://octanejs.dev/docs/differences-from-react). When this guide and the source disagree, the source wins.

**Contents**

- [How to read this guide](#how-to-read-this-guide)
- [Choose where state lives](#choose-where-state-lives)
- [Write TSRX templates](#write-tsrx-templates)
- [Components, state, and hooks](#components-state-and-hooks)
- [Compose components](#compose-components)
- [Keep effects for external systems](#keep-effects-for-external-systems)
- [Make modules Strong](#make-modules-strong)
- [Own reactive state with Signals](#own-reactive-state-with-signals)
- [Share server data with Octane Data](#share-server-data-with-octane-data)
- [Async UI, SSR, and hydration](#async-ui-ssr-and-hydration)
- [Performance, accessibility, and testing](#performance-accessibility-and-testing)
- [Review checklist](#review-checklist)
- [API coverage](#api-coverage)
- [Sources and attribution](#sources-and-attribution)

## How to read this guide

Rules are short headings under each section. A rule gives its reason and its exceptions, then links to the reference that owns the details. Examples are small and synthetic: imports such as `./api` or `./contracts.data.ts` stand for your application's own modules.

Many rules start from well-known React advice. Each one either **transfers** as written, **needs an Octane rewrite** because Octane has a different contract, or **does not apply**. This table records the result for the practices this guide covers:

| React starting point | Result | Octane guidance |
| --- | --- | --- |
| Derive values instead of syncing them with effects | Transfers | [Derive values during render](#derive-values-during-render); Strong reports the effect version as `OCTANE_STRONG_EFFECT_STATE_UPDATE`. |
| Put interaction logic in event handlers | Transfers | [Handle user actions in the event handler](#handle-user-actions-in-the-event-handler). Handlers are native DOM events. |
| Rules of Hooks: no hooks in conditions or after early returns | Needs a rewrite | Hooks are keyed by compiler-assigned call site, so conditions and early returns are fine. Plain JS loops are not: [Put hooks where they belong](#put-hooks-where-they-belong). |
| Exhaustive dependency arrays | Needs a rewrite | Omit the array and the compiler infers it. Strong reports a hand-written array that differs, as `OCTANE_STRONG_EXPLICIT_DEPENDENCIES`. |
| Manual `useMemo`/`useCallback` and rerender recipes | Needs a rewrite | The compiler caches eligible declarations and memoizes template regions. [Measure before memoizing](#measure-before-memoizing). |
| Avoid waterfalls with `Promise.all` | Needs a rewrite | Independent `use()` calls already start together. [Let independent reads start together](#let-independent-reads-start-together). |
| Fetch in effects, SWR, React `cache` | Needs a rewrite | Use `use()`, a Signals `query$`, or an Octane Data read, chosen by [who owns the data](#choose-where-state-lives). |
| Boolean mode props and render props | Transfers, with Octane tools | [Prefer explicit variants](#prefer-explicit-variants-to-mode-flags) and [pass render bodies](#pass-markup-as-children-or-render-bodies). |
| `items.map` with `key`, avoid index keys | Needs a rewrite | Keyed `@for` with a stable item key. Strong rejects JSX from `.map` and index keys. |
| Synthetic `onChange`, `forwardRef`, `className` strings | Needs a rewrite | Native `onInput` for keystrokes, refs as plain props, and composing `class`. |
| StrictMode double-invoke | Does not apply | Strong mode is a compile-time check, not StrictMode. Octane never double-invokes effects. |
| Server Components, `"use client"`, Next.js helpers | Does not apply | Octane renders on the server with its own SSR, streaming, and `module server` functions. |
| `suppressHydrationWarning` | Does not apply | Fix the mismatch. Strong reports the prop as `OCTANE_STRONG_SUPPRESSION_PROP`. |
| Hoisting static JSX out of components | Does not apply | The compiler builds static templates once already. |

## Choose where state lives

An Octane component is compiled TSRX. During **render** it reads an immutable snapshot of its props, state, context, and signals, and describes the output. **Events** and **effects** run later and may change things. Most bugs in this guide come from mixing the two: changing state while rendering, or reading something during render that no input tracks.

Pick the simplest primitive that owns the data for as long as it lives:

| Data | Owner and lifetime | Use |
| --- | --- | --- |
| UI state for one component, such as an open menu or a draft | The component, while mounted | `useState` or `useReducer` |
| Editable state that resets when another value changes | The component, per source value | `useLinkedState(source, reconcile)` |
| A value computed from props or state | Nobody: recompute it | A plain `const` in setup |
| State shared by distant components in one subtree | The nearest common parent | Lift it, then context if props get deep |
| Fine-grained reactive values, or state that outlives components | A module, a component, or a scope you dispose | Signals: `signal$`, `derived$`, `useSignal$` |
| Async data a component or module loads by key | The component or module that selects the key | Signals `query$`, or `use()` with a stable promise |
| Records the server owns, read and edited from many screens | The signed-in account's store | Octane Data: contracts, `store.read`, `store.write` |
| A browser or third-party store | The external system | `useSyncExternalStore` with a cached snapshot |

Start with component state. Move to Signals or Data when ownership or lifetime demands it, not before.

## Write TSRX templates

TSRX is TypeScript with templates. `function Name() @{ … }` holds setup statements followed by exactly one output node. The [TSRX basics](https://github.com/octanejs/octane/blob/main/docs/tsrx-basics.md) cover the syntax; these are the habits that keep templates correct.

### Mark dynamic text and branch with directives

A bare `{value}` is a renderable hole: it renders a component, element, or primitive. Text that is not provably a string takes a cast, `{value as string}`, or a conversion, `{String(count)}`. Template control flow uses `@if`, `@for`, `@switch`, and `@try`; plain JavaScript control flow belongs in setup.

```tsrx
type Item = { id: string; label: string; done: boolean };

export function TodoList({ items }: { items: Item[] }) @{
	const remaining = items.filter((item) => !item.done).length;
	<section>
		<h2>{'Remaining: ' + remaining}</h2>
		<ul>
			@for (const item of items; key item.id) {
				<li class={{ done: item.done }}>{item.label as string}</li>
			} @empty {
				<li>Nothing to do.</li>
			}
		</ul>
	</section>
}
```

### Use a stable key in @for

The key decides which row keeps its DOM, state, and effects when the list changes. Use an ID from the data. The loop position is not an identity: inserting or removing a row would hand one item's state to another. Strong mode rejects index keys and JSX returned from `.map`.

Avoid:

```tsrx
// Avoid: OCTANE_STRONG_INDEX_KEY
'use strong';

export function Names({ names }: { names: string[] }) @{
	<ul>
		@for (const name of names; index position; key position) {
			<li>{name as string}</li>
		}
	</ul>
}
```

Prefer:

```tsrx
'use strong';

type Person = { id: string; name: string };

export function Names({ people }: { people: Person[] }) @{
	<ul>
		@for (const person of people; key person.id) {
			<li>{person.name as string}</li>
		}
	</ul>
}
```

The position is still available with `index position` when you need to display it. To remount a subtree when a value changes, key it, as in `<Fragment key={userId}>`, rather than looping over a one-item array.

### Switch on a discriminated union

`@switch` keeps each arm's output and setup together. Each arm owns its own render scope, so switching arms resets their state.

```tsrx
type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'failed'; message: string };

export function SaveStatus({ status }: { status: Status }) @{
	<p role="status">
		@switch (status.kind) {
			@case 'idle': {
				<>{'All changes saved'}</>
			}
			@case 'saving': {
				<>{'Saving…'}</>
			}
			@case 'failed': {
				const message = (status as { message: string }).message;
				<strong>{'Could not save: ' + message}</strong>
			}
		}
	</p>
}
```

### Scope styles to the template

A `<style>` block styles its siblings and their descendants, and nothing else. Use custom properties for runtime values; the CSS itself is static. Assign a block to a constant, `const theme = <style>…</style>`, to get a class map you can pass to children through `theme.$class`, or apply it to a whole scope with `<style apply={theme} />`. `class` composes like clsx, so arrays and objects are fine.

```tsrx
export function Meter({ value }: { value: number }) @{
	<>
		<style>
			.meter { background: #eee; border-radius: 4px; }
			.fill { width: var(--value); background: green; height: 8px; }
		</style>
		<div class="meter" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
			<div class={['fill', value > 90 && 'full']} style={{ '--value': value + '%' }} />
		</div>
	</>
}
```

Scoped style details, `:global`, and themes are in the [styling guide](https://octanejs.dev/docs/styling).

## Components, state, and hooks

### Derive values during render

If a value can be computed from props or state, compute it in setup. Storing it in state means two sources of truth and an extra render to keep them agreeing. The compiler caches eligible declarations, so you rarely need to memoize the calculation yourself.

Avoid (redundant state and a second update):

```tsrx
// Avoid: OCTANE_STRONG_EFFECT_STATE_UPDATE
'use strong';
import { useEffect, useState } from 'octane';

export function Label({ first, last }: { first: string; last: string }) @{
	const [label, setLabel] = useState('');
	useEffect(() => setLabel(first + ' ' + last));
	<p>{label as string}</p>
}
```

Prefer:

```tsrx
'use strong';

export function Label({ first, last }: { first: string; last: string }) @{
	const label = first + ' ' + last;
	<p>{label as string}</p>
}
```

The same applies to filtered lists, totals, and validity flags. Keep the minimal state, such as the selected ID, and derive the rest, such as the selected item.

```tsrx
'use strong';
import { useState } from 'octane';

type Item = { id: string; title: string };

export function Picker({ items }: { items: Item[] }) @{
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = items.find((item) => item.id === selectedId) ?? null;
	<>
		<ul>
			@for (const item of items; key item.id) {
				<li>
					<button aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
						{item.title as string}
					</button>
				</li>
			}
		</ul>
		<p>{selected ? 'Selected: ' + selected.title : 'Nothing selected'}</p>
	</>
}
```

### Treat state as an immutable snapshot

State is a snapshot of one render. Pass a new value to the setter; never mutate the old one. A mutated array passed back to its setter is the same object, so nothing re-renders, and transitions and `useOptimistic` revert to the corrupted value.

Avoid:

```tsrx
// Avoid: OCTANE_STRONG_SNAPSHOT_MUTATION
'use strong';
import { useState } from 'octane';

export function Tags() @{
	const [tags, setTags] = useState<string[]>([]);
	<button
		onClick={() => {
			tags.push('new');
			setTags(tags);
		}}
	>
		{'Tags: ' + tags.length}
	</button>
}
```

Prefer:

```tsrx
'use strong';
import { useState } from 'octane';

export function Tags() @{
	const [tags, setTags] = useState<string[]>([]);
	<button onClick={() => setTags((current) => [...current, 'new'])}>{'Tags: ' + tags.length}</button>
}
```

Use the updater form when the next value depends on the previous one. Keep updaters and reducers pure: Octane can run them more than once, so read the clock, fetch, or log in the handler and pass the result in.

### Read the latest state with the getter

`useState` and `useReducer` return three members: `[state, update, getState]`. The first is this render's snapshot. The getter returns the latest scheduled state, which is what async code wants after an `await`. Do not call the getter during render: Strong reports that as `OCTANE_STRONG_RENDER_STATE_GETTER_CALL`.

Avoid (the snapshot is stale after the `await`):

```tsrx
// Avoid: OCTANE_STRONG_STALE_STATE_UPDATE
'use strong';
import { useState } from 'octane';
import { save } from './api';

export function SaveCounter() @{
	const [saved, setSaved] = useState(0);
	<button
		onClick={async () => {
			await save();
			setSaved(saved + 1);
		}}
	>
		{'Saved ' + saved + ' times'}
	</button>
}
```

Prefer:

```tsrx
'use strong';
import { useState } from 'octane';
import { save } from './api';

export function SaveCounter() @{
	const [saved, setSaved, getSaved] = useState(0);
	<button
		onClick={async () => {
			await save();
			setSaved((current) => current + 1);
			console.log('saved', getSaved());
		}}
	>
		{'Saved ' + saved + ' times'}
	</button>
}
```

After a setter call, the snapshot still holds the old value. If you need the value you just set, compute it once and use it twice: `const next = count + 1; setCount(next); log(next)`.

### Reset editable state with useLinkedState

State initialized from a prop does not follow the prop. When local edits should reset as the prop's identity changes, such as opening a different user in an editor, use `useLinkedState(source, reconcile)`. It recomputes in the same render the source changes, with no effect and no stale frame.

Avoid:

```tsrx
// Avoid: OCTANE_STRONG_UNLINKED_PROP_STATE
'use strong';
import { useState } from 'octane';

type User = { id: string; name: string };

export function NameField({ user }: { user: User }) @{
	const [name, setName] = useState(user.name);
	<input value={name} onInput={(event) => setName(event.currentTarget.value)} />
}
```

Prefer:

```tsrx
'use strong';
import { useLinkedState } from 'octane';

type User = { id: string; name: string };

export function NameField({ user }: { user: User }) @{
	const [name, setName] = useLinkedState(user.id, () => user.name);
	<input value={name} onInput={(event) => setName(event.currentTarget.value)} />
}
```

When you really want only the first value, say so: `useState(() => user.name)` keeps a setter for later edits, and `useInitialValue(() => user.name)` captures a read-only initial snapshot. Strong rejects `const [value] = useState(…)` without its setter as `OCTANE_STRONG_READ_ONLY_STATE`.

### Put hooks where they belong

Octane keys hooks by compiler-assigned call site, not call order. A hook may sit behind a condition or after an early return; when skipped it keeps its state. Do not contort code to satisfy React's Rules of Hooks.

```tsrx
import { useState } from 'octane';

export function Details({ open, text }: { open: boolean; text: string }) @{
	if (!open) return null;
	const [expanded, setExpanded] = useState(false);
	<section>
		<button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
			{expanded ? 'Less' : 'More'}
		</button>
		@if (expanded) {
			<p>{text as string}</p>
		}
	</section>
}
```

A slot-keyed hook inside a plain JavaScript `for` or `while` loop is a compile error, because every iteration would share one slot. Render a keyed `@for` row or a child component instead, so each item has its own scope. `use()` and `useContext` are exempt from that restriction. In Strong `.tsrx` modules, declare a hook in the nested `@{ … }` block that uses it (`OCTANE_STRONG_HOOK_LOCALITY`), and declare a named event handler next to the element that uses it (`OCTANE_STRONG_EVENT_HANDLER_LOCALITY`).

### Omit dependency arrays

When you omit the dependency array of `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, or `useImperativeHandle`, the compiler infers it from what the callback reads. That is the default, not an oversight. An explicit array keeps React's exact behavior and is never rewritten; `null` means "run after every commit". In Strong modules, an effect array that differs from the inferred inputs reports `OCTANE_STRONG_EXPLICIT_DEPENDENCIES`, so omit it there. `useMemo` and `useCallback` keep manual arrays in Strong.

Declare and finish assigning what a hook reads before calling it: a value assigned after the hook cannot be tracked (`OCTANE_STRONG_UNTRACKED_EFFECT`).

### Use native events and controlled inputs

Events are native and delegated. Use `onInput` for each keystroke in a text field; native `change` fires when the browser commits the edit, often on blur. Checkbox, radio, and `<select>` `onChange` handlers keep their native meaning. Controlled `value` and `checked` follow React's semantics; `defaultValue` and `defaultChecked` are the uncontrolled escape.

Avoid:

```tsrx
// Avoid: OCTANE_NATIVE_TEXT_ONCHANGE
'use strong';
import { useState } from 'octane';

export function Search() @{
	const [query, setQuery] = useState('');
	<input value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
}
```

Prefer:

```tsrx
'use strong';
import { useState } from 'octane';

export function Search() @{
	const [query, setQuery] = useState('');
	<label>
		Search
		<input type="search" value={query} onInput={(event) => setQuery(event.currentTarget.value)} />
	</label>
}
```

### Pass refs as props

A ref is an ordinary prop: `ref={object}`, `ref={callback}`, or `ref={[a, b]}`. There is no `forwardRef`; a component that wants to expose an element passes its `ref` prop on. Read and write `ref.current` in events and effects, not during render. To create a value once, use `useLazyRef(() => create())` instead of testing `ref.current` during render.

```tsrx
'use strong';
import { useLazyRef, useRef } from 'octane';
import { createHistory } from './history';

export function Editor({ ref }: { ref?: { current: HTMLTextAreaElement | null } }) @{
	const history = useLazyRef(() => createHistory());
	const local = useRef<HTMLTextAreaElement>(null);
	<textarea ref={[local, ref]} onInput={(event) => history.current.push(event.currentTarget.value)} />
}
```

### Provide context directly

`createContext` returns the provider component itself: render `<Theme value={theme}>`. There is no `Theme.Provider` or `Consumer`. Read it with `use(Theme)` or `useContext(Theme)`, which may sit behind conditions. Keep changing data close to its owner; reach for context when several distant branches need the same source of truth.

```tsrx
import { createContext, use, useState } from 'octane';

const Theme = createContext<'light' | 'dark'>('light');

function ThemeLabel() @{
	const theme = use(Theme);
	<p>{'Theme: ' + theme}</p>
}

export function Settings() @{
	const [theme, setTheme] = useState<'light' | 'dark'>('light');
	<Theme value={theme}>
		<button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>Switch theme</button>
		<ThemeLabel />
	</Theme>
}
```

`createCompiledContext`, `CompiledContext`, and `CompiledOutlet` serve compiled routing and binding infrastructure. Application code should use `createContext`.

## Compose components

### Prefer explicit variants to mode flags

A component that grows boolean props, `isCompact`, `isEditing`, `isReadOnly`, ends up with combinations nobody designed and branches that leak into each other. Give each variant a name: separate components for different jobs, or one discriminated `variant` prop when the variants really share structure.

Avoid (valid code, but every flag doubles the states to test):

```tsrx
// Avoid: mode flags
export function Composer(props: { isEditing?: boolean; isReply?: boolean; text?: string }) @{
	<form>
		<textarea defaultValue={props.isEditing ? props.text : ''} />
		<button type="submit">{props.isEditing ? 'Save' : props.isReply ? 'Reply' : 'Send'}</button>
	</form>
}
```

Prefer:

```tsrx
import type { OctaneNode } from 'octane';

function ComposerFrame(props: { initial?: string; action: string; children?: OctaneNode }) @{
	<form>
		<textarea defaultValue={props.initial ?? ''} />
		{props.children}
		<button type="submit">{props.action as string}</button>
	</form>
}

export function NewMessage() @{
	<ComposerFrame action="Send" />
}

export function EditMessage({ text }: { text: string }) @{
	<ComposerFrame action="Save" initial={text} />
}

export function Reply({ quote }: { quote: string }) @{
	<ComposerFrame action="Reply">
		<blockquote>{quote as string}</blockquote>
	</ComposerFrame>
}
```

### Pass markup as children or render bodies

Type renderable props as `OctaneNode` and render them with `{children}`. For more than one slot, pass named props. In Strong modules, a block passed directly to a component prop, `header={@{ … }}`, is a compiled render body: it needs no `() =>` wrapper and builds no element descriptor. Do not inspect or clone template children; that needs descriptor children and the generic renderer.

```tsrx
'use strong';
import type { OctaneNode } from 'octane';

function Card(props: { header: OctaneNode; children?: OctaneNode }) @{
	<article>
		<header>{props.header}</header>
		{props.children}
	</article>
}

export function Profile({ name }: { name: string }) @{
	<Card header={@{ <h2>{name as string}</h2> }}>
		<p>Joined this year.</p>
	</Card>
}
```

Pass a component itself, `icon={Plus}`, instead of an element created with `createElement`. Strong reports `createElement`, `cloneElement`, `Children`, and `isValidElement` as `OCTANE_STRONG_ELEMENT_API`.

### Introduce context only for shared ownership

Compound components, such as a `Tabs` with `Tabs.List` and `Tabs.Panel`, are worth their context when the parts really share state. If a parent can pass the value as a prop, do that: it is easier to follow and to test. Avoid wrapping a component in an abstraction until a second caller needs it.

## Keep effects for external systems

An effect synchronizes a component with something outside Octane: a subscription, a timer, a non-Octane widget, the document title. If no external system is involved, you probably don't need an effect.

### Handle user actions in the event handler

Work caused by a specific interaction belongs in that interaction's handler. Routing it through state and an effect adds a render, runs at the wrong time, and can run again on remount.

Avoid:

```tsrx
// Avoid: OCTANE_STRONG_EFFECT_STATE_UPDATE
'use strong';
import { useEffect, useState } from 'octane';
import { post } from './api';

export function Subscribe() @{
	const [submitted, setSubmitted] = useState(false);
	useEffect(() => {
		if (!submitted) return;
		post('/subscribe');
		setSubmitted(false);
	});
	<button onClick={() => setSubmitted(true)}>Subscribe</button>
}
```

Prefer:

```tsrx
'use strong';
import { post } from './api';

export function Subscribe() @{
	<button onClick={() => post('/subscribe')}>Subscribe</button>
}
```

Effect chains, where one effect sets state that another effect reads, are the same problem at a larger scale (`OCTANE_STRONG_EFFECT_CHAIN`). Derive the value, or do the work in one place.

### Release what an effect acquires

Return a cleanup that releases every listener, timer, observer, and connection the effect created. Octane runs the cleanup before the effect runs again and on unmount. Strong checks platform resources it can see.

Avoid:

```tsrx
// Avoid: OCTANE_STRONG_EFFECT_RESOURCE_LEAK
'use strong';
import { useEffect, useState } from 'octane';

export function OnlineBadge() @{
	const [online, setOnline] = useState(true);
	useEffect(() => {
		window.addEventListener('online', () => setOnline(true));
	});
	<span>{online ? 'Online' : 'Offline'}</span>
}
```

Prefer a store subscription, which also gives server rendering a snapshot:

```tsrx
'use strong';
import { useSyncExternalStore } from 'octane';

function subscribe(notify: () => void) {
	window.addEventListener('online', notify);
	window.addEventListener('offline', notify);
	return () => {
		window.removeEventListener('online', notify);
		window.removeEventListener('offline', notify);
	};
}

function getOnline() {
	return navigator.onLine;
}

export function OnlineBadge() @{
	const online = useSyncExternalStore(subscribe, getOnline, () => true);
	<span>{online ? 'Online' : 'Offline'}</span>
}
```

Define `subscribe` outside the component, and make `getSnapshot` return a value the store keeps. A snapshot that allocates a new object on every call looks like a change every time (`OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT`).

### Do not fetch render data in an effect

An effect that fetches and then sets state renders once empty, races when inputs change, and needs hand-written cancellation. Read render data with `use()`, a Signals `query$`, or an Octane Data read, and let `@try` show loading and errors.

Avoid:

```tsrx
// Avoid: OCTANE_STRONG_EFFECT_DATA_FETCH
'use strong';
import { useEffect, useState } from 'octane';

export function Profile({ id }: { id: string }) @{
	const [name, setName] = useState('');
	useEffect(() => {
		fetch('/api/users/' + id)
			.then((response) => response.json())
			.then((user) => setName(user.name));
	});
	<p>{name as string}</p>
}
```

Prefer:

```tsrx
'use strong';
import { query$ } from 'octane/signals';

async function loadName(id: string, { signal }: { signal: AbortSignal }) {
	const response = await fetch('/api/users/' + id, { signal });
	if (!response.ok) throw new Error('Request failed: ' + response.status);
	return ((await response.json()) as { name: string }).name;
}

export function Profile({ id }: { id: string }) @{
	const name$ = query$(() => id, loadName);
	@try {
		<p>{name$.get() as string}</p>
	} @pending {
		<p>Loading…</p>
	} @catch {
		<p role="alert">Could not load the profile.</p>
	}
}
```

When an effect really must synchronize with a request, such as a non-Octane widget, abort an `AbortController` from the cleanup and check its signal before updating state.

### Read the latest props from an effect with useEffectEvent

An effect that should call the latest callback without re-running when the callback changes uses `useEffectEvent`. Do not copy props into a ref during render (`OCTANE_STRONG_RENDER_REF_WRITE`), and never list an Effect Event as a dependency.

```tsrx
'use strong';
import { useEffect, useEffectEvent } from 'octane';

export function Ticker({ onTick }: { onTick: () => void }) @{
	const tick = useEffectEvent(onTick);
	useEffect(() => {
		const id = setInterval(() => tick(), 1000);
		return () => clearInterval(id);
	});
	<span>Ticking</span>
}
```

### Render from layout measurements with useLayoutSnapshot

A layout effect that copies a measurement into state renders twice before paint. `useLayoutSnapshot` measures after each commit and re-renders only when the value changes. Keep the measurement synchronous and write-free. For imperative read-then-write work across many components, queue it with `readLayout` and `writeLayout` so the browser lays out once per frame; see [layout phases](https://octanejs.dev/docs/core-apis#layout-phases).

```tsrx
'use strong';
import { useLayoutSnapshot, useRef } from 'octane';

export function Measured({ text }: { text: string }) @{
	const el = useRef<HTMLSpanElement>(null);
	const width = useLayoutSnapshot(() => el.current?.offsetWidth ?? 0, { initial: 0 });
	<span ref={el}>{text + ' (' + width + 'px)'}</span>
}
```

### Let the template own its DOM

Don't write through a ref to children, classes, attributes, or styles the template renders (`OCTANE_STRONG_MANAGED_DOM_WRITE`), and don't query your own markup with `document.querySelector` (`OCTANE_STRONG_OWN_MARKUP_QUERY`). Render the value from state, and attach a ref when you need the element. Focus, measurement, and mounting a third-party widget into an empty container remain fine.

For HTML from outside, sanitize it with your application's policy and mark it with `trustHTML`. `trustHTML` marks trust; it does not sanitize.

```tsrx
'use strong';
import { trustHTML } from 'octane';
import { sanitize } from './html-policy';

export function Article({ html }: { html: string }) @{
	<article dangerouslySetInnerHTML={trustHTML(sanitize(html))} />
}
```

## Make modules Strong

Strong mode is a compile-time assertion that rendering is a pure projection of an immutable snapshot of props, state, context, and signals. It is the recommended target for new Octane code. It is not React's StrictMode: nothing runs twice, and there are no runtime phase guards. The checks run in client, server, and editor compilation.

### Opt in with the directive or the config

Put `"use strong"` at the top of a module, before imports; comments may come first. Anywhere else it enables nothing and reports `OCTANE_STRONG_DIRECTIVE_PLACEMENT`. To make every application module Strong, set `compiler: { strong: true }` in `octane.config.ts`. Dependencies keep their own mode.

```tsrx
// A comment may precede the directive.
'use strong';
import { useState } from 'octane';

export function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount((current) => current + 1)}>{'Count: ' + count}</button>
}
```

Strong compiles `.tsrx`, `.ts`, and `.js` modules. A `.tsx` or `.jsx` module it reaches reports `OCTANE_STRONG_TSX_MODULE`, because its JSX renders through element descriptors instead of compiled templates. Convert it to `.tsrx` first.

### Keep render deterministic

The same inputs must produce the same output, on the server and in the browser. Reading the clock, randomness, browser globals, mutable module variables, or a ref's `current` during render breaks that, and so does scheduling work.

Avoid:

```tsrx
// Avoid: OCTANE_STRONG_RENDER_IMPURE_CALL
'use strong';

export function Timestamp() @{
	<time>{String(Date.now())}</time>
}
```

Prefer a stable snapshot supplied by the owner:

```tsrx
'use strong';

export function Timestamp({ timestamp }: { timestamp: number }) @{
	<time dateTime={new Date(timestamp).toISOString()}>{String(timestamp)}</time>
}
```

Create the timestamp at an event, request, or external-snapshot boundary. Server and client then agree during hydration, because both render the value that was passed in. Use `useId()` for element IDs, and format dates with an explicit locale and time zone (`OCTANE_STRONG_RENDER_LOCALE_FORMAT`).

Avoid:

```tsrx
// Avoid: OCTANE_STRONG_RENDER_AMBIENT_READ
'use strong';

export function Layout() @{
	const wide = window.innerWidth > 800;
	<main class={wide ? 'wide' : 'narrow'}>Content</main>
}
```

Prefer live browser state through `useSyncExternalStore` with a server snapshot, as in [Release what an effect acquires](#release-what-an-effect-acquires).

### Common Strong diagnostics

Every Strong error ends with a link to its entry in the [Strong mode reference](https://octanejs.dev/docs/strong-mode#diagnostic-reference), and `octane explain <CODE>` prints the same entry. These are the codes this guide teaches around:

| Code | Means | Instead |
| --- | --- | --- |
| `OCTANE_STRONG_EFFECT_STATE_UPDATE` | Effect setup updates state synchronously | Derive it, `useLinkedState`, or `useLayoutSnapshot` |
| `OCTANE_STRONG_EFFECT_DATA_FETCH` | An effect updates state after a request it can't cancel | `use()`, `query$`, a Data read, or an abort in cleanup |
| `OCTANE_STRONG_EFFECT_RESOURCE_LEAK` | A listener, timer, or observer is never released | Release it in the cleanup |
| `OCTANE_STRONG_EFFECT_CHAIN` | One effect reads state another effect wrote | Derive, or combine the synchronization |
| `OCTANE_STRONG_EXPLICIT_DEPENDENCIES` | An effect array differs from the inferred inputs | Omit the array |
| `OCTANE_STRONG_UNLINKED_PROP_STATE` | State initialized from props | `useLinkedState`, or a lazy initializer |
| `OCTANE_STRONG_SNAPSHOT_MUTATION` | State mutated in a handler or effect | Pass a new value |
| `OCTANE_STRONG_STALE_STATE_UPDATE` | A deferred update reads the render snapshot | Updater form or the getter |
| `OCTANE_STRONG_IMPURE_UPDATER` | An updater or reducer has side effects | Do the work in the handler |
| `OCTANE_STRONG_RENDER_STATE_UPDATE` | State updated during render | An event, or `useLinkedState` |
| `OCTANE_STRONG_RENDER_REF_READ` | `ref.current` read during render | State, `useLazyRef`, `useLayoutSnapshot` |
| `OCTANE_STRONG_RENDER_IMPURE_CALL` | Clock or randomness during render | Props, state, or `useId()` |
| `OCTANE_STRONG_RENDER_AMBIENT_READ` | `window`, `document`, and similar during render | `useSyncExternalStore` |
| `OCTANE_STRONG_INDEX_KEY` | An `@for` keyed by position | A stable item ID |
| `OCTANE_STRONG_MAP_JSX` | `.map()` returning JSX | `@for` |
| `OCTANE_STRONG_UNTRUSTED_HTML` | Raw HTML passed to `dangerouslySetInnerHTML` | `trustHTML` after sanitizing |
| `OCTANE_NATIVE_TEXT_ONCHANGE` | Text input with `onChange` | `onInput` |

### Know what the checks prove

The checks are bounded source analysis. They follow same-module functions, local aliases, state tuples, and known platform APIs. An imported function or a method on an arbitrary object is opaque: Strong assumes a call you make during render is pure and does not look inside it. Review imported helpers, third-party libraries, and compatibility boundaries such as `octane/react` yourself. Type checking with `tsrx-tsc --noEmit` covers what the syntax pass cannot, such as the `TrustedHTML` brand on an imported value.

`useMemo` and `useCallback` remain supported with manual dependencies. Effect dependencies follow the separate Strong rules above.

### Adopt Strong incrementally and keep it

1. Run `octane analyze --strong-preview` to see what Strong would report in modules that are not Strong yet.
2. Run `octane analyze --strong-preview --fix` to apply the rewrites the compiler can make, such as `useLazyRef`.
3. Add `"use strong"` one module at a time, starting with clean ones, and convert `.tsx` modules to `.tsrx`.
4. Record the remaining exceptions with `octane analyze --strong-baseline init`, so CI fails when a module leaves Strong mode (`OCTANE_STRONG_COVERAGE_REGRESSION`).
5. When every module is Strong, set `compiler: { strong: true }`. Use `compiler.strongDependencies` and `octane analyze --strong-dependencies` to decide which packages a Strong app may import.

The [Strong mode guide](https://octanejs.dev/docs/strong-mode#adopt-strong-mode) walks through each step, and the [compiler checks reference](https://github.com/octanejs/octane/blob/main/docs/strong-compiler-checks.md) lists every code.

## Own reactive state with Signals

Signals are reactive handles: read one with `.get()` while rendering, and Octane updates the parts that read it when it changes. They suit fine-grained state, state shared across components without a provider, and async values loaded by key. For ordinary component state, `useState` is still simpler; for server-owned records edited from many screens, use [Octane Data](#share-server-data-with-octane-data). The [Signals guide](https://octanejs.dev/docs/signals) is the full reference.

### Import a Signals entry in every module that reads one

Every module that reads a signal during render needs a runtime import from `octane/signals`, `octane/signals/client`, or `octane/signals/server`, including a component that only receives a handle as a prop. A `$` suffix or a type-only import is not enough. When no named import is needed, write `import 'octane/signals';`.

```tsrx
import 'octane/signals';
import type { SignalHandle } from 'octane/signals';

export function CountLabel({ count$ }: { count$: SignalHandle<number> }) @{
	<output>{String(count$.get())}</output>
}
```

### Keep component signals in the component

`useSignal$` creates writable state owned by one mounted component. Keep the `$` suffix on handles, and plain names on values you have read.

```tsrx
import { useSignal$ } from 'octane/signals/client';

export function Counter() @{
	const count$ = useSignal$(0);
	<button onClick={() => count$.set((count) => count + 1)}>{String(count$.get())}</button>
}
```

A `signal$` declared at module level is shared by everything in one document, or one request on the server. Declare it inside a component when each instance needs its own. Use `derived$` for values computed from other signals, and `createScope` when your code decides how long shared state lives; dispose the scope when that lifetime ends.

### Load keyed data with query$

`query$(select, load)` loads data for the key that `select` returns, cancels the previous request through the `AbortSignal` when the key changes, and suspends while pending. Return `skip` from `select` for an idle query, and check `snapshot().status` before reading it. Use `.get()` with a `@try` boundary, `.latest(fallback)` to keep the last good value while the next loads, and `.snapshot()` to branch on status.

```tsrx
import { query$, skip } from 'octane/signals';
import { loadUser } from './api';

export function UserCard({ id }: { id: string | null }) @{
	const user$ = query$(() => id ?? skip, loadUser);
	@if (user$.snapshot().status === 'idle') {
		<p>Choose a user.</p>
	} @else {
		@try {
			<p>{user$.get().name as string}</p>
		} @pending {
			<p>Loading user…</p>
		} @catch (_error, reset) {
			<button
				onClick={() => {
					user$.reset();
					reset();
				}}
			>
				Retry
			</button>
		}
	}
}
```

Use `refetch()` to refresh while keeping a ready value visible, and `reset()` for a fresh attempt that may show pending UI. For saves with optimistic feedback, `action$` and `optimistic$` separate a definite failure, which rolls back, from an uncertain outcome, which must be reconciled with the server before you adopt or reject it. On the server, create a fresh scope per request; never share request state through a module-level server scope.

## Share server data with Octane Data

`octane/data` is for data the server owns and many screens read and change: lists, records, optimistic edits, forms, feeds, and offline persistence. Read the [Data guide](https://octanejs.dev/docs/data) before your first contract, and the [Data reference](https://github.com/octanejs/octane/blob/main/docs/data.md) for exact guarantees.

### Declare contracts in .data.ts modules

A contract (`read`, `write`, `view`, `entity`, `feed`) is an inert description of one operation. **Declare every contract as an exported `const` in a `*.data.ts` or `*.data.js` module**, whose top level holds only imports, types, and `const` exports. Both the browser and the server import it, so it must not run code when it loads or import values from server modules; type imports are fine. A contract may be declared with the function that serves it, as in `read(options, run)`: the Vite and Rspack plugins drop `run` from the client build. The build then knows every contract and every use, and reports a used contract no handler serves (`OCTANE_DATA_CONTRACT_UNHANDLED`). These `OCTANE_DATA_*` diagnostics are the Data contract check, separate from Strong mode.

Name a contract directly at each site, such as `store.read(books)` or `useForm(addBook)`. Passing a contract around as a value hides its uses from the build.

Avoid:

```tsrx
// Avoid: OCTANE_DATA_CONTRACT_ESCAPE
import { useDataStore, useRead } from 'octane/data/octane';
import { books } from './contracts.data.ts';

function List({ source }: { source: typeof books }) @{
	const list = useRead(useDataStore().read(source));
	<p>{'Books: ' + list.length}</p>
}

export function Shelf() @{
	<List source={books} />
}
```

Prefer a component that names its read, and parameters that are data:

```tsrx
import { useDataStore, useRead } from 'octane/data/octane';
import { books } from './contracts.data.ts';

export function Shelf() @{
	const list = useRead(useDataStore().read(books));
	<p>{'Books: ' + list.length}</p>
}
```

### Provide one store per account and read with useRead

Create one store per signed-in account and give it to a `DataProvider` near the root. Key the subtree by account, so switching accounts never shows one account's cache to another. `useRead(handle)` returns the value and suspends on the first load, so put a `@try` boundary around readers. Later reloads keep the current value on screen.

```tsrx
import type { DataStore } from 'octane/data';
import { DataProvider, useDataStore, useRead } from 'octane/data/octane';
import { books } from './contracts.data.ts';

function BookList() @{
	const list = useRead(useDataStore().read(books));
	<ul>
		@for (const book of list; key book.id) {
			<li>{book.title as string}</li>
		} @empty {
			<li>The shelf is empty.</li>
		}
	</ul>
}

export function App({ store, account }: { store: DataStore; account: string }) @{
	<DataProvider key={account} store={store}>
		@try {
			<BookList />
		} @pending {
			<p>Loading the shelf…</p>
		} @catch {
			<p role="alert">Could not load the shelf.</p>
		}
	</DataProvider>
}
```

Pass `{ suspend: false }` to get the snapshot instead, with `status`, `refreshing`, and `stale`. Call `store.retire()` on sign-out to clear the account's memory and persistent cache; `dispose()` ends one store locally but keeps durable storage.

### Write with optimistic edits

`store.write(contract, input)` applies the write's edit to every read that shows the record at once, sends the write exactly once, and either keeps the server's reply or rolls the edit back. There is no local "saving" state to keep in sync.

```tsrx
import { useDataStore, useRead } from 'octane/data/octane';
import { books, setRead } from './contracts.data.ts';

export function ReadingList() @{
	const store = useDataStore();
	const list = useRead(store.read(books));
	<ul>
		@for (const book of list; key book.id) {
			<li>
				<label>
					<input
						type="checkbox"
						checked={book.read}
						onChange={() => void store.write(setRead, { id: book.id, read: !book.read }).catch(() => {})}
					/>
					{book.title as string}
				</label>
			</li>
		}
	</ul>
}
```

A rejected reply is definite: the server refused, and the edit is removed. A lost reply is **uncertain**: the write may have committed. The promise rejects with `DataUncertainError` and the edit stays visible. Never retry a possibly committed write blindly. Ask a receipt read whether its `operationId` was applied and call `store.settle(operationId, applied)`, or let the store's journal do it. Writes to a record whose create is unconfirmed already wait for it; that ordering does not make the first write succeed, so handle its refusal too.

### Build forms with useForm

A write with a `form` option works as a native `POST` before hydration and through the store, optimistically, afterwards. `useForm` returns the form's attributes, its hidden fields, and the latest submission's `pending`, `values`, `issues`, and `error`.

```tsrx
import { useForm } from 'octane/data/octane';
import { addBook } from './contracts.data.ts';

export function AddBook() @{
	const add = useForm(addBook);
	const message = add.issues.title ?? (add.error ? 'Could not add that book' : '');
	<form {...add.attrs}>
		{add.hidden()}
		<label>
			Title
			<input name="title" defaultValue={add.values.title ?? ''} />
		</label>
		<button type="submit" disabled={add.pending}>
			Add
		</button>
		@if (message) {
			<p role="alert">{message as string}</p>
		}
	</form>
}
```

On the server, run `handler.forms(request)` before rendering, render with a fresh store per request, and `dehydrate()` it after the render completes into the page's seed. Then `retire()` the server store. Views, cursor pages (`usePages`), feeds (`useFeed`), persistence, and cross-tab sharing are covered in the [Data guide](https://octanejs.dev/docs/data).

## Async UI, SSR, and hydration

### Let independent reads start together

The compiler starts provably independent `use()` calls together and suspends once for the group. Write sequential reads; a read that depends on an earlier result stays sequential. Wrapping every call in `Promise.all` is unnecessary, and it ties the reads' lifetimes together. Keep promises stable: create them in a data layer, router, or imported loader keyed by input, not freshly in a component on each render.

```tsrx
import { use } from 'octane';
import { fetchAvatar, fetchPosts, fetchProfile } from './api';

export function ProfilePage({ id }: { id: string }) @{
	const profile = use(fetchProfile(id));
	const posts = use(fetchPosts(id));
	const avatar = use(fetchAvatar(profile.avatarId));
	<article>
		<img src={avatar.url} alt="" />
		<h1>{profile.name as string}</h1>
		<p>{posts.length + ' posts'}</p>
	</article>
}
```

`fetchProfile` and `fetchPosts` start together; `fetchAvatar` waits for the profile it needs.

### Put boundaries where the loading state belongs

`@try`/`@pending`/`@catch` is the template form of Suspense and an error boundary. Put a boundary around each region that can load or fail on its own, so the rest of the page stays usable. The `@catch` arm receives the error and a `reset` function. `Suspense` and `ErrorBoundary` components remain available.

```tsrx
import type { OctaneNode } from 'octane';

export function Panel({ title, children }: { title: string; children: OctaneNode }) @{
	<section aria-label={title}>
		@try {
			<>{children}</>
		} @pending {
			<p>{'Loading ' + title + '…'}</p>
		} @catch (_error, reset) {
			<p role="alert">
				{'Could not load ' + title + '. '}
				<button onClick={reset}>Try again</button>
			</p>
		}
	</section>
}
```

### Keep the current screen during a transition

Wrap an update that reveals slow content in a transition, so the current UI stays visible instead of falling back to `@pending`. Keep typing urgent. `useDeferredValue` lets one slow view lag behind fast input. Octane's scheduler has two priorities and does not time-slice; a transition does not make work faster.

```tsrx
import { useState, useTransition } from 'octane';
import { Report } from './Report.tsrx';

export function Reports() @{
	const [name, setName] = useState('daily');
	const [isPending, startTransition] = useTransition();
	<>
		<button onClick={() => startTransition(() => setName('weekly'))}>
			{isPending ? 'Opening…' : 'Weekly report'}
		</button>
		<Report name={name} />
	</>
}
```

`useActionState`, `useFormStatus`, and `useOptimistic` follow React's form-action contracts; see [responsive updates and actions](https://octanejs.dev/docs/core-apis#responsive-updates). `Activity` keeps hidden UI's state, `ViewTransition` animates updates, and `createPortal` renders into another container.

### Load code with lazy

`lazy(() => import('./Settings.tsrx'))` loads a component when it first renders and suspends meanwhile. Octane's `lazy` also accepts a bare component. Preload code and data a route will need with the resource hints `preload`, `preinit`, `preloadModule`, and `prefetchDNS`.

### Render the same thing on the server and the client

Hydration adopts the server's HTML, so the first client render must produce the same output. Render from props, state, and server snapshots, never from the clock, randomness, or browser globals; Strong catches most of these. Give `useSyncExternalStore` a server snapshot. Use `useId()` for IDs. Fix a mismatch rather than suppressing it.

Create per-request state per request: a fresh Data store, Signals scope, or context value for each server render, disposed after it. Module-level state on the server is shared by every request. Stream with `@try` boundaries so slow regions don't hold the shell, and defer hydration of below-the-fold regions with `<Hydrate>`; see [SSR](https://github.com/octanejs/octane/blob/main/docs/ssr.md) and [deferred hydration](https://octanejs.dev/docs/core-apis#deferred-hydration).

## Performance, accessibility, and testing

### Measure before memoizing

The compiler caches eligible `const` declarations in setup, memoizes template regions, and skips unchanged keyed rows and pure components. Most manual `memo`, `useMemo`, and `useCallback` calls are therefore unnecessary. Add one when a profile shows a real cost, or when you need a stable identity the compiler cannot prove, such as a value passed to an opaque library. Strong also caches object, array, and callback declarations that an effect uses, so effects don't re-run on identity alone. Profile with [`octane/profiling`](https://octanejs.dev/docs/profiling), and benchmark representative data before and after a change.

Keep render work proportional to what changed: derive values in setup rather than in a hand-rolled cache, keep large lists keyed so survivors are retained, and move expensive non-render work into events. Import from supported package entry points so the bundler can tree-shake what you don't use.

### Use native semantics first

Octane renders real DOM with native events, so accessibility is the platform's: use `<button>` for actions, `<a href>` for navigation, `<label>` for inputs, and native form submission. Add ARIA only where no element carries the meaning. The forms that `useForm` produces work before JavaScript loads. Keep focus management in events and effects, through refs.

### Test behavior, not implementation

Test what a user sees and does with `@octanejs/testing-library`: query by role and label, fire native events, and await async UI. For server rendering, render to a string and hydrate it in a test, checking that the output is adopted without errors. Run `tsrx-tsc --noEmit` (or `octane-tsc` in this repository) for types, `octane analyze` for Strong coverage and Data contracts, and your bundler build. Bindings for routers, forms, and other libraries are listed in [Bindings](https://octanejs.dev/docs/bindings); React components can be hosted with [ReactCompat](https://octanejs.dev/docs/react-compat), which Strong treats as a compatibility boundary.

## Review checklist

- [ ] Every value that can be derived is derived in setup, not stored or synchronized.
- [ ] Each piece of state has one owner with the right lifetime: component, Signals, Data, or an external store.
- [ ] State updates pass new values; deferred updates use the updater form or the getter.
- [ ] Editable state that follows a prop uses `useLinkedState`.
- [ ] Effects only synchronize external systems, omit their dependency arrays, and release what they acquire.
- [ ] Render data is read with `use()`, `query$`, or `useRead` inside a `@try` boundary, not fetched in an effect.
- [ ] Lists use keyed `@for` with stable item IDs.
- [ ] Text inputs use `onInput`; refs are props; `class` values compose.
- [ ] Render reads nothing ambient, random, or time-based; server and client render the same output.
- [ ] Modules are Strong, or listed in the Strong baseline with a reason.
- [ ] Every module that reads a signal has a runtime Signals import.
- [ ] Data contracts live in `*.data.ts` and are named directly at each site; uncertain writes are settled, not retried.
- [ ] Per-request server state is created per request and disposed.
- [ ] Interactive elements are native and labelled; tests query by role and label.

## API coverage

This table classifies the public API families in the [package inventory](https://github.com/octanejs/octane/blob/main/docs/packages.md) and the [`octane` entry point](https://github.com/octanejs/octane/blob/main/packages/octane/src/index.ts). **Taught** families have guidance above; **Linked** families are covered by the linked reference; **Advanced** families are for libraries and interop; **Excluded** names are not application APIs.

| Family | Names | Coverage |
| --- | --- | --- |
| State | `useState`, `useReducer`, `useLinkedState`, `useInitialValue` | Taught |
| Effects and refs | `useEffect`, `useLayoutEffect`, `useEffectEvent`, `useRef`, `useLazyRef`, `useSyncExternalStore`, `useLayoutSnapshot` | Taught |
| Layout phases | `readLayout`, `writeLayout`, `flushLayoutSync`, `getPhase`, `createResizeObserver` | Linked: [Core APIs](https://octanejs.dev/docs/core-apis#layout-phases) |
| Memoization | `useMemo`, `useCallback`, `memo` | Taught |
| Context | `createContext`, `use`, `useContext` | Taught |
| Async UI | `use`, `Suspense`, `ErrorBoundary`, `lazy` | Taught |
| Transitions and actions | `useTransition`, `startTransition`, `useDeferredValue`, `useActionState`, `useFormStatus`, `useOptimistic` | Taught and linked |
| Composition | `Fragment`, `createPortal`, `Activity`, `ViewTransition`, `useId`, `useImperativeHandle` | Linked: [Core APIs](https://octanejs.dev/docs/core-apis) |
| HTML trust | `trustHTML` | Taught |
| Roots and hydration | `createRoot`, `hydrateRoot`, `Hydrate` | Linked: [Core APIs](https://octanejs.dev/docs/core-apis#roots-and-rendering) |
| Resource hints | `preload`, `preinit`, `preloadModule`, `preinitModule`, `preconnect`, `prefetchDNS` | Linked |
| Signals | `signal$`, `derived$`, `query$`, `skip`, `useSignal$`, `createScope`, `action$`, `optimistic$` | Taught; full list in [Signals](https://octanejs.dev/docs/signals#reference) |
| Data | `read`, `write`, `view`, `entity`, `feed`, `createDataStore`, `DataProvider`, `useDataStore`, `useRead`, `usePages`, `useForm`, `useFeed` | Taught; full list in [Data](https://octanejs.dev/docs/data#reference) |
| Behavior roots | `attachBehaviorRoot`, `captureFormSubmissions` | Advanced: [Core APIs](https://octanejs.dev/docs/core-apis#behavior-only-roots) |
| Compiled context | `createCompiledContext`, `CompiledContext`, `CompiledOutlet` | Advanced: routing and binding infrastructure |
| Descriptor elements | `createElement`, `cloneElement`, `isValidElement`, `Children`, `descriptorChildren` | Advanced: interop; rejected in Strong |
| React compatibility | `flushSync`, `StrictMode`, `unstable_batchedUpdates` | Excluded from new code; rejected in Strong |
| Compiler ABI | Tier 2 of `packages/octane/src/index.ts`, such as `template` and `bag0` | Excluded: compiler output only |
| Test hooks | Tier 3 of `packages/octane/src/index.ts`, such as `drainPassiveEffects` | Excluded: repository tests only |

When a covered API or diagnostic changes, update its section and examples here; the guide's test fails when an example stops compiling or a named diagnostic no longer exists.

## Sources and attribution

This guide adapts questions and the good/bad teaching format from public React material, rewritten for Octane with new examples. No text or code is copied from these sources:

- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure), [Keeping Components Pure](https://react.dev/learn/keeping-components-pure), and [Rendering Lists](https://react.dev/learn/rendering-lists) from [React Learn](https://react.dev/learn) (CC BY 4.0).
- The [eslint-plugin-react-hooks reference](https://react.dev/reference/eslint-plugin-react-hooks), compared against Octane's own Strong diagnostics.
- Vercel's [React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) and [composition patterns](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) agent skills (MIT).

Octane's own references take precedence: [TSRX basics](https://github.com/octanejs/octane/blob/main/docs/tsrx-basics.md), [Differences from React](https://octanejs.dev/docs/differences-from-react), [Strong mode](https://octanejs.dev/docs/strong-mode), [Signals](https://octanejs.dev/docs/signals), [Data](https://octanejs.dev/docs/data), and [SSR](https://github.com/octanejs/octane/blob/main/docs/ssr.md).
