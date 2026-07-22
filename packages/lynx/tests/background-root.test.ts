import { JSDOM } from 'jsdom';
import {
	installLynxTestingEnv,
	type LynxTestingEnv,
	uninstallLynxTestingEnv,
} from '@lynx-js/testing-environment';
import {
	createObjectContainer,
	createObjectDriver,
	createContext,
	createPortal,
	createUniversalRoot,
	defineUniversalComponent,
	universalComponent,
	universalContext,
	universalKey,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	use,
	useContext,
	useLayoutEffect,
	type UniversalComponent,
	type UniversalTransportIdentity,
} from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { createLynxRoot, type LynxPublicHandle, type LynxRoot } from '../src/index.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import {
	useGlobalProps,
	useGlobalPropsChanged,
	useInitData,
	useInitDataChanged,
} from '../src/platform.js';
import { LYNX_NODES_REF_ATTRIBUTE } from '../src/core/nodes-ref.js';
import { LYNX_CSS_SCOPE_PROP } from '../src/core/host-props.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_READY_ANNOUNCEMENT_REQUEST,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	type LynxBackgroundInboundMessage,
	type LynxContextProxy,
} from '../src/core/protocol.js';
import { BackgroundRootFixture, ClassAliasFixture } from './_fixtures/background-root.lynx.tsrx';

interface FixtureItem {
	readonly id: string;
	readonly value: string;
}

interface FixtureActions {
	increment(): void;
}

interface FixtureProps {
	readonly label: string;
	readonly items: readonly FixtureItem[];
	readonly showDetails: boolean;
	readonly fail: boolean;
	readonly log: (entry: string) => void;
	readonly captureActions: (actions: FixtureActions) => void;
	readonly captureRow: (id: string, handle: LynxPublicHandle | null) => void;
	readonly counterRef: (handle: LynxPublicHandle | null) => void;
}

interface InstalledEnvironment {
	readonly dom: JSDOM;
	readonly env: LynxTestingEnv;
	readonly main: LynxMainThreadController;
}

const fixture = BackgroundRootFixture as UniversalComponent<FixtureProps>;
const classAliasFixture = ClassAliasFixture as UniversalComponent<{
	readonly middle: Readonly<Record<string, unknown>>;
	readonly last: string;
}>;
const simplePlan = universalPlan(LYNX_TRANSPORT_RENDERER, {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
});
const SimpleScene = defineUniversalComponent(
	LYNX_TRANSPORT_RENDERER,
	(props: { readonly id: string }) =>
		universalValue(simplePlan, [universalProps([['set', 'id', props.id]])]),
);
interface LifecycleSnapshot {
	readonly initData: Record<string, unknown>;
	readonly globalProps: Record<string, unknown>;
}

interface LifecycleObserverProps {
	readonly onRender: (snapshot: LifecycleSnapshot) => void;
	readonly onInitDataChanged: (data: Record<string, unknown>) => void;
	readonly onGlobalPropsChanged: (data: Record<string, unknown>) => void;
}

interface LifecycleTestEmitter {
	addListener(eventName: string, listener: (data: unknown) => void): void;
}

interface LifecycleTestRuntime {
	__initData?: Record<string, unknown>;
	__presetData: Record<string, unknown>;
	__globalProps: Record<string, unknown>;
	getJSModule(name: 'GlobalEventEmitter'): LifecycleTestEmitter;
}

const LifecycleObserver = defineUniversalComponent(
	LYNX_TRANSPORT_RENDERER,
	(props: LifecycleObserverProps) => {
		const initData = useInitData() as Record<string, unknown>;
		const globalProps = useGlobalProps() as Record<string, unknown>;
		useInitDataChanged(props.onInitDataChanged);
		useGlobalPropsChanged(props.onGlobalPropsChanged);
		props.onRender({ initData, globalProps });
		return null;
	},
);
const PortalTheme = createContext('missing');
const portalShellPlan = universalPlan(LYNX_TRANSPORT_RENDERER, {
	kind: 'range',
	children: [
		{
			kind: 'host',
			type: 'view',
			bindings: [
				['id', 0],
				['ref', 1],
				[LYNX_CSS_SCOPE_PROP, 2],
			],
			children: [
				{ kind: 'host', type: 'view', bindings: [['id', 3]] },
				{ kind: 'host', type: 'view', bindings: [['id', 4]] },
			],
		},
		{
			kind: 'host',
			type: 'view',
			bindings: [
				['id', 5],
				['ref', 6],
			],
			children: [
				{ kind: 'host', type: 'view', bindings: [['id', 7]] },
				{ kind: 'host', type: 'view', bindings: [['id', 8]] },
			],
		},
		{ kind: 'slot', slot: 9 },
	],
});
const portalLeafPlan = universalPlan(LYNX_TRANSPORT_RENDERER, {
	kind: 'host',
	type: 'view',
	bindings: [
		['id', 0],
		['data-theme', 1],
		['ref', 2],
	],
	children: [
		{
			kind: 'host',
			type: 'text',
			children: [{ kind: 'host', type: '#text', bindings: [['value', 3]] }],
		},
	],
});
const portalFallbackPlan = universalPlan(LYNX_TRANSPORT_RENDERER, {
	kind: 'host',
	type: 'view',
	bindings: [['id', 0]],
});

interface PortalLeafProps {
	readonly pending: Promise<string> | null;
	readonly value: string;
	readonly capture: (handle: LynxPublicHandle | null) => void;
}

const PortalLeaf = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, (props: PortalLeafProps) => {
	const theme = useContext(PortalTheme);
	const value = props.pending === null ? props.value : use(props.pending);
	return universalValue(portalLeafPlan, ['portal-content', theme, props.capture, value]);
});

interface PortalSceneProps extends PortalLeafProps {
	readonly target: LynxPublicHandle | null;
	readonly theme: string;
	readonly targetScope: Readonly<{ cssId: number }> | null;
	readonly order?: readonly string[];
	readonly captureTargetA: (handle: LynxPublicHandle | null) => void;
	readonly captureTargetB: (handle: LynxPublicHandle | null) => void;
}

const PortalScene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, (props: PortalSceneProps) => {
	const portal =
		props.target === null
			? null
			: universalTry(
					() =>
						props.order === undefined
							? createPortal(
									universalComponent(LYNX_TRANSPORT_RENDERER, PortalLeaf, {
										pending: props.pending,
										value: props.value,
										capture: props.capture,
									}),
									props.target,
								)
							: props.order.map((label) =>
									universalKey(
										label,
										createPortal(
											universalValue(portalFallbackPlan, [`portal-${label}`]),
											props.target,
										),
									),
								),
					() => universalValue(portalFallbackPlan, ['portal-fallback']),
				);
	return universalContext(
		PortalTheme,
		props.theme,
		universalValue(portalShellPlan, [
			'target-a',
			props.captureTargetA,
			props.targetScope,
			'ordinary-a-1',
			'ordinary-a-2',
			'target-b',
			props.captureTargetB,
			'ordinary-b-1',
			'ordinary-b-2',
			portal,
		]),
	);
});
let installed: InstalledEnvironment | null = null;
let backgroundRoot: LynxRoot | null = null;

function installEnvironment(
	beforeInstall?: (target: Record<string, unknown>) => void,
	wrapContext?: (context: LynxContextProxy) => LynxContextProxy,
): InstalledEnvironment {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, {
		window: dom.window as unknown as Window & typeof globalThis,
	});
	const env = globalThis.lynxTestingEnv;
	env.switchToMainThread();
	const target = globalThis as unknown as Record<string, unknown>;
	beforeInstall?.(target);
	const wrappedContext = wrapContext?.(mainContext(target));
	const main =
		wrappedContext === undefined
			? installLynxMainThread()
			: installLynxMainThread({ context: wrappedContext });
	env.switchToBackgroundThread();
	return (installed = { dom, env, main });
}

