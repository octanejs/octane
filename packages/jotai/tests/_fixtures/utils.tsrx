import { useState } from 'octane';
import { useAtom, useAtomValue, useSetAtom } from '@octanejs/jotai';
import {
	useAtomCallback,
	useHydrateAtoms,
	useReducerAtom,
	useResetAtom,
} from '@octanejs/jotai/utils';

// Conformance fixtures for the ported react/utils hooks (+ vanilla utils
// smoke). Atoms are created per test and passed in as props.

// useResetAtom + atomWithReset (also reused for the atomWithStorage smoke —
// both are writable atoms the set/reset buttons drive).
export function ResetApp(props: { count: any }) @{
	const [v, setV] = useAtom(props.count);
	const reset = useResetAtom(props.count);
	<div>
		<span id="resv">
			{'v=' + v}
		</span>
		<button id="set5" onClick={() => setV(5)}>{'5'}</button>
		<button id="reset" onClick={() => reset()}>{'r'}</button>
	</div>
}

// useAtomCallback — imperative reads and writes outside the render path.
export const callbackResults: unknown[] = [];

export function CallbackApp(props: { count: any }) @{
	const readCount = useAtomCallback((get) => get(props.count));
	const writeCount = useAtomCallback((get, set, v: number) => {
		set(props.count, v);
		return get(props.count);
	});
	<div>
		<button id="read" onClick={() => callbackResults.push(readCount())}>{'read'}</button>
		<button id="write" onClick={() => callbackResults.push(writeCount(123))}>{'write'}</button>
	</div>
}

// useHydrateAtoms — render-time seeding; the local-state button forces a
// re-render to prove hydration happens once per (store, atom) unless
// dangerouslyForceHydrate.
export function HydrateApp(props: { values: any; count: any; options?: any }) @{
	const [n, setN] = useState(0);
	useHydrateAtoms(props.values, props.options);
	const v = useAtomValue(props.count, props.options);
	<div>
		<span id="hy">
			{'v=' + v + ' n=' + n}
		</span>
		<button id="rerender" onClick={() => setN(n + 1)}>{'r'}</button>
	</div>
}

// useReducerAtom (deprecated, kept for parity).
export function ReducerApp(props: { count: any; reducer: any }) @{
	const [state, dispatch] = useReducerAtom(props.count, props.reducer);
	<div>
		<span id="rv">
			{'v=' + state}
		</span>
		<button id="dispatch-inc" onClick={() => dispatch({ type: 'inc' })}>{'+'}</button>
	</div>
}

// atomWithReducer smoke — the vanilla util driven through useAtom's setter.
export function WithReducerApp(props: { count: any }) @{
	const [v, dispatch] = useAtom(props.count);
	<div>
		<span id="wrv">
			{'v=' + v}
		</span>
		<button id="wr-inc" onClick={() => dispatch({ type: 'inc' })}>{'+'}</button>
	</div>
}

// splitAtom smoke — a keyed list of item atoms with add/toggle/remove.
export function SplitApp(props: { listAtom: any; itemAtomsAtom: any }) @{
	const [itemAtoms, dispatch] = useAtom(props.itemAtomsAtom);
	const setList = useSetAtom(props.listAtom);
	<div>
		<ul id="list">
			@for (const itemAtom of itemAtoms; key String(itemAtom)) {
				<SplitItem
					itemAtom={itemAtom}
					remove={() => dispatch({ type: 'remove', atom: itemAtom })}
				/>
			}
		</ul>
		<button
			id="add"
			onClick={() => setList(
				(prev: any[]) => [
					...prev,
					{ id: prev.length + 1, text: 'item' + (prev.length + 1), done: false },
				],
			)}
		>{'add'}</button>
	</div>
}

function SplitItem(props: { itemAtom: any; remove: any }) @{
	const [item, setItem] = useAtom(props.itemAtom);
	<li>
		<span id={'t-' + item.id} onClick={() => setItem({ ...item, done: !item.done })}>
			{item.text + (item.done ? ':done' : '')}
		</span>
		<button id={'rm-' + item.id} onClick={props.remove}>{'x'}</button>
	</li>
}
