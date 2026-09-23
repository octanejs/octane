import { decodeSignalValue, encodeSignalValue, snapshotSignalValue } from './encoding.js';
import { ScopeDisposedError, SignalFrameError, SignalSerializationError } from './errors.js';
import { scopeStreams, type ScopeStreams } from './scope-streams.js';
import {
	ScopedNode,
	CandidateUnsupportedError,
	assertAlive,
	assertWritable,
	derivedState,
	endSignalBatch,
	inspectNativeNode,
	isThenable,
	readNode,
	readyState,
	refreshNode,
	retireGraph,
	setHistoricalReader,
	signalBatch,
	startSignalBatch,
	strictValue,
	untrack,
	type GraphOwner,
	type CandidateProducer,
	type NodeState,
	type SignalObserver,
	type SignalReadMode,
	type SignalCandidateFrame,
} from './graph.js';
import {
	NativeAdoptionMiss,
	beginNativeWriteGuard,
	endNativeWriteGuard,
	getNativeAdoptionResolver,
	registerNativeBatchHooks,
	reportNativeRead,
	type NativeReadSource,
	type NativeSerializedScope,
} from './read-protocol.js';
import type {
	initializeResource,
	QueryDefinition,
	RequestEntry,
	ResourceBinding,
} from './requests.js';
import type {
	StreamFrameIdentity,
	StreamedSignalResultFrame,
} from '../streamed-signals-protocol.js';
import type {
	AdoptionFrame,
	DerivedSignal,
	DerivedCompute,
	DerivedOptions,
	QueryRequest,
	Resource,
	Scope,
	ScopeInspection,
	ScopeOptions,
	ScopeSeed,
	skip,
	SignalHandle,
	SignalSeedEntry,
	SignalTraceEvent,
	WritableSignal,
} from './types.js';

interface DecodedSeedEntry {
	readonly entry: SignalSeedEntry;
	readonly value: unknown;
}

/** Owner lifecycle shared by scalar and asynchronous declaration implementations. */
export interface DerivedBindingLifecycle {
	suspend(): boolean;
	resume(): void;
	dispose(): void;
	forkCandidate?(target: ScopedNode, frame: SignalCandidateFrame): CandidateProducer | undefined;
}

type DerivedBindingFactory<T> = new (
	owner: ScopeImpl,
	node: ScopedNode<T>,
	compute: DerivedCompute<T>,
	options?: DerivedOptions,
) => DerivedBindingLifecycle;

interface FrameData {
	readonly owner: ScopeImpl;
	readonly entries: Map<string, DecodedSeedEntry>;
	references: number;
}

let activeFrames: Map<ScopeImpl, AdoptionFrameImpl> | undefined;

registerNativeBatchHooks({ startBatch: startSignalBatch, endBatch: endSignalBatch });

function requireKey(key: string, label: string): void {
	if (typeof key !== 'string' || !key.trim()) {
		throw new TypeError(`${label} must be a nonempty string.`);
	}
}

function seedKey(key: string, read: SignalReadMode = 'value'): string {
	return `${read}:${key}`;
}

function seedState(seed: DecodedSeedEntry): NodeState {
	return readyState(seed.value, {
		complete: seed.entry.complete,
		refreshing: seed.entry.refreshing,
		connection: seed.entry.connection,
		requestKey: seed.entry.request
			? JSON.stringify([seed.entry.request.queryKey, seed.entry.request.argument])
			: undefined,
	});
}

