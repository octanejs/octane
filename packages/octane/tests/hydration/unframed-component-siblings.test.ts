import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';
import { hydrationMarkerSummary } from './_marker-summary.js';

// The server rendered plain elements where the client calls a component. As
// in React, which compares only the DOM, the calls adopt those elements in
// place, and it is a mismatch unless they render exactly the server's
// elements: nothing is repaired in place, the root renders on the client and
// reports once, each component's effects run once, and the hydration markers
// stay balanced. A call that renders nothing leaves the server's element to
// the next call, whose own content then differs from it.

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

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** React's recoverable hydration error. */
const MISMATCH = /server rendered HTML didn't match the client/;

/** The development warning at `loc`, against the server's `<em>`. */
function mismatchAt(loc: string, expected: string): string {
	return (
		`Octane hydration mismatch at ${loc}: the client expected ${expected} but the server ` +
		'rendered <em>. The nearest Suspense or Hydrate boundary, or the root, will be ' +
		'regenerated on the client.'
	);
}

/** The call's diagnostic: its missing range. */
const missingRange = (name: string, call: string) => () =>
	mismatchAt(site(name, call), 'a component range');

/** `FILE:line:0` of the declaration `function name(`. */
function definitionOf(name: string): string {
	const index = LINES.findIndex((line) => line.startsWith(`function ${name}(`));
	if (index < 0) throw new Error(`fixture has no function ${name}`);
	return `${FILE}:${index + 1}:0`;
}

/** `FILE:line:column` of `text` in the template of `function name(`. */
function templateSite(name: string, text: string): string {
	const from = LINES.findIndex((line) => line.startsWith(`function ${name}(`));
	const index = LINES.findIndex((line, at) => at > from && line.includes(text));
	if (from < 0 || index < 0) throw new Error(`fixture function ${name} has no ${text}`);
	return `${FILE}:${index + 1}:${LINES[index].indexOf(text)}`;
}

/** The next call's text differs from the server's element it adopted in place. */
const nextCallText = () =>
	`Octane hydration mismatch at ${templateSite('Leaf', 'props.v')}: the client expected ` +
	'text "z" but the server rendered text "x". The nearest Suspense or Hydrate boundary, or ' +
	'the root, will be regenerated on the client.';

const LATER_RANGE = [
	{
		built: 'a component that renders nothing',
		name: 'EmptyThenRange',
		// The call renders nothing, so the next one adopts the server's element.
		report: nextCallText,
		mounted: ['Empty'],
		html: '<em>z</em>',
		serverHtml: '<em>x</em><em>z</em>',
	},
	{
		built: 'a component with two roots',
		name: 'PairThenRange',
		// The call adopts in place, so its own fragment reports.
		report: () => mismatchAt(definitionOf('Pair'), 'a fragment starting with <i>'),
		mounted: ['Pair'],
		html: '<i>a</i><i>b</i><em>z</em>',
		serverHtml: '<em>x</em><b>y</b><em>z</em>',
	},
	{
		built: 'the first component call in an element',
		name: 'HostEmptyFirst',
		report: nextCallText,
		mounted: ['Empty'],
		html: '<section><em>z</em></section>',
		serverHtml: '<section><em>x</em><em>z</em></section>',
	},
	{
		built: 'the first call in an element, to a hookless component',
		name: 'HostLiteFirst',
		report: missingRange('HostLiteFirst', '<Tag />'),
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

	/** Server-render the `@else` arm, unless already rendered, then hydrate the first arm over it. */
	async function hydrate(name: string, log: string[], render = true) {
		if (render)
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
		'client-renders the root when $built stands where the server rendered an element',
		async ({ name, report, mounted, html }) => {
			const log: string[] = [];
			const { div, serverZ, recoverable } = await hydrate(name, log);

			expect(markup(div)).toBe(html);
			expect(serverZ.isConnected).toBe(false);
			expect(() => hydrationMarkerSummary(container)).not.toThrow();
			expect(log).toEqual(mounted);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [report()] : []);
		},
	);

	// React compares DOM only: a call that renders nothing, then the calls that
	// render exactly the server's elements, adopt every one of them.
	it('adopts the server elements when the calls render exactly them', async () => {
		container.innerHTML = ServerRT.renderToString(server.EmptyFirst, {
			on: false,
			log: [],
		}).html;
		const serverNodes = [...container.querySelectorAll('*')];
		const log: string[] = [];
		const { div, recoverable } = await hydrate('EmptyFirst', log, false);

		expect(markup(div)).toBe('<em>x</em><em>z</em>');
		const nodes = [...container.querySelectorAll('*')];
		expect(nodes).toHaveLength(serverNodes.length);
		nodes.forEach((node, i) => expect(node).toBe(serverNodes[i]));
		expect(() => hydrationMarkerSummary(container)).not.toThrow();
		expect(log).toEqual(['Empty']);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
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
