import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A server range whose content differs from the client's, where the client
// renders sibling component calls that each need a range of their own. The
// first call finds the server's content where its range belongs, reports it,
// and discards everything up to the end of the range. Every later sibling
// then finds that end for the same reason: one recovery, reported once. A
// mismatch in a separate range is a second recovery and still reports.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/component-range-siblings.tsrx',
);
const FILE = 'component-range-siblings.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** `FILE:line:column` of the first line reading exactly `call` in function `name`. */
function site(name: string, call: string): string {
	const from = LINES.findIndex((source) => source.startsWith(`function ${name}(`));
	const index = LINES.findIndex((source, line) => line > from && source.trim() === call);
	if (from < 0 || index < 0) throw new Error(`fixture function ${name} has no line ${call}`);
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

const RANGE_REBUILT =
	/the server rendered a different child shape where the client renders a component/;
const RECOVERED = /^Hydration mismatch: /;
const RANGE_END = 'the end of the parent block (fewer nodes than expected)';

function diagnostic(loc: string, expected: string, server: string): string {
	return (
		`Octane hydration mismatch at ${loc}: the client expected ${expected} but the server ` +
		`rendered ${server}. The mismatched subtree was rebuilt on the client.`
	);
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — sibling components in a mismatched server range ($name)', ({ dev }) => {
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

	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		clientProps: Record<string, unknown>,
	) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const after = container.querySelector('button.after')!;
		const afterLabel = container.querySelector('small.after')!;
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { after, afterLabel, recoverable };
	}

	/** The markup a client render of the same props puts in the container. */
	function clientMarkup(name: string, props: Record<string, unknown>): string {
		const node = document.createElement('div');
		const clientRoot = createRoot(node);
		flushSync(() => clientRoot.render(client[name] as never, props));
		try {
			return markup(node);
		} finally {
			clientRoot.unmount();
		}
	}

	it('reports server text in place of two component ranges once', async () => {
		const { after, afterLabel, recoverable } = await hydrate(
			'HoleSwap',
			{ label: 'server' },
			{ label: 'client' },
		);

		const section = container.querySelector('section')!;
		expect(markup(section)).toBe(
			'<button class="inner">inner:0</button><small class="inner">inner</small>' +
				'<button class="inner2">inner2:0</button><small class="inner2">inner2</small>' +
				'<button class="after">after:0</button><small class="after">after</small>',
		);
		expect(container.querySelector('button.after')).toBe(after);
		expect(container.querySelector('small.after')).toBe(afterLabel);
		expect(recoverable).toEqual([expect.stringMatching(RANGE_REBUILT)]);
		expect(warnings()).toEqual(
			dev
				? [
						diagnostic(
							site('Wrapper', '<Tally name="inner" />'),
							'a component range',
							'text "server"',
						),
					]
				: [],
		);

		// Both rebuilt components and the adopted one are live.
		const buttons = ['inner', 'inner2', 'after'].map((name) =>
			container.querySelector<HTMLButtonElement>(`button.${name}`)!,
		);
		for (const button of buttons) flushSync(() => button.click());
		expect(buttons.map((button) => button.textContent)).toEqual(['inner:1', 'inner2:1', 'after:1']);

		flushSync(() => root!.render(client.HoleSwap, { label: 'server' }));
		expect(markup(section)).toBe(
			'server<button class="after">after:1</button><small class="after">after</small>',
		);
		flushSync(() => root!.render(client.HoleSwap, { label: 'client' }));
		expect(markup(section)).toBe(
			'<button class="inner">inner:0</button><small class="inner">inner</small>' +
				'<button class="inner2">inner2:0</button><small class="inner2">inner2</small>' +
				'<button class="after">after:1</button><small class="after">after</small>',
		);
		expect(container.querySelector('button.after')).toBe(after);
		expect(warnings()).toHaveLength(dev ? 1 : 0);
	});

	it.each([
		{
			when: 'the server range is empty',
			name: 'Content',
			server: { value: '' },
			client: { value: 'Wrapper' },
			expected: 'a component range',
			actual: RANGE_END,
		},
		{
			when: 'the hole is in the root component’s own output',
			name: 'RootContent',
			server: { value: 'server' },
			client: { value: 'Wrapper' },
			expected: 'a component range',
			actual: 'text "server"',
		},
		{
			when: 'the range is a control-flow arm',
			name: 'Arm',
			server: { server: true },
			client: { server: false },
			expected: 'a component range',
			actual: '<b>',
		},
		{
			when: 'a fragment clone follows the first component',
			name: 'Content',
			server: { value: 'server' },
			client: { value: 'TallyThenPlain' },
			expected: 'a component range',
			actual: 'text "server"',
		},
		{
			when: 'a component follows a rebuilt fragment clone',
			name: 'Content',
			server: { value: 'server' },
			client: { value: 'PlainThenTally' },
			expected: 'a fragment starting with <b>',
			actual: 'text "server"',
		},
		{
			when: 'a single-root component follows the first component',
			name: 'Content',
			server: { value: 'server' },
			client: { value: 'TallyThenSingle' },
			expected: 'a component range',
			actual: 'text "server"',
		},
		{
			when: 'an @if arm follows the first component',
			name: 'Content',
			server: { value: 'server' },
			client: { value: 'TallyThenIf' },
			expected: 'a component range',
			actual: 'text "server"',
		},
	])(
		'reports once when $when',
		async ({ name, server: serverProps, client: clientProps, expected, actual }) => {
			const { after, afterLabel, recoverable } = await hydrate(name, serverProps, clientProps);

			expect(markup(container)).toBe(clientMarkup(name, clientProps));
			expect(container.querySelector('button.after')).toBe(after);
			expect(container.querySelector('small.after')).toBe(afterLabel);
			expect(recoverable).toEqual([expect.stringMatching(RECOVERED)]);
			expect(warnings()).toEqual(
				dev
					? [
							expect.stringMatching(
								new RegExp(
									`^Octane hydration mismatch at ${FILE.replace(/\./g, '\\.')}:\\d+:\\d+: ` +
										`the client expected ${escape(expected)} but the server rendered ` +
										`${escape(actual)}\\.`,
								),
							),
						]
					: [],
			);
		},
	);

	it('reports each of two mismatched ranges', async () => {
		const { after, recoverable } = await hydrate(
			'TwoHoles',
			{ first: 'one', second: 'two' },
			{ first: 'Wrapper', second: 'Wrapper' },
		);

		const props = { first: 'Wrapper', second: 'Wrapper' };
		expect(markup(container)).toBe(clientMarkup('TwoHoles', props));
		expect(container.querySelector('button.after')).toBe(after);
		// One recoverable error per hydration burst, however many recoveries.
		expect(recoverable).toEqual([expect.stringMatching(RANGE_REBUILT)]);
		const loc = site('Wrapper', '<Tally name="inner" />');
		expect(warnings()).toEqual(
			dev
				? [
						diagnostic(loc, 'a component range', 'text "one"'),
						diagnostic(loc, 'a component range', 'text "two"'),
					]
				: [],
		);
	});

	it('adopts the components silently when the server rendered them', async () => {
		container.innerHTML = ServerRT.renderToString(server.HoleSwap, { label: 'client' }).html;
		const elements = [...container.querySelectorAll('*')];
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.HoleSwap,
			{ label: 'client' },
			{
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			},
		);
		flushSync(() => {});
		await act(async () => {});

		const hydrated = container.querySelectorAll('*');
		expect(hydrated).toHaveLength(elements.length);
		elements.forEach((element, index) => expect(hydrated[index]).toBe(element));
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
