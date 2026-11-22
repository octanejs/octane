import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, hydrateRoot, startTransition, type Root } from 'octane';
import { renderToString } from 'octane/server';
import { createResource, createScope, query, type Scope, type ScopeSeed } from 'octane/signals';
import { loadServerFixture } from './_server-fixture.js';
import { resetStreamRuntimeGlobals } from './_server-stream.js';
import { deferred, type Deferred } from './_fixtures/signals-async-controls.js';
import * as client from './_fixtures/signals-route-seeds.tsrx';
import type { RouteMatches } from './_fixtures/signals-route-seeds.tsrx';
import { installTestClock, type TestClock } from 'octane/testing';

let clock: TestClock;
beforeEach(() => {
	clock = installTestClock();
});
afterEach(() => {
	clock.uninstall();
});

const server = loadServerFixture<typeof client>(
	'packages/octane/tests/_fixtures/signals-route-seeds.tsrx',
	{ compileOptions: {} },
);

/**
 * octane/router RFC #3001, risk R2. The router gives every match its own
 * explicit scope keyed `route:<match key>` and creates it, which starts its
 * loader, before rendering. Components that read those scopes' resources
 * during SSR put them in the native seed manifest. A browser that rebuilds the
 * scopes under the same keys, each seeded from that manifest (RFC section 4.2),
 * adopts them without running a loader.
 *
 * Finding: the seed must reach `createScope` itself. Hydration alone adopts the
 * server's nodes, but by then each unseeded resource has already started its
 * own load, so an unseeded router refetches every match. The router therefore
 * needs a supported way to read the manifest's scope seeds before `hydrateRoot`
 * consumes the sidecar; this spike reads the sidecar's JSON directly.
 */
type Load = (args: Record<string, string>) => Promise<object>;

const ROUTE = /^\/org\/([^/]+)\/project\/([^/]+)\/task\/([^/]+)$/;

/** A minimal router: one explicit scope and loader resource per match, created on demand. */
function router$(load: Load, seeds?: ReadonlyMap<string, ScopeSeed>) {
	const entries = new Map<string, { scope: Scope; data$: RouteMatches[keyof RouteMatches] }>();
	const loaders = {
		org: query('route-seeds:org', load),
		project: query('route-seeds:project', load),
		task: query('route-seeds:task', load),
	};
	const routerScope = createScope({ scopeKey: 'route-seeds:router' });
	const entry$ = (id: keyof typeof loaders, key: string, args: Record<string, string>) => {
		let e = entries.get(key);
		if (!e) {
			const seed = seeds?.get(`route:${key}`);
			const scope = createScope({ scopeKey: `route:${key}`, ...(seed ? { seed } : {}) });
			const data$ = createResource(scope, 'loader', () => loaders[id]({ route: id, ...args }));
			entries.set(key, (e = { scope, data$: data$ as RouteMatches[keyof RouteMatches] }));
		}
		return e.data$;
	};
	const matches$ = (path: string): RouteMatches => {
		const [, org, project, task] = ROUTE.exec(path)!;
		return {
			org$: entry$('org', `org:${org}`, { org }),
			project$: entry$('project', `project:${org}:${project}`, { org, project }),
			task$: entry$('task', `task:${task}`, { task }),
		} as RouteMatches;
	};
	const location$ = routerScope.signal$('location', '/org/1/project/2/task/3');
	return {
		location$,
		matches$,
		dispose() {
			for (const e of entries.values()) e.scope.dispose();
			routerScope.dispose();
		},
	};
}

function value(args: Record<string, string>): object {
	const { route, org, project, task } = args;
	if (route === 'org') return { id: org, name: 'Org ' + org };
	if (route === 'project') return { id: project, name: 'Project ' + project };
	return { id: task, title: 'Task ' + task };
}

