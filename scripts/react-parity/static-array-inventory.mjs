import ts from 'typescript';

// Inspect array shapes without evaluating test code. Unknown values can occupy
// array slots; unknown lengths, escaping arrays, and mutations remain unknown.
export function staticArrayInventory(source) {
	const file = 'inventory.tsx';
	const sourceFile = ts.createSourceFile(
		file,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const host = ts.createCompilerHost({ noLib: true });
	host.getSourceFile = (name) => (name === file ? sourceFile : undefined);
	const program = ts.createProgram(
		[file],
		{ noLib: true, noResolve: true, jsx: ts.JsxEmit.Preserve },
		host,
	);
	program.getTypeChecker(); // Populate lexical scopes without asking the checker to evaluate JSX types.
	const symbolAt = (identifier) => {
		if (ts.isNamedTupleMember(identifier.parent)) return undefined;
		if (ts.isPropertyAccessExpression(identifier.parent) && identifier.parent.name === identifier)
			return undefined;
		if (
			(ts.isPropertyAssignment(identifier.parent) || ts.isMethodDeclaration(identifier.parent)) &&
			identifier.parent.name === identifier
		)
			return undefined;
		for (let scope = identifier.parent; scope; scope = scope.parent) {
			const symbol = scope.locals?.get(ts.escapeLeadingUnderscores(identifier.text));
			if (symbol) return symbol;
		}
		return undefined;
	};
	const references = new Map();
	const visit = (node) => {
		if (
			ts.isIdentifier(node) &&
			!ts.isJsxOpeningElement(node.parent) &&
			!ts.isJsxClosingElement(node.parent) &&
			!ts.isJsxSelfClosingElement(node.parent) &&
			!ts.isJsxAttribute(node.parent)
		) {
			const symbol = symbolAt(node);
			if (symbol) {
				const list = references.get(symbol) ?? [];
				list.push(node);
				references.set(symbol, list);
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	const unwrap = (node) => {
		while (
			node &&
			(ts.isParenthesizedExpression(node) ||
				ts.isAsExpression(node) ||
				ts.isSatisfiesExpression(node) ||
				ts.isNonNullExpression(node))
		)
			node = node.expression;
		return node;
	};
	// combinate 1.1.11 builds a Cartesian product of nonempty array dimensions.
	// Resolve its import lexically; a similarly named user function is unknown.
	const combinateDimensions = (call) => {
		if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null;
		const declarations = symbolAt(call.expression)?.declarations;
		if (declarations?.length !== 1 || !ts.isImportClause(declarations[0])) return null;
		const declaration = declarations[0];
		if (
			declaration.name?.text !== call.expression.text ||
			declaration.isTypeOnly ||
			declaration.parent.moduleSpecifier.text !== 'combinate' ||
			call.arguments.length !== 1
		)
			return null;
		const object = unwrap(call.arguments[0]);
		if (!object || !ts.isObjectLiteralExpression(object)) return null;
		const keys = new Set();
		for (const property of object.properties) {
			if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property))
				return null;
			if (
				!ts.isIdentifier(property.name) &&
				!ts.isStringLiteral(property.name) &&
				!ts.isNumericLiteral(property.name)
			)
				return null;
			const key = property.name.text;
			if (key === '__proto__' || keys.has(key)) return null;
			keys.add(key);
		}
		return object;
	};
	const safeReference = (identifier) => {
		let node = identifier;
		while (node.parent && unwrap(node.parent) === identifier) node = node.parent;
		const parent = node.parent;
		if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
		if (ts.isBindingElement(parent) && parent.name === node) return true;
		if (ts.isParameter(parent) && parent.name === node) return true;
		if (ts.isArrayLiteralExpression(parent)) return true;
		if (ts.isForOfStatement(parent) && parent.expression === node) return true;
		if (ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) return true;
		if (
			((ts.isPropertyAssignment(parent) && parent.initializer === node) ||
				(ts.isShorthandPropertyAssignment(parent) && parent.name === node)) &&
			ts.isObjectLiteralExpression(parent.parent)
		) {
			let object = parent.parent;
			while (object.parent && unwrap(object.parent) === parent.parent) object = object.parent;
			if (combinateDimensions(object.parent) === parent.parent) return true;
		}
		if (
			ts.isPropertyAccessExpression(parent) &&
			parent.expression === node &&
			['forEach', 'map', 'flatMap'].includes(parent.name.text) &&
			ts.isCallExpression(parent.parent) &&
			parent.parent.expression === parent
		)
			return true;
		if (
			ts.isCallExpression(parent) &&
			parent.arguments[0] === node &&
			ts.isPropertyAccessExpression(parent.expression) &&
			['each', 'for'].includes(parent.expression.name.text)
		)
			return true;
		return false;
	};
	const merge = (values) => {
		if (!values.length || values.some((value) => !Array.isArray(value))) return null;
		const size = values[0].length;
		if (values.some((value) => value.length !== size)) return null;
		return Array.from({ length: size }, (_, index) => merge(values.map((value) => value[index])));
	};
	const active = new Set();
	const evaluate = (expression, depth = 0) => {
		const node = unwrap(expression);
		if (!node || depth > 40 || active.has(node)) return null;
		active.add(node);
		try {
			const inner = (expression) => evaluate(expression, depth + 1);
			if (ts.isArrayLiteralExpression(node)) {
				if (node.elements.some((item) => ts.isSpreadElement(item) || ts.isOmittedExpression(item)))
					return null;
				return node.elements.map(inner);
			}
			if (ts.isIdentifier(node)) {
				const symbol = symbolAt(node);
				const declaration = symbol?.valueDeclaration;
				if (!declaration || !(references.get(symbol) ?? []).every(safeReference)) return null;
				if (ts.isVariableDeclaration(declaration)) {
					if (!(declaration.parent.flags & ts.NodeFlags.Const)) return null;
					return inner(declaration.initializer);
				}
				if (ts.isBindingElement(declaration) && ts.isArrayBindingPattern(declaration.parent)) {
					const container = declaration.parent.parent;
					if (
						!ts.isVariableDeclaration(container) ||
						!(container.parent.flags & ts.NodeFlags.Const)
					)
						return null;
					const tuple = inner(container.initializer);
					return tuple?.[declaration.parent.elements.indexOf(declaration)] ?? null;
				}
				if (ts.isParameter(declaration)) {
					const callback = declaration.parent;
					const call = callback.parent;
					if (
						!ts.isCallExpression(call) ||
						call.arguments[0] !== callback ||
						callback.parameters[0] !== declaration ||
						!ts.isPropertyAccessExpression(call.expression) ||
						!['forEach', 'map', 'flatMap'].includes(call.expression.name.text)
					)
						return null;
					const items = inner(call.expression.expression);
					return items ? merge(items) : null;
				}
			}
			const dimensions = combinateDimensions(node);
			if (dimensions) {
				let size = dimensions.properties.length ? 1 : 0;
				for (const property of dimensions.properties) {
					const values = inner(
						ts.isShorthandPropertyAssignment(property) ? property.name : property.initializer,
					);
					// Empty dimensions reset combinate's accumulator; keep that shape unknown.
					if (!values?.length || size * values.length > 10000) return null;
					size *= values.length;
				}
				return Array(size).fill(null);
			}
			if (
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				['map', 'flatMap'].includes(node.expression.name.text)
			) {
				const array = inner(node.expression.expression);
				const callback = node.arguments[0];
				if (!array || !callback || !ts.isArrowFunction(callback) || ts.isBlock(callback.body))
					return null;
				if (node.expression.name.text === 'map') return array.map(() => inner(callback.body));
				const result = inner(callback.body);
				if (!result || result.length * array.length > 10000) return null;
				return array.flatMap(() => result);
			}
			return null;
		} finally {
			active.delete(node);
		}
	};
	const counts = new Map();
	const exitsIteration = (node) => {
		if (ts.isFunctionLike(node)) return false;
		if (
			ts.isBreakStatement(node) ||
			ts.isContinueStatement(node) ||
			ts.isReturnStatement(node) ||
			ts.isThrowStatement(node)
		)
			return true;
		return ts.forEachChild(node, exitsIteration) ?? false;
	};
	const collect = (node) => {
		if (ts.isForOfStatement(node) && !node.awaitModifier && !exitsIteration(node.statement)) {
			const value = evaluate(node.expression);
			if (value) counts.set(node.getStart(sourceFile), value.length);
		}
		if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
			const method = node.expression.name.text;
			if (['forEach', 'each', 'for'].includes(method)) {
				const value = evaluate(
					method === 'forEach' ? node.expression.expression : node.arguments[0],
				);
				if (value) counts.set(node.expression.name.getStart(sourceFile), value.length);
			}
		}
		ts.forEachChild(node, collect);
	};
	collect(sourceFile);
	return counts;
}
