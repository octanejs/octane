import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { AppLocal, AppDirect } from './_fixtures/children-local.tsrx';

// Children forwarded through a LOCAL const (the router-Link shape:
// `const resolved = isChildrenBlock(children) ? children : children(...)`
// rendered as `{resolved}`) must SSR as markup, byte-identical to a direct
// `{props.children}` hole, and hydrate cleanly. Regression: the server emitted
// the child's markup HTML-ESCAPED as a text node (visible raw
// `src="data:image/svg+xml,…"` text before hydration) and the element carried
// no attributes.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/children-local.tsrx',
);

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'children-local.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

const URL = "data:image/svg+xml,%3csvg%20width='442'%20height='108'%3e%3c/svg%3e";

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('SSR: children forwarded through a local const', () => {
	it('renders the child as MARKUP (not escaped text), identical to a direct hole', () => {
		const direct = ServerRT.renderToString(server.AppDirect, { url: URL }).html;
		const local = ServerRT.renderToString(server.AppLocal, { url: URL }).html;

		expect(direct).toContain('<img');
		expect(direct).toContain(`src="${URL}"`);
		// The regression: the local-const path escaped the markup into text.
		expect(local).toContain('<img');
		expect(local).toContain(`src="${URL}"`);
		expect(local).not.toContain('&lt;img');
	});

	it('hydrates the server markup without replacing the img', async () => {
		const { html } = ServerRT.renderToString(server.AppLocal, { url: URL });
		container.innerHTML = html;
		const ssrImg = container.querySelector('img');
		expect(ssrImg).toBeTruthy();
		expect(ssrImg!.getAttribute('src')).toBe(URL);

		const root = hydrateRoot(container, AppLocal, { url: URL });
		flushSync(() => {});

		// Adopted, not rebuilt — and the attribute survives.
		expect(container.querySelector('img')).toBe(ssrImg);
		expect(container.querySelector('img')!.getAttribute('src')).toBe(URL);
		root.unmount();
	});
});
