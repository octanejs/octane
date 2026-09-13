/** Shared, pure workload specification: both runners verify every row. */
export const scenarios = ['body-first', 'history-first', 'large-waves', 'denied'];

/** @param {unknown} input */
export function scenarioConfig(input = {}) {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		throw new TypeError('Expected a benchmark configuration object');
	}
	const value = /** @type {Record<string, unknown>} */ (input);
	const run = value.run ?? 'manual';
	const scenario = value.scenario ?? 'body-first';
	const latency = value.latency ?? 'delayed';
	const holdAuth = value.holdAuth ?? false;
	if (typeof run !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(run)) {
		throw new TypeError('Invalid run identifier');
	}
	if (typeof scenario !== 'string' || !scenarios.includes(scenario)) {
		throw new TypeError('Invalid scenario');
	}
	if (latency !== 'none' && latency !== 'delayed') throw new TypeError('Invalid latency');
	if (typeof holdAuth !== 'boolean') throw new TypeError('Invalid auth hold');
	return {
		run,
		scenario,
		latency,
		holdAuth,
		bodyCount: boundedCount(value.bodyCount, scenario === 'large-waves' ? 200 : 20, 2_000),
		historyCount: boundedCount(value.historyCount, scenario === 'large-waves' ? 60 : 10, 500),
		waves: scenario === 'large-waves' ? 4 : 1,
		authDelay: latency === 'none' ? 0 : 30,
		bodyDelay: latency === 'none' ? 0 : scenario === 'history-first' ? 25 : 8,
		historyDelay: latency === 'none' ? 0 : scenario === 'history-first' ? 8 : 25,
		waveDelay: latency === 'none' ? 0 : 8,
	};
}

/** @param {unknown} value @param {number} fallback @param {number} maximum */
function boundedCount(value, fallback, maximum) {
	if (value === undefined) return fallback;
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
		throw new TypeError('Row count is outside the workload bounds');
	}
	return value;
}

/** @param {number} count */
export function bodyRows(count) {
	return Array.from({ length: count }, (_, index) => ({
		id: 'turn-' + (index + 1),
		prompt: 'Question ' + (index + 1),
		answer:
			'Private answer ' +
			(index + 1) +
			'. The conversation continues with a deterministic response.',
	}));
}

/** @param {number} count */
export function historyRows(count) {
	return Array.from({ length: count }, (_, index) => ({
		id: 'conversation-' + (index + 1),
		title: 'Private conversation ' + (index + 1),
		preview: 'Recent answer ' + (index + 1),
	}));
}
