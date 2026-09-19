function drainZeroDelayTimers(run, flush) {
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	const queued = new Map();

	globalThis.setTimeout = (callback, delay, ...args) => {
		if (delay !== 0) return originalSetTimeout(callback, delay, ...args);

		const token = {};
		queued.set(token, () => callback(...args));
		return token;
	};
	globalThis.clearTimeout = (token) => {
		if (queued.delete(token)) return;
		return originalClearTimeout(token);
	};

	try {
		const result = run();
		for (const [token, callback] of queued) {
			queued.delete(token);
			flush(callback);
		}
		return result;
	} finally {
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
	}
}

// Timers created while rendering retain their actual delay and native handle.
// Flush their React updates before another already-due timer can observe stale
// DOM/callback state after an event-loop stall.
function flushTimerUpdates(run, flush) {
	const originalSetTimeout = globalThis.setTimeout;
	globalThis.setTimeout = (callback, delay, ...args) => {
		if (typeof callback !== 'function') return originalSetTimeout(callback, delay, ...args);
		return originalSetTimeout(
			function (...received) {
				return flushTimerUpdates(() => flush(() => callback.apply(this, received)), flush);
			},
			delay,
			...args,
		);
	};
	try {
		return run();
	} finally {
		globalThis.setTimeout = originalSetTimeout;
	}
}

module.exports = { drainZeroDelayTimers, flushTimerUpdates };
