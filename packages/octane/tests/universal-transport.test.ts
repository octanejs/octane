import { MessageChannel } from 'node:worker_threads';
import { afterEach, describe, expect, it } from 'vitest';
import {
	UNIVERSAL_TRANSPORT_PROTOCOL_VERSION,
	type ObjectHostContainer,
	type ObjectHostInstance,
	type UniversalAsyncCommitTransport,
	type UniversalHostBatch,
	type UniversalHostDriver,
	type UniversalSerializableValue,
	type UniversalTransportAcknowledgement,
	type UniversalTransportCommitMessage,
	type UniversalTransportEventMessage,
	type UniversalTransportIdentity,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	type UniversalRoot,
	universalPlan,
	universalProps,
	universalValue,
	use,
	useLayoutEffect,
	useState,
} from '../src/universal.js';

const RENDERER = 'transport-proof';

interface PublicSnapshot {
	readonly id: number;
	readonly type: string;
	readonly props: Readonly<Record<string, unknown>>;
	readonly layout: { readonly acceptedVersion: number };
}

interface PublicHandle {
	readonly id: number;
	readonly type: string;
	props: Readonly<Record<string, unknown>>;
	layout: { readonly acceptedVersion: number };
}

interface TransportContainer {
	readonly renderer: string;
	readonly host: ObjectHostContainer;
	readonly publicInstances: Map<number, PublicHandle>;
}

interface PendingBatch {
	readonly identity: UniversalTransportIdentity;
	readonly acknowledge: (message: UniversalTransportAcknowledgement) => void;
	readonly resolve: () => void;
	readonly reject: (error: Error) => void;
}

interface AckWithSnapshots extends UniversalTransportAcknowledgement {
	readonly snapshots: readonly PublicSnapshot[];
}

interface EventOutcome {
	readonly results?: readonly unknown[];
	readonly error?: Error;
}

const openTransports: { close(): void }[] = [];

afterEach(() => {
	for (const transport of openTransports.splice(0)) transport.close();
});

function hostSnapshots(container: ObjectHostContainer, version: number): PublicSnapshot[] {
	const snapshots: PublicSnapshot[] = [];
	const visit = (instance: ObjectHostInstance) => {
		snapshots.push({
			id: instance.id,
			type: instance.type,
			props: structuredClone(instance.props),
			layout: { acceptedVersion: version },
		});
		for (const child of instance.children) visit(child);
	};
	for (const child of container.children) visit(child);
	return snapshots;
}

function publishSnapshots(
	container: TransportContainer,
	snapshots: readonly PublicSnapshot[],
): void {
	const live = new Set<number>();
	for (const snapshot of snapshots) {
		live.add(snapshot.id);
		const previous = container.publicInstances.get(snapshot.id);
		if (previous === undefined) {
			container.publicInstances.set(snapshot.id, {
				id: snapshot.id,
				type: snapshot.type,
				props: snapshot.props,
				layout: snapshot.layout,
			});
		} else {
			previous.props = snapshot.props;
			previous.layout = snapshot.layout;
		}
	}
	for (const id of container.publicInstances.keys()) {
		if (!live.has(id)) container.publicInstances.delete(id);
	}
}

function createTransportDriver(
	withCodec = true,
): UniversalHostDriver<TransportContainer, PublicHandle> {
	const hostDriver = createObjectDriver(RENDERER);
	return {
		...hostDriver,
		capabilities: { ...hostDriver.capabilities, localHostCallbacks: false },
		localCallbacks: undefined,
		props: withCodec
			? {
					encode(context) {
						if (context.name === 'resource') {
							const id = (context.value as { id: string }).id;
							return { kind: 'resource', handle: context.createResourceHandle(id) };
						}
						if (typeof context.value === 'function') {
							return {
								kind: 'unsupported',
								reason: `Transport proof does not support function prop ${context.name}.`,
							};
						}
						return {
							kind: 'value',
							value: context.value as UniversalSerializableValue,
						};
					},
				}
			: undefined,
		prepareBatch() {
			throw new Error('The transport proof client driver cannot mutate the remote host.');
		},
		getPublicInstance(container, id) {
			return container.publicInstances.get(id) ?? null;
		},
	};
}

function sameIdentity(
	left: UniversalTransportIdentity,
	right: UniversalTransportIdentity,
): boolean {
	return (
		left.protocol === right.protocol &&
		left.renderer === right.renderer &&
		left.root === right.root &&
		left.version === right.version
	);
}

