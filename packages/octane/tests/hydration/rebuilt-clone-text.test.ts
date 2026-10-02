import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a template's root does not match the server node at the cursor,
// hydration reports the structural mismatch and rebuilds that subtree on the
// client. The rebuilt subtree holds no server text, so its text holes must not
// report a second, text mismatch for the same recovery, while a text mismatch
// inside an adopted server element still reports.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-text.tsrx',
);
const FILE = 'rebuilt-clone-text.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

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

const STRUCTURAL = /the mismatched subtree was rebuilt on the client/;
const TEXT = /server-rendered text differed from the client/;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — text holes in a rebuilt template clone ($name)', ({ dev }) => {
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

	it.each([
		{ site: 'an @if arm', name: 'Branch', serverProps: { server: true }, clientProps: {} },
		{
			site: 'a @try body',
			name: 'TryBranch',
			serverProps: { server: true },
			clientProps: {},
		},
		{
			site: 'a server @pending arm',
			name: 'TryBranch',
			serverProps: { value: new Promise<never>(() => {}) },
			clientProps: {},
			actual: '<p>',
		},
		{
			site: 'a render-phase update',
			name: 'DrainBranch',
			serverProps: {},
			clientProps: { flip: true },
		},
	])(
		'reports only the structural rebuild of an only-child text hole in $site',
		async ({ name, serverProps, clientProps, actual = '<b>' }) => {
			const recoverable = await hydrate(name, serverProps, clientProps);

			expect(markup(container.firstElementChild!)).toBe('<i>ok</i>');
			expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(
				dev
					? [
							`Octane hydration mismatch at ${FILE}:${lineOf('<i>{read(props.value)')}:1: the client ` +
								`expected <i> but the server rendered ${actual}. The mismatched subtree was ` +
								'rebuilt on the client.',
						]
					: [],
			);
		},
	);

	it('reports only the structural rebuild of a sibling text hole', async () => {
		const recoverable = await hydrate('SiblingBranch', { server: true }, {});

		expect(markup(container.firstElementChild!)).toBe('<i><u>x</u>ok</i>');
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(
			dev
				? [
						`Octane hydration mismatch at ${FILE}:${lineOf('function SiblingLeaf(') + 1}:1: the ` +
							'client expected <i> but the server rendered <b>. The mismatched subtree was ' +
							'rebuilt on the client.',
					]
				: [],
		);
	});

	it('still reports server text that differs inside an adopted element', async () => {
		container.innerHTML = ServerRT.renderToString(server.Label, { text: 'server' }).html;
		const adopted = container.querySelector('i')!;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.Label,
			{ text: 'client' },
			{
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			},
		);
		flushSync(() => {});
		await act(async () => {});

		expect(container.querySelector('i')).toBe(adopted);
		expect(markup(container.firstElementChild!)).toBe('<i>client</i>');
		expect(recoverable).toEqual([expect.stringMatching(TEXT)]);
		expect(warnings()).toEqual(
			dev
				? [
						`Octane hydration mismatch at ${FILE}:${lineOf('<i>{props.text')}:2: server ` +
							'rendered text "server" but the client rendered "client". The client value was ' +
							'used. If this difference is intentional (e.g. a timestamp or random id), add ' +
							'suppressHydrationWarning to the element.',
					]
				: [],
		);
	});
});
