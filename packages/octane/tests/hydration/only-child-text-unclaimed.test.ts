import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture';

// A text hole that is its host's only child adopts the host's server text. As
// in React, which compares such a host's whole text content, any other server
// content in the host (an element, a comment, or text around them) is a
// mismatch: nothing is repaired in place, the root renders on the client and
// reports once, and later updates write the client's Text node. Under the
// host's suppressHydrationWarning, React keeps the server content as it is
// until the client next changes the text.

const SOURCE = `import { use } from 'octane';
function Tag({ kind }) @{ <i class={kind}>{'t'}</i> }
export function Signal(props) @{ <div><p>{props.value}</p><Tag kind="x" /></div> }
export function Renderable(props) @{ <div><p>{props.value}</p><i class="x">{'t'}</i></div> }
export function Text(props) @{ <div><p>{props.value as string}</p><i class="x">{'t'}</i></div> }
export function Suppressed(props) @{
	<div><p suppressHydrationWarning>{props.value}</p><i class="x">{'t'}</i></div>
}
function Wait({ text }) @{ <em>{use(text) as string}</em> }
export function Suspending(props) @{
	<div><p>{props.value}</p><Wait text={props.text} /></div>
}
`;
const FILE = 'only-child-text-unclaimed.tsrx';
/** The 1-based source line of the hole that `marker` names. */
const lineOf = (marker: string) =>
	SOURCE.split('\n').findIndex((line) => line.includes(marker)) + 1;

const ROUTES = [
	{ route: 'a signal-capable renderable hole', name: 'Signal' },
	{ route: 'a renderable hole', name: 'Renderable' },
	{ route: 'a text binding', name: 'Text' },
].map((route) => ({ ...route, line: lineOf(`function ${route.name}(`) }));

const UNCLAIMED = [
	{ server: '<b>x</b>', actual: '<b>' },
	{ server: '<!--c-->', actual: 'a comment' },
	{ server: '<b>x</b>tail', actual: '<b>' },
] as const;

/** React's recoverable hydration error. */
const MISMATCH = /server rendered HTML didn't match the client/;

