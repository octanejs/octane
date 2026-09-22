// Paired syntax sentinels stay outside the fixed corpus. A key on the first
// intrinsic row root already supplies the row's reconciliation identity; its
// production output should cost no more than the equivalent header key.
import { compile } from 'octane/compiler';
import { build, transformSync } from 'esbuild';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants as zc, gzipSync } from 'node:zlib';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FILENAME = path.join(DIR, 'for-root-key.tsrx');
const REQUEST = './for-root-key.tsrx';
const fixture = (header, root) => `export function Rows(props) @{
	<section>
		<header>before</header>
		<ul>
			@for (const row of props.rows${header}) {
				<li${root} data-id={row.id}><span>{row.label as string}</span></li>
			} @empty {
				<li>empty</li>
			}
		</ul>
		<footer>after</footer>
	</section>
}`;
const SOURCES = {
	control: fixture("; key row.id + 'video'", ''),
	legacy: fixture('', " key={row.id + 'video'}"),
	'with-header': fixture('; key row.id', " key={row.id + 'video'}"),
};
const INPUTS = [
	{
		props: {
			rows: [
				{ id: 'a', label: 'Alpha' },
				{ id: 'b', label: 'Beta' },
			],
		},
		html: '<section><header>before</header><ul><li data-id="a"><span>Alpha</span></li><li data-id="b"><span>Beta</span></li></ul><footer>after</footer></section>',
	},
	{
		props: { rows: [] },
		html: '<section><header>before</header><ul><li>empty</li></ul><footer>after</footer></section>',
	},
	{
		props: { rows: [{ id: 'a"<&', label: 'Row <A> & "B"' }] },
		html: '<section><header>before</header><ul><li data-id="a&quot;<&amp;"><span>Row &lt;A&gt; &amp; "B"</span></li></ul><footer>after</footer></section>',
	},
];
const val = (bytes) => ({ median: bytes, min: bytes, samples: 1 });
const bytes = (value) => Buffer.byteLength(value);
const canonicalHtml = (html) => html.replace(/<!--[\s\S]*?-->/g, '');
const compileFixture = (source, mode) =>
	compile(source, FILENAME, { mode, hmr: false, dev: false }).code;

async function renderFixture(source) {
	const result = await build({
		stdin: {
			contents: `import { renderToString } from 'octane/server';
import { Rows } from ${JSON.stringify(REQUEST)};
export async function render(props) { return (await renderToString(Rows, props)).html; }`,
			loader: 'js',
			resolveDir: DIR,
			sourcefile: 'for-root-key-entry.js',
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
				name: 'for-root-key-semantic-control',
				setup(bundler) {
					bundler.onResolve({ filter: /^\.\/for-root-key\.tsrx$/ }, () => ({
						path: FILENAME,
						namespace: 'for-root-key-component',
					}));
					bundler.onLoad({ filter: /.*/, namespace: 'for-root-key-component' }, () => ({
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
	const rendered = [];
	for (const { props, html } of INPUTS) {
		const actual = canonicalHtml(await module.render(props));
		assert.equal(actual, html, 'row keys must retain rows, escaping, empty content, and siblings');
		rendered.push(actual);
	}
	return rendered;
}

export async function measureForRootKeys() {
	const targets = [];
	const summary = {};
	let controlHtml;
	for (const [name, source] of Object.entries(SOURCES)) {
		const code = compileFixture(source, 'client');
		assert.match(code, /\btemplate\b/, `${name} rows must retain native templates`);
		assert.doesNotMatch(
			code,
			/\b(?:createElement(?:NS)?|createScopedElement)\b/,
			`${name} rows must avoid descriptor creation`,
		);
		const minified = transformSync(code, { loader: 'js', minify: true }).code;
		const measured = {
			raw: bytes(code),
			minified: bytes(minified),
			gzip: gzipSync(Buffer.from(minified), { level: zc.Z_BEST_COMPRESSION }).length,
		};
		const html = await renderFixture(source);
		if (controlHtml === undefined) controlHtml = html;
		else
			assert.deepEqual(html, controlHtml, 'equivalent effective row keys must render identically');
		const semanticChecksum = createHash('sha256').update(JSON.stringify(html)).digest('hex');
		summary[name] = measured;
		targets.push({
			name: `for-root-key-${name}`,
			ops: Object.fromEntries(Object.entries(measured).map(([op, size]) => [op, val(size)])),
			meta: { semanticChecksum, semanticCases: INPUTS.length },
		});
	}
	return { targets, summary };
}
