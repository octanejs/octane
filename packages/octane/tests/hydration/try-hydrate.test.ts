import { loadCompiledFixtureSource } from '../_server-fixture.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { Boundary } from './_fixtures/tryboundary.tsrx';

// SSR Phase 6 (M4) — @try hydration. The server resolves use(promise) and renders
// the success arm; the client adopts it and use() returns the seeded value, so the
// boundary hydrates to its resolved arm (not @pending) and is interactive.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/tryboundary.tsrx');

function serverModule(): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(FIXTURE, 'utf8'), {
		id: 'tryboundary.tsrx',
		mode: 'server',
		compileOptions: { mode: 'server' },
	});
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

		container.innerHTML = html;
		const btn = container.querySelector('#ok') as HTMLButtonElement;

		const root = hydrateRoot(container, Boundary, { promise: new Promise<string>(() => {}) });
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
