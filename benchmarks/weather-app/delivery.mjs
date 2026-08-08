// Compare genuinely streamed HTML plus hydration with the unchanged CSR build.
// Effects never execute on the server: this streams the shared header/search
// shell, not preloaded weather data, and reports the modes separately.

process.env.NODE_ENV = 'production';

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixtureRequire = createRequire(new URL('./octane-tsrx/package.json', import.meta.url));
const { build } = await import(pathToFileURL(fixtureRequire.resolve('vite')).href);
const FRAMEWORKS = [
	{ name: 'octane-tsrx', extension: 'js' },
	{ name: 'react', extension: 'jsx' },
];
const positional = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const ITERATIONS = Number.parseInt(positional[0] ?? '3', 10);
const VERIFY_ONLY = process.argv.includes('--verify-only');
const KEEP_ARTIFACTS = process.argv.includes('--keep-artifacts');

if (!Number.isSafeInteger(ITERATIONS) || ITERATIONS < 1) {
	throw new Error('Weather delivery iterations must be a positive integer');
}

const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-weather-delivery-'));
const servers = [];
let browser;

function assert(condition, message) {
	if (!condition) throw new Error(`weather-app delivery verify failed: ${message}`);
}

// The canonical browser fixture intentionally assumes browser globals. Keep its
// authored source and client bundle unchanged; only make the separately built
// server module acknowledge that deterministic mock mode is safe during SSR.
function serverMockMode() {
	return {
		name: 'weather-delivery-server-mock-mode',
		enforce: 'pre',
		transform(source, id, options) {
			if (
				!options?.ssr ||
				path.normalize(id.split('?')[0]) !== path.join(HERE, 'shared', 'src', 'WeatherService.js')
			) {
				return null;
			}

			const signature = 'shouldUseMockData() {';
			assert(source.includes(signature), 'WeatherService no longer exposes its mock-mode check');
			return source.replace(
				signature,
				`${signature}\n\t\tif (typeof window === 'undefined') return true;`,
			);
		},
	};
}

function outputChunks(result) {
	const outputs = Array.isArray(result) ? result : [result];
	return outputs.flatMap((output) => output.output ?? []);
}

async function buildFramework(framework) {
	const root = path.join(HERE, framework.name);
	const directory = path.join(artifacts, framework.name);
	const csrDirectory = path.join(directory, 'csr');
	const hydrationDirectory = path.join(directory, 'hydration');
	const serverDirectory = path.join(directory, 'server');
	const clientEntry = path.join(root, 'src', `entry-delivery-client.${framework.extension}`);
	const serverEntry = path.join(root, 'src', `entry-delivery-server.${framework.extension}`);
	const shared = { root, configFile: path.join(root, 'vite.config.js'), logLevel: 'error' };
	fs.mkdirSync(directory, { recursive: true });
	fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');

	console.error(`Building ${framework.name} CSR and streamed-shell hydration fixtures…`);
	await build({
		...shared,
		build: { outDir: csrDirectory, emptyOutDir: true },
	});

	const hydration = await build({
		...shared,
		build: {
			outDir: hydrationDirectory,
			emptyOutDir: true,
			rollupOptions: { input: { 'delivery-client': clientEntry } },
		},
	});
	const hydrationEntry = outputChunks(hydration).find(
		(chunk) => chunk.type === 'chunk' && chunk.isEntry,
	);
	assert(hydrationEntry, `${framework.name} hydration bundle has no client entry`);

	const server = await build({
		...shared,
		plugins: [serverMockMode()],
		build: { ssr: serverEntry, outDir: serverDirectory, emptyOutDir: true },
	});
	const serverOutput = outputChunks(server).find(
		(chunk) => chunk.type === 'chunk' && chunk.isEntry,
	);
	assert(serverOutput, `${framework.name} server build has no render entry`);
	const { renderApp } = await import(
		pathToFileURL(path.join(serverDirectory, serverOutput.fileName)).href
	);
	assert(typeof renderApp === 'function', `${framework.name} server does not export renderApp`);

	const template = fs.readFileSync(path.join(csrDirectory, 'index.html'), 'utf8');
	const csrScript = template.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
	assert(csrScript, `${framework.name} CSR template has no production entry script`);
	const hydrationScript = `/${hydrationEntry.fileName}`;
	const streamedTemplate = template.replace(csrScript[1], hydrationScript);
	const rootMarker = '<div id="main"></div>';
	assert(streamedTemplate.includes(rootMarker), `${framework.name} template has no empty #main`);
	const [prefix, suffix] = streamedTemplate.split(rootMarker);

	return {
		...framework,
		csrDirectory,
		hydrationDirectory,
		prefix,
		renderApp,
		suffix,
		template,
	};
}

