import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, hydrateRoot, type Root } from '../../src/index.js';
import { renderToPipeableStream, renderToString } from 'octane/server';
import * as Signals from 'octane/signals';
import * as HydrationQuery from 'octane/internal/hydration-query';
import { __hydrationSignalRevision } from 'octane/internal/hydration-signal';
import { __captureHydrationInput, __ownedHydrationInputs } from '../../src/hydration-inputs.js';
import {
	activateStreamedMarkup,
	collectReadableStream,
	createPipeableCollector,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';
import * as Client from '../_fixtures/initial-suspense-hydration.tsrx';
import type { AdoptionGate, AdoptionProps } from '../_fixtures/initial-suspense-hydration.tsrx';

const { InitialAdoptionScreen, NestedInitialAdoption } = Client;
const server = loadServerFixture<typeof Client>(
	'packages/octane/tests/_fixtures/initial-suspense-hydration.tsrx',
);
// The adopted content returned directly or through relay components, as one
// section or as a fragment of hosts that render through runtime descriptors.
const SCREENS = [
	'InitialAdoptionScreen',
	'InitialFragmentScreen',
	'InitialSectionRelayScreen',
	'InitialSectionRelayChainScreen',
	'InitialFragmentRelayScreen',
	'InitialFragmentRelayChainScreen',
] as const;
type Screen = (typeof SCREENS)[number];
const cleanups: (() => void)[] = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function gate() {
	let resume!: () => void;
	const value: AdoptionGate = {
		pending: false,
		promise: new Promise<void>((resolve) => {
			resume = resolve;
		}),
	};
	return {
		value,
		resolve() {
			value.pending = false;
			resume();
		},
	};
}
function fulfilled(value: string) {
	return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value });
}
function setup(
	gateInChild: boolean,
	secondGate?: AdoptionGate,
	gatePromise?: Promise<void>,
	screen: Screen = 'InitialAdoptionScreen',
) {
	const waiting = gate();
	if (gatePromise) waiting.value.promise = gatePromise;
	const props: AdoptionProps = {
		gate: waiting.value,
		secondGate,
		gateInChild,
		label: 'server',
		data: fulfilled('server data'),
		siblingData: fulfilled('sibling data'),
		onLifecycle: vi.fn(),
		onRef: vi.fn(),
		onSiblingClick: vi.fn(),
	};
	const container = document.createElement('div');
	document.body.append(container);
	container.innerHTML = renderToString(server[screen], props).html;
	const input = container.querySelector('input')!;
	const sibling = container.querySelector('aside button') as HTMLButtonElement;
	const id = input.id;
	const siblingId = sibling.id;
	input.value = 'user draft';
	input.focus();
	input.setSelectionRange(2, 6);
	// The client's own data arrives only if a test resolves it.
	let resolveData!: (value: string) => void;
	props.data = new Promise((resolve) => (resolveData = resolve));
	props.siblingData = new Promise(() => {});
	waiting.value.pending = true;
	if (secondGate) secondGate.pending = true;
	let root: Root | undefined;
	cleanups.push(() => {
		root?.unmount();
		container.remove();
	});
	const recoverable: unknown[] = [];
	root = hydrateRoot(container, Client[screen], props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	return {
		props,
		container,
		input,
		sibling,
		id,
		siblingId,
		waiting,
		root,
		recoverable,
		resolveData,
	};
}

it('stops issuing invocation provenance after the last initial adoption retires', () => {
	const admitted = () => {
		const env = __captureHydrationInput([{}], 0, [0], true);
		return __ownedHydrationInputs(env, env);
	};
	expect(admitted()).toBe(false);
	const first = setup(false);
	const second = setup(false);
	expect(admitted()).toBe(true);
	first.root.unmount();
	expect(admitted()).toBe(true);
	second.root.unmount();
	expect(admitted()).toBe(false);
});

it('witnesses only canonical writable signal sources without observing unknown values', () => {
	const scope = Signals.createScope({ scopeKey: 'hydration-source-witness' });
	const source$ = scope.signal$('selection', 'first');
	const observe = vi.fn(() => {
		throw new Error('unexpected observation');
	});
	try {
		const initial = __hydrationSignalRevision(source$);
		expect(initial?.[0]).toBe(source$);
		source$.set('second');
		expect(__hydrationSignalRevision(source$)?.[1]).not.toBe(initial?.[1]);
		const arbitrary = new Proxy(
			{},
			{ get: observe, getPrototypeOf: observe, getOwnPropertyDescriptor: observe },
		);
		expect(__hydrationSignalRevision(arbitrary)).toBeUndefined();
		const prototype = Object.getPrototypeOf(source$);
		const get = Object.getOwnPropertyDescriptor(prototype, 'get')!;
		let replaced: unknown;
		try {
			Object.defineProperty(prototype, 'get', { configurable: true, get: observe });
			replaced = __hydrationSignalRevision(source$);
		} finally {
			Object.defineProperty(prototype, 'get', get);
		}
		expect(replaced).toBeUndefined();
		expect(observe).not.toHaveBeenCalled();
	} finally {
		scope.dispose();
	}
});

describe.each([false, true])('parent updates during suspended hydration (dev: %s)', (dev) => {
	it.each([
		'missing optional reader',
		'present optional reader',
		'own undefined',
		'receiver-aware reader',
		'changed optional reader',
		'changed reader',
	] as const)(
		'preserves a suspended arm whose first optional reader is absent: %s',
		async (scenario) => {
			const gateSource = `export function Gate(props) @{
  @try {
    const value = props.optionalReader?.() ?? props.read();
    <input defaultValue={value} />;
  } @pending { <span>Loading</span>; }
}`;
			const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><output>{props.sibling}</output><Gate {...props.gate} /></section>; }`;
			const load = (mode: 'client' | 'server') => {
				const options = { mode, compileOptions: { dev, hmr: false } };
				const gateModule = loadCompiledFixtureSource(gateSource, {
					...options,
					id: '/src/gate.tsrx',
				});
				return loadCompiledFixtureSource(appSource, {
					...options,
					id: '/src/app.tsrx',
					runtimeModules: { './gate': gateModule },
				});
			};
			const server = load('server');
			const client = load('client');
			const waiting = gate();
			const props = {
				sibling: 'waiting',
				gate: {
					read: () => {
						if (waiting.value.pending) throw waiting.value.promise;
						return 'server';
					},
					...(scenario === 'present optional reader'
						? { optionalReader: () => undefined }
						: scenario === 'own undefined'
							? { optionalReader: undefined }
							: scenario === 'receiver-aware reader'
								? {
										optionalReader: function (this: { read: () => string }) {
											return this.read();
										},
									}
								: {}),
				},
			};
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(server['App'], props).html;
			const original = container.querySelector('input')!;
			original.value = 'typed';
			waiting.value.pending = true;
			const onRecoverableError = vi.fn();
			const root = hydrateRoot(container, client['App'], props, { onRecoverableError });
			cleanups.push(() => {
				root.unmount();
				container.remove();
			});
			await act(() =>
				root.render(client['App'], {
					sibling: 'ready',
					gate: {
						...props.gate,
						...(scenario === 'changed optional reader'
							? { optionalReader: () => 'replacement' }
							: {}),
						...(scenario === 'changed reader' ? { read: () => 'replacement' } : {}),
					},
				}),
			);
			const retained = !scenario.startsWith('changed ') && scenario !== 'receiver-aware reader';
			expect(container.querySelector('input') === original).toBe(retained);
			expect(container.querySelector('output')?.textContent).toBe('ready');
			await act(() => waiting.resolve());
			const accepted = container.querySelector('input')!;
			expect(accepted === original).toBe(retained);
			expect(accepted.value).toBe(
				retained ? 'typed' : scenario.startsWith('changed ') ? 'replacement' : 'server',
			);
			expect(onRecoverableError).not.toHaveBeenCalled();
		},
	);

	it.each(['unchanged', 'changed', 'unchanged source', 'changed source'] as const)(
		'handles %s captures before a streamed arm’s first read',
		async (captures) => {
			const sourceBacked = captures.endsWith(' source');
			const scope = Signals.createScope({
				scopeKey: `streamed-reader-${dev}-${captures}`,
			});
			const tick$ = scope.signal$('tick', 0);
			const selection$ = scope.signal$('selection', 'server');
			const gateSource = `${sourceBacked ? "import { derived$ } from 'octane/signals';" : ''}
import { tick$, selection$ } from './selection';
export function Gate(props) @{
  const tick = tick$.get(); void tick;
  ${sourceBacked ? 'const selected$ = derived$(() => selection$.get());' : ''}
  @try {
    const value = ${sourceBacked ? 'props.read(selected$.get())' : 'props.optionalReader?.() ?? props.read()'};
    <input data-stage="ready" defaultValue={value${captures === 'changed' ? ' + tick' : ''}} />;
  } @pending { <input data-stage="pending" defaultValue="Waiting" />; }
}`;
			const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><Gate {...props.gate} /></section>; }`;
			const load = (mode: 'client' | 'server') => {
				const options = { mode, compileOptions: { dev, hmr: false } };
				const gateModule = loadCompiledFixtureSource(gateSource, {
					...options,
					id: '/src/gate.tsrx',
					runtimeModules: {
						'./selection': { tick$, selection$ },
						'octane/signals': Signals,
						'octane/internal/hydration-signal': { __hydrationSignalRevision },
					},
				});
				return loadCompiledFixtureSource(appSource, {
					...options,
					id: '/src/app.tsrx',
					runtimeModules: { './gate': gateModule },
				});
			};
			const server = load('server');
			const client = load('client');
			const serverWait = gate();
			serverWait.value.pending = true;
			const clientWait = gate();
			clientWait.value.pending = true;
			let clientReads = 0;
			const clientRead = (selected = 'server') => {
				clientReads++;
				if (clientWait.value.pending) throw clientWait.value.promise;
				return selected;
			};
			const collector = createPipeableCollector();
			let shellReady!: () => void;
			const shell = new Promise<void>((resolve) => (shellReady = resolve));
			const stream = renderToPipeableStream(
				server['App'],
				{
					gate: {
						read: () => {
							if (serverWait.value.pending) throw serverWait.value.promise;
							return 'server';
						},
					},
				},
				{ onShellReady: shellReady },
			);
			const container = document.createElement('div');
			document.body.append(container);
			let root: Root | undefined;
			cleanups.push(() => {
				root?.unmount();
				stream.abort();
				scope.dispose();
				container.remove();
				resetStreamRuntimeGlobals();
			});
			stream.pipe(collector.destination);
			await shell;
			const shellChunks = collector.chunks.length;
			container.innerHTML = collector.chunks.join('');
			activateStreamedMarkup(container);
			const pending = container.querySelector<HTMLInputElement>('[data-stage="pending"]')!;
			pending.value = 'typed while waiting';
			const onRecoverableError = vi.fn();
			root = hydrateRoot(
				container,
				client['App'],
				{ gate: { read: clientRead } },
				{ onRecoverableError },
			);
			expect(clientReads).toBe(0);
			await act(() => {
				if (captures === 'changed source') selection$.set('replacement');
				tick$.set(1);
			});
			if (captures.startsWith('changed')) {
				expect(container.querySelector('[data-stage="pending"]')).not.toBe(pending);
				expect(clientReads).toBeGreaterThan(0);
			} else {
				expect(container.querySelector('[data-stage="pending"]')).toBe(pending);
				expect(pending.value).toBe('typed while waiting');
				expect(clientReads).toBe(0);
			}

			serverWait.resolve();
			await collector.ended;
			const deliver = () => {
				container.insertAdjacentHTML('beforeend', collector.chunks.slice(shellChunks).join(''));
				activateStreamedMarkup(container);
			};
			if (captures.startsWith('changed')) {
				await act(() => clientWait.resolve());
				const accepted = container.querySelector<HTMLInputElement>('[data-stage="ready"]')!;
				expect(accepted.value).toBe(captures === 'changed source' ? 'replacement' : 'server1');
				await act(deliver);
				expect(container.querySelector('[data-stage="ready"]')).toBe(accepted);
				expect(onRecoverableError).not.toHaveBeenCalled();
				return;
			}
			let revealed!: HTMLInputElement;
			await act(() => {
				deliver();
				revealed = container.querySelector<HTMLInputElement>('[data-stage="ready"]')!;
				revealed.value = 'typed after reveal';
			});
			expect(clientReads).toBeGreaterThan(0);
			expect(container.querySelector('[data-stage="ready"]')).toBe(revealed);
			await act(() => tick$.set(2));
			expect(container.querySelector('[data-stage="ready"]')).toBe(revealed);
			expect(revealed.value).toBe('typed after reveal');
			await act(() => tick$.set(3));
			expect(container.querySelector('[data-stage="ready"]')).toBe(revealed);
			expect(revealed.value).toBe('typed after reveal');
			await act(() => clientWait.resolve());
			expect(container.querySelector('[data-stage="ready"]')).toBe(revealed);
			expect(revealed.value).toBe('typed after reveal');
			expect(onRecoverableError).not.toHaveBeenCalled();
		},
	);

	const optionalUpdates = ['new props', 'same props'] as const;
	it.each(optionalUpdates)('guards changed optional readers (%s)', async (scenario) => {
		const scope = Signals.createScope({ scopeKey: `optional-reader-${dev}-${scenario}` });
		const tick$ = scope.signal$('tick', 0);
		cleanups.push(() => scope.dispose());
		const gateSource = `import { use } from 'octane';
${scenario === 'same props' ? "import { tick$ } from './tick';" : ''}
export function Gate(props) @{
  ${scenario === 'same props' ? 'const tick = tick$.get(); void tick;' : ''}
  @try {
    const value = props.octaneOptionalTestReader?.() ?? props.read();
    const suffix = use(props.seed);
    <input defaultValue={value + suffix} />;
  } @pending { <span>Loading</span>; } @catch (error) { <p>{error.message as string}</p>; }
}`;
		const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><output>{props.sibling}</output><Gate {...props.gate} /></section>; }`;
		const load = (mode: 'client' | 'server') => {
			const options = { mode, compileOptions: { dev, hmr: false } };
			const gateModule = loadCompiledFixtureSource(gateSource, {
				...options,
				id: '/src/gate.tsrx',
				runtimeModules: { './tick': { tick$ } },
			});
			return loadCompiledFixtureSource(appSource, {
				...options,
				id: '/src/app.tsrx',
				runtimeModules: { './gate': gateModule },
			});
		};
		const server = load('server');
		const client = load('client');
		const waiting = gate();
		const read = () => {
			if (waiting.value.pending) throw waiting.value.promise;
			return 'server';
		};
		const props = { sibling: 'waiting', gate: { read, seed: fulfilled('optional-seed') } };
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['App'], props).html;
		const original = container.querySelector('input')!;
		waiting.value.pending = true;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, client['App'], props, { onRecoverableError });
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		let installed = false;
		let getterReads = 0;
		const receivers: unknown[] = [];
		const parse = JSON.parse;
		const spy = vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
			const result = parse(text, reviver);
			if (!installed && text.includes('optional-seed')) {
				installed = true;
				Object.defineProperty(Object.prototype, 'then', {
					configurable: true,
					value: () => {
						throw new Error('adoption control became a wakeable');
					},
				});
				Object.defineProperty(Object.prototype, 'octaneOptionalTestReader', {
					configurable: true,
					get() {
						getterReads++;
						Reflect.deleteProperty(Object.prototype, 'then');
						return function (this: unknown) {
							receivers.push(this);
							throw new Error('application failure');
						};
					},
				});
			}
			return result;
		});
		try {
			await act(() => {
				// A component's own signal update reuses its exact props record.
				if (scenario === 'same props') tick$.set(1);
				else root.render(client['App'], { sibling: 'ready', gate: props.gate });
			});
			expect(installed).toBe(true);
			expect(container.querySelector('input')).not.toBe(original);
			expect(container.querySelector('p')?.textContent).toBe('application failure');
			expect(getterReads).toBe(1);
			expect(receivers).toHaveLength(1);
			expect(receivers[0]).toMatchObject({ read });
			expect(onRecoverableError).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
			Reflect.deleteProperty(Object.prototype, 'then');
			Reflect.deleteProperty(Object.prototype, 'octaneOptionalTestReader');
		}
	});

	it.each([
		['required', 'unrelated'],
		['optional', 'unrelated'],
		['alias', 'unrelated'],
		['optional', 'null selection'],
		['optional', 'changed reader'],
		['optional', 'changed domain'],
		['optional', 'changed selection'],
	] as const)('keeps setup selection semantics (%s, %s)', async (access, update) => {
		const setup =
			access === 'alias'
				? 'const selection = props.selection; const currentId = selection?.id; const active = currentId === props.id;'
				: `const active = props.selection${access === 'optional' ? '?' : ''}.id === props.id;`;
		const gateSource = `export function Gate(props) @{
  ${setup}
  @try {
    const value = props.read();
    <label data-active={active ? "yes" : "no"} data-domain={props.domain}><input defaultValue={value} /></label>;
  } @pending { <p>Loading</p>; }
}`;
		const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><span>{props.ready ? "ready" : "waiting"}</span><Gate {...props.gate} /></section>; }`;
		const load = (mode: 'client' | 'server') => {
			const options = { mode, compileOptions: { dev, hmr: false } };
			const gateModule = loadCompiledFixtureSource(gateSource, {
				...options,
				id: '/src/gate.tsrx',
			});
			return loadCompiledFixtureSource(appSource, {
				...options,
				id: '/src/app.tsrx',
				runtimeModules: { './gate': gateModule },
			});
		};
		const server = load('server');
		const client = load('client');
		const waiting = gate();
		let reads = 0;
		const selection =
			update === 'null selection'
				? null
				: new Proxy(
						{ id: 'same' },
						{
							get(target, key, receiver) {
								if (key === 'id') reads++;
								return Reflect.get(target, key, receiver);
							},
						},
					);
		const props = {
			ready: false,
			gate: {
				selection,
				id: 'same',
				domain: 'original',
				read: () => {
					if (waiting.value.pending) throw waiting.value.promise;
					return 'server';
				},
			},
		};
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['App'], props).html;
		const original = container.querySelector('input')!;
		original.value = 'typed';
		waiting.value.pending = true;
		const root = hydrateRoot(container, client['App'], props);
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		const beforeUpdate = reads;
		const nextGate = {
			...props.gate,
			...(update === 'changed reader' ? { read: () => 'replacement' } : {}),
			...(update === 'changed domain' ? { domain: 'new' } : {}),
			...(update === 'changed selection' ? { selection: { id: 'different' } } : {}),
		};
		await act(() => root.render(client['App'], { ready: true, gate: nextGate }));
		const superseded = update.startsWith('changed ');
		expect(container.querySelector('input') === original).toBe(!superseded);
		expect(container.querySelector('span')?.textContent).toBe('ready');
		expect(reads - beforeUpdate).toBe(
			update === 'null selection' || update === 'changed selection' ? 0 : 1,
		);
		await act(() => waiting.resolve());
		const accepted = container.querySelector('input')!;
		expect(accepted === original).toBe(!superseded);
		expect(accepted.value).toBe(
			update === 'changed reader' ? 'replacement' : superseded ? 'server' : 'typed',
		);
		expect(container.querySelector('label')?.dataset).toMatchObject({
			active: update === 'changed selection' || update === 'null selection' ? 'no' : 'yes',
			domain: update === 'changed domain' ? 'new' : 'original',
		});
	});

	it.each(['same request', 'changed request', 'in-place request'] as const)(
		'keeps the selected request current when its projected value is unchanged: %s',
		async (scenario) => {
			const scope = Signals.createScope({ scopeKey: `same-projection-${dev}-${scenario}` });
			const selection$ = scope.signal$('selection', { id: 'saved', request: 'a' });
			cleanups.push(() => scope.dispose());
			const gateSource = `import { selection$ } from './selection';
export function Gate(props) @{
  const selection = selection$.get();
  const active = selection?.id === props.domain;
  @try {
    const value = active ? props.read() : "inactive";
    <input data-request={value} defaultValue={value} />;
  } @pending { <span>Loading</span>; }
}`;
			const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><output>{props.sibling}</output><Gate {...props.gate} /></section>; }`;
			const load = (mode: 'client' | 'server') => {
				const options = { mode, compileOptions: { dev, hmr: false } };
				const gateModule = loadCompiledFixtureSource(gateSource, {
					...options,
					id: '/src/gate.tsrx',
					runtimeModules: { './selection': { selection$ } },
				});
				return loadCompiledFixtureSource(appSource, {
					...options,
					id: '/src/app.tsrx',
					runtimeModules: { './gate': gateModule },
				});
			};
			const server = load('server');
			const client = load('client');
			const first = gate();
			const second = gate();
			const read$ = () => {
				const request = selection$.get().request;
				const pending = request === 'a' ? first : second;
				if (pending.value.pending) throw pending.value.promise;
				return `request-${request}`;
			};
			const props = {
				sibling: 'waiting',
				gate: { domain: 'saved', read: read$ },
			};
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(server['App'], props).html;
			const original = container.querySelector('input')!;
			original.value = 'typed';
			first.value.pending = second.value.pending = true;
			const onRecoverableError = vi.fn();
			const root = hydrateRoot(container, client['App'], props, { onRecoverableError });
			cleanups.push(() => {
				root.unmount();
				container.remove();
			});
			await act(() => {
				if (scenario === 'changed request') selection$.set({ id: 'saved', request: 'b' });
				if (scenario === 'in-place request') {
					selection$.get().request = 'b';
					second.value.pending = false;
				}
				root.render(client['App'], { ...props, sibling: 'ready' });
			});
			expect(container.querySelector('output')?.textContent).toBe('ready');
			if (scenario !== 'same request') expect(container.querySelector('input')).not.toBe(original);
			if (scenario === 'in-place request')
				expect(container.querySelector('input')?.dataset['request']).toBe('request-b');
			await act(() => first.resolve());
			await act(() => second.resolve());
			const accepted = container.querySelector('input')!;
			expect(accepted.dataset['request']).toBe(
				scenario === 'same request' ? 'request-a' : 'request-b',
			);
			if (scenario !== 'same request') {
				expect(accepted).not.toBe(original);
				expect(accepted.value).toBe('request-b');
			}
			expect(onRecoverableError).not.toHaveBeenCalled();
		},
	);

	it.each([
		{ label: 'unchanged request', request: 'unchanged', streamed: false },
		{ label: 'unchanged guarded request', request: 'unchanged', streamed: false, guarded: true },
		{ label: 'changed guarded request', request: 'changed', streamed: false, guarded: true },
		{ label: 'disabled guard', request: 'guard disabled', streamed: false, guarded: true },
		{ label: 'changed request', request: 'changed', streamed: false },
		{ label: 'restarted request', request: 'restarted', streamed: false },
		{
			label: 'request restarted after the parent update',
			request: 'restarted after update',
			streamed: false,
		},
		{
			label: 'unchanged request revealed by streamed server delivery',
			request: 'unchanged',
			streamed: true,
		},
	] as const)(
		'preserves suspended hydration until the current query completes ($label)',
		async (scenario) => {
			const { request, streamed } = scenario;
			const guardDisabled = request === 'guard disabled';
			const replacementExpected =
				request === 'changed' || request === 'restarted' || request === 'restarted after update';
			const scopeKey = `pending-query-${dev}-${request}-${streamed}`;
			const serverScope = Signals.createScope({ scopeKey });
			const clientScope = Signals.createScope({ scopeKey });
			cleanups.push(() => {
				clientScope.dispose();
				serverScope.dispose();
			});
			const first = gate();
			const replacement = gate();
			const serverWait = streamed ? gate() : undefined;
			let clientAttempt = 0;
			const query = Signals.query(scopeKey, (key: string) => {
				if (key === 'server')
					return serverWait ? serverWait.value.promise.then(() => 'original') : 'original';
				const pending = clientAttempt++ === 0 ? first : replacement;
				return pending.value.promise.then(() => (pending === first ? 'original' : 'replacement'));
			});
			const requestKey$ = clientScope.signal$('request-key', 'original');
			const serverModel = {
				selection$: serverScope.signal$('selection', { id: 'saved' }),
				request$: Signals.createResource(serverScope, 'request', () => query('server')),
			};
			const clientModel = {
				selection$: clientScope.signal$('selection', { id: 'saved' }),
				request$: Signals.createResource(clientScope, 'request', () => query(requestKey$.get())),
			};
			await act(() => {});
			const read =
				'guarded' in scenario ? 'active ? request$.get() : "inactive"' : 'request$.get()';
			const source = `import { selection$, request$ } from './model';
function QueryInput(props) @{
  const selection = selection$.get();
  const active = selection?.id === props.domain;
  @try {
    const value = ${read};
    <label>{value as string}<input disabled={!active} defaultValue={value} ref={props.onRef} /></label>;
  } @pending { <span>Loading</span>; }
}
export function App(props) @{ <section><output>{props.sibling}</output><QueryInput domain={props.domain} onRef={props.onRef} /></section>; }`;
			const load = (mode: 'server' | 'client') =>
				loadCompiledFixtureSource(source, {
					id: '/src/pending-query.tsrx',
					mode,
					compileOptions: { dev, hmr: false },
					runtimeModules: {
						'octane/internal/hydration-query': HydrationQuery,
						'./model': mode === 'server' ? serverModel : clientModel,
					},
				});
			const server = load('server');
			const client = load('client');
			const onRef = vi.fn();
			const props = { sibling: 'waiting', domain: 'saved', onRef };
			const container = document.createElement('div');
			document.body.append(container);
			cleanups.push(() => container.remove());
			let revealQueryArm: (() => Promise<HTMLInputElement>) | undefined;
			if (serverWait) {
				const collector = createPipeableCollector();
				let shellReady!: () => void;
				const shell = new Promise<void>((resolve) => (shellReady = resolve));
				const stream = renderToPipeableStream(server['App'], props, {
					signalOwner: serverScope,
					onShellReady: shellReady,
				});
				cleanups.push(() => {
					stream.abort();
					resetStreamRuntimeGlobals();
				});
				stream.pipe(collector.destination);
				await shell;
				const shellChunks = collector.chunks.length;
				container.innerHTML = collector.chunks.join('');
				activateStreamedMarkup(container);
				revealQueryArm = async () => {
					serverWait.resolve();
					await collector.ended;
					let revealed!: HTMLInputElement;
					await act(() => {
						container.insertAdjacentHTML('beforeend', collector.chunks.slice(shellChunks).join(''));
						activateStreamedMarkup(container);
						revealed = container.querySelector('input')!;
						revealed.value = 'typed';
					});
					return revealed;
				};
			} else {
				container.innerHTML = renderToString(server['App'], props, {
					signalOwner: serverScope,
				}).html;
			}
			const serverInput = container.querySelector('input');
			if (revealQueryArm) expect(serverInput).toBeNull();
			else {
				expect(serverInput).not.toBeNull();
				serverInput!.value = 'typed';
			}
			const onRecoverableError = vi.fn();
			const root = hydrateRoot(container, client['App'], props, {
				signalOwner: clientScope,
				onRecoverableError,
			});
			cleanups.push(() => root.unmount());
			const original = revealQueryArm ? await revealQueryArm() : serverInput!;
			expect(container.querySelector('input')).toBe(original);
			expect(onRef).not.toHaveBeenCalled();
			await act(() => {
				if (request === 'changed') requestKey$.set('replacement');
				if (request === 'restarted') clientModel.request$.retry({ pending: true });
				root.render(client['App'], {
					...props,
					domain: guardDisabled ? 'other' : props.domain,
					sibling: 'ready',
				});
			});
			expect(container.querySelector('output')?.textContent).toBe('ready');
			if (request === 'unchanged' || request === 'restarted after update') {
				expect(container.querySelector('input')).toBe(original);
				expect(original.value).toBe('typed');
			}
			if (request === 'restarted after update')
				await act(() => clientModel.request$.retry({ pending: true }));
			await act(() => first.resolve());
			if (replacementExpected) {
				expect(onRef).not.toHaveBeenCalled();
				await act(() => replacement.resolve());
			}
			const accepted = container.querySelector('input')!;
			const expected = guardDisabled
				? 'inactive'
				: replacementExpected
					? 'replacement'
					: 'original';
			expect(container.querySelector('label')?.textContent).toBe(expected);
			if (request === 'unchanged') {
				expect(accepted).toBe(original);
				expect(accepted.value).toBe('typed');
			} else if ('guarded' in scenario) {
				expect(accepted).not.toBe(original);
				expect(accepted.value).toBe(expected);
			}
			expect(onRef).toHaveBeenCalledExactlyOnceWith(accepted);
			expect(onRecoverableError).not.toHaveBeenCalled();
		},
	);

	it.each(['later', 'alternate'])('discards stale query content (%s read)', async (scenario) => {
		const alternate = scenario === 'alternate';
		const scopeKey = `later-query-restart-${dev}-${scenario}`;
		const waiting = gate();
		const createModel$ = (side: 'server' | 'client') => {
			const scope = Signals.createScope({ scopeKey });
			cleanups.push(() => scope.dispose());
			const earlierSeed = scope.serialize();
			let attempt = 0;
			const query = Signals.query(scopeKey, () => {
				if (side === 'server' || attempt++ === 0) return 'original';
				return waiting.value.promise.then(() => 'replacement');
			});
			return {
				scope,
				earlierSeed,
				selection$: scope.signal$('selection', { id: 'saved' }),
				request$: Signals.createResource(scope, 'request', () => query()),
			};
		};
		const serverModel = createModel$('server');
		const clientModel = createModel$('client');
		await act(() => {});
		// The root can present the server's ready query, but an earlier embedding
		// snapshot without that query must read the newer live attempt.
		const earlierFrame = clientModel.scope.beginAdoption(clientModel.earlierSeed);
		cleanups.push(() => earlierFrame.release());
		const clientReadFresh = vi.fn((value: string) =>
			value === 'original' ? earlierFrame.run(() => clientModel.request$.get()) : value,
		);
		const initialRead = alternate
			? 'active ? request$.get() : readFresh(request$.get())'
			: 'request$.get()';
		const source = `import { selection$, request$, readFresh } from './model';
function QueryInput(props) @{
  const selection = selection$.get();
  const active = selection?.id === props.domain;
  @try {
    const value = ${initialRead};
    const fresh = ${alternate ? 'value' : 'readFresh(value)'};
    <label>{fresh as string}<input disabled={!active} defaultValue={fresh} ref={props.onRef} /></label>;
  } @pending { <span>Loading</span>; }
}
export function App(props) @{ <section><output>{props.sibling}</output><QueryInput domain={props.domain} onRef={props.onRef} /></section>; }`;
		const load = (mode: 'server' | 'client') =>
			loadCompiledFixtureSource(source, {
				id: '/src/ready-query-restart.tsrx',
				mode,
				compileOptions: { dev, hmr: false },
				runtimeModules: {
					'octane/internal/hydration-query': HydrationQuery,
					'./model':
						mode === 'server'
							? { ...serverModel, readFresh: (value: string) => value }
							: { ...clientModel, readFresh: clientReadFresh },
				},
			});
		const server = load('server');
		const client = load('client');
		const onRef = vi.fn();
		const props = { sibling: 'waiting', domain: alternate ? 'other' : 'saved', onRef };
		const container = document.createElement('div');
		document.body.append(container);
		cleanups.push(() => container.remove());
		container.innerHTML = renderToString(server['App'], props, {
			signalOwner: serverModel.scope,
		}).html;
		const original = container.querySelector('input')!;
		original.value = 'typed for original';
		clientModel.request$.retry({ pending: true });
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, client['App'], props, {
			signalOwner: clientModel.scope,
			onRecoverableError,
		});
		cleanups.push(() => root.unmount());
		expect(clientReadFresh).toHaveBeenCalledWith('original');
		expect(container.querySelector('input')).toBe(original);
		expect(onRef).not.toHaveBeenCalled();
		await act(() => root.render(client['App'], { ...props, sibling: 'ready' }));
		expect(container.querySelector('output')?.textContent).toBe('ready');
		expect(container.querySelector('input')).not.toBe(original);
		await act(() => waiting.resolve());
		const accepted = container.querySelector('input')!;
		expect(container.querySelector('label')?.textContent).toBe('replacement');
		expect(accepted.value).toBe('replacement');
		expect(onRef).toHaveBeenCalledExactlyOnceWith(accepted);
		expect(onRecoverableError).not.toHaveBeenCalled();
	});

	it('publishes the latest layout callback only after the adopted arm commits', async () => {
		const gateSource = `import { useLayoutEffect } from 'octane';
export function Gate(props) @{
  const active = props.selection?.id === props.id;
  @try {
    const value = props.read();
    useLayoutEffect(() => { props.onReady?.(value); });
    const suffix = props.second();
    <label data-domain={props.domain} data-active={active ? "yes" : "no"} data-suffix={suffix}><input defaultValue={value} ref={props.onRef} /></label>;
  } @pending { <p>Loading</p>; }
}`;
		const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><span>{props.ready ? "ready" : "waiting"}</span><Gate {...props.gate} /></section>; }`;
		const load = (mode: 'client' | 'server') => {
			const options = { mode, compileOptions: { dev, hmr: false } };
			const gateModule = loadCompiledFixtureSource(gateSource, {
				...options,
				id: '/src/gate.tsrx',
			});
			return loadCompiledFixtureSource(appSource, {
				...options,
				id: '/src/app.tsrx',
				runtimeModules: { './gate': gateModule },
			});
		};
		const server = load('server');
		const client = load('client');
		const first = gate();
		const second = gate();
		const firstReady = vi.fn();
		const onRef = vi.fn();
		const calls: { receiver: unknown; value: string }[] = [];
		function latestReady(this: unknown, value: string) {
			calls.push({ receiver: this, value });
		}
		const props = {
			ready: false,
			gate: {
				selection: { id: 'same' },
				id: 'same',
				domain: 'original',
				onReady: firstReady,
				onRef,
				read: () => {
					if (first.value.pending) throw first.value.promise;
					return 'server';
				},
				second: () => {
					if (second.value.pending) throw second.value.promise;
					return 'ready';
				},
			},
		};
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['App'], props).html;
		const original = container.querySelector('input')!;
		original.value = 'typed';
		first.value.pending = second.value.pending = true;
		const root = hydrateRoot(container, client['App'], props);
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		await act(() =>
			root.render(client['App'], { ready: true, gate: { ...props.gate, onReady: latestReady } }),
		);
		expect(container.querySelector('input')).toBe(original);
		expect(container.querySelector('span')?.textContent).toBe('ready');
		await act(() => first.resolve());
		expect(container.querySelector('input')).toBe(original);
		expect(firstReady).not.toHaveBeenCalled();
		expect(calls).toHaveLength(0);
		expect(onRef).not.toHaveBeenCalled();
		await act(() => second.resolve());
		expect(container.querySelector('input')).toBe(original);
		expect(original.value).toBe('typed');
		expect(firstReady).not.toHaveBeenCalled();
		expect(calls).toEqual([
			{
				receiver: expect.objectContaining({ onReady: latestReady, domain: 'original' }),
				value: 'server',
			},
		]);
		expect(onRef).toHaveBeenCalledOnce();
		expect(onRef).toHaveBeenCalledWith(original);
	});

	it.each(['unrelated', 'new selection', 'changed reader', 'changed domain', 'rejected'] as const)(
		'retries a selected request with a guarded layout callback: %s',
		async (scenario) => {
			const gateSource = `import { useLayoutEffect } from 'octane';
export function Gate(props) @{
  const selection = props.selection;
  const active = selection?.id === props.domain;
  @try {
    const value = active ? props.read() : "inactive";
    const detail = props.detail;
    useLayoutEffect(() => { if (active) { props.onReady?.(value, value, detail?.nested?.value); } });
    const stage = props.second();
    <label data-domain={props.domain} data-stage={stage}><input defaultValue={value} ref={props.onRef} /></label>;
  } @pending { <p>Loading</p>; } @catch (error) {
    useLayoutEffect(() => { props.onReady?.(null); });
    <p role="alert">{error.message}</p>;
  }
}`;
			const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><span>{props.ready ? "ready" : "waiting"}</span><Gate {...props.gate} /></section>; }`;
			const load = (mode: 'client' | 'server') => {
				const options = { mode, compileOptions: { dev, hmr: false } };
				const gateModule = loadCompiledFixtureSource(gateSource, {
					...options,
					id: '/src/gate.tsrx',
				});
				return loadCompiledFixtureSource(appSource, {
					...options,
					id: '/src/app.tsrx',
					runtimeModules: { './gate': gateModule },
				});
			};
			const server = load('server');
			const client = load('client');
			const first = gate();
			const second = gate();
			const firstReady = vi.fn();
			const onRef = vi.fn();
			const calls: { receiver: unknown; args: (string | null)[] }[] = [];
			function latestReady(this: unknown, ...args: (string | null)[]) {
				calls.push({ receiver: this, args });
			}
			let detailReads = 0;
			let rejected = false;
			const initial = {
				domain: 'original',
				selection: { id: 'original' } as { id: string } | null,
				detail: {
					get nested() {
						detailReads++;
						return { value: 'effect' };
					},
				},
				onReady: firstReady,
				onRef,
				read: () => {
					if (first.value.pending) throw first.value.promise;
					return 'server';
				},
				second: () => {
					if (second.value.pending) throw second.value.promise;
					if (rejected) throw new Error('rejected request');
					return 'ready';
				},
			};
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(server['App'], { ready: false, gate: initial }).html;
			const original = container.querySelector('input')!;
			original.value = 'typed';
			first.value.pending = second.value.pending = true;
			const root = hydrateRoot(container, client['App'], { ready: false, gate: initial });
			cleanups.push(() => {
				root.unmount();
				container.remove();
			});
			const next = { ...initial, onReady: latestReady };
			if (scenario === 'changed reader') next.read = () => 'replacement';
			if (scenario === 'changed domain') next.domain = 'other';
			await act(() => {
				if (scenario === 'new selection') next.selection = null;
				root.render(client['App'], { ready: true, gate: next });
			});
			expect(container.querySelector('input') === original).toBe(
				scenario === 'unrelated' || scenario === 'rejected',
			);
			expect(container.querySelector('span')?.textContent).toBe('ready');
			expect(detailReads).toBe(0);
			await act(() => first.resolve());
			expect(detailReads).toBe(0);
			expect(calls).toHaveLength(0);
			expect(onRef).not.toHaveBeenCalled();
			await act(() => {
				rejected = scenario === 'rejected';
				second.resolve();
			});
			if (rejected) {
				expect(container.querySelector('[role="alert"]')?.textContent).toBe('rejected request');
				expect(calls).toEqual([
					{ receiver: expect.objectContaining({ onReady: latestReady }), args: [null] },
				]);
				expect(detailReads).toBe(0);
				expect(firstReady).not.toHaveBeenCalled();
				expect(onRef).not.toHaveBeenCalled();
				return;
			}
			const accepted = container.querySelector('input')!;
			expect(accepted === original).toBe(scenario === 'unrelated');
			expect(accepted.value).toBe(
				scenario === 'unrelated'
					? 'typed'
					: scenario === 'changed reader'
						? 'replacement'
						: 'inactive',
			);
			expect(firstReady).not.toHaveBeenCalled();
			expect(calls).toEqual(
				scenario === 'unrelated' || scenario === 'changed reader'
					? [
							{
								receiver: expect.objectContaining({ onReady: latestReady }),
								args: [
									...Array(2).fill(scenario === 'unrelated' ? 'server' : 'replacement'),
									'effect',
								],
							},
						]
					: [],
			);
			expect(detailReads).toBe(scenario === 'unrelated' || scenario === 'changed reader' ? 1 : 0);
			expect(onRef).toHaveBeenCalledExactlyOnceWith(accepted);
			expect(container.querySelector('label')?.dataset['domain']).toBe(
				scenario === 'changed domain' ? 'other' : 'original',
			);
		},
	);

	it.each([
		'no update',
		'unrelated update',
		'changed nonblocking',
		'changed reader',
		'changed domain',
		'changed selection',
	] as const)('retains a module-derived single blocker: %s', async (scenario) => {
		const scope = Signals.createScope({ scopeKey: `single-blocker-${dev}-${scenario}` });
		const selection$ = scope.signal$('selection', 'server');
		cleanups.push(() => scope.dispose());
		const gateSource = `import { useEffect } from 'octane';
import { derived$ } from 'octane/signals';
import { selection$ } from './selection';
export function Gate(props) @{
  const seed = props.seed;
  void seed;
  const selected$ = derived$(() => selection$.get());
  @try {
    const value = props.read(selected$.get());
    useEffect(() => { props.lifecycle('mount'); return () => props.lifecycle('cleanup'); }, []);
    <label data-domain={props.domain}><input defaultValue={value} ref={props.onRef} /></label>;
  } @pending { <p>Loading</p>; }
}`;
		const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><span>{props.ready ? "ready" : "waiting"}</span><Gate {...props.gate} /></section>; }`;
		const load = (mode: 'client' | 'server') => {
			const options = { mode, compileOptions: { dev, hmr: false } };
			const gateModule = loadCompiledFixtureSource(gateSource, {
				...options,
				id: '/src/gate.tsrx',
				runtimeModules: {
					'octane/signals': Signals,
					'octane/internal/hydration-signal': { __hydrationSignalRevision },
					'./selection': { selection$ },
				},
			});
			return loadCompiledFixtureSource(appSource, {
				...options,
				id: '/src/app.tsrx',
				runtimeModules: { './gate': gateModule },
			});
		};
		const server = load('server');
		const client = load('client');
		const waiting = gate();
		const lifecycle = vi.fn();
		const nextLifecycle = vi.fn();
		const onRef = vi.fn();
		const props = {
			ready: false,
			gate: {
				seed: { marker: 'first' },
				domain: 'first',
				read: (value: string) => {
					if (waiting.value.pending) throw waiting.value.promise;
					return value;
				},
				lifecycle,
				onRef,
			},
		};
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['App'], props).html;
		const original = container.querySelector('input')!;
		original.value = 'typed';
		waiting.value.pending = true;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, client['App'], props, { onRecoverableError });
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		if (scenario !== 'no update') {
			let nextGate = props.gate;
			if (scenario === 'changed reader') nextGate = { ...nextGate, read: () => 'replacement' };
			if (scenario === 'changed domain') nextGate = { ...nextGate, domain: 'next' };
			if (scenario === 'changed nonblocking')
				nextGate = { ...nextGate, seed: { marker: 'next' }, lifecycle: nextLifecycle };
			await act(() => {
				if (scenario === 'changed selection') selection$.set('next');
				root.render(client['App'], { ready: true, gate: nextGate });
			});
		}
		const changed =
			scenario === 'changed reader' ||
			scenario === 'changed domain' ||
			scenario === 'changed selection';
		expect(container.querySelector('input') === original).toBe(!changed);
		expect(container.querySelector('span')?.textContent).toBe(
			scenario === 'no update' ? 'waiting' : 'ready',
		);
		await act(() => waiting.resolve());
		const accepted = container.querySelector('input');
		expect(accepted === original).toBe(!changed);
		expect(accepted?.value).toBe(
			scenario === 'changed reader'
				? 'replacement'
				: scenario === 'changed selection'
					? 'next'
					: changed
						? 'server'
						: 'typed',
		);
		expect(container.querySelector('label')?.getAttribute('data-domain')).toBe(
			scenario === 'changed domain' ? 'next' : 'first',
		);
		await act(() => root.unmount());
		const active = scenario === 'changed nonblocking' ? nextLifecycle : lifecycle;
		const stale = scenario === 'changed nonblocking' ? lifecycle : nextLifecycle;
		expect(active.mock.calls.map(([event]) => event)).toEqual(['mount', 'cleanup']);
		expect(stale).not.toHaveBeenCalled();
		expect(onRef.mock.calls.map(([node]) => node)).toEqual([accepted, null]);
		expect(onRecoverableError).not.toHaveBeenCalled();
	});

	it.each(['resolve', 'changed nonblocking', 'changed reader', 'error'] as const)(
		'keeps imported spread hydration atomic through a derived read: %s',
		async (scenario) => {
			const gateSource = `import { useEffect } from 'octane';
import { derived$ } from 'octane/signals';
function Secondary(props) @{ <output>{props.read()}</output>; }
export function Gate(props) @{
  const seed = props.seed;
  void seed;
  const selected$ = derived$(() => props.first());
  @try {
    const value = selected$.get();
    useEffect(() => { props.lifecycle('mount'); return () => props.lifecycle('cleanup'); }, []);
    <label><input defaultValue={value} ref={props.onRef} /><Secondary read={props.second} /></label>;
  } @pending { <p>Loading</p>; } @catch (error) { <p role="alert">{error.message}</p>; }
}`;
			const appSource = `import { Gate } from './gate';
export function App(props) @{ <section><span>{props.revision}</span><i>{props.ready ? "ready" : "waiting"}</i><Gate {...props.gate} /></section>; }`;
			const load = (mode: 'client' | 'server') => {
				const compileOptions = { dev, hmr: false };
				const gateModule = loadCompiledFixtureSource(gateSource, {
					id: '/src/gate.tsrx',
					mode,
					compileOptions,
					runtimeModules: { 'octane/signals': Signals },
				});
				return loadCompiledFixtureSource(appSource, {
					id: '/src/app.tsrx',
					mode,
					compileOptions,
					runtimeModules: { './gate': gateModule },
				});
			};
			const server = load('server');
			const client = load('client');
			const first = gate();
			const second = gate();
			const lifecycle = vi.fn();
			const nextLifecycle = vi.fn();
			const onRef = vi.fn();
			const props = {
				revision: 'first',
				ready: false,
				gate: {
					seed: { marker: 'initial' },
					first: () => {
						if (first.value.pending) throw first.value.promise;
						return 'server';
					},
					second: () => {
						if (second.value.pending) throw second.value.promise;
						if (second.value.error) throw second.value.error;
						return 'ready';
					},
					lifecycle,
					onRef,
				},
			};
			const container = document.createElement('div');
			document.body.append(container);
			container.innerHTML = renderToString(server['App'], props).html;
			const input = container.querySelector('input')!;
			input.value = 'typed';
			first.value.pending = second.value.pending = true;
			const onRecoverableError = vi.fn();
			const root = hydrateRoot(container, client['App'], props, { onRecoverableError });
			cleanups.push(() => {
				root.unmount();
				container.remove();
			});
			await act(() =>
				root.render(client['App'], {
					...props,
					revision: 'second',
					ready: true,
					gate:
						scenario === 'changed reader'
							? { ...props.gate, first: () => 'replacement' }
							: scenario === 'changed nonblocking'
								? { ...props.gate, seed: { marker: 'next' }, lifecycle: nextLifecycle }
								: props.gate,
				}),
			);
			if (scenario === 'changed reader') expect(container.querySelector('input')).not.toBe(input);
			else {
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('typed');
			}
			expect(container.querySelector('span')?.textContent).toBe('second');
			expect(container.querySelector('i')?.textContent).toBe('ready');
			await act(() => first.resolve());
			expect(lifecycle).not.toHaveBeenCalled();
			expect(nextLifecycle).not.toHaveBeenCalled();
			expect(onRef).not.toHaveBeenCalled();
			if (scenario !== 'changed reader') {
				expect(container.querySelector('input')).toBe(input);
				expect(input.value).toBe('typed');
			}
			if (scenario === 'error') second.value.error = new Error('unavailable');
			await act(() => second.resolve());
			if (scenario === 'error') {
				expect(container.querySelector('[role="alert"]')?.textContent).toBe('unavailable');
				expect(container.querySelector('input')).toBeNull();
			} else {
				const accepted = container.querySelector('input');
				expect(accepted === input).toBe(scenario !== 'changed reader');
				expect(accepted?.value).toBe(scenario !== 'changed reader' ? 'typed' : 'replacement');
				expect(
					(scenario === 'changed nonblocking' ? nextLifecycle : lifecycle).mock.calls.map(
						([event]) => event,
					),
				).toEqual(['mount']);
				expect(onRef.mock.calls.map(([node]) => node)).toEqual([accepted]);
			}
			await act(() => root.unmount());
			expect(
				(scenario === 'changed nonblocking' ? nextLifecycle : lifecycle).mock.calls.map(
					([event]) => event,
				),
			).toEqual(scenario === 'error' ? [] : ['mount', 'cleanup']);
			if (scenario === 'changed nonblocking') expect(lifecycle).not.toHaveBeenCalled();
			expect(onRef.mock.calls.map(([node]) => (node === null ? 'clear' : 'attach'))).toEqual(
				scenario === 'error' ? [] : ['attach', 'clear'],
			);
			expect(onRecoverableError).not.toHaveBeenCalled();
		},
	);

	it.each([
		['private boundary', 'unchanged'],
		['private boundary', 'changed reader'],
		['private boundary', 'changed receiver'],
		['private boundary', 'rewritten receiver'],
		['exported with setup', 'unchanged'],
		['exported with setup', 'changed reader'],
		['exported with setup', 'changed receiver'],
		['exported with setup', 'rewritten receiver'],
		['exported with setup', 'changed setup'],
	] as const)('%s, %s child inputs', async (shape, scenario) => {
		const exported = shape === 'exported with setup';
		const source = `const _$__sameHydrationInput = '!';
${exported ? 'export ' : ''}function Gate(props) @{
  ${exported ? 'const caption = props.caption;' : ''}
  @try {
    const value = props.read();
    <label><input defaultValue={value} /><button>{${exported ? 'caption' : 'props.caption'} + _$__sameHydrationInput}</button></label>;
  } @pending { <p>Loading</p>; }
}
export function App(props) @{
  <section><span>{props.revision}</span><Gate read={props.read} caption={props.caption} version={props.version} /></section>;
}`;
		const options = { id: '/suspended-hydration.tsrx', compileOptions: { dev, hmr: false } };
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const waiting = gate();
		const replacement = () => 'replacement';
		const read =
			scenario === 'rewritten receiver'
				? function (this: { read: () => string }) {
						if (waiting.value.pending) {
							this.read = replacement;
							throw waiting.value.promise;
						}
						return 'server';
					}
				: scenario === 'changed receiver'
					? function (this: { version: string }) {
							if (this.version === 'server' && waiting.value.pending) throw waiting.value.promise;
							return this.version;
						}
					: () => {
							if (waiting.value.pending) throw waiting.value.promise;
							return 'server';
						};
		const props = { revision: 'first', read, caption: 'Action', version: 'server' };
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['App'], props).html;
		const original = container.querySelector('input')!;
		original.value = 'typed';
		waiting.value.pending = true;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, client['App'], props, { onRecoverableError });
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		await act(() => {});
		expect(container.querySelector('input')).toBe(original);
		if (scenario === 'changed setup') waiting.value.pending = false;
		await act(() =>
			root.render(client['App'], {
				...props,
				revision: 'second',
				read:
					scenario === 'changed reader' || scenario === 'rewritten receiver' ? replacement : read,
				caption: scenario === 'changed setup' ? 'Updated' : props.caption,
				version: scenario === 'changed receiver' ? 'replacement' : 'server',
			}),
		);
		const changed = scenario !== 'unchanged';
		const accepted = container.querySelector('input');
		expect(accepted === original).toBe(!changed);
		const value = scenario === 'changed setup' ? 'server' : changed ? 'replacement' : 'typed';
		expect(accepted?.value).toBe(value);
		if (scenario === 'changed setup')
			expect(container.querySelector('button')?.textContent).toBe('Updated!');
		expect(container.querySelector('span')?.textContent).toBe('second');
		await act(() => waiting.resolve());
		expect(container.querySelector('input')).toBe(accepted);
		expect(accepted?.value).toBe(value);
		expect(onRecoverableError).not.toHaveBeenCalled();
	});
});

