import ts from 'typescript';
import { contains, renderUses } from './forwarded-props.js';
import { localUses } from './local-uses.js';
import { fixedBinding, initializedBefore } from './effect-receivers.js';
import { skipWrappers } from './expression-wrappers.js';

function rendererImport(name: ts.Identifier, checker: ts.TypeChecker, module = 'react') {
	const binding = checker.getSymbolAtLocation(name)?.declarations?.[0];
	if (!binding || !ts.isImportSpecifier(binding) || binding.isTypeOnly) return;
	const clause = binding.parent.parent;
	const imp = clause.parent;
	if (
		!clause.isTypeOnly &&
		ts.isImportDeclaration(imp) &&
		!imp.attributes &&
		ts.isStringLiteral(imp.moduleSpecifier) &&
		imp.moduleSpecifier.text === module
	)
		return (binding.propertyName ?? binding.name).text;
}

function nullRef(statement: ts.Statement, checker: ts.TypeChecker) {
	if (!ts.isVariableStatement(statement)) return false;
	const { flags, declarations } = statement.declarationList;
	if (!(flags & ts.NodeFlags.Const) || flags & ts.NodeFlags.Using || declarations.length !== 1)
		return false;
	const { name, initializer } = declarations[0];
	return (
		ts.isIdentifier(name) &&
		!!initializer &&
		ts.isCallExpression(initializer) &&
		!initializer.questionDotToken &&
		initializer.arguments.length === 1 &&
		initializer.arguments[0].kind === ts.SyntaxKind.NullKeyword &&
		ts.isIdentifier(initializer.expression) &&
		rendererImport(initializer.expression, checker) === 'useRef'
	);
}

function literalDeclaration(declaration: ts.VariableDeclaration) {
	if (!ts.isIdentifier(declaration.name) || declaration.parent.flags & ts.NodeFlags.Using)
		return false;
	if (!declaration.initializer) return true;
	const value = skipWrappers(declaration.initializer);
	return (
		ts.isLiteralExpression(value) ||
		value.kind === ts.SyntaxKind.TrueKeyword ||
		value.kind === ts.SyntaxKind.FalseKeyword ||
		value.kind === ts.SyntaxKind.NullKeyword
	);
}

function safeSetupLiteral(node: ts.Expression, checker: ts.TypeChecker) {
	if (scalarLiteral(node)) return true;
	if (ts.isIdentifier(node) && node.text === 'undefined') {
		const symbol = checker.getSymbolAtLocation(node);
		return !!symbol && checker.isUndefinedSymbol(symbol);
	}
	return (
		ts.isPrefixUnaryExpression(node) &&
		(node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken) &&
		ts.isNumericLiteral(skipWrappers(node.operand))
	);
}

