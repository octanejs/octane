import { describe, expect, it, vi } from 'vitest';
// Compile-tooling setup is separate from the behavior checks. Each scenario
// still loads a fresh runtime graph and fixture helper after resetModules().
import '../_server-fixture.js';

// A component's directive arms, nested boundaries, keyed rows and nested
// `@{ … }` blocks are part of its template, not separate feature instances. A
// query declared by the component and read again from any of them is one
// declaration and selection: one browser request, or the server's request
// resumed during hydration.
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
		// Setup makes each block its own render scope rather than transparent grouping.
		block: `@try { <div>@{ const label = 'block'; <p title={label}>${output}</p> }</div> } @pending { <i>waiting</i> }`,
		'row block': `@try { <ul>@for (const item of props.items; key item) { <li>@{ const label = item; <p title={label}>${output}</p> }</li> }</ul> } @pending { <i>waiting</i> }`,
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
	// Plain modules the fixture imports, compiled against this render's runtime.
	plainModules: Record<string, string> = {},
) {
	vi.resetModules();
	const client = await import('../../src/runtime.js');
	const signals = await import('../../src/signals/index.js');
	const { loadCompiledFixtureSource, loadPlainHookFixtureSource } =
		await import('../_server-fixture.js');
	const { drainProducers } = await import('../_fixtures/signals-async-controls.js');
	const runtimeModules: Record<string, Record<string, unknown>> = { 'octane/signals': signals };
	for (const [request, source] of Object.entries(plainModules))
		runtimeModules[request] = loadPlainHookFixtureSource(source, {
			id: `/src/${request.slice(2)}.ts`,
			inlineHookMemo: false,
			runtimeModules,
		});
	const module = loadCompiledFixtureSource(text, {
		id: '/src/signal-declaration-owner.tsrx',
		mode: 'client',
		compileOptions: { dev: options.dev, strong: options.strong, hmr: false },
		runtimeModules,
	});
	const requests: Array<(value: string) => void> = [];
	const load = () => new Promise<string>((resolve) => requests.push(resolve));
	const container = document.createElement('div');
	const root = client.createRoot(container);
	await client.act(() => root.render(module.App, { ...PROPS, load, ...props }));
	return {
		requests,
		signals,
		texts: () => [...container.querySelectorAll('output')].map((node) => node.textContent),
		settle: (value: string) => client.act(() => requests[0]!(value)),
		settleAll: (value: string) =>
			client.act(async () => {
				for (const resolve of requests) resolve(value);
				await drainProducers();
			}),
		click: (selector: string) =>
			client.flushSync(() => container.querySelector<HTMLElement>(selector)!.click()),
		// A click whose handler, query and boundary retry may finish asynchronously.
		clickAndSettle: (selector: string) =>
			client.act(async () => {
				container.querySelector<HTMLElement>(selector)!.click();
				await drainProducers();
			}),
		flush: () => client.act(drainProducers),
		update: (next: Record<string, unknown>) =>
			client.flushSync(() => root.render(module.App, { ...PROPS, load, ...props, ...next })),
		unmount: () => root.unmount(),
	};
}