it.each(['resolve', 'error'] as const)(
	'handles a %s after a parent update and two wakeables without publishing abandoned work',
	async (outcome) => {
		const source = `import { useEffect } from 'octane';
function Second(props) @{ <output>{props.read()}</output>; }
export function Gate(props) @{
  const ref = props.onRef;
  @try {
    const value = props.first();
    useEffect(() => { props.lifecycle('mount'); return () => props.lifecycle('cleanup'); }, []);
    <label><input defaultValue={value} ref={ref} /><Second read={props.second} /></label>;
  } @pending { <p>Loading</p>; } @catch (error) { <p role="alert">{error.message}</p>; }
}
export function App(props) @{
  <section><span>{props.revision}</span><Gate first={props.first} second={props.second} lifecycle={props.lifecycle} onRef={props.onRef} /></section>;
}`;
		const options = { id: '/suspended-hydration-capture.tsrx', compileOptions: { hmr: false } };
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const first = gate();
		const second = gate();
		const events: string[] = [];
		const onRef = vi.fn();
		const props = {
			revision: 'first',
			first: () => {
				if (first.value.pending) throw first.value.promise;
				return 'server';
			},
			second: () => {
				if (second.value.pending) throw second.value.promise;
				if (second.value.error) throw second.value.error;
				return 'ready';
			},
			lifecycle: (event: string) => events.push(event),
			onRef,
		};
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['App'], props).html;
		const input = container.querySelector('input')!;
		input.value = 'typed';
		first.value.pending = second.value.pending = true;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, client['App'], props, { onRecoverableError });
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		await act(() => root.render(client['App'], { ...props, revision: 'second' }));
		await act(() => first.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('typed');
		expect(container.querySelector('span')?.textContent).toBe('second');
		expect(events).toEqual([]);
		expect(onRef).not.toHaveBeenCalled();
		await act(() => {
			if (outcome === 'error') second.value.error = new Error('unavailable');
			second.resolve();
		});
		if (outcome === 'error') {
			expect(container.querySelector('[role="alert"]')?.textContent).toBe('unavailable');
			expect(container.querySelector('input')).toBeNull();
			expect(events).toEqual([]);
			expect(onRef).not.toHaveBeenCalled();
			expect(onRecoverableError).not.toHaveBeenCalled();
			return;
		}
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('typed');
		expect(events).toEqual(['mount']);
		expect(onRef).toHaveBeenCalledExactlyOnceWith(input);
		expect(onRecoverableError).not.toHaveBeenCalled();
		await act(() => root.unmount());
		expect(events).toEqual(['mount', 'cleanup']);
		expect(onRef.mock.calls.map(([node]) => node)).toEqual([input, null]);
	},
);

