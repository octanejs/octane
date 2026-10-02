import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When the server rendered another @if arm whose static roots match the
// client arm's, the client adopts that arm's nodes through its fragment
// template, and the server node at a component call's hole is the other arm's
// element rather than the component's range. The call takes the place of
// exactly that node: the template's static roots keep their server nodes,
// before and after the hole, and nothing the server rendered for the other
// arm stays on screen.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/arm-component-hole.tsrx',
);
const FILE = 'arm-component-hole.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** The `file:line:col` of `text`, on the first line after the one containing `after`. */
function siteOf(after: string, text: string): string {
	const start = LINES.findIndex((line) => line.includes(after));
	if (start < 0) throw new Error(`fixture has no line containing ${after}`);
	const index = LINES.findIndex((line, i) => i > start && line.includes(text));
	if (index < 0) throw new Error(`fixture has no ${text} after ${after}`);
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

function structural(site: string, expected: string, actual: string): string {
	return (
		`Octane hydration mismatch at ${site}: the client expected ${expected} but the server ` +
		`rendered ${actual}. The mismatched subtree was rebuilt on the client.`
	);
}

/** Under's root, which the single-root call rebuilds over the server's node. */
const underRoot = () => siteOf('function Under(', '<u>');

const SHAPES = [
	{
		shape: 'a hole before the shared root',
		name: 'SharedTail',
		props: { tail: 't' },
		html: '<u>z</u><i>t</i>',
		codes: [51],
		warnings: () => [structural(underRoot(), '<u>', '<b>')],
		update: { tail: 'w' },
		updated: '<u>z</u><i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a keyed call before the shared root',
		name: 'Keyed',
		props: { k: 'a', tail: 't' },
		html: '<u>a</u><i>t</i>',
		codes: [55],
		warnings: () => [structural(siteOf('function Keyed(', '<Under'), 'a component range', '<b>')],
		update: { k: 'b', tail: 'w' },
		updated: '<u>b</u><i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a keyed call after the shared root',
		name: 'KeyedLast',
		props: { k: 'a', tail: 't' },
		html: '<i>t</i><u>a</u>',
		codes: [55],
		warnings: () => [
			structural(siteOf('function KeyedLast(', '<Under'), 'a component range', '<b>'),
		],
		update: { k: 'b', tail: 'w' },
		updated: '<i>w</i><u>b</u>',
		otherArm: '<i>w</i><b class="server">server</b>',
	},
	{
		shape: 'a dynamic call before the shared root',
		name: 'Dynamic',
		props: { tail: 't' },
		html: '<u>z</u><i>t</i>',
		codes: [55],
		warnings: () => [structural(siteOf('function Dynamic(', '<C '), 'a component range', '<b>')],
		update: { over: true, tail: 'w' },
		updated: '<s>z</s><i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a hole after the shared root',
		name: 'HoleLast',
		props: { tail: 't' },
		html: '<i>t</i><u>z</u>',
		codes: [51],
		warnings: () => [structural(underRoot(), '<u>', '<b>')],
		update: { tail: 'w' },
		updated: '<i>w</i><u>z</u>',
		otherArm: '<i>w</i><b class="server"></b>',
	},
	{
		shape: 'two holes after the shared root',
		name: 'TwoHoles',
		props: { tail: 't' },
		html: '<i>t</i><u>y</u><u>z</u>',
		// One recoverable report per hydration, and a warning per site.
		codes: [51],
		warnings: () => [structural(underRoot(), '<u>', '<b>'), structural(underRoot(), '<u>', '<b>')],
		update: { tail: 'w' },
		updated: '<i>w</i><u>y</u><u>z</u>',
		otherArm: '<i>w</i><b class="server">server</b><b class="server">server</b>',
	},
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'development compile and production runtime', dev: true, runtime: 'production' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — a component hole in an adopted arm of another ($name)', ({ dev, runtime }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	// A production runtime reports the error code instead of the message.
	const report = (code: number) =>
		runtime === 'production'
			? new RegExp(`^Minified Octane error #${code};`)
			: code === 51
				? /the server-rendered node did not match the client render/
				: /the server rendered a different child shape where the client renders a component/;
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
		const host = container.firstElementChild!;
		const html = markup(host);
		const nodes = [...host.querySelectorAll('*')];
		const stale = [...host.querySelectorAll('.server')];
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return {
			host,
			html,
			nodes,
			stale,
			recoverable,
			render: (next: Record<string, unknown>) => flushSync(() => active.render(client[name], next)),
		};
	}

	it.each(SHAPES)(
		'keeps the shared roots and replaces the server node at $shape',
		async ({ name, props, html, codes, warnings: expected, update, updated, otherArm }) => {
			const s = await hydrate(name, { ...props, server: true }, props);
			const shared = s.nodes.filter((node) => node.tagName === 'I');

			expect(markup(s.host)).toBe(html);
			expect([...s.host.querySelectorAll('i')]).toEqual(shared);
			expect(s.stale.length).toBeGreaterThan(0);
			for (const node of s.stale) expect(node.isConnected).toBe(false);
			expect(s.recoverable).toEqual(codes.map((code) => expect.stringMatching(report(code))));
			expect(warnings()).toEqual(dev && runtime === 'development' ? expected() : []);

			// The adopted roots and the call's own slot keep updating in place.
			s.render({ ...props, ...update });
			expect(markup(s.host)).toBe(updated);
			expect([...s.host.querySelectorAll('i')]).toEqual(shared);

			// The arm the call rendered in unmounts and mounts again cleanly.
			s.render({ ...props, ...update, server: true });
			expect(markup(s.host)).toBe(otherArm);
			s.render({ ...props, ...update });
			expect(markup(s.host)).toBe(updated);
			expect(warnings()).toHaveLength(dev && runtime === 'development' ? expected().length : 0);
		},
	);

	it('adopts the server node at a hole after the shared root when it matches the call', async () => {
		const s = await hydrate('AdoptLast', { tail: 't', server: true }, { tail: 't' });

		expect(markup(s.host)).toBe('<i>t</i><u>z</u>');
		expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
		expect(s.recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		s.render({ tail: 'w' });
		expect(markup(s.host)).toBe('<i>w</i><u>z</u>');
		expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
	});

	it("discards the rest of the server's arm after a call that is the arm's sole content", async () => {
		const s = await hydrate('SoleHole', { tail: 't', server: true }, { tail: 't' });

		expect(markup(s.host)).toBe('<u>z</u>');
		expect(s.stale).toHaveLength(2);
		for (const node of s.stale) expect(node.isConnected).toBe(false);
		expect(s.recoverable).toEqual([expect.stringMatching(report(51))]);
		expect(warnings()).toEqual(
			dev && runtime === 'development' ? [structural(underRoot(), '<u>', '<b>')] : [],
		);
	});

	it.each([
		...SHAPES.map(({ name, props }) => ({ name, props })),
		{ name: 'AdoptLast', props: { tail: 't' } },
		{ name: 'SoleHole', props: { tail: 't' } },
	])('reports nothing when the server rendered the same arm of $name', async ({ name, props }) => {
		const s = await hydrate(name, props, props);

		expect(markup(s.host)).toBe(s.html);
		expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
		expect(s.recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
