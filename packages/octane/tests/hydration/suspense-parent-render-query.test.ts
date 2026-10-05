import { describe, expect, it, vi } from 'vitest';
// Cold scenarios load a fresh runtime graph after resetModules(). Load every
// helper once during collection so the first in-test import stays cheap.
import '../_server-fixture.js';
import '../_server-stream.js';
import '../_fixtures/signals-async-controls.js';
import '../../src/hydration/streamed-signals.js';

// A hydrating Suspense boundary whose first client attempt is waiting for the
// browser's own load keeps that load when its parent renders again.

const FIELD = {
	id: '/src/field.tsx',
	source: `import { query$ } from 'octane/signals';
export function Field(props) {
	const value$ = query$(() => props.id, props.load);
	return <output>{String(value$.get())}</output>;
}`,
};

const APPS = {
	tsx: {
		id: '/src/app.tsx',
		source: `import { Suspense, useState } from 'octane';
import { Field } from './field';
function Mid(props) {
	return <div><Field id={props.id} load={props.load}/></div>;
}
export function App(props) {
	const [tick, setTick] = useState(0);
	props.bind?.(setTick);
	return <main data-tick={tick}><Suspense fallback={<i>waiting</i>}><Mid id={props.id} load={props.load}/></Suspense></main>;
}`,
	},
	tsrx: {
		id: '/src/app.tsrx',
		source: `import { Suspense, useState } from 'octane';
import { Field } from './field';
function Mid(props) @{
	<div><Field id={props.id} load={props.load}/></div>
}
export function App(props) @{
	const [tick, setTick] = useState(0);
	props.bind?.(setTick);
	<main data-tick={tick}><Suspense fallback={<i>waiting</i>}><Mid id={props.id} load={props.load}/></Suspense></main>
}`,
	},
};

describe('a hydrating JSX Suspense across parent renders', () => {
	it.each((['tsx', 'tsrx'] as const).flatMap((app) => [false, true].map((dev) => ({ app, dev }))))(
		'keeps the pending client load ($app app, dev: $dev)',
		async ({ app, dev }) => {
			vi.resetModules();
			const server = await import('../../src/runtime.server.js');
			const client = await import('../../src/runtime.js');
			const signals = await import('../../src/signals/index.js');
			const { bootstrapStreamedSignalHydration } =
				await import('../../src/hydration/streamed-signals.js');
			const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
			const { activateStreamedMarkup, resetStreamRuntimeGlobals } =
				await import('../_server-stream.js');
			const { drainProducers } = await import('../_fixtures/signals-async-controls.js');
			const signalModules = {
				'octane/signals': signals,
				'octane/signals/query': signals,
				'octane/signals/facade': signals,
			};
			const load = (mode: 'client' | 'server') => {
				const compileOptions = { dev, hmr: false };
				const field = loadCompiledFixtureSource(FIELD.source, {
					id: FIELD.id,
					mode,
					compileOptions,
					runtimeModules: signalModules,
				});
				return loadCompiledFixtureSource(APPS[app].source, {
					id: APPS[app].id,
					mode,
					compileOptions,
					runtimeModules: { ...signalModules, './field': field },
				});
			};
			const serverModule = load('server');
			const clientModule = load('client');
			const pending = new Map<string, (value: string) => void>();
			const browserLoad = vi.fn(
				(id: string) => new Promise<string>((resolve) => pending.set(id, resolve)),
			);
			const streamedSignals = { buildId: 'parent-render', documentId: 'parent-render' };
			const container = document.createElement('div');
			document.body.append(container);
			const errors: unknown[] = [];
			let setTick: ((update: (tick: number) => number) => void) | undefined;
			let root: ReturnType<typeof client.hydrateRoot> | undefined;
			let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
			const drain = async () => {
				await drainProducers();
				client.flushSync(() => {});
			};
			try {
				const output = await server.prerender(
					serverModule.App,
					{ id: 'a', load: async (id: string) => `server ${id}` },
					{ streamedSignals },
				);
				container.innerHTML = output.html;
				activateStreamedMarkup(container);
				hydration = bootstrapStreamedSignalHydration(streamedSignals);
				// The browser selects 'b', which the server never resolved, so the
				// boundary's first attempt waits for the browser's own load.
				root = client.hydrateRoot(
					container,
					clientModule.App,
					{ id: 'b', load: browserLoad, bind: (update: typeof setTick) => (setTick = update) },
					{
						signalOwner: hydration.signalOwner,
						onRecoverableError: (error) => errors.push(error),
						onUncaughtError: (error) => errors.push(error),
					},
				);
				await drain();
				expect(browserLoad.mock.calls.map(([id]) => id)).toEqual(['b']);
				for (let i = 0; i < 3; i++) {
					client.flushSync(() => setTick!((tick) => tick + 1));
					await drain();
				}
				expect(browserLoad.mock.calls.map(([id]) => id)).toEqual(['b']);
				pending.get('b')!('browser b');
				await drain();
				expect(container.querySelector('output')!.textContent).toBe('browser b');
				expect(browserLoad).toHaveBeenCalledTimes(1);
				expect(errors.filter((error) => !String(error).includes('Hydration mismatch'))).toEqual([]);
			} finally {
				root?.unmount();
				hydration?.dispose();
				container.remove();
				resetStreamRuntimeGlobals();
			}
		},
	);
});
