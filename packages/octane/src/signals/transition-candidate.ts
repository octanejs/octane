import type {
	ScopedNode,
	NodeState,
	CandidateProducer,
	CandidateProducerReceipt,
	SignalReadMode,
} from './graph.js';
import { ScopeDisposedError, SignalFrameError } from './errors.js';
import {
	NativeAdoptionMiss,
	NATIVE_TRANSITION_CONSUMER,
	SIGNAL_DEPENDENT_NODE,
	type NativeReadSource,
	type NativeTransitionConsumer,
	type NativeTransitionNotify,
	type SignalDependencyNotify,
} from './read-protocol.js';
import {
	activeCandidate,
	addCandidateWriter,
	candidateGraph as bridge,
	candidateWriters,
	CandidateUnsupportedError,
	removeCandidateWriter,
	swapActiveSignalCandidate,
	swapCandidateInvalidation,
	withoutSignalCandidate,
} from './transition-state.js';

export type CandidatePreparation =
	| { status: 'ready'; token: object; receipt: { publish(accepted?: () => void): boolean } }
	| { status: 'pending'; token: object; wakeables: readonly PromiseLike<unknown>[] }
	| { status: 'error'; token: object; error: unknown }
	| { status: 'invalid'; token: object; reason: 'stale' | 'unsupported' };

function isThenable(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}

interface CandidateNode {
	readonly node: ScopedNode;
	readonly target: ScopedNode;
	revision: number;
	readonly epoch: number;
	readonly stop: () => void;
	producer?: CandidateProducer;
	written?: boolean;
	withdrawn?: boolean;
	urgentOperations?: Array<(previous: unknown) => unknown>;
	sources?: Partial<Record<SignalReadMode, ReturnType<typeof createNativeReadCandidateSource>>>;
}

interface PreparationWake {
	notify?: (event: { kind: 'retry' | 'invalid'; token: object }) => void;
	validate?: () => boolean;
	token?: object;
	queued: boolean;
	invalid: boolean;
}

function clearPreparationWake(watch: PreparationWake): void {
	watch.notify = undefined;
	watch.validate = undefined;
	watch.token = undefined;
}

function queuePreparationWake(watch: PreparationWake, invalid = false): void {
	if (!watch.notify) return;
	watch.invalid ||= invalid;
	if (watch.queued) return;
	watch.queued = true;
	queueMicrotask(() => {
		const notify = watch.notify;
		if (!notify) return;
		const token = watch.token!;
		const kind = watch.invalid || !watch.validate?.() ? 'invalid' : 'retry';
		clearPreparationWake(watch);
		notify({ kind, token });
	});
}

function settlePreparationWake(watch: PreparationWake): void {
	queuePreparationWake(watch);
}

/**
 * A candidate-only source keeps existing consumer and memo witnesses alive when
 * its graph is released. Acceptance is restricted to graph-native sources whose
 * revisions are monotonic and whose subscription operations run no user code.
 * The caller installs canonical state before accepting, and accepts all sources
 * before releasing the candidate graph or invoking public callbacks.
 */
function createNativeReadCandidateSource(candidate: NativeReadSource) {
	let target: NativeReadSource | undefined = candidate;
	let accepted = false;
	let acceptedVersion = NaN;
	let canonicalVersion = NaN;
	const subscriptions = new Set<{ notify: () => void; dispose: () => void }>();
	const source: NativeReadSource = {
		getVersion: () =>
			target === undefined
				? NaN
				: !accepted
					? target.getVersion()
					: target.getVersion() === canonicalVersion
						? acceptedVersion
						: NaN,
		subscribe(notify) {
			if (target === undefined) throw new TypeError('The native read candidate has retired.');
			const subscription = { notify, dispose: target.subscribe(notify) };
			subscriptions.add(subscription);
			return () => {
				if (subscriptions.delete(subscription)) subscription.dispose();
			};
		},
		serialize(version) {
			return source.getVersion() === version
				? target?.serialize?.(accepted ? canonicalVersion : version)
				: undefined;
		},
	};
	if (candidate.inspect) source.inspect = () => target!.inspect!();
	return {
		source,
		accept(canonical: NativeReadSource, observedVersion: number): boolean {
			if (accepted || target === undefined || target.getVersion() !== observedVersion) return false;
			const version = canonical.getVersion();
			const acquired = new Map<{ notify: () => void; dispose: () => void }, () => void>();
			try {
				for (const subscription of subscriptions)
					acquired.set(subscription, canonical.subscribe(subscription.notify));
			} catch (error) {
				for (const dispose of acquired.values()) dispose();
				throw error;
			}
			// Every canonical lease precedes any candidate lease release.
			acceptedVersion = observedVersion;
			canonicalVersion = version;
			target = canonical;
			accepted = true;
			if (!canonical.inspect) delete source.inspect;
			for (const [subscription, dispose] of acquired) {
				subscription.dispose();
				subscription.dispose = dispose;
			}
			return true;
		},
		discard(): void {
			if (accepted || target === undefined) return;
			target = undefined;
			delete source.inspect;
			for (const subscription of subscriptions) subscription.dispose();
			subscriptions.clear();
		},
	};
}

