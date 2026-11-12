import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

export interface ScopedStoreHookPlan {
	/** The authored native module and the actual export behind any re-export. */
	entry: string;
	name: string;
	files: ReadonlyMap<string, string>;
	/** Checks a store factory against its original, renderer-independent declaration. */
	isSharedExport(module: string, imported: string, from: string): boolean;
}

// The application's React compiler must not synthesize dispatcher calls in Octane hooks.
const nativeDirective = "'use no memo';\n";
const hooks = new Set([
	'use',
	'useContext',
	'useRef',
	'useMemo',
	'useCallback',
	'useLayoutEffect',
	'useSyncExternalStore',
]);
const sourceFile = /(?<!\.d)\.[cm]?tsx?$/;
const renderer = (spec: string) => /^(?:react|react-dom)(?:\/|$)/.test(spec);
const nodeModules = /[/\\]node_modules[/\\]/;
const request = (n: ts.Node) => (ts.isStringLiteral(n) ? n.text : null);
function walk(node: ts.Node, visit: (n: ts.Node) => void) {
	visit(node);
	ts.forEachChild(node, (n) => walk(n, visit));
}
function referenced(checker: ts.TypeChecker, n: ts.Node) {
	const s = checker.getSymbolAtLocation(n);
	return s && (s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
}
function relative(from: string, to: string) {
	const spec = path.relative(path.dirname(from), to).split(path.sep).join('/').replace(/\.ts$/, '');
	return spec.startsWith('../') || spec.startsWith('./') ? spec : './' + spec;
}
function runtime(s: ts.ImportDeclaration | ts.ExportDeclaration) {
	if ((ts.isImportDeclaration(s) ? s.importClause : s)?.isTypeOnly) return false;
	const bindings = ts.isExportDeclaration(s)
		? s.exportClause
		: s.importClause?.name
			? undefined
			: s.importClause?.namedBindings;
	const items =
		bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
			? bindings.elements
			: undefined;
	// An empty import/export still evaluates its module when preserved.
	return !items?.length || items.some((item) => !item.isTypeOnly);
}

export { runtime as hasRuntimeDependency };

function resolveOptions(importer: string): ts.CompilerOptions {
	const file = ts.findConfigFile(path.dirname(importer), ts.sys.fileExists);
	const settings = file && ts.readConfigFile(file, ts.sys.readFile);
	const options =
		settings &&
		!settings.error &&
		ts.parseJsonConfigFileContent(
			settings.config,
			{ ...ts.sys, readDirectory: () => [] },
			path.dirname(file!),
		).options;
	return (
		options || { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler }
	);
}
function installed(spec: string, from: string) {
	try {
		return fs.realpathSync(createRequire(from).resolve(spec));
	} catch {
		return null;
	}
}
function manifest(file: string) {
	try {
		return JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return null;
	}
}
/** Audit every executable target of a bare dependency, including browser and server conditions. */
function runtimeTargets(spec: string, resolved: string, from: string): string[] {
	if (spec.startsWith('.')) {
		const executable = installed(spec, from);
		return executable && executable !== resolved ? [resolved, executable] : [resolved];
	}
	const parts = spec.split('/'),
		length = spec.startsWith('@') ? 2 : 1;
	const name = parts.slice(0, length).join('/'),
		subpath = ['.', ...parts.slice(length)].join('/');
	let dir = path.dirname(resolved);
	while (path.dirname(dir) !== dir) {
		const pkg = manifest(path.join(dir, 'package.json'));
		if (typeof pkg?.name === 'string' && renderer(pkg.name)) return [];
		if (pkg?.name === name) {
			if (pkg.browser) return [];
			if (!pkg.exports) {
				if (subpath !== '.') return [resolved];
				return [
					...new Set([
						resolved,
						...[pkg.main, pkg.module]
							.filter((value): value is string => typeof value === 'string')
							.map((value) => path.resolve(dir, value)),
					]),
				];
			}
			const map =
				typeof pkg.exports === 'object' && Object.keys(pkg.exports).some((k) => k.startsWith('.'))
					? pkg.exports
					: { '.': pkg.exports };
			let branch = map[subpath],
				wildcard = '';
			if (!branch) {
				const key = Object.keys(map)
					.filter((k) => k.includes('*'))
					.sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length)
					.find((k) => {
						const [start, end] = k.split('*');
						return subpath.startsWith(start) && subpath.endsWith(end);
					});
				if (!key) return [];
				const [start, end] = key.split('*');
				wildcard = subpath.slice(start.length, subpath.length - end.length);
				branch = map[key];
			}
			const leaves = (v: unknown): string[] => {
				if (typeof v === 'string')
					return v.startsWith('./') ? [path.resolve(dir, v.replaceAll('*', wildcard))] : [];
				if (Array.isArray(v)) return v.flatMap(leaves);
				return v && typeof v === 'object'
					? Object.entries(v).flatMap(([k, x]) =>
							k === 'types' || k.startsWith('types@') ? [] : leaves(x),
						)
					: [];
			};
			return [...new Set(leaves(branch))];
		}
		dir = path.dirname(dir);
	}
	return [];
}

