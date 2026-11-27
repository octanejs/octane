/**
 * The Chromium runner: serves the bundled page and worker, then drives
 * browser.ts in headless Chromium. A step's tab busy time is the page's
 * main-thread task time over the step (the DevTools protocol's
 * `TaskDuration`, which leaves out the worker), divided by its iterations.
 * See README.md.
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANES, STEPS, add, report, wireFrom, type Lane, type WorkerStats } from './report.ts';

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const ROUNDS = Number(args.find((arg) => /^\d+$/.test(arg)) ?? (quick ? 2 : 8));
const ITERATIONS = quick ? 5 : 20;
const COUNT = Number(process.env.ROWS ?? 5000);
const WIRE = wireFrom(args);

const DIST = path.dirname(fileURLToPath(import.meta.url));
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer(async (request, response) => {
	const name = new URL(request.url!, 'http://localhost').pathname.slice(1) || 'index.html';
	const body =
		name === 'index.html'
			? '<!doctype html><script type="module" src="./browser.js"></script>'
			: await readFile(path.join(DIST, path.basename(name))).catch(() => null);
	if (body === null) return void response.writeHead(404).end();
	response.writeHead(200, { 'content-type': types[path.extname(name) || '.html'] ?? 'text/plain' });
	response.end(body);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address() as { port: number };

// Playwright, from a benchmark package that depends on it.
const fromNews = createRequire(path.resolve(DIST, '../../news/package.json'));
const { chromium } = fromNews('playwright') as typeof import('playwright');
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Performance.enable');
	const taskSeconds = async () => {
		const { metrics } = await cdp.send('Performance.getMetrics');
		return metrics.find((metric) => metric.name === 'TaskDuration')!.value;
	};
	await page.goto(`http://127.0.0.1:${port}/?count=${COUNT}&wire=${WIRE}`);
	await page.waitForFunction(() => '__bench' in globalThis);

	for (let index = 0; index < ROUNDS; index++) {
		for (const lane of index % 2 ? [...LANES].reverse() : LANES) {
			for (const step of STEPS) {
				const before = await taskSeconds();
				const samples = await page.evaluate(
					([lane, step, iterations]) =>
						(globalThis as any).__bench.step(lane, step, iterations) as Promise<
							Array<{ wall: number; pageCalls: number }>
						>,
					[lane, step, ITERATIONS] as const,
				);
				const busy = ((await taskSeconds()) - before) * 1000;
				// Task time is known for the whole step, so every sample carries its share.
				add(
					lane,
					step,
					samples.map((sample) => ({ ...sample, busy: busy / ITERATIONS })),
				);
			}
		}
	}
	const stats = (lane: Lane) =>
		page.evaluate((lane) => (globalThis as any).__bench.stats(lane) as Promise<WorkerStats>, lane);
	const workers = { page: await stats('page'), worker: await stats('worker') };
	if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
	report({
		title: `Chromium ${browser.version()}`,
		wire: WIRE,
		count: COUNT,
		rounds: ROUNDS,
		iterations: ITERATIONS,
		workers,
	});
} finally {
	await browser.close();
	server.close();
}
