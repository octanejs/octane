import { loadServerFixture } from '../_server-fixture.js';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { prerender } from 'octane/static';
import { flushSync, hydrateRoot } from '../../src/index.js';
import {
	Branch,
	RejectedPending,
	RejectedThenResolved,
	Resolved,
} from './_fixtures/try-templateless-reader.tsrx';

// A template-less reader and a compiled reader share the same server error
// contract: pending boundaries render a fresh client attempt; catch-only
// boundaries pass the server error to Suspense or fail the shell.

const server = loadServerFixture(
	'packages/octane/tests/hydration/_fixtures/try-templateless-reader.tsrx',
);
const DEV = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
const pending = <T>() => new Promise<T>(() => {});

let container: HTMLElement;
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	container.remove();
	consoleError.mockRestore();
});

async function hydrate(Client: any, props: Record<string, unknown>) {
	const caught: unknown[] = [];
	const recovered: unknown[] = [];
	const root = hydrateRoot(container, Client, props, {
		onCaughtError: (error: unknown) => caught.push(error),
		onRecoverableError: (error: unknown) => recovered.push(error),
	});
	flushSync(() => {});
	// Recoverable and caught errors are published after the hydrating render.
	await new Promise((resolve) => setTimeout(resolve, 0));
	return { root, caught, recovered };
}

/** The server's hosts around the boundary and its catch arm. */
function serverNodes() {
	return {
		h1: container.querySelector('h1'),
		caught: container.querySelector('.caught'),
		button: container.querySelector('button'),
	};
}

describe('hydrateRoot — template-less use() reader rejected on the server', () => {
	it.each([
		'Rejected',
		'TemplateRejected',
		'NestedRejected',
		'Rethrown',
		'RethrownBoundary',
	] as const)('%s passes a server rejection through catch-only boundaries', async (name) => {
		await expect(prerender(server[name], { promise: Promise.reject('private') })).rejects.toBe(
			'private',
		);
	});

	it('keeps the enclosing hosts and renders from client data after a server rejection', async () => {
		container.innerHTML = (
			await prerender(
				server.RejectedPending,
				{ promise: Promise.reject('private') },
				{ onError() {} },
			)
		).html;
		const before = serverNodes();
		const waiting = container.querySelector('em');
		expect(waiting?.textContent).toBe('loading');
		expect(before.caught).toBeNull();
		const client = Promise.reject('client');
		client.catch(() => {});
		const { root, caught, recovered } = await hydrate(RejectedPending, { promise: client });
		expect(container.querySelector('h1')).toBe(before.h1);
		expect(container.querySelector('button')).toBe(before.button);
		expect(container.querySelector('.caught')?.textContent).toBe('client');
		expect(waiting?.isConnected).toBe(false);
		expect(caught).toEqual(['client']);
		// The rejected promise first suspends, so committing @pending reports the
		// server client-render marker before the rejection reaches @catch.
		expect(recovered).toHaveLength(1);
		root.unmount();
	});

	it('keeps later positional seeds aligned after a failed pending boundary', async () => {
		container.innerHTML = (
			await prerender(
				server.RejectedThenResolved,
				{
					rejected: Promise.reject('private'),
					resolved: Promise.resolve('later'),
				},
				{ onError() {} },
			)
		).html;
		const value = container.querySelector('.value')!;
		expect(value.textContent).toBe('later');
		const { root, caught, recovered } = await hydrate(RejectedThenResolved, {
			rejected: pending(),
			resolved: pending<string>(),
		});
		expect(container.querySelector('.caught')).toBeNull();
		expect((container.querySelector('b') as HTMLElement).style.display).toBe('none');
		expect(container.querySelector('.value')).toBe(value);
		expect(value.textContent).toBe('later');
		expect(container.querySelector('em')?.textContent).toBe('first loading');
		expect(caught).toEqual([]);
		expect(recovered).toHaveLength(1);
		root.unmount();
	});

	it('still adopts the reader range when the server resolved it', async () => {
		container.innerHTML = (
			await prerender(server.Resolved, { promise: Promise.resolve('ok') })
		).html;
		const body = container.querySelector('b');
		const button = container.querySelector('button');
		expect(body!.textContent).toBe('body');

		const { root, caught, recovered } = await hydrate(Resolved, { promise: pending() });

		expect(container.querySelector('b')).toBe(body);
		expect(container.querySelector('button')).toBe(button);
		expect(container.querySelector('.caught')).toBeNull();
		expect(caught).toEqual([]);
		expect(recovered).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		root.unmount();
	});

	it('renders the root on the client where the server rendered a node in place of its range', async () => {
		container.innerHTML = (await prerender(server.Branch, { server: true })).html;
		const { h1, button } = serverNodes();
		expect(container.querySelector('.server')).not.toBeNull();

		const { root, caught, recovered } = await hydrate(Branch, { server: false });

		// No boundary surrounds the mismatch, so no server node survives.
		expect(container.querySelector('.server')).toBeNull();
		expect(container.querySelector('div')!.textContent).toBe('beforeclientafter');
		expect(h1!.isConnected).toBe(false);
		expect(button!.isConnected).toBe(false);
		expect(caught).toEqual([]);
		expect(recovered).toEqual([
			expect.objectContaining({
				message: expect.stringMatching(/^Hydration failed because the server rendered HTML/),
			}),
		]);
		expect(consoleError.mock.calls.map(([message]) => message)).toEqual(
			DEV
				? [
						expect.stringContaining(
							'the client expected a component range but the server rendered <p>',
						),
					]
				: [],
		);
		root.unmount();
	});
});
