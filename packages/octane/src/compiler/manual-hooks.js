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

// Only the parameters before the first default/rest contribute to Function.length.
// The public wrapper must not evaluate authored defaults or destructuring; the
// private implementation receives the original arguments after slot adaptation.
export function manualHookWrapperParameters(node) {
	const parameters = [];
	for (const param of node.params) {
		if (param.type === 'Identifier' && param.name === 'this') continue;
		if (param.type === 'AssignmentPattern' || param.type === 'RestElement') break;
		parameters.push(b.id(`_$arg${parameters.length}`));
	}
	return parameters;
}

export function adaptManualHookProviders(ast, requireHelper, allocateName) {
	const providers = findManualHookProviders(ast);
	if (!providers.size) return ast;
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
			let changed = false;
			const body = result.body.flatMap((statement, index) => {
				const original = declarationOf(node.body[index]);
				if (original?.type !== 'FunctionDeclaration' || !providers.has(original))
					return [statement];
				changed = true;
				const declaration = declarationOf(statement);
				const implementation = allocateName(`_$manual_${original.id.name}`);
				const wrapper = b.function_declaration(
					original.id,
					manualHookWrapperParameters(original),
					b.block([
						b.return(
							b.call(
								requireHelper('invokeManualHook'),
								b.id(implementation),
								b.this,
								b.id('arguments'),
							),
						),
					]),
				);
				// Both declarations hoist. Keep the exported binding stable even for
				// cyclic imports and aliases captured before the textual declaration.
				return [
					statement === declaration ? wrapper : { ...statement, declaration: wrapper },
					{ ...declaration, id: b.id(implementation) },
				];
			});
			if (changed) result = { ...result, body };
		}
		return providers.has(node) && node.type !== 'FunctionDeclaration'
			? {
					...b.call(requireHelper('manualHook'), result, b.literal(providers.get(node))),
					__octanePure: true,
				}
			: result;
	}
	return visit(ast);
}
