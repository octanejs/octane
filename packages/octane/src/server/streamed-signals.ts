import { encodeSignalValue } from '../data-encoding.js';
import {
	encodeStreamedRendererFrameForScript,
	isStreamFrameIdentity,
	isStreamedRendererFrame,
	type StreamedRendererFrame,
	type StreamedSignalResultFrame,
	type StreamFrameIdentity,
} from '../streamed-signals-protocol.js';
import type { StreamInjectionSource } from '../runtime.server.js';
import type { ServerSignalQueryAttempt } from '../signals/query-attempt-observer.js';

export interface StreamedRendererLimits {
	readonly maxFrameBytes?: number;
	readonly maxTotalBytes?: number;
	readonly timeoutMs?: number;
}

export interface StreamedSignalResultOptions extends StreamedRendererLimits {
	readonly signal?: AbortSignal;
	/** Re-enter the captured server request owner for lazy iterator pulls. */
	readonly run?: <T>(callback: () => T) => T;
	/** @internal Initial-document authority announcement before result frames. */
	readonly announceSelection?: boolean;
}

export interface AutomaticStreamedSignalOptions extends StreamedRendererLimits {
	readonly buildId: string;
	readonly documentId: string;
	readonly selectionGeneration?: number;
	readonly nonce?: string;
}

export interface AutomaticStreamedSignalInjection extends StreamInjectionSource {
	observeSignalAttempt(attempt: ServerSignalQueryAttempt, run?: <T>(callback: () => T) => T): void;
}

const DEFAULT_MAX_FRAME_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT = 30_000;

function positiveLimit(value: number | undefined, fallback: number): number {
	const limit = value ?? fallback;
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		throw new RangeError('Streamed renderer limits must be positive safe integers.');
	}
	return limit;
}

function limits(options: StreamedRendererLimits): Required<StreamedRendererLimits> {
	return {
		maxFrameBytes: positiveLimit(options.maxFrameBytes, DEFAULT_MAX_FRAME_BYTES),
		maxTotalBytes: positiveLimit(options.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES),
		timeoutMs: positiveLimit(options.timeoutMs, DEFAULT_TIMEOUT),
	};
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
	);
}

/** Produce the authoritative result-channel grammar without exposing server errors. */
export async function* createStreamedSignalResultFrames(
	identity: StreamFrameIdentity,
	result: unknown,
	options: Pick<StreamedSignalResultOptions, 'signal' | 'run'> = {},
): AsyncGenerator<StreamedSignalResultFrame> {
	if (!isStreamFrameIdentity(identity)) throw new TypeError('Invalid streamed signal identity.');
	let sequence = 0;
	let iterator: AsyncIterator<unknown> | undefined;
	const run = options.run ?? ((callback) => callback());
	try {
		const resolved = await result;
		options.signal?.throwIfAborted();
		if (isAsyncIterable(resolved)) {
			iterator = run(() => resolved[Symbol.asyncIterator]());
			yield { identity, sequence: sequence++, channel: 'result', kind: 'open', resource: 'stream' };
			for (;;) {
				options.signal?.throwIfAborted();
				const next = await run(() => iterator!.next());
				options.signal?.throwIfAborted();
				if (next.done) break;
				yield {
					identity,
					sequence: sequence++,
					channel: 'result',
					kind: 'value',
					value: encodeSignalValue(next.value),
				};
			}
			iterator = undefined;
		} else {
			yield {
				identity,
				sequence: sequence++,
				channel: 'result',
				kind: 'open',
				resource: 'promise',
			};
			yield {
				identity,
				sequence: sequence++,
				channel: 'result',
				kind: 'value',
				value: encodeSignalValue(resolved),
			};
		}
		yield { identity, sequence, channel: 'result', kind: 'complete' };
	} catch {
		yield { identity, sequence, channel: 'result', kind: 'error', code: 'SERVER_RESULT_FAILED' };
	} finally {
		if (iterator !== undefined) {
			try {
				await run(() => iterator!.return?.());
			} catch {
				// Iterator cleanup is best effort after terminal failure/cancellation.
			}
		}
	}
}

function line(frame: StreamedRendererFrame): Uint8Array {
	if (!isStreamedRendererFrame(frame)) throw new TypeError('Invalid streamed renderer frame.');
	return new TextEncoder().encode(JSON.stringify(frame) + '\n');
}

