import fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

type Factory = { module: string; name: string; from: string };
type Input = { factory: Factory; wrapped?: boolean } | { reexport: Factory };

/** A local factory wrapper returns its callee's result unchanged. Only follow a
 * declaration when every use of its name is a direct call, including uses in closures. */
function wrapperFactories(sf: ts.SourceFile, imports: Map<string, Factory>) {
	const wrappers = new Map<string, { fn: ts.FunctionDeclaration; callee: string }>();
	for (const fn of sf.statements) {
		if (
			!ts.isFunctionDeclaration(fn) ||
			!fn.name ||
			fn.asteriskToken ||
			fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
			fn.body?.statements.length !== 1
		)
			continue;
		const ret = fn.body.statements[0];
		const call = ts.isReturnStatement(ret) && ret.expression;
		if (
			!call ||
			!ts.isCallExpression(call) ||
			call.questionDotToken ||
			!ts.isIdentifier(call.expression)
		)
			continue;
		const callee = call.expression.text;
		if (!fn.parameters.every((p) => ts.isIdentifier(p.name) && p.name.text !== callee)) continue;
		wrappers.set(fn.name.text, { fn, callee });
	}

	const found = new Map<string, Factory | null>();
	if (!wrappers.size) return found;
	function visit(node: ts.Node, parent?: ts.Node): void {
		if (ts.isIdentifier(node)) {
			if (node.text === 'eval') {
				wrappers.clear();
				return;
			}
			const wrapper = wrappers.get(node.text);
			if (
				wrapper &&
				node !== wrapper.fn.name &&
				!(parent && ts.isCallExpression(parent) && parent.expression === node)
			)
				wrappers.delete(node.text);
		}
		if (wrappers.size) ts.forEachChild(node, (child) => visit(child, node));
	}
	visit(sf);
	for (const name of wrappers.keys()) {
		let target = name;
		const chain: string[] = [];
		while (wrappers.has(target) && !found.has(target)) {
			found.set(target, null); // A cycle never reaches an imported factory.
			chain.push(target);
			target = wrappers.get(target)!.callee;
		}
		const factory = found.get(target) ?? imports.get(target) ?? null;
		for (const link of chain) found.set(link, factory);
	}
	return found;
}

/** Resolve application source used by a workspace store consumer. */
export function storeSources(
	root: string,
	config: ts.CompilerOptions | null,
	unchanged: (file: string, source: string, unselected?: boolean) => boolean,
) {
	const rootConfig = ts.findConfigFile(root, ts.sys.fileExists);
	const options = { moduleResolution: ts.ModuleResolutionKind.Bundler, ...config };
	const cache = ts.createModuleResolutionCache(root, (file) => file, options);
	const modules = new Map<string, Map<string, Input>>();
	const project = fs.realpathSync(root);
	function canUseOriginal(file: string) {
		// A linked path may be selected for a rewrite under its physical name.
		return (
			fs.realpathSync(file) === path.join(project, path.relative(root, file)) &&
			!fs.existsSync(file.slice(0, -3) + '.tsrx')
		);
	}
	function inputs(file: string) {
		const saved = modules.get(file);
		if (saved) return saved;
		const exported = new Map<string, Input>();
		const locals = new Map<string, Input>();
		const imports = new Map<string, Factory>();
		let wrappers: ReturnType<typeof wrapperFactories> | undefined;
		let originalWrapperSource: boolean | undefined;
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
					if (item.isTypeOnly) continue;
					const ref = {
						module: s.moduleSpecifier.text,
						name: (item.propertyName ?? item.name).text,
						from: file,
					};
					locals.set(item.name.text, { reexport: ref });
					if (!s.attributes) imports.set(item.name.text, ref);
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
				let input: Input;
				if (callee && 'reexport' in callee) {
					input = { factory: callee.reexport };
				} else {
					if (d.initializer.questionDotToken) continue;
					wrappers ??= wrapperFactories(sf, imports);
					const factory = wrappers.get(d.initializer.expression.text);
					if (
						!factory ||
						!(originalWrapperSource ??= canUseOriginal(file) && unchanged(file, sf.text, true))
					)
						continue;
					input = { factory, wrapped: true };
				}
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
			if ('factory' in input) {
				if (
					input.wrapped &&
					(ref.from !== from ||
						ts.findConfigFile(path.dirname(from), ts.sys.fileExists) !== rootConfig)
				)
					return null;
				return input.factory;
			}
			ref = input.reexport;
		}
	}

	// A byte-identical helper can still reach a module whose renderer changed.
	function originalHelper(file: string) {
		const pending = [file];
		const seen = new Set<string>();
		let entry: ts.SourceFile | undefined;
		while (pending.length) {
			const current = pending.pop()!;
			if (seen.has(current)) continue;
			seen.add(current);
			if (!canUseOriginal(current)) return;
			const source = fs.readFileSync(current, 'utf8');
			if (!unchanged(current, source)) return;
			const sf = ts.createSourceFile(current, source, ts.ScriptTarget.Latest);
			entry ??= sf;
			function unsafe(node: ts.Node): boolean {
				if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
					const spec = node.moduleSpecifier;
					const typeOnly = ts.isImportDeclaration(node)
						? node.importClause?.isTypeOnly
						: node.isTypeOnly;
					if (!spec || typeOnly) return false;
					if (node.attributes || !ts.isStringLiteral(spec)) return true;
					if (spec.text === 'node:module' || spec.text === 'module') return true;
					const local = localFile(current, spec.text);
					if (local) {
						pending.push(local);
						return false;
					}
					const resolved = ts.resolveModuleName(
						spec.text,
						current,
						options,
						ts.sys,
						cache,
					).resolvedModule;
					if (!resolved) return !isBuiltin(spec.text);
					if (!resolved.isExternalLibraryImport) return true;
					const physical = fs.realpathSync(resolved.resolvedFileName);
					return (
						physical.startsWith(project + path.sep) &&
						!physical.includes(path.sep + 'node_modules' + path.sep)
					);
				}
				if (ts.isImportEqualsDeclaration(node)) return !node.isTypeOnly;
				if (ts.isExpressionWithTypeArguments(node)) return unsafe(node.expression);
				if (ts.isTypeNode(node)) return false;
				if (
					node.kind === ts.SyntaxKind.ImportKeyword ||
					(ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) ||
					(ts.isIdentifier(node) && (node.text === 'eval' || node.text === 'require'))
				)
					return true;
				return !!ts.forEachChild(node, unsafe);
			}
			if (ts.forEachChild(sf, unsafe)) return;
		}
		return entry;
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
			const sf = originalHelper(file);
			if (!sf) return false;
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
