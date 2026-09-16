// Actual archived/current public APIs; no source overlays or compiler specialization.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { summarizeSamples } from '../lib/stats.mjs';
import { gitBlobHash, sha256 } from './bundle-boundaries.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const options = new Map();
const allowed = new Set([
	'baseline-root',
	'baseline-ref',
	'tooling-root',
	'samples',
	'reads',
	'seed',
]);
const prepare = process.argv.includes('--prepare');
for (const arg of process.argv.slice(2).filter((arg) => arg !== '--prepare')) {
	const match = /^--([^=]+)=(.+)$/.exec(arg);
	assert.ok(match && allowed.has(match[1]) && !options.has(match[1]), `Invalid option: ${arg}`);
	options.set(match[1], match[2]);
}
for (const key of ['baseline-root', 'baseline-ref'])
	assert.ok(options.has(key), `Missing --${key}`);
assert.ok(
	process.env.BENCH_JSON && path.isAbsolute(process.env.BENCH_JSON),
	'BENCH_JSON must be a new absolute filename',
);
assert.equal(fs.existsSync(process.env.BENCH_JSON), false, 'Refusing to overwrite BENCH_JSON');
function integer(key, fallback) {
	const value = Number(options.get(key) ?? fallback);
	assert.ok(Number.isSafeInteger(value) && value > 0, `Invalid --${key}`);
	return value;
}
const samples = integer('samples', 15),
	reads = integer('reads', 200000),
	seed = integer('seed', 0x8eb93b);
assert.ok(
	samples >= 3 && reads % 2 === 0 && seed <= 0xffffffff,
	'Use >=3 samples, even reads, and a uint32 seed',
);
const git = (...args) => execFileSync('git', args, { cwd: REPO, maxBuffer: 32 * 1024 * 1024 });
const baselineRef = git('rev-parse', '--verify', `${options.get('baseline-ref')}^{commit}`)
	.toString()
	.trim();
