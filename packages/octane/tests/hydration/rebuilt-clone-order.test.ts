import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// Each fixture's server arm renders a `<b>` where the client's renders a
// component whose template root is an `<i>`, followed by content the two
// agree on. As in React, the wrong tag means the server HTML does not match:
// nothing is repaired in place, and the nearest fallback owner discards its
// server DOM and renders on the client, reporting once to onRecoverableError.
// With no Suspense boundary that owner is the root, so no server node survives,
// including the siblings both sides render. Inside a @try/@pending arm only the
// arm renders on the client, from client data rather than the server's seeds,
// and the host element around it keeps its identity.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-order.tsrx',
);
const FILE = 'rebuilt-clone-order.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;
const STRUCTURAL =
	/^Octane hydration mismatch at rebuilt-clone-order\.tsrx:\d+:\d+: the client expected .+ but the server rendered <b>\. The nearest Suspense or Hydrate boundary, or the root, will be regenerated on the client\.$/;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a wrong-tag template root falls back to its owner ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { render(component: unknown, props: unknown): void; unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;
	let recoverable: string[];

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		recoverable = [];
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		errSpy.mockRestore();
	});

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	async function hydrate(name: string, clientProps: Record<string, unknown>) {
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
	}

	/** Every server element, to check which ones a fallback discarded. */
	function serverElements(): Element[] {
		return [...container.querySelectorAll('*')];
	}

	function expectOneFallback(): void {
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		// Only a development compile knows the template's source location.
		expect(warnings()).toEqual(dev ? [expect.stringMatching(STRUCTURAL)] : []);
	}

	it.each([
		{
			shape: 'an adopted-looking server sibling after it',
			name: 'SiblingBranch',
			props: {},
			client: '<i>ok</i><em>e</em>',
		},
		{
			shape: 'server output after it that the client does not render',
			name: 'TailBranch',
			props: {},
			client: '<i>ok</i>',
		},
		{
			shape: 'server output after it that a later client sibling renders',
			name: 'AdoptedTailBranch',
			props: {},
			client: '<i>ok</i><p>p</p>',
		},
		{
			shape: 'a renderable hole after it',
			name: 'HoleBranch',
			props: { text: 'tail' },
			client: '<i>ok</i>tail',
		},
		{
			shape: 'a sibling after the @switch that renders it',
			name: 'SwitchSiblingBranch',
			props: { k: 'a' },
			client: '<i>ok</i><em>e</em>',
		},
	])('renders the root on the client with $shape', async ({ name, props, client: html }) => {
		container.innerHTML = ServerRT.renderToString(server[name], { server: true, ...props }).html;
		const before = serverElements();
		await hydrate(name, props);

		expect(markup(container)).toBe(`<div>${html}</div>`);
		expect(before.filter((node) => node.isConnected)).toEqual([]);
		expectOneFallback();
	});

	it('renders the root on the client for a @switch the server did not render, which then updates', async () => {
		container.innerHTML = ServerRT.renderToString(server.SwitchBranch, {
			server: true,
			k: 'a',
		}).html;
		const before = serverElements();
		await hydrate('SwitchBranch', { k: 'a' });

		expect(markup(container)).toBe('<div><i>ok</i></div>');
		expect(before.filter((node) => node.isConnected)).toEqual([]);
		expectOneFallback();

		flushSync(() => root!.render(client.SwitchBranch, { k: 'b' }));
		expect(markup(container)).toBe('<div><u>z</u></div>');
		flushSync(() => root!.render(client.SwitchBranch, { k: 'a' }));
		expect(markup(container)).toBe('<div><i>ok</i></div>');
		expect(recoverable).toHaveLength(1);
	});

	// OCTANE DIVERGENCE: Octane's control-flow ranges are part of its hydration
	// protocol, as React's Suspense markers are part of React's. A client @switch
	// whose server output has no range of its own is a structural mismatch even
	// though the elements inside it match, so the root renders on the client
	// where React, which compiles @switch to a plain expression, would adopt.
	it('renders the root on the client for a @switch the server did not render around matching elements', async () => {
		container.innerHTML = ServerRT.renderToString(server.SwitchAdoptedHostBranch, {
			server: true,
			k: 'a',
		}).html;
		const before = serverElements();
		await hydrate('SwitchAdoptedHostBranch', { k: 'a' });

		expect(markup(container)).toBe('<div><u><s>s</s></u><em>e</em></div>');
		expect(before.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toHaveLength(dev ? 1 : 0);

		const em = container.querySelector('em');
		flushSync(() => root!.render(client.SwitchAdoptedHostBranch, { k: 'b' }));
		expect(markup(container)).toBe('<div><b>d</b><em>e</em></div>');
		expect(container.querySelector('em')).toBe(em);
	});

	it('renders only the mismatched @try arm on the client, from client data', async () => {
		container.innerHTML = (
			await prerender(server.SeedBranch, {
				server: true,
				leaf: Promise.resolve('server leaf'),
				sibling: Promise.resolve('server sibling'),
			})
		).html;
		const div = container.firstElementChild;
		const em = container.querySelector('em');
		expect(em!.textContent).toBe('server sibling');
		let resolveLeaf!: (value: string) => void;
		const leaf = new Promise<string>((resolve) => (resolveLeaf = resolve));
		let resolveSibling!: (value: string) => void;
		const sibling = new Promise<string>((resolve) => (resolveSibling = resolve));
		await hydrate('SeedBranch', { leaf, sibling });

		// The arm's server DOM is gone; its client render waits for client data.
		expect(container.firstElementChild).toBe(div);
		expect(em!.isConnected).toBe(false);
		expect(container.querySelector('p')!.textContent).toBe('pending');
		expect(container.textContent).not.toContain('server');
		expectOneFallback();

		await act(async () => {
			resolveLeaf('client leaf');
			resolveSibling('client sibling');
		});

		expect(container.firstElementChild).toBe(div);
		expect(container.querySelector('p')).toBeNull();
		expect(markup(container.querySelector('i')!)).toBe('<s>client leaf</s>ok');
		expect(container.querySelector('i')!.hasAttribute('style')).toBe(false);
		expect(container.querySelector('em')!.textContent).toBe('client sibling');
		expect(recoverable).toHaveLength(1);
	});
});
