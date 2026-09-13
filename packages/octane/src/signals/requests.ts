import { decodeSignalValue, encodeSignalValue } from './encoding.js';
import { SignalStreamError } from './errors.js';
import {
	ScopedNode,
	assertAlive,
	assertWritable,
	errorState,
	idleState,
	invalidateNode,
	isThenable,
	pendingState,
	publishNode,
	pure,
	readyState,
	refreshNode,
	releaseRetention,
	signalBatch,
	untrack,
	type GraphOwner,
	type NodeState,
} from './graph.js';
import {
	QUERY_REQUEST,
	skip,
	type Query,
	type QueryContext,
	type QueryRequest,
	type SignalSeedEntry,
} from './types.js';
import type {
	StreamFrameIdentity,
	StreamedSignalResultFrame,
} from '../streamed-signals-protocol.js';
import {
	captureCurrentServerSignalQueryAttemptObserver,
	hasServerSignalQueryAttemptObserver,
	observeServerSignalQueryAttempt,
} from './query-attempt-observer.js';

export interface QueryDefinition {
	readonly key: string;
	readonly kind: 'promise' | 'stream';
	readonly load: (argument: any, context: QueryContext) => unknown;
}

interface RetainedRequestIdentity {
	readonly queryKey: string;
	readonly kind: 'promise' | 'stream';
	readonly argument: unknown;
}

interface RequestOwner extends GraphOwner {
	readonly requests: Map<string, RequestEntry>;
	readonly queryDefinitions: Map<string, QueryDefinition>;
	readonly streamedSelections?: Map<string, StreamFrameIdentity>;
	streamedSelectionReady?(binding: ResourceBinding): void;
	discardCompletedStreamedSelection?(identity: StreamFrameIdentity): void;
}

class Request<T> implements QueryRequest<T> {
	get [QUERY_REQUEST](): T {
		return undefined as T;
	}
	readonly queryKey: string;
	readonly identity: string;
	readonly argument: unknown;

	constructor(
		readonly definition: QueryDefinition,
		argument: unknown,
	) {
		this.queryKey = definition.key;
		const encoded = encodeSignalValue(argument);
		this.identity = JSON.stringify([definition.key, encoded]);
		this.argument = decodeSignalValue(encoded);
		Object.freeze(this);
	}
}

export function query<A, T>(
	key: string,
	load: (argument: A, context: QueryContext) => T | PromiseLike<T>,
	options?: { kind?: 'promise' },
): Query<A, T>;
export function query<A, T>(
	key: string,
	load: (argument: A, context: QueryContext) => AsyncIterable<T> | PromiseLike<AsyncIterable<T>>,
	options: { kind: 'stream' },
): Query<A, T>;
export function query<A, T>(
	key: string,
	load: (argument: A, context: QueryContext) => unknown,
	options?: { kind?: 'promise' | 'stream' },
): Query<A, T> {
	if (typeof key !== 'string' || !key.trim() || typeof load !== 'function') {
		throw new TypeError('query requires a nonempty key and a loader function.');
	}
	const kind = options?.kind ?? 'promise';
	if (kind !== 'promise' && kind !== 'stream')
		throw new TypeError('Unsupported signal query kind.');
	const definition: QueryDefinition = Object.freeze({ key, load, kind });
	const describe = Object.assign((argument: A) => new Request<T>(definition, argument), {
		queryKey: key,
		kind,
	});
	return Object.freeze(describe);
}

interface Attempt {
	entry: RequestEntry | undefined;
	controller: AbortController | undefined;
	iterator: AsyncIterator<unknown> | undefined;
	readonly settled: Promise<void>;
	readonly generation: number;
	readonly streamed: boolean;
	result: unknown;
	readonly observations: Set<AttemptObservation>;
	sequence: number;
	resolve(): void;
	hasYielded: boolean;
}

interface AttemptObservation {
	readonly controller: AbortController;
	readonly mirror: StreamAttemptMirror | undefined;
}

