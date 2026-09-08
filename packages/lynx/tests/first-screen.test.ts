import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deserialize, serialize } from 'node:v8';
import { JSDOM } from 'jsdom';
import {
	defineUniversalComponent,
	universalComponent,
	universalFor,
	universalPlan,
	universalProps,
	universalValue,
	useLayoutEffect,
	type UniversalComponent,
} from 'octane/universal/native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLynxRoot, type LynxRoot } from '../src/index.js';
import { root as firstScreenRoot } from '../src/first-screen.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import * as firstScreenRenderer from '../src/main-renderer.js';
import {
	defineUniversalComponent as defineFirstScreenComponent,
	firstScreenEvent,
	renderLynxFirstScreen,
	universalComponent as firstScreenComponent,
	universalFor as firstScreenFor,
	universalPlan as firstScreenPlan,
	universalProps as firstScreenProps,
	universalValue as firstScreenValue,
	useLayoutEffect as useFirstScreenLayoutEffect,
} from '../src/main-renderer.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_COMPACT_ACKNOWLEDGEMENT,
	LYNX_LAZY_PUBLIC_INSTANCES,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	type LynxBackgroundInboundMessage,
	type LynxBackgroundOutboundMessage,
	type LynxContextProxy,
} from '../src/core/protocol.js';
import { unwire, wire } from './_fixtures/lynx-wire.js';

interface SceneProps {
	readonly id: string;
	readonly items: readonly string[];
	readonly componentItems?: readonly string[];
	readonly rowPrefix?: string;
	readonly onRowTap?: (id: string, payload: unknown) => void;
	readonly onTap: (payload: unknown) => void;
	readonly onEffect: (owner: 'main' | 'background') => void;
}

interface EventRegistration {
	readonly node: object;
	readonly name: string;
	readonly listener: string | undefined;
}

interface InstalledEnvironment {
	readonly dom: JSDOM;
	readonly main: LynxMainThreadController;
	readonly registrations: EventRegistration[];
}

const mainPlan = firstScreenPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
});

const mainScenePlan = firstScreenPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
	children: [{ kind: 'slot', slot: 1 }],
});

const mainComponentRowPlan = firstScreenPlan('lynx', {
	kind: 'host',
	type: 'view',
	bindings: [['id', 0]],
	children: [
		{
			kind: 'host',
			type: 'text',
			bindings: [['bindtap', 2]],
			children: [{ kind: 'slot', slot: 1 }],
		},
	],
});

const MainComponentRow = defineFirstScreenComponent(
	'lynx',
	(props: { readonly id: string; readonly label: string }) =>
		firstScreenValue(mainComponentRowPlan, [props.id, props.label, firstScreenEvent]),
);

const MainScene = defineFirstScreenComponent('lynx', (props: SceneProps) => {
	useFirstScreenLayoutEffect(() => {
		props.onEffect('main');
	});
	return [
		firstScreenValue(mainScenePlan, [
			firstScreenProps([
				['set', 'id', props.id],
				['set', 'bindtap', firstScreenEvent],
			]),
			props.componentItems === undefined
				? null
				: firstScreenFor(
						props.componentItems,
						(id) => id,
						(id) =>
							firstScreenComponent(
								'lynx',
								MainComponentRow,
								firstScreenProps([
									['set', 'id', id],
									['set', 'label', `${props.rowPrefix ?? 'label'}:${id}`],
								]),
							),
						null,
						false,
						false,
						undefined,
						undefined,
						undefined,
						true,
					),
		]),
		firstScreenFor(
			props.items,
			(item) => item,
			(item) => firstScreenValue(mainPlan, [firstScreenProps([['set', 'id', item]])]),
			null,
			true,
			true,
		),
	];
});

const MainSingleHost = defineFirstScreenComponent('lynx', (props: { readonly id: string }) =>
	firstScreenValue(mainPlan, [firstScreenProps([['set', 'id', props.id]])]),
);

const feedPlan = firstScreenPlan('lynx', {
	kind: 'host',
	type: 'view',
	bindings: [['id', 0]],
	children: [
		{
			kind: 'host',
			type: 'list',
			bindings: [['id', 1]],
			children: [{ kind: 'host', type: 'list-item', bindings: [['item-key', 2]] }],
		},
	],
});

const FeedScene = defineFirstScreenComponent('lynx', () =>
	firstScreenValue(feedPlan, ['feed-shell', 'feed', 'row-0']),
);

