import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import { octane } from './packages/octane/src/compiler/vite.js';
import { octaneMdx } from './packages/mdx/src/vite.js';
import { stylex } from './packages/stylex/src/vite.js';
import { lynxRspeedyRenderers } from './packages/lynx/src/config.runtime.js';
import { threeRenderers as THREE_RENDERERS } from './packages/three/src/config.ts';
import { websiteMdxOptions } from './website/mdx-options.ts';

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
			{
				test: {
					name: 'octane',
					// The individual cases here run in milliseconds; the 5s default was
					// being tripped by machine contention, not by the code under test
					// (control-flow, hmr, and differential files each failed this way in
					// a full run while passing alone). A 20s ceiling absorbs a saturated
					// machine and still catches a genuine hang.
					testTimeout: 20_000,
					include: ['packages/octane/tests/**/*.test.tsrx', 'packages/octane/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/octane/tests/profiling-runtime.test.tsrx',
						'packages/octane/tests/devtools-runtime.test.tsrx',
						'packages/octane/tests/devtools-transitions.test.tsrx',
						'packages/octane/tests/browser/**/*.test.ts',
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
					// Same contention budget as the `octane` project above: this one re-runs
					// the runtime suite, so it is on the machine at the same moment and
					// fails the same way.
					testTimeout: 20_000,
					include: ['packages/octane/tests/**/*.test.tsrx', 'packages/octane/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
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
				test: {
					name: 'octane-events-browser',
					include: ['packages/octane/tests/browser/**/*.test.ts'],
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
			{
				test: {
					name: 'zustand',
					include: ['packages/zustand/tests/**/*.test.ts'],
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
					name: 'valtio',
					include: ['packages/valtio/tests/**/*.test.ts'],
					environment: 'jsdom',
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
				test: {
					name: 'nuqs',
					include: ['packages/nuqs/tests/**/*.test.ts'],
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
				// Parity-owned adapted / differential projects are separate
				// (see packages/inertia/audit/react-parity.json).
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
					include: ['packages/tanstack-hotkeys/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'tanstack-hotkeys',
					include: ['packages/tanstack-hotkeys/tests/**/*.test.ts'],
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
					include: ['packages/tanstack-pacer/tests/**/*.test.ts'],
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
					name: 'solana-react',
					include: ['packages/solana-react/tests/**/*.test.ts'],
					exclude: [
						...configDefaults.exclude,
						'packages/solana-react/tests/upstream/**/*.test.ts',
						'packages/solana-react/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/solana-react$/,
							replacement: resolve(import.meta.dirname, 'packages/solana-react/src/index.ts'),
						},
						{
							find: /^@octanejs\/solana-react\/query$/,
							replacement: resolve(import.meta.dirname, 'packages/solana-react/src/query.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'solana-react-adapted',
					include: ['packages/solana-react/tests/upstream/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/solana-react$/,
							replacement: resolve(import.meta.dirname, 'packages/solana-react/src/index.ts'),
						},
						{
							find: /^@octanejs\/solana-react\/query$/,
							replacement: resolve(import.meta.dirname, 'packages/solana-react/src/query.ts'),
						},
					],
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'solana-react-pristine',
					include: ['packages/solana-react/tests/upstream-original.test.ts'],
					environment: 'node',
					globals: false,
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
				test: {
					name: 'tanstack-store',
					include: [
						'packages/tanstack-store/tests/conformance/**/*.test.ts',
						'packages/tanstack-store/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-store/tests/differential/_setup.ts'],
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/tanstack-store$/,
							replacement: resolve(import.meta.dirname, 'packages/tanstack-store/src/index.ts'),
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
				test: {
					name: 'tanstack-form',
					include: [
						'packages/tanstack-form/tests/conformance/**/*.test.ts',
						'packages/tanstack-form/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-form/tests/differential/_setup.ts'],
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
				test: {
					name: 'tanstack-ai',
					include: [
						'packages/tanstack-ai/tests/conformance/**/*.test.ts',
						'packages/tanstack-ai/tests/conformance/**/*.test.tsx',
						'packages/tanstack-ai/tests/differential/**/*.test.ts',
					],
					environment: 'jsdom',
					globalSetup: ['packages/tanstack-ai/tests/differential/_setup.ts'],
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
				test: {
					name: 'tanstack-table',
					include: ['packages/tanstack-table/tests/**/*.test.ts'],
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
				test: {
					name: 'remix-router',
					include: [
						'packages/remix-router/tests/conformance/**/*.test.ts',
						'packages/remix-router/tests/differential/**/*.test.ts',
					],
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
				// Static SSR (Phase F): the whole graph compiles in SERVER mode
				// (`octane({ ssr: true })`) and bare `octane` imports resolve to
				// `octane/server` (the website's octane-ssr-server-alias pattern) so
				// the binding's plain-.ts hooks run against the server runtime.
				// Node environment; the React side renders via react-dom/server over
				// the same react-cache compilation the client differential uses.
				test: {
					name: 'remix-router-ssr',
					include: ['packages/remix-router/tests/ssr/**/*.test.ts'],
					environment: 'node',
					globalSetup: ['packages/remix-router/tests/differential/_setup.ts'],
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
				test: {
					name: 'tanstack-virtual',
					include: ['packages/tanstack-virtual/tests/**/*.test.ts'],
					environment: 'jsdom',
					// Same differential precompile, but for virtualizer fixtures: also
					// rewrites `@octanejs/tanstack-virtual` → `@tanstack/react-virtual` so
					// the React side runs the real react-virtual adapter over the SAME
					// virtual-core.
					globalSetup: ['packages/tanstack-virtual/tests/differential/_setup.ts'],
					// jsdom affordances virtual-core needs (no-op ResizeObserver,
					// Element.scrollTo shim, MAX_SAFE_INTEGER scroll dimensions) —
					// installed once for the whole project so BOTH differential sides
					// share them.
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
					include: ['packages/tanstack-query/tests/**/*.test.ts'],
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
					globals: false,
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
				test: {
					name: 'three',
					include: ['packages/three/tests/**/*.test.ts'],
					// Compatibility lanes (CI swaps in a different Three release) select
					// Octane-owned behavior tests only: the differential oracle stays
					// pinned to its exact r172 pair and the browser suites depend on the
					// pinned bundle contract. Enforced HERE because the compat script's
					// CLI --exclude flags proved unreliable once `pnpm add
					// --lockfile=false` re-keys the workspace's vitest instances.
					exclude: [
						'packages/three/tests/browser/**/*.test.ts',
						...(process.env.OCTANE_THREE_COMPAT_VERSION !== undefined
							? ['packages/three/tests/**/*differential.test.ts']
							: []),
					],
					environment: 'jsdom',
					globalSetup: ['packages/three/tests/_react-setup.ts'],
					globals: false,
					server: { deps: { inline: ['@react-three/fiber'] } },
				},
				plugins: [octane({ renderers: THREE_RENDERERS })],
				resolve: { alias: THREE_ALIASES, dedupe: ['react', 'react-dom', 'three'] },
			},
			{
				test: {
					name: 'three-browser',
					include:
						process.env.OCTANE_THREE_COMPAT_VERSION === undefined
							? ['packages/three/tests/browser/**/*.test.ts']
							: [],
					environment: 'jsdom',
					globalSetup: ['packages/three/tests/_react-setup.ts'],
					globals: false,
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
						'packages/visx/tests/differential/**/*.test.ts',
						'packages/visx/tests/hydration/**/*.test.ts',
					],
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
					testTimeout: 30_000,
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
				test: {
					name: 'tanstack-router',
					include: ['packages/tanstack-router/tests/**/*.test.ts'],
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
					name: 'motion',
					include: ['packages/motion/tests/**/*.test.ts'],
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
					name: 'react-spring-pristine',
					include: ['packages/react-spring/tests/upstream-original.test.ts'],
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
					include: ['packages/react-spring/tests/upstream/**/*.test.ts'],
				},
				test: {
					name: 'react-spring',
					include: [
						'packages/react-spring/tests/conformance/**/*.test.ts',
						'packages/react-spring/tests/hydration/**/*.test.ts',
						'packages/react-spring/tests/upstream/**/*.test.ts',
					],
					exclude: [
						...configDefaults.exclude,
						'packages/react-spring/tests/upstream-original.test.ts',
					],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/react-spring$/,
							replacement: resolve(import.meta.dirname, 'packages/react-spring/src/index.ts'),
						},
						{
							find: /^@octanejs\/react-spring\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/react-spring/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'react-spring-ssr',
					include: ['packages/react-spring/tests/ssr/**/*.test.ts'],
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
							find: /^@octanejs\/react-spring$/,
							replacement: resolve(import.meta.dirname, 'packages/react-spring/src/index.ts'),
						},
						{
							find: /^@octanejs\/react-spring\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/react-spring/src') + '/$1.ts',
						},
					],
				},
			},
			{
				test: {
					name: 'react-spring-browser',
					include: ['packages/react-spring/tests/browser/**/*.test.ts'],
					environment: 'node',
					globals: false,
					testTimeout: 60_000,
					hookTimeout: 60_000,
				},
			},
			{
				testExecution: { group: 'react-parity' },
				test: {
					name: 'react-spring-differential',
					include: ['packages/react-spring/tests/differential/**/*.test.ts'],
					environment: 'node',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
						{
							find: /^@octanejs\/react-spring$/,
							replacement: resolve(import.meta.dirname, 'packages/react-spring/src/index.ts'),
						},
						{
							find: /^@octanejs\/react-spring\/(.*)$/,
							replacement: resolve(import.meta.dirname, 'packages/react-spring/src') + '/$1.ts',
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
						'packages/tiptap/tests/differential/**/*.test.ts',
						'packages/tiptap/tests/hydration/**/*.test.ts',
					],
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
				test: {
					name: 'monaco-editor',
					include: ['packages/monaco-editor/tests/**/*.test.ts'],
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
					environment: 'jsdom',
					globals: false,
				},
				// floating-ui's `.ts` hooks forward the caller's slot via subSlot — its
				// package.json declares manual hook slots, so the auto-slotting pass skips
				// them (the `.tsx` fixtures that call them are full-compiled and inject the
				// trailing slot).
				plugins: [octane()],
				resolve: {
					alias: [
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
					name: 'radix',
					include: ['packages/radix/tests/**/*.test.ts', 'packages/radix/tests/**/*.test.tsx'],
					environment: 'jsdom',
					// Differential precompile for radix fixtures: rewrites `@octanejs/radix` →
					// `radix-ui` so the React side runs the real Radix primitives.
					globalSetup: ['packages/radix/tests/differential/_setup.ts'],
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
					],
					environment: 'jsdom',
					// The differential fixtures import the real react-aria consumer modules
					// (useComboBox/useSelect pull in the whole overlays/listbox/menu graph); the
					// first mount compiles + imports that on a loaded CI shard, which overran the
					// 5s vitest default. Match the other differential-bearing projects at 30s.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					// Differential precompile for aria fixtures: rewrites `@octanejs/aria` →
					// `react-aria` (and `/stately` → `react-stately`, `/components` →
					// `react-aria-components`) so the React side runs the real React Aria.
					globalSetup: ['packages/aria/tests/differential/_setup.ts'],
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
					],
					environment: 'jsdom',
					// hydration.test.ts boots a real Vite server and SSR-compiles its fixture
					// inside the test body; on a loaded CI shard that overran the 5s vitest
					// default. Match the other differential-bearing projects at 30s.
					testTimeout: 30_000,
					hookTimeout: 30_000,
					// Differential precompile for base-ui fixtures: rewrites `@octanejs/base-ui/<sub>`
					// → `@base-ui-components/react/<sub>` so the React side runs real Base UI.
					globalSetup: ['packages/base-ui/tests/differential/_setup.ts'],
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
			// @vis.gl/react-mapbox's five framework-neutral util specs run BYTE-EXACT
			// from the vendored tree, once against upstream's own source and once
			// against the modules this port reuses. Both lanes passing is what backs
			// the "reused verbatim" claim in UPSTREAM.md; the pristine lane alone
			// would only prove upstream still works.
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
				test: {
					name: 'streamdown',
					include: [
						'packages/streamdown/tests/**/*.test.ts',
						'!packages/streamdown/tests/ssr/**/*.test.ts',
					],
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
				test: {
					name: 'cmdk',
					include: ['packages/cmdk/tests/**/*.test.ts', '!packages/cmdk/tests/ssr/**/*.test.ts'],
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
					// Differential precompile for cmdk fixtures: rewrites
					// `@octanejs/cmdk` → the real published `cmdk@1.1.1`.
					globalSetup: ['packages/cmdk/tests/differential/_setup.ts'],
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
				test: {
					name: 'testing-library',
					include: ['packages/testing-library/tests/**/*.test.ts'],
					environment: 'jsdom',
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
					include: ['packages/vite-plugin-octane/tests/**/*.test.ts'],
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
					hookTimeout: 320_000,
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
		],
	},
});
