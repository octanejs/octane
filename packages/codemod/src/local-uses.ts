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

// A file can be queried once per island or store argument. Index its writes once
// for the checker that owns its symbols, and release them with the source file.
type Key = string | undefined; // An unknown computed key can select any member.
function isMember(node: ts.Node): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
	return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}

type LocalWrites = {
	bindings: Map<ts.Symbol, ts.Expression[]>;
	members: (node: ts.Node, visit: (source: ts.Expression) => boolean) => boolean;
};
const writesByFile = new WeakMap<ts.SourceFile, { checker: ts.TypeChecker; writes: LocalWrites }>();

function localWrites(file: ts.SourceFile, checker: ts.TypeChecker): LocalWrites {
	const cached = writesByFile.get(file);
	if (cached?.checker === checker) return cached.writes;
	const bindings = new Map<ts.Symbol, ts.Expression[]>();
	const members = new Map<ts.Symbol, { path: Key[]; source: ts.Expression; exact: boolean }[]>();
	const pending: { target: ts.Expression; source: ts.Expression; exact: boolean }[] = [];

	function keyOf(node: ts.Expression): Key {
		if (isWrapper(node)) return keyOf(node.expression);
		if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
		if (ts.isIdentifier(node)) {
			const d = localSymbol(checker, node)?.valueDeclaration;
			if (
				d &&
				ts.isVariableDeclaration(d) &&
				d.initializer &&
				ts.isVariableDeclarationList(d.parent) &&
				d.parent.flags & ts.NodeFlags.Const &&
				d.end <= node.pos
			)
				return keyOf(d.initializer);
		}
	}

	// Visit the storage locations a local reference may name, including a binding's
	// initializer and subsequent assignments. Unknown computed keys match any field.
	function locations(
		node: ts.Node,
		writing: boolean,
		match: (root: ts.Symbol, path: Key[]) => boolean,
	): boolean {
		const active = new Set<ts.Symbol>();
		const visited = new Map<ts.Symbol, Key[][]>();
		function trace(node: ts.Node, path: Key[]): boolean {
			if (isWrapper(node)) return trace(node.expression, path);
			if (isMember(node)) {
				const key = ts.isPropertyAccessExpression(node)
					? node.name.text
					: keyOf(node.argumentExpression);
				return trace(node.expression, [key, ...path]);
			}
			if (ts.isConditionalExpression(node))
				return trace(node.whenTrue, path) || trace(node.whenFalse, path);
			if (!ts.isIdentifier(node)) return false;
			const symbol = localSymbol(checker, node);
			if (!symbol || active.has(symbol)) return false;
			// A binding can receive the same alias on many control-flow paths.
			const paths = visited.get(symbol);
			if (paths?.some((p) => p.length === path.length && p.every((key, i) => key === path[i])))
				return false;
			if (paths) paths.push(path);
			else visited.set(symbol, [path]);
			if (match(symbol, path)) return true;
			let d = symbol.valueDeclaration;
			if (d?.getSourceFile() !== file) return false;
			active.add(symbol);
			let from = path;
			while (ts.isBindingElement(d)) {
				if (d.initializer && trace(d.initializer, from)) return true;
				const field = d.propertyName ?? d.name;
				if (d.dotDotDotToken) {
					// Rest copies its slots. Only writes below a copied object reach the original.
					if (writing && from.length <= 1) break;
					if (ts.isArrayBindingPattern(d.parent) && from.length) {
						const index = from[0];
						from = [
							index !== undefined && /^(0|[1-9]\d*)$/.test(index)
								? String(d.parent.elements.indexOf(d) + Number(index))
								: undefined,
							...from.slice(1),
						];
					}
				} else {
					const key = ts.isArrayBindingPattern(d.parent)
						? String(d.parent.elements.indexOf(d))
						: propertyName(field);
					from = [key, ...from];
				}
				d = d.parent.parent;
			}
			const found =
				!!(ts.isVariableDeclaration(d) && d.initializer && trace(d.initializer, from)) ||
				!!bindings.get(symbol)?.some((source) => trace(source, path));
			active.delete(symbol);
			return found;
		}
		return trace(node, []);
	}

	function propertyName(name: ts.PropertyName | ts.BindingName): Key {
		if (ts.isComputedPropertyName(name)) return keyOf(name.expression);
		if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name))
			return name.text;
	}

	// A parent replacement can supply a child. In a plain literal, only the
	// selected field supplies it. Fall back to inspecting the source for opaque shapes.
	function selected(source: ts.Expression, path: Key[], start: number): ts.Expression | undefined {
		for (const key of path.slice(start)) {
			while (isWrapper(source)) source = source.expression;
			if (key === undefined || !ts.isObjectLiteralExpression(source)) return;
			let value: ts.Expression | undefined;
			for (const field of source.properties) {
				if (!ts.isPropertyAssignment(field) && !ts.isShorthandPropertyAssignment(field)) return;
				const name = propertyName(field.name);
				if (name === undefined) return;
				if (name === key) value = ts.isPropertyAssignment(field) ? field.initializer : field.name;
			}
			if (!value) return;
			source = value;
		}
		return source;
	}

	function memberSources(node: ts.Node, visit: (source: ts.Expression) => boolean): boolean {
		if (!members.size) return false;
		// Check a reference at its consuming use. Its receiver or alias initializer
		// alone would select the whole object and incorrectly include sibling writes.
		let outer: ts.Node = node;
		while (isWrapper(outer.parent) && outer.parent.expression === outer) outer = outer.parent;
		const p = outer.parent;
		if (
			(isMember(p) && p.expression === outer) ||
			ts.isVariableDeclaration(p) ||
			(ts.isBindingElement(p) && p.initializer !== outer) ||
			(ts.isBinaryExpression(p) &&
				p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
				ts.isIdentifier(p.left) &&
				ts.isExpressionStatement(p.parent))
		)
			return false;

		return locations(
			node,
			false,
			(root, read) =>
				!!members.get(root)?.some(({ path, source, exact }) => {
					if (
						!path.every((key, i) => key === undefined || read[i] === undefined || key === read[i])
					)
						return false;
					return visit((exact && selected(source, read, path.length)) || source);
				}),
		);
	}

	function record(target: ts.Node, source: ts.Expression | undefined, exact: boolean) {
		if (ts.isIdentifier(target)) {
			if (!source) return;
			const symbol = localSymbol(checker, target);
			if (symbol) {
				const values = bindings.get(symbol);
				if (values) values.push(source);
				else bindings.set(symbol, [source]);
			}
		} else if (isMember(target)) {
			if (source) pending.push({ target, source, exact });
		} else if (ts.isArrayLiteralExpression(target) || ts.isObjectLiteralExpression(target)) {
			const entries = ts.isArrayLiteralExpression(target) ? target.elements : target.properties;
			for (const entry of entries) {
				if (ts.isPropertyAssignment(entry) && isMember(entry.initializer) && source && exact) {
					const value = selected(source, [propertyName(entry.name)], 0);
					record(entry.initializer, value ?? source, value !== undefined);
				} else record(entry, source, false);
			}
		} else if (ts.isPropertyAssignment(target)) {
			record(target.initializer, source, exact);
		} else if (ts.isShorthandPropertyAssignment(target)) {
			record(target.name, source, exact);
			if (target.objectAssignmentInitializer)
				record(target.name, target.objectAssignmentInitializer, true);
		} else if (
			ts.isBinaryExpression(target) &&
			target.operatorToken.kind === ts.SyntaxKind.EqualsToken
		) {
			// The file traversal also visits this default assignment and records its right side.
			record(target.left, source, exact);
		} else if (ts.isSpreadElement(target) || ts.isSpreadAssignment(target) || isWrapper(target)) {
			record(target.expression, source, exact);
		}
	}

	function scan(node: ts.Node) {
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
			node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
		) {
			record(node.left, node.right, true);
		} else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
			// for-in supplies string keys, but defaults in its binding pattern can still run.
			if (!ts.isVariableDeclarationList(node.initializer))
				record(node.initializer, ts.isForOfStatement(node) ? node.expression : undefined, false);
		}
		ts.forEachChild(node, scan);
	}
	scan(file);
	for (const { target, source, exact } of pending) {
		locations(target, true, (root, path) => {
			const values = members.get(root);
			if (values) values.push({ path, source, exact });
			else members.set(root, [{ path, source, exact }]);
			return false;
		});
	}
	const writes = { bindings, members: memberSources };
	writesByFile.set(file, { checker, writes });
	return writes;
}

