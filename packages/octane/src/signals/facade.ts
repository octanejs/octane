import { formatClientError } from '../error-codes.client.generated.js';
import {
	acceptScopeStreamedResult,
	bindScopeStreamedSelection,
	createDeclaredSignalCell,
	createScope,
	failScopeStreamedResult,
	signalDeclarationSequence,
	ScopeImpl,
} from './engine.js';
import { createDeclaredScalarCell } from './scalar-computations.js';
import { ScopeDisposedError, SignalStreamError } from './errors.js';
import { scopeStreams } from './scope-streams.js';
import {
	isDeclarationView,
	isRetiredDeclarationView,
	isThenable,
	readSignalBinding as readBinding,
	untrack,
} from './graph.js';
import { readEarlySignalValue } from './early-values.js';
import { currentSignalDeclarationPath } from './declaration-path.js';
import { NATIVE_DOM_VALUE, forwardNativeTransitionConsumer } from './read-protocol.js';
import { isSignalHandle } from './handle-protocol.js';

export { isSignalHandle, isWritableSignal } from './handle-protocol.js';
import {
	captureSignalOwner,
	currentExplicitSignalOwner,
	currentSignalOwner,
	installSignalOwnerRetirement,
	runWithSignalOwner,
} from './owner-context.js';
import {
	SIGNAL_HANDLE,
	SIGNAL_BINDING_IDENTITY,
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
	SIGNAL_OWNER_RESOLVE,
	type DerivedCompute,
	type DerivedOptions,
	type DerivedSignal,
	type OwnerBoundSignal,
	type Scope,
	type ScopeSeed,
	type SignalHandle,
	type SignalOptions,
	type SignalOwner,
	type SignalOwnerIdentity,
	type SignalRendererOwnerIdentity,
	type SignalSnapshot,
	type WritableSignal,
} from './types.js';
import type {
	StreamFrameIdentity,
	StreamedSignalResultFrame,
} from '../streamed-signals-protocol.js';

const identityScopes = new WeakMap<object, Scope>();
const scopeOwners = new WeakMap<Scope, SignalOwner>();
const retiredIdentities = new WeakSet<object>();
const documentInstances = new WeakMap<object, Set<object>>();
const instanceDocuments = new WeakMap<object, object>();
const frozenDocuments = new WeakMap<object, Promise<void>>();

function isScope(owner: SignalOwner): owner is Scope {
	return typeof (owner as Scope).signal$ === 'function';
}

function isRendererOwner(owner: SignalOwner): owner is SignalRendererOwnerIdentity {
	return (
		'documentOwner' in owner &&
		'instanceOwner' in owner &&
		typeof (owner as SignalRendererOwnerIdentity).instanceKey === 'string'
	);
}

function resolveIdentity(identity: object, scopeKey: string, owner: SignalOwner): Scope {
	if (retiredIdentities.has(identity)) throw new ScopeDisposedError(scopeKey);
	let scope = identityScopes.get(identity);
	if (!scope) {
		scope = createScope({ scopeKey });
		identityScopes.set(identity, scope);
		scopeOwners.set(scope, owner);
		const barrier = frozenDocuments.get(isRendererOwner(owner) ? owner.documentOwner : owner);
		if (barrier !== undefined) (scope as ScopeImpl).readBarrier = barrier;
	}
	return scope;
}

/** @internal Install initial response data before this document creates any live cells. */
export function initializeDocumentSignalOwner(owner: SignalOwnerIdentity, seed: ScopeSeed): void {
	if (isScope(owner) || isRendererOwner(owner)) {
		throw new TypeError(formatClientError(155));
	}
	if (retiredIdentities.has(owner)) throw new ScopeDisposedError(owner.scopeKey);
	if (identityScopes.has(owner)) {
		throw new Error(formatClientError(156));
	}
	// createScope validates and copies the seed before publishing any ownership.
	const scope = createScope({ scopeKey: owner.scopeKey, seed });
	const barrier = frozenDocuments.get(owner);
	if (barrier !== undefined) (scope as ScopeImpl).readBarrier = barrier;
	identityScopes.set(owner, scope);
	scopeOwners.set(scope, owner);
}

