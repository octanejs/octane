import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource } from './_server-fixture.js';

// A render that updates its own state while it evaluates a slot's arguments
// replays before its slots settle, and every slot waits for that replay. A
// @try (or a lowered JSX ErrorBoundary) must wait too: in a fragment body its
// earlier siblings would otherwise insert after its range, and its body would
// render from state the replay discards: a throw there committed the catch arm,
// and a suspension showed @pending or suspended the whole render.

const FIXTURES = join(process.cwd(), 'packages/octane/tests/_fixtures');
const FILE = 'replayed-try-slots.tsrx';
const SOURCE = readFileSync(join(FIXTURES, FILE), 'utf8');
const SHAPES = [
	'ReplayedComponentThenTry',
	'ReplayedIfThenTry',
	'ReplayedComponentThenPendingTry',
	'ReplayedComponentThenErrorBoundary',
	'ReplayedStaleTry',
	'ReplayedStaleErrorBoundary',
	'ReplayedStalePending',
	'ReplayedStaleSuspension',
] as const;

// The octane project covers the development compile; octane-prod covers
// production. Strong mode rejects a render-phase update.
const compileOptions = { dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod', hmr: false };
const client = loadCompiledFixtureSource(SOURCE, { id: FILE, mode: 'client', compileOptions });
const server = loadCompiledFixtureSource(SOURCE, { id: FILE, mode: 'server', compileOptions });

type Props = { a: boolean };
const view = ({ a }: Props) => (a ? 'a' : '') + 't';

describe.each(SHAPES)('%s', (shape) => {
	let container: HTMLElement;
	let unmount: (() => void) | null;
	let errors: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		unmount = null;
		errors = vi.spyOn(console, 'error');
	});

	afterEach(() => {
		unmount?.();
		container.remove();
		errors.mockRestore();
	});

	const text = () => container.textContent;

	/** The view is unchanged and still made of these exact nodes. */
	function expectSameNodes(nodes: Element[]) {
		expect(text()).toBe(nodes.map((node) => node.textContent).join(''));
		const current = [...container.querySelectorAll('span')];
		expect(current.length).toBe(nodes.length);
		current.forEach((node, index) => expect(node).toBe(nodes[index]));
	}

	it.each([{ a: true }, { a: false }])('mounts in source order from %o', (initial) => {
		const root = createRoot(container);
		unmount = () => root.unmount();
		flushSync(() => root.render(client[shape], initial));
		expect(text()).toBe(view(initial));
		const nodes = [...container.querySelectorAll('span')];
		flushSync(() => root.render(client[shape], { ...initial }));
		expectSameNodes(nodes);
		expect(errors).not.toHaveBeenCalled();
	});

	it.each([{ a: true }, { a: false }])('hydrates in source order from %o', async (initial) => {
		container.innerHTML = renderToString(server[shape], initial).html;
		expect(text()).toBe(view(initial));
		const nodes = [...container.querySelectorAll('span')];
		const recoverable: unknown[] = [];
		const root = hydrateRoot(container, client[shape], initial, {
			onRecoverableError: (error: unknown) => recoverable.push(error),
		});
		unmount = () => root.unmount();
		flushSync(() => {});
		await act(async () => {});
		expect(recoverable).toEqual([]);
		expectSameNodes(nodes);
		flushSync(() => root.render(client[shape], { ...initial }));
		expectSameNodes(nodes);
		expect(errors).not.toHaveBeenCalled();
	});
});
