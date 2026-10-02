import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compile } from 'octane/compiler';
import { clone, template } from '../../src/index.js';

// A raw multi-root template passes its root count to `template()`. A
// production hydration reads it, without parsing the template, to find where
// the server nodes that a component's roots adopted end, and removes what the
// server left after them. A count above the parsed roots would leave that tail;
// one below would remove roots the client adopted.

const TESTS = join(process.cwd(), 'packages/octane/tests');

function fixtures(dir: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...fixtures(path));
		else if (entry.name.endsWith('.tsrx') && path.includes('_fixtures')) files.push(path);
	}
	return files;
}

interface InspectedTemplate {
	html: string;
	ns?: number;
	frag?: number;
}

/** Each multi-root template's markup, its root count, and the roots its clone holds. */
function rootCounts(source: string, id: string, options: Record<string, unknown> = {}) {
	const { inspect } = compile(source, id, { ...options, inspect: true });
	return (inspect.templates as InspectedTemplate[])
		.filter((t) => (t.frag ?? 0) > 0)
		.map((t) => ({
			html: t.html,
			count: t.frag,
			parsed: clone(template(t.html, t.ns, t.frag)).childNodes.length,
		}));
}

describe('multi-root template root count', () => {
	it.each([
		{ shape: 'static roots', body: '<><i>a</i><b>b</b><s>c</s></>' },
		{ shape: 'text between elements', body: "<>{'a'}<b>b</b>{'c'}</>" },
		{ shape: 'text holes beside text', body: "<>{'a'}{props.x as string}{'c'}<b>b</b></>" },
		{ shape: 'a component between roots', body: '<><i>a</i><Leaf /><b>b</b></>' },
		{
			shape: 'directives between roots',
			body: '<><i>a</i>@if (props.on) { <u>u</u> }@for (const x of props.xs; key x) { <s>{x as string}</s> }<b>b</b></>',
		},
		{ shape: 'SVG roots', body: '<><rect /><circle /></>' },
	])('matches the parsed roots for $shape', ({ body }) => {
		const source =
			'function Leaf() @{ <em>leaf</em> }\n' +
			`export function C(props: { on: boolean; x: string; xs: string[] }) @{\n\t${body}\n}\n`;
		for (const options of [{}, { dev: true }]) {
			const templates = rootCounts(source, 'App.tsrx', options);
			expect(templates.length).toBeGreaterThan(0);
			for (const { html, count, parsed } of templates) {
				expect({ html, count }).toEqual({ html, count: parsed });
			}
		}
	});

	it('matches the parsed roots for every fixture template', () => {
		let checked = 0;
		for (const file of fixtures(TESTS)) {
			const id = relative(TESTS, file);
			let templates: ReturnType<typeof rootCounts>;
			try {
				templates = rootCounts(readFileSync(file, 'utf8'), id);
			} catch {
				// Fixtures for other renderers, and deliberate compile errors.
				continue;
			}
			for (const { html, count, parsed } of templates) {
				expect({ id, html, count }).toEqual({ id, html, count: parsed });
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(100);
	}, 60_000);
});
