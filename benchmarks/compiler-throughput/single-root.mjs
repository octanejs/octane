import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashOctaneSources, octanePackageAt, parseOptions } from '../activity/harness.mjs';
import { pairedRatio, summarizeSamples } from '../lib/stats.mjs';

const options = parseOptions(process.argv.slice(2), { iterations: true });
assert.ok(options.revision, 'Pass --octane-revision=<baseline commit>');
assert.ok(options.iterations >= 2, 'A paired comparison needs at least two samples');
const sources = [octanePackageAt(options.revision), octanePackageAt()];
const sourceHashes = sources.map(({ packageRoot }) => hashOctaneSources(packageRoot));
const compilers = await Promise.all(
	sources.map(
		async ({ packageRoot }) =>
			(await import(pathToFileURL(path.join(packageRoot, 'src/compiler/index.js')))).compile,
	),
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const compileOptions = { mode: 'client', hmr: false, dev: false, autoMemo: false };
const filename = '/benchmark/SingleRoot.tsrx';

function chain(count, reverse = false, safe = true) {
	const declarations = Array.from({ length: count }, (_, index) => {
		const body =
			index === count - 1
				? safe
					? '<span>{p.value as string}</span>'
					: '@if (p.on) { <span/> }'
				: `@if (p.on) { <Chain${index + 1} on={p.on} value={p.value}/> } @else { <div/> }`;
		return `function Chain${index}(p) @{ ${body} }`;
	});
	if (reverse) declarations.reverse();
	return (
		declarations.join('\n') +
		'\nexport function App(p) @{ <main><Chain0 on={p.on} value={p.value}/><b/></main> }'
	);
}

function wide(count) {
	return (
		Array.from(
			{ length: count },
			(_, index) => `function Arm${index}(p) @{ @if (p.on) { <Leaf/> } @else { <i/> } }`,
		).join('\n') +
		'\nfunction Leaf() @{ <b/> } export function App(p) @{ <main><Arm0 on={p.on}/><i/></main> }'
	);
}

const controls = [
	chain(7),
	chain(7, true),
	chain(7, false, false),
	wide(7),
	'function A(p) @{ @if (p.n) { <B n={p.n - 1}/> } @else { <b/> } } function B(p) @{ @if (p.n) { <A n={p.n - 1}/> } @else { <i/> } } export function App(p) @{ <main><A n={p.n}/></main> }',
	'function A(p) @{ @switch (p.n) { @case 1: { <B/> } @case 2: { <B/> } @default: { <B/> } } } function B() @{ <b/> } export function App(p) @{ <main><A n={p.n}/></main> }',
	'function A(p) @{ @if (p.on) { <B/> } @else { <C/> } } function B() @{ <b/> } function C() @{ <><b/><i/></> } export function App(p) @{ <main><A on={p.on}/></main> }',
];
let comparisons = 0;
for (const mode of [
	compileOptions,
	{ ...compileOptions, dev: true, hmr: 'vite' },
	{ ...compileOptions, mode: 'server' },
]) {
	for (const source of controls) {
		assert.deepEqual(compilers[1](source, filename, mode), compilers[0](source, filename, mode));
		comparisons++;
	}
}

const cases = [
	{
		name: 'single-component',
		size: 1,
		source: 'export function App(p) @{ <main>{p.value as string}</main> }',
	},
	...[10, 100, 1000, 5000].flatMap((size) => [
		{ name: 'forward-chain', size, source: chain(size) },
		{ name: 'reverse-chain', size, source: chain(size, true) },
	]),
	{ name: 'wide', size: 1000, source: wide(1000) },
];
const report = {
	suite: 'compiler-single-root',
	baseline: sources[0].revision,
	candidate: sources[1].revision,
	sourceHashes,
	harnessHash: hash(fs.readFileSync(new URL(import.meta.url))),
	lockfileHash: hash(fs.readFileSync(new URL('../../pnpm-lock.yaml', import.meta.url))),
	node: process.version,
	v8: process.versions.v8,
	cpu: os.cpus()[0].model,
	platform: process.platform,
	comparisons,
	warmups: 3,
	iterations: options.iterations,
	results: [],
};
for (const test of cases) {
	const repeats = Math.max(1, Math.floor(100 / test.size));
	const samples = [[], []];
	let outputHash;
	for (let iteration = -report.warmups; iteration < options.iterations; iteration++) {
		for (const variant of iteration % 2 === 0 ? [0, 1] : [1, 0]) {
			const started = performance.now();
			let result;
			for (let repeat = 0; repeat < repeats; repeat++) {
				result = compilers[variant](test.source, filename, compileOptions);
			}
			const elapsed = (performance.now() - started) / repeats;
			assert.equal(result.diagnostics.length, 0);
			const digest = hash(JSON.stringify(result));
			outputHash ??= digest;
			assert.equal(digest, outputHash, `${test.name}/${test.size}: complete compile result`);
			if (iteration >= 0) samples[variant].push(elapsed);
		}
	}
	const row = {
		name: test.name,
		size: test.size,
		repeats,
		outputHash,
		samples,
		baseline: summarizeSamples(samples[0]),
		candidate: summarizeSamples(samples[1]),
		paired: pairedRatio(samples[0], samples[1]),
	};
	report.results.push(row);
	console.log(
		JSON.stringify({
			name: row.name,
			size: row.size,
			baselineMs: row.baseline.median,
			candidateMs: row.candidate.median,
			paired: row.paired,
		}),
	);
}
assert.deepEqual(
	sources.map(({ packageRoot }) => hashOctaneSources(packageRoot)),
	sourceHashes,
);
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