describe('explicit route:* scope seeds (RFC #3001 R2)', () => {
	let container: HTMLElement | undefined;
	let root: Root | undefined;
	const cleanups: (() => void)[] = [];

	afterEach(() => {
		root?.unmount();
		root = undefined;
		for (const cleanup of cleanups.splice(0)) cleanup();
		container?.remove();
		container = undefined;
		resetStreamRuntimeGlobals();
	});

	/** Server-render the nested matches, then dispose the server router as another process would. */
	async function serverRender$(): Promise<string> {
		const serverRouter = router$(async (args) => value(args));
		serverRouter.matches$(serverRouter.location$.get());
		await act(() => clock.advance(0));
		const { html } = renderToString(server.Routes, {
			location$: serverRouter.location$,
			matches$: serverRouter.matches$,
		});
		serverRouter.dispose();
		return html;
	}

	/** A browser router whose loads settle only when the test says so. */
	function browserRouter$(seeds?: ReadonlyMap<string, ScopeSeed>) {
		const requests: string[] = [];
		const loads = new Map<string, Deferred<object>>();
		const settle = (key: string) => {
			let load = loads.get(key);
			if (!load) loads.set(key, (load = deferred<object>()));
			return load;
		};
		const browser = router$((args) => {
			const key = JSON.stringify(args);
			requests.push(key);
			return settle(key).promise;
		}, seeds);
		cleanups.push(() => browser.dispose());
		const resolve = (args: Record<string, string>) =>
			act(async () => {
				settle(JSON.stringify(args)).resolve(value(args));
				await clock.advance(0);
			});
		return { ...browser, requests, resolve };
	}

	async function hydrate$() {
		const html = await serverRender$();
		container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const org = container.querySelector('.org');
		const task = container.querySelector('.task');
		expect(task?.textContent).toBe('Task 3');

		const sidecar = container.querySelector('script[data-octane-native-signals]');
		const manifest = JSON.parse(sidecar!.textContent!) as { scopes: ScopeSeed[] };
		const browser = browserRouter$(new Map(manifest.scopes.map((s) => [s.scopeKey, s])));
		// Like the router's start(): the current matches exist before hydration.
		browser.matches$(browser.location$.get());
		const errors: unknown[] = [];
		await act(() => {
			root = hydrateRoot(
				container!,
				client.Routes as never,
				{ location$: browser.location$, matches$: browser.matches$ } as never,
				{
					onUncaughtError: (error: unknown) => errors.push(error),
					onRecoverableError: (error: unknown) => errors.push(error),
				} as never,
			);
		});
		await act(() => clock.advance(0));
		return { browser, errors, org, task };
	}

	it('serializes every match scope that a component read into the native manifest', async () => {
		const html = await serverRender$();
		for (const key of ['route:org:1', 'route:project:1:2', 'route:task:3']) {
			expect(html).toContain(JSON.stringify(key));
		}
	});

	it('adopts every match by scope key without running a loader', async () => {
		const { browser, errors, org, task } = await hydrate$();
		expect(browser.requests).toEqual([]);
		expect(errors).toEqual([]);
		expect(container!.querySelector('.org')).toBe(org);
		expect(container!.querySelector('.task')).toBe(task);
		expect(task!.textContent).toBe('Task 3');
	});

	it('loads only the new leaf on the first navigation after hydration', async () => {
		const { browser, errors, org } = await hydrate$();
		await act(() => {
			browser.matches$('/org/1/project/2/task/4');
			startTransition(() => browser.location$.set('/org/1/project/2/task/4'));
		});
		expect(browser.requests).toEqual([JSON.stringify({ route: 'task', task: '4' })]);
		// The adopted screen stays committed while the leaf loads.
		expect(container!.querySelector('.task')?.textContent).toBe('Task 3');
		await browser.resolve({ route: 'task', task: '4' });
		expect(container!.querySelector('.task')?.textContent).toBe('Task 4');
		expect(container!.querySelector('.org')).toBe(org);
		expect(browser.requests).toHaveLength(1);
		expect(errors).toEqual([]);
	});
});
