import { create } from '@octanejs/zustand';
import { combine } from '@octanejs/zustand/middleware';

// `combine` middleware: split initial state from actions. Proves a zustand
// middleware (re-exported verbatim) composes with octane's `create`/`useStore`.
export const useCombined = create(
	combine(
		{ count: 0 },
		(set) => ({
			inc: () => set((s) => ({ count: s.count + 1 })),
		}),
	),
);

export function CombinedView() @{
	const count = useCombined((s) => s.count);
	const inc = useCombined((s) => s.inc);
	<button id="c" onClick={inc}>{count as string}</button>
}
