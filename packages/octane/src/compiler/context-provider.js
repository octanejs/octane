import { createLexicalAnalysis, forEachRuntimeAstChild } from './compile-universal.js';

const CONTEXT_MODULES = new Set([
	'octane',
	'octane/server',
	'octane/universal',
	'octane/universal/native',
	'@octanejs/lynx/renderer',
	'@octanejs/lynx/main-renderer',
]);
const NO_CONTEXT_SOURCE_FACTS = { kindOf: () => null };

function unwrapExpression(value) {
	while (
		value?.type === 'TSAsExpression' ||
		value?.type === 'TSTypeAssertion' ||
		value?.type === 'TSSatisfiesExpression' ||
		value?.type === 'TSNonNullExpression' ||
		value?.type === 'TSInstantiationExpression' ||
		value?.type === 'ParenthesizedExpression' ||
		value?.type === 'JSXExpressionContainer' ||
		value?.type === 'ChainExpression'
	)
		value = value.expression;
	return value;
}

function propertyName(node) {
	return node.computed ? node.property?.value : (node.property?.name ?? node.property?.value);
}

function walk(node, visit) {
	if (!node || typeof node !== 'object') return;
	visit(node);
	forEachRuntimeAstChild(node, (child) => walk(child, visit));
}

// Only follow authored values whose bindings never change. Unknown imports and unrelated
// `.Provider` components must not acquire context semantics from their spelling.
export function createContextSourceFacts(ast) {
	const imports = [];
	for (const statement of ast.body ?? []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			!CONTEXT_MODULES.has(statement.source?.value)
		)
			continue;
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.importKind === 'type') continue;
			if (specifier.type === 'ImportNamespaceSpecifier') {
				imports.push([specifier.local, 'namespace']);
			} else if (
				specifier.type === 'ImportSpecifier' &&
				(specifier.imported?.name ?? specifier.imported?.value) === 'createContext'
			) {
				imports.push([specifier.local, 'factory']);
			}
		}
	}
	if (imports.length === 0) return NO_CONTEXT_SOURCE_FACTS;
	const lexical = createLexicalAnalysis(ast);
	const declarations = new WeakMap();
	const bindingEntry = (id) => {
		const scope = lexical.resolveBinding(lexical.nodeScopes.get(id), id.name)?.scope;
		return scope ? declarations.get(scope)?.get(id.name) : null;
	};
	const addBinding = (id, entry) => {
		if (id?.type !== 'Identifier') return;
		const scope = lexical.resolveBinding(lexical.nodeScopes.get(id), id.name)?.scope;
		if (!scope) return;
		let bindings = declarations.get(scope);
		if (!bindings) declarations.set(scope, (bindings = new Map()));
		// A repeated var declaration can change its value at another source site.
		bindings.set(id.name, bindings.has(id.name) ? { kind: null } : entry);
	};
	for (const [id, kind] of imports) addBinding(id, { kind });
	walk(ast, (node) => {
		if (node.type !== 'VariableDeclaration' || node.declare === true) return;
		for (const declaration of node.declarations ?? []) {
			addBinding(declaration.id, {
				expression: declaration.init,
				mutable: node.kind !== 'const',
			});
		}
	});
	const markWritten = (pattern) => {
		const value = unwrapExpression(pattern);
		if (value?.type === 'Identifier') {
			const entry = bindingEntry(value);
			if (entry?.mutable) entry.kind = null;
		} else if (value?.type === 'ArrayPattern') {
			for (const element of value.elements ?? []) markWritten(element);
		} else if (value?.type === 'ObjectPattern') {
			for (const property of value.properties ?? [])
				markWritten(property.argument ?? property.value);
		} else if (value?.type === 'AssignmentPattern') {
			markWritten(value.left);
		} else if (value?.type === 'RestElement') {
			markWritten(value.argument);
		}
	};
	walk(ast, (node) => {
		if (node.type === 'AssignmentExpression') markWritten(node.left);
		else if (node.type === 'UpdateExpression') markWritten(node.argument);
		else if (
			(node.type === 'ForInStatement' || node.type === 'ForOfStatement') &&
			node.left?.type !== 'VariableDeclaration'
		)
			markWritten(node.left);
	});

	const active = new Set();
	const kindOf = (authored) => {
		const value = unwrapExpression(authored);
		if (value?.type === 'Identifier' || value?.type === 'JSXIdentifier') {
			const entry = bindingEntry(value);
			if (!entry || active.has(entry)) return null;
			if ('kind' in entry) return entry.kind;
			active.add(entry);
			const kind = kindOf(entry.expression);
			active.delete(entry);
			entry.kind = kind;
			return kind;
		}
		if (
			(value?.type === 'CallExpression' || value?.type === 'OptionalCallExpression') &&
			kindOf(value.callee) === 'factory'
		) {
			return 'context';
		}
		if (
			(value?.type === 'MemberExpression' ||
				value?.type === 'OptionalMemberExpression' ||
				value?.type === 'JSXMemberExpression') &&
			propertyName(value) === 'createContext' &&
			kindOf(value.object) === 'namespace'
		) {
			return 'factory';
		}
		return null;
	};
	return { kindOf };
}

function providerProperty(node, facts) {
	if (
		(node.type === 'MemberExpression' ||
			node.type === 'OptionalMemberExpression' ||
			node.type === 'JSXMemberExpression') &&
		propertyName(node) === 'Provider' &&
		facts.kindOf(node.object) === 'context'
	) {
		return node.property;
	}
	const pattern =
		node.type === 'VariableDeclarator'
			? node.id
			: node.type === 'AssignmentExpression'
				? node.left
				: null;
	const source = node.type === 'VariableDeclarator' ? node.init : node.right;
	if (pattern?.type === 'ObjectPattern' && facts.kindOf(source) === 'context') {
		return pattern.properties.find(
			(property) =>
				property.type === 'Property' &&
				(property.computed ? property.key?.value : (property.key?.name ?? property.key?.value)) ===
					'Provider',
		)?.key;
	}
	return null;
}

export function assertNoLegacyContextProviders(ast, source, filename) {
	if (!source.includes('Provider') && !source.includes('\\u')) return;
	const facts = createContextSourceFacts(ast);
	if (facts === NO_CONTEXT_SOURCE_FACTS) return;
	let first = null;
	walk(ast, (node) => {
		const property = providerProperty(node, facts);
		if (property && (first === null || property.start < first.start)) first = property;
	});
	if (first === null) return;
	const code = 'OCTANE_CONTEXT_PROVIDER';
	const message =
		'Context.Provider is no longer supported. Use <Context value={...}>...</Context> ' +
		'with the context returned by createContext.';
	const start = { offset: first.start, ...first.loc.start };
	const end = { offset: first.end, ...first.loc.end };
	const error = new Error(`${filename}:${start.line}:${start.column + 1} [${code}] ${message}`);
	error.code = code;
	error.filename = filename;
	error.loc = { line: start.line, column: start.column };
	error.diagnostic = { code, severity: 'error', message, filename, start, end };
	throw error;
}