function decodeSeed(scopeKey: string, seed: ScopeSeed): Map<string, DecodedSeedEntry> {
	// A seed is plain wire data, even when supplied directly rather than parsed
	// from JSON. Validate descriptors before reading fields so accessors cannot
	// execute while constructing an immutable historical view.
	seed = snapshotSignalValue(seed) as ScopeSeed;
	if (!seed || seed.version !== 1 || seed.scopeKey !== scopeKey || !Array.isArray(seed.entries)) {
		throw new SignalFrameError(`A signal seed must match scope "${scopeKey}" and version 1.`);
	}
	const entries = new Map<string, DecodedSeedEntry>();
	for (const entry of seed.entries) {
		const read = entry?.read ?? 'value';
		if (
			!entry ||
			typeof entry.key !== 'string' ||
			!entry.key.trim() ||
			!['signal', 'derived', 'async'].includes(entry.kind) ||
			typeof entry.complete !== 'boolean' ||
			!['value', 'latest', 'snapshot'].includes(read) ||
			(entry.available !== undefined &&
				(read !== 'latest' || typeof entry.available !== 'boolean')) ||
			(entry.refreshing !== undefined && typeof entry.refreshing !== 'boolean') ||
			(entry.connection !== undefined &&
				!['none', 'connecting', 'open', 'closed'].includes(entry.connection)) ||
			entries.has(seedKey(entry.key, read))
		) {
			throw new SignalFrameError('Signal seeds require unique, valid ready node entries.');
		}
		const value = decodeSignalValue(entry.value);
		if (
			entry.available === false &&
			(value !== undefined || entry.complete || entry.request !== undefined)
		) {
			throw new SignalFrameError(
				'An unavailable latest entry cannot contain a ready value or request.',
			);
		}
		let request: SignalSeedEntry['request'];
		if (entry.kind === 'async' && entry.available !== false) {
			if (
				!entry.request ||
				typeof entry.request.queryKey !== 'string' ||
				!entry.request.queryKey.trim() ||
				!['promise', 'stream'].includes(entry.request.kind)
			) {
				throw new SignalFrameError('Async seed entries require a query identity.');
			}
			// The outer snapshot already owns this immutable encoded argument.
			// Decode for canonical validation, then retain it without encoding again.
			decodeSignalValue(entry.request.argument);
			request = {
				queryKey: entry.request.queryKey,
				kind: entry.request.kind,
				argument: entry.request.argument,
			};
		} else if (entry.request !== undefined) {
			throw new SignalFrameError('Only async seed entries may contain a query identity.');
		}
		entries.set(seedKey(entry.key, read), {
			value,
			entry: {
				key: entry.key,
				kind: entry.kind,
				value: entry.value,
				complete: entry.complete,
				...(read !== 'value' ? { read } : {}),
				...(entry.available === false ? { available: false } : {}),
				...(entry.refreshing !== undefined ? { refreshing: entry.refreshing } : {}),
				...(entry.connection !== undefined ? { connection: entry.connection } : {}),
				...(request ? { request } : {}),
			},
		});
	}
	return entries;
}

export class ScopeImpl implements Scope, GraphOwner {
	readonly nodes = new Map<string, ScopedNode>();
	readonly observers = new Set<SignalObserver>();
	// Optional capabilities allocate on first use. A scope holding only writable
	// and synchronous derived signals, such as every `useSignal$` hook scope,
	// never pays for request, resource, stream, adoption or trace bookkeeping.
	requests: Map<string, RequestEntry> | undefined = undefined;
	queryDefinitions: Map<string, QueryDefinition> | undefined = undefined;
	resources: Map<ScopedNode, ResourceBinding> | undefined = undefined;
	streams: ScopeStreams | undefined = undefined;
	derivedBindings: Map<ScopedNode, DerivedBindingLifecycle> | undefined = undefined;
	frames: Set<AdoptionFrameImpl> | undefined = undefined;
	private readonly seedEntries: Map<string, DecodedSeedEntry> | undefined;
	private readonly traceLimit: number;
	private events: SignalTraceEvent[] | undefined = undefined;
	private sequence = 0;
	private lifetime = 0;
	private disposed = false;
	readBarrier: Promise<void> | undefined;

	/** Internal document lifecycle: mark every owner before cancellation runs user code. */
	suspendReads(): void {
		if (this.disposed || this.readBarrier === undefined) return;
		this.streams?.suspend();
		if (this.requests) for (const entry of this.requests.values()) entry.stopAttempt();
		if (this.derivedBindings)
			for (const binding of this.derivedBindings.values()) binding.suspend();
	}

