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
import { createPortal as createReactPortal, flushSync as reactFlushSync } from 'react-dom';
import {
	act as octaneAct,
	createElement as createOctaneElement,
	createPortal as createOctanePortal,
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
	RootSuspensionProps,
	DefaultedRootSuspensionProps,
	StatefulRootSuspensionProps,
	TransitionRootSuspensionProps,
	StructuralRootSuspensionProps,
	IndependentRootSuspensionProps,
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
	| 'MemoizedFallbackSibling'
	| 'RootSuspensionScreen'
	| 'AlternateRootSuspensionScreen'
	| 'ContextRootSuspensionScreen'
	| 'DefaultedRootSuspensionScreen'
	| 'CatchingRootSuspensionScreen'
	| 'StatefulRootSuspensionScreen'
	| 'TransitionRootSuspensionScreen'
	| 'StructuralRootSuspensionScreen'
	| 'IndependentRootSuspensionScreen'
	| 'RetiringRootSuspensionScreen'
	| 'InitialStateRootSuspension';
type Props =
	| TimingProps
	| DescriptorRetryProps
	| TimingPairProps
	| NestedTimingProps
	| RawTimingProps
	| InitialStateTimingProps
	| ActivityTimingProps
	| SuspendingFallbackProps
	| FallbackSiblingProps
	| RootSuspensionProps
	| DefaultedRootSuspensionProps
	| StatefulRootSuspensionProps
	| TransitionRootSuspensionProps
	| StructuralRootSuspensionProps
	| IndependentRootSuspensionProps
	| DescriptorRootSuspensionProps;

interface DescriptorRootSuspensionProps extends RootSuspensionProps {
	hostTag: 'section' | 'article';
	childTag: 'span' | 'em';
	content: 'empty' | 'text' | 'host';
	portalTarget: HTMLElement;
}

interface TimingRoot {
	container: HTMLDivElement;
	caughtErrors: unknown[];
	update(props: Props): void;
	transitionUpdate(props: Props): void;
	replace(name: FixtureName, props: Props, key?: string): void;
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
	initialConcurrent = false,
): TimingRoot {
	const container = document.createElement('div');
	document.body.appendChild(container);
	let fixture =
		typeof name === 'function' ? name : (runtime === 'react' ? reactFixture : octaneFixture)[name];
	let descriptorEntry = typeof name === 'function';
	let rootKey: string | undefined;
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
			const elementProps = rootKey === undefined ? next : { ...next, key: rootKey };
			if (runtime === 'react') {
				(root as ReturnType<typeof createReactRoot>).render(
					createElement(fixture as ComponentType<Props>, elementProps),
				);
			} else if (descriptorEntry) {
				(root as ReturnType<typeof createOctaneRoot>).render(
					createOctaneElement(fixture, elementProps),
				);
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
		replace(nextName, next, key) {
			fixture = (runtime === 'react' ? reactFixture : octaneFixture)[nextName];
			descriptorEntry = true;
			rootKey = key;
			render(next);
		},
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
	render(props, initialConcurrent);
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

function rootDescriptorApp(runtime: Runtime) {
	const h = (runtime === 'react' ? createElement : createOctaneElement) as typeof createElement;
	const portal = (
		runtime === 'react' ? createReactPortal : createOctanePortal
	) as typeof createReactPortal;
	const read = runtime === 'react' ? reactUse : octaneUse;
	function Reader(props: DescriptorRootSuspensionProps) {
		const value = props.read === undefined ? read(props.promise) : props.read();
		return h('span', { 'data-value': 'descriptor-reader', ref: props.onRef }, value);
	}
	return function App(props: DescriptorRootSuspensionProps) {
		const content =
			props.content === 'empty'
				? null
				: props.content === 'text'
					? props.label + ' text'
					: h('strong', null, props.label + ' host');
		const host = h(
			props.hostTag,
			{
				'data-descriptor-host': true,
				title: props.label,
				className: props.content === 'empty' ? 'descriptor-empty' : undefined,
				style: {
					color: props.label === 'previous' ? 'red' : 'blue',
					marginLeft: props.label.length,
				},
				ref: props.onShellRef,
				onClick: () => props.onEvent?.('host:' + props.label),
			},
			h('button', { 'data-descriptor-event': true }, 'inspect'),
			h('input', { 'data-descriptor-input': true, value: props.label, readOnly: true }),
			h('input', { 'data-descriptor-draft': true, defaultValue: props.label }),
			h('input', {
				type: 'checkbox',
				'data-descriptor-checkbox': true,
				defaultChecked: props.content === 'empty',
			}),
			h('div', {
				'data-descriptor-html': true,
				dangerouslySetInnerHTML: { __html: `<i>${props.label}</i>` },
			}),
			h(
				'div',
				{ 'data-descriptor-rows': true },
				(props.items ?? []).map((key) =>
					h(
						props.childTag,
						{ key, 'data-descriptor-row': key },
						h('input', { 'aria-label': 'descriptor row ' + key, defaultValue: key }),
						h('span', null, key + ':' + props.label),
					),
				),
			),
			h('div', { 'data-descriptor-content': true }, content),
		);
		const outside = portal(
			h('span', { 'data-descriptor-portal': props.label }, props.label + ' portal'),
			props.portalTarget,
		);
		return h('main', null, host, outside, h(Reader, props), h('footer', null, 'stable tail'));
	};
}

describe.each<Runtime>(['react', 'octane'])('%s root suspension without a boundary', (runtime) => {
	function callbacks() {
		const lifecycle: string[] = [];
		const refs: Array<HTMLSpanElement | null> = [];
		const shellRefs: Array<HTMLElement | null> = [];
		const onUncaughtError = vi.fn();
		return {
			lifecycle,
			refs,
			shellRefs,
			onUncaughtError,
			props: {
				onLifecycle: (event: string) => lifecycle.push(event),
				onRef: (node: HTMLSpanElement | null) => {
					refs.push(node);
				},
				onShellRef: (node: HTMLElement | null) => {
					shellRefs.push(node);
				},
			},
		};
	}

	describe.each(['raw', 'use'] as const)('%s resource reads', (readMode) => {
		function resourceProps(resource: ReturnType<typeof deferred>) {
			return {
				promise: resource.promise,
				read: readMode === 'raw' ? reader(resource) : undefined,
			};
		}

		it('retains runtime descriptors, host state, refs and portals until a later reader is ready', async () => {
			const App = rootDescriptorApp(runtime);
			const firstTarget = document.createElement('div');
			const secondTarget = document.createElement('div');
			document.body.append(firstTarget, secondTarget);
			const onUncaughtError = vi.fn();
			const onRef = vi.fn();
			const events: string[] = [];
			let hostRef = vi.fn();
			let props: DescriptorRootSuspensionProps = {
				promise: fulfilled('previous data'),
				label: 'previous',
				hostTag: 'section',
				childTag: 'span',
				items: ['remove', 'keep'],
				content: 'empty',
				portalTarget: firstTarget,
				onRef,
				onShellRef: hostRef,
				onEvent: (event) => events.push(event),
			};
			let root: TimingRoot | undefined;
			try {
				await act(runtime, async () => {
					root = mount(runtime, App, props, { onUncaughtError });
				});
				const readerNode = root!.container.querySelector('[data-value]');
				const tail = root!.container.querySelector('footer');
				for (const scenario of [
					{
						label: 'attrs',
						hostTag: 'section',
						childTag: 'span',
						items: ['keep', 'add'],
						content: 'text',
						portalTarget: secondTarget,
					},
					{
						label: 'tags',
						hostTag: 'section',
						childTag: 'em',
						items: ['add', 'keep'],
						content: 'host',
						portalTarget: firstTarget,
					},
					{
						label: 'outer',
						hostTag: 'article',
						childTag: 'em',
						items: [],
						content: 'empty',
						portalTarget: secondTarget,
					},
					{
						label: 'refilled',
						hostTag: 'article',
						childTag: 'em',
						items: ['keep'],
						content: 'text',
						portalTarget: secondTarget,
					},
				] as const) {
					const host = root!.container.querySelector('[data-descriptor-host]');
					const input = root!.container.querySelector<HTMLInputElement>('[data-descriptor-input]')!;
					const draftInput =
						root!.container.querySelector<HTMLInputElement>('[data-descriptor-draft]')!;
					const checkbox = root!.container.querySelector<HTMLInputElement>(
						'[data-descriptor-checkbox]',
					)!;
					const draft = 'draft:' + props.label;
					draftInput.value = draft;
					// User interaction makes checked independent of subsequent default changes,
					// even after toggling back to the initial checked state.
					checkbox.click();
					checkbox.click();
					const checked = checkbox.checked;
					input.focus();
					input.setSelectionRange(1, 3);
					const rows = new Map(
						[...root!.container.querySelectorAll<HTMLElement>('[data-descriptor-row]')].map(
							(row) => {
								row.querySelector('input')!.value = 'draft:' + row.dataset.descriptorRow;
								return [row.dataset.descriptorRow!, row] as const;
							},
						),
					);
					const previousHtml = normaliseHtml(root!.container.innerHTML);
					const firstHtml = normaliseHtml(firstTarget.innerHTML);
					const secondHtml = normaliseHtml(secondTarget.innerHTML);
					const previousPortal = props.portalTarget.firstElementChild;
					const previousRefCalls = [...hostRef.mock.calls];
					const nextRef = vi.fn();
					const resource = deferred();
					const next: DescriptorRootSuspensionProps = {
						...props,
						...scenario,
						items: [...scenario.items],
						...resourceProps(resource),
						onShellRef: nextRef,
					};
					await act(runtime, async () => root!.update(next));
					expect(normaliseHtml(root!.container.innerHTML)).toBe(previousHtml);
					expect(normaliseHtml(firstTarget.innerHTML)).toBe(firstHtml);
					expect(normaliseHtml(secondTarget.innerHTML)).toBe(secondHtml);
					expect(props.portalTarget.firstElementChild).toBe(previousPortal);
					expect(root!.container.querySelector('[data-descriptor-host]')).toBe(host);
					expect(document.activeElement).toBe(input);
					expect(input.selectionStart).toBe(1);
					expect(input.selectionEnd).toBe(3);
					expect(input.value).toBe(props.label);
					expect(root!.container.querySelector('[data-descriptor-draft]')).toBe(draftInput);
					expect(root!.container.querySelector('[data-descriptor-checkbox]')).toBe(checkbox);
					expect(draftInput.defaultValue).toBe(props.label);
					expect(checkbox.defaultChecked).toBe(props.content === 'empty');
					expect(draftInput.value).toBe(draft);
					expect(checkbox.checked).toBe(checked);
					expect(hostRef.mock.calls).toEqual(previousRefCalls);
					expect(nextRef).not.toHaveBeenCalled();
					for (const [key, row] of rows) {
						expect(root!.container.querySelector(`[data-descriptor-row="${key}"]`)).toBe(row);
						expect(row.querySelector('input')!.value).toBe('draft:' + key);
					}
					events.length = 0;
					await act(runtime, async () => root!.click('[data-descriptor-event]'));
					expect(events).toEqual(['host:' + props.label]);
					await act(runtime, async () => resource.resolve(scenario.label + ' data'));
					const nextHost = root!.container.querySelector<HTMLElement>('[data-descriptor-host]')!;
					expect(nextHost.localName).toBe(scenario.hostTag);
					if (props.hostTag === scenario.hostTag) expect(nextHost).toBe(host);
					else expect(nextHost).not.toBe(host);
					expect(nextHost.title).toBe(scenario.label);
					expect(nextHost.className).toBe(scenario.content === 'empty' ? 'descriptor-empty' : '');
					expect(nextHost.style.color).toBe('blue');
					expect(nextHost.style.marginLeft).toBe(scenario.label.length + 'px');
					const nextDraft =
						root!.container.querySelector<HTMLInputElement>('[data-descriptor-draft]')!;
					const nextCheckbox = root!.container.querySelector<HTMLInputElement>(
						'[data-descriptor-checkbox]',
					)!;
					if (props.hostTag === scenario.hostTag) {
						expect(nextDraft).toBe(draftInput);
						expect(nextCheckbox).toBe(checkbox);
					}
					expect(nextDraft.defaultValue).toBe(scenario.label);
					expect(nextCheckbox.defaultChecked).toBe(scenario.content === 'empty');
					expect(nextDraft.value).toBe(props.hostTag === scenario.hostTag ? draft : scenario.label);
					expect(nextCheckbox.checked).toBe(
						props.hostTag === scenario.hostTag ? checked : scenario.content === 'empty',
					);
					expect(root!.container.querySelector('[data-descriptor-html]')?.innerHTML).toBe(
						`<i>${scenario.label}</i>`,
					);
					expect(root!.container.querySelector('[data-descriptor-content]')?.textContent).toBe(
						scenario.content === 'empty' ? '' : scenario.label + ' ' + scenario.content,
					);
					expect(scenario.portalTarget.textContent).toBe(scenario.label + ' portal');
					if (props.portalTarget !== scenario.portalTarget)
						expect(props.portalTarget.textContent).toBe('');
					else expect(scenario.portalTarget.firstElementChild).toBe(previousPortal);
					for (const key of scenario.items) {
						const row = root!.container.querySelector(`[data-descriptor-row="${key}"]`)!;
						const survives =
							props.hostTag === scenario.hostTag &&
							props.childTag === scenario.childTag &&
							rows.has(key);
						if (survives) expect(row).toBe(rows.get(key));
						expect(row.querySelector('input')!.value).toBe(survives ? 'draft:' + key : key);
					}
					expect(hostRef.mock.calls.at(-1)?.[0]).toBeNull();
					expect(nextRef.mock.calls.map((call) => call[0])).toEqual([nextHost]);
					expect(root!.container.querySelector('[data-value]')).toBe(readerNode);
					expect(visible(root!)).toBe(scenario.label + ' data');
					expect(root!.container.querySelector('footer')).toBe(tail);
					expect(onRef.mock.calls.map((call) => call[0])).toEqual([readerNode]);
					events.length = 0;
					await act(runtime, async () => root!.click('[data-descriptor-event]'));
					expect(events).toEqual(['host:' + scenario.label]);
					expect(onUncaughtError).not.toHaveBeenCalled();
					props = next;
					hostRef = nextRef;
				}
			} finally {
				root?.unmount();
				firstTarget.remove();
				secondTarget.remove();
			}
		});

		it('keeps an initial suspended root empty until the whole screen can commit', async () => {
			const resource = deferred();
			const observed = callbacks();
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(
					runtime,
					'RootSuspensionScreen',
					{
						...resourceProps(resource),
						...observed.props,
						label: 'initial',
						items: ['first', 'second'],
					},
					observed,
				);
			});
			expect(normaliseHtml(root.container.innerHTML)).toBe('');
			expect(observed.lifecycle).toEqual([]);
			expect(observed.refs).toEqual([]);
			expect(observed.shellRefs).toEqual([]);
			expect(observed.onUncaughtError).not.toHaveBeenCalled();
			await advance(1000);
			expect(normaliseHtml(root.container.innerHTML)).toBe('');
			await act(runtime, async () => resource.resolve('ready'));
			expect(visible(root)).toBe('ready');
			expect(root.container.querySelector('footer')?.textContent).toBe('initial');
			expect(observed.refs).toEqual([root.container.querySelector('[data-value]')]);
			expect(observed.shellRefs).toEqual([root.container.querySelector('header')]);
			expect(observed.lifecycle.toSorted()).toEqual(
				[
					'layout shell:initial',
					'passive shell:initial',
					'layout item:first',
					'layout item:second',
					'layout reader:ready',
					'passive reader:ready',
				].toSorted(),
			);
			expect(observed.onUncaughtError).not.toHaveBeenCalled();
		});

		it.each(['urgent', 'transition'] as const)(
			'holds the whole committed screen during a suspended %s root update',
			async (priority) => {
				const observed = callbacks();
				const events: string[] = [];
				const initial: RootSuspensionProps = {
					promise: fulfilled('previous data'),
					...observed.props,
					label: 'previous',
					items: ['remove', 'keep'],
					onEvent: (event) => events.push(event),
				};
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(runtime, 'RootSuspensionScreen', initial, observed);
					root.click('[data-count]');
				});
				const main = root.container.querySelector('main');
				const input = root.container.querySelector<HTMLInputElement>('input')!;
				const content = root.container.querySelector('[data-value]');
				const survivor = root.container.querySelector('[data-item="keep"]');
				const removed = root.container.querySelector('[data-item="remove"]');
				input.focus();
				input.setSelectionRange(2, 4);
				const previousHtml = normaliseHtml(root.container.innerHTML);
				const previousLifecycle = [...observed.lifecycle];
				const previousRefs = [...observed.refs];
				const previousShellRefs = [...observed.shellRefs];
				const next = deferred();
				const nextProps: RootSuspensionProps = {
					...initial,
					...resourceProps(next),
					label: 'next',
					items: ['add', 'keep'],
				};
				await act(runtime, async () => {
					if (priority === 'transition') root.transitionUpdate(nextProps);
					else root.update(nextProps);
				});
				expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
				expect(root.container.querySelector('main')).toBe(main);
				expect(root.container.querySelector('input')).toBe(input);
				expect(input.value).toBe('previous');
				expect(input.selectionStart).toBe(2);
				expect(input.selectionEnd).toBe(4);
				expect(document.activeElement).toBe(input);
				expect(root.container.querySelector('[data-item="remove"]')).toBe(removed);
				expect(observed.lifecycle).toEqual(previousLifecycle);
				expect(observed.refs).toEqual(previousRefs);
				expect(observed.shellRefs).toEqual(previousShellRefs);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				await advance(1000);
				expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
				await act(runtime, async () => root.click('[data-event]'));
				await act(runtime, async () => root.click('[data-event-bundle]'));
				expect(events).toEqual(['capture:previous', 'bubble:previous', 'bundle:previous']);
				await act(runtime, async () => next.resolve('next data'));
				expect(visible(root)).toBe('next data');
				expect(root.container.querySelector('main')).toBe(main);
				expect(root.container.querySelector('input')).toBe(input);
				expect(input.value).toBe('next');
				expect(root.container.querySelector('[data-value]')).toBe(content);
				expect(root.container.querySelector('[data-item="keep"]')).toBe(survivor);
				expect(
					[...root.container.querySelectorAll('[data-row-label]')].map((node) => node.textContent),
				).toEqual(['add:next', 'keep:next']);
				expect(root.container.querySelector('footer')?.textContent).toBe('next');
				expect(root.container.querySelector('[data-count]')?.textContent).toBe('next:1');
				expect(observed.lifecycle).toContain('layout cleanup item:remove');
				expect(observed.lifecycle).toContain('layout reader:next data');
				expect(observed.refs).toEqual(previousRefs);
				expect(observed.shellRefs).toEqual(previousShellRefs);
				await act(runtime, async () => root.click('[data-event]'));
				await act(runtime, async () => root.click('[data-event-bundle]'));
				expect(events).toEqual([
					'capture:previous',
					'bubble:previous',
					'bundle:previous',
					'capture:next',
					'bubble:next',
					'bundle:next',
				]);
				await act(runtime, async () => root.click('[data-count]'));
				expect(root.container.querySelector('[data-count]')?.textContent).toBe('next:2');
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
			},
		);

		it('preserves keyed rows and empty content across suspended scalar and structural list updates', async () => {
			const observed = callbacks();
			const events: string[] = [];
			let props: RootSuspensionProps = {
				promise: fulfilled('initial data'),
				label: 'initial',
				items: ['first', 'middle', 'last'],
				...observed.props,
				onEvent: (event) => events.push(event),
			};
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, 'RootSuspensionScreen', props, observed);
			});
			for (const scenario of [
				{ label: 'stable', items: ['first', 'middle', 'last'] },
				{ label: 'extended', items: ['before', 'first', 'middle', 'last', 'after'] },
				{ label: 'reordered', items: ['after', 'middle', 'first'] },
				{ label: 'empty', items: [] },
				{ label: 'refilled', items: ['first', 'after'] },
			]) {
				const previousRows = new Map<string, { row: HTMLLIElement; input: HTMLInputElement }>();
				for (const row of root.container.querySelectorAll<HTMLLIElement>('[data-item]')) {
					const key = row.dataset.item!;
					const input = row.querySelector('input')!;
					input.value = 'draft:' + key;
					previousRows.set(key, { row, input });
				}
				const previousHtml = normaliseHtml(root.container.innerHTML);
				const previousEmpty = root.container.querySelector('[data-empty]');
				const previousLifecycle = [...observed.lifecycle];
				const resource = deferred();
				const nextProps = { ...props, ...scenario, ...resourceProps(resource) };
				await act(runtime, async () => root.update(nextProps));
				expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
				expect(root.container.querySelector('[data-empty]')).toBe(previousEmpty);
				expect(observed.lifecycle).toEqual(previousLifecycle);
				events.length = 0;
				for (const [key, previous] of previousRows) {
					expect(root.container.querySelector(`[data-item="${key}"]`)).toBe(previous.row);
					expect(previous.input.value).toBe('draft:' + key);
					await act(runtime, async () => root.click(`[data-item="${key}"] [data-row-event]`));
				}
				expect(events).toEqual([...previousRows.keys()].map((key) => `row:${key}:${props.label}`));
				await act(runtime, async () => resource.resolve(scenario.label + ' data'));
				expect(
					[...root.container.querySelectorAll<HTMLElement>('[data-item]')].map(
						(row) => row.dataset.item,
					),
				).toEqual(scenario.items);
				for (const key of scenario.items) {
					const row = root.container.querySelector(`[data-item="${key}"]`)!;
					const input = row.querySelector('input')!;
					const previous = previousRows.get(key);
					if (previous !== undefined) {
						expect(row).toBe(previous.row);
						expect(input).toBe(previous.input);
					}
					expect(input.value).toBe(previous === undefined ? key : 'draft:' + key);
					expect(row.querySelector('[data-row-label]')?.textContent).toBe(
						key + ':' + scenario.label,
					);
				}
				expect(root.container.querySelector('[data-empty]')?.textContent ?? null).toBe(
					scenario.items.length === 0 ? 'empty:' + scenario.label : null,
				);
				for (const key of previousRows.keys()) {
					if (scenario.items.includes(key)) continue;
					const cleanup = 'layout cleanup item:' + key;
					expect(
						observed.lifecycle.slice(previousLifecycle.length).filter((event) => event === cleanup),
					).toEqual([cleanup]);
				}
				events.length = 0;
				for (const key of scenario.items) {
					await act(runtime, async () => root.click(`[data-item="${key}"] [data-row-event]`));
				}
				expect(events).toEqual(scenario.items.map((key) => `row:${key}:${scenario.label}`));
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				props = nextProps;
			}
		});

		it.each<StructuralRootSuspensionProps['shape']>([
			'keyed component',
			'conditional branch',
			'dynamic component',
		])('retains an earlier %s replacement until a later sibling is ready', async (shape) => {
			const observed = callbacks();
			const initial: StructuralRootSuspensionProps = {
				promise: fulfilled('previous data'),
				label: 'previous',
				shape,
				...observed.props,
			};
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, 'StructuralRootSuspensionScreen', initial, observed);
				root.click('[data-count]');
			});
			const previousShell = root.container.querySelector('header');
			const input = root.container.querySelector<HTMLInputElement>('input')!;
			const onBlur = vi.fn();
			input.addEventListener('blur', onBlur);
			input.addEventListener('focusout', onBlur);
			input.focus();
			input.setSelectionRange(2, 4);
			const content = root.container.querySelector('[data-value]');
			const tail = root.container.querySelector('footer');
			const previousHtml = normaliseHtml(root.container.innerHTML);
			const previousLifecycle = [...observed.lifecycle];
			const previousRefs = [...observed.refs];
			const previousShellRefs = [...observed.shellRefs];
			const resource = deferred();
			await act(runtime, async () =>
				root.update({
					...initial,
					...resourceProps(resource),
					label: 'next',
					alternate: true,
				}),
			);
			expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
			expect(root.container.querySelector('header')).toBe(previousShell);
			expect(document.activeElement).toBe(input);
			expect(input.selectionStart).toBe(2);
			expect(input.selectionEnd).toBe(4);
			expect(onBlur).not.toHaveBeenCalled();
			expect(root.container.querySelector('[data-count]')?.textContent).toBe('previous:1');
			expect(observed.lifecycle).toEqual(previousLifecycle);
			expect(observed.refs).toEqual(previousRefs);
			expect(observed.shellRefs).toEqual(previousShellRefs);
			await act(runtime, async () => resource.resolve('next data'));
			const nextShell = root.container.querySelector('header');
			expect(nextShell).not.toBe(previousShell);
			expect(root.container.querySelector('[data-count]')?.textContent).toBe('next:0');
			expect(root.container.querySelector('[data-value]')).toBe(content);
			expect(content?.textContent).toBe('next data');
			expect(root.container.querySelector('footer')).toBe(tail);
			expect(observed.lifecycle).toContain('layout cleanup shell:previous');
			expect(observed.lifecycle).toContain('passive cleanup shell:previous');
			expect(observed.refs).toEqual(previousRefs);
			expect(observed.shellRefs).toEqual([...previousShellRefs, null, nextShell]);
			expect(observed.onUncaughtError).not.toHaveBeenCalled();
		});

		it.each(['urgent', 'transition'] as const)(
			'retries a nested descendant’s suspended %s state update without replacing the root',
			async (priority) => {
				const next = deferred();
				const observed = callbacks();
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(
						runtime,
						'StatefulRootSuspensionScreen',
						{
							promise: fulfilled('previous data'),
							label: 'previous',
							...observed.props,
							concurrent: priority === 'transition',
							next: { ...resourceProps(next), ...observed.props, label: 'next' },
						},
						observed,
					);
				});
				const shell = root.container.querySelector('[data-static]');
				const input = root.container.querySelector('input');
				const previousHtml = normaliseHtml(root.container.innerHTML);
				const previousLifecycle = [...observed.lifecycle];
				await act(runtime, async () => root.click('[data-update]'));
				expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
				expect(observed.lifecycle).toEqual(previousLifecycle);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				await act(runtime, async () => next.resolve('nested ready'));
				expect(visible(root)).toBe('nested ready');
				expect(root.container.querySelector('[data-static]')).toBe(shell);
				expect(root.container.querySelector('input')).toBe(input);
				expect(root.container.querySelector('footer')?.textContent).toBe('next');
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
			},
		);

		it('holds independently queued siblings under a wrapper together when the middle update suspends', async () => {
			const observed = callbacks();
			const resource = deferred();
			let updateShell!: (label: string) => void;
			let updateReader!: (next: RootSuspensionProps) => void;
			let updateTail!: (label: string) => void;
			const props: IndependentRootSuspensionProps = {
				promise: fulfilled('previous data'),
				label: 'previous',
				...observed.props,
				onShellUpdate: (update) => {
					updateShell = update;
				},
				onReaderUpdate: (update) => {
					updateReader = update;
				},
				onTailUpdate: (update) => {
					updateTail = update;
				},
			};
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(runtime, 'IndependentRootSuspensionScreen', props, observed);
				root.click('[data-count]');
			});
			const shell = root.container.querySelector('header');
			const input = root.container.querySelector<HTMLInputElement>('input')!;
			const content = root.container.querySelector('[data-value]');
			const tail = root.container.querySelector('[data-queued-tail]');
			const previousHtml = normaliseHtml(root.container.innerHTML);
			const previousLifecycle = [...observed.lifecycle];
			const previousRefs = [...observed.refs];
			const previousShellRefs = [...observed.shellRefs];
			const flush = runtime === 'react' ? reactFlushSync : octaneFlushSync;
			await act(runtime, async () =>
				flush(() => {
					updateShell('next');
					updateReader({ ...resourceProps(resource), ...observed.props, label: 'next' });
					updateTail('next');
				}),
			);
			expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
			expect(input.value).toBe('previous');
			expect(observed.lifecycle).toEqual(previousLifecycle);
			expect(observed.refs).toEqual(previousRefs);
			expect(observed.shellRefs).toEqual(previousShellRefs);
			await act(runtime, async () => resource.resolve('next data'));
			expect(root.container.querySelector('header')).toBe(shell);
			expect(root.container.querySelector('input')).toBe(input);
			expect(input.value).toBe('next');
			expect(root.container.querySelector('[data-count]')?.textContent).toBe('next:1');
			expect(root.container.querySelector('[data-value]')).toBe(content);
			expect(content?.textContent).toBe('next data');
			expect(root.container.querySelector('[data-queued-tail]')).toBe(tail);
			expect(tail?.textContent).toBe('next');
			expect(observed.lifecycle).toContain('layout shell:next');
			expect(observed.lifecycle).toContain('layout tail:next');
			expect(observed.refs).toEqual(previousRefs);
			expect(observed.shellRefs).toEqual(previousShellRefs);
			expect(observed.onUncaughtError).not.toHaveBeenCalled();
		});

		it.each(readMode === 'use' ? ['props', 'context'] : ['props'])(
			'keeps a committed sibling interactive with %s while a suspended root transition waits',
			async (labelSource) => {
				const resource = deferred();
				const observed = callbacks();
				const initial = {
					promise: fulfilled('previous data'),
					label: 'previous',
					...observed.props,
				};
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(
						runtime,
						labelSource === 'context' ? 'ContextRootSuspensionScreen' : 'RootSuspensionScreen',
						initial,
						observed,
					);
				});
				const button = root.container.querySelector('[data-count]');
				await act(runtime, async () =>
					root.transitionUpdate({
						...initial,
						...resourceProps(resource),
						label: 'next',
					}),
				);
				expect(visible(root)).toBe('previous data');
				await act(runtime, async () => root.click('[data-count]'));
				expect(root.container.querySelector('[data-count]')).toBe(button);
				expect(button?.textContent).toBe('previous:1');
				expect(visible(root)).toBe('previous data');
				await act(runtime, async () => resource.resolve('next data'));
				expect(root.container.querySelector('[data-count]')).toBe(button);
				expect(button?.textContent).toBe('next:1');
				expect(visible(root)).toBe('next data');
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
			},
		);

		it.each(['key', 'component'] as const)(
			'keeps the old root mounted until its replacement %s is ready',
			async (replacement) => {
				const resource = deferred();
				const observed = callbacks();
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(
						runtime,
						'RootSuspensionScreen',
						{ promise: fulfilled('previous data'), label: 'previous', ...observed.props },
						observed,
					);
					root.click('[data-count]');
				});
				const previousHtml = normaliseHtml(root.container.innerHTML);
				const previousMain = root.container.querySelector('main');
				const previousLifecycle = [...observed.lifecycle];
				const previousRefs = [...observed.refs];
				await act(runtime, async () => {
					root.replace(
						replacement === 'key' ? 'RootSuspensionScreen' : 'AlternateRootSuspensionScreen',
						{ ...resourceProps(resource), label: 'replacement', ...observed.props },
						replacement === 'key' ? 'replacement' : undefined,
					);
				});
				expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
				expect(root.container.querySelector('main')).toBe(previousMain);
				expect(observed.lifecycle).toEqual(previousLifecycle);
				expect(observed.refs).toEqual(previousRefs);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				await act(runtime, async () => resource.resolve('replacement data'));
				expect(visible(root)).toBe('replacement data');
				expect(root.container.querySelector('main')).not.toBe(previousMain);
				expect(root.container.querySelector('[data-count]')?.textContent).toBe('replacement:0');
				expect(observed.lifecycle).toContain('layout cleanup shell:previous');
				expect(observed.lifecycle).toContain('passive cleanup reader:previous data');
				expect(observed.refs).toEqual([
					...previousRefs,
					null,
					root.container.querySelector('[data-value]'),
				]);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
			},
		);

		it.each(['pending', 'ready'] as const)(
			'lets newer %s root inputs supersede a suspended request',
			async (latestState) => {
				const older = deferred();
				const latest = deferred();
				const observed = callbacks();
				const initial = {
					promise: fulfilled('previous data'),
					label: 'previous',
					...observed.props,
				};
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(runtime, 'RootSuspensionScreen', initial, observed);
				});
				const previousHtml = normaliseHtml(root.container.innerHTML);
				await act(runtime, async () => {
					root.update({ ...initial, ...resourceProps(older), label: 'older' });
				});
				expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
				const latestProps = { ...initial, ...resourceProps(latest), label: 'latest' };
				if (latestState === 'ready') {
					latest.resolve('latest data');
					await advance();
				}
				await act(runtime, async () => root.update(latestProps));
				if (latestState === 'pending') {
					expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
					await act(runtime, async () => older.resolve('stale data'));
					expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
					await act(runtime, async () => latest.resolve('latest data'));
				} else {
					expect(visible(root)).toBe('latest data');
					await act(runtime, async () => older.reject(new Error('stale rejection')));
				}
				expect(visible(root)).toBe('latest data');
				expect(root.container.querySelector('footer')?.textContent).toBe('latest');
				expect(observed.lifecycle).not.toContain('layout shell:older');
				expect(observed.lifecycle).not.toContain('layout reader:stale data');
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
			},
		);

		it.each(['caught', 'uncaught'] as const)(
			'reports only the actual %s rejection when a root retry fails',
			async (routing) => {
				const resource = deferred();
				const observed = callbacks();
				const initial = {
					promise: fulfilled('previous data'),
					label: 'previous',
					...observed.props,
				};
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(
						runtime,
						routing === 'caught' ? 'CatchingRootSuspensionScreen' : 'RootSuspensionScreen',
						initial,
						observed,
					);
				});
				const previousHtml = normaliseHtml(root.container.innerHTML);
				await act(runtime, async () => {
					root.update({ ...initial, ...resourceProps(resource), label: 'next' });
				});
				expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				expect(root.caughtErrors).toEqual([]);
				const error = new Error('root request failed');
				// React's act rethrows uncaught errors instead of reporting through the root callback.
				resource.reject(error);
				await advance();
				if (routing === 'caught') {
					expect(visible(root)).toBe('root request failed');
					expect(root.caughtErrors).toEqual([error]);
					expect(observed.onUncaughtError).not.toHaveBeenCalled();
				} else {
					expect(normaliseHtml(root.container.innerHTML)).toBe('');
					expect(root.caughtErrors).toEqual([]);
					expect(observed.onUncaughtError.mock.calls.map((call) => call[0])).toEqual([error]);
				}
				expect(observed.refs.at(-1)).toBeNull();
				expect(observed.lifecycle).toContain('layout cleanup reader:previous data');
				expect(observed.lifecycle).not.toContain('layout shell:next');
			},
		);

		it.each(['initial', 'updated'] as const)(
			'does not revive an unmounted %s suspended root',
			async (entry) => {
				const resource = deferred();
				const observed = callbacks();
				const pendingProps = { ...resourceProps(resource), label: 'pending', ...observed.props };
				let root!: TimingRoot;
				await act(runtime, async () => {
					root = mount(
						runtime,
						'RootSuspensionScreen',
						entry === 'initial'
							? pendingProps
							: { promise: fulfilled('previous data'), label: 'previous', ...observed.props },
						observed,
					);
				});
				if (entry === 'updated') await act(runtime, async () => root.update(pendingProps));
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				await act(runtime, async () => root.unmount());
				const unmountedLifecycle = [...observed.lifecycle];
				const unmountedRefs = [...observed.refs];
				await act(runtime, async () => resource.resolve('abandoned data'));
				await advance(1000);
				expect(normaliseHtml(root.container.innerHTML)).toBe('');
				expect(observed.lifecycle).toEqual(unmountedLifecycle);
				expect(observed.refs).toEqual(unmountedRefs);
				expect(observed.onUncaughtError).not.toHaveBeenCalled();
				if (entry === 'initial') {
					expect(observed.lifecycle).toEqual([]);
					expect(observed.refs).toEqual([]);
				} else {
					expect(observed.refs).toEqual([expect.any(HTMLSpanElement), null]);
					expect(
						observed.lifecycle.filter((event) => event === 'layout cleanup shell:previous'),
					).toEqual(['layout cleanup shell:previous']);
				}
			},
		);

		it('keeps roots independent when they share a resource and one is unmounted', async () => {
			const resource = deferred();
			const firstObserved = callbacks();
			const secondObserved = callbacks();
			let first!: TimingRoot;
			let second!: TimingRoot;
			await act(runtime, async () => {
				first = mount(
					runtime,
					'RootSuspensionScreen',
					{ promise: fulfilled('first previous'), label: 'first', ...firstObserved.props },
					firstObserved,
				);
				second = mount(
					runtime,
					'RootSuspensionScreen',
					{ promise: fulfilled('second previous'), label: 'second', ...secondObserved.props },
					secondObserved,
				);
				second.click('[data-count]');
			});
			const secondInput = second.container.querySelector('input');
			await act(runtime, async () => {
				first.update({ ...resourceProps(resource), label: 'first next', ...firstObserved.props });
				second.update({
					...resourceProps(resource),
					label: 'second next',
					...secondObserved.props,
				});
			});
			expect(visible(first)).toBe('first previous');
			expect(visible(second)).toBe('second previous');
			await act(runtime, async () => first.unmount());
			const firstLifecycle = [...firstObserved.lifecycle];
			await act(runtime, async () => resource.resolve('shared data'));
			expect(normaliseHtml(first.container.innerHTML)).toBe('');
			expect(firstObserved.lifecycle).toEqual(firstLifecycle);
			expect(visible(second)).toBe('shared data');
			expect(second.container.querySelector('input')).toBe(secondInput);
			expect(second.container.querySelector('[data-count]')?.textContent).toBe('second next:1');
			expect(firstObserved.onUncaughtError).not.toHaveBeenCalled();
			expect(secondObserved.onUncaughtError).not.toHaveBeenCalled();
		});
	});

	it('retains compiled and spread defaults, textarea children and select state while the root is suspended', async () => {
		const resource = deferred();
		const observed = callbacks();
		const initial: DefaultedRootSuspensionProps = {
			promise: fulfilled('previous data'),
			label: 'previous',
			input: { defaultValue: 'previous spread' },
			select: { multiple: true, defaultValue: ['first', 'second'] },
			...observed.props,
		};
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(runtime, 'DefaultedRootSuspensionScreen', initial, observed);
		});
		const controls = [
			...root.container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-default]'),
		];
		const [pristineInput, editedInput, pristineArea, editedArea, spreadInput] = controls;
		const previousDefaults = ['previous', 'previous', 'previous', 'previous', 'previous spread'];
		expect(controls.map((control) => control.defaultValue)).toEqual(previousDefaults);
		expect(controls.map((control) => control.value)).toEqual(previousDefaults);
		editedInput.value = 'edited input';
		editedArea.value = 'edited textarea';
		spreadInput.value = 'edited spread';
		const textareaChildren = [pristineArea.firstChild, editedArea.firstChild];
		const select = root.container.querySelector<HTMLSelectElement>('[data-default-select]')!;
		const options = [...select.options];
		expect(options.map((option) => option.defaultSelected)).toEqual([true, true, false]);
		for (const option of options) option.selected = option.value !== 'second';
		const previousHtml = normaliseHtml(root.container.innerHTML);
		const previousLifecycle = [...observed.lifecycle];
		const previousRefs = [...observed.refs];
		const content = root.container.querySelector('[data-value]');
		await act(runtime, async () =>
			root.update({
				...initial,
				promise: resource.promise,
				label: 'next',
				input: { defaultValue: 'next spread' },
				select: { multiple: false, defaultValue: 'third' },
			}),
		);
		expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
		for (const control of controls) {
			expect(root.container.querySelector(`[data-default="${control.dataset.default}"]`)).toBe(
				control,
			);
		}
		expect(controls.map((control) => control.defaultValue)).toEqual(previousDefaults);
		expect(controls.map((control) => control.value)).toEqual([
			'previous',
			'edited input',
			'previous',
			'edited textarea',
			'edited spread',
		]);
		expect(pristineArea.firstChild).toBe(textareaChildren[0]);
		expect(editedArea.firstChild).toBe(textareaChildren[1]);
		expect(root.container.querySelector('[data-default-select]')).toBe(select);
		expect(select.multiple).toBe(true);
		for (let index = 0; index < options.length; index++)
			expect(select.options[index]).toBe(options[index]);
		expect(options.map((option) => option.selected)).toEqual([true, false, true]);
		expect(options.map((option) => option.defaultSelected)).toEqual([true, true, false]);
		expect(visible(root)).toBe('previous data');
		expect(observed.lifecycle).toEqual(previousLifecycle);
		expect(observed.refs).toEqual(previousRefs);
		// Previously pristine controls remain editable on the retained screen.
		pristineInput.value = 'input edited while pending';
		pristineArea.value = 'textarea edited while pending';
		await act(runtime, async () => resource.resolve('next data'));
		for (const control of controls) {
			expect(root.container.querySelector(`[data-default="${control.dataset.default}"]`)).toBe(
				control,
			);
		}
		expect(controls.map((control) => control.defaultValue)).toEqual([
			'next',
			'next',
			'next',
			'next',
			'next spread',
		]);
		expect(controls.map((control) => control.value)).toEqual([
			'input edited while pending',
			'edited input',
			'textarea edited while pending',
			'edited textarea',
			'edited spread',
		]);
		expect(root.container.querySelector('[data-default-select]')).toBe(select);
		expect(select.multiple).toBe(false);
		expect([...select.selectedOptions].map((option) => option.value)).toEqual(['third']);
		expect(options[2].defaultSelected).toBe(true);
		expect(root.container.querySelector('[data-value]')).toBe(content);
		expect(visible(root)).toBe('next data');
		expect(observed.refs).toEqual(previousRefs);
		expect(observed.onUncaughtError).not.toHaveBeenCalled();
	});

	it.each(['text', 'host'] as const)(
		'keeps a previously empty component empty when its new %s precedes a suspended sibling',
		async (kind) => {
			const h = (runtime === 'react' ? createElement : createOctaneElement) as typeof createElement;
			const read = runtime === 'react' ? reactUse : octaneUse;
			function Earlier(props: TimingProps) {
				if (props.label === 'previous') return undefined;
				const text = props.label + ' content';
				return kind === 'text'
					? text
					: h('span', { 'data-new-return': true, ref: props.onRef }, text);
			}
			function Reader(props: TimingProps) {
				return h('span', { 'data-value': 'new-return-reader' }, read(props.promise));
			}
			function App(props: TimingProps) {
				return h(
					'main',
					null,
					h(Earlier, props),
					h(Reader, props),
					h('footer', null, 'stable tail'),
				);
			}
			const onRef = vi.fn();
			const onUncaughtError = vi.fn();
			const resource = deferred();
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(
					runtime,
					App,
					{ promise: fulfilled('previous data'), label: 'previous', onRef },
					{ onUncaughtError },
				);
			});
			const content = root.container.querySelector('[data-value]');
			const tail = root.container.querySelector('footer');
			const previousHtml = normaliseHtml(root.container.innerHTML);
			await act(runtime, async () =>
				root.update({ promise: resource.promise, label: 'next', onRef }),
			);
			expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
			expect(root.container.querySelector('[data-value]')).toBe(content);
			expect(root.container.querySelector('footer')).toBe(tail);
			expect(onRef).not.toHaveBeenCalled();
			expect(onUncaughtError).not.toHaveBeenCalled();
			await act(runtime, async () => resource.resolve('next data'));
			expect(root.container.querySelector('main')?.textContent).toBe(
				'next contentnext datastable tail',
			);
			expect(root.container.querySelector('[data-value]')).toBe(content);
			expect(root.container.querySelector('footer')).toBe(tail);
			const returnedHost = root.container.querySelector('[data-new-return]');
			if (kind === 'host') {
				expect(returnedHost?.textContent).toBe('next content');
				expect(onRef.mock.calls.map((call) => call[0])).toEqual([returnedHost]);
			} else {
				expect(returnedHost).toBeNull();
				expect(onRef).not.toHaveBeenCalled();
			}
			expect(onUncaughtError).not.toHaveBeenCalled();
		},
	);

	it('preserves existing host children when adding or removing a component before a suspended sibling', async () => {
		type UpgradeProps = TimingProps & { expanded: boolean };
		const h = (runtime === 'react' ? createElement : createOctaneElement) as typeof createElement;
		const read = runtime === 'react' ? reactUse : octaneUse;
		const hostRef = vi.fn();
		const inputRef = vi.fn();
		const spanRef = vi.fn();
		const addedRef = vi.fn();
		const onUncaughtError = vi.fn();
		function Added(props: { label: string }) {
			return h(
				'strong',
				{ 'data-added-component': true, ref: addedRef },
				props.label + ' component',
			);
		}
		function Reader(props: UpgradeProps) {
			return h('span', { 'data-value': 'adoption-reader' }, read(props.promise));
		}
		function App(props: UpgradeProps) {
			return h(
				'main',
				null,
				h(
					'section',
					{ 'data-upgrade-host': true, ref: hostRef },
					h('input', {
						key: 'draft',
						'aria-label': 'upgrade draft',
						defaultValue: 'initial',
						ref: inputRef,
					}),
					h('span', { key: 'label', 'data-host-label': true, ref: spanRef }, props.label),
					props.expanded ? h(Added, { key: 'component', label: props.label }) : null,
				),
				h(Reader, props),
				h('footer', null, 'stable tail'),
			);
		}
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(
				runtime,
				App,
				{ promise: fulfilled('previous data'), label: 'previous', expanded: false },
				{ onUncaughtError },
			);
		});
		const host = root.container.querySelector('section');
		const input = root.container.querySelector('input')!;
		const span = root.container.querySelector('[data-host-label]');
		const readerNode = root.container.querySelector('[data-value]');
		const tail = root.container.querySelector('footer');
		const onBlur = vi.fn();
		input.addEventListener('blur', onBlur);
		input.addEventListener('focusout', onBlur);
		input.value = 'user draft';
		for (const expanded of [true, false]) {
			input.focus();
			input.setSelectionRange(1, 4);
			const previousHtml = normaliseHtml(root.container.innerHTML);
			const previousAddedRefs = addedRef.mock.calls.map((call) => call[0]);
			const resource = deferred();
			const next: UpgradeProps = {
				promise: resource.promise,
				label: expanded ? 'expanded' : 'collapsed',
				expanded,
			};
			await act(runtime, async () => root.update(next));
			expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
			expect(root.container.querySelector('section')).toBe(host);
			expect(root.container.querySelector('input')).toBe(input);
			expect(root.container.querySelector('[data-host-label]')).toBe(span);
			expect(root.container.querySelector('[data-value]')).toBe(readerNode);
			expect(root.container.querySelector('footer')).toBe(tail);
			expect(input.value).toBe('user draft');
			expect(document.activeElement).toBe(input);
			expect(input.selectionStart).toBe(1);
			expect(input.selectionEnd).toBe(4);
			expect(onBlur).not.toHaveBeenCalled();
			expect(hostRef.mock.calls.map((call) => call[0])).toEqual([host]);
			expect(inputRef.mock.calls.map((call) => call[0])).toEqual([input]);
			expect(spanRef.mock.calls.map((call) => call[0])).toEqual([span]);
			expect(addedRef.mock.calls.map((call) => call[0])).toEqual(previousAddedRefs);
			await act(runtime, async () => resource.resolve(next.label + ' data'));
			expect(root.container.querySelector('section')).toBe(host);
			expect(root.container.querySelector('input')).toBe(input);
			expect(root.container.querySelector('[data-host-label]')).toBe(span);
			expect(span?.textContent).toBe(next.label);
			expect(root.container.querySelector('[data-value]')).toBe(readerNode);
			expect(readerNode?.textContent).toBe(next.label + ' data');
			expect(root.container.querySelector('footer')).toBe(tail);
			expect(input.value).toBe('user draft');
			expect(document.activeElement).toBe(input);
			expect(input.selectionStart).toBe(1);
			expect(input.selectionEnd).toBe(4);
			expect(onBlur).not.toHaveBeenCalled();
			expect(hostRef.mock.calls.map((call) => call[0])).toEqual([host]);
			expect(inputRef.mock.calls.map((call) => call[0])).toEqual([input]);
			expect(spanRef.mock.calls.map((call) => call[0])).toEqual([span]);
			const added = root.container.querySelector('[data-added-component]');
			if (expanded) expect(added?.textContent).toBe(next.label + ' component');
			else expect(added).toBeNull();
			expect(addedRef.mock.calls.map((call) => call[0])).toEqual([...previousAddedRefs, added]);
			expect(onUncaughtError).not.toHaveBeenCalled();
		}
	});

	it('commits a ready replacement even when its removed descendant has a queued suspended update', async () => {
		const resource = deferred();
		const observed = callbacks();
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(
				runtime,
				'RetiringRootSuspensionScreen',
				{
					promise: resource.promise,
					label: 'previous',
					...observed.props,
				},
				observed,
			);
		});
		const tail = root.container.querySelector('footer');
		await act(runtime, async () => root.click('[data-retire]'));
		expect(root.container.querySelector('[data-ready-replacement]')?.textContent).toBe(
			'ready replacement',
		);
		expect(root.container.querySelector('header')).toBeNull();
		expect(root.container.querySelector('[data-retire]')).toBeNull();
		expect(root.container.querySelector('footer')).toBe(tail);
		expect(observed.shellRefs.at(-1)).toBeNull();
		for (const kind of ['layout', 'passive']) {
			const cleanup = kind + ' cleanup shell:previous';
			expect(observed.lifecycle.filter((event) => event === cleanup)).toEqual([cleanup]);
		}
		const committedLifecycle = [...observed.lifecycle];
		const committedRefs = [...observed.shellRefs];
		const committedHtml = normaliseHtml(root.container.innerHTML);
		await act(runtime, async () => resource.resolve('stale data'));
		expect(normaliseHtml(root.container.innerHTML)).toBe(committedHtml);
		expect(root.container.querySelector('footer')).toBe(tail);
		expect(observed.lifecycle).toEqual(committedLifecycle);
		expect(observed.shellRefs).toEqual(committedRefs);
		expect(observed.onUncaughtError).not.toHaveBeenCalled();
	});

	it.each<StructuralRootSuspensionProps['shape']>([
		'value component',
		'returned array',
		'empty value',
	])('preserves earlier %s content until a later reader is ready', async (shape) => {
		const observed = callbacks();
		let props: StructuralRootSuspensionProps = {
			promise: fulfilled('previous data'),
			label: 'previous',
			shape,
			...observed.props,
		};
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(runtime, 'StructuralRootSuspensionScreen', props, observed);
		});
		const content = root.container.querySelector('[data-value]');
		const tail = root.container.querySelector('footer');
		for (const alternate of [true, false]) {
			const previousShell = root.container.querySelector('header');
			const previousInput = root.container.querySelector<HTMLInputElement>('input');
			const onBlur = vi.fn();
			if (previousShell !== null) {
				await act(runtime, async () => root.click('[data-count]'));
				previousInput!.addEventListener('blur', onBlur);
				previousInput!.addEventListener('focusout', onBlur);
				previousInput!.focus();
				previousInput!.setSelectionRange(1, 3);
			}
			const previousHtml = normaliseHtml(root.container.innerHTML);
			const previousLifecycle = [...observed.lifecycle];
			const previousShellRefs = [...observed.shellRefs];
			const previousRefs = [...observed.refs];
			const resource = deferred();
			const next: StructuralRootSuspensionProps = {
				...props,
				promise: resource.promise,
				label: alternate ? 'next' : 'last',
				alternate,
			};
			await act(runtime, async () => root.update(next));
			expect(normaliseHtml(root.container.innerHTML)).toBe(previousHtml);
			expect(root.container.querySelector('header')).toBe(previousShell);
			expect(observed.lifecycle).toEqual(previousLifecycle);
			expect(observed.shellRefs).toEqual(previousShellRefs);
			expect(observed.refs).toEqual(previousRefs);
			if (previousShell !== null) {
				expect(document.activeElement).toBe(previousInput);
				expect(previousInput!.selectionStart).toBe(1);
				expect(previousInput!.selectionEnd).toBe(3);
				expect(onBlur).not.toHaveBeenCalled();
				expect(root.container.querySelector('[data-count]')?.textContent).toBe(props.label + ':1');
			}
			await act(runtime, async () => resource.resolve(next.label + ' data'));
			const nextShell = root.container.querySelector('header');
			const hasShell = shape !== 'empty value' || alternate;
			if (hasShell) {
				expect(nextShell).not.toBeNull();
				expect(nextShell).not.toBe(previousShell);
				expect(root.container.querySelector('[data-count]')?.textContent).toBe(next.label + ':0');
				expect(observed.lifecycle).toContain('layout shell:' + next.label);
				expect(observed.lifecycle).toContain('passive shell:' + next.label);
			} else {
				expect(nextShell).toBeNull();
				expect(observed.lifecycle).not.toContain('layout shell:' + next.label);
			}
			if (previousShell !== null) {
				for (const kind of ['layout', 'passive']) {
					const cleanup = kind + ' cleanup shell:' + props.label;
					expect(
						observed.lifecycle.slice(previousLifecycle.length).filter((event) => event === cleanup),
					).toEqual([cleanup]);
				}
			}
			expect(observed.shellRefs).toEqual([
				...previousShellRefs,
				...(previousShell === null ? [] : [null]),
				...(hasShell ? [nextShell] : []),
			]);
			expect(root.container.querySelector('[data-array-tail]')?.textContent ?? null).toBe(
				shape === 'returned array' && alternate ? next.label + ' array' : null,
			);
			expect(root.container.querySelector('[data-value]')).toBe(content);
			expect(content?.textContent).toBe(next.label + ' data');
			expect(root.container.querySelector('footer')).toBe(tail);
			expect(observed.refs).toEqual(previousRefs);
			expect(observed.onUncaughtError).not.toHaveBeenCalled();
			props = next;
		}
	});

	it.each(['current props', 'refreshed props'] as const)(
		'keeps its transition pending until the root completes or an urgent selection supersedes it (%s)',
		async (propsMode) => {
			const first = deferred();
			const second = deferred();
			const observed = callbacks();
			const layoutStates: Array<[string, string | null | undefined]> = [];
			let root!: TimingRoot;
			const initial: TransitionRootSuspensionProps = {
				promise: fulfilled('previous data'),
				label: 'previous',
				...observed.props,
				next: {
					promise: first.promise,
					label: 'first',
					...observed.props,
					onLayout: (value) => {
						layoutStates.push([
							value,
							root.container.querySelector('[data-root-pending]')?.textContent,
						]);
					},
				},
				urgent: { promise: fulfilled('urgent data'), label: 'urgent', ...observed.props },
			};
			const refreshedProps: TransitionRootSuspensionProps = {
				...initial,
				next: { promise: second.promise, label: 'second', ...observed.props },
			};
			await act(runtime, async () => {
				root = mount(runtime, 'TransitionRootSuspensionScreen', initial, observed);
			});
			const pending = root.container.querySelector('[data-root-pending]')!;
			const content = root.container.querySelector('[data-value]');
			const shell = root.container.querySelector('header');
			const previousLifecycle = [...observed.lifecycle];
			expect(pending.textContent).toBe('idle');
			await act(runtime, async () => root.click('[data-transition]'));
			expect(visible(root)).toBe('previous data');
			expect(pending.textContent).toBe('pending');
			expect(root.container.querySelector('[data-value]')).toBe(content);
			expect(root.container.querySelector('header')).toBe(shell);
			expect(observed.lifecycle).toEqual(previousLifecycle);
			if (propsMode === 'refreshed props') {
				await act(runtime, async () => root.update(refreshedProps));
				expect(visible(root)).toBe('previous data');
				expect(pending.textContent).toBe('pending');
				expect(observed.lifecycle).toEqual(previousLifecycle);
			}
			expect(layoutStates).toEqual([]);
			await act(runtime, async () => first.resolve('first data'));
			expect(visible(root)).toBe('first data');
			expect(pending.textContent).toBe('idle');
			expect(layoutStates).toEqual([['first data', 'idle']]);
			expect(root.container.querySelector('[data-value]')).toBe(content);
			expect(root.container.querySelector('header')).toBe(shell);
			if (propsMode === 'current props') {
				await act(runtime, async () => root.update(refreshedProps));
			}
			const firstLifecycle = [...observed.lifecycle];
			await act(runtime, async () => root.click('[data-transition]'));
			expect(visible(root)).toBe('first data');
			expect(pending.textContent).toBe('pending');
			expect(observed.lifecycle).toEqual(firstLifecycle);
			await act(runtime, async () => root.click('[data-urgent]'));
			expect(visible(root)).toBe('urgent data');
			expect(pending.textContent).toBe('idle');
			expect(root.container.querySelector('[data-value]')).toBe(content);
			expect(root.container.querySelector('header')).toBe(shell);
			const urgentHtml = normaliseHtml(root.container.innerHTML);
			const urgentLifecycle = [...observed.lifecycle];
			const urgentRefs = [...observed.refs];
			const urgentShellRefs = [...observed.shellRefs];
			await act(runtime, async () => second.resolve('stale data'));
			expect(normaliseHtml(root.container.innerHTML)).toBe(urgentHtml);
			expect(observed.lifecycle).toEqual(urgentLifecycle);
			expect(observed.refs).toEqual(urgentRefs);
			expect(observed.shellRefs).toEqual(urgentShellRefs);
			expect(observed.onUncaughtError).not.toHaveBeenCalled();
		},
	);

	it('keeps a root transition pending through successive resource suspensions', async () => {
		const first = deferred();
		const second = deferred();
		const readFirst = reader(first);
		const readSecond = reader(second);
		const observed = callbacks();
		const layoutStates: Array<[string, string | null | undefined]> = [];
		let root!: TimingRoot;
		const previous: RootSuspensionProps = {
			promise: fulfilled('previous data'),
			label: 'previous',
			...observed.props,
		};
		await act(runtime, async () => {
			root = mount(
				runtime,
				'TransitionRootSuspensionScreen',
				{
					...previous,
					next: {
						promise: first.promise,
						read: () => readFirst() + '/' + readSecond(),
						label: 'complete',
						...observed.props,
						onLayout: (value) => {
							layoutStates.push([
								value,
								root.container.querySelector('[data-root-pending]')?.textContent,
							]);
						},
					},
					urgent: previous,
				},
				observed,
			);
		});
		const pending = root.container.querySelector('[data-root-pending]')!;
		const content = root.container.querySelector('[data-value]');
		const previousLifecycle = [...observed.lifecycle];
		const previousRefs = [...observed.refs];
		await act(runtime, async () => root.click('[data-transition]'));
		expect(visible(root)).toBe('previous data');
		expect(pending.textContent).toBe('pending');
		const heldHtml = normaliseHtml(root.container.innerHTML);
		await act(runtime, async () => first.resolve('first'));
		expect(normaliseHtml(root.container.innerHTML)).toBe(heldHtml);
		expect(pending.textContent).toBe('pending');
		expect(root.container.querySelector('[data-value]')).toBe(content);
		expect(observed.lifecycle).toEqual(previousLifecycle);
		expect(observed.refs).toEqual(previousRefs);
		expect(layoutStates).toEqual([]);
		await act(runtime, async () => second.resolve('second'));
		expect(visible(root)).toBe('first/second');
		expect(pending.textContent).toBe('idle');
		expect(root.container.querySelector('[data-value]')).toBe(content);
		expect(layoutStates).toEqual([['first/second', 'idle']]);
		expect(observed.refs).toEqual(previousRefs);
		expect(observed.onUncaughtError).not.toHaveBeenCalled();
	});

	it.each(['unmount', 'rejection'] as const)(
		'releases a held root transition after %s without affecting later work',
		async (ending) => {
			const resource = deferred();
			const observed = callbacks();
			const previous: RootSuspensionProps = {
				promise: fulfilled('previous data'),
				label: 'previous',
				...observed.props,
			};
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(
					runtime,
					'TransitionRootSuspensionScreen',
					{
						...previous,
						next: { promise: resource.promise, label: 'next', ...observed.props },
						urgent: previous,
					},
					observed,
				);
			});
			await act(runtime, async () => root.click('[data-transition]'));
			expect(visible(root)).toBe('previous data');
			expect(root.container.querySelector('[data-root-pending]')?.textContent).toBe('pending');
			const error = new Error('transition request failed');
			if (ending === 'unmount') {
				await act(runtime, async () => root.unmount());
			} else {
				// Observe the original rejection through the public root callback, outside act.
				resource.reject(error);
				await advance();
			}
			expect(normaliseHtml(root.container.innerHTML)).toBe('');
			expect(observed.onUncaughtError.mock.calls.map((call) => call[0])).toEqual(
				ending === 'rejection' ? [error] : [],
			);
			await act(runtime, async () => {});
			expect(observed.refs.at(-1)).toBeNull();
			expect(observed.shellRefs.at(-1)).toBeNull();
			expect(
				observed.lifecycle.filter((event) => event === 'layout cleanup shell:previous'),
			).toEqual(['layout cleanup shell:previous']);
			expect(observed.lifecycle.filter((event) => event.startsWith('passive cleanup '))).toEqual([
				'passive cleanup shell:previous',
				'passive cleanup reader:previous data',
			]);
			const completedLifecycle = [...observed.lifecycle];
			const completedRefs = [...observed.refs];
			const completedShellRefs = [...observed.shellRefs];
			const freshErrors = vi.fn();
			let fresh!: TimingRoot;
			await act(runtime, async () => {
				fresh = mount(
					runtime,
					'TransitionRootSuspensionScreen',
					{
						promise: fulfilled('fresh data'),
						label: 'fresh',
						next: { promise: fulfilled('fresh next data'), label: 'fresh next' },
						urgent: { promise: fulfilled('fresh urgent data'), label: 'fresh urgent' },
					},
					{ onUncaughtError: freshErrors },
				);
			});
			expect(fresh.container.querySelector('[data-root-pending]')?.textContent).toBe('idle');
			await act(runtime, async () => fresh.click('[data-transition]'));
			expect(visible(fresh)).toBe('fresh next data');
			expect(fresh.container.querySelector('[data-root-pending]')?.textContent).toBe('idle');
			const freshHtml = normaliseHtml(fresh.container.innerHTML);
			if (ending === 'unmount') await act(runtime, async () => resource.resolve('obsolete data'));
			await advance();
			expect(normaliseHtml(root.container.innerHTML)).toBe('');
			expect(normaliseHtml(fresh.container.innerHTML)).toBe(freshHtml);
			expect(observed.lifecycle).toEqual(completedLifecycle);
			expect(observed.refs).toEqual(completedRefs);
			expect(observed.shellRefs).toEqual(completedShellRefs);
			expect(observed.onUncaughtError.mock.calls.map((call) => call[0])).toEqual(
				ending === 'rejection' ? [error] : [],
			);
			expect(freshErrors).not.toHaveBeenCalled();
		},
	);

	it('reports a falsy error from a replacement without silently committing it', async () => {
		const observed = callbacks();
		const initial: StructuralRootSuspensionProps = {
			promise: fulfilled('previous data'),
			label: 'previous',
			shape: 'conditional branch',
			...observed.props,
		};
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(runtime, 'StructuralRootSuspensionScreen', initial, observed);
		});
		// Observe the public error callback outside act's own error-reporting boundary.
		root.update({ ...initial, alternate: true, label: 'next', shellError: 0 });
		await advance();
		expect(observed.onUncaughtError.mock.calls.map((call) => call[0])).toEqual([0]);
		expect(normaliseHtml(root.container.innerHTML)).toBe('');
		expect(observed.lifecycle).not.toContain('layout shell:next');
		expect(observed.lifecycle).not.toContain('passive shell:next');
		expect(observed.lifecycle).toContain('layout cleanup shell:previous');
		expect(observed.shellRefs.at(-1)).toBeNull();
	});

	it('retries successive custom thenables without publishing intermediate or duplicate commits', async () => {
		const firstListeners: Array<() => void> = [];
		const secondListeners: Array<() => void> = [];
		const first = { then: (resolve: () => void) => firstListeners.push(resolve) };
		const second = { then: (resolve: () => void) => secondListeners.push(resolve) };
		let firstReady = false;
		let secondReady = false;
		const observed = callbacks();
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(
				runtime,
				'RootSuspensionScreen',
				{
					promise: fulfilled('unused'),
					read() {
						if (!firstReady) throw first;
						if (!secondReady) throw second;
						return 'both ready';
					},
					label: 'custom',
					...observed.props,
				},
				observed,
			);
		});
		expect(normaliseHtml(root.container.innerHTML)).toBe('');
		await act(runtime, async () => {
			firstReady = true;
			for (const notify of [...firstListeners]) {
				notify();
				notify();
			}
		});
		expect(normaliseHtml(root.container.innerHTML)).toBe('');
		expect(observed.lifecycle).toEqual([]);
		expect(observed.refs).toEqual([]);
		await act(runtime, async () => {
			secondReady = true;
			for (const notify of [...secondListeners]) {
				notify();
				notify();
			}
		});
		expect(visible(root)).toBe('both ready');
		const committedLifecycle = [...observed.lifecycle];
		const committedRefs = [...observed.refs];
		expect(committedLifecycle.filter((event) => event === 'layout reader:both ready')).toEqual([
			'layout reader:both ready',
		]);
		await act(runtime, async () => {
			for (const notify of [...firstListeners, ...secondListeners]) notify();
		});
		expect(visible(root)).toBe('both ready');
		expect(observed.lifecycle).toEqual(committedLifecycle);
		expect(observed.refs).toEqual(committedRefs);
		expect(observed.onUncaughtError).not.toHaveBeenCalled();
	});

	it('commits normally when a custom thenable settles while its retry is subscribed', async () => {
		let ready = false;
		const resource = {
			then(resolve: () => void) {
				ready = true;
				resolve();
			},
		};
		const observed = callbacks();
		let root!: TimingRoot;
		await act(runtime, async () => {
			root = mount(
				runtime,
				'RootSuspensionScreen',
				{
					promise: fulfilled('unused'),
					read() {
						if (!ready) throw resource;
						return 'synchronous data';
					},
					label: 'synchronous',
					...observed.props,
				},
				observed,
			);
		});
		expect(visible(root)).toBe('synchronous data');
		expect(root.container.querySelector('footer')?.textContent).toBe('synchronous');
		expect(observed.refs).toEqual([root.container.querySelector('[data-value]')]);
		expect(
			observed.lifecycle.filter((event) => event === 'layout reader:synchronous data'),
		).toEqual(['layout reader:synchronous data']);
		expect(observed.onUncaughtError).not.toHaveBeenCalled();
	});

	it.each(['urgent', 'transition'] as const)(
		'uses the latest initial props when an uncommitted %s root is superseded',
		async (priority) => {
			const resource = deferred();
			const onUncaughtError = vi.fn();
			let root!: TimingRoot;
			await act(runtime, async () => {
				root = mount(
					runtime,
					'InitialStateRootSuspension',
					{ promise: resource.promise, label: 'initial', initial: 'older initial' },
					{ onUncaughtError },
					priority === 'transition',
				);
			});
			expect(normaliseHtml(root.container.innerHTML)).toBe('');
			expect(onUncaughtError).not.toHaveBeenCalled();
			await act(runtime, async () => {
				root.update({ promise: resource.promise, label: 'initial', initial: 'latest initial' });
			});
			expect(normaliseHtml(root.container.innerHTML)).toBe('');
			await act(runtime, async () => resource.resolve('ready'));
			expect(visible(root)).toBe('latest initial:ready');
			expect(otherInitialValues(root)).toEqual([
				'latest initial',
				'latest initial',
				'latest initial',
			]);
			expect(onUncaughtError).not.toHaveBeenCalled();
		},
	);

	it('treats a thenable thrown by a layout effect as an error rather than render suspension', async () => {
		const error = Promise.resolve('not a render suspension');
		const observed = callbacks();
		let container: HTMLElement | null = null;
		const callbackStates: Array<{
			html: string | null;
			readerRef: HTMLSpanElement | null | undefined;
			shellRef: HTMLElement | null | undefined;
			layoutCleanups: string[];
		}> = [];
		const onUncaughtError = vi.fn((_reported: unknown) => {
			callbackStates.push({
				html: container === null ? null : normaliseHtml(container.innerHTML),
				readerRef: observed.refs.at(-1),
				shellRef: observed.shellRefs.at(-1),
				layoutCleanups: observed.lifecycle.filter((event) => event.startsWith('layout cleanup ')),
			});
		});
		// Observe the public error callback outside act's own error-reporting boundary.
		const root = mount(
			runtime,
			'RootSuspensionScreen',
			{
				promise: fulfilled('ready'),
				label: 'ready',
				...observed.props,
				onLayout() {
					// Initial mount can report synchronously, before mount() returns the root.
					container = observed.refs.at(-1)?.parentElement?.parentElement ?? null;
					throw error;
				},
			},
			{ onUncaughtError },
		);
		await advance();
		expect(container).toBe(root.container);
		expect(normaliseHtml(root.container.innerHTML)).toBe('');
		expect(onUncaughtError.mock.calls.map((call) => call[0])).toEqual([error]);
		expect(callbackStates).toEqual([
			{
				html: '',
				readerRef: null,
				shellRef: null,
				layoutCleanups: ['layout cleanup shell:ready'],
			},
		]);
		await advance(1000);
		expect(normaliseHtml(root.container.innerHTML)).toBe('');
		expect(onUncaughtError.mock.calls.map((call) => call[0])).toEqual([error]);
	});
});

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
