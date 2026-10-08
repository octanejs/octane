import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { translateTextHosts } from '../_page-translation.js';
import { loadServerFixture } from '../_server-fixture.js';
import {
	ClassedTextBinding,
	KeyedRows,
	RenderableHole,
	TextBinding,
} from '../_fixtures/translated-text.tsrx';
import { SpreadHost } from '../_fixtures/translated-text-spread.tsrx';

// A page translator usually runs after hydration, over the server's Text nodes
// the client adopted. The next update must replace the translation with the new
// message, as React's setTextContent does, rather than write a node no longer on
// the page.

const server = {
	...loadServerFixture('packages/octane/tests/_fixtures/translated-text.tsrx'),
	...loadServerFixture('packages/octane/tests/_fixtures/translated-text-spread.tsrx'),
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

describe('hydrated only-child text hosts after page translation', () => {
	for (const { name, client, selector, after } of cases) {
		it(`${name} replaces the translated server text on the next update`, () => {
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

			translateTextHosts(container, selector);
			expect(host.textContent).toMatch(/^\[fr\] /);
			flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());

			const hosts = [...container.querySelectorAll(selector)];
			expect(hosts.map((node) => node.textContent).slice(0, after.length)).toEqual(after);
			expect(container.querySelector('font')).toBe(null);
			expect(container.querySelector(selector)).toBe(host);

			// The restored host keeps updating without another translation.
			flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
			expect(container.querySelector(selector)!.textContent).toBe(name === 'KeyedRows' ? '1' : '');
			expect(errors).not.toHaveBeenCalled();
			root.unmount();
		});
	}
});
