import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';
import { semanticHtmlForVerification } from '../lib/stream-verify.mjs';

// Count real subscriptions on public thenables. The renderer's ordinary use()
// probes remain included, so this does not hide work moved out of settling.
function deferred() {
	let resolve;
	let reject;
	let subscriptions = 0;
	const pending = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	const promise = {
		then(yes, no) {
			subscriptions++;
			return pending.then(yes, no);
		},
	};
	return { promise, resolve, reject, subscriptions: () => subscriptions };
}

export async function measureStreamingRecorders(runtime, size, group, mode = 'plain') {
	const work = Array.from({ length: size }, deferred);
	const delivered = [];
	let chunkCount = 0;
	let releaseIndex = 0;
	let finish;
	let fail;
	const ended = new Promise((yes, no) => {
		finish = yes;
		fail = no;
	});
	const Child =
		mode === 'compiled'
			? runtime.CompiledChild
			: ({ promise, id }) =>
					runtime.createElement('span', { 'data-value': id }, runtime.use(promise, 'value'));
	const App = () =>
		runtime.createElement(
			'main',
			null,
			...work.map(({ promise }, id) =>
				runtime.createElement(
					runtime.Suspense,
					{ key: id, fallback: runtime.createElement('span', { 'data-waiting': id }, 'waiting') },
					runtime.createElement(Child, { id, promise }),
				),
			),
		);
	function releaseGroup() {
		const end = Math.min(size, releaseIndex + group);
		for (; releaseIndex < end; releaseIndex++) {
			const index = size - releaseIndex - 1;
			work[index].resolve(`value-${index}`);
		}
	}
	runtime.renderToPipeableStream(App, undefined, { onError: fail, onShellError: fail }).pipe({
		write(chunk) {
			chunkCount++;
			if (chunkCount === 1) {
				assert.equal((chunk.match(/data-waiting=/g) ?? []).length, size);
				assert.ok(!chunk.includes('value-'), 'the shell precedes every value');
			} else {
				for (const html of [semanticHtmlForVerification('streaming-recorders', chunk)]) {
					const matches = [...html.matchAll(/data-value="(\d+)"[^>]*>value-(\d+)</g)];
					for (const match of matches) {
						assert.equal(match[1], match[2]);
						delivered.push(Number(match[1]));
					}
				}
			}
			// Consumer acceptance drives the next independent wave, removing data
			// timers and preventing a slow CI runner from coalescing distinct groups.
			releaseGroup();
			return true;
		},
		end: finish,
	});
	await ended;
	const expected = [];
	for (let end = size; end > 0; end -= group) {
		for (let index = Math.max(0, end - group); index < end; index++) expected.push(index);
	}
	assert.deepEqual(delivered, expected);
	assert.equal(chunkCount, 1 + Math.ceil(size / group));
	return {
		subscriptions: work.reduce((total, item) => total + item.subscriptions(), 0),
		semantic: {
			chunks: chunkCount,
			values: delivered.length,
			outputHash: createHash('sha256').update(JSON.stringify(delivered)).digest('hex'),
		},
	};
}

export function instrumentStreamingRecorders(source, counter) {
	// This source observer counts executions, never static helper occurrences.
	const baseline = 'const value = await promise;\n\t\t\t\t\tconst outcome';
	const candidate = 'async function recordStreamSettlement(';
	if (source.includes(candidate)) {
		const start = source.indexOf(candidate);
		const body = source.indexOf('): Promise<void> {', start);
		assert.ok(body > start, 'stream recorder signature exists');
		const at = body + '): Promise<void> {'.length;
		return source.slice(0, at) + `\nglobalThis.${counter}.recorders++;` + source.slice(at);
	}
	assert.ok(source.includes(baseline), 'baseline recorder exists');
	return source
		.replace(baseline, `globalThis.${counter}.recorders++;\n\t\t\t\t\t${baseline}`)
		.replace(
			'Promise.race(recorders)',
			`(globalThis.${counter}.raceSubscriptions += recorders.length, Promise.race(recorders))`,
		);
}

