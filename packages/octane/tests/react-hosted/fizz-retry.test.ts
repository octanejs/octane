/**
 * Phase 0 spike — §9.1: request-local Fizz retry state for an unhandled
 * hosted-Octane server suspension, prototyping the `React.use(thenable)`
 * delegation (the plan's leading candidate).
 *
 * The hosted Octane server entry does not exist yet (Phase 4); these tests
 * drive real React 19 Fizz (`renderToPipeableStream`) with a component that
 * reproduces the exact hazard of a hosted Octane pass: EVERY Fizz replay runs
 * a fresh pass that creates FRESH thenable objects for the same logical
 * fetches (fresh resolved/memo maps), in the deterministic unwrap order
 * Octane's parallel-use strata already guarantee.
 *
 * Pinned Fizz semantics (React 19.2.7):
 *   - replay state is POSITIONAL: the nth `use()` in a retried task is served
 *     from the nth TRACKED thenable's settled result, so a fresh (even
 *     forever-pending) thenable per replay cannot loop a position that a
 *     prior attempt already reached;
 *   - BUT tracking only covers positions actually REACHED: a parallel
 *     stratum's created-but-not-yet-unwrapped thenables are NOT tracked, so a
 *     fresh pass re-tracks its own fresh replacements — duplicating fetch
 *     starts, discarding the original in-flight results, and adding one
 *     replay per stratum member. `React.use` delegation therefore REQUIRES
 *     persistent per-island memo state for parallel-use (§9.1's "combined
 *     with persistent Octane call-site memo state" is mandatory, not an
 *     optimization) — and Fizz's stable per-task props identity is a
 *     request-local key for exactly that state;
 *   - the positional match makes deterministic strata order a hard
 *     correctness requirement: a pass that unwraps in a different order on
 *     replay is silently served MISALIGNED values (demonstrated below);
 *   - rejections route through the tracked state to the Fizz boundary error
 *     path exactly once;
 *   - all replay state is request-local: overlapping renders with interleaved
 *     settlements never observe each other.
 */
import { describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { PassThrough } from 'node:stream';

const h = React.createElement;

function nextTurns(turns = 3): Promise<void> {
	let chain = Promise.resolve();
	for (let i = 0; i < turns; i++) {
		chain = chain.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
	}
	return chain;
}

interface IslandSession {
	attempts: number;
	starts: Record<string, number>;
	log: string[];
	startFetch(key: string): Promise<string>;
	settle(key: string, value: string): void;
	fail(key: string, reason: Error): void;
}

/**
 * One hosted-attempt session. `startFetch` always returns a FRESH promise —
 * a fresh Octane pass restarts its fetch creations — and only the FIRST
 * instance of each key can ever settle: if Fizz waited on a replay-created
 * thenable instead of its tracked state, the render would hang and the
 * bounded attempt-count assertions would fail.
 *
 * Settling also stamps `status`/`value`/`reason` in place, exactly like
 * Octane's `TrackedThenable` (and React's own thenable protocol): a memoized,
 * already-settled dependency must unwrap synchronously on replay instead of
 * costing another suspension round.
 */
function createIslandSession(): IslandSession {
	const resolvers = new Map<
		string,
		{ resolve: (value: string) => void; reject: (e: Error) => void; promise: Promise<string> }
	>();
	const session: IslandSession = {
		attempts: 0,
		starts: {},
		log: [],
		startFetch(key) {
			const count = (session.starts[key] = (session.starts[key] ?? 0) + 1);
			session.log.push(`start:${key}#${count}`);
			let entry: { resolve: (value: string) => void; reject: (e: Error) => void };
			const promise = new Promise<string>((resolve, reject) => {
				entry = { resolve, reject };
			});
			if (count === 1) resolvers.set(key, { ...entry!, promise });
			return promise;
		},
		settle(key, value) {
			const entry = resolvers.get(key)!;
			entry.resolve(value);
			(entry.promise as any).status = 'fulfilled';
			(entry.promise as any).value = value;
		},
		fail(key, reason) {
			const entry = resolvers.get(key)!;
			entry.reject(reason);
			(entry.promise as any).status = 'rejected';
			(entry.promise as any).reason = reason;
		},
	};
	return session;
}

interface AutoSession {
	attempts: number;
	starts: Record<string, number>;
	startFetch(key: string): Promise<string>;
}

/**
 * A session whose every fetch INSTANCE resolves (next macrotask) with an
 * instance-tagged value `key#n` — so the rendered output identifies WHICH
 * pass's fetch actually supplied each value.
 */
function createAutoSession(): AutoSession {
	const session: AutoSession = {
		attempts: 0,
		starts: {},
		startFetch(key) {
			const count = (session.starts[key] = (session.starts[key] ?? 0) + 1);
			return new Promise<string>((resolve) => {
				setTimeout(() => resolve(`${key}#${count}`), 0);
			});
		},
	};
	return session;
}

interface StreamedRender {
	html(): string;
	done: Promise<void>;
	errors: unknown[];
}

function renderPage(element: React.ReactNode): StreamedRender {
	let html = '';
	const errors: unknown[] = [];
	const sink = new PassThrough();
	sink.on('data', (chunk: Buffer) => {
		html += chunk.toString();
	});
	let resolveDone!: () => void;
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	sink.on('finish', resolveDone);
	const stream = renderToPipeableStream(element as any, {
		onAllReady() {
			stream.pipe(sink);
		},
		onError(error: unknown) {
			errors.push(error);
		},
	});
	return { html: () => html, done, errors };
}

function page(session: IslandSession, Island: (props: { session: IslandSession }) => any) {
	return h(
		'main',
		null,
		h(React.Suspense, { fallback: h('p', null, 'island loading') }, h(Island, { session })),
	);
}

describe('react-hosted island — Fizz retry via React.use(thenable) delegation (§9.1)', () => {
	it('completes sequential strata across replays that create fresh thenables every pass', async () => {
		function Island(props: { session: IslandSession }) {
			const session = props.session;
			session.attempts++;
			// Stratum 1, then a stratum that only exists once stratum 1 resolved —
			// the sequential shape of a dependent Octane fetch chain.
			const first = React.use(session.startFetch('A'));
			const second = React.use(session.startFetch('B'));
			return h('p', { className: 'island' }, `island:${first}+${second}`);
		}
		const session = createIslandSession();
		const render = renderPage(page(session, Island));

		await nextTurns();
		expect(session.attempts).toBe(1);
		expect(session.log).toEqual(['start:A#1']);

		session.settle('A', 'valA');
		await nextTurns();
		// The replay ran a fresh pass: A restarted (A#2 will never settle) but its
		// VALUE was served from the tracked first-attempt thenable; the pass
		// reached stratum 2 and suspended on B.
		expect(session.attempts).toBe(2);
		expect(session.log).toEqual(['start:A#1', 'start:A#2', 'start:B#1']);

		session.settle('B', 'valB');
		await render.done;
		// One replay per stratum — bounded, no retry spin on the fresh thenables.
		expect(session.attempts).toBe(3);
		expect(session.starts).toEqual({ A: 3, B: 2 });
		expect(render.errors).toEqual([]);
		expect(render.html()).toContain('island:valA+valB');
	});

	it('re-fetches and discards a parallel stratum without persistent memo state — the hazard', async () => {
		// A parallel stratum creates ALL its fetches before unwrapping any; the
		// first unwrap throws, so positions 1..K-1 were never REACHED and Fizz
		// tracked nothing for them. Each replay's fresh pass then re-tracks its
		// own fresh replacements: the original in-flight results are discarded,
		// every stratum member costs an extra replay, and fetch starts multiply.
		// This is why naked React.use delegation is NOT enough for octane's
		// parallel-use SSR contract.
		function Island(props: { session: AutoSession }) {
			const session = props.session;
			session.attempts++;
			const fetchA = session.startFetch('A');
			const fetchB = session.startFetch('B');
			const first = React.use(fetchA);
			const second = React.use(fetchB);
			return h('p', { className: 'island' }, `island:${first}+${second}`);
		}
		const session = createAutoSession();
		const render = renderPage(page(session as any, Island as any));

		await render.done;
		// Attempt 1 started A#1 and B#1 in parallel, but B's ORIGINAL result was
		// thrown away: the value that rendered is the SECOND B instance's, and
		// completing the two-fetch stratum took an extra replay.
		expect(session.attempts).toBe(3);
		expect(session.starts).toEqual({ A: 3, B: 3 });
		expect(render.html()).toContain('island:A#1+B#2');
		expect(render.errors).toEqual([]);
	});

	it('completes a parallel stratum in one replay with replay-persistent memo keyed on task props identity', async () => {
		// The production shape for §9.1: delegation PLUS persistent per-island
		// memo state. Fizz replays a task with the IDENTICAL props object, so a
		// WeakMap keyed on the props transport is request-local (no module-global
		// request state, no AsyncLocalStorage) and survives every replay of this
		// island — the replay reuses the ORIGINAL thenables, positional tracking
		// coincides with identity, and K independent fetches cost one round.
		const memo = new WeakMap<object, { fetchA: Promise<string>; fetchB: Promise<string> }>();
		function Island(props: { session: IslandSession }) {
			const session = props.session;
			session.attempts++;
			let fetches = memo.get(props);
			if (fetches === undefined) {
				fetches = { fetchA: session.startFetch('A'), fetchB: session.startFetch('B') };
				memo.set(props, fetches);
			}
			const first = React.use(fetches.fetchA);
			const second = React.use(fetches.fetchB);
			return h('p', { className: 'island' }, `island:${first}+${second}`);
		}
		const session = createIslandSession();
		const render = renderPage(page(session, Island));

		await nextTurns();
		// Both fetches started once, in the first pass, before any suspension.
		expect(session.attempts).toBe(1);
		expect(session.log).toEqual(['start:A#1', 'start:B#1']);

		session.settle('A', 'parA');
		session.settle('B', 'parB');
		await render.done;
		// One replay serves BOTH positions from the original thenables: no
		// re-fetch, no discarded results, no extra replay per stratum member.
		expect(session.attempts).toBe(2);
		expect(session.starts).toEqual({ A: 1, B: 1 });
		expect(render.html()).toContain('island:parA+parB');
		expect(render.errors).toEqual([]);
	});

	it('serves MISALIGNED values when a replay unwraps in a different order — determinism is mandatory', async () => {
		// The design constraint this pins: Fizz replay state is positional, keyed
		// by use() call index, NOT by thenable identity. A hosted pass whose
		// unwrap order varies between replays is silently handed the wrong
		// values. Octane's strata order must therefore be deterministic across
		// replays (it already is by design).
		function Island(props: { session: AutoSession }) {
			const session = props.session;
			const attempt = ++session.attempts;
			const fetchA = session.startFetch('A');
			const fetchB = session.startFetch('B');
			let first: string;
			let second: string;
			if (attempt === 1) {
				first = React.use(fetchA);
				second = React.use(fetchB);
			} else {
				// Replay unwraps in the OPPOSITE order.
				second = React.use(fetchB);
				first = React.use(fetchA);
			}
			return h('p', { className: 'island' }, `a=${first} b=${second}`);
		}
		const session = createAutoSession();
		const render = renderPage(page(session as any, Island as any));

		await render.done;
		// Position 0 was tracked as an A-instance; the replay asked for B there
		// and was served A's value. The island rendered crossed data with no
		// error anywhere.
		expect(render.html()).toContain('a=A#2 b=A#1');
		expect(render.errors).toEqual([]);
	});

	it('routes a rejected tracked fetch to the Fizz boundary error path exactly once', async () => {
		function Island(props: { session: IslandSession }) {
			const session = props.session;
			session.attempts++;
			const value = React.use(session.startFetch('A'));
			return h('p', { className: 'island' }, `island:${value}`);
		}
		const session = createIslandSession();
		const render = renderPage(page(session, Island));

		await nextTurns();
		session.fail('A', new Error('fetch A failed'));
		await render.done;

		// The replay was served the tracked rejection and threw it into the
		// boundary: one error, bounded attempts, fallback in the shell (the
		// boundary is left for client recovery).
		expect(render.errors.map((error) => (error as Error).message)).toEqual(['fetch A failed']);
		expect(session.attempts).toBe(2);
		expect(session.starts).toEqual({ A: 2 });
		expect(render.html()).toContain('island loading');
		expect(render.html()).not.toContain('island:');
	});

	it('keeps replay state request-local across overlapping renders', async () => {
		function Island(props: { session: IslandSession }) {
			const session = props.session;
			session.attempts++;
			const first = React.use(session.startFetch('A'));
			const second = React.use(session.startFetch('B'));
			return h('p', { className: 'island' }, `island:${first}+${second}`);
		}
		const sessionOne = createIslandSession();
		const sessionTwo = createIslandSession();
		const renderOne = renderPage(page(sessionOne, Island));
		const renderTwo = renderPage(page(sessionTwo, Island));

		await nextTurns();
		// Interleave settlements across the two in-flight requests.
		sessionOne.settle('A', 'one-A');
		sessionTwo.settle('A', 'two-A');
		await nextTurns();
		sessionTwo.settle('B', 'two-B');
		sessionOne.settle('B', 'one-B');
		await Promise.all([renderOne.done, renderTwo.done]);

		expect(renderOne.html()).toContain('island:one-A+one-B');
		expect(renderTwo.html()).toContain('island:two-A+two-B');
		expect(renderOne.html()).not.toContain('two-');
		expect(renderTwo.html()).not.toContain('one-');
		expect(sessionOne.attempts).toBe(3);
		expect(sessionTwo.attempts).toBe(3);
	});
});
