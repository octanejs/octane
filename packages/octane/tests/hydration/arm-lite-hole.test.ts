import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When the server rendered another @if arm whose static roots match the
// client arm's, the client adopts that arm's nodes through its template, and
// the server node at a component call's hole is the other arm's element
// rather than the component's range. The call takes the place of exactly that
// node, whatever its body renders: more than one root, a fragment, nothing,
// or a single root inside a host element. The development compile renders
// these hookless calls through the lite component slot; the production
// compile through the full one.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/arm-lite-hole.tsrx');
const FILE = 'arm-lite-hole.tsrx';
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

/** The development compile's warning for a call whose server range is missing. */
const missingRange = (component: string, call: string) => () => [
	structural(siteOf(`function ${component}(`, call), 'a component range', '<b>'),
];

const SHAPES = [
	{
		shape: 'a component with two roots',
		name: 'PairArm',
		html: '<u>z</u><u>q</u><i>t</i>',
		code: 55,
		warnings: missingRange('PairArm', '<Pair'),
		updated: '<u>z</u><u>q</u><i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a component that renders a fragment',
		name: 'FragArm',
		html: '<u>z</u><em>q</em><i>t</i>',
		code: 55,
		warnings: missingRange('FragArm', '<Frag'),
		updated: '<u>z</u><em>q</em><i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a component that renders nothing',
		name: 'EmptyArm',
		html: '<i>t</i>',
		code: 55,
		warnings: missingRange('EmptyArm', '<Empty'),
		updated: '<i>w</i>',
		otherArm: '<b class="server">server</b><i>w</i>',
	},
	{
		shape: 'a single-root component in a host element',
		name: 'InHost',
		html: '<p><u>z</u><i>t</i></p>',
		code: 51,
		warnings: () => [structural(siteOf('function Under(', '<u>'), '<u>', '<b>')],
		updated: '<p><u>z</u><i>w</i></p>',
		otherArm: '<p><b class="server">server</b><i>w</i></p>',
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
	const devWarnings = dev && runtime === 'development';
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
		async ({ name, html, code, warnings: expected, updated, otherArm }) => {
			const s = await hydrate(name, { server: true, tail: 't' }, { tail: 't' });
			const shared = s.nodes.filter((node) => node.tagName === 'I' || node.tagName === 'P');

			expect(markup(s.host)).toBe(html);
			expect(shared.every((node) => node.isConnected)).toBe(true);
			expect(s.stale).toHaveLength(1);
			expect(s.stale[0].isConnected).toBe(false);
			expect(s.recoverable).toEqual([expect.stringMatching(report(code))]);
			expect(warnings()).toEqual(devWarnings ? expected() : []);

			// The adopted roots keep updating in place.
			s.render({ tail: 'w' });
			expect(markup(s.host)).toBe(updated);
			expect(shared.every((node) => node.isConnected)).toBe(true);

			// The arm the call rendered in unmounts and mounts again cleanly.
			s.render({ server: true, tail: 'w' });
			expect(markup(s.host)).toBe(otherArm);
			s.render({ tail: 'w' });
			expect(markup(s.host)).toBe(updated);
			expect(warnings()).toHaveLength(devWarnings ? expected().length : 0);
		},
	);

	it('adopts the server node at a hole in a host element when it matches the call', async () => {
		const s = await hydrate('InHostAdopt', { server: true, tail: 't' }, { tail: 't' });

		expect(markup(s.host)).toBe('<p><u>z</u><i>t</i></p>');
		expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
		expect(s.recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		s.render({ tail: 'w' });
		expect(markup(s.host)).toBe('<p><u>z</u><i>w</i></p>');
		expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
	});

	it.each([...SHAPES.map(({ name }) => name), 'InHostAdopt'])(
		'reports nothing when the server rendered the same arm of %s',
		async (name) => {
			const s = await hydrate(name, { tail: 't' }, { tail: 't' });

			expect(markup(s.host)).toBe(s.html);
			expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
			expect(s.recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			s.render({ tail: 'w' });
			expect(markup(s.host)).toBe(s.html.replace('<i>t</i>', '<i>w</i>'));
			expect([...s.host.querySelectorAll('*')]).toEqual(s.nodes);
		},
	);
});
