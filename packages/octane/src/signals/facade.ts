import {
	acceptScopeStreamedResult,
	bindScopeStreamedSelection,
	createDeclaredDerivedCell,
	createDeclaredResourceCell,
	createDeclaredSignalCell,
	createScope,
	failScopeStreamedResult,
	ScopeImpl,
} from './engine.js';
import { ScopeDisposedError, SignalStreamError } from './errors.js';
import { readSignalBinding as readBinding } from './graph.js';
import { readEarlySignalValue } from './early-values.js';
import {
	captureSignalOwner,
	currentSignalOwner,
	installSignalOwnerRetirement,
	runWithSignalOwner,
} from './owner-context.js';
import { query as createQueryRequest } from './requests.js';
import {
	SIGNAL_HANDLE,
	SIGNAL_BINDING_IDENTITY,
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
	SIGNAL_OWNER_RESOLVE,
	skip,
	type DerivedCompute,
	type DerivedOptions,
	type DerivedSignal,
	type OwnerBoundSignal,
	type QueryContext,
	type QueryLoadResult,
	type QueryOptions,
	type QuerySignal,
	type Scope,
	type ScopeSeed,
	type SignalHandle,
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
		throw new TypeError('Initial document signals require an implicit document owner.');
	}
	if (retiredIdentities.has(owner)) throw new ScopeDisposedError(owner.scopeKey);
	if (identityScopes.has(owner)) {
		throw new Error(
			'Initial document signals must be installed once, before any signal reads or writes.',
		);
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
});

/** @internal A document may freeze read work without retiring data or accepted writes. */
export function createSignalOwnerLifecycle(owner: SignalOwner) {
	if (isRendererOwner(owner))
		throw new TypeError('A document lifecycle requires its document owner.');
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
		throw new Error(
			'A module signal needs an active signal owner. Render it in an Octane root or use runWithSignalOwner().',
		);
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
	throw new Error(
		'Module signal identity is assigned by the Octane compiler. Use an explicit key outside compiled code.',
	);
}

abstract class Descriptor<T, H extends SignalHandle<T>> implements OwnerBoundSignal<T> {
	readonly [SIGNAL_HANDLE] = true as const;
	private readonly cells = new WeakMap<Scope, H>();

	constructor(
		readonly key: string,
		readonly kind: H['kind'],
		private readonly create: (owner: Scope) => H,
		private readonly site: string | undefined,
	) {}

	[SIGNAL_OWNER_RESOLVE](owner: Scope): H {
		requireSite(this.site);
		const target = resolveDescriptorOwner(this.site, owner);
		let cell = this.cells.get(target);
		if (!cell) {
			cell = this.create(target);
			this.cells.set(target, cell);
		}
		return cell;
	}

	protected resolve(): H {
		const token = requireOwner();
		const owner = resolveDescriptorOwner(this.site, token);
		return this[SIGNAL_OWNER_RESOLVE](owner);
	}

	get(): T {
		return this.resolve().get();
	}

	[SIGNAL_BINDING_READ](): T {
		return readBinding(this.resolve());
	}

	[SIGNAL_BINDING_SUBSCRIBE](notify: () => void): () => void {
		const run = captureSignalOwner(requireOwner());
		return this.resolve()[SIGNAL_BINDING_SUBSCRIBE](() => run(notify));
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
		const scope = resolveDescriptorOwner(this.site, token);
		const run = captureSignalOwner(token);
		return this[SIGNAL_OWNER_RESOLVE](scope).subscribe(() => run(notify));
	}
}

class SignalDescriptor<T> extends Descriptor<T, WritableSignal<T>> implements WritableSignal<T> {
	declare readonly kind: 'signal';

	set(value: T | ((previous: T) => T)): void {
		this.resolve().set(value);
	}
}

class DerivedDescriptor<T> extends Descriptor<T, DerivedSignal<T>> implements DerivedSignal<T> {
	declare readonly kind: 'derived';
}

class QueryDescriptor<T> extends Descriptor<T, QuerySignal<T>> implements QuerySignal<T> {
	declare readonly kind: 'async';

	refetch(): void {
		this.resolve().retry();
	}

	reset(): void {
		this.resolve().retry({ pending: true });
	}

	retry(options?: { pending?: boolean }): void {
		this.resolve().retry(options);
	}
}

function descriptorKey(site: string | undefined, explicit: string | undefined): string {
	const key = explicit ?? site;
	if (typeof key !== 'string' || !key.trim()) return '<compiler-assigned-signal>';
	return key;
}