function resolveOwner(owner: SignalOwner): Scope {
	if (isScope(owner)) return owner;
	if (isRendererOwner(owner)) {
		if (!isScope(owner.documentOwner) && retiredIdentities.has(owner.documentOwner)) {
			throw new ScopeDisposedError(owner.documentOwner.scopeKey);
		}
		if (isScope(owner.documentOwner) && owner.documentOwner.retired) {
			throw new ScopeDisposedError(owner.documentOwner.scopeKey);
		}
		let instances = documentInstances.get(owner.documentOwner);
		if (!instances) documentInstances.set(owner.documentOwner, (instances = new Set()));
		instances.add(owner.instanceOwner);
		instanceDocuments.set(owner.instanceOwner, owner.documentOwner);
		const documentKey = owner.documentOwner.scopeKey;
		return resolveIdentity(
			owner.instanceOwner,
			`${documentKey}:instance:${owner.instanceKey}`,
			owner,
		);
	}
	return resolveIdentity(owner, owner.scopeKey, owner);
}

function resolveDescriptorOwner(site: string | undefined, owner: SignalOwner): Scope {
	if (isScope(owner)) owner = scopeOwners.get(owner) ?? owner;
	if (!isRendererOwner(owner)) return resolveOwner(owner);
	if (site?.startsWith('g:')) return resolveOwner(owner.documentOwner);
	if (site?.startsWith('i:')) {
		return resolveOwner(owner);
	}
	return resolveOwner(owner);
}

function existingIdentityScope(identity: object): Scope | undefined {
	if (retiredIdentities.has(identity)) return;
	const scope = identityScopes.get(identity);
	return scope?.retired ? undefined : scope;
}

function streamedScope(
	owner: SignalOwner,
	identity: StreamFrameIdentity,
	create: boolean,
): Scope | undefined {
	if (isScope(owner)) {
		return !owner.retired && identity.ownerKey === owner.scopeKey ? owner : undefined;
	}
	if (!isRendererOwner(owner)) return;
	if (
		identity.ownerKey !== owner.documentOwner.scopeKey ||
		identity.instanceKey !== owner.instanceKey ||
		(!identity.nodeKey.startsWith('g:') && !identity.nodeKey.startsWith('i:'))
	) {
		return;
	}
	const documentRetired = isScope(owner.documentOwner)
		? owner.documentOwner.retired
		: retiredIdentities.has(owner.documentOwner);
	if (documentRetired || retiredIdentities.has(owner.instanceOwner)) return;
	const target: SignalOwner = identity.nodeKey.startsWith('g:') ? owner.documentOwner : owner;
	if (create) return resolveDescriptorOwner(identity.nodeKey, target);
	if (isScope(target)) return target.retired ? undefined : target;
	return existingIdentityScope(isRendererOwner(target) ? target.instanceOwner : target);
}

installSignalOwnerRetirement((owner) => {
	if (isScope(owner)) return;
	const identity = isRendererOwner(owner) ? owner.instanceOwner : owner;
	if (isRendererOwner(owner)) {
		const document = instanceDocuments.get(identity);
		if (document) documentInstances.get(document)?.delete(identity);
		instanceDocuments.delete(identity);
	} else {
		const instances = documentInstances.get(identity);
		if (instances) {
			for (const instance of instances) {
				retiredIdentities.add(instance);
				const instanceScope = identityScopes.get(instance);
				if (instanceScope) {
					identityScopes.delete(instance);
					scopeOwners.delete(instanceScope);
					instanceScope.dispose();
				}
				instanceDocuments.delete(instance);
			}
			documentInstances.delete(identity);
		}
	}
	retiredIdentities.add(identity);
	const scope = identityScopes.get(identity);
	if (!scope) return;
	identityScopes.delete(identity);
	scopeOwners.delete(scope);
	scope.dispose();
}, supersedeOwner);

