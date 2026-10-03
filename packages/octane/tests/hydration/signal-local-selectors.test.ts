import { afterEach, describe, expect, it } from 'vitest';
import { act, hydrateRoot } from '../../src/index.js';
import { prerender } from '../../src/runtime.server.js';
import { bootstrapStreamedSignalHydration } from '../../src/hydration/streamed-signals.js';
import * as signals from '../../src/signals/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';
import { activateStreamedMarkup, resetStreamRuntimeGlobals } from '../_server-stream.js';
import { drainProducers } from '../_fixtures/signals-async-controls.js';

// The octane project covers the dev compile; octane-prod covers prod and strong.
const modes =
	process.env.OCTANE_TEST_COMPILE_MODE === 'prod'
		? [
				{ dev: false, strong: false },
				{ dev: false, strong: true },
			]
		: [{ dev: true, strong: false }];

// A strict read suspends the server pass until the selection settles. A
// pending setup snapshot cannot be serialized, so SSR covers the strict read.
const source = `import { query$ } from 'octane/signals';
function Value(props) @{
 const r$ = query$(() => props.sel, props.load);
 <p>{r$.get() as string}</p>
}
export function App(props) @{
 <main>
  @try {
   <Value sel={props.sel} load={props.load} />
  } @pending {
   <i>{'pending'}</i>
  }
 </main>
}`;

afterEach(() => {
	resetStreamRuntimeGlobals();
	delete (globalThis as any).__octaneStreamedSignalSelections;
});

describe.each(modes)('redeclared local query selectors after hydration (%j)', (mode) => {
	// Compile at collection: a cold compile under load must not spend a test's timeout.
	const options = {
		id: '/src/local-selector-hydration.tsrx',
		compileOptions: { ...mode, hmr: false },
		runtimeModules: { 'octane/signals': signals },
	};
	const server = loadCompiledFixtureSource<any>(source, { ...options, mode: 'server' });
	const client = loadCompiledFixtureSource<any>(source, { ...options, mode: 'client' });

	it('adopts the server selection, then reselects changed props', async () => {
		const streamedSignals = {
			buildId: 'local-selector-build',
			documentId: `local-selector-${mode.dev}-${mode.strong}`,
		};
		const { html } = await prerender(
			server.App,
			{ sel: 'a', load: async (selection: string) => `server ${selection}` },
			{ streamedSignals },
		);
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		activateStreamedMarkup(container);
		const text = () => container.querySelector('main p, main i')?.textContent;
		expect(text()).toBe('server a');
		const loads: string[] = [];
		const load = async (selection: string) => {
			loads.push(selection);
			return `browser ${selection}`;
		};
		const errors: unknown[] = [];
		const hydration = bootstrapStreamedSignalHydration(streamedSignals);
		const root = hydrateRoot(
			container,
			client.App,
			{ sel: 'a', load },
			{
				signalOwner: hydration.signalOwner,
				onRecoverableError: (error) => errors.push(error),
				onUncaughtError: (error) => errors.push(error),
			},
		);
		try {
			await drainProducers();
			await act(async () => {});
			const paragraph = container.querySelector('p');
			expect(text()).toBe('server a');
			// An equal selection keeps the adopted server result.
			await act(() => root.render(client.App, { sel: 'a', load }));
			expect(loads).toEqual([]);
			expect(container.querySelector('p')).toBe(paragraph);
			await act(() => root.render(client.App, { sel: 'b', load }));
			await act(async () => {});
			expect(text()).toBe('browser b');
			// The adopted result was released when the selection changed.
			await act(() => root.render(client.App, { sel: 'a', load }));
			await act(async () => {});
			expect(text()).toBe('browser a');
			expect(loads).toEqual(['b', 'a']);
			expect(errors).toEqual([]);
		} finally {
			root.unmount();
			hydration.dispose();
			container.remove();
		}
	});
});

// Two declarations naming one cell present the first declaration in a render,
// on the server as in the browser.
const sharedKeySource = `import { derived$ } from 'octane/signals';
export function App(props) @{
 const first$ = derived$(() => 'first:' + props.a, { key: 'shared' });
 const second$ = derived$(() => 'second:' + props.b, { key: 'shared' });
 <p>{(first$.get() + '|' + second$.get()) as string}</p>
}`;

describe.each(modes)('a shared declaration key across hydration (%j)', (mode) => {
	const options = {
		id: '/src/local-shared-key-hydration.tsrx',
		compileOptions: { ...mode, hmr: false },
		runtimeModules: { 'octane/signals': signals },
	};
	const server = loadCompiledFixtureSource<any>(sharedKeySource, { ...options, mode: 'server' });
	const client = loadCompiledFixtureSource<any>(sharedKeySource, { ...options, mode: 'client' });

	it('renders and hydrates the first declaration of a shared key', async () => {
		const { html } = await prerender(server.App, { a: 1, b: 2 });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const paragraph = container.querySelector('p')!;
		expect(paragraph.textContent).toBe('first:1|first:1');
		const errors: unknown[] = [];
		const root = hydrateRoot(
			container,
			client.App,
			{ a: 1, b: 2 },
			{
				onRecoverableError: (error) => errors.push(error),
				onUncaughtError: (error) => errors.push(error),
			},
		);
		try {
			await act(async () => {});
			expect(container.querySelector('p')).toBe(paragraph);
			expect(paragraph.textContent).toBe('first:1|first:1');
			await act(() => root.render(client.App, { a: 2, b: 3 }));
			expect(paragraph.textContent).toBe('first:2|first:2');
			expect(errors).toEqual([]);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});

// Strong mode rejects a render-phase state update, so it has no replay to render.
describe.each(modes.filter((mode) => !mode.strong))(
	'a render-phase update replay on the server (%j)',
	(mode) => {
		const replay = loadCompiledFixtureSource<any>(
			`import { useState } from 'octane';
import { derived$ } from 'octane/signals';
export function App(props) @{
 const [n, setN] = useState(0);
 if (n === 0) setN(props.n);
 const label$ = derived$(() => 'n' + n);
 <p>{label$.get() as string}</p>
}`,
			{
				id: '/src/local-replay-render.tsrx',
				mode: 'server',
				compileOptions: { ...mode, hmr: false },
				runtimeModules: { 'octane/signals': signals },
			},
		);
		it('renders the replay with its own captured values', async () => {
			const { html } = await prerender(replay.App, { n: 3 });
			const container = document.createElement('div');
			container.innerHTML = html;
			expect(container.querySelector('p')!.textContent).toBe('n3');
		});
	},
);