class StreamAttemptMirror implements AsyncIterable<unknown>, AsyncIterator<unknown> {
	private pending:
		| {
				resolve(result: IteratorResult<unknown>): void;
				reject(error: unknown): void;
		  }
		| undefined;
	private queued: unknown;
	private hasQueued = false;
	private acknowledgement: (() => void) | undefined;
	private terminal: { kind: 'complete' } | { kind: 'error'; error: unknown } | undefined;

	constructor(private readonly releaseObservation: () => void) {}

	[Symbol.asyncIterator](): AsyncIterator<unknown> {
		return this;
	}

	next(): Promise<IteratorResult<unknown>> {
		if (this.pending !== undefined) {
			return Promise.reject(new TypeError('A streamed signal result permits one pending read.'));
		}
		this.acknowledgement?.();
		this.acknowledgement = undefined;
		if (this.hasQueued) {
			this.hasQueued = false;
			const value = this.queued;
			this.queued = undefined;
			return Promise.resolve({ done: false, value });
		}
		if (this.terminal !== undefined) {
			return this.terminal.kind === 'complete'
				? Promise.resolve({ done: true, value: undefined })
				: Promise.reject(this.terminal.error);
		}
		return new Promise((resolve, reject) => {
			this.pending = { resolve, reject };
		});
	}

	return(): Promise<IteratorResult<unknown>> {
		this.releaseObservation();
		return Promise.resolve({ done: true, value: undefined });
	}

	publish(value: unknown): Promise<void> {
		if (this.terminal !== undefined) return Promise.resolve();
		const acknowledgement = new Promise<void>((resolve) => {
			this.acknowledgement = resolve;
		});
		if (this.pending !== undefined) {
			const pending = this.pending;
			this.pending = undefined;
			pending.resolve({ done: false, value });
		} else {
			this.queued = value;
			this.hasQueued = true;
		}
		return acknowledgement;
	}

	complete(): void {
		if (this.terminal !== undefined) return;
		this.terminal = { kind: 'complete' };
		this.queued = undefined;
		this.hasQueued = false;
		this.acknowledgement?.();
		this.acknowledgement = undefined;
		this.pending?.resolve({ done: true, value: undefined });
		this.pending = undefined;
	}

	fail(error: unknown): void {
		if (this.terminal !== undefined) return;
		this.terminal = { kind: 'error', error };
		this.queued = undefined;
		this.hasQueued = false;
		this.acknowledgement?.();
		this.acknowledgement = undefined;
		this.pending?.reject(error);
		this.pending = undefined;
	}
}

function makeAttempt(entry: RequestEntry, generation: number, streamed = false): Attempt {
	let resolve!: () => void;
	const settled = new Promise<void>((done) => {
		resolve = done;
	});
	return {
		entry,
		controller: streamed ? undefined : new AbortController(),
		iterator: undefined,
		settled,
		generation,
		streamed,
		result: undefined,
		observations: new Set(),
		sequence: 0,
		resolve,
		hasYielded: false,
	};
}

export class RequestEntry {
	readonly consumers = new Set<ResourceBinding>();
	state: NodeState;
	attempt: Attempt | undefined;
	private generation = 0;

	constructor(
		readonly owner: RequestOwner,
		readonly request: Request<unknown>,
		seed?: { entry: SignalSeedEntry; value: unknown },
	) {
		this.state = seed
			? readyState(seed.value, {
					complete: seed.entry.complete,
					connection: request.definition.kind === 'stream' ? 'closed' : 'none',
					requestKey: request.identity,
				})
			: pendingState(Promise.resolve(), 'none', request.identity);
	}

	get active(): boolean {
		return this.attempt !== undefined;
	}

	get attemptGeneration(): number {
		return this.generation;
	}

