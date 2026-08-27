import { describe, it, expect } from 'vitest';
import { prerender } from 'octane/static';
import { flushSync, hydrateRoot } from '../src/index';
import { mount, act, flushEffects } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';
import {
	ChainHost,
	DependentChain,
	BatchCatch,
	ElseIfDirectUse,
	BracelessDirectUse,
	NestedIfDirectUse,
	ConditionalDirectUseWarmHost,
	GatedHost,
	ImportedHookHost,
	ImportedHookTwiceHost,
	ImportedCapturedHookHost,
	ImportedDependentHookHost,
	AdjacentPanelsHost,
	SyncWarmBranchesHost,
	EarlyReturnPanelsHost,
	VersionedSiblingsHost,
	RepeatedPanelsHost,
	ManyRepeatedPanelsHost,
	SetupValueParallelHost,
	DriftedWarmParent,
	DriftedWarmBoundary,
} from './_fixtures/parallel-use.tsrx';

// Runtime behavior of the compiler's unconditional parallel-use pipeline.

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (v: T) => void;
	reject: (e: any) => void;
}
function deferred<T>(): Deferred<T> {
	let resolve!: (v: T) => void, reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

describe('parallel use() — discarded first-mount creations', () => {
	it.each([
		['root', DriftedWarmParent],
		['boundary', DriftedWarmBoundary],
	] as const)('retains a refreshed warmed request through a %s retry', async (_kind, Parent) => {
		const parent = deferred<string>();
		const record = { version: 1 };
		const requests: Array<{ version: number } & Deferred<string>> = [];
		const load = (version: number) => {
			const request = { version, ...deferred<string>() };
			requests.push(request);
			return request.promise;
		};
		const rendered = mount(Parent, { gate: parent.promise, record, load });
		try {
			expect(requests.map((request) => request.version)).toEqual([1]);
			record.version = 2;
			await act(() => parent.resolve('parent'));
			expect(requests.map((request) => request.version)).toEqual([1, 2]);
			await act(() => requests[1].resolve('current'));
			expect(rendered.find('.drifted-warm-value').textContent).toBe('current');
			expect(requests.map((request) => request.version)).toEqual([1, 2]);
		} finally {
			rendered.unmount();
		}
	});
});

// One deferred per (level, version) key, with a call log — the chain tests
// assert WHEN each fetch started, which is the whole point of warming.
function chainFetcher() {
	const calls: string[] = [];
	const jobs = new Map<string, Deferred<string>>();
	const fetch = (level: number, version: number): Promise<string> => {
		const key = `${level}:${version}`;
		calls.push(key);
		let d = jobs.get(key);
		if (d === undefined) {
			d = deferred<string>();
			jobs.set(key, d);
		}
		return d.promise;
	};
	const settle = (level: number, version: number) =>
		jobs.get(`${level}:${version}`)!.resolve(`v${version}-L${level}`);
	return { calls, fetch, settle };
}

function resourceFetcher() {
	const calls: string[] = [];
	const jobs = new Map<string, Deferred<string>>();
	const load = (resource: string, version: number): Promise<string> => {
		const key = `${resource}:${version}`;
		calls.push(key);
		let job = jobs.get(key);
		if (job === undefined) {
			job = deferred<string>();
			jobs.set(key, job);
		}
		return job.promise;
	};
	const settle = (resource: string, version: number) =>
		jobs.get(`${resource}:${version}`)!.resolve(`${resource}-v${version}`);
	return { calls, load, settle };
}

function freshResourceFetcher() {
	const calls: string[] = [];
	const jobs = new Map<string, Deferred<string>[]>();
	const load = (resource: string, version: number): Promise<string> => {
		const key = `${resource}:${version}`;
		calls.push(key);
		const job = deferred<string>();
		const list = jobs.get(key);
		if (list === undefined) jobs.set(key, [job]);
		else list.push(job);
		return job.promise;
	};
	const settleRound = async (version: number) => {
		await act(() => {
			for (const resource of ['activity', 'activity-summary', 'insights', 'insights-chart']) {
				const list = jobs.get(`${resource}:${version}`)!;
				list[list.length - 1].resolve(`${resource}-v${version}`);
			}
		});
	};
	return { calls, load, settleRound };
}

const KEYED_PANELS_SOURCE = `
	import { use } from 'octane';

	const PANELS = ['activity', 'insights'];

	function ProjectHeader(props) @{
		const value = use(props.load('project', props.version));
		<span class="keyed-project">{value as string}</span>
	}

	function ActivityPanel(props) @{
		const value = use(props.load('activity', props.version));
		<span class="keyed-panel" data-panel="activity">{value as string}</span>
	}

	function InsightsPanel(props) @{
		const value = use(props.load('insights', props.version));
		<span class="keyed-panel" data-panel="insights">{value as string}</span>
	}

	function Dashboard(props) @{
		<section class="keyed-dashboard">
			<ProjectHeader load={props.load} version={props.version} />
			@for (const panel of PANELS; key panel) {
				@if (panel === 'activity') {
					<ActivityPanel load={props.load} version={props.version} />
				} @else {
					<InsightsPanel load={props.load} version={props.version} />
				}
			}
		</section>
	}

	export function KeyedListHost(props) @{
		<>
			@try {
				<Dashboard load={props.load} version={props.version} />
			} @pending {
				<span class="keyed-pending">loading</span>
			}
		</>
	}
`;

const TRANSITION_PANELS_SOURCE = `
	import { Suspense, startTransition, use, useState } from 'octane';

	const PANELS = ['activity', 'insights'];

	function ProjectBadge(props) @{
		const badge = use(props.load('badge', props.version));
		<span class="transition-badge">{badge as string}</span>
	}

	function ProjectOwner(props) @{
		const owner = use(props.load('owner', props.version, props.project));
		<span class="transition-owner">{owner as string}</span>
	}

	function ProjectHeader(props) @{
		const project = use(props.load('project', props.version));
		<section class="transition-project">
			<span class="transition-project-value">{project as string}</span>
			<div class="transition-project-meta">
				<ProjectBadge load={props.load} version={props.version} />
				<ProjectOwner load={props.load} version={props.version} project={project} />
			</div>
		</section>
	}

	function ActivityPanel(props) @{
		const value = use(props.load('activity', props.version));
		<span class="transition-panel" data-panel="activity">{value as string}</span>
	}

	function InsightsPanel(props) @{
		const value = use(props.load('insights', props.version));
		<span class="transition-panel" data-panel="insights">{value as string}</span>
	}

	function Dashboard(props) @{
		<main class="transition-dashboard" data-version={props.version as string}>
			<ProjectHeader load={props.load} version={props.version} />
			@for (const panel of PANELS; key panel) {
				@if (panel === 'activity') {
					<ActivityPanel load={props.load} version={props.version} />
				} @else {
					<InsightsPanel load={props.load} version={props.version} />
				}
			}
		</main>
	}

	export function TransitionPanels(props) @{
		const [version, setVersion] = useState(props.initialVersion ?? 0);
		<div>
			<button class="transition-bump" onClick={() => startTransition(() => setVersion(value => value + 1))}>next</button>
			<button class="transition-urgent" onClick={() => setVersion(2)}>urgent</button>
			<span class="transition-shell">{'shell-' + version}</span>
			<Suspense fallback={<span class="transition-pending">loading</span>}>
				<Dashboard load={props.load} version={version} />
			</Suspense>
		</div>
	}
`;

describe('parallel use() — independent asynchronous keyed-list children', () => {
	it('starts each transition request once while preserving its dependent second wave', async () => {
		const client = loadCompiledFixtureSource(TRANSITION_PANELS_SOURCE, {
			id: 'warmed-transition-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		const root = mount(client.TransitionPanels, { load: resources.load });

		try {
			expect(resources.calls).toEqual(['project:0', 'badge:0', 'activity:0', 'insights:0']);
			expect(root.find('.transition-pending').textContent).toBe('loading');

			await act(() => {
				resources.settle('badge', 0);
				resources.settle('activity', 0);
				resources.settle('insights', 0);
				resources.settle('project', 0);
			});
			expect(resources.calls).toEqual([
				'project:0',
				'badge:0',
				'activity:0',
				'insights:0',
				'owner:0',
			]);
			await act(() => resources.settle('owner', 0));

			const dashboard = root.find('.transition-dashboard');
			const panels = root.findAll('.transition-panel');
			expect(panels.map((node) => node.textContent)).toEqual(['activity-v0', 'insights-v0']);
			expect(dashboard.getAttribute('data-version')).toBe('0');
			expect(root.find('.transition-shell').textContent).toBe('shell-0');
			expect(root.find('.transition-owner').textContent).toBe('owner-v0');

			root.click('.transition-bump');
			expect(resources.calls.slice(5)).toEqual([
				'project:1',
				'badge:1',
				'activity:1',
				'insights:1',
			]);
			expect(root.find('.transition-dashboard')).toBe(dashboard);
			expect(root.findAll('.transition-panel')).toEqual(panels);
			expect(dashboard.getAttribute('data-version')).toBe('0');
			expect(root.find('.transition-shell').textContent).toBe('shell-0');
			expect(root.findAll('.transition-pending')).toEqual([]);

			await act(() => {
				resources.settle('badge', 1);
				resources.settle('activity', 1);
				resources.settle('insights', 1);
				resources.settle('project', 1);
			});
			expect(resources.calls.slice(5)).toEqual([
				'project:1',
				'badge:1',
				'activity:1',
				'insights:1',
				'owner:1',
			]);
			expect(root.find('.transition-dashboard')).toBe(dashboard);
			expect(dashboard.getAttribute('data-version')).toBe('0');
			expect(root.find('.transition-owner').textContent).toBe('owner-v0');

			await act(() => resources.settle('owner', 1));
			expect(root.find('.transition-dashboard')).toBe(dashboard);
			expect(root.findAll('.transition-panel')).toEqual(panels);
			expect(dashboard.getAttribute('data-version')).toBe('1');
			expect(root.find('.transition-shell').textContent).toBe('shell-1');
			expect(root.find('.transition-owner').textContent).toBe('owner-v1');
			expect(root.findAll('.transition-panel').map((node) => node.textContent)).toEqual([
				'activity-v1',
				'insights-v1',
			]);
			expect(resources.calls).toEqual([
				'project:0',
				'badge:0',
				'activity:0',
				'insights:0',
				'owner:0',
				'project:1',
				'badge:1',
				'activity:1',
				'insights:1',
				'owner:1',
			]);
		} finally {
			root.unmount();
		}
	});

	it('starts separate requests for an independent root while another transition is pending', async () => {
		const client = loadCompiledFixtureSource(TRANSITION_PANELS_SOURCE, {
			id: 'independent-transition-roots.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const calls: string[] = [];
		const jobs = new Map<string, Deferred<string>>();
		let activeRoot = 'first';
		const load = (resource: string, version: number) => {
			const key = `${activeRoot}:${resource}:${version}`;
			const job = deferred<string>();
			calls.push(key);
			jobs.set(key, job);
			return job.promise;
		};
		const first = mount(client.TransitionPanels, { load, initialVersion: 0 });
		let second: ReturnType<typeof mount> | undefined;

		try {
			await act(() => {
				for (const resource of ['badge', 'activity', 'insights', 'project']) {
					jobs.get(`first:${resource}:0`)!.resolve(`${resource}-first-v0`);
				}
			});
			await act(() => jobs.get('first:owner:0')!.resolve('owner-first-v0'));
			first.click('.transition-bump');
			const start = calls.length;

			activeRoot = 'second';
			second = mount(client.TransitionPanels, { load, initialVersion: 1 });
			expect(calls.slice(start)).toEqual([
				'second:project:1',
				'second:badge:1',
				'second:activity:1',
				'second:insights:1',
			]);
			expect(second.find('.transition-pending').textContent).toBe('loading');
			expect(first.find('.transition-shell').textContent).toBe('shell-0');
		} finally {
			second?.unmount();
			first.unmount();
		}
	});

	it('does not reuse requests from a transition superseded by an urgent update', async () => {
		const client = loadCompiledFixtureSource(TRANSITION_PANELS_SOURCE, {
			id: 'superseded-transition-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		const root = mount(client.TransitionPanels, { load: resources.load });

		try {
			await act(() => {
				for (const resource of ['badge', 'activity', 'insights', 'project']) {
					resources.settle(resource, 0);
				}
			});
			await act(() => resources.settle('owner', 0));

			root.click('.transition-bump');
			expect(resources.calls.slice(5)).toEqual([
				'project:1',
				'badge:1',
				'activity:1',
				'insights:1',
			]);

			root.click('.transition-urgent');
			expect(resources.calls.slice(9)).toEqual([
				'project:2',
				'badge:2',
				'activity:2',
				'insights:2',
			]);
			expect(root.find('.transition-shell').textContent).toBe('shell-2');

			await act(() => {
				for (const resource of ['badge', 'activity', 'insights', 'project']) {
					resources.settle(resource, 1);
				}
			});
			expect(resources.calls).not.toContain('owner:1');
			expect(root.find('.transition-shell').textContent).toBe('shell-2');
			expect(root.find('.transition-owner').textContent).toBe('owner-v0');
			expect(root.findAll('.transition-panel').map((node) => node.textContent)).toEqual([
				'activity-v0',
				'insights-v0',
			]);
			expect(root.find('.transition-dashboard').getAttribute('data-version')).toBe('0');
		} finally {
			root.unmount();
		}
	});

	it('starts every selected keyed child before any request resolves and adopts each request once', async () => {
		const client = loadCompiledFixtureSource(KEYED_PANELS_SOURCE, {
			id: 'independent-keyed-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		const root = mount(client.KeyedListHost, { load: resources.load, version: 0 });

		try {
			expect(resources.calls).toEqual(['project:0', 'activity:0', 'insights:0']);
			expect(root.find('.keyed-pending').textContent).toBe('loading');

			await act(() => {
				resources.settle('activity', 0);
				resources.settle('insights', 0);
				resources.settle('project', 0);
			});

			expect(root.find('.keyed-project').textContent).toBe('project-v0');
			expect(root.findAll('.keyed-panel').map((node) => node.textContent)).toEqual([
				'activity-v0',
				'insights-v0',
			]);
			expect(resources.calls).toEqual(['project:0', 'activity:0', 'insights:0']);
		} finally {
			root.unmount();
		}
	});

	it.each([
		{ arm: '@try', open: '@try {', close: '} @pending { <span>rows loading</span> }' },
		{ arm: '@if', open: '@if (props.enabled) {', close: '}' },
	])(
		'starts keyed children directly inside an $arm arm in the first wave',
		async ({ arm, open, close }) => {
			const source = `
			import { use } from 'octane';

			const PANELS = ['activity', 'insights'];

			function ProjectHeader(props) @{
				const value = use(props.load('project', props.version));
				<span>{value as string}</span>
			}

			function Panel(props) @{
				const value = use(props.load(props.id, props.version));
				<span class="directive-keyed-panel">{value as string}</span>
			}

			function Dashboard(props) @{
				<section>
					<ProjectHeader load={props.load} version={props.version} />
					${open}
						@for (const panel of PANELS; key panel) {
							<Panel id={panel} load={props.load} version={props.version} />
						}
					${close}
				</section>
			}

			export function App(props) @{
				<>
					@try {
						<Dashboard load={props.load} version={props.version} enabled={props.enabled} />
					} @pending {
						<span class="directive-keyed-pending">loading</span>
					}
				</>
			}
		`;
			const client = loadCompiledFixtureSource(source, {
				id: `direct-${arm.slice(1)}-keyed-panels.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
			});
			const resources = resourceFetcher();
			const root = mount(client.App, { load: resources.load, version: 0, enabled: true });

			try {
				expect(resources.calls).toEqual(['project:0', 'activity:0', 'insights:0']);
				expect(root.find('.directive-keyed-pending').textContent).toBe('loading');

				await act(() => {
					resources.settle('activity', 0);
					resources.settle('insights', 0);
					resources.settle('project', 0);
				});

				expect(root.findAll('.directive-keyed-panel').map((node) => node.textContent)).toEqual([
					'activity-v0',
					'insights-v0',
				]);
				expect(resources.calls).toEqual(['project:0', 'activity:0', 'insights:0']);

				if (arm === '@if') {
					root.update(client.App, { load: resources.load, version: 1, enabled: false });
					expect(resources.calls).toEqual(['project:0', 'activity:0', 'insights:0', 'project:1']);
				}
			} finally {
				root.unmount();
			}
		},
	);

	it('does not evaluate an effectful conditional guard before its keyed-list arm renders', async () => {
		const source = `
			import { use } from 'octane';
			const PANELS = ['activity', 'insights'];

			function ProjectHeader(props) @{
				const value = use(props.load('project'));
				<span>{value as string}</span>
			}

			function Panel(props) @{
				const value = use(props.load(props.id));
				<span class="keyed-panel">{value as string}</span>
			}

			function Dashboard(props) @{
				<section>
					<ProjectHeader load={props.load} />
					@if (props.observe()) {
						@for (const panel of PANELS; key panel) {
							<Panel id={panel} load={props.load} />
						}
					}
				</section>
			}

			export function KeyedListHost(props) @{
				<>
					@try {
						<Dashboard load={props.load} observe={props.observe} />
					} @pending {
						<span>loading</span>
					}
				</>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'effectful-conditional-keyed-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const project = deferred<string>();
		const observations: string[] = [];
		const requests: string[] = [];
		const root = mount(client.KeyedListHost, {
			version: 0,
			observe() {
				observations.push('observe');
				return true;
			},
			load(panel: string) {
				requests.push(panel);
				if (panel === 'project') return project.promise;
				const value = `${panel}-v0`;
				return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value });
			},
		});

		try {
			expect(requests).toEqual(['project']);
			expect(observations).toEqual([]);
			await act(() => project.resolve('project-v0'));
			expect(observations).toEqual(['observe']);
			expect(requests).toEqual(['project', 'activity', 'insights']);
			expect(root.findAll('.keyed-panel').map((node) => node.textContent)).toEqual([
				'activity-v0',
				'insights-v0',
			]);
		} finally {
			root.unmount();
		}
	});

	it('starts every independent keyed child selected through an else-if chain', async () => {
		const source = `
			import { use } from 'octane';

			const PANELS = ['activity', 'insights', 'reports'];

			function ProjectHeader(props) @{
				const value = use(props.load('project', props.version));
				<span>{value as string}</span>
			}

			function Panel(props) @{
				const value = use(props.load(props.id, props.version));
				<span class="else-if-keyed-panel">{value as string}</span>
			}

			function Dashboard(props) @{
				<section>
					<ProjectHeader load={props.load} version={props.version} />
					@for (const panel of PANELS; key panel) {
						@if (panel === 'activity') {
							<Panel id="activity" load={props.load} version={props.version} />
						} @else if (panel === 'insights') {
							<Panel id="insights" load={props.load} version={props.version} />
						} @else {
							<Panel id="reports" load={props.load} version={props.version} />
						}
					}
				</section>
			}

			export function App(props) @{
				<>
					@try {
						<Dashboard load={props.load} version={props.version} />
					} @pending {
						<span class="else-if-keyed-pending">loading</span>
					}
				</>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'else-if-keyed-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		const root = mount(client.App, { load: resources.load, version: 0 });

		try {
			expect(resources.calls).toEqual(['project:0', 'activity:0', 'insights:0', 'reports:0']);
			expect(root.find('.else-if-keyed-pending').textContent).toBe('loading');

			await act(() => {
				resources.settle('activity', 0);
				resources.settle('insights', 0);
				resources.settle('reports', 0);
				resources.settle('project', 0);
			});

			expect(root.findAll('.else-if-keyed-panel').map((node) => node.textContent)).toEqual([
				'activity-v0',
				'insights-v0',
				'reports-v0',
			]);
			expect(resources.calls).toEqual(['project:0', 'activity:0', 'insights:0', 'reports:0']);
		} finally {
			root.unmount();
		}
	});

	it('starts each distinct request before a list-first suspension without multiplying existing replays', async () => {
		const source = KEYED_PANELS_SOURCE.replace(
			'<ProjectHeader load={props.load} version={props.version} />',
			'',
		);
		const client = loadCompiledFixtureSource(source, {
			id: 'list-first-independent-keyed-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		const started = new Set<string>();
		const root = mount(client.KeyedListHost, {
			version: 0,
			load(panel: string, version: number) {
				started.add(`${panel}:${version}`);
				return resources.load(panel, version);
			},
		});

		try {
			expect([...started]).toEqual(['activity:0', 'insights:0']);

			await act(() => {
				resources.settle('activity', 0);
				resources.settle('insights', 0);
			});

			expect(root.findAll('.keyed-panel').map((node) => node.textContent)).toEqual([
				'activity-v0',
				'insights-v0',
			]);
			expect([...started]).toEqual(['activity:0', 'insights:0']);
			expect(resources.calls.length).toBeLessThanOrEqual(5);
		} finally {
			root.unmount();
		}
	});

	it('does not start keyed requests whose arguments depend on an unresolved parent', async () => {
		const source = `
			import { use } from 'octane';

			const PANELS = ['activity', 'insights'];

			function Panel(props) @{
				const value = use(props.load(props.id, props.version));
				<span class="dependent-keyed-panel">{value as string}</span>
			}

			function Dashboard(props) @{
				const owner = use(props.load('owner', props.version));
				<section>
					@for (const panel of PANELS; key panel) {
						<Panel id={owner + '-' + panel} load={props.load} version={props.version} />
					}
				</section>
			}

			export function App(props) @{
				<>
					@try {
						<Dashboard load={props.load} version={props.version} />
					} @pending {
						<span class="dependent-keyed-pending">loading</span>
					}
				</>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'dependent-keyed-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		const root = mount(client.App, { load: resources.load, version: 0 });

		try {
			expect(resources.calls).toEqual(['owner:0']);
			expect(root.find('.dependent-keyed-pending').textContent).toBe('loading');

			await act(() => resources.settle('owner', 0));

			expect(resources.calls).toContain('owner-v0-activity:0');
			expect(resources.calls).not.toContain('undefined-activity:0');
		} finally {
			root.unmount();
		}
	});

	it('does not inspect an unknown iterable while an earlier sibling is suspended', async () => {
		const source = `
			import { use } from 'octane';

			function Gate(props) @{
				const value = use(props.load('gate', props.version));
				<span>{value as string}</span>
			}

			function Panel(props) @{
				const value = use(props.load(props.id, props.version));
				<span class="unknown-keyed-panel">{value as string}</span>
			}

			function Dashboard(props) @{
				<section>
					<Gate load={props.load} version={props.version} />
					@for (const panel of props.panels; key panel) {
						<Panel id={panel} load={props.load} version={props.version} />
					}
				</section>
			}

			export function App(props) @{
				<>
					@try {
						<Dashboard panels={props.panels} load={props.load} version={props.version} />
					} @pending {
						<span class="unknown-keyed-pending">loading</span>
					}
				</>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'unknown-keyed-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		const reads: string[] = [];
		const panels = new Proxy(['activity', 'insights'], {
			get(target, property, receiver) {
				reads.push(String(property));
				return Reflect.get(target, property, receiver);
			},
			getOwnPropertyDescriptor(target, property) {
				reads.push(`descriptor:${String(property)}`);
				return Reflect.getOwnPropertyDescriptor(target, property);
			},
		});
		const root = mount(client.App, { panels, load: resources.load, version: 0 });

		try {
			expect(resources.calls).toEqual(['gate:0']);
			expect(reads).toEqual([]);

			await act(() => resources.settle('gate', 0));

			expect(reads).toContain('0');
			expect(resources.calls).toContain('activity:0');
		} finally {
			root.unmount();
		}
	});

	it('does not evaluate effectful keyed-child props before the list actually mounts', async () => {
		const source = KEYED_PANELS_SOURCE.replace(
			'<ActivityPanel load={props.load} version={props.version} />',
			"<ActivityPanel load={props.load} version={props.version} token={props.observe('activity')} />",
		)
			.replace(
				'<InsightsPanel load={props.load} version={props.version} />',
				"<InsightsPanel load={props.load} version={props.version} token={props.observe('insights')} />",
			)
			.replace(
				'<Dashboard load={props.load} version={props.version} />',
				'<Dashboard load={props.load} version={props.version} observe={props.observe} />',
			);
		const client = loadCompiledFixtureSource(source, {
			id: 'effectful-keyed-panel-props.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const project = deferred<string>();
		const observations: string[] = [];
		const root = mount(client.KeyedListHost, {
			version: 0,
			observe(panel: string) {
				observations.push(panel);
				return panel;
			},
			load(panel: string) {
				if (panel === 'project') return project.promise;
				const value = `${panel}-v0`;
				return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value });
			},
		});

		try {
			expect(observations).toEqual([]);
			await act(() => project.resolve('project-v0'));
			expect(observations).toEqual(['activity', 'insights']);
			expect(root.findAll('.keyed-panel').map((node) => node.textContent)).toEqual([
				'activity-v0',
				'insights-v0',
			]);
		} finally {
			root.unmount();
		}
	});

	it.each([
		{
			name: 'directly mutated',
			declarations:
				"const PANELS = ['activity', 'insights']; export function changePanels() { PANELS[1] = 'replacement'; }",
		},
		{
			name: 'escaped through an alias',
			declarations:
				"const PANELS = ['activity', 'insights']; const alias = PANELS; export function changePanels() { alias[1] = 'replacement'; }",
		},
		{
			name: 'mutated through direct evaluation',
			declarations:
				"const PANELS = ['activity', 'insights']; export function changePanels() { eval(\"PANELS[1] = 'replacement'\"); }",
		},
	])('observes the current contents of a list $name', async ({ name, declarations }) => {
		const source = `
			import { use } from 'octane';
			${declarations}

			function Panel(props) @{
				const value = use(props.load(props.id, props.version));
				<span class="mutable-keyed-panel">{value as string}</span>
			}

			function Dashboard(props) @{
				<section>
					@for (const panel of PANELS; key panel) {
						<Panel id={panel} load={props.load} version={props.version} />
					}
				</section>
			}

			export function App(props) @{
				<>
					@try {
						<Dashboard load={props.load} version={props.version} />
					} @pending {
						<span>loading</span>
					}
				</>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: `mutable-keyed-panels-${name.replace(/\W+/g, '-')}.tsrx`,
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		client.changePanels();
		const root = mount(client.App, { load: resources.load, version: 0 });

		try {
			expect(resources.calls).toEqual(['activity:0']);
			await act(() => resources.settle('activity', 0));
			expect(resources.calls).toContain('replacement:0');
			expect(resources.calls).not.toContain('insights:0');
			await act(() => resources.settle('replacement', 0));
			expect(root.findAll('.mutable-keyed-panel').map((node) => node.textContent)).toEqual([
				'activity-v0',
				'replacement-v0',
			]);
		} finally {
			root.unmount();
		}
	});

	it('does not run a later row or its key before an earlier keyed row resolves', () => {
		const source = `
			import { use } from 'octane';

			const PANELS = ['activity', 'insights'];
			let recordKey;
			export function setKeyRecorder(recorder) { recordKey = recorder; }

			function Panel(props) @{
				const value = use(props.load(props.id, props.version));
				<span>{value as string}</span>
			}

			function Dashboard(props) @{
				<section>
					@for (const panel of PANELS; key recordKey(panel)) {
						<Panel id={panel} load={props.load} version={props.version} />
					}
				</section>
			}

			export function App(props) @{
				<>
					@try {
						<Dashboard load={props.load} version={props.version} />
					} @pending {
						<span>loading</span>
					}
				</>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'observable-keyed-panel-keys.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const events: string[] = [];
		const resources = resourceFetcher();
		client.setKeyRecorder((panel: string) => {
			events.push(`key:${panel}`);
			return panel;
		});
		const root = mount(client.App, {
			version: 0,
			load(panel: string, version: number) {
				events.push(`load:${panel}`);
				return resources.load(panel, version);
			},
		});

		try {
			expect(events).toEqual(['key:activity', 'load:activity']);
		} finally {
			root.unmount();
		}
	});

	it('preserves context, effects, and host refs without exposing them during speculation', async () => {
		const source = `
			import { createContext, use, useContext, useEffect } from 'octane';

			const Theme = createContext('default');
			const PANELS = ['activity', 'insights'];

			function Panel(props) @{
				const value = use(props.load(props.id, props.version));
				const theme = useContext(Theme);
				useEffect(() => {
					props.onEffect('mount:' + props.id);
					return () => props.onEffect('cleanup:' + props.id);
				}, []);
				<span class="context-keyed-panel" ref={props.capture}>{theme + ':' + value as string}</span>
			}

			function Dashboard(props) @{
				<section>
					@for (const panel of PANELS; key panel) {
						<Panel
							id={panel}
							load={props.load}
							version={props.version}
							capture={props.capture}
							onEffect={props.onEffect}
						/>
					}
				</section>
			}

			export function App(props) @{
				<Theme.Provider value={props.theme}>
					@try {
						<Dashboard
							load={props.load}
							version={props.version}
							capture={props.capture}
							onEffect={props.onEffect}
						/>
					} @pending {
						<span class="context-keyed-pending">loading</span>
					}
				</Theme.Provider>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'context-keyed-panels.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const resources = resourceFetcher();
		const effects: string[] = [];
		const attachments: (Element | null)[] = [];
		const root = mount(client.App, {
			load: resources.load,
			version: 0,
			theme: 'ocean',
			capture: (node: Element | null) => attachments.push(node),
			onEffect: (effect: string) => effects.push(effect),
		});

		try {
			expect(resources.calls).toEqual(['activity:0', 'insights:0']);
			expect(attachments).toEqual([]);
			expect(effects).toEqual([]);

			await act(() => {
				resources.settle('activity', 0);
				resources.settle('insights', 0);
			});
			flushEffects();

			const panels = root.findAll('.context-keyed-panel');
			expect(panels.map((node) => node.textContent)).toEqual([
				'ocean:activity-v0',
				'ocean:insights-v0',
			]);
			expect(attachments).toEqual(panels);
			expect(effects).toEqual(['mount:activity', 'mount:insights']);
		} finally {
			root.unmount();
			flushEffects();
		}

		expect(attachments).toEqual([expect.any(Element), expect.any(Element), null, null]);
		expect(effects).toEqual([
			'mount:activity',
			'mount:insights',
			'cleanup:activity',
			'cleanup:insights',
		]);
	});

	it('adopts server-rendered keyed children without starting client requests', async () => {
		const id = 'hydrated-independent-keyed-panels.tsrx';
		const server = loadCompiledFixtureSource(KEYED_PANELS_SOURCE, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		const client = loadCompiledFixtureSource(KEYED_PANELS_SOURCE, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: process.env.OCTANE_TEST_COMPILE_MODE !== 'prod' },
		});
		const rendered = await prerender(server.KeyedListHost, {
			version: 0,
			load: (panel: string, version: number) => Promise.resolve(`${panel}-v${version}`),
		});
		const container = document.createElement('div');
		container.innerHTML = rendered.html;
		document.body.appendChild(container);
		const serverNodes = Array.from(container.querySelectorAll('.keyed-panel'));
		const calls: string[] = [];
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, client.KeyedListHost, {
				version: 0,
				load: (panel: string) => {
					calls.push(panel);
					return Promise.resolve(`client-${panel}`);
				},
			});
			flushSync(() => {});

			expect(Array.from(container.querySelectorAll('.keyed-panel'))).toEqual(serverNodes);
			expect(serverNodes.map((node) => node.textContent)).toEqual(['activity-v0', 'insights-v0']);
			expect(calls).toEqual([]);
		} finally {
			root?.unmount();
			container.remove();
		}
	});
});

describe('parallel use() — fetch-tree warming (nested chain)', () => {
	it('starts EVERY level of a nested chain in the first attempt', async () => {
		const f = chainFetcher();
		const r = mount(ChainHost, { version: 0, max: 3, fetch: f.fetch });
		// The benchmark assertion: level 0 mounts and suspends, and the warm
		// walk has already started levels 1 and 2 — no per-level rounds.
		expect(f.calls).toEqual(['0:0', '1:0', '2:0']);
		expect(r.find('.fallback').textContent).toBe('chain-loading');

		await act(() => f.settle(0, 0));
		await act(() => f.settle(1, 0));
		await act(() => f.settle(2, 0));
		expect(r.findAll('.val').map((el: Element) => el.textContent)).toEqual([
			'v0-L0',
			'v0-L1',
			'v0-L2',
		]);
		// Warm entries were ADOPTED by the real mounts — one fetch per key,
		// never a duplicate.
		expect(f.calls).toEqual(['0:0', '1:0', '2:0']);
		r.unmount();
	});

	it('an update refetches the whole chain in parallel (and adoption prevents double fetches)', async () => {
		const f = chainFetcher();
		const r = mount(ChainHost, { version: 0, max: 3, fetch: f.fetch });
		await act(() => f.settle(0, 0));
		await act(() => f.settle(1, 0));
		await act(() => f.settle(2, 0));
		expect(f.calls).toEqual(['0:0', '1:0', '2:0']);

		r.update(ChainHost, { version: 1, max: 3, fetch: f.fetch });
		// All three v1 fetches started before ANY of them resolved — the
		// update round-trips at max(latency), not sum(latency).
		expect(f.calls.slice(3)).toEqual(['0:1', '1:1', '2:1']);

		await act(() => f.settle(0, 1));
		await act(() => f.settle(1, 1));
		await act(() => f.settle(2, 1));
		expect(r.findAll('.val').map((el: Element) => el.textContent)).toEqual([
			'v1-L0',
			'v1-L1',
			'v1-L2',
		]);
		expect(f.calls).toHaveLength(6); // adoption — no re-fetch on the resume renders
		r.unmount();
	});
});

describe('parallel use() — directives in JSX setup values', () => {
	it('starts each creation once and reuses it across the suspense replay', async () => {
		const calls: string[] = [];
		const jobs = new Map<string, Deferred<string>>();
		const load = (key: string) => {
			calls.push(key);
			const job = deferred<string>();
			jobs.set(key, job);
			return job.promise;
		};
		const result = mount(SetupValueParallelHost, { load });

		expect(calls).toEqual(['a', 'b']);
		expect(result.find('.setup-value-fallback').textContent).toBe('loading');

		await act(() => {
			jobs.get('a')!.resolve('A');
			jobs.get('b')!.resolve('B');
		});
		expect(result.find('.setup-value-result').textContent).toBe('A|B');
		expect(calls).toEqual(['a', 'b']);
		result.unmount();
	});
});

describe('parallel use() — true data dependencies stay sequential', () => {
	it('a creation reading an earlier use() result starts only after it resolves', async () => {
		let bArg: string | null = null;
		const da = deferred<string>();
		const db = deferred<string>();
		let bCalls = 0;
		const fetchA = () => da.promise;
		const fetchB = (a: string) => {
			bCalls++;
			bArg = a;
			return db.promise;
		};
		const r = mount(DependentChain, { fetchA, fetchB });
		expect(bCalls).toBe(0); // second stratum NOT speculatively started
		expect(r.find('.fallback').textContent).toBe('dep-loading');

		await act(() => da.resolve('A'));
		expect(bCalls).toBe(1);
		expect(bArg).toBe('A'); // real value, not a placeholder
		expect(r.find('.fallback').textContent).toBe('dep-loading');

		await act(() => db.resolve('B'));
		expect(r.find('.dep').textContent).toBe('A/B');
		r.unmount();
	});
});

describe('parallel use() — batched rejection routing', () => {
	it('first-in-order rejection reaches @catch', async () => {
		const da = deferred<string>();
		const db = deferred<string>();
		const r = mount(BatchCatch, { a: da.promise, b: db.promise });
		expect(r.find('.fallback').textContent).toBe('w');

		await act(() => da.reject(new Error('boom-a')));
		expect(r.find('.err').textContent).toBe('caught:boom-a');
		r.unmount();
	});

	it('later-in-order rejection while the earlier is pending still lands in @catch', async () => {
		const da = deferred<string>();
		const db = deferred<string>();
		const r = mount(BatchCatch, { a: da.promise, b: db.promise });

		// b rejects first: the batch wakes, the replay re-suspends on a (still
		// pending) — correct arm, one extra cycle on the error path.
		await act(() => db.reject(new Error('boom-b')));
		expect(r.find('.fallback').textContent).toBe('w');

		await act(() => da.resolve('A'));
		expect(r.find('.err').textContent).toBe('caught:boom-b');
		r.unmount();
	});
});

describe('parallel use() — conditional setup arms', () => {
	const fulfilled = (value: string): Promise<string> =>
		({ then: () => {}, status: 'fulfilled', value }) as unknown as Promise<string>;

	it('supports a direct use() in an else-if arm', () => {
		const calls: string[] = [];
		const r = mount(ElseIfDirectUse, {
			mode: 'b',
			load: (key: string) => {
				calls.push(key);
				return fulfilled(key);
			},
		});
		expect(r.find('.else-if-use').textContent).toBe('mode=b');
		expect(calls).toEqual(['b']);
		r.unmount();
	});

	it('supports a direct use() in a braceless conditional arm', () => {
		const calls: string[] = [];
		const r = mount(BracelessDirectUse, {
			active: true,
			load: (key: string) => {
				calls.push(key);
				return fulfilled(key);
			},
		});
		expect(r.find('.braceless-use').textContent).toBe('active=true');
		expect(calls).toEqual(['braceless']);
		r.unmount();
	});

	it('supports a direct use() in nested braceless conditional arms', () => {
		const calls: string[] = [];
		const r = mount(NestedIfDirectUse, {
			inner: true,
			outer: true,
			load: (key: string) => {
				calls.push(key);
				return fulfilled(key);
			},
		});
		expect(r.find('.nested-if-use').textContent).toBe('active=true');
		expect(calls).toEqual(['nested']);
		r.unmount();
	});

	it('warms only the selected conditional arm', () => {
		const gate = deferred<string>();
		const calls: string[] = [];
		const r = mount(ConditionalDirectUseWarmHost, {
			gate: gate.promise,
			mode: 'b',
			load: (key: string) => {
				calls.push(key);
				return new Promise<string>(() => {});
			},
		});
		expect(r.find('.conditional-warm-fallback').textContent).toBe('loading');
		// Warming must honor the same branch guards as the real child render.
		expect(calls).toEqual(['b']);
		r.unmount();
	});
});

describe('parallel use() — warm exclusion for suspended-data props', () => {
	it('a child whose props read the suspended value is not prefetched', async () => {
		const da = deferred<{ id: string }>();
		const dLeaf = deferred<string>();
		let leafCalls: string[] = [];
		const fetchA = () => da.promise;
		const fetchLeaf = (id: string) => {
			leafCalls.push(id);
			return dLeaf.promise;
		};
		const r = mount(GatedHost, { fetchA, fetchLeaf });
		expect(leafCalls).toEqual([]); // data-dependent — correctly NOT warmed

		await act(() => da.resolve({ id: 'the-id' }));
		expect(leafCalls).toEqual(['the-id']);

		await act(() => dLeaf.resolve('leaf!'));
		expect(r.find('.leaf').textContent).toBe('leaf!');
		r.unmount();
	});
});

describe('parallel use() — imported data hooks', () => {
	it('starts independent reads in a custom hook before either one settles', async () => {
		const resources = resourceFetcher();
		const r = mount(ImportedHookHost, { load: resources.load, version: 0 });

		expect([...resources.calls].sort()).toEqual(['project:0', 'viewer:0']);
		expect(r.find('.fallback').textContent).toBe('pair-loading');

		await act(() => resources.settle('project', 0));
		expect(r.find('.fallback').textContent).toBe('pair-loading');
		await act(() => resources.settle('viewer', 0));

		expect(r.find('.project').textContent).toBe('project-v0');
		expect(r.find('.viewer').textContent).toBe('viewer-v0');
		expect([...resources.calls].sort()).toEqual(['project:0', 'viewer:0']);
		r.unmount();
	});

	it('keeps two calls to the same imported hook in disjoint memo slots', async () => {
		const resources = resourceFetcher();
		const r = mount(ImportedHookTwiceHost, { load: resources.load, version: 0 });

		// Each hook call batches its own pair. The first call suspends before the
		// second is reached, but replay must give the second call distinct memo cells.
		expect([...resources.calls].sort()).toEqual(['project:0', 'viewer:0']);
		await act(() => resources.settle('project', 0));
		await act(() => resources.settle('viewer', 0));
		expect(r.find('.imported-pair-twice').textContent).toBe(
			'project-v0|viewer-v0|project-v0|viewer-v0',
		);
		expect([...resources.calls].sort()).toEqual(['project:0', 'project:0', 'viewer:0', 'viewer:0']);
		r.unmount();
	});

	it('keeps a true dependency inside an imported custom hook sequential', async () => {
		const project = deferred<{ ownerId: string }>();
		const owner = deferred<string>();
		let projectCalls = 0;
		const ownerArgs: string[] = [];
		const r = mount(ImportedDependentHookHost, {
			loadProject: () => {
				projectCalls++;
				return project.promise;
			},
			loadOwner: (ownerId: string) => {
				ownerArgs.push(ownerId);
				return owner.promise;
			},
		});

		expect(projectCalls).toBe(1);
		expect(ownerArgs).toEqual([]);
		expect(r.find('.fallback').textContent).toBe('dependent-loading');

		await act(() => project.resolve({ ownerId: 'owner-7' }));
		expect(projectCalls).toBe(1);
		expect(ownerArgs).toEqual(['owner-7']);
		expect(r.find('.fallback').textContent).toBe('dependent-loading');

		await act(() => owner.resolve('Ada'));
		expect(r.find('.imported-dependent').textContent).toBe('owner-7/Ada');
		expect(projectCalls).toBe(1);
		expect(ownerArgs).toEqual(['owner-7']);
		r.unmount();
	});

	it('tracks an outer callback capture across a block-local shadow and label', async () => {
		const resources = resourceFetcher();
		const r = mount(ImportedCapturedHookHost, { load: resources.load, version: 0 });

		expect(resources.calls).toContain('captured:0');
		await act(() => resources.settle('captured', 0));
		expect(r.find('.imported-captured').textContent).toBe('captured-v0');

		r.update(ImportedCapturedHookHost, { load: resources.load, version: 1 });
		expect(resources.calls).toContain('captured:1');
		await act(() => resources.settle('captured', 1));
		expect(r.find('.imported-captured').textContent).toBe('captured-v1');
		r.unmount();
	});
});

describe('parallel use() — adjacent async component trees', () => {
	it('does not warm the final template after setup returns an alternate subtree', async () => {
		const resources = resourceFetcher();
		const r = mount(EarlyReturnPanelsHost, {
			load: resources.load,
			version: 0,
			alternate: true,
		});

		expect(resources.calls).toEqual(['alternate:0']);
		await act(() => resources.settle('alternate', 0));
		expect(r.find('.alternate-panel').textContent).toBe('alternate-v0');
		expect(resources.calls).toEqual(['alternate:0']);
		r.unmount();
	});

	it('does not refetch an earlier fulfilled sibling when only the later sibling suspends', async () => {
		const resources = resourceFetcher();
		const r = mount(VersionedSiblingsHost, {
			load: resources.load,
			stableVersion: 0,
			changingVersion: 0,
		});
		await act(() => resources.settle('stable', 0));
		await act(() => resources.settle('changing', 0));
		expect([...resources.calls].sort()).toEqual(['changing:0', 'stable:0']);

		r.update(VersionedSiblingsHost, {
			load: resources.load,
			stableVersion: 0,
			changingVersion: 1,
		});
		expect(resources.calls).toEqual(['stable:0', 'changing:0', 'changing:1']);
		await act(() => resources.settle('changing', 1));
		expect(r.find('.stable').textContent).toBe('stable-v0');
		expect(r.find('.changing').textContent).toBe('changing-v1');
		expect(resources.calls).toHaveLength(3);
		r.unmount();
	});

	it('warms repeated instances of the same component and dependency values', async () => {
		const resources = resourceFetcher();
		const r = mount(RepeatedPanelsHost, { load: resources.load, version: 0 });

		// One call per concrete component instance, both before either settles.
		expect(resources.calls).toEqual(['repeated:0', 'repeated:0']);
		await act(() => resources.settle('repeated', 0));
		expect(r.findAll('.repeated-panel').map((node: Element) => node.textContent)).toEqual([
			'repeated-v0',
			'repeated-v0',
		]);
		expect(resources.calls).toHaveLength(2);
		r.unmount();
	});

	it('preserves distinct results across more than 64 same-dependency component occurrences', async () => {
		const occurrenceCount = 65;
		const calls: string[] = [];
		const jobs: Deferred<string>[] = [];
		const load = (resource: string, version: number) => {
			calls.push(`${resource}:${version}`);
			const job = deferred<string>();
			jobs.push(job);
			return job.promise;
		};
		const expected = Array.from(
			{ length: occurrenceCount },
			(_, index) => `value-${index.toString().padStart(3, '0')}`,
		);
		const r = mount(ManyRepeatedPanelsHost, { load, version: 0 });

		// Every adjacent occurrence starts before any promise settles, even though
		// the component, call site, and dependency values are identical.
		expect(jobs).toHaveLength(occurrenceCount);
		expect(calls).toHaveLength(occurrenceCount);
		expect(calls.every((call) => call === 'repeated:0')).toBe(true);

		await act(() => {
			for (let index = occurrenceCount - 1; index >= 0; index--) {
				jobs[index].resolve(expected[index]);
			}
		});

		expect(r.findAll('.repeated-panel').map((node: Element) => node.textContent)).toEqual(expected);
		expect(calls).toHaveLength(occurrenceCount);
		r.unmount();
	});

	it('starts distinct sibling panels and nested children in the first attempt', async () => {
		const resources = resourceFetcher();
		const r = mount(AdjacentPanelsHost, { load: resources.load, version: 0 });
		const expected = ['activity-summary:0', 'activity:0', 'insights-chart:0', 'insights:0'];

		expect([...resources.calls].sort()).toEqual(expected);
		expect(r.find('.fallback').textContent).toBe('panels-loading');

		await act(() => resources.settle('activity', 0));
		await act(() => resources.settle('activity-summary', 0));
		await act(() => resources.settle('insights', 0));
		await act(() => resources.settle('insights-chart', 0));

		expect(r.find('.activity-value').textContent).toBe('activity-v0');
		expect(r.find('.activity-summary').textContent).toBe('activity-summary-v0');
		expect(r.find('.insights-value').textContent).toBe('insights-v0');
		expect(r.find('.insights-chart').textContent).toBe('insights-chart-v0');
		expect([...resources.calls].sort()).toEqual(expected);
		r.unmount();
	});

	it('warms an async descendant through multiple forward-declared synchronous wrappers', async () => {
		const resources = resourceFetcher();
		const root = mount(SyncWarmBranchesHost, { load: resources.load, version: 0 });
		const expected = ['sync-warm-direct:0', 'sync-warm-leaf:0'];

		expect([...resources.calls].sort()).toEqual(expected);
		expect(root.find('.fallback').textContent).toBe('sync-warm-loading');

		await act(() => {
			resources.settle('sync-warm-direct', 0);
			resources.settle('sync-warm-leaf', 0);
		});

		expect(root.find('.sync-warm-direct').textContent).toBe('sync-warm-direct-v0');
		expect(root.find('.sync-warm-leaf').textContent).toBe('sync-warm-leaf-v0');
		expect([...resources.calls].sort()).toEqual(expected);
		root.unmount();
	});

	it.each([
		['destructured props', '{ label }', 'label'],
		['aliased destructured props', '{ label: name }', 'name'],
		['direct prop access', 'props', 'props.label'],
	])(
		'does not read a synchronous child with %s before an earlier sibling resolves',
		async (description, parameter, label) => {
			const source = `
				import { use, useState } from 'octane';

				function SynchronousChild(${parameter}) @{
					const [revision] = useState(0);
					<span class="synchronous-profile">{${label} + revision as string}</span>
				}

				function AsyncSibling(props) @{
					const value = use(props.load('profile-sibling', props.version));
					<span class="profile-sibling">{value as string}</span>
				}

				function Branches(props) @{
					<main>
						<AsyncSibling load={props.load} version={props.version} />
						<SynchronousChild label={props.profile.label} />
					</main>
				}

				export function App(props) @{
					<>
						@try {
							<Branches load={props.load} version={props.version} profile={props.profile} />
						} @pending {
							<span class="profile-pending">loading</span>
						}
					</>
				}
			`;
			const client = loadCompiledFixtureSource(source, {
				id: `${description.replace(/\W+/g, '-')}-synchronous-child.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const resources = resourceFetcher();
			const reads: string[] = [];
			const profile = new Proxy(
				{ label: 'Ada' },
				{
					get(target, property, receiver) {
						if (property === 'label') reads.push(property);
						return Reflect.get(target, property, receiver);
					},
				},
			);
			const root = mount(client.App, { load: resources.load, version: 0, profile });

			expect(resources.calls).toEqual(['profile-sibling:0']);
			expect(root.find('.profile-pending').textContent).toBe('loading');
			expect(reads).toEqual([]);

			await act(() => resources.settle('profile-sibling', 0));

			expect(root.find('.profile-sibling').textContent).toBe('profile-sibling-v0');
			expect(root.find('.synchronous-profile').textContent).toBe('Ada0');
			expect(reads).toEqual(['label']);
			root.unmount();
		},
	);

	it.each([
		['key', 'key="stable"', ''],
		['ref', 'ref={props.capture}', ' ref={props.ref}'],
	])(
		'does not read a synchronous child with a %s before an earlier sibling resolves',
		async (kind, componentAttribute, hostAttribute) => {
			const source = `
				import { use } from 'octane';

				function SynchronousChild(props) @{
					<span class="decorated-profile"${hostAttribute}>{props.label as string}</span>
				}

				function Wrapper(props) @{
					<SynchronousChild ${componentAttribute} label={props.label} />
				}

				function AsyncSibling(props) @{
					const value = use(props.load('decorated-sibling', props.version));
					<span class="decorated-sibling">{value as string}</span>
				}

				function Branches(props) @{
					<main>
						<AsyncSibling load={props.load} version={props.version} />
						<Wrapper label={props.profile.label} capture={props.capture} />
					</main>
				}

				export function App(props) @{
					<>
						@try {
							<Branches
								load={props.load}
								version={props.version}
								profile={props.profile}
								capture={props.capture}
							/>
						} @pending {
							<span class="decorated-pending">loading</span>
						}
					</>
				}
			`;
			const client = loadCompiledFixtureSource(source, {
				id: `${kind}-synchronous-child.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const resources = resourceFetcher();
			const reads: string[] = [];
			const attachments: (Element | null)[] = [];
			const capture = (node: Element | null) => {
				attachments.push(node);
			};
			const profile = new Proxy(
				{ label: 'Ada' },
				{
					get(target, property, receiver) {
						if (property === 'label') reads.push(property);
						return Reflect.get(target, property, receiver);
					},
				},
			);
			const root = mount(client.App, { load: resources.load, version: 0, profile, capture });

			expect(resources.calls).toEqual(['decorated-sibling:0']);
			expect(root.find('.decorated-pending').textContent).toBe('loading');
			expect(reads).toEqual([]);
			expect(attachments).toEqual([]);

			await act(() => resources.settle('decorated-sibling', 0));

			const child = root.find('.decorated-profile');
			expect(child.textContent).toBe('Ada');
			expect(root.find('.decorated-sibling').textContent).toBe('decorated-sibling-v0');
			expect(attachments).toEqual(kind === 'ref' ? [child] : []);
			root.unmount();
			expect(attachments).toEqual(kind === 'ref' ? [child, null] : []);
		},
	);

	it.each([
		['destructured props', '{ load, version }', 'load', 'version'],
		['aliased destructured props', '{ load: fetch, version: revision }', 'fetch', 'revision'],
		['direct prop access', 'props', 'props.load', 'props.version'],
	])(
		'starts an async descendant through a stateful wrapper with %s',
		async (description, parameter, load, version) => {
			const source = `
				import { use, useState } from 'octane';

				function Wrapper(${parameter}) @{
					const [count] = useState(0);
					<section data-count={count}>
						<AsyncLeaf load={${load}} version={${version}} />
					</section>
				}

				function AsyncLeaf(props) @{
					const value = use(props.load('prop-wrapper-leaf', props.version));
					<span class="prop-wrapper-leaf">{value as string}</span>
				}

				function AsyncSibling(props) @{
					const value = use(props.load('prop-wrapper-sibling', props.version));
					<span class="prop-wrapper-sibling">{value as string}</span>
				}

				function Branches(props) @{
					<main>
						<AsyncSibling load={props.load} version={props.version} />
						<Wrapper load={props.load} version={props.version} />
					</main>
				}

				export function App(props) @{
					<>
						@try {
							<Branches load={props.load} version={props.version} />
						} @pending {
							<span class="prop-wrapper-pending">loading</span>
						}
					</>
				}
			`;
			const client = loadCompiledFixtureSource(source, {
				id: `${description.replace(/\W+/g, '-')}-async-wrapper.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const resources = resourceFetcher();
			const root = mount(client.App, { load: resources.load, version: 0 });
			const expected = ['prop-wrapper-leaf:0', 'prop-wrapper-sibling:0'];

			expect([...resources.calls].sort()).toEqual(expected);
			expect(root.find('.prop-wrapper-pending').textContent).toBe('loading');

			await act(() => {
				resources.settle('prop-wrapper-leaf', 0);
				resources.settle('prop-wrapper-sibling', 0);
			});

			expect(root.find('.prop-wrapper-leaf').textContent).toBe('prop-wrapper-leaf-v0');
			expect(root.find('.prop-wrapper-sibling').textContent).toBe('prop-wrapper-sibling-v0');
			expect([...resources.calls].sort()).toEqual(expected);
			root.unmount();
		},
	);

	it('starts async work hidden behind a reassigned same-module component before its sibling resolves', async () => {
		const source = `
			import { use } from 'octane';

			function MutableComponent(props) {
				return <span>initially synchronous</span>;
			}

			function AsyncReplacement(props) @{
				const value = use(props.load('mutable-reassigned', props.version));
				<span class="mutable-warm-reassigned">{value as string}</span>
			}

			function AsyncSibling(props) @{
				const value = use(props.load('mutable-sibling', props.version));
				<span class="mutable-warm-sibling">{value as string}</span>
			}

			function Wrapper(props) @{
				<MutableComponent load={props.load} version={props.version} />
			}

			MutableComponent = AsyncReplacement;

			function Branches(props) @{
				<main>
					<AsyncSibling load={props.load} version={props.version} />
					<Wrapper load={props.load} version={props.version} />
				</main>
			}

			export function App(props) @{
				<>
					@try {
						<Branches load={props.load} version={props.version} />
					} @pending {
						<span class="mutable-warm-pending">loading</span>
					}
				</>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'mutable-component-warming.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const resources = resourceFetcher();
		const root = mount(client.App, { load: resources.load, version: 0 });
		const expected = ['mutable-reassigned:0', 'mutable-sibling:0'];

		expect([...resources.calls].sort()).toEqual(expected);
		expect(root.find('.mutable-warm-pending').textContent).toBe('loading');

		await act(() => {
			resources.settle('mutable-reassigned', 0);
			resources.settle('mutable-sibling', 0);
		});

		expect(root.find('.mutable-warm-reassigned').textContent).toBe('mutable-reassigned-v0');
		expect(root.find('.mutable-warm-sibling').textContent).toBe('mutable-sibling-v0');
		expect([...resources.calls].sort()).toEqual(expected);
		root.unmount();
	});

	it('warms again when an update returns to previously consumed dependency values', async () => {
		const resources = freshResourceFetcher();
		const expectedRound = (version: number) =>
			['activity', 'activity-summary', 'insights', 'insights-chart']
				.map((resource) => `${resource}:${version}`)
				.sort();
		const r = mount(AdjacentPanelsHost, { load: resources.load, version: 0 });
		expect([...resources.calls].sort()).toEqual(expectedRound(0));
		await resources.settleRound(0);

		r.update(AdjacentPanelsHost, { load: resources.load, version: 1 });
		expect(resources.calls.slice(4).sort()).toEqual(expectedRound(1));
		await resources.settleRound(1);

		r.update(AdjacentPanelsHost, { load: resources.load, version: 0 });
		// Returning to 0 is a fresh suspension episode. Consumed warm entries from
		// the initial mount must not serialize the sibling/nested fetch starts.
		expect(resources.calls.slice(8).sort()).toEqual(expectedRound(0));
		await resources.settleRound(0);
		expect(resources.calls).toHaveLength(12);
		r.unmount();
	});

	it('warms all adjacent resources after a same-deps hide and remount', async () => {
		const resources = freshResourceFetcher();
		const expected = ['activity-summary:0', 'activity:0', 'insights-chart:0', 'insights:0'];
		const r = mount(AdjacentPanelsHost, { load: resources.load, version: 0, show: true });
		expect([...resources.calls].sort()).toEqual(expected);
		await resources.settleRound(0);

		r.update(AdjacentPanelsHost, { load: resources.load, version: 0, show: false });
		r.update(AdjacentPanelsHost, { load: resources.load, version: 0, show: true });
		expect(resources.calls.slice(4).sort()).toEqual(expected);
		await resources.settleRound(0);
		expect(resources.calls).toHaveLength(8);
		r.unmount();
	});
});
