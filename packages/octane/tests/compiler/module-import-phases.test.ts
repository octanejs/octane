import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModule } from '@tsrx/oxc/tsrx-core-compat';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { createOctaneCompiler } from '../../src/compiler/bundler.js';

const source = readFileSync(
	join(process.cwd(), 'packages/octane/tests/_fixtures/deferred-module-imports.tsrx'),
	'utf8',
);

// Inline rather than a fixture: TypeScript cannot parse `import source`, so a
// checked `.tsrx` fixture would fail typechecking.
const sourcePhaseSource = `import source module from './module.wasm';
import instance from './instance.wasm';

export const loadSource = import.source('./later.wasm');
export const readModules = () => [module, instance];

export function App() @{
	const source = import.source('./render.wasm');
	const deferred = import.defer('./render.js');
	<p>{String([source, deferred]) as string}</p>
}`;

/**
 * Every authored import in compiled output, keyed by its specifier, with the
 * phase it evaluates in. The parser leaves `phase` off ordinary imports.
 */
function authoredImportPhases(code: string, filename: string): Record<string, string> {
	const phases: Record<string, string> = {};
	const visit = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node === null || typeof node !== 'object') return;
		const candidate = node as {
			type?: string;
			phase?: string | null;
			source?: { value?: unknown };
			specifiers?: Array<{ type: string }>;
		};
		const specifier = candidate.source?.value;
		if (typeof specifier === 'string' && specifier.startsWith('./')) {
			if (candidate.type === 'ImportDeclaration') {
				const bindings = candidate.specifiers?.map((binding) => binding.type).join(',');
				phases[specifier] = `${candidate.phase ?? 'evaluation'} declaration (${bindings})`;
			} else if (candidate.type === 'ImportExpression') {
				phases[specifier] = `${candidate.phase ?? 'evaluation'} expression`;
			}
		}
		for (const key in node) {
			if (key !== 'loc' && key !== 'range') visit((node as Record<string, unknown>)[key]);
		}
	};
	visit(parseModule(code, filename).body);
	return phases;
}

