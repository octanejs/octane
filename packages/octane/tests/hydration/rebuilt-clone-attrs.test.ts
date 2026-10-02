import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a template's root does not match the server node at the cursor,
// hydration reports the structural mismatch and rebuilds that subtree on the
// client. The rebuilt subtree is client DOM, so its dynamic attributes, class,
// and style are ordinary client writes: they must not report a second, value
// mismatch for the same recovery, and `suppressHydrationWarning` (which keeps a
// SERVER value) must not drop them. A value mismatch on an adopted server
// element still reports, and suppression still keeps the server value there.

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

const STRUCTURAL = /the mismatched subtree was rebuilt on the client/;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — attributes of a rebuilt template clone ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { unmount(): void } | null;
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

	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		clientProps: Record<string, unknown>,
	): Promise<string[]> {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
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
		'rendered <b>. The mismatched subtree was rebuilt on the client.';

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
		'reports only the structural rebuild of $site',
		async ({ name, clientProps, leaf, expected }) => {
			const recoverable = await hydrate(name, { server: true }, clientProps);

			expect(markup(container.firstElementChild!)).toBe(expected);
			expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(dev ? [structural(lineOf(leaf) + 1)] : []);
		},
	);

	it('still reports attribute, class, and style values that differ on an adopted element', async () => {
		container.innerHTML = ServerRT.renderToString(server.Attrs, {
			text: 'server',
			color: 'red',
		}).html;
		const adopted = container.querySelector('i')!;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.Attrs,
			{ text: 'client', color: 'blue' },
			{
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			},
		);
		flushSync(() => {});
		await act(async () => {});

		expect(container.querySelector('i')).toBe(adopted);
		expect(markup(container.firstElementChild!)).toBe(
			'<i class="client" style="color: blue;" title="client">t</i>',
		);
		expect(recoverable).toEqual([]);
		const at = `Octane hydration mismatch at ${FILE}:${lineOf('<i title={props.text}')}:2: server rendered`;
		const tail =
			'The client value was used. If this difference is intentional (e.g. a timestamp or ' +
			'random id), add suppressHydrationWarning to the element.';
		expect([...warnings()].sort()).toEqual(
			dev
				? [
						`${at} attribute \`class\` "server" but the client rendered "client". ${tail}`,
						`${at} attribute \`title\` "server" but the client rendered "client". ${tail}`,
						`${at} style "color: red;" but the client rendered "color: blue;". ${tail}`,
					]
				: [],
		);
	});

	it('still keeps suppressed server values on an adopted element', async () => {
		container.innerHTML = ServerRT.renderToString(server.SuppressedAttrs, {
			text: 'server',
			color: 'red',
		}).html;
		const adopted = container.querySelector('i')!;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.SuppressedAttrs,
			{ text: 'client', color: 'blue' },
			{
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			},
		);
		flushSync(() => {});
		await act(async () => {});

		expect(container.querySelector('i')).toBe(adopted);
		expect(markup(container.firstElementChild!)).toBe(
			'<i class="server" style="color:red;" title="server">t</i>',
		);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
