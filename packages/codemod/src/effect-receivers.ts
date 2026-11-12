import ts from 'typescript';
import { inTypeNode, localSymbol } from './local-uses.js';

function visit(node: ts.Node, read: (node: ts.Node) => void) {
	read(node);
	ts.forEachChild(node, (child) => visit(child, read));
}

/** A const already initialized in this function, or a parameter it never reassigns. */
export function fixedBinding(
	checker: ts.TypeChecker,
	name: ts.Identifier,
	read: ts.Expression,
	parameters?: Map<ts.Symbol, boolean>,
) {
	const symbol = checker.getSymbolAtLocation(name);
	if (symbol?.declarations?.length !== 1 || !symbol.valueDeclaration) return false;
	let declaration = symbol.valueDeclaration;
	while (ts.isBindingElement(declaration)) declaration = declaration.parent.parent;
	const owner = ts.findAncestor(read, ts.isFunctionLike);
	if (!owner || owner !== ts.findAncestor(declaration, ts.isFunctionLike)) return false;
	if (ts.isVariableDeclaration(declaration)) {
		return Boolean(
			declaration.end <= read.getStart() &&
			ts.isVariableDeclarationList(declaration.parent) &&
			declaration.parent.flags & ts.NodeFlags.Const,
		);
	}
	if (!ts.isParameter(declaration)) return false;
	const known = parameters?.get(symbol);
	if (known !== undefined) return known;

	let fixed = true;
	visit(owner, (node) => {
		if (ts.isIdentifier(node) && node.text === 'eval') fixed = false;
		let target: ts.Node | undefined;
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
			node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
		)
			target = node.left;
		if (
			(ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) &&
			(node.operator === ts.SyntaxKind.PlusPlusToken ||
				node.operator === ts.SyntaxKind.MinusMinusToken)
		)
			target = node.operand;
		if (ts.isForInStatement(node) || ts.isForOfStatement(node)) target = node.initializer;
		if (target && !ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) {
			visit(target, (name) => {
				if (!ts.isIdentifier(name)) return;
				const ref = ts.isShorthandPropertyAssignment(name.parent)
					? checker.getShorthandAssignmentValueSymbol(name.parent)
					: checker.getSymbolAtLocation(name);
				if (ref === symbol) fixed = false;
			});
		}
	});
	parameters?.set(symbol, fixed);
	return fixed;
}

/** An identifier moved past a getter must already be initialized, even across switch cases. */
export function initializedBefore(checker: ts.TypeChecker, name: ts.Identifier, call: ts.Node) {
	let declaration = checker.getSymbolAtLocation(name)?.valueDeclaration;
	while (declaration && ts.isBindingElement(declaration)) declaration = declaration.parent.parent;
	if (!declaration) return false;
	if (ts.isParameter(declaration)) return true;
	const statement = declaration.parent.parent;
	return (
		ts.isVariableStatement(statement) &&
		ts.isBlock(statement.parent) &&
		statement.end <= call.getStart() &&
		!!ts.findAncestor(call, (n) => n === statement.parent)
	);
}