export function __signalAt<T>(site: string, initial: T): WritableSignal<T>;
export function __signalAt<T>(site: string, key: string, initial: T): WritableSignal<T>;
export function __signalAt<T>(
	site: string,
	keyOrInitial: string | T,
	initial?: T,
): WritableSignal<T> {
	const explicit = arguments.length === 3 ? (keyOrInitial as string) : undefined;
	const value = arguments.length === 3 ? (initial as T) : (keyOrInitial as T);
	const key = descriptorKey(site, explicit);
	return new SignalDescriptor(
		key,
		'signal',
		(owner) => {
			const early = readEarlySignalValue(scopeOwners.get(owner) ?? owner, {
				scope: site.startsWith('g:') ? 'document' : 'instance',
				nodeKey: key,
			});
			return createDeclaredSignalCell(
				owner,
				key,
				early === undefined ? value : (early.value as T),
				early !== undefined,
			);
		},
		site,
	);
}

export function signal$<T>(initial: T): WritableSignal<T>;
export function signal$<T>(key: string, initial: T): WritableSignal<T>;
export function signal$<T>(keyOrInitial: string | T, initial?: T): WritableSignal<T> {
	return arguments.length === 2
		? __signalAt(keyOrInitial as string, keyOrInitial as string, initial as T)
		: __signalAt(undefined as never, keyOrInitial as T);
}

export function __derivedAt<T>(
	site: string,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
): DerivedSignal<T>;
export function __derivedAt<T>(
	site: string,
	key: string,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
): DerivedSignal<T>;
export function __derivedAt<T>(
	site: string,
	keyOrCompute: string | DerivedCompute<T>,
	computeOrOptions?: DerivedCompute<T> | DerivedOptions,
	options?: DerivedOptions,
): DerivedSignal<T> {
	const explicit = typeof keyOrCompute === 'string' ? keyOrCompute : undefined;
	const compute = (explicit ? computeOrOptions : keyOrCompute) as DerivedCompute<T>;
	const resolvedOptions = (explicit ? options : computeOrOptions) as DerivedOptions | undefined;
	if (typeof compute !== 'function') throw new TypeError('derived$ requires a function.');
	const key = descriptorKey(site, explicit);
	return new DerivedDescriptor(
		key,
		'derived',
		(owner) => {
			const wrapped = compute.length
				? (context: Parameters<DerivedCompute<T>>[0]) =>
						runWithSignalOwner(owner, () => compute(context))
				: () => runWithSignalOwner(owner, () => (compute as () => ReturnType<DerivedCompute<T>>)());
			return createDeclaredDerivedCell(owner, key, wrapped, resolvedOptions);
		},
		site,
	);
}

export function derived$<T>(compute: DerivedCompute<T>, options?: DerivedOptions): DerivedSignal<T>;
export function derived$<T>(
	key: string,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
): DerivedSignal<T>;
export function derived$<T>(
	keyOrCompute: string | DerivedCompute<T>,
	computeOrOptions?: DerivedCompute<T> | DerivedOptions,
	options?: DerivedOptions,
): DerivedSignal<T> {
	return typeof keyOrCompute === 'string'
		? __derivedAt(keyOrCompute, keyOrCompute, computeOrOptions as DerivedCompute<T>, options)
		: __derivedAt(undefined as never, keyOrCompute, computeOrOptions as DerivedOptions | undefined);
}

