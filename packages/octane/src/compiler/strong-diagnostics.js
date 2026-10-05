// The catalog of Strong diagnostics: what each code detects, what replaces the
// rejected pattern, and migration recipes for React idioms Strong rejects.
//
// It is data only and nothing in the compiler imports it. `pnpm sync`
// (scripts/generate-strong-diagnostics.mjs) renders it into the website's
// Strong mode page, docs/strong-compiler-checks.md, llms.txt, the MCP server,
// and the CLI's `octane explain`. tests/compiler/strong-diagnostics-catalog.test.ts
// keeps it exhaustive: every code the compiler or CLI can report has an entry,
// and every recipe's `before` reports its codes while its `after` compiles.
//
// Text is Markdown. Recipe sources are complete `.tsx` modules without the
// `"use strong"` directive, which the test and the renderers add.

/** @typedef {'effects' | 'state' | 'render' | 'templates' | 'dom' | 'coverage'} StrongSectionId */

/**
 * @typedef {Object} StrongDiagnostic
 * @property {string} code
 * @property {StrongSectionId} section
 * @property {'error' | 'hint'} severity the strongest severity the code reports
 * @property {string} detects
 * @property {string} replacement
 * @property {readonly string[]} [primitives] Octane APIs the replacement names
 */

/**
 * @typedef {Object} StrongRecipe
 * @property {string} id
 * @property {string} title
 * @property {string} react the rejected idiom, in one line
 * @property {string} strong its replacement, in one line
 * @property {readonly string[]} codes every error code `before` reports
 * @property {string} before
 * @property {string} after
 * @property {string} note
 */

/** @type {readonly { id: StrongSectionId, title: string }[]} */
export const STRONG_DIAGNOSTIC_SECTIONS = [
	{ id: 'effects', title: 'Effects, state, and dependencies' },
	{ id: 'state', title: 'State values, updaters, and subscriptions' },
	{ id: 'render', title: 'Render snapshots and determinism' },
	{ id: 'templates', title: 'Lists, templates, and compatibility APIs' },
	{ id: 'dom', title: 'DOM ownership and trusted HTML' },
	{ id: 'coverage', title: 'Coverage' },
];

