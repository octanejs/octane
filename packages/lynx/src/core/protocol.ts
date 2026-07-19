import type {
	UNIVERSAL_TRANSPORT_PROTOCOL_VERSION,
	UniversalHostBatch,
	UniversalHostCommand,
	UniversalSerializableValue,
	UniversalTransportAbortMessage,
	UniversalTransportAcknowledgement,
	UniversalTransportCommitMessage,
	UniversalTransportCompleteMessage,
	UniversalTransportError,
	UniversalTransportEventMessage,
	UniversalTransportFaultMessage,
	UniversalTransportIdentity,
	UniversalTransportRejectMessage,
} from 'octane/universal/native';

/**
 * Kept as a local literal so the main-thread protocol graph does not evaluate
 * Octane's background universal runtime. The type pins it to the core ABI.
 */
export const LYNX_TRANSPORT_PROTOCOL_VERSION: typeof UNIVERSAL_TRANSPORT_PROTOCOL_VERSION = 1;

export const LYNX_TRANSPORT_RENDERER = 'lynx' as const;

/** Named ContextProxy events; this protocol never falls back to `postMessage`. */
export const LYNX_BACKGROUND_TO_MAIN_EVENT = 'octane-lynx:background-to-main';
export const LYNX_MAIN_TO_BACKGROUND_EVENT = 'octane-lynx:main-to-background';

/** Unsolicited readiness announcement used when main installs after background. */
export const LYNX_READY_ANNOUNCEMENT_REQUEST = 0;

export interface LynxContextProxyEvent<T = unknown> {
	readonly type: string;
	readonly data: T;
}

export interface LynxContextProxy {
	dispatchEvent(event: LynxContextProxyEvent): unknown;
	addEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void;
	removeEventListener(type: string, listener: (event: LynxContextProxyEvent) => void): void;
}

export interface LynxMainReadyRequest {
	readonly protocol: typeof LYNX_TRANSPORT_PROTOCOL_VERSION;
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	readonly type: 'main-ready-request';
	readonly request: number;
}

export interface LynxMainReadyReply {
	readonly protocol: typeof LYNX_TRANSPORT_PROTOCOL_VERSION;
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	readonly type: 'main-ready';
	readonly request: number;
}

export interface LynxPublicHandleUpsert {
	readonly op: 'upsert';
	readonly id: number;
	readonly type: string;
	readonly generation: number;
	readonly snapshot: UniversalSerializableValue;
}

export interface LynxPublicHandleRemoval {
	readonly op: 'remove';
	readonly id: number;
	readonly generation: number;
}

export type LynxPublicHandleDelta = LynxPublicHandleUpsert | LynxPublicHandleRemoval;

export interface LynxTransportAcknowledgement extends UniversalTransportAcknowledgement {
	readonly handles: readonly LynxPublicHandleDelta[];
}

export interface LynxDisposeMessage extends UniversalTransportIdentity {
	readonly type: 'dispose';
}

/** Best-effort cleanup when background cannot know whether a commit was accepted. */
export interface LynxTerminalDisposeMessage extends UniversalTransportIdentity {
	readonly type: 'terminal-dispose';
}

export interface LynxDisposeAcknowledgement extends UniversalTransportIdentity {
	readonly type: 'dispose-ack';
}

export interface LynxDisposeRetryMessage extends UniversalTransportIdentity {
	readonly type: 'dispose-retry';
	readonly error: UniversalTransportError;
}

export type LynxBackgroundOutboundMessage =
	| LynxMainReadyRequest
	| UniversalTransportCommitMessage
	| UniversalTransportAbortMessage
	| LynxDisposeMessage
	| LynxTerminalDisposeMessage;

export type LynxBackgroundInboundMessage =
	| LynxMainReadyReply
	| LynxTransportAcknowledgement
	| UniversalTransportCompleteMessage
	| UniversalTransportRejectMessage
	| UniversalTransportFaultMessage
	| UniversalTransportEventMessage
	| LynxDisposeAcknowledgement
	| LynxDisposeRetryMessage;