it.each(['direct exported props', 'opaque captured receiver'] as const)(
	'does not inspect %s when new inputs supersede hydration',
	async (scenario) => {
		const source =
			scenario === 'direct exported props'
				? `export function Gate(props) @{
  const caption = props.caption;
  @try { const value = props.read(); <input aria-label={caption} defaultValue={value} />; }
  @pending { <p>Loading</p>; }
}
export function App(props) @{ <section><Gate read={props.read} caption={props.caption} /></section>; }`
				: `export function Gate({ input }) @{
  @try { const value = input.read(); <input defaultValue={value} />; }
  @pending { <p>Loading</p>; }
}`;
		const options = { id: '/opaque-hydration-input.tsrx', compileOptions: { hmr: false } };
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const waiting = gate();
		const descriptorRead = () => 'descriptor';
		const getOwnPropertyDescriptor = vi.fn(Reflect.getOwnPropertyDescriptor);
		const input = (read: () => string) =>
			new Proxy(
				{ read: descriptorRead },
				{
					get: (_target, key) => (key === 'read' ? read : key === 'caption' ? 'Value' : undefined),
					getOwnPropertyDescriptor,
				},
			);
		const previous = input(() => {
			if (waiting.value.pending) throw waiting.value.promise;
			return 'server';
		});
		const props = (value: ReturnType<typeof input>) =>
			scenario === 'direct exported props' ? value : { input: value };
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['Gate'], props(previous)).html;
		const original = container.querySelector('input')!;
		original.value = 'typed';
		waiting.value.pending = true;
		const root = hydrateRoot(container, client['Gate'], props(previous));
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		await act(() => root.render(client['Gate'], props(input(() => 'replacement'))));
		const replacement = container.querySelector('input');
		expect(replacement).not.toBe(original);
		expect(replacement?.value).toBe('replacement');
		expect(getOwnPropertyDescriptor).not.toHaveBeenCalled();
		await act(() => waiting.resolve());
		expect(container.querySelector('input')).toBe(replacement);
	},
);

