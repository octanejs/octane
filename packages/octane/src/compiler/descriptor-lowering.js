/**
 * Where authored template JSX also lowers to element descriptors.
 *
 * A component rendered from a `@{ … }` body normally receives its children as
 * a compiled body. Two authored shapes lower that JSX to element descriptors
 * instead, and a proof that relies on compiled bodies (see private-context.js)
 * must stop at both:
 *
 * - the children of a component marked with `descriptorChildren`, or of a
 *   transport boundary such as `ReactCompat`, stay inspectable descriptors;
 * - a `@{ … }` function that code calls directly also compiles to its
 *   returned-JSX form, whose JSX is a value (see splitDirectlyCalledComponents
 *   and lowerDirectlyCalledTemplateFunctions in compile.js).
 *
 * The compiler's lowering passes and those proofs share these predicates.
 */

/**
 * Local names whose JSX children the compiler lowers to element descriptors:
 * `descriptorChildren(…)` module bindings, `ReactCompat` transport boundaries,
 * and imports the bundler proved marked.
 */
export function collectDescriptorChildrenBindings(ast, isDescriptorChildrenImport) {
	const markerNames = new Set();
	const bindings = new Set();
	for (const statement of ast.body || []) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		for (const specifier of statement.specifiers || []) {
			if (specifier.importKind === 'type' || !specifier.local?.name) continue;
			const imported =
				specifier.type === 'ImportDefaultSpecifier'
					? 'default'
					: (specifier.imported?.name ?? specifier.imported?.value);
			if (statement.source.value === 'octane' && imported === 'descriptorChildren') {
				markerNames.add(specifier.local.name);
			}
			// Public transport boundaries work with the standalone compiler too,
			// where no bundler module-graph metadata is available (the playground).
			if (
				imported === 'ReactCompat' &&
				(statement.source.value === 'octane/react' ||
					statement.source.value === 'octane/react/server')
			) {
				bindings.add(specifier.local.name);
			}
			if (
				typeof imported === 'string' &&
				typeof isDescriptorChildrenImport === 'function' &&
				isDescriptorChildrenImport(statement.source.value, imported) === true
			) {
				bindings.add(specifier.local.name);
			}
		}
	}
	for (const statement of ast.body || []) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const item of declaration.declarations || []) {
			if (
				item.id?.type === 'Identifier' &&
				item.init?.type === 'CallExpression' &&
				item.init.callee?.type === 'Identifier' &&
				markerNames.has(item.init.callee.name) &&
				item.init.arguments?.length === 1
			) {
				bindings.add(item.id.name);
			}
		}
	}
	return bindings;
}

/**
 * The name a call invokes as a function, or null. `helper(…)` and
 * `helper?.(…)` call it, and so do `helper.call(…)`, `helper.apply(…)`, and
 * `rows.map(helper)`, which passes the row index where a render body takes its
 * Scope. Optional calls are an `optional` CallExpression inside a
 * ChainExpression, or Babel's OptionalCallExpression and
 * OptionalMemberExpression.
 */
export function directlyCalledName(node) {
	if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return null;
	let callee = unwrapTsExpr(node.callee);
	if (callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') {
		const method = callee.computed ? callee.property?.value : callee.property?.name;
		callee =
			method === 'call' || method === 'apply'
				? unwrapTsExpr(callee.object)
				: method === 'map'
					? unwrapTsExpr(node.arguments[0])
					: null;
	}
	return callee?.type === 'Identifier' ? callee.name : null;
}

/** The names in `names` that code anywhere in `statements` calls directly. */
export function findDirectlyCalledNames(statements, names) {
	const called = new Set();
	walkWithEnclosingFunctions(statements, (node) => {
		const name = directlyCalledName(node);
		if (name !== null && names.has(name)) called.add(name);
	});
	return called;
}

/**
 * The template functions that lowerDirectlyCalledTemplateFunctions rewrites to
 * their returned-JSX form. Its comment in compile.js states the rules.
 */
export function findDirectlyCalledTemplateFunctions(ast) {
	// Template function expressions, found anywhere.
	const expressions = new Set();
	// Nested template function node → [binding name, the function declaring it].
	const candidates = new Map();
	walkWithEnclosingFunctions(ast.body, (node, functions) => {
		const type = node.type;
		if (type === 'ArrowFunctionExpression' || type === 'FunctionExpression') {
			if (isLowerableTemplateFunction(node)) expressions.add(node);
			return;
		}
		if (functions.length === 0) return;
		let fn = null;
		let name;
		if (type === 'FunctionDeclaration') {
			fn = node;
			name = node.id?.name;
		} else if (type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
			const init = unwrapTsExpr(node.init);
			if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
				fn = init;
				name = node.id.name;
			}
		}
		if (fn !== null && name !== undefined && isLowerableTemplateFunction(fn)) {
			candidates.set(fn, [name, functions[functions.length - 1]]);
		}
	});
	if (expressions.size === 0 && candidates.size === 0) return new Set();

	let renderingCallees = null;
	// True when the callee never calls the call's function arguments: the runtime
	// renders them, or an `Object` static stores or returns them.
	const keepsArguments = (call) => {
		const callee = unwrapTsExpr(call.callee);
		if (isObjectPassThroughCallee(callee)) return true;
		if (callee?.type !== 'Identifier') return false;
		if (callee.name === 'createPortal') return true;
		renderingCallees ??= collectOctaneImportLocals(ast.body, ['memo', 'createElement']);
		return renderingCallees.has(callee.name);
	};
	const lowered = new Set();
	const names = new Set([...candidates.values()].map(([name]) => name));
	// Function node → candidate names that code inside it calls or passes on.
	const calledIn = new Map();
	const markCalled = (functions, name) => {
		for (const fn of functions) {
			let called = calledIn.get(fn);
			if (called === undefined) calledIn.set(fn, (called = new Set()));
			called.add(name);
		}
	};
	walkWithEnclosingFunctions(ast.body, (node, functions) => {
		const type = node.type;
		if (
			type !== 'CallExpression' &&
			type !== 'OptionalCallExpression' &&
			type !== 'NewExpression'
		) {
			return;
		}
		const name = directlyCalledName(node);
		if (name !== null && names.has(name)) markCalled(functions, name);
		// The callee calls a function passed to it, as `rows.map(fn)` does with
		// the row index where a Scope would go.
		const args = node.arguments;
		for (let i = 0; i < args.length; i++) {
			const arg = unwrapTsExpr(args[i]);
			if (expressions.has(arg)) {
				if (!keepsArguments(node)) lowered.add(arg);
			} else if (arg?.type === 'Identifier' && names.has(arg.name) && !keepsArguments(node)) {
				markCalled(functions, arg.name);
			}
		}
	});
	for (const [fn, [name, owner]] of candidates) {
		if (calledIn.get(owner)?.has(name)) lowered.add(fn);
	}
	return lowered;
}

