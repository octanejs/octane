import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { injectStyle } from '../src/index.js';
import * as RT from 'octane/server';
import { prerender } from 'octane/static';

// SSR Phase 3 — control flow (@if/@for/@switch/@try) + component children +
// portals emitted to HTML strings with block markers, plus scoped-CSS de-dup.

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(RT, {});
}
const m = evalServer(readFileSync(join(FIXTURES, 'ssr-control.tsrx'), 'utf8'), 'ssr-control.tsrx');

const OPEN = '<!--[-->';
const CLOSE = '<!--]-->';
const FOR_EMPTY_OPEN = '<!--[f0-->';
const FOR_ITEMS_OPEN = '<!--[f1-->';

describe('SSR Phase 3 — control flow with block markers', () => {
	it('@if / @else renders the chosen branch wrapped in markers', async () => {
		// Nested ranges: outer = if-slot, inner = the taken branch (so the client
		// adopts both on hydration with no inserted markers — byte-for-byte).
		expect((await RT.renderToString(m.IfElse, { on: true })).html).toBe(
			`<div>${OPEN}${OPEN}<span class="yes">on</span>${CLOSE}${CLOSE}</div>`,
		);
		expect((await RT.renderToString(m.IfElse, { on: false })).html).toBe(
			`<div>${OPEN}${OPEN}<span class="no">off</span>${CLOSE}${CLOSE}</div>`,
		);
	});

	it('@for uses direct host roots as item boundaries; @empty still uses the list range', async () => {
		expect((await RT.renderToString(m.List, { items: ['a', 'b'] })).html).toBe(
			`<ul>${FOR_ITEMS_OPEN}<li>a</li><li>b</li>${CLOSE}</ul>`,
		);
		expect((await RT.renderToString(m.List, { items: [] })).html).toBe(
			`<ul>${FOR_EMPTY_OPEN}<li class="empty">none</li>${CLOSE}</ul>`,
		);
	});

	it('@for server code accumulates directly without a mapped string array', () => {
		const source = readFileSync(join(FIXTURES, 'ssr-control.tsrx'), 'utf8');
		const code = compile(source, 'ssr-control.tsrx', { mode: 'server' }).code;
		expect(code).toContain('for (let __i = 0; __i < __items.length; __i++)');
		expect(code).toContain('__html += __sitem');
		expect(code).not.toContain('__items.map(');
		expect(code).not.toContain(".join('')");
		expect(code).not.toContain('() => _$ssrBlock(__sitem');
	});

	it('@for retains per-item async identity when an item can suspend', () => {
		const source = `
			import { use } from 'octane';
			export function List(props) @{
				<ul>
					@for (const item of props.items; key item.id) {
						<li>{use(item.value) as string}</li>
					}
				</ul>
			}
		`;
		const code = compile(source, 'suspending-list.tsrx', { mode: 'server' }).code;
		expect(code).toContain('__html += _$ssrArm');
	});

	it('@for retains per-item pairs for multi-root item bodies', () => {
		const source = `
			export function List(props) @{
				<div>
					@for (const item of props.items; key item) {
						<><span>{item as string}</span><b>!</b></>
					}
				</div>
			}
		`;
		const code = compile(source, 'multi-root-list.tsrx', { mode: 'server' }).code;
		expect(code).toContain('__html += _$ssrBlock(__sitem');
	});

	it('@switch picks the matching case (or default)', async () => {
		// Nested ranges: outer = switch-slot, inner = the matched case.
		expect((await RT.renderToString(m.Switch, { k: 'a' })).html).toBe(
			`<div>${OPEN}${OPEN}<span>A</span>${CLOSE}${CLOSE}</div>`,
		);
		expect((await RT.renderToString(m.Switch, { k: 'b' })).html).toBe(
			`<div>${OPEN}${OPEN}<span>B</span>${CLOSE}${CLOSE}</div>`,
		);
		expect((await RT.renderToString(m.Switch, { k: 'z' })).html).toBe(
			`<div>${OPEN}${OPEN}<span>?</span>${CLOSE}${CLOSE}</div>`,
		);
	});

	it('@try renders the resolved success arm (awaiting use), @catch on error', async () => {
		// Nested ranges: outer = try-slot, inner = the resolved arm. Sync body →
		// success arm, no suspension, no seed script.
		expect((await RT.renderToString(m.Boundary, { read: () => 'hi' })).html).toBe(
			`<div>${OPEN}${OPEN}<span class="ok">hi</span>${CLOSE}${CLOSE}</div>`,
		);
		// use(thenable): prerender awaits it and re-renders the SUCCESS arm (Phase 4,
		// not the @pending fallback), appending the resolved value as an inline seed
		// <script> for the client to adopt on hydration.
		const resolved = await prerender(m.Boundary, { read: () => RT.use(Promise.resolve('x')) });
		expect(resolved.html).toBe(
			`<div>${OPEN}${OPEN}<span class="ok">x</span>${CLOSE}${CLOSE}</div>` +
				`<script type="application/json" data-octane-suspense>["x"]</script>`,
		);
		// A thrown error renders the @catch arm with the error.
		const caught = (
			await RT.renderToString(m.Boundary, {
				read: () => {
					throw new Error('boom');
				},
			})
		).html;
		expect(caught).toBe(`<div>${OPEN}${OPEN}<span class="error">boom</span>${CLOSE}${CLOSE}</div>`);
	});

	it('@catch exposes a callable server reset function', async () => {
		const boundary = evalServer(
			`
				export function Boundary() @{
					@try {
						throw new Error('boom');
						<span>{'unreachable'}</span>
					} @catch (error, reset) {
						reset();
						<span data-reset={typeof reset}>{error.message as string}</span>
					}
				}
			`,
			'ssr-catch-reset.tsrx',
		);

		expect((await RT.renderToString(boundary.Boundary)).html).toBe(
			`${OPEN}${OPEN}<span data-reset="function">boom</span>${CLOSE}${CLOSE}`,
		);
	});
});

