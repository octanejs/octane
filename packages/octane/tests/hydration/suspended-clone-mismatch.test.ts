import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// A Suspense arm that the server resolved, hydrated by a client whose first
// attempt suspends. As in React 19, suspending while hydrating keeps the
// server's content on screen, and a mismatch the client meets renders the arm
// on the client and reports it once. Which comes first decides what shows
// while the client is pending: a leaf that suspends before any server node
// differs keeps the server arm, while a mismatch met before the suspension
// renders the arm on the client, which then shows its pending content. A
// nested arm's mismatch inside an attempt that suspends is discarded with that
// attempt and met again by the attempt that commits.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/suspended-clone-mismatch.tsrx',
);
type Fixture = typeof import('./_fixtures/suspended-clone-mismatch.tsrx');
type Component =
	| 'GateBranch'
	| 'GateHostFirst'
	| 'GateLeafFirst'
	| 'GateMarkThenLeaf'
	| 'GateSetupFirst'
	| 'GateForm'
	| 'GateNested'
	| 'GateEmptyList'
	| 'GateLongerList'
	| 'GateDetached';

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

describe.each([true, false])('suspended @try arm with a hydration mismatch (dev=%s)', (dev) => {
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

	/** Server-render `component` with `props`, and suspend the client's gate. */
	function serve(component: Component, props: { server?: boolean } = { server: true }) {
		server.gate.promise = undefined;
		container.innerHTML = renderToString(server[component], props).html;
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

	// The client's arm is a component whose leaf suspends before it renders any
	// host, so nothing has been compared with the server arm yet.
	it('keeps the server arm while pending and renders the arm on the client once it resumes', async () => {
		const resume = serve('GateBranch');
		const div = container.querySelector('div');
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
		expect(container.querySelector('div')).toBe(div);
		expect(markup()).toBe('<div><i>ok</i></div>');
		expect(recoverable).toHaveLength(1);
		const reported = structural();
		if (dev) {
			expect(reported).toHaveLength(1);
			expect(reported[0]).toContain('suspended-clone-mismatch.tsrx');
			expect(reported[0]).toContain('but the server rendered <b>');
		} else expect(reported).toEqual([]);
	});

	// React runs a component's body before it hydrates the hosts that body
	// renders. The leaf that leads the client's fragment suspends before any of
	// its hosts is compared, so the server arm stays; the root that holds the
	// leaf is compared first, so the arm renders on the client at once.
	it('keeps the server arm while a fragment’s leading leaf is pending', async () => {
		const expected = await control('GateLeafFirst');
		expect(expected.html).toBe('<div><i>ok</i><em>x</em></div>');
		expect(expected.recoverable).toBe(1);

		const resume = serve('GateLeafFirst');
		const serverArm = container.querySelector('b.server');
		const recoverable: unknown[] = [];
		hydrate('GateLeafFirst', recoverable);
		await act(() => {});

		expect(container.querySelector('b.server')).toBe(serverArm);
		expect(markup()).toBe('<div><b class="server">server</b></div>');
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);

		await resume();
		expect(markup()).toBe(expected.html);
		expect(structural()).toEqual(expected.structural);
		expect(recoverable).toHaveLength(1);
	});

	it.each([
		['the root that holds the pending leaf', 'GateHostFirst', '<section><i>ok</i></section>'],
		[
			'the root that holds a leaf pending before its template',
			'GateSetupFirst',
			'<section><i>ok</i></section>',
		],
		[
			'a host rendered before the pending leaf',
			'GateMarkThenLeaf',
			'<s>client</s><i>ok</i><em>x</em>',
		],
	] as const)('renders the arm on the client when %s differs', async (_, component, html) => {
		const expected = await control(component);
		expect(expected.html).toBe(`<div>${html}</div>`);
		expect(expected.recoverable).toBe(1);

		const resume = serve(component);
		const serverArm = container.querySelector('b.server')!;
		const recoverable: unknown[] = [];
		hydrate(component, recoverable);
		await act(() => {});

		expect(serverArm.isConnected).toBe(false);
		expect(container.querySelector('p')!.textContent).toBe('pending');

		await resume();
		expect(markup()).toBe(expected.html);
		expect(structural()).toEqual(expected.structural);
		expect(recoverable).toHaveLength(1);
	});

	// <s> differs from the server's <b> before the leaf suspends: the arm renders
	// on the client at once, so its pending content shows until the leaf
	// resumes. The input the server rendered is discarded with the arm,
	// including what the user typed into it, as React discards it.
	it('renders the arm on the client when a mismatch precedes the suspension, showing its pending content', async () => {
		const expected = await control('GateForm');
		expect(expected.recoverable).toBe(1);
		expect(expected.structural).toHaveLength(dev ? 1 : 0);

		const resume = serve('GateForm');
		const div = container.querySelector('div');
		const serverArm = container.querySelector('b.server')!;
		const input = container.querySelector('input')!;
		input.value = 'user draft';
		const recoverable: unknown[] = [];
		hydrate('GateForm', recoverable);
		await act(() => {});

		expect(container.querySelector('div')).toBe(div);
		expect(serverArm.isConnected).toBe(false);
		expect(input.isConnected).toBe(false);
		expect(container.querySelector('p')!.textContent).toBe('pending');

		await resume();
		expect(markup()).toBe(expected.html);
		expect(container.querySelector('p')).toBeNull();
		expect(container.querySelector('input')!.value).toBe('');
		expect(structural()).toEqual(expected.structural);
		expect(recoverable).toHaveLength(expected.recoverable);
	});

	it('discards a nested arm rendered on the client when its enclosing arm suspends', async () => {
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
		expect(container.querySelector('i')).toBe(serverLeaf);
		expect(structural()).toEqual(expected.structural);
		expect(recoverable).toHaveLength(expected.recoverable);
	});

	// A server list host with fewer children than the client's is missing nodes:
	// the arm renders on the client before the leaf suspends.
	it.each(['GateEmptyList', 'GateLongerList'] as const)(
		'renders the arm on the client for a de-opt host missing server children (%s)',
		async (component) => {
			const expected = await control(component);
			expect(expected.recoverable).toBe(1);

			const resume = serve(component);
			const host = container.querySelector('ul')!;
			const recoverable: unknown[] = [];
			hydrate(component, recoverable);
			await act(() => {});

			expect(host.isConnected).toBe(false);
			expect(container.querySelector('p')!.textContent).toBe('pending');

			await resume();
			expect(markup()).toBe(expected.html);
			expect(structural()).toEqual(expected.structural);
			expect(recoverable).toHaveLength(expected.recoverable);
		},
	);

	// Something outside the attempt detaches the arm's bounds while its leaf
	// renders. The attempt's rollback cannot restore a range it no longer finds,
	// and must leave the boundary's committed siblings alone rather than sweep
	// to the parent's end. The server rendered the client's arm, so the attempt
	// reaches the leaf before it suspends.
	it('leaves siblings in place when the arm loses its bounds before rolling back', async () => {
		serve('GateDetached', {});
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
