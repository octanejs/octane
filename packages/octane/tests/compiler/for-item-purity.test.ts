import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// The forBlock flags argument is the compiler→runtime contract for keyed-list
// survivor fast paths. Bit 0 is the pure-item proof: updateSurvivor may skip a
// surviving row's body entirely when the item identity (and index, when bound)
// is unchanged. These tests pin which item-body shapes earn that bit.
const FOR_CALL = /_\$(?:forBlock|fastForBlock|keyedForBlock|fastKeyedForBlock)\(/g;

// Split a call's top-level arguments — commas inside nested expressions must
// not break positional reads (flags is argument index 6).
function callArguments(code: string, openParenIndex: number): string[] {
	const args: string[] = [];
	let depth = 0;
	let current = '';
	for (let i = openParenIndex; i < code.length; i++) {
		const ch = code[i];
		if (ch === '(' || ch === '[' || ch === '{') depth++;
		else if (ch === ')' || ch === ']' || ch === '}') depth--;
		if (depth === 0) {
			args.push(current.trim());
			return args;
		}
		if (ch === ',' && depth === 1) {
			args.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	return args;
}

// The list under test is the App-level @for. A @for nested inside an item
// helper is emitted in that hoisted helper, ahead of the component function —
// scanning only the App body reads the outer call unambiguously.
function appListFlags(code: string): number[] {
	const appStart = code.indexOf('export const App');
	expect(appStart, 'expected a wrapped App export in the emitted module').toBeGreaterThan(-1);
	const region = code.slice(appStart);
	const flags: number[] = [];
	let match: RegExpExecArray | null;
	while ((match = FOR_CALL.exec(region))) {
		const args = callArguments(region, match.index + match[0].length - 1);
		const literal = args[6]?.match(/^\d+$/);
		// A non-literal flags expression (an itemMemo witness guard) cannot
		// satisfy a plain-integer assertion — fail loudly rather than misread it.
		expect(literal, `expected a literal forBlock flags argument, saw ${args[6]}`).not.toBeNull();
		flags.push(Number(literal![0]));
	}
	return flags;
}

function compileList(body: string, prelude = ''): number[] {
	const code = compile(
		`
		${prelude}
		export function App(props) @{
			<ul>@for (const item of props.items; key item.id) {${body}}</ul>
		}
	`,
		'App.tsrx',
		{ hmr: false, dev: false },
	).code;
	return appListFlags(code);
}

const PURE = 1;
const DEP_ELIGIBLE = 4;
const INDEX_INDEPENDENT = 8;

describe('@for item-body purity with host-only conditional content', () => {
	it('admits a body whose only control flow is a host-only @if', () => {
		const flags = appListFlags(
			compile(
				`
				export function App(props) @{
					<ul>@for (const item of props.items; key item.id) {
						<li>{item.label as string}@if (item.flag) {<span class="x" />}</li>
					}</ul>
				}
			`,
				'App.tsrx',
				{ hmr: false, dev: false },
			).code,
		);
		expect(flags).toHaveLength(1);
		expect(flags[0]! & PURE).toBe(PURE);
		// No parent captures: the pure survivor path needs no deps tuple — the
		// item identity alone is the witness — so depEligible stays off too.
		expect(flags[0]! & DEP_ELIGIBLE).toBe(0);
		expect(flags[0]! & INDEX_INDEPENDENT).toBe(INDEX_INDEPENDENT);
	});

	it('admits a narrowly proven keyed @for nested inside the @if', () => {
		const flags = compileList(
			'<li>@if (item.flag) {' +
				'@for (const sub of item.subs; key sub.id) { <span>{sub.name as string}</span> }' +
				'}</li>',
		);
		expect(flags).toHaveLength(1);
		expect(flags[0]! & PURE).toBe(PURE);
	});

	it('declines when the @if arm renders a component', () => {
		const flags = compileList(
			'<li>@if (item.flag) {<Row x={item.label} />}</li>',
			'function Row(props) @{ <span>{props.x as string}</span> }',
		);
		expect(flags).toHaveLength(1);
		expect(flags[0]! & PURE).toBe(0);
	});

	it('declines when an imported call hides a component inside a function argument', () => {
		// `renderTags` is a memoizable imported projection, so the render-call
		// gate walks its arguments and defers the arrow — the component inside
		// reaches PURE only through the host-conditional shape gate.
		const flags = compileList(
			'<li>@if (item.flag) {{renderTags(item.tags, (t) => <Tag x={t} />)}}</li>',
			"import { renderTags } from './lib';\n" +
				'function Tag(props) @{ <span>{props.x as string}</span> }',
		);
		expect(flags).toHaveLength(1);
		expect(flags[0]! & PURE).toBe(0);
	});

	it('declines a body that captures a parent local, keeping the depEligible path', () => {
		const flags = appListFlags(
			compile(
				`
				export function App(props) @{
					const editing = props.editing;
					<ul>@for (const item of props.items; key item.id) {
						<li>@if (editing === item.id) {<span class="x" />}</li>
					}</ul>
				}
			`,
				'App.tsrx',
				{ hmr: false, dev: false },
			).code,
		);
		expect(flags).toHaveLength(1);
		expect(flags[0]! & PURE).toBe(0);
		expect(flags[0]! & DEP_ELIGIBLE).toBe(DEP_ELIGIBLE);
	});

	it('declines when the @if test assigns (render-time mutation hazard)', () => {
		const flags = compileList('<li>@if (item.x = 1) {<span class="x" />}</li>');
		expect(flags).toHaveLength(1);
		expect(flags[0]! & PURE).toBe(0);
	});

	it('declines when the @if test reads an imported member (live-binding hazard)', () => {
		const flags = appListFlags(
			compile(
				`
				import { flags } from './flags';
				export function App(props) @{
					<ul>@for (const item of props.items; key item.id) {
						<li>@if (flags.enabled) {<span class="x" />}</li>
					}</ul>
				}
			`,
				'App.tsrx',
				{ hmr: false, dev: false },
			).code,
		);
		expect(flags).toHaveLength(1);
		expect(flags[0]! & PURE).toBe(0);
	});

	it.each<[string, string, string?]>([
		[
			'@try',
			'<li>@if (item.flag) {<span class="x" />}@try {<b>{item.label as string}</b>} @catch {<i />}</li>',
		],
		[
			'@switch',
			'<li>@if (item.flag) {<span class="x" />}@switch (item.kind) { @case \'a\': {<b />} @default: {<i />} }</li>',
		],
		[
			'a portal',
			'<li>@if (item.flag) {<span class="x" />}{createPortal(<b />, props.host)}</li>',
			"import { createPortal } from 'octane';",
		],
		[
			'a nested @for with an index binding',
			'<li>@if (item.flag) {@for (const sub of item.subs; index i; key sub.id) { <span>{sub.name as string}</span> }}</li>',
		],
		[
			'a keyless nested @for',
			'<li>@if (item.flag) {@for (const sub of item.subs) { <span>{sub.name as string}</span> }}</li>',
		],
	])('declines a body containing %s', (_name, body, prelude) => {
		const flags = compileList(body, prelude);
		expect(flags).toHaveLength(1);
		expect(flags[0]! & PURE).toBe(0);
	});
});
