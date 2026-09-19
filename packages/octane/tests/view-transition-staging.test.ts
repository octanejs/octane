import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScope } from '../src/signals/index.js';
import * as SignalRuntime from '../src/signals/index.js';
import {
	act,
	Activity,
	createElement,
	createRoot,
	hydrateRoot,
	flushSync,
	startTransition,
	type Root,
} from '../src/index.js';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './conformance/_helpers/view-transition-mocks';
import {
	StagingLifecycleApp,
	StagingRollbackApp,
	StagingReentrantApp,
	LayoutReadinessApp,
	StagingDelegationApp,
	StagingPortalApp,
} from './_fixtures/view-transition-matching.tsrx';
import {
	StagingHydratedBinding,
	StagingSignalControls,
} from './_fixtures/view-transition-signal-controls.tsrx';
import { condition } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('ViewTransition staged commits', () => {
	let mocks: ViewTransitionMocks;
	let root: Root;
	let container: HTMLDivElement;
	const recoverable: unknown[] = [];
	const handles: Array<{
		update: () => void | Promise<void>;
		ready: ReturnType<typeof deferred>;
		finished: ReturnType<typeof deferred>;
	}> = [];
	beforeEach(() => {
		mocks = installViewTransitionMocks();
		if (customElements.get('vt-stage-hook') === undefined) {
			customElements.define(
				'vt-stage-hook',
				class extends HTMLElement {
					static observedAttributes = ['data-value'];
					attributeChangedCallback(_name: string, _previous: string | null, value: string) {
						(this as any).onStageAttribute?.(value);
					}
				},
			);
		}
		container = document.createElement('div');
		document.body.append(container);
		recoverable.length = 0;
		root = createRoot(container, {
			onRecoverableError: (error) => {
				recoverable.push(error);
			},
		});
		handles.length = 0;
		(document as any).startViewTransition = (input: { update: () => void | Promise<void> }) => {
			const ready = deferred();
			const finished = deferred();
			handles.push({ update: input.update, ready, finished });
			return { ready: ready.promise, finished: finished.promise, skipTransition() {} };
		};
	});
	afterEach(async () => {
		flushSync(() => root.unmount());
		for (const handle of handles) {
			handle.ready.resolve();
			handle.finished.resolve();
		}
		await Promise.resolve();
		container.remove();
		mocks.restore();
	});

	it('animates repeated updates with callback-only native implementations', async () => {
		let optionsAttempts = 0;
		let captures = 0;
		(document as any).startViewTransition = (
			input: (() => void | Promise<void>) | { update: () => void | Promise<void> },
		) => {
			if (typeof input !== 'function') {
				optionsAttempts++;
				throw new TypeError('Expected an update callback');
			}
			captures++;
			const ready = Promise.resolve().then(input);
			return { ready, finished: ready, skipTransition() {} };
		};
		const events: string[] = [];
		const clicks: string[] = [];
		await act(() =>
			root.render(StagingLifecycleApp, { value: 'before', children: false, events, clicks }),
		);
		for (const value of ['first', 'second']) {
			await act(() =>
				startTransition(() =>
					root.render(StagingLifecycleApp, { value, children: false, events, clicks }),
				),
			);
			expect(container.textContent).toBe(value);
			expect(events).toContain('layout:' + value);
		}
		expect(captures).toBe(2);
		// The native overload probe is work, not a failed capture on each update.
		expect(optionsAttempts).toBe(1);
		expect(recoverable).toEqual([]);
	});

	it('reports unexpected synchronous native failures and publishes the commit once', async () => {
		const error = new Error('Native capture failed');
		(document as any).startViewTransition = () => {
			throw error;
		};
		const events: string[] = [];
		const clicks: string[] = [];
		await act(() =>
			root.render(StagingLifecycleApp, { value: 'before', children: false, events, clicks }),
		);
		events.length = 0;
		await act(() =>
			startTransition(() =>
				root.render(StagingLifecycleApp, { value: 'after', children: false, events, clicks }),
			),
		);
		expect(container.textContent).toBe('after');
		expect(events.filter((event) => event === 'layout:after')).toEqual(['layout:after']);
		expect(recoverable).toEqual([error]);
	});

	it('keeps DOM, event handlers and commit callbacks unchanged until the native update', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		await act(() =>
			root.render(StagingLifecycleApp, { value: 'before', events, clicks, children: true }),
		);
		const button = container.querySelector('button')!;
		events.length = 0;
		startTransition(() =>
			root.render(StagingLifecycleApp, { value: 'after', events, clicks, children: false }),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		expect(container.textContent).toBe('beforefirstsecond');
		expect(events).toEqual([]);
		button.click();
		expect(clicks).toEqual(['before']);
		await handles[0].update();
		expect(container.querySelector('button')).toBe(button);
		expect(container.textContent).toBe('after');
		button.click();
		expect(clicks).toEqual(['before', 'after']);
		expect(events).toContain('remove-insertion:first:true');
		expect(events).toContain('remove-layout:first:true');
		expect(events).toContain('remove-insertion:second:true');
		expect(events).toContain('remove-layout:second:true');
		expect(events).toContain('attach:after');
		expect(events).toContain('layout:after');
		expect(events.some((event) => event.startsWith('unsubscribe:'))).toBe(false);
		handles[0].ready.resolve();
		handles[0].finished.resolve();
		await vi.waitFor(() => expect(events).toContain('unsubscribe:second'));
		await act(() => root.unmount());
		for (const name of ['first', 'second']) {
			expect(events.filter((event) => event.startsWith('remove-insertion:' + name + ':'))).toEqual([
				'remove-insertion:' + name + ':true',
			]);
			expect(events.filter((event) => event.startsWith('remove-layout:' + name + ':'))).toEqual([
				'remove-layout:' + name + ':true',
			]);
			expect(events.filter((event) => event === 'unsubscribe:' + name)).toHaveLength(1);
		}
		for (const value of ['before', 'after']) {
			expect(events.filter((event) => event === 'destroy-insertion:' + value)).toHaveLength(1);
			expect(events.filter((event) => event === 'destroy-layout:' + value)).toHaveLength(1);
		}

		for (const replacement of ['handle', 'scalar']) {
			root = createRoot(container);
			const scope = createScope({ scopeKey: `staged-control-${replacement}` });
			const before$ = scope.signal$('before', 'before');
			const after$ = scope.signal$('after', 'after');
			const cleanups: string[] = [];
			try {
				await act(() =>
					root.render(StagingSignalControls, {
						phase: 'before',
						draft$: before$,
						inputProps$: { value: before$ },
						cleanups,
					}),
				);
				const inputs = [...container.querySelectorAll('input')];
				const presentation = container.querySelector('[data-presentation]')!;
				const bindingText = presentation.querySelector('[data-binding-text]')!;
				const bindingValue = presentation.querySelector('[data-binding-value]')!;
				const firstOwner = container.querySelector<HTMLButtonElement>('[data-owner="first"]')!;
				const secondOwner = container.querySelector<HTMLButtonElement>('[data-owner="second"]')!;
				await act(() => {
					firstOwner.click();
					firstOwner.click();
					secondOwner.click();
				});
				expect([firstOwner.textContent, secondOwner.textContent]).toEqual(['2', '1']);
				const capture = handles.length;
				startTransition(() =>
					root.render(StagingSignalControls, {
						phase: 'after',
						draft$: replacement === 'handle' ? after$ : 'sample',
						inputProps$: { value: replacement === 'handle' ? after$ : 'sample' },
						cleanups,
					}),
				);
				await vi.waitFor(() => expect(handles).toHaveLength(capture + 1));
				expect(container.querySelector('span')!.textContent).toBe('before');
				expect(bindingText.textContent).toBe('before text');
				expect(bindingValue.textContent).toBe('before');
				expect(presentation.querySelector('[data-binding-arm]')!.localName).toBe('i');
				expect(cleanups).toEqual([]);
				for (const input of inputs) {
					input.value = `before update ${input.dataset.control}`;
					input.dispatchEvent(new Event('input', { bubbles: true }));
					expect(container.querySelector('span')!.textContent).toBe('before');
					expect(bindingText.textContent).toBe('before text');
					expect(bindingValue.textContent).toBe('before');
					expect(cleanups).toEqual([]);
					expect(before$.get()).toBe(input.value);
					expect(after$.get()).toBe('after');
				}
				const lastEdit = before$.get();
				await handles[capture].update();
				expect([...container.querySelectorAll('input')]).toEqual(inputs);
				expect(container.querySelector('span')!.textContent).toBe('after');
				expect(container.querySelector('[data-presentation]')).toBe(presentation);
				expect(presentation.querySelector('[data-binding-text]')).toBe(bindingText);
				expect(presentation.querySelector('[data-binding-value]')).toBe(bindingValue);
				expect(bindingText.textContent).toBe('after text');
				expect(bindingValue.textContent).toBe('after');
				expect(presentation.querySelector('[data-binding-arm]')!.localName).toBe('b');
				expect(presentation.querySelector('[data-binding-arm]')!.textContent).toBe('aftertail');
				expect(cleanups).toEqual(['first:2', 'second:1']);
				for (const input of inputs) {
					input.value = `after update ${input.dataset.control}`;
					input.dispatchEvent(new Event('input', { bubbles: true }));
					expect(before$.get()).toBe(lastEdit);
					expect(after$.get()).toBe(replacement === 'handle' ? input.value : 'after');
				}
				handles[capture].ready.resolve();
				handles[capture].finished.resolve();
				await act(() => root.unmount());
				expect(cleanups).toEqual(['first:2', 'second:1']);
			} finally {
				root.unmount();
				scope.dispose();
			}
		}

		// Use the canonical component with split={false}: a compiler-split import
		// completes as legitimate urgent work and interrupts a held transition.
		// With no such interruption, activation must preserve visible SSR until
		// the browser opens this transition's mutation phase.
		const server = loadServerFixture<
			typeof import('./_fixtures/view-transition-signal-controls.tsrx')
		>('packages/octane/tests/_fixtures/view-transition-signal-controls.tsrx', {
			compileOptions: {},
			runtimeModules: { 'octane/signals': SignalRuntime },
		});
		const when = condition(false);
		container.innerHTML = renderToString(server.StagingHydratedBinding, {
			phase: 'before',
			when,
		}).html;
		const preserved = container.querySelector('[data-presentation]')!;
		const preservedText = preserved.querySelector('[data-binding-text]')!;
		await act(() => {
			root = hydrateRoot(container, StagingHydratedBinding, {
				phase: 'before',
				when,
			});
		});
		const hydrationCapture = handles.length;
		startTransition(() =>
			root.render(StagingHydratedBinding, {
				phase: 'after',
				when: condition(true),
			}),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(hydrationCapture + 1));
		expect(container.querySelector('[data-presentation]')).toBe(preserved);
		expect(preservedText.textContent).toBe('before text');
		expect(preserved.querySelector('[data-binding-arm]')!.localName).toBe('i');
		await handles[hydrationCapture].update();
		expect(container.querySelector('[data-presentation]')).toBe(preserved);
		expect(preserved.querySelector('[data-binding-text]')).toBe(preservedText);
		expect(preservedText.textContent).toBe('after text');
		expect(preserved.querySelector('[data-binding-value]')!.textContent).toBe('after');
		expect(preserved.querySelector('[data-binding-arm]')!.textContent).toBe('aftertail');
		handles[hydrationCapture].ready.resolve();
		handles[hydrationCapture].finished.resolve();
		await act(() => root.unmount());
	});

	it('cleans up ordinary deletions and a later unmount after a completed transition', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		await act(() =>
			root.render(StagingLifecycleApp, { value: 'before', events, clicks, children: true }),
		);
		startTransition(() =>
			root.render(StagingLifecycleApp, { value: 'after', events, clicks, children: true }),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		await handles[0].update();
		handles[0].ready.resolve();
		handles[0].finished.resolve();
		await act(() => {});
		expect(container.textContent).toBe('afterfirstsecond');
		expect(
			events.some((event) => event.startsWith('remove-') || event.startsWith('unsubscribe:')),
		).toBe(false);

		events.length = 0;
		await act(() =>
			root.render(StagingLifecycleApp, { value: 'after', events, clicks, children: false }),
		);
		expect(container.textContent).toBe('after');
		for (const name of ['first', 'second']) {
			expect(events.filter((event) => event.startsWith('remove-insertion:' + name + ':'))).toEqual([
				'remove-insertion:' + name + ':true',
			]);
			expect(events.filter((event) => event.startsWith('remove-layout:' + name + ':'))).toEqual([
				'remove-layout:' + name + ':true',
			]);
			expect(events.filter((event) => event === 'unsubscribe:' + name)).toHaveLength(1);
		}
		await act(() =>
			root.render(StagingLifecycleApp, { value: 'final', events, clicks, children: true }),
		);
		await act(() => root.unmount());
		expect(container.childNodes).toHaveLength(0);
		for (const name of ['first', 'second']) {
			expect(events.filter((event) => event.startsWith('remove-insertion:' + name + ':'))).toEqual([
				'remove-insertion:' + name + ':true',
				'remove-insertion:' + name + ':true',
			]);
			expect(events.filter((event) => event.startsWith('remove-layout:' + name + ':'))).toEqual([
				'remove-layout:' + name + ':true',
				'remove-layout:' + name + ':true',
			]);
			expect(events.filter((event) => event === 'unsubscribe:' + name)).toHaveLength(2);
		}
		for (const value of ['after', 'final']) {
			expect(events.filter((event) => event === 'destroy-insertion:' + value)).toHaveLength(1);
			expect(events.filter((event) => event === 'destroy-layout:' + value)).toHaveLength(1);
		}
		expect(events.some((event) => event.endsWith(':before'))).toBe(false);
		expect(recoverable).toEqual([]);
	});

	it('disconnects Activity effects at the native update and reconnects them for later ordinary work', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		const render = (mode: 'visible' | 'hidden') =>
			root.render(
				createElement(
					Activity,
					{ mode },
					createElement(StagingLifecycleApp, { value: 'current', events, clicks, children: true }),
				),
			);
		await act(() => render('visible'));
		const section = container.querySelector('section')!;
		const first = container.querySelector('[data-child="first"]')!;
		events.length = 0;
		startTransition(() => render('hidden'));
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		expect(events).toEqual([]);
		expect(section.style.display).toBe('');
		await handles[0].update();
		expect(section.style.display).toBe('none');
		expect(first.isConnected).toBe(true);
		for (const name of ['first', 'second']) {
			expect(events.filter((event) => event.startsWith('remove-layout:' + name + ':'))).toEqual([
				'remove-layout:' + name + ':true',
			]);
			expect(events.filter((event) => event === 'unsubscribe:' + name)).toHaveLength(1);
		}
		expect(events.some((event) => event.startsWith('remove-insertion:'))).toBe(false);
		expect(events).not.toContain('destroy-insertion:current');
		const hiddenEvents = events.slice();
		handles[0].ready.resolve();
		handles[0].finished.resolve();
		await act(() => {});
		expect(events).toEqual(hiddenEvents);
		events.length = 0;
		await act(() => render('visible'));
		expect(container.querySelector('[data-child="first"]')).toBe(first);
		expect(section.style.display).toBe('');
		for (const name of ['first', 'second']) {
			expect(events.filter((event) => event === 'layout:' + name)).toHaveLength(1);
			expect(events.filter((event) => event === 'subscribe:' + name)).toHaveLength(1);
			expect(events).not.toContain('insert:' + name);
		}

		events.length = 0;
		await act(() => render('hidden'));
		expect(section.style.display).toBe('none');
		await act(() => root.unmount());
		expect(container.childNodes).toHaveLength(0);
		for (const name of ['first', 'second']) {
			expect(events.filter((event) => event.startsWith('remove-layout:' + name + ':'))).toEqual([
				'remove-layout:' + name + ':true',
			]);
			expect(events.filter((event) => event === 'unsubscribe:' + name)).toHaveLength(1);
			expect(
				events.filter((event) => event.startsWith('remove-insertion:' + name + ':')),
			).toHaveLength(1);
		}
		expect(events.filter((event) => event === 'destroy-insertion:current')).toHaveLength(1);
		expect(events.filter((event) => event === 'destroy-layout:current')).toHaveLength(1);
		expect(recoverable).toEqual([]);
	});

	it('keeps newly registered input events working after a suspended attempt is retried', async () => {
		const inputs: string[] = [];
		let resume!: () => void;
		const pending = new Promise<void>((resolve) => {
			resume = resolve;
		});
		const state = { pending: pending as Promise<void> | null };
		await act(() => root.render(StagingDelegationApp, { show: false, state, inputs }));
		startTransition(() => root.render(StagingDelegationApp, { show: true, state, inputs }));
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		await handles[0].update();
		handles[0].ready.resolve();
		handles[0].finished.resolve();
		expect(container.querySelector('input')).toBeNull();
		state.pending = null;
		resume();
		await vi.waitFor(() =>
			expect(container.querySelector('input') !== null || handles.length === 2).toBe(true),
		);
		if (handles[1] !== undefined) {
			await handles[1].update();
			handles[1].ready.resolve();
			handles[1].finished.resolve();
		}
		const input = container.querySelector('input')!;
		expect(input.value).toBe('controlled');
		input.value = 'draft';
		await act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
		expect(inputs).toEqual(['draft']);
		expect(input.value).toBe('controlled');
	});

	it('keeps a root created during a suspended preparation registered for events', async () => {
		const target = document.createElement('div');
		document.body.append(target);
		let externalRoot: Root | undefined;
		const onPrepare = () => {
			externalRoot ??= createRoot(target);
		};
		const pending = deferred();
		const state = { pending: pending.promise as Promise<void> | null };
		const inputs: string[] = [];
		try {
			await act(() => root.render(StagingDelegationApp, { show: false, state, inputs, onPrepare }));
			startTransition(() =>
				root.render(StagingDelegationApp, { show: true, state, inputs, onPrepare }),
			);
			await vi.waitFor(() => expect(handles).toHaveLength(1));
			expect(externalRoot).toBeDefined();
			await handles[0].update();
			handles[0].ready.resolve();
			handles[0].finished.resolve();
			state.pending = null;
			pending.resolve();
			await vi.waitFor(() =>
				expect(container.querySelector('input') !== null || handles.length === 2).toBe(true),
			);
			if (handles[1] !== undefined) {
				await handles[1].update();
				handles[1].ready.resolve();
				handles[1].finished.resolve();
			}
			const clicks: string[] = [];
			await act(() =>
				externalRoot!.render(
					createElement('button', { children: 'External', onClick: () => clicks.push('external') }),
				),
			);
			await act(() => target.querySelector('button')!.click());
			expect(clicks).toEqual(['external']);
		} finally {
			flushSync(() => externalRoot?.unmount());
			target.remove();
		}
	});

	it('retains a portal target’s committed event handlers until staged deletion publishes', async () => {
		const target = document.createElement('div');
		document.body.append(target);
		const clicks: string[] = [];
		try {
			await act(() => root.render(StagingPortalApp, { show: true, target, clicks }));
			const button = target.querySelector('button')!;
			expect(target.innerHTML, container.innerHTML).toContain('Portal');
			startTransition(() => root.render(StagingPortalApp, { show: false, target, clicks }));
			await vi.waitFor(() => expect(handles).toHaveLength(1));
			expect(button.isConnected).toBe(true);
			button.click();
			expect(clicks).toEqual(['portal']);
			await handles[0].update();
			expect(button.isConnected).toBe(false);
			expect(target.textContent).toBe('');
			handles[0].ready.resolve();
			handles[0].finished.resolve();
		} finally {
			target.remove();
		}
	});

	it('publishes a prepared branch switch despite another same-component root render', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		await act(() =>
			root.render(StagingLifecycleApp, { value: 'before', children: true, events, clicks }),
		);
		const button = container.querySelector('button');
		const next = { value: 'after', children: false, events, clicks };
		startTransition(() => root.render(StagingLifecycleApp, next));
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		startTransition(() => root.render(StagingLifecycleApp, next));
		expect(container.textContent).toBe('beforefirstsecond');
		await handles[0].update();
		expect(container.textContent).toBe('after');
		handles[0].ready.resolve();
		handles[0].finished.resolve();
		await vi.waitFor(() => expect(handles).toHaveLength(2));
		await handles[1].update();
		handles[1].ready.resolve();
		handles[1].finished.resolve();
		expect(container.textContent).toBe('after');
		expect(container.querySelector('button')).toBe(button);
	});

	it.each(['candidate', 'newest'])(
		'preserves a prepared root commit when another same-component render arrives (%s)',
		async (next) => {
			await act(() => root.render(StagingReentrantApp, { value: 'before', tail: 'old-tail' }));
			const tail = container.querySelector('[data-staged-tail]')!;
			startTransition(() =>
				root.render(StagingReentrantApp, { value: 'candidate', tail: 'candidate-tail' }),
			);
			await vi.waitFor(() => expect(handles).toHaveLength(1));
			startTransition(() =>
				root.render(StagingReentrantApp, { value: next, tail: next + '-tail' }),
			);
			expect(tail.textContent).toBe('old-tail');
			await handles[0].update();
			expect(tail.textContent).toBe('candidate-tail');
			handles[0].ready.resolve();
			handles[0].finished.resolve();
			await vi.waitFor(() => expect(handles).toHaveLength(2));
			await handles[1].update();
			handles[1].ready.resolve();
			handles[1].finished.resolve();
			expect(container.querySelector('[data-staged-tail]')).toBe(tail);
			expect(tail.textContent).toBe(next + '-tail');
		},
	);

	it('fulfils every retired cleanup once if the first deletion unmounts the root', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		const onDelete = (name: string) => {
			if (name === 'first') root.unmount();
		};
		await act(() =>
			root.render(StagingLifecycleApp, {
				value: 'before',
				events,
				clicks,
				children: true,
				onDelete,
			}),
		);
		events.length = 0;
		startTransition(() =>
			root.render(StagingLifecycleApp, {
				value: 'after',
				events,
				clicks,
				children: false,
				onDelete,
			}),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		expect(events).toEqual([]);
		await handles[0].update();
		handles[0].ready.resolve();
		handles[0].finished.resolve();
		await vi.waitFor(() => expect(events).toContain('unsubscribe:second'));
		expect(container.childNodes).toHaveLength(0);
		expect(events.filter((event) => event.startsWith('remove-insertion:first:'))).toHaveLength(1);
		expect(events.filter((event) => event.startsWith('remove-layout:first:'))).toHaveLength(1);
		expect(events.filter((event) => event.startsWith('remove-insertion:second:'))).toHaveLength(1);
		expect(events.filter((event) => event.startsWith('remove-layout:second:'))).toHaveLength(1);
		expect(events.filter((event) => event === 'unsubscribe:first')).toHaveLength(1);
		expect(events.filter((event) => event === 'unsubscribe:second')).toHaveLength(1);
		expect(events).not.toContain('attach:after');
		expect(events).not.toContain('insertion:after');
		expect(events).not.toContain('layout:after');
	});

	it('tolerates deletion cleanup removing its own host before staged removal', async () => {
		const events: string[] = [];
		const clicks: string[] = [];
		const onDelete = (name: string) => {
			if (name === 'first') container.querySelector('[data-child="first"]')!.remove();
		};
		(document as any).startViewTransition = (input: { update: () => void | Promise<void> }) => {
			const ready = Promise.resolve().then(input.update);
			return { ready, finished: ready, skipTransition() {} };
		};
		await act(() =>
			root.render(StagingLifecycleApp, {
				value: 'before',
				events,
				clicks,
				children: true,
				onDelete,
			}),
		);
		events.length = 0;
		await act(() =>
			startTransition(() =>
				root.render(StagingLifecycleApp, {
					value: 'after',
					events,
					clicks,
					children: false,
					onDelete,
				}),
			),
		);
		expect(recoverable).toEqual([]);
		expect(container.textContent).toBe('after');
		expect(events.filter((event) => event.startsWith('remove-insertion:first:'))).toHaveLength(1);
		expect(events.filter((event) => event.startsWith('remove-insertion:second:'))).toHaveLength(1);
		expect(events).toContain('layout:after');
	});

	it('omits abandoned forward and rollback writes from the native mutation commit', async () => {
		await act(() => root.render(StagingRollbackApp, { value: 'before', pending: null }));
		const target = container.querySelector('[data-rollback]')!;
		const records: MutationRecord[] = [];
		const observer = new MutationObserver((next) => records.push(...next));
		observer.observe(target, {
			attributes: true,
			attributeFilter: ['title'],
			attributeOldValue: true,
			characterData: true,
			subtree: true,
		});
		try {
			startTransition(() =>
				root.render(StagingRollbackApp, { value: 'abandoned', pending: new Promise(() => {}) }),
			);
			await vi.waitFor(() => expect(handles).toHaveLength(1));
			expect(target.textContent).toBe('before');
			expect(target.getAttribute('title')).toBe('before');
			await handles[0].update();
			handles[0].ready.resolve();
			handles[0].finished.resolve();
			await Promise.resolve();
			expect(records).toEqual([]);
			expect(container.querySelector('[data-rollback]')).toBe(target);
			expect(target.textContent).toBe('before');
			expect(target.getAttribute('title')).toBe('before');
		} finally {
			observer.disconnect();
		}
	});

	it('finishes the accepted host plan before a reentrant same-root props refresh', async () => {
		await act(() => root.render(StagingReentrantApp, { value: 'before', tail: 'old-tail' }));
		const hook = container.querySelector('vt-stage-hook')! as HTMLElement & {
			onStageAttribute?: (value: string) => void;
		};
		const tail = container.querySelector('[data-staged-tail]')!;
		let tailDuringCallback = '';
		hook.onStageAttribute = (value) => {
			if (value !== 'candidate') return;
			hook.onStageAttribute = undefined;
			tailDuringCallback = tail.textContent!;
			root.render(StagingReentrantApp, { value: 'newest', tail: 'candidate-tail' });
		};
		startTransition(() =>
			root.render(StagingReentrantApp, { value: 'candidate', tail: 'candidate-tail' }),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		await handles[0].update();
		expect(tailDuringCallback).toBe('old-tail');
		expect(container.querySelector('[data-staged-tail]')).toBe(tail);
		expect(tail.textContent).toBe('candidate-tail');
		expect(hook.getAttribute('data-value')).toBe('newest');
		handles[0].ready.resolve();
		handles[0].finished.resolve();
	});

	it('accepts a root replacement from a native mutation callback before snapshot readiness', async () => {
		await act(() => root.render(StagingReentrantApp, { value: 'before', tail: 'old-tail' }));
		const events: string[] = [];
		const hook = container.querySelector('vt-stage-hook')! as HTMLElement & {
			onStageAttribute?: (value: string) => void;
		};
		hook.onStageAttribute = (value) => {
			if (value !== 'candidate') return;
			hook.onStageAttribute = undefined;
			root.render(LayoutReadinessApp, { text: 'replacement', events, requestFont() {} });
		};
		startTransition(() =>
			root.render(StagingReentrantApp, { value: 'candidate', tail: 'candidate-tail' }),
		);
		await vi.waitFor(() => expect(handles).toHaveLength(1));
		const update = handles[0].update();
		const outputAtSnapshot = container.textContent;
		const effectsAtSnapshot = events.slice();
		await update;
		expect(outputAtSnapshot).toBe('replacement');
		expect(effectsAtSnapshot).toEqual([
			'insertion:replacement',
			'attach:replacement',
			'layout:replacement',
		]);
		handles[0].ready.resolve();
		handles[0].finished.resolve();
	});

	it.each([false, true])(
		'holds mutation-owned work for fonts and permits later urgent interruption (%s)',
		async (urgent) => {
			const fontReady = deferred();
			const fonts = { status: 'loaded', ready: fontReady.promise };
			const previousFonts = Object.getOwnPropertyDescriptor(document, 'fonts');
			Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
			const events: string[] = [];
			let externalUpdate!: (value: string) => void;
			const common = {
				events,
				requestFont() {
					fonts.status = 'loading';
				},
				expose(update: (value: string) => void) {
					externalUpdate = update;
				},
			};
			try {
				await act(() =>
					root.render(StagingReentrantApp, { ...common, value: 'before', tail: 'old-tail' }),
				);
				events.length = 0;
				const hook = container.querySelector('vt-stage-hook')! as HTMLElement & {
					onStageAttribute?: (value: string) => void;
				};
				hook.onStageAttribute = (value) => {
					if (value !== 'candidate') return;
					hook.onStageAttribute = undefined;
					root.render(StagingReentrantApp, { ...common, value: 'newest', tail: 'candidate-tail' });
				};
				startTransition(() =>
					root.render(StagingReentrantApp, {
						...common,
						value: 'candidate',
						tail: 'candidate-tail',
					}),
				);
				await vi.waitFor(() => expect(handles).toHaveLength(1));
				const updated = handles[0].update();
				await new Promise<void>((resolve) => setTimeout(resolve, 0));
				expect(fonts.status).toBe('loading');
				expect(events).toEqual([]);
				if (urgent) {
					externalUpdate('urgent-tail');
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
					expect(container.textContent).toBe('urgent-tail');
					expect(events.at(-1)).toBe('layout:urgent-tail');
				}
				fonts.status = 'loaded';
				fontReady.resolve();
				await updated;
				if (!urgent) {
					expect(container.textContent).toBe('candidate-tail');
					expect(hook.getAttribute('data-value')).toBe('newest');
					expect(events.at(-1)).toBe('layout:newest');
				}
				handles[0].ready.resolve();
				handles[0].finished.resolve();
			} finally {
				fontReady.resolve();
				if (previousFonts === undefined) delete (document as any).fonts;
				else Object.defineProperty(document, 'fonts', previousFonts);
			}
		},
	);
});
