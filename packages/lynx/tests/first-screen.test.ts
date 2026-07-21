import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import {
	defineUniversalComponent,
	universalFor,
	universalPlan,
	universalProps,
	universalValue,
	useLayoutEffect,
	type UniversalComponent,
} from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { createLynxRoot, type LynxRoot } from '../src/index.js';
import { root as firstScreenRoot } from '../src/first-screen.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import {
	defineUniversalComponent as defineFirstScreenComponent,
	firstScreenEvent,
	renderLynxFirstScreen,
	universalFor as firstScreenFor,
	universalPlan as firstScreenPlan,
	universalProps as firstScreenProps,
	universalValue as firstScreenValue,
	useLayoutEffect as useFirstScreenLayoutEffect,
} from '../src/main-renderer.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	type LynxBackgroundInboundMessage,
	type LynxContextProxy,
} from '../src/core/protocol.js';

interface SceneProps {
	readonly id: string;
	readonly items: readonly string[];
	readonly onTap: (payload: unknown) => void;
	readonly onEffect: (owner: 'main' | 'background') => void;
}

interface EventRegistration {
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

const MainScene = defineFirstScreenComponent('lynx', (props: SceneProps) => {
	useFirstScreenLayoutEffect(() => {
		props.onEffect('main');
	});
	return [
		firstScreenValue(mainPlan, [
			firstScreenProps([
				['set', 'id', props.id],
				['set', 'bindtap', firstScreenEvent],
			]),
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

const backgroundPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
});

const BackgroundScene = defineUniversalComponent('lynx', (props: SceneProps) => {
	useLayoutEffect(() => {
		props.onEffect('background');
	}, []);
	return [
		universalValue(backgroundPlan, [
			universalProps([
				['set', 'id', props.id],
				['set', 'bindtap', props.onTap],
			]),
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
		registrations.push(Object.freeze({ listener }));
		addEvent(node, kind, name, listener);
	};
	const main = installLynxMainThread({ firstScreen: true, firstScreenSync: 'manual' });
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
	it('paints synchronously, gates background startup, adopts node identity, and replays events', async () => {
		const { dom, main, registrations } = installEnvironment();
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		const effects: string[] = [];
		const events: unknown[] = [];
		let placeholderToken: string | undefined;
		const props: SceneProps = {
			id: 'first-screen',
			items: ['a', 'b'],
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
			onEffect(owner) {
				effects.push(owner);
			},
		};

		const painted = firstScreenRoot.render(MainScene as UniversalComponent<SceneProps>, props);
		const firstNode = dom.window.document.querySelector('#first-screen');
		const firstA = dom.window.document.querySelector('#a');
		const firstB = dom.window.document.querySelector('#b');
		expect(painted).toMatchObject({ hostCount: 3, logicalCount: 5 });
		expect(firstNode).not.toBeNull();
		expect(firstA).not.toBeNull();
		expect(firstB).not.toBeNull();
		expect(effects).toEqual([]);
		expect(main.firstScreenSnapshot()).toMatchObject({ root: 1, version: 1 });

		placeholderToken = registrations.find((entry) => entry.listener !== undefined)?.listener;
		expect(placeholderToken).toBeTypeOf('string');
		main.dispatchNativeEvent(placeholderToken!, { type: 'tap', detail: { phase: 'first' } });

		globalThis.lynxTestingEnv.switchToBackgroundThread();
		backgroundRoot = createLynxRoot();
		const rendering = backgroundRoot.render(BackgroundScene, props);
		let settled = false;
		void rendering.finally(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		expect(events).toEqual([]);

		globalThis.lynxTestingEnv.switchToMainThread();
		main.markFirstScreenSyncReady();
		globalThis.lynxTestingEnv.switchToBackgroundThread();
		await rendering;

		expect(dom.window.document.querySelector('#first-screen')).toBe(firstNode);
		expect(dom.window.document.querySelector('#a')).toBe(firstA);
		expect(dom.window.document.querySelector('#b')).toBe(firstB);
		expect(effects).toEqual(['background']);
		expect(main.diagnostics()).toEqual([]);
		expect(events).toEqual([
			{ type: 'tap', detail: { phase: 'first' } },
			{ type: 'tap', detail: { phase: 'reentrant' } },
		]);
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(main.activeIdentity()).toMatchObject({ root: 1, version: 1 });
		const ready = inbound.filter((message) => message.type === 'main-ready');
		expect(ready).toHaveLength(1);
		expect(ready[0]).toMatchObject({
			type: 'main-ready',
			firstTree: { root: 1, version: 1 },
		});
		expect((ready[0] as { request: number }).request).toBeGreaterThan(0);
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
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		main.markFirstScreenSyncReady();

		const replacement = renderLynxFirstScreen(MainScene, {
			...props,
			id: 'background-value',
		});
		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 1,
				version: 1,
				type: 'commit',
				batch: replacement.batch,
			},
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

	it('can seal an entry with no first-screen render and unblock background readiness', () => {
		const { main } = installEnvironment();
		const inbound: LynxBackgroundInboundMessage[] = [];
		mainContext().addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
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
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		firstScreenRoot.render(MainSingleHost, { id: 'cleanup-retry' });

		await firstScreenRoot.unmount();
		expect(dom.window.document.querySelector('#cleanup-retry')).not.toBeNull();
		expect(main.firstScreenSnapshot()).not.toBeNull();
		expect(inbound).toEqual([]);

		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready-request',
				request: 43,
			},
		});
		expect(dom.window.document.querySelector('#cleanup-retry')).toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(inbound).toEqual([expect.objectContaining({ type: 'main-ready', request: 43 })]);
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
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});

		expect(() => firstScreenRoot.render(MainSingleHost, { id: 'failed-capture' })).toThrow(
			captureFailure,
		);
		expect(dom.window.document.querySelector('#failed-capture')).not.toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
		expect(inbound).toEqual([]);

		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready-request',
				request: 41,
			},
		});
		expect(dom.window.document.querySelector('#failed-capture')).not.toBeNull();
		expect(inbound).toEqual([]);

		backgroundContext().dispatchEvent({
			type: LYNX_BACKGROUND_TO_MAIN_EVENT,
			data: {
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready-request',
				request: 42,
			},
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
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});
		firstScreenRoot.render(MainSingleHost, { id: 'terminal-retry' });
		const dispose = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root: 1,
			version: 1,
			type: 'terminal-dispose' as const,
		};

		backgroundContext().dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data: dispose });
		expect(inbound.at(-1)).toMatchObject({ type: 'dispose-retry', root: 1, version: 1 });
		expect(dom.window.document.querySelector('#terminal-retry')).not.toBeNull();
		expect(main.firstScreenSnapshot()).not.toBeNull();

		backgroundContext().dispatchEvent({ type: LYNX_BACKGROUND_TO_MAIN_EVENT, data: dispose });
		expect(inbound.at(-1)).toMatchObject({ type: 'dispose-ack', root: 1, version: 1 });
		expect(dom.window.document.querySelector('#terminal-retry')).toBeNull();
		expect(main.firstScreenSnapshot()).toBeNull();
	});
});
