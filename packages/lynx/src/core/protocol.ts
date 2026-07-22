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
import type { LynxFirstTreeSnapshot } from './first-screen.js';
import { decodeLynxPortalTargetId } from './portal.js';

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
	readonly firstTree?: LynxFirstTreeSnapshot;
}

/** Root-independent native page lifetime teardown broadcast to the background runtime. */
export interface LynxPageDestroyMessage {
	readonly protocol: typeof LYNX_TRANSPORT_PROTOCOL_VERSION;
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	readonly type: 'page-destroy';
}

export interface LynxPublicHandleUpsert {
	readonly op: 'upsert';
	readonly id: number;
	readonly type: string;
	readonly generation: number;
	readonly attached: boolean;
	readonly listDescendant: boolean;
	readonly snapshot: UniversalSerializableValue;
}

export interface LynxPublicHandleListAncestry {
	readonly op: 'list-ancestry';
	readonly id: number;
	readonly generation: number;
	readonly listDescendant: boolean;
}

export interface LynxPublicHandleRemoval {
	readonly op: 'remove';
	readonly id: number;
	readonly generation: number;
}

export type LynxPublicHandleDelta =
	LynxPublicHandleUpsert | LynxPublicHandleListAncestry | LynxPublicHandleRemoval;

export interface LynxTransportAcknowledgement extends UniversalTransportAcknowledgement {
	readonly handles: readonly LynxPublicHandleDelta[];
	readonly adoption?: 'adopted' | 'repaired';
}

/** Background listener ownership is live; buffered first-screen events may replay. */
export interface LynxAdoptionReadyMessage extends UniversalTransportIdentity {
	readonly type: 'adoption-ready';
}

export interface LynxHostAttachmentChange {
	readonly id: number;
	readonly generation: number;
	readonly attached: boolean;
}

/** Callback-driven physical list attachment update after the owning commit ACK. */
export interface LynxHostAttachmentMessage extends UniversalTransportIdentity {
	readonly type: 'host-attachment';
	readonly changes: readonly LynxHostAttachmentChange[];
}

