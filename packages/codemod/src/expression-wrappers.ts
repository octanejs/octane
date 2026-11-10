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
