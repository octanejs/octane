// Bundle-size benchmark — PRODUCTION `vite build` of each comparative app,
// reporting the built client JS bytes (raw / gzip / brotli) per framework. This
// is the cross-framework shipped-bytes comparison the perf suites can't see
// (docs/compiled-output-optimization-plan.md, Phase 0a).
//
// Fairness: every comparative framework target uses the same production settings
// (minify: 'oxc', target: 'esnext'). The inline config wins over the app's
// config file for these keys; everything else (plugins, mode, NODE_ENV) still
// comes from each app's own config, exactly like the news suite's programmatic
// builds. `'oxc'` is Vite 8's default client minifier, so each row measures what
// an ordinary Vite application ships. It is named here because the fixture apps'
// own configs choose `'esbuild'` for the timing suites. Vite's `'esbuild'` mode
// turns Rolldown's own minifier off, and with it the dead-code elimination that
// removes branches guarded by a never-written module flag.
//
// Only .js assets are summed; index.html and CSS are excluded. Weather's CSS is
// shared byte-for-byte by every port, so including it would add the same constant
// to every column rather than measure framework output. Each row records one
// build, so median === min. Generated build IDs can cause small gzip variation.
//
// Each build's emitted JavaScript is classified into two buckets: `app`
// (authored app modules, including weather's shared sources) and `framework`
// (node_modules, virtual helpers, AND the octane workspace runtime, which pnpm
// resolves to packages/octane/src, never node_modules). Rolldown codeSplitting
// forces the main app/framework separation and may emit additional runtime
// files, which are charged to framework. The app-only ops (`app_*`) are the
// scaling term as applications grow, so the per-component codegen share is what
// the compiled-output plan must ratchet; the runtime is a one-time cost tracked
// by the `fw_*` ops. `js_*` totals stay for the whole-page view.
//
// The bindings set is Octane-only: one application that renders components and
// hooks from the binding packages most built on plain `.ts` hooks. Bindings ship
// their source, so the consuming build compiles them with the production Octane
// compiler and they land in the `app` bucket beside the authored modules. Its
// `bindings_app_*` ops therefore move with compiler output for binding hooks,
// which no other set contains, while `bindings_fw_*` tracks the runtime those
// bindings reach.
//
// The fixtures are small, so a framework that tree-shakes ships only the part
// of its runtime they reach. Each framework therefore also reports a ceiling:
// every export of every framework entry point its fixtures import (the
// specifiers are recorded while the fixtures build, not hand-listed), retained
// so nothing can be shaken away. `full_fw_*` is that runtime's bytes. A fixture
// row's `app_*` plus `full_fw_*` is what the same application ships once it
// uses the rest of the API, which is the upper end the website draws beside
// each fixture's measured total. A framework that cannot tree-shake shows
// almost no gap. The reachability scenarios in run-minimal.mjs gate individual
// public imports.
//
// Run:
//   node benchmarks/bundle-size/run.mjs                      every target
//   node benchmarks/bundle-size/run.mjs octane-tsrx octane-jsx
//
// Positional arguments select framework targets in every set. Bytes are reported,
// never gated: the pull request benchmark comment lists every change. The
// codegen and reachability checks below fail the run.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { build, parseAst } from 'vite';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	exportedNames,
	isRuntimeModule,
	renderedRuntimeExports,
	resolveDeclarationRanges,
	retainedDeclarations,
} from './hydration-free-gates.mjs';
import { RENDER_ROLLBACK_DECLARATIONS } from './render-rollback-gates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JS_FRAMEWORK = path.resolve(__dirname, '../js-framework');
const TODOMVC = path.resolve(__dirname, '../todomvc');
const CHAT_STREAM = path.resolve(__dirname, '../chat-stream');
const WEATHER_APP = path.resolve(__dirname, '../weather-app');
const BINDINGS_APP = path.join(__dirname, 'apps/bindings');
const APP_SHELL = path.join(__dirname, 'apps/app-shell');
const OUT_ROOT = path.join(__dirname, 'dist'); // gitignored (root .gitignore: dist)
// runtime.ts's exports: the names a void-root verdict reads from a build.
const runtimeSurface = exportedNames(
	parseAst(
		fs.readFileSync(path.resolve(__dirname, '../../packages/octane/src/runtime.ts'), 'utf8'),
		{ lang: 'ts' },
	),
);
// Generic host props and controlled forms, which element factories install.
const HOST_DESCRIPTOR_PROPS = [
	{ name: 'setHostProps', source: 'runtime/host-props.ts' },
	{ name: 'armControlled', source: 'runtime/forms.ts' },
];
// Vite 8's default client minifier; see the fairness note above.
const VITE_MINIFY = 'oxc';

