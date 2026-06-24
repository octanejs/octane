import { create } from '@octane-ts/zustand';

// Self-contained stateful fixture for the differential rig: the SAME source runs
// on octane (via @octane-ts/zustand) AND on React (the setup rewrites the import
// to real `zustand`), and the rig asserts byte-identical innerHTML after each
// click. Exercises independent slices, a derived selector, and an action.
const useStore = create(
	(set) => ({
		count: 0,
		other: 0,
		inc: () => set((s) => ({ count: s.count + 1 })),
		incOther: () => set((s) => ({ other: s.other + 1 })),
		reset: () => set({ count: 0, other: 0 }),
	}),
);

export function Counter() @{
	const count = useStore((s) => s.count);
	const other = useStore((s) => s.other);
	const doubled = useStore((s) => s.count * 2);
	const inc = useStore((s) => s.inc);
	const incOther = useStore((s) => s.incOther);
	const reset = useStore((s) => s.reset);
	<div>
		<span id="count">
			{count as string}
		</span>
		<span id="other">
			{other as string}
		</span>
		<span id="doubled">
			{doubled as string}
		</span>
		<button id="inc" onClick={inc}>inc</button>
		<button id="incOther" onClick={incOther}>incOther</button>
		<button id="reset" onClick={reset}>reset</button>
	</div>
}