/**
 * Private transition graph. The renderer supplies admission through existing
 * presentation transactions; ordinary signal consumers do not retain this class.
 */
export class SignalCandidateFrame {
	private entries: Map<ScopedNode, CandidateNode> | undefined;
	private originals: Map<ScopedNode, ScopedNode> | undefined;
	private generation = 0;
	private active = true;
	private preparationToken: object | undefined;
	private preparationWatch: PreparationWake | undefined;
	private demand: Set<ScopedNode> | undefined;

	run<T>(callback: () => T): T {
		if (!this.active) throw new TypeError('The signal candidate has retired.');
		if (activeCandidate && activeCandidate !== this) {
			throw new CandidateUnsupportedError('Nested signal candidates are not supported.');
		}
		const previous = swapActiveSignalCandidate(this);
		try {
			return callback();
		} finally {
			swapActiveSignalCandidate(previous);
		}
	}

	resolve<T>(node: ScopedNode<T>): ScopedNode<T> {
		if (!this.active) throw new TypeError('The signal candidate has retired.');
		const original = this.originals?.get(node);
		if (original) {
			this.demand?.add(original);
			return node;
		}
		this.demand?.add(node);
		const existing = this.entries?.get(node);
		if (existing) return existing.target;
		if (bridge.historical() || node.owner.readBarrier || !node.owner.forkCandidate) {
			throw new CandidateUnsupportedError('Only live candidate-capable owners are supported.');
		}
		bridge.assertAlive(node.owner);
		// A receipt covers the discovered read set, not only the writes. A later
		// reader can introduce a pending query even when no writable value changes.
		this.invalidatePreparation();
		const target = new bridge.ScopedNode(node.owner, node.key, node.kind);
		target.state = node.state;
		target.last = node.last;
		target.lastState = node.lastState;
		target.hasLast = node.hasLast;
		const entry: CandidateNode = {
			node,
			target,
			revision: node.revision,
			epoch: node.owner.epoch,
			stop: bridge.attachObserver(
				node,
				() => {
					if (node.owner.retired) this.discard();
					else this.invalidatePreparation();
				},
				true,
			),
		};
		(this.entries ??= new Map()).set(node, entry);
		(this.originals ??= new Map()).set(target, node);
		try {
			entry.producer = node.owner.forkCandidate(node, target, this);
			const compute = target.compute;
			if (compute) target.compute = () => this.run(() => compute(target));
		} catch (error) {
			this.discard();
			throw error;
		}
		return target;
	}

