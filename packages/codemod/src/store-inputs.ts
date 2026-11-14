import fs from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { isWrapper, skipWrappers } from './expression-wrappers.js';
import { renderUses } from './forwarded-props.js';
import { hasLocalMemberWrite, localUses, transportedValue } from './local-uses.js';
import { bind } from './transform.js';
import { hasRuntimeDependency } from './scoped-store-contract.js';

type Selection = (string | undefined)[];
export type StoreInputCheck = (
	module: string,
	name: string,
	selection?: Selection,
) => boolean | 'opaque';

type Factory = { module: string; name: string; from: string };
type ExportRead = Factory & { selection: Selection };
type ExportValue = { jsx: boolean; imports: ExportRead[] };
const emptyValue: ExportValue = { jsx: false, imports: [] };
const MAX_EXPORT_SELECTIONS = 64;
type Opaque = { opaque: true };
type Input =
	| { factory: Factory; direct: boolean; data: boolean }
	| { reexport: Factory; opaqueOnly?: true }
	| { literal: true }
	| Opaque;

const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];
export const resourceHints = new Set([
	'preconnect',
	'prefetchDNS',
	'preinit',
	'preinitModule',
	'preload',
	'preloadModule',
]);

function importsResourceHint(statement: ts.ImportDeclaration | ts.ExportDeclaration) {
	const imported = ts.isImportDeclaration(statement);
	if (imported && !statement.importClause) return false;
	const bindings = imported ? statement.importClause?.namedBindings : statement.exportClause;
	if ((imported && statement.importClause?.name) || !bindings) return true;
	if (!ts.isNamedImports(bindings) && !ts.isNamedExports(bindings)) return true;
	return bindings.elements.some(
		(item) =>
			!item.isTypeOnly &&
			((item.propertyName ?? item.name).text === 'default' ||
				resourceHints.has((item.propertyName ?? item.name).text)),
	);
}

function dataInput(expr: ts.Expression, locals?: ReadonlyMap<string, Input>): boolean {
	const value = skipWrappers(expr);
	if (ts.isIdentifier(value)) {
		const input = locals?.get(value.text);
		return !!input && 'literal' in input;
	}
	if (ts.isArrayLiteralExpression(value))
		return value.elements.every((element) => dataInput(element, locals));
	if (ts.isObjectLiteralExpression(value))
		return value.properties.every(
			(field) =>
				ts.isPropertyAssignment(field) &&
				(ts.isIdentifier(field.name) ||
					ts.isStringLiteral(field.name) ||
					ts.isNumericLiteral(field.name)) &&
				field.name.text !== '__proto__' &&
				dataInput(field.initializer, locals),
		);
	return inertLiteral(value);
}

function inertLiteral(value: ts.Expression) {
	if (ts.isPrefixUnaryExpression(value))
		return (
			(value.operator === ts.SyntaxKind.PlusToken || value.operator === ts.SyntaxKind.MinusToken) &&
			(ts.isNumericLiteral(value.operand) || ts.isBigIntLiteral(value.operand))
		);
	return (
		ts.isStringLiteralLike(value) ||
		ts.isNumericLiteral(value) ||
		ts.isBigIntLiteral(value) ||
		value.kind === ts.SyntaxKind.TrueKeyword ||
		value.kind === ts.SyntaxKind.FalseKeyword ||
		value.kind === ts.SyntaxKind.NullKeyword
	);
}

