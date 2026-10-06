import { describe, expect, it, vi } from 'vitest';
import { compile } from 'octane/compiler';
// Compile-tooling setup is separate from the behavior checks. Each scenario
// still loads a fresh runtime graph and fixture helper after resetModules().
import '../_server-fixture.js';

// A component's directive arms, nested boundaries, keyed rows, nested `@{ … }`
// blocks and the children it passes to other components are part of its
// template, not separate feature instances. A query declared by the component
// and read again from any of them is one declaration and selection: one browser
// request, or the server's request resumed during hydration.
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
		renderprop: `@try { <Render render={() => @{ const label = 'x'; <p title={label}>${output}</p> }} /> } @pending { <i>waiting</i> }`,
		// Compiled children belong to the template that authored them, whichever
		// component renders them: in a slot, forwarded through another component's
		// children, created in a row, or rendered by a boundary or context provider.
		children: `@try { <Card>${output}</Card> } @pending { <i>waiting</i> }`,
		'forwarded children': `@try { <Wrapper>${output}</Wrapper> } @pending { <i>waiting</i> }`,
		'row children': `@try { <ul>@for (const item of props.items; key item) { <li><Card>${output}</Card></li> }</ul> } @pending { <i>waiting</i> }`,
		Suspense: `<Suspense fallback={<i>waiting</i>}>${output}</Suspense>`,
		'Suspense row': `<Suspense fallback={<i>waiting</i>}><ul>@for (const item of props.items; key item) { <li>${output}</li> }</ul></Suspense>`,
		ViewTransition: `@try { <ViewTransition>${output}</ViewTransition> } @pending { <i>waiting</i> }`,
		// An alias keeps the component form the compiler would otherwise inline.
		ErrorBoundary: `@try { <Boundary fallback={<b>error</b>}>${output}</Boundary> } @pending { <i>waiting</i> }`,
		provider: `@try { <Context value="provided">${output}</Context> } @pending { <i>waiting</i> }`,
		// A Hydrate boundary renders its children in a frame of its own: inline
		// (split={false}), from the module the compiler splits them into, or on the
		// server only for a permanently static boundary. Forwarded children still
		// belong to their author, and a split boundary inside another component's
		// children to the template rendering it.
		Hydrate: `<Hydrate when={load()} split={false}>${output}</Hydrate>`,
		'Hydrate row': `<Hydrate when={load()} split={false}><ul>@for (const item of props.items; key item) { <li>${output}</li> }</ul></Hydrate>`,
		'forwarded Hydrate': `<HydrateWrapper>${output}</HydrateWrapper>`,
		'split Hydrate': `<Hydrate when={load()}>${output}</Hydrate>`,
		'split Hydrate children': `<Card><Hydrate when={load()}>${output}</Hydrate></Card>`,
		'static Hydrate': `<Hydrate split={false} when={never()}>${output}</Hydrate>`,
	};
}

const SHAPES = Object.keys(frames(''));
// The browser never renders a permanently static boundary's children.
const CLIENT_SHAPES = SHAPES.filter((shape) => shape !== 'static Hydrate');