	observe(nodeKey: string): Attempt | undefined {
		const attempt = this.attempt;
		if (!attempt || attempt.streamed || !hasServerSignalQueryAttemptObserver(this.owner.scopeKey)) {
			return;
		}
		let observation!: AttemptObservation;
		const release = (): void => releaseAttemptObservation(attempt, observation);
		const mirror =
			this.request.definition.kind === 'stream' ? new StreamAttemptMirror(release) : undefined;
		observation = { controller: new AbortController(), mirror };
		attempt.observations.add(observation);
		try {
			if (
				!observeServerSignalQueryAttempt({
					scopeKey: this.owner.scopeKey,
					nodeKey,
					selectionKey: this.request.identity,
					attempt: attempt.generation,
					kind: this.request.definition.kind,
					result: mirror ?? attempt.result,
					signal: observation.controller.signal,
					isCurrent: () => currentEntry(attempt) === this && attempt.observations.has(observation),
					release,
				})
			) {
				release();
				return;
			}
		} catch (error) {
			release();
			throw error;
		}
		return attempt;
	}

	start(pending: boolean): void {
		if (this.owner.readBarrier !== undefined) return;
		const generation = ++this.generation;
		this.stopAttempt();
		// Abort and iterator cleanup run producer code. A nested retry can finish
		// synchronously, so an empty attempt alone does not grant this call a lease.
		if (
			generation !== this.generation ||
			this.owner.readBarrier !== undefined ||
			this.owner.retired ||
			this.owner.requests.get(this.request.identity) !== this ||
			!this.consumers.size
		)
			return;
		const previous = this.state.snapshot;
		const attempt = (this.attempt = makeAttempt(this, generation));
		const connection = this.request.definition.kind === 'stream' ? 'connecting' : 'none';
		this.state =
			!pending && previous.status === 'ready'
				? readyState(previous.value, {
						refreshing: true,
						connection,
						complete: false,
						requestKey: this.request.identity,
					})
				: pendingState(attempt.settled, connection, this.request.identity);
		this.deliver();
		let result: unknown;
		try {
			result = untrack(() =>
				signalBatch(() =>
					this.request.definition.load(this.request.argument, {
						signal: attempt.controller!.signal,
						...(previous.status === 'ready' ? { previous: previous.value } : {}),
					}),
				),
			);
		} catch (error) {
			failAttempt(attempt, error);
			return;
		}
		// Promise continuations capture only the revocable attempt record, never
		// this entry, its consumers, or the owning scope.
		if (this.request.definition.kind === 'stream') observeStream(attempt, result);
		else {
			// Only promise observers need the original result; stream observers use
			// a mirror. Producer code may already have retired this attempt.
			if (currentEntry(attempt)) attempt.result = result;
			observePromise(attempt, result);
		}
	}

	startStreamed(identity: StreamFrameIdentity): boolean {
		if (
			this.owner.readBarrier !== undefined ||
			identity.selectionKey !== this.request.identity ||
			identity.attempt < this.generation ||
			(this.attempt === undefined &&
				identity.attempt === this.generation &&
				this.state.snapshot.status !== 'pending') ||
			this.owner.retired ||
			!this.consumers.size
		) {
			return false;
		}
		if (this.attempt?.streamed && this.attempt.generation === identity.attempt) {
			return true;
		}
		this.generation = identity.attempt;
		this.stopAttempt();
		if (
			this.generation !== identity.attempt ||
			this.owner.readBarrier !== undefined ||
			this.owner.retired ||
			this.owner.requests.get(this.request.identity) !== this ||
			!this.consumers.size
		) {
			return false;
		}
		this.attempt = makeAttempt(this, identity.attempt, true);
		return true;
	}