function modulePlan(
	pkg: string,
	project: string,
	entry: string,
	candidates: string[],
	link: string,
	options: ts.CompilerOptions,
	outputDir: string,
	bridge: string,
) {
	const program = ts.createProgram([entry, ...candidates], { ...options, noEmit: true });
	const checker = program.getTypeChecker();
	const root = program.getSourceFile(entry);
	if (!root) return null;
	function exports(sf: ts.SourceFile) {
		const sym = checker.getSymbolAtLocation(sf);
		return sym
			? checker
					.getExportsOfModule(sym)
					.filter(
						(s) =>
							(s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s).flags &
							ts.SymbolFlags.Value,
					)
			: [];
	}
	const exportsOfRoot = exports(root);
	const identity = (s: ts.Symbol) =>
		s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
	const publicValues = new Set(exportsOfRoot.map(identity));
	const owned = (file: string) =>
		file.startsWith(pkg + path.sep) && !nodeModules.test(path.relative(pkg, file));
	const cache = ts.createModuleResolutionCache(project, (s) => s, options);
	const runtimeHost = {
		...ts.sys,
		fileExists: (file: string) => !/\.d\.[cm]?ts$/.test(file) && ts.sys.fileExists(file),
	};
	const jsOptions = {
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		module: ts.ModuleKind.ESNext,
		allowJs: true,
		customConditions: options.customConditions,
	};
	const jsCache = ts.createModuleResolutionCache(project, (s) => s, jsOptions);
	const metadata = manifest(path.join(pkg, 'package.json'));
	const packageId = metadata.name + '\0' + (metadata.version ?? '');
	const shim = path.join(path.dirname(bridge), 'octane-store-hooks.ts');
	function target(spec: string, from: string) {
		return ts.resolveModuleName(spec, from, options, ts.sys, cache).resolvedModule
			?.resolvedFileName;
	}
	function output(sf: ts.SourceFile) {
		const id = createHash('sha256')
			.update(packageId + '\0' + path.relative(pkg, sf.fileName).split(path.sep).join('/'))
			.digest('hex')
			.slice(0, 16);
		const stem = path
			.basename(sf.fileName)
			.replace(/\.[^.]+$/, '')
			.replace(/[^a-zA-Z0-9_-]/g, '-');
		return path.join(outputDir, 'octane-' + stem + '-' + id + '-impl.ts');
	}

	// Follow executable imports, including published JavaScript. A declaration
	// file cannot establish that a shared store can run outside React.
	const neutral = new Set<string>();
	function validateShared(file: string, visiting: Set<string>, contextFactory: boolean): boolean {
		if (neutral.has(file) || visiting.has(file)) return true;
		if (!/\.[cm]?[jt]sx?$/.test(file) || /\.d\.[cm]?ts$/.test(file)) return false;
		visiting.add(file);
		const sf =
			program.getSourceFile(file) ??
			ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
		let valid = true;
		function edge(spec: string, commonjs = false) {
			if (!valid) return;
			if (renderer(spec)) {
				valid = false;
				return;
			}
			const resolved = ts.resolveModuleName(
				spec,
				file,
				jsOptions,
				runtimeHost,
				jsCache,
				undefined,
				commonjs ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext,
			).resolvedModule?.resolvedFileName;
			const targets = resolved ? runtimeTargets(spec, resolved, file) : [];
			if (
				!targets.length ||
				!targets.every((f) => validateShared(fs.realpathSync(f), visiting, false))
			)
				valid = false;
		}
		walk(sf, (n) => {
			if (!valid) return;
			if (
				(ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
				n.moduleSpecifier &&
				runtime(n)
			) {
				const spec = request(n.moduleSpecifier);
				if (!spec) {
					valid = false;
					return;
				}
				if (renderer(spec)) {
					const imported = ts.isImportDeclaration(n) && n.importClause;
					const named = imported && !imported.name && imported.namedBindings;
					valid = Boolean(
						owned(file) &&
						contextFactory &&
						spec === 'react' &&
						named &&
						ts.isNamedImports(named) &&
						named.elements.every(
							(x) => x.isTypeOnly || (x.propertyName ?? x.name).text === 'createContext',
						),
					);
				} else edge(spec);
			}
			if (
				ts.isJsxElement(n) ||
				ts.isJsxSelfClosingElement(n) ||
				ts.isJsxFragment(n) ||
				n.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(n) && n.text === 'eval')
			)
				valid = false;
			if (ts.isIdentifier(n) && n.text === 'require') {
				const call = n.parent;
				if (
					!ts.isCallExpression(call) ||
					call.expression !== n ||
					call.arguments.length !== 1 ||
					!ts.isStringLiteral(call.arguments[0])
				)
					valid = false;
				else edge(call.arguments[0].text, true);
			}
		});

		return valid;
	}
	for (const file of candidates) {
		const core = program.getSourceFile(file);
		if (!core || !exports(core).some((s) => publicValues.has(identity(s)))) continue;
		const graph = new Set<string>();
		if (validateShared(file, graph, false)) for (const dep of graph) neutral.add(dep);
	}
	if (!neutral.size) return null;

	const contextReaders = new Set<ts.Symbol>();
	function discover(
		sf: ts.SourceFile,
		files: Map<string, string>,
		seen: Set<string>,
		shared: Set<string>,
	): boolean {
		if (seen.has(sf.fileName)) return true;
		if (!owned(sf.fileName) || !sourceFile.test(sf.fileName) || sf.isDeclarationFile) return false;
		seen.add(sf.fileName);
		const out = output(sf),
			edits: { start: number; end: number; text: string }[] = [];
		const replace = (n: ts.Node, text: string) =>
			edits.push({ start: n.getStart(sf), end: n.end, text });
		const contextual = new Map<ts.Symbol, ts.Symbol>();
		const importedHooks = new Map<ts.Symbol, string>();
		const helpers = new Set<ts.Symbol>();
		const cleanups = new Set<ts.Symbol>();
		const subscriptions = new Set<ts.Symbol>();
		const native = new Set<ts.Symbol>();
		const hookOwner = (node: ts.Node) => {
			const owner = ts.findAncestor(node, ts.isFunctionLike);
			return owner &&
				ts.isFunctionDeclaration(owner) &&
				owner.parent === sf &&
				owner.name &&
				/^use[A-Z0-9]/.test(owner.name.text)
				? owner
				: null;
		};
		for (const s of sf.statements) {
			if (ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) continue;
			if (ts.isFunctionDeclaration(s)) {
				if (
					!s.name ||
					s.asteriskToken ||
					s.modifiers?.some(
						(m) => m.kind === ts.SyntaxKind.AsyncKeyword || m.kind === ts.SyntaxKind.DefaultKeyword,
					) ||
					(s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
						!/^use[A-Z0-9]/.test(s.name.text))
				)
					return false;
				const sym = checker.getSymbolAtLocation(s.name);
				if (!sym?.declarations?.some((d) => ts.isFunctionDeclaration(d) && d.body)) return false;
				helpers.add(sym);
				continue;
			}
			if (ts.isVariableStatement(s)) {
				if (
					s.modifiers?.length ||
					!(s.declarationList.flags & ts.NodeFlags.Const) ||
					!s.declarationList.declarations.every(
						(d) =>
							d.initializer &&
							ts.isIdentifier(d.name) &&
							(ts.isArrowFunction(d.initializer) ||
								ts.isStringLiteralLike(d.initializer) ||
								ts.isNumericLiteral(d.initializer) ||
								ts.isBigIntLiteral(d.initializer) ||
								[
									ts.SyntaxKind.FalseKeyword,
									ts.SyntaxKind.TrueKeyword,
									ts.SyntaxKind.NullKeyword,
								].includes(d.initializer.kind)),
					)
				)
					return false;
				for (const d of s.declarationList.declarations) {
					if (!d.initializer || !ts.isArrowFunction(d.initializer)) continue;
					const sym = checker.getSymbolAtLocation(d.name);
					if (!sym || d.initializer.parameters.length) return false;
					const body = d.initializer.body;
					if (ts.isBlock(body) && !body.statements.length) cleanups.add(sym);
					else if (ts.isIdentifier(body) && cleanups.has(checker.getSymbolAtLocation(body)!))
						subscriptions.add(sym);
					else return false;
					helpers.add(sym);
				}
				continue;
			}
			if (
				!ts.isImportDeclaration(s) ||
				!s.importClause ||
				s.attributes ||
				!ts.isStringLiteral(s.moduleSpecifier)
			)
				return false;
			const spec = s.moduleSpecifier.text,
				clause = s.importClause;
			if (spec === 'react' && runtime(s)) {
				const named = clause.namedBindings;
				if (clause.name || !named || !ts.isNamedImports(named)) return false;
				const react = checker.getSymbolAtLocation(s.moduleSpecifier);
				const ctx = react && checker.getExportsOfModule(react).find((x) => x.name === 'Context');

				const imports: string[] = [],
					contexts: string[] = [];
				for (const item of named.elements) {
					const n = (item.propertyName ?? item.name).text,
						sym = checker.getSymbolAtLocation(item.name);
					if (item.isTypeOnly || !hooks.has(n) || !sym) return false;
					native.add(sym);
					importedHooks.set(sym, n);
					if (n === 'use' || n === 'useContext') {
						if (!ctx) return false;
						contextual.set(sym, identity(ctx));
						contexts.push('useStoreContext as ' + item.name.text);
					} else imports.push(item.getText(sf));
				}
				if (!contexts.length) replace(s.moduleSpecifier, JSON.stringify(relative(out, shim)));
				else {
					if (/\/\*|\/\//.test(s.getText(sf))) return false;
					const lines = [
						'import { ' +
							contexts.join(', ') +
							' } from ' +
							JSON.stringify(relative(out, bridge)) +
							';',
					];
					if (imports.length)
						lines.push(
							'import { ' +
								imports.join(', ') +
								' } from ' +
								JSON.stringify(relative(out, shim)) +
								';',
						);
					replace(s, lines.join('\n'));
				}
				continue;
			}
			if (runtime(s) && !spec.startsWith('.')) return false;
			const resolved = target(spec, sf.fileName);
			if (!resolved) return false;
			const file = fs.realpathSync(resolved);
			// JS and TS siblings can both be renderer-neutral while implementing different stores.
			const originalRuntime = runtime(s) && installed(spec, sf.fileName);
			if (originalRuntime && originalRuntime !== file) return false;
			if (!owned(file)) {
				if (runtime(s)) return false;
				// Type-only imports must resolve to the same declaration from the new module.
				const moved = target(spec, out);
				if (moved && fs.realpathSync(moved) === file) continue;
				return false;
			}
			const child = program.getSourceFile(file);
			if (!child) return false;
			const hookModule = child.statements.some(
				(x) =>
					ts.isImportDeclaration(x) &&
					ts.isStringLiteral(x.moduleSpecifier) &&
					x.moduleSpecifier.text === 'react' &&
					runtime(x) &&
					x.importClause?.namedBindings &&
					ts.isNamedImports(x.importClause.namedBindings) &&
					x.importClause.namedBindings.elements.some(
						(n) => !n.isTypeOnly && hooks.has((n.propertyName ?? n.name).text),
					),
			);
			if (runtime(s) && hookModule) {
				const named = clause.namedBindings;
				if (
					clause.name ||
					!named ||
					!ts.isNamedImports(named) ||
					!named.elements.every(
						(x) => x.isTypeOnly || /^use[A-Z0-9]/.test((x.propertyName ?? x.name).text),
					) ||
					!discover(child, files, seen, shared)
				)
					return false;
				for (const x of named.elements) {
					const sym = checker.getSymbolAtLocation(x.name);
					if (sym && !x.isTypeOnly) native.add(sym);
				}
				replace(s.moduleSpecifier, JSON.stringify(relative(out, output(child))));
			} else {
				if (runtime(s) && !validateShared(file, new Set(), true)) return false;
				if (runtime(s) && neutral.has(file)) shared.add(file);
				const moved = relative(out, path.join(link, path.relative(pkg, file))).replace(
					/\.[cm]?tsx?$/,
					'',
				);
				const resolved = target(moved, out);
				const movedRuntime = runtime(s) && installed(moved, out);
				if (
					!resolved ||
					fs.realpathSync(resolved) !== file ||
					(movedRuntime && movedRuntime !== file)
				)
					return false;
				replace(s.moduleSpecifier, JSON.stringify(moved));
			}
		}
		// A fallback callback may be selected for this render. Validate all uses
		// of its const alias too, including references in an earlier closure.
		const fallbackRefs = new Set<ts.Identifier>();
		walk(sf, (n) => {
			if (
				!ts.isVariableDeclaration(n) ||
				!ts.isIdentifier(n.name) ||
				!n.initializer ||
				!ts.isVariableDeclarationList(n.parent) ||
				!(n.parent.flags & ts.NodeFlags.Const) ||
				!ts.isBinaryExpression(n.initializer) ||
				n.initializer.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken
			)
				return;
			const right = n.initializer.right;
			const sym = checker.getSymbolAtLocation(n.name);
			if (ts.isIdentifier(right) && cleanups.has(checker.getSymbolAtLocation(right)!) && sym) {
				helpers.add(sym);
				fallbackRefs.add(right);
			}
		});

		let valid = true;
		walk(sf, (node) => {
			if (!valid) return;
			if (
				ts.isJsxElement(node) ||
				ts.isJsxSelfClosingElement(node) ||
				ts.isJsxFragment(node) ||
				node.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node) &&
					[
						'require',
						'eval',
						'Function',
						'globalThis',
						'window',
						'document',
						'exports',
						'module',
						'__dirname',
						'__filename',
					].includes(node.text)) ||
				ts.isMetaProperty(node)
			) {
				valid = false;
				return;
			}
			if (!ts.isIdentifier(node) || ts.isImportSpecifier(node.parent)) return;
			const sym = ts.isShorthandPropertyAssignment(node.parent)
				? checker.getShorthandAssignmentValueSymbol(node.parent)
				: checker.getSymbolAtLocation(node);
			if (!sym) return;
			const call = node.parent;
			if (helpers.has(sym)) {
				if (fallbackRefs.has(node)) return;
				if (
					(ts.isFunctionDeclaration(call) || ts.isVariableDeclaration(call)) &&
					call.name === node
				)
					return;
				if (ts.isCallExpression(call) && call.expression === node && !subscriptions.has(sym)) {
					if (/^use[A-Z0-9]/.test(node.text) && !hookOwner(node)) valid = false;
					return;
				}
				const enclosing = ts.isArrayLiteralExpression(call) ? call.parent : call;
				if (ts.isCallExpression(enclosing) && ts.isIdentifier(enclosing.expression)) {
					const hook = importedHooks.get(checker.getSymbolAtLocation(enclosing.expression)!);
					const arg = enclosing.arguments.indexOf(ts.isArrayLiteralExpression(call) ? call : node);
					if (hook === 'useSyncExternalStore' && (subscriptions.has(sym) ? arg === 0 : arg >= 0))
						return;
					if (hook === 'useLayoutEffect' && !subscriptions.has(sym) && arg >= 0) return;
				}
				if (
					cleanups.has(sym) &&
					ts.isArrowFunction(call) &&
					call.body === node &&
					ts.isVariableDeclaration(call.parent) &&
					subscriptions.has(checker.getSymbolAtLocation(call.parent.name)!)
				)
					return;
				valid = false;
				return;
			}
			if (!native.has(sym)) return;
			if (!ts.isCallExpression(call) || call.expression !== node || !hookOwner(node)) {
				valid = false;
				return;
			}
			const ctx = contextual.get(sym);
			if (ctx) contextReaders.add(checker.getSymbolAtLocation(hookOwner(node)!.name!)!);
			if (
				ctx &&
				(call.arguments.length !== 1 ||
					checker.getTypeAtLocation(call.arguments[0]).getSymbol() !== ctx)
			)
				valid = false;
		});
		if (!valid || !native.size) return false;
		let code = sf.text;
		for (const e of edits.sort((a, b) => b.start - a.start))
			code = code.slice(0, e.start) + e.text + code.slice(e.end);
		const start = sf.statements[0].getStart(sf);
		files.set(out, code.slice(0, start) + nativeDirective + code.slice(start));
		return true;
	}
	function readsContext(
		fn: ts.FunctionDeclaration,
		seen: Set<ts.Symbol>,
		files: Map<string, string>,
	): boolean {
		const symbol = fn.name && checker.getSymbolAtLocation(fn.name);
		if (!symbol || !fn.body || !files.has(output(fn.getSourceFile())) || seen.has(symbol))
			return false;
		if (contextReaders.has(symbol)) return true;
		seen.add(symbol);
		// A thin exported forwarding hook may share another hook's contextual read.
		const [only] = fn.body.statements;
		if (
			fn.body.statements.length !== 1 ||
			!ts.isReturnStatement(only) ||
			!only.expression ||
			!ts.isCallExpression(only.expression) ||
			!ts.isIdentifier(only.expression.expression)
		)
			return false;
		const called = referenced(checker, only.expression.expression);
		const body = called?.declarations?.find(
			(d): d is ts.FunctionDeclaration => ts.isFunctionDeclaration(d) && !!d.body,
		);
		return !!body && readsContext(body, seen, files);
	}

	const sharedExports = new Map<string, boolean>();
	function isSharedExport(module: string, imported: string, from: string): boolean {
		if (!module || module.startsWith('.') || path.isAbsolute(module)) return false;
		const key = path.dirname(from) + '\0' + module + '\0' + imported;
		if (!sharedExports.has(key)) {
			const file = installed(module, from),
				resolved = target(module, from);
			const sf =
				file &&
				resolved &&
				fs.realpathSync(resolved) === file &&
				(file === entry || (candidates.includes(file) && neutral.has(file)))
					? program.getSourceFile(file)
					: undefined;
			const value = sf && exports(sf).find((s) => s.name === imported);
			const symbol = value && identity(value),
				d = symbol?.valueDeclaration;
			sharedExports.set(
				key,
				!!(
					d &&
					neutral.has(d.getSourceFile().fileName) &&
					checker.getTypeOfSymbolAtLocation(symbol!, d).getCallSignatures().length
				),
			);
		}
		return sharedExports.get(key) ?? false;
	}
	const result = new Map<string, ScopedStoreHookPlan | null>();
	return (requested: string) => {
		if (!result.has(requested)) {
			let plan: ScopedStoreHookPlan | null = null;
			const ex = exportsOfRoot.find((s) => s.name === requested),
				sym = ex && identity(ex);
			const fn = sym?.declarations?.find(
				(s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && !!s.body,
			);
			if (fn?.name && /^use[A-Z0-9]/.test(fn.name.text)) {
				const sf = fn.getSourceFile(),
					files = new Map<string, string>();
				const shared = new Set<string>();
				if (
					discover(sf, files, new Set(), shared) &&
					shared.size &&
					readsContext(fn, new Set(), files)
				) {
					const raw = output(sf),
						entry = raw.replace(/-impl\.ts$/, '.ts');
					const bound = exports(sf).flatMap((sym) => {
						const impl = identity(sym).declarations?.find(
							(d): d is ts.FunctionDeclaration => ts.isFunctionDeclaration(d) && !!d.body,
						);
						return impl &&
							impl.getSourceFile() === sf &&
							impl.name &&
							readsContext(impl, new Set(), files)
							? [impl.name.text]
							: [];
					});
					const code = [
						`import { bindStoreHook } from ${JSON.stringify(relative(entry, shim))};`,
						`import * as implementations from ${JSON.stringify(relative(entry, raw))};`,
						...bound.map(
							(name) => `export const ${name} = bindStoreHook(implementations.${name});`,
						),
						'',
					].join('\n');
					files.set(entry, nativeDirective + code);
					plan = { entry, name: fn.name.text, files, isSharedExport };
				}
			}
			result.set(requested, plan);
		}
		return result.get(requested) ?? null;
	};
}

