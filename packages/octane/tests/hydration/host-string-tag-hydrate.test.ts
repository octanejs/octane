import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { Doc, Overridable } from './_fixtures/host-string-tag.tsrx';

// Server-render member tags that resolve to host tag STRINGS (the MDX
// `_components.h1` shape), then hydrate with the client-compiled module: the
// server's `ssrComponent` string branch must emit the exact block shape the
// client's de-opt descriptor path adopts (no mismatch, hosts preserved).

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/host-string-tag.tsrx',
);
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'host-string-tag.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('host-string member tags — hydration', () => {
	it('hydrates a document of string member tags with the content intact', async () => {
		const props = { components: { h1: 'h1', p: 'p' }, title: 'Hello' };
		const { html } = ServerRT.renderToString(server.Doc, props);
		expect(html).toContain('<h1 class="title">Hello</h1>');
		expect(html).toContain('<p>body text</p>');

		container.innerHTML = html;
		const root = hydrateRoot(container, Doc, props);
		flushSync(() => {});
		const h1 = container.querySelector('h1') as HTMLElement;
		expect(h1).not.toBeNull();
		expect(h1.textContent).toBe('Hello');
		expect(h1.className).toBe('title');
		expect((container.querySelector('p') as HTMLElement).textContent).toBe('body text');
		root.unmount();
	});

	it('hydrates the string variant of an overridable tag site', async () => {
		const props = { useFancy: false };
		const { html } = ServerRT.renderToString(server.Overridable, props);
		expect(html).toContain('<h2>Title</h2>');

		container.innerHTML = html;
		const root = hydrateRoot(container, Overridable, props);
		flushSync(() => {});
		expect((container.querySelector('h2') as HTMLElement).textContent).toBe('Title');
		root.unmount();
	});

	it('hydrates the component variant of the same site with no mismatch', async () => {
		const props = { useFancy: true };
		const { html } = ServerRT.renderToString(server.Overridable, props);
		expect(html).toContain('<em class="fancy">Title</em>');

		container.innerHTML = html;
		const before = container.innerHTML;
		const root = hydrateRoot(container, Overridable, props);
		flushSync(() => {});
		expect(container.innerHTML).toBe(before); // component path: adopted, untouched
		root.unmount();
	});
});
