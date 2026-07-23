import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Module-map coverage for render-plan expressions (the "2C" contract): the
// positions users hover most — event handlers and text holes — must map from
// the emitted client code back to their authored positions, in dev AND prod.
// The map is a published artifact (devtools, MDX's chained .mdx maps, the
// playground), so this asserts the narrowest semantic property: the segment at
// the expression's generated position targets the authored expression, not a
// neighbour and not nothing. Exact segment counts / other positions are
// deliberately not pinned.

const SOURCE = `import { useState } from 'octane';
export function App() @{
	const [n, setN] = useState(0);
	<div>
		<button onClick={(e) => setN(n + 1)}>inc</button>
		<span>{n as string}</span>
	</div>
}
`;

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeVlqSegment(segment: string): number[] {
	const out: number[] = [];
	let value = 0;
	let shift = 0;
	for (const char of segment) {
		const digit = VLQ_CHARS.indexOf(char);
		value += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
		} else {
			out.push(value & 1 ? -(value >>> 1) : value >>> 1);
			value = 0;
			shift = 0;
		}
	}
	return out;
}

/** Decode v3 `mappings` → per generated line: `[genCol, srcLine0, srcCol0][]`. */
function decodeMappings(mappings: string): number[][][] {
	let srcLine = 0;
	let srcCol = 0;
	return mappings.split(';').map((line) => {
		let genCol = 0;
		return line
			.split(',')
			.filter(Boolean)
			.map((segment) => {
				const [gc, , sl, sc] = decodeVlqSegment(segment);
				genCol += gc;
				srcLine += sl;
				srcCol += sc;
				return [genCol, srcLine, srcCol];
			});
	});
}

function positionOf(text: string, needle: string, offset = 0) {
	const index = text.indexOf(needle);
	expect(index, `"${needle}" present`).toBeGreaterThan(-1);
	const at = index + offset;
	const before = text.slice(0, at);
	const line = (before.match(/\n/g) || []).length;
	return { line, col: at - (before.lastIndexOf('\n') + 1) };
}

/**
 * Assert the map has a segment AT the generated position of `genNeedle` (+
 * `genOffset`) targeting the position of `srcNeedle` (+ `srcOffset`) in
 * `source`. Every occurrence of the generated needle must map (mount + update
 * paths).
 */
function expectMappedIn(
	source: string,
	code: string,
	map: { mappings: string },
	genNeedle: string,
	genOffset: number,
	srcNeedle: string,
	srcOffset = 0,
) {
	const lines = decodeMappings(map.mappings);
	const src = positionOf(source, srcNeedle, srcOffset);
	const codeLines = code.split('\n');
	let occurrences = 0;
	for (let line = 0; line < codeLines.length; line++) {
		const col = codeLines[line].indexOf(genNeedle);
		if (col === -1) continue;
		occurrences++;
		const target = col + genOffset;
		const hit = (lines[line] || []).find((segment) => segment[0] === target);
		expect(hit, `segment at generated ${line}:${target} for "${genNeedle}"`).toBeDefined();
		expect([hit![1], hit![2]], `source target for "${genNeedle}"`).toEqual([src.line, src.col]);
	}
	expect(occurrences, `"${genNeedle}" occurrences in output`).toBeGreaterThan(0);
}

function expectMapped(
	code: string,
	map: { mappings: string },
	genNeedle: string,
	genOffset: number,
	srcNeedle: string,
	srcOffset = 0,
) {
	expectMappedIn(SOURCE, code, map, genNeedle, genOffset, srcNeedle, srcOffset);
}

// Attribute values, control-flow call sites, component props, and a hoisted
// @for key function — coverage across both component interiors and the module
// frame's generated helpers.
const PLAN_SOURCE = `import { useState } from 'octane';

function Row(props: { label: string; k: number }) @{
	<li>{props.label}</li>
}

export function Panel() @{
	const [items, setItems] = useState([{ id: 1, label: 'a' }]);
	const [cls, setCls] = useState('box');
	const wide = items.length > 1;
	<div class={cls + '-wrap'} style={{ width: wide ? '10px' : '20px' }} title={'t:' + cls}>
		<button onClick={() => setCls(cls + '?')}>go</button>
		@if (items.length > 0) {
			<b>has</b>
		}
		@for (const it of items; key it.id) {
			<i>{it.label as string}</i>
		}
		<Row label={cls + '!'} k={items.length + 10} key={cls + '-key'} />
	</div>
}
`;

