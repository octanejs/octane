/** @jsxImportSource octane */
import { useEffectEvent, useLayoutEffect, useState } from 'octane';
import {
	captureSignalOwner,
	currentSignalOwner,
	derived$,
	query$,
	signal$,
	skip,
	type WritableSignal,
} from 'octane/signals';

export type Data = { values: readonly number[] };

export type NestedProps = {
	key: string;
	enabled: boolean;
	load: (key: string) => Promise<string>;
};

export function GuardedQuery(props: {
	selection: string;
	load: (key: string) => Promise<string>;
}) @{
	const active$ = signal$(false);
	const [tick, setTick] = useState(0);
	const source$ = query$(() => props.selection, props.load);
	const label$ = derived$(() => ({ text: active$.get() ? source$.get() : 'inactive' }));
	const details$ = derived$(() => ({ text: label$.get().text }));
	const label = label$.snapshot();
	const state = details$.snapshot();
	<main>
		<button id="tick" onClick={() => setTick(tick + 1)}>
			{'tick'}
		</button>
		<button id="open" onClick={() => active$.set(true)}>
			{'open'}
		</button>
		<output>{tick as string}</output>
		<aside>{label.status}</aside>
		<p>{state.status === 'ready' ? state.value.text : 'loading'}</p>
	</main>
}

// #1735: an acyclic derived$ chain reads the snapshot of a derived$ that is
// itself waiting on a pending query.
export function NestedSnapshot(props: NestedProps) @{
	const active$ = signal$(false);
	const eligible$ = derived$(() => props.enabled);
	const primary$ = query$(() => (active$.get() && eligible$.get() ? props.key : skip), props.load);
	const latest$ = derived$(() => primary$.latest(undefined));
	const usePrimary$ = derived$(
		() => primary$.snapshot().status !== 'error' || latest$.get() !== undefined,
	);
	const selected$ = derived$(() => {
		if (!active$.get() || !eligible$.get()) return null;
		if (usePrimary$.get()) return latest$.get() ?? primary$.get();
		return null;
	});
	const available$ = derived$(() => {
		const snapshot = selected$.snapshot();
		return snapshot.status === 'ready' && snapshot.value !== null;
	});
	const fallback$ = derived$(() => selected$.snapshot().status !== 'ready');
	const visible$ = derived$(() => String(available$.get()) + ':' + String(fallback$.get()));
	<main>
		<button onClick={() => active$.set(true)}>{'load'}</button>
		<p>{fallback$.get() ? 'pending' : 'settled'}</p>
		<span>{visible$.get() as string}</span>
	</main>
}

export type LayoutFixture = {
	enabled$: WritableSignal<boolean>;
	load: (key: string) => Promise<Data>;
};

const isEnabled$ = (fixture: LayoutFixture) => fixture.enabled$.get();

// #1735 (comment): a layout-effect microtask activates the query, and two
// derived values consume the snapshot of the derived value that reads it.
export function LayoutActivatedSnapshot({ fixture }: { fixture: LayoutFixture }) @{
	const [open, setOpen] = useState(false);
	const active$ = signal$(false);
	const eligible$ = derived$(() => isEnabled$(fixture));
	const request$ = query$(() => (active$.get() && eligible$.get() ? 'a' : skip), fixture.load);
	const selected$ = derived$(() => {
		if (!active$.get() || !eligible$.get()) return null;
		return request$.get();
	});
	const hasValues$ = derived$(() => {
		if (!active$.get() || !eligible$.get()) return false;
		const result = selected$.snapshot();
		return result.status === 'ready' && (result.value?.values.length ?? 0) > 0;
	});
	const empty$ = derived$(() => {
		if (!active$.get() || !eligible$.get()) return false;
		const result = selected$.snapshot();
		return (
			result.status === 'error' || (result.status === 'ready' && result.value?.values.length === 0)
		);
	});
	const visible$ = derived$(() => hasValues$.get() || empty$.get());
	const run = captureSignalOwner(currentSignalOwner()!);
	const activate = useEffectEvent(() => run(() => active$.set(true)));
	useLayoutEffect(() => {
		queueMicrotask(activate);
	});
	<section>
		<button id="open" onClick={() => setOpen(true)}>
			{'Open'}
		</button>
		@if (open) {
			<div id="panel">{'Panel'}</div>
		}
		@if (visible$.get()) {
			<output id="result">{'Loaded'}</output>
		}
	</section>
}

export type SelectorProps = {
	skipWhilePending: boolean;
	loadSource: (key: string) => Promise<string>;
	loadDependent: (key: string) => Promise<string>;
	onRender: () => void;
};

