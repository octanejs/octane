import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ClientRT from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { App as DevApp } from './_fixtures/prod-hooks.tsrx';

// PROD-compile-mode smoke test. Every fixture in this suite is otherwise
// compiled by the vitest plugin in SERVE mode (hmr:true → Symbol.for hook
// slots), so the production compile options (`hmr:false` → scope-local numeric
// base slots, with runtime-ranged Symbols for callable/custom-hook boundaries)
// need their own runtime coverage. The prior gap let the
// 2026-07-08 regression ship: description-less Symbol() slots collapsed the
// runtime's description-based custom-hook slot composition (resolveSlot),
// collided custom-hook state across call sites, and broke hydration on every
// website route (server compiles prod-mode in dev SSR, the browser bundle
// compiles dev-mode — the two sides rendered DIFFERENT trees).
//
// This test drives the real pairings over a custom-hook + @if fixture (the
// router-Matches shape that broke):
//   1. prod server HTML + DEV-compiled client (the website dev-SSR pairing) —
//      hydration must ADOPT (no silent rebuild), no mismatch warning.
//   2. prod server HTML + PROD-compiled client (the deployed pairing) — same,
//      AND the values must be RIGHT (catches both-sides-consistently-broken,
//      which pairing 1 alone can't see).
//   3. post-hydration interaction: the two custom-hook call sites must hold
//      independent state.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/prod-hooks.tsrx');
const SOURCE = readFileSync(FIXTURE, 'utf8');

// Compile with EXPLICIT options and execute against the given runtime
// namespace — same technique as the other hydration suites' serverModule().
function evalModule(mode: 'client' | 'server', rt: Record<string, any>): Record<string, any> {
	const from = mode === 'server' ? 'octane\\/server' : 'octane';
	let { code } = compile(SOURCE, 'prod-hooks.tsrx', { mode, hmr: false, dev: false });
	code = code.replace(
		new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*['"]${from}['"];?`, 'g'),
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export function (\w+)\(/g, '__exports.$1 = $1; function $1(');
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	const fn = new Function('__rt', '__exports', code + '\nreturn __exports;');
	return fn(rt, {});
}

const server = evalModule('server', ServerRT);
const prodClient = evalModule('client', ClientRT);

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

function ssrHtml(): string {
	return ServerRT.renderToString(server.App, {}).html;
}

describe('prod compile mode (hmr:false) — hydration smoke', () => {
	it('server render has independent custom-hook state per call site', () => {
		const html = ssrHtml();
		expect(html).toContain('a:1');
		expect(html).toContain('b:100'); // the regression rendered b:1
	});

	it('DEV-compiled client hydrates prod-server HTML by ADOPTION (the website dev pairing)', async () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			container.innerHTML = ssrHtml();
			const ssrA = container.querySelector('.a');
			const ssrB = container.querySelector('.b');
			const root = ClientRT.hydrateRoot(container, DevApp as any);
			await Promise.resolve();
			// Same NODES → adopted, not rebuilt. A mode divergence (like the
			// Symbol() regression) makes the client render a different tree and
			// replaces these elements.
			expect(container.querySelector('.a')).toBe(ssrA);
			expect(container.querySelector('.b')).toBe(ssrB);
			expect(ssrB!.textContent).toBe('b:100');
			const mismatch = errSpy.mock.calls.find((c) => String(c[0]).includes('hydration mismatch'));
			expect(mismatch).toBeUndefined();
			root.unmount();
		} finally {
			errSpy.mockRestore();
		}
	});

	it('PROD-compiled client hydrates by adoption with CORRECT values + independent state', () => {
		container.innerHTML = ssrHtml();
		const ssrA = container.querySelector('.a');
		const ssrB = container.querySelector('.b');
		const root = ClientRT.hydrateRoot(container, prodClient.App as any);
		expect(container.querySelector('.a')).toBe(ssrA);
		expect(container.querySelector('.b')).toBe(ssrB);
		expect(container.querySelector('.a')!.textContent).toBe('a:1');
		expect(container.querySelector('.b')!.textContent).toBe('b:100');

		// Interaction: bumping `a` must not touch `b` (slot-collision detector —
		// with collapsed slots the two useCounter call sites share state).
		ClientRT.flushSync(() => {
			(container.querySelector('.bump') as HTMLButtonElement).click();
		});
		expect(container.querySelector('.a')!.textContent).toBe('a:2');
		expect(container.querySelector('.b')!.textContent).toBe('b:100');
		root.unmount();
	});
});
