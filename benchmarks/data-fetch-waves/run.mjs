/**
 * How a screen's data fetching strategy shapes its loading on a cold cache: the
 * requests it makes, how many sequential waves they take, and when the screen
 * becomes useful and complete. See README.md.
 *
 *   node benchmarks/data-fetch-waves/run.mjs [iterations] [--quick] [--no-build]
 */
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const ITERATIONS = Number(args.find((value) => !value.startsWith('--')) ?? (quick ? 3 : 15));
const fromOctane = createRequire(path.join(ROOT, 'packages/octane/package.json'));
const fromNews = createRequire(path.join(ROOT, 'benchmarks/news/package.json'));
const clientDir = path.join(HERE, 'dist/client');
const serverDir = path.join(HERE, 'dist/server');

const STRATEGIES = ['component', 'prefetch', 'aggregate'];
/** Data requests each strategy must make for a client-rendered screen. */
const REQUESTS = { component: 5, prefetch: 5, aggregate: 1 };
const PROFILES = [
	// Lighthouse's mobile preset: 150 ms round trip, 1.6 Mbps down, 750 kbps up, 4× CPU.
	{ name: 'mobile', latency: 150, down: 1.6e6 / 8, up: 750e3 / 8, cpu: 4 },
	{ name: 'desktop', latency: 0, down: -1, up: -1, cpu: 1 },
];

/** One copy of each package for the whole page, the ones packages/octane resolves. */
function workspaceImports() {
	const names = ['octane', 'devalue'];
	return {
		name: 'data-fetch-waves-workspace-imports',
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
if (!args.includes('--no-build')) {
	const { build } = await import(pathToFileURL(fromNews.resolve('vite')).href);
	const { octane } = await import(pathToFileURL(fromOctane.resolve('octane/compiler/vite')).href);
	const config = (outDir, ssr) => ({
		configFile: false,
		root: HERE,
		logLevel: 'warn',
		plugins: [workspaceImports(), octane({ hmr: false, profile: false })],
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		ssr: { noExternal: true },
		build: { outDir, emptyOutDir: true, target: 'esnext', minify: 'esbuild', ssr },
	});
	await build(config(clientDir, false));
	await build(config(serverDir, path.join(HERE, 'server.ts')));
}

const { render, handler } = await import(pathToFileURL(path.join(serverDir, 'server.js')).href);
const template = fs.readFileSync(path.join(clientDir, 'index.html'), 'utf8');
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

function toRequest(req, body) {
	const url = new URL(req.url, `http://${req.headers.host}`);
	return new Request(url, {
		method: req.method,
		headers: req.headers,
		body: req.method === 'GET' ? undefined : body,
	});
}

async function respond(req, res) {
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	const request = toRequest(req, Buffer.concat(chunks));
	const url = new URL(request.url);
	let response;
	if (url.pathname === '/data') {
		response = await handler(request);
	} else if (url.pathname === '/') {
		let html = template.replace('<!--ssr-html-->', '').replace('<!--ssr-seed-->', '');
		if (url.searchParams.has('ssr')) {
			const page = await render(
				request,
				url.searchParams.get('strategy'),
				url.searchParams.get('id') ?? 'p1',
			);
			html = template
				.replace('<!--ssr-html-->', () => page.html)
				.replace(
					'<!--ssr-seed-->',
					() => `<script type="application/json" id="seed">${page.seed}</script>`,
				);
		}
		response = new Response(html, { headers: { 'content-type': 'text/html' } });
	} else {
		const file = path.join(clientDir, path.normalize(url.pathname));
		response =
			file.startsWith(clientDir) && fs.existsSync(file)
				? new Response(fs.readFileSync(file), {
						headers: { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' },
					})
				: new Response('not found', { status: 404 });
	}
	// Compressed, as any production host serves it.
	let body = Buffer.from(await response.arrayBuffer());
	const headers = Object.fromEntries(response.headers);
	if (/\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
		body = zlib.gzipSync(body);
		headers['content-encoding'] = 'gzip';
	}
	res.writeHead(response.status, headers);
	res.end(body);
}

const server = http.createServer((req, res) =>
	respond(req, res).catch((error) => {
		console.error(error);
		res.writeHead(500).end();
	}),
);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

/**
 * Sequential request waves, as the number of requests in each. A request starts
 * a new wave when it begins after the earliest completion of the current one:
 * it could have waited on that response. The same rule as benchmarks/router-data.
 */
function waves(calls) {
	const counts = [];
	let waveEnd = -Infinity;
	for (const call of [...calls].sort((a, b) => a.start - b.start)) {
		if (call.start >= waveEnd - 1) {
			counts.push(1);
			waveEnd = call.end;
		} else {
			counts[counts.length - 1]++;
			if (call.end < waveEnd) waveEnd = call.end;
		}
	}
	return counts.join('+') || '0';
}

const { chromium } = fromNews('playwright');
const browser = await chromium.launch({ headless: true });

async function runCase(profile, strategy, ssr) {
	// A fresh context and a disabled cache: nothing is cached, not even the script.
	const context = await browser.newContext();
	const page = await context.newPage();
	const cdp = await context.newCDPSession(page);
	await cdp.send('Network.enable');
	await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
	await cdp.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: profile.latency,
		downloadThroughput: profile.down,
		uploadThroughput: profile.up,
	});
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
	});
	await page.goto(`${origin}/?strategy=${strategy}${ssr ? '&ssr' : ''}`);
	const result = await page.evaluate(() => window.__result);
	await context.close();
	const label = `${profile.name} ${ssr ? 'ssr' : 'csr'} ${strategy}`;
	if (errors.length) throw new Error(`${label}: ${errors.join('; ')}`);
	const expected = ssr ? 0 : REQUESTS[strategy];
	if (result.calls.length !== expected) {
		throw new Error(
			`${label}: ${result.calls.length} data requests, expected ${expected}: ` +
				result.calls.map((call) => call.name).join(', '),
		);
	}
	return { ...result, waves: waves(result.calls) };
}