/** Keep calls to ref-only helpers at their original effect, event or cleanup phase. */
function effectHelpers(
	body: ts.Block,
	checker: ts.TypeChecker,
	reactHook: (name: ts.Expression) => string | null,
	uses: (name: ts.Identifier) => ts.Identifier[],
	emit: (arrow: ts.ArrowFunction) => string,
) {
	const effect = body.parent.parent;
	const scope = effect.parent.parent;
	const destination = body.statements[0];
	if (
		!destination ||
		!ts.isExpressionStatement(effect.parent) ||
		!ts.isBlock(scope) ||
		!ts.isFunctionLike(scope.parent)
	)
		return [];
	const helpers = new Set<ts.VariableDeclaration>();
	visit(body, (node) => {
		if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
		const decl = checker.getSymbolAtLocation(node.expression)?.valueDeclaration;
		if (
			decl &&
			ts.isVariableDeclaration(decl) &&
			!decl.type &&
			ts.isVariableDeclarationList(decl.parent) &&
			decl.parent.declarations.length === 1 &&
			decl.parent.flags & ts.NodeFlags.Const &&
			ts.isVariableStatement(decl.parent.parent) &&
			decl.parent.parent.parent === scope &&
			decl.end < effect.getStart() &&
			decl.initializer &&
			ts.isArrowFunction(decl.initializer)
		)
			helpers.add(decl);
	});
	const declarations = [];
	for (const decl of helpers) {
		const arrow = decl.initializer as ts.ArrowFunction;
		if (
			!ts.isIdentifier(decl.name) ||
			arrow.modifiers?.length ||
			arrow.typeParameters?.length ||
			arrow.parameters.some((p) => !ts.isIdentifier(p.name) || p.initializer || p.dotDotDotToken) ||
			checker.resolveName(decl.name.text, destination, ts.SymbolFlags.Value, false) !==
				checker.getSymbolAtLocation(decl.name)
		)
			continue;
		const refs = uses(decl.name);
		const inside = refs.filter((ref) => ref.pos >= body.pos && ref.end <= body.end);
		if (
			!refs.some(
				(ref) =>
					(ref.pos < body.pos || ref.end > body.end) &&
					ts.isCallExpression(ref.parent) &&
					ref.parent.expression === ref,
			) ||
			!inside.length ||
			!inside.every(
				(ref) =>
					ts.isCallExpression(ref.parent) &&
					ref.parent.expression === ref &&
					!ref.parent.questionDotToken,
			)
		)
			continue;
		let readsRef = false;
		let safe = true;
		visit(arrow, (node) => {
			if (!safe) return;
			if (
				ts.isTaggedTemplateExpression(node) ||
				ts.isJsxOpeningLikeElement(node) ||
				ts.isJsxFragment(node) ||
				ts.isClassLike(node) ||
				ts.isMetaProperty(node) ||
				ts.isTypeQueryNode(node) ||
				node.kind === ts.SyntaxKind.ThisKeyword ||
				node.kind === ts.SyntaxKind.SuperKeyword
			)
				safe = false;
			if (!ts.isIdentifier(node)) return;
			if (
				node.text === 'eval' ||
				node.text === 'arguments' ||
				/^use(?:[A-Z0-9]|$)/.test(node.text)
			) {
				safe = false;
				return;
			}
			const parent = node.parent;
			if (
				((ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) &&
					parent.name === node) ||
				(ts.isQualifiedName(parent) && parent.right === node)
			)
				return;
			const type = ts.isPartOfTypeNode(node);
			const flags = type ? ts.SymbolFlags.Type | ts.SymbolFlags.Namespace : ts.SymbolFlags.Value;
			const captured = checker.resolveName(node.text, node, flags, false);
			if (
				captured?.declarations?.some(
					(d) =>
						d.getSourceFile() === arrow.getSourceFile() && d.pos >= arrow.pos && d.end <= arrow.end,
				)
			)
				return;
			if (checker.resolveName(node.text, destination, flags, false) !== captured) {
				safe = false;
				return;
			}
			if (type || !captured) return;
			const binding = captured.valueDeclaration;
			if (
				binding &&
				ts.isVariableDeclaration(binding) &&
				binding.parent.parent.parent === scope &&
				ts.isVariableDeclarationList(binding.parent) &&
				binding.parent.flags & ts.NodeFlags.Const &&
				binding.end <= effect.getStart() &&
				binding.initializer &&
				ts.isCallExpression(binding.initializer) &&
				reactHook(binding.initializer.expression) === 'useRef' &&
				ts.isPropertyAccessExpression(parent) &&
				parent.expression === node &&
				parent.name.text === 'current'
			) {
				readsRef = true;
			} else if (captured.declarations?.some((d) => d.getSourceFile() === arrow.getSourceFile()))
				safe = false;
		});
		if (safe && readsRef) declarations.push(`const ${decl.name.text} = ${emit(arrow)};`);
	}
	return declarations;
}

/**
 * An explicit [owner] observes object identity even when the callback reads
 * owner.value or calls owner.method(). Read the binding inside the callback
 * and leave property accesses where React executed them, including cleanup.
 */
