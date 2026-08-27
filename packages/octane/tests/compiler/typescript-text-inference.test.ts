import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { compile, compileToVolarMappings } from 'octane/compiler';
import { createTextTypeProject } from 'octane/compiler/typescript';
import {
	createTextTypeFixture,
	stringChildren,
	type TextTypeFacts,
} from '../_text-type-project.js';

const fixtures: ReturnType<typeof createTextTypeFixture>[] = [];

function fixture(files: Record<string, string>, compilerOptions?: Record<string, unknown>) {
	const result = createTextTypeFixture(files, compilerOptions);
	fixtures.push(result);
	return result;
}

afterEach(() => {
	for (const entry of fixtures.splice(0)) entry.dispose();
});

function childRange(source: string, expression: string): [number, number] {
	const container = source.indexOf(`>{${expression}}`);
	if (container < 0) throw new Error(`Missing child expression: ${expression}`);
	const start = container + 2;
	return [start, start + expression.length];
}

describe('TypeScript-backed text facts', () => {
	it('proves exact primitive-string child expressions across declarations and calls', () => {
		const source = `import { useState } from 'octane';
type Label = string;
type Branded = string & { readonly brand: unique symbol };
interface Props {
	name: Label;
	choice: 'first' | 'second';
	branded: Branded;
	optional?: string;
	mixed: string | number;
	unchecked: any;
	unknown: unknown;
	boxed: String;
	values: string[];
	lookup: Record<string, string>;
	key: string;
}
declare const impossible: never;
function label(value: string): string { return value.toUpperCase(); }
export function Shapes<T extends string>(props: Props, constrained: T) @{
	const { name } = props;
	const [state] = useState(props.name);
	let mutable = props.name;
	<main title={props.name}>
		<p>{props.name}</p><p>{name}</p><p>{state}</p><p>{mutable}</p>
		<p>{label(props.name)}</p><p>{props.choice}</p><p>{props.branded}</p>
		<p>{constrained}</p><p>{String(props.mixed)}</p>
		<p>{props.optional}</p><p>{props.mixed}</p><p>{props.unchecked}</p>
		<p>{props.unknown}</p><p>{props.boxed}</p><p>{impossible}</p>
		<p>{props.values[0]}</p><p>{props.lookup[props.key]}</p>
		<p>{props.values[0] ?? ''}</p>
	</main>
}`;
		const consumer = fixture({ 'Shapes.tsrx': source });
		const facts = consumer.project.snapshot(consumer.file('Shapes.tsrx'));
		const proven = stringChildren(source, facts);

		expect(proven).toEqual(
			expect.arrayContaining([
				'props.name',
				'name',
				'state',
				'mutable',
				'label(props.name)',
				'props.choice',
				'props.branded',
				'constrained',
				'String(props.mixed)',
				"props.values[0] ?? ''",
			]),
		);
		for (const uncertain of [
			'props.optional',
			'props.mixed',
			'props.unchecked',
			'props.unknown',
			'props.boxed',
			'impossible',
			'props.values[0]',
			'props.lookup[props.key]',
		]) {
			expect(proven, uncertain).not.toContain(uncertain);
		}
		expect(facts.stringChildRanges).toContainEqual(childRange(source, 'props.name'));
		const attributeStart = source.indexOf('title={props.name}') + 'title={'.length;
		expect(facts.stringChildRanges).not.toContainEqual([
			attributeStart,
			attributeStart + 'props.name'.length,
		]);
		expect(JSON.parse(JSON.stringify(facts))).toEqual(facts);
	});

	it('uses control-flow narrowing at the individual child, not at the symbol declaration', () => {
		const source = `export function Narrow(props: { value: string | number; optional?: string }) @{
	<main>
		@if (typeof props.value === 'string') { <p>{props.value}</p> }
		@else { <p>{props.value}</p> }
		<p>{props.optional ?? ''}</p>
	</main>
}`;
		const consumer = fixture({ 'Narrow.tsrx': source });
		const facts = consumer.project.snapshot(consumer.file('Narrow.tsrx'));
		const first = childRange(source, 'props.value');
		const secondStart = source.lastIndexOf('{props.value}') + 1;

		expect(facts.stringChildRanges).toContainEqual(first);
		expect(facts.stringChildRanges).not.toContainEqual([
			secondStart,
			secondStart + 'props.value'.length,
		]);
		expect(stringChildren(source, facts)).toContain("props.optional ?? ''");
	});

	it('maps complete expressions when virtual TSX printing changes their whitespace', () => {
		const multiline = 'format( props.left,\n props.right )';
		const compact = 'props.enabled?props.left:props.right';
		const source = `function format(left: string, right: string): string { return left + right; }
export function Printed(props: { left: string; right: string; enabled: boolean }) @{
	<main><p>{${multiline}}</p><p>{${compact}}</p></main>
}`;
		const consumer = fixture({ 'Printed.tsrx': source });
		const facts = consumer.project.snapshot(consumer.file('Printed.tsrx'));
		expect(facts.stringChildRanges).toEqual([
			childRange(source, multiline),
			childRange(source, compact),
		]);
	});

	it('resolves authored .tsrx exports and invalidates facts when an imported type changes', () => {
		const model = `export type Label = string;
export function readLabel(): Label { return 'ready'; }
export function Model() @{ <i>{readLabel()}</i> }
`;
		const source = `import { readLabel, type Label } from './model.tsrx';
import { normalize } from './normalize';
export function Imported(props: { label: Label }) @{
	<main><p>{props.label}</p><p>{readLabel()}</p><p>{normalize(props.label)}</p></main>
}`;
		const consumer = fixture({
			'model.tsrx': model,
			'normalize.ts': 'export function normalize(value: string): string { return value.trim(); }',
			'Imported.tsrx': source,
		});
		const filename = consumer.file('Imported.tsrx');
		const first = consumer.project.snapshot(filename);
		const original = JSON.stringify(first);
		expect(stringChildren(source, first)).toEqual([
			'props.label',
			'readLabel()',
			'normalize(props.label)',
		]);
		expect(consumer.project.snapshot(filename)).toEqual(first);

		consumer.write(
			'model.tsrx',
			model.replace('type Label = string', 'type Label = string | number'),
		);
		consumer.project.invalidate(consumer.file('model.tsrx'));
		const second = consumer.project.snapshot(filename);
		expect(stringChildren(source, second)).not.toContain('props.label');
		expect(stringChildren(source, second)).not.toContain('readLabel()');
		expect(second.sourceVersion).toBe(first.sourceVersion);
		expect(second.projectVersion).not.toBe(first.projectVersion);
		expect(JSON.stringify(first)).toBe(original);
	});

	it('requires strict null checking and reloads compiler settings after invalidation', () => {
		const source = `export function Label(props: { value: string }) @{ <p>{props.value}</p> }`;
		const consumer = fixture({ 'Label.tsrx': source }, { strictNullChecks: false });
		const filename = consumer.file('Label.tsrx');
		const loose = consumer.project.snapshot(filename);
		expect(loose.stringChildRanges).toEqual([]);

		const config = JSON.parse(readFileSync(consumer.tsconfig, 'utf8'));
		config.compilerOptions.strictNullChecks = true;
		writeFileSync(consumer.tsconfig, JSON.stringify(config));
		consumer.project.invalidate();
		const strict = consumer.project.snapshot(filename);
		expect(stringChildren(source, strict)).toContain('props.value');
		expect(strict.projectVersion).not.toBe(loose.projectVersion);
	});

	it('reloads an extended tsconfig after file-specific invalidation', () => {
		const source = `export function Label(props: { value: string }) @{ <p>{props.value}</p> }`;
		const consumer = fixture({ 'Label.tsrx': source });
		const filename = consumer.file('Label.tsrx');
		const config = JSON.parse(readFileSync(consumer.tsconfig, 'utf8'));
		config.extends = './base.json';
		consumer.write('base.json', JSON.stringify({ compilerOptions: { strictNullChecks: false } }));
		writeFileSync(consumer.tsconfig, JSON.stringify(config));
		consumer.project.invalidate();
		const loose = consumer.project.snapshot(filename);
		expect(loose.stringChildRanges).toEqual([]);

		consumer.write('base.json', JSON.stringify({ compilerOptions: { strictNullChecks: true } }));
		consumer.project.invalidate(filename);
		const strict = consumer.project.snapshot(filename);
		expect(stringChildren(source, strict)).toContain('props.value');
		expect(strict.projectVersion).not.toBe(loose.projectVersion);
	});

	it('keeps extra roots current and deduplicates them when configured', () => {
		const configured = `export function Configured(props: { label: string }) @{ <p>{props.label}</p> }`;
		const promoted = `export function Promoted(props: { label: string }) @{ <p>{props.label}</p> }`;
		const consumer = fixture({
			'Configured.tsrx': configured,
			'Promoted.tsrx': promoted,
		});
		const config = JSON.parse(readFileSync(consumer.tsconfig, 'utf8'));
		config.include = ['Configured.tsrx'];
		writeFileSync(consumer.tsconfig, JSON.stringify(config));
		consumer.project.invalidate();

		const configuredFacts = consumer.project.snapshot(consumer.file('Configured.tsrx'));
		expect(stringChildren(configured, configuredFacts)).toEqual(['props.label']);
		const filename = consumer.file('Promoted.tsrx');
		const extra = consumer.project.snapshot(filename);
		expect(stringChildren(promoted, extra)).toEqual(['props.label']);
		expect(consumer.project.snapshot(filename)).toEqual(extra);

		config.include = ['*.tsrx'];
		writeFileSync(consumer.tsconfig, JSON.stringify(config));
		consumer.project.invalidate();
		const promotedToConfig = consumer.project.snapshot(filename);
		const fresh = createTextTypeProject({ tsconfig: consumer.tsconfig });
		try {
			const freshFacts = fresh.snapshot(filename);
			expect(stringChildren(promoted, promotedToConfig)).toEqual(['props.label']);
			expect(promotedToConfig.projectVersion).toBe(freshFacts.projectVersion);
		} finally {
			fresh.dispose();
		}
	});

	it('retains source overlays until invalidated and releases the project explicitly', () => {
		const disk = `export function Label(props: { value: number }) @{ <p>{props.value}</p> }`;
		const edited = disk.replace('value: number', 'value: string');
		const consumer = fixture({ 'Label.tsrx': disk });
		const filename = consumer.file('Label.tsrx');
		const overlay = consumer.project.snapshot(filename, edited);
		expect(stringChildren(edited, overlay)).toContain('props.value');
		expect(consumer.project.snapshot(filename)).toEqual(overlay);
		consumer.project.invalidate(filename);
		expect(consumer.project.snapshot(filename).stringChildRanges).toEqual([]);
		consumer.project.dispose();
		expect(() => consumer.project.snapshot(filename)).toThrow(/disposed/i);
		expect(() => consumer.project.invalidate()).toThrow(/disposed/i);
		expect(() => consumer.project.dispose()).not.toThrow();
	});

	it('binds cached facts to the requested filename spelling on case-insensitive filesystems', ({
		skip,
	}) => {
		const source = `export function Case(props: { value: string }) @{ <p>{props.value}</p> }`;
		const consumer = fixture({ 'Case.tsrx': source });
		const upper = consumer.file('Case.tsrx');
		const lower = consumer.file('case.tsrx');
		if (ts.sys.useCaseSensitiveFileNames || !existsSync(lower)) skip();
		for (const filename of [upper, lower, upper]) {
			const facts = consumer.project.snapshot(filename);
			expect(facts.filename).toBe(filename.replaceAll('\\', '/'));
			expect(stringChildren(source, facts)).toContain('props.value');
			for (const mode of ['client', 'server'] as const) {
				expect(() => compile(source, filename, { mode, textTypeFacts: facts })).not.toThrow();
			}
		}
	});

	it('does not turn missing imports or erroneous expressions into string proof', () => {
		const source = `import { missing } from './missing';
export function Errors(props: { sound: string }) @{
	<main><p>{props.sound}</p><p>{missing()}</p><p>{props.absent}</p></main>
}`;
		const consumer = fixture({ 'Errors.tsrx': source });
		const proven = stringChildren(source, consumer.project.snapshot(consumer.file('Errors.tsrx')));
		expect(proven).toContain('props.sound');
		expect(proven).not.toContain('missing()');
		expect(proven).not.toContain('props.absent');
	});

	it('preserves TypeScript diagnostics for an incompatible assertion while accepting real conversion', () => {
		const source = `export function Conversion(props: { value: number }) @{
	<main><p>{props.value as string}</p><p>{String(props.value)}</p></main>
}`;
		const consumer = fixture({ 'Conversion.tsrx': source });
		const filename = consumer.file('Conversion.tsrx');
		const proven = stringChildren(source, consumer.project.snapshot(filename));
		expect(proven).not.toContain('props.value as string');
		expect(proven).toContain('String(props.value)');
		const virtual = compileToVolarMappings(source, filename);
		const checkFile = consumer.write('Conversion.check.tsx', virtual.code);
		const program = ts.createProgram([checkFile], {
			strict: true,
			noEmit: true,
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			jsx: ts.JsxEmit.ReactJSX,
			types: [],
		});
		expect(ts.getPreEmitDiagnostics(program).map(({ code }) => code)).toEqual([2352]);
	});

	it('maps UTF-16 source offsets exactly when non-ASCII text precedes a child', () => {
		const source = `// 😀 café 漢字\nexport function Unicode(props: { label: string }) @{ <p title="😀">{props.label}</p> }`;
		const consumer = fixture({ 'Unicode.tsrx': source });
		const filename = consumer.file('Unicode.tsrx');
		const facts = consumer.project.snapshot(filename);
		expect(facts.stringChildRanges).toEqual([childRange(source, 'props.label')]);
		// The Node/native compiler consumes the same authored offsets as the
		// TypeScript virtual-source mapper, including astral UTF-16 characters.
		for (const mode of ['client', 'server'] as const) {
			expect(() => compile(source, filename, { mode, textTypeFacts: facts })).not.toThrow();
		}
	});

	it.each(['tsrx', 'tsx'])(
		'agrees with the runtime parser on grouped .%s child expressions',
		(ext) => {
			const source =
				ext === 'tsrx'
					? `export function Grouped(props: { value: string }) @{ <p>{((props.value))}</p> }`
					: `/** @jsxImportSource octane */\nexport function Grouped(props: { value: string }) { return <p>{((props.value))}</p>; }`;
			const consumer = fixture({ [`Grouped.${ext}`]: source });
			const filename = consumer.file(`Grouped.${ext}`);
			const facts = consumer.project.snapshot(filename);
			const start = source.lastIndexOf('props.value');
			expect(facts.stringChildRanges).toEqual([[start, start + 'props.value'.length]]);
			for (const mode of ['client', 'server'] as const) {
				expect(() => compile(source, filename, { mode, textTypeFacts: facts })).not.toThrow();
			}
		},
	);
});