// App-shaped size comparisons use distinct prefixes so every set rides one
// suite with one baseline file. Shell's client-only row uses the same app and
// lazy page as its hydrating row, changing just the public root entry point.
const SETS = [
	{
		root: JS_FRAMEWORK,
		prefix: '',
		targets: [
			'octane-tsrx',
			'octane-jsx',
			'react',
			'preact',
			'ripple',
			'solid',
			'svelte',
			'inferno',
		],
	},
	{
		root: TODOMVC,
		prefix: 'todo_',
		targets: [
			'octane-tsrx',
			'react',
			'preact',
			'solid',
			'svelte',
			'ripple',
			'vue-vapor',
			'inferno',
		],
	},
	{
		root: CHAT_STREAM,
		prefix: 'chat_',
		targets: [
			'octane-tsrx',
			'react',
			'preact',
			'solid',
			'svelte',
			'ripple',
			'vue-vapor',
			'inferno',
		],
	},
	{
		root: WEATHER_APP,
		prefix: 'weather_',
		targets: ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue', 'inferno'],
	},
	{
		root: BINDINGS_APP,
		prefix: 'bindings_',
		targets: ['octane-tsrx'],
		// Its imports are binding packages, not framework entry points.
		ceiling: false,
	},
	{
		root: APP_SHELL,
		prefix: 'shell_',
		targets: ['octane-jsx', 'octane-tsrx', 'react'],
		// Its signal and alien-signals imports would widen the rows ceilings.
		ceiling: false,
	},
	{
		root: APP_SHELL,
		prefix: 'shell_client_',
		targets: ['octane-jsx', 'octane-tsrx', 'react'],
		entry: 'index-client.html',
		ceiling: false,
	},
];
const requestedTargets = process.argv.slice(2);
const knownTargets = new Set(SETS.flatMap((set) => set.targets));
for (const target of requestedTargets) {
	assert.equal(knownTargets.has(target), true, `Unknown bundle-size target: ${target}`);
}
const selected = (name) => requestedTargets.length === 0 || requestedTargets.includes(name);

const gz = (buf) => gzipSync(buf, { level: zc.Z_BEST_COMPRESSION }).length;
const br = (buf) =>
	brotliCompressSync(buf, {
		params: { [zc.BROTLI_PARAM_QUALITY]: zc.BROTLI_MAX_QUALITY },
	}).length;

function* walk(dir) {
	for (const name of fs.readdirSync(dir)) {
		const full = path.join(dir, name);
		if (fs.statSync(full).isDirectory()) yield* walk(full);
		else yield full;
	}
}

function measure(name, outDir) {
	const sums = {
		app: { raw: 0, gzip: 0, brotli: 0 },
		fw: { raw: 0, gzip: 0, brotli: 0 },
	};
	const files = [];
	for (const file of walk(outDir)) {
		if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
		const buf = fs.readFileSync(file);
		const bucket = /^(framework|rolldown-runtime)-.+\.m?js$/.test(path.basename(file))
			? 'fw'
			: 'app';
		sums[bucket].raw += buf.length;
		sums[bucket].gzip += gz(buf);
		sums[bucket].brotli += br(buf);
		files.push({ file: path.relative(outDir, file), bucket, bytes: buf.length });
	}
	if (sums.app.raw === 0 || sums.fw.raw === 0) {
		console.error(`✗ ${name}: app/framework split produced an empty bucket in ${outDir}`);
		process.exit(1);
	}
	return { sums, files };
}

