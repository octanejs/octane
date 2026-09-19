import {
	createLexicalAnalysis,
	forEachRuntimeAstChild,
	isIdentifierReference,
} from './compile-universal.js';

/** Only private contexts whose complete authored lifetime stays in template bodies. */
export function findPrivateCompiledContexts(ast) {
	const imports = new Map();
	for (const statement of ast.body ?? []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.source?.value !== 'octane' ||
			statement.importKind === 'type'
		)
			continue;
		for (const specifier of statement.specifiers ?? []) {
			const name = specifier.imported?.name ?? specifier.imported?.value;
			if (
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				['createContext', 'use', 'useContext'].includes(name)
			)
				imports.set(specifier.local.name, name);
		}
	}
	if (![...imports.values()].includes('createContext')) return new Map();
	if (
		!(ast.body ?? []).some(
			(statement) =>
				statement.type === 'VariableDeclaration' &&
				statement.kind === 'const' &&
				statement.declarations.some(
					(entry) => imports.get(entry.init?.callee?.name) === 'createContext',
				),
		)
	)
		return new Map();
	const lexical = createLexicalAnalysis(ast);
	const moduleBinding = (node) =>
		node != null &&
		lexical.resolveBinding(lexical.nodeScopes.get(node), node.name)?.scope === lexical.rootScope;
	const contexts = new Map();
	for (const statement of ast.body ?? []) {
		if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
		for (const entry of statement.declarations ?? []) {
			const call = entry.init;
			if (
				entry.id?.type === 'Identifier' &&
				call?.type === 'CallExpression' &&
				call.optional !== true &&
				call.callee?.type === 'Identifier' &&
				imports.get(call.callee.name) === 'createContext' &&
				moduleBinding(call.callee) &&
				call.arguments.length === 1 &&
				call.arguments[0].type !== 'SpreadElement'
			)
				contexts.set(entry.id.name, { id: entry.id, callee: call.callee, valid: true });
		}
	}
	if (contexts.size === 0) return new Map();
	let opaque = false;
	const providerChildren = (element) =>
		!(element.openingElement.attributes ?? []).some(
			(attribute) =>
				attribute.type === 'JSXSpreadAttribute' ||
				attribute.name?.type !== 'JSXIdentifier' ||
				attribute.name.name === 'children' ||
				attribute.name.name.startsWith('__'),
		) &&
		!(element.children ?? []).some((child) => {
			let expression = child.type === 'JSXExpressionContainer' ? child.expression : null;
			while (
				[
					'TSAsExpression',
					'TSTypeAssertion',
					'TSSatisfiesExpression',
					'TSNonNullExpression',
					'TSInstantiationExpression',
					'ParenthesizedExpression',
				].includes(expression?.type)
			)
				expression = expression.expression;
			return ['ArrowFunctionExpression', 'FunctionExpression'].includes(expression?.type);
		});
	const inspect = (node, parent, key, grandparent, direct = false) => {
		if (node === null || typeof node !== 'object') return;
		const identifier = node.type === 'Identifier';
		const reference = identifier && isIdentifierReference(node, parent, key, lexical);
		if (
			node.type === 'WithStatement' ||
			(reference && node.name === 'eval') ||
			((node.type === 'CallExpression' || node.type === 'OptionalCallExpression') &&
				['MemberExpression', 'OptionalMemberExpression'].includes(node.callee?.type) &&
				(node.callee.property?.name ?? node.callee.property?.value) === 'eval')
		)
			opaque = true;
		const context = contexts.get(node.name);
		if (context !== undefined) {
			// A module-wide name is used at emitted component calls. Any shadow
			// declines that name rather than guessing a generated body's scope.
			if (lexical.bindingNodes.has(node) && node !== context.id) context.valid = false;
			const tag =
				node.type === 'JSXIdentifier' &&
				(((parent?.type === 'JSXOpeningElement' || parent?.type === 'JSXClosingElement') &&
					key === 'name') ||
					(parent?.type === 'JSXMemberExpression' && key === 'object'));
			const exported = parent?.type === 'ExportSpecifier' && key === 'local';
			if (reference || tag || exported) {
				if (lexical.nodeScopes.get(node) === undefined) context.valid = false;
				else if (moduleBinding(node)) {
					const read =
						reference &&
						parent?.type === 'CallExpression' &&
						parent.optional !== true &&
						parent.arguments[0] === node &&
						parent.arguments.length === 1 &&
						parent.callee?.type === 'Identifier' &&
						['use', 'useContext'].includes(imports.get(parent.callee.name)) &&
						moduleBinding(parent.callee);
					const provider =
						tag &&
						direct &&
						(parent?.type === 'JSXOpeningElement' || parent?.type === 'JSXClosingElement') &&
						grandparent?.type === 'JSXElement' &&
						providerChildren(grandparent);
					if (!read && !provider) context.valid = false;
				}
			}
		}
		forEachRuntimeAstChild(node, (child, childKey) => {
			const childDirect =
				node.type === 'JSXCodeBlock'
					? childKey === 'render'
					: direct &&
						((node.type === 'JSXElement' &&
							['children', 'openingElement', 'closingElement'].includes(childKey)) ||
							(node.type === 'JSXFragment' && childKey === 'children') ||
							((node.type === 'JSXOpeningElement' || node.type === 'JSXClosingElement') &&
								childKey === 'name'));
			inspect(child, node, childKey, parent, childDirect);
		});
	};
	inspect(ast);
	if (opaque) return new Map();
	return new Map(
		[...contexts]
			.filter(([, context]) => context.valid)
			.map(([name, context]) => [name, context.callee]),
	);
}
