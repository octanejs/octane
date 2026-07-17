// Production bundle-size evidence for minimal and full-catalogue authored paths.
// Every built entry is loaded in Chromium and must publish the same real Three
// scene checksum before its bytes are accepted.
process.env.NODE_ENV = 'production';

import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright';
import { build } from 'vite';
import { octane } from 'octane/compiler/vite';
import { threeRenderers } from '@octanejs/three/config';

const ROOT = import.meta.dirname;
const OUT_ROOT = path.join(ROOT, 'dist-size');
const TARGETS = [
	{ name: 'octane-min', entry: 'size/octane-min.three.tsrx', plugins: 'octane', full: false },
	{
		name: 'octane-full',
		entry: 'size/octane-full.three.tsrx',
		plugins: 'octane',
		full: true,
	},
	{ name: 'r3f-min', entry: 'size/r3f-min.jsx', plugins: 'react', full: false },
	{ name: 'r3f-full', entry: 'size/r3f-full.jsx', plugins: 'react', full: true },
	{ name: 'plain-min', entry: 'size/plain-min.js', plugins: 'plain', full: false },
	{ name: 'plain-full', entry: 'size/plain-full.js', plugins: 'plain', full: true },
];

const gzipBytes = (buffer) => gzipSync(buffer, { level: zc.Z_BEST_COMPRESSION }).length;
const brotliBytes = (buffer) =>
	brotliCompressSync(buffer, {
		params: { [zc.BROTLI_PARAM_QUALITY]: zc.BROTLI_MAX_QUALITY },
	}).length;
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });

function gate(condition, message) {
	if (!condition) throw new Error(`semantic checksum failed: ${message}`);
}

function startServer(root) {
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? '/', 'http://bench.test');
		const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
		const file = path.resolve(root, relative || 'index.html');
		if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file)) {
			response.writeHead(404).end('Not found');
			return;
		}
		response.writeHead(200, {
			'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8',
		});
		response.end(fs.readFileSync(file));
	});
	return new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve(server));
	});
}

const results = [];
let failed;
let server;
let browser;
try {
	fs.rmSync(OUT_ROOT, { force: true, recursive: true });
	for (const target of TARGETS) {
		const outDir = path.join(OUT_ROOT, target.name);
		console.error(`Building ${target.name} (production, normalized minify)…`);
		await build({
			configFile: false,
			root: ROOT,
			logLevel: 'warn',
			plugins:
				target.plugins === 'octane'
					? [octane({ renderers: threeRenderers })]
					: target.plugins === 'react'
						? [react()]
						: [],
			define: { 'process.env.NODE_ENV': JSON.stringify('production') },
			build: {
				outDir,
				emptyOutDir: true,
				minify: 'esbuild',
				target: 'esnext',
				lib: {
					entry: path.join(ROOT, target.entry),
					formats: ['es'],
					fileName: () => 'bundle.js',
				},
				rollupOptions: { output: { codeSplitting: false } },
			},
		});
		const bundleFile = path.join(outDir, 'bundle.js');
		const bytes = fs.readFileSync(bundleFile);
		fs.writeFileSync(
			path.join(outDir, 'index.html'),
			'<canvas width="1" height="1"></canvas><script type="module" src="./bundle.js"></script>\n',
		);
		results.push({
			name: target.name,
			ops: {
				js_raw: stat(bytes.length),
				js_gzip: stat(gzipBytes(bytes)),
				js_brotli: stat(brotliBytes(bytes)),
			},
			meta: { file: 'bundle.js' },
		});
	}

	server = await startServer(OUT_ROOT);
	const address = server.address();
	if (address === null || typeof address === 'string') throw new Error('No benchmark server port.');
	browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	const page = await browser.newPage();
	for (const target of TARGETS) {
		const errors = [];
		const onConsole = (message) => {
			if (message.type() === 'error') errors.push(message.text());
		};
		const onPageError = (error) => errors.push(`pageerror: ${String(error)}`);
		page.on('console', onConsole);
		page.on('pageerror', onPageError);
		await page.goto(`http://127.0.0.1:${address.port}/${target.name}/index.html`, {
			waitUntil: 'load',
		});
		await page.waitForFunction(() => globalThis.__threeSizeChecksum !== undefined);
		const checksum = await page.evaluate(() => globalThis.__threeSizeChecksum);
		gate(checksum.childCount === 1, `${target.name} children=${checksum.childCount}`);
		gate(checksum.first === 'size-mesh', `${target.name} first=${checksum.first}`);
		gate(checksum.type === 'Mesh', `${target.name} type=${checksum.type}`);
		if (target.full) {
			gate(checksum.catalogueSize > 100, `${target.name} catalogue=${checksum.catalogueSize}`);
		} else {
			gate(checksum.catalogueSize === null, `${target.name} minimal catalogue marker`);
		}
		gate(errors.length === 0, `${target.name} browser errors: ${errors.join('; ')}`);
		results.find((result) => result.name === target.name).meta.semanticChecksum = checksum;
		page.off('console', onConsole);
		page.off('pageerror', onPageError);
	}
} catch (error) {
	failed = error instanceof Error ? error.message : String(error);
	console.error(error);
} finally {
	try {
		await browser?.close();
	} finally {
		try {
			await new Promise((resolve) => (server === undefined ? resolve() : server.close(resolve)));
		} finally {
			fs.rmSync(OUT_ROOT, { force: true, recursive: true });
		}
	}
}

const payload = { suite: 'three-bundle-size', iterations: 1, targets: results };
if (failed) payload.failed = failed;
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}

if (failed) {
	process.exitCode = 1;
} else {
	console.log('\ntarget              raw       gzip     brotli');
	for (const result of results) {
		console.log(
			`${result.name.padEnd(18)} ${String(result.ops.js_raw.score).padStart(9)} ${String(result.ops.js_gzip.score).padStart(9)} ${String(result.ops.js_brotli.score).padStart(9)}`,
		);
	}
}
