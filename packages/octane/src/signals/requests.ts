import { decodeSignalValue, encodeSignalValue } from './encoding.js';
import {
	ScopedNode,
	assertAlive,
	assertWritable,
	errorState,
	invalidateNode,
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
import type { QUERY_REQUEST, Query, QueryContext, QueryRequest, SignalSeedEntry } from './types.js';

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
}

class Request<T> implements QueryRequest<T> {
	declare readonly [QUERY_REQUEST]: T;
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
	resolve(): void;
	hasYielded: boolean;
}

function makeAttempt(entry: RequestEntry): Attempt {
	let resolve!: () => void;
	const settled = new Promise<void>((done) => {
		resolve = done;
	});
	return {
		entry,
		controller: new AbortController(),
		iterator: undefined,
		settled,
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

	start(pending: boolean): void {
		const generation = ++this.generation;
		this.stopAttempt();
		// Abort and iterator cleanup run producer code. A nested retry can finish
		// synchronously, so an empty attempt alone does not grant this call a lease.
		if (
			generation !== this.generation ||
			this.owner.retired ||
			this.owner.requests.get(this.request.identity) !== this ||
			!this.consumers.size
		)
			return;
		const previous = this.state.snapshot;
		const attempt = (this.attempt = makeAttempt(this));
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
		else observePromise(attempt, result);
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

function completeAttempt(attempt: Attempt): void {
	const entry = attempt.entry;
	if (entry?.attempt === attempt) entry.attempt = undefined;
	attempt.entry = undefined;
	attempt.controller = undefined;
	attempt.iterator = undefined;
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
	nextStreamStep(attempt);
}

export class ResourceBinding<T = any> {
	private selected: RequestEntry | undefined;
	private selectedIdentity: RetainedRequestIdentity | undefined;
	private retainedRequest: RetainedRequestIdentity | undefined;
	private seeded: { entry: SignalSeedEntry; value: unknown } | undefined;
	private describedAttempt: Attempt | undefined;
	private pendingPromise: PromiseLike<unknown> | undefined;
	private resolvePending: (() => void) | undefined;

	constructor(
		readonly owner: RequestOwner,
		readonly node: ScopedNode<T>,
		private describe: (() => QueryRequest<T>) | undefined,
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
		node.compute = () => this.compute();
		node.retry = (options) => this.retry(options);
	}

	private request(): Request<T> {
		const request = pure(() => this.describe!());
		if (!(request instanceof Request))
			throw new TypeError('asyncSignal$ must describe a query request.');
		return request;
	}

	private compute(): NodeState<T> {
		let request: Request<T>;
		try {
			request = this.request();
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
			if (start) entry.start(entry.state.snapshot.status !== 'ready');
		}
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
		this.selected = undefined;
		this.selectedIdentity = undefined;
		this.describedAttempt = undefined;
		this.resolvePending?.();
		this.resolvePending = undefined;
		this.pendingPromise = undefined;
		entry?.remove(this);
	}

	retry(options?: { pending?: boolean }): void {
		assertAlive(this.owner);
		assertWritable();
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
		});
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
		return matchesSeed(this.request(), seed);
	}

	dispose(): void {
		this.detach();
		this.describe = undefined;
		this.seeded = undefined;
		this.retainedRequest = undefined;
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
	describe: () => QueryRequest<T>,
	seed?: { entry: SignalSeedEntry; value: unknown },
	retained = seed,
): ResourceBinding<T> {
	return new ResourceBinding(owner, node, describe, seed, retained);
}
