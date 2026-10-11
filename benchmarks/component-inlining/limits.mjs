import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { analyzeCompiledOutput } from '../tsrx-component-graph/output.mjs';

const { values } = parseArgs({
	options: {
		base: { type: 'string' },
		candidate: { type: 'string', default: '.' },
		out: { type: 'string' },
	},
});
assert(values.base && values.out, 'Pass --base, --candidate and --out');
const out = path.resolve(values.out);
assert(!fs.existsSync(out), 'Use a new output directory');
fs.mkdirSync(out, { recursive: true });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(file));
const options = { mode: 'client', dev: false, hmr: false, autoMemo: true };
const large = 'L'.repeat(9000);
const repeated = 'R'.repeat(200);
const cards = Array.from(
	{ length: 8 },
	(_, index) => `function Card${index}() @{ <section id="card-${index}"><Leaf /></section> }`,
);
const scenarios = [
	{
		id: 'large-leaf-distinct-parents',
		payload: large,
		parentCount: 8,
		leafOccurrences: 8,
		source: `function Leaf() @{ <span>${large}</span> }\n${cards.join('\n')}\nexport function App() @{ <main>${cards.map((_, index) => `<Card${index} />`).join('')}</main> }`,
	},
	{
		id: 'cumulative-leaf-siblings',
		payload: repeated,
		parentCount: 1,
		leafOccurrences: 64,
		source: `function Leaf() @{ <span>${repeated}</span> }\nfunction Card() @{ <section>${'<Leaf />'.repeat(64)}</section> }\nexport function App() @{ <main><Card /></main> }`,
	},
];
const receipt = {
	status: 'running',
	node: process.version,
	options,
	analyzerSHA256: fileHash(
		fileURLToPath(new URL('../tsrx-component-graph/output.mjs', import.meta.url)),
	),
	variants: {},
	scenarios: [],
};
const save = () =>
	fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
try {
	const compilers = {};
	for (const variant of ['base', 'candidate']) {
		const root = fs.realpathSync(values[variant]);
		const directory = path.join(root, 'packages/octane/src/compiler');
		const require = createRequire(path.join(root, 'packages/octane/package.json'));
		const parser = require.resolve('@tsrx/core');
		const inputs = Object.fromEntries(
			['index.js', 'compile.js', 'local-template-fusion.js']
				.filter((file) => fs.existsSync(path.join(directory, file)))
				.map((file) => [path.join(directory, file), fileHash(path.join(directory, file))]),
		);
		receipt.variants[variant] = { root, inputs, parser, parserSHA256: fileHash(parser) };
		const { compile } = await import(pathToFileURL(path.join(directory, 'index.js')).href);
		const { parseModule } = await import(pathToFileURL(parser).href);
		compilers[variant] = { compile, parseModule };
	}
	for (const scenario of scenarios) {
		fs.writeFileSync(path.join(out, scenario.id + '.tsrx'), scenario.source);
		const row = {
			id: scenario.id,
			sourceSHA256: hash(scenario.source),
			parentCount: scenario.parentCount,
			leafOccurrences: scenario.leafOccurrences,
			payloadCodeUnits: scenario.payload.length,
			payloadSHA256: hash(scenario.payload),
			variants: {},
		};
		const code = {};
		for (const variant of ['base', 'candidate']) {
			const { compile, parseModule } = compilers[variant];
			const result = compile(scenario.source, scenario.id + '.tsrx', options);
			fs.writeFileSync(path.join(out, `${scenario.id}.${variant}.js`), result.code);
			assert.deepEqual(result.diagnostics, [], `${scenario.id}/${variant} diagnostics`);
			const { templates } = analyzeCompiledOutput(parseModule, result.code, scenario.id + '.js');
			const payloadCopies = templates.reduce(
				(sum, template) => sum + template.split(scenario.payload).length - 1,
				0,
			);
			row.variants[variant] = {
				compiledSHA256: hash(result.code),
				compiledBytes: Buffer.byteLength(result.code),
				templateCount: templates.length,
				templateBytes: templates.reduce((sum, template) => sum + Buffer.byteLength(template), 0),
				payloadCopies,
				payloadPreserved: payloadCopies > 0,
			};
			code[variant] = result.code;
		}
		row.compiledCodeIdentical = code.base === code.candidate;
		receipt.scenarios.push(row);
		save();
		assert.equal(row.variants.base.payloadCopies, 1, 'Baseline keeps a single shared leaf payload');
		assert.equal(
			row.variants.candidate.payloadCopies,
			1,
			'Candidate preserves the shared payload without duplication',
		);
		assert(
			row.variants.candidate.templateBytes <= row.variants.base.templateBytes,
			'Expanded payload must not amplify template bytes',
		);
	}
	receipt.status = 'passed';
} catch (error) {
	receipt.status = 'failed';
	receipt.error = error.stack;
	throw error;
} finally {
	try {
		for (const variant of Object.values(receipt.variants)) {
			for (const [file, expected] of Object.entries(variant.inputs))
				assert.equal(fileHash(file), expected, 'Compiler changed during control');
			assert.equal(fileHash(variant.parser), variant.parserSHA256);
		}
	} catch (error) {
		receipt.status = 'failed';
		receipt.postflightError = error.stack;
		throw error;
	} finally {
		save();
	}
}
console.log(JSON.stringify(receipt.scenarios));
