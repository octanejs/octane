import { hasOwnSymbolFields } from './own-symbols.js';
import { hasCrossRealmPlainPrototype } from './plain-object.js';
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

/**
 * Legacy peers accept and echo every positive safe request ID. Reserving its
 * high range probes optional capabilities without adding a field an older
 * exact-shape readiness validator would reject.
 */
export const LYNX_CAPABILITY_READY_REQUEST_BASE = 2 ** 40;
/** A higher probe keeps strict older background validators free of newer capability fields. */
export const LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE = 2 ** 41;
/** Distinct from the lazy-instance probe so older strict lazy peers never see a new key. */
export const LYNX_TEMPLATE_RUN_READY_REQUEST_BASE = 2 ** 42;

/** Ready requests at or above this base understand run-teardown commands and deltas. */
export const LYNX_TEARDOWN_RUN_READY_REQUEST_BASE = 2 ** 43;
export const LYNX_COMPACT_ACKNOWLEDGEMENT = 'compact-v1';
export const LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS = 16;
export const LYNX_LAZY_PUBLIC_INSTANCES = 'lazy-v1';

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
	/** Published only in response to a capability-tagged readiness request. */
	readonly capabilities?: LynxMainThreadCapabilities;
}

export interface LynxMainThreadCapabilities {
	readonly compactAck: 1;
	/** Advertised only after the main host can consume template-mount batches. */
	readonly templateMount?: 1;
	/** Shared intrinsic programs with implicit contiguous host/listener ranges. */
	readonly templateProgram?: 1;
	/** Private native selectors are installed only before a public instance is exposed. */
	readonly lazyPublicInstances?: 1;
	/** One intrinsic command can mount a contiguous run of sibling program instances. */
	readonly templateRuns?: 1;
	readonly teardownRuns?: 1;
}

