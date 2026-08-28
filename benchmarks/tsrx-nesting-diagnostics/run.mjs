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
const { compile } = await import(pathToFileURL(compilerPath).href);
const { parseModule } = await import(pathToFileURL(compilerRequire.resolve('@tsrx/core')).href);
const iterations = Number.parseInt(process.argv[2] ?? '9', 10);
const COUNTS = [500, 2_000];

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('TSRX nesting diagnostic iterations must be a positive integer');
}

function sourceFor(count) {
	const invalidSites = Array.from(
		{ length: count },
		(_, index) => `<p><div data-index="${index}">invalid</div></p>`,
	).join('');
	return `export function Invalid() @{ <main>${invalidSites}</main> }`;
}

const SOURCES = new Map(COUNTS.map((count) => [count, sourceFor(count)]));

function walkAst(node, visit) {
	if (node === null || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walkAst(child, visit);
		return;
	}
	if (typeof node.type !== 'string') return;
	visit(node);
	for (const value of Object.values(node)) {
		if (Array.isArray(value) || (value && typeof value === 'object' && 'type' in value)) {
			walkAst(value, visit);
		}
	}
}

function validateDiagnostics(code, count) {
	const ast = parseModule(code, 'compiled.js');
	let diagnosticBinding = null;
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source?.value !== 'octane') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === 'ImportSpecifier' && specifier.imported?.name === 'devHtmlNesting') {
				diagnosticBinding = specifier.local.name;
			}
		}
	}
	if (diagnosticBinding === null) throw new Error('compiled module omitted devHtmlNesting');

	let diagnostics = 0;
	let previousColumn = -1;
	walkAst(ast, (node) => {
		if (
			node.type !== 'CallExpression' ||
			node.callee?.type !== 'Identifier' ||
			node.callee.name !== diagnosticBinding
		)
			return;
		const [child, ancestors, location] = node.arguments;
		const locationValue = location?.value;
		const column = Number.parseInt(String(locationValue).split(':').at(-1), 10);
		const expectedChild = diagnostics === 0 ? 'main' : 'div';
		const expectedAncestor = diagnostics === 0 ? undefined : 'p';
		if (
			child?.value !== expectedChild ||
			ancestors?.elements?.length !== (diagnostics === 0 ? 0 : 1) ||
			ancestors.elements[0]?.value !== expectedAncestor ||
			!Number.isSafeInteger(column) ||
			column <= previousColumn
		) {
			throw new Error(`diagnostic ${diagnostics} lost its authored relationship or order`);
		}
		previousColumn = column;
		diagnostics++;
	});
	if (diagnostics !== count + 1) {
		throw new Error(`expected ${count + 1} nesting diagnostics, received ${diagnostics}`);
	}
}

function compileSites(count) {
	const source = SOURCES.get(count);
	const started = performance.now();
	const code = compile(source, `nesting-${count}.tsrx`, {
		dev: true,
		hmr: false,
	}).code;
	const elapsed = performance.now() - started;
	validateDiagnostics(code, count);
	return elapsed;
}

const samples = new Map(COUNTS.map((count) => [count, []]));
const rows = [];
let failure;

try {
	for (const count of COUNTS) compileSites(count);
	for (let iteration = 0; iteration < iterations; iteration++) {
		const order = iteration % 2 === 0 ? COUNTS : [...COUNTS].reverse();
		for (const count of order) samples.get(count).push(compileSites(count));
	}

	for (const count of COUNTS) {
		const raw = samples.get(count);
		rows.push({
			name: `sites-${count}`,
			ops: {
				compile: timingStatForJson(summarizeSamples(raw)),
				compile_per_1000_sites: timingStatForJson(
					summarizeSamples(raw.map((elapsed) => (elapsed * 1_000) / count)),
				),
			},
			meta: { invalidSites: count, validationCalls: count + 1, correctness: 'pass' },
		});
	}

	for (const row of rows) {
		console.log(
			`PASS tsrx-nesting-diagnostics/${row.name}: ${row.ops.compile.score.toFixed(3)}ms ` +
				`(${row.ops.compile_per_1000_sites.score.toFixed(3)}ms/1k invalid sites)`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL tsrx-nesting-diagnostics/${failure}`);
}

const payload = {
	suite: 'tsrx-nesting-diagnostics',
	iterations,
	targets: rows,
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
