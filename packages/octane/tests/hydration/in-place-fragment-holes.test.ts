import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered another component's raw markup where a client call
// renders a fragment with a renderable hole. React compares only the DOM, so it
// adopts that markup where it matches. Octane's server frames every component
// call, so the call finds no range of its own there: the root renders on the
// client and reports once, as it does for server content after the fragment.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/in-place-fragment-holes.tsrx',
);
const FILE = 'in-place-fragment-holes.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** The `file:line:col` of the `<Para` call that starts the client arm `arm`. */
function paraSite(arm: string): string {
	const start = LINES.findIndex((line) => line.includes(`function ${arm}(`));
	if (start < 0) throw new Error(`fixture has no function ${arm}`);
	const index = LINES.findIndex((line, i) => i > start && line.includes('<Para'));
	return `${FILE}:${index + 1}:${LINES[index].indexOf('<Para')}`;
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

function noRange(site: string): string {
	return (
		`Octane hydration mismatch at ${site}: the client expected a component range but the ` +
		`server rendered <p>. The nearest Suspense or Hydrate boundary, or the root, will be ` +
		`regenerated on the client.`
	);
}

const SHAPES = [
	{
		shape: 'text as the last root',
		name: 'TextHole',
		arm: 'TextCalls',
		html: '<p>p</p><em>e</em>x',
	},
	{
		shape: 'text before a root',
		name: 'TextHoleRoot',
		arm: 'TextItalicCalls',
		html: '<p>p</p><em>e</em>x<i>i</i>',
	},
	{
		shape: 'an element as the last root',
		name: 'ElementHole',
		arm: 'ChildCalls',
		html: '<p>p</p><em>e</em><b>x</b>',
	},
];

const TAILS = [
	{ shape: 'a text hole', name: 'TextHoleTail', arm: 'TextCalls', html: '<p>p</p><em>e</em>x' },
	{ shape: 'a null hole', name: 'NullHoleTail', arm: 'NullCalls', html: '<p>p</p><em>e</em>' },
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])(
	'hydrateRoot — a renderable hole in a fragment the server rendered without its call ($name)',
	({ dev, runtime }) => {
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

		// OCTANE DIVERGENCE: React adopts the server's markup where its DOM matches.
		it.each(SHAPES)(
			'client-renders the root for matching markup of a hole that renders $shape',
			async ({ name, arm, html }) => {
				const section = render(name, { server: true });
				expect(markup(section)).toBe(html);
				const serverNodes = content(section);

				const recoverable = await hydrate(name, {});

				const live = container.firstElementChild!;
				expect(live).not.toBe(section);
				expect(markup(live)).toBe(html);
				expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
				expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
				expect(warnings()).toEqual(dev ? [noRange(paraSite(arm))] : []);

				// The hole updates what the client rendered.
				await act(async () => root!.render(client[name], { text: 'y' }));
				expect(markup(live)).toBe(html.replace('x', 'y'));
			},
		);

		it.each(TAILS)(
			'client-renders the root when the server rendered more after a fragment ending in $shape',
			async ({ name, arm, html }) => {
				const section = render(name, { server: true });
				expect(markup(section)).toBe(`${html}<s class="tail">s</s>`);
				const serverNodes = content(section);

				const recoverable = await hydrate(name, {});

				const live = container.firstElementChild!;
				expect(live).not.toBe(section);
				expect(markup(live)).toBe(html);
				expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
				expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
				expect(warnings()).toEqual(dev ? [noRange(paraSite(arm))] : []);

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
	},
);
