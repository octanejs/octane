import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';
import * as Swaps from './_fixtures/in-place-mismatch-swap.tsrx';
import { selectCallee, selectFlip } from './_fixtures/in-place-mismatch-swap-callee.tsrx';

// A single-root component whose body is a branch, called where the server's arm
// rendered another element. As in React, the server HTML does not match, and
// nothing is rebuilt in place: with no Suspense or Hydrate boundary the root
// discards its server DOM, renders on the client, and reports once. The
// client-rendered branch then keeps swapping arms and unmounting with its
// caller.

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
])(
	'hydrateRoot — a branch at a single-root call over another server element ($name)',
	({ dev, runtime }) => {
		const server = loadServerFixture(FIXTURE, { id: FILE });
		const client = loadCompiledFixtureSource(SOURCE, {
			id: FILE,
			mode: 'client',
			compileOptions: { dev },
		});
		// A production runtime reports the error code instead of the message.
		const MISMATCH =
			runtime === 'production'
				? /^Minified Octane error #339;/
				: /^Hydration failed because the server rendered HTML didn't match the client\./;
		let container: HTMLElement;
		let root: ReturnType<typeof hydrateRoot> | null;
		let errSpy: ReturnType<typeof vi.spyOn>;
		let recoverable: string[];

		beforeEach(() => {
			container = document.createElement('div');
			document.body.appendChild(container);
			root = null;
			recoverable = [];
			errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			if (runtime === 'production') vi.stubEnv('NODE_ENV', 'production');
		});

		afterEach(() => {
			root?.unmount();
			vi.unstubAllEnvs();
			container.remove();
			errSpy.mockRestore();
		});

		async function hydrate(name: string, props: Record<string, unknown>): Promise<void> {
			root = hydrateRoot(container, client[name], props as never, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			});
			flushSync(() => {});
			// Recoverable reports are delivered after the hydration burst.
			await act(async () => {});
		}

		const host = () => container.querySelector('#r')!;

		it.each(CASES)(
			'renders the root on the client for the $arm arm in $shape',
			async ({ name, html, server: serverHtml, leaf, leafFirst }) => {
				container.innerHTML = ServerRT.renderToString(server[name], {
					on: false,
					leaf: leafFirst,
				}).html;
				expect(markup(host())).toBe(serverHtml);
				const served = [...container.querySelectorAll('*')];
				await hydrate(name, { on: true, leaf: leafFirst });

				const first = leafFirst ? leaf : '<p>f</p>';
				const other = leafFirst ? '<p>f</p>' : leaf;
				expect(markup(host())).toBe(html(first));
				expect(served.filter((node) => node.isConnected)).toEqual([]);
				expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);

				// The client-rendered branch swaps its arm in place.
				const rendered = host();
				flushSync(() => root!.render(client[name], { on: true, leaf: !leafFirst }));
				expect(markup(host())).toBe(html(other));
				flushSync(() => root!.render(client[name], { on: true, leaf: leafFirst }));
				expect(markup(host())).toBe(html(first));

				// The caller's arm unmounts the branch with the rest of its content.
				flushSync(() => root!.render(client[name], { on: false, leaf: leafFirst }));
				expect(markup(host())).toBe(serverHtml);
				flushSync(() => root!.render(client[name], { on: true, leaf: !leafFirst }));
				expect(markup(host())).toBe(html(other));
				expect(host()).toBe(rendered);
				expect(recoverable).toHaveLength(1);

				root!.unmount();
				root = null;
				expect(container.innerHTML).toBe('');
			},
		);

		// OCTANE DIVERGENCE: Octane's control-flow and component ranges are part of
		// its hydration protocol, as React's Suspense markers are part of React's.
		// The server's arm rendered the matching element without the branch's range
		// around it, so this is a structural mismatch and the root renders on the
		// client, where React, which has no range markers, would adopt the element.
		it.each([
			{ arm: 'element', name: 'Match', first: '<p>f</p>', other: '<b>l</b>', leaf: false },
			{
				arm: 'component',
				name: 'MatchLeaf',
				first: '<b>h</b>',
				other: '<p>f</p>',
				leaf: true,
			},
		])(
			'renders the root on the client where the server rendered the $arm arm outside its range',
			async ({ name, first, other, leaf }) => {
				container.innerHTML = ServerRT.renderToString(server[name], { on: false, leaf }).html;
				const served = [...container.querySelectorAll('*')];
				await hydrate(name, { on: true, leaf });

				const html = (node: string) => `<section><hr>${node}<hr></section>`;
				expect(markup(host())).toBe(html(first));
				expect(served.filter((node) => node.isConnected)).toEqual([]);
				expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);

				flushSync(() => root!.render(client[name], { on: true, leaf: !leaf }));
				expect(markup(host())).toBe(html(other));
				flushSync(() => root!.render(client[name], { on: true, leaf }));
				expect(markup(host())).toBe(html(first));
				flushSync(() => root!.render(client[name], { on: false, leaf }));
				expect(markup(host())).toBe(html(first));
				expect(recoverable).toHaveLength(1);

				root!.unmount();
				root = null;
				expect(container.innerHTML).toBe('');
			},
		);

		// The server's own output frames the branch, which adopts its range.
		it.each([false, true])('adopts its own server output (leaf: %s)', async (leaf) => {
			container.innerHTML = ServerRT.renderToString(server.Same, { on: true, leaf }).html;
			const nodes = [...host().querySelectorAll('section, hr, p, b')];
			await hydrate('Same', { on: true, leaf });

			const html = (node: string) => `<section><hr>${node}<hr></section>`;
			expect(markup(host())).toBe(html(leaf ? '<b>l</b>' : '<p>f</p>'));
			const hydrated = host().querySelectorAll('section, hr, p, b');
			expect(hydrated).toHaveLength(nodes.length);
			expect(nodes.every((node, i) => hydrated[i] === node)).toBe(true);
			expect(recoverable).toEqual([]);

			flushSync(() => root!.render(client.Same, { on: true, leaf: !leaf }));
			expect(markup(host())).toBe(html(leaf ? '<p>f</p>' : '<b>l</b>'));

			root!.unmount();
			root = null;
			expect(container.innerHTML).toBe('');
		});
	},
);

