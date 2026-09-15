// Build the actual ordinary-client fixtures and run their existing work gates.
// Keep the canonical target names: run.mjs uses them to enable those gates.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
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
	writePayload,
} from '../activity/harness.mjs';

const repo = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const args = process.argv.slice(2);
assert.ok(
	args.every((arg) => !arg.startsWith('--') || arg.startsWith('--octane-revision=')),
	'Usage: node benchmarks/view-transitions/js-framework.mjs [iterations] [--octane-revision=SHA]',
);
const options = parseOptions(args, { iterations: true });
const source = octanePackageAt(options.revision);
const require = createRequire(path.join(repo, 'package.json'));
const selected = createRequire(path.join(source.packageRoot, 'package.json'));
assert.equal(selected.resolve('octane'), path.join(source.packageRoot, 'src/index.ts'));
const { build, preview } = await import(pathToFileURL(require.resolve('vite')));
const { octane } = await import(pathToFileURL(selected.resolve('octane/compiler/vite')));
const { chromium } = require('playwright');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function hashFiles(root, files) {
	const digest = createHash('sha256');
	function visit(relative) {
		const file = path.join(root, relative);
		if (fs.statSync(file).isDirectory()) {
			for (const entry of fs.readdirSync(file).sort()) visit(path.join(relative, entry));
		} else digest.update(relative).update('\0').update(fs.readFileSync(file)).update('\0');
	}
	for (const file of files) visit(file);
	return digest.digest('hex');
}
const fixtureHash = (root) =>
	hashFiles(root, ['index.html', 'package.json', 'src', 'vite.config.js']);