const CONTENT_TYPES = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.svg': 'image/svg+xml',
};

function respondFile(request, response, file) {
	const contents = fs.readFileSync(file);
	response.setHeader(
		'content-type',
		CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
	);
	response.setHeader('cache-control', 'no-cache');
	if (contents.length >= 1024 && /\bgzip\b/.test(request.headers['accept-encoding'] ?? '')) {
		response.setHeader('content-encoding', 'gzip');
		response.end(gzipSync(contents));
		return;
	}
	response.end(contents);
}

function resolveAsset(directory, pathname) {
	const file = path.resolve(directory, `.${decodeURIComponent(pathname)}`);
	if (!file.startsWith(`${directory}${path.sep}`)) return null;
	if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
	return file;
}

function streamShell(framework, response) {
	let controller;
	let ready = false;
	let started = false;
	const body = new PassThrough();
	const fail = (error) => {
		const message = error instanceof Error ? error.message : String(error);
		if (!response.headersSent) {
			response.statusCode = 500;
			response.end(message);
			return;
		}
		response.destroy(new Error(message));
	};

	body.on('data', (chunk) => response.write(chunk));
	body.once('error', fail);
	body.once('end', () => {
		response.end(
			'</div><script>window.__weatherDelivery={' +
				'mode:"streamed_shell",hydrationCalls:0,' +
				'serverHeader:document.querySelector(".header"),' +
				'serverSearch:document.querySelector("[data-testid=search-form]")' +
				'};</script>' +
				framework.suffix,
		);
	});

	function flushShell() {
		if (!ready || !controller || started) return;
		started = true;
		response.statusCode = 200;
		response.setHeader('content-type', CONTENT_TYPES['.html']);
		response.write(`${framework.prefix}<div id="main">`);
		controller.pipe(body);
	}

	try {
		controller = framework.renderApp({
			onShellReady() {
				ready = true;
				flushShell();
			},
			onShellError: fail,
			onError: fail,
		});
		flushShell();
	} catch (error) {
		fail(error);
	}
}

async function serveFramework(framework) {
	const server = createServer((request, response) => {
		try {
			const url = new URL(request.url ?? '/', 'http://127.0.0.1');
			if (url.pathname === '/') {
				if (url.searchParams.get('delivery') === 'streamed_shell') {
					streamShell(framework, response);
				} else {
					respondFile(request, response, path.join(framework.csrDirectory, 'index.html'));
				}
				return;
			}

			const file =
				resolveAsset(framework.hydrationDirectory, url.pathname) ??
				resolveAsset(framework.csrDirectory, url.pathname);
			if (file) {
				respondFile(request, response, file);
				return;
			}
			response.statusCode = 404;
			response.end('Not found');
		} catch (error) {
			response.statusCode = 500;
			response.end(error instanceof Error ? error.message : String(error));
		}
	});

	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	servers.push(server);
	const address = server.address();
	assert(address && typeof address !== 'string', `${framework.name} exposed no HTTP port`);
	return `http://127.0.0.1:${address.port}/`;
}