	resumeReads(): void {
		if (this.disposed || this.readBarrier !== undefined) return;
		signalBatch(() => {
			// Refresh descriptions first: cancellation callbacks may have selected a
			// different key. Only entries still retained by consumers may restart.
			if (this.resources)
				for (const [node, binding] of this.resources) {
					refreshNode(node);
					this.streams?.resume(node, binding);
				}
			// Refreshing may have created the first request map.
			if (this.requests)
				for (const entry of this.requests.values()) {
					if (this.readBarrier !== undefined) break;
					if (
						!entry.active &&
						!entry.state.snapshot.complete &&
						entry.state.snapshot.status !== 'error' &&
						entry.consumers.size
					) {
						entry.start(entry.state.snapshot.status !== 'ready');
					}
				}
			if (this.derivedBindings)
				for (const binding of this.derivedBindings.values()) binding.resume();
		});
	}

	constructor(
		private readonly key: string,
		options: ScopeOptions,
		readonly seedable = true,
	) {
		requireKey(key, 'scopeKey');
		const traceLimit = options.debug ? (options.debug.traceLimit ?? 256) : 0;
		if (!Number.isInteger(traceLimit) || traceLimit < 0 || traceLimit > 10_000) {
			throw new RangeError('Signal traceLimit must be an integer from 0 through 10000.');
		}
		this.traceLimit = traceLimit;
		this.seedEntries = options.seed ? decodeSeed(key, options.seed) : undefined;
	}

	get scopeKey(): string {
		return this.key;
	}

	get epoch(): number {
		return this.lifetime;
	}

	get retired(): boolean {
		return this.disposed;
	}

	private createNode<T>(
		key: string,
		kind: ScopedNode['kind'],
		allowDuringRead = false,
	): ScopedNode<T> {
		assertAlive(this);
		// Component-local hook initialization is an allocation in its existing
		// render lifetime, never a write to an already committed signal.
		if (this.seedable && !allowDuringRead) assertWritable();
		requireKey(key, 'Signal key');
		if (this.nodes.has(key))
			throw new TypeError(`Signal key "${key}" already exists in this scope.`);
		const seeds = this.seedEntries;
		if (seeds)
			for (const read of ['value', 'latest', 'snapshot'] as const) {
				const seed = seeds.get(seedKey(key, read));
				if (seed && seed.entry.kind !== kind) {
					throw new SignalFrameError(`Signal seed kind does not match "${key}".`);
				}
			}
		const node = new ScopedNode<T>(this, key, kind);
		this.nodes.set(key, node);
		return node;
	}

	private declaredNode<T>(key: string, kind: ScopedNode['kind']): [ScopedNode<T>, boolean] {
		assertAlive(this);
		requireKey(key, 'Signal key');
		const existing = this.nodes.get(key);
		if (existing) {
			if (existing.kind !== kind) {
				throw new TypeError(`Signal key "${key}" already has kind "${existing.kind}".`);
			}
			return [existing as ScopedNode<T>, false];
		}
		return [this.createNode<T>(key, kind, true), true];
	}

	private initialSeed(key: string): DecodedSeedEntry | undefined {
		const seeds = this.seedEntries;
		return seeds && (seeds.get(seedKey(key)) ?? seeds.get(seedKey(key, 'snapshot')));
	}

	private retainedSeed(key: string): DecodedSeedEntry | undefined {
		const seeds = this.seedEntries;
		if (!seeds) return undefined;
		const seed = seeds.get(seedKey(key, 'latest')) ?? this.initialSeed(key);
		return seed?.entry.available === false ? undefined : seed;
	}

	private initializeRetention(node: ScopedNode): void {
		const seed = this.retainedSeed(node.key);
		if (!seed) return;
		node.lastState = seedState(seed);
		node.last = seed.value;
		node.hasLast = true;
	}

	private consumeSeed(key: string): void {
		const seeds = this.seedEntries;
		if (seeds)
			for (const read of ['value', 'latest', 'snapshot'] as const) {
				seeds.delete(seedKey(key, read));
			}
	}

