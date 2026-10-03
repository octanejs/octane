import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';
import * as Swaps from './_fixtures/in-place-mismatch-swap.tsrx';
import { selectCallee, selectFlip } from './_fixtures/in-place-mismatch-swap-callee.tsrx';

// A single-root component call that finds no server range of its own renders
// in place of the server node its parent template's walk found at the hole.
// When the component's body is a branch, the branch bounds exactly the root it
// renders there: an arm whose root does not match the server node rebuilds it
// in the node's place, and one whose root matches adopts it. Either way the
// server siblings stay adopted, and the branch keeps swapping arms and
// unmounting with its caller.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/in-place-branch-anchor.tsrx',
);
const FILE = 'in-place-branch-anchor.tsrx';
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

const SHAPES = [
	{
		shape: 'a host element',
		name: 'Same',
		html: (root: string) => `<section><hr>${root}<hr></section>`,
		server: '<section><hr><u>u</u><hr></section>',
		leaf: '<b>l</b>',
	},
	{
		shape: "a host element's last child",
		name: 'Last',
		html: (root: string) => `<section><hr>${root}</section>`,
		server: '<section><hr><u>u</u></section>',
		leaf: '<b>l</b>',
	},
	{
		shape: "an arm fragment's last root",
		name: 'Arm',
		html: (root: string) => `<hr>${root}`,
		server: '<hr><u>u</u>',
		leaf: '<b>l</b>',
	},
	{
		shape: 'a host element, with a hooked leaf',
		name: 'Hooked',
		html: (root: string) => `<section><hr>${root}<hr></section>`,
		server: '<section><hr><u>u</u><hr></section>',
		leaf: '<b>h</b>',
	},
];

const CASES = SHAPES.flatMap((shape) => [
	{ ...shape, arm: 'element', leafFirst: false },
	{ ...shape, arm: 'component', leafFirst: true },
]);

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — a branch at a single-root call rebuilt in place ($name)', ({ dev, runtime }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	// A production runtime reports the error code instead of the message.
	const MISMATCH =
		runtime === 'production'
			? /^Minified Octane error #51;/
			: /the server-rendered node did not match the client render/;
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		if (runtime === 'production') vi.stubEnv('NODE_ENV', 'production');
	});

	afterEach(() => {
		root?.unmount();
		vi.unstubAllEnvs();
		container.remove();
		errSpy.mockRestore();
	});

	it.each(CASES)(
		'rebuilds the $arm arm in $shape over the server node',
		async ({ name, html, server: serverHtml, leaf, leafFirst }) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				on: false,
				leaf: leafFirst,
			}).html;
			const host = container.querySelector('#r')!;
			expect(markup(host)).toBe(serverHtml);
			const u = host.querySelector('u')!;
			const hrs = [...host.querySelectorAll('hr')];
			const recoverable: string[] = [];
			root = hydrateRoot(container, client[name], { on: true, leaf: leafFirst } as never, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			});
			flushSync(() => {});
			// Recoverable reports are delivered after the hydration burst.
			await act(async () => {});

			const first = leafFirst ? leaf : '<p>f</p>';
			const other = leafFirst ? '<p>f</p>' : leaf;
			expect(container.querySelector('#r')).toBe(host);
			expect(markup(host)).toBe(html(first));
			expect(u.isConnected).toBe(false);
			expect(hrs.every((hr) => hr.isConnected)).toBe(true);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);

			// The branch swaps its arm in the rebuilt root's place.
			flushSync(() => root!.render(client[name], { on: true, leaf: !leafFirst }));
			expect(markup(host)).toBe(html(other));
			flushSync(() => root!.render(client[name], { on: true, leaf: leafFirst }));
			expect(markup(host)).toBe(html(first));

			// The caller's arm unmounts the branch with the rest of its content.
			flushSync(() => root!.render(client[name], { on: false, leaf: leafFirst }));
			expect(markup(host)).toBe(serverHtml);
			flushSync(() => root!.render(client[name], { on: true, leaf: !leafFirst }));
			expect(markup(host)).toBe(html(other));

			root!.unmount();
			root = null;
			expect(container.innerHTML).toBe('');
		},
	);

	// Where the arm's root matches the server node, the branch adopts it in
	// place and bounds it, so the other arm replaces it.
	it.each([
		{ arm: 'element', name: 'Match', tag: 'p', first: '<p>f</p>', other: '<b>l</b>', leaf: false },
		{
			arm: 'component',
			name: 'MatchLeaf',
			tag: 'b',
			first: '<b>h</b>',
			other: '<p>f</p>',
			leaf: true,
		},
	])(
		'adopts the server node that matches the $arm arm',
		async ({ name, tag, first, other, leaf }) => {
			container.innerHTML = ServerRT.renderToString(server[name], { on: false, leaf }).html;
			const host = container.querySelector('#r')!;
			const adopted = host.querySelector(tag)!;
			const recoverable: string[] = [];
			root = hydrateRoot(container, client[name], { on: true, leaf } as never, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			});
			flushSync(() => {});
			await act(async () => {});

			const html = (node: string) => `<section><hr>${node}<hr></section>`;
			expect(markup(host)).toBe(html(first));
			expect(host.querySelector(tag)).toBe(adopted);
			expect(recoverable).toEqual([]);

			flushSync(() => root!.render(client[name], { on: true, leaf: !leaf }));
			expect(markup(host)).toBe(html(other));
			flushSync(() => root!.render(client[name], { on: true, leaf }));
			expect(markup(host)).toBe(html(first));
			flushSync(() => root!.render(client[name], { on: false, leaf }));
			expect(markup(host)).toBe(html(first));

			root!.unmount();
			root = null;
			expect(container.innerHTML).toBe('');
		},
	);

	// The server's own output frames the branch, which adopts its range.
	it.each([false, true])('adopts its own server output (leaf: %s)', async (leaf) => {
		container.innerHTML = ServerRT.renderToString(server.Same, { on: true, leaf }).html;
		const host = container.querySelector('#r')!;
		const nodes = [...host.querySelectorAll('section, hr, p, b')];
		const recoverable: string[] = [];
		root = hydrateRoot(container, client.Same, { on: true, leaf } as never, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		await act(async () => {});

		const html = (node: string) => `<section><hr>${node}<hr></section>`;
		expect(markup(host)).toBe(html(leaf ? '<b>l</b>' : '<p>f</p>'));
		const hydrated = host.querySelectorAll('section, hr, p, b');
		expect(hydrated).toHaveLength(nodes.length);
		expect(nodes.every((node, i) => hydrated[i] === node)).toBe(true);
		expect(recoverable).toEqual([]);

		flushSync(() => root!.render(client.Same, { on: true, leaf: !leaf }));
		expect(markup(host)).toBe(html(leaf ? '<p>f</p>' : '<b>l</b>'));

		root!.unmount();
		root = null;
		expect(container.innerHTML).toBe('');
	});
});

