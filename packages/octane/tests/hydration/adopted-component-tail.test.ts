import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A component's server range can hold more than the client renders into it,
// from the same source: a component whose identity differs on the client, or
// a component that returns less. When the server's content starts with what
// the client renders, the client adopts that prefix. Whatever the server left
// after it is stale: hydration removes it and reports the mismatch once, while
// the nodes the client adopted keep their identity.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/adopted-component-tail.tsrx',
);
const FILE = 'adopted-component-tail.tsrx';
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

/** The `file:line:col` of the declaration `function name(`. */
function definitionOf(name: string): string {
	const index = LINES.findIndex((line) => line.startsWith(`function ${name}(`));
	if (index < 0) throw new Error(`fixture has no function ${name}`);
	return `${FILE}:${index + 1}:0`;
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

/** `actual` holds exactly the `expected` nodes: the same objects, in order. */
function expectSame(actual: ArrayLike<Node>, expected: readonly Node[]): void {
	expect(actual).toHaveLength(expected.length);
	Array.from(actual).forEach((node, i) => expect(node).toBe(expected[i]));
}

function tail(site: string): string {
	return (
		`Octane hydration mismatch at ${site}: the client expected the end of the component but ` +
		`the server rendered <s>. The mismatched subtree was rebuilt on the client.`
	);
}

const SHAPES = [
	{
		shape: 'a component whose identity differs on the client',
		name: 'DynamicIdentity',
		// The client component returns its content into its range.
		site: () => definitionOf('ClientArm'),
	},
	{
		shape: 'a lite component in a renderable hole',
		name: 'RenderableHole',
		site: () => siteOf('function RenderableHole(', '<LiteClient />'),
	},
	{
		shape: 'a template component whose identity differs on the client',
		name: 'DynamicTemplate',
		site: () => siteOf('function DynamicTemplate(', '<Arm />'),
	},
	{
		shape: 'a component that returns less on the client',
		name: 'ConditionalReturn',
		site: () => definitionOf('Returning'),
	},
	{
		shape: 'a component in a list item range',
		name: 'ListItem',
		// The item has no site of its own: the list's host names it.
		site: () => siteOf('function ListItem(', '<div>'),
	},
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — the server tail of an adopted component range ($name)', ({ dev, runtime }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const loadClient = () =>
		loadCompiledFixtureSource(SOURCE, { id: FILE, mode: 'client', compileOptions: { dev } });
	const client = loadClient();
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

	function render(name: string, props: Record<string, unknown>): void {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
	}

	async function hydrate(component: unknown, props: Record<string, unknown>): Promise<string[]> {
		const recoverable: string[] = [];
		root = hydrateRoot(container, component as never, props as never, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		}) as never;
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return recoverable;
	}

	it.each(SHAPES)('removes the stale tail of $shape', async ({ name, site }) => {
		render(name, { server: true });
		const adopted = [...container.querySelectorAll('i, p')];
		const stale = container.querySelector('.foreign')!;
		expect(stale).not.toBeNull();

		const recoverable = await hydrate(client[name], {});

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i><p>after</p>');
		expect([...container.querySelectorAll('i, p')]).toEqual(adopted);
		expect(stale.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [tail(site())] : []);

		// The range the client settled still updates in place.
		await act(async () => root!.render(client[name], { server: true }));
		expect(markup(container.firstElementChild!)).toBe(
			'<i>ok</i><s class="foreign">f</s><p>after</p>',
		);
		expect(container.querySelector('p')).toBe(adopted[adopted.length - 1]);
		expect(warnings()).toHaveLength(dev ? 1 : 0);
	});

	// The client component's body is a branch the server rendered no range for.
	// The branch ends after every root its template adopted in place, so only
	// the server's tail after them goes, and the branch owns them all.
	it.each([
		{ server: 'tail', stale: true },
		{ server: 'same', stale: false },
	] as const)(
		'keeps every root of a branch with no server range in the frame (server: $server)',
		async ({ server: serverShape, stale }) => {
			render('BranchBody', { server: serverShape });
			const adopted = [...container.querySelectorAll('i, b, p')];

			const recoverable = await hydrate(client.BranchBody, { inner: true });

			expect(markup(container.firstElementChild!)).toBe('<i>ok</i><b>b</b><p>after</p>');
			expectSame(container.querySelectorAll('i, b, p'), adopted);
			expect(recoverable).toEqual(stale ? [expect.stringMatching(MISMATCH)] : []);
			expect(warnings()).toEqual(
				dev && stale ? [tail(siteOf('function BranchBody(', '<Shape'))] : [],
			);

			await act(async () => root!.render(client.BranchBody, { inner: false }));
			expect(markup(container.firstElementChild!)).toBe('<p>after</p>');
			expect(container.querySelector('p')).toBe(adopted[adopted.length - 1]);
		},
	);

	it.each(
		SHAPES.flatMap((shape) => [
			{ ...shape, server: false },
			{ ...shape, server: true },
		]),
	)(
		'reports nothing, and parses no template, when the server rendered the same $shape (server: $server)',
		async ({ name, server: serverProp }) => {
			const props = serverProp ? { server: true } : {};
			render(name, props);
			const html = markup(container.firstElementChild!);
			const adopted = [...container.querySelectorAll('i, s, p')];
			// Fresh template records: hydration adopts them without parsing any.
			const fresh = loadClient();
			const createElement = vi.spyOn(document, 'createElement');

			const recoverable = await hydrate(fresh[name], props);
			const parsed = createElement.mock.calls.filter(([tag]) => tag === 'template');
			createElement.mockRestore();

			expect(markup(container.firstElementChild!)).toBe(html);
			expect([...container.querySelectorAll('i, s, p')]).toEqual(adopted);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
			if (runtime === 'production') expect(parsed).toEqual([]);
		},
	);
});
