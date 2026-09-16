// Shared syntax-level recognition for runtime server registration and editor call signatures.
export function unwrapServerFunctionInitializer(node) {
	let current = node;
	while (
		current &&
		(current.type === 'TSAsExpression' ||
			current.type === 'TSSatisfiesExpression' ||
			current.type === 'TSNonNullExpression' ||
			current.type === 'TypeCastExpression' ||
			current.type === 'ParenthesizedExpression')
	) {
		current = current.expression;
	}
	return current;
}

export function collectServerFunctionNodes(statements) {
	const functions = new Map();
	const aliases = new Map();
	for (const statement of statements) {
		const declaration =
			statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
		if (!declaration) continue;
		if (declaration.type === 'FunctionDeclaration' && declaration.id) {
			functions.set(declaration.id.name, declaration);
			continue;
		}
		if (declaration.type !== 'VariableDeclaration') continue;
		for (const item of declaration.declarations ?? []) {
			if (item.id?.type !== 'Identifier' || !item.init) continue;
			const init = unwrapServerFunctionInitializer(item.init);
			if (init?.type === 'FunctionExpression' || init?.type === 'ArrowFunctionExpression') {
				functions.set(item.id.name, init);
			} else if (init?.type === 'Identifier') {
				aliases.set(item.id.name, init.name);
			}
		}
	}
	for (const [local, target] of aliases) {
		let name = target;
		const seen = new Set([local]);
		while (!seen.has(name)) {
			seen.add(name);
			const fn = functions.get(name);
			if (fn !== undefined) {
				functions.set(local, fn);
				break;
			}
			name = aliases.get(name);
			if (name === undefined) break;
		}
	}
	return functions;
}

export function serverContextTypeImports(statements) {
	const named = new Set();
	const namespaces = new Set();
	for (const statement of statements) {
		if (statement.type !== 'ImportDeclaration' || statement.source?.value !== 'octane/server') {
			continue;
		}
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.type === 'ImportNamespaceSpecifier') {
				namespaces.add(specifier.local.name);
				continue;
			}
			if (specifier.type !== 'ImportSpecifier') continue;
			const imported = specifier.imported?.name ?? specifier.imported?.value;
			if (imported === 'ServerCallContext') named.add(specifier.local.name);
		}
	}
	return { named, namespaces };
}

export function serverContextTypeName(type, imports) {
	while (
		type &&
		(type.type === 'TSTypeAnnotation' ||
			type.type === 'TSParenthesizedType' ||
			type.type === 'TSOptionalType')
	) {
		type = type.typeAnnotation;
	}
	if (type?.type !== 'TSTypeReference') return false;
	const name = type.typeName;
	if (name?.type === 'Identifier') return imports.named.has(name.name);
	if (name?.type === 'TSQualifiedName') {
		return (
			name.left?.type === 'Identifier' &&
			imports.namespaces.has(name.left.name) &&
			name.right?.name === 'ServerCallContext'
		);
	}
	return (
		name?.type === 'MemberExpression' &&
		name.object?.type === 'Identifier' &&
		imports.namespaces.has(name.object.name) &&
		name.property?.name === 'ServerCallContext'
	);
}

export function serverFunctionContextIndex(fn, imports, filename) {
	let contextIndex = -1;
	const params = fn.params ?? [];
	for (let index = 0; index < params.length; index++) {
		let parameter = params[index];
		if (parameter.type === 'AssignmentPattern') parameter = parameter.left;
		if (!serverContextTypeName(parameter.typeAnnotation, imports)) continue;
		if (index !== params.length - 1) {
			throw new Error(
				`ServerCallContext must be the final parameter of a \`module server\` function (${filename}).`,
			);
		}
		contextIndex = index;
	}
	return contextIndex;
}