// #1736: a query selector calls get() on another pending query.
export function PendingSelector(props: SelectorProps) @{
	props.onRender();
	const [tick, setTick] = useState(0);
	const active$ = signal$(false);
	const source$ = query$(() => (active$.get() ? 'source' : skip), props.loadSource);
	const dependent$ = query$(() => {
		if (!active$.get()) return skip;
		if (props.skipWhilePending) {
			const state = source$.snapshot();
			if (state.status !== 'ready') return skip;
			return `${tick}:${state.value}`;
		}
		return `${tick}:${source$.get()}`;
	}, props.loadDependent);
	const a$ = derived$(() => dependent$.snapshot().status);
	const b$ = derived$(() => dependent$.snapshot().status);
	const run = captureSignalOwner(currentSignalOwner()!);
	const activate = useEffectEvent(() => run(() => active$.set(true)));
	useLayoutEffect(() => {
		let cancelled = false;
		queueMicrotask(() => {
			if (!cancelled) activate();
		});
		return () => {
			cancelled = true;
		};
	}, []);
	<section>
		<button id="next" onClick={() => setTick(tick + 1)}>
			{'Next'}
		</button>
		<output id="status">{`${tick}:${a$.get()}:${b$.get()}`}</output>
	</section>
}

export type RejectedFixture = {
	skipFallback: boolean;
	enabled$: WritableSignal<boolean>;
	load: (key: string) => Promise<Data>;
	fallback: (key: string) => Promise<Data>;
	onRender: () => void;
};

// #1737: a rejected query is read through derived snapshots during render.
export function RejectedSnapshot({ fixture }: { fixture: RejectedFixture }) @{
	fixture.onRender();
	const [open, setOpen] = useState(false);
	const active$ = signal$(false);
	const eligible$ = derived$(() => fixture.enabled$.get());
	const request$ = query$(() => (active$.get() && eligible$.get() ? 'a' : skip), fixture.load);
	const selected$ = derived$(() => {
		if (!active$.get() || !eligible$.get()) return null;
		return request$.get();
	});
	const hasValues$ = derived$(() => {
		if (!active$.get() || !eligible$.get()) return false;
		const result = selected$.snapshot();
		return result.status === 'ready' && (result.value?.values.length ?? 0) > 0;
	});
	const empty$ = derived$(() => {
		if (!active$.get() || !eligible$.get()) return false;
		const result = selected$.snapshot();
		return (
			result.status === 'error' || (result.status === 'ready' && result.value?.values.length === 0)
		);
	});
	const fallback$ = query$(
		() =>
			!fixture.skipFallback && active$.get() && eligible$.get() && empty$.get() ? 'fallback' : skip,
		fixture.fallback,
	);
	const visible$ = derived$(
		() =>
			hasValues$.get() ||
			(empty$.get() &&
				fallback$.snapshot().status === 'ready' &&
				fallback$.get().values.length > 0),
	);
	const run = captureSignalOwner(currentSignalOwner()!);
	const activate = useEffectEvent(() => run(() => active$.set(true)));
	useLayoutEffect(() => {
		queueMicrotask(activate);
	});
	const taskState = active$.get() && eligible$.get() ? request$.snapshot() : undefined;
	const taskResult = active$.get() && eligible$.get() ? request$.latest(undefined) : undefined;
	const fallbackNeeded = empty$.get();
	const visible = visible$.get();
	<section>
		<output id="observation">{`${taskState?.status ?? 'none'}:${
			taskResult?.values.length ?? 'none'
		}:${fallbackNeeded}:${visible}`}</output>
		<button id="open" onClick={() => setOpen(true)}>
			{'Open'}
		</button>
		@if (open) {
			<div id="panel">{'Panel'}</div>
		}
		@if (visible) {
			<output id="result">{'Loaded'}</output>
		}
	</section>
}

// A dependent reads a value that each evaluation creates anew. An unrelated
// state update must not restart the chain.
export function NewObjectChain() @{
	const [tick, setTick] = useState(0);
	const count$ = signal$(1);
	const base$ = derived$(() => count$.get() + 1);
	const boxed$ = derived$(() => ({ n: base$.get() }));
	const n$ = derived$(() => boxed$.get().n);
	<section>
		<button id="tick" onClick={() => setTick(tick + 1)}>
			{'Tick'}
		</button>
		<button id="count" onClick={() => count$.set(count$.get() + 1)}>
			{'Count'}
		</button>
		<output>{`${tick}:${n$.get()}`}</output>
	</section>
}

export function NewErrorChain() @{
	const [tick, setTick] = useState(0);
	const count$ = signal$(1);
	const base$ = derived$(() => count$.get() + 1);
	const failed$ = derived$(() => {
		if (base$.get() > 0) throw new Error('failed at ' + base$.get());
		return base$.get();
	});
	const status$ = derived$(() => {
		const result = failed$.snapshot();
		return result.status === 'error' ? (result.error as Error).message : result.status;
	});
	<section>
		<button id="tick" onClick={() => setTick(tick + 1)}>
			{'Tick'}
		</button>
		<button id="count" onClick={() => count$.set(count$.get() + 1)}>
			{'Count'}
		</button>
		<output>{`${tick}:${status$.get()}`}</output>
	</section>
}

export type ConsistentProps = { label: string; onCommit: (pair: string) => void };

// A render that redeclares a dependency presents its dependents from the same
// definition, so a committed render never pairs a new label with an old shout.
export function ConsistentChain(props: ConsistentProps) @{
	const n$ = signal$(1);
	const label$ = derived$(() => props.label + n$.get());
	const shout$ = derived$(() => label$.get().toUpperCase());
	const pair = label$.get() + '|' + shout$.get();
	useLayoutEffect(() => {
		props.onCommit(pair);
	});
	<p>{pair}</p>
}
