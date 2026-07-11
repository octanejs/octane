import { atom, useAtom, useAtomValue, useSetAtom } from '@octanejs/jotai';

// Self-contained stateful fixture for the differential rig: the SAME source
// runs on octane (via @octanejs/jotai) AND on React (the setup rewrites the
// import to real `jotai`), and the rig asserts byte-identical innerHTML after
// each click. Exercises a primitive atom, a derived atom, and a write-only
// setter — all three core hooks.
const countAtom = atom(0);
const doubleAtom = atom((get) => get(countAtom) * 2);

export function Counter() @{
	const [count, setCount] = useAtom(countAtom);
	const double = useAtomValue(doubleAtom);
	const set = useSetAtom(countAtom);
	<div>
		<span id="count">
			{count as string}
		</span>
		<span id="double">
			{double as string}
		</span>
		<button id="inc" onClick={() => setCount((c) => c + 1)}>inc</button>
		<button id="reset" onClick={() => set(0)}>reset</button>
	</div>
}
