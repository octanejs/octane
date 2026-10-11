import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { acquireBenchmarkLock } from '../lib/run-lock.mjs';
import { pairedRatio } from '../lib/stats.mjs';
import { roundOrder } from '../lib/paired.mjs';

const { values } = parseArgs({
	options: {
		mode: { type: 'string', default: 'work' },
		base: { type: 'string' },
		candidate: { type: 'string' },
		out: { type: 'string' },
		browser: { type: 'string' },
	},
});
assert(values.base && values.out, 'Pass --base and --out');
assert(['work', 'timing'].includes(values.mode));
assert(values.mode !== 'timing' || values.candidate, 'Timing requires both builds');
const out = path.resolve(values.out);
assert(!fs.existsSync(out), 'Use a new output directory');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const digest = (file) => hash(fs.readFileSync(file));
const builds = Object.fromEntries(
	['base', 'candidate']
		.filter((name) => values[name])
		.map((name) => {
			const directory = fs.realpathSync(values[name]);
			const file = path.join(directory, 'manifest.json');
			const manifest = JSON.parse(fs.readFileSync(file));
			assert.equal(
				manifest.options.minify,
				values.mode === 'timing' ? 'esbuild' : false,
				'Build mode',
			);
			return [name, { directory, manifest, manifestSHA256: digest(file) }];
		}),
);
if (builds.candidate) {
	for (const key of ['authored', 'scripts', 'tools', 'options', 'scenarios'])
		assert.deepEqual(builds.base.manifest[key], builds.candidate.manifest[key], 'Matched ' + key);
	assert.equal(builds.base.manifest.node, builds.candidate.manifest.node, 'Matched build Node');
}
function verifyArtifacts() {
	for (const { directory, manifest, manifestSHA256 } of Object.values(builds)) {
		assert.equal(digest(path.join(directory, 'manifest.json')), manifestSHA256);
		for (const asset of manifest.assets)
			assert.equal(digest(path.join(directory, 'dist', asset.file)), asset.sha256, asset.file);
	}
}
verifyArtifacts();
fs.mkdirSync(out, { recursive: true });
const receipt = {
	mode: values.mode,
	status: 'running',
	node: process.version,
	builds: Object.fromEntries(
		Object.entries(builds).map(([name, item]) => [
			name,
			{ directory: item.directory, manifestSHA256: item.manifestSHA256 },
		]),
	),
	scripts: Object.fromEntries(
		['run.mjs', '../lib/stats.mjs', '../lib/paired.mjs', '../lib/run-lock.mjs'].map((file) => [
			file,
			digest(fileURLToPath(new URL(file, import.meta.url))),
		]),
	),
	protocol: {
		rows: values.mode === 'work' ? 32 : 256,
		pairs: values.mode === 'work' ? null : 24,
		warmupBatches: 10,
		warmupRepetitions: 4,
		timedRepetitions: { mount: 64, update: 2048, unmount: 256 },
		coldMountRepetitions: 1,
	},
	results: [],
};
const save = () =>
	fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
