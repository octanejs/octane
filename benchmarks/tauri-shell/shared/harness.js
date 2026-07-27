// Workload parameters and measurement plumbing shared byte-for-byte by every
// target, so the only difference between columns is the rendering layer.
//
// Both targets drive Tauri through raw `@tauri-apps/api` rather than through
// `@octanejs/tauri`. The binding is a ref write plus a teardown guard; putting
// it on one side only would fold its cost into the framework column.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/** Events Rust pushes through the IPC bridge for the stream op. */
export const STREAM_EVENTS = 4000;
/** Rows the tail keeps, so the stream evicts from the front while appending. */
export const WINDOW_SIZE = 200;
/** Rows for the keyed-reconciliation ops. */
export const ROW_COUNT = 10_000;
/**
 * Row-op repetitions per launch. WebKit quantizes `performance.now()` to 1ms,
 * which is most of a fast op's duration, so a single sample carries tens of
 * percent of quantization error. Many samples average it out, because the error
 * is uniform over the millisecond rather than biased.
 */
export const ROW_PASSES = 15;

/** Append one row and evict past the window, allocating a fresh array. */
export function appendCapped(rows, row) {
	const next = rows.length < WINDOW_SIZE ? rows.slice() : rows.slice(1);
	next.push(row);
	return next;
}

const NOUNS = ['batch', 'chunk', 'segment', 'shard', 'window', 'frame', 'page'];
const STATES = ['queued', 'running', 'flushed', 'sealed', 'verified'];

/**
 * Labels are derived from the index rather than randomized: a benchmark that
 * cannot be re-run to the same numbers cannot catch a regression.
 */
function label(index) {
	return `${STATES[index % STATES.length]} ${NOUNS[index % NOUNS.length]} ${index}`;
}

let nextId = 1;

export function buildRows(count) {
	const rows = new Array(count);
	for (let i = 0; i < count; i++) rows[i] = { seq: nextId++, text: label(i) };
	return rows;
}

/** Touch every tenth row, leaving the other nine intact for the diff to skip. */
export function updateEveryTenth(rows) {
	const next = rows.slice();
	for (let i = 0; i < next.length; i += 10) {
		next[i] = { seq: next[i].seq, text: `${next[i].text} !!!` };
	}
	return next;
}

/** Move two rows far apart, the classic keyed-identity probe. */
export function swapRows(rows) {
	if (rows.length < 3) return rows;
	const next = rows.slice();
	const a = 1;
	const b = next.length - 2;
	const held = next[a];
	next[a] = next[b];
	next[b] = held;
	return next;
}

/**
 * Resolve after the compositor has actually presented a frame. Only the boot
 * measurement uses this: a WKWebView that is not frontmost throttles rAF hard,
 * so waiting on it between every row pass would measure window focus.
 */
export function nextPaint() {
	return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/** Hand the event loop a turn between passes without waiting for a frame. */
export function yieldTurn() {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Drive Rust's event storm into `onTick` and resolve once the final event has
 * been rendered. Subscription is established before the command is issued, so
 * no event can be emitted into a gap.
 */
export async function runStream(onTick) {
	let settle;
	const finished = new Promise((resolve) => (settle = resolve));
	const unlisten = await listen('bench:tick', (event) => {
		onTick(event.payload, () => settle());
	});
	const started = performance.now();
	await invoke('bench_stream', { count: STREAM_EVENTS });
	await finished;
	const elapsed = performance.now() - started;
	unlisten();
	return elapsed;
}

/**
 * Time one synchronously flushed commit. `flush` is the framework's flushSync,
 * so the number is commit cost rather than how soon a frame happened to land.
 *
 * Layout is forced immediately AFTER the measured region. DOM mutation alone is
 * lazy, so leaving it unforced lets style and layout drift into whichever later
 * op first reads geometry; forcing it inside the region would instead bury the
 * framework's work under a layout cost both targets pay identically, since they
 * produce the same DOM.
 */
export function timeCommit(flush, apply) {
	const started = performance.now();
	flush(apply);
	const elapsed = performance.now() - started;
	void document.body.offsetHeight;
	return elapsed;
}

export async function report(result) {
	await invoke('bench_report', { payload: JSON.stringify(result) });
}
