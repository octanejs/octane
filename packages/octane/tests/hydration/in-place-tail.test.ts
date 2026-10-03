import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A component's server range can hold raw markup the server rendered for
// another component, while the client's content there is a sequence of calls
// with no server ranges of their own. Each call adopts its server node in
// place, and the server markup after the last call's roots is stale:
// hydration removes it and reports the mismatch once, while the nodes the
// calls adopted keep their identity.

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

function rebuilt(site: string): string {
	return (
		`Octane hydration mismatch at ${site}: the client expected <p> but the server rendered <b>. ` +
		`The mismatched subtree was rebuilt on the client.`
	);
}

function tail(site: string): string {
	return (
		`Octane hydration mismatch at ${site}: the client expected the end of the component but ` +
		`the server rendered <s>. The mismatched subtree was rebuilt on the client.`
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
			? /^Minified Octane error #51;/
			: /the server-rendered node did not match the client render/;
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
		'removes the server tail after $shape',
		async ({ name, client: clientHtml, server: serverHtml, site }) => {
			const section = render(name, { server: true });
			expect(markup(section)).toBe(serverHtml);
			const adopted = [...section.querySelectorAll('p, em, i')];
			const stale = section.querySelector('.tail')!;

			const recoverable = await hydrate(name, {});

			expect(markup(section)).toBe(clientHtml);
			expect([...section.querySelectorAll('p, em, i')]).toEqual(adopted);
			expect(stale.isConnected).toBe(false);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [tail(site())] : []);

			// The range the client settled still updates in place.
			await act(async () => root!.render(client[name], { server: true }));
			expect(markup(section)).toBe(serverHtml);
			await act(async () => root!.render(client[name], {}));
			expect(markup(section)).toBe(clientHtml);
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		},
	);

	it('removes the server tail after a call that adopted in place follows a rebuilt root', async () => {
		const section = render('RebuiltFirst', { server: true });
		expect(markup(section)).toBe('<b class="server">b</b><em>e</em><s class="tail">s</s>');
		const stale = [...section.querySelectorAll('.server, .tail')];
		const adopted = section.querySelector('em')!;

		const recoverable = await hydrate('RebuiltFirst', {});

		expect(markup(section)).toBe('<p>p</p><em>e</em>');
		expect(section.querySelector('em')).toBe(adopted);
		for (const node of stale) expect(node.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev ? [rebuilt(siteOf('function Para(', '<p>')), tail(ARM('RebuiltFirst')())] : [],
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
