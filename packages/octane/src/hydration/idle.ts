import { clearHostTimeout, HOST_CLOCK, setHostTimeout } from '../host-task.js';
import type { HydrationPrefetchStrategy } from './types.js';

const idleType = 'idle';

export type IdleHydrationOptions = {
	timeout?: number;
};

/* @__NO_SIDE_EFFECTS__ */
export function idle(
	options: IdleHydrationOptions = {},
): HydrationPrefetchStrategy<typeof idleType> {
	const timeout = options.timeout ?? 2000;

	return {
		_t: idleType,
		_p: options,
		_s: ({ gate, prefetch }) => {
			const schedule = globalThis as typeof globalThis & {
				requestIdleCallback?: (
					callback: IdleRequestCallback,
					options?: IdleRequestOptions,
				) => number;
				cancelIdleCallback?: (handle: number) => void;
			};
			const callback = prefetch ?? gate?.resolve;
			if (!callback) return;

			// The test clock runs an idle callback as a task, due now.
			if (HOST_CLOCK) {
				const timer = setHostTimeout(callback, 0);
				return () => clearHostTimeout(timer);
			}
			if (schedule.requestIdleCallback) {
				const handle = schedule.requestIdleCallback(callback, { timeout });
				return () => schedule.cancelIdleCallback?.(handle);
			}

			const timeoutId = globalThis.setTimeout(callback, timeout);
			return () => globalThis.clearTimeout(timeoutId);
		},
	};
}