const harnessFiles = [
	'benchmarks/js-framework/run.mjs',
	'benchmarks/lib/dom-nodes.mjs',
	'benchmarks/lib/stats.mjs',
	'benchmarks/view-transitions/js-framework.mjs',
	'benchmarks/activity/harness.mjs',
	'benchmarks/activity/contract.mjs',
];
const metadata = {
	revision: source.revision,
	workingTree: !options.revision,
	sourceSha256: hashOctaneSources(source.packageRoot),
	compilerSourceSha256: hashFiles(source.packageRoot, ['src/compiler']),
	lockfileSha256: hash(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
	harnessSha256: hashFiles(repo, harnessFiles),
	node: process.version,
	platform: process.platform,
	arch: process.arch,
	osRelease: os.release(),
	cpu: os.cpus()[0]?.model,
	toolchain: {
		vite: packageVersion(require, 'vite'),
		esbuild: packageVersion(createRequire(require.resolve('vite')), 'esbuild'),
		tsrxCore: packageVersion(selected, '@tsrx/core'),
		tsrxOxc: packageVersion(selected, '@tsrx/oxc'),
		playwright: packageVersion(require, 'playwright'),
	},
	build: { target: 'esnext', minify: 'esbuild', hmr: false, profile: false },
	cpuThrottle: Number(process.env.CPU_THROTTLE || 1),
};
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-vt-js-framework-'));
const servers = [];
const targets = [];
const failures = [];
process.env.NODE_ENV = 'production';
try {
	const browser = await chromium.launch({ headless: true });
	try {
		metadata.chromium = browser.version();
	} finally {
		await browser.close();
	}
	for (const name of ['octane-tsrx', 'octane-jsx']) {
		const fixture = path.join(repo, 'benchmarks/js-framework', name);
		const outDir = path.join(temporary, name);
		const fixtureSourceSha256 = fixtureHash(fixture);
		const compiledInputs = {};
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
				{
					name: 'record-compiled-inputs',
					enforce: 'post',
					transform(code, id) {
						if (id.startsWith(path.join(fixture, 'src') + path.sep)) {
							compiledInputs[path.relative(fixture, id)] = hash(code);
						}
					},
				},
			],
			define: {
				__OCTANE_PROFILE_ENABLED__: 'false',
				'process.env.NODE_ENV': JSON.stringify('production'),
			},
			build: { target: 'esnext', minify: 'esbuild', outDir, emptyOutDir: true },
		});
		const output = (Array.isArray(result) ? result : [result])
			.flatMap((item) => item.output)
			.sort((a, b) => a.fileName.localeCompare(b.fileName));
		const assets = output.map((asset) => {
			const bytes = asset.type === 'chunk' ? asset.code : asset.source;
			return {
				file: asset.fileName,
				sha256: hash(bytes),
				rawBytes: Buffer.byteLength(bytes),
				gzipBytes: gzipSync(bytes, { level: 9 }).length,
			};
		});
		const javascript = assets.filter((asset) => asset.file.endsWith('.js'));
		const target = {
			name,
			meta: {
				fixtureSourceSha256,
				compiledInputSha256: Object.fromEntries(Object.entries(compiledInputs).sort()),
				assets,
				javascriptBytes: javascript.reduce((sum, asset) => sum + asset.rawBytes, 0),
				javascriptGzipBytes: javascript.reduce((sum, asset) => sum + asset.gzipBytes, 0),
			},
		};
		targets.push(target);
		const server = await preview({
			configFile: false,
			root: fixture,
			logLevel: 'error',
			build: { outDir },
			preview: { host: '127.0.0.1', port: 0, strictPort: true },
		});
		servers.push(server);
		const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
		const resultFile = path.join(temporary, `${name}.json`);
		const harness = { stdout: '', stderr: '', exitCode: null, signal: null };
		target.harness = harness;
		await new Promise((resolve, reject) => {
			const child = spawn(
				process.execPath,
				[path.join(repo, 'benchmarks/js-framework/run.mjs'), String(options.iterations)],
				{
					cwd: repo,
					stdio: ['ignore', 'pipe', 'pipe'],
					env: {
						...process.env,
						CLEAR_1K: '0',
						TARGETS: JSON.stringify([{ name, url, ready: '#run' }]),
						BENCH_JSON: resultFile,
					},
				},
			);
			for (const stream of ['stdout', 'stderr']) {
				child[stream].setEncoding('utf8');
				child[stream].on('data', (chunk) => {
					harness[stream] += chunk;
					process[stream].write(chunk);
				});
			}
			child.once('error', reject);
			child.once('close', (code, signal) => {
				harness.exitCode = code;
				harness.signal = signal;
				resolve();
			});
		});
		if (fs.existsSync(resultFile)) {
			harness.result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
			assert.equal(harness.result.targets[0]?.name, name);
			target.ops = harness.result.targets[0].ops;
		}
		if (harness.exitCode !== 0 || harness.result?.failed) {
			target.failed = `${name}: original run.mjs exited ${harness.exitCode}${harness.signal ? ` (${harness.signal})` : ''}`;
			failures.push(target.failed);
		} else assert.ok(harness.result, 'A successful canonical run must write its result');
		assert.equal(fixtureHash(fixture), fixtureSourceSha256, 'Fixture changed during measurements');
	}
} catch (error) {
	failures.push(error.stack ?? String(error));
} finally {
	for (const result of await Promise.allSettled(servers.map((server) => server.close()))) {
		if (result.status === 'rejected') failures.push(String(result.reason));
	}
	try {
		fs.rmSync(temporary, { recursive: true, force: true });
	} catch (error) {
		failures.push(error.stack ?? String(error));
	}
}
try {
	for (const target of targets) {
		assert.equal(
			fixtureHash(path.join(repo, 'benchmarks/js-framework', target.name)),
			target.meta.fixtureSourceSha256,
			'Fixture changed during measurements',
		);
	}
	assert.equal(
		hashOctaneSources(source.packageRoot),
		metadata.sourceSha256,
		'Source changed during measurements',
	);
	assert.equal(
		hashFiles(repo, harnessFiles),
		metadata.harnessSha256,
		'Harness changed during measurements',
	);
	assert.equal(
		hash(fs.readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
		metadata.lockfileSha256,
		'Lockfile changed during measurements',
	);
} catch (error) {
	failures.push(error.stack ?? String(error));
}
writePayload({
	suite: 'view-transitions-js-framework',
	iterations: options.iterations,
	metadata,
	targets,
	...(failures.length ? { failed: failures } : {}),
});
if (failures.length) {
	console.error(failures.join('\n'));
	process.exitCode = 1;
}