	acceptStreamed(frame: StreamedSignalResultFrame): boolean {
		const attempt = this.attempt;
		if (
			!attempt?.streamed ||
			attempt.generation !== frame.identity.attempt ||
			frame.sequence !== attempt.sequence ||
			currentEntry(attempt) !== this
		) {
			return false;
		}
		attempt.sequence++;
		signalBatch(() => {
			if (frame.kind === 'open') return;
			if (frame.kind === 'value') {
				attempt.hasYielded = true;
				this.state = readyState(decodeSignalValue(frame.value), {
					requestKey: this.request.identity,
					connection: this.request.definition.kind === 'stream' ? 'open' : 'none',
					complete: false,
				});
				this.deliver();
				return;
			}
			if (frame.kind === 'error') {
				this.state = errorState(
					new SignalStreamError(frame.code),
					this.request.definition.kind === 'stream' ? 'closed' : 'none',
					this.request.identity,
				);
				completeAttempt(attempt);
				this.deliver();
				return;
			}
			if (!attempt.hasYielded || this.state.snapshot.status !== 'ready') {
				this.state = errorState(
					new Error('The streamed signal completed without yielding a value.'),
					this.request.definition.kind === 'stream' ? 'closed' : 'none',
					this.request.identity,
				);
				completeAttempt(attempt);
				this.deliver();
				return;
			}
			this.state = readyState(this.state.snapshot.value, {
				requestKey: this.request.identity,
				connection: this.request.definition.kind === 'stream' ? 'closed' : 'none',
				complete: true,
			});
			completeAttempt(attempt);
			this.deliver();
		});
		return true;
	}

	deliver(): void {
		for (const consumer of this.consumers) consumer.deliver();
	}

	stopAttempt(): void {
		const attempt = this.attempt;
		if (!attempt) return;
		this.attempt = undefined;
		attempt.entry = undefined;
		const controller = attempt.controller;
		const iterator = attempt.iterator;
		attempt.controller = undefined;
		attempt.iterator = undefined;
		attempt.result = undefined;
		retireAttemptObservations(attempt);
		attempt.resolve();
		// Revoke publication and release owner references before user cancellation
		// callbacks run; those callbacks may synchronously select another request.
		if (controller) untrack(() => signalBatch(() => controller.abort()));
		if (iterator) closeIterator(iterator);
	}

	remove(consumer: ResourceBinding): void {
		this.consumers.delete(consumer);
		if (this.consumers.size) return;
		if (this.owner.requests.get(this.request.identity) === this) {
			this.owner.requests.delete(this.request.identity);
		}
		this.stopAttempt();
	}
}

function currentEntry(attempt: Attempt): RequestEntry | undefined {
	const entry = attempt.entry;
	return entry && !entry.owner.retired && entry.attempt === attempt ? entry : undefined;
}

function releaseAttemptObservation(attempt: Attempt, observation: AttemptObservation): void {
	if (!attempt.observations.delete(observation)) return;
	observation.mirror?.complete();
	observation.controller.abort();
}

function retireAttemptObservations(attempt: Attempt): void {
	for (const observation of attempt.observations) {
		observation.mirror?.fail(
			new DOMException('The signal query attempt was replaced.', 'AbortError'),
		);
		observation.controller.abort();
	}
	attempt.observations.clear();
}

function completeAttemptObservations(attempt: Attempt): void {
	for (const observation of attempt.observations) observation.mirror?.complete();
}

function failAttemptObservations(attempt: Attempt, error: unknown): void {
	for (const observation of attempt.observations) observation.mirror?.fail(error);
}

function publishAttemptObservations(attempt: Attempt, value: unknown): Promise<void> | undefined {
	let pending: Promise<void>[] | undefined;
	for (const observation of attempt.observations) {
		if (observation.mirror === undefined) continue;
		(pending ??= []).push(observation.mirror.publish(value));
	}
	return pending === undefined ? undefined : Promise.all(pending).then(() => {});
}

function completeAttempt(attempt: Attempt): void {
	completeAttemptObservations(attempt);
	const entry = attempt.entry;
	if (entry?.attempt === attempt) entry.attempt = undefined;
	attempt.entry = undefined;
	attempt.controller = undefined;
	attempt.iterator = undefined;
	attempt.result = undefined;
	attempt.resolve();
}