/** A query$ re-selects from new render inputs; a writable or asynchronous derived cell cannot. */
function supersedeOwner(owner: SignalOwner): boolean {
	const identity = (owner as SignalRendererOwnerIdentity).instanceOwner;
	if (retiredIdentities.has(identity)) return false;
	const scope = identityScopes.get(identity) as ScopeImpl | undefined;
	if (scope?.unkeyedState) return false;
	scope?.supersede();
	return true;
}

/** @internal A document may freeze read work without retiring data or accepted writes. */
export function createSignalOwnerLifecycle(owner: SignalOwner) {
	if (isRendererOwner(owner)) throw new TypeError(formatClientError(157));
	let barrier: Promise<void> | undefined;
	let release: (() => void) | undefined;
	let disposed = false;
	const scopes = (): ScopeImpl[] => {
		const result: ScopeImpl[] = [];
		const scope = isScope(owner) ? owner : existingIdentityScope(owner);
		if (scope instanceof ScopeImpl && !scope.retired) result.push(scope);
		for (const instance of documentInstances.get(owner) ?? []) {
			const scope = existingIdentityScope(instance);
			if (scope instanceof ScopeImpl) result.push(scope);
		}
		return result;
	};
	return {
		get retired() {
			return disposed || (isScope(owner) ? owner.retired : retiredIdentities.has(owner));
		},
		freeze() {
			if (this.retired || barrier !== undefined) return;
			barrier = new Promise<void>((resolve) => {
				release = resolve;
			});
			frozenDocuments.set(owner, barrier);
			const existing = scopes();
			// Mark the whole document before abort handlers can cross instance scopes.
			for (const scope of existing) scope.readBarrier = barrier;
			for (const scope of existing) scope.suspendReads();
		},
		resume() {
			if (this.retired || barrier === undefined) return;
			const existing = scopes();
			barrier = undefined;
			frozenDocuments.delete(owner);
			for (const scope of existing) scope.readBarrier = undefined;
			release?.();
			release = undefined;
			for (const scope of existing) {
				if (barrier !== undefined || this.retired) break;
				scope.resumeReads();
			}
		},
		retire() {
			if (disposed) return;
			disposed = true;
			frozenDocuments.delete(owner);
			const existing = scopes();
			// Facade retirement also prevents a later descriptor from creating a new scope.
			for (const instance of documentInstances.get(owner) ?? []) retiredIdentities.add(instance);
			retiredIdentities.add(owner);
			for (const scope of existing) scope.dispose();
			documentInstances.delete(owner);
			release?.();
			release = undefined;
			barrier = undefined;
		},
	};
}

function requireOwner(): SignalOwner {
	const owner = currentSignalOwner();
	if (!owner) {
		throw new Error(formatClientError(158));
	}
	return owner;
}

/** @internal Resolve a public descriptor in the current declaration owner. */
export function resolveCurrentSignalHandle<T>(handle$: SignalHandle<T>): SignalHandle<T> {
	return resolveSignalHandleForOwner(handle$, requireOwner());
}

/** @internal Resolve a descriptor against a captured renderer/request owner. */
export function resolveSignalHandleForOwner<T>(
	handle$: SignalHandle<T>,
	owner: SignalOwner,
): SignalHandle<T> {
	return resolveSignalHandleForScope(handle$, resolveOwner(owner));
}

/** @internal Resolve a descriptor against an already selected signal scope. */
export function resolveSignalHandleForScope<T>(
	handle$: SignalHandle<T>,
	owner: Scope,
): SignalHandle<T> {
	return SIGNAL_OWNER_RESOLVE in (handle$ as object)
		? (handle$ as OwnerBoundSignal<T>)[SIGNAL_OWNER_RESOLVE](owner)
		: handle$;
}

function requireSite(site: string | undefined): string {
	if (site) return site;
	throw new Error(formatClientError(159));
}

/** The renderer instance or inline row that evaluated an instance declaration. */
function declarationOwner(site: string | undefined): SignalRendererOwnerIdentity | undefined {
	if (!site?.startsWith('i:')) return;
	let owner = currentExplicitSignalOwner();
	if (owner === null) return;
	if (isScope(owner)) owner = scopeOwners.get(owner) ?? owner;
	return isRendererOwner(owner) ? owner : undefined;
}

