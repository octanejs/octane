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

// React's server never runs an error boundary. A render error, or a rejected
// use(), reports through onError and leaves the nearest Suspense boundary's
// fallback for the client, which renders that boundary afresh from client data
// and reports it through onRecoverableError. A throw there reaches the client's
// catch arm. With no Suspense boundary above it, the error fails the render.

const SOURCE = readFileSync(
	join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/try-catch-arm.tsrx'),
	'utf8',
);

type Mode = 'renderToString' | 'prerender' | 'stream';
const MODES: Mode[] = ['renderToString', 'prerender', 'stream'];
const SUSPENSE_CASES = MODES.flatMap((mode) =>
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

	function expectServerError(errors: unknown[], message: string): void {
		expect(errors).toEqual([expect.objectContaining({ message })]);
	}

	it.each(SUSPENSE_CASES)(
		'%s (%s) ships its fallback, and the client render recovers',
		async (name, mode) => {
			const errors = await serverRender(name, { state: { failed: true } }, mode);
			expectServerError(errors, 'failed');
			expect(container.querySelector('i')!.textContent).toBe('loading');
			expect(container.querySelector('button, p')).toBeNull();
			const main = container.querySelector('main')!;
			const footer = container.querySelector('footer')!;

			const { root, recoverable, caught } = await hydrate(name, { state: { failed: false } });
			expect(container.querySelector('p')!.textContent).toBe('ready');
			expect(container.querySelector('i, button')).toBeNull();
			expect(container.querySelector('main')).toBe(main);
			expect(container.querySelector('footer')).toBe(footer);
			expect(caught).toEqual([]);
			expect(recoverable).toEqual([
				expect.objectContaining({ message: expect.stringContaining('server rendering') }),
			]);
			root.unmount();
		},
	);

	it.each(SUSPENSE_CASES)(
		'%s (%s) shows the client catch arm when the client throws too',
		async (name, mode) => {
			await serverRender(name, { state: { failed: true } }, mode);
			expect(container.querySelector('i')!.textContent).toBe('loading');
			const main = container.querySelector('main')!;

			const state = { failed: true };
			const { root, recoverable, caught } = await hydrate(name, { state });
			const button = container.querySelector('button')!;
			expect(button.textContent).toBe('failed');
			expect(container.querySelector('i, p')).toBeNull();
			expect(container.querySelector('main')).toBe(main);
			// As in React, a catch arm that caught in that render reports alone.
			expect(caught).toEqual(['failed']);
			expect(recoverable).toEqual([]);

			flushSync(() => button.click());
			expect(container.querySelector('button')).toBeNull();
			expect(container.querySelector('p')!.textContent).toBe('ready');
			root.unmount();
		},
	);

	it.each(['CatchOnly', 'JsxCatchOnly'])(
		'%s fails the render: a catch arm is not a server boundary',
		async (name) => {
			const props = { state: { failed: true } };
			expect(() => ServerRT.renderToString(server[name], props)).toThrow('failed');
			await expect(prerender(server[name], props)).rejects.toThrow('failed');
			const onShellError = vi.fn();
			await expect(
				ServerRT.renderToReadableStream(server[name], props, { onShellError }),
			).rejects.toThrow('failed');
			expect(onShellError).toHaveBeenCalledWith(expect.objectContaining({ message: 'failed' }));
		},
	);

	it('marks a boundary that throws after the shell for a client render', async () => {
		const server$ = deferred<string>();
		const streamed = collectReadableStream(server.Streamed, { promise: server$.promise });
		await Promise.resolve();
		server$.resolve('bad');
		const result = await streamed;
		expectServerError(result.errors, 'bad value');
		container.innerHTML = result.html;
		activateStreamedMarkup(container);
		expect(container.querySelector('i')!.textContent).toBe('loading');
		expect(container.querySelector('button, p')).toBeNull();
		const footer = container.querySelector('footer')!;

		const client$ = deferred<string>();
		const { root, recoverable, caught } = await hydrate('Streamed', { promise: client$.promise });
		expect(container.querySelector('i')!.textContent).toBe('loading');
		expect(recoverable).toHaveLength(1);

		await act(async () => client$.resolve('good'));
		await settle(() => expect(container.querySelector('p')?.textContent).toBe('good'));
		expect(container.querySelector('i, button')).toBeNull();
		expect(container.querySelector('footer')).toBe(footer);
		expect(caught).toEqual([]);
		expect(recoverable).toHaveLength(1);
		root.unmount();
	});

	it('shows the client catch arm when a boundary that threw after the shell throws again', async () => {
		const server$ = deferred<string>();
		const streamed = collectReadableStream(server.Streamed, { promise: server$.promise });
		await Promise.resolve();
		server$.reject(new Error('server rejected'));
		const result = await streamed;
		expectServerError(result.errors, 'server rejected');
		expect(result.html).not.toContain('server rejected');
		container.innerHTML = result.html;
		activateStreamedMarkup(container);

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
