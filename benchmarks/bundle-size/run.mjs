// Bundle-size benchmark — PRODUCTION `vite build` of each comparative app,
// reporting the built client JS bytes (raw / gzip / brotli) per framework. This
// is the cross-framework shipped-bytes comparison the perf suites can't see
// (docs/compiled-output-optimization-plan.md, Phase 0a).
//
// Fairness: every target uses the same explicit production build settings
// (minify: 'esbuild', target: 'esnext'). The inline config wins
// over the app's config file for these keys; everything else (plugins, mode,
// NODE_ENV) still comes from each app's own config, exactly like the news
// suite's programmatic builds.
//
// Only .js assets are summed; index.html and CSS are excluded. Weather's CSS is
// shared byte-for-byte by every port, so including it would add the same constant
// to every column rather than measure framework output. Bytes are deterministic
// per build, so median === min.
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
// Run:
//   node benchmarks/bundle-size/run.mjs                      every target, report only
//   node benchmarks/bundle-size/run.mjs --budgets octane-tsrx octane-jsx
//   node benchmarks/bundle-size/run.mjs --write-budgets octane-tsrx octane-jsx
//
// Positional arguments select framework targets in every set. `--budgets` fails
// when an Octane application exceeds app-budgets.json or jsx-budgets.json, and
// `--write-budgets` resets the selected Octane budgets to measured + headroom in
// a dedicated budget pull request (CONTRIBUTING.md, "Size budgets").
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { build } from 'vite';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BYTE_METRICS, ratchetBudget } from './minimal-gates.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JS_FRAMEWORK = path.resolve(__dirname, '../js-framework');
const TODOMVC = path.resolve(__dirname, '../todomvc');
const CHAT_STREAM = path.resolve(__dirname, '../chat-stream');
const WEATHER_APP = path.resolve(__dirname, '../weather-app');
const BINDINGS_APP = path.join(__dirname, 'apps/bindings');
const OUT_ROOT = path.join(__dirname, 'dist'); // gitignored (root .gitignore: dist)

// Five app sets: js-framework rows, TodoMVC, chat-stream, weather-app, and the
// Octane-only bindings application. The later sets are app-shaped size
// comparisons; their ops use distinct prefixes so every set rides one suite with
// one baseline file.
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
	},
];
const APP_BUDGET_FILE = path.join(__dirname, 'app-budgets.json');
const JSX_BUDGET_FILE = path.join(__dirname, 'jsx-budgets.json');
const APP_BUDGETS = JSON.parse(fs.readFileSync(APP_BUDGET_FILE, 'utf8'));
const JSX_BUDGETS = JSON.parse(fs.readFileSync(JSX_BUDGET_FILE, 'utf8'));
const setName = ({ prefix }) => (prefix ? prefix.slice(0, -1) : 'rows');
assert.deepEqual(
	Object.keys(APP_BUDGETS).sort(),
	SETS.map(setName).sort(),
	'full-application budgets must cover every benchmark set exactly once',
);

const args = process.argv.slice(2);
const enforceBudgets = args.includes('--budgets');
const writeBudgets = args.includes('--write-budgets');
assert.equal(
	enforceBudgets && writeBudgets,
	false,
	'--budgets checks the committed budgets and --write-budgets replaces them; pass one',
);
const requestedTargets = args.filter((arg) => arg !== '--budgets' && arg !== '--write-budgets');
const knownTargets = new Set(SETS.flatMap((set) => set.targets));
for (const target of requestedTargets) {
	assert.equal(knownTargets.has(target), true, `Unknown bundle-size target: ${target}`);
}
const selected = (name) => requestedTargets.length === 0 || requestedTargets.includes(name);
// Budget rows map each committed bucket to the operation names the build emits.
const BUDGET_BUCKETS = [
	['app', 'app'],
	['framework', 'fw'],
	['total', 'js'],
];

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

const val = (bytes) => ({ median: bytes, min: bytes, samples: 1 });
const targets = [];
const byName = new Map(); // merge every app set's ops per framework name