/** Read linked, authored packages only. All output belongs to the consuming project. */
export function createScopedStorePlanner(
	outputDir: string,
	contextBridge: string,
	compilerOptions?: ts.CompilerOptions,
) {
	type Lookup = (name: string) => ScopedStoreHookPlan | null;
	// All generated companions live together. Nested consumers can each declare
	// a different symlink to the same workspace dependency.
	const outputManifest = ts.findConfigFile(outputDir, ts.sys.fileExists, 'package.json');
	function outputLink(pkg: string, packageName: string, imported: string, fallback: string) {
		if (outputManifest) {
			const modules = path.join(path.dirname(outputManifest), 'node_modules');
			for (const name of [packageName, imported]) {
				const link = path.join(modules, name);
				if (fs.existsSync(link) && fs.realpathSync(link) === pkg) return link;
			}
		}
		return fallback;
	}
	const packages = new Map<string, Lookup | null>();
	const lookups = new Map<string, Lookup | null>();
	function lookup(specifier: string, importer: string): Lookup | null {
		const app = ts.findConfigFile(path.dirname(importer), ts.sys.fileExists, 'package.json');
		if (!app) return null;
		const project = path.dirname(app),
			meta = manifest(app);
		const dep =
			meta?.dependencies?.[specifier] ??
			meta?.devDependencies?.[specifier] ??
			meta?.peerDependencies?.[specifier];
		if (typeof dep !== 'string' || !dep.startsWith('workspace:')) return null;
		const link = path.join(project, 'node_modules', specifier);
		if (!fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) return null;
		const pkg = fs.realpathSync(link),
			manifestFile = manifest(path.join(pkg, 'package.json'));
		if (
			!manifestFile ||
			nodeModules.test(pkg) ||
			manifestFile.browser ||
			(manifestFile.name !== specifier && !dep.startsWith('workspace:' + manifestFile.name + '@'))
		)
			return null;
		const publicEntries = manifestFile.exports;
		if (
			!publicEntries ||
			typeof publicEntries !== 'object' ||
			typeof publicEntries['.'] !== 'string'
		)
			return null;
		const options = compilerOptions ?? resolveOptions(importer);
		const resolveEntry = (key: string) => {
			const spec = key === '.' ? specifier : specifier + key.slice(1);
			const runtime = installed(spec, importer);
			const typed = ts.resolveModuleName(spec, importer, options, ts.sys).resolvedModule
				?.resolvedFileName;
			return runtime &&
				sourceFile.test(runtime) &&
				runtime.startsWith(pkg + path.sep) &&
				typed &&
				fs.realpathSync(typed) === runtime
				? runtime
				: null;
		};
		const entry = resolveEntry('.');
		if (!entry) return null;
		const react = installed('react', importer),
			octane = installed('octane', importer);
		if (
			!react ||
			!octane ||
			installed('react', entry) !== react ||
			installed('react', contextBridge) !== react ||
			installed('octane', contextBridge) !== octane
		)
			return null;
		const config = compilerOptions
			? ''
			: (ts.findConfigFile(path.dirname(importer), ts.sys.fileExists) ?? '');
		const generatedLink = outputLink(pkg, manifestFile.name, specifier, link);
		if (generatedLink !== link) {
			const relocated = path.join(generatedLink, path.relative(pkg, entry));
			// Raw require resolution retains the logical path when Node preserves symlinks.
			if (
				options.preserveSymlinks ||
				ts.findConfigFile(path.dirname(importer), ts.sys.fileExists) !==
					ts.findConfigFile(outputDir, ts.sys.fileExists) ||
				createRequire(importer).resolve(specifier) !== entry ||
				installed('react', relocated) !== react ||
				installed('octane', relocated) !== octane
			)
				return null;
		}
		const key = [generatedLink, entry, config].join('\0');
		if (!packages.has(key)) {
			const candidates: string[] = [];
			for (const [key, value] of Object.entries(publicEntries)) {
				if (
					!key.startsWith('./') ||
					key.includes('*') ||
					typeof value !== 'string' ||
					!sourceFile.test(value)
				)
					continue;
				const file = resolveEntry(key);
				if (file && file !== entry) candidates.push(file);
			}
			packages.set(
				key,
				candidates.length
					? modulePlan(
							pkg,
							project,
							entry,
							candidates,
							generatedLink,
							options,
							outputDir,
							contextBridge,
						)
					: null,
			);
		}
		return packages.get(key) ?? null;
	}
	return (
		specifier: string,
		importedName: string,
		importer: string,
	): ScopedStoreHookPlan | null => {
		if (!/^use[A-Z0-9]/.test(importedName) || !/^(?:@[\w.-]+\/)?[\w-][\w.-]*$/.test(specifier))
			return null;
		const key = path.dirname(importer) + '\0' + specifier;
		try {
			if (!lookups.has(key)) lookups.set(key, lookup(specifier, importer));
			return lookups.get(key)?.(importedName) ?? null;
		} catch (error) {
			if (
				error instanceof Error &&
				'code' in error &&
				['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES'].includes(String(error.code))
			)
				return null;
			throw error;
		}
	};
}
