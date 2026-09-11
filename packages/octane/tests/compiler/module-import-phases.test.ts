import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseModule } from 'oxc-tsrx/tsrx-core-compat';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

const source = readFileSync(
	join(process.cwd(), 'packages/octane/tests/_fixtures/deferred-module-imports.tsrx'),
	'utf8',
);

describe('compiled module imports', () => {
	for (const [label, options] of [
		['client development', { dev: true, hmr: 'vite' }],
		['client production', { dev: false, hmr: false }],
		['server development', { mode: 'server', dev: true }],
		['server production', { mode: 'server', dev: false }],
	] as const) {
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
	}
});
