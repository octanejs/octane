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
						snapshot: handleSnapshot(1, 1, 'view', 1, { value: 1 }),
					},
				],
			}),
		).toMatchObject({ type: 'ack' });

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