function observePromise(attempt: Attempt, result: unknown): void {
	Promise.resolve(result).then(
		(value) => {
			const entry = currentEntry(attempt);
			if (!entry) return;
			signalBatch(() => {
				entry.state = readyState(value, { requestKey: entry.request.identity });
				completeAttempt(attempt);
				entry.deliver();
			});
		},
		(error) => failAttempt(attempt, error),
	);
}

function failAttempt(attempt: Attempt, error: unknown): void {
	const entry = currentEntry(attempt);
	if (!entry) return;
	failAttemptObservations(attempt, error);
	signalBatch(() => {
		const iterator = attempt.iterator;
		entry.state = errorState(
			error,
			entry.request.definition.kind === 'stream' ? 'closed' : 'none',
			entry.request.identity,
		);
		completeAttempt(attempt);
		if (iterator) closeIterator(iterator);
		entry.deliver();
	});
}

// A close promise can remain pending in producer-owned code indefinitely. A
// module-level reaction cannot share closeIterator's lexical context with the
// callbacks that invoke return(), so it cannot retain that retired iterator.
function ignoreRetiredCloseFailure(): void {}

function closeIterator(iterator: AsyncIterator<unknown>): void {
	try {
		const result = untrack(() => signalBatch(() => iterator.return?.()));
		// A retired producer cannot publish a close failure or keep an unhandled
		// rejection alive. Current producer failures use failAttempt instead.
		Promise.resolve(result).catch(ignoreRetiredCloseFailure);
	} catch {
		// The publishing lease was already revoked before close was requested.
	}
}

function observeStream(attempt: Attempt, result: unknown): void {
	Promise.resolve(result).then(
		(iterable) => {
			if (!currentEntry(attempt)) return;
			let iterator: AsyncIterator<unknown>;
			try {
				if (
					!iterable ||
					typeof (iterable as AsyncIterable<unknown>)[Symbol.asyncIterator] !== 'function'
				) {
					throw new TypeError('A stream query must return an async iterable.');
				}
				iterator = untrack(() =>
					signalBatch(() => (iterable as AsyncIterable<unknown>)[Symbol.asyncIterator]()),
				);
				if (!iterator || typeof iterator.next !== 'function') {
					throw new TypeError('A stream query returned an invalid iterator.');
				}
			} catch (error) {
				failAttempt(attempt, error);
				return;
			}
			if (!currentEntry(attempt)) {
				closeIterator(iterator);
				return;
			}
			attempt.iterator = iterator;
			nextStreamStep(attempt);
		},
		(error) => failAttempt(attempt, error),
	);
}

function nextStreamStep(attempt: Attempt): void {
	if (!currentEntry(attempt) || !attempt.iterator) return;
	let step: PromiseLike<IteratorResult<unknown>> | IteratorResult<unknown>;
	try {
		step = untrack(() => signalBatch(() => attempt.iterator!.next()));
	} catch (error) {
		failAttempt(attempt, error);
		return;
	}
	// Chained steps avoid retaining the previous yielded payload in an async
	// function's suspended stack when the next read never settles.
	Promise.resolve(step).then(
		(result) => receiveStreamStep(attempt, result),
		(error) => failAttempt(attempt, error),
	);
}

function receiveStreamStep(attempt: Attempt, result: IteratorResult<unknown>): void {
	let entry = currentEntry(attempt);
	if (!entry) return;
	if (!result || (typeof result !== 'object' && typeof result !== 'function')) {
		failAttempt(attempt, new TypeError('An async iterator must return an iteration result.'));
		return;
	}
	let done = false;
	let value: unknown;
	try {
		untrack(() =>
			signalBatch(() => {
				done = Boolean(result.done);
				if (!done) value = result.value;
			}),
		);
	} catch (error) {
		failAttempt(attempt, error);
		return;
	}
	// Iterator result accessors are producer code too: they can retire or
	// replace the request, so publication must revalidate after reading them.
	entry = currentEntry(attempt);
	if (!entry) return;
	const accepted = entry;
	if (done) {
		if (!attempt.hasYielded || entry.state.snapshot.status !== 'ready') {
			failAttempt(attempt, new Error('The stream completed without yielding a value.'));
			return;
		}
		signalBatch(() => {
			accepted.state = readyState((accepted.state.snapshot as { value: unknown }).value, {
				connection: 'closed',
				complete: true,
				requestKey: accepted.request.identity,
			});
			completeAttempt(attempt);
			accepted.deliver();
		});
		return;
	}
	attempt.hasYielded = true;
	signalBatch(() => {
		accepted.state = readyState(value, {
			connection: 'open',
			complete: false,
			requestKey: accepted.request.identity,
		});
		accepted.deliver();
	});
	const observed = publishAttemptObservations(attempt, value);
	if (observed === undefined) nextStreamStep(attempt);
	else observed.then(() => nextStreamStep(attempt));
}

