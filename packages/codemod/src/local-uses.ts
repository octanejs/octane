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

type Key = string | undefined; // An unknown computed key can select any member.
function isMember(node: ts.Node): node is ts.PropertyAccessExpression | ts.ElementAccessExpression {
	return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
}

function isLogical(node: ts.Node): node is ts.BinaryExpression {
	return (
		ts.isBinaryExpression(node) &&
		(node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
			node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
			node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
	);
}

// A rest target owns a shallow copy. For array rest, offset is the first copied index.
type Selection = Key | { offset?: number };
type AssignmentSource = { source: ts.Expression; selection: Selection[] };

function sourcePath(selection: Selection[], path: Key[], writing: boolean): Key[] | undefined {
	for (let i = selection.length - 1; i >= 0; i--) {
		const step = selection[i];
		if (typeof step !== 'object') {
			path = [step, ...path];
		} else {
			if (writing && !path.length) return;
			if (step.offset !== undefined && path.length) {
				const index = path[0];
				path = [
					index !== undefined && /^(0|[1-9]\d*)$/.test(index)
						? String(step.offset + Number(index))
						: undefined,
					...path.slice(1),
				];
			}
		}
	}
	return path;
}

type LocalWrites = {
	bindings: Map<ts.Symbol, AssignmentSource[]>;
	members: (node: ts.Node, visit: (source: ts.Expression) => boolean) => boolean;
};
// A file can be queried once per island or store argument. Index its writes once
// for the checker that owns its symbols, and release them with the source file.
const writesByFile = new WeakMap<ts.SourceFile, { checker: ts.TypeChecker; writes: LocalWrites }>();

function localWrites(file: ts.SourceFile, checker: ts.TypeChecker): LocalWrites {
	const cached = writesByFile.get(file);
	if (cached?.checker === checker) return cached.writes;
	const bindings = new Map<ts.Symbol, AssignmentSource[]>();
	const bindingDefaults = new Set<ts.Node>();
	const members = new Map<ts.Symbol, (AssignmentSource & { path: Key[] })[]>();
	const pending: (AssignmentSource & {
		target: ts.PropertyAccessExpression | ts.ElementAccessExpression;
	})[] = [];

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

	function memberKey(node: ts.PropertyAccessExpression | ts.ElementAccessExpression) {
		return ts.isPropertyAccessExpression(node) ? node.name.text : keyOf(node.argumentExpression);
	}

	// Visit the storage locations a local reference may name, including a binding's
	// initializer and subsequent assignments. Unknown computed keys match any field.
	function locations(
		node: ts.Node,
		writing: boolean,
		match: (root: ts.Symbol, path: Key[]) => boolean,
	): boolean {
		const active = new Set<ts.Symbol>();
		const visited = new Map<ts.Symbol, Set<string>>();
		function trace(node: ts.Node, path: Key[]): boolean {
			if (isWrapper(node)) return trace(node.expression, path);
			if (isMember(node)) {
				return trace(node.expression, [memberKey(node), ...path]);
			}
			if (ts.isConditionalExpression(node))
				return trace(node.whenTrue, path) || trace(node.whenFalse, path);
			if (isLogical(node)) return trace(node.left, path) || trace(node.right, path);
			if ((path.length || !writing) && ts.isArrayLiteralExpression(node)) {
				const [index, ...rest] = path;
				if (index === undefined || node.elements.some(ts.isSpreadElement)) {
					return node.elements.some((el) =>
						ts.isSpreadElement(el) ? trace(el.expression, [undefined, ...rest]) : trace(el, rest),
					);
				}
				const item = /^(0|[1-9]\d*)$/.test(index) && node.elements[Number(index)];
				return !!item && trace(item, rest);
			}
			if ((path.length || !writing) && ts.isObjectLiteralExpression(node)) {
				const [key, ...rest] = path;
				return node.properties.some((field) => {
					if (ts.isSpreadAssignment(field)) return trace(field.expression, path);
					if (!ts.isPropertyAssignment(field) && !ts.isShorthandPropertyAssignment(field))
						return false;
					const name = propertyName(field.name);
					return (
						(key === undefined || name === undefined || key === name) &&
						trace(ts.isPropertyAssignment(field) ? field.initializer : field.name, rest)
					);
				});
			}
			if (!ts.isIdentifier(node)) return false;
			const symbol = localSymbol(checker, node);
			if (!symbol || active.has(symbol)) return false;
			// Conditional aliases can name exponentially many paths. After 64 distinct
			// paths on one binding, keep the first field and depth and allow any nested keys.
			let paths = visited.get(symbol);
			if (!paths) {
				paths = new Set();
				visited.set(symbol, paths);
			}
			const exact = JSON.stringify(path);
			const group = path.length + ':' + JSON.stringify(path[0]);
			if (paths.has(exact) || paths.has(group)) return false;
			if (paths.size >= 64 && path.length > 1) {
				paths.add(group);
				path = [path[0], ...Array<Key>(path.length - 1).fill(undefined)];
			} else paths.add(exact);
			if (match(symbol, path)) return true;
			let d = symbol.valueDeclaration;
			if (d?.getSourceFile() !== file) return false;
			active.add(symbol);
			let from: Key[] | undefined = path;
			while (from && ts.isBindingElement(d)) {
				if (d.initializer && trace(d.initializer, from)) return true;
				const index = ts.isArrayBindingPattern(d.parent) ? d.parent.elements.indexOf(d) : undefined;
				const step = d.dotDotDotToken
					? { offset: index }
					: index === undefined
						? propertyName(d.propertyName ?? d.name)
						: String(index);
				from = sourcePath([step], from, writing);
				d = d.parent.parent;
			}
			let found = false;
			if (from && (ts.isVariableDeclaration(d) || ts.isParameter(d))) {
				if (d.initializer) found = trace(d.initializer, from);
				const list = d.parent;
				if (ts.isVariableDeclarationList(list) && ts.isForOfStatement(list.parent))
					found ||= trace(list.parent.expression, [undefined, ...from]);
			}
			found ||= !!bindings.get(symbol)?.some(({ source, selection }) => {
				const origin = sourcePath(selection, path, writing);
				return origin !== undefined && trace(source, origin);
			});
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
	function selected(source: ts.Expression, path: Key[]): ts.Expression | undefined {
		for (const key of path) {
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
		// Follow only value-bearing edges. Conditions and computed property names are
		// separate reads, and an opaque call can consume its entire argument.
		for (;;) {
			const parent = outer.parent;
			if (
				(ts.isPropertyAssignment(parent) && parent.initializer === outer) ||
				(ts.isShorthandPropertyAssignment(parent) &&
					parent.name === outer &&
					!parent.objectAssignmentInitializer)
			)
				outer = parent.parent;
			else if (
				(isWrapper(parent) && parent.expression === outer) ||
				ts.isArrayLiteralExpression(parent) ||
				(isLogical(parent) && parent.right === outer) ||
				(ts.isConditionalExpression(parent) &&
					(parent.whenTrue === outer || parent.whenFalse === outer))
			)
				outer = parent;
			else break;
		}
		const p = outer.parent;
		if (
			(isMember(p) && p.expression === outer) ||
			ts.isVariableDeclaration(p) ||
			ts.isParameter(p) ||
			ts.isBindingElement(p) ||
			bindingDefaults.has(outer) ||
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
				!!members.get(root)?.some(({ path, source, selection }) => {
					if (
						!path.every((key, i) => key === undefined || read[i] === undefined || key === read[i])
					)
						return false;
					const origin = sourcePath(selection, read.slice(path.length), false)!;
					return visit(selected(source, origin) ?? source);
				}),
		);
	}

	function record(target: ts.Node, source: ts.Expression | undefined, selection: Selection[]) {
		if (ts.isIdentifier(target)) {
			if (!source) return;
			const symbol = localSymbol(checker, target);
			if (symbol) {
				const values = bindings.get(symbol);
				if (values) values.push({ source, selection });
				else bindings.set(symbol, [{ source, selection }]);
			}
		} else if (isMember(target)) {
			if (source) pending.push({ target, source, selection });
		} else if (ts.isArrayLiteralExpression(target)) {
			target.elements.forEach((entry, index) => {
				if (ts.isSpreadElement(entry))
					record(entry.expression, source, [...selection, { offset: index }]);
				else record(entry, source, [...selection, String(index)]);
			});
		} else if (ts.isObjectLiteralExpression(target)) {
			for (const field of target.properties) {
				if (ts.isSpreadAssignment(field)) record(field.expression, source, [...selection, {}]);
				else if (ts.isPropertyAssignment(field))
					record(field.initializer, source, [...selection, propertyName(field.name)]);
				else if (ts.isShorthandPropertyAssignment(field)) {
					record(field.name, source, [...selection, field.name.text]);
					if (field.objectAssignmentInitializer) {
						bindingDefaults.add(field.objectAssignmentInitializer);
						record(field.name, field.objectAssignmentInitializer, []);
					}
				}
			}
		} else if (
			ts.isBinaryExpression(target) &&
			target.operatorToken.kind === ts.SyntaxKind.EqualsToken
		) {
			// scan also visits the default and records its right side as a binding source.
			if (ts.isIdentifier(target.left)) bindingDefaults.add(target.right);
			record(target.left, source, selection);
		} else if (isWrapper(target)) {
			record(target.expression, source, selection);
		}
	}

	function scan(node: ts.Node) {
		if (
			ts.isBinaryExpression(node) &&
			node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
			node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
		) {
			record(node.left, node.right, []);
		} else if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
			// for-in supplies string keys, but defaults in its binding pattern can still run.
			if (!ts.isVariableDeclarationList(node.initializer))
				record(node.initializer, ts.isForOfStatement(node) ? node.expression : undefined, [
					undefined,
				]);
		}
		ts.forEachChild(node, scan);
	}
	scan(file);
	for (const { target, source, selection } of pending) {
		// Resolve the receiver only. Replacing box.row leaves the old row object untouched.
		const key = memberKey(target);
		locations(target.expression, true, (root, receiver) => {
			const path = [...receiver, key];
			const values = members.get(root);
			if (values) values.push({ path, source, selection });
			else members.set(root, [{ path, source, selection }]);
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
					if (
						visit(declaration) ||
						writes.bindings.get(symbol)?.some(({ source }) => visit(source))
					)
						return true;
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
