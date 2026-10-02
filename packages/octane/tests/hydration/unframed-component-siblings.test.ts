import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';
import { hydrationMarkerSummary } from './_marker-summary.js';

// A component call that finds no server range of its own is built on the
// client, and hydration discards the server nodes that stand in its place. A
// server range after those nodes belongs to a later sibling call: that call
// adopts it, the built component stays ahead of it, and the hydration markers
// stay balanced. Each mismatch reports once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/unframed-component-siblings.tsrx',
);
const FILE = 'unframed-component-siblings.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** `FILE:line:column` of the first line reading exactly `text` in export `name`. */
function site(name: string, text: string): string {
	const from = LINES.findIndex((line) => line.startsWith(`export function ${name}(`));
	const index = LINES.findIndex((line, at) => at > from && line.trim() === text);
	if (from < 0 || index < 0) throw new Error(`fixture export ${name} has no line ${text}`);
	return `${FILE}:${index + 1}:${LINES[index].indexOf(text)}`;
}

/** 1-based line of the first fixture line containing `text`. */
function lineOf(text: string): number {
	const index = LINES.findIndex((line) => line.includes(text));
	if (index < 0) throw new Error(`fixture has no line containing ${text}`);
	return index + 1;
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

const RANGE_REBUILT =
	/the server rendered a different child shape where the client renders a component/;

/** Where Leaf's `<em>` reports, as a pattern. */
const AT_LEAF = `at ${FILE.replace(/\./g, '\\.')}:${lineOf('<em>{props.v}</em>')}:\\d+: `;

/** The built component's diagnostic: its missing range, against the server's `<em>`. */
function missingRange(loc: string): string {
	return (
		`Octane hydration mismatch at ${loc}: the client expected a component range but the ` +
		'server rendered <em>. The mismatched subtree was rebuilt on the client.'
	);
}

const LATER_RANGE = [
	{
		built: 'a component that renders nothing',
		name: 'EmptyThenRange',
		call: '<Empty log={props.log} />',
		mounted: ['Empty'],
		html: '<em>z</em>',
		serverHtml: '<em>x</em><em>z</em>',
	},
	{
		built: 'a component with two roots',
		name: 'PairThenRange',
		call: '<Pair log={props.log} />',
		mounted: ['Pair'],
		html: '<i>a</i><i>b</i><em>z</em>',
		serverHtml: '<em>x</em><b>y</b><em>z</em>',
	},
	{
		built: 'the first component call in an element',
		name: 'HostEmptyFirst',
		call: '<Empty log={props.log} />',
		mounted: ['Empty'],
		html: '<section><em>z</em></section>',
		serverHtml: '<section><em>x</em><em>z</em></section>',
	},
	{
		built: 'the first call in an element, to a hookless component',
		name: 'HostLiteFirst',
		call: '<Tag />',
		mounted: [],
		html: '<section><b>t</b><em>z</em></section>',
		serverHtml: '<section><em>x</em><em>z</em></section>',
	},
];

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — sibling calls after a component built on the client ($name)', ({ dev }) => {
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

	/** Server-render the `@else` arm, then hydrate the first arm over it. */
	async function hydrate(name: string, log: string[]) {
		container.innerHTML = ServerRT.renderToString(server[name], { on: false, log: [] }).html;
		const serverZ = Array.from(container.querySelectorAll('em')).find(
			(em) => em.textContent === 'z',
		)!;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ on: true, log },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { div: container.firstElementChild!, serverZ, recoverable };
	}

	it.each(LATER_RANGE)(
		"adopts a later sibling's server range after building $built",
		async ({ name, call, mounted, html }) => {
			const log: string[] = [];
			const { div, serverZ, recoverable } = await hydrate(name, log);

			expect(markup(div)).toBe(html);
			expect(container.querySelector('em')).toBe(serverZ);
			expect(() => hydrationMarkerSummary(container)).not.toThrow();
			expect(log).toEqual(mounted);
			expect(recoverable).toEqual([expect.stringMatching(RANGE_REBUILT)]);
			expect(warnings()).toEqual(dev ? [missingRange(site(name, call))] : []);
		},
	);

	// Calls claim server ranges in order, so the sibling after the built
	// component claims the range the server rendered for a later one.
	it('gives the next sibling call the server range after the built component', async () => {
		const log: string[] = [];
		const { div, serverZ, recoverable } = await hydrate('EmptyFirst', log);

		expect(markup(div)).toBe('<em>x</em><em>z</em>');
		expect(container.querySelector('em')).toBe(serverZ);
		expect(() => hydrationMarkerSummary(container)).not.toThrow();
		expect(log).toEqual(['Empty']);
		expect(recoverable).toEqual([expect.stringMatching(RANGE_REBUILT)]);
		const reported = warnings();
		expect(reported).toHaveLength(dev ? 3 : 0);
		if (dev) {
			expect(reported).toEqual(
				expect.arrayContaining([
					missingRange(site('EmptyFirst', '<Empty log={props.log} />')),
					expect.stringMatching(
						new RegExp(`${AT_LEAF}server rendered text "z" but the client rendered "x"`),
					),
					expect.stringMatching(
						new RegExp(`${AT_LEAF}the client expected <em> but the server rendered`),
					),
				]),
			);
		}
	});

	it.each([{ name: 'EmptyFirst', serverHtml: '<em>x</em><em>z</em>' }, ...LATER_RANGE])(
		'switches $name between arms after hydrating',
		async ({ name, serverHtml }) => {
			const log: string[] = [];
			const { div } = await hydrate(name, log);
			const hydrated = markup(div);

			flushSync(() => root!.render(client[name], { on: false, log }));
			expect(markup(div)).toBe(serverHtml);
			flushSync(() => root!.render(client[name], { on: true, log }));
			expect(markup(div)).toBe(hydrated);
		},
	);
});
