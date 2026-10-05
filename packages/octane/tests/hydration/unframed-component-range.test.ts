import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered other content where a client component call expects its
// range, and later siblings' ranges follow that content. The client builds the
// component where that content stood and discards it, but not the later
// siblings' ranges: those siblings adopt their server nodes. A component that
// suspends first leaves the server content on screen, and the attempt that
// completes reports the mismatch once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/unframed-component-range.tsrx',
);
const FILE = 'unframed-component-range.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/**
 * `FILE:line:column` of the first line reading exactly `text` in export `name`,
 * in its client arm when `client` is set.
 */
function site(name: string, text: string, client = false): string {
	const declared = LINES.findIndex((source) => source.startsWith(`export function ${name}(`));
	const from = client
		? LINES.findIndex((source, line) => line > declared && source.trim() === '} @else {')
		: declared;
	const index = LINES.findIndex((source, line) => line > from && source.trim() === text);
	if (from < 0 || index < 0) throw new Error(`fixture export ${name} has no line ${text}`);
	return `${FILE}:${index + 1}:${LINES[index].indexOf(text)}`;
}

/** `FILE:line:0` of the declaration of component `name`. */
function declaration(name: string): string {
	const index = LINES.findIndex((source) => source.startsWith(`function ${name}(`));
	if (index < 0) throw new Error(`fixture has no component ${name}`);
	return `${FILE}:${index + 1}:0`;
}

/** Element and text markup, ignoring hydration comments and boundary attributes. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	for (const element of copy.querySelectorAll('[data-octane-hydrate-id]'))
		for (const { name } of Array.from(element.attributes)) element.removeAttribute(name);
	return copy.innerHTML;
}

const SERVER_ARM = '<b class="server">server</b><em>e</em>';

// The development compile renders the hookless Pair through the lite slot,
// which rebuilds its fragment where the server node stood.
const PAIR_REBUILT = 'a fragment starting with <u>';

/** A published structural mismatch diagnostic. */
function rebuilt(loc: string, expected: string, server = '<b>'): string {
	return (
		`Octane hydration mismatch at ${loc}: the client expected ${expected} but the server ` +
		`rendered ${server}. The mismatched subtree was rebuilt on the client.`
	);
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a component call where the server rendered other content ($name)', ({ dev }) => {
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

	/**
	 * Server-render `name`'s server arm, then hydrate the client's arm with a
	 * pending `leaf`. `settle` resolves it.
	 */
	async function hydrate(name: string, props: Record<string, unknown> = { server: true }) {
		container.innerHTML = ServerRT.renderToString(server[name], {
			...props,
			leaf: Promise.resolve('unused'),
		}).html;
		const section = container.querySelector('section')!;
		const nodes = Array.from(section.children);
		const served = (tag: string) => {
			const node = nodes.find((element) => element.localName === tag);
			if (node === undefined) throw new Error(`the server rendered no <${tag}>`);
			return node;
		};
		let resolve!: (value: string) => void;
		const leaf = new Promise<string>((done) => (resolve = done));
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ leaf },
			{ onRecoverableError: (error: unknown) => recoverable.push(error) },
		);
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		const settle = () =>
			act(async () => {
				resolve('z');
				await leaf;
			});
		return { section, nodes, served, recoverable, settle };
	}

	it.each([
		{ shape: 'under a <Hydrate> boundary', name: 'FragBranch', call: '<Frag leaf={props.leaf} />' },
		{
			shape: 'whose child suspends',
			name: 'FragChildBranch',
			call: '<FragChild leaf={props.leaf} />',
		},
		{ shape: 'in the root', name: 'FragRoot', call: '<Frag leaf={props.leaf} />' },
	])(
		'keeps the server content while a component built in its place suspends $shape',
		async ({ name, call }) => {
			const { section, served, recoverable, settle } = await hydrate(name);
			const bold = served('b');
			const em = served('em');

			expect(container.querySelector('section')).toBe(section);
			expect(section.querySelector('b')).toBe(bold);
			expect(section.querySelector('em')).toBe(em);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			await settle();
			expect(markup(section)).toBe('<u>z</u><i>x</i><em>e</em>');
			expect(section.querySelector('em')).toBe(em);
			expect(recoverable).toHaveLength(1);
			expect(warnings()).toEqual(dev ? [rebuilt(site(name, call), 'a component range')] : []);
		},
	);

	it('keeps the server content while a fragment rebuilt over another range suspends', async () => {
		const { section, served, recoverable, settle } = await hydrate('RangeBranch');
		const bold = served('b');
		const em = served('em');

		expect(markup(section)).toBe(SERVER_ARM);
		expect(section.querySelector('b')).toBe(bold);
		expect(section.querySelector('em')).toBe(em);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		await settle();
		expect(markup(section)).toBe('<u>z</u><i>x</i><em>e</em>');
		expect(section.querySelector('em')).toBe(em);
		expect(recoverable).toHaveLength(1);
		expect(warnings()).toEqual(
			dev ? [rebuilt(declaration('Frag'), 'a fragment starting with <u>')] : [],
		);
	});

	it.each([
		{
			shape: 'a nested <Hydrate> boundary',
			name: 'HydrateBranch',
			call: '<Hydrate split={false} when={load()}>',
			html: '<div><i>ok</i></div><em>e</em>',
			sibling: 'em',
			expected: 'a component range',
		},
		{
			shape: 'a fragment component',
			name: 'PairBranch',
			call: '<Pair />',
			html: '<u>u</u><i>x</i><em>e</em>',
			sibling: 'em',
			expected: PAIR_REBUILT,
		},
		{
			shape: 'a component before a caught @try',
			name: 'CaughtBranch',
			call: '<Pair />',
			html: '<u>u</u><i>x</i><s>boom</s>',
			sibling: 's',
			expected: PAIR_REBUILT,
		},
		{
			shape: 'a component before a <Hydrate> that never hydrates',
			name: 'StaticBranch',
			call: '<Pair />',
			html: '<u>u</u><i>x</i><s>static</s>',
			sibling: 's',
			expected: PAIR_REBUILT,
		},
	])(
		'builds $shape ahead of the sibling it leaves adopted',
		async ({ name, call, html, sibling, expected }) => {
			const { section, served, recoverable } = await hydrate(name);
			const adopted = served(sibling);

			expect(markup(section)).toBe(html);
			expect(section.querySelector(sibling)).toBe(adopted);
			expect(recoverable).toHaveLength(1);
			expect(warnings()).toEqual(dev ? [rebuilt(site(name, call, true), expected)] : []);
		},
	);

	it('discards a server range that no later sibling claims', async () => {
		const { section, recoverable } = await hydrate('TailBranch');

		expect(markup(section)).toBe('<u>u</u><i>x</i>');
		expect(recoverable).toHaveLength(1);
		expect(warnings()).toEqual(
			dev
				? [
						rebuilt(site('TailBranch', '<Pair />'), PAIR_REBUILT),
						rebuilt(
							site('TailBranch', '@if (props.server) {'),
							'the end of the branch',
							'a control-flow block',
						),
					]
				: [],
		);
	});

	it('adopts every node when the server rendered the same arm', async () => {
		const { section, nodes, recoverable } = await hydrate('PairBranch', {});

		expect(markup(section)).toBe('<u>u</u><i>x</i><em>e</em>');
		expect(section.children).toHaveLength(nodes.length);
		nodes.forEach((node, index) => expect(section.children[index]).toBe(node));
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