export class ResourceBinding<T = any> {
	private selected: RequestEntry | undefined;
	private selectedIdentity: RetainedRequestIdentity | undefined;
	private retainedRequest: RetainedRequestIdentity | undefined;
	private seeded: { entry: SignalSeedEntry; value: unknown } | undefined;
	private describedAttempt: Attempt | undefined;
	private observedAttempt: Attempt | undefined;
	private pendingObserver: (<V>(callback: () => V) => V) | undefined;
	private pendingPromise: PromiseLike<unknown> | undefined;
	private resolvePending: (() => void) | undefined;
	private streamedSelection: StreamFrameIdentity | undefined;
	private selectionAuthority: object = {};

	constructor(
		readonly owner: RequestOwner,
		readonly node: ScopedNode<T>,
		private describe: (() => QueryRequest<T> | typeof skip) | undefined,
		seed?: { entry: SignalSeedEntry; value: unknown },
		retained = seed,
	) {
		this.seeded = seed;
		const identity = retained?.entry.request;
		this.retainedRequest = identity
			? {
					queryKey: identity.queryKey,
					kind: identity.kind,
					argument: decodeSignalValue(identity.argument),
				}
			: undefined;
		node.compute = () => {
			const pending = this.pendingObserver;
			this.pendingObserver = undefined;
			// Dependency settlement can refresh the graph outside a render pass.
			// Re-enter only the observer captured by this pending description;
			// a current renderer already supplies its own observation context.
			return pending === undefined || hasServerSignalQueryAttemptObserver(this.owner.scopeKey)
				? this.compute()
				: pending(() => this.compute());
		};
		node.retry = (options) => this.retry(options);
	}

	private request(): Request<T> | typeof skip {
		const request = pure(() => this.describe!());
		if (request === skip) return request;
		if (!(request instanceof Request))
			throw new TypeError('asyncSignal$ must describe a query request.');
		return request;
	}

