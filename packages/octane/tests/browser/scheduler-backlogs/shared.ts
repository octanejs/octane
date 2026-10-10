export type Scenario =
	'query' | 'queries' | 'derived' | 'actions' | 'islands' | 'rpc' | 'renderer' | 'deferred';
const params = new URL(location.href).searchParams;
export const scenario = params.get('scenario') as Scenario;
export const count = Number(params.get('count') ?? (scenario === 'islands' ? 60 : 100));
export const producers = Number(params.get('producers') ?? 1);
export const cold = params.get('mode') === 'cold';
export const blocked = params.get('mode') === 'blocked';
const actionWorkMs = Number(params.get('actionWorkMs') ?? 0);
export const workMs = Number(params.get('workMs') ?? 2);
export const manyRoots = params.get('roots') === 'many';
export const state = {
	scenario,
	count,
	producers,
	startedAt: 0,
	completedAt: 0,
	sourceCompletedAt: 0,
	finalCommitAt: 0,
	firstValueAt: 0,
	firstCommitAt: 0,
	readyAt: 0,
	values: [] as number[],
	publications: Array.from({ length: producers }, () => [] as number[]),
	commits: 0,
	effects: 0,
	effectCleanups: 0,
	activations: [] as number[],
	adopted: 0,
	inputs: [] as { trusted: boolean; progress: number; at: number }[],
	frames: [] as { at: number; progress: number; useful: boolean }[],
	errors: [] as string[],
};
export function burn(ms: number): void {
	const start = performance.now();
	while (performance.now() - start < ms) {}
}
export const task = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
export function observe(value: number, producer = 0): void {
	state.firstValueAt ||= performance.now();
	state.values.push(value);
	state.publications[producer].push(value);
	if (scenario !== 'actions' && scenario !== 'deferred') burn(workMs);
	else if (scenario === 'actions' && actionWorkMs) burn(actionWorkMs);
}
export function completeSource(): void {
	state.sourceCompletedAt = performance.now();
	if (state.finalCommitAt)
		state.completedAt = Math.max(state.sourceCompletedAt, state.finalCommitAt);
}
export function commit(value: number, pending = false, complete = value === count): void {
	state.commits++;
	if (state.startedAt && value) state.firstCommitAt ||= performance.now();
	if (state.startedAt && complete && !pending) {
		state.finalCommitAt = performance.now();
		if (state.sourceCompletedAt)
			state.completedAt = Math.max(state.sourceCompletedAt, state.finalCommitAt);
	}
}
export function effect(): () => void {
	state.effects++;
	return () => {
		state.effectCleanups++;
	};
}
export function input(event: Event, start: () => void): string {
	state.inputs.push({
		trusted: event.isTrusted,
		progress: state.values.length,
		at: performance.now(),
	});
	if (!state.startedAt) {
		state.startedAt = performance.now();
		performance.mark('backlog-start');
		requestAnimationFrame(function frame() {
			state.frames.push({
				at: performance.now(),
				progress: state.values.length,
				useful: state.firstCommitAt > 0,
			});
			if (!state.completedAt) requestAnimationFrame(frame);
		});
		start();
	}
	return (event.target as HTMLInputElement).value;
}
export function buffered(gate: Promise<void>): AsyncIterable<number> {
	return {
		[Symbol.asyncIterator]() {
			let value = 0;
			return {
				async next() {
					await gate;
					if (cold) await task();
					return value < count ? { done: false, value: ++value } : { done: true, value: undefined };
				},
			};
		},
	};
}
// Both direct readers get identical records, either in one ready chunk, as tiny
// fragments (records cross reads), or one pending chunk per native timer turn.
export function response(bytes: Uint8Array): Response {
	const size = params.get('chunks') === 'fragmented' ? 17 : bytes.length;
	let offset = 0;
	return new Response(
		new ReadableStream({
			async pull(controller) {
				if (cold) await task();
				if (offset >= bytes.length) {
					controller.close();
					return;
				}
				controller.enqueue(bytes.slice(offset, (offset += size)));
			},
		}),
	);
}
window.__schedulerBacklog = state;
declare global {
	interface Window {
		__schedulerBacklog: typeof state;
		__schedulerDispose: () => void;
		__schedulerEvents: { interactionId: number; duration: number; startTime: number }[];
	}
}
