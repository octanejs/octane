import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { setImmediate as nextHostTurn } from 'node:timers/promises';
import {
	act as reactAct,
	Component,
	createElement,
	memo as reactMemo,
	startTransition as reactStartTransition,
	Suspense as ReactSuspense,
	use as reactUse,
	type ComponentType,
	type ReactNode,
} from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as reactFlushSync } from 'react-dom';
import {
	act as octaneAct,
	createElement as createOctaneElement,
	createRoot as createOctaneRoot,
	flushSync as octaneFlushSync,
	ErrorBoundary as OctaneErrorBoundary,
	memo as octaneMemo,
	startTransition as octaneStartTransition,
	Suspense as OctaneSuspense,
	use as octaneUse,
} from '../../src/index.js';
import { normaliseHtml, preloadDifferentialFixture } from './_rig.js';
import type {
	TimingProps,
	TimingPairProps,
	NestedTimingProps,
	RawTimingProps,
	InitialStateTimingProps,
	ActivityTimingProps,
	SuspendingFallbackProps,
	FallbackSiblingProps,
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
	| 'NestedActivityTimedBoundary'
	| 'PendingFallbackBoundary'
	| 'ErrorFallbackBoundary'
	| 'CatchingErrorFallbackBoundary'
	| 'MemoizedFallbackSibling';
type Props =
	| TimingProps
	| DescriptorRetryProps
	| TimingPairProps
	| NestedTimingProps
	| RawTimingProps
	| InitialStateTimingProps
	| ActivityTimingProps
	| SuspendingFallbackProps
	| FallbackSiblingProps;

interface TimingRoot {
	container: HTMLDivElement;
	caughtErrors: unknown[];
	update(props: Props): void;
	transitionUpdate(props: Props): void;
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

function mount<P extends Props>(
	runtime: Runtime,
	name: FixtureName | ((props: P) => unknown),
	props: P,
	errorOptions: {
		onCaughtError?: (error: unknown) => void;
		onUncaughtError?: (error: unknown) => void;
	} = {},
): TimingRoot {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const fixture =
		typeof name === 'function' ? name : (runtime === 'react' ? reactFixture : octaneFixture)[name];
	const caughtErrors: unknown[] = [];
	const options = {
		...errorOptions,
		onCaughtError: (error: unknown) => {
			caughtErrors.push(error);
			errorOptions.onCaughtError?.(error);
		},
	};
	const root =
		runtime === 'react'
			? createReactRoot(container, options)
			: createOctaneRoot(container, options);
	const flush = runtime === 'react' ? reactFlushSync : octaneFlushSync;
	const transition = runtime === 'react' ? reactStartTransition : octaneStartTransition;
	const render = (next: Props, concurrent = false) => {
		const update = () => {
			if (runtime === 'react') {
				(root as ReturnType<typeof createReactRoot>).render(
					createElement(fixture as ComponentType<Props>, next),
				);
			} else if (typeof name === 'function') {
				(root as ReturnType<typeof createOctaneRoot>).render(createOctaneElement(fixture, next));
			} else {
				(root as ReturnType<typeof createOctaneRoot>).render(fixture, next);
			}
		};
		if (concurrent) transition(update);
		else flush(update);
	};
	let mounted = true;
	const result: TimingRoot = {
		container,
		caughtErrors,
		update: render,
		transitionUpdate: (next) => render(next, true),
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

async function act(runtime: Runtime, fn: () => void | Promise<void>): Promise<void> {
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

type DescriptorRetryShape =
	'host' | 'nested' | 'cached descriptor' | 'memo ancestor' | 'memo reader';

interface DescriptorRetryProps extends TimingProps {
	second?: Promise<string>;
	readyValue?: string;
	onPassive?: (value: string) => void;
}

function descriptorRetryApp(
	runtime: Runtime,
	shape: DescriptorRetryShape,
	content?: ComponentType<DescriptorRetryProps>,
	catchErrors = false,
) {
	const h = (runtime === 'react' ? createElement : createOctaneElement) as typeof createElement;
	const read = runtime === 'react' ? reactUse : octaneUse;
	const Suspense = (runtime === 'react' ? ReactSuspense : OctaneSuspense) as typeof ReactSuspense;
	const memoize = (runtime === 'react' ? reactMemo : octaneMemo) as typeof reactMemo;
	function Reader(props: DescriptorRetryProps) {
		const value = props.readyValue ?? read(props.promise);
		return h('span', { 'data-value': props.label, title: value }, value);
	}
	const Content = content ?? Reader;
	function Nested(props: DescriptorRetryProps) {
		return h('section', null, h('article', null, h(Content, props)));
	}
	const descriptors = new WeakMap<DescriptorRetryProps, ReturnType<typeof h>>();
	function Cached(props: DescriptorRetryProps) {
		let child = descriptors.get(props);
		if (child === undefined) {
			child = h(Nested, props);
			descriptors.set(props, child);
		}
		return child;
	}
	const Child =
		shape === 'memo ancestor'
			? memoize(Nested)
			: shape === 'memo reader'
				? memoize(Content)
				: shape === 'cached descriptor'
					? Cached
					: shape === 'nested'
						? Nested
						: Content;
	return function App(props: DescriptorRetryProps) {
		const main =
			props.second === undefined
				? h('main', null, h(Child, props))
				: h(
						'main',
						null,
						h(Child, props),
						h(Child, { ...props, promise: props.second, label: 'second', readyValue: undefined }),
					);
		const body = h(
			Suspense,
			{ fallback: h('span', { 'data-fallback': 'reader' }, 'loading') },
			main,
		);
		if (!catchErrors) return body;
		const Boundary = (
			runtime === 'react' ? ReactFallbackBoundary : OctaneErrorBoundary
		) as typeof ReactFallbackBoundary;
		return h(Boundary, {
			children: body,
			fallback: (error: unknown) =>
				h('span', { 'data-error': props.label }, String((error as Error).message)),
		});
	};
}

describe.each<Runtime>(['react', 'octane'])('%s descriptor Suspense retries', (runtime) => {
	const statefulContent = (runtime === 'react' ? reactFixture : octaneFixture)
		.DescriptorRetryContent;

	it.each<DescriptorRetryShape>([
		'host',
		'nested',
		'cached descriptor',
		'memo ancestor',
		'memo reader',
	])('reveals the new value through a %s after its update suspends', async (shape) => {
		const App = descriptorRetryApp(runtime, shape);
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(runtime, App, { promise: Promise.resolve('initial'), label: 'reader' });
		});
		expect(visible(root)).toBe('initial');
		const main = root.container.querySelector('main');
		const reader = root.container.querySelector('[data-value="reader"]');
		for (const value of ['next', 'last']) {
			const next = deferred();
			await act(runtime, async () => root.update({ promise: next.promise, label: 'reader' }));
			expect(visible(root)).toBe('loading');
			await act(runtime, async () => next.resolve(value));
			expect(visible(root)).toBe(value);
			expect(root.container.querySelector('main')).toBe(main);
			expect(root.container.querySelector('[data-value="reader"]')).toBe(reader);
		}
	});

	it('connects a new ready sibling’s refs and effects when the first suspended mount reveals', async () => {
		const App = descriptorRetryApp(runtime, 'memo ancestor', statefulContent);
		const pending = deferred();
		const layouts: string[] = [];
		const passives: string[] = [];
		const attached: HTMLSpanElement[] = [];
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(runtime, App, {
				promise: pending.promise,
				second: pending.promise,
				readyValue: 'ready',
				label: 'first',
				onLayout: (value: string) => layouts.push(value),
				onPassive: (value: string) => passives.push(value),
				onRef: (node: HTMLSpanElement | null) => {
					if (node !== null) attached.push(node);
				},
			});
		});
		expect(visible(root)).toBe('loading');
		expect(layouts).toEqual([]);
		expect(passives).toEqual([]);
		expect(attached).toEqual([]);
		await act(runtime, async () => pending.resolve('second ready'));
		expect(visible(root)).toBe('ready:0|second ready:0');
		expect(layouts).toEqual(['ready', 'second ready']);
		expect(passives).toEqual(['ready', 'second ready']);
		expect(attached).toEqual([
			root.container.querySelector('[data-value="first"]'),
			root.container.querySelector('[data-value="second"]'),
		]);
	});

	it.each(['pending first reader', 'ready first reader'] as const)(
		'commits the earlier reader’s new layout only when its later sibling also finishes (%s)',
		async (firstRead) => {
			const App = descriptorRetryApp(runtime, 'memo ancestor', statefulContent);
			const first = deferred();
			const second = deferred();
			const attached: HTMLSpanElement[] = [];
			const layouts: Array<{ value: string; view: string }> = [];
			const passives: string[] = [];
			let root!: TimingRoot;
			const callbacks = {
				onRef: (node: HTMLSpanElement | null) => {
					if (node !== null) attached.push(node);
				},
				onLayout: (value: string) => layouts.push({ value, view: visible(root) }),
				onPassive: (value: string) => passives.push(value),
			};
			await act(runtime, async () => {
				root = mount(runtime, App, {
					promise: Promise.resolve('first initial'),
					second: Promise.resolve('second initial'),
					label: 'first',
					...callbacks,
				});
			});
			await act(runtime, async () => root.click('[data-value="first"]'));
			expect(visible(root)).toBe('first initial:1|second initial:0');
			const firstNode = root.container.querySelector('[data-value="first"]');
			const secondNode = root.container.querySelector('[data-value="second"]');
			attached.length = 0;
			layouts.length = 0;
			passives.length = 0;
			await act(runtime, async () =>
				root.update({
					promise: first.promise,
					second: second.promise,
					readyValue: firstRead === 'ready first reader' ? 'first next' : undefined,
					label: 'first',
					...callbacks,
				}),
			);
			expect(visible(root)).toBe('loading');
			if (firstRead === 'pending first reader') {
				await act(runtime, async () => first.resolve('first next'));
			}
			expect(visible(root)).toBe('loading');
			expect(layouts).toEqual([]);
			expect(passives).toEqual([]);
			expect(attached).toEqual([]);
			expect(root.caughtErrors).toEqual([]);
			await act(runtime, async () => second.resolve('second next'));
			const view = 'first next:1|second next:0';
			expect(visible(root)).toBe(view);
			expect(root.container.querySelector('[data-value="first"]')).toBe(firstNode);
			expect(root.container.querySelector('[data-value="second"]')).toBe(secondNode);
			expect(attached).toEqual([firstNode, secondNode]);
			expect(layouts).toEqual([
				{ value: 'first next', view },
				{ value: 'second next', view },
			]);
			expect(passives).toEqual(['first next', 'second next']);
			expect(root.caughtErrors).toEqual([]);
		},
	);

	it.each(['pending first reader', 'ready first reader'] as const)(
		'keeps the current descriptor primary visible while a transition suspends again (%s)',
		async (firstRead) => {
			const App = descriptorRetryApp(runtime, 'memo ancestor');
			const first = deferred();
			const second = deferred();
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, App, {
					promise: Promise.resolve('first initial'),
					second: Promise.resolve('second initial'),
					label: 'first',
				});
			});
			expect(visible(root)).toBe('first initial|second initial');
			const firstNode = root.container.querySelector('[data-value="first"]');
			const secondNode = root.container.querySelector('[data-value="second"]');
			expect(firstNode?.getAttribute('title')).toBe('first initial');
			expect(secondNode?.getAttribute('title')).toBe('second initial');
			await act(runtime, async () =>
				root.transitionUpdate({
					promise: first.promise,
					second: second.promise,
					readyValue: firstRead === 'ready first reader' ? 'first next' : undefined,
					label: 'first',
				}),
			);
			expect(visible(root)).toBe('first initial|second initial');
			expect(firstNode?.getAttribute('title')).toBe('first initial');
			expect(secondNode?.getAttribute('title')).toBe('second initial');
			if (firstRead === 'pending first reader') {
				await act(runtime, async () => first.resolve('first next'));
				expect(visible(root)).toBe('first initial|second initial');
				expect(firstNode?.getAttribute('title')).toBe('first initial');
				expect(secondNode?.getAttribute('title')).toBe('second initial');
			}
			await act(runtime, async () => second.resolve('second next'));
			expect(visible(root)).toBe('first next|second next');
			expect(firstNode?.getAttribute('title')).toBe('first next');
			expect(secondNode?.getAttribute('title')).toBe('second next');
			expect(root.container.querySelector('[data-value="first"]')).toBe(firstNode);
			expect(root.container.querySelector('[data-value="second"]')).toBe(secondNode);
		},
	);

	it.each(['older first', 'newer first'] as const)(
		'retries the newest descriptor input when requests settle %s',
		async (order) => {
			const App = descriptorRetryApp(runtime, 'cached descriptor');
			const older = deferred();
			const newer = deferred();
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, App, { promise: Promise.resolve('initial'), label: 'reader' });
			});
			await act(runtime, async () => root.update({ promise: older.promise, label: 'reader' }));
			expect(visible(root)).toBe('loading');
			await act(runtime, async () => root.update({ promise: newer.promise, label: 'reader' }));
			if (order === 'older first') {
				await act(runtime, async () => older.resolve('stale'));
				expect(visible(root)).toBe('loading');
			}
			await act(runtime, async () => newer.resolve('current'));
			expect(visible(root)).toBe('current');
			if (order === 'newer first') {
				await act(runtime, async () => older.resolve('stale'));
				expect(visible(root)).toBe('current');
			}
		},
	);

	it('reports a descriptor reader rejection only after its catch commits', async () => {
		const App = descriptorRetryApp(runtime, 'memo ancestor', undefined, true);
		const next = deferred();
		const error = new Error('reader failed');
		const onUncaughtError = vi.fn();
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(
				runtime,
				App,
				{ promise: Promise.resolve('initial'), label: 'reader' },
				{ onUncaughtError },
			);
		});
		await act(runtime, async () => root.update({ promise: next.promise, label: 'reader' }));
		expect(visible(root)).toBe('loading');
		expect(root.caughtErrors).toEqual([]);
		await act(runtime, async () => next.reject(error));
		expect(visible(root)).toBe('reader failed');
		expect(root.caughtErrors).toHaveLength(1);
		expect(root.caughtErrors[0]).toBe(error);
		expect(onUncaughtError).not.toHaveBeenCalled();
	});

	it('does not reconnect a descriptor reader after its suspended root unmounts', async () => {
		const App = descriptorRetryApp(runtime, 'memo ancestor', statefulContent);
		const next = deferred();
		const layouts: string[] = [];
		const attached: HTMLSpanElement[] = [];
		const callbacks = {
			onLayout: (value: string) => layouts.push(value),
			onRef: (node: HTMLSpanElement | null) => {
				if (node !== null) attached.push(node);
			},
		};
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(runtime, App, {
				promise: Promise.resolve('initial'),
				label: 'reader',
				...callbacks,
			});
		});
		layouts.length = 0;
		attached.length = 0;
		await act(runtime, async () =>
			root.update({ promise: next.promise, label: 'reader', ...callbacks }),
		);
		expect(visible(root)).toBe('loading');
		await act(runtime, async () => root.unmount());
		await act(runtime, async () => next.resolve('discarded'));
		expect(root.container.textContent).toBe('');
		expect(layouts).toEqual([]);
		expect(attached).toEqual([]);
		expect(root.caughtErrors).toEqual([]);
	});

	it('retries independent roots without revealing another root’s stale content', async () => {
		const App = descriptorRetryApp(runtime, 'memo ancestor');
		const first = deferred();
		const second = deferred();
		let firstRoot!: TimingRoot;
		let secondRoot!: TimingRoot;
		await act(runtime, async () => {
			firstRoot = mount(runtime, App, {
				promise: Promise.resolve('first initial'),
				label: 'reader',
			});
			secondRoot = mount(runtime, App, {
				promise: Promise.resolve('second initial'),
				label: 'reader',
			});
		});
		await act(runtime, async () => {
			firstRoot.update({ promise: first.promise, label: 'reader' });
			secondRoot.update({ promise: second.promise, label: 'reader' });
		});
		expect(visible(firstRoot)).toBe('loading');
		expect(visible(secondRoot)).toBe('loading');
		await act(runtime, async () => first.resolve('first next'));
		expect(visible(firstRoot)).toBe('first next');
		expect(visible(secondRoot)).toBe('loading');
		await act(runtime, async () => second.resolve('second next'));
		expect(visible(firstRoot)).toBe('first next');
		expect(visible(secondRoot)).toBe('second next');
	});
});

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