interface FirstScreenLinkedRuntime {
	useLinkedState?<Source, Value>(
		source: Source,
		reconcile: (source: Source, previous: { source: Source; value: Value } | undefined) => Value,
		options?:
			| {
					sourceEqual?: (previous: Source, next: Source) => boolean;
					valueEqual?: (previous: Value, next: Value) => boolean;
			  }
			| symbol
			| string
			| number,
		slot?: unknown,
	): [Value, (next: Value | ((previous: Value) => Value)) => void];
	__useLinkedStateWithGetter?<Source, Value>(
		source: Source,
		reconcile: (source: Source, previous: { source: Source; value: Value } | undefined) => Value,
		options?:
			| {
					sourceEqual?: (previous: Source, next: Source) => boolean;
					valueEqual?: (previous: Value, next: Value) => boolean;
			  }
			| symbol
			| string
			| number,
		slot?: unknown,
	): [Value, (next: Value | ((previous: Value) => Value)) => void, () => Value];
}

const firstScreenLinkedRuntime = firstScreenRenderer as FirstScreenLinkedRuntime;

function compiledFirstScreenHookImports(observeGetter: boolean): Set<string> {
	const tuple = observeGetter ? '[value, setValue, getValue]' : '[value, setValue]';
	const output = observeGetter ? 'getValue()' : 'value';
	const source = `
			import { useLinkedState } from 'octane';
			export function LinkedFirstScreen(props) @{
				const ${tuple} = useLinkedState(props.source, (source) => source.label);
				<view id={${output}} />
			}
		`;
	const repository = fileURLToPath(new URL('../../../', import.meta.url));
	const result = execFileSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`import { createRequire } from 'node:module';
import { compile } from './packages/octane/src/compiler/compile.js';
import { lynxMainThreadRenderer } from './packages/lynx/src/config.runtime.js';
const compilerRequire = createRequire(new URL('./packages/octane/package.json', import.meta.url));
const { parseModule } = await import(compilerRequire.resolve('@tsrx/core'));
let source = '';
for await (const chunk of process.stdin) source += chunk;
const { code } = compile(source, '/src/linked-first-screen.lynx.tsrx', {
	hmr: false,
	inlineHookMemo: false,
	renderer: { ...lynxMainThreadRenderer, id: 'lynx' },
	universalRuntime: { runtime: 'lynx', thread: 'main-thread' },
});
const imports = [];
for (const statement of parseModule(code, '/compiled/linked-first-screen.js').body ?? []) {
	if (
		statement.type !== 'ImportDeclaration' ||
		statement.source?.value !== '@octanejs/lynx/main-renderer'
	) continue;
	for (const specifier of statement.specifiers ?? []) {
		if (specifier.type === 'ImportSpecifier') {
			imports.push(specifier.imported?.name ?? specifier.imported?.value);
		}
	}
}
process.stdout.write(JSON.stringify(imports));`,
		],
		{
			cwd: repository,
			input: source,
			encoding: 'utf8',
		},
	);
	return new Set(JSON.parse(result) as string[]);
}

const backgroundPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
});

const backgroundScenePlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
	children: [{ kind: 'slot', slot: 1 }],
});

const postAdoptionRowPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	bindings: [['id', 0]],
	children: [
		{
			kind: 'host',
			type: 'text',
			bindings: [['bindtap', 2]],
			children: [{ kind: 'slot', slot: 1 }],
		},
	],
});

const PostAdoptionRow = defineUniversalComponent(
	'lynx',
	({
		id,
		label,
		onTap,
	}: {
		readonly id: string;
		readonly label: string;
		readonly onTap: (id: string, payload: unknown) => void;
	}) => universalValue(postAdoptionRowPlan, [id, label, (payload: unknown) => onTap(id, payload)]),
);

const BackgroundScene = defineUniversalComponent('lynx', (props: SceneProps) => {
	useLayoutEffect(() => {
		props.onEffect('background');
	}, []);
	return [
		universalValue(backgroundScenePlan, [
			universalProps([
				['set', 'id', props.id],
				['set', 'bindtap', props.onTap],
			]),
			props.componentItems === undefined
				? null
				: universalFor(
						props.componentItems,
						(id) => id,
						(id) =>
							universalComponent(
								'lynx',
								PostAdoptionRow,
								universalProps([
									['set', 'id', id],
									['set', 'label', `${props.rowPrefix ?? 'label'}:${id}`],
									['set', 'onTap', props.onRowTap ?? (() => {})],
								]),
							),
						null,
						false,
						false,
						undefined,
						undefined,
						undefined,
						true,
					),
		]),
		universalFor(
			props.items,
			(item) => item,
			(item) => universalValue(backgroundPlan, [universalProps([['set', 'id', item]])]),
			null,
			true,
			true,
		),
	];
});

