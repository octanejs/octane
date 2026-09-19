// Untimed V8 diagnostics for real production server functions. Diagnostic
// exports expose function references; no function bodies or call sites change.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const names = ['ssrTry', 'ssrAttr', 'ssrHostElement'];
const repo = resolve(import.meta.dirname, '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const exports = [
	'createElement',
	'renderToString',
	'renderToStaticMarkup',
	'Suspense',
	'use',
	'ViewTransition',
];
async function exercise(artifact, coverage) {
	const runtime = await import(pathToFileURL(artifact).href);
	const status = new Function('fn', 'return %GetOptimizationStatus(fn);');
	const debug = new Function('fn', '%DebugPrint(fn);');
	const functions = runtime.__serverHotFunctions;
	const printReferences = (phase) => {
		if (!coverage)
			for (const name of names) {
				console.log('FUNCTION_REFERENCE ' + phase + ' ' + name);
				debug(functions[name]);
			}
	};
	printReferences('before');
	const session = coverage ? new Session() : null;
	if (session) {
		session.connect();
		await session.post('Profiler.enable');
		await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
	}
	const h = runtime.createElement;
	const known = {
		status: 'fulfilled',
		value: 'ready',
		then() {
			throw new Error('fulfilled promise must not subscribe');
		},
	};
	const Child = ({ index }) =>
		h(
			'span',
			{
				'data-id': index,
				title: 'a&b',
				hidden: index % 2 === 0,
				'aria-hidden': index % 2 === 0,
				style: { lineHeight: 1.5 },
			},
			runtime.use(known, 'data'),
		);
	const Scene = () =>
		h(
			'main',
			null,
			...Array.from({ length: 128 }, (_, index) =>
				h(runtime.Suspense, { key: index, fallback: h('i', null, 'waiting') }, h(Child, { index })),
			),
		);
	let result;
	for (let round = 0; round < (coverage ? 2 : 300); round++) result = runtime.renderToString(Scene);
	assert.equal((result.html.match(/>ready</g) || []).length, 128);
	assert.equal((result.html.match(/title="a&amp;b"/g) || []).length, 128);
	assert.ok(!result.html.includes('waiting'));
	const rejected = { status: 'rejected', reason: new Error('rejected-control'), then() {} };
	const ErrorChild = () => h('b', null, runtime.use(rejected, 'rejected'));
	assert.throws(() => runtime.renderToString(ErrorChild), /rejected-control/);
	const fallback = runtime.renderToString(() =>
		h(
			runtime.Suspense,
			{ fallback: h('i', null, 'waiting') },
			h(() => h('b', null, runtime.use({ status: 'pending', then() {} }, 'pending'))),
		),
	);
	assert.ok(fallback.html.includes('waiting'));
	const staticResult = runtime.renderToStaticMarkup(Scene);
	assert.equal((staticResult.html.match(/>ready</g) || []).length, 128);
	let counts;
	if (session) {
		const data = await session.post('Profiler.takePreciseCoverage');
		counts = Object.fromEntries(names.map((n) => [n, 0]));
		for (const script of data.result) {
			if (script.url !== pathToFileURL(artifact).href) continue;
			for (const fn of script.functions)
				if (Object.hasOwn(counts, fn.functionName)) counts[fn.functionName] += fn.ranges[0].count;
		}
		await session.post('Profiler.stopPreciseCoverage');
		session.disconnect();
		for (const name of names) assert.ok(counts[name] > 0, name + ' was not exercised');
	}
	const naturalStatus = Object.fromEntries(names.map((name) => [name, status(functions[name])]));
	printReferences('after');
	return {
		semanticSha: hash(JSON.stringify([result, staticResult, fallback])),
		counts,
		naturalStatus,
	};
}

