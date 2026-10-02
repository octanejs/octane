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

// The server rendered a boundary's @catch arm because its try body threw, and
// the client's try body throws again while hydrating. Without a record of which
// arm the server rendered, the client claimed the catch DOM for the try body:
// a try body that renders a host first mismatched against the catch arm, and a
// sole-root boundary's rebuilt catch arm left the root's tail unclaimed.

const SOURCE = readFileSync(
	join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/try-catch-arm.tsrx'),
	'utf8',
);

const pending = (): Promise<string> => new Promise<string>(() => {});

describe.each([true, false])('hydrating a server-rendered @catch arm (dev=%s)', (dev) => {
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
		'%s adopts the catch arm and retries into the try body',
		async (name) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				state: { failed: true },
			}).html;
			const button = container.querySelector('button')!;
			expect(button.textContent).toBe('failed');

			const { root, recoverable, caught } = await hydrate(name, { state: { failed: true } });
			expect(container.querySelector('button')).toBe(button);
			expect(container.querySelector('p')).toBeNull();
			expect(caught).toEqual(['failed']);
			expectQuiet(recoverable);

			flushSync(() => button.click());
			expect(container.querySelector('button')).toBeNull();
			expect(container.querySelector('p')!.textContent).toBe('ready');
			expectQuiet(recoverable);
			root.unmount();
		},
	);

	it.each(['SoleRoot', 'HostBody', 'JsxBoundary'])(
		'%s renders the try body when only the server threw',
		async (name) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				state: { failed: true },
			}).html;

			const { root, recoverable, caught } = await hydrate(name, { state: { failed: false } });
			expect(container.querySelector('button')).toBeNull();
			expect(container.querySelectorAll('p')).toHaveLength(1);
			expect(container.querySelector('p')!.textContent).toBe('ready');
			expect(caught).toEqual([]);
			expectQuiet(recoverable);
			root.unmount();
		},
	);

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

	it('adopts the arm caught from a seeded rejection beneath a host', async () => {
		const rejected = Promise.reject(new Error('rejected'));
		const { html } = await prerender(server.Seeded, {
			first: rejected,
			after: Promise.resolve('after'),
		});
		container.innerHTML = html;
		const button = container.querySelector('button')!;
		const after = container.querySelector('span')!;
		expect(button.textContent).toBe('rejected');

		const { root, recoverable } = await hydrate('Seeded', {
			first: pending(),
			after: pending(),
		});
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('section')).toBeNull();
		expect(container.querySelector('span')).toBe(after);
		expect(after.textContent).toBe('after');
		expectQuiet(recoverable);
		root.unmount();
	});

	it('replays the seeds the server read before throwing', async () => {
		const { html } = await prerender(server.Seeded, {
			first: Promise.resolve('bad'),
			after: Promise.resolve('after'),
		});
		container.innerHTML = html;
		const button = container.querySelector('button')!;
		const after = container.querySelector('span')!;
		expect(button.textContent).toBe('bad value');
		expect(after.textContent).toBe('after');

		const { root, recoverable, caught } = await hydrate('Seeded', {
			first: pending(),
			after: pending(),
		});
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('section')).toBeNull();
		expect(container.querySelector('span')).toBe(after);
		expect(after.textContent).toBe('after');
		expect(caught).toEqual(['bad value']);
		expectQuiet(recoverable);
		root.unmount();
	});

	it('replays the seeds of a nested boundary the server resolved before throwing', async () => {
		const { html } = await prerender(server.NestedResolved, {
			nested: Promise.resolve('nested'),
			first: Promise.resolve('bad'),
			after: Promise.resolve('after'),
		});
		container.innerHTML = html;
		const button = container.querySelector('button')!;
		const after = container.querySelector('span')!;
		expect(button.textContent).toBe('bad value');
		expect(after.textContent).toBe('after');

		const { root, recoverable, caught } = await hydrate('NestedResolved', {
			nested: pending(),
			first: pending(),
			after: pending(),
		});
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('section')).toBeNull();
		expect(container.querySelector('i')).toBeNull();
		expect(container.querySelectorAll('span')).toHaveLength(1);
		expect(container.querySelector('span')).toBe(after);
		expect(after.textContent).toBe('after');
		expect(caught).toEqual(['bad value']);
		expectQuiet(recoverable);
		root.unmount();
	});

	const nestedCases: Array<[string, Record<string, string>]> = [
		['NestedDeep', { a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', first: 'bad', after: 'after' }],
		['NestedInnerCatch', { inner: 'bad', nested: 'nested', first: 'bad', after: 'after' }],
		['NestedRetried', { nested: 'nested', first: 'bad', after: 'after' }],
		['NestedIsland', { nested: 'nested', first: 'bad', after: 'after' }],
	];
	it.each(nestedCases)(
		'%s replays every nested seed run ahead of the catch arm',
		async (name, values) => {
			const resolved = Object.fromEntries(
				Object.entries(values).map(([key, value]) => [key, Promise.resolve(value)]),
			);
			const { html } = await prerender(server[name], resolved);
			container.innerHTML = html;
			const button = container.querySelector('button')!;
			const after = container.querySelector('span')!;
			expect(button.textContent).toBe('bad value');
			expect(after.textContent).toBe('after');

			const waiting = Object.fromEntries(Object.keys(values).map((key) => [key, pending()]));
			const { root, recoverable, caught } = await hydrate(name, waiting);
			expect(container.querySelector('button')).toBe(button);
			expect(container.querySelector('section')).toBeNull();
			expect(container.querySelectorAll('span')).toHaveLength(1);
			expect(container.querySelector('span')).toBe(after);
			expect(caught).toEqual(['bad value']);
			expectQuiet(recoverable);
			root.unmount();
		},
	);

	it("keeps the sidecar of the catch arm's own resolved boundary", async () => {
		const { html } = await prerender(server.CatchArmNested, {
			nested: Promise.resolve('nested'),
			first: Promise.resolve('bad'),
			after: Promise.resolve('after'),
		});
		container.innerHTML = html;
		const button = container.querySelector('button')!;
		const [nested, after] = container.querySelectorAll('span');
		expect(nested.textContent).toBe('nested');

		const { root, recoverable, caught } = await hydrate('CatchArmNested', {
			nested: pending(),
			first: pending(),
			after: pending(),
		});
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('i')).toBeNull();
		expect([...container.querySelectorAll('span')]).toEqual([nested, after]);
		expect(after.textContent).toBe('after');
		expect(caught).toEqual(['bad value']);
		expectQuiet(recoverable);
		root.unmount();
	});

	it.each([
		['StreamedNested', { gate: 'gate', nested: 'nested', first: 'bad' }],
		['StreamedInnerCatch', { inner: 'bad', nested: 'nested', more: 'more', first: 'bad' }],
	])('%s replays a streamed nested boundary inside a streamed catch arm', async (name, values) => {
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
		container.innerHTML = (await streamed).html;
		activateStreamedMarkup(container);
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('bad value');

		const waiting = Object.fromEntries(Object.keys(values).map((key) => [key, pending()]));
		const { root, recoverable, caught } = await hydrate(name, waiting);
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('i')).toBeNull();
		expect(container.querySelector('section')).toBeNull();
		expect(caught).toEqual(['bad value']);
		expectQuiet(recoverable);
		root.unmount();
	});

	it.each(
		['RootSiblingStatic', 'RootSiblingComponent', 'HostSibling'].flatMap((name) => [
			[name, true, false],
			[name, false, true],
		]),
	)(
		'%s keeps its sibling when the slot rebuilds (server threw: %s)',
		async (name, server_, client_) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				state: { failed: server_ },
			}).html;
			const after = container.querySelector('.after')!;

			const { root, recoverable } = await hydrate(name, { state: { failed: client_ } });
			expect(container.querySelector('.after')).toBe(after);
			expect(container.querySelectorAll('.after')).toHaveLength(1);
			expect(container.querySelectorAll('button')).toHaveLength(client_ ? 1 : 0);
			expect(container.querySelectorAll('p:not(.after)')).toHaveLength(client_ ? 0 : 1);
			expectQuiet(recoverable);
			root.unmount();
		},
	);

	it('keeps a streamed catch arm through a discarded hydration attempt', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const streamed = collectReadableStream(server.StreamedDiscarded, {
			make: () => promise,
			wait: null,
		});
		await Promise.resolve();
		resolve('bad');
		container.innerHTML = (await streamed).html;
		activateStreamedMarkup(container);
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('bad value');

		let release!: (value: string) => void;
		const wait = new Promise<string>((done) => {
			release = done;
		});
		const { root, recoverable, caught } = await hydrate('StreamedDiscarded', {
			make: pending,
			wait,
		});
		expect(container.querySelector('button')).toBe(button);

		await act(async () => release('go'));
		await act(async () => {
			await new Promise((done) => setTimeout(done, 350));
		});
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('i')).toBeNull();
		expect(container.querySelector('.tail')!.textContent).toBe('tail');
		expect(caught.every((message) => message === 'bad value')).toBe(true);
		expectQuiet(recoverable);
		root.unmount();
	});

	it('shows its fallback when the client body waits where the server threw', async () => {
		container.innerHTML = ServerRT.renderToString(server.WaitingPending, {
			state: { failed: true },
			promise: pending(),
		}).html;
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});

		const { root, recoverable, caught } = await hydrate('WaitingPending', {
			state: { failed: false },
			promise,
		});
		expect(container.querySelector('button')).toBeNull();
		expect(container.querySelector('i')!.textContent).toBe('loading');

		await act(async () => resolve('done'));
		await act(async () => {
			await new Promise((done) => setTimeout(done, 350));
		});
		expect(container.querySelector('i')).toBeNull();
		expect(container.querySelector('p')!.textContent).toBe('done');
		expect(caught).toEqual([]);
		expectQuiet(recoverable);
		root.unmount();
	});

	it.each(['WaitingOuterPending', 'WaitingRoot'])(
		'%s keeps the server catch arm while a retried hydration waits for client data',
		async (name) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				state: { failed: true },
				promise: pending(),
			}).html;
			const button = container.querySelector('button')!;
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => {
				resolve = done;
			});

			const { root, recoverable, caught } = await hydrate(name, {
				state: { failed: false },
				promise,
			});
			expect(container.querySelector('button')).toBe(button);
			expect(container.querySelector('section')).toBeNull();

			await act(async () => resolve('done'));
			await act(async () => {
				await new Promise((done) => setTimeout(done, 350));
			});
			expect(container.querySelector('button')).toBeNull();
			expect(container.querySelectorAll('p')).toHaveLength(1);
			expect(container.querySelector('p')!.textContent).toBe('done');
			expect(caught).toEqual([]);
			expectQuiet(recoverable);
			root.unmount();
		},
	);

	it('adopts a streamed catch arm', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const streamed = collectReadableStream(server.Streamed, { promise });
		await Promise.resolve();
		resolve('bad');
		container.innerHTML = (await streamed).html;
		activateStreamedMarkup(container);
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('bad value');

		const { root, recoverable, caught } = await hydrate('Streamed', { promise: pending() });
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('i')).toBeNull();
		expect(container.querySelector('section')).toBeNull();
		expect(caught).toEqual(['bad value']);
		expectQuiet(recoverable);
		root.unmount();
	});
});