	private compute(): NodeState<T> {
		let request: Request<T>;
		try {
			const described = this.request();
			if (described === skip) {
				this.detach();
				this.seeded = undefined;
				return idleState();
			}
			request = described;
			const previousDefinition = this.owner.queryDefinitions.get(request.queryKey);
			if (
				previousDefinition &&
				(previousDefinition.load !== request.definition.load ||
					previousDefinition.kind !== request.definition.kind)
			) {
				throw new TypeError(
					`Incompatible query definitions use the same key "${request.queryKey}".`,
				);
			}
			this.owner.queryDefinitions.set(request.queryKey, request.definition);
		} catch (error) {
			if (isThenable(error)) {
				this.pendingObserver = captureCurrentServerSignalQueryAttemptObserver(this.owner.scopeKey);
			}
			this.detach();
			throw error;
		}
		if (this.selected?.request.identity !== request.identity) {
			this.detach();
			assertAlive(this.owner);
			this.selectedIdentity = {
				queryKey: request.queryKey,
				kind: request.definition.kind,
				argument: request.argument,
			};
			if (
				this.retainedRequest &&
				(this.retainedRequest.queryKey !== request.queryKey ||
					this.retainedRequest.kind !== request.definition.kind)
			) {
				this.retainedRequest = undefined;
				releaseRetention(this.node);
			}
			let entry = this.owner.requests.get(request.identity);
			let start = false;
			if (!entry) {
				const seed =
					this.seeded && matchesSeed(request, this.seeded.entry) ? this.seeded : undefined;
				entry = new RequestEntry(this.owner, request, seed);
				this.owner.requests.set(request.identity, entry);
				start = !seed || !seed.entry.complete;
			}
			this.seeded = undefined;
			this.selected = entry;
			entry.consumers.add(this);
			this.owner.trace('select', this.node);
			const streamed = this.owner.streamedSelections?.get(this.node.key);
			if (streamed && streamed.selectionKey !== request.identity) {
				// A completed historical request cannot become live if restoration
				// selects another key, nor if that old key is visited again later.
				this.owner.discardCompletedStreamedSelection?.(streamed);
			}
			if (streamed?.selectionKey === request.identity && entry.startStreamed(streamed)) {
				this.streamedSelection = streamed;
				this.owner.streamedSelectionReady?.(this);
				entry.deliver();
			} else if (start) {
				entry.start(entry.state.snapshot.status !== 'ready');
			}
		}
		this.observeSelectedAttempt();
		assertAlive(this.owner);
		return this.state();
	}

	private state(): NodeState<T> {
		const entry = this.selected!;
		if (this.describedAttempt !== entry.attempt) {
			this.resolvePending?.();
			this.resolvePending = undefined;
			this.pendingPromise = undefined;
			this.describedAttempt = entry.attempt;
		}
		if (entry.state.snapshot.status !== 'pending') {
			if (entry.state.snapshot.status === 'ready') this.retainedRequest = this.selectedIdentity;
			this.resolvePending?.();
			this.resolvePending = undefined;
			this.pendingPromise = undefined;
			return entry.state as NodeState<T>;
		}
		if (!this.pendingPromise) {
			this.pendingPromise = new Promise<void>((resolve) => {
				this.resolvePending = resolve;
			});
		}
		return pendingState(
			this.pendingPromise,
			entry.state.snapshot.connection,
			entry.request.identity,
			this.resolvePending,
		);
	}

	deliver(): void {
		if (this.owner.retired || this.node.evaluating) return;
		publishNode(this.node, this.state());
		this.owner.trace('publish', this.node);
	}

	private detach(): void {
		const entry = this.selected;
		// The initial SSR channel belongs to this selection lease. Returning to
		// the same key later starts a browser attempt, not the abandoned channel.
		if (this.streamedSelection === this.owner.streamedSelections?.get(this.node.key)) {
			this.owner.streamedSelections?.delete(this.node.key);
		}
		this.selected = undefined;
		this.selectedIdentity = undefined;
		this.describedAttempt = undefined;
		this.observedAttempt = undefined;
		this.resolvePending?.();
		this.resolvePending = undefined;
		this.pendingPromise = undefined;
		this.streamedSelection = undefined;
		this.selectionAuthority = {};
		entry?.remove(this);
	}

	private observeSelectedAttempt(): void {
		const attempt = this.selected?.attempt;
		if (!attempt || attempt === this.observedAttempt) return;
		if (this.selected!.observe(this.node.key) === attempt) this.observedAttempt = attempt;
	}

	get authority(): object | undefined {
		return this.selected ? this.selectionAuthority : undefined;
	}

	isStreamedSelectionReady(identity: StreamFrameIdentity): boolean {
		return (
			this.streamedSelection === identity &&
			this.selected?.request.identity === identity.selectionKey
		);
	}

	bindStreamedSelection(identity: StreamFrameIdentity): boolean {
		assertAlive(this.owner);
		const entry = this.selected;
		if (identity.nodeKey !== this.node.key) return false;
		if (!entry || entry.request.identity !== identity.selectionKey) {
			// The receiver may publish the new generation immediately before the
			// source write that makes its selection current. compute() consumes the
			// owner registration after that synchronous selection transition.
			this.streamedSelection = undefined;
			return true;
		}
		if (!entry.startStreamed(identity)) return false;
		this.streamedSelection = identity;
		entry.deliver();
		return true;
	}

