import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRunnableDevEnvironment, createServer, type RunnableDevEnvironment } from 'vite';
import { octane } from 'octane/compiler/vite';

// `vite dev` hands `define` entries to the browser as runtime globals instead
// of replacing them, so Octane's dev runtime used to keep every
// `__OCTANE_PROFILE_ENABLED__` guard as a global read on its hot paths and load
// profiling.ts and devtools-hook.ts even with profiling off. These tests serve
// a real app from a dev server, once with profiling off and once on.
const PACKAGE_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const RUNTIME_MODULES = ['src/runtime.ts', 'src/universal-core.ts'].map((file) =>
	join(PACKAGE_ROOT, file),
);
const PROFILING_MODULES = ['src/profiling.ts', 'src/devtools-hook.ts'].map((file) =>
	join(PACKAGE_ROOT, file),
);
const roots: string[] = [];
type ProfileGlobals = typeof globalThis & {
	__OCTANE_PROFILE_ENABLED__?: boolean;
	__OCTANE_PROFILER__?: unknown;
	__OCTANE_DEVTOOLS__?: unknown;
};
const profileGlobals = globalThis as ProfileGlobals;

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
	delete profileGlobals.__OCTANE_PROFILE_ENABLED__;
	delete profileGlobals.__OCTANE_PROFILER__;
	delete profileGlobals.__OCTANE_DEVTOOLS__;
	document.body.textContent = '';
});

function fixture() {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-dev-profile-')));
	roots.push(root);
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(PACKAGE_ROOT, join(root, 'node_modules/octane'), 'dir');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	writeFileSync(
		join(root, 'app.tsrx'),
		`import { createRoot, useState } from 'octane';

function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{count as string}</button>
}

export function mount(container: Element) {
	const root = createRoot(container);
	root.render(Counter);
	return root;
}
`,
	);
	return root;
}

async function serve(profile: boolean, prebundle = false) {
	const root = fixture();
	const server = await createServer({
		configFile: false,
		root,
		logLevel: 'silent',
		appType: 'custom',
		plugins: [octane(profile ? { profile: true } : {})],
		// An app that installs octane from npm and uses only the compiler plugin
		// gets octane pre-bundled by Vite's dependency optimizer.
		optimizeDeps: { noDiscovery: true, include: prebundle ? ['octane'] : [] },
		server: {
			middlewareMode: true,
			hmr: false,
			ws: false,
			watch: null,
			fs: { allow: [root, PACKAGE_ROOT] },
		},
		environments: {
			// Executes client-consumer modules in this jsdom realm, so the app runs
			// the same transformed runtime the dev server sends a browser.
			app: {
				consumer: 'client',
				resolve: { noExternal: true },
				dev: {
					moduleRunnerTransform: true,
					createEnvironment: (name, config) =>
						createRunnableDevEnvironment(name, config, { hot: false }),
				},
			},
		},
	});
	// What Vite's client env module installs in a browser before any app code.
	profileGlobals.__OCTANE_PROFILE_ENABLED__ = profile;
	return server;
}

type DevServer = Awaited<ReturnType<typeof createServer>>;

// The code the dev server sends a browser for one module, and the modules that
// code imports.
async function served(server: DevServer, file: string) {
	const environment = server.environments.client;
	const result = await environment.transformRequest(`/@fs${file}`);
	expect(result).not.toBeNull();
	const imported = environment.moduleGraph.getModuleById(file)?.importedModules ?? new Set();
	return { code: result!.code, imports: [...imported].map((module) => module.id) };
}

// The JavaScript Vite's dependency optimizer serves for a pre-bundled octane.
async function prebundled(server: DevServer) {
	const optimizer = server.environments.client.depsOptimizer!;
	await optimizer.init();
	const octane = optimizer.metadata.optimized.octane!;
	await octane.processing;
	const directory = dirname(octane.file);
	return readdirSync(directory)
		.filter((file) => file.endsWith('.js'))
		.map((file) => readFileSync(join(directory, file), 'utf8'))
		.join('\n');
}

