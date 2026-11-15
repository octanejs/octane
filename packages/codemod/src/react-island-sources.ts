import ts from 'typescript';
import { parseSync } from '@tsrx/oxc/parser';
import { hasRuntimeDependency } from './scoped-store-contract.js';
import { skipWrappers } from './expression-wrappers.js';
import { hasEval, rendersElementChildren } from './forwarded-props.js';
import { componentTagOrExport, inTypeNode, localUses } from './local-uses.js';
import { staticReactProps } from './react-renderer.js';
import { bind, nativeReactCompat, skipParens, withoutJsxIndentation } from './transform.js';

export function importsReactBridge(source: string) {
	return (
		((source.includes('ReactCompat') && source.includes('octane/react')) ||
			source.includes('\\')) &&
		ts
			.preProcessFile(source)
			.importedFiles.some(
				({ fileName }) => fileName === 'octane/react' || fileName === 'octane/react/server',
			)
	);
}

async function bindIsland(file: string, source: string) {
	let code = source;
	if (file.endsWith('.tsrx')) {
		const { compileToVolarMappings } = await import('octane/compiler/volar');
		try {
			code = compileToVolarMappings(source, file, { loose: true }).code;
		} catch (error) {
			// Project-wide inspection also encounters unfinished files outside the selected inputs.
			if (error instanceof SyntaxError) return;
			throw error;
		}
	}
	return bind(file.endsWith('.tsrx') ? file + '.tsx' : file, code);
}

function imported(checker: ts.TypeChecker, node: ts.Node, defaultMember = false) {
	const ref = ts.isPropertyAccessExpression(node) ? node.expression : node;
	if (!ts.isIdentifier(ref)) return;
	const decl = checker.getSymbolAtLocation(ref)?.declarations?.[0];
	if (!decl) return;
	const name = ts.isPropertyAccessExpression(node)
		? (ts.isNamespaceImport(decl) || (defaultMember && ts.isImportClause(decl))) && node.name.text
		: ts.isImportSpecifier(decl) && !decl.isTypeOnly
			? (decl.propertyName ?? decl.name).text
			: ts.isImportClause(decl) && 'default';
	const imp = name && ts.findAncestor(decl, ts.isImportDeclaration);
	if (
		imp &&
		!imp.attributes &&
		!imp.importClause?.isTypeOnly &&
		ts.isStringLiteral(imp.moduleSpecifier)
	)
		return { name, module: imp.moduleSpecifier.text };
}

function closedReactReceiver(receiver: ts.Identifier, uses: ReturnType<typeof localUses>) {
	return uses(receiver).every((ref) => {
		if (ts.isImportClause(ref.parent) || ts.isNamespaceImport(ref.parent) || inTypeNode(ref))
			return true;
		const member = ref.parent;
		if (!ts.isPropertyAccessExpression(member) || member.expression !== ref) return false;
		const parent = member.parent;
		return (
			ts.isExpressionWithTypeArguments(parent) ||
			((ts.isJsxOpeningElement(parent) ||
				ts.isJsxClosingElement(parent) ||
				ts.isJsxSelfClosingElement(parent)) &&
				parent.tagName === member &&
				(member.name.text === 'Fragment' ||
					member.name.text === 'Suspense' ||
					member.name.text === 'StrictMode')) ||
			(ts.isCallExpression(parent) &&
				parent.expression === member &&
				member.name.text !== 'default')
		);
	});
}

function soleReactReceiver(checker: ts.TypeChecker, receiver: ts.Identifier) {
	const declaration = checker.getSymbolAtLocation(receiver)?.declarations?.[0];
	return (
		declaration &&
		(ts.isNamespaceImport(declaration)
			? !declaration.parent.name
			: ts.isImportClause(declaration) && !declaration.namedBindings)
	);
}

