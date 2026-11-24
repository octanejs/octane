# Best practices

Say you're halfway through editing a name when you open another user's profile. The editor is still on screen, but the draft belongs to the person whose name you were editing. How do you tell Octane when to keep the draft and when to start over? That's a question about who owns the state, and it's a good place to start when writing an app in TSRX. We'll work through that editor and other everyday decisions, including when an effect helps, where Signals and Data fit, and what Strong mode can check before you ship.

You can use this guide as you write or review an app, or give it to a coding agent working on the app with you. For common pitfalls, we show the code you might be tempted to write, marked `Avoid`, and explain what we'd do in its place. Every example is a whole TSRX module that we compile in the repository tests. When a Strong example names a diagnostic in its comment, the tests check that the compiler reports it.

If you've written React, much of this will feel familiar. Octane makes a few deliberately different choices, which you can read about in [Differences from React](https://octanejs.dev/docs/differences-from-react).

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

If you're here with a particular problem, scan the headings for the advice that fits. Each section explains the reasoning, the exceptions, and where to read more. We've kept the examples small. An import like `./api` or `./contracts.data.ts` stands in for a module in your own app.

If you're coming from React, the table is a good place to start. Some practices carry over directly. Others solve a familiar problem with a different Octane API, and a few are specific to the way React works.

