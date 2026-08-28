import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zlib, gzipSync } from 'node:zlib';
import {
	BUNDLE_CASES,
	entrySource,
	gitBlobHash,
	sha256,
	verifyBundleInputs,
} from './bundle-boundaries.mjs';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const knownOptions = new Set(['baseline-ref', 'baseline-package', 'tooling-root']);
const options = new Map();
for (const argument of process.argv.slice(2)) {
	const match = /^--([^=]+)=(.+)$/.exec(argument);
	if (!match || !knownOptions.has(match[1]) || options.has(match[1])) {
		throw new Error(`Unknown or repeated bundle option: ${argument}`);
	}
	options.set(match[1], match[2]);
}
assert.ok(options.has('baseline-ref'), 'Pass --baseline-ref=<immutable git revision>');
assert.ok(
	options.has('baseline-package'),
	'Pass --baseline-package=<archived packages/octane directory>',
);

const git = (...args) => execFileSync('git', args, { cwd: REPO, maxBuffer: 32 * 1024 * 1024 });
const stat = (value) => ({ median: value, min: value, samples: 1 });
const sourceCache = new Map();
const manifestCache = new Map();
const failures = [];
const payload = {
	suite: 'scoped-signals-bundles',
	status: 'preliminary',
	iterations: 1,
	request: process.argv,
	startedAt: new Date().toISOString(),
	limitations: [
		'Public source-entry export costs, not compiled .tsrx or application bundles.',
		'Native client/server hook entries are measured independently; their sizes are not incremental application costs.',
		'Export loading and a small engine smoke test do not establish DOM, hydration, or async behavior.',
		'Preliminary while integration source is changing; rerun after the final source freeze.',
	],
	buildOptions: {
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		treeShaking: true,
		format: 'esm',
		target: 'esnext',
		// Prevent the archived baseline and live checkout from inheriting
		// different ambient tsconfig files outside their measured sources.
		tsconfigRaw: { compilerOptions: {} },
		legalComments: 'none',
		define: { __OCTANE_PROFILE_ENABLED__: 'false', 'process.env.NODE_ENV': '"production"' },
	},
	compression: { gzipLevel: zlib.Z_BEST_COMPRESSION, brotliQuality: zlib.BROTLI_MAX_QUALITY },
	targets: [],
	comparisons: [],
};

function cachedSource(filename) {
	const resolved = fs.realpathSync(filename);
	if (!sourceCache.has(resolved)) sourceCache.set(resolved, fs.readFileSync(resolved));
	return sourceCache.get(resolved);
}

function findPackage(filename) {
	let directory = path.dirname(fs.realpathSync(filename));
	while (true) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			if (!manifestCache.has(manifest)) {
				const contents = cachedSource(manifest);
				manifestCache.set(manifest, {
					...JSON.parse(contents),
					manifest,
					manifestSha256: sha256(contents),
				});
			}
			return manifestCache.get(manifest);
		}
		const parent = path.dirname(directory);
		if (parent === directory) return null;
		directory = parent;
	}
}

function packageEvidence(entry, expectedName) {
	const manifest = findPackage(entry);
	assert.equal(manifest?.name, expectedName, `Unexpected package for ${entry}`);
	return {
		name: manifest.name,
		version: manifest.version,
		manifest: manifest.manifest,
		manifestSha256: manifest.manifestSha256,
		entry: fs.realpathSync(entry),
		entrySha256: sha256(cachedSource(entry)),
	};
}