	acceptStreamed(frame: StreamedSignalResultFrame): boolean {
		const identity = this.streamedSelection;
		const entry = this.selected;
		if (
			!identity ||
			!entry ||
			identity.nodeKey !== frame.identity.nodeKey ||
			identity.selectionKey !== frame.identity.selectionKey ||
			identity.selectionGeneration !== frame.identity.selectionGeneration ||
			identity.attempt !== frame.identity.attempt ||
			(frame.kind === 'open' && frame.resource !== entry.request.definition.kind)
		) {
			return false;
		}
		return entry.acceptStreamed(frame);
	}

	failStreamed(identity: StreamFrameIdentity, error: Error): boolean {
		const streamed = this.streamedSelection;
		const entry = this.selected;
		if (
			!streamed ||
			!entry ||
			streamed.nodeKey !== identity.nodeKey ||
			streamed.selectionKey !== identity.selectionKey ||
			streamed.selectionGeneration !== identity.selectionGeneration ||
			streamed.attempt !== identity.attempt ||
			entry.attempt?.generation !== identity.attempt ||
			!entry.attempt.streamed
		) {
			return false;
		}
		failAttempt(entry.attempt, error);
		return true;
	}

	retry(options?: { pending?: boolean }): void {
		assertAlive(this.owner);
		assertWritable();
		if (!this.selected && this.node.state?.snapshot.status === 'idle') return;
		signalBatch(() => {
			const previous = this.selected;
			if (!previous) invalidateNode(this.node);
			refreshNode(this.node);
			if (!this.selected) {
				// Description failures are retried by reevaluating that description;
				// they do not fabricate a request identity or mutate another resource.
				throw this.node.state?.snapshot.status === 'error'
					? this.node.state.snapshot.error
					: new Error('The request description is still pending.');
			}
			this.owner.trace('retry', this.node);
			// Recovery or a changed selection has already acquired its attempt in
			// compute(). Do not immediately cancel and start that work twice.
			if (this.selected === previous) this.selected.start(options?.pending === true);
			this.observeSelectedAttempt();
		});
	}

	adopt(requestKey: string | undefined, value: T): boolean {
		assertAlive(this.owner);
		assertWritable();
		const entry = this.selected;
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

	seedRequest(retained = false): SignalSeedEntry['request'] {
		const request = retained ? this.retainedRequest : this.selectedIdentity;
		if (!request) return undefined;
		return {
			queryKey: request.queryKey,
			kind: request.kind,
			argument: encodeSignalValue(request.argument),
		};
	}

	acceptsSeed(seed: SignalSeedEntry): boolean {
		// In a frame this description reads historical arguments. It neither
		// reselects a live entry nor starts a loader or populates a live cache.
		const request = this.request();
		return request !== skip && matchesSeed(request, seed);
	}

	dispose(): void {
		this.detach();
		this.pendingObserver = undefined;
		this.describe = undefined;
		this.seeded = undefined;
		this.retainedRequest = undefined;
		this.streamedSelection = undefined;
	}
}

function matchesSeed(request: Request<unknown>, seed: SignalSeedEntry): boolean {
	return (
		seed.kind === 'async' &&
		seed.request?.queryKey === request.queryKey &&
		seed.request.kind === request.definition.kind &&
		JSON.stringify(seed.request.argument) === JSON.stringify(encodeSignalValue(request.argument))
	);
}

export function initializeResource<T>(
	owner: RequestOwner,
	node: ScopedNode<T>,
	describe: () => QueryRequest<T> | typeof skip,
	seed?: { entry: SignalSeedEntry; value: unknown },
	retained = seed,
): ResourceBinding<T> {
	return new ResourceBinding(owner, node, describe, seed, retained);
}
