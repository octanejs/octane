function holdFirstTimeout(delay, run) {
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	let held = null;

	globalThis.setTimeout = (callback, currentDelay, ...args) => {
		if (currentDelay !== delay || held !== null) {
			return originalSetTimeout(callback, currentDelay, ...args);
		}

		const token = {};
		held = { token, callback: () => callback(...args) };
		return token;
	};
	globalThis.clearTimeout = (token) => {
		if (held?.token === token) {
			held = null;
			return;
		}
		return originalClearTimeout(token);
	};

	let result;
	try {
		result = run();
	} finally {
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
	}

	if (held === null) {
		throw new Error(`Expected a ${delay} ms timeout to be scheduled`);
	}

	return {
		result,
		release() {
			if (held === null) throw new Error('Held timeout has already been released');
			const callback = held.callback;
			held = null;
			callback();
		},
	};
}

module.exports = { holdFirstTimeout };
