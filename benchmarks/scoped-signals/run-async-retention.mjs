import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BUNDLE_CASES, sha256, verifyBundleInputs } from './bundle-boundaries.mjs';
import { inspectAsyncRetainers } from './inspect-async-retainers.mjs';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const knownOptions = new Set(['tooling-root', 'cycles', 'snapshots']);
const options = new Map();
for (const argument of process.argv.slice(2)) {
	const match = /^--([^=]+)=(.+)$/.exec(argument);
	if (!match || !knownOptions.has(match[1]) || options.has(match[1]))
		throw new Error(`Unknown or repeated retention option: ${argument}`);
	options.set(match[1], match[2]);
}
const cycles = Number(options.get('cycles') ?? '1000');
assert.ok(Number.isSafeInteger(cycles) && cycles >= 100, '--cycles must be an integer >= 100');
const payload = {
	suite: 'scoped-signals-async-retention',
	mode: 'heap-diagnostics',
	request: process.argv,
	startedAt: new Date().toISOString(),
	cycles,
	method:
		'One Node worker keeps unresolved producer promises externally reachable while disposing a promise owner and stream owner per cycle. Three explicit collections after event-loop turns precede each snapshot. A live scope remains as a positive control, then is retired and dropped before external promises are released.',
	inspectionMethod:
		'Offline V8 strong-edge traversal excludes weak edges. Scope/signal instances use public prototype methods; request and attempt records use the fields of the hashed source revision. Known workload labels distinguish owners. The private fields are diagnostic evidence, not public behavior assertions.',
	limitations: [
		'Pending producer promises and revoked attempt shells are intentionally retained until the external producer array is cleared; total heap growth alone is not an owner leak.',
		'This tests unresolved promises, pending stream next/return, and data-owner disposal. It does not establish DOM, browser, DevTools, or historical-frame retention.',
		'No historical frames are created, so deliberately retained frame handles cannot confound the async retirement result.',
		'Raw heaps stay local; the report includes only counts, known fixture labels, hashes, and strong retainer paths.',
	],
	targets: [],
};
const files = new Map();
const read = (filename) => {
	filename = fs.realpathSync(filename);
	if (!files.has(filename)) files.set(filename, fs.readFileSync(filename));
	return files.get(filename);
};
function findPackage(filename) {
	let directory = path.dirname(fs.realpathSync(filename));
	while (true) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest))
			return { ...JSON.parse(read(manifest)), manifest, manifestSha256: sha256(read(manifest)) };
		const parent = path.dirname(directory);
		if (directory === parent) throw new Error(`Package manifest not found for ${filename}`);
		directory = parent;
	}
}
function packageEvidence(entry, name) {
	const data = findPackage(entry);
	assert.equal(data.name, name);
	return {
		name,
		version: data.version,
		manifest: data.manifest,
		manifestSha256: data.manifestSha256,
		entry: fs.realpathSync(entry),
		entrySha256: sha256(read(entry)),
	};
}

