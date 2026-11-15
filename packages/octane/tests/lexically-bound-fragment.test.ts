import { expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import {
	GenuineFragmentImports,
	LocalFragment,
	ShadowedFragmentImports,
} from './_fixtures/lexically-bound-fragment.tsrx';
import { mount } from './_helpers.js';
import { loadServerFixture } from './_server-fixture.js';

it('renders a local component named Fragment without rendering its ignored children', () => {
	const view = mount(LocalFragment, { label: 'Count' });
	try {
		expect(view.find('button').textContent).toBe('Count: 0');
	} finally {
		view.unmount();
	}
});

it('server-renders a local Fragment component that hydrates and retains its state', () => {
	const server = loadServerFixture<{ LocalFragment: typeof LocalFragment }>(
		'packages/octane/tests/_fixtures/lexically-bound-fragment.tsrx',
	);
	const props = { label: 'Count' };
	const { html } = renderToString(server.LocalFragment, props);
	const container = document.createElement('div');
	container.innerHTML = html;
	const button = container.querySelector('button')!;
	expect(button.textContent).toBe('Count: 0');

	document.body.append(container);
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, LocalFragment, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	try {
		flushSync(() => button.click());
		expect(button.textContent).toBe('Count: 1');
		flushSync(() => root.render(LocalFragment, { label: 'Total' }));
		expect(container.querySelector('button')).toBe(button);
		expect(button.textContent).toBe('Total: 1');
		expect(recoverable).toEqual([]);
	} finally {
		root.unmount();
		container.remove();
	}
});

it('hydrates fragment imports shadowed by declarations inside a setup branch', () => {
	const props = { label: 'Count' };
	const server = loadServerFixture<{ ShadowedFragmentImports: typeof ShadowedFragmentImports }>(
		'packages/octane/tests/_fixtures/lexically-bound-fragment.tsrx',
	);
	const { html } = renderToString(server.ShadowedFragmentImports, props);
	const container = document.createElement('div');
	container.innerHTML = html;
	const buttons = Array.from(container.querySelectorAll('button'));
	expect(buttons.map((button) => button.textContent)).toEqual(['Count: 0', 'Count: 0']);

	document.body.append(container);
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, ShadowedFragmentImports, props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	try {
		flushSync(() => buttons[0]!.click());
		expect(Array.from(container.querySelectorAll('button'))).toEqual(buttons);
		expect(buttons.map((button) => button.textContent)).toEqual(['Count: 1', 'Count: 0']);
		expect(recoverable).toEqual([]);
	} finally {
		root.unmount();
		container.remove();
	}
});

it('renders the children of genuine named and namespace fragments', () => {
	const view = mount(GenuineFragmentImports);
	try {
		expect(Array.from(view.container.querySelectorAll('p'), (node) => node.textContent)).toEqual([
			'named fragment',
			'namespace fragment',
		]);
	} finally {
		view.unmount();
	}
});