/** @type {readonly StrongDiagnostic[]} */
export const STRONG_DIAGNOSTICS = [
	{
		code: 'OCTANE_STRONG_EFFECT_STATE_UPDATE',
		section: 'effects',
		severity: 'error',
		detects:
			'Effect setup calls a state updater synchronously. This includes updaters and callbacks returned by same-module custom hooks, and callbacks that run before the next paint: `startTransition`, a `useTransition` start function, `queueMicrotask`, `.then`/`.catch`/`.finally` on `Promise.resolve(value)` or `Promise.reject()`, `setTimeout` without a positive delay, and code after an `await` that resumes without waiting on any path, such as `await null` or `await (flag ? load() : null)`.',
		replacement:
			'Derive the value during render, or use `useLinkedState` when state follows another value. When the effect copies a measurement of the committed DOM into state, render from `useLayoutSnapshot` instead. `requestAnimationFrame`, timers with a positive delay, and external subscription callbacks remain event-driven.',
		primitives: ['useLinkedState', 'useLayoutSnapshot'],
	},
	{
		code: 'OCTANE_STRONG_REF_STATE_UPDATE',
		section: 'effects',
		severity: 'error',
		detects:
			"A host element's callback ref calls a state updater synchronously: an inline or local function, a state setter passed as the ref, or a function in a `ref={[...]}` list. Octane calls a callback ref while the element commits, before paint, so it follows the effect setup rules, and callbacks that run before the next paint, such as `startTransition`, `queueMicrotask`, and `setTimeout` without a positive delay, count too. A component's `ref` prop is not checked, because the component decides when to call it.",
		replacement:
			'Pass a ref object to keep the element, and read it from effects and event handlers. When the callback copies a measurement of the element into state, render from `useLayoutSnapshot` instead. `requestAnimationFrame`, timers with a positive delay, and observer or listener callbacks the ref attaches remain event-driven.',
		primitives: ['useRef', 'useLayoutSnapshot'],
	},
	{
		code: 'OCTANE_STRONG_EFFECT_DATA_FETCH',
		section: 'effects',
		severity: 'error',
		detects:
			'A state update runs after an `await`, or in a `.then`, `.catch`, or `.finally` callback, of work the effect started, and the returned cleanup does not provably cancel or ignore it. An async effect callback returns a promise, so it cannot return cleanup.',
		replacement:
			'Read asynchronous render data with `use()` or a query binding. For external synchronization, abort an `AbortController` whose `signal` is passed to the request, or set a flag declared in the effect from its cleanup and check it before the update.',
		primitives: ['use'],
	},
	{
		code: 'OCTANE_STRONG_EFFECT_HIDDEN_DEPENDENCY',
		section: 'effects',
		severity: 'error',
		detects:
			'Synchronous effect setup calls a state getter, reads `current` from a value ref, or reads a reassigned module `let` or `var`. None of these is an inferred dependency, so the effect does not re-run when they change.',
		replacement:
			'Read the render snapshot, or move the non-reactive read into a `useEffectEvent` callback. Octane never double-invokes effects, so first-run and `didInit` guards are unnecessary.',
		primitives: ['useEffectEvent'],
	},
	{
		code: 'OCTANE_STRONG_EFFECT_RESOURCE_LEAK',
		section: 'effects',
		severity: 'error',
		detects:
			'Effect setup acquires a platform listener, timer, observer, connection, or geolocation watch that the returned cleanup does not release. A `useLayoutSnapshot` measurement is checked like effect setup, but its return value is the snapshot, so it can never release one.',
		replacement:
			'Release it in the returned cleanup. Acquire resources for a snapshot in a separate effect.',
	},
	{
		code: 'OCTANE_STRONG_LAYOUT_SNAPSHOT_ASYNC',
		section: 'effects',
		severity: 'error',
		detects:
			'A `useLayoutSnapshot` measurement is an `async` or generator function. It returns a new promise or iterator on every commit, so the snapshot never converges.',
		replacement:
			'Return the measurement synchronously, and read asynchronous render data with `use()` or a query binding.',
		primitives: ['useLayoutSnapshot', 'use'],
	},
	{
		code: 'OCTANE_STRONG_EFFECT_CHAIN',
		section: 'effects',
		severity: 'error',
		detects:
			"An effect reads state written by another effect's own execution or promise continuation in the same component.",
		replacement:
			'Derive the value during render, use `useLinkedState`, or combine the external synchronization in one effect. External subscription and timer callbacks remain event-driven updates.',
		primitives: ['useLinkedState'],
	},
	{
		code: 'OCTANE_STRONG_UNLINKED_PROP_STATE',
		section: 'effects',
		severity: 'error',
		detects:
			'An eager `useState` initializer or two-argument `useReducer` initial state is derived from component props.',
		replacement:
			'Use `useLinkedState(source, reconcile)` for state that follows a source. Use `useState(() => initialValue)` or an explicit third `useReducer` initializer for a deliberate initial capture.',
		primitives: ['useLinkedState'],
	},
	{
		code: 'OCTANE_STRONG_EXPLICIT_DEPENDENCIES',
		section: 'effects',
		severity: 'error',
		detects:
			"An explicit dependency argument differs from the compiler's inferred inputs, or cannot be proven equivalent. An array the compiler proves equivalent is reported as a **hint** instead, and its authored behavior is preserved.",
		replacement: 'Omit the dependency argument.',
	},
	{
		code: 'OCTANE_STRONG_UNTRACKED_EFFECT',
		section: 'effects',
		severity: 'error',
		detects:
			'A built-in dependency hook receives `null` dependencies, or omits them while its callback reads a binding declared after the hook, or a variable the component assigns after the hook or from a nested function. Inference cannot read that value where the hook is called, so the hook would run on every render.',
		replacement:
			'Omit the argument so the compiler tracks reactive inputs. Declare and finish assigning what the hook reads before calling it, or keep a changing value in state or a ref.',
	},
	{
		code: 'OCTANE_STRONG_MANUAL_MEMO',
		section: 'effects',
		severity: 'error',
		detects: "A call to Octane's `useMemo` or `useCallback`, including known import aliases.",
		replacement:
			'Write a normal calculation or callback declaration and let Strong compilation cache eligible declarations. `octane analyze --fix` rewrites `useMemo(() => value, deps)` to `value` and `useCallback(fn, deps)` to `fn`.',
	},
	{
		code: 'OCTANE_STRONG_EFFECT_EVENT_DEPENDENCY',
		section: 'effects',
		severity: 'error',
		detects: 'A statically known Effect Event is listed in an explicit hook dependency array.',
		replacement: 'Remove it. Effect Events are non-reactive, so they never belong in dependencies.',
		primitives: ['useEffectEvent'],
	},
	{
		code: 'OCTANE_STRONG_AUTOMATIC_MEMO_UNSUPPORTED',
		section: 'effects',
		severity: 'error',
		detects:
			'A module compiled through the `manualSlots` integration option has a declaration Strong compilation would cache. That option cannot allocate the extra hook slots the cache needs.',
		replacement:
			'Compile the module through the normal Octane integration, or keep it in compatibility mode.',
	},
	{
		code: 'OCTANE_STRONG_IMPURE_UPDATER',
		section: 'state',
		severity: 'error',
		detects:
			'A `useState` or `useLinkedState` updater, a `useReducer` reducer, or a `useOptimistic` reducer calls `fetch`, schedules a timer, microtask, or promise callback, updates state, calls a state getter or Effect Event, reads or writes `useRef.current`, reads a browser global or reassigned module variable, or calls `Date.now()`, `Math.random()`, `performance.now()`, or `new Date()`. Octane can run updaters and reducers more than once.',
		replacement:
			'Do the side effect or nondeterministic read in the event handler, effect, or Action, and pass its result in: `const now = Date.now(); setValue((current) => current + now)`.',
	},
	{
		code: 'OCTANE_STRONG_SNAPSHOT_MUTATION',
		section: 'state',
		severity: 'error',
		detects:
			"A state value is mutated outside render: in an event handler, effect, cleanup, deferred callback, or an updater or reducer's own state argument. Covers assignments, updates, `delete`, destructuring targets, `Object.assign` and `Reflect.set`-style targets, array mutators on state initialized with an array literal, and `Map`/`Set` mutators on state created with `new Map()` or `new Set()`.",
		replacement:
			'Pass a new value, for example `setItems([...items, item])` or `setItems((current) => [...current, item])`. Keep mutable objects in `useRef`, or create one with `useLazyRef`.',
		primitives: ['useLazyRef'],
	},
	{
		code: 'OCTANE_STRONG_STALE_STATE_UPDATE',
		section: 'state',
		severity: 'error',
		detects:
			'After an `await`, or in a timer or promise callback, a setter or dispatch argument reads the render snapshot of the same state, including through a local computed from it, a copied alias, or a closure.',
		replacement:
			'Use the updater form, `setValue((current) => current + 1)`, compute from the state a reducer receives, or read the latest value with the state getter (the third tuple member).',
	},
	{
		code: 'OCTANE_STRONG_WRITE_ONLY_STATE',
		section: 'state',
		severity: 'error',
		detects:
			'A state tuple whose value is elided, unused, or read only to compute its own next value, whose getter is absent or unused, and whose setter is used. This is the force-update pattern, including `useReducer((x) => x + 1, 0)` and `useState(0)[1]`.',
		replacement:
			'Subscribe with `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` and render its snapshot, or remove the unused state.',
		primitives: ['useSyncExternalStore'],
	},
	{
		code: 'OCTANE_STRONG_UNCACHED_STORE_SNAPSHOT',
		section: 'state',
		severity: 'error',
		detects:
			'Every return of a `useSyncExternalStore` `getSnapshot` or `getServerSnapshot` provably allocates: an object or array literal, `.map()`, `.filter()`, or another array copy, `Object.keys()`-style results, a standard constructor, or a same-module function or local constant that does so.',
		replacement:
			'Return a value the store keeps, such as its current state object, or read each field with its own `useSyncExternalStore` call.',
		primitives: ['useSyncExternalStore'],
	},
	{
		code: 'OCTANE_STRONG_RENDER_STATE_UPDATE',
		section: 'render',
		severity: 'error',
		detects:
			'A `useState`, `useReducer`, or `useLinkedState` updater is called during render, including inside callbacks that known array methods run synchronously.',
		replacement:
			'Update state in an event handler, or use `useLinkedState` when state needs to reset or change with another value.',
		primitives: ['useLinkedState'],
	},
	{
		code: 'OCTANE_STRONG_RENDER_STATE_GETTER_CALL',
		section: 'render',
		severity: 'error',
		detects:
			'A known third-tuple state getter is called during render. It can return scheduled state that differs from the render snapshot.',
		replacement:
			'Render from the first tuple member. Call the getter in an event, effect, or deferred callback for the latest scheduled state.',
	},
	{
		code: 'OCTANE_STRONG_RENDER_REF_READ',
		section: 'render',
		severity: 'error',
		detects:
			"A `useRef` or `useLazyRef` object's `current` is read during render, including React's lazy initialization test `if (ref.current === null)`.",
		replacement:
			'Read the ref in an event or effect, or render from state or `useLinkedState`. Create a value once with `useLazyRef(() => value)`, and render from a DOM measurement with `useLayoutSnapshot`. Pass the ref itself to a `ref` prop as usual.',
		primitives: ['useLazyRef', 'useLayoutSnapshot', 'useLinkedState'],
	},
	{
		code: 'OCTANE_STRONG_RENDER_REF_WRITE',
		section: 'render',
		severity: 'error',
		detects:
			"A `useRef` object's `current` is assigned during render, including React's lazy initialization `ref.current = create()` and `ref.current ??= create()`, and the latest-value pattern `latest.current = value`.",
		replacement:
			'Create a value once with `useLazyRef(() => create())`. Read the latest props or state from an effect with `useEffectEvent`. Otherwise move the write to an event or effect, or express the value as state. `octane analyze --fix` rewrites the lazy initialization idiom.',
		primitives: ['useLazyRef', 'useEffectEvent'],
	},
	{
		code: 'OCTANE_STRONG_RENDER_MODULE_STATE_READ',
		section: 'render',
		severity: 'error',
		detects:
			'A reassigned module-scope `let` or `var` is read during render. It can change without a witnessed render input.',
		replacement:
			'Move the changing value into state or context, or pass an immutable snapshot as a prop.',
	},
	{
		code: 'OCTANE_STRONG_RENDER_AMBIENT_READ',
		section: 'render',
		severity: 'error',
		detects:
			'Unshadowed `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `location`, or `matchMedia` is read during render, including `typeof` guards and constant browser handle aliases, and `globalThis` properties other than standard language builtins.',
		replacement:
			'Subscribe with `useSyncExternalStore` and a server snapshot for live browser state. Read a one-time value in an effect or a lazy `useState` initializer; lazy initializers also run during server rendering, so guard browser APIs there and keep server and client output the same.',
		primitives: ['useSyncExternalStore'],
	},
	{
		code: 'OCTANE_STRONG_RENDER_SNAPSHOT_MUTATION',
		section: 'render',
		severity: 'error',
		detects: 'A provable state snapshot is mutated during render.',
		replacement: 'Derive a local copy, or pass a new value to the state updater from an event.',
	},
	{
		code: 'OCTANE_STRONG_RETAINED_ROW_MUTATION',
		section: 'render',
		severity: 'error',
		detects:
			'A retained keyed `@for` row mutates a binding declared outside that row. A retained row does not re-run when its item is unchanged.',
		replacement:
			'Build mutable data before the `@for`, or derive each row only from its item. Fresh setup-local and row-local scratch data remain valid.',
	},
	{
		code: 'OCTANE_STRONG_RENDER_IMPURE_CALL',
		section: 'render',
		severity: 'error',
		detects:
			'Unshadowed `Date.now()`, `Math.random()`, `performance.now()`, `Date()`, `new Date()`, `crypto.randomUUID()`, or `crypto.getRandomValues()` during render, including inside callbacks that known array methods run synchronously. A `key` or `@for` key built from one of these gets its own message.',
		replacement:
			'Read time or randomness in an event handler or effect and store the result in state, or pass it in as a prop. Use `useId()` for element IDs. Give each list item a stable ID from its data, such as `item.id`.',
		primitives: ['useId'],
	},
	{
		code: 'OCTANE_STRONG_RENDER_LOCALE_FORMAT',
		section: 'render',
		severity: 'error',
		detects:
			'During render, `toLocaleString()`, `toLocaleDateString()`, or `toLocaleTimeString()` on a provable `Date` without both a locale and a visible `timeZone` option; `toString()` or `toTimeString()` on a provable `Date`; an `Intl` service constructed without a locale (a `DateTimeFormat` also needs a `timeZone`); or a call on a module-level formatter created that way.',
		replacement:
			"Pass an explicit locale and time zone, for example `toLocaleString('en-US', { timeZone: 'UTC' })` or `new Intl.DateTimeFormat(locale, { timeZone })`. Otherwise format in an event or effect and render the stored text.",
	},
	{
		code: 'OCTANE_STRONG_RENDER_SIDE_EFFECT',
		section: 'render',
		severity: 'error',
		detects:
			'Unshadowed `setTimeout()`, `setInterval()`, `queueMicrotask()`, `requestAnimationFrame()`, or `requestIdleCallback()` during render, directly, on `window` or `globalThis`, or through an unreassigned alias. Lazy state and ref initializers are part of render for this check.',
		replacement:
			'Schedule the work from an event handler, or from an effect that cancels it in cleanup. Defining a callback that schedules later stays valid; calling it during render does not.',
	},
	{
		code: 'OCTANE_STRONG_RENDER_EFFECT_EVENT_CALL',
		section: 'render',
		severity: 'error',
		detects: 'A statically known `useEffectEvent` result is called during render.',
		replacement: 'Call it from an effect, or from a later event or subscription callback.',
		primitives: ['useEffectEvent'],
	},
	{
		code: 'OCTANE_STRONG_MAP_JSX',
		section: 'templates',
		severity: 'error',
		detects: 'In `.tsrx`, a `.map()` callback returns JSX, including known local callback aliases.',
		replacement:
			'Use `@for` with a stable item key. Data-only mapping and keyed JSX mapping in `.tsx` remain valid.',
	},
	{
		code: 'OCTANE_STRONG_INDEX_KEY',
		section: 'templates',
		severity: 'error',
		detects:
			'An `@for` key uses the loop position as its identity, including arithmetic or text derived from the index.',
		replacement:
			'Use an item ID that survives insertion, removal, and reordering. Looking up an item ID, such as `items[index].id`, remains valid.',
	},
	{
		code: 'OCTANE_STRONG_HOOK_LOCALITY',
		section: 'templates',
		severity: 'error',
		detects:
			'In `.tsrx`, a built-in hook value, or an effect that depends on it, is declared outside the sole nested `@{…}` block that uses it.',
		replacement:
			'Move the hook into that block, before the JSX or local effect that uses its value. Hooks used only by conditional, keyed, switch, or try arms may stay in the parent scope to keep that lifetime.',
	},
	{
		code: 'OCTANE_STRONG_EVENT_HANDLER_LOCALITY',
		section: 'templates',
		severity: 'error',
		detects:
			'In `.tsrx`, a named native event handler is declared outside the sole deeper nested `@{…}` block that contains its direct `onX` use.',
		replacement: 'Move the handler into that block, before the JSX that uses it, or inline it.',
	},
	{
		code: 'OCTANE_STRONG_DIRECTIVE_PLACEMENT',
		section: 'templates',
		severity: 'error',
		detects:
			'`"use strong"` appears somewhere other than the module\'s directive prologue, such as inside a function or after an import. It applies to a whole module, so the misplaced directive enables nothing.',
		replacement: 'Move `"use strong"` to the top of the file, before imports or other code.',
	},
	{
		code: 'OCTANE_STRONG_SUPPRESSION_PROP',
		section: 'templates',
		severity: 'error',
		detects:
			'A DOM intrinsic uses `suppressHydrationWarning` or `suppressNativeChangeWarning`, including statically visible object spreads.',
		replacement:
			'Fix the mismatch or use the intended native event. Component props with these names are unaffected.',
	},
	{
		code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
		section: 'templates',
		severity: 'error',
		detects:
			'A native text `onChange` handler, which fires on blur rather than per edit. The compatibility-mode warning is an error in Strong mode.',
		replacement:
			'Use `onInput` for per-edit changes. Native checkbox, radio, and select `onChange` semantics stay valid.',
	},
	{
		code: 'OCTANE_STRONG_COMPAT_IMPORT',
		section: 'templates',
		severity: 'error',
		detects:
			'Imports or known namespace accesses for `flushSync`, `unstable_batchedUpdates`, or `StrictMode` from `octane`.',
		replacement: 'Use normal Octane scheduling and component semantics.',
	},
	{
		code: 'OCTANE_STRONG_MANAGED_DOM_WRITE',
		section: 'dom',
		severity: 'error',
		detects:
			'A write through a ref to what the template owns on its element: its children, its class, an attribute it sets, or a `style` property it sets.',
		replacement: 'Render the value from state or props in the template.',
	},
	{
		code: 'OCTANE_STRONG_RAW_HTML_WRITE',
		section: 'dom',
		severity: 'error',
		detects:
			'`innerHTML`, `outerHTML`, `insertAdjacentHTML()`, or `setHTMLUnsafe()` on an element Octane renders.',
		replacement:
			'Use `dangerouslySetInnerHTML={trustHTML(html)}` for trusted or already sanitized HTML.',
		primitives: ['trustHTML'],
	},
	{
		code: 'OCTANE_STRONG_OWN_MARKUP_QUERY',
		section: 'dom',
		severity: 'error',
		detects:
			'`document.getElementById()`, `querySelector()`, `querySelectorAll()`, or `getElementsByClassName()` with a literal selector that matches a literal `id` or class rendered by the same component.',
		replacement: 'Attach a ref to the element and use `ref.current` in the event or effect.',
	},
	{
		code: 'OCTANE_STRONG_UNTRUSTED_HTML',
		section: 'dom',
		severity: 'error',
		detects: "A visibly raw value is passed to a Strong DOM intrinsic's `dangerouslySetInnerHTML`.",
		replacement:
			"Pass `trustHTML(html)` after applying the application's sanitization policy. `trustHTML` marks trust and does not sanitize.",
		primitives: ['trustHTML'],
	},
	{
		code: 'OCTANE_STRONG_COVERAGE_REGRESSION',
		section: 'coverage',
		severity: 'error',
		detects:
			"`octane analyze` with an `octane-strong-baseline.json`: a module compiles without Strong mode and is not listed. It is new, or it lost its directive or moved out of `compiler.strong`'s reach.",
		replacement:
			'Add `"use strong"` before its imports, or enable `compiler.strong`, and fix what Strong then reports.',
	},
	{
		code: 'OCTANE_STRONG_COVERAGE_STALE',
		section: 'coverage',
		severity: 'error',
		detects:
			'A module listed in `octane-strong-baseline.json` is now Strong, no longer exists, or is no longer compiled by Octane. A stale name would let that module leave Strong mode again unnoticed.',
		replacement: 'Run `octane analyze --strong-baseline update`.',
	},
];

