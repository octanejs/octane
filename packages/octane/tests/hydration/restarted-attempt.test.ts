import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// A hydration attempt that suspends after a template's adoption deferred a
// mismatch is discarded, keeping the server DOM, and its retry meets the
// mismatch again, so the owner renders on the client. That client render reads
// the client's data, as React's does: no seed that a discarded attempt
// settled survives into it, even on a request that every attempt shares.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/restarted-attempt.tsrx',
);
type Fixture = typeof import('./_fixtures/restarted-attempt.tsrx');
type Component = 'IslandSeeds' | 'ArmSeeds';

const server = loadServerFixture<Fixture>(FIXTURE, { id: 'restarted-attempt.tsrx' });

/** A promise whose outcome is already known, as the server's read is. */
function settled(value: string): Promise<string> {
	return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	return node.innerHTML.replace(/<!--[^]*?-->/g, '');
}

let container: HTMLElement;
let root: Root | undefined;
let error: MockInstance<typeof console.error>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
	error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	root?.unmount();
	root = undefined;
	container.remove();
	error.mockRestore();
});

describe.each([true, false])('a restarted hydration attempt (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource<Fixture>(readFileSync(FIXTURE, 'utf8'), {
		id: 'restarted-attempt.tsrx',
		mode: 'client',
		compileOptions: { dev },
	});

	/** Server-render `component`, and suspend the client's gate until the returned resume. */
	function serve(component: Component) {
		server.data.promise = settled('server');
		server.gate.promise = undefined;
		container.innerHTML = renderToString(server[component], { server: true }).html;
		const gate = deferred<void>();
		client.gate.promise = gate.promise;
		return () =>
			act(async () => {
				client.gate.promise = undefined;
				gate.resolve();
				await gate.promise;
			});
	}

	function hydrate(component: Component, recoverable: unknown[]): void {
		root = hydrateRoot(
			container,
			client[component],
			{},
			{ onRecoverableError: (reason) => recoverable.push(reason) },
		);
		flushSync(() => {});
	}

	// The island's attempt and the Suspense arm's attempt each seed the shared
	// request with the server's data, suspend at the leaf, and are discarded.
	it.each(['IslandSeeds', 'ArmSeeds'] as const)(
		'renders the client data when %s falls back after a retry',
		async (component) => {
			const resume = serve(component);
			const serverData = container.querySelector('p')!;
			const serverArm = container.querySelector('b.server')!;
			expect(serverData.textContent).toBe('server');
			const data = deferred<string>();
			client.data.promise = data.promise;
			const recoverable: unknown[] = [];
			hydrate(component, recoverable);
			await act(() => {});
			// The attempt suspended: the server DOM stays, with nothing reported.
			expect(container.querySelector('p')).toBe(serverData);
			expect(serverArm.isConnected).toBe(true);
			expect(recoverable).toEqual([]);

			// The retry meets the mismatch, and the owner's client render waits for
			// the client's data.
			await resume();
			expect(serverData.isConnected).toBe(false);
			expect(serverArm.isConnected).toBe(false);
			expect(container.querySelector('p')).toBeNull();
			expect(recoverable).toHaveLength(1);

			await act(async () => {
				data.resolve('client');
				await data.promise;
			});
			expect(markup(container.querySelector('p')!.parentElement!)).toBe(
				'<p>client</p><i>ok</i><em>x</em>',
			);
			expect(recoverable).toHaveLength(1);
		},
	);
});
