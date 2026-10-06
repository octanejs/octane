import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a template's root does not match the server node at the cursor, the
// server HTML does not match, as in React: with no Suspense or Hydrate boundary
// the root discards its server DOM, renders on the client, and reports once.
// The client-rendered subtree's dynamic attributes, class, and style are
// ordinary client writes: they are not value mismatches, and
// `suppressHydrationWarning` (which keeps a SERVER value) does not drop them.
// An adopted server element whose attribute, class, or style differs keeps the
// server value until the client next changes it, and development warns once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-attrs.tsrx',
);
const FILE = 'rebuilt-clone-attrs.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** 1-based line of the first fixture line containing `text`. */
function lineOf(text: string): number {
	const index = LINES.findIndex((line) => line.includes(text));
	if (index < 0) throw new Error(`fixture has no line containing ${text}`);
	return index + 1;
}

/** Child element and text markup with sorted attributes, ignoring hydration comments. */
function markup(node: Element): string {
	let out = '';
	for (let child = node.firstChild; child !== null; child = child.nextSibling) {
		if (child.nodeType === 3) out += child.nodeValue;
		if (child.nodeType !== 1) continue;
		const el = child as Element;
		const attrs = [...el.attributes]
			.map((attr) => ` ${attr.name}="${attr.value}"`)
			.sort()
			.join('');
		out += `<${el.localName}${attrs}>${markup(el)}</${el.localName}>`;
	}
	return out;
}

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — attributes of a client-rendered template clone ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { render(component: unknown, props: unknown): void; unmount(): void } | null;
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

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	/** Server-render `name` into the container; returns the server's elements. */
	function serve(name: string, serverProps: Record<string, unknown>): Element[] {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		return [...container.querySelectorAll('*')];
	}

	async function hydrate(name: string, clientProps: Record<string, unknown>): Promise<string[]> {
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return recoverable;
	}

	const structural = (line: number) =>
		`Octane hydration mismatch at ${FILE}:${line}:1: the client expected <i> but the server ` +
		'rendered <b>. The nearest Suspense or Hydrate boundary, or the root, will be regenerated ' +
		'on the client.';

	it.each([
		{
			site: 'direct bindings',
			name: 'AttrBranch',
			clientProps: {},
			leaf: 'function AttrLeaf(',
			expected: '<i class="ok" style="color: red;" title="ok">t</i>',
		},
		{
			site: 'suppressHydrationWarning bindings',
			name: 'SuppressedBranch',
			clientProps: {},
			leaf: 'function SuppressedLeaf(',
			expected: '<i class="ok" style="color: red;" title="ok">t</i>',
		},
		{
			site: 'a nested element',
			name: 'NestedBranch',
			clientProps: {},
			leaf: 'function NestedLeaf(',
			expected: '<i><u class="ok" style="color: red;" title="ok">t</u></i>',
		},
		{
			site: 'spread bindings',
			name: 'SpreadBranch',
			clientProps: { rest: { title: 'ok', className: 'ok', style: { color: 'red' } } },
			leaf: 'function SpreadLeaf(',
			expected: '<i class="ok" style="color: red;" title="ok">t</i>',
		},
		{
			site: 'suppressed spread bindings',
			name: 'SpreadBranch',
			clientProps: {
				rest: {
					suppressHydrationWarning: true,
					title: 'ok',
					className: 'ok',
					style: { color: 'red' },
				},
			},
			leaf: 'function SpreadLeaf(',
			expected: '<i class="ok" style="color: red;" title="ok">t</i>',
		},
	])(
		'renders $site on the client and reports only the structural mismatch',
		async ({ name, clientProps, leaf, expected }) => {
			const served = serve(name, { server: true });
			const recoverable = await hydrate(name, clientProps);

			expect(markup(container.firstElementChild!)).toBe(expected);
			// No boundary: the root renders on the client, so no server node survives.
			expect(served.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [structural(lineOf(leaf) + 1)] : []);
		},
	);

	it('keeps the server attribute, class, and style of an adopted element until the client changes them', async () => {
		serve('Attrs', { text: 'server', color: 'red' });
		const adopted = container.querySelector('i')!;
		const recoverable = await hydrate('Attrs', { text: 'client', color: 'blue' });

		expect(container.querySelector('i')).toBe(adopted);
		expect(markup(container.firstElementChild!)).toBe(
			'<i class="server" style="color:red;" title="server">t</i>',
		);
		expect(recoverable).toEqual([]);
		// Development warns once per pass, listing every value it kept.
		const at = `${FILE}:${lineOf('<i title={props.text}')}:2`;
		expect(warnings()).toEqual(dev ? [expect.stringContaining("This won't be patched up.")] : []);
		if (dev) {
			expect(warnings()[0]).toContain(
				`${at}: attribute \`title\`: the server rendered "server", the client "client"`,
			);
			expect(warnings()[0]).toContain(
				`${at}: attribute \`class\`: the server rendered "server", the client "client"`,
			);
			expect(warnings()[0]).toContain(
				`${at}: style: the server rendered "color: red;", the client "color: blue;"`,
			);
		}

		// The client's values are unchanged, so nothing is written.
		flushSync(() => root!.render(client.Attrs, { text: 'client', color: 'blue' }));
		expect(container.querySelector('i')).toBe(adopted);
		expect(markup(container.firstElementChild!)).toBe(
			'<i class="server" style="color:red;" title="server">t</i>',
		);

		// The next client change writes the new values onto the adopted element.
		flushSync(() => root!.render(client.Attrs, { text: 'third', color: 'green' }));
		expect(container.querySelector('i')).toBe(adopted);
		expect(markup(container.firstElementChild!)).toBe(
			'<i class="third" style="color: green;" title="third">t</i>',
		);
		expect(warnings()).toHaveLength(dev ? 1 : 0);
	});

	it('keeps suppressed server values on an adopted element without a warning', async () => {
		serve('SuppressedAttrs', { text: 'server', color: 'red' });
		const adopted = container.querySelector('i')!;
		const recoverable = await hydrate('SuppressedAttrs', { text: 'client', color: 'blue' });

		expect(container.querySelector('i')).toBe(adopted);
		expect(markup(container.firstElementChild!)).toBe(
			'<i class="server" style="color:red;" title="server">t</i>',
		);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
