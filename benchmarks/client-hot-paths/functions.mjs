// Untimed V8 diagnostics for real production client functions. Diagnostic
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
import { Window } from 'happy-dom';

const names = [
	'reconcileKeyed',
	'forBlock',
	'mountItem',
	'renderBlockInner',
	'setAttribute',
	'coerceAttrValue',
	'useState',
	'mapSlot',
];
const repo = resolve(import.meta.dirname, '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const exports = [
	'createRoot',
	'createElement',
	'flushSync',
	'useState',
	'forBlock',
	'mapSlot',
	'hostComponent',
];

async function exercise(artifact, coverage) {
	const window = new Window({ url: 'http://localhost/' });
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'HTMLInputElement',
		'HTMLTextAreaElement',
		'SVGElement',
		'Comment',
		'Text',
		'Event',
		'MouseEvent',
		'MutationObserver',
	]) {
		Object.defineProperty(globalThis, name, {
			value: name === 'window' ? window : window[name],
			configurable: true,
		});
	}
	const runtime = await import(pathToFileURL(artifact).href);
	const status = new Function('fn', 'return %GetOptimizationStatus(fn);');
	const debug = new Function('fn', '%DebugPrint(fn);');
	const functions = runtime.__clientHotFunctions;
	const printReferences = (phase) => {
		if (coverage) return;
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
	const custom = [1, 2];
	custom.map = () => ['custom'];
	assert.equal(runtime.mapSlot(custom, custom.map), false);
	assert.equal(runtime.mapSlot([1, , 3], Array.prototype.map), false);
	assert.equal(runtime.mapSlot([1, 2, 3], Array.prototype.map), true);
	const slot = Symbol('state');
	const rows = Array.from({ length: 16 }, (_, id) => ({ id, label: 'row:' + id }));
	const key = (row) => row.id;
	const callback = (row) =>
		runtime.createElement(
			'li',
			{ key: row.id, 'data-row': row.id },
			runtime.createElement('input', { defaultValue: row.label }),
		);
	function rowBody(row, scope) {
		runtime.hostComponent(
			scope,
			0,
			'li',
			{ 'data-row': row.id },
			runtime.createElement('input', { defaultValue: row.label }),
		);
	}
	const results = [];
	let update;
	let seenState;
	function Scene(props, scope) {
		const state = runtime.useState(7, slot);
		seenState = state[0];
		update = state[1];
		runtime.hostComponent(
			scope,
			0,
			'output',
			{
				'data-version': props.version,
				'aria-hidden': props.version % 2 === 0,
				draggable: props.version % 2 === 0,
				hidden: props.version % 2 !== 0,
				title: props.version % 2 === 0 ? 'even' : null,
			},
			String(state[0]),
		);
		const list = runtime.hostComponent(scope, 1, 'ul', null);
		if (props.mapped) {
			// This is the compiler's full map ABI, with its real eligibility query.
			const native = runtime.mapSlot(props.rows, props.rows.map);
			runtime.mapSlot(
				scope,
				2,
				list,
				props.rows,
				props.rows.map,
				native,
				callback,
				key,
				rowBody,
				0,
				[props.version],
			);
		} else {
			runtime.forBlock(scope, 2, list, props.rows, key, rowBody, props.singleRoot ? 2 : 0);
		}
	}
	for (const [mapped, singleRoot] of [
		[false, false],
		[false, true],
		[true, false],
	]) {
		const container = document.createElement('div');
		document.body.append(container);
		const root = runtime.createRoot(container);
		try {
			let current = rows;
			let version = 0;
			const render = (next) => {
				current = next;
				runtime.flushSync(() =>
					root.render(Scene, { rows: current, version: ++version, mapped, singleRoot }),
				);
			};
			root.render(Scene, { rows: current, version, mapped, singleRoot });
			const original = new Map(
				[...container.querySelectorAll('li')].map((node) => [
					Number(node.getAttribute('data-row')),
					node,
				]),
			);
			for (const [id, node] of original) node.querySelector('input').value = 'typed:' + id;
			// Stable, reverse, rotate, insertion, removal, and empty/refill paths.
			const rounds = coverage ? 2 : 300;
			for (let iteration = 0; iteration < rounds; iteration++) {
				render(current);
				render(current.toReversed());
				render([...current.slice(1), current[0]]);
				const extra = { id: 100 + iteration, label: 'new:' + iteration };
				render([...current.slice(0, 8), extra, ...current.slice(8)]);
				render(current.filter((row) => row !== extra));
			}
			const after = [...container.querySelectorAll('li')];
			assert.deepEqual(
				after.map((node) => Number(node.getAttribute('data-row'))),
				current.map(key),
			);
			for (const row of current) {
				const node = original.get(row.id);
				assert.equal(
					after.find((item) => item.getAttribute('data-row') === String(row.id)),
					node,
				);
				assert.equal(node.querySelector('input').value, 'typed:' + row.id);
			}
			const output = container.querySelector('output');
			for (let parity = 0; parity < 2; parity++) {
				assert.equal(output.getAttribute('data-version'), String(version));
				assert.equal(output.getAttribute('aria-hidden'), String(version % 2 === 0));
				assert.equal(output.getAttribute('draggable'), String(version % 2 === 0));
				assert.equal(output.hasAttribute('hidden'), version % 2 !== 0);
				assert.equal(output.getAttribute('title'), version % 2 === 0 ? 'even' : null);
				render(current);
			}
			runtime.flushSync(() => update((value) => value + 5));
			assert.equal(seenState, 12);
			assert.equal(container.querySelector('output'), output);
			assert.equal(output.textContent, '12');
			render([]);
			assert.equal(container.querySelectorAll('li').length, 0);
			render(rows);
			assert.deepEqual(
				[...container.querySelectorAll('li')].map((node) => Number(node.getAttribute('data-row'))),
				rows.map(key),
			);
			results.push({ mapped, singleRoot, state: seenState, rows: rows.map(key), cleanup: true });
		} finally {
			root.unmount();
			assert.equal(container.childNodes.length, 0);
			container.remove();
		}
	}
	const naturalStatus = Object.fromEntries(names.map((name) => [name, status(functions[name])]));
	printReferences('after');
	let counts;
	if (session) {
		const data = await session.post('Profiler.takePreciseCoverage');
		counts = Object.fromEntries(names.map((name) => [name, 0]));
		for (const script of data.result) {
			if (script.url !== pathToFileURL(artifact).href) continue;
			for (const fn of script.functions) {
				if (Object.hasOwn(counts, fn.functionName)) counts[fn.functionName] += fn.ranges[0].count;
			}
		}
		await session.post('Profiler.stopPreciseCoverage');
		session.disconnect();
		for (const name of names) assert.ok(counts[name] > 0, name + ' was not exercised');
	}
	await window.happyDOM.close();
	return { semanticSha: hash(JSON.stringify(results)), counts, naturalStatus };
}

