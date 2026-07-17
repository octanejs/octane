import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { Boundary } from './_fixtures/tryboundary.tsrx';

// SSR Phase 6 (M4) — @try hydration. The server resolves use(promise) and renders
// the success arm; the client adopts it and use() returns the seeded value, so the
// boundary hydrates to its resolved arm (not @pending) and is interactive.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/tryboundary.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'tryboundary.tsrx', { mode: 'server' });
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

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('hydrateRoot — @try success arm (SSR Phase 6 / M4)', () => {
	it('adopts the resolved success arm (use seeded) and it is interactive', async () => {
		const { html } = await prerender(server.Boundary, { promise: Promise.resolve('hi') });
		// Server resolved use() → success arm in a block range + a seed <script>.
		expect(html).toContain('<button id="ok" class="ok">hi:0</button>');
		expect(html).toContain('data-octane-suspense>["hi"]</script>');

		container.innerHTML = html;
		const btn = container.querySelector('#ok') as HTMLButtonElement;

		const root = hydrateRoot(container, Boundary, { promise: Promise.resolve('hi') });
		flushSync(() => {});

		// The success-arm button was ADOPTED (no re-suspend, no rebuild).
		expect(container.querySelector('#ok')).toBe(btn);
		expect(container.querySelector('.loading')).toBeNull(); // not the @pending arm
		expect(btn.textContent).toBe('hi:0');

		// …and it's interactive (useState in the try body works).
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('hi:1');
		root.unmount();
	});
});
