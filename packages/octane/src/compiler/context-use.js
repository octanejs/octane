// A direct module const initialized by Octane's createContext is the only
// context identity we can prove without following values between modules.
// Reject a name if any nested scope binds it: both compiler pipelines can
// then use this module-wide proof without guessing which scope owns a use().
export function collectProvenContextBindings(ast) {
	const factories = new Set();
	for (const statement of ast.body || []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			statement.source?.value !== 'octane'
		)
			continue;
		for (const specifier of statement.specifiers || []) {
			if (
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				(specifier.imported?.name ?? specifier.imported?.value) === 'createContext' &&
				specifier.local?.name
			)
				factories.add(specifier.local.name);
		}
	}
	if (factories.size === 0) return new Set();

	const contexts = new Set();
	for (const original of ast.body || []) {
		const declaration = unwrapExport(original);
		if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
		for (const entry of declaration.declarations || []) {
			if (
				entry.id?.type === 'Identifier' &&
				entry.init?.type === 'CallExpression' &&
				entry.init.optional !== true &&
				entry.init.callee?.type === 'Identifier' &&
				factories.has(entry.init.callee.name)
			)
				contexts.add(entry.id.name);
		}
	}
	if (contexts.size === 0) return contexts;

	const shadowed = new Set();
	const seen = new WeakSet();
	const bind = (pattern) => {
		if (!pattern) return;
		switch (pattern.type) {
			case 'Identifier':
				if (contexts.has(pattern.name)) shadowed.add(pattern.name);
				break;
			case 'ArrayPattern':
				for (const item of pattern.elements || []) bind(item);
				break;
			case 'ObjectPattern':
				for (const item of pattern.properties || [])
					bind(item.type === 'RestElement' ? item.argument : item.value);
				break;
			case 'AssignmentPattern':
				bind(pattern.left);
				break;
			case 'RestElement':
				bind(pattern.argument);
				break;
			case 'TSParameterProperty':
				bind(pattern.parameter);
				break;
		}
	};
	const scan = (node) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const item of node) scan(item);
			return;
		}
		if (seen.has(node)) return;
		seen.add(node);
		if (node.type === 'ImportDeclaration') return;
		switch (node.type) {
			case 'VariableDeclarator':
				bind(node.id);
				break;
			case 'FunctionDeclaration':
			case 'FunctionExpression':
			case 'ArrowFunctionExpression':
			case 'TSDeclareFunction':
				bind(node.id);
				for (const param of node.params || []) bind(param);
				break;
			case 'ClassDeclaration':
			case 'ClassExpression':
			case 'TSEnumDeclaration':
			case 'TSModuleDeclaration':
				bind(node.id);
				break;
			case 'CatchClause':
				bind(node.param);
				break;
			case 'JSXForExpression':
				if (node.left?.type !== 'VariableDeclaration') bind(node.left);
				bind(node.index);
				break;
			case 'JSXTryExpression':
				bind(node.handler?.param);
				bind(node.handler?.resetParam);
				break;
		}
		for (const key in node) {
			if (
				key === 'loc' ||
				key === 'start' ||
				key === 'end' ||
				key === 'range' ||
				key === 'parent' ||
				key === 'metadata' ||
				key.startsWith('_octane')
			)
				continue;
			scan(node[key]);
		}
	};
	for (const original of ast.body || []) {
		if (original.type === 'ImportDeclaration') continue;
		const declaration = unwrapExport(original);
		if (declaration?.type === 'VariableDeclaration') {
			// These IDs belong to the module itself, including the proven
			// contexts. Their initializers can still contain nested shadows.
			for (const entry of declaration.declarations || []) scan(entry.init);
		} else {
			scan(declaration);
		}
	}
	for (const name of shadowed) contexts.delete(name);
	return contexts;
}

export function isProvenContextUse(argument, contexts) {
	let value = argument;
	while (
		value?.type === 'TSAsExpression' ||
		value?.type === 'TSTypeAssertion' ||
		value?.type === 'TSSatisfiesExpression' ||
		value?.type === 'TSNonNullExpression' ||
		value?.type === 'TSInstantiationExpression' ||
		value?.type === 'ParenthesizedExpression'
	)
		value = value.expression;
	return value?.type === 'Identifier' && contexts.has(value.name);
}

function unwrapExport(node) {
	return node?.type === 'ExportNamedDeclaration' || node?.type === 'ExportDefaultDeclaration'
		? node.declaration
		: node;
}
