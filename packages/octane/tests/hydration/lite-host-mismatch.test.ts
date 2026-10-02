import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A lite component renders into its lite host, the element its call site sits
// in, which need not be the parent of the enclosing block's range. When its
// single-root template does not match the server node at the cursor inside
// that host, hydration discards the server node and builds the template in its
// place, reporting the mismatch once, as it does for any other block. A cursor
// outside the host is not the call's to discard.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/lite-host-mismatch.tsrx',
);
const FILE = 'lite-host-mismatch.tsrx';
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

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — a lite component mismatch inside its host ($name)', ({ dev, runtime }) => {
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

	function render(name: string, props: Record<string, unknown>): void {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
	}

	async function hydrate(name: string, props: Record<string, unknown>): Promise<string[]> {
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		}) as never;
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return recoverable;
	}

	async function toggle(name: string, host: string): Promise<string[]> {
		const steps: string[] = [];
		for (const on of [false, true]) {
			await act(async () => root!.render(client[name], { on }));
			steps.push(markup(container.querySelector(host)!));
		}
		return steps;
	}

	it.each([
		{
			shape: 'its <section> host',
			name: 'SectionArm',
			host: '#r > section',
			server: '<em>e</em><u>u</u><b>p</b><hr>',
			client: '<em>e</em><p>p</p><b>p</b><hr>',
		},
		{
			shape: "the arm's parent",
			name: 'FragmentArm',
			host: '#r',
			server: '<em>e</em><u>u</u><b>p</b><hr>',
			client: '<em>e</em><p>p</p><b>p</b><hr>',
		},
		{
			shape: 'its host, at the end',
			name: 'LastChild',
			host: '#r > section',
			server: '<hr><em>e</em><u>u</u>',
			client: '<hr><em>e</em><p>p</p>',
		},
	])(
		'discards the server node a lite call in $shape does not match, and reports it once',
		async ({ name, host: hostSelector, server: serverHtml, client: clientHtml }) => {
			render(name, { on: false });
			const host = container.querySelector(hostSelector)!;
			const u = host.querySelector('u')!;
			const adopted = [...host.children].filter((el) => el !== u);
			expect(markup(host)).toBe(serverHtml);

			const recoverable = await hydrate(name, { on: true });

			expect(container.querySelector(hostSelector)).toBe(host);
			expect(markup(host)).toBe(clientHtml);
			expect(u.isConnected).toBe(false);
			// The server nodes around the mismatch stay adopted.
			expect([...host.children].filter((el) => el.localName !== 'p')).toEqual(adopted);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(
				dev
					? [
							`Octane hydration mismatch at ${siteOf('function Para(', '<p>')}: the client ` +
								'expected <p> but the server rendered <u>. The mismatched subtree was ' +
								'rebuilt on the client.',
						]
					: [],
			);

			// The rebuilt arm still switches like a client-rendered one.
			expect(await toggle(name, hostSelector)).toEqual([serverHtml, clientHtml]);
			expect(recoverable).toHaveLength(1);
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		},
	);

	// The cursor sits outside the lite host's children, so recovery cannot tell
	// which server node the call replaces. It must not remove the host itself.
	it('keeps the host when a lite call finds the cursor on it', async () => {
		render('HostCursor', { on: false });
		const section = container.querySelector('section')!;
		const [hr, , s] = [...section.children];
		expect(markup(section)).toBe('<hr><u>u</u><s>s</s>');

		const recoverable = await hydrate('HostCursor', { on: true });

		expect(container.querySelector('#r > section')).toBe(section);
		expect(section.querySelector('hr')).toBe(hr);
		expect(section.querySelector('s')).toBe(s);
		const p = section.querySelector('p');
		expect(p?.textContent).toBe('p');
		expect(p?.previousElementSibling).toBe(hr);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev ? [expect.stringContaining(`at ${siteOf('function Para(', '<p>')}: `)] : [],
		);

		expect(await toggle('HostCursor', '#r > section')).toEqual([
			'<hr><u>u</u><s>s</s>',
			'<hr><p>p</p><s>s</s>',
		]);
		expect(recoverable).toHaveLength(1);
	});

	it.each(
		['SectionArm', 'FragmentArm', 'LastChild', 'HostCursor'].flatMap((name) => [
			{ name, on: true },
			{ name, on: false },
		]),
	)(
		'$name adopts every node and reports nothing when the server rendered the same arm (on: $on)',
		async ({ name, on }) => {
			render(name, { on });
			const html = markup(container.firstElementChild!);
			const nodes = [...container.querySelectorAll('*')];

			const recoverable = await hydrate(name, { on });

			expect(markup(container.firstElementChild!)).toBe(html);
			expect([...container.querySelectorAll('*')]).toEqual(nodes);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);
});
