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