function backgroundContext(): LynxContextProxy {
	return (
		globalThis as typeof globalThis & {
			lynx: { getCoreContext(): LynxContextProxy };
		}
	).lynx.getCoreContext();
}

function mainContext(target: Record<string, unknown>): LynxContextProxy {
	return (
		target as {
			lynx: { getJSContext(): LynxContextProxy };
		}
	).lynx.getJSContext();
}

function sendLifecycleToBackground(env: LynxTestingEnv, message: Record<string, unknown>): void {
	const context = backgroundContext();
	env.switchToMainThread();
	try {
		context.dispatchEvent({ type: LYNX_MAIN_TO_BACKGROUND_EVENT, data: message });
	} finally {
		env.switchToBackgroundThread();
	}
}

function identity(root: number, version: number): UniversalTransportIdentity {
	return {
		protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
		renderer: LYNX_TRANSPORT_RENDERER,
		root,
		version,
	};
}

function publicHostHTML(element: Element): string {
	const clone = element.cloneNode(true) as Element;
	for (const node of clone.querySelectorAll(`[${LYNX_NODES_REF_ATTRIBUTE}]`)) {
		node.removeAttribute(LYNX_NODES_REF_ATTRIBUTE);
	}
	return clone.innerHTML;
}

afterEach(async () => {
	if (backgroundRoot !== null) {
		try {
			await backgroundRoot.unmount();
		} catch {
			// A fault test may already have terminally disposed the root.
		}
	}
	backgroundRoot = null;
	if (installed !== null) {
		installed.main.close();
		installed.env.clearGlobal();
		uninstallLynxTestingEnv(globalThis);
		installed.dom.window.close();
	}
	installed = null;
});

