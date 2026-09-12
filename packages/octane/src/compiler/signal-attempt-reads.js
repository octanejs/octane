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
	'leadingComments',
	'trailingComments',
	'innerComments',
	'comments',
]);

function propertyName(member) {
	if (member?.computed === true) {
		return member.property?.type === 'Literal' ? member.property.value : null;
	}
	return member?.property?.name ?? null;
}

function directGet(node) {
	return (
		node?.type === 'CallExpression' &&
		node.arguments?.length === 0 &&
		(node.callee?.type === 'MemberExpression' ||
			node.callee?.type === 'OptionalMemberExpression') &&
		propertyName(node.callee) === 'get'
	);
}

function directSignal(node) {
	while (
		node &&
		(node.type === 'TSAsExpression' ||
			node.type === 'TSTypeAssertion' ||
			node.type === 'TSNonNullExpression')
	) {
		node = node.expression;
	}
	if (node?.type === 'Identifier') return node.name.endsWith('$');
	if (node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression') {
		const name = propertyName(node);
		return typeof name === 'string' && name.endsWith('$');
	}
	return false;
}

function collectNames(root) {
	const names = new Set();
	const seen = new WeakSet();
	const visit = (node) => {
		if (node === null || typeof node !== 'object' || seen.has(node)) return;
		seen.add(node);
		if (Array.isArray(node)) {
			for (const child of node) visit(child);
			return;
		}
		if (node.type === 'Identifier') names.add(node.name);
		for (const key in node) if (!METADATA.has(key)) visit(node[key]);
	};
	visit(root);
	return names;
}

function allocate(names, preferred) {
	let name = preferred;
	let suffix = 0;
	while (names.has(name)) name = `${preferred}$${++suffix}`;
	names.add(name);
	return name;
}

function simpleHelper(node) {
	const fn =
		node?.type === 'FunctionDeclaration' ||
		node?.type === 'FunctionExpression' ||
		node?.type === 'ArrowFunctionExpression'
			? node
			: null;
	if (fn === null || fn.async || fn.generator) return null;
	let expression = fn.body;
	if (expression?.type === 'BlockStatement') {
		if (expression.body?.length !== 1 || expression.body[0].type !== 'ReturnStatement') return null;
		expression = expression.body[0].argument;
	}
	if (!directGet(expression)) return null;
	const handle = expression.callee.object;
	if (handle.type === 'Identifier') {
		const parameter = (fn.params ?? []).findIndex(
			(param) => param.type === 'Identifier' && param.name === handle.name,
		);
		if (parameter !== -1) return { parameter, handle: null, params: fn.params ?? [] };
	}
	return directSignal(handle) ? { parameter: -1, handle, params: fn.params ?? [] } : null;
}

function recordHelpers(statements, helpers) {
	for (const statement of statements ?? []) {
		if (statement.type === 'FunctionDeclaration' && statement.id?.name) {
			helpers.set(statement.id.name, simpleHelper(statement));
		}
		if (statement.type === 'VariableDeclaration') {
			for (const declaration of statement.declarations ?? []) {
				if (declaration.id?.type === 'Identifier') {
					helpers.set(declaration.id.name, simpleHelper(declaration.init));
				}
			}
		}
	}
	return helpers;
}

function collectHelpers(ast) {
	const helpers = new Map();
	recordHelpers(ast.body, helpers);
	return helpers;
}

function attemptReader(callback, names) {
	const parameters = callback.params ?? [];
	if (parameters.length === 0) {
		const name = allocate(names, '_$signalContext');
		return {
			callback: { ...callback, params: [inheritHookMemoOrigin(b.id(name), callback)] },
			reader: b.member(b.id(name), 'read'),
		};
	}
	const first = parameters[0];
	if (first.type === 'Identifier') {
		return { callback, reader: b.member(b.id(first.name), 'read') };
	}
	if (first.type === 'ObjectPattern') {
		for (const property of first.properties ?? []) {
			if (property.type === 'RestElement') continue;
			const key = property.key?.name ?? property.key?.value;
			if (key !== 'read') continue;
			const value = property.value;
			if (value?.type === 'Identifier') return { callback, reader: b.id(value.name) };
		}
		const name = allocate(names, '_$signalRead');
		const property = inheritHookMemoOrigin(
			b.prop('init', b.id('read'), b.id(name), false, false),
			first,
		);
		const properties = [...(first.properties ?? [])];
		const rest = properties.findIndex((item) => item.type === 'RestElement');
		if (rest === -1) properties.push(property);
		else properties.splice(rest, 0, property);
		return {
			callback: {
				...callback,
				params: [{ ...first, properties }, ...parameters.slice(1)],
			},
			reader: b.id(name),
		};
	}
	return null;
}

function importedNames(ast) {
	const names = new Set();
	for (const statement of ast.body ?? []) {
		if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.importKind !== 'type' && specifier.local?.name) names.add(specifier.local.name);
		}
	}
	return names;
}