export function __queryAt<A, T>(
	site: string,
	select: () => A | typeof skip,
	load: (selection: A, context: QueryContext<T>) => QueryLoadResult<T>,
	options?: QueryOptions,
): QuerySignal<T>;
export function __queryAt<A, T>(
	site: string,
	key: string,
	select: () => A | typeof skip,
	load: (selection: A, context: QueryContext<T>) => QueryLoadResult<T>,
	options?: QueryOptions,
): QuerySignal<T>;
export function __queryAt<A, T>(
	site: string,
	keyOrSelect: string | (() => A | typeof skip),
	selectOrLoad:
		(() => A | typeof skip) | ((selection: A, context: QueryContext<T>) => QueryLoadResult<T>),
	loadOrOptions?: ((selection: A, context: QueryContext<T>) => QueryLoadResult<T>) | QueryOptions,
	options?: QueryOptions,
): QuerySignal<T> {
	const explicit = typeof keyOrSelect === 'string' ? keyOrSelect : undefined;
	const select = (explicit ? selectOrLoad : keyOrSelect) as () => A | typeof skip;
	const load = (explicit ? loadOrOptions : selectOrLoad) as (
		selection: A,
		context: QueryContext<T>,
	) => QueryLoadResult<T>;
	const resolvedOptions = (explicit ? options : loadOrOptions) as QueryOptions | undefined;
	if (typeof select !== 'function' || typeof load !== 'function') {
		throw new TypeError('query$ requires selector and loader functions.');
	}
	const authoredKey = descriptorKey(site, explicit);
	const key =
		explicit !== undefined && (site.startsWith('g:') || site.startsWith('i:'))
			? site.slice(0, 2) + authoredKey
			: authoredKey;
	const request = (
		createQueryRequest as unknown as (
			key: string,
			load: (selection: A, context: QueryContext) => unknown,
			options?: QueryOptions,
		) => (selection: A) => import('./types.js').QueryRequest<T>
	)(key, load as unknown as (selection: A, context: QueryContext) => unknown, resolvedOptions);
	return new QueryDescriptor(
		key,
		'async',
		(owner) =>
			createDeclaredResourceCell(owner, key, () => {
				const selection = runWithSignalOwner(owner, select);
				return selection === skip ? skip : request(selection);
			}) as QuerySignal<T>,
		site,
	);
}

export function query$<A, T>(
	select: () => A | typeof skip,
	load: (selection: A, context: QueryContext<T>) => QueryLoadResult<T>,
	options?: QueryOptions,
): QuerySignal<T>;
export function query$<A, T>(
	key: string,
	select: () => A | typeof skip,
	load: (selection: A, context: QueryContext<T>) => QueryLoadResult<T>,
	options?: QueryOptions,
): QuerySignal<T>;
export function query$<A, T>(
	keyOrSelect: string | (() => A | typeof skip),
	selectOrLoad:
		(() => A | typeof skip) | ((selection: A, context: QueryContext<T>) => QueryLoadResult<T>),
	loadOrOptions?: ((selection: A, context: QueryContext<T>) => QueryLoadResult<T>) | QueryOptions,
	options?: QueryOptions,
): QuerySignal<T> {
	return typeof keyOrSelect === 'string'
		? __queryAt(
				keyOrSelect,
				keyOrSelect,
				selectOrLoad as () => A | typeof skip,
				loadOrOptions as (selection: A, context: QueryContext<T>) => QueryLoadResult<T>,
				options,
			)
		: __queryAt(
				undefined as never,
				keyOrSelect,
				selectOrLoad as (selection: A, context: QueryContext<T>) => QueryLoadResult<T>,
				loadOrOptions as QueryOptions | undefined,
			);
}

export function isSignalHandle(value: unknown): value is SignalHandle<unknown> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		(value as SignalHandle<unknown>)[SIGNAL_HANDLE] === true
	);
}

export function isWritableSignal(value: unknown): value is WritableSignal<unknown> {
	return (
		isSignalHandle(value) &&
		(value as { kind?: unknown }).kind === 'signal' &&
		typeof (value as { set?: unknown }).set === 'function'
	);
}

export function readSignalBinding<T>(handle$: SignalHandle<T>): T {
	if (!isSignalHandle(handle$)) throw new TypeError('A signal binding requires a signal handle.');
	return handle$[SIGNAL_BINDING_READ]();
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
	if (!(scope instanceof ScopeImpl) || !scope.bindStreamedSelection(identity))
		throw new SignalStreamError('identity');
	const fail = (error: unknown): void => {
		failStreamedSignalResult(owner, identity, receiverErrorCode(error));
	};
	const consumer = {
		accept(frame: StreamedSignalResultFrame): void | false {
			if (acceptStreamedSignalResult(owner, frame)) return;
			// Only a still-authorized selector waiting on its dependencies may
			// defer. Bad sequence/resource/attempt frames still fail closed.
			if (scope.isStreamedSelectionPending(frame.identity)) return false;
			fail(new SignalStreamError('identity'));
			throw new SignalStreamError('identity');
		},
		retainCompleted(frames: StreamedSignalResultFrame[]): boolean {
			return scope.retainCompletedStreamedResult(identity, frames);
		},
		fail,
	};
	try {
		let detach = receiver.attachResult(identity, consumer);
		const stopWaiting = scope.whenStreamedSelectionReady(identity, () => {
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
