import { installLynxTestingEnv, uninstallLynxTestingEnv } from '@lynx-js/testing-environment';
import { JSDOM } from 'jsdom';
import {
	defineUniversalComponent,
	universalActivity,
	universalPlan,
	universalProps,
	universalValue,
	type UniversalHostCommand,
} from 'octane/universal/native';
import { afterEach, describe, expect, it } from 'vitest';
import { createLynxRoot, type LynxPublicHandle, type LynxRoot } from '../src/index.js';
import { installLynxMainThread, type LynxMainThreadController } from '../src/main-thread.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	type LynxBackgroundInboundMessage,
	type LynxContextProxy,
} from '../src/core/protocol.js';
import { encodeLynxPortalTargetId } from '../src/core/portal.js';

type Handler = ((payload: unknown) => void) | null;

interface EventSceneProps {
	readonly bindtap?: Handler;
	readonly catchtap?: Handler;
	readonly bindscroll?: Handler;
	readonly ref?: (handle: LynxPublicHandle | null) => void;
}

interface EventRegistration {
	readonly kind: string;
	readonly name: string;
	readonly listener: string | undefined;
}

interface InstalledEnvironment {
	readonly dom: JSDOM;
	readonly main: LynxMainThreadController;
	readonly registrations: EventRegistration[];
}

const eventPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
});

const EventScene = defineUniversalComponent('lynx', (props: EventSceneProps) =>
	universalValue(eventPlan, [
		universalProps([
			['set', 'id', 'event-target'],
			['set', 'bindtap', props.bindtap],
			['set', 'catchtap', props.catchtap],
			['set', 'bindscroll', props.bindscroll],
			['set', 'ref', props.ref],
		]),
	]),
);

const ActivityEventScene = defineUniversalComponent(
	'lynx',
	(props: EventSceneProps & { readonly mode: 'visible' | 'hidden' }) =>
		universalActivity(props.mode, () =>
			universalValue(eventPlan, [
				universalProps([
					['set', 'id', 'event-target'],
					['set', 'bindtap', props.bindtap],
					['set', 'ref', props.ref],
				]),
			]),
		),
);

let installed: InstalledEnvironment | null = null;
let backgroundRoot: LynxRoot | null = null;

function nativePayload(type: string, detail: Readonly<Record<string, unknown>> = {}) {
	return {
		type,
		timestamp: 10,
		detail,
		target: { id: 'event-target', uid: 2, dataset: { source: 'target' } },
		currentTarget: { id: 'event-target', uid: 2, dataset: { source: 'current' } },
		preventDefault() {
			throw new Error('live event methods must not cross threads');
		},
	};
}

function installEnvironment(
	customize?: (
		target: Record<string, unknown>,
		readMain: () => LynxMainThreadController | null,
		readRegistrations: () => readonly EventRegistration[],
	) => void,
	wrapContext?: (context: LynxContextProxy) => LynxContextProxy,
): InstalledEnvironment {
	const dom = new JSDOM('<!doctype html><html><body></body></html>');
	installLynxTestingEnv(globalThis, {
		window: dom.window as unknown as Window & typeof globalThis,
	});
	const env = globalThis.lynxTestingEnv;
	env.switchToMainThread();
	const target = globalThis as unknown as Record<string, unknown>;
	const registrations: EventRegistration[] = [];
	const addEvent = target.__AddEvent as (
		node: object,
		kind: string,
		name: string,
		listener: string | undefined,
	) => void;
	target.__AddEvent = (node: object, kind: string, name: string, listener: string | undefined) => {
		registrations.push(Object.freeze({ kind, name, listener }));
		addEvent(node, kind, name, listener);
	};
	let main: LynxMainThreadController | null = null;
	customize?.(
		target,
		() => main,
		() => registrations,
	);
	const wrappedContext = wrapContext?.(
		(
			target as {
				lynx: { getJSContext(): LynxContextProxy };
			}
		).lynx.getJSContext(),
	);
	main =
		wrappedContext === undefined
			? installLynxMainThread()
			: installLynxMainThread({ context: wrappedContext });
	env.switchToBackgroundThread();
	return (installed = { dom, main, registrations });
}