	write<T>(node: ScopedNode<T>, value: T | ((previous: T) => T)): void {
		if (!this.validate()) throw new TypeError('Rebase the signal candidate before writing.');
		const target = this.resolve(node);
		const current = bridge.strictValue(bridge.refreshNode(target), node.key);
		let previous = current;
		const writers = candidateWriters?.get(node);
		// Separate transitions preserve chronological functional updates, but a
		// later replacement revokes the earlier intent even when it equals live state.
		if (typeof value === 'function')
			for (const writer of writers ?? []) {
				if (writer === this) continue;
				const pending = writer.entries!.get(node)!;
				previous = bridge.strictValue(bridge.refreshNode(pending.target), node.key);
				for (const operation of pending.urgentOperations ?? [])
					previous = bridge.untrack(() => bridge.pure(() => operation(previous))) as T;
			}
		const next =
			typeof value === 'function'
				? bridge.untrack(() => bridge.pure(() => (value as (previous: T) => T)(previous)))
				: value;
		// Evaluate before withdrawing anything: a throwing updater has no authority.
		let releases: (() => void)[] | undefined;
		for (const writer of writers ?? []) {
			if (writer === this) continue;
			const release = writer.replaceWrite(node);
			if (release) (releases ??= []).push(release);
		}
		try {
			if (Object.is(current, next)) return;
			const entry = this.entries!.get(node)!;
			if (!entry.written) {
				addCandidateWriter(node, this);
				entry.written = true;
			}
			this.generation++;
			this.invalidatePreparation();
			bridge.signalBatch(() => bridge.publishNode(target, bridge.readyState(next)));
		} finally {
			// The replacement owns its write before old producer cancellation can
			// synchronously enter another action or urgent setter.
			if (releases)
				this.committed(() => {
					for (const release of releases) release();
				});
		}
	}

	/** Only observed candidates allocate forwarding sources; ordinary reads keep their identity. */
	nativeSource(
		target: ScopedNode,
		read: SignalReadMode,
		source: NativeReadSource,
	): NativeReadSource {
		const entry = this.entries!.get(this.originals!.get(target)!)!;
		const sources = (entry.sources ??= {});
		return (sources[read] ??= createNativeReadCandidateSource(source)).source;
	}

	validate(): boolean {
		if (!this.active) return false;
		for (const entry of this.entries?.values() ?? []) {
			if (
				entry.withdrawn ||
				entry.urgentOperations !== undefined ||
				entry.node.owner.retired ||
				entry.epoch !== entry.node.owner.epoch ||
				entry.node.owner.readBarrier ||
				(entry.node.kind !== 'derived' && entry.revision !== entry.node.revision)
			)
				return false;
		}
		return true;
	}

	hasWrites(): boolean {
		for (const entry of this.entries?.values() ?? []) if (entry.written) return true;
		return false;
	}

	/** Follow existing graph edges, never the document or a global consumer registry. */
	consumers(): readonly NativeTransitionConsumer[] {
		const consumers = new Set<NativeTransitionConsumer>();
		const visited = new Set<ScopedNode>();
		for (const entry of this.entries?.values() ?? []) if (entry.written) visited.add(entry.node);
		for (const node of visited) {
			for (let link = node.subs; link; link = link.nextSub) {
				const subscriber = link.sub;
				if (subscriber instanceof bridge.ScopedNode) visited.add(subscriber);
				else {
					const notify = (subscriber as import('./graph.js').SignalObserver).notify;
					const dependent = (notify as SignalDependencyNotify | undefined)?.[SIGNAL_DEPENDENT_NODE];
					if (dependent) visited.add(dependent);
					const consumer = (notify as NativeTransitionNotify | undefined)?.[
						NATIVE_TRANSITION_CONSUMER
					];
					if (consumer?.active()) consumers.add(consumer);
				}
			}
		}
		return [...consumers];
	}

	/** Canonical memo witnesses cannot justify skipping a private forward read. */
	observes(node: ScopedNode): boolean {
		return this.originals?.has(node) ?? false;
	}

	canonical<T>(node: ScopedNode<T>): ScopedNode<T> {
		return (this.originals?.get(node) as ScopedNode<T> | undefined) ?? node;
	}

	/** Record intent without evaluating the forward graph in an urgent setter. */
	recordUrgentWrite(node: ScopedNode, value: unknown): (() => void) | undefined {
		if (typeof value !== 'function') return this.replaceWrite(node);
		const entry = this.entries?.get(node);
		if (!this.active || !entry?.written) return;
		this.generation++;
		this.invalidatePreparation();
		(entry.urgentOperations ??= []).push(value as (previous: unknown) => unknown);
	}

	private replaceWrite(node: ScopedNode): (() => void) | undefined {
		const entry = this.entries?.get(node);
		if (!this.active || !entry?.written) return;
		this.generation++;
		this.invalidatePreparation();
		entry.withdrawn = true;
		entry.urgentOperations = undefined;
		this.forgetWrite(entry);
		if (this.hasWrites()) return;
		this.active = false;
		return () => this.release();
	}

