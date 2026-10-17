import { loadServerFixture } from '../_server-fixture.js';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { prerender } from 'octane/static';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import {
	Branch,
	RejectedPending,
	RejectedThenResolved,
	Resolved,
} from './_fixtures/try-templateless-reader.tsrx';

// A template-less component (no `@{}` body) claims a server component range
// when it hydrates. A use() that rejected on the server renders the nearest
// catch arm. A body that renders where the server rendered something else is a
// mismatch, which with no Suspense boundary around it renders the root on the
// client.
// Recoverable errors publish in dev and prod; console diagnostics in dev only.

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
		['is the sole try child', 'Rejected', 'x'],
		['is a template reader (control)', 'TemplateRejected', 'x'],
		['is rendered by another template-less component', 'NestedRejected', 'x'],
		['sits under an inner @catch that rethrows', 'Rethrown', 'Error: inner:x'],
		['sits under an inner ErrorBoundary that rethrows', 'RethrownBoundary', 'Error: inner:x'],
	] as const)('renders the nearest catch arm for a reader that %s', async (_, name, expected) => {
		container.innerHTML = (await prerender(server[name], { promise: Promise.reject('x') })).html;
		expect(container.querySelector('.caught')?.textContent).toBe(expected);
		expect(container.querySelector('h1')?.textContent).toBe('before');
		expect(container.querySelector('button')?.textContent).toBe('after');
	});

	it.each([
		['resolves', () => Promise.resolve('client'), [], ''],
		['rejects too', () => Promise.reject('y'), ['y'], 'y'],
	] as const)(
		'retries a caught boundary whose reader the client %s, keeping its hosts',
		async (_, read, expectedCaught, caughtText) => {
			const promise = read();
			promise.catch(() => {});
			container.innerHTML = (
				await prerender(server.RejectedPending, { promise: Promise.reject('x') })
			).html;
			const before = serverNodes();
			expect(before.caught?.textContent).toBe('x');
			expect(container.querySelector('em')).toBeNull();

			const { root, caught, recovered } = await hydrate(RejectedPending, { promise });
			await vi.waitFor(async () => {
				await act(async () => {});
				expect(container.querySelector('em')).toBeNull();
			});

			expect(container.querySelector('h1')).toBe(before.h1);
			expect(container.querySelector('button')).toBe(before.button);
			expect(container.querySelector('.caught')?.textContent ?? '').toBe(caughtText);
			expect(caught).toEqual(expectedCaught);
			expect(recovered).toEqual([]);
			expect(consoleError).not.toHaveBeenCalled();
			root.unmount();
		},
	);

	it('keeps later positional seeds aligned after a client-rendered boundary', async () => {
		container.innerHTML = (
			await prerender(server.RejectedThenResolved, {
				rejected: Promise.reject('x'),
				resolved: Promise.resolve('later'),
			})
		).html;
		const value = container.querySelector('.value');
		expect(value!.textContent).toBe('later');

		const { root, caught, recovered } = await hydrate(RejectedThenResolved, {
			rejected: pending(),
			resolved: pending<string>(),
		});

		expect(container.querySelector('em')!.textContent).toBe('loading');
		expect(container.querySelector('.value')).toBe(value);
		expect(value!.textContent).toBe('later');
		expect(container.querySelector('.caught')).toBeNull();
		expect(caught).toEqual([]);
		expect(recovered).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
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
