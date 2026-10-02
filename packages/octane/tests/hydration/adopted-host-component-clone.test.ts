import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// Hydration adopts an element whose children are all component calls, but the
// server rendered other content inside it. The first call reports the server
// node that stands where its range belongs, once; the element's server content
// is discarded and its components are built inside the adopted element, in
// order. Adoption of a matching server render, and arm switches after the
// rebuild, are the neighbouring controls.

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
const RANGE_REBUILT =
	/the server rendered a different child shape where the client renders a component/;

/** The one diagnostic: the first call's missing range, against what the server rendered. */
function missingRange(loc: string, server = '<b>'): string {
	return (
		`Octane hydration mismatch at ${loc}: the client expected a component range but the ` +
		`server rendered ${server}. The mismatched subtree was rebuilt on the client.`
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
])(
	'hydrateRoot — component calls in an adopted element with other server content ($name)',
	({ dev }) => {
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
			const div = container.firstElementChild!;
			const article = container.querySelector('article');
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
			return { div, article, section, leaves, recoverable };
		}

		it.each(CASES)(
			'rebuilds $slot inside the adopted element and reports the server node once',
			async ({ name, loc, html }) => {
				const { div, article, section, recoverable } = await hydrate(name, { server: true });

				expect(container.firstElementChild).toBe(div);
				expect(container.querySelector('article')).toBe(article);
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe(html);
				expect(recoverable).toEqual([expect.stringMatching(RANGE_REBUILT)]);
				expect(warnings()).toEqual(dev ? [missingRange(loc)] : []);
			},
		);

		it('rebuilds a component in an adopted element that the server left empty', async () => {
			const { section, recoverable } = await hydrate('EmptyElementHost', { server: true });

			expect(container.querySelector('section')).toBe(section);
			expect(markup(section)).toBe('<i>ok</i>');
			expect(recoverable).toEqual([expect.stringMatching(RANGE_REBUILT)]);
			expect(warnings()).toEqual(
				dev ? [missingRange(site('EmptyElementHost', '<Leaf />'), 'nothing')] : [],
			);
		});

		it.each(CASES)('adopts $slot when the server rendered it', async ({ name, html }) => {
			const { section, leaves, recoverable } = await hydrate(name, {});

			expect(markup(section)).toBe(html);
			expect(section.children).toHaveLength(leaves.length);
			leaves.forEach((leaf, index) => expect(section.children[index]).toBe(leaf));
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		});

		it.each(CASES)('switches arms after rebuilding $slot', async ({ name, html }) => {
			await hydrate(name, { server: true });

			flushSync(() => root!.render(client[name], { server: true }));
			expect(markup(container.querySelector('section')!)).toBe(SERVER_ARM);
			flushSync(() => root!.render(client[name], {}));
			expect(markup(container.querySelector('section')!)).toBe(html);
		});
	},
);
