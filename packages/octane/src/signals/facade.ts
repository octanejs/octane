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
import {
	NATIVE_DOM_VALUE,
	SIGNAL_SAME_CAPTURE,
	currentSignalDeclarationInvocation,
	forwardNativeTransitionConsumer,
} from './read-protocol.js';
import { isSignalHandle } from './handle-protocol.js';
import { runAsDeclaredServerSignalReader as readAsDeclared } from './query-attempt-observer.js';

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
	SIGNAL_BINDING_RETIRED,
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
		const documentKey = owner.documentOwner.scopeKey;
		// Refuse a retired instance, which a kept callback can still name, before
		// registering it with its document again.
		const scope = resolveIdentity(
			owner.instanceOwner,
			`${documentKey}:instance:${owner.instanceKey}`,
			owner,
		);
		let instances = documentInstances.get(owner.documentOwner);
		if (!instances) documentInstances.set(owner.documentOwner, (instances = new Set()));
		instances.add(owner.instanceOwner);
		instanceDocuments.set(owner.instanceOwner, owner.documentOwner);
		return scope;
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

/**
 * @internal A retirement probe for a handle that resolves through an owner. Owner
 * resolution refuses a retired document or instance identity, and only that,
 * with ScopeDisposedError; the probe reads the refusal as its handle's own
 * retirement and returns `undefined`.
 */
