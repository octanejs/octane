import { create, useStore } from '@octanejs/zustand';

// A store with two independent slices (`count`, `other`) plus actions. Module
// scope mirrors how zustand stores are normally declared; tests reset it in
// `beforeEach` via `useCounter.setState(...)`.
export const useCounter = create(
	(set) => ({
		count: 0,
		other: 0,
		inc: () => set((s) => ({ count: s.count + 1 })),
		incOther: () => set((s) => ({ other: s.other + 1 })),
		setBoth: (c: number, o: number) => set({ count: c, other: o }),
	}),
);

// A second, independent store — proves two distinct stores compose in one
// component without cross-talk.
export const useFish = create(
	(set) => ({
		n: 100,
		add: () => set((s) => ({ n: s.n + 1 })),
	}),
);

// Selects ONLY `count` (plus the stable action refs). `onRender` lets a test
// count renders to prove the selector bails out when an UNRELATED slice
// (`other`) changes — the zustand/React useSyncExternalStore contract.
export function CountOnly(props: { onRender: () => void }) @{
	const count = useCounter((s) => s.count);
	const inc = useCounter((s) => s.inc);
	const incOther = useCounter((s) => s.incOther);
	props.onRender();
	<div>
		<span id="count">
			{count as string}
		</span>
		<button id="inc" onClick={inc}>inc</button>
		<button id="incOther" onClick={incOther}>incOther</button>
	</div>
}

// No selector → subscribes to the whole state object.
export function Whole() @{
	const s = useCounter();
	<span id="whole">
		{s.count + '/' + s.other as string}
	</span>
}

// Derived selector — a computed slice, not a stored field.
export function Doubled() @{
	const double = useCounter((s) => s.count * 2);
	<span id="double">
		{double as string}
	</span>
}

// Two independent stores used in one component.
export function Both() @{
	const c = useCounter((s) => s.count);
	const f = useFish((s) => s.n);
	const incC = useCounter((s) => s.inc);
	const addF = useFish((s) => s.add);
	<div>
		<button id="c" onClick={incC}>
			{c as string}
		</button>
		<button id="f" onClick={addF}>
			{f as string}
		</button>
	</div>
}

// Uses the GENERIC `useStore(api, selector)` against a store passed via props —
// lets a test wrap the store's `subscribe` to assert listener add/remove across
// mount/unmount.
export function Reader(props: {
	api: {
		subscribe: (l: () => void) => () => void;
		getState: () => { n: number };
		getInitialState: () => { n: number };
	};
}) @{
	const n = useStore(props.api, (s) => s.n);
	<span id="n">
		{n as string}
	</span>
}
