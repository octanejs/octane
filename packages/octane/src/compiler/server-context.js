import { builders as b } from '@tsrx/core';
import {
	addHoistedVarNames,
	collectFreeIdentifiers,
	collectModuleTopLevelBindings,
	identifierName,
	runtimeExportBindings,
} from './lexical-bindings.js';

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
			throw Object.assign(
				new Error(
					`ServerCallContext must be the final parameter of a \`module server\` function (${filename}).`,
				),
				{ code: 'OCTANE_SERVER_CALL_CONTEXT' },
			);
		}
		contextIndex = index;
	}
	return contextIndex;
}

export function isServerModuleDeclaration(node) {
	return node?.type === 'TSModuleDeclaration' && node.declare !== true && node.kind === 'module';
}

function publicServerValues(declaration) {
	const values = declaration.body.body.filter(
		({ type, exportKind, declaration: value }) =>
			type === 'ExportNamedDeclaration' &&
			exportKind !== 'type' &&
			!value?.declare &&
			(!value || value.type === 'FunctionDeclaration' || value.type === 'VariableDeclaration'),
	);
	return runtimeExportBindings(values);
}

function isMissingExport(error) {
	return /^Export '[^']+' is not defined(?: \(\d+:\d+\))?$/.test(error.message);
}

function isOwnedExport(ast, error) {
	if (!isMissingExport(error)) return false;
	const declaration = ast.body.find(isServerModuleDeclaration);
	if (!declaration || identifierName(declaration.id) !== 'server') return false;
	const publicNames = new Set(publicServerValues(declaration).map(([name]) => name));
	return ast.body.some(
		(node) =>
			node.type === 'ExportNamedDeclaration' &&
			!node.source &&
			node.specifiers?.some(
				({ local }) => local.start === error.pos && publicNames.has(identifierName(local)),
			),
	);
}

// The underlying JS parser checks outer export lists before Octane projects a
// server block. Only an export specifier at the exact diagnostic position can
// be satisfied by a public value of that file's server block.
export function parseWithFileLocalServerExports(parser, source, filename, options) {
	if (options?.collect && Array.isArray(options.errors)) {
		const previous = options.errors.length;
		const ast = parser(source, filename, options);
		for (let i = options.errors.length - 1; i >= previous; i--) {
			if (isOwnedExport(ast, options.errors[i])) options.errors.splice(i, 1);
		}
		return ast;
	}
	try {
		return parser(source, filename, options);
	} catch (error) {
		if (!isMissingExport(error)) throw error;
		const errors = [];
		const comments = [];
		const ast = parser(source, filename, { ...options, collect: true, errors, comments });
		if (!isOwnedExport(ast, error)) throw error;
		const unresolved = errors.find((diagnostic) => !isOwnedExport(ast, diagnostic));
		if (unresolved) throw unresolved;
		options?.comments?.push(...comments);
		return ast;
	}
}

// Exports of a file-local server block are lexical names in the parent TSRX file.
// Reuse the same validated schema projection and RPC emission as named bindings.
export function exposeFileLocalServerBindings(ast, source, includeTypes, withOrigin) {
	const declaration = ast.body.find(isServerModuleDeclaration);
	if (!declaration?.body?.body) return ast;
	const outer = ast.body.filter((node) => node !== declaration);
	const bound = collectModuleTopLevelBindings(outer, new Set()).all;
	const expressions = outer.filter((node) => node.type !== 'ImportDeclaration');
	// A var inside a branch or loop hoists to its nearest function, module, or
	// class static block. Skip that second scope walk for files without var.
	const includeHoistedVars = source.includes('var');
	if (includeHoistedVars) addHoistedVarNames(outer, bound);
	const referenced = collectFreeIdentifiers(
		expressions,
		bound,
		null,
		includeTypes,
		includeHoistedVars,
	);
	const names = publicServerValues(declaration)
		.map(([name]) => name)
		.filter((name) => name && name !== 'default' && referenced.has(name) && !bound.has(name));
	if (!names.length) return ast;
	const bindings = withOrigin(
		b.imports(
			names.map((name) => [name, name]),
			'server',
		),
		declaration,
	);
	return { ...ast, body: [bindings, ...ast.body] };
}
