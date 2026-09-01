import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';
import { octane } from './packages/octane/src/compiler/vite.js';
import { octaneMdx } from './packages/mdx/src/vite.js';
import { stylex } from './packages/stylex/src/vite.js';
import { lynxRspeedyRenderers } from './packages/lynx/src/config.runtime.js';
import { opentuiRenderers as OPENTUI_RENDERERS } from './packages/opentui/src/config.ts';
import { threeRenderers as THREE_RENDERERS } from './packages/three/src/config.ts';
import { inkRenderers as INK_RENDERERS } from './packages/ink/src/config.ts';
import { websiteMdxOptions } from './website/mdx-options.ts';
import { ensureMaterializedUpstream } from './scripts/react-port/ensure-materialized.mjs';
import {
	scopedSignalsProjects,
	signalsBrowserTests,
	signalsRuntimeTests,
} from './scripts/scoped-signals-projects.mjs';
import { reactCompatSpikeProjects } from './experiments/react-compat/vitest.config.js';
import {
	reactCompatProjects,
	reactCompatSSRProjects,
} from './packages/octane/tests/react-compat/vitest.config.js';

// Lock-pinned packages regenerate their adapted tests/upstream suites from the
// committed pristine tree plus audit/upstream-patches/. Test-file globs resolve
// at config load — before any globalSetup — so the trees must exist now or
// their suites are silently dropped from collection. Near-free when already
// present; fully offline for a committed pristine tree.
ensureMaterializedUpstream(import.meta.dirname);

const requireReactTextareaAutosize = createRequire(
	resolve(import.meta.dirname, 'packages/textarea-autosize/package.json'),
);
const requireFromUseLatest = createRequire(requireReactTextareaAutosize.resolve('use-latest'));
function reactTextareaAutosizeEsm(resolvedCjs) {
	return resolvedCjs.replace(/\.cjs\.js$/, '.esm.js');
}
const REACT_TEXTAREA_AUTOSIZE_USE_COMPOSED_REF = reactTextareaAutosizeEsm(
	requireReactTextareaAutosize.resolve('use-composed-ref'),
);
const REACT_TEXTAREA_AUTOSIZE_USE_LATEST = reactTextareaAutosizeEsm(
	requireReactTextareaAutosize.resolve('use-latest'),
);
const REACT_TEXTAREA_AUTOSIZE_USE_ISOMORPHIC_LAYOUT_EFFECT = reactTextareaAutosizeEsm(
	requireFromUseLatest.resolve('use-isomorphic-layout-effect'),
);
const requireTanstackStore = createRequire(
	resolve(import.meta.dirname, 'packages/tanstack-store/package.json'),
);
const requireXstate = createRequire(resolve(import.meta.dirname, 'packages/xstate/package.json'));
// The shared differential rig lives under packages/octane, whose React
// dependency can differ from this package's pinned oracle. Resolve the renderer
// and the compiled fixture to one React instance.
const XSTATE_REACT_ALIASES = [
	'react',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom',
	'react-dom/client',
].map(function pinXstateReactOracle(specifier) {
	return {
		find: new RegExp(`^${specifier.replace('/', '\\/')}$`),
		replacement: realpathSync(requireXstate.resolve(specifier)),
	};
});
const TANSTACK_STORE_REACT_ALIASES = [
	'react',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom',
	'react-dom/client',
].map(function pinTanstackStoreReactOracle(specifier) {
	return {
		find: new RegExp(`^${specifier.replace('/', '\\/')}$`),
		replacement: realpathSync(requireTanstackStore.resolve(specifier)),
	};
});

const FORMISCH_UPSTREAM_CORE = resolve(
	import.meta.dirname,
	'packages/formisch/upstream/packages/core/src',
);
const FORMISCH_UPSTREAM_METHODS = resolve(
	import.meta.dirname,
	'packages/formisch/upstream/packages/methods/src',
);

function formischAdaptedCoreMethods() {
	const mappings = [
		[FORMISCH_UPSTREAM_CORE, resolve(import.meta.dirname, 'packages/formisch/src/core')],
		[FORMISCH_UPSTREAM_METHODS, resolve(import.meta.dirname, 'packages/formisch/src/methods')],
	];
	return {
		name: 'formisch-adapted-core-methods',
		enforce: 'pre',
		resolveId(source, importer) {
			const cleanImporter = importer?.split('?')[0];
			if (cleanImporter?.endsWith('/packages/formisch/audit/adapted-core-methods.test.ts')) {
				return null;
			}
			if (
				!cleanImporter ||
				!source.startsWith('.') ||
				(!/\.test\.[cm]?[jt]sx?$/.test(cleanImporter) && !cleanImporter.includes('/vitest/'))
			) {
				return null;
			}
			const absoluteImport = resolve(dirname(cleanImporter), source);
			for (const [upstreamRoot, adaptedRoot] of mappings) {
				if (absoluteImport.startsWith(`${upstreamRoot}/`)) {
					if (absoluteImport.includes('/vitest/')) return null;
					return resolve(adaptedRoot, relative(upstreamRoot, absoluteImport));
				}
			}
			return null;
		},
	};
}

function formischReactCore() {
	return {
		name: 'formisch-react-core',
		enforce: 'pre',
		resolveId(source, importer) {
			if (!importer || source !== './framework/index.ts') return null;
			const cleanImporter = importer.split('?')[0];
			if (!cleanImporter.endsWith('/packages/formisch/upstream/packages/core/src/index.ts')) {
				return null;
			}
			return resolve(FORMISCH_UPSTREAM_CORE, 'framework/index.react.ts');
		},
	};
}

// Parser-AST immutability enforcement (see adoptParserAst in compile.js):
// every vitest invocation — including ad-hoc single-file and IDE runs — deep-
// freezes each parser AST the compiler adopts, so any in-place write fails
// with a stack at the offending line. Set here (not per-project `test.env`)
// because the octane plugin compiles fixtures in the MAIN vitest process,
// which `test.env` cannot reach; workers inherit it from this process.
// `??=` keeps an explicit OCTANE_COMPILE_FROZEN_AST=0 override working.
process.env.OCTANE_COMPILE_FROZEN_AST ??= '1';
// Origin-loc completeness (see assertNodeLocs in compile.js): every node the
// compiler prints must carry an origin location — the basis for trustworthy
// source maps and playground source↔output navigation. Same wiring and
// override convention as the freeze flag above.
process.env.OCTANE_COMPILE_ASSERT_LOC ??= '1';

const USER_APP_EVAL_PREFIX = '@octane-eval-submission/';
const USER_APP_EVAL_ALLOWED_IMPORTS = new Map([
	['@octanejs/hook-form', resolve(import.meta.dirname, 'packages/hook-form/src/index.ts')],
	['@octanejs/i18next', resolve(import.meta.dirname, 'packages/i18next/src/index.js')],
	[
		'@octanejs/tanstack-query',
		resolve(import.meta.dirname, 'packages/tanstack-query/src/index.ts'),
	],
	['@octanejs/zustand', resolve(import.meta.dirname, 'packages/zustand/src/index.ts')],
	['@tanstack/query-core', null],
	['i18next', null],
	['octane', resolve(import.meta.dirname, 'packages/octane/src/index.ts')],
	// Compiler helpers use a bounded bridge, not the export-all private runtime.
	[
		'octane/internal/client',
		resolve(import.meta.dirname, 'packages/octane-evals/tests/_client-runtime.ts'),
	],
]);
const USER_APP_EVAL_TASKS = resolve(
	import.meta.dirname,
	'packages/octane-evals/datasets/train/user-apps-v1/tasks',
);
const THREE_SOURCE = resolve(import.meta.dirname, 'packages/three/src');
const THREE_ALIASES = [
	{
		// The package predates `exports`; Vitest SSR otherwise selects its CJS
		// `main` and loads a second Three module beside the ESM test/driver graph.
		find: /^@react-three\/fiber$/,
		replacement: resolve(
			import.meta.dirname,
			'packages/three/node_modules/@react-three/fiber/dist/react-three-fiber.esm.js',
		),
	},
	{
		find: /^@octanejs\/three$/,
		replacement: resolve(THREE_SOURCE, 'index.ts'),
	},
	{
		find: /^@octanejs\/three\/core$/,
		replacement: resolve(THREE_SOURCE, 'core/index.ts'),
	},
	{
		find: /^@octanejs\/three\/renderer$/,
		replacement: resolve(THREE_SOURCE, 'renderer.ts'),
	},
	{
		find: /^@octanejs\/three\/config$/,
		replacement: resolve(THREE_SOURCE, 'config.ts'),
	},
	{
		find: /^@octanejs\/three\/testing$/,
		replacement: resolve(THREE_SOURCE, 'testing.ts'),
	},
	{
		find: /^@octanejs\/three\/intrinsics(?:\/jsx-runtime)?$/,
		replacement: resolve(THREE_SOURCE, 'intrinsics.ts'),
	},
];
const OPENTUI_SOURCE = resolve(import.meta.dirname, 'packages/opentui/src');
const OPENTUI_ALIASES = [
	{
		find: /^@octanejs\/opentui$/,
		replacement: resolve(OPENTUI_SOURCE, 'index.ts'),
	},
	{
		find: /^@octanejs\/opentui\/config$/,
		replacement: resolve(OPENTUI_SOURCE, 'config.ts'),
	},
	{
		find: /^@octanejs\/opentui\/renderer$/,
		replacement: resolve(OPENTUI_SOURCE, 'renderer.ts'),
	},
	{
		find: /^@octanejs\/opentui\/intrinsics(?:\/jsx-runtime)?$/,
		replacement: resolve(OPENTUI_SOURCE, 'intrinsics.ts'),
	},
	{
		find: /^@octanejs\/opentui\/test-utils$/,
		replacement: resolve(OPENTUI_SOURCE, 'test-utils.ts'),
	},
];
const INK_SOURCE = resolve(import.meta.dirname, 'packages/ink/src');
const INK_ALIASES = [
	{
		find: /^@octanejs\/ink$/,
		replacement: resolve(INK_SOURCE, 'index.ts'),
	},
	{
		find: /^@octanejs\/ink\/intrinsics(?:\/jsx-runtime)?$/,
		replacement: resolve(INK_SOURCE, 'intrinsics.ts'),
	},
	{
		find: /^@octanejs\/ink\/renderer$/,
		replacement: resolve(INK_SOURCE, 'renderer-entry.ts'),
	},
	{
		find: /^@octanejs\/ink\/(.*)$/,
		replacement: `${INK_SOURCE}/$1.ts`,
	},
];
const DREI_RENDERERS = {
	...THREE_RENDERERS,
	boundaries: {
		...THREE_RENDERERS.boundaries,
		'@octanejs/drei': {
			Html: { ownerRenderer: 'three', childRenderer: 'dom', prop: 'children' },
		},
	},
};
const LYNX_SOURCE = resolve(import.meta.dirname, 'packages/lynx/src');
const LYNX_ALIASES = [
	{
		find: /^@octanejs\/lynx$/,
		replacement: resolve(LYNX_SOURCE, 'index.ts'),
	},
	{
		find: /^@octanejs\/lynx\/intrinsics\/jsx-runtime$/,
		replacement: resolve(LYNX_SOURCE, 'intrinsics.ts'),
	},
	{
		find: /^@octanejs\/lynx\/(.*)$/,
		replacement: `${LYNX_SOURCE}/$1.ts`,
	},
];
const VISX_SOURCE = resolve(import.meta.dirname, 'packages/visx/src');
const VISX_ALIASES = [
	{
		find: /^@octanejs\/visx$/,
		replacement: resolve(VISX_SOURCE, 'index.ts'),
	},
	{
		find: /^@octanejs\/visx\/a11y\/server$/,
		replacement: resolve(VISX_SOURCE, 'a11y/server.ts'),
	},
	{
		find: /^@octanejs\/visx\/(.*)$/,
		replacement: `${VISX_SOURCE}/$1/index.ts`,
	},
	{
		find: /^@octanejs\/floating-ui$/,
		replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
	},
];
const STREAMDOWN_SOURCE = resolve(import.meta.dirname, 'packages/streamdown/src');
const STREAMDOWN_ALIASES = [
	{
		find: /^@octanejs\/streamdown\/code$/,
		replacement: resolve(STREAMDOWN_SOURCE, 'code.ts'),
	},
	{
		find: /^@octanejs\/streamdown\/math$/,
		replacement: resolve(STREAMDOWN_SOURCE, 'math.ts'),
	},
	{
		find: /^@octanejs\/streamdown\/mermaid$/,
		replacement: resolve(STREAMDOWN_SOURCE, 'mermaid-plugin.ts'),
	},
	{
		find: /^@octanejs\/streamdown\/cjk$/,
		replacement: resolve(STREAMDOWN_SOURCE, 'cjk.ts'),
	},
	{
		find: /^@octanejs\/streamdown$/,
		replacement: resolve(STREAMDOWN_SOURCE, 'index.tsrx'),
	},
];
// Octane's template source map contains zero-width generated segments that are
// valid in Vite but currently rejected by Vitest's Istanbul/V8 remappers. The
// Visx coverage project measures the compiled package source directly instead;
// tests and production builds retain the normal source maps.
function visxCoverageSource() {
	return {
		name: 'visx-coverage-source',
		enforce: 'post',
		transform(code, id) {
			if (!id.split('?', 1)[0].startsWith(VISX_SOURCE)) {
				return null;
			}
			return {
				code,
				map: {
					version: 3,
					sources: [id.split('?', 1)[0]],
					sourcesContent: [code],
					names: [],
					mappings: code
						.split('\n')
						.map((_, index) => (index === 0 ? 'AAAA' : 'AACA'))
						.join(';'),
				},
			};
		},
	};
}

