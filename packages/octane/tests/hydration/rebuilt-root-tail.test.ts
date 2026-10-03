import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A component's server range can start with an element that does not match
// the single root the client renders as that range's content, followed by
// more server content: the server rendered another component there, or more
// from this one. The client rebuilds its root over that element and reports
// the mismatch. Whatever the server rendered after the element in the range is
// the rest of the same mismatch: hydration removes it without a second report,
// while the server nodes after the range keep their identity. Server content
// after nodes the client does claim is still reported on its own.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-root-tail.tsrx',
);
const FILE = 'rebuilt-root-tail.tsrx';
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

const SERVER_HTML = '<b class="server">server</b><em class="tail">tail</em><em>e</em>';
const PARA = () => siteOf('function Para(', '<p>');

const SHAPES = [
	{ shape: 'a lite component in another arm’s range', name: 'Branch', site: PARA },
	{
		shape: 'a component with hooks in another arm’s range',
		name: 'StateBranch',
		site: () => siteOf('function StatePara(', '<p>'),
	},
	{
		shape: 'a component whose identity differs on the client',
		name: 'DynamicIdentity',
		site: () => siteOf('function StatePara(', '<p>'),
	},
	{
		shape: 'a template component whose identity differs on the client',
		name: 'DynamicTemplate',
		site: PARA,
	},
	{ shape: 'a lite component in a renderable hole', name: 'RenderableHole', site: PARA },
	{
		shape: 'a component that returns less on the client',
		name: 'ConditionalReturn',
		site: () => siteOf('function Returning(', '<p>'),
	},
	{ shape: 'a component in a list item range', name: 'ListItem', site: PARA },
	{ shape: 'a call that inherits its component’s range', name: 'InheritedCall', site: PARA },
];

const CONTROLS = [
	{
		control: 'a later call’s server range',
		name: 'ClaimedTail',
		html: '<b class="server">server</b><em>e</em><s class="tail">s</s>',
	},
	{
		control: 'the template’s element after a hole',
		name: 'HoleThenElement',
		html: '<b class="server">server</b><em>e</em><s class="tail">s</s>',
	},
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — the server tail after a rebuilt component root ($name)', ({ dev, runtime }) => {
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
		'removes the server tail after a root rebuilt in $shape',
		async ({ name, site }) => {
			const section = render(name, { server: true });
			expect(markup(section)).toBe(SERVER_HTML);
			const stale = [...section.querySelectorAll('.server, .tail')];
			const sibling = section.querySelector('em:not(.tail)')!;

			const recoverable = await hydrate(name, {});

			expect(markup(section)).toBe('<p>p</p><em>e</em>');
			expect(section.querySelector('em')).toBe(sibling);
			for (const node of stale) expect(node.isConnected).toBe(false);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [rebuilt(site())] : []);

			// The range the client settled still updates in place.
			await act(async () => root!.render(client[name], { server: true }));
			expect(markup(section)).toBe(SERVER_HTML);
			await act(async () => root!.render(client[name], {}));
			expect(markup(section)).toBe('<p>p</p><em>e</em>');
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		},
	);

	it('removes the server tail once a suspended attempt that rebuilt the root retries', async () => {
		const section = render('SuspendedBranch', { server: true, value: Promise.resolve('') });
		const html = markup(section);
		expect(html).toBe(SERVER_HTML);
		const stale = [...section.querySelectorAll('.server, .tail')];
		const sibling = section.querySelector('em:not(.tail)')!;
		let resolve!: (value: string) => void;
		const value = new Promise<string>((done) => (resolve = done));

		const recoverable = await hydrate('SuspendedBranch', { value });

		// The server's content stays until an attempt commits.
		expect(markup(section)).toBe(html);
		for (const node of stale) expect(node.isConnected).toBe(true);

		await act(async () => resolve('z'));

		expect(markup(section)).toBe('<p><i>z</i></p><em>e</em>');
		expect(section.querySelector('em')).toBe(sibling);
		for (const node of stale) expect(node.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [rebuilt(siteOf('function SuspendedPara(', '<p>'))] : []);
	});

	it.each(CONTROLS)(
		'keeps $control after a rebuilt root, and reports the server content after it',
		async ({ name, html }) => {
			const section = render(name, { server: true });
			expect(markup(section)).toBe(html);
			const stale = [...section.querySelectorAll('.server, .tail')];
			const claimed = section.querySelector('em')!;

			const recoverable = await hydrate(name, {});

			expect(markup(section)).toBe('<p>p</p><em>e</em>');
			expect(section.querySelector('em')).toBe(claimed);
			for (const node of stale) expect(node.isConnected).toBe(false);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(
				dev ? [rebuilt(PARA()), tail(siteOf(`export function ${name}(`, '<Arm />'))] : [],
			);
		},
	);

	it('keeps the node a later call claims after a root rebuilt by a branch with no server range', async () => {
		const section = render('MarkerlessRebuilt', { server: true });
		const stale = section.querySelector('.server')!;
		const claimed = section.querySelector('em')!;

		const recoverable = await hydrate('MarkerlessRebuilt', { inner: true });

		expect(markup(section)).toBe('<p>p</p><em>e</em>');
		expect(section.querySelector('em')).toBe(claimed);
		expect(stale.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev ? [rebuilt(siteOf('export function MarkerlessRebuilt(', '<p>'))] : [],
		);
	});

	it.each([
		...SHAPES.map(({ shape, name }) => ({ shape, name })),
		...CONTROLS.map(({ control, name }) => ({ shape: control, name })),
	])(
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
