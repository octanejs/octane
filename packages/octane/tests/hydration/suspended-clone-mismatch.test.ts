import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// A Suspense arm that the server resolved keeps showing its server content
// while the client's first hydrating attempt is suspended. When that attempt
// also had to rebuild part of the arm, the rebuild is discarded with the rest of
// the attempt: the server arm stays as the server rendered it, and the attempt
// that commits reports the mismatch once, as a hydration that never suspended
// reports it.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/suspended-clone-mismatch.tsrx',
);
type Fixture = typeof import('./_fixtures/suspended-clone-mismatch.tsrx');
type Component =
	'GateBranch' | 'GateForm' | 'GateNested' | 'GateEmptyList' | 'GateLongerList' | 'GateDetached';

const server = loadServerFixture<Fixture>(FIXTURE, { id: 'suspended-clone-mismatch.tsrx' });

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

describe.each([true, false])('suspended @try arm rebuilt during hydration (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource<Fixture>(readFileSync(FIXTURE, 'utf8'), {
		id: 'suspended-clone-mismatch.tsrx',
		mode: 'client',
		compileOptions: { dev },
	});

	function hydrate(component: Component, recoverable: unknown[]): void {
		root = hydrateRoot(
			container,
			client[component],
			{},
			{ onRecoverableError: (reason) => recoverable.push(reason) },
		);
		flushSync(() => {});
	}

	/** Server-render the arm the client cannot adopt, and suspend the client's gate. */
	function serve(component: Component): () => Promise<void> {
		server.gate.promise = undefined;
		container.innerHTML = renderToString(server[component], { server: true }).html;
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		client.gate.promise = promise;
		return () =>
			act(async () => {
				client.gate.promise = undefined;
				resolve();
				await promise;
			});
	}

	/** What hydrating the same server arm publishes when the client never suspends. */
	async function control(component: Component) {
		server.gate.promise = undefined;
		container.innerHTML = renderToString(server[component], { server: true }).html;
		client.gate.promise = undefined;
		const recoverable: unknown[] = [];
		hydrate(component, recoverable);
		await act(() => {});
		const published = { html: markup(), structural: structural(), recoverable: recoverable.length };
		root!.unmount();
		root = undefined;
		error.mockClear();
		return published;
	}

	it('keeps the server arm while pending and reports the rebuilt clone once', async () => {
		const resume = serve('GateBranch');
		const serverArm = container.querySelector('b.server');
		expect(serverArm).not.toBeNull();
		const recoverable: unknown[] = [];
		hydrate('GateBranch', recoverable);
		await act(() => {});

		expect(container.querySelector('b.server')).toBe(serverArm);
		expect(markup()).toBe('<div><b class="server">server</b></div>');
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);

		await resume();
		expect(markup()).toBe('<div><i>ok</i></div>');
		expect(recoverable).toHaveLength(1);
		const reported = structural();
		if (dev) {
			expect(reported).toHaveLength(1);
			expect(reported[0]).toContain('suspended-clone-mismatch.tsrx');
			expect(reported[0]).toContain('the client expected <i> but the server rendered <b>');
		} else expect(reported).toEqual([]);
	});

	it('removes a clone it inserted before suspending and keeps adopted user state', async () => {
		const expected = await control('GateForm');
		expect(expected.recoverable).toBe(1);
		// <s> rebuilt over <b>, and <i> finds the range end that recovery
		// reached: one diagnostic.
		expect(expected.structural).toHaveLength(dev ? 1 : 0);

		const resume = serve('GateForm');
		const serverArm = container.querySelector('b.server');
		const input = container.querySelector('input')!;
		input.value = 'user draft';
		const recoverable: unknown[] = [];
		hydrate('GateForm', recoverable);
		await act(() => {});

		// The discarded attempt had built <s> in place of <b> before it suspended.
		expect(container.querySelector('b.server')).toBe(serverArm);
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

	it('undoes a nested arm that rebuilt and committed when its enclosing arm suspends', async () => {
		const expected = await control('GateNested');
		expect(expected.recoverable).toBe(1);
		expect(expected.structural).toHaveLength(dev ? 1 : 0);

		const resume = serve('GateNested');
		const serverArm = container.querySelector('b.server');
		const serverLeaf = container.querySelector('i');
		const recoverable: unknown[] = [];
		hydrate('GateNested', recoverable);
		await act(() => {});

		expect(container.querySelector('b.server')).toBe(serverArm);
		expect(container.querySelector('i')).toBe(serverLeaf);
		expect(markup()).toBe('<div><b class="server">server</b><i>ok</i></div>');
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);

		await resume();
		expect(markup()).toBe(expected.html);
		expect(structural()).toEqual(expected.structural);
		expect(recoverable).toHaveLength(expected.recoverable);
	});

	it.each(['GateEmptyList', 'GateLongerList'] as const)(
		'leaves the server children of a de-opt host in place while pending (%s)',
		async (component) => {
			const expected = await control(component);

			const resume = serve(component);
			const served = markup();
			const host = container.querySelector('ul');
			const recoverable: unknown[] = [];
			hydrate(component, recoverable);
			await act(() => {});

			expect(markup()).toBe(served);
			expect(container.querySelector('ul')).toBe(host);
			expect(recoverable).toEqual([]);

			await resume();
			expect(markup()).toBe(expected.html);
			expect(container.querySelector('ul')).toBe(host);
			expect(structural()).toEqual(expected.structural);
			expect(recoverable).toHaveLength(expected.recoverable);
		},
	);

	// Something outside the attempt detaches the arm's bounds while it renders.
	// Its rollback cannot restore a range it no longer finds, and must leave the
	// boundary's committed siblings alone rather than sweep to the parent's end.
	it('leaves siblings in place when the arm loses its bounds before rolling back', async () => {
		serve('GateDetached');
		const button = container.querySelector('button')!;
		const div = container.querySelector('div')!;
		client.external.detach = () => {
			client.external.detach = undefined;
			for (let node = button.previousSibling; node !== null;) {
				const previous: ChildNode | null = node.previousSibling;
				if (node.nodeType === 8) node.remove();
				else if (node.nodeType === 1) break;
				node = previous;
			}
		};
		const recoverable: unknown[] = [];
		try {
			hydrate('GateDetached', recoverable);
			await act(() => {});
			expect(div.contains(button)).toBe(true);
			expect(button.textContent).toBe('after');
		} finally {
			client.external.detach = undefined;
		}
	});
});
