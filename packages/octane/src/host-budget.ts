import { postHostTask } from './host-task.js';

// All callers in this host share one window. A cold I/O wait
// lets the sentinel reset it; a ready backlog cannot reset it per producer.
const HOST_BUDGET_MS = 5;
let started = 0;
let sentinel: Promise<void> | undefined;

/**
 * Before an indivisible pull or publication, yield when this host's current
 * window is spent. Callers re-enter their lease guard and this check after the
 * wait: waking many producers together must not give each a fresh budget.
 * This bounds successive units, never the duration of one user callback.
 */
export function yieldForHostBudget(): Promise<void> | undefined {
	const now = typeof performance === 'object' ? performance.now() : Date.now();
	if (sentinel === undefined) {
		started = now;
		sentinel = new Promise<void>((resolve) => {
			postHostTask(() => {
				sentinel = undefined;
				resolve();
			});
		});
	}
	return now - started >= HOST_BUDGET_MS ? sentinel : undefined;
}
