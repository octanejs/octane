// Reuse the existing style work gate with one frozen Octane package/compiler.
// No benchmark fixture or framework module is copied into this directory.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
	hashOctaneSources,
	octanePackageAt,
	packageVersion,
	parseOptions,
} from '../activity/harness.mjs';

const repo = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const source = octanePackageAt(parseOptions(process.argv.slice(2)).revision);
const sourceHash = hashOctaneSources(source.packageRoot);
const require = createRequire(path.join(repo, 'package.json'));
const selected = createRequire(path.join(source.packageRoot, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')));
const { octane } = await import(pathToFileURL(selected.resolve('octane/compiler/vite')));
const fixture = path.join(repo, 'benchmarks/js-framework/octane-tsrx-naive');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-vt-style-'));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const fixtureFiles = [
	'style-literals.html',
	'src/StyleLiteralWork.tsrx',
	'src/style-literal-values.js',
	'src/style-literals-main.js',
];
const fixtureHash = () =>
	hash(
		fixtureFiles
			.map((file) => file + '\0' + fs.readFileSync(path.join(fixture, file), 'utf8'))
			.join('\0'),
	);
const fixtureSourceHash = fixtureHash();
const servers = [];
const metadata = {
	revision: source.revision,
	sourceSha256: sourceHash,
	fixtureSha256: fixtureSourceHash,
	lockfileSha256: hash(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
	node: process.version,
	platform: process.platform,
	arch: process.arch,
	toolchain: {
		vite: packageVersion(require, 'vite'),
		esbuild: packageVersion(selected, 'esbuild'),
		tsrxCore: packageVersion(selected, '@tsrx/core'),
		playwright: packageVersion(require, 'playwright'),
	},
	artifacts: {},
};
process.env.NODE_ENV = 'production';
try {
	const urls = {};
	for (const mode of ['readable', 'minified']) {
		const outDir = path.join(temporary, mode);
		const result = await build({
			configFile: false,
			root: fixture,
			mode: 'production',
			logLevel: 'error',
			plugins: [
				{
					name: 'selected-octane',
					enforce: 'pre',
					resolveId(id) {
						if (id === 'octane' || id.startsWith('octane/')) return selected.resolve(id);
					},
				},
				octane({ hmr: false, profile: false }),
			],
			define: { __OCTANE_PROFILE_ENABLED__: 'false', 'process.env.NODE_ENV': '"production"' },
			build: {
				target: 'esnext',
				minify: mode === 'minified' ? 'esbuild' : false,
				outDir,
				emptyOutDir: true,
				rollupOptions: { input: path.join(fixture, 'style-literals.html') },
			},
		});
		const assets = (Array.isArray(result) ? result : [result])
			.flatMap((r) => r.output)
			.filter((asset) => asset.type === 'chunk');
		const code = assets.map((asset) => asset.code).join('\n');
		const driverReachable = Number(/\bfunction vtFlush\s*\(/.test(code));
		const stagingReachable = Number(/\bDOMStage\b/.test(code));
		assert.equal(driverReachable, 0, 'Ordinary styles must exclude the optional transition driver');
		assert.equal(stagingReachable, 0, 'Ordinary styles must exclude DOM staging');
		metadata.artifacts[mode] = {
			rawBytes: assets.reduce((sum, asset) => sum + Buffer.byteLength(asset.code), 0),
			gzipBytes: assets.reduce((sum, asset) => sum + gzipSync(asset.code, { level: 9 }).length, 0),
			driverReachable,
			stagingReachable,
			assetsSha256: hash(assets.map((asset) => asset.fileName + '\0' + asset.code).join('\0')),
		};
		const server = createServer((request, response) => {
			const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
			const file = path.join(outDir, pathname);
			if (!file.startsWith(outDir + path.sep)) {
				response.writeHead(403).end();
				return;
			}
			try {
				const bytes = fs.readFileSync(file);
				response.writeHead(200, {
					'content-type': file.endsWith('.js')
						? 'text/javascript'
						: file.endsWith('.css')
							? 'text/css'
							: 'text/html',
				});
				response.end(bytes);
			} catch {
				response.writeHead(404).end();
			}
		});
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		servers.push(server);
		urls[mode] = `http://127.0.0.1:${server.address().port}/style-literals.html`;
	}
	const resultFile = path.join(temporary, 'work.json');
	await new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[path.join(repo, 'benchmarks/js-framework/style-literals-work.mjs')],
			{
				cwd: repo,
				stdio: 'inherit',
				env: {
					...process.env,
					TARGET_URL: urls.readable,
					WORK_TIMING_URL: urls.minified,
					WORK_JSON: resultFile,
				},
			},
		);
		child.once('error', reject);
		child.once('exit', (code) =>
			code === 0 ? resolve() : reject(new Error('Style work gate exited ' + code)),
		);
	});
	assert.equal(
		hashOctaneSources(source.packageRoot),
		sourceHash,
		'Source changed during measurements',
	);
	assert.equal(fixtureHash(), fixtureSourceHash, 'Fixture changed during measurements');
	const result = { ...JSON.parse(fs.readFileSync(resultFile, 'utf8')), metadata };
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify(metadata, null, 2));
} finally {
	await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
	fs.rmSync(temporary, { recursive: true, force: true });
}