export interface LynxTransportCommitMessage extends UniversalTransportCommitMessage {
	/** Present only after this background and main explicitly negotiated it. */
	readonly ack?: typeof LYNX_COMPACT_ACKNOWLEDGEMENT;
	/** Present only on an explicitly negotiated, compact initial intrinsic mount. */
	readonly instances?: typeof LYNX_LAZY_PUBLIC_INSTANCES;
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

/** Retires `hostCount` contiguous generation-`generation` hosts in one delta. */
export interface LynxPublicHandleRunRemoval {
	readonly op: 'remove-run';
	readonly firstId: number;
	readonly hostCount: number;
	readonly generation: number;
}

export type LynxPublicHandleDelta =
	| LynxPublicHandleUpsert
	| LynxPublicHandleListAncestry
	| LynxPublicHandleRemoval
	| LynxPublicHandleRunRemoval;

export interface LynxLegacyTransportAcknowledgement extends UniversalTransportAcknowledgement {
	readonly handles: readonly LynxPublicHandleDelta[];
	readonly adoption?: 'adopted' | 'repaired';
	readonly encoding?: never;
	readonly count?: never;
}

export interface LynxCompactTransportAcknowledgement extends UniversalTransportAcknowledgement {
	readonly encoding: typeof LYNX_COMPACT_ACKNOWLEDGEMENT;
	readonly count: number;
	readonly handles?: never;
	readonly adoption?: never;
}

export type LynxTransportAcknowledgement =
	LynxLegacyTransportAcknowledgement | LynxCompactTransportAcknowledgement;

const COMPACT_STATIC_PROPS = new WeakMap<object, boolean>();
const COMPACT_TEMPLATE_PROGRAMS = new WeakMap<object, boolean>();

function hasCompactCompatibleProps(props: Readonly<Record<string, unknown>>): boolean {
	const cached = COMPACT_STATIC_PROPS.get(props);
	if (cached !== undefined) return cached;
	let compatible = true;
	for (const name in props) {
		if (name === 'ref' || name.startsWith('main-thread:')) {
			compatible = false;
			break;
		}
	}
	if (Object.isFrozen(props)) COMPACT_STATIC_PROPS.set(props, compatible);
	return compatible;
}

/**
 * Count an already-validated batch's fully placed, ordinary fresh hosts.
 * Host preparation separately proves every target, insertion, generation,
 * parent, and cycle; equal create/placement counts then imply attachment for
 * a list-free, portal-free initial root.
 */
export function countLynxCompactAcknowledgementHosts(batch: UniversalHostBatch): number | null {
	let created = 0;
	let inserted = 0;
	for (let index = 0; index < batch.commands.length; index++) {
		const command = batch.commands[index]!;
		if (command.op === 'create') {
			if (
				command.type === 'list' ||
				command.type === 'list-item' ||
				!hasCompactCompatibleProps(command.props)
			) {
				return null;
			}
			created++;
			continue;
		}
		if (command.op === 'mount-template') {
			if (command.parent !== null && typeof command.parent !== 'number') return null;
			for (let nodeIndex = 0; nodeIndex < command.nodes.length; nodeIndex++) {
				const type = command.shape[nodeIndex]!.type;
				if (
					type === 'list' ||
					type === 'list-item' ||
					!hasCompactCompatibleProps(command.nodes[nodeIndex]!.props)
				) {
					return null;
				}
			}
			created += command.nodes.length;
			inserted += command.nodes.length;
			continue;
		}
		if (command.op === 'mount-template-range' || command.op === 'mount-template-run') {
			if (command.parent !== null && typeof command.parent !== 'number') return null;
			let compatible = COMPACT_TEMPLATE_PROGRAMS.get(command.program);
			if (compatible === undefined) {
				compatible = true;
				let immutable = Object.isFrozen(command.program) && Object.isFrozen(command.program.nodes);
				for (let nodeIndex = 0; nodeIndex < command.program.nodes.length; nodeIndex++) {
					const node = command.program.nodes[nodeIndex]!;
					if (
						node.type === 'list' ||
						node.type === 'list-item' ||
						!hasCompactCompatibleProps(node.props)
					) {
						compatible = false;
						break;
					}
					if (immutable && (!Object.isFrozen(node) || !Object.isFrozen(node.props))) {
						immutable = false;
					}
					if (immutable && node.bindings !== undefined && !Object.isFrozen(node.bindings)) {
						immutable = false;
					}
					for (const binding of node.bindings ?? []) {
						if (immutable && !Object.isFrozen(binding)) immutable = false;
						if (binding.name === 'ref' || binding.name.startsWith('main-thread:')) {
							compatible = false;
							break;
						}
					}
					if (!compatible) break;
				}
				if (immutable) COMPACT_TEMPLATE_PROGRAMS.set(command.program, compatible);
			}
			if (!compatible) return null;
			const instances = command.op === 'mount-template-run' ? command.count : 1;
			if (!Number.isSafeInteger(instances) || instances <= 0) return null;
			const hostCount = command.program.nodes.length * instances;
			if (!Number.isSafeInteger(hostCount) || !Number.isSafeInteger(created + hostCount)) {
				return null;
			}
			created += hostCount;
			inserted += hostCount;
			continue;
		}
		if (command.op === 'insert') {
			if (command.parent !== null && typeof command.parent !== 'number') return null;
			inserted++;
			continue;
		}
		if (command.op !== 'event') return null;
	}
	return created >= LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS && created === inserted ? created : null;
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
	| LynxTransportCommitMessage
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
	// A background message crosses a realm boundary in production, so its
	// prototype is that realm's Object.prototype — never identical to this one.
	if (!hasCrossRealmPlainPrototype(value)) {
		return fail(label, 'must be a plain object.', index, field);
	}
	// Enumerability and accessor freedom are what make a later read of this
	// message safe: an accessor could hand the validator one value and the host
	// driver another. One own-key walk covers both symbols and descriptors,
	// avoiding separate symbol/name arrays for every dynamic template node.
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key === 'symbol') {
			return fail(label, 'contains symbol fields.', index, field);
		}
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor === undefined) {
			fail(composePath(label, index, field), 'changed during validation.', undefined, key);
		}
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
	if (hasOwnSymbolFields(composite)) {
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

function assertProps(
	value: unknown,
	label: string,
	index?: number,
	field?: string,
	state?: LynxBatchValidationState,
): void {
	// Hoisted scalar plan props retain object identity across thousands of
	// template instances. A frozen, fully validated leaf bag cannot acquire an
	// accessor, symbol, prototype change, or different value, so validating it
	// once per inbound batch preserves the same strict trust boundary.
	if (
		state?.validatedStaticProps !== undefined &&
		value !== null &&
		typeof value === 'object' &&
		state.validatedStaticProps.has(value)
	) {
		return;
	}
	// `record` already rejected symbol fields, accessors, and non-enumerable own
	// keys, so reading each value once here is safe. Leaves skip the walk without
	// composing a path, which is the common shape of a host prop bag.
	const props = record(value, label, index, field);
	let scalar = true;
	for (const name of Object.keys(props)) {
		const prop = props[name];
		if (isWireLeaf(prop)) continue;
		scalar = false;
		assertWireValue(prop, `${composePath(label, index, field)}.${name}`);
	}
	if (scalar && state !== undefined && Object.isFrozen(props)) {
		(state.validatedStaticProps ??= new WeakSet<object>()).add(props);
	}
}

const COMMANDS_LABEL = 'commit.batch.commands';
const CREATE_KEYS = Object.freeze(['op', 'id', 'type', 'props']);
const TEMPLATE_KEYS = Object.freeze(['op', 'parent', 'before', 'shape', 'nodes']);
const TEMPLATE_RANGE_KEYS = Object.freeze([
	'op',
	'parent',
	'before',
	'program',
	'firstId',
	'values',
	'firstListenerId',
]);
const TEMPLATE_RUN_KEYS = Object.freeze([
	'op',
	'parent',
	'before',
	'program',
	'firstId',
	'firstListenerId',
	'count',
	'values',
]);
const TEMPLATE_PROGRAM_KEYS = Object.freeze(['nodes', 'events']);
const TEMPLATE_PROGRAM_NODE_KEYS = Object.freeze(['type', 'parent', 'props']);
const TEMPLATE_PROGRAM_BOUND_NODE_KEYS = Object.freeze(['type', 'parent', 'props', 'bindings']);
const TEMPLATE_PROGRAM_BINDING_KEYS = Object.freeze(['name', 'valueIndex']);
const TEMPLATE_PROGRAM_EVENT_KEYS = Object.freeze(['node', 'type', 'priority']);
const TEMPLATE_SHAPE_KEYS = Object.freeze(['type', 'parent']);
const TEMPLATE_NODE_KEYS = Object.freeze(['id', 'props']);
const TEMPLATE_NODE_EVENT_KEYS = Object.freeze(['id', 'props', 'events']);
const TEMPLATE_EVENT_KEYS = Object.freeze(['type', 'listener']);
const UPDATE_KEYS = Object.freeze(['op', 'id', 'props']);
const PLACEMENT_KEYS = Object.freeze(['op', 'parent', 'id', 'before']);
const EVENT_KEYS = Object.freeze(['op', 'id', 'type', 'listener']);
const VISIBILITY_KEYS = Object.freeze(['op', 'id', 'state']);
const REMOVE_KEYS = Object.freeze(['op', 'parent', 'id']);
const DESTROY_KEYS = Object.freeze(['op', 'id']);
const DESTROY_RUN_KEYS = Object.freeze(['op', 'parent', 'firstId', 'count', 'width']);

interface LynxBatchValidationState {
	validatedTemplateShapes?: WeakSet<object>;
	validatedStaticProps?: WeakSet<object>;
	lastTemplateProgram?: object;
	lastValidatedTemplateProgram?: LynxValidatedTemplateProgram;
	validatedTemplatePrograms?: WeakMap<object, LynxValidatedTemplateProgram>;
	templateNodeIds?: Set<number>;
	templateRangeStarts?: number[];
	templateRangeEnds?: number[];
	listenerRangeStarts?: number[];
	listenerRangeEnds?: number[];
}

interface LynxValidatedTemplateProgram {
	readonly hosts: number;
	readonly values: number;
	readonly events: number;
}

/** Reuse canonical decimal keys across repeated, bounded scalar-array validations. */
const MAX_CACHED_TEMPLATE_SCALAR_INDEX = 65_536;
const TEMPLATE_SCALAR_INDEX_KEYS: string[] = [];

function templateScalarIndexKey(index: number): string {
	if (index >= MAX_CACHED_TEMPLATE_SCALAR_INDEX) return String(index);
	while (TEMPLATE_SCALAR_INDEX_KEYS.length <= index) {
		TEMPLATE_SCALAR_INDEX_KEYS.push(String(TEMPLATE_SCALAR_INDEX_KEYS.length));
	}
	return TEMPLATE_SCALAR_INDEX_KEYS[index]!;
}

/** Reject array accessors/prototype tricks before exposing any dynamic value. */
function assertTemplateArray(value: unknown, label: string): readonly unknown[] {
	if (!Array.isArray(value)) fail(label, 'must be an array.');
	const prototype = Object.getPrototypeOf(value);
	if (prototype === null || !hasCrossRealmPlainPrototype(prototype)) {
		fail(label, 'must have a plain cross-realm array prototype.');
	}
	const keys = Reflect.ownKeys(value);
	if (keys.length !== value.length + 1) {
		fail(label, 'must be dense and contain no additional or symbol fields.');
	}
	for (let index = 0; index < value.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (
			descriptor === undefined ||
			!descriptor.enumerable ||
			!Object.prototype.hasOwnProperty.call(descriptor, 'value')
		) {
			fail(label, 'must contain only enumerable data values.', index);
		}
	}
	return value;
}

/** Validate each dynamic array slot exactly once without ever evaluating its getter. */
function assertTemplateScalarValues(value: unknown, expected: number, index: number): void {
	if (!Array.isArray(value)) {
		fail(COMMANDS_LABEL, 'must be an array.', index, 'values');
	}
	if (value.length !== expected) {
		fail(COMMANDS_LABEL, 'must match the intrinsic program dynamic-value arity.', index, 'values');
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype === null || !hasCrossRealmPlainPrototype(prototype)) {
		fail(COMMANDS_LABEL, 'must have a plain cross-realm array prototype.', index, 'values');
	}
	const keys = Reflect.ownKeys(value);
	if (keys.length !== expected + 1 || keys[expected] !== 'length') {
		fail(
			COMMANDS_LABEL,
			'must be dense and contain no additional or symbol fields.',
			index,
			'values',
		);
	}
	for (let slot = 0; slot < expected; slot++) {
		const key = keys[slot]!;
		if (key !== templateScalarIndexKey(slot)) {
			fail(
				composePath(COMMANDS_LABEL, index, 'values'),
				'must contain ordered canonical dense scalar keys.',
				slot,
			);
		}
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (
			descriptor === undefined ||
			!descriptor.enumerable ||
			!Object.prototype.hasOwnProperty.call(descriptor, 'value')
		) {
			fail(
				composePath(COMMANDS_LABEL, index, 'values'),
				'must contain only enumerable data values.',
				slot,
			);
		}
		if (!isWireLeaf(descriptor.value)) {
			fail(composePath(COMMANDS_LABEL, index, 'values'), 'must contain only scalar values.', slot);
		}
		// Frozen own data slots force proxy reads to return the exact descriptor
		// value. Mutable cross-realm arrays retain the older observable-read
		// check so a proxy cannot validate one scalar and deliver another.
		if (
			(descriptor.configurable || descriptor.writable) &&
			!Object.is(value[slot], descriptor.value)
		) {
			fail(composePath(COMMANDS_LABEL, index, 'values'), 'changed during validation.', slot);
		}
	}
}

function assertTemplateCommand(
	command: Record<string, unknown>,
	index: number,
	state: LynxBatchValidationState,
): void {
	const label = `${COMMANDS_LABEL}[${index}]`;
	exactKeys(command, TEMPLATE_KEYS, COMMANDS_LABEL, index);
	hostParent(command.parent, COMMANDS_LABEL, index, 'parent');
	nullableHostId(command.before, COMMANDS_LABEL, index, 'before');
	if (!Array.isArray(command.shape) || command.shape.length === 0) {
		fail(label, 'must be a non-empty array.', undefined, 'shape');
	}
	if (!Array.isArray(command.nodes) || command.nodes.length !== command.shape.length) {
		fail(label, 'must match the template shape length.', undefined, 'nodes');
	}
	const validatedShapes = (state.validatedTemplateShapes ??= new WeakSet<object>());
	if (!validatedShapes.has(command.shape)) {
		let immutableShape = Object.isFrozen(command.shape);
		for (let nodeIndex = 0; nodeIndex < command.shape.length; nodeIndex++) {
			const nodeLabel = `${label}.shape[${nodeIndex}]`;
			const shape = record(command.shape[nodeIndex], nodeLabel);
			if (immutableShape && !Object.isFrozen(shape)) immutableShape = false;
			exactKeys(shape, TEMPLATE_SHAPE_KEYS, nodeLabel);
			nonEmptyString(shape.type, `${nodeLabel}.type`);
			if (
				!Number.isSafeInteger(shape.parent) ||
				(nodeIndex === 0
					? shape.parent !== -1
					: (shape.parent as number) < 0 || (shape.parent as number) >= nodeIndex)
			) {
				fail(`${nodeLabel}.parent`, 'must name an earlier node, with -1 only for the root.');
			}
		}
		if (immutableShape) validatedShapes.add(command.shape);
	}
	const seen = (state.templateNodeIds ??= new Set<number>());
	const nodeBase = `${label}.nodes`;
	for (let nodeIndex = 0; nodeIndex < command.nodes.length; nodeIndex++) {
		const node = record(command.nodes[nodeIndex], nodeBase, nodeIndex);
		const hasEvents = Object.prototype.hasOwnProperty.call(node, 'events');
		exactKeys(node, hasEvents ? TEMPLATE_NODE_EVENT_KEYS : TEMPLATE_NODE_KEYS, nodeBase, nodeIndex);
		positiveInteger(node.id, nodeBase, nodeIndex, 'id');
		if (seen.has(node.id as number)) {
			fail(nodeBase, 'must be unique across template mounts in one batch.', nodeIndex, 'id');
		}
		if (state.templateRangeStarts !== undefined) {
			for (let range = 0; range < state.templateRangeStarts.length; range++) {
				if (
					(node.id as number) >= state.templateRangeStarts[range]! &&
					(node.id as number) <= state.templateRangeEnds![range]!
				) {
					fail(nodeBase, 'overlaps an intrinsic host range.', nodeIndex, 'id');
				}
			}
		}
		seen.add(node.id as number);
		assertProps(node.props, nodeBase, nodeIndex, 'props', state);
		if (!hasEvents) continue;
		const eventBase = `${nodeBase}[${nodeIndex}].events`;
		if (!Array.isArray(node.events)) fail(eventBase, 'must be an array.');
		for (let eventIndex = 0; eventIndex < (node.events as unknown[]).length; eventIndex++) {
			const event = record((node.events as unknown[])[eventIndex], eventBase, eventIndex);
			exactKeys(event, TEMPLATE_EVENT_KEYS, eventBase, eventIndex);
			nonEmptyString(event.type, eventBase, eventIndex, 'type');
			assertEventListener(event.listener, `${eventBase}[${eventIndex}].listener`);
		}
	}
}

function assertTemplateProgram(
	value: unknown,
	commandIndex: number,
	state: LynxBatchValidationState,
): LynxValidatedTemplateProgram {
	if (value === state.lastTemplateProgram && state.lastValidatedTemplateProgram !== undefined) {
		return state.lastValidatedTemplateProgram;
	}
	if (
		state.validatedTemplatePrograms !== undefined &&
		value !== null &&
		typeof value === 'object'
	) {
		const previous = state.validatedTemplatePrograms.get(value);
		if (previous !== undefined) {
			state.lastTemplateProgram = value;
			state.lastValidatedTemplateProgram = previous;
			return previous;
		}
	}
	const label = `${COMMANDS_LABEL}[${commandIndex}].program`;
	const program = record(value, label);
	exactKeys(program, TEMPLATE_PROGRAM_KEYS, label);
	const nodes = assertTemplateArray(program.nodes, `${label}.nodes`);
	const events = assertTemplateArray(program.events, `${label}.events`);
	if (nodes.length === 0) fail(`${label}.nodes`, 'must be a non-empty array.');
	let immutable = Object.isFrozen(program) && Object.isFrozen(nodes) && Object.isFrozen(events);
	let maxValue = -1;
	const usedValues = new Set<number>();
	for (let index = 0; index < nodes.length; index++) {
		const nodeLabel = `${label}.nodes[${index}]`;
		const node = record(nodes[index], nodeLabel);
		if (immutable && !Object.isFrozen(node)) immutable = false;
		const hasBindings = Object.prototype.hasOwnProperty.call(node, 'bindings');
		exactKeys(
			node,
			hasBindings ? TEMPLATE_PROGRAM_BOUND_NODE_KEYS : TEMPLATE_PROGRAM_NODE_KEYS,
			nodeLabel,
		);
		nonEmptyString(node.type, `${nodeLabel}.type`);
		if (node.type === 'list' || node.type === 'list-item') {
			fail(`${nodeLabel}.type`, 'must not be a native-list host.');
		}
		if (
			!Number.isSafeInteger(node.parent) ||
			(index === 0
				? node.parent !== -1
				: (node.parent as number) < 0 || (node.parent as number) >= index)
		) {
			fail(`${nodeLabel}.parent`, 'must name an earlier node, with -1 only for the root.');
		}
		assertProps(node.props, `${nodeLabel}.props`, undefined, undefined, state);
		const props = node.props as Record<string, unknown>;
		if (immutable && !Object.isFrozen(props)) immutable = false;
		for (const name of Object.keys(props)) {
			if (!isWireLeaf(props[name])) {
				fail(`${nodeLabel}.props.${name}`, 'must be a scalar static host value.');
			}
			if (name === 'ref' || name.startsWith('main-thread:')) {
				fail(`${nodeLabel}.props.${name}`, 'is not allowed in an intrinsic host program.');
			}
		}
		if (!hasBindings) continue;
		const bindings = assertTemplateArray(node.bindings, `${nodeLabel}.bindings`);
		if (immutable && !Object.isFrozen(bindings)) immutable = false;
		const names = new Set<string>();
		for (let bindingIndex = 0; bindingIndex < bindings.length; bindingIndex++) {
			const bindingLabel = `${nodeLabel}.bindings[${bindingIndex}]`;
			const binding = record(bindings[bindingIndex], bindingLabel);
			if (immutable && !Object.isFrozen(binding)) immutable = false;
			exactKeys(binding, TEMPLATE_PROGRAM_BINDING_KEYS, bindingLabel);
			nonEmptyString(binding.name, `${bindingLabel}.name`);
			if (
				binding.name === 'ref' ||
				binding.name === 'key' ||
				binding.name === 'children' ||
				(binding.name as string).startsWith('main-thread:') ||
				names.has(binding.name as string)
			) {
				fail(`${bindingLabel}.name`, 'must be a unique ordinary host-prop name.');
			}
			names.add(binding.name as string);
			nonNegativeInteger(binding.valueIndex, `${bindingLabel}.valueIndex`);
			const valueIndex = binding.valueIndex as number;
			usedValues.add(valueIndex);
			if (valueIndex > maxValue) maxValue = valueIndex;
		}
	}
	if (usedValues.size !== maxValue + 1) {
		fail(`${label}.nodes`, 'must reference a dense dynamic-value range.');
	}
	const eventNames = new Set<string>();
	for (let index = 0; index < events.length; index++) {
		const eventLabel = `${label}.events[${index}]`;
		const event = record(events[index], eventLabel);
		if (immutable && !Object.isFrozen(event)) immutable = false;
		exactKeys(event, TEMPLATE_PROGRAM_EVENT_KEYS, eventLabel);
		nonNegativeInteger(event.node, `${eventLabel}.node`);
		if ((event.node as number) >= nodes.length) {
			fail(`${eventLabel}.node`, 'must name a host inside the intrinsic program.');
		}
		nonEmptyString(event.type, `${eventLabel}.type`);
		if (
			event.priority !== 'discrete' &&
			event.priority !== 'continuous' &&
			event.priority !== 'default'
		) {
			fail(`${eventLabel}.priority`, 'must be discrete, continuous, or default.');
		}
		const key = `${event.node}:${event.type}`;
		if (eventNames.has(key)) {
			fail(eventLabel, 'repeats a native event on the same intrinsic host.');
		}
		eventNames.add(key);
	}
	const validated = { hosts: nodes.length, values: maxValue + 1, events: events.length };
	if (immutable) {
		if (state.lastTemplateProgram !== undefined) {
			const cache = (state.validatedTemplatePrograms ??= new WeakMap<
				object,
				LynxValidatedTemplateProgram
			>());
			cache.set(state.lastTemplateProgram, state.lastValidatedTemplateProgram!);
			cache.set(program, validated);
		}
		state.lastTemplateProgram = program;
		state.lastValidatedTemplateProgram = validated;
	}
	return validated;
}

function assertTemplateRangeCommand(
	command: Record<string, unknown>,
	index: number,
	state: LynxBatchValidationState,
): void {
	hostParent(command.parent, COMMANDS_LABEL, index, 'parent');
	if (command.parent !== null && typeof command.parent !== 'number') {
		fail(COMMANDS_LABEL, 'must not target a portal.', index, 'parent');
	}
	nullableHostId(command.before, COMMANDS_LABEL, index, 'before');
	positiveInteger(command.firstId, COMMANDS_LABEL, index, 'firstId');
	const program = assertTemplateProgram(command.program, index, state);
	const firstId = command.firstId as number;
	if (firstId > Number.MAX_SAFE_INTEGER - (program.hosts - 1)) {
		fail(COMMANDS_LABEL, 'overflows the safe host-ID range.', index, 'firstId');
	}
	const lastId = firstId + (program.hosts - 1);
	const starts = (state.templateRangeStarts ??= []);
	const ends = (state.templateRangeEnds ??= []);
	if (starts.length !== 0 && firstId <= ends[ends.length - 1]!) {
		for (let range = 0; range < starts.length; range++) {
			if (firstId <= ends[range]! && lastId >= starts[range]!) {
				fail(COMMANDS_LABEL, 'overlaps another intrinsic host range.', index, 'firstId');
			}
		}
	}
	if (state.templateNodeIds !== undefined) {
		for (const id of state.templateNodeIds) {
			if (id >= firstId && id <= lastId) {
				fail(COMMANDS_LABEL, 'overlaps a previously created template host.', index, 'firstId');
			}
		}
	}
	starts.push(firstId);
	ends.push(lastId);
	assertTemplateScalarValues(command.values, program.values, index);
	if (program.events === 0) {
		if (command.firstListenerId !== null) {
			fail(
				COMMANDS_LABEL,
				'must be null when the program has no events.',
				index,
				'firstListenerId',
			);
		}
	} else {
		positiveInteger(command.firstListenerId, COMMANDS_LABEL, index, 'firstListenerId');
		const firstListener = command.firstListenerId as number;
		if (firstListener > Number.MAX_SAFE_INTEGER - (program.events - 1)) {
			fail(COMMANDS_LABEL, 'overflows the safe event-listener range.', index, 'firstListenerId');
		}
		const lastListener = firstListener + (program.events - 1);
		const listenerStarts = (state.listenerRangeStarts ??= []);
		const listenerEnds = (state.listenerRangeEnds ??= []);
		if (listenerStarts.length !== 0 && firstListener <= listenerEnds[listenerEnds.length - 1]!) {
			for (let range = 0; range < listenerStarts.length; range++) {
				if (firstListener <= listenerEnds[range]! && lastListener >= listenerStarts[range]!) {
					fail(
						COMMANDS_LABEL,
						'overlaps another intrinsic event-listener range.',
						index,
						'firstListenerId',
					);
				}
			}
		}
		listenerStarts.push(firstListener);
		listenerEnds.push(lastListener);
	}
}

function assertTemplateRunCommand(
	command: Record<string, unknown>,
	index: number,
	state: LynxBatchValidationState,
): void {
	hostParent(command.parent, COMMANDS_LABEL, index, 'parent');
	if (command.parent !== null && typeof command.parent !== 'number') {
		fail(COMMANDS_LABEL, 'must not target a portal.', index, 'parent');
	}
	nullableHostId(command.before, COMMANDS_LABEL, index, 'before');
	positiveInteger(command.count, COMMANDS_LABEL, index, 'count');
	positiveInteger(command.firstId, COMMANDS_LABEL, index, 'firstId');
	const count = command.count as number;
	const program = assertTemplateProgram(command.program, index, state);
	const hostCount = count * program.hosts;
	if (!Number.isSafeInteger(hostCount)) {
		fail(COMMANDS_LABEL, 'overflows the intrinsic host count.', index, 'count');
	}
	const firstId = command.firstId as number;
	if (firstId > Number.MAX_SAFE_INTEGER - (hostCount - 1)) {
		fail(COMMANDS_LABEL, 'overflows the safe host-ID range.', index, 'firstId');
	}
	const lastId = firstId + (hostCount - 1);
	const starts = (state.templateRangeStarts ??= []);
	const ends = (state.templateRangeEnds ??= []);
	if (starts.length !== 0 && firstId <= ends[ends.length - 1]!) {
		for (let range = 0; range < starts.length; range++) {
			if (firstId <= ends[range]! && lastId >= starts[range]!) {
				fail(COMMANDS_LABEL, 'overlaps another intrinsic host range.', index, 'firstId');
			}
		}
	}
	if (state.templateNodeIds !== undefined) {
		for (const id of state.templateNodeIds) {
			if (id >= firstId && id <= lastId) {
				fail(COMMANDS_LABEL, 'overlaps a previously created template host.', index, 'firstId');
			}
		}
	}
	starts.push(firstId);
	ends.push(lastId);
	const valueCount = count * program.values;
	if (!Number.isSafeInteger(valueCount)) {
		fail(COMMANDS_LABEL, 'overflows the intrinsic dynamic-value count.', index, 'count');
	}
	assertTemplateScalarValues(command.values, valueCount, index);
	if (program.events === 0) {
		if (command.firstListenerId !== null) {
			fail(
				COMMANDS_LABEL,
				'must be null when the program has no events.',
				index,
				'firstListenerId',
			);
		}
		return;
	}
	positiveInteger(command.firstListenerId, COMMANDS_LABEL, index, 'firstListenerId');
	const eventCount = count * program.events;
	if (!Number.isSafeInteger(eventCount)) {
		fail(COMMANDS_LABEL, 'overflows the intrinsic event-listener count.', index, 'count');
	}
	const firstListener = command.firstListenerId as number;
	if (firstListener > Number.MAX_SAFE_INTEGER - (eventCount - 1)) {
		fail(COMMANDS_LABEL, 'overflows the safe event-listener range.', index, 'firstListenerId');
	}
	const lastListener = firstListener + (eventCount - 1);
	const listenerStarts = (state.listenerRangeStarts ??= []);
	const listenerEnds = (state.listenerRangeEnds ??= []);
	if (listenerStarts.length !== 0 && firstListener <= listenerEnds[listenerEnds.length - 1]!) {
		for (let range = 0; range < listenerStarts.length; range++) {
			if (firstListener <= listenerEnds[range]! && lastListener >= listenerStarts[range]!) {
				fail(
					COMMANDS_LABEL,
					'overlaps another intrinsic event-listener range.',
					index,
					'firstListenerId',
				);
			}
		}
	}
	listenerStarts.push(firstListener);
	listenerEnds.push(lastListener);
}

/** Fuse the hot range-command object and exact-schema trust checks in one own-key walk. */
function commandRecord(value: unknown, index: number): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		return fail(COMMANDS_LABEL, 'must be an object.', index);
	}
	if (!hasCrossRealmPlainPrototype(value)) {
		return fail(COMMANDS_LABEL, 'must be a plain object.', index);
	}
	const keys = Reflect.ownKeys(value);
	let operation: unknown;
	let orderedRange = keys.length === TEMPLATE_RANGE_KEYS.length;
	let orderedRun = keys.length === TEMPLATE_RUN_KEYS.length;
	for (let position = 0; position < keys.length; position++) {
		const key = keys[position]!;
		if (typeof key === 'symbol') {
			return fail(COMMANDS_LABEL, 'contains symbol fields.', index);
		}
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor === undefined) {
			fail(composePath(COMMANDS_LABEL, index), 'changed during validation.', undefined, key);
		}
		if (!descriptor.enumerable) {
			fail(composePath(COMMANDS_LABEL, index), 'must be enumerable.', undefined, key);
		}
		if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
			fail(composePath(COMMANDS_LABEL, index), 'must not be an accessor.', undefined, key);
		}
		if (key === 'op') operation = descriptor.value;
		if (orderedRange && key !== TEMPLATE_RANGE_KEYS[position]) orderedRange = false;
		if (orderedRun && key !== TEMPLATE_RUN_KEYS[position]) orderedRun = false;
	}
	const schema =
		operation === 'mount-template-range'
			? orderedRange
				? null
				: TEMPLATE_RANGE_KEYS
			: operation === 'mount-template-run'
				? orderedRun
					? null
					: TEMPLATE_RUN_KEYS
				: null;
	if (schema !== null) {
		for (const required of schema) {
			if (!keys.includes(required)) {
				fail(COMMANDS_LABEL, `is missing field ${JSON.stringify(required)}.`, index);
			}
		}
		for (const key of keys) {
			if (typeof key === 'string' && !schema.includes(key)) {
				fail(COMMANDS_LABEL, `contains unknown field ${JSON.stringify(key)}.`, index);
			}
		}
	}
	return value as Record<string, unknown>;
}