// Fallbacks are render work too: a wakeable must reach an enclosing Suspense
// boundary rather than becoming an application error in the fallback's owner.
// These cases use public act for settlement and make no wall-clock assertions.
// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberSuspenseContext.js#L102
class ReactFallbackBoundary extends Component<
	{ children?: ReactNode; fallback: (error: unknown) => ReactNode },
	{ error: unknown }
> {
	state = { error: null as unknown };

	static getDerivedStateFromError(error: unknown) {
		return { error };
	}

	render() {
		return this.state.error === null ? this.props.children : this.props.fallback(this.state.error);
	}
}

function fallbackResource(initial?: string) {
	const resource = deferred();
	const read = reader(resource);
	if (initial !== undefined) {
		Object.assign(resource.promise, { status: 'fulfilled', value: initial });
		resource.resolve(initial);
		return { ...resource, read: () => initial };
	}
	return { ...resource, read };
}

describe.each<Runtime>(['react', 'octane'])('%s suspending fallback renders', (runtime) => {
	it('reports a memoized error fallback only after its later sibling reveals', async () => {
		const primary = deferred();
		const fallback = deferred();
		const sibling = deferred();
		const primaryError = new Error('primary failed');
		const props: FallbackSiblingProps = {
			primary: primary.promise,
			fallback: fallback.promise,
			sibling: fulfilled('sibling initial'),
		};
		const reportedViews: string[] = [];
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(runtime, 'MemoizedFallbackSibling', props, {
				onCaughtError: () => reportedViews.push(visible(root)),
			});
		});
		expect(visible(root)).toBe('inner loading|sibling initial');
		await act(runtime, async () => primary.reject(primaryError));
		expect(visible(root)).toBe('outer loading');
		expect(root.caughtErrors).toEqual([]);
		await act(runtime, async () => root.update({ ...props, sibling: sibling.promise }));
		expect(visible(root)).toBe('outer loading');
		expect(root.caughtErrors).toEqual([]);
		await act(runtime, async () => fallback.resolve('error fallback ready'));
		expect(visible(root)).toBe('outer loading');
		expect(root.caughtErrors).toEqual([]);
		await act(runtime, async () => sibling.resolve('sibling next'));
		expect(visible(root)).toBe('error fallback ready|sibling next');
		expect(root.caughtErrors).toHaveLength(1);
		expect(root.caughtErrors[0]).toBe(primaryError);
		expect(reportedViews).toEqual(['error fallback ready|sibling next']);
	});

	describe.each(['raw', 'use'] as const)('%s resource reads', (readMode) => {
		function resources(initialFallback?: string) {
			const primary = fallbackResource();
			const fallback = fallbackResource(initialFallback);
			const props: SuspendingFallbackProps = {
				primary,
				fallback,
				readMode,
				primaryError: new Error('primary failed'),
			};
			return { primary, fallback, props };
		}

		it('suspends a pending fallback through the outer boundary and then reveals its primary', async () => {
			const { primary, fallback, props } = resources();
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, 'PendingFallbackBoundary', props);
			});
			expect(visible(root)).toBe('outer loading');
			await act(runtime, async () => fallback.resolve('fallback ready'));
			expect(visible(root)).toBe('fallback ready:0');
			await act(runtime, async () => primary.resolve('primary ready'));
			expect(visible(root)).toBe('primary ready');
		});

		it('keeps the outer fallback until its wakeable settles when the discarded primary resolves first', async () => {
			const { primary, fallback, props } = resources();
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, 'PendingFallbackBoundary', props);
			});
			expect(visible(root)).toBe('outer loading');
			await act(runtime, async () => primary.resolve('primary ready'));
			expect(visible(root)).toBe('outer loading');
			await act(runtime, async () => fallback.resolve('fallback ready'));
			expect(visible(root)).toBe('primary ready');
		});

		it('routes a rejected pending fallback resource to its enclosing catch', async () => {
			const { fallback, props } = resources();
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, 'PendingFallbackBoundary', props);
			});
			expect(visible(root)).toBe('outer loading');
			await act(runtime, async () => fallback.reject(new Error('fallback failed')));
			expect(visible(root)).toBe('fallback failed');
		});

		it('preserves a committed pending fallback counter when its replacement resource suspends', async () => {
			const { props } = resources('fallback initial');
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, 'PendingFallbackBoundary', props);
			});
			expect(visible(root)).toBe('fallback initial:0');
			await act(runtime, async () => root.click('[data-value="suspending-fallback"]'));
			expect(visible(root)).toBe('fallback initial:1');
			const next = fallbackResource();
			await act(runtime, async () => root.update({ ...props, fallback: next }));
			expect(visible(root)).toBe('outer loading');
			await act(runtime, async () => next.resolve('fallback next'));
			expect(visible(root)).toBe('fallback next:1');
		});

		it('does not mount a pending fallback after the outer boundary is unmounted', async () => {
			const { primary, fallback, props } = resources();
			const layouts: string[] = [];
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, 'PendingFallbackBoundary', {
					...props,
					onFallbackLayout: (value) => layouts.push(value),
				});
			});
			expect(visible(root)).toBe('outer loading');
			await act(runtime, async () => root.unmount());
			await act(runtime, async () => {
				fallback.resolve('fallback ready');
				primary.resolve('primary ready');
			});
			expect(root.container.textContent).toBe('');
			expect(layouts).toEqual([]);
		});

		describe.each(['template', 'JSX'] as const)('%s error boundary', (kind) => {
			function errorResources(initialFallback?: string) {
				const setup = resources(initialFallback);
				if (kind === 'JSX') {
					// Both fixtures render a public boundary component; React needs its
					// native class form while Octane provides the ErrorBoundary component.
					setup.props.boundary = (runtime === 'react'
						? ReactFallbackBoundary
						: OctaneErrorBoundary) as unknown as SuspendingFallbackProps['boundary'];
				}
				return setup;
			}

			it.each(['first mount', 'parent update'] as const)(
				'reports a %s error only after its suspended fallback commits',
				async (entry) => {
					const { primary, fallback, props } = errorResources();
					const layouts: string[] = [];
					const reportedLayouts: string[][] = [];
					props.onFallbackLayout = (value) => layouts.push(value);
					if (entry === 'parent update') primary.resolve('primary ready');
					let root!: TimingRoot;
					await act(runtime, async () => {
						root = mount(
							runtime,
							'ErrorFallbackBoundary',
							{ ...props, primaryError: entry === 'first mount' ? props.primaryError : undefined },
							{ onCaughtError: () => reportedLayouts.push([...layouts]) },
						);
					});
					if (entry === 'parent update') {
						expect(visible(root)).toBe('primary ready');
						await act(runtime, async () => root.update(props));
					}
					expect(visible(root)).toBe('outer loading');
					expect(root.caughtErrors).toEqual([]);
					expect(layouts).toEqual([]);
					await act(runtime, async () => fallback.resolve('fallback ready'));
					expect(visible(root)).toBe('fallback ready:0');
					expect(root.caughtErrors).toHaveLength(1);
					expect(root.caughtErrors[0]).toBe(props.primaryError);
					expect(reportedLayouts).toEqual([['fallback ready']]);
				},
			);

			it('preserves committed error fallback state when refreshed data suspends', async () => {
				const { props } = errorResources('fallback initial');
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(runtime, 'ErrorFallbackBoundary', props);
				});
				expect(visible(root)).toBe('fallback initial:0');
				await act(runtime, async () => root.click('[data-value="suspending-fallback"]'));
				expect(visible(root)).toBe('fallback initial:1');
				const next = fallbackResource();
				await act(runtime, async () => root.update({ ...props, fallback: next }));
				expect(visible(root)).toBe('outer loading');
				await act(runtime, async () => next.resolve('fallback next'));
				expect(visible(root)).toBe('fallback next:1');
			});

			it('renders a rejected error fallback resource through the outer catch', async () => {
				const { fallback, props } = errorResources();
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(runtime, 'CatchingErrorFallbackBoundary', props);
				});
				expect(visible(root)).toBe('outer loading');
				await act(runtime, async () => fallback.reject(new Error('fallback failed')));
				expect(visible(root)).toBe('fallback failed');
			});

			it('suspends an error fallback when a pending primary rejects after commit', async () => {
				const { primary, fallback, props } = errorResources();
				const primaryError = new Error('primary failed');
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(runtime, 'ErrorFallbackBoundary', { ...props, primaryError: undefined });
				});
				expect(visible(root)).toBe('primary loading');
				await act(runtime, async () => primary.reject(primaryError));
				expect(visible(root)).toBe('outer loading');
				expect(root.caughtErrors).toEqual([]);
				await act(runtime, async () => fallback.resolve('fallback ready'));
				expect(visible(root)).toBe('fallback ready:0');
				expect(root.caughtErrors).toHaveLength(1);
				expect(root.caughtErrors[0]).toBe(primaryError);
			});

			it('reports only the replacement error when a detached retry error fallback rejects', async () => {
				const { primary, fallback, props } = errorResources();
				const primaryError = new Error('primary failed');
				const fallbackError = new Error('fallback failed');
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(runtime, 'CatchingErrorFallbackBoundary', {
						...props,
						primaryError: undefined,
					});
				});
				expect(visible(root)).toBe('primary loading');
				await act(runtime, async () => primary.reject(primaryError));
				expect(visible(root)).toBe('outer loading');
				expect(root.caughtErrors).toEqual([]);
				await act(runtime, async () => fallback.reject(fallbackError));
				expect(visible(root)).toBe('fallback failed');
				expect(root.caughtErrors).toHaveLength(1);
				expect(root.caughtErrors[0]).toBe(fallbackError);
			});

			it.each([
				['unmount', 'first mount'],
				['replacement', 'first mount'],
				['unmount', 'parent update'],
				['replacement', 'parent update'],
				['unmount', 'scheduled rejection'],
				['replacement', 'scheduled rejection'],
			] as const)(
				'discards an error report on %s before its fallback resolves (%s)',
				async (cancellation, entry) => {
					const { primary, fallback, props } = errorResources();
					const initialProps = {
						...props,
						primaryError: entry === 'first mount' ? props.primaryError : undefined,
					};
					if (entry === 'parent update') primary.resolve('primary ready');
					let root!: TimingRoot;
					await act(runtime, async () => {
						root = mount(runtime, 'ErrorFallbackBoundary', initialProps);
					});
					if (entry === 'parent update') {
						expect(visible(root)).toBe('primary ready');
						await act(runtime, async () => root.update(props));
					} else if (entry === 'scheduled rejection') {
						expect(visible(root)).toBe('primary loading');
						await act(runtime, async () => primary.reject(props.primaryError!));
					}
					expect(visible(root)).toBe('outer loading');
					expect(root.caughtErrors).toEqual([]);
					await act(runtime, async () => {
						if (cancellation === 'unmount') root.unmount();
						else root.update({ ...props, replacement: 'replacement ready' });
					});
					const expected = cancellation === 'unmount' ? '' : 'replacement ready';
					expect(visible(root)).toBe(expected);
					expect(root.caughtErrors).toEqual([]);
					await act(runtime, async () => fallback.resolve('fallback ready'));
					expect(visible(root)).toBe(expected);
					expect(root.caughtErrors).toEqual([]);
				},
			);

			it('does not publish error fallback effects after the suspended root is unmounted', async () => {
				const { fallback, props } = errorResources();
				const layouts: string[] = [];
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(runtime, 'ErrorFallbackBoundary', {
						...props,
						onFallbackLayout: (value) => layouts.push(value),
					});
				});
				expect(visible(root)).toBe('outer loading');
				await act(runtime, async () => root.unmount());
				await act(runtime, async () => fallback.resolve('fallback ready'));
				expect(root.container.textContent).toBe('');
				expect(layouts).toEqual([]);
			});
		});
	});
});