/** A state declaration before the retained hook, with no explicit lazy initializer. */
function stateSetup(declaration: ts.VariableDeclaration, checker: ts.TypeChecker, owner: ts.Node) {
	const { name, initializer } = declaration;
	if (
		(declaration.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
		declaredVariable(declaration.parent.parent) ||
		!ts.isArrayBindingPattern(name) ||
		!name.elements.every(
			(element) =>
				ts.isOmittedExpression(element) ||
				(!element.dotDotDotToken && !element.initializer && ts.isIdentifier(element.name)),
		) ||
		!initializer ||
		!ts.isCallExpression(initializer) ||
		ts.isOptionalChain(initializer) ||
		!ts.isIdentifier(initializer.expression) ||
		rendererImport(initializer.expression, checker) !== 'useState' ||
		initializer.arguments.length > 1
	)
		return false;
	const input = initializer.arguments[0];
	if (!input) return true;
	const value = skipWrappers(input);
	if (safeSetupLiteral(value, checker)) return true;
	let binding = ts.isIdentifier(value)
		? checker.getSymbolAtLocation(value)?.valueDeclaration
		: undefined;
	while (binding && ts.isBindingElement(binding)) binding = binding.parent.parent;
	return !!binding && ts.isParameter(binding) && binding.parent === owner;
}

/** A direct initialization in an ordinary component with native output. */
export function nativeSetupHook(
	ref: ts.Identifier,
	uses: ReturnType<typeof localUses>,
	checker: ts.TypeChecker,
	diagnostic?: {
		calleeName(callee: ts.Expression): string | null;
		nativeOutput(element: ts.JsxElement | ts.JsxSelfClosingElement): boolean;
		originalReact(): boolean;
		contextSetup?: boolean;
		privateContext?: boolean;
	},
) {
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
	const statement = decl.parent.parent;
	const block = statement.parent;
	if (!ts.isBlock(block) || declaredVariable(statement)) return false;
	const position = block.statements.indexOf(statement);
	let afterState = false;
	if (!diagnostic) {
		if (position === 0) {
			if (decl.parent.declarations[0] !== decl) return false;
		} else if (
			decl.parent.flags & ts.NodeFlags.Using ||
			call.questionDotToken ||
			call.arguments.length ||
			decl.parent.declarations.length !== 1 ||
			!block.statements.slice(0, position).every((prior) => nullRef(prior, checker))
		)
			return false;
	} else if (diagnostic.contextSetup || diagnostic.privateContext) {
		if (
			call.questionDotToken ||
			(diagnostic.privateContext && call.arguments.length !== 0) ||
			decl.parent.declarations.length !== 1 ||
			(decl.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
			!call.arguments.every(
				(argument) =>
					ts.isIdentifier(argument) &&
					fixedBinding(checker, argument, call) &&
					initializedBefore(checker, argument, call),
			) ||
			// Earlier ordinary setup must have returned normally to reach this call.
			!block.statements
				.slice(0, position)
				.every(
					(prior) =>
						ts.isVariableStatement(prior) &&
						(prior.declarationList.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const &&
						prior.declarationList.declarations.length === 1,
				)
		)
			return false;
	} else {
		const setupDeclaration = (declaration: ts.VariableDeclaration) => {
			if (literalDeclaration(declaration)) return true;
			if (!stateSetup(declaration, checker, block.parent) || !diagnostic.originalReact())
				return false;
			afterState = true;
			return true;
		};
		const declarations = decl.parent.declarations;
		if (
			!block.statements
				.slice(0, position)
				.every(
					(prior) =>
						ts.isVariableStatement(prior) &&
						prior.declarationList.declarations.every(setupDeclaration),
				) ||
			!declarations.slice(0, declarations.indexOf(decl)).every(setupDeclaration)
		)
			return false;
	}
	const fn = block.parent;
	if (
		!(ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) ||
		fn.asteriskToken ||
		fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
	)
		return false;
	let owner: ts.FunctionDeclaration | ts.VariableStatement;
	let name: ts.Identifier | undefined;
	if (ts.isFunctionDeclaration(fn)) {
		owner = fn;
		name = fn.name;
	} else {
		if (!diagnostic || (ts.isFunctionExpression(fn) && fn.name && renderUses(uses(fn.name)).length))
			return false;
		let value: ts.Expression = fn;
		while (
			ts.isCallExpression(value.parent) &&
			value.parent.arguments[0] === value &&
			/^(?:memo|forwardRef)$/.test(diagnostic.calleeName(value.parent.expression) ?? '')
		)
			value = value.parent;
		const holder = value.parent;
		if (
			!ts.isVariableDeclaration(holder) ||
			holder.initializer !== value ||
			!ts.isIdentifier(holder.name) ||
			!ts.isVariableDeclarationList(holder.parent) ||
			(holder.parent.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const ||
			!ts.isVariableStatement(holder.parent.parent)
		)
			return false;
		owner = holder.parent.parent;
		name = holder.name;
	}
	if (
		!name ||
		!/^[A-Z]/.test(name.text) ||
		!ts.isSourceFile(owner.parent) ||
		!owner.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ||
		renderUses(uses(name)).some((ref) => {
			const tag = ref.parent;
			return !(
				diagnostic &&
				(ts.isJsxOpeningElement(tag) ||
					ts.isJsxClosingElement(tag) ||
					ts.isJsxSelfClosingElement(tag)) &&
				tag.tagName === ref &&
				diagnostic.nativeOutput(ts.isJsxSelfClosingElement(tag) ? tag : tag.parent)
			);
		})
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
	const intrinsic = tag && ts.isIdentifier(tag) && /^[a-z]/.test(tag.text);
	if (intrinsic && !afterState)
		return diagnostic ? 'diagnostic' : position === 0 ? 'first' : 'afterRefs';
	// The retained hook runs in setup, before the returned child has a renderer.
	if (
		diagnostic &&
		!diagnostic.privateContext &&
		(tag || ts.isJsxFragment(value)) &&
		!ts.isOptionalChain(call) &&
		!(decl.parent.flags & ts.NodeFlags.Using) &&
		call.arguments.every((input) => {
			const arg = skipWrappers(input);
			return (
				safeSetupLiteral(arg, checker) ||
				(ts.isIdentifier(arg) &&
					fixedBinding(checker, arg, call) &&
					initializedBefore(checker, arg, call))
			);
		})
	)
		return 'diagnostic';
	return false;
}

function declaredVariable(statement: ts.Statement) {
	return (
		ts.isVariableStatement(statement) &&
		!!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword)
	);
}

function firstRendererCall(fn: ts.FunctionDeclaration) {
	const first = fn.body?.statements[0];
	const value =
		first &&
		(ts.isVariableStatement(first)
			? first.declarationList.declarations[0]?.initializer
			: ts.isReturnStatement(first) || ts.isExpressionStatement(first)
				? first.expression
				: undefined);
	if (first && value && ts.isCallExpression(value) && ts.isIdentifier(value.expression))
		return { call: value, callee: value.expression, ambient: declaredVariable(first) };
}

function privateContextCall(
	sf: ts.SourceFile,
	checker: ts.TypeChecker,
	uses: ReturnType<typeof localUses>,
	outer: ts.CallExpression,
	callee: ts.Identifier,
) {
	if (ts.isOptionalChain(outer) || outer.arguments.length) return false;
	const helper = checker.getSymbolAtLocation(callee)?.valueDeclaration;
	if (
		!helper ||
		!ts.isFunctionDeclaration(helper) ||
		!helper.name ||
		helper.parent !== sf ||
		helper.modifiers?.length ||
		helper.asteriskToken ||
		helper.parameters.length ||
		renderUses(uses(helper.name)).some(
			(ref) => !ts.isCallExpression(ref.parent) || ref.parent.expression !== ref,
		)
	)
		return false;
	const read = firstRendererCall(helper);
	if (
		!read ||
		read.ambient ||
		ts.isOptionalChain(read.call) ||
		read.call.arguments.length !== 1 ||
		rendererImport(read.callee, checker) !== 'useContext'
	)
		return false;
	const context = read.call.arguments[0];
	const decl = ts.isIdentifier(context) && checker.getSymbolAtLocation(context)?.valueDeclaration;
	if (!decl || !ts.isVariableDeclaration(decl)) return false;
	const list = decl.parent;
	const init = decl.initializer;
	return (
		ts.isVariableDeclarationList(list) &&
		(list.flags & ts.NodeFlags.BlockScoped) === ts.NodeFlags.Const &&
		ts.isVariableStatement(list.parent) &&
		list.parent.parent === sf &&
		!declaredVariable(list.parent) &&
		!!init &&
		ts.isCallExpression(init) &&
		!ts.isOptionalChain(init) &&
		ts.isIdentifier(init.expression) &&
		rendererImport(init.expression, checker) === 'createContext' &&
		init.arguments.length === 1 &&
		scalarLiteral(init.arguments[0])
	);
}

/** Only a call in the first evaluated statement witnesses renderer work in this export. */
export function directRendererCalls(
	sf: ts.SourceFile,
	checker: ts.TypeChecker,
	module: 'react' | 'react-dom',
	accepts: (name: string) => boolean,
	privateContextExports?: Set<string>,
) {
	const calls = new Map<string, string>();
	if (contains(sf, (n) => ts.isIdentifier(n) && n.text === 'eval')) return calls;
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
		const first = firstRendererCall(fn);
		if (!first) continue;
		const name = rendererImport(first.callee, checker, module);
		const direct = name && accepts(name) ? name : undefined;
		if (!direct && !privateContextExports) continue;
		// A local write can replace the exported function before the importer calls it.
		if (
			renderUses(uses(fn.name)).some(
				(ref) => !ts.isCallExpression(ref.parent) || ref.parent.expression !== ref,
			)
		)
			continue;
		if (direct) calls.set(fn.name.text, direct);
		else if (
			privateContextExports &&
			!first.ambient &&
			!fn.parameters.length &&
			privateContextCall(sf, checker, uses, first.call, first.callee)
		)
			privateContextExports.add(fn.name.text);
	}
	return calls;
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
