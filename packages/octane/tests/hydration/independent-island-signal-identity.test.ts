import { expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
import { flushSync } from '../../src/index.js';
import { prerender } from '../../src/runtime.server.js';
import { bootstrapIndependentHydration } from '../../src/hydration/independent-island.js';
import { bootstrapStreamedSignalHydration } from '../../src/hydration/streamed-signals.js';
import * as signals from '../../src/signals/index.js';
import { evaluateCompiledFixtureCode } from '../_server-fixture.js';
import { activateStreamedMarkup, resetStreamRuntimeGlobals } from '../_server-stream.js';
import { drainProducers } from '../_fixtures/signals-async-controls.js';

const sources = {
	direct: '<Inner />',
	suspense: '@try { <Inner /> } @pending { <i>{"waiting"}</i> }',
};

const islandSource = (children: string) => `import { Hydrate } from 'octane';
import { load } from 'octane/hydration';
import { query$ } from 'octane/signals';
import { fetchValue } from './actions';
export function App() @{
  <main>
    <Hydrate independent when={load()}>
      ${children}
    </Hydrate>
  </main>
}
function Inner() @{
  const value$ = query$(() => 'inner', fetchValue);
  <output>{value$}</output>
}`;

// The island adapter recreates the server Hydrate frame on the client. That
// frame must not add an invocation segment to descendant signal instance keys,
// or instance-keyed server state (here a query$ result) is never adopted and
// the browser producer runs again.
it.each(Object.keys(sources) as (keyof typeof sources)[])(
	'adopts instance-keyed server query results inside an independent island (%s)',
	async (shape) => {
		const source = islandSource(sources[shape]);
		const file = '/project/src/IslandQuery.tsrx';
		const serverFetch = vi.fn(async () => 'server result');
		const browserFetch = vi.fn(async () => 'browser result');
		const runtimeModules = {
			'octane/signals': signals,
		};
		const server = evaluateCompiledFixtureCode(
			compile(source, file, { mode: 'server' }).code,
			file,
			'server',
			{ './actions': { fetchValue: serverFetch }, ...runtimeModules },
		);
		const widget = evaluateCompiledFixtureCode(
			compile(source, file + '?octane-hydrate=0', { mode: 'client' }).code,
			file,
			'client',
			{ './actions': { fetchValue: browserFetch }, ...runtimeModules },
		);
		const host = document.createElement('div');
		document.body.append(host);
		let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
		let cleanup: (() => void) | undefined;
		try {
			const { html } = await prerender(server.App, undefined, {
				streamedSignals: { buildId: 'island-query-build', documentId: 'island-query-document' },
				independentHydration: {
					buildId: 'island-query-build',
					resolve: (moduleId) => ({ moduleId, styles: [] }),
				},
			});
			host.innerHTML = html;
			activateStreamedMarkup(host);
			expect(serverFetch).toHaveBeenCalledTimes(1);
			const output = host.querySelector('output')!;
			expect(output.textContent).toBe('server result');
			hydration = bootstrapStreamedSignalHydration({
				buildId: 'island-query-build',
				documentId: 'island-query-document',
			});
			const errors: unknown[] = [];
			let loaded = false;
			cleanup = bootstrapIndependentHydration(host, {
				buildId: 'island-query-build',
				signalOwner: hydration.signalOwner,
				loadStyles() {},
				async loadModule() {
					loaded = true;
					return widget;
				},
				onError: (error) => errors.push(error),
			});
			await vi.waitFor(() => expect(loaded).toBe(true));
			await drainProducers();
			flushSync(() => {});
			expect(browserFetch).not.toHaveBeenCalled();
			expect(host.querySelector('output')).toBe(output);
			expect(output.textContent).toBe('server result');
			expect(errors).toEqual([]);
		} finally {
			cleanup?.();
			hydration?.dispose();
			host.remove();
			resetStreamRuntimeGlobals();
		}
	},
);
