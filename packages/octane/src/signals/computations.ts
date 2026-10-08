import { yieldForHostBudget } from '../host-budget.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { createDerivedCellWith } from './engine.js';
import {
	ScopedNode,
	assertAlive,
	createDeclarationView,
	derivedValueState,
	errorState,
	invalidateNode,
	isThenable,
	linkReads,
	pendingState,
	promoteDeclarationView,
	publishNode,
	readNode,
	readsDuring,
	readsMatch,
	reevaluateNode,
	refreshNode,
	readyState,
	releaseDeclarationView,
	signalBatch,
	subscribeNode,
	untrack,
	untrackCommitted,
	type NodeState,
	type GraphOwner,
	type SignalCandidateFrame,
} from './graph.js';
import {
	SIGNAL_DEPENDENT_NODE,
	publishNativeProducer,
	type SignalDependencyNotify,
} from './read-protocol.js';
import { RedeclarableBinding } from './redeclaration.js';
import { candidateHooks } from './transition-state.js';
import { installDerivedCandidates } from '#octane/signal-actions/bindings';
import {
	SIGNAL_OWNER_RESOLVE,
	type DerivedCompute,
	type DerivedContext,
	type DerivedOptions,
	type DerivedSignal,
	type OwnerBoundSignal,
	type OwnerScope,
	type Scope,
	type SignalHandle,
} from './types.js';

export function createDeclaredDerivedCell<T>(
	owner: OwnerScope,
	key: string,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
	sequence?: number,
	captures?: readonly unknown[],
	declaring?: number,
): DerivedSignal<T> {
	// Only a bundle that creates these cells carries their candidate producer.
	installDerivedCandidates();
	return createDerivedCellWith(
		owner,
		key,
		compute,
		options,
		DerivedBinding,
		sequence,
		captures,
		declaring,
	);
}

interface AttemptDependency {
	node: ScopedNode;
	revision: number;
	unsubscribe: () => void;
}

interface DerivedAttempt<T> {
	active: boolean;
	binding: DerivedBinding<T> | undefined;
	controller: AbortController | undefined;
	iterator: AsyncIterator<T> | undefined;
	readonly dependencies: Map<ScopedNode, AttemptDependency>;
	readonly waiting: Promise<void>;
	readonly resolve: () => void;
	hasYielded: boolean;
	owners: Set<GraphOwner> | undefined;
	cancelWaiting: Promise<void> | undefined;
	cancelRead: (() => void) | undefined;
}

function attempt<T>(binding: DerivedBinding<T>): DerivedAttempt<T> {
	let resolve!: () => void;
	const waiting = new Promise<void>((done) => {
		resolve = done;
	});
	return {
		active: true,
		binding,
		controller: undefined,
		iterator: undefined,
		dependencies: new Map(),
		waiting,
		resolve,
		hasYielded: false,
		owners: new Set(),
		cancelWaiting: undefined,
		cancelRead: undefined,
	};
}

// A producer-owned return promise may never settle. Its rejection handler must
// not capture the retired iterator or the binding that requested cleanup.
function ignoreRetiredCloseFailure(): void {}

function closeIterator(iterator: AsyncIterator<unknown>): void {
	try {
		Promise.resolve(untrackCommitted(() => iterator.return?.())).catch(ignoreRetiredCloseFailure);
	} catch {}
}

function asyncIterator<T>(value: unknown): (() => AsyncIterator<T>) | undefined {
	if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return;
	const factory = (value as AsyncIterable<T>)[Symbol.asyncIterator];
	return typeof factory === 'function' ? () => factory.call(value) : undefined;
}

function resolveHandle<T>(handle$: SignalHandle<T>, owner: Scope): ScopedNode<T> {
	const resolved =
		SIGNAL_OWNER_RESOLVE in (handle$ as object)
			? (handle$ as OwnerBoundSignal<T>)[SIGNAL_OWNER_RESOLVE](owner)
			: handle$;
	if (!(resolved instanceof ScopedNode)) {
		throw new TypeError(formatClientError(109));
	}
	return resolved;
}

export class DerivedBinding<T> extends RedeclarableBinding<DerivedCompute<T>> {
	// Members that are not private are also used by an Action frame's producer
	// (candidate-producers.ts), which forks and publishes this binding.
	current: DerivedAttempt<T> | undefined;
	compute: DerivedCompute<T> | undefined;
	frozen = false;
	candidate: SignalCandidateFrame | undefined;
	/** The latest evaluation produced asynchronous work rather than a value. */
	private asynchronous = false;
	/** A later render's computation, evaluated privately until that render is accepted. */
	declare private view?: { readonly node: ScopedNode<T>; readonly binding: DerivedBinding<T> };
	/** A render's computation that produced the committed value, and what it read. */
	declare private probed?: { readonly compute: DerivedCompute<T>; readonly reads: ScopedNode[] };
	/** A view's first result, already produced by the render's probe. */
	declare private seeded?: { readonly result: unknown };

