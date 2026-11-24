import ts from 'typescript';

/**
 * Whether `node` wraps an expression only for grouping or the type checker.
 */
export function isWrapper(
	node: ts.Node,
): node is
	| ts.ParenthesizedExpression
	| ts.AsExpression
	| ts.SatisfiesExpression
	| ts.NonNullExpression
	| ts.TypeAssertion {
	return (
		ts.isParenthesizedExpression(node) ||
		ts.isAsExpression(node) ||
		ts.isSatisfiesExpression(node) ||
		ts.isNonNullExpression(node) ||
		ts.isTypeAssertionExpression(node)
	);
}

export function skipWrappers(node: ts.Expression): ts.Expression {
	while (isWrapper(node)) node = node.expression;
	return node;
}

export function isPrimitiveLiteral(node: ts.Expression) {
	node = skipWrappers(node);
	if (ts.isPrefixUnaryExpression(node)) {
		const operand = skipWrappers(node.operand);
		if (node.operator === ts.SyntaxKind.PlusToken) return ts.isNumericLiteral(operand);
		return (
			node.operator === ts.SyntaxKind.MinusToken &&
			(ts.isNumericLiteral(operand) || ts.isBigIntLiteral(operand))
		);
	}
	return (
		ts.isStringLiteralLike(node) ||
		ts.isNumericLiteral(node) ||
		ts.isBigIntLiteral(node) ||
		node.kind === ts.SyntaxKind.TrueKeyword ||
		node.kind === ts.SyntaxKind.FalseKeyword ||
		node.kind === ts.SyntaxKind.NullKeyword
	);
}

/** Short-circuit behavior if this expression finishes evaluating. */
export function literalCondition(expr: ts.Expression) {
	const value = skipWrappers(expr);
	if (value.kind === ts.SyntaxKind.NullKeyword || ts.isVoidExpression(value)) return 'nullish';
	if (ts.isStringLiteralLike(value)) return value.text.length ? 'truthy' : 'falsy';
	if (ts.isNumericLiteral(value)) return Number(value.text) ? 'truthy' : 'falsy';
	if (value.kind === ts.SyntaxKind.FalseKeyword) return 'falsy';
	if (
		value.kind === ts.SyntaxKind.TrueKeyword ||
		ts.isArrowFunction(value) ||
		ts.isFunctionExpression(value) ||
		ts.isClassExpression(value) ||
		ts.isArrayLiteralExpression(value) ||
		ts.isObjectLiteralExpression(value)
	)
		return 'truthy';
}
