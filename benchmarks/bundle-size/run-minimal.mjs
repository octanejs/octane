// Production public-import reachability: build and execute each independent
// feature entry before publishing deterministic byte totals and budget peers.
//
//   node run-minimal.mjs [scenario...]                  report bytes and budget peers
//   node run-minimal.mjs --budgets [scenario...]        fail when a scenario exceeds its budget
//   node run-minimal.mjs --write-budgets [scenario...]  reset budgets to measured + headroom
//
// Pull request CI runs `--budgets --ratchet` over every scenario.
// `--write-budgets` records savings in a source change; any raise must land
// alone (CONTRIBUTING.md, "Size budgets").
//
// Each bundler builds the way its users ship. Vite scenarios use Vite 8's
// default client minifier (`'oxc'`); Vite's `'esbuild'` mode would turn off
// Rolldown's own minifier and the dead-code elimination that comes with it.
// esbuild scenarios represent esbuild users and keep esbuild's `minify: true`.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import { build as buildEsbuild } from 'esbuild';
import { createOctaneCompiler } from 'octane/compiler/bundler';
import { octane } from 'octane/compiler/vite';
import { build as buildVite } from 'vite';
import { appComponent, clientEntry } from '../../packages/cli/src/commands/init/templates.js';
import { verifyScenario } from './verify-reachability.mjs';
import { ratchetBudget, selectMinimalScenarios, verifyByteBudget } from './minimal-gates.mjs';
import { requireBudgetRatchet } from './budget-raises.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../..');
const fixtures = path.join(directory, 'fixtures/minimal');
const budgetFile = path.join(directory, 'minimal-budgets.json');
const budgets = JSON.parse(fs.readFileSync(budgetFile, 'utf8'));
const existingScenarios = [
	['capture-only', 'ts'],
	['cli-spa-starter', 'ts'],
	['root-static-specialized', 'ts'],
	['root-chained-jsx', 'tsx'],
	['root-static', 'tsrx'],
	['root-static-local', 'tsrx'],
	['root-callback-local', 'tsrx'],
	['hooks-state', 'tsrx'],
	['prop-attributes', 'tsrx'],
	['context', 'tsrx'],
	['hydrate-root', 'tsrx'],
	['deferred-hydration', 'tsrx'],
	['hydrate-frame', 'ts'],
	['suspense-transition', 'tsrx'],
	['server-hooks', 'ts'],
	['server-render', 'ts'],
	['component-owned-effects', 'ts'],
	['binding-vanilla', 'ts'],
	['binding-hooks', 'tsrx'],
];
// Renderer clients that never hydrate. A @try boundary must not retain the
// streamed-boundary sentinel validator that only a hydrating mount consults.
const streamClaimFreeClientScenarios = new Set([
	'cli-spa-starter',
	'root-static-specialized',
	'root-chained-jsx',
	'root-static',
	'root-static-local',
	'root-callback-local',
	'hooks-state',
	'prop-attributes',
	'context',
	'suspense-transition',
]);
const signalFreeClientScenarios = new Set([
	'cli-spa-starter',
	'root-static-specialized',
	'root-chained-jsx',
	'root-static',
	'root-static-local',
	'root-callback-local',
	'hooks-state',
	'prop-attributes',
	'context',
	'hydrate-root',
	'deferred-hydration',
	'suspense-transition',
]);
// Renderer clients that never hydrate and render no binding view. A dynamic
// text hole must not retain the hydration range-marker validator for them.
const markerFreeClientScenarios = new Set([
	'cli-spa-starter',
	'root-chained-jsx',
	'prop-attributes',
	'context',
	'suspense-transition',
	'binding-mantine-hooks',
	'binding-usehooks-ts',
]);
const bindingScenarios = [
	{
		id: 'binding-base-ui',
		extension: 'ts',
		package: '@octanejs/base-ui',
		forbidden: /\/packages\/base-ui\/src\/(?:dialog|popover)(?:\.ts$|\/)/,
	},
	{
		id: 'binding-aria',
		extension: 'ts',
		package: '@octanejs/aria',
		forbidden:
			/\/packages\/aria\/src\/(?:numberfield\/useNumberField|radio\/useRadio|menu\/useMenu)\.ts$/,
	},
	{
		id: 'binding-motion',
		extension: 'ts',
		package: '@octanejs/motion',
		forbidden: /\/packages\/motion\/src\/(?:context|useSpring)\.ts$/,
	},
	{
		id: 'binding-radix',
		extension: 'ts',
		package: '@octanejs/radix',
		forbidden: /\/packages\/radix\/src\/(?:Dialog|Popover)\.ts$/,
	},
	{
		id: 'binding-floating-ui',
		extension: 'ts',
		package: '@octanejs/floating-ui',
		forbidden: /\/packages\/floating-ui\/src\/(?:context|tree|FloatingPortal)\.ts$/,
	},
	{
		id: 'binding-mantine-hooks',
		extension: 'tsrx',
		package: '@octanejs/mantine-hooks',
		forbidden: /\/packages\/mantine-hooks\/src\/use-(?:local|session)-storage\//,
	},
	{
		id: 'binding-apollo-client',
		extension: 'tsrx',
		package: '@octanejs/apollo-client',
		forbidden:
			/\/packages\/apollo-client\/src\/react\/hooks\/use(?:Query|Mutation|SuspenseQuery)\.js$/,
	},
	{
		id: 'binding-usehooks-ts',
		extension: 'tsrx',
		package: '@octanejs/usehooks-ts',
		forbidden: /\/packages\/usehooks-ts\/src\/timing\.ts$/,
	},
];
const scenarios = [
	...existingScenarios.map(([id, extension]) => ({
		id,
		name: id,
		extension,
		bundler: 'vite',
	})),
	...['vite', 'esbuild'].map((bundler) => ({
		id: 'behavior-root',
		name: `behavior-root-${bundler}`,
		extension: 'ts',
		bundler,
	})),
	...bindingScenarios.flatMap((scenario) =>
		['vite', 'esbuild'].map((bundler) => ({
			...scenario,
			name: `${scenario.id}-${bundler}`,
			bundler,
		})),
	),
];
const nativeArrayGuardExports = new Set([
	'mapSlot',
	'compilerCacheMappedArray',
	'compilerCacheImmutableArrayFilter',
]);
// A bare intrinsic read, not a call such as `Array.prototype.map.call(...)`.
const nativeArraySnapshot = /Array\.prototype\.(?:map|filter)(?![\w$.(])|Symbol\.species/;
const productionDefines = {
	__OCTANE_PROFILE_ENABLED__: 'false',
	'process.env.NODE_ENV': JSON.stringify('production'),
};
const compiler = createOctaneCompiler({ root: directory });
const stat = (value) => ({ median: value, min: value, samples: 1 });
const forbidden = [
	['React', /\/node_modules\/react(?:-dom)?\//],
	['Octane React compatibility', /\/packages\/octane\/src\/react\//],
	['server runtime', /\/packages\/octane\/src\/(?:runtime\.server\.ts|server\/)/],
	['profiling', /\/packages\/octane\/src\/profiling\.ts$/],
	['devtools', /\/packages\/octane\/src\/[^/]*devtools[^/]*\.[jt]s$/],
	['devalue', /\/node_modules\/devalue\//],
	['unused package metadata', /\/packages\/octane\/(?:package\.json|src\/version\.ts)$/],
];

function verifyBindingSideEffectsInventory() {
	const ariaBootstrap = [
		'./src/index.ts',
		'./src/interactions/useFocusVisible.ts',
		'./src/utils/runAfterTransition.ts',
	];
	for (const scenario of bindingScenarios) {
		const packageDirectory = path.join(
			repository,
			'packages',
			scenario.package.slice('@octanejs/'.length),
		);
		const manifest = JSON.parse(
			fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
		);
		assert.equal(
			manifest.name,
			scenario.package,
			`${scenario.id}: incorrect published package inventory`,
		);
		if (scenario.package !== '@octanejs/aria') {
			assert.equal(
				manifest.sideEffects,
				false,
				`${scenario.package}: reviewed modules must remain pure`,
			);
			continue;
		}
		assert.deepEqual(
			manifest.sideEffects,
			ariaBootstrap,
			`${scenario.package}: browser bootstrap changed its reviewed side-effect allowlist`,
		);
		for (const allowed of ariaBootstrap) {
			const filename = path.resolve(packageDirectory, allowed);
			assert.equal(
				filename.startsWith(packageDirectory + path.sep) && fs.statSync(filename).isFile(),
				true,
				`${scenario.package}: declared browser bootstrap source is missing: ${allowed}`,
			);
			assert.equal(
				manifest.files.some(
					(included) => allowed === `./${included}` || allowed.startsWith(`./${included}/`),
				),
				true,
				`${scenario.package}: declared browser bootstrap source is missing from the published package: ${allowed}`,
			);
		}
	}
	for (const packageName of [
		'rainbowkit',
		'nuqs',
		'testing-library',
		'recharts',
		'styled-components',
	]) {
		const manifest = JSON.parse(
			fs.readFileSync(path.join(repository, 'packages', packageName, 'package.json'), 'utf8'),
		);
		assert.notEqual(
			manifest.sideEffects,
			false,
			`${manifest.name}: genuinely effectful modules must not be globally marked pure`,
		);
	}
}

verifyBindingSideEffectsInventory();

const expectedNames = new Set(scenarios.map(({ name }) => name));
assert.deepEqual(
	Object.keys(budgets).sort(),
	[...expectedNames].sort(),
	'minimal-import budgets must cover every scenario exactly once',
);

const args = process.argv.slice(2);
const requireTight = requireBudgetRatchet(args);
const { selectedScenarios, enforceBudgets, writeBudgets } = selectMinimalScenarios(
	args.filter((arg) => arg !== '--ratchet'),
	scenarios,
);
const measuredBudgets = {};

const payload = { suite: 'bundle-reachability', iterations: 1, targets: [] };

function cliStarterPlugin(entry) {
	const component = path.join(fixtures, 'cli-spa-starter-App.tsrx');
	return {
		name: 'octane-reachability-generated-cli-starter',
		enforce: 'pre',
		resolveId(source, importer) {
			if (source === entry) return entry;
			if (source === './App.tsrx' && importer === entry) return component;
			return null;
		},
		load(id) {
			if (id === component) return appComponent('spa');
			if (id !== entry) return null;
			return `${clientEntry}
export function run(container) {
	const page = container.querySelector('main.page');
	const title = page?.querySelector('h1');
	const quickStart = container.querySelector('a[href="https://octanejs.dev/docs/quick-start"]');
	return {
		page: page !== null,
		title: title?.textContent,
		quickStart: quickStart?.querySelector('.link-title')?.textContent,
		quickStartHref: quickStart?.getAttribute('href'),
		links: container.querySelectorAll('a').length,
		styled: page !== null && getComputedStyle(page).display === 'flex',
	};
}
`;
		},
	};
}

// A scenario with a `<id>.server.ts` companion hydrates real server markup: the
// companion's `render()` runs from a production server build of the same
// application modules, and its HTML is handed to the measured client bundle.
// The server build itself is never measured.
async function renderServerMarkup(id) {
	const entry = path.join(fixtures, `${id}.server.ts`);
	if (!fs.existsSync(entry)) return undefined;
	const result = await buildVite({
		configFile: false,
		root: directory,
		mode: 'production',
		logLevel: 'error',
		plugins: [octane({ hmr: false })],
		define: productionDefines,
		ssr: { noExternal: true },
		build: {
			write: false,
			ssr: entry,
			minify: false,
			target: 'esnext',
			rollupOptions: { output: { format: 'esm' } },
		},
	});
	const built = Array.isArray(result) ? result : [result];
	const chunks = built[0].output.filter((file) => file.type === 'chunk');
	assert.equal(chunks.length, 1, `${id}: expected one server bundle`);
	const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-reachability-ssr-'));
	try {
		const file = path.join(outDir, 'server.mjs');
		fs.writeFileSync(file, chunks[0].code);
		const { render } = await import(pathToFileURL(file).href);
		const html = render();
		assert.equal(typeof html, 'string', `${id}: server render must return markup`);
		return html;
	} finally {
		fs.rmSync(outDir, { recursive: true, force: true });
	}
}

async function buildScenario(scenario, entry) {
	if (scenario.bundler === 'esbuild') {
		const result = await buildEsbuild({
			absWorkingDir: repository,
			entryPoints: [entry],
			bundle: true,
			write: false,
			format: 'iife',
			globalName: '__OCTANE_REACHABILITY__',
			platform: 'browser',
			target: 'esnext',
			minify: true,
			treeShaking: true,
			metafile: true,
			logLevel: 'silent',
			define: productionDefines,
			plugins: [
				{
					name: 'octane-reachability-source',
					setup(build) {
						build.onLoad({ filter: /\.(?:tsrx|[jt]sx?)$/ }, ({ path: filename }) => {
							const template = filename.endsWith('.tsrx');
							// Authored dependencies use their own package manifest to select
							// compilation, including providers with explicit hook slots.
							const source = fs.readFileSync(filename, 'utf8');
							const result = compiler.transform(source, filename, {
								environment: 'client',
								hmr: false,
								dev: false,
								profile: false,
							});
							if (template) {
								assert.equal(
									result?.kind,
									'compile',
									`${scenario.name}: uncompiled Octane template`,
								);
							}
							if (result === null || result.kind === 'none') return null;
							// Match Vite: compiled `.ts`/`.tsx` output keeps TypeScript with
							// runtime semantics (`enum`), which the TS loader then lowers.
							// Compiled `.tsrx` output is JavaScript.
							return {
								contents: result.code,
								loader: template ? 'js' : path.extname(filename).slice(1),
							};
						});
					},
				},
			],
		});
		assert.equal(result.outputFiles.length, 1, `${scenario.name}: unexpected executable outputs`);
		const output = Object.values(result.metafile.outputs);
		assert.equal(output.length, 1, `${scenario.name}: unexpected production dependency outputs`);
		const modules = Object.entries(output[0].inputs)
			.filter(([, input]) => input.bytesInOutput > 0)
			.map(([id]) => path.resolve(repository, id));
		return { code: result.outputFiles[0].text, modules, runtimeExports: [] };
	}

	const result = await buildVite({
		configFile: false,
		root: directory,
		mode: 'production',
		logLevel: 'error',
		plugins: [
			...(scenario.id === 'cli-spa-starter' ? [cliStarterPlugin(entry)] : []),
			octane({ hmr: false }),
		],
		define: productionDefines,
		build: {
			write: false,
			minify: 'oxc',
			target: 'esnext',
			lib: {
				entry,
				formats: ['iife'],
				name: '__OCTANE_REACHABILITY__',
			},
		},
	});
	const built = Array.isArray(result) ? result : [result];
	assert.equal(built.length, 1, `${scenario.name}: expected exactly one production build`);
	const chunks = built[0].output.filter((file) => file.type === 'chunk');
	assert.equal(chunks.length, 1, `${scenario.name}: expected exactly one executable bundle`);
	const chunk = chunks[0];
	assert.deepEqual(
		chunk.imports,
		[],
		`${scenario.name}: unexpected external production dependency`,
	);
	assert.deepEqual(
		chunk.dynamicImports,
		[],
		`${scenario.name}: deferred dependency escaped the measured production bundle`,
	);
	const modules = Object.entries(chunk.modules)
		.filter(([, module]) => !scenario.package || module.renderedLength > 0)
		.map(([id]) => id);
	const emittedModules = Object.entries(chunk.modules)
		.filter(([, module]) => module.renderedLength > 0)
		.map(([id]) => id);
	const runtimeModule = modules.find((id) => id.endsWith('/packages/octane/src/runtime.ts'));
	const serverRuntimeModule = modules.find((id) =>
		id.endsWith('/packages/octane/src/runtime.server.ts'),
	);
	const streamModule = modules.find((id) => id.endsWith('/packages/octane/src/stream-protocol.ts'));
	return {
		code: chunk.code,
		modules,
		emittedModules,
		runtimeExports: runtimeModule ? chunk.modules[runtimeModule].renderedExports : [],
		serverRuntimeExports: serverRuntimeModule
			? chunk.modules[serverRuntimeModule].renderedExports
			: [],
		streamExports: streamModule ? chunk.modules[streamModule].renderedExports : [],
	};
}

try {
	for (const scenario of selectedScenarios) {
		const { id, name } = scenario;
		const serverScenario = id.startsWith('server-');
		const entry = path.join(fixtures, `${id}.${scenario.extension}`);
		const {
			code,
			modules,
			emittedModules = modules,
			runtimeExports,
			serverRuntimeExports = [],
			streamExports = [],
		} = await buildScenario(scenario, entry);
		for (const [label, pattern] of forbidden) {
			if (serverScenario && label === 'server runtime') continue;
			const leaked = modules.find((id) => pattern.test(id));
			assert.equal(leaked, undefined, `${name}: ${label} reached the production bundle: ${leaked}`);
		}
		if (signalFreeClientScenarios.has(id)) {
			assert.deepEqual(
				emittedModules.filter((module) =>
					/\/packages\/octane\/src\/signals\/transition-(?:candidate|action|coordinator)\.[jt]s$/.test(
						module,
					),
				),
				[],
				`${name}: signal-free client retained the concrete native transition implementation`,
			);
		}
		// hydrate-root is the control: a hydrating client keeps the validator, so
		// its export name still identifies it.
		if (streamClaimFreeClientScenarios.has(id) || id === 'hydrate-root') {
			assert.equal(
				streamExports.includes('isRendererStreamBoundaryTemplate'),
				id === 'hydrate-root',
				id === 'hydrate-root'
					? `${name}: the streamed-boundary validator was renamed; update this reachability check`
					: `${name}: a client that never hydrates retained the streamed-boundary validator`,
			);
		}
		if (id === 'prop-attributes') {
			assert.deepEqual(
				emittedModules.filter((module) =>
					/\/packages\/octane\/src\/(?:dom-tables\.js|hydration\/control-capture\.ts)$/.test(
						module,
					),
				),
				[],
				`${name}: statically named attribute bindings retained the generic attribute or control-restore writers`,
			);
		}
		if (markerFreeClientScenarios.has(id)) {
			assert.deepEqual(
				emittedModules.filter((module) =>
					module.endsWith('/packages/octane/src/dom-binding-protocol.ts'),
				),
				[],
				`${name}: a client that never hydrates retained the binding-marker validator`,
			);
		}
		const hasRuntime = modules.some((module) => module.endsWith('/packages/octane/src/runtime.ts'));
		const hasServerRuntime = modules.some((module) =>
			module.endsWith('/packages/octane/src/runtime.server.ts'),
		);
		const hasVanillaStore = modules.some((id) => /\/node_modules\/zustand\//.test(id));
		// Both runtimes snapshot native array intrinsics at load for their mapped
		// list guards. A bundle that renders none of those guards must drop the
		// snapshots instead of keeping their reads as dead statements.
		if (
			scenario.bundler === 'vite' &&
			!scenario.package &&
			(hasRuntime || hasServerRuntime) &&
			![...runtimeExports, ...serverRuntimeExports].some((name) =>
				nativeArrayGuardExports.has(name),
			)
		) {
			const snapshot = nativeArraySnapshot.exec(code)?.[0];
			assert.equal(
				snapshot,
				undefined,
				`${name}: a bundle that never maps a list retained the native array snapshot \`${snapshot}\``,
			);
		}
		if (serverScenario) {
			assert.equal(hasServerRuntime, true, `${name}: public server import omitted its runtime`);
			assert.equal(hasRuntime, false, `${name}: unrelated client runtime reached server entry`);
			if (id === 'server-hooks') {
				assert.equal(
					modules.some((id) => id.endsWith('/packages/octane/src/dom-tables.js')),
					false,
					`${name}: unrelated DOM namespace tables reached isolated server helpers`,
				);
			}
			// The async-identity encoder reads an ASCII unit table built at module
			// load. A bundle without the encoder must drop the table; server-render
			// keeps the encoder, so it proves the pattern still matches. Oxc prints
			// string literals as template literals, so the quote may be a backtick.
			const encodesIdentities = serverRuntimeExports.includes('encodeAsyncIdentityString');
			if (id === 'server-render') {
				assert.equal(
					encodesIdentities,
					true,
					`${name}: the async-identity encoder was renamed or left server rendering; update this reachability check`,
				);
			}
			assert.equal(
				/\.toString\(16\)\.padStart\(4,\s*["'`]0["'`]\)/.test(code),
				encodesIdentities,
				encodesIdentities
					? `${name}: the async-identity encoder no longer formats code units; update this reachability check`
					: `${name}: a server bundle that never encodes an async identity retained its ASCII unit table`,
			);
		} else if (
			id === 'capture-only' ||
			id === 'behavior-root' ||
			id === 'binding-vanilla' ||
			id === 'binding-floating-ui'
		) {
			assert.equal(hasRuntime, false, `${name}: unrelated client runtime reached isolated entry`);
		} else if (id !== 'binding-motion' && id !== 'binding-aria') {
			assert.equal(hasRuntime, true, `${name}: executable feature omitted the client runtime`);
		}
		if (id === 'behavior-root') {
			assert.deepEqual(
				modules.filter((id) => /\/packages\/octane\/src\/compiler\//.test(id)),
				[],
				`${name}: compiler reached the behavior-only production bundle`,
			);
		}
		if (
			id === 'root-static-specialized' ||
			id === 'root-chained-jsx' ||
			id === 'root-static-local' ||
			id === 'root-callback-local' ||
			id === 'cli-spa-starter' ||
			(id === 'binding-apollo-client' && scenario.bundler === 'vite')
		) {
			assert.equal(
				runtimeExports.includes('__createVoidRoot'),
				true,
				`${name}: the compiled application root lost compiler specialization`,
			);
			assert.equal(
				runtimeExports.includes('createRoot'),
				false,
				`${name}: the generic reusable-root API reached the specialized entry`,
			);
		} else if (id === 'root-static') {
			assert.equal(
				runtimeExports.includes('createRoot'),
				true,
				`${name}: the reusable public root was replaced by the disposable contract`,
			);
		} else if (name === 'component-owned-effects') {
			assert.equal(
				runtimeExports.includes('__vtSeen'),
				false,
				`${name}: an unused sibling retained the optional ViewTransition runtime`,
			);
		}
		if (id === 'binding-vanilla' || id === 'binding-hooks') {
			assert.equal(hasVanillaStore, true, `${name}: real Zustand vanilla store was externalized`);
		} else {
			assert.equal(hasVanillaStore, false, `${name}: unused binding reached the client bundle`);
		}
		if (scenario.forbidden) {
			const leaked = modules.filter((module) => scenario.forbidden.test(module));
			assert.deepEqual(
				leaked,
				[],
				`${name}: unrelated ${scenario.package} exports reached the production bundle`,
			);
		}

		const snapshot = await verifyScenario(id, code, await renderServerMarkup(id));
		const bytes = Buffer.from(code);
		const measured = {
			raw: bytes.length,
			gzip: gzipSync(bytes, { level: zlib.Z_BEST_COMPRESSION }).length,
			brotli: brotliCompressSync(bytes, {
				params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY },
			}).length,
		};
		const budget = budgets[name];
		const budgetEnforced = enforceBudgets || (id === 'behavior-root' && !writeBudgets);
		verifyByteBudget(name, measured, budget, budgetEnforced, requireTight);
		if (writeBudgets) measuredBudgets[name] = ratchetBudget(measured, budget);
		payload.targets.push({
			name,
			ops: Object.fromEntries(
				Object.entries(measured).map(([metric, value]) => [metric, stat(value)]),
			),
			meta: {
				budgetEnforced,
				modules: modules.map((id) =>
					id.startsWith(repository + path.sep) ? path.relative(repository, id) : id,
				),
				hasRuntime,
				hasServerRuntime,
				hasVanillaStore,
				...(scenario.package ? { bundler: scenario.bundler, package: scenario.package } : null),
				...(id.startsWith('root-static') || id === 'cli-spa-starter' ? { runtimeExports } : null),
				snapshot,
			},
		});
		payload.targets.push({
			name: `${name}-budget`,
			ops: Object.fromEntries(
				Object.entries(budget).map(([metric, value]) => [metric, stat(value)]),
			),
		});
		console.log(
			`${name.padEnd(32)} raw ${String(measured.raw).padStart(6)}  ` +
				`gzip ${String(measured.gzip).padStart(5)}  brotli ${String(measured.brotli).padStart(5)}`,
		);
	}
	if (writeBudgets) {
		// Keep the committed key order so a rewrite diffs only the changed values.
		const next = Object.fromEntries(
			Object.entries(budgets).map(([name, budget]) => [name, measuredBudgets[name] ?? budget]),
		);
		fs.writeFileSync(budgetFile, JSON.stringify(next, null, 2) + '\n');
		console.log(
			`wrote ${Object.keys(measuredBudgets).length} budget(s) as measured + headroom (raw/gzip 32, brotli 256) to ${path.relative(repository, budgetFile)}`,
		);
	}
} catch (error) {
	payload.failed = error?.stack ?? String(error);
	console.error(`REACHABILITY FAIL: ${payload.failed}`);
	process.exitCode = 1;
} finally {
	if (process.env.BENCH_JSON) {
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	}
}