describe.sequential('@octanejs/lynx background root in the official JS environment', () => {
	it('rejects a main-thread target that exposes only common Lynx APIs', () => {
		const context = {} as LynxContextProxy;
		expect(() =>
			createLynxRoot({
				target: {
					lynx: {
						getCoreContext: () => context,
					},
				},
				context,
				scheduleMicrotask: (callback) => callback(),
			}),
		).toThrow('Octane Lynx roots are available only in the Lynx background runtime.');
	});

	it('applies the Lynx-only className alias in authored host order', async () => {
		const { dom } = installEnvironment();
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(classAliasFixture, {
			middle: { class: 'spread', className: 'spread-alias' },
			last: 'final',
		});

		expect(dom.window.document.querySelector('#class-alias-host')?.getAttribute('class')).toBe(
			'final',
		);
		expect(
			dom.window.document.querySelector('#component-class-name')?.getAttribute('data-received'),
		).toBe('component-value');
	});

	it('publishes copy-on-write page data and complete global snapshots through platform hooks', async () => {
		const { env } = installEnvironment();
		const runtime = (
			globalThis as typeof globalThis & {
				lynx: LifecycleTestRuntime;
			}
		).lynx;
		runtime.__presetData = { accountId: 'preset', presetOnly: true };
		runtime.__initData = undefined;
		runtime.__globalProps = {
			locale: 'en-GB',
			theme: 'light',
			preferences: { density: 'compact' },
		};
		const rawDataEvents: Record<string, unknown>[] = [];
		const rawGlobalEvents: Record<string, unknown>[] = [];
		const emitter = runtime.getJSModule('GlobalEventEmitter');
		emitter.addListener('onDataChanged', (data) => {
			rawDataEvents.push(data as Record<string, unknown>);
		});
		emitter.addListener('onGlobalPropsChanged', (data) => {
			rawGlobalEvents.push(data as Record<string, unknown>);
		});

		backgroundRoot = createLynxRoot();
		const seed = { accountId: 'account-a', stale: true, nested: { count: 1 } };
		sendLifecycleToBackground(env, {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-data',
			operation: 'replace',
			data: seed,
		});
		seed.accountId = 'mutated-after-delivery';
		seed.nested.count = 9;
		expect(runtime.__initData).toEqual({
			accountId: 'account-a',
			stale: true,
			nested: { count: 1 },
		});
		expect(runtime.__initData).not.toBe(seed);
		expect(rawDataEvents).toEqual([]);

		const renders: LifecycleSnapshot[] = [];
		const initChanges: Record<string, unknown>[] = [];
		const globalChanges: Record<string, unknown>[] = [];
		await backgroundRoot.render(LifecycleObserver, {
			onRender(snapshot) {
				renders.push(snapshot);
			},
			onInitDataChanged(data) {
				initChanges.push(data);
			},
			onGlobalPropsChanged(data) {
				globalChanges.push(data);
			},
		});
		expect(renders.at(-1)).toEqual({
			initData: { accountId: 'account-a', stale: true, nested: { count: 1 } },
			globalProps: {
				locale: 'en-GB',
				theme: 'light',
				preferences: { density: 'compact' },
			},
		});

		const beforeUpdate = runtime.__initData;
		const retainedPageBranch = beforeUpdate?.nested;
		const update = { count: 2 };
		sendLifecycleToBackground(env, {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-data',
			operation: 'update',
			data: update,
		});
		update.count = 99;
		await Promise.resolve();
		await Promise.resolve();
		await backgroundRoot.flushTransport();
		expect(runtime.__initData).not.toBe(beforeUpdate);
		expect(beforeUpdate).toEqual({
			accountId: 'account-a',
			stale: true,
			nested: { count: 1 },
		});
		expect(runtime.__initData).toEqual({
			accountId: 'account-a',
			stale: true,
			nested: { count: 1 },
			count: 2,
		});
		expect(runtime.__initData?.nested).toBe(retainedPageBranch);
		expect(rawDataEvents).toEqual([{ count: 2 }]);
		expect(initChanges.at(-1)).toEqual(runtime.__initData);

		sendLifecycleToBackground(env, {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-data',
			operation: 'reset',
			data: { accountId: 'account-b' },
		});
		await Promise.resolve();
		await Promise.resolve();
		await backgroundRoot.flushTransport();
		expect(runtime.__initData).toEqual({ accountId: 'account-b' });
		expect(rawDataEvents).toEqual([{ count: 2 }, { accountId: 'account-b' }]);
		expect(initChanges).toHaveLength(2);
		expect(initChanges.at(-1)).toEqual({ accountId: 'account-b' });

		const beforeGlobalUpdate = runtime.__globalProps;
		const retainedGlobalBranch = beforeGlobalUpdate.preferences;
		sendLifecycleToBackground(env, {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'global-props',
			patch: { theme: 'dark' },
		});
		await Promise.resolve();
		await Promise.resolve();
		await backgroundRoot.flushTransport();
		expect(runtime.__globalProps).not.toBe(beforeGlobalUpdate);
		expect(beforeGlobalUpdate).toEqual({
			locale: 'en-GB',
			theme: 'light',
			preferences: { density: 'compact' },
		});
		expect(runtime.__globalProps).toEqual({
			locale: 'en-GB',
			theme: 'dark',
			preferences: { density: 'compact' },
		});
		expect(runtime.__globalProps.preferences).toBe(retainedGlobalBranch);
		expect(rawGlobalEvents).toEqual([
			{ locale: 'en-GB', theme: 'dark', preferences: { density: 'compact' } },
		]);
		expect(globalChanges).toEqual([
			{ locale: 'en-GB', theme: 'dark', preferences: { density: 'compact' } },
		]);
		expect(renders.at(-1)).toEqual({
			initData: { accountId: 'account-b' },
			globalProps: {
				locale: 'en-GB',
				theme: 'dark',
				preferences: { density: 'compact' },
			},
		});

		await backgroundRoot.unmount();
		backgroundRoot = null;
		sendLifecycleToBackground(env, {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-data',
			operation: 'reset',
			data: { accountId: 'late' },
		});
		expect(runtime.__initData).toEqual({ accountId: 'late' });
		expect(rawDataEvents).toHaveLength(3);

		sendLifecycleToBackground(env, {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-destroy',
		});
		const destroyedData = runtime.__initData;
		sendLifecycleToBackground(env, {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-data',
			operation: 'update',
			data: { accountId: 'ignored' },
		});
		expect(runtime.__initData).toBe(destroyedData);
		expect(rawDataEvents).toHaveLength(3);
	});

	it('compacts reentrant background lifecycle overflow to the newest state', async () => {
		const { env } = installEnvironment();
		const runtime = (
			globalThis as typeof globalThis & {
				lynx: LifecycleTestRuntime;
			}
		).lynx;
		runtime.__presetData = { count: -1, retained: true };
		runtime.__initData = { count: -1, retained: true };
		runtime.__globalProps = {};
		const changes: Record<string, unknown>[] = [];
		const diagnostics: Error[] = [];
		let injected = false;
		runtime.getJSModule('GlobalEventEmitter').addListener('onDataChanged', (data) => {
			changes.push(data as Record<string, unknown>);
			if (injected) return;
			injected = true;
			for (let count = 1; count <= 129; count++) {
				sendLifecycleToBackground(env, {
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'page-data',
					operation: 'update',
					data: { count },
				});
			}
		});

		backgroundRoot = createLynxRoot({
			onDiagnostic(error) {
				diagnostics.push(error);
			},
		});
		await backgroundRoot.ready;
		sendLifecycleToBackground(env, {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-data',
			operation: 'update',
			data: { count: 0 },
		});

		expect(runtime.__initData).toEqual({ count: 129, retained: true });
		expect(changes).toEqual([{ count: 0 }, { count: 129 }]);
		expect(
			diagnostics.filter((error) => error.message.includes('compacted to current state')),
		).toHaveLength(1);
	});

	it('keeps one page receiver across overlap rejection and sequential roots', async () => {
		const { env } = installEnvironment();
		const runtime = (
			globalThis as typeof globalThis & {
				lynx: LifecycleTestRuntime;
			}
		).lynx;
		runtime.__presetData = { count: 0 };
		runtime.__initData = { count: 0 };
		runtime.__globalProps = {};
		const initChanges: Record<string, unknown>[] = [];
		const observerRoot = createUniversalRoot(
			createObjectContainer(LYNX_TRANSPORT_RENDERER),
			createObjectDriver(LYNX_TRANSPORT_RENDERER),
		);
		observerRoot.render(LifecycleObserver, {
			onRender() {},
			onInitDataChanged(data) {
				initChanges.push(data);
			},
			onGlobalPropsChanged() {},
		});

		const firstRoot = createLynxRoot();
		let secondRoot: LynxRoot | null = null;
		backgroundRoot = firstRoot;
		try {
			await firstRoot.ready;
			expect(() => createLynxRoot()).toThrow(/already has an installed background call bridge/);
			sendLifecycleToBackground(env, {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'page-data',
				operation: 'update',
				data: { count: 1 },
			});
			await Promise.resolve();
			await Promise.resolve();
			expect(runtime.__initData).toEqual({ count: 1 });
			expect(initChanges).toEqual([{ count: 1 }]);

			await firstRoot.unmount();
			backgroundRoot = null;
			sendLifecycleToBackground(env, {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'page-data',
				operation: 'update',
				data: { count: 2 },
			});
			await Promise.resolve();
			await Promise.resolve();
			expect(runtime.__initData).toEqual({ count: 2 });
			expect(initChanges).toEqual([{ count: 1 }, { count: 2 }]);

			const delegate = backgroundContext();
			const differentContext: LynxContextProxy = Object.freeze({
				dispatchEvent: (event) => delegate.dispatchEvent(event),
				addEventListener: (type, listener) => delegate.addEventListener(type, listener),
				removeEventListener: (type, listener) => delegate.removeEventListener(type, listener),
			});
			expect(() => createLynxRoot({ context: differentContext })).toThrow(/different ContextProxy/);

			secondRoot = createLynxRoot();
			backgroundRoot = secondRoot;
			await secondRoot.ready;
			sendLifecycleToBackground(env, {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'page-data',
				operation: 'update',
				data: { count: 3 },
			});
			await Promise.resolve();
			await Promise.resolve();
			expect(runtime.__initData).toEqual({ count: 3 });
			expect(initChanges).toEqual([{ count: 1 }, { count: 2 }, { count: 3 }]);
			await secondRoot.unmount();
			backgroundRoot = null;
		} finally {
			await firstRoot.unmount().catch(() => {});
			await secondRoot?.unmount().catch(() => {});
			if (backgroundRoot === firstRoot) backgroundRoot = null;
			if (backgroundRoot === secondRoot) backgroundRoot = null;
			observerRoot.unmount();
		}
	});

	it('atomically rolls back a mutating background lifecycle registration failure', () => {
		const dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, {
			window: dom.window as unknown as Window & typeof globalThis,
		});
		const env = globalThis.lynxTestingEnv;
		const registrationError = new Error('injected background lifecycle registration failure');
		try {
			env.switchToBackgroundThread();
			const runtime = (
				globalThis as typeof globalThis & {
					lynx: LifecycleTestRuntime;
				}
			).lynx;
			runtime.__initData = { count: 0 };
			const delegate = backgroundContext();
			const listeners = new Set<
				(event: { readonly type: string; readonly data: unknown }) => void
			>();
			let failRegistration = true;
			const context: LynxContextProxy = Object.freeze({
				dispatchEvent: (event) => delegate.dispatchEvent(event),
				addEventListener(type, listener) {
					delegate.addEventListener(type, listener);
					listeners.add(listener);
					if (type === LYNX_MAIN_TO_BACKGROUND_EVENT && failRegistration) {
						failRegistration = false;
						throw registrationError;
					}
				},
				removeEventListener(type, listener) {
					listeners.delete(listener);
					delegate.removeEventListener(type, listener);
				},
			});

			expect(() => createLynxRoot({ context })).toThrow(registrationError);
			expect(listeners.size).toBe(0);
			sendLifecycleToBackground(env, {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'page-data',
				operation: 'update',
				data: { count: 1 },
			});
			expect(runtime.__initData).toEqual({ count: 0 });
		} finally {
			env.switchToBackgroundThread();
			env.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('carries a reentrant page-destroy tombstone into transport startup', async () => {
		const dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, {
			window: dom.window as unknown as Window & typeof globalThis,
		});
		const env = globalThis.lynxTestingEnv;
		let root: LynxRoot | null = null;
		try {
			env.switchToBackgroundThread();
			const delegate = backgroundContext();
			const listeners = new Set<
				(event: { readonly type: string; readonly data: unknown }) => void
			>();
			let replayDestroy = true;
			const context: LynxContextProxy = Object.freeze({
				dispatchEvent: (event) => delegate.dispatchEvent(event),
				addEventListener(type, listener) {
					listeners.add(listener);
					delegate.addEventListener(type, listener);
					if (type === LYNX_MAIN_TO_BACKGROUND_EVENT && replayDestroy) {
						replayDestroy = false;
						listener({
							type,
							data: {
								protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
								renderer: LYNX_TRANSPORT_RENDERER,
								type: 'page-destroy',
							},
						});
					}
				},
				removeEventListener(type, listener) {
					listeners.delete(listener);
					delegate.removeEventListener(type, listener);
				},
			});

			root = createLynxRoot({ context });
			backgroundRoot = root;
			const rendering = root.render(SimpleScene, { id: 'destroyed-before-ready' });
			void rendering.catch(() => {});
			await expect(root.ready).rejects.toThrow(/native page lifetime was destroyed/);
			await expect(rendering).rejects.toThrow(/native page lifetime was destroyed/);
			await root.unmount();
			backgroundRoot = null;
			expect(listeners.size).toBe(0);
		} finally {
			await root?.unmount().catch(() => {});
			backgroundRoot = null;
			env.switchToBackgroundThread();
			env.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('starts when the background root is created before the main receiver', async () => {
		const dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, {
			window: dom.window as unknown as Window & typeof globalThis,
		});
		const env = globalThis.lynxTestingEnv;
		env.switchToBackgroundThread();
		backgroundRoot = createLynxRoot();
		const rendering = backgroundRoot.render(SimpleScene, { id: 'main-installed-late' });
		let settled = false;
		void rendering.finally(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);

		env.switchToMainThread();
		const main = installLynxMainThread();
		installed = { dom, env, main };
		env.switchToBackgroundThread();
		await rendering;

		expect(dom.window.document.querySelector('#main-installed-late')).not.toBeNull();
		expect(main.activeIdentity()).not.toBeNull();
	});

	it('fails a waiting background root before publishing readiness when native lifetime registration fails', async () => {
		const dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, {
			window: dom.window as unknown as Window & typeof globalThis,
		});
		const env = globalThis.lynxTestingEnv;
		const registrationError = new Error('injected native lifetime registration failure');
		try {
			env.switchToBackgroundThread();
			const inbound: LynxBackgroundInboundMessage[] = [];
			backgroundContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
				inbound.push(event.data as LynxBackgroundInboundMessage);
			});
			backgroundRoot = createLynxRoot();
			const rendering = backgroundRoot.render(SimpleScene, { id: 'must-not-become-ready' });
			void rendering.catch(() => {});

			env.switchToMainThread();
			const lynx = (
				globalThis as typeof globalThis & {
					lynx: { getNative(): LynxContextProxy };
				}
			).lynx;
			const native = lynx.getNative();
			Object.defineProperty(lynx, 'getNative', {
				configurable: true,
				value: () =>
					Object.freeze({
						dispatchEvent(event) {
							return native.dispatchEvent(event);
						},
						addEventListener(type, listener) {
							if (type === '__DestroyLifetime') throw registrationError;
							native.addEventListener(type, listener);
						},
						removeEventListener(type, listener) {
							native.removeEventListener(type, listener);
						},
					}),
			});

			expect(() => installLynxMainThread()).toThrow(registrationError);
			env.switchToBackgroundThread();
			await expect(rendering).rejects.toThrow(/native page lifetime was destroyed/);
			await backgroundRoot.unmount();
			backgroundRoot = null;

			expect(inbound.map((message) => message.type)).toEqual(['page-destroy']);
			expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		} finally {
			env.switchToBackgroundThread();
			if (backgroundRoot !== null) {
				try {
					await backgroundRoot.unmount();
				} catch {
					// The startup failure may already have completed logical teardown.
				}
			}
			backgroundRoot = null;
			env.clearGlobal();
			uninstallLynxTestingEnv(globalThis);
			dom.window.close();
		}
	});

	it('cancels an unaccepted render when unmounted before main is ready', async () => {
		const dom = new JSDOM('<!doctype html><html><body></body></html>');
		installLynxTestingEnv(globalThis, {
			window: dom.window as unknown as Window & typeof globalThis,
		});
		const env = globalThis.lynxTestingEnv;
		env.switchToBackgroundThread();
		backgroundRoot = createLynxRoot();
		const rendering = backgroundRoot.render(SimpleScene, { id: 'must-not-mount' });
		void rendering.catch(() => {});
		await expect(backgroundRoot.unmount()).resolves.toBeUndefined();
		await expect(rendering).rejects.toThrow(/unmounted before main became ready/);
		backgroundRoot = null;

		env.switchToMainThread();
		const main = installLynxMainThread();
		installed = { dom, env, main };
		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		env.switchToBackgroundThread();
	});

	it('proactively announces main-thread readiness to an already-listening background', () => {
		const inbound: LynxBackgroundInboundMessage[] = [];
		installEnvironment((target) => {
			mainContext(target).addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
				inbound.push(event.data as LynxBackgroundInboundMessage);
			});
		});

		expect(inbound).toEqual([
			{
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready',
				request: LYNX_READY_ANNOUNCEMENT_REQUEST,
			},
		]);
	});

	it('preserves explicit null props and stays unmounted after cleanup throws', async () => {
		const { dom, main } = installEnvironment();
		let received: null | undefined;
		const cleanupError = new Error('injected null-host cleanup failure');
		const NullScene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, (props: null) => {
			received = props;
			useLayoutEffect(
				() => () => {
					throw cleanupError;
				},
				[],
				'cleanup',
			);
			return null;
		});

		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(NullScene, null);
		expect(received).toBeNull();
		expect(main.activeIdentity()).not.toBeNull();
		const rootAfterFailure = backgroundRoot;
		await expect(rootAfterFailure.unmount()).rejects.toBe(cleanupError);
		backgroundRoot = null;

		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		await expect(rootAfterFailure.render(NullScene, null)).rejects.toThrow(/unmounted Lynx root/);
	});

	it('terminally disposes native state when an accepted handle snapshot is malformed', async () => {
		let corruptAcknowledgement = true;
		const { dom, main } = installEnvironment(undefined, (delegate) =>
			Object.freeze({
				dispatchEvent(event) {
					const data = event.data as {
						type?: unknown;
						handles?: readonly Record<string, unknown>[];
					};
					if (
						corruptAcknowledgement &&
						event.type === LYNX_MAIN_TO_BACKGROUND_EVENT &&
						data.type === 'ack' &&
						Array.isArray(data.handles) &&
						data.handles.length > 0
					) {
						corruptAcknowledgement = false;
						const first = data.handles[0];
						return delegate.dispatchEvent({
							...event,
							data: {
								...(event.data as Record<string, unknown>),
								handles: [
									{
										...first,
										snapshot: {
											...(first.snapshot as Record<string, unknown>),
											root: 999,
										},
									},
								],
							},
						});
					}
					return delegate.dispatchEvent(event);
				},
				addEventListener(type, listener) {
					delegate.addEventListener(type, listener);
				},
				removeEventListener(type, listener) {
					delegate.removeEventListener(type, listener);
				},
			}),
		);
		backgroundRoot = createLynxRoot();

		await expect(backgroundRoot.render(SimpleScene, { id: 'malformed-ack' })).rejects.toThrow(
			/snapshot\.root/,
		);
		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		await expect(backgroundRoot.unmount()).resolves.toBeUndefined();
		backgroundRoot = null;
	});

	it('rejects a commit dispatch that throws after ACK and cleans both sides', async () => {
		const { dom, main } = installEnvironment();
		const deliveryError = new Error('injected post-delivery commit failure');
		let failCommit = true;
		backgroundContext().addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
			if (failCommit && (event.data as { type?: unknown }).type === 'commit') {
				failCommit = false;
				throw deliveryError;
			}
		});
		const refs: Array<LynxPublicHandle | null> = [];
		const RefScene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, () =>
			universalValue(simplePlan, [
				universalProps([
					['set', 'id', 'post-delivery'],
					['set', 'ref', (handle: LynxPublicHandle | null) => refs.push(handle)],
				]),
			]),
		);
		backgroundRoot = createLynxRoot();

		await expect(backgroundRoot.render(RefScene, undefined)).rejects.toBe(deliveryError);
		expect(refs[0]).toMatchObject({ renderer: 'lynx', active: false });
		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		await expect(backgroundRoot.unmount()).resolves.toBeUndefined();
		expect(refs.at(-1)).toBeNull();
		backgroundRoot = null;
	});

	it('propagates a requested readiness reply delivery failure', () => {
		let failReadyReply = false;
		const deliveryError = new Error('injected readiness delivery failure');
		const { main } = installEnvironment(undefined, (delegate) =>
			Object.freeze({
				dispatchEvent(event) {
					if (
						failReadyReply &&
						event.type === LYNX_MAIN_TO_BACKGROUND_EVENT &&
						(event.data as { type?: unknown }).type === 'main-ready'
					) {
						throw deliveryError;
					}
					return delegate.dispatchEvent(event);
				},
				addEventListener(type, listener) {
					delegate.addEventListener(type, listener);
				},
				removeEventListener(type, listener) {
					delegate.removeEventListener(type, listener);
				},
			}),
		);
		failReadyReply = true;

		expect(() => {
			backgroundContext().dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'main-ready-request',
					request: 1,
				},
			});
		}).toThrow(deliveryError);
		expect(main.diagnostics()).toContain(deliveryError);
	});

	it('tears down background ownership when the public native page lifetime ends', async () => {
		const { dom, env, main } = installEnvironment();
		const logs: string[] = [];
		const counterRefs: Array<LynxPublicHandle | null> = [];
		let resolveCleanup!: () => void;
		const cleanedUp = new Promise<void>((resolve) => {
			resolveCleanup = resolve;
		});
		const props: FixtureProps = {
			label: 'lifetime',
			items: [],
			showDetails: false,
			fail: false,
			log(entry) {
				logs.push(entry);
				if (entry === 'passive-cleanup:0') resolveCleanup();
			},
			captureActions() {},
			captureRow() {},
			counterRef(handle) {
				counterRefs.push(handle);
			},
		};

		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(fixture, props);
		await backgroundRoot.flushTransport();
		const destroyedRoot = backgroundRoot;
		const counterHandle = counterRefs.at(-1)!;
		expect(counterHandle).not.toBeNull();
		expect(main.activeIdentity()).not.toBeNull();

		env.switchToMainThread();
		(
			globalThis as typeof globalThis & {
				lynx: { getNative(): LynxContextProxy };
			}
		).lynx
			.getNative()
			.dispatchEvent({ type: '__DestroyLifetime', data: [1] });
		env.switchToBackgroundThread();

		await cleanedUp;
		await destroyedRoot.unmount();
		backgroundRoot = null;

		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		expect(main.activeIdentity()).toBeNull();
		expect(counterHandle.active).toBe(false);
		expect(counterRefs.at(-1)).toBeNull();
		expect(logs).toEqual(expect.arrayContaining(['layout-cleanup:0', 'passive-cleanup:0']));
		await expect(destroyedRoot.render(fixture, props)).rejects.toThrow(/unmounted Lynx root/);
		expect(main.diagnostics()).toEqual([]);
	});

	it('mounts, updates state/context/conditionals, reorders keyed hosts, and unmounts', async () => {
		const { dom, main } = installEnvironment();
		const logs: string[] = [];
		const counterRefs: Array<LynxPublicHandle | null> = [];
		const rowRefs = new Map<string, LynxPublicHandle>();
		let actions: FixtureActions | null = null;
		const stableProps = {
			log(entry: string) {
				logs.push(entry);
			},
			captureActions(next: FixtureActions) {
				actions = next;
			},
			captureRow(id: string, handle: LynxPublicHandle | null) {
				if (handle !== null) rowRefs.set(id, handle);
			},
			counterRef(handle: LynxPublicHandle | null) {
				counterRefs.push(handle);
				logs.push(handle === null ? 'counter-ref:null' : 'counter-ref:' + handle.type);
			},
		};
		const props = (
			items: readonly FixtureItem[],
			overrides: Partial<Pick<FixtureProps, 'label' | 'showDetails' | 'fail'>> = {},
		): FixtureProps => ({
			...stableProps,
			label: overrides.label ?? 'initial',
			items,
			showDetails: overrides.showDetails ?? false,
			fail: overrides.fail ?? false,
		});
		const items = [
			{ id: 'a', value: 'A' },
			{ id: 'b', value: 'B' },
		] as const;

		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(fixture, props(items));
		await backgroundRoot.flushTransport();

		const page = dom.window.document.querySelector('page')!;
		const firstA = page.querySelector('#row-a')!;
		const firstB = page.querySelector('#row-b')!;
		const firstAHandle = rowRefs.get('a')!;
		const counterHandle = counterRefs.at(-1)!;
		expect(publicHostHTML(page)).toBe(
			'<view id="counter"><text>Count: 0</text></view>' +
				'<view id="summary"><text>summary</text></view>' +
				'<view id="rows"><view id="row-a"><text>initial:A</text></view>' +
				'<view id="row-b"><text>initial:B</text></view></view>' +
				'<view id="healthy"><text>healthy</text></view>',
		);
		expect(counterHandle).toMatchObject({
			renderer: 'lynx',
			root: expect.any(Number),
			id: expect.any(Number),
			type: 'view',
			generation: 1,
			active: true,
		});
		expect(counterHandle).not.toBeInstanceOf(dom.window.Node);
		expect(Object.isFrozen(counterHandle)).toBe(true);
		await counterHandle.setNativeProps({ title: 'set-through-selector-query' });
		expect(page.querySelector('#counter')?.getAttribute('title')).toBe(
			'set-through-selector-query',
		);
		await expect(counterHandle.measure()).rejects.toThrow(/not implemented/);
		expect(logs.indexOf('counter-ref:view')).toBeLessThan(logs.indexOf('layout:0'));
		expect(logs).toEqual(expect.arrayContaining(['counter-ref:view', 'layout:0', 'passive:0']));

		await backgroundRoot.render(
			fixture,
			props([items[1], items[0]], { label: 'updated', showDetails: true }),
		);
		await backgroundRoot.flushTransport();
		const rows = page.querySelector('#rows')!;
		expect([...rows.children]).toEqual([firstB, firstA]);
		expect(page.querySelector('#row-a')).toBe(firstA);
		expect(page.querySelector('#row-b')).toBe(firstB);
		expect(rowRefs.get('a')).toBe(firstAHandle);
		expect(page.querySelector('#row-b')?.textContent).toBe('updated:B');
		expect(page.querySelector('#details')?.textContent).toBe('details');
		expect(page.querySelector('#summary')).toBeNull();

		expect(actions).not.toBeNull();
		(actions as FixtureActions).increment();
		await backgroundRoot.flushTransport();
		expect(page.querySelector('#counter')?.textContent).toBe('Count: 1');
		expect(logs).toEqual(expect.arrayContaining(['layout-cleanup:0', 'layout:1', 'passive:1']));

		await backgroundRoot.render(
			fixture,
			props([items[1], items[0]], { label: 'updated', showDetails: true, fail: true }),
		);
		expect(page.querySelector('#caught')?.textContent).toBe('fixture render failure');

		await backgroundRoot.unmount();
		backgroundRoot = null;
		expect(page.innerHTML).toBe('');
		expect(counterHandle.active).toBe(false);
		await expect(counterHandle.setNativeProps({ title: 'late' })).rejects.toThrow(
			/replaced|disposed/,
		);
		expect(firstAHandle.active).toBe(false);
		expect(counterRefs.at(-1)).toBeNull();
		expect(logs).toEqual(
			expect.arrayContaining(['counter-ref:null', 'layout-cleanup:1', 'passive-cleanup:1']),
		);
		expect(main.activeIdentity()).toBeNull();
		expect(main.diagnostics()).toEqual([]);
	});

	it('rejects a fully staged invalid batch without changing the accepted public tree', () => {
		const { dom, main } = installEnvironment();
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				...identity(501, 1),
				type: 'commit',
				batch: {
					renderer: 'lynx',
					version: 1,
					commands: [
						{ op: 'create', id: 1, type: 'view', props: { id: 'survivor' } },
						{ op: 'insert', parent: null, id: 1, before: null },
					],
				},
			},
		});
		const page = dom.window.document.querySelector('page')!;
		const survivor = page.querySelector('#survivor')!;
		const before = page.innerHTML;

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				...identity(501, 3),
				type: 'commit',
				batch: {
					renderer: 'lynx',
					version: 3,
					commands: [
						{ op: 'create', id: 2, type: 'view', props: { id: 'never-visible' } },
						{ op: 'insert', parent: null, id: 2, before: 999 },
					],
				},
			},
		});

		expect(inbound.map((message) => message.type)).toEqual(['ack', 'complete', 'reject']);
		expect(page.innerHTML).toBe(before);
		expect(page.querySelector('#survivor')).toBe(survivor);
		expect(page.querySelector('#never-visible')).toBeNull();
		expect(main.activeIdentity()).toMatchObject({ root: 501, version: 1 });

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				...identity(501, 4),
				type: 'commit',
				batch: {
					renderer: 'lynx',
					version: 4,
					commands: [{ op: 'update', id: 1, props: { id: 'survivor-next' } }],
				},
			},
		});
		expect(page.querySelector('#survivor-next')).toBe(survivor);
		expect(main.activeIdentity()).toMatchObject({ root: 501, version: 4 });

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: { ...identity(501, 4), type: 'dispose' },
		});
		expect(page.innerHTML).toBe('');
		expect(inbound.at(-1)?.type).toBe('dispose-ack');
		expect(main.activeIdentity()).toBeNull();

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				...identity(501, 5),
				type: 'commit',
				batch: { renderer: 'lynx', version: 5, commands: [] },
			},
		});
		expect(inbound.at(-1)).toMatchObject({ root: 501, version: 5, type: 'reject' });
		expect(page.innerHTML).toBe('');
	});

	it('creates one page before commits and reuses it after rejection and root disposal', () => {
		const { dom, main } = installEnvironment();
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		const sendCommit = (
			root: number,
			version: number,
			commands: readonly Record<string, unknown>[],
		) => {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					...identity(root, version),
					type: 'commit',
					batch: { renderer: 'lynx', version, commands },
				},
			});
		};

		const page = dom.window.document.querySelector('page')!;
		expect(dom.window.document.querySelectorAll('page')).toHaveLength(1);
		sendCommit(601, 1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'invalid' } },
			{ op: 'insert', parent: null, id: 1, before: 999 },
		]);
		expect(inbound.at(-1)?.type).toBe('reject');
		expect(main.activeIdentity()).toBeNull();
		expect(page.innerHTML).toBe('');
		expect(dom.window.document.querySelectorAll('page')).toHaveLength(1);

		sendCommit(601, 1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'first-root' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		expect(page.querySelector('#first-root')).not.toBeNull();
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: { ...identity(601, 1), type: 'dispose' },
		});
		expect(inbound.at(-1)?.type).toBe('dispose-ack');
		expect(page.innerHTML).toBe('');

		sendCommit(602, 1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'second-root' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		expect(dom.window.document.querySelectorAll('page')).toHaveLength(1);
		expect(dom.window.document.querySelector('page')).toBe(page);
		expect(page.querySelector('#second-root')).not.toBeNull();
	});

	it('terminally disposes the last accepted version after a newer uncertain attempt', () => {
		const { dom, main } = installEnvironment();
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				...identity(603, 1),
				type: 'commit',
				batch: {
					renderer: 'lynx',
					version: 1,
					commands: [
						{ op: 'create', id: 1, type: 'view', props: { id: 'accepted-root' } },
						{ op: 'insert', parent: null, id: 1, before: null },
					],
				},
			},
		});

		const page = dom.window.document.querySelector('page')!;
		expect(page.querySelector('#accepted-root')).not.toBeNull();
		expect(main.activeIdentity()).toMatchObject({ root: 603, version: 1 });

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: { ...identity(603, 2), type: 'terminal-dispose' },
		});

		expect(page.innerHTML).toBe('');
		expect(inbound.at(-1)).toMatchObject({ root: 603, version: 2, type: 'dispose-ack' });
		expect(main.activeIdentity()).toBeNull();
	});

	it('places same-root portals without surrendering target ordering or retained identity', async () => {
		const { dom, main } = installEnvironment();
		const targetARefs: Array<LynxPublicHandle | null> = [];
		const targetBRefs: Array<LynxPublicHandle | null> = [];
		const portalRefs: Array<LynxPublicHandle | null> = [];
		const captureTargetA = (handle: LynxPublicHandle | null) => targetARefs.push(handle);
		const captureTargetB = (handle: LynxPublicHandle | null) => targetBRefs.push(handle);
		const capturePortal = (handle: LynxPublicHandle | null) => portalRefs.push(handle);
		const scope = Object.freeze({ cssId: 19 });
		const props = (
			target: LynxPublicHandle | null,
			overrides: Partial<
				Pick<PortalSceneProps, 'pending' | 'targetScope' | 'theme' | 'value'>
			> = {},
		): PortalSceneProps => ({
			target,
			pending: overrides.pending ?? null,
			targetScope: overrides.targetScope === undefined ? scope : overrides.targetScope,
			theme: overrides.theme ?? 'warm',
			value: overrides.value ?? 'ready',
			capture: capturePortal,
			captureTargetA,
			captureTargetB,
		});
		const InitialPortal = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, () =>
			createPortal(universalValue(portalFallbackPlan, ['never-mounted']), null),
		);

		backgroundRoot = createLynxRoot();
		await expect(backgroundRoot.render(InitialPortal, undefined)).rejects.toThrow(
			/Initial portals must wait for the target ref acknowledgement/,
		);
		const page = dom.window.document.querySelector('page')!;
		expect(page.children).toHaveLength(0);

		await backgroundRoot.render(PortalScene, props(null));
		const targetA = targetARefs.at(-1)!;
		const targetB = targetBRefs.at(-1)!;
		expect(targetA).toMatchObject({ active: true, attached: true, type: 'view' });
		expect(targetB).toMatchObject({ active: true, attached: true, type: 'view' });

		await backgroundRoot.render(PortalScene, props(targetA));
		const targetAElement = page.querySelector('#target-a')!;
		const targetBElement = page.querySelector('#target-b')!;
		const portalElement = page.querySelector('#portal-content')!;
		const portalHandle = portalRefs.at(-1)!;
		expect([...targetAElement.children].map((child) => child.id)).toEqual([
			'ordinary-a-1',
			'ordinary-a-2',
			'portal-content',
		]);
		expect(portalElement.getAttribute('data-theme')).toBe('warm');
		expect(portalElement.textContent).toBe('ready');

		await backgroundRoot.render(
			PortalScene,
			props(targetA, { theme: 'cool', value: 'context-updated' }),
		);
		expect(page.querySelector('#portal-content')).toBe(portalElement);
		expect(portalRefs.at(-1)).toBe(portalHandle);
		expect(portalElement.getAttribute('data-theme')).toBe('cool');
		expect(portalElement.textContent).toBe('context-updated');

		await backgroundRoot.render(
			PortalScene,
			props(targetB, { theme: 'cool', value: 'retargeted' }),
		);
		expect(targetAElement.querySelector('#portal-content')).toBeNull();
		expect(targetBElement.querySelector('#portal-content')).toBe(portalElement);
		expect([...targetBElement.children].map((child) => child.id)).toEqual([
			'ordinary-b-1',
			'ordinary-b-2',
			'portal-content',
		]);
		expect(portalRefs.at(-1)).toBe(portalHandle);

		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		await backgroundRoot.render(
			PortalScene,
			props(targetB, { pending, theme: 'cool', value: 'ignored' }),
		);
		expect(page.querySelector('#portal-content')).toBe(portalElement);
		expect(portalElement.hasAttribute('hidden')).toBe(true);
		expect(page.querySelector('#portal-fallback')).not.toBeNull();

		resolve('resolved');
		await pending;
		await Promise.resolve();
		await Promise.resolve();
		await backgroundRoot.flushTransport();
		expect(page.querySelector('#portal-content')).toBe(portalElement);
		expect(portalElement.hasAttribute('hidden')).toBe(false);
		expect(portalElement.textContent).toBe('resolved');
		expect(page.querySelector('#portal-fallback')).toBeNull();

		await backgroundRoot.render(
			PortalScene,
			props(targetA, { theme: 'cool', value: 'before-target-recreate' }),
		);
		expect(targetAElement.querySelector('#portal-content')).toBe(portalElement);

		await backgroundRoot.render(PortalScene, props(null, { targetScope: null }));
		expect(page.querySelector('#portal-content')).toBeNull();
		expect(portalHandle.active).toBe(false);

		const replacementTargetA = targetARefs.at(-1)!;
		expect(replacementTargetA).not.toBe(targetA);
		expect(targetA.active).toBe(false);
		await expect(
			backgroundRoot.render(PortalScene, props(targetA, { targetScope: null })),
		).rejects.toThrow(/current, active LynxPublicHandle from this root/);
		expect(page.querySelector('#portal-content')).toBeNull();

		await backgroundRoot.render(
			PortalScene,
			props(replacementTargetA, { targetScope: null, value: 'final' }),
		);
		const finalPortalHandle = portalRefs.at(-1)!;
		expect(page.querySelector('#target-a #portal-content')?.textContent).toBe('final');

		await backgroundRoot.unmount();
		backgroundRoot = null;
		expect(page.children).toHaveLength(0);
		expect(replacementTargetA.active).toBe(false);
		expect(targetB.active).toBe(false);
		expect(finalPortalHandle.active).toBe(false);
		expect(portalRefs.at(-1)).toBeNull();
		expect(main.activeIdentity()).toBeNull();
	});

	it('reorders keyed portal siblings within one acknowledged Lynx target', async () => {
		const { dom } = installEnvironment();
		const targetRefs: Array<LynxPublicHandle | null> = [];
		const props = (
			target: LynxPublicHandle | null,
			order: readonly string[],
		): PortalSceneProps => ({
			target,
			order,
			pending: null,
			value: 'unused',
			theme: 'unused',
			targetScope: Object.freeze({ cssId: 23 }),
			capture() {},
			captureTargetA: (handle) => targetRefs.push(handle),
			captureTargetB() {},
		});

		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(PortalScene, props(null, []));
		const target = targetRefs.at(-1)!;
		await backgroundRoot.render(PortalScene, props(target, ['first', 'second']));
		const targetElement = dom.window.document.querySelector('#target-a')!;
		const first = targetElement.querySelector('#portal-first')!;
		const second = targetElement.querySelector('#portal-second')!;
		expect([...targetElement.children].map((child) => child.id)).toEqual([
			'ordinary-a-1',
			'ordinary-a-2',
			'portal-first',
			'portal-second',
		]);

		await backgroundRoot.render(PortalScene, props(target, ['second', 'first']));
		expect([...targetElement.children].map((child) => child.id)).toEqual([
			'ordinary-a-1',
			'ordinary-a-2',
			'portal-second',
			'portal-first',
		]);
		expect(targetElement.children[2]).toBe(second);
		expect(targetElement.children[3]).toBe(first);

		await backgroundRoot.unmount();
		backgroundRoot = null;
		expect(dom.window.document.querySelector('page')?.children).toHaveLength(0);
	});

	it('serializes a commit dispatched reentrantly from Element PAPI application', () => {
		let reenter = false;
		const { dom, main } = installEnvironment((target) => {
			const context = mainContext(target);
			const setId = target.__SetID as (node: object, id: string | null) => void;
			target.__SetID = (node: object, id: string | null) => {
				setId(node, id);
				if (!reenter) return;
				reenter = false;
				context.dispatchEvent({
					type: LYNX_BACKGROUND_TO_MAIN_EVENT,
					data: {
						...identity(701, 3),
						type: 'commit',
						batch: {
							renderer: 'lynx',
							version: 3,
							commands: [{ op: 'update', id: 1, props: { id: 'reentrant' } }],
						},
					},
				});
			};
		});
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		const sendCommit = (version: number, commands: readonly Record<string, unknown>[]) => {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					...identity(701, version),
					type: 'commit',
					batch: { renderer: 'lynx', version, commands },
				},
			});
		};

		sendCommit(1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'initial' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		reenter = true;
		sendCommit(2, [{ op: 'update', id: 1, props: { id: 'outer' } }]);

		expect(
			inbound.map((message) =>
				'version' in message ? `${message.type}:${message.version}` : message.type,
			),
		).toEqual(['ack:1', 'complete:1', 'ack:2', 'complete:2', 'ack:3', 'complete:3']);
		expect(main.activeIdentity()).toMatchObject({ root: 701, version: 3 });
		expect(publicHostHTML(dom.window.document.querySelector('page')!)).toBe(
			'<view id="reentrant"></view>',
		);
	});

	it('fail-stops an accepted root when completion delivery and immediate cleanup fail', async () => {
		const deliveryError = new Error('injected completion delivery failure');
		const cleanupError = new Error('injected completion cleanup failure');
		let failCleanup = true;
		const { dom, main } = installEnvironment(
			(target) => {
				const remove = target.__RemoveElement as (parent: object, child: object) => unknown;
				target.__RemoveElement = (parent: object, child: object) => {
					if (!failCleanup) return remove(parent, child);
					failCleanup = false;
					throw cleanupError;
				};
			},
			(delegate) =>
				Object.freeze({
					dispatchEvent(event) {
						if (
							event.type === LYNX_MAIN_TO_BACKGROUND_EVENT &&
							(event.data as { type?: unknown }).type === 'complete'
						) {
							throw deliveryError;
						}
						return delegate.dispatchEvent(event);
					},
					addEventListener(type, listener) {
						delegate.addEventListener(type, listener);
					},
					removeEventListener(type, listener) {
						delegate.removeEventListener(type, listener);
					},
				}),
		);
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});

		expect(() => {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					...identity(751, 1),
					type: 'commit',
					batch: {
						renderer: 'lynx',
						version: 1,
						commands: [
							{ op: 'create', id: 1, type: 'view', props: { id: 'accepted' } },
							{ op: 'insert', parent: null, id: 1, before: null },
						],
					},
				},
			});
		}).toThrow(deliveryError);
		expect(inbound.map(({ type }) => type)).toEqual(['ack']);
		expect(main.activeIdentity()).toMatchObject({ root: 751, version: 1 });
		expect(dom.window.document.querySelector('#accepted')).not.toBeNull();
		expect(main.diagnostics()).toContain(deliveryError);
		expect(main.diagnostics()).toContain(cleanupError);
		await expect(
			main.callBackground({ _jsFnId: 'app:after-completion-fault' }, []).promise,
		).rejects.toThrow('Octane Lynx main-thread root is faulted');

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				...identity(751, 1),
				type: 'call-main',
				call: 1,
				worklet: { _wkltId: 'app:after-completion-fault' },
				args: [],
			},
		});
		expect(inbound.at(-1)).toMatchObject({
			type: 'call-main-error',
			error: { message: 'Octane Lynx main-thread root is faulted.' },
		});

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: { ...identity(751, 1), type: 'terminal-dispose' },
		});
		expect(inbound.at(-1)?.type).toBe('dispose-ack');
		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('#accepted')).toBeNull();
	});

	it('propagates dispose acknowledgement failure after native cleanup completes', () => {
		let failDisposeAcknowledgement = false;
		const deliveryError = new Error('injected dispose acknowledgement delivery failure');
		const { dom, main } = installEnvironment(undefined, (delegate) =>
			Object.freeze({
				dispatchEvent(event) {
					if (
						failDisposeAcknowledgement &&
						event.type === LYNX_MAIN_TO_BACKGROUND_EVENT &&
						(event.data as { type?: unknown }).type === 'dispose-ack'
					) {
						throw deliveryError;
					}
					return delegate.dispatchEvent(event);
				},
				addEventListener(type, listener) {
					delegate.addEventListener(type, listener);
				},
				removeEventListener(type, listener) {
					delegate.removeEventListener(type, listener);
				},
			}),
		);
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				...identity(761, 1),
				type: 'commit',
				batch: {
					renderer: 'lynx',
					version: 1,
					commands: [
						{ op: 'create', id: 1, type: 'view', props: { id: 'dispose-target' } },
						{ op: 'insert', parent: null, id: 1, before: null },
					],
				},
			},
		});
		failDisposeAcknowledgement = true;

		expect(() => {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: { ...identity(761, 1), type: 'dispose' },
			});
		}).toThrow(deliveryError);
		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		expect(main.diagnostics()).toContain(deliveryError);

		failDisposeAcknowledgement = false;
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: { ...identity(761, 1), type: 'dispose' },
		});
		expect(inbound.at(-1)?.type).toBe('dispose-ack');
	});

	it('withholds dispose acknowledgement until native cleanup succeeds on retry', () => {
		let failRemove = false;
		const { dom, main } = installEnvironment((target) => {
			const remove = target.__RemoveElement as (parent: object, child: object) => unknown;
			target.__RemoveElement = (parent: object, child: object) => {
				if (failRemove) {
					failRemove = false;
					throw new Error('injected cleanup failure');
				}
				return remove(parent, child);
			};
		});
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				...identity(801, 1),
				type: 'commit',
				batch: {
					renderer: 'lynx',
					version: 1,
					commands: [
						{ op: 'create', id: 1, type: 'view', props: { id: 'cleanup-target' } },
						{ op: 'insert', parent: null, id: 1, before: null },
					],
				},
			},
		});
		const dispose = { ...identity(801, 1), type: 'dispose' } as const;
		failRemove = true;
		context.dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data: dispose });

		expect(inbound.filter(({ type }) => type === 'dispose-ack')).toHaveLength(0);
		expect(inbound.at(-1)).toMatchObject({
			root: 801,
			version: 1,
			type: 'dispose-retry',
			error: { message: 'injected cleanup failure' },
		});
		expect(main.activeIdentity()).toMatchObject({ root: 801, version: 1 });
		expect(dom.window.document.querySelector('#cleanup-target')).not.toBeNull();
		expect(main.diagnostics().map(({ message }) => message)).toEqual(
			expect.arrayContaining([
				'injected cleanup failure',
				expect.stringContaining('withheld dispose acknowledgement'),
			]),
		);

		context.dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data: dispose });
		expect(inbound.filter(({ type }) => type === 'dispose-ack')).toHaveLength(1);
		expect(main.activeIdentity()).toBeNull();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
	});

	it('settles public unmount after retrying a transient native cleanup failure', async () => {
		let failTextUpdate = false;
		let failRemove = false;
		const { dom, main } = installEnvironment((target) => {
			const setAttribute = target.__SetAttribute as (
				node: object,
				name: string,
				value: unknown,
			) => void;
			target.__SetAttribute = (node: object, name: string, value: unknown) => {
				setAttribute(node, name, value);
				if (failTextUpdate && name === 'text') {
					failTextUpdate = false;
					throw new Error('injected host fault before terminal cleanup');
				}
			};
			const remove = target.__RemoveElement as (parent: object, child: object) => unknown;
			target.__RemoveElement = (parent: object, child: object) => {
				if (failRemove) {
					failRemove = false;
					throw new Error('injected transient cleanup failure');
				}
				return remove(parent, child);
			};
		});
		const props = (label: string): FixtureProps => ({
			label,
			items: [{ id: 'a', value: 'A' }],
			showDetails: false,
			fail: false,
			log() {},
			captureActions() {},
			captureRow() {},
			counterRef() {},
		});

		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(fixture, props('initial'));
		failTextUpdate = true;
		await expect(backgroundRoot.render(fixture, props('faulted'))).rejects.toThrow(
			'injected host fault before terminal cleanup',
		);

		failRemove = true;
		await expect(backgroundRoot.unmount()).resolves.toBeUndefined();
		backgroundRoot = null;
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		expect(main.activeIdentity()).toBeNull();
		expect(main.diagnostics().map(({ message }) => message)).toEqual(
			expect.arrayContaining(['injected transient cleanup failure']),
		);
	});

	it('withholds public dispose acknowledgement until a failed final-batch flush is retried', async () => {
		const acceptedFailure = new Error('injected accepted final flush failure');
		const retryFailure = new Error('injected terminal retry flush failure');
		const failures = [acceptedFailure, retryFailure];
		const timeline: string[] = [];
		let trackFinalFlush = false;
		let failureIndex = 0;
		const { dom, main } = installEnvironment((target) => {
			const flush = target.__FlushElementTree as (page?: object) => void;
			target.__FlushElementTree = (page?: object) => {
				if (!trackFinalFlush) return flush(page);
				const failure = failures[failureIndex++];
				if (failure !== undefined) {
					timeline.push(
						failure === acceptedFailure ? 'flush:accepted-failure' : 'flush:retry-failure',
					);
					throw failure;
				}
				timeline.push('flush:success');
				return flush(page);
			};
		});
		backgroundContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			const type = (event.data as { type?: unknown }).type;
			if (type === 'dispose-retry' || type === 'dispose-ack') timeline.push(`message:${type}`);
		});
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(SimpleScene, { id: 'final-flush-target' });
		trackFinalFlush = true;
		const unmountedRoot = backgroundRoot;

		await expect(unmountedRoot.unmount()).rejects.toThrow(acceptedFailure.message);
		backgroundRoot = null;

		expect(timeline).toEqual([
			'flush:accepted-failure',
			'flush:retry-failure',
			'message:dispose-retry',
			'flush:success',
			'message:dispose-ack',
		]);
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		expect(main.activeIdentity()).toBeNull();
		expect(main.diagnostics().map(({ message }) => message)).toEqual(
			expect.arrayContaining([
				'injected terminal retry flush failure',
				expect.stringContaining('withheld dispose acknowledgement'),
			]),
		);
	});

	it('acknowledges an irreversible PAPI fault once, then accepts cleanup-only teardown', () => {
		let failSetId = false;
		const { dom, main } = installEnvironment((target) => {
			const setId = target.__SetID as (node: object, id: string | null) => void;
			target.__SetID = (node: object, id: string | null) => {
				setId(node, id);
				if (failSetId) {
					failSetId = false;
					throw new Error('injected PAPI fault');
				}
			};
		});
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		const sendCommit = (version: number, commands: readonly Record<string, unknown>[]) => {
			context.dispatchEvent({
				type: LYNX_BACKGROUND_TO_MAIN_EVENT,
				data: {
					...identity(777, version),
					type: 'commit',
					batch: { renderer: 'lynx', version, commands },
				},
			});
		};

		sendCommit(1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'before-fault' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		const page = dom.window.document.querySelector('page')!;
		failSetId = true;
		sendCommit(2, [{ op: 'update', id: 1, props: { id: 'after-fault' } }]);

		expect(page.querySelector('#after-fault')).not.toBeNull();
		expect(
			inbound
				.filter((message) => message.root === 777 && message.version === 2)
				.map(({ type }) => type),
		).toEqual(['ack', 'fault']);
		expect(inbound.filter((message) => message.type === 'fault')).toHaveLength(1);
		expect(main.activeIdentity()).toMatchObject({ root: 777, version: 2 });

		sendCommit(3, [
			{ op: 'remove', parent: null, id: 1 },
			{ op: 'destroy', id: 1 },
		]);
		expect(
			inbound
				.filter((message) => message.root === 777 && message.version === 3)
				.map(({ type }) => type),
		).toEqual(['ack', 'complete']);
		// Cleanup-only acceptance intentionally leaves the faulted physical tree for dispose.
		expect(page.querySelector('#after-fault')).not.toBeNull();

		context.dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: { ...identity(777, 3), type: 'dispose' },
		});
		expect(page.innerHTML).toBe('');
		expect(inbound.at(-1)?.type).toBe('dispose-ack');
		expect(main.activeIdentity()).toBeNull();
	});
});
