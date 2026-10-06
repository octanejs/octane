import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// An element whose children are all component calls, where the server rendered
// other content inside it. As in React, the server HTML does not match: nothing
// is rebuilt inside the element. With no Suspense or Hydrate boundary the root
// discards its server DOM, renders on the client, and reports once; development
// warns once, at the first call whose server output differs. Adoption of a
// matching server render, and arm switches after the fallback, are the
// neighbouring controls.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/adopted-host-component-clone.tsrx',
);
const FILE = 'adopted-host-component-clone.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** `FILE:line:column` of the first line reading exactly `call` in export `name`. */
function site(name: string, call: string): string {
	const from = LINES.findIndex((source) => source.startsWith(`export function ${name}(`));
	const index = LINES.findIndex((source, line) => line > from && source.trim() === call);
	if (from < 0 || index < 0) throw new Error(`fixture export ${name} has no line ${call}`);
	return `${FILE}:${index + 1}:${LINES[index].indexOf(call)}`;
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

const SERVER_ARM = '<b class="server">server</b><s>x</s>';
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

/** The one development diagnostic, at the first call, against what the server rendered. */
function structural(loc: string, server = '<b>'): RegExp {
	const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(
		`^Octane hydration mismatch at ${escaped(loc)}: the client expected .+ but the server ` +
			`rendered ${escaped(server)}\\. The nearest Suspense or Hydrate boundary, or the root, ` +
			'will be regenerated on the client\\.$',
	);
}

const CASES = [
	{ slot: 'a single-root component', name: 'ElementHost', call: '<Leaf />', html: '<i>ok</i>' },
	{
		slot: 'a lite component',
		name: 'LiteElementHost',
		call: '<LiteLeaf text={LABEL} />',
		html: '<i>ok</i>',
	},
	{
		slot: 'a single-root component in a nested element',
		name: 'NestedElementHost',
		call: '<Leaf />',
		html: '<i>ok</i>',
	},
	{
		slot: 'a lite component in a nested element',
		name: 'LiteNestedElementHost',
		call: '<LiteLeaf text={LABEL} />',
		html: '<i>ok</i>',
	},
	{
		slot: 'single-root sibling components',
		name: 'SiblingElementHost',
		call: '<Leaf />',
		html: '<i>ok</i><u>ok</u>',
	},
	{
		slot: 'lite sibling components',
		name: 'LiteSiblingElementHost',
		call: '<LiteLeaf text={LABEL} />',
		html: '<i>ok</i><u>ok</u>',
	},
	{
		slot: 'fragment sibling components',
		name: 'FragmentSiblingElementHost',
		call: '<FragmentLeaf />',
		html: '<i>ok</i><em>a</em><u>ok</u><em>b</em>',
	},
].map((entry) => ({ ...entry, loc: site(entry.name, entry.call) }));

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — component calls in an element with other server content ($name)', ({ dev }) => {
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

	async function hydrate(name: string, serverProps: Record<string, unknown>) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const served = [...container.querySelectorAll('*')];
		const section = container.querySelector('section')!;
		const leaves = Array.from(section.children);
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{},
			{
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			},
		);
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { served, section, leaves, recoverable };
	}

	it.each(CASES)(
		'renders the root on the client when $slot finds other server content, reporting once',
		async ({ name, loc, html }) => {
			const { served, recoverable } = await hydrate(name, { server: true });

			expect(markup(container.querySelector('section')!)).toBe(html);
			expect(served.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [expect.stringMatching(structural(loc))] : []);
		},
	);

	it('renders the root on the client when the server left the element empty', async () => {
		const { served, recoverable } = await hydrate('EmptyElementHost', { server: true });

		expect(markup(container.querySelector('section')!)).toBe('<i>ok</i>');
		expect(served.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev
				? [expect.stringMatching(structural(site('EmptyElementHost', '<Leaf />'), 'nothing'))]
				: [],
		);
	});

	it.each(CASES)('adopts $slot when the server rendered it', async ({ name, html }) => {
		const { section, leaves, recoverable } = await hydrate(name, {});

		expect(container.querySelector('section')).toBe(section);
		expect(markup(section)).toBe(html);
		expect(section.children).toHaveLength(leaves.length);
		leaves.forEach((leaf, index) => expect(section.children[index]).toBe(leaf));
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it.each(CASES)(
		'switches arms after the root renders $slot on the client',
		async ({ name, html }) => {
			const { recoverable } = await hydrate(name, { server: true });
			const div = container.firstElementChild;

			flushSync(() => root!.render(client[name], { server: true }));
			expect(markup(container.querySelector('section')!)).toBe(SERVER_ARM);
			flushSync(() => root!.render(client[name], {}));
			expect(markup(container.querySelector('section')!)).toBe(html);
			expect(container.firstElementChild).toBe(div);
			expect(recoverable).toHaveLength(1);
		},
	);
});
