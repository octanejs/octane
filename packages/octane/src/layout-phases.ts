// Read and write phases for layout work (#2309).
//
// A layout read after a DOM write makes the browser lay out synchronously.
// When several components each read and then write, the browser lays out once
// per component. Queueing the reads with `readLayout` and the writes with
// `writeLayout` runs every read first and every write after, so one frame lays
// out once however many callers took part.
//
// The queue is global because layout belongs to the document, not to a root.
// It lives outside `runtime/` and imports nothing from the engine: an app that never queues layout work
// does not ship it.

import { postHostTask } from './host-task.js';

declare const process: { env: { NODE_ENV?: string } };

/** What the layout queue is running now. */
export const RenderingPhase = { IDLE: 0, READ: 1, WRITE: 2 } as const;
export type RenderingPhase = (typeof RenderingPhase)[keyof typeof RenderingPhase];

type Entry = { task: (() => void) | null };

// A read may queue a write and a write may queue a read. This bounds a pair
// that never settles, the same limit a commit gives nested layout updates.
const PASS_LIMIT = 50;

let phase: RenderingPhase = RenderingPhase.IDLE;
let reads: Entry[] = [];
let writes: Entry[] = [];
let frameRequested = false;

/** The phase the layout queue is in: READ and WRITE only while it runs tasks. */
export function getPhase(): RenderingPhase {
	return phase;
}

/**
 * Queue a layout read for the next frame. Reads run together, before any queued
 * write, so the browser lays out at most once for all of them. Returns a
 * function that cancels the read if it has not run.
 */
export function readLayout(task: () => void): () => void {
	return enqueue(reads, task);
}

/**
 * Queue a DOM write for the next frame, after every queued read. Returns a
 * function that cancels the write if it has not run.
 */
export function writeLayout(task: () => void): () => void {
	return enqueue(writes, task);
}

function enqueue(queue: Entry[], task: () => void): () => void {
	const entry: Entry = { task };
	queue.push(entry);
	requestFrame();
	return () => {
		entry.task = null;
	};
}

function requestFrame(): void {
	if (frameRequested) return;
	frameRequested = true;
	const run = () => {
		frameRequested = false;
		flushLayoutSync();
	};
	// The work must land before paint, so it takes the frame. A hidden page may
	// never get one, and nothing paints there, so a host task does.
	if (
		typeof requestAnimationFrame === 'function' &&
		(typeof document === 'undefined' || document.visibilityState !== 'hidden')
	) {
		requestAnimationFrame(run);
	} else {
		postHostTask(run);
	}
}

/**
 * Run the queued reads and writes now instead of in the next frame. Called from
 * inside a queued task it does nothing: the running flush picks up whatever
 * that task queued.
 */
export function flushLayoutSync(): void {
	if (phase !== RenderingPhase.IDLE) return;
	let failure: { error: unknown } | null = null;
	const run = (batch: Entry[]) => {
		for (const entry of batch) {
			const task = entry.task;
			if (task === null) continue;
			entry.task = null;
			try {
				task();
			} catch (error) {
				// The rest of the batch still runs; the first error is rethrown.
				failure ??= { error };
			}
		}
	};
	try {
		for (let pass = 0; reads.length > 0 || writes.length > 0; pass++) {
			if (pass === PASS_LIMIT) {
				if (process.env.NODE_ENV !== 'production') {
					console.error(
						`Layout reads and writes did not settle after ${PASS_LIMIT} passes. ` +
							'The rest run in the next frame. A readLayout or writeLayout task keeps queueing another.',
					);
				}
				// What is left was queued during this flush, which armed a frame.
				break;
			}
			phase = RenderingPhase.READ;
			let batch = reads;
			reads = [];
			run(batch);
			phase = RenderingPhase.WRITE;
			// Work a task queues waits for the next pass, which keeps the bound.
			batch = writes;
			writes = [];
			run(batch);
		}
	} finally {
		phase = RenderingPhase.IDLE;
	}
	if (failure !== null) throw (failure as { error: unknown }).error;
}
