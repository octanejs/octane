import { describe, expect, it, vi } from 'vitest';
// Cold scenarios load a fresh runtime graph after resetModules(). Load every
// helper once during collection so the first in-test import stays cheap.
import '../_server-fixture.js';
import '../_server-stream.js';
import '../_fixtures/signals-async-controls.js';
import '../../src/hydration/streamed-signals.js';

// A resumed query that keeps restarting re-renders without end and starves
// timers, so a test timeout would never fire. Fail the render instead.
const RENDER_BOUND = 10;

const FIELDS = {
	tsx: {
		id: '/src/field.tsx',
		source: `import { query$ } from 'octane/signals';
export function Field(props) {
	props.rendered();
	const value$ = query$(() => props.id, props.load);
	return <output>{String(value$.get())}</output>;
}`,
	},
	tsrx: {
		id: '/src/field.tsrx',
		source: `import { query$ } from 'octane/signals';
export function Field(props) @{
	props.rendered();
	const value$ = query$(() => props.id, props.load);
	<output>{value$}</output>
}`,
	},
};

const APPS = {
	tsx: {
		id: '/src/app.tsx',
		source: `import { Suspense, useState } from 'octane';
import { Field } from './field';
function Mid(props) {
	const [n] = useState(1);
	return <div data-n={n}><Field id={props.id} load={props.load} rendered={props.rendered}/></div>;
}
export function App(props) {
	const [id, setId] = useState(props.id);
	props.bind?.(setId);
	return <main><Suspense fallback={<i>waiting</i>}><Mid id={id} load={props.load} rendered={props.rendered}/></Suspense></main>;
}`,
	},
	tsrx: {
		id: '/src/app.tsrx',
		source: `import { Suspense, useState } from 'octane';
import { Field } from './field';
function Mid(props) @{
	const [n] = useState(1);
	<div data-n={n}><Field id={props.id} load={props.load} rendered={props.rendered}/></div>
}
export function App(props) @{
	<main><Suspense fallback={<i>waiting</i>}><Mid id={props.id} load={props.load} rendered={props.rendered}/></Suspense></main>
}`,
	},
	// No boundary above Field: its suspended hydration read waits at the root.
	unbounded: {
		id: '/src/app.tsrx',
		source: `import { Field } from './field';
export function App(props) @{
	<main><Field id={props.id} load={props.load} rendered={props.rendered}/></main>
}`,
	},
};

interface Scenario {
	container: HTMLElement;
	result: HTMLOutputElement;
	errors: unknown[];
	setId: (id: string) => void;
	drain: () => Promise<void>;
}

async function hydrateScenario(options: {
	app: keyof typeof APPS;
	field: keyof typeof FIELDS;
	dev: boolean;
	serverId: string;
	clientId: string;
	browserLoad: (id: string) => Promise<string>;
	run: (scenario: Scenario) => Promise<void>;
}): Promise<void> {
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
		const compileOptions = { dev: options.dev, hmr: false };
		const field = loadCompiledFixtureSource(FIELDS[options.field].source, {
			id: FIELDS[options.field].id,
			mode,
			compileOptions,
			runtimeModules: signalModules,
		});
		return loadCompiledFixtureSource(APPS[options.app].source, {
			id: APPS[options.app].id,
			mode,
			compileOptions,
			runtimeModules: { ...signalModules, './field': field },
		});
	};
	const serverModule = load('server');
	const clientModule = load('client');
	const serverLoad = vi.fn(async (id: string) => `server ${id}`);
	let renders = 0;
	const rendered = () => {
		if (++renders > RENDER_BOUND) throw new Error(`Field rendered more than ${RENDER_BOUND} times`);
	};
	let setId: ((id: string) => void) | undefined;
	const streamedSignals = { buildId: 'query-get', documentId: 'query-get' };
	const container = document.createElement('div');
	document.body.append(container);
	let root: ReturnType<typeof client.hydrateRoot> | undefined;
	let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
	try {
		const output = await server.prerender(
			serverModule.App,
			{ id: options.serverId, load: serverLoad, rendered: () => {} },
			{ streamedSignals },
		);
		expect(serverLoad.mock.calls.map(([id]) => id)).toEqual([options.serverId]);
		container.innerHTML = output.html;
		activateStreamedMarkup(container);
		const result = container.querySelector('output')!;
		expect(result.textContent).toBe(`server ${options.serverId}`);
		const errors: unknown[] = [];
		hydration = bootstrapStreamedSignalHydration(streamedSignals);
		root = client.hydrateRoot(
			container,
			clientModule.App,
			{
				id: options.clientId,
				load: options.browserLoad,
				rendered,
				bind: (update: (id: string) => void) => (setId = update),
			},
			{
				signalOwner: hydration.signalOwner,
				onRecoverableError: (error) => errors.push(error),
				onUncaughtError: (error) => errors.push(error),
			},
		);
		await options.run({
			container,
			result,
			errors,
			setId: (id) => client.flushSync(() => setId!(id)),
			drain: async () => {
				await drainProducers();
				client.flushSync(() => {});
			},
		});
		expect(renders).toBeLessThanOrEqual(RENDER_BOUND);
	} finally {
		root?.unmount();
		hydration?.dispose();
		container.remove();
		resetStreamRuntimeGlobals();
	}
}

