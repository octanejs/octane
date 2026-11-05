// Only this declarative subset of octane/data can cross a module-server boundary.
// Rebuild it from validated syntax; never copy a server expression or its comments.
import { builders as b } from '@tsrx/core';

function unparen(node) {
	while (node?.type === 'ParenthesizedExpression') node = node.expression;
	return node;
}

function staticFields(node, project) {
	node = unparen(node);
	if (node?.type !== 'ObjectExpression') return null;
	const fields = [];
	const names = new Set();
	for (const property of node.properties) {
		if (
			property.type !== 'Property' ||
			property.kind !== 'init' ||
			property.computed ||
			property.method
		)
			return null;
		const name = property.key.type === 'Identifier' ? property.key.name : property.key.value;
		if (typeof name !== 'string' || name === '__proto__' || names.has(name)) return null;
		const value = project(property.value, name);
		if (!value) return null;
		names.add(name);
		fields.push(b.prop('init', b.literal(name), value));
	}
	return b.object(fields);
}

function integerOption(node, minimum) {
	node = unparen(node);
	let numeric;
	if (node?.type === 'UnaryExpression' && node.operator === '-') {
		const value = unparen(node.argument);
		if (value?.type === 'Literal' && typeof value.value === 'number') numeric = -value.value;
	} else if (node?.type === 'Literal') numeric = node.value;
	if (!Number.isSafeInteger(numeric) || numeric < minimum) return null;
	return numeric < 0 ? b.unary('-', b.literal(-numeric)) : b.literal(numeric);
}

function projectSchema(node, factories, bindings, deps) {
	node = unparen(node);
	if (node?.type === 'Identifier' && bindings.has(node.name)) {
		deps.add(node.name);
		return b.id(node.name);
	}
	const callee = unparen(node?.callee);
	const receiver = unparen(callee?.object);
	if (
		node?.type !== 'CallExpression' ||
		node.optional ||
		callee.type !== 'MemberExpression' ||
		callee.computed ||
		callee.optional ||
		receiver?.type !== 'Identifier' ||
		!factories.has(receiver.name)
	)
		return null;
	deps.add(receiver.name);
	const method = callee.property.name;
	const args = node.arguments;
	let arg;
	switch (method) {
		case 'string':
		case 'integer':
			if (args.length > 1) return null;
			if (args.length) {
				const option = method === 'string' ? 'minLength' : 'minimum';
				arg = staticFields(args[0], (value, name) => {
					return name === option
						? integerOption(value, method === 'string' ? 0 : Number.MIN_SAFE_INTEGER)
						: null;
				});
			}
			break;
		case 'enum': {
			const list = unparen(args[0]);
			if (args.length !== 1 || list?.type !== 'ArrayExpression' || !list.elements.length)
				return null;
			const values = list.elements.map((el) => unparen(el));
			if (!values.every((el) => el?.type === 'Literal' && typeof el.value === 'string'))
				return null;
			if (new Set(values.map((el) => el.value)).size !== values.length) return null;
			arg = b.array(values.map((el) => b.literal(el.value)));
			break;
		}
		case 'boolean':
			if (args.length) return null;
			break;
		case 'nullable':
		case 'array':
			if (args.length !== 1) return null;
			arg = projectSchema(args[0], factories, bindings, deps);
			break;
		case 'object':
			if (args.length !== 1) return null;
			arg = staticFields(args[0], (value) => projectSchema(value, factories, bindings, deps));
			break;
		default:
			return null;
	}
	if (args.length && !arg) return null;
	return b.call(b.member(b.id(receiver.name), method), ...(arg ? [arg] : []));
}

export function analyzeServerSchemas(statements) {
	const factories = new Set();
	const bindings = new Map();
	for (const statement of statements) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			statement.source.value !== 'octane/data'
		)
			continue;
		for (const specifier of statement.specifiers) {
			if (
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				(specifier.imported.name ?? specifier.imported.value) === 'dataSchema'
			)
				factories.add(specifier.local.name);
		}
	}
	if (factories.size) {
		for (const statement of statements) {
			const declaration =
				statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
			if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
			for (const item of declaration.declarations) {
				if (item.id.type !== 'Identifier') continue;
				const deps = new Set();
				const init = projectSchema(item.init, factories, bindings, deps);
				if (init) bindings.set(item.id.name, { init, deps, origin: item });
			}
		}
	}
	return { factories, bindings };
}

// Emit only the validated declarations reachable from the outer module's schema imports.
// The IIFE keeps authored field references lexically isolated from ordinary module names.
export function emitClientSchemas(info, imports, factoryName, withOrigin) {
	const { factories, bindings } = info.schemas;
	const selected = imports.map((item) => item.imported.name ?? item.imported.value);
	const needed = new Set(selected);
	const body = [];
	for (const [name, binding] of [...bindings].reverse()) {
		if (needed.has(name)) for (const dep of binding.deps) needed.add(dep);
	}
	for (const [name, binding] of bindings) {
		if (needed.has(name)) body.push(withOrigin(b.const(name, binding.init), binding.origin));
	}
	const names = [...factories].filter((name) => needed.has(name));
	body.push(b.return(b.array(selected.map((name) => b.id(name)))));
	return [
		withOrigin(b.imports([['dataSchema', factoryName]], 'octane/data'), info.declaration),
		withOrigin(
			b.declaration('const', [
				b.declarator(
					b.array_pattern(imports.map((item) => b.id(item.local.name))),
					b.call(
						b.arrow(
							names.map((name) => b.id(name)),
							b.block(body),
						),
						...names.map(() => b.id(factoryName)),
					),
				),
			]),
			imports[0],
		),
	];
}