	signal$<T>(key: string, initial: T): WritableSignal<T> {
		const node = this.createNode<T>(key, 'signal');
		const seed = this.initialSeed(key) ?? this.retainedSeed(key);
		node.state = readyState(seed ? (seed.value as T) : initial);
		node.lastState = node.state;
		node.last = (node.state.snapshot as { value: T }).value;
		node.hasLast = true;
		this.consumeSeed(key);
		return node as WritableSignal<T>;
	}

	createSignalDeclaration<T>(key: string, initial: T, preferInitial = false): WritableSignal<T> {
		const [node, created] = this.declaredNode<T>(key, 'signal');
		if (!created) return node as WritableSignal<T>;
		const seed = this.initialSeed(key) ?? this.retainedSeed(key);
		node.state = readyState(seed && !preferInitial ? (seed.value as T) : initial);
		node.lastState = node.state;
		node.last = (node.state.snapshot as { value: T }).value;
		node.hasLast = true;
		this.consumeSeed(key);
		return node as WritableSignal<T>;
	}

	derived$<T>(
		key: string,
		compute: (() => T) & (T extends PromiseLike<unknown> ? never : unknown),
	): DerivedSignal<T> {
		if (typeof compute !== 'function') throw new TypeError('derived$ requires a function.');
		const node = this.createNode<T>(key, 'derived');
		node.compute = (target) => derivedState(target, compute);
		this.initializeRetention(node);
		// Live derived values always reflect live inputs, including edits made
		// before this node was created. Only an adoption frame reads historical
		// computed values from a seed.
		this.consumeSeed(key);
		return node as DerivedSignal<T>;
	}

	/** Candidate state is private; the ordinary node/binding maps stay untouched. */
	forkCandidate(
		node: ScopedNode,
		target: ScopedNode,
		frame: SignalCandidateFrame,
	): CandidateProducer | undefined {
		if (this.nodes.get(node.key) !== node || this.readBarrier || this.frames?.size) {
			throw new CandidateUnsupportedError('Candidate frames require live, non-adopting nodes.');
		}
		const resource = this.resources?.get(node);
		if (resource) return resource.forkCandidate(target);
		const binding = this.derivedBindings?.get(node);
		if (binding) {
			if (!binding.forkCandidate) {
				throw new CandidateUnsupportedError(
					'Async derived candidates are not supported by this prototype.',
				);
			}
			return binding.forkCandidate(target, frame);
		}
		target.compute = node.compute;
	}

	createDerivedDeclaration<T>(
		key: string,
		compute: DerivedCompute<T>,
		options: DerivedOptions | undefined,
		Binding: DerivedBindingFactory<T>,
	): DerivedSignal<T> {
		if (typeof compute !== 'function') throw new TypeError('derived$ requires a function.');
		const [node, created] = this.declaredNode<T>(key, 'derived');
		if (!created) return node as DerivedSignal<T>;
		const binding = new Binding(this, node, compute, options);
		(this.derivedBindings ??= new Map()).set(node, binding);
		this.initializeRetention(node);
		this.consumeSeed(key);
		return node as DerivedSignal<T>;
	}

	createResourceDeclaration<T>(
		key: string,
		describe: () => QueryRequest<T> | typeof skip,
		initialize: typeof initializeResource,
		unique = false,
	): Resource<T> {
		if (typeof describe !== 'function')
			throw new TypeError('A query resource requires a description.');
		let node: ScopedNode<T>;
		if (unique) node = this.createNode<T>(key, 'async');
		else {
			const [declared, created] = this.declaredNode<T>(key, 'async');
			if (!created) return declared as Resource<T>;
			node = declared;
		}
		const seed = this.initialSeed(key);
		const retained = this.retainedSeed(key);
		this.initializeRetention(node);
		signalBatch(() => {
			const binding = initialize(this, node, describe, seed, retained);
			(this.resources ??= new Map()).set(node, binding);
			refreshNode(node);
			// A selection bound before this declaration ran may already hold results.
			this.streams?.flush(node, binding);
		});
		this.consumeSeed(key);
		return node as Resource<T>;
	}

