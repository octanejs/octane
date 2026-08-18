import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');
const upstreamEntry = path.join(packageRoot, 'upstream/src/index.ts');

export async function deriveUpstreamInventory() {
	const program = ts.createProgram([upstreamEntry], {
		allowJs: false,
		jsx: ts.JsxEmit.ReactJSX,
		module: ts.ModuleKind.NodeNext,
		moduleResolution: ts.ModuleResolutionKind.NodeNext,
		skipLibCheck: true,
		target: ts.ScriptTarget.ES2022,
	});
	const checker = program.getTypeChecker();
	const sourceFile = program.getSourceFile(upstreamEntry);
	const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);

	if (!sourceFile || !moduleSymbol) throw new Error('Unable to load the pinned Drei source entry.');

	const runtimeModule = await import('@react-three/drei');
	const runtimeNames = new Set(
		Object.keys(runtimeModule).filter(
			(name) => name !== 'default' && name !== '__esModule' && name !== 'module.exports',
		),
	);
	const valueFlags =
		ts.SymbolFlags.Function |
		ts.SymbolFlags.Class |
		ts.SymbolFlags.Variable |
		ts.SymbolFlags.ValueModule |
		ts.SymbolFlags.Enum |
		ts.SymbolFlags.Value;
	const typeFlags =
		ts.SymbolFlags.Interface |
		ts.SymbolFlags.TypeAlias |
		ts.SymbolFlags.TypeParameter |
		ts.SymbolFlags.Type |
		ts.SymbolFlags.NamespaceModule;

	const entries = checker
		.getExportsOfModule(moduleSymbol)
		.map((exportSymbol) => {
			const symbol =
				exportSymbol.flags & ts.SymbolFlags.Alias
					? checker.getAliasedSymbol(exportSymbol)
					: exportSymbol;
			const declaration = symbol.declarations?.[0] ?? exportSymbol.declarations?.[0];
			const sourcePath = declaration
				? path
						.relative(repositoryRoot, declaration.getSourceFile().fileName)
						.split(path.sep)
						.join('/')
				: 'packages/drei/upstream/src/index.ts';
			const line = declaration
				? declaration.getSourceFile().getLineAndCharacterOfPosition(declaration.getStart()).line + 1
				: 1;
			const hasRuntime = runtimeNames.has(exportSymbol.name);
			const hasType =
				Boolean(symbol.flags & typeFlags) || (!hasRuntime && Boolean(symbol.flags & valueFlags));

			return {
				name: exportSymbol.name,
				kind: hasRuntime && hasType ? 'value-and-type' : hasRuntime ? 'value' : 'type',
				source: { path: sourcePath, line },
			};
		})
		.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

	const sourceNames = new Set(entries.map((entry) => entry.name));
	const missingRuntimeNames = [...runtimeNames].filter((name) => !sourceNames.has(name)).sort();
	if (missingRuntimeNames.length > 0) {
		throw new Error(
			`Pinned runtime exports are absent from the pinned source surface: ${missingRuntimeNames.join(', ')}`,
		);
	}

	const digest = createHash('sha256')
		.update(
			entries
				.map(({ name, kind, source }) => `${name}\t${kind}\t${source.path}:${source.line}`)
				.join('\n'),
		)
		.digest('hex');

	return { entries, runtimeNames, digest };
}
