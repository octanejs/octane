import {
	deriveKeyless,
	equalsOption,
	installScopeOperations,
	requireKey,
	ScopeLifetime,
} from './keyless-scope.js';
import { installSignalActions } from '#octane/signal-actions/graph';
import { installServerReads } from '#octane/signals/server-reads';
import { REACTIVE_SLOW } from './graph-flags.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { decodeSignalValue, snapshotSignalValue } from './encoding.js';
import { ScopeDisposedError, SignalFrameError, SignalSerializationError } from './errors.js';
import type { ScopeStreams } from './scope-streams.js';
import { scopeSeedEntry } from './seed-serialization.js';
import {
	PlainCell,
	PlainComputed,
	ScopedNode,
	assertAlive,
	assertWritable,
	computeEqual,
	derivedState,
	endSignalBatch,
	historicalBindingRead,
	initializeValue,
	installKeyedGraph,
	inspectNativeNode,
	readNode,
	readValue,
	readyState,
	refreshNode,
	retireGraph,
	setEquals,
	setWatched,
	setHistoricalReader,
	signalBatch,
	startSignalBatch,
	unchangedLiveRead,
	untrack,
	type GraphOwner,
	type CandidateProducer,
	type NodeState,
	type SignalReadMode,
	type CandidateContext,
} from './graph.js';
import { isThenable } from './handle-protocol.js';
import {
	beginNativeWriteGuard,
	endNativeWriteGuard,
	getNativeAdoptionResolver,
	nativeAdoptionMiss,
	nativeReadRebase,
	reportNativeRead,
	type NativeReadSource,
} from './read-protocol.js';
import type {
	initializeResource,
	QueryDefinition,
	RequestEntry,
	ResourceBinding,
} from './requests.js';
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
	ScopeSignalOptions,
	skip,
	SignalHandle,
	SignalSeedEntry,
	SignalTraceEvent,
	WritableSignal,
} from './types.js';

declare const __OCTANE_PROFILE_ENABLED__: boolean;

interface DecodedSeedEntry {
	readonly entry: SignalSeedEntry;
	readonly value: unknown;
}

/** Owner lifecycle shared by scalar and asynchronous declaration implementations. */
export interface DerivedBindingLifecycle {
	suspend(): boolean;
	resume(): void;
	dispose(): void;
	forkCandidate?(target: ScopedNode, context: CandidateContext): CandidateProducer | undefined;
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

installKeyedGraph();
// Renderer transitions keep signal writes pending, including writes to signals
// loaded after an Action awaited. An islands build moves this registration into
// the renderer (see action-capability.ts).
installSignalActions();
// A server render collects its signal reads whenever signals exist.
installServerReads();

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

export class ScopeImpl extends ScopeLifetime implements Scope, GraphOwner {
	readonly nodes = new Map<string, ScopedNode>();
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
	readonly seedEntries: Map<string, DecodedSeedEntry> | undefined;
	events: SignalTraceEvent[] | undefined = undefined;
	sequence = 0;
	// Installed by installPublicScope, so only applications that can hold a
	// scope (createScope, currentSignalOwner) ship these.
	declare derived$: Scope['derived$'];
	declare get: Scope['get'];
	declare set: Scope['set'];
	declare isPending: Scope['isPending'];
	declare batch: Scope['batch'];
	declare transaction: Scope['transaction'];
	declare effect: Scope['effect'];
	declare action: Scope['action'];
	declare serialize: Scope['serialize'];
	declare inspect: Scope['inspect'];
	readBarrier: Promise<void> | undefined;

	constructor(
		key: string,
		seedable: boolean,
		seedEntries: Map<string, DecodedSeedEntry> | undefined,
		traceLimit: number,
	) {
		super(key, seedable, traceLimit);
		this.seedEntries = seedEntries;
	}

	// installPublicScope adds the `equals` option, which only createScope's scopes take.
	signal$<T>(key: string | null, initial: T): WritableSignal<T> {
		if (key !== null) return this.keyedSignal(key, initial);
		if (this.disposed) throw new ScopeDisposedError(this.key);
		return new PlainCell(initial, this) as unknown as WritableSignal<T>;
	}

	private keyedSignal<T>(key: string, initial: T): WritableSignal<T> {
		const node = createScopeNode<T>(this, key, 'signal');
		const seed = initialScopeSeed(this, key) ?? retainedScopeSeed(this, key);
		initializeValue(node, seed ? (seed.value as T) : initial);
		consumeScopeSeed(this, key);
		return node as WritableSignal<T>;
	}

