import {
	Activity,
	useSyncExternalStore,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from 'octane';

type StoreListener = () => void;
type StoreLike = {
	get: () => unknown;
	subscribe: (notify: StoreListener) => () => void;
};

// Smallest practical store: a mutable counter with a Set of listeners.
// Identical-by-reference subscribe / getSnapshot keep the useEffect deps
// stable across renders — re-mounting / re-subscribing only when a fresh
// store identity flows in.
export function makeStore(initial = 0) {
	let value = initial;
	const listeners = new Set();
	return {
		get: () => value,
		set: (next) => {
			value = next;
			for (const l of listeners) l();
		},
		subscribe: (notify) => {
			listeners.add(notify);
			return () => {
				listeners.delete(notify);
			};
		},
		listenerCount: () => listeners.size,
	};
}

// Reads the snapshot via useSyncExternalStore and renders it. Memoized
// `subscribe` / `getSnapshot` so re-renders don't churn the effect deps.
export function Reader(props) @{
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getSnapshot = useCallback(props.store.get, [props.store]);
	const value = useSyncExternalStore(subscribe, getSnapshot);
	<p class="value">{value as string}</p>
}

// Marks only the component's render interval so tests can distinguish render
// from the later subscription lifecycle without observing runtime internals.
export function RenderObservedReader(props: {
	store: StoreLike;
	onRenderState: (rendering: boolean) => void;
}) @{
	props.onRenderState(true);
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getSnapshot = useCallback(props.store.get, [props.store]);
	const value = useSyncExternalStore(subscribe, getSnapshot);
	props.onRenderState(false);
	<p class="value">{value as string}</p>
}

// Recreates subscribe on each render while keeping the same backing store.
export function InlineSubscribedReader(props: { store: StoreLike }) @{
	const [count, setCount] = useState(0);
	const value = useSyncExternalStore((notify) => props.store.subscribe(notify), props.store.get);
	<div>
		<button onClick={() => setCount(count + 1)}>{String(count)}</button>
		<p class="value">{String(value)}</p>
	</div>
}

// Both readers replace their inline subscriptions in the same discrete commit.
export function TwoInlineSubscribedReaders(props: { first: StoreLike; second: StoreLike }) @{
	const [count, setCount] = useState(0);
	const first = useSyncExternalStore((notify) => props.first.subscribe(notify), props.first.get);
	const second = useSyncExternalStore((notify) => props.second.subscribe(notify), props.second.get);
	<div>
		<button onClick={() => setCount(count + 1)}>{String(count)}</button>
		<p>
			{String(first)}:{String(second)}
		</p>
	</div>
}

// Same component bound to a different store identity — exercises the
// re-subscribe-on-store-swap path.
export function SwappableReader(props) @{
	const subscribe = useCallback(props.store.subscribe, [props.store]);
	const getSnapshot = useCallback(props.store.get, [props.store]);
	const value = useSyncExternalStore(subscribe, getSnapshot);
	<p class="value" data-key={props.store === props.alt ? 'alt' : 'main'}>
		{value as string}
	</p>
}

// Removes the reader without unmounting its host so a stale store callback
// cannot hide a resurrection behind wholesale root teardown.
export function ConditionalReader(props: { store: StoreLike; show: boolean }) @{
	<div id="conditional-host">
		<span id="conditional-survivor">{'keep'}</span>
		@if (props.show) {
			<Reader store={props.store} />
		}
	</div>
}

// Deliberately retains the most recently subscribed callback after unsubscribe.
// Real stores can retain stale listener snapshots while notifying; invoking it
// lets the test prove an already-removed owner stays dead.
export function makeRetainedCallbackStore(initial = 0): StoreLike & {
	notifyRetained: (next: number) => boolean;
	listenerCount: () => number;
} {
	let value = initial;
	let retained: StoreListener | null = null;
	const listeners = new Set<StoreListener>();
	return {
		get: () => value,
		subscribe: (notify: StoreListener) => {
			retained = notify;
			listeners.add(notify);
			return () => {
				listeners.delete(notify);
			};
		},
		notifyRetained: (next: number) => {
			value = next;
			if (retained === null) return false;
			retained();
			return true;
		},
		listenerCount: () => listeners.size,
	};
}

// Mounts a reader from a click, as a submenu opened by one key press would.
export function ClickMountedReader(props: { store: StoreLike }) @{
	const [shown, setShown] = useState(false);
	<div>
		<button onClick={() => setShown(true)}>{'Show'}</button>
		@if (shown) {
			<Reader store={props.store} />
		}
	</div>
}

// A click mounts the reader, then a layout effect in the same commit swaps its
// store or hides it before the reader's passive effect has run.
export function LayoutCascadeReader(props: {
	store: StoreLike;
	next: StoreLike;
	mode: 'swap' | 'hide';
}) @{
	const [shown, setShown] = useState(false);
	const [swapped, setSwapped] = useState(false);
	const [hidden, setHidden] = useState(false);
	useLayoutEffect(() => {
		if (!shown) return;
		if (props.mode === 'swap') setSwapped(true);
		else setHidden(true);
	}, [shown]);
	<div>
		<button onClick={() => setShown(true)}>{'Show'}</button>
		@if (shown) {
			<Activity mode={hidden ? 'hidden' : 'visible'}>
				<Reader store={swapped ? props.next : props.store} />
			</Activity>
		}
	</div>
}

// Two readers mounted by one click; the first store's subscribe can throw.
export function TwoClickMountedReaders(props: { first: StoreLike; second: StoreLike }) @{
	const [shown, setShown] = useState(false);
	<div>
		<button onClick={() => setShown(true)}>{'Show'}</button>
		@if (shown) {
			<>
				<Reader store={props.first} />
				<Reader store={props.second} />
			</>
		}
	</div>
}

// Mounts a reader from a native listener that Octane does not delegate.
export function NativeListenerMountedReader(props: { store: StoreLike; type: string }) @{
	const [shown, setShown] = useState(false);
	const button = useRef<HTMLButtonElement | null>(null);
	useLayoutEffect(() => {
		const node = button.current!;
		const show = () => setShown(true);
		node.addEventListener(props.type, show);
		return () => node.removeEventListener(props.type, show);
	}, [props.type]);
	<div>
		<button ref={button}>{'Show'}</button>
		@if (shown) {
			<Reader store={props.store} />
		}
	</div>
}

// A controlled input whose first edit mounts the reader; its discrete dispatch
// commits synchronously before the controlled restore.
export function ControlledInputMountedReader(props: { store: StoreLike }) @{
	const [text, setText] = useState('');
	<div>
		<input value={text} onInput={(event) => setText((event.target as HTMLInputElement).value)} />
		@if (text !== '') {
			<Reader store={props.store} />
		}
	</div>
}

// Reads a boolean store and attaches a ref only while it is true.
function RefReader(props: { store: StoreLike; name: string; log: string[] }) @{
	const shown = useSyncExternalStore(props.store.subscribe, props.store.get);
	<>
		@if (shown) {
			<span
				ref={(el) => {
					if (el) props.log.push(`ref ${props.name}`);
				}}
			>
				{props.name as string}
			</span>
		}
	</>
}

// Sibling readers at different depths: the first sits inside an `@if` arm.
export function NestedRefReaders(props: { store: StoreLike; log: string[] }) @{
	<div>
		@if (props.store !== null) {
			<RefReader store={props.store} name="first" log={props.log} />
		}
		<RefReader store={props.store} name="second" log={props.log} />
		<RefReader store={props.store} name="third" log={props.log} />
	</div>
}