it.each(['accessor', 'proxy prototype'] as const)(
	'does not inspect a %s installed by a suspended method',
	async (mutation) => {
		const source = `function Gate(props) @{
  @try { const value = props.read(); <input defaultValue={value} />; }
  @pending { <p>Loading</p>; } @catch (error) { <p role="alert">{error.message}</p>; }
}
export function App(props) @{ <section><span>{props.revision}</span><Gate read={props.read} /></section>; }`;
		const options = { id: '/mutated-hydration-input.tsrx', compileOptions: { hmr: false } };
		const server = loadCompiledFixtureSource(source, { ...options, mode: 'server' });
		const client = loadCompiledFixtureSource(source, { ...options, mode: 'client' });
		const waiting = gate();
		const probe = vi.fn(() => {
			throw new Error('comparison invoked user code');
		});
		let phase: 'server' | 'pending' | 'error' = 'server';
		const props = {
			revision: 'first',
			read: function (this: object) {
				if (phase === 'pending') {
					if (mutation === 'accessor')
						Object.defineProperty(this, 'read', { get: probe, configurable: true });
					else {
						Reflect.deleteProperty(this, 'read');
						Object.setPrototypeOf(this, new Proxy({}, { has: probe, get: probe }));
					}
					throw waiting.value.promise;
				}
				if (phase === 'error') throw new Error('application error');
				return 'server';
			},
		};
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['App'], props).html;
		phase = 'pending';
		const root = hydrateRoot(container, client['App'], props);
		cleanups.push(() => {
			root.unmount();
			container.remove();
		});
		phase = 'error';
		await act(() => root.render(client['App'], { ...props, revision: 'second' }));
		expect(container.querySelector('[role="alert"]')?.textContent).toBe('application error');
		expect(container.querySelector('span')?.textContent).toBe('second');
		expect(probe).not.toHaveBeenCalled();
		await act(() => waiting.resolve());
		expect(container.querySelector('[role="alert"]')?.textContent).toBe('application error');
	},
);