export function effectReceivers(
	callback: ts.ArrowFunction,
	checker: ts.TypeChecker,
	reactHook: (name: ts.Expression) => string | null,
	aliases: Map<ts.Expression, string>,
	snapshot?: (
		statement: ts.ExpressionStatement,
		member: ts.PropertyAccessExpression,
		name: string,
	) => void,
	bridgeLayout?: (statement: ts.ExpressionStatement, name: string) => void,
	helperUses?: (name: ts.Identifier) => ts.Identifier[],
	emitHelper?: (arrow: ts.ArrowFunction) => string,
): string[] {
	const { body } = callback;
	if (
		callback.parameters.length ||
		(ts.isBlock(body) &&
			body.statements.length &&
			ts.isExpressionStatement(body.statements[0]) &&
			ts.isStringLiteral(body.statements[0].expression))
	)
		return [];
	const call = callback.parent;
	if (!ts.isCallExpression(call)) return [];
	const hook = reactHook(call.expression);
	const imperative = hook === 'useImperativeHandle';
	const callbackIndex = imperative ? 1 : 0;
	if (
		(!imperative && !['useEffect', 'useLayoutEffect', 'useInsertionEffect'].includes(hook ?? '')) ||
		call.arguments.length !== callbackIndex + 2 ||
		call.arguments[callbackIndex] !== callback ||
		(imperative && ts.isSpreadElement(call.arguments[0]!))
	)
		return [];
	const deps = call.arguments[callbackIndex + 1]!;
	if (!ts.isArrayLiteralExpression(deps)) return [];

	const identifiers = deps.elements.filter(ts.isIdentifier);
	const hasProperties = identifiers.length !== deps.elements.length;
	// A property snapshot would run before the imperative handle evaluates its ref.
	if (hasProperties && (imperative || !snapshot)) return [];

	const dependencies = new Map(
		identifiers.map((dep) => [dep.text, checker.getSymbolAtLocation(dep)]),
	);
	const captured = new Set<ts.Symbol>();
	const names = new Set<string>();
	const members = new Map<ts.Symbol, ts.Identifier[]>();
	visit(body, (node) => {
		if (ts.isIdentifier(node)) {
			names.add(node.text);
			const dependency = dependencies.get(node.text);
			if (dependency && !inTypeNode(node) && localSymbol(checker, node) === dependency)
				captured.add(dependency);
		}
		if (
			(!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) ||
			!ts.isIdentifier(node.expression)
		)
			return;
		const receiver = node.expression;
		const symbol = checker.getSymbolAtLocation(receiver);
		if (!symbol) return;
		const uses = members.get(symbol) ?? [];
		uses.push(receiver);
		members.set(symbol, uses);
	});
	if (names.has('eval') || !identifiers.every((dep) => fixedBinding(checker, dep, call))) return [];
	if (
		helperUses &&
		emitHelper &&
		!deps.elements.length &&
		ts.isBlock(body) &&
		!call.questionDotToken &&
		(hook === 'useEffect' || hook === 'useLayoutEffect')
	)
		return effectHelpers(body, checker, reactHook, helperUses, emitHelper);
	const declarations = [];
	if (hasProperties) {
		const properties = deps.elements.filter(ts.isPropertyAccessExpression);
		const statement = call.parent;
		if (
			!snapshot ||
			properties.length + identifiers.length !== deps.elements.length ||
			!ts.isIdentifier(call.expression) ||
			call.questionDotToken ||
			!ts.isExpressionStatement(statement) ||
			!ts.isBlock(statement.parent) ||
			!identifiers.every((dep) => initializedBefore(checker, dep, call))
		)
			return [];
		// Preserve statement directives and comments around the dependency list.
		const source = body.getSourceFile().text;
		if (
			/\/[/*]/.test(
				source.slice(statement.pos, body.getStart()) + source.slice(body.end, statement.end),
			)
		)
			return [];
		const parameters = new Map<ts.Symbol, boolean>();
		const canBridgeLayout =
			bridgeLayout &&
			hook === 'useLayoutEffect' &&
			!callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword);
		let layoutEvent = false;
		for (const property of properties) {
			let root: ts.Expression = property;
			while (ts.isPropertyAccessExpression(root) && ts.isIdentifier(root.name))
				root = root.expression;
			if (!ts.isIdentifier(root) || !fixedBinding(checker, root, call, parameters)) return [];
			if (names.has(root.text)) {
				const symbol = checker.getSymbolAtLocation(root);
				if (!canBridgeLayout || !symbol || !members.has(symbol)) return [];
				layoutEvent = true;
			}
		}
		// Accessors observe the order and multiplicity of the original render-time reads.
		for (const [index, property] of properties.entries()) {
			let name = 'effectDependency' + (index + 1);
			while (names.has(name) || checker.resolveName(name, call, ts.SymbolFlags.Value, false))
				name += '_';
			names.add(name);
			snapshot(statement, property, name);
			declarations.push(`void ${name};`);
		}
		if (layoutEvent && bridgeLayout) {
			// Run the latest committed setup at layout time, including after Activity reconnects.
			let name = 'runLayoutEffect';
			while (names.has(name) || checker.resolveName(name, call, ts.SymbolFlags.Value, false))
				name += '_';
			bridgeLayout(statement, name);
			for (const { text } of identifiers) declarations.push(`void ${text};`);
			declarations.push(`return ${name}();`);
			return declarations;
		}
	}
	// A property label can share the name of a deliberate restart trigger.
	for (const [text, symbol] of dependencies) {
		if (
			!symbol ||
			captured.has(symbol) ||
			checker.resolveName(text, body, ts.SymbolFlags.Value, false) !== symbol
		)
			continue;
		declarations.push(`void ${text};`);
		names.add(text);
	}
	for (const dep of identifiers) {
		const symbol = checker.getSymbolAtLocation(dep);
		const uses = symbol && members.get(symbol);
		if (!uses) continue;
		let alias = 'current' + dep.text[0].toUpperCase() + dep.text.slice(1);
		while (names.has(alias)) alias += 'Value';
		names.add(alias);
		for (const use of uses) aliases.set(use, alias);
		members.delete(symbol);
		declarations.push(`const ${alias} = ${dep.text};`);
	}
	return declarations;
}