// Framework modules (node_modules, the octane workspace runtime, and `\0`
// virtuals). Shared by the chunk split and the entry-point recorder.
const isFrameworkModule = (id) => {
	const clean = id.split('?')[0];
	return (
		id.startsWith('\0') ||
		clean.includes('node_modules') ||
		clean.includes(`${path.sep}packages${path.sep}octane${path.sep}`)
	);
};

const buildOutput = {
	// App modules stay in the entry chunk; the framework runtime + virtual
	// helpers are forced into a chunk named "framework". Rolldown may emit
	// its own virtual runtime as a sibling `rolldown-runtime` asset; the
	// file-name classifier in measure() charges both to framework overhead. Vite 8
	// is rolldown-based: `manualChunks` is ignored, `codeSplitting` is
	// the supported API. Framework is matched POSITIVELY (node_modules,
	// the octane workspace runtime — pnpm resolves it to packages/octane,
	// never node_modules — and `\0` virtuals) so the index.html entry
	// proxy module stays in the entry chunk with the app code.
	codeSplitting: { groups: [{ name: 'framework', test: isFrameworkModule }] },
};

// Records each bare framework specifier an application module imports, keyed by
// the resolved file, so the ceiling build reaches the exact files (and export
// conditions) the fixture build chose.
function recordFrameworkEntries(entries) {
	return {
		name: 'bundle-size:record-framework-entries',
		enforce: 'pre',
		async resolveId(source, importer, options) {
			if (
				!importer ||
				isFrameworkModule(importer) ||
				/^[./\0]/.test(source) ||
				source.startsWith('vite/')
			)
				return null;
			const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
			if (resolved && !resolved.external) entries.set(source, resolved.id);
			return null;
		},
	};
}

const val = (bytes) => ({ median: bytes, min: bytes, samples: 1 });
const targets = [];
const byName = new Map(); // merge every app set's ops per framework name
// Per framework: the first fixture root (its config builds the ceiling) and
// every framework entry point its fixtures import.
const ceilings = new Map();

// The .tsrx app shell renders only compiled bodies, text and empties: no
// element factory runs, so generic host props must not be retained.
// componentSlotFunction (its lazy route) is the control that proves the ranges
// resolve against this build.
const shellHostRanges = resolveDeclarationRanges(
	(source) => fs.readFileSync(path.resolve(__dirname, '../../packages/octane/src', source), 'utf8'),
	(text, source) => parseAst(text, { lang: 'ts' }, source),
	[{ name: 'componentSlotFunction', source: 'runtime.ts' }, ...HOST_DESCRIPTOR_PROPS],
);

// js-framework and chat-stream use no effects, refs, Effect Events, Activity,
// Suspense, external stores, controlled selects, transitions, signals or
// hydration. Each of those installs the commit, capture, owner and native-read
// work below from its creator, so neither fixture may retain any of it. The
// other Octane builds in this run use those features; together they must retain
// every entry, which proves the source-map oracle still sees each declaration.
const creatorInstalledRanges = resolveDeclarationRanges(
	(source) => fs.readFileSync(path.resolve(__dirname, '../../packages/octane/src', source), 'utf8'),
	(text, source) => parseAst(text, { lang: 'ts' }, source),
	[
		// Effect slots and the commit phases that run their callbacks.
		'finishEffectRender',
		'runEffectCleanupCallback',
		'drainPassiveEffects',
		'cancelPostPaint',
		'drainEffectEventCommitActions',
		'drainCommitRefs',
		'finishEffectCommit',
		// Ref attaches, and the refs an aborted mount suppresses.
		'applyRefValue',
		'placeCommitRefs',
		'collectVisibleSubtreeRefs',
		// Renderer signal owners, event authority and native-read batches.
		'signalRetryBoundary',
		'takeSignalRetryVisit',
		'runWithBlockSignalOwner',
		'discardSignalRetryItem',
		'clearSignalRetryOwners',
		'retireRendererSignalOwner',
		'retireUnownedSignalScope',
		'queueEventOwner',
		'closeNativeEventBatch',
		'promotePendingSignals',
	]
		.map((name) => ({ name, source: 'runtime.ts' }))
		.concat(
			['runWithSignalOwner', 'runInSignalOwner', 'currentExplicitSignalOwner'].map((name) => ({
				name,
				source: 'signals/owner-context.ts',
			})),
			['beginNativeBatch', 'endNativeBatch'].map((name) => ({
				name,
				source: 'signals/read-protocol.ts',
			})),
			{ name: 'beginNativeEventBatch', source: 'signals/native-read-events.ts' },
		),
);
const creatorInstalledControls = new Map();