/** Demand-driven newline-delimited transport for later fetched SSR regions/results. */
export function createStreamedRendererFrameStream(
	frames: AsyncIterable<StreamedRendererFrame>,
	options: StreamedRendererLimits & { signal?: AbortSignal } = {},
): ReadableStream<Uint8Array> {
	const budget = limits(options);
	const iterator = frames[Symbol.asyncIterator]();
	let totalBytes = 0;
	let finished = false;
	let controller: ReadableStreamDefaultController<Uint8Array>;
	const timer = setTimeout(
		() => fail(new Error('Streamed renderer response timed out.')),
		budget.timeoutMs,
	);
	const cleanup = (): void => {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', abort);
	};
	const closeIterator = (): void => {
		try {
			void Promise.resolve(iterator.return?.(undefined)).catch(() => {});
		} catch {
			// Best effort after transport failure.
		}
	};
	const fail = (error: unknown): void => {
		if (finished) return;
		finished = true;
		cleanup();
		closeIterator();
		controller?.error(error);
	};
	const abort = (): void =>
		fail(options.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
	return new ReadableStream<Uint8Array>(
		{
			start(streamController) {
				controller = streamController;
				options.signal?.addEventListener('abort', abort, { once: true });
				if (options.signal?.aborted) abort();
			},
			async pull() {
				if (finished) return;
				try {
					const next = await iterator.next();
					if (finished) return;
					if (next.done) {
						finished = true;
						cleanup();
						controller.close();
						return;
					}
					const encoded = line(next.value);
					if (
						encoded.byteLength > budget.maxFrameBytes ||
						totalBytes + encoded.byteLength > budget.maxTotalBytes
					) {
						throw new Error('Streamed renderer response exceeded its byte budget.');
					}
					totalBytes += encoded.byteLength;
					controller.enqueue(encoded);
				} catch (error) {
					fail(error);
				}
			},
			cancel() {
				if (finished) return;
				finished = true;
				cleanup();
				closeIterator();
			},
		},
		{ highWaterMark: 0 },
	);
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Serialize one validated frame for an already-installed pre-module receiver. */
export function streamedRendererFrameScript(frame: StreamedRendererFrame, nonce?: string): string {
	const encoded = encodeStreamedRendererFrameForScript(frame);
	return `<script${nonce === undefined ? '' : ` nonce="${escapeAttribute(nonce)}"`}>globalThis.__octaneStreamedRenderer.receive(${encoded});</script>`;
}

function streamedSignalSelectionScript(identity: StreamFrameIdentity, nonce?: string): string {
	if (!isStreamFrameIdentity(identity)) throw new TypeError('Invalid streamed signal identity.');
	const encoded = JSON.stringify(identity)
		.replace(/&/g, '\\u0026')
		.replace(/</g, '\\u003c')
		.replace(/>/g, '\\u003e')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
	return `<script${nonce === undefined ? '' : ` nonce="${escapeAttribute(nonce)}"`}>(function(g){var k="__octaneStreamedRenderer",e=g[k];if(!e){var q=[];g[k]={version:1,frames:q,receive:function(f){if(q.length>=512){this.overflow=true;return;}q.push(f);}};}var z="__octaneStreamedSignalSelections",v=g[z];if(!v){var a=[];v=g[z]={version:1,identities:a,register:function(i){if(a.length>=256){this.overflow=true;return;}a.push(i);}};}v.register(${encoded});})(globalThis);</script>`;
}

/**
 * Adapt one signal result to renderTo*Stream's external injection channel.
 * The producer advances only after the renderer confirms the prior injected
 * script reached its transport sink.
 */
export function createStreamedSignalInjection(
	identity: StreamFrameIdentity,
	result: unknown,
	options: StreamedSignalResultOptions & { nonce?: string } = {},
): StreamInjectionSource {
	const budget = limits(options);
	const iterator = createStreamedSignalResultFrames(identity, result, options)[
		Symbol.asyncIterator
	]();
	let queued = options.announceSelection
		? streamedSignalSelectionScript(identity, options.nonce)
		: '';
	let pending = false;
	let finished = false;
	let subscribed = false;
	let totalBytes = 0;
	let notify: (() => void) | undefined;
	let resolveDone!: () => void;
	let rejectDone!: (error: unknown) => void;
	const done = new Promise<void>((resolve, reject) => {
		resolveDone = resolve;
		rejectDone = reject;
	});
	let timer: ReturnType<typeof setTimeout>;
	const cleanup = (): void => {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', abort);
	};
	const closeIterator = (): void => {
		try {
			void Promise.resolve(iterator.return?.(undefined)).catch(() => {});
		} catch {
			// Best effort after a local transport failure.
		}
	};
	const fail = (error: unknown): void => {
		if (finished) return;
		finished = true;
		cleanup();
		closeIterator();
		rejectDone(error);
	};
	const pump = (): void => {
		if (!subscribed || pending || queued !== '' || finished) return;
		pending = true;
		void iterator.next().then(
			(next) => {
				pending = false;
				if (finished) return;
				if (next.done) {
					finished = true;
					cleanup();
					resolveDone();
					return;
				}
				const html = streamedRendererFrameScript(next.value, options.nonce);
				const bytes = new TextEncoder().encode(html).byteLength;
				if (bytes > budget.maxFrameBytes || totalBytes + bytes > budget.maxTotalBytes) {
					fail(new Error('Streamed renderer injection exceeded its byte budget.'));
					return;
				}
				totalBytes += bytes;
				queued = html;
				notify?.();
			},
			(error) => {
				pending = false;
				fail(error);
			},
		);
	};
	const abort = (): void => {
		fail(options.signal?.reason ?? new DOMException('Aborted', 'AbortError'));
	};
	timer = setTimeout(
		() => fail(new Error('Streamed renderer injection timed out.')),
		budget.timeoutMs,
	);
	options.signal?.addEventListener('abort', abort, { once: true });
	if (options.signal?.aborted) abort();
	return {
		streamedRenderer: true,
		take() {
			const html = queued;
			queued = '';
			return html;
		},
		subscribe(callback) {
			notify = callback;
			subscribed = true;
			pump();
			return () => {
				if (notify === callback) notify = undefined;
			};
		},
		accepted() {
			pump();
		},
		cancel: fail,
		done,
		renderComplete() {
			pump();
		},
	};
}

/**
 * Multiplex every query attempt discovered by one SSR render into the same
 * backpressure-aware pre-module result channel.
 */
export function createAutomaticStreamedSignalInjection(
	options: AutomaticStreamedSignalOptions,
	external?: StreamInjectionSource,
): AutomaticStreamedSignalInjection {
	if (!options.buildId || !options.documentId) {
		throw new TypeError('Automatic streamed signals require buildId and documentId.');
	}
	const budget = limits(options);
	const selectionGeneration = options.selectionGeneration ?? 0;
	if (!Number.isSafeInteger(selectionGeneration) || selectionGeneration < 0) {
		throw new RangeError('selectionGeneration must be a nonnegative safe integer.');
	}
	type Child = {
		source: StreamInjectionSource;
		release: () => void;
		unsubscribe: () => void;
		attempt?: ServerSignalQueryAttempt;
		done: boolean;
	};
	const children: Child[] = [];
	const observedAttempts = new Set<string>();
	let initialSelections:
		Array<{ identity: StreamFrameIdentity; attempt: ServerSignalQueryAttempt }> | undefined = [];
	let queued = '';
	let active: Child | undefined;
	let subscribed = false;
	let renderComplete = false;
	let finished = false;
	let totalBytes = 0;
	let notify: (() => void) | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let resolveDone!: () => void;
	let rejectDone!: (error: unknown) => void;
	const done = new Promise<void>((resolve, reject) => {
		resolveDone = resolve;
		rejectDone = reject;
	});
	const cleanupChild = (child: Child): void => {
		try {
			child.unsubscribe();
		} catch {
			// One external cleanup must not prevent the remaining observations releasing.
		}
		try {
			child.release();
		} catch {
			// Preserve the transport's terminal outcome even when cleanup fails.
		}
	};
	const fail = (error: unknown): void => {
		if (finished) return;
		finished = true;
		if (timer !== undefined) clearTimeout(timer);
		for (const child of children) {
			try {
				child.source.cancel?.(error);
			} catch {
				// Continue cleanup and reject done with the original failure.
			}
			cleanupChild(child);
		}
		rejectDone(error);
	};
	const maybeDone = (): void => {
		if (finished || !renderComplete || active !== undefined || queued !== '') return;
		for (const child of children) if (!child.done) return;
		finished = true;
		if (timer !== undefined) clearTimeout(timer);
		for (const child of children) cleanupChild(child);
		resolveDone();
	};
	const takeInitialSelections = (): string => {
		const selections = initialSelections;
		initialSelections = undefined;
		let html = '';
		for (const { identity, attempt } of selections ?? []) {
			// A settled result still needs authority for adoption; cancellation,
			// unlike settlement, revokes the renderer's observation lease.
			if (attempt.signal.aborted) continue;
			const script = streamedSignalSelectionScript(identity, options.nonce);
			const bytes = new TextEncoder().encode(script).byteLength;
			if (bytes > budget.maxFrameBytes || totalBytes + bytes > budget.maxTotalBytes) {
				const error = new Error('Automatic streamed signals exceeded their byte budget.');
				fail(error);
				throw error;
			}
			totalBytes += bytes;
			html += script;
		}
		return html;
	};
	const pump = (): void => {
		if (!subscribed || finished || active !== undefined || queued !== '') return;
		if (initialSelections !== undefined) {
			try {
				queued = takeInitialSelections();
			} catch {
				// The producer's done promise already carries the budget failure.
				return;
			}
			if (queued !== '') {
				notify?.();
				return;
			}
		}
		for (const child of children) {
			const html = child.source.take();
			if (html === '') continue;
			const bytes = new TextEncoder().encode(html).byteLength;
			if (bytes > budget.maxFrameBytes || totalBytes + bytes > budget.maxTotalBytes) {
				fail(new Error('Automatic streamed signals exceeded their byte budget.'));
				return;
			}
			totalBytes += bytes;
			active = child;
			queued = html;
			notify?.();
			return;
		}
		maybeDone();
	};
	const addChild = (
		source: StreamInjectionSource,
		release: () => void,
		attempt?: ServerSignalQueryAttempt,
	): void => {
		const child: Child = {
			source,
			release,
			unsubscribe: () => {},
			...(attempt === undefined ? {} : { attempt }),
			done: false,
		};
		children.push(child);
		child.unsubscribe = source.subscribe(pump);
		source.done.then(
			() => {
				child.done = true;
				pump();
			},
			(error) => {
				if (child.attempt !== undefined && !child.attempt.isCurrent()) {
					child.done = true;
					pump();
				} else fail(error);
			},
		);
	};
	if (external !== undefined) addChild(external, () => {});
	return {
		takeInitialSelections,
		get streamedRenderer() {
			return external?.streamedRenderer === true ||
				children.some((child) => child.attempt !== undefined)
				? true
				: undefined;
		},
		observeSignalAttempt(attempt, run) {
			if (finished || !attempt.isCurrent()) {
				attempt.release();
				return;
			}
			const attemptKey = JSON.stringify([
				attempt.ownerKey,
				attempt.instanceKey,
				attempt.nodeKey,
				attempt.selectionKey,
				attempt.attempt,
			]);
			if (observedAttempts.has(attemptKey)) {
				attempt.release();
				return;
			}
			if (children.length >= 256) {
				attempt.release();
				fail(new Error('Automatic streamed signals exceeded their channel budget.'));
				return;
			}
			observedAttempts.add(attemptKey);
			if (timer === undefined) {
				timer = setTimeout(
					() => fail(new Error('Automatic streamed signals timed out.')),
					budget.timeoutMs,
				);
			}
			const identity: StreamFrameIdentity = {
				protocol: 1,
				buildId: options.buildId,
				documentId: options.documentId,
				ownerKey: attempt.ownerKey,
				instanceKey: attempt.instanceKey,
				nodeKey: attempt.nodeKey,
				selectionKey: attempt.selectionKey,
				selectionGeneration,
				attempt: attempt.attempt,
			};
			initialSelections?.push({ identity, attempt });
			const source = createStreamedSignalInjection(identity, attempt.result, {
				signal: attempt.signal,
				run,
				nonce: options.nonce,
				announceSelection: initialSelections === undefined,
				maxFrameBytes: budget.maxFrameBytes,
				maxTotalBytes: budget.maxTotalBytes,
				timeoutMs: budget.timeoutMs,
			});
			addChild(source, attempt.release, attempt);
			pump();
		},
		take() {
			const html = queued;
			queued = '';
			return html;
		},
		subscribe(callback) {
			notify = callback;
			subscribed = true;
			pump();
			return () => {
				if (notify === callback) notify = undefined;
			};
		},
		accepted() {
			const child = active;
			active = undefined;
			child?.source.accepted?.();
			pump();
		},
		cancel: fail,
		done,
		renderComplete() {
			renderComplete = true;
			for (const child of children) child.source.renderComplete?.();
			maybeDone();
		},
	};
}