describe.each([
	{ mode: 'development compile', dev: true },
	{ mode: 'production compile', dev: false },
])('hydrateRoot — unclaimed server content in an only-child text host ($mode)', ({ dev }) => {
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});
	const server = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'server',
	});
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		errSpy.mockRestore();
	});

	const warns = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	function hydrate(name: string, paragraph: string, props: Record<string, unknown>) {
		container.innerHTML = `<div><p>${paragraph}</p><i class="x">t</i></div>`;
		const serverP = container.querySelector('p')!;
		const tag = container.querySelector('i')!;
		const serverChildren = [...serverP.childNodes];
		const recovered: unknown[] = [];
		flushSync(() => {
			root = hydrateRoot(container, client[name], props, {
				onRecoverableError: (error) => recovered.push(error),
			});
		});
		return {
			tag,
			serverP,
			serverChildren,
			recovered,
			p: () => container.querySelector('p')!,
		};
	}

	/** One report, and in development one warning at the hole's line. */
	async function expectReported(
		recovered: unknown[],
		line: number,
		actual: string,
		expected = 'text "a"',
	) {
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
		if (!dev) {
			expect(warns()).toEqual([]);
			return;
		}
		expect(warns()).toEqual([
			expect.stringMatching(
				new RegExp(
					`^Octane hydration mismatch at [^ ]*${FILE.replace(/\./g, '\\.')}:${line}:` +
						`\\d+: the client expected ${expected} but the server rendered ${actual}\\.`,
				),
			),
		]);
	}

	/** The client Text node that the hole renders takes every later value. */
	function expectUpdatesClientText(name: string): void {
		const p = container.querySelector('p')!;
		const hole = p.firstChild as Text;
		expect(hole.nodeType).toBe(3);
		for (const value of ['b', 'b', 'c', 7, 'd']) {
			flushSync(() => root!.render(client[name], { value }));
			expect(p.childNodes).toHaveLength(1);
			expect(p.firstChild).toBe(hole);
			expect(hole.nodeValue).toBe(String(value));
		}
		flushSync(() => root!.render(client[name], { value: '' }));
		expect(p.innerHTML).toBe('');
		flushSync(() => root!.render(client[name], { value: 'e' }));
		expect(p.innerHTML).toBe('e');
	}

	describe.each(ROUTES)('$route', ({ name, line }) => {
		it.each(UNCLAIMED)(
			'client-renders the root over server $server, reports it once, and updates the client Text node',
			async ({ server: content, actual }) => {
				const { p, serverP, tag, recovered } = hydrate(name, content, { value: 'a' });
				expect(p().innerHTML).toBe('a');
				// No boundary encloses the host, so its sibling renders on the client too.
				expect(serverP.isConnected).toBe(false);
				expect(tag.isConnected).toBe(false);
				expect(container.querySelector('i')!.textContent).toBe('t');
				await expectReported(recovered, line, actual);

				expectUpdatesClientText(name);
				await Promise.resolve();
				expect(recovered).toHaveLength(1);
			},
		);

		it('client-renders the root when server content follows the server text', async () => {
			const { p, serverP, tag, recovered } = hydrate(name, 'a<b>x</b>', { value: 'a' });
			expect(p().innerHTML).toBe('a');
			expect(serverP.isConnected).toBe(false);
			expect(tag.isConnected).toBe(false);
			await expectReported(recovered, line, '<b>', 'the end of the text element');
			expectUpdatesClientText(name);
		});

		// The server rendered an empty value where the client renders text.
		it('client-renders the root over an empty server frame and reports it once', async () => {
			const { p, serverP, recovered } = hydrate(name, '<!--[--><!--]-->', { value: 'a' });
			expect(p().textContent).toBe('a');
			expect(serverP.isConnected).toBe(false);
			await Promise.resolve();
			expect(recovered).toHaveLength(1);
			expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
			flushSync(() => root!.render(client[name], { value: 'b' }));
			expect(p().textContent).toBe('b');
		});

		it('adopts matching server text silently', async () => {
			container.innerHTML = ServerRT.renderToString(server[name], { value: 'a' }).html;
			const hole = container.querySelector('p')!.firstChild as Text;
			const recovered: unknown[] = [];
			flushSync(() => {
				root = hydrateRoot(
					container,
					client[name],
					{ value: 'a' },
					{ onRecoverableError: (error) => recovered.push(error) },
				);
			});
			const p = container.querySelector('p')!;
			expect(p.childNodes).toHaveLength(1);
			expect(p.firstChild).toBe(hole);
			await Promise.resolve();
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([]);
		});
	});

	// React compares a suppressed text host's text content not at all: the
	// server content stays as it is, unreported, until the client next changes
	// the text, which replaces it.
	it.each([
		...UNCLAIMED.map(({ server: content }) => ({ content, value: 'a' })),
		{ content: 'x<b>y</b>', value: 'a' },
		{ content: '<b>x</b>', value: '' },
	])(
		'keeps server $content in a suppressed host for $value until the text changes',
		async ({ content, value }) => {
			const { p, serverP, serverChildren, tag, recovered } = hydrate('Suppressed', content, {
				value,
			});
			expect(p()).toBe(serverP);
			expect(serverP.innerHTML).toBe(content);
			expect(serverP.childNodes).toHaveLength(serverChildren.length);
			serverChildren.forEach((node, i) => expect(serverP.childNodes[i]).toBe(node));
			expect(container.querySelector('i')).toBe(tag);
			await Promise.resolve();
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([]);
			flushSync(() => root!.render(client.Suppressed, { value: 'b' }));
			expect(serverP.innerHTML).toBe('b');
			flushSync(() => root!.render(client.Suppressed, { value: 'c' }));
			expect(serverP.innerHTML).toBe('c');
		},
	);

	// A null value renders no text, so the server's element is an unhydrated
	// child, which suppression does not cover.
	it('client-renders the root over server content for a null value in a suppressed host', async () => {
		const { p, serverP, recovered } = hydrate('Suppressed', '<b>x</b>', { value: null });
		expect(p().innerHTML).toBe('');
		expect(serverP.isConnected).toBe(false);
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		flushSync(() => root!.render(client.Suppressed, { value: 'b' }));
		expect(p().innerHTML).toBe('b');
	});

	// The server frames a lone primitive in some positions. A text-only frame
	// holds the server's text as a bare Text node does: React compares an empty
	// string's text content, which suppression keeps, but hydrates no child for
	// any other empty value, and suppression keeps no unhydrated child.
	describe.each([
		{ framing: 'bare', content: 'x' },
		{ framing: 'framed', content: '<!--[-->x<!--]-->' },
	])('$framing server text in a suppressed host', ({ content }) => {
		it('keeps it for an empty string until the text changes', async () => {
			const { p, serverP, tag, recovered } = hydrate('Suppressed', content, { value: '' });
			expect(p()).toBe(serverP);
			expect(serverP.textContent).toBe('x');
			expect(container.querySelector('i')).toBe(tag);
			await Promise.resolve();
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([]);
			flushSync(() => root!.render(client.Suppressed, { value: 'b' }));
			expect(serverP.innerHTML).toBe('b');
		});

		it.each([null, undefined, false])('client-renders the root for a %j value', async (value) => {
			const { p, serverP, recovered } = hydrate('Suppressed', content, { value });
			expect(p().innerHTML).toBe('');
			expect(serverP.isConnected).toBe(false);
			await Promise.resolve();
			expect(recovered).toHaveLength(1);
			expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
			flushSync(() => root!.render(client.Suppressed, { value: 'b' }));
			expect(p().innerHTML).toBe('b');
		});
	});

	it('client-renders the root over a server range in a text binding and names its content', async () => {
		const { p, serverP, recovered } = hydrate('Text', '<!--[--><b>x</b><!--]-->', {
			value: 'a',
		});
		expect(p().innerHTML).toBe('a');
		expect(serverP.isConnected).toBe(false);
		await expectReported(recovered, lineOf('function Text('), '<b>');
	});

	// The mismatch comes before the sibling suspends: the root renders on the
	// client once the sibling's data arrives, and reports once.
	it('reports once when the client render of the root suspends', async () => {
		let resolve!: (text: string) => void;
		const text = new Promise<string>((r) => (resolve = r));
		container.innerHTML = '<div><p><b>x</b></p><em>R</em></div>';
		const em = container.querySelector('em')!;
		const recovered: unknown[] = [];
		root = hydrateRoot(
			container,
			client.Suspending,
			{ value: 'a', text },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		await act(async () => {
			resolve('R');
			await text;
		});
		const p = container.querySelector('p')!;
		expect(p.innerHTML).toBe('a');
		expect(container.querySelector('em')!.textContent).toBe('R');
		expect(em.isConnected).toBe(false);
		await expectReported(recovered, lineOf('<p>{props.value}</p><Wait'), '<b>');
		const hole = p.firstChild as Text;
		flushSync(() => root!.render(client.Suspending, { value: 'b', text }));
		expect(p.childNodes).toHaveLength(1);
		expect(p.firstChild).toBe(hole);
		expect(hole.nodeValue).toBe('b');
	});
});
