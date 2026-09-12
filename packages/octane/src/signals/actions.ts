import {
	adoptResourceValue,
	createDeclaredDerivedCell,
	createDeclaredSignalCell,
	getResourceSelectionAuthority,
	getSignalScope,
} from './engine.js';
import { resolveCurrentSignalHandle, resolveSignalHandleForOwner } from './facade.js';
import {
	ScopedNode,
	assertWritable,
	isThenable,
	pure,
	signalBatch,
	subscribeNode,
	untrack,
} from './graph.js';
import { captureSignalOwner, currentSignalOwner, runWithSignalOwner } from './owner-context.js';
import {
	SIGNAL_HANDLE,
	SIGNAL_BINDING_READ,
	SIGNAL_BINDING_SUBSCRIBE,
	SIGNAL_BINDING_IDENTITY,
	SIGNAL_OWNER_RESOLVE,
	type ActionOperation,
	type ActionUncertain,
	type OptimisticSignal,
	type OwnerBoundSignal,
	type Scope,
	type SignalAction,
	type SignalHandle,
	type SignalOwner,
	type SignalSnapshot,
} from './types.js';

const uncertainReceipts = new WeakSet<object>();
let activeOperation: Operation | undefined;
let excludedOperation: Operation | undefined;

interface Overlay<T> {
	readonly operation: Operation;
	readonly requestKey: string | undefined;
	readonly selectionAuthority: object | undefined;
	value: T;
}

const managers = new WeakMap<ScopedNode, OptimisticManager<unknown>>();

class OptimisticManager<T> {
	readonly owner: Scope;
	readonly version$: OptimisticSignal<number>;
	readonly view$: SignalHandle<T>;
	readonly overlays: Overlay<T>[] = [];

	constructor(readonly source: ScopedNode<T>) {
		const owner = getSignalScope(source);
		if (!owner) throw new TypeError('An optimistic source needs a live Octane scope.');
		this.owner = owner;
		this.version$ = createDeclaredSignalCell(
			this.owner,
			`@octane/optimistic-version/${source.key}`,
			0,
		);
		this.view$ = createDeclaredDerivedCell(this.owner, `@octane/optimistic/${source.key}`, () => {
			this.version$.get();
			return this.read();
		});
	}

	read(exclude?: Operation): T {
		const snapshot = this.source.snapshot();
		const selectionAuthority = getResourceSelectionAuthority(this.source);
		for (let index = this.overlays.length - 1; index >= 0; index--) {
			const overlay = this.overlays[index]!;
			if (
				overlay.operation !== exclude &&
				overlay.requestKey === snapshot.requestKey &&
				overlay.selectionAuthority === selectionAuthority
			) {
				return overlay.value;
			}
		}
		return this.source.get();
	}

	latest<F>(fallback?: F, exclude?: Operation): T | F | undefined {
		const snapshot = this.source.snapshot();
		const selectionAuthority = getResourceSelectionAuthority(this.source);
		for (let index = this.overlays.length - 1; index >= 0; index--) {
			const overlay = this.overlays[index]!;
			if (
				overlay.operation !== exclude &&
				overlay.requestKey === snapshot.requestKey &&
				overlay.selectionAuthority === selectionAuthority
			) {
				return overlay.value;
			}
		}
		return this.source.latest(fallback);
	}

	snapshot(exclude?: Operation): SignalSnapshot<T> {
		const snapshot = this.source.snapshot();
		const selectionAuthority = getResourceSelectionAuthority(this.source);
		for (let index = this.overlays.length - 1; index >= 0; index--) {
			const overlay = this.overlays[index]!;
			if (
				overlay.operation !== exclude &&
				overlay.requestKey === snapshot.requestKey &&
				overlay.selectionAuthority === selectionAuthority
			) {
				return Object.freeze({
					status: 'ready',
					value: overlay.value,
					refreshing: snapshot.refreshing,
					connection: snapshot.connection,
					complete: snapshot.complete,
					...(snapshot.requestKey === undefined ? {} : { requestKey: snapshot.requestKey }),
				});
			}
		}
		return snapshot;
	}

