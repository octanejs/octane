import { describe, expect, it } from 'vitest';
import { memo } from '../../src/index.js';
import { compile } from '../../src/compiler/index.js';
import { parseModule } from '../../src/compiler/parser.node.js';
import {
	analyzeDescriptorProjection,
	emitDescriptorProjection,
	findDescriptorProjectionExports,
	findDescriptorProjectionImports,
} from '../../src/compiler/descriptor-projections.js';
import { evaluateCompiledFixtureCode, loadPlainHookFixtureSource } from '../_server-fixture.js';

const SOURCE = `import { createElement } from 'octane';
import { Row } from './rows.js';
import { selectRow } from './ops.js';
export function rows(items: any[]): any[] {
	const out = new Array(items.length);
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		out[i] = createElement(Row, { key: it.id, id: it.id, label: it.label, onSelect: selectRow });
	}
	return out;
}`;
const ID = '/fixture/helper.ts';

function projection() {
	const Row = memo(function Row() {
		return null;
	});
	const selectRow = () => 'selected';
	const modules = { './rows.js': { Row }, './ops.js': { selectRow } };
	const original = loadPlainHookFixtureSource(SOURCE, {
		id: ID,
		inlineHookMemo: false,
		runtimeModules: modules,
	}).rows;
	const analysis = analyzeDescriptorProjection(SOURCE, ID, 'rows');
	const emitted = emitDescriptorProjection(analysis, {
		originalRequest: './original.js',
		exportName: 'project',
	});
	const project = evaluateCompiledFixtureCode(emitted.code, '/fixture/companion.js', 'client', {
		...modules,
		'./original.js': { rows: original },
	}).project;
	return { original, project, Row, selectRow };
}