	private forgetWrite(entry: CandidateNode): void {
		if (!entry.written) return;
		entry.written = false;
		removeCandidateWriter(entry.node, this);
	}

	/** Urgent writes win their own cells without restarting unaffected producer leases. */
	rebase(): void {
		if (!this.active) throw new TypeError('The signal candidate has retired.');
		const hadWrites = this.hasWrites();
		this.generation++;
		this.invalidatePreparation();
		bridge.signalBatch(() => {
			for (const entry of this.entries?.values() ?? []) {
				bridge.assertAlive(entry.node.owner);
				if (entry.epoch !== entry.node.owner.epoch || entry.node.owner.readBarrier) {
					throw new TypeError('The candidate owner changed lifetime.');
				}
				const operations = entry.urgentOperations;
				if (!entry.withdrawn && !operations && entry.revision === entry.node.revision) continue;
				entry.revision = entry.node.revision;
				if (entry.node.kind === 'signal') {
					let state = entry.node.state!;
					if (operations) {
						let value = bridge.strictValue(bridge.refreshNode(entry.target), entry.node.key);
						for (const operation of operations)
							value = this.run(() => bridge.untrack(() => bridge.pure(() => operation(value))));
						if (!Object.is(value, bridge.strictValue(state, entry.node.key)))
							state = bridge.readyState(value);
						else this.forgetWrite(entry);
					} else this.forgetWrite(entry);
					entry.withdrawn = false;
					entry.urgentOperations = undefined;
					bridge.publishNode(entry.target, state);
				}
			}
		});
		if (hadWrites && !this.hasWrites()) this.discard();
	}