/** @type {readonly StrongRecipe[]} */
export const STRONG_RECIPES = [
	{
		id: 'lazy-ref',
		title: 'Create a value once',
		react: 'if (ref.current === null) ref.current = new Store();',
		strong: 'const ref = useLazyRef(() => new Store());',
		codes: ['OCTANE_STRONG_RENDER_REF_READ', 'OCTANE_STRONG_RENDER_REF_WRITE'],
		before: `import { useRef } from 'octane';
import { Store } from './store';

export function Cart() {
	const store = useRef<Store | null>(null);
	if (store.current === null) store.current = new Store();
	return <button onClick={() => store.current?.add()}>Add</button>;
}
`,
		after: `import { useLazyRef } from 'octane';
import { Store } from './store';

export function Cart() {
	const store = useLazyRef(() => new Store());
	return <button onClick={() => store.current.add()}>Add</button>;
}
`,
		note: '`useLazyRef` runs its factory once, when the hook cell is created, and keeps the ref on later renders. The factory follows the rules of a lazy `useState` initializer. `octane analyze --fix` applies this rewrite when the `useRef` declaration directly precedes the `if`.',
	},
	{
		id: 'layout-measurement',
		title: 'Render from a DOM measurement',
		react: 'useLayoutEffect(() => setWidth(el.current.offsetWidth));',
		strong: 'const width = useLayoutSnapshot(() => el.current?.offsetWidth ?? 0, { initial: 0 });',
		codes: ['OCTANE_STRONG_EFFECT_STATE_UPDATE'],
		before: `import { useLayoutEffect, useRef, useState } from 'octane';

export function Label({ text }: { text: string }) {
	const el = useRef<HTMLSpanElement>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		setWidth(el.current?.offsetWidth ?? 0);
	});
	return <span ref={el}>{text + ' (' + width + 'px)'}</span>;
}
`,
		after: `import { useLayoutSnapshot, useRef } from 'octane';

export function Label({ text }: { text: string }) {
	const el = useRef<HTMLSpanElement>(null);
	const width = useLayoutSnapshot(() => el.current?.offsetWidth ?? 0, { initial: 0 });
	return <span ref={el}>{text + ' (' + width + 'px)'}</span>;
}
`,
		note: '`useLayoutSnapshot` measures after each commit and re-renders before paint only when the value changes. `initial` is the value for the first render and for server rendering. It does not observe later resizes: subscribe to those with an observer in an effect.',
	},
	{
		id: 'ref-measurement',
		title: 'Measure an element from a callback ref',
		react: '<span ref={(el) => { if (el) setWidth(el.offsetWidth); }}>',
		strong: 'const width = useLayoutSnapshot(() => el.current?.offsetWidth ?? 0, { initial: 0 });',
		codes: ['OCTANE_STRONG_REF_STATE_UPDATE'],
		before: `import { useState } from 'octane';

export function Label({ text }: { text: string }) {
	const [width, setWidth] = useState(0);
	return (
		<span
			ref={(el) => {
				if (el) setWidth(el.offsetWidth);
			}}
		>
			{text + ' (' + width + 'px)'}
		</span>
	);
}
`,
		after: `import { useLayoutSnapshot, useRef } from 'octane';

export function Label({ text }: { text: string }) {
	const el = useRef<HTMLSpanElement>(null);
	const width = useLayoutSnapshot(() => el.current?.offsetWidth ?? 0, { initial: 0 });
	return <span ref={el}>{text + ' (' + width + 'px)'}</span>;
}
`,
		note: 'A callback ref runs while the element commits, so a state update there renders the component a second time before paint. `useLayoutSnapshot` reads the element after layout on every commit and re-renders only when the measurement changes. To follow resizes that happen without a commit, attach a `ResizeObserver` from the ref or an effect; its callback may update state.',
	},
	{
		id: 'manual-memo',
		title: 'Drop useMemo and useCallback',
		react: 'const total = useMemo(() => sum(items), [items]);',
		strong: 'const total = sum(items);',
		codes: ['OCTANE_STRONG_MANUAL_MEMO'],
		before: `import { useCallback, useMemo } from 'octane';

export function Total({ items, onPick }: { items: number[]; onPick: (total: number) => void }) {
	const total = useMemo(() => items.reduce((sum, item) => sum + item, 0), [items]);
	const pick = useCallback(() => onPick(total), [onPick, total]);
	return <button onClick={pick}>{String(total)}</button>;
}
`,
		after: `export function Total({ items, onPick }: { items: number[]; onPick: (total: number) => void }) {
	const total = items.reduce((sum, item) => sum + item, 0);
	const pick = () => onPick(total);
	return <button onClick={pick}>{String(total)}</button>;
}
`,
		note: 'Strong production builds memoize render calculations from their inputs, and eligible callbacks keep a stable identity in every build until their inferred inputs change. `octane analyze --fix` applies this rewrite.',
	},
	{
		id: 'latest-ref',
		title: 'Read the latest props from an effect',
		react: 'const latest = useRef(onTick); latest.current = onTick;',
		strong: 'const tick = useEffectEvent(onTick);',
		codes: ['OCTANE_STRONG_RENDER_REF_WRITE'],
		before: `import { useEffect, useRef } from 'octane';

export function Ticker({ onTick }: { onTick: () => void }) {
	const latest = useRef(onTick);
	latest.current = onTick;
	useEffect(() => {
		const id = setInterval(() => latest.current(), 1000);
		return () => clearInterval(id);
	}, []);
	return <span>Ticking</span>;
}
`,
		after: `import { useEffect, useEffectEvent } from 'octane';

export function Ticker({ onTick }: { onTick: () => void }) {
	const tick = useEffectEvent(onTick);
	useEffect(() => {
		const id = setInterval(() => tick(), 1000);
		return () => clearInterval(id);
	});
	return <span>Ticking</span>;
}
`,
		note: 'An Effect Event always calls the latest `onTick` without making the effect depend on it.',
	},
	{
		id: 'prop-state',
		title: 'Keep editable state in sync with a prop',
		react: 'useEffect(() => setName(user.name), [user.name]);',
		strong: 'const [name, setName] = useLinkedState(user.id, () => user.name);',
		codes: ['OCTANE_STRONG_EFFECT_STATE_UPDATE'],
		before: `import { useEffect, useState } from 'octane';

export function NameField({ user }: { user: { id: string; name: string } }) {
	const [name, setName] = useState('');
	useEffect(() => {
		setName(user.name);
	});
	return <input value={name} onInput={(event) => setName(event.currentTarget.value)} />;
}
`,
		after: `import { useLinkedState } from 'octane';

export function NameField({ user }: { user: { id: string; name: string } }) {
	const [name, setName] = useLinkedState(user.id, () => user.name);
	return <input value={name} onInput={(event) => setName(event.currentTarget.value)} />;
}
`,
		note: '`useLinkedState` resets the editable value in the same render whenever its source changes, so there is no frame with the stale value.',
	},
	{
		id: 'browser-state',
		title: 'Render live browser state',
		react: 'const wide = window.innerWidth > 800;',
		strong: 'const wide = useSyncExternalStore(subscribe, getWide, () => false);',
		codes: ['OCTANE_STRONG_RENDER_AMBIENT_READ'],
		before: `export function Layout() {
	const wide = window.innerWidth > 800;
	return <main class={wide ? 'wide' : 'narrow'}>Content</main>;
}
`,
		after: `import { useSyncExternalStore } from 'octane';

function subscribe(notify: () => void) {
	window.addEventListener('resize', notify);
	return () => window.removeEventListener('resize', notify);
}

function getWide() {
	return window.innerWidth > 800;
}

export function Layout() {
	const wide = useSyncExternalStore(subscribe, getWide, () => false);
	return <main class={wide ? 'wide' : 'narrow'}>Content</main>;
}
`,
		note: 'The server snapshot is rendered on the server and during hydration, so both agree.',
	},
	{
		id: 'random-id',
		title: 'Generate an element ID',
		react: "const id = 'field-' + Math.random();",
		strong: 'const id = useId();',
		codes: ['OCTANE_STRONG_RENDER_IMPURE_CALL'],
		before: `export function Field({ label }: { label: string }) {
	const id = 'field-' + Math.random().toString(36).slice(2);
	return (
		<label for={id}>
			{label}
			<input id={id} />
		</label>
	);
}
`,
		after: `import { useId } from 'octane';

export function Field({ label }: { label: string }) {
	const id = useId();
	return (
		<label for={id}>
			{label}
			<input id={id} />
		</label>
	);
}
`,
		note: '`useId` is stable across renders and matches between server and client.',
	},
	{
		id: 'effect-fetch',
		title: 'Load data in an effect',
		react: 'useEffect(() => { load(id).then(setData); }, [id]);',
		strong:
			'let ignore = false; load(id).then((p) => { if (!ignore) setName(p.name); }); return () => { ignore = true; };',
		codes: ['OCTANE_STRONG_EFFECT_DATA_FETCH'],
		before: `import { useEffect, useState } from 'octane';
import { load } from './api';

export function Profile({ id }: { id: string }) {
	const [name, setName] = useState('');
	useEffect(() => {
		load(id).then((profile) => setName(profile.name));
	});
	return <p>{name}</p>;
}
`,
		after: `import { useEffect, useState } from 'octane';
import { load } from './api';

export function Profile({ id }: { id: string }) {
	const [name, setName] = useState('');
	useEffect(() => {
		let ignore = false;
		load(id).then((profile) => {
			if (!ignore) setName(profile.name);
		});
		return () => {
			ignore = true;
		};
	});
	return <p>{name}</p>;
}
`,
		note: 'Without the flag, a slow response for an old `id` can overwrite a newer one. For data the render needs, `use()` or a query binding avoids the effect entirely.',
	},
	{
		id: 'force-update',
		title: 'Re-render when an external store changes',
		react: 'const [, forceUpdate] = useReducer((x) => x + 1, 0);',
		strong: 'const value = useSyncExternalStore(store.subscribe, store.get, store.get);',
		codes: ['OCTANE_STRONG_WRITE_ONLY_STATE'],
		before: `import { useEffect, useReducer } from 'octane';
import { store } from './store';

export function Count() {
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
	useEffect(() => store.subscribe(() => forceUpdate()));
	return <span>{String(store.get())}</span>;
}
`,
		after: `import { useSyncExternalStore } from 'octane';
import { store } from './store';

export function Count() {
	const count = useSyncExternalStore(store.subscribe, store.get, store.get);
	return <span>{String(count)}</span>;
}
`,
		note: '`useSyncExternalStore` re-checks the snapshot after commit, so a change between render and subscription is not lost.',
	},
	{
		id: 'trusted-html',
		title: 'Render trusted HTML',
		react: 'dangerouslySetInnerHTML={{ __html: html }}',
		strong: 'dangerouslySetInnerHTML={trustHTML(sanitize(html))}',
		codes: ['OCTANE_STRONG_UNTRUSTED_HTML'],
		before: `import { sanitize } from './sanitize';

export function Article({ html }: { html: string }) {
	return <article dangerouslySetInnerHTML={{ __html: sanitize(html) }} />;
}
`,
		after: `import { trustHTML } from 'octane';
import { sanitize } from './sanitize';

export function Article({ html }: { html: string }) {
	return <article dangerouslySetInnerHTML={trustHTML(sanitize(html))} />;
}
`,
		note: '`trustHTML` marks the value as trusted; it does not sanitize. Call it only on sanitized or already trusted HTML.',
	},
];
