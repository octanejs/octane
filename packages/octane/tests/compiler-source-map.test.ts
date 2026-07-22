import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import { decodeMappings } from '../src/compiler/compile-universal.js';

function offsetPosition(text: string, offset: number) {
	const lines = text.slice(0, offset).split('\n');
	return { line: lines.length - 1, column: lines.at(-1)!.length };
}

function originalPosition(code: string, map: { mappings: string }, offset: number) {
	const generated = offsetPosition(code, offset);
	let traced: number[] | null = null;
	for (const segment of decodeMappings(map.mappings)[generated.line] ?? []) {
		if (segment[0] > generated.column) break;
		traced = segment;
	}
	return traced && traced.length >= 4 ? { line: traced[2], column: traced[3] } : null;
}

function nthIndexOf(text: string, needle: string, occurrence: number) {
	let offset = -1;
	for (let index = 0; index <= occurrence; index++) offset = text.indexOf(needle, offset + 1);
	expect(
		offset,
		`expected occurrence ${occurrence} of ${JSON.stringify(needle)}`,
	).toBeGreaterThanOrEqual(0);
	return offset;
}

describe('client compiler source maps', () => {
	it('maps nested tags and attribute values without confusing their coordinates', () => {
		const source = `export function App() @{
	<div data-label="<span">
		<span><div /></span>
	</div>
}`;
		const defaultOutput = compile(source, 'App.tsrx', { mode: 'client' });
		const output = compile(source, 'App.tsrx', {
			mode: 'client',
			astTrace: true,
		});
		expect(output.code).toBe(defaultOutput.code);
		expect(defaultOutput).not.toHaveProperty('astTrace');
		expect(output.astTrace?.generatedAst).toMatchObject({ type: 'Program' });

		const generatedAttributeText = nthIndexOf(output.code, '<span', 0) + 1;
		const generatedSpanOpen = nthIndexOf(output.code, '<span', 1) + 1;
		const generatedSpanClose = output.code.indexOf('</span>') + 2;
		const sourceAttributeText = source.indexOf('<span');
		const sourceSpanOpen = nthIndexOf(source, '<span', 1) + 1;
		const sourceSpanClose = source.indexOf('</span>') + 2;

		expect(originalPosition(defaultOutput.code, defaultOutput.map, generatedSpanOpen)).toBeNull();
		expect(originalPosition(output.code, output.map, generatedAttributeText)).toEqual(
			offsetPosition(source, sourceAttributeText),
		);
		expect(originalPosition(output.code, output.map, generatedSpanOpen)).toEqual(
			offsetPosition(source, sourceSpanOpen),
		);
		expect(originalPosition(output.code, output.map, generatedSpanClose)).toEqual(
			offsetPosition(source, sourceSpanClose),
		);

		// A non-void self-closing host becomes an opening+closing HTML pair. Both
		// generated names trace to the one authored JSX name.
		const generatedSelfClosing = output.code.indexOf('<div></div>');
		const sourceSelfClosing = source.indexOf('<div />') + 1;
		expect(originalPosition(output.code, output.map, generatedSelfClosing + 1)).toEqual(
			offsetPosition(source, sourceSelfClosing),
		);
		expect(originalPosition(output.code, output.map, generatedSelfClosing + 7)).toEqual(
			offsetPosition(source, sourceSelfClosing),
		);
	});

	it('maps authored static attributes without claiming compiler-injected class text', () => {
		const source = `export function App() @{
	<div class="demo">
		<h2 title="a&b">Title</h2>
		<style>div { color: red; }</style>
	</div>
}`;
		const defaultOutput = compile(source, 'App.tsrx', { mode: 'client' });
		const output = compile(source, 'App.tsrx', {
			mode: 'client',
			astTrace: true,
		});
		expect(output.code).toBe(defaultOutput.code);

		const generatedClass = output.code.indexOf('class=');
		const generatedDemo = output.code.indexOf('demo', generatedClass);
		const generatedScope = output.code.indexOf('tsrx-', generatedDemo);
		const generatedEscapedValue = output.code.indexOf('a&amp;b');
		const sourceClass = source.indexOf('class=');
		const sourceDemo = source.indexOf('demo', sourceClass);

		expect(originalPosition(defaultOutput.code, defaultOutput.map, generatedClass)).toBeNull();
		expect(originalPosition(output.code, output.map, generatedClass)).toEqual(
			offsetPosition(source, sourceClass),
		);
		expect(originalPosition(output.code, output.map, generatedDemo)).toEqual(
			offsetPosition(source, sourceDemo),
		);
		expect(originalPosition(output.code, output.map, generatedScope)).toBeNull();
		expect(originalPosition(output.code, output.map, generatedEscapedValue)).toBeNull();
	});
});