const repo = path.resolve(import.meta.dirname, '../..');
const counter = '__octaneStreamingRecorderWork';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function measure(sourceRoot, label, temporary) {
	const require = createRequire(path.join(repo, 'packages/octane/package.json'));
	const { build } = require('esbuild');
	const runtimePath = path.join(sourceRoot, 'packages/octane/src/runtime.server.ts');
	const source = readFileSync(runtimePath, 'utf8');
	const { compile } = await import(
		pathToFileURL(path.join(repo, 'packages/octane/src/compiler/compile.js')).href
	);
	const compiled = compile(
		`
		import { use } from 'octane';
		export function CompiledChild(props) {
			const value = use(props.promise);
			return <span data-value={props.id}>{value}</span>;
		}
	`,
		'/benchmarks/ssr-replay-streaming/child.tsx',
		{ mode: 'server', hmr: false },
	).code;
	async function bundle(observed) {
		const outfile = path.join(temporary, `${label}-${observed ? 'observed' : 'clean'}.mjs`);
		await build({
			stdin: {
				contents: `export * from 'octane/server';\n${compiled}`,
				loader: 'js',
				resolveDir: repo,
			},
			outfile,
			bundle: true,
			format: 'esm',
			platform: 'node',
			minify: true,
			nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
			define: { 'process.env.NODE_ENV': '"production"' },
			plugins: [
				{
					name: 'streaming-recorder-runtime',
					setup(builder) {
						builder.onResolve(
							{ filter: /^octane\/(?:server|internal\/server)$/ },
							({ path: name }) => ({
								path: path.join(
									sourceRoot,
									name === 'octane/server'
										? 'packages/octane/src/server/index.ts'
										: 'packages/octane/src/internal/server.ts',
								),
							}),
						);
						if (observed)
							builder.onLoad({ filter: /[/\\]runtime\.server\.ts$/ }, () => ({
								contents: instrumentStreamingRecorders(source, counter),
								loader: 'ts',
								resolveDir: path.dirname(runtimePath),
							}));
					},
				},
			],
		});
		const bytes = readFileSync(outfile);
		return {
			runtime: await import(pathToFileURL(outfile).href),
			bytes: bytes.length,
			hash: sha256(bytes),
		};
	}
	const clean = await bundle(false);
	const observed = await bundle(true);
	const cases = {};
	for (const mode of ['compiled', 'plain']) {
		for (const size of [0, 1, 8, 32]) {
			for (const group of new Set([1, Math.max(1, size)])) {
				const expected = await measureStreamingRecorders(clean.runtime, size, group, mode);
				globalThis[counter] = { recorders: 0, raceSubscriptions: 0 };
				const actual = await measureStreamingRecorders(observed.runtime, size, group, mode);
				assert.deepEqual(actual, expected, 'observer preserves output and public subscriptions');
				const entry = { ...actual, ...globalThis[counter] };

				cases[
					`stream-${mode === 'plain' ? 'plain-' : ''}${size}-${group === 1 && size > 1 ? 'waves' : 'onewave'}`
				] = entry;
			}
		}
	}
	return {
		sourceHash: sha256(source),
		fixtureHash: sha256(compiled),
		bundleHash: clean.hash,
		bundleBytes: clean.bytes,
		cases,
	};
}

async function main() {
	process.env.NODE_ENV = 'production';
	const temporary = mkdtempSync(path.join(tmpdir(), 'octane-streaming-recorders-'));
	try {
		const sourceRoot = process.env.SSR_SOURCE_ROOT ?? repo;
		const result = {
			suite: 'ssr-replay-streaming',
			iterations: 1,
			metric: 'pending recorder starts and promise subscriptions',
			node: process.version,
			v8: process.versions.v8,
			platform: process.platform,
			architecture: process.arch,
			lockfileHash: sha256(readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
			candidate: await measure(sourceRoot, 'candidate', temporary),
		};
		if (process.env.SSR_BASELINE_ROOT) {
			result.baseline = await measure(process.env.SSR_BASELINE_ROOT, 'baseline', temporary);
			for (const [name, candidate] of Object.entries(result.candidate.cases)) {
				assert.deepEqual(
					candidate.semantic,
					result.baseline.cases[name].semantic,
					`${name}: baseline output matches`,
				);
				if (name.endsWith('-onewave')) {
					assert.equal(
						candidate.subscriptions,
						result.baseline.cases[name].subscriptions,
						'one-wave public subscription control stays equal',
					);
					assert.equal(
						candidate.recorders,
						result.baseline.cases[name].recorders,
						'one-wave recorder control stays equal',
					);
				}
			}
		}
		result.targets = Object.entries(result.candidate.cases).map(([name, entry]) => ({
			name,
			ops: Object.fromEntries(
				['recorders', 'subscriptions', 'raceSubscriptions'].map((metric) => [
					metric,
					deterministicStatForJson(deterministicCount(entry[metric])),
				]),
			),
			meta: entry.semantic,
		}));
		for (const size of [8, 32])
			result.targets.push({
				name: `stream-budget-${size}`,
				ops: Object.fromEntries(
					['recorders', 'subscriptions', 'raceSubscriptions'].map((metric) => [
						metric,
						deterministicStatForJson(deterministicCount(size)),
					]),
				),
			});
		console.log(JSON.stringify(result, null, 2));
		if (process.env.BENCH_JSON)
			writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
	} finally {
		delete globalThis[counter];
		rmSync(temporary, { recursive: true, force: true });
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
	await main();