	prepare(reads: readonly (() => unknown)[] = []): CandidatePreparation {
		if (this.preparationWatch) clearPreparationWake(this.preparationWatch);
		this.preparationWatch = undefined;
		this.preparationToken = undefined;
		const token = {};
		if (!this.validate()) return { status: 'invalid', token, reason: 'stale' };
		const generation = this.generation;
		let waiting: Set<PromiseLike<unknown>> | undefined;
		let failed = false;
		let failure: unknown;
		let invalid: 'stale' | 'unsupported' | undefined;
		const observeFailure = (error: unknown, handled = false): void => {
			if (error instanceof CandidateUnsupportedError) invalid = 'unsupported';
			else if (
				error instanceof ScopeDisposedError ||
				error instanceof SignalFrameError ||
				error instanceof NativeAdoptionMiss
			)
				invalid ??= 'stale';
			else if (!handled) {
				try {
					if (isThenable(error)) {
						(waiting ??= new Set()).add(error);
						return;
					}
				} catch (inspectionError) {
					error = inspectionError;
				}
				if (!failed) failure = error;
				failed = true;
			}
		};
		// Callers admit actual presentation readers; ordinary notify callbacks are
		// never replayed. Start independent reads even when an earlier one suspends.
		const demand = reads.length ? new Set<ScopedNode>() : undefined;
		this.demand = demand;
		for (const read of reads) {
			try {
				this.run(() => bridge.pure(read));
			} catch (error) {
				observeFailure(error);
			}
		}
		this.demand = undefined;
		if (demand) this.pruneDemand(demand);
		const prepared: {
			entry: CandidateNode;
			state: NodeState;
			last: unknown;
			lastState: NodeState | undefined;
			hasLast: boolean;
			revision: number;
			producer: CandidateProducerReceipt | undefined;
		}[] = [];
		// Only this presentation's demand and surviving write intent can hold it.
		for (const entry of this.entries?.values() ?? []) {
			let state: NodeState;
			let producer: CandidateProducerReceipt | undefined;
			try {
				state = this.run(() => bridge.refreshNode(entry.target));
				const outcome = entry.producer?.prepare();
				if (outcome?.status === 'pending') (waiting ??= new Set()).add(outcome.waiting);
				else if (outcome?.status === 'error') observeFailure(outcome.error);
				else if (outcome?.status === 'invalid') invalid ??= 'unsupported';
				else if (outcome?.status === 'ready') producer = outcome.receipt;
			} catch (error) {
				observeFailure(error);
				continue;
			}
			if (state.snapshot.status === 'pending' && state.waiting)
				(waiting ??= new Set()).add(state.waiting);
			else if (state.snapshot.status === 'error')
				// Actual presentation reads decide whether an authored error escaped.
				// Compiler-selected scalar and general derived paths must agree here.
				observeFailure(state.snapshot.error, reads.length > 0 || producer !== undefined);
			else if (state.snapshot.status === 'idle' && !producer) invalid ??= 'unsupported';
			prepared.push({
				entry,
				state,
				last: entry.target.last,
				lastState: entry.target.lastState,
				hasLast: entry.target.hasLast,
				revision: entry.target.revision,
				producer,
			});
		}
		if (invalid) return { status: 'invalid', token, reason: invalid };
		if (!this.validate() || generation !== this.generation)
			return { status: 'invalid', token, reason: 'stale' };
		// Discovery during this sweep is part of its receipt. Only subsequent
		// discovery invalidates it; owner epochs and write generations still fence it.
		this.preparationToken = token;
		if (failed) return { status: 'error', token, error: failure };
		if (waiting?.size) return { status: 'pending', token, wakeables: [...waiting] };
		return {
			status: 'ready',
			token,
			receipt: {
				publish: (accepted) => {
					if (
						!this.validate() ||
						token !== this.preparationToken ||
						generation !== this.generation ||
						prepared.some(({ entry, state, last, lastState, hasLast, revision, producer }) => {
							if (
								entry.target.revision !== revision ||
								!Object.is(entry.target.last, last) ||
								entry.target.lastState !== lastState ||
								entry.target.hasLast !== hasLast
							)
								return true;
							if (state.owners) for (const owner of state.owners) if (owner.retired) return true;
							if (lastState?.owners && lastState.owners !== state.owners)
								for (const owner of lastState.owners) if (owner.retired) return true;
							return producer !== undefined && !producer.validate();
						})
					)
						return false;
					const releases: (() => void)[] = [];
					const changed: ScopedNode[] = [];
					this.committed(() =>
						bridge.signalBatch(() => {
							// Guard prepared nodes from propagation through their old/new edges.
							// Alien still owns frontier traversal; every changed node propagates once.
							for (const { entry } of prepared) entry.node.flags |= bridge.flags.Dirty;
							for (const { entry, state, last, lastState, hasLast, producer } of prepared) {
								const { node, target } = entry;
								if (producer) releases.push(producer.publish());
								while (node.deps) bridge.graph.unlink(node.deps, node);
								for (let link = target.deps; link; link = link.nextDep) {
									const original = this.originals!.get(link.dep as ScopedNode);
									if (!original) throw new TypeError('Candidate dependency escaped its frame.');
									bridge.link(original, node);
								}
								const currentChanged =
									node.state?.snapshot !== state.snapshot || !bridge.sameState(node.state, state);
								const retainedChanged =
									node.hasLast !== hasLast ||
									!Object.is(node.last, last) ||
									(lastState
										? !bridge.sameState(node.lastState, lastState)
										: node.lastState !== undefined);
								if (currentChanged) bridge.commitState(node, state);
								if (node.lastState?.owners !== lastState?.owners)
									bridge.releaseRetainedOwners(node);
								node.last = last;
								node.lastState = lastState;
								node.hasLast = hasLast;
								if (state.snapshot.status !== 'ready') bridge.retainOwners(node);
								// An unchanged error/idle snapshot can still expose a new latest
								// value. Native witnesses and latest-derived consumers must advance.
								if (!currentChanged && retainedChanged) node.revision++;
								if (currentChanged || retainedChanged) changed.push(node);
							}
							this.active = false;
							const previous = swapCandidateInvalidation(true);
							try {
								for (const node of changed) {
									if (node.subs) {
										bridge.graph.propagate(node.subs, false);
										bridge.graph.shallowPropagate(node.subs);
									}
								}
							} finally {
								swapCandidateInvalidation(previous);
							}
							for (const { entry } of prepared) {
								entry.node.flags = bridge.flags.Mutable | bridge.flags.Watching;
							}
							try {
								for (const { producer } of prepared) producer?.accept?.();
								// Keep accepted render and memo witnesses subscribed after the
								// private graph retires. Canonical state is already installed;
								// neither graph-native subscription operation invokes user code.
								for (const { entry, revision } of prepared) {
									if (!entry.sources) continue;
									for (const read of ['value', 'latest', 'snapshot'] as const) {
										const source = entry.sources[read];
										if (!source) continue;
										const field =
											read === 'value'
												? 'nativeSource'
												: read === 'latest'
													? 'nativeLatestSource'
													: 'nativeSnapshotSource';
										source.accept(
											(entry.node[field] ??= bridge.createNativeSource(entry.node, read)),
											revision,
										);
									}
								}
								accepted?.();
							} finally {
								this.release();
								for (const release of releases) release();
							}
						}),
					);
					return true;
				},
			},
		};
	}

