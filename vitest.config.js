import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import { octane } from './packages/octane/src/compiler/vite.js';
import { octaneMdx } from './packages/mdx/src/vite.js';
import { stylex } from './packages/stylex/src/vite.js';
import { websiteMdxOptions } from './website/mdx-options.ts';

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
		projects: [
			{
				test: {
					name: 'octane',
					include: ['packages/octane/tests/**/*.test.tsrx', 'packages/octane/tests/**/*.test.ts'],
					exclude: [...configDefaults.exclude, 'packages/octane/tests/profiling-runtime.test.tsrx'],
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
					// The parallel-use pipeline (memoized creations, batched unwrap,
					// fetch-tree warming) runs at its DEFAULT (on). Tests that pin
					// the opt-out output call compile() with `parallelUse: false`.
					//
					// Bindings whose `.ts` sources hand-forward hook slots do not need
					// package-specific exclusions: they declare
					// `"octane": { "hookSlots": { "manual": ["src"] } }` in their own package.json and
					// the plugin skips them automatically (nearest-manifest lookup) — the
					// same declaration covers every project below, the website, examples,
					// and builds.
					octane(),
				],
			},
			{
				// The SAME octane test files compiled in PRODUCTION mode (`hmr: false`
				// → no HMR wrapper, no dev LOC metadata, plain Symbol("<hash>#<n>")
				// hook slots). Vitest runs the plugin in serve mode, so without this
				// project the prod compile branch has ZERO runtime coverage — which is
				// how the 2026-07-08 bare-Symbol() slot regression shipped past 2,400
				// green tests and broke website hydration on every route. Any test
				// that specifically asserts DEV-ONLY plugin output belongs in the
				// exclude list below (tests that call compile() with explicit flags
				// are unaffected — they control their own options).
				test: {
					name: 'octane-prod',
					include: ['packages/octane/tests/**/*.test.tsrx', 'packages/octane/tests/**/*.test.ts'],
					exclude: [...configDefaults.exclude, 'packages/octane/tests/profiling-runtime.test.tsrx'],
					environment: 'jsdom',
					globalSetup: ['packages/octane/tests/differential/_setup.ts'],
					setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
					globals: false,
					// Mode probe for the handful of tests that assert DEV-ONLY runtime
					// warnings (gated on the dev-compile __oct_loc stamp — silent in
					// prod, like React's prod bundle): they conditionalize on this.
					env: { OCTANE_TEST_COMPILE_MODE: 'prod' },
				},
				plugins: [octane({ hmr: false })],
			},
			{
				// Focused production-semantics profiling build. Keeping this to the
				// profiling integration fixture proves the build-time define reaches both
				// full Blocks and compiler-selected lite component scopes without running
				// the entire Octane suite a third time.
				test: {
					name: 'octane-profile',
					include: ['packages/octane/tests/profiling-runtime.test.tsrx'],
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
					name: 'jotai',
					include: ['packages/jotai/tests/**/*.test.ts'],
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
					name: 'i18next',
					include: ['packages/i18next/tests/**/*.test.ts'],
					exclude: [...configDefaults.exclude, 'packages/i18next/tests/ssr/**/*.test.ts'],
					environment: 'jsdom',
					globalSetup: ['packages/i18next/tests/differential/_setup.ts'],
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
				test: {
					name: 'apollo-client',
					include: ['packages/apollo-client/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
				},
				plugins: [octane()],
				resolve: {
					alias: [
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
					name: 'redux',
					include: ['packages/redux/tests/**/*.test.ts'],
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
					exclude: [...configDefaults.exclude, 'packages/redux-toolkit/tests/ssr/**/*.test.ts'],
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
				test: {
					name: 'hook-form',
					include: [
						'packages/hook-form/tests/**/*.test.ts',
						'packages/hook-form/tests/**/*.test.tsx',
					],
					exclude: [...configDefaults.exclude, 'packages/hook-form/tests/**/*.server.test.tsx'],
					environment: 'jsdom',
					// Differential precompile: rewrites `@octanejs/hook-form` →
					// `react-hook-form` so the React side runs the real binding.
					globalSetup: ['packages/hook-form/tests/differential/_setup.ts'],
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
					// The differential oracle (real recharts + vendored d3) is expensive
					// to load and charts settle over many raf rounds — slow CI runners
					// tripped the 5s default on the file's first test.
					testTimeout: 30_000,
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
					name: 'lucide',
					include: [
						'packages/lucide/tests/**/*.test.ts',
						'!packages/lucide/tests/ssr/**/*.test.ts',
					],
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
				test: {
					name: 'dnd-kit',
					include: [
						'packages/dnd-kit/tests/conformance/**/*.test.ts',
						'packages/dnd-kit/tests/differential/**/*.test.ts',
						'packages/dnd-kit/tests/hydration/**/*.test.ts',
					],
					environment: 'jsdom',
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
				test: {
					name: 'base-ui',
					include: ['packages/base-ui/tests/**/*.test.ts', 'packages/base-ui/tests/**/*.test.tsx'],
					environment: 'jsdom',
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
					name: 'sonner',
					include: [
						'packages/sonner/tests/**/*.test.ts',
						'!packages/sonner/tests/ssr/**/*.test.ts',
					],
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
					name: 'testing-library',
					include: ['packages/testing-library/tests/**/*.test.ts'],
					environment: 'jsdom',
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
				test: {
					name: 'octane-mcp-server',
					include: ['packages/octane-mcp-server/src/**/*.test.js'],
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
					name: 'website',
					include: ['website/tests/**/*.test.ts'],
					environment: 'jsdom',
					globals: false,
					// ssr-smoke and ssr-hydration.e2e both run a REAL production
					// `vite build` into the same output roots (website/dist,
					// website/.vercel/output) and the e2e file then serves that
					// output with octane-preview. Running the files in parallel
					// would let one build delete/rewrite artifacts the other is
					// building or serving, so this project is file-serial by
					// contract, not by timing.
					fileParallelism: false,
				},
				// The website app stack: octaneMdx() compiles the site's .mdx documents
				// (same shared options — Shiki + tsrx langAlias — the app itself uses);
				// octane() compiles the .tsrx pages and slots hooks in app .ts files.
				// The bindings' own hand-slot-forwarding `.ts` sources are skipped via
				// their package.json declarations. Package imports (@octanejs/tanstack-router,
				// octane, …) resolve through website/node_modules workspace links — no
				// aliases needed.
				plugins: [octaneMdx(websiteMdxOptions), octane()],
			},
		],
	},
});
