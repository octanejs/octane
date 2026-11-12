import { expect, it, vi } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { mount } from './_helpers';
import { loadServerFixture } from './_server-fixture.js';
import { InitialValue } from './_fixtures/initial-value.tsrx';

it('retains the initial snapshot when the factory changes and initializes on remount', () => {
	const factory = vi.fn(() => undefined);
	const replacement = vi.fn(() => ({ label: 'replacement' }));
	const view = mount(InitialValue, { factory });
	try {
		expect(view.find('p').textContent).toBe('empty');
		view.update(InitialValue, { factory: replacement });
		expect(view.find('p').textContent).toBe('empty');
		expect(factory).toHaveBeenCalledTimes(1);
		expect(replacement).not.toHaveBeenCalled();
	} finally {
		view.unmount();
	}

	const remounted = mount(InitialValue, { factory: replacement });
	try {
		expect(remounted.find('p').textContent).toBe('replacement');
	} finally {
		remounted.unmount();
	}
});

it('hydrates the server node with the same initial snapshot', () => {
	const server = loadServerFixture('packages/octane/tests/_fixtures/initial-value.tsrx');
	const props = { factory: vi.fn(() => ({ label: 'initial' })) };
	const container = document.createElement('div');
	document.body.append(container);
	container.innerHTML = renderToString(server.InitialValue, props).html;
	const paragraph = container.querySelector('p');
	const root = hydrateRoot(container, InitialValue, props);
	try {
		flushSync(() => {});
		expect(container.querySelector('p')).toBe(paragraph);
		expect(container.textContent).toBe('initial');
		expect(props.factory).toHaveBeenCalledTimes(2);
	} finally {
		root.unmount();
		container.remove();
	}
});
