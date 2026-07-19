import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { MatchShape, StartShape } from './_fixtures/match-shape.tsrx';
import type { ResetStore } from './_fixtures/match-shape.tsrx';

// A router-Match-shaped tree (dynamic wrapper slots chosen in setup, a context
// provider, an @try catch boundary, and an @if/@else around the content) must
// survive its FIRST post-hydration re-render without remounting the subtree:
// no effect cleanup fires, component state survives, and the server-rendered
// DOM nodes keep their identity.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/match-shape.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'match-shape.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}
const server = serverModule();

function createResetStore(): ResetStore & { set: (v: number) => void } {
	let value = 0;
	const listeners = new Set<() => void>();
	return {
		subscribe(cb: () => void) {
			listeners.add(cb);
			return () => listeners.delete(cb);
		},
		get: () => value,
		set(v: number) {
			value = v;
			for (const cb of [...listeners]) cb();
		},
	};
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => container.remove());

describe('hydrateRoot — first update after hydration', () => {
	for (const withBoundaries of [false, true]) {
		const label = withBoundaries ? 'real boundaries' : 'SafeFragment passthroughs';
		it(`does not remount the wrapper chain (${label})`, () => {
			const store = createResetStore();
			const log: string[] = [];
			const props = { store, log, withBoundaries };
			container.innerHTML = ServerRT.renderToString(server.MatchShape, {
				...props,
				log: [],
			}).html;
			const serverButton = container.querySelector('.inner-button') as HTMLButtonElement;
			expect(serverButton).toBeTruthy();

			const root = hydrateRoot(container, MatchShape, props);
			flushSync(() => {});
			expect(log).toEqual(['mount:inner']);
			expect(container.querySelector('.inner-button')).toBe(serverButton);

			// Interactive state proves the hydrated instance is live.
			flushSync(() => serverButton.click());
			expect(serverButton.textContent).toBe('inner:1');

			// The first reset-key change re-renders the chain; nothing may remount.
			flushSync(() => store.set(1));
			expect(log).toEqual(['mount:inner']);
			expect(container.querySelector('.inner-button')).toBe(serverButton);
			expect(serverButton.textContent).toBe('inner:1');

			// And again — later updates must stay stable too.
			flushSync(() => store.set(2));
			expect(log).toEqual(['mount:inner']);
			expect(container.querySelector('.inner-button')).toBe(serverButton);
			root.unmount();
		});
	}

	for (const withBoundaries of [false, true]) {
		const label = withBoundaries ? 'real boundaries' : 'SafeFragment passthroughs';
		it(`does not remount the chain under a document-shell range owner (${label})`, () => {
			const store = createResetStore();
			const log: string[] = [];
			const props = { store, log, withBoundaries };
			// The server renders the whole document; the hydration container only
			// holds what the shell put inside `#__app` (the owner's range).
			const { html } = ServerRT.renderToString(server.StartShape, {
				...props,
				log: [],
				isServer: true,
			});
			const open = html.indexOf('<div id="__app">');
			const close = html.lastIndexOf('</div>');
			expect(open).toBeGreaterThanOrEqual(0);
			expect(close).toBeGreaterThan(open);
			container.innerHTML = html.slice(open + '<div id="__app">'.length, close);
			const serverButton = container.querySelector('.inner-button') as HTMLButtonElement;
			expect(serverButton).toBeTruthy();

			const root = hydrateRoot(container, StartShape, props);
			flushSync(() => {});
			expect(log).toEqual(['mount:inner']);
			expect(container.querySelector('.inner-button')).toBe(serverButton);

			flushSync(() => serverButton.click());
			expect(serverButton.textContent).toBe('inner:1');

			// First loadedAt-style change after hydration — nothing may remount.
			flushSync(() => store.set(1));
			expect(log).toEqual(['mount:inner']);
			expect(container.querySelector('.inner-button')).toBe(serverButton);
			expect(serverButton.textContent).toBe('inner:1');

			flushSync(() => store.set(2));
			expect(log).toEqual(['mount:inner']);
			expect(container.querySelector('.inner-button')).toBe(serverButton);
			root.unmount();
		});
	}
});