	apply(operation: Operation, value: T | ((previous: T) => T)): Overlay<T> {
		assertWritable();
		if (operation.status !== 'pending') {
			throw new Error(`Action operation "${operation.id}" is no longer writable.`);
		}
		let overlay = operation.targets.get(this) as Overlay<T> | undefined;
		const snapshot = this.source.snapshot();
		if (!overlay && snapshot.status !== 'ready') {
			throw new Error('An optimistic write requires ready source authority.');
		}
		const previous = this.read();
		const next =
			typeof value === 'function'
				? untrack(() => pure(() => (value as (previous: T) => T)(previous)))
				: value;
		if (!overlay) {
			overlay = {
				operation,
				requestKey: snapshot.requestKey,
				selectionAuthority: getResourceSelectionAuthority(this.source),
				value: next,
			};
			this.overlays.push(overlay);
			operation.targets.set(this, overlay);
		} else {
			overlay.value = next;
		}
		this.publish();
		return overlay;
	}

	remove(operation: Operation): void {
		const index = this.overlays.findIndex((overlay) => overlay.operation === operation);
		if (index < 0) return;
		this.overlays.splice(index, 1);
		if (!this.owner.retired) this.publish();
	}

	adopt(overlay: Overlay<T>, value: T): void {
		const snapshot = this.source.snapshot();
		if (
			snapshot.requestKey !== overlay.requestKey ||
			getResourceSelectionAuthority(this.source) !== overlay.selectionAuthority
		) {
			throw new Error('An action cannot adopt authority for a different query selection.');
		}
		if (this.source.kind === 'async') {
			if (!adoptResourceValue(this.source, overlay.requestKey, value)) {
				throw new Error('The pinned query selection is no longer current.');
			}
		} else if (this.source.kind === 'signal') {
			this.source.set(value);
		} else {
			throw new TypeError('Only a writable or query source can adopt an authoritative value.');
		}
		this.remove(overlay.operation);
	}

	private publish(): void {
		this.version$.set((version) => version + 1);
	}
}

function managerFor<T>(source$: SignalHandle<T>, owner?: SignalOwner): OptimisticManager<T> {
	const resolved = owner
		? resolveSignalHandleForOwner(source$, owner)
		: resolveCurrentSignalHandle(source$);
	if (!(resolved instanceof ScopedNode)) {
		throw new TypeError('optimistic$ requires an Octane signal source.');
	}
	let manager = managers.get(resolved) as OptimisticManager<T> | undefined;
	if (!manager) {
		manager = new OptimisticManager(resolved);
		managers.set(resolved, manager as OptimisticManager<unknown>);
	}
	return manager;
}

class OptimisticDescriptor<T> implements OptimisticSignal<T>, OwnerBoundSignal<T> {
	readonly [SIGNAL_HANDLE] = true as const;
	readonly kind = 'signal' as const;
	readonly key: string;

	constructor(private readonly source$: SignalHandle<T>) {
		this.key = `optimistic:${source$.key}`;
	}

	[SIGNAL_OWNER_RESOLVE](owner: Scope): SignalHandle<T> {
		return managerFor(this.source$, owner).view$;
	}

	private manager(owner?: SignalOwner): OptimisticManager<T> {
		return managerFor(this.source$, owner);
	}

	get(): T {
		const manager = this.manager(activeOperation?.owner ?? undefined);
		return excludedOperation ? manager.read(excludedOperation) : manager.view$.get();
	}

	[SIGNAL_BINDING_READ](): T {
		return this.manager().view$[SIGNAL_BINDING_READ]();
	}

	[SIGNAL_BINDING_SUBSCRIBE](notify: () => void): () => void {
		const owner = currentSignalOwner();
		if (!owner) throw new Error('An optimistic subscription needs an active signal owner.');
		const run = captureSignalOwner(owner);
		return this.manager().view$[SIGNAL_BINDING_SUBSCRIBE](() => run(notify));
	}

	[SIGNAL_BINDING_IDENTITY]() {
		return this.source$[SIGNAL_BINDING_IDENTITY]();
	}

	latest(): T | undefined;
	latest<F>(fallback: F): T | F;
	latest<F>(fallback?: F): T | F | undefined {
		return this.manager().latest(fallback, excludedOperation);
	}

	snapshot(): SignalSnapshot<T> {
		const manager = this.manager();
		return excludedOperation ? manager.snapshot(excludedOperation) : manager.view$.snapshot();
	}

	subscribe(notify: () => void): () => void {
		const owner = currentSignalOwner();
		if (!owner) throw new Error('An optimistic subscription needs an active signal owner.');
		const run = captureSignalOwner(owner);
		return this.manager().view$.subscribe(() => run(notify));
	}