/** A direct assignment of inert metadata does not change the exported constructor. */
function classMetadataAssignment(ref: ts.Identifier, decl: ts.ClassDeclaration) {
	const access = ref.parent;
	if (!ts.isPropertyAccessExpression(access) || access.expression !== ref) return false;
	const name = access.name.text;
	if (name !== 'displayName' && name !== 'defaultProps') return false;
	const assignment = access.parent;
	if (
		!ts.isBinaryExpression(assignment) ||
		assignment.left !== access ||
		assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
		!ts.isExpressionStatement(assignment.parent) ||
		assignment.parent.parent !== decl.parent ||
		assignment.getStart() < decl.end ||
		decl.members.some(
			(member) =>
				ts.isClassStaticBlockDeclaration(member) ||
				(member.name && ts.isComputedPropertyName(member.name)) ||
				(ts.canHaveDecorators(member) && ts.getDecorators(member)?.length) ||
				(ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static &&
					(ts.isPropertyDeclaration(member) ||
						ts.isSetAccessorDeclaration(member) ||
						ts.isGetAccessorDeclaration(member))),
		)
	)
		return false;
	const value = skipWrappers(assignment.right);
	if (name === 'displayName') return ts.isStringLiteralLike(value);
	return (
		ts.isObjectLiteralExpression(value) &&
		value.properties.every((field) => {
			if (
				!ts.isPropertyAssignment(field) ||
				!(
					ts.isIdentifier(field.name) ||
					ts.isStringLiteral(field.name) ||
					ts.isNumericLiteral(field.name)
				) ||
				field.name.text === '__proto__'
			)
				return false;
			const value = skipWrappers(field.initializer);
			return (
				ts.isStringLiteralLike(value) ||
				ts.isNumericLiteral(value) ||
				value.kind === ts.SyntaxKind.TrueKeyword ||
				value.kind === ts.SyntaxKind.FalseKeyword ||
				value.kind === ts.SyntaxKind.NullKeyword
			);
		})
	);
}

function localValueExport(symbol: ts.Symbol, checker: ts.TypeChecker) {
	const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
	if (!declaration || !ts.isExportSpecifier(declaration)) return declaration;
	const exported = declaration.parent.parent;
	if (declaration.isTypeOnly || exported.isTypeOnly || exported.moduleSpecifier) return;
	return checker.getExportSpecifierLocalTargetSymbol(declaration)?.valueDeclaration;
}