	constructor(
		readonly owner: Scope & GraphOwner,
		readonly node: ScopedNode<T>,
		compute: DerivedCompute<T>,
		readonly options?: DerivedOptions,
	) {
		super();
		this.compute = compute;
		node.compute = () => this.evaluate();
	}

	protected committedDefinition(): DerivedCompute<T> | undefined {
		return this.compute;
	}

	/**
	 * Asynchronous work has no selection identity, so a new closure cannot be
	 * matched with the attempt it would repeat: restarting it would refetch on
	 * every redeclaring render and loop on a suspended retry. Such a cell adopts
	 * the closure for its next dependency-driven restart instead.
	 */
	protected installDefinition(compute: DerivedCompute<T>, sequence: number): void {
		const probed = this.probed;
		this.probed = undefined;
		const view = this.view;
		// The accepted render kept the committed value while this view started
		// asynchronous work. Adopt that attempt rather than starting another.
		if (view !== undefined && view.binding.compute === compute) {
			this.acceptView(view.node, sequence, compute);
			return;
		}
		this.compute = compute;
		this.sequence = sequence;
		if (this.asynchronous) return;
		// The render already evaluated this computation against the same inputs.
		if (probed?.compute === compute && readsMatch(this.node, probed.reads)) return;
		signalBatch(() => reevaluateNode(this.node));
	}

	protected presentDefinition(compute: DerivedCompute<T>): ScopedNode | undefined {
		// A frozen document keeps presenting committed values. The new closure is
		// installed at acceptance and evaluated when reads resume.
		if (this.asynchronous || this.frozen || this.owner.readBarrier !== undefined) return undefined;
		// A zero-argument computation runs once here. An equal synchronous value
		// needs no view; any other result seeds the view, so the closure never
		// runs twice and asynchronous work never starts twice.
		let probe: { value: unknown; reads: ScopedNode[] } | undefined;
		if (compute.length === 0) {
			try {
				probe = readsDuring(this.owner, compute as () => unknown);
			} catch {
				// A suspended or failing computation reports itself through a view.
			}
		}
		if (probe !== undefined && !this.producesWork(probe.value)) {
			const state = untrack(() => refreshNode(this.node));
			if (state.snapshot.status === 'ready' && Object.is(state.snapshot.value, probe.value)) {
				this.probed = { compute, reads: probe.reads };
				return undefined;
			}
		}
		this.releaseView();
		const node: ScopedNode<T> = createDeclarationView(this.node, (target, frame) =>
			candidateHooks.derived!.call(binding, target, frame),
		);
		const binding: DerivedBinding<T> = new DerivedBinding(this.owner, node, compute, this.options);
		this.view = { node, binding };
		if (probe !== undefined) binding.seeded = { result: probe.value };
		refreshNode(node);
		if (probe !== undefined) linkReads(node, probe.reads);
		// A render that may be discarded never presents asynchronous work: its
		// retry could not be matched with this attempt and would start another.
		return binding.asynchronous ? undefined : node;
	}

	/** Whether a result is asynchronous work rather than a value. */
	private producesWork(result: unknown): boolean {
		if (this.options?.sync) return false;
		try {
			return isThenable(result) || asyncIterator(result) !== undefined;
		} catch {
			return true;
		}
	}

	protected acceptView(node: ScopedNode, sequence: number, compute: DerivedCompute<T>): void {
		const view = this.view;
		if (view?.node !== node) return;
		this.view = undefined;
		const fork = view.binding;
		const previous = this.current;
		const current = fork.current;
		this.compute = compute;
		this.sequence = sequence;
		this.asynchronous = fork.asynchronous;
		this.current = current;
		if (current) current.binding = this;
		this.node.invalidateAttempt = current ? () => this.invalidateGraph() : undefined;
		fork.current = undefined;
		fork.node.invalidateAttempt = undefined;
		signalBatch(() => {
			promoteDeclarationView(node, this.node);
			fork.dispose();
			if (previous !== current) this.stop(previous);
		});
	}

	protected discardDefinition(): void {
		if (this.view?.binding.asynchronous) this.releaseView();
	}