/** Inspect syntax and the declarations and assignments supplying its values in this module.
 * Returning false skips a subtree; undefined follows its children and local values. */
export function walkLocalValues(
	root: ts.Node,
	checker: ts.TypeChecker,
	inspect: (node: ts.Node, visit: (node: ts.Node) => boolean) => boolean | undefined,
): boolean {
	const file = root.getSourceFile();
	const seen = new Set<ts.Node>();
	const followed = new Set<ts.Symbol>();
	function visit(node: ts.Node): boolean {
		if (seen.has(node)) return false;
		seen.add(node);
		const result = inspect(node, visit);
		if (result !== undefined) return result;
		if (ts.isIdentifier(node) || isMember(node)) {
			const writes = localWrites(file, checker);
			if (writes.members(node, visit)) return true;
			if (ts.isIdentifier(node)) {
				const symbol = localSymbol(checker, node);
				const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
				if (symbol && declaration?.getSourceFile() === file && !followed.has(symbol)) {
					followed.add(symbol);
					if (visit(declaration) || writes.bindings.get(symbol)?.some(visit)) return true;
				}
			}
		}
		// Destructuring stores defaults on individual bindings; its value comes from the owner.
		let owner = node;
		while (ts.isBindingElement(owner)) {
			if (owner.initializer && visit(owner.initializer)) return true;
			owner = owner.parent.parent;
		}
		if (ts.isVariableDeclaration(owner) || ts.isParameter(owner)) {
			if (owner.initializer && visit(owner.initializer)) return true;
			const list = owner.parent;
			// for-of (including for-await-of) yields iterable values; for-in yields property names.
			if (
				ts.isVariableDeclarationList(list) &&
				ts.isForOfStatement(list.parent) &&
				visit(list.parent.expression)
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
