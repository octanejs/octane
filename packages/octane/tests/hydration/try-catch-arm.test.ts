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
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';

// Server failures use the nearest pending boundary; catch-only regions are
// client-side error handlers. Re-rendering from client data must not borrow
// seeds from a sibling, lose sibling DOM, or disable the catch reset.

const SOURCE = readFileSync(
	join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/try-catch-arm.tsrx'),
	'utf8',
);

const pending = (): Promise<string> => new Promise<string>(() => {});

describe.each([true, false])('error boundaries and failed server content (dev=%s)', (dev) => {
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

	function expectQuiet(recoverable: unknown[]): void {
		expect(recoverable).toEqual([]);
		expect(error).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	}

	it.each(['Wrapped', 'SoleRoot', 'HostBody', 'JsxBoundary'])(
		'%s reports a new client error after server success and lets the catch retry',
		async (name) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				state: { failed: false },
			}).html;
			const serverResult = container.querySelector('p')!;
			expect(serverResult.textContent).toBe('ready');
			const { root, recoverable, caught } = await hydrate(name, { state: { failed: true } });
			const button = container.querySelector('button')!;
			expect(button.textContent).toBe('failed');
			expect(serverResult.isConnected).toBe(false);
			expect(caught).toEqual(['failed']);
			expectQuiet(recoverable);
			flushSync(() => button.click());
			expect(container.querySelector('button')).toBeNull();
			expect(container.querySelector('p')!.textContent).toBe('ready');
			expectQuiet(recoverable);
			root.unmount();
		},
	);

	it.each(['Wrapped', 'SoleRoot', 'HostBody', 'JsxBoundary', 'WaitingRoot'])(
		'%s lets an unhandled server error reach the shell',
		async (name) => {
			const onError = vi.fn();
			expect(() =>
				ServerRT.renderToString(
					server[name],
					{ state: { failed: true }, promise: pending() },
					{ onError },
				),
			).toThrow('failed');
			expect(onError).toHaveBeenCalledTimes(1);
			await expect(
				prerender(server[name], { state: { failed: true }, promise: pending() }),
			).rejects.toThrow('failed');
		},
	);

	function expectRecovery(recoverable: unknown[]): void {
		expect(recoverable).toHaveLength(1);
		expect(String((recoverable[0] as Error).message)).toContain('server');
		expect(error).not.toHaveBeenCalled();
		expect(warn).not.toHaveBeenCalled();
	}

	it('a sole-root boundary keeps its server range when only the client throws', async () => {
		container.innerHTML = ServerRT.renderToString(server.SoleRoot, {
			state: { failed: false },
		}).html;

		const { root, recoverable, caught } = await hydrate('SoleRoot', { state: { failed: true } });
		expect(container.querySelector('p')).toBeNull();
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('failed');
		expect(caught).toEqual(['failed']);
		expectQuiet(recoverable);

		flushSync(() => button.click());
		expect(container.querySelector('p')!.textContent).toBe('ready');
		root.unmount();
	});

	it('a server rejection keeps its fallback, then catches only the new client rejection beside a seeded sibling', async () => {
		const onError = vi.fn();
		const serverReason = new Error('server rejected');
		const { html } = await prerender(
			server.Seeded,
			{ first: Promise.reject(serverReason), after: Promise.resolve('after') },
			{ onError },
		);
		expect(onError).toHaveBeenCalledExactlyOnceWith(serverReason);
		expect(html).not.toContain('server rejected');
		container.innerHTML = html;
		const after = container.querySelector('main > span')!;
		const fallback = container.querySelector('.server-pending')!;
		expect(fallback.textContent).toBe('loading');
		expect(after.textContent).toBe('after');
		const { root, recoverable, caught } = await hydrate('Seeded', {
			first: Promise.reject(new Error('client rejected')),
			after: pending(),
		});
		expect(fallback.isConnected).toBe(false);
		expect(container.querySelector('button')!.textContent).toBe('client rejected');
		expect(container.querySelector('main > span')).toBe(after);
		expect(caught).toEqual(['client rejected']);
		expectRecovery(recoverable);
		root.unmount();
	});

	const nestedCases: Array<[string, Record<string, string>]> = [
		['Seeded', { first: 'bad', after: 'after' }],
		['NestedResolved', { nested: 'nested', first: 'bad', after: 'after' }],
		['NestedDeep', { a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', first: 'bad', after: 'after' }],
		['NestedInnerCatch', { inner: 'bad', nested: 'nested', first: 'bad', after: 'after' }],
		['NestedRetried', { nested: 'nested', first: 'bad', after: 'after' }],
		['NestedIsland', { nested: 'nested', first: 'bad', after: 'after' }],
	];
	it.each(nestedCases)(
		'%s discards failed bodies and nested sidecars without consuming the sibling seed',
		async (name, values) => {
			const serverProps = Object.fromEntries(
				Object.entries(values).map(([key, value]) => [key, Promise.resolve(value)]),
			);
			const onError = vi.fn();
			const { html } = await prerender(server[name], serverProps, { onError });
			expect(onError).toHaveBeenCalledTimes(1);
			container.innerHTML = html;
			const outer = container.querySelector('main')!;
			const after = container.querySelector('main > span')!;
			expect(after.textContent).toBe('after');
			expect(container.querySelector('.server-pending')).not.toBeNull();
			expect(container.querySelector('button')).toBeNull();

			// Completed requests inside the abandoned server body must be read again.
			// The still-pending sibling, by contrast, must use its own successful seed.
			const clientProps = Object.fromEntries(
				Object.entries(values).map(([key, value]) => [
					key,
					key === 'after'
						? pending()
						: Promise.resolve(key === 'first' ? 'fresh' : key === 'inner' ? 'ready' : value),
				]),
			);
			const { root, recoverable, caught } = await hydrate(name, clientProps);
			expect(container.querySelector('main')).toBe(outer);
			expect(container.querySelector('main > span')).toBe(after);
			expect(container.querySelectorAll('main > span')).toHaveLength(1);
			expect(container.querySelector('.server-pending,button')).toBeNull();
			expect(container.querySelector('section')!.textContent).toContain('fresh');
			expect(caught).toEqual([]);
			expectRecovery(recoverable);
			root.unmount();
		},
	);

	it('a client catch with its own nested pending boundary reads client data while a sibling stays seeded', async () => {
		const { html } = await prerender(server.CatchArmNested, {
			nested: Promise.resolve('server unused'),
			first: Promise.resolve('bad'),
			after: Promise.resolve('after'),
		});
		container.innerHTML = html;
		const after = container.querySelector('main > span')!;
		expect(container.querySelector('.server-pending')).not.toBeNull();
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const { root, recoverable, caught } = await hydrate('CatchArmNested', {
			nested: promise,
			first: Promise.reject(new Error('new client failure')),
			after: pending(),
		});
		expect(container.querySelector('button')!.textContent).toBe('new client failure');
		expect(container.querySelector('main > span')).toBe(after);
		expect(container.querySelector('div i')!.textContent).toBe('loading');
		await act(() => resolve('new nested value'));
		expect(container.querySelector('div span')!.textContent).toBe('new nested value');
		expect(container.querySelector('main > span')).toBe(after);
		expect(caught).toEqual(['new client failure']);
		expectRecovery(recoverable);
		root.unmount();
	});

	it.each([
		['StreamedNested', { gate: 'gate', nested: 'nested', first: 'bad' }],
		['StreamedInnerCatch', { inner: 'bad', nested: 'nested', more: 'more', first: 'bad' }],
	])('%s drops nested streamed failures and rebuilds from current data', async (name, values) => {
		const gates: Array<() => void> = [];
		const props = Object.fromEntries(
			Object.entries(values).map(([key, value]) => [
				key,
				new Promise<string>((done) => gates.push(() => done(value))),
			]),
		);
		const streamed = collectReadableStream(server[name], props);
		await Promise.resolve();
		for (const open of gates) open();
		const result = await streamed;
		expect(result.errors.length).toBeGreaterThan(0);
		container.innerHTML = result.html;
		activateStreamedMarkup(container);
		const outer = container.querySelector('main')!;
		expect(container.querySelector('button')).toBeNull();
		const clientProps = Object.fromEntries(
			Object.entries(values).map(([key, value]) => [
				key,
				Promise.resolve(key === 'first' ? 'fresh' : key === 'inner' ? 'ready' : value),
			]),
		);
		const { root, recoverable, caught } = await hydrate(name, clientProps);
		expect(container.querySelector('main')).toBe(outer);
		expect(container.querySelector('section')!.textContent).toContain('fresh');
		expect(container.querySelector('button, i')).toBeNull();
		expect(caught).toEqual([]);
		expectQuiet(recoverable);
		root.unmount();
	});

	it.each(['RootSiblingStatic', 'RootSiblingComponent', 'HostSibling'])(
		'%s adopts matching success content and its sibling',
		async (name) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				state: { failed: false },
			}).html;
			const after = container.querySelector('.after')!;

			const { root, recoverable, caught } = await hydrate(name, { state: { failed: false } });
			expect(container.querySelector('.after')).toBe(after);
			expect(container.querySelectorAll('.after')).toHaveLength(1);
			expect(container.querySelectorAll('button')).toHaveLength(0);
			expect(container.querySelectorAll('p:not(.after)')).toHaveLength(1);
			expect(caught).toEqual([]);
			expectQuiet(recoverable);
			root.unmount();
		},
	);

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
			expectQuiet(recoverable);
			root.unmount();
		},
	);

	it('does not lose nested failed content when a later sibling suspends hydration', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const streamed = collectReadableStream(server.StreamedDiscarded, {
			make: () => promise,
			wait: null,
		});
		await Promise.resolve();
		resolve('bad');
		const result = await streamed;
		container.innerHTML = result.html;
		activateStreamedMarkup(container);
		const outer = container.querySelector('main')!;
		expect(container.querySelector('button')).toBeNull();

		let release!: (value: string) => void;
		const wait = new Promise<string>((done) => (release = done));
		const clientValue = Promise.resolve('client value');
		const { root, recoverable, caught } = await hydrate('StreamedDiscarded', {
			make: () => clientValue,
			wait,
		});
		expect(container.querySelector('main')).toBe(outer);
		await act(() => release('go'));
		await act(async () => {
			await new Promise((done) => setTimeout(done, 350));
		});
		expect(container.querySelector('main')).toBe(outer);
		expect(container.querySelector('p:not(.tail)')!.textContent).toBe('client value');
		expect(container.querySelector('.tail')!.textContent).toBe('tail');
		expect(container.querySelector('button,i'), container.innerHTML).toBeNull();
		expect(caught).toEqual([]);
		expectQuiet(recoverable);
		root.unmount();
	});

	it.each(['WaitingPending', 'WaitingOuterPending'])(
		'%s shows pending content while a new client request waits, then adopts only its outer server host',
		async (name) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				state: { failed: true },
				promise: pending(),
			}).html;
			const outer = container.querySelector('main')!;
			expect(container.querySelector('i')!.textContent).toBe('loading');
			expect(container.querySelector('button')).toBeNull();
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => (resolve = done));
			const { root, recoverable, caught } = await hydrate(name, {
				state: { failed: false },
				promise,
			});
			expect(container.querySelector('main')).toBe(outer);
			expect(container.querySelector('button')).toBeNull();
			expect(container.querySelector('i')!.textContent).toBe('loading');
			await act(() => resolve('done'));
			await act(async () => {
				await new Promise((done) => setTimeout(done, 350));
			});
			expect(container.querySelector('main')).toBe(outer);
			expect(container.querySelector('i')).toBeNull();
			expect(container.querySelector('p')!.textContent).toBe('done');
			expect(caught).toEqual([]);
			expectRecovery(recoverable);
			root.unmount();
		},
	);

	it('a streamed failure retries the client value and catches only a new failure', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const streamed = collectReadableStream(server.Streamed, { promise });
		await Promise.resolve();
		resolve('bad');
		const result = await streamed;
		expect(result.errors).toEqual([expect.objectContaining({ message: 'bad value' })]);
		container.innerHTML = result.html;
		activateStreamedMarkup(container);
		const outer = container.querySelector('main')!;
		expect(container.querySelector('i')!.textContent).toBe('loading');
		expect(container.querySelector('button')).toBeNull();
		const { root, recoverable, caught } = await hydrate('Streamed', {
			promise: Promise.reject(new Error('fresh error')),
		});
		expect(container.querySelector('main')).toBe(outer);
		expect(container.querySelector('button')!.textContent).toBe('fresh error');
		expect(container.querySelector('i')).toBeNull();
		expect(caught).toEqual(['fresh error']);
		expectQuiet(recoverable);
		root.unmount();
	});
});