describe('source-bound textTypeFacts compile option', () => {
	it('rejects stale, malformed, wrong-file, and non-child ranges instead of changing hydration shape', () => {
		const source = `export function Label(props: { value: string; title: string }) @{ <p title={props.title}>{props.value}<b>{props.title}</b></p> }`;
		const consumer = fixture({ 'Label.tsrx': source });
		const filename = consumer.file('Label.tsrx');
		const facts = consumer.project.snapshot(filename);
		const [start, end] = childRange(source, 'props.value');
		const attrStart = source.indexOf('title={props.title}') + 'title={'.length;
		const malformed = [
			{ ...facts, version: 2 },
			{ ...facts, filename: consumer.file('Other.tsrx') },
			{ ...facts, sourceVersion: `${facts.sourceVersion}-stale` },
			{ ...facts, projectVersion: '' },
			{
				...facts,
				stringChildRanges: [
					[start, end],
					[start, end],
				],
			},
			{ ...facts, stringChildRanges: [childRange(source, 'props.title'), [start, end]] },
			{ ...facts, stringChildRanges: [[start, end, 0]] },
			{ ...facts, stringChildRanges: [[-1, end]] },
			{ ...facts, stringChildRanges: [[start + 0.5, end]] },
			{ ...facts, stringChildRanges: [[start, source.length + 1]] },
			{ ...facts, stringChildRanges: [[end, start]] },
			{ ...facts, stringChildRanges: [[start - 1, end + 1]] },
			{ ...facts, stringChildRanges: [[attrStart, attrStart + 'props.title'.length]] },
		];
		for (const invalid of malformed) {
			for (const mode of ['client', 'server'] as const) {
				expect(() =>
					compile(source, filename, { mode, textTypeFacts: invalid as TextTypeFacts }),
				).toThrow(/textTypeFacts/);
			}
		}
		expect(() =>
			compile(source.replace('value: string', 'value: number'), filename, {
				textTypeFacts: facts,
			}),
		).toThrow(/textTypeFacts/);
		expect(() =>
			compile(source, filename, { textTypeFacts: { ...facts, stringChildRanges: [] } }),
		).not.toThrow();
		expect(() => compile(source, filename)).not.toThrow();
	});

	it('accepts one serialized snapshot for both client and server compilation', () => {
		const source = `export function Label(props: { value: string }) @{ <p>{props.value}</p> }`;
		const consumer = fixture({ 'Label.tsrx': source });
		const filename = consumer.file('Label.tsrx');
		const original = consumer.project.snapshot(filename);
		const facts = JSON.parse(JSON.stringify(original));
		for (const mode of ['client', 'server'] as const) {
			const result = compile(source, filename, { mode, hmr: false, textTypeFacts: facts });
			expect(result).toEqual(
				compile(source, filename, { mode, hmr: false, textTypeFacts: original }),
			);
		}
	});
});
