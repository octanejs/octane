import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { prerender } from 'octane/static';
import { act, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as Client from './_fixtures/try-hole-reader.tsrx';

// A template reader that calls use() in a text hole clones its root before the
// hole reads its value. A rejected server read renders its error arm, as it
// does for a reader that calls use() in setup.

const server = loadServerFixture('packages/octane/tests/hydration/_fixtures/try-hole-reader.tsrx');

const PENDING_READERS = [
	['in a @try with @pending', 'CatchArm', '<i>client</i>'],
	['whose root has the catch arm tag', 'SameRootArm', '<em><b>client</b></em>'],
	['in setup (control)', 'SetupCatchArm', '<i>client</i>'],
] as const;

type PageName = (typeof PENDING_READERS)[number][1];

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

async function hydrateRejected(name: PageName, clientValue: Promise<string>) {
	container.innerHTML = (
		await prerender(server[name], { label: 'server', value: Promise.reject('x') })
	).html;
	const div = container.querySelector('div')!;
	expect(visible()).toBe('<div><em title="server">server</em></div>');
	const caught: unknown[] = [];
	const recovered: unknown[] = [];
	let root!: ReturnType<typeof hydrateRoot>;
	await act(async () => {
		root = hydrateRoot(
			container,
			Client[name],
			{ label: 'client', value: clientValue },
			{
				onCaughtError: (error: unknown) => caught.push(error),
				onRecoverableError: (error: unknown) => recovered.push(error),
			},
		);
	});
	await act(async () => {});
	return { root, div, caught, recovered };
}

/** The rendered elements and text, without the runtime's range markers. */
function visible(): string {
	return container.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
}

describe('hydrateRoot — use() in a template hole rejected on the server', () => {
	it.each(PENDING_READERS)(
		'client-renders the boundary of a reader %s from client data',
		async (_, name, content) => {
			const { root, div, caught, recovered } = await hydrateRejected(
				name,
				Promise.resolve('client'),
			);

			expect(visible()).toBe(`<div>${content}</div>`);
			expect(container.querySelector('div')).toBe(div);
			expect(caught).toEqual([]);
			expect(recovered).toEqual([]);
			expect(consoleError).not.toHaveBeenCalled();
			root.unmount();
		},
	);

	it.each(PENDING_READERS)(
		'shows the client catch arm when the client read of a reader %s rejects too',
		async (_, name) => {
			const rejected = Promise.reject('y');
			rejected.catch(() => {});
			const { root, div, caught, recovered } = await hydrateRejected(name, rejected);
			await vi.waitFor(async () => {
				await act(async () => {});
				expect(visible()).toBe('<div><em title="client">client</em></div>');
			});
			expect(container.querySelector('div')).toBe(div);
			expect(caught).toEqual(['y']);
			expect(recovered).toEqual([]);
			root.unmount();
		},
	);

	it.each([
		['in a @try', 'CatchOnly'],
		['in an <ErrorBoundary>', 'Boundary'],
	] as const)('renders the error arm for a reader %s', async (_, name) => {
		container.innerHTML = (
			await prerender(server[name], { label: 'server', value: Promise.reject('x') })
		).html;
		expect(visible()).toBe('<div><em title="server">server</em></div>');
	});
});
