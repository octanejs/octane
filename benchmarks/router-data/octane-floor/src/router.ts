'use strong';
// The octane/router RFC's core mechanism, wired by hand so the benchmark has a
// floor to hold the real router to (it must stay within 10% of this):
// - location is a signal; a navigation writes it inside startTransition, so the
//   old screen stays committed until the new matches' data is ready;
// - each match owns an explicit scope with one resource, created (and so
//   started) before render, all matches in the same tick: no waterfall;
// - loaders receive params only; search keys they never read cannot select
//   them, so a search change refetches nothing;
// - entries outlive their screen for STALE_MS (served fresh) and GC_MS;
// - pointerover on a link preloads after PRELOAD_DELAY;
// - a rename is optimistic, and its response carries the refreshed task.
import { startTransition } from 'octane';
import { action$, createResource, createScope, optimistic$, query, signal$ } from 'octane/signals';
import type { OptimisticSignal, Resource, Scope } from 'octane/signals';
import { api, rename } from '../../shared/api.js';

const STALE_MS = 30_000;
const GC_MS = 300_000;
const PRELOAD_DELAY = 50;

export interface Loc {
	readonly path: string;
	readonly search: URLSearchParams;
}
export interface Match {
	readonly id: 'org' | 'project' | 'task';
	readonly key: string;
	readonly args: Readonly<Record<string, string>>;
}
interface Entry {
	readonly scope: Scope;
	readonly data$: Resource<any>;
	readonly visible$: OptimisticSignal<any>;
	loadedAt: number;
	gc: ReturnType<typeof setTimeout> | undefined;
}

const ROUTE = /^\/org\/([^/]+)(?:\/project\/([^/]+)(?:\/task\/([^/]+))?)?\/?$/;
const loaders = {
	org: query('org', (args: Record<string, string>, { signal }) => api('org', args, signal)),
	project: query('project', (args: Record<string, string>, { signal }) =>
		api('project', args, signal),
	),
	task: query('task', (args: Record<string, string>, { signal }) => api('task', args, signal)),
};
const entries = new Map<string, Entry>();
let active: readonly Match[] = [];

function parse(href: string): Loc {
	const url = new URL(href, window.location.href);
	return { path: url.pathname, search: url.searchParams };
}

/** Pure: the matches for a pathname. */
export function match(path: string): readonly Match[] {
	const m = ROUTE.exec(path);
	if (!m) return [];
	const out: Match[] = [{ id: 'org', key: `org:${m[1]}`, args: { org: m[1] } }];
	if (m[2])
		out.push({ id: 'project', key: `project:${m[1]}:${m[2]}`, args: { org: m[1], project: m[2] } });
	if (m[3]) out.push({ id: 'task', key: `task:${m[3]}`, args: { task: m[3] } });
	return out;
}

/** Create or revive a match's entry; creating its resource starts its load. */
function ensure$(m: Match, now: number): Entry {
	let e = entries.get(m.key);
	if (!e) {
		const scope = createScope({ scopeKey: `route:${m.key}` });
		const describe = loaders[m.id];
		const data$ = createResource(scope, 'loader', () => describe(m.args));
		e = { scope, data$, visible$: optimistic$(data$), loadedAt: now, gc: undefined };
		entries.set(m.key, e);
	} else if (now - e.loadedAt > STALE_MS) {
		e.loadedAt = now;
		e.data$.retry(); // quiet: the cached value stays on screen
	}
	clearTimeout(e.gc);
	e.gc = undefined;
	return e;
}

/** Render-time lookup. Navigation always creates entries before rendering. */
export function entry$(m: Match): Entry {
	const e = entries.get(m.key);
	if (!e) throw new Error(`router-data: no entry for ${m.key}`);
	return e;
}

export const location$ = signal$<Loc>(parse(window.location.href), { key: 'location' });

function activate$(next: Loc): boolean {
	const now = performance.now();
	const matches = match(next.path);
	let ready = true;
	for (const m of matches) {
		if (ensure$(m, now).data$.snapshot().status !== 'ready') ready = false;
	}
	const keep = new Set(matches.map((m) => m.key));
	for (const m of active) {
		const e = entries.get(m.key);
		if (e && !keep.has(m.key)) {
			e.gc = setTimeout(() => {
				entries.delete(m.key);
				e.scope.dispose();
			}, GC_MS);
		}
	}
	active = matches;
	return ready;
}

function go$(href: string, push: boolean): void {
	const next = parse(href);
	const ready = activate$(next);
	if (push) history.pushState(null, '', href);
	// Cached, fresh data commits at once; anything loading holds the old screen.
	if (ready) location$.set(next);
	else startTransition(() => location$.set(next));
}

export function navigate(href: string): void {
	go$(href, true);
}

export const renameTask = action$('task.rename', async (operation, task: string, title: string) => {
	const e = entries.get(`task:${task}`);
	if (!e) return;
	e.visible$.set((current: { id: string; title: string }) => ({ ...current, title }));
	const { refreshed } = await rename(task, title, [['task', { task }]]);
	operation.adopt(refreshed[0]);
});

function linkFrom(event: Event): HTMLAnchorElement | null {
	const a = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
	return a && a.origin === window.location.origin ? a : null;
}

export function start(): void {
	activate$(location$.get());
	document.addEventListener('click', (event) => {
		const a = linkFrom(event);
		if (!a || event.defaultPrevented || (event as MouseEvent).button !== 0) return;
		event.preventDefault();
		navigate(a.pathname + a.search);
	});
	let pending: ReturnType<typeof setTimeout> | undefined;
	document.addEventListener('pointerover', (event) => {
		const a = linkFrom(event);
		if (!a) return;
		clearTimeout(pending);
		pending = setTimeout(() => {
			const now = performance.now();
			for (const m of match(a.pathname)) ensure$(m, now);
		}, PRELOAD_DELAY);
	});
	window.addEventListener('popstate', () => go$(window.location.href, false));
}
