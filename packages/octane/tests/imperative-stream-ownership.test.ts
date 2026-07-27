import { afterEach, describe, expect, it } from 'vitest';
import { createElement, createRoot, flushSync, hydrateRoot, type Root } from '../src/index.js';

const roots: Root[] = [];

function createMixedElement(version: number, showChildren = true) {
	return createElement(
		'div',
		{ class: 'mixed', 'data-version': String(version) },
		showChildren ? createElement('h3', { class: 'owned-heading' }, 'Heading ' + version) : null,
		showChildren
			? createElement('p', { class: 'owned-description' }, 'Description ' + version)
			: null,
	);
}

function mountMixedHost({ hydrate = false }: { hydrate?: boolean } = {}) {
	const container = document.createElement('div');
	document.body.append(container);
	if (hydrate) {
		container.innerHTML =
			'<div class="mixed" data-version="0">' +
			'<h3 class="owned-heading">Heading 0</h3>' +
			'<p class="owned-description">Description 0</p>' +
			'</div>';
	}
	const root = hydrate ? hydrateRoot(container, createMixedElement(0)) : createRoot(container);
	roots.push(root);

	const render = (version: number, showChildren = true) => {
		flushSync(() => {
			root.render(createMixedElement(version, showChildren));
		});
	};

	if (!hydrate) render(0);
	const host = container.querySelector('.mixed');
	if (!(host instanceof HTMLElement)) throw new Error('Expected the mixed host to mount.');

	return { container, host, render };
}

function insertExternalStream(host: HTMLElement) {
	const start = document.createProcessingInstruction('start', 'name="external-stream"');
	const end = document.createProcessingInstruction('end', '');
	const list = document.createElement('ol');
	list.className = 'external-stream';
	const item = document.createElement('li');
	const source = document.createElement('button');
	source.className = 'external-source';
	source.dataset.sourcePayload = 'initial';
	source.textContent = 'Original source';
	let clicks = 0;
	source.addEventListener('click', () => {
		clicks++;
	});
	item.append(source);
	list.append(item);
	const description = host.querySelector('.owned-description');
	if (!(description instanceof HTMLElement)) throw new Error('Expected the owned description.');
	description.before(start, list, end);

	return { clicks: () => clicks, end, list, source, start };
}

afterEach(() => {
	for (const root of roots.splice(0)) root.unmount();
	document.body.replaceChildren();
});

describe('independently streamed children inside a renderer-managed host', () => {
	it('preserves streamed node identity, boundaries, and source interactions on sibling updates', () => {
		const { host, render } = mountMixedHost();
		const stream = insertExternalStream(host);

		render(1);

		expect(host.querySelector('.owned-heading')?.textContent).toBe('Heading 1');
		expect(host.querySelector('.owned-description')?.textContent).toBe('Description 1');
		expect(host.querySelector('.external-stream')).toBe(stream.list);
		expect(host.querySelector('.external-source')).toBe(stream.source);
		expect(stream.start.isConnected).toBe(true);
		expect(stream.end.isConnected).toBe(true);

		stream.source.dataset.sourcePayload = 'updated';
		stream.source.click();
		expect(stream.source.dataset.sourcePayload).toBe('updated');
		expect(stream.clicks()).toBe(1);
	});

	it('removes renderer-owned children without removing an independent stream', () => {
		const { host, render } = mountMixedHost();
		const stream = insertExternalStream(host);

		render(1, false);

		expect(host.querySelector('.owned-heading')).toBeNull();
		expect(host.querySelector('.owned-description')).toBeNull();
		expect(host.querySelector('.external-stream')).toBe(stream.list);
		expect(host.querySelector('.external-source')).toBe(stream.source);
		expect(stream.start.isConnected).toBe(true);
		expect(stream.end.isConnected).toBe(true);
		stream.source.click();
		expect(stream.clicks()).toBe(1);
	});

	it('adopts server-rendered children before preserving subsequently streamed nodes', () => {
		const { host, render } = mountMixedHost({ hydrate: true });
		const heading = host.querySelector('.owned-heading');
		const stream = insertExternalStream(host);

		render(1);

		expect(host.querySelector('.owned-heading')).toBe(heading);
		expect(heading?.textContent).toBe('Heading 1');
		expect(host.querySelector('.owned-description')?.textContent).toBe('Description 1');
		expect(host.querySelector('.external-stream')).toBe(stream.list);
		expect(host.querySelector('.external-source')).toBe(stream.source);
		expect(stream.start.isConnected).toBe(true);
		expect(stream.end.isConnected).toBe(true);
		stream.source.click();
		expect(stream.clicks()).toBe(1);
	});
});
