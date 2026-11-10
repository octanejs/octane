/** @jsxImportSource octane */
/**
 * `octane/data/octane`, and one store shared across a ReactCompat boundary:
 * an Octane page and a React island show the same value, the same pending
 * edit and the same rollback, because the store owns them.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as React from 'react';
import { act as octaneAct, drainPassiveEffects, flushSync } from 'octane';
import { createDataStore, type Transport } from '../../src/data/index.js';
import { mount } from '../_helpers.js';
import { createServer } from '../_data-todos.js';
import { DataPage } from './data.tsrx';

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
