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
	it('adopts the server selection, then reselects changed props', async () => {
		const options = {
			id: '/src/local-selector-hydration.tsrx',
			compileOptions: { ...mode, hmr: false },
			runtimeModules: { 'octane/signals': signals },
		};
		const server = loadCompiledFixtureSource<any>(source, {
			...options,
			mode: 'server',
		});
		const client = loadCompiledFixtureSource<any>(source, {
			...options,
			mode: 'client',
		});
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
