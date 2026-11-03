import type { runCodemod } from './project.js';
import type { CodemodResult, ScopedSignalBinding, ScopedSignalOptions } from './types.js';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function walk(node: ts.Node, visit: (node: ts.Node) => void) {
	visit(node);
	ts.forEachChild(node, (child) => walk(child, visit));
}

function localSymbol(checker: ts.TypeChecker, node: ts.Identifier) {
	if (ts.isShorthandPropertyAssignment(node.parent))
		return checker.getShorthandAssignmentValueSymbol(node.parent);
	if (ts.isExportSpecifier(node.parent))
		return checker.getExportSpecifierLocalTargetSymbol(node.parent);
	return checker.getSymbolAtLocation(node);
}

/** The recipe recognizes bindings in their own lexical scope, including local aliases. */
function imported(checker: ts.TypeChecker, node: ts.Node, binding: ScopedSignalBinding) {
	const decl = checker.getSymbolAtLocation(node)?.declarations?.[0];
	return (
		ts.isIdentifier(node) &&
		decl &&
		ts.isImportSpecifier(decl) &&
		!decl.isTypeOnly &&
		!decl.parent.parent.isTypeOnly &&
		(decl.propertyName ?? decl.name).text === binding.name &&
		decl.parent.parent.parent.moduleSpecifier.getText().slice(1, -1) === binding.module
	);
}

function unsupported(node: ts.Node, message: string): never {
	const file = node.getSourceFile();
	throw new Error(
		file.fileName +
			':' +
			(file.getLineAndCharacterOfPosition(node.getStart()).line + 1) +
			': ' +
			message,
	);
}

function literal(checker: ts.TypeChecker, expression: ts.Expression) {
	if (ts.isIdentifier(expression)) {
		const symbol = checker.getSymbolAtLocation(expression);
		return expression.text === 'undefined' && symbol && checker.isUndefinedSymbol(symbol);
	}
	return (
		ts.isStringLiteral(expression) ||
		ts.isNumericLiteral(expression) ||
		[ts.SyntaxKind.NullKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(
			expression.kind,
		)
	);
}

/**
 * Locate direct importers before binding. Loading every transitive library through a large
 * application's tsconfig would be unnecessary for these local binding checks.
 */
function consumers(root: string, producer: string, options: ts.CompilerOptions) {
	const cache = ts.createModuleResolutionCache(
		root,
		ts.sys.useCaseSensitiveFileNames ? (s) => s : (s) => s.toLowerCase(),
		options,
	);
	const resolve = (spec: string, file: string) => {
		const resolveMode = (mode: ts.ResolutionMode) =>
			ts.resolveModuleName(spec, file, options, ts.sys, cache, undefined, mode).resolvedModule
				?.resolvedFileName;
		const esm = resolveMode(ts.ModuleKind.ESNext);
		const cjs = resolveMode(ts.ModuleKind.CommonJS);
		if (esm === cjs) return esm;
		if (esm === producer || cjs === producer)
			throw new Error('Review the mode-dependent producer import ' + spec + ' in ' + file);
		// Binding identity is only certain when the two modes agree.
		return undefined;
	};
	const references: Map<string, { source: string; positions: Set<number> }> = new Map([
		[producer, { source: fs.readFileSync(producer, 'utf8'), positions: new Set() }],
	]);
	for (const file of ts.sys.readDirectory(
		root,
		['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.tsrx'],
		['**/node_modules/**'],
	)) {
		const source = references.get(file)?.source ?? fs.readFileSync(file, 'utf8');
		const positions = ts
			.preProcessFile(source, true, true)
			.importedFiles.filter((ref) => resolve(ref.fileName, file) === producer)
			.map((ref) => ref.pos);
		if (positions.length) {
			if (fs.realpathSync(file) !== file) throw new Error('Review the symlinked consumer ' + file);
			if (!/\.[cm]?[jt]sx?$/.test(file) || file.endsWith('.d.ts'))
				throw new Error('Review the reference to the producer in ' + file);
			references.set(file, { source, positions: new Set(positions) });
		}
	}
	return { references, resolve };
}

function declaration(file: ts.SourceFile, checker: ts.TypeChecker, config: ScopedSignalOptions) {
	const found = [];
	for (const stmt of file.statements) {
		if (!ts.isVariableStatement(stmt)) continue;
		for (const decl of stmt.declarationList.declarations) {
			const call = decl.initializer;
			if (!call || !ts.isCallExpression(call)) continue;
			const native = imported(checker, call.expression, config.factory);
			if (
				!native &&
				!imported(checker, call.expression, { module: config.sourceModule, name: 'signal' })
			)
				continue;
			if (
				!ts.isIdentifier(decl.name) ||
				!(stmt.declarationList.flags & ts.NodeFlags.Const) ||
				!stmt.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword) ||
				call.questionDotToken ||
				call.typeArguments ||
				call.arguments.length !== 2
			)
				unsupported(decl, 'Expected an exported const initialized by a two-argument signal call.');
			const key =
				path.relative(config.sourceRoot, file.fileName).split(path.sep).join('/') +
				':' +
				decl.name.getText();
			const [scope, init] = call.arguments;
			if (
				native
					? !ts.isStringLiteral(scope) || scope.text !== key
					: !imported(checker, scope, config.scope)
			)
				unsupported(scope, 'Unrecognized declaring scope or adapter key.');
			const factory = ts.isArrowFunction(init);
			if (
				factory
					? init.parameters.length ||
						init.modifiers?.length ||
						ts.isBlock(init.body) ||
						!literal(checker, init.body)
					: native || !literal(checker, init)
			)
				unsupported(
					init,
					'Expected a primitive initializer or a zero-argument factory returning one.',
				);
			found.push({ decl, call, key, native, factory });
		}
	}
	if (found.length !== 1)
		throw new Error('Select a module defining exactly one supported exported signal.');
	return found[0];
}