const servers = [];
let browser;
async function serve(build) {
	const dist = path.join(build.directory, 'dist');
	const server = createServer((request, response) => {
		const pathname = new URL(request.url, 'http://localhost').pathname;
		if (pathname === '/favicon.ico') {
			response.writeHead(204);
			response.end();
			return;
		}
		const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
		if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
			response.writeHead(404);
			response.end();
			return;
		}
		response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
		response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
		response.setHeader(
			'Content-Type',
			file.endsWith('.js')
				? 'text/javascript'
				: file.endsWith('.html')
					? 'text/html'
					: 'application/json',
		);
		response.end(fs.readFileSync(file));
	});
	servers.push(server);
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	return `http://127.0.0.1:${server.address().port}/`;
}
// These wrappers run only in diagnostic realms, never in the timed browser.
function instrumentDOM() {
	const counts = (window.__dom = {
		enabled: false,
		cloneNode: 0,
		importNode: 0,
		insertBefore: 0,
		appendChild: 0,
		removeChild: 0,
	});
	for (const [prototype, names] of [
		[Node.prototype, ['cloneNode', 'insertBefore', 'appendChild', 'removeChild']],
		[Document.prototype, ['importNode']],
	]) {
		for (const name of names) {
			const original = prototype[name];
			prototype[name] = function (...args) {
				if (counts.enabled) counts[name]++;
				return Reflect.apply(original, this, args);
			};
		}
	}
}
async function sample(name, scenario, pair) {
	const build = builds[name];
	const context = await browser.newContext();
	const errors = [],
		loaded = new Map(),
		responses = [];
	try {
		if (values.mode === 'work') await context.addInitScript(instrumentDOM);
		const page = await context.newPage();
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (event) => {
			if (event.type() === 'error') errors.push(event.text());
		});
		page.on('response', (response) => {
			if (!response.url().startsWith(build.url) || !response.url().endsWith('.js')) return;
			responses.push(
				response
					.body()
					.then((data) => loaded.set(response.url().slice(build.url.length), hash(data))),
			);
		});
		await page.goto(build.url, { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true);
		await Promise.all(responses);
		assert.deepEqual(
			Object.fromEntries([...loaded].sort()),
			Object.fromEntries(
				build.manifest.assets
					.filter((asset) => asset.file.endsWith('.js'))
					.map((asset) => [asset.file, asset.sha256])
					.sort(),
			),
			'Exact loaded JavaScript',
		);
		const result = await page.evaluate(
			({ id, mode }) => {
				const api = window.__inlining;
				api.prepare(id, mode === 'work' ? 32 : 256);
				if (mode === 'work') {
					const operations = {};
					for (const operation of ['mount', 'update', 'unmount']) {
						const counts = window.__dom;
						for (const key of Object.keys(counts)) if (key !== 'enabled') counts[key] = 0;
						counts.enabled = true;
						try {
							api[operation]();
						} finally {
							counts.enabled = false;
						}
						operations[operation] = { ...counts };
						if (operation === 'mount') api.retain();
						else if (operation === 'update') api.verify(true);
						else api.verifyEmpty();
					}
					return operations;
				}
				const times = { coldMount: api.timed('mount', 1) };
				api.retain();
				api.update();
				api.verify(true);
				api.unmount();
				api.verifyEmpty();
				for (const operation of ['mount', 'update', 'unmount']) {
					for (let warmup = 0; warmup < 10; warmup++) api.timed(operation, 4);
					if (operation === 'update') api.retain();
					times[operation] = api.timed(
						operation,
						{ mount: 64, update: 2048, unmount: 256 }[operation],
					);
					if (operation === 'update') api.verify(true);
				}
				api.verifyEmpty();
				return times;
			},
			{ id: scenario.id, mode: values.mode },
		);
		assert.deepEqual(errors, [], 'Browser errors');
		receipt.results.push({
			variant: name,
			case: scenario.id,
			pair,
			result,
			semantics:
				'all row values/nesting, all element identities, edited input draft, empty unmount',
		});
		save();
	} finally {
		await context.close();
	}
}
const release = acquireBenchmarkLock();
try {
	for (const build of Object.values(builds)) build.url = await serve(build);
	browser = await chromium.launch({
		headless: true,
		...(values.browser ? { executablePath: values.browser } : {}),
	});
	receipt.browser = {
		version: browser.version(),
		requestedExecutable: values.browser ?? null,
		selection: values.browser ? 'explicit executable' : 'Playwright default headless browser',
	};
	save();
	const scenarios = builds.base.manifest.scenarios;
	for (let pair = 0; pair < (values.mode === 'work' ? 1 : 24); pair++) {
		for (const scenario of roundOrder(scenarios, pair)) {
			for (const name of roundOrder(Object.keys(builds), pair)) await sample(name, scenario, pair);
		}
		console.log(JSON.stringify({ completedPair: pair + 1, observations: receipt.results.length }));
	}
	if (values.mode === 'timing') {
		receipt.ratios = [];
		for (const scenario of scenarios)
			for (const operation of ['coldMount', 'mount', 'update', 'unmount']) {
				const data = (variant) =>
					receipt.results
						.filter((row) => row.variant === variant && row.case === scenario.id)
						.map((row) => {
							const ms = row.result[operation].perOperation;
							assert(ms > 0, 'Zero-duration samples require a separately planned larger batch');
							return ms * 1e6;
						});
				receipt.ratios.push({
					case: scenario.id,
					operation,
					...pairedRatio(data('base'), data('candidate')),
				});
			}
	}
	receipt.status = 'passed';
} catch (error) {
	receipt.status = 'failed';
	receipt.error = error.stack;
	throw error;
} finally {
	try {
		await browser?.close();
		for (const server of servers)
			await new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		verifyArtifacts();
	} catch (error) {
		receipt.status = 'failed';
		receipt.cleanupError = error.stack;
		throw error;
	} finally {
		try {
			save();
		} finally {
			release();
		}
	}
}