function createLoopback(container: TransportContainer) {
	const { port1: clientPort, port2: hostPort } = new MessageChannel();
	// The receiver owns a separate driver. The async transport contract exposes no
	// client-side preparation closure that could introduce a second acceptance point.
	const remoteDriver = createObjectDriver(RENDERER);
	const pending = new Map<number, PendingBatch>();
	const receivedBatches: UniversalHostBatch[] = [];
	const sentBatches: UniversalHostBatch[] = [];
	const staleMessages: unknown[] = [];
	const eventWaiters: ((outcome: EventOutcome) => void)[] = [];
	let root: UniversalRoot | null = null;
	let acceptedIdentity: UniversalTransportIdentity | null = null;
	let acceptedHostVersion = 0;
	let rejectNext: string | null = null;
	let faultNext: string | null = null;
	let completeWithoutAcknowledgementNext = false;
	let captureAcknowledgementNext = false;
	let capturedAcknowledgement: (() => void) | null = null;
	let holdNext = false;
	let heldCommit: (() => void) | null = null;
	let heldResolve: (() => void) | null = null;
	let holdCompletionNext = false;
	let heldCompletion: (() => void) | null = null;
	let heldCompletionVersion: number | null = null;
	let heldAcknowledgedResolve: (() => void) | null = null;
	let nextAfterAccept: ((batch: UniversalHostBatch) => void) | null = null;

	const postError = (
		type: 'reject' | 'fault',
		identity: UniversalTransportIdentity,
		message: string,
	) => {
		hostPort.postMessage({
			...identity,
			type,
			error: { name: 'Error', message },
		});
	};

	const processCommit = (message: UniversalTransportCommitMessage) => {
		const entry = pending.get(message.version);
		if (entry === undefined) {
			staleMessages.push(message);
			return;
		}
		if (
			!sameIdentity(entry.identity, message) ||
			message.batch.renderer !== message.renderer ||
			message.batch.version !== message.version ||
			message.version <= acceptedHostVersion
		) {
			postError('reject', entry.identity, 'Host rejected stale or foreign commit envelope.');
			return;
		}
		receivedBatches.push(message.batch);
		if (rejectNext !== null) {
			const reason = rejectNext;
			rejectNext = null;
			postError('reject', entry.identity, reason);
			return;
		}
		if (completeWithoutAcknowledgementNext) {
			completeWithoutAcknowledgementNext = false;
			hostPort.postMessage({ ...entry.identity, type: 'complete' });
			return;
		}

		let prepared: ReturnType<typeof remoteDriver.prepareBatch>;
		try {
			prepared = remoteDriver.prepareBatch(container.host, message.batch, {
				invokeLocalCallback() {
					throw new Error('Transported local host callbacks are unsupported.');
				},
			});
		} catch (error) {
			postError('reject', entry.identity, (error as Error).message);
			return;
		}
		let applyError: Error | null = null;
		try {
			prepared.apply();
		} catch (error) {
			applyError = error as Error;
		}
		acceptedHostVersion = message.version;
		acceptedIdentity = entry.identity;
		const acknowledgement: AckWithSnapshots = {
			...entry.identity,
			type: 'ack',
			snapshots: hostSnapshots(container.host, message.version),
		};
		hostPort.postMessage(acknowledgement);
		const fault = faultNext;
		faultNext = null;
		const complete = () => {
			if (applyError !== null || fault !== null) {
				postError('fault', entry.identity, applyError?.message ?? fault!);
			} else {
				hostPort.postMessage({ ...entry.identity, type: 'complete' });
			}
		};
		if (holdCompletionNext) {
			holdCompletionNext = false;
			heldCompletion = complete;
			heldCompletionVersion = message.version;
		} else {
			complete();
		}
	};

	hostPort.on('message', (value: unknown) => {
		const message = value as { type?: string };
		if (message.type === 'abort') return;
		if (message.type !== 'commit') {
			staleMessages.push(value);
			return;
		}
		const commit = message as UniversalTransportCommitMessage;
		if (holdNext) {
			holdNext = false;
			heldCommit = () => processCommit(commit);
			heldResolve?.();
			heldResolve = null;
			return;
		}
		processCommit(commit);
	});

	clientPort.on('message', (value: unknown) => {
		const message = value as { type?: string; version?: number };
		if (message.type === 'event') {
			let outcome: EventOutcome;
			try {
				outcome = {
					results: root!.dispatchTransportEvent(value as UniversalTransportEventMessage),
				};
			} catch (error) {
				outcome = { error: error as Error };
			}
			eventWaiters.shift()?.(outcome);
			return;
		}
		const entry = message.version === undefined ? undefined : pending.get(message.version);
		if (entry === undefined || !sameIdentity(entry.identity, value as UniversalTransportIdentity)) {
			staleMessages.push(value);
			return;
		}
		if (message.type === 'ack') {
			const acknowledgement = value as AckWithSnapshots;
			publishSnapshots(container, acknowledgement.snapshots);
			try {
				entry.acknowledge(acknowledgement);
				if (heldCompletionVersion === entry.identity.version) {
					heldAcknowledgedResolve?.();
					heldAcknowledgedResolve = null;
				}
			} catch (error) {
				pending.delete(entry.identity.version);
				entry.reject(error as Error);
			}
			return;
		}
		pending.delete(entry.identity.version);
		if (message.type === 'complete') {
			entry.resolve();
		} else if (message.type === 'reject' || message.type === 'fault') {
			entry.reject(new Error((value as { error: { message: string } }).error.message));
		} else {
			staleMessages.push(value);
			entry.reject(new Error(`Unknown transport response ${String(message.type)}.`));
		}
	});

	const transport: UniversalAsyncCommitTransport<TransportContainer> = {
		mode: 'async',
		prepareBatch(_container, batch, identity) {
			const afterAccept = nextAfterAccept;
			nextAfterAccept = null;
			const captureAcknowledgement = captureAcknowledgementNext;
			captureAcknowledgementNext = false;
			return {
				apply(acknowledge) {
					if (captureAcknowledgement) {
						capturedAcknowledgement = () => acknowledge({ ...identity, type: 'ack' });
					}
					return new Promise<void>((resolve, reject) => {
						pending.set(identity.version, {
							identity,
							acknowledge,
							resolve,
							reject,
						});
						const message: UniversalTransportCommitMessage = {
							...identity,
							type: 'commit',
							batch,
						};
						sentBatches.push(batch);
						clientPort.postMessage(message);
					});
				},
				afterAccept() {
					afterAccept?.(batch);
				},
				abort() {
					const entry = pending.get(identity.version);
					pending.delete(identity.version);
					if (entry !== undefined) {
						clientPort.postMessage({ ...identity, type: 'abort' });
						entry.reject(new Error(`Transport batch ${identity.version} aborted.`));
					}
				},
			};
		},
	};

	const api = {
		transport,
		receivedBatches,
		sentBatches,
		staleMessages,
		bindRoot(value: UniversalRoot) {
			root = value;
		},
		rejectNext(message: string) {
			rejectNext = message;
		},
		faultNext(message: string) {
			faultNext = message;
		},
		completeNextWithoutAcknowledgement() {
			completeWithoutAcknowledgementNext = true;
		},
		captureNextAcknowledgement() {
			captureAcknowledgementNext = true;
		},
		invokeCapturedAcknowledgement() {
			const acknowledge = capturedAcknowledgement;
			capturedAcknowledgement = null;
			if (acknowledge === null) throw new Error('No captured transport acknowledgement.');
			acknowledge();
		},
		holdNext() {
			holdNext = true;
			return new Promise<void>((resolve) => {
				heldResolve = resolve;
			});
		},
		holdCompletion() {
			holdCompletionNext = true;
			return new Promise<void>((resolve) => {
				heldAcknowledgedResolve = resolve;
			});
		},
		release() {
			const commit = heldCommit;
			heldCommit = null;
			commit?.();
		},
		releaseCompletion() {
			const complete = heldCompletion;
			heldCompletion = null;
			heldCompletionVersion = null;
			complete?.();
		},
		afterAcceptNext(callback: (batch: UniversalHostBatch) => void) {
			nextAfterAccept = callback;
		},
		acceptedIdentity() {
			if (acceptedIdentity === null) throw new Error('No transported batch has been accepted.');
			return acceptedIdentity;
		},
		listener(type: string, occurrence = 0): number {
			const listeners = receivedBatches.flatMap((batch) =>
				batch.commands.flatMap((command) =>
					command.op === 'event' && command.type === type && command.listener !== null
						? [command.listener.id]
						: [],
				),
			);
			const listener = listeners[occurrence];
			if (listener === undefined) throw new Error(`Missing transported ${type} listener.`);
			return listener;
		},
		sendEvent(
			deliveries: UniversalTransportEventMessage['deliveries'],
			priority: UniversalTransportEventMessage['priority'] = 'discrete',
			overrides: Partial<UniversalTransportIdentity> = {},
		): Promise<EventOutcome> {
			const identity = { ...this.acceptedIdentity(), ...overrides };
			return new Promise((resolve) => {
				eventWaiters.push(resolve);
				hostPort.postMessage({ ...identity, type: 'event', priority, deliveries });
			});
		},
		injectInbound(message: unknown) {
			hostPort.postMessage(message);
		},
		close() {
			clientPort.close();
			hostPort.close();
		},
	};
	openTransports.push(api);
	return api;
}