describe.each([false, true])('initial suspended hydration (gate in child: %s)', (gateInChild) => {
	it('preserves drafts, IDs and data while committing outside siblings', async () => {
		const { props, container, input, sibling, id, siblingId, waiting } = setup(gateInChild);
		await act(() => {});
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('user draft');
		expect(document.activeElement).toBe(input);
		expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
		expect(props.onLifecycle).not.toHaveBeenCalled();
		expect(props.onRef).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain('Loading');
		await act(() => sibling.click());
		expect(props.onSiblingClick).toHaveBeenCalledOnce();
		expect(sibling.textContent).toBe('sibling data');
		await act(() => waiting.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(input.id).toBe(id);
		expect(sibling.id).toBe(siblingId);
		expect(id).not.toBe(siblingId);
		expect(container.querySelector('label')!.htmlFor).toBe(id);
		expect(container.querySelector('output')!.textContent).toBe('server data');
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:server');
		expect(props.onRef).toHaveBeenCalledExactlyOnceWith(input);
		const button = container.querySelector('section button') as HTMLButtonElement;
		await act(() => button.click());
		expect(button.textContent).toBe('1');
	});

	it('retries multiple gates without publishing abandoned effects or refs', async () => {
		const second = gate();
		const { props, container, input, waiting, root } = setup(gateInChild, second.value);
		await act(() => waiting.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(props.onLifecycle).not.toHaveBeenCalled();
		expect(props.onRef).not.toHaveBeenCalled();
		await act(() => second.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:server');
		expect(props.onRef).toHaveBeenCalledExactlyOnceWith(input);
		await act(() => root.unmount());
		expect(vi.mocked(props.onLifecycle).mock.calls.map(([event]) => event)).toEqual([
			'mount:server',
			'cleanup:server',
		]);
		expect(vi.mocked(props.onRef).mock.calls.map(([node]) => node)).toEqual([input, null]);
	});

	// New props reach the boundary while its hydration waits on the old gate, so
	// it cannot hydrate with them. As React does, it renders on the client from
	// the client's data instead of the server's seeds, reports nothing, and the
	// abandoned attempt's wakeable no longer matters. The sibling outside the
	// boundary stays adopted.
	it('renders the boundary on the client for new props and ignores an obsolete wakeable', async () => {
		const { props, container, input, sibling, waiting, root, recoverable } = setup(gateInChild);
		const replacement = gate();
		await act(() =>
			root.render(InitialAdoptionScreen, {
				...props,
				gate: replacement.value,
				label: 'replacement',
				data: fulfilled('client data'),
			}),
		);
		expect(input.isConnected).toBe(false);
		expect(container.querySelector('input')!.value).toBe('server draft');
		expect(container.querySelector('[data-adopted-label]')!.textContent).toBe('replacement');
		expect(container.querySelector('output')!.textContent).toBe('client data');
		expect(container.querySelector('aside button')).toBe(sibling);
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:replacement');
		expect(recoverable).toEqual([]);
		await act(() => waiting.resolve());
		expect(container.querySelector('[data-adopted-label]')!.textContent).toBe('replacement');
		expect(props.onLifecycle).toHaveBeenCalledOnce();
		expect(recoverable).toEqual([]);
	});

	// The retry throws, so the boundary renders on the client, which throws
	// again. That render reads the client's data, not the seeds of the
	// attempts it replaces: a gate in the child throws only once the data the
	// content reads before it arrives.
	it('routes a rejected retry to the error boundary and preserves its sibling', async () => {
		const { props, container, sibling, waiting, resolveData } = setup(gateInChild);
		await act(() => {
			waiting.value.error = new Error('unavailable');
			waiting.resolve();
		});
		if (gateInChild) {
			expect(container.querySelector('[role="alert"]')).toBeNull();
			expect(container.querySelector('main')!.textContent).toContain('Loading');
			await act(() => resolveData('client data'));
		}
		expect(container.querySelector('[role="alert"]')!.textContent).toBe('unavailable');
		expect(container.querySelector('input')).toBeNull();
		expect(container.querySelector('aside button')).toBe(sibling);
		expect(props.onLifecycle).not.toHaveBeenCalled();
		expect(props.onRef).not.toHaveBeenCalled();
		await act(() => sibling.click());
		expect(props.onSiblingClick).toHaveBeenCalledOnce();
	});

	it('lets a timer end adoption that keeps waiting on an already-settled wakeable', async () => {
		// Retrying on the settled promise's own microtask would starve the timer
		// that clears the gate. The getter opens it after 2,000 checks instead of
		// hanging the test, and records that it had to.
		const { props, container, input, waiting } = setup(gateInChild, undefined, Promise.resolve());
		let pending = true;
		let checks = 0;
		let starved = false;
		Object.defineProperty(waiting.value, 'pending', {
			configurable: true,
			get() {
				if (pending && ++checks === 2_000) {
					starved = true;
					pending = false;
				}
				return pending;
			},
			set(value: boolean) {
				pending = value;
			},
		});
		await act(async () => {
			await new Promise<void>((resolve) =>
				setTimeout(() => {
					pending = false;
					resolve();
				}, 0),
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(starved).toBe(false);
		expect(container.querySelector('input')).toBe(input);
		expect(container.querySelector('[data-adopted-label]')!.textContent).toBe('server');
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:server');
	});

	it('unmounts a waiting boundary without publishing or retrying its children', async () => {
		const { props, container, waiting, root } = setup(gateInChild);
		await act(() => root.unmount());
		await act(() => waiting.resolve());
		expect(container.textContent).toBe('');
		expect(props.onLifecycle).not.toHaveBeenCalled();
		expect(props.onRef).not.toHaveBeenCalled();
	});
});

// Each gate the adopted content waits on is one more attempt over the same
// server DOM. The attempt that commits attaches the ref, once, to the server's
// input, however its hosts render: none before it attached anything.
describe.each(SCREENS.flatMap((screen) => [false, true].map((child) => [screen, child] as const)))(
	'initial suspended hydration of %s (gate in child: %s)',
	(screen, gateInChild) => {
		it('adopts the input through the first gate and attaches its ref once', async () => {
			const { props, container, input, sibling, waiting, recoverable } = setup(
				gateInChild,
				undefined,
				undefined,
				screen,
			);
			await act(() => {});
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('user draft');
			expect(document.activeElement).toBe(input);
			await act(() => sibling.click());
			expect(props.onSiblingClick).toHaveBeenCalledOnce();
			await act(() => waiting.resolve());
			expect(recoverable).toEqual([]);
			expect(container.querySelector('input')).toBe(input);
			expect(input.value).toBe('user draft');
			expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:server');
			expect(props.onRef).toHaveBeenCalledExactlyOnceWith(input);
		});

		it('attaches the ref once after the last of several gates', async () => {
			const second = gate();
			const { props, container, input, waiting, root, recoverable } = setup(
				gateInChild,
				second.value,
				undefined,
				screen,
			);
			await act(() => waiting.resolve());
			expect(container.querySelector('input')).toBe(input);
			expect(props.onRef).not.toHaveBeenCalled();
			await act(() => second.resolve());
			expect(recoverable).toEqual([]);
			expect(container.querySelector('input')).toBe(input);
			expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:server');
			expect(props.onRef).toHaveBeenCalledExactlyOnceWith(input);
			await act(() => root.unmount());
			expect(vi.mocked(props.onRef).mock.calls.map(([node]) => node)).toEqual([input, null]);
		});
	},
);

it('keeps a nested boundary’s server data when a later sibling postpones outer adoption', async () => {
	const waiting = gate();
	const onLifecycle = vi.fn();
	const container = document.createElement('div');
	document.body.append(container);
	container.innerHTML = renderToString(server.NestedInitialAdoption, {
		gate: waiting.value,
		onLifecycle,
		load: () => fulfilled('nested server data'),
	}).html;
	const output = container.querySelector('output')!;
	const serverId = output.id;
	waiting.value.pending = true;
	const root = hydrateRoot(container, NestedInitialAdoption, {
		gate: waiting.value,
		onLifecycle,
		load: () => new Promise<string>(() => {}),
	});
	cleanups.push(() => {
		root.unmount();
		container.remove();
	});
	await act(() => {});
	expect(onLifecycle).not.toHaveBeenCalled();
	await act(() => waiting.resolve());
	expect(container.querySelector('output')).toBe(output);
	expect(output.textContent).toBe('nested server data');
	expect(output.id).toBe(serverId);
	expect(container.textContent).not.toContain('loading');
	expect(onLifecycle).toHaveBeenCalledExactlyOnceWith('nested server data');
});

it.each(['resolve', 'reject', 'unmount'] as const)(
	'settles already-streamed content while client hydration waits: %s',
	async (settlement) => {
		const waiting = gate();
		waiting.value.pending = true;
		const props: AdoptionProps = {
			gate: waiting.value,
			label: 'streamed',
			data: fulfilled('streamed data'),
			siblingData: fulfilled('shell data'),
			onLifecycle: vi.fn(),
			onRef: vi.fn(),
			onSiblingClick: vi.fn(),
		};
		const streaming = collectReadableStream(server.InitialAdoptionScreen, props);
		await Promise.resolve();
		waiting.resolve();
		const container = document.createElement('div');
		document.body.append(container);
		const { html, errors, chunks } = await streaming;
		expect(errors).toEqual([]);
		expect(chunks[0]).toContain('Loading');
		container.innerHTML = html;
		activateStreamedMarkup(container);
		const input = container.querySelector('input')!;
		expect(input).not.toBeNull();
		const id = input.id;
		input.value = 'stream draft';
		input.focus();
		const clientGate = gate();
		clientGate.value.pending = true;
		const root = hydrateRoot(container, InitialAdoptionScreen, {
			...props,
			gate: clientGate.value,
			data: new Promise<string>(() => {}),
			siblingData: new Promise<string>(() => {}),
		});
		cleanups.push(() => {
			root.unmount();
			container.remove();
			resetStreamRuntimeGlobals();
		});
		await act(() => {});
		expect(container.querySelector('input')).toBe(input);
		expect(container.textContent).not.toContain('Loading');
		expect(props.onLifecycle).not.toHaveBeenCalled();
		if (settlement !== 'resolve') {
			await act(() => {
				if (settlement === 'unmount') root.unmount();
				else clientGate.value.error = new Error('stream unavailable');
				clientGate.resolve();
			});
			expect(container.querySelector('input')).toBeNull();
			expect(props.onLifecycle).not.toHaveBeenCalled();
			expect(props.onRef).not.toHaveBeenCalled();
			if (settlement === 'reject') {
				expect(container.querySelector('[role="alert"]')?.textContent).toBe('stream unavailable');
			} else expect(container.textContent).toBe('');
			return;
		}
		await act(() => clientGate.resolve());
		expect(container.querySelector('input')).toBe(input);
		expect(input.id).toBe(id);
		expect(input.value).toBe('stream draft');
		expect(document.activeElement).toBe(input);
		expect(container.querySelector('output')!.textContent).toBe('streamed data');
		expect(props.onLifecycle).toHaveBeenCalledExactlyOnceWith('mount:streamed');
	},
);

it('replays streamed child data after its enclosing hydration attempt is abandoned', async () => {
	const waiting = gate();
	let resolveData!: (value: string) => void;
	const data = new Promise<string>((resolve) => {
		resolveData = resolve;
	});
	const onLifecycle = vi.fn();
	const streaming = collectReadableStream(server.NestedInitialAdoption, {
		gate: waiting.value,
		onLifecycle,
		load: () => data,
	});
	await Promise.resolve();
	resolveData('nested streamed data');
	const { html, errors, chunks } = await streaming;
	expect(errors).toEqual([]);
	expect(chunks[0]).toContain('Inner loading');
	const container = document.createElement('div');
	document.body.append(container);
	container.innerHTML = html;
	activateStreamedMarkup(container);
	const output = container.querySelector('output')!;
	expect(output.textContent).toBe('nested streamed data');
	const id = output.id;
	waiting.value.pending = true;
	const root = hydrateRoot(container, NestedInitialAdoption, {
		gate: waiting.value,
		onLifecycle,
		load: () => new Promise<string>(() => {}),
	});
	cleanups.push(() => {
		root.unmount();
		container.remove();
		resetStreamRuntimeGlobals();
	});
	await act(() => {});
	expect(container.querySelector('output')).toBe(output);
	expect(onLifecycle).not.toHaveBeenCalled();
	await act(() => waiting.resolve());
	expect(container.querySelector('output')).toBe(output);
	expect(output.id).toBe(id);
	expect(output.textContent).toBe('nested streamed data');
	expect(container.textContent).not.toContain('loading');
	expect(onLifecycle).toHaveBeenCalledExactlyOnceWith('nested streamed data');
});
