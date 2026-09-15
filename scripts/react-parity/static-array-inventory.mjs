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
	const evaluate = (expression, depth = 0, bindings = new Map()) => {
		const node = unwrap(expression);
		if (!node || depth > 40 || active.has(node)) return null;
		active.add(node);
		try {
			const inner = (expression) => evaluate(expression, depth + 1, bindings);
			if (ts.isArrayLiteralExpression(node)) {
				if (node.elements.some((item) => ts.isSpreadElement(item) || ts.isOmittedExpression(item)))
					return null;
				return node.elements.map(inner);
			}
			if (ts.isObjectLiteralExpression(node)) {
				const properties = new Map();
				for (const property of node.properties) {
					if (
						!ts.isPropertyAssignment(property) ||
						!property.name ||
						(!ts.isIdentifier(property.name) && !ts.isStringLiteral(property.name)) ||
						property.name.text === '__proto__' ||
						properties.has(property.name.text)
					)
						return null;
					properties.set(property.name.text, inner(property.initializer));
				}
				return properties;
			}
			if (ts.isIdentifier(node)) {
				const symbol = symbolAt(node);
				const declaration = symbol?.valueDeclaration;
				if (!declaration || !(references.get(symbol) ?? []).every(safeReference)) return null;
				if (bindings.has(symbol)) return bindings.get(symbol);
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
				if (
					!Array.isArray(array) ||
					!callback ||
					!ts.isArrowFunction(callback) ||
					ts.isBlock(callback.body)
				)
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
	const iterations = new Map();
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
			if (method === 'forEach') iterations.set(node.expression.name.getStart(sourceFile), node);
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
	const bind = (name, value, bindings) => {
		if (ts.isIdentifier(name)) {
			const symbol = symbolAt(name);
			if (!symbol) return false;
			bindings.set(symbol, value);
			return true;
		}
		if (!ts.isObjectBindingPattern(name) && !ts.isArrayBindingPattern(name)) return false;
		for (const [index, element] of name.elements.entries()) {
			if (ts.isOmittedExpression(element)) continue;
			if (element.dotDotDotToken || element.initializer) return false;
			let item;
			if (ts.isArrayBindingPattern(name)) {
				if (!Array.isArray(value)) return false;
				item = value[index] ?? null;
			} else {
				const key = element.propertyName ?? element.name;
				if (!(value instanceof Map) || (!ts.isIdentifier(key) && !ts.isStringLiteral(key)))
					return false;
				item = value.get(key.text) ?? null;
			}
			if (!bind(element.name, item, bindings)) return false;
		}
		return true;
	};
	const iterationCallback = (call) => {
		const callback = call?.arguments[0];
		return call?.arguments.length === 1 &&
			callback &&
			(ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) &&
			!callback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) &&
			!callback.asteriskToken &&
			callback.parameters.length <= 1 &&
			!callback.parameters.some((parameter) => parameter.initializer || parameter.dotDotDotToken) &&
			!exitsIteration(callback.body)
			? callback
			: null;
	};
	// Follow every reference to a correlated table, including other callbacks
	// that could change a later registration's length. Scalars do not escape
	// mutable table state, but unknown array/object consumers do.
	const containsArray = (value) =>
		Array.isArray(value) || (value instanceof Map && [...value.values()].some(containsArray));
	let inspectionBudget = 0;
	const immutableBindings = (bindings, depth = 0) => {
		if (depth > 40) return false;
		for (const [symbol, value] of bindings) {
			if (!containsArray(value)) continue;
			for (const reference of references.get(symbol) ?? []) {
				if (--inspectionBudget < 0) return false;
				let node = reference;
				while (node.parent && unwrap(node.parent) === reference) node = node.parent;
				const parent = node.parent;
				if (
					(ts.isVariableDeclaration(parent) ||
						ts.isBindingElement(parent) ||
						ts.isParameter(parent)) &&
					parent.name === node
				)
					continue;
				if (
					ts.isVariableDeclaration(parent) &&
					parent.initializer === node &&
					parent.parent.flags & ts.NodeFlags.Const &&
					(ts.isArrayBindingPattern(parent.name) || ts.isObjectBindingPattern(parent.name))
				) {
					const nested = new Map();
					if (!bind(parent.name, value, nested) || !immutableBindings(nested, depth + 1))
						return false;
					continue;
				}
				if (
					!Array.isArray(value) ||
					!ts.isPropertyAccessExpression(parent) ||
					parent.expression !== node ||
					parent.name.text !== 'forEach' ||
					!ts.isCallExpression(parent.parent)
				)
					return false;
				const callback = iterationCallback(parent.parent);
				if (!callback) return false;
				for (const row of value) {
					if (--inspectionBudget < 0) return false;
					const nested = new Map();
					if (
						callback.parameters[0] &&
						(!bind(callback.parameters[0].name, row, nested) ||
							!immutableBindings(nested, depth + 1))
					)
						return false;
				}
			}
		}
		return true;
	};
	// Correlated nested tables need a sum over actual outer rows. Multiplying
	// independent lengths cannot count [{events:[a]}, {events:[b,c]} correctly.
	const countLoops = (offsets, registrationOffset) => {
		let budget = 10000;
		inspectionBudget = 10000;
		const unconditionallyContains = (ancestor, descendant) => {
			for (let node = descendant; node !== ancestor; node = node.parent) {
				if (!node) return false;
				if (
					ts.isIfStatement(node) ||
					ts.isSwitchStatement(node) ||
					ts.isConditionalExpression(node) ||
					ts.isIterationStatement(node, false) ||
					ts.isTryStatement(node) ||
					(ts.isBinaryExpression(node) &&
						[
							ts.SyntaxKind.AmpersandAmpersandToken,
							ts.SyntaxKind.BarBarToken,
							ts.SyntaxKind.QuestionQuestionToken,
						].includes(node.operatorToken.kind))
				)
					return false;
				if (ts.isFunctionLike(node)) {
					const call = node.parent;
					if (
						!ts.isCallExpression(call) ||
						call.arguments[1] !== node ||
						!ts.isIdentifier(call.expression) ||
						call.expression.text !== 'describe' ||
						node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
						exitsIteration(node.body)
					)
						return false;
				}
			}
			return true;
		};
		let registration = sourceFile;
		for (;;) {
			const child = ts.forEachChild(registration, (node) =>
				node.getStart(sourceFile) <= registrationOffset && registrationOffset < node.end
					? node
					: undefined,
			);
			if (!child) break;
			registration = child;
		}
		for (const [index, offset] of offsets.entries()) {
			const callback = iterationCallback(iterations.get(offset));
			const next = index + 1 < offsets.length ? iterations.get(offsets[index + 1]) : registration;
			if (!callback || !next || !unconditionallyContains(callback.body, next)) return null;
		}
		if (!unconditionallyContains(sourceFile, iterations.get(offsets[0]))) return null;
		const walk = (index, bindings) => {
			if (index === offsets.length) return 1;
			const call = iterations.get(offsets[index]);
			const callback = iterationCallback(call);
			if (!callback) return null;
			const rows = evaluate(call.expression.expression, 0, bindings);
			if (!Array.isArray(rows) || rows.length > budget) return null;
			const receiver = unwrap(call.expression.expression);
			if (ts.isIdentifier(receiver) && !immutableBindings(new Map([[symbolAt(receiver), rows]])))
				return null;
			budget -= rows.length;
			let total = 0;
			for (const row of rows) {
				const next = new Map(bindings);
				if (callback.parameters[0] && !bind(callback.parameters[0].name, row, next)) return null;
				if (!immutableBindings(next)) return null;
				const count = walk(index + 1, next);
				if (count === null || total + count > 10000) return null;
				total += count;
			}
			return total;
		};
		return walk(0, new Map());
	};
	return { counts, countLoops };
}
