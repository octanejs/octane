import { mulberry32, wordPicker } from './prng';

// Bulk content for the waterfall page: 240 rows x 4 elements each (~960 nodes,
// ~1000 with the page chrome + chain levels). The point of the bulk is that
// render()'s suspense retry loop re-renders the WHOLE tree once per pass, so
// total render time should scale ~linearly with (depth + 1).
export interface WaterfallRow {
	id: number;
	label: string;
	score: number;
}

const rand = mulberry32(4242);
const pick = wordPicker(rand);

export const ROWS: WaterfallRow[] = Array.from({ length: 240 }, (_, i) => ({
	id: i + 1,
	label: pick() + ' ' + pick() + ' ' + pick(),
	score: Math.floor(rand() * 1000),
}));

// One waterfall step: resolves on a MICROTASK (zero latency) to a value derived
// from the previous level's value. Level N's thenable takes prev = level N-1's
// RESOLVED value, so it cannot settle usefully until the pass in which N-1 has
// already resolved — a strict sequential waterfall: depth D costs D+1 render
// passes (pass K suspends at level K; the final pass renders everything).
export function step(level: number, prev: number): Promise<number> {
	return Promise.resolve().then(() => (prev * 31 + level) | 0);
}

// The chain starts at prev = 1; the harness gate asserts the final level's
// rendered value equals this (proving all D passes actually ran in sequence).
export function expectedChainValue(depth: number): number {
	let v = 1;
	for (let level = 1; level <= depth; level++) v = (v * 31 + level) | 0;
	return v;
}
