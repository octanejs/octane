import ts from 'typescript';

export function scalar(type: ts.Type): boolean {
	if (type.isUnion()) return type.types.every(scalar);
	// A primitive intersection keeps its runtime representation, e.g. a branded string ID.
	if (type.isIntersection()) return type.types.some(scalar);
	return !!(
		type.flags &
		(ts.TypeFlags.StringLike |
			ts.TypeFlags.NumberLike |
			ts.TypeFlags.BooleanLike |
			ts.TypeFlags.BigIntLike |
			ts.TypeFlags.Null |
			ts.TypeFlags.Undefined)
	);
}

function localSymbol(checker: ts.TypeChecker, id: ts.Identifier) {
	return ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id
		? checker.getShorthandAssignmentValueSymbol(id.parent)
		: ts.isExportSpecifier(id.parent)
			? checker.getExportSpecifierLocalTargetSymbol(id.parent)
			: checker.getSymbolAtLocation(id);
}

/** Inspect syntax and the declarations supplying its values in this module.
 * Returning false skips a subtree; undefined follows its children and local values. */
export function walkLocalValues(
	root: ts.Node,
	checker: ts.TypeChecker,
	inspect: (node: ts.Node, visit: (node: ts.Node) => boolean) => boolean | undefined,
): boolean {
	const file = root.getSourceFile();
	const seen = new Set<ts.Node>();
	function visit(node: ts.Node): boolean {
		if (seen.has(node)) return false;
		seen.add(node);
		const result = inspect(node, visit);
		if (result !== undefined) return result;
		if (ts.isIdentifier(node)) {
			const symbol = localSymbol(checker, node);
			const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
			if (declaration?.getSourceFile() === file && visit(declaration)) return true;
		}
		// A binding element does not contain the source of its destructuring.
		if (ts.isBindingElement(node)) {
			let owner: ts.Node = node;
			while (ts.isBindingElement(owner)) {
				if (owner.initializer && visit(owner.initializer)) return true;
				owner = owner.parent.parent;
			}
			if (
				(ts.isVariableDeclaration(owner) || ts.isParameter(owner)) &&
				owner.initializer &&
				visit(owner.initializer)
			)
				return true;
		}
		return !!ts.forEachChild(node, visit);
	}
	return visit(root);
}

/** Values that can cross a renderer boundary, optionally including a verified original store input. */
export function portableArguments(
	checker: ts.TypeChecker,
	typeOf: (expr: ts.Expression) => ts.Type,
) {
	function argument(
		expr: ts.Expression,
		imported?: (module: string, name: string) => boolean,
	): boolean {
		if (
			ts.isParenthesizedExpression(expr) ||
			ts.isSatisfiesExpression(expr) ||
			ts.isNonNullExpression(expr)
		)
			return argument(expr.expression, imported);
		if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr))
			return argument(expr.expression, imported);
		if (ts.isConditionalExpression(expr))
			return argument(expr.whenTrue, imported) && argument(expr.whenFalse, imported);
		if (ts.isBinaryExpression(expr)) {
			const op = expr.operatorToken.kind;
			if (op === ts.SyntaxKind.AmpersandAmpersandToken)
				return scalar(typeOf(expr.left)) && argument(expr.right, imported);
			if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken)
				return argument(expr.left, imported) && argument(expr.right, imported);
			if (op === ts.SyntaxKind.CommaToken) return argument(expr.right, imported);
		}
		if (ts.isArrayLiteralExpression(expr))
			return expr.elements.every((el) => argument(el, imported));
		if (ts.isObjectLiteralExpression(expr))
			return expr.properties.every((p) =>
				ts.isShorthandPropertyAssignment(p)
					? !p.objectAssignmentInitializer && argument(p.name, imported)
					: ts.isPropertyAssignment(p) &&
						!ts.isComputedPropertyName(p.name) &&
						argument(p.initializer, imported),
			);
		if (ts.isIdentifier(expr)) {
			const symbol = localSymbol(checker, expr);
			const declaration = symbol?.valueDeclaration;
			if (declaration && ts.isVariableDeclaration(declaration)) {
				return (
					!!declaration.initializer &&
					declaration.end <= expr.pos &&
					ts.isVariableDeclarationList(declaration.parent) &&
					!!(declaration.parent.flags & ts.NodeFlags.Const) &&
					scalar(typeOf(expr)) &&
					argument(declaration.initializer, imported)
				);
			}
			const d = imported && symbol?.declarations?.[0];
			if (
				imported &&
				d &&
				ts.isImportSpecifier(d) &&
				!d.isTypeOnly &&
				!d.parent.parent.isTypeOnly
			) {
				const spec = d.parent.parent.parent.moduleSpecifier;
				if (ts.isStringLiteral(spec) && imported(spec.text, (d.propertyName ?? d.name).text))
					return true;
			}
		}
		if (ts.isCallExpression(expr) && !expr.arguments.every((arg) => argument(arg, imported)))
			return false;
		return scalar(typeOf(expr));
	}
	const clean = new Map<ts.Expression, boolean>();
	return (expr: ts.Expression, imported?: (module: string, name: string) => boolean) => {
		if (!argument(expr, imported)) return false;
		let safe = clean.get(expr);
		if (safe === undefined) {
			safe = !walkLocalValues(expr, checker, (n) =>
				ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)
					? true
					: undefined,
			);
			clean.set(expr, safe);
		}
		return safe;
	};
}

export function localUses(file: ts.SourceFile, checker: ts.TypeChecker) {
	const refs = new Map<ts.Symbol, ts.Identifier[]>();

	function visit(node: ts.Node) {
		if (ts.isIdentifier(node)) {
			const binding = localSymbol(checker, node);
			if (binding) {
				const ids = refs.get(binding);
				if (ids) ids.push(node);
				else refs.set(binding, [node]);
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(file);
	return (id: ts.Identifier) =>
		(refs.get(localSymbol(checker, id)!) ?? []).filter((ref) => ref !== id);
}
