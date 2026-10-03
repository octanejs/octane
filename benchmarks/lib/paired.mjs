// Paired sampling for cross-target timing guards.
//
// A ratio guard divides two targets' scores from the same run. When each
// target runs its whole sample block before the next starts, runner drift
// between the blocks (a noisy neighbour, thermal state, a background GC)
// lands on one side of the ratio only. Interleaving the targets per sample
// round puts both sides of every guard inside the same few hundred
// milliseconds, so drift moves them together.
//
// `roundOrder` rotates the visit order by the round index, so no target
// always runs first after the shared setup or last before the next round.
export function roundOrder(items, round) {
	const n = items.length;
	if (n === 0) return [];
	const k = round % n;
	return [...items.slice(k), ...items.slice(0, k)];
}

// Each sample should take about this long. Chromium clamps performance.now()
// to 100 µs for pages that are not cross-origin isolated, so a sample this long
// holds the clock's quantization under 1%, and per-op JIT, GC, and scheduling
// jitter averages out across the repetitions inside it.
export const SAMPLE_MS = 20;

// The repetition count that brings one sample to about SAMPLE_MS, given the
// measured duration of `reps` repetitions. It never shrinks below `reps`, so an
// operation that already takes SAMPLE_MS keeps its declared batch.
export function calibratedReps(reps, elapsedMs, maxReps) {
	if (!(elapsedMs > 0)) return Math.min(maxReps, reps * 10);
	if (elapsedMs >= SAMPLE_MS) return reps;
	return Math.min(maxReps, Math.max(reps, Math.ceil((reps * SAMPLE_MS) / elapsedMs)));
}
