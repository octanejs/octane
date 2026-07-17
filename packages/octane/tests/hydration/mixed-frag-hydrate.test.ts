import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { MixedFrag } from './_fixtures/mixed-frag.tsrx';

// Regression: a MIXED multi-root fragment body — a component root (<Leaf/>) BEFORE a
// static host root (<input/>) — dropped the component's source-order `<!>` anchor on the
// client, so the static content drained first and the component appended AFTER it. That
// both reversed source order AND diverged from the server (which emits source order), so
// hydration would mis-adopt. The fix makes the client fragment-body path emit the anchor
// like the in-element mixed-children path, so the client adopts the server DOM cleanly.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/mixed-frag.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'mixed-frag.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(ServerRT, {});
}
const server = serverModule();

function stripComments(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('hydrateRoot — mixed fragment body (component root before static root)', () => {
	it('SSR emits source order, and the client adopts the server DOM (no rebuild, no mismatch)', () => {
		const { html } = ServerRT.renderToString(server.MixedFrag);
		const serverHtml = stripComments(html);
		const divIdx = serverHtml.indexOf('<div class="leaf"');
		const inputIdx = serverHtml.indexOf('<input');
		expect(divIdx).toBeGreaterThanOrEqual(0);
		expect(inputIdx).toBeGreaterThan(divIdx); // server: div BEFORE input

		container.innerHTML = html;
		// Grab the server-rendered nodes so we can prove they were ADOPTED, not rebuilt.
		const serverDiv = container.querySelector('div.leaf');
		const serverInput = container.querySelector('input');
		expect(serverDiv).not.toBeNull();

		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const root = hydrateRoot(container, MixedFrag);
		flushSync(() => {});
		const mismatch = [...errSpy.mock.calls, ...warnSpy.mock.calls].some((c) =>
			String(c[0]).toLowerCase().includes('hydrat'),
		);
		errSpy.mockRestore();
		warnSpy.mockRestore();

		expect(mismatch).toBe(false);
		// Same node objects → the server DOM was adopted in place (order preserved).
		expect(container.querySelector('div.leaf')).toBe(serverDiv);
		expect(container.querySelector('input')).toBe(serverInput);
		expect(stripComments(container.innerHTML)).toBe('<div class="leaf">A</div><input type="text">');
		root.unmount();
	});
});