	private releaseView(): void {
		const view = this.view;
		if (view === undefined) return;
		this.view = undefined;
		signalBatch(() => {
			releaseDeclarationView(view.node);
			view.binding.dispose();
		});
	}

	private static context<T>(current: DerivedAttempt<T>): DerivedContext {
		return {
			get signal() {
				if (!current.active) return AbortSignal.abort();
				return (current.controller ??= new AbortController()).signal;
			},
			read<V>(handle$: SignalHandle<V>): Promise<V> {
				return current.binding
					? current.binding.read(current, handle$)
					: Promise.reject(new Error(formatClientError(111)));
			},
		};
	}

	static notify<T>(current: DerivedAttempt<T>): SignalDependencyNotify {
		const notify: SignalDependencyNotify = () => current.binding?.invalidate(current);
		// Explicit reads are graph leases too. Discovery follows their dependent
		// identity without evaluating the computation or replaying this callback.
		notify[SIGNAL_DEPENDENT_NODE] = current.binding!.node;
		return notify;
	}

	private read<V>(current: DerivedAttempt<T>, handle$: SignalHandle<V>): Promise<V> {
		if (!current.active) return Promise.reject(new Error(formatClientError(111)));
		try {
			return DerivedBinding.readValue<T, V>(current, this.readDependency(current, handle$));
		} catch (error) {
			return Promise.reject(error);
		}
	}

	private readDependency<V>(
		current: DerivedAttempt<T>,
		handle$: SignalHandle<V>,
	): AttemptDependency {
		const dependency = this.candidate
			? this.candidate.run(() => this.candidate!.resolve(resolveHandle(handle$, this.owner)))
			: resolveHandle(handle$, this.owner);
		if ((dependency as ScopedNode) === this.node) {
			throw new TypeError(formatClientError(112));
		}
		assertAlive(dependency.owner);
		let lease = current.dependencies.get(dependency);
		if (!lease) {
			const unsubscribe = subscribeNode(dependency, DerivedBinding.notify(current));
			const revision = dependency.revision;
			lease = { node: dependency, revision, unsubscribe };
			current.dependencies.set(dependency, lease);
		}
		return lease;
	}

	private static async readValue<T, V>(
		current: DerivedAttempt<T>,
		dependency: AttemptDependency,
	): Promise<V> {
		while (current.active) {
			// The mutable lease, not a shadow node or fork binding, crosses awaits.
			// An accepted stream can continue reading from its canonical owner.
			const state = untrack(() =>
				current.binding!.candidate
					? current.binding!.candidate.run(() => readNode(dependency.node as ScopedNode<V>))
					: readNode(dependency.node as ScopedNode<V>),
			);
			if (!current.active) break;
			if (state.snapshot.status === 'ready') {
				if (dependency.node.owner !== current.binding!.owner)
					current.owners!.add(dependency.node.owner);
				if (state.owners) {
					for (const owner of state.owners)
						if (owner !== current.binding!.owner) current.owners!.add(owner);
				}
				return state.snapshot.value;
			}
			if (state.snapshot.status === 'error') throw state.snapshot.error;
			if (state.snapshot.status === 'idle') {
				throw new Error(formatClientError(113, dependency.node.key));
			}
			// The foreign producer need not settle when this owner retires. Wake
			// only this read so its suspended stack releases the binding/dependency.
			current.cancelWaiting ??= new Promise<void>((resolve) => {
				current.cancelRead = resolve;
			});
			await Promise.race([state.waiting, current.cancelWaiting]);
		}
		throw new Error(formatClientError(111));
	}

	private valid(current: DerivedAttempt<T>): boolean {
		if (
			!current.active ||
			this.current !== current ||
			this.owner.retired ||
			this.owner.readBarrier !== undefined
		)
			return false;
		return this.validDependencies(current);
	}

	validDependencies(current: DerivedAttempt<T>): boolean {
		for (const dependency of current.dependencies.values()) {
			if (dependency.node.owner.retired || dependency.node.revision !== dependency.revision) {
				return false;
			}
		}
		return true;
	}

