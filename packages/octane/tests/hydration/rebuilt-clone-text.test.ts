import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a template's root does not match the server node at the cursor, the
// nearest fallback owner renders on the client, as in React 19. The client
// render holds no server text, so its text holes report nothing more: one
// failed owner reports once. A text mismatch inside an otherwise matching
// element is a mismatch too, and falls back the same way.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-text.tsrx',
);
const FILE = 'rebuilt-clone-text.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');
const HYDRATION_FAILED =
	/^Hydration failed because the server rendered (HTML|text) didn't match the client/;

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

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — text holes in a mismatched template clone ($name)', ({ dev }) => {
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

	/** Hydrate over the server render; returns the server's elements and the reports. */
	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		clientProps: Record<string, unknown>,
	) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const outer = container.firstElementChild!;
		const serverNodes = [...container.querySelectorAll('*')];
		const recoverable: string[] = [];
		const caught: unknown[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			onCaughtError: (error: unknown) => caught.push(error),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { outer, serverNodes, recoverable, caught };
	}

	/** The dev warning for the Leaf's `<i>` where the server rendered `actual`. */
	function structural(line: number, actual: string) {
		return expect.stringMatching(
			new RegExp(
				`^Octane hydration mismatch at ${FILE}:${line}:1: the client expected <i> but the ` +
					`server rendered ${actual}\\.`,
			),
		);
	}

	it.each([
		{
			site: 'an @if arm',
			name: 'Branch',
			serverProps: { server: true },
			clientProps: {},
			arm: false,
		},
		{
			site: 'a @try body',
			name: 'TryBranch',
			serverProps: { server: true },
			clientProps: {},
			arm: true,
		},
		{
			site: 'a render-phase update',
			name: 'DrainBranch',
			serverProps: {},
			clientProps: { flip: true },
			arm: false,
		},
	])(
		'reports once when the owner of an only-child text hole in $site falls back',
		async ({ name, serverProps, clientProps, arm }) => {
			const { outer, serverNodes, recoverable } = await hydrate(name, serverProps, clientProps);

			expect(markup(container.firstElementChild!)).toBe('<i>ok</i>');
			// An `@try` arm is the fallback owner, so the host around it stays;
			// otherwise the root renders on the client.
			const kept = arm ? [outer] : [];
			expect(serverNodes.filter((node) => node.isConnected)).toEqual(kept);
			expect(recoverable).toEqual([expect.stringMatching(HYDRATION_FAILED)]);
			expect(warnings()).toEqual(dev ? [structural(lineOf('<i>{read(props.value)'), '<b>')] : []);
		},
	);

	// renderToString cannot finish a suspended `@try`, so the server sent its
	// `@pending` arm. React marks such a boundary for client rendering
	// (`<!--$!-->`): the client renders only that boundary and reports once,
	// and the host around it keeps its server node.
	it('client-renders only the @try arm that the server left pending', async () => {
		const { outer, recoverable } = await hydrate(
			'TryBranch',
			{ value: new Promise<never>(() => {}) },
			{},
		);

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i>');
		expect(container.firstElementChild).toBe(outer);
		expect(recoverable).toEqual([expect.stringMatching(/^The server could not finish/)]);
	});

	// As React's boundary does, the arm that the server left pending does not
	// restart the throttle on revealing Suspense content when its client render
	// shows `@pending`: it already counted as pending. Its data resolving
	// outside act() reveals it at once, and the boundary reports once.
	it('reveals the @try arm that the server left pending as soon as its client data resolves', async () => {
		// The throttle is global: let an earlier test's reveal leave its window.
		await new Promise((resolve) => setTimeout(resolve, 320));
		container.innerHTML = ServerRT.renderToString(server.TryReader, {
			value: new Promise<never>(() => {}),
		}).html;
		const outer = container.firstElementChild!;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.TryReader,
			{ value: Promise.resolve('ok') },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		expect(markup(outer)).toBe('<p>pending</p>');
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(markup(outer)).toBe('<i>ok</i>');
		expect(container.firstElementChild).toBe(outer);
		expect(recoverable).toEqual([expect.stringMatching(/^The server could not finish/)]);
	});

	// As in React, a client render that catches an error reports that alone.
	it('reports only the caught error when the @try arm that the server left pending throws on the client', async () => {
		const { outer, recoverable, caught } = await hydrate(
			'TryCatchBranch',
			{ value: new Promise<never>(() => {}) },
			{ value: 'x' },
		);

		expect(markup(container.firstElementChild!)).toBe('<b>x</b>');
		expect(container.firstElementChild).toBe(outer);
		expect(caught).toEqual(['x']);
		expect(recoverable).toEqual([]);
	});

	it('reports once when the owner of a sibling text hole falls back', async () => {
		const { serverNodes, recoverable } = await hydrate('SiblingBranch', { server: true }, {});

		expect(markup(container.firstElementChild!)).toBe('<i><u>x</u>ok</i>');
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(HYDRATION_FAILED)]);
		expect(warnings()).toEqual(dev ? [structural(lineOf('function SiblingLeaf(') + 1, '<b>')] : []);
	});

	it('client-renders the root for server text that differs inside a matching element', async () => {
		const { serverNodes, recoverable } = await hydrate(
			'Label',
			{ text: 'server' },
			{ text: 'client' },
		);

		expect(markup(container.firstElementChild!)).toBe('<i>client</i>');
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(HYDRATION_FAILED)]);
		expect(warnings().length).toBeLessThanOrEqual(dev ? 1 : 0);
	});
});