function userAppEvalModuleIds(id) {
	let cleanId = id.split(/[?#]/, 1)[0];
	if (cleanId.startsWith('\0')) cleanId = cleanId.slice(1);
	if (cleanId.startsWith('/@fs/')) cleanId = cleanId.slice('/@fs'.length);
	if (cleanId.startsWith('file://')) {
		try {
			cleanId = fileURLToPath(cleanId);
		} catch {
			// Keep the original ID so an invalid URL cannot evade origin matching.
		}
	}

	const ids = new Set([cleanId]);
	if (isAbsolute(cleanId)) {
		const absoluteId = resolve(cleanId);
		ids.add(absoluteId);
		try {
			ids.add(realpathSync(absoluteId));
		} catch {
			// Resolution reports the useful error if the entry itself does not exist.
		}
	}
	return ids;
}

function userAppEvalSubmission() {
	const candidateEntryOrigins = new Map();
	const trackCandidateEntry = (id, origin) => {
		for (const candidateId of userAppEvalModuleIds(id)) {
			candidateEntryOrigins.set(candidateId, origin);
		}
	};
	const findCandidateEntryOrigin = (id) => {
		if (id === undefined) return undefined;
		for (const candidateId of userAppEvalModuleIds(id)) {
			const origin = candidateEntryOrigins.get(candidateId);
			if (origin !== undefined) return origin;
		}
		return undefined;
	};

	return {
		name: 'octane-user-app-eval-submission',
		enforce: 'pre',
		async resolveId(source, importer, resolveOptions) {
			const candidateOrigin = findCandidateEntryOrigin(importer);
			if (candidateOrigin !== undefined) {
				if (!USER_APP_EVAL_ALLOWED_IMPORTS.has(source)) {
					throw new Error(
						`User-app eval submission ${candidateOrigin} may not import ${JSON.stringify(source)}. ` +
							`Allowed imports: ${[...USER_APP_EVAL_ALLOWED_IMPORTS.keys()].join(', ')}`,
					);
				}
				const frameworkEntry = USER_APP_EVAL_ALLOWED_IMPORTS.get(source);
				if (frameworkEntry !== null) return frameworkEntry;
				return this.resolve(source, importer, { ...resolveOptions, skipSelf: true });
			}

			if (!source.startsWith(USER_APP_EVAL_PREFIX)) {
				const frameworkEntry = USER_APP_EVAL_ALLOWED_IMPORTS.get(source);
				return typeof frameworkEntry === 'string' ? frameworkEntry : null;
			}
			const [taskId, ...relativeParts] = source.slice(USER_APP_EVAL_PREFIX.length).split('/');
			if (
				!/^[a-z0-9][a-z0-9._-]*$/.test(taskId) ||
				relativeParts.length === 0 ||
				relativeParts.some((part) => part === '' || part === '.' || part === '..') ||
				(process.env.OCTANE_EVAL_TASK_ID !== undefined &&
					process.env.OCTANE_EVAL_TASK_ID !== taskId)
			) {
				throw new Error(`Invalid user-app eval submission import: ${source}`);
			}
			const submissionRoot = process.env.OCTANE_EVAL_SUBMISSION_ROOT;
			const taskRoot = submissionRoot
				? resolve(submissionRoot, taskId)
				: resolve(USER_APP_EVAL_TASKS, taskId, 'reference');
			const resolved = resolve(taskRoot, ...relativeParts);
			const relativePath = relative(taskRoot, resolved);
			if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
				throw new Error(`User-app eval submission import escapes its task root: ${source}`);
			}
			trackCandidateEntry(source, source);
			trackCandidateEntry(resolved, source);
			return resolved;
		},
	};
}

export default defineConfig({
	test: {
		...configDefaults,
		// This root-only option applies to every project below. For local
		// diagnostics, a CLI value such as `--silent=false` or
		// `--silent=passed-only` overrides this default.
		silent: true,
		projects: [
			...reactCompatSpikeProjects,
			...reactCompatProjects,
			...reactCompatSSRProjects,
			{
				test: {
					name: 'octane',
					include: ['packages/octane/tests/**/*.test.tsrx', 'packages/octane/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						...signalsRuntimeTests,
						'packages/octane/tests/profiling-runtime.test.tsrx',
						'packages/octane/tests/devtools-runtime.test.tsrx',
						'packages/octane/tests/devtools-transitions.test.tsrx',
						'packages/octane/tests/browser/**/*.test.ts',
						'packages/octane/tests/react-compat-spike/**',
						'packages/octane/tests/react-compat/**',
						'packages/octane/tests/react-compat-ssr.test.ts',
					],
					environment: 'jsdom',
					// Precompiles every fixture through @tsrx/react + esbuild before any
					// test loads — runs in pure Node so esbuild's TextEncoder requirements
					// are satisfied (jsdom's TextEncoder breaks esbuild's binary protocol).
					globalSetup: ['packages/octane/tests/differential/_setup.ts'],
					// Drains DEFERRED unmount passive destroys after each test so they
					// can't leak into the next test's first flush (see the file).
					setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
					globals: false,
				},
				plugins: [
					// Bindings whose `.ts` sources hand-forward hook slots do not need
					// package-specific exclusions: they declare
					// `"octane": { "hookSlots": { "manual": ["src"] } }` in their own package.json and
					// the plugin skips them automatically (nearest-manifest lookup) — the
					// same declaration covers every project below, the website, examples,
					// and builds.
					octane({
						renderers: {
							registry: {
								object: {
									module: 'octane/universal',
									text: 'host',
									capabilities: ['visibility'],
								},
							},
							boundaries: {
								'/packages/octane/tests/_fixtures/universal-owned-canvas.tsrx': {
									Canvas: {
										ownerRenderer: 'dom',
										childRenderer: 'object',
										prop: 'children',
									},
								},
								'/packages/octane/tests/_fixtures/universal-renderer-boundaries.tsrx': {
									Canvas: {
										ownerRenderer: 'dom',
										childRenderer: 'object',
										prop: 'children',
									},
								},
								'/packages/octane/tests/_fixtures/universal-renderer-boundaries.object.tsrx': {
									Html: {
										ownerRenderer: 'object',
										childRenderer: 'dom',
										prop: 'children',
									},
								},
							},
							rules: [
								{
									include: 'packages/octane/tests/_fixtures/*.object.tsrx',
									renderer: 'object',
								},
							],
						},
					}),
				],
			},
			{
				// The SAME octane test files compiled in PRODUCTION mode (`hmr: false`
				// → no HMR wrapper, no dev LOC metadata, numeric module-range hook
				// slots). Vitest runs the plugin in serve mode, so without this
				// project the prod compile branch has ZERO runtime coverage — which is
				// how the 2026-07-08 bare-Symbol() slot regression shipped past 2,400
				// green tests and broke website hydration on every route. Any test
				// that specifically asserts DEV-ONLY plugin output belongs in the
				// exclude list below (tests that call compile() with explicit flags
				// are unaffected — they control their own options).
				test: {
					name: 'octane-prod',
					include: ['packages/octane/tests/**/*.test.tsrx', 'packages/octane/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						...signalsRuntimeTests,
						// tests/compiler/ holds the suites that never mount a component: they
						// hand the compiler a source string and their own options, so the
						// plugin config and OCTANE_TEST_COMPILE_MODE above cannot reach them
						// and a second run reproduces the first one exactly. A test that
						// mounts anything does not belong in that directory.
						'packages/octane/tests/compiler/**',
						'packages/octane/tests/profiling-runtime.test.tsrx',
						'packages/octane/tests/devtools-runtime.test.tsrx',
						'packages/octane/tests/devtools-transitions.test.tsrx',
						'packages/octane/tests/browser/**/*.test.ts',
						'packages/octane/tests/react-compat-spike/**',
						'packages/octane/tests/react-compat/**',
						'packages/octane/tests/react-compat-ssr.test.ts',
					],
					environment: 'jsdom',
					globalSetup: ['packages/octane/tests/differential/_setup.ts'],
					setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
					globals: false,
					// Mode probe for the handful of tests that assert DEV-ONLY runtime
					// warnings (gated on the dev-compile __oct_loc stamp — silent in
					// prod, like React's prod bundle): they conditionalize on this.
					env: { OCTANE_TEST_COMPILE_MODE: 'prod' },
				},
				plugins: [
					octane({
						hmr: false,
						// Exercise the default production component-region transform across
						// the same behavioral suite; impure/logging fixtures fail its proof.
						renderers: {
							registry: {
								object: {
									module: 'octane/universal',
									text: 'host',
									capabilities: ['visibility'],
								},
							},
							boundaries: {
								'/packages/octane/tests/_fixtures/universal-owned-canvas.tsrx': {
									Canvas: {
										ownerRenderer: 'dom',
										childRenderer: 'object',
										prop: 'children',
									},
								},
								'/packages/octane/tests/_fixtures/universal-renderer-boundaries.tsrx': {
									Canvas: {
										ownerRenderer: 'dom',
										childRenderer: 'object',
										prop: 'children',
									},
								},
								'/packages/octane/tests/_fixtures/universal-renderer-boundaries.object.tsrx': {
									Html: {
										ownerRenderer: 'object',
										childRenderer: 'dom',
										prop: 'children',
									},
								},
							},
							rules: [
								{
									include: 'packages/octane/tests/_fixtures/*.object.tsrx',
									renderer: 'object',
								},
							],
						},
					}),
				],
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'octane-events-browser',
					include: ['packages/octane/tests/browser/**/*.test.ts'],
					exclude: [...configDefaults.exclude, ...signalsBrowserTests],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				// Focused production-semantics profiling build. Keeping this to the
				// profiling integration fixture proves the build-time define reaches both
				// full Blocks and compiler-selected lite component scopes without running
				// the entire Octane suite a third time.
				test: {
					name: 'octane-profile',
					include: [
						'packages/octane/tests/profiling-runtime.test.tsrx',
						'packages/octane/tests/devtools-runtime.test.tsrx',
						'packages/octane/tests/devtools-transitions.test.tsrx',
					],
					environment: 'jsdom',
					setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
					globals: false,
					env: { OCTANE_TEST_COMPILE_MODE: 'profile' },
				},
				plugins: [octane({ hmr: false, profile: true })],
			},
			...scopedSignalsProjects(octane, configDefaults.exclude),
			{
				// All zustand conformance (including the unstable-selector divergence)
				// stays in ordinary shards; only differential parity.test.ts is
				// react-parity-owned.
				test: {
					name: 'zustand',
					include: ['packages/zustand/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: ['packages/zustand/tests/differential/**/*.test.ts'],
					// Same differential precompile, but for zustand fixtures: also rewrites
					// `@octanejs/zustand` → `zustand` so the React side runs real zustand.
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/zustand` is the package under test; alias the public name
				// (and its subpaths) to source so fixtures import it exactly as a consumer
				// would (and the differential React side rewrites the same specifiers to
				// `zustand`). Regex aliases so `@octanejs/zustand/shallow` → src/shallow.ts
				// without the bare entry's file path swallowing the subpath.
				resolve: {
					alias: [
						{
							find: /^@octanejs\/zustand$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src/index.ts'),
						},
						{
							find: /^@octanejs\/zustand\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'rxjs',
					include: ['packages/rxjs/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: ['packages/rxjs/tests/differential/**/*.test.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/rxjs$/,
							replacement: resolve(import.meta.dirname, 'packages/rxjs/src/index.ts'),
						},
						{
							find: /^@octanejs\/rxjs\/utils$/,
							replacement: resolve(import.meta.dirname, 'packages/rxjs/src/utils/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'rxjs-differential',
					include: ['packages/rxjs/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/rxjs/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/rxjs$/,
							replacement: resolve(import.meta.dirname, 'packages/rxjs/src/index.ts'),
						},
						{
							find: /^@octanejs\/rxjs\/utils$/,
							replacement: resolve(import.meta.dirname, 'packages/rxjs/src/utils/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'better-auth',
					include: ['packages/better-auth/tests/**/*.test.ts'],
					exclude: [
						'packages/better-auth/tests/differential/**/*.test.ts',
						'packages/better-auth/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/better-auth$/,
							replacement: resolve(import.meta.dirname, 'packages/better-auth/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'better-auth-differential',
					include: ['packages/better-auth/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/better-auth/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/better-auth$/,
							replacement: resolve(import.meta.dirname, 'packages/better-auth/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'better-auth-ssr',
					include: ['packages/better-auth/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/better-auth$/,
							replacement: resolve(import.meta.dirname, 'packages/better-auth/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/valtio/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'valtio',
					include: ['packages/valtio/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: ['packages/valtio/tests/differential/**/*.test.ts'],
					globals: false,
				},

				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/valtio$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/index.ts'),
						},
						{
							find: /^@octanejs\/valtio\/react\/utils$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/react/utils.ts'),
						},
						{
							find: /^@octanejs\/valtio\/react$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/react.ts'),
						},
						{
							find: /^@octanejs\/valtio\/vanilla\/utils$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/vanilla/utils.ts'),
						},
						{
							find: /^@octanejs\/valtio\/vanilla$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/vanilla.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'dexie',
					include: ['packages/dexie/tests/**/*.test.ts'],
					exclude: [
						'packages/dexie/tests/ssr/**/*.test.ts',
						'packages/dexie/tests/browser/**/*.test.ts',
						'packages/dexie/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					setupFiles: ['packages/dexie/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/dexie$/,
							replacement: resolve(import.meta.dirname, 'packages/dexie/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'dexie-browser',
					include: ['packages/dexie/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				test: {
					name: 'dexie-ssr',
					include: ['packages/dexie/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/dexie$/,
							replacement: resolve(import.meta.dirname, 'packages/dexie/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tauri',
					include: ['packages/tauri/tests/conformance/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tauri$/,
							replacement: resolve(import.meta.dirname, 'packages/tauri/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tauri-ssr',
					include: ['packages/tauri/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tauri$/,
							replacement: resolve(import.meta.dirname, 'packages/tauri/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'electron',
					include: [
						'packages/electron/tests/conformance/**/*.test.ts',
						'packages/electron/tests/preload/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/electron$/,
							replacement: resolve(import.meta.dirname, 'packages/electron/src/renderer/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'electron-main',
					include: ['packages/electron/tests/main/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'electron-ssr',
					include: ['packages/electron/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/electron$/,
							replacement: resolve(import.meta.dirname, 'packages/electron/src/renderer/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-db',
					include: ['packages/tanstack-db/tests/**/*.test.tsx'],
					environment: 'jsdom',
					setupFiles: ['packages/tanstack-db/tests/test-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/tanstack-db` is the package under test; alias the public
				// name to source so tests can import it exactly as a consumer would.
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-db$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-db/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'jotai',
					include: ['packages/jotai/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: ['packages/jotai/tests/differential/**/*.test.ts'],
					// Same differential precompile, but for jotai fixtures: also rewrites
					// `@octanejs/jotai` → `jotai` so the React side runs real jotai.
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/jotai` is the package under test; alias the public name (and
				// its subpaths) to source so fixtures import it exactly as a consumer
				// would (and the differential React side rewrites the same specifiers to
				// `jotai`). Regex aliases so `@octanejs/jotai/vanilla/utils` →
				// src/vanilla/utils.ts without the bare entry's file path swallowing the
				// subpath.
				resolve: {
					alias: [
						{
							find: /^@octanejs\/jotai$/,
							replacement: resolve(import.meta.dirname, 'packages/jotai/src/index.ts'),
						},
						{
							find: /^@octanejs\/jotai\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/jotai/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'jotai-differential',
					include: ['packages/jotai/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for jotai fixtures: also rewrites
					// `@octanejs/jotai` → `jotai` so the React side runs real jotai.
					globalSetup: ['packages/jotai/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/jotai` is the package under test; alias the public name (and
				// its subpaths) to source so fixtures import it exactly as a consumer
				// would (and the differential React side rewrites the same specifiers to
				// `jotai`). Regex aliases so `@octanejs/jotai/vanilla/utils` →
				// src/vanilla/utils.ts without the bare entry's file path swallowing the
				// subpath.
				resolve: {
					alias: [
						{
							find: /^@octanejs\/jotai$/,
							replacement: resolve(import.meta.dirname, 'packages/jotai/src/index.ts'),
						},
						{
							find: /^@octanejs\/jotai\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/jotai/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Mixed Octane-only conformance/divergence suite — keep out of the
				// react-parity group so ordinary shards still own these files.
				// Parity-owned evidence lives in `nuqs-differential` only.
				test: {
					name: 'nuqs',
					include: ['packages/nuqs/tests/**/*.test.ts'],
					exclude: [
						'packages/nuqs/tests/ssr/**/*.test.ts',
						'packages/nuqs/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/nuqs` is the package under test; alias the public name and
				// its subpaths (`./server`, `./testing`, `./adapters/*`) to source so
				// fixtures import it exactly as a consumer would. The `/server` alias is
				// listed before the catch-all because it maps to `index.server.ts`, not
				// `server.ts`; the regex catch-all then maps `@octanejs/nuqs/adapters/react`
				// -> `src/adapters/react.ts` without the bare entry swallowing the subpath.
				resolve: {
					alias: [
						{
							find: /^@octanejs\/nuqs$/,
							replacement: resolve(import.meta.dirname, 'packages/nuqs/src/index.ts'),
						},
						{
							find: /^@octanejs\/nuqs\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/nuqs/src/index.server.ts'),
						},
						{
							find: /^@octanejs\/nuqs\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/nuqs/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Octane-only unpaired conformance for @octanejs/inertia.
				// Parity-owned adapted / differential projects are separate.
				test: {
					name: 'inertia',
					include: ['packages/inertia/tests/**/*.test.ts'],
					exclude: [
						'packages/inertia/tests/ssr/**/*.test.ts',
						'packages/inertia/tests/adapted/**/*.test.ts',
						'packages/inertia/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/inertia$/,
							replacement: resolve(import.meta.dirname, 'packages/inertia/src/index.ts'),
						},
						{
							find: /^@octanejs\/inertia\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/inertia/src/server.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'inertia-adapted',
					include: ['packages/inertia/tests/adapted/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/inertia$/,
							replacement: resolve(import.meta.dirname, 'packages/inertia/src/index.ts'),
						},
						{
							find: /^@octanejs\/inertia\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/inertia/src/server.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'inertia-differential',
					include: ['packages/inertia/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/inertia/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/inertia$/,
							replacement: resolve(import.meta.dirname, 'packages/inertia/src/index.ts'),
						},
						{
							find: /^@octanejs\/inertia\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/inertia/src/server.ts'),
						},
						{
							find: /^inertia-page-context$/,
							replacement: resolve(import.meta.dirname, 'packages/inertia/src/PageContext.ts'),
						},
					],
				},
			},
			{
				// Octane-only unpaired SSR framework contracts; ordinary shards only.
				test: {
					name: 'inertia-ssr',
					include: ['packages/inertia/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/inertia$/,
							replacement: resolve(import.meta.dirname, 'packages/inertia/src/index.ts'),
						},
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'i18next',
					include: ['packages/i18next/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/i18next/tests/differential/**/*.test.ts',
						'packages/i18next/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					setupFiles: ['packages/i18next/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/i18next$/,
							replacement: resolve(import.meta.dirname, 'packages/i18next/src/index.js'),
						},
						{
							find: /^@octanejs\/i18next\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/i18next/src') + '/$1.js',
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'i18next-differential',
					include: ['packages/i18next/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/i18next/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/i18next$/,
							replacement: resolve(import.meta.dirname, 'packages/i18next/src/index.js'),
						},
						{
							find: /^@octanejs\/i18next\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/i18next/src') + '/$1.js',
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'i18next-ssr',
					include: ['packages/i18next/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/i18next$/,
							replacement: resolve(import.meta.dirname, 'packages/i18next/src/index.js'),
						},
						{
							find: /^@octanejs\/i18next\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/i18next/src') + '/$1.js',
						},
					],
				},
			},
			{
				test: {
					name: 'usehooks-ts',
					include: ['packages/usehooks-ts/tests/**/*.test.ts'],
					exclude: [
						'packages/usehooks-ts/tests/ssr.test.ts',
						'packages/usehooks-ts/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					// hydration.test.ts boots a real Vite server and SSR-compiles its fixture
					// inside the test body; keep the same 30s headroom as the other binding
					// hydration projects so a loaded CI shard does not hit the 5s default.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/usehooks-ts$/,
							replacement: resolve(import.meta.dirname, 'packages/usehooks-ts/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'usehooks-ts-differential',
					include: ['packages/usehooks-ts/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/usehooks-ts/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/usehooks-ts$/,
							replacement: resolve(import.meta.dirname, 'packages/usehooks-ts/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'usehooks-ts-ssr',
					include: ['packages/usehooks-ts/tests/ssr.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/usehooks-ts$/,
							replacement: resolve(import.meta.dirname, 'packages/usehooks-ts/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tanstack-hotkeys-pristine',
					include: ['packages/tanstack-hotkeys/tests/upstream-original.test.ts'],
					environment: 'node',
					sequence: { groupOrder: 1 },
					globals: false,
				},
			},
			{
				test: {
					name: 'animejs',
					include: ['packages/animejs/tests/**/*.test.ts'],
					exclude: ['packages/animejs/tests/ssr.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane({ renderers: THREE_RENDERERS })],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/animejs$/,
							replacement: resolve(import.meta.dirname, 'packages/animejs/src/index.ts'),
						},
						{
							find: /^@octanejs\/animejs\/adapters\/three$/,
							replacement: resolve(import.meta.dirname, 'packages/animejs/src/adapters/three.ts'),
						},
					],
					dedupe: ['three'],
				},
			},
			{
				test: {
					name: 'animejs-ssr',
					include: ['packages/animejs/tests/ssr.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/animejs$/,
							replacement: resolve(import.meta.dirname, 'packages/animejs/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/tanstack-hotkeys/tests/upstream/**/*.test.ts',
						'packages/tanstack-hotkeys/tests/upstream/**/*.test.tsx',
					],
				},
				test: {
					name: 'tanstack-hotkeys',
					include: [
						'packages/tanstack-hotkeys/tests/**/*.test.ts',
						'packages/tanstack-hotkeys/tests/upstream/**/*.test.tsx',
					],
					exclude: [
						'packages/tanstack-hotkeys/tests/upstream-original.test.ts',
						'packages/tanstack-hotkeys/tests/differential/**/*.test.ts',
						'packages/tanstack-hotkeys/tests/parity/**/*.test.ts',
					],
					environment: 'jsdom',
					setupFiles: ['packages/tanstack-hotkeys/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-hotkeys$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-hotkeys/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-hotkeys-differential',
					include: ['packages/tanstack-hotkeys/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-hotkeys/tests/differential/_setup.ts'],
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-hotkeys$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-hotkeys/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-hotkeys-parity-audit',
					include: ['packages/tanstack-hotkeys/tests/parity/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'tanstack-pacer',
					include: [
						'packages/tanstack-pacer/tests/**/*.test.ts',
						'!packages/tanstack-pacer/tests/adapted/**/*.test.ts',
						'!packages/tanstack-pacer/tests/differential/**/*.test.ts',
						'!packages/tanstack-pacer/tests/parity/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-pacer$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-pacer/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-pacer\/(.*)$/,
							replacement:
								resolve(import.meta.dirname, 'packages/tanstack-pacer/src') + '/$1/index.ts',
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'solana-kit',
					include: ['packages/solana-kit/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/solana-kit/tests/upstream/**/*.test.ts',
						'packages/solana-kit/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/solana-kit$/,
							replacement: resolve(import.meta.dirname, 'packages/solana-kit/src/index.ts'),
						},
						{
							find: /^@octanejs\/solana-kit\/query$/,
							replacement: resolve(import.meta.dirname, 'packages/solana-kit/src/query.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'solana-kit-adapted',
					include: ['packages/solana-kit/tests/upstream/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/solana-kit$/,
							replacement: resolve(import.meta.dirname, 'packages/solana-kit/src/index.ts'),
						},
						{
							find: /^@octanejs\/solana-kit\/query$/,
							replacement: resolve(import.meta.dirname, 'packages/solana-kit/src/query.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'solana-kit-pristine',
					include: ['packages/solana-kit/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/waypoint/tests/hydration/hydration.test.ts',
						'packages/waypoint/tests/waypoint.test.ts',
					],
				},
				test: {
					name: 'waypoint',
					include: ['packages/waypoint/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/waypoint/tests/browser/**/*.test.ts',
						'packages/waypoint/tests/differential/**/*.test.ts',
						'packages/waypoint/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/waypoint$/,
							replacement: resolve(import.meta.dirname, 'packages/waypoint/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'waypoint-differential',
					include: ['packages/waypoint/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/waypoint/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/waypoint$/,
							replacement: resolve(import.meta.dirname, 'packages/waypoint/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'waypoint-ssr',
					include: ['packages/waypoint/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/waypoint$/,
							replacement: resolve(import.meta.dirname, 'packages/waypoint/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'waypoint-browser',
					include: ['packages/waypoint/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 30_000,
					hookTimeout: 30_000,
				},
			},
			{
				test: {
					name: 'seo',
					include: ['packages/seo/tests/**/*.test.ts'],
					exclude: [...configDefaults.exclude, 'packages/seo/tests/ssr/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/seo$/,
							replacement: resolve(import.meta.dirname, 'packages/seo/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'email',
					include: ['packages/email/tests/**/*.test.ts'],
					exclude: ['packages/email/tests/differential/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^octane\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/email/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'email-differential',
					include: ['packages/email/tests/differential/**/*.test.ts'],
					environment: 'node',
					globalSetup: ['packages/email/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^octane\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/email$/,
							replacement: resolve(import.meta.dirname, 'packages/email/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'email-cli',
					include: ['packages/email-cli/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				// SSR half: the whole graph compiles in SERVER mode and bare `octane`
				// imports resolve to `octane/server`, so the package's plain-.ts hooks
				// run against the server runtime the compiled components use.
				test: {
					name: 'seo-ssr',
					include: ['packages/seo/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^octane\/static$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/static/index.ts'),
						},
						{
							find: /^octane\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/seo$/,
							replacement: resolve(import.meta.dirname, 'packages/seo/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'livestore-pristine',
					include: ['packages/livestore/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/livestore/tests/document-sync.test.ts',
						'packages/livestore/tests/lifecycle.test.ts',
						'packages/livestore/tests/query.test.ts',
					],
				},
				test: {
					name: 'livestore',
					include: ['packages/livestore/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/livestore/tests/ssr/**/*.test.ts',
						'packages/livestore/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/livestore\/experimental$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/livestore/src/experimental/mod.ts',
							),
						},
						{
							find: /^@octanejs\/livestore$/,
							replacement: resolve(import.meta.dirname, 'packages/livestore/src/mod.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'livestore-ssr',
					include: ['packages/livestore/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/livestore\/experimental$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/livestore/src/experimental/mod.ts',
							),
						},
						{
							find: /^@octanejs\/livestore$/,
							replacement: resolve(import.meta.dirname, 'packages/livestore/src/mod.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/tanstack-store/tests/conformance/upstream-index.test.ts'],
				},
				test: {
					name: 'tanstack-store',
					include: [
						'packages/tanstack-store/tests/conformance/**/*.test.ts',
						'packages/tanstack-store/tests/differential/setup.test.ts',
					],
					exclude: [
						...configDefaults.exclude,
						'packages/tanstack-store/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					setupFiles: ['packages/tanstack-store/tests/conformance/test-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-store-ssr',
					include: ['packages/tanstack-store/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				// Octane-only conformance for the xstate-store binding: hook-slot
				// independence across selector call sites, selector bail-out, and the
				// stable-instance contracts for useStore/useAtomState. Parity-owned
				// lanes are registered separately.
				testExecution: {
					group: 'react-parity',
					include: ['packages/xstate-store/tests/conformance/upstream-*.test.ts'],
				},
				test: {
					name: 'xstate-store',
					include: ['packages/xstate-store/tests/conformance/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/xstate-store$/,
							replacement: resolve(import.meta.dirname, 'packages/xstate-store/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Octane-only conformance for the xstate binding: hook-slot
				// independence across member-form call sites, selector bail-out, and
				// actor lifecycle — none of which the differential rig can observe
				// through innerHTML. Parity-owned lanes are registered separately.
				testExecution: {
					group: 'react-parity',
					include: ['packages/xstate/tests/conformance/upstream-*.test.ts'],
				},
				test: {
					name: 'xstate',
					include: ['packages/xstate/tests/conformance/**/*.test.ts'],
					environment: 'jsdom',
					setupFiles: ['packages/xstate/tests/conformance/test-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/xstate$/,
							replacement: resolve(import.meta.dirname, 'packages/xstate/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Faithful adapted upstream wrappers are parity-owned. StrictMode
				// divergences, repository-only regressions, and other Octane-only
				// conformance stay in the ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/tanstack-form/tests/conformance/createFormHook.test.ts',
						'packages/tanstack-form/tests/conformance/useField.test.ts',
						'packages/tanstack-form/tests/conformance/useForm.test.ts',
						'packages/tanstack-form/tests/conformance/useFormGroup.test.ts',
					],
				},
				test: {
					name: 'tanstack-form',
					include: ['packages/tanstack-form/tests/conformance/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/tanstack-form/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					setupFiles: ['packages/tanstack-form/tests/conformance/test-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-form$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-form/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-form-ssr',
					include: ['packages/tanstack-form/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-form$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-form/src/index.ts'),
						},
					],
				},
			},
			{
				// Package-authored TanStack AI contracts stay ordinary. Parity owns
				// only the dedicated differential project below.
				test: {
					name: 'tanstack-ai',
					include: [
						'packages/tanstack-ai/tests/conformance/**/*.test.ts',
						'packages/tanstack-ai/tests/conformance/**/*.test.tsx',
					],
					environment: 'jsdom',
					setupFiles: ['packages/tanstack-ai/tests/conformance/test-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-ai$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-ai/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-ai-ssr',
					include: ['packages/tanstack-ai/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-ai$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-ai/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-devtools',
					include: ['packages/tanstack-devtools/tests/conformance/**/*.test.ts'],
					environment: 'jsdom',
					setupFiles: ['packages/tanstack-devtools/tests/conformance/test-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-devtools$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-devtools/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-devtools-ssr',
					include: ['packages/tanstack-devtools/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-devtools$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-devtools/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'devtools',
					include: ['packages/devtools/tests/**/*.test.{ts,tsx}'],
					environment: 'jsdom',
					// The @tanstack/devtools-event-client index folds to a no-op unless
					// NODE_ENV === 'development'; the plugin only runs in dev anyway.
					env: { NODE_ENV: 'development' },
					// Starts a ClientEventBus so emit()/on() deliver over the window bus
					// (the devtools host provides it in production).
					setupFiles: ['packages/devtools/tests/setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/devtools$/,
							replacement: resolve(import.meta.dirname, 'packages/devtools/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Mixed project: conformance + package tests stay in ordinary shards;
				// parity-legacy-api is owned by react-parity so it executes once via
				// react-parity:check (same file-granular pattern as apollo-client/livestore).
				testExecution: {
					group: 'react-parity',
					include: ['packages/tanstack-table/tests/conformance/parity-legacy-api.test.ts'],
				},
				test: {
					name: 'tanstack-table',
					include: ['packages/tanstack-table/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: ['packages/tanstack-table/tests/differential/**/*.test.ts'],
					// Same differential precompile, but for table fixtures: also rewrites
					// `@octanejs/tanstack-table` → `@tanstack/react-table` so the React side
					// runs the real react-table adapter over the SAME table-core.
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/tanstack-table` is the package under test; alias the public
				// name (and subpaths) to source so fixtures import it exactly as a
				// consumer would (and the differential React side rewrites the same
				// specifiers to `@tanstack/react-table`).
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-table$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-table/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-table\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-table/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'remix-router',
					include: ['packages/remix-router/tests/conformance/**/*.test.ts'],
					exclude: ['packages/remix-router/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for router fixtures: also rewrites
					// `@octanejs/remix-router` → `react-router` so the React side runs the
					// real react-router adapter over the SAME (vendored-equal) core.
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/remix-router` is the package under test; alias the public
				// name (and subpaths — `/dom` → src/dom.ts) to source so fixtures import
				// it exactly as a consumer would (and the differential React side
				// rewrites the same specifiers to `react-router`).
				resolve: {
					alias: [
						{
							find: /^@octanejs\/remix-router$/,
							replacement: resolve(import.meta.dirname, 'packages/remix-router/src/index.ts'),
						},
						{
							find: /^@octanejs\/remix-router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/remix-router/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Static SSR (Phase F): the whole graph compiles in SERVER mode
				// (`octane({ ssr: true })`) and bare `octane` imports resolve to
				// `octane/server` (the website's octane-ssr-server-alias pattern) so
				// the binding's plain-.ts hooks run against the server runtime.
				// Node environment; the React side renders via react-dom/server over
				// an isolated SSR cache so concurrent client setup cannot delete it.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'remix-router-ssr',
					include: ['packages/remix-router/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globalSetup: ['packages/remix-router/tests/differential/_setup-ssr.ts'],
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/remix-router$/,
							replacement: resolve(import.meta.dirname, 'packages/remix-router/src/index.ts'),
						},
						{
							find: /^@octanejs\/remix-router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/remix-router/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// The vendored react-router core's own upstream unit tests — a
				// VENDOR-INTEGRITY gate (loaders/redirects/interruptions driven with
				// zero React/octane involved). Pure node environment; no octane plugin.
				test: {
					name: 'remix-router-core',
					include: ['packages/remix-router/tests/vendored-core/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				// Ordinary package suite: nested-flush and other Octane-only contracts
				// stay here. Provenance is recorded-unverified, so nothing is
				// react-parity-owned until a verified harness can execute it.
				test: {
					name: 'tanstack-virtual',
					include: ['packages/tanstack-virtual/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: [
						'packages/tanstack-virtual/tests/differential/**/*.test.ts',
						'packages/tanstack-virtual/tests/ssr/**/*.test.ts',
					],
					// jsdom affordances virtual-core needs (no-op ResizeObserver,
					// Element.scrollTo shim, MAX_SAFE_INTEGER scroll dimensions).
					setupFiles: ['packages/tanstack-virtual/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/tanstack-virtual` is the package under test; alias the
				// public name (and subpaths) to source so fixtures import it exactly as
				// a consumer would (and the differential React side rewrites the same
				// specifiers to `@tanstack/react-virtual`).
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-virtual$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-virtual/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-virtual\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-virtual/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'wagmi',
					include: ['packages/wagmi/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: ['packages/wagmi/tests/differential/**/*.test.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/wagmi$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src/index.ts'),
						},
						{
							find: /^@octanejs\/wagmi\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'wagmi-differential',
					include: ['packages/wagmi/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Dual-runtime mount + async mock connect can exceed Vitest's 5s
					// default under full-suite shard contention (same headroom as
					// dnd-kit-differential).
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globalSetup: ['packages/wagmi/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/wagmi$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src/index.ts'),
						},
						{
							find: /^@octanejs\/wagmi\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'rainbowkit',
					include: [
						'packages/rainbowkit/tests/**/*.test.ts',
						'!packages/rainbowkit/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					exclude: ['packages/rainbowkit/tests/differential/**/*.test.ts'],
					// hydration.test.ts boots a real Vite server and SSR-compiles its fixture
					// inside the test body (same helper as apollo-client/base-ui); keep the
					// same 30s headroom so a loaded CI shard doesn't overrun Vitest's 5s default.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/rainbowkit$/,
							replacement: resolve(import.meta.dirname, 'packages/rainbowkit/src/index.ts'),
						},
						{
							find: /^@octanejs\/rainbowkit\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/rainbowkit/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/wagmi$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src/index.ts'),
						},
						{
							find: /^@octanejs\/wagmi\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'rainbowkit-differential',
					globalSetup: ['packages/rainbowkit/tests/differential/_setup.ts'],
					include: ['packages/rainbowkit/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// hydration.test.ts boots a real Vite server and SSR-compiles its fixture
					// inside the test body (same helper as apollo-client/base-ui); keep the
					// same 30s headroom so a loaded CI shard doesn't overrun Vitest's 5s default.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/rainbowkit$/,
							replacement: resolve(import.meta.dirname, 'packages/rainbowkit/src/index.ts'),
						},
						{
							find: /^@octanejs\/rainbowkit\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/rainbowkit/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/wagmi$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src/index.ts'),
						},
						{
							find: /^@octanejs\/wagmi\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'rainbowkit-ssr',
					include: ['packages/rainbowkit/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/rainbowkit$/,
							replacement: resolve(import.meta.dirname, 'packages/rainbowkit/src/index.ts'),
						},
						{
							find: /^@octanejs\/wagmi$/,
							replacement: resolve(import.meta.dirname, 'packages/wagmi/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-query',
					include: ['packages/tanstack-query/tests/conformance/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-query$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-query\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Adapted upstream wrappers are owned by react-parity; conformance and
				// hydration stay in ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/apollo-client/tests/conformance/upstream-ApolloProvider.test.ts',
						'packages/apollo-client/tests/conformance/upstream-useApolloClient.test.ts',
					],
				},
				test: {
					name: 'apollo-client',
					include: [
						'packages/apollo-client/tests/**/*.test.ts',
						'!packages/apollo-client/tests/ssr/**/*.test.ts',
					],
					exclude: ['packages/apollo-client/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					setupFiles: ['packages/apollo-client/tests/conformance/test-setup.ts'],
					// hydration.test.ts boots a real Vite server and SSR-compiles its fixture
					// inside the test body (same helper as base-ui/aria); keep the same 30s
					// headroom so a loaded CI shard doesn't overrun the 5s vitest default.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/apollo-client\/react\/ssr$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/ssr/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/testing\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/testing/react/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/react\/internal$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/internal/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/testing$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/testing/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client$/,
							replacement: resolve(import.meta.dirname, 'packages/apollo-client/src/index.js'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Differential lane: precompiles fixtures for the published React oracle.
				// Only the manifest-backed parity file is owned by react-parity; setup.test.ts
				// stays in ordinary CI via the project include.
				testExecution: {
					group: 'react-parity',
					include: ['packages/apollo-client/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'apollo-client-differential',
					include: ['packages/apollo-client/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/apollo-client/tests/differential/_setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/apollo-client\/react\/ssr$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/ssr/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/testing\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/testing/react/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/react\/internal$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/internal/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/testing$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/testing/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client$/,
							replacement: resolve(import.meta.dirname, 'packages/apollo-client/src/index.js'),
						},
					],
				},
			},
			{
				test: {
					name: 'apollo-client-ssr',
					include: ['packages/apollo-client/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/apollo-client\/react\/ssr$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/ssr/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/react\/internal$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/internal/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/apollo-client/src/react/index.js',
							),
						},
						{
							find: /^@octanejs\/apollo-client$/,
							replacement: resolve(import.meta.dirname, 'packages/apollo-client/src/index.js'),
						},
					],
				},
			},
			{
				// Octane-only conformance stays in ordinary shards; differential
				// parity lives in the react-parity-owned project below.
				test: {
					name: 'redux',
					include: ['packages/redux/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: ['packages/redux/tests/differential/**/*.test.ts'],
					// Differential precompile: rewrites `@octanejs/redux` →
					// `react-redux` so the React side runs the real binding.
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/redux$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src/index.ts'),
						},
						{
							find: /^@octanejs\/redux\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Parity-owned: packages/redux/audit/react-parity.json requires this
				// project as the redux-runtime-differential lane. Ordinary Octane-only
				// redux tests stay in the separate `redux` project above.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'redux-differential',
					include: ['packages/redux/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile: rewrites `@octanejs/redux` →
					// `react-redux` so the React side runs the real binding.
					globalSetup: ['packages/redux/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/redux$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src/index.ts'),
						},
						{
							find: /^@octanejs\/redux\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'redux-toolkit',
					include: ['packages/redux-toolkit/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/redux-toolkit/tests/ssr/**/*.test.ts',
						'packages/redux-toolkit/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					// Differential fixtures rewrite the octane Toolkit and Redux
					// bindings to their real React counterparts.
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/redux-toolkit\/query\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/redux-toolkit/src/query/react/index.ts',
							),
						},
						{
							find: /^@octanejs\/redux-toolkit\/query$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/redux-toolkit/src/query/index.ts',
							),
						},
						{
							find: /^@octanejs\/redux-toolkit\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/redux-toolkit/src/react/index.ts',
							),
						},
						{
							find: /^@octanejs\/redux-toolkit$/,
							replacement: resolve(import.meta.dirname, 'packages/redux-toolkit/src/index.ts'),
						},
						{
							find: /^@octanejs\/redux$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'redux-toolkit-differential',
					include: ['packages/redux-toolkit/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Differential fixtures rewrite the octane Toolkit and Redux
					// bindings to their real React counterparts.
					globalSetup: ['packages/redux-toolkit/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/redux-toolkit\/query\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/redux-toolkit/src/query/react/index.ts',
							),
						},
						{
							find: /^@octanejs\/redux-toolkit\/query$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/redux-toolkit/src/query/index.ts',
							),
						},
						{
							find: /^@octanejs\/redux-toolkit\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/redux-toolkit/src/react/index.ts',
							),
						},
						{
							find: /^@octanejs\/redux-toolkit$/,
							replacement: resolve(import.meta.dirname, 'packages/redux-toolkit/src/index.ts'),
						},
						{
							find: /^@octanejs\/redux$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'redux-toolkit-ssr',
					include: ['packages/redux-toolkit/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/redux-toolkit\/query\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/redux-toolkit/src/query/react/index.ts',
							),
						},
						{
							find: /^@octanejs\/redux-toolkit$/,
							replacement: resolve(import.meta.dirname, 'packages/redux-toolkit/src/index.ts'),
						},
						{
							find: /^@octanejs\/redux$/,
							replacement: resolve(import.meta.dirname, 'packages/redux/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'react-resizable-panels-pristine',
					include: ['packages/resizable-panels/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				// Adapted upstream suite owns tests/upstream/**; conformance and
				// hydration persistence contracts are Octane-only and stay in the
				// ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: ['packages/resizable-panels/tests/upstream/**/*.test.{ts,tsx,tsrx}'],
				},
				test: {
					name: 'resizable-panels',
					include: ['packages/resizable-panels/tests/**/*.test.{ts,tsx,tsrx}'],
					exclude: [
						'packages/resizable-panels/tests/browser/**',
						'packages/resizable-panels/tests/differential/**',
						'packages/resizable-panels/tests/ssr/**',
						'packages/resizable-panels/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/resizable-panels$/,
							replacement: resolve(import.meta.dirname, 'packages/resizable-panels/src/index.tsrx'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'resizable-panels-differential',
					include: ['packages/resizable-panels/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/resizable-panels$/,
							replacement: resolve(import.meta.dirname, 'packages/resizable-panels/src/index.tsrx'),
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'resizable-panels-browser',
					include: ['packages/resizable-panels/tests/browser/**/*.browser.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				test: {
					name: 'resizable-panels-server',
					include: ['packages/resizable-panels/tests/**/*.server.test.{ts,tsx,tsrx}'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/resizable-panels$/,
							replacement: resolve(import.meta.dirname, 'packages/resizable-panels/src/index.tsrx'),
						},
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'formisch-pristine-core',
					include: ['packages/formisch/upstream/packages/core/src/**/*.test.ts'],
					environment: 'jsdom',
					setupFiles: ['packages/formisch/upstream/packages/core/src/vitest/setup.ts'],
					globals: false,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'formisch-pristine-methods',
					include: ['packages/formisch/upstream/packages/methods/src/**/*.test.ts'],
					environment: 'jsdom',
					setupFiles: ['packages/formisch/audit/pristine-react-core-setup.ts'],
					globals: false,
				},
				plugins: [formischReactCore()],
				resolve: {
					alias: [
						{
							find: /^@formisch\/core(?:\/react)?$/,
							replacement: resolve(FORMISCH_UPSTREAM_CORE, 'index.ts'),
						},
						{
							find: './framework/index.ts',
							replacement: resolve(FORMISCH_UPSTREAM_CORE, 'framework/index.react.ts'),
						},
						{
							find: resolve(FORMISCH_UPSTREAM_CORE, 'framework/index.ts'),
							replacement: resolve(FORMISCH_UPSTREAM_CORE, 'framework/index.react.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'formisch-pristine-react',
					include: ['packages/formisch/upstream/frameworks/react/src/**/*.test.tsx'],
					environment: 'jsdom',
					setupFiles: [
						'packages/formisch/audit/pristine-react-core-setup.ts',
						'packages/formisch/upstream/frameworks/react/src/vitest/setup.ts',
					],
					globals: false,
				},
				plugins: [formischReactCore()],
				resolve: {
					alias: [
						{
							find: /^@formisch\/core(?:\/react)?$/,
							replacement: resolve(FORMISCH_UPSTREAM_CORE, 'index.ts'),
						},
						{
							find: /^@formisch\/methods(?:\/react)?$/,
							replacement: resolve(FORMISCH_UPSTREAM_METHODS, 'index.ts'),
						},
						{
							find: './framework/index.ts',
							replacement: resolve(FORMISCH_UPSTREAM_CORE, 'framework/index.react.ts'),
						},
						{
							find: resolve(FORMISCH_UPSTREAM_CORE, 'framework/index.ts'),
							replacement: resolve(FORMISCH_UPSTREAM_CORE, 'framework/index.react.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'formisch-adapted-core-methods',
					include: ['packages/formisch/audit/adapted-core-methods.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [formischAdaptedCoreMethods()],
				resolve: {
					alias: [
						{
							find: /^@formisch\/core(?:\/react)?$/,
							replacement: resolve(import.meta.dirname, 'packages/formisch/src/core/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'formisch-adapted-resolver-canary',
					include: ['packages/formisch/audit/resolver-canary/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [formischAdaptedCoreMethods()],
				resolve: {
					alias: [
						{
							find: /^@formisch\/core(?:\/react)?$/,
							replacement: resolve(import.meta.dirname, 'packages/formisch/src/core/index.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/formisch/tests/upstream/**/*.test.tsrx'],
				},
				test: {
					name: 'formisch',
					include: [
						'packages/formisch/tests/conformance/**/*.test.ts',
						'packages/formisch/tests/hydration/**/*.test.ts',
						'packages/formisch/tests/upstream/**/*.test.tsrx',
					],
					exclude: [...configDefaults.exclude, 'packages/formisch/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					setupFiles: ['packages/formisch/tests/conformance/test-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/formisch$/,
							replacement: resolve(import.meta.dirname, 'packages/formisch/src/index.ts'),
						},
						{
							find: /^@octanejs\/formisch\/core$/,
							replacement: resolve(import.meta.dirname, 'packages/formisch/src/core/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'formisch-differential',
					include: ['packages/formisch/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Rewrites the fixture imports so the React side runs real @formisch/react.
					globalSetup: ['packages/formisch/tests/differential/_setup.ts'],
					setupFiles: ['packages/formisch/tests/conformance/test-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/formisch$/,
							replacement: resolve(import.meta.dirname, 'packages/formisch/src/index.ts'),
						},
						{
							find: /^@octanejs\/formisch\/core$/,
							replacement: resolve(import.meta.dirname, 'packages/formisch/src/core/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'formisch-ssr',
					include: ['packages/formisch/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/formisch$/,
							replacement: resolve(import.meta.dirname, 'packages/formisch/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'hook-form-pristine',
					include: ['packages/hook-form/tests/upstream-original.test.ts'],
					environment: 'node',
					sequence: { groupOrder: 1 },
					globals: false,
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/hook-form/tests/upstream/**/*.test.ts',
						'packages/hook-form/tests/upstream/**/*.test.tsx',
					],
				},
				test: {
					name: 'hook-form',
					include: [
						'packages/hook-form/tests/**/*.test.ts',
						'packages/hook-form/tests/**/*.test.tsx',
					],
					exclude: [
						...configDefaults.exclude,
						'packages/hook-form/tests/**/*.server.test.tsx',
						'packages/hook-form/tests/upstream-original.test.ts',
						'packages/hook-form/tests/differential/**/*.test.ts',
						'packages/hook-form/tests/differential/**/*.test.tsx',
					],
					environment: 'jsdom',
					// The ported upstream suite uses @testing-library/jest-dom matchers
					// (toBeVisible, toBeInTheDocument, …) — same as react-hook-form's own
					// jest setup. clear/reset/restore mirror upstream's jest config so
					// spy state never leaks between ported tests.
					setupFiles: ['packages/hook-form/tests/_setup.ts'],
					clearMocks: true,
					mockReset: true,
					restoreMocks: true,
					globals: true,
				},
				// hook-form's `.ts` hooks are auto-slotted (same as redux); the
				// testing-library the ported suite mounts through is NOT (its harness
				// calls hooks with explicit slot symbols — declared in its package.json,
				// so the plugin skips it automatically).
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/hook-form$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src/index.ts'),
						},
						{
							find: /^@octanejs\/hook-form\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'hook-form-differential',
					include: [
						'packages/hook-form/tests/differential/**/*.test.ts',
						'packages/hook-form/tests/differential/**/*.test.tsx',
					],
					environment: 'jsdom',
					// Rewrites the fixture imports so the React side runs the real binding.
					globalSetup: ['packages/hook-form/tests/differential/_setup.ts'],
					setupFiles: ['packages/hook-form/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/hook-form$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src/index.ts'),
						},
						{
							find: /^@octanejs\/hook-form\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				// react-hook-form's own jest config runs `*.server.test.tsx` in a
				// node environment; same split here — node transform mode also makes
				// the octane plugin compile in `mode: 'server'`, which the server
				// renderer (renderToStaticMarkup) requires.
				test: {
					name: 'hook-form-server',
					include: ['packages/hook-form/tests/**/*.server.test.tsx'],
					environment: 'node',
					globals: true,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/hook-form$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src/index.ts'),
						},
						{
							find: /^@octanejs\/hook-form\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/hook-form/src') + '/$1.ts',
						},
						{
							// The binding's plain `.ts` sources import hooks from 'octane'
							// (the CLIENT runtime). Under this node/SSR project the server
							// renderer drives the components, so those imports must resolve
							// to the SERVER runtime's hook implementations — same module
							// instance the server-compiled .tsrx components use
							// ('octane/server' emissions are untouched by this bare alias).
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'recharts',
					include: ['packages/recharts/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: ['packages/recharts/tests/differential/**/*.test.ts'],
					// The differential oracle (real recharts + vendored d3) is expensive
					// to load and charts settle over many raf rounds — slow CI runners
					// can spend more than 30s transforming the oracle while the build
					// integration projects saturate the machine.
					testTimeout: 60_000,
					// Differential precompile for recharts fixtures: rewrites
					// `@octanejs/recharts` → `recharts` so the React side runs the real
					// recharts as the byte-for-byte SVG oracle.
					globals: false,
					// Inline the oracle so it resolves the SAME module graph a real
					// bundled app does: recharts has no exports map, so externalized
					// node loading takes its CJS `main` → victory-vendor's `require`
					// condition → the vendored PRE-3.2 d3-shape build (full-precision
					// paths). Inlined, both sides take the `import` condition →
					// victory-vendor/es → real d3-shape@3.2 (3-digit path rounding).
					server: {
						deps: {
							inline: ['recharts', 'victory-vendor'],
						},
					},
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/recharts$/,
							replacement: resolve(import.meta.dirname, 'packages/recharts/src/index.ts'),
						},
						{
							find: /^@octanejs\/recharts\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/recharts/src') + '/$1.ts',
						},
						{
							// SSR resolution ignores the `module` field, so bare 'recharts'
							// would enter through its CJS `main` even when inlined — send it
							// to the es6 build explicitly (no exports map, deep path is legal)
							// so the oracle runs the same ESM graph a bundled app runs.
							find: /^recharts$/,
							replacement: 'recharts/es6/index.js',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'recharts-differential',
					include: ['packages/recharts/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// The differential oracle (real recharts + vendored d3) is expensive
					// to load and charts settle over many raf rounds — slow CI runners
					// can spend more than 30s transforming the oracle while the build
					// integration projects saturate the machine.
					testTimeout: 60_000,
					// Differential precompile for recharts fixtures: rewrites
					// `@octanejs/recharts` → `recharts` so the React side runs the real
					// recharts as the byte-for-byte SVG oracle.
					globalSetup: ['packages/recharts/tests/differential/_setup.ts'],
					globals: false,
					// Inline the oracle so it resolves the SAME module graph a real
					// bundled app does: recharts has no exports map, so externalized
					// node loading takes its CJS `main` → victory-vendor's `require`
					// condition → the vendored PRE-3.2 d3-shape build (full-precision
					// paths). Inlined, both sides take the `import` condition →
					// victory-vendor/es → real d3-shape@3.2 (3-digit path rounding).
					server: {
						deps: {
							inline: ['recharts', 'victory-vendor'],
						},
					},
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/recharts$/,
							replacement: resolve(import.meta.dirname, 'packages/recharts/src/index.ts'),
						},
						{
							find: /^@octanejs\/recharts\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/recharts/src') + '/$1.ts',
						},
						{
							// SSR resolution ignores the `module` field, so bare 'recharts'
							// would enter through its CJS `main` even when inlined — send it
							// to the es6 build explicitly (no exports map, deep path is legal)
							// so the oracle runs the same ESM graph a bundled app runs.
							find: /^recharts$/,
							replacement: 'recharts/es6/index.js',
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/three/tests/public-api.test.ts',
						'packages/three/tests/root.test.ts',
						'packages/three/tests/hooks.test.ts',
						'packages/three/tests/catalogue-props.test.ts',
						'packages/three/tests/events.test.ts',
						'packages/three/tests/portal.test.ts',
						'packages/three/tests/dom-region.test.ts',
						'packages/three/tests/upstream-crosswalk.test.ts',
					],
				},
				test: {
					name: 'three',
					include: ['packages/three/tests/**/*.test.ts'],
					// Compatibility lanes (CI swaps in a different Three release) select
					// Octane-owned behavior tests only: the differential oracle stays
					// pinned to its exact r172 pair and the browser suites depend on the
					// pinned bundle contract. Enforced HERE because the compat script's
					// CLI --exclude flags proved unreliable once `pnpm add
					// --lockfile=false` re-keys the workspace's vitest instances.
					// Differential files are always owned by `three-differential`.
					exclude: [
						'packages/three/tests/browser/**/*.test.ts',
						'packages/three/tests/**/*differential.test.ts',
					],
					environment: 'jsdom',
					globals: false,
					server: { deps: { inline: ['@react-three/fiber'] } },
				},
				plugins: [octane({ renderers: THREE_RENDERERS })],
				resolve: { alias: THREE_ALIASES, dedupe: ['react', 'react-dom', 'three'] },
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'three-browser',
					include:
						process.env.OCTANE_THREE_COMPAT_VERSION === undefined
							? ['packages/three/tests/browser/xr.test.ts']
							: [],
					environment: 'jsdom',
					globalSetup: ['packages/three/tests/_react-setup.ts'],
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
					server: { deps: { inline: ['@react-three/fiber'] } },
				},
				plugins: [octane({ renderers: THREE_RENDERERS })],
				resolve: { alias: THREE_ALIASES, dedupe: ['react', 'react-dom', 'three'] },
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'three-browser-integration',
					include: [
						'packages/three/tests/browser/bundlers.test.ts',
						'packages/three/tests/browser/canvas.test.ts',
					],
					environment: 'node',
					globalSetup: ['packages/three/tests/_react-setup.ts'],
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
					server: { deps: { inline: ['@react-three/fiber'] } },
				},
				plugins: [octane({ renderers: THREE_RENDERERS })],
				resolve: { alias: THREE_ALIASES, dedupe: ['react', 'react-dom', 'three'] },
			},
			{
				test: {
					name: 'visx',
					include: [
						'packages/visx/tests/conformance/**/*.test.ts',
						'packages/visx/tests/hydration/**/*.test.ts',
					],
					exclude: ['packages/visx/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
					testTimeout: 30_000,
					server: { deps: { inline: [/^@visx\//] } },
				},
				plugins: [octane(), visxCoverageSource()],
				resolve: { alias: VISX_ALIASES },
			},
			{
				test: {
					name: 'visx-ssr',
					include: ['packages/visx/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true }), visxCoverageSource()],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						...VISX_ALIASES,
					],
				},
			},
			{
				test: {
					name: 'lucide',
					include: [
						'packages/lucide/tests/**/*.test.ts',
						'!packages/lucide/tests/ssr/**/*.test.ts',
						'!packages/lucide/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/lucide$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src/index.ts'),
						},
						{
							find: /^@octanejs\/lucide\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'lucide-differential',
					include: ['packages/lucide/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/lucide/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/lucide$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src/index.ts'),
						},
						{
							find: /^@octanejs\/lucide\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'lucide-ssr',
					include: ['packages/lucide/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/lucide$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src/index.ts'),
						},
						{
							find: /^@octanejs\/lucide\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'phosphor-icons',
					include: [
						'packages/phosphor-icons/tests/**/*.test.ts',
						'!packages/phosphor-icons/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					exclude: ['packages/phosphor-icons/tests/differential/**/*.test.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/phosphor-icons$/,
							replacement: resolve(import.meta.dirname, 'packages/phosphor-icons/src/index.ts'),
						},
						{
							find: /^@octanejs\/phosphor-icons\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/phosphor-icons/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'phosphor-icons-differential',
					include: ['packages/phosphor-icons/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/phosphor-icons/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/phosphor-icons$/,
							replacement: resolve(import.meta.dirname, 'packages/phosphor-icons/src/index.ts'),
						},
						{
							find: /^@octanejs\/phosphor-icons\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/phosphor-icons/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'phosphor-icons-ssr',
					include: ['packages/phosphor-icons/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/phosphor-icons$/,
							replacement: resolve(import.meta.dirname, 'packages/phosphor-icons/src/index.ts'),
						},
						{
							find: /^@octanejs\/phosphor-icons\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/phosphor-icons/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Ordinary package shards: conformance, divergences, and harness negatives.
				// Only the differential project is react-parity-owned.
				test: {
					name: 'tanstack-router',
					include: ['packages/tanstack-router/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: [
						'packages/tanstack-router/tests/differential/**/*.test.ts',
						'packages/tanstack-router/tests/ssr/**/*.test.ts',
					],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-router$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-router-ssr-query',
					include: [
						'packages/tanstack-router-ssr-query/tests/**/*.test.ts',
						'!packages/tanstack-router-ssr-query/tests/differential/**/*.test.ts',
						'!packages/tanstack-router-ssr-query/tests/parity/**/*.test.ts',
					],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router-ssr-query$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/tanstack-router-ssr-query/src/index.tsrx',
							),
						},
						{
							find: /^@octanejs\/tanstack-query$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-router-ssr-query-differential',
					include: ['packages/tanstack-router-ssr-query/tests/differential/**/*.test.ts'],
					environment: 'node',
					globalSetup: ['packages/tanstack-router-ssr-query/tests/differential/_setup.ts'],
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router-ssr-query$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/tanstack-router-ssr-query/src/index.tsrx',
							),
						},
						{
							find: /^@octanejs\/tanstack-query$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-router-ssr-query-parity-audit',
					include: ['packages/tanstack-router-ssr-query/tests/parity/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'tanstack-start',
					include: ['packages/tanstack-start/tests/**/*.test.ts'],
					exclude: ['packages/tanstack-start/tests/rsbuild-plugin.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-start\/plugin\/vite$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/tanstack-start/src/plugin-vite.js',
							),
						},
						{
							find: /^@octanejs\/tanstack-start\/(client|server|hydration)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-start/src/$1.js'),
						},
						{
							find: /^@octanejs\/tanstack-start$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-start/src/index.js'),
						},
						{
							find: /^@octanejs\/tanstack-router\/generator-plugin$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/tanstack-router/src/generator-plugin.js',
							),
						},
						{
							find: /^@octanejs\/tanstack-router$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src') + '/$1',
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-start-rsbuild',
					include: ['packages/tanstack-start/tests/rsbuild-plugin.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 120_000,
				},
			},
			{
				test: {
					name: 'motion',
					include: ['packages/motion/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: [
						'packages/motion/tests/differential/**/*.test.ts',
						'packages/motion/tests/upstream/**/*.test.ts',
						'packages/motion/tests/upstream-original.test.ts',
					],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/motion$/,
							replacement: resolve(import.meta.dirname, 'packages/motion/src/index.ts'),
						},
						{
							find: /^@octanejs\/motion\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/motion/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'dnd-kit',
					include: [
						'packages/dnd-kit/tests/conformance/**/*.test.ts',
						'packages/dnd-kit/tests/hydration/**/*.test.ts',
					],
					environment: 'jsdom',
					setupFiles: ['packages/dnd-kit/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/dnd-kit$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/hooks/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/sortable$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/sortable/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/utilities$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/utilities/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'dnd-kit-differential',
					include: ['packages/dnd-kit/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// The shared fixture mounts both adapters and drains both runtimes.
					// Under full-suite contention this can exceed Vitest's 5s default
					// even though the focused interaction completes in well under a second.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globalSetup: ['packages/dnd-kit/tests/differential/_setup.ts'],
					setupFiles: ['packages/dnd-kit/tests/_setup.ts'],
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/dnd-kit$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/hooks/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/sortable$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/sortable/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/utilities$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/utilities/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'dnd-kit-ssr',
					include: ['packages/dnd-kit/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/hooks/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/sortable$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/sortable/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/utilities$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/utilities/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'lexical',
					include: ['packages/lexical/tests/**/*.test.ts', 'packages/lexical/tests/**/*.test.tsx'],
					environment: 'jsdom',
					exclude: ['packages/lexical/tests/differential/**/*.test.ts'],
					// Precompiles `.tsrx` fixtures → real @lexical/react for the differential
					// oracle (rewrites `@octanejs/lexical/X` → `@lexical/react/X`).
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					// `.tsrx` is added so extensionless subpath imports
					// (`@octanejs/lexical/LexicalComposer`) resolve to a `.tsrx` component
					// OR a `.ts` hook — mirroring @lexical/react's per-subpath module layout.
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: [
						{
							find: /^@octanejs\/lexical$/,
							replacement: resolve(import.meta.dirname, 'packages/lexical/src/index.ts'),
						},
						{
							find: /^@octanejs\/lexical\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lexical/src') + '/$1',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/floating-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'lexical-differential',
					include: ['packages/lexical/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Precompiles `.tsrx` fixtures → real @lexical/react for the differential
					// oracle (rewrites `@octanejs/lexical/X` → `@lexical/react/X`).
					globalSetup: ['packages/lexical/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					// `.tsrx` is added so extensionless subpath imports
					// (`@octanejs/lexical/LexicalComposer`) resolve to a `.tsrx` component
					// OR a `.ts` hook — mirroring @lexical/react's per-subpath module layout.
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: [
						{
							find: /^@octanejs\/lexical$/,
							replacement: resolve(import.meta.dirname, 'packages/lexical/src/index.ts'),
						},
						{
							find: /^@octanejs\/lexical\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lexical/src') + '/$1',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/floating-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'tiptap',
					include: [
						'packages/tiptap/tests/unit/**/*.test.ts',
						'packages/tiptap/tests/unit/**/*.test.tsx',
						'packages/tiptap/tests/hydration/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tiptap\/menus$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/menus/index.ts'),
						},
						{
							find: /^@octanejs\/tiptap$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tiptap-ssr',
					include: ['packages/tiptap/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tiptap\/menus$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/menus/index.ts'),
						},
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tiptap$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'tiptap-browser',
					include: ['packages/tiptap/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				// Port-authored lifecycle/useMonaco against the real loader + fake Monaco.
				test: {
					name: 'monaco-editor',
					include: ['packages/monaco-editor/tests/runtime/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: [
						{
							find: /^@octanejs\/monaco-editor$/,
							replacement: resolve(import.meta.dirname, 'packages/monaco-editor/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'stylex',
					include: ['packages/stylex/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				// octane() compiles the `.tsrx` fixtures; stylex() (enforce:'post') then
				// runs the StyleX compiler over that output, replacing stylex.* calls with
				// atomic class names. `dev:false` keeps class names deterministic for tests.
				plugins: [octane(), stylex({ dev: false })],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/stylex$/,
							replacement: resolve(import.meta.dirname, 'packages/stylex/src/index.ts'),
						},
						{
							find: /^@octanejs\/stylex\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/stylex/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'floating-ui',
					include: [
						'packages/floating-ui/tests/**/*.test.ts',
						'packages/floating-ui/tests/**/*.test.tsx',
					],
					exclude: [
						'packages/floating-ui/tests/browser/**/*.test.ts',
						'packages/floating-ui/tests/differential/**/*.test.ts',
						'packages/floating-ui/tests/upstream/**/*.test.ts',
						'packages/floating-ui/tests/upstream/**/*.test.tsx',
						'packages/floating-ui/tests/adapted-divergences.test.ts',
						'packages/floating-ui/tests/adapted-original.test.ts',
						'packages/floating-ui/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				// floating-ui's `.ts` hooks forward the caller's slot via subSlot — its
				// package.json declares manual hook slots, so the auto-slotting pass skips
				// them (the `.tsx` fixtures that call them are full-compiled and inject the
				// trailing slot).
				plugins: [octane()],
				resolve: {
					dedupe: ['react', 'react-dom'],
					alias: [
						{
							find: /^react\/jsx-runtime$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/octane/node_modules/react/jsx-runtime.js',
							),
						},
						{
							find: /^react-dom\/client$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/octane/node_modules/react-dom/client.js',
							),
						},
						{
							find: /^react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/octane/node_modules/react/index.js',
							),
						},
						{
							find: /^react-dom$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/octane/node_modules/react-dom/index.js',
							),
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/floating-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'floating-ui-pristine',
					include: ['packages/floating-ui/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/floating-ui/tests/adapted-divergences.test.ts',
						'packages/floating-ui/tests/adapted-original.test.ts',
					],
				},
				test: {
					name: 'floating-ui-adapted',
					include: [
						'packages/floating-ui/tests/adapted-divergences.test.ts',
						'packages/floating-ui/tests/adapted-original.test.ts',
					],
					environment: 'node',
					globals: false,
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/floating-ui/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'floating-ui-differential',
					include: ['packages/floating-ui/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/floating-ui/tests/differential/_setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
					server: { deps: { inline: ['@floating-ui/react'] } },
				},
				// floating-ui's `.ts` hooks forward the caller's slot via subSlot — its
				// package.json declares manual hook slots, so the auto-slotting pass skips
				// them (the `.tsx` fixtures that call them are full-compiled and inject the
				// trailing slot).
				plugins: [octane()],
				resolve: {
					dedupe: ['react', 'react-dom'],
					alias: [
						{
							find: /^react\/jsx-runtime$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/octane/node_modules/react/jsx-runtime.js',
							),
						},
						{
							find: /^react-dom\/client$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/octane/node_modules/react-dom/client.js',
							),
						},
						{
							find: /^react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/octane/node_modules/react/index.js',
							),
						},
						{
							find: /^react-dom$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/octane/node_modules/react-dom/index.js',
							),
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/floating-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'floating-ui-browser',
					include: ['packages/floating-ui/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				test: {
					name: 'radix',
					include: [
						'packages/radix/tests/**/*.test.ts',
						'packages/radix/tests/**/*.test.tsx',
						'!packages/radix/tests/differential/**/*.test.ts',
						'!packages/radix/tests/parity/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				// radix's `.ts` foundation forwards the caller's slot via subSlot (as does
				// @octanejs/floating-ui, which radix's Popper builds on) — both declare
				// manual hook slots in their package.json, so the auto-slotting pass skips
				// them (the `.tsx` fixtures that call them are full-compiled and inject the
				// trailing slot).
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/radix$/,
							replacement: resolve(import.meta.dirname, 'packages/radix/src/index.ts'),
						},
						{
							find: /^@octanejs\/radix\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/radix/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
					],
				},
			},
			{
				// No react-parity lane owns project "shadcn". Divergence/Sonner
				// authentication stays on ordinary shards as octane-only evidence.
				test: {
					name: 'shadcn',
					include: [
						'packages/shadcn/tests/**/*.test.ts',
						'packages/shadcn/tests/**/*.test.tsx',
						'!packages/shadcn/tests/ssr/**/*.test.ts',
						'!packages/shadcn/tests/differential/**/*.test.ts',
						'!packages/shadcn/tests/differential/**/*.test.tsx',
					],
					environment: 'jsdom',
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						// Shadcn tests exercise only the Lucide components their fixtures render.
						// Loading Lucide's full generated root barrel here repeats its own export
						// inventory in every isolated Shadcn worker and dominates these cases.
						{
							find: /^@octanejs\/lucide$/,
							replacement: resolve(import.meta.dirname, 'packages/shadcn/tests/_lucide.ts'),
						},
						// @octanejs/radix deliberately carries no alias: it resolves through
						// node_modules like any other dependency. That used to mean the pinned
						// published release (maintainer policy from the cmdk review); since the
						// package moved to `workspace:*` it means packages/radix, so these
						// tests now cover the sibling source this repo actually ships.
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'shadcn-differential',
					include: [
						'packages/shadcn/tests/differential/**/*.test.ts',
						'packages/shadcn/tests/differential/**/*.test.tsx',
					],
					environment: 'jsdom',
					// Rewrites @octanejs/shadcn subpaths to the matching vendored,
					// pinned upstream React modules before the differential tests load.
					globalSetup: ['packages/shadcn/tests/differential/_setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/lucide$/,
							replacement: resolve(import.meta.dirname, 'packages/shadcn/tests/_lucide.ts'),
						},
					],
				},
			},
			{
				// No react-parity lane owns `project: "shadcn-ssr"`, so leave this on ordinary
				// shards rather than marking the package-authored SSR suite as parity-owned.
				test: {
					name: 'shadcn-ssr',
					include: ['packages/shadcn/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'aria',
					include: [
						'packages/aria/tests/**/*.test.ts',
						'packages/aria/tests/**/*.test.tsx',
						'!packages/aria/tests/ssr/**/*.test.ts',
						'!packages/aria/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				// aria's `.ts` hooks forward the caller's slot via subSlot — the package
				// declares manual hook slots in its package.json, so the auto-slotting pass
				// skips them (the `.tsx`/`.tsrx` fixtures that call them are full-compiled
				// and inject the trailing slot).
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/aria$/,
							replacement: resolve(import.meta.dirname, 'packages/aria/src/index.ts'),
						},
						{
							find: /^@octanejs\/aria\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/aria/src') + '/$1/index.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'aria-ssr',
					include: ['packages/aria/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/aria$/,
							replacement: resolve(import.meta.dirname, 'packages/aria/src/index.ts'),
						},
						{
							find: /^@octanejs\/aria\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/aria/src') + '/$1/index.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'base-ui',
					include: [
						'packages/base-ui/tests/**/*.test.ts',
						'packages/base-ui/tests/**/*.test.tsx',
						'!packages/base-ui/tests/ssr/**/*.test.ts',
						'!packages/base-ui/tests/differential/**/*.test.ts',
						'!packages/base-ui/tests/upstream/**/*.test.ts',
					],
					environment: 'jsdom',
					// hydration.test.ts boots a real Vite server and SSR-compiles its fixture
					// inside the test body; on a loaded CI shard that overran the 5s vitest
					// default. Match the other differential-bearing projects at 30s.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				// base-ui's `.ts` foundation forwards the caller's slot via subSlot (as does
				// @octanejs/floating-ui, which base-ui's overlays build on) — both declare
				// manual hook slots in their package.json, so the auto-slotting pass skips
				// them.
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/base-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/base-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'base-ui-ssr',
					include: ['packages/base-ui/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/base-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/base-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'react-map-gl-ssr',
					include: ['packages/react-map-gl/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/react-map-gl$/,
							replacement: resolve(import.meta.dirname, 'packages/react-map-gl/src/index.ts'),
						},
					],
				},
			},
			{
				// The same fixture through Octane and the PUBLISHED @vis.gl/react-mapbox
				// 8.1.2 on real React — resolved from node_modules so the octane
				// plugin never touches the oracle. Its own project because the
				// React-side precompile does not belong to the ordinary suite.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'react-map-gl-differential',
					include: ['packages/react-map-gl/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/react-map-gl/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/react-map-gl$/,
							replacement: resolve(import.meta.dirname, 'packages/react-map-gl/src/index.ts'),
						},
					],
				},
			},
			{
				// The ported @vis.gl/react-mapbox suite owns tests/upstream/**; the
				// remaining files are Octane-only conformance for behavior the
				// upstream suite cannot observe, so they stay in the ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: ['packages/react-map-gl/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'react-map-gl',
					include: ['packages/react-map-gl/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/react-map-gl/tests/differential/**/*.test.ts',
						'packages/react-map-gl/tests/ssr/**/*.test.ts',
						// Owned by the two upstream-util lanes, which alias
						// @vis.gl/react-mapbox at their own source tree.
						'packages/react-map-gl/tests/upstream-util/**/*.test.ts',
					],
					environment: 'jsdom',
					// The hydration cases boot a real Vite SSR server, which is well past
					// the default 5s on its own. Every project using renderHydrationFixture
					// raises this.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/index.ts'),
						},
						{
							find: /^@octanejs\/react-map-gl$/,
							replacement: resolve(import.meta.dirname, 'packages/react-map-gl/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'sonner',
					include: [
						'packages/sonner/tests/**/*.test.ts',
						'!packages/sonner/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					exclude: ['packages/sonner/tests/differential/**/*.test.ts'],
					// Differential precompile for Sonner fixtures: rewrites
					// `@octanejs/sonner` → the real published `sonner@2.0.7`.
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/sonner$/,
							replacement: resolve(import.meta.dirname, 'packages/sonner/src/index.ts'),
						},
						{
							find: /^@octanejs\/sonner\/dist\/styles\.css$/,
							replacement: resolve(import.meta.dirname, 'packages/sonner/src/styles.css'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'sonner-differential',
					include: ['packages/sonner/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile for Sonner fixtures: rewrites
					// `@octanejs/sonner` → the real published `sonner@2.0.7`.
					globalSetup: ['packages/sonner/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/sonner$/,
							replacement: resolve(import.meta.dirname, 'packages/sonner/src/index.ts'),
						},
						{
							find: /^@octanejs\/sonner\/dist\/styles\.css$/,
							replacement: resolve(import.meta.dirname, 'packages/sonner/src/styles.css'),
						},
					],
				},
			},
			{
				test: {
					name: 'sonner-ssr',
					include: ['packages/sonner/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/sonner$/,
							replacement: resolve(import.meta.dirname, 'packages/sonner/src/index.ts'),
						},
					],
				},
			},
			{
				// Package-authored Streamdown contracts stay ordinary. Parity owns
				// only the dedicated differential project below.
				test: {
					name: 'streamdown',
					include: [
						'packages/streamdown/tests/**/*.test.ts',
						'!packages/streamdown/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					exclude: ['packages/streamdown/tests/differential/**/*.test.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: STREAMDOWN_ALIASES,
				},
			},
			{
				test: {
					name: 'streamdown-ssr',
					include: ['packages/streamdown/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						...STREAMDOWN_ALIASES,
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'xyflow',
					include: ['packages/xyflow/tests/**/*.test.ts'],
					exclude: [...configDefaults.exclude, 'packages/xyflow/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					testTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/xyflow$/,
							replacement: resolve(import.meta.dirname, 'packages/xyflow/src/index.ts'),
						},
						{
							find: /^@octanejs\/xyflow\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/xyflow/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/zustand$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src/index.ts'),
						},
						{
							find: /^@octanejs\/zustand\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/dnd-kit$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/hooks/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/sortable$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/sortable/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/utilities$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/utilities/index.ts'),
						},
						{
							find: /^@octanejs\/lucide$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src/index.ts'),
						},
						{
							find: /^@octanejs\/lucide\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/tanstack-pacer$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-pacer/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-pacer\/(.*)$/,
							replacement:
								resolve(import.meta.dirname, 'packages/tanstack-pacer/src') + '/$1/index.ts',
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'xyflow-differential',
					include: ['packages/xyflow/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					testTimeout: 30_000,
					globalSetup: ['packages/xyflow/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/xyflow$/,
							replacement: resolve(import.meta.dirname, 'packages/xyflow/src/index.ts'),
						},
						{
							find: /^@octanejs\/xyflow\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/xyflow/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'cmdk',
					include: [
						'packages/cmdk/tests/**/*.test.ts',
						'!packages/cmdk/tests/ssr/**/*.test.ts',
						'!packages/cmdk/tests/differential/**/*.test.ts',
						'!packages/cmdk/tests/parity/**/*.test.ts',
					],
					environment: 'jsdom',
					// The differential oracle mounts real cmdk beside the Octane build.
					// In isolation the whole project finishes in ~5.6s, but inside a full
					// run those two cases overran the 5s default purely from machine
					// contention — a green suite reporting itself broken. Same budget as
					// the other differential-bearing projects.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					// Fails any test that logs a console.error (octane reports effect
					// exceptions there without failing the run).
					setupFiles: ['packages/cmdk/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/cmdk$/,
							replacement: resolve(import.meta.dirname, 'packages/cmdk/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/cmdk/tests/ssr/empty-differential.test.ts'],
				},
				test: {
					name: 'cmdk-ssr',
					include: ['packages/cmdk/tests/ssr/**/*.test.ts'],
					environment: 'node',
					setupFiles: ['packages/cmdk/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/cmdk$/,
							replacement: resolve(import.meta.dirname, 'packages/cmdk/src/index.ts'),
						},
					],
				},
			},
			{
				// Package-authored Styled Components contracts stay ordinary. Parity
				// owns only the dedicated differential project below.
				test: {
					name: 'styled-components',
					include: [
						'packages/styled-components/tests/**/*.test.ts',
						'!packages/styled-components/tests/ssr/**/*.test.ts',
						'!packages/styled-components/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',

					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/styled-components$/,
							replacement: resolve(import.meta.dirname, 'packages/styled-components/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'styled-components-differential',
					include: ['packages/styled-components/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Rewrites @octanejs/styled-components to the published React
					// package before the differential tests load.

					globalSetup: ['packages/styled-components/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/styled-components$/,
							replacement: resolve(import.meta.dirname, 'packages/styled-components/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'styled-components-ssr',
					include: ['packages/styled-components/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/styled-components$/,
							replacement: resolve(import.meta.dirname, 'packages/styled-components/src/index.ts'),
						},
					],
				},
			},
			{
				// Ordinary package tests stay in the Node-version shards. Only the
				// differential project below is react-parity owned.
				test: {
					name: 'testing-library',
					include: ['packages/testing-library/tests/**/*.test.ts'],
					environment: 'jsdom',
					exclude: [
						'packages/testing-library/tests/differential/**/*.test.ts',
						'packages/testing-library/tests/differential.test.ts',
					],
					// hydrate.test.ts renders its server markup through the shared
					// hydration harness, which boots a real Vite SSR server in beforeAll —
					// the same reason the other harness-using projects lift the 5s default.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				// The binding's `.ts` sources call hooks with EXPLICIT slot symbols
				// (renderHook's harness component) — declared in its package.json, so the
				// auto-slotting pass skips them; the test files themselves stay included so
				// hook callbacks written inline in tests get their call-site slots.
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'mdx',
					include: ['packages/mdx/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				// octaneMdx() owns `.mdx`/`.md` (it runs the FULL pipeline — @mdx-js/mdx →
				// octane compile — and returns final JS); octane() compiles the `.tsrx`
				// fixtures embedded in documents and the test files. The binding's own
				// `.ts` sources call hooks with EXPLICIT slot symbols (as does
				// @octanejs/testing-library, which the tests mount through) — both declare
				// manual hook slots in their package.json, so the auto-slotting pass skips
				// them.
				plugins: [octaneMdx(), octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/mdx$/,
							replacement: resolve(import.meta.dirname, 'packages/mdx/src/index.ts'),
						},
						{
							// `compile`/`vite` are Node-loadable `.js` (see packages/mdx/src/vite.js);
							// the runtime entries (`server`, …) stay `.ts`.
							find: /^@octanejs\/mdx\/(compile|vite)$/,
							replacement: resolve(import.meta.dirname, 'packages/mdx/src') + '/$1.js',
						},
						{
							find: /^@octanejs\/mdx\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/mdx/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				plugins: [octane()],
				test: {
					name: 'docusaurus',
					include: [
						'packages/docusaurus/tests/**/*.test.ts',
						'!packages/docusaurus/tests/ssr/**/*.test.ts',
					],
					environment: 'node',
					globals: false,
				},
				resolve: {
					alias: [
						{
							find: /^@octanejs\/mdx\/compile$/,
							replacement: resolve(import.meta.dirname, 'packages/mdx/src/compile.js'),
						},
						{
							find: /^@octanejs\/remix-router$/,
							replacement: resolve(import.meta.dirname, 'packages/remix-router/src/index.ts'),
						},
					],
				},
			},
			{
				plugins: [octane({ ssr: true })],
				test: {
					name: 'docusaurus-ssr',
					include: ['packages/docusaurus/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/docusaurus\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/docusaurus/src/server.js'),
						},
						{
							find: /^@octanejs\/mdx\/compile$/,
							replacement: resolve(import.meta.dirname, 'packages/mdx/src/compile.js'),
						},
						{
							find: /^@octanejs\/remix-router$/,
							replacement: resolve(import.meta.dirname, 'packages/remix-router/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'astro',
					include: ['packages/astro/tests/**/*.test.ts'],
					exclude: ['packages/astro/tests/**/*.e2e.test.ts'],
					environment: 'node',
					globals: false,
				},
				resolve: {
					alias: [
						{
							find: /^astro:octane:opts$/,
							replacement: resolve(import.meta.dirname, 'packages/astro/tests/_fixtures/opts.js'),
						},
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/index.ts'),
						},
						{
							find: /^octane\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^octane\/compiler\/vite$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/compiler/vite.js'),
						},
					],
				},
			},
			{
				test: {
					name: 'astro-e2e',
					include: ['packages/astro/tests/astro.e2e.test.ts'],
					environment: 'node',
					globals: false,
					hookTimeout: 320_000,
					testTimeout: 60_000,
					fileParallelism: false,
					...(process.env.CI ? { maxWorkers: 1 } : {}),
				},
			},
			{
				test: {
					name: 'octane-mcp-server',
					include: ['packages/octane-mcp-server/src/**/*.test.js'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'cli',
					include: ['packages/cli/tests/**/*.test.js'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'create-octane',
					include: ['packages/create-octane/tests/**/*.test.js'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'octane-evals',
					include: ['packages/octane-evals/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'octane-evals-user-apps',
					include: [
						'packages/octane-evals/datasets/train/user-apps-v1/tasks/**/grader.test.ts',
						'packages/octane-evals/datasets/train/user-apps-v1/source-contracts.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [userAppEvalSubmission(), octane()],
				resolve: {
					alias: [
						{
							find: /^octane\/compiler$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/compiler/index.js'),
						},
						{
							find: /^octane\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'app-core',
					include: ['packages/app-core/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'rspack-plugin',
					include: ['packages/rspack-plugin-octane/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'opentui',
					include: [
						'packages/opentui/tests/config.test.ts',
						'packages/opentui/tests/props.test.ts',
					],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ renderers: OPENTUI_RENDERERS, ssr: false })],
				resolve: { alias: OPENTUI_ALIASES, dedupe: ['@opentui/core'] },
			},
			{
				test: {
					name: 'ink',
					include: ['packages/ink/tests/**/*.test.ts'],
					exclude: ['packages/ink/tests/differential/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ renderers: INK_RENDERERS, ssr: false })],
				resolve: { alias: INK_ALIASES },
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'ink-differential',
					include: ['packages/ink/tests/differential/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				resolve: { alias: INK_ALIASES },
			},
			{
				test: {
					name: 'lynx',
					include: ['packages/lynx/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				// Lynx has no server compilation mode; execute native fixtures through
				// the client compiler even though Vitest itself runs them in Node.
				plugins: [octane({ renderers: lynxRspeedyRenderers, ssr: false })],
				resolve: { alias: LYNX_ALIASES },
			},
			{
				test: {
					name: 'rspeedy-plugin',
					include: [
						'packages/rspeedy-plugin-octane/tests/**/*.test.ts',
						'!packages/rspeedy-plugin-octane/tests/browser/**/*.test.ts',
					],
					environment: 'node',
					globals: false,
				},
				resolve: { alias: LYNX_ALIASES },
			},
			{
				test: {
					name: 'rspeedy-plugin-browser',
					include: ['packages/rspeedy-plugin-octane/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 90_000,
					hookTimeout: 60_000,
				},
				resolve: { alias: LYNX_ALIASES },
			},
			{
				test: {
					name: 'rsbuild-plugin',
					include: ['packages/rsbuild-plugin-octane/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'vite-plugin',
					include: [
						'packages/vite-plugin-octane/tests/**/*.test.ts',
						'!packages/vite-plugin-octane/tests/browser/**/*.test.ts',
					],
					environment: 'node',
					globals: false,
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'vite-plugin-browser',
					include: ['packages/vite-plugin-octane/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'adapter-vercel',
					include: ['packages/adapter-vercel/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'adapter-cloudflare',
					include: ['packages/adapter-cloudflare/tests/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'website-unit',
					include: ['website/tests/**/*.test.ts'],
					// A project that declares `exclude` makes Vitest ignore the CLI
					// `--exclude` flag entirely. CI's sharded suite therefore CANNOT drop
					// a spec in this project by name the way it does for every other
					// quarantined path, and its `--exclude "$WEBSITE_DOCS_SPEC"` was
					// silently a no-op — core-apis-docs ran in a shard AND in the
					// website_e2e job that owns it. The shard sets the variable below to
					// ask for the exclusion; website_e2e does not, so it still runs there.
					exclude: [
						'website/tests/ssr-smoke.test.ts',
						'website/tests/ssr-hydration.e2e.test.ts',
						...(process.env.OCTANE_EXCLUDE_WEBSITE_DOCS === '1'
							? ['website/tests/core-apis-docs.test.ts']
							: []),
					],
					environment: 'jsdom',
					setupFiles: ['website/tests/setup/unit.ts'],
					globals: false,
					// Route tests render the real documentation graph. The heaviest
					// Core APIs case owns a larger, contention-safe timeout inline.
					testTimeout: 15_000,
				},
				// Unit tests compile MDX and TSRX directly. Production SSR, hydration,
				// routing, and deployment are owned by @octanejs/tanstack-start; the
				// official router and Octane runtime resolve through website/node_modules.
				plugins: [octaneMdx(websiteMdxOptions), octane()],
			},
			{
				test: {
					name: 'website-integration',
					include: ['website/tests/ssr-smoke.test.ts', 'website/tests/ssr-hydration.e2e.test.ts'],
					// One production build and one preview server for both specs; see
					// the file header for why they no longer build for themselves.
					globalSetup: ['./website/tests/setup/production-server.ts'],
					environment: 'jsdom',
					globals: false,
					// Vitest defaults ordinary tests to five seconds. This project
					// deliberately owns full-route, build, and browser integration
					// coverage, so give unannotated integration cases the same
					// budget as the SSR smoke test.
					testTimeout: 15_000,
					// The production build no longer blocks globalSetup (see
					// tests/setup/production-server.ts); both specs wait for it in a
					// `beforeAll` instead. That hook is therefore as long as a cold
					// website build, which the 10s hook default cannot cover.
					hookTimeout: 480_000,
					// Browser cases inside the e2e spec run concurrently (page-per-case
					// against a shared server). Four keeps the Vite dev server's on-demand
					// transform queue from becoming the bottleneck and leaves headroom, so
					// timing-sensitive hover and layout cases are not measured on a
					// saturated machine.
					maxConcurrency: 4,
					// Both specs drive the shared preview server and the e2e spec also
					// owns a Vite dev server, a browser, and source edits for its HMR
					// case. Keep the FILE boundary serial even though cases within a file
					// are concurrent.
					fileParallelism: false,
				},
				plugins: [octaneMdx(websiteMdxOptions), octane()],
			},
			{
				test: {
					name: 'react-error-boundary',
					include: [
						'packages/react-error-boundary/tests/**/*.test.ts',
						'!packages/react-error-boundary/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					exclude: ['packages/react-error-boundary/tests/differential/**/*.test.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/react-error-boundary$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/react-error-boundary/src/index.ts',
							),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/react-error-boundary/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'react-error-boundary-differential',
					include: ['packages/react-error-boundary/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/react-error-boundary/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/react-error-boundary$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/react-error-boundary/src/index.ts',
							),
						},
					],
				},
			},
			{
				test: {
					name: 'gsap',
					include: [
						'packages/gsap/tests/**/*.test.ts',
						'!packages/gsap/tests/ssr/**/*.test.ts',
						'!packages/gsap/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/gsap$/,
							replacement: resolve(import.meta.dirname, 'packages/gsap/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'gsap-differential',
					include: ['packages/gsap/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/gsap/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/gsap$/,
							replacement: resolve(import.meta.dirname, 'packages/gsap/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'mantine-hooks',
					include: ['packages/mantine-hooks/tests/conformance/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/mantine-hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/mantine-hooks/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'react-error-boundary-ssr',
					include: ['packages/react-error-boundary/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/react-error-boundary\/server$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/react-error-boundary/src/server.tsrx',
							),
						},
					],
				},
			},
			{
				test: {
					name: 'gsap-ssr',
					include: ['packages/gsap/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/gsap$/,
							replacement: resolve(import.meta.dirname, 'packages/gsap/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'mantine-hooks-ssr',
					include: ['packages/mantine-hooks/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/mantine-hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/mantine-hooks/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'mobx',
					include: ['packages/mobx/tests/conformance/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/mobx$/,
							replacement: resolve(import.meta.dirname, 'packages/mobx/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'mobx-differential',
					include: ['packages/mobx/tests/differential/**/*.test.ts'],
					globalSetup: ['packages/mobx/tests/differential/_setup.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/mobx$/,
							replacement: resolve(import.meta.dirname, 'packages/mobx/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'mobx-ssr',
					include: ['packages/mobx/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/mobx$/,
							replacement: resolve(import.meta.dirname, 'packages/mobx/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'website-mcp-unit',
					include: ['website-mcp/tests/**/*.test.ts'],
					exclude: ['website-mcp/tests/built-handler.e2e.test.ts'],
					environment: 'node',
					globals: false,
				},
				// No app plugins: the website-mcp tests exercise plain .ts modules (the
				// content snapshot uses only Vite built-ins — ?raw and
				// import.meta.glob).
			},
			{
				test: {
					name: 'website-mcp-integration',
					include: ['website-mcp/tests/built-handler.e2e.test.ts'],
					environment: 'node',
					globals: false,
					// The spec builds an OS-temporary mirror before importing the
					// emitted server entry; keep that one build/test file serial.
					fileParallelism: false,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'spring-pristine',
					include: ['packages/spring/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
					testTimeout: 180_000,
					hookTimeout: 180_000,
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/spring/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'spring',
					include: [
						'packages/spring/tests/conformance/**/*.test.ts',
						'packages/spring/tests/hydration/**/*.test.ts',
						'packages/spring/tests/upstream/**/*.test.ts',
					],
					exclude: [...configDefaults.exclude, 'packages/spring/tests/upstream-original.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/spring$/,
							replacement: resolve(import.meta.dirname, 'packages/spring/src/index.ts'),
						},
						{
							find: /^@octanejs\/spring\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/spring/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'spring-ssr',
					include: ['packages/spring/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/spring$/,
							replacement: resolve(import.meta.dirname, 'packages/spring/src/index.ts'),
						},
						{
							find: /^@octanejs\/spring\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/spring/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'spring-browser',
					include: ['packages/spring/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'spring-differential',
					include: ['packages/spring/tests/differential/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/spring$/,
							replacement: resolve(import.meta.dirname, 'packages/spring/src/index.ts'),
						},
						{
							find: /^@octanejs\/spring\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/spring/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/zag/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'zag',
					include: [
						'packages/zag/tests/conformance/**/*.test.ts',
						'packages/zag/tests/upstream/**/*.test.ts',
					],
					exclude: [
						...configDefaults.exclude,
						'packages/zag/tests/differential/**/*.test.ts',
						'packages/zag/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					// The adapted upstream suite regenerates from the pinned bytes, which
					// register through Vitest globals exactly as upstream runs them.
					globals: true,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/zag$/,
							replacement: resolve(import.meta.dirname, 'packages/zag/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'zag-pristine',
					include: ['packages/zag/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'zag-differential',
					include: ['packages/zag/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/zag$/,
							replacement: resolve(import.meta.dirname, 'packages/zag/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'zag-ssr',
					include: ['packages/zag/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^octane\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/zag$/,
							replacement: resolve(import.meta.dirname, 'packages/zag/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'alien-signals-pristine',
					include: ['packages/alien-signals/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/alien-signals/tests/upstream-adapted.test.ts'],
				},
				test: {
					name: 'alien-signals',
					include: [
						'packages/alien-signals/tests/**/*.test.ts',
						'playground/octane/src/demos/AlienSignals.test.ts',
						'!packages/alien-signals/tests/ssr/**/*.test.ts',
						'!packages/alien-signals/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@\//,
							replacement: `${resolve(import.meta.dirname, 'playground/octane/src')}/`,
						},
						{
							find: /^@octanejs\/alien-signals$/,
							replacement: resolve(import.meta.dirname, 'packages/alien-signals/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'alien-signals-ssr',
					include: ['packages/alien-signals/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/alien-signals$/,
							replacement: resolve(import.meta.dirname, 'packages/alien-signals/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'intersection-observer-pristine',
					include: ['packages/intersection-observer/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'intersection-observer-pristine-browser',
					include: ['packages/intersection-observer/tests/upstream-browser-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
					testTimeout: 120_000,
					hookTimeout: 120_000,
				},
			},
			{
				test: {
					name: 'intersection-observer',
					include: [
						'packages/intersection-observer/tests/**/*.test.ts',
						'packages/intersection-observer/tests/**/*.test.tsx',
					],
					exclude: [
						'packages/intersection-observer/tests/upstream/**/*.test.ts',
						'packages/intersection-observer/tests/upstream/**/*.test.tsx',
						'packages/intersection-observer/tests/upstream-original.test.ts',
						'packages/intersection-observer/tests/upstream-browser-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/intersection-observer$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/intersection-observer/src/index.ts',
							),
						},
						{
							find: /^@octanejs\/intersection-observer\/test-utils$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/intersection-observer/src/test-utils.ts',
							),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'intersection-observer-adapted',
					include: [
						'packages/intersection-observer/tests/upstream/**/*.test.ts',
						'packages/intersection-observer/tests/upstream/**/*.test.tsx',
					],
					exclude: ['packages/intersection-observer/tests/upstream/browser.test.tsx'],
					environment: 'jsdom',
					globals: true,
					setupFiles: ['packages/intersection-observer/tests/upstream-adapted.setup.ts'],
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^vitest\/browser$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/intersection-observer/tests/_harness/vitest-browser-stub.ts',
							),
						},

						{
							find: /^@octanejs\/intersection-observer$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/intersection-observer/src/index.ts',
							),
						},
						{
							find: /^@octanejs\/intersection-observer\/test-utils$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/intersection-observer/src/test-utils.ts',
							),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'intersection-observer-adapted-browser',
					include: ['packages/intersection-observer/tests/upstream/browser.test.tsx'],
					globals: true,
					testTimeout: 60_000,
					hookTimeout: 60_000,
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						instances: [{ browser: 'chromium' }],
					},
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/intersection-observer$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/intersection-observer/src/index.ts',
							),
						},
						{
							find: /^@octanejs\/intersection-observer\/test-utils$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/intersection-observer/src/test-utils.ts',
							),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'mantine-hooks-differential',
					include: ['packages/mantine-hooks/tests/differential/**/*.test.ts'],
					globalSetup: ['packages/mantine-hooks/tests/differential/_setup.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/mantine-hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/mantine-hooks/src/index.ts'),
						},
					],
				},
			},
			{
				// Package-authored Octane-only conformance (ordinary shards). Paired
				// React scenarios live in embla-carousel-differential.
				test: {
					name: 'embla-carousel',
					include: ['packages/embla-carousel/tests/conformance/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/embla-carousel$/,
							replacement: resolve(import.meta.dirname, 'packages/embla-carousel/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'embla-carousel-pristine-utils',
					include: [
						'packages/embla-carousel/upstream/embla-carousel-reactive-utils/src/__tests__/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: true,
				},
			},
			{
				// Audit checks are ordinary package tests, not required parity evidence.
				test: {
					name: 'embla-carousel-audit',
					include: ['packages/embla-carousel/tests/audit/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				// Unpaired Octane browser harness. Owned by heavy-browser metadata so
				// ordinary shards omit it and heavy_integration discovers it without a
				// package-specific ci.yml path.
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'embla-carousel-browser',
					include: ['packages/embla-carousel/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'embla-carousel-differential',
					include: ['packages/embla-carousel/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^embla-carousel-react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/embla-carousel/upstream/embla-carousel-react/src/index.ts',
							),
						},
						{
							find: /^embla-carousel$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/embla-carousel/tests/test-support/mock-embla.ts',
							),
						},
						{
							find: /^@octanejs\/embla-carousel$/,
							replacement: resolve(import.meta.dirname, 'packages/embla-carousel/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'embla-carousel-hydration',
					include: ['packages/embla-carousel/tests/hydration/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/embla-carousel$/,
							replacement: resolve(import.meta.dirname, 'packages/embla-carousel/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'embla-carousel-ssr',
					include: ['packages/embla-carousel/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/embla-carousel$/,
							replacement: resolve(import.meta.dirname, 'packages/embla-carousel/src/index.ts'),
						},
					],
				},
			},
			{
				// The one-for-one adapted suite owns tests/upstream/**; exports and
				// transition integration guards are Octane-authored and stay in the
				// ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: ['packages/transition-group/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'transition-group',
					include: [
						'packages/transition-group/tests/**/*.test.ts',
						'!packages/transition-group/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/transition-group$/,
							replacement: resolve(import.meta.dirname, 'packages/transition-group/src/index.ts'),
						},
					],
				},
			},
			{
				// Only the upstream SSR import case is parity-owned; the authored
				// initial-state / wrapper rendering cases stay in ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: ['packages/transition-group/tests/ssr/upstream-import.test.ts'],
				},
				test: {
					name: 'transition-group-ssr',
					include: ['packages/transition-group/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/transition-group$/,
							replacement: resolve(import.meta.dirname, 'packages/transition-group/src/index.ts'),
						},
					],
				},
			},
			{
				// Octane-only SSR/verifier/crosswalk coverage stays in the ordinary
				// shards. Browser and React-parity suites use their dedicated lanes.
				testExecution: {
					group: 'react-parity',
					include: ['packages/select/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'select',
					include: [
						'packages/select/tests/**/*.test.ts',
						'packages/select/tests/**/*.test.mjs',
						'!packages/select/tests/browser/**/*.test.ts',
						'!packages/select/tests/async.test.ts',
						'!packages/select/tests/creatable.test.ts',
						'!packages/select/tests/default-styles.test.ts',
						'!packages/select/tests/leaf-components.test.ts',
						'!packages/select/tests/select-ssr.test.ts',
						'!packages/select/tests/state-manager.test.ts',
					],
					environment: 'node',
					globals: false,
					fileParallelism: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/select$/,
							replacement: resolve(import.meta.dirname, 'packages/select/src/index.ts'),
						},
						{
							find: /^@octanejs\/select\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/select/src') + '/$1',
						},
						{
							find: /^@octanejs\/transition-group$/,
							replacement: resolve(import.meta.dirname, 'packages/transition-group/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'select-browser',
					include: ['packages/select/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					fileParallelism: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'select-differential',
					include: [
						'packages/select/tests/async.test.ts',
						'packages/select/tests/creatable.test.ts',
						'packages/select/tests/default-styles.test.ts',
						'packages/select/tests/leaf-components.test.ts',
						'packages/select/tests/select-ssr.test.ts',
						'packages/select/tests/state-manager.test.ts',
					],
					environment: 'node',
					globals: false,
					fileParallelism: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/select$/,
							replacement: resolve(import.meta.dirname, 'packages/select/src/index.ts'),
						},
						{
							find: /^@octanejs\/select\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/select/src') + '/$1',
						},
						{
							find: /^@octanejs\/transition-group$/,
							replacement: resolve(import.meta.dirname, 'packages/transition-group/src/index.ts'),
						},
					],
				},
			},
			{
				// Ordinary ownership: repo-authored Octane-only smoke stays out of
				// adaptedRuntimeSummary / react-parity evidence.
				test: {
					name: 'day-picker',
					include: [
						'packages/day-picker/tests/**/*.test.ts',
						'!packages/day-picker/tests/ssr/**/*.test.ts',
						'!packages/day-picker/tests/browser/**/*.test.ts',
						'!packages/day-picker/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/day-picker$/,
							replacement: resolve(import.meta.dirname, 'packages/day-picker/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'day-picker-ssr',
					include: ['packages/day-picker/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/day-picker$/,
							replacement: resolve(import.meta.dirname, 'packages/day-picker/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'day-picker-browser',
					include: ['packages/day-picker/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				// Bounded React oracle evidence only — unpaired smoke/SSR/browser
				// projects stay on ordinary ownership above.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'day-picker-differential',
					include: ['packages/day-picker/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/day-picker$/,
							replacement: resolve(import.meta.dirname, 'packages/day-picker/src/index.ts'),
						},
					],
				},
			},
			{
				// Mixed project: react-parity owns only adapted drawer evidence.
				// Differential evidence lives in vaul-differential. exports.test.ts stays
				// in ordinary shards as an Octane package contract.
				testExecution: {
					group: 'react-parity',
					include: ['packages/vaul/tests/drawer.test.ts'],
				},
				test: {
					name: 'vaul',
					include: [
						'packages/vaul/tests/**/*.test.ts',
						'!packages/vaul/tests/ssr/**/*.test.ts',
						'!packages/vaul/tests/browser/**/*.test.ts',
						'!packages/vaul/tests/browser-conformance/**/*.test.ts',
						'!packages/vaul/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/vaul$/,
							replacement: resolve(import.meta.dirname, 'packages/vaul/src/index.tsrx'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'vaul-differential',
					include: ['packages/vaul/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/vaul$/,
							replacement: resolve(import.meta.dirname, 'packages/vaul/src/index.tsrx'),
						},
					],
					dedupe: ['react', 'react-dom'],
				},
			},
			{
				test: {
					name: 'vaul-ssr',
					include: ['packages/vaul/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/vaul$/,
							replacement: resolve(import.meta.dirname, 'packages/vaul/src/index.tsrx'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'vaul-browser',
					include: ['packages/vaul/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				// Octane-only real-browser contracts (unpaired snap-point drag).
				// Kept out of react-parity ownership and the vaul-browser inventory.
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'vaul-browser-conformance',
					include: ['packages/vaul/tests/browser-conformance/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'remix-router-differential',
					include: ['packages/remix-router/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for router fixtures: also rewrites
					// `@octanejs/remix-router` → `react-router` so the React side runs the
					// real react-router adapter over the SAME (vendored-equal) core.
					globalSetup: ['packages/remix-router/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/remix-router` is the package under test; alias the public
				// name (and subpaths — `/dom` → src/dom.ts) to source so fixtures import
				// it exactly as a consumer would (and the differential React side
				// rewrites the same specifiers to `react-router`).
				resolve: {
					alias: [
						{
							find: /^@octanejs\/remix-router$/,
							replacement: resolve(import.meta.dirname, 'packages/remix-router/src/index.ts'),
						},
						{
							find: /^@octanejs\/remix-router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/remix-router/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// All paired React/Octane characterization (root suite + View canary). Octane-only
				// contracts stay in drei-guards so differential ownership stays non-overlapping.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'drei-differential',
					include: ['packages/drei/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/drei/tests/config.test.ts',
						'packages/drei/tests/crosswalk-guard.test.ts',
						'packages/drei/tests/react-parity-guard.test.ts',
						'packages/drei/tests/view-renderer-boundary.test.ts',
						'packages/drei/tests/octane-contracts/**/*.test.ts',
						'packages/drei/tests/browser/**/*.browser.test.ts',
					],
					environment: 'jsdom',
					globals: false,
					server: { deps: { inline: ['@react-three/drei', '@react-three/fiber'] } },
				},
				plugins: [octane({ renderers: DREI_RENDERERS })],
				resolve: {
					alias: [
						...THREE_ALIASES,
						{
							find: /^@octanejs\/drei$/,
							replacement: resolve(import.meta.dirname, 'packages/drei/src/index.ts'),
						},
					],
					dedupe: ['react', 'react-dom', 'three'],
				},
			},
			{
				test: {
					name: 'drei-guards',
					include: [
						'packages/drei/tests/config.test.ts',
						'packages/drei/tests/crosswalk-guard.test.ts',
						'packages/drei/tests/react-parity-guard.test.ts',
						'packages/drei/tests/view-renderer-boundary.test.ts',
						'packages/drei/tests/octane-contracts/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
					server: { deps: { inline: ['@react-three/drei', '@react-three/fiber'] } },
				},
				plugins: [octane({ renderers: DREI_RENDERERS })],
				resolve: {
					alias: [
						...THREE_ALIASES,
						{
							find: /^@octanejs\/drei$/,
							replacement: resolve(import.meta.dirname, 'packages/drei/src/index.ts'),
						},
					],
					dedupe: ['react', 'react-dom', 'three'],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'streamdown-differential',
					include: ['packages/streamdown/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/streamdown/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: STREAMDOWN_ALIASES,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tanstack-ai-differential',
					include: ['packages/tanstack-ai/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-ai/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-ai$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-ai/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'doom',
					include: ['playground/octane/src/demos/doom/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				testExecution: { group: 'heavy-browser', browsers: ['chromium'] },
				test: {
					name: 'doom-browser',
					include: ['playground/octane/tests/doom/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'drei-adapted-browser',
					include: ['packages/drei/tests/browser/**/*.browser.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
				plugins: [octane({ renderers: DREI_RENDERERS })],
				resolve: {
					alias: [
						...THREE_ALIASES,
						{
							find: /^@octanejs\/drei$/,
							replacement: resolve(import.meta.dirname, 'packages/drei/src/index.ts'),
						},
					],
					dedupe: ['react', 'react-dom', 'three'],
				},
			},
			{
				test: {
					name: 'input-otp-pristine-browser',
					include: ['packages/input-otp/tests/pristine/**/*.browser.test.ts'],
					environment: 'node',
					globals: false,
					fileParallelism: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
				testExecution: { group: 'react-parity' },
			},
			{
				test: {
					name: 'input-otp-differential',
					include: ['packages/input-otp/tests/differential/**/*.test.tsx'],
					environment: 'jsdom',
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/input-otp$/,
							replacement: resolve(import.meta.dirname, 'packages/input-otp/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'input-otp',
					include: [
						'packages/input-otp/tests/conformance/**/*.test.ts',
						'packages/input-otp/tests/hydration/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/input-otp$/,
							replacement: resolve(import.meta.dirname, 'packages/input-otp/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'input-otp-server',
					include: ['packages/input-otp/tests/ssr/**/*.server.test.ts'],
					environment: 'node',
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/input-otp$/,
							replacement: resolve(import.meta.dirname, 'packages/input-otp/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'input-otp-browser',
					include: [
						'packages/input-otp/tests/browser/**/*.spec.ts',
						'packages/input-otp/tests/browser/**/*.browser.test.ts',
					],
					environment: 'node',
					globals: false,
					fileParallelism: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
				testExecution: { group: 'react-parity' },
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tanstack-form-differential',
					include: ['packages/tanstack-form/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-form/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-form$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-form/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// This lane remains optional while its provenance is unverified, so ordinary
				// shards must retain it until the manifest promotes it to required evidence.
				test: {
					name: 'tanstack-query-differential',
					include: ['packages/tanstack-query/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile for query fixtures: rewrites
					// `@octanejs/tanstack-query` → `@tanstack/react-query` so the React side runs
					// real react-query.
					globalSetup: ['packages/tanstack-query/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-query$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-query\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-query-ssr',
					include: ['packages/tanstack-query/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-query$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-query/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tanstack-router-differential',
					include: ['packages/tanstack-router/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Differential precompile for router fixtures: rewrites
					// `@octanejs/tanstack-router` → `@tanstack/react-router` so the React side
					// runs real react-router.
					globalSetup: ['packages/tanstack-router/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-router$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Octane-only Node SSR framework contract; not a React SSR oracle.
				test: {
					name: 'tanstack-router-ssr',
					include: ['packages/tanstack-router/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-router\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-router/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tanstack-store-pristine',
					include: ['packages/tanstack-store/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				// Spawns the vendored @xstate/react@6.1.0 suite in a child Vitest run
				// against real React, after re-hashing every vendored byte. The wrapper
				// asserts the child's passing identities against the recorded inventory.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'xstate-pristine',
					include: ['packages/xstate/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				test: {
					name: 'xstate-ssr',
					include: ['packages/xstate/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/xstate$/,
							replacement: resolve(import.meta.dirname, 'packages/xstate/src/index.ts'),
						},
					],
				},
			},
			{
				// parity.test.ts is parity-owned; setup.test.ts stays ordinary CI.
				testExecution: {
					group: 'react-parity',
					include: ['packages/xstate/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'xstate-differential',
					include: ['packages/xstate/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/xstate/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						...XSTATE_REACT_ALIASES,
						{
							find: /^@octanejs\/xstate$/,
							replacement: resolve(import.meta.dirname, 'packages/xstate/src/index.ts'),
						},
					],
				},
			},
			{
				// Same shape for the vendored @xstate/store-react@2.0.0 suite, whose
				// tests upstream colocates with its source.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'xstate-store-pristine',
					include: ['packages/xstate-store/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					sequence: { groupOrder: 1 },
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tanstack-store-differential',
					include: ['packages/tanstack-store/tests/differential/parity.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-store/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						// The shared differential rig lives under packages/octane, whose
						// React dependency can differ from this package's pinned oracle.
						// Resolve the renderer and compiled fixture to one React instance.
						...TANSTACK_STORE_REACT_ALIASES,
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				// Isolated differential ownership: react-parity:check runs this lane
				// via selectHarnessAction while ordinary Vitest shards omit it.
				// recorded-unverified provenance still blocks a verified parity claim.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tanstack-table-differential',
					include: ['packages/tanstack-table/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for table fixtures: also rewrites
					// `@octanejs/tanstack-table` → `@tanstack/react-table` so the React side
					// runs the real react-table adapter over the SAME table-core.
					globalSetup: ['packages/tanstack-table/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/tanstack-table` is the package under test; alias the public
				// name (and subpaths) to source so fixtures import it exactly as a
				// consumer would (and the differential React side rewrites the same
				// specifiers to `@tanstack/react-table`).
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-table$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-table/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-table\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-table/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Octane-only SSR contract — no React SSR counterpart, so it stays in
				// ordinary shards rather than react-parity ownership.
				test: {
					name: 'tanstack-virtual-ssr',
					include: ['packages/tanstack-virtual/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-virtual$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-virtual/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-virtual\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-virtual/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Compiler-control unit tests for the differential harness. Ordinary
				// project: not differential React/Octane evidence.
				test: {
					name: 'tanstack-virtual-differential-setup',
					include: ['packages/tanstack-virtual/tests/differential/setup.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				// Same-fixture React/Octane scenarios — parity-owned regardless of
				// provenance status. Compiler-control and Octane-only SSR stay ordinary.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tanstack-virtual-differential',
					include: ['packages/tanstack-virtual/tests/differential/parity.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for virtualizer fixtures: also
					// rewrites `@octanejs/tanstack-virtual` → `@tanstack/react-virtual` so
					// the React side runs the real react-virtual adapter over the SAME
					// virtual-core.
					globalSetup: ['packages/tanstack-virtual/tests/differential/_setup.ts'],
					setupFiles: ['packages/tanstack-virtual/tests/_setup.ts'],
					// jsdom affordances virtual-core needs (no-op ResizeObserver,
					// Element.scrollTo shim, MAX_SAFE_INTEGER scroll dimensions) —
					// installed once for the whole project so BOTH differential sides
					// share them.
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/tanstack-virtual` is the package under test; alias the
				// public name (and subpaths) to source so fixtures import it exactly as
				// a consumer would (and the differential React side rewrites the same
				// specifiers to `@tanstack/react-virtual`).
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-virtual$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-virtual/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-virtual\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-virtual/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tiptap-pristine',
					include: ['packages/tiptap/upstream/src/**/*.spec.ts'],
					environment: 'jsdom',
					globals: false,
					setupFiles: ['packages/tiptap/tests/_harness/verify-upstream.ts'],
				},
				oxc: {
					jsx: {
						runtime: 'automatic',
						importSource: 'react',
					},
				},
				resolve: {
					alias: [
						{
							find: /^@tiptap\/react\/menus$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/tiptap/upstream/src/menus/index.ts',
							),
						},
						{
							find: /^@tiptap\/react$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/upstream/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tiptap-upstream',
					include: ['packages/tiptap/tests/upstream/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tiptap\/menus$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/menus/index.ts'),
						},
						{
							find: /^@octanejs\/tiptap$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'tiptap-differential',
					include: ['packages/tiptap/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/tiptap/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tiptap\/menus$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/menus/index.ts'),
						},
						{
							find: /^@octanejs\/tiptap$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/valtio/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'valtio-differential',
					include: ['packages/valtio/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
					globalSetup: ['packages/valtio/tests/differential/_setup.ts'],
				},

				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/valtio$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/index.ts'),
						},
						{
							find: /^@octanejs\/valtio\/react\/utils$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/react/utils.ts'),
						},
						{
							find: /^@octanejs\/valtio\/react$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/react.ts'),
						},
						{
							find: /^@octanejs\/valtio\/vanilla\/utils$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/vanilla/utils.ts'),
						},
						{
							find: /^@octanejs\/valtio\/vanilla$/,
							replacement: resolve(import.meta.dirname, 'packages/valtio/src/vanilla.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/visx/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'visx-differential',
					include: ['packages/visx/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/visx/tests/differential/_setup.ts'],
					globals: false,
					testTimeout: 30_000,
					server: { deps: { inline: [/^@visx\//] } },
				},
				plugins: [octane(), visxCoverageSource()],
				resolve: { alias: VISX_ALIASES },
			},
			{
				// parity.test.ts is parity-owned; setup.test.ts stays ordinary CI.
				testExecution: {
					group: 'react-parity',
					include: ['packages/zustand/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'zustand-differential',
					include: ['packages/zustand/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for zustand fixtures: also rewrites
					// `@octanejs/zustand` → `zustand` so the React side runs real zustand.
					globalSetup: ['packages/zustand/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/zustand` is the package under test; alias the public name
				// (and its subpaths) to source so fixtures import it exactly as a consumer
				// would (and the differential React side rewrites the same specifiers to
				// `zustand`). Regex aliases so `@octanejs/zustand/shallow` → src/shallow.ts
				// without the bare entry's file path swallowing the subpath.
				resolve: {
					alias: [
						{
							find: /^@octanejs\/zustand$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src/index.ts'),
						},
						{
							find: /^@octanejs\/zustand\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'motion-pristine',
					include: ['packages/motion/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'motion-upstream',
					include: ['packages/motion/tests/upstream/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/motion$/,
							replacement: resolve(import.meta.dirname, 'packages/motion/src/index.ts'),
						},
						{
							find: /^@octanejs\/motion\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/motion/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'motion-differential',
					include: ['packages/motion/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/motion/tests/differential/_setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/motion$/,
							replacement: resolve(import.meta.dirname, 'packages/motion/src/index.ts'),
						},
						{
							find: /^@octanejs\/motion\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/motion/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'testing-library-differential',
					include: ['packages/testing-library/tests/differential.test.ts'],
					environment: 'jsdom',
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				// The binding's `.ts` sources call hooks with EXPLICIT slot symbols
				// (renderHook's harness component) — declared in its package.json, so the
				// auto-slotting pass skips them; the test files themselves stay included so
				// hook callbacks written inline in tests get their call-site slots.
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/dexie/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'dexie-differential',
					include: ['packages/dexie/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/dexie/tests/differential/_setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					setupFiles: ['packages/dexie/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/dexie$/,
							replacement: resolve(import.meta.dirname, 'packages/dexie/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/swr/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'swr',
					include: ['packages/swr/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/swr/upstream/**',
						'packages/swr/tests/differential/**/*.test.ts',
					],
					environment: 'happy-dom',
					fileParallelism: false,
					globals: false,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'swr-differential',
					include: ['packages/swr/tests/differential/**/*.test.ts'],
					environment: 'happy-dom',
					fileParallelism: false,
					globals: false,
				},
				plugins: [octane()],
			},
			{
				// Mixed project: only the same-fixture parity case is react-parity
				// owned. setup.test.ts is an Octane-only fail-closed compiler guard
				// and must stay on ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: ['packages/nuqs/tests/differential/parity.test.ts'],
				},
				test: {
					name: 'nuqs-differential',
					include: ['packages/nuqs/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/nuqs/tests/differential/_setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				// `@octanejs/nuqs` is the package under test; alias the public name and
				// its subpaths (`./server`, `./testing`, `./adapters/*`) to source so
				// fixtures import it exactly as a consumer would. The `/server` alias is
				// listed before the catch-all because it maps to `index.server.ts`, not
				// `server.ts`; the regex catch-all then maps `@octanejs/nuqs/adapters/react`
				// -> `src/adapters/react.ts` without the bare entry swallowing the subpath.
				resolve: {
					alias: [
						{
							find: /^@octanejs\/nuqs$/,
							replacement: resolve(import.meta.dirname, 'packages/nuqs/src/index.ts'),
						},
						{
							find: /^@octanejs\/nuqs\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/nuqs/src/index.server.ts'),
						},
						{
							find: /^@octanejs\/nuqs\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/nuqs/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Octane-only Node server probes — not react-parity group-owned.
				test: {
					name: 'nuqs-ssr',
					include: ['packages/nuqs/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				resolve: {
					alias: [
						{
							find: /^@octanejs\/nuqs\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/nuqs/src/index.server.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'three-differential',
					include: ['packages/three/tests/**/*differential.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/three/tests/_react-setup.ts'],
					globals: false,
					server: { deps: { inline: ['@react-three/fiber'] } },
				},
				plugins: [octane({ renderers: THREE_RENDERERS })],
				resolve: { alias: THREE_ALIASES, dedupe: ['react', 'react-dom', 'three'] },
			},
			{
				// Byte-exact upstream Vitest suite only. Wholly react-parity owned so the
				// ordinary shards never re-run the pristine oracle. The inventory wrapper
				// lives in the ordinary react-dropzone project so vitest-full selection of
				// the two canonical specs is not mixed with a non-upstream file.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'dropzone-pristine',
					include: ['packages/dropzone/upstream/src/**/*.spec.{ts,tsx}'],
					environment: 'jsdom',
					globals: true,
					clearMocks: true,
					setupFiles: ['packages/dropzone/upstream/test-setup.js'],
					fileParallelism: false,
				},
			},
			{
				// Adapted upstream cases are parity-owned; architecture/hydration probes and
				// the pristine inventory wrapper are Octane-authored evidence checks and stay
				// in the ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: ['packages/dropzone/tests/adapted/**/*.spec.ts'],
				},
				test: {
					name: 'dropzone',
					include: [
						'packages/dropzone/tests/adapted/**/*.spec.ts',
						'packages/dropzone/tests/pristine/upstream-runtime.test.ts',
						'packages/dropzone/tests/probes/architecture.test.ts',
						'packages/dropzone/tests/probes/hydration.test.ts',
					],
					exclude: [
						...configDefaults.exclude,
						'packages/dropzone/tests/differential/**/*.test.ts',
						'packages/dropzone/tests/probes/browser/**/*.test.ts',
						'packages/dropzone/tests/probes/server.test.ts',
					],
					environment: 'jsdom',
					globals: false,
					fileParallelism: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/dropzone$/,
							replacement: resolve(import.meta.dirname, 'packages/dropzone/src/index.tsrx'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'dropzone-differential',
					include: ['packages/dropzone/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
					fileParallelism: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/dropzone$/,
							replacement: resolve(import.meta.dirname, 'packages/dropzone/src/index.tsrx'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src') + '/$1.ts',
						},
					],
				},
			},
			{
				// Octane-only real-browser probe: no React oracle, so the heavy browser
				// lane owns it instead of either React parity or ordinary shards.
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'dropzone-browser',
					include: ['packages/dropzone/tests/probes/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				// Octane-only SSR conformance probe: no React/upstream oracle, so it
				// stays in ordinary shards rather than claiming adapted-server evidence.
				test: {
					name: 'dropzone-ssr',
					include: ['packages/dropzone/tests/probes/server.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'aria-differential',
					include: ['packages/aria/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// React-side fixtures import the real React Aria graph, so prepare them
					// only for the dedicated differential project.
					globalSetup: ['packages/aria/tests/differential/_setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/aria$/,
							replacement: resolve(import.meta.dirname, 'packages/aria/src/index.ts'),
						},
						{
							find: /^@octanejs\/aria\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/aria/src') + '/$1/index.ts',
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'base-ui-differential',
					include: ['packages/base-ui/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/base-ui/tests/differential/_setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/base-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/base-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'base-ui-upstream-adapted',
					include: ['packages/base-ui/tests/upstream/**/*.test.ts'],
					environment: 'jsdom',
					testTimeout: 30_000,
					hookTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/base-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/base-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/base-ui/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'cmdk-differential',
					include: ['packages/cmdk/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					testTimeout: 30_000,
					hookTimeout: 30_000,
					setupFiles: ['packages/cmdk/tests/_setup.ts'],
					globalSetup: ['packages/cmdk/tests/differential/_setup.ts'],
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/cmdk$/,
							replacement: resolve(import.meta.dirname, 'packages/cmdk/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'cmdk-parity-audit',
					include: ['packages/cmdk/tests/parity/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'dnd-kit-parity-audit',
					include: ['packages/dnd-kit/tests/parity/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'radix-differential',
					include: ['packages/radix/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					// Rewrites `@octanejs/radix` to `radix-ui` so the second side runs
					// the exact workspace-pinned React oracle.
					globalSetup: ['packages/radix/tests/differential/_setup.ts'],
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/radix$/,
							replacement: resolve(import.meta.dirname, 'packages/radix/src/index.ts'),
						},
						{
							find: /^@octanejs\/radix\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/radix/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'radix-parity-audit',
					include: ['packages/radix/tests/parity/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'tanstack-pacer-adapted',
					include: ['packages/tanstack-pacer/tests/adapted/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-pacer$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-pacer/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-pacer\/(.*)$/,
							replacement:
								resolve(import.meta.dirname, 'packages/tanstack-pacer/src') + '/$1/index.ts',
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-pacer-differential',
					include: ['packages/tanstack-pacer/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-pacer/tests/differential/_setup.ts'],
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-pacer$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-pacer/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-pacer\/(.*)$/,
							replacement:
								resolve(import.meta.dirname, 'packages/tanstack-pacer/src') + '/$1/index.ts',
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-pacer-parity-audit',
					include: ['packages/tanstack-pacer/tests/parity/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'tanstack-devtools-differential',
					include: ['packages/tanstack-devtools/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-devtools/tests/differential/_setup.ts'],
					globals: false,
				},
				testExecution: { group: 'react-parity' },
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-devtools$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-devtools/src/index.ts'),
						},
						{
							find: /^@tanstack\/react-devtools$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/tanstack-devtools/tests/differential/.react-cache/react-devtools.js',
							),
						},
					],
				},
			},
			{
				test: {
					name: 'tanstack-devtools-parity-audit',
					include: ['packages/tanstack-devtools/tests/parity/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/markdown/tests/conformance/public-types.test.ts',
						'packages/markdown/tests/conformance/sync.server.test.ts',
						'packages/markdown/tests/async/markdown-async.server.test.ts',
						'packages/markdown/tests/hooks/markdown-hooks.test.ts',
						'packages/markdown/tests/validation.test.ts',
						'packages/markdown/tests/differential/processor.test.ts',
						'packages/markdown/tests/differential/url-transform.test.ts',
					],
				},
				test: {
					name: 'markdown',
					include: ['packages/markdown/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/markdown/tests/pristine/**/*.test.ts',
						'packages/markdown/tests/parity/differential.test.ts',
					],
					environment: 'node',
					globals: false,
					// The public-api conformance probe imports src/index inside the test
					// body, so the package's first Octane compile counts against the test
					// timeout and can exceed the 5s default under parity-batch contention.
					testTimeout: 30_000,
					hookTimeout: 30_000,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'markdown-differential',
					include: ['packages/markdown/tests/parity/differential.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				// Upstream-adapted inventory owns tests/upstream/**; behavior,
				// measurement, and hydration stay in the ordinary shards.
				testExecution: {
					group: 'react-parity',
					include: ['packages/textarea-autosize/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'textarea-autosize',
					include: ['packages/textarea-autosize/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/textarea-autosize/tests/browser/**/*.test.ts',
						'packages/textarea-autosize/tests/ssr/**/*.test.ts',
						'packages/textarea-autosize/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
					server: {
						deps: {
							inline: ['use-composed-ref', 'use-isomorphic-layout-effect', 'use-latest'],
						},
					},
				},
				plugins: [octane({ requireDirective: true }), react()],
				resolve: {
					dedupe: ['react', 'react-dom'],
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/index.ts'),
						},
						{
							find: /^use-composed-ref$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_COMPOSED_REF,
						},
						{
							find: /^use-isomorphic-layout-effect$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_ISOMORPHIC_LAYOUT_EFFECT,
						},
						{
							find: /^use-latest$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_LATEST,
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'textarea-autosize-differential',
					include: ['packages/textarea-autosize/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
					server: {
						deps: {
							inline: ['use-composed-ref', 'use-isomorphic-layout-effect', 'use-latest'],
						},
					},
				},
				plugins: [octane({ requireDirective: true }), react()],
				resolve: {
					dedupe: ['react', 'react-dom'],
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/index.ts'),
						},
						{
							find: /^use-composed-ref$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_COMPOSED_REF,
						},
						{
							find: /^use-isomorphic-layout-effect$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_ISOMORPHIC_LAYOUT_EFFECT,
						},
						{
							find: /^use-latest$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_LATEST,
						},
					],
				},
			},
			{
				// The React server-visible contract is parity evidence; the
				// Octane-only browser-global/server assertion stays ordinary.
				testExecution: {
					group: 'react-parity',
					include: ['packages/textarea-autosize/tests/ssr/react-contract.test.ts'],
				},
				test: {
					name: 'textarea-autosize-ssr',
					include: ['packages/textarea-autosize/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
					server: {
						deps: {
							inline: ['use-composed-ref', 'use-isomorphic-layout-effect', 'use-latest'],
						},
					},
				},
				plugins: [octane({ requireDirective: true, ssr: true }), react()],
				resolve: {
					dedupe: ['react', 'react-dom'],
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^use-composed-ref$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_COMPOSED_REF,
						},
						{
							find: /^use-isomorphic-layout-effect$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_ISOMORPHIC_LAYOUT_EFFECT,
						},
						{
							find: /^use-latest$/,
							replacement: REACT_TEXTAREA_AUTOSIZE_USE_LATEST,
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'textarea-autosize-browser',
					include: ['packages/textarea-autosize/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 30_000,
					hookTimeout: 30_000,
				},
			},
			{
				// Adapted upstream suite is parity-owned; feasibility, races, hydration,
				// and negative controls remain ordinary Octane conformance coverage.
				testExecution: {
					group: 'react-parity',
					include: ['packages/syntax-highlighter/tests/adapted/**/*.test.ts'],
				},
				test: {
					name: 'syntax-highlighter',
					fileParallelism: false,
					include: [
						'packages/syntax-highlighter/tests/**/*.test.ts',
						'!packages/syntax-highlighter/tests/ssr/**/*.test.ts',
						'!packages/syntax-highlighter/tests/browser/**/*.test.ts',
						'!packages/syntax-highlighter/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'syntax-highlighter-differential',
					include: ['packages/syntax-highlighter/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'syntax-highlighter-browser',
					include: ['packages/syntax-highlighter/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					fileParallelism: false,
					testTimeout: 120_000,
					hookTimeout: 120_000,
				},
				plugins: [octane()],
			},
			{
				// Octane-only SSR assertions (no React/upstream oracle) stay ordinary.
				test: {
					name: 'syntax-highlighter-ssr',
					include: ['packages/syntax-highlighter/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'playwright-browser-selector',
					include: [
						'test-utils/playwright-browser.test.ts',
						'test-utils/three-playwright-launch.test.ts',
					],
					environment: 'node',
					globals: false,
				},
			},
			{
				test: {
					name: 'window-feasibility',
					include: ['packages/window/tests/feasibility/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'window-pristine',
					include: ['packages/window/upstream/lib/**/*.test.{ts,tsx}'],
					environment: 'jsdom',
					setupFiles: ['packages/window/upstream/vitest.setup.js'],
					globals: false,
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/window/tests/upstream/**/*.test.{ts,tsx}'],
				},
				test: {
					name: 'window-adapted',
					include: ['packages/window/tests/upstream/**/*.test.{ts,tsx}'],
					environment: 'jsdom',
					setupFiles: ['packages/window/tests/upstream-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'window',
					include: [
						'packages/window/tests/runtime/**/*.test.ts',
						'packages/window/tests/hydration.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'window-differential',
					include: ['packages/window/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/window/tests/differential/_setup.ts'],
					setupFiles: ['packages/window/tests/upstream-setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/index.ts'),
						},
						{
							find: /^@octanejs\/window$/,
							replacement: resolve(import.meta.dirname, 'packages/window/src/index.ts'),
						},
						{
							find: /^@octanejs\/testing-library$/,
							replacement: resolve(import.meta.dirname, 'packages/testing-library/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'window-ssr',
					include: ['packages/window/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'draggable-pristine',
					include: ['packages/draggable/tests/upstream-original.test.ts'],
					environment: 'node',
					sequence: { groupOrder: 1 },
					globals: false,
					testTimeout: 120_000,
					hookTimeout: 120_000,
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/draggable/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'draggable',
					include: [
						'packages/draggable/tests/upstream/**/*.test.ts',
						'packages/draggable/tests/runtime/**/*.test.ts',
					],
					exclude: [
						...configDefaults.exclude,
						'packages/draggable/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'draggable-differential',
					include: ['packages/draggable/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				test: {
					name: 'draggable-hydration',
					include: ['packages/draggable/tests/hydration/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				test: {
					name: 'draggable-ssr',
					include: ['packages/draggable/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/draggable/tests/browser/parity.browser.test.ts'],
				},
				test: {
					name: 'draggable-browser',
					include: ['packages/draggable/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				test: {
					name: 'draggable-feasibility',
					include: [
						'packages/draggable/tests/feasibility/**/*.test.ts',
						'!packages/draggable/tests/feasibility/ssr.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				test: {
					name: 'draggable-feasibility-ssr',
					include: ['packages/draggable/tests/feasibility/ssr.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				// Fully parity-owned: omit testExecution.include so the sharded
				// view drops the whole project instead of retaining an empty one.
				testExecution: { group: 'react-parity' },
				test: {
					name: 'colorful-upstream',
					include: ['packages/colorful/tests/upstream/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				test: {
					name: 'colorful',
					include: ['packages/colorful/tests/runtime/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'colorful-differential',
					include: ['packages/colorful/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/colorful/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
			},
			{
				test: {
					name: 'colorful-hydration',
					include: ['packages/colorful/tests/hydration/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				test: {
					name: 'colorful-ssr',
					include: ['packages/colorful/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'colorful-browser',
					include: ['packages/colorful/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				testExecution: {
					group: 'react-parity',
					include: [
						'packages/popper/tests/upstream/**/*.test.ts',
						'packages/popper/tests/upstream/**/*.test.tsx',
					],
				},
				test: {
					name: 'popper',
					include: [
						'packages/popper/tests/runtime/**/*.test.ts',
						'packages/popper/tests/upstream/**/*.test.ts',
						'packages/popper/tests/upstream/**/*.test.tsx',
					],
					exclude: [...configDefaults.exclude],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/popper$/,
							replacement: resolve(import.meta.dirname, 'packages/popper/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'popper-hydration',
					include: ['packages/popper/tests/hydration/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/popper$/,
							replacement: resolve(import.meta.dirname, 'packages/popper/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'popper-differential',
					include: ['packages/popper/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/popper/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/popper$/,
							replacement: resolve(import.meta.dirname, 'packages/popper/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'popper-ssr',
					include: ['packages/popper/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/popper$/,
							replacement: resolve(import.meta.dirname, 'packages/popper/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'popper-browser',
					include: ['packages/popper/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				testExecution: {
					group: 'heavy-browser',
					include: ['packages/pdf/tests/feasibility/pdfjs.browser.test.ts'],
				},
				test: {
					name: 'pdf-feasibility',
					include: ['packages/pdf/tests/feasibility/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/pdf/tests/feasibility/*.server.test.ts',
						'packages/pdf/tests/feasibility/*.hydration.test.ts',
					],
					environment: 'node',
					globals: false,
					fileParallelism: false,
				},
				plugins: [octane()],
			},
			{
				test: {
					name: 'pdf-feasibility-ssr',
					include: ['packages/pdf/tests/feasibility/*.server.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^octane\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'pdf-feasibility-hydration',
					include: ['packages/pdf/tests/feasibility/*.hydration.test.ts'],
					environment: 'jsdom',
					globals: false,
					testTimeout: 30_000,
					hookTimeout: 30_000,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'pdf-browser',
					include: ['packages/pdf/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					fileParallelism: false,
				},
				plugins: [octane()],
			},
			{
				testExecution: {
					group: 'react-parity',
					include: ['packages/pdf/tests/runtime/private-evidence.test.ts'],
				},
				test: {
					name: 'pdf',
					include: [
						'packages/pdf/tests/runtime/**/*.test.ts',
						'packages/pdf/tests/contracts/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'pdf-pristine',
					include: ['packages/pdf/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
					fileParallelism: false,
					testTimeout: 180_000,
					hookTimeout: 180_000,
				},
			},
			{
				test: {
					name: 'pdf-packed',
					include: ['packages/pdf/tests/packed/**/*.test.ts'],
					environment: 'node',
					globals: false,
					fileParallelism: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
				plugins: [octane()],
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'pdf-parity',
					include: ['packages/pdf/tests/parity/**/*.test.ts'],
					environment: 'node',
					globals: false,
					fileParallelism: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
				plugins: [octane()],
			},
			{
				test: {
					name: 'pdf-ssr',
					include: ['packages/pdf/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^octane\/server$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/pdf$/,
							replacement: resolve(import.meta.dirname, 'packages/pdf/src/index.server.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'monaco-editor-pristine',
					include: ['packages/monaco-editor/tests/upstream-original.test.ts'],
					environment: 'node',
					sequence: { groupOrder: 1 },
					globals: false,
				},
			},
			{
				// Adapted upstream snapshot ports + harness negatives + hydration.
				testExecution: {
					group: 'react-parity',
					include: ['packages/monaco-editor/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'monaco-editor-adapted',
					include: [
						'packages/monaco-editor/tests/upstream/**/*.test.ts',
						'packages/monaco-editor/tests/harness/**/*.test.ts',
						'packages/monaco-editor/tests/hydration/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
					testTimeout: 30_000,
					hookTimeout: 30_000,
				},
				plugins: [octane()],
				resolve: {
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: [
						{
							find: /^@monaco-editor\/loader$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/monaco-editor/tests/_mocks/loader.ts',
							),
						},
						{
							find: /^@octanejs\/monaco-editor$/,
							replacement: resolve(import.meta.dirname, 'packages/monaco-editor/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'monaco-editor-differential',
					include: ['packages/monaco-editor/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/monaco-editor/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					extensions: ['.tsrx', '.ts', '.tsx', '.mjs', '.js', '.jsx', '.json'],
					alias: [
						{
							find: /^@monaco-editor\/loader$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/monaco-editor/tests/_mocks/loader.ts',
							),
						},
						{
							find: /^@octanejs\/monaco-editor$/,
							replacement: resolve(import.meta.dirname, 'packages/monaco-editor/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'monaco-editor-ssr',
					include: ['packages/monaco-editor/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^@monaco-editor\/loader$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/monaco-editor/tests/_mocks/loader.ts',
							),
						},
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/monaco-editor$/,
							replacement: resolve(import.meta.dirname, 'packages/monaco-editor/src/index.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'heavy-browser' },
				test: {
					name: 'monaco-editor-browser',
					include: ['packages/monaco-editor/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				test: {
					name: 'image-crop',
					include: ['packages/image-crop/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/image-crop$/,
							replacement: resolve(import.meta.dirname, 'packages/image-crop/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'wouter',
					include: ['packages/wouter/tests/**/*.test.ts'],
					exclude: ['packages/wouter/tests/ssr.test.ts'],
					environment: 'jsdom',
					globals: false,
					setupFiles: ['packages/wouter/tests/setup.ts'],
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/wouter$/,
							replacement: resolve(import.meta.dirname, 'packages/wouter/src/index.ts'),
						},
						{
							find: /^@octanejs\/wouter\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/wouter/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'wouter-ssr',
					include: ['packages/wouter/tests/ssr.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/wouter$/,
							replacement: resolve(import.meta.dirname, 'packages/wouter/src/index.ts'),
						},
						{
							find: /^@octanejs\/wouter\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/wouter/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'html-react-parser',
					include: ['packages/html-react-parser/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/html-react-parser$/,
							replacement: resolve(import.meta.dirname, 'packages/html-react-parser/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'stick-to-bottom',
					include: ['packages/stick-to-bottom/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/stick-to-bottom$/,
							replacement: resolve(import.meta.dirname, 'packages/stick-to-bottom/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'content-loader',
					include: ['packages/content-loader/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/content-loader$/,
							replacement: resolve(import.meta.dirname, 'packages/content-loader/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'to-print',
					include: ['packages/to-print/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/to-print$/,
							replacement: resolve(import.meta.dirname, 'packages/to-print/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'calendar',
					include: ['packages/calendar/tests/**/*.test.ts', 'packages/calendar/tests/**/*.spec.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/calendar$/,
							replacement: resolve(import.meta.dirname, 'packages/calendar/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'auto-animate',
					include: ['packages/auto-animate/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/auto-animate$/,
							replacement: resolve(import.meta.dirname, 'packages/auto-animate/src/index.ts'),
						},
						{
							find: /^@octanejs\/auto-animate\/react$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/auto-animate/src/react/index.tsrx',
							),
						},
					],
				},
			},
			...['pristine', 'adapted'].map((lane) => ({
				testExecution: { group: 'react-parity' },
				test: {
					name: `react-map-gl-upstream-${lane}`,
					include: [`packages/react-map-gl/tests/upstream-util/${lane}.test.ts`],
					environment: 'jsdom',
					globals: false,
				},
				resolve: {
					alias: [
						{
							find: /^tape-promise\/tape$/,
							replacement: resolve(
								import.meta.dirname,
								'packages/react-map-gl/tests/_harness/tape-adapter.ts',
							),
						},
						{
							find: /^@vis\.gl\/react-mapbox\/(.*)$/,
							replacement:
								resolve(
									import.meta.dirname,
									lane === 'pristine'
										? 'packages/react-map-gl/upstream/src'
										: 'packages/react-map-gl/src',
								) + '/$1.ts',
						},
					],
				},
			})),
			{
				test: {
					name: 'portabletext',
					include: [
						'packages/portabletext/tests/**/*.test.ts',
						'!packages/portabletext/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					globalSetup: ['packages/portabletext/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/portabletext$/,
							replacement: resolve(import.meta.dirname, 'packages/portabletext/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'portabletext-ssr',
					include: ['packages/portabletext/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/portabletext$/,
							replacement: resolve(import.meta.dirname, 'packages/portabletext/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'sanity-icons',
					include: [
						'packages/sanity-icons/tests/**/*.test.ts',
						'!packages/sanity-icons/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					globalSetup: ['packages/sanity-icons/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/sanity-icons$/,
							replacement: resolve(import.meta.dirname, 'packages/sanity-icons/src/index.ts'),
						},
						{
							find: /^@octanejs\/sanity-icons\/(.*)$/,
							replacement:
								resolve(import.meta.dirname, 'packages/sanity-icons/src/exports') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'sanity-icons-ssr',
					include: ['packages/sanity-icons/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/sanity-icons$/,
							replacement: resolve(import.meta.dirname, 'packages/sanity-icons/src/index.ts'),
						},
						{
							find: /^@octanejs\/sanity-icons\/(.*)$/,
							replacement:
								resolve(import.meta.dirname, 'packages/sanity-icons/src/exports') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'sanity-logos',
					include: [
						'packages/sanity-logos/tests/**/*.test.ts',
						'!packages/sanity-logos/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					globalSetup: ['packages/sanity-logos/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/sanity-logos$/,
							replacement: resolve(import.meta.dirname, 'packages/sanity-logos/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'sanity-logos-ssr',
					include: ['packages/sanity-logos/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/sanity-logos$/,
							replacement: resolve(import.meta.dirname, 'packages/sanity-logos/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'sanity-loader',
					include: [
						'packages/sanity-loader/tests/**/*.test.ts',
						'!packages/sanity-loader/tests/ssr/**/*.test.ts',
					],
					environment: 'jsdom',
					globalSetup: ['packages/sanity-loader/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/sanity-loader$/,
							replacement: resolve(import.meta.dirname, 'packages/sanity-loader/src/index.ts'),
						},
						{
							find: /^@octanejs\/sanity-loader\/rsc$/,
							replacement: resolve(import.meta.dirname, 'packages/sanity-loader/src/rsc.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'sanity-loader-ssr',
					include: ['packages/sanity-loader/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane({ ssr: true })],
				resolve: {
					alias: [
						{
							find: /^octane$/,
							replacement: resolve(import.meta.dirname, 'packages/octane/src/server/index.ts'),
						},
						{
							find: /^@octanejs\/sanity-loader$/,
							replacement: resolve(import.meta.dirname, 'packages/sanity-loader/src/index.ts'),
						},
						{
							find: /^@octanejs\/sanity-loader\/rsc$/,
							replacement: resolve(import.meta.dirname, 'packages/sanity-loader/src/rsc.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'thinking-orbs',
					include: ['packages/thinking-orbs/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/thinking-orbs/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/thinking-orbs$/,
							replacement: resolve(import.meta.dirname, 'packages/thinking-orbs/src/index.ts'),
						},
						{
							find: /^@octanejs\/thinking-orbs\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/thinking-orbs/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'thinking-orbs-differential',
					include: ['packages/thinking-orbs/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/thinking-orbs/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/thinking-orbs$/,
							replacement: resolve(import.meta.dirname, 'packages/thinking-orbs/src/index.ts'),
						},
						{
							find: /^@octanejs\/thinking-orbs\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/thinking-orbs/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'puck',
					include: ['packages/puck/tests/**/*.test.ts'],
					exclude: [...configDefaults.exclude, 'packages/puck/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					testTimeout: 30_000,
					setupFiles: ['packages/puck/tests/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/puck$/,
							replacement: resolve(import.meta.dirname, 'packages/puck/src/index.ts'),
						},
						{
							find: /^@octanejs\/puck\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/puck/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/zustand$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src/index.ts'),
						},
						{
							find: /^@octanejs\/zustand\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/dnd-kit$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/hooks/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/sortable$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/sortable/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/utilities$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/utilities/index.ts'),
						},
						{
							find: /^@octanejs\/lucide$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src/index.ts'),
						},
						{
							find: /^@octanejs\/lucide\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/tanstack-pacer$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-pacer/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-pacer\/(.*)$/,
							replacement:
								resolve(import.meta.dirname, 'packages/tanstack-pacer/src') + '/$1/index.ts',
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'puck-differential',
					include: ['packages/puck/tests/differential/**/*.test.ts'],
					environment: 'jsdom',
					testTimeout: 30_000,
					globalSetup: ['packages/puck/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/puck$/,
							replacement: resolve(import.meta.dirname, 'packages/puck/src/index.ts'),
						},
						{
							find: /^@octanejs\/puck\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/puck/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/zustand$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src/index.ts'),
						},
						{
							find: /^@octanejs\/zustand\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/zustand/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/dnd-kit$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/hooks$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/hooks/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/sortable$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/sortable/index.ts'),
						},
						{
							find: /^@octanejs\/dnd-kit\/utilities$/,
							replacement: resolve(import.meta.dirname, 'packages/dnd-kit/src/utilities/index.ts'),
						},
						{
							find: /^@octanejs\/lucide$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src/index.ts'),
						},
						{
							find: /^@octanejs\/lucide\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/lucide/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/tanstack-pacer$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-pacer/src/index.ts'),
						},
						{
							find: /^@octanejs\/tanstack-pacer\/(.*)$/,
							replacement:
								resolve(import.meta.dirname, 'packages/tanstack-pacer/src') + '/$1/index.ts',
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
			{
				test: {
					name: 'blocknote',
					include: ['packages/blocknote/tests/**/*.test.ts'],
					environment: 'jsdom',
					testTimeout: 30_000,
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/blocknote$/,
							replacement: resolve(import.meta.dirname, 'packages/blocknote/src/index.ts'),
						},
						{
							find: /^@octanejs\/blocknote\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/blocknote/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/tiptap$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src/index.ts'),
						},
						{
							find: /^@octanejs\/tiptap\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/tiptap/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/floating-ui$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src/index.ts'),
						},
						{
							find: /^@octanejs\/floating-ui\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/floating-ui/src') + '/$1.ts',
						},
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
						},
					],
				},
			},
		],
	},
});
