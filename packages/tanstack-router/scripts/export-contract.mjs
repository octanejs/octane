import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
const ts = createRequire(import.meta.url)('typescript');
const directory = resolve(import.meta.dirname, '..');

// Resolve authored TSRX declarations exactly as an external TypeScript consumer does.
function exportsOf(file) {
	const options = {
		strict: true,
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		jsx: ts.JsxEmit.ReactJSX,
		allowImportingTsExtensions: true,
		skipLibCheck: false,
	};
	const host = ts.createCompilerHost(options);
	host.resolveModuleNames = (names, from) =>
		names.map((name) => {
			if (name.endsWith('.tsrx')) {
				const declaration = resolve(dirname(from), name + '.d.ts');
				if (existsSync(declaration))
					return { resolvedFileName: declaration, extension: ts.Extension.Dts };
			}
			return ts.resolveModuleName(name, from, options, host).resolvedModule;
		});
	const program = ts.createProgram([file], options, host);
	const checker = program.getTypeChecker();
	const source = program.getSourceFile(file);
	if (!source) throw new Error('Missing entrypoint: ' + file);
	const symbol = checker.getSymbolAtLocation(source);
	if (!symbol) throw new Error('Entrypoint is not a module: ' + file);
	return checker
		.getExportsOfModule(symbol)
		.map((exported) => {
			const target =
				exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
			return { name: exported.name, kind: target.flags & ts.SymbolFlags.Value ? 'value' : 'type' };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function compareEntrypoint(entrypoint) {
	const leaf = entrypoint === '.' ? 'index' : entrypoint.slice(2);
	const upstream = exportsOf(
		resolve(directory, 'upstream/src', leaf + (entrypoint === '.' ? '.tsx' : '.ts')),
	);
	const local = exportsOf(resolve(directory, 'src', leaf + '.ts'));
	const missing = upstream.filter(
		(expected) =>
			!local.some((actual) => actual.name === expected.name && actual.kind === expected.kind),
	);
	return { entrypoint, upstream, local, missing };
}
