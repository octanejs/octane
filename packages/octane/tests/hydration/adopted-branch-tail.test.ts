import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered a different @if or @switch arm, whose content starts
// with what the client arm renders and continues with more nodes. The server
// HTML has a tail the client does not render, inside an element, which React
// 19 treats as a mismatch. No Suspense arm encloses the branch, so the whole
// root renders on the client and reports once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/adopted-branch-tail.tsrx',
);
const FILE = 'adopted-branch-tail.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** The `file:line:col` of the first `directive` after the line containing `after`. */
function siteOf(after: string, directive: string): string {
	const start = LINES.findIndex((line) => line.includes(after));
	if (start < 0) throw new Error(`fixture has no line containing ${after}`);
	const index = LINES.findIndex((line, i) => i > start && line.includes(directive));
	if (index < 0) throw new Error(`fixture has no ${directive} after ${after}`);
	return `${FILE}:${index + 1}:${LINES[index].indexOf(directive)}`;
}

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/** The development warning for the server node `actual` after the branch's content. */
function tail(site: string, actual: string) {
	return expect.stringMatching(
		new RegExp(
			'^' +
				escape(
					`Octane hydration mismatch at ${site}: the client expected the end of the branch ` +
						`but the server rendered ${actual}.`,
				),
		),
	);
}

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — a server tail after a branch’s client content ($name)', ({ dev, runtime }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const loadClient = () =>
		loadCompiledFixtureSource(SOURCE, { id: FILE, mode: 'client', compileOptions: { dev } });
	const client = loadClient();
	// A production runtime reports the error code instead of the message.
	const HYDRATION_FAILED =
		runtime === 'production'
			? /^Minified Octane error #339;/
			: /^Hydration failed because the server rendered HTML didn't match the client/;
	let container: HTMLElement;
	let root: { unmount(): void } | null;
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

	/** The server render's elements. */
	function render(name: string, props: Record<string, unknown>): Element[] {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
		return [...container.querySelectorAll('*')];
	}

	async function hydrate(component: unknown): Promise<string[]> {
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			component as never,
			{},
			{
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			},
		);
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return recoverable;
	}

	/** The root fell back: none of the server's elements is still connected. */
	function expectRootFellBack(serverNodes: Element[], recoverable: string[]): void {
		expect(serverNodes.length).toBeGreaterThan(0);
		for (const node of serverNodes) expect(node.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(HYDRATION_FAILED)]);
	}

	it.each([
		{ shape: 'a sole component', name: 'SoleComponent', html: '<i>ok</i>' },
		{ shape: 'a single root', name: 'SingleRoot', html: '<i>ok</i>' },
		{ shape: 'a fragment of static roots', name: 'StaticFragment', html: '<i>ok</i><b>b</b>' },
		{
			shape: 'a fragment ending with a component',
			name: 'HoleFragment',
			html: '<i>ok</i><b>b</b>',
		},
		{
			shape: "a fragment in a helper's template",
			name: 'HelperFragment',
			html: '<div><i>ok</i><b>b</b></div>',
		},
	])('client-renders the root for a server tail after $shape', async ({ name, html }) => {
		const serverNodes = render(name, { server: true });

		const recoverable = await hydrate(client[name]);

		expect(markup(container.firstElementChild!)).toBe(html);
		expectRootFellBack(serverNodes, recoverable);
		expect(warnings()).toEqual(dev ? [tail(siteOf(`function ${name}(`, '@if'), '<s>')] : []);
	});

	it('client-renders the root for a server tail after a @switch case', async () => {
		const serverNodes = render('SwitchBranch', { server: true });

		const recoverable = await hydrate(client.SwitchBranch);

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i>');
		expectRootFellBack(serverNodes, recoverable);
		expect(warnings()).toEqual(
			dev ? [tail(siteOf('function SwitchBranch(', '@switch'), '<s>')] : [],
		);
	});

	it.each([
		{ branch: 'an inner', name: 'NestedBranch', directive: '@if (props.server)' },
		{ branch: 'an outer', name: 'OuterBranch', directive: '@if (props.server)' },
	])(
		'client-renders the root for a server tail of $branch branch of two nested ones',
		async ({ name, directive }) => {
			const serverNodes = render(name, { server: true });

			const recoverable = await hydrate(client[name]);

			expect(markup(container.firstElementChild!)).toBe('<i>ok</i><b>b</b><u>u</u>');
			expectRootFellBack(serverNodes, recoverable);
			expect(warnings()).toEqual(dev ? [tail(siteOf(`function ${name}(`, directive), '<s>')] : []);
		},
	);

	it.each([
		{ shape: 'a fragment arm', name: 'StaticFragment', html: '<i>ok</i><b>b</b>' },
		{
			shape: "a fragment arm in a helper's template",
			name: 'HelperFragment',
			html: '<div><i>ok</i><b>b</b></div>',
		},
	])(
		'reports nothing, and parses no template, when the server rendered the same $shape',
		async ({ name, html }) => {
			render(name, {});
			const adopted = [...container.querySelectorAll('i, b')];
			// Fresh template records: hydration adopts them without parsing any.
			const fresh = loadClient();
			const createElement = vi.spyOn(document, 'createElement');

			const recoverable = await hydrate(fresh[name]);
			const parsed = createElement.mock.calls.filter(([tag]) => tag === 'template');
			createElement.mockRestore();

			expect(markup(container.firstElementChild!)).toBe(html);
			expect([...container.querySelectorAll('i, b')]).toEqual(adopted);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
			if (runtime === 'production') expect(parsed).toEqual([]);
		},
	);

	// The client's last component renders what the server's `<s>` is, and the
	// server's `<u>` after it is the tail.
	it('client-renders the root for a server tail after a component’s matching node', async () => {
		const serverNodes = render('UnframedComponent', { server: true });

		const recoverable = await hydrate(client.UnframedComponent);

		expect(markup(container.firstElementChild!)).toBe('<b>b</b><s>s</s>');
		expectRootFellBack(serverNodes, recoverable);
		expect(warnings()).toEqual(
			dev ? [tail(siteOf('function UnframedComponent(', '@if'), '<u>')] : [],
		);
	});
});
