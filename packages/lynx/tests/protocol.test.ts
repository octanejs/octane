import { describe, expect, it, vi } from 'vitest';
import {
	UNIVERSAL_TRANSPORT_PROTOCOL_VERSION,
	type UniversalHostBatch,
	type UniversalSerializableValue,
	type UniversalTransportCommitMessage,
	type UniversalTransportIdentity,
	createUniversalRoot,
	defineUniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
	useLayoutEffect,
	useState,
} from 'octane/universal/native';
import {
	createLynxClientContainer,
	createLynxClientDriver,
	prepareLynxHandleDeltas,
	type LynxPublicHandle,
} from '../src/core/client-driver.js';
import {
	createLynxNodesRefSelector,
	type LynxNativeInvokeOptions,
	type LynxNativeNodesRef,
} from '../src/core/nodes-ref.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	validateLynxBackgroundInboundMessage,
	validateLynxBackgroundOutboundMessage,
	type LynxContextProxy,
	type LynxContextProxyEvent,
	type LynxDisposeMessage,
	type LynxMainReadyRequest,
	type LynxPublicHandleDelta,
} from '../src/core/protocol.js';
import { createLynxBackgroundTransport } from '../src/core/transport.js';

class FakeContextProxy implements LynxContextProxy {
	readonly events: LynxContextProxyEvent[] = [];
	readonly postMessage = vi.fn(() => {
		throw new Error('postMessage must not be used.');
	});
	private readonly listeners = new Map<string, Set<(event: LynxContextProxyEvent) => void>>();

	dispatchEvent(event: LynxContextProxyEvent): void {
		this.events.push(event);
		for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event);
	}

	addEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void {
		let listeners = this.listeners.get(type);
		if (listeners === undefined) this.listeners.set(type, (listeners = new Set()));
		listeners.add(listener);
	}

	removeEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void {
		this.listeners.get(type)?.delete(listener);
	}

	sendToBackground(data: unknown): void {
		this.dispatchEvent({ type: LYNX_MAIN_TO_BACKGROUND_EVENT, data });
	}
}

const plan = universalPlan(LYNX_TRANSPORT_RENDERER, {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
});

function identity(root: number, version: number): UniversalTransportIdentity {
	return {
		protocol: UNIVERSAL_TRANSPORT_PROTOCOL_VERSION,
		renderer: LYNX_TRANSPORT_RENDERER,
		root,
		version,
	};
}

function commitIdentity(commit: UniversalTransportCommitMessage): UniversalTransportIdentity {
	return identity(commit.root, commit.version);
}

function handleSnapshot(
	root: number,
	id: number,
	type: string,
	generation: number,
	extra: Readonly<Record<string, UniversalSerializableValue>> = {},
): UniversalSerializableValue {
	return {
		$$kind: 'octane.lynx.element',
		renderer: LYNX_TRANSPORT_RENDERER,
		root,
		id,
		type,
		generation,
		selector: createLynxNodesRefSelector(root, id, generation),
		...extra,
	};
}

async function flushMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

interface MainHarness {
	readonly commits: UniversalTransportCommitMessage[];
	readonly disposals: LynxDisposeMessage[];
	acknowledge(
		commit: UniversalTransportCommitMessage,
		completion?: 'complete' | 'fault' | null,
	): void;
	reject(commit: UniversalTransportCommitMessage, message: string): void;
}

function installMainHarness(context: FakeContextProxy, autoReady = true): MainHarness {
	const commits: UniversalTransportCommitMessage[] = [];
	const disposals: LynxDisposeMessage[] = [];
	const generations = new Map<number, number>();
	const types = new Map<number, string>();
	context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
		const message = validateLynxBackgroundOutboundMessage(event.data);
		if (message.type === 'main-ready-request') {
			if (autoReady) {
				context.sendToBackground({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'main-ready',
					request: message.request,
				});
			}
			return;
		}
		if (message.type === 'commit') commits.push(message);
		else if (message.type === 'dispose') disposals.push(message);
	});

	const handleDeltas = (commit: UniversalTransportCommitMessage): LynxPublicHandleDelta[] => {
		const deltas: LynxPublicHandleDelta[] = [];
		for (const command of commit.batch.commands) {
			if (command.op === 'create') {
				const generation = (generations.get(command.id) ?? 0) + 1;
				generations.set(command.id, generation);
				types.set(command.id, command.type);
				deltas.push({
					op: 'upsert',
					id: command.id,
					type: command.type,
					generation,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(commit.root, command.id, command.type, generation, {
						props: command.props,
					}),
				});
			} else if (command.op === 'update') {
				deltas.push({
					op: 'upsert',
					id: command.id,
					type: types.get(command.id)!,
					generation: generations.get(command.id)!,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(
						commit.root,
						command.id,
						types.get(command.id)!,
						generations.get(command.id)!,
						{ props: command.props },
					),
				});
			} else if (command.op === 'recreate') {
				const generation = generations.get(command.id)! + 1;
				generations.set(command.id, generation);
				types.set(command.id, command.type);
				deltas.push({
					op: 'upsert',
					id: command.id,
					type: command.type,
					generation,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(commit.root, command.id, command.type, generation, {
						props: command.props,
					}),
				});
			} else if (command.op === 'destroy') {
				deltas.push({
					op: 'remove',
					id: command.id,
					generation: generations.get(command.id)!,
				});
				types.delete(command.id);
			}
		}
		return deltas;
	};

	return {
		commits,
		disposals,
		acknowledge(commit, completion = null) {
			context.sendToBackground({
				...commitIdentity(commit),
				type: 'ack',
				handles: handleDeltas(commit),
			});
			if (completion !== null) {
				context.sendToBackground(
					completion === 'complete'
						? { ...commitIdentity(commit), type: 'complete' }
						: {
								...commitIdentity(commit),
								type: 'fault',
								error: { name: 'Error', message: 'accepted host fault' },
							},
				);
			}
		},
		reject(commit, message) {
			context.sendToBackground({
				...commitIdentity(commit),
				type: 'reject',
				error: { name: 'Error', message },
			});
		},
	};
}

