import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The client renders an error boundary (@try with @catch, or an imported
// ErrorBoundary) where the server rendered other content, so the boundary has
// no server range. The server frames every boundary, so the server HTML does
// not match the client: as in React 19, the nearest fallback owner discards its
// server DOM and renders on the client, where the boundary catches its body's
// throw. That client render reports the caught error alone, not the failed
// hydration. No server node at the boundary's position survives beside the
// catch arm. A try body that does not throw falls back too, and reports once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rangeless-error-boundary.tsrx',
);
const FILE = 'rangeless-error-boundary.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const HYDRATION_FAILED =
	/^Hydration failed because the server rendered HTML didn't match the client/;

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** The element and text nodes below `node`, in document order. */
function subtree(node: Node): Node[] {
	const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	const nodes: Node[] = [];
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — an error boundary where the server rendered other content ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		errSpy.mockRestore();
	});

	/** Server-render the server arm, then hydrate the client arm and settle. */
	async function hydrate(name: string, clientProps: Record<string, unknown> = {}) {
		container.innerHTML = ServerRT.renderToString(server[name], { side: 'server' }).html;
		const serverNodes = subtree(container);
		const recoverable: unknown[] = [];
		const caught: string[] = [];
		await act(async () => {
			root = hydrateRoot(
				container,
				client[name],
				{ side: 'client', ...clientProps },
				{
					onRecoverableError: (error: unknown) => recoverable.push(error),
					onCaughtError: (error: unknown) => caught.push((error as Error).message),
				},
			);
		});
		return { serverNodes, recoverable, caught };
	}

	/** A development compile may add one warning that locates the mismatch. */
	function expectDiagnosedOnce(): void {
		const logged = errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));
		expect(logged.length).toBeLessThanOrEqual(dev ? 1 : 0);
		for (const message of logged)
			expect(message).toMatch(new RegExp(`^Octane hydration mismatch at ${FILE}:\\d+:\\d+: `));
	}

	it.each([
		{ shape: 'a catch-only @try', name: 'CatchOnly' },
		{ shape: 'an imported ErrorBoundary', name: 'JsxBoundary' },
		{ shape: 'a @try with a @pending arm', name: 'WithPending' },
	])('renders the root on the client for $shape', async ({ name }) => {
		const { serverNodes, recoverable, caught } = await hydrate(name);

		expect(markup(container)).toBe('<div><section><em>inner</em></section></div>');
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		expect(caught).toEqual(['boom']);
		expect(recoverable).toEqual([]);
		expectDiagnosedOnce();
	});

	it('renders the root on the client when the try body reads a rejected promise', async () => {
		const promise = Promise.reject(new Error('rejected'));
		promise.catch(() => {});
		const { serverNodes, recoverable, caught } = await hydrate('Rejected', { promise });

		expect(markup(container)).toBe('<div><section><em>rejected</em></section></div>');
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		expect(caught).toEqual(['rejected']);
		expect(recoverable).toEqual([]);
		expectDiagnosedOnce();
	});

	it('renders the enclosing @pending boundary on the client, keeping the host around it', async () => {
		const { serverNodes, recoverable, caught } = await hydrate('InSuspense');
		const [outer, heading, title] = serverNodes;

		expect(markup(container)).toBe('<div><h1>title</h1><section><em>inner</em></section></div>');
		expect(container.firstElementChild).toBe(outer);
		expect(container.querySelector('h1')).toBe(heading);
		expect(heading.firstChild).toBe(title);
		expect(serverNodes.slice(3).filter((node) => node.isConnected)).toEqual([]);
		expect(caught).toEqual(['boom']);
		expect(recoverable).toEqual([]);
		expectDiagnosedOnce();
	});

	// A @pending boundary is a Suspense boundary, whose server markers React
	// requires too.
	// OCTANE DIVERGENCE: React renders no markers for an error boundary, so it
	// adopts server elements that its children match. Octane frames every
	// boundary, and a missing range is a mismatch, as it is for an @if or
	// @switch branch (docs/differences-from-react.md, Hydration).
	it.each([
		{ shape: 'a catch-only @try', name: 'MatchingCatch' },
		{ shape: 'a @try with a @pending arm', name: 'MatchingPending' },
	])(
		'renders the root on the client for $shape whose body matches the server elements',
		async ({ name }) => {
			const { serverNodes, recoverable, caught } = await hydrate(name);

			expect(markup(container)).toBe('<div><section><em>inner</em></section></div>');
			expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
			expect(caught).toEqual([]);
			expect(recoverable).toHaveLength(1);
			expect((recoverable[0] as Error).message).toMatch(HYDRATION_FAILED);
			expectDiagnosedOnce();
		},
	);

	it('adopts the server range of a boundary the server rendered', async () => {
		const { serverNodes, recoverable, caught } = await hydrate('SameArm');

		expect(markup(container)).toBe('<div><section><em>inner</em></section></div>');
		const nodes = subtree(container);
		expect(nodes).toHaveLength(serverNodes.length);
		serverNodes.forEach((node, index) => expect(nodes[index]).toBe(node));
		expect(caught).toEqual([]);
		expect(recoverable).toEqual([]);
		expect(errSpy).not.toHaveBeenCalled();
	});
});