function transformAttempt(callback, reader, helpers, imports) {
	let changed = false;
	const passesReader = (argument) => {
		if (reader.type === 'Identifier') {
			return argument?.type === 'Identifier' && argument.name === reader.name;
		}
		return (
			argument?.type === 'MemberExpression' &&
			argument.computed === reader.computed &&
			argument.object?.type === 'Identifier' &&
			reader.object?.type === 'Identifier' &&
			argument.object.name === reader.object.name &&
			propertyName(argument) === propertyName(reader)
		);
	};
	const failOpaque = (call) => {
		const callee = call.callee?.type === 'Identifier' ? call.callee.name : null;
		if (
			callee &&
			(imports.has(callee) || (helpers.has(callee) && helpers.get(callee) === null)) &&
			(call.arguments ?? []).some(directSignal) &&
			!(call.arguments ?? []).some(passesReader)
		) {
			throw new Error(
				`Post-await signal read through opaque helper \`${callee}\` cannot be proven attempt-bound. ` +
					'Pass the derived context `read` function explicitly, or move the direct `.get()` into the compiled callback.',
			);
		}
	};
	const awaitedRead = (handle, origin) => {
		changed = true;
		return inheritHookMemoOrigin(b.await(b.call(reader, handle)), origin);
	};

	function expression(node, deferred) {
		if (node === null || typeof node !== 'object') return { node, deferred };
		if (deferred && directGet(node) && directSignal(node.callee.object)) {
			return { node: awaitedRead(node.callee.object, node), deferred: true };
		}
		if (node.type === 'AwaitExpression') {
			const argument = expression(node.argument, deferred);
			return {
				node: argument.node === node.argument ? node : { ...node, argument: argument.node },
				deferred: true,
			};
		}
		if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
			return { node, deferred };
		}
		if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
			if (deferred && node.callee?.type === 'Identifier') {
				const helper = helpers.get(node.callee.name);
				if (helper) {
					const handle =
						helper.parameter === -1 ? helper.handle : node.arguments?.[helper.parameter];
					if (directSignal(handle)) {
						// Substituting a helper must not discard argument evaluation or
						// parameter initialization. Only these two signatures prove that.
						if (
							!node.optional &&
							node.arguments.length === helper.params.length &&
							((helper.parameter === -1 && helper.params.length === 0) ||
								(helper.parameter === 0 && helper.params.length === 1))
						)
							return { node: awaitedRead(handle, node), deferred: true };
						throw new Error(
							`Post-await signal helper \`${node.callee.name}\` cannot be proven safe to inline. ` +
								'Pass the derived context `read` function explicitly.',
						);
					}
				}
				failOpaque(node);
			}
			let phase = deferred;
			const callee = expression(node.callee, phase);
			phase = callee.deferred;
			let argsChanged = false;
			const args = (node.arguments ?? []).map((argument) => {
				const mapped = expression(argument, phase);
				phase = mapped.deferred;
				if (mapped.node !== argument) argsChanged = true;
				return mapped.node;
			});
			return {
				node:
					callee.node === node.callee && !argsChanged
						? node
						: { ...node, callee: callee.node, arguments: args },
				deferred: phase,
			};
		}
		if (node.type === 'ConditionalExpression') {
			const test = expression(node.test, deferred);
			const consequent = expression(node.consequent, test.deferred);
			const alternate = expression(node.alternate, test.deferred);
			return {
				node:
					test.node === node.test &&
					consequent.node === node.consequent &&
					alternate.node === node.alternate
						? node
						: {
								...node,
								test: test.node,
								consequent: consequent.node,
								alternate: alternate.node,
							},
				deferred: consequent.deferred || alternate.deferred,
			};
		}
		let phase = deferred;
		let output = null;
		for (const key in node) {
			if (METADATA.has(key) || key === 'type') continue;
			const value = node[key];
			if (value === null || typeof value !== 'object') continue;
			if (Array.isArray(value)) {
				let array = null;
				for (let index = 0; index < value.length; index++) {
					const mapped = expression(value[index], phase);
					phase = mapped.deferred;
					if (array === null && mapped.node !== value[index]) array = value.slice(0, index);
					if (array !== null) array.push(mapped.node);
				}
				if (array !== null) {
					output ??= { ...node };
					output[key] = array;
				}
			} else {
				const mapped = expression(value, phase);
				phase = mapped.deferred;
				if (mapped.node !== value) {
					output ??= { ...node };
					output[key] = mapped.node;
				}
			}
		}
		return { node: output ?? node, deferred: phase };
	}

	function statementList(body, deferred) {
		let phase = deferred;
		let output = null;
		for (let index = 0; index < body.length; index++) {
			const current = body[index];
			let mapped;
			if (current.type === 'IfStatement') {
				const test = expression(current.test, phase);
				const consequent = statement(current.consequent, test.deferred);
				const alternate = current.alternate
					? statement(current.alternate, test.deferred)
					: { node: null, deferred: test.deferred };
				mapped = {
					node:
						test.node === current.test &&
						consequent.node === current.consequent &&
						alternate.node === current.alternate
							? current
							: {
									...current,
									test: test.node,
									consequent: consequent.node,
									alternate: alternate.node,
								},
					deferred: consequent.deferred || alternate.deferred,
				};
			} else {
				mapped = statement(current, phase);
			}
			phase = mapped.deferred;
			if (output === null && mapped.node !== current) output = body.slice(0, index);
			if (output !== null) output.push(mapped.node);
		}
		return { body: output ?? body, deferred: phase };
	}

	function statement(node, deferred) {
		if (node?.type === 'BlockStatement') {
			const mapped = statementList(node.body ?? [], deferred);
			return {
				node: mapped.body === node.body ? node : { ...node, body: mapped.body },
				deferred: mapped.deferred,
			};
		}
		if (node?.type === 'FunctionDeclaration') return { node, deferred };
		const mapped = expression(node, deferred);
		return mapped;
	}

	const body = callback.body;
	if (body.type !== 'BlockStatement') {
		const transformed = expression(body, false);
		return changed ? { ...callback, body: transformed.node } : null;
	}
	const transformed = statementList(body.body ?? [], false);
	return changed ? { ...callback, body: { ...body, body: transformed.body } } : null;
}