	private own<T>(handle$: SignalHandle<T>): ScopedNode<T> {
		assertAlive(this);
		if (!(handle$ instanceof ScopedNode) || handle$.owner !== this) {
			throw new TypeError('Read or write a signal through its owning scope or its handle.');
		}
		return handle$;
	}

	get<T>(handle$: SignalHandle<T>): T {
		const node = this.own(handle$);
		return strictValue(readNode(node), node.key);
	}

	set<T>(handle$: WritableSignal<T>, value: T | ((previous: T) => T)): void {
		this.own(handle$).set(value);
	}

	isPending(read: () => unknown): boolean {
		assertAlive(this);
		try {
			read();
			return false;
		} catch (error) {
			if (isThenable(error)) return true;
			throw error;
		}
	}

	batch<T>(write: () => T): T {
		assertAlive(this);
		return signalBatch(write);
	}

	action<F extends (...args: any[]) => any>(write: F): F {
		if (typeof write !== 'function') throw new TypeError('A signal action requires a function.');
		const owner = this;
		return function (this: unknown, ...args: Parameters<F>): ReturnType<F> {
			return owner.batch(() => write.apply(this, args));
		} as F;
	}

	seedEntry(node: ScopedNode, read: SignalReadMode = 'value'): SignalSeedEntry | undefined {
		const current = node.state?.snapshot;
		if (
			current?.status === 'error' &&
			(current.error instanceof ScopeDisposedError ||
				current.error instanceof SignalFrameError ||
				current.error instanceof NativeAdoptionMiss)
		) {
			throw current.error;
		}
		const presented =
			read === 'latest' && node.state?.snapshot.status !== 'ready' ? node.lastState : node.state;
		// A producer's cancellation callback may serialize before graph teardown.
		// Only still-live inputs may be copied into a new historical handoff.
		if (presented?.owners) for (const owner of presented.owners) assertAlive(owner);
		const snapshot = presented?.snapshot;
		if (snapshot?.status !== 'ready') {
			if (read !== 'latest') return undefined;
			return {
				key: node.key,
				kind: node.kind,
				read,
				available: false,
				value: ['undefined'],
				complete: false,
			};
		}
		const request = this.resources?.get(node)?.seedRequest(read === 'latest');
		if (node.kind === 'async' && !request) return undefined;
		return {
			key: node.key,
			kind: node.kind,
			...(read !== 'value' ? { read } : {}),
			value: encodeSignalValue(snapshot.value),
			complete: snapshot.complete,
			refreshing: snapshot.refreshing,
			connection: snapshot.connection,
			...(request ? { request } : {}),
		};
	}

	serialize(): ScopeSeed {
		assertAlive(this);
		if (!this.seedable)
			throw new SignalSerializationError('Local hook scopes do not create SSR seeds.');
		return untrack(() => {
			const entries: SignalSeedEntry[] = [];
			for (const node of this.nodes.values()) {
				refreshNode(node);
				const entry = this.seedEntry(node) ?? this.seedEntry(node, 'latest');
				if (entry) entries.push(entry);
			}
			return { version: 1, scopeKey: this.scopeKey, entries };
		});
	}

	/** Serialize an observed ready subgraph, without evaluating anything new. */
	serializeRead(
		root: ScopedNode,
		read: SignalReadMode,
	): readonly NativeSerializedScope[] | undefined {
		if (!root.owner.seedable) return [];
		const rootEntry = this.seedEntry(root, read);
		if (!rootEntry) return undefined;
		const owners = new Map<ScopeImpl, SignalSeedEntry[]>();
		const keys = new Map<string, ScopeImpl>();
		const seen = new Set<ScopedNode>();
		const pending = [root];
		while (pending.length) {
			const node = pending.pop()!;
			if (seen.has(node)) continue;
			seen.add(node);
			const owner = node.owner as ScopeImpl;
			assertAlive(owner);
			if (!owner.seedable) continue;
			const other = keys.get(owner.scopeKey);
			if (other && other !== owner) {
				throw new SignalFrameError(
					'Distinct scopes in one presented graph need distinct scopeKey values.',
				);
			}
			keys.set(owner.scopeKey, owner);
			const entry = node === root ? rootEntry : owner.seedEntry(node);
			if (entry) {
				let entries = owners.get(owner);
				if (!entries) owners.set(owner, (entries = []));
				entries.push(entry);
			}
			for (let link = node.deps; link; link = link.nextDep) {
				if (link.dep instanceof ScopedNode) pending.push(link.dep);
			}
		}
		return [...owners].map(([owner, entries]) => ({
			owner,
			seed: { version: 1, scopeKey: owner.scopeKey, entries },
		}));
	}

