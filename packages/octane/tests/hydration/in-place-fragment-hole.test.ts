import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered another @if arm whose elements match the client arm's
// exactly. As in React, which hydrates elements regardless of which component
// or branch produced them, the client arm adopts those server nodes silently.
// Its component call has no server range of its own, and a component call
// that is a hole in that call's template finds its server node by walking the
// adopted nodes. The server renders the hole's call either framed by its own
// range or inline, as the other arm's raw markup. A hole the server's element
// has no node for is a missing node: with no Suspense boundary, the root
// renders on the client and reports it once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/in-place-fragment-hole.tsrx',
);
const FILE = 'in-place-fragment-hole.tsrx';
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

const server = loadServerFixture(FIXTURE, { id: FILE });
const clients = {
	development: loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev: true },
	}),
	production: loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev: false },
	}),
};

let container: HTMLElement;
let root: ReturnType<typeof hydrateRoot> | null;
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

const warnings = () =>
	errSpy.mock.calls
		.map((call: unknown[]) => String(call[0]))
		.filter((message: string) => message.includes('hydration mismatch'));

/** Every server element in the fixture's host, and the hydration's recoverable errors. */
async function hydrate(
	client: Record<string, any>,
	name: string,
	serverProps: Record<string, unknown>,
	clientProps: Record<string, unknown>,
): Promise<{ host: Element; serverNodes: Element[]; recoverable: string[] }> {
	container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
	const host = container.firstElementChild!;
	const serverNodes = [...host.querySelectorAll('*')];
	const recoverable: string[] = [];
	root = hydrateRoot(container, client[name], clientProps, {
		onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
	});
	flushSync(() => {});
	// Recoverable reports are delivered after the hydration burst.
	await act(async () => {});
	return { host, serverNodes, recoverable };
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a component hole in a template adopted in place ($name)', ({ dev }) => {
	const client = dev ? clients.development : clients.production;

	it.each([
		{
			hole: 'a hookless call the server rendered inline',
			name: 'HoleRaw',
			html: '<i>p</i><em>e</em><em>e</em>',
		},
		{
			hole: 'a hookless call the server framed in its own range',
			name: 'HoleFramed',
			html: '<i>p</i><em>e</em><em>e</em>',
		},
		{
			hole: 'a call with hooks the server rendered inline',
			name: 'HoleRawState',
			html: '<i>p</i><em>e</em><em>e</em>',
		},
		{
			hole: 'a hookless call the server rendered inline in an element template',
			name: 'HoleRawElement',
			html: '<div><i>p</i><em>e</em></div><em>e</em>',
		},
	])('adopts the server node of $hole', async ({ name, html }) => {
		const { host, serverNodes, recoverable } = await hydrate(
			client,
			name,
			{ on: false },
			{ on: true },
		);

		expect(container.firstElementChild).toBe(host);
		const nodes = [...host.querySelectorAll('*')];
		expect(markup(host)).toBe(html);
		expect(nodes).toHaveLength(serverNodes.length);
		nodes.forEach((node, i) => expect(node).toBe(serverNodes[i]));
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		// Each arm renders over the other as usual afterwards.
		flushSync(() => root!.render(client[name], { on: false }));
		expect(markup(host)).toBe(html);
		flushSync(() => root!.render(client[name], { on: true }));
		expect(markup(host)).toBe(html);
	});

	it.each([
		{ hole: 'a hookless call', name: 'HoleMissingElement' },
		{ hole: 'a call with hooks', name: 'HoleMissingElementState' },
	])(
		'renders the root on the client for $hole whose server element ends before it',
		async ({ name }) => {
			const { host, serverNodes, recoverable } = await hydrate(
				client,
				name,
				{ on: false },
				{ on: true },
			);

			expect(host.isConnected).toBe(false);
			expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
			expect(markup(container.firstElementChild!)).toBe('<div><i>p</i><em>e</em></div><em>e</em>');
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toHaveLength(dev ? 1 : 0);

			// Each arm renders over the other as usual afterwards.
			flushSync(() => root!.render(client[name], { on: false }));
			expect(markup(container.firstElementChild!)).toBe('<div><i>p</i></div><em>e</em>');
			flushSync(() => root!.render(client[name], { on: true }));
			expect(markup(container.firstElementChild!)).toBe('<div><i>p</i><em>e</em></div><em>e</em>');
		},
	);
});
