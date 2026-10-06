import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// renderToString cannot wait for a suspended Suspense boundary, so it sends the
// boundary's @pending arm, marked for a client render. As React does for a
// boundary its server marked errored (`<!--$!-->`), the client renders that
// boundary fresh, showing its own @pending arm while its data loads, and
// reports once when the root commits. An attempt that suspends before then,
// the root's or an enclosing arm's, is discarded and keeps the server's
// content, that arm included, as React keeps a dehydrated tree's; its retry
// renders the boundary on the client.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/unfinished-arm.tsrx',
);
type Fixture = typeof import('./_fixtures/unfinished-arm.tsrx');
type Component = 'Unfinished' | 'InArm';

const server = loadServerFixture<Fixture>(FIXTURE, { id: 'unfinished-arm.tsrx' });

const UNFINISHED =
	/^(The server could not finish this Suspense boundary|Minified Octane error #341;)/;

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

describe.each([true, false])('a boundary the server could not finish (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource<Fixture>(readFileSync(FIXTURE, 'utf8'), {
		id: 'unfinished-arm.tsrx',
		mode: 'client',
		compileOptions: { dev },
	});

	/** Server-render `component`'s boundary unfinished, and give the client pending data. */
	function serve(component: Component) {
		server.data.promise = new Promise<string>(() => {});
		server.gate.promise = undefined;
		container.innerHTML = renderToString(server[component], {}).html;
		const data = deferred<string>();
		client.data.promise = data.promise;
		return data;
	}

	function hydrate(component: Component, recoverable: string[]): void {
		root = hydrateRoot(
			container,
			client[component],
			{},
			{ onRecoverableError: (reason) => recoverable.push((reason as Error).message) },
		);
	}

	it('shows its own pending arm in place of the server’s, and reports once', async () => {
		const data = serve('Unfinished');
		const outer = container.firstElementChild!;
		expect(markup(outer)).toBe('<p>pending</p><u>ok</u>');
		const leaf = container.querySelector('u')!;
		client.gate.promise = undefined;
		const recoverable: string[] = [];
		hydrate('Unfinished', recoverable);
		expect(markup(outer)).toBe('<p>pending</p><u>ok</u>');
		await act(() => {});
		expect(container.querySelector('u')).toBe(leaf);
		expect(recoverable).toEqual([expect.stringMatching(UNFINISHED)]);

		await act(async () => {
			data.resolve('client');
			await data.promise;
		});
		expect(markup(outer)).toBe('<i>client</i><u>ok</u>');
		expect(container.querySelector('u')).toBe(leaf);
		expect(recoverable).toHaveLength(1);
	});

	it.each([
		{ owner: 'the root’s', component: 'Unfinished' as const },
		{ owner: 'an enclosing arm’s', component: 'InArm' as const },
	])('keeps the server’s pending arm while $owner attempt is suspended', async ({ component }) => {
		const data = serve(component);
		const host = container.querySelector('u')!.parentElement!;
		const serverPending = container.querySelector('p')!;
		const gate = deferred<void>();
		client.gate.promise = gate.promise;
		const recoverable: string[] = [];
		hydrate(component, recoverable);
		flushSync(() => {});
		await act(() => {});

		// Nothing committed: the server's content stays as it was.
		expect(container.querySelector('p')).toBe(serverPending);
		expect(markup(host)).toBe('<p>pending</p><u>ok</u>');
		expect(recoverable).toEqual([]);

		// The retry renders the boundary on the client and reports it once.
		await act(async () => {
			client.gate.promise = undefined;
			gate.resolve();
			await gate.promise;
		});
		expect(markup(host)).toBe('<p>pending</p><u>ok</u>');
		expect(recoverable).toEqual([expect.stringMatching(UNFINISHED)]);

		await act(async () => {
			data.resolve('client');
			await data.promise;
		});
		expect(markup(host)).toBe('<i>client</i><u>ok</u>');
		expect(recoverable).toHaveLength(1);
	});
});