describe('render-only descriptor helper contracts', () => {
	it('proves the same exported helper through TypeScript erasure and an export list', () => {
		const freeze = (node: any): any => {
			if (node && typeof node === 'object' && !Object.isFrozen(node)) {
				for (const value of Object.values(node)) freeze(value);
				Object.freeze(node);
			}
			return node;
		};
		const ast = freeze(parseModule(SOURCE, ID));
		const sourceProof = analyzeDescriptorProjection(ast, ID, 'rows');
		if (sourceProof === null) throw new Error('Expected a supported descriptor helper.');
		const erased =
			SOURCE.replace('export function', 'function').replaceAll(': any[]', '') +
			'\nexport { rows };';
		expect(analyzeDescriptorProjection(erased, ID, 'rows')?.fingerprint).toBe(
			sourceProof.fingerprint,
		);
		expect(
			analyzeDescriptorProjection("import type { Shape } from './types';\n" + SOURCE, ID, 'rows')
				?.fingerprint,
		).toBe(sourceProof.fingerprint);
		expect(findDescriptorProjectionExports(ast, ID)).toEqual([
			{ exported: 'rows', fingerprint: sourceProof.fingerprint },
		]);
		expect(
			findDescriptorProjectionImports(
				`import { rows } from './helper'; function App(x) { return rows(x); }`,
				ID,
			),
		).toEqual([{ local: 'rows', request: './helper', imported: 'rows' }]);
		const emitted = emitDescriptorProjection(sourceProof, {
			originalRequest: './original.js',
			exportName: 'project',
		});
		const output = parseModule(emitted.code, '/fixture/companion.js');
		// Query exports must be callable during ESM initialization; no generated
		// module-level cache/initializer can put an empty call into a new TDZ.
		expect(
			output.body.every(
				(statement: any) =>
					statement.type === 'ImportDeclaration' ||
					(statement.type === 'ExportNamedDeclaration' &&
						statement.declaration.type === 'FunctionDeclaration'),
			),
		).toBe(true);
	});

	it.each([
		['a loop index projection', SOURCE.replace('label: it.label', 'label: i')],
		['a whole-array projection', SOURCE.replace('label: it.label', 'label: items.length')],
		[
			'a private module capture',
			SOURCE.replace('export function', "const label = 'private'; export function").replace(
				'label: it.label',
				'label',
			),
		],
		['children', SOURCE.replace('label: it.label', 'children: it.label')],
		['refs', SOURCE.replace('label: it.label', 'ref: selectRow')],
		['spread props', SOURCE.replace('label: it.label', '...it')],
		['a late key', SOURCE.replace('key: it.id, id: it.id', 'id: it.id, key: it.id')],
		[
			'an extra loop effect',
			SOURCE.replace('const it = items[i];', 'const it = items[i]; effect();'),
		],
		['an opaque factory', SOURCE.replace("from 'octane'", "from './opaque.js'")],
		['a quoted import name', SOURCE.replace('{ Row }', '{ "Row name" as Row }')],
		['a reexport', SOURCE + "\nexport { other } from './other.js';"],
		['a side-effect import', "import './effect';\n" + SOURCE],
		['an empty runtime import', "import {} from './effect';\n" + SOURCE],
		['a type-only-specifier runtime import', "import { type Shape } from './types';\n" + SOURCE],
		[
			'an attributed import',
			SOURCE.replace("from './rows.js';", "from './rows.js' with { type: 'json' };"),
		],
	])('declines %s', (_name, source) => {
		expect(analyzeDescriptorProjection(source, ID, 'rows')).toBeNull();
	});

	it('declines a quoted helper export name', () => {
		const source =
			SOURCE.replace('export function', 'function') + '\nexport { rows as "row-list" };';
		expect(analyzeDescriptorProjection(source, ID, 'row-list')).toBeNull();
	});

	it('does not erase import assertions or evaluation phases supplied by a parser', () => {
		const source = parseModule(SOURCE, ID);
		const caller = parseModule(
			"import { rows } from './helper'; export const view = rows(items);",
			ID,
		);
		for (const metadata of [
			{ assertions: [{ key: 'type', value: 'json' }] },
			{ phase: 'source' },
			{ phase: 'defer' },
		]) {
			const withMetadata = (ast: any) => ({
				...ast,
				body: ast.body.map((node: any, index: number) =>
					index === 0 ? { ...node, ...metadata } : node,
				),
			});
			expect(analyzeDescriptorProjection(withMetadata(source), ID, 'rows')).toBeNull();
			expect(findDescriptorProjectionImports(withMetadata(caller), ID)).toEqual([]);
		}
	});

	it('keeps changed values, keys, native handlers, and ordinary calls observable', () => {
		const { original, project, selectRow } = projection();
		const first = { id: 1, label: 'first' };
		const second = { id: 2, label: 'second' };
		let result = project([first, second], null);
		result = project([first, { ...second, label: 'changed' }], result.cache);
		expect(result.value.map((row: any) => [row.key, row.props.label])).toEqual([
			['1', 'first'],
			['2', 'changed'],
		]);
		expect(result.value[1].props.onSelect()).toBe(selectRow());
		result = project([second, first], result.cache);
		expect(result.value.map((row: any) => row.props.id)).toEqual([2, 1]);
		const ordinary = original([first]);
		ordinary[0] = null;
		expect(original([first])[0].props.label).toBe('first');
	});

	it('reads a current key on unchanged items and coerces object keys once in authored order', () => {
		const { original, project } = projection();
		let key: any = 1;
		const row = {
			get id() {
				return key;
			},
			label: 'row',
		};
		let result = project([row], null);
		key = 2;
		result = project([row], result.cache);
		expect(result.value[0].key).toBe('2');
		const log: string[] = [];
		key = {
			toString() {
				log.push('key');
				return 'object-key';
			},
		};
		const expected = original([row]);
		const ordinaryLog = log.splice(0);
		const actual = project([row], result.cache).value;
		expect(log).toEqual(ordinaryLog);
		expect(actual[0].key).toBe(expected[0].key);
	});

	it('preserves numeric-loop length/index reads, holes, and earlier errors on cold and warm calls', () => {
		const { original, project } = projection();
		const row = { id: 1, label: 'first' };
		const warm = project([row], null).cache;
		for (const previous of [null, warm]) {
			const run = (fn: (input: any) => any) => {
				const reads: string[] = [];
				let lengths = 0;
				const input = new Proxy(
					{},
					{
						get(_target, name) {
							reads.push(String(name));
							if (name === 'length') return ++lengths === 1 ? 3 : 1;
							return row;
						},
					},
				);
				const out = fn(input);
				return { reads, length: out.length, keys: Object.keys(out), label: out[0].props.label };
			};
			expect(run((input) => project(input, previous).value)).toEqual(run(original));
			for (const input of [null, [undefined], [, row]]) {
				expect(() => original(input)).toThrow();
				expect(() => project(input, previous)).toThrow();
			}
		}
	});

	it('honors live defaults and factory getters on later helper invocations', () => {
		const { original, project, Row } = projection();
		const row = { id: 1, label: undefined };
		let result = project([row], null);
		(Row as any).defaultProps = { label: 'new default' };
		result = project([row], result.cache);
		expect(result.value[0].props.label).toBe(original([row])[0].props.label);
		let reads = 0;
		Object.defineProperty(Row, 'defaultProps', {
			configurable: true,
			get() {
				reads++;
				return { label: 'getter' };
			},
		});
		result = project([row], result.cache);
		expect(result.value[0].props.label).toBe('getter');
		// The public getter belongs to ordinary descriptor construction, never an
		// additional eligibility probe.
		expect(reads).toBe(1);
	});

	it('does not mutate an earlier snapshot when a later item throws', () => {
		const { project } = projection();
		const first = { id: 1, label: 'first' };
		const second = { id: 2, label: 'second' };
		const committed = project([first, second], null);
		expect(() =>
			project([{ ...first, id: 3, label: 'discarded' }, undefined], committed.cache),
		).toThrow();
		expect(committed.value.map((row: any) => row.props.label)).toEqual(['first', 'second']);
		const retry = project([first, { ...second, label: 'retry' }], committed.cache);
		expect(retry.value.map((row: any) => row.props.label)).toEqual(['first', 'retry']);
		expect(retry.value.map((row: any) => row.key)).toEqual(['1', '2']);
	});

	it('specializes only production render-only automatic calculations', () => {
		const source = `import { rows } from './helper'; export function App(props) @{ const value = rows(props.items); <section>{value}</section> }`;
		const proof = () => ({
			request: './helper?projection',
			imported: 'project',
			componentCaptureIndex: 1,
		});
		const imports = (text: string, options: any = {}) =>
			parseModule(
				compile(text, '/fixture/App.tsrx', {
					hmr: false,
					dev: false,
					resolveDescriptorProjectionImport: proof,
					...options,
				}).code,
				'/fixture/App.js',
			)
				.body.filter((node: any) => node.type === 'ImportDeclaration')
				.map((node: any) => node.source.value);
		expect(imports(source)).toContain('./helper?projection');
		for (const options of [
			{ mode: 'server' },
			{ dev: true },
			{ hmr: 'vite' },
			{ profile: true },
			{ inlineHookMemo: false },
		])
			expect(imports(source, options)).not.toContain('./helper?projection');
		expect(imports(source.replace('<section>', 'consume(value); <section>'))).not.toContain(
			'./helper?projection',
		);
		expect(imports(source.replace('{value}', '{value.length as string}'))).not.toContain(
			'./helper?projection',
		);
		const inspectable = source
			.replace('import { rows }', "import { Inspect } from './inspect'; import { rows }")
			.replace('<section>{value}</section>', '<Inspect>{value}</Inspect>');
		expect(
			imports(inspectable, {
				isDescriptorChildrenImport: (request: string, imported: string) =>
					request === './inspect' && imported === 'Inspect',
			}),
		).not.toContain('./helper?projection');
		const localInspectable = source
			.replace(
				'import { rows }',
				"import { descriptorChildren } from 'octane'; const Inspect = descriptorChildren(InspectBody); function InspectBody(props) @{ <div>{props.children}</div> } import { rows }",
			)
			.replace('<section>{value}</section>', '<Inspect>{value}</Inspect>');
		expect(imports(localInspectable)).not.toContain('./helper?projection');
	});
});