if (process.argv[2] === '--worker') {
	const result = await exercise(process.argv[3], process.argv[4] === '--coverage');
	console.log('FUNCTIONS_JSON ' + JSON.stringify(result));
} else {
	const sourceRoot = resolve(process.env.SSR_SOURCE_ROOT || process.argv[2] || repo);
	const sourceFile = join(sourceRoot, 'packages/octane/src/runtime.server.ts');
	const source = await readFile(sourceFile, 'utf8');
	const out = join(repo, 'node_modules/.cache/ssr-hot-functions');
	await mkdir(out, { recursive: true });
	const entry = `export {${exports.join(',')}} from './packages/octane/src/runtime.server.ts';`;
	const options = {
		stdin: { contents: entry, resolveDir: sourceRoot },
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'node',
		target: 'es2022',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [join(repo, 'packages/octane/node_modules'), join(repo, 'node_modules')],
	};
	const clean = (await build({ ...options, minify: true })).outputFiles[0].text;
	const diagnostic = (
		await build({
			...options,
			stdin: {
				contents:
					entry + "export {__serverHotFunctions} from './packages/octane/src/runtime.server.ts';",
				resolveDir: sourceRoot,
			},
			plugins: [
				{
					name: 'diagnostic-function-references',
					setup(builder) {
						builder.onLoad({ filter: /\/runtime\.server\.ts$/ }, async ({ path }) => {
							if (path !== sourceFile) return;
							return {
								contents: source + `\nexport const __serverHotFunctions = {${names.join(',')}};`,
								loader: 'ts',
							};
						});
					},
				},
			],
		})
	).outputFiles[0].text;
	const artifact = join(out, hash(diagnostic) + '.mjs');
	await writeFile(artifact, diagnostic);
	function run(flags, coverage = false) {
		const child = spawnSync(
			process.execPath,
			[
				'--allow-natives-syntax',
				...flags,
				import.meta.filename,
				'--worker',
				artifact,
				...(coverage ? ['--coverage'] : []),
			],
			{ encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: process.env },
		);
		if (child.error) throw child.error;
		if (child.status !== 0) throw new Error(child.stderr + '\n' + child.stdout.slice(-8000));
		const payload = child.stdout.split('\n').find((line) => line.startsWith('FUNCTIONS_JSON '));
		assert.ok(payload, 'worker did not return results');
		return {
			payload: JSON.parse(payload.slice('FUNCTIONS_JSON '.length)),
			stdout: child.stdout,
			stderr: child.stderr,
		};
	}
	const observed = run([], true);
	const warmed = run([
		'--no-concurrent-recompilation',
		'--print-bytecode',
		'--trace-opt',
		'--trace-deopt',
	]);
	if (process.env.SSR_FUNCTION_TRACE_DIRECTORY) {
		const traces = resolve(process.env.SSR_FUNCTION_TRACE_DIRECTORY);
		await mkdir(traces, { recursive: true });
		await writeFile(join(traces, 'stdout.log'), warmed.stdout);
		await writeFile(join(traces, 'stderr.log'), warmed.stderr);
	}
	assert.equal(observed.payload.semanticSha, warmed.payload.semanticSha);
	// DebugPrint/bytecode can pad pointers with zeros while tier traces omit
	// them. Match pointer values, not their engine-specific printed spelling.
	const address = (value) => BigInt(value).toString(16);
	const references = Object.fromEntries(names.map((name) => [name, new Set()]));
	for (const match of warmed.stdout.matchAll(
		/FUNCTION_REFERENCE (?:before|after) (\w+)\n[\s\S]*?shared_info: (0x[\da-f]+)/g,
	)) {
		references[match[1]].add(address(match[2]));
	}
	const bytecode = {};
	for (const match of warmed.stdout.matchAll(
		/\[generated bytecode for function: (\w+) \((0x[\da-f]+) [^\n]*\]\nBytecode length: (\d+)/g,
	)) {
		if (Object.hasOwn(references, match[1]) && references[match[1]].has(address(match[2])))
			bytecode[match[1]] = Number(match[3]);
	}
	for (const name of names) assert.ok(bytecode[name] > 0, name + ' bytecode missing');
	const optimizationTrace = warmed.stdout
		.split('\n')
		.filter((line) => {
			if (!line.includes('optim') && !line.includes('compiling') && !line.includes('bailout'))
				return false;
			const match = line.match(/<JSFunction (\w+) \(sfi = (0x[\da-f]+)\)>/);
			return (
				match !== null &&
				Object.hasOwn(references, match[1]) &&
				references[match[1]].has(address(match[2]))
			);
		})
		.map((line) => line.replaceAll(/0x[\da-f]+/g, '<address>').replace(/ - took .*/, ''));
	const tiers = Object.fromEntries(
		names.map((name) => [
			name,
			[
				...new Set(
					optimizationTrace
						.filter(
							(line) =>
								line.includes('[completed compiling') && line.includes('<JSFunction ' + name + ' '),
						)
						.map((line) => line.match(/\(target ([\w_]+)\)/)?.[1])
						.filter(Boolean),
				),
			],
		]),
	);
	const tierTraceStatus = optimizationTrace.length === 0 ? 'no-matched-events' : 'matched-events';
	if (tierTraceStatus === 'no-matched-events')
		console.error(
			'No tier events matched runtime function identities; tier results are inconclusive. Set SSR_FUNCTION_TRACE_DIRECTORY to inspect the raw output.',
		);
	console.log(
		JSON.stringify(
			{
				suite: 'ssr-hot-functions',
				sourceRoot,
				sourceSha: hash(source),
				node: process.version,
				v8: process.versions.v8,
				platform: process.platform,
				arch: process.arch,
				configuration: {
					coverageRounds: 2,
					warmRounds: 300,
					hosts: 128,
					concurrentCompilation: false,
					forcedOptimization: false,
				},
				cleanBundle: {
					minified: Buffer.byteLength(clean),
					gzip: gzipSync(clean).length,
					sha: hash(clean),
				},
				diagnosticSha: hash(diagnostic),
				semanticSha: warmed.payload.semanticSha,
				coverageCalls: observed.payload.counts,
				bytecode,
				tiers,
				tierTraceStatus,
				naturalStatus: warmed.payload.naturalStatus,
				optimizationTrace,
			},
			null,
			2,
		),
	);
}
