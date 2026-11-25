import { HOST_CLOCK, hostNow, postHostTask, type HostClock } from './host-task.js';

// All callers in this host share one window. A cold I/O wait
// lets the sentinel reset it; a ready backlog cannot reset it per producer.
const HOST_BUDGET_MS = 5;
let started = 0;
let sentinel: Promise<void> | undefined;
/**
 * The test clock the window was opened under. Its start is that clock's time,
 * and its task that clock's, so another clock opens its own window.
 */
let windowClock: HostClock | null = null;

/** Test drains must wait for admitted producer work as well as queued renders. */
export function hasPendingHostBudget(): boolean {
	return sentinel !== undefined;
}

/**
 * Before an indivisible pull or publication, yield when this host's current
 * window is spent. Callers re-enter their lease guard and this check after the
 * wait: waking many producers together must not give each a fresh budget.
 * This bounds successive units, never the duration of one user callback.
 */
export function yieldForHostBudget(): Promise<void> | undefined {
	const now = hostNow();
	if (sentinel === undefined || windowClock !== HOST_CLOCK) {
		started = now;
		windowClock = HOST_CLOCK;
		const opened: Promise<void> = new Promise<void>((resolve) => {
			postHostTask(() => {
				// An earlier clock's window may end after this host opened another.
				if (sentinel === opened) sentinel = undefined;
				resolve();
			});
		});
		sentinel = opened;
	}
	return now - started >= HOST_BUDGET_MS ? sentinel : undefined;
}
