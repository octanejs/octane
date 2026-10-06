import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A component's server range can hold raw markup the server rendered for
// another component, while the client's content there is a sequence of calls
// with no server ranges of their own. Each call adopts its server node in
// place, and the server markup after the last call's roots is an unhydrated
// tail. As in React, that tail is a mismatch: with no Suspense boundary around
// it, the root renders on the client, no server node survives, and the
// mismatch is reported once.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/in-place-tail.tsrx');
const FILE = 'in-place-tail.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** The `file:line:col` of `text`, on the first line after the one containing `after`. */
function siteOf(after: string, text: string): string {
	const start = LINES.findIndex((line) => line.includes(after));
	if (start < 0) throw new Error(`fixture has no line containing ${after}`);
	const index = LINES.findIndex((line, i) => i > start && line.includes(text));
	if (index < 0) throw new Error(`fixture has no ${text} after ${after}`);
	return `${FILE}:${index + 1}:${LINES[index].indexOf(text)}`;
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

function mismatch(site: string, expected: string, actual: string): string {
	return (
		`Octane hydration mismatch at ${site}: the client expected ${expected} but the server ` +
		`rendered ${actual}. The nearest Suspense or Hydrate boundary, or the root, will be ` +
		`regenerated on the client.`
	);
}

const ARM = (name: string) => () => siteOf(`export function ${name}(`, '<Arm />');

const SHAPES = [
	{
		shape: 'hookless calls',
		name: 'InPlaceTail',
		client: '<p>p</p><em>e</em>',
		server: '<p>p</p><em>e</em><s class="tail">s</s>',
		site: ARM('InPlaceTail'),
	},
	{
		shape: 'calls with hooks',
		name: 'StateTail',
		client: '<p>p</p><em>e</em>',
		server: '<p>p</p><em>e</em><s class="tail">s</s>',
		site: ARM('StateTail'),
	},
	{
		shape: 'a last call that adopts a fragment',
		name: 'FragmentTail',
		client: '<p>p</p><em>e</em><i>i</i>',
		server: '<p>p</p><em>e</em><i>i</i><s class="tail">s</s>',
		site: ARM('FragmentTail'),
	},
	{
		shape: 'hookless calls in a renderable hole',
		name: 'RenderableHole',
		client: '<p>p</p><em>e</em>',
		server: '<p>p</p><em>e</em><s class="tail">s</s>',
		site: () => siteOf('export function RenderableHole(', '<ParaEm />'),
	},
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — the server tail after calls adopted in place ($name)', ({ dev, runtime }) => {
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
		'renders the root on the client over the server tail after $shape',
		async ({ name, client: clientHtml, server: serverHtml, site }) => {
			const section = render(name, { server: true });
			expect(markup(section)).toBe(serverHtml);
			const serverElements = [...container.querySelectorAll('*')];

			const recoverable = await hydrate(name, {});

			expect(markup(container)).toBe(`<section>${clientHtml}</section>`);
			expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [mismatch(site(), 'the end of the component', '<s>')] : []);

			// The client-rendered tree updates like any other.
			const live = container.querySelector('section')!;
			await act(async () => root!.render(client[name], { server: true }));
			expect(markup(live)).toBe(serverHtml);
			await act(async () => root!.render(client[name], {}));
			expect(markup(live)).toBe(clientHtml);
			expect(recoverable).toHaveLength(1);
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		},
	);

	it('renders the root on the client once when the first call finds another tag', async () => {
		const section = render('RebuiltFirst', { server: true });
		expect(markup(section)).toBe('<b class="server">b</b><em>e</em><s class="tail">s</s>');
		const serverElements = [...container.querySelectorAll('*')];

		const recoverable = await hydrate('RebuiltFirst', {});

		expect(markup(container)).toBe('<section><p>p</p><em>e</em></section>');
		expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev ? [mismatch(siteOf('function Para(', '<p>'), '<p>', '<b>')] : [],
		);
	});

	it.each([...SHAPES, { shape: 'calls after a rebuilt root', name: 'RebuiltFirst' }])(
		'reports and removes nothing when the server rendered the client’s $shape',
		async ({ name }) => {
			const section = render(name, {});
			const html = markup(section);
			const nodes = [...section.querySelectorAll('*')];

			const recoverable = await hydrate(name, {});

			expect(markup(section)).toBe(html);
			expect([...section.querySelectorAll('*')]).toEqual(nodes);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);
});
