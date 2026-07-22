import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, hydrateRoot } from 'octane';
import { initializeHydrationEventCapture, interaction, load } from 'octane/hydration';
import { renderToString } from 'octane/server';
import { flushEffects } from '../_helpers.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as client from './_fixtures/deferred-hydration-static.tsrx';

const FIXTURE = 'packages/octane/tests/hydration/_fixtures/deferred-hydration-static.tsrx';
const server = loadServerFixture<typeof client>(FIXTURE);

describe('permanently static hydration ranges', () => {
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

	it('preserves direct-child DOM shape in server HTML', () => {
		container.innerHTML = renderToString(server.PermanentStaticHtml, {
			label: 'Live sibling',
		}).html;
		const layout = container.querySelector('#static-layout')!;
		const sidebar = container.querySelector('#static-sidebar')!;
		const tail = container.querySelector('#static-tail')!;
		const liveSibling = container.querySelector('#live-sibling') as HTMLButtonElement;

		expect(Array.from(layout.children)).toEqual([sidebar, tail, liveSibling]);
	});

	it('skips client evaluation and reserves IDs for a live sibling', () => {
		const onStaticRender = vi.fn();
		const onLiveClick = vi.fn();
		container.innerHTML = renderToString(server.PermanentStaticHtml, {
			label: 'Live sibling',
		}).html;
		const sidebar = container.querySelector('#static-sidebar')!;
		const tail = container.querySelector('#static-tail')!;
		const liveSibling = container.querySelector('#live-sibling') as HTMLButtonElement;
		const liveId = liveSibling.dataset.runtimeId;

		root = hydrateRoot(container, client.PermanentStaticHtml, {
			label: 'Live sibling',
			onStaticRender,
			onLiveClick,
		});
		flushSync(() => {});
		flushEffects();

		expect(Array.from(container.querySelector('#static-layout')!.children)).toEqual([
			sidebar,
			tail,
			liveSibling,
		]);
		expect(container.querySelector('#static-sidebar')).toBe(sidebar);
		expect(container.querySelector('#static-tail')).toBe(tail);
		expect(container.querySelector('#live-sibling')).toBe(liveSibling);
		expect(onStaticRender).not.toHaveBeenCalled();

		flushSync(() => liveSibling.click());
		expect(onLiveClick).toHaveBeenCalledOnce();
		expect(onLiveClick).toHaveBeenCalledWith(liveId);
	});

	it('renders no permanent-static descendants on a client-only mount', () => {
		const onStaticRender = vi.fn();
		const onLiveClick = vi.fn();
		root = createRoot(container);
		flushSync(() =>
			root!.render(client.PermanentStaticHtml, {
				label: 'Client-only live sibling',
				onStaticRender,
				onLiveClick,
			}),
		);
		flushEffects();

		const layout = container.querySelector('#static-layout')!;
		const liveSibling = container.querySelector('#live-sibling') as HTMLButtonElement;
		expect(Array.from(layout.children)).toEqual([liveSibling]);
		expect(container.querySelector('#static-sidebar')).toBeNull();
		expect(onStaticRender).not.toHaveBeenCalled();
		flushSync(() => liveSibling.click());
		expect(onLiveClick).toHaveBeenCalledOnce();
	});

	it('hydrates an empty permanent-static range without shifting its live sibling', () => {
		const onLiveClick = vi.fn();
		container.innerHTML = renderToString(server.EmptyPermanentStatic).html;
		const layout = container.querySelector('#empty-static-layout')!;
		const liveSibling = container.querySelector('#live-sibling') as HTMLButtonElement;
		const liveId = liveSibling.dataset.runtimeId;
		expect(Array.from(layout.children)).toEqual([liveSibling]);

		root = hydrateRoot(container, client.EmptyPermanentStatic, { onLiveClick });
		flushSync(() => {});
		flushEffects();

		expect(Array.from(layout.children)).toEqual([liveSibling]);
		expect(container.querySelector('#live-sibling')).toBe(liveSibling);
		flushSync(() => liveSibling.click());
		expect(onLiveClick).toHaveBeenCalledOnce();
		expect(onLiveClick).toHaveBeenCalledWith(liveId);
	});

	it('collapses nested permanent-static boundaries', () => {
		container.innerHTML = renderToString(server.NestedPermanentStatic).html;
		const layout = container.querySelector('#nested-static-layout')!;
		const outer = container.querySelector('#outer-static-content')!;
		const inner = container.querySelector('#inner-static-content')!;

		root = hydrateRoot(container, client.NestedPermanentStatic);
		flushSync(() => {});
		flushEffects();

		expect(layout.firstElementChild).toBe(outer);
		expect(container.querySelector('#outer-static-content')).toBe(outer);
		expect(outer.firstElementChild).toBe(inner);
		expect(container.querySelector('#inner-static-content')).toBe(inner);
	});

	it('keeps a cross-component nested Hydrate inert under permanent-static ownership', () => {
		const when = interaction({ events: 'click' });
		container.innerHTML = renderToString(server.PermanentStaticWithNestedHydrate, {
			Child: server.NestedInteractiveHydrate,
			when,
		}).html;
		const action = container.querySelector('#static-nested-native-action') as HTMLButtonElement;
		const nativeClick = vi.fn();
		action.addEventListener('click', nativeClick);

		initializeHydrationEventCapture(document);
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		action.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(nativeClick).toHaveBeenCalledOnce();

		root = hydrateRoot(container, client.PermanentStaticWithNestedHydrate, {
			Child: client.NestedInteractiveHydrate,
			when,
		});
		flushSync(() => {});
		flushEffects();
		expect(container.querySelector('#static-nested-native-action')).toBe(action);
	});

	it('preserves SVG and MathML parser namespaces', () => {
		container.innerHTML = renderToString(server.PermanentStaticForeign).html;
		const svg = container.querySelector('#static-svg')!;
		const group = container.querySelector('#static-svg-group')!;
		const math = container.querySelector('#static-math')!;
		const row = container.querySelector('#static-math-row')!;

		root = hydrateRoot(container, client.PermanentStaticForeign);
		flushSync(() => {});
		flushEffects();

		expect(svg.firstElementChild).toBe(group);
		expect(container.querySelector('#static-svg-group')).toBe(group);
		expect(group.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(math.firstElementChild).toBe(row);
		expect(container.querySelector('#static-math-row')).toBe(row);
		expect(row.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
	});

	it('reserves IDs inside an activating deferred boundary', () => {
		const when = load();
		const onStaticRender = vi.fn();
		const onInnerLiveClick = vi.fn();
		const onOuterLiveClick = vi.fn();
		container.innerHTML = renderToString(server.PermanentStaticInsideDeferred, { when }).html;
		const staticNavigation = container.querySelector('#static-navigation')!;
		const deferredContent = container.querySelector('#nested-deferred-content')!;
		const innerLive = deferredContent.querySelector('#live-sibling') as HTMLButtonElement;
		const outerLive = container.querySelector('#nested-deferred-static-layout')!
			.lastElementChild as HTMLButtonElement;
		const innerId = innerLive.dataset.runtimeId;
		const outerId = outerLive.dataset.runtimeId;

		root = hydrateRoot(container, client.PermanentStaticInsideDeferred, {
			when,
			onStaticRender,
			onInnerLiveClick,
			onOuterLiveClick,
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#static-navigation')).toBe(staticNavigation);
		expect(deferredContent.querySelector('#live-sibling')).toBe(innerLive);
		expect(container.querySelector('#nested-deferred-static-layout')!.lastElementChild).toBe(
			outerLive,
		);
		expect(onStaticRender).not.toHaveBeenCalled();
		flushSync(() => {
			innerLive.click();
			outerLive.click();
		});
		expect(onInnerLiveClick).toHaveBeenCalledWith(innerId);
		expect(onOuterLiveClick).toHaveBeenCalledWith(outerId);
	});

	// This protects the permanent-static range invariant; it does not establish a
	// behavior-adoption, conflict-resolution, or disposal API for external owners.
	it('leaves externally patched descendants untouched across hydration and updates', () => {
		const onStaticRender = vi.fn();
		container.innerHTML = renderToString(server.PermanentExternallyPatched, {
			html: '<p id="server-owned-initial">Initial server content</p>',
			label: 'Initial label',
		}).html;
		const range = container.querySelector('#server-owned-range')!;
		const externalBefore = document.createElement('article');
		externalBefore.id = 'external-before-hydration';
		externalBefore.textContent = 'Patched before hydration';
		range.replaceChildren(externalBefore);

		root = hydrateRoot(container, client.PermanentExternallyPatched, {
			html: '<p>Client content must not reconcile this range</p>',
			label: 'Initial label',
			onStaticRender,
		});
		flushSync(() => {});
		flushEffects();

		expect(container.querySelector('#server-owned-range')).toBe(range);
		expect(container.querySelector('#external-before-hydration')).toBe(externalBefore);
		expect(onStaticRender).not.toHaveBeenCalled();

		const externalAfter = document.createElement('span');
		externalAfter.id = 'external-after-hydration';
		externalAfter.textContent = 'Patched after hydration';
		range.appendChild(externalAfter);
		flushSync(() =>
			root!.render(client.PermanentExternallyPatched, {
				html: '<p>Updated client content must still not reconcile this range</p>',
				label: 'Updated label',
				onStaticRender,
			}),
		);
		flushEffects();

		expect(container.querySelector('#server-owned-range')).toBe(range);
		expect(container.querySelector('#external-before-hydration')).toBe(externalBefore);
		expect(container.querySelector('#external-after-hydration')).toBe(externalAfter);
		expect(container.querySelector('#server-owned-live-label')?.textContent).toBe('Updated label');
		expect(onStaticRender).not.toHaveBeenCalled();
	});
});
