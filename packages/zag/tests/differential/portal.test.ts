import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Portal as ReactPortal } from '@zag-js/react';
import { describe, expect, it } from 'vitest';
import { PortalFixture } from '../_fixtures/machine.tsrx';
import { mount, nextPaint } from '../_helpers';

async function reactPortalTrace(options: {
	disabled?: boolean;
	useContainer?: boolean;
}): Promise<{ first: string | null; second: string | null; inOwner: boolean }> {
	const owner = document.createElement('div');
	document.body.append(owner);
	const container = document.createElement('div');
	if (options.useContainer !== false) {
		document.body.append(container);
	}
	const root = createRoot(owner);
	const containerRef = { current: options.useContainer === false ? null : container };

	await act(async function renderPortal() {
		root.render(
			createElement(
				ReactPortal,
				{
					container: containerRef,
					disabled: options.disabled,
				},
				createElement('span', { id: 'portalled-first' }, 'first'),
				createElement('span', { id: 'portalled-second' }, 'second'),
			),
		);
		await Promise.resolve();
	});

	const mountRoot = options.disabled
		? owner
		: options.useContainer === false
			? document.body
			: container;
	const first = mountRoot.querySelector('#portalled-first')?.textContent ?? null;
	const second = mountRoot.querySelector('#portalled-second')?.textContent ?? null;
	const inOwner = owner.querySelector('#portalled-first') !== null;

	await act(async function unmountPortal() {
		root.unmount();
	});
	owner.remove();
	container.remove();
	return { first, second, inOwner };
}

async function octanePortalTrace(options: {
	disabled?: boolean;
	useContainer?: boolean;
}): Promise<{ first: string | null; second: string | null; inOwner: boolean }> {
	const target = options.useContainer === false ? undefined : document.createElement('div');
	if (target) document.body.append(target);
	const result = mount(PortalFixture, {
		target: target === undefined ? null : target,
		disabled: options.disabled,
	});
	await nextPaint();

	const mountRoot = options.disabled
		? result.container
		: target === undefined
			? document.body
			: target;
	const first = mountRoot.querySelector('#portalled-first')?.textContent ?? null;
	const second = mountRoot.querySelector('#portalled-second')?.textContent ?? null;
	const inOwner = result.container.querySelector('#portalled-first') !== null;

	result.unmount();
	target?.remove();
	return { first, second, inOwner };
}

describe('Portal differential parity', () => {
	// @parity-case differential:portal-container
	it('matches @zag-js/react@1.42.0 when portalling into a container', async () => {
		expect(await octanePortalTrace({ useContainer: true })).toEqual(
			await reactPortalTrace({ useContainer: true }),
		);
	});

	// @parity-case differential:portal-disabled
	it('matches @zag-js/react@1.42.0 when Portal is disabled', async () => {
		expect(await octanePortalTrace({ disabled: true, useContainer: true })).toEqual(
			await reactPortalTrace({ disabled: true, useContainer: true }),
		);
	});
});