async function verifyDelivery(framework, origin) {
	const streamUrl = `${origin}?delivery=streamed_shell&mock=true&benchmark=true`;
	const shell = await fetch(streamUrl).then((response) => response.text());
	assert(shell.includes('Weather Front'), `${framework.name} streamed no server header`);
	assert(shell.includes('data-testid="search-form"'), `${framework.name} streamed no search form`);
	assert(
		!shell.includes('London, United Kingdom'),
		`${framework.name} unexpectedly preloaded weather`,
	);

	for (const mode of ['client', 'streamed_shell']) {
		const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		try {
			await page.goto(`${origin}?delivery=${mode}&mock=true&benchmark=true`, {
				waitUntil: 'load',
			});
			await page.waitForFunction(
				() =>
					document.querySelector('[data-testid="current-location"]')?.textContent ===
					'London, United Kingdom',
				undefined,
				{ timeout: 15_000 },
			);
			assert(
				(await page.locator('[data-testid="forecast-item"]').count()) === 7,
				`${framework.name}/${mode} did not render seven forecasts`,
			);
			if (mode === 'streamed_shell') {
				const adoption = await page.evaluate(() => ({
					hydrationCalls: window.__weatherDelivery?.hydrationCalls,
					headerAdopted:
						document.querySelector('.header') === window.__weatherDelivery?.serverHeader,
					searchAdopted:
						document.querySelector('[data-testid="search-form"]') ===
						window.__weatherDelivery?.serverSearch,
				}));
				assert(adoption.hydrationCalls === 1, `${framework.name} did not hydrate exactly once`);
				assert(adoption.headerAdopted, `${framework.name} replaced the server-rendered header`);
				assert(
					adoption.searchAdopted,
					`${framework.name} replaced the server-rendered search form`,
				);
			}

			await page.locator('[data-testid="search-input"]').fill('Tokyo');
			await page.locator('[data-testid="search-button"]').click();
			await page.waitForFunction(
				() =>
					document.querySelector('[data-testid="current-location"]')?.textContent ===
					'Tokyo, Japan',
				undefined,
				{ timeout: 15_000 },
			);
			assert(
				(await page.evaluate(() => localStorage.getItem('weather-app-location'))) === 'Tokyo',
				`${framework.name}/${mode} did not persist the searched city`,
			);
			assert(errors.length === 0, `${framework.name}/${mode} browser errors: ${errors.join('; ')}`);
		} finally {
			await context.close();
		}
	}
}

async function runLighthouse(targets) {
	const report = path.join(artifacts, 'delivery-lighthouse.json');
	const environment = {
		...process.env,
		BENCH_JSON: report,
		TARGETS: JSON.stringify(targets),
		NO_PROXY: 'localhost,127.0.0.1,::1',
		no_proxy: 'localhost,127.0.0.1,::1',
	};
	for (const proxy of [
		'HTTP_PROXY',
		'HTTPS_PROXY',
		'ALL_PROXY',
		'http_proxy',
		'https_proxy',
		'all_proxy',
		'NODE_USE_ENV_PROXY',
	]) {
		delete environment[proxy];
	}
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path.join(HERE, 'lighthouse.mjs'), String(ITERATIONS)], {
			env: environment,
			stdio: 'inherit',
		});
		child.once('error', reject);
		child.once('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`delivery Lighthouse exited with status ${code}`));
		});
	});

	const payload = JSON.parse(fs.readFileSync(report, 'utf8'));
	payload.suite = 'weather-app-delivery';
	payload.delivery = {
		modes: ['client', 'streamed_shell'],
		serverPrefetchedWeather: false,
		hydrationAdoptsServerShell: true,
	};
	if (process.env.BENCH_JSON) {
		fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
	}
	return payload;
}

try {
	const frameworks = [];
	for (const framework of FRAMEWORKS) {
		frameworks.push(await buildFramework(framework));
	}

	browser = await chromium.launch({ headless: true });
	const targets = [];
	for (const framework of frameworks) {
		const origin = await serveFramework(framework);
		await verifyDelivery(framework, origin);
		for (const mode of ['client', 'streamed_shell']) {
			targets.push({ name: `${framework.name}-${mode}`, url: `${origin}?delivery=${mode}` });
		}
	}
	await browser.close();
	browser = undefined;

	if (VERIFY_ONLY) {
		console.log(
			'Weather delivery: both frameworks adopted streamed shells and preserved interactions.',
		);
	} else {
		await runLighthouse(targets);
	}
} finally {
	if (browser) await browser.close();
	await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
	if (KEEP_ARTIFACTS) console.error(`Weather delivery artifacts: ${artifacts}`);
	else fs.rmSync(artifacts, { recursive: true, force: true });
}