/**
 * A component that receives a handle owns its cell, but its directive arms and
 * inline rows are part of its template: they own only the declarations they
 * evaluate. Reading a handle declared by an enclosing owner resolves that
 * owner's cell, and any other handle the component's cell, so one declaration
 * and selection is not repeated for every arm or row.
 */
function readerOwner(
	declared: SignalRendererOwnerIdentity | undefined,
	reader: SignalOwner,
): SignalOwner {
	if (declared === undefined || declared === reader) return reader;
	let owner = isScope(reader) ? (scopeOwners.get(reader) ?? reader) : reader;
	if (owner === declared || !isRendererOwner(owner)) return owner;
	for (let enclosing = owner.enclosingOwner; enclosing !== undefined;) {
		if (enclosing === declared) return declared;
		owner = enclosing;
		enclosing = enclosing.enclosingOwner;
	}
	return owner;
}

/** @internal Shared owner resolution for statically selected signal factories. */
export abstract class Descriptor<T, H extends SignalHandle<T>> implements OwnerBoundSignal<T> {
	readonly [SIGNAL_HANDLE] = true as const;
	private readonly cells = new WeakMap<Scope, H>();
	// Identity-only token: renderer owners never retain their renderer tree.
	private readonly owner: SignalRendererOwnerIdentity | undefined;
	/** A render's private presentation of a redeclared cell, until it is accepted or released. */
	declare private view?: H;
	declare private viewOwner?: Scope;

	constructor(
		readonly key: string,
		readonly kind: H['kind'],
		private readonly create: (owner: Scope) => H,
		private readonly site: string | undefined,
	) {
		this.owner = declarationOwner(site);
	}

	[SIGNAL_OWNER_RESOLVE](owner: Scope): H {
		requireSite(this.site);
		return this.resolvedCell(resolveDescriptorOwner(this.site, readerOwner(this.owner, owner)));
	}

	private resolvedCell(target: Scope): H {
		let cell = this.cells.get(target);
		if (!cell) {
			// An accepted view resolves to its canonical cell from now on. A render
			// declares in one owner, so one slot covers the common case; another
			// owner's view is found again through its cell's staged declaration.
			const view = this.view;
			if (view !== undefined && this.viewOwner === target && !isRetiredDeclarationView(view))
				return view;
			cell = this.create(target);
			if (isDeclarationView(cell)) {
				this.view = cell;
				this.viewOwner = target;
			} else this.cells.set(target, cell);
		}
		return cell;
	}

	protected resolve(): H {
		const token = readerOwner(this.owner, requireOwner());
		const owner = resolveDescriptorOwner(this.site, token);
		// This path already normalized the owner. Retain its validation order,
		// but do not repeat document/instance routing for every cached read.
		requireSite(this.site);
		return this.resolvedCell(owner);
	}

	get(): T {
		return this.resolve().get();
	}

	[NATIVE_DOM_VALUE](): T {
		// Native styles belong to the active renderer read frame. Unlike targeted
		// binding reads, they must retain observation and historical seed evidence.
		return this.get();
	}

	[SIGNAL_BINDING_READ](): T {
		return readBinding(this.resolve());
	}

	[SIGNAL_BINDING_SUBSCRIBE](notify: () => void, onRetire?: () => void): () => void {
		const run = captureSignalOwner(requireOwner());
		return this.resolve()[SIGNAL_BINDING_SUBSCRIBE](
			forwardNativeTransitionConsumer(notify, () => run(notify)),
			onRetire === undefined ? undefined : () => run(onRetire),
		);
	}

	[SIGNAL_BINDING_IDENTITY]() {
		return {
			scope: this.site?.startsWith('g:') ? ('document' as const) : ('instance' as const),
			nodeKey: this.key,
		};
	}

	latest(): T | undefined;
	latest<F>(fallback: F): T | F;
	latest<F>(fallback?: F): T | F | undefined {
		return this.resolve().latest(fallback);
	}