/**
 * The `@{ … }` bodies of a module whose JSX also lowers to element
 * descriptors: each module-level component that code calls directly, which
 * splitDirectlyCalledComponents gives a returned-JSX twin, and each function
 * findDirectlyCalledTemplateFunctions finds. Bodies are keyed by their block,
 * which normalizeArrowComponents keeps for `const X = () => @{ … }`, so an
 * authored module answers for the module the compiler lowers.
 */
export function findReturnedJsxTemplateBodies(ast) {
	const statements = ast.body || [];
	const components = new Map();
	for (const statement of statements) {
		const node =
			statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
				? statement.declaration
				: statement;
		if (node?.type === 'VariableDeclaration') {
			for (const declarator of node.declarations ?? []) {
				const init = declarator.init;
				if (
					declarator.id?.type === 'Identifier' &&
					(init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') &&
					isLowerableTemplateFunction(init)
				)
					components.set(declarator.id.name, init.body);
			}
		} else if (
			(node?.type === 'FunctionDeclaration' || node?.type === 'FunctionExpression') &&
			node.id != null &&
			isLowerableTemplateFunction(node)
		)
			components.set(node.id.name, node.body);
	}
	const bodies = new Set();
	for (const fn of findDirectlyCalledTemplateFunctions(ast)) bodies.add(fn.body);
	for (const name of findDirectlyCalledNames(statements, new Set(components.keys())))
		bodies.add(components.get(name));
	return bodies;
}

export function isLowerableTemplateFunction(fn) {
	return fn.body?.type === 'JSXCodeBlock' && !fn.async && !fn.generator;
}

// The `Object` statics that return their first argument and call none of their
// arguments. `Object.groupBy` calls its callback, so it is not one of them.
const OBJECT_PASS_THROUGH_METHODS = new Set([
	'assign',
	'defineProperties',
	'defineProperty',
	'freeze',
	'preventExtensions',
	'seal',
	'setPrototypeOf',
]);

/** `Object.assign`, `Object.freeze`, or another pass-through `Object` static. */
export function isObjectPassThroughCallee(callee) {
	return (
		callee?.type === 'MemberExpression' &&
		!callee.computed &&
		callee.object?.type === 'Identifier' &&
		callee.object.name === 'Object' &&
		OBJECT_PASS_THROUGH_METHODS.has(callee.property?.name)
	);
}

// Local names of the given `octane` named imports.
export function collectOctaneImportLocals(moduleBody, importedNames) {
	const names = new Set();
	for (const stmt of moduleBody) {
		if (stmt.type !== 'ImportDeclaration' || stmt.source?.value !== 'octane') continue;
		for (const spec of stmt.specifiers || []) {
			if (spec.type !== 'ImportSpecifier') continue;
			const imported = spec.imported?.name ?? spec.imported?.value;
			if (importedNames.includes(imported) && spec.local?.name) names.add(spec.local.name);
		}
	}
	return names;
}

/** Visit every node with the functions that enclose it, outermost first. */
export function walkWithEnclosingFunctions(root, visit) {
	const functions = [];
	const walk = (node) => {
		if (node == null || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		visit(node, functions);
		const isFunction = isFunctionNode(node);
		if (isFunction) functions.push(node);
		for (const key in node) {
			if (key === 'loc' || key === 'start' || key === 'end' || key === 'metadata') continue;
			const child = node[key];
			if (child !== null && typeof child === 'object') walk(child);
		}
		if (isFunction) functions.pop();
	};
	walk(root);
}

function isFunctionNode(n) {
	return (
		n &&
		(n.type === 'FunctionDeclaration' ||
			n.type === 'FunctionExpression' ||
			n.type === 'ArrowFunctionExpression')
	);
}

// Strip TS value-preserving wrappers (`x as T`, `x!`, `<T>x`, `x satisfies T`).
function unwrapTsExpr(n) {
	while (
		n &&
		(n.type === 'TSAsExpression' ||
			n.type === 'TSNonNullExpression' ||
			n.type === 'TSTypeAssertion' ||
			n.type === 'TSSatisfiesExpression' ||
			n.type === 'ParenthesizedExpression')
	) {
		n = n.expression;
	}
	return n;
}
