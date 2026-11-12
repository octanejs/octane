import ts from 'typescript';
import { contains, renderUses } from './forwarded-props.js';
import { localUses } from './local-uses.js';
import { skipWrappers } from './expression-wrappers.js';

/** A direct initialization in an ordinary component returning a native host. */
export function nativeSetupHook(ref: ts.Identifier, uses: ReturnType<typeof localUses>) {
	const call = ref.parent;
	if (!ts.isCallExpression(call) || call.expression !== ref) return false;
	const decl = call.parent;
	if (
		!ts.isVariableDeclaration(decl) ||
		decl.initializer !== call ||
		!ts.isVariableDeclarationList(decl.parent) ||
		!ts.isVariableStatement(decl.parent.parent)
	)
		return false;
	const block = decl.parent.parent.parent;
	if (!ts.isBlock(block) || block.statements[0] !== decl.parent.parent) return false;
	const fn = block.parent;
	if (
		!ts.isFunctionDeclaration(fn) ||
		!fn.name ||
		!/^[A-Z]/.test(fn.name.text) ||
		fn.body !== block ||
		!ts.isSourceFile(fn.parent) ||
		fn.asteriskToken ||
		!fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ||
		renderUses(uses(fn.name)).length ||
		fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
	)
		return false;
	const last = block.statements.at(-1);
	if (!last || !ts.isReturnStatement(last) || !last.expression) return false;
	const value = skipWrappers(last.expression);
	const tag = ts.isJsxElement(value)
		? value.openingElement.tagName
		: ts.isJsxSelfClosingElement(value)
			? value.tagName
			: undefined;
	return !!tag && ts.isIdentifier(tag) && /^[a-z]/.test(tag.text);
}

/** Only a call in the first evaluated statement witnesses a hook in this export.
 * An import used by a sibling or a deferred callback says nothing about it. */
export function directReactHooks(sf: ts.SourceFile, checker: ts.TypeChecker) {
	const hooks = new Map<string, string>();
	if (contains(sf, (n) => ts.isIdentifier(n) && n.text === 'eval')) return hooks;
	const uses = localUses(sf, checker);
	for (const fn of sf.statements) {
		if (
			!ts.isFunctionDeclaration(fn) ||
			!fn.name ||
			!fn.body ||
			fn.asteriskToken ||
			fn.modifiers?.length !== 1 ||
			fn.modifiers[0].kind !== ts.SyntaxKind.ExportKeyword ||
			fn.parameters.some((p) => !ts.isIdentifier(p.name) || p.initializer)
		)
			continue;
		const first = fn.body.statements[0];
		if (!first) continue;
		const value = ts.isVariableStatement(first)
			? first.declarationList.declarations[0]?.initializer
			: ts.isReturnStatement(first) || ts.isExpressionStatement(first)
				? first.expression
				: undefined;
		if (!value || !ts.isCallExpression(value) || !ts.isIdentifier(value.expression)) continue;
		const binding = checker.getSymbolAtLocation(value.expression)?.declarations?.[0];
		if (!binding || !ts.isImportSpecifier(binding) || binding.isTypeOnly) continue;
		const clause = binding.parent.parent;
		const imp = clause.parent;
		if (
			clause.isTypeOnly ||
			!ts.isImportDeclaration(imp) ||
			imp.attributes ||
			!ts.isStringLiteral(imp.moduleSpecifier) ||
			imp.moduleSpecifier.text !== 'react'
		)
			continue;
		const hook = (binding.propertyName ?? binding.name).text;
		if (hook !== 'useState' && hook !== 'useSyncExternalStore') continue;
		// A local write can replace the exported function before the importer calls it.
		if (
			renderUses(uses(fn.name)).some(
				(ref) => !ts.isCallExpression(ref.parent) || ref.parent.expression !== ref,
			)
		)
			continue;
		hooks.set(fn.name.text, hook);
	}
	return hooks;
}

function scalarLiteral(node: ts.Node) {
	return (
		ts.isStringLiteralLike(node) ||
		ts.isNumericLiteral(node) ||
		node.kind === ts.SyntaxKind.TrueKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		node.kind === ts.SyntaxKind.NullKeyword
	);
}