describe('@octanejs/lynx transported protocol', () => {
	it('pins the universal protocol and strictly validates every envelope', () => {
		expect(LYNX_TRANSPORT_PROTOCOL_VERSION).toBe(UNIVERSAL_TRANSPORT_PROTOCOL_VERSION);
		const commit: UniversalTransportCommitMessage = {
			...identity(1, 1),
			type: 'commit',
			batch: {
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 1,
				commands: [{ op: 'create', id: 1, type: 'view', props: Object.freeze({ value: 1 }) }],
			},
		};
		expect(validateLynxBackgroundOutboundMessage(commit)).toBe(commit);
		const portalParent = Object.freeze({
			$$kind: 'octane.universal.portal-target',
			renderer: LYNX_TRANSPORT_RENDERER,
			root: 41,
			id: 'octane.lynx.portal:1:7:2',
		});
		const portalCommit = {
			...commit,
			batch: {
				...commit.batch,
				commands: [{ op: 'insert', parent: portalParent, id: 9, before: null }],
			},
		};
		expect(validateLynxBackgroundOutboundMessage(portalCommit)).toBe(portalCommit);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...portalCommit,
				batch: {
					...portalCommit.batch,
					commands: [
						{
							op: 'insert',
							parent: { ...portalParent, id: 'r1-h7-g2' },
							id: 9,
							before: null,
						},
					],
				},
			}),
		).toThrow(/opaque Lynx portal target ID/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...portalCommit,
				batch: {
					...portalCommit.batch,
					commands: [
						{
							op: 'insert',
							parent: { ...portalParent, publicHandle: true },
							id: 9,
							before: null,
						},
					],
				},
			}),
		).toThrow(/unknown field "publicHandle"/);
		expect(
			validateLynxBackgroundInboundMessage({
				protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
				renderer: LYNX_TRANSPORT_RENDERER,
				type: 'main-ready',
				request: 0,
			}),
		).toMatchObject({ type: 'main-ready', request: 0 });
		expect(
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'ack',
				handles: [
					{
						op: 'upsert',
						id: 1,
						type: 'view',
						generation: 1,
						attached: true,
						listDescendant: false,
						snapshot: handleSnapshot(1, 1, 'view', 1, { value: 1 }),
					},
				],
			}),
		).toMatchObject({ type: 'ack' });
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'ack',
				handles: [
					{
						op: 'upsert',
						id: 1,
						type: 'view',
						generation: 1,
						attached: true,
						listDescendant: null,
						snapshot: handleSnapshot(1, 1, 'view', 1),
					},
				],
			}),
		).toThrow(/ack\.handles\[0\]\.listDescendant/);
		expect(
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'ack',
				handles: [{ op: 'list-ancestry', id: 1, generation: 1, listDescendant: true }],
			}),
		).toMatchObject({ type: 'ack' });
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'ack',
				handles: [{ op: 'list-ancestry', id: 1, generation: 1, listDescendant: 'yes' }],
			}),
		).toThrow(/ack\.handles\[0\]\.listDescendant/);

		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: { ...commit.batch, commands: [{ ...commit.batch.commands[0], extra: true }] },
			}),
		).toThrow(/unknown field "extra"/);
		expect(() => validateLynxBackgroundInboundMessage({ ...identity(1, 1), type: 'ack' })).toThrow(
			/missing field "handles"/,
		);
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'event',
				priority: 'urgent',
				deliveries: [],
			}),
		).toThrow(/event\.priority/);
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'event',
				priority: 'discrete',
				deliveries: [{ listener: 1, payload: () => {} }],
			}),
		).toThrow(/non-serializable/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...commit.batch,
					commands: [{ op: 'local-callback', id: 1, type: 'measure', listener: { id: 1 } }],
				},
			}),
		).toThrow(/not supported by the Lynx async host/);
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'ack',
				handles: [
					{
						op: 'upsert',
						id: 1,
						type: 'view',
						generation: 1,
						attached: true,
						listDescendant: false,
						snapshot: { ...(handleSnapshot(1, 1, 'view', 1) as object), root: 99 },
					},
				],
			}),
		).toThrow(/snapshot\.root/);
		expect(
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'host-fault',
				error: { name: 'Error', message: 'callback failed' },
			}),
		).toMatchObject({ type: 'host-fault' });
		expect(
			validateLynxBackgroundInboundMessage({
				...identity(1, 1),
				type: 'dispose-retry',
				error: { name: 'Error', message: 'retry cleanup' },
			}),
		).toMatchObject({ type: 'dispose-retry' });
	});

	it('uses only current same-root acknowledged public handles as portal targets', () => {
		const firstContainer = createLynxClientContainer();
		const secondContainer = createLynxClientContainer();
		const driver = createLynxClientDriver();
		const createPortalTargetHandle = (id: string | number) =>
			Object.freeze({
				$$kind: 'octane.universal.portal-target' as const,
				renderer: LYNX_TRANSPORT_RENDERER,
				root: 41,
				id,
			});
		const prepareTarget = (
			container: ReturnType<typeof createLynxClientContainer>,
			target: unknown,
			transported = true,
		) =>
			driver.portals!.prepareTarget({
				container,
				renderer: LYNX_TRANSPORT_RENDERER,
				target,
				transported,
				createPortalTargetHandle,
			});

		expect(() => prepareTarget(firstContainer, null)).toThrow(
			/Initial portals must wait for the target ref acknowledgement/,
		);
		const mountBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 1,
			commands: [
				{ op: 'create', id: 1, type: 'view', props: {} },
				{ op: 'create', id: 2, type: 'list', props: {} },
				{ op: 'create', id: 3, type: 'view', props: {} },
			],
		};
		prepareLynxHandleDeltas(
			firstContainer,
			mountBatch,
			[
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 1,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(17, 1, 'view', 1),
				},
				{
					op: 'upsert',
					id: 2,
					type: 'list',
					generation: 1,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(17, 2, 'list', 1),
				},
				{
					op: 'upsert',
					id: 3,
					type: 'view',
					generation: 1,
					attached: true,
					listDescendant: true,
					snapshot: handleSnapshot(17, 3, 'view', 1),
				},
			],
			identity(17, 1),
		).apply();
		const target = firstContainer.getPublicHandle(1)!;
		const registration = prepareTarget(firstContainer, target);
		expect(registration.handle).toEqual({
			$$kind: 'octane.universal.portal-target',
			renderer: LYNX_TRANSPORT_RENDERER,
			root: 41,
			id: 'octane.lynx.portal:17:1:1',
		});
		expect(Object.keys(registration.handle)).toEqual(['$$kind', 'renderer', 'root', 'id']);
		expect(() => registration.release()).not.toThrow();

		expect(() => prepareTarget(secondContainer, target)).toThrow(/from this root/);
		expect(() => prepareTarget(firstContainer, target, false)).toThrow(/from this root/);
		expect(() => prepareTarget(firstContainer, firstContainer.getPublicHandle(2))).toThrow(
			/target type "list" is not supported/,
		);
		expect(() => prepareTarget(firstContainer, firstContainer.getPublicHandle(3))).toThrow(
			/native-list descendant/,
		);

		const enterListBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 2,
			commands: [{ op: 'move', parent: 3, id: 1, before: null }],
		};
		prepareLynxHandleDeltas(
			firstContainer,
			enterListBatch,
			[{ op: 'list-ancestry', id: 1, generation: 1, listDescendant: true }],
			identity(17, 2),
		).apply();
		expect(() => prepareTarget(firstContainer, target)).toThrow(/native-list descendant/);

		const leaveListBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 3,
			commands: [{ op: 'move', parent: null, id: 1, before: null }],
		};
		prepareLynxHandleDeltas(
			firstContainer,
			leaveListBatch,
			[{ op: 'list-ancestry', id: 1, generation: 1, listDescendant: false }],
			identity(17, 3),
		).apply();
		expect(() => prepareTarget(firstContainer, target)).not.toThrow();

		const rolledBack = prepareLynxHandleDeltas(
			firstContainer,
			{ ...enterListBatch, version: 4 },
			[{ op: 'list-ancestry', id: 1, generation: 1, listDescendant: true }],
			identity(17, 4),
		);
		rolledBack.apply();
		expect(() => prepareTarget(firstContainer, target)).toThrow(/native-list descendant/);
		rolledBack.rollback();
		expect(() => prepareTarget(firstContainer, target)).not.toThrow();
		expect(() =>
			prepareLynxHandleDeltas(
				firstContainer,
				{ ...enterListBatch, version: 4 },
				[{ op: 'list-ancestry', id: 1, generation: 2, listDescendant: true }],
				identity(17, 4),
			),
		).toThrow(/stale or transitioning handle 1:2/);

		const recreateBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 5,
			commands: [{ op: 'recreate', id: 1, type: 'view', props: {} }],
		};
		prepareLynxHandleDeltas(
			firstContainer,
			recreateBatch,
			[
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 2,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(17, 1, 'view', 2),
				},
			],
			identity(17, 5),
		).apply();
		expect(target.active).toBe(false);
		expect(() => prepareTarget(firstContainer, target)).toThrow(/current, active/);
	});

	it('validates the root-scoped worklet call subprotocol without accepting executable values', () => {
		for (const phase of ['open', 'close'] as const) {
			expect(
				validateLynxBackgroundOutboundMessage({
					...identity(7, 3),
					type: 'main-call-publication',
					phase,
				}),
			).toMatchObject({ type: 'main-call-publication', phase });
		}
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...identity(7, 3),
				type: 'main-call-publication',
				phase: 'pending',
			}),
		).toThrow(/main-call-publication\.phase/);

		const callMain = {
			...identity(7, 3),
			type: 'call-main' as const,
			call: 1,
			worklet: { _wkltId: 'app:tap', _c: { count: 2, nested: ['safe'] } },
			args: [{ type: 'tap' }, 4],
		};
		expect(validateLynxBackgroundOutboundMessage(callMain)).toBe(callMain);
		expect(
			validateLynxBackgroundOutboundMessage({
				...identity(7, 3),
				type: 'cancel-main',
				call: 1,
			}),
		).toMatchObject({ type: 'cancel-main', call: 1 });
		expect(
			validateLynxBackgroundInboundMessage({
				...identity(7, 3),
				type: 'call-main-result',
				call: 1,
				value: { accepted: true },
			}),
		).toMatchObject({ type: 'call-main-result', call: 1 });
		expect(
			validateLynxBackgroundInboundMessage({
				...identity(7, 3),
				type: 'call-main-error',
				call: 1,
				error: { name: 'RangeError', message: 'outside range' },
			}),
		).toMatchObject({ type: 'call-main-error', call: 1 });

		const callBackground = {
			...identity(7, 3),
			type: 'call-background' as const,
			call: 2,
			fn: { _jsFnId: 'app:save', _execId: '7:3:save' },
			args: ['value'],
		};
		expect(validateLynxBackgroundInboundMessage(callBackground)).toBe(callBackground);
		expect(
			validateLynxBackgroundInboundMessage({
				...identity(7, 3),
				type: 'cancel-background',
				call: 2,
			}),
		).toMatchObject({ type: 'cancel-background', call: 2 });
		expect(
			validateLynxBackgroundOutboundMessage({
				...identity(7, 3),
				type: 'call-background-result',
				call: 2,
				value: null,
			}),
		).toMatchObject({ type: 'call-background-result', call: 2 });
		expect(
			validateLynxBackgroundOutboundMessage({
				...identity(7, 3),
				type: 'call-background-error',
				call: 2,
				error: { name: 'Error', message: 'failed' },
			}),
		).toMatchObject({ type: 'call-background-error', call: 2 });

		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...callMain,
				worklet: { _wkltId: 'app:tap', _c: { callback() {} } },
			}),
		).toThrow(/non-serializable/);
		expect(() => validateLynxBackgroundInboundMessage({ ...callBackground, extra: true })).toThrow(
			/unknown field "extra"/,
		);
		const cyclic: unknown[] = [];
		cyclic.push(cyclic);
		expect(() => validateLynxBackgroundInboundMessage({ ...callBackground, args: cyclic })).toThrow(
			/cycle/,
		);
	});

	it('rejects malformed call argument arrays without evaluating accessors', () => {
		const callMain = {
			...identity(7, 3),
			type: 'call-main' as const,
			call: 1,
			worklet: { _wkltId: 'app:tap' },
			args: [] as unknown[],
		};
		const callBackground = {
			...identity(7, 3),
			type: 'call-background' as const,
			call: 2,
			fn: { _jsFnId: 'app:save' },
			args: [] as unknown[],
		};
		const sparseArguments: unknown[] = [];
		sparseArguments.length = 1;
		let getterRuns = 0;
		const accessorArguments: unknown[] = [];
		Object.defineProperty(accessorArguments, '0', {
			enumerable: true,
			get() {
				getterRuns++;
				return 'unsafe';
			},
		});
		const extraArguments: unknown[] & { extra?: boolean } = [];
		extraArguments.extra = true;

		for (const args of [sparseArguments, accessorArguments, extraArguments]) {
			expect(() => validateLynxBackgroundOutboundMessage({ ...callMain, args })).toThrow(
				/dense array|enumerable data property/,
			);
			expect(() => validateLynxBackgroundInboundMessage({ ...callBackground, args })).toThrow(
				/dense array|enumerable data property/,
			);
		}
		expect(getterRuns).toBe(0);

		const shared = { value: 'shared' };
		const aliasedMain = { ...callMain, args: [shared, shared] };
		const aliasedBackground = { ...callBackground, args: [shared, shared] };
		expect(validateLynxBackgroundOutboundMessage(aliasedMain)).toBe(aliasedMain);
		expect(validateLynxBackgroundInboundMessage(aliasedBackground)).toBe(aliasedBackground);
	});

	it('queues main calls until adoption, settles by birth identity, and executes background calls', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const executed: Array<readonly unknown[]> = [];
		const backgroundResult = { saved: 'record' };
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container, {
			executeBackgroundFunction(fn, args) {
				executed.push([fn._jsFnId, ...args]);
				return backgroundResult;
			},
		});
		await transport.ready;
		const beforeAdoption = transport.callMain({ _wkltId: 'app:before' }, ['queued']);
		expect(
			context.events.some(
				(event) =>
					event.type === LYNX_BACKGROUND_TO_MAIN_EVENT &&
					(event.data as { type?: unknown }).type === 'call-main',
			),
		).toBe(false);

		const batch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 1,
			commands: [{ op: 'create', id: 1, type: 'view', props: {} }],
		};
		beforeAdoption.cancel();
		await expect(beforeAdoption.promise).rejects.toMatchObject({ name: 'AbortError' });

		const queuedWorklet = { _wkltId: 'app:queued', _c: { label: 'before' } };
		const queuedArgument = { value: 'before' };
		const queued = transport.callMain(queuedWorklet, [queuedArgument]);
		queuedWorklet._c.label = 'mutated';
		queuedArgument.value = 'mutated';
		const mounted = transport.prepareBatch(container, batch, identity(82, 1)).apply(() => {});
		await flushMicrotasks();
		const mount = main.commits.at(-1)!;
		main.acknowledge(mount, 'complete');
		await mounted;
		const callMessage = context.events
			.map((event) => event.data)
			.find(
				(message): message is ReturnType<typeof validateLynxBackgroundOutboundMessage> =>
					(message as { type?: unknown }).type === 'call-main' &&
					(message as { worklet?: { _wkltId?: unknown } }).worklet?._wkltId === 'app:queued',
			)!;
		if (callMessage.type !== 'call-main') throw new Error('Expected a main-thread call.');
		expect(callMessage.worklet).toEqual({ _wkltId: 'app:queued', _c: { label: 'before' } });
		expect(callMessage.args).toEqual([{ value: 'before' }]);
		const mainResult = { status: 'done' };
		context.sendToBackground({
			...identity(callMessage.root, callMessage.version),
			type: 'call-main-result',
			call: callMessage.call,
			value: mainResult,
		});
		mainResult.status = 'mutated';
		const resolvedMain = await queued.promise;
		expect(resolvedMain).toEqual({ status: 'done' });
		expect(resolvedMain).not.toBe(mainResult);

		context.sendToBackground({
			...identity(82, 1),
			type: 'call-background',
			call: 19,
			fn: { _jsFnId: 'app:save' },
			args: ['record'],
		});
		await flushMicrotasks();
		backgroundResult.saved = 'mutated';
		expect(executed).toContainEqual(['app:save', 'record']);
		const backgroundMessage = context.events
			.map((event) => event.data)
			.find(
				(message) =>
					(message as { type?: unknown }).type === 'call-background-result' &&
					(message as { call?: unknown }).call === 19,
			) as { readonly value: unknown };
		expect(backgroundMessage).toMatchObject({ value: { saved: 'record' } });
		expect(backgroundMessage.value).not.toBe(backgroundResult);

		const malformedResultCall = transport.callMain({ _wkltId: 'app:malformed-result' }, []);
		const malformedResultMessage = context.events
			.map((event) => event.data as { readonly type?: unknown; readonly call?: unknown })
			.find(
				(message) =>
					message.type === 'call-main' &&
					(message as { readonly worklet?: { readonly _wkltId?: unknown } }).worklet?._wkltId ===
						'app:malformed-result',
			) as { readonly call: number };
		const updateBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 2,
			commands: [{ op: 'update', id: 1, props: { id: 'newer' } }],
		};
		const updated = transport.prepareBatch(container, updateBatch, identity(82, 2)).apply(() => {});
		await flushMicrotasks();
		main.acknowledge(main.commits.at(-1)!, 'complete');
		await updated;
		context.sendToBackground({
			...identity(82, 1),
			type: 'call-main-result',
			call: malformedResultMessage.call,
			value() {},
		});
		await expect(malformedResultCall.promise).rejects.toThrow(/non-serializable|clone-safe/);

		context.sendToBackground({
			...identity(82, 1),
			type: 'call-background',
			call: 20,
			fn: { _jsFnId: 'app:malformed-call' },
			args: [() => undefined],
		});
		const malformedCallError = context.events
			.map((event) => event.data as { readonly type?: unknown; readonly call?: unknown })
			.find((message) => message.type === 'call-background-error' && message.call === 20);
		expect(malformedCallError).toMatchObject({ root: 82, version: 1 });

		transport.close();
	});

	it('never reexecutes replayed background calls after settlement or cancellation', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const executions: string[] = [];
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container, {
			executeBackgroundFunction(fn) {
				executions.push(fn._jsFnId);
				if (fn._jsFnId === 'app:throw') throw new RangeError('background failed');
				if (fn._jsFnId === 'app:pending') return new Promise<never>(() => {});
				return 'completed';
			},
		});
		await transport.ready;
		const batch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 1,
			commands: [{ op: 'create', id: 1, type: 'view', props: {} }],
		};
		const mounted = transport.prepareBatch(container, batch, identity(83, 1)).apply(() => {});
		await flushMicrotasks();
		main.acknowledge(main.commits[0]!, 'complete');
		await mounted;

		const call = (id: number, fn: string): void => {
			context.sendToBackground({
				...identity(83, 1),
				type: 'call-background',
				call: id,
				fn: { _jsFnId: fn },
				args: [],
			});
		};

		call(1, 'app:return');
		await flushMicrotasks();
		call(1, 'app:return');
		call(2, 'app:throw');
		await flushMicrotasks();
		call(2, 'app:throw');
		call(3, 'app:pending');
		context.sendToBackground({
			...identity(83, 1),
			type: 'cancel-background',
			call: 3,
		});
		call(3, 'app:pending');
		await flushMicrotasks();

		expect(executions).toEqual(['app:return', 'app:throw', 'app:pending']);
		const settlements = context.events
			.map((event) => event.data as { readonly type?: unknown; readonly call?: unknown })
			.filter(
				(message) =>
					message.type === 'call-background-result' || message.type === 'call-background-error',
			);
		expect(settlements.filter((message) => message.call === 1)).toHaveLength(1);
		expect(settlements.filter((message) => message.call === 2)).toHaveLength(1);
		expect(settlements.filter((message) => message.call === 3)).toHaveLength(0);
		expect(
			transport.diagnostics().filter((error) => /duplicate background call/.test(error.message)),
		).toHaveLength(3);
		transport.close();
	});

	it('terminally closes only the exact accepted root for an unsolicited host fault', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		const root = createUniversalRoot(container, createLynxClientDriver(), { transport });
		transport.bindRoot(root);
		const refs: Array<LynxPublicHandle | null> = [];
		const Scene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, () =>
			universalValue(plan, [
				universalProps([['set', 'ref', (value: LynxPublicHandle | null) => refs.push(value)]]),
			]),
		);
		const applying = root.renderAsync(Scene, undefined);
		await flushMicrotasks();
		main.acknowledge(main.commits[0]!, 'complete');
		await applying;
		const accepted = commitIdentity(main.commits[0]!);
		const handle = container.getPublicHandle(1)!;
		expect(refs).toEqual([handle]);

		context.sendToBackground({
			...accepted,
			version: accepted.version + 1,
			type: 'host-fault',
			error: { name: 'Error', message: 'stale callback failure' },
		});
		expect(transport.closedReason()).toBeNull();
		expect(handle.active).toBe(true);
		expect(refs).toEqual([handle]);
		expect(transport.diagnostics().at(-1)?.message).toMatch(/stale or foreign host fault/);

		context.sendToBackground({
			...accepted,
			type: 'host-fault',
			error: { name: 'ListCallbackError', message: 'accepted callback failure' },
		});
		expect(transport.closedReason()).toMatchObject({
			name: 'ListCallbackError',
			message: 'accepted callback failure',
		});
		expect(handle.active).toBe(false);
		expect(refs).toEqual([handle, null]);
		expect(
			context.events.some(
				(event) =>
					event.type === LYNX_BACKGROUND_TO_MAIN_EVENT &&
					(event.data as { readonly type?: unknown }).type === 'terminal-dispose',
			),
		).toBe(true);
		const nextBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: accepted.version + 1,
			commands: [],
		};
		expect(() =>
			transport.prepareBatch(container, nextBatch, {
				...accepted,
				version: accepted.version + 1,
			}),
		).toThrow('accepted callback failure');
	});

	it('retains cleanup reception until asynchronous terminal-dispose retries are acknowledged', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		const mountBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 1,
			commands: [{ op: 'create', id: 1, type: 'view', props: {} }],
		};
		const applying = transport.prepareBatch(container, mountBatch, identity(73, 1)).apply(() => {});
		await flushMicrotasks();
		const mount = main.commits[0]!;
		main.acknowledge(mount, 'complete');
		await applying;

		const terminalAttempts: UniversalTransportIdentity[] = [];
		context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
			const message = validateLynxBackgroundOutboundMessage(event.data);
			if (message.type !== 'terminal-dispose') return;
			terminalAttempts.push(commitIdentity(mount));
			void Promise.resolve().then(() => {
				context.sendToBackground(
					terminalAttempts.length < 3
						? {
								...commitIdentity(mount),
								type: 'dispose-retry',
								error: { name: 'Error', message: 'transient native cleanup failure' },
							}
						: { ...commitIdentity(mount), type: 'dispose-ack' },
				);
			});
		});

		context.sendToBackground({
			...commitIdentity(mount),
			type: 'host-fault',
			error: { name: 'ListCallbackError', message: 'accepted async callback failure' },
		});
		expect(transport.closedReason()).toMatchObject({
			name: 'ListCallbackError',
			message: 'accepted async callback failure',
		});
		expect(container.getPublicHandle(1)).toBeNull();

		await flushMicrotasks(10);
		expect(terminalAttempts).toHaveLength(3);
		expect(
			transport
				.diagnostics()
				.filter((error) => error.message === 'transient native cleanup failure'),
		).toHaveLength(2);
		const diagnosticsAfterAck = transport.diagnostics().length;
		context.sendToBackground({
			...commitIdentity(mount),
			type: 'dispose-retry',
			error: { name: 'Error', message: 'late cleanup retry' },
		});
		expect(transport.diagnostics()).toHaveLength(diagnosticsAfterAck);
	});

	it.each(['host-fault', 'host-attachment'] as const)(
		'fail-stops an exact accepted malformed %s while ignoring a stale one',
		async (type) => {
			const context = new FakeContextProxy();
			const main = installMainHarness(context);
			const container = createLynxClientContainer();
			const transport = createLynxBackgroundTransport(context, container);
			await transport.ready;
			const mountBatch: UniversalHostBatch = {
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 1,
				commands: [{ op: 'create', id: 1, type: 'view', props: {} }],
			};
			const applying = transport
				.prepareBatch(container, mountBatch, identity(74, 1))
				.apply(() => {});
			await flushMicrotasks();
			const mount = main.commits[0]!;
			main.acknowledge(mount, 'complete');
			await applying;
			const malformed =
				type === 'host-fault'
					? { type, error: { name: 'Error' } }
					: {
							type,
							changes: [{ id: 1, generation: 1, attached: 'yes' }],
						};

			context.sendToBackground({
				...identity(mount.root, mount.version + 1),
				...malformed,
			});
			expect(transport.closedReason()).toBeNull();
			expect(container.getPublicHandle(1)?.active).toBe(true);
			expect(
				context.events.filter(
					(event) =>
						event.type === LYNX_BACKGROUND_TO_MAIN_EVENT &&
						(event.data as { readonly type?: unknown }).type === 'terminal-dispose',
				),
			).toHaveLength(0);

			context.sendToBackground({ ...commitIdentity(mount), ...malformed });
			expect(transport.closedReason()).toBeInstanceOf(TypeError);
			expect(container.getPublicHandle(1)).toBeNull();
			expect(
				context.events.filter(
					(event) =>
						event.type === LYNX_BACKGROUND_TO_MAIN_EVENT &&
						(event.data as { readonly type?: unknown }).type === 'terminal-dispose',
				),
			).toHaveLength(1);
			context.sendToBackground({ ...commitIdentity(mount), type: 'dispose-ack' });
		},
	);

	it('terminally closes when an exact host attachment subscriber throws', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		const mountBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 1,
			commands: [{ op: 'create', id: 1, type: 'view', props: {} }],
		};
		const applying = transport.prepareBatch(container, mountBatch, identity(72, 1)).apply(() => {});
		await flushMicrotasks();
		const mount = main.commits[0]!;
		context.sendToBackground({
			...commitIdentity(mount),
			type: 'ack',
			handles: [
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 1,
					attached: false,
					listDescendant: false,
					snapshot: handleSnapshot(72, 1, 'view', 1),
				},
			],
		});
		context.sendToBackground({ ...commitIdentity(mount), type: 'complete' });
		await applying;
		const failure = new Error('attachment subscriber failed');
		createLynxClientDriver().attachments!.subscribe(container, () => {
			throw failure;
		});

		context.sendToBackground({
			...identity(72, 2),
			type: 'host-attachment',
			changes: [{ id: 1, generation: 1, attached: true }],
		});
		expect(transport.closedReason()).toBeNull();
		expect(container.getPublicHandle(1)?.attached).toBe(false);
		expect(transport.diagnostics().at(-1)?.message).toMatch(/stale or foreign host attachment/);

		context.sendToBackground({
			...identity(72, 1),
			type: 'host-attachment',
			changes: [{ id: 1, generation: 1, attached: true }],
		});
		expect(transport.closedReason()).toBe(failure);
		expect(container.getPublicHandle(1)).toBeNull();
		expect(
			context.events.map((event) => [event.type, (event.data as { readonly type?: unknown }).type]),
		).toContainEqual([LYNX_BACKGROUND_TO_MAIN_EVENT, 'terminal-dispose']);
	});

	it('waits for named-event readiness, publishes handles at ACK, and preserves update identity', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		const baseDriver = createLynxClientDriver();
		const driver = {
			...baseDriver,
			updates: {
				classify(
					_type: string,
					_previous: Readonly<Record<string, unknown>>,
					next: Readonly<Record<string, unknown>>,
				) {
					return next.replace ? ('recreate' as const) : ('update' as const);
				},
			},
		};
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		const readiness = context.events
			.filter((event) => event.type === LYNX_BACKGROUND_TO_MAIN_EVENT)
			.map((event) => event.data)
			.find((message): message is LynxMainReadyRequest =>
				Boolean(
					message !== null &&
					typeof message === 'object' &&
					(message as { type?: unknown }).type === 'main-ready-request',
				),
			)!;
		context.sendToBackground({
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'main-ready',
			request: 0,
		});
		context.sendToBackground({ ...readiness, type: 'main-ready' });
		expect(transport.diagnostics()).toEqual([]);
		const root = createUniversalRoot(container, driver, { transport });
		transport.bindRoot(root);
		const refs: Array<LynxPublicHandle | null> = [];
		const layouts: number[] = [];
		const ref = (value: LynxPublicHandle | null) => refs.push(value);
		const Scene = defineUniversalComponent(
			LYNX_TRANSPORT_RENDERER,
			(props: { value: number; replace: boolean }) => {
				useLayoutEffect(() => layouts.push(props.value), [props.value], 'layout');
				return universalValue(plan, [
					universalProps([
						['set', 'value', props.value],
						['set', 'replace', props.replace],
						['set', 'ref', ref],
					]),
				]);
			},
		);

		const abandoned = root.prepare(Scene, { value: 0, replace: false });
		expect(main.commits).toEqual([]);
		abandoned.abort();
		const firstRender = root.renderAsync(Scene, { value: 1, replace: false });
		await flushMicrotasks();
		expect(main.commits).toHaveLength(1);
		expect(main.commits[0].version).toBe(2);
		expect(refs).toEqual([]);
		main.acknowledge(main.commits[0]);
		const first = container.getPublicHandle(1)!;
		expect(first.root).toBe(main.commits[0].root);
		expect(refs).toEqual([first]);
		expect(layouts).toEqual([1]);
		let completed = false;
		void firstRender.then(() => {
			completed = true;
		});
		await Promise.resolve();
		expect(completed).toBe(false);
		context.sendToBackground({ ...commitIdentity(main.commits[0]), type: 'complete' });
		await firstRender;
		expect(transport.acceptedIdentity()).toMatchObject({ root: main.commits[0].root, version: 2 });

		const update = root.renderAsync(Scene, { value: 2, replace: false });
		await flushMicrotasks();
		main.acknowledge(main.commits[1], 'complete');
		await update;
		expect(container.getPublicHandle(1)).toBe(first);
		expect(first.snapshot).toMatchObject({ props: { value: 2 } });
		expect(refs).toEqual([first]);

		const recreate = root.renderAsync(Scene, { value: 3, replace: true });
		await flushMicrotasks();
		main.acknowledge(main.commits[2], 'complete');
		await recreate;
		const replacement = container.getPublicHandle(1)!;
		expect(replacement).not.toBe(first);
		expect(replacement.generation).toBe(2);
		expect(first.active).toBe(false);
		expect(refs).toEqual([first, null, replacement]);
		expect(context.events.every((event) => event.type !== 'message')).toBe(true);
		expect(context.postMessage).not.toHaveBeenCalled();
	});

	it('gates list refs and public queries on generation-scoped physical attachment', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const selectors: string[] = [];
		const invokes: LynxNativeInvokeOptions[] = [];
		const nativeRef: LynxNativeNodesRef = {
			invoke(options) {
				invokes.push(options);
				return { exec() {} };
			},
			fields() {
				throw new Error('Unexpected fields query.');
			},
			path() {
				throw new Error('Unexpected path query.');
			},
			setNativeProps() {
				throw new Error('Unexpected native props query.');
			},
		};
		const container = createLynxClientContainer({
			createSelectorQuery: () => ({
				select(selector) {
					selectors.push(selector);
					return nativeRef;
				},
			}),
		});
		const transport = createLynxBackgroundTransport(context, container);
		const root = createUniversalRoot(container, createLynxClientDriver(), { transport });
		transport.bindRoot(root);
		const refs: Array<LynxPublicHandle | null> = [];
		const Scene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, (props: { value: number }) =>
			universalValue(plan, [
				universalProps([
					['set', 'value', props.value],
					['set', 'ref', (value: LynxPublicHandle | null) => refs.push(value)],
				]),
			]),
		);

		const rendering = root.renderAsync(Scene, { value: 1 });
		await flushMicrotasks();
		const mount = main.commits[0];
		context.sendToBackground({
			...commitIdentity(mount),
			type: 'ack',
			handles: [
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 1,
					attached: false,
					listDescendant: false,
					snapshot: handleSnapshot(mount.root, 1, 'view', 1),
				},
			],
		});
		context.sendToBackground({ ...commitIdentity(mount), type: 'complete' });
		await rendering;
		const handle = container.getPublicHandle(1)!;
		expect(handle.active).toBe(true);
		expect(handle.attached).toBe(false);
		expect(refs).toEqual([]);
		await expect(handle.invoke('readCell')).rejects.toMatchObject({ code: 'inactive' });
		expect(selectors).toEqual([]);

		context.sendToBackground({
			...commitIdentity(mount),
			type: 'host-attachment',
			changes: [{ id: 1, generation: 1, attached: true }],
		});
		expect(handle.attached).toBe(true);
		expect(refs).toEqual([handle]);

		const sameAttachment = handle.invoke<{ cell: string }>('readCell');
		context.sendToBackground({
			...commitIdentity(mount),
			type: 'host-attachment',
			changes: [{ id: 1, generation: 1, attached: true }],
		});
		invokes[0].success({ cell: 'same-attachment' });
		await expect(sameAttachment).resolves.toEqual({ cell: 'same-attachment' });
		expect(refs).toEqual([handle]);

		const pending = handle.invoke('readCell');
		let pendingOutcome: unknown = 'pending';
		void pending.then(
			(value) => (pendingOutcome = value),
			(error: unknown) => (pendingOutcome = error),
		);

		context.sendToBackground({
			...commitIdentity(mount),
			type: 'host-attachment',
			changes: [{ id: 1, generation: 1, attached: false }],
		});
		expect(handle.attached).toBe(false);
		expect(refs).toEqual([handle, null]);
		await Promise.resolve();
		expect(pendingOutcome).toMatchObject({ code: 'inactive' });

		context.sendToBackground({
			...commitIdentity(mount),
			type: 'host-attachment',
			changes: [{ id: 1, generation: 1, attached: true }],
		});
		expect(handle.attached).toBe(true);
		expect(handle.generation).toBe(1);
		expect(refs).toEqual([handle, null, handle]);
		const detachedError = pendingOutcome;
		invokes[1].success({ cell: 'stale' });
		await Promise.resolve();
		expect(pendingOutcome).toBe(detachedError);

		const current = handle.invoke<{ cell: string }>('readCell');
		invokes[2].success({ cell: 'current' });
		await expect(current).resolves.toEqual({ cell: 'current' });

		const retained = handle.invoke('readCell');
		let retainedOutcome: unknown = 'pending';
		void retained.then(
			(value) => (retainedOutcome = value),
			(error: unknown) => (retainedOutcome = error),
		);
		const updating = root.renderAsync(Scene, { value: 2 });
		await flushMicrotasks();
		const update = main.commits[1];
		context.sendToBackground({
			...commitIdentity(update),
			type: 'ack',
			handles: [
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 1,
					attached: false,
					listDescendant: false,
					snapshot: handleSnapshot(update.root, 1, 'view', 1, { value: 2 }),
				},
			],
		});
		context.sendToBackground({ ...commitIdentity(update), type: 'complete' });
		await updating;
		await Promise.resolve();
		expect(retainedOutcome).toMatchObject({ code: 'inactive' });
		expect(handle.attached).toBe(false);
		expect(handle.generation).toBe(1);

		context.sendToBackground({
			...commitIdentity(update),
			type: 'host-attachment',
			changes: [{ id: 1, generation: 1, attached: true }],
		});
		const retainedError = retainedOutcome;
		invokes[3].success({ cell: 'stale-retained-ack' });
		await Promise.resolve();
		expect(retainedOutcome).toBe(retainedError);
		expect(refs).toEqual([handle, null, handle, null, handle]);

		const afterUpdate = handle.invoke<{ cell: string }>('readCell');
		invokes[4].success({ cell: 'after-update' });
		await expect(afterUpdate).resolves.toEqual({ cell: 'after-update' });
		expect(selectors).toEqual(Array(5).fill(createLynxNodesRefSelector(mount.root, 1, 1)));

		const unmounting = root.unmountAsync();
		await flushMicrotasks();
		const unmount = main.commits[2];
		context.sendToBackground({
			...commitIdentity(unmount),
			type: 'ack',
			handles: [{ op: 'remove', id: 1, generation: 1 }],
		});
		context.sendToBackground({ ...commitIdentity(unmount), type: 'complete' });
		await unmounting;
		expect(handle.active).toBe(false);
		transport.close();
	});

	it('publishes accepted identity before a layout callback dispatches an event', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		const root = createUniversalRoot(container, createLynxClientDriver(), { transport });
		transport.bindRoot(root);
		const deliveries: unknown[] = [];
		const Scene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, () => {
			useLayoutEffect(
				() => {
					const commit = main.commits[0];
					const event = commit.batch.commands.find(
						(command) => command.op === 'event' && command.listener !== null,
					);
					if (event?.op !== 'event' || event.listener === null) {
						throw new Error('Missing reentrant event listener.');
					}
					context.sendToBackground({
						...commitIdentity(commit),
						type: 'event',
						priority: 'discrete',
						deliveries: [{ listener: event.listener.id, payload: { phase: 'layout' } }],
					});
				},
				[],
				'layout-event',
			);
			return universalValue(plan, [
				universalProps([['set', 'bindtap', (payload: unknown) => deliveries.push(payload)]]),
			]);
		});

		const rendering = root.renderAsync(Scene, undefined);
		await flushMicrotasks();
		main.acknowledge(main.commits[0], 'complete');
		await rendering;
		expect(deliveries).toEqual([{ phase: 'layout' }]);
		expect(transport.diagnostics()).toEqual([]);
		transport.close();
	});

	it('drains acknowledgement-time and reentrant main calls without overtaking older IDs', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		let queueAcceptedCall = (): void => {};
		const transport = createLynxBackgroundTransport(context, container, {
			onWorkletBatchAccepted() {
				queueAcceptedCall();
			},
		});
		await transport.ready;
		const delivered: number[] = [];
		const calls: ReturnType<typeof transport.callMain>[] = [];
		const queue = (id: string): void => {
			const call = transport.callMain({ _wkltId: id }, []);
			void call.promise.catch(() => {});
			calls.push(call);
		};
		queueAcceptedCall = () => queue('app:batch-accepted');
		context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
			const message = validateLynxBackgroundOutboundMessage(event.data);
			if (message.type !== 'call-main') return;
			delivered.push(message.call);
			if (message.call === 1) queue('app:reentrant');
		});

		queue('app:queued-first');
		queue('app:queued-second');
		const batch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 1,
			commands: [],
		};
		const token = transport.prepareBatch(container, batch, identity(109, 1));
		const applying = token.apply(() => queue('app:acknowledgement'));
		await flushMicrotasks();
		main.acknowledge(main.commits[0], 'complete');
		await applying;

		expect(delivered).toEqual([1, 2, 3, 4, 5]);
		transport.close();
		expect(calls).toHaveLength(5);
	});

	it('keeps pre-ACK failures retryable and disposes an accepted faulted teardown', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		const root = createUniversalRoot(container, createLynxClientDriver(), { transport });
		transport.bindRoot(root);
		const refs: Array<LynxPublicHandle | null> = [];
		const Scene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, (props: { value: number }) =>
			universalValue(plan, [
				universalProps([
					['set', 'value', props.value],
					['set', 'ref', (value: LynxPublicHandle | null) => refs.push(value)],
				]),
			]),
		);

		const mounted = root.renderAsync(Scene, { value: 1 });
		await flushMicrotasks();
		main.acknowledge(main.commits[0], 'complete');
		await mounted;
		const handle = container.getPublicHandle(1)!;
		const mountedIdentity = transport.acceptedIdentity()!;

		const rejectedUnmount = root.unmountAsync();
		void rejectedUnmount.catch(() => {});
		await flushMicrotasks();
		main.reject(main.commits[1], 'teardown rejected before acknowledgement');
		await expect(rejectedUnmount).rejects.toThrow('teardown rejected before acknowledgement');
		expect(transport.acceptedIdentity()).toBe(mountedIdentity);
		expect(handle.active).toBe(true);
		expect(container.getPublicHandle(1)).toBe(handle);

		const faultedUnmount = root.unmountAsync();
		void faultedUnmount.catch(() => {});
		await flushMicrotasks();
		main.acknowledge(main.commits[2], 'fault');
		await expect(faultedUnmount).rejects.toThrow('accepted host fault');
		expect(transport.acceptedIdentity()?.version).toBe(main.commits[2].version);
		expect(handle.active).toBe(false);
		expect(refs.at(-1)).toBeNull();

		const disposing = transport.dispose();
		await flushMicrotasks();
		expect(main.disposals).toHaveLength(1);
		expect(main.disposals[0]).toMatchObject(transport.acceptedIdentity()!);
		context.sendToBackground({ ...main.disposals[0], type: 'dispose-ack' });
		await disposing;
	});

	it('terminally closes when an accepted acknowledgement cannot be installed', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		const root = createUniversalRoot(container, createLynxClientDriver(), { transport });
		transport.bindRoot(root);
		const Scene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, (props: { value: number }) =>
			universalValue(plan, [universalProps([['set', 'value', props.value]])]),
		);

		const mounted = root.renderAsync(Scene, { value: 1 });
		await flushMicrotasks();
		main.acknowledge(main.commits[0], 'complete');
		await mounted;
		const handle = container.getPublicHandle(1)!;
		const accepted = transport.acceptedIdentity();

		const update = root.renderAsync(Scene, { value: 2 });
		void update.catch(() => {});
		await flushMicrotasks();
		context.sendToBackground({
			...commitIdentity(main.commits[1]),
			type: 'ack',
			handles: [],
		});
		await expect(update).rejects.toThrow(/omits updated handle 1/);
		expect(transport.acceptedIdentity()).toBe(accepted);
		expect(handle.active).toBe(false);
		expect(container.getPublicHandle(1)).toBeNull();

		const commitCount = main.commits.length;
		await expect(root.renderAsync(Scene, { value: 3 })).rejects.toThrow(/omits updated handle 1/);
		expect(main.commits).toHaveLength(commitCount);
	});

	it('terminally closes when the universal core rejects an acknowledgement', async () => {
		const context = new FakeContextProxy();
		installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		const batch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 1,
			commands: [],
		};
		const token = transport.prepareBatch(container, batch, identity(77, 1));
		const applying = token.apply(() => {
			throw new Error('universal acknowledgement rejected');
		});
		void applying.catch(() => {});
		await flushMicrotasks();
		context.sendToBackground({ ...identity(77, 1), type: 'ack', handles: [] });

		await expect(applying).rejects.toThrow('universal acknowledgement rejected');
		expect(transport.acceptedIdentity()).toBeNull();
		expect(() => transport.prepareBatch(container, batch, identity(77, 2))).toThrow(
			'universal acknowledgement rejected',
		);
	});

	it('validates public handles against each batch final state', async () => {
		const context = new FakeContextProxy();
		installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		const commit = async (
			batch: UniversalHostBatch,
			handles: readonly LynxPublicHandleDelta[],
		): Promise<void> => {
			const commitIdentity = identity(88, batch.version);
			const acknowledge = vi.fn();
			const applying = transport.prepareBatch(container, batch, commitIdentity).apply(acknowledge);
			void applying.catch(() => {});
			await flushMicrotasks();
			context.sendToBackground({ ...commitIdentity, type: 'ack', handles });
			context.sendToBackground({ ...commitIdentity, type: 'complete' });
			await applying;
			expect(acknowledge).toHaveBeenCalledOnce();
		};

		await commit(
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 1,
				commands: [
					{ op: 'create', id: 1, type: 'view', props: {} },
					{ op: 'destroy', id: 1 },
				],
			},
			[],
		);
		expect(container.getPublicHandle(1)).toBeNull();

		await commit(
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 2,
				commands: [{ op: 'create', id: 1, type: 'view', props: { value: 1 } }],
			},
			[
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 2,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(88, 1, 'view', 2, { value: 1 }),
				},
			],
		);
		const initial = container.getPublicHandle(1)!;

		await commit(
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 3,
				commands: [
					{ op: 'recreate', id: 1, type: 'view', props: { value: 2 } },
					{ op: 'recreate', id: 1, type: 'view', props: { value: 3 } },
				],
			},
			[
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 4,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(88, 1, 'view', 4, { value: 3 }),
				},
			],
		);
		const recreated = container.getPublicHandle(1)!;
		expect(recreated).not.toBe(initial);
		expect(recreated.generation).toBe(4);
		expect(initial.active).toBe(false);

		await commit(
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 4,
				commands: [
					{ op: 'recreate', id: 1, type: 'view', props: { value: 4 } },
					{ op: 'destroy', id: 1 },
				],
			},
			[{ op: 'remove', id: 1, generation: 4 }],
		);
		expect(recreated.active).toBe(false);
		expect(container.getPublicHandle(1)).toBeNull();

		const staleCreateBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 5,
			commands: [{ op: 'create', id: 1, type: 'view', props: { value: 5 } }],
		};
		const staleIdentity = identity(88, 5);
		const staleCreate = transport
			.prepareBatch(container, staleCreateBatch, staleIdentity)
			.apply(() => {});
		void staleCreate.catch(() => {});
		await flushMicrotasks();
		context.sendToBackground({
			...staleIdentity,
			type: 'ack',
			handles: [
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 4,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(88, 1, 'view', 4, { value: 5 }),
				},
			],
		});
		await expect(staleCreate).rejects.toThrow(/invalid created handle 1/);
		expect(container.getPublicHandle(1)).toBeNull();
		transport.close();
	});

	it('batches events and lets an accepted acknowledgement win the abort race', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context);
		const container = createLynxClientContainer();
		const transport = createLynxBackgroundTransport(context, container);
		const root = createUniversalRoot(container, createLynxClientDriver(), { transport });
		transport.bindRoot(root);
		const Scene = defineUniversalComponent(LYNX_TRANSPORT_RENDERER, () => {
			const [count, setCount] = useState(0, 'count');
			return universalValue(plan, [
				universalProps([
					['set', 'count', count],
					['set', 'bindtap', () => setCount((value) => value + 1)],
				]),
			]);
		});

		const mounted = root.renderAsync(Scene, undefined);
		await flushMicrotasks();
		main.acknowledge(main.commits[0], 'complete');
		await mounted;
		const firstIdentity = transport.acceptedIdentity()!;
		const event = main.commits[0].batch.commands.find(
			(command) => command.op === 'event' && command.listener !== null,
		);
		if (event?.op !== 'event' || event.listener === null) throw new Error('Missing tap listener.');
		context.sendToBackground({
			...firstIdentity,
			type: 'event',
			priority: 'discrete',
			deliveries: [{ listener: event.listener.id, payload: { type: 'tap' } }],
		});
		await flushMicrotasks();
		expect(main.commits).toHaveLength(2);
		main.acknowledge(main.commits[1], 'complete');
		await root.flushTransport();
		expect(container.getPublicHandle(1)?.snapshot).toMatchObject({ props: { count: 1 } });
		context.sendToBackground({ ...firstIdentity, type: 'ack', handles: [] });
		expect(transport.diagnostics().at(-1)?.message).toMatch(/late or duplicate acknowledgement/);

		context.sendToBackground({
			...firstIdentity,
			type: 'event',
			priority: 'discrete',
			deliveries: [{ listener: event.listener.id, payload: { type: 'tap' } }],
		});
		expect(transport.diagnostics().at(-1)?.message).toMatch(/stale or foreign event/);

		const directContext = new FakeContextProxy();
		const directMain = installMainHarness(directContext);
		const directContainer = createLynxClientContainer();
		const directTransport = createLynxBackgroundTransport(directContext, directContainer);
		await directTransport.ready;
		const directIdentity = identity(99, 1);
		const batch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 1,
			commands: [],
		};
		const token = directTransport.prepareBatch(directContainer, batch, directIdentity);
		const acknowledge = vi.fn();
		const applying = token.apply(acknowledge);
		void applying.catch(() => {});
		await flushMicrotasks();
		token.abort();
		token.abort();
		let settled = false;
		void applying.finally(() => {
			settled = true;
		});
		await flushMicrotasks();
		expect(settled).toBe(false);
		directMain.acknowledge(directMain.commits[0], 'complete');
		await applying;
		expect(acknowledge).toHaveBeenCalledOnce();
		expect(directTransport.acceptedIdentity()).toMatchObject(directIdentity);
		const outbound = directContext.events
			.filter((entry) => entry.type === LYNX_BACKGROUND_TO_MAIN_EVENT)
			.map((entry) => (entry.data as { type: string }).type);
		expect(outbound.filter((type) => type === 'commit')).toHaveLength(1);
		expect(outbound.filter((type) => type === 'abort')).toHaveLength(1);

		const waitingContext = new FakeContextProxy();
		installMainHarness(waitingContext, false);
		const waitingContainer = createLynxClientContainer();
		const waitingTransport = createLynxBackgroundTransport(waitingContext, waitingContainer);
		const waitingToken = waitingTransport.prepareBatch(waitingContainer, batch, identity(100, 1));
		const waitingApply = waitingToken.apply(() => {});
		void waitingApply.catch(() => {});
		waitingToken.abort();
		await expect(waitingApply).rejects.toThrow(/was aborted/);
		const waitingOutbound = waitingContext.events
			.filter((entry) => entry.type === LYNX_BACKGROUND_TO_MAIN_EVENT)
			.map((entry) => (entry.data as { type: string }).type);
		expect(waitingOutbound).not.toContain('commit');
		expect(waitingOutbound).not.toContain('abort');
		waitingTransport.close();
		directTransport.close();
		transport.close();
	});
});