function activeToken(
	registrations: readonly EventRegistration[],
	kind: string,
	name: string,
): string {
	const registration = registrations.find(
		(entry) => entry.kind === kind && entry.name === name && entry.listener !== undefined,
	);
	if (registration?.listener === undefined) throw new Error(`Missing ${kind}:${name} token.`);
	return registration.listener;
}

function backgroundContext(): LynxContextProxy {
	return (
		globalThis as typeof globalThis & {
			lynx: { getCoreContext(): LynxContextProxy };
		}
	).lynx.getCoreContext();
}

function nativeContext(): LynxContextProxy {
	globalThis.lynxTestingEnv.switchToMainThread();
	return (
		globalThis as typeof globalThis & {
			lynx: { getNative(): LynxContextProxy };
		}
	).lynx.getNative();
}

function dispatchCommit(
	context: LynxContextProxy,
	root: number,
	version: number,
	commands: readonly UniversalHostCommand[],
): void {
	context.dispatchEvent({
		type: LYNX_BACKGROUND_TO_MAIN_EVENT,
		data: {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			root,
			version,
			type: 'commit',
			batch: { renderer: LYNX_TRANSPORT_RENDERER, version, commands },
		},
	});
}

afterEach(async () => {
	if (backgroundRoot !== null) {
		try {
			await backgroundRoot.unmount();
		} catch {
			// Accepted-fault tests may already have terminally disposed their root.
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

describe.sequential('Lynx main-thread native event bridge', () => {
	it('tears down the active page when the public native lifetime is destroyed', () => {
		const { dom, main } = installEnvironment();
		dispatchCommit(backgroundContext(), 89, 1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'lifetime-root' } },
			{ op: 'create', id: 2, type: 'text', props: {} },
			{ op: 'create', id: 3, type: '#text', props: { value: 'alive' } },
			{ op: 'insert', parent: 2, id: 3, before: null },
			{ op: 'insert', parent: 1, id: 2, before: null },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		const page = dom.window.document.querySelector('page')!;

		expect(page.querySelector('#lifetime-root')?.textContent).toBe('alive');
		expect(page.children).toHaveLength(1);
		expect(main.activeIdentity()).toMatchObject({ root: 89, version: 1 });

		nativeContext().dispatchEvent({
			type: '__DestroyLifetime',
			data: [1],
		});

		expect(page.innerHTML).toBe('');
		expect(main.activeIdentity()).toBeNull();
		expect(main.diagnostics()).toEqual([]);

		// A late delivery is inert and diagnosable after lifetime teardown.
		main.dispatchNativeEvent('late-native-event', { detail: { phase: 'late' } });
		expect(main.diagnostics().at(-1)?.message).toBe(
			'Octane Lynx received a native event after the main receiver closed.',
		);
		expect(page.innerHTML).toBe('');
	});

	it('still closes native state when the background lifetime notification cannot be delivered', () => {
		const deliveryError = new Error('injected page-destroy delivery failure');
		const { dom, main } = installEnvironment(undefined, (delegate) =>
			Object.freeze({
				dispatchEvent(event) {
					if (
						event.type === LYNX_MAIN_TO_BACKGROUND_EVENT &&
						(event.data as { readonly type?: unknown }).type === 'page-destroy'
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
		dispatchCommit(backgroundContext(), 88, 1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'delivery-failure-root' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);

		expect(() =>
			nativeContext().dispatchEvent({ type: '__DestroyLifetime', data: [1] }),
		).not.toThrow();
		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		expect(main.activeIdentity()).toBeNull();
		expect(main.diagnostics()).toContain(deliveryError);
	});

	it('lets active PAPI work unwind without applying later host work after lifetime teardown', async () => {
		let destroyOnFlush = true;
		let destroyBroadcasts = 0;
		let observedPostDestroyAddition = false;
		let observer: MutationObserver | null = null;
		const queuedCommitResponses: string[] = [];
		const { dom, main } = installEnvironment(
			(target) => {
				const flush = target.__FlushElementTree as (node?: object) => void;
				target.__FlushElementTree = (node?: object) => {
					flush.call(target, node);
					if (!destroyOnFlush) return;
					destroyOnFlush = false;
					const page = node as Element;
					const MutationObserver = page.ownerDocument.defaultView!.MutationObserver;
					observer = new MutationObserver((records) => {
						for (const record of records) {
							for (const added of record.addedNodes) {
								if (
									added instanceof page.ownerDocument.defaultView!.Element &&
									(added.id === 'queued-after-destroy' ||
										added.querySelector('#queued-after-destroy') !== null)
								) {
									observedPostDestroyAddition = true;
								}
							}
						}
					});
					observer.observe(page, { childList: true, subtree: true });
					const lynx = (
						target as {
							lynx: {
								getJSContext(): LynxContextProxy;
								getNative(): LynxContextProxy;
							};
						}
					).lynx;
					dispatchCommit(lynx.getJSContext(), 87, 2, [
						{ op: 'create', id: 2, type: 'view', props: { id: 'queued-after-destroy' } },
						{ op: 'insert', parent: null, id: 2, before: null },
					]);
					lynx.getNative().dispatchEvent({ type: '__DestroyLifetime', data: [1] });
					lynx.getNative().dispatchEvent({ type: '__DestroyLifetime', data: [1] });
				};
			},
			(delegate) =>
				Object.freeze({
					dispatchEvent(event) {
						if (event.type === LYNX_MAIN_TO_BACKGROUND_EVENT) {
							const message = event.data as {
								readonly root?: unknown;
								readonly version?: unknown;
								readonly type?: unknown;
							};
							if (message.type === 'page-destroy') destroyBroadcasts++;
							if (
								message.root === 87 &&
								message.version === 2 &&
								typeof message.type === 'string'
							) {
								queuedCommitResponses.push(message.type);
							}
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

		dispatchCommit(context, 87, 1, [
			{ op: 'create', id: 1, type: 'view', props: { id: 'reentrant-destroy-root' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);

		expect(dom.window.document.querySelector('page')?.innerHTML).toBe('');
		expect(main.activeIdentity()).toBeNull();
		expect(main.diagnostics()).toEqual([]);
		expect(destroyBroadcasts).toBe(1);
		await new Promise<void>((resolve) => dom.window.setTimeout(resolve, 0));
		observer?.disconnect();
		expect(observedPostDestroyAddition).toBe(false);
		expect(queuedCommitResponses).toEqual([]);

		dispatchCommit(context, 87, 3, [
			{ op: 'create', id: 3, type: 'view', props: { id: 'late-root' } },
			{ op: 'insert', parent: null, id: 3, before: null },
		]);
		expect(dom.window.document.querySelector('#late-root')).toBeNull();
	});

	it('publishes native-list ancestry with public-handle acknowledgements', () => {
		const { dom } = installEnvironment();
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			inbound.push(event.data as LynxBackgroundInboundMessage);
		});

		dispatchCommit(context, 90, 1, [
			{ op: 'create', id: 1, type: 'list', props: { id: 'feed' } },
			{ op: 'create', id: 2, type: 'list-item', props: { 'item-key': 'row' } },
			{ op: 'create', id: 3, type: 'text', props: {} },
			{ op: 'create', id: 4, type: 'view', props: { id: 'retained-root' } },
			{ op: 'create', id: 5, type: 'view', props: { id: 'retained-child' } },
			{ op: 'insert', parent: 2, id: 3, before: null },
			{ op: 'insert', parent: 4, id: 5, before: null },
			{ op: 'insert', parent: 1, id: 2, before: null },
			{ op: 'insert', parent: null, id: 1, before: null },
			{ op: 'insert', parent: null, id: 4, before: null },
		]);

		const acknowledgement = inbound[0];
		if (acknowledgement?.type !== 'ack') throw new Error('Expected a Lynx acknowledgement.');
		expect(acknowledgement.handles).toEqual([
			expect.objectContaining({ op: 'upsert', id: 1, listDescendant: false }),
			expect.objectContaining({ op: 'upsert', id: 2, listDescendant: true }),
			expect.objectContaining({ op: 'upsert', id: 3, listDescendant: true }),
			expect.objectContaining({ op: 'upsert', id: 4, listDescendant: false }),
			expect.objectContaining({ op: 'upsert', id: 5, listDescendant: false }),
		]);
		expect(inbound.map(({ type }) => type)).toEqual(['ack', 'complete']);

		globalThis.lynxTestingEnv.switchToMainThread();
		const list = dom.window.document.querySelector('#feed')!;
		expect(globalThis.elementTree.enterListItemAtIndex(list as never, 0)).toBeGreaterThan(0);
		globalThis.lynxTestingEnv.switchToBackgroundThread();
		inbound.length = 0;
		dispatchCommit(context, 90, 2, [
			{
				op: 'move',
				parent: {
					$$kind: 'octane.universal.portal-target',
					renderer: LYNX_TRANSPORT_RENDERER,
					root: 71,
					id: encodeLynxPortalTargetId({ root: 90, id: 4, generation: 1 }),
				},
				id: 2,
				before: null,
			},
			{ op: 'recreate', id: 2, type: 'list-item', props: { 'item-key': 'row' } },
			{ op: 'move', parent: 1, id: 2, before: null },
		]);
		expect(inbound.map(({ type }) => type)).toEqual(['reject']);
		expect(inbound[0]).toMatchObject({
			type: 'reject',
			error: { message: expect.stringMatching(/must be placed directly under a <list>/) },
		});

		inbound.length = 0;
		dispatchCommit(context, 90, 2, [{ op: 'move', parent: 2, id: 4, before: null }]);
		const enterList = inbound[0];
		if (enterList?.type !== 'ack') throw new Error('Expected a Lynx acknowledgement.');
		expect(enterList.handles).toEqual([
			{ op: 'list-ancestry', id: 4, generation: 1, listDescendant: true },
			{ op: 'list-ancestry', id: 5, generation: 1, listDescendant: true },
		]);
		expect(inbound.map(({ type }) => type)).toEqual(['ack', 'complete']);

		inbound.length = 0;
		dispatchCommit(context, 90, 3, [{ op: 'move', parent: null, id: 4, before: null }]);
		const leaveList = inbound[0];
		if (leaveList?.type !== 'ack') throw new Error('Expected a Lynx acknowledgement.');
		expect(leaveList.handles).toEqual([
			{ op: 'list-ancestry', id: 4, generation: 1, listDescendant: false },
			{ op: 'list-ancestry', id: 5, generation: 1, listDescendant: false },
		]);
		expect(inbound.map(({ type }) => type)).toEqual(['ack', 'complete']);
	});

	it('settles complete-time events immediately and drops reject-time reentry', () => {
		const { main, registrations } = installEnvironment();
		const context = backgroundContext();
		const inbound: LynxBackgroundInboundMessage[] = [];
		let injectAt: 'complete' | 'reject' | null = 'complete';
		context.addEventListener(LYNX_MAIN_TO_BACKGROUND_EVENT, (event) => {
			const message = event.data as LynxBackgroundInboundMessage;
			inbound.push(message);
			if (message.type !== injectAt) return;
			injectAt = null;
			main.dispatchNativeEvent(
				activeToken(registrations, 'bindEvent', 'tap'),
				nativePayload('tap'),
			);
		});

		dispatchCommit(context, 91, 1, [
			{ op: 'create', id: 1, type: 'view', props: {} },
			{ op: 'event', id: 1, type: 'bindtap', listener: { id: 101, priority: 'discrete' } },
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
		expect(inbound.map(({ type }) => type)).toEqual(['ack', 'complete', 'event']);
		expect(inbound.at(-1)).toMatchObject({ type: 'event', root: 91, version: 1 });

		inbound.length = 0;
		injectAt = 'reject';
		dispatchCommit(context, 91, 2, [{ op: 'update', id: 999, props: {} }]);
		expect(inbound.map(({ type }) => type)).toEqual(['reject']);

		inbound.length = 0;
		dispatchCommit(context, 91, 3, [{ op: 'update', id: 1, props: { id: 'after' } }]);
		expect(inbound.map(({ type }) => type)).toEqual(['ack', 'complete']);
	});

	it('binds exact PAPI kinds, snapshots payloads, batches propagation, and avoids rebinding', async () => {
		const { main, registrations } = installEnvironment();
		const log: string[] = [];
		let received: unknown;
		const catchHandler = () => log.push('catch');
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(EventScene, {
			bindtap(payload) {
				received = payload;
				log.push('bind:first');
			},
			catchtap: catchHandler,
		});
		await backgroundRoot.flushTransport();

		expect(registrations).toHaveLength(2);
		expect(registrations).toEqual(
			expect.arrayContaining([
				{ kind: 'bindEvent', name: 'tap', listener: expect.any(String) },
				{ kind: 'catchEvent', name: 'tap', listener: expect.any(String) },
			]),
		);
		const bindToken = activeToken(registrations, 'bindEvent', 'tap');
		const catchToken = activeToken(registrations, 'catchEvent', 'tap');
		main.dispatchNativeEventBatch([
			{ token: bindToken, payload: nativePayload('tap', { phase: 'bind' }) },
			{ token: catchToken, payload: nativePayload('tap', { phase: 'catch' }) },
		]);

		expect(log).toEqual(['bind:first', 'catch']);
		expect(received).toMatchObject({
			type: 'tap',
			timestamp: 10,
			detail: { phase: 'bind' },
			target: { id: 'event-target', uid: 2, dataset: { source: 'target' } },
		});
		expect(Object.getPrototypeOf(received as object)).toBeNull();
		expect(received).not.toHaveProperty('preventDefault');

		await backgroundRoot.render(EventScene, {
			bindtap: () => log.push('bind:replacement'),
			catchtap: catchHandler,
		});
		await backgroundRoot.flushTransport();
		expect(registrations).toHaveLength(2);
		main.dispatchNativeEvent(bindToken, nativePayload('tap'));
		expect(log.at(-1)).toBe('bind:replacement');

		await backgroundRoot.render(EventScene, { bindtap: null, catchtap: catchHandler });
		await backgroundRoot.flushTransport();
		expect(registrations.at(-1)).toEqual({
			kind: 'bindEvent',
			name: 'tap',
			listener: undefined,
		});
		main.dispatchNativeEvent(bindToken, nativePayload('tap'));
		expect(log.filter((entry) => entry === 'bind:replacement')).toHaveLength(1);
		expect(main.diagnostics().at(-1)?.message).toMatch(/stale, hidden, removed, or foreign/);
	});

	it('derives priority from accepted tokens and rejects mixed-priority batches atomically', async () => {
		const { main, registrations } = installEnvironment();
		const log: string[] = [];
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(EventScene, {
			bindtap: () => log.push('tap'),
			bindscroll: () => log.push('scroll'),
		});
		await backgroundRoot.flushTransport();
		const tap = activeToken(registrations, 'bindEvent', 'tap');
		const scroll = activeToken(registrations, 'bindEvent', 'scroll');

		main.dispatchNativeEventBatch([
			{ token: tap, payload: nativePayload('tap') },
			{ token: scroll, payload: nativePayload('scroll', { deltaY: 4 }) },
		]);
		expect(log).toEqual([]);
		expect(main.diagnostics().at(-1)?.message).toMatch(/mixes listener priorities/);

		main.dispatchNativeEvent(scroll, nativePayload('scroll', { deltaY: 4 }));
		expect(log).toEqual(['scroll']);
	});

	it('retains an Activity host while disconnecting its native event without ref churn', async () => {
		const { dom, main, registrations } = installEnvironment();
		const log: string[] = [];
		const refs: Array<LynxPublicHandle | null> = [];
		const bindtap = () => log.push('tap');
		const ref = (handle: LynxPublicHandle | null) => refs.push(handle);
		backgroundRoot = createLynxRoot();

		await backgroundRoot.render(ActivityEventScene, { mode: 'visible', bindtap, ref });
		await backgroundRoot.flushTransport();
		const element = dom.window.document.querySelector('#event-target');
		const handle = refs[0];
		expect(element).not.toBeNull();
		expect(handle?.active).toBe(true);
		expect(refs).toEqual([handle]);
		const token = activeToken(registrations, 'bindEvent', 'tap');
		main.dispatchNativeEvent(token, nativePayload('tap'));
		expect(log).toEqual(['tap']);

		await backgroundRoot.render(ActivityEventScene, { mode: 'hidden', bindtap, ref });
		await backgroundRoot.flushTransport();
		expect(dom.window.document.querySelector('#event-target')).toBe(element);
		expect(element?.hasAttribute('hidden')).toBe(true);
		expect(refs).toEqual([handle]);
		expect(handle?.active).toBe(true);
		main.dispatchNativeEvent(token, nativePayload('tap'));
		expect(log).toEqual(['tap']);
		expect(main.diagnostics().at(-1)?.message).toMatch(/stale, hidden, removed, or foreign/);

		await backgroundRoot.render(ActivityEventScene, { mode: 'visible', bindtap, ref });
		await backgroundRoot.flushTransport();
		expect(dom.window.document.querySelector('#event-target')).toBe(element);
		expect(element?.hasAttribute('hidden')).toBe(false);
		expect(refs).toEqual([handle]);
		main.dispatchNativeEvent(token, nativePayload('tap'));
		expect(log).toEqual(['tap', 'tap']);

		await backgroundRoot.unmount();
		backgroundRoot = null;
		expect(refs).toEqual([handle, null]);
		expect(handle?.active).toBe(false);
	});

	it('releases events only after ACK-published refs and drops them after an accepted fault', async () => {
		const order: string[] = [];
		let fired = false;
		const environment = installEnvironment((target, readMain, readRegistrations) => {
			const flush = target.__FlushElementTree as (node?: object) => void;
			target.__FlushElementTree = (node?: object) => {
				if (!fired) {
					const registration = readRegistrations().find(
						(entry) => entry.kind === 'bindEvent' && entry.name === 'tap',
					);
					const main = readMain();
					if (registration?.listener !== undefined && main !== null) {
						fired = true;
						main.dispatchNativeEvent(registration.listener, nativePayload('tap'));
					}
				}
				flush(node);
			};
		});
		let handle: LynxPublicHandle | null = null;
		backgroundRoot = createLynxRoot();
		await backgroundRoot.render(EventScene, {
			ref(value) {
				handle = value;
				if (value !== null) order.push(`ref:${value.active}`);
			},
			bindtap: () => order.push(`event:${handle?.active === true}`),
		});
		await backgroundRoot.flushTransport();
		expect(order).toEqual(['ref:true', 'event:true']);
		expect(environment.main.diagnostics()).toEqual([]);

		await backgroundRoot.unmount();
		backgroundRoot = null;
		environment.main.close();
		globalThis.lynxTestingEnv.clearGlobal();
		uninstallLynxTestingEnv(globalThis);
		environment.dom.window.close();
		installed = null;

		const fault = new Error('injected accepted flush fault');
		fired = false;
		const faulted = installEnvironment((target, readMain, readRegistrations) => {
			const flush = target.__FlushElementTree as (node?: object) => void;
			target.__FlushElementTree = (node?: object) => {
				if (!fired) {
					const registration = readRegistrations().find(
						(entry) => entry.kind === 'bindEvent' && entry.name === 'tap',
					);
					const main = readMain();
					if (registration?.listener !== undefined && main !== null) {
						fired = true;
						main.dispatchNativeEvent(registration.listener, nativePayload('tap'));
					}
					throw fault;
				}
				flush(node);
			};
		});
		const faultLog: string[] = [];
		backgroundRoot = createLynxRoot();
		await expect(
			backgroundRoot.render(EventScene, { bindtap: () => faultLog.push('event') }),
		).rejects.toThrow('injected accepted flush fault');
		expect(faultLog).toEqual([]);
		expect(faulted.main.activeIdentity()).toMatchObject({ version: 1 });
	});
});
