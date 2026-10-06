import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered another @if arm whose static roots match the client
// arm's, but where the client arm calls a component, the server's arm has its
// own element. The call has no server range of its own, so, as in React 19,
// which compares only the DOM, it adopts that element in place when it renders
// exactly it. Otherwise the server HTML does not match the client, and no
// Suspense arm encloses the @if, so the whole root renders on the client and
// reports once: nothing the server rendered stays on screen, and the
// client-rendered arms keep updating in place.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/arm-component-hole.tsrx',
);
const FILE = 'arm-component-hole.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

const SHAPES = [
	{
		shape: 'a hole before the shared root',
		name: 'SharedTail',
		props: { tail: 't' },
		html: '<u>z</u><i>t</i>',
		update: { tail: 'w' },
		updated: '<u>z</u><i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a keyed call before the shared root',
		name: 'Keyed',
		props: { k: 'a', tail: 't' },
		html: '<u>a</u><i>t</i>',
		update: { k: 'b', tail: 'w' },
		updated: '<u>b</u><i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a keyed call after the shared root',
		name: 'KeyedLast',
		props: { k: 'a', tail: 't' },
		html: '<i>t</i><u>a</u>',
		update: { k: 'b', tail: 'w' },
		updated: '<i>w</i><u>b</u>',
		otherArm: '<i>w</i><b class="server">server</b>',
	},
	{
		shape: 'a dynamic call before the shared root',
		name: 'Dynamic',
		props: { tail: 't' },
		html: '<u>z</u><i>t</i>',
		update: { over: true, tail: 'w' },
		updated: '<s>z</s><i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a hole after the shared root',
		name: 'HoleLast',
		props: { tail: 't' },
		html: '<i>t</i><u>z</u>',
		update: { tail: 'w' },
		updated: '<i>w</i><u>z</u>',
		otherArm: '<i>w</i><b class="server"></b>',
	},
	{
		shape: 'two holes after the shared root',
		name: 'TwoHoles',
		props: { tail: 't' },
		html: '<i>t</i><u>y</u><u>z</u>',
		update: { tail: 'w' },
		updated: '<i>w</i><u>y</u><u>z</u>',
		otherArm: '<i>w</i><b class="server">server</b><b class="server">server</b>',
	},
	{
		shape: "a call that is the arm's sole content",
		name: 'SoleHole',
		props: { tail: 't' },
		html: '<u>z</u>',
		update: { tail: 'w' },
		updated: '<u>z</u>',
		otherArm: '<b class="server">server</b><em class="server">w</em>',
	},
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'development compile and production runtime', dev: true, runtime: 'production' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — a component hole in the client arm of another ($name)', ({ dev, runtime }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	// A production runtime reports the error code instead of the message.
	const HYDRATION_FAILED =
		runtime === 'production'
			? /^Minified Octane error #339;/
			: /^Hydration failed because the server rendered HTML didn't match the client/;
	let container: HTMLElement;
	let root: { render(component: unknown, props?: unknown): void; unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		if (runtime === 'production') vi.stubEnv('NODE_ENV', 'production');
	});

	afterEach(() => {
		root?.unmount();
		vi.unstubAllEnvs();
		container.remove();
		errSpy.mockRestore();
	});

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	/** Hydrate `name` with `props` over the server render of `serverProps`. */
	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		props: Record<string, unknown>,
	) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const html = markup(container.firstElementChild!);
		const nodes = [...container.querySelectorAll('*')];
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return {
			host: () => container.firstElementChild!,
			html,
			nodes,
			recoverable,
			render: (next: Record<string, unknown>) => flushSync(() => active.render(client[name], next)),
		};
	}

	/** The root fell back: no server element is connected, and it reported once. */
	function expectRootFellBack(s: { nodes: Element[]; recoverable: string[] }): void {
		expect(s.nodes.length).toBeGreaterThan(0);
		for (const node of s.nodes) expect(node.isConnected).toBe(false);
		expect(s.recoverable).toEqual([expect.stringMatching(HYDRATION_FAILED)]);
		expect(warnings()).toEqual(
			dev && runtime === 'development'
				? [expect.stringMatching(new RegExp(`^Octane hydration mismatch at ${FILE}:\\d+:\\d+: `))]
				: [],
		);
	}

	it.each(SHAPES)(
		'client-renders the root where the server rendered another arm at $shape',
		async ({ name, props, html, update, updated, otherArm }) => {
			const s = await hydrate(name, { ...props, server: true }, props);

			expect(markup(s.host())).toBe(html);
			expectRootFellBack(s);

			// The client-rendered roots and the call's own slot keep updating in place.
			const shared = [...s.host().querySelectorAll('i')];
			s.render({ ...props, ...update });
			expect(markup(s.host())).toBe(updated);
			expect([...s.host().querySelectorAll('i')]).toEqual(shared);

			// The arm the call rendered in unmounts and mounts again cleanly.
			s.render({ ...props, ...update, server: true });
			expect(markup(s.host())).toBe(otherArm);
			s.render({ ...props, ...update });
			expect(markup(s.host())).toBe(updated);
			expect(s.recoverable).toHaveLength(1);
		},
	);

	// As in React, which compares only the DOM, the call without a server range
	// of its own adopts the server's <u> in place: it renders exactly that node.
	it('adopts the other arm’s node at the hole when the call renders exactly it', async () => {
		const s = await hydrate('AdoptLast', { tail: 't', server: true }, { tail: 't' });

		const expectServerNodes = () => {
			const live = [...container.querySelectorAll('*')];
			expect(live).toHaveLength(s.nodes.length);
			live.forEach((node, i) => expect(node).toBe(s.nodes[i]));
		};
		expect(markup(s.host())).toBe('<i>t</i><u>z</u>');
		expectServerNodes();
		expect(s.recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		s.render({ tail: 'w' });
		expect(markup(s.host())).toBe('<i>w</i><u>z</u>');
		expectServerNodes();
	});

	it.each([
		...SHAPES.map(({ name, props }) => ({ name, props })),
		{ name: 'AdoptLast', props: { tail: 't' } },
	])('reports nothing when the server rendered the same arm of $name', async ({ name, props }) => {
		const s = await hydrate(name, props, props);

		expect(markup(s.host())).toBe(s.html);
		expect([...container.querySelectorAll('*')]).toEqual(s.nodes);
		expect(s.recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
