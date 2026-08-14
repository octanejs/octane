function holdNextTimeout(delay) {
	const originalSetTimeout = globalThis.setTimeout;
	const originalClearTimeout = globalThis.clearTimeout;
	let held = null;
	let intercepting = true;
	let released = false;
	let releaseRequested = false;

	function restoreTimers() {
		if (!intercepting) return;
		globalThis.setTimeout = originalSetTimeout;
		globalThis.clearTimeout = originalClearTimeout;
		intercepting = false;
	}

	function releaseHeldTimeout() {
		if (held === null) return false;
		restoreTimers();
		const callback = held.callback;
		held = null;
		released = true;
		callback();
		return true;
	}

	globalThis.setTimeout = (callback, currentDelay, ...args) => {
		if (currentDelay !== delay || held !== null) {
			return originalSetTimeout(callback, currentDelay, ...args);
		}
		if (releaseRequested) {
			releaseRequested = false;
			released = true;
			restoreTimers();
			return originalSetTimeout(callback, 0, ...args);
		}

		const token = {};
		held = { token, callback: () => callback(...args) };
		return token;
	};
	globalThis.clearTimeout = (token) => {
		if (held?.token === token) {
			held = null;
			restoreTimers();
			return;
		}
		return originalClearTimeout(token);
	};

	return {
		cancel() {
			held = null;
			releaseRequested = false;
			restoreTimers();
		},
		hasHeldTimeout() {
			return held !== null;
		},
		release() {
			if (released) throw new Error('Held timeout has already been released');
			if (!releaseHeldTimeout()) {
				restoreTimers();
				throw new Error(`Expected a ${delay} ms timeout to be scheduled`);
			}
		},
		releaseWhenScheduled() {
			if (released || releaseRequested) {
				throw new Error('Held timeout has already been released');
			}
			if (!releaseHeldTimeout()) releaseRequested = true;
		},
	};
}

function holdFirstTimeout(delay, run) {
	const gate = holdNextTimeout(delay);

	let result;
	try {
		result = run();
	} catch (error) {
		gate.cancel();
		throw error;
	}

	if (!gate.hasHeldTimeout()) {
		gate.cancel();
		throw new Error(`Expected a ${delay} ms timeout to be scheduled`);
	}

	return {
		result,
		release: gate.release,
	};
}

module.exports = { holdFirstTimeout, holdNextTimeout };
