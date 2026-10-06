import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A server range whose content differs from the client's, where the client
// renders sibling component calls that each need a range of their own. The
// first call finds the server's content where its range belongs: the server
// HTML does not match the client render, and with no Suspense boundary around
// it the root renders on the client, as React's does. That is one fallback,
// reported once, however many later siblings or ranges would also differ.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/component-range-siblings.tsrx',
);
const FILE = 'component-range-siblings.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** `FILE:line:column` of the fixture's component `name`, which a mismatch in its output names. */
function definition(name: string): string {
	const index = LINES.findIndex((source) => source.startsWith(`function ${name}(`));
	if (index < 0) throw new Error(`fixture has no function ${name}`);
	return `${FILE}:${index + 1}:0`;
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

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;
const RANGE_END = 'the end of the parent block (fewer nodes than expected)';

function diagnostic(loc: string, expected: string, server: string): string {
	return (
		`Octane hydration mismatch at ${loc}: the client expected ${expected} but the server ` +
		`rendered ${server}. The nearest Suspense or Hydrate boundary, or the root, will be ` +
		`regenerated on the client.`
	);
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — sibling components over mismatched server content ($name)', ({ dev }) => {
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
		const serverElements = [...container.querySelectorAll('*')];
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { serverElements, recoverable };
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

	it('renders the root on the client once for server text in place of two component ranges', async () => {
		const { serverElements, recoverable } = await hydrate(
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
		expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev
				? [diagnostic(definition('Tally'), 'a fragment starting with <button>', 'text "server"')]
				: [],
		);

		// Every client-rendered component is live.
		const buttons = ['inner', 'inner2', 'after'].map((name) =>
			container.querySelector<HTMLButtonElement>(`button.${name}`)!,
		);
		for (const button of buttons) flushSync(() => button.click());
		expect(buttons.map((button) => button.textContent)).toEqual(['inner:1', 'inner2:1', 'after:1']);

		const after = buttons[2];
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
		expect(recoverable).toHaveLength(1);
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
			expected: 'a fragment starting with <button>',
			actual: 'text "server"',
		},
		{
			when: 'the range is a control-flow arm',
			name: 'Arm',
			server: { server: true },
			client: { server: false },
			expected: 'a fragment starting with <button>',
			actual: '<b>',
		},
		{
			when: 'a fragment clone follows the first component',
			name: 'Content',
			server: { value: 'server' },
			client: { value: 'TallyThenPlain' },
			expected: 'a fragment starting with <button>',
			actual: 'text "server"',
		},
		{
			when: 'the first component is a fragment clone',
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
			expected: 'a fragment starting with <button>',
			actual: 'text "server"',
		},
		{
			when: 'the first component is a single-root clone',
			name: 'Content',
			server: { value: 'server' },
			client: { value: 'SingleThenTally' },
			expected: '<i>',
			actual: 'text "server"',
		},
		{
			when: 'an @if arm follows the first component',
			name: 'Content',
			server: { value: 'server' },
			client: { value: 'TallyThenIf' },
			expected: 'a fragment starting with <button>',
			actual: 'text "server"',
		},
	])(
		'renders the root on the client and reports once when $when',
		async ({ name, server: serverProps, client: clientProps, expected, actual }) => {
			const { serverElements, recoverable } = await hydrate(name, serverProps, clientProps);

			expect(markup(container)).toBe(clientMarkup(name, clientProps));
			expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
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

	// The first mismatch already renders the root on the client, so the second
	// range is never compared.
	it('renders the root on the client once for two mismatched ranges', async () => {
		const { serverElements, recoverable } = await hydrate(
			'TwoHoles',
			{ first: 'one', second: 'two' },
			{ first: 'Wrapper', second: 'Wrapper' },
		);

		const props = { first: 'Wrapper', second: 'Wrapper' };
		expect(markup(container)).toBe(clientMarkup('TwoHoles', props));
		expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		const loc = definition('Tally');
		expect(warnings()).toEqual(
			dev ? [diagnostic(loc, 'a fragment starting with <button>', 'text "one"')] : [],
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