let installed: InstalledEnvironment | null = null;
let backgroundRoot: LynxRoot | null = null;

function mainContext(): LynxContextProxy {
	return (
		globalThis as typeof globalThis & {
			lynx: { getJSContext(): LynxContextProxy };
		}
	).lynx.getJSContext();
}

function backgroundContext(): LynxContextProxy {
	return (
		globalThis as typeof globalThis & {
			lynx: { getCoreContext(): LynxContextProxy };
		}
	).lynx.getCoreContext();
}

function installEnvironment(
	configurePAPI?: (target: Record<string, unknown>) => void,
	installOptions?: Partial<Parameters<typeof installLynxMainThread>[0]>,
): InstalledEnvironment {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, {
		window: dom.window as unknown as Window & typeof globalThis,
	});
	globalThis.lynxTestingEnv.switchToMainThread();
	const target = globalThis as unknown as Record<string, unknown>;
	configurePAPI?.(target);
	const registrations: EventRegistration[] = [];
	const addEvent = target.__AddEvent as (
		node: object,
		kind: string,
		name: string,
		listener: string | undefined,
	) => void;
	target.__AddEvent = (node, kind, name, listener) => {
		registrations.push(Object.freeze({ node, name, listener }));
		addEvent(node, kind, name, listener);
	};
	const main = installLynxMainThread({
		firstScreen: true,
		firstScreenSync: 'manual',
		...installOptions,
	});
	return (installed = { dom, main, registrations });
}

afterEach(async () => {
	if (backgroundRoot !== null) {
		try {
			await backgroundRoot.unmount();
		} catch {
			// A manual protocol test can leave no live background root.
		}
	}
	backgroundRoot = null;
	if (installed !== null) {
		installed.main.close();
		globalThis.lynxTestingEnv.clearGlobal();
		uninstallLynxTestingEnv(globalThis);
		installed.dom.window.close();
	}
	installed = null;
});