function transportRoot(withCodec = true) {
	const container: TransportContainer = {
		renderer: RENDERER,
		host: createObjectContainer(RENDERER),
		publicInstances: new Map(),
	};
	const loopback = createLoopback(container);
	const root = createUniversalRoot(container, createTransportDriver(withCodec), {
		transport: loopback.transport,
	});
	loopback.bindRoot(root);
	return { container, loopback, root };
}

function containsFunction(value: unknown, seen = new Set<object>()): boolean {
	if (typeof value === 'function') return true;
	if (value === null || typeof value !== 'object' || seen.has(value)) return false;
	seen.add(value);
	for (const child of Object.values(value)) {
		if (containsFunction(child, seen)) return true;
	}
	return false;
}

describe('universal asynchronous transport', () => {
	it('crosses only cloned values, handles, and listener IDs, then exposes refs and layout after ack', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const log: string[] = [];
		let current: PublicHandle | null = null;
		const Scene = defineUniversalComponent(
			RENDERER,
			(props: { config: { nested: { value: number } }; resource: { id: string } }) => {
				useLayoutEffect(
					() => {
						log.push(`layout:${current?.layout.acceptedVersion}`);
					},
					[],
					'layout',
				);
				return universalValue(plan, [
					universalProps([
						['set', 'config', props.config],
						['set', 'resource', props.resource],
						['set', 'onFire', () => log.push('event')],
						[
							'set',
							'onUpdate',
							(value: PublicHandle) => log.push(`lifecycle:${value.layout.acceptedVersion}`),
						],
						[
							'set',
							'ref',
							(value: PublicHandle | null) => {
								current = value;
								log.push(value === null ? 'ref:null' : `ref:${value.layout.acceptedVersion}`);
							},
						],
					]),
				]);
			},
		);
		const config = { nested: { value: 1 } };
		const held = loopback.holdNext();
		const rendered = root.renderAsync(Scene, { config, resource: { id: 'texture-1' } });
		config.nested.value = 99;
		await held;

		expect(container.host.children).toEqual([]);
		expect(current).toBe(null);
		expect(log).toEqual([]);
		loopback.release();
		await rendered;

		const host = container.host.children[0];
		expect(host.props.config).toEqual({ nested: { value: 1 } });
		expect(host.props.config).not.toBe(config);
		expect(host.props.resource).toMatchObject({
			$$kind: 'octane.universal.resource',
			renderer: RENDERER,
			id: 'texture-1',
		});
		expect(log).toEqual(['lifecycle:1', 'ref:1', 'layout:1']);
		expect(current).toBe(container.publicInstances.get(host.id));

		const wireBatch = loopback.receivedBatches[0];
		expect(containsFunction(wireBatch)).toBe(false);
		expect(() => structuredClone(wireBatch)).not.toThrow();
		const create = wireBatch.commands.find((command) => command.op === 'create');
		const event = wireBatch.commands.find((command) => command.op === 'event');
		const lifecycle = wireBatch.commands.find((command) => command.op === 'lifecycle');
		expect(create?.op === 'create' && create.props).not.toHaveProperty('onFire');
		expect(create?.op === 'create' && create.props).not.toHaveProperty('onUpdate');
		expect(event?.op === 'event' && event.listener?.id).toEqual(expect.any(Number));
		expect(lifecycle?.op === 'lifecycle' && lifecycle.listener?.id).toEqual(expect.any(Number));
		await root.unmountAsync();
	});

	it('runs async afterAccept after listener publication and completes accepted callback faults', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const log: string[] = [];
		let current: PublicHandle | null = null;
		const ref = (value: PublicHandle | null) => {
			current = value;
			log.push(value === null ? 'ref:null' : `ref:${value.props.value}`);
		};
		const Scene = defineUniversalComponent(RENDERER, (props: { value: number }) => {
			useLayoutEffect(
				() => {
					log.push(`layout:${props.value}`);
					return () => log.push(`cleanup:${props.value}`);
				},
				[props.value],
				'layout',
			);
			return universalValue(plan, [
				universalProps([
					['set', 'value', props.value],
					['set', 'onFire', () => log.push(`event:${props.value}`)],
					[
						'set',
						'onUpdate',
						() => {
							log.push(`lifecycle:${props.value}`);
						},
					],
					['set', 'ref', ref],
				]),
			]);
		});

		loopback.afterAcceptNext((batch) => {
			log.push(`after:${current === null}`);
			const event = batch.commands.find((command) => command.op === 'event');
			if (event?.op !== 'event' || event.listener === null) {
				throw new Error('Missing accepted event listener.');
			}
			root.dispatchEvent(event.listener.id, undefined);
		});
		await root.renderAsync(Scene, { value: 1 });
		expect(log).toEqual(['after:true', 'event:1', 'lifecycle:1', 'ref:1', 'layout:1']);

		log.length = 0;
		loopback.afterAcceptNext(() => {
			log.push(`after:update:${current?.props.value}`);
			throw new Error('local afterAccept update fault');
		});
		await expect(root.renderAsync(Scene, { value: 2 })).rejects.toThrow(
			'local afterAccept update fault',
		);
		expect(container.host.children[0].props.value).toBe(2);
		expect(log).toEqual(['after:update:2', 'cleanup:1', 'lifecycle:2', 'layout:2']);

		log.length = 0;
		loopback.afterAcceptNext(() => {
			log.push(`after:teardown:${current !== null}`);
			throw new Error('local afterAccept teardown fault');
		});
		await expect(root.unmountAsync()).rejects.toThrow('local afterAccept teardown fault');
		expect(container.host.children).toEqual([]);
		expect(current).toBe(null);
		expect(log).toEqual(['after:teardown:true', 'cleanup:2', 'ref:null']);
	});

	it('retries an accepted event update after a direct render awaiting acknowledgement', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const Scene = defineUniversalComponent(RENDERER, (props: { label: string }) => {
			const [count, setCount] = useState(0, 'count');
			return universalValue(plan, [
				universalProps([
					['set', 'label', props.label],
					['set', 'count', count],
					['set', 'onFire', () => setCount((value) => value + 1)],
				]),
			]);
		});

		await root.renderAsync(Scene, { label: 'initial' });
		const listener = loopback.listener('fire');
		const held = loopback.holdNext();
		const direct = root.renderAsync(Scene, { label: 'direct' });
		await held;
		const event = await loopback.sendEvent([{ listener, payload: undefined }]);
		expect(event.error).toBeUndefined();
		loopback.release();
		await direct;
		await root.flushTransport();

		expect(container.host.children[0].props).toMatchObject({ label: 'direct', count: 1 });
		expect(loopback.receivedBatches).toHaveLength(3);
		await root.unmountAsync();
	});

	it('keeps an already-enqueued event render across a synchronously started teardown', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const Scene = defineUniversalComponent(RENDERER, () => {
			const [count, setCount] = useState(0, 'count');
			return universalValue(plan, [
				universalProps([
					['set', 'count', count],
					['set', 'onFire', () => setCount((value) => value + 1)],
				]),
			]);
		});

		await root.renderAsync(Scene, undefined);
		const identity = loopback.acceptedIdentity();
		const listener = loopback.listener('fire');
		expect(
			root.dispatchTransportEvent({
				...identity,
				type: 'event',
				priority: 'discrete',
				deliveries: [{ listener, payload: undefined }],
			}),
		).toEqual([undefined]);

		const held = loopback.holdNext();
		loopback.rejectNext('remote synchronous teardown rollback');
		const teardown = root.unmountAsync();
		await held;
		loopback.release();
		await expect(teardown).rejects.toThrow('remote synchronous teardown rollback');
		await root.flushTransport();

		expect(container.host.children[0].props.count).toBe(1);
		await root.unmountAsync();
	});

	it('resumes an event update queued during a rejected teardown', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const Scene = defineUniversalComponent(RENDERER, () => {
			const [count, setCount] = useState(0, 'count');
			return universalValue(plan, [
				universalProps([
					['set', 'count', count],
					['set', 'onFire', () => setCount((value) => value + 1)],
				]),
			]);
		});

		await root.renderAsync(Scene, undefined);
		const listener = loopback.listener('fire');
		const held = loopback.holdNext();
		loopback.rejectNext('remote teardown rollback');
		const teardown = root.unmountAsync();
		await held;
		const event = await loopback.sendEvent([{ listener, payload: undefined }]);
		expect(event.error).toBeUndefined();
		let flushSettled = false;
		const flushing = root.flushTransport().then(() => {
			flushSettled = true;
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(flushSettled).toBe(false);
		loopback.release();
		await expect(teardown).rejects.toThrow('remote teardown rollback');
		await flushing;
		expect(flushSettled).toBe(true);

		expect(container.host.children[0].props.count).toBe(1);
		expect(loopback.receivedBatches).toHaveLength(3);
		await root.unmountAsync();
	});

	it('resumes suspended replay state after a rejected teardown', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		let pending: Promise<string> | null = null;
		let resolve!: (value: string) => void;
		const Scene = defineUniversalComponent(RENDERER, () =>
			universalValue(plan, [
				universalProps([['set', 'value', pending === null ? 'ready' : use(pending)]]),
			]),
		);

		await root.renderAsync(Scene, undefined);
		pending = new Promise<string>((done) => {
			resolve = done;
		});
		const suspended = await root.renderAsync(Scene, undefined);
		expect(suspended.status).toBe('suspended');

		const held = loopback.holdNext();
		loopback.rejectNext('remote teardown preserved replay');
		const teardown = root.unmountAsync();
		await held;
		resolve('loaded');
		await Promise.resolve();
		await Promise.resolve();
		loopback.release();
		await expect(teardown).rejects.toThrow('remote teardown preserved replay');
		await root.flushTransport();

		expect(container.host.children[0].props.value).toBe('loaded');
		await root.unmountAsync();
	});

	it('reveals settled suspended content after a same-turn teardown rolls back', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		let pending: Promise<string> | null = null;
		let resolve!: (value: string) => void;
		const Scene = defineUniversalComponent(RENDERER, () =>
			universalValue(plan, [
				universalProps([['set', 'value', pending === null ? 'ready' : use(pending)]]),
			]),
		);

		await root.renderAsync(Scene, undefined);
		const loading = new Promise<string>((done) => {
			resolve = done;
		});
		pending = loading;
		const suspended = await root.renderAsync(Scene, undefined);
		expect(suspended.status).toBe('suspended');

		const held = loopback.holdNext();
		loopback.rejectNext('remote same-turn teardown preserved replay');
		// A downstream continuation may begin navigation teardown in the same turn
		// that Suspense data settles. Rolling that teardown back must retain the data.
		const teardown = loading.then(() => undefined).then(() => root.unmountAsync());
		resolve('loaded');
		await held;
		loopback.release();
		await expect(teardown).rejects.toThrow('remote same-turn teardown preserved replay');
		await root.flushTransport();

		expect(container.host.children[0].props.value).toBe('loaded');
		await root.unmountAsync();
	});

	it('returns the in-flight teardown promise after acknowledgement until completion', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node' });
		const Scene = defineUniversalComponent(RENDERER, () => universalValue(plan));
		await root.renderAsync(Scene, undefined);

		loopback.faultNext('late teardown completion fault');
		const acknowledged = loopback.holdCompletion();
		const first = root.unmountAsync();
		await acknowledged;
		expect(container.host.children).toEqual([]);
		const second = root.unmountAsync();
		expect(second).toBe(first);

		loopback.releaseCompletion();
		await expect(first).rejects.toThrow('late teardown completion fault');
		await expect(second).rejects.toThrow('late teardown completion fault');
	});

	it('enforces serializable props even without a renderer codec', async () => {
		const { loopback, root } = transportRoot(false);
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const Scene = defineUniversalComponent(RENDERER, (props: { callback: unknown }) =>
			universalValue(plan, [universalProps([['set', 'callback', props.callback]])]),
		);

		await expect(root.renderAsync(Scene, { callback: () => {} })).rejects.toThrow(
			/Unsupported serializable host value/,
		);
		expect(loopback.sentBatches).toEqual([]);
		await root.unmountAsync();
	});

	it('rejects the local host callback capability on async transports', () => {
		const container: TransportContainer = {
			renderer: RENDERER,
			host: createObjectContainer(RENDERER),
			publicInstances: new Map(),
		};
		const loopback = createLoopback(container);
		const driver = createTransportDriver();
		expect(() =>
			createUniversalRoot(
				container,
				{
					...driver,
					capabilities: { ...driver.capabilities, localHostCallbacks: true },
				},
				{ transport: loopback.transport },
			),
		).toThrow('Universal async transports do not support the local host callback capability.');
	});

	it('keeps the accepted tree on pre-ack rejection and publishes post-ack faults', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const log: string[] = [];
		let current: PublicHandle | null = null;
		const ref = (value: PublicHandle | null) => {
			current = value;
		};
		const Scene = defineUniversalComponent(RENDERER, (props: { value: number }) => {
			useLayoutEffect(
				() => {
					log.push(`layout:${props.value}`);
				},
				[props.value],
				'layout',
			);
			return universalValue(plan, [
				universalProps([
					['set', 'value', props.value],
					['set', 'onFire', () => log.push(`event:${props.value}`)],
					['set', 'onUpdate', () => log.push(`lifecycle:${props.value}`)],
					['set', 'ref', ref],
				]),
			]);
		});

		await root.renderAsync(Scene, { value: 1 });
		const accepted = current;
		log.length = 0;
		loopback.rejectNext('remote validation rejected value 2');
		await expect(root.renderAsync(Scene, { value: 2 })).rejects.toThrow(
			'remote validation rejected value 2',
		);
		expect(container.host.children[0].props.value).toBe(1);
		expect(current).toBe(accepted);
		expect(log).toEqual([]);
		const oldEvent = await loopback.sendEvent([
			{ listener: loopback.listener('fire'), payload: 'old' },
		]);
		expect(oldEvent.error).toBeUndefined();
		expect(log).toEqual(['event:1']);

		log.length = 0;
		loopback.faultNext('remote fault after acknowledgement');
		await expect(root.renderAsync(Scene, { value: 2 })).rejects.toThrow(
			'remote fault after acknowledgement',
		);
		expect(container.host.children[0].props.value).toBe(2);
		expect(current).toBe(accepted);
		expect((current as PublicHandle | null)?.props.value).toBe(2);
		expect(log).toEqual(['lifecycle:2', 'layout:2']);

		const currentEvent = await loopback.sendEvent([
			{ listener: loopback.listener('fire', 2), payload: 'new' },
		]);
		expect(currentEvent.error).toBeUndefined();
		expect(log.at(-1)).toBe('event:2');
		await root.renderAsync(Scene, { value: 3 });
		expect(container.host.children[0].props.value).toBe(3);
		await root.unmountAsync();
	});

	it('rolls back rejected teardown and keeps listeners and refs live until acknowledgement', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const log: string[] = [];
		let current: PublicHandle | null = null;
		const Scene = defineUniversalComponent(RENDERER, () => {
			useLayoutEffect(() => () => log.push('layout:cleanup'), [], 'layout');
			return universalValue(plan, [
				universalProps([
					['set', 'onFire', () => log.push('event')],
					[
						'set',
						'ref',
						(value: PublicHandle | null) => {
							current = value;
							if (value === null) log.push('ref:null');
						},
					],
				]),
			]);
		});
		await root.renderAsync(Scene, undefined);
		const identity = loopback.acceptedIdentity();
		const listener = loopback.listener('fire');

		loopback.rejectNext('remote teardown rejected before acknowledgement');
		await expect(root.unmountAsync()).rejects.toThrow(
			'remote teardown rejected before acknowledgement',
		);
		expect(container.host.children).toHaveLength(1);
		expect(current).not.toBe(null);
		expect(log).toEqual([]);
		const eventAfterRejection = await loopback.sendEvent([{ listener, payload: undefined }]);
		expect(eventAfterRejection.error).toBeUndefined();
		expect(eventAfterRejection.results).toEqual([1]);
		expect(log).toEqual(['event']);
		log.length = 0;

		const held = loopback.holdNext();
		loopback.faultNext('remote teardown fault after acknowledgement');
		const unmounted = root.unmountAsync();
		await held;
		expect(container.host.children).toHaveLength(1);
		expect(current).not.toBe(null);
		expect(
			root.dispatchTransportEvent({
				...identity,
				type: 'event',
				priority: 'discrete',
				deliveries: [{ listener, payload: undefined }],
			}),
		).toEqual([1]);
		expect(log).toEqual(['event']);

		loopback.release();
		await expect(unmounted).rejects.toThrow('remote teardown fault after acknowledgement');
		expect(container.host.children).toEqual([]);
		expect(current).toBe(null);
		expect(log).toEqual(['event', 'layout:cleanup', 'ref:null']);
		expect(() =>
			root.dispatchTransportEvent({
				...identity,
				type: 'event',
				priority: 'discrete',
				deliveries: [{ listener, payload: undefined }],
			}),
		).toThrow(/unmounted universal root/);
	});

	it('rejects a late teardown acknowledgement after transport rejection', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const Scene = defineUniversalComponent(RENDERER, (props: { value: string }) =>
			universalValue(plan, [universalProps([['set', 'value', props.value]])]),
		);

		await root.renderAsync(Scene, { value: 'accepted' });
		loopback.captureNextAcknowledgement();
		loopback.rejectNext('remote rejected teardown before acknowledgement');
		await expect(root.unmountAsync()).rejects.toThrow(
			'remote rejected teardown before acknowledgement',
		);

		expect(() => loopback.invokeCapturedAcknowledgement()).toThrow(/stale or duplicate/);
		await root.renderAsync(Scene, { value: 'still live' });
		expect(container.host.children[0].props.value).toBe('still live');
		await root.unmountAsync();
	});

	it('rejects a late teardown acknowledgement after completion without acknowledgement', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const Scene = defineUniversalComponent(RENDERER, (props: { value: string }) =>
			universalValue(plan, [universalProps([['set', 'value', props.value]])]),
		);

		await root.renderAsync(Scene, { value: 'accepted' });
		loopback.captureNextAcknowledgement();
		loopback.completeNextWithoutAcknowledgement();
		await expect(root.unmountAsync()).rejects.toThrow(
			/completed teardown batch.*without acknowledgement/,
		);

		expect(() => loopback.invokeCapturedAcknowledgement()).toThrow(/stale or duplicate/);
		await root.renderAsync(Scene, { value: 'still live' });
		expect(container.host.children[0].props.value).toBe('still live');
		await root.unmountAsync();
	});

	it('delivers one native message in one scope and emits one follow-up batch', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, {
			kind: 'host',
			type: 'scene',
			bindings: [['count', 2]],
			children: [
				{ kind: 'host', type: 'target', propsSlot: 0 },
				{ kind: 'host', type: 'ancestor', propsSlot: 1 },
			],
		});
		const log: string[] = [];
		const Scene = defineUniversalComponent(RENDERER, () => {
			const [count, setCount] = useState(0, 'count');
			return universalValue(plan, [
				universalProps([
					[
						'set',
						'onFire',
						() => {
							log.push(`target:${count}`);
							setCount((value) => value + 1);
						},
					],
				]),
				universalProps([['set', 'onFire', () => log.push(`ancestor:${count}`)]]),
				count,
			]);
		});
		await root.renderAsync(Scene, undefined);
		const before = loopback.sentBatches.length;
		const event = await loopback.sendEvent([
			{ listener: loopback.listener('fire', 0), payload: 'target' },
			{ listener: loopback.listener('fire', 1), payload: 'ancestor' },
		]);
		expect(event.error).toBeUndefined();
		expect(log).toEqual(['target:0', 'ancestor:0']);
		await root.flushTransport();
		expect(loopback.sentBatches).toHaveLength(before + 1);
		expect(container.host.children[0].props.count).toBe(1);
		await root.unmountAsync();
	});

	it('validates every transported delivery before invoking the accepted listener table', async () => {
		const { loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const log: string[] = [];
		const Scene = defineUniversalComponent(RENDERER, () =>
			universalValue(plan, [universalProps([['set', 'onFire', () => log.push('event')]])]),
		);
		await root.renderAsync(Scene, undefined);
		const listener = loopback.listener('fire');

		const missing = await loopback.sendEvent([
			{ listener, payload: 'valid' },
			{ listener: Number.MAX_SAFE_INTEGER, payload: 'missing' },
		]);
		expect(missing.error?.message).toMatch(/unknown or inactive universal event listener/i);
		expect(log).toEqual([]);

		const mismatchedPriority = await loopback.sendEvent(
			[{ listener, payload: 'wrong-priority' }],
			'default',
		);
		expect(mismatchedPriority.error?.message).toMatch(/priority/i);
		expect(log).toEqual([]);
		await root.unmountAsync();
	});

	it('continues transported propagation after callback faults and flushes the scope once', async () => {
		const { container, loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, {
			kind: 'host',
			type: 'scene',
			bindings: [['count', 3]],
			children: [
				{ kind: 'host', type: 'first', propsSlot: 0 },
				{ kind: 'host', type: 'second', propsSlot: 1 },
				{ kind: 'host', type: 'third', propsSlot: 2 },
			],
		});
		const firstError = new Error('first propagation callback failed');
		const secondError = new Error('second propagation callback failed');
		const log: string[] = [];
		const Scene = defineUniversalComponent(RENDERER, () => {
			const [count, setCount] = useState(0, 'count');
			const update = (label: string, error?: Error) => {
				log.push(`${label}:${count}`);
				setCount((value) => value + 1);
				if (error !== undefined) throw error;
			};
			return universalValue(plan, [
				universalProps([['set', 'onFire', () => update('first', firstError)]]),
				universalProps([['set', 'onFire', () => update('second', secondError)]]),
				universalProps([['set', 'onFire', () => update('third')]]),
				count,
			]);
		});
		await root.renderAsync(Scene, undefined);
		const before = loopback.sentBatches.length;

		const multiple = await loopback.sendEvent([
			{ listener: loopback.listener('fire', 0), payload: undefined },
			{ listener: loopback.listener('fire', 1), payload: undefined },
			{ listener: loopback.listener('fire', 2), payload: undefined },
		]);
		expect(multiple.error).toBeInstanceOf(AggregateError);
		expect((multiple.error as AggregateError).errors).toEqual([firstError, secondError]);
		expect(log).toEqual(['first:0', 'second:0', 'third:0']);
		await root.flushTransport();
		expect(loopback.sentBatches).toHaveLength(before + 1);
		expect(container.host.children[0].props.count).toBe(3);

		const single = await loopback.sendEvent([
			{ listener: loopback.listener('fire', 0), payload: undefined },
		]);
		expect(single.error).toBe(firstError);
		await root.flushTransport();
		expect(container.host.children[0].props.count).toBe(4);
		await root.unmountAsync();
	});

	it('rejects stale and foreign event messages while allowing batch-version gaps', async () => {
		const { loopback, root } = transportRoot();
		const plan = universalPlan(RENDERER, { kind: 'host', type: 'node', propsSlot: 0 });
		const log: string[] = [];
		const Scene = defineUniversalComponent(RENDERER, (props: { value: number }) =>
			universalValue(plan, [
				universalProps([
					['set', 'value', props.value],
					['set', 'onFire', () => log.push(`event:${props.value}`)],
				]),
			]),
		);
		await root.renderAsync(Scene, { value: 1 });
		const firstIdentity = loopback.acceptedIdentity();
		const firstListener = loopback.listener('fire');

		const abandoned = root.prepare(Scene, { value: 2 });
		expect(abandoned.status).toBe('prepared');
		abandoned.abort();
		await root.renderAsync(Scene, { value: 3 });
		expect(loopback.sentBatches.map((batch) => batch.version)).toEqual([1, 3]);

		const stale = await loopback.sendEvent(
			[{ listener: firstListener, payload: undefined }],
			'discrete',
			{ version: firstIdentity.version },
		);
		expect(stale.error?.message).toMatch(/version 1 does not match batch 3/);
		const foreign = await loopback.sendEvent(
			[{ listener: firstListener, payload: undefined }],
			'discrete',
			{ root: firstIdentity.root + 1 },
		);
		expect(foreign.error?.message).toMatch(/stale or foreign root/);
		const protocol = await loopback.sendEvent(
			[{ listener: firstListener, payload: undefined }],
			'discrete',
			{ protocol: 999 as typeof UNIVERSAL_TRANSPORT_PROTOCOL_VERSION },
		);
		expect(protocol.error?.message).toMatch(/uses protocol 999/);
		expect(log).toEqual([]);
		await root.unmountAsync();
	});
});
