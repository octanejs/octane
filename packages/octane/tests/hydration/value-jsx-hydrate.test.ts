import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { HostProp, FragProp, MapList } from './_fixtures/value-jsx.tsrx';

// Value-position JSX under SSR: React-style render-prop children that return JSX
// (`<Comp>{(data) => <span/>}</Comp>`) and `{xs.map(x => <li/>)}`. The compiler
// lowers the JSX to `createElement(...)` host descriptors; `ssrChild` serializes
// them server-side, and the client de-opt path rebuilds them on hydration.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/value-jsx.tsrx');
function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'value-jsx.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
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

describe('value-position JSX — SSR', () => {
	it('renders a render-prop child returning a host element (attrs + nested text)', async () => {
		const { html } = ServerRT.renderToString(server.HostProp);
		expect(html).toContain('<span class="lbl" data-k="v">DATA</span>');
	});

	it('renders all items of `{xs.map(x => <li/>)}`', async () => {
		const { html } = ServerRT.renderToString(server.MapList, { items: ['a', 'b', 'c'] });
		expect(html).toContain('<li class="row">a</li>');
		expect(html).toContain('<li class="row">b</li>');
		expect(html).toContain('<li class="row">c</li>');
		// Empty list renders the `<ul>` with no rows.
		const { html: empty } = ServerRT.renderToString(server.MapList, { items: [] });
		expect(empty).not.toContain('<li');
	});

	it('renders a render-prop child returning a fragment', async () => {
		const { html } = ServerRT.renderToString(server.FragProp);
		expect(html).toContain('<b>DATA</b>');
		expect(html).toContain('<i>!</i>');
	});
});

describe('value-position JSX — hydration', () => {
	it('hydrates a render-prop host element with no markup mismatch', async () => {
		const { html } = ServerRT.renderToString(server.HostProp);
		container.innerHTML = html;
		const rp = container.querySelector('#rp') as HTMLElement;
		const root = hydrateRoot(container, HostProp, {});
		flushSync(() => {});
		// The wrapping host was adopted; the rebuilt span carries the same content.
		expect(container.querySelector('#rp')).toBe(rp);
		const span = container.querySelector('#rp .lbl') as HTMLElement;
		expect(span).not.toBeNull();
		expect(span.textContent).toBe('DATA');
		expect(span.getAttribute('data-k')).toBe('v');
		root.unmount();
	});

	it('hydrates a `{xs.map(...)}` list with all items present', async () => {
		const items = ['a', 'b', 'c'];
		const { html } = ServerRT.renderToString(server.MapList, { items });
		container.innerHTML = html;
		const ul = container.querySelector('#ml') as HTMLElement;
		const root = hydrateRoot(container, MapList, { items });
		flushSync(() => {});
		expect(container.querySelector('#ml')).toBe(ul); // host adopted
		const rows = [...container.querySelectorAll('#ml .row')].map((n) => n.textContent);
		expect(rows).toEqual(['a', 'b', 'c']);
		root.unmount();
	});

	it('hydrates a render-prop fragment child', async () => {
		const { html } = ServerRT.renderToString(server.FragProp);
		container.innerHTML = html;
		const rp = container.querySelector('#rp') as HTMLElement;
		const root = hydrateRoot(container, FragProp, {});
		flushSync(() => {});
		expect(container.querySelector('#rp')).toBe(rp);
		expect(container.querySelector('#rp b')!.textContent).toBe('DATA');
		expect(container.querySelector('#rp i')!.textContent).toBe('!');
		root.unmount();
	});
});
