import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXTERNAL_HYDRATION_PROMISE, act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A preserved <Hydrate> activation suspends on a child inside a component
// whose fragment hydration adopts or rebuilds, then resumes when the data
// arrives. The resumed child completes where it mounted: in the server's DOM
// when the server rendered the same component, otherwise in the fragment the
// client rebuilt. Either way the siblings after that component keep their
// server nodes, and a mismatch is reported once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-fragment-suspended-child.tsrx',
);
const FILE = 'rebuilt-fragment-suspended-child.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');

const AFTER_HOLES =
	'a fragment with <i> after its leading holes but the server rendered the end of the parent block';

const SHAPES = [
	{
		shape: 'a fragment that starts with the suspending child',
		name: 'HoleFirstBranch',
		html: '<u>z</u><i>x</i><em>e</em>',
		expected: AFTER_HOLES,
	},
	{
		shape: 'a fragment that starts with static markup',
		name: 'StaticFirstBranch',
		html: '<i>x</i><u>z</u><em>e</em>',
		expected: 'a fragment starting with <i> but the server rendered <b>',
	},
	{
		shape: 'a fragment whose suspending child renders a range',
		name: 'FramedFirstBranch',
		html: '<u>z</u><s>s</s><i>x</i><em>e</em>',
		expected: AFTER_HOLES,
	},
	{
		shape: 'a fragment whose static root after the child is text',
		name: 'HoleThenTextBranch',
		html: '<u>z</u>x<em>e</em>',
		expected: 'a fragment starting with a comment but the server rendered <b>',
	},
];

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/** A client-owned resource: hydration reads it rather than a server seed. */
function external<T extends object>(promise: T) {
	return Object.assign(promise, { [EXTERNAL_HYDRATION_PROMISE]: true as const });
}

function fulfilled(value: string) {
	return external(Object.assign(Promise.resolve(value), { status: 'fulfilled', value }));
}

function pending() {
	let resolve!: (value: string) => void;
	const promise = external(new Promise<string>((res) => (resolve = res)));
	return { promise, resolve };
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a suspended child of a hydrated fragment ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	const MISMATCH = /the server-rendered node did not match the client render/;
	let container: HTMLElement;
	let root: { render(component: unknown, props?: unknown): void; unmount(): void } | null;
	let recoverable: string[];
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		recoverable = [];
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

	const section = () => container.querySelector('section')!;

	function render(name: string, props: Record<string, unknown>): void {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
	}

	async function hydrate(name: string, props: Record<string, unknown>): Promise<void> {
		root = hydrateRoot(container, client[name] as never, props as never, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		}) as never;
		flushSync(() => {});
		await act(async () => {});
	}

	function rebuilt(expected: string) {
		return expect.stringMatching(
			new RegExp(
				`^Octane hydration mismatch at ${escape(FILE)}\\b.*the client expected ${escape(expected)}`,
			),
		);
	}

	it.each(SHAPES)(
		'completes $shape in the fragment it rebuilt over another component',
		async ({ name, html, expected }) => {
			render(name, { server: true, leaf: fulfilled('unused') });
			const bold = container.querySelector('b')!;
			const em = container.querySelector('em')!;
			const leaf = pending();

			await hydrate(name, { leaf: leaf.promise });
			// The sibling after the rebuilt fragment stays while the child is pending.
			expect(section().querySelector('em')).toBe(em);

			await act(async () => leaf.resolve('z'));

			expect(markup(section())).toBe(html);
			expect(section().querySelector('em')).toBe(em);
			expect(bold.isConnected).toBe(false);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [rebuilt(expected)] : []);

			// The resumed child still updates in place.
			await act(async () => root!.render(client[name], { leaf: fulfilled('w') }));
			expect(markup(section())).toBe(html.replace('<u>z</u>', '<u>w</u>'));
			expect(section().querySelector('em')).toBe(em);
		},
	);

	it.each(SHAPES)(
		'rebuilds $shape over another component when its data is ready',
		async ({ name, html, expected }) => {
			render(name, { server: true, leaf: fulfilled('unused') });
			const em = container.querySelector('em')!;

			await hydrate(name, { leaf: fulfilled('z') });

			expect(markup(section())).toBe(html);
			expect(section().querySelector('em')).toBe(em);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [rebuilt(expected)] : []);
		},
	);

	it.each(SHAPES)(
		'keeps every server node of $shape when the server rendered it',
		async ({ name, html }) => {
			render(name, { leaf: fulfilled('z') });
			const adopted = [...section().querySelectorAll('*')];
			const leaf = pending();

			await hydrate(name, { leaf: leaf.promise });
			await act(async () => leaf.resolve('z'));

			expect(markup(section())).toBe(html);
			expect([...section().querySelectorAll('*')]).toEqual(adopted);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);
});
