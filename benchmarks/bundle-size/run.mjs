// Bundle-size benchmark — PRODUCTION `vite build` of each js-framework app,
// reporting the built client JS bytes (raw / gzip / brotli) per framework. This
// is the cross-framework shipped-bytes comparison the perf suites can't see
// (docs/compiled-output-optimization-plan.md, Phase 0a).
//
// Fairness: the apps' own vite configs differ where it matters for size (solid
// ships `build.minify:false` for its dev-server bench, octane uses terser
// passes:5, react passes:2) — so every target is built with ONE normalized
// inline override (minify: 'esbuild', target: 'esnext'). Inline config wins
// over the app's config file for these keys; everything else (plugins, mode,
// NODE_ENV) still comes from each app's own config, exactly like the news
// suite's programmatic builds.
//
// Only .js assets are summed (the apps have no meaningful CSS); index.html is
// excluded. Bytes are deterministic per build, so median === min.
//
// Each build is split into two chunks via rolldown codeSplitting — `app` (under
// the app's own src/) and `framework` (everything else: node_modules AND the
// octane workspace runtime, which pnpm resolves to packages/octane/src, never
// node_modules). The app-only ops (`app_*`) are the numbers that scale with
// app size — in real apps user code eclipses the framework runtime, so the
// per-component codegen share is what the compiled-output plan must ratchet;
// the runtime is a one-time cost tracked by the `fw_*` ops. `js_*` totals stay
// for the whole-page view.
//
// Run:  node benchmarks/bundle-size/run.mjs
process.env.NODE_ENV = 'production';

import { build } from 'vite';
import { gzipSync, brotliCompressSync, constants as zc } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JS_FRAMEWORK = path.resolve(__dirname, '../js-framework');
const OUT_ROOT = path.join(__dirname, 'dist'); // gitignored (root .gitignore: dist)

const TARGETS = ['octane-tsrx', 'octane-jsx', 'react', 'ripple', 'solid'];

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

for (const name of TARGETS) {
	const appRoot = path.join(JS_FRAMEWORK, name);
	const appSrc = path.join(appRoot, 'src') + path.sep;
	const outDir = path.join(OUT_ROOT, name);
	console.log(`building ${name} (production, normalized minify)…`);
	await build({
		root: appRoot,
		logLevel: 'warn',
		build: {
			outDir,
			emptyOutDir: true,
			minify: 'esbuild',
			target: 'esnext',
			rollupOptions: {
				output: {
					// App modules stay in the entry chunk; the runtime + virtual helpers
					// (modulepreload polyfill etc.) are forced into a chunk literally
					// named "framework" — the file-name test below keys off it. Vite 8
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
		const bucket = /(^|[\\/])framework-[^\\/]+\.js$/.test(file) ? 'fw' : 'app';
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
	console.log(`  ${name}: total gz ${total.gzip}  app gz ${sums.app.gzip}  fw gz ${sums.fw.gzip}`);
	targets.push({
		name,
		ops: {
			js_raw: val(total.raw),
			js_gzip: val(total.gzip),
			js_brotli: val(total.brotli),
			app_raw: val(sums.app.raw),
			app_gzip: val(sums.app.gzip),
			app_brotli: val(sums.app.brotli),
			fw_raw: val(sums.fw.raw),
			fw_gzip: val(sums.fw.gzip),
			fw_brotli: val(sums.fw.brotli),
		},
		meta: { files },
	});
}

const payload = { suite: 'bundle-size', iterations: 1, targets };

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