// A cross-module call to a component that is proven to render one root, where
// the server's arm rendered something else, renders the callee's root in place
// of the server's node there. When the callee's body is a branch, the branch
// later moves the callee's boundary onto a comment pair of its own, and a
// render that reads a different component from the imported binding then
// replaces that pair. The fixture is imported, so its import of the callee is
// a live binding: the `octane` project compiles it for development and
// `octane-prod` for production, where the production runtime runs it too.
describe('hydrateRoot — a single-root cross-module call whose branch is rebuilt in place', () => {
	const SWAP_FIXTURE = join(
		process.cwd(),
		'packages/octane/tests/hydration/_fixtures/in-place-mismatch-swap.tsrx',
	);
	const CALLEE_FIXTURE = join(
		process.cwd(),
		'packages/octane/tests/hydration/_fixtures/in-place-mismatch-swap-callee.tsrx',
	);
	const server = loadServerFixture(SWAP_FIXTURE, {
		id: 'in-place-mismatch-swap.tsrx',
		runtimeModules: {
			'./in-place-mismatch-swap-callee.tsrx': loadServerFixture(CALLEE_FIXTURE, {
				id: 'in-place-mismatch-swap-callee.tsrx',
			}),
		},
	});
	const production = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
	const client = Swaps as Record<string, (props: { on: boolean; n: string }) => void>;

	const SWAP_SHAPES = [
		{
			shape: 'a host element',
			name: 'Swap',
			html: (n: string, root: string) =>
				`<div id="r"><section title="${n}"><hr>${root}<hr></section></div>`,
		},
		{
			shape: "a host element's last child",
			name: 'SwapLast',
			html: (n: string, root: string) =>
				`<div id="r"><section title="${n}"><hr>${root}</section></div>`,
		},
		{
			shape: 'a host element, adopting the server node in place',
			name: 'SwapInPlace',
			html: (n: string, root: string) =>
				`<div id="r"><section title="${n}"><hr>${root}<hr></section></div>`,
		},
	];

	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		selectFlip(false);
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		if (production) vi.stubEnv('NODE_ENV', 'production');
	});

	afterEach(() => {
		root?.unmount();
		vi.unstubAllEnvs();
		container.remove();
		errSpy.mockRestore();
		selectFlip(false);
		selectCallee(false);
	});

	it.each(SWAP_SHAPES)(
		'flips the branch and then swaps the callee in $shape',
		async ({ name, html }) => {
			container.innerHTML = ServerRT.renderToString(server[name], { on: false, n: 'a' }).html;
			root = hydrateRoot(container, client[name], { on: true, n: 'a' } as never, {
				onRecoverableError: () => {},
			});
			flushSync(() => {});
			await act(async () => {});
			expect(markup(container)).toBe(html('a', '<p>f</p>'));

			selectFlip(true);
			flushSync(() => root!.render(client[name], { on: true, n: 'b' }));
			expect(markup(container)).toBe(html('b', '<b>l</b>'));

			selectCallee(true);
			flushSync(() => root!.render(client[name], { on: true, n: 'c' }));
			expect(markup(container)).toBe(html('c', '<p>o</p>'));

			selectCallee(false);
			flushSync(() => root!.render(client[name], { on: true, n: 'd' }));
			expect(markup(container)).toBe(html('d', '<p>p</p>'));

			root!.unmount();
			root = null;
			expect(container.innerHTML).toBe('');
		},
	);
});
