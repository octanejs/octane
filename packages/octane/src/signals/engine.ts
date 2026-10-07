import { formatClientError } from '../error-codes.client.generated.js';
import { decodeSignalValue, encodeSignalValue, snapshotSignalValue } from './encoding.js';
import { ScopeDisposedError, SignalFrameError, SignalSerializationError } from './errors.js';
import { scopeStreams, type ScopeStreams } from './scope-streams.js';
import {
	ScopedNode,
	assertAlive,
	assertWritable,
	derivedState,
	endSignalBatch,
	historicalBindingRead,
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
	unchangedLiveRead,
	untrack,
	type GraphOwner,
	type CandidateProducer,
	type NodeState,
	type SignalObserver,
	type SignalReadMode,
	type SignalCandidateFrame,
} from './graph.js';
import {
	beginNativeWriteGuard,
	endNativeWriteGuard,
	getNativeAdoptionResolver,
	isNativeAdoptionMiss,
	nativeAdoptionMiss,
	nativeReadRebase,
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
	OwnerScope,
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
	declared(sequence: number, captures?: readonly unknown[], declaring?: number): void;
	/** A later render's declaration of this cell, with a computation that may capture new values. */
	redeclare(
		compute: DerivedCompute<any>,
		sequence: number,
		captures?: readonly unknown[],
		declaring?: number,
	): ScopedNode;
	supersede(): void;
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
		throw new TypeError(formatClientError(125, label));
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
		throw new SignalFrameError(formatClientError(126, scopeKey));
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
			throw new SignalFrameError(formatClientError(127));
		}
		const value = decodeSignalValue(entry.value);
		if (
			entry.available === false &&
			(value !== undefined || entry.complete || entry.request !== undefined)
		) {
			throw new SignalFrameError(formatClientError(128));
		}
		let request: SignalSeedEntry['request'];
		if (entry.kind === 'async' && entry.available !== false) {
			if (
				!entry.request ||
				typeof entry.request.queryKey !== 'string' ||
				!entry.request.queryKey.trim() ||
				!['promise', 'stream'].includes(entry.request.kind)
			) {
				throw new SignalFrameError(formatClientError(129));
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
			throw new SignalFrameError(formatClientError(130));
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
	/** Holds a writable or asynchronous derived cell that new render inputs cannot re-select. */
	unkeyedState = false;

	/** An attempt that never committed restarts with new inputs and keeps these cells. */
	supersede(): void {
		if (this.resources) for (const binding of this.resources.values()) binding.supersede();
		if (this.derivedBindings)
			for (const binding of this.derivedBindings.values()) binding.supersede();
	}
	readonly seedEntries: Map<string, DecodedSeedEntry> | undefined;
	readonly traceLimit: number;
	events: SignalTraceEvent[] | undefined = undefined;
	sequence = 0;
	private lifetime = 0;
	private disposed = false;
	// Installed by installPublicScope, so only applications that can hold a
	// scope (createScope, currentSignalOwner) ship these.
	declare derived$: Scope['derived$'];
	declare get: Scope['get'];
	declare set: Scope['set'];
	declare isPending: Scope['isPending'];
	declare batch: Scope['batch'];
	declare action: Scope['action'];
	declare serialize: Scope['serialize'];
	declare inspect: Scope['inspect'];
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
		readonly seedable: boolean,
		seedEntries: Map<string, DecodedSeedEntry> | undefined,
		traceLimit: number,
	) {
		requireKey(key, 'scopeKey');
		this.traceLimit = traceLimit;
		this.seedEntries = seedEntries;
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

	createNode<T>(key: string, kind: ScopedNode['kind'], allowDuringRead = false): ScopedNode<T> {
		assertAlive(this);
		// Component-local hook initialization is an allocation in its existing
		// render lifetime, never a write to an already committed signal.
		if (this.seedable && !allowDuringRead) assertWritable();
		requireKey(key, 'Signal key');
		if (this.nodes.has(key)) throw new TypeError(formatClientError(132, key));
		const seeds = this.seedEntries;
		if (seeds)
			for (const read of ['value', 'latest', 'snapshot'] as const) {
				const seed = seeds.get(seedKey(key, read));
				if (seed && seed.entry.kind !== kind) {
					throw new SignalFrameError(formatClientError(133, key));
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
				throw new TypeError(formatClientError(134, key, existing.kind));
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

	initializeRetention(node: ScopedNode): void {
		const seed = this.retainedSeed(node.key);
		if (!seed) return;
		node.lastState = seedState(seed);
		node.last = seed.value;
		node.hasLast = true;
	}

	consumeSeed(key: string): void {
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

	createDerivedDeclaration<T>(
		key: string,
		compute: DerivedCompute<T>,
		options: DerivedOptions | undefined,
		Binding: DerivedBindingFactory<T>,
		sequence = 0,
		captures?: readonly unknown[],
		declaring = 0,
	): DerivedSignal<T> {
		if (typeof compute !== 'function') throw new TypeError(formatClientError(122));
		const [node, created] = this.declaredNode<T>(key, 'derived');
		if (!created) {
			// A later render may declare the same cell with a new computation.
			const binding = this.derivedBindings?.get(node);
			return (binding?.redeclare(compute, sequence, captures, declaring) ??
				node) as DerivedSignal<T>;
		}
		const binding = new Binding(this, node, compute, options);
		binding.declared(sequence, captures, declaring);
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
		sequence = 0,
		captures?: readonly unknown[],
		declaring = 0,
	): Resource<T> {
		if (typeof describe !== 'function') throw new TypeError(formatClientError(137));
		let node: ScopedNode<T>;
		if (unique) node = this.createNode<T>(key, 'async');
		else {
			const [declared, created] = this.declaredNode<T>(key, 'async');
			if (!created) {
				// A later render may declare the same cell with a new description.
				const binding = this.resources?.get(declared) as ResourceBinding<T> | undefined;
				return (binding?.redeclare(describe, sequence, captures, declaring) ??
					declared) as Resource<T>;
			}
			node = declared;
		}
		const seed = this.initialSeed(key);
		const retained = this.retainedSeed(key);
		this.initializeRetention(node);
		signalBatch(() => {
			const binding = initialize(this, node, describe, seed, retained);
			binding.declared(sequence, captures, declaring);
			(this.resources ??= new Map()).set(node, binding);
			refreshNode(node);
			// A selection bound before this declaration ran may already hold results.
			this.streams?.flush(node, binding);
		});
		this.consumeSeed(key);
		return node as Resource<T>;
	}

	// Server native reads serialize, and hydration adopts, internal owner scopes
	// too. Both reach these through the owner: their protocol modules load
	// without signals, so importing the engine there would ship it, and run it
	// on every server render, in applications that never create a signal.
	serializeRead(
		root: ScopedNode,
		read: SignalReadMode,
	): readonly NativeSerializedScope[] | undefined {
		return serializeScopeRead(root, read);
	}

	beginAdoption(seed: ScopeSeed): AdoptionFrame {
		assertAlive(this);
		if (!this.seedable) throw new SignalFrameError(formatClientError(142));
		const data: FrameData = {
			owner: this,
			entries: decodeSeed(this.scopeKey, seed),
			references: 0,
		};
		return new AdoptionFrameImpl(data);
	}

	trace(type: SignalTraceEvent['type'], node?: ScopedNode): void {
		if (this.traceLimit !== 0) recordScopeTrace!(this, type, node);
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

/** The seed a historical read channel presents. */
function presentedSeed(
	entries: ReadonlyMap<string, DecodedSeedEntry>,
	key: string,
	read: SignalReadMode,
): DecodedSeedEntry | undefined {
	return (
		entries.get(seedKey(key, read)) ?? (read === 'value' ? undefined : entries.get(seedKey(key)))
	);
}

/** One historical read channel, and the subscribers its release notifies. */
interface HistoricalSource extends NativeReadSource {
	/** The node read through this channel, or null once another node shared its key. */
	node: ScopedNode | null;
	readonly read: SignalReadMode;
	/** A targeted binding's read, kept apart from the render's read of the same channel. */
	readonly binding: boolean;
	readonly subscribers: Set<() => void>;
}

class AdoptionFrameImpl implements AdoptionFrame {
	private ended = false;
	/** Keyed by read channel; a targeted binding's channel is prefixed with `~`. */
	private readonly sources = new Map<string, HistoricalSource>();

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
		if (this.ended) throw new SignalFrameError(formatClientError(143));
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

	read(node: ScopedNode, read: SignalReadMode): NodeState | undefined {
		this.assertActive();
		const seed = presentedSeed(this.data.entries, node.key, read);
		// A resource seed holds the request the server resolved. When the client
		// selects another one (its props or state differ from the server's), that
		// history cannot present it. Hydration then reads the node live, exactly
		// like a request the server never seeded: the client loads its own
		// selection and adoption reconciles the server output. An explicit frame
		// has no live fallback.
		if (
			node.kind === 'async' &&
			read !== 'latest' &&
			seed?.entry.kind === 'async' &&
			seed.entry.available !== false &&
			!this.data.owner.resources?.get(node)?.acceptsSeed(seed.entry)
		) {
			if (getNativeAdoptionResolver()) return undefined;
			throw new SignalFrameError(formatClientError(145, node.key));
		}
		const binding = historicalBindingRead;
		const channel = (binding ? '~' : '') + seedKey(node.key, read);
		let source = this.sources.get(channel);
		if (!source) {
			const subscribers = new Set<() => void>();
			source = {
				node,
				read,
				binding,
				subscribers,
				getVersion: () => (this.ended ? 1 : 0),
				subscribe: (notify) => {
					this.assertActive();
					subscribers.add(notify);
					return () => subscribers.delete(notify);
				},
				inspect: () => {
					// Look up metadata on demand instead of capturing the seed payload
					// in a source that a renderer may still hold after lease release.
					const presented = this.ended
						? undefined
						: presentedSeed(this.data.entries, node.key, read);
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
			this.sources.set(channel, source);
		} else if (source.node !== node) source.node = null;
		reportNativeRead(source, 0);
		if (!seed || seed.entry.kind !== node.kind) {
			if (getNativeAdoptionResolver()) throw nativeAdoptionMiss(this.scopeKey, node.key, read);
			throw new SignalFrameError(formatClientError(144, node.key));
		}
		if (seed.entry.available === false) {
			// This channel records absence, not the client request's pending token.
			// latest() returns its authored fallback without consulting live state.
			return {
				snapshot: { status: 'pending', refreshing: false, connection: 'none', complete: false },
			};
		}
		return seedState(seed);
	}

	release(): void {
		if (this.ended) return;
		this.ended = true;
		const { owner, entries } = this.data;
		owner.frames?.delete(this);
		const rebase = nativeReadRebase;
		// Release changes only presentation validity. Callbacks schedule through
		// the existing native owner; they never mutate the historical data. A
		// renderer may instead move an unchanged read live (NativeReadRebase).
		for (const source of this.sources.values()) {
			const callbacks = [...source.subscribers];
			source.subscribers.clear();
			const { node, read } = source;
			const seed = rebase && node ? presentedSeed(entries, node.key, read) : undefined;
			const release =
				node && seed?.entry.kind === node.kind && seed.entry.available !== false
					? {
							historical: source,
							binding: source.binding,
							successor: () => unchangedLiveRead(node, read, seedState(seed)),
						}
					: undefined;
			for (const notify of callbacks) if (!release || !rebase?.(notify, release)) untrack(notify);
		}
		this.sources.clear();
		if (--this.data.references === 0) entries.clear();
	}
}

function readHistoricalNode(node: ScopedNode, read: SignalReadMode): NodeState | undefined {
	const owner = node.owner as ScopeImpl;
	if (!owner.seedable) return undefined;
	const frame = activeFrames?.get(owner);
	if (!frame) {
		const resolved = getNativeAdoptionResolver()?.(owner);
		if (resolved) return resolved.run(() => readNode(node, read));
		if (getNativeAdoptionResolver()) throw nativeAdoptionMiss(owner.scopeKey, node.key, read);
		throw new SignalFrameError(formatClientError(146, owner.scopeKey));
	}
	return frame.read(node, read);
}

/** One node's seed entry, for serialization and native-read handoff. */
function scopeSeedEntry(
	scope: ScopeImpl,
	node: ScopedNode,
	read: SignalReadMode = 'value',
): SignalSeedEntry | undefined {
	const current = node.state?.snapshot;
	if (
		current?.status === 'error' &&
		(current.error instanceof ScopeDisposedError ||
			current.error instanceof SignalFrameError ||
			isNativeAdoptionMiss(current.error))
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
	const request = scope.resources?.get(node)?.seedRequest(read === 'latest');
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

function serializeScope(scope: ScopeImpl): ScopeSeed {
	assertAlive(scope);
	if (!scope.seedable) throw new SignalSerializationError(formatClientError(140));
	return untrack(() => {
		const entries: SignalSeedEntry[] = [];
		for (const node of scope.nodes.values()) {
			refreshNode(node);
			const entry = scopeSeedEntry(scope, node) ?? scopeSeedEntry(scope, node, 'latest');
			if (entry) entries.push(entry);
		}
		return { version: 1, scopeKey: scope.scopeKey, entries };
	});
}

/** Serialize an observed ready subgraph, without evaluating anything new. */
function serializeScopeRead(
	root: ScopedNode,
	read: SignalReadMode,
): readonly NativeSerializedScope[] | undefined {
	const scope = root.owner as ScopeImpl;
	if (!scope.seedable) return [];
	const rootEntry = scopeSeedEntry(scope, root, read);
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
			throw new SignalFrameError(formatClientError(141));
		}
		keys.set(owner.scopeKey, owner);
		const entry = node === root ? rootEntry : scopeSeedEntry(owner, node);
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

// Installed by createScope when a scope records a debug trace.
let recordScopeTrace:
	((scope: ScopeImpl, type: SignalTraceEvent['type'], node?: ScopedNode) => void) | null = null;

function recordTrace(scope: ScopeImpl, type: SignalTraceEvent['type'], node?: ScopedNode): void {
	const event: SignalTraceEvent = {
		sequence: ++scope.sequence,
		type,
		...(node ? { key: node.key, revision: node.revision } : {}),
	};
	const events = (scope.events ??= []);
	if (events.length === scope.traceLimit) {
		events[(event.sequence - 1) % scope.traceLimit] = event;
	} else {
		events.push(event);
	}
}

function inspectScope(scope: ScopeImpl): ScopeInspection {
	const events = scope.events ?? [];
	const traceStart =
		scope.traceLimit && events.length === scope.traceLimit ? scope.sequence % scope.traceLimit : 0;
	return {
		scopeKey: scope.scopeKey,
		epoch: scope.epoch,
		retired: scope.retired,
		activeRequests: scope.requests
			? [...scope.requests.values()].filter((entry) => entry.active).length
			: 0,
		adoptionLeases: scope.frames?.size ?? 0,
		nodes: [...scope.nodes.values()].map((node) => {
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

function ownScopeNode<T>(scope: ScopeImpl, handle$: SignalHandle<T>): ScopedNode<T> {
	assertAlive(scope);
	if (!(handle$ instanceof ScopedNode) || handle$.owner !== scope) {
		throw new TypeError(formatClientError(138));
	}
	return handle$;
}

let publicScope = false;

/**
 * @internal Every scope an application can hold exposes the whole Scope
 * surface. The runtime's owner scopes for `signal$` and friends reach
 * application code only through createScope's scopes, currentSignalOwner and
 * the public installSignalOwnerEnvironment, which all call this first, so an
 * application that uses none of them ships none of it. The methods go on the
 * shared prototype, which keeps every scope one shape.
 */
export function installPublicScope(): void {
	if (publicScope) return;
	publicScope = true;
	const prototype = ScopeImpl.prototype;
	prototype.derived$ = function <T>(
		this: ScopeImpl,
		key: string,
		compute: (() => T) & (T extends PromiseLike<unknown> ? never : unknown),
	): DerivedSignal<T> {
		if (typeof compute !== 'function') throw new TypeError(formatClientError(122));
		const node = this.createNode<T>(key, 'derived');
		node.compute = (target) => derivedState(target, compute);
		this.initializeRetention(node);
		// Live derived values always reflect live inputs, including edits made
		// before this node was created. Only an adoption frame reads historical
		// computed values from a seed.
		this.consumeSeed(key);
		return node as DerivedSignal<T>;
	};
	prototype.get = function <T>(this: ScopeImpl, handle$: SignalHandle<T>): T {
		const node = ownScopeNode(this, handle$);
		return strictValue(readNode(node), node.key);
	};
	prototype.set = function <T>(
		this: ScopeImpl,
		handle$: WritableSignal<T>,
		value: T | ((previous: T) => T),
	): void {
		ownScopeNode(this, handle$).set(value);
	};
	prototype.isPending = function (this: ScopeImpl, read: () => unknown): boolean {
		assertAlive(this);
		try {
			read();
			return false;
		} catch (error) {
			if (isThenable(error)) return true;
			throw error;
		}
	};
	prototype.batch = function <T>(this: ScopeImpl, write: () => T): T {
		assertAlive(this);
		return signalBatch(write);
	};
	prototype.action = function <F extends (...args: any[]) => any>(this: ScopeImpl, write: F): F {
		if (typeof write !== 'function') throw new TypeError(formatClientError(139));
		const owner = this;
		return function (this: unknown, ...args: Parameters<F>): ReturnType<F> {
			return owner.batch(() => write.apply(this, args));
		} as F;
	};
	prototype.serialize = function (this: ScopeImpl) {
		return serializeScope(this);
	};
	prototype.inspect = function (this: ScopeImpl) {
		return inspectScope(this);
	};
}

export function createScope(options: ScopeOptions): Scope {
	if (!options || typeof options !== 'object') throw new TypeError(formatClientError(147));
	installPublicScope();
	const key = options.scopeKey;
	requireKey(key, 'scopeKey');
	const traceLimit = options.debug ? (options.debug.traceLimit ?? 256) : 0;
	if (!Number.isInteger(traceLimit) || traceLimit < 0 || traceLimit > 10_000) {
		throw new RangeError(formatClientError(131));
	}
	if (traceLimit !== 0) recordScopeTrace = recordTrace;
	return new ScopeImpl(
		key,
		true,
		options.seed ? decodeSeed(key, options.seed) : undefined,
		traceLimit,
	);
}

/** @internal A runtime-created owner scope. */
export function createOwnerScope(scopeKey: string): OwnerScope {
	return new ScopeImpl(scopeKey, true, undefined, 0);
}

/** @internal A runtime-created owner scope holding the initial response's seed. */
export function createSeededOwnerScope(scopeKey: string, seed: ScopeSeed): OwnerScope {
	return new ScopeImpl(scopeKey, true, decodeSeed(scopeKey, seed), 0);
}

/** Only the native hook adapter may create a component-owned, non-serializable scope. */
export function createLocalScope(scopeKey: string): OwnerScope {
	return new ScopeImpl(scopeKey, false, undefined, 0);
}

export function createDeclaredSignalCell<T>(
	owner: OwnerScope,
	key: string,
	initial: T,
	preferInitial = false,
): WritableSignal<T> {
	if (!(owner instanceof ScopeImpl)) throw new TypeError(formatClientError(148));
	return owner.createSignalDeclaration(key, initial, preferInitial);
}

// The caller selects the implementation. Importing the owner must not retain
// asynchronous attempt machinery for compiler-proven scalar declarations.
export function createDerivedCellWith<T>(
	owner: OwnerScope,
	key: string,
	compute: DerivedCompute<T>,
	options: DerivedOptions | undefined,
	Binding: DerivedBindingFactory<T>,
	sequence = 0,
	captures?: readonly unknown[],
	declaring = 0,
): DerivedSignal<T> {
	if (!(owner instanceof ScopeImpl)) throw new TypeError(formatClientError(149));
	return owner.createDerivedDeclaration(
		key,
		compute,
		options,
		Binding,
		sequence,
		captures,
		declaring,
	);
}

let declarationSequence = 0;

/**
 * Order the declarations a component or hook body makes on every render, so an
 * older render's closure never replaces a newer one. Module and explicitly keyed
 * uncompiled sites declare once; a repeated declaration shares the first cell.
 */
export function signalDeclarationSequence(site: string | undefined): number {
	return site?.startsWith('i:') ? ++declarationSequence : 0;
}

// Resource callers supply their implementation statically. Ownership, initial
// seeds and lifecycle support must not retain a query producer by themselves.
export function createResourceCellWith<T>(
	owner: OwnerScope,
	key: string,
	describe: () => QueryRequest<T> | typeof skip,
	initialize: typeof initializeResource,
	unique = false,
	sequence = 0,
	captures?: readonly unknown[],
	declaring = 0,
): Resource<T> {
	if (!(owner instanceof ScopeImpl)) throw new TypeError(formatClientError(150));
	return owner.createResourceDeclaration(
		key,
		describe,
		initialize,
		unique,
		sequence,
		captures,
		declaring,
	);
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
export function getSignalScope(handle$: SignalHandle<unknown>): OwnerScope | undefined {
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
export function bindScopeStreamedSelection(
	owner: OwnerScope,
	identity: StreamFrameIdentity,
): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	const node = owner.nodes.get(identity.nodeKey);
	if (node && node.kind !== 'async') return false;
	return scopeStreams(owner).bind(identity, node);
}

/** @internal Publish a receiver-validated result into an exact current request. */
export function acceptScopeStreamedResult(
	owner: OwnerScope,
	frame: StreamedSignalResultFrame,
): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	// Without a bound selection there is no request this frame could belong to.
	return owner.streams?.accept(frame) ?? false;
}

/** @internal Fail one exact streamed attempt after receiver timeout or rejection. */
export function failScopeStreamedResult(
	owner: OwnerScope,
	identity: StreamFrameIdentity,
	error: Error,
): boolean {
	if (!(owner instanceof ScopeImpl)) return false;
	assertAlive(owner);
	return owner.streams?.fail(identity, error) ?? false;
}

export { startSignalBatch, endSignalBatch };