// Builds a module whose declaring component is the root or a nested child.
function source(body: string, nested: boolean, imports = 'derived$, query$'): string {
	return `import { createContext, ErrorBoundary, Hydrate, Suspense, useEffect, ViewTransition } from 'octane';
import { load, never } from 'octane/hydration';
import { ${imports} } from 'octane/signals';
const Context = createContext('');
const Boundary = ErrorBoundary;
function Boom() @{
 throw new Error('boom');
}
function Card(props) @{
 <div>{props.children}</div>
}
function Wrapper(props) @{
 <section><Card>{props.children}</Card></section>
}
function HydrateWrapper(props) @{
 <Hydrate when={load()} split={false} children={props.children} />
}
function Render(props) @{
 <div>{props.render}</div>
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

function cases(shapes: string[]) {
	return MODES.flatMap((mode) =>
		(['direct', 'derived'] as const).flatMap((read) =>
			shapes.flatMap((shape) => [false, true].map((nested) => ({ ...mode, read, shape, nested }))),
		),
	);
}

const CASES = cases(SHAPES);
const CLIENT_CASES = cases(CLIENT_SHAPES);

const PROPS = { show: true, items: ['first', 'second'], mode: 'a' };

// Compiles the browser module against the current runtime graph. A split
// <Hydrate> boundary imports its children from a module the compiler selects
// from the same source, so the loader provides that module for the request.
async function loadClientModule(
	text: string,
	options: { dev: boolean; strong: boolean },
	runtimeModules: Record<string, Record<string, unknown>>,
) {
	const { evaluateCompiledFixtureCode } = await import('../_server-fixture.js');
	const id = '/src/signal-declaration-owner.tsrx';
	const compileOptions = {
		dev: options.dev,
		strong: options.strong,
		hmr: false,
		mode: 'client' as const,
	};
	const { code } = compile(text, id, compileOptions);
	const modules = { ...runtimeModules };
	for (const [, , request, query] of code.matchAll(
		/import\((['"])(\.\/signal-declaration-owner\.tsrx\?(octane-hydrate=\d+))\1\)/g,
	))
		modules[request!] ??= evaluateCompiledFixtureCode(
			compile(text, `${id}?${query}`, compileOptions).code,
			id,
			'client',
			runtimeModules,
		);
	return evaluateCompiledFixtureCode(code, id, 'client', modules);
}

async function mountClient(
	text: string,
	options: { dev: boolean; strong: boolean },
	props: Record<string, unknown> = {},
	// Plain modules the fixture imports, compiled against this render's runtime.
	plainModules: Record<string, string> = {},
	withExplicitScope = false,
) {
	vi.resetModules();
	const client = await import('../../src/runtime.js');
	const signals = await import('../../src/signals/index.js');
	const { loadPlainHookFixtureSource } = await import('../_server-fixture.js');
	const { drainProducers } = await import('../_fixtures/signals-async-controls.js');
	const runtimeModules: Record<string, Record<string, unknown>> = { 'octane/signals': signals };
	for (const [request, source] of Object.entries(plainModules))
		runtimeModules[request] = loadPlainHookFixtureSource(source, {
			id: `/src/${request.slice(2)}.ts`,
			inlineHookMemo: false,
			runtimeModules,
		});
	const module = await loadClientModule(text, options, runtimeModules);
	const requests: Array<(value: string) => void> = [];
	const load = () => new Promise<string>((resolve) => requests.push(resolve));
	const container = document.createElement('div');
	const root = client.createRoot(container);
	const scope = withExplicitScope
		? signals.createScope({ scopeKey: 'explicit-producer' })
		: undefined;
	await client.act(() => root.render(module.App, { ...PROPS, load, scope, ...props }));
	return {
		requests,
		signals,
		texts: () => [...container.querySelectorAll('output')].map((node) => node.textContent),
		settle: (value: string, index = 0) => client.act(() => requests[index]!(value)),
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
		unmount: () => {
			root.unmount();
			scope?.dispose();
		},
	};
}

async function hydrateServerOutput(
	text: string,
	// `loads` counts the distinct queries the server starts, one by default.
	// A `deferred` fixture's `props.when` holds its Hydrate boundaries dormant
	// until a parent update activates them.
	options: {
		dev: boolean;
		strong: boolean;
		adoptsOutput: boolean;
		loads?: number;
		deferred?: boolean;
	},
) {
	vi.resetModules();
	const server = await import('../../src/runtime.server.js');
	const client = await import('../../src/runtime.js');
	const signals = await import('../../src/signals/index.js');
	const { condition } = await import('../../src/hydration/index.js');
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
	const clientModule = await loadClientModule(text, options, compileOptions.runtimeModules);
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
			{ ...PROPS, load: serverLoad, when: condition(true) },
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
		const props = { ...PROPS, load: browserLoad, when: condition(!options.deferred) };
		root = client.hydrateRoot(container, clientModule.App, props, {
			signalOwner: hydration.signalOwner,
			onRecoverableError: (error) => errors.push(error),
			onUncaughtError: (error) => errors.push(error),
		});
		await drainProducers();
		client.flushSync(() => {});
		if (options.deferred)
			await client.act(() => root!.render(clientModule.App, { ...props, when: condition(true) }));
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
	it.each(CLIENT_CASES)(
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

	// A dormant Hydrate boundary keeps its server HTML until a parent update
	// activates it. Its children then read the cells the component resumed.
	it.each(MODES.flatMap((mode) => [false, true].map((split) => ({ ...mode, split }))))(
		'activates a deferred Hydrate boundary on the component cells (split: $split, $name)',
		async ({ dev, strong, split }) => {
			await hydrateServerOutput(
				source(
					`
 const record$ = query$(() => 'record', props.load);
 const selected$ = derived$(() => record$.get());
 const state = record$.get();
 <Hydrate when={props.when}${split ? '' : ' split={false}'}><output>{record$.get() as string}</output><output>{selected$.get() as string}</output></Hydrate>`,
					false,
				),
				{ dev, strong, adoptsOutput: true, deferred: true },
			);
		},
	);

	// A render prop renders inside the component it is passed to, yet reads a
	// handle it closes over as the row that declared it. That row's derived
	// value reads the component's query, which the server must still announce
	// for the browser to resume.
	const ROW_RENDER_PROP = source(
		`
 const record$ = query$(() => 'record', props.load);
 @try {
  <ul>
   @for (const item of props.items; key item) {
    const selected$ = derived$(() => record$.get());
    <li><Render render={() => @{ const label = item; <p title={label}><output>{selected$.get() as string}</output></p> }} /></li>
   }
  </ul>
 } @pending {
  <i>waiting</i>
 }`,
		false,
	);

	it.each(MODES)(
		"starts one query for a row's derived value read by a render prop ($name)",
		async ({ dev, strong }) => {
			const view = await mountClient(ROW_RENDER_PROP, { dev, strong });
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
		"resumes the server query a row's derived value reads through a render prop ($name)",
		async ({ dev, strong }) => {
			await hydrateServerOutput(ROW_RENDER_PROP, { dev, strong, adoptsOutput: true });
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

	// Card has state of its own and renders the children App passes it. They
	// must compute from App's count$ cell, not a copy that never saw its update.
	it.each(MODES)(
		"computes a children read from the component's cells ($name)",
		async ({ dev, strong }) => {
			const view = await mountClient(
				`import { useState } from 'octane';
import { derived$, query$, signal$ } from 'octane/signals';
function show(state) {
 return state.status === 'ready' ? String(state.value) : state.status;
}
function Card(props) @{
 const [tick, setTick] = useState(0);
 <div>
  <button id="card" onClick={() => setTick(tick + 1)}><output>{String(tick)}</output></button>
  {props.children}
 </div>
}
export function App(props) @{
 const count$ = signal$(1);
 const source$ = query$(() => 'source', props.load);
 const label$ = derived$(() => count$.get() + source$.get());
 <section>
  <button id="count" onClick={() => count$.set(count$.get() + 1)}><output>{String(count$.get())}</output></button>
  <output>{show(label$.snapshot()) as string}</output>
  <Card><output>{show(label$.snapshot()) as string}</output></Card>
 </section>
}`,
				{ dev, strong },
			);
			try {
				expect(view.requests).toHaveLength(1);
				view.click('#count');
				view.click('#card');
				expect(view.texts()).toEqual(['2', 'pending', '1', 'pending']);
				await view.settleAll('value');
				expect(view.texts()).toEqual(['2', '2value', '1', '2value']);
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

	// The Hydrate children a child writes are part of the child's template, so
	// they read a handle prop from the child's cell like its other output.
	it.each(MODES.flatMap((mode) => [false, true].map((split) => ({ ...mode, split }))))(
		"reads a handle prop in a child's Hydrate children from the child's cell (split: $split, $name)",
		async ({ dev, strong, split }) => {
			const view = await mountClient(
				`import { Hydrate } from 'octane';
import { load } from 'octane/hydration';
import { signal$ } from 'octane/signals';
function Child(props) @{
 <article>
  <output>{props.handle$.get() as string}</output>
  <Hydrate when={load()}${split ? '' : ' split={false}'}><button onClick={() => props.handle$.set('written')}><output>{props.handle$.get() as string}</output></button></Hydrate>
 </article>
}
export function App(props) @{
 const result$ = signal$('parent');
 <main><output>{result$.get() as string}</output><Child handle$={result$} /></main>
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
		'a derived producer': {
			setup: '',
			value: 'derived$(() => record$.get())',
			callback: '() => selected$.get()',
		},
		'a wrapped derived producer': {
			setup: '',
			value: "(derived$ as typeof derived$)(() => record$.get(), { key: 'selected' })",
			callback: '() => selected$.get()',
		},
		'a named producer shared with a callback': {
			setup: 'const compute$ = () => record$.get();',
			value: 'derived$(compute$)',
			callback: 'compute$',
		},
		'a nested named producer inside an arrow': {
			setup:
				'const compute$ = () => { const inner$ = () => record$.get(); return derived$(inner$).get(); };',
			value: 'derived$(compute$)',
			callback: '() => record$.get()',
		},
		'a nested named producer inside a declaration': {
			setup:
				'function compute$() { function inner$() { return record$.get(); } return derived$(inner$).get(); }',
			value: 'derived$(compute$)',
			callback: '() => record$.get()',
		},
		'an outside producer read by an arrow and forwarded as a callback': {
			setup:
				'const inner$ = () => record$.get(); const compute$ = () => { record$.get(); return derived$(inner$).get(); };',
			value: 'derived$(compute$)',
			callback: 'inner$',
		},
		'an outside producer read by a declaration and forwarded as a callback': {
			setup:
				'function inner$() { return record$.get(); } function compute$() { record$.get(); return derived$(inner$).get(); }',
			value: 'derived$(compute$)',
			callback: 'inner$',
		},
		'a named query selector shared with a callback': {
			setup: 'const compute$ = () => record$.get();',
			value: 'query$(compute$, async (selection) => selection)',
			callback: 'compute$',
		},
		'a function declaration shared with a callback': {
			setup: 'function compute$() { return record$.get(); }',
			value: 'derived$(compute$)',
			callback: 'compute$',
		},
		'a recursive function declaration shared with a callback': {
			setup:
				'function compute$(_context, depth = 1) { return depth > 0 ? compute$(_context, depth - 1) : record$.get(); }',
			value: 'derived$(compute$)',
			callback: 'compute$',
		},
		'a recursive const arrow shared with a callback': {
			setup:
				'const compute$ = (_context, depth = 1) => depth > 0 ? compute$(_context, depth - 1) : record$.get();',
			value: 'derived$(compute$)',
			callback: 'compute$',
		},
		'a recursive const function shared with a callback': {
			setup:
				'const compute$ = function (_context, depth = 1) { return depth > 0 ? compute$(_context, depth - 1) : record$.get(); };',
			value: 'derived$(compute$)',
			callback: 'compute$',
		},
		'a recursive named function expression with its own binding': {
			setup:
				'const compute$ = function compute$(_context, depth = 1) { return depth > 0 ? compute$(_context, depth - 1) : record$.get(); };',
			value: 'derived$(compute$)',
			callback: 'compute$',
		},
		'a recursive const with a shadowed parameter and shorthand reference': {
			setup:
				"const compute$ = (_context, depth = 1) => { const { compute$: again } = { compute$ }; const offset = ((compute$) => compute$())(() => ''); return depth > 0 ? offset + again(_context, depth - 1) : record$.get(); };",
			value: 'derived$(compute$)',
			callback: 'compute$',
		},
		'a named function expression shared with a callback': {
			setup: 'const compute$ = function read$() { return record$.get(); };',
			value: 'derived$(compute$)',
			callback: 'compute$',
		},
		'a named producer called in a shadowing block': {
			setup: 'const compute$ = () => record$.get();',
			value:
				"(() => { const record$ = query$(() => 'shadow', props.load); return derived$(compute$); })()",
			callback: 'compute$',
		},
		// A namespace receiver behind parentheses or a type assertion is still the
		// trusted import, so its factory's compute argument is still a producer.
		'a named producer behind an asserted namespace receiver': {
			setup: 'const compute$ = () => record$.get();',
			value: '(Signals as typeof Signals).derived$(compute$)',
			callback: 'compute$',
		},
		'an inline producer behind a parenthesized namespace receiver': {
			setup: '',
			value: '(Signals).derived$(() => record$.get())',
			callback: '() => selected$.get()',
		},
	};

	function producerSource(
		producer: (typeof PRODUCERS)[keyof typeof PRODUCERS],
		readers = 1,
		beforeReaders = '',
	) {
		return `import * as Signals from 'octane/signals';
import { derived$, query$ } from 'octane/signals';
function Reader(props) @{
 <>
  <output>{props.selected$.get() as string}</output>
  <output>{props.read() as string}</output>
 </>
}
export function App(props) @{
 const record$ = query$(() => 'record', props.load);
 ${producer.setup}
 const selected$ = ${producer.value};
 @try {
  <section><output>{record$.get() as string}</output>${beforeReaders}${Array.from(
		{ length: readers },
		() => `<Reader selected$={selected$} read={${producer.callback}} />`,
	).join('')}</section>
 } @pending {
  <i>waiting</i>
 }
}`;
	}

	it.each(
		MODES.flatMap((mode) =>
			Object.entries(PRODUCERS).map(([kind, producer]) => ({ kind, producer, ...mode })),
		),
	)(
		'keeps $kind reader-owned beside a forwarded callback ($name)',
		async ({ producer, dev, strong }) => {
			const view = await mountClient(producerSource(producer, 2), { dev, strong });
			try {
				await view.settle('parent');
				await view.settle('left', 1);
				// Each reader must start its own query, even when a nested
				// producer is compiled inside the producer it receives.
				expect(view.requests).toHaveLength(3);
				await view.settle('right', 2);
				await view.flush();
				expect(view.texts()).toEqual(['parent', 'left', 'parent', 'right', 'parent']);
				expect(view.requests).toHaveLength(3);
			} finally {
				view.unmount();
			}
		},
	);

	it.each(
		MODES.flatMap((mode) =>
			['() => record$.get()', 'compute$'].map((producer) => ({ ...mode, producer })),
		),
	)(
		'keeps an explicit scope $producer reader-owned when created by an event ($name)',
		async ({ producer, dev, strong }) => {
			const view = await mountClient(
				`import { useState } from 'octane';
import { query$ } from 'octane/signals';
function Reader(props) @{
 <>
 <output>{props.selected$.get() as string}</output>
 <output>{props.read() as string}</output>
 </>
}
export function App(props) @{
 const record$ = query$(() => 'record', props.load);
 const compute$ = () => record$.get();
 const [selected$, setSelected] = useState(null);
 <section>
 <button onClick={() => setSelected(props.scope.derived$('selection', ${producer}))}>create</button>
 @try {
  <div><output>{record$.get() as string}</output>
   @if (selected$) { <Reader selected$={selected$} read={compute$} /> }
  </div>
 } @pending { <i>waiting</i> }
 </section>
}`,
				{ dev, strong },
				{},
				{},
				true,
			);
			try {
				await view.settleAll('ready');
				view.click('button');
				await view.settleAll('ready');
				await view.settleAll('ready');
				expect(view.texts()).toEqual(['ready', 'ready', 'ready']);
				expect(view.requests).toHaveLength(2);
			} finally {
				view.unmount();
			}
		},
	);

	it.each(
		MODES.flatMap((mode) =>
			[
				'a named producer shared with a callback',
				'a recursive const arrow shared with a callback',
				'a recursive const function shared with a callback',
			].map((kind) => ({ ...mode, kind })),
		),
	)(
		'hydrates two named-producer readers and preserves their declaring callback on update ($name, $kind)',
		async ({ dev, strong, kind }) => {
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
			const text = producerSource(
				PRODUCERS[kind as keyof typeof PRODUCERS],
				2,
				'<small>{props.label as string}</small>',
			);
			const options = {
				id: '/src/signal-declaration-owner.tsrx',
				compileOptions: { dev, strong, hmr: false },
				runtimeModules: { 'octane/signals': signals },
			};
			const serverModule = loadCompiledFixtureSource(text, { ...options, mode: 'server' });
			const clientModule = loadCompiledFixtureSource(text, { ...options, mode: 'client' });
			const results = ['parent', 'left', 'right'];
			let next = 0;
			const serverLoad = vi.fn(async () => results[next++]);
			const browserLoad = vi.fn(async () => 'browser');
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
					{ ...PROPS, load: serverLoad, label: 'initial' },
					{ streamedSignals },
				);
				expect(serverLoad).toHaveBeenCalledTimes(3);
				container.innerHTML = output.html;
				activateStreamedMarkup(container);
				const nodes = [...container.querySelectorAll('output')];
				const label = container.querySelector('small')!;
				const expected = ['parent', 'left', 'parent', 'right', 'parent'];
				expect(nodes.map((node) => node.textContent)).toEqual(expected);
				expect(label.textContent).toBe('initial');
				const errors: unknown[] = [];
				hydration = bootstrapStreamedSignalHydration(streamedSignals);
				const props = { ...PROPS, load: browserLoad, label: 'initial' };
				root = client.hydrateRoot(container, clientModule.App, props, {
					signalOwner: hydration.signalOwner,
					onRecoverableError: (error) => errors.push(error),
					onUncaughtError: (error) => errors.push(error),
				});
				await drainProducers();
				client.flushSync(() => {});
				expect(browserLoad).not.toHaveBeenCalled();
				expect(errors).toEqual([]);
				expect([...container.querySelectorAll('output')]).toEqual(nodes);
				expect(container.querySelector('small')).toBe(label);
				expect(nodes.map((node) => node.textContent)).toEqual(expected);

				client.flushSync(() => root!.render(clientModule.App, { ...props, label: 'updated' }));
				await drainProducers();
				expect(container.querySelector('small')).toBe(label);
				expect(label.textContent).toBe('updated');
				expect([...container.querySelectorAll('output')]).toEqual(nodes);
				expect(nodes.map((node) => node.textContent)).toEqual(expected);
				expect(browserLoad).not.toHaveBeenCalled();
				expect(errors).toEqual([]);
			} finally {
				root?.unmount();
				hydration?.dispose();
				container.remove();
				resetStreamRuntimeGlobals();
			}
		},
	);

	it.each(
		MODES.flatMap((mode) => [
			{ ...mode, body: 'return record$.get();', kind: 'direct' },
			{
				...mode,
				body: 'return depth > 0 ? compute$(_context, depth - 1) : record$.get();',
				kind: 'recursive const',
			},
			{
				...mode,
				body: "const { compute$: again } = { compute$ }; const offset = ((compute$) => compute$())(() => ''); return depth > 0 ? offset + again(_context, depth - 1) : record$.get();",
				kind: 'recursive const shorthand',
			},
			{
				...mode,
				body: 'const inner$ = derived$(() => record$.get()); return inner$.get();',
				kind: 'nested declaration',
			},
		]),
	)(
		'keeps a $kind plain-hook named producer separate from its forwarded callback ($name)',
		async (mode) => {
			const view = await mountClient(
				`
import { useSelection$ } from './use-selection';
function Reader(props) @{
 <>
  <output>{props.selected$.get() as string}</output>
  <output>{props.read() as string}</output>
 </>
}
export function App(props) @{
 const { selected$, compute$ } = useSelection$(props.load);
 @try {
  <section><output>{selected$.get() as string}</output><Reader selected$={selected$} read={compute$} /></section>
 } @pending { <i>waiting</i> }
}`,
				mode,
				{},
				{
					'./use-selection': `import { derived$, query$ } from 'octane/signals';
export function useSelection$(load) {
 const record$ = query$(() => 'record', load);
 const compute$ = (_context, depth = 1) => { ${mode.body} };
 const selected$ = derived$(compute$);
 return { selected$, compute$ };
}`,
				},
			);
			try {
				await view.settleAll('ready');
				await view.settleAll('ready');
				expect(view.texts()).toEqual(['ready', 'ready', 'ready']);
				expect(view.requests).toHaveLength(2);
			} finally {
				view.unmount();
			}
		},
	);

	it.each(
		MODES.flatMap((mode) =>
			[
				{ kind: 'derived', next: 'derived$(compute$)' },
				{ kind: 'query', next: 'query$(compute$, async (selection) => selection)' },
			].flatMap((scenario) =>
				[
					{
						syntax: 'const arrow',
						declaration: 'const compute$ = () =>',
						formal: false,
						local: false,
					},
					{
						syntax: 'function declaration',
						declaration: 'function compute$()',
						formal: false,
						local: false,
					},
					{
						syntax: 'function declaration with a shadowing formal',
						declaration:
							'function compute$(_context, { compute$ } = { compute$: () => ({ value: "formal" }) })',
						formal: true,
						local: false,
					},
					{
						syntax: 'TSRX-local function declaration',
						declaration: 'function compute$()',
						formal: false,
						local: true,
					},
					{
						syntax: 'TSRX-local declaration with a shadowing formal',
						declaration: 'function compute$(_context, [compute$] = [() => ({ value: "formal" })])',
						formal: true,
						local: true,
					},
				].flatMap((shape) =>
					['producer', 'callback'].map((handoff) => ({ ...mode, ...scenario, ...shape, handoff })),
				),
			),
		),
	)(
		'passes a plain $syntax to a nested $kind through its $handoff without changing its callback owner ($name)',
		async (mode) => {
			const selection = `import { derived$, query$ } from 'octane/signals';
export function useSelection$(load) {
 const record$ = query$(() => 'record', load);
 ${mode.declaration} {
  const value = record$.get();
  return { value, next$: value === '${mode.handoff === 'producer' ? 'reader' : 'parent'}' ? ${mode.next} : null };
 };
 const selected$ = derived$(compute$);
 return { selected$, compute$ };
}`;
			const view = await mountClient(
				`${mode.local ? selection : "import { useSelection$ } from './use-selection';"}
function Handoff(props) @{
 <output>{props.next$.get().value as string}</output>
}
function Reader(props) @{
 const producer = props.selected$.get();
 const callback = props.read();
 <>
  <output>{producer.value as string}</output>
  <output>{callback.value as string}</output>
  @if (${mode.handoff}.next$) { <Handoff next$={${mode.handoff}.next$} /> }
 </>
}
export function App(props) @{
 const { selected$, compute$ } = useSelection$(props.load);
 @try {
  <section><output>{selected$.get().value as string}</output><Reader selected$={selected$} read={compute$} /></section>
 } @pending { <i>waiting</i> }
}`,
				mode,
				{},
				mode.local ? {} : { './use-selection': selection },
			);
			try {
				await view.settle('parent');
				expect(view.requests).toHaveLength(2);
				await view.settle('reader', 1);
				if (!mode.formal) {
					expect(view.requests).toHaveLength(3);
					await view.settle('handoff', 2);
				}
				await view.flush();
				expect(view.texts()).toEqual([
					'parent',
					'reader',
					'parent',
					mode.formal ? 'formal' : 'handoff',
				]);
				expect(view.requests).toHaveLength(mode.formal ? 2 : 3);
			} finally {
				view.unmount();
			}
		},
	);

	it.each(MODES)(
		'preserves a function stored as signal data beside a named producer ($name)',
		async (mode) => {
			const view = await mountClient(
				`import { derived$, query$, signal$ } from 'octane/signals';
export function App(props) @{
 const record$ = query$(() => 'record', props.load);
 const compute$ = () => record$.get();
 const saved$ = signal$(compute$);
 const selected$ = derived$(compute$);
 @try {
  <section><output>{selected$.get() as string}</output>
  <output>{String(saved$.get() === compute$)}</output></section>
 } @pending { <i>waiting</i> }
}`,
				mode,
			);
			try {
				await view.settleAll('ready');
				expect(view.texts()).toEqual(['ready', 'true']);
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
