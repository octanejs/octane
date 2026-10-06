import { loadServerFixture } from '../_server-fixture.js';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { prerender } from 'octane/static';
import { flushSync, hydrateRoot } from '../../src/index.js';
import {
	Branch,
	NestedRejected,
	Rejected,
	RejectedPending,
	RejectedThenResolved,
	Resolved,
	Rethrown,
	RethrownBoundary,
	TemplateRejected,
} from './_fixtures/try-templateless-reader.tsrx';

// A template-less component (no `@{}` body) claims a server component range
// when it hydrates. Where its use() rejected on the server, the boundary that
// caught the rejection rendered its @catch arm in that place, plus a rejection
// seed. The component must read that seed, and the boundary must adopt the
// server's catch arm, exactly as it does for a template reader. A body that
// renders where the server rendered something else is a mismatch, which with
// no Suspense boundary around it renders the root on the client.
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
		['is the sole try child', 'Rejected', Rejected],
		['is a template reader (control)', 'TemplateRejected', TemplateRejected],
		['sits in a boundary with a @pending arm', 'RejectedPending', RejectedPending],
		['is rendered by another template-less component', 'NestedRejected', NestedRejected],
	] as const)('adopts the server catch arm when the reader %s', async (_, name, Client) => {
		container.innerHTML = (await prerender(server[name], { promise: Promise.reject('x') })).html;
		const before = serverNodes();
		expect(before.caught!.textContent).toBe('x');

		const { root, caught, recovered } = await hydrate(Client, { promise: pending() });

		expect(container.querySelector('.caught')).toBe(before.caught);
		expect(container.querySelector('h1')).toBe(before.h1);
		expect(container.querySelector('button')).toBe(before.button);
		expect(container.querySelectorAll('.caught')).toHaveLength(1);
		expect(container.querySelector('em')).toBeNull();
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		root.unmount();
	});

	it('keeps later positional seeds aligned after the caught boundary', async () => {
		container.innerHTML = (
			await prerender(server.RejectedThenResolved, {
				rejected: Promise.reject('x'),
				resolved: Promise.resolve('later'),
			})
		).html;
		const serverCatch = container.querySelector('.caught');
		const value = container.querySelector('.value');
		expect(value!.textContent).toBe('later');

		const { root, caught, recovered } = await hydrate(RejectedThenResolved, {
			rejected: pending(),
			resolved: pending<string>(),
		});

		expect(container.querySelector('.caught')).toBe(serverCatch);
		expect(container.querySelector('b')).toBeNull();
		expect(container.querySelector('.value')).toBe(value);
		expect(value!.textContent).toBe('later');
		expect(container.querySelector('em')).toBeNull();
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		root.unmount();
	});

	it.each([
		['a @catch arm', 'Rethrown', Rethrown],
		['an ErrorBoundary', 'RethrownBoundary', RethrownBoundary],
	] as const)(
		'gives %s inside the reader the decoded rejection reason',
		async (_, name, Client) => {
			container.innerHTML = (await prerender(server[name], { promise: Promise.reject('x') })).html;
			const { h1, button } = serverNodes();
			expect(container.querySelector('.caught')!.textContent).toBe('Error: inner:x');

			const { root, caught } = await hydrate(Client, { promise: pending() });

			expect(container.querySelector('.caught')!.textContent).toBe('Error: inner:x');
			expect(container.querySelector('h1')).toBe(h1);
			expect(container.querySelector('button')).toBe(button);
			expect(caught).toEqual([new Error('inner:x')]);
			root.unmount();
		},
	);

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
