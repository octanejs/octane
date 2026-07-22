import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
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

		expect(container.querySelector('#static-sidebar')).toBe(sidebar);
		expect(container.querySelector('#static-tail')).toBe(tail);
		expect(container.querySelector('#live-sibling')).toBe(liveSibling);
		expect(onStaticRender).not.toHaveBeenCalled();

		flushSync(() => liveSibling.click());
		expect(onLiveClick).toHaveBeenCalledOnce();
		expect(onLiveClick).toHaveBeenCalledWith(liveId);
	});

	it('collapses nested permanent-static boundaries', () => {
		container.innerHTML = renderToString(server.NestedPermanentStatic).html;
		const layout = container.querySelector('#nested-static-layout')!;
		const outer = container.querySelector('#outer-static-content')!;
		const inner = container.querySelector('#inner-static-content')!;

		expect(layout.firstElementChild).toBe(outer);
		expect(outer.firstElementChild).toBe(inner);
	});

	it('preserves SVG and MathML parser namespaces', () => {
		container.innerHTML = renderToString(server.PermanentStaticForeign).html;
		const svg = container.querySelector('#static-svg')!;
		const group = container.querySelector('#static-svg-group')!;
		const math = container.querySelector('#static-math')!;
		const row = container.querySelector('#static-math-row')!;

		expect(svg.firstElementChild).toBe(group);
		expect(group.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(math.firstElementChild).toBe(row);
		expect(row.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
	});

	it('leaves externally patched descendants untouched across hydration and updates', () => {
		const onStaticRender = vi.fn();
		container.innerHTML = renderToString(server.PermanentServerOwned, {
			html: '<p id="server-owned-initial">Initial server content</p>',
			label: 'Initial label',
		}).html;
		const range = container.querySelector('#server-owned-range')!;
		const externalBefore = document.createElement('article');
		externalBefore.id = 'external-before-hydration';
		externalBefore.textContent = 'Patched before hydration';
		range.replaceChildren(externalBefore);

		root = hydrateRoot(container, client.PermanentServerOwned, {
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
			root!.render(client.PermanentServerOwned, {
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
