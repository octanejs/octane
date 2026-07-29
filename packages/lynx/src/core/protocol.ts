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
import { LYNX_DEVELOPMENT } from './environment.js';
import { decodeLynxPortalTargetId } from './portal.js';
import { LYNX_RENDERER_ID } from './renderer-id.js';

/** Kept local to the main-thread protocol graph; the type pins it to the core ABI. */
export const LYNX_TRANSPORT_PROTOCOL_VERSION: typeof UNIVERSAL_TRANSPORT_PROTOCOL_VERSION = 1;

export const LYNX_TRANSPORT_RENDERER: typeof LYNX_RENDERER_ID = LYNX_RENDERER_ID;

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

export type LynxPageDataOperation = 'replace' | 'update' | 'reset';

/** Immutable, structured-clone-safe record carried by the page data lifecycle. */
export type LynxLifecycleDataRecord = Readonly<Record<string, UniversalSerializableValue>>;

/** Root-independent page data delivered from the public engine lifecycle. */
export interface LynxPageDataMessage {
	readonly protocol: typeof LYNX_TRANSPORT_PROTOCOL_VERSION;
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	readonly type: 'page-data';
	readonly operation: LynxPageDataOperation;
	readonly data: LynxLifecycleDataRecord;
}

/** Root-independent global-props patch delivered from the public engine lifecycle. */
export interface LynxGlobalPropsMessage {
	readonly protocol: typeof LYNX_TRANSPORT_PROTOCOL_VERSION;
	readonly renderer: typeof LYNX_TRANSPORT_RENDERER;
	readonly type: 'global-props';
	readonly patch: LynxLifecycleDataRecord;
}

export type LynxDataLifecycleMessage = LynxPageDataMessage | LynxGlobalPropsMessage;

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
	| LynxDataLifecycleMessage
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

/**
 * Compose a message path only when a validation actually fails.
 *
 * A commit carries one command per accepted host node and each command carries
 * its props, so building `commit.batch.commands[7412].props` eagerly allocated
 * several strings per node on the success path. `index` and `field` are the two
 * suffixes the per-node validators need; everything else stays a plain label.
 */
function composePath(label: string, index?: number, field?: string): string {
	const indexed = index === undefined ? label : `${label}[${index}]`;
	return field === undefined ? indexed : `${indexed}.${field}`;
}

function fail(label: string, message: string, index?: number, field?: string): never {
	throw new TypeError(`Octane Lynx transport ${composePath(label, index, field)}: ${message}`);
}

function record(
	value: unknown,
	label: string,
	index?: number,
	field?: string,
): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return fail(label, 'must be an object.', index, field);
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		return fail(label, 'must be a plain object.', index, field);
	}
	if (Object.getOwnPropertySymbols(value).length !== 0) {
		return fail(label, 'contains symbol fields.', index, field);
	}
	// Enumerability and accessor freedom are what make a later read of this
	// message safe: an accessor could hand the validator one value and the host
	// driver another. The descriptor walk is the only way to prove that, so it
	// stays on the receive path.
	for (const key of Object.getOwnPropertyNames(value)) {
		const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
		if (!descriptor.enumerable) {
			fail(composePath(label, index, field), 'must be enumerable.', undefined, key);
		}
		if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
			fail(composePath(label, index, field), 'must not be an accessor.', undefined, key);
		}
	}
	return value as Record<string, unknown>;
}

function exactKeys(
	value: Record<string, unknown>,
	expected: readonly string[],
	label: string,
	index?: number,
): void {
	// Every caller runs `record` on the same object first, which already proved
	// the value carries no symbol fields and only enumerable data properties.
	// So a present-count match plus a per-expected-key lookup is exact, and it
	// avoids a linear `expected` scan for each of the object's own keys.
	let present = 0;
	for (const key of expected) {
		if (Object.prototype.hasOwnProperty.call(value, key)) present++;
		else fail(label, `is missing field ${JSON.stringify(key)}.`, index);
	}
	if (Object.keys(value).length === present) return;
	for (const key of Object.keys(value)) {
		if (!expected.includes(key)) {
			fail(label, `contains unknown field ${JSON.stringify(key)}.`, index);
		}
	}
}

function nonEmptyString(
	value: unknown,
	label: string,
	index?: number,
	field?: string,
): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		fail(label, 'must be a non-empty string.', index, field);
	}
}

