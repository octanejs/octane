import { useState } from 'octane';
import { Provider, useAtom, useAtomValue, useSetAtom, useStore } from '@octanejs/jotai';

// Conformance fixtures — octane-side behavior of the binding. Atoms and stores
// are passed in as props (created fresh per test) so nothing leaks between
// tests through the module-global default store.

// Render-count probes. NOTE: a reader mounts with TWO renders by design — the
// subscription effect does an unconditional post-subscribe rerender (upstream
// jotai parity) — so tests assert render-count DELTAS after settling.
export const renders = { count: 0, derived: 0, writer: 0, two: 0, a: 0, b: 0 };

export function Counter(props: { count: any }) @{
	renders.count++;
	const value = useAtomValue(props.count);
	<span id="count">
		{'count=' + value}
	</span>
}

function Derived(props: { derived: any }) @{
	renders.derived++;
	const value = useAtomValue(props.derived);
	<span id="derived">
		{'derived=' + value}
	</span>
}

function IncButton(props: { count: any }) @{
	renders.writer++;
	const set = useSetAtom(props.count);
	<button id="inc" onClick={() => set((c: number) => c + 1)}>{'inc'}</button>
}

// Primitive counter + derived reader + WRITE-ONLY writer, all on the default
// store (no Provider — jotai's no-Provider fallback).
export function CounterApp(props: { count: any; derived: any }) @{
	<>
		<Counter count={props.count} />
		<Derived derived={props.derived} />
		<IncButton count={props.count} />
	</>
}

// Derived-atom bail-out probe: reader of a derived atom whose value can stay
// Object.is-equal across dependency writes (the store doesn't notify it).
export function BailoutApp(props: { count: any; clamped: any }) @{
	<>
		<Derived derived={props.clamped} />
		<IncButton count={props.count} />
	</>
}

// Two different atoms via two useAtom calls in ONE component — the hooks'
// derived sub-slots must keep the reducer/effect state independent.
export function TwoAtoms(props: { a: any; b: any }) @{
	renders.two++;
	const [a, setA] = useAtom(props.a);
	const [b, setB] = useAtom(props.b);
	<div>
		<span id="two">
			{'a=' + a + ' b=' + b}
		</span>
		<button id="bump-a" onClick={() => setA((v: number) => v + 1)}>{'a'}</button>
		<button id="bump-b" onClick={() => setB((v: number) => v + 1)}>{'b'}</button>
	</div>
}

// The SAME atom read in two sibling components — one write updates both.
export function TwinReaders(props: { count: any }) @{
	<>
		<ReaderA count={props.count} />
		<ReaderB count={props.count} />
		<IncButton count={props.count} />
	</>
}

function ReaderA(props: { count: any }) @{
	renders.a++;
	const v = useAtomValue(props.count);
	<span id="ra">
		{'ra=' + v}
	</span>
}

function ReaderB(props: { count: any }) @{
	renders.b++;
	const v = useAtomValue(props.count);
	<span id="rb">
		{'rb=' + v}
	</span>
}

// useStore resolution capture: default store / nearest Provider / options.store.
export const capturedStores: Record<string, unknown> = {};

function StoreCapture(props: { id: string; options?: any }) @{
	capturedStores[props.id] = useStore(props.options);
	<span>
		{'cap:' + props.id}
	</span>
}

export function StoreResolutionApp(props: { providerStore: any; optionsStore: any }) @{
	<>
		<StoreCapture id="default" />
		<Provider store={props.providerStore}>
			<StoreCapture id="provider" />
			<StoreCapture id="options" options={{ store: props.optionsStore }} />
		</Provider>
	</>
}

// Provider scoping + nesting: the same atom outside any Provider, under an
// outer Provider, and under a nested (shadowing) Provider.
function Reader(props: { id: string; count: any }) @{
	const v = useAtomValue(props.count);
	<span id={props.id}>
		{props.id + '=' + v}
	</span>
}

export function ScopesApp(props: { count: any; outer: any; inner: any }) @{
	<>
		<Reader id="global" count={props.count} />
		<Provider store={props.outer}>
			<Reader id="outer" count={props.count} />
			<Provider store={props.inner}>
				<Reader id="inner" count={props.count} />
			</Provider>
		</Provider>
	</>
}

// Provider store-prop swap: the reader under it must re-read from the NEW
// store (exercises useAtomValue's render-phase tuple sync) and re-subscribe.
export function SwapApp(props: { storeA: any; storeB: any; count: any }) @{
	const [useB, setUseB] = useState(false);
	<div>
		<Provider store={useB ? props.storeB : props.storeA}>
			<Counter count={props.count} />
		</Provider>
		<button id="swap" onClick={() => setUseB(true)}>{'swap'}</button>
	</div>
}