async function clickCounter(app: { mount(container: Element): { unmount(): void } }) {
	const container = document.createElement('div');
	document.body.append(container);
	const mounted = app.mount(container);
	container.querySelector('button')!.click();
	await new Promise((resolve) => setTimeout(resolve, 0));
	return { text: container.textContent, unmount: () => mounted.unmount() };
}

describe('vite dev profiling guards', () => {
	it('serves the runtime without profiling code when profiling is off', async () => {
		const server = await serve(false);
		try {
			for (const file of RUNTIME_MODULES) {
				const { code, imports } = await served(server, file);
				expect(code).not.toContain('__OCTANE_PROFILE_ENABLED__');
				expect(imports.length).toBeGreaterThan(0);
				for (const profiling of PROFILING_MODULES) expect(imports).not.toContain(profiling);
			}

			const environment = server.environments.app as RunnableDevEnvironment;
			const app = await environment.runner.import('/app.tsrx');
			const counter = await clickCounter(app);
			expect(counter.text).toBe('1');
			counter.unmount();

			const loaded = [...environment.moduleGraph.idToModuleMap.keys()];
			expect(loaded).toEqual(expect.arrayContaining([RUNTIME_MODULES[0]]));
			for (const file of PROFILING_MODULES) expect(loaded).not.toContain(file);
			expect(profileGlobals.__OCTANE_PROFILER__).toBeUndefined();
			expect(profileGlobals.__OCTANE_DEVTOOLS__).toBeUndefined();
		} finally {
			await server.close();
		}
	}, 60_000);

	it('keeps profiling, counters, and the DevTools hook when profiling is on', async () => {
		const server = await serve(true);
		let profiler: { clear(): void } | undefined;
		try {
			const runtime = await served(server, RUNTIME_MODULES[0]);
			expect(runtime.code).toContain('__OCTANE_PROFILE_ENABLED__');
			expect(runtime.imports).toEqual(expect.arrayContaining(PROFILING_MODULES));

			const environment = server.environments.app as RunnableDevEnvironment;
			const profiling = await environment.runner.import('octane/profiling');
			profiler = profiling.profiler;
			const app = await environment.runner.import('/app.tsrx');
			profiling.profiler.start({ timeline: false });
			const before = profiling.profiler.snapshot();
			const counter = await clickCounter(app);
			const counted = profiling.profiler.diff(before, profiling.profiler.snapshot());
			profiling.profiler.stop();

			expect(counter.text).toBe('1');
			expect(profiling.profiler.getEvents()).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ type: 'component-render', component: 'Counter' }),
				]),
			);
			expect(counted.counters['component.render']).toBeGreaterThan(0);
			expect(counted.counters['commit.root']).toBeGreaterThan(0);
			expect(profileGlobals.__OCTANE_PROFILER__).toBe(profiling.profiler);
			expect(profileGlobals.__OCTANE_DEVTOOLS__).toBeDefined();
			counter.unmount();

			const loaded = [...environment.moduleGraph.idToModuleMap.keys()];
			for (const file of PROFILING_MODULES) expect(loaded).toContain(file);
		} finally {
			profiler?.clear();
			await server.close();
		}
	}, 60_000);

	it('pre-bundles octane without profiling code when profiling is off', async () => {
		for (const profile of [false, true]) {
			const server = await serve(profile, true);
			try {
				const code = await prebundled(server);
				// Rolldown replaced the define either way; profiling on is the control
				// that shows the profiler would be visible here.
				expect(code).not.toContain('__OCTANE_PROFILE_ENABLED__');
				expect(code.includes('__OCTANE_PROFILER__')).toBe(profile);
				expect(code.includes('__OCTANE_DEVTOOLS__')).toBe(profile);
			} finally {
				await server.close();
			}
		}
	}, 60_000);
});