export function resolveUnlessRetired<T>(resolve: () => T): T | undefined {
	try {
		return resolve();
	} catch (error) {
		if (error instanceof ScopeDisposedError) return undefined;
		throw error;
	}
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

type DescriptorClass<T, H extends SignalHandle<T>> = new (
	key: string,
	kind: H['kind'],
	create: (owner: Scope, declaring: number) => H,
	site: string | undefined,
	declared: Descriptor<T, H>,
) => Descriptor<T, H>;

/** @internal Shared owner resolution for statically selected signal factories. */
export abstract class Descriptor<T, H extends SignalHandle<T>> implements OwnerBoundSignal<T> {
	readonly [SIGNAL_HANDLE] = true as const;
	private readonly cells: WeakMap<Scope, H>;
	// Identity-only token: renderer owners never retain their renderer tree.
	private readonly owner: SignalRendererOwnerIdentity | undefined;
	/** The render invocation that evaluated this declaration in `owner`. */
	private readonly invocation: number;
	/** A render's private presentation of a redeclared cell, until it is accepted or released. */
	declare private view?: H;
	declare private viewOwner?: Scope;
	/**
	 * The handle the declaring body's own functions use, created on their first
	 * use (see __declared). It refers to itself. A field of every descriptor, so
	 * the read path's check never changes or misses the descriptor's shape.
	 */
	private lexical: this | undefined;

	constructor(
		readonly key: string,
		readonly kind: H['kind'],
		/** `declaring` is the invocation that evaluated the declaration of `owner`'s cell, or 0. */
		private readonly create: (owner: Scope, declaring: number) => H,
		private readonly site: string | undefined,
		declared?: Descriptor<T, H>,
	) {
		if (declared === undefined) {
			this.cells = new WeakMap();
			this.owner = declarationOwner(site);
			this.invocation = this.owner === undefined ? 0 : currentSignalDeclarationInvocation();
			this.lexical = undefined;
		} else {
			// One declaration: a use finds the cell its template already resolved,
			// and a redeclaration it presents stages with the render that evaluated it.
			this.cells = declared.cells;
			this.owner = declared.owner;
			this.invocation = declared.invocation;
			this.lexical = this;
		}
	}

	/** @internal See __declared. */
	static declared<H>(handle$: H): H {
		if (!(handle$ instanceof Descriptor) || handle$.owner === undefined) return handle$;
		const declared: Descriptor<unknown, SignalHandle<unknown>> = handle$;
		const Class = declared.constructor as DescriptorClass<unknown, SignalHandle<unknown>>;
		return (declared.lexical ??= new Class(
			declared.key,
			declared.kind,
			declared.create,
			declared.site,
			declared,
		)) as H;
	}

	/** The owner a use resolves for: its reader, or for a lexical handle its declaring owner. */
	private reader(): SignalOwner {
		return this.lexical === this ? this.owner! : requireOwner();
	}

	[SIGNAL_OWNER_RESOLVE](owner: Scope): H {
		requireSite(this.site);
		const token = readerOwner(this.owner, owner);
		return this.resolvedCell(resolveDescriptorOwner(this.site, token), token);
	}

	/**
	 * A body declares its derived$ and query$ again on every render, so a closure
	 * that captures one captures a new descriptor each time. It still reads the
	 * cell the committed closure reads, unless this render presents a redeclared
	 * definition of that cell through a private view. Compared by identity, every
	 * such closure would run again on every render, and a result that never
	 * compares equal (a pending read, a new error or object) would make its
	 * readers render, and declare it, again without end.
	 */
	[SIGNAL_SAME_CAPTURE](committed: unknown, owner: object): boolean {
		if (
			this.site === undefined ||
			!(committed instanceof Descriptor) ||
			committed.constructor !== this.constructor ||
			committed.key !== this.key ||
			committed.site !== this.site ||
			committed.owner !== this.owner
		)
			return false;
		try {
			// Resolving declares this render's definition of the captured cell, as
			// the closure's own read would.
			return !isDeclarationView(this[SIGNAL_OWNER_RESOLVE](owner as Scope));
		} catch {
			return false;
		}
	}

	/**
	 * `token` is the owner the reader resolved. Only the declaring owner's cell
	 * belongs to the render that evaluated this declaration; a component that
	 * received the handle declares its own cell in its own render.
	 */
	private resolvedCell(target: Scope, token: SignalOwner): H {
		let cell = this.cells.get(target);
		if (!cell) {
			// An accepted view resolves to its canonical cell from now on. A render
			// declares in one owner, so one slot covers the common case; another
			// owner's view is found again through its cell's staged declaration.
			const view = this.view;
			if (view !== undefined && this.viewOwner === target && !isRetiredDeclarationView(view))
				return view;
			cell = this.create(target, token === this.owner ? this.invocation : 0);
			if (isDeclarationView(cell)) {
				this.view = cell;
				this.viewOwner = target;
			} else this.cells.set(target, cell);
		}
		return cell;
	}

	protected resolve(): H {
		const token = readerOwner(this.owner, this.reader());
		const owner = resolveDescriptorOwner(this.site, token);
		// This path already normalized the owner. Retain its validation order,
		// but do not repeat document/instance routing for every cached read.
		requireSite(this.site);
		return this.resolvedCell(owner, token);
	}

	// A lexical use reads as its declaring owner, so a server render also
	// observes the query attempts its reads start under that owner (see
	// readAsDeclared). The other read paths keep their direct call.
	get(): T {
		return this.lexical === this
			? readAsDeclared(this.owner!, () => this.resolve().get())
			: this.resolve().get();
	}

	[NATIVE_DOM_VALUE](): T {
		// Native styles belong to the active renderer read frame. Unlike targeted
		// binding reads, they must retain observation and historical seed evidence.
		return this.get();
	}

	[SIGNAL_BINDING_READ](): T {
		return this.lexical === this
			? readAsDeclared(this.owner!, () => readBinding(this.resolve()))
			: readBinding(this.resolve());
	}

	[SIGNAL_BINDING_SUBSCRIBE](notify: () => void, onRetire?: () => void): () => void {
		const run = captureSignalOwner(this.reader());
		return this.resolve()[SIGNAL_BINDING_SUBSCRIBE](
			forwardNativeTransitionConsumer(notify, () => run(notify)),
			onRetire === undefined ? undefined : () => run(onRetire),
		);
	}

	[SIGNAL_BINDING_RETIRED](): boolean {
		// Only the owner step can refuse; the cell a subscription resolved exists.
		const token = readerOwner(this.owner, this.reader());
		const owner = resolveUnlessRetired(() => resolveDescriptorOwner(this.site, token));
		return (
			owner === undefined || this.resolvedCell(owner, token)[SIGNAL_BINDING_RETIRED]?.() === true
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
		return this.lexical === this
			? readAsDeclared(this.owner!, () => this.resolve().latest(fallback))
			: this.resolve().latest(fallback);
	}

	snapshot(): SignalSnapshot<T> {
		return this.lexical === this
			? readAsDeclared(this.owner!, () => this.resolve().snapshot())
			: this.resolve().snapshot();
	}

	subscribe(notify: () => void): () => void {
		const token = this.reader();
		const scope = resolveDescriptorOwner(this.site, readerOwner(this.owner, token));
		const run = captureSignalOwner(token);
		return this[SIGNAL_OWNER_RESOLVE](scope).subscribe(
			forwardNativeTransitionConsumer(notify, () => run(notify)),
		);
	}
}

/**
 * @internal The receiver of a method call on a handle that a function nested in
 * its declaring component or hook body closes over. Compiled code routes each
 * such call on a body's const declaration through this, so the function
 * resolves the cell its body declared wherever it runs: in a child's event or
 * render, after `await`, or with no owner at all. The handle itself, passed on
 * as a value, is still resolved by its reader. Producer closures keep theirs.
 */
export function __declared<H>(handle$: H): H {
	return Descriptor.declared(handle$);
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
		(owner, declaring) =>
			createDeclaredScalarCell(
				owner,
				key,
				() => runWithSignalOwner(owner, () => (compute as () => T)()),
				sequence,
				captures,
				declaring,
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