// Neither application has an entry that can drop a render, so neither may ship
// render rollback; run-minimal's suspense-transition control proves the oracle
// sees each declaration.
const rollbackRanges = resolveDeclarationRanges(
	(source) => fs.readFileSync(path.resolve(__dirname, '../../packages/octane/src', source), 'utf8'),
	(text, source) => parseAst(text, { lang: 'ts' }, source),
	RENDER_ROLLBACK_DECLARATIONS,
);

// Declarations from `ranges` that any source-mapped chunk in `outDir` retains.
// Rolldown's virtual runtime chunk has no source map and no Octane source.
function retainedIn(outDir, ranges) {
	const retained = new Set();
	for (const file of walk(outDir)) {
		if (!/\.m?js$/.test(file) || !fs.existsSync(file + '.map')) continue;
		const map = JSON.parse(fs.readFileSync(file + '.map', 'utf8'));
		for (const declaration of retainedDeclarations(map, ranges)) retained.add(declaration);
	}
	return retained;
}

for (const set of SETS)
	for (const name of set.targets.filter(selected)) {
		const appRoot = path.join(set.root, name);
		const shellHostGate = set.root === APP_SHELL && name === 'octane-tsrx';
		const octaneBuild = name.startsWith('octane-');
		// The applications whose creator-installed and rollback checks are above.
		const leanApp = set.root === JS_FRAMEWORK || set.root === CHAT_STREAM;
		const outDir = path.join(OUT_ROOT, set.prefix + name);
		const setLabel = set.prefix ? set.prefix + '/' : '';
		console.log(`building ${setLabel}${name} (production, ${VITE_MINIFY} minify)…`);
		let ceiling = ceilings.get(name);
		if (set.ceiling !== false && ceiling === undefined) {
			ceiling = { root: appRoot, entries: new Map() };
			ceilings.set(name, ceiling);
		}
		const result = await build({
			root: appRoot,
			logLevel: 'warn',
			plugins: set.ceiling === false ? [] : [recordFrameworkEntries(ceiling.entries)],
			build: {
				outDir,
				emptyOutDir: true,
				minify: VITE_MINIFY,
				target: 'esnext',
				...(octaneBuild ? { sourcemap: 'hidden' } : {}),
				rollupOptions: {
					...(set.entry ? { input: path.join(appRoot, set.entry) } : {}),
					output: buildOutput,
				},
			},
		});

		const { sums, files } = measure(name, outDir);
		if (octaneBuild) {
			const retained = retainedIn(outDir, creatorInstalledRanges);
			if (!leanApp) creatorInstalledControls.set(`${setLabel}${name}`, retained);
			else if (name === 'octane-tsrx')
				assert.deepEqual(
					[...retained],
					[],
					`${setLabel}${name}: retained commit, owner or native-read work that only its creators install`,
				);
		}
		if (shellHostGate) {
			const retained = retainedIn(outDir, shellHostRanges);
			assert(
				retained.has('componentSlotFunction'),
				`${setLabel}${name}: lazy-route control is absent; update its reachability check`,
			);
			assert.deepEqual(
				HOST_DESCRIPTOR_PROPS.filter(({ name }) => retained.has(name)).map(({ name }) => name),
				[],
				`${setLabel}${name}: a body-only app retained generic host props`,
			);
		}
		if (leanApp && name === 'octane-tsrx')
			assert.deepEqual(
				[...retainedIn(outDir, rollbackRanges)],
				[],
				`${setLabel}${name}: an app that cannot drop a render retained render rollback`,
			);
		const total = {
			raw: sums.app.raw + sums.fw.raw,
			gzip: sums.app.gzip + sums.fw.gzip,
			brotli: sums.app.brotli + sums.fw.brotli,
		};
		console.log(
			`  ${setLabel}${name}: total gz ${total.gzip}  app gz ${sums.app.gzip}  fw gz ${sums.fw.gzip}`,
		);
		let entry = byName.get(name);
		if (entry === undefined) {
			entry = { name, ops: {}, meta: { files: [], voidRoots: {} } };
			byName.set(name, entry);
			targets.push(entry);
		}
		// Void-root specialization verdict (octane targets only): the compiled
		// app root should reach `__createVoidRoot` (or `__hydrateVoidRoot`), not
		// the generic `createRoot` or `hydrateRoot`.
		// Inspected from this build's own result — the same renderedExports
		// assertion run-minimal.mjs makes for its minimal scenarios. A
		// non-specialized verdict means the proof chain broke upstream; a
		// missing runtime module reports as its own verdict, not a crash.
		if (name.startsWith('octane-')) {
			let runtimeExports = [];
			let runtimeSeen = false;
			for (const bundle of Array.isArray(result) ? result : result ? [result] : []) {
				for (const chunk of bundle.output ?? []) {
					if (chunk.type !== 'chunk') continue;
					const modules = chunk.modules ?? {};
					if (!Object.keys(modules).some(isRuntimeModule)) continue;
					runtimeSeen = true;
					runtimeExports = renderedRuntimeExports(modules, runtimeSurface);
				}
			}
			const verdict = !runtimeSeen
				? 'no-runtime-module'
				: (runtimeExports.includes('__createVoidRoot') ||
							runtimeExports.includes('__createVoidRootDefaultOptions') ||
							runtimeExports.includes('__hydrateVoidRoot')) &&
					  !runtimeExports.includes('createRoot') &&
					  !runtimeExports.includes('hydrateRoot')
					? 'specialized'
					: 'generic-root';
			entry.meta.voidRoots[`${set.prefix}${name}`] = verdict;
			console.log(
				`  ${verdict === 'specialized' ? '✓' : '✗'} ${setLabel}${name}: void-root ${verdict}`,
			);
			// The verdict is a gate for the compiled apps, not just a report:
			// losing __createVoidRoot specialization is the regression this
			// check exists to catch. octane-jsx hand-writes a user-level
			// createRoot call, so 'generic-root' is its expected verdict and
			// stays informational.
			if (name === 'octane-tsrx')
				assert.equal(
					verdict,
					'specialized',
					`${setLabel}${name}: app-mode root lost __createVoidRoot specialization`,
				);
		}
		const px = set.prefix;
		Object.assign(entry.ops, {
			[px + 'js_raw']: val(total.raw),
			[px + 'js_gzip']: val(total.gzip),
			[px + 'js_brotli']: val(total.brotli),
			[px + 'app_raw']: val(sums.app.raw),
			[px + 'app_gzip']: val(sums.app.gzip),
			[px + 'app_brotli']: val(sums.app.brotli),
			[px + 'fw_raw']: val(sums.fw.raw),
			[px + 'fw_gzip']: val(sums.fw.gzip),
			[px + 'fw_brotli']: val(sums.fw.brotli),
		});
		entry.meta.files.push(...files.map((f) => ({ ...f, set: px || 'js' })));
	}

