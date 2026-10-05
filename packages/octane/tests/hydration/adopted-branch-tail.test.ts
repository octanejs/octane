import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// An @if or @switch slot adopts the server's range for its arm even when the
// server rendered a different arm, as long as that range starts with what the
// client arm renders. Whatever the server left after the client arm's content
// is stale: hydration removes it and reports the mismatch once, while the
// nodes the arm adopted keep their identity.

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

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

function tail(site: string, actual: string): string {
	return (
		`Octane hydration mismatch at ${site}: the client expected the end of the branch but the ` +
		`server rendered ${actual}. The mismatched subtree was rebuilt on the client.`
	);
}

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — the server tail of an adopted branch ($name)', ({ dev, runtime }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const loadClient = () =>
		loadCompiledFixtureSource(SOURCE, { id: FILE, mode: 'client', compileOptions: { dev } });
	const client = loadClient();
	// A production runtime reports the error code instead of the message.
	const TAIL =
		runtime === 'production'
			? /^Minified Octane error #51;/
			: /the mismatched subtree was rebuilt on the client/;
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

	function render(name: string, props: Record<string, unknown>): void {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
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
	])('removes the stale tail after $shape', async ({ name, html }) => {
		render(name, { server: true });
		const adopted = [...container.querySelectorAll('i, b:not(.foreign)')];
		const stale = [...container.querySelectorAll('.foreign')];
		expect(stale.length).toBeGreaterThan(0);

		const recoverable = await hydrate(client[name]);

		expect(markup(container.firstElementChild!)).toBe(html);
		expect([...container.querySelectorAll('i, b')]).toEqual(adopted);
		for (const node of stale) expect(node.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(TAIL)]);
		expect(warnings()).toEqual(dev ? [tail(siteOf(`function ${name}(`, '@if'), '<s>')] : []);
	});

	it('removes the stale tail of an adopted @switch case', async () => {
		render('SwitchBranch', { server: true });
		const adopted = container.querySelector('i')!;

		const recoverable = await hydrate(client.SwitchBranch);

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i>');
		expect(container.querySelector('i')).toBe(adopted);
		expect(recoverable).toEqual([expect.stringMatching(TAIL)]);
		expect(warnings()).toEqual(
			dev ? [tail(siteOf('function SwitchBranch(', '@switch'), '<s>')] : [],
		);
	});

	it.each([
		{ branch: 'an inner', name: 'NestedBranch', directive: '@if (props.server)' },
		{ branch: 'an outer', name: 'OuterBranch', directive: '@if (props.server)' },
	])('removes only the tail of $branch branch of two nested ones', async ({ name, directive }) => {
		render(name, { server: true });
		const adopted = [...container.querySelectorAll('i, b, u')];

		const recoverable = await hydrate(client[name]);

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i><b>b</b><u>u</u>');
		expect([...container.querySelectorAll('i, b, u')]).toEqual(adopted);
		expect(recoverable).toEqual([expect.stringMatching(TAIL)]);
		expect(warnings()).toEqual(dev ? [tail(siteOf(`function ${name}(`, directive), '<s>')] : []);
	});

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

	// The client's last component adopts the server's `<s>` in place, and the
	// server's `<u>` after it is the tail.
	it('keeps a server node that a component adopted without its range', async () => {
		render('UnframedComponent', { server: true });
		const strike = container.querySelector('s')!;
		const stale = container.querySelector('u')!;

		const recoverable = await hydrate(client.UnframedComponent);

		expect(markup(container.firstElementChild!)).toBe('<b>b</b><s>s</s>');
		expect(container.querySelector('s')).toBe(strike);
		expect(strike.isConnected).toBe(true);
		expect(stale.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(TAIL)]);
		expect(warnings()).toEqual(
			dev ? [tail(siteOf('function UnframedComponent(', '@if'), '<u>')] : [],
		);
	});
});
