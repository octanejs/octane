import {
	createLexicalAnalysis,
	forEachRuntimeAstChild,
	isIdentifierReference,
} from './compile-universal.js';
import { collectReassignedBindings } from './hook-deps.js';

/**
 * Find factory callees whose entire local lifetime uses compiled-void bodies.
 * Definition IDs come from the authored, exact shorthand declarations: arrow
 * normalization and return-JSX lowering cannot manufacture this evidence.
 * This pass only reads ASTs. Its caller owns the COW rewrite and helper import.
 */
export function findLocalVoidRootCallees(ast, definitions, components) {
	const imports = new Map();
	for (const statement of ast.body) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.source?.value !== 'octane' ||
			statement.importKind === 'type'
		)
			continue;
		for (const specifier of statement.specifiers) {
			if (
				specifier.type === 'ImportSpecifier' &&
				specifier.importKind !== 'type' &&
				['createRoot', 'hydrateRoot'].includes(specifier.imported.name ?? specifier.imported.value)
			)
				imports.set(specifier.local.name, specifier.imported.name ?? specifier.imported.value);
		}
	}
	// Ordinary component modules pay no lexical-analysis cost.
	if (imports.size === 0 || definitions.size === 0) return new Map();
	const analysis = createLexicalAnalysis(ast);
	const writes = collectReassignedBindings(ast);
	const stableComponents = new Set();
	for (const id of definitions) if (!writes.has(id)) stableComponents.add(id.name);
	if (stableComponents.size === 0) return new Map();
	const moduleBinding = (node, names) =>
		node?.type === 'Identifier' &&
		names.has(node.name) &&
		analysis.resolveBinding(analysis.nodeScopes.get(node), node.name)?.scope === analysis.rootScope;
	const functionScopes = new Set();
	const roots = new Map();
	let opaque = false;
	const discover = (node, parent, key, component = false) => {
		if (node === null || typeof node !== 'object') return;
		if (node.type === 'JSXCodeBlock' || components.has(node)) component = true;
		if (
			!component &&
			(node.type === 'FunctionDeclaration' ||
				node.type === 'FunctionExpression' ||
				node.type === 'ArrowFunctionExpression') &&
			node.body?.type === 'BlockStatement'
		)
			functionScopes.add(analysis.nodeScopes.get(node.body)?.functionScope);
		if (
			node.type === 'WithStatement' ||
			(node.type === 'Identifier' &&
				node.name === 'eval' &&
				isIdentifierReference(node, parent, key, analysis) &&
				analysis.resolveBinding(analysis.nodeScopes.get(node), 'eval') === null)
		)
			opaque = true;
		if (
			!component &&
			node.type === 'VariableDeclarator' &&
			parent?.type === 'VariableDeclaration' &&
			parent.kind === 'const' &&
			node.id?.type === 'Identifier' &&
			node.init?.type === 'CallExpression' &&
			node.init.optional !== true &&
			moduleBinding(node.init.callee, imports)
		) {
			const scope = analysis.resolveBinding(analysis.nodeScopes.get(node.id), node.id.name)?.scope;
			// Namespace and class-static scopes are not ordinary function bodies.
			if (scope && functionScopes.has(scope.functionScope)) {
				const hydrated = imports.get(node.init.callee.name) === 'hydrateRoot';
				// Hydration renders immediately: its bare initial target must satisfy
				// the same definition and binding proof as every later render.
				const validInitial =
					!hydrated ||
					(node.init.arguments.length >= 2 &&
						node.init.arguments.length <= 4 &&
						!node.init.arguments.some((argument) => argument.type === 'SpreadElement') &&
						moduleBinding(node.init.arguments[1], stableComponents));
				if (validInitial) {
					let names = roots.get(scope);
					if (names === undefined) roots.set(scope, (names = new Map()));
					names.set(node.id.name, {
						scope,
						callee: node.init.callee,
						helper: hydrated ? '__hydrateVoidRoot' : '__createVoidRoot',
						valid: true,
						// A proved hydration target counts even with cleanup-only later uses.
						renders: hydrated ? 1 : 0,
					});
				}
			}
		}
		forEachRuntimeAstChild(node, (child, childKey) => discover(child, node, childKey, component));
	};
	discover(ast);
	if (opaque || roots.size === 0) return new Map();
	const inspect = (node, parent, key, grandparent) => {
		if (node === null || typeof node !== 'object') return;
		if (node.type === 'Identifier' && isIdentifierReference(node, parent, key, analysis)) {
			const nodeScope = analysis.nodeScopes.get(node);
			// Runtime traversal may see syntax the lexical analysis has not scoped.
			// An unresolved possible root reference cannot certify a closed lifetime.
			if (nodeScope === undefined) {
				for (const names of roots.values()) {
					const root = names.get(node.name);
					if (root !== undefined) root.valid = false;
				}
			}
			const scope = analysis.resolveBinding(nodeScope, node.name)?.scope;
			const root = roots.get(scope)?.get(node.name);
			if (root !== undefined) {
				const member = parent;
				const call = grandparent;
				const method =
					analysis.nodeScopes.get(node) === root.scope &&
					member?.type === 'MemberExpression' &&
					key === 'object' &&
					member.computed !== true &&
					member.optional !== true &&
					member.property?.type === 'Identifier' &&
					call?.type === 'CallExpression' &&
					call.callee === member &&
					call.optional !== true;
				if (method && member.property.name === 'unmount' && call.arguments.length === 0) {
					// Cleanup does not widen the component return ABI.
				} else if (
					method &&
					member.property.name === 'render' &&
					call.arguments.length >= 1 &&
					call.arguments.length <= 2 &&
					!call.arguments.some((argument) => argument.type === 'SpreadElement') &&
					moduleBinding(call.arguments[0], stableComponents)
				)
					root.renders++;
				else root.valid = false;
			}
		}
		forEachRuntimeAstChild(node, (child, childKey) => inspect(child, node, childKey, parent));
	};
	inspect(ast);
	const callees = new Map();
	for (const names of roots.values())
		for (const root of names.values())
			if (root.valid && root.renders > 0) callees.set(root.callee, root.helper);
	return callees;
}
