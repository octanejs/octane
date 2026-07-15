import { useState, useSyncExternalStore } from 'octane';

// Leaf hydration fixtures (SSR Phase 2): single-root components with element
// structure, single-text-children, attributes, and events — the shapes whose
// client template paths align with the server DOM so hydration can adopt.

// useSyncExternalStore with a server snapshot: during hydration the first read
// must use getServerSnapshot (matching the server HTML), then sync to the client
// snapshot after.
export function StoreView(props) @{
	const v = useSyncExternalStore(
		props.store.subscribe,
		props.store.getSnapshot,
		props.store.getServerSnapshot,
	);
	<span id="sv">
		{v as string}
	</span>
}

// Static text only-child.
export function StaticText() @{
	<div class="greet">{'Hello, world'}</div>
}

// Dynamic attributes + dynamic single-text-child.
export function Attrs(props) @{
	<div id={props.id} class={props.cls} data-kind="leaf">
		{props.text as string}
	</div>
}

// The client compiler proves this data-* value is already a string and uses
// its narrow attribute path. Server serialization stays on the normal ssrAttr
// path; hydration must still adopt, recover, warn, and suppress identically.
export function StringData(props) @{
	<div id="string-data" data-state={props.value as string}>{'data'}</div>
}

export function SuppressedStringData(props) @{
	<div
		id="suppressed-string-data"
		suppressHydrationWarning
		data-state={props.value as string}
	>{'data'}</div>
}

// Nested ELEMENTS (not components), each with a single text child — element
// paths align; each text child is adopted independently.
export function Mixed() @{
	<div id="m">
		<span class="a">{'A'}</span>
		<span class="b">{'B'}</span>
	</div>
}

// Stateful + event — proves handlers attach to adopted nodes and updates work.
export function Counter(props) @{
	const [n, setN] = useState(props.start);
	<button id="btn" onClick={() => setN(n + 1)}>
		{n as string}
	</button>
}