	set(value: T | ((previous: T) => T)): void {
		if (!activeOperation) {
			throw new Error('An optimistic write must belong to action$ or use operation.set().');
		}
		this.apply(activeOperation, value);
	}

	apply(operation: Operation, value: T | ((previous: T) => T)): void {
		const manager = this.manager(operation.owner ?? undefined);
		operation.bind(this, manager);
		manager.apply(operation, value);
	}
}

export class ActionUncertainError extends Error {
	readonly code = 'OCTANE_ACTION_UNCERTAIN';

	constructor(
		readonly operationId: string,
		options: { cause: unknown },
	) {
		super(`Action operation "${operationId}" may have been accepted.`, options);
		this.name = 'ActionUncertainError';
	}
}

function operationId(key: string): string {
	const randomUUID = globalThis.crypto?.randomUUID;
	if (typeof randomUUID !== 'function') {
		throw new Error('action$ requires crypto.randomUUID() for operation identity.');
	}
	return `${key}:${randomUUID.call(globalThis.crypto)}`;
}

function transportIsUncertain(error: unknown): boolean {
	return (
		(typeof error === 'object' || typeof error === 'function') &&
		error !== null &&
		(error as { code?: unknown }).code === 'OCTANE_RPC_UNCERTAIN'
	);
}

class Operation implements ActionOperation {
	readonly id: string;
	readonly owner = currentSignalOwner();
	status: ActionOperation['status'] = 'pending';
	readonly targets = new Map<OptimisticManager<any>, Overlay<any>>();
	private waits?: Set<() => void>;
	private readonly descriptors = new Map<
		OptimisticDescriptor<unknown>,
		OptimisticManager<unknown>
	>();

	constructor(readonly key: string) {
		this.id = operationId(key);
	}

	set<T>(signal$: OptimisticSignal<T>, value: T | ((previous: T) => T)): void {
		if (!(signal$ instanceof OptimisticDescriptor)) {
			throw new TypeError('operation.set() requires a signal from optimistic$().');
		}
		const manager = this.descriptors.get(signal$ as OptimisticDescriptor<unknown>);
		if (manager) {
			(manager as OptimisticManager<T>).apply(this, value);
			return;
		}
		signal$.apply(this, value);
	}

	bind<T>(descriptor: OptimisticDescriptor<T>, manager: OptimisticManager<T>): void {
		this.descriptors.set(
			descriptor as OptimisticDescriptor<unknown>,
			manager as OptimisticManager<unknown>,
		);
	}

	adopt<T>(value: T): void {
		if (this.status !== 'pending' && this.status !== 'uncertain')
			throw new Error(`Action operation "${this.id}" is settled.`);
		if (this.targets.size !== 1) {
			throw new Error('operation.adopt() requires exactly one optimistic source.');
		}
		const [manager, overlay] = this.targets.entries().next().value!;
		(manager as OptimisticManager<T>).adopt(overlay as Overlay<T>, value);
		this.targets.delete(manager);
		this.status = 'confirmed';
		this.notifyWaits();
	}

	uncertain(): ActionUncertain {
		if (this.status !== 'pending') throw new Error(`Action operation "${this.id}" is settled.`);
		this.status = 'uncertain';
		this.notifyWaits();
		const receipt = Object.freeze({ status: 'uncertain' as const, operationId: this.id });
		uncertainReceipts.add(receipt);
		return receipt;
	}