// A cross-module call to a component that is proven to render one root, inside
// a @try/@pending arm whose server output rendered something else there. The
// arm renders on the client alone, and its host element keeps its identity.
// The callee's branch then flips, and a render that reads a different
// component from the imported binding replaces it. The fixture is imported, so
// its import of the callee is a live binding: the `octane` project compiles it
// for development and `octane-prod` for production, where the production
// runtime runs it too.
describe('hydrateRoot — a single-root cross-module call in a mismatched @try arm', () => {
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
			shape: 'a host element, where the server rendered an element of the same tag',
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
			const host = container.querySelector('#r');
			const section = container.querySelector('section')!;
			const recoverable: unknown[] = [];
			root = hydrateRoot(container, client[name], { on: true, n: 'a' } as never, {
				onRecoverableError: (error) => recoverable.push(error),
			});
			flushSync(() => {});
			await act(async () => {});
			expect(markup(container)).toBe(html('a', '<p>f</p>'));
			expect(container.querySelector('#r')).toBe(host);
			expect(section.isConnected).toBe(false);
			expect(recoverable).toHaveLength(1);

			selectFlip(true);
			flushSync(() => root!.render(client[name], { on: true, n: 'b' }));
			expect(markup(container)).toBe(html('b', '<b>l</b>'));

			selectCallee(true);
			flushSync(() => root!.render(client[name], { on: true, n: 'c' }));
			expect(markup(container)).toBe(html('c', '<p>o</p>'));

			selectCallee(false);
			flushSync(() => root!.render(client[name], { on: true, n: 'd' }));
			expect(markup(container)).toBe(html('d', '<p>p</p>'));
			expect(recoverable).toHaveLength(1);

			root!.unmount();
			root = null;
			expect(container.innerHTML).toBe('');
		},
	);
});
