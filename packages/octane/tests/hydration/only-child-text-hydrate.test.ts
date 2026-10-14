import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	ClassedTextBinding,
	KeyedRows,
	RenderableHole,
	TextBinding,
} from '../_fixtures/only-child-text.tsrx';
import { SpreadHost } from '../_fixtures/only-child-text-spread.tsrx';

const server = {
	...loadServerFixture('packages/octane/tests/_fixtures/only-child-text.tsrx'),
	...loadServerFixture('packages/octane/tests/_fixtures/only-child-text-spread.tsrx'),
};

afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

const cases = [
	{ name: 'TextBinding', client: TextBinding, selector: '#text', after: ['Goodbye'] },
	{ name: 'ClassedTextBinding', client: ClassedTextBinding, selector: '#text', after: ['Goodbye'] },
	{ name: 'RenderableHole', client: RenderableHole, selector: '#hole', after: ['Goodbye'] },
	{ name: 'KeyedRows', client: KeyedRows, selector: 'b, i', after: ['Goodbye1', 'Goodbye1'] },
	{ name: 'SpreadHost', client: SpreadHost, selector: '#hole', after: ['Goodbye'] },
] as const;

describe('hydrated only-child text hosts', () => {
	for (const { name, client, selector, after } of cases) {
		it(`${name} adopts server text and keeps updating through empty text`, () => {
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const { html } = ServerRT.renderToString(server[name]);
			const container = document.createElement('div');
			container.innerHTML = html;
			document.body.appendChild(container);
			const host = container.querySelector(selector)!;
			const serverText = host.firstChild;
			const root = hydrateRoot(container, client);
			flushSync(() => {});
			expect(host.firstChild).toBe(serverText);
			expect(container.querySelector(selector)).toBe(host);

			flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());

			const hosts = [...container.querySelectorAll(selector)];
			expect(hosts.map((node) => node.textContent).slice(0, after.length)).toEqual(after);
			expect(container.querySelector(selector)).toBe(host);
			expect(host.firstChild).toBe(serverText);

			flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
			expect(container.querySelector(selector)!.textContent).toBe(name === 'KeyedRows' ? '1' : '');
			flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
			expect(container.querySelector(selector)!.textContent).toBe(
				name === 'KeyedRows' ? 'Welcome back1' : 'Welcome back',
			);
			expect(container.querySelector(selector)).toBe(host);
			expect(errors).not.toHaveBeenCalled();
			root.unmount();
		});
	}
});
