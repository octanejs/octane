import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { prerender } from 'octane/static';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as Client from './_fixtures/try-hole-reader.tsrx';

// A template reader that calls use() in a text hole clones its root before the
// hole reads the server's rejection seed. Where the server's read rejected,
// its boundary rendered the @catch arm, so that clone meets the catch arm. The
// boundary must adopt the server's catch arm, as it does for a reader that
// calls use() in setup. A text difference in that arm is a mismatch like any
// other. Recoverable errors publish in dev and prod; console diagnostics in
// dev only.

const server = loadServerFixture('packages/octane/tests/hydration/_fixtures/try-hole-reader.tsrx');
const DEV = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
const pending = <T>() => new Promise<T>(() => {});

const READERS = [
	['in a @try with @pending', 'CatchArm'],
	['in a @try', 'CatchOnly'],
	['whose root has the catch arm tag', 'SameRootArm'],
	['in an <ErrorBoundary>', 'Boundary'],
	['in setup (control)', 'SetupCatchArm'],
] as const;

type PageName = (typeof READERS)[number][1];

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

async function hydrateCaught(
	name: PageName,
	serverLabel: string,
	clientLabel: string,
	clientValue: Promise<string> = pending<string>(),
) {
	container.innerHTML = (
		await prerender(server[name], { label: serverLabel, value: Promise.reject('x') })
	).html;
	const div = container.querySelector('div')!;
	const em = div.querySelector('em')!;
	expect(em.outerHTML).toBe(`<em title="${serverLabel}">${serverLabel}</em>`);
	const caught: unknown[] = [];
	const recovered: unknown[] = [];
	const root = hydrateRoot(
		container,
		Client[name],
		{ label: clientLabel, value: clientValue },
		{
			onCaughtError: (error: unknown) => caught.push(error),
			onRecoverableError: (error: unknown) => recovered.push(error),
		},
	);
	flushSync(() => {});
	// Recoverable and caught errors are published after the hydrating render.
	await new Promise((resolve) => setTimeout(resolve, 0));
	return { root, div, em, caught, recovered };
}

/** Hydration diagnostics logged in development. */
function mismatches(): string[] {
	return consoleError.mock.calls
		.map(([message]) => String(message))
		.filter((message) => message.startsWith('Octane hydration mismatch'));
}

/** The rendered elements and text, without the runtime's range markers. */
function visible(): string {
	return container.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
}

describe('hydrateRoot — use() in a template hole rejected on the server', () => {
	it.each(READERS)('adopts the server catch arm for a reader %s', async (_, name) => {
		const { root, div, em, caught, recovered } = await hydrateCaught(name, 'same', 'same');

		expect(visible()).toBe('<div><em title="same">same</em></div>');
		expect(container.querySelector('div')).toBe(div);
		expect(container.querySelector('em')).toBe(em);
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		root.unmount();
	});

	// The adopted catch arm's text differs from the client's, which is a
	// mismatch as anywhere else: its fallback owner renders on the client from
	// client data. A `@try` with `@pending` is that owner, so the host around it
	// stays; an `@catch`-only `@try` or an <ErrorBoundary> is not a hydration
	// boundary, so the root renders on the client. The client's read suspends,
	// then rejects too, so the client render reaches the same catch arm. As in
	// React, a boundary reports the mismatch when it commits its `@pending` arm,
	// then the caught error; a root, which commits nothing until the caught
	// error, reports only that.
	it.each(READERS)(
		'client-renders the fallback owner of a catch arm whose text differs, for a reader %s',
		async (_, name) => {
			const rejected = Promise.reject('x');
			rejected.catch(() => {});
			const { root, div, em, caught, recovered } = await hydrateCaught(
				name,
				'server',
				'client',
				rejected,
			);
			await act(async () => {});

			expect(visible()).toBe('<div><em title="client">client</em></div>');
			expect(em.isConnected).toBe(false);
			const boundary = name === 'CatchArm' || name === 'SameRootArm' || name === 'SetupCatchArm';
			expect(container.querySelector('div') === div).toBe(boundary);
			expect(caught).toEqual(['x']);
			expect(recovered.map((error) => (error as Error).message)).toEqual(
				boundary
					? [expect.stringMatching(/^Hydration failed because the server rendered (HTML|text)/)]
					: [],
			);
			const logged = mismatches();
			expect(logged.length).toBeLessThanOrEqual(DEV ? 1 : 0);
			root.unmount();
		},
	);
});
