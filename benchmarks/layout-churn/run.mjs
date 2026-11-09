// Layout passes and layout time per update, for rows that size a bar from a
// measured label. Counts come from Chromium's own metrics; timings use the same
// production bundle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const repo = path.resolve(import.meta.dirname, '../..');
// A second checkout's runtime measures the same fixture and compiler against it.
const source = path.resolve(process.env.LAYOUT_CHURN_SOURCE ?? repo);
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { compile } = await import(path.join(repo, 'packages/octane/src/compiler/index.js'));
const fixture = path.join(import.meta.dirname, 'fixture.tsrx');
const COUNTS = [100, 400];
const UPDATES = Number(process.argv[2] ?? 15);
const WARMUP = 3;
const VARIANTS = [
	'effect-interleaved',
	'snapshot-write',
	'effect-state',
	'snapshot',
	'handler-interleaved',
	'handler-batched',
];
// These read every label before writing any bar, so their layout work must not
// grow with the row count. The other variants are the patterns under study and
// carry no bound: a runtime that batches them is an improvement, not a failure.
const BATCHED = new Set(['effect-state', 'snapshot', 'handler-batched']);
const MAX_BATCHED_LAYOUTS = 3;

const built = await build({
	stdin: {
		contents: `export { createRoot, flushSync } from 'octane'; export { App } from ${JSON.stringify(fixture)};`,
		resolveDir: repo,
	},
	bundle: true,
	write: false,
	minify: true,
	format: 'iife',
	globalName: 'layoutChurn',
	platform: 'browser',
	target: 'es2022',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	plugins: [
		{
			name: 'octane-source',
			setup(plugin) {
				plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: id }) => ({
					path:
						id === 'octane'
							? path.join(source, 'packages/octane/src/index.ts')
							: require.resolve(id),
				}));
				plugin.onLoad({ filter: /\.tsrx$/ }, ({ path: file }) => {
					const compiled = compile(fs.readFileSync(file, 'utf8'), file, {
						mode: 'client',
						dev: false,
						hmr: false,
					});
					assert.deepEqual(compiled.diagnostics, []);
					return { contents: compiled.code, loader: 'ts', resolveDir: repo };
				});
			},
		},
	],
});
const bundle = built.outputFiles[0].text;

const STYLE = `
	body { margin: 0; font: 14px/1.2 monospace; }
	.row span { display: inline-block; }
	.row i { display: block; height: 2px; background: currentColor; }
`;

const median = (values) => values.slice().sort((a, b) => a - b)[values.length >> 1];
const stat = (values) => ({
	score: median(values),
	median: median(values),
	min: Math.min(...values),
	samples: values.length,
});

async function measure(browser, variant, count) {
	const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
	try {
		const failures = [];
		page.on('pageerror', (error) => failures.push(error.message));
		await page.setContent(`<!doctype html><style>${STYLE}</style><div id="root"></div>`);
		await page.addScriptTag({ content: bundle });
		const session = await page.context().newCDPSession(page);
		await session.send('Performance.enable');
		const metrics = async () => {
			const { metrics } = await session.send('Performance.getMetrics');
			return Object.fromEntries(metrics.map((metric) => [metric.name, metric.value]));
		};
		await page.evaluate(
			({ variant, count }) => {
				const { createRoot, flushSync, App } = globalThis.layoutChurn;
				const ids = Array.from({ length: count }, (_, id) => id);
				const root = createRoot(document.getElementById('root'));
				const button = () => document.querySelector('button');
				const handler = variant.startsWith('handler');
				globalThis.update = async (revision) => {
					const start = performance.now();
					flushSync(() => root.render(App, { variant, ids, revision }));
					if (handler) button().click();
					// Charge layout the update left pending to the update.
					document.body.offsetHeight;
					const elapsed = performance.now() - start;
					await new Promise((done) => requestAnimationFrame(() => setTimeout(done)));
					return elapsed;
				};
				globalThis.snapshot = () =>
					[...document.querySelectorAll('.row')].map((row) => [
						row.firstElementChild.textContent,
						row.firstElementChild.offsetWidth,
						row.lastElementChild.offsetWidth,
					]);
			},
			{ variant, count },
		);
		let revision = 0;
		for (; revision < WARMUP; revision++)
			await page.evaluate((r) => globalThis.update(r), revision);
		const layouts = [];
		const styles = [];
		const layoutMs = [];
		const updateMs = [];
		for (let sample = 0; sample < UPDATES; sample++, revision++) {
			const before = await metrics();
			updateMs.push(await page.evaluate((r) => globalThis.update(r), revision));
			const after = await metrics();
			layouts.push(after.LayoutCount - before.LayoutCount);
			styles.push(after.RecalcStyleCount - before.RecalcStyleCount);
			layoutMs.push((after.LayoutDuration - before.LayoutDuration) * 1000);
		}
		const rows = await page.evaluate(() => globalThis.snapshot());
		assert.deepEqual(failures, []);
		assert.equal(rows.length, count);
		for (const [label, labelWidth, barWidth] of rows) {
			assert.ok(labelWidth > 0, `${variant}: ${label} has no width`);
			assert.equal(barWidth, labelWidth, `${variant}: ${label} bar follows its label`);
		}
		return { rows, layouts, styles, layoutMs, updateMs };
	} finally {
		await page.close();
	}
}

const browser = await chromium.launch({ headless: true });
const targets = [];
try {
	for (const variant of VARIANTS) {
		const ops = {};
		for (const count of COUNTS) {
			const result = await measure(browser, variant, count);
			if (variant === VARIANTS[0]) measure[count] = result.rows;
			assert.deepEqual(result.rows, measure[count], `${variant} renders the same rows`);
			if (BATCHED.has(variant))
				assert.ok(
					Math.max(...result.layouts) <= MAX_BATCHED_LAYOUTS,
					`${variant} at ${count} rows laid out ${Math.max(...result.layouts)} times`,
				);
			ops[`layouts_${count}`] = stat(result.layouts);
			ops[`style_recalcs_${count}`] = stat(result.styles);
			ops[`layout_ms_${count}`] = stat(result.layoutMs);
			ops[`update_ms_${count}`] = stat(result.updateMs);
		}
		targets.push({ name: variant, ops });
	}
} finally {
	await browser.close();
}

const report = {
	suite: 'layout-churn',
	targets,
	meta: { node: process.version, chromium: browser.version(), source, updates: UPDATES },
};
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2));
console.table(
	Object.fromEntries(
		targets.map(({ name, ops }) => [
			name,
			Object.fromEntries(
				Object.entries(ops).map(([op, { median }]) => [op, Math.round(median * 100) / 100]),
			),
		]),
	),
);
