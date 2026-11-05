import ts from 'typescript';

function visit(node: ts.Node, read: (node: ts.Node) => void) {
	read(node);
	ts.forEachChild(node, (child) => visit(child, read));
}

/** A const in this render, or a parameter this render never reassigns. */
function fixedReceiver(checker: ts.TypeChecker, receiver: ts.Identifier, call: ts.CallExpression) {
	const symbol = checker.getSymbolAtLocation(receiver);
	let declaration = symbol?.valueDeclaration;
	if (!declaration) return false;
	while (ts.isBindingElement(declaration)) declaration = declaration.parent.parent;
	const owner = ts.findAncestor(call, ts.isFunctionLike);
	if (!owner || owner !== ts.findAncestor(declaration, ts.isFunctionLike)) return false;
	if (ts.isVariableDeclaration(declaration)) {
		return Boolean(
			declaration.end <= call.getStart() &&
			ts.isVariableDeclarationList(declaration.parent) &&
			declaration.parent.flags & ts.NodeFlags.Const,
		);
	}
	if (!ts.isParameter(declaration)) return false;

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
	return fixed;
}

/**
 * An explicit [owner] observes object identity, even when the effect reads
 * owner.value or calls owner.method(). Read that same binding into the effect
 * and leave the property accesses where React executed them, including cleanup.
 */
export function effectReceivers(
	body: ts.Block,
	checker: ts.TypeChecker,
	reactHook: (name: ts.Expression) => string | null,
	aliases: Map<ts.Identifier, string>,
): string[] {
	const callback = body.parent;
	if (
		!ts.isArrowFunction(callback) ||
		callback.parameters.length ||
		(body.statements.length &&
			ts.isExpressionStatement(body.statements[0]) &&
			ts.isStringLiteral(body.statements[0].expression))
	)
		return [];
	const call = callback.parent;
	if (
		!ts.isCallExpression(call) ||
		call.arguments.length !== 2 ||
		call.arguments[0] !== callback ||
		!['useEffect', 'useLayoutEffect', 'useInsertionEffect'].includes(
			reactHook(call.expression) ?? '',
		)
	)
		return [];
	const deps = call.arguments[1];
	if (!ts.isArrayLiteralExpression(deps)) return [];
	// Accessors can observe evaluation order and duplicate entries in the authored list.
	const identifiers = deps.elements.filter(ts.isIdentifier);
	if (identifiers.length !== deps.elements.length) return [];

	const names = new Set<string>();
	const members = new Map<ts.Symbol, ts.Identifier[]>();
	visit(body, (node) => {
		if (ts.isIdentifier(node)) names.add(node.text);
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
	if (names.has('eval') || !identifiers.every((dep) => fixedReceiver(checker, dep, call)))
		return [];
	const declarations = [];
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
