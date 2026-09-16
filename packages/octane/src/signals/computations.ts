import { createDerivedCellWith } from './engine.js';
import {
	ScopedNode,
	CandidateUnsupportedError,
	assertAlive,
	attachObserver,
	derivedValueState,
	errorState,
	invalidateNode,
	isThenable,
	pendingState,
	publishNode,
	readNode,
	refreshNode,
	readyState,
	signalBatch,
	subscribeNode,
	untrack,
	untrackCommitted,
	type NodeState,
	type GraphOwner,
	type CandidateProducer,
	type SignalCandidateFrame,
} from './graph.js';
import { SIGNAL_DEPENDENT_NODE, type SignalDependencyNotify } from './read-protocol.js';
import {
	SIGNAL_OWNER_RESOLVE,
	type DerivedCompute,
	type DerivedContext,
	type DerivedOptions,
	type DerivedSignal,
	type OwnerBoundSignal,
	type Scope,
	type SignalHandle,
} from './types.js';

export function createDeclaredDerivedCell<T>(
	owner: Scope,
	key: string,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
): DerivedSignal<T> {
	return createDerivedCellWith(owner, key, compute, options, DerivedBinding);
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
		throw new TypeError('Attempt reads require an Octane signal handle.');
	}
	return resolved;
}

export class DerivedBinding<T> {
	private current: DerivedAttempt<T> | undefined;
	private compute: DerivedCompute<T> | undefined;
	private frozen = false;
	private candidate: SignalCandidateFrame | undefined;

	constructor(
		readonly owner: Scope & GraphOwner,
		readonly node: ScopedNode<T>,
		compute: DerivedCompute<T>,
		private readonly options?: DerivedOptions,
	) {
		this.compute = compute;
		node.compute = () => this.evaluate();
	}

	forkCandidate(target: ScopedNode<T>, frame: SignalCandidateFrame): CandidateProducer {
		if (this.frozen || this.owner.readBarrier || !this.compute) {
			throw new CandidateUnsupportedError('Frozen derived candidates are not supported.');
		}
		const fork = new DerivedBinding(this.owner, target, this.compute, this.options);
		fork.candidate = frame;
		return {
			dispose: () => fork.dispose(),
			dependencies: () => fork.current?.dependencies.keys() ?? [],
			prepare: () => {
				const state = target.state;
				// A caught error is an authoritative presentation, just like a ready
				// value. Unhandled reads still report the authored error to the frame.
				if (state?.snapshot.status !== 'ready' && state?.snapshot.status !== 'error')
					return state?.waiting
						? { status: 'pending', waiting: state.waiting }
						: { status: 'invalid' };
				const current = fork.current;
				const previous = this.current;
				return {
					status: 'ready',
					receipt: {
						validate: () =>
							!this.owner.retired &&
							this.owner.readBarrier === undefined &&
							this.compute !== undefined &&
							this.current === previous &&
							fork.current === current &&
							target.state === state &&
							(!current || (current.binding === fork && fork.validDependencies(current))),
						publish: () => {
							// Transfer producer authority without aborting the old attempt or
							// invoking authored code while canonical graph state is installing.
							this.current = current;
							if (current) current.binding = this;
							this.node.invalidateAttempt = current ? () => this.invalidateGraph() : undefined;
							fork.current = undefined;
							fork.candidate = undefined;
							target.invalidateAttempt = undefined;
							return () => {
								if (previous !== this.current) this.stop(previous);
							};
						},
						accept: () => {
							if (!current) return;
							const dependencies = [...current.dependencies.values()];
							const releases: (() => void)[] = [];
							current.dependencies.clear();
							for (const dependency of dependencies) {
								releases.push(dependency.unsubscribe);
								dependency.node = frame.canonical(dependency.node);
								dependency.revision = dependency.node.revision;
								// Canonical states and revisions are installed. Subscribe without
								// refresh/evaluation, and acquire every lease before releasing any.
								dependency.unsubscribe = attachObserver(
									dependency.node,
									DerivedBinding.notify(current),
									true,
								);
								current.dependencies.set(dependency.node, dependency);
							}
							for (const release of releases) release();
						},
					},
				};
			},
		};
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
					: Promise.reject(new Error('The derived attempt is no longer active.'));
			},
		};
	}

	private static notify<T>(current: DerivedAttempt<T>): SignalDependencyNotify {
		const notify: SignalDependencyNotify = () => current.binding?.invalidate(current);
		// Explicit reads are graph leases too. Discovery follows their dependent
		// identity without evaluating the computation or replaying this callback.
		notify[SIGNAL_DEPENDENT_NODE] = current.binding!.node;
		return notify;
	}

	private read<V>(current: DerivedAttempt<T>, handle$: SignalHandle<V>): Promise<V> {
		if (!current.active)
			return Promise.reject(new Error('The derived attempt is no longer active.'));
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
			throw new TypeError('A derived signal cannot read itself.');
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
				throw new Error(`Signal "${dependency.node.key}" has no selected value.`);
			}
			// The foreign producer need not settle when this owner retires. Wake
			// only this read so its suspended stack releases the binding/dependency.
			current.cancelWaiting ??= new Promise<void>((resolve) => {
				current.cancelRead = resolve;
			});
			await Promise.race([state.waiting, current.cancelWaiting]);
		}
		throw new Error('The derived attempt is no longer active.');
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

	private validDependencies(current: DerivedAttempt<T>): boolean {
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
		// A zero-argument synchronous computation is the common path. Do not pay
		// for an attempt, promise, AbortController, or context unless the authored
		// computation accepts the attempt API or actually returns async work.
		let current = compute.length ? attempt(this) : undefined;
		let result: T | PromiseLike<T | AsyncIterable<T>> | AsyncIterable<T>;
		try {
			result = current
				? compute(DerivedBinding.context(current))
				: (compute as () => T | PromiseLike<T | AsyncIterable<T>> | AsyncIterable<T>)();
		} catch (error) {
			this.stop(current);
			if (isThenable(error)) throw error;
			return errorState(error);
		}
		if (this.options?.sync) {
			this.stop(current, false);
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
			return derivedValueState(this.node, result as T);
		}
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
					signalBatch(() =>
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
			(result) => {
				const binding = current.binding;
				if (!binding?.valid(current)) return;
				if (!result || (typeof result !== 'object' && typeof result !== 'function')) {
					binding.fail(
						current,
						new TypeError('An async iterator must return an iteration result.'),
					);
					return;
				}
				if (result.done) {
					if (!current.hasYielded) {
						binding.fail(current, new Error('The stream completed without yielding a value.'));
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
			},
			(error) => current.binding?.fail(current, error),
		);
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
		signalBatch(() => publishNode(this.node, published));
		if (complete) this.finish(current);
	}

	private fail(current: DerivedAttempt<T>, error: unknown): void {
		if (!this.valid(current)) return;
		signalBatch(() =>
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

	private invalidateGraph(): void {
		const current = this.current;
		if (!current) return;
		this.stop(current);
		if (this.current === current) this.current = undefined;
	}

	private stop(current: DerivedAttempt<T> | undefined, cancel = true): void {
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
		this.stop(this.current);
		this.current = undefined;
		this.compute = undefined;
		this.candidate = undefined;
		this.node.invalidateAttempt = undefined;
	}
}
