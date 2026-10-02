import { describe, expect, it, vi } from 'vitest';
// Compile-tooling setup is separate from the behavior checks. Each scenario
// still loads a fresh runtime graph and fixture helper after resetModules().
import '../_server-fixture.js';

// A component's directive arms, nested boundaries and keyed rows are part of
// its template, not separate feature instances. A query declared by the
// component and read again from any of them is one declaration and selection:
// one browser request, or the server's request resumed during hydration.
const READ = {
	direct: 'record$.get() as string',
	derived: 'selected$.get() as string',
};

type Read = keyof typeof READ;

function frames(output: string): Record<string, string> {
	return {
		try: `@try { ${output} } @pending { <i>waiting</i> }`,
		catch: `@try { @try { <Boom/> } @catch (_error) { ${output} } } @pending { <i>waiting</i> }`,
		'nested try': `@try { <div>@try { ${output} } @pending { <b>inner</b> }</div> } @pending { <i>waiting</i> }`,
		if: `@try { @if (props.show) { ${output} } } @pending { <i>waiting</i> }`,
		for: `@try { <ul>@for (const item of props.items; key item) { <li>${output}</li> }</ul> } @pending { <i>waiting</i> }`,
		switch: `@try { @switch (props.mode) { @case 'a': { ${output} } @default: { <b>other</b> } } } @pending { <i>waiting</i> }`,
	};
}

const SHAPES = Object.keys(frames(''));

// Builds a module whose declaring component is the root or a nested child.
function source(body: string, nested: boolean, imports = 'derived$, query$'): string {
	return `import { useEffect } from 'octane';
import { ${imports} } from 'octane/signals';
function Boom() @{
 throw new Error('boom');
}
${
	nested
		? `function Feature(props) @{${body}
}
export function App(props) @{
 <section><Feature {...props} /></section>
}`
		: `export function App(props) @{${body}
}`
}`;
}

// The browser starts the query from a nonsuspending setup snapshot. A server
// pass must not complete with a pending snapshot, so SSR reads the value, or
// leaves every read to the template.
function capturedRead(read: Read, shape: string, setup: string | null): string {
	return `
 const record$ = query$(() => 'record', props.load);
 const selected$ = derived$(() => record$.get());
 ${setup === null ? '' : `const state = record$.${setup};`}
 ${frames(`<output>{${READ[read]}}</output>`)[shape]}`;
}

// The octane project covers development compilation; octane-prod covers both
// production compilers, so each explicit compile mode runs once.
const MODES =
	process.env.OCTANE_TEST_COMPILE_MODE === 'prod'
		? [
				{ name: 'prod', dev: false, strong: false },
				{ name: 'strong', dev: false, strong: true },
			]
		: [{ name: 'dev', dev: true, strong: false }];

const CASES = MODES.flatMap((mode) =>
	(['direct', 'derived'] as const).flatMap((read) =>
		SHAPES.flatMap((shape) => [false, true].map((nested) => ({ ...mode, read, shape, nested }))),
	),
);

const PROPS = { show: true, items: ['first', 'second'], mode: 'a' };

async function mountClient(
	text: string,
	options: { dev: boolean; strong: boolean },
	props: Record<string, unknown> = {},
) {
	vi.resetModules();
	const client = await import('../../src/runtime.js');
	const signals = await import('../../src/signals/index.js');
	const { loadCompiledFixtureSource } = await import('../_server-fixture.js');
	const module = loadCompiledFixtureSource(text, {
		id: '/src/signal-declaration-owner.tsrx',
		mode: 'client',
		compileOptions: { dev: options.dev, strong: options.strong, hmr: false },
		runtimeModules: { 'octane/signals': signals },
	});
	const requests: Array<(value: string) => void> = [];
	const load = () => new Promise<string>((resolve) => requests.push(resolve));
	const container = document.createElement('div');
	const root = client.createRoot(container);
	await client.act(() => root.render(module.App, { ...PROPS, ...props, load }));
	return {
		requests,
		texts: () => [...container.querySelectorAll('output')].map((node) => node.textContent),
		settle: (value: string) => client.act(() => requests[0]!(value)),
		click: (selector: string) =>
			client.flushSync(() => container.querySelector<HTMLElement>(selector)!.click()),
		update: (next: Record<string, unknown>) =>
			client.flushSync(() => root.render(module.App, { ...PROPS, ...props, ...next, load })),
		unmount: () => root.unmount(),
	};
}

