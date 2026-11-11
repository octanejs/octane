import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

type Factory = { module: string; name: string; from: string };
type Input = { factory: Factory } | { reexport: Factory };

/** Resolve application source used by a workspace store consumer. */
export function storeSources(
	root: string,
	config: ts.CompilerOptions | null,
	unchanged: (file: string, source: string) => boolean,
) {
	const options = { moduleResolution: ts.ModuleResolutionKind.Bundler, ...config };
	const cache = ts.createModuleResolutionCache(root, (file) => file, options);
	const modules = new Map<string, Map<string, Input>>();
	const project = fs.realpathSync(root);
	function inputs(file: string) {
		const saved = modules.get(file);
		if (saved) return saved;
		const exported = new Map<string, Input>();
		const locals = new Map<string, Input>();
		const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
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
						locals.set(item.name.text, {
							reexport: {
								module: s.moduleSpecifier.text,
								name: (item.propertyName ?? item.name).text,
								from: file,
							},
						});
				}
		}
		for (const s of sf.statements) {
			if (!ts.isVariableStatement(s) || !(s.declarationList.flags & ts.NodeFlags.Const)) continue;
			for (const d of s.declarationList.declarations) {
				if (
					!ts.isIdentifier(d.name) ||
					!d.initializer ||
					!ts.isCallExpression(d.initializer) ||
					!ts.isIdentifier(d.initializer.expression)
				)
					continue;
				const callee = locals.get(d.initializer.expression.text);
				if (!callee || !('reexport' in callee)) continue;
				const input = { factory: callee.reexport };
				locals.set(d.name.text, input);
				if (s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
					exported.set(d.name.text, input);
			}
		}
		for (const s of sf.statements) {
			if (
				!ts.isExportDeclaration(s) ||
				s.isTypeOnly ||
				s.attributes ||
				!s.exportClause ||
				!ts.isNamedExports(s.exportClause)
			)
				continue;
			for (const item of s.exportClause.elements) {
				if (item.isTypeOnly) continue;
				const name = (item.propertyName ?? item.name).text;
				const input = s.moduleSpecifier
					? ts.isStringLiteral(s.moduleSpecifier)
						? { reexport: { module: s.moduleSpecifier.text, name, from: file } }
						: undefined
					: locals.get(name);
				if (input) exported.set(item.name.text, input);
			}
		}
		modules.set(file, exported);
		return exported;
	}
	function localFile(from: string, specifier: string) {
		const file = ts.resolveModuleName(specifier, from, options, ts.sys, cache).resolvedModule
			?.resolvedFileName;
		if (
			!file ||
			!file.startsWith(root + path.sep) ||
			!/(?<!\.d)\.ts$/.test(file) ||
			file.includes(path.sep + 'node_modules' + path.sep)
		)
			return null;
		const physical = fs.realpathSync(file);
		if (
			!physical.startsWith(project + path.sep) ||
			physical.includes(path.sep + 'node_modules' + path.sep)
		)
			return null;
		// A JS sibling or directory can implement a different export even for a tsconfig alias.
		if (!specifier.endsWith('.ts')) {
			const stem = file.slice(0, -3);
			if (
				['.js', '.jsx', '.tsx', '.mjs', '.cjs', '.mts', '.cts', ''].some((ext) =>
					fs.existsSync(stem + ext),
				)
			)
				return null;
		}
		let runtime: string | undefined;
		try {
			runtime = createRequire(from).resolve(specifier);
		} catch {
			// A tsconfig alias or an authored TS file need not resolve through Node.
		}
		if (runtime && (!path.isAbsolute(runtime) || fs.realpathSync(runtime) !== physical))
			return null;
		return file;
	}

	// Trace named inputs to a factory the hook planner can check against the
	// original store's public exports.
	function inputFactory(from: string, specifier: string, name: string): Factory | null {
		let ref: Factory = { module: specifier, name, from };
		const seen = new Set<string>();
		for (;;) {
			const file = localFile(ref.from, ref.module);
			if (!file) return null;
			const key = file + '\0' + ref.name;
			if (seen.has(key)) return null;
			seen.add(key);
			const input = inputs(file).get(ref.name);
			if (!input) return null;
			if ('factory' in input) return input.factory;
			ref = input.reexport;
		}
	}

	const helpers = new Map<string, Set<string>>();
	function helperFunction(from: string, specifier: string, name: string) {
		if (/^use[A-Z0-9]/.test(name) || /[!%?#\\]/.test(specifier)) return false;
		const file = localFile(from, specifier);
		if (!file) return false;
		let exported = helpers.get(file);
		if (!exported) {
			exported = new Set();
			helpers.set(file, exported);
			// A linked path may be selected for a rewrite under its physical name.
			if (
				fs.realpathSync(file) !== path.join(project, path.relative(root, file)) ||
				fs.existsSync(file.slice(0, -3) + '.tsrx')
			)
				return false;
			const source = fs.readFileSync(file, 'utf8');
			if (!unchanged(file, source)) return false;
			const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
			for (const statement of sf.statements) {
				if (
					ts.isFunctionDeclaration(statement) &&
					statement.name &&
					statement.body &&
					statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
					!statement.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
				)
					exported.add(statement.name.text);
			}
		}
		return exported.has(name);
	}
	return { inputFactory, helperFunction };
}
