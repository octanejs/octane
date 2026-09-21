import { loadCompiledFixtureSource } from '../_server-fixture.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, hydrateRoot, flushSync } from '../../src/index.js';
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

describe.each([false, true])('hydrateRoot — resolved @try siblings (dev=%s)', (dev) => {
	const source = readFileSync(
		join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/try-siblings.tsrx'),
		'utf8',
	);
	const server = loadCompiledFixtureSource(source, {
		id: 'try-siblings.tsrx',
		mode: 'server',
		compileOptions: { dev, strong: true },
	});
	const client = loadCompiledFixtureSource(source, {
		id: 'try-siblings.tsrx',
		mode: 'client',
		compileOptions: { dev, strong: true },
	});

	it.each([false, true])(
		'adopts following components and binds their events after a resolved boundary (client failure=%s)',
		(fail) => {
			container.innerHTML = ServerRT.renderToString(server.App, { fail: false }).html;
			const original = [...container.querySelectorAll('button')];
			const choose = vi.fn();
			const caught = vi.fn();
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				root = hydrateRoot(container, client.App, { fail, choose }, { onCaughtError: caught });
				flushSync(() => {});
				const buttons = [...container.querySelectorAll('button')];
				expect(buttons.map((node) => node.textContent)).toEqual([
					'before',
					fail ? 'error' : 'inside',
					'after',
					'last',
				]);
				for (const index of fail ? [0, 2, 3] : [0, 1, 2, 3]) {
					expect(buttons[index]).toBe(original[index]);
				}
				original[2].click();
				original[3].click();
				expect(choose.mock.calls).toEqual([['after'], ['last']]);
				expect(caught.mock.calls.map(([value]) => value.message)).toEqual(
					fail ? ['synthetic client failure'] : [],
				);
				expect(warn).not.toHaveBeenCalled();
				expect(error).not.toHaveBeenCalled();
			} finally {
				root?.unmount();
				warn.mockRestore();
				error.mockRestore();
			}
		},
	);

	it('keeps following SSR components interactive while the completed arm waits and retries', async () => {
		container.innerHTML = ServerRT.renderToString(server.App, { fail: false }).html;
		const original = [...container.querySelectorAll('button')];
		const choose = vi.fn();
		const caught = vi.fn();
		let resume!: () => void;
		const gate = new Promise<void>((resolve) => {
			resume = resolve;
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		const expectAdopted = () => {
			const buttons = [...container.querySelectorAll('button')];
			expect(buttons.map((node) => node.textContent)).toEqual([
				'before',
				'inside',
				'after',
				'last',
			]);
			for (const [index, button] of buttons.entries()) expect(button).toBe(original[index]);
		};
		try {
			root = hydrateRoot(
				container,
				client.App,
				{ fail: false, gate, choose },
				{ onCaughtError: caught },
			);
			await act(() => {});
			expectAdopted();
			original[2].click();
			original[3].click();
			expect(choose.mock.calls).toEqual([['after'], ['last']]);
			await act(() => resume());
			expectAdopted();
			original[2].click();
			original[3].click();
			expect(choose.mock.calls).toEqual([['after'], ['last'], ['after'], ['last']]);
			expect(caught).not.toHaveBeenCalled();
			expect(warn).not.toHaveBeenCalled();
			expect(error).not.toHaveBeenCalled();
		} finally {
			root?.unmount();
			warn.mockRestore();
			error.mockRestore();
		}
	});
});
