// SSR compiler output work and size gate. Timed bundles are uninstrumented.
// OCTANE_SOURCE_ROOT selects a frozen packages/octane directory for comparison.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, transformSync } from 'esbuild';
import { parseSync } from '@babel/core';

const parse = (code) => parseSync(code, { configFile: false, babelrc: false });

const root = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(
	process.env.OCTANE_SOURCE_ROOT ?? path.join(root, 'packages/octane'),
);
const { compile } = await import(pathToFileURL(path.join(sourceRoot, 'src/compiler/compile.js')));
const output = path.join(import.meta.dirname, 'dist/server-output');
fs.mkdirSync(output, { recursive: true });
const seconds = Number(process.argv[2] ?? 2);
const rows = 1000;
const source = `
export function Page(props) @{
  <ul>
    @for (const row of props.rows; key props.key(row)) {
      props.visit(row);
      <li data-id={row.id}>{row.label as string}</li>
    }
  </ul>
}`;
const compiled = compile(source, 'server-output.tsrx', { mode: 'server', dev: false }).code;
const ast = parse(compiled);
let perItemArrows = 0;
let totalArrows = 0;
function walk(node, insideLoop = false) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const child of node) walk(child, insideLoop);
		return;
	}
	if (node.type === 'ArrowFunctionExpression') {
		totalArrows++;
		if (insideLoop) perItemArrows++;
	}
	for (const [key, child] of Object.entries(node)) {
		if (key !== 'loc') walk(child, insideLoop || node.type === 'ForStatement');
	}
}
walk(ast);
const single = compile(
	'export function Single(p) @{ <div title={p.title}>body</div> }',
	'single.tsrx',
	{
		mode: 'server',
		dev: false,
	},
).code;
let singleIifes = 0;
function countIifes(node) {
	if (!node || typeof node !== 'object') return;
	if (node.type === 'CallExpression' && node.callee?.type === 'ArrowFunctionExpression')
		singleIifes++;
	for (const value of Object.values(node)) {
		if (Array.isArray(value)) value.forEach(countIifes);
		else countIifes(value);
	}
}
countIifes(parse(single));

const result = await build({
	stdin: {
		contents: `${compiled}\nimport { renderToString } from 'octane/server';
      const rows = Array.from({ length: ${rows} }, (_, index) => ({ id: String(index), label: 'row & ' + index }));
      let keys = 0, visits = 0;
      const props = { rows, key(row) { keys++; return row.id; }, visit() { visits++; } };
      export function renderPage() { keys = visits = 0; const result = renderToString(Page, props); return { ...result, keys, visits }; }`,
		resolveDir: root,
		sourcefile: 'server-output.mjs',
		loader: 'js',
	},
	write: false,
	bundle: true,
	platform: 'node',
	format: 'esm',
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"' },
	alias: {
		'octane/internal/server': path.join(sourceRoot, 'src/internal/server.ts'),
		'octane/server': path.join(sourceRoot, 'src/server/index.ts'),
		octane: path.join(sourceRoot, 'src/server/index.ts'),
	},
});
const bundled = result.outputFiles[0].text;
const bundlePath = path.join(output, 'entry.mjs');
fs.writeFileSync(bundlePath, bundled);
const { renderPage } = await import(pathToFileURL(bundlePath));
const first = renderPage();
assert.equal(first.keys, rows);
assert.equal(first.visits, rows);
assert.equal(first.css, '');
assert.deepEqual(
	[...first.html.matchAll(/data-id="([^"]+)"/g)].map((match) => match[1]),
	Array.from({ length: rows }, (_, index) => String(index)),
);
assert.equal(renderPage().html, first.html);
const htmlSha = createHash('sha256').update(first.html).digest('hex');
if (process.env.EXPECTED_HTML_SHA) assert.equal(htmlSha, process.env.EXPECTED_HTML_SHA);
if (process.env.EXPECT_ITEM_ARROWS)
	assert.equal(perItemArrows, Number(process.env.EXPECT_ITEM_ARROWS));
if (process.env.EXPECT_SINGLE_IIFES)
	assert.equal(singleIifes, Number(process.env.EXPECT_SINGLE_IIFES));
const warmUntil = performance.now() + 350;
while (performance.now() < warmUntil) Buffer.byteLength(renderPage().html);
const samples = [];
const until = performance.now() + seconds * 1000;
do {
	const start = performance.now();
	Buffer.byteLength(renderPage().html);
	samples.push(performance.now() - start);
} while (performance.now() < until);
samples.sort((a, b) => a - b);
const min = transformSync(compiled, { minify: true, loader: 'js' }).code;
const record = {
	node: process.version,
	platform: process.platform,
	arch: process.arch,
	sourceRoot,
	rows,
	htmlSha,
	htmlBytes: Buffer.byteLength(first.html),
	keys: first.keys,
	visits: first.visits,
	perItemArrows,
	totalArrows,
	singleIifes,
	codegen: {
		raw: Buffer.byteLength(compiled),
		minified: Buffer.byteLength(min),
		gzip: gzipSync(min).length,
	},
	bundle: { raw: Buffer.byteLength(bundled), gzip: gzipSync(bundled).length },
	samples: samples.length,
	medianMs: samples[Math.floor(samples.length / 2)],
	p95Ms: samples[Math.floor(samples.length * 0.95)],
};
console.log(JSON.stringify(record, null, 2));
const value = (median) => ({ median, min: median, samples: 1 });
const payload = {
	suite: 'compiler-output',
	iterations: 1,
	targets: [
		{
			name: 'ssr-reference',
			ops: { itemArrows: value(2), singleIifes: value(1) },
			meta: {
				description: 'Frozen baseline emitted expression sites; identical fixture and HTML.',
			},
		},
		{
			name: 'ssr-compiled',
			ops: {
				itemArrows: value(perItemArrows),
				singleIifes: value(singleIifes),
				raw: value(record.codegen.raw),
				minified: value(record.codegen.minified),
				gzip: value(record.codegen.gzip),
				bundleRaw: value(record.bundle.raw),
				bundleGzip: value(record.bundle.gzip),
				render: { median: record.medianMs, min: samples[0], samples: samples.length },
			},
			meta: record,
		},
	],
};
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
