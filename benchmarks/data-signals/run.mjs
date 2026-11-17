/**
 * Time octane/data reads through the shipped hooks against the same reads as
 * signal cells, in a production build of Octane, in Chromium. See README.md.
 *
 *   node benchmarks/data-signals/run.mjs [rounds] [--quick] [--no-build] [--only=rows,field]
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCENARIOS, STEPS } from './contract.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const rounds = Number(args.find((value) => !value.startsWith('--')) ?? (quick ? 2 : 6));
const ITERATIONS = quick ? 5 : 15;
const WARMUP = quick ? 2 : 5;
const only = args
	.find((value) => value.startsWith('--only='))
	?.slice(7)
	.split(',');
const fromOctane = createRequire(path.join(ROOT, 'packages/octane/package.json'));
const fromNews = createRequire(path.join(ROOT, 'benchmarks/news/package.json'));
const outDir = path.join(HERE, 'dist');

/** One copy of each package for the whole page, the ones packages/octane resolves. */
function workspaceImports() {
	const names = ['octane', 'devalue'];
	return {
		name: 'data-signals-workspace-imports',
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
const browser = await chromium.launch({
	headless: true,
	args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
});

const cases = Object.entries(SCENARIOS)
	.filter(([scenario]) => !only || only.includes(scenario))
	.flatMap(([scenario, config]) => config.lanes.map((lane) => ({ scenario, lane })));
const key = ({ scenario, lane }) => `${scenario} ${lane}`;
const stepsOf = (scenario) =>
	SCENARIOS[scenario].steps ??
	STEPS.filter((step) => step !== 'write' || SCENARIOS[scenario].writes);
/** Per case and step, the median of each round; `heap` is bytes held while mounted. */
const medians = new Map();
/** Per case and step, the row renders the step made. */
const renders = new Map();
const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function runCase(spec) {
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${port}/?${new URLSearchParams(spec)}`);
	await page.waitForFunction(() => window.__ready === true, null, { timeout: 15_000 });
	const steps = stepsOf(spec.scenario);
	const samples = Object.fromEntries([...steps, 'heap'].map((step) => [step, []]));
	const heap = async () => {
		await page.evaluate(() => globalThis.gc?.());
		return page.evaluate(() => window.__bench.heap());
	};
	for (let index = 0; index < WARMUP + ITERATIONS; index++) {
		let before = 0;
		for (const step of steps) {
			if (step === 'mount') before = await heap();
			else await page.evaluate(() => globalThis.gc?.());
			const result = await page.evaluate((name) => window.__bench.run(name), step);
			if (errors.length) throw new Error(`${key(spec)}: ${errors.join('; ')}`);
			const expectedRows = step === 'unmount' ? 0 : SCENARIOS[spec.scenario].rows;
			if (result.rows !== expectedRows || !result.written)
				throw new Error(`${key(spec)} ${step}: wrong DOM ${JSON.stringify(result)}`);
			renders.set(`${key(spec)} ${step}`, result.renders);
			// Let the step's passive effects run, as a page would before its next
			// interaction: a read subscribes in one, so a write in the same frame
			// as its mount would render after the step instead of in it.
			await page.evaluate(
				() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))),
			);
			if (index < WARMUP) continue;
			samples[step].push(result.duration);
			if (step === 'mount') samples.heap.push((await heap()) - before);
		}
		await page.evaluate(() => window.__bench.reset());
	}
	await page.close();
	return samples;
}

try {
	for (let round = 0; round < rounds; round++) {
		// Alternate the order, so no lane always runs first or last.
		const order = round % 2 ? [...cases].reverse() : cases;
		for (const spec of order) {
			const samples = await runCase(spec);
			for (const [step, values] of Object.entries(samples)) {
				const name = `${key(spec)} ${step}`;
				if (!medians.has(name)) medians.set(name, []);
				medians.get(name).push(median(values));
			}
		}
		console.log(`round ${round + 1}/${rounds}`);
	}
} finally {
	await browser.close();
	await server.close();
}

const value = (spec, step) => median(medians.get(`${key(spec)} ${step}`));
const range = (spec, base, step) => {
	const ratios = medians
		.get(`${key(spec)} ${step}`)
		.map((sample, index) => sample / medians.get(`${key(base)} ${step}`)[index]);
	return `${Math.min(...ratios).toFixed(2)}–${Math.max(...ratios).toFixed(2)}`;
};
const results = [];
for (const [scenario, config] of Object.entries(SCENARIOS)) {
	if (only && !only.includes(scenario)) continue;
	const base = { scenario, lane: 'hooks' };
	for (const step of [...stepsOf(scenario), 'heap']) {
		const row = { scenario, step };
		for (const lane of config.lanes) {
			const spec = { scenario, lane };
			const amount = value(spec, step);
			row[lane] = step === 'heap' ? `${(amount / 1024).toFixed(0)} KB` : Number(amount.toFixed(2));
			if (step !== 'heap') row[`${lane} renders`] = renders.get(`${key(spec)} ${step}`);
			if (lane !== 'hooks') {
				row[`${lane}÷hooks`] =
					`${(amount / value(base, step)).toFixed(2)} (${range(spec, base, step)})`;
			}
		}
		results.push(row);
	}
}
for (const scenario of new Set(results.map((row) => row.scenario))) {
	console.log(`\n${scenario}: ${JSON.stringify(SCENARIOS[scenario])}`);
	console.table(
		results.filter((row) => row.scenario === scenario).map(({ scenario: _, ...row }) => row),
	);
}
if (process.env.BENCH_JSON) {
	fs.writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify(
			{ suite: 'data-signals', rounds, iterations: ITERATIONS, scenarios: SCENARIOS, results },
			null,
			'\t',
		),
	);
}
