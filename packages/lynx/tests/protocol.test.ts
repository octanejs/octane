import vm from 'node:vm';
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
	applyLynxHostAttachments,
	createLynxClientContainer,
	createLynxClientDriver,
	isLynxClientEventTarget,
	prepareLynxCompactHandleDeltas,
	prepareLynxHandleDeltas,
	type LynxPublicHandle,
} from '../src/core/client-driver.js';
import {
	createLynxNodesRefSelector,
	type LynxNativeInvokeOptions,
	type LynxNativeNodesRef,
} from '../src/core/nodes-ref.js';
import { snapshotLynxLifecycleData } from '../src/core/lifecycle-data.js';
import {
	LYNX_BACKGROUND_TO_MAIN_EVENT,
	LYNX_CAPABILITY_READY_REQUEST_BASE,
	LYNX_COMPACT_ACKNOWLEDGEMENT,
	LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS,
	LYNX_LAZY_PUBLIC_INSTANCES,
	LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE,
	LYNX_TEMPLATE_RUN_READY_REQUEST_BASE,
	LYNX_MAIN_TO_BACKGROUND_EVENT,
	LYNX_TRANSPORT_PROTOCOL_VERSION,
	LYNX_TRANSPORT_RENDERER,
	validateLynxBackgroundInboundMessage,
	validateLynxBackgroundOutboundMessage,
	type LynxContextProxy,
	type LynxContextProxyEvent,
	type LynxDisposeMessage,
	type LynxMainThreadCapabilities,
	type LynxMainReadyRequest,
	type LynxPublicHandleDelta,
	type LynxTransportCommitMessage,
} from '../src/core/protocol.js';
import { createLynxBackgroundTransport } from '../src/core/transport.js';
import { unwire, wire } from './_fixtures/lynx-wire.js';

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
		this.dispatchEvent({ type: LYNX_MAIN_TO_BACKGROUND_EVENT, data: wire(data) });
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

function templateBatch(count: number, version = 1): UniversalHostBatch {
	return {
		renderer: LYNX_TRANSPORT_RENDERER,
		version,
		commands: [
			{
				op: 'mount-template',
				parent: null,
				before: null,
				shape: Object.freeze(
					Array.from({ length: count }, (_value, index) =>
						Object.freeze({ type: 'view', parent: index === 0 ? -1 : 0 }),
					),
				),
				nodes: Object.freeze(
					Array.from({ length: count }, (_value, index) =>
						Object.freeze({
							id: index + 1,
							props: Object.freeze({ id: `host-${index + 1}` }),
							...(index === 1
								? {
										events: Object.freeze([
											Object.freeze({
												type: 'bindtap',
												listener: Object.freeze({ id: 1, priority: 'discrete' as const }),
											}),
										]),
									}
								: null),
						}),
					),
				),
			},
		],
	};
}

function templateProgramBatch(count: number, version = 1): UniversalHostBatch {
	if (count % 2 !== 0) throw new Error('The intrinsic test program has two physical hosts.');
	const program = Object.freeze({
		nodes: Object.freeze([
			Object.freeze({
				type: 'view',
				parent: -1,
				props: Object.freeze({ class: 'row' }),
				bindings: Object.freeze([Object.freeze({ name: 'id', valueIndex: 0 })]),
			}),
			Object.freeze({
				type: '#text',
				parent: 0,
				props: Object.freeze({}),
				bindings: Object.freeze([Object.freeze({ name: 'value', valueIndex: 1 })]),
			}),
		]),
		events: Object.freeze([
			Object.freeze({ node: 0, type: 'bindtap', priority: 'discrete' as const }),
		]),
	});
	return {
		renderer: LYNX_TRANSPORT_RENDERER,
		version,
		commands: Array.from({ length: count / 2 }, (_value, index) =>
			Object.freeze({
				op: 'mount-template-range' as const,
				parent: null,
				before: null,
				program,
				firstId: index * 2 + 1,
				values: Object.freeze([`row-${index}`, String(index)]),
				firstListenerId: index + 1,
			}),
		),
	};
}