	until(read: () => unknown, options?: { timeout?: number }): Promise<void> {
		if (this.status !== 'pending') return Promise.reject(new Error('The action is settled.'));
		if (typeof read !== 'function')
			return Promise.reject(new TypeError('until() requires a read.'));
		const timeout = options?.timeout;
		if (timeout !== undefined && (!Number.isFinite(timeout) || timeout < 0)) {
			return Promise.reject(new RangeError('until() timeout must be a nonnegative number.'));
		}
		const managers = [...this.targets.keys()];
		if (!managers.length) {
			return Promise.reject(new Error('until() requires a pinned optimistic source.'));
		}
		return new Promise<void>((resolve, reject) => {
			let ended = false;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const stops: (() => void)[] = [];
			const finish = (error?: unknown) => {
				if (ended) return;
				ended = true;
				if (timer !== undefined) clearTimeout(timer);
				for (const stop of stops) stop();
				this.waits?.delete(check);
				if (error === undefined) resolve();
				else reject(error);
			};
			const check = () => {
				if (ended) return;
				if (this.status !== 'pending') {
					finish(
						this.status === 'confirmed' ? undefined : new Error(`The action is ${this.status}.`),
					);
					return;
				}
				if (managers.some((manager) => manager.owner.retired)) {
					finish(new Error('The optimistic owner was retired.'));
					return;
				}
				const previous = excludedOperation;
				excludedOperation = this;
				try {
					for (const [manager, overlay] of this.targets) {
						if (
							manager.source.snapshot().requestKey !== overlay.requestKey ||
							getResourceSelectionAuthority(manager.source) !== overlay.selectionAuthority
						) {
							finish(new Error('The pinned optimistic selection is no longer current.'));
							return;
						}
					}
					if (runWithSignalOwner(managers[0]!.owner, read)) finish();
				} catch (error) {
					if (!isThenable(error)) finish(error);
				} finally {
					excludedOperation = previous;
				}
			};
			(this.waits ??= new Set()).add(check);
			for (const manager of managers) stops.push(subscribeNode(manager.source, check));
			if (timeout !== undefined) {
				timer = setTimeout(
					() => finish(new Error('The optimistic confirmation timed out.')),
					timeout,
				);
			}
			check();
		});
	}

	confirm(): void {
		if (this.status !== 'pending') return;
		this.status = 'confirmed';
		this.clear();
		this.notifyWaits();
	}

	reject(): void {
		if (this.status !== 'pending' && this.status !== 'uncertain') return;
		assertWritable();
		this.status = 'rejected';
		this.clear();
		this.notifyWaits();
	}

	private notifyWaits(): void {
		if (this.waits) for (const check of this.waits) check();
	}

	private clear(): void {
		for (const manager of this.targets.keys()) manager.remove(this);
		this.targets.clear();
	}
}

export function optimistic$<T>(source$: SignalHandle<T>): OptimisticSignal<T> {
	if (!source$ || typeof source$.get !== 'function') {
		throw new TypeError('optimistic$ requires a signal source.');
	}
	return new OptimisticDescriptor(source$);
}

export function action$<F extends (operation: ActionOperation, ...args: any[]) => any>(
	handler: F,
): SignalAction<F>;
export function action$<F extends (operation: ActionOperation, ...args: any[]) => any>(
	key: string,
	handler: F,
): SignalAction<F>;
export function action$<F extends (operation: ActionOperation, ...args: any[]) => any>(
	keyOrHandler: string | F,
	handler?: F,
): SignalAction<F> {
	const key = typeof keyOrHandler === 'string' ? keyOrHandler : 'action';
	const execute = (typeof keyOrHandler === 'function' ? keyOrHandler : handler) as F;
	if (!key.trim() || typeof execute !== 'function') {
		throw new TypeError('action$ requires a handler and an optional nonempty key.');
	}
	return function (this: unknown, ...args: unknown[]) {
		const operation = new Operation(key);
		const previous = activeOperation;
		activeOperation = operation;
		let result: unknown;
		try {
			result = signalBatch(() => execute.call(this, operation, ...args));
		} catch (error) {
			activeOperation = previous;
			if (transportIsUncertain(error)) {
				operation.uncertain();
				throw new ActionUncertainError(operation.id, { cause: error });
			}
			operation.reject();
			throw error;
		}
		activeOperation = previous;
		let asyncResult: boolean;
		try {
			asyncResult = isThenable(result);
		} catch (error) {
			operation.reject();
			throw error;
		}
		if (!asyncResult) {
			if (!isActionUncertain(result)) operation.confirm();
			return result;
		}
		return Promise.resolve(result).then(
			(value) => {
				if (!isActionUncertain(value)) operation.confirm();
				return value;
			},
			(error) => {
				if (transportIsUncertain(error)) {
					operation.uncertain();
					throw new ActionUncertainError(operation.id, { cause: error });
				}
				operation.reject();
				throw error;
			},
		);
	} as SignalAction<F>;
}

export function isActionUncertain(value: unknown): value is ActionUncertain | ActionUncertainError {
	return (
		value instanceof ActionUncertainError ||
		((typeof value === 'object' || typeof value === 'function') &&
			value !== null &&
			uncertainReceipts.has(value as object))
	);
}
