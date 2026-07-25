import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from 'octane';
import {
	condition,
	idle,
	initializeHydrationEventCapture,
	interaction,
	load,
	media,
	never,
	visible,
	type HydrationPrefetchContext,
} from 'octane/hydration';
import { renderToString } from 'octane/server';
import { flushEffects } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	createHydrationInteractionEvent,
	expectedHydrationReplayMetadata,
	HYDRATION_INTERACTION_CROSS_REALM_CASES,
	HYDRATION_INTERACTION_EVENT_CASES,
	HYDRATION_INTERACTION_EVENT_TYPES,
	observeHydrationReplays,
} from './_hydration-interaction-event-matrix.js';
import * as client from './_fixtures/deferred-hydration-contract.tsrx';
import * as eventReplayClient from './_fixtures/deferred-hydration-event-replay.tsrx';

const FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-contract.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const EVENT_REPLAY_FIXTURE =
	'packages/octane/tests/hydration/_fixtures/deferred-hydration-event-replay.tsrx';
const eventReplayServer = loadServerFixture<typeof eventReplayClient>(EVENT_REPLAY_FIXTURE);

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

describe('deferred hydration contract edges', () => {
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | undefined;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = undefined;
		container.remove();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('installs explicit event capture once when the first boundary mounts', () => {
		const addEventListener = vi.spyOn(document, 'addEventListener');
		try {
			initializeHydrationEventCapture(document);
			expect(
				addEventListener.mock.calls.filter(([eventName]) => eventName === 'auxclick'),
			).toHaveLength(1);

			const when = never();
			container.innerHTML = renderToString(server.EarlyInteractionHydration, { when }).html;
			root = hydrateRoot(container, client.EarlyInteractionHydration, { when });
			initializeHydrationEventCapture(document);

			expect(
				addEventListener.mock.calls.filter(([eventName]) => eventName === 'auxclick'),
			).toHaveLength(1);
		} finally {
			addEventListener.mockRestore();
		}
	});

	it('captures interaction intent in another document realm', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		try {
			const foreignDocument = iframe.contentDocument!;
			const foreignWindow = iframe.contentWindow!;
			expect(foreignWindow.Element).not.toBe(Element);
			foreignDocument.body.innerHTML =
				'<div data-octane-hydrate-id="foreign" data-octane-hydrate-when="interaction"><button id="foreign-intent">Activate</button></div>';
			initializeHydrationEventCapture(foreignDocument);

			const event = new foreignWindow.MouseEvent('click', {
				bubbles: true,
				cancelable: true,
			});
			foreignDocument.getElementById('foreign-intent')!.dispatchEvent(event);

			expect(event.defaultPrevented).toBe(true);
		} finally {
			iframe.remove();
		}
	});

	for (const dynamic of [false, true]) {
		it(`captures and replays ${dynamic ? 'dynamic ' : ''}interaction intent dispatched before hydrateRoot`, () => {
			const when = dynamic
				? () => interaction({ events: 'click' })
				: interaction({ events: 'click' });
			const onClick = vi.fn();
			const onHydrated = vi.fn();
			const { html } = renderToString(server.EarlyInteractionHydration, { when });
			container.innerHTML = html;
			const button = container.querySelector('#early-interaction') as HTMLButtonElement;

			initializeHydrationEventCapture(document);
			button.click();
			expect(onClick).not.toHaveBeenCalled();

			root = hydrateRoot(container, client.EarlyInteractionHydration, {
				when,
				onClick,
				onHydrated,
			});
			flushSync(() => {});
			flushEffects();

			expect(container.querySelector('#early-interaction')).toBe(button);
			expect(onHydrated).toHaveBeenCalledOnce();
			expect(onClick).toHaveBeenCalledOnce();
		});
	}

	it('replays every public interaction event once with its platform shape and queue semantics', () => {
		const when = interaction({ events: HYDRATION_INTERACTION_EVENT_TYPES });
		container.innerHTML = renderToString(eventReplayServer.DeferredHydrationEventReplay, {
			when,
		}).html;
		const parent = container.querySelector('#hydration-replay-parent')!;
		const target = container.querySelector('#hydration-replay-target')!;
		const relatedTarget = container.querySelector('#hydration-replay-related')!;
		const initialHash = location.hash;
		const originalOutcomes: Array<{
			type: string;
			dispatched: boolean;
			defaultPrevented: boolean;
		}> = [];

		initializeHydrationEventCapture(document);
		for (const testCase of HYDRATION_INTERACTION_EVENT_CASES) {
			const event = createHydrationInteractionEvent(document.defaultView!, relatedTarget, testCase);
			originalOutcomes.push({
				type: testCase.type,
				dispatched: target.dispatchEvent(event),
				defaultPrevented: event.defaultPrevented,
			});
		}

		let observation: ReturnType<typeof observeHydrationReplays> | undefined;
		const onHydrated = vi.fn(() => {
			observation = observeHydrationReplays(parent, target);
		});
		root = hydrateRoot(container, eventReplayClient.DeferredHydrationEventReplay, {
			when,
			onHydrated,
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#hydration-replay-target')).toBe(target);
		expect(onHydrated).toHaveBeenCalledOnce();
		expect(originalOutcomes).toEqual(
			HYDRATION_INTERACTION_EVENT_CASES.map((testCase) => ({
				type: testCase.type,
				dispatched: !(testCase.bubbles && testCase.cancelable),
				defaultPrevented: testCase.bubbles && testCase.cancelable,
			})),
		);

		const records = observation!.records;
		const targetRecords = records.filter((record) => record.phase === 'target');
		const parentRecords = records.filter((record) => record.phase === 'parent');
		const bubblingCases = HYDRATION_INTERACTION_EVENT_CASES.filter((testCase) => testCase.bubbles);
		expect(targetRecords.map((record) => record.type)).toEqual(HYDRATION_INTERACTION_EVENT_TYPES);
		expect(parentRecords.map((record) => record.type)).toEqual(
			bubblingCases.map((testCase) => testCase.type),
		);

		for (let i = 0; i < HYDRATION_INTERACTION_EVENT_CASES.length; i++) {
			const testCase = HYDRATION_INTERACTION_EVENT_CASES[i];
			expect(targetRecords[i]).toMatchObject({
				phase: 'target',
				type: testCase.type,
				targetId: 'hydration-replay-target',
				currentTargetId: 'hydration-replay-target',
				targetIsOriginal: true,
				bubbles: testCase.bubbles,
				cancelable: testCase.cancelable,
				composed: testCase.composed,
				defaultPreventedBefore: false,
				defaultPreventedAfter: testCase.type === 'click',
				...expectedHydrationReplayMetadata(testCase),
			});
		}

		for (let i = 0; i < parentRecords.length; i++) {
			const testCase = bubblingCases[i];
			expect(parentRecords[i]).toMatchObject({
				phase: 'parent',
				type: testCase.type,
				targetId: 'hydration-replay-target',
				currentTargetId: 'hydration-replay-parent',
				targetIsOriginal: true,
				bubbles: true,
				cancelable: testCase.cancelable,
				composed: testCase.composed,
				defaultPreventedBefore: testCase.type === 'click',
				defaultPreventedAfter: testCase.type === 'click',
				...expectedHydrationReplayMetadata(testCase),
			});
		}
		expect(location.hash).toBe(initialHash);
		observation!.cleanup();
	});

	it('preserves replay event subclasses from another document realm', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		let observation: ReturnType<typeof observeHydrationReplays> | undefined;
		try {
			const foreignDocument = iframe.contentDocument!;
			const foreignWindow = iframe.contentWindow!;
			const foreignContainer = foreignDocument.createElement('div');
			foreignDocument.body.appendChild(foreignContainer);
			const replayCases = HYDRATION_INTERACTION_EVENT_CASES.filter(
				(testCase) => testCase.type === 'keydown' || testCase.type === 'pointerdown',
			);
			const when = interaction({ events: replayCases.map((testCase) => testCase.type) });
			foreignContainer.innerHTML = renderToString(eventReplayServer.DeferredHydrationEventReplay, {
				when,
			}).html;
			const parent = foreignContainer.querySelector('#hydration-replay-parent')!;
			const target = foreignContainer.querySelector('#hydration-replay-target')!;
			const relatedTarget = foreignContainer.querySelector('#hydration-replay-related')!;

			initializeHydrationEventCapture(foreignDocument);
			for (const testCase of replayCases) {
				target.dispatchEvent(
					createHydrationInteractionEvent(foreignWindow, relatedTarget, testCase),
				);
			}

			root = hydrateRoot(foreignContainer, eventReplayClient.DeferredHydrationEventReplay, {
				when,
				onHydrated() {
					observation = observeHydrationReplays(parent, target);
				},
			});
			flushSync(() => {});
			flushEffects();

			const records = observation!.records.filter((record) => record.phase === 'target');
			expect(records.map((record) => record.type)).toEqual(['keydown', 'pointerdown']);
			for (let i = 0; i < replayCases.length; i++) {
				expect(records[i]).toMatchObject({
					type: replayCases[i].type,
					targetIsOriginal: true,
					...expectedHydrationReplayMetadata(replayCases[i]),
				});
			}
		} finally {
			observation?.cleanup();
			root?.unmount();
			root = undefined;
			iframe.remove();
		}
	});

	it('classifies parent-realm events before replaying them in an iframe realm', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		let observation: ReturnType<typeof observeHydrationReplays> | undefined;
		try {
			const foreignDocument = iframe.contentDocument!;
			const foreignWindow = iframe.contentWindow!;
			const foreignContainer = foreignDocument.createElement('div');
			foreignDocument.body.appendChild(foreignContainer);
			const replayCases = HYDRATION_INTERACTION_CROSS_REALM_CASES;
			const when = interaction({ events: replayCases.map((testCase) => testCase.type) });
			foreignContainer.innerHTML = renderToString(eventReplayServer.DeferredHydrationEventReplay, {
				when,
			}).html;
			const parent = foreignContainer.querySelector('#hydration-replay-parent')!;
			const target = foreignContainer.querySelector('#hydration-replay-target')!;
			const relatedTarget = foreignContainer.querySelector('#hydration-replay-related')!;

			initializeHydrationEventCapture(foreignDocument);
			for (const testCase of replayCases) {
				target.dispatchEvent(
					createHydrationInteractionEvent(document.defaultView!, relatedTarget, testCase),
				);
			}

			const targetRealmMatches: boolean[] = [];
			root = hydrateRoot(foreignContainer, eventReplayClient.DeferredHydrationEventReplay, {
				when,
				onHydrated() {
					for (const testCase of replayCases) {
						target.addEventListener(
							testCase.type,
							(event) => {
								switch (testCase.family) {
									case 'focus':
										targetRealmMatches.push(event instanceof foreignWindow.FocusEvent);
										break;
									case 'keyboard':
										targetRealmMatches.push(event instanceof foreignWindow.KeyboardEvent);
										break;
									case 'mouse':
										targetRealmMatches.push(event instanceof foreignWindow.MouseEvent);
										break;
									case 'pointer':
										targetRealmMatches.push(event instanceof foreignWindow.PointerEvent);
										break;
								}
							},
							{ once: true },
						);
					}
					observation = observeHydrationReplays(parent, target);
				},
			});
			flushSync(() => {});
			flushEffects();

			const records = observation!.records.filter((record) => record.phase === 'target');
			expect(records.map((record) => record.type)).toEqual([
				'focusin',
				'keydown',
				'mousedown',
				'pointerdown',
			]);
			expect(targetRealmMatches).toEqual([true, true, true, true]);
			for (let i = 0; i < replayCases.length; i++) {
				expect(records[i]).toMatchObject({
					type: replayCases[i].type,
					targetIsOriginal: true,
					...expectedHydrationReplayMetadata(replayCases[i]),
				});
			}
		} finally {
			observation?.cleanup();
			root?.unmount();
			root = undefined;
			iframe.remove();
		}
	});

	// The replay clone is built from the TARGET's constructors, never the incoming
	// event's, so the same realm crossing must hold in the opposite direction: an
	// embedded widget can dispatch an event of its own realm into its host document.
	it('classifies iframe-realm events before replaying them at a host-document target', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		let observation: ReturnType<typeof observeHydrationReplays> | undefined;
		try {
			const foreignWindow = iframe.contentWindow!;
			expect(foreignWindow.MouseEvent).not.toBe(MouseEvent);
			const replayCases = HYDRATION_INTERACTION_CROSS_REALM_CASES;
			const when = interaction({ events: replayCases.map((testCase) => testCase.type) });
			container.innerHTML = renderToString(eventReplayServer.DeferredHydrationEventReplay, {
				when,
			}).html;
			const parent = container.querySelector('#hydration-replay-parent')!;
			const target = container.querySelector('#hydration-replay-target')!;
			const relatedTarget = container.querySelector('#hydration-replay-related')!;

			initializeHydrationEventCapture(document);
			for (const testCase of replayCases) {
				target.dispatchEvent(
					createHydrationInteractionEvent(foreignWindow, relatedTarget, testCase),
				);
			}

			const targetRealmMatches: boolean[] = [];
			root = hydrateRoot(container, eventReplayClient.DeferredHydrationEventReplay, {
				when,
				onHydrated() {
					for (const testCase of replayCases) {
						target.addEventListener(
							testCase.type,
							(event) => {
								switch (testCase.family) {
									case 'focus':
										targetRealmMatches.push(event instanceof FocusEvent);
										break;
									case 'keyboard':
										targetRealmMatches.push(event instanceof KeyboardEvent);
										break;
									case 'mouse':
										targetRealmMatches.push(event instanceof MouseEvent);
										break;
									case 'pointer':
										targetRealmMatches.push(event instanceof PointerEvent);
										break;
								}
							},
							{ once: true },
						);
					}
					observation = observeHydrationReplays(parent, target);
				},
			});
			flushSync(() => {});
			flushEffects();

			const records = observation!.records.filter((record) => record.phase === 'target');
			expect(records.map((record) => record.type)).toEqual([
				'focusin',
				'keydown',
				'mousedown',
				'pointerdown',
			]);
			expect(targetRealmMatches).toEqual([true, true, true, true]);
			for (let i = 0; i < replayCases.length; i++) {
				expect(records[i]).toMatchObject({
					type: replayCases[i].type,
					targetIsOriginal: true,
					...expectedHydrationReplayMetadata(replayCases[i]),
				});
			}
		} finally {
			observation?.cleanup();
			root?.unmount();
			root = undefined;
			iframe.remove();
		}
	});

	it('keeps function-form visibility dormant after hydrateRoot interaction setup', async () => {
		let intersect!: IntersectionObserverCallback;
		const observe = vi.fn();
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(callback: IntersectionObserverCallback) {
					intersect = callback;
				}
				observe = observe;
				unobserve = vi.fn();
				disconnect = vi.fn();
			},
		);
		const when = () => visible();
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		container.innerHTML = renderToString(server.EarlyInteractionHydration, { when }).html;
		const button = container.querySelector('#early-interaction') as HTMLButtonElement;

		root = hydrateRoot(container, client.EarlyInteractionHydration, {
			when,
			onClick,
			onHydrated,
		});
		await act(() => {});
		const wrapper = button.parentElement!;
		expect(observe).toHaveBeenCalledWith(wrapper);
		expect(container.querySelector('#early-interaction')).toBe(button);
		expect(onHydrated).not.toHaveBeenCalled();
		expect(onClick).not.toHaveBeenCalled();

		await act(() => button.click());
		expect(container.querySelector('#early-interaction')).toBe(button);
		expect(onHydrated).not.toHaveBeenCalled();
		expect(onClick).not.toHaveBeenCalled();

		await act(() =>
			intersect(
				[{ isIntersecting: true, target: wrapper } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			),
		);
		expect(container.querySelector('#early-interaction')).toBe(button);
		expect(onHydrated).toHaveBeenCalledOnce();

		await act(() => button.click());
		expect(onClick).toHaveBeenCalledOnce();
	});

	it('uses a current direct never strategy instead of the previously rendered condition', async () => {
		const initialWhen = condition(false);
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		container.innerHTML = renderToString(server.EarlyInteractionHydration, {
			when: initialWhen,
		}).html;
		const button = container.querySelector('#early-interaction') as HTMLButtonElement;

		root = hydrateRoot(container, client.EarlyInteractionHydration, {
			when: initialWhen,
			onClick,
			onHydrated,
		});
		await act(() => {});

		await act(() =>
			root!.render(client.EarlyInteractionHydration, {
				when: never(),
				onClick,
				onHydrated,
			}),
		);

		expect(container.querySelector('#early-interaction')).toBe(button);
		expect(onHydrated).not.toHaveBeenCalled();
		await act(() => button.click());
		expect(onClick).not.toHaveBeenCalled();
	});

	it('tears down an installed strategy when a direct prop updates to never', async () => {
		vi.useFakeTimers();
		let prefetchReason: string | undefined;
		const prefetch = vi.fn(async ({ waitFor }: HydrationPrefetchContext) => {
			prefetchReason = await waitFor(idle({ timeout: 100_000 }));
		});
		const initialWhen = idle({ timeout: 25 });
		const onHydrated = vi.fn();
		const props = { when: initialWhen, prefetch, onHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;

		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		flushSync(() => {});
		flushEffects();
		expect(prefetch).toHaveBeenCalledOnce();
		expect(onHydrated).not.toHaveBeenCalled();

		flushSync(() =>
			root!.render(client.ProceduralPrefetchHydration, {
				...props,
				when: never(),
			}),
		);
		flushEffects();
		await act(() => vi.advanceTimersByTime(25));

		expect(onHydrated).not.toHaveBeenCalled();
		expect(prefetchReason).toBeUndefined();

		root.unmount();
		root = undefined;
		flushEffects();
		await Promise.resolve();
		expect(prefetchReason).toBe('abort');
	});

	it('uses a current direct load strategy instead of the previously rendered never', async () => {
		const initialWhen = never();
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		container.innerHTML = renderToString(server.EarlyInteractionHydration, {
			when: initialWhen,
		}).html;
		const button = container.querySelector('#early-interaction') as HTMLButtonElement;

		root = hydrateRoot(container, client.EarlyInteractionHydration, {
			when: initialWhen,
			onClick,
			onHydrated,
		});
		await act(() => {});
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() =>
			root!.render(client.EarlyInteractionHydration, {
				when: load(),
				onClick,
				onHydrated,
			}),
		);

		expect(container.querySelector('#early-interaction')).toBe(button);
		expect(onHydrated).toHaveBeenCalledOnce();
		await act(() => button.click());
		expect(onClick).toHaveBeenCalledOnce();
	});

	it('cancels an in-flight activation on never and can activate again later', async () => {
		const preparation = deferred<void>();
		const prefetch = vi.fn(() => preparation.promise);
		const onHydrated = vi.fn();
		const props = { when: load(), prefetch, onHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		const button = container.querySelector('#procedural-prefetch');

		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		expect(prefetch).toHaveBeenCalledOnce();
		expect(onHydrated).not.toHaveBeenCalled();

		flushSync(() =>
			root!.render(client.ProceduralPrefetchHydration, {
				...props,
				when: never(),
			}),
		);
		await act(() => preparation.resolve());

		expect(container.querySelector('#procedural-prefetch')).toBe(button);
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() =>
			root!.render(client.ProceduralPrefetchHydration, {
				...props,
				when: load(),
			}),
		);

		expect(container.querySelector('#procedural-prefetch')).toBe(button);
		expect(prefetch).toHaveBeenCalledOnce();
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('reports hydrate when procedural waitFor subscribes after load requested activation', async () => {
		let reason: string | undefined;
		const onHydrated = vi.fn();
		const prefetch = vi.fn(async ({ waitFor }: HydrationPrefetchContext) => {
			reason = await waitFor(visible());
		});
		const props = { when: load(), prefetch, onHydrated };
		const { html } = renderToString(server.ProceduralPrefetchHydration, props);
		container.innerHTML = html;

		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		await act(() => {});

		expect(prefetch).toHaveBeenCalledOnce();
		expect(reason).toBe('hydrate');
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('blocks load hydration on awaited procedural work but not fire-and-forget work', async () => {
		const required = deferred<void>();
		const onRequiredHydrated = vi.fn();
		const requiredProps = {
			when: load(),
			prefetch: async () => required.promise,
			onHydrated: onRequiredHydrated,
		};
		let html = renderToString(server.ProceduralPrefetchHydration, requiredProps).html;
		container.innerHTML = html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, requiredProps);
		flushSync(() => {});
		flushEffects();
		expect(onRequiredHydrated).not.toHaveBeenCalled();

		await act(() => required.resolve());
		expect(onRequiredHydrated).toHaveBeenCalledOnce();
		root.unmount();
		root = undefined;

		const optional = deferred<void>();
		const onOptionalHydrated = vi.fn();
		const optionalProps = {
			when: load(),
			prefetch: () => {
				void optional.promise;
			},
			onHydrated: onOptionalHydrated,
		};
		html = renderToString(server.ProceduralPrefetchHydration, optionalProps).html;
		container.innerHTML = html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, optionalProps);
		flushSync(() => {});
		flushEffects();

		expect(onOptionalHydrated).toHaveBeenCalledOnce();
	});

	it('reports prefetch and abort outcomes from procedural waitFor', async () => {
		let reason: string | undefined;
		const prefetch = async ({ waitFor }: HydrationPrefetchContext) => {
			reason = await waitFor(load());
		};
		const props = { when: condition(false), prefetch };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		await act(() => {});
		expect(reason).toBe('prefetch');

		root.unmount();
		root = undefined;
		reason = undefined;
		const abortingPrefetch = async ({ waitFor }: HydrationPrefetchContext) => {
			reason = await waitFor(idle({ timeout: 100_000 }));
		};
		const abortProps = { when: condition(false), prefetch: abortingPrefetch };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, abortProps).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, abortProps);
		flushSync(() => {});
		flushEffects();
		root.unmount();
		root = undefined;
		flushEffects();
		await Promise.resolve();

		expect(reason).toBe('abort');
	});

	it('hydrates from idle, visibility, and media-query strategies', async () => {
		vi.useFakeTimers();
		const onIdleHydrated = vi.fn();
		let props = { when: idle({ timeout: 25 }), onHydrated: onIdleHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		flushSync(() => {});
		flushEffects();
		expect(onIdleHydrated).not.toHaveBeenCalled();
		await act(() => vi.advanceTimersByTime(25));
		expect(onIdleHydrated).toHaveBeenCalledOnce();
		root.unmount();
		root = undefined;
		vi.useRealTimers();

		let intersect!: IntersectionObserverCallback;
		const observe = vi.fn();
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(callback: IntersectionObserverCallback) {
					intersect = callback;
				}
				observe = observe;
				unobserve = vi.fn();
				disconnect = vi.fn();
			},
		);
		const onVisibleHydrated = vi.fn();
		props = { when: visible({ rootMargin: '321px' }), onHydrated: onVisibleHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		flushSync(() => {});
		flushEffects();
		const visibleWrapper = container.querySelector('#procedural-prefetch')!.parentElement!;
		expect(observe).toHaveBeenCalledWith(visibleWrapper);
		await act(() =>
			intersect(
				[{ isIntersecting: true, target: visibleWrapper } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			),
		);
		expect(onVisibleHydrated).toHaveBeenCalledOnce();
		root.unmount();
		root = undefined;

		let mediaListener!: () => void;
		const mediaQuery = {
			matches: false,
			addEventListener: vi.fn((_name: string, listener: () => void) => {
				mediaListener = listener;
			}),
			removeEventListener: vi.fn(),
		};
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => mediaQuery),
		);
		const onMediaHydrated = vi.fn();
		props = { when: media('(min-width: 800px)'), onHydrated: onMediaHydrated };
		container.innerHTML = renderToString(server.ProceduralPrefetchHydration, props).html;
		root = hydrateRoot(container, client.ProceduralPrefetchHydration, props);
		flushSync(() => {});
		flushEffects();
		expect(onMediaHydrated).not.toHaveBeenCalled();
		mediaQuery.matches = true;
		await act(() => mediaListener());
		expect(onMediaHydrated).toHaveBeenCalledOnce();
	});

	it('keeps initial server content instead of showing authored fallback when activation suspends', async () => {
		const pending = deferred<void>();
		const onHydrated = vi.fn();
		const blocked = condition(false);
		const serverProps = {
			when: blocked,
			suspend: false,
			promise: pending.promise,
			onHydrated,
			shellLabel: 'Initial shell',
		};
		const { html } = renderToString(server.ActivationSuspendingHydration, serverProps);
		container.innerHTML = html;
		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');

		root = hydrateRoot(container, client.ActivationSuspendingHydration, {
			...serverProps,
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		root.render(client.ActivationSuspendingHydration, {
			...serverProps,
			when: condition(true),
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');
		expect(container.querySelector('#activation-fallback')).toBeNull();
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() => pending.resolve());

		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');
		expect(container.querySelector('#activation-fallback')).toBeNull();
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('cancels a suspended activation on never and can activate again later', async () => {
		const stale = deferred<void>();
		const fresh = deferred<void>();
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
		const blocked = condition(false);
		const ready = condition(true);
		const serverProps = {
			when: blocked,
			suspend: false,
			promise: stale.promise,
			onClick,
			onHydrated,
			shellLabel: 'Initial shell',
		};
		container.innerHTML = renderToString(server.ActivationSuspendingHydration, serverProps).html;

		root = hydrateRoot(container, client.ActivationSuspendingHydration, {
			...serverProps,
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		root.render(client.ActivationSuspendingHydration, {
			...serverProps,
			when: ready,
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		const pendingContent = container.querySelector('#activation-content') as HTMLButtonElement;
		pendingContent.focus();
		expect(document.activeElement).toBe(pendingContent);
		expect(container.querySelector('#activation-fallback')).toBeNull();
		expect(onHydrated).not.toHaveBeenCalled();

		root.render(client.ActivationSuspendingHydration, {
			...serverProps,
			when: never(),
			suspend: true,
			shellLabel: 'Never shell',
		});
		flushSync(() => {});
		flushEffects();

		await act(() => stale.resolve());

		expect(container.querySelector('#activation-shell')?.textContent).toBe('Never shell');
		expect(container.querySelector('#activation-content')).toBe(pendingContent);
		expect(document.activeElement).toBe(pendingContent);
		expect(container.querySelector('#activation-fallback')).toBeNull();
		expect(onHydrated).not.toHaveBeenCalled();
		await act(() => pendingContent.click());
		expect(onClick).not.toHaveBeenCalled();

		await act(() =>
			root!.render(client.ActivationSuspendingHydration, {
				...serverProps,
				when: ready,
				suspend: true,
				promise: fresh.promise,
				shellLabel: 'Reactivated shell',
			}),
		);

		expect(container.querySelector('#activation-shell')?.textContent).toBe('Reactivated shell');
		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');
		expect(container.querySelector('#activation-fallback')).toBeNull();
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() => fresh.resolve());

		expect(container.querySelector('#activation-fallback')).toBeNull();
		expect(onHydrated).toHaveBeenCalledOnce();
		const activeContent = container.querySelector('#activation-content') as HTMLButtonElement;
		await act(() => activeContent.click());
		expect(onClick).toHaveBeenCalledOnce();
		expect(onHydrated).toHaveBeenCalledOnce();
		const hydrationMismatches = diagnostic.mock.calls
			.map((call) => String(call[0]))
			.filter((message) => message.includes('hydration mismatch'));
		diagnostic.mockRestore();
		expect(hydrationMismatches).toEqual([]);
	});

	it('preserves pending server content across a parent update during activation', async () => {
		const pending = deferred<void>();
		const onHydrated = vi.fn();
		const blocked = condition(false);
		const ready = condition(true);
		const serverProps = {
			when: blocked,
			suspend: false,
			promise: pending.promise,
			onHydrated,
			shellLabel: 'Initial shell',
		};
		container.innerHTML = renderToString(server.ActivationSuspendingHydration, serverProps).html;
		root = hydrateRoot(container, client.ActivationSuspendingHydration, {
			...serverProps,
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		root.render(client.ActivationSuspendingHydration, {
			...serverProps,
			when: ready,
			suspend: true,
		});
		flushSync(() => {});
		flushEffects();

		const pendingContent = container.querySelector('#activation-content') as HTMLButtonElement;
		pendingContent.focus();
		expect(document.activeElement).toBe(pendingContent);

		root.render(client.ActivationSuspendingHydration, {
			...serverProps,
			when: ready,
			suspend: true,
			shellLabel: 'Updated shell',
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#activation-shell')?.textContent).toBe('Updated shell');
		expect(container.querySelector('#activation-content')).toBe(pendingContent);
		expect(document.activeElement).toBe(pendingContent);
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() => pending.resolve());

		expect(container.querySelector('#activation-content')?.textContent).toBe('Server reviews');
		expect(onHydrated).toHaveBeenCalledOnce();
	});
});