	watchPreparation(
		outcome: CandidatePreparation,
		notify: NonNullable<PreparationWake['notify']>,
	): () => void {
		if (this.preparationWatch) clearPreparationWake(this.preparationWatch);
		this.preparationWatch = undefined;
		if (outcome.status !== 'pending') return () => {};
		const token = outcome.token;
		const watch: PreparationWake = {
			notify,
			token,
			queued: false,
			invalid: false,
			validate: () => token === this.preparationToken && this.validate(),
		};
		this.preparationWatch = watch;
		if (!watch.validate!()) queuePreparationWake(watch, true);
		else
			for (const waiting of outcome.wakeables) {
				const settled = settlePreparationWake.bind(null, watch);
				Promise.resolve(waiting).then(settled, settled);
			}
		return () => clearPreparationWake(watch);
	}

	private invalidatePreparation(): void {
		this.preparationToken = undefined;
		const watch = this.preparationWatch;
		this.preparationWatch = undefined;
		if (watch) {
			// Unsettled promises retain only this revocable watch, never the frame.
			watch.validate = undefined;
			queuePreparationWake(watch, true);
		}
	}

	private pruneDemand(demand: Set<ScopedNode>): void {
		for (const entry of this.entries?.values() ?? []) if (entry.written) demand.add(entry.node);
		// Cached computations need no re-evaluation, but their existing dependency
		// edges still own producer leases. Set iteration includes newly added edges.
		for (const node of demand) {
			const entry = this.entries?.get(node);
			for (let link = entry?.target.deps; link; link = link.nextDep) {
				const original = this.originals?.get(link.dep as ScopedNode);
				if (original) demand.add(original);
			}
			for (const dependency of entry?.producer?.dependencies?.() ?? []) {
				demand.add(this.canonical(dependency));
			}
		}
		let removed: CandidateNode[] | undefined;
		for (const entry of this.entries?.values() ?? []) {
			if (demand.has(entry.node)) continue;
			this.entries!.delete(entry.node);
			this.originals!.delete(entry.target);
			this.releaseEntry(entry);
			(removed ??= []).push(entry);
		}
		// Revoke all obsolete graph authority before producer aborts can reenter.
		if (removed)
			this.committed(() => {
				for (const entry of removed) entry.producer?.dispose();
			});
	}

	discard(): void {
		if (!this.active) return;
		this.active = false;
		this.generation++;
		this.invalidatePreparation();
		this.release();
	}

	private release(): void {
		if (this.preparationWatch) clearPreparationWake(this.preparationWatch);
		this.preparationWatch = undefined;
		this.preparationToken = undefined;
		const entries = this.entries;
		this.entries = undefined;
		this.originals = undefined;
		this.demand = undefined;
		for (const entry of entries?.values() ?? []) this.releaseEntry(entry);
		// All publication authority and graph edges are gone before producer aborts.
		this.committed(() => {
			for (const entry of entries?.values() ?? []) entry.producer?.dispose();
		});
	}

	private releaseEntry(entry: CandidateNode): void {
		if (entry.sources) for (const source of Object.values(entry.sources)) source.discard();
		this.forgetWrite(entry);
		entry.urgentOperations = undefined;
		entry.stop();
		bridge.removeQueued(entry.target);
		while (entry.target.deps) bridge.graph.unlink(entry.target.deps, entry.target);
		while (entry.target.subs) bridge.graph.unlink(entry.target.subs);
		bridge.releaseRetention(entry.target);
		entry.target.compute = undefined;
	}

	private committed<T>(callback: () => T): T {
		return withoutSignalCandidate(callback);
	}
}