function convert(
	file: ts.SourceFile,
	checker: ts.TypeChecker,
	config: ScopedSignalOptions,
	target: ReturnType<typeof declaration>,
	references: Set<number>,
	resolve: (spec: string, file: string) => string | undefined,
) {
	const edits: Map<number, { end: number; text: string }> = new Map();
	const signals: Set<ts.Symbol | undefined> = new Set();
	const replaced: Map<ts.ImportSpecifier, Set<ts.Node>> = new Map();
	const additions: Map<string, ScopedSignalBinding> = new Map();
	const existingImports = file.statements.flatMap((stmt) => {
		const bindings = ts.isImportDeclaration(stmt) && stmt.importClause?.namedBindings;
		return bindings && ts.isNamedImports(bindings) ? [...bindings.elements] : [];
	});
	const producer = target.decl.getSourceFile();
	let imperative = false;
	// A relative specifier or nested installation can resolve differently for each consumer.
	for (const spec of [config.sourceModule, config.scope.module]) {
		const module = resolve(spec, producer.fileName);
		if (!module || resolve(spec, file.fileName) !== module)
			throw new Error('Cannot verify a common module for ' + spec + ' in ' + file.fileName);
	}
	function edit(node: ts.Node, text: string) {
		edits.set(node.getStart(), { end: node.end, text });
	}
	function replaceImportUse(node: ts.Node, replacement?: ScopedSignalBinding) {
		const decl = checker.getSymbolAtLocation(node)?.declarations?.[0];
		if (!decl || !ts.isImportSpecifier(decl)) throw new Error('Expected a named import.');
		const uses = replaced.get(decl) ?? new Set<ts.Node>();
		uses.add(node);
		replaced.set(decl, uses);
		if (replacement) {
			const module = resolve(replacement.module, file.fileName);
			if (!module || module !== resolve(replacement.module, producer.fileName))
				unsupported(node, 'Cannot resolve a shared destination module: ' + replacement.module);
			const matches = existingImports.filter((item) => imported(checker, item.name, replacement));
			if (matches.length) {
				const local = matches[0].name;
				if (
					matches.length !== 1 ||
					existingImports.some((item) => item.name !== local && item.name.text === local.text) ||
					checker.resolveName(local.text, node, ts.SymbolFlags.Value, false) !==
						checker.getSymbolAtLocation(local)
				)
					unsupported(node, 'Ambiguous or shadowed destination import: ' + local.text);
				edit(node, local.text);
				return;
			}
			if (
				additions.has(replacement.name) &&
				additions.get(replacement.name)?.module !== replacement.module
			)
				unsupported(node, 'Conflicting destination name: ' + replacement.name);
			additions.set(replacement.name, replacement);
			edit(node, replacement.name);
		}
	}

	if (file === producer) {
		signals.add(checker.getSymbolAtLocation(target.decl.name));
		if (!target.native) {
			const [scope, init] = target.call.arguments;
			replaceImportUse(target.call.expression, config.factory);
			replaceImportUse(scope);
			edit(scope, JSON.stringify(target.key));
			if (!target.factory) edit(init, '() => ' + init.getText());
		}
	}
	const name = target.decl.name.getText();
	// Every discovered edge must be an ordinary named import. This also catches CommonJS
	// and dynamic imports without maintaining a second classifier for module-reference syntax.
	for (const statement of file.statements) {
		if (
			!ts.isImportDeclaration(statement) ||
			!references.delete(statement.moduleSpecifier.getStart())
		)
			continue;
		const bindings = statement.importClause?.namedBindings;
		if (!bindings || !ts.isNamedImports(bindings) || statement.importClause?.name)
			return unsupported(statement, 'Expected a static named import from the producer.');
		for (const item of bindings.elements) {
			if ((item.propertyName ?? item.name).text === name)
				signals.add(checker.getSymbolAtLocation(item.name));
		}
	}
	if (references.size)
		throw new Error('Review the non-static or re-exported producer reference in ' + file.fileName);

	walk(file, (node) => {
		if (!ts.isIdentifier(node)) return;
		const parent = node.parent;
		const symbol = localSymbol(checker, node);
		if (
			!symbol ||
			!signals.has(symbol) ||
			ts.isImportSpecifier(parent) ||
			node === target.decl.name
		)
			return;
		if (
			target.native &&
			ts.isPropertyAccessExpression(parent) &&
			parent.expression === node &&
			['get', 'set'].includes(parent.name.text) &&
			ts.isCallExpression(parent.parent) &&
			parent.parent.expression === parent
		)
			return;
		if (
			!ts.isCallExpression(parent) ||
			parent.arguments[0] !== node ||
			parent.questionDotToken ||
			parent.typeArguments
		)
			return unsupported(node, 'Unsupported use of ' + name + '.');
		const fn = parent.expression;
		if (
			parent.arguments.length === 1 &&
			imported(checker, fn, { module: config.sourceModule, name: 'useSignal' })
		) {
			replaceImportUse(fn, config.reader);
			return;
		}
		if (target.native && imported(checker, fn, config.reader) && parent.arguments.length === 1)
			return;
		if (
			!ts.isPropertyAccessExpression(fn) ||
			fn.questionDotToken ||
			!ts.isIdentifier(fn.expression) ||
			!(
				(fn.name.text === 'get' && parent.arguments.length === 1) ||
				(fn.name.text === 'set' &&
					parent.arguments.length === 2 &&
					!ts.isSpreadElement(parent.arguments[1]))
			)
		)
			return unsupported(fn, 'Expected a scoped get, set, or reader.');
		const owner = checker.getSymbolAtLocation(fn.expression)?.valueDeclaration;
		const init = owner && ts.isVariableDeclaration(owner) && owner.initializer;
		if (
			!owner ||
			!ts.isVariableDeclarationList(owner.parent) ||
			!(owner.parent.flags & ts.NodeFlags.Const) ||
			!init ||
			!ts.isCallExpression(init) ||
			init.questionDotToken ||
			init.typeArguments ||
			init.arguments.length !== 1 ||
			!imported(checker, init.expression, { module: config.sourceModule, name: 'useScope' }) ||
			!imported(checker, init.arguments[0], config.scope)
		)
			return unsupported(fn.expression, 'Cannot establish the owner of this scoped access.');
		// A source-library callback can track reads or defer writes to a transaction.
		for (let ancestor = parent.parent; ancestor; ancestor = ancestor.parent) {
			if (!ts.isCallExpression(ancestor)) continue;
			const callee = ts.isPropertyAccessExpression(ancestor.expression)
				? ancestor.expression.expression
				: ancestor.expression;
			const symbol = checker.getSymbolAtLocation(callee)?.declarations?.[0];
			const module =
				symbol &&
				(ts.isImportSpecifier(symbol)
					? symbol.parent.parent.parent
					: ts.isNamespaceImport(symbol)
						? symbol.parent.parent
						: undefined);
			if (
				module &&
				ts.isStringLiteral(module.moduleSpecifier) &&
				module.moduleSpecifier.text === config.sourceModule
			)
				unsupported(
					parent,
					'Scoped access inside a source-library call requires manual migration.',
				);
		}
		imperative = true;
		edit(fn.expression, node.text);
		edit(node, fn.expression.text);
	});

	if (imperative) {
		const relative = path.relative(config.sourceRoot, file.fileName).split(path.sep).join('/');
		const digest = createHash('sha256').update(file.text).digest('hex');
		if (config.reviewedAccess?.[relative] !== digest)
			throw new Error(
				'Review the imperative accesses in ' +
					relative +
					' and their callers, including tracked effects and transactions. Reviewed file SHA-256: ' +
					digest,
			);
	}

	// Remove only the named imports whose last use was converted; keep aliases and other state users.
	walk(file, (node) => {
		if (!ts.isIdentifier(node) || ts.isImportSpecifier(node.parent)) return;
		if (additions.has(node.text))
			unsupported(node, 'Destination name already in scope: ' + node.text);
		const symbol = localSymbol(checker, node);
		const decl = symbol?.declarations?.[0];
		if (decl && ts.isImportSpecifier(decl) && replaced.has(decl) && !replaced.get(decl)?.has(node))
			replaced.delete(decl);
	});
	for (const stmt of file.statements) {
		if (!ts.isImportDeclaration(stmt)) continue;
		const bindings = stmt.importClause?.namedBindings;
		if (!bindings || !ts.isNamedImports(bindings)) continue;
		if (bindings.elements.some((item) => additions.has(item.name.text)))
			unsupported(bindings, 'Conflicting adapter import.');
		const keep = bindings.elements.filter((item) => !replaced.has(item));
		if (keep.length === bindings.elements.length) continue;
		if (/\/\*|\/\//.test(stmt.getText()))
			unsupported(stmt, 'Preserve the annotated import manually.');
		if (keep.length) edit(bindings, '{ ' + keep.map((item) => item.getText()).join(', ') + ' }');
		else if (stmt.importClause?.name) edit(stmt.importClause, stmt.importClause.name.text);
		else {
			// Consume the rest of the import's line without swallowing a trailing comment.
			const blank = /^[ \t]*(?:\r?\n[ \t]*)*/.exec(file.text.slice(stmt.end))?.[0] ?? '';
			edits.set(stmt.getStart(), {
				end: stmt.end + (blank.includes('\n') ? blank.lastIndexOf('\n') + 1 : 0),
				text: '',
			});
		}
	}
	let code = file.text;
	for (const [start, { end, text }] of [...edits].sort((a, b) => b[0] - a[0]))
		code = code.slice(0, start) + text + code.slice(end);
	if (additions.size) {
		const imports = [...additions.values()]
			.map((b) => 'import { ' + b.name + ' } from ' + JSON.stringify(b.module) + ';')
			.join('\n');
		// Insert after any shebang and directive prologue, before the first module statement.
		const start =
			file.statements
				.find((s) => !(ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression)))
				?.getStart() ?? 0;
		code = code.slice(0, start) + imports + '\n' + code.slice(start);
	}
	return code;
}

