import { builders as b } from '@tsrx/core';
import { createLexicalAnalysis } from './compile-universal.js';
import { inheritHookMemoOrigin } from './inline-hook-memo.js';

const SIGNAL_MODULES = new Set([
	'octane/signals',
	'octane/signals/client',
	'octane/signals/server',
]);
const METADATA = new Set([
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

function children(node, visit) {
	for (const key in node) {
		if (METADATA.has(key) || key.startsWith('_octane')) continue;
		const value = node[key];
		if (Array.isArray(value)) {
			for (const child of value) if (child?.type) visit(child);
		} else if (value?.type) visit(value);
	}
}

function unwrap(node) {
	while (
		[
			'TSAsExpression',
			'TSTypeAssertion',
			'TSSatisfiesExpression',
			'TSNonNullExpression',
			'ParenthesizedExpression',
		].includes(node?.type)
	)
		node = node.expression;
	return node;
}

function isFunction(node) {
	return ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
		node.type,
	);
}

function hasRender(node) {
	if (node.type.startsWith('JSX')) return true;
	if (isFunction(node)) return false;
	let found = false;
	children(node, (child) => {
		found ||= hasRender(child);
	});
	return found;
}

/**
 * Start only adjacent strict reads of lexically proven immutable descriptors.
 * Original reads remain the suspension/error/observation points. In particular,
 * this does not hoist declarations, evaluate member receivers, cross statements,
 * or enter a conditional arm before its authored control-flow boundary.
 */
export function startIndependentSignalReads(ast) {
	if (
		!(ast.body ?? []).some(
			(node) => node.type === 'ImportDeclaration' && SIGNAL_MODULES.has(node.source?.value),
		)
	)
		return ast;
	const lexical = createLexicalAnalysis(ast);
	const imports = new Map();
	const declarations = new Map();
	const names = new Set();
	const binding = (node) =>
		node?.type === 'Identifier'
			? lexical.resolveBinding(lexical.nodeScopes.get(node) ?? lexical.rootScope, node.name)
			: null;
	const recordFor = (node) => declarations.get(binding(node)?.scope)?.get(node.name);
	function register(id, record, declarationScope) {
		if (id?.type !== 'Identifier') return;
		const scope = declarationScope
			? lexical.resolveBinding(declarationScope, id.name)?.scope
			: binding(id)?.scope;
		if (!scope) return;
		let records = declarations.get(scope);
		if (!records) declarations.set(scope, (records = new Map()));
		records.set(id.name, record);
	}
	function collect(node, ownerFunction = null) {
		if (node.type === 'Identifier') names.add(node.name);
		if (
			node.type === 'ImportDeclaration' &&
			node.importKind !== 'type' &&
			SIGNAL_MODULES.has(node.source?.value)
		) {
			for (const specifier of node.specifiers ?? []) {
				if (specifier.importKind === 'type') continue;
				const factory = specifier.imported?.name ?? specifier.imported?.value;
				if (
					factory === 'query$' ||
					factory === 'derived$' ||
					specifier.type === 'ImportNamespaceSpecifier'
				)
					imports.set(specifier.local.name, {
						factory,
						source: node.source.value,
						declaration: node,
					});
			}
		}
		if (node.type === 'VariableDeclaration') {
			for (const declaration of node.declarations)
				register(declaration.id, {
					init: declaration.init,
					kind: node.kind,
					declaration,
					ownerFunction,
				});
		} else if (node.type === 'FunctionDeclaration')
			register(
				node.id,
				{ init: node, kind: 'function', declaration: node },
				lexical.nodeScopes.get(node),
			);
		children(node, (child) => collect(child, isFunction(node) ? node : ownerFunction));
	}
	collect(ast);
	// Initializer reachability is insufficient when a selector was reassigned or
	// installed in a mutable object. Fence any result captured by an already
	// available closure, without attempting heap or assignment reconstruction.
	const capturedResults = new Map();
	const opaqueFunctions = new Set();
	function collectCaptures(node, stack = []) {
		const nested =
			isFunction(node) || node.type === 'ClassDeclaration' || node.type === 'ClassExpression'
				? [...stack, node]
				: stack;
		if (node.type === 'Identifier' && !lexical.bindingNodes.has(node)) {
			const record = recordFor(node);
			const owner = record?.ownerFunction;
			const index = owner ? nested.indexOf(owner) : -1;
			const closure = index < 0 ? null : nested[index + 1];
			if (closure) {
				let captured = capturedResults.get(record);
				if (!captured) capturedResults.set(record, (captured = new Set()));
				captured.add(closure);
			}
		}
		const callee = unwrap(node.callee);
		if (
			(node.type === 'CallExpression' || node.type === 'NewExpression') &&
			callee?.type === 'Identifier' &&
			(callee.name === 'eval' || callee.name === 'Function')
		) {
			for (const owner of nested) opaqueFunctions.add(owner);
		}
		children(node, (child) => collectCaptures(child, nested));
	}
	collectCaptures(ast);
	function capturedBefore(result, position) {
		for (const closure of capturedResults.get(recordFor(result)) ?? []) {
			if (
				closure.type === 'FunctionDeclaration' ||
				(closure.start ?? -Infinity) < (position ?? Infinity)
			)
				return true;
		}
		return false;
	}
	function factoryOf(init) {
		const call = unwrap(init);
		if (call?.type !== 'CallExpression' || call.optional) return null;
		const callee = unwrap(call.callee);
		const identifier =
			callee?.type === 'Identifier'
				? callee
				: callee?.type === 'MemberExpression' && !callee.computed && !callee.optional
					? callee.object
					: null;
		if (identifier?.type !== 'Identifier') return null;
		const record = imports.get(identifier.name);
		const resolved = binding(identifier);
		if (
			!record ||
			resolved?.scope !== lexical.rootScope ||
			resolved.importSource?.value !== record.source
		)
			return null;
		const factory =
			callee === identifier
				? record.factory
				: record.factory === undefined
					? callee.property.name
					: null;
		return factory === 'query$' || factory === 'derived$' ? record : null;
	}
	function strictRead(statement) {
		if (
			statement.type !== 'VariableDeclaration' ||
			statement.kind !== 'const' ||
			statement.declarations.length !== 1
		)
			return null;
		const declaration = statement.declarations[0];
		if (declaration.id.type !== 'Identifier') return null;
		const call = unwrap(declaration.init);
		if (call?.type !== 'CallExpression' || call.optional || call.arguments.length !== 0)
			return null;
		const member = unwrap(call.callee);
		if (
			member?.type !== 'MemberExpression' ||
			member.optional ||
			member.computed ||
			member.property.name !== 'get' ||
			member.object.type !== 'Identifier'
		)
			return null;
		const descriptor = recordFor(member.object);
		if (descriptor?.kind !== 'const') return null;
		const factory = factoryOf(descriptor.init);
		return factory ? { handle: member.object, descriptor, result: declaration.id, factory } : null;
	}
	// Follow local aliases/helpers as well as direct captures: a later selector
	// closing over an earlier read's result must run after that result is assigned.
	function dependsOn(node, results, seen = new Set()) {
		if (!node || seen.has(node)) return false;
		seen.add(node);
		if (node.type === 'Identifier' && !lexical.bindingNodes.has(node)) {
			const resolved = binding(node);
			if (
				results.some(
					(result) => result.name === node.name && binding(result)?.scope === resolved?.scope,
				)
			)
				return true;
			if (dependsOn(recordFor(node)?.init, results, seen)) return true;
		}
		let found = false;
		children(node, (child) => {
			found ||= dependsOn(child, results, seen);
		});
		return found;
	}
	let helperName = '_$startSignalReads';
	while (names.has(helperName)) helperName += '$';
	let helperImport = null;
	function statements(body) {
		let out = null;
		for (let i = 0; i < body.length;) {
			const first = strictRead(body[i]);
			if (!first) {
				if (out) out.push(body[i]);
				i++;
				continue;
			}
			const run = [first];
			let end = i + 1;
			for (; end < body.length; end++) {
				const next = strictRead(body[end]);
				if (
					!next ||
					run.some((read) => capturedBefore(read.result, body[i].start)) ||
					dependsOn(
						next.descriptor.init,
						run.map((read) => read.result),
					)
				)
					break;
				run.push(next);
			}
			if (run.length > 1) {
				out ??= body.slice(0, i);
				helperImport ??= first.factory.declaration;
				out.push(
					inheritHookMemoOrigin(
						// A module may invoke a component before a later descriptor has
						// initialized. Receiver evaluation must not expose its TDZ before
						// the original first read; only the speculative start is guarded.
						b.try(
							b.block([
								b.stmt(
									b.call(b.id(helperName), b.array(run.map((read) => b.id(read.handle.name)))),
								),
							]),
							b.catch_clause(null, null, b.block([])),
						),
						body[i],
					),
				);
			}
			if (out) out.push(...body.slice(i, end));
			i = end;
		}
		return out ?? body;
	}
	function transform(node, rendering = false) {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			const mapped = node.map((child) => transform(child, rendering));
			return mapped.some((child, index) => child !== node[index]) ? mapped : node;
		}
		if (isFunction(node)) rendering = !opaqueFunctions.has(node) && hasRender(node.body);
		let out = node;
		for (const key in node) {
			if (METADATA.has(key) || key.startsWith('_octane')) continue;
			const mapped = transform(node[key], rendering);
			if (mapped !== node[key]) {
				if (out === node) out = { ...node };
				out[key] = mapped;
			}
		}
		if (
			rendering &&
			(node.type === 'BlockStatement' || node.type === 'JSXCodeBlock') &&
			Array.isArray(node.body)
		) {
			// Analyze original nodes, whose lexical binding identities are known.
			const body = statements(node.body);
			if (body !== node.body) {
				const mapped = new Map(node.body.map((statement, index) => [statement, out.body[index]]));
				out = { ...out, body: body.map((statement) => mapped.get(statement) ?? statement) };
			}
		}
		return out;
	}
	const lowered = transform(ast);
	if (helperImport === null) return ast;
	return {
		...lowered,
		body: lowered.body.flatMap((statement) => {
			if (statement !== helperImport) return [statement];
			const helper = inheritHookMemoOrigin(
				b.import_specifier('__startSignalReads', helperName),
				statement,
			);
			return statement.specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier')
				? [statement, { ...statement, specifiers: [helper] }]
				: [{ ...statement, specifiers: [...statement.specifiers, helper] }];
		}),
	};
}
