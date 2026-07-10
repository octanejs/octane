// One independent parallel step: resolves after a REAL timer (so serial vs
// parallel registration shows up as wall time, unlike the microtask-resolved
// waterfall steps) to a deterministic per-level value. Levels the config
// doesn't exercise (`active` false) resolve immediately with 0 so the fixture
// keeps a fixed body shape across k.
export const PAR_LATENCY_MS = 4;

export function parStep(level: number, active: boolean): Promise<number> {
	if (!active) return Promise.resolve(0);
	return new Promise((resolve) => setTimeout(() => resolve(level * 101), PAR_LATENCY_MS));
}

// Analytic expectation for the harness gate.
export function expectedParallelSum(k: number): number {
	let sum = 0;
	for (let level = 1; level <= k; level++) sum += level * 101;
	return sum;
}
