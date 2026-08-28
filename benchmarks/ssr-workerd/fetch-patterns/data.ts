export interface Backend {
	fetch(url: string): Promise<Response>;
}

export interface CardSlot {
	id: number;
	promise: Promise<string>;
}

export interface Stats {
	parentPasses: number;
	loads: number;
	backendCalls: number;
	cacheHits: number;
	active: number;
	maxActive: number;
	done: boolean;
	errors: string[];
}

export type Pattern =
	| 'local'
	| 'inline'
	| 'memo'
	| 'prepared'
	| 'use-site'
	| 'serial'
	| 'parallel'
	| 'independent'
	| 'dependent';

export interface Workload {
	pattern: Pattern;
	shell: boolean;
	eachBoundary: boolean;
	indices: number[];
	cards: CardSlot[];
	stats: Stats;
	jobs: Promise<string>[];
	load: (id: number) => Promise<string>;
	makeCards: () => CardSlot[];
	serial: () => Promise<string[]>;
	parallel: () => Promise<string[]>;
}

// Benchmark-only, bounded data cache. Never retain a Response or in-flight
// promise across Workers requests. Tenant participates in the key; errors are
// not cached. The warm case measures the deliberate removal of backend I/O.
const dataCache = new Map<string, { value: string; expires: number }>();

export function clearDataCache() {
	dataCache.clear();
}

export function createWorkload(url: URL, backend: Backend): Workload {
	const query = url.searchParams;
	const pattern = query.get('pattern') as Pattern;
	const count = Number(query.get('count') ?? 10);
	const unique = Number(query.get('unique') ?? count);
	const tenant = query.get('tenant') ?? 'public';
	const delay = Number(query.get('delay') ?? 20);
	const policy = query.get('cache') ?? 'none';
	const requestCache = new Map<number, Promise<string>>();
	const stats: Stats = {
		parentPasses: 0,
		loads: 0,
		backendCalls: 0,
		cacheHits: 0,
		active: 0,
		maxActive: 0,
		done: false,
		errors: [],
	};
	const jobs: Promise<string>[] = [];
	const indices = Array.from({ length: count }, (_, i) => i);
	const load = (id: number): Promise<string> => {
		stats.loads++;
		const resource = id % unique;
		if (policy !== 'none') {
			const pending = requestCache.get(resource);
			if (pending) {
				stats.cacheHits++;
				return pending;
			}
		}
		const key = JSON.stringify([tenant, resource, delay]);
		const cached = policy === 'data' ? dataCache.get(key) : undefined;
		if (cached && cached.expires > Date.now()) {
			stats.cacheHits++;
			const promise = Promise.resolve(cached.value);
			requestCache.set(resource, promise);
			return promise;
		}
		stats.backendCalls++;
		stats.active++;
		stats.maxActive = Math.max(stats.maxActive, stats.active);
		const promise = backend
			.fetch(
				`https://backend.local/?tenant=${encodeURIComponent(tenant)}&resource=${resource}&delay=${delay}`,
			)
			.then(async (response) => {
				if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
				const value = await response.text();
				if (policy === 'data') {
					if (dataCache.size >= 64) dataCache.delete(dataCache.keys().next().value!);
					dataCache.set(key, { value, expires: Date.now() + 60_000 });
				}
				return value;
			})
			.finally(() => {
				stats.active--;
			});
		// A recreated promise can become unused. Observe it without changing the
		// value returned to use(), and drain all such work before the next sample.
		promise.catch((error) => {
			stats.errors.push(String(error));
		});
		jobs.push(promise);
		if (policy !== 'none') requestCache.set(resource, promise);
		return promise;
	};
	const work: Workload = {
		pattern,
		shell: query.get('shell') === '1',
		eachBoundary: query.get('each') === '1',
		indices,
		stats,
		jobs,
		cards: [],
		load,
		makeCards: () => indices.map((id) => ({ id, promise: load(id) })),
		async serial() {
			const values = [];
			for (const id of indices) values.push(await load(id));
			return values;
		},
		parallel: () => Promise.all(indices.map((id) => load(id))),
	};
	if (pattern === 'prepared') work.cards = work.makeCards();
	return work;
}
