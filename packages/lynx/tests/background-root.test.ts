import { JSDOM } from 'jsdom';
import {
	installLynxTestingEnv,
	type LynxTestingEnv,
	uninstallLynxTestingEnv,
} from '@lynx-js/testing-environment';
import {
	defineUniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
	useLayoutEffect,
	type UniversalComponent,
	type UniversalTransportIdentity,
} from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { createLynxRoot, type LynxPublicHandle, type LynxRoot } from '../src/index.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import { LYNX_NODES_REF_ATTRIBUTE } from '../src/core/nodes-ref.js';
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