function fail(label: string, message: string): never {
	throw new TypeError(`Octane Lynx transport ${label}: ${message}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return fail(label, 'must be an object.');
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		return fail(label, 'must be a plain object.');
	}
	return value as Record<string, unknown>;
}

function exactKeys(
	value: Record<string, unknown>,
	expected: readonly string[],
	label: string,
): void {
	for (const key of Object.keys(value)) {
		if (!expected.includes(key)) fail(label, `contains unknown field ${JSON.stringify(key)}.`);
	}
	for (const key of expected) {
		if (!Object.prototype.hasOwnProperty.call(value, key)) {
			fail(label, `is missing field ${JSON.stringify(key)}.`);
		}
	}
	if (Object.getOwnPropertySymbols(value).length !== 0) {
		fail(label, 'contains symbol fields.');
	}
}

function nonEmptyString(value: unknown, label: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) fail(label, 'must be a non-empty string.');
}

function positiveInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		fail(label, 'must be a positive safe integer.');
	}
}

function nonNegativeInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		fail(label, 'must be a non-negative safe integer.');
	}
}

function nullableHostId(value: unknown, label: string): asserts value is number | null {
	if (value !== null) positiveInteger(value, label);
}

function assertWireValue(value: unknown, label: string, seen = new Set<object>()): void {
	if (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		typeof value === 'boolean'
	) {
		return;
	}
	if (typeof value !== 'object') fail(label, 'contains a non-serializable value.');
	if (Object.getOwnPropertySymbols(value).length !== 0) {
		fail(label, 'contains symbol fields.');
	}
	if (seen.has(value)) fail(label, 'contains a cycle.');
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			for (let index = 0; index < value.length; index++) {
				assertWireValue(value[index], `${label}[${index}]`, seen);
			}
			return;
		}
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			fail(label, 'requires arrays or plain objects.');
		}
		for (const [name, child] of Object.entries(value)) {
			assertWireValue(child, `${label}.${name}`, seen);
		}
	} finally {
		seen.delete(value);
	}
}

function assertIdentity(
	message: Record<string, unknown>,
	label: string,
): asserts message is Record<string, unknown> & UniversalTransportIdentity {
	if (message.protocol !== LYNX_TRANSPORT_PROTOCOL_VERSION) {
		fail(label, `protocol must be ${LYNX_TRANSPORT_PROTOCOL_VERSION}.`);
	}
	if (message.renderer !== LYNX_TRANSPORT_RENDERER) {
		fail(label, `renderer must be ${JSON.stringify(LYNX_TRANSPORT_RENDERER)}.`);
	}
	positiveInteger(message.root, `${label}.root`);
	positiveInteger(message.version, `${label}.version`);
}

function assertEventListener(value: unknown, label: string): void {
	if (value === null) return;
	const listener = record(value, label);
	exactKeys(listener, ['id', 'priority'], label);
	positiveInteger(listener.id, `${label}.id`);
	if (
		listener.priority !== 'discrete' &&
		listener.priority !== 'continuous' &&
		listener.priority !== 'default'
	) {
		fail(`${label}.priority`, 'must be discrete, continuous, or default.');
	}
}

function assertProps(value: unknown, label: string): void {
	const props = record(value, label);
	if (Object.getOwnPropertySymbols(props).length !== 0) fail(label, 'contains symbol fields.');
	for (const [name, prop] of Object.entries(props)) {
		assertWireValue(prop, `${label}.${name}`);
	}
}

function assertCommand(value: unknown, index: number): asserts value is UniversalHostCommand {
	const label = `commit.batch.commands[${index}]`;
	const command = record(value, label);
	if (typeof command.op !== 'string') fail(`${label}.op`, 'must be a string.');
	switch (command.op) {
		case 'create':
			exactKeys(command, ['op', 'id', 'type', 'props'], label);
			positiveInteger(command.id, `${label}.id`);
			nonEmptyString(command.type, `${label}.type`);
			assertProps(command.props, `${label}.props`);
			return;
		case 'update':
			exactKeys(command, ['op', 'id', 'props'], label);
			positiveInteger(command.id, `${label}.id`);
			assertProps(command.props, `${label}.props`);
			return;
		case 'recreate':
			exactKeys(command, ['op', 'id', 'type', 'props'], label);
			positiveInteger(command.id, `${label}.id`);
			nonEmptyString(command.type, `${label}.type`);
			assertProps(command.props, `${label}.props`);
			return;
		case 'insert':
		case 'move':
			exactKeys(command, ['op', 'parent', 'id', 'before'], label);
			nullableHostId(command.parent, `${label}.parent`);
			positiveInteger(command.id, `${label}.id`);
			nullableHostId(command.before, `${label}.before`);
			return;
		case 'event':
			exactKeys(command, ['op', 'id', 'type', 'listener'], label);
			positiveInteger(command.id, `${label}.id`);
			nonEmptyString(command.type, `${label}.type`);
			assertEventListener(command.listener, `${label}.listener`);
			return;
		case 'lifecycle':
		case 'local-callback':
			fail(`${label}.op`, `${command.op} is not supported by the Lynx async host.`);
		case 'visibility':
			exactKeys(command, ['op', 'id', 'state'], label);
			positiveInteger(command.id, `${label}.id`);
			if (command.state !== 'hidden' && command.state !== 'visible') {
				fail(`${label}.state`, 'must be hidden or visible.');
			}
			return;
		case 'remove':
			exactKeys(command, ['op', 'parent', 'id'], label);
			nullableHostId(command.parent, `${label}.parent`);
			positiveInteger(command.id, `${label}.id`);
			return;
		case 'destroy':
			exactKeys(command, ['op', 'id'], label);
			positiveInteger(command.id, `${label}.id`);
			return;
		default:
			fail(`${label}.op`, `uses unsupported operation ${JSON.stringify(command.op)}.`);
	}
}

function assertBatch(
	value: unknown,
	identity: UniversalTransportIdentity,
): asserts value is UniversalHostBatch {
	const batch = record(value, 'commit.batch');
	exactKeys(batch, ['renderer', 'version', 'commands'], 'commit.batch');
	if (batch.renderer !== identity.renderer)
		fail('commit.batch.renderer', 'does not match envelope.');
	if (batch.version !== identity.version) fail('commit.batch.version', 'does not match envelope.');
	if (!Array.isArray(batch.commands)) fail('commit.batch.commands', 'must be an array.');
	for (let index = 0; index < batch.commands.length; index++) {
		assertCommand(batch.commands[index], index);
	}
}

function assertRemoteError(
	value: unknown,
	label: string,
): asserts value is UniversalTransportError {
	const error = record(value, label);
	exactKeys(error, ['name', 'message'], label);
	nonEmptyString(error.name, `${label}.name`);
	if (typeof error.message !== 'string') fail(`${label}.message`, 'must be a string.');
}

function assertSnapshotIdentity(
	snapshot: unknown,
	delta: Record<string, unknown>,
	identity: UniversalTransportIdentity,
	label: string,
): void {
	const value = record(snapshot, `${label}.snapshot`);
	const expected: Readonly<Record<string, unknown>> = {
		$$kind: 'octane.lynx.element',
		renderer: LYNX_TRANSPORT_RENDERER,
		root: identity.root,
		id: delta.id,
		type: delta.type,
		generation: delta.generation,
	};
	for (const [name, expectedValue] of Object.entries(expected)) {
		if (value[name] !== expectedValue) {
			fail(`${label}.snapshot.${name}`, 'does not match the handle envelope.');
		}
	}
}

function assertHandleDelta(
	value: unknown,
	index: number,
	identity: UniversalTransportIdentity,
): asserts value is LynxPublicHandleDelta {
	const label = `ack.handles[${index}]`;
	const delta = record(value, label);
	if (delta.op === 'upsert') {
		exactKeys(delta, ['op', 'id', 'type', 'generation', 'snapshot'], label);
		positiveInteger(delta.id, `${label}.id`);
		nonEmptyString(delta.type, `${label}.type`);
		positiveInteger(delta.generation, `${label}.generation`);
		assertWireValue(delta.snapshot, `${label}.snapshot`);
		assertSnapshotIdentity(delta.snapshot, delta, identity, label);
		return;
	}
	if (delta.op === 'remove') {
		exactKeys(delta, ['op', 'id', 'generation'], label);
		positiveInteger(delta.id, `${label}.id`);
		positiveInteger(delta.generation, `${label}.generation`);
		return;
	}
	fail(`${label}.op`, `uses unsupported operation ${JSON.stringify(delta.op)}.`);
}

function assertReady(value: unknown, reply: boolean): LynxMainReadyRequest | LynxMainReadyReply {
	const label = reply ? 'main-ready reply' : 'main-ready request';
	const message = record(value, label);
	exactKeys(message, ['protocol', 'renderer', 'type', 'request'], label);
	if (message.protocol !== LYNX_TRANSPORT_PROTOCOL_VERSION) {
		fail(label, `protocol must be ${LYNX_TRANSPORT_PROTOCOL_VERSION}.`);
	}
	if (message.renderer !== LYNX_TRANSPORT_RENDERER) {
		fail(label, `renderer must be ${JSON.stringify(LYNX_TRANSPORT_RENDERER)}.`);
	}
	if (message.type !== (reply ? 'main-ready' : 'main-ready-request')) {
		fail(
			`${label}.type`,
			`must be ${JSON.stringify(reply ? 'main-ready' : 'main-ready-request')}.`,
		);
	}
	if (reply) nonNegativeInteger(message.request, `${label}.request`);
	else positiveInteger(message.request, `${label}.request`);
	return message as unknown as LynxMainReadyRequest | LynxMainReadyReply;
}

export function validateLynxBackgroundOutboundMessage(
	value: unknown,
): LynxBackgroundOutboundMessage {
	const message = record(value, 'outbound message');
	if (message.type === 'main-ready-request')
		return assertReady(message, false) as LynxMainReadyRequest;
	assertIdentity(message, 'outbound message');
	if (message.type === 'commit') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type', 'batch'], 'commit');
		assertBatch(message.batch, message);
		return message as unknown as UniversalTransportCommitMessage;
	}
	if (message.type === 'abort') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type'], 'abort');
		return message as unknown as UniversalTransportAbortMessage;
	}
	if (message.type === 'dispose') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type'], 'dispose');
		return message as unknown as LynxDisposeMessage;
	}
	if (message.type === 'terminal-dispose') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type'], 'terminal-dispose');
		return message as unknown as LynxTerminalDisposeMessage;
	}
	return fail('outbound message', `uses unsupported type ${JSON.stringify(message.type)}.`);
}

export function validateLynxBackgroundInboundMessage(value: unknown): LynxBackgroundInboundMessage {
	const message = record(value, 'inbound message');
	if (message.type === 'main-ready') return assertReady(message, true) as LynxMainReadyReply;
	assertIdentity(message, 'inbound message');
	if (message.type === 'ack') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type', 'handles'], 'ack');
		if (!Array.isArray(message.handles)) fail('ack.handles', 'must be an array.');
		for (let index = 0; index < message.handles.length; index++) {
			assertHandleDelta(message.handles[index], index, message);
		}
		return message as unknown as LynxTransportAcknowledgement;
	}
	if (message.type === 'complete') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type'], 'complete');
		return message as unknown as UniversalTransportCompleteMessage;
	}
	if (message.type === 'reject' || message.type === 'fault') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type', 'error'], message.type);
		assertRemoteError(message.error, `${message.type}.error`);
		return message as unknown as UniversalTransportRejectMessage | UniversalTransportFaultMessage;
	}
	if (message.type === 'event') {
		exactKeys(
			message,
			['protocol', 'renderer', 'root', 'version', 'type', 'priority', 'deliveries'],
			'event',
		);
		if (
			message.priority !== 'discrete' &&
			message.priority !== 'continuous' &&
			message.priority !== 'default'
		) {
			fail('event.priority', 'must be discrete, continuous, or default.');
		}
		if (!Array.isArray(message.deliveries)) fail('event.deliveries', 'must be an array.');
		for (let index = 0; index < message.deliveries.length; index++) {
			const delivery = record(message.deliveries[index], `event.deliveries[${index}]`);
			exactKeys(delivery, ['listener', 'payload'], `event.deliveries[${index}]`);
			positiveInteger(delivery.listener, `event.deliveries[${index}].listener`);
			assertWireValue(delivery.payload, `event.deliveries[${index}].payload`);
		}
		return message as unknown as UniversalTransportEventMessage;
	}
	if (message.type === 'dispose-ack') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type'], 'dispose-ack');
		return message as unknown as LynxDisposeAcknowledgement;
	}
	if (message.type === 'dispose-retry') {
		exactKeys(
			message,
			['protocol', 'renderer', 'root', 'version', 'type', 'error'],
			'dispose-retry',
		);
		assertRemoteError(message.error, 'dispose-retry.error');
		return message as unknown as LynxDisposeRetryMessage;
	}
	return fail('inbound message', `uses unsupported type ${JSON.stringify(message.type)}.`);
}

export function sameLynxTransportIdentity(
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
