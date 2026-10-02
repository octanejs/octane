import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A component call that finds no server range of its own, because the server
// rendered another @if arm there, adopts the server nodes at the cursor in
// place when its template matches them. When that template has several roots,
// hydration must continue after all of them: the next component adopts its own
// server range rather than the fragment's second root, and nothing discards
// that range. The development compile renders these calls through the lite
// component slot; the production compile through the full component slot.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/unframed-fragment-root.tsrx',
);
const FILE = 'unframed-fragment-root.tsrx';
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

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — the call after an unframed fragment root ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
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

	/** Hydrate `name`'s server arm with its client arm. */
	async function hydrate(
		name: string,
	): Promise<{ host: Element; serverNodes: Element[]; recoverable: string[] }> {
		container.innerHTML = ServerRT.renderToString(server[name], { server: true }).html;
		const host = container.firstElementChild!;
		const serverNodes = [...host.children];
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{},
			{
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			},
		);
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { host, serverNodes, recoverable };
	}

	it.each([
		{ shape: 'static roots', name: 'FX', html: '<s>s</s><i>i</i><b>a</b>' },
		{ shape: 'a component as its last root', name: 'GX', html: '<s>s</s><b>a</b><b>a</b>' },
	])(
		'keeps a fragment of $shape, then the next call adopts its own range',
		async ({ name, html }) => {
			const { host, serverNodes, recoverable } = await hydrate(name);

			expect(markup(host)).toBe(html);
			expect(host.children).toHaveLength(serverNodes.length);
			serverNodes.forEach((node, index) => expect(host.children[index]).toBe(node));
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);

	it('unmounts the adopted fragment with its arm', async () => {
		const { host } = await hydrate('FX');

		act(() => root!.render(client.FX, { server: true }));
		expect(markup(host)).toBe('<s>s</s><i>i</i><b>a</b>');
		const serverArm = [...host.children];

		act(() => root!.render(client.FX, {}));
		expect(markup(host)).toBe('<s>s</s><i>i</i><b>a</b>');
		expect([...host.children].some((node) => serverArm.includes(node))).toBe(false);
	});
});
