/**
 * CPU-profile one step of one case in an unminified production build, and
 * print the functions with the most self time.
 *
 *   node benchmarks/data-signals/profile.mjs <scenario> <lane> <step> [iterations] [--no-build]
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STEPS } from './contract.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const [scenario, lane, target, iterations = '30'] = args;
const fromOctane = createRequire(path.join(ROOT, 'packages/octane/package.json'));
const fromNews = createRequire(path.join(ROOT, 'benchmarks/news/package.json'));
const outDir = path.join(HERE, 'profile', 'dist');

process.env.NODE_ENV = 'production';
const { build, preview } = await import(pathToFileURL(fromNews.resolve('vite')).href);
if (!process.argv.includes('--no-build')) {
	const { octane } = await import(pathToFileURL(fromOctane.resolve('octane/compiler/vite')).href);
	await build({
		configFile: false,
		root: HERE,
		logLevel: 'warn',
		plugins: [
			{
				name: 'data-signals-workspace-imports',
				enforce: 'pre',
				resolveId(source) {
					for (const name of ['octane', 'devalue']) {
						if (source === name || source.startsWith(`${name}/`)) return fromOctane.resolve(source);
					}
					return null;
				},
			},
			octane({ hmr: false, profile: false }),
		],
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		build: { outDir, emptyOutDir: true, target: 'esnext', minify: false },
	});
}
const server = await preview({
	configFile: false,
	root: HERE,
	logLevel: 'error',
	build: { outDir },
	preview: { host: '127.0.0.1', port: 0, strictPort: true },
});
const { chromium } = fromNews('playwright');
const browser = await chromium.launch({ headless: true, args: ['--js-flags=--expose-gc'] });
try {
	const page = await browser.newPage();
	page.on('pageerror', (error) => console.error(error.message));
	const { port } = server.httpServer.address();
	await page.goto(`http://127.0.0.1:${port}/?${new URLSearchParams({ scenario, lane })}`);
	await page.waitForFunction(() => window.__ready === true);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Profiler.enable');
	await cdp.send('Profiler.setSamplingInterval', { interval: 50 });
	const steps = STEPS.filter((step) => step !== 'write' || scenario !== 'none');
	const cycle = async (profile) => {
		for (const step of steps) {
			await page.evaluate(() => globalThis.gc?.());
			if (profile && step === target) await cdp.send('Profiler.start');
			await page.evaluate((name) => window.__bench.run(name), step);
			if (profile && step === target) parts.push((await cdp.send('Profiler.stop')).profile);
		}
		await page.evaluate(() => window.__bench.reset());
	};
	const parts = [];
	for (let index = 0; index < 5; index++) await cycle(false);
	for (let index = 0; index < Number(iterations); index++) await cycle(true);
	const self = new Map();
	let total = 0;
	for (const profile of parts) {
		const byId = new Map(profile.nodes.map((node) => [node.id, node]));
		profile.samples.forEach((id, index) => {
			const { functionName, url, lineNumber } = byId.get(id).callFrame;
			if (functionName === '(idle)' || functionName === '(program)') return;
			const name = `${functionName || '(anonymous)'} ${path.basename(url)}:${lineNumber + 1}`;
			self.set(name, (self.get(name) ?? 0) + profile.timeDeltas[index]);
			total += profile.timeDeltas[index];
		});
	}
	console.log(
		`${scenario} ${lane} ${target}: ${(total / 1000 / parts.length).toFixed(2)} ms per step`,
	);
	for (const [name, time] of [...self]
		.sort((a, b) => b[1] - a[1])
		.slice(0, Number(process.env.TOP ?? 28))) {
		console.log(`${((100 * time) / total).toFixed(1).padStart(5)}%  ${name}`);
	}
} finally {
	await browser.close();
	await server.close();
}