	snapshot(): SignalSnapshot<T> {
		return this.resolve().snapshot();
	}

	subscribe(notify: () => void): () => void {
		const token = requireOwner();
		const scope = resolveDescriptorOwner(this.site, readerOwner(this.owner, token));
		const run = captureSignalOwner(token);
		return this[SIGNAL_OWNER_RESOLVE](scope).subscribe(
			forwardNativeTransitionConsumer(notify, () => run(notify)),
		);
	}
}

class SignalDescriptor<T> extends Descriptor<T, WritableSignal<T>> implements WritableSignal<T> {
	declare readonly kind: 'signal';

	set(value: T | ((previous: T) => T)): void {
		this.resolve().set(value);
	}
}

/** @internal Scalar and general derivations share the same public handle. */
export class DerivedDescriptor<T>
	extends Descriptor<T, DerivedSignal<T>>
	implements DerivedSignal<T>
{
	declare readonly kind: 'derived';
}

/** @internal Preserve authored or compiler-assigned declaration identity. */
export function descriptorKey(site: string | undefined, explicit: string | undefined): string {
	const key = explicit ?? site;
	if (typeof key !== 'string' || !key.trim()) return '<compiler-assigned-signal>';
	return key;
}

/**
 * @internal An instance declaration reached through compiled custom-hook calls
 * belongs to that call path. An explicit key replaces the declaration site, not
 * the path, so each call of one hook still owns its own cell.
 */
export function declarationKey(site: string | undefined, key: string): string {
	return site?.startsWith('i:') ? key + currentSignalDeclarationPath() : key;
}

/** @internal Read authored identity once, without interpreting initial data as a key. */
export function signalOptionsKey(options?: SignalOptions): string | undefined {
	if (options != null && typeof options !== 'object') {
		throw new TypeError(formatClientError(160));
	}
	const key = options?.key;
	if (key !== undefined && (typeof key !== 'string' || !key.trim())) {
		throw new TypeError(formatClientError(161));
	}
	return key;
}

export function __signalAt<T>(
	site: string | undefined,
	initial: T,
	options?: SignalOptions,
): WritableSignal<T> {
	const explicit = signalOptionsKey(options);
	site ??= explicit;
	const key = declarationKey(site, descriptorKey(site, explicit));
	return new SignalDescriptor(
		key,
		'signal',
		(owner) => {
			const early = readEarlySignalValue(scopeOwners.get(owner) ?? owner, {
				scope: site?.startsWith('g:') ? 'document' : 'instance',
				nodeKey: key,
			});
			// The first declaration's initial value wins, so the cell cannot follow
			// a superseding render's inputs the way a query$ selection does.
			(owner as ScopeImpl).unkeyedState = true;
			return createDeclaredSignalCell(
				owner,
				key,
				early === undefined ? initial : (early.value as T),
				early !== undefined,
			);
		},
		site,
	);
}

export function signal$<T>(initial: T, options?: SignalOptions): WritableSignal<T> {
	return __signalAt(undefined, initial, options);
}

/** Compiler-only scalar proof; authored derived$ remains dynamically asynchronous. */
export function __derivedScalarAt<T>(
	site: string | undefined,
	compute: DerivedCompute<T>,
	options?: DerivedOptions & SignalOptions,
	captures?: readonly unknown[],
): DerivedSignal<T> {
	if (typeof compute !== 'function') throw new TypeError(formatClientError(122));
	const explicit = signalOptionsKey(options);
	site ??= explicit;
	const key = declarationKey(site, descriptorKey(site, explicit));
	const sequence = signalDeclarationSequence(site);
	return new DerivedDescriptor(
		key,
		'derived',
		(owner) =>
			createDeclaredScalarCell(
				owner,
				key,
				() => runWithSignalOwner(owner, () => (compute as () => T)()),
				sequence,
				captures,
			),
		site,
	);
}