	beginAdoption(seed: ScopeSeed): AdoptionFrame {
		assertAlive(this);
		if (!this.seedable)
			throw new SignalFrameError('Local hook scopes do not adopt shared-state seeds.');
		const data: FrameData = {
			owner: this,
			entries: decodeSeed(this.scopeKey, seed),
			references: 0,
		};
		return new AdoptionFrameImpl(data);
	}

	trace(type: SignalTraceEvent['type'], node?: ScopedNode): void {
		if (!this.traceLimit) return;
		const event: SignalTraceEvent = {
			sequence: ++this.sequence,
			type,
			...(node ? { key: node.key, revision: node.revision } : {}),
		};
		const events = (this.events ??= []);
		if (events.length === this.traceLimit) {
			events[(event.sequence - 1) % this.traceLimit] = event;
		} else {
			events.push(event);
		}
	}

	inspect(): ScopeInspection {
		const events = this.events ?? [];
		const traceStart =
			this.traceLimit && events.length === this.traceLimit ? this.sequence % this.traceLimit : 0;
		return {
			scopeKey: this.scopeKey,
			epoch: this.epoch,
			retired: this.retired,
			activeRequests: this.requests
				? [...this.requests.values()].filter((entry) => entry.active).length
				: 0,
			adoptionLeases: this.frames?.size ?? 0,
			nodes: [...this.nodes.values()].map((node) => {
				const dependencies: { scopeKey: string; key: string }[] = [];
				let subscribers = 0;
				for (let link = node.deps; link; link = link.nextDep) {
					if (link.dep instanceof ScopedNode) {
						dependencies.push({ scopeKey: link.dep.owner.scopeKey, key: link.dep.key });
					}
				}
				for (let link = node.subs; link; link = link.nextSub) subscribers++;
				return {
					key: node.key,
					kind: node.kind,
					status: node.state?.snapshot.status ?? 'unevaluated',
					revision: node.revision,
					subscribers,
					retained: node.hasLast,
					refreshing: node.state?.snapshot.refreshing ?? false,
					connection: node.state?.snapshot.connection ?? 'none',
					complete: node.state?.snapshot.complete ?? false,
					dependencies,
				};
			}),
			trace: events.map((event, index) => ({
				...(traceStart ? events[(traceStart + index) % events.length]! : event),
			})),
		};
	}

	dispose(): void {
		if (this.disposed) return;
		assertWritable();
		signalBatch(() => {
			this.disposed = true;
			this.lifetime++;
			// Optional capabilities keep their original order: producers stop before
			// channels clear, and adoption leases release before the graph retires.
			if (this.resources) {
				for (const resource of this.resources.values()) resource.dispose();
				this.resources.clear();
			}
			this.streams?.clear();
			if (this.derivedBindings) {
				for (const binding of this.derivedBindings.values()) binding.dispose();
				this.derivedBindings.clear();
			}
			this.requests?.clear();
			this.queryDefinitions?.clear();
			if (this.frames) for (const frame of this.frames) frame.release();
			retireGraph(this, this.nodes.values());
			this.nodes.clear();
			this.seedEntries?.clear();
			this.trace('retire');
		});
	}
}

class AdoptionFrameImpl implements AdoptionFrame {
	private ended = false;
	private readonly sources = new Map<string, NativeReadSource>();
	private readonly subscribers = new Set<() => void>();

	constructor(readonly data: FrameData) {
		data.references++;
		(data.owner.frames ??= new Set()).add(this);
		data.owner.trace('frame');
	}

