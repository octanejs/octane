import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachBehaviorRoot, flushSync, hydrateRoot } from 'octane';
import { renderToReadableStream, renderToString } from 'octane/server';
import { flushEffects } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';
import * as staticClient from './hydration/_fixtures/deferred-hydration-static.tsrx';

const STATIC_FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-static.tsrx';
const staticServer = loadServerFixture<typeof staticClient>(STATIC_FIXTURE);

function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
} {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((complete, fail) => {
		resolve = complete;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe('behavior-only roots', () => {
	let container: HTMLElement;
	let roots: Array<ReturnType<typeof attachBehaviorRoot>>;
	let hydratedRoot: ReturnType<typeof hydrateRoot> | undefined;

	function attach(
		target: Element = container,
		options?: Parameters<typeof attachBehaviorRoot>[1],
	): ReturnType<typeof attachBehaviorRoot> {
		const root = attachBehaviorRoot(target, options);
		roots.push(root);
		return root;
	}

	beforeEach(() => {
		container = document.createElement('main');
		document.body.appendChild(container);
		roots = [];
		hydratedRoot = undefined;
	});

	afterEach(() => {
		for (const root of roots) root.dispose();
		hydratedRoot?.unmount();
		container.remove();
	});

	it('attaches to existing DOM without replacing nodes or mutating protected attributes', async () => {
		container.setAttribute('data-external-owner', 'stream');
		container.innerHTML =
			'<article id="existing" data-owned="server" aria-live="polite"><button>Action</button></article>';
		const article = container.firstElementChild!;
		const button = article.firstElementChild!;
		const initialMarkup = container.innerHTML;
		const initialAttributes = [...container.attributes].map(({ name, value }) => [name, value]);

		const root = attach();
		await root.ready;

		expect(root.container).toBe(container);
		expect(root.signal.aborted).toBe(false);
		expect(container.innerHTML).toBe(initialMarkup);
		expect([...container.attributes].map(({ name, value }) => [name, value])).toEqual(
			initialAttributes,
		);
		expect(container.firstElementChild).toBe(article);
		expect(article.firstElementChild).toBe(button);
		expect(article.getAttribute('data-owned')).toBe('server');
		expect(article.getAttribute('aria-live')).toBe('polite');
	});

	it('preserves externally owned DOM when disposed by default', async () => {
		container.innerHTML = '<section data-owner="stream"><button>Action</button></section>';
		const section = container.firstElementChild!;
		const button = section.firstElementChild!;
		const cleanup = vi.fn();
		const root = attach();
		const registration = root.registerBehavior({
			target: 'button',
			adopt: () => cleanup,
		});
		await registration.ready;

		root.dispose();
		root.dispose();
		registration.dispose();

		expect(root.signal.aborted).toBe(true);
		expect(registration.signal.aborted).toBe(true);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(section);
		expect(section.firstElementChild).toBe(button);
		expect(section.getAttribute('data-owner')).toBe('stream');
	});

	it('removes externally managed descendants only when explicitly requested', () => {
		container.innerHTML = '<article><button>Action</button></article>';
		const root = attach();

		root.dispose({ preserveDOM: false });

		expect(root.signal.aborted).toBe(true);
		expect(container.isConnected).toBe(true);
		expect(container.childNodes).toHaveLength(0);
	});

	it('adopts selector targets and an explicitly supplied element without rendering', async () => {
		container.innerHTML =
			'<button id="first" data-action>First</button><button id="second" data-action>Second</button>';
		const first = container.querySelector('#first')!;
		const second = container.querySelector('#second')!;
		const adopted = vi.fn();
		const explicitlyAdopted = vi.fn();
		const root = attach();
		const selected = root.registerBehavior({
			id: 'selector',
			target: '[data-action]',
			adopt: adopted,
		});
		const explicit = root.registerBehavior({
			id: 'explicit',
			target: second,
			adopt: explicitlyAdopted,
		});

		await Promise.all([selected.ready, explicit.ready, root.ready]);

		expect(adopted.mock.calls.map(([element]) => element)).toEqual([first, second]);
		expect(explicitlyAdopted.mock.calls.map(([element]) => element)).toEqual([second]);
		expect(container.children).toHaveLength(2);
		expect(container.children[0]).toBe(first);
		expect(container.children[1]).toBe(second);
	});

	it('adopts streamed insertions and cleans up removed nodes exactly once', async () => {
		container.innerHTML = '<section><button id="initial" data-action>Initial</button></section>';
		const section = container.firstElementChild!;
		const initial = section.firstElementChild!;
		const adopted: Element[] = [];
		const cleaned: Element[] = [];
		const root = attach();
		const registration = root.registerBehavior({
			target: '[data-action]',
			adopt(element) {
				adopted.push(element);
				return () => cleaned.push(element);
			},
		});
		await registration.ready;

		const streamed = document.createElement('button');
		streamed.id = 'streamed';
		streamed.setAttribute('data-action', '');
		streamed.textContent = 'Streamed';
		section.appendChild(streamed);
		await vi.waitFor(() => expect(adopted).toEqual([initial, streamed]));

		initial.remove();
		await vi.waitFor(() => expect(cleaned).toEqual([initial]));
		registration.dispose();
		registration.dispose();

		expect(cleaned).toEqual([initial, streamed]);
		expect(section.firstElementChild).toBe(streamed);
	});

	it('adopts existing elements when externally patched attributes toggle selector eligibility', async () => {
		container.innerHTML =
			'<section data-owner="stream"><button id="action" aria-label="Original">Action</button></section>';
		const section = container.firstElementChild!;
		const button = section.firstElementChild!;
		const originalMarkup = container.innerHTML;
		const cleaned: Element[] = [];
		const adopted = vi.fn((element: Element) => () => cleaned.push(element));
		const root = attach();
		const registration = root.registerBehavior({ target: '[data-action]', adopt: adopted });
		await registration.ready;
		expect(adopted).not.toHaveBeenCalled();

		button.setAttribute('data-action', 'annotation');
		await vi.waitFor(() => expect(adopted).toHaveBeenCalledOnce());
		expect(adopted.mock.calls[0]?.[0]).toBe(button);

		button.removeAttribute('data-action');
		await vi.waitFor(() => expect(cleaned).toEqual([button]));

		button.setAttribute('data-action', 'annotation');
		await vi.waitFor(() => expect(adopted).toHaveBeenCalledTimes(2));
		button.removeAttribute('data-action');
		await vi.waitFor(() => expect(cleaned).toEqual([button, button]));
		registration.dispose();

		expect(cleaned).toEqual([button, button]);
		expect(container.innerHTML).toBe(originalMarkup);
		expect(container.firstElementChild).toBe(section);
		expect(section.firstElementChild).toBe(button);
	});

	it.each([
		{
			change: 'an existing element changes class',
			selector: '.is-interactive',
			mutateAncestor: false,
			className: 'is-interactive',
		},
		{
			change: 'an unchanged descendant gains an attribute-selected ancestor',
			selector: '[data-enabled] [data-action]',
			mutateAncestor: true,
			attribute: 'data-enabled',
		},
		{
			change: 'an unchanged descendant gains a class-selected ancestor',
			selector: '.is-enabled [data-action]',
			mutateAncestor: true,
			className: 'is-enabled',
		},
	])(
		'updates existing behavior when $change',
		async ({ selector, mutateAncestor, attribute, className }) => {
			container.innerHTML =
				'<section class="external" data-owner="stream"><button id="action" class="stable" data-action>Action</button></section>';
			const section = container.firstElementChild!;
			const button = section.firstElementChild!;
			const originalMarkup = container.innerHTML;
			const owner = Symbol('external stream');
			const cleaned: Element[] = [];
			const adopted = vi.fn((element: Element) => () => cleaned.push(element));
			const root = attach();
			root.registerExternalRange(section, { owner });
			const behavior = root.registerBehavior({ owner, target: selector, adopt: adopted });
			await behavior.ready;
			expect(adopted).not.toHaveBeenCalled();

			const patched = mutateAncestor ? section : button;
			const enable = () => {
				if (attribute) patched.setAttribute(attribute, '');
				else patched.classList.add(className!);
			};
			const disable = () => {
				if (attribute) patched.removeAttribute(attribute);
				else patched.classList.remove(className!);
			};

			enable();
			await vi.waitFor(() => expect(adopted).toHaveBeenCalledOnce());
			expect(adopted.mock.calls[0]?.[0]).toBe(button);

			disable();
			await vi.waitFor(() => expect(cleaned).toEqual([button]));

			enable();
			await vi.waitFor(() => expect(adopted).toHaveBeenCalledTimes(2));
			disable();
			await vi.waitFor(() => expect(cleaned).toEqual([button, button]));
			behavior.dispose();

			expect(cleaned).toEqual([button, button]);
			expect(container.innerHTML).toBe(originalMarkup);
			expect(container.firstElementChild).toBe(section);
			expect(section.firstElementChild).toBe(button);
		},
	);

	it('updates :empty behavior when streamed mutations add or remove only text nodes', async () => {
		container.innerHTML = '<section id="streamed-text"></section>';
		const range = container.firstElementChild!;
		const adopted: Element[] = [];
		const cleaned: Element[] = [];
		const root = attach();
		const behavior = root.registerBehavior({
			target: '#streamed-text:empty',
			adopt(element) {
				adopted.push(element);
				return () => cleaned.push(element);
			},
		});
		await behavior.ready;
		expect(adopted).toEqual([range]);

		const streamedText = document.createTextNode('Progressively streamed text');
		range.appendChild(streamedText);
		await vi.waitFor(() => expect(cleaned).toEqual([range]));
		expect(range.firstChild).toBe(streamedText);
		expect(range.textContent).toBe('Progressively streamed text');

		streamedText.remove();
		await vi.waitFor(() => expect(adopted).toEqual([range, range]));
		expect(range.matches(':empty')).toBe(true);
	});

	it('keeps an existing adoption when its node moves inside the same ownership range', async () => {
		container.innerHTML =
			'<section id="left"><button data-action>Move</button></section><section id="right"></section>';
		const button = container.querySelector('button')!;
		const right = container.querySelector('#right')!;
		const cleanup = vi.fn();
		const adopt = vi.fn(() => cleanup);
		const root = attach();
		const registration = root.registerBehavior({ target: '[data-action]', adopt });
		await registration.ready;

		right.appendChild(button);
		await Promise.resolve();
		await Promise.resolve();

		expect(right.firstElementChild).toBe(button);
		expect(adopt).toHaveBeenCalledOnce();
		expect(cleanup).not.toHaveBeenCalled();

		root.dispose();
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it('waits for an external range while preserving mutations before and during readiness', async () => {
		container.innerHTML =
			'<section data-stream><button id="stale" data-action>Stale</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'stream' };
		const streamSettled = deferred<void>();
		const adopted = vi.fn();
		const root = attach();
		const ownership = root.registerExternalRange(range, {
			owner,
			ready: streamSettled.promise,
		});
		const behavior = root.registerBehavior({
			id: 'stream-action',
			owner,
			target: '[data-action]',
			adopt: adopted,
		});

		const inserted = document.createElement('button');
		inserted.id = 'streamed';
		inserted.setAttribute('data-action', '');
		inserted.textContent = 'Inserted while pending';
		range.replaceChildren(inserted);
		await Promise.resolve();
		expect(adopted).not.toHaveBeenCalled();
		expect(range.firstElementChild).toBe(inserted);

		streamSettled.resolve(undefined);
		await Promise.all([ownership.ready, behavior.ready, root.ready]);

		expect(adopted.mock.calls.map(([element]) => element)).toEqual([inserted]);
		expect(range.firstElementChild).toBe(inserted);
		expect(inserted.textContent).toBe('Inserted while pending');
	});

	it('adopts matching nodes when an owner range is registered after its behavior', async () => {
		container.innerHTML = '<section><button data-action>Late range</button></section>';
		const range = container.firstElementChild!;
		const button = range.firstElementChild!;
		const owner = { name: 'late-owner' };
		const adopted = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({ owner, target: '[data-action]', adopt: adopted });

		await Promise.resolve();
		expect(adopted).not.toHaveBeenCalled();

		const ownership = root.registerExternalRange(range, { owner });
		await Promise.all([ownership.ready, behavior.ready]);
		await vi.waitFor(() =>
			expect(adopted.mock.calls.map(([element]) => element)).toEqual([button]),
		);
	});

	it('gives a late nested range ownership over the closest matching descendants', async () => {
		container.innerHTML =
			'<section id="outer"><button id="outer-action" data-action>Outer</button><article id="inner"><button id="inner-action" data-action>Inner</button></article></section>';
		const outer = container.querySelector('#outer')!;
		const inner = container.querySelector('#inner')!;
		const outerButton = container.querySelector('#outer-action')!;
		const innerButton = container.querySelector('#inner-action')!;
		const outerOwner = { name: 'outer' };
		const innerOwner = { name: 'inner' };
		const outerAdoptions: Element[] = [];
		const outerCleanups: Element[] = [];
		const innerAdoptions: Element[] = [];
		const root = attach();
		root.registerExternalRange(outer, { owner: outerOwner });
		const outerBehavior = root.registerBehavior({
			id: 'outer-actions',
			owner: outerOwner,
			target: '[data-action]',
			adopt(element) {
				outerAdoptions.push(element);
				return () => outerCleanups.push(element);
			},
		});
		await outerBehavior.ready;
		expect(outerAdoptions).toEqual([outerButton, innerButton]);

		root.registerExternalRange(inner, { owner: innerOwner });
		const innerBehavior = root.registerBehavior({
			id: 'inner-actions',
			owner: innerOwner,
			target: '[data-action]',
			adopt(element) {
				innerAdoptions.push(element);
			},
		});
		await innerBehavior.ready;

		expect(outerCleanups).toEqual([innerButton]);
		expect(innerAdoptions).toEqual([innerButton]);
		expect(inner.firstElementChild).toBe(innerButton);
		expect(outer.firstElementChild).toBe(outerButton);
	});

	it('hands an adopted node between nested owners as external updates move it', async () => {
		container.innerHTML =
			'<section id="outer"><button id="moving" data-action>Move</button><article id="inner"></article></section>';
		const outer = container.querySelector('#outer')!;
		const inner = container.querySelector('#inner')!;
		const moving = container.querySelector('#moving')!;
		const outerOwner = { name: 'outer-owner' };
		const innerOwner = { name: 'inner-owner' };
		const outerAdoptions: Element[] = [];
		const innerAdoptions: Element[] = [];
		const outerCleanups: Element[] = [];
		const innerCleanups: Element[] = [];
		const root = attach();
		root.registerExternalRange(outer, { owner: outerOwner });
		root.registerExternalRange(inner, { owner: innerOwner });
		const outerBehavior = root.registerBehavior({
			owner: outerOwner,
			target: '[data-action]',
			adopt(element) {
				outerAdoptions.push(element);
				return () => outerCleanups.push(element);
			},
		});
		const innerBehavior = root.registerBehavior({
			owner: innerOwner,
			target: '[data-action]',
			adopt(element) {
				innerAdoptions.push(element);
				return () => innerCleanups.push(element);
			},
		});
		await Promise.all([outerBehavior.ready, innerBehavior.ready]);
		expect(outerAdoptions).toEqual([moving]);

		inner.appendChild(moving);
		await vi.waitFor(() => {
			expect(outerCleanups).toEqual([moving]);
			expect(innerAdoptions).toEqual([moving]);
		});

		outer.insertBefore(moving, inner);
		await vi.waitFor(() => {
			expect(innerCleanups).toEqual([moving]);
			expect(outerAdoptions).toEqual([moving, moving]);
		});
		expect(outer.firstElementChild).toBe(moving);
	});

	it('restores enclosing ownership when a nested behavior root is disposed without replacing DOM', async () => {
		container.innerHTML =
			'<section id="outer-range"><article id="nested-root"><button data-action>Nested</button></article></section>';
		const outerRange = container.querySelector('#outer-range')!;
		const nestedContainer = container.querySelector('#nested-root')!;
		const button = nestedContainer.firstElementChild!;
		const outerOwner = { name: 'enclosing-owner' };
		const nestedOwner = { name: 'nested-owner' };
		const outerAdoptions: Element[] = [];
		const outerCleanups: Element[] = [];
		const nestedCleanup = vi.fn();
		const outerRoot = attach();
		outerRoot.registerExternalRange(outerRange, { owner: outerOwner });
		const enclosingBehavior = outerRoot.registerBehavior({
			owner: outerOwner,
			target: '[data-action]',
			adopt(element) {
				outerAdoptions.push(element);
				return () => outerCleanups.push(element);
			},
		});
		await enclosingBehavior.ready;
		expect(outerAdoptions).toEqual([button]);

		const nestedRoot = attach(nestedContainer);
		nestedRoot.registerExternalRange(nestedContainer, { owner: nestedOwner });
		const nestedBehavior = nestedRoot.registerBehavior({
			owner: nestedOwner,
			target: '[data-action]',
			adopt: () => nestedCleanup,
		});
		await nestedBehavior.ready;
		expect(outerCleanups).toEqual([button]);

		nestedRoot.dispose();

		expect(nestedCleanup).toHaveBeenCalledOnce();
		expect(outerRoot.signal.aborted).toBe(false);
		expect(nestedContainer.firstElementChild).toBe(button);
		await vi.waitFor(() => expect(outerAdoptions).toEqual([button, button]));
	});

	it('rejects conflicting owners and hands a range off only when replacement is explicit', async () => {
		container.innerHTML = '<section><button data-action>Owned</button></section>';
		const range = container.firstElementChild!;
		const button = range.firstElementChild!;
		const initialOwner = { name: 'initial' };
		const nextOwner = { name: 'replacement' };
		const cleanup = vi.fn();
		const root = attach();
		const initialRange = root.registerExternalRange(range, { owner: initialOwner });
		const initialBehavior = root.registerBehavior({
			owner: initialOwner,
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await initialBehavior.ready;

		expect(() => root.registerExternalRange(range, { owner: nextOwner })).toThrow(
			/conflict|own|replace/i,
		);
		const replacement = root.registerExternalRange(range, {
			owner: nextOwner,
			replace: true,
		});
		const adopted = vi.fn();
		const replacementBehavior = root.registerBehavior({
			owner: nextOwner,
			target: '[data-action]',
			adopt: adopted,
		});
		await Promise.all([replacement.ready, replacementBehavior.ready]);

		expect(initialRange.signal.aborted).toBe(true);
		expect(replacement.signal.aborted).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(adopted.mock.calls.map(([element]) => element)).toEqual([button]);
		expect(range.firstElementChild).toBe(button);
	});

	it('ignores a superseded owner readiness promise after a range handoff', async () => {
		container.innerHTML = '<section><button data-action>Owned</button></section>';
		const range = container.firstElementChild!;
		const previousOwner = { name: 'previous' };
		const nextOwner = { name: 'next' };
		const staleReadiness = deferred<void>();
		const staleAdoption = vi.fn();
		const currentAdoption = vi.fn();
		const root = attach();
		const staleRange = root.registerExternalRange(range, {
			owner: previousOwner,
			ready: staleReadiness.promise,
		});
		root.registerBehavior({ owner: previousOwner, target: '[data-action]', adopt: staleAdoption });

		const currentRange = root.registerExternalRange(range, {
			owner: nextOwner,
			replace: true,
		});
		const currentBehavior = root.registerBehavior({
			owner: nextOwner,
			target: '[data-action]',
			adopt: currentAdoption,
		});
		await Promise.all([currentRange.ready, currentBehavior.ready]);

		staleReadiness.resolve(undefined);
		await staleRange.ready.catch(() => {});
		await Promise.resolve();

		expect(staleRange.signal.aborted).toBe(true);
		expect(staleAdoption).not.toHaveBeenCalled();
		expect(currentAdoption).toHaveBeenCalledOnce();
	});

	it('drops queued interactions from an owner generation replaced before its behavior loads', async () => {
		container.innerHTML = '<section><button data-action>Owned</button></section>';
		const rangeElement = container.firstElementChild!;
		const button = rangeElement.firstElementChild!;
		const owner = { name: 'replaced-owner' };
		const oldRangeReady = deferred<void>();
		const moduleReady = deferred<void>();
		const handled = vi.fn();
		const root = attach();
		const oldRange = root.registerExternalRange(rangeElement, {
			owner,
			ready: oldRangeReady.promise,
		});
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			events: ['click'],
			ready: moduleReady.promise,
			adopt() {},
			handleEvent: handled,
		});
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(handled).not.toHaveBeenCalled();

		const replacement = root.registerExternalRange(rangeElement, { owner, replace: true });
		moduleReady.resolve(undefined);
		await Promise.all([replacement.ready, behavior.ready]);
		oldRangeReady.resolve(undefined);
		await oldRange.ready;

		expect(oldRange.signal.aborted).toBe(true);
		expect(replacement.signal.aborted).toBe(false);
		expect(handled).not.toHaveBeenCalled();
		expect(rangeElement.firstElementChild).toBe(button);
	});

	it('passes the exact queued interaction to a late behavior without redispatching it', async () => {
		container.innerHTML = '<button data-action><span>Action</span></button>';
		const button = container.querySelector('button')!;
		const label = container.querySelector('span')!;
		const moduleReady = deferred<void>();
		const nativeListener = vi.fn();
		const handled = vi.fn();
		button.addEventListener('click', nativeListener);
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['click'],
			ready: moduleReady.promise,
			adopt() {},
			handleEvent: handled,
		});
		const original = new MouseEvent('click', { bubbles: true, cancelable: true });

		expect(label.dispatchEvent(original)).toBe(true);
		expect(nativeListener).toHaveBeenCalledOnce();
		expect(nativeListener.mock.calls[0][0]).toBe(original);
		expect(original.defaultPrevented).toBe(false);
		expect(handled).not.toHaveBeenCalled();

		moduleReady.resolve(undefined);
		await behavior.ready;

		expect(handled).toHaveBeenCalledOnce();
		expect(handled.mock.calls[0][0]).toBe(original);
		expect(handled.mock.calls[0][1]).toBe(button);
		expect(handled.mock.calls[0][2].signal.aborted).toBe(false);
		expect(nativeListener).toHaveBeenCalledOnce();
		expect(original.defaultPrevented).toBe(false);
	});

	it('preserves synchronous FIFO delivery when a queued handler dispatches another event', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const button = container.querySelector('button')!;
		const moduleReady = deferred<void>();
		const order: string[] = [];
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['probe'],
			ready: moduleReady.promise,
			adopt() {},
			handleEvent(event) {
				const detail = (event as CustomEvent<string>).detail;
				order.push(`start:${detail}`);
				if (detail === 'first') {
					button.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'nested' }));
					order.push('after:nested-dispatch');
				}
				order.push(`end:${detail}`);
			},
		});

		button.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'first' }));
		button.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'second' }));
		moduleReady.resolve(undefined);
		await behavior.ready;

		expect(order).toEqual([
			'start:first',
			'start:second',
			'end:second',
			'start:nested',
			'end:nested',
			'after:nested-dispatch',
			'end:first',
		]);
	});

	it('preserves FIFO delivery while asynchronous adoptions resume the queue', async () => {
		container.innerHTML = [
			'<button data-action="first">First</button>',
			'<button data-action="second">Second</button>',
			'<button data-action="third">Third</button>',
		].join('');
		const first = container.querySelector<HTMLButtonElement>('[data-action="first"]')!;
		const second = container.querySelector<HTMLButtonElement>('[data-action="second"]')!;
		const third = container.querySelector<HTMLButtonElement>('[data-action="third"]')!;
		const moduleReady = deferred<void>();
		const firstReady = deferred<void>();
		const secondReady = deferred<void>();
		const thirdReady = deferred<void>();
		const order: string[] = [];
		const root = attach();
		const adopt = vi.fn((element: Element) => {
			if (element === first) return firstReady.promise;
			if (element === second) return secondReady.promise;
			if (element === third) return thirdReady.promise;
			throw new Error('Unexpected behavior target');
		});
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['probe'],
			ready: moduleReady.promise,
			adopt,
			handleEvent(event) {
				const detail = (event as CustomEvent<string>).detail;
				order.push(`start:${detail}`);
				if (detail === 'first') {
					first.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'nested' }));
					order.push('after:nested-dispatch');
				}
				order.push(`end:${detail}`);
			},
		});

		first.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'first' }));
		second.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'second' }));
		third.dispatchEvent(new CustomEvent('probe', { bubbles: true, detail: 'third' }));
		moduleReady.resolve(undefined);
		await vi.waitFor(() => expect(adopt).toHaveBeenCalledTimes(3));

		firstReady.resolve(undefined);
		await firstReady.promise;
		await Promise.resolve();
		expect(order).toEqual(['start:first', 'after:nested-dispatch', 'end:first']);

		thirdReady.resolve(undefined);
		await thirdReady.promise;
		await Promise.resolve();
		expect(order).toEqual(['start:first', 'after:nested-dispatch', 'end:first']);

		secondReady.resolve(undefined);
		await behavior.ready;
		expect(order).toEqual([
			'start:first',
			'after:nested-dispatch',
			'end:first',
			'start:second',
			'end:second',
			'start:third',
			'end:third',
			'start:nested',
			'end:nested',
		]);
	});

	it('handles delegated behavior on descendants inserted after registration', async () => {
		container.innerHTML = '<section data-stream></section>';
		const stream = container.firstElementChild!;
		const handled = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['click'],
			adopt() {},
			handleEvent: handled,
		});
		await behavior.ready;

		const inserted = document.createElement('button');
		inserted.setAttribute('data-action', '');
		stream.appendChild(inserted);
		const event = new MouseEvent('click', { bubbles: true });
		inserted.dispatchEvent(event);

		expect(handled).toHaveBeenCalledOnce();
		expect(handled.mock.calls[0][0]).toBe(event);
		expect(handled.mock.calls[0][1]).toBe(inserted);
		expect(stream.firstElementChild).toBe(inserted);
	});

	it('never activates native form submission twice for queued or repeated clicks', async () => {
		container.innerHTML = '<form><button type="submit" data-action>Send</button></form>';
		const form = container.querySelector('form')!;
		const button = container.querySelector('button')!;
		const moduleReady = deferred<void>();
		const nativeClicks: Event[] = [];
		const nativeSubmits: Event[] = [];
		const handled = vi.fn();
		button.addEventListener('click', (event) => nativeClicks.push(event));
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			nativeSubmits.push(event);
		});
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			events: ['click'],
			ready: moduleReady.promise,
			adopt() {},
			handleEvent: handled,
		});

		button.click();
		button.click();
		expect(nativeClicks).toHaveLength(2);
		expect(nativeSubmits).toHaveLength(2);
		expect(handled).not.toHaveBeenCalled();

		moduleReady.resolve(undefined);
		await behavior.ready;

		expect(handled.mock.calls.map(([event]) => event)).toEqual(nativeClicks);
		expect(nativeSubmits).toHaveLength(2);

		button.click();
		expect(nativeClicks).toHaveLength(3);
		expect(nativeSubmits).toHaveLength(3);
		expect(handled.mock.calls.map(([event]) => event)).toEqual(nativeClicks);
	});

	it('honors behavior dependency readiness before adopting a dependent entry', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const foundationReady = deferred<void>();
		const order: string[] = [];
		const root = attach();
		const foundation = root.registerBehavior({
			id: 'foundation',
			target: '[data-action]',
			ready: foundationReady.promise,
			adopt() {
				order.push('foundation');
			},
		});
		const widget = root.registerBehavior({
			id: 'widget',
			target: '[data-action]',
			dependencies: ['foundation'],
			adopt() {
				order.push('widget');
			},
		});
		await Promise.resolve();
		expect(order).toEqual([]);

		foundationReady.resolve(undefined);
		await Promise.all([foundation.ready, widget.ready, root.ready]);

		expect(order).toEqual(['foundation', 'widget']);
	});

	it('rejects a behavior dependency that was never registered', () => {
		container.innerHTML = '<button data-action>Action</button>';
		const root = attach();

		expect(() =>
			root.registerBehavior({
				id: 'widget',
				target: '[data-action]',
				dependencies: ['missing-foundation'],
				adopt() {},
			}),
		).toThrow(/depend|unknown|missing/i);
	});

	it('rejects conflicting behavior entries and duplicate behavior identities', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const root = attach();
		const first = root.registerBehavior({
			id: 'annotations',
			target: '[data-action]',
			conflicts: ['widgets'],
			adopt() {},
		});
		await first.ready;

		expect(() =>
			root.registerBehavior({ id: 'widgets', target: '[data-action]', adopt() {} }),
		).toThrow(/conflict/i);
		expect(() =>
			root.registerBehavior({ id: 'annotations', target: '[data-action]', adopt() {} }),
		).toThrow(/conflict|duplicate|already/i);

		root.registerBehavior({ id: 'existing', target: '[data-action]', adopt() {} });
		expect(() =>
			root.registerBehavior({
				id: 'declared-later',
				target: '[data-action]',
				conflicts: ['existing'],
				adopt() {},
			}),
		).toThrow(/conflict/i);
	});

	it('propagates a rejected external range readiness without adopting protected descendants', async () => {
		container.innerHTML = '<section><button data-action>Unavailable</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'failed-stream' };
		const streamReady = deferred<void>();
		const failure = new Error('stream failed before ownership settled');
		const adopted = vi.fn();
		const root = attach();
		const ownership = root.registerExternalRange(range, { owner, ready: streamReady.promise });
		const behavior = root.registerBehavior({ owner, target: '[data-action]', adopt: adopted });
		const ownershipFailure = expect(ownership.ready).rejects.toBe(failure);
		const behaviorFailure = expect(behavior.ready).rejects.toBe(failure);
		const rootFailure = expect(root.ready).rejects.toBe(failure);

		streamReady.reject(failure);
		await Promise.all([ownershipFailure, behaviorFailure, rootFailure]);

		expect(adopted).not.toHaveBeenCalled();
		expect(container.firstElementChild).toBe(range);
	});

	it('finalizes a rejected external range when an affected behavior cleanup throws', async () => {
		container.innerHTML =
			'<section id="healthy"><button id="shared-action" data-action>Healthy action</button>' +
			'<button id="independent-action" data-independent>Independent</button></section>' +
			'<section id="failed"><button id="pending-action" data-action>Pending action</button></section>';
		const healthyElement = container.querySelector('#healthy')!;
		const failedElement = container.querySelector('#failed')!;
		const healthyAction = container.querySelector('#shared-action')!;
		const independentAction = container.querySelector('#independent-action')!;
		const owner = { name: 'partially-failed-stream' };
		const ready = deferred<void>();
		const failure = new Error('external stream failed');
		const throwingCleanup = vi.fn(() => {
			throw new Error('an adopted cleanup also failed');
		});
		const followingCleanup = vi.fn();
		const independentCleanup = vi.fn();
		const root = attach();
		const healthyRange = root.registerExternalRange(healthyElement, { owner });
		const failedRange = root.registerExternalRange(failedElement, {
			owner,
			ready: ready.promise,
		});
		const firstBehavior = root.registerBehavior({
			id: 'throws-while-cleaning',
			owner,
			target: '[data-action]',
			adopt: () => throwingCleanup,
		});
		const followingBehavior = root.registerBehavior({
			id: 'still-cleans',
			owner,
			target: '[data-action]',
			adopt: () => followingCleanup,
		});
		const independentBehavior = root.registerBehavior({
			id: 'independent',
			owner,
			target: '[data-independent]',
			adopt: () => independentCleanup,
		});
		await independentBehavior.ready;
		const failedRangeOutcome = expect(failedRange.ready).rejects.toBe(failure);
		const firstBehaviorOutcome = expect(firstBehavior.ready).rejects.toBe(failure);
		const followingBehaviorOutcome = expect(followingBehavior.ready).rejects.toBe(failure);
		const rootOutcome = expect(root.ready).rejects.toBe(failure);

		ready.reject(failure);
		await Promise.all([
			failedRangeOutcome,
			firstBehaviorOutcome,
			followingBehaviorOutcome,
			rootOutcome,
		]);

		expect(throwingCleanup).toHaveBeenCalledOnce();
		expect(followingCleanup).toHaveBeenCalledOnce();
		expect(independentCleanup).not.toHaveBeenCalled();
		expect(failedRange.signal.aborted).toBe(true);
		expect(firstBehavior.signal.aborted).toBe(true);
		expect(followingBehavior.signal.aborted).toBe(true);
		expect(healthyRange.signal.aborted).toBe(false);
		expect(independentBehavior.signal.aborted).toBe(false);
		expect(healthyElement.querySelector('#shared-action')).toBe(healthyAction);
		expect(healthyElement.querySelector('#independent-action')).toBe(independentAction);
		expect(container.querySelector('#failed')).toBe(failedElement);

		const recovered = root.registerExternalRange(failedElement, {
			owner: { name: 'recovered-owner' },
		});
		await recovered.ready;
		expect(recovered.signal.aborted).toBe(false);
	});

	it('rejects an owner-constrained behavior when its range fails before its own module loads', async () => {
		container.innerHTML = '<section><button data-action>Unavailable</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'failed-before-load' };
		const streamReady = deferred<void>();
		const moduleReady = deferred<void>();
		const failure = new Error('stream failed while the behavior module was pending');
		const adopted = vi.fn();
		const root = attach();
		const ownership = root.registerExternalRange(range, { owner, ready: streamReady.promise });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			ready: moduleReady.promise,
			adopt: adopted,
		});
		const ownershipFailure = expect(ownership.ready).rejects.toBe(failure);
		const behaviorFailure = expect(behavior.ready).rejects.toBe(failure);
		const rootFailure = expect(root.ready).rejects.toBe(failure);

		streamReady.reject(failure);
		await Promise.all([ownershipFailure, rootFailure]);
		moduleReady.resolve(undefined);
		await behaviorFailure;

		expect(adopted).not.toHaveBeenCalled();
		expect(behavior.signal.aborted).toBe(true);
		expect(container.firstElementChild).toBe(range);
	});

	it('keeps a same-owner behavior in a disjoint root alive when another external range fails', async () => {
		container.innerHTML =
			'<section><button id="failed-action" data-action>Failed</button></section>';
		const independentContainer = document.createElement('main');
		independentContainer.innerHTML =
			'<section><button id="healthy-action" data-action>Healthy</button></section>';
		document.body.appendChild(independentContainer);
		try {
			const owner = { name: 'shared-external-owner' };
			const failedReady = deferred<void>();
			const healthyModule = deferred<void>();
			const failure = new Error('only the first independently owned range failed');
			const adopted = vi.fn();
			const failedRoot = attach();
			const healthyRoot = attach(independentContainer);
			const failedRange = failedRoot.registerExternalRange(container.firstElementChild!, {
				owner,
				ready: failedReady.promise,
			});
			healthyRoot.registerExternalRange(independentContainer.firstElementChild!, { owner });
			const healthyBehavior = healthyRoot.registerBehavior({
				owner,
				target: '#healthy-action',
				ready: healthyModule.promise,
				adopt: adopted,
			});
			const rangeFailure = expect(failedRange.ready).rejects.toBe(failure);
			const rootFailure = expect(failedRoot.ready).rejects.toBe(failure);

			failedReady.reject(failure);
			await Promise.all([rangeFailure, rootFailure]);

			expect(healthyRoot.signal.aborted).toBe(false);
			expect(healthyBehavior.signal.aborted).toBe(false);
			healthyModule.resolve(undefined);
			await Promise.all([healthyBehavior.ready, healthyRoot.ready]);
			expect(adopted.mock.calls[0][0]).toBe(independentContainer.querySelector('#healthy-action'));
		} finally {
			independentContainer.remove();
		}
	});

	it('propagates a rejected behavior readiness without running stale adoption', async () => {
		container.innerHTML = '<button data-action>Unavailable</button>';
		const moduleReady = deferred<void>();
		const failure = new Error('behavior module failed to load');
		const adopted = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			ready: moduleReady.promise,
			adopt: adopted,
		});
		const behaviorFailure = expect(behavior.ready).rejects.toBe(failure);
		const rootFailure = expect(root.ready).rejects.toBe(failure);

		moduleReady.reject(failure);
		await Promise.all([behaviorFailure, rootFailure]);

		expect(adopted).not.toHaveBeenCalled();
		expect(container.querySelector('[data-action]')).not.toBeNull();
	});

	it('aborts adopted behavior and keeps preserved DOM when its source signal is canceled', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const button = container.firstElementChild!;
		const lifetime = new AbortController();
		const cleanup = vi.fn();
		const root = attach(container, { signal: lifetime.signal });
		const behavior = root.registerBehavior({ target: '[data-action]', adopt: () => cleanup });
		await behavior.ready;

		lifetime.abort();
		lifetime.abort();

		expect(root.signal.aborted).toBe(true);
		expect(behavior.signal.aborted).toBe(true);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(button);
	});

	it('returns a settled disposed root for a pre-aborted signal without retaining container ownership', async () => {
		container.innerHTML = '<button data-action>Preserved</button>';
		const button = container.firstElementChild!;
		const canceled = new AbortController();
		canceled.abort();
		const disposed = attach(container, { signal: canceled.signal });
		let settled = false;
		void disposed.ready.then(
			() => (settled = true),
			() => (settled = true),
		);

		await vi.waitFor(() => expect(settled).toBe(true));
		expect(disposed.signal.aborted).toBe(true);
		expect(container.firstElementChild).toBe(button);

		const replacement = attach();
		expect(replacement.signal.aborted).toBe(false);
		expect(container.firstElementChild).toBe(button);
	});

	it('does not evict a healthy root when its explicitly requested replacement is already canceled', async () => {
		container.innerHTML = '<button data-action>Still active</button>';
		const cleanup = vi.fn();
		const current = attach();
		const activeBehavior = current.registerBehavior({
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await activeBehavior.ready;
		const canceled = new AbortController();
		canceled.abort();

		const abandoned = attach(container, { replace: true, signal: canceled.signal });
		await abandoned.ready;

		expect(abandoned.signal.aborted).toBe(true);
		expect(current.signal.aborted).toBe(false);
		expect(activeBehavior.signal.aborted).toBe(false);
		expect(cleanup).not.toHaveBeenCalled();
		expect(container.querySelector('[data-action]')).not.toBeNull();
	});

	it('returns a settled canceled range for a pre-aborted owner without retaining its claim', async () => {
		container.innerHTML = '<section><button data-action>Preserved</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'pre-aborted-owner' };
		const canceled = new AbortController();
		canceled.abort();
		const neverReady = new Promise<void>(() => {});
		const root = attach();
		const inactive = root.registerExternalRange(range, {
			owner,
			signal: canceled.signal,
			ready: neverReady,
		});
		let settled = false;
		void inactive.ready.then(
			() => (settled = true),
			() => (settled = true),
		);

		await vi.waitFor(() => expect(settled).toBe(true));
		expect(inactive.signal.aborted).toBe(true);
		expect(root.signal.aborted).toBe(false);

		const active = root.registerExternalRange(range, { owner });
		await active.ready;
		expect(active.signal.aborted).toBe(false);
		expect(container.firstElementChild).toBe(range);
	});

	it('does not evict a healthy external owner when its replacement is already canceled', async () => {
		container.innerHTML = '<section><button data-action>Still owned</button></section>';
		const rangeElement = container.firstElementChild!;
		const currentOwner = { name: 'active-owner' };
		const abandonedOwner = { name: 'abandoned-owner' };
		const cleanup = vi.fn();
		const root = attach();
		const current = root.registerExternalRange(rangeElement, { owner: currentOwner });
		const activeBehavior = root.registerBehavior({
			owner: currentOwner,
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await activeBehavior.ready;
		const canceled = new AbortController();
		canceled.abort();

		const abandoned = root.registerExternalRange(rangeElement, {
			owner: abandonedOwner,
			replace: true,
			signal: canceled.signal,
		});
		await abandoned.ready;

		expect(abandoned.signal.aborted).toBe(true);
		expect(current.signal.aborted).toBe(false);
		expect(activeBehavior.signal.aborted).toBe(false);
		expect(cleanup).not.toHaveBeenCalled();
		expect(container.firstElementChild).toBe(rangeElement);
	});

	it('returns a settled canceled behavior for a pre-aborted entry without adopting or retaining its ID', async () => {
		container.innerHTML = '<button data-action>Preserved</button>';
		const canceled = new AbortController();
		canceled.abort();
		const neverReady = new Promise<void>(() => {});
		const staleAdoption = vi.fn();
		const currentAdoption = vi.fn();
		const root = attach();
		const inactive = root.registerBehavior({
			id: 'replaceable',
			target: '[data-action]',
			signal: canceled.signal,
			ready: neverReady,
			adopt: staleAdoption,
		});
		let settled = false;
		void inactive.ready.then(
			() => (settled = true),
			() => (settled = true),
		);

		await vi.waitFor(() => expect(settled).toBe(true));
		expect(inactive.signal.aborted).toBe(true);
		expect(staleAdoption).not.toHaveBeenCalled();
		expect(root.signal.aborted).toBe(false);

		const active = root.registerBehavior({
			id: 'replaceable',
			target: '[data-action]',
			adopt: currentAdoption,
		});
		await active.ready;
		expect(currentAdoption).toHaveBeenCalledOnce();
	});

	it('settles all canceled readiness promises even when external readiness never resolves', async () => {
		container.innerHTML = '<section><button data-action>Waiting</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'pending-owner' };
		const neverReady = new Promise<void>(() => {});
		const root = attach();
		const ownership = root.registerExternalRange(range, { owner, ready: neverReady });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			ready: neverReady,
			adopt() {},
		});
		const settled = { root: false, ownership: false, behavior: false };
		void root.ready.then(
			() => (settled.root = true),
			() => (settled.root = true),
		);
		void ownership.ready.then(
			() => (settled.ownership = true),
			() => (settled.ownership = true),
		);
		void behavior.ready.then(
			() => (settled.behavior = true),
			() => (settled.behavior = true),
		);

		root.dispose();

		await vi.waitFor(() =>
			expect(settled).toEqual({ root: true, ownership: true, behavior: true }),
		);
		expect(range.isConnected).toBe(true);
	});

	it('cancels a behavior registration without disposing its root or removing its target', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const button = container.firstElementChild!;
		const lifetime = new AbortController();
		const cleanup = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			signal: lifetime.signal,
			adopt: () => cleanup,
		});
		await behavior.ready;

		lifetime.abort();

		expect(behavior.signal.aborted).toBe(true);
		expect(root.signal.aborted).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(button);
	});

	it('cancels external ownership without disposing independently owned root behavior', async () => {
		container.innerHTML = '<section><button data-action>Owned</button></section>';
		const range = container.firstElementChild!;
		const owner = { name: 'stream' };
		const lifetime = new AbortController();
		const cleanup = vi.fn();
		const root = attach();
		const ownership = root.registerExternalRange(range, { owner, signal: lifetime.signal });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await behavior.ready;

		lifetime.abort();

		expect(ownership.signal.aborted).toBe(true);
		expect(root.signal.aborted).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(range);
	});

	it('runs an asynchronously returned cleanup once when adoption settles after disposal', async () => {
		container.innerHTML = '<button data-action>Pending</button>';
		const pendingAdoption = deferred<() => void>();
		const cleanup = vi.fn();
		const adopt = vi.fn(() => pendingAdoption.promise);
		const root = attach();
		const behavior = root.registerBehavior({ target: '[data-action]', adopt });
		await vi.waitFor(() => expect(adopt).toHaveBeenCalledOnce());
		const readiness = behavior.ready.catch(() => {});

		root.dispose();
		pendingAdoption.resolve(cleanup);
		await readiness;
		await vi.waitFor(() => expect(cleanup).toHaveBeenCalledOnce());

		behavior.dispose();
		root.dispose();
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-action]')).not.toBeNull();
	});

	it('does not let a removed pending adoption delay behavior readiness', async () => {
		container.innerHTML =
			'<button data-action="removed">Removed</button><button data-action="live">Live</button>';
		const removed = container.querySelector<HTMLButtonElement>('[data-action="removed"]')!;
		const live = container.querySelector<HTMLButtonElement>('[data-action="live"]')!;
		const removedReady = deferred<() => void>();
		const liveReady = deferred<void>();
		const removedCleanup = vi.fn();
		let removedSignal: AbortSignal | undefined;
		const adopt = vi.fn((element: Element, context: { signal: AbortSignal }) => {
			if (element === removed) {
				removedSignal = context.signal;
				return removedReady.promise;
			}
			if (element === live) return liveReady.promise;
			throw new Error('Unexpected behavior target');
		});
		const root = attach();
		const behavior = root.registerBehavior({ target: '[data-action]', adopt });
		await vi.waitFor(() => expect(adopt).toHaveBeenCalledTimes(2));

		removed.remove();
		await vi.waitFor(() => expect(removedSignal?.aborted).toBe(true));
		liveReady.resolve(undefined);
		await behavior.ready;

		removedReady.resolve(removedCleanup);
		await vi.waitFor(() => expect(removedCleanup).toHaveBeenCalledOnce());
		expect(container.firstElementChild).toBe(live);
	});

	it('does not adopt a stale asynchronously loaded behavior after its root is disposed', async () => {
		container.innerHTML = '<button data-action>Pending</button>';
		const moduleReady = deferred<void>();
		const adopted = vi.fn();
		const root = attach();
		const behavior = root.registerBehavior({
			target: '[data-action]',
			ready: moduleReady.promise,
			adopt: adopted,
		});

		root.dispose();
		moduleReady.resolve(undefined);
		await behavior.ready.catch(() => {});
		await Promise.resolve();

		expect(adopted).not.toHaveBeenCalled();
		expect(behavior.signal.aborted).toBe(true);
	});

	it('runs cleanup once when disposal reenters the root lifecycle', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const root = attach();
		const cleanup = vi.fn(() => root.dispose());
		const behavior = root.registerBehavior({ target: '[data-action]', adopt: () => cleanup });
		await behavior.ready;

		root.dispose();
		behavior.dispose();

		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.querySelector('[data-action]')).not.toBeNull();
	});

	it('requires explicit root replacement and releases the previous root exactly once', async () => {
		container.innerHTML = '<button data-action>Action</button>';
		const button = container.firstElementChild!;
		const cleanup = vi.fn();
		const previous = attach();
		const registration = previous.registerBehavior({
			target: '[data-action]',
			adopt: () => cleanup,
		});
		await registration.ready;

		expect(() => attachBehaviorRoot(container)).toThrow(/conflict|root|replace|already/i);
		const replacement = attach(container, { replace: true });

		expect(previous.signal.aborted).toBe(true);
		expect(registration.signal.aborted).toBe(true);
		expect(replacement.signal.aborted).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
		expect(container.firstElementChild).toBe(button);
	});

	it('scopes root and ownership identity to each document and rejects cross-document ranges', async () => {
		container.innerHTML = '<section><button data-action>Local</button></section>';
		const localRange = container.firstElementChild!;
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		try {
			const foreignDocument = iframe.contentDocument!;
			const foreignContainer = foreignDocument.createElement('main');
			foreignContainer.innerHTML = '<section><button data-action>Foreign</button></section>';
			foreignDocument.body.appendChild(foreignContainer);
			const foreignRange = foreignContainer.firstElementChild!;
			const owner = { name: 'document-scoped' };
			const localAdoption = vi.fn();
			const foreignAdoption = vi.fn();
			const localRoot = attach();
			const foreignRoot = attach(foreignContainer);
			localRoot.registerExternalRange(localRange, { owner });
			foreignRoot.registerExternalRange(foreignRange, { owner });
			const localBehavior = localRoot.registerBehavior({
				id: 'document-action',
				owner,
				target: '[data-action]',
				adopt: localAdoption,
			});
			const foreignBehavior = foreignRoot.registerBehavior({
				id: 'document-action',
				owner,
				target: '[data-action]',
				adopt: foreignAdoption,
			});
			await Promise.all([localBehavior.ready, foreignBehavior.ready]);

			expect(localAdoption.mock.calls[0][0]).toBe(localRange.firstElementChild);
			expect(foreignAdoption.mock.calls[0][0]).toBe(foreignRange.firstElementChild);
			expect(() => localRoot.registerExternalRange(foreignRange, { owner })).toThrow(
				/document|container|range|belong/i,
			);
			expect(() => foreignRoot.registerExternalRange(localRange, { owner })).toThrow(
				/document|container|range|belong/i,
			);
		} finally {
			iframe.remove();
		}
	});

	it('adds behavior to permanent-static SSR DOM without claiming surrounding hydration', async () => {
		const onStaticRender = vi.fn();
		container.innerHTML = renderToString(staticServer.PermanentExternallyPatched, {
			html: '<button id="server-action" data-action>Server action</button>',
			label: 'Server label',
		}).html;
		const range = container.querySelector('#server-owned-range')!;
		const button = range.querySelector('#server-action')!;
		const owner = { name: 'server-stream' };
		const handled = vi.fn();
		const root = attach();
		root.registerExternalRange(range, { owner });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			events: ['click'],
			adopt() {},
			handleEvent: handled,
		});
		await behavior.ready;

		hydratedRoot = hydrateRoot(container, staticClient.PermanentExternallyPatched, {
			html: '<p>Client must not reconcile externally owned markup</p>',
			label: 'Server label',
			onStaticRender,
		});
		flushSync(() => {});
		flushEffects();
		const first = new MouseEvent('click', { bubbles: true });
		button.dispatchEvent(first);

		const inserted = document.createElement('button');
		inserted.id = 'streamed-action';
		inserted.setAttribute('data-action', '');
		range.appendChild(inserted);
		flushSync(() =>
			hydratedRoot!.render(staticClient.PermanentExternallyPatched, {
				html: '<p>Updated client content must not own the range</p>',
				label: 'Updated label',
				onStaticRender,
			}),
		);
		flushEffects();
		const second = new MouseEvent('click', { bubbles: true });
		inserted.dispatchEvent(second);

		expect(container.querySelector('#server-owned-range')).toBe(range);
		expect(range.querySelector('#server-action')).toBe(button);
		expect(range.querySelector('#streamed-action')).toBe(inserted);
		expect(container.querySelector('#server-owned-live-label')?.textContent).toBe('Updated label');
		expect(handled.mock.calls.map(([event]) => event)).toEqual([first, second]);
		expect(onStaticRender).not.toHaveBeenCalled();

		root.dispose();
		expect(range.querySelector('#server-action')).toBe(button);
		expect(range.querySelector('#streamed-action')).toBe(inserted);
	});

	it('adopts permanent-static markup produced by standards-based ReadableStream SSR', async () => {
		const stream = await renderToReadableStream(staticServer.PermanentExternallyPatched, {
			html: '<button id="readable-action" data-action>Streamed action</button>',
			label: 'Readable stream label',
		});
		container.innerHTML = await new Response(stream).text();
		const range = container.querySelector('#server-owned-range')!;
		const button = container.querySelector('#readable-action')!;
		const owner = { name: 'readable-stream-owner' };
		const handled = vi.fn();
		const root = attach();
		root.registerExternalRange(range, { owner });
		const behavior = root.registerBehavior({
			owner,
			target: '[data-action]',
			events: ['click'],
			adopt() {},
			handleEvent: handled,
		});
		await behavior.ready;

		const interaction = new MouseEvent('click', { bubbles: true });
		button.dispatchEvent(interaction);

		expect(handled).toHaveBeenCalledOnce();
		expect(handled.mock.calls[0][0]).toBe(interaction);
		expect(handled.mock.calls[0][1]).toBe(button);
		expect(container.querySelector('#server-owned-range')).toBe(range);
		expect(range.firstElementChild).toBe(button);
		expect(container.querySelector('#server-owned-live-label')?.textContent).toBe(
			'Readable stream label',
		);
	});
});