function templateProgramRunBatch(count: number, version = 1): UniversalHostBatch {
	const ranges = templateProgramBatch(count, version);
	const first = ranges.commands[0]!;
	if (first.op !== 'mount-template-range') throw new Error('Expected an intrinsic host program.');
	return {
		renderer: LYNX_TRANSPORT_RENDERER,
		version,
		commands: [
			Object.freeze({
				op: 'mount-template-run' as const,
				parent: first.parent,
				before: first.before,
				program: first.program,
				firstId: first.firstId,
				firstListenerId: first.firstListenerId,
				count: ranges.commands.length,
				values: Object.freeze(
					ranges.commands.flatMap((command) =>
						command.op === 'mount-template-range' ? command.values : [],
					),
				),
			}),
		],
	};
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

function installMainHarness(
	context: FakeContextProxy,
	autoReady = true,
	capabilities?: LynxMainThreadCapabilities,
): MainHarness {
	const commits: UniversalTransportCommitMessage[] = [];
	const disposals: LynxDisposeMessage[] = [];
	const generations = new Map<number, number>();
	const types = new Map<number, string>();
	context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
		const message = validateLynxBackgroundOutboundMessage(unwire(event.data));
		if (message.type === 'main-ready-request') {
			if (autoReady) {
				context.sendToBackground({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'main-ready',
					request: message.request,
					...(capabilities === undefined ? null : { capabilities }),
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
	it('validates messages built in another realm, as the background thread is in production', () => {
		// The two Lynx threads are separate JS realms in production — on Lynx for
		// Web the background runs in its own iframe/worker — so every message a
		// thread receives is a plain object whose prototype is the *sender's*
		// realm's Object.prototype, never identical to the receiver's. A
		// prototype-identity plain-object check rejected all of them: the readiness
		// handshake never completed (`main-ready-request` bounced) and no commit
		// could apply, so the background could not commit and nothing updated. The
		// single-realm jsdom suite could never observe this. Build the envelopes in
		// a real second realm and prove both validators accept them.
		const foreign = vm.runInNewContext(
			`({
				request: {
					protocol: ${LYNX_TRANSPORT_PROTOCOL_VERSION},
					renderer: ${JSON.stringify(LYNX_TRANSPORT_RENDERER)},
					type: 'main-ready-request',
					request: 1,
				},
				reply: {
					protocol: ${LYNX_TRANSPORT_PROTOCOL_VERSION},
					renderer: ${JSON.stringify(LYNX_TRANSPORT_RENDERER)},
					type: 'main-ready',
					request: 0,
				},
				commit: {
					protocol: ${LYNX_TRANSPORT_PROTOCOL_VERSION},
					renderer: ${JSON.stringify(LYNX_TRANSPORT_RENDERER)},
					root: 1,
					version: 1,
					type: 'commit',
					batch: {
						renderer: ${JSON.stringify(LYNX_TRANSPORT_RENDERER)},
						version: 1,
						commands: [{ op: 'create', id: 1, type: 'view', props: { value: 1 } }],
					},
				},
			})`,
		) as { request: LynxMainReadyRequest; reply: unknown; commit: unknown };

		// The objects are genuinely cross-realm: their prototype is not this realm's.
		expect(Object.getPrototypeOf(foreign.request)).not.toBe(Object.prototype);
		expect(Object.getPrototypeOf((foreign.commit as { batch: object }).batch)).not.toBe(
			Object.prototype,
		);

		expect(validateLynxBackgroundOutboundMessage(foreign.request)).toBe(foreign.request);
		expect(validateLynxBackgroundOutboundMessage(foreign.commit)).toBe(foreign.commit);
		expect(validateLynxBackgroundInboundMessage(foreign.reply)).toBe(foreign.reply);
	});

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
		const pageDestroy = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-destroy',
		};
		expect(validateLynxBackgroundInboundMessage(pageDestroy)).toBe(pageDestroy);
		expect(() => validateLynxBackgroundInboundMessage({ ...pageDestroy, root: 1 })).toThrow(
			/page-destroy.*unknown field "root"/,
		);
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

	it('negotiates capabilities only on tagged readiness replies and rejects malformed compact ACKs', () => {
		const request = LYNX_CAPABILITY_READY_REQUEST_BASE + 7;
		const readiness = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'main-ready' as const,
			request,
			capabilities: { compactAck: 1 as const, templateMount: 1 as const },
		};
		expect(validateLynxBackgroundInboundMessage(readiness)).toBe(readiness);
		expect(
			validateLynxBackgroundInboundMessage({
				...readiness,
				capabilities: { ...readiness.capabilities, templateProgram: 1 },
			}),
		).toMatchObject({ capabilities: { templateProgram: 1 } });
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...readiness,
				capabilities: { compactAck: 1, templateProgram: 1 },
			}),
		).toThrow(/templateProgram.*requires the templateMount capability/);
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...readiness,
				capabilities: { ...readiness.capabilities, templateProgram: 2 },
			}),
		).toThrow(/templateProgram.*must be 1/);
		const lazyCapabilities = {
			...readiness.capabilities,
			templateProgram: 1,
			lazyPublicInstances: 1,
		};
		expect(() =>
			validateLynxBackgroundInboundMessage({ ...readiness, capabilities: lazyCapabilities }),
		).toThrow(/lazyPublicInstances.*lazy-public-instance readiness request/);
		expect(
			validateLynxBackgroundInboundMessage({
				...readiness,
				request: LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE + 7,
				capabilities: lazyCapabilities,
			}),
		).toMatchObject({ capabilities: { lazyPublicInstances: 1 } });
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...readiness,
				request: LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE + 7,
				capabilities: { ...readiness.capabilities, lazyPublicInstances: 1 },
			}),
		).toThrow(/lazyPublicInstances.*requires the templateProgram capability/);
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...readiness,
				request: LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE + 7,
				capabilities: { ...lazyCapabilities, lazyPublicInstances: 2 },
			}),
		).toThrow(/lazyPublicInstances.*must be 1/);
		const runCapabilities = { ...lazyCapabilities, templateRuns: 1 };
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...readiness,
				request: LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE + 7,
				capabilities: runCapabilities,
			}),
		).toThrow(/templateRuns.*template-run readiness request/);
		expect(
			validateLynxBackgroundInboundMessage({
				...readiness,
				request: LYNX_TEMPLATE_RUN_READY_REQUEST_BASE + 7,
				capabilities: runCapabilities,
			}),
		).toMatchObject({ capabilities: { templateRuns: 1 } });
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...readiness,
				request: LYNX_TEMPLATE_RUN_READY_REQUEST_BASE + 7,
				capabilities: { ...readiness.capabilities, templateRuns: 1 },
			}),
		).toThrow(/templateRuns.*requires the templateProgram capability/);
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...readiness,
				request: LYNX_TEMPLATE_RUN_READY_REQUEST_BASE + 7,
				capabilities: { ...runCapabilities, templateRuns: 2 },
			}),
		).toThrow(/templateRuns.*must be 1/);
		expect(() => validateLynxBackgroundInboundMessage({ ...readiness, request: 1 })).toThrow(
			/capability-tagged readiness request/,
		);
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...readiness,
				capabilities: { compactAck: 1, templateMount: 1, executable: true },
			}),
		).toThrow(/unknown field "executable"/);
		expect(() =>
			validateLynxBackgroundInboundMessage({ ...readiness, capabilities: { compactAck: 2 } }),
		).toThrow(/compactAck.*must be 1/);

		let capabilityReads = 0;
		const unsafeCapabilities = Object.defineProperty({}, 'compactAck', {
			configurable: true,
			enumerable: true,
			get() {
				capabilityReads++;
				return 1;
			},
		});
		expect(() =>
			validateLynxBackgroundInboundMessage({ ...readiness, capabilities: unsafeCapabilities }),
		).toThrow(/capabilities\.compactAck.*accessor/);
		expect(capabilityReads).toBe(0);

		const acknowledgement = {
			...identity(5, 1),
			type: 'ack' as const,
			encoding: LYNX_COMPACT_ACKNOWLEDGEMENT,
			count: LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS,
		};
		expect(validateLynxBackgroundInboundMessage(acknowledgement)).toBe(acknowledgement);
		expect(() =>
			validateLynxBackgroundInboundMessage({
				...acknowledgement,
				count: LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS - 1,
			}),
		).toThrow(/ack\.count.*at least/);
		expect(() =>
			validateLynxBackgroundInboundMessage({ ...acknowledgement, encoding: 'compact-v2' }),
		).toThrow(/ack\.encoding/);
		expect(() => validateLynxBackgroundInboundMessage({ ...acknowledgement, handles: [] })).toThrow(
			/unknown field "handles"/,
		);
		expect(() =>
			validateLynxBackgroundInboundMessage({ ...acknowledgement, adoption: 'adopted' }),
		).toThrow(/unknown field "adoption"/);
	});

	it('accepts sparse public-instance commands only with safe IDs and negotiated commit encoding', () => {
		const ensure = { op: 'ensure-public-instance' as const, id: 7 };
		const commit = {
			...identity(8, 1),
			type: 'commit' as const,
			batch: {
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 1,
				commands: [ensure],
			},
		};
		expect(validateLynxBackgroundOutboundMessage(commit)).toBe(commit);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: { ...commit.batch, commands: [{ ...ensure, id: 0 }] },
			}),
		).toThrow(/commands\[0\]\.id.*positive safe integer/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: { ...commit.batch, commands: [{ ...ensure, generation: 1 }] },
			}),
		).toThrow(/unknown field "generation"/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				instances: LYNX_LAZY_PUBLIC_INSTANCES,
			}),
		).toThrow(/instances.*requires a compact acknowledgement/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
				instances: 'lazy-v2',
			}),
		).toThrow(/instances.*lazy-v1/);
		expect(
			validateLynxBackgroundOutboundMessage({
				...commit,
				ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
				instances: LYNX_LAZY_PUBLIC_INSTANCES,
			}),
		).toMatchObject({ instances: LYNX_LAZY_PUBLIC_INSTANCES });
	});

	it.each(['adopted', 'repaired'] as const)(
		'enables intrinsic runs only after a first screen is safely %s',
		async (adoption) => {
			const context = new FakeContextProxy();
			const container = createLynxClientContainer();
			const driver = createLynxClientDriver(container);
			const commits: LynxTransportCommitMessage[] = [];
			const capabilitiesDuringAdoptionReady: boolean[] = [];
			context.addEventListener(LYNX_BACKGROUND_TO_MAIN_EVENT, (event) => {
				const message = validateLynxBackgroundOutboundMessage(unwire(event.data));
				if (message.type === 'adoption-ready') {
					capabilitiesDuringAdoptionReady.push(driver.capabilities?.templateProgramMount === true);
					return;
				}
				if (message.type === 'commit') {
					commits.push(message);
					return;
				}
				if (message.type !== 'main-ready-request') return;
				context.sendToBackground({
					protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
					renderer: LYNX_TRANSPORT_RENDERER,
					type: 'main-ready',
					request: message.request,
					firstTree: {
						format: 1,
						renderer: LYNX_TRANSPORT_RENDERER,
						root: 1,
						version: 1,
						plan: null,
						roots: [],
						nodes: [],
					},
					capabilities: {
						compactAck: 1,
						templateMount: 1,
						templateProgram: 1,
						lazyPublicInstances: 1,
						templateRuns: 1,
					},
				});
			});
			const transport = createLynxBackgroundTransport(context, container);
			await transport.ready;
			expect(driver.capabilities?.templateMount).toBe(false);
			expect(driver.capabilities?.templateProgramMount).toBe(false);
			expect(driver.capabilities?.templateProgramRuns).toBe(false);
			expect(driver.capabilities?.lazyPublicInstances).toBe(false);
			const firstIdentity = identity(1, 1);
			const capabilitiesDuringAcknowledgement: boolean[] = [];
			const adopting = transport
				.prepareBatch(
					container,
					{ renderer: LYNX_TRANSPORT_RENDERER, version: 1, commands: [] },
					firstIdentity,
				)
				.apply(() => {
					capabilitiesDuringAcknowledgement.push(
						driver.capabilities?.templateProgramMount === true,
					);
				});
			await flushMicrotasks();
			expect(commits[0]).not.toHaveProperty('ack');
			expect(commits[0]).not.toHaveProperty('instances');
			context.sendToBackground({ ...firstIdentity, type: 'ack', handles: [], adoption });
			expect(capabilitiesDuringAcknowledgement).toEqual([false]);
			expect(capabilitiesDuringAdoptionReady).toEqual(adoption === 'adopted' ? [false] : []);
			expect(driver.capabilities?.templateMount).toBe(true);
			expect(driver.capabilities?.templateProgramMount).toBe(true);
			expect(driver.capabilities?.templateProgramRuns).toBe(true);
			expect(driver.capabilities?.lazyPublicInstances).toBe(true);
			context.sendToBackground({ ...firstIdentity, type: 'complete' });
			await adopting;

			const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
			const nextIdentity = identity(firstIdentity.root, 2);
			const adding = transport
				.prepareBatch(container, templateProgramRunBatch(count, 2), nextIdentity)
				.apply(() => {});
			await flushMicrotasks();
			expect(commits[1]).toMatchObject({
				ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
				instances: LYNX_LAZY_PUBLIC_INSTANCES,
				batch: { commands: [{ op: 'mount-template-run', count: count / 2 }] },
			});
			const handles: LynxPublicHandleDelta[] = Array.from({ length: count }, (_value, index) => {
				const id = index + 1;
				const type = id % 2 === 1 ? 'view' : '#text';
				return {
					op: 'upsert',
					id,
					type,
					generation: 1,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(nextIdentity.root, id, type, 1),
				};
			});
			context.sendToBackground({ ...nextIdentity, type: 'ack', handles });
			context.sendToBackground({ ...nextIdentity, type: 'complete' });
			await adding;
			expect(container.getPublicHandle(count)?.type).toBe('#text');
			transport.close();
		},
	);

	it('rejects unsafe template hosts, listeners, and mutable shapes reused across commands', () => {
		const shape = Object.freeze([
			Object.freeze({ type: 'view', parent: -1 }),
			Object.freeze({ type: 'text', parent: 0 }),
		]);
		const template = {
			op: 'mount-template' as const,
			parent: null,
			before: null,
			shape,
			nodes: [
				{ id: 1, props: { class: 'row' } },
				{
					id: 2,
					props: {},
					events: [{ type: 'bindtap', listener: { id: 4, priority: 'discrete' as const } }],
				},
			],
		};
		const commit = {
			...identity(6, 1),
			type: 'commit' as const,
			ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
			batch: {
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 1,
				commands: [template],
			},
		};
		expect(validateLynxBackgroundOutboundMessage(commit)).toBe(commit);
		expect(() => validateLynxBackgroundOutboundMessage({ ...commit, ack: 'compact-v2' })).toThrow(
			/commit\.ack/,
		);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...commit.batch,
					commands: [{ ...template, nodes: template.nodes.slice(0, 1) }],
				},
			}),
		).toThrow(/nodes.*template shape length/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...commit.batch,
					commands: [
						{
							...template,
							shape: [
								{ type: 'view', parent: -1 },
								{ type: 'text', parent: 1 },
							],
						},
					],
				},
			}),
		).toThrow(/shape\[1\]\.parent.*earlier node/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...commit.batch,
					commands: [template, { ...template, parent: 1, nodes: template.nodes }],
				},
			}),
		).toThrow(/nodes\[0\]\.id.*unique/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...commit.batch,
					commands: [
						{
							...template,
							nodes: [
								template.nodes[0],
								{
									id: 2,
									props: {},
									events: [{ type: 'bindtap', listener: { id: 4, priority: 'urgent' } }],
								},
							],
						},
					],
				},
			}),
		).toThrow(/listener\.priority/);

		const mutableEntry = { type: 'view', parent: -1 };
		const sharedMutableShape = Object.freeze([mutableEntry]);
		let mutated = false;
		const firstNode = new Proxy(
			{ id: 11, props: {} },
			{
				getOwnPropertyDescriptor(target, name) {
					const descriptor = Reflect.getOwnPropertyDescriptor(target, name);
					if (name === 'props' && !mutated) {
						mutated = true;
						mutableEntry.parent = 0;
					}
					return descriptor;
				},
			},
		);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...commit.batch,
					commands: [
						{ ...template, shape: sharedMutableShape, nodes: [firstNode] },
						{ ...template, shape: sharedMutableShape, nodes: [{ id: 12, props: {} }] },
					],
				},
			}),
		).toThrow(/shape\[0\]\.parent.*earlier node/);
		expect(mutated).toBe(true);
	});

	it('strictly validates cached intrinsic programs and every dynamic host/listener range', () => {
		const batch = templateProgramBatch(LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS);
		const first = batch.commands[0]!;
		if (first.op !== 'mount-template-range') throw new Error('Expected an intrinsic host program.');
		const commit = {
			...identity(7, 1),
			type: 'commit' as const,
			ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
			batch,
		};
		expect(validateLynxBackgroundOutboundMessage(commit)).toBe(commit);
		const rejectCommand = (command: unknown, pattern: RegExp) => {
			expect(() =>
				validateLynxBackgroundOutboundMessage({
					...commit,
					batch: { ...batch, commands: [command] },
				}),
			).toThrow(pattern);
		};
		rejectCommand({ ...first, values: ['only-one'] }, /dynamic-value arity/);
		rejectCommand({ ...first, values: [{ dangerous: true }, 'label'] }, /only scalar values/);
		rejectCommand({ ...first, values: [, 'label'] }, /dense.*symbol fields/);
		const nonEnumerableValues = ['row', 'label'];
		Object.defineProperty(nonEnumerableValues, '0', { enumerable: false });
		rejectCommand({ ...first, values: nonEnumerableValues }, /only enumerable data values/);
		const symbolValues = ['row', 'label'] as string[] & Record<symbol, string>;
		symbolValues[Symbol('unexpected')] = 'unsafe';
		rejectCommand({ ...first, values: symbolValues }, /dense.*symbol fields/);
		const foreignPrototypeValues = Object.setPrototypeOf(
			['row', 'label'],
			Object.create(Array.prototype),
		);
		rejectCommand(
			{ ...first, values: foreignPrototypeValues },
			/plain cross-realm array prototype/,
		);
		const reordered = {
			program: first.program,
			values: first.values,
			firstListenerId: first.firstListenerId,
			firstId: first.firstId,
			before: first.before,
			parent: first.parent,
			op: first.op,
		};
		expect(
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: { ...batch, commands: [reordered] },
			}),
		).toMatchObject({ batch: { commands: [{ firstId: first.firstId }] } });
		rejectCommand({ ...first, unknown: true }, /unknown field "unknown"/);
		const nonEnumerableCommand = { ...first };
		Object.defineProperty(nonEnumerableCommand, 'firstId', { enumerable: false });
		rejectCommand(nonEnumerableCommand, /firstId.*enumerable/);
		rejectCommand({ ...first, firstId: Number.MAX_SAFE_INTEGER }, /overflows.*host-ID range/);
		rejectCommand({ ...first, firstListenerId: null }, /firstListenerId.*positive safe integer/);
		rejectCommand(
			{
				...first,
				program: {
					...first.program,
					nodes: [{ ...first.program.nodes[0], parent: 0 }, first.program.nodes[1]],
				},
			},
			/parent.*earlier node/,
		);
		rejectCommand(
			{
				...first,
				program: {
					...first.program,
					nodes: [
						{
							...first.program.nodes[0],
							bindings: [{ name: 'main-thread:bindtap', valueIndex: 0 }],
						},
						first.program.nodes[1],
					],
				},
			},
			/ordinary host-prop name/,
		);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...batch,
					commands: [first, { ...batch.commands[1], firstId: first.firstId + 1 }],
				},
			}),
		).toThrow(/overlaps another intrinsic host range/);
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...batch,
					commands: [first, { ...batch.commands[1], firstListenerId: first.firstListenerId }],
				},
			}),
		).toThrow(/overlaps another intrinsic event-listener range/);

		let reads = 0;
		const values = ['row', 'label'];
		Object.defineProperty(values, '0', {
			configurable: true,
			enumerable: true,
			get() {
				reads++;
				return 'unsafe';
			},
		});
		rejectCommand({ ...first, values }, /only enumerable data values/);
		expect(reads).toBe(0);
		const indexedReadTrap = new Proxy(['row', 'label'], {
			get(target, property, receiver) {
				if (property === '0' || property === '1') {
					reads++;
					throw new Error('scalar validation evaluated a proxy index');
				}
				return Reflect.get(target, property, receiver);
			},
		});
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: { ...batch, commands: [{ ...first, values: indexedReadTrap }] },
			}),
		).toThrow(/scalar validation evaluated a proxy index/);
		expect(reads).toBe(1);

		const mutableNode = { ...first.program.nodes[0] };
		const mutableProgram = Object.freeze({
			...first.program,
			nodes: Object.freeze([mutableNode, first.program.nodes[1]]),
		});
		let changed = false;
		const mutatingValues = new Proxy(['row', 'label'], {
			getOwnPropertyDescriptor(target, name) {
				const descriptor = Reflect.getOwnPropertyDescriptor(target, name);
				if (name === '0' && !changed) {
					changed = true;
					mutableNode.parent = 0;
				}
				return descriptor;
			},
		});
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: {
					...batch,
					commands: [
						{ ...first, program: mutableProgram, values: mutatingValues },
						{ ...batch.commands[1], program: mutableProgram },
					],
				},
			}),
		).toThrow(/parent.*earlier node/);
		expect(changed).toBe(true);
	});

	it('rejects malformed contiguous template runs without evaluating hostile scalar accessors', () => {
		const batch = templateProgramRunBatch(LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS);
		const run = batch.commands[0]!;
		if (run.op !== 'mount-template-run') throw new Error('Expected a contiguous template run.');
		const commit = {
			...identity(9, 1),
			type: 'commit' as const,
			ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
			instances: LYNX_LAZY_PUBLIC_INSTANCES,
			batch,
		};
		expect(validateLynxBackgroundOutboundMessage(commit)).toBe(commit);
		const rejectRun = (command: unknown, pattern: RegExp) => {
			expect(() =>
				validateLynxBackgroundOutboundMessage({
					...commit,
					batch: { ...batch, commands: [command] },
				}),
			).toThrow(pattern);
		};
		rejectRun({ ...run, count: 0 }, /count.*positive safe integer/);
		rejectRun({ ...run, count: Number.MAX_SAFE_INTEGER }, /count.*intrinsic host count/);
		rejectRun({ ...run, firstId: Number.MAX_SAFE_INTEGER }, /firstId.*safe host-ID range/);
		rejectRun(
			{ ...run, firstListenerId: Number.MAX_SAFE_INTEGER },
			/firstListenerId.*event-listener range/,
		);
		rejectRun({ ...run, firstListenerId: null }, /firstListenerId.*positive safe integer/);
		rejectRun({ ...run, values: run.values.slice(0, -1) }, /dynamic-value arity/);
		rejectRun({ ...run, values: [Symbol('unsafe'), ...run.values.slice(1)] }, /only scalar values/);
		rejectRun({ ...run, extra: true }, /unknown field "extra"/);
		const sparse = [...run.values];
		delete sparse[0];
		rejectRun({ ...run, values: sparse }, /dense.*symbol fields/);
		let reads = 0;
		const accessorValues = [...run.values];
		Object.defineProperty(accessorValues, '0', {
			configurable: true,
			enumerable: true,
			get() {
				reads++;
				return 'unsafe';
			},
		});
		rejectRun({ ...run, values: accessorValues }, /only enumerable data values/);
		expect(reads).toBe(0);
		const reorderedValues = new Proxy([...run.values], {
			ownKeys(target) {
				const keys = Reflect.ownKeys(target);
				[keys[0], keys[1]] = [keys[1]!, keys[0]!];
				return keys;
			},
		});
		rejectRun({ ...run, values: reorderedValues }, /ordered canonical dense scalar keys/);
		const misplacedLengthValues = new Proxy([...run.values], {
			ownKeys(target) {
				const keys = Reflect.ownKeys(target);
				const last = keys.length - 1;
				[keys[0], keys[last]] = [keys[last]!, keys[0]!];
				return keys;
			},
		});
		rejectRun({ ...run, values: misplacedLengthValues }, /dense.*symbol fields/);
		const nonCanonicalValues = [...run.values] as unknown as Record<string, unknown>;
		delete nonCanonicalValues['0'];
		nonCanonicalValues['00'] = 'unsafe';
		rejectRun({ ...run, values: nonCanonicalValues }, /dense.*symbol fields|canonical/);

		const overlap = { ...run, firstId: run.firstId + 1, firstListenerId: 100 };
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: { ...batch, commands: [run, overlap] },
			}),
		).toThrow(/overlaps another intrinsic host range/);
		const listenerOverlap = {
			...run,
			firstId: run.firstId + run.count * run.program.nodes.length,
			firstListenerId: run.firstListenerId,
		};
		expect(() =>
			validateLynxBackgroundOutboundMessage({
				...commit,
				batch: { ...batch, commands: [run, listenerOverlap] },
			}),
		).toThrow(/overlaps another intrinsic event-listener range/);
	});

	it('accepts cross-realm acknowledgement snapshots and rejects unsafe snapshot fields', () => {
		const acknowledge = (snapshot: unknown) =>
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
						snapshot,
					},
				],
			});

		const foreignSnapshot = vm.runInNewContext(
			'({ $$kind: "octane.lynx.element", renderer, root: 1, id: 1, type: "view", generation: 1, selector })',
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				selector: createLynxNodesRefSelector(1, 1, 1),
			},
		);
		expect(acknowledge(foreignSnapshot)).toMatchObject({ type: 'ack' });

		const foreignPrototype = Object.assign(Object.create({ inherited: true }), {
			...(handleSnapshot(1, 1, 'view', 1) as object),
		});
		expect(() => acknowledge(foreignPrototype)).toThrow(/snapshot.*plain object/);

		const symbolSnapshot = {
			...(handleSnapshot(1, 1, 'view', 1) as object),
			[Symbol('hidden')]: true,
		};
		expect(() => acknowledge(symbolSnapshot)).toThrow(/snapshot.*symbol fields/);

		let accessorReads = 0;
		const accessorSnapshot = Object.defineProperty(
			{ ...(handleSnapshot(1, 1, 'view', 1) as object) },
			'selector',
			{
				configurable: true,
				enumerable: true,
				get() {
					accessorReads++;
					return createLynxNodesRefSelector(1, 1, 1);
				},
			},
		);
		expect(() => acknowledge(accessorSnapshot)).toThrow(/snapshot\.selector.*accessor/);
		expect(accessorReads).toBe(0);

		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(() =>
			acknowledge({ ...(handleSnapshot(1, 1, 'view', 1) as object), details: cyclic }),
		).toThrow(/snapshot\.details.*cycle/);
		expect(() =>
			acknowledge({ ...(handleSnapshot(1, 1, 'view', 1) as object), details: () => {} }),
		).toThrow(/snapshot\.details.*non-serializable/);
	});

	it('validates and snapshots root-independent clone-safe lifecycle data', () => {
		const shared = { enabled: true };
		const source = {
			accountId: 'account-a',
			nested: { count: 1, items: ['a', 2] },
			left: shared,
			right: shared,
		};
		const pageData = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-data' as const,
			operation: 'update' as const,
			data: source,
		};
		const globalProps = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'global-props' as const,
			patch: { locale: 'en-GB' },
		};

		expect(validateLynxBackgroundInboundMessage(pageData)).toBe(pageData);
		expect(validateLynxBackgroundInboundMessage(globalProps)).toBe(globalProps);
		const snapshot = snapshotLynxLifecycleData(source);
		source.nested.count = 2;
		shared.enabled = false;
		expect(snapshot).toEqual({
			accountId: 'account-a',
			nested: { count: 1, items: ['a', 2] },
			left: { enabled: true },
			right: { enabled: true },
		});
		expect(snapshot.left).toBe(snapshot.right);
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.nested as object)).toBe(true);

		expect(() => validateLynxBackgroundInboundMessage({ ...pageData, root: 1 })).toThrow(
			/page-data.*unknown field "root"/,
		);
		expect(() => validateLynxBackgroundInboundMessage({ ...pageData, operation: 'merge' })).toThrow(
			/page-data\.operation/,
		);
		expect(() => validateLynxBackgroundInboundMessage({ ...globalProps, patch: [] })).toThrow(
			/global-props\.patch.*object/,
		);

		let accessorRead = false;
		const accessorData = Object.defineProperty({}, 'secret', {
			enumerable: true,
			get() {
				accessorRead = true;
				return 'not-read';
			},
		});
		expect(() => validateLynxBackgroundInboundMessage({ ...pageData, data: accessorData })).toThrow(
			/must not be an accessor/,
		);
		expect(accessorRead).toBe(false);

		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(() => snapshotLynxLifecycleData(cyclic)).toThrow(/contains a cycle/);
		expect(() => snapshotLynxLifecycleData({ date: new Date() })).toThrow(
			/requires arrays or plain objects/,
		);
		const sparse: unknown[] = [];
		sparse.length = 1;
		expect(() => snapshotLynxLifecycleData({ sparse })).toThrow(/dense array/);
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
					(unwire(event.data) as { type?: unknown }).type === 'call-main',
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
			.map((event) => unwire(event.data))
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
			.map((event) => unwire(event.data))
			.find(
				(message) =>
					(message as { type?: unknown }).type === 'call-background-result' &&
					(message as { call?: unknown }).call === 19,
			) as { readonly value: unknown };
		expect(backgroundMessage).toMatchObject({ value: { saved: 'record' } });
		expect(backgroundMessage.value).not.toBe(backgroundResult);

		const malformedResultCall = transport.callMain({ _wkltId: 'app:malformed-result' }, []);
		const malformedResultMessage = context.events
			.map((event) => unwire(event.data) as { readonly type?: unknown; readonly call?: unknown })
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
		// A function cannot reach the wire at all any more. The transport encodes
		// before it dispatches, so a value JSON would drop is refused at the
		// sender — the last place that still knows what it was — rather than
		// arriving as a hostile payload for the receiver to walk.
		expect(() =>
			context.sendToBackground({
				...identity(82, 1),
				type: 'call-main-result',
				call: malformedResultMessage.call,
				value() {},
			}),
		).toThrow(/at \$\.value is a function/);

		// What can still arrive is a payload that parses and then fails the
		// schema, and that has to settle the pending call rather than hang it.
		context.sendToBackground({
			...identity(82, 1),
			type: 'call-main-result',
			call: malformedResultMessage.call,
			value: 'unreadable',
			unexpected: true,
		});
		await expect(malformedResultCall.promise).rejects.toThrow(/unknown field "unexpected"/);

		context.sendToBackground({
			...identity(82, 1),
			type: 'call-background',
			call: 20,
			fn: { _jsFnId: 'app:malformed-call' },
			args: [],
			unexpected: true,
		});
		const malformedCallError = context.events
			.map((event) => unwire(event.data) as { readonly type?: unknown; readonly call?: unknown })
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
			.map((event) => unwire(event.data) as { readonly type?: unknown; readonly call?: unknown })
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

	it('buffers one root-independent page destroy until logical cleanup is bound', async () => {
		const context = new FakeContextProxy();
		installMainHarness(context, false);
		const transport = createLynxBackgroundTransport(context, createLynxClientContainer());
		let cleanupCalls = 0;
		const pageDestroy = {
			protocol: LYNX_TRANSPORT_PROTOCOL_VERSION,
			renderer: LYNX_TRANSPORT_RENDERER,
			type: 'page-destroy' as const,
		};

		context.sendToBackground(pageDestroy);
		expect(transport.closedReason()?.message).toBe(
			'Octane Lynx native page lifetime was destroyed.',
		);
		await expect(transport.ready).rejects.toThrow(/native page lifetime was destroyed/);

		transport.bindPageDestroy(() => {
			cleanupCalls++;
		});
		await flushMicrotasks();
		expect(cleanupCalls).toBe(1);

		context.sendToBackground(pageDestroy);
		await flushMicrotasks();
		expect(cleanupCalls).toBe(1);
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
					(unwire(event.data) as { readonly type?: unknown }).type === 'terminal-dispose',
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
			const message = validateLynxBackgroundOutboundMessage(unwire(event.data));
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
						(unwire(event.data) as { readonly type?: unknown }).type === 'terminal-dispose',
				),
			).toHaveLength(0);

			context.sendToBackground({ ...commitIdentity(mount), ...malformed });
			expect(transport.closedReason()).toBeInstanceOf(TypeError);
			expect(container.getPublicHandle(1)).toBeNull();
			expect(
				context.events.filter(
					(event) =>
						event.type === LYNX_BACKGROUND_TO_MAIN_EVENT &&
						(unwire(event.data) as { readonly type?: unknown }).type === 'terminal-dispose',
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
			context.events.map((event) => [
				event.type,
				(unwire(event.data) as { readonly type?: unknown }).type,
			]),
		).toContainEqual([LYNX_BACKGROUND_TO_MAIN_EVENT, 'terminal-dispose']);
	});

	it('repeats one correlated readiness request until a late main listener answers', async () => {
		vi.useFakeTimers();
		try {
			const context = new FakeContextProxy();
			const transport = createLynxBackgroundTransport(context, createLynxClientContainer());
			const requests = () =>
				context.events
					.filter((event) => event.type === LYNX_BACKGROUND_TO_MAIN_EVENT)
					.map((event) => unwire(event.data))
					.filter(
						(message): message is LynxMainReadyRequest =>
							message !== null &&
							typeof message === 'object' &&
							(message as { readonly type?: unknown }).type === 'main-ready-request',
					);
			const initial = requests();
			expect(initial).toHaveLength(1);

			let ready = false;
			void transport.ready.then(() => {
				ready = true;
			});
			await flushMicrotasks();
			expect(ready).toBe(false);

			installMainHarness(context);
			await vi.advanceTimersToNextTimerAsync();
			expect(ready).toBe(true);
			const recovered = requests();
			expect(recovered).toHaveLength(2);
			expect(recovered.map(({ request }) => request)).toEqual([
				initial[0]!.request,
				initial[0]!.request,
			]);

			await vi.advanceTimersByTimeAsync(160);
			expect(requests()).toHaveLength(recovered.length);
			transport.close();
		} finally {
			vi.useRealTimers();
		}
	});

	it('stops readiness requests when a waiting transport closes', async () => {
		vi.useFakeTimers();
		try {
			const context = new FakeContextProxy();
			const transport = createLynxBackgroundTransport(context, createLynxClientContainer());
			const requestCount = () =>
				context.events.filter(
					(event) =>
						event.type === LYNX_BACKGROUND_TO_MAIN_EVENT &&
						(unwire(event.data) as { readonly type?: unknown }).type === 'main-ready-request',
				).length;
			const beforeClose = requestCount();
			const reason = new Error('closed before main listener installation');
			const ready = transport.ready.catch((error: unknown) => error);

			transport.close(reason);
			expect(await ready).toBe(reason);
			await vi.advanceTimersByTimeAsync(160);
			expect(requestCount()).toBe(beforeClose);
		} finally {
			vi.useRealTimers();
		}
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
			.map((event) => unwire(event.data))
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
			const message = validateLynxBackgroundOutboundMessage(unwire(event.data));
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

	it('publishes negotiated template handles without eagerly transmitting public snapshots', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context, true, { compactAck: 1, templateMount: 1 });
		const container = createLynxClientContainer();
		const driver = createLynxClientDriver(container);
		expect(driver.capabilities?.templateMount).toBe(false);
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		expect(driver.capabilities?.templateMount).toBe(true);

		const batch = templateBatch(LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS);
		const acceptedIdentity = identity(91, 1);
		const acknowledged = vi.fn();
		const applying = transport.prepareBatch(container, batch, acceptedIdentity).apply(acknowledged);
		await flushMicrotasks();
		const commit = main.commits[0] as LynxTransportCommitMessage;
		expect(commit.ack).toBe(LYNX_COMPACT_ACKNOWLEDGEMENT);
		expect(container.getPublicHandle(1)).toBeNull();
		context.sendToBackground({
			...acceptedIdentity,
			type: 'ack',
			encoding: LYNX_COMPACT_ACKNOWLEDGEMENT,
			count: LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS,
		});
		context.sendToBackground({ ...acceptedIdentity, type: 'complete' });
		await applying;
		expect(acknowledged).toHaveBeenCalledOnce();

		const first = container.getPublicHandle(1)!;
		const last = container.getPublicHandle(LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS)!;
		expect(first.active).toBe(true);
		expect(first.attached).toBe(true);
		expect(driver.getPublicInstance(container, 1)).toBe(first);
		expect(last.snapshot).toEqual({
			$$kind: 'octane.lynx.element',
			renderer: LYNX_TRANSPORT_RENDERER,
			root: acceptedIdentity.root,
			id: LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS,
			type: 'view',
			generation: 1,
			selector: createLynxNodesRefSelector(
				acceptedIdentity.root,
				LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS,
				1,
			),
		});
		expect(last.snapshot).toBe(last.snapshot);
		transport.close();
		expect(first.active).toBe(false);
		expect(last.active).toBe(false);
		expect(container.getPublicHandle(1)).toBeNull();
	});

	it('keeps compact host events, updates, attachments, destruction, and rollback generation-safe', () => {
		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const container = createLynxClientContainer();
		const acceptedIdentity = identity(94, 1);
		const initial = prepareLynxCompactHandleDeltas(
			container,
			templateBatch(count),
			count,
			acceptedIdentity,
		);
		initial.apply();
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 2, 1)).toBe(true);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 2, 2)).toBe(false);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root + 1, 2, 1)).toBe(false);

		const updated = prepareLynxHandleDeltas(
			container,
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 2,
				commands: [{ op: 'update', id: 2, props: { id: 'updated' } }],
			},
			[
				{
					op: 'upsert',
					id: 2,
					type: 'view',
					generation: 1,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(acceptedIdentity.root, 2, 'view', 1),
				},
			],
			identity(acceptedIdentity.root, 2),
		);
		updated.apply();
		expect(container.getPublicHandle(2)?.generation).toBe(1);

		applyLynxHostAttachments(container, [{ id: 3, generation: 1, attached: false }]);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 3, 1)).toBe(false);
		applyLynxHostAttachments(container, [{ id: 3, generation: 1, attached: true }]);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 3, 1)).toBe(true);

		const removed = prepareLynxHandleDeltas(
			container,
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 3,
				commands: [{ op: 'destroy', id: 4 }],
			},
			[{ op: 'remove', id: 4, generation: 1 }],
			identity(acceptedIdentity.root, 3),
		);
		removed.apply();
		expect(container.getPublicHandle(4)).toBeNull();
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 4, 1)).toBe(false);
		removed.rollback();
		expect(container.getPublicHandle(4)?.active).toBe(true);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 4, 1)).toBe(true);

		const previous = container.getPublicHandle(5)!;
		const recreated = prepareLynxHandleDeltas(
			container,
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 4,
				commands: [{ op: 'recreate', id: 5, type: 'view', props: { id: 'recreated' } }],
			},
			[
				{
					op: 'upsert',
					id: 5,
					type: 'view',
					generation: 2,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(acceptedIdentity.root, 5, 'view', 2),
				},
			],
			identity(acceptedIdentity.root, 4),
		);
		recreated.apply();
		expect(previous.active).toBe(false);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 5, 1)).toBe(false);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 5, 2)).toBe(true);
		recreated.rollback();
		expect(container.getPublicHandle(5)).toBe(previous);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 5, 1)).toBe(true);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 5, 2)).toBe(false);
	});

	it('re-arms compact acknowledgements after the last compact host retires', () => {
		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const container = createLynxClientContainer();
		prepareLynxCompactHandleDeltas(container, templateBatch(count), count, identity(96, 1)).apply();
		expect(container.getPublicHandle(1)?.active).toBe(true);

		const destroyAll = () =>
			prepareLynxHandleDeltas(
				container,
				{
					renderer: LYNX_TRANSPORT_RENDERER,
					version: 2,
					commands: Array.from({ length: count }, (_value, index) => ({
						op: 'destroy' as const,
						id: index + 1,
					})),
				},
				Array.from({ length: count }, (_value, index) => ({
					op: 'remove' as const,
					id: index + 1,
					generation: 1,
				})),
				identity(96, 2),
			);
		const original = templateProgramRunBatch(count, 3);
		const run = original.commands[0]!;
		if (run.op !== 'mount-template-run') throw new Error('Expected a contiguous host run.');
		const fresh: UniversalHostBatch = {
			...original,
			commands: [Object.freeze({ ...run, firstId: count + 1 })],
		};

		// A rolled-back retirement keeps the segment pinned: the metadata is
		// restored and a new compact acknowledgement is still refused.
		const rolledBack = destroyAll();
		rolledBack.apply();
		rolledBack.rollback();
		expect(container.getPublicHandle(2)?.active).toBe(true);
		expect(() =>
			prepareLynxCompactHandleDeltas(container, fresh, count, identity(96, 3), count, true),
		).toThrow(/fresh client container/);

		// Destroying the whole segment retires its metadata, so a later pure
		// run at fresh ids may negotiate a new compact acknowledgement.
		destroyAll().apply();
		expect(container.getPublicHandle(1)).toBeNull();
		const second = prepareLynxCompactHandleDeltas(
			container,
			fresh,
			count,
			identity(96, 3),
			count,
			true,
		);
		second.apply();
		expect(container.getPublicHandle(count + 1)?.generation).toBe(1);
		expect(container.getPublicHandle(count + 1)?.active).toBe(true);
	});

	it('retires a compact run from one remove-run delta and re-arms compact', () => {
		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const container = createLynxClientContainer();
		prepareLynxCompactHandleDeltas(container, templateBatch(count), count, identity(97, 1)).apply();
		const observed = container.getPublicHandle(2)!;
		expect(observed.active).toBe(true);
		const rightSurvivor = container.getPublicHandle(8)!;
		const firstRemoved = container.getPublicHandle(4)!;
		const lastRemoved = container.getPublicHandle(6)!;
		const firstRemovedSnapshot = firstRemoved.snapshot;
		const lastRemovedSnapshot = lastRemoved.snapshot;
		const rightSurvivorSnapshot = rightSurvivor.snapshot;

		const partialBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 2,
			commands: [{ op: 'destroy-run', parent: null, firstId: 4, count: 3, width: 1 }],
		};
		const partialRemoval = prepareLynxHandleDeltas(
			container,
			partialBatch,
			[{ op: 'remove-run', firstId: 4, hostCount: 3, generation: 1 }],
			identity(97, 2),
		);
		partialRemoval.apply();
		expect(firstRemoved.active).toBe(false);
		expect(lastRemoved.active).toBe(false);
		expect(container.getPublicHandle(4)).toBeNull();
		expect(container.getPublicHandle(5)).toBeNull();
		expect(container.getPublicHandle(6)).toBeNull();
		expect(container.getPublicHandle(2)).toBe(observed);
		expect(observed.active).toBe(true);
		expect(container.getPublicHandle(8)).toBe(rightSurvivor);
		expect(rightSurvivor.active).toBe(true);
		expect(rightSurvivor.snapshot).toBe(rightSurvivorSnapshot);

		partialRemoval.rollback();
		expect(container.getPublicHandle(2)).toBe(observed);
		expect(container.getPublicHandle(4)).toBe(firstRemoved);
		expect(container.getPublicHandle(6)).toBe(lastRemoved);
		expect(container.getPublicHandle(8)).toBe(rightSurvivor);
		expect(firstRemoved.active).toBe(true);
		expect(firstRemoved.attached).toBe(true);
		expect(firstRemoved.snapshot).toBe(firstRemovedSnapshot);
		expect(lastRemoved.active).toBe(true);
		expect(lastRemoved.attached).toBe(true);
		expect(lastRemoved.snapshot).toBe(lastRemovedSnapshot);
		expect(container.getPublicHandle(5)?.active).toBe(true);

		const runBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 2,
			commands: [{ op: 'destroy-run', parent: null, firstId: 1, count, width: 1 }],
		};
		expect(() => prepareLynxHandleDeltas(container, runBatch, [], identity(97, 2))).toThrow(
			/omits destroyed run/,
		);
		expect(() =>
			prepareLynxHandleDeltas(
				container,
				runBatch,
				[{ op: 'remove', id: 1, generation: 1 }],
				identity(97, 2),
			),
		).toThrow(/omits destroyed run/);

		const fallback = prepareLynxHandleDeltas(
			container,
			runBatch,
			Array.from({ length: count }, (_value, index) => ({
				op: 'remove' as const,
				id: index + 1,
				generation: 1,
			})),
			identity(97, 2),
		);
		fallback.apply();
		expect(container.getPublicHandle(2)).toBeNull();
		fallback.rollback();
		expect(container.getPublicHandle(2)).toBe(observed);

		const removal = prepareLynxHandleDeltas(
			container,
			runBatch,
			[{ op: 'remove-run', firstId: 1, hostCount: count, generation: 1 }],
			identity(97, 2),
		);
		removal.apply();
		expect(observed.active).toBe(false);
		expect(container.getPublicHandle(1)).toBeNull();
		expect(container.getPublicHandle(2)).toBeNull();

		removal.rollback();
		expect(container.getPublicHandle(2)).toBe(observed);
		expect(observed.active).toBe(true);

		prepareLynxHandleDeltas(
			container,
			runBatch,
			[{ op: 'remove-run', firstId: 1, hostCount: count, generation: 1 }],
			identity(97, 2),
		).apply();
		expect(container.getPublicHandle(2)).toBeNull();

		// The retired metadata is dropped, so a later run at fresh ids may
		// negotiate a new incremental compact acknowledgement…
		const original = templateProgramRunBatch(count, 3);
		const run = original.commands[0]!;
		if (run.op !== 'mount-template-run') throw new Error('Expected a contiguous host run.');
		const fresh: UniversalHostBatch = {
			...original,
			commands: [Object.freeze({ ...run, firstId: count + 1 })],
		};
		// …while a run overlapping the retired range is rejected…
		const overlapping: UniversalHostBatch = {
			...original,
			commands: [Object.freeze({ ...run, firstId: 1 })],
		};
		expect(() =>
			prepareLynxCompactHandleDeltas(container, overlapping, count, identity(97, 3), count, true),
		).toThrow(/reuses a retired handle/);

		// …and a fresh range is accepted.
		prepareLynxCompactHandleDeltas(container, fresh, count, identity(97, 3), count, true).apply();
		expect(container.getPublicHandle(count + 1)?.generation).toBe(1);
	});

	it('requires a fresh generation when reusing a host from a retired compact run', () => {
		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const container = createLynxClientContainer();
		prepareLynxCompactHandleDeltas(container, templateBatch(count), count, identity(98, 1)).apply();
		prepareLynxHandleDeltas(
			container,
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 2,
				commands: [{ op: 'destroy-run', parent: null, firstId: 1, count, width: 1 }],
			},
			[{ op: 'remove-run', firstId: 1, hostCount: count, generation: 1 }],
			identity(98, 2),
		).apply();

		const reuseBatch: UniversalHostBatch = {
			renderer: LYNX_TRANSPORT_RENDERER,
			version: 3,
			commands: [{ op: 'create', id: 1, type: 'view', props: { id: 'replacement' } }],
		};
		const replacement = (generation: number) => ({
			op: 'upsert' as const,
			id: 1,
			type: 'view',
			generation,
			attached: true,
			listDescendant: false,
			snapshot: handleSnapshot(98, 1, 'view', generation),
		});
		expect(() =>
			prepareLynxHandleDeltas(container, reuseBatch, [replacement(1)], identity(98, 3)),
		).toThrow(/invalid created handle 1/);
		prepareLynxHandleDeltas(container, reuseBatch, [replacement(2)], identity(98, 3)).apply();
		expect(container.getPublicHandle(1)?.generation).toBe(2);
	});

	it('preserves adopted handles when compact descendants are accepted or rolled back', () => {
		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const container = createLynxClientContainer();
		const root = 105;
		prepareLynxHandleDeltas(
			container,
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 1,
				commands: [{ op: 'create', id: 1, type: 'view', props: { id: 'adopted-shell' } }],
			},
			[
				{
					op: 'upsert',
					id: 1,
					type: 'view',
					generation: 1,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(root, 1, 'view', 1),
				},
			],
			identity(root, 1),
		).apply();
		const shell = container.getPublicHandle(1)!;
		const original = templateProgramRunBatch(count, 2);
		const run = original.commands[0]!;
		if (run.op !== 'mount-template-run') throw new Error('Expected a contiguous host run.');
		const descendants: UniversalHostBatch = {
			...original,
			commands: [Object.freeze({ ...run, firstId: 2 })],
		};
		const acceptedIdentity = identity(root, 2);

		expect(() =>
			prepareLynxCompactHandleDeltas(container, original, count, acceptedIdentity, count, true),
		).toThrow(/overlaps an accepted handle/);
		expect(() =>
			prepareLynxCompactHandleDeltas(
				container,
				{ ...descendants, commands: [{ ...run, firstId: 2 }] },
				count,
				acceptedIdentity,
				count,
				true,
			),
		).toThrow(/one frozen host run/);

		const rolledBack = prepareLynxCompactHandleDeltas(
			container,
			descendants,
			count,
			acceptedIdentity,
			count,
			true,
		);
		rolledBack.apply();
		const transient = container.getPublicHandle(2)!;
		expect(container.getPublicHandle(1)).toBe(shell);
		expect(isLynxClientEventTarget(container, root, 2, 1)).toBe(true);
		rolledBack.rollback();
		expect(container.getPublicHandle(1)).toBe(shell);
		expect(shell.active).toBe(true);
		expect(transient.active).toBe(false);
		expect(container.getPublicHandle(2)).toBeNull();
		expect(isLynxClientEventTarget(container, root, 2, 1)).toBe(false);

		prepareLynxCompactHandleDeltas(
			container,
			descendants,
			count,
			acceptedIdentity,
			count,
			true,
		).apply();
		const removed = container.getPublicHandle(2)!;
		prepareLynxHandleDeltas(
			container,
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 3,
				commands: [{ op: 'destroy', id: 2 }],
			},
			[{ op: 'remove', id: 2, generation: 1 }],
			identity(root, 3),
		).apply();
		expect(removed.active).toBe(false);
		expect(container.getPublicHandle(1)).toBe(shell);
		expect(isLynxClientEventTarget(container, root, 2, 1)).toBe(false);
		expect(isLynxClientEventTarget(container, root, count + 1, 1)).toBe(true);

		prepareLynxHandleDeltas(
			container,
			{
				renderer: LYNX_TRANSPORT_RENDERER,
				version: 4,
				commands: [{ op: 'create', id: 2, type: 'view', props: { id: 'replacement' } }],
			},
			[
				{
					op: 'upsert',
					id: 2,
					type: 'view',
					generation: 2,
					attached: true,
					listDescendant: false,
					snapshot: handleSnapshot(root, 2, 'view', 2),
				},
			],
			identity(root, 4),
		).apply();
		expect(container.getPublicHandle(2)?.generation).toBe(2);
		expect(isLynxClientEventTarget(container, root, 2, 1)).toBe(false);
		expect(isLynxClientEventTarget(container, root, 2, 2)).toBe(true);
		expect(container.getPublicHandle(1)).toBe(shell);
	});

	it('negotiates intrinsic programs and derives every compact host from its implicit ID range', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context, true, {
			compactAck: 1,
			templateMount: 1,
			templateProgram: 1,
		});
		const container = createLynxClientContainer();
		const driver = createLynxClientDriver(container);
		expect(driver.capabilities?.templateProgramMount).toBe(false);
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		expect(driver.capabilities?.templateProgramMount).toBe(true);
		expect(driver.capabilities?.templateProgramRuns).toBe(false);
		expect(driver.capabilities?.lazyPublicInstances).toBe(false);

		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const batch = templateProgramBatch(count);
		const acceptedIdentity = identity(97, 1);
		const applying = transport.prepareBatch(container, batch, acceptedIdentity).apply(() => {});
		await flushMicrotasks();
		expect((main.commits[0] as LynxTransportCommitMessage).ack).toBe(LYNX_COMPACT_ACKNOWLEDGEMENT);
		expect((main.commits[0] as LynxTransportCommitMessage).instances).toBeUndefined();
		context.sendToBackground({
			...acceptedIdentity,
			type: 'ack',
			encoding: LYNX_COMPACT_ACKNOWLEDGEMENT,
			count,
		});
		context.sendToBackground({ ...acceptedIdentity, type: 'complete' });
		await applying;
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, count, 1)).toBe(true);
		expect(container.getPublicHandle(1)?.type).toBe('view');
		expect(container.getPublicHandle(2)?.type).toBe('#text');
		expect(container.getPublicHandle(count + 1)).toBeNull();
		transport.close();
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, count, 1)).toBe(false);
	});

	it('defers private selectors only on an explicitly negotiated initial intrinsic commit', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context, true, {
			compactAck: 1,
			templateMount: 1,
			templateProgram: 1,
			lazyPublicInstances: 1,
		});
		const container = createLynxClientContainer();
		const driver = createLynxClientDriver(container);
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		expect(driver.capabilities?.lazyPublicInstances).toBe(true);
		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const firstIdentity = identity(99, 1);
		const first = transport
			.prepareBatch(container, templateProgramBatch(count), firstIdentity)
			.apply(() => {});
		await flushMicrotasks();
		expect(main.commits[0]).toMatchObject({
			ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
			instances: LYNX_LAZY_PUBLIC_INSTANCES,
		});
		context.sendToBackground({
			...firstIdentity,
			type: 'ack',
			encoding: LYNX_COMPACT_ACKNOWLEDGEMENT,
			count,
		});
		context.sendToBackground({ ...firstIdentity, type: 'complete' });
		await first;

		const secondIdentity = identity(firstIdentity.root, 2);
		const ensured = transport
			.prepareBatch(
				container,
				{
					renderer: LYNX_TRANSPORT_RENDERER,
					version: 2,
					commands: [{ op: 'ensure-public-instance', id: 3 }],
				},
				secondIdentity,
			)
			.apply(() => {});
		await flushMicrotasks();
		expect((main.commits[1] as LynxTransportCommitMessage).instances).toBeUndefined();
		expect((main.commits[1] as LynxTransportCommitMessage).ack).toBeUndefined();
		main.acknowledge(main.commits[1]!, 'complete');
		await ensured;
		expect(container.getPublicHandle(3)?.active).toBe(true);
		transport.close();
	});

	it('negotiates one contiguous template run and derives all compact host identities in bulk', async () => {
		const context = new FakeContextProxy();
		const main = installMainHarness(context, true, {
			compactAck: 1,
			templateMount: 1,
			templateProgram: 1,
			lazyPublicInstances: 1,
			templateRuns: 1,
		});
		const container = createLynxClientContainer();
		const driver = createLynxClientDriver(container);
		expect(driver.capabilities?.templateProgramRuns).toBe(false);
		const transport = createLynxBackgroundTransport(context, container);
		await transport.ready;
		expect(driver.capabilities?.templateProgramRuns).toBe(true);
		expect(driver.capabilities?.lazyPublicInstances).toBe(true);
		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const batch = templateProgramRunBatch(count);
		const acceptedIdentity = identity(100, 1);
		const applying = transport.prepareBatch(container, batch, acceptedIdentity).apply(() => {});
		await flushMicrotasks();
		expect(main.commits).toHaveLength(1);
		expect(main.commits[0]).toMatchObject({
			ack: LYNX_COMPACT_ACKNOWLEDGEMENT,
			instances: LYNX_LAZY_PUBLIC_INSTANCES,
			batch: { commands: [{ op: 'mount-template-run', count: count / 2 }] },
		});
		context.sendToBackground({
			...acceptedIdentity,
			type: 'ack',
			encoding: LYNX_COMPACT_ACKNOWLEDGEMENT,
			count,
		});
		context.sendToBackground({ ...acceptedIdentity, type: 'complete' });
		await applying;
		for (let id = 1; id <= count; id++) {
			expect(isLynxClientEventTarget(container, acceptedIdentity.root, id, 1)).toBe(true);
			expect(container.getPublicHandle(id)?.type).toBe(id % 2 === 1 ? 'view' : '#text');
		}
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, count + 1, 1)).toBe(false);
		transport.close();
	});

	it('retains exact legacy handle snapshots for contiguous runs when compact ACK falls back', () => {
		const container = createLynxClientContainer();
		const batch = templateProgramRunBatch(4);
		const acceptedIdentity = identity(101, 1);
		const handles: LynxPublicHandleDelta[] = [1, 2, 3, 4].map((id) => {
			const type = id % 2 === 1 ? 'view' : '#text';
			return {
				op: 'upsert' as const,
				id,
				type,
				generation: 1,
				attached: true,
				listDescendant: false,
				snapshot: handleSnapshot(acceptedIdentity.root, id, type, 1),
			};
		});
		const prepared = prepareLynxHandleDeltas(container, batch, handles, acceptedIdentity);
		prepared.apply();
		expect(container.getPublicHandle(3)?.type).toBe('view');
		expect(container.getPublicHandle(4)?.snapshot).toMatchObject({ id: 4, type: '#text' });
		prepared.rollback();
		expect(container.getPublicHandle(3)).toBeNull();
		expect(container.getPublicHandle(4)).toBeNull();
	});

	it('retains legacy snapshots for negotiated intrinsic hosts when compact ACK is unavailable', () => {
		const container = createLynxClientContainer();
		const batch = templateProgramBatch(2);
		const acceptedIdentity = identity(98, 1);
		const handles: LynxPublicHandleDelta[] = [
			{
				op: 'upsert',
				id: 1,
				type: 'view',
				generation: 1,
				attached: true,
				listDescendant: false,
				snapshot: handleSnapshot(acceptedIdentity.root, 1, 'view', 1),
			},
			{
				op: 'upsert',
				id: 2,
				type: '#text',
				generation: 1,
				attached: true,
				listDescendant: false,
				snapshot: handleSnapshot(acceptedIdentity.root, 2, '#text', 1),
			},
		];
		const prepared = prepareLynxHandleDeltas(container, batch, handles, acceptedIdentity);
		prepared.apply();
		expect(container.getPublicHandle(1)?.attached).toBe(true);
		expect(container.getPublicHandle(2)?.type).toBe('#text');
		prepared.rollback();
		expect(container.getPublicHandle(1)).toBeNull();
		expect(container.getPublicHandle(2)).toBeNull();
	});

	it('indexes ordinary owner-range holes and safely falls back for genuinely sparse compact IDs', () => {
		const count = LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS;
		const original = templateBatch(count);
		const template = original.commands[0]!;
		if (template.op !== 'mount-template') throw new Error('Expected a host template.');
		const holeNodes = template.nodes.map((node, index) =>
			Object.freeze({ ...node, id: index + 100 + Math.floor(index / 4) }),
		);
		const withOwnerRangeHoles: UniversalHostBatch = {
			...original,
			commands: [{ ...template, nodes: Object.freeze(holeNodes) }],
		};
		const denseContainer = createLynxClientContainer();
		const denseIdentity = identity(95, 1);
		prepareLynxCompactHandleDeltas(
			denseContainer,
			withOwnerRangeHoles,
			count,
			denseIdentity,
		).apply();
		expect(isLynxClientEventTarget(denseContainer, denseIdentity.root, 100, 1)).toBe(true);
		expect(isLynxClientEventTarget(denseContainer, denseIdentity.root, 104, 1)).toBe(false);
		expect(isLynxClientEventTarget(denseContainer, denseIdentity.root, 105, 1)).toBe(true);
		expect(denseContainer.getPublicHandle(holeNodes[count - 1]!.id)?.id).toBe(
			holeNodes[count - 1]!.id,
		);

		const nodes = template.nodes.map((node, index) =>
			Object.freeze({ ...node, id: index === count - 1 ? Number.MAX_SAFE_INTEGER : index + 100 }),
		);
		const batch: UniversalHostBatch = {
			...original,
			commands: [{ ...template, nodes: Object.freeze(nodes) }],
		};
		const container = createLynxClientContainer();
		const acceptedIdentity = identity(96, 1);
		prepareLynxCompactHandleDeltas(container, batch, count, acceptedIdentity).apply();
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 100, 1)).toBe(true);
		expect(
			isLynxClientEventTarget(container, acceptedIdentity.root, Number.MAX_SAFE_INTEGER, 1),
		).toBe(true);
		expect(isLynxClientEventTarget(container, acceptedIdentity.root, 99, 1)).toBe(false);
		expect(container.getPublicHandle(Number.MAX_SAFE_INTEGER)?.type).toBe('view');
	});

	it('rejects unnegotiated or mismatched compact acknowledgements and rolls back exposed refs', async () => {
		const run = async (
			capabilities: LynxMainThreadCapabilities | undefined,
			count: number,
			rejectCore = false,
		) => {
			const context = new FakeContextProxy();
			const main = installMainHarness(context, true, capabilities);
			const container = createLynxClientContainer();
			const transport = createLynxBackgroundTransport(context, container);
			await transport.ready;
			const acceptedIdentity = identity(92, 1);
			let exposed: LynxPublicHandle | null = null;
			const applying = transport
				.prepareBatch(
					container,
					templateBatch(LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS),
					acceptedIdentity,
				)
				.apply(() => {
					if (!rejectCore) return;
					exposed = container.getPublicHandle(1);
					throw new Error('public acknowledgement callback rejected');
				});
			void applying.catch(() => {});
			await flushMicrotasks();
			const outbound = main.commits[0] as LynxTransportCommitMessage;
			expect(outbound.ack).toBe(
				capabilities === undefined ? undefined : LYNX_COMPACT_ACKNOWLEDGEMENT,
			);
			context.sendToBackground({
				...acceptedIdentity,
				type: 'ack',
				encoding: LYNX_COMPACT_ACKNOWLEDGEMENT,
				count,
			});
			await expect(applying).rejects.toThrow(
				rejectCore
					? /public acknowledgement callback rejected/
					: capabilities === undefined
						? /unnegotiated compact acknowledgement/
						: /mismatched host count or batch/,
			);
			expect(container.getPublicHandle(1)).toBeNull();
			if (rejectCore) {
				expect(exposed).not.toBeNull();
				expect(exposed!.active).toBe(false);
				expect(exposed!.attached).toBe(false);
			}
		};

		await run(undefined, LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS);
		await run({ compactAck: 1, templateMount: 1 }, LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS + 1);
		await run({ compactAck: 1, templateMount: 1 }, LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS, true);
	});

	it('publishes legacy handle snapshots for template additions when compact ACK is unavailable', () => {
		const container = createLynxClientContainer();
		const batch = templateBatch(2);
		const acceptedIdentity = identity(93, 1);
		const handles: LynxPublicHandleDelta[] = [1, 2].map((id) => ({
			op: 'upsert',
			id,
			type: 'view',
			generation: 1,
			attached: true,
			listDescendant: false,
			snapshot: handleSnapshot(acceptedIdentity.root, id, 'view', 1),
		}));
		const prepared = prepareLynxHandleDeltas(container, batch, handles, acceptedIdentity);
		prepared.apply();
		expect(container.getPublicHandle(1)?.attached).toBe(true);
		expect(container.getPublicHandle(2)?.snapshot).toMatchObject({ id: 2, generation: 1 });
		prepared.rollback();
		expect(container.getPublicHandle(1)).toBeNull();
		expect(container.getPublicHandle(2)).toBeNull();
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
			.map((entry) => (unwire(entry.data) as { type: string }).type);
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
			.map((entry) => (unwire(entry.data) as { type: string }).type);
		expect(waitingOutbound).not.toContain('commit');
		expect(waitingOutbound).not.toContain('abort');
		waitingTransport.close();
		directTransport.close();
		transport.close();
	});
});