for (const set of SETS)
	for (const name of set.targets.filter(selected)) {
		const appRoot = path.join(set.root, name);
		const outDir = path.join(OUT_ROOT, set.prefix + name);
		const setLabel = set.prefix ? path.basename(set.root) + '/' : '';
		console.log(`building ${setLabel}${name} (production, normalized minify)…`);
		const result = await build({
			root: appRoot,
			logLevel: 'warn',
			build: {
				outDir,
				emptyOutDir: true,
				minify: 'esbuild',
				target: 'esnext',
				rollupOptions: {
					output: {
						// App modules stay in the entry chunk; the framework runtime + virtual
						// helpers are forced into a chunk named "framework". Rolldown may emit
						// its own virtual runtime as a sibling `rolldown-runtime` asset; the
						// file-name classifier below charges both to framework overhead. Vite 8
						// is rolldown-based: `manualChunks` is ignored, `codeSplitting` is
						// the supported API. Framework is matched POSITIVELY (node_modules,
						// the octane workspace runtime — pnpm resolves it to packages/octane,
						// never node_modules — and `\0` virtuals) so the index.html entry
						// proxy module stays in the entry chunk with the app code.
						codeSplitting: {
							groups: [
								{
									name: 'framework',
									test: (id) => {
										const clean = id.split('?')[0];
										return (
											id.startsWith('\0') ||
											clean.includes('node_modules') ||
											clean.includes(`${path.sep}packages${path.sep}octane${path.sep}`)
										);
									},
								},
							],
						},
					},
				},
			},
		});

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
		const total = {
			raw: sums.app.raw + sums.fw.raw,
			gzip: sums.app.gzip + sums.fw.gzip,
			brotli: sums.app.brotli + sums.fw.brotli,
		};
		if (total.raw === 0 || sums.app.raw === 0 || sums.fw.raw === 0) {
			console.error(`✗ ${name}: app/framework split produced an empty bucket in ${outDir}`);
			process.exit(1);
		}
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
		// app root should reach `__createVoidRoot`, not the generic `createRoot`.
		// Inspected from this build's own result — the same renderedExports
		// assertion run-minimal.mjs makes for its minimal scenarios. A
		// non-specialized verdict means the proof chain broke upstream; a
		// missing runtime module reports as its own verdict, not a crash.
		if (name.startsWith('octane-')) {
			let runtimeExports;
			let runtimeSeen = false;
			for (const bundle of Array.isArray(result) ? result : result ? [result] : []) {
				for (const chunk of bundle.output ?? []) {
					if (chunk.type !== 'chunk') continue;
					for (const [id, mod] of Object.entries(chunk.modules ?? {})) {
						if (id.endsWith('/packages/octane/src/runtime.ts')) {
							runtimeSeen = true;
							runtimeExports = mod.renderedExports ?? [];
						}
					}
				}
			}
			const verdict = !runtimeSeen
				? 'no-runtime-module'
				: runtimeExports.includes('__createVoidRoot') && !runtimeExports.includes('createRoot')
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
function appendBudgetOperations(operations, budget, name, prefix = '') {
	assert.deepEqual(
		Object.keys(budget).sort(),
		['app', 'framework', 'total'],
		`${name}: full-application budget must cover application, framework, and total bytes`,
	);
	for (const [bucket, operation] of BUDGET_BUCKETS) {
		assert.deepEqual(
			Object.keys(budget[bucket]).sort(),
			['brotli', 'gzip', 'raw'],
			`${name}/${bucket}: full-application budget must cover raw, gzip, and brotli bytes`,
		);
		for (const metric of BYTE_METRICS) {
			const bytes = budget[bucket][metric];
			assert.equal(
				Number.isSafeInteger(bytes) && bytes > 0,
				true,
				`${name}/${bucket}: invalid committed ${metric} byte budget`,
			);
			operations[prefix + operation + '_' + metric] = val(bytes);
		}
	}
}

const tsrxBudgetOps = {};
for (const set of SETS) {
	appendBudgetOperations(tsrxBudgetOps, APP_BUDGETS[setName(set)], setName(set), set.prefix);
}
targets.push({ name: 'octane-tsrx-budget', ops: tsrxBudgetOps });

const jsxBudgetOps = {};
appendBudgetOperations(jsxBudgetOps, JSX_BUDGETS, 'rows-jsx');
targets.push({ name: 'octane-jsx-budget', ops: jsxBudgetOps });

const payload = { suite: 'bundle-size', iterations: 1, targets };

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}

// Each committed budget belongs to one Octane target and one app set. A set the
// target does not build (JSX ships only the rows app) has no budget here.
const budgetedSets = [
	...SETS.map((set) => ({
		target: 'octane-tsrx',
		label: setName(set),
		prefix: set.prefix,
		budget: APP_BUDGETS[setName(set)],
	})),
	{ target: 'octane-jsx', label: 'rows-jsx', prefix: '', budget: JSX_BUDGETS },
].filter(({ target }) => byName.has(target));

if (enforceBudgets) {
	const breaches = [];
	for (const { target, label, prefix, budget } of budgetedSets) {
		const ops = byName.get(target).ops;
		for (const [bucket, operation] of BUDGET_BUCKETS) {
			for (const metric of BYTE_METRICS) {
				const measured = ops[`${prefix}${operation}_${metric}`]?.median;
				assert.equal(typeof measured, 'number', `${label}/${bucket}: missing ${metric} bytes`);
				if (measured > budget[bucket][metric]) {
					breaches.push(
						`${label}/${bucket}: production ${metric} bytes ${measured} exceed committed budget ${budget[bucket][metric]}`,
					);
				}
			}
		}
	}
	if (breaches.length) {
		console.error(`✗ ${breaches.length} application byte budget(s) exceeded:`);
		for (const breach of breaches) console.error(`  ${breach}`);
		process.exit(1);
	}
	console.log(`✓ ${budgetedSets.length} application budget(s) hold`);
}

if (writeBudgets) {
	for (const { target, label, prefix, budget } of budgetedSets) {
		const ops = byName.get(target).ops;
		for (const [bucket, operation] of BUDGET_BUCKETS) {
			const measured = Object.fromEntries(
				BYTE_METRICS.map((metric) => [metric, ops[`${prefix}${operation}_${metric}`].median]),
			);
			budget[bucket] = ratchetBudget(measured, budget[bucket]);
		}
		console.log(`ratcheted ${label} budgets to measured + headroom (raw/gzip 32, brotli 256)`);
	}
	fs.writeFileSync(APP_BUDGET_FILE, JSON.stringify(APP_BUDGETS, null, 2) + '\n');
	fs.writeFileSync(JSX_BUDGET_FILE, JSON.stringify(JSX_BUDGETS, null, 2) + '\n');
}