try {
	const baselineRef = git('rev-parse', '--verify', `${options.get('baseline-ref')}^{commit}`)
		.toString()
		.trim();
	const baselineRoot = fs.realpathSync(path.resolve(options.get('baseline-package')));
	const candidateRoot = fs.realpathSync(path.join(REPO, 'packages/octane'));
	assert.notEqual(
		baselineRoot,
		candidateRoot,
		'Baseline must be an independent archived source directory',
	);
	const roots = { baseline: baselineRoot, candidate: candidateRoot };
	const objectFormat = git('rev-parse', '--show-object-format').toString().trim();
	const baselineBlobs = new Map(
		git('ls-tree', '-r', '-z', '--full-tree', baselineRef, 'packages/octane')
			.toString()
			.split('\0')
			.filter(Boolean)
			.map((line) => {
				const match = /^\d+ blob ([a-f\d]+)\t(.+)$/.exec(line);
				assert.ok(match, `Unexpected baseline Git tree entry: ${line}`);
				return [match[2], match[1]];
			}),
	);
	function verifyBaseline(filename, contents) {
		const logical = `packages/octane/${path.relative(baselineRoot, filename).replaceAll('\\', '/')}`;
		const expected = baselineBlobs.get(logical);
		assert.ok(expected, `Baseline source does not exist at ${baselineRef}: ${logical}`);
		assert.equal(
			gitBlobHash(contents, objectFormat),
			expected,
			`Archived baseline differs from Git: ${logical}`,
		);
		return expected;
	}
	const manifests = Object.fromEntries(
		Object.entries(roots).map(([label, root]) => {
			const manifest = path.join(root, 'package.json');
			const contents = cachedSource(manifest);
			const data = JSON.parse(contents);
			assert.equal(data.name, 'octane', `${label}: package self-reference must resolve octane`);
			return [
				label,
				{
					root,
					manifest,
					sha256: sha256(contents),
					gitBlob: label === 'baseline' ? verifyBaseline(manifest, contents) : undefined,
					exports: data.exports,
				},
			];
		}),
	);
	const toolingRoot = options.has('tooling-root')
		? fs.realpathSync(path.resolve(options.get('tooling-root')))
		: null;
	const requireDependency = createRequire(path.join(toolingRoot ?? candidateRoot, 'package.json'));
	const requireBuild = toolingRoot ? requireDependency : createRequire(import.meta.url);
	const buildEntry = requireBuild.resolve('esbuild');
	const esbuild = await import(pathToFileURL(buildEntry).href);
	const dependencies = {
		esbuild: packageEvidence(buildEntry, 'esbuild'),
		alien: packageEvidence(requireDependency.resolve('alien-signals'), 'alien-signals'),
		devalue: packageEvidence(requireDependency.resolve('devalue'), 'devalue'),
	};
	assert.equal(esbuild.version, dependencies.esbuild.version, 'esbuild module/manifest mismatch');
	assert.equal(
		dependencies.alien.version,
		'3.2.0',
		'Optional engine must resolve Alien Signals 3.2.0',
	);
	const archive = path.resolve(baselineRoot, '../..', 'source.tar');
	payload.environment = {
		baselineRef,
		candidateRef: git('rev-parse', 'HEAD').toString().trim(),
		candidateDirty: git('status', '--porcelain').toString().trim() !== '',
		baselineArchive: fs.existsSync(archive)
			? { path: archive, sha256: sha256(fs.readFileSync(archive)) }
			: null,
		baselineLockfileSha256: sha256(git('show', `${baselineRef}:pnpm-lock.yaml`)),
		candidateLockfileSha256: sha256(fs.readFileSync(path.join(REPO, 'pnpm-lock.yaml'))),
		packageManifests: manifests,
		node: process.version,
		platform: process.platform,
		architecture: process.arch,
		cpu: os.cpus()[0]?.model,
		dependencyMode: toolingRoot ? 'explicit-tooling-root' : 'workspace-installation',
		toolingRoot,
		dependencies,
		runnerSha256: sha256(fs.readFileSync(import.meta.filename)),
		fixtureSha256: sha256(fs.readFileSync(path.join(HERE, 'bundle-boundaries.mjs'))),
	};
	const sourcePlugin = {
		name: 'scoped-signals-hashed-source-inputs',
		setup(builder) {
			if (toolingRoot) {
				builder.onResolve({ filter: /^(?:alien-signals|devalue)(?:\/|$)/ }, (resolution) => {
					if (resolution.pluginData?.scopedBundleTooling) return undefined;
					return builder.resolve(resolution.path, {
						kind: resolution.kind,
						resolveDir: toolingRoot,
						pluginData: { scopedBundleTooling: true },
					});
				});
			}
			// Hash the exact bytes supplied to esbuild, not a later disk read.
			// Repeated inputs use the same bytes across all seven builds.
			builder.onLoad({ filter: /\.(?:[cm]?[jt]s|jsx|tsx|json)$/ }, ({ path: filename }) => {
				const extension = path.extname(filename);
				const loader = ['.ts', '.mts', '.cts'].includes(extension)
					? 'ts'
					: ['.jsx', '.tsx', '.json'].includes(extension)
						? extension.slice(1)
						: 'js';
				return { contents: cachedSource(filename), loader, resolveDir: path.dirname(filename) };
			});
		},
	};

	for (const scenario of BUNDLE_CASES) {
		for (const label of scenario.baseline ? ['baseline', 'candidate'] : ['candidate']) {
			const root = roots[label];
			const source = entrySource(scenario);
			const sourcefile = `${label}-${scenario.id}-public-entry.mjs`;
			const result = await esbuild.build({
				...payload.buildOptions,
				absWorkingDir: REPO,
				platform: scenario.platform,
				stdin: { contents: source, sourcefile, resolveDir: root },
				plugins: [sourcePlugin],
				logLevel: 'silent',
			});
			assert.equal(
				result.outputFiles.length,
				1,
				`${label}/${scenario.id}: unexpected bundle outputs`,
			);
			const bytes = result.outputFiles[0].contents;
			const output = Object.values(result.metafile.outputs)[0];
			const inputs = Object.entries(result.metafile.inputs).map(([input, meta]) => {
				if (path.basename(input) === sourcefile) {
					return {
						path: sourcefile,
						source,
						sha256: sha256(source),
						bytes: meta.bytes,
						bytesInOutput: output.inputs[input]?.bytesInOutput ?? 0,
					};
				}
				const filename = fs.realpathSync(path.resolve(REPO, input));
				assert.ok(sourceCache.has(filename), `Unhashed esbuild source input: ${filename}`);
				const contents = sourceCache.get(filename);
				const withinPackage = filename.startsWith(root + path.sep);
				const data = findPackage(filename);
				const dependency = data && {
					name: data.name,
					version: data.version,
					manifest: data.manifest,
					manifestSha256: data.manifestSha256,
				};
				if (data?.name === 'alien-signals') {
					assert.equal(
						data.manifest,
						dependencies.alien.manifest,
						`${label}/${scenario.id}: inconsistent Alien installation`,
					);
				}
				if (data?.name === 'devalue') {
					assert.equal(
						data.manifest,
						dependencies.devalue.manifest,
						`${label}/${scenario.id}: inconsistent devalue installation`,
					);
				}
				return {
					path: withinPackage
						? `packages/octane/${path.relative(root, filename).replaceAll('\\', '/')}`
						: filename,
					physicalPath: filename,
					sha256: sha256(contents),
					gitBlob:
						label === 'baseline' && withinPackage ? verifyBaseline(filename, contents) : undefined,
					bytes: meta.bytes,
					bytesInOutput: output.inputs[input]?.bytesInOutput ?? 0,
					package: dependency,
				};
			});
			const measured = {
				raw: bytes.length,
				gzip: gzipSync(bytes, { level: zlib.Z_BEST_COMPRESSION }).length,
				brotli: brotliCompressSync(bytes, {
					params: { [zlib.BROTLI_PARAM_QUALITY]: zlib.BROTLI_MAX_QUALITY },
				}).length,
			};
			const row = {
				name: `${label}/${scenario.id}`,
				ops: Object.fromEntries(Object.entries(measured).map(([key, value]) => [key, stat(value)])),
				meta: {
					request: scenario.request,
					exports: scenario.exports,
					platform: scenario.platform,
					bundleSha256: sha256(bytes),
					inputs,
					boundaryChecks: 'pending',
					exportLoadSmoke: 'pending',
				},
			};
			payload.targets.push(row);
			try {
				verifyBundleInputs(scenario, inputs);
				const exportKey =
					scenario.request === 'octane' ? '.' : `.${scenario.request.slice('octane'.length)}`;
				const entryExport = manifests[label].exports[exportKey];
				assert.equal(
					typeof entryExport,
					'string',
					`${label}/${scenario.id}: expected direct public source export`,
				);
				const expectedEntry = `packages/octane/${entryExport.replace(/^\.\//, '')}`;
				assert.ok(
					inputs.some((input) => input.path === expectedEntry),
					`${label}/${scenario.id}: public package export not bundled`,
				);
				row.meta.boundaryChecks = 'passed';
			} catch (error) {
				row.meta.boundaryChecks = error.message;
				failures.push(`${row.name}: ${error.message}`);
			}
			try {
				const api = await import(
					`data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`
				);
				assert.deepEqual(
					Object.keys(api).sort(),
					[...scenario.exports].sort(),
					`${row.name}: wrong runtime export surface`,
				);
				for (const name of scenario.exports)
					assert.equal(typeof api[name], 'function', `${row.name}: ${name} did not load`);
				if (scenario.id === 'ordinary-server') {
					assert.deepEqual(
						api.renderToString(() => null),
						{ html: '', css: '' },
					);
				}
				if (scenario.id === 'engine') {
					const scope = api.createScope({ scopeKey: 'bundle-smoke' });
					try {
						const count$ = scope.signal$('count', 1);
						const double$ = scope.derived$('double', () => scope.get(count$) * 2);
						const values = [];
						const stop = double$.subscribe(() => values.push(scope.get(double$)));
						assert.equal(scope.get(double$), 2);
						scope.set(count$, 2);
						assert.equal(scope.get(double$), 4);
						assert.deepEqual(values, [4]);
						stop();
					} finally {
						scope.dispose();
					}
				}
				row.meta.exportLoadSmoke = 'passed';
			} catch (error) {
				row.meta.exportLoadSmoke = error.message;
				failures.push(`${row.name}: ${error.message}`);
			}
			console.log(
				`${row.name.padEnd(29)} raw ${String(measured.raw).padStart(7)}  gzip ${String(measured.gzip).padStart(6)}  brotli ${String(measured.brotli).padStart(6)}`,
			);
		}
	}
	for (const scenario of BUNDLE_CASES.filter((entry) => entry.baseline)) {
		const baseline = payload.targets.find((entry) => entry.name === `baseline/${scenario.id}`);
		const candidate = payload.targets.find((entry) => entry.name === `candidate/${scenario.id}`);
		payload.comparisons.push({
			scenario: scenario.id,
			metrics: Object.fromEntries(
				['raw', 'gzip', 'brotli'].map((metric) => {
					const before = baseline.ops[metric].median;
					const after = candidate.ops[metric].median;
					return [
						metric,
						{
							baseline: before,
							candidate: after,
							delta: after - before,
							percent: (after / before - 1) * 100,
						},
					];
				}),
			),
		});
	}
	const changed = [...sourceCache]
		.filter(([filename, contents]) => !fs.readFileSync(filename).equals(contents))
		.map(([filename]) => filename);
	payload.changedInputsDuringRun = changed;
	assert.deepEqual(
		changed,
		[],
		'Sources changed during bundle measurement; rerun for one stable source set',
	);
} catch (error) {
	failures.push(error.stack ?? String(error));
}

payload.finishedAt = new Date().toISOString();
if (failures.length) {
	payload.failed = failures.join('\n');
	process.exitCode = 1;
	console.error(payload.failed);
}
if (process.env.BENCH_JSON) {
	fs.mkdirSync(path.dirname(path.resolve(process.env.BENCH_JSON)), { recursive: true });
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
}
