import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A component call with no server range of its own adopts a fragment template
// in place of the raw markup the server rendered for another component. That
// markup frames none of its holes, so where the fragment holds a renderable
// hole, the server rendered bare text for a text value, an element for an
// element, and nothing for null. The hole adopts that node rather than adding
// its own. Whatever the server rendered after the fragment's roots is a
// mismatch, as in React, which compares only the DOM: nothing is repaired in
// place, the root renders on the client and reports once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/in-place-fragment-holes.tsrx',
);
const FILE = 'in-place-fragment-holes.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** The `file:line:col` of the `<Arm` call in the export `name`. */
function armSite(name: string): string {
	const start = LINES.findIndex((line) => line.includes(`export function ${name}(`));
	if (start < 0) throw new Error(`fixture has no export ${name}`);
	const index = LINES.findIndex((line, i) => i > start && line.includes('<Arm'));
	return `${FILE}:${index + 1}:${LINES[index].indexOf('<Arm')}`;
}

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** The element and text children of `node`. */
function content(node: Node): Node[] {
	return [...node.childNodes].filter((child) => child.nodeType !== 8);
}

/** The same node objects, not merely equal ones. */
function expectSameNodes(actual: readonly Node[], expected: readonly Node[]) {
	expect(actual).toHaveLength(expected.length);
	actual.forEach((node, index) => expect(node).toBe(expected[index]));
}

function tail(site: string): string {
	return (
		`Octane hydration mismatch at ${site}: the client expected the end of the component but ` +
		`the server rendered <s>. The nearest Suspense or Hydrate boundary, or the root, will be ` +
		`regenerated on the client.`
	);
}

const SHAPES = [
	{ shape: 'text as the last root', name: 'TextHole', html: '<p>p</p><em>e</em>x' },
	{ shape: 'text before a root', name: 'TextHoleRoot', html: '<p>p</p><em>e</em>x<i>i</i>' },
	{ shape: 'an element as the last root', name: 'ElementHole', html: '<p>p</p><em>e</em><b>x</b>' },
];

const TAILS = [
	{ shape: 'a text hole', name: 'TextHoleTail', html: '<p>p</p><em>e</em>x' },
	{ shape: 'a null hole', name: 'NullHoleTail', html: '<p>p</p><em>e</em>' },
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — a renderable hole in a fragment adopted in place ($name)', ({ dev, runtime }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	// A production runtime reports the error code instead of React's message.
	const MISMATCH =
		runtime === 'production'
			? /^Minified Octane error #339;/
			: /server rendered HTML didn't match the client/;
	let container: HTMLElement;
	let root: { render(component: unknown, props?: unknown): void; unmount(): void } | null;
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

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	function render(name: string, props: Record<string, unknown>): Element {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
		return container.firstElementChild!;
	}

	async function hydrate(name: string, props: Record<string, unknown>): Promise<string[]> {
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], props as never, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		}) as never;
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return recoverable;
	}

	it.each(SHAPES)(
		'adopts the server node of a hole that renders $shape',
		async ({ name, html }) => {
			const section = render(name, { server: true });
			expect(markup(section)).toBe(html);
			const nodes = content(section);

			const recoverable = await hydrate(name, {});

			expect(markup(section)).toBe(html);
			expectSameNodes(content(section), nodes);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			// The hole updates what it adopted.
			await act(async () => root!.render(client[name], { text: 'y' }));
			expect(markup(section)).toBe(html.replace('x', 'y'));
			expectSameNodes(content(section), nodes);

			// The arm the client adopted unmounts and mounts again.
			await act(async () => root!.render(client[name], { server: true }));
			expect(markup(section)).toBe(html);
			await act(async () => root!.render(client[name], {}));
			expect(markup(section)).toBe(html);
			expect(warnings()).toEqual([]);
		},
	);

	it.each(TAILS)(
		'client-renders the root when the server rendered more after a fragment ending in $shape',
		async ({ name, html }) => {
			const section = render(name, { server: true });
			expect(markup(section)).toBe(`${html}<s class="tail">s</s>`);
			const serverNodes = content(section);

			const recoverable = await hydrate(name, {});

			const live = container.firstElementChild!;
			expect(live).not.toBe(section);
			expect(markup(live)).toBe(html);
			expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [tail(armSite(name))] : []);

			// The client-rendered content updates in place.
			await act(async () => root!.render(client[name], { server: true }));
			expect(markup(live)).toBe(`${html}<s class="tail">s</s>`);
			await act(async () => root!.render(client[name], {}));
			expect(markup(live)).toBe(html);
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		},
	);

	it.each([...SHAPES, ...TAILS])(
		'reports and removes nothing when the server rendered the client’s calls ($name)',
		async ({ name, html }) => {
			const section = render(name, {});
			expect(markup(section)).toBe(html);
			const nodes = content(section);

			const recoverable = await hydrate(name, {});

			expect(markup(section)).toBe(html);
			expectSameNodes(content(section), nodes);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);
});
