// Simulated server for every router-data fixture. Identical in every target:
// each read and write takes DELAY ms, and every call is logged with its start
// and end so the harness can count requests and sequential request waves.
// Reads return fresh objects, as a JSON response would.
// The harness sets __ROUTER_DATA_DELAY = 0 for its CPU pass, which times the
// router itself rather than the simulated network.
export const DELAY = globalThis.__ROUTER_DATA_DELAY ?? 20;

const titles = new Map();
const log = [];

function value(name, args) {
	if (name === 'org') return { id: args.org, name: 'Org ' + args.org };
	if (name === 'project')
		return { id: args.project, org: args.org, name: 'Project ' + args.project };
	if (name === 'task')
		return { id: args.task, title: titles.get(args.task) ?? 'Task ' + args.task };
	throw new Error('unknown read ' + name);
}

function call(kind, name, args, signal, run) {
	const entry = {
		kind,
		name,
		key: name + ':' + JSON.stringify(args),
		start: performance.now(),
		end: 0,
		aborted: false,
	};
	log.push(entry);
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			entry.end = performance.now();
			resolve(run());
		}, DELAY);
		signal?.addEventListener('abort', () => {
			clearTimeout(timer);
			entry.end = performance.now();
			entry.aborted = true;
			reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
		});
	});
}

/** One read request: `api('task', { task: '3' })`. */
export function api(name, args, signal) {
	return call('read', name, args, signal, () => value(name, args));
}

/**
 * One write request. `refresh` lists reads to answer in the same response
 * (single flight); a router that does not use it revalidates with more reads.
 */
export function rename(task, title, refresh = []) {
	return call('write', 'rename', { task, title }, undefined, () => {
		titles.set(task, title);
		return { ok: true, refreshed: refresh.map(([name, args]) => value(name, args)) };
	});
}

window.__api = { log, DELAY };