function assertCommand(
	value: unknown,
	index: number,
	state: LynxBatchValidationState,
): asserts value is UniversalHostCommand {
	// One call per accepted host node. Every path below is composed lazily.
	const label = COMMANDS_LABEL;
	const command = commandRecord(value, index);
	if (typeof command.op !== 'string') fail(label, 'must be a string.', index, 'op');
	switch (command.op) {
		case 'mount-template-run':
			assertTemplateRunCommand(command, index, state);
			return;
		case 'ensure-public-instance':
			exactKeys(command, DESTROY_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			return;
		case 'mount-template-range':
			assertTemplateRangeCommand(command, index, state);
			return;
		case 'mount-template':
			assertTemplateCommand(command, index, state);
			return;
		case 'create':
			exactKeys(command, CREATE_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			nonEmptyString(command.type, label, index, 'type');
			assertProps(command.props, label, index, 'props', state);
			return;
		case 'update':
			exactKeys(command, UPDATE_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			assertProps(command.props, label, index, 'props', state);
			return;
		case 'recreate':
			exactKeys(command, CREATE_KEYS, label, index);
			positiveInteger(command.id, label, index, 'id');
			nonEmptyString(command.type, label, index, 'type');
			assertProps(command.props, label, index, 'props', state);
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
		case 'destroy-run':
			exactKeys(command, DESTROY_RUN_KEYS, label, index);
			hostParent(command.parent, label, index, 'parent');
			positiveInteger(command.firstId, label, index, 'firstId');
			positiveInteger(command.count, label, index, 'count');
			positiveInteger(command.width, label, index, 'width');
			if (
				typeof command.firstId === 'number' &&
				typeof command.count === 'number' &&
				typeof command.width === 'number' &&
				command.firstId > Number.MAX_SAFE_INTEGER - (command.count * command.width - 1)
			) {
				fail(label, 'exceeds the safe host id range.', index, 'count');
			}
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
	const validationState: LynxBatchValidationState = {};
	for (let index = 0; index < batch.commands.length; index++) {
		assertCommand(batch.commands[index], index, validationState);
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
	index: number,
): void {
	const value = record(snapshot, label, index, 'snapshot');
	for (const name of Object.keys(value)) {
		const child = value[name];
		if (!isWireLeaf(child)) {
			assertWireValue(child, `${composePath(label, index, 'snapshot')}.${name}`);
		}
	}
	if (value.$$kind !== 'octane.lynx.element') {
		fail(label, 'does not match the handle envelope.', index, 'snapshot.$$kind');
	}
	if (value.renderer !== LYNX_TRANSPORT_RENDERER) {
		fail(label, 'does not match the handle envelope.', index, 'snapshot.renderer');
	}
	if (value.root !== identity.root) {
		fail(label, 'does not match the handle envelope.', index, 'snapshot.root');
	}
	if (value.id !== delta.id) {
		fail(label, 'does not match the handle envelope.', index, 'snapshot.id');
	}
	if (value.type !== delta.type) {
		fail(label, 'does not match the handle envelope.', index, 'snapshot.type');
	}
	if (value.generation !== delta.generation) {
		fail(label, 'does not match the handle envelope.', index, 'snapshot.generation');
	}
}

const UPSERT_HANDLE_KEYS = Object.freeze([
	'op',
	'id',
	'type',
	'generation',
	'attached',
	'listDescendant',
	'snapshot',
]);
const LIST_ANCESTRY_HANDLE_KEYS = Object.freeze(['op', 'id', 'generation', 'listDescendant']);
const REMOVE_HANDLE_KEYS = Object.freeze(['op', 'id', 'generation']);
const REMOVE_RUN_HANDLE_KEYS = Object.freeze(['op', 'firstId', 'hostCount', 'generation']);

function assertHandleDelta(
	value: unknown,
	index: number,
	identity: UniversalTransportIdentity,
): asserts value is LynxPublicHandleDelta {
	const label = 'ack.handles';
	const delta = record(value, label, index);
	if (delta.op === 'upsert') {
		exactKeys(delta, UPSERT_HANDLE_KEYS, label, index);
		positiveInteger(delta.id, label, index, 'id');
		nonEmptyString(delta.type, label, index, 'type');
		positiveInteger(delta.generation, label, index, 'generation');
		if (typeof delta.attached !== 'boolean') {
			fail(label, 'must be a boolean.', index, 'attached');
		}
		if (typeof delta.listDescendant !== 'boolean') {
			fail(label, 'must be a boolean.', index, 'listDescendant');
		}
		assertSnapshotIdentity(delta.snapshot, delta, identity, label, index);
		return;
	}
	if (delta.op === 'list-ancestry') {
		exactKeys(delta, LIST_ANCESTRY_HANDLE_KEYS, label, index);
		positiveInteger(delta.id, label, index, 'id');
		positiveInteger(delta.generation, label, index, 'generation');
		if (typeof delta.listDescendant !== 'boolean') {
			fail(label, 'must be a boolean.', index, 'listDescendant');
		}
		return;
	}
	if (delta.op === 'remove') {
		exactKeys(delta, REMOVE_HANDLE_KEYS, label, index);
		positiveInteger(delta.id, label, index, 'id');
		positiveInteger(delta.generation, label, index, 'generation');
		return;
	}
	if (delta.op === 'remove-run') {
		exactKeys(delta, REMOVE_RUN_HANDLE_KEYS, label, index);
		positiveInteger(delta.firstId, label, index, 'firstId');
		positiveInteger(delta.hostCount, label, index, 'hostCount');
		positiveInteger(delta.generation, label, index, 'generation');
		if (
			typeof delta.firstId === 'number' &&
			typeof delta.hostCount === 'number' &&
			delta.firstId > Number.MAX_SAFE_INTEGER - (delta.hostCount - 1)
		) {
			fail(label, 'exceeds the safe host id range.', index, 'hostCount');
		}
		return;
	}
	fail(label, `uses unsupported operation ${JSON.stringify(delta.op)}.`, index, 'op');
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
	const hasCapabilities = reply && Object.prototype.hasOwnProperty.call(message, 'capabilities');
	exactKeys(
		message,
		[
			'protocol',
			'renderer',
			'type',
			'request',
			...(hasFirstTree ? ['firstTree'] : []),
			...(hasCapabilities ? ['capabilities'] : []),
		],
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
	if (hasCapabilities) {
		if ((message.request as number) < LYNX_CAPABILITY_READY_REQUEST_BASE) {
			fail(`${label}.capabilities`, 'requires a capability-tagged readiness request.');
		}
		const capabilities = record(message.capabilities, `${label}.capabilities`);
		const hasTemplateMount = Object.prototype.hasOwnProperty.call(capabilities, 'templateMount');
		const hasTemplateProgram = Object.prototype.hasOwnProperty.call(
			capabilities,
			'templateProgram',
		);
		const hasLazyPublicInstances = Object.prototype.hasOwnProperty.call(
			capabilities,
			'lazyPublicInstances',
		);
		const hasTemplateRuns = Object.prototype.hasOwnProperty.call(capabilities, 'templateRuns');
		const hasTeardownRuns = Object.prototype.hasOwnProperty.call(capabilities, 'teardownRuns');
		exactKeys(
			capabilities,
			[
				'compactAck',
				...(hasTemplateMount ? ['templateMount'] : []),
				...(hasTemplateProgram ? ['templateProgram'] : []),
				...(hasLazyPublicInstances ? ['lazyPublicInstances'] : []),
				...(hasTemplateRuns ? ['templateRuns'] : []),
				...(hasTeardownRuns ? ['teardownRuns'] : []),
			],
			`${label}.capabilities`,
		);
		if (capabilities.compactAck !== 1) {
			fail(`${label}.capabilities.compactAck`, 'must be 1.');
		}
		if (hasTemplateMount && capabilities.templateMount !== 1) {
			fail(`${label}.capabilities.templateMount`, 'must be 1.');
		}
		if (hasTemplateProgram && capabilities.templateProgram !== 1) {
			fail(`${label}.capabilities.templateProgram`, 'must be 1.');
		}
		if (hasTemplateProgram && !hasTemplateMount) {
			fail(`${label}.capabilities.templateProgram`, 'requires the templateMount capability.');
		}
		if (hasLazyPublicInstances && capabilities.lazyPublicInstances !== 1) {
			fail(`${label}.capabilities.lazyPublicInstances`, 'must be 1.');
		}
		if (hasLazyPublicInstances && !hasTemplateProgram) {
			fail(`${label}.capabilities.lazyPublicInstances`, 'requires the templateProgram capability.');
		}
		if (
			hasLazyPublicInstances &&
			(message.request as number) < LYNX_LAZY_PUBLIC_INSTANCE_READY_REQUEST_BASE
		) {
			fail(
				`${label}.capabilities.lazyPublicInstances`,
				'requires a lazy-public-instance readiness request.',
			);
		}
		if (hasTemplateRuns && capabilities.templateRuns !== 1) {
			fail(`${label}.capabilities.templateRuns`, 'must be 1.');
		}
		if (hasTemplateRuns && !hasTemplateProgram) {
			fail(`${label}.capabilities.templateRuns`, 'requires the templateProgram capability.');
		}
		if (hasTemplateRuns && (message.request as number) < LYNX_TEMPLATE_RUN_READY_REQUEST_BASE) {
			fail(`${label}.capabilities.templateRuns`, 'requires a template-run readiness request.');
		}
		if (hasTeardownRuns && capabilities.teardownRuns !== 1) {
			fail(`${label}.capabilities.teardownRuns`, 'must be 1.');
		}
		if (hasTeardownRuns && !hasTemplateProgram) {
			fail(`${label}.capabilities.teardownRuns`, 'requires the templateProgram capability.');
		}
		if (hasTeardownRuns && (message.request as number) < LYNX_TEARDOWN_RUN_READY_REQUEST_BASE) {
			fail(`${label}.capabilities.teardownRuns`, 'requires a teardown-run readiness request.');
		}
	}
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
		const hasCompactAck = Object.prototype.hasOwnProperty.call(message, 'ack');
		const hasLazyPublicInstances = Object.prototype.hasOwnProperty.call(message, 'instances');
		exactKeys(
			message,
			[
				'protocol',
				'renderer',
				'root',
				'version',
				'type',
				'batch',
				...(hasCompactAck ? ['ack'] : []),
				...(hasLazyPublicInstances ? ['instances'] : []),
			],
			'commit',
		);
		if (hasCompactAck && message.ack !== LYNX_COMPACT_ACKNOWLEDGEMENT) {
			fail('commit.ack', `must be ${JSON.stringify(LYNX_COMPACT_ACKNOWLEDGEMENT)}.`);
		}
		if (hasLazyPublicInstances && message.instances !== LYNX_LAZY_PUBLIC_INSTANCES) {
			fail('commit.instances', `must be ${JSON.stringify(LYNX_LAZY_PUBLIC_INSTANCES)}.`);
		}
		if (hasLazyPublicInstances && !hasCompactAck) {
			fail('commit.instances', 'requires a compact acknowledgement.');
		}
		assertBatch(message.batch, message);
		return message as unknown as LynxTransportCommitMessage;
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
		if (Object.prototype.hasOwnProperty.call(message, 'encoding')) {
			exactKeys(
				message,
				['protocol', 'renderer', 'root', 'version', 'type', 'encoding', 'count'],
				'ack',
			);
			if (message.encoding !== LYNX_COMPACT_ACKNOWLEDGEMENT) {
				fail('ack.encoding', `must be ${JSON.stringify(LYNX_COMPACT_ACKNOWLEDGEMENT)}.`);
			}
			positiveInteger(message.count, 'ack.count');
			if ((message.count as number) < LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS) {
				fail('ack.count', `must be at least ${LYNX_COMPACT_ACKNOWLEDGEMENT_MIN_HOSTS}.`);
			}
			return message as unknown as LynxCompactTransportAcknowledgement;
		}
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
		return message as unknown as LynxLegacyTransportAcknowledgement;
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