	private evaluate(): NodeState<T> {
		if (this.owner.readBarrier !== undefined) {
			this.frozen = true;
			return this.node.state?.snapshot.status === 'ready'
				? this.node.state
				: pendingState(this.owner.readBarrier);
		}
		this.stop(this.current);
		this.current = undefined;
		this.node.invalidateAttempt = undefined;
		const compute = this.compute!;
		const seeded = this.seeded;
		this.seeded = undefined;
		// A zero-argument synchronous computation is the common path. Do not pay
		// for an attempt, promise, AbortController, or context unless the authored
		// computation accepts the attempt API or actually returns async work.
		let current = compute.length ? attempt(this) : undefined;
		let result: T | PromiseLike<T | AsyncIterable<T>> | AsyncIterable<T>;
		try {
			result =
				seeded !== undefined
					? (seeded.result as T)
					: current
						? compute(DerivedBinding.context(current))
						: (compute as () => T | PromiseLike<T | AsyncIterable<T>> | AsyncIterable<T>)();
		} catch (error) {
			this.stop(current);
			if (isThenable(error)) throw error;
			return errorState(error);
		}
		if (this.options?.sync) {
			this.stop(current, false);
			this.asynchronous = false;
			return derivedValueState(this.node, result as T);
		}
		let iteratorFactory: (() => AsyncIterator<T>) | undefined;
		let thenable = false;
		try {
			iteratorFactory = asyncIterator<T>(result);
			thenable = isThenable(result);
		} catch (error) {
			this.stop(current);
			return errorState(error);
		}
		if (!thenable && !iteratorFactory) {
			this.stop(current, false);
			this.asynchronous = false;
			return derivedValueState(this.node, result as T);
		}
		this.asynchronous = true;
		// Captured render values alone never restart this work.
		this.owner.unkeyedState = true;
		current ??= attempt(this);
		this.current = current;
		this.node.invalidateAttempt = () => this.invalidateGraph();
		if (iteratorFactory) this.observeIterator(current, iteratorFactory);
		else DerivedBinding.observePromise(current, result as PromiseLike<T | AsyncIterable<T>>);
		return pendingState(
			current.waiting,
			iteratorFactory ? 'connecting' : 'none',
			undefined,
			current.resolve,
		);
	}

	private static observePromise<T>(
		current: DerivedAttempt<T>,
		result: PromiseLike<T | AsyncIterable<T>>,
	): void {
		Promise.resolve(result).then(
			(value) => {
				const binding = current.binding;
				if (!binding?.valid(current)) return;
				let iteratorFactory: (() => AsyncIterator<T>) | undefined;
				try {
					iteratorFactory = asyncIterator<T>(value);
				} catch (error) {
					binding.fail(current, error);
					return;
				}
				if (iteratorFactory) {
					publishNativeProducer(() =>
						publishNode(
							binding.node,
							pendingState(current.waiting, 'connecting', undefined, current.resolve),
						),
					);
					binding.observeIterator(current, iteratorFactory);
					return;
				}
				binding.accept(current, readyState(value as T));
			},
			(error) => current.binding?.fail(current, error),
		);
	}

	private observeIterator(
		current: DerivedAttempt<T>,
		iteratorFactory: () => AsyncIterator<T>,
	): void {
		try {
			const iterator = untrack(iteratorFactory);
			if (!this.valid(current)) {
				closeIterator(iterator);
				return;
			}
			current.iterator = iterator;
		} catch (error) {
			this.fail(current, error);
			return;
		}
		this.next(current);
	}

	private next(current: DerivedAttempt<T>): void {
		if (!this.valid(current) || !current.iterator) return;
		const wait = yieldForHostBudget();
		if (wait !== undefined) {
			wait.then(() => current.binding?.next(current));
			return;
		}
		let step: PromiseLike<IteratorResult<T>> | IteratorResult<T>;
		try {
			step = untrack(() => current.iterator!.next());
		} catch (error) {
			this.fail(current, error);
			return;
		}
		DerivedBinding.observeStep(current, step);
	}

	private static queueNext<T>(current: DerivedAttempt<T>): void {
		queueMicrotask(() => current.binding?.next(current));
	}

	private static observeStep<T>(
		current: DerivedAttempt<T>,
		step: PromiseLike<IteratorResult<T>> | IteratorResult<T>,
	): void {
		Promise.resolve(step).then(
			(result) => DerivedBinding.receiveStep(current, result),
			(error) => current.binding?.fail(current, error),
		);
	}

