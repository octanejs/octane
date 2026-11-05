import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

type Factory = { module: string; name: string; from: string };

/** Trace named application inputs to the factory that created them. The hook's
 * package planner checks the factory against the original store's public exports. */
export function storeInputFactories(root: string, config: ts.CompilerOptions | null) {
	const options = { moduleResolution: ts.ModuleResolutionKind.Bundler, ...config };
	const cache = ts.createModuleResolutionCache(root, (file) => file, options);
	const modules = new Map<string, Map<string, Factory>>();
	return (from: string, specifier: string, name: string) => {
		const file = ts.resolveModuleName(specifier, from, options, ts.sys, cache).resolvedModule
			?.resolvedFileName;
		if (
			!file ||
			!file.startsWith(root + path.sep) ||
			!/(?<!\.d)\.ts$/.test(file) ||
			file.includes(path.sep + 'node_modules' + path.sep)
		)
			return null;
		let factories = modules.get(file);
		if (!factories) {
			factories = new Map();
			const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
			const imports = new Map<string, Factory>();
			for (const s of sf.statements) {
				if (
					!ts.isImportDeclaration(s) ||
					!ts.isStringLiteral(s.moduleSpecifier) ||
					s.importClause?.isTypeOnly
				)
					continue;
				const named = s.importClause?.namedBindings;
				if (named && ts.isNamedImports(named))
					for (const item of named.elements) {
						if (!item.isTypeOnly)
							imports.set(item.name.text, {
								module: s.moduleSpecifier.text,
								name: (item.propertyName ?? item.name).text,
								from: file,
							});
					}
			}
			for (const s of sf.statements) {
				if (
					!ts.isVariableStatement(s) ||
					!(s.declarationList.flags & ts.NodeFlags.Const) ||
					!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
				)
					continue;
				for (const d of s.declarationList.declarations) {
					if (
						!ts.isIdentifier(d.name) ||
						!d.initializer ||
						!ts.isCallExpression(d.initializer) ||
						!ts.isIdentifier(d.initializer.expression)
					)
						continue;
					const factory = imports.get(d.initializer.expression.text);
					if (factory) factories.set(d.name.text, factory);
				}
			}
			modules.set(file, factories);
		}
		return factories.get(name);
	};
}
