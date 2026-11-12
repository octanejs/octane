/** @jsxImportSource octane */
/**
 * `octane/data/octane`, and one store shared across a ReactCompat boundary:
 * an Octane page and a React island show the same value, the same pending
 * edit and the same rollback, because the store owns them.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as React from 'react';
import { act as octaneAct, drainPassiveEffects, flushSync } from 'octane';
import { createDataStore, type FeedFrame, type Transport } from '../../src/data/index.js';
import { mount } from '../_helpers.js';
import { createServer } from '../_data-todos.js';
import { DataPage } from './data.tsrx';
import { PagesPage } from './data-pages.tsrx';
import { FeedPage } from './data-feed.tsrx';

const environment = globalThis as typeof globalThis & {
	IS_REACT_ACT_ENVIRONMENT?: boolean | undefined;
};
const originalActEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
const dispose: (() => void)[] = [];

beforeAll(() => {
	environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
	environment.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
});
afterEach(async () => {
	await run(() => {
		for (const cleanup of dispose.splice(0)) cleanup();
	});
});

async function run(action: () => void | Promise<unknown>) {
	await octaneAct(async () => {
		await React.act(async () => {
			await action();
			flushSync(() => {});
			drainPassiveEffects();
		});
		flushSync(() => {});
		drainPassiveEffects();
	});
}

const settle = () => run(() => new Promise((resolve) => setTimeout(resolve, 0)));

/** A transport whose writes wait for `release`, so the pending state can be observed. */
function heldWrites(server: ReturnType<typeof createServer>) {
	const held: Array<() => void> = [];
	const transport: Transport = async (request, signal) => {
		if (request.kind === 'write') await new Promise<void>((resolve) => held.push(resolve));
		return server.transport(request, signal);
	};
	return { transport, release: () => held.splice(0).forEach((resolve) => resolve()) };
}

function setup(island: boolean, transport?: Transport) {
	const server = createServer();
	const store = createDataStore({ transport: transport ?? server.transport });
	let mounted!: ReturnType<typeof mount>;
	return {
		server,
		async mount() {
			await run(() => {
				mounted = mount(DataPage, { store, island });
				dispose.push(() => mounted.unmount());
			});
			await settle();
			return mounted.container;
		},
	};
}

const text = (container: Element, selector: string) =>
	container.querySelector(selector)?.textContent;

describe('octane/data/octane', () => {
	it('suspends until the first value, then renders it with one load', async () => {
		const page = setup(false);
		const container = await page.mount();

		expect(text(container, 'li span')).toBe('Tides');
		expect(text(container, '[data-octane-done]')).toBe('0');
		expect(page.server.log).toEqual(['list']);
	});

	it('shows @pending while the first load is in flight', async () => {
		const server = createServer();
		let release!: () => void;
		const page = setup(false, async (request, signal) => {
			await new Promise<void>((resolve) => (release = resolve));
			return server.transport(request, signal);
		});
		const container = await page.mount();
		expect(container.querySelector('p')?.textContent).toBe('Octane loading');
		expect(container.querySelector('ul')).toBeNull();

		await run(release);
		await settle();
		expect(text(container, 'li span')).toBe('Tides');
	});

	it('shows a failed first load in @catch', async () => {
		const page = setup(false, () => Promise.reject(new Error('offline')));
		const container = await page.mount();

		expect(text(container, '[data-octane-error]')).toBe('offline');
	});
});

describe('octane/data/octane writes in a transition', () => {
	it('shows the edit at once and keeps the transition pending until the write settles', async () => {
		const server = createServer();
		const writes = heldWrites(server);
		const page = setup(false, writes.transport);
		const container = await page.mount();
		expect(text(container, '[data-transition-toggle]')).toBe('Idle');

		// Outside act: urgent work flushes in a microtask, transition work waits for a task.
		container.querySelector<HTMLButtonElement>('[data-transition-toggle]')!.click();
		for (let turn = 0; turn < 5; turn++) await Promise.resolve();
		// The optimistic edit is urgent, as useOptimistic's is: the transition does not hold it.
		expect(text(container, '[data-octane-done]')).toBe('1');
		expect(text(container, '[data-octane-toggle]')).toBe('Mark active');
		await run(() => {});
		expect(text(container, '[data-transition-toggle]')).toBe('Saving');

		await run(writes.release);
		await settle();
		expect(text(container, '[data-transition-toggle]')).toBe('Idle');
		expect(text(container, '[data-octane-done]')).toBe('1');
	});
});

