// A fixed-latency fake network shared by every target. Requests discovered
// before the current timer settles share one network wave; requests discovered
// by a Suspense retry enter the next wave. The 50ms window leaves ample room for
// a tiny render chunk on slow CI workers while keeping the benchmark quick.
export const DELAY = 50;

export const RESOURCE_ORDER = Object.freeze([
	'project',
	'viewer',
	'badge',
	'owner',
	'activity',
	'activity-summary',
	'insights',
	'insights-chart',
]);

export const INDEPENDENT_RESOURCES = Object.freeze(
	RESOURCE_ORDER.filter((resource) => resource !== 'owner'),
);

const cache = new Map();
let activeOperation = null;
let pendingWave = [];
let waveTimer = null;
let nextWave = 0;

const ownerIdFor = (version) => `owner-${version}`;
const requestKey = (resource, version, dependency) =>
	`${resource}:v${version}${dependency ? `:${dependency}` : ''}`;

export function expectedResourceText(resource, version) {
	return requestKey(resource, version, resource === 'owner' ? ownerIdFor(version) : '');
}

export function expectedSignature(version) {
	return RESOURCE_ORDER.map(
		(resource) => `${resource}=${expectedResourceText(resource, version)}`,
	).join('|');
}

export function beginOperation(version) {
	if (waveTimer !== null || pendingWave.length !== 0) {
		throw new Error('Cannot begin an async-composition operation while a wave is pending.');
	}
	activeOperation = {
		version,
		startedAt: performance.now(),
		calls: [],
		starts: [],
		settles: [],
		waves: [],
	};
	nextWave = 0;
}

export function loadResource(resource, version, dependency = '') {
	if (activeOperation === null || activeOperation.version !== version) {
		throw new Error(
			`Resource ${resource} requested for v${version} outside its active benchmark operation.`,
		);
	}
	if (!RESOURCE_ORDER.includes(resource)) {
		throw new Error(`Unknown async-composition resource: ${resource}`);
	}

	const key = requestKey(resource, version, dependency);
	activeOperation.calls.push({
		key,
		resource,
		atMs: performance.now() - activeOperation.startedAt,
	});

	const cached = cache.get(key);
	if (cached !== undefined) return cached;

	let resolve;
	const promise = new Promise((res) => {
		resolve = res;
	});
	cache.set(key, promise);

	const entry = {
		key,
		resource,
		version,
		dependency,
		wave: nextWave,
		startedAt: performance.now(),
		resolve,
		operation: activeOperation,
	};
	activeOperation.starts.push({
		key,
		resource,
		version,
		dependency,
		wave: entry.wave,
		atMs: entry.startedAt - activeOperation.startedAt,
	});
	pendingWave.push(entry);
	if (waveTimer === null) waveTimer = setTimeout(settleWave, DELAY);
	return promise;
}

function settleWave() {
	const entries = pendingWave;
	pendingWave = [];
	waveTimer = null;
	const wave = nextWave++;
	const settledAt = performance.now();
	const operation = entries[0].operation;

	operation.waves.push({
		wave,
		resources: entries.map((entry) => entry.resource),
		settledAtMs: settledAt - operation.startedAt,
	});

	for (const entry of entries) {
		const value = {
			label: requestKey(entry.resource, entry.version, entry.dependency),
			ownerId: entry.resource === 'project' ? ownerIdFor(entry.version) : null,
		};
		operation.settles.push({
			key: entry.key,
			resource: entry.resource,
			wave,
			atMs: settledAt - operation.startedAt,
		});
		entry.resolve(value);
	}
}

export function getOperationTrace() {
	if (activeOperation === null) throw new Error('No async-composition operation has started.');
	return JSON.parse(JSON.stringify(activeOperation));
}