	// Hydration adopts internal owner scopes too. It reaches them through the
	// owner: its protocol modules load without signals, so importing the engine
	// there would ship it in applications that never create a signal.
	override beginAdoption(seed: ScopeSeed): AdoptionFrame {
		assertAlive(this);
		if (!this.seedable) throw new SignalFrameError(formatClientError(142));
		const data: FrameData = {
			owner: this,
			entries: decodeSeed(this.scopeKey, seed),
			references: 0,
		};
		return new AdoptionFrameImpl(data);
	}

	override trace(type: SignalTraceEvent['type'], node?: ScopedNode): void {
		if (this.traceLimit !== 0) recordScopeTrace!(this, type, node);
	}

	dispose(): void {
		if (this.disposed) return;
		assertWritable();
		signalBatch(() => {
			this.stopEffectsAndRetire();
			// Reads and writes from cancellation callbacks below take the general path, which throws.
			for (const node of this.nodes.values()) node.flags |= REACTIVE_SLOW;
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

/** Internal document lifecycle; the facade marks every owner before cancellation runs user code. */
export function suspendScopeReads(scope: ScopeImpl): void {
	if (scope.disposed || scope.readBarrier === undefined) return;
	scope.streams?.suspend();
	if (scope.requests) for (const entry of scope.requests.values()) entry.stopAttempt();
	if (scope.derivedBindings)
		for (const binding of scope.derivedBindings.values()) binding.suspend();
}

export function resumeScopeReads(scope: ScopeImpl): void {
	if (scope.disposed || scope.readBarrier !== undefined) return;
	signalBatch(() => {
		// Refresh descriptions first: cancellation callbacks may have selected a
		// different key. Only entries still retained by consumers may restart.
		if (scope.resources)
			for (const [node, binding] of scope.resources) {
				refreshNode(node);
				scope.streams?.resume(node, binding);
			}
		// Refreshing may have created the first request map.
		if (scope.requests)
			for (const entry of scope.requests.values()) {
				if (scope.readBarrier !== undefined) break;
				if (
					!entry.active &&
					!entry.state.snapshot.complete &&
					entry.state.snapshot.status !== 'error' &&
					entry.consumers.size
				) {
					entry.start(entry.state.snapshot.status !== 'ready');
				}
			}
		if (scope.derivedBindings)
			for (const binding of scope.derivedBindings.values()) binding.resume();
	});
}

// Keep declaration helpers outside the class so unused creation paths can be removed.
function createScopeNode<T>(
	owner: ScopeImpl,
	key: string,
	kind: ScopedNode['kind'],
	allowDuringRead = false,
): ScopedNode<T> {
	assertAlive(owner);
	// Component-local hook initialization is an allocation in its existing
	// render lifetime, never a write to an already committed signal.
	if (owner.seedable && !allowDuringRead) assertWritable();
	requireKey(key, 'Signal key');
	if (owner.nodes.has(key)) throw new TypeError(formatClientError(132, key));
	const seeds = owner.seedEntries;
	if (seeds)
		for (const read of ['value', 'latest', 'snapshot'] as const) {
			const seed = seeds.get(seedKey(key, read));
			if (seed && seed.entry.kind !== kind) {
				throw new SignalFrameError(formatClientError(133, key));
			}
		}
	const node = new ScopedNode<T>(owner, key, kind);
	owner.nodes.set(key, node);
	return node;
}

function declaredScopeNode<T>(
	owner: ScopeImpl,
	key: string,
	kind: ScopedNode['kind'],
): [ScopedNode<T>, boolean] {
	assertAlive(owner);
	requireKey(key, 'Signal key');
	const existing = owner.nodes.get(key);
	if (existing) {
		if (existing.kind !== kind) {
			throw new TypeError(formatClientError(134, key, existing.kind));
		}
		return [existing as ScopedNode<T>, false];
	}
	return [createScopeNode<T>(owner, key, kind, true), true];
}

function initialScopeSeed(owner: ScopeImpl, key: string): DecodedSeedEntry | undefined {
	const seeds = owner.seedEntries;
	return seeds && (seeds.get(seedKey(key)) ?? seeds.get(seedKey(key, 'snapshot')));
}

function retainedScopeSeed(owner: ScopeImpl, key: string): DecodedSeedEntry | undefined {
	const seeds = owner.seedEntries;
	if (!seeds) return undefined;
	const seed = seeds.get(seedKey(key, 'latest')) ?? initialScopeSeed(owner, key);
	return seed?.entry.available === false ? undefined : seed;
}

function initializeScopeRetention(owner: ScopeImpl, node: ScopedNode): void {
	const seed = retainedScopeSeed(owner, node.key);
	if (!seed) return;
	node.lastState = seedState(seed);
	node.last = seed.value;
	node.hasLast = true;
}

function consumeScopeSeed(owner: ScopeImpl, key: string): void {
	const seeds = owner.seedEntries;
	if (seeds)
		for (const read of ['value', 'latest', 'snapshot'] as const) {
			seeds.delete(seedKey(key, read));
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
		// A node the server's snapshot of this scope lacks never reached its HTML.
		// Hydration reads it live, suspending while it is pending, as it does with
		// no snapshot at all, and adoption reconciles the server output.
		if (seed === undefined && getNativeAdoptionResolver()) return undefined;
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
				retired: () => node.owner.retired,
				inspect:
					typeof __OCTANE_PROFILE_ENABLED__ !== 'undefined' && __OCTANE_PROFILE_ENABLED__
						? () => {
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
							}
						: undefined,
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

	/** Each subscriber that presented `node` through this frame (pending.ts enlist). */
	readers(node: ScopedNode, each: (notify: () => void) => void): void {
		for (const source of this.sources.values())
			if (source.node === node) for (const notify of source.subscribers) each(notify);
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

/** Optional authored cell setup stays out of ordinary declaration factories. */
export function prepareDeclaredCellOptions<T>(
	options: ScopeSignalOptions<T>,
): ((node: ScopedNode<T>) => void) | undefined {
	if (options === null || typeof options !== 'object') throw new TypeError(formatClientError(160));
	const equals = options.equals;
	if (equals !== undefined && typeof equals !== 'function')
		throw new TypeError(formatClientError(366));
	const watched = options.watched;
	if (watched !== undefined && typeof watched !== 'function')
		throw new TypeError(formatClientError(367));
	if (equals === undefined && watched === undefined) return undefined;
	return (node) => {
		if (equals !== undefined) setEquals(node, equals);
		if (watched !== undefined) setWatched(node, watched);
	};
}

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
	const plainSignal: (
		this: ScopeImpl,
		key: string | null,
		initial: unknown,
	) => WritableSignal<any> = prototype.signal$;
	prototype.signal$ = function <T>(
		this: ScopeImpl,
		key: string | null,
		initial: T,
		options?: ScopeSignalOptions<T>,
	): WritableSignal<T> {
		const equals = equalsOption(options);
		const signal$: WritableSignal<T> = plainSignal.call(this, key, initial);
		if (equals !== undefined) setEquals(signal$ as unknown as ScopedNode<T> | PlainCell<T>, equals);
		if (options?.watched)
			setWatched(signal$ as unknown as ScopedNode<T> | PlainCell<T>, options.watched);
		return signal$;
	};
	prototype.derived$ = function <T>(
		this: ScopeImpl,
		key: string | null,
		compute: (() => T) & (T extends PromiseLike<unknown> ? never : unknown),
		options?: ScopeSignalOptions<T>,
	): DerivedSignal<T> {
		if (typeof compute !== 'function') throw new TypeError(formatClientError(122));
		const equals = equalsOption(options);
		if (key === null) {
			return deriveKeyless(this, compute, options, equals);
		}
		const node = createScopeNode<T>(this, key, 'derived');
		const read: () => T = equals ? computeEqual(node, compute, equals) : compute;
		// A transition's shadow takes `compute` alone: its results compare with its own.
		node.compute = equals
			? (target) =>
					derivedState(target, target === node ? read : computeEqual(target, compute, equals))
			: (target) => derivedState(target, read);
		node.plain = read;
		initializeScopeRetention(this, node);
		// Live derived values always reflect live inputs, including edits made
		// before this node was created. Only an adoption frame reads historical
		// computed values from a seed.
		consumeScopeSeed(this, key);
		if (options?.watched) setWatched(node, options.watched);
		return node as DerivedSignal<T>;
	};
	prototype.get = function <T>(this: ScopeImpl, handle$: SignalHandle<T>): T {
		if (
			(handle$ instanceof PlainCell && handle$.owner === this) ||
			handle$ instanceof PlainComputed
		)
			return handle$.get();
		return readValue(ownScopeNode(this, handle$));
	};
	prototype.set = function <T>(
		this: ScopeImpl,
		handle$: WritableSignal<T>,
		value: T | ((previous: T) => T),
	): void {
		if (handle$ instanceof PlainCell && handle$.owner === this) return handle$.set(value);
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
	installScopeOperations(prototype);
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
	prepare?: () => ((node: ScopedNode<T>) => void) | undefined,
): WritableSignal<T> {
	if (!(owner instanceof ScopeImpl)) throw new TypeError(formatClientError(148));
	// Validate before registration; failed JS options must leave this key reusable.
	const configure = prepare !== undefined && !owner.nodes.has(key) ? prepare() : undefined;
	const [node, created] = declaredScopeNode<T>(owner, key, 'signal');
	if (!created) return node as WritableSignal<T>;
	configure?.(node);
	const seed = initialScopeSeed(owner, key) ?? retainedScopeSeed(owner, key);
	initializeValue(node, seed && !preferInitial ? (seed.value as T) : initial);
	consumeScopeSeed(owner, key);
	return node as WritableSignal<T>;
}

// The caller selects the implementation. Importing the owner must not retain
// asynchronous attempt machinery for compiler-proven scalar declarations.
export function createDerivedCellWith<T>(
	owner: OwnerScope,
	key: string,
	compute: DerivedCompute<T>,
	options: (DerivedOptions & ScopeSignalOptions<T>) | undefined,
	Binding: DerivedBindingFactory<T>,
	sequence = 0,
	captures?: readonly unknown[],
	declaring = 0,
	prepare?: () => ((node: ScopedNode<T>) => void) | undefined,
): DerivedSignal<T> {
	if (!(owner instanceof ScopeImpl)) throw new TypeError(formatClientError(149));
	if (typeof compute !== 'function') throw new TypeError(formatClientError(122));
	const configure = prepare !== undefined && !owner.nodes.has(key) ? prepare() : undefined;
	const [node, created] = declaredScopeNode<T>(owner, key, 'derived');
	if (!created) {
		// A later render may declare the same cell with a new computation.
		const binding = owner.derivedBindings?.get(node);
		return (binding?.redeclare(compute, sequence, captures, declaring) ?? node) as DerivedSignal<T>;
	}
	configure?.(node);
	const binding = new Binding(owner, node, compute, options);
	binding.declared(sequence, captures, declaring);
	(owner.derivedBindings ??= new Map()).set(node, binding);
	initializeScopeRetention(owner, node);
	consumeScopeSeed(owner, key);
	return node as DerivedSignal<T>;
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
	if (typeof describe !== 'function') throw new TypeError(formatClientError(137));
	let node: ScopedNode<T>;
	if (unique) node = createScopeNode<T>(owner, key, 'async');
	else {
		const [declared, created] = declaredScopeNode<T>(owner, key, 'async');
		if (!created) {
			// A later render may declare the same cell with a new description.
			const binding = owner.resources?.get(declared) as ResourceBinding<T> | undefined;
			return (binding?.redeclare(describe, sequence, captures, declaring) ??
				declared) as Resource<T>;
		}
		node = declared;
	}
	const seed = initialScopeSeed(owner, key);
	const retained = retainedScopeSeed(owner, key);
	initializeScopeRetention(owner, node);
	signalBatch(() => {
		const binding = initialize(owner, node, describe, seed, retained);
		binding.declared(sequence, captures, declaring);
		(owner.resources ??= new Map()).set(node, binding);
		refreshNode(node);
		// A selection bound before this declaration ran may already hold results.
		owner.streams?.flush(node, binding);
	});
	consumeScopeSeed(owner, key);
	return node as Resource<T>;
}

export function adoptResourceValue<T>(
	handle$: SignalHandle<T>,
	requestKey: string | undefined,
	value: T,
): boolean {
	if (!(handle$ instanceof ScopedNode) || !(handle$.owner instanceof ScopeImpl)) return false;
	const binding = handle$.owner.resources?.get(handle$);
	if (!binding) return false;
	assertAlive(binding.owner);
	assertWritable();
	const entry = binding.selected;
	if (!entry || entry.request.identity !== requestKey) return false;
	const streaming = entry.request.definition.kind === 'stream';
	// A receipt reconciles the selected value, not the lifetime of its watch.
	// Later server yields still own authoritative progress and completion.
	if (!streaming) entry.stopAttempt();
	entry.state = readyState(value, {
		requestKey: entry.request.identity,
		connection: streaming ? entry.state.snapshot.connection : 'none',
		complete: streaming ? entry.state.snapshot.complete : true,
	});
	entry.deliver();
	return true;
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
	const binding = handle$.owner.resources?.get(handle$);
	if (!binding) return;
	return binding.selected ? binding.selectionAuthority : undefined;
}

export { startSignalBatch, endSignalBatch };
