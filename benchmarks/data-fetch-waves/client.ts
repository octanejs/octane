/**
 * The page. `?strategy=` picks how the screen fetches; a server-rendered page
 * carries a seed and hydrates. Every data request is logged with its start and
 * end, and the screen's progress with its time since navigation started, for
 * run.mjs to read from `window.__result`.
 */
import { createRoot, hydrateRoot } from 'octane';
import { createDataStore, httpTransport, type Transport } from 'octane/data';
import { App, type Strategy } from './app.tsrx';
import { activity, members, project, tasks } from './screen.data.ts';

const params = new URLSearchParams(location.search);
const strategy = (params.get('strategy') ?? 'component') as Strategy;
const id = params.get('id') ?? 'p1';

interface Call {
	readonly name: string;
	readonly start: number;
	end: number;
}
const calls: Call[] = [];
const http = httpTransport('/data');
const transport: Transport = async (request, signal, preview) => {
	const call: Call = { name: request.name, start: performance.now(), end: 0 };
	calls.push(call);
	try {
		return await http(request, signal, preview);
	} finally {
		call.end = performance.now();
	}
};

const seed = document.getElementById('seed')?.textContent ?? undefined;
const store = createDataStore({ transport, seed });

const USEFUL = '.project-name';
const COMPLETE = ['.owner-name', '.members li', '.tasks li', '.activity li'];
const marks: { useful?: number; complete?: number; sectionFallbacks: number } = {
	sectionFallbacks: 0,
};
/** Shown elements only: a boundary can hold its resolved content hidden behind its fallback. */
const shown = (selector: string) =>
	[...document.querySelectorAll(selector)].filter((element) => element.checkVisibility()).length;
const settled = new Promise<void>((resolve) => {
	const check = () => {
		marks.useful ??= shown(USEFUL) ? performance.now() : undefined;
		// The most section fallbacks shown at once beside the project header.
		if (marks.useful !== undefined) {
			marks.sectionFallbacks = Math.max(marks.sectionFallbacks, shown('.project .pending'));
		}
		const done = COMPLETE.every((selector) => shown(selector)) && !shown('.pending');
		if (!done) return;
		marks.complete = performance.now();
		observer.disconnect();
		resolve();
	};
	const observer = new MutationObserver(check);
	observer.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
	});
	check();
});

const start = performance.now();
if (strategy === 'prefetch') {
	// The route names every read its URL determines and starts them together.
	// The owner's read needs the project's reply, so its component starts it.
	const ignore = () => {};
	store.prefetch(project, id).catch(ignore);
	store.prefetch(members, id).catch(ignore);
	store.prefetch(tasks, id).catch(ignore);
	store.prefetch(activity, id).catch(ignore);
}
const root = document.getElementById('app')!;
if (seed) hydrateRoot(root, App, { store, strategy, id });
else createRoot(root).render(App, { store, strategy, id });
const rendered = performance.now();

(window as any).__result = settled.then(
	() =>
		// Let any request a hydrated or completed screen still starts show up.
		new Promise((resolve) =>
			setTimeout(
				() =>
					resolve({
						start,
						rendered,
						...marks,
						calls,
						fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
						text: document.querySelector('.screen')?.textContent,
					}),
				500,
			),
		),
);