if (process.argv[2] === '--worker') {
	const result = await exercise(process.argv[3], process.argv[4] === '--coverage');
	console.log('FUNCTIONS_JSON ' + JSON.stringify(result));
} else {
	const sourceRoot = resolve(process.env.CLIENT_SOURCE_ROOT || process.argv[2] || repo);
	const sourceFile = join(sourceRoot, 'packages/octane/src/runtime.ts');
	const source = await readFile(sourceFile, 'utf8');
	const out = join(repo, 'node_modules/.cache/client-hot-functions');
	await mkdir(out, { recursive: true });
	const entry = `export {${exports.join(',')}} from './packages/octane/src/runtime.ts';`;
	const options = {
		stdin: { contents: entry, resolveDir: sourceRoot },
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [join(repo, 'packages/octane/node_modules'), join(repo, 'node_modules')],
	};
	const clean = (await build({ ...options, minify: true })).outputFiles[0].text;
	const diagnostic = (
		await build({
			...options,
			stdin: {
				contents: entry + "export {__clientHotFunctions} from './packages/octane/src/runtime.ts';",
				resolveDir: sourceRoot,
			},
			plugins: [
				{
					name: 'diagnostic-function-references',
					setup(builder) {
						builder.onLoad({ filter: /\/runtime\.ts$/ }, async ({ path }) => {
							if (path !== sourceFile) return;
							return {
								contents: source + `\nexport const __clientHotFunctions = {${names.join(',')}};`,
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
	if (process.env.CLIENT_FUNCTION_TRACE_DIRECTORY) {
		const traces = resolve(process.env.CLIENT_FUNCTION_TRACE_DIRECTORY);
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
			'No tier events matched runtime function identities; tier results are inconclusive. Set CLIENT_FUNCTION_TRACE_DIRECTORY to inspect the raw output.',
		);
	console.log(
		JSON.stringify(
			{
				suite: 'client-hot-functions',
				sourceRoot,
				sourceSha: hash(source),
				node: process.version,
				v8: process.versions.v8,
				platform: process.platform,
				arch: process.arch,
				configuration: {
					coverageRounds: 2,
					warmRounds: 300,
					listModes: 3,
					rows: 16,
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
