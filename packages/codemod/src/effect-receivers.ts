import ts from 'typescript';

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
function initializedBefore(checker: ts.TypeChecker, name: ts.Identifier, call: ts.CallExpression) {
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
	if (names.has('eval') || !identifiers.every((dep) => fixedBinding(checker, dep, call))) return [];
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
		for (const property of properties) {
			let root: ts.Expression = property;
			while (ts.isPropertyAccessExpression(root) && ts.isIdentifier(root.name))
				root = root.expression;
			if (
				!ts.isIdentifier(root) ||
				names.has(root.text) ||
				!fixedBinding(checker, root, call, parameters)
			)
				return [];
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
	}
	// An otherwise unused dependency can intentionally restart the effect.
	for (const { text } of identifiers) {
		if (names.has(text)) continue;
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