	get scopeKey(): string {
		return this.data.owner.scopeKey;
	}

	get released(): boolean {
		return this.ended;
	}

	private assertActive(): void {
		assertAlive(this.data.owner);
		if (this.ended) throw new SignalFrameError('The signal adoption lease has been released.');
	}

	run<T>(read: () => T): T {
		this.assertActive();
		const previousFrames = activeFrames;
		activeFrames = new Map(previousFrames);
		activeFrames.set(this.data.owner, this);
		const previousReader = setHistoricalReader(readHistoricalNode);
		const previousGuard = beginNativeWriteGuard();
		try {
			return read();
		} finally {
			endNativeWriteGuard(previousGuard);
			setHistoricalReader(previousReader);
			activeFrames = previousFrames;
		}
	}

	retain(): AdoptionFrame {
		this.assertActive();
		return new AdoptionFrameImpl(this.data);
	}

	read(node: ScopedNode, read: SignalReadMode): NodeState {
		this.assertActive();
		const seed =
			this.data.entries.get(seedKey(node.key, read)) ??
			(read === 'value' ? undefined : this.data.entries.get(seedKey(node.key)));
		const sourceKey = seedKey(node.key, read);
		let source = this.sources.get(sourceKey);
		if (!source) {
			source = {
				getVersion: () => (this.ended ? 1 : 0),
				subscribe: (notify) => {
					this.assertActive();
					this.subscribers.add(notify);
					return () => this.subscribers.delete(notify);
				},
				inspect: () => {
					// Look up metadata on demand instead of capturing the seed payload
					// in a source that a renderer may still hold after lease release.
					const presented = this.ended
						? undefined
						: (this.data.entries.get(sourceKey) ??
							(read === 'value' ? undefined : this.data.entries.get(seedKey(node.key))));
					return {
						...inspectNativeNode(node, read),
						status: presented
							? presented.entry.available === false
								? 'pending'
								: 'ready'
							: 'unevaluated',
						revision: this.ended ? 1 : 0,
						historical: true,
						retained: !!presented && presented.entry.available !== false,
						refreshing: presented?.entry.refreshing ?? false,
						connection: presented?.entry.connection ?? 'none',
						complete: presented?.entry.complete ?? false,
						dependencies: [],
					};
				},
			};
			this.sources.set(sourceKey, source);
		}
		reportNativeRead(source, 0);
		if (!seed || seed.entry.kind !== node.kind) {
			if (getNativeAdoptionResolver()) throw new NativeAdoptionMiss(this.scopeKey, node.key, read);
			throw new SignalFrameError(
				`The presented frame has no compatible ready value for "${node.key}".`,
			);
		}
		if (seed.entry.available === false) {
			// This channel records absence, not the client request's pending token.
			// latest() returns its authored fallback without consulting live state.
			return {
				snapshot: { status: 'pending', refreshing: false, connection: 'none', complete: false },
			};
		}
		if (node.kind === 'async' && read !== 'latest') {
			const binding = this.data.owner.resources?.get(node);
			if (!binding?.acceptsSeed(seed.entry)) {
				throw new SignalFrameError(`The presented query definition does not match "${node.key}".`);
			}
		}
		return seedState(seed);
	}

	release(): void {
		if (this.ended) return;
		this.ended = true;
		this.data.owner.frames?.delete(this);
		this.sources.clear();
		if (--this.data.references === 0) this.data.entries.clear();
		// Release changes only presentation validity. Callbacks schedule through
		// the existing native owner; they never mutate the historical data.
		const callbacks = [...this.subscribers];
		this.subscribers.clear();
		for (const notify of callbacks) untrack(notify);
	}
}

function readHistoricalNode(node: ScopedNode, read: SignalReadMode): NodeState | undefined {
	const owner = node.owner as ScopeImpl;
	if (!owner.seedable) return undefined;
	const frame = activeFrames?.get(owner);
	if (!frame) {
		const resolved = getNativeAdoptionResolver()?.(owner);
		if (resolved) return resolved.run(() => readNode(node, read));
		if (getNativeAdoptionResolver()) throw new NativeAdoptionMiss(owner.scopeKey, node.key, read);
		throw new SignalFrameError(`Missing adoption frame for signal scope "${owner.scopeKey}".`);
	}
	return frame.read(node, read);
}

