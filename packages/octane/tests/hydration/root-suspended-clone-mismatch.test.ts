import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// A root with no Suspense boundary keeps showing the server's content while
// its hydrating attempt is suspended. When that attempt also had to rebuild
// mismatched content, the rebuild is discarded with the rest of the attempt:
// the server content stays as the server rendered it, and the attempt that
// commits reports the mismatch once, as a hydration that never suspended
// reports it.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/root-suspended-clone-mismatch.tsrx',
);
type Fixture = typeof import('./_fixtures/root-suspended-clone-mismatch.tsrx');
type Component = Exclude<keyof Fixture, 'gate'>;

const server = loadServerFixture<Fixture>(FIXTURE, { id: 'root-suspended-clone-mismatch.tsrx' });

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

/** Published structural mismatch diagnostics. */
const structural = () =>
	error.mock.calls
		.map((call) => String(call[0]))
		.filter((m) => m.includes('hydration mismatch') && m.includes('the client expected'));

/** Element and text markup, ignoring hydration comments. */
const markup = () => container.innerHTML.replace(/<!--[^]*?-->/g, '');

/** Every element and text node in the container, in document order. */
function serverNodes(): Node[] {
	const nodes: Node[] = [];
	const walker = document.createTreeWalker(
		container,
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
	);
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
}

describe.each([true, false])('suspended root rebuilt during hydration (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource<Fixture>(readFileSync(FIXTURE, 'utf8'), {
		id: 'root-suspended-clone-mismatch.tsrx',
		mode: 'client',
		compileOptions: { dev },
	});

	function hydrate(component: Component, recoverable: unknown[], uncaught?: unknown[]): void {
		root = hydrateRoot(
			container,
			client[component],
			{},
			{
				onRecoverableError: (reason) => recoverable.push(reason),
				...(uncaught === undefined ? {} : { onUncaughtError: (reason) => uncaught.push(reason) }),
			},
		);
		flushSync(() => {});
	}

	/** Server-render the content the client cannot adopt; the client's gate throws `thrown`. */
	function serve(component: Component, thrown: unknown): void {
		server.gate.thrown = undefined;
		container.innerHTML = renderToString(server[component], { server: true }).html;
		client.gate.thrown = thrown;
	}

	/** Suspend the client's gate until the returned function resolves it. */
	function suspend(component: Component): () => Promise<void> {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		serve(component, promise);
		return () =>
			act(async () => {
				client.gate.thrown = undefined;
				resolve();
				await promise;
			});
	}

	/** What hydrating the same server content publishes when the client never suspends. */
	async function control(component: Component) {
		serve(component, undefined);
		const recoverable: unknown[] = [];
		hydrate(component, recoverable);
		await act(() => {});
		const published = { html: markup(), structural: structural(), recoverable: recoverable.length };
		root!.unmount();
		root = undefined;
		error.mockClear();
		return published;
	}

	it('keeps the server content while pending and reports the rebuilt clone once', async () => {
		const resume = suspend('RootBranch');
		const serverBranch = container.querySelector('b.server');
		expect(serverBranch).not.toBeNull();
		const recoverable: unknown[] = [];
		hydrate('RootBranch', recoverable);
		await act(() => {});

		expect(container.querySelector('b.server')).toBe(serverBranch);
		expect(markup()).toBe('<div><b class="server">server</b></div>');
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);

		await resume();
		expect(markup()).toBe('<div><i>ok</i></div>');
		expect(recoverable).toHaveLength(1);
		const reported = structural();
		if (dev) {
			expect(reported).toHaveLength(1);
			expect(reported[0]).toContain('root-suspended-clone-mismatch.tsrx');
			expect(reported[0]).toContain('the client expected <i> but the server rendered <b>');
		} else expect(reported).toEqual([]);
	});

	it('removes a clone it inserted before suspending and keeps adopted user state', async () => {
		const expected = await control('RootForm');
		expect(expected.recoverable).toBe(1);
		// <s> rebuilt over <b>, and <i> finds the range end that recovery
		// reached: one diagnostic.
		expect(expected.structural).toHaveLength(dev ? 1 : 0);

		const resume = suspend('RootForm');
		const serverBranch = container.querySelector('b.server');
		const input = container.querySelector('input')!;
		input.value = 'user draft';
		const recoverable: unknown[] = [];
		hydrate('RootForm', recoverable);
		await act(() => {});

		// The discarded attempt had built <s> in place of <b> before it suspended.
		expect(container.querySelector('b.server')).toBe(serverBranch);
		expect(container.querySelector('s')).toBeNull();
		expect(container.querySelector('input')).toBe(input);
		expect(markup()).toBe('<div><input class="draft"><b class="server">server</b></div>');
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);

		await resume();
		expect(markup()).toBe(expected.html);
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('user draft');
		expect(structural()).toEqual(expected.structural);
		expect(recoverable).toHaveLength(expected.recoverable);
	});

	// Each recovery kind before the root suspends: a resolved arm that committed,
	// a renderable or only-child hole over server text, and list shapes the
	// server rendered differently. The retry rebuilds, and reports, exactly what
	// the discarded attempt did.
	it.each<Component>([
		'RootNestedArm',
		'RootHole',
		'RootOnlyChild',
		'RootFewerItems',
		'RootEmptyList',
	])(
		'%s keeps the server content while pending and reports as if it never suspended',
		async (component) => {
			const expected = await control(component);
			expect(expected.recoverable).toBe(1);
			if (dev) expect(expected.structural.length).toBeGreaterThan(0);
			else expect(expected.structural).toEqual([]);

			const resume = suspend(component);
			const html = markup();
			const nodes = serverNodes();
			const recoverable: unknown[] = [];
			hydrate(component, recoverable);
			await act(() => {});

			expect(markup()).toBe(html);
			const kept = serverNodes();
			expect(kept).toHaveLength(nodes.length);
			kept.forEach((node, i) => expect(node).toBe(nodes[i]));
			expect(structural()).toEqual([]);
			expect(recoverable).toEqual([]);

			await resume();
			expect(markup()).toBe(expected.html);
			expect(structural()).toEqual(expected.structural);
			expect(recoverable).toHaveLength(expected.recoverable);
		},
	);

	// No attempt commits, so there is no rebuilt content to report.
	it('reports nothing for a rebuild discarded by an uncaught error', async () => {
		const failure = new Error('gate failed');
		serve('RootBranch', failure);
		const recoverable: unknown[] = [];
		const uncaught: unknown[] = [];
		hydrate('RootBranch', recoverable, uncaught);
		await act(() => {});

		expect(uncaught).toEqual([failure]);
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);
	});
});