describe('one store across a ReactCompat boundary', () => {
	it('shares one load between the Octane page and the React island', async () => {
		const page = setup(true);
		const container = await page.mount();

		expect(text(container, '[data-octane-done]')).toBe('0');
		expect(text(container, '[data-react-done]')).toBe('0');
		expect(text(container, '[data-react-toggle]')).toBe('Complete');
		expect(page.server.log).toEqual(['list']);
	});

	it.each([
		['Octane', '[data-octane-toggle]'],
		['React', '[data-react-toggle]'],
	])('shows an edit from %s in both renderers before the reply', async (_, toggle) => {
		const server = createServer();
		const writes = heldWrites(server);
		const page = setup(true, writes.transport);
		const container = await page.mount();

		await run(() => container.querySelector<HTMLButtonElement>(toggle)!.click());
		expect(text(container, '[data-octane-done]')).toBe('1');
		expect(text(container, '[data-react-done]')).toBe('1');
		expect(text(container, '[data-octane-toggle]')).toBe('Mark active');
		expect(text(container, '[data-react-toggle]')).toBe('Mark active');

		await run(writes.release);
		await settle();
		expect(text(container, '[data-octane-done]')).toBe('1');
		expect(text(container, '[data-react-done]')).toBe('1');
	});

	it('rolls a refused edit back in both renderers', async () => {
		const server = createServer();
		const writes = heldWrites(server);
		const page = setup(true, writes.transport);
		const container = await page.mount();

		await run(() => container.querySelector<HTMLButtonElement>('[data-react-toggle]')!.click());
		expect(text(container, '[data-octane-done]')).toBe('1');

		// The row is deleted on the server before the write arrives, so it is refused.
		server.rows.length = 0;
		await run(writes.release);
		await settle();
		expect(text(container, '[data-octane-done]')).toBe('0');
		expect(text(container, '[data-react-done]')).toBe('0');
		expect(text(container, 'li span')).toBe('Tides');
	});
});

describe('usePages', () => {
	it('pages one list in an Octane page and its React island, which grow together', async () => {
		const server = createServer();
		server.rows.push(
			{ id: 'b', title: 'Kelp', done: false },
			{ id: 'c', title: 'Moss', done: false },
			{ id: 'd', title: 'Reef', done: false },
		);
		const store = createDataStore({ transport: server.transport });
		let mounted!: ReturnType<typeof mount>;
		await run(() => {
			mounted = mount(PagesPage, { store });
			dispose.push(() => mounted.unmount());
		});
		await settle();
		const shown = (renderer: string) =>
			[...mounted.container.querySelectorAll(`[data-${renderer}-pages] li`)].map(
				(item) => item.textContent,
			);
		const more = (renderer: string) =>
			mounted.container.querySelector<HTMLButtonElement>(`[data-${renderer}-pages] button`);
		expect(shown('octane')).toEqual(['Kelp', 'Moss']);
		expect(shown('react')).toEqual(['Kelp', 'Moss']);

		// Both renderers page the same list, so loading more in one grows both.
		await run(() => more('octane')!.click());
		await settle();
		expect(shown('octane')).toEqual(['Kelp', 'Moss', 'Reef', 'Tides']);
		expect(shown('react')).toEqual(['Kelp', 'Moss', 'Reef', 'Tides']);
		expect(more('octane')).toBeNull();
		expect(more('react')).toBeNull();
	});
});

describe('useFeed', () => {
	it('keeps an Octane page and its React island current over one connection, closed on unmount', async () => {
		const server = createServer();
		const connections: Array<{ signal: AbortSignal; send(frame: FeedFrame): void }> = [];
		const store = createDataStore({
			transport: server.transport,
			listen: (_request, signal) => ({
				async *[Symbol.asyncIterator]() {
					const queue: FeedFrame[] = [];
					let wake = () => {};
					connections.push({ signal, send: (frame) => (queue.push(frame), wake()) });
					while (!signal.aborted) {
						if (queue.length > 0) yield queue.shift()!;
						else await new Promise<void>((resolve) => (wake = resolve));
					}
				},
			}),
		});
		let mounted!: ReturnType<typeof mount>;
		await run(() => {
			mounted = mount(FeedPage, { store, island: true });
		});
		await settle();
		const shown = (renderer: string) =>
			[...mounted.container.querySelectorAll(`[data-${renderer}-feed] p`)].map(
				(item) => item.textContent,
			);
		const status = (renderer: string) =>
			mounted.container
				.querySelector(`[data-${renderer}-feed]`)
				?.getAttribute(`data-${renderer}-feed`);
		expect(connections).toHaveLength(1);
		expect(status('octane')).toBe('connecting');

		await run(() => connections[0]!.send({ event: { id: 'a', title: 'Atoll', done: false } }));
		await settle();
		expect(shown('octane')).toEqual(['Atoll']);
		expect(shown('react')).toEqual(['Atoll']);
		expect(status('octane')).toBe('live');
		expect(status('react')).toBe('live');
		expect(server.log).toEqual(['list']);

		await run(() => mounted.unmount());
		expect(connections[0]!.signal.aborted).toBe(true);
	});
});