async function hydrateServerOutput(
	text: string,
	options: { dev: boolean; strong: boolean; adoptsOutput: boolean },
) {
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
	const compileOptions = {
		id: '/src/signal-declaration-owner.tsrx',
		compileOptions: { dev: options.dev, strong: options.strong, hmr: false },
		runtimeModules: { 'octane/signals': signals },
	};
	const serverModule = loadCompiledFixtureSource(text, { ...compileOptions, mode: 'server' });
	const clientModule = loadCompiledFixtureSource(text, { ...compileOptions, mode: 'client' });
	const serverLoad = vi.fn(async () => 'server result');
	const browserLoad = vi.fn(async () => 'browser result');
	const streamedSignals = {
		buildId: 'signal-declaration-owner',
		documentId: 'signal-declaration-owner',
	};
	const container = document.createElement('div');
	document.body.append(container);
	let root: ReturnType<typeof client.hydrateRoot> | undefined;
	let hydration: ReturnType<typeof bootstrapStreamedSignalHydration> | undefined;
	try {
		const output = await server.prerender(
			serverModule.App,
			{ ...PROPS, load: serverLoad },
			{ streamedSignals },
		);
		expect(serverLoad).toHaveBeenCalledTimes(1);
		container.innerHTML = output.html;
		activateStreamedMarkup(container);
		const outputs = [...container.querySelectorAll('output')];
		expect(outputs.map((node) => node.textContent)).not.toEqual([]);
		expect(new Set(outputs.map((node) => node.textContent))).toEqual(new Set(['server result']));
		const errors: unknown[] = [];
		hydration = bootstrapStreamedSignalHydration(streamedSignals);
		root = client.hydrateRoot(
			container,
			clientModule.App,
			{ ...PROPS, load: browserLoad },
			{
				signalOwner: hydration.signalOwner,
				onRecoverableError: (error) => errors.push(error),
				onUncaughtError: (error) => errors.push(error),
			},
		);
		await drainProducers();
		client.flushSync(() => {});
		expect(browserLoad).not.toHaveBeenCalled();
		const hydrated = [...container.querySelectorAll('output')];
		if (options.adoptsOutput) expect(hydrated).toEqual(outputs);
		expect(hydrated.map((node) => node.textContent)).toEqual(
			outputs.map((node) => node.textContent),
		);
		expect(errors).toEqual([]);
	} finally {
		root?.unmount();
		hydration?.dispose();
		container.remove();
		resetStreamRuntimeGlobals();
	}
}

describe('signal declarations read across their component template', () => {
	it.each(CASES)(
		'starts one query for setup and $shape $read reads (nested: $nested, $name)',
		async ({ dev, strong, read, shape, nested }) => {
			const view = await mountClient(source(capturedRead(read, shape, 'snapshot()'), nested), {
				dev,
				strong,
			});
			try {
				expect(view.requests).toHaveLength(1);
				await view.settle('ready');
				expect(view.texts()).not.toEqual([]);
				expect(new Set(view.texts())).toEqual(new Set(['ready']));
				expect(view.requests).toHaveLength(1);
			} finally {
				view.unmount();
			}
		},
	);

	// Keyed rows can also reach the component's handle through APIs that
	// resolve against an explicit owner: a row derivation's context read and a
	// subscription from a row effect.
	it.each(
		MODES.flatMap((mode) =>
			[
				{
					kind: 'derived context read',
					row: `const view$ = derived$(async ({ read }) => read(record$));
 <li><output>{view$.get() as string}</output></li>`,
				},
				{
					kind: 'effect subscription',
					row: `useEffect(() => record$.subscribe(() => props.notify(record$.snapshot())));
 <li><output>{state.status as string}</output></li>`,
				},
			].map((scenario) => ({ ...scenario, ...mode })),
		),
	)('shares the query with a keyed row $kind ($name)', async ({ kind, row, dev, strong }) => {
		const notified: unknown[] = [];
		const notify = (snapshot: { status: string; value?: unknown }) =>
			notified.push(snapshot.status === 'ready' ? snapshot.value : snapshot.status);
		const view = await mountClient(
			source(
				`
 const record$ = query$(() => 'record', props.load);
 const state = record$.snapshot();
 @try { <ul>@for (const item of props.items; key item) { ${row} }</ul> } @pending { <i>waiting</i> }`,
				false,
			),
			{ dev, strong },
			{ notify },
		);
		try {
			expect(view.requests).toHaveLength(1);
			await view.settle('ready');
			expect(view.texts()).toEqual(['ready', 'ready']);
			if (kind === 'effect subscription') expect(notified).toContain('ready');
			expect(view.requests).toHaveLength(1);
		} finally {
			view.unmount();
		}
	});

	it.each(CASES)(
		'resumes the server query for setup and $shape $read reads (nested: $nested, $name)',
		async ({ dev, strong, read, shape, nested }) => {
			// A synchronous render error is not a server rejection seed, so the
			// browser rebuilds its catch arm; every other arm adopts server DOM.
			await hydrateServerOutput(source(capturedRead(read, shape, 'get()'), nested), {
				dev,
				strong,
				adoptsOutput: shape !== 'catch',
			});
		},
	);

	// With no setup read, the template frames start and observe the server
	// attempt themselves, and the browser must still bind it to the component.
	it.each(CASES)(
		'resumes a server query read only by $shape $read frames (nested: $nested, $name)',
		async ({ dev, strong, read, shape, nested }) => {
			await hydrateServerOutput(source(capturedRead(read, shape, null), nested), {
				dev,
				strong,
				adoptsOutput: shape !== 'catch',
			});
		},
	);

	// An arm still owns the declarations it evaluates and retires them when it
	// is removed. The component's own handle keeps its cell across that remount.
	it.each(MODES)('keeps arm declarations scoped to the arm ($name)', async ({ dev, strong }) => {
		const view = await mountClient(
			source(
				`
 const count$ = signal$(0);
 @if (props.show) {
  const local$ = signal$(0);
  <>
   <button class="component" onClick={() => count$.set(count$.get() + 1)}><output>{String(count$.get())}</output></button>
   <button class="arm" onClick={() => local$.set(local$.get() + 1)}><output>{String(local$.get())}</output></button>
  </>
 }`,
				false,
				'signal$',
			),
			{ dev, strong },
		);
		try {
			view.click('.component');
			view.click('.arm');
			expect(view.texts()).toEqual(['1', '1']);
			view.update({ show: false });
			expect(view.texts()).toEqual([]);
			view.update({ show: true });
			expect(view.texts()).toEqual(['1', '0']);
		} finally {
			view.unmount();
		}
	});
});
