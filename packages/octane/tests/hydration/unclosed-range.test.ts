import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as BehaviorRuntime from 'octane/behavior';
import { load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';
import * as client from './_fixtures/unclosed-range.tsrx';

// The server closes every range it opens, but an HTML minifier or proxy that
// strips comments can remove a closing marker before the page hydrates. No
// extent for the unclosed range is safe to guess: too long discards the static
// content after it, too short leaves server nodes nothing claims. Hydration
// renders the nearest Suspense or Hydrate boundary around the range, or else
// the root, on the client and reports one recoverable error. It never fails
// the root.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/unclosed-range.tsrx',
);
const FILE = 'unclosed-range.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const runtimeModules = { 'octane/behavior': BehaviorRuntime };
const server = loadServerFixture(FIXTURE, { id: FILE, runtimeModules });

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** Remove the closing marker of the range that holds the server's button. */
function stripClose(container: HTMLElement): void {
	const close = container.querySelector('button')!.nextSibling!;
	expect(close.nodeType).toBe(Node.COMMENT_NODE);
	close.remove();
}

const SHAPES = [
	{ shape: 'a component', name: 'PlainParent' },
	{ shape: "a 'use dom bindings' component", name: 'BindingParent' },
	// An application @catch must never receive the recovery.
	{ shape: 'a component in a @try body', name: 'CaughtParent' },
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — a server range without its closing marker ($name)', ({ dev, runtime }) => {
	const compiled = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev, hmr: false },
		runtimeModules,
	});
	// A production runtime reports the error code instead of the message.
	const UNCLOSED =
		runtime === 'production' ? /^Minified Octane error #338;/ : /had no closing marker/;
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

	async function hydrate(
		name: string,
		props: Record<string, unknown>,
	): Promise<{ recoverable: string[]; uncaught: unknown[] }> {
		const recoverable: string[] = [];
		const uncaught: unknown[] = [];
		root = hydrateRoot(container, compiled[name], props as never, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			onUncaughtError: (error: unknown) => uncaught.push(error),
		}) as never;
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { recoverable, uncaught };
	}

	it.each(SHAPES)('adopts the intact server range of $shape', async ({ name }) => {
		const onPress = vi.fn();
		container.innerHTML = ServerRT.renderToString(server[name], { label: 'a' }).html;
		const button = container.querySelector('button')!;

		const { recoverable, uncaught } = await hydrate(name, { label: 'a', onPress });

		expect(uncaught).toEqual([]);
		expect(recoverable).toEqual([]);
		expect(container.querySelector('button')).toBe(button);
		button.click();
		expect(onPress).toHaveBeenCalledOnce();
	});

	it.each(SHAPES)(
		'renders $shape on the client when its range lost the closing marker',
		async ({ name }) => {
			const onPress = vi.fn();
			container.innerHTML = ServerRT.renderToString(server[name], { label: 'a' }).html;
			const expected = markup(container);
			stripClose(container);

			const { recoverable, uncaught } = await hydrate(name, { label: 'a', onPress });

			expect(uncaught).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(UNCLOSED)]);
			expect(markup(container)).toBe(expected);

			// The tree the client rendered is live and updates in place.
			const button = container.querySelector('button')!;
			button.click();
			expect(onPress).toHaveBeenCalledOnce();
			await act(async () => root!.render(compiled[name], { label: 'b', onPress }));
			expect(container.querySelector('button')).toBe(button);
			expect(button.getAttribute('data-state')).toBe('b');
			expect(markup(container)).toBe(expected.replace('data-state="a"', 'data-state="b"'));
		},
	);

	it("renders a 'use dom bindings' entry view on the client when its root range lost the closing marker", async () => {
		const onPress = vi.fn();
		container.innerHTML = ServerRT.renderToString(server.BindingView, { label: 'a' }).html;
		const expected = markup(container);
		const close = container.lastChild!;
		expect(close.nodeType).toBe(Node.COMMENT_NODE);
		close.remove();

		const { recoverable, uncaught } = await hydrate('BindingView', { label: 'a', onPress });

		expect(uncaught).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(UNCLOSED)]);
		expect(markup(container)).toBe(expected);
		container.querySelector('button')!.click();
		expect(onPress).toHaveBeenCalledOnce();
	});

	it('renders a Suspense arm on the client when its hydration finds the range after suspending', async () => {
		const onPress = vi.fn();
		container.innerHTML = ServerRT.renderToString(server.SuspendedParent, { label: 'a' }).html;
		const expected = markup(container);
		const after = container.querySelector('i')!;
		stripClose(container);
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		compiled.gate.promise = promise;

		const { recoverable, uncaught } = await hydrate('SuspendedParent', { label: 'a', onPress });
		// The suspended arm keeps showing the server's content.
		expect(recoverable).toEqual([]);
		expect(markup(container)).toBe(expected);

		// The root has committed; the arm finishes hydrating on its own.
		await act(async () => {
			compiled.gate.promise = undefined;
			resolve();
			await promise;
		});

		expect(uncaught).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(UNCLOSED)]);
		expect(markup(container)).toBe(expected);
		// Content outside the boundary keeps the server's nodes.
		expect(container.querySelector('i')).toBe(after);
		container.querySelector('button')!.click();
		expect(onPress).toHaveBeenCalledOnce();
	});
});

describe('Hydrate — a server range without its closing marker', () => {
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | null = null;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	afterEach(() => {
		root?.unmount();
		root = null;
		container.remove();
	});

	it('renders only the boundary on the client', async () => {
		const onPress = vi.fn();
		const props = { label: 'a', when: load(), onPress };
		container.innerHTML = ServerRT.renderToString(server.Island, props).html;
		// The boundary's wrapper drops its hydration attributes once it hydrates.
		const boundary = container.querySelector('main')!.firstElementChild!;
		const expected = markup(boundary);
		const after = container.querySelector('p')!;
		stripClose(container);

		const recoverable: string[] = [];
		const uncaught: unknown[] = [];
		root = hydrateRoot(container, client.Island, props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			onUncaughtError: (error: unknown) => uncaught.push(error),
		});
		// The boundary's split child loads before it hydrates.
		await vi.waitFor(
			async () => {
				await act(async () => {});
				expect(recoverable).toEqual([expect.stringMatching(/had no closing marker/)]);
			},
			{ timeout: 4000 },
		);

		expect(uncaught).toEqual([]);
		expect(container.querySelector('main')!.firstElementChild).toBe(boundary);
		expect(markup(boundary)).toBe(expected);
		// Content outside the boundary keeps the server's nodes.
		expect(container.querySelector('p')).toBe(after);
		container.querySelector('button')!.click();
		expect(onPress).toHaveBeenCalledOnce();
	});
});
