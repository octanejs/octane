import type {
	ServerSignalQueryAttemptObserverContext,
	ServerSignalQueryAttemptObservations,
	ServerSignalQueryAttemptSource,
} from '../signals/query-attempt-observer.js';

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

/** One attempt can feed several renderer channels, each with its own cancellation lease. */
class QueryAttemptObservations implements ServerSignalQueryAttemptObservations {
	private readonly observations = new Set<AttemptObservation>();

	observe(
		context: ServerSignalQueryAttemptObserverContext,
		source: ServerSignalQueryAttemptSource,
	): void {
		let observation!: AttemptObservation;
		const release = (): void => this.release(observation);
		const mirror = source.kind === 'stream' ? new StreamAttemptMirror(release) : undefined;
		observation = { controller: new AbortController(), mirror };
		this.observations.add(observation);
		try {
			context.observe({
				ownerKey: context.owner.documentOwner.scopeKey,
				instanceKey: context.owner.instanceKey,
				nodeKey: source.nodeKey,
				selectionKey: source.selectionKey,
				attempt: source.attempt,
				kind: source.kind,
				result: mirror ?? source.result,
				signal: observation.controller.signal,
				isCurrent: () => source.isCurrent() && this.observations.has(observation),
				release,
			});
		} catch (error) {
			release();
			throw error;
		}
	}

	private release(observation: AttemptObservation): void {
		if (!this.observations.delete(observation)) return;
		observation.mirror?.complete();
		observation.controller.abort();
	}

	retire(): void {
		for (const observation of this.observations) {
			observation.mirror?.fail(
				new DOMException('The signal query attempt was replaced.', 'AbortError'),
			);
			observation.controller.abort();
		}
		this.observations.clear();
	}

	complete(): void {
		for (const observation of this.observations) observation.mirror?.complete();
	}

	fail(error: unknown): void {
		for (const observation of this.observations) observation.mirror?.fail(error);
	}

	publish(value: unknown): Promise<void> | undefined {
		let pending: Promise<void>[] | undefined;
		for (const observation of this.observations) {
			if (observation.mirror === undefined) continue;
			(pending ??= []).push(observation.mirror.publish(value));
		}
		return pending === undefined ? undefined : Promise.all(pending).then(() => {});
	}
}

/** Allocate server mirrors only for an observed attempt, not ordinary browser requests. */
export function createServerSignalQueryAttemptObservations(): ServerSignalQueryAttemptObservations {
	return new QueryAttemptObservations();
}
