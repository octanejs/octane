import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, hydrateRoot } from 'octane';
import {
	HYDRATE_ID_ATTR,
	HYDRATE_ID_COUNT_ATTR,
	HYDRATE_SEED_ATTR,
	HYDRATE_WHEN_ATTR,
} from 'octane/constants';
import { condition, idle, interaction, load, never } from 'octane/hydration';
import type { HydrationStrategy } from 'octane/hydration';
import { renderToStaticMarkup, renderToString } from 'octane/server';
import { prerender } from 'octane/static';
import { flushEffects } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as splitClient from './_fixtures/deferred-hydration-split.tsrx';
import * as styledClient from './_fixtures/deferred-hydration-styles.tsrx';
import * as client from './_fixtures/deferred-hydration.tsrx';

const FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);
const SPLIT_FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-split.tsrx';
const splitServer = loadServerFixture<typeof splitClient>(SPLIT_FIXTURE);
const STYLED_FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-styles.tsrx';
const styledServer = loadServerFixture<typeof styledClient>(STYLED_FIXTURE);

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

describe('deferred hydration', () => {
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
	});

	it('keeps the boundary wrapper but omits hydration protocol from static markup', () => {
		const { html } = renderToStaticMarkup(server.DeferredHydration, {
			when: condition(false),
		});
		container.innerHTML = html;
		const reviews = container.querySelector('#reviews') as HTMLElement;
		const wrapper = reviews.parentElement!;

		expect(wrapper.localName).toBe('div');
		expect(wrapper.querySelector('#reviews')).toBe(reviews);
		expect(wrapper.hasAttribute(HYDRATE_ID_ATTR)).toBe(false);
		expect(wrapper.hasAttribute(HYDRATE_WHEN_ATTR)).toBe(false);
		expect(wrapper.hasAttribute(HYDRATE_ID_COUNT_ATTR)).toBe(false);
		expect(wrapper.querySelector(`[${HYDRATE_SEED_ATTR}]`)).toBeNull();
		expect(document.createTreeWalker(wrapper, NodeFilter.SHOW_COMMENT).nextNode()).toBeNull();
	});

	it('serializes dynamic and custom interaction strategies without running browser logic', () => {
		const readWhen = vi.fn(() => interaction({ events: 'click' }));
		const dynamic = renderToString(server.DeferredHydration, { when: readWhen });
		expect(readWhen).not.toHaveBeenCalled();
		container.innerHTML = dynamic.html;
		let wrapper = container.querySelector('#reviews')!.parentElement!;
		expect(wrapper.getAttribute(HYDRATE_WHEN_ATTR)).toBe('dynamic');

		const direct = renderToString(server.DeferredHydration, {
			when: interaction({ events: ['keydown', 'click'] }),
		});
		container.innerHTML = direct.html;
		wrapper = container.querySelector('#reviews')!.parentElement!;
		expect(wrapper.getAttribute(HYDRATE_WHEN_ATTR)).toBe('interaction');
		expect([...wrapper.attributes].some((attribute) => attribute.value === 'keydown click')).toBe(
			true,
		);
	});

	it('keeps server content inert until its condition resolves, then adopts it', () => {
		const onRender = vi.fn();
		const onEffect = vi.fn();
		const onRef = vi.fn();
		const onDeferredClick = vi.fn();
		const onEagerClick = vi.fn();
		const onHydrated = vi.fn();
		const blocked = condition(false);
		const props = {
			when: blocked,
			onRender,
			onEffect,
			onRef,
			onDeferredClick,
			onEagerClick,
			onHydrated,
		};

		const { html } = renderToString(server.DeferredHydration, {
			...props,
			onRender: undefined,
		});
		expect(html).toContain('id="reviews"');
		expect(html).toContain('id="review-draft"');
		expect(html).toContain('id="eager-action"');
		expect(html).not.toContain('deferred-fallback');
		container.innerHTML = html;

		const reviews = container.querySelector('#reviews') as HTMLElement;
		const input = container.querySelector('#review-draft') as HTMLInputElement;
		const deferredButton = container.querySelector('#review-action') as HTMLButtonElement;
		const eagerButton = container.querySelector('#eager-action') as HTMLButtonElement;
		const deferredId = reviews.dataset.runtimeId;
		const eagerId = eagerButton.dataset.runtimeId;
		input.value = 'typed before hydration';

		root = hydrateRoot(container, client.DeferredHydration, props);
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#reviews')).toBe(reviews);
		expect(container.querySelector('#review-draft')).toBe(input);
		expect(container.querySelector('#review-action')).toBe(deferredButton);
		expect(container.querySelector('#eager-action')).toBe(eagerButton);
		expect(input.value).toBe('typed before hydration');
		expect(onRender).not.toHaveBeenCalled();
		expect(onEffect).not.toHaveBeenCalled();
		expect(onRef).not.toHaveBeenCalled();
		expect(onHydrated).not.toHaveBeenCalled();
		expect(container.querySelector('#deferred-fallback')).toBeNull();

		flushSync(() => deferredButton.click());
		expect(onDeferredClick).not.toHaveBeenCalled();
		flushSync(() => eagerButton.click());
		expect(onEagerClick).toHaveBeenCalledOnce();
		expect(onEagerClick).toHaveBeenCalledWith(eagerId);

		root.render(client.DeferredHydration, { ...props, when: condition(true) });
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#reviews')).toBe(reviews);
		expect(container.querySelector('#review-draft')).toBe(input);
		expect(container.querySelector('#review-action')).toBe(deferredButton);
		expect(input.value).toBe('typed before hydration');
		expect(onRender).toHaveBeenCalledOnce();
		expect(onEffect).toHaveBeenCalledOnce();
		expect(onEffect).toHaveBeenCalledWith('mount');
		expect(onRef).toHaveBeenCalledOnce();
		expect(onRef).toHaveBeenCalledWith(deferredButton);
		expect(onHydrated).toHaveBeenCalledOnce();

		flushSync(() => deferredButton.click());
		expect(onDeferredClick).toHaveBeenCalledOnce();
		expect(onDeferredClick).toHaveBeenCalledWith(deferredId);

		root.render(client.DeferredHydration, { ...props, when: condition(true) });
		flushSync(() => {});
		flushEffects();
		expect(onEffect).toHaveBeenCalledOnce();
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('aborts eager procedural prefetch when unmounted before passive setup', async () => {
		const outcome = deferred<{ aborted: boolean; reason: string }>();
		let signal: AbortSignal | undefined;
		const prefetch = vi.fn(async (context) => {
			signal = context.signal;
			// Resume after the synchronous unmount so a late waitFor subscription
			// observes the terminal lifecycle outcome as well as the AbortSignal.
			await Promise.resolve();
			const reason = await context.waitFor(idle({ timeout: 100_000 }));
			outcome.resolve({ aborted: context.signal.aborted, reason });
		});
		const props = { when: load(), prefetch };
		container.innerHTML = renderToString(server.DeferredHydration, props).html;

		root = hydrateRoot(container, client.DeferredHydration, props);
		expect(prefetch).toHaveBeenCalledOnce();
		expect(signal?.aborted).toBe(false);

		root.unmount();
		root = undefined;

		expect(signal?.aborted).toBe(true);
		await expect(outcome.promise).resolves.toEqual({ aborted: true, reason: 'abort' });
	});

	it('adopts a split child whose component graph shares eager module state', async () => {
		const onEffect = vi.fn();
		const onActivatedEffect = vi.fn();
		const onDeferredClick = vi.fn();
		const onActivatedClick = vi.fn();
		const onLatestClick = vi.fn();
		const onEagerClick = vi.fn();
		const onHydrated = vi.fn();
		const blocked = condition(false);
		const props = {
			label: 'reviews',
			when: blocked,
			prefetch: load(),
			onEffect,
			onDeferredClick,
			onEagerClick,
			onHydrated,
		};
		const { html } = renderToString(splitServer.SplitHydration, props);
		expect(html).toContain('captured:reviews');
		container.innerHTML = html;
		const deferredButton = container.querySelector('#split-review-action') as HTMLButtonElement;
		const eagerButton = container.querySelector('#split-eager-action') as HTMLButtonElement;
		const eagerPrefix = container.querySelector('#split-eager-prefix');

		root = hydrateRoot(container, splitClient.SplitHydration, props);
		await act(() => {});
		expect(container.querySelector('#split-review-action')).toBe(deferredButton);
		expect(container.querySelector('#split-eager-prefix')).toBe(eagerPrefix);
		expect(eagerPrefix?.textContent).toBe('captured:');
		expect(onEffect).not.toHaveBeenCalled();
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() => deferredButton.click());
		expect(onDeferredClick).not.toHaveBeenCalled();
		await act(() => eagerButton.click());
		expect(onEagerClick).toHaveBeenCalledOnce();

		const activatedProps = {
			...props,
			when: condition(true),
			onEffect: onActivatedEffect,
			onDeferredClick: onActivatedClick,
		};
		await act(() => {
			root!.render(splitClient.SplitHydration, activatedProps);
		});
		await vi.waitFor(async () => {
			// The queried child resolves through Vite's asynchronous module graph;
			// drain the hydration commit once that real module request completes.
			await act(() => {});
			expect(onHydrated).toHaveBeenCalledOnce();
		});

		expect(container.querySelector('#split-review-action')).toBe(deferredButton);
		expect(container.querySelector('#split-eager-prefix')).toBe(eagerPrefix);
		expect(deferredButton.dataset.capturedLabel).toBe('captured:reviews');
		expect(deferredButton.textContent).toBe('captured:reviews');
		expect(onEffect).not.toHaveBeenCalled();
		expect(onActivatedEffect).toHaveBeenCalledOnce();
		expect(onActivatedEffect).toHaveBeenCalledWith('captured:reviews');
		expect(onHydrated).toHaveBeenCalledOnce();

		await act(() => deferredButton.click());
		expect(onDeferredClick).not.toHaveBeenCalled();
		expect(onActivatedClick).toHaveBeenCalledOnce();
		expect(onActivatedClick).toHaveBeenCalledWith('captured:reviews');

		await act(() => {
			root!.render(splitClient.SplitHydration, {
				...activatedProps,
				label: 'latest',
				onDeferredClick: onLatestClick,
			});
		});
		expect(container.querySelector('#split-review-action')).toBe(deferredButton);
		expect(deferredButton.dataset.capturedLabel).toBe('captured:latest');
		expect(deferredButton.textContent).toBe('captured:latest');

		await act(() => deferredButton.click());
		expect(onActivatedClick).toHaveBeenCalledOnce();
		expect(onLatestClick).toHaveBeenCalledOnce();
		expect(onLatestClick).toHaveBeenCalledWith('captured:latest');
	});

	it('adopts server DOM when a scoped <style> follows a split boundary', async () => {
		// The extraction rewrite (client) and the fallback strip (server) shift a
		// trailing <style> tag by different amounts. Scope hashes are derived
		// from source positions, so without authored-coordinate restamping the
		// two compiles disagree on the scope class and hydration rebuilds the
		// whole section instead of adopting it.
		const onHydrated = vi.fn();
		const props = { when: load(), onHydrated };
		const { html } = renderToString(styledServer.StyledSplitHydration, props);
		container.innerHTML = html;
		const serverHost = container.querySelector('#styled-split-host') as HTMLElement;
		const serverNote = container.querySelector('.styled-split-note') as HTMLElement;
		const serverHostClass = serverHost.className;
		const serverNoteClass = serverNote.className;
		expect(serverHostClass).toMatch(/\btsrx-[0-9a-z]+\b/);

		root = hydrateRoot(container, styledClient.StyledSplitHydration, props);
		await vi.waitFor(async () => {
			await act(() => {});
			expect(onHydrated).toHaveBeenCalledOnce();
		});

		// Adoption, not mismatch recovery: the server nodes survive with their
		// server-rendered scope classes, and the split child is live.
		expect(container.querySelector('#styled-split-host')).toBe(serverHost);
		expect(container.querySelector('.styled-split-note')).toBe(serverNote);
		expect(serverHost.className).toBe(serverHostClass);
		expect(serverNote.className).toBe(serverNoteClass);
		expect(container.querySelector('#styled-split-review')).not.toBeNull();
	});

	it('finishes eager hydration when a never split boundary is the last child', async () => {
		const onEagerEffect = vi.fn();
		const onEagerClick = vi.fn();
		const props = { when: never(), onEagerEffect, onEagerClick };
		const { html } = renderToString(splitServer.LastSplitHydration, props);
		container.innerHTML = html;
		const eagerButton = container.querySelector('#last-split-eager');
		const deferredReview = container.querySelector('#last-split-review');

		root = hydrateRoot(container, splitClient.LastSplitHydration, props);
		await act(() => {});

		expect(container.querySelector('#last-split-eager')).toBe(eagerButton);
		expect(container.querySelector('#last-split-review')).toBe(deferredReview);
		expect(container.querySelector('#last-split-host')?.getAttribute('data-ready')).toBe('yes');
		expect(onEagerEffect).toHaveBeenCalledOnce();
		await act(() => (eagerButton as HTMLButtonElement).click());
		expect(onEagerClick).toHaveBeenCalledOnce();
	});

	it('uses fallback only for a later client-only mount that suspends', async () => {
		const value = deferred<string>();
		const replacement = deferred<string>();
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const when = never();
		const props = {
			show: false,
			when,
			promise: value.promise,
			onClick,
			onHydrated,
		};

		root = createRoot(container);
		await act(() => root!.render(client.ClientOnlyHydrate, props));
		const host = container.querySelector('#client-only-host');
		expect(container.querySelector('#client-only-fallback')).toBeNull();

		await act(() => root!.render(client.ClientOnlyHydrate, { ...props, show: true }));
		const fallback = container.querySelector('#client-only-fallback');
		expect(container.querySelector('#client-only-host')).toBe(host);
		expect(fallback?.textContent).toBe('Loading client content');
		expect(container.querySelector('#client-only-content')).toBeNull();
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() =>
			root!.render(client.ClientOnlyHydrate, {
				...props,
				show: true,
				promise: replacement.promise,
			}),
		);
		await act(() => value.resolve('Stale client value'));
		expect(container.querySelector('#client-only-content')).toBeNull();
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() => replacement.resolve('Client ready'));

		const content = container.querySelector('#client-only-content') as HTMLButtonElement;
		expect(container.querySelector('#client-only-fallback')).toBeNull();
		expect(content.textContent).toBe('Client ready');
		expect(onHydrated).toHaveBeenCalledOnce();

		await act(() => content.click());
		expect(onClick).toHaveBeenCalledOnce();
		expect(onClick).toHaveBeenCalledWith('Client ready');

		await act(() =>
			root!.render(client.ClientOnlyHydrate, {
				...props,
				show: true,
				promise: replacement.promise,
			}),
		);
		expect(container.querySelector('#client-only-content')).toBe(content);
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	it('uses fallback while loading a default-split boundary first mounted on the client', async () => {
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const props = { show: false, when: never(), onClick, onHydrated };
		root = createRoot(container);
		flushSync(() => root!.render(splitClient.ClientOnlySplitHydration, props));
		const host = container.querySelector('#split-client-only-host');

		flushSync(() =>
			root!.render(splitClient.ClientOnlySplitHydration, {
				...props,
				show: true,
			}),
		);
		expect(container.querySelector('#split-client-only-host')).toBe(host);
		expect(container.querySelector('#split-client-only-fallback')?.textContent).toBe(
			'Loading split content',
		);
		expect(container.querySelector('#split-client-only-content')).toBeNull();

		await vi.waitFor(async () => {
			await act(() => {});
			expect(container.querySelector('#split-client-only-content')).not.toBeNull();
		});
		const content = container.querySelector('#split-client-only-content') as HTMLButtonElement;
		expect(container.querySelector('#split-client-only-fallback')).toBeNull();
		expect(onHydrated).toHaveBeenCalledOnce();

		await act(() => content.click());
		expect(onClick).toHaveBeenCalledOnce();
	});

	it('hydrates repeated instances of one split boundary with instance-local captures', async () => {
		const blocked = condition(false);
		const onClick = vi.fn();
		const onHydrated = vi.fn();
		const items = [
			{ id: 'first', label: 'First review' },
			{ id: 'second', label: 'Second review' },
		];
		const props = { items, when: blocked, onClick, onHydrated };
		const { html } = renderToString(splitServer.RepeatedSplitHydration, props);
		container.innerHTML = html;
		const serverButtons = Array.from(
			container.querySelectorAll('.repeated-split-action'),
		) as HTMLButtonElement[];

		root = hydrateRoot(container, splitClient.RepeatedSplitHydration, props);
		await act(() => {});
		expect(onHydrated).not.toHaveBeenCalled();

		await act(() =>
			root!.render(splitClient.RepeatedSplitHydration, {
				...props,
				when: condition(true),
			}),
		);
		await vi.waitFor(async () => {
			await act(() => {});
			expect(onHydrated).toHaveBeenCalledTimes(2);
		});

		const hydratedButtons = Array.from(
			container.querySelectorAll('.repeated-split-action'),
		) as HTMLButtonElement[];
		expect(hydratedButtons).toEqual(serverButtons);
		expect(hydratedButtons.map((button) => button.dataset.itemId)).toEqual(['first', 'second']);
		expect(hydratedButtons.map((button) => button.textContent)).toEqual([
			'First review',
			'Second review',
		]);

		await act(() => {
			hydratedButtons[0].click();
			hydratedButtons[1].click();
		});
		expect(onClick.mock.calls).toEqual([['first'], ['second']]);
	});

	for (const [label, when] of [
		['load()', load()],
		['condition(true)', condition(true)],
	] as const) {
		it(`activates ${label} after initial hydration without a parent render`, async () => {
			const onRender = vi.fn();
			const onEffect = vi.fn();
			const onRef = vi.fn();
			const onDeferredClick = vi.fn();
			const onHydrated = vi.fn();
			const { html } = renderToString(server.DeferredHydration, { when });
			container.innerHTML = html;
			const reviews = container.querySelector('#reviews') as HTMLElement;
			const button = container.querySelector('#review-action') as HTMLButtonElement;
			const id = reviews.dataset.runtimeId;

			root = hydrateRoot(container, client.DeferredHydration, {
				when,
				onRender,
				onEffect,
				onRef,
				onDeferredClick,
				onHydrated,
			});
			expect(container.querySelector('#reviews')).toBe(reviews);

			await act(() => {});

			expect(container.querySelector('#reviews')).toBe(reviews);
			expect(container.querySelector('#review-action')).toBe(button);
			expect(onRender).toHaveBeenCalledOnce();
			expect(onEffect).toHaveBeenCalledOnce();
			expect(onEffect).toHaveBeenCalledWith('mount');
			expect(onRef).toHaveBeenCalledOnce();
			expect(onRef).toHaveBeenCalledWith(button);
			expect(onHydrated).toHaveBeenCalledOnce();

			await act(() => button.click());
			expect(onDeferredClick).toHaveBeenCalledOnce();
			expect(onDeferredClick).toHaveBeenCalledWith(id);
		});
	}

	it('keeps deferred use() seeds and useId positions isolated from eager siblings', async () => {
		const onDeferredClick = vi.fn();
		const onEagerClick = vi.fn();
		const blocked = condition(false);
		const serverProps = {
			when: blocked,
			deferredPromise: Promise.resolve('server deferred'),
			eagerPromise: Promise.resolve('server eager'),
			onDeferredClick,
			onEagerClick,
		};
		const { html } = await prerender(server.DeferredSeedHydration, serverProps);
		expect(html).toContain('server deferred');
		expect(html).toContain('server eager');
		container.innerHTML = html;

		const before = container.querySelector('#seed-before') as HTMLElement;
		const deferredButton = container.querySelector('#deferred-seed') as HTMLButtonElement;
		const eagerButton = container.querySelector('#eager-seed') as HTMLButtonElement;
		const beforeId = before.dataset.runtimeId;
		const deferredId = deferredButton.dataset.runtimeId;
		const eagerId = eagerButton.dataset.runtimeId;
		const clientProps = {
			...serverProps,
			deferredPromise: Promise.resolve('client deferred'),
			eagerPromise: Promise.resolve('client eager'),
		};

		root = hydrateRoot(container, client.DeferredSeedHydration, clientProps);
		await act(() => {});

		expect(container.querySelector('#seed-before')).toBe(before);
		expect(container.querySelector('#deferred-seed')).toBe(deferredButton);
		expect(container.querySelector('#eager-seed')).toBe(eagerButton);
		expect(deferredButton.textContent).toBe('server deferred');
		expect(eagerButton.textContent).toBe('server eager');

		await act(() => eagerButton.click());
		expect(onEagerClick).toHaveBeenCalledOnce();
		expect(onEagerClick).toHaveBeenCalledWith('server eager', eagerId, beforeId);
		expect(onDeferredClick).not.toHaveBeenCalled();

		await act(() =>
			root!.render(client.DeferredSeedHydration, {
				...clientProps,
				when: condition(true),
			}),
		);
		expect(container.querySelector('#deferred-seed')).toBe(deferredButton);
		expect(container.querySelector('#eager-seed')).toBe(eagerButton);

		await act(() => deferredButton.click());
		expect(onDeferredClick).toHaveBeenCalledOnce();
		expect(onDeferredClick).toHaveBeenCalledWith('server deferred', deferredId);
	});

	it('hydrates nested interaction boundaries parent-first and replays one click', async () => {
		const order: string[] = [];
		const onTargetClick = vi.fn(() => order.push('target click'));
		const onOuterHydrated = vi.fn(() => order.push('outer hydrated'));
		const onInnerHydrated = vi.fn(() => order.push('inner hydrated'));
		const props = {
			outerWhen: interaction({ events: 'click' }),
			innerWhen: interaction({ events: 'click' }),
			onTargetClick,
			onOuterHydrated,
			onInnerHydrated,
		};
		const { html } = renderToString(server.NestedInteractionHydration, props);
		container.innerHTML = html;
		const target = container.querySelector('#interaction-target') as HTMLButtonElement;

		root = hydrateRoot(container, client.NestedInteractionHydration, props);
		await act(() => {});
		expect(container.querySelector('#interaction-target')).toBe(target);
		expect(order).toEqual([]);

		await act(() => target.click());

		expect(container.querySelector('#interaction-target')).toBe(target);
		expect(onOuterHydrated).toHaveBeenCalledOnce();
		expect(onInnerHydrated).toHaveBeenCalledOnce();
		expect(onTargetClick).toHaveBeenCalledOnce();
		expect(order).toEqual(['outer hydrated', 'inner hydrated', 'target click']);
	});

	it('runs setup and cleanup for a custom interaction strategy', async () => {
		const setup = vi.fn();
		const cleanup = vi.fn();
		const onRender = vi.fn();
		const onHydrated = vi.fn();
		const when: HydrationStrategy<'interaction'> = {
			_t: 'interaction',
			_s: ({ element, gate }) => {
				setup(element);
				const activate = () => gate?.resolve();
				element?.addEventListener('dblclick', activate);
				return () => {
					cleanup();
					element?.removeEventListener('dblclick', activate);
				};
			},
		};
		const props = { when, onRender, onHydrated };
		const { html } = renderToString(server.DeferredHydration, {
			...props,
			onRender: undefined,
		});
		container.innerHTML = html;
		const reviews = container.querySelector('#reviews') as HTMLElement;

		root = hydrateRoot(container, client.DeferredHydration, props);
		await act(() => {});

		expect(setup).toHaveBeenCalledOnce();
		expect(setup).toHaveBeenCalledWith(reviews.parentElement);
		expect(cleanup).not.toHaveBeenCalled();
		expect(onRender).not.toHaveBeenCalled();

		await act(() =>
			reviews.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })),
		);

		expect(onRender).toHaveBeenCalledOnce();
		expect(onHydrated).toHaveBeenCalledOnce();
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it('captures a dynamic custom interaction before boundary effects install', async () => {
		const onRender = vi.fn();
		const onHydrated = vi.fn();
		const when = () => interaction({ events: 'dblclick' });
		const props = { when, onRender, onHydrated };
		const { html } = renderToString(server.DeferredHydration, {
			...props,
			onRender: undefined,
		});
		container.innerHTML = html;
		const reviews = container.querySelector('#reviews') as HTMLElement;

		root = hydrateRoot(container, client.DeferredHydration, props);
		reviews.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));

		await act(() => {});
		expect(container.querySelector('#reviews')).toBe(reviews);
		expect(onRender).toHaveBeenCalledOnce();
		expect(onHydrated).toHaveBeenCalledOnce();
	});

	for (const dynamic of [false, true]) {
		it(`delegates a nested ${dynamic ? 'dynamic ' : ''}interaction intent through a dormant condition ancestor`, async () => {
			const order: string[] = [];
			const onTargetClick = vi.fn(() => order.push('target click'));
			const onOuterHydrated = vi.fn(() => order.push('outer hydrated'));
			const onInnerHydrated = vi.fn(() => order.push('inner hydrated'));
			const innerWhen = dynamic
				? () => interaction({ events: 'click' })
				: interaction({ events: 'click' });
			const props = {
				outerWhen: condition(false),
				innerWhen,
				onTargetClick,
				onOuterHydrated,
				onInnerHydrated,
			};
			const { html } = renderToString(server.NestedInteractionHydration, props);
			container.innerHTML = html;
			const target = container.querySelector('#interaction-target') as HTMLButtonElement;

			root = hydrateRoot(container, client.NestedInteractionHydration, props);
			await act(() => {});
			expect(container.querySelector('#interaction-target')).toBe(target);
			expect(order).toEqual([]);

			await act(() => target.click());

			expect(container.querySelector('#interaction-target')).toBe(target);
			expect(onOuterHydrated).toHaveBeenCalledOnce();
			expect(onInnerHydrated).toHaveBeenCalledOnce();
			expect(onTargetClick).toHaveBeenCalledOnce();
			expect(order).toEqual(['outer hydrated', 'inner hydrated', 'target click']);
		});
	}

	for (const returnsNever of [false, true]) {
		it(`treats a dynamic child resolving to ${returnsNever ? 'never() as terminal' : 'condition(false) as an intent target'}`, async () => {
			const order: string[] = [];
			const onTargetClick = vi.fn(() => order.push('target click'));
			const onOuterHydrated = vi.fn(() => order.push('outer hydrated'));
			const onInnerHydrated = vi.fn(() => order.push('inner hydrated'));
			const innerWhen = vi.fn(() => (returnsNever ? never() : condition(false)));
			const props = {
				outerWhen: condition(false),
				innerWhen,
				onTargetClick,
				onOuterHydrated,
				onInnerHydrated,
			};
			const { html } = renderToString(server.NestedInteractionHydration, props);
			expect(innerWhen).not.toHaveBeenCalled();
			container.innerHTML = html;
			const target = container.querySelector('#interaction-target') as HTMLButtonElement;

			root = hydrateRoot(container, client.NestedInteractionHydration, props);
			await act(() => {});
			expect(innerWhen).not.toHaveBeenCalled();

			await act(() => target.click());

			expect(container.querySelector('#interaction-target')).toBe(target);
			expect(innerWhen).toHaveBeenCalledOnce();
			expect(onOuterHydrated).toHaveBeenCalledOnce();
			if (returnsNever) {
				expect(onInnerHydrated).not.toHaveBeenCalled();
				expect(onTargetClick).not.toHaveBeenCalled();
				expect(order).toEqual(['outer hydrated']);
			} else {
				expect(onInnerHydrated).toHaveBeenCalledOnce();
				expect(onTargetClick).toHaveBeenCalledOnce();
				expect(order).toEqual(['outer hydrated', 'inner hydrated', 'target click']);
			}
		});
	}

	it('keeps an interaction boundary inert beneath a never ancestor', async () => {
		const onTargetClick = vi.fn();
		const onOuterHydrated = vi.fn();
		const onInnerHydrated = vi.fn();
		const props = {
			outerWhen: never(),
			innerWhen: interaction({ events: 'click' }),
			onTargetClick,
			onOuterHydrated,
			onInnerHydrated,
		};
		const { html } = renderToString(server.NestedInteractionHydration, props);
		container.innerHTML = html;
		const target = container.querySelector('#interaction-target') as HTMLButtonElement;

		root = hydrateRoot(container, client.NestedInteractionHydration, props);
		await act(() => target.click());

		expect(container.querySelector('#interaction-target')).toBe(target);
		expect(onOuterHydrated).not.toHaveBeenCalled();
		expect(onInnerHydrated).not.toHaveBeenCalled();
		expect(onTargetClick).not.toHaveBeenCalled();
	});
});
