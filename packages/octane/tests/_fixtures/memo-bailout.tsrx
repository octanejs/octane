import { useState, useSyncExternalStore, createContext, use, memo } from 'octane';

// ---------------------------------------------------------------------------
// memo() bailout heuristics — ports of ReactMemo-test.js cases :66, :101, :298.
//
// Each memo'd child logs once per render via props.log so a test can assert
// exactly which renders happened. A parent owns two pieces of state:
//   - `tick`  : bumping it re-renders the parent WITHOUT changing the child's
//               props (memo should bail out / skip the child render),
//   - `count` : bumping it DOES change the child's props (memo must re-render).
// ---------------------------------------------------------------------------

// --- Case :66 — bails out on shallow-equal props -----------------------------
function CounterImpl(props) @{
	props.log('render:' + props.count);
	<span class="val">{props.count as string}</span>
}
const Counter = memo(CounterImpl);

export function BailoutHost(props) @{
	const [tick, setTick] = useState(0);
	const [count, setCount] = useState(0);
	<div>
		<button id="tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
		<button id="count" onClick={() => setCount(count + 1)}>{'count'}</button>
		<Counter count={count} log={props.log} />
	</div>
}

// --- Case :101 — does NOT bail out on a context change (stable props) --------
const CountContext = createContext(0);

function CtxCounterImpl(props) @{
	const count = use(CountContext);
	props.log(props.label + ': ' + count);
	<span class="ctxval">{props.label + ': ' + count as string}</span>
}
const CtxCounter = memo(CtxCounterImpl);

export function ContextHost(props) @{
	const [count, setCount] = useState(0);
	// `label` is a stable string so the memo'd consumer's props never change —
	// only the Provider value does. A correct memo must still re-render because
	// the consumer reads a context whose value changed.
	<div>
		<button id="ctxbump" onClick={() => setCount(count + 1)}>{'bump'}</button>
		<CountContext.Provider value={count}>
			<CtxCounter label="Count" log={props.log} />
		</CountContext.Provider>
	</div>
}

// --- Case :298 — accepts a custom comparison function ------------------------
// The comparator overrides the default Object.is shallow compare: it logs the
// old/new count it was handed and bails out (returns true) only when the
// `count` values are equal — exactly like the React fixture.
function CustomCounterImpl(props) @{
	props.log('render:' + props.count);
	<span class="customval">{props.count as string}</span>
}
const CustomCounter = memo(CustomCounterImpl, (oldProps, newProps) => {
	oldProps.log('compare:' + oldProps.count + '->' + newProps.count);
	return oldProps.count === newProps.count;
});

export function CustomCompareHost(props) @{
	const [tick, setTick] = useState(0);
	const [count, setCount] = useState(0);
	<div>
		<button id="ctick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
		<button id="ccount" onClick={() => setCount(count + 1)}>{'count'}</button>
		<CustomCounter count={count} log={props.log} />
	</div>
}

// --- Redact RDX-MEM-001 — an owned store update crosses a memo gate ----------
type MemoStoreListener = () => void;
type MemoStore = {
	getSnapshot: () => number;
	set: (next: number) => void;
	subscribe: (listener: MemoStoreListener) => () => void;
	listenerCount: () => number;
};
type MemoStoreLog = (message: string) => void;

export function makeMemoStore(initial = 0): MemoStore {
	let value = initial;
	const listeners = new Set<MemoStoreListener>();
	return {
		getSnapshot: () => value,
		set(next: number) {
			value = next;
			for (const listener of listeners) listener();
		},
		subscribe(listener: MemoStoreListener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		listenerCount: () => listeners.size,
	};
}

function StableStoreLeafImpl(props: { label: string; log: MemoStoreLog }) @{
	props.log('leaf:' + props.label);
	<span id="memo-store-leaf">{props.label as string}</span>
}
const StableStoreLeaf = memo(StableStoreLeafImpl);

function MemoStoreOwnerImpl(props: { store: MemoStore; log: MemoStoreLog }) @{
	const value = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot);
	props.log('owner:' + value);
	<section id="memo-store-owner">
		<output id="memo-store-value">{value as number}</output>
		<StableStoreLeaf label="stable" log={props.log} />
	</section>
}
const MemoStoreOwner = memo(MemoStoreOwnerImpl);

export function MemoStoreHost(props: { store: MemoStore; log: MemoStoreLog }) @{
	const [tick, setTick] = useState(0);
	<div data-tick={tick as number}>
		<button id="memo-store-parent-update" onClick={() => setTick(tick + 1)}>{'parent'}</button>
		<MemoStoreOwner store={props.store} log={props.log} />
	</div>
}
