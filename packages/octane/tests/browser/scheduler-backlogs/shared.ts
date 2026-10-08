export type Scenario = 'query' | 'derived' | 'actions' | 'islands';
export const scenario = new URL(location.href).searchParams.get('scenario') as Scenario;
export const count = scenario === 'islands' ? 60 : 100;
export const state = {
	scenario,
	count,
	startedAt: 0,
	completedAt: 0,
	sourceCompletedAt: 0,
	finalCommitAt: 0,
	values: [] as number[],
	commits: 0,
	activations: [] as number[],
	adopted: 0,
	inputs: [] as { trusted: boolean; progress: number; at: number }[],
	errors: [] as string[],
};
export function burn(ms: number): void {
	const start = performance.now();
	while (performance.now() - start < ms) {}
}
export function observe(value: number): void {
	state.values.push(value);
	if (scenario !== 'actions') burn(2);
	else if (value === count) completeSource();
}
export function completeSource(): void {
	state.sourceCompletedAt = performance.now();
	if (state.finalCommitAt)
		state.completedAt = Math.max(state.sourceCompletedAt, state.finalCommitAt);
}
export function commit(value: number, pending = false): void {
	state.commits++;
	if (state.startedAt && value === count && !pending) {
		state.finalCommitAt = performance.now();
		if (state.sourceCompletedAt)
			state.completedAt = Math.max(state.sourceCompletedAt, state.finalCommitAt);
	}
}
export function input(event: Event, start: () => void): string {
	state.inputs.push({
		trusted: event.isTrusted,
		progress: state.values.length,
		at: performance.now(),
	});
	if (!state.startedAt) {
		state.startedAt = performance.now();
		start();
	}
	return (event.target as HTMLInputElement).value;
}
export function buffered(gate: Promise<void>): AsyncIterable<number> {
	return {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				next: () =>
					gate.then(() =>
						value < count ? { done: false, value: ++value } : { done: true, value: undefined },
					),
			};
		},
	};
}
window.__schedulerBacklog = state;
declare global {
	interface Window {
		__schedulerBacklog: typeof state;
		__schedulerEvents: { interactionId: number; duration: number; startTime: number }[];
	}
}
