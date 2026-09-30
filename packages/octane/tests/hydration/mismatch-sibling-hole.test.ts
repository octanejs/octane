import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A renderable `{expr}` hole that is not its host's only child: the server
// frames its value in a `<!--[-->…<!--]-->` range, and a primitive in that range
// is bare text. A list, a fragment, a keyed element, or a portal never
// serializes as bare text, and neither does a component that returns an element
// or a list, directly or through another component. When the server rendered
// text but the client value is one of those, hydration must discard the text
// and report it where the value is, without giving up on the rest of the root.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/renderable-sibling-text-object.tsrx',
);
const FILE = 'renderable-sibling-text-object.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');
const HOLE = '{pick(props.kind, props.v, props.target)}';

/** 1-based line of the `nth` line containing `text`. */
function lineOf(text: string, nth = 0): number {
	let seen = 0;
	for (let i = 0; i < LINES.length; i++) {
		if (LINES[i].includes(text) && seen++ === nth) return i + 1;
	}
	throw new Error(`fixture has no line ${nth} containing ${text}`);
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

function textChildren(node: Node): Node[] {
	return [...node.childNodes].filter((child) => child.nodeType === 3);
}

/** The same node objects, not merely equal ones. */
function expectSameNodes(actual: ArrayLike<Node>, expected: readonly (Node | null)[]) {
	expect(actual).toHaveLength(expected.length);
	for (let i = 0; i < expected.length; i++) expect(actual[i]).toBe(expected[i]);
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — sibling renderable hole whose server value was text ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let target: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		target = document.createElement('aside');
		document.body.appendChild(container);
		document.body.appendChild(target);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		container.remove();
		target.remove();
		errSpy.mockRestore();
	});

	const warns = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	/** The warning for server text "A" at `line` of `file`. */
	function mismatchWarning(file: string, line: number | null, expected: string) {
		return expect.stringMatching(
			new RegExp(
				`^Octane hydration mismatch at [^ ]*${file.replace(/\./g, '\\.')}:` +
					`${line ?? '\\d+'}:\\d+: the client expected ${expected} but the server ` +
					`rendered text "A"\\.`,
			),
		);
	}

	/** Exactly one report: the recoverable error always, the warning in DEV only. */
	async function expectReported(
		recovered: unknown[],
		file: string,
		line: number | null,
		expected: string,
	) {
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(/hydration mismatch/i);
		expect(warns()).toEqual(dev ? [mismatchWarning(file, line, expected)] : []);
	}

	/** The markup a client render of the same props puts in `host`. */
	function clientMarkup(
		component: unknown,
		props: Record<string, unknown>,
		host: (root: HTMLElement) => Element,
	): string {
		const node = document.createElement('div');
		const root = createRoot(node);
		flushSync(() => root.render(component as never, props));
		try {
			return markup(host(node));
		} finally {
			root.unmount();
		}
	}

	// The value the client renders in place of the server's text "A", and what
	// the development warning says the client expected there.
	const HOLE_VALUES = [
		{ kind: 'p', expected: '<p>' },
		{ kind: 'keyed', expected: 'a renderable list range' },
		{ kind: 'list', expected: 'a renderable list range' },
		{ kind: 'fragment', expected: 'a renderable list range' },
		{ kind: 'portal', expected: 'a portal' },
	] as const;

	// A component that returns an element or a list has no site of its own, so
	// the warning names the component, even when another component returns it.
	// A template component reports its mismatched root.
	const RETURNED_VALUES = [
		{ kind: 'returned', expected: '<p>', at: 'function Returned(' },
		{ kind: 'returned-list', expected: 'a renderable list range', at: 'function ReturnedList(' },
		{ kind: 'chain', expected: '<p>', at: 'function Returned(' },
		{ kind: 'chain-list', expected: 'a renderable list range', at: 'function ReturnedList(' },
		{ kind: 'returned-template', expected: '<p>', at: '<p class="guarded">' },
	] as const;

	describe.each([
		{
			where: 'in the root component',
			name: 'Hole',
			hole: 0,
			host: (root: HTMLElement) => root.querySelector('section')!,
		},
		{
			where: 'in a nested component',
			name: 'NestedHole',
			hole: 0,
			host: (root: HTMLElement) => root.querySelector('section')!,
		},
		{
			where: 'in the root component’s own output',
			name: 'RootHole',
			hole: 1,
			host: (root: HTMLElement) => root,
		},
	])('$where', ({ name, hole, host }) => {
		const holeLine = lineOf(HOLE, hole);

		function hydrate(serverKind: string, kind: string) {
			container.innerHTML = ServerRT.renderToString(server[name], {
				kind: serverKind,
				v: 'A',
				tail: 't',
			}).html;
			const tail = container.querySelector('b')!;
			const tailText = tail.firstChild;
			const serverElements = [...container.querySelectorAll('*')];
			const serverMarkup = markup(host(container));
			const serverText = textChildren(host(container))[0] ?? null;
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				client[name],
				{ kind, v: 'A', tail: 't', target },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			flushSync(() => {});
			return {
				tail,
				tailText,
				serverElements,
				serverMarkup,
				serverText,
				recovered,
				root,
				render: (props: Record<string, unknown>) =>
					flushSync(() => root.render(client[name], { ...props, target })),
				expected: (props: Record<string, unknown>) =>
					clientMarkup(client[name], { ...props, target }, host),
			};
		}

		it.each([...HOLE_VALUES, ...RETURNED_VALUES])(
			'discards server text for a client $kind value, reports it once, and keeps hydrating',
			async (value) => {
				const { kind } = value;
				const { tail, tailText, recovered, root, render, expected } = hydrate('text', kind);
				try {
					expect(markup(host(container))).toBe(expected({ kind, v: 'A', tail: 't' }));
					// The recovery stays local: the next child still adopts its server text.
					expect(container.querySelector('b')).toBe(tail);
					expectSameNodes(tail.childNodes, [tailText]);
					expect(tail.textContent).toBe('t');
					await expectReported(
						recovered,
						FILE,
						'at' in value ? lineOf(value.at) : holeLine,
						value.expected,
					);

					render({ kind: 'text', v: 'B', tail: 'u' });
					expect(markup(host(container))).toBe(expected({ kind: 'text', v: 'B', tail: 'u' }));
					render({ kind, v: 'C', tail: 'u' });
					expect(markup(host(container))).toBe(expected({ kind, v: 'C', tail: 'u' }));
					render({ kind: 'text', v: 'D', tail: 'u' });
					expect(markup(host(container))).toBe(expected({ kind: 'text', v: 'D', tail: 'u' }));
					await Promise.resolve();
					expect(recovered).toHaveLength(1);
				} finally {
					root.unmount();
				}
			},
		);

		it.each([...HOLE_VALUES, ...RETURNED_VALUES, { kind: 'text' }])(
			'adopts a matching server $kind value silently',
			async ({ kind }) => {
				const { serverElements, serverMarkup, recovered, root, render, expected } = hydrate(
					kind,
					kind,
				);
				try {
					expectSameNodes(container.querySelectorAll('*'), serverElements);
					expect(markup(host(container))).toBe(serverMarkup);
					await Promise.resolve();
					expect(recovered).toEqual([]);
					expect(warns()).toEqual([]);
					render({ kind: 'text', v: 'B', tail: 't' });
					expect(markup(host(container))).toBe(expected({ kind: 'text', v: 'B', tail: 't' }));
				} finally {
					root.unmount();
				}
			},
		);

		// A component may return text, also through another component: the
		// server's text is its value, not stale. The component owns that text
		// node, so a later value below the component replaces it.
		it.each(['returned-text', 'chain-text'])(
			'adopts server text that a %s value returns',
			async (kind) => {
				const { serverText, serverMarkup, recovered, root, render, expected } = hydrate(
					'text',
					kind,
				);
				try {
					expect(markup(host(container))).toBe(serverMarkup);
					expectSameNodes(textChildren(host(container)), [serverText]);
					await Promise.resolve();
					expect(recovered).toEqual([]);
					expect(warns()).toEqual([]);

					render({ kind, v: 'B', tail: 't' });
					expect(markup(host(container))).toBe(expected({ kind, v: 'B', tail: 't' }));
				} finally {
					root.unmount();
				}
			},
		);
	});

	it('renders a portal into its target once the hole’s server text is gone', async () => {
		container.innerHTML = ServerRT.renderToString(server.Hole, {
			kind: 'text',
			v: 'A',
			tail: 't',
		}).html;
		const recovered: unknown[] = [];
		const root = hydrateRoot(
			container,
			client.Hole,
			{ kind: 'portal', v: 'A', tail: 't', target },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		flushSync(() => {});
		try {
			expect(markup(container.querySelector('section')!)).toBe('<b>t</b>');
			expect(markup(target)).toBe('<p class="x">A</p>');
			await Promise.resolve();
			expect(recovered).toHaveLength(1);
			flushSync(() => root.render(client.Hole, { kind: 'text', v: 'B', tail: 't', target }));
			expect(markup(container.querySelector('section')!)).toBe('B<b>t</b>');
			expect(markup(target)).toBe('');
		} finally {
			root.unmount();
		}
	});

	// A list item that suspends leaves the boundary to retry hydration, and the
	// retry must neither report again nor keep the server's text.
	it('reports once for a list whose item suspends during hydration', async () => {
		container.innerHTML = ServerRT.renderToString(server.SuspendingHole, {
			text: null,
			v: 'A',
		}).html;
		const tail = container.querySelector('b')!;
		let resolve!: (text: string) => void;
		const text = new Promise<string>((r) => (resolve = r));
		const recovered: unknown[] = [];
		const root = hydrateRoot(
			container,
			client.SuspendingHole,
			{ text, v: 'A' },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		flushSync(() => {});
		try {
			await act(async () => {
				resolve('R');
				await text;
			});
			expect(markup(container.querySelector('section')!)).toBe(
				'<p class="x">A</p><em class="waits">R</em><b>A</b>',
			);
			expect(container.querySelector('b')).toBe(tail);
			await expectReported(
				recovered,
				FILE,
				lineOf('{waitList(props.text, props.v)}'),
				'a renderable list range',
			);
		} finally {
			root.unmount();
		}
	});

	// A component in a chain that suspends leaves the boundary to retry
	// hydration against the server DOM the first attempt left. The retry still
	// finds the server's text where the value begins.
	describe('through a component chain that suspends', () => {
		function hydrateChain(element: boolean) {
			container.innerHTML = ServerRT.renderToString(server.SuspendingChain, {
				text: null,
				v: 'A',
				element,
			}).html;
			const section = container.querySelector('section')!;
			const serverText = textChildren(section)[0];
			const tail = container.querySelector('b')!;
			let resolve!: (text: string) => void;
			const text = new Promise<string>((r) => (resolve = r));
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				client.SuspendingChain,
				{ text, v: 'A', element },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			flushSync(() => {});
			return {
				section,
				serverText,
				tail,
				recovered,
				root,
				resume: () =>
					act(async () => {
						resolve('R');
						await text;
					}),
			};
		}

		it('discards server text for an element and reports it once', async () => {
			const { section, tail, recovered, root, resume } = hydrateChain(true);
			try {
				await resume();
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe('<p class="x">A</p><b>A</b>');
				expect(container.querySelector('b')).toBe(tail);
				await expectReported(recovered, FILE, lineOf('function WaitsFor('), '<p>');
			} finally {
				root.unmount();
			}
		});

		it('adopts server text that the chain returns', async () => {
			const { section, serverText, tail, recovered, root, resume } = hydrateChain(false);
			try {
				await resume();
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe('A<b>A</b>');
				expectSameNodes(textChildren(section), [serverText]);
				expect(container.querySelector('b')).toBe(tail);
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
			} finally {
				root.unmount();
			}
		});
	});

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's: repair the hole, but report nothing.
	it.each(['keyed', 'list', 'portal'])(
		'repairs a dormant boundary whose value became a %s before activation without reporting',
		async (kind) => {
			const serverProps = { when: condition(false), kind: 'text', v: 'A', tail: 't' };
			container.innerHTML = ServerRT.renderToString(server.DormantHole, serverProps).html;
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				client.DormantHole,
				{ ...serverProps, target },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			flushSync(() => {});
			try {
				const section = container.querySelector('section')!;
				expect(markup(section)).toBe('A<b>t</b>');
				const props = { when: load(), kind, v: 'A', tail: 't', target };
				await act(() => root.render(client.DormantHole, props));
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe(
					clientMarkup(client.DormantHole, props, (node) => node.querySelector('section')!),
				);
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
			} finally {
				root.unmount();
			}
		},
	);

	describe('in .tsx', () => {
		const TSX = join(
			process.cwd(),
			'packages/octane/tests/hydration/_fixtures/renderable-sibling-text-object-tsx.tsx',
		);
		const tsxServer = loadServerFixture(TSX, { id: 'renderable-sibling-text-object-tsx.tsx' });
		const tsxClient = loadCompiledFixtureSource(readFileSync(TSX, 'utf8'), {
			id: 'renderable-sibling-text-object-tsx.tsx',
			mode: 'client',
			compileOptions: { dev },
		});

		it('discards server text for a client keyed element', async () => {
			container.innerHTML = ServerRT.renderToString(tsxServer.Hole, {
				kind: 'text',
				v: 'A',
				tail: 't',
			}).html;
			const section = container.querySelector('section')!;
			const tail = container.querySelector('b')!;
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				tsxClient.Hole,
				{ kind: 'keyed', v: 'A', tail: 't' },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			flushSync(() => {});
			try {
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe('<p class="x">A</p><b>t</b>');
				expect(container.querySelector('b')).toBe(tail);
				await expectReported(
					recovered,
					'renderable-sibling-text-object-tsx.tsx',
					null,
					'a renderable list range',
				);
				flushSync(() => root.render(tsxClient.Hole, { kind: 'text', v: 'B', tail: 't' }));
				expect(markup(section)).toBe('B<b>t</b>');
			} finally {
				root.unmount();
			}
		});
	});

	// bindSignalChild has no cached-value helper in front of the hole, so its
	// first render reaches the child slot by another route.
	describe('through signal bindings', () => {
		const SIGNAL = join(
			process.cwd(),
			'packages/octane/tests/hydration/_fixtures/renderable-sibling-text-object-signal.tsrx',
		);
		const signalServer = loadServerFixture(SIGNAL, {
			id: 'renderable-sibling-text-object-signal.tsrx',
		});
		const signalClient = loadCompiledFixtureSource(readFileSync(SIGNAL, 'utf8'), {
			id: 'renderable-sibling-text-object-signal.tsrx',
			mode: 'client',
			compileOptions: { dev },
		});

		it.each([
			{ kind: 'keyed element', value: () => createElement('p', { key: 'k', class: 'x' }, 'A') },
			{ kind: 'list', value: () => [createElement('p', { key: 'a', class: 'x' }, 'A'), 'A'] },
		])('discards server text for a client $kind', async ({ value }) => {
			container.innerHTML = ServerRT.renderToString(signalServer.Hole, {
				value: 'A',
				label: 't',
			}).html;
			const section = container.querySelector('section')!;
			const tail = container.querySelector('i')!;
			const recovered: unknown[] = [];
			const props = { value: value(), label: 't' };
			const root = hydrateRoot(container, signalClient.Hole, props, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			try {
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe(
					clientMarkup(signalClient.Hole, props, (node) => node.querySelector('section')!),
				);
				expect(container.querySelector('i')).toBe(tail);
				expect(tail.textContent).toBe('t');
				await expectReported(
					recovered,
					'renderable-sibling-text-object-signal.tsrx',
					null,
					'a renderable list range',
				);
				flushSync(() => root.render(signalClient.Hole, { value: 'B', label: 't' }));
				expect(markup(section)).toBe('B<i>t</i>');
			} finally {
				root.unmount();
			}
		});
	});
});
