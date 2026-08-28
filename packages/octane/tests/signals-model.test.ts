import { describe, expect, it } from 'vitest';
import { createScope, query, ScopeDisposedError, type AdoptionFrame } from 'octane/signals';
import { deferred, drainProducers, type Deferred } from './_fixtures/signals-async-controls';
import { makeRng, makeRootRng } from './conformance/_helpers/fuzz-prng';

type Result = { readonly request: number; readonly value: string };
type View = { readonly title: string; readonly result: Result | 'local' };
type Expected =
	| { readonly status: 'pending'; readonly refreshing: false; readonly complete: false }
	| {
			readonly status: 'error';
			readonly error: Error;
			readonly refreshing: false;
			readonly complete: false;
	  }
	| {
			readonly status: 'ready';
			readonly value: Result;
			readonly refreshing: boolean;
			readonly complete: boolean;
	  };

interface Attempt extends Deferred<Result> {
	readonly request: number;
	readonly signal: AbortSignal;
	settled: boolean;
}

function retryState(previous: Expected, pending: boolean): Expected {
	return !pending && previous.status === 'ready'
		? { ...previous, refreshing: true, complete: false }
		: { status: 'pending', refreshing: false, complete: false };
}

const rootRng = makeRootRng('scoped-signals-model');
const cases = Array.from({ length: 50 }, (_, index) => ({
	index,
	seed: rootRng.intBetween(0, 0xffffffff),
}));

describe('scoped signals against an independent operation model', () => {
	it.each(cases)(
		'preserves observable state through generated sequence $index (seed $seed)',
		async ({ seed }) => {
			const rng = makeRng(seed);
			const scope = createScope({ scopeKey: `model-${seed}` });
			const attempts: Attempt[] = [];
			const trace: unknown[] = [];
			const frames: { frame: AdoptionFrame; expected: unknown[] }[] = [];
			let selected = 0;
			let title = 'initial';
			let local = false;
			let current = 0;
			let state: Expected = { status: 'pending', refreshing: false, complete: false };
			let retained: Result | undefined;
			let retainedView: View | undefined;

			const selected$ = scope.signal$('selected', selected);
			const title$ = scope.signal$('title', title);
			const local$ = scope.signal$('local', local);
			const load = query('load', (request: number, { signal }) => {
				const attempt = { ...deferred<Result>(), request, signal, settled: false };
				attempts.push(attempt);
				return attempt.promise;
			});
			const result$ = scope.asyncSignal$('result', () => load(selected$.get()));
			const view$ = scope.derived$('view', () => ({
				title: title$.get(),
				result: local$.get() ? ('local' as const) : result$.get(),
			}));

			function observe$() {
				expect([selected$.get(), title$.get(), local$.get()]).toEqual([selected, title, local]);
				expect(result$.snapshot()).toMatchObject(state);
				if (state.status === 'ready') {
					retained = state.value;
					expect(result$.get()).toEqual(state.value);
				} else if (state.status === 'pending') {
					expect(scope.isPending(() => result$.get())).toBe(true);
				} else {
					expect(() => result$.get()).toThrow(state.error);
				}
				expect(result$.latest(null)).toEqual(retained ?? null);

				const snapshot = view$.snapshot();
				if (local || state.status === 'ready') {
					const value: View = {
						title,
						result: local ? 'local' : (state as { value: Result }).value,
					};
					retainedView = value;
					expect(snapshot).toMatchObject({ status: 'ready', value });
					expect(view$.get()).toEqual(value);
				} else {
					expect(snapshot.status).toBe(state.status);
					if (state.status === 'error') expect(snapshot).toMatchObject({ error: state.error });
				}
				expect(view$.latest(null)).toEqual(retainedView ?? null);
				for (const { frame, expected } of frames) {
					if (frame.released) continue;
					expect(
						frame.run(() => [
							selected$.get(),
							title$.get(),
							local$.get(),
							result$.latest(null),
							view$.latest(null),
						]),
					).toEqual(expected);
				}
			}

			try {
				observe$();
				for (let step = 0; step < 100; step++) {
					const command = rng.intBelow(9);
					if (command === 0) {
						const next = rng.intBelow(4);
						trace.push(['select', next]);
						const starts = attempts.length;
						selected$.set(next);
						if (next !== selected) {
							selected = next;
							current = starts;
							state = { status: 'pending', refreshing: false, complete: false };
							expect(attempts).toHaveLength(starts + 1);
						} else expect(attempts).toHaveLength(starts);
					} else if (command === 1) {
						const pending = rng.bool();
						trace.push(['retry', pending]);
						current = attempts.length;
						result$.retry({ pending });
						expect(attempts).toHaveLength(current + 1);
						state = retryState(state, pending);
					} else if (command === 2 || command === 3) {
						const index = rng.intBelow(attempts.length);
						const attempt = attempts[index]!;
						trace.push([command === 2 ? 'resolve' : 'reject', index]);
						const value = { request: attempt.request, value: `${seed}:${step}` };
						const error = new Error(`failure:${seed}:${step}`);
						if (command === 2) attempt.resolve(value);
						else attempt.reject(error);
						if (!attempt.settled && index === current) {
							state =
								command === 2
									? { status: 'ready', value, refreshing: false, complete: true }
									: { status: 'error', error, refreshing: false, complete: false };
						}
						attempt.settled = true;
						await drainProducers();
					} else if (command === 4) {
						local = !local;
						title = `title:${step}`;
						trace.push(['batch', local, title]);
						scope.batch(() => {
							local$.set(local);
							title$.set(title);
						});
					} else if (command === 5) {
						trace.push(['frame']);
						frames.push({
							frame: scope.beginAdoption(scope.serialize()),
							expected: [selected, title, local, retained ?? null, retainedView ?? null],
						});
					} else if (command === 6 || command === 7) {
						const active = frames.filter(({ frame }) => !frame.released);
						if (active.length) {
							const chosen = rng.pick(active);
							trace.push([command === 6 ? 'release' : 'retain', frames.indexOf(chosen)]);
							if (command === 6) chosen.frame.release();
							else frames.push({ frame: chosen.frame.retain(), expected: chosen.expected });
						}
					} else {
						trace.push(['read']);
					}
					observe$();
				}
				scope.dispose();
				for (const attempt of attempts) {
					if (!attempt.settled) expect(attempt.signal.aborted).toBe(true);
					attempt.resolve({ request: attempt.request, value: 'after-retirement' });
				}
				await drainProducers();
				expect(() => result$.latest(null)).toThrow(ScopeDisposedError);
				expect(() => view$.get()).toThrow(ScopeDisposedError);
				expect(frames.every(({ frame }) => frame.released)).toBe(true);
			} catch (error) {
				throw new Error(
					`Scoped signal model failed: seed=${seed}, OCTANE_FUZZ_SEED=${process.env.OCTANE_FUZZ_SEED ?? 'default'}\ntrace=${JSON.stringify(trace)}`,
					{ cause: error },
				);
			} finally {
				scope.dispose();
			}
		},
	);
});
