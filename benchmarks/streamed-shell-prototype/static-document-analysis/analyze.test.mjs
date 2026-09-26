import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyze } from './analyze.mjs';

const file = path.resolve(import.meta.dirname, '../../../website-mcp/src/app/Landing.tsrx');
const source = fs.readFileSync(file, 'utf8');
const require = createRequire(
	path.resolve(import.meta.dirname, '../../../packages/octane/package.json'),
);
const { compile } = await import(pathToFileURL(require.resolve('octane/compiler')).href);
function change(from, to) {
	assert.equal(source.split(from).length, 2, `Expected one mutation site: ${from}`);
	return source.replace(from, to);
}

test('recognizes the real Landing and harmless comment and literal-text changes', () => {
	for (const candidate of [
		source,
		`${source}\n// Negative-control source drift.\n`,
		change('<h1>Octane MCP</h1>', '<h1>Octane MCP Explorer</h1>'),
		change(
			'Section-level full-text search over the official Octane docs.',
			'Search the official Octane docs.',
		),
		change('<h1>Octane MCP</h1>', '<h1>Octane MCP 😀</h1>'),
		change("'octane_docs_read'", "'\\uD83D\\uDE00'"),
	]) {
		assert.deepEqual(analyze(candidate, file), {
			accepted: true,
			component: 'Landing',
			arrays: 2,
			rows: 12,
			cssSha256: '1203ef2c7f2ee539b59a34f040e76cd497b9090b8dd781d8f4acb791e6fcc044',
		});
	}
});

test('compiler output illustrates the fixed-output gate for the accepted variations', () => {
	const comment = `${source}\n// Negative-control source drift.\n`;
	const differentText = change('<h1>Octane MCP</h1>', '<h1>Octane MCP Explorer</h1>');
	for (const mode of ['client', 'server']) {
		const baseline = compile(source, file, { mode });
		const withComment = compile(comment, file, { mode });
		const withDifferentText = compile(differentText, file, { mode });
		assert.deepEqual(baseline.diagnostics, []);
		assert.deepEqual(withComment.diagnostics, []);
		assert.deepEqual(withDifferentText.diagnostics, []);
		assert.equal(withComment.code, baseline.code);
		assert.notEqual(withDifferentText.code, baseline.code);
	}
});

