import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { Toggle, Pick } from './_fixtures/control.tsrx';

// SSR Phase 6 (M3) — @if / @switch hydration: the client adopts the server's
// taken-branch range (the branch element instance is reused, not rebuilt) and
// the branch is interactive afterward.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/control.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'control.tsrx', { mode: 'server' });
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

describe('hydrateRoot — @if (SSR Phase 6 / M3)', () => {
	it('adopts the taken branch (same element) and it stays interactive', async () => {
		const { html } = ServerRT.renderToString(server.Toggle, { on: true });
		expect(html).toContain('<button id="hit" class="on">on:0</button>');

		container.innerHTML = html;
		const btn = container.querySelector('#hit') as HTMLButtonElement;
		const root = hydrateRoot(container, Toggle, { on: true });
		flushSync(() => {});

		// The server branch element was ADOPTED (same instance), not rebuilt.
		expect(container.querySelector('#hit')).toBe(btn);
		// And its handler is live.
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('on:1');
		root.unmount();
	});

	it('returned root.render() after hydration updates in place (keeps adopted DOM + state)', async () => {
		// React-18 hydrateRoot returns a live Root: a subsequent .render() with the
		// SAME component is a normal client update against the ALREADY-hydrated block
		// (makeRoot's same-body fast path), NOT a re-hydration or a teardown+rebuild.
		// If the fast path were broken (e.g. currentBody not threaded into makeRoot),
		// this render would wipe the container and mount a fresh node — losing both
		// the adopted node identity and the client-driven count state. Asserting both
		// survive is the discriminator.
		const { html } = ServerRT.renderToString(server.Toggle, { on: true });
		container.innerHTML = html;
		const btn = container.querySelector('#hit') as HTMLButtonElement;
		const root = hydrateRoot(container, Toggle, { on: true });
		flushSync(() => {});
		flushSync(() => btn.click());
		expect(btn.textContent).toBe('on:1'); // client state on the adopted node

		root.render(Toggle, { on: true }); // same component → in-place update
		flushSync(() => {});
		expect(container.querySelector('#hit')).toBe(btn); // same node, not rebuilt
		expect(btn.textContent).toBe('on:1'); // state preserved across the re-render

		flushSync(() => btn.click()); // still interactive afterward
		expect(btn.textContent).toBe('on:2');
		root.unmount();
	});

	it('adopts the @else branch when the condition is false', async () => {
		const { html } = ServerRT.renderToString(server.Toggle, { on: false });
		expect(html).toContain('<span class="off">off</span>');
		container.innerHTML = html;
		const off = container.querySelector('.off') as HTMLElement;
		const root = hydrateRoot(container, Toggle, { on: false });
		flushSync(() => {});
		expect(container.querySelector('.off')).toBe(off); // adopted
		root.unmount();
	});
});

describe('hydrateRoot — @switch (SSR Phase 6 / M3)', () => {
	it('adopts the matched case branch', async () => {
		const { html } = ServerRT.renderToString(server.Pick, { k: 'b' });
		expect(html).toContain('<span class="b">BBB</span>');
		container.innerHTML = html;
		const span = container.querySelector('.b') as HTMLElement;
		const root = hydrateRoot(container, Pick, { k: 'b' });
		flushSync(() => {});
		expect(container.querySelector('.b')).toBe(span); // adopted, not rebuilt
		expect((container.querySelector('.b') as HTMLElement).textContent).toBe('BBB');
		root.unmount();
	});
});
