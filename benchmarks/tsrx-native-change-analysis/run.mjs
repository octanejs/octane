import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEWS = path.resolve(HERE, '../news');
const octaneRequire = createRequire(path.join(NEWS, 'octane-tsrx', 'package.json'));
const compilerPath = octaneRequire.resolve('octane/compiler');
const compilerRequire = createRequire(compilerPath);
const { __analyzeNativeChangeDiagnostics, compile } = await import(
	pathToFileURL(compilerPath).href
);
const { parseModule } = await import(pathToFileURL(compilerRequire.resolve('@tsrx/core')).href);
const iterations = Number.parseInt(process.argv[2] ?? '7', 10);
const COUNTS = [500, 4_000];

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSRX native-change analysis iterations must be a positive integer');
}

function sourceFor(count, forcedScan) {
	const marker = forcedScan ? '<input' : '<panel';
	const sites = Array.from(
		{ length: count },
		(_, index) => `<section data-index="${index}"><span>site ${index}</span></section>`,
	).join('');
	return `export function App() @{ <main>{/* ${marker} */}${sites}</main> }`;
}

function digest(value) {
	return createHash('sha256').update(value).digest('hex');
}

function normalizedAstJson(ast) {
	return JSON.stringify(ast, function normalizeMarkerComment(key, value) {
		return this?.type === 'Block' && key === 'value' ? '<marker>' : value;
	});
}

const cases = [
	{ name: 'hostless-500', count: COUNTS[0], forcedScan: false },
	{ name: 'hostless-4000', count: COUNTS[1], forcedScan: false },
	{ name: 'forced-scan-4000', count: COUNTS[1], forcedScan: true },
].map((entry) => {
	const source = sourceFor(entry.count, entry.forcedScan);
	return {
		...entry,
		source,
		ast: parseModule(source, `native-change-${entry.count}.tsrx`),
	};
});

const largeTarget = cases[1];
const forcedControl = cases[2];
if (
	Buffer.byteLength(largeTarget.source) !== Buffer.byteLength(forcedControl.source) ||
	normalizedAstJson(largeTarget.ast) !== normalizedAstJson(forcedControl.ast)
) {
	throw new Error(
		'large hostless and forced-scan fixtures must have identical bytes and normalized ASTs',
	);
}

const samples = new Map(
	cases.map((entry) => [entry.name, { analysis: [], client_compile: [], server_compile: [] }]),
);
const outputs = new Map();
let failure;

function analyze(entry) {
	const started = performance.now();
	const result = __analyzeNativeChangeDiagnostics(
		entry.ast,
		entry.source,
		`native-change-${entry.count}.tsrx`,
	);
	const elapsed = performance.now() - started;
	if (result.diagnostics.length !== 0 || result.classifications.size !== 0) {
		throw new Error(`${entry.name} produced native-change analysis output`);
	}
	return elapsed;
}

function compileCase(entry, mode) {
	const started = performance.now();
	const result = compile(entry.source, `native-change-${entry.count}.tsrx`, {
		dev: true,
		hmr: false,
		mode,
	});
	const elapsed = performance.now() - started;
	if (result.diagnostics.length !== 0) {
		throw new Error(`${entry.name}/${mode} produced compiler diagnostics`);
	}
	const key = `${entry.name}/${mode}`;
	const codeDigest = digest(result.code);
	const previous = outputs.get(key);
	if (previous !== undefined && previous !== codeDigest) {
		throw new Error(`${key} emitted unstable output`);
	}
	outputs.set(key, codeDigest);
	return elapsed;
}

try {
	for (const entry of cases) {
		analyze(entry);
		compileCase(entry, 'client');
		compileCase(entry, 'server');
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		const orderedCases = iteration % 2 === 0 ? cases : [...cases].reverse();
		const modes = iteration % 2 === 0 ? ['client', 'server'] : ['server', 'client'];
		for (const entry of orderedCases) {
			const entrySamples = samples.get(entry.name);
			entrySamples.analysis.push(analyze(entry));
			for (const mode of modes) {
				entrySamples[`${mode}_compile`].push(compileCase(entry, mode));
			}
		}
	}

	for (const mode of ['client', 'server']) {
		if (outputs.get(`hostless-4000/${mode}`) !== outputs.get(`forced-scan-4000/${mode}`)) {
			throw new Error(`large hostless and forced-scan ${mode} output differs`);
		}
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-native-change-analysis/${failure}`);
}

const rows = failure
	? []
	: cases.map((entry) => {
			const raw = samples.get(entry.name);
			return {
				name: entry.name,
				ops: {
					analysis: timingStatForJson(summarizeSamples(raw.analysis)),
					analysis_per_1000_sites: timingStatForJson(
						summarizeSamples(raw.analysis.map((elapsed) => (elapsed * 1_000) / entry.count)),
					),
					client_compile: timingStatForJson(summarizeSamples(raw.client_compile)),
					server_compile: timingStatForJson(summarizeSamples(raw.server_compile)),
				},
				meta: {
					authoredSites: entry.count,
					forcedScan: entry.forcedScan,
					sourceBytes: Buffer.byteLength(entry.source),
					astDigest: digest(normalizedAstJson(entry.ast)),
					clientDigest: outputs.get(`${entry.name}/client`),
					serverDigest: outputs.get(`${entry.name}/server`),
					correctness: 'pass',
				},
			};
		});

for (const row of rows) {
	console.log(
		`PASS tsrx-native-change-analysis/${row.name}: ` +
			`${row.ops.analysis.score.toFixed(3)}ms analysis, ` +
			`${row.ops.client_compile.score.toFixed(3)}ms client, ` +
			`${row.ops.server_compile.score.toFixed(3)}ms server`,
	);
}

const payload = {
	suite: 'tsrx-native-change-analysis',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