export function readSignalBinding<T>(handle$: SignalHandle<T>): T {
	if (!isSignalHandle(handle$)) throw new TypeError(formatClientError(162));
	return handle$[SIGNAL_BINDING_READ]();
}

/** @internal Start compiler-proven independent reads without consuming their results. */
export function __startSignalReads(
	handles: readonly SignalHandle<unknown>[],
	primitive = false,
): void {
	untrack(() => {
		for (const handle of handles) {
			try {
				const value = handle[SIGNAL_BINDING_READ]();
				// JSX consumes each value before its next hole. Do not move a later
				// start ahead of user coercion or interpretation of an opaque child.
				if (
					primitive &&
					value != null &&
					(typeof value === 'object' || typeof value === 'function' || typeof value === 'symbol')
				)
					break;
			} catch (error) {
				// A pending predecessor must not hide later independent work. A real
				// error ends the reachable stratum; the original read throws it in
				// source order, with its normal tracking and boundary semantics.
				if (!isThenable(error)) break;
			}
		}
	});
}

/** Bind receiver-owned selection authority, optionally before the query descriptor resolves. */
export function bindStreamedSignalSelection(
	owner: SignalOwner,
	identity: StreamFrameIdentity,
): boolean {
	const scope = streamedScope(owner, identity, true);
	return scope ? bindScopeStreamedSelection(scope, identity) : false;
}

/** Accept one already-validated result frame without reviving a retired owner. */
export function acceptStreamedSignalResult(
	owner: SignalOwner,
	frame: StreamedSignalResultFrame,
): boolean {
	const scope = streamedScope(owner, frame.identity, false);
	return scope ? acceptScopeStreamedResult(scope, frame) : false;
}

/** Fail one exact result channel without exposing an untrusted remote stack. */
export function failStreamedSignalResult(
	owner: SignalOwner,
	identity: StreamFrameIdentity,
	code: string,
): boolean {
	const scope = streamedScope(owner, identity, false);
	return scope ? failScopeStreamedResult(scope, identity, new SignalStreamError(code)) : false;
}

interface StreamedSignalReceiver {
	attachResult(
		identity: StreamFrameIdentity,
		consumer: {
			accept(frame: StreamedSignalResultFrame): void | false;
			retainCompleted?(frames: StreamedSignalResultFrame[]): boolean;
			fail(error: any): void;
		},
	): () => void;
}

function receiverErrorCode(error: unknown): string {
	if (
		error &&
		(typeof error === 'object' || typeof error === 'function') &&
		typeof (error as { code?: unknown }).code === 'string'
	) {
		return (error as { code: string }).code;
	}
	return 'receiver';
}

/** Connect a neutral early receiver to the signals engine without a hydration dependency. */
export function attachStreamedSignalResult(
	receiver: StreamedSignalReceiver,
	owner: SignalOwner,
	identity: StreamFrameIdentity,
): () => void {
	const scope = streamedScope(owner, identity, true);
	if (!(scope instanceof ScopeImpl) || !bindScopeStreamedSelection(scope, identity))
		throw new SignalStreamError('identity');
	const streams = scopeStreams(scope);
	const fail = (error: unknown): void => {
		failStreamedSignalResult(owner, identity, receiverErrorCode(error));
	};
	const consumer = {
		accept(frame: StreamedSignalResultFrame): void | false {
			if (acceptStreamedSignalResult(owner, frame)) return;
			// Only a still-authorized selector waiting on its dependencies may
			// defer. Bad sequence/resource/attempt frames still fail closed.
			if (streams.isPending(frame.identity)) return false;
			fail(new SignalStreamError('identity'));
			throw new SignalStreamError('identity');
		},
		retainCompleted(frames: StreamedSignalResultFrame[]): boolean {
			return streams.retainCompleted(identity, frames);
		},
		fail,
	};
	try {
		let detach = receiver.attachResult(identity, consumer);
		const stopWaiting = streams.whenReady(identity, () => {
			detach = receiver.attachResult(identity, consumer);
		});
		return () => {
			stopWaiting();
			detach();
		};
	} catch (error) {
		fail(error);
		throw error;
	}
}
