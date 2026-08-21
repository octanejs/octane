import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { setImmediate as nextHostTurn } from 'node:timers/promises';
import { act as reactAct, createElement, type ComponentType } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as reactFlushSync } from 'react-dom';
import {
	act as octaneAct,
	createRoot as createOctaneRoot,
	flushSync as octaneFlushSync,
} from '../../src/index.js';
import { normaliseHtml, preloadDifferentialFixture } from './_rig.js';
import type {
	TimingProps,
	TimingPairProps,
	NestedTimingProps,
	RawTimingProps,
	InitialStateTimingProps,
	ActivityTimingProps,
} from '../_fixtures/suspense-timing.tsrx';

// React captures its host timers when it imports. Install the clock before its
// import. Timing observations stay outside act, which bypasses React's throttle;
// the separate act-specific cases below pin that explicit testing behavior.
vi.hoisted(() => {
	vi.useFakeTimers({
		toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'],
	});
});

// React 19.2.7, pinned by pnpm-lock.yaml and audit/react-upstreams.json:
// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js
// The same authored fixture and timed interactions run against both renderers.
const FIXTURE = resolve(__dirname, '../_fixtures/suspense-timing.tsrx');
const [octaneFixture, reactFixture] = await preloadDifferentialFixture(FIXTURE);
type Runtime = 'react' | 'octane';
type FixtureName =
	| 'TimedBoundary'
	| 'CatchingTimedBoundary'
	| 'UncaughtTimedBoundary'
	| 'TimedPair'
	| 'TimedNested'
	| 'RawTimedBoundary'
	| 'InitialStateTimedBoundary'
	| 'StatefulFallbackTimedBoundary'
	| 'ActivityTimedBoundary'
	| 'NestedActivityTimedBoundary';
type Props =
	| TimingProps
	| TimingPairProps
	| NestedTimingProps
	| RawTimingProps
	| InitialStateTimingProps
	| ActivityTimingProps;

interface TimingRoot {
	container: HTMLDivElement;
	caughtErrors: unknown[];
	update(props: Props): void;
	click(selector: string): void;
	unmount(): void;
}

const roots = new Set<TimingRoot>();
const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let previousActEnvironment: boolean | undefined;