/** Create a CLI recipe for one scoped producer and its direct consumers. */
export function createScopedSignalRecipe(config: ScopedSignalOptions): typeof runCodemod {
	return async (paths, options = {}) => {
		const root = fs.realpathSync(config.sourceRoot);
		const result: CodemodResult = {
			root,
			files: [],
			packages: [],
			dependencies: [],
			patched: [],
			missing: [],
			html: [],
			compiler: null,
		};
		const rule = 'scoped-signal';
		try {
			const producer = fs.realpathSync(paths[0]);
			const relative = path.relative(root, producer);
			if (
				paths.length !== 1 ||
				relative.startsWith('..' + path.sep) ||
				path.isAbsolute(relative) ||
				!relative.endsWith('.ts') ||
				relative.endsWith('.d.ts')
			)
				throw new Error('Select one .ts signal declaration inside sourceRoot.');
			const parsed = ts.getParsedCommandLineOfConfigFile(
				path.resolve(config.tsconfig),
				{},
				{ ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
			);
			if (!parsed || parsed.errors.length)
				throw new Error(
					'Cannot load ' +
						config.tsconfig +
						': ' +
						ts.flattenDiagnosticMessageText(
							parsed?.errors[0]?.messageText ?? 'configuration error',
							'\n',
						),
				);
			const { references, resolve } = consumers(root, producer, parsed.options);
			const compilerOptions = {
				...parsed.options,
				allowJs: true,
				noResolve: true,
				noLib: true,
				types: [],
			};
			// Preserve the exact UTF-8 input, including a BOM, for source positions, review hashes, and writes.
			const host = ts.createCompilerHost(compilerOptions);
			const readFile = host.readFile;
			host.readFile = (name) => references.get(name)?.source ?? readFile(name);
			const program = ts.createProgram([...references.keys()], compilerOptions, host);
			const checker = program.getTypeChecker();
			const getFile = (name: string) => {
				const file = program.getSourceFile(name);
				if (!file || program.getSyntacticDiagnostics(file).length)
					throw new Error('Cannot parse ' + name);
				return file;
			};
			const normalized = { ...config, sourceRoot: root };
			const target = declaration(getFile(producer), checker, normalized);
			for (const [absolute, { positions }] of references) {
				const src = getFile(absolute);
				const code = convert(src, checker, normalized, target, positions, resolve);
				const file = path.relative(root, absolute);
				const changed = code !== src.text;
				result.files.push({
					file,
					output: file,
					changed,
					code,
					rules: changed ? { [rule]: 1 } : {},
					strong: null,
					strongFixes: [],
					notes: [],
					diagnostics: [],
				});
			}
			if (options.write !== false) applyChanges(root, result.files, (name) => getFile(name).text);
		} catch (error) {
			const file = paths[0] ?? root;
			result.files = [
				{
					file,
					output: file,
					code: '',
					changed: false,
					rules: {},
					strong: null,
					strongFixes: [],
					diagnostics: [],
					notes: [
						{
							rule,
							severity: 'error',
							line: 1,
							message: error instanceof Error ? error.message : String(error),
						},
					],
				},
			];
			return result;
		}
		return result;
	};
}

/**
 * Stage complete files and their originals before replacing any of them. The directory
 * excludes concurrent recipe writes and retains the originals if rollback is interrupted.
 */
function applyChanges(
	root: string,
	files: CodemodResult['files'],
	original: (name: string) => string,
) {
	const changed = files.filter((file) => file.changed);
	if (!changed.length) return;
	const stage = path.join(root, '.octane-scoped-signal');
	fs.mkdirSync(stage);
	let committed = 0;
	let keepBackups = false;
	try {
		fs.writeFileSync(path.join(stage, 'paths.json'), JSON.stringify(changed.map((f) => f.file)));
		for (const [i, file] of changed.entries()) {
			const name = path.join(root, file.file);
			if (fs.realpathSync(name) !== name || fs.readFileSync(name, 'utf8') !== original(name))
				throw new Error('Source changed during migration: ' + file.file);
			fs.copyFileSync(name, path.join(stage, i + '.before'));
			fs.copyFileSync(name, path.join(stage, i + '.after'));
			fs.writeFileSync(path.join(stage, i + '.after'), file.code);
		}
		for (const [i, file] of changed.entries()) {
			const name = path.join(root, file.file);
			if (fs.realpathSync(name) !== name || fs.readFileSync(name, 'utf8') !== original(name))
				throw new Error('Source changed during migration: ' + file.file);
			fs.renameSync(path.join(stage, i + '.after'), name);
			committed++;
		}
	} catch (error) {
		keepBackups = true;
		while (committed) {
			const i = --committed,
				file = changed[i],
				name = path.join(root, file.file);
			if (fs.realpathSync(name) !== name || fs.readFileSync(name, 'utf8') !== file.code)
				throw new Error('Source changed during rollback. Recover originals from ' + stage + '.');
			fs.renameSync(path.join(stage, i + '.before'), name);
		}
		keepBackups = false;
		throw error;
	} finally {
		if (!keepBackups) fs.rmSync(stage, { recursive: true });
	}
}