function returned(fn: ts.FunctionDeclaration) {
	const body = fn.body?.statements;
	const stmt = body?.length === 1 ? body[0] : undefined;
	return stmt && ts.isReturnStatement(stmt) ? stmt.expression : undefined;
}

function primitiveSnapshot(node: ts.Expression): boolean {
	node = skipWrappers(node);
	if (scalarLiteral(node)) return true;
	if (ts.isConditionalExpression(node))
		return primitiveSnapshot(node.whenTrue) && primitiveSnapshot(node.whenFalse);
	return (
		(ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) ||
		(ts.isBinaryExpression(node) &&
			[
				ts.SyntaxKind.EqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsToken,
				ts.SyntaxKind.EqualsEqualsEqualsToken,
				ts.SyntaxKind.ExclamationEqualsEqualsToken,
			].includes(node.operatorToken.kind))
	);
}

/** An unchanged leaf can read DOM attributes and use an observer, without accessing a renderer. */
function neutralAttributeStore(
	sf: ts.SourceFile,
	checker: ts.TypeChecker,
	read: ts.FunctionDeclaration,
) {
	const ambient = (n: ts.Node, name: string) =>
		ts.isIdentifier(n) && n.text === name && !checker.getSymbolAtLocation(n);
	const element = (n: ts.Node) =>
		ts.isPropertyAccessExpression(n) &&
		ambient(n.expression, 'document') &&
		(n.name.text === 'documentElement' || n.name.text === 'body');
	const dataset = (n: ts.Node) =>
		ts.isPropertyAccessExpression(n) && n.name.text === 'dataset' && element(n.expression);
	const observer = (n: ts.Node) => {
		if (!ts.isIdentifier(n)) return false;
		const decl = checker.getSymbolAtLocation(n)?.valueDeclaration;
		return (
			decl &&
			ts.isVariableDeclaration(decl) &&
			ts.isVariableDeclarationList(decl.parent) &&
			(decl.parent.flags & ts.NodeFlags.Const) !== 0 &&
			decl.initializer &&
			ts.isNewExpression(decl.initializer) &&
			ambient(decl.initializer.expression, 'MutationObserver')
		);
	};
	const observerMethod = (n: ts.Node) =>
		ts.isPropertyAccessExpression(n) &&
		(n.name.text === 'observe' || n.name.text === 'disconnect') &&
		observer(n.expression);
	const unsafe = (n: ts.Node): boolean => {
		if (ts.isTypeNode(n)) return false;
		if (
			ts.isPropertyAccessExpression(n) &&
			!element(n) &&
			!dataset(n) &&
			!observerMethod(n) &&
			!(dataset(n.expression) && !Object.hasOwn(Object.prototype, n.name.text))
		)
			return true;
		if (ts.isCallExpression(n) && !observerMethod(n.expression)) return true;
		if (ts.isNewExpression(n) && !ambient(n.expression, 'MutationObserver')) return true;
		if (
			ts.isElementAccessExpression(n) ||
			ts.isTaggedTemplateExpression(n) ||
			ts.isDeleteExpression(n) ||
			ts.isPostfixUnaryExpression(n) ||
			(ts.isPrefixUnaryExpression(n) &&
				(n.operator === ts.SyntaxKind.PlusPlusToken ||
					n.operator === ts.SyntaxKind.MinusMinusToken)) ||
			n.kind === ts.SyntaxKind.ThisKeyword ||
			n.kind === ts.SyntaxKind.SuperKeyword ||
			(ts.isBinaryExpression(n) &&
				n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
				n.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
		)
			return true;
		if (ts.isIdentifier(n)) {
			const parent = n.parent;
			const property =
				(ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) &&
				parent.name === n;
			if (
				!property &&
				!checker.getSymbolAtLocation(n) &&
				!['document', 'MutationObserver', 'undefined'].includes(n.text)
			)
				return true;
		}
		return !!ts.forEachChild(n, unsafe);
	};
	return (
		!ts.forEachChild(sf, unsafe) &&
		!contains(
			read,
			(node) =>
				ts.isCallExpression(node) ||
				ts.isNewExpression(node) ||
				(ts.isReturnStatement(node) && !!node.expression && !primitiveSnapshot(node.expression)),
		)
	);
}

/** Clone a stateless hook while leaving its DOM reader and subscription shared. */
export function nativeExternalStore(
	file: string,
	source: string,
	name: string,
	loadLeaf: (specifier: string) => { sf: ts.SourceFile; checker: ts.TypeChecker } | undefined,
) {
	const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
	if (sf.statements.length !== 4) return;
	const imports = sf.statements.filter(ts.isImportDeclaration);
	const functions = sf.statements.filter(ts.isFunctionDeclaration);
	if (imports.length !== 2 || functions.length !== 2) return;
	const named = (imp: ts.ImportDeclaration) => {
		const clause = imp.importClause;
		const bindings = clause?.namedBindings;
		return !imp.attributes &&
			clause &&
			!clause.name &&
			!clause.isTypeOnly &&
			bindings &&
			ts.isNamedImports(bindings) &&
			bindings.elements.every((el) => !el.isTypeOnly)
			? bindings.elements
			: undefined;
	};
	const react = imports.find(
		(imp) => ts.isStringLiteral(imp.moduleSpecifier) && imp.moduleSpecifier.text === 'react',
	);
	const store = imports.find((imp) => imp !== react);
	if (
		!react ||
		!store ||
		!ts.isStringLiteral(store.moduleSpecifier) ||
		!store.moduleSpecifier.text.startsWith('./')
	)
		return;
	const reactNames = named(react),
		storeNames = named(store);
	if (reactNames?.length !== 1 || storeNames?.length !== 2) return;
	const hook = reactNames[0]!;
	if ((hook.propertyName ?? hook.name).text !== 'useSyncExternalStore') return;
	const wrapper = functions.find((fn) => fn.name?.text === name);
	const server = functions.find((fn) => fn !== wrapper);
	if (
		!wrapper ||
		wrapper.modifiers?.length !== 1 ||
		wrapper.modifiers[0]!.kind !== ts.SyntaxKind.ExportKeyword ||
		wrapper.parameters.length ||
		wrapper.asteriskToken ||
		!server?.name ||
		server.modifiers ||
		server.parameters.length ||
		server.asteriskToken
	)
		return;
	const snapshot = returned(server);
	const call = returned(wrapper);
	if (
		!snapshot ||
		!scalarLiteral(snapshot) ||
		!call ||
		!ts.isCallExpression(call) ||
		call.questionDotToken ||
		!ts.isIdentifier(call.expression) ||
		call.expression.text !== hook.name.text ||
		call.arguments.length !== 3 ||
		!call.arguments.every(ts.isIdentifier) ||
		call.arguments[2]!.getText(sf) !== server.name.text
	)
		return;
	const imported = (node: ts.Expression) =>
		storeNames.find((el) => el.name.text === (node as ts.Identifier).text);
	const subscribe = imported(call.arguments[0]!);
	const read = imported(call.arguments[1]!);
	if (!subscribe || !read || subscribe === read) return;
	const leaf = loadLeaf(store.moduleSpecifier.text);
	if (!leaf) return;
	const { sf: storeFile, checker } = leaf;
	if (
		!storeFile.statements.every(
			(stmt) =>
				ts.isFunctionDeclaration(stmt) &&
				stmt.name &&
				!stmt.asteriskToken &&
				!['document', 'MutationObserver', 'undefined'].includes(stmt.name.text) &&
				stmt.modifiers?.length === 1 &&
				stmt.modifiers[0]!.kind === ts.SyntaxKind.ExportKeyword,
		)
	)
		return;
	const exported = (item: ts.ImportSpecifier) =>
		storeFile.statements
			.filter(ts.isFunctionDeclaration)
			.find((fn) => fn.name?.text === (item.propertyName ?? item.name).text);
	const subscribeFn = exported(subscribe),
		readFn = exported(read);
	if (!subscribeFn || !readFn || !neutralAttributeStore(storeFile, checker, readFn)) return;
	const spec = react.moduleSpecifier;
	return (
		"// Native external-store wrapper generated by Octane codemod.\n'use no memo';\n" +
		source.slice(0, spec.getStart(sf)) +
		"'octane'" +
		source.slice(spec.end)
	);
}