function positiveInteger(
	value: unknown,
	label: string,
	index?: number,
	field?: string,
): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		fail(label, 'must be a positive safe integer.', index, field);
	}
}

function nonNegativeInteger(value: unknown, label: string): asserts value is number {
	if (!Number.isSafeInteger(value) || (value as number) < 0) {
		fail(label, 'must be a non-negative safe integer.');
	}
}

function nullableHostId(
	value: unknown,
	label: string,
	index?: number,
	field?: string,
): asserts value is number | null {
	if (value !== null) positiveInteger(value, label, index, field);
}

function hostParent(value: unknown, base: string, index?: number, field?: string): void {
	if (value === null || typeof value === 'number') {
		nullableHostId(value, base, index, field);
		return;
	}
	// Only a portal target reaches here, so composing the full path is cold.
	const label = composePath(base, index, field);
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

/** Values that need no walk, and therefore no message path and no cycle set. */
function isWireLeaf(value: unknown): boolean {
	return (
		value === null ||
		value === undefined ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'bigint' ||
		typeof value === 'boolean'
	);
}

function assertWireValue(value: unknown, label: string, seen: Set<object> | null = null): void {
	if (isWireLeaf(value)) return;
	if (typeof value !== 'object' || value === null) {
		fail(label, 'contains a non-serializable value.');
	}
	const composite: object = value;
	if (Object.getOwnPropertySymbols(composite).length !== 0) {
		fail(label, 'contains symbol fields.');
	}
	// Allocated on the first descent into an object, not once per validated
	// value: almost every host prop is a leaf.
	const scope = seen ?? new Set<object>();
	if (scope.has(composite)) fail(label, 'contains a cycle.');
	scope.add(composite);
	try {
		if (Array.isArray(composite)) {
			const names = Object.getOwnPropertyNames(composite);
			if (names.length !== composite.length + 1) {
				fail(label, 'must be a dense array without extra fields.');
			}
			for (let index = 0; index < composite.length; index++) {
				const descriptor = Object.getOwnPropertyDescriptor(composite, String(index));
				if (
					descriptor === undefined ||
					!descriptor.enumerable ||
					!Object.prototype.hasOwnProperty.call(descriptor, 'value')
				) {
					fail(`${label}[${index}]`, 'must be an enumerable data property.');
				}
				if (!isWireLeaf(descriptor.value)) {
					assertWireValue(descriptor.value, `${label}[${index}]`, scope);
				}
			}
			return;
		}
		const object = record(composite, label);
		for (const name of Object.keys(object)) {
			const child = object[name];
			if (!isWireLeaf(child)) assertWireValue(child, `${label}.${name}`, scope);
		}
	} finally {
		scope.delete(composite);
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

function assertProps(value: unknown, label: string, index?: number, field?: string): void {
	// `record` already rejected symbol fields, accessors, and non-enumerable own
	// keys, so reading each value once here is safe. Leaves skip the walk without
	// composing a path, which is the common shape of a host prop bag.
	const props = record(value, label, index, field);
	for (const name of Object.keys(props)) {
		const prop = props[name];
		if (isWireLeaf(prop)) continue;
		assertWireValue(prop, `${composePath(label, index, field)}.${name}`);
	}
}

const COMMANDS_LABEL = 'commit.batch.commands';
const CREATE_KEYS = Object.freeze(['op', 'id', 'type', 'props']);
const UPDATE_KEYS = Object.freeze(['op', 'id', 'props']);
const PLACEMENT_KEYS = Object.freeze(['op', 'parent', 'id', 'before']);
const EVENT_KEYS = Object.freeze(['op', 'id', 'type', 'listener']);
const VISIBILITY_KEYS = Object.freeze(['op', 'id', 'state']);
const REMOVE_KEYS = Object.freeze(['op', 'parent', 'id']);
const DESTROY_KEYS = Object.freeze(['op', 'id']);

function assertCommand(value: unknown, index: number): asserts value is UniversalHostCommand {
	// One call per accepted host node. Every path below is composed lazily.
	const label = COMMANDS_LABEL;
	const command = record(value, label, index);
	if (typeof command.op !== 'string') fail(label, 'must be a string.', index, 'op');
	switch (command.op) {
		case 'create':
			exactKeys(command, CREATE_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			nonEmptyString(command.type, label, index, 'type');
			assertProps(command.props, label, index, 'props');
			return;
		case 'update':
			exactKeys(command, UPDATE_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			assertProps(command.props, label, index, 'props');
			return;
		case 'recreate':
			exactKeys(command, CREATE_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			nonEmptyString(command.type, label, index, 'type');
			assertProps(command.props, label, index, 'props');
			return;
		case 'insert':
		case 'move':
			exactKeys(command, PLACEMENT_KEYS, label, index);
			hostParent(command.parent, label, index, 'parent');
			positiveInteger(command.id, label, index, 'id');
			nullableHostId(command.before, label, index, 'before');
			return;
		case 'event':
			exactKeys(command, EVENT_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			nonEmptyString(command.type, label, index, 'type');
			assertEventListener(command.listener, composePath(label, index, 'listener'));
			return;
		case 'lifecycle':
		case 'local-callback':
			fail(label, `${command.op} is not supported by the Lynx async host.`, index, 'op');
		case 'visibility':
			exactKeys(command, VISIBILITY_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			if (command.state !== 'hidden' && command.state !== 'visible') {
				fail(label, 'must be hidden or visible.', index, 'state');
			}
			return;
		case 'remove':
			exactKeys(command, REMOVE_KEYS, label, index);
			hostParent(command.parent, label, index, 'parent');
			positiveInteger(command.id, label, index, 'id');
			return;
		case 'destroy':
			exactKeys(command, DESTROY_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			return;
		default:
			fail(label, `uses unsupported operation ${JSON.stringify(command.op)}.`, index, 'op');
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

/**
 * Validate a message this thread just constructed, on the way out.
 *
 * Every outbound message is built by this package from an already-frozen
 * universal batch, so re-walking it before `dispatchEvent` is a self-check
 * against protocol drift, not a trust boundary: the receiving thread validates
 * every inbound message unconditionally. The walk is O(commands x props), so a
 * mount pays for it once per node per direction. Keep it in development, where
 * drift should fail loudly at its origin, and drop it from production sends.
 */
export function selfCheckLynxBackgroundOutboundMessage<Message>(message: Message): Message {
	if (LYNX_DEVELOPMENT) validateLynxBackgroundOutboundMessage(message);
	return message;
}

/** Send-side self-check for main's inbound-shaped messages. See the outbound note. */
export function selfCheckLynxBackgroundInboundMessage<Message>(message: Message): Message {
	if (LYNX_DEVELOPMENT) validateLynxBackgroundInboundMessage(message);
	return message;
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
	if (message.type === 'page-data') {
		exactKeys(message, ['protocol', 'renderer', 'type', 'operation', 'data'], 'page-data');
		if (message.protocol !== LYNX_TRANSPORT_PROTOCOL_VERSION) {
			fail('page-data', `protocol must be ${LYNX_TRANSPORT_PROTOCOL_VERSION}.`);
		}
		if (message.renderer !== LYNX_TRANSPORT_RENDERER) {
			fail('page-data', `renderer must be ${JSON.stringify(LYNX_TRANSPORT_RENDERER)}.`);
		}
		if (
			message.operation !== 'replace' &&
			message.operation !== 'update' &&
			message.operation !== 'reset'
		) {
			fail('page-data.operation', 'must be replace, update, or reset.');
		}
		record(message.data, 'page-data.data');
		assertWireValue(message.data, 'page-data.data');
		return message as unknown as LynxPageDataMessage;
	}
	if (message.type === 'global-props') {
		exactKeys(message, ['protocol', 'renderer', 'type', 'patch'], 'global-props');
		if (message.protocol !== LYNX_TRANSPORT_PROTOCOL_VERSION) {
			fail('global-props', `protocol must be ${LYNX_TRANSPORT_PROTOCOL_VERSION}.`);
		}
		if (message.renderer !== LYNX_TRANSPORT_RENDERER) {
			fail('global-props', `renderer must be ${JSON.stringify(LYNX_TRANSPORT_RENDERER)}.`);
		}
		record(message.patch, 'global-props.patch');
		assertWireValue(message.patch, 'global-props.patch');
		return message as unknown as LynxGlobalPropsMessage;
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
