// Closed static arms may use the existing control-flow body directly. Keep a
// stateful control beside the byte measurements so that its component owner
// cannot disappear in pursuit of smaller output.
import { compile } from 'octane/compiler';
import { build, transformSync } from 'esbuild';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants as zc, gzipSync } from 'node:zlib';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FILENAME = path.join(DIR, 'static-component-arms.tsrx');
const REQUEST = './static-component-arms.tsrx';
const STATIC = 'function Child() @{ <section><span>fixed</span></section> }';
const SOURCES = [
	{
		name: 'if',
		source: `${STATIC}\nexport function App(props) @{ <main>@if (props.show) { <Child /> }</main> }`,
		direct: 1,
		html: ['<main><section><span>fixed</span></section></main>', '<main></main>'],
	},
	{
		name: 'switch',
		source: `${STATIC}\nexport function App(props) @{ <main>@switch (props.show) { @case true: { <Child /> } @default: { <Child /> } }</main> }`,
		direct: 2,
		html: Array(2).fill('<main><section><span>fixed</span></section></main>'),
	},
	{
		name: 'hook-control',
		source: `import { useState } from 'octane';
function Child() @{ const [count, setCount] = useState(0); <section><button onClick={() => setCount(count + 1)}>{count as number}</button></section> }
export function App(props) @{ <main>@if (props.show) { <Child /> }</main> }`,
		direct: 0,
		html: ['<main><section><button>0</button></section></main>', '<main></main>'],
	},
];
const val = (bytes) => ({ median: bytes, min: bytes, samples: 1 });
const compileFixture = (source, mode) =>
	compile(source, FILENAME, { mode, hmr: false, dev: false }).code;

function activation(code, expected) {
	const ast = ts.createSourceFile(
		FILENAME + '.js',
		code,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.JS,
	);
	assert.equal(ast.parseDiagnostics.length, 0);
	const aliases = new Map();
	for (const statement of ast.statements) {
		const bindings = statement.importClause?.namedBindings;
		if (bindings && ts.isNamedImports(bindings)) {
			for (const item of bindings.elements)
				aliases.set(item.name.text, (item.propertyName ?? item.name).text);
		}
	}
	const child = (node) => node && ts.isIdentifier(node) && node.text === 'Child';
	let direct = 0;
	let childSlots = 0;
	const walk = (node) => {
		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			const helper = aliases.get(node.expression.text);
			const args = node.arguments;
			if (helper === 'ifBlock' && child(args[4])) {
				direct++;
				assert((Number(args[8]?.getText(ast)) & 1) !== 0, 'Static if body remains Lite');
			}
			if (helper === 'switchBlock') {
				assert(ts.isArrayLiteralExpression(args[4]));
				const lite = Number(args[8]?.getText(ast));
				args[4].elements.forEach((pair, index) => {
					assert(ts.isArrayLiteralExpression(pair));
					if (child(pair.elements[1])) {
						direct++;
						assert((lite & (2 << index)) !== 0, 'Static case remains Lite');
					}
				});
				if (child(args[5])) {
					direct++;
					assert((lite & 1) !== 0, 'Static default remains Lite');
				}
			}
			if (
				['componentSlot', 'componentSlotLite', 'componentSlotVoid'].includes(helper) &&
				child(args[3])
			)
				childSlots++;
		}
		ts.forEachChild(node, walk);
	};
	walk(ast);
	assert.equal(direct, expected);
	assert.equal(childSlots, expected ? 0 : 1, 'Hookful control keeps its component call');
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		ts.LanguageVariant.Standard,
		code,
	);
	const comments = [];
	for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
		if (token === ts.SyntaxKind.MultiLineCommentTrivia) comments.push(scanner.getTokenText());
	}
	for (const marker of ['START', 'END'])
		assert.equal(
			comments.filter((text) => text.includes(`${marker} shared static component arm:`)).length,
			expected ? 1 : 0,
		);
	return { directArms: direct, childSlots };
}

// Same public SSR bundling pattern as the neighboring for-root-key sentinel.
async function renderFixture(source) {
	const result = await build({
		stdin: {
			contents: `import { renderToString } from 'octane/server';
import { App } from ${JSON.stringify(REQUEST)};
export async function render(props) { return (await renderToString(App, props)).html; }`,
			loader: 'js',
			resolveDir: DIR,
			sourcefile: 'static-component-arms-entry.js',
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'node',
		target: 'es2022',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"' },
		plugins: [
			{
				name: 'static-component-arms-semantic-control',
				setup(bundler) {
					bundler.onResolve({ filter: /^\.\/static-component-arms\.tsrx$/ }, () => ({
						path: FILENAME,
						namespace: 'static-component-arms',
					}));
					bundler.onLoad({ filter: /.*/, namespace: 'static-component-arms' }, () => ({
						contents: compileFixture(source, 'server'),
						loader: 'js',
						resolveDir: DIR,
					}));
				},
			},
		],
	});
	const module = await import(
		`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
	);
	const html = [];
	for (const show of [true, false])
		html.push((await module.render({ show })).replace(/<!--[\s\S]*?-->/g, ''));
	return html;
}

export async function measureStaticComponentArms() {
	const targets = [],
		summary = {};
	for (const fixture of SOURCES) {
		const code = compileFixture(fixture.source, 'client');
		const observed = activation(code, fixture.direct);
		const minified = transformSync(code, { loader: 'js', minify: true }).code;
		const measured = {
			raw: Buffer.byteLength(code),
			minified: Buffer.byteLength(minified),
			gzip: gzipSync(Buffer.from(minified), { level: zc.Z_BEST_COMPRESSION }).length,
		};
		const html = await renderFixture(fixture.source);
		assert.deepEqual(html, fixture.html, 'Visible branch output must remain correct');
		const semanticChecksum = createHash('sha256').update(JSON.stringify(html)).digest('hex');
		summary[fixture.name] = measured;
		targets.push({
			name: `static-component-arm-${fixture.name}`,
			ops: Object.fromEntries(Object.entries(measured).map(([op, size]) => [op, val(size)])),
			meta: { ...observed, semanticChecksum, semanticCases: html.length },
		});
	}
	return { targets, summary };
}