/** Lower post-await reads only inside trusted owner-facade derived callbacks. */
export function lowerSignalAttemptReads(ast) {
	const lexical = createLexicalAnalysis(ast);
	const derivedImports = new Map();
	const signalNamespaces = new Map();
	for (const statement of ast.body ?? []) {
		if (
			statement.type !== 'ImportDeclaration' ||
			statement.importKind === 'type' ||
			!SIGNAL_MODULES.has(statement.source?.value)
		) {
			continue;
		}
		for (const specifier of statement.specifiers ?? []) {
			if (specifier.type === 'ImportNamespaceSpecifier') {
				signalNamespaces.set(specifier.local.name, statement.source.value);
				continue;
			}
			if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') continue;
			const imported = specifier.imported?.name ?? specifier.imported?.value;
			if (imported === 'derived$') derivedImports.set(specifier.local.name, statement.source.value);
		}
	}
	if (derivedImports.size === 0 && signalNamespaces.size === 0) return ast;
	const names = collectNames(ast);
	const helpers = collectHelpers(ast);
	const imports = importedNames(ast);
	let changed = false;

	function visit(node) {
		if (node === null || typeof node !== 'object') return node;
		if (Array.isArray(node)) {
			let output = null;
			for (let index = 0; index < node.length; index++) {
				const mapped = visit(node[index]);
				if (output === null && mapped !== node[index]) output = node.slice(0, index);
				if (output !== null) output.push(mapped);
			}
			return output ?? node;
		}
		if (node.type === 'CallExpression') {
			const callee = node.callee;
			const named = callee?.type === 'Identifier' ? callee.name : null;
			const namespace =
				(callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') &&
				callee.object?.type === 'Identifier' &&
				propertyName(callee) === 'derived$'
					? callee.object.name
					: null;
			const source = named === null ? signalNamespaces.get(namespace) : derivedImports.get(named);
			const bindingName = named ?? namespace;
			const scope = lexical.nodeScopes.get(callee) ?? lexical.rootScope;
			const binding = bindingName === null ? undefined : lexical.resolveBinding(scope, bindingName);
			const callbackIndex =
				node.arguments?.[0]?.type === 'ArrowFunctionExpression' ||
				node.arguments?.[0]?.type === 'FunctionExpression'
					? 0
					: 1;
			const callback = node.arguments?.[callbackIndex];
			if (
				source !== undefined &&
				binding?.scope === lexical.rootScope &&
				binding.importSource?.value === source &&
				callback?.async === true &&
				(callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')
			) {
				const attempt = attemptReader(callback, names);
				if (attempt !== null) {
					const localHelpers = recordHelpers(
						callback.body?.type === 'BlockStatement' ? callback.body.body : [],
						new Map(helpers),
					);
					const transformed = transformAttempt(
						attempt.callback,
						attempt.reader,
						localHelpers,
						imports,
					);
					if (transformed !== null) {
						changed = true;
						return {
							...node,
							arguments: node.arguments.map((argument, index) =>
								index === callbackIndex ? transformed : visit(argument),
							),
						};
					}
				}
			}
		}
		let output = null;
		for (const key in node) {
			if (METADATA.has(key)) continue;
			const value = node[key];
			if (value === null || typeof value !== 'object') continue;
			const mapped = visit(value);
			if (mapped !== value) {
				output ??= { ...node };
				output[key] = mapped;
			}
		}
		return output ?? node;
	}

	const output = visit(ast);
	return changed ? output : ast;
}
