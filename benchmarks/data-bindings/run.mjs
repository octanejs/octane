/**
 * Time octane/data's bindings against signal reads and a bare
 * `useSyncExternalStore`, in production builds of Octane and React, in
 * Chromium. See README.md.
 *
 *   node benchmarks/data-bindings/run.mjs [rounds] [--quick] [--no-build]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LANES, RENDERERS, ROWS, SCENARIOS, STEPS } from './contract.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const rounds = Number(args.find((value) => !value.startsWith('--')) ?? (quick ? 2 : 8));
const ITERATIONS = quick ? 5 : 20;
const WARMUP = quick ? 2 : 5;
const fromOctane = createRequire(path.join(ROOT, 'packages/octane/package.json'));
const fromNews = createRequire(path.join(ROOT, 'benchmarks/news/package.json'));
const outDir = path.join(HERE, 'dist');

/** One copy of each package for the whole page, the ones packages/octane resolves. */
function workspaceImports() {
	const names = ['octane', 'react', 'react-dom', 'devalue'];
	return {
		name: 'data-bindings-workspace-imports',
		enforce: 'pre',
		resolveId(source) {
			for (const name of names) {
				if (source === name || source.startsWith(`${name}/`)) return fromOctane.resolve(source);
			}
			return null;
		},
	};
}

process.env.NODE_ENV = 'production';
const { build, preview } = await import(pathToFileURL(fromNews.resolve('vite')).href);
if (!args.includes('--no-build')) {
	const { octane } = await import(pathToFileURL(fromOctane.resolve('octane/compiler/vite')).href);
	await build({
		configFile: false,
		root: HERE,
		logLevel: 'warn',
		plugins: [workspaceImports(), octane({ hmr: false, profile: false })],
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		build: { outDir, emptyOutDir: true, target: 'esnext', minify: 'esbuild' },
	});
}
const server = await preview({
	configFile: false,
	root: HERE,
	logLevel: 'error',
	build: { outDir },
	preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
const { port } = server.httpServer.address();
const { chromium } = fromNews('playwright');
const browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] });

const cases = RENDERERS.flatMap((renderer) =>
	LANES[renderer].flatMap((lane) => SCENARIOS.map((scenario) => ({ renderer, lane, scenario }))),
);
const key = ({ renderer, lane, scenario }) => `${renderer} ${lane} ${scenario}`;
/** Per case and step, the median of each round. */
const medians = new Map();
/** Per scenario and step, the renders and rows every lane must agree on. */
const controls = new Map();
const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function runCase(spec) {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const query = new URLSearchParams(spec).toString();
	await page.goto(`http://127.0.0.1:${port}/?${query}`);
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 15_000 });
	const durations = Object.fromEntries(STEPS.map((step) => [step, []]));
	for (let index = 0; index < WARMUP + ITERATIONS; index++) {
		for (const step of STEPS) {
			await page.evaluate(() => globalThis.gc?.());
			const result = await page.evaluate((name) => window.__bench.run(name), step);
			if (errors.length) throw new Error(`${key(spec)}: ${errors.join('; ')}`);
			const expectedRows = step === 'unmount' ? 0 : ROWS;
			if (result.rows !== expectedRows || !result.written)
				throw new Error(`${key(spec)} ${step}: wrong DOM ${JSON.stringify(result)}`);
			const control = `${spec.scenario} ${step}`;
			const renders = controls.get(control)?.get(spec.renderer);
			if (renders === undefined) {
				if (!controls.has(control)) controls.set(control, new Map());
				controls.get(control).set(spec.renderer, result.renders);
			} else if (renders !== result.renders) {
				throw new Error(`${key(spec)} ${step}: ${result.renders} renders, other lanes ${renders}`);
			}
			if (index >= WARMUP) durations[step].push(result.duration);
		}
		await page.evaluate(() => window.__bench.reset());
	}
	await page.close();
	return durations;
}

try {
	for (let round = 0; round < rounds; round++) {
		// Alternate the order, so no lane always runs first or last.
		const order = round % 2 ? [...cases].reverse() : cases;
		for (const spec of order) {
			const durations = await runCase(spec);
			for (const step of STEPS) {
				const name = `${key(spec)} ${step}`;
				if (!medians.has(name)) medians.set(name, []);
				medians.get(name).push(median(durations[step]));
			}
		}
		console.log(`round ${round + 1}/${rounds}`);
	}
} finally {
	await browser.close();
	await server.close();
}

const ms = (spec, step) => median(medians.get(`${key(spec)} ${step}`));
const range = (spec, base, step) => {
	const ratios = medians
		.get(`${key(spec)} ${step}`)
		.map((value, index) => value / medians.get(`${key(base)} ${step}`)[index]);
	return `${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)}`;
};
const rows = [];
for (const scenario of SCENARIOS) {
	for (const step of STEPS) {
		const row = { scenario, step, renders: controls.get(`${scenario} ${step}`)?.get('octane') };
		for (const renderer of RENDERERS) {
			const bare = { renderer, lane: 'bare', scenario };
			for (const lane of LANES[renderer]) {
				const spec = { renderer, lane, scenario };
				row[`${renderer} ${lane} ms`] = Number(ms(spec, step).toFixed(2));
				if (lane !== 'bare') {
					row[`${renderer} ${lane}÷bare`] =
						`${(ms(spec, step) / ms(bare, step)).toFixed(2)} (${range(spec, bare, step)})`;
				}
			}
		}
		rows.push(row);
	}
}
console.table(rows);
if (process.env.BENCH_JSON) {
	fs.writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify(
			{ suite: 'data-bindings', rows: ROWS, rounds, iterations: ITERATIONS, results: rows },
			null,
			'\t',
		),
	);
}