if (selected('octane-tsrx')) {
	const unseen = creatorInstalledRanges
		.map(({ name }) => name)
		.filter((name) => ![...creatorInstalledControls.values()].some((kept) => kept.has(name)));
	assert.deepEqual(
		unseen,
		[],
		'no Octane control build retains these creator-installed declarations; update their reachability check',
	);
}

// The metaframework entry is absent from the SPA sets above. Keep this real
// application's normal chunking, and count every emitted client JS asset,
// including deferred chunks. Server output is excluded from these client totals.
if (selected('octane-tsrx')) {
	const appRoot = path.resolve(__dirname, '../../examples/wayfinder');
	// This app has no function form actions or Fragment refs. Its real generated
	// entry must not install their generic descriptor capabilities. Source ranges
	// still identify retained implementations after minification or inlining;
	// the hydration implementation every entry keeps proves they still match.
	const entryDeclarations = [
		'hydrateRootWithOutputHandler',
		'enableDescriptorFormActions',
		'enableDescriptorFragmentRefs',
		'renderFragmentRefDescriptor',
	];
	const entryRanges = resolveDeclarationRanges(
		(source) =>
			fs.readFileSync(path.resolve(__dirname, '../../packages/octane/src', source), 'utf8'),
		(text, source) => parseAst(text, { lang: 'ts' }, source),
		entryDeclarations.map((name) => ({ name, source: 'runtime.ts' })),
	);
	const retainedEntryDeclarations = new Set();
	console.log(`building wayfinder (production, ${VITE_MINIFY} minify)…`);
	await build({
		root: appRoot,
		logLevel: 'warn',
		build: { minify: VITE_MINIFY, target: 'esnext', sourcemap: 'hidden' },
	});
	const clientDir = path.join(appRoot, 'dist/client');
	const entry = byName.get('octane-tsrx');
	const totals = { raw: 0, gzip: 0, brotli: 0 };
	for (const file of walk(clientDir)) {
		if (!/\.m?js$/.test(file)) continue;
		const map = JSON.parse(fs.readFileSync(file + '.map', 'utf8'));
		for (const name of retainedDeclarations(map, entryRanges)) retainedEntryDeclarations.add(name);
		const buf = fs.readFileSync(file);
		totals.raw += buf.length;
		totals.gzip += gz(buf);
		totals.brotli += br(buf);
		entry.meta.files.push({
			file: path.relative(clientDir, file),
			bytes: buf.length,
			set: 'wayfinder',
		});
	}
	assert(totals.raw > 0, 'Wayfinder emitted no client JavaScript');
	assert(
		retainedEntryDeclarations.has('hydrateRootWithOutputHandler'),
		'Wayfinder entry hydration control is absent; update its reachability check',
	);
	assert.deepEqual(
		entryDeclarations.slice(1).filter((name) => retainedEntryDeclarations.has(name)),
		[],
		'Wayfinder hydration entry retained unused form-action or Fragment-ref descriptor capabilities',
	);
	for (const [metric, bytes] of Object.entries(totals)) {
		entry.ops['wayfinder_js_' + metric] = val(bytes);
	}
	console.log(`  wayfinder: total gz ${totals.gzip}`);
}

