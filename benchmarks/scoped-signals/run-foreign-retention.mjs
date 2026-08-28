import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { inspectAsyncRetainers } from './inspect-async-retainers.mjs';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const options = new Map();
let fault = false;
for (const arg of process.argv.slice(2)) {
	if (arg === '--fault-leave-backlinks') {
		fault = true;
		continue;
	}
	const match = /^--(tooling-root|cycles|snapshots)=(.+)$/.exec(arg);
	assert.ok(match && !options.has(match[1]), 'Unknown retention option: ' + arg);
	options.set(match[1], match[2]);
}
const cycles = Number(options.get('cycles') ?? 1000);
assert.ok(Number.isSafeInteger(cycles) && cycles >= 100);
const directory = options.has('snapshots')
	? path.resolve(options.get('snapshots'))
	: fs.mkdtempSync(
			path.join(
				os.tmpdir(),
				fault ? 'octane-foreign-retention-fault-' : 'octane-foreign-retention-',
			),
		);
assert.ok(
	directory !== REPO && !directory.startsWith(REPO + path.sep),
	'Raw heaps must remain outside the repository',
);
if (options.has('snapshots')) fs.mkdirSync(directory);
const packageRoot = path.join(REPO, 'packages/octane');
const toolingRoot = fs.realpathSync(path.resolve(options.get('tooling-root') ?? packageRoot));
const requireTool = createRequire(path.join(toolingRoot, 'package.json'));
const { build, version: esbuildVersion } = requireTool('esbuild');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const inputs = new Map();
const read = (file) => {
	const real = fs.realpathSync(file);
	if (!inputs.has(real)) inputs.set(real, fs.readFileSync(real));
	return inputs.get(real);
};
function dependency(specifier, expectedName) {
	const entry = fs.realpathSync(requireTool.resolve(specifier));
	let root = path.dirname(entry);
	for (;;) {
		const file = path.join(root, 'package.json');
		if (fs.existsSync(file)) {
			const data = JSON.parse(read(file));
			if (data.name === expectedName)
				return {
					name: data.name,
					version: data.version,
					root,
					entry,
					manifestSha256: sha256(read(file)),
					entrySha256: sha256(read(entry)),
				};
		}
		const parent = path.dirname(root);
		assert.notEqual(root, parent);
		root = parent;
	}
}
const dependencies = {
	alien: dependency('alien-signals', 'alien-signals'),
	esbuild: dependency('esbuild', 'esbuild'),
};
assert.equal(dependencies.alien.version, '3.2.0');
assert.equal(dependencies.esbuild.version, esbuildVersion);
const payload = {
	suite: 'scoped-signals-retained-foreign-owners',
	mode: fault ? 'deliberate-backlink-retention-fault' : 'heap-diagnostics',
	startedAt: new Date().toISOString(),
	request: process.argv,
	cycles,
	method:
		'A single live foreign producer outlives consumer scopes whose derived value first succeeds, then switches to a failing branch and retains that success. Each consumer is disposed and dropped before post-GC snapshots. One retained live consumer is a positive control; later checkpoints retire it and then the producer.',
	inspection:
		'Offline reachability excludes raw weak edges and promotes V8 WeakMap ephemeron values only when both their key and table are reachable. Public prototype methods identify scope and signal instances; known fixture labels classify intentionally live scopes.',
	limits: [
		'No async attempts, historical frames, renderer, browser, or DevTools are created by this workload.',
		'Heap bytes are diagnostic; retained owner/node counts and strong retainer paths are the leak controls.',
		'Raw heaps stay in a separate local directory. Only known labels, metadata, hashes, and retainer paths are reported.',
		'The deliberate fault modifies only the in-memory graph source supplied to its isolated bundle; repository source is never changed.',
	],
	environment: {
		node: process.version,
		platform: process.platform,
		architecture: process.arch,
		cpu: os.cpus()[0]?.model,
		commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
		dirty:
			execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).trim() !== '',
		toolingRoot,
		dependencies,
		lockfileSha256: sha256(read(path.join(REPO, 'pnpm-lock.yaml'))),
		runnerSha256: sha256(read(import.meta.filename)),
		workerSha256: sha256(read(path.join(HERE, 'foreign-retention-worker.mjs'))),
		inspectorSha256: sha256(read(path.join(HERE, 'inspect-async-retainers.mjs'))),
		reachabilitySha256: sha256(read(path.join(HERE, 'heap-reachability.mjs'))),
	},
	checkpoints: [],
};
let failure;
try {
	const manifest = JSON.parse(read(path.join(packageRoot, 'package.json')));
	let altered;
	const result = await build({
		absWorkingDir: REPO,
		stdin: {
			contents: 'export * from "octane/signals";',
			sourcefile: 'foreign-retention-entry.mjs',
			resolveDir: packageRoot,
		},
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		treeShaking: true,
		platform: 'node',
		format: 'esm',
		target: 'node22',
		define: { 'process.env.NODE_ENV': '"production"' },
		logLevel: 'silent',
		plugins: [
			{
				name: 'foreign-retention-public-engine',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane\/signals$/ }, () => ({
						path: path.resolve(packageRoot, manifest.exports['./signals']),
					}));
					plugin.onResolve({ filter: /^alien-signals(?:\/|$)/ }, (request) => {
						if (request.pluginData?.foreignRetentionDependency) return null;
						return plugin.resolve(request.path, {
							kind: request.kind,
							resolveDir: toolingRoot,
							pluginData: { foreignRetentionDependency: true },
						});
					});
					plugin.onLoad({ filter: /\.(?:[cm]?[jt]s|json)$/ }, ({ path: file }) => {
						const source = read(file);
						let contents = source;
						if (fault && file === path.join(packageRoot, 'src/signals/graph.ts')) {
							const text = source.toString();
							assert.equal(
								text.split('nodes?.delete(node);').length,
								2,
								'Fault requires exactly one backlink removal',
							);
							contents = text.replace('nodes?.delete(node);', 'void node;');
							altered = {
								file,
								originalSha256: sha256(source),
								transformedSha256: sha256(contents),
								edit: 'Replace the unique nodes?.delete(node) removal with void node, leaving owner tracking, payload erasure, and graph unlinking intact.',
							};
						}
						return {
							contents,
							loader: file.endsWith('.ts') ? 'ts' : file.endsWith('.json') ? 'json' : 'js',
							resolveDir: path.dirname(file),
						};
					});
				},
			},
		],
	});
	assert.equal(Boolean(altered), fault);
	const sourceInputs = Object.keys(result.metafile.inputs)
		.filter((file) => !file.endsWith('foreign-retention-entry.mjs'))
		.map((file) => {
			const absolute = fs.realpathSync(path.resolve(REPO, file));
			assert.ok(
				!/\/src\/(?:runtime|compiler|server\/)|\/node_modules\/(?:react|react-dom)\//.test(
					absolute,
				),
				'Retention bundle must not include a renderer/compiler',
			);
			if (absolute.includes('/node_modules/alien-signals/'))
				assert.ok(absolute.startsWith(dependencies.alien.root + path.sep));
			return {
				path: file,
				absolutePath: absolute,
				sha256: sha256(read(absolute)),
				...(altered?.file === absolute ? { transformedSha256: altered.transformedSha256 } : {}),
			};
		});
	const engineFile = path.join(directory, 'engine.mjs');
	const code = result.outputFiles[0].text;
	fs.writeFileSync(engineFile, code);
	payload.bundle = { bytes: Buffer.byteLength(code), sha256: sha256(code), inputs: sourceInputs };
	if (altered) payload.fault = altered;
	const workerArgs = [
		'--expose-gc',
		path.join(HERE, 'foreign-retention-worker.mjs'),
		engineFile,
		directory,
		String(cycles),
	];
	payload.workerCommand = [process.execPath, ...workerArgs];
	const output = execFileSync(process.execPath, workerArgs, {
		encoding: 'utf8',
		maxBuffer: 8 * 1024 * 1024,
	});
	fs.writeFileSync(path.join(directory, 'worker.log'), output);
	process.stdout.write(output);
	const checkpoints = JSON.parse(fs.readFileSync(path.join(directory, 'checkpoints.json'), 'utf8'));
	for (const checkpoint of checkpoints) {
		const inspection = inspectAsyncRetainers(checkpoint.snapshot, {
			liveScopeKeys: checkpoint.liveScopeKeys,
		});
		payload.checkpoints.push({ ...checkpoint, inspection });
		const retired =
			fault && checkpoint.phase !== 'all-retired'
				? checkpoint.cycle + (checkpoint.phase === 'control-retired' ? 1 : 0)
				: 0;
		assert.equal(
			inspection.retiredCycleScopeCount,
			retired,
			'Unexpected retained consumer owners at ' + checkpoint.phase,
		);
		assert.equal(inspection.strongScopeCount, checkpoint.liveScopeKeys.length + retired);
		assert.equal(inspection.strongSignalCount, checkpoint.expectedLiveSignals + retired);
		assert.equal(inspection.strongRequestCount, 0);
		assert.equal(inspection.retainedAttemptRecords, 0);
	}
	for (const [file, source] of inputs)
		assert.equal(
			sha256(fs.readFileSync(file)),
			sha256(source),
			'Source changed during retention run: ' + file,
		);
	payload.sourceUnchanged = true;
	payload.status = fault ? 'expected-fault-detected' : 'passed';
} catch (error) {
	failure = error instanceof Error ? error.stack : String(error);
	payload.failed = failure;
	console.error(failure);
} finally {
	payload.finishedAt = new Date().toISOString();
	payload.snapshotDirectory = directory;
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
}
if (failure) process.exitCode = 1;