async function hydrateServerOutput(
	text: string,
	// `loads` counts the distinct queries the server starts, one by default.
	options: { dev: boolean; strong: boolean; adoptsOutput: boolean; loads?: number },
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
		expect(serverLoad).toHaveBeenCalledTimes(options.loads ?? 1);
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

	// A nested block with state of its own reads the component's derived value.
	// It must neither start a second load nor compute from a second count$ cell
	// that never saw the component's update.
	it.each(MODES)(
		"computes a nested block's read from the component's cells ($name)",
		async ({ dev, strong }) => {
			const view = await mountClient(
				`import { useState } from 'octane';
import { derived$, query$, signal$ } from 'octane/signals';
export function App(props) @{
 const count$ = signal$(1);
 const source$ = query$(() => 'source', props.load);
 const label$ = derived$(() => count$.get() + source$.get());
 const state = label$.snapshot();
 <section>
  <button id="count" onClick={() => count$.set(count$.get() + 1)}><output>{String(count$.get())}</output></button>
  <output>{state.status === 'ready' ? String(state.value) : state.status}</output>
  @{
   const [tick, setTick] = useState(0);
   const read = label$.snapshot();
   <button id="reader" onClick={() => setTick(tick + 1)}><output>{\`\${read.status === 'ready' ? read.value : read.status} \${tick}\`}</output></button>
  }
 </section>
}`,
				{ dev, strong },
			);
			try {
				expect(view.requests).toHaveLength(1);
				view.click('#count');
				view.click('#reader');
				expect(view.texts()).toEqual(['2', 'pending', 'pending 1']);
				await view.settleAll('value');
				expect(view.texts()).toEqual(['2', '2value', '2value 1']);
				expect(view.requests).toHaveLength(1);
			} finally {
				view.unmount();
			}
		},
	);

	// The block still owns what it declares: its signal retires with the block,
	// while the component's signal keeps its cell across the remount.
	it.each(MODES)(
		'keeps nested block declarations scoped to the block ($name)',
		async ({ dev, strong }) => {
			const view = await mountClient(
				source(
					`
 const count$ = signal$(0);
 <>
  <button class="component" onClick={() => count$.set(count$.get() + 1)}><output>{String(count$.get())}</output></button>
  @if (props.show) {
   <div>
    @{
     const local$ = signal$(0);
     <button class="block" onClick={() => local$.set(local$.get() + 1)}><output>{\`\${count$.get()}:\${local$.get()}\`}</output></button>
    }
   </div>
  }
 </>`,
					false,
					'signal$',
				),
				{ dev, strong },
			);
			try {
				view.click('.component');
				view.click('.block');
				expect(view.texts()).toEqual(['1', '1:1']);
				view.update({ show: false });
				expect(view.texts()).toEqual(['1']);
				view.update({ show: true });
				expect(view.texts()).toEqual(['1', '1:0']);
			} finally {
				view.unmount();
			}
		},
	);

	// A child resolves a handle it receives in its own instance, and its nested
	// block is part of the child's template. A child rendered inside the
	// parent's nested block is still an instance of its own.
	it.each(MODES)(
		"reads a handle prop in a child's nested block from the child's cell ($name)",
		async ({ dev, strong }) => {
			const view = await mountClient(
				`import { signal$ } from 'octane/signals';
function Child(props) @{
 <>
  <output>{props.handle$.get() as string}</output>
  @{
   const label = 'write';
   <button title={label} onClick={() => props.handle$.set('written')}><output>{props.handle$.get() as string}</output></button>
  }
 </>
}
export function App(props) @{
 const result$ = signal$('parent');
 <>
  <output>{result$.get() as string}</output>
  @{
   const label = 'child';
   <section title={label}><Child handle$={result$} /></section>
  }
 </>
}`,
				{ dev, strong },
			);
			try {
				expect(view.texts()).toEqual(['parent', 'parent', 'parent']);
				view.click('button');
				expect(view.texts()).toEqual(['parent', 'written', 'written']);
			} finally {
				view.unmount();
			}
		},
	);

	// A hookless child renders value JSX through a renderer below its DOM
	// stand-in. A nested block there still reads the handle in the child's cell.
	it.each(MODES)(
		"reads a handle prop in a hookless child's value JSX from the child's cell ($name)",
		async ({ dev, strong }) => {
			const view = await mountClient(
				`import { signal$ } from 'octane/signals';
function Child(props) @{
 const view = props.show ? <div>@{ const label = 'write'; <button title={label} onClick={() => props.handle$.set('written')}><output>{props.handle$.get() as string}</output></button> }</div> : null;
 <article><output>{props.handle$.get() as string}</output>{view}</article>
}
export function App(props) @{
 const result$ = signal$('parent');
 <main><output>{result$.get() as string}</output><Child show={props.show} handle$={result$} /></main>
}`,
				{ dev, strong },
			);
			try {
				expect(view.texts()).toEqual(['parent', 'parent', 'parent']);
				view.click('button');
				expect(view.texts()).toEqual(['parent', 'written', 'written']);
			} finally {
				view.unmount();
			}
		},
	);

	// A nested block keeps an instance of its own for what it declares, so its
	// query is seeded from the server's request like a component's.
	it.each(MODES)('resumes a query a nested block declares ($name)', async ({ dev, strong }) => {
		await hydrateServerOutput(
			source(
				`
 const record$ = query$(() => 'record', props.load);
 @try {
  <div>
   <output>{record$.get() as string}</output>
   @{
    const own$ = query$(() => 'own', props.load);
    const selected$ = derived$(() => record$.get());
    <p><output>{own$.get() as string}</output><output>{selected$.get() as string}</output></p>
   }
  </div>
 } @pending {
  <i>waiting</i>
 }`,
				false,
			),
			{ dev, strong, adoptsOutput: true, loads: 2 },
		);
	});

	// Returned JSX renders through a fragment renderer, which carries the
	// instance of the component it renders for. A nested block inside it still
	// reads that component's cells, at the root or below another component.
	function returnedSource(setup: string, nested: boolean): string {
		return `import { query$ } from 'octane/signals';
${nested ? 'export function App(props) @{\n <main><Feature {...props} /></main>\n}\nfunction Feature(props) {' : 'export function App(props) {'}
 const record$ = query$(() => 'record', props.load);
 const state = record$.${setup};
 return <section>
  <output>{${setup === 'get()' ? 'state' : 'state.status'} as string}</output>
  @{
   const label = 'block';
   <p title={label}><output>{record$.get() as string}</output></p>
  }
 </section>;
}`;
	}

	it.each(MODES.flatMap((mode) => [false, true].map((nested) => ({ ...mode, nested }))))(
		'starts one query for a nested block in returned JSX (nested: $nested, $name)',
		async ({ dev, strong, nested }) => {
			const view = await mountClient(returnedSource('snapshot()', nested), { dev, strong });
			try {
				expect(view.requests).toHaveLength(1);
				await view.settle('ready');
				expect(view.texts()).toEqual(['ready', 'ready']);
				expect(view.requests).toHaveLength(1);
			} finally {
				view.unmount();
			}
		},
	);

	// JSX a block evaluates as a value renders through renderers that carry the
	// block's instance. A nested block inside them reads the block's declarations.
	function valueSource(setup: string): string {
		return `import { query$ } from 'octane/signals';
export function App(props) @{
 <section>
  @{
   const own$ = query$(() => 'own', props.load);
   const state = own$.${setup};
   const view = props.show ? <div>@{ const label = 'inner'; <p title={label}><output>{own$.get() as string}</output></p> }</div> : null;
   <article><output>{${setup === 'get()' ? 'state' : 'state.status'} as string}</output>{view}</article>
  }
 </section>
}`;
	}

	it.each(MODES)(
		"starts one query for a block nested in its block's value JSX ($name)",
		async ({ dev, strong }) => {
			const view = await mountClient(valueSource('snapshot()'), { dev, strong });
			try {
				expect(view.requests).toHaveLength(1);
				await view.settle('ready');
				expect(view.texts()).toEqual(['ready', 'ready']);
				expect(view.requests).toHaveLength(1);
			} finally {
				view.unmount();
			}
		},
	);

	it.each(MODES)(
		"resumes the server query for a block nested in its block's value JSX ($name)",
		async ({ dev, strong }) => {
			await hydrateServerOutput(valueSource('get()'), { dev, strong, adoptsOutput: true });
		},
	);

	it.each(MODES.flatMap((mode) => [false, true].map((nested) => ({ ...mode, nested }))))(
		'resumes the server query for a nested block in returned JSX (nested: $nested, $name)',
		async ({ dev, strong, nested }) => {
			await hydrateServerOutput(returnedSource('get()', nested), {
				dev,
				strong,
				adoptsOutput: true,
			});
		},
	);
});

