// Fixtures for the binding's Octane-only conformance coverage: per-call-site
// hook-slot independence, selector bail-out, and the stable-instance contracts
// that `innerHTML` cannot show.
import { useState } from 'octane';
import {
	createAtom,
	createAtomConfig,
	createStore,
	createStoreHook,
	useAtom,
	useAtomState,
	useSelector,
	useStore,
} from '@octanejs/xstate-store';

export const renderLog: string[] = [];

export const countAtom = createAtom(0);

// Module-level, because the components below close over it. The `reset` event
// exists so each test can start from a known context instead of inheriting the
// previous one's sends.
export const counterStore = createStore({
	context: { count: 0, other: 0 },
	on: {
		inc: (context: { count: number; other: number }) => ({ ...context, count: context.count + 1 }),
		incOther: (context: { count: number; other: number }) => ({
			...context,
			other: context.other + 1,
		}),
		reset: () => ({ count: 0, other: 0 }),
	},
});

export function resetFixtures(): void {
	counterStore.send({ type: 'reset' });
	countAtom.set(0);
	renderLog.length = 0;
}

export function Controls() @{
	renderLog.push('Controls');

	<div>
		<button id="inc" onClick={() => counterStore.send({ type: 'inc' })}>
			inc
		</button>
		<button id="inc-other" onClick={() => counterStore.send({ type: 'incOther' })}>
			incOther
		</button>
	</div>
}

// Two selector call sites in one component, on different slices. A shared hook
// cell would make both render the same number.
export function BothSlices() @{
	const count = useSelector(counterStore, (snapshot) => snapshot.context.count);
	const other = useSelector(counterStore, (snapshot) => snapshot.context.other);

	renderLog.push('BothSlices');

	<div>
		<span id="both-count">{count as string}</span>
		<span id="both-other">{other as string}</span>
	</div>
}

export function CountOnly() @{
	const count = useSelector(counterStore, (snapshot) => snapshot.context.count);

	renderLog.push('CountOnly');

	<span id="count">{count as string}</span>
}

export function OtherOnly() @{
	const other = useSelector(counterStore, (snapshot) => snapshot.context.other);

	renderLog.push('OtherOnly');

	<span id="other">{other as string}</span>
}

// No selector: the whole snapshot, identity-selected.
export function WholeSnapshot() @{
	const snapshot = useSelector(counterStore);

	renderLog.push('WholeSnapshot');

	<span id="snapshot">{snapshot.context.count as string}</span>
}

export function SelectorApp() @{
	<div>
		<BothSlices />
		<CountOnly />
		<OtherOnly />
		<WholeSnapshot />
		<Controls />
	</div>
}

export function AtomReader() @{
	const value = useAtom(countAtom);

	renderLog.push('AtomReader');

	<div>
		<span id="atom">{value as string}</span>
		<button id="bump-atom" onClick={() => countAtom.set((previous) => previous + 1)}>
			bump
		</button>
	</div>
}

export const seededAtomConfig = createAtomConfig((input: number) => input * 2);

export function AtomStateReader(props: { onInstance?: (atom: unknown) => void }) @{
	const [value, atom] = useAtomState(seededAtomConfig, 5);
	const [tick, setTick] = useState(0);

	props.onInstance?.(atom);
	renderLog.push('AtomStateReader');

	<div>
		<span id="atom-state">{value as string}</span>
		<span id="atom-tick">{tick as string}</span>
		<button id="rerender-atom-state" onClick={() => setTick(tick + 1)}>
			rerender
		</button>
	</div>
}

// `useStore` must hand back the same instance across re-renders.
export function LocalStore(props: { onInstance?: (store: unknown) => void }) @{
	const store = useStore({
		context: { count: 0 },
		on: { inc: (context: { count: number }) => ({ ...context, count: context.count + 1 }) },
	});
	const [tick, setTick] = useState(0);
	const count = useSelector(store, (snapshot) => snapshot.context.count);

	props.onInstance?.(store);
	renderLog.push('LocalStore');

	<div>
		<span id="local-count">{count as string}</span>
		<span id="local-tick">{tick as string}</span>
		<button id="local-inc" onClick={() => store.send({ type: 'inc' })}>
			inc
		</button>
		<button id="local-rerender" onClick={() => setTick(tick + 1)}>
			rerender
		</button>
	</div>
}

export const useCountStore = createStoreHook({
	context: { count: 0 },
	on: {
		inc: (context: { count: number }, event: { by: number }) => ({
			...context,
			count: context.count + event.by,
		}),
	},
});

export function HookStoreReader() @{
	const [count, store] = useCountStore((snapshot) => snapshot.context.count);

	renderLog.push('HookStoreReader');

	<div>
		<span id="hook-count">{count as string}</span>
		<button id="hook-inc" onClick={() => store.trigger.inc({ by: 2 })}>
			inc
		</button>
	</div>
}