beforeAll(() => {
	previousActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
	environment.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(async () => {
	// Keep time monotonic across cases. Each renderer has a process-global
	// recent-fallback timestamp; no private reset is needed after its window ends.
	await advance(1000);
});

afterEach(async () => {
	for (const root of roots) root.unmount();
	roots.clear();
	await advance();
	await vi.runAllTimersAsync();
});

afterAll(() => {
	environment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
	vi.useRealTimers();
});

function deferred() {
	let resolve!: (value: string) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<string>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function fulfilled(value: string): Promise<string> {
	return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
}

function reader(resource: ReturnType<typeof deferred>): () => string {
	let state: 'pending' | 'fulfilled' | 'rejected' = 'pending';
	let value: string;
	let error: Error;
	resource.promise.then(
		(result) => {
			state = 'fulfilled';
			value = result;
		},
		(reason) => {
			state = 'rejected';
			error = reason;
		},
	);
	return () => {
		if (state === 'pending') throw resource.promise;
		if (state === 'rejected') throw error;
		return value;
	};
}

function mount(
	runtime: Runtime,
	name: FixtureName,
	props: Props,
	errorOptions: { onUncaughtError?: (error: unknown) => void } = {},
): TimingRoot {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const fixture = (runtime === 'react' ? reactFixture : octaneFixture)[name];
	const caughtErrors: unknown[] = [];
	const options = {
		...errorOptions,
		onCaughtError: (error: unknown) => caughtErrors.push(error),
	};
	const root =
		runtime === 'react'
			? createReactRoot(container, options)
			: createOctaneRoot(container, options);
	const flush = runtime === 'react' ? reactFlushSync : octaneFlushSync;
	const render = (next: Props) => {
		flush(() => {
			if (runtime === 'react') {
				(root as ReturnType<typeof createReactRoot>).render(
					createElement(fixture as ComponentType<Props>, next),
				);
			} else {
				(root as ReturnType<typeof createOctaneRoot>).render(fixture, next);
			}
		});
	};
	let mounted = true;
	const result: TimingRoot = {
		container,
		caughtErrors,
		update: render,
		click(selector) {
			const button = container.querySelector<HTMLButtonElement>(selector);
			if (!button) throw new Error(`No button matching ${selector}`);
			flush(() => button.click());
		},
		unmount() {
			if (!mounted) return;
			mounted = false;
			flush(() => root.unmount());
			container.remove();
			roots.delete(result);
		},
	};
	roots.add(result);
	render(props);
	return result;
}

async function advance(ms = 0): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
	// Leave Scheduler's setImmediate host loop real and drain its continuations
	// without advancing the clock. Faking it adds a synthetic 1ms to nested
	// callbacks, which changes the behavior at the <=10ms cutoff.
	for (let turn = 0; turn < 4; turn++) await nextHostTurn();
}

async function act(runtime: Runtime, fn: () => void): Promise<void> {
	const previous = environment.IS_REACT_ACT_ENVIRONMENT;
	environment.IS_REACT_ACT_ENVIRONMENT = true;
	try {
		if (runtime === 'react') await reactAct(fn);
		else await octaneAct(fn);
	} finally {
		environment.IS_REACT_ACT_ENVIRONMENT = previous;
	}
}

function visible(root: TimingRoot): string {
	return [
		...root.container.querySelectorAll<HTMLElement>('[data-value], [data-fallback], [data-error]'),
	]
		.filter((node) => {
			for (let ancestor: HTMLElement | null = node; ancestor; ancestor = ancestor.parentElement) {
				if (ancestor.style.display === 'none') return false;
			}
			return true;
		})
		.map((node) => node.textContent)
		.join('|');
}

function otherInitialValues(root: TimingRoot): Array<string | null | undefined> {
	const content = root.container.querySelector('[data-value]');
	return ['data-initial-ref', 'data-initial-memo', 'data-initial-reducer'].map((attribute) =>
		content?.getAttribute(attribute),
	);
}

describe.each<Runtime>(['react', 'octane'])('%s Suspense retry timing', (runtime) => {
	it('keeps a fallback visible when data resolves at 100ms, then reveals at 300ms', async () => {
		const resource = deferred();
		const layouts: string[] = [];
		const refs: Array<HTMLSpanElement | null> = [];
		const root = mount(runtime, 'TimedBoundary', {
			promise: resource.promise,
			label: 'first',
			onLayout: (value) => layouts.push(value),
			onRef: (node) => {
				refs.push(node);
			},
		});
		expect(visible(root)).toBe('first loading');
		await advance(100);
		resource.resolve('ready');
		await advance();
		expect(visible(root)).toBe('first loading');
		expect(layouts).toEqual([]);
		expect(refs).toEqual([]);
		await advance(199);
		expect(visible(root)).toBe('first loading');
		await advance(1);
		expect(visible(root)).toBe('ready');
		expect(layouts).toEqual(['ready']);
		expect(refs).toEqual([root.container.querySelector('[data-value="first"]')]);
	});

	it('bypasses the retry delay when data resolves inside act', async () => {
		const resource = deferred();
		const root = mount(runtime, 'TimedBoundary', { promise: resource.promise, label: 'first' });
		await advance(100);
		const beforeAct = performance.now();
		await act(runtime, () => resource.resolve('ready'));
		expect(performance.now()).toBe(beforeAct);
		expect(visible(root)).toBe('ready');
	});

	it('does not drain an already scheduled retry merely by entering an empty act', async () => {
		const resource = deferred();
		const root = mount(runtime, 'TimedBoundary', { promise: resource.promise, label: 'first' });
		await advance(100);
		resource.resolve('ready');
		await advance();
		await act(runtime, () => {});
		expect(visible(root)).toBe('first loading');
		await advance(200);
		expect(visible(root)).toBe('ready');
	});

	it.each([290, 295, 300, 450])(
		'does not add another delay when data resolves at %ims',
		async (elapsed) => {
			const resource = deferred();
			const root = mount(runtime, 'TimedBoundary', { promise: resource.promise, label: 'first' });
			await advance(elapsed);
			resource.resolve('ready');
			await advance();
			expect(visible(root)).toBe('ready');
		},
	);

	it('still waits when more than 10ms of the window remains', async () => {
		const resource = deferred();
		const root = mount(runtime, 'TimedBoundary', { promise: resource.promise, label: 'first' });
		await advance(289);
		resource.resolve('ready');
		await advance();
		expect(visible(root)).toBe('first loading');
		await advance(11);
		expect(visible(root)).toBe('ready');
	});

	it('uses a recently shown fallback in another root as the retry deadline', async () => {
		const first = deferred();
		const second = deferred();
		const root = mount(runtime, 'TimedBoundary', { promise: first.promise, label: 'first' });
		await advance(200);
		mount(runtime, 'TimedBoundary', { promise: second.promise, label: 'second' });
		await advance(50);
		first.resolve('first ready');
		await advance();
		await advance(249);
		expect(visible(root)).toBe('first loading');
		await advance(1);
		expect(visible(root)).toBe('first ready');
	});

	it('does not postpone an existing reveal when another root shows a fallback', async () => {
		const first = deferred();
		const second = deferred();
		const root = mount(runtime, 'TimedBoundary', { promise: first.promise, label: 'first' });
		await advance(100);
		first.resolve('first ready');
		await advance();
		await advance(150);
		mount(runtime, 'TimedBoundary', { promise: second.promise, label: 'second' });
		await advance(49);
		expect(visible(root)).toBe('first loading');
		await advance(1);
		expect(visible(root)).toBe('first ready');
	});

	// Hidden Activity prerenders on React's Scheduler. Drain that work at a fixed
	// clock time before advancing, so a late initial fallback commit cannot be
	// mistaken for a timestamp change caused by revealing the Activity.
	it('uses a fallback committed under hidden Activity when scheduling another root retry', async () => {
		const first = deferred();
		const second = deferred();
		const root = mount(runtime, 'TimedBoundary', { promise: first.promise, label: 'first' });
		await advance(200);
		const hidden = mount(runtime, 'ActivityTimedBoundary', {
			promise: second.promise,
			label: 'second',
			mode: 'hidden',
		});
		await advance();
		expect(visible(hidden)).toBe('');
		await advance(50);
		first.resolve('first ready');
		await advance();
		await advance(50);
		expect(visible(root)).toBe('first loading');
		await advance(199);
		expect(visible(root)).toBe('first loading');
		await advance(1);
		expect(visible(root)).toBe('first ready');
		expect(visible(hidden)).toBe('');
	});

	it('does not restart the retry window when Activity reveals an already committed fallback', async () => {
		const resource = deferred();
		const root = mount(runtime, 'ActivityTimedBoundary', {
			promise: resource.promise,
			label: 'first',
			mode: 'hidden',
		});
		await advance();
		expect(root.container.querySelector('[data-fallback="first"]')).not.toBeNull();
		await advance(500);
		expect(visible(root)).toBe('');
		root.update({ promise: resource.promise, label: 'first', mode: 'visible' });
		expect(visible(root)).toBe('first loading');
		await advance(100);
		resource.resolve('ready');
		await advance();
		expect(visible(root)).toBe('ready');
	});

	it.each(['hidden', 'visible'] as const)(
		'does not restart another retry window when a visible Activity updates to %s',
		async (mode) => {
			const first = deferred();
			const second = deferred();
			const root = mount(runtime, 'TimedBoundary', { promise: first.promise, label: 'first' });
			const activity = mount(runtime, 'ActivityTimedBoundary', {
				promise: second.promise,
				label: 'second',
				mode: 'visible',
			});
			await advance(200);
			activity.update({ promise: second.promise, label: 'second', mode });
			await advance(50);
			first.resolve('first ready');
			await advance();
			await advance(49);
			expect(visible(root)).toBe('first loading');
			await advance(1);
			expect(visible(root)).toBe('first ready');
		},
	);

	it('does not restart another retry window when a nested pending Activity remains hidden', async () => {
		const first = deferred();
		const second = deferred();
		const root = mount(runtime, 'TimedBoundary', { promise: first.promise, label: 'first' });
		const activity = mount(runtime, 'NestedActivityTimedBoundary', {
			promise: second.promise,
			label: 'second',
			mode: 'hidden',
		});
		await advance();
		expect(activity.container.querySelector('[data-fallback="second"]')).not.toBeNull();
		await advance(200);
		activity.update({ promise: second.promise, label: 'second', mode: 'visible' });
		await advance();
		expect(visible(activity)).toBe('');
		await advance(50);
		first.resolve('first ready');
		await advance();
		await advance(49);
		expect(visible(root)).toBe('first loading');
		await advance(1);
		expect(visible(root)).toBe('first ready');
		expect(visible(activity)).toBe('');
	});

	// Per ReactSuspenseWithNoopRenderer-test.js:1857, "throttles content from
	// appearing if a fallback was filled in recently".
	it('throttles content from appearing if a fallback was filled in recently', async () => {
		const first = deferred();
		const second = deferred();
		const root = mount(runtime, 'TimedPair', { first: first.promise, second: second.promise });
		await advance(350);
		first.resolve('first ready');
		await advance();
		expect(visible(root)).toBe('first ready|second loading');
		await advance(100);
		second.resolve('second ready');
		await advance();
		expect(visible(root)).toBe('first ready|second loading');
		await advance(199);
		expect(visible(root)).toBe('first ready|second loading');
		await advance(1);
		expect(visible(root)).toBe('first ready|second ready');
	});

	it('does not restart the deadline when the same fallback rerenders', async () => {
		const resource = deferred();
		const root = mount(runtime, 'TimedBoundary', { promise: resource.promise, label: 'first' });
		await advance(150);
		root.update({ promise: resource.promise, label: 'updated' });
		expect(visible(root)).toBe('updated loading');
		await advance(50);
		resource.resolve('ready');
		await advance();
		await advance(99);
		expect(visible(root)).toBe('updated loading');
		await advance(1);
		expect(visible(root)).toBe('ready');
	});

	it('coalesces ready siblings and runs their layout effects after the whole reveal', async () => {
		const first = deferred();
		const second = deferred();
		const layouts: Array<{ value: string; screen: string }> = [];
		const root = mount(runtime, 'TimedPair', {
			first: first.promise,
			second: second.promise,
			onLayout(value) {
				layouts.push({ value, screen: visible(root) });
			},
		});
		await advance(100);
		first.resolve('first ready');
		await advance();
		await advance(100);
		second.resolve('second ready');
		await advance();
		expect(visible(root)).toBe('first loading|second loading');
		expect(layouts).toEqual([]);
		await advance(99);
		expect(visible(root)).toBe('first loading|second loading');
		await advance(1);
		expect(visible(root)).toBe('first ready|second ready');
		expect(layouts).toEqual([
			{ value: 'first ready', screen: 'first ready|second ready' },
			{ value: 'second ready', screen: 'first ready|second ready' },
		]);
	});

	// New work in this root can replace its earlier retry without another ping.
	it.each([false, true])(
		'reschedules a staged retry when this root shows a newer sibling fallback (second resolves: %s)',
		async (resolveSecond) => {
			const first = deferred();
			const second = deferred();
			const root = mount(runtime, 'TimedPair', {
				first: first.promise,
				second: fulfilled('old second'),
				nextSecond: second.promise,
			});
			await advance(100);
			first.resolve('first ready');
			await advance();
			expect(visible(root)).toBe('first loading|old second');
			await advance(100);
			root.click('button');
			expect(visible(root)).toBe('first loading|second loading');
			await advance(50);
			if (resolveSecond) second.resolve('second ready');
			await advance();
			await advance(50);
			expect(visible(root)).toBe('first loading|second loading');
			await advance(199);
			expect(visible(root)).toBe('first loading|second loading');
			await advance(1);
			expect(visible(root)).toBe(
				resolveSecond ? 'first ready|second ready' : 'first ready|second loading',
			);
		},
	);

	it('lets an urgent update replace a delayed retry without later committing stale content', async () => {
		const resource = deferred();
		const layouts: string[] = [];
		const onLayout = (value: string) => layouts.push(value);
		const root = mount(runtime, 'TimedBoundary', {
			promise: resource.promise,
			label: 'first',
			onLayout,
		});
		await advance(100);
		resource.resolve('stale');
		await advance();
		await advance(50);
		root.update({ promise: fulfilled('urgent'), label: 'first', onLayout });
		expect(visible(root)).toBe('urgent');
		expect(layouts).toEqual(['urgent']);
		await advance(1000);
		expect(visible(root)).toBe('urgent');
		expect(layouts).toEqual(['urgent']);
	});

	it('discards staged content when a newer request is still pending at the old deadline', async () => {
		const older = deferred();
		const newer = deferred();
		const layouts: string[] = [];
		const onLayout = (value: string) => layouts.push(value);
		const root = mount(runtime, 'TimedBoundary', {
			promise: older.promise,
			label: 'first',
			onLayout,
		});
		await advance(100);
		older.resolve('stale');
		await advance();
		await advance(50);
		root.update({ promise: newer.promise, label: 'first', onLayout });
		await advance(150);
		expect(visible(root)).toBe('first loading');
		expect(layouts).toEqual([]);
		await advance(50);
		newer.resolve('current');
		await advance();
		expect(visible(root)).toBe('current');
		expect(layouts).toEqual(['current']);
	});

	it('reveals an error boundary when a throttled retry discovers rejected data', async () => {
		const resource = deferred();
		const root = mount(runtime, 'CatchingTimedBoundary', {
			promise: resource.promise,
			label: 'first',
		});
		await advance(100);
		const error = new Error('request failed');
		resource.reject(error);
		await advance();
		expect(visible(root)).toBe('first loading');
		expect(root.caughtErrors).toEqual([]);
		await advance(199);
		expect(visible(root)).toBe('first loading');
		await advance(1);
		expect(visible(root)).toBe('request failed');
		expect(root.caughtErrors).toEqual([error]);
		await advance(1000);
		expect(visible(root)).toBe('request failed');
	});

	it('reports an uncaught rejection and clears the root only when its retry commits', async () => {
		const resource = deferred();
		const uncaught: unknown[] = [];
		const root = mount(
			runtime,
			'UncaughtTimedBoundary',
			{ promise: resource.promise, label: 'first' },
			{ onUncaughtError: (error) => uncaught.push(error) },
		);
		await advance(100);
		const error = new Error('uncaught request failed');
		resource.reject(error);
		await advance();
		expect(visible(root)).toBe('first loading');
		expect(uncaught).toEqual([]);
		expect(root.caughtErrors).toEqual([]);
		await advance(199);
		expect(visible(root)).toBe('first loading');
		await advance(1);
		expect(normaliseHtml(root.container.innerHTML)).toBe('');
		expect(uncaught).toEqual([error]);
		expect(root.caughtErrors).toEqual([]);
		await advance(1000);
		expect(normaliseHtml(root.container.innerHTML)).toBe('');
		expect(uncaught).toEqual([error]);
	});

	it('delays the error fallback when rendering resolved data throws', async () => {
		const resource = deferred();
		const root = mount(runtime, 'CatchingTimedBoundary', {
			promise: resource.promise,
			label: 'first',
			renderValue() {
				throw new Error('render failed');
			},
		});
		await advance(100);
		resource.resolve('data');
		await advance();
		expect(visible(root)).toBe('first loading');
		expect(root.caughtErrors).toEqual([]);
		await advance(200);
		expect(visible(root)).toBe('render failed');
		expect(root.caughtErrors).toEqual([expect.objectContaining({ message: 'render failed' })]);
	});

	it('lets an urgent update supersede an error that has not committed yet', async () => {
		const resource = deferred();
		const root = mount(runtime, 'CatchingTimedBoundary', {
			promise: resource.promise,
			label: 'first',
		});
		await advance(100);
		resource.reject(new Error('discarded error'));
		await advance();
		await advance(50);
		root.update({ promise: fulfilled('urgent'), label: 'first' });
		expect(visible(root)).toBe('urgent');
		await advance(1000);
		expect(visible(root)).toBe('urgent');
		expect(root.caughtErrors).toEqual([]);
	});

	it('does not reveal content or run its effects after a delayed retry is unmounted', async () => {
		const resource = deferred();
		const layouts: string[] = [];
		const refs: Array<HTMLSpanElement | null> = [];
		const root = mount(runtime, 'TimedBoundary', {
			promise: resource.promise,
			label: 'first',
			onLayout: (value) => layouts.push(value),
			onRef: (node) => {
				refs.push(node);
			},
		});
		await advance(100);
		resource.resolve('discarded');
		await advance();
		root.unmount();
		await advance(1000);
		expect(root.container.innerHTML).toBe('');
		expect(layouts).toEqual([]);
		expect(refs).toEqual([]);
	});

	it.each(['while pending', 'after retry stages'])(
		'uses current initial props when a first suspended mount is superseded %s',
		async (phase) => {
			const resource = deferred();
			const root = mount(runtime, 'InitialStateTimedBoundary', {
				promise: resource.promise,
				label: 'first',
				initial: 'older initial',
			});
			if (phase === 'while pending') {
				await advance(50);
				root.update({ promise: resource.promise, label: 'first', initial: 'current initial' });
				await advance(50);
				resource.resolve('ready');
				await advance();
				await advance(200);
			} else {
				await advance(100);
				resource.resolve('ready');
				await advance();
				await advance(50);
				root.update({ promise: resource.promise, label: 'first', initial: 'current initial' });
			}
			expect(visible(root)).toBe('current initial:ready');
			expect(otherInitialValues(root)).toEqual([
				'current initial',
				'current initial',
				'current initial',
			]);
			await advance(1000);
			expect(visible(root)).toBe('current initial:ready');
			expect(otherInitialValues(root)).toEqual([
				'current initial',
				'current initial',
				'current initial',
			]);
		},
	);

	it('preserves fallback state and its focused draft when an uncommitted primary is superseded', async () => {
		const older = deferred();
		const newer = deferred();
		const root = mount(runtime, 'StatefulFallbackTimedBoundary', {
			promise: older.promise,
			label: 'first',
			initial: 'older initial',
		});
		root.click('button');
		const button = root.container.querySelector('button');
		const input = root.container.querySelector<HTMLInputElement>('input')!;
		input.value = 'keep this draft';
		input.focus();
		expect(visible(root)).toBe('loading:1');
		expect(document.activeElement).toBe(input);
		await advance(100);
		older.resolve('discarded');
		await advance();
		await advance(50);
		root.update({ promise: newer.promise, label: 'first', initial: 'current initial' });
		await advance(150);
		expect(visible(root)).toBe('loading:1');
		expect(root.container.querySelector('button')).toBe(button);
		expect(root.container.querySelector('input')).toBe(input);
		expect(input.value).toBe('keep this draft');
		expect(document.activeElement).toBe(input);
		newer.resolve('current');
		await advance();
		expect(visible(root)).toBe('current initial:current');
	});

	it('preserves already committed state when a later request suspends and retries', async () => {
		const resource = deferred();
		const root = mount(runtime, 'InitialStateTimedBoundary', {
			promise: fulfilled('initial data'),
			label: 'first',
			initial: 'committed initial',
		});
		await advance(100);
		root.update({ promise: resource.promise, label: 'first', initial: 'new prop' });
		expect(visible(root)).toBe('first loading');
		await advance(100);
		resource.resolve('new data');
		await advance();
		expect(visible(root)).toBe('first loading');
		await advance(200);
		expect(visible(root)).toBe('committed initial:new data');
		expect(otherInitialValues(root)).toEqual([
			'committed initial',
			'committed initial',
			'committed initial',
		]);
	});

	// Per ReactSuspense-test.internal.js:267, "throttles fallback committing
	// globally"; :370, "does not throttle fallback committing for too long".
	it('throttles fallback committing globally while starting dependent data before reveal', async () => {
		const first = deferred();
		const second = deferred();
		const started: Array<{ input: string; time: number }> = [];
		const initialTime = performance.now();
		const root = mount(runtime, 'TimedNested', {
			first: first.promise,
			loadSecond(input) {
				if (started.length === 0) started.push({ input, time: performance.now() - initialTime });
				return second.promise;
			},
		});
		await advance(100);
		first.resolve('first ready');
		await advance();
		expect(started).toEqual([{ input: 'first ready', time: 100 }]);
		expect(visible(root)).toBe('outer loading');
		await advance(50);
		second.resolve('second ready');
		await advance();
		expect(visible(root)).toBe('outer loading');
		await advance(149);
		expect(visible(root)).toBe('outer loading');
		await advance(1);
		expect(visible(root)).toBe('first ready|second ready');
	});

	// Adapt ReactSuspense-test.internal.js:311's 290ms parent / 30ms sibling.
	// Drain complete host turns instead of stopping mid-render on Scheduler logs:
	// the parent's <=10ms cutoff reveals its inner fallback at 290ms, and filling
	// that outer fallback starts the window that delays the ready sibling.
	it('pushes out a fast nested sibling retry after the parent fallback is filled', async () => {
		const first = deferred();
		const second = deferred();
		const root = mount(runtime, 'TimedNested', {
			first: first.promise,
			loadSecond: () => second.promise,
		});
		expect(visible(root)).toBe('outer loading');
		await advance(290);
		first.resolve('first ready');
		await advance();
		expect(visible(root)).toBe('first ready|second loading');
		await advance(30);
		second.resolve('second ready');
		await advance();
		expect(visible(root)).toBe('first ready|second loading');
		await advance(269);
		expect(visible(root)).toBe('first ready|second loading');
		await advance(1);
		expect(visible(root)).toBe('first ready|second ready');
	});

	it('does not throttle fallback committing for too long when nested data stays pending', async () => {
		const first = deferred();
		const second = deferred();
		const root = mount(runtime, 'TimedNested', {
			first: first.promise,
			loadSecond: () => second.promise,
		});
		await advance(100);
		first.resolve('first ready');
		await advance();
		expect(visible(root)).toBe('outer loading');
		await advance(199);
		expect(visible(root)).toBe('outer loading');
		await advance(1);
		expect(visible(root)).toBe('first ready|second loading');
		await advance(100);
		second.resolve('second ready');
		await advance();
		expect(visible(root)).toBe('first ready|second loading');
		await advance(200);
		expect(visible(root)).toBe('first ready|second ready');
	});

	it('uses the same retry deadline when a resource reader throws its pending promise', async () => {
		const resource = deferred();
		const layouts: string[] = [];
		const root = mount(runtime, 'RawTimedBoundary', {
			read: reader(resource),
			label: 'resource',
			onLayout: (value) => layouts.push(value),
		});
		expect(visible(root)).toBe('resource loading');
		await advance(100);
		resource.resolve('resource ready');
		await advance();
		expect(visible(root)).toBe('resource loading');
		expect(layouts).toEqual([]);
		await advance(200);
		expect(visible(root)).toBe('resource ready');
		expect(layouts).toEqual(['resource ready']);
	});

	it('reports a rejected resource reader at its retry commit, not as an uncaught promise', async () => {
		const resource = deferred();
		const root = mount(runtime, 'RawTimedBoundary', {
			read: reader(resource),
			label: 'resource',
		});
		expect(visible(root)).toBe('resource loading');
		await advance(100);
		const error = new Error('resource failed');
		resource.reject(error);
		await advance();
		expect(visible(root)).toBe('resource loading');
		expect(root.caughtErrors).toEqual([]);
		await advance(200);
		expect(visible(root)).toBe('resource failed');
		expect(root.caughtErrors).toEqual([error]);
	});
});