// A function a component body creates closes over the handles that body
// declares. Wherever it runs, in a child's event or render, after an `await`,
// or with no owner at all, it uses the declaring instance's cells. A handle
// passed on as a value is still read in its reader's instance.
describe('signal declarations used by the functions their body creates', () => {
	function retrySource(button: string): string {
		return `import { query$ } from 'octane/signals';
function RetryButton(props) @{
 <button onClick={() => props.retry()}>Retry</button>
}
export function App(props) @{
 const result$ = query$(() => 1, props.load);
 @try {
  <output>{result$.get() as string}</output>
 } @pending {
  <i>waiting</i>
 } @catch (_error, reset) {
  ${button}
 }
}`;
	}

	const RETRIES = {
		'native button': '<button onClick={() => { result$.reset(); reset(); }}>Retry</button>',
		'forwarded callback': '<RetryButton retry={() => { result$.reset(); reset(); }} />',
		'native button after await':
			'<button onClick={async () => { await Promise.resolve(); result$.reset(); reset(); }}>Retry</button>',
		'forwarded callback after await':
			'<RetryButton retry={async () => { await Promise.resolve(); result$.reset(); reset(); }} />',
	};

	function failingFirstLoad() {
		let calls = 0;
		return vi.fn(() =>
			++calls === 1 ? Promise.reject(new Error('first load failed')) : Promise.resolve('loaded'),
		);
	}

	it.each(
		MODES.flatMap((mode) =>
			Object.entries(RETRIES).map(([kind, button]) => ({ kind, button, ...mode })),
		),
	)('retries the declaring query from a $kind ($name)', async ({ button, dev, strong }) => {
		const load = failingFirstLoad();
		const view = await mountClient(retrySource(button), { dev, strong }, { load });
		try {
			await view.flush();
			expect(view.texts()).toEqual([]);
			expect(load).toHaveBeenCalledTimes(1);
			await view.clickAndSettle('button');
			expect(view.texts()).toEqual(['loaded']);
			expect(load).toHaveBeenCalledTimes(2);
		} finally {
			view.unmount();
		}
	});

	// A custom hook in a plain module returns the callback; the component that
	// called it owns the declaration.
	it.each(MODES)(
		'retries a hook-declared query from a forwarded callback ($name)',
		async (mode) => {
			const load = failingFirstLoad();
			const view = await mountClient(
				`import { useRetryableQuery$ } from './use-retryable-query';
function RetryButton(props) @{
 <button onClick={() => props.retry()}>Retry</button>
}
export function App(props) @{
 const query = useRetryableQuery$(props.load);
 @try {
  <output>{query.result$.get() as string}</output>
 } @pending {
  <i>waiting</i>
 } @catch (_error, reset) {
  <RetryButton retry={() => { query.retry(); reset(); }} />
 }
}`,
				mode,
				{ load },
				{
					'./use-retryable-query': `import { query$ } from 'octane/signals';
export function useRetryableQuery$(load: () => Promise<string>) {
	const result$ = query$(() => 1, load);
	return { result$, retry: () => result$.reset() };
}`,
				},
			);
			try {
				await view.flush();
				await view.clickAndSettle('button');
				expect(view.texts()).toEqual(['loaded']);
				expect(load).toHaveBeenCalledTimes(2);
			} finally {
				view.unmount();
			}
		},
	);

	// The child declares its own `result$` and also receives the parent's
	// handle. Only the parent's callback closes over the parent's declaration.
	it.each(MODES)(
		'keeps a child declaration, handle prop and alias in the child ($name)',
		async (mode) => {
			const view = await mountClient(
				`import { signal$ } from 'octane/signals';
function Child(props) @{
 const result$ = signal$('child');
 <>
  <output>{result$.get() as string}</output>
  <output>{props.handle$.get() as string}</output>
  <button class="own" onClick={() => result$.set('own')}>own</button>
  <button class="write" onClick={() => props.write('written')}>write</button>
  <button class="alias" onClick={() => { const result$ = props.handle$; result$.set('alias'); }}>alias</button>
 </>
}
export function App(props) @{
 const result$ = signal$('parent');
 <>
  <output>{result$.get() as string}</output>
  <Child handle$={result$} write={(value) => result$.set(value)} />
 </>
}`,
				mode,
			);
			try {
				// Parent cell, child's own declaration, child's cell for the parent's handle.
				expect(view.texts()).toEqual(['parent', 'child', 'parent']);
				view.click('.own');
				expect(view.texts()).toEqual(['parent', 'own', 'parent']);
				view.click('.write');
				expect(view.texts()).toEqual(['written', 'own', 'parent']);
				view.click('.alias');
				expect(view.texts()).toEqual(['written', 'own', 'alias']);
			} finally {
				view.unmount();
			}
		},
	);

	const GETTER = `import { query$ } from 'octane/signals';
function Reader(props) @{
 <output>{props.read() as string}</output>
}
export function App(props) @{
 const record$ = query$(() => 'record', props.load);
 @try {
  <section><output>{record$.get() as string}</output><Reader read={() => record$.get()} /></section>
 } @pending {
  <i>waiting</i>
 }
}`;

	it.each(MODES)(
		'reads the declaring query when a child renders a callback ($name)',
		async (mode) => {
			const view = await mountClient(GETTER, mode);
			try {
				expect(view.requests).toHaveLength(1);
				await view.settleAll('ready');
				expect(view.texts()).toEqual(['ready', 'ready']);
				expect(view.requests).toHaveLength(1);
			} finally {
				view.unmount();
			}
		},
	);

	it.each(MODES)(
		'resumes the server query a child read through a callback ($name)',
		async ({ dev, strong }) => {
			await hydrateServerOutput(GETTER, { dev, strong, adoptsOutput: true });
		},
	);

	// Producer closures keep reader ownership: a derived handle a child
	// receives as a prop computes from the child's own query, while the
	// parent's callback still reads the parent's derived value. A wrapped
	// factory callee is still a producer.
	const PRODUCERS = {
		'a derived producer': 'derived$(() => record$.get())',
		'a wrapped derived producer':
			"(derived$ as typeof derived$)(() => record$.get(), { key: 'selected' })",
	};

	it.each(
		MODES.flatMap((mode) =>
			Object.entries(PRODUCERS).map(([kind, producer]) => ({ kind, producer, ...mode })),
		),
	)(
		'keeps $kind reader-owned beside a forwarded callback ($name)',
		async ({ producer, dev, strong }) => {
			const view = await mountClient(
				`import { derived$, query$ } from 'octane/signals';
function Reader(props) @{
 <>
  <output>{props.selected$.get() as string}</output>
  <output>{props.read() as string}</output>
 </>
}
export function App(props) @{
 const record$ = query$(() => 'record', props.load);
 const selected$ = ${producer};
 @try {
  <section><output>{selected$.get() as string}</output><Reader selected$={selected$} read={() => selected$.get()} /></section>
 } @pending {
  <i>waiting</i>
 }
}`,
				{ dev, strong },
			);
			try {
				await view.settleAll('ready');
				await view.settleAll('ready');
				expect(view.texts()).toEqual(['ready', 'ready', 'ready']);
				// The parent's query and the child's own derived cell's query.
				expect(view.requests).toHaveLength(2);
			} finally {
				view.unmount();
			}
		},
	);

	// With no ambient owner the callback still uses the declaring instance,
	// and once that instance unmounts it is fenced like the instance's own reads.
	it.each(MODES)(
		'reads the declaring cell from a kept callback until unmount ($name)',
		async (mode) => {
			let kept: (() => unknown) | undefined;
			const view = await mountClient(
				`import { useEffect } from 'octane';
import { signal$ } from 'octane/signals';
export function App(props) @{
 const count$ = signal$(1);
 useEffect(() => props.keep(() => count$.get()));
 <button onClick={() => count$.set(count$.get() + 1)}><output>{count$.get() as string}</output></button>
}`,
				mode,
				{ keep: (read: () => unknown) => void (kept = read) },
			);
			view.click('button');
			expect(view.texts()).toEqual(['2']);
			expect(kept!()).toBe(2);
			view.unmount();
			expect(() => kept!()).toThrow(view.signals.ScopeDisposedError);
		},
	);
});