function uncaught(errors: unknown[]): unknown[] {
	return errors.filter((error) => !String(error).includes('Hydration mismatch'));
}

describe('query reads in returned JSX through hydration', () => {
	it.each([false, true])(
		'resumes the server value a .tsx component reads in its returned JSX (dev: %s)',
		async (dev) => {
			// The returned <output> belongs to Field on both sides, so its read
			// resolves the query Field declared and adopts the server's result.
			const browserLoad = vi.fn(async (id: string) => `browser ${id}`);
			await hydrateScenario({
				app: 'tsrx',
				field: 'tsx',
				dev,
				serverId: 'a',
				clientId: 'a',
				browserLoad,
				run: async ({ container, result, errors, drain }) => {
					await drain();
					expect(errors).toEqual([]);
					expect(browserLoad).not.toHaveBeenCalled();
					expect(container.querySelector('output')).toBe(result);
					expect(result.textContent).toBe('server a');
				},
			});
		},
	);

	it.each(
		(['tsx', 'tsrx'] as const).flatMap((field) => [false, true].map((dev) => ({ field, dev }))),
	)(
		'loads a query without a server seed once below a JSX Suspense ($field, dev: $dev)',
		async ({ field, dev }) => {
			// The browser selects 'b', which the server never resolved. The boundary
			// retries its suspended first attempt with the same children, so the
			// attempt keeps its query instead of starting another load.
			const browserLoad = vi.fn(async (id: string) => `browser ${id}`);
			await hydrateScenario({
				app: 'tsx',
				field,
				dev,
				serverId: 'a',
				clientId: 'b',
				browserLoad,
				run: async ({ container, errors, drain }) => {
					await drain();
					expect(uncaught(errors)).toEqual([]);
					expect(browserLoad.mock.calls.map(([id]) => id)).toEqual(['b']);
					expect(container.querySelector('output')!.textContent).toBe('browser b');
				},
			});
		},
	);

	it.each(
		(['tsx', 'tsrx', 'unbounded'] as const).flatMap((app) =>
			(['tsx', 'tsrx'] as const).flatMap((field) =>
				[false, true].map((dev) => ({ app, field, dev })),
			),
		),
	)(
		"loads the browser's own selection over a seed for another request ($app app, $field field, dev: $dev)",
		async ({ app, field, dev }) => {
			// The server seeded Field's query for 'a', under the same owner the
			// browser adopts. The browser selects 'b', so that history cannot
			// present it: the query loads 'b' as if unseeded, and adoption keeps
			// the server's output node while reporting the changed text.
			const browserLoad = vi.fn(async (id: string) => `browser ${id}`);
			await hydrateScenario({
				app,
				field,
				dev,
				serverId: 'a',
				clientId: 'b',
				browserLoad,
				run: async ({ container, result, errors, drain }) => {
					await drain();
					expect(errors).not.toEqual([]);
					expect(uncaught(errors)).toEqual([]);
					expect(browserLoad.mock.calls.map(([id]) => id)).toEqual(['b']);
					expect(container.querySelector('output')).toBe(result);
					expect(result.textContent).toBe('browser b');
				},
			});
		},
	);

	it.each([false, true])(
		'restarts a suspended first attempt for new children, then retries it without reloading (dev: %s)',
		async (dev) => {
			// New children supersede the suspended attempt: it loads the new
			// selection and never shows the abandoned one. The restarted attempt
			// then retries with unchanged children and keeps its query.
			const pending = new Map<string, (value: string) => void>();
			const browserLoad = vi.fn(
				(id: string) => new Promise<string>((resolve) => pending.set(id, resolve)),
			);
			await hydrateScenario({
				app: 'tsx',
				field: 'tsx',
				dev,
				serverId: 'a',
				clientId: 'b',
				browserLoad,
				run: async ({ container, errors, setId, drain }) => {
					await drain();
					expect(browserLoad.mock.calls.map(([id]) => id)).toEqual(['b']);
					setId('c');
					await drain();
					expect(browserLoad.mock.calls.map(([id]) => id)).toEqual(['b', 'c']);
					pending.get('b')!('browser b');
					await drain();
					expect(container.querySelector('output')!.textContent).not.toBe('browser b');
					pending.get('c')!('browser c');
					await drain();
					expect(uncaught(errors)).toEqual([]);
					expect(browserLoad).toHaveBeenCalledTimes(2);
					expect(container.querySelector('output')!.textContent).toBe('browser c');
				},
			});
		},
	);
});