// Real SPA consumers keep their normal chunking. The second minifier reports
// tradeoffs that the default Oxc row alone would hide; neither has a byte budget.
if (selected('octane-tsrx')) {
	const entry = byName.get('octane-tsrx');
	const threadlineDeclarations = ['componentSlotVoid', 'componentSlot', 'renderReturnedValue'];
	const threadlineRanges = resolveDeclarationRanges(
		(source) =>
			fs.readFileSync(path.resolve(__dirname, '../../packages/octane/src', source), 'utf8'),
		(text, source) => parseAst(text, { lang: 'ts' }, source),
		threadlineDeclarations.map((name) => ({ name, source: 'runtime.ts' })),
	);
	for (const app of ['threadline', 'pagecraft']) {
		const appRoot = path.resolve(__dirname, '../../examples', app);
		const appFile = path.join(appRoot, 'src/App.tsrx');
		for (const minify of [VITE_MINIFY, 'esbuild']) {
			const set = `${app}_${minify}`;
			const outDir = path.join(OUT_ROOT, set);
			let compiledApp;
			console.log(`building ${app} (production, ${minify} minify, normal chunking)…`);
			await build({
				root: appRoot,
				logLevel: 'warn',
				plugins: [
					{
						name: 'bundle-size:shared-renderer-provenance',
						enforce: 'post',
						transform(code, id) {
							if (path.resolve(id.split('?')[0]) === appFile) compiledApp = code;
						},
					},
				],
				build: { outDir, emptyOutDir: true, minify, target: 'esnext', sourcemap: 'hidden' },
			});
			assert(compiledApp, `${app}: authored App was not compiled`);
			if (app === 'threadline') {
				const open = [];
				const components = {};
				const comments = /\/\* octane-inline (START|END) shared renderer: (\w+) \*\//g;
				for (const [, edge, component] of compiledApp.matchAll(comments)) {
					if (edge === 'START') {
						open.push(component);
						components[component] = (components[component] ?? 0) + 1;
					} else assert.equal(open.pop(), component, `${set}: mismatched renderer comments`);
				}
				assert.deepEqual(open, [], `${set}: unclosed renderer comments`);
				for (const component of [
					'HomeIcon',
					'BookmarkIcon',
					'PersonIcon',
					'HeartIcon',
					'ReplyIcon',
				]) {
					assert(components[component] > 0, `${set}: ${component} lost shared-renderer provenance`);
				}
				(entry.meta.sharedRendererComments ??= {})[set] = components;
			}
			const totals = { raw: 0, gzip: 0, brotli: 0 };
			const retainedRuntimeDeclarations = new Set();
			for (const file of walk(outDir)) {
				if (!/\.m?js$/.test(file)) continue;
				if (app === 'threadline') {
					const map = JSON.parse(fs.readFileSync(file + '.map', 'utf8'));
					for (const name of retainedDeclarations(map, threadlineRanges)) {
						retainedRuntimeDeclarations.add(name);
					}
				}
				const buf = fs.readFileSync(file);
				totals.raw += buf.length;
				totals.gzip += gz(buf);
				totals.brotli += br(buf);
				entry.meta.files.push({ file: path.relative(outDir, file), bytes: buf.length, set });
			}
			assert(totals.raw > 0, `${set}: emitted no client JavaScript`);
			if (app === 'threadline') {
				assert(
					retainedRuntimeDeclarations.has('componentSlotVoid'),
					`${set}: void-component control is absent; update its reachability check`,
				);
				assert.deepEqual(
					threadlineDeclarations.slice(1).filter((name) => retainedRuntimeDeclarations.has(name)),
					[],
					`${set}: compiled void components retained generic component or return rendering`,
				);
			}
			for (const [metric, bytes] of Object.entries(totals)) {
				entry.ops[`${set}_js_${metric}`] = val(bytes);
			}
			console.log(`  ${set}: total gz ${totals.gzip}`);
		}
	}
}

