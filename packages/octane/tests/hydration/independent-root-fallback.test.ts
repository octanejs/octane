import { describe, expect, it, vi } from 'vitest';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';
import {
	bootstrapIndependentHydration,
	type IndependentHydrateActivationContext,
} from '../../src/hydration/independent-island.js';
import { HYDRATE_INDEPENDENT_ATTR } from '../../src/hydration-markers.js';
import { flushSync, hasPendingWork, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from '../../src/runtime.server.js';
import { evaluateCompiledFixtureCode, loadCompiledFixtureSource } from '../_server-fixture.js';

// Node identity: toEqual compares DOM nodes structurally.
function expectSameNodes(actual: readonly (Node | null)[], expected: readonly Node[]): void {
	expect(actual).toHaveLength(expected.length);
	actual.forEach((node, index) => expect(node).toBe(expected[index]));
}

const settle = () => expect.poll(() => hasPendingWork()).toBe(false);

const WIDGETS = `import { useEffect, useId, useState } from 'octane';
import { mounted, unmounted } from './actions';
export function Widget() @{
  const id = useId();
  const [count, setCount] = useState(0);
  useEffect(() => { mounted(); return () => unmounted(); }, []);
  <section><input id={id} defaultValue="server" /><button type="button" onClick={() => setCount(count + 1)}>{String(count) as string}</button></section>
}`;

/**
 * Server-render `source`'s App, whose independent islands each hold a Widget,
 * into a connected container, and register the islands with the document
 * bootstrap. `read(value)` suspends on the client while `gate.thrown` is set.
 */
function serveIslands(source: string, dev: boolean, tag: string, islands: number) {
	const mounted = vi.fn();
	const unmounted = vi.fn();
	const gate: { thrown?: Promise<void> } = {};
	const serverActions = { mounted() {}, unmounted() {}, read: (value: string) => value };
	const clientActions = {
		mounted,
		unmounted,
		read(value: string) {
			if (gate.thrown !== undefined) throw gate.thrown;
			return value;
		},
	};
	const moduleId = `/project/src/fallback-widgets-${tag}.tsrx`;
	const modules = (mode: 'server' | 'client', actions: Record<string, unknown>) => ({
		'./actions': actions,
		'./widgets': loadCompiledFixtureSource(WIDGETS, {
			id: moduleId,
			mode,
			compileOptions: { dev },
			runtimeModules: { './actions': actions },
		}),
	});
	const file = '/project/src/IndependentFallback.tsrx';
	const compiler = createOctaneCompiler({ root: '/project', hmr: false, dev });
	const compileModule = (id: string, mode: 'server' | 'client') =>
		evaluateCompiledFixtureCode(
			compiler.transform(source, id, { environment: mode })!.code,
			file,
			mode,
			modules(mode, mode === 'server' ? serverActions : clientActions),
		);
	const server = compileModule(file, 'server');
	const client = compileModule(file, 'client');
	const children = Array.from({ length: islands }, (_, index) =>
		compileModule(`${file}?octane-hydrate=${index}`, 'client'),
	);
	const container = document.createElement('div');
	container.innerHTML = renderToString(
		server.App,
		{ title: 'Server', footer: 'Server' },
		{
			independentHydration: {
				buildId: 'fallback-test',
				resolve: () => ({ moduleId: 'widget', styles: [] }),
			},
		},
	).html;
	document.body.append(container);
	const wrappers = [...container.querySelectorAll(`[${HYDRATE_INDEPENDENT_ATTR}]`)];
	expect(wrappers).toHaveLength(islands);
	const buttons = wrappers.map((wrapper) => wrapper.querySelector('button')!);
	const errors: unknown[] = [];
	let activations = 0;
	const cleanup = bootstrapIndependentHydration(container, {
		buildId: 'fallback-test',
		loadStyles() {},
		loadModule: async () => ({
			default(context: IndependentHydrateActivationContext) {
				const active = children[wrappers.indexOf(context.element)].default(context);
				activations++;
				return active;
			},
		}),
		onError: (error) => errors.push(error),
	});
	return {
		client,
		container,
		wrappers,
		inputs: wrappers.map((wrapper) => wrapper.querySelector('input')!),
		buttons,
		errors,
		mounted,
		unmounted,
		gate,
		/** Activate island `index` with a click, which its replay counts. */
		async activate(index: number) {
			const before = activations;
			buttons[index].click();
			await expect.poll(() => activations).toBe(before + 1);
			await settle();
			expect(buttons[index].textContent).toBe('1');
		},
		dispose() {
			cleanup();
			container.remove();
		},
	};
}

interface Scenario {
	/** The islands sit inside the root's element, or are root children themselves. */
	placement: 'nested' | 'root';
	/** The root's mismatch renders before the islands, or in a component after them. */
	mismatch: 'before' | 'after';
	/**
	 * A leaf after the islands suspends while the gate is pending: the client
	 * render that replaces the failed hydration ('before'), or the hydrating
	 * attempt itself, whose retry then reaches the mismatch ('after').
	 */
	suspended: boolean;
}

const scenarios: Scenario[] = [
	{ placement: 'nested', mismatch: 'before', suspended: false },
	{ placement: 'nested', mismatch: 'after', suspended: false },
	{ placement: 'root', mismatch: 'after', suspended: false },
	{ placement: 'nested', mismatch: 'before', suspended: true },
	{ placement: 'root', mismatch: 'before', suspended: true },
	{ placement: 'nested', mismatch: 'after', suspended: true },
];

// An independent island hydrates and lives on its own root (see
// docs/deferred-hydration.md, `independent`): its lexical parent owns only the
// wrapper's outer lifetime. A root that falls back for a mismatch elsewhere
// renders its own tree on the client, but each island in it is still the one
// the document bootstrap registered, so it keeps its wrapper, DOM and state,
// whether it activated before the fallback or activates after it. Until the
// client render commits, the islands stay where the server DOM has them.
describe('independent islands across a root hydration fallback', () => {
	it.each(
		[false, true].flatMap((dev) =>
			[true, false].flatMap((activated) =>
				scenarios.map((scenario) => ({ dev, activated, ...scenario })),
			),
		),
	)('keeps each island live (%j)', async ({ dev, activated, placement, mismatch, suspended }) => {
		const content = `<h1 id={id}>{props.title as string}</h1>
    <Hydrate independent when={interaction()}>
      <Widget />
    </Hydrate>
    <Hydrate independent when={interaction()}>
      <Widget />
    </Hydrate>
    <Footer text={props.footer} />`;
		const page = serveIslands(
			`import { Hydrate, useId } from 'octane';
import { interaction } from 'octane/hydration';
import { read } from './actions';
import { Widget } from './widgets';
function Footer(props) @{
  <p>{read(props.text) as string}</p>
}
export function App(props) @{
  const id = useId();
  ${placement === 'nested' ? `<main>${content}</main>` : `<>${content}</>`}
}`,
			dev,
			`${dev}-${activated}-${placement}-${mismatch}-${suspended}`,
			2,
		);
		const { container, wrappers, inputs, buttons, gate } = page;
		const serverH1 = container.querySelector('h1')!;
		const serverPositions = wrappers.map((wrapper) => [wrapper.parentNode, wrapper.nextSibling]);
		const reports: unknown[] = [];
		let root: Root | undefined;
		let resolve!: () => void;
		if (suspended) gate.thrown = new Promise<void>((done) => (resolve = done));
		try {
			if (activated) {
				await page.activate(0);
				inputs[0].value = 'live draft';
				inputs[0].dispatchEvent(new InputEvent('input', { bubbles: true }));
			}
			root = hydrateRoot(
				container,
				page.client.App,
				mismatch === 'after'
					? { title: 'Server', footer: 'Client' }
					: { title: 'Client', footer: 'Server' },
				{ onRecoverableError: (error) => reports.push(error) },
			);
			await settle();
			if (suspended) {
				// Nothing has committed: the server DOM, islands included, is as it was.
				expect(serverH1.isConnected).toBe(true);
				expect(serverH1.textContent).toBe('Server');
				expect(wrappers.map((wrapper) => [wrapper.parentNode, wrapper.nextSibling])).toEqual(
					serverPositions,
				);
				expect(reports).toEqual([]);
				gate.thrown = undefined;
				resolve();
				await settle();
			}
			await Promise.resolve();
			// The root fell back: the client rendered its text.
			expect(serverH1.isConnected).toBe(false);
			expect(container.querySelector('h1')!.textContent).toBe(
				mismatch === 'after' ? 'Server' : 'Client',
			);
			expect(container.querySelector('p')!.textContent).toBe(
				mismatch === 'after' ? 'Client' : 'Server',
			);
			expect(reports).toHaveLength(1);
			// The islands are the server's, in the client tree.
			expectSameNodes([...container.querySelectorAll(`[${HYDRATE_INDEPENDENT_ATTR}]`)], wrappers);
			if (placement === 'nested')
				expect(container.querySelector('main')!.contains(wrappers[0])).toBe(true);
			expectSameNodes(
				wrappers.map((wrapper) => wrapper.querySelector('input')),
				inputs,
			);
			expectSameNodes(
				wrappers.map((wrapper) => wrapper.querySelector('button')),
				buttons,
			);
			expect(container.querySelectorAll('section')).toHaveLength(2);
			if (activated) {
				expect(inputs[0].value).toBe('live draft');
				expect(buttons[0].textContent).toBe('1');
				flushSync(() => buttons[0].click());
				expect(buttons[0].textContent).toBe('2');
				expect(page.mounted).toHaveBeenCalledTimes(1);
			} else {
				expect(page.mounted).not.toHaveBeenCalled();
				await page.activate(0);
				expect(page.mounted).toHaveBeenCalledTimes(1);
			}
			// The island that never activated stays dormant and can still activate.
			expect(buttons[1].textContent).toBe('0');
			await page.activate(1);
			expect(page.mounted).toHaveBeenCalledTimes(2);
			expect(page.unmounted).not.toHaveBeenCalled();
			expect(page.errors).toEqual([]);
			root.unmount();
			expect(wrappers.some((wrapper) => wrapper.isConnected)).toBe(false);
		} finally {
			root?.unmount();
			page.dispose();
		}
	});

	// The island renders inside a Suspense boundary whose client render
	// suspends. The root commits the boundary's pending arm, and the boundary
	// holds its hidden content, the island among it, until it reveals.
	it.each([false, true].flatMap((dev) => [true, false].map((activated) => ({ dev, activated }))))(
		'keeps an island in a suspended Suspense boundary for its reveal (%j)',
		async ({ dev, activated }) => {
			const page = serveIslands(
				`import { Hydrate, Suspense, useId } from 'octane';
import { interaction } from 'octane/hydration';
import { read } from './actions';
import { Widget } from './widgets';
function Footer(props) @{
  <p>{read(props.text) as string}</p>
}
export function App(props) @{
  const id = useId();
  <>
    <h1 id={id}>{props.title as string}</h1>
    <Suspense fallback="pending">
      <Hydrate independent when={interaction()}>
        <Widget />
      </Hydrate>
      <Footer text={props.footer} />
    </Suspense>
  </>
}`,
				dev,
				`suspense-${dev}-${activated}`,
				1,
			);
			const { container, wrappers, inputs, buttons, gate } = page;
			const serverH1 = container.querySelector('h1')!;
			const reports: unknown[] = [];
			let root: Root | undefined;
			let resolve!: () => void;
			gate.thrown = new Promise<void>((done) => (resolve = done));
			try {
				if (activated) await page.activate(0);
				root = hydrateRoot(
					container,
					page.client.App,
					{ title: 'Client', footer: 'Server' },
					{ onRecoverableError: (error) => reports.push(error) },
				);
				await settle();
				await Promise.resolve();
				expect(reports).toHaveLength(1);
				expect(serverH1.isConnected).toBe(false);
				expect(container.querySelector('h1')!.textContent).toBe('Client');
				expect(container.textContent).toContain('pending');
				expect(wrappers[0].isConnected).toBe(true);
				expect((wrappers[0] as HTMLElement).style.display).toBe('none');

				gate.thrown = undefined;
				resolve();
				// The reveal waits out the boundary's fallback window.
				await expect.poll(() => container.textContent).not.toContain('pending');
				await settle();
				expect(container.querySelector('p')!.textContent).toBe('Server');
				expectSameNodes([...container.querySelectorAll(`[${HYDRATE_INDEPENDENT_ATTR}]`)], wrappers);
				expect((wrappers[0] as HTMLElement).style.display).toBe('');
				expect(wrappers[0].querySelector('input')).toBe(inputs[0]);
				expect(wrappers[0].querySelector('button')).toBe(buttons[0]);
				if (activated) {
					flushSync(() => buttons[0].click());
					expect(buttons[0].textContent).toBe('2');
				} else {
					expect(page.mounted).not.toHaveBeenCalled();
					await page.activate(0);
				}
				expect(page.mounted).toHaveBeenCalledTimes(1);
				expect(page.unmounted).not.toHaveBeenCalled();
				expect(page.errors).toEqual([]);
			} finally {
				root?.unmount();
				page.dispose();
			}
		},
	);
});