const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

const cases = PROFILES.flatMap((profile) =>
	[false, true].flatMap((ssr) => STRATEGIES.map((strategy) => ({ profile, strategy, ssr }))),
);
const samples = new Map(cases.map((spec) => [spec, []]));
/** Every strategy must show the same screen. */
let text;
try {
	for (let index = 0; index < ITERATIONS; index++) {
		// Alternate the order, so no strategy always runs first or last.
		for (const spec of index % 2 ? [...cases].reverse() : cases) {
			const result = await runCase(spec.profile, spec.strategy, spec.ssr);
			text ??= result.text;
			if (result.text !== text) throw new Error(`${spec.strategy}: a different screen`);
			samples.get(spec).push(result);
		}
		console.log(`iteration ${index + 1}/${ITERATIONS}`);
	}
} finally {
	await browser.close();
	server.close();
}

const rows = cases.map((spec) => {
	const runs = samples.get(spec);
	const ms = (pick) => Math.round(median(runs.map(pick)));
	return {
		profile: spec.profile.name,
		render: spec.ssr ? 'ssr' : 'csr',
		strategy: spec.strategy,
		requests: runs[0].calls.length,
		waves: runs[0].waves,
		'script ms': ms((run) => run.start),
		'useful ms': spec.ssr ? ms((run) => run.fcp) : ms((run) => run.useful),
		'complete ms': spec.ssr ? ms((run) => run.fcp) : ms((run) => run.complete),
		'section fallbacks': Math.max(...runs.map((run) => run.sectionFallbacks)),
		'data ms': spec.ssr
			? 0
			: ms(
					(run) =>
						Math.max(...run.calls.map((c) => c.end)) - Math.min(...run.calls.map((c) => c.start)),
				),
	};
});
rows.forEach((row, index) => {
	if (samples.get(cases[index]).some((run) => run.waves !== row.waves)) row.waves += ' (varies)';
});
console.table(rows);
if (process.env.BENCH_JSON) {
	fs.writeFileSync(
		process.env.BENCH_JSON,
		JSON.stringify(
			{ suite: 'data-fetch-waves', iterations: ITERATIONS, results: rows },
			null,
			'\t',
		),
	);
}