| In React | Does it carry over? | In Octane |
| --- | --- | --- |
| Derive values instead of keeping them in sync with effects | Yes | [Derive the value during render](#derive-values-during-render). Strong reports `OCTANE_STRONG_EFFECT_STATE_UPDATE` for the effect version. |
| Put interaction logic in event handlers | Yes | [Handle the action in its event handler](#handle-user-actions-in-the-event-handler). The handler receives a native DOM event. |
| Call hooks before any conditions or early returns | The rule changes | The compiler identifies each hook by its call site, so a condition or early return is fine. Plain JS loops need more care. See [where to put hooks](#put-hooks-where-they-belong). |
| List every dependency in an array | The rule changes | Leave out the array and the compiler infers the dependencies. Strong reports `OCTANE_STRONG_EXPLICIT_DEPENDENCIES` if a handwritten effect array differs from what it infers. |
| Use `useMemo` and `useCallback` to manage rerenders | The rule changes | The compiler already caches eligible declarations and memoizes parts of the template. [Measure before memoizing](#measure-before-memoizing). |
| Use `Promise.all` to avoid a request waterfall | The rule changes | The compiler can [start independent `use()` calls together](#let-independent-reads-start-together). |
| Fetch in effects or use SWR or React's `cache` | The rule changes | Choose between `use()`, a Signals `query$`, and an Octane Data read based on [who owns the data](#choose-where-state-lives). |
| Replace boolean mode props and compose with render props | Yes, with Octane tools | [Give each variant a name](#prefer-explicit-variants-to-mode-flags) and [pass render bodies](#pass-markup-as-children-or-render-bodies). |
| Render `items.map` with a `key` that's stable across reorders | The syntax changes | Use `@for` with a stable key from the item. Strong rejects index keys and JSX returned from `.map`. |
| Use synthetic `onChange`, `forwardRef`, and `className` strings | The APIs change | Listen for keystrokes with native `onInput`, pass refs as props, and let `class` compose the values you give it. |
| Expect StrictMode to invoke effects twice | React only | Strong checks your code at compile time. Each effect runs on its usual schedule, without a second invocation for checking. |
| Use Server Components, `"use client"`, and Next.js helpers | React only | Octane has its own server rendering, streaming, and `module server` functions. |
| Set `suppressHydrationWarning` | React only | Track down the mismatch. Strong reports `OCTANE_STRONG_SUPPRESSION_PROP` if you use the prop. |
| Hoist static JSX out of components | Already handled | The compiler builds each static template once. |

## Choose where state lives

When your compiled TSRX component **renders**, it describes what the UI looks like for a particular snapshot of props, state, context, and signals. That snapshot is immutable. **Event handlers** and **effects** run later and can schedule changes. Two common sources of bugs are changing a value while you're rendering it and reading a value that can change without Octane knowing to render again.

Start with the component that needs the value. Who else needs to see it, and should it still be there when that component unmounts? Pick the simplest option that gives it the right lifetime.

| What you need | Where it lives | What to use |
| --- | --- | --- |
| An open menu or a draft that only one component uses | In the component for as long as it's mounted | `useState` or `useReducer` |
| An editable value that resets when its source changes | In the component, with a fresh value for each source | `useLinkedState(source, reconcile)` |
| A value you can calculate from props or state | In the current render | A plain `const` in setup |
| State that distant components in the same subtree share | In their nearest common parent | Lift the state to that parent. Use context if the props have a long way to travel. |
| Fine-grained reactive values or state that needs to outlive a component | In a module, a component, or a scope you dispose of yourself | Signals such as `signal$`, `derived$`, and `useSignal$` |
| Async data loaded by key | In the component or module that selects the key | A Signals `query$` or `use()` with a stable promise |
| Server records that people read and edit on several screens | In the signed-in account's store | Octane Data contracts with `store.read` and `store.write` |
| A value from a browser API or a third-party store | In the external system | `useSyncExternalStore` with a cached snapshot |

For a draft that can go away when you close the editor, component state is enough. Reach for Signals or Data when the value needs a different owner or a longer life.

## Write TSRX templates

TSRX adds templates to TypeScript. In `function Name() @{ … }`, you can do your setup in ordinary statements and finish with a single output node. If the syntax is new to you, the [TSRX basics](https://github.com/octanejs/octane/blob/main/docs/tsrx-basics.md) walk through it. Here we'll look at how that split works in a few everyday components.

### Mark dynamic text and branch with directives

In the list below, counting the remaining items is plain JavaScript, so it belongs in setup. Choosing which rows to show happens in the template, where you have `@if`, `@for`, `@switch`, and `@try`. A bare `{value}` gives Octane a place to render a component, an element, or a primitive. When you mean to display text and the compiler can't tell that the value is a string, mark it with a cast like `{value as string}` or convert it with `{String(count)}`.

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

Imagine inserting a name at the top of this list. If the key is the row's position, the new name gets the first row's DOM, state, and effects. Removing a name shifts the rows the same way. Strong flags index keys and JSX returned from `.map`.

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

Give `@for` an ID from the data and each person keeps their own row as the list changes.

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

You can still declare `index position` if you want to display the row number. Keys also work on a single subtree outside a loop. For example, wrap the profile editor in `<Fragment key={userId}>` and Octane remounts it whenever `userId` changes. The next profile opens with a fresh draft.

### Switch on a discriminated union

For a save status, only the failure case needs an error message. With `@switch`, the code that reads the message can live right beside the markup that displays it. Each arm has its own render scope, so moving to another arm resets the state from the previous one.

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

A `<style>` block applies to its siblings and their descendants. That lets the meter below use short class names without styling anything outside the meter. The CSS stays static as the value changes because the component passes the width through a custom property. You can pass arrays and objects to `class`, which combines them the way clsx does.

To share the styles, assign the block to a constant with `const theme = <style>…</style>`. You can pass the resulting class map to a child through `theme.$class` or apply the theme to a whole scope with `<style apply={theme} />`.

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

The [styling guide](https://octanejs.dev/docs/styling) goes into more detail about scoped styles, `:global`, and themes.

## Components, state, and hooks

### Derive values during render

Consider a label made up of a first and last name. If you keep the label in state as well as keeping the names in props, they can get out of sync. When one of the names changes, the component renders with the old label. The effect catches up and triggers a second render.

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

Calculate the label in setup and it always reflects the names you just received. The compiler caches eligible declarations, so you can usually write the calculation as an ordinary expression and leave memoization to Octane.

```tsrx
'use strong';

export function Label({ first, last }: { first: string; last: string }) @{
	const label = first + ' ' + last;
	<p>{label as string}</p>
}
```

The same reasoning works for a filtered list, a total, or a flag that tells you whether a form is valid. In this picker, the only thing you need to remember is which ID the user chose. Looking up the item in the current list gives you its latest title and handles the case where it's gone.

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

A state value belongs to the render that read it. In this example, `push` changes the array that the current render already holds. Passing that same array to `setTags` won't trigger a render, and the old snapshot is now damaged. A transition or `useOptimistic` that needs to revert to it will get the edited array back.

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

Pass a new array to the setter. Octane can see that the value changed, and the previous snapshot still has its original tags.

```tsrx
'use strong';
import { useState } from 'octane';

export function Tags() @{
	const [tags, setTags] = useState<string[]>([]);
	<button onClick={() => setTags((current) => [...current, 'new'])}>{'Tags: ' + tags.length}</button>
}
```

When the next value depends on the previous one, use the updater form as `Tags` does here. Octane can run an updater or reducer more than once, so keep it pure. If you need to read the clock, make a request, or log something, do that in the handler and pass in any result the update needs.

### Read the latest state with the getter

Both `useState` and `useReducer` give you `[state, update, getState]`. During render, read `state` to get that render's snapshot. In an async handler, the snapshot is still the one from when the handler started, even after an `await`. The getter lets you read the latest scheduled state at that point. Strong reports `OCTANE_STRONG_RENDER_STATE_GETTER_CALL` if you call it during render.

Try clicking the button twice before either save finishes. Both handlers can start with the same count, so the count may only go up by one even though both saves succeeded.

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

Here the updater increments the current count whenever a save finishes. The log then reads the scheduled count with `getSaved()`.

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

The same snapshot rule applies to synchronous code. Calling the setter leaves the local variable holding its original value. If you already know the value you're setting and want to use it again, give it a name once, as in `const next = count + 1; setCount(next); log(next)`.

### Reset editable state with useLinkedState

Suppose someone edits a name and then opens a different user in the same editor. With `useState(user.name)`, the field starts with the first user's name and keeps the local edits even when the `user` prop changes.

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

Use `useLinkedState(source, reconcile)` to say what counts as a new editing session. With `user.id` as the source, the draft survives re-renders for the same user. When the ID changes, the hook picks up the new name in that very render. There's no frame where you see the previous person's draft while an effect catches up.

```tsrx
'use strong';
import { useLinkedState } from 'octane';

type User = { id: string; name: string };

export function NameField({ user }: { user: User }) @{
	const [name, setName] = useLinkedState(user.id, () => user.name);
	<input value={name} onInput={(event) => setName(event.currentTarget.value)} />
}
```

If you want to use a prop just to set the starting value, make that choice explicit. Write `useState(() => user.name)` if you'll edit the value later, or `useInitialValue(() => user.name)` if you only need to read that initial snapshot. Strong reports `OCTANE_STRONG_READ_ONLY_STATE` for `const [value] = useState(…)` when you leave out the setter.

### Put hooks where they belong

If you're used to React's Rules of Hooks, the early return in `Details` may catch your eye. Octane's compiler assigns each hook a slot based on where you call it in the source, so the order of calls can vary. It's fine to put a hook after an early return or inside a condition. Close the details and the hook is skipped. Open them again and `expanded` picks up where it left off.

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

A plain JavaScript `for` or `while` loop would give every iteration the same hook slot, so the compiler rejects slot-keyed hooks there. A keyed `@for` row or a child component gives each item its own scope. `use()` and `useContext` are exempt from the loop restriction.

In a Strong `.tsrx` module, put a hook in the nested `@{ … }` block that uses it (`OCTANE_STRONG_HOOK_LOCALITY`). The same idea applies to a named event handler. Declare it close to the element that uses it (`OCTANE_STRONG_EVENT_HANDLER_LOCALITY`).

### Omit dependency arrays

The compiler can see what your callback reads. Leave out the dependency array on `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, or `useImperativeHandle` and Octane uses those reads as the dependencies. That's the default. If you supply an array yourself, Octane uses it exactly as React would. Passing `null` means "run after every commit."

In a Strong module, leave the array off effects. Strong compares a handwritten effect array with the dependencies it infers and reports `OCTANE_STRONG_EXPLICIT_DEPENDENCIES` if they differ. You can still supply manual arrays to `useMemo` and `useCallback` in Strong.

Finish assigning any values the callback reads before you call the hook. The compiler can't track a value you assign later (`OCTANE_STRONG_UNTRACKED_EFFECT`).

### Use native events and controlled inputs

Octane delegates native DOM events. In a text field, the browser fires `change` when you commit the edit, often as you leave the field. That's a long wait for a search box that should respond as you type.

```tsrx
// Avoid: OCTANE_NATIVE_TEXT_ONCHANGE
'use strong';
import { useState } from 'octane';

export function Search() @{
	const [query, setQuery] = useState('');
	<input value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
}
```

Use `onInput` for each keystroke. For checkboxes, radio buttons, and `<select>`, `onChange` has the usual native behavior. Controlled `value` and `checked` work as they do in React. Use `defaultValue` and `defaultChecked` when you want the browser to manage the input after its initial render.

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

To expose an element to a parent, accept `ref` like any other prop and pass it along to the element. This takes care of the job `forwardRef` does in React. You can pass `ref={object}` or `ref={callback}`, or give the element both a local ref and the parent's with `ref={[a, b]}`.

Read and write `ref.current` in handlers and effects. If you find yourself checking `ref.current` during render to decide whether to create something, use `useLazyRef(() => create())`. The editor below creates its history once and uses it whenever the text changes.

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

Keep changing data close to its owner. Context is useful when several distant branches need to read that same value. `createContext` returns the provider itself, so you render `<Theme value={theme}>` directly. If you're used to `Theme.Provider` or `Consumer` in React, the context itself and the hooks cover both jobs in Octane. A descendant reads the theme with `use(Theme)` or `useContext(Theme)`, including inside a condition.

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

If you come across `createCompiledContext`, `CompiledContext`, or `CompiledOutlet`, those are for compiled routing and binding infrastructure. Use `createContext` in application code.

## Compose components

### Prefer explicit variants to mode flags

It's easy to add one more boolean prop to a component that already takes `isCompact`, `isEditing`, or `isReadOnly`. Each flag doubles the combinations to test, including some you may never have meant to support. The composer below compiles, but what should it do if a caller sets both `isEditing` and `isReply`? The order of the checks happens to decide.

```tsrx
// Avoid: mode flags
export function Composer(props: { isEditing?: boolean; isReply?: boolean; text?: string }) @{
	<form>
		<textarea defaultValue={props.isEditing ? props.text : ''} />
		<button type="submit">{props.isEditing ? 'Save' : props.isReply ? 'Reply' : 'Send'}</button>
	</form>
}
```

Give each job a name. Here `NewMessage`, `EditMessage`, and `Reply` can share a form while choosing their own fields and submit text. When the variants share enough structure to belong in a single component, one discriminated `variant` prop also makes the choices explicit.

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

For a card that wraps some markup, type the prop as `OctaneNode` and render it with `{children}`. Give additional slots their own names. In a Strong module, you can write `header={@{ … }}` directly on the component. The compiler turns that block into a render body without a `() =>` wrapper or an element descriptor. Pass template children through as markup. Inspecting or cloning them requires descriptor children and the generic renderer.

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

If the caller gets to choose a component, pass the component itself, as in `icon={Plus}`. Creating an element with `createElement` would bring in the descriptor API. Strong reports `OCTANE_STRONG_ELEMENT_API` for `createElement`, `cloneElement`, `Children`, and `isValidElement`.

### Introduce context only for shared ownership

A `Tabs.List` and a `Tabs.Panel` both need to know which tab is active. That shared state gives the surrounding `Tabs` a good reason to provide context. When a parent can hand the value directly to a child, a prop makes the relationship easy to follow and test. You can wait until a second caller needs the same arrangement before giving it a wrapper of its own.

## Keep effects for external systems

An effect keeps your component in sync with something outside Octane. That might be a subscription you need to maintain, a timer, a widget from another library, or the title of the document. If you're struggling to name the external system, there's probably a simpler place for the work.

### Handle user actions in the event handler

The reason to send a subscription request is that someone clicked Subscribe. In this version, the click sets a flag, Octane renders again, and an effect eventually notices the flag and sends the request. The timing now depends on when the effect runs. With this pattern, a remount can even repeat work the user only asked for once.

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

The click handler already knows exactly when to send the request. Put the call there and the flag can go away.

```tsrx
'use strong';
import { post } from './api';

export function Subscribe() @{
	<button onClick={() => post('/subscribe')}>Subscribe</button>
}
```

Watch for the same detour across several effects. One sets a state value, which prompts another to run, which may set yet another value (`OCTANE_STRONG_EFFECT_CHAIN`). If the value follows from other inputs, calculate it during render. If the effects are working together to keep an external system in sync, do that work in one place.

### Release what an effect acquires

When an effect adds a listener, starts a timer, installs an observer, or opens a connection, return a cleanup function that releases it. Octane calls the cleanup before running the effect again and when the component unmounts. Strong checks the platform resources it recognizes. Here the listener stays registered even after the badge is gone.

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

For an online badge, the browser already knows the value you want to display. With `useSyncExternalStore`, you can subscribe to both online and offline events, remove both listeners in the cleanup, and supply a snapshot for the server render.

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

Define `subscribe` outside the component so you can reuse the same function across renders. Have `getSnapshot` return the value the store keeps. If it creates a fresh object on every call, each read looks like another change even when the contents are identical (`OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT`).

### Do not fetch render data in an effect

This profile renders an empty name before the effect starts its request. If you switch to another profile while that request is in flight, the response for the first profile can arrive last and overwrite the name you wanted. You'd have to handle cancellation yourself.

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

Read the data during render with `use()`, a Signals `query$`, or an Octane Data read. Here the query follows the profile ID and the `@try` boundary says what to show while the name loads or if the request fails.

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

Sometimes the request is part of keeping an external widget in sync, and an effect is the right place for it. Give the request an `AbortController`, abort it in the cleanup, and check its signal before you update state.

### Read the latest props from an effect with useEffectEvent

A ticker should call the latest `onTick` each second. If a parent passes a different callback halfway through that second, you still want the next tick to happen on time. Wrap the callback in `useEffectEvent` and the interval can keep running as the prop changes. Leave the Effect Event out of the dependency array. Copying the prop into a ref during render would trigger `OCTANE_STRONG_RENDER_REF_WRITE`.

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

When the UI depends on a measurement, copying it into state in a layout effect costs a second render before paint. `useLayoutSnapshot` takes a measurement after each commit and schedules another render only if the result changed. The measurement function should read synchronously and leave the layout untouched.

If several components need to read the layout and then write to the DOM, queue the work with `readLayout` and `writeLayout`. Octane can group the reads and writes so the browser only has to lay out the page once per frame. See [layout phases](https://octanejs.dev/docs/core-apis#layout-phases) for details.

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

If the template renders an element's children, classes, attributes, or styles, change the state that produces them. Writing to the same DOM through a ref gives the template and your code competing ideas of what belongs there (`OCTANE_STRONG_MANAGED_DOM_WRITE`). When you need the element itself, attach a ref where you render it. Strong flags `document.querySelector` for your own markup (`OCTANE_STRONG_OWN_MARKUP_QUERY`). A ref is a good fit for moving focus, measuring an element, or handing an empty container to a third-party widget.

When the HTML comes from outside your app, run it through your application's sanitizer first. Then call `trustHTML` to tell Octane you've applied that policy. The call only marks the value as trusted, so the sanitizing step is essential.

```tsrx
'use strong';
import { trustHTML } from 'octane';
import { sanitize } from './html-policy';

export function Article({ html }: { html: string }) @{
	<article dangerouslySetInnerHTML={trustHTML(sanitize(html))} />
}
```

## Make modules Strong

We recommend writing new Octane modules in Strong mode. By opting in, you're asking the compiler to check that rendering is pure. Given the same immutable snapshot of props, state, context, and signals, the component should produce the same output and leave those inputs alone. The checks run when Octane compiles your code for the client, the server, or the editor. If you've used React's StrictMode, the difference you'll notice is that Strong does its checking entirely at compile time, without calling your code twice or checking which phase it's in at runtime.

### Opt in with the directive or the config

To opt in for one module, put `"use strong"` before the imports at the top of the file. A comment can come first. Any other placement leaves the directive ineffective and produces `OCTANE_STRONG_DIRECTIVE_PLACEMENT`. To opt in across your app, set `compiler: { strong: true }` in `octane.config.ts`. Each dependency still chooses its own mode.

```tsrx
// A comment may precede the directive.
'use strong';
import { useState } from 'octane';

export function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount((current) => current + 1)}>{'Count: ' + count}</button>
}
```

Strong works in `.tsrx`, `.ts`, and `.js` files. If it reaches a `.tsx` or `.jsx` module, you'll see `OCTANE_STRONG_TSX_MODULE`. JSX in those files goes through element descriptors, and Strong needs compiled templates. Convert the module to `.tsrx` before opting in.

### Keep render deterministic

Even this tiny timestamp can cause a hydration mismatch. Time passes between the server render and the first browser render, so `Date.now()` can give you two answers for the same inputs. Random numbers, browser globals, mutable module variables, and a ref's `current` can change between renders too. Keep those reads and any scheduling of work outside render.

```tsrx
// Avoid: OCTANE_STRONG_RENDER_IMPURE_CALL
'use strong';

export function Timestamp() @{
	<time>{String(Date.now())}</time>
}
```

Let the code that owns the timestamp decide what time it represents, then pass that value to the component.

```tsrx
'use strong';

export function Timestamp({ timestamp }: { timestamp: number }) @{
	<time dateTime={new Date(timestamp).toISOString()}>{String(timestamp)}</time>
}
```

You might capture the time when an event happens, when a request comes in, or when an external store takes a snapshot. The server and browser can then render the same timestamp during hydration. When you format a date, specify the locale and time zone so both environments agree (`OCTANE_STRONG_RENDER_LOCALE_FORMAT`). For element IDs, use `useId()`.

The window width is a slightly different case. Only the browser knows it, and it can keep changing after hydration. Reading it directly during render leaves the server without a value to use.

```tsrx
// Avoid: OCTANE_STRONG_RENDER_AMBIENT_READ
'use strong';

export function Layout() @{
	const wide = window.innerWidth > 800;
	<main class={wide ? 'wide' : 'narrow'}>Content</main>
}
```

For a live browser value, subscribe with `useSyncExternalStore` and provide a snapshot the server can use. The [online badge example](#release-what-an-effect-acquires) shows how to set that up.

### Common Strong diagnostics

If you hit a Strong error, there's a link at the end of the message that takes you straight to its entry in the [Strong mode reference](https://octanejs.dev/docs/strong-mode#diagnostic-reference). You can also run `octane explain <CODE>` to read the same entry in your terminal. Here are some of the diagnostics you'll encounter in this guide and what to try when you see them.

| Code | What triggered it | What to try |
| --- | --- | --- |
| `OCTANE_STRONG_EFFECT_STATE_UPDATE` | An effect updates state synchronously during setup | Derive the value or use `useLinkedState` or `useLayoutSnapshot` |
| `OCTANE_STRONG_EFFECT_DATA_FETCH` | An effect updates state after a request it can't cancel | Read with `use()`, `query$`, or Data, or abort the request in the cleanup |
| `OCTANE_STRONG_EFFECT_RESOURCE_LEAK` | A listener, timer, or observer outlives the effect | Release it in the cleanup |
| `OCTANE_STRONG_EFFECT_CHAIN` | One effect reads state that another effect wrote | Derive the value or combine the work in one effect |
| `OCTANE_STRONG_EXPLICIT_DEPENDENCIES` | An effect's dependency array differs from the inferred inputs | Leave out the array |
| `OCTANE_STRONG_UNLINKED_PROP_STATE` | A prop supplies the initial state | Use `useLinkedState` or a lazy initializer |
| `OCTANE_STRONG_SNAPSHOT_MUTATION` | A handler or effect mutates the current state | Pass a new value to the setter |
| `OCTANE_STRONG_STALE_STATE_UPDATE` | A deferred update reads an earlier render's snapshot | Use the updater form or the getter |
| `OCTANE_STRONG_IMPURE_UPDATER` | An updater or reducer has side effects | Move that work into the handler |
| `OCTANE_STRONG_RENDER_STATE_UPDATE` | The component updates state during render | Update it in an event handler or use `useLinkedState` |
| `OCTANE_STRONG_RENDER_REF_READ` | The component reads `ref.current` during render | Use state, `useLazyRef`, or `useLayoutSnapshot` |
| `OCTANE_STRONG_RENDER_IMPURE_CALL` | The component reads the clock or generates a random value during render | Read from props or state, or use `useId()` for an ID |
| `OCTANE_STRONG_RENDER_AMBIENT_READ` | Rendering depends on `window`, `document`, or a similar global | Subscribe with `useSyncExternalStore` |
| `OCTANE_STRONG_INDEX_KEY` | An `@for` uses the row position as its key | Use a stable ID from the item |
| `OCTANE_STRONG_MAP_JSX` | A `.map()` callback returns JSX | Render the rows with `@for` |
| `OCTANE_STRONG_UNTRUSTED_HTML` | The component passes raw HTML to `dangerouslySetInnerHTML` | Sanitize it, then call `trustHTML` |
| `OCTANE_NATIVE_TEXT_ONCHANGE` | A text field uses `onChange` | Use `onInput` for edits as you type |

### Know what the checks prove

Strong works from the source it can see. It can follow a function in the same module, a local alias, or a state tuple, and it recognizes certain platform APIs. When render calls an imported helper or a method on an arbitrary object, Strong assumes the call is pure. Reviewing what actually happens inside that call is up to you, particularly with third-party libraries and compatibility code such as `octane/react`.

Run `tsrx-tsc --noEmit` too. The type checker can answer questions that syntax alone leaves open, such as whether an imported value carries the `TrustedHTML` brand.

You can still choose dependencies by hand for `useMemo` and `useCallback`. The Strong checks on effect arrays are specific to effects.

### Adopt Strong incrementally and keep it

1. Start with `octane analyze --strong-preview`. It shows what the compiler would report if you enabled Strong in the rest of the app.
2. Run `octane analyze --strong-preview --fix` to let the compiler make the changes it knows how to make, such as switching to `useLazyRef`.
3. Add `"use strong"` one module at a time, starting with files that already pass. Convert `.tsx` files to `.tsrx` as you go.
4. Record the remaining exceptions with `octane analyze --strong-baseline init`. CI can then catch a module slipping out of Strong mode (`OCTANE_STRONG_COVERAGE_REGRESSION`).
5. Once every module is Strong, make it the default with `compiler: { strong: true }`. Use `compiler.strongDependencies` and `octane analyze --strong-dependencies` to decide which packages your Strong app may import.

For a walkthrough of the migration, follow the [Strong mode guide](https://octanejs.dev/docs/strong-mode#adopt-strong-mode). If you're looking up a particular diagnostic, the [compiler checks reference](https://github.com/octanejs/octane/blob/main/docs/strong-compiler-checks.md) lists every code.

## Own reactive state with Signals

A signal gives you a handle you can pass around. When you call `.get()` during render, Octane remembers which part of the UI read the value and updates that part when the value changes. This works well when you want fine-grained updates, when components need to share state without a provider, or when you load an async value by key. For state that belongs to one component, `useState` is usually simpler. For a server record that people edit from several screens, see [Octane Data](#share-server-data-with-octane-data). The [Signals guide](https://octanejs.dev/docs/signals) has the full reference.

### Import a Signals entry in every module that reads one

The compiler looks for a runtime import from `octane/signals`, `octane/signals/client`, or `octane/signals/server` in each module that reads a signal during render. That includes `CountLabel` below, even though the handle arrives as a prop. The `$` suffix and the type import tell the reader what `count$` is, but the compiler needs the runtime import to track the read. If you have no named API to import, add `import 'octane/signals';`.

```tsrx
import 'octane/signals';
import type { SignalHandle } from 'octane/signals';

export function CountLabel({ count$ }: { count$: SignalHandle<number> }) @{
	<output>{String(count$.get())}</output>
}
```

### Keep component signals in the component

Use `useSignal$` for a writable signal that belongs to one mounted component. Mount two of these counters and each gets its own count. Keep the `$` on the name of the handle and give the value you read from it a plain name.

```tsrx
import { useSignal$ } from 'octane/signals/client';

export function Counter() @{
	const count$ = useSignal$(0);
	<button onClick={() => count$.set((count) => count + 1)}>{String(count$.get())}</button>
}
```

Where you declare a `signal$` determines who shares it. Inside a component, each instance gets its own signal. At module level, the state is shared across one browser document or one server request. Use `derived$` for a calculation that reads other signals. If your code needs to decide how long a group of signals lives, use `createScope` and dispose of the scope when you're finished with it.

### Load keyed data with query$

A user card needs to load a new record whenever the selected ID changes. With `query$(select, load)`, `select` picks the key and `load` fetches the corresponding value. When the key changes, the query cancels the previous request through its `AbortSignal`. Return `skip` from `select` while there's no user selected. The query stays idle, so check `snapshot().status` before you try to read it.

How should the card look while it loads? Calling `.get()` suspends while the request is pending, which lets a surrounding `@try` show its loading state. With `.latest(fallback)` you can keep the last good value visible while the next one loads. Use `.snapshot()` when you want to branch on the status yourself.

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

Once the card has a value, `refetch()` refreshes it while keeping that value on screen. The Retry button here uses `reset()` for a fresh attempt that can show the pending UI again.

For saves that show an optimistic edit, `action$` and `optimistic$` distinguish a definite failure from an uncertain outcome. A definite failure rolls back the edit. If you're unsure whether the save went through, check with the server before adopting or rejecting it. On the server, give each request a fresh scope. A scope created at module level would share its state across requests.

## Share server data with Octane Data

A book can show up on several screens. When someone marks it as read on one screen, the others should reflect the edit too. `octane/data` handles this kind of shared server data, from individual records and lists to optimistic edits, forms, feeds, and offline persistence. The [Data guide](https://octanejs.dev/docs/data) is a good place to start before writing your first contract. The [Data reference](https://github.com/octanejs/octane/blob/main/docs/data.md) spells out the guarantees.

### Declare contracts in .data.ts modules

A contract describes one operation with `read`, `write`, `view`, `entity`, or `feed`. Export each contract as a `const` in a `*.data.ts` or `*.data.js` file. Both browser and server code import that file, and importing it should only give the caller a description of the operation. Keep the top level to imports, types, and `const` exports. Leave out code that does work at import time and limit imports from server modules to types.

You can declare the serving function alongside its contract, as in `read(options, run)`. The Vite and Rspack plugins strip `run` from the client build. The build can then match each use of a contract to the handler that serves it and report `OCTANE_DATA_CONTRACT_UNHANDLED` if the handler is missing. The `OCTANE_DATA_*` diagnostics come from the Data contract check, which runs independently of Strong mode.

For the build to make that connection, the call needs to name the contract directly, as in `store.read(books)` or `useForm(addBook)`. Here `List` receives a contract through a prop, so the build can't see which read it uses.

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

Let the component name the read itself. If the read needs parameters, pass the data for those parameters as props.

```tsrx
import { useDataStore, useRead } from 'octane/data/octane';
import { books } from './contracts.data.ts';

export function Shelf() @{
	const list = useRead(useDataStore().read(books));
	<p>{'Books: ' + list.length}</p>
}
```

### Provide one store per account and read with useRead

Create a store for each signed-in account and pass it to a `DataProvider` near the root. In the browser, open it with `openDataStore(account)` from `octane/data/client`, which the build generates from your data client, so requests, validation, feeds and the cache stay in the data worker, off the main thread, and the account's tabs share them; keep `createDataStore` for the server, tests and scripts. [Create a store](https://octanejs.dev/docs/data#first-store) has the setup. Key the subtree by account so that someone switching accounts will only see the new account's cache. In the book list, `useRead(handle)` returns the list once it's available. On the first load it suspends, so the surrounding `@try` can show a loading message. On later reloads, the current list stays on screen.

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

If you want to handle loading yourself, pass `{ suspend: false }` to get a snapshot with `status`, `refreshing`, and `stale`. When the user signs out, call `store.retire()` to clear the account's data from memory and the persistent cache. Use `dispose()` when you're finished with one local store and want to keep the durable data.

### Write with optimistic edits

When someone checks off a book, `store.write(contract, input)` applies the edit immediately to every read that shows that book and sends the write exactly once. The checkbox can use the value from the store throughout the save, without an extra "saving" flag in the component. Once the server replies, the store adopts the result or rolls back the edit.

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

If the server refuses the write, the outcome is clear and the store removes the edit. If the reply gets lost, the server may already have saved the change. The store keeps the edit visible and the promise rejects with `DataUncertainError`. Repeating the write could apply it twice. Use a receipt read to find out whether the server applied that `operationId`, then call `store.settle(operationId, applied)`. The store's journal can also do this for you.

If you edit a record while the write that creates it is still unconfirmed, the store waits for the create before sending the later write. You still need to handle the case where the server refuses to create the record.

### Build forms with useForm

Give a write a `form` option and the browser can submit it as a native `POST` before hydration. Once the form hydrates, the store handles the submission and shows the optimistic edit. `useForm` supplies the form attributes and hidden fields, along with `pending`, `values`, `issues`, and `error` for the latest submission. Here the form uses them to keep the title in the field, disable the button during the save, and explain any problem with the submission.

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

On the server, call `handler.forms(request)` before rendering and use a fresh store for each request. Once the render finishes, call `dehydrate()` to get the data for the page's seed, then `retire()` the server store. For views, cursor pages with `usePages`, feeds with `useFeed`, persistence, and sharing across tabs, see the [Data guide](https://octanejs.dev/docs/data).

## Async UI, SSR, and hydration

### Let independent reads start together

Write the `use()` calls in the order that makes the component easy to read. When the compiler can prove that several reads are independent, it starts them together and suspends once for the group. A read that needs an earlier result waits for it. You can skip the `Promise.all` wrapper, which would tie the lifetimes of the reads together.

Each read needs a stable promise across renders. Let your data layer, router, or imported loader keep a promise for each input. Creating a fresh promise each time the component renders would start the work over.

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

Both `fetchProfile` and `fetchPosts` need only the user ID, so they start together. `fetchAvatar` needs `profile.avatarId`, so it waits for the profile.

### Put boundaries where the loading state belongs

Think about how much of the page should show a loading message if one panel is slow. A boundary around the panel lets the rest of the page stay usable, even if the request fails. In a template, `@try` with `@pending` and `@catch` gives you Suspense and an error boundary in one place. The `@catch` arm receives the error and a `reset` function you can wire to a retry button. You can also use the `Suspense` and `ErrorBoundary` components directly.

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

When someone opens the weekly report, they can keep reading the daily report while the new one loads. Wrap the update in a transition and Octane keeps the current UI visible without switching to `@pending`. Octane schedules work at two priorities and runs it without time-slicing. The report still takes just as much work to render, but you get to choose what's on screen in the meantime. Keep typing urgent. If a view is slow to update as the user types, let it lag behind the input with `useDeferredValue`.

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

For form actions, `useActionState`, `useFormStatus`, and `useOptimistic` follow the same contracts as in React. See [responsive updates and actions](https://octanejs.dev/docs/core-apis#responsive-updates) for details. If you need to hide a region and keep its state, use `Activity`. `ViewTransition` can animate a change, and `createPortal` lets you render into another container.

### Load code with lazy

With `lazy(() => import('./Settings.tsrx'))`, the first render of the settings component starts loading its code and suspends until it's ready. Octane's `lazy` also accepts a bare component. If you already know which code or data the next route will need, you can get a head start with the resource hints `preload`, `preinit`, `preloadModule`, and `prefetchDNS`.

### Render the same thing on the server and the client

The first client render adopts the HTML the server sent. Give both renders the same props, state, and server snapshots so they produce the same output. If you get a hydration warning, leave it enabled while you track down and fix the mismatch. The clock, randomness, and browser globals are common culprits, and Strong catches most of those reads. For an external store, give `useSyncExternalStore` a server snapshot. For an ID, use `useId()`.

A mutable value at module level on the server is shared by every request. Create a fresh Data store, Signals scope, or context value for each server render that needs one, and dispose of it when the request is finished.

You can stream the shell while a slower region loads by giving that region a `@try` boundary. For content below the fold, `<Hydrate>` lets the browser defer hydration. See the guides to [SSR](https://github.com/octanejs/octane/blob/main/docs/ssr.md) and [deferred hydration](https://octanejs.dev/docs/core-apis#deferred-hydration).

## Performance, accessibility, and testing

### Measure before memoizing

Before you add `memo`, `useMemo`, or `useCallback`, find out where the time is going. The compiler already caches eligible `const` declarations in setup and memoizes regions of the template. Octane can skip unchanged keyed rows and pure components. In Strong mode, the compiler also caches object, array, and callback declarations that an effect uses, so a fresh identity alone won't cause the effect to run again.

Manual memoization is useful when you can see a cost in a profile or you need a stable identity the compiler can't account for. A value you hand to a library the compiler can't inspect is one example. Use [`octane/profiling`](https://octanejs.dev/docs/profiling) to investigate, then compare the performance before and after your change with data that looks like your users' data.

Aim to do about as much work as the change calls for. Deriving a value in setup saves you from maintaining a cache yourself. Stable keys let a large list keep the rows that are still there. If an expensive calculation only matters when someone clicks a button, move it into the handler. For bundle size, stick to supported package entry points so the bundler can drop unused code.

### Use native semantics first

Octane renders ordinary DOM elements and uses native events, so you can rely on the browser's accessibility features. Use a `<button>` for an action, an `<a href>` for navigation, and a `<label>` for an input. Reach for ARIA when the native elements don't express the meaning you need. Let forms submit natively where possible. A form built with `useForm` can work even before the JavaScript loads. If you need to move focus, use a ref in a handler or effect.

### Test behavior, not implementation

With `@octanejs/testing-library`, you can exercise a component the way someone uses it. Find the control by its role or label, fire a native event, and wait for the result to appear if the update is async. To check server rendering, render the component to a string, hydrate that HTML, and check that the browser adopts the output without errors.

Run `tsrx-tsc --noEmit` for types (`octane-tsc` in this repository), `octane analyze` for Strong coverage and Data contracts, and your bundler's build. If your app uses a router, a form library, or another integration, check the [list of bindings](https://octanejs.dev/docs/bindings). You can host React components with [ReactCompat](https://octanejs.dev/docs/react-compat), which Strong treats as a compatibility boundary.

## Review checklist

- [ ] Values you can calculate from current inputs come straight from setup, with no extra state to keep in sync.
- [ ] Each piece of state has one owner for as long as it's needed, whether that's a component, Signals, Data, or an external store.
- [ ] State updates pass a new value. Deferred updates use the updater form or the getter.
- [ ] Editable state that follows a prop uses `useLinkedState`.
- [ ] Each effect has an external system to keep in sync, lets the compiler infer its dependencies, and cleans up what it acquires.
- [ ] Components read the data they render with `use()`, `query$`, or `useRead` inside a `@try` boundary. They can start the read without waiting for an effect.
- [ ] Each list uses `@for` with a stable ID from the item as its key.
- [ ] Text inputs use `onInput`, refs pass through as props, and `class` combines the values you give it.
- [ ] The server and client render the same output from their inputs. Reads of globals, random values, and the clock happen outside render.
- [ ] Each module is Strong or has an entry in the Strong baseline explaining the exception.
- [ ] Every module that reads a signal has a runtime Signals import.
- [ ] Data contracts live in `*.data.ts` files, and each call names its contract directly. The app settles uncertain writes before considering another attempt.
- [ ] Each server request gets its own state and disposes of it when it's finished.
- [ ] Interactive elements use native controls with labels, and tests find those controls by role and label.

## API coverage

If you're looking up a name in the [package inventory](https://github.com/octanejs/octane/blob/main/docs/packages.md) or the [`octane` entry point](https://github.com/octanejs/octane/blob/main/packages/octane/src/index.ts), this table can point you to the right place. Some APIs have examples and advice here, while others have a separate reference. The advanced APIs are mostly useful if you're writing a library or connecting Octane to another system. The last few rows are for compatibility, compiler output, and tests, and fall outside what you'd use in new application code.

| Family | Names | Where to look |
| --- | --- | --- |
| State | `useState`, `useReducer`, `useLinkedState`, `useInitialValue` | Covered here |
| Effects and refs | `useEffect`, `useLayoutEffect`, `useEffectEvent`, `useRef`, `useLazyRef`, `useSyncExternalStore`, `useLayoutSnapshot` | Covered here |
| Layout phases | `readLayout`, `writeLayout`, `flushLayoutSync`, `getPhase`, `createResizeObserver` | [Core APIs](https://octanejs.dev/docs/core-apis#layout-phases) |
| Memoization | `useMemo`, `useCallback`, `memo` | Covered here |
| Context | `createContext`, `use`, `useContext` | Covered here |
| Async UI | `use`, `Suspense`, `ErrorBoundary`, `lazy` | Covered here |
| Transitions and actions | `useTransition`, `startTransition`, `useDeferredValue`, `useActionState`, `useFormStatus`, `useOptimistic` | Covered here with a link to the reference |
| Composition | `Fragment`, `createPortal`, `Activity`, `ViewTransition`, `useId`, `useImperativeHandle` | [Core APIs](https://octanejs.dev/docs/core-apis) |
| HTML trust | `trustHTML` | Covered here |
| Roots and hydration | `createRoot`, `hydrateRoot`, `Hydrate` | [Core APIs](https://octanejs.dev/docs/core-apis#roots-and-rendering) |
| Resource hints | `preload`, `preinit`, `preloadModule`, `preinitModule`, `preconnect`, `prefetchDNS` | See the Core APIs reference |
| Signals | `signal$`, `derived$`, `query$`, `skip`, `useSignal$`, `createScope`, `action$`, `optimistic$` | Covered here, with the full list in [Signals](https://octanejs.dev/docs/signals#reference) |
| Data | `read`, `write`, `view`, `entity`, `feed`, `createDataStore`, `DataProvider`, `useDataStore`, `useRead`, `usePages`, `useForm`, `useFeed` | Covered here, with the full list in [Data](https://octanejs.dev/docs/data#reference) |
| Behavior roots | `attachBehaviorRoot`, `captureFormSubmissions` | Advanced usage in [Core APIs](https://octanejs.dev/docs/core-apis#behavior-only-roots) |
| Compiled context | `createCompiledContext`, `CompiledContext`, `CompiledOutlet` | Advanced APIs for routing and binding infrastructure |
| Descriptor elements | `createElement`, `cloneElement`, `isValidElement`, `Children`, `descriptorChildren` | Advanced APIs for interop, rejected in Strong |
| React compatibility | `flushSync`, `StrictMode`, `unstable_batchedUpdates` | For compatibility with existing code, rejected in Strong |
| Compiler ABI | Tier 2 of `packages/octane/src/index.ts`, such as `template` and `bag0` | For compiler output only |
| Test hooks | Tier 3 of `packages/octane/src/index.ts`, such as `drainPassiveEffects` | For repository tests only |

For the precise behavior of an API, the implementation in the package is the reference. We update the relevant section and its examples alongside changes to an API or diagnostic. The guide's tests catch examples that stop compiling and diagnostic codes the compiler no longer defines.

## Sources and attribution

The questions in this guide and the idea of teaching through pairs of examples come from the public React resources below. All the explanations and code examples are original to this guide and written for Octane.

- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure), [Keeping Components Pure](https://react.dev/learn/keeping-components-pure), and [Rendering Lists](https://react.dev/learn/rendering-lists) from [React Learn](https://react.dev/learn) (CC BY 4.0).
- The [eslint-plugin-react-hooks reference](https://react.dev/reference/eslint-plugin-react-hooks), compared against Octane's own Strong diagnostics.
- Vercel's [React Best Practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) and [composition patterns](https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns) agent skills (MIT).

For Octane-specific behavior, the authoritative references are [TSRX basics](https://github.com/octanejs/octane/blob/main/docs/tsrx-basics.md), [Differences from React](https://octanejs.dev/docs/differences-from-react), [Strong mode](https://octanejs.dev/docs/strong-mode), [Signals](https://octanejs.dev/docs/signals), [Data](https://octanejs.dev/docs/data), and [SSR](https://github.com/octanejs/octane/blob/main/docs/ssr.md).