describe('SSR Phase 3 — component children (context Provider)', () => {
	it('a Provider renders its children, which read the provided context value', async () => {
		expect((await RT.renderToString(m.Provided, { theme: 'dark' })).html).toContain(
			'<span class="theme">dark</span>',
		);
		expect((await RT.renderToString(m.Provided, { theme: 'light' })).html).toContain(
			'<span class="theme">light</span>',
		);
	});
});

describe('SSR Phase 3 — portals', () => {
	it('emits a site marker for a portal and renders sibling content inline', async () => {
		const body = (await RT.renderToString(m.WithPortal)).html;
		expect(body).toBe('<div id="host"><!----><span>inline</span></div>');
	});
});

describe('SSR Phase 3 — scoped CSS across the boundary', () => {
	it('server css output is tagged <style data-octane="hash"> tags', async () => {
		const ssr = evalServer(readFileSync(join(FIXTURES, 'ssr.tsrx'), 'utf8'), 'ssr.tsrx');
		const { css, html } = await RT.renderToString(ssr.Scoped);
		expect(css).toMatch(/^<style data-octane="tsrx-[0-9a-f]+">.*<\/style>$/s);
		// The hash on the body class matches the css tag's hash.
		const hash = css.match(/data-octane="(tsrx-[0-9a-f]+)"/)![1];
		expect(html).toContain(`class="box ${hash}"`);
	});

	it('client injectStyle skips re-injection when the hash is already in the DOM', () => {
		// Simulate the server-emitted <style> already present on the page.
		const head = document.head;
		const existing = document.createElement('style');
		existing.setAttribute('data-octane', 'tsrx-dedup');
		existing.textContent = '.x.tsrx-dedup{color:red}';
		head.appendChild(existing);

		injectStyle('tsrx-dedup', '.x.tsrx-dedup{color:red}');

		expect(head.querySelectorAll('style[data-octane="tsrx-dedup"]').length).toBe(1);
		existing.remove();
	});
});