export function createScope(options: ScopeOptions): Scope {
	if (!options || typeof options !== 'object')
		throw new TypeError('createScope requires scopeKey.');
	return new ScopeImpl(options.scopeKey, options);
}

/** Only the native hook adapter may create a component-owned, non-serializable scope. */
export function createLocalScope(scopeKey: string): Scope {
	return new ScopeImpl(scopeKey, { scopeKey }, false);
}

export function createDeclaredSignalCell<T>(
	owner: Scope,
	key: string,
	initial: T,
	preferInitial = false,
): WritableSignal<T> {
	if (!(owner instanceof ScopeImpl)) throw new TypeError('A direct signal needs an Octane scope.');
	return owner.createSignalDeclaration(key, initial, preferInitial);
}

// The caller selects the implementation. Importing the owner must not retain
// asynchronous attempt machinery for compiler-proven scalar declarations.
export function createDerivedCellWith<T>(
	owner: Scope,
	key: string,
	compute: DerivedCompute<T>,
	options: DerivedOptions | undefined,
	Binding: DerivedBindingFactory<T>,
): DerivedSignal<T> {
	if (!(owner instanceof ScopeImpl))
		throw new TypeError('A direct derived signal needs an Octane scope.');
	return owner.createDerivedDeclaration(key, compute, options, Binding);
}

// Resource callers supply their implementation statically. Ownership, initial
// seeds and lifecycle support must not retain a query producer by themselves.
export function createResourceCellWith<T>(
	owner: Scope,
	key: string,
	describe: () => QueryRequest<T> | typeof skip,
	initialize: typeof initializeResource,
	unique = false,
): Resource<T> {
	if (!(owner instanceof ScopeImpl)) throw new TypeError('A direct query needs an Octane scope.');
	return owner.createResourceDeclaration(key, describe, initialize, unique);
}

export function adoptResourceValue<T>(
	handle$: SignalHandle<T>,
	requestKey: string | undefined,
	value: T,
): boolean {
	if (!(handle$ instanceof ScopedNode) || !(handle$.owner instanceof ScopeImpl)) return false;
	const binding = handle$.owner.resources?.get(handle$);
	return binding ? binding.adopt(requestKey, value) : false;
}

/** @internal Return the concrete owner for a proven runtime handle. */
export function getSignalScope(handle$: SignalHandle<unknown>): Scope | undefined {
	return handle$ instanceof ScopedNode && handle$.owner instanceof ScopeImpl
		? handle$.owner
		: undefined;
}

/** @internal Exact selection generation used to pin an optimistic query write. */
export function getResourceSelectionAuthority(handle$: SignalHandle<unknown>): object | undefined {
	if (!(handle$ instanceof ScopedNode) || !(handle$.owner instanceof ScopeImpl)) return;
	return handle$.owner.resources?.get(handle$)?.authority;
}

/**
 * @internal Bind receiver-owned selection authority before result delivery.
 * This is the only ingress that creates a scope's stream capability.
 */
export function bindScopeStreamedSelection(owner: Scope, identity: StreamFrameIdentity): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	const node = owner.nodes.get(identity.nodeKey);
	if (node && node.kind !== 'async') return false;
	return scopeStreams(owner).bind(identity, node);
}

/** @internal Publish a receiver-validated result into an exact current request. */
export function acceptScopeStreamedResult(owner: Scope, frame: StreamedSignalResultFrame): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	// Without a bound selection there is no request this frame could belong to.
	return owner.streams?.accept(frame) ?? false;
}

/** @internal Fail one exact streamed attempt after receiver timeout or rejection. */
export function failScopeStreamedResult(
	owner: Scope,
	identity: StreamFrameIdentity,
	error: Error,
): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	return owner.streams?.fail(identity, error) ?? false;
}

export { startSignalBatch, endSignalBatch };