describe.sequential('Lynx synchronous first-screen adoption', () => {
	it('compiles linked-state pairs for the main renderer and paints their one-shot initial value', () => {
		expect(compiledFirstScreenHookImports(false).has('useLinkedState')).toBe(true);
		const { dom } = installEnvironment();
		let update!: (next: string) => void;
		const initialValues: Array<{ source: { label: string }; value: string } | undefined> = [];
		const LinkedScene = defineFirstScreenComponent(
			'lynx',
			(props: { source: { label: string } }) => {
				const [value, setValue] = firstScreenLinkedRuntime.useLinkedState!(
					props.source,
					(source, previous) => {
						initialValues.push(previous);
						return `linked-${source.label}`;
					},
					Symbol('linked-first-screen'),
				);
				update = setValue;
				return firstScreenValue(mainPlan, [firstScreenProps([['set', 'id', value]])]);
			},
		);

		firstScreenRoot.render(LinkedScene, { source: { label: 'main' } });
		expect(dom.window.document.querySelector('#linked-main')).not.toBeNull();
		expect(initialValues).toEqual([undefined]);

		update('ignored-update');
		expect(dom.window.document.querySelector('#linked-main')).not.toBeNull();
		expect(dom.window.document.querySelector('#ignored-update')).toBeNull();
	});

	it('compiles observed linked getters and exposes the original one-shot value after inert updates', () => {
		expect(compiledFirstScreenHookImports(true).has('__useLinkedStateWithGetter')).toBe(true);
		const { dom } = installEnvironment();
		const sourceEqual = vi.fn(() => false);
		const valueEqual = vi.fn(() => false);
		let getValue!: () => string;
		let setValue!: (next: string) => void;
		const LinkedGetterScene = defineFirstScreenComponent(
			'lynx',
			(props: { source: { label: string } }) => {
				const [value, update, read] = firstScreenLinkedRuntime.__useLinkedStateWithGetter!(
					props.source,
					(source, previous) => {
						expect(previous).toBeUndefined();
						return `getter-${source.label}`;
					},
					{ sourceEqual, valueEqual },
					Symbol('linked-getter-first-screen'),
				);
				getValue = read;
				setValue = update;
				return firstScreenValue(mainPlan, [firstScreenProps([['set', 'id', value]])]);
			},
		);

		firstScreenRoot.render(LinkedGetterScene, { source: { label: 'main' } });
		expect(dom.window.document.querySelector('#getter-main')).not.toBeNull();
		expect(getValue()).toBe('getter-main');
		setValue('ignored-update');
		expect(getValue()).toBe('getter-main');
		expect(sourceEqual).not.toHaveBeenCalled();
		expect(valueEqual).not.toHaveBeenCalled();
	});

	it('paints synchronously, gates background startup, adopts node identity, and replays events', async () => {
		const { dom, main, registrations } = installEnvironment();
		const inbound: LynxBackgroundInboundMessage[] = [];
		const outbound: LynxBackgroundOutboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});
		mainContext().addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
			outbound.push(unwire(event.data) as LynxBackgroundOutboundMessage);
		});
		const effects: string[] = [];
		const events: unknown[] = [];
		const initialRowEvents: Array<readonly [string, unknown]> = [];
		const initialComponentItems = ['initial-a', 'initial-b'];
		let placeholderToken: string | undefined;
		let initialRowToken: string | undefined;
		const props: SceneProps = {
			id: 'first-screen',
			items: ['a', 'b'],
			componentItems: initialComponentItems,
			onTap(payload) {
				events.push(payload);
				if (
					(payload as { detail?: { phase?: unknown } }).detail?.phase === 'first' &&
					placeholderToken !== undefined
				) {
					main.dispatchNativeEvent(placeholderToken, {
						type: 'tap',
						detail: { phase: 'reentrant' },
					});
				}
			},
			onRowTap(id, payload) {
				initialRowEvents.push([id, payload]);
				if (
					(payload as { detail?: { phase?: unknown } }).detail?.phase === 'first' &&
					initialRowToken !== undefined
				) {
					main.dispatchNativeEvent(initialRowToken, {
						type: 'tap',
						detail: { phase: 'reentrant' },
					});
				}
			},
			onEffect(owner) {
				effects.push(owner);
			},
		};

		const painted = firstScreenRoot.render(MainScene as UniversalComponent<SceneProps>, props);
		const firstNode = dom.window.document.querySelector('#first-screen');
		const firstA = dom.window.document.querySelector('#a');
		const firstB = dom.window.document.querySelector('#b');
		const firstInitialA = dom.window.document.querySelector('#initial-a');
		const firstInitialB = dom.window.document.querySelector('#initial-b');
		expect(painted).toMatchObject({ hostCount: 9, logicalCount: 15 });
		expect(firstNode).not.toBeNull();
		expect(firstA).not.toBeNull();
		expect(firstB).not.toBeNull();
		expect(firstInitialA?.textContent).toBe('label:initial-a');
		expect(firstInitialB?.textContent).toBe('label:initial-b');
		expect(effects).toEqual([]);
		expect(main.firstScreenSnapshot()).toMatchObject({ root: 1, version: 1 });

		placeholderToken = registrations.find(
			(registration) => registration.name === 'tap' && registration.node === firstNode,
		)?.listener;
		initialRowToken = registrations.find(
			(registration) =>
				registration.name === 'tap' &&
				firstInitialA?.contains(registration.node as unknown as Node) === true,
		)?.listener;
		expect(placeholderToken).toBeTypeOf('string');
		expect(initialRowToken).toBeTypeOf('string');
		main.dispatchNativeEvent(placeholderToken!, { type: 'tap', detail: { phase: 'first' } });
		main.dispatchNativeEvent(initialRowToken!, { type: 'tap', detail: { phase: 'first' } });

		globalThis.lynxTestingEnv.switchToBackgroundThread();
		const context = backgroundContext();
		const dispatch = context.dispatchEvent.bind(context);
		const clonedRuns: boolean[] = [];
		context.dispatchEvent = (event) => {
			const data = deserialize(serialize(unwire(event.data))) as unknown;
			if (
				data !== null &&
				typeof data === 'object' &&
				'type' in data &&
				data.type === 'commit' &&
				'batch' in data
			) {
				const batch = data.batch as { commands?: readonly unknown[] };
				const run = batch.commands?.[0] as
					{ op?: string; program?: object; values?: readonly unknown[] } | undefined;
				if (run?.op === 'mount-template-run') {
					clonedRuns.push(
						!Object.isFrozen(run) && !Object.isFrozen(run.program) && !Object.isFrozen(run.values),
					);
				}
			}
			// Re-dispatch what was actually sent. The observation above is a
			// read of the wire, not a rewrite of it: handing the decoded object
			// back would put a live composite on a channel that now carries text.
			return dispatch(event);
		};
		backgroundRoot = createLynxRoot();
		const rendering = backgroundRoot.render(BackgroundScene, props);
		let settled = false;
		void rendering.finally(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		expect(events).toEqual([]);
		expect(initialRowEvents).toEqual([]);

		globalThis.lynxTestingEnv.switchToMainThread();
		main.markFirstScreenSyncReady();
		globalThis.lynxTestingEnv.switchToBackgroundThread();
		await rendering;

		expect(dom.window.document.querySelector('#first-screen')).toBe(firstNode);
		expect(dom.window.document.querySelector('#a')).toBe(firstA);
		expect(dom.window.document.querySelector('#b')).toBe(firstB);
		expect(dom.window.document.querySelector('#initial-a')).toBe(firstInitialA);
		expect(dom.window.document.querySelector('#initial-b')).toBe(firstInitialB);
		expect(effects).toEqual(['background']);
		expect(main.diagnostics()).toEqual([]);
		expect(events).toEqual([
			{ type: 'tap', detail: { phase: 'first' } },
			{ type: 'tap', detail: { phase: 'reentrant' } },
		]);
		expect(initialRowEvents).toEqual([
			['initial-a', { type: 'tap', detail: { phase: 'first' } }],
			['initial-a', { type: 'tap', detail: { phase: 'reentrant' } }],
		]);
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(main.activeIdentity()).toMatchObject({ root: 1, version: 1 });
		const ready = inbound.filter((message) => message.type === 'main-ready');
		expect(ready).toHaveLength(1);
		expect(ready[0]).toMatchObject({
			type: 'main-ready',
			firstTree: { root: 1, version: 1 },
			capabilities: { templateProgram: 1, templateRuns: 1, lazyPublicInstances: 1 },
		});
		expect((ready[0] as { request: number }).request).toBeGreaterThan(0);
		const adoptionCommit = outbound.find((message) => message.type === 'commit');
		expect(adoptionCommit).not.toHaveProperty('ack');
		expect(adoptionCommit).not.toHaveProperty('instances');

		await backgroundRoot.render(BackgroundScene, {
			...props,
			componentItems: [],
		});
		expect(dom.window.document.querySelector('#initial-a')).toBeNull();
		expect(dom.window.document.querySelector('#initial-b')).toBeNull();

		const componentItems = ['row-a', 'row-b', 'row-c', 'row-d', 'row-e', 'row-f', 'row-g', 'row-h'];
		const rowTaps: string[] = [];
		await backgroundRoot.render(BackgroundScene, {
			...props,
			componentItems,
			onRowTap: (id) => rowTaps.push(id),
		});
		expect(dom.window.document.querySelector('#first-screen')).toBe(firstNode);
		expect(dom.window.document.querySelector('#a')).toBe(firstA);
		expect(dom.window.document.querySelector('#b')).toBe(firstB);
		expect(
			componentItems.map((id) => dom.window.document.querySelector(`#${id}`)?.textContent),
		).toEqual(componentItems.map((id) => `label:${id}`));
		const creation = outbound.filter((message) => message.type === 'commit').at(-1);
		expect(creation).toMatchObject({
			ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
			instances: LYNX_LAZY_PUBLIC_INSTANCES,
			batch: { commands: [{ op: 'mount-template-run' }] },
		});
		const creationAcknowledgement = inbound.find(
			(message) => message.type === 'ack' && message.version === creation!.version,
		);
		expect(creationAcknowledgement).toMatchObject({
			encoding: LYNX_COMPACT_ACKNOWLEDGEMENT,
			count: componentItems.length * 3,
		});
		expect(creationAcknowledgement).not.toHaveProperty('handles');
		expect(clonedRuns).toEqual([true]);
		const lastRowListener = registrations.at(-1)?.listener;
		expect(lastRowListener).toBeTypeOf('string');
		main.dispatchNativeEvent(lastRowListener!, { type: 'tap' });
		expect(rowTaps).toEqual(['row-h']);
		expect(main.diagnostics()).toEqual([]);

		await backgroundRoot.render(BackgroundScene, {
			...props,
			componentItems,
			rowPrefix: 'updated',
			onRowTap: (id) => rowTaps.push(id),
		});
		expect(dom.window.document.querySelector('#row-a')?.textContent).toBe('updated:row-a');
		expect(dom.window.document.querySelector('#first-screen')).toBe(firstNode);

		await backgroundRoot.render(BackgroundScene, {
			...props,
			componentItems: componentItems.slice(0, -1),
			rowPrefix: 'updated',
			onRowTap: (id) => rowTaps.push(id),
		});
		expect(dom.window.document.querySelector('#row-h')).toBeNull();
		expect(dom.window.document.querySelector('#first-screen')).toBe(firstNode);
		main.dispatchNativeEvent(lastRowListener!, { type: 'tap' });
		expect(rowTaps).toEqual(['row-h']);
		expect(main.diagnostics().at(-1)?.message).toMatch(/stale, hidden, removed, or foreign/);
	});

	it('defers an engine-mode first screen until __RenderPage arrives', () => {
		// Native installs the decoded PageConfig on the ElementManager only after
		// main-thread script evaluation, so an engine-mode receiver must not
		// create elements during evaluation; the render runs when the engine's
		// __RenderPage lifecycle proves evaluation has finished.
		const engineListeners = new Map<string, Set<(event: LynxContextProxyEvent) => void>>();
		const engineContext: LynxContextProxy = {
			dispatchEvent(event) {
				for (const listener of [...(engineListeners.get(event.type) ?? [])]) listener(event);
			},
			addEventListener(type, listener) {
				let entries = engineListeners.get(type);
				if (entries === undefined) engineListeners.set(type, (entries = new Set()));
				entries.add(listener);
			},
			removeEventListener(type, listener) {
				engineListeners.get(type)?.delete(listener);
			},
		};
		const { dom, main } = installEnvironment(
			(target) => {
				(target.lynx as Record<string, unknown>).getEngine = () => engineContext;
			},
			{ firstScreenRender: 'engine' },
		);
		const props: SceneProps = {
			id: 'engine-mode',
			items: ['a'],
			onTap() {},
			onEffect() {},
		};

		const deferred = firstScreenRoot.render(MainScene as UniversalComponent<SceneProps>, props);
		expect(deferred).toBeNull();
		expect(dom.window.document.querySelector('#engine-mode')).toBeNull();

		main.markFirstScreenSyncReady();
		expect(dom.window.document.querySelector('#engine-mode')).toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();

		engineContext.dispatchEvent({ type: '__RenderPage', data: [{}, {}] });
		expect(dom.window.document.querySelector('#engine-mode')).not.toBeNull();
		expect(dom.window.document.querySelector('#a')).not.toBeNull();
		expect(main.firstScreenSnapshot()).toMatchObject({ root: 1, version: 1 });
		expect(main.diagnostics()).toEqual([]);
	});

	it('repairs a nondeterministic first tree and reports the typed mismatch', () => {
		const { dom, main } = installEnvironment();
		const props: SceneProps = {
			id: 'main-value',
			items: ['a', 'b'],
			onTap() {},
			onEffect() {},
		};
		firstScreenRoot.render(MainScene as UniversalComponent<SceneProps>, props);
		const firstNode = dom.window.document.querySelector('#main-value');
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});
		main.markFirstScreenSyncReady();

		const replacement = renderLynxFirstScreen(MainScene, {
			...props,
			id: 'background-value',
		});
		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: wire({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 1,
				version: 1,
				type: 'commit',
				batch: replacement.batch,
			}),
		});

		expect(inbound.find((message) => message.type === 'ack')).toMatchObject({
			type: 'ack',
			adoption: 'repaired',
		});
		expect(dom.window.document.querySelector('#background-value')).not.toBe(firstNode);
		expect(main.diagnostics()).toEqual([
			expect.objectContaining({
				code: 'OCTANE_LYNX_FIRST_SCREEN_MISMATCH',
				path: 'snapshot.nodes[1].props',
			}),
		]);
	});

	it('accepts a later commit before adoption ownership is confirmed', () => {
		const { dom, main } = installEnvironment();
		firstScreenRoot.render(MainSingleHost, { id: 'first-screen' });
		const inbound: LynxBackgroundInboundMessage[] = [];
		let queuedSecondCommit = false;
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			const message = unwire(event.data) as LynxBackgroundInboundMessage;
			inbound.push(message);
			if (message.type !== 'ack' || message.version !== 1 || queuedSecondCommit) return;
			queuedSecondCommit = true;
			backgroundContext().dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: wire({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					root: 1,
					version: 2,
					type: 'commit',
					batch: {
						renderer: 'lynx',
						version: 2,
						commands: [{ op: 'update', id: 1, props: { id: 'after-adoption' } }],
					},
				}),
			});
		});
		main.markFirstScreenSyncReady();

		const initial = renderLynxFirstScreen(MainSingleHost, { id: 'first-screen' });
		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: wire({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 1,
				version: 1,
				type: 'commit',
				batch: initial.batch,
			}),
		});

		expect(inbound.filter((message) => message.type === 'ack')).toEqual([
			expect.objectContaining({ type: 'ack', version: 1, adoption: 'adopted' }),
			expect.objectContaining({ type: 'ack', version: 2 }),
		]);
		expect(inbound.some((message) => message.type === 'reject')).toBe(false);
		expect(dom.window.document.querySelector('#after-adoption')).not.toBeNull();
		expect(main.activeIdentity()).toMatchObject({ root: 1, version: 2 });
		expect(main.firstScreenSnapshot()).not.toBeNull();

		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: wire({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 1,
				version: 1,
				type: 'adoption-ready',
			}),
		});

		expect(main.firstScreenSnapshot()).toBeNull();
		expect(main.activeIdentity()).toMatchObject({ root: 1, version: 2 });
		expect(main.diagnostics()).toEqual([]);
	});

	it('can seal an entry with no first-screen render and unblock background readiness', () => {
		const { main } = installEnvironment();
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});

		main.markFirstScreenSyncReady();

		expect(inbound).toEqual([
			{
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready',
				request: 0,
			},
		]);
		expect(() =>
			firstScreenRoot.render(MainScene as UniversalComponent<SceneProps>, {
				id: 'late',
				items: ['a', 'b'],
				onTap() {},
				onEffect() {},
			}),
		).toThrow(/render window has closed/);
	});

	it('retains a captured first tree until facade unmount cleanup can be retried', async () => {
		let removalFailures = 0;
		const { dom, main } = installEnvironment((target) => {
			const remove = target.__RemoveElement as (parent: object, child: object) => unknown;
			target.__RemoveElement = (parent: object, child: object) => {
				if (removalFailures++ < 3) throw new Error('transient first-tree remove failure');
				return remove(parent, child);
			};
		});
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});
		firstScreenRoot.render(MainSingleHost, { id: 'cleanup-retry' });

		await firstScreenRoot.unmount();
		expect(dom.window.document.querySelector('#cleanup-retry')).not.toBeNull();
		expect(main.firstScreenSnapshot()).not.toBeNull();
		expect(inbound).toEqual([]);

		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: wire({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready-request',
				request: 43,
			}),
		});
		expect(dom.window.document.querySelector('#cleanup-retry')).toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(inbound).toEqual([expect.objectContaining({ type: 'main-ready', request: 43 })]);
	});

	// A `<list>` is a documented element an application is entitled to use, and
	// the background genuinely cannot adopt one: the platform materializes its
	// rows through main-local callbacks and owns the resulting cells. Declining
	// the synchronous paint is therefore an ordinary outcome, and must not be
	// reported the way the broken host in the next test is.
	it('declines a synchronous first screen holding a native list without faulting', () => {
		// The renderer captures the flush when the runtime installs, so this has to
		// wrap it before that; each flush reports the page as the batch left it.
		const painted: string[] = [];
		const { dom, main } = installEnvironment((target) => {
			const hostFlush = target.__FlushElementTree as (...args: unknown[]) => void;
			target.__FlushElementTree = (...args: unknown[]) => {
				hostFlush.apply(target, args);
				painted.push((args[0] as { innerHTML?: string } | undefined)?.innerHTML ?? '');
			};
		});
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});

		expect(firstScreenRoot.render(FeedScene, {})).toBeNull();

		// The tree really was built, then retired, so the background owns the page
		// alone rather than rendering beneath a duplicate.
		expect(painted.some((html) => html.includes('id="feed"'))).toBe(true);
		expect(dom.window.document.querySelector('#feed')).toBeNull();
		expect(dom.window.document.querySelector('#feed-shell')).toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(main.diagnostics()).toEqual([]);

		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: wire({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready-request',
				request: 51,
			}),
		});
		// Declining settles readiness immediately, exactly as an entry that never
		// rendered a first screen does, so the background is not left waiting.
		expect(inbound).toEqual([
			expect.objectContaining({ type: 'main-ready', request: 0 }),
			expect.objectContaining({ type: 'main-ready', request: 51 }),
		]);
	});

	it('retries deferred cleanup for a declined first screen before announcing readiness', () => {
		let allowCleanup = false;
		const { dom, main } = installEnvironment((target) => {
			const remove = target.__RemoveElement as (parent: object, child: object) => unknown;
			target.__RemoveElement = (parent: object, child: object) => {
				if (!allowCleanup) throw new Error('transient declined-source remove failure');
				return remove(parent, child);
			};
		});
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});

		expect(firstScreenRoot.render(FeedScene, {})).toBeNull();

		expect(dom.window.document.querySelector('#feed-shell')).not.toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(inbound).toEqual([]);

		allowCleanup = true;
		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: wire({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready-request',
				request: 52,
			}),
		});

		expect(dom.window.document.querySelector('#feed-shell')).toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(inbound).toEqual([expect.objectContaining({ type: 'main-ready', request: 52 })]);
	});

	it('retains a failed pre-capture source and retries cleanup for background readiness', () => {
		const captureFailure = new Error('capture unique ID failed');
		let uniqueIdCalls = 0;
		let removalFailures = 0;
		const { dom, main } = installEnvironment((target) => {
			const getUniqueId = target.__GetElementUniqueID as (node: object) => number;
			target.__GetElementUniqueID = (node: object) => {
				if (++uniqueIdCalls === 2) throw captureFailure;
				return getUniqueId(node);
			};
			const remove = target.__RemoveElement as (parent: object, child: object) => unknown;
			target.__RemoveElement = (parent: object, child: object) => {
				if (removalFailures++ < 6) throw new Error('transient failed-source remove failure');
				return remove(parent, child);
			};
		});
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});

		expect(() => firstScreenRoot.render(MainSingleHost, { id: 'failed-capture' })).toThrow(
			captureFailure,
		);
		expect(dom.window.document.querySelector('#failed-capture')).not.toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(inbound).toEqual([]);

		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: wire({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready-request',
				request: 41,
			}),
		});
		expect(dom.window.document.querySelector('#failed-capture')).not.toBeNull();
		expect(inbound).toEqual([]);

		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: wire({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready-request',
				request: 42,
			}),
		});

		expect(dom.window.document.querySelector('#failed-capture')).toBeNull();
		expect(inbound).toEqual([
			expect.objectContaining({ type: 'main-ready', request: 41 }),
			expect.objectContaining({ type: 'main-ready', request: 42 }),
		]);
	});

	it('withholds terminal dispose acknowledgement until first-tree cleanup succeeds', () => {
		let removalFailures = 0;
		const { dom, main } = installEnvironment((target) => {
			const remove = target.__RemoveElement as (parent: object, child: object) => unknown;
			target.__RemoveElement = (parent: object, child: object) => {
				if (removalFailures++ < 3) throw new Error('transient terminal remove failure');
				return remove(parent, child);
			};
		});
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(unwire(event.data) as LynxBackgroundInboundMessage);
		});
		firstScreenRoot.render(MainSingleHost, { id: 'terminal-retry' });
		const dispose = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root: 1,
			version: 1,
			type: 'terminal-dispose' as const,
		};

		backgroundContext().dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data: wire(dispose) });
		expect(inbound.at(-1)).toMatchObject({ type: 'dispose-retry', root: 1, version: 1 });
		expect(dom.window.document.querySelector('#terminal-retry')).not.toBeNull();
		expect(main.firstScreenSnapshot()).not.toBeNull();

		backgroundContext().dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data: wire(dispose) });
		expect(inbound.at(-1)).toMatchObject({ type: 'dispose-ack', root: 1, version: 1 });
		expect(dom.window.document.querySelector('#terminal-retry')).toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
	});
});