/** Direct React class exports, including an alias in a local export list. */
export function reactClassExports(file: string, source: string) {
	const { sf, checker } = bind(file, source);
	const names = new Set<string>();
	const module = checker.getSymbolAtLocation(sf);
	if (!module || hasEval(sf)) return names;
	const uses = localUses(sf, checker);
	let decorators: boolean | undefined;
	const hasDecorator = (node: ts.Node): boolean =>
		ts.isDecorator(node) ||
		(ts.forEachChild(node, (child) => hasDecorator(child) || undefined) ?? false);
	const erasedClassUse = (ref: ts.Identifier) =>
		inTypeNode(ref) &&
		(ts.isTypeQueryNode(ref.parent) || !(decorators ??= source.includes('@') && hasDecorator(sf)));
	for (const symbol of checker.getExportsOfModule(module)) {
		let decl = localValueExport(symbol, checker);
		if (decl && ts.isExportAssignment(decl)) {
			const value = decl.expression;
			if (decl.isExportEquals || !ts.isIdentifier(value)) continue;
			const local = checker.getSymbolAtLocation(value)?.valueDeclaration;
			if (!local || local.parent !== sf || local.end > decl.getStart(sf)) continue;
			decl = local;
		}
		if (
			!decl ||
			!ts.isClassDeclaration(decl) ||
			ts.getCombinedModifierFlags(decl) & ts.ModifierFlags.Ambient ||
			ts.getDecorators(decl)?.length
		)
			continue;
		const base = decl.heritageClauses?.find(
			(clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
		)?.types[0]?.expression;
		if (!base) continue;
		let entry = imported(checker, base);
		if (!entry && ts.isPropertyAccessExpression(base) && ts.isIdentifier(base.expression)) {
			const candidate = imported(checker, base, true);
			if (candidate?.module === 'react' && closedReactReceiver(base.expression, uses))
				entry = candidate;
		}
		if (entry?.module !== 'react' || (entry.name !== 'Component' && entry.name !== 'PureComponent'))
			continue;
		if (
			!decl.name ||
			uses(decl.name).every(
				(ref) =>
					erasedClassUse(ref) || componentTagOrExport(ref) || classMetadataAssignment(ref, decl),
			)
		)
			names.add(symbol.name);
	}
	return names;
}

function hasSingleReactImport(sf: ts.SourceFile, source: string) {
	const erased = new Set<number>();
	for (const statement of sf.statements) {
		if (
			(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
			statement.moduleSpecifier &&
			!hasRuntimeDependency(statement, true)
		)
			erased.add(statement.moduleSpecifier.getStart(sf));
	}
	// Keep dynamic imports and require calls in the scan. Only declaration-level
	// type imports and exports are erased even with verbatim module syntax.
	return (
		ts
			.preProcessFile(source, true, true)
			.importedFiles.filter(({ fileName, pos }) => fileName === 'react' && !erased.has(pos))
			.length === 1
	);
}

/** Direct module-level const exports initialized by the real React context factory. */
export function retainedReactContextExports(file: string, source: string) {
	const { sf, checker } = bind(file, source);
	const module = checker.getSymbolAtLocation(sf);
	const names = new Map<string, boolean>();
	if (!module) return names;
	let uses: ReturnType<typeof localUses> | undefined;
	let singleReactImport: boolean | undefined;
	let dynamicScope: boolean | undefined;
	for (const symbol of checker.getExportsOfModule(module)) {
		const declaration = localValueExport(symbol, checker);
		if (!declaration || !ts.isVariableDeclaration(declaration) || !declaration.initializer)
			continue;
		const list = declaration.parent;
		if (
			(list.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
			!ts.isVariableStatement(list.parent) ||
			list.parent.parent !== sf ||
			ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Ambient
		)
			continue;
		const init = skipWrappers(declaration.initializer);
		if (!ts.isCallExpression(init) || ts.isOptionalChain(init)) continue;
		const factory = init.expression;
		const entry = imported(checker, factory, true);
		if (entry?.module !== 'react' || entry.name !== 'createContext') continue;
		if (ts.isPropertyAccessExpression(factory)) {
			// With interop the default and namespace can share the same mutable React object.
			singleReactImport ??= !(dynamicScope ??= hasEval(sf)) && hasSingleReactImport(sf, source);
			if (
				!singleReactImport ||
				!ts.isIdentifier(factory.expression) ||
				!soleReactReceiver(checker, factory.expression) ||
				!closedReactReceiver(factory.expression, (uses ??= localUses(sf, checker)))
			)
				continue;
		}
		// The context itself stays a React value even if its Provider member is reassigned.
		// For a retained member read, require the producer to keep that object local.
		const unchangedProvider =
			ts.isIdentifier(declaration.name) &&
			!(dynamicScope ??= hasEval(sf)) &&
			(uses ??= localUses(sf, checker))(declaration.name).every(
				(ref) => inTypeNode(ref) || componentTagOrExport(ref),
			);
		names.set(symbol.name, unchangedProvider);
	}
	return names;
}

/** Original imported components handed to an authored React island. */
export async function islandComponents(
	file: string,
	source: string,
	original: (module: string) => boolean,
) {
	const bound = await bindIsland(file, source);
	if (!bound) return [];
	const { sf, checker } = bound;
	const components = new Set<string>();
	function component(expr: ts.Expression) {
		const node = skipWrappers(expr);
		if (ts.isConditionalExpression(node)) {
			component(node.whenTrue);
			component(node.whenFalse);
			return;
		}
		if (ts.isBinaryExpression(node)) {
			const op = node.operatorToken.kind;
			if (op === ts.SyntaxKind.AmpersandAmpersandToken) component(node.right);
			else if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
				component(node.left);
				component(node.right);
			}
			return;
		}
		const ref = ts.isJsxElement(node)
			? node.openingElement.tagName
			: ts.isJsxSelfClosingElement(node)
				? node.tagName
				: node;
		if (ts.isIdentifier(ref) && ref !== node && /^[a-z]|-/.test(ref.text)) return;
		let value = ref;
		const seen = new Set<ts.VariableDeclaration>();
		for (;;) {
			const entry = imported(checker, value);
			if (entry) {
				components.add(entry.module);
				return;
			}
			if (!ts.isIdentifier(value)) return;
			const symbol = checker.getSymbolAtLocation(value);
			const alias = symbol?.declarations?.length === 1 && symbol.valueDeclaration;
			if (
				!alias ||
				!ts.isVariableDeclaration(alias) ||
				!ts.isVariableDeclarationList(alias.parent) ||
				(alias.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
				!ts.isIdentifier(alias.name) ||
				!alias.initializer ||
				seen.has(alias)
			)
				return;
			seen.add(alias);
			value = skipWrappers(alias.initializer);
		}
	}
	function visit(n: ts.Node) {
		if (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) {
			const tag = imported(checker, n.tagName);
			if (tag && nativeReactCompat(tag.module, tag.name) && original(tag.module)) {
				const prop = n.attributes.properties.find(
					(a) => ts.isJsxAttribute(a) && ts.isIdentifier(a.name) && a.name.text === 'component',
				);
				if (
					prop &&
					ts.isJsxAttribute(prop) &&
					prop.initializer &&
					ts.isJsxExpression(prop.initializer) &&
					prop.initializer.expression
				)
					component(prop.initializer.expression);
				if (ts.isJsxOpeningElement(n)) {
					for (const child of n.parent.children) {
						if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) component(child);
						else if (ts.isJsxExpression(child) && child.expression) component(child.expression);
					}
				}
			}
		}
		ts.forEachChild(n, visit);
	}
	visit(sf);
	return [...components];
}

function* directExportReturns({ sf, checker }: ReturnType<typeof bind>, allowSetup = false) {
	const module = checker.getSymbolAtLocation(sf);
	if (!module || hasEval(sf)) return;
	const uses = localUses(sf, checker);
	for (const symbol of checker.getExportsOfModule(module)) {
		let decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
		if (!decl) continue;
		let splitExport = false;
		if (ts.isExportSpecifier(decl)) {
			if (
				!allowSetup ||
				decl.isTypeOnly ||
				decl.parent.parent.isTypeOnly ||
				decl.parent.parent.moduleSpecifier
			)
				continue;
			const local = checker.getExportSpecifierLocalTargetSymbol(decl)?.valueDeclaration;
			if (!local || !ts.isFunctionDeclaration(local)) continue;
			splitExport = true;
			decl = local;
		}
		let value: ts.Node = decl;
		let defaultRef: ts.Identifier | undefined;
		if (ts.isExportAssignment(decl)) {
			if (decl.isExportEquals) continue;
			value = skipWrappers(decl.expression);
			if (ts.isIdentifier(value)) {
				defaultRef = value;
				decl = checker.getSymbolAtLocation(value)?.valueDeclaration;
				if (!decl || (ts.isVariableDeclaration(decl) && decl.end > value.pos)) continue;
				value = decl;
			}
		}
		const name =
			ts.isVariableDeclaration(value) || ts.isFunctionDeclaration(value) ? value.name : undefined;
		if (
			name &&
			(!ts.isIdentifier(name) ||
				!uses(name).every((ref) => ref === defaultRef || componentTagOrExport(ref)))
		)
			continue;
		if (ts.isVariableDeclaration(value)) {
			if (!(ts.getCombinedNodeFlags(value) & ts.NodeFlags.Const)) continue;
			if (!value.initializer) continue;
			value = skipWrappers(value.initializer);
		}
		const output = returnedJsx(value, allowSetup);
		if (output)
			yield { name: symbol.name, output, localName: name?.text, decl, symbol, splitExport };
	}
}

function returnedJsx(fn: ts.Node, allowSetup: boolean) {
	const value = singleReturn(fn, allowSetup);
	const output = value && skipWrappers(value);
	if (output && (ts.isJsxElement(output) || ts.isJsxSelfClosingElement(output))) return output;
}

function singleReturn(fn: ts.Node, allowSetup = false) {
	if (
		!(ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn) || ts.isArrowFunction(fn)) ||
		fn.asteriskToken ||
		fn.modifiers?.some((item) => item.kind === ts.SyntaxKind.AsyncKeyword)
	)
		return;
	if (fn.body && ts.isBlock(fn.body)) {
		const statements = fn.body.statements;
		const last = statements.at(-1);
		if (!last || !ts.isReturnStatement(last) || !last.expression) return;
		if (statements.length === 1) return last.expression;
		// The codemod moves this setup and its terminal JSX into one template body.
		if (
			!allowSetup ||
			(ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Ambient) !== 0 ||
			(ts.isVariableDeclaration(fn.parent) &&
				(ts.getCombinedModifierFlags(fn.parent) & ts.ModifierFlags.Ambient) !== 0) ||
			(!ts.isFunctionDeclaration(fn) &&
				!ts.isVariableDeclaration(fn.parent) &&
				!ts.isExportAssignment(fn.parent)) ||
			!statements
				.slice(0, -1)
				.every(
					(statement) =>
						ts.isVariableStatement(statement) &&
						!statement.modifiers?.some((item) => item.kind === ts.SyntaxKind.DeclareKeyword) &&
						(statement.declarationList.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const &&
						statement.declarationList.declarations.every((decl) => decl.initializer !== undefined),
				)
		)
			return;
		const output = skipParens(last.expression);
		if (ts.isJsxElement(output) || ts.isJsxSelfClosingElement(output)) return output;
		return;
	}
	return fn.body;
}

function openingTag(element: ts.JsxElement | ts.JsxSelfClosingElement) {
	return ts.isJsxElement(element) ? element.openingElement : element;
}

function hostedLeaf(output: ts.JsxElement | ts.JsxSelfClosingElement) {
	const attrs = openingTag(output).attributes.properties;
	const seen = new Set<string>();
	let component: ts.Expression | undefined;
	for (const attr of attrs) {
		if (!ts.isJsxAttribute(attr) || !ts.isIdentifier(attr.name)) return;
		const name = attr.name.text;
		if (
			seen.has(name) ||
			![
				'component',
				'props',
				'key',
				'hostClassName',
				'hostStyle',
				'hostRole',
				'hostAriaLabel',
			].includes(name)
		)
			return;
		seen.add(name);
		if (name === 'component') {
			const value = attr.initializer;
			if (!value || !ts.isJsxExpression(value) || !value.expression || value.dotDotDotToken) return;
			component = skipWrappers(value.expression);
		}
	}
	const children = ts.isJsxElement(output)
		? withoutJsxIndentation(output.children).filter(
				(child) => !ts.isJsxExpression(child) || child.expression,
			)
		: [];
	if (component) return children.length === 0 ? component : undefined;
	if (seen.has('props')) return;
	const [child, extra] = children;
	if (!extra && child && (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)))
		return openingTag(child).tagName;
}

function ordinaryReactJsx(source: string) {
	return !(
		/@jsx(?:Frag)?\b/i.test(source) ||
		[...source.matchAll(/@jsxRuntime\s+(\S+)/gi)].some(([, mode]) => mode !== 'automatic') ||
		[...source.matchAll(/@jsxImportSource\s+(\S+)/gi)].some(([, name]) => name !== 'react')
	);
}

/** Runtime imports that an explicit server host returns directly. */
export function hostedServerComponents(file: string, source: string) {
	if (!ordinaryReactJsx(source)) return [];
	const bound = bind(file, source);
	const { sf, checker } = bound;
	const edges = [];
	for (const { output } of directExportReturns(bound)) {
		const tag = openingTag(output).tagName;
		if (ts.isIdentifier(tag) && (/^[a-z]/.test(tag.text) || tag.text.includes('-'))) continue;
		const host = imported(checker, tag);
		if (
			host?.module !== 'octane/react/server' ||
			(host.name !== 'OctaneCompat' && host.name !== 'OctaneCompatInline')
		)
			continue;
		const ref = hostedLeaf(output);
		const leaf = ref && imported(checker, ref);
		if (leaf)
			edges.push({ ...leaf, line: sf.getLineAndCharacterOfPosition(output.getStart(sf)).line + 1 });
	}
	return edges;
}

function literalImport(expr: ts.Expression) {
	const call = skipWrappers(expr);
	if (!ts.isCallExpression(call) || call.expression.kind !== ts.SyntaxKind.ImportKeyword) return;
	const [specifier, extra] = call.arguments;
	if (
		specifier &&
		!extra &&
		ts.isStringLiteralLike(specifier) &&
		/^\.{1,2}\//.test(specifier.text) &&
		!/[!%?#\\]/.test(specifier.text)
	)
		return specifier.text;
}

function lazyComponentImport(checker: ts.TypeChecker, tag: ts.JsxTagNameExpression) {
	if (!ts.isIdentifier(tag)) return;
	const symbol = checker.getSymbolAtLocation(tag);
	const decl = symbol?.valueDeclaration;
	if (
		symbol?.declarations?.length !== 1 ||
		!decl ||
		!ts.isVariableDeclaration(decl) ||
		ts.getCombinedModifierFlags(decl) & ts.ModifierFlags.Ambient ||
		!decl.initializer ||
		!ts.isVariableDeclarationList(decl.parent) ||
		(decl.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
		!ts.isVariableStatement(decl.parent.parent) ||
		!ts.isSourceFile(decl.parent.parent.parent)
	)
		return;
	const call = skipWrappers(decl.initializer);
	if (!ts.isCallExpression(call) || ts.isOptionalChain(call) || call.arguments.length !== 1) return;
	const callee = skipWrappers(call.expression);
	if (ts.isOptionalChain(callee)) return;
	const factory = imported(checker, callee);
	if (factory?.module !== 'react' || factory.name !== 'lazy') return;
	const loader = skipWrappers(call.arguments[0]!);
	if (!ts.isArrowFunction(loader) || loader.parameters.length) return;
	const result = singleReturn(loader);
	if (!result) return;
	const direct = literalImport(result);
	if (direct) return { module: direct, name: 'default', lazy: true };
	const map = skipWrappers(result);
	if (
		!ts.isCallExpression(map) ||
		ts.isOptionalChain(map) ||
		map.arguments.length !== 1 ||
		!ts.isPropertyAccessExpression(map.expression) ||
		map.expression.name.text !== 'then'
	)
		return;
	const module = literalImport(map.expression.expression);
	if (!module) return;
	const mapper = skipWrappers(map.arguments[0]!);
	if (!ts.isArrowFunction(mapper) || mapper.parameters.length !== 1) return;
	const parameter = mapper.parameters[0]!;
	if (!ts.isIdentifier(parameter.name) || parameter.initializer || parameter.dotDotDotToken) return;
	const mapped = singleReturn(mapper);
	const object = mapped && skipWrappers(mapped);
	if (!object || !ts.isObjectLiteralExpression(object) || object.properties.length !== 1) return;
	const field = object.properties[0]!;
	if (
		!ts.isPropertyAssignment(field) ||
		!ts.isIdentifier(field.name) ||
		field.name.text !== 'default'
	)
		return;
	const value = skipWrappers(field.initializer);
	if (
		ts.isPropertyAccessExpression(value) &&
		!ts.isOptionalChain(value) &&
		checker.getSymbolAtLocation(value.expression) === checker.getSymbolAtLocation(parameter.name)
	)
		return { module, name: value.name.text, lazy: true };
}

/** Imports rendered directly by a retained component. */
export function retainedReactComponentReturns(file: string, source: string) {
	if (!ordinaryReactJsx(source)) return [];
	const bound = bind(file, source);
	const { sf, checker } = bound;
	const edges: { name: string; module: string; factory?: true; lazy?: true; line: number }[] = [];
	const seen = new Set<ts.Node>();
	const mayBeLazy = source.includes('import') && (source.includes('lazy') || source.includes('\\'));
	for (const { output, localName, decl } of directExportReturns(bound)) {
		if (seen.has(output)) continue;
		const tag = openingTag(output).tagName;
		if (localName && !/^[A-Z]/.test(localName)) continue;
		seen.add(output);
		if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text)) {
			if (
				!ts.isJsxElement(output) ||
				(ts.getCombinedModifierFlags(decl) & ts.ModifierFlags.Ambient) !== 0 ||
				!rendersElementChildren(output.openingElement) ||
				output.openingElement.attributes.properties.some(ts.isJsxSpreadAttribute)
			)
				continue;
			for (const child of output.children) {
				if (!ts.isJsxExpression(child) || !child.expression || child.dotDotDotToken) continue;
				const call = skipWrappers(child.expression);
				if (!ts.isCallExpression(call) || ts.isOptionalChain(call) || call.arguments.length)
					continue;
				const callee = skipWrappers(call.expression);
				const leaf = ts.isIdentifier(callee) && imported(checker, callee);
				if (leaf && /^\.{1,2}\/[^!%?#\\]*\.tsx$/.test(leaf.module))
					edges.push({
						...leaf,
						factory: true,
						line: sf.getLineAndCharacterOfPosition(call.getStart(sf)).line + 1,
					});
			}
			continue;
		}
		if (ts.isIdentifier(tag) && !/^[A-Z]/.test(tag.text)) continue;
		const leaf =
			imported(checker, tag) ?? (mayBeLazy ? lazyComponentImport(checker, tag) : undefined);
		if (leaf?.module.startsWith('.'))
			edges.push({ ...leaf, line: sf.getLineAndCharacterOfPosition(output.getStart(sf)).line + 1 });
	}
	return edges;
}

/** Existing Octane roots that render a directly imported component body. */
export function octaneRootComponents(file: string, source: string) {
	const { sf, checker } = bind(file, source);
	const edges: {
		runtime: 'octane' | 'octane/server';
		module: string;
		name: string;
		line: number;
	}[] = [];
	function clientComponent(call: ts.CallExpression, callee: ts.Expression, hydrate: boolean) {
		if (hydrate && call.arguments.length <= 4) return call.arguments[1];
		if (
			!ts.isPropertyAccessExpression(callee) ||
			ts.isOptionalChain(callee) ||
			callee.name.text !== 'render' ||
			call.arguments.length > 2
		)
			return;
		const root = skipWrappers(callee.expression);
		if (
			ts.isCallExpression(root) &&
			!ts.isOptionalChain(root) &&
			root.arguments.length >= 1 &&
			root.arguments.length <= 2 &&
			!root.arguments.some(ts.isSpreadElement)
		) {
			const factory = imported(checker, skipWrappers(root.expression));
			if (factory?.module === 'octane' && factory.name === 'createRoot') return call.arguments[0];
		}
	}
	function visit(node: ts.Node) {
		if (
			ts.isCallExpression(node) &&
			!ts.isOptionalChain(node) &&
			!node.arguments.some(ts.isSpreadElement)
		) {
			const callee = skipWrappers(node.expression);
			const entry = imported(checker, callee);
			const server = entry?.module === 'octane/server';
			const value = server
				? node.arguments.length <= 3 &&
					(entry.name === 'renderToString' || entry.name === 'renderToStaticMarkup') &&
					node.arguments[0]
				: clientComponent(node, callee, entry?.module === 'octane' && entry.name === 'hydrateRoot');
			const leaf = value ? imported(checker, skipWrappers(value)) : undefined;
			if (leaf?.module.startsWith('.') && /\.[jt]sx$/.test(leaf.module))
				edges.push({
					...leaf,
					runtime: server ? 'octane/server' : 'octane',
					line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
				});
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return edges;
}

/** React server calls that render directly imported components. */
export function reactServerComponents(
	file: string,
	source: string,
	original: (module: 'react' | 'react/jsx-runtime') => boolean,
	selected = false,
) {
	const { sf, checker } = bind(file, source);
	const edges: { module: string; name: string; line: number }[] = [];
	function visit(node: ts.Node) {
		if (ts.isCallExpression(node) && !ts.isOptionalChain(node) && node.arguments.length === 1) {
			const callee = imported(checker, node.expression);
			if (
				callee?.module === 'react-dom/server' &&
				(callee.name === 'renderToString' || callee.name === 'renderToStaticMarkup')
			) {
				const value = skipWrappers(node.arguments[0]);
				let ref: ts.Node | undefined;
				const jsx =
					ts.isJsxSelfClosingElement(value) ||
					(ts.isJsxElement(value) &&
						withoutJsxIndentation(value.children).every(
							(child) => ts.isJsxExpression(child) && !child.expression,
						))
						? openingTag(value)
						: undefined;
				if (
					jsx &&
					(!ts.isIdentifier(jsx.tagName) || /^[A-Z][\w$]*$/.test(jsx.tagName.text)) &&
					(jsx.attributes.properties.length === 0 ||
						(selected &&
							ts.isJsxSelfClosingElement(jsx) &&
							staticReactProps(jsx) !== null &&
							!jsx.attributes.properties.some(
								(attr) =>
									ts.isJsxAttribute(attr) &&
									ts.isIdentifier(attr.name) &&
									attr.name.text === 'children',
							))) &&
					ordinaryReactJsx(source) &&
					original('react/jsx-runtime')
				)
					ref = jsx.tagName;
				if (
					ts.isCallExpression(value) &&
					!ts.isOptionalChain(value) &&
					(value.arguments.length === 1 ||
						(value.arguments.length === 2 &&
							(selected || skipWrappers(value.arguments[1]).kind === ts.SyntaxKind.NullKeyword)))
				) {
					const factory = imported(checker, value.expression);
					if (factory?.module === 'react' && factory.name === 'createElement' && original('react'))
						ref = skipWrappers(value.arguments[0]);
				}
				const leaf = ref && imported(checker, ref);
				if (leaf?.module.startsWith('.') && /\.[jt]sx$/.test(leaf.module))
					edges.push({
						...leaf,
						line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
					});
			}
		}
		if (!selected) ts.forEachChild(node, visit);
	}
	if (selected) {
		function visitDirectRoot(expression: ts.Expression | undefined) {
			const call = expression && skipParens(expression);
			if (!call || !ts.isCallExpression(call)) return;
			const argument = call.arguments[0] && skipParens(call.arguments[0]);
			if (!argument) return;
			if (ts.isJsxSelfClosingElement(argument) && ts.isIdentifier(argument.tagName)) {
				visit(call);
				return;
			}
			const target = ts.isJsxSelfClosingElement(argument)
				? argument.tagName
				: ts.isCallExpression(argument) && argument.arguments[0];
			if (
				target &&
				(ts.isIdentifier(target) || ts.isPropertyAccessExpression(target)) &&
				/^[A-Z]/.test(target.getText(sf).split('.').pop() ?? '')
			)
				visit(call);
		}
		function visitEntryStatement(statement: ts.Statement) {
			if (ts.isVariableStatement(statement)) {
				for (const declaration of statement.declarationList.declarations)
					visitDirectRoot(declaration.initializer);
			} else if (
				ts.isExpressionStatement(statement) ||
				(ts.isExportAssignment(statement) && !statement.isExportEquals)
			) {
				visitDirectRoot(statement.expression);
			}
		}
		for (const statement of sf.statements) {
			if (ts.isIfStatement(statement)) {
				const condition = skipParens(statement.expression);
				if (
					ts.isPropertyAccessExpression(condition) &&
					!ts.isOptionalChain(condition) &&
					condition.name.text === 'main' &&
					ts.isMetaProperty(condition.expression) &&
					condition.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
					condition.expression.name.text === 'meta'
				) {
					const body = statement.thenStatement;
					if (ts.isBlock(body)) body.statements.forEach(visitEntryStatement);
					else visitEntryStatement(body);
				}
			} else if (
				ts.isFunctionDeclaration(statement) &&
				statement.body &&
				!statement.asteriskToken &&
				!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
			) {
				for (const bodyStatement of statement.body.statements)
					if (ts.isReturnStatement(bodyStatement)) visitDirectRoot(bodyStatement.expression);
			} else visitEntryStatement(statement);
		}
	} else visit(sf);
	return edges;
}

/** Local exports whose original body returns React JSX directly. */
export function directReactExports(file: string, source: string) {
	const intrinsics = new Set<string>();
	const wrappers = new Set<string>();
	let mayExportThen = false;
	if (ordinaryReactJsx(source)) {
		const bound = bind(file, source);
		const { sf, checker } = bound;
		const module = checker.getSymbolAtLocation(sf);
		const then =
			module && checker.getExportsOfModule(module).find((symbol) => symbol.name === 'then');
		// import() assimilates a callable namespace then. This local checker cannot resolve wildcard re-exports.
		mayExportThen =
			!!then &&
			(!!(then.flags & ts.SymbolFlags.Value) ||
				!!then.declarations?.some(
					(decl) =>
						(ts.isExportSpecifier(decl) && !decl.isTypeOnly && !decl.parent.parent.isTypeOnly) ||
						(ts.isImportEqualsDeclaration(decl) && !decl.isTypeOnly),
				));
		mayExportThen ||= sf.statements.some(
			(stmt) => ts.isExportDeclaration(stmt) && !stmt.isTypeOnly && !stmt.exportClause,
		);
		for (const { name, output, localName, decl, splitExport } of directExportReturns(bound, true)) {
			const tag = openingTag(output).tagName;
			if (
				!splitExport &&
				ts.isIdentifier(tag) &&
				/^[a-z]/.test(tag.text) &&
				(!localName || /^[A-Z]/.test(localName))
			)
				intrinsics.add(name);
			else if (
				ts.isFunctionDeclaration(decl) &&
				localName === name &&
				/^[A-Z]/.test(name) &&
				ts.isIdentifier(tag) &&
				/^[A-Z]/.test(tag.text)
			)
				wrappers.add(name);
		}
	}
	return { intrinsics, wrappers, mayExportThen };
}

/** Factories whose intrinsic JSX return survives as Octane JSX in the emitted file. */
export function migratedJsxFactories(file: string, source: string, emitted: string) {
	if (!ordinaryReactJsx(source)) return new Set<string>();
	function factories(code: string) {
		const names = new Set<string>();
		for (const { name, output, decl, symbol } of directExportReturns(bind(file, code))) {
			const tag = openingTag(output).tagName;
			if (
				ts.isFunctionDeclaration(decl) &&
				symbol.declarations?.length === 1 &&
				decl.name?.text === name &&
				/^[a-z]/.test(name) &&
				decl.parameters.length === 0 &&
				(ts.getCombinedModifierFlags(decl) &
					(ts.ModifierFlags.Export | ts.ModifierFlags.Ambient)) ===
					ts.ModifierFlags.Export &&
				ts.isIdentifier(tag) &&
				/^[a-z]/.test(tag.text)
			)
				names.add(name);
		}
		return names;
	}
	const original = factories(source);
	// TSX parsing proves the emitted return directly. Volar can hoist it out of the function.
	if (!original.size || parseSync(file, emitted).errors.length) return new Set<string>();
	return original.intersection(factories(emitted));
}

/** Inspect the emitted local export before assigning a reverse island to a server host. */
export async function reverseIslandExports(
	file: string,
	source: string,
	original: (module: string) => boolean,
) {
	const names = new Set<string>();
	if (!importsReactBridge(source)) return names;
	const bound = await bindIsland(file, source);
	if (!bound) return names;
	for (const { name, output } of directExportReturns(bound)) {
		const island = imported(bound.checker, openingTag(output).tagName);
		if (island && nativeReactCompat(island.module, island.name) && original(island.module))
			names.add(name);
	}
	return names;
}

/** Declaration-level type imports disappear even with verbatimModuleSyntax. */
export function executableImports(file: string, source: string, verbatim: boolean) {
	const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
	const imports: string[] = [];
	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
			if (
				hasRuntimeDependency(node, verbatim) &&
				node.moduleSpecifier &&
				ts.isStringLiteral(node.moduleSpecifier)
			)
				imports.push(node.moduleSpecifier.text);
			return;
		}
		if (
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteralLike(node.arguments[0])
		)
			imports.push(node.arguments[0].text);
		ts.forEachChild(node, visit);
	}
	visit(sf);
	return imports;
}
