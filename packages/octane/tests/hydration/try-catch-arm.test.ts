import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	collectReadableStream,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';

// OCTANE DIVERGENCE: server render errors reach the nearest authored error
// boundary. On activation the client retries the primary content in that
// boundary, without replacing the surrounding page or reporting a mismatch.

const SOURCE = readFileSync(
	join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/try-catch-arm.tsrx'),
	'utf8',
);

type Mode = 'renderToString' | 'prerender' | 'stream';
const MODES: Mode[] = ['renderToString', 'prerender', 'stream'];
const BOUNDARY_CASES = MODES.flatMap((mode) =>
	['Recovering', 'CatchInsidePending', 'JsxBoundaries'].map((name) => [name, mode] as const),
);

describe.each([true, false])('server render errors (dev=%s)', (dev) => {
	const server = loadCompiledFixtureSource(SOURCE, {
		id: 'try-catch-arm.tsrx',
		mode: 'server',
		compileOptions: { dev },
	});
	const client = loadCompiledFixtureSource(SOURCE, {
		id: 'try-catch-arm.tsrx',
		mode: 'client',
		compileOptions: { dev },
	});

	let container: HTMLElement;
	let error: MockInstance;
	let warn: MockInstance;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		error = vi.spyOn(console, 'error').mockImplementation(() => {});
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		error.mockRestore();
		warn.mockRestore();
		resetStreamRuntimeGlobals();
	});

	/** The page `name` renders on the server, with the errors it reported. */
	async function serverRender(
		name: string,
		props: Record<string, unknown>,
		mode: Mode,
	): Promise<unknown[]> {
		const errors: unknown[] = [];
		const onError = (value: unknown) => errors.push(value);
		if (mode === 'stream') {
			const result = await collectReadableStream(server[name], props, { onError });
			container.innerHTML = result.html;
			activateStreamedMarkup(container);
		} else {
			container.innerHTML =
				mode === 'prerender'
					? (await prerender(server[name], props, { onError })).html
					: ServerRT.renderToString(server[name], props, { onError }).html;
		}
		return errors;
	}

	async function hydrate(name: string, props: Record<string, unknown>) {
		const recoverable: unknown[] = [];
		const caught: string[] = [];
		let root!: ReturnType<typeof hydrateRoot>;
		await act(async () => {
			root = hydrateRoot(container, client[name], props, {
				onRecoverableError: (value) => recoverable.push(value),
				onCaughtError: (value) => caught.push((value as Error).message),
			});
		});
		return { root, recoverable, caught };
	}

	/** Waits out the Suspense retry window until `check` passes. */
	async function settle(check: () => void): Promise<void> {
		await vi.waitFor(async () => {
			await act(async () => {});
			check();
		});
	}

	it.each(BOUNDARY_CASES)(
		'%s (%s) renders the catch arm and retries successfully on activation',
		async (name, mode) => {
			const errors = await serverRender(name, { state: { failed: true } }, mode);
			expect(errors).toEqual([]);
			expect(container.querySelector('button')?.textContent).toBe('failed');
			expect(container.querySelector('i, p')).toBeNull();
			const main = container.querySelector('main')!;
			const footer = container.querySelector('footer')!;

			const { root, recoverable, caught } = await hydrate(name, { state: { failed: false } });
			expect(container.querySelector('p')!.textContent).toBe('ready');
			expect(container.querySelector('i, button')).toBeNull();
			expect(container.querySelector('main')).toBe(main);
			expect(container.querySelector('footer')).toBe(footer);
			expect(caught).toEqual([]);
			expect(recoverable).toEqual([]);
			root.unmount();
		},
	);

	it.each(BOUNDARY_CASES)(
		'%s (%s) activates a live catch arm when the client throws too',
		async (name, mode) => {
			await serverRender(name, { state: { failed: true } }, mode);
			expect(container.querySelector('button')?.textContent).toBe('failed');
			const main = container.querySelector('main')!;

			const state = { failed: true };
			const { root, recoverable, caught } = await hydrate(name, { state });
			const button = container.querySelector('button')!;
			expect(button.textContent).toBe('failed');
			expect(container.querySelector('i, p')).toBeNull();
			expect(container.querySelector('main')).toBe(main);
			expect(caught).toEqual(['failed']);
			expect(recoverable).toEqual([]);

			flushSync(() => button.click());
			expect(container.querySelector('button')).toBeNull();
			expect(container.querySelector('p')!.textContent).toBe('ready');
			root.unmount();
		},
	);

	it.each(
		MODES.flatMap((mode) => ['CatchOnly', 'JsxCatchOnly'].map((name) => [name, mode] as const)),
	)('%s (%s) renders its catch arm without a pending boundary', async (name, mode) => {
		const errors = await serverRender(name, { state: { failed: true } }, mode);
		expect(container.querySelector('button')?.textContent).toBe('failed');
		expect(errors).toEqual([]);
	});

	it('streams the catch arm when a retry throws after the shell', async () => {
		const server$ = deferred<string>();
		const streamed = collectReadableStream(server.Streamed, { promise: server$.promise });
		await Promise.resolve();
		server$.resolve('bad');
		const result = await streamed;
		expect(result.errors).toEqual([]);
		container.innerHTML = result.html;
		activateStreamedMarkup(container);
		expect(container.querySelector('button')?.textContent).toBe('bad value');
		expect(container.querySelector('i, p')).toBeNull();
		const footer = container.querySelector('footer')!;

		const client$ = deferred<string>();
		const { root, recoverable, caught } = await hydrate('Streamed', { promise: client$.promise });
		expect(container.querySelector('i')!.textContent).toBe('loading');
		expect(recoverable).toEqual([]);

		await act(async () => client$.resolve('good'));
		await settle(() => expect(container.querySelector('p')?.textContent).toBe('good'));
		expect(container.querySelector('i, button')).toBeNull();
		expect(container.querySelector('footer')).toBe(footer);
		expect(caught).toEqual([]);
		expect(recoverable).toEqual([]);
		root.unmount();
	});

	it('shows the client catch arm when a boundary that threw after the shell throws again', async () => {
		const server$ = deferred<string>();
		const streamed = collectReadableStream(server.Streamed, { promise: server$.promise });
		await Promise.resolve();
		server$.reject(new Error('server rejected'));
		const result = await streamed;
		expect(result.errors).toEqual([]);
		container.innerHTML = result.html;
		activateStreamedMarkup(container);
		expect(container.querySelector('button')?.textContent).toBe('server rejected');

		const { root, caught } = await hydrate('Streamed', { promise: Promise.resolve('bad') });
		await settle(() => expect(container.querySelector('button')?.textContent).toBe('bad value'));
		expect(container.querySelector('i, p')).toBeNull();
		expect(caught).toEqual(['bad value']);
		root.unmount();
	});

	it('a sole-root boundary keeps its server range when only the client throws', async () => {
		container.innerHTML = ServerRT.renderToString(server.SoleRoot, {
			state: { failed: false },
		}).html;

		const { root, recoverable, caught } = await hydrate('SoleRoot', { state: { failed: true } });
		expect(container.querySelector('p')).toBeNull();
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('failed');
		expect(caught).toEqual(['failed']);
		expect(recoverable).toEqual([]);
		expect(error).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();

		flushSync(() => button.click());
		expect(container.querySelector('p')!.textContent).toBe('ready');
		root.unmount();
	});

	// Only the client's try body throws, so it throws while hydrating. As in
	// React, that fails the root's hydration even though the catch arm would
	// catch it: the root renders on the client, where the catch arm catches the
	// repeated throw, and only that caught error is reported.
	it.each(['RootSiblingStatic', 'RootSiblingComponent', 'HostSibling'])(
		'%s renders the root on the client when only the client’s try body throws',
		async (name) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				state: { failed: false },
			}).html;
			const after = container.querySelector('.after')!;

			const { root, recoverable, caught } = await hydrate(name, { state: { failed: true } });
			expect(after.isConnected).toBe(false);
			expect(container.querySelectorAll('.after')).toHaveLength(1);
			expect(container.querySelectorAll('button')).toHaveLength(1);
			expect(container.querySelectorAll('p:not(.after)')).toHaveLength(0);
			expect(caught).toEqual(['failed']);
			expect(recoverable).toEqual([]);
			root.unmount();
		},
	);
});
