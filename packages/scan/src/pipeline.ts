// The inspection pipeline — the one dispatcher between a source and everything
// that consumes it. It assembles per-commit batches from the source's event
// stream and commit boundaries, then fans events and commits out to
// subscribers (services and plugins). Nothing here knows what an event means or
// what a consumer does; it only routes. This is why a report store, an overlay,
// an interaction profiler, and a future flamegraph plugin can all coexist
// without any of them referencing each other.
import type { CommitEvent, InspectionEvent, InspectionSink } from './contract.js';

type EventListener = (event: InspectionEvent) => void;
type CommitListener = (commit: CommitEvent) => void;

export interface Pipeline {
	/** The sink a source pushes into. */
	readonly sink: InspectionSink;
	/** Fires for every event, in arrival order. */
	onEvent(listener: EventListener): () => void;
	/** Fires once per commit with the batch of events it contained. */
	onCommit(listener: CommitListener): () => void;
}

export function createPipeline(): Pipeline {
	const eventListeners = new Set<EventListener>();
	const commitListeners = new Set<CommitListener>();
	let buffer: InspectionEvent[] = [];
	let commitId = 1;
	let commitStartTime = 0;

	function dispatchEvent(event: InspectionEvent): void {
		buffer.push(event);
		for (const listener of eventListeners) {
			try {
				listener(event);
			} catch {
				// A consumer must never break the app being scanned, nor starve
				// sibling consumers of the same event.
			}
		}
	}

	function flushCommit(): void {
		if (buffer.length === 0) return;
		const commit: CommitEvent = { id: commitId++, startTime: commitStartTime, events: buffer };
		buffer = [];
		for (const listener of commitListeners) {
			try {
				listener(commit);
			} catch {
				// Isolated per the same contract as events.
			}
		}
	}

	const sink: InspectionSink = {
		event: dispatchEvent,
		commitStart() {
			commitStartTime = buffer.length === 0 ? nowMs() : commitStartTime;
		},
		commitFinish() {
			flushCommit();
		},
	};

	return {
		sink,
		onEvent(listener) {
			eventListeners.add(listener);
			return () => eventListeners.delete(listener);
		},
		onCommit(listener) {
			commitListeners.add(listener);
			return () => commitListeners.delete(listener);
		},
	};
}

function nowMs(): number {
	return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