const rejected = {
	'side-effect import': () => `import './side-effect.js';\n${source}`,
	'value import': () => `import { helper } from './helper.js';\n${source}`,
	'module directive': () => `"use client";\n${source}`,
	'top-level call': () => `console.log('effect');\n${source}`,
	'extra exported value': () => `${source}\nexport { TOOLS };`,
	'mutable module binding': () => change('const TOOLS = [', 'let TOOLS = ['),
	'builtin shadow': () => source.replaceAll('TOOLS', 'Array'),
	'generated parameter shadow': () => source.replaceAll('TOOLS', '__s'),
	'generated props shadow': () => source.replaceAll('TOOLS', '__props'),
	'generated local shadow': () => source.replaceAll('TOOLS', '__items'),
	'generated import shadow': () => source.replaceAll('TOOLS', '_$ssrHtml'),
	'data alias': () =>
		change('export function Landing()', 'const ALIAS = TOOLS;\nexport function Landing()'),
	'module data mutation': () =>
		change('export function Landing()', "TOOLS[0][0] = 'changed';\nexport function Landing()"),
	'duplicate literal keys': () => change("'octane_docs_read'", "'octane_docs_search'"),
	'array row hole': () =>
		change(
			"['octane_docs_read', 'Read one doc as markdown by slug.']",
			"[, 'Read one doc as markdown by slug.']",
		),
	'array spread': () => change('const TOOLS = [', 'const TOOLS = [...other,'),
	'nonliteral row value': () => change("'octane_docs_read'", 'getName()'),
	'isolated high surrogate in row': () => change("'octane_docs_read'", "'\\uD800'"),
	'isolated low surrogate in row': () => change("'octane_docs_read'", "'\\uDC00'"),
	'carriage return in row': () => change("'octane_docs_read'", "'a\\rb'"),
	'null in row': () => change("'octane_docs_read'", "'a\\0b'"),
	'control character in row': () => change("'octane_docs_read'", "'a\\u0080b'"),
	'isolated high surrogate in JSX text': () =>
		change('<h1>Octane MCP</h1>', `<h1>${String.fromCharCode(0xd800)}</h1>`),
	'isolated low surrogate in JSX text': () =>
		change('<h1>Octane MCP</h1>', `<h1>${String.fromCharCode(0xdc00)}</h1>`),
	'carriage-return entity in JSX text': () => change('<h1>Octane MCP</h1>', '<h1>&#13;</h1>'),
	'null entity in JSX text': () => change('<h1>Octane MCP</h1>', '<h1>&#0;</h1>'),
	'surrogate entity in JSX text': () => change('<h1>Octane MCP</h1>', '<h1>&#xD800;</h1>'),
	'astral entity in JSX text': () => change('<h1>Octane MCP</h1>', '<h1>&#x1F600;</h1>'),
	'carriage return in JSX text': () => change('<h1>Octane MCP</h1>', '<h1>Octane\rMCP</h1>'),
	'initial newline in pre': () =>
		change(
			'<pre>claude mcp add --transport http octane https://mcp.octanejs.dev/v1/mcp</pre>',
			'<pre>\nclaude mcp add --transport http octane https://mcp.octanejs.dev/v1/mcp</pre>',
		),
	'declare component': () =>
		change('export function Landing()', 'export declare function Landing()'),
	'declare array': () => change('const TOOLS = [', 'declare const TOOLS = ['),
	'function props': () => change('function Landing()', 'function Landing(props)'),
	'function setup': () =>
		change('function Landing() @{', 'function Landing() @{\n const copy = TOOLS;'),
	'event handler': () => change('<h1>', '<h1 onClick={handler}>'),
	ref: () => change('<h1>', '<h1 ref={reference}>'),
	'raw HTML': () => change('<h1>', '<h1 dangerouslySetInnerHTML={html}>'),
	'dynamic class': () => change('class="landing"', 'class={theme}'),
	'spread attribute': () => change('<main class="landing">', '<main {...attrs} class="landing">'),
	'javascript link': () => change('href="https://octanejs.dev"', 'href="javascript:alert(1)"'),
	'entity encoded link': () =>
		change('href="https://octanejs.dev"', 'href="java&#x73;cript:alert(1)"'),
	'encoded otherwise safe link': () =>
		change('href="https://octanejs.dev"', 'href="https&#58;//octanejs.dev"'),
	'protocol relative link': () => change('href="https://octanejs.dev"', 'href="//octanejs.dev"'),
	'dynamic link': () => change('href="https://octanejs.dev"', 'href={url}'),
	'nested anchors': () =>
		change(
			'<a href="https://octanejs.dev">Octane</a>',
			'<a href="https://octanejs.dev"><a href="https://octanejs.dev/docs">Octane</a></a>',
		),
	'block inside paragraph': () => change('<p class="lede">', '<p class="lede"><div>repair</div>'),
	'custom element': () =>
		change('<h1>Octane MCP</h1>', '<custom-widget>Octane MCP</custom-widget>'),
	'component child': () => change('<h1>Octane MCP</h1>', '<Widget />'),
	'script element': () =>
		change('<h1>Octane MCP</h1>', '<script>globalThis.effect = true</script>'),
	'unsafe CSS': () =>
		change('max-width: 760px;', 'max-width: 760px; background: url(https://example.com/pixel);'),
	'CSS at-rule': () => change('.landing {', '@import "https://example.com/style.css";\n.landing {'),
	'CSS escape': () =>
		change('max-width: 760px;', 'max-width: 760px; background: u\\72l(https://example.com/pixel);'),
	'style attribute': () => change('<style>', '<style ref={reference}>'),
	'shadowed module binding': () => change('const tool of TOOLS', 'const TOOLS of TOOLS'),
	'aliased iterable': () => change('const tool of TOOLS', 'const tool of getTools()'),
	'nonliteral key': () => change('key tool[0]', 'key keyFor(tool)'),
	'nonunique key column': () => change('key tool[0]', 'key tool[1]'),
	'property key': () => change('key tool[0]', "key tool['0']"),
	'out-of-range read': () => change('{tool[1] as string}', '{tool[2] as string}'),
	'prototype property read': () => change('{tool[1] as string}', '{tool.constructor as string}'),
	'call in text hole': () => change('{tool[1] as string}', '{format(tool[1]) as string}'),
	'direct dl row': () =>
		change(
			'@for (const tool of TOOLS; key tool[0]) {',
			'<dt>extra</dt>\n@for (const tool of TOOLS; key tool[0]) {',
		),
};

for (const [description, mutate] of Object.entries(rejected)) {
	test(`declines ${description}`, () => {
		const result = analyze(mutate(), file);
		assert.equal(result.accepted, false, JSON.stringify(result));
		assert.equal(typeof result.reason, 'string');
	});
}