	private static receiveStep<T>(current: DerivedAttempt<T>, result: IteratorResult<T>): void {
		const binding = current.binding;
		if (!binding?.valid(current)) return;
		const wait = yieldForHostBudget();
		if (wait !== undefined) {
			wait.then(() => DerivedBinding.receiveStep(current, result));
			return;
		}
		if (!result || (typeof result !== 'object' && typeof result !== 'function')) {
			binding.fail(current, new TypeError(formatClientError(114)));
			return;
		}
		if (result.done) {
			if (!current.hasYielded) {
				binding.fail(current, new Error(formatClientError(115)));
				return;
			}
			const snapshot = binding.node.state?.snapshot;
			if (snapshot?.status === 'ready') {
				binding.accept(
					current,
					readyState(snapshot.value, { connection: 'closed', complete: true }),
				);
			}
			return;
		}
		current.hasYielded = true;
		binding.accept(
			current,
			readyState(result.value, { connection: 'open', complete: false }),
			false,
		);
		// Publish the yield before asking the producer for another one. Besides
		// providing a bounded cancellation point, this lets dependency writes
		// triggered by a subscriber close an async generator before it becomes
		// suspended inside its next nested `for await` pull.
		DerivedBinding.queueNext(current);
	}

	private accept(current: DerivedAttempt<T>, state: NodeState<T>, complete = true): void {
		if (!this.valid(current)) {
			this.invalidate(current);
			return;
		}
		if (state.snapshot.status === 'ready') {
			// Settling this producer does not settle the streams it follows. Prefix
			// reads and explicit post-await reads contribute the same activity.
			state = derivedValueState(
				this.node,
				state.snapshot.value,
				state.snapshot,
				current.dependencies.size ? current.dependencies.keys() : undefined,
			);
		}
		const previousOwners = this.node.state?.owners;
		if (previousOwners) for (const owner of previousOwners) current.owners!.add(owner);
		const published = current.owners!.size ? { ...state, owners: current.owners! } : state;
		publishNativeProducer(() => publishNode(this.node, published));
		if (complete) this.finish(current);
	}

	private fail(current: DerivedAttempt<T>, error: unknown): void {
		if (!this.valid(current)) return;
		publishNativeProducer(() =>
			publishNode(this.node, errorState(error, current.iterator ? 'closed' : 'none')),
		);
		this.finish(current);
	}

	private finish(current: DerivedAttempt<T>): void {
		if (this.current !== current) return;
		// Successful explicit reads remain dependencies of the settled value. A
		// later dependency change restarts this computation just like an ordinary
		// synchronous graph edge.
		current.active = false;
		current.controller = undefined;
		current.iterator = undefined;
		current.cancelRead?.();
		current.cancelWaiting = undefined;
		current.cancelRead = undefined;
		current.resolve();
	}

	private invalidate(current: DerivedAttempt<T>): void {
		if (this.current !== current || this.owner.retired) return;
		this.stop(current);
		this.current = undefined;
		signalBatch(() => {
			invalidateNode(this.node);
			refreshNode(this.node);
		});
	}

	invalidateGraph(): void {
		const current = this.current;
		if (!current) return;
		this.stop(current);
		if (this.current === current) this.current = undefined;
	}

	stop(current: DerivedAttempt<T> | undefined, cancel = true): void {
		if (!current) return;
		const active = current.active;
		const controller = current.controller;
		const iterator = current.iterator;
		current.active = false;
		current.binding = undefined;
		current.controller = undefined;
		current.iterator = undefined;
		// Published snapshots may share this Set; drop, rather than mutate, it.
		current.owners = undefined;
		for (const dependency of current.dependencies.values()) dependency.unsubscribe();
		current.dependencies.clear();
		current.cancelRead?.();
		current.cancelWaiting = undefined;
		current.cancelRead = undefined;
		current.resolve();
		if (!cancel || !active) return;
		if (controller) untrackCommitted(() => controller.abort());
		if (iterator) closeIterator(iterator);
	}

	/** Stop only unfinished asynchronous reads; settled dependency edges stay live. */
	suspend(): boolean {
		if (!this.current?.active) return false;
		this.frozen = true;
		const current = this.current;
		this.current = undefined;
		this.node.invalidateAttempt = undefined;
		// Retire the old waiting promise before cancellation can wake a reader.
		if (this.node.state?.snapshot.status !== 'ready') {
			this.node.state = pendingState(this.owner.readBarrier!);
		}
		this.stop(current);
		return true;
	}

	resume(): void {
		if (!this.frozen || this.owner.retired || this.owner.readBarrier !== undefined || !this.compute)
			return;
		this.frozen = false;
		invalidateNode(this.node);
		refreshNode(this.node);
	}

	dispose(): void {
		this.forgetStaged();
		this.probed = undefined;
		this.releaseView();
		this.stop(this.current);
		this.current = undefined;
		this.compute = undefined;
		this.candidate = undefined;
		this.node.invalidateAttempt = undefined;
	}
}
