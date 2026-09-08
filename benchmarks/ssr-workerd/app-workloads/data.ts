export type Scenario = 'workspace' | 'history';
export interface Item {
	id: number;
	title: string;
	text: string;
	code: string;
	tags: string[];
	author: number;
}
export interface Payload {
	label: string;
	next: string;
	items: Item[];
}
export interface Backend {
	fetch(url: string): Promise<Response>;
}
export interface Stats {
	bootstrapPasses: number;
	loads: number;
	requestHits: number;
	dataHits: number;
	backendCalls: number;
	active: number;
	maxActive: number;
	events: { kind: 'start' | 'end'; resource: string }[];
	errors: string[];
	done: boolean;
}
export interface Workload {
	scenario: Scenario;
	streamShell: boolean;
	stats: Stats;
	jobs: Promise<Payload>[];
	load(resource: string): Promise<Payload>;
}

// Only completed JSON values survive requests. No Response, request-owned
// promise or tenant-independent cache key is retained across Workers requests.
const dataCache = new Map<string, { value: Payload; expires: number }>();
export function clearDataCache() {
	dataCache.clear();
}

export function createWorkload(url: URL, backend: Backend): Workload {
	const q = url.searchParams;
	const scenario = q.get('scenario');
	const scale = Number(q.get('scale') ?? 1);
	const delay = Number(q.get('delay') ?? 15);
	const tenant = q.get('tenant') ?? 'sample';
	const id = q.get('id') ?? '';
	const cache = q.get('cache') === 'data';
	const gate = q.get('gate') ?? '';
	if (scenario !== 'workspace' && scenario !== 'history') throw new Error('Invalid scenario');
	if (!Number.isInteger(scale) || scale < 1 || scale > 4) throw new Error('Invalid scale');
	if (!Number.isFinite(delay) || delay < 0 || delay > 100) throw new Error('Invalid delay');
	if (!/^[a-z0-9-]{1,32}$/.test(tenant)) throw new Error('Invalid synthetic tenant');
	if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error('Invalid request id');
	if (!['', 'shell', 'tail'].includes(gate)) throw new Error('Invalid gate');
	const requestCache = new Map<string, Promise<Payload>>();
	const jobs: Promise<Payload>[] = [];
	const stats: Stats = {
		bootstrapPasses: 0,
		loads: 0,
		requestHits: 0,
		dataHits: 0,
		backendCalls: 0,
		active: 0,
		maxActive: 0,
		events: [],
		errors: [],
		done: false,
	};
	return {
		scenario,
		streamShell: q.get('streamShell') !== '0',
		stats,
		jobs,
		load(resource) {
			stats.loads++;
			const existing = requestCache.get(resource);
			if (existing) {
				stats.requestHits++;
				return existing;
			}
			const key = JSON.stringify([tenant, resource, scale, delay]);
			const cached = cache && !gate ? dataCache.get(key) : undefined;
			if (cached && cached.expires > Date.now()) {
				stats.dataHits++;
				const result = Promise.resolve(cached.value);
				requestCache.set(resource, result);
				return result;
			}
			stats.backendCalls++;
			stats.active++;
			stats.maxActive = Math.max(stats.maxActive, stats.active);
			stats.events.push({ kind: 'start', resource });
			const params = new URLSearchParams({
				id,
				tenant,
				resource,
				scale: String(scale),
				delay: String(delay),
				gate,
			});
			const job = backend
				.fetch(`https://backend.local/?${params}`)
				.then(async (response) => {
					if (!response.ok) throw new Error(`Backend HTTP ${response.status}`);
					const value = (await response.json()) as Payload;
					if (cache && !gate) {
						if (dataCache.size >= 128) dataCache.delete(dataCache.keys().next().value!);
						dataCache.set(key, { value, expires: Date.now() + 60_000 });
					}
					return value;
				})
				.finally(() => {
					stats.active--;
					stats.events.push({ kind: 'end', resource });
				});
			job.catch((error) => stats.errors.push(String(error)));
			requestCache.set(resource, job);
			jobs.push(job);
			return job;
		},
	};
}