describe('compiled module imports', () => {
	for (const [label, options] of [
		['client development', { dev: true, hmr: 'vite' }],
		['client production', { dev: false, hmr: false }],
		['server development', { mode: 'server', dev: true }],
		['server production', { mode: 'server', dev: false }],
	] as const) {
		for (const strong of [false, true]) {
			it(`preserves meta-property syntax in memoized creations in ${label} (strong=${strong})`, () => {
				const { code } = compile(
					`import { use } from 'octane';
					function Form(props) @{ <form {...props.attributes} /> }
					export function App(props) @{
						const value = use(Promise.resolve(import.meta.url + props.suffix));
						<Form attributes={{
							...Object.assign({}, props.attributes),
							...(import.meta.env.SSR ? { action: props.action } : {}),
							'data-value': value,
							'data-target': props.read(function () { return new.target; }),
						}} />
					}`,
					'meta-property-creations.tsrx',
					{ ...options, strong },
				);
				// The generated module must remain valid ESM, including dependencies
				// synthesized for both use() and server component-prop creations.
				expect(() => parseModule(code, 'meta-property-creations.js')).not.toThrow();
			});
		}

		it(`preserves deferred imports in ${label}`, () => {
			const { code } = compile(source, 'deferred-module-imports.tsrx', options);
			const statements = parseModule(code, 'deferred-module-imports.js').body;
			const imports = statements.filter((statement) => statement.type === 'ImportDeclaration');
			const deferred = imports.find((statement) => statement.source.value === './basic.tsrx');
			const eager = imports.find((statement) => statement.source.value === './actions.tsrx');
			const loadLater = statements.find(
				(statement) =>
					statement.type === 'ExportNamedDeclaration' &&
					statement.declaration?.type === 'VariableDeclaration' &&
					statement.declaration.declarations[0]?.id?.type === 'Identifier' &&
					statement.declaration.declarations[0]?.id.name === 'loadLater',
			);
			const dynamicImport =
				loadLater?.type === 'ExportNamedDeclaration' &&
				loadLater.declaration?.type === 'VariableDeclaration'
					? loadLater.declaration.declarations[0]?.init
					: undefined;

			expect(deferred?.phase).toBe('defer');
			expect(deferred?.specifiers[0]?.type).toBe('ImportNamespaceSpecifier');
			expect(eager?.phase).not.toBe('defer');
			expect(dynamicImport).toMatchObject({
				type: 'ImportExpression',
				phase: 'defer',
				source: { value: './activity.tsrx' },
			});
		});

		for (const strong of [false, true]) {
			it(`preserves source-phase imports in ${label} (strong=${strong})`, () => {
				const { code } = compile(sourcePhaseSource, 'source-phase-imports.tsrx', {
					...options,
					strong,
				});

				// A dropped phase still parses: `import source m` becomes a default import
				// and `import.source()` an ordinary dynamic import of the namespace.
				expect(authoredImportPhases(code, 'source-phase-imports.js')).toEqual({
					'./module.wasm': 'source declaration (ImportDefaultSpecifier)',
					'./instance.wasm': 'evaluation declaration (ImportDefaultSpecifier)',
					'./later.wasm': 'source expression',
					'./render.wasm': 'source expression',
					'./render.js': 'defer expression',
				});
			});
		}
	}

	// Plain hook modules reach a separate production-client printer that reprints
	// the whole Program once it inlines a memo.
	for (const environment of ['client', 'server'] as const) {
		it(`preserves import phases in a plain ${environment} hook module`, () => {
			const compiler = createOctaneCompiler({ root: '/project' });
			const output = compiler.transform(
				`import { useMemo } from 'octane';
				export const loadDeferred = import.defer('./deferred.js');
				export function useValue(value) { return useMemo(() => ({ value }), [value]); }`,
				'/project/src/use-value.ts',
				{ environment },
			);
			const sourceOutput = compiler.transform(
				`import { useMemo } from 'octane';
				import source module from './module.wasm';
				export const loadSource = import.source('./later.wasm');
				export function useValue(value) { return useMemo(() => ({ module, value }), [value]); }`,
				'/project/src/use-source.ts',
				{ environment },
			);

			expect(output).not.toBeNull();
			expect(sourceOutput).not.toBeNull();
			expect(authoredImportPhases(output!.code, 'use-value.js')).toEqual({
				'./deferred.js': 'defer expression',
			});
			expect(authoredImportPhases(sourceOutput!.code, 'use-source.js')).toEqual({
				'./module.wasm': 'source declaration (ImportDefaultSpecifier)',
				'./later.wasm': 'source expression',
			});
		});
	}

	for (const [label, options, runtimeModule] of [
		['client', { hmr: false }, 'octane'],
		['server', { mode: 'server' }, 'octane/server'],
	] as const) {
		it(`preserves deferred imports from the ${label} runtime`, () => {
			const { code } = compile(
				"import defer * as runtime from 'octane'; export const getHook = () => runtime.useState;",
				'deferred-runtime-import.tsrx',
				options,
			);
			const runtimeImport = parseModule(code, 'deferred-runtime-import.js').body.find(
				(statement) =>
					statement.type === 'ImportDeclaration' && statement.source.value === runtimeModule,
			);

			expect(runtimeImport?.type === 'ImportDeclaration' ? runtimeImport.phase : undefined).toBe(
				'defer',
			);
		});

		it(`keeps a source-phase runtime import out of the ${label} runtime prelude`, () => {
			const { code } = compile(
				"import source runtime from 'octane'; export const getSource = () => runtime;",
				'source-runtime-import.tsrx',
				options,
			);
			const runtimeImport = parseModule(code, 'source-runtime-import.js').body.find(
				(statement) =>
					statement.type === 'ImportDeclaration' &&
					statement.source.value === runtimeModule &&
					statement.specifiers.some((specifier) => specifier.local.name === 'runtime'),
			);

			// Merged into the prelude, the binding would become an evaluation-phase
			// default import of the runtime instead of its module source.
			expect(runtimeImport).toMatchObject({
				phase: 'source',
				specifiers: [{ type: 'ImportDefaultSpecifier', local: { name: 'runtime' } }],
			});
		});
	}
});