const SERVER_SOURCE = `import { useState } from 'octane';
export function App(props: { title: string }) @{
	const [n] = useState(0);
	<div title={'title:' + props.title}><span>{'count:' + n}</span></div>
}
`;

describe.each([
	['client dev', { dev: true }],
	['client prod', { hmr: false as const }],
])('render-plan expression map coverage — %s', (_label, options) => {
	it('maps event handlers and text holes to their authored positions', () => {
		const { code, map } = compile(SOURCE, 'App.tsrx', options);
		// The handler arrow: every paste (mount + update) maps to the authored arrow.
		expectMapped(code, map, '(e) => setN(n + 1)', 1, '(e) => setN(n + 1)', 1);
		// A token INSIDE the handler maps too (per-token fragment mappings).
		expectMapped(code, map, 'setN(n + 1)', 0, 'setN(n + 1)', 0);
		// The known-string text hole `{n as string}`: the pasted `n` maps to the
		// authored `n` in mount (htext) and update (setText) paths alike. The
		// hole may print parenthesized (string emit) or bare (AST emit).
		if (code.includes('const _v = (n)')) {
			expectMapped(code, map, 'const _v = (n)', 'const _v = ('.length, '{n as string}', 1);
		} else {
			expectMapped(code, map, 'const _v = n', 'const _v = '.length, '{n as string}', 1);
		}
	});

	it('maps attribute, control-flow, and component-prop expressions', () => {
		const { code, map } = compile(PLAN_SOURCE, 'Panel.tsrx', options);
		const at = (needle: string, offset: number, src: string, srcOffset = 0) =>
			expectMappedIn(PLAN_SOURCE, code, map, needle, offset, src, srcOffset);
		// Plain attribute value (`title=`).
		at(`'t:' + cls`, 0, `'t:' + cls`);
		// Class expression.
		at(`cls + '-wrap'`, 0, `cls + '-wrap'`);
		// Style object expression — a token inside the printed object maps.
		at(`wide ? '10px'`, 0, `wide ? '10px'`);
		// @if condition (the ifBlock call-site paste).
		at(`items.length > 0`, 0, `items.length > 0`);
		// @for iterable: pasted bare into the forBlock call, or — under the
		// prod whole-list cache — evaluated once into `_v` first (with or
		// without the string emitter's parens).
		if (code.includes('const _v = (items)')) {
			at('const _v = (items)', 'const _v = ('.length, 'items; key');
		} else if (code.includes('const _v = items')) {
			at('const _v = items', 'const _v = '.length, 'items; key');
		} else {
			at(', items, _key', 2, 'items; key');
		}
		// The key arrow is emitted as a module-hoisted helper. Its authored key
		// expression must remain navigable after the whole module becomes one AST.
		at('it.id', 0, 'it.id');
		// Component prop value and key expression (componentSlot call site).
		at(`cls + '!'`, 0, `cls + '!'`);
		at(`items.length + 10`, 0, `items.length + 10`);
		at(`cls + '-key'`, 0, `cls + '-key'`);
		// Event bundle: the callee and each argument map as separate pastes in
		// the mount (`_$evt1`) and update (`_$evt1u`) emits alike. Args may
		// print parenthesized (string emit) or bare (AST emit).
		if (code.includes(`(setCls), (cls + '?')`)) {
			at(`(setCls), (cls + '?')`, 1, `setCls(cls + '?')`);
		} else {
			at(`setCls, cls + '?'`, 0, `setCls(cls + '?')`);
		}
		at(`cls + '?'`, 0, `cls + '?'`);
	});
});

describe.each([
	['server', { mode: 'server' as const }],
	['server dev', { mode: 'server' as const, dev: true }],
])('server expression map coverage — %s', (_label, options) => {
	it('maps setup, attribute, and HTML-hole expressions', () => {
		const { code, map } = compile(SERVER_SOURCE, 'ServerMap.tsrx', options);
		const at = (needle: string, sourceNeedle = needle) =>
			expectMappedIn(SERVER_SOURCE, code, map, needle, 0, sourceNeedle);

		at('useState(0', 'useState(0)');
		at(`'title:' + props.title`);
		at(`'count:' + n`);
	});
});