for (const [name, { root, entries }] of ceilings) {
	const specifiers = [...entries.keys()].sort();
	assert.notEqual(specifiers.length, 0, `${name}: its fixtures imported no framework entry point`);
	const outDir = path.join(OUT_ROOT, 'ceiling_' + name);
	const source = path.join(OUT_ROOT, 'ceiling-entries', name + '.js');
	fs.mkdirSync(path.dirname(source), { recursive: true });
	// A retained namespace keeps every export, so nothing can be shaken away.
	fs.writeFileSync(
		source,
		specifiers
			.map((s, i) => `import * as m${i} from ${JSON.stringify(entries.get(s))};\n`)
			.join('') +
			`globalThis.__bundleSizeCeiling = [${specifiers.map((_, i) => 'm' + i).join(', ')}];\n`,
	);
	console.log(`building ${name} ceiling (${specifiers.join(', ')})…`);
	await build({
		root,
		logLevel: 'warn',
		build: {
			outDir,
			emptyOutDir: true,
			minify: VITE_MINIFY,
			target: 'esnext',
			rollupOptions: { input: source, output: buildOutput },
		},
	});
	const { sums } = measure(name + ' ceiling', outDir);
	console.log(`  ${name} ceiling: fw gz ${sums.fw.gzip}`);
	const entry = byName.get(name);
	entry.meta.ceiling = specifiers;
	Object.assign(entry.ops, {
		full_fw_raw: val(sums.fw.raw),
		full_fw_gzip: val(sums.fw.gzip),
		full_fw_brotli: val(sums.fw.brotli),
	});
}

const payload = { suite: 'bundle-size', iterations: 1, targets };

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