try {
	const packageRoot = path.join(REPO, 'packages/octane');
	const toolingRoot = options.has('tooling-root')
		? fs.realpathSync(path.resolve(options.get('tooling-root')))
		: null;
	const requirePackage = createRequire(path.join(toolingRoot ?? packageRoot, 'package.json'));
	const buildEntry = (toolingRoot ? requirePackage : createRequire(import.meta.url)).resolve(
		'esbuild',
	);
	const esbuild = await import(pathToFileURL(buildEntry).href);
	const dependencies = {
		esbuild: packageEvidence(buildEntry, 'esbuild'),
		alien: packageEvidence(requirePackage.resolve('alien-signals'), 'alien-signals'),
	};
	assert.equal(dependencies.esbuild.version, esbuild.version);
	assert.equal(
		dependencies.alien.version,
		'3.2.0',
		'Retention must use the pinned Alien Signals 3.2.0',
	);
	const entrySource = 'export * from "octane/signals";\n';
	const entryName = 'async-retention-public-entry.mjs';
	const buildOptions = {
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		treeShaking: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		tsconfigRaw: { compilerOptions: {} },
		define: { __OCTANE_PROFILE_ENABLED__: 'false', 'process.env.NODE_ENV': '"production"' },
	};
	const result = await esbuild.build({
		...buildOptions,
		absWorkingDir: REPO,
		stdin: { contents: entrySource, sourcefile: entryName, resolveDir: packageRoot },
		logLevel: 'silent',
		plugins: [
			{
				name: 'scoped-signals-retention-inputs',
				setup(builder) {
					if (toolingRoot)
						builder.onResolve({ filter: /^alien-signals(?:\/|$)/ }, (resolution) => {
							if (resolution.pluginData?.retentionTooling) return undefined;
							return builder.resolve(resolution.path, {
								kind: resolution.kind,
								resolveDir: toolingRoot,
								pluginData: { retentionTooling: true },
							});
						});
					builder.onLoad({ filter: /\.(?:[cm]?[jt]s|json)$/ }, ({ path: filename }) => ({
						contents: read(filename),
						loader: filename.endsWith('.json') ? 'json' : /\.[cm]?ts$/.test(filename) ? 'ts' : 'js',
						resolveDir: path.dirname(filename),
					}));
				},
			},
		],
	});
	assert.equal(result.outputFiles.length, 1);
	const inputs = Object.keys(result.metafile.inputs).map((input) => {
		if (path.basename(input) === entryName)
			return { path: entryName, sha256: sha256(entrySource), source: entrySource };
		const filename = fs.realpathSync(path.resolve(REPO, input));
		assert.ok(files.has(filename), `Unhashed engine input: ${filename}`);
		const data = findPackage(filename);
		if (data.name === 'alien-signals') assert.equal(data.manifest, dependencies.alien.manifest);
		return {
			path: input,
			physicalPath: filename,
			sha256: sha256(files.get(filename)),
			package: {
				name: data.name,
				version: data.version,
				manifest: data.manifest,
				manifestSha256: data.manifestSha256,
			},
		};
	});
	verifyBundleInputs(
		BUNDLE_CASES.find((entry) => entry.id === 'engine'),
		inputs,
	);
	const changed = [...files]
		.filter(([filename, contents]) => !fs.readFileSync(filename).equals(contents))
		.map(([filename]) => filename);
	assert.deepEqual(
		changed,
		[],
		'Engine source changed during bundling; rerun with a stable source set',
	);
	let snapshots;
	if (options.has('snapshots')) {
		snapshots = path.resolve(options.get('snapshots'));
		assert.ok(
			!snapshots.startsWith(REPO + path.sep),
			'Raw heap snapshots must remain outside the repository',
		);
		fs.mkdirSync(snapshots, { recursive: false });
	} else snapshots = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-scoped-async-retainers-'));
	const bundle = result.outputFiles[0].contents;
	const engineFile = path.join(snapshots, 'engine.mjs');
	fs.writeFileSync(engineFile, bundle, { flag: 'wx' });
	const workerFile = path.join(HERE, 'async-retention-worker.mjs');
	const workerCommand = [
		process.execPath,
		'--expose-gc',
		workerFile,
		engineFile,
		snapshots,
		String(cycles),
	];
	const git = (...args) =>
		execFileSync('git', args, { cwd: REPO, maxBuffer: 32 * 1024 * 1024 })
			.toString()
			.trim();
	payload.environment = {
		commit: git('rev-parse', 'HEAD'),
		dirty: git('status', '--porcelain') !== '',
		node: process.version,
		platform: process.platform,
		architecture: process.arch,
		cpu: os.cpus()[0]?.model,
		lockfileSha256: sha256(fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml'))),
		packageManifestSha256: sha256(fs.readFileSync(path.join(packageRoot, 'package.json'))),
		toolingRoot,
		dependencyMode: toolingRoot ? 'explicit-tooling-root' : 'workspace-installation',
		dependencies,
		build: { options: buildOptions, bytes: bundle.length, sha256: sha256(bundle), inputs },
		snapshotDirectory: snapshots,
		workerCommand,
		runnerSha256: sha256(fs.readFileSync(import.meta.filename)),
		workerSha256: sha256(fs.readFileSync(workerFile)),
		inspectorSha256: sha256(fs.readFileSync(path.join(HERE, 'inspect-async-retainers.mjs'))),
		boundaryHelperSha256: sha256(fs.readFileSync(path.join(HERE, 'bundle-boundaries.mjs'))),
	};
	execFileSync(workerCommand[0], workerCommand.slice(1), {
		cwd: REPO,
		stdio: 'inherit',
		timeout: 60000,
	});
	const checkpoints = JSON.parse(fs.readFileSync(path.join(snapshots, 'checkpoints.json')));
	for (const checkpoint of checkpoints) {
		const inspection = inspectAsyncRetainers(checkpoint.snapshot);
		payload.targets.push({
			name: `${checkpoint.phase}/${checkpoint.cycle}`,
			meta: checkpoint,
			inspection,
		});
		console.log(
			`${checkpoint.phase}/${checkpoint.cycle}: ${inspection.strongScopeCount} strong scopes, ${inspection.retiredCycleScopeCount} retired cycle scopes, ${inspection.revokedAttemptRecords} revoked attempt records`,
		);
	}
	const initial = payload.targets[0];
	assert.equal(initial.meta.cycle, 0);
	assert.equal(
		initial.inspection.strongScopeCount,
		1,
		'Live positive-control scope was not detected',
	);
	assert.equal(initial.inspection.scopeSamples[0].scopeKey, 'async-retention/control-live');
	assert.equal(
		initial.inspection.strongSignalCount,
		4,
		'Live positive-control signal nodes were not detected',
	);
	assert.equal(
		initial.inspection.strongRequestCount,
		2,
		'Live positive-control requests were not detected',
	);
	assert.equal(
		initial.inspection.activeAttemptRecords,
		2,
		'Live positive-control attempts were not detected',
	);
	payload.positiveControl = 'passed';
	const findings = [];
	for (const row of payload.targets) {
		const { inspection, meta } = row;
		const expectedActive = meta.phase === 'active-control';
		const producers = Object.values(inspection.externalProducerCounts).reduce(
			(total, count) => total + count,
			0,
		);
		assert.equal(
			producers,
			meta.externallyRetainedProducers,
			`${row.name}: external promise control was not detected`,
		);
		if (
			inspection.strongScopeCount !== meta.expectedLiveScopes ||
			inspection.retiredCycleScopeCount !== 0
		)
			findings.push(`${row.name}: unexpected strongly retained data owner`);
		if (
			inspection.strongSignalCount !== (expectedActive ? 4 : 0) ||
			inspection.retiredCycleSignalCount !== 0
		)
			findings.push(`${row.name}: unexpected strongly retained signal node`);
		if (
			inspection.strongRequestCount !== (expectedActive ? 2 : 0) ||
			inspection.retiredCycleRequestCount !== 0
		)
			findings.push(`${row.name}: unexpected strongly retained request entry`);
		if (inspection.activeAttemptRecords !== (expectedActive ? 2 : 0))
			findings.push(`${row.name}: unexpected active attempt records`);
		if (
			inspection.revokedAttemptsWithObjectEntry ||
			inspection.revokedAttemptsWithController ||
			inspection.revokedAttemptsWithIterator
		)
			findings.push(`${row.name}: revoked attempt retains an entry, controller, or iterator`);
		if (inspection.strongStreamIteratorCount !== (expectedActive ? 1 : 0))
			findings.push(`${row.name}: unexpected retained stream iterator`);
	}
	payload.findings = findings;
	if (findings.length) throw new Error(findings.join('\n'));
	assert.equal(
		payload.targets.at(-1).inspection.retainedAttemptRecords,
		0,
		'Attempt shells survived release of external producers',
	);
	payload.result =
		'No retired workload scope, signal node, request entry, or stream iterator remained strongly reachable in these snapshots. Revoked attempt shells remained only while their external pending producer promises were intentionally retained.';
} catch (error) {
	payload.failed = error.stack ?? String(error);
	process.exitCode = 1;
	console.error(payload.failed);
}
payload.finishedAt = new Date().toISOString();
if (process.env.BENCH_JSON) {
	fs.mkdirSync(path.dirname(path.resolve(process.env.BENCH_JSON)), { recursive: true });
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
}