const baselineRoot = fs.realpathSync(options.get('baseline-root'));
assert.notEqual(baselineRoot, REPO, 'Baseline must be an independent archive');
const objectFormat = git('rev-parse', '--show-object-format').toString().trim();
const blobs = new Map(
	git('ls-tree', '-r', '-z', baselineRef)
		.toString()
		.split('\0')
		.filter(Boolean)
		.map((line) => {
			const match = /^\d+ blob ([a-f\d]+)\t(.+)$/.exec(line);
			return match ? [match[2], match[1]] : [line, null];
		}),
);
const inputs = new Map();
function read(file) {
	file = fs.realpathSync(file);
	if (!inputs.has(file)) {
		const bytes = fs.readFileSync(file);
		if (file.startsWith(baselineRoot + path.sep)) {
			assert.equal(
				gitBlobHash(bytes, objectFormat),
				blobs.get(path.relative(baselineRoot, file)),
				`Archive differs from Git: ${file}`,
			);
		}
		inputs.set(file, bytes);
	}
	return inputs.get(file);
}
const toolingRoot = fs.realpathSync(
	options.get('tooling-root') ?? path.join(REPO, 'packages/octane'),
);
const requireTool = createRequire(path.join(toolingRoot, 'package.json'));
const dependencies = Object.fromEntries(
	['esbuild', 'alien-signals', 'devalue'].map((name) => {
		const entry = fs.realpathSync(requireTool.resolve(name));
		let directory = path.dirname(entry);
		for (;;) {
			const manifest = path.join(directory, 'package.json');
			if (fs.existsSync(manifest)) {
				const data = JSON.parse(read(manifest));
				if (data.name === name)
					return [
						name,
						{
							version: data.version,
							entry,
							entrySha256: sha256(read(entry)),
							manifest,
							manifestSha256: sha256(read(manifest)),
						},
					];
			}
			const parent = path.dirname(directory);
			assert.notEqual(parent, directory, `Missing ${name} manifest`);
			directory = parent;
		}
	}),
);
assert.deepEqual(
	Object.values(dependencies).map((dependency) => dependency.version),
	['0.28.1', '3.2.0', '5.8.2'],
	'Update the explicit toolchain pins before measuring different dependencies',
);
const { build } = requireTool('esbuild');
const entry = `
import assert from 'node:assert/strict';
import {__signalAt,runWithSignalOwner,currentSignalOwner,retireSignalOwnerIdentity,installSignalOwnerEnvironment} from 'octane/signals';
export function setup() {
  const documentOwner={scopeKey:'reads:document'};
  const one={scopeKey:'reads:one',documentOwner,instanceOwner:{},instanceKey:'one'};
  const two={scopeKey:'reads:two',documentOwner,instanceOwner:{},instanceKey:'two'};
  const global$=__signalAt('g:reads',7),local$=__signalAt('i:reads',3);
  runWithSignalOwner(one,()=>{global$.get();local$.get()});
  runWithSignalOwner(two,()=>local$.set(4));
  return {documentOwner,one,two,global$,local$};
}
export function carrier(state) {
  let active=state.one;
  const environment={current:()=>active,run(owner,callback){const previous=active;active=owner;try{return callback()}finally{active=previous}},capture(owner){return callback=>environment.run(owner,callback)}};
  return installSignalOwnerEnvironment(environment);
}
export function check(state) {
  const seen=[];
  const stop=runWithSignalOwner(state.one,()=>state.global$.subscribe(()=>seen.push([currentSignalOwner(),state.global$.get(),state.local$.get()])));
  runWithSignalOwner(state.two,()=>state.global$.set(8));
  assert.deepEqual(seen,[[state.one,8,3]]);
  stop();
  runWithSignalOwner(state.two,()=>state.global$.set(7));
  assert.equal(seen.length,1);
  assert.equal(runWithSignalOwner(state.one,()=>state.global$.get()),7);
  assert.equal(runWithSignalOwner(state.two,()=>state.local$.get()),4);
  assert.equal(runWithSignalOwner(state.one,()=>state.local$.get()),3);
  return {sharedGlobal:true,isolatedLocals:true,originalSubscriberOwner:true,unsubscribe:true};
}
export function execute(state,kind,reads) {
  let sum=0;
  if(kind==='implicit-read')for(let i=0;i<reads;i++)sum+=state.global$.get();
  else if(kind==='global-read')runWithSignalOwner(state.one,()=>{for(let i=0;i<reads;i++)sum+=state.global$.get()});
  else if(kind==='instance-read')runWithSignalOwner(state.one,()=>{for(let i=0;i<reads;i++)sum+=state.local$.get()});
  else for(let i=0;i<reads;i++)sum+=runWithSignalOwner(i%2?state.two:state.one,()=>state.local$.get());
  return sum;
}
export function cleanup(state) {
  retireSignalOwnerIdentity(state.one);
  assert.throws(()=>runWithSignalOwner(state.one,()=>state.local$.get()),/disposed/);
  assert.equal(runWithSignalOwner(state.two,()=>state.global$.get()),7);
  retireSignalOwnerIdentity(state.documentOwner);
  assert.throws(()=>runWithSignalOwner(state.two,()=>state.global$.get()),/disposed/);
  retireSignalOwnerIdentity(state.two);
}
`;
const buildOptions = {
	bundle: true,
	write: false,
	metafile: true,
	minify: true,
	treeShaking: true,
	format: 'esm',
	platform: 'node',
	target: 'es2022',
	legalComments: 'none',
	tsconfigRaw: { compilerOptions: {} },
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
};
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-owner-reads-'));
const report = {
	suite: 'owner-reads',
	status: 'preparing',
	startedAt: new Date().toISOString(),
	request: process.argv,
	node: process.version,
	execArgv: process.execArgv,
	machine: { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
	baselineRef,
	baselineRoot,
	baselineArchiveSha256: fs.existsSync(path.join(baselineRoot, 'source.tar'))
		? sha256(fs.readFileSync(path.join(baselineRoot, 'source.tar')))
		: null,
	candidateRef: git('rev-parse', 'HEAD').toString().trim(),
	candidateDirty: git('status', '--porcelain').toString().trim() !== '',
	toolingRoot,
	dependencies,
	buildOptions,
	entry,
	entrySha256: sha256(entry),
	runnerSha256: sha256(read(import.meta.filename)),
	statisticsSha256: sha256(read(path.resolve(import.meta.dirname, '../lib/stats.mjs'))),
	provenanceHelpersSha256: sha256(read(path.join(import.meta.dirname, 'bundle-boundaries.mjs'))),
	configuration: { samples, reads, warmups: 5, seed, prepare },
	bundles: [],
	observations: [],
	summary: [],
	limitations: [
		'Node cached descriptor loops only; no Safari, browser, streaming, hydration, or application latency claim.',
		'Setup, compilation, checks and retirement are outside timing; implicit-read uses an installed public owner carrier, not a browser default owner.',
		'No timing threshold; all samples retained and overlapping uncertainty remains inconclusive.',
	],
};
const prepared = [];
try {
	for (const [label, root] of [
		['baseline', baselineRoot],
		['candidate', REPO],
	]) {
		for (const file of [
			'package.json',
			'pnpm-workspace.yaml',
			'pnpm-lock.yaml',
			'packages/octane/package.json',
		])
			read(path.join(root, file));
		const manifest = JSON.parse(read(path.join(root, 'packages/octane/package.json')));
		assert.equal(manifest.name, 'octane');
		assert.equal(typeof manifest.exports['./signals'], 'string');
		const result = await build({
			...buildOptions,
			stdin: { contents: entry, resolveDir: root, sourcefile: 'owner-reads.mjs' },
			plugins: [
				{
					name: 'actual-hashed-sources',
					setup(builder) {
						builder.onResolve({ filter: /^octane\/signals$/ }, () => ({
							path: path.resolve(root, 'packages/octane', manifest.exports['./signals']),
						}));
						builder.onResolve({ filter: /^(?:alien-signals|devalue)(?:\/|$)/ }, (args) =>
							args.pluginData?.tooling
								? undefined
								: builder.resolve(args.path, {
										kind: args.kind,
										resolveDir: toolingRoot,
										pluginData: { tooling: true },
									}),
						);
						builder.onLoad({ filter: /\.(?:[cm]?[jt]s|json)$/ }, ({ path: file }) => ({
							contents: read(file),
							loader: file.endsWith('.ts') ? 'ts' : file.endsWith('.json') ? 'json' : 'js',
							resolveDir: path.dirname(file),
						}));
					},
				},
			],
		});
		for (const input of Object.keys(result.metafile.inputs)) {
			// esbuild names the in-memory stdin entry from sourcefile + resolveDir.
			if (path.resolve(REPO, input) === path.join(root, 'owner-reads.mjs')) continue;
			const file = fs.realpathSync(path.resolve(REPO, input));
			assert.ok(inputs.has(file), `Unhashed bundle input: ${file}`);
			assert.ok(
				file.startsWith(path.join(root, 'packages/octane/src') + path.sep) ||
					Object.values(dependencies).some((dependency) =>
						file.startsWith(path.dirname(dependency.manifest) + path.sep),
					),
				`Input escaped its selected source or dependency root: ${file}`,
			);
		}
		const output = path.join(scratch, `${label}.mjs`);
		fs.writeFileSync(output, result.outputFiles[0].contents, { flag: 'wx' });
		const api = await import(pathToFileURL(output).href),
			state = api.setup();
		const semantic = api.check(state),
			uninstall = api.carrier(state);
		api.check(state);
		uninstall();
		prepared.push({ label, api, state });
		report.bundles.push({
			label,
			path: output,
			sha256: sha256(result.outputFiles[0].contents),
			bytes: result.outputFiles[0].contents.length,
			semantic,
			inputs: result.metafile.inputs,
		});
	}
	let random = seed;
	const next = () => {
		random ^= random << 13;
		random ^= random >>> 17;
		random ^= random << 5;
		return random >>> 0;
	};
	const cases = {
		'implicit-read': 7,
		'global-read': 7,
		'instance-read': 3,
		'cross-owner-read': 3.5,
	};
	function block(target, kind, count, timed) {
		const uninstall = kind === 'implicit-read' ? target.api.carrier(target.state) : undefined;
		try {
			const start = timed ? performance.now() : 0;
			const sum = target.api.execute(target.state, kind, count);
			const ns = timed ? ((performance.now() - start) * 1e6) / count : null;
			assert.equal(sum, cases[kind] * count);
			return ns;
		} finally {
			uninstall?.();
		}
	}
	for (const target of prepared)
		for (const kind of Object.keys(cases)) block(target, kind, 100, false);
	if (!prepare) {
		for (let warm = 0; warm < 5; warm++)
			for (const kind of Object.keys(cases))
				for (const target of prepared) block(target, kind, reads, false);
		for (let round = 0; round < samples; round++) {
			const kinds = Object.keys(cases);
			for (let i = kinds.length - 1; i > 0; i--) {
				const j = next() % (i + 1);
				[kinds[i], kinds[j]] = [kinds[j], kinds[i]];
			}
			for (const kind of kinds) {
				const first = (round + (seed & 1)) % 2,
					order = [first, 1 - first, 1 - first, first];
				const blocks = order.map((index) => ({
					target: prepared[index].label,
					nsPerRead: block(prepared[index], kind, reads, true),
				}));
				const mean = (label) =>
					blocks
						.filter((block) => block.target === label)
						.reduce((sum, block) => sum + block.nsPerRead, 0) / 2;
				report.observations.push({
					round,
					kind,
					order: first ? 'BAAB' : 'ABBA',
					blocks,
					ratio: mean('candidate') / mean('baseline'),
				});
			}
		}
		for (const kind of Object.keys(cases)) {
			const rows = report.observations.filter((row) => row.kind === kind),
				ratios = rows.map((row) => row.ratio);
			const logs = summarizeSamples(ratios.map(Math.log), { scoreMode: 'mean' });
			report.summary.push({
				kind,
				absolute: Object.fromEntries(
					prepared.map(({ label }) => [
						label,
						summarizeSamples(
							rows.map(
								(row) =>
									row.blocks
										.filter((block) => block.target === label)
										.reduce((sum, block) => sum + block.nsPerRead, 0) / 2,
							),
							{ scoreMode: 'mean' },
						),
					]),
				),
				ratios,
				ratioDistribution: summarizeSamples(ratios, { scoreMode: 'mean' }),
				geometricRatio: Math.exp(logs.mean),
				geometricCi95: [Math.exp(logs.mean - logs.moe), Math.exp(logs.mean + logs.moe)],
			});
		}
	}
	for (const target of prepared) {
		target.api.check(target.state);
		target.api.cleanup(target.state);
	}
	for (const [file, bytes] of inputs)
		assert.equal(sha256(fs.readFileSync(file)), sha256(bytes), `Input changed during run: ${file}`);
	report.sourceInputs = [...inputs].map(([file, bytes]) => ({ file, sha256: sha256(bytes) }));
	report.status = prepare ? 'prepared' : 'measured';
} catch (error) {
	report.status = 'failed';
	report.failed = error.stack;
	process.exitCode = 1;
}
fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(
	JSON.stringify(
		{
			status: report.status,
			output: process.env.BENCH_JSON,
			summary: report.summary,
			failed: report.failed,
		},
		null,
		2,
	),
);