/** Unsolicited accepted-root fault from a native callback after commit settlement. */
export interface LynxHostFaultMessage extends UniversalTransportIdentity {
	readonly type: 'host-fault';
	readonly error: UniversalTransportError;
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

/** Clone-safe compiler descriptor for code registered in the main-thread graph. */
export interface LynxMainThreadWorkletWireDescriptor {
	readonly _wkltId: string;
	readonly _c?: Readonly<Record<string, UniversalSerializableValue>>;
}

/** Clone-safe compiler descriptor for code registered in the background graph. */
export interface LynxBackgroundFunctionWireDescriptor {
	readonly _jsFnId: string;
	readonly _execId?: string;
	readonly _c?: Readonly<Record<string, UniversalSerializableValue>>;
}

export interface LynxCallMainMessage extends UniversalTransportIdentity {
	readonly type: 'call-main';
	readonly call: number;
	readonly worklet: LynxMainThreadWorkletWireDescriptor;
	readonly args: readonly UniversalSerializableValue[];
}

/**
 * Bounds the acknowledgement-time call wave. ContextProxy preserves sender
 * order, so main can defer collecting an activation-only ref until every
 * owner retain/release published by the same commit has arrived.
 */
export interface LynxMainCallPublicationMessage extends UniversalTransportIdentity {
	readonly type: 'main-call-publication';
	readonly phase: 'open' | 'close';
}

export interface LynxCancelMainCallMessage extends UniversalTransportIdentity {
	readonly type: 'cancel-main';
	readonly call: number;
}

export interface LynxCallBackgroundMessage extends UniversalTransportIdentity {
	readonly type: 'call-background';
	readonly call: number;
	readonly fn: LynxBackgroundFunctionWireDescriptor;
	readonly args: readonly UniversalSerializableValue[];
}

export interface LynxCancelBackgroundCallMessage extends UniversalTransportIdentity {
	readonly type: 'cancel-background';
	readonly call: number;
}

export interface LynxCallMainResultMessage extends UniversalTransportIdentity {
	readonly type: 'call-main-result';
	readonly call: number;
	readonly value: UniversalSerializableValue;
}

export interface LynxCallMainErrorMessage extends UniversalTransportIdentity {
	readonly type: 'call-main-error';
	readonly call: number;
	readonly error: UniversalTransportError;
}

export interface LynxCallBackgroundResultMessage extends UniversalTransportIdentity {
	readonly type: 'call-background-result';
	readonly call: number;
	readonly value: UniversalSerializableValue;
}

export interface LynxCallBackgroundErrorMessage extends UniversalTransportIdentity {
	readonly type: 'call-background-error';
	readonly call: number;
	readonly error: UniversalTransportError;
}

export type LynxBackgroundOutboundMessage =
	| LynxMainReadyRequest
	| LynxAdoptionReadyMessage
	| LynxMainCallPublicationMessage
	| LynxCallMainMessage
	| LynxCancelMainCallMessage
	| LynxCallBackgroundResultMessage
	| LynxCallBackgroundErrorMessage
	| UniversalTransportCommitMessage
	| UniversalTransportAbortMessage
	| LynxDisposeMessage
	| LynxTerminalDisposeMessage;

export type LynxBackgroundInboundMessage =
	| LynxMainReadyReply
	| LynxPageDestroyMessage
	| LynxCallBackgroundMessage
	| LynxCancelBackgroundCallMessage
	| LynxCallMainResultMessage
	| LynxCallMainErrorMessage
	| LynxTransportAcknowledgement
	| UniversalTransportCompleteMessage
	| UniversalTransportRejectMessage
	| UniversalTransportFaultMessage
	| UniversalTransportEventMessage
	| LynxHostAttachmentMessage
	| LynxHostFaultMessage
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
	if (Object.getOwnPropertySymbols(value).length !== 0) {
		return fail(label, 'contains symbol fields.');
	}
	for (const key of Object.getOwnPropertyNames(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
		if (!descriptor.enumerable) fail(`${label}.${key}`, 'must be enumerable.');
		if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
			fail(`${label}.${key}`, 'must not be an accessor.');
		}
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

function hostParent(value: unknown, label: string): void {
	if (value === null || typeof value === 'number') {
		nullableHostId(value, label);
		return;
	}
	const handle = record(value, label);
	exactKeys(handle, ['$$kind', 'renderer', 'root', 'id'], label);
	if (handle.$$kind !== 'octane.universal.portal-target') {
		fail(`${label}.$$kind`, 'must identify a universal portal target.');
	}
	if (handle.renderer !== LYNX_TRANSPORT_RENDERER) {
		fail(`${label}.renderer`, `must be ${JSON.stringify(LYNX_TRANSPORT_RENDERER)}.`);
	}
	positiveInteger(handle.root, `${label}.root`);
	if (decodeLynxPortalTargetId(handle.id) === null) {
		fail(`${label}.id`, 'must be an opaque Lynx portal target ID.');
	}
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
			if (Object.getOwnPropertySymbols(value).length !== 0) {
				fail(label, 'contains symbol fields.');
			}
			const names = Object.getOwnPropertyNames(value);
			if (names.length !== value.length + 1) {
				fail(label, 'must be a dense array without extra fields.');
			}
			for (let index = 0; index < value.length; index++) {
				const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
				if (
					descriptor === undefined ||
					!descriptor.enumerable ||
					!Object.prototype.hasOwnProperty.call(descriptor, 'value')
				) {
					fail(`${label}[${index}]`, 'must be an enumerable data property.');
				}
				assertWireValue(descriptor.value, `${label}[${index}]`, seen);
			}
			return;
		}
		const object = record(value, label);
		for (const name of Object.keys(object)) {
			const descriptor = Object.getOwnPropertyDescriptor(object, name)!;
			assertWireValue(descriptor.value, `${label}.${name}`, seen);
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
			hostParent(command.parent, `${label}.parent`);
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
			hostParent(command.parent, `${label}.parent`);
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

function assertCallArgs(value: unknown, label: string): void {
	if (!Array.isArray(value)) fail(label, 'must be an array.');
	assertWireValue(value, label);
}

function assertMainThreadWorklet(value: unknown, label: string): void {
	const worklet = record(value, label);
	const hasCaptures = Object.prototype.hasOwnProperty.call(worklet, '_c');
	exactKeys(worklet, hasCaptures ? ['_wkltId', '_c'] : ['_wkltId'], label);
	nonEmptyString(worklet._wkltId, `${label}._wkltId`);
	if (hasCaptures) {
		const captures = record(worklet._c, `${label}._c`);
		assertWireValue(captures, `${label}._c`);
	}
}

function assertBackgroundFunction(value: unknown, label: string): void {
	const fn = record(value, label);
	const hasExecution = Object.prototype.hasOwnProperty.call(fn, '_execId');
	const hasCaptures = Object.prototype.hasOwnProperty.call(fn, '_c');
	exactKeys(
		fn,
		['_jsFnId', ...(hasExecution ? ['_execId'] : []), ...(hasCaptures ? ['_c'] : [])],
		label,
	);
	nonEmptyString(fn._jsFnId, `${label}._jsFnId`);
	if (hasExecution) nonEmptyString(fn._execId, `${label}._execId`);
	if (hasCaptures) {
		const captures = record(fn._c, `${label}._c`);
		assertWireValue(captures, `${label}._c`);
	}
}

function assertCallResult(
	message: Record<string, unknown>,
	type: 'call-main-result' | 'call-background-result',
): void {
	exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type', 'call', 'value'], type);
	positiveInteger(message.call, `${type}.call`);
	assertWireValue(message.value, `${type}.value`);
}

function assertCallError(
	message: Record<string, unknown>,
	type: 'call-main-error' | 'call-background-error',
): void {
	exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type', 'call', 'error'], type);
	positiveInteger(message.call, `${type}.call`);
	assertRemoteError(message.error, `${type}.error`);
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
		exactKeys(
			delta,
			['op', 'id', 'type', 'generation', 'attached', 'listDescendant', 'snapshot'],
			label,
		);
		positiveInteger(delta.id, `${label}.id`);
		nonEmptyString(delta.type, `${label}.type`);
		positiveInteger(delta.generation, `${label}.generation`);
		if (typeof delta.attached !== 'boolean') fail(`${label}.attached`, 'must be a boolean.');
		if (typeof delta.listDescendant !== 'boolean') {
			fail(`${label}.listDescendant`, 'must be a boolean.');
		}
		assertWireValue(delta.snapshot, `${label}.snapshot`);
		assertSnapshotIdentity(delta.snapshot, delta, identity, label);
		return;
	}
	if (delta.op === 'list-ancestry') {
		exactKeys(delta, ['op', 'id', 'generation', 'listDescendant'], label);
		positiveInteger(delta.id, `${label}.id`);
		positiveInteger(delta.generation, `${label}.generation`);
		if (typeof delta.listDescendant !== 'boolean') {
			fail(`${label}.listDescendant`, 'must be a boolean.');
		}
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

function assertFirstTreeSnapshot(value: unknown, label: string): void {
	const snapshot = record(value, label);
	exactKeys(snapshot, ['format', 'renderer', 'root', 'version', 'plan', 'roots', 'nodes'], label);
	if (snapshot.format !== 1) fail(`${label}.format`, 'must be 1.');
	if (snapshot.renderer !== LYNX_TRANSPORT_RENDERER) {
		fail(`${label}.renderer`, `must be ${JSON.stringify(LYNX_TRANSPORT_RENDERER)}.`);
	}
	positiveInteger(snapshot.root, `${label}.root`);
	positiveInteger(snapshot.version, `${label}.version`);
	if (snapshot.plan !== null && (typeof snapshot.plan !== 'string' || snapshot.plan.length === 0)) {
		fail(`${label}.plan`, 'must be null or a non-empty string.');
	}
	if (!Array.isArray(snapshot.roots)) fail(`${label}.roots`, 'must be an array.');
	for (let index = 0; index < snapshot.roots.length; index++) {
		positiveInteger(snapshot.roots[index], `${label}.roots[${index}]`);
	}
	if (!Array.isArray(snapshot.nodes)) fail(`${label}.nodes`, 'must be an array.');
	for (let index = 0; index < snapshot.nodes.length; index++) {
		const nodeLabel = `${label}.nodes[${index}]`;
		const node = record(snapshot.nodes[index], nodeLabel);
		exactKeys(
			node,
			['id', 'nativeId', 'type', 'generation', 'parent', 'children', 'props', 'visible', 'events'],
			nodeLabel,
		);
		positiveInteger(node.id, `${nodeLabel}.id`);
		positiveInteger(node.nativeId, `${nodeLabel}.nativeId`);
		nonEmptyString(node.type, `${nodeLabel}.type`);
		positiveInteger(node.generation, `${nodeLabel}.generation`);
		nullableHostId(node.parent, `${nodeLabel}.parent`);
		if (!Array.isArray(node.children)) fail(`${nodeLabel}.children`, 'must be an array.');
		for (let child = 0; child < node.children.length; child++) {
			positiveInteger(node.children[child], `${nodeLabel}.children[${child}]`);
		}
		assertProps(node.props, `${nodeLabel}.props`);
		if (typeof node.visible !== 'boolean') fail(`${nodeLabel}.visible`, 'must be a boolean.');
		if (!Array.isArray(node.events)) fail(`${nodeLabel}.events`, 'must be an array.');
		for (let eventIndex = 0; eventIndex < node.events.length; eventIndex++) {
			const eventLabel = `${nodeLabel}.events[${eventIndex}]`;
			const event = record(node.events[eventIndex], eventLabel);
			exactKeys(event, ['host', 'generation', 'type', 'listener', 'priority'], eventLabel);
			positiveInteger(event.host, `${eventLabel}.host`);
			positiveInteger(event.generation, `${eventLabel}.generation`);
			nonEmptyString(event.type, `${eventLabel}.type`);
			positiveInteger(event.listener, `${eventLabel}.listener`);
			if (!['continuous', 'default', 'discrete'].includes(event.priority as string)) {
				fail(`${eventLabel}.priority`, 'must be discrete, continuous, or default.');
			}
		}
	}
}

function assertReady(value: unknown, reply: boolean): LynxMainReadyRequest | LynxMainReadyReply {
	const label = reply ? 'main-ready reply' : 'main-ready request';
	const message = record(value, label);
	const hasFirstTree = reply && Object.prototype.hasOwnProperty.call(message, 'firstTree');
	exactKeys(
		message,
		hasFirstTree
			? ['protocol', 'renderer', 'type', 'request', 'firstTree']
			: ['protocol', 'renderer', 'type', 'request'],
		label,
	);
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
	if (hasFirstTree) assertFirstTreeSnapshot(message.firstTree, `${label}.firstTree`);
	return message as unknown as LynxMainReadyRequest | LynxMainReadyReply;
}

export function validateLynxBackgroundOutboundMessage(
	value: unknown,
): LynxBackgroundOutboundMessage {
	const message = record(value, 'outbound message');
	if (message.type === 'main-ready-request')
		return assertReady(message, false) as LynxMainReadyRequest;
	assertIdentity(message, 'outbound message');
	if (message.type === 'adoption-ready') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type'], 'adoption-ready');
		return message as unknown as LynxAdoptionReadyMessage;
	}
	if (message.type === 'main-call-publication') {
		exactKeys(
			message,
			['protocol', 'renderer', 'root', 'version', 'type', 'phase'],
			'main-call-publication',
		);
		if (message.phase !== 'open' && message.phase !== 'close') {
			fail('main-call-publication.phase', 'must be open or close.');
		}
		return message as unknown as LynxMainCallPublicationMessage;
	}
	if (message.type === 'call-main') {
		exactKeys(
			message,
			['protocol', 'renderer', 'root', 'version', 'type', 'call', 'worklet', 'args'],
			'call-main',
		);
		positiveInteger(message.call, 'call-main.call');
		assertMainThreadWorklet(message.worklet, 'call-main.worklet');
		assertCallArgs(message.args, 'call-main.args');
		return message as unknown as LynxCallMainMessage;
	}
	if (message.type === 'cancel-main') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type', 'call'], 'cancel-main');
		positiveInteger(message.call, 'cancel-main.call');
		return message as unknown as LynxCancelMainCallMessage;
	}
	if (message.type === 'call-background-result') {
		assertCallResult(message, 'call-background-result');
		return message as unknown as LynxCallBackgroundResultMessage;
	}
	if (message.type === 'call-background-error') {
		assertCallError(message, 'call-background-error');
		return message as unknown as LynxCallBackgroundErrorMessage;
	}
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
	if (message.type === 'page-destroy') {
		exactKeys(message, ['protocol', 'renderer', 'type'], 'page-destroy');
		if (message.protocol !== LYNX_TRANSPORT_PROTOCOL_VERSION) {
			fail('page-destroy', `protocol must be ${LYNX_TRANSPORT_PROTOCOL_VERSION}.`);
		}
		if (message.renderer !== LYNX_TRANSPORT_RENDERER) {
			fail('page-destroy', `renderer must be ${JSON.stringify(LYNX_TRANSPORT_RENDERER)}.`);
		}
		return message as unknown as LynxPageDestroyMessage;
	}
	assertIdentity(message, 'inbound message');
	if (message.type === 'call-background') {
		exactKeys(
			message,
			['protocol', 'renderer', 'root', 'version', 'type', 'call', 'fn', 'args'],
			'call-background',
		);
		positiveInteger(message.call, 'call-background.call');
		assertBackgroundFunction(message.fn, 'call-background.fn');
		assertCallArgs(message.args, 'call-background.args');
		return message as unknown as LynxCallBackgroundMessage;
	}
	if (message.type === 'cancel-background') {
		exactKeys(
			message,
			['protocol', 'renderer', 'root', 'version', 'type', 'call'],
			'cancel-background',
		);
		positiveInteger(message.call, 'cancel-background.call');
		return message as unknown as LynxCancelBackgroundCallMessage;
	}
	if (message.type === 'call-main-result') {
		assertCallResult(message, 'call-main-result');
		return message as unknown as LynxCallMainResultMessage;
	}
	if (message.type === 'call-main-error') {
		assertCallError(message, 'call-main-error');
		return message as unknown as LynxCallMainErrorMessage;
	}
	if (message.type === 'ack') {
		const hasAdoption = Object.prototype.hasOwnProperty.call(message, 'adoption');
		exactKeys(
			message,
			hasAdoption
				? ['protocol', 'renderer', 'root', 'version', 'type', 'handles', 'adoption']
				: ['protocol', 'renderer', 'root', 'version', 'type', 'handles'],
			'ack',
		);
		if (hasAdoption && message.adoption !== 'adopted' && message.adoption !== 'repaired') {
			fail('ack.adoption', 'must be adopted or repaired.');
		}
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
	if (message.type === 'host-fault') {
		exactKeys(message, ['protocol', 'renderer', 'root', 'version', 'type', 'error'], 'host-fault');
		assertRemoteError(message.error, 'host-fault.error');
		return message as unknown as LynxHostFaultMessage;
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
	if (message.type === 'host-attachment') {
		exactKeys(
			message,
			['protocol', 'renderer', 'root', 'version', 'type', 'changes'],
			'host-attachment',
		);
		if (!Array.isArray(message.changes)) {
			fail('host-attachment.changes', 'must be an array.');
		}
		const seen = new Set<number>();
		for (let index = 0; index < message.changes.length; index++) {
			const change = record(message.changes[index], `host-attachment.changes[${index}]`);
			exactKeys(change, ['id', 'generation', 'attached'], `host-attachment.changes[${index}]`);
			positiveInteger(change.id, `host-attachment.changes[${index}].id`);
			positiveInteger(change.generation, `host-attachment.changes[${index}].generation`);
			if (typeof change.attached !== 'boolean') {
				fail(`host-attachment.changes[${index}].attached`, 'must be a boolean.');
			}
			if (seen.has(change.id)) {
				fail(`host-attachment.changes[${index}].id`, 'must be unique within one batch.');
			}
			seen.add(change.id);
		}
		return message as unknown as LynxHostAttachmentMessage;
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
