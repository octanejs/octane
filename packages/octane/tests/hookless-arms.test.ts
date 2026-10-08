import { describe, expect, it } from 'vitest';
import { act, createLog, flushEffects, mount } from './_helpers';
import { flushSync, startTransition, type ComponentBody } from '../src/index.js';
import {
	ActivityHooked,
	ActivityPlain,
	RollbackHooked,
	RollbackPlain,
	RowsHooked,
	RowsPlain,
	SuspendHooked,
	SuspendPlain,
	SwapHooked,
	SwapPlain,
} from './_fixtures/hookless-arms.tsrx';

// An @if or @switch arm that calls no hook has no state of its own. Mounting,
// swapping, hiding, suspending and tearing it down must look exactly like the
// same arm with a hook, for its DOM, its nested components' effects and refs,
// and their cleanup order. Every scenario drives both forms the same way and
// compares what each produced after every step.

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

interface Run<P> {
	render(props: P): void;
	log: (entry: string) => void;
	ref: (el: Element | null) => void;
}

async function compare<P>(
	plain: ComponentBody<P>,
	hooked: ComponentBody<P>,
	initial: (run: Run<P>) => P,
	steps: Array<(run: Run<P>) => void | Promise<void>>,
): Promise<string[][]> {
	const runs = [plain, hooked].map((body) => {
		const log = createLog();
		const run: Run<P> = {
			render() {},
			log: log.push,
			ref: (el) => log.push(el === null ? 'ref null' : 'ref ' + el.tagName),
		};
		const r = mount(body, initial(run));
		run.render = (next) => r.root.render(body, next);
		flushEffects();
		return { run, r, log, html: [r.html()], logs: [log.drain()] };
	});
	for (const step of steps) {
		for (const each of runs) {
			await step(each.run);
			await act(async () => {});
			flushEffects();
			each.html.push(each.r.html());
			each.logs.push(each.log.drain());
		}
	}
	for (const each of runs) {
		each.r.unmount();
		flushEffects();
		each.logs.push(each.log.drain());
	}
	expect(runs[0].html).toEqual(runs[1].html);
	expect(runs[0].logs).toEqual(runs[1].logs);
	return runs[0].logs;
}

describe('hookless control-flow arms', () => {
	it('swap nested components, refs and siblings in tree order', async () => {
		const swap = (on: boolean) => (run: Run<any>) =>
			flushSync(() => run.render({ on, log: run.log, refLog: run.ref }));
		const logs = await compare(
			SwapPlain,
			SwapHooked,
			(run) => ({ on: true, log: run.log, refLog: run.ref }),
			[swap(false), swap(true)],
		);
		// The first mount attaches the arm's ref and mounts its component in tree order.
		expect(logs[0]).toEqual([
			'ref B',
			'layout first',
			'layout on',
			'layout last',
			'effect first',
			'effect on',
			'effect last',
		]);
		// Unmounting tears the arm's component down between its siblings.
		expect(logs[logs.length - 1].filter((entry) => entry.startsWith('layout'))).toEqual([
			'layout cleanup first',
			'layout cleanup on',
			'layout cleanup last',
		]);
	});

	it('tear a mounted arm down between its siblings when its owner unmounts', async () => {
		// A committed swap renders the incoming arm offscreen first, so unmount
		// straight after mounting to tear down the arm the first render created.
		const logs = await compare(
			SwapPlain,
			SwapHooked,
			(run) => ({ on: true, log: run.log, refLog: run.ref }),
			[],
		);
		expect(logs[1].filter((entry) => entry.startsWith('layout'))).toEqual([
			'layout cleanup first',
			'layout cleanup on',
			'layout cleanup last',
		]);
		expect(logs[1]).toContain('ref null');
	});

	it('keep the outgoing arm while a transition into a suspending arm waits', async () => {
		const pending = deferred<string>();
		const logs = await compare(
			SuspendPlain,
			SuspendHooked,
			(run) => ({ which: 'a' as const, promise: pending.promise, log: run.log }),
			[
				(run) =>
					startTransition(() => run.render({ which: 'b', promise: pending.promise, log: run.log })),
				async () => {
					await act(async () => pending.resolve('ready'));
				},
			],
		);
		// While the transition waits, nothing tears down and the old arm stays.
		expect(logs[1]).toEqual([]);
		expect(logs[2]).toEqual(['layout cleanup a', 'layout b', 'effect cleanup a', 'effect b']);
	});

	it('keep keyed rows whose sole root is an arm in order across swaps and moves', async () => {
		const rows = (ids: number[], on: number[]) => ids.map((id) => ({ id, on: on.includes(id) }));
		const set = (ids: number[], on: number[]) => (run: Run<any>) =>
			flushSync(() => run.render({ items: rows(ids, on) }));
		await compare(RowsPlain, RowsHooked, () => ({ items: rows([1, 2, 3, 4, 5], [2, 4]) }), [
			set([1, 2, 3, 4, 5], [1, 2, 5]),
			set([5, 3, 1, 4, 2], [1, 2, 5]),
			set([3, 6, 1, 2], [3, 6]),
			set([2, 1, 6, 3, 7], []),
		]);
	});

	it('disconnect and reconnect a hidden arm’s effects with its Activity', async () => {
		const set = (mode: 'visible' | 'hidden', on: boolean) => (run: Run<any>) =>
			flushSync(() => run.render({ mode, on, log: run.log }));
		const logs = await compare(
			ActivityPlain,
			ActivityHooked,
			(run) => ({ mode: 'visible' as const, on: true, log: run.log }),
			[set('hidden', true), set('hidden', false), set('hidden', true), set('visible', true)],
		);
		expect(logs[1]).toEqual(['layout cleanup inside', 'effect cleanup inside']);
		expect(logs[4]).toEqual(['layout inside', 'effect inside']);
	});

	it('restore the outgoing arm when its root render suspends outside a boundary', async () => {
		const pending = deferred<string>();
		const logs = await compare(
			RollbackPlain,
			RollbackHooked,
			(run) => ({ on: true, promise: null as Promise<string> | null, log: run.log }),
			[
				(run) =>
					startTransition(() => run.render({ on: false, promise: pending.promise, log: run.log })),
				async () => {
					await act(async () => pending.resolve('done'));
				},
				(run) => flushSync(() => run.render({ on: true, promise: null, log: run.log })),
			],
		);
		expect(logs[1]).toEqual([]);
		expect(logs[2]).toEqual(['layout cleanup on', 'layout off', 'effect cleanup on', 'effect off']);
	});
});
