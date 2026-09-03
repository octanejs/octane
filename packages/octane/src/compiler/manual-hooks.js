// Manual hook packages own their explicit sub-slot layout. Adapt exported or
// escaping hook definitions at their owner, so bound/forwarded imports retain
// that protocol without changing ordinary custom-hook argument lists.
import { builders as b } from '@tsrx/core';

const META = new Set([
	'loc',
	'start',
	'end',
	'range',
	'metadata',
	'parent',
	'comments',
	'leadingComments',
	'trailingComments',
	'innerComments',
]);
const isHook = (name) =>
	typeof name === 'string' && /^(?:(?:experimental|unstable|UNSTABLE)_)?use[A-Z]/.test(name);
const isFunction = (node) =>
	node?.type === 'FunctionDeclaration' ||
	node?.type === 'FunctionExpression' ||
	node?.type === 'ArrowFunctionExpression';

function children(node, visit) {
	for (const key in node) {
		if (META.has(key) || key.startsWith('_octane')) continue;
		const value = node[key];
		if (Array.isArray(value)) for (const child of value) visit(child, node, key);
		else if (value && typeof value === 'object') visit(value, node, key);
	}
}

export function findManualHookProviders(ast) {
	const escaping = new Set();
	const definitions = new Map();
	function scan(node, parent, key) {
		if (!node || typeof node !== 'object') return;
		if (isFunction(node) && node.body) {
			const bindingName = parent?.type === 'VariableDeclarator' ? parent.id?.name : undefined;
			const name = isHook(bindingName) ? bindingName : node.id?.name;
			if (isHook(name)) {
				// A named expression can have a private implementation name while its
				// exported binding establishes the hook contract. Keep its public
				// Function.name when installing the provider boundary.
				definitions.set(node, { name, displayName: node.id?.name ?? name });
				if (
					parent?.type === 'ExportNamedDeclaration' ||
					parent?.type === 'ExportDefaultDeclaration'
				)
					escaping.add(name);
				if (parent?.type === 'ReturnStatement') escaping.add(name);
			}
		}
		if (node.type === 'Identifier' && isHook(node.name)) {
			const binding =
				(isFunction(parent) && (key === 'id' || key === 'params')) ||
				(parent?.type === 'VariableDeclarator' && key === 'id') ||
				parent?.type === 'ImportSpecifier' ||
				parent?.type === 'ImportDefaultSpecifier' ||
				parent?.type === 'ImportNamespaceSpecifier';
			const directCall = parent?.type === 'CallExpression' && key === 'callee';
			const property =
				(parent?.type === 'MemberExpression' && key === 'property' && !parent.computed) ||
				(parent?.type === 'Property' && key === 'key' && !parent.computed);
			if (!binding && !directCall && !property) escaping.add(node.name);
		}
		if (
			node.type === 'ExportNamedDeclaration' &&
			node.declaration?.type === 'VariableDeclaration'
		) {
			for (const declaration of node.declaration.declarations) {
				if (isHook(declaration.id?.name)) escaping.add(declaration.id.name);
			}
		}
		children(node, scan);
	}
	scan(ast, null, null);
	return new Map(
		[...definitions]
			.filter(([, { name }]) => escaping.has(name))
			.map(([node, { displayName }]) => [node, displayName]),
	);
}

function declarationOf(statement) {
	return statement?.type === 'ExportNamedDeclaration' ||
		statement?.type === 'ExportDefaultDeclaration'
		? statement.declaration
		: statement;
}

function prologueIndex(body) {
	let index = 0;
	while (
		body[index]?.type === 'ExpressionStatement' &&
		typeof body[index].expression?.value === 'string'
	)
		index++;
	return index;
}

export function adaptManualHookProviders(ast, requireHelper) {
	const providers = findManualHookProviders(ast);
	if (!providers.size) return ast;
	const helper = requireHelper('manualHook');
	function visit(node) {
		if (!node || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			let changed = false;
			const result = node.map((item) => {
				const next = visit(item);
				changed ||= next !== item;
				return next;
			});
			return changed ? result : node;
		}
		let result = node;
		for (const key in node) {
			if (META.has(key) || key.startsWith('_octane')) continue;
			const value = node[key];
			if (!value || typeof value !== 'object') continue;
			const next = visit(value);
			if (next !== value) {
				if (result === node) result = { ...node };
				result[key] = next;
			}
		}
		if (node.type === 'Program' || node.type === 'BlockStatement') {
			const declarations = node.body
				.map(declarationOf)
				.filter((item) => item?.type === 'FunctionDeclaration' && providers.has(item));
			if (declarations.length) {
				const index = prologueIndex(result.body);
				const assignments = declarations.map((item) => {
					const name = providers.get(item);
					return b.stmt(b.assignment('=', b.id(name), b.call(helper, b.id(name))));
				});
				result = {
					...result,
					body: [...result.body.slice(0, index), ...assignments, ...result.body.slice(index)],
				};
			}
		}
		return providers.has(node) && node.type !== 'FunctionDeclaration'
			? b.call(helper, result, b.literal(providers.get(node)))
			: result;
	}
	return visit(ast);
}
