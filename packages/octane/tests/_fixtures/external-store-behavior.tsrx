import { use, useSyncExternalStore, useLayoutEffect } from 'octane';

export interface ExternalStore<T> {
	getState: () => T;
	setState: (next: T) => void;
	subscribe: (listener: () => void) => () => void;
	listenerCount: () => number;
}

// A minimal external store with observable subscription cleanup.
export function makeStore<T>(initial: T): ExternalStore<T> {
	let state = initial;
	const listeners = new Set<() => void>();
	return {
		getState: () => state,
		setState: (next) => {
			state = next;
			for (const l of [...listeners]) l();
		},
		subscribe: (l) => {
			listeners.add(l);
			return () => {
				listeners.delete(l);
			};
		},
		listenerCount: () => listeners.size,
	};
}

// Use the inline selector shape common in Zustand and query-store adapters.
export function StoreConsumer(props: { store: ExternalStore<number> }) @{
	const value = useSyncExternalStore(props.store.subscribe, () => props.store.getState());
	<span class="uc">{'' + value}</span>
}

// Select a field named by props so updates must use the latest selector.
export function KeyedConsumer(props: {
	store: ExternalStore<{ a: number; b: number }>;
	k: 'a' | 'b';
}) @{
	const value = useSyncExternalStore(props.store.subscribe, () => props.store.getState()[props.k]);
	<span class="kc">{'' + value}</span>
}

// Throw after reading a negative snapshot so the nearest boundary handles it.
function ThrowConsumer(props: { store: ExternalStore<number> }) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	if (value < 0) throw new Error('boom-' + -value as string);
	<span class="tc">{'' + value}</span>
}

export function ThrowBoundary(props: { store: ExternalStore<number> }) @{
	@try {
		<ThrowConsumer store={props.store} />
	} @catch (e: unknown, _reset: () => void) {
		<span class="err">{'err:' + (e instanceof Error ? e.message : String(e))}</span>
	}
}

// A sibling mutates the store during layout; the consumer must converge to the
// value visible after the commit.
function LayoutMutator(props: { store: ExternalStore<number>; to: number }) @{
	useLayoutEffect(() => {
		props.store.setState(props.to);
	}, [props.to]);
	<span class="mut" />
}

export function SiblingApp(props: { store: ExternalStore<number>; to: number }) @{
	<div>
		<StoreConsumer store={props.store} />
		<LayoutMutator store={props.store} to={props.to} />
	</div>
}

export function PairedStoreConsumer(props: {
	first: ExternalStore<number>;
	second: ExternalStore<number>;
}) @{
	const first = useSyncExternalStore(props.first.subscribe, props.first.getState);
	const second = useSyncExternalStore(props.second.subscribe, props.second.getState);
	<output id="paired-store-value">{first + ':' + second}</output>
}

export function RenderPhaseStoreConsumer(props: {
	store: ExternalStore<number>;
	observeCommit: (snapshot: number, current: number) => void;
}) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	if (value === 1) props.store.setState(2);
	useLayoutEffect(() => {
		props.observeCommit(value, props.store.getState());
	}, [value, props.store, props.observeCommit]);
	<output id="render-phase-store-value">{'value:' + value}</output>
}

function SuspensibleStoreConsumer(props: {
	store: ExternalStore<number>;
	firstPending: Promise<void>;
	nextPending: Promise<void>;
}) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	if (value === 1) use(props.firstPending);
	if (value > 1) use(props.nextPending);
	<output id="store-priority-value">{'value:' + value}</output>
}

export function StorePriorityBoundary(props: {
	store: ExternalStore<number>;
	firstPending: Promise<void>;
	nextPending: Promise<void>;
}) @{
	@try {
		<SuspensibleStoreConsumer
			store={props.store}
			firstPending={props.firstPending}
			nextPending={props.nextPending}
		/>
	} @pending {
		<span id="store-priority-fallback">{'loading'}</span>
	}
}

function RenderNotificationMutator(props: {
	store: ExternalStore<number>;
	next: number | null;
}) @{
	if (props.next !== null) props.store.setState(props.next);
	<span />
}

function PendingStoreReader(props: { store: ExternalStore<number> }) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getState);
	<output id="pending-store-value">{'value:' + value}</output>
}

export function CrossComponentStoreApp(props: {
	store: ExternalStore<number>;
	next: number | null;
}) @{
	<div>
		<RenderNotificationMutator store={props.store} next={props.next} />
		<PendingStoreReader store={props.store} />
	</div>
}
