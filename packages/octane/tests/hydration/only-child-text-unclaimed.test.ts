import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture';

// A text hole that is its host's only child adopts at most one leading server
// Text node. Any other server content in the host (an element, a comment, or
// text after them) is nothing the client renders. Hydration must report it and
// discard it, so the host holds only the client's text, and later updates
// write that Text node instead of landing beside stale server content.

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
		const tag = container.querySelector('i')!;
		const tagText = tag.firstChild;
		const serverChildren = [...container.querySelector('p')!.childNodes];
		const recovered: unknown[] = [];
		flushSync(() => {
			root = hydrateRoot(container, client[name], props, {
				onRecoverableError: (error) => recovered.push(error),
			});
		});
		return { tag, tagText, serverChildren, recovered, p: container.querySelector('p')! };
	}

	async function expectReported(
		recovered: unknown[],
		line: number,
		actual: string,
		expected = 'text "a"',
	) {
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(
			/^Hydration mismatch: the server rendered extra children in a text element/,
		);
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

	describe.each(ROUTES)('$route', ({ name, line }) => {
		it.each(UNCLAIMED)(
			'discards server $server, reports it once, and updates the client Text node',
			async ({ server: content, actual }) => {
				const { p, tag, tagText, recovered } = hydrate(name, content, { value: 'a' });
				expect(p.innerHTML).toBe('a');
				const hole = p.firstChild as Text;
				expect(hole.nodeType).toBe(3);
				// The recovery stays local: the sibling host and its text are adopted.
				expect(container.querySelector('i')).toBe(tag);
				expect(tag.firstChild).toBe(tagText);
				await expectReported(recovered, line, actual);

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
				await Promise.resolve();
				expect(recovered).toHaveLength(1);
			},
		);

		it('keeps an adopted server Text node and discards only the content after it', async () => {
			const { p, serverChildren, recovered } = hydrate(name, 'a<b>x</b>', { value: 'a' });
			const hole = serverChildren[0];
			expect(p.innerHTML).toBe('a');
			expect(p.firstChild).toBe(hole);
			await expectReported(recovered, line, '<b>', 'the end of the text element');
			flushSync(() => root!.render(client[name], { value: 'b' }));
			expect(p.childNodes).toHaveLength(1);
			expect(p.firstChild).toBe(hole);
			expect(hole.nodeValue).toBe('b');
		});

		// An empty value the server framed is nothing to report, as an empty host is.
		it('builds the client text over an empty server frame silently', async () => {
			const { p, recovered } = hydrate(name, '<!--[--><!--]-->', { value: 'a' });
			expect(p.textContent).toBe('a');
			const hole = [...p.childNodes].find((node) => node.nodeType === 3)!;
			await Promise.resolve();
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([]);
			flushSync(() => root!.render(client[name], { value: 'b' }));
			expect(p.textContent).toBe('b');
			expect(hole.nodeValue).toBe('b');
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

	// suppressHydrationWarning silences the report. The server content is still
	// nothing the hole adopted, so the client text replaces it.
	it.each(UNCLAIMED)(
		'discards server $server silently in a suppressed host',
		async ({ server: content }) => {
			const { p, tag, recovered } = hydrate('Suppressed', content, { value: 'a' });
			expect(p.innerHTML).toBe('a');
			const hole = p.firstChild as Text;
			expect(container.querySelector('i')).toBe(tag);
			await Promise.resolve();
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([]);
			flushSync(() => root!.render(client.Suppressed, { value: 'b' }));
			expect(p.childNodes).toHaveLength(1);
			expect(p.firstChild).toBe(hole);
			expect(hole.nodeValue).toBe('b');
		},
	);

	it.each([null, ''])(
		'discards server content silently for a %j value in a suppressed host',
		async (value) => {
			const { p, recovered } = hydrate('Suppressed', '<b>x</b>', { value });
			expect(p.innerHTML).toBe('');
			await Promise.resolve();
			expect(recovered).toEqual([]);
			expect(warns()).toEqual([]);
			flushSync(() => root!.render(client.Suppressed, { value: 'b' }));
			expect(p.innerHTML).toBe('b');
		},
	);

	// A text binding has no child slot to adopt a server range, so it discards
	// the range and names what the range held.
	it('discards a server range in a text binding and names its content', async () => {
		const { p, recovered } = hydrate('Text', '<!--[--><b>x</b><!--]-->', { value: 'a' });
		expect(p.innerHTML).toBe('a');
		await expectReported(recovered, lineOf('function Text('), '<b>');
	});

	// The server's leading text is still kept, as suppression keeps any text value.
	it('keeps the server text and discards the content after it silently in a suppressed host', async () => {
		const { p, serverChildren, recovered } = hydrate('Suppressed', 'x<b>y</b>', { value: 'a' });
		const hole = serverChildren[0];
		expect(p.innerHTML).toBe('x');
		expect(p.firstChild).toBe(hole);
		await Promise.resolve();
		expect(recovered).toEqual([]);
		expect(warns()).toEqual([]);
		flushSync(() => root!.render(client.Suppressed, { value: 'b' }));
		expect(p.childNodes).toHaveLength(1);
		expect(p.firstChild).toBe(hole);
		expect(hole.nodeValue).toBe('b');
	});

	// A root attempt that suspends rolls back to the server DOM, so its retry
	// finds the same server content, discards it, and reports it once.
	it('reports once when the root attempt suspends after discarding', async () => {
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
		expect(container.querySelector('em')).toBe(em);
		await expectReported(recovered, lineOf('<p>{props.value}</p><Wait'), '<b>');
		const hole = p.firstChild as Text;
		flushSync(() => root!.render(client.Suspending, { value: 'b', text }));
		expect(p.childNodes).toHaveLength(1);
		expect(p.firstChild).toBe(hole);
		expect(hole.nodeValue).toBe('b');
	});
});