/** Read const data exported by an original module without executable dependencies. */
export function retainedLiteralExports(file: string) {
	const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
	const exported = new Set<string>();
	for (const statement of source.statements) {
		if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue;
		if (
			ts.isImportDeclaration(statement) &&
			!statement.attributes &&
			statement.importClause?.isTypeOnly
		)
			continue;
		if (
			ts.isEnumDeclaration(statement) &&
			statement.members.every(
				(member) =>
					!ts.isComputedPropertyName(member.name) &&
					member.initializer &&
					inertLiteral(skipWrappers(member.initializer)),
			)
		)
			continue;
		if (
			!ts.isVariableStatement(statement) ||
			(statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const
		)
			return null;
		for (const declaration of statement.declarationList.declarations) {
			if (
				!ts.isIdentifier(declaration.name) ||
				!declaration.initializer ||
				!dataInput(declaration.initializer)
			)
				return null;
			if (
				ts.isObjectLiteralExpression(skipWrappers(declaration.initializer)) &&
				statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
			)
				exported.add(declaration.name.text);
		}
	}
	return exported;
}

/** Resolve application source used by a workspace store consumer. */
export function storeSources(
	root: string,
	config: ts.CompilerOptions | null,
	unchanged: (file: string, source: string) => boolean,
	changesRenderer: (file: string) => boolean = () => false,
) {
	const options = { moduleResolution: ts.ModuleResolutionKind.Bundler, ...config };
	const cache = ts.createModuleResolutionCache(root, (file) => file, options);
	const modules = new Map<string, Map<string, Input>>();
	const project = fs.realpathSync(root);
	const bindings = new Map<string, ReturnType<typeof bind>>();
	function bindingFor(file: string) {
		let binding = bindings.get(file);
		if (!binding) {
			binding = bind(file, fs.readFileSync(file, 'utf8'));
			bindings.set(file, binding);
		}
		return binding;
	}
	function exportsConstObject(file: string, name: string) {
		const { sf, checker } = bindingFor(file);
		const symbol = checker.getSymbolAtLocation(sf)?.exports?.get(ts.escapeLeadingUnderscores(name));
		const declaration = symbol?.valueDeclaration;
		if (
			!declaration ||
			!ts.isVariableDeclaration(declaration) ||
			!declaration.initializer ||
			(declaration.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
			ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Ambient
		)
			return false;
		return ts.isObjectLiteralExpression(skipWrappers(declaration.initializer));
	}
	function inputs(file: string) {
		const saved = modules.get(file);
		if (saved) return saved;
		const exported = new Map<string, Input>();
		const locals = new Map<string, Input>();
		const localFunctions = new Set<string>();
		const { sf, checker } = bindingFor(file);
		let uses: ReturnType<typeof localUses> | undefined;
		function handleEscapes(name: ts.Identifier) {
			const refs = (uses ??= localUses(sf, checker));
			const pending = [name];
			while (pending.length) {
				for (const ref of renderUses(refs(pending.pop()!))) {
					let value: ts.Node = ref;
					while (isWrapper(value.parent)) value = value.parent;
					const parent = value.parent;
					if (ts.isExportSpecifier(parent) || ts.isExportAssignment(parent)) continue;
					if (
						!ts.isVariableDeclaration(parent) ||
						parent.initializer !== value ||
						!ts.isIdentifier(parent.name) ||
						!ts.isVariableDeclarationList(parent.parent) ||
						(parent.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
						!ts.isSourceFile(parent.parent.parent.parent)
					)
						return true;
					pending.push(parent.name);
				}
			}
			return false;
		}
		for (const s of sf.statements) {
			if (ts.isFunctionDeclaration(s) && s.name && s.body) localFunctions.add(s.name.text);
			if (
				!ts.isImportDeclaration(s) ||
				!ts.isStringLiteral(s.moduleSpecifier) ||
				s.attributes ||
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
			if (
				!ts.isVariableStatement(s) ||
				(s.declarationList.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const
			)
				continue;
			for (const d of s.declarationList.declarations) {
				if (!ts.isIdentifier(d.name) || !d.initializer) continue;
				const call = skipWrappers(d.initializer);
				const alias = ts.isIdentifier(call) && locals.get(call.text);
				let input: Input | undefined;
				if (alias) {
					if ('reexport' in alias) input = { ...alias, opaqueOnly: true };
					else if ('factory' in alias && call !== d.initializer)
						input = { ...alias, direct: false };
					else input = alias;
				} else if (ts.isCallExpression(call)) {
					let target = skipWrappers(call.expression);
					while (ts.isExpressionWithTypeArguments(target)) target = skipWrappers(target.expression);
					if (!ts.isIdentifier(target)) continue;
					const callee = locals.get(target.text);
					if (callee && 'reexport' in callee) {
						// A type assertion cannot make a modified handle portable.
						if (hasLocalMemberWrite(d.name, checker)) input = { opaque: true };
						else
							input = {
								factory: callee.reexport,
								direct: !callee.opaqueOnly && call === d.initializer && target === call.expression,
								// A local use can expose a literal-initialized handle to a callback.
								data:
									call.arguments.every((arg) => dataInput(arg, locals)) && !handleEscapes(d.name),
							};
					} else if (localFunctions.has(target.text)) input = { opaque: true };
				} else if (inertLiteral(call)) input = { literal: true };
				if (!input) continue;
				locals.set(d.name.text, input);
				if (s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
					exported.set(d.name.text, input);
			}
		}
		for (const s of sf.statements) {
			if (
				!ts.isExportDeclaration(s) ||
				s.isTypeOnly ||
				!s.exportClause ||
				!ts.isNamedExports(s.exportClause)
			)
				continue;
			for (const item of s.exportClause.elements) {
				if (item.isTypeOnly) continue;
				if (s.attributes) {
					// Attributes can select a different implementation at runtime.
					exported.set(item.name.text, { opaque: true });
					continue;
				}
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
	function typedFile(from: string, specifier: string) {
		return ts.resolveModuleName(specifier, from, options, ts.sys, cache).resolvedModule
			?.resolvedFileName;
	}
	function inProject(file: string, directory: string) {
		return (
			file.startsWith(directory + path.sep) && !file.includes(path.sep + 'node_modules' + path.sep)
		);
	}
	function runtimeFile(from: string, specifier: string) {
		try {
			return createRequire(from).resolve(specifier);
		} catch {
			// A tsconfig alias or an authored TS file need not resolve through Node.
			return undefined;
		}
	}
	function localFile(from: string, specifier: string, allowTsx = false) {
		const file = typedFile(from, specifier);
		if (!file || file.endsWith('.d.ts') || !inProject(file, root)) return null;
		const extension = path.extname(file);
		if (extension !== '.ts' && !(allowTsx && extension === '.tsx')) return null;
		const physical = fs.realpathSync(file);
		if (!inProject(physical, project)) return null;
		// A JS sibling or directory can implement a different export even for a tsconfig alias.
		if (!specifier.endsWith(extension)) {
			const stem = file.slice(0, -extension.length);
			if (
				sourceExtensions.some((ext) => ext !== extension && fs.existsSync(stem + ext)) ||
				fs.existsSync(stem)
			)
				return null;
		}
		const runtime = runtimeFile(from, specifier);
		if (runtime && (!path.isAbsolute(runtime) || fs.realpathSync(runtime) !== physical))
			return null;
		return file;
	}

	// Renderer evidence can come from any plausible executable source. It never proves factory identity.
	function executableFiles(from: string, specifier: string) {
		const typed = typedFile(from, specifier);
		const candidates = new Set<string>();
		if (typed && inProject(typed, root)) {
			candidates.add(typed);
			// TypeScript can substitute authored types for an explicit JS path.
			const stem = typed.replace(/(?:\.d)?\.(?:[cm]?[jt]s|[jt]sx)$/, '');
			if (stem !== typed) {
				const extension = path.extname(specifier);
				const siblings = sourceExtensions.includes(extension) ? [extension] : sourceExtensions;
				for (const suffix of siblings) candidates.add(stem + suffix);
			}
		}
		if (candidates.size || specifier.startsWith('.')) {
			const runtime = runtimeFile(from, specifier);
			if (runtime) {
				// Node resolves symlinks before returning the runtime path.
				const file =
					root !== project && inProject(runtime, project)
						? path.join(root, path.relative(project, runtime))
						: runtime;
				candidates.add(file);
			}
		}
		return [...candidates].filter(
			(file) =>
				sourceExtensions.includes(path.extname(file)) &&
				!/\.d\.[cm]?ts$/.test(file) &&
				inProject(file, root) &&
				fs.statSync(file, { throwIfNoEntry: false })?.isFile() &&
				inProject(fs.realpathSync(file), project),
		);
	}

	const resourceFiles = new Map<string, boolean>();
	function reachesResourceHint(file: string): boolean {
		const known = resourceFiles.get(file);
		if (known !== undefined) return known;
		const pending = [file];
		const seen = new Set<string>();
		while (pending.length) {
			const current = pending.pop()!;
			const cached = resourceFiles.get(current);
			if (cached === false || seen.has(current)) continue;
			if (cached === true) {
				resourceFiles.set(file, true);
				return true;
			}
			seen.add(current);
			const source = ts.createSourceFile(
				current,
				fs.readFileSync(current, 'utf8'),
				ts.ScriptTarget.Latest,
			);
			for (const statement of source.statements) {
				if (
					(!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) ||
					!hasRuntimeDependency(statement) ||
					!statement.moduleSpecifier ||
					!ts.isStringLiteral(statement.moduleSpecifier)
				)
					continue;
				const specifier = statement.moduleSpecifier.text;
				if (specifier === 'react-dom' && importsResourceHint(statement)) {
					resourceFiles.set(file, true);
					return true;
				}
				pending.push(...executableFiles(current, specifier));
			}
		}
		for (const current of seen) resourceFiles.set(current, false);
		return false;
	}

	function readExport(file: string, name: string, selection: Selection): ExportValue {
		const { sf, checker } = bindingFor(file);
		const exported = checker.getSymbolAtLocation(sf)?.exports;
		const symbol = exported?.get(ts.escapeLeadingUnderscores(name));
		const declaration =
			symbol?.valueDeclaration ??
			symbol?.declarations?.find(
				(node) =>
					(ts.isExportSpecifier(node) && !node.isTypeOnly && !node.parent.parent.isTypeOnly) ||
					(ts.isNamespaceExport(node) && !node.parent.isTypeOnly) ||
					(ts.isExportAssignment(node) && !node.isExportEquals),
			);
		// A runtime export shadows stars. Type declarations are erased and default never travels through a star.
		if (!declaration || ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Ambient) {
			if (name === 'default') return emptyValue;
			const imports: ExportRead[] = [];
			for (const star of exported?.get(ts.InternalSymbolName.ExportStar)?.declarations ?? []) {
				if (
					ts.isExportDeclaration(star) &&
					!star.isTypeOnly &&
					!star.attributes &&
					star.moduleSpecifier &&
					ts.isStringLiteral(star.moduleSpecifier)
				)
					imports.push({ from: file, module: star.moduleSpecifier.text, name, selection });
			}
			return { jsx: false, imports };
		}
		if (ts.isNamespaceExport(declaration)) {
			const statement = declaration.parent;
			const [member, ...rest] = selection;
			return member !== undefined &&
				!statement.attributes &&
				statement.moduleSpecifier &&
				ts.isStringLiteral(statement.moduleSpecifier)
				? {
						jsx: false,
						imports: [
							{ from: file, module: statement.moduleSpecifier.text, name: member, selection: rest },
						],
					}
				: emptyValue;
		}
		let value: ts.Node;
		if (ts.isExportSpecifier(declaration)) {
			const statement = declaration.parent.parent;
			if (declaration.isTypeOnly || statement.isTypeOnly || statement.attributes) return emptyValue;
			const exported = declaration.propertyName ?? declaration.name;
			if (statement.moduleSpecifier) {
				if (!ts.isStringLiteral(statement.moduleSpecifier)) return emptyValue;
				return {
					jsx: false,
					imports: [
						{ from: file, module: statement.moduleSpecifier.text, name: exported.text, selection },
					],
				};
			}
			value = exported;
		} else if (ts.isExportAssignment(declaration) && !declaration.isExportEquals) {
			value = declaration.expression;
		} else if (
			(ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration)) &&
			ts.isIdentifier(declaration.name)
		) {
			if (
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer &&
				ts.isVariableDeclarationList(declaration.parent) &&
				declaration.parent.flags & ts.NodeFlags.Const &&
				inertLiteral(skipWrappers(declaration.initializer))
			)
				return emptyValue;
			value = declaration.name;
		} else return emptyValue;
		const imports: ExportRead[] = [];
		const jsx = transportedValue(
			value,
			checker,
			selection,
			(module, name, selected) => {
				imports.push({ from: file, module, name, selection: selected });
				return false;
			},
			() => changesRenderer(file),
		);
		return { jsx, imports };
	}

	const queriedExports = new Map<string, Map<string, ExportValue>>();
	function changedJsxExport(from: string, module: string, name: string, selection: Selection) {
		const pending: ExportRead[] = [{ from, module, name, selection }];
		const seen = new Set<string>();
		while (pending.length) {
			const { from, module, name, selection } = pending.pop()!;
			for (const file of executableFiles(from, module)) {
				const key = file + '\0' + name;
				let paths = queriedExports.get(key);
				if (!paths) queriedExports.set(key, (paths = new Map()));
				const requested = JSON.stringify(selection);
				const join =
					selection.length > MAX_EXPORT_SELECTIONS ||
					(!paths.has(requested) && paths.size >= MAX_EXPORT_SELECTIONS);
				const path = join ? [] : selection;
				const shape = join ? '[]' : requested;
				const query = key + '\0' + shape;
				if (seen.has(query)) continue;
				seen.add(query);
				let result = paths.get(shape);
				if (!result) {
					result = readExport(file, name, path);
					paths.set(shape, result);
				}
				if (result.jsx) return true;
				pending.push(...result.imports);
			}
		}
		return false;
	}

	// Follow named re-exports to a direct factory or an opaque local initializer.
	function inputFactory(
		from: string,
		specifier: string,
		name: string,
		shared: (module: string, name: string, from: string) => boolean = () => false,
	): Factory | Opaque | null {
		let ref: Factory = { module: specifier, name, from };
		let opaqueOnly = false;
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
				const { factory } = input;
				// A read can invoke an initializer callback after migration, under a different renderer.
				if (
					!input.data &&
					shared(factory.module, factory.name, factory.from) &&
					reachesResourceHint(factory.from)
				)
					return { opaque: true };
				return input.direct && !opaqueOnly ? factory : null;
			}
			if ('literal' in input) return null;
			if ('opaque' in input) return input;
			// A snapshot can propagate a rejection without establishing factory identity.
			opaqueOnly ||= !!input.opaqueOnly;
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
			// A linked path may be selected for a rewrite under its physical name.
			if (
				fs.realpathSync(current) !== path.join(project, path.relative(root, current)) ||
				fs.existsSync(current.slice(0, -3) + '.tsrx')
			)
				return;
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
	return { inputFactory, changedJsxExport, helperFunction, localFile, exportsConstObject };
}
